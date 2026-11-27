import { HttpError } from "./http";
import { fetchGithubRepo, MAX_TOTAL_BYTES, parseGithubUrl } from "./github";
import { decodeUtf8Strict, safeFetchBytes } from "./safeFetch";

export type Fetched = {
  content: Buffer; // the exact bytes we store and hash
  contentType: "text" | "html" | "github_bundle";
  files?: string[];
};

/** Fetch a deliverable URL and return a snapshot ready to store. */
export async function fetchDeliverable(rawUrl: string): Promise<Fetched> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new HttpError(400, "INVALID_URL", "That is not a valid URL");
  }

  const gh = parseGithubUrl(url);
  if (gh?.kind === "repo") return fetchGithubRepo(gh);

  const target = gh?.kind === "file" ? gh.rawUrl : url.toString();
  const res = await safeFetchBytes(target, { maxBytes: MAX_TOTAL_BYTES });

  const text = decodeUtf8Strict(res.body);
  if (text.trim().length === 0) {
    throw new HttpError(422, "EMPTY_DELIVERABLE", "The URL returned no content");
  }

  const isHtml =
    /text\/html/i.test(res.contentType) || /^\s*(<!doctype html|<html)/i.test(text);

  return { content: res.body, contentType: isHtml ? "html" : "text" };
}