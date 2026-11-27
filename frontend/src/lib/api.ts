import { Verdict } from "../types";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

export interface JobReportResult {
  success: boolean;
  isTimeout: boolean;
  message?: string;
  data: Verdict | null;
}

export interface HealthResponse {
  status: string;
  arbiterBalanceSol?: number;
}

export interface SpecResponse {
  specId?: string;
  specHash: number[] | string;
}

export interface LinkSpecResponse {
  verified: boolean;
}

/**
 * Y22: Fetches the AI verdict report for a job PDA.
 * Gracefully handles 404 REPORT_NOT_FOUND when a job was disputed after review timeout.
 */
export async function fetchJobReport(jobPda: string): Promise<JobReportResult> {
  const res = await fetch(`${BACKEND_URL}/api/reports/${jobPda}`, {
    cache: "no-store",
  });

  if (res.status === 404) {
    const errorData = await res.json().catch(() => ({}));
    if (errorData.code === "REPORT_NOT_FOUND") {
      return {
        success: false,
        isTimeout: true,
        message: "No AI verdict was posted (review timed out).",
        data: null,
      };
    }
  }

  if (!res.ok) {
    throw new Error(`Failed to fetch job report (${res.status})`);
  }

  const data = (await res.json()) as Verdict;
  return {
    success: true,
    isTimeout: false,
    data,
  };
}

/**
 * B18: Checks backend health and arbiter relayer SOL balance.
 */
export async function fetchBackendHealth(): Promise<HealthResponse | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/health`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as HealthResponse;
  } catch {
    return null;
  }
}

/**
 * Step 1 of Create Job: Upload written spec to backend and receive canonical specHash.
 */
export async function postJobSpec(payload: {
  title: string;
  description: string;
  criteria?: string[];
}): Promise<SpecResponse> {
  const res = await fetch(`${BACKEND_URL}/api/specs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to upload spec (${res.status})`);
  }

  return (await res.json()) as SpecResponse;
}

/**
 * Step 3 of Create Job: Link uploaded spec to the confirmed on-chain jobPda.
 * Expects { verified: true }; surfaces 404 (job not found) or 409 (specHash mismatch).
 */
export async function linkJobSpec(
  jobPda: string,
  specPayload: { specId?: string; specHash: number[] | string }
): Promise<LinkSpecResponse> {
  const res = await fetch(`${BACKEND_URL}/api/jobs/${jobPda}/link-spec`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(specPayload),
  });

  const data = await res.json().catch(() => ({}));

  if (res.status === 404) {
    throw new Error("Job PDA not found on-chain yet (404). Wait a moment and retry.");
  }
  if (res.status === 409) {
    throw new Error("Spec hash mismatch (409): spec does not match on-chain job.specHash.");
  }
  if (!res.ok || !data.verified) {
    throw new Error(data.error || "Spec verification failed.");
  }

  return { verified: true };
}

/**
 * Triggers or retries AI evaluation for a Submitted job (B14 / B15).
 */
export async function triggerJobEvaluation(jobPda: string): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/api/jobs/${jobPda}/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  if (res.status === 409) {
    const err = await res.json().catch(() => ({}));
    if (err.code === "EVALUATION_IN_PROGRESS") {
      throw new Error("AI evaluation is already running for this job.");
    }
    throw new Error(err.error || "Job is no longer in Submitted status.");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Evaluation request failed (${res.status})`);
  }
}

export interface PriceEstimateResponse {
  recommendedSol: number;
  minSol: number;
  maxSol: number;
  rationale: string;
}

export async function estimateJobPrice(payload: {
  title: string;
  description: string;
}): Promise<PriceEstimateResponse> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/specs/estimate-price`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      return (await res.json()) as PriceEstimateResponse;
    }
  } catch {
    // Fallback to local scope heuristic when backend route is unavailable
  }

  const text = `${payload.title} ${payload.description}`.toLowerCase();
  let baseSol = 1.0;

  if (/(audit|security|smart contract|anchor|token-2022|zk|rust)/.test(text)) baseSol += 1.5;
  if (/(indexer|backend|api|database|postgres|webhook|pipeline)/.test(text)) baseSol += 0.8;
  if (/(frontend|ui|dashboard|next\.js|react|wallet)/.test(text)) baseSol += 0.6;
  if (/(test|unit test|integration|ci|deploy)/.test(text)) baseSol += 0.4;

  const wordBonus = Math.min(1.0, Math.floor(text.split(/\s+/).length / 25) * 0.25);
  const recommendedSol = Number((baseSol + wordBonus).toFixed(2));
  const minSol = Number(Math.max(0.2, recommendedSol * 0.7).toFixed(2));
  const maxSol = Number((recommendedSol * 1.4).toFixed(2));

  return {
    recommendedSol,
    minSol,
    maxSol,
    rationale: "Estimated from technical scope, stack complexity, and deliverables.",
  };
}