import { env } from "./env";
import { HttpError } from "./http";
import { decodeUtf8Strict, safeFetchBytes } from "./safeFetch";

export const MAX_TOTAL_BYTES = 200 * 1024; // whole snapshot
const MAX_FILE_BYTES = 50 * 1024; // any single file
const MAX_OTHER_FILES = 30; // on top of the README
const DOWNLOAD_CONCURRENCY = 6;

export type GithubTarget =
  | { kind: "repo"; owner: string; repo: string; ref: string }
  | { kind: "file"; rawUrl: string };

const NAME_RE = /^[A-Za-z0-9_.-]+$/;

/**
 * Returns null if the URL is not on github.com.
 * Supported: /owner/repo, /owner/repo/tree/<branch>, /owner/repo/blob/<branch>/<path>
 */
export function parseGithubUrl(url: URL): GithubTarget | null {
  const host = url.hostname.toLowerCase();
  if (host !== "github.com" && host !== "www.github.com") return null;

  const seg = url.pathname.split("/").filter(Boolean);
  const owner = seg[0];
  const repo = seg[1]?.replace(/\.git$/i, "");
  const unsupported = () =>
    new HttpError(
      400,
      "UNSUPPORTED_GITHUB_URL",
      "Use a repo URL (github.com/owner/repo), a branch URL (.../tree/<branch>) or a file URL (.../blob/<branch>/<path>)"
    );

  if (!owner || !repo || !NAME_RE.test(owner) || !NAME_RE.test(repo)) throw unsupported();

  if (seg.length === 2) return { kind: "repo", owner, repo, ref: "HEAD" };

  if (seg[2] === "tree" && seg.length === 4) {
    return { kind: "repo", owner, repo, ref: decodeURIComponent(seg[3]) };
  }

  if (seg[2] === "blob" && seg.length >= 5) {
    const ref = seg[3];
    const path = seg.slice(4).join("/");
    return {
      kind: "file",
      rawUrl: `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`,
    };
  }

  throw unsupported();
}

const TEXT_EXT = new Set([
  ".md", ".txt", ".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".json", ".html",
  ".css", ".scss", ".py", ".rs", ".toml", ".yaml", ".yml", ".go", ".java", ".kt",
  ".c", ".h", ".cpp", ".rb", ".php", ".sh", ".sql", ".vue", ".svelte", ".sol", ".xml",
]);
const TEXT_NAMES = new Set(["Dockerfile", "Makefile"]);
const SKIP_DIRS = /(^|\/)(node_modules|dist|build|target|\.git|\.next|vendor|coverage|__pycache__)\//;
const SKIP_FILES = /(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|\.min\.(js|css)|\.map)$/;

export function isCandidateFile(path: string, size: number): boolean {
  if (size === 0 || size > MAX_FILE_BYTES) return false;
  if (SKIP_DIRS.test(path) || SKIP_FILES.test(path)) return false;
  const name = path.split("/").pop() ?? "";
  if (TEXT_NAMES.has(name)) return true;
  const dot = name.lastIndexOf(".");
  return dot > 0 && TEXT_EXT.has(name.slice(dot).toLowerCase());
}

const ghHeaders = (): Record<string, string> => ({
  Accept: "application/vnd.github+json",
  "User-Agent": "proofpay-backend",
  "X-GitHub-Api-Version": "2022-11-28",
  ...(env.GITHUB_TOKEN ? { Authorization: `Bearer ${env.GITHUB_TOKEN}` } : {}),
});

async function ghJson<T>(url: string): Promise<T> {
  const res = await safeFetchBytes(url, {
    maxBytes: 5 * 1024 * 1024, // big repo trees can be a few MB of JSON
    headers: ghHeaders(),
    allowHttpErrors: true,
  });
  if (res.status === 404) {
    throw new HttpError(422, "GITHUB_NOT_FOUND", "Repository or branch not found (is it public?)");
  }
  if (res.status === 403 || res.status === 429) {
    throw new HttpError(
      429,
      "GITHUB_RATE_LIMITED",
      "GitHub rate limit reached. Try again later or set GITHUB_TOKEN on the backend"
    );
  }
  if (res.status < 200 || res.status >= 300) {
    throw new HttpError(502, "FETCH_FAILED", `GitHub responded with HTTP ${res.status}`);
  }
  return JSON.parse(res.body.toString("utf8")) as T;
}

type TreeEntry = { path: string; type: string; size?: number };

export type RepoBundle = {
  content: Buffer;
  contentType: "github_bundle";
  files: string[];
};

/**
 * Snapshot a public repo at one exact commit:
 * README first, then up to 30 text files (smallest first), 200 KB total.
 */
export async function fetchGithubRepo(target: {
  owner: string;
  repo: string;
  ref: string;
}): Promise<RepoBundle> {
  const { owner, repo, ref } = target;
  const api = `https://api.github.com/repos/${owner}/${repo}`;

  const commit = await ghJson<{ sha: string }>(`${api}/commits/${encodeURIComponent(ref)}`);
  const tree = await ghJson<{ tree: TreeEntry[] }>(`${api}/git/trees/${commit.sha}?recursive=1`);

  const blobs = tree.tree.filter(
    (e): e is TreeEntry & { size: number } => e.type === "blob" && typeof e.size === "number"
  );

  const readme = blobs
    .filter((e) => !e.path.includes("/") && /^readme/i.test(e.path) && e.size > 0 && e.size <= MAX_FILE_BYTES)
    .sort((a, b) => a.size - b.size)[0];

  const others = blobs
    .filter((e) => e !== readme && isCandidateFile(e.path, e.size))
    .sort((a, b) => a.size - b.size);

  const cost = (e: { path: string; size: number }) =>
    Buffer.byteLength(`\n=== FILE: ${e.path} ===\n\n`) + e.size;

  const selected: { path: string; size: number }[] = [];
  let used = 200; // room for the repo header line
  if (readme && used + cost(readme) <= MAX_TOTAL_BYTES) {
    selected.push(readme);
    used += cost(readme);
  }
  let count = 0;
  for (const e of others) {
    if (count >= MAX_OTHER_FILES || used + cost(e) > MAX_TOTAL_BYTES) break; // sorted ascending
    selected.push(e);
    used += cost(e);
    count++;
  }

  // Download from raw.githubusercontent.com at the pinned commit (doesn't use the API quota).
  const encodePath = (p: string) => p.split("/").map(encodeURIComponent).join("/");
  const texts = new Map<string, string>();
  for (let i = 0; i < selected.length; i += DOWNLOAD_CONCURRENCY) {
    const batch = selected.slice(i, i + DOWNLOAD_CONCURRENCY);
    await Promise.all(
      batch.map(async (f) => {
        try {
          const res = await safeFetchBytes(
            `https://raw.githubusercontent.com/${owner}/${repo}/${commit.sha}/${encodePath(f.path)}`,
            { maxBytes: MAX_FILE_BYTES }
          );
          texts.set(f.path, decodeUtf8Strict(res.body));
        } catch {
          // skip files that fail to download or are not valid text
        }
      })
    );
  }

  const included = selected.filter((f) => texts.has(f.path));
  if (included.length === 0) {
    throw new HttpError(422, "EMPTY_DELIVERABLE", "No readable text files were found in the repository");
  }

  const parts = [`=== REPO: ${owner}/${repo} @ ${commit.sha.slice(0, 7)} ===\n`];
  for (const f of included) parts.push(`\n=== FILE: ${f.path} ===\n${texts.get(f.path)}\n`);

  return {
    content: Buffer.from(parts.join(""), "utf8"),
    contentType: "github_bundle",
    files: included.map((f) => f.path),
  };
} 