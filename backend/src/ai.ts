import { z } from "zod";
import { env } from "./env";

export type DeliverableContentType = "text" | "html" | "github_bundle";

export interface DeliverableInput {
  source_url: string;
  content: string;
  content_type: DeliverableContentType;
}

export interface EvaluateRequest {
  job_title: string;
  description: string;
  criteria: string[];
  deliverable: DeliverableInput;
}

export interface CriterionResult {
  criterion: string;
  met: boolean | null;
  evidence: string;
  confidence: number;
}

export type VerdictOutcome = "pass" | "fail" | "inconclusive";

export interface Verdict {
  verdict: VerdictOutcome;
  score: number;
  criteria: CriterionResult[];
  summary: string;
  risks: string[];
  model?: string | null;
  evaluatedAt?: string | null;
}

const criterionResultSchema = z.object({
  criterion: z.string(),
  met: z.boolean().nullable(),
  evidence: z.string(),
  confidence: z.number().min(0).max(1),
});

const verdictSchema = z.object({
  verdict: z.enum(["pass", "fail", "inconclusive"]),
  score: z.number().int().min(0).max(100),
  criteria: z.array(criterionResultSchema),
  summary: z.string(),
  risks: z.array(z.string()),
  model: z.string().nullable().optional(),
  evaluatedAt: z.string().nullable().optional(),
});

/** HTTP 422 from ai-service: request payload failed schema validation (caller bug, do not retry). */
export class AiServiceValidationError extends Error {
  readonly status = 422;
  readonly body: unknown;

  constructor(body: unknown) {
    super("AI service rejected evaluation request (422 Unprocessable Entity)");
    this.name = "AiServiceValidationError";
    this.body = body;
  }
}

/** HTTP 502 from ai-service: upstream LLM providers exhausted internal retries (do not double-retry). */
export class AiServiceUnavailableError extends Error {
  readonly status = 502;
  readonly body: unknown;

  constructor(body: unknown) {
    super("AI service upstream providers unavailable (502 Bad Gateway)");
    this.name = "AiServiceUnavailableError";
    this.body = body;
  }
}

/** Network failure or request exceeded client timeout. */
export class AiServiceTimeoutError extends Error {
  readonly cause?: unknown;

  constructor(message = "AI service request timed out or failed due to network error", cause?: unknown) {
    super(message);
    this.name = "AiServiceTimeoutError";
    this.cause = cause;
  }
}

/** HTTP 200 with malformed JSON/schema, or unexpected non-200 status. */
export class AiServiceResponseError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = "AiServiceResponseError";
    this.status = status;
    this.body = body;
  }
}

export interface EvaluateOptions {
  baseUrl?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 60_000;

async function safeParseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Calls the FastAPI AI arbiter's `POST /evaluate` endpoint and validates the returned Verdict shape.
 * Does not retry on 502 because `ai-service` already handles provider fallback internally.
 */
export async function evaluateDeliverable(
  input: EvaluateRequest,
  options: EvaluateOptions = {}
): Promise<Verdict> {
  const baseUrl = (options.baseUrl ?? env.AI_SERVICE_URL).replace(/\/+$/, "");
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchFn = options.fetchFn ?? globalThis.fetch;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetchFn(`${baseUrl}/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
  } catch (err) {
    const isAbort = err instanceof Error && err.name === "AbortError";
    throw new AiServiceTimeoutError(
      isAbort
        ? `AI service request timed out after ${timeoutMs}ms`
        : "AI service network request failed",
      err
    );
  } finally {
    clearTimeout(timer);
  }

  const body = await safeParseJson(res);

  if (res.status === 422) {
    throw new AiServiceValidationError(body);
  }

  if (res.status === 502) {
    throw new AiServiceUnavailableError(body);
  }

  if (!res.ok) {
    throw new AiServiceResponseError(
      res.status,
      `AI service returned unexpected HTTP ${res.status}`,
      body
    );
  }

  const parsed = verdictSchema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "root"}: ${i.message}`)
      .join("; ");
    throw new AiServiceResponseError(
      res.status,
      `AI service returned malformed Verdict payload: ${issues}`,
      body
    );
  }

  // Defense in depth: the AI service should echo the criteria 1:1 (INTERFACE.md section 5.1).
  const sent = [...input.criteria].sort();
  const got = parsed.data.criteria.map((c) => c.criterion).sort();
  if (got.length !== sent.length || got.some((c, i) => c !== sent[i])) {
    throw new AiServiceResponseError(
      res.status,
      "AI service returned criteria that do not match the request (count or text differs)",
      body
    );
  }

  return parsed.data;

}