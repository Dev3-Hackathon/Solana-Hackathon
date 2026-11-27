import { Verdict, VerdictOutcome } from "./ai";

export const VERDICT_CODES: Record<VerdictOutcome, number> = {
  pass: 1,
  fail: 2,
  inconclusive: 3,
};

/**
 * Enforces Decision D9:
 * - On-chain verdict is "pass" ONLY if report.verdict === "pass" && report.score >= 70 && every criterion has met === true.
 * - If report.verdict === "inconclusive", keep "inconclusive" (which moves the job straight to Disputed on-chain).
 * - Otherwise, downgrade to "fail".
 */
export function resolveOnChainVerdict(report: Verdict): VerdictOutcome {
  if (report.verdict === "inconclusive") {
    return "inconclusive";
  }

  const allCriteriaMet =
    report.criteria.length > 0 && report.criteria.every((c) => c.met === true);

  if (report.verdict === "pass" && report.score >= 70 && allCriteriaMet) {
    return "pass";
  }

  return "fail";
}

/** Builds a schema-valid inconclusive report when the AI returns unparseable/invalid output. */
export function buildMalformedFallbackReport(criteria: string[], reason: string): Verdict {
  return {
    verdict: "inconclusive",
    score: 0,
    criteria: criteria.map((criterion) => ({
      criterion,
      met: null,
      evidence: "",
      confidence: 0,
    })),
    summary: `Automated evaluation could not produce a valid report: ${reason}`,
    risks: ["model_output_invalid"],
    model: null,
    evaluatedAt: new Date().toISOString(),
  };
}

/** Detects Anchor InvalidStatus errors when a job transitions out of Submitted mid-flight. */
export function isInvalidStatusAnchorError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("InvalidStatus") ||
    msg.includes("Error Code: InvalidStatus") ||
    msg.includes("0x1770")
  );
}