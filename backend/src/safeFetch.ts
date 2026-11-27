import dns from "node:dns/promises";
import net from "node:net";
import { HttpError } from "./http";

export const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;

/** True for loopback, private, link-local, CGNAT, multicast and other non-public addresses. */
export function isPrivateIp(ip: string): boolean {
  const family = net.isIP(ip);

  if (family === 4) {
    const [a, b, c] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
      (a === 169 && b === 254) || // link-local (cloud metadata lives here)
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224 // multicast + reserved
    );
  }

  if (family === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::" || lower === "::1") return true;
    if (lower.startsWith("::ffff:")) {
      const tail = lower.slice(7);
      // dotted form -> check the embedded IPv4; hex form -> reject to be safe
      return net.isIPv4(tail) ? isPrivateIp(tail) : true;
    }
    return /^(fc|fd|fe8|fe9|fea|feb)/.test(lower); // unique-local + link-local
  }

  return true; // not an IP at all: treat as unsafe
}

/** Throws unless the URL is plain http(s) pointing at a public host. */
export async function assertPublicUrl(url: URL): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new HttpError(400, "INVALID_URL", "Only http and https URLs are allowed");
  }
  if (url.username || url.password) {
    throw new HttpError(400, "INVALID_URL", "URLs with credentials are not allowed");
  }

  const privateError = () =>
    new HttpError(400, "URL_NOT_ALLOWED", "Private or local addresses are not allowed");
  const assertDefaultPort = () => {
    if (url.port && url.port !== "80" && url.port !== "443") {
      throw new HttpError(400, "URL_NOT_ALLOWED", "Only the default http/https ports are allowed");
    }
  };

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    throw privateError();
  }

  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw privateError();
    assertDefaultPort();
    return;
  }

  let addresses: { address: string }[];
  try {
    addresses = await dns.lookup(host, { all: true });
  } catch {
    throw new HttpError(422, "FETCH_FAILED", `Could not resolve host ${host}`);
  }
  if (addresses.length === 0 || addresses.some((a) => isPrivateIp(a.address))) {
    throw privateError();
  }
  assertDefaultPort();
}

/** Strict UTF-8 decode. Rejects binary content (images, PDFs, zips...). */
export function decodeUtf8Strict(buf: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    throw new HttpError(422, "NOT_TEXT", "The content is not valid UTF-8 text");
  }
}

export type SafeFetchResult = {
  url: string; // final URL after redirects
  status: number;
  contentType: string;
  body: Buffer;
};

type SafeFetchOptions = {
  maxBytes: number;
  headers?: Record<string, string>;
  /** Return non-2xx responses instead of throwing (used by the GitHub API client). */
  allowHttpErrors?: boolean;
};

/**
 * GET a URL with: public-host check on every hop, manual redirects (max 3),
 * a 10 s timeout and a hard cap on body size.
 */
export async function safeFetchBytes(
  rawUrl: string,
  opts: SafeFetchOptions
): Promise<SafeFetchResult> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new HttpError(400, "INVALID_URL", "That is not a valid URL");
  }
  const firstHost = url.hostname;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicUrl(url);

    // Never forward the Authorization header to a different host after a redirect.
    const headers = { ...(opts.headers ?? {}) };
    if (url.hostname !== firstHost) delete headers.Authorization;

    let res: Response;
    try {
      res = await fetch(url, {
        headers,
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (err) {
      throw mapFetchError(err);
    }

    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      await res.body?.cancel();
      try {
        url = new URL(res.headers.get("location")!, url);
      } catch {
        throw new HttpError(422, "FETCH_FAILED", "The server sent an invalid redirect");
      }
      continue;
    }

    if (!res.ok && !opts.allowHttpErrors) {
      await res.body?.cancel();
      throw new HttpError(422, "FETCH_FAILED", `The server responded with HTTP ${res.status}`);
    }

    const declared = Number(res.headers.get("content-length"));
    if (declared > opts.maxBytes) {
      await res.body?.cancel();
      throw tooLarge(opts.maxBytes);
    }

    const body = await readCapped(res, opts.maxBytes);
    return {
      url: url.toString(),
      status: res.status,
      contentType: res.headers.get("content-type") ?? "",
      body,
    };
  }

  throw new HttpError(422, "FETCH_FAILED", "Too many redirects");
}

async function readCapped(res: Response, maxBytes: number): Promise<Buffer> {
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) {
        await reader.cancel();
        throw tooLarge(maxBytes);
      }
      chunks.push(Buffer.from(value));
    }
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw mapFetchError(err);
  }
  return Buffer.concat(chunks);
}

function tooLarge(maxBytes: number): HttpError {
  return new HttpError(
    413,
    "DELIVERABLE_TOO_LARGE",
    `The content is larger than the ${Math.round(maxBytes / 1024)} KB limit`
  );
}

function mapFetchError(err: unknown): HttpError {
  const name = (err as { name?: string } | null)?.name;
  if (name === "TimeoutError" || name === "AbortError") {
    return new HttpError(504, "FETCH_TIMEOUT", "The remote server took too long to respond");
  }
  return new HttpError(502, "FETCH_FAILED", "Could not fetch the URL");
}