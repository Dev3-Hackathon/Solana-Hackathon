"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useJobs } from "../../../context/JobContext";
import { useSession } from "../../../context/SessionContext";
import { fetchJobReport, triggerJobEvaluation } from "../../../lib/api";
import { Verdict } from "../../../types";

const REVIEW_TIMEOUT_SECS = Number(process.env.NEXT_PUBLIC_REVIEW_TIMEOUT_SECS ?? 300);
const FALLBACK_SOL_USD = 150;

function JobDetailContent() {
  const params = useParams<{ pda: string }>();
  const pda = params?.pda ?? "";

  const {
    isLoaded,
    getJobByPda,
    submitWork,
    recordVerdict,
    approveJob,
    disputeJob,
    resolveDispute,
  } = useJobs();
  const { role, loginAsDemo } = useSession();

  const [deliverableUri, setDeliverableUri] = useState("");
  const [disputeReason, setDisputeReason] = useState("");
  const [clientBps, setClientBps] = useState<number>(5000);

  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evalError, setEvalError] = useState<{
    message: string;
    isTimeout404?: boolean;
  } | null>(null);

  const [nowSecs, setNowSecs] = useState(() => Math.floor(Date.now() / 1000));
  const [solUsdRate, setSolUsdRate] = useState<number>(FALLBACK_SOL_USD);

  useEffect(() => {
    const timer = setInterval(() => {
      setNowSecs(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const price = data?.solana?.usd;
        if (active && typeof price === "number" && price > 0) {
          setSolUsdRate(price);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  if (!isLoaded) {
    return <div className="text-sm text-slate-500">Loading contract details...</div>;
  }

  const record = getJobByPda(pda);
  if (!record) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center space-y-3">
        <p className="text-sm font-medium text-slate-700">Escrow PDA not found.</p>
        <Link href="/" className="text-xs font-semibold text-indigo-600 hover:underline">
          ← Back to Home
        </Link>
      </div>
    );
  }

  const { job, title, description, verdict, disputeReason: savedDisputeReason } = record;
  const amountSol = job.amount / 1_000_000_000;
  const amountUsd = amountSol * solUsdRate;

  const deadlineSecs = job.submittedAt > 0 ? job.submittedAt + REVIEW_TIMEOUT_SECS : 0;
  const secondsRemaining = deadlineSecs > 0 ? Math.max(0, deadlineSecs - nowSecs) : 0;
  const isOverdue = job.status === "Submitted" && deadlineSecs > 0 && nowSecs >= deadlineSecs;

  const handleSubmitWork = (e: React.FormEvent) => {
    e.preventDefault();
    if (!deliverableUri.trim()) return;
    submitWork(pda, deliverableUri.trim());
    setDeliverableUri("");
  };

  const handleRunAiEvaluation = async () => {
    if (isEvaluating) return;
    setIsEvaluating(true);
    setEvalError(null);

    try {
      await triggerJobEvaluation(pda);
      const report = await fetchJobReport(pda);

      if (report.isTimeout || !report.data) {
        setEvalError({
          message:
            report.message ||
            "Review window expired (404 REPORT_NOT_FOUND). Manual dispute resolution is now unlocked.",
          isTimeout404: true,
        });
        return;
      }

      recordVerdict(
        pda,
        report.data,
        report.data.verdict === "inconclusive" ? "Disputed" : "Submitted"
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "AI evaluation failed (502 Bad Gateway).";
      const isTimeout404 =
        message.includes("404") || message.includes("REPORT_NOT_FOUND");
      setEvalError({
        message: isTimeout404
          ? "Review window expired (404 REPORT_NOT_FOUND). Manual dispute resolution is now unlocked."
          : message,
        isTimeout404,
      });
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleSimulateOfflineVerdict = (outcome: "pass" | "fail" | "inconclusive") => {
    setEvalError(null);
    const mockVerdict: Verdict = {
      verdict: outcome,
      score: outcome === "pass" ? 94 : outcome === "fail" ? 32 : 48,
      summary:
        outcome === "pass"
          ? "All acceptance criteria verified successfully."
          : outcome === "fail"
          ? "Submitted deliverable misses required test coverage and latency thresholds."
          : "AI confidence below threshold — escalated to Admin arbitration.",
      criteria: [
        {
          criterion: description,
          met: outcome === "pass" ? true : outcome === "fail" ? false : null,
          evidence: `Simulated ${outcome.toUpperCase()} evaluation`,
          confidence: outcome === "inconclusive" ? 0.48 : 0.94,
        },
      ],
      risks: outcome === "pass" ? [] : ["Requires manual reviewer inspection"],
    };
    recordVerdict(pda, mockVerdict, outcome === "inconclusive" ? "Disputed" : "Submitted");
  };

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Quick Role Switcher for Testing */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={role === "seller" ? "/seller" : role === "admin" ? "/admin" : "/client"}
          className="text-xs font-semibold text-indigo-600 hover:underline"
        >
          ← Back to Portal
        </Link>

        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-slate-500">Preview as:</span>
          {(["client", "seller", "admin"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => loginAsDemo(r)}
              className={`rounded-md px-2.5 py-1 font-medium capitalize transition ${
                role === r
                  ? "bg-indigo-600 text-white"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Contract Header Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-slate-400">Job #{job.jobId}</span>
              <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                {job.status}
              </span>
              {isOverdue && (
                <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                  Review Timed Out · Dispute Unlocked
                </span>
              )}
            </div>
            <h1 className="text-xl font-bold text-slate-900">{title}</h1>
            <p className="text-sm text-slate-600">{description}</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
            <div className="text-xs font-medium text-slate-500">Escrow Locked</div>
            <div className="text-xl font-bold text-slate-900 tabular-nums">
              {amountSol.toFixed(2)} SOL
            </div>
            <div className="text-xs text-slate-500 tabular-nums">
              ≈ ${amountUsd.toFixed(2)} USD
            </div>
          </div>
        </div>

        {/* Addresses & Deliverable Metadata */}
        <div className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 text-xs sm:grid-cols-3">
          <div>
            <span className="block font-medium text-slate-500">Escrow PDA</span>
            <span className="font-mono text-slate-800">
              {pda.slice(0, 10)}...{pda.slice(-8)}
            </span>
          </div>
          <div>
            <span className="block font-medium text-slate-500">Client Wallet</span>
            <span className="font-mono text-slate-800">
              {job.client.slice(0, 8)}...{job.client.slice(-6)}
            </span>
          </div>
          <div>
            <span className="block font-medium text-slate-500">Seller Wallet</span>
            <span className="font-mono text-slate-800">
              {job.freelancer.slice(0, 8)}...{job.freelancer.slice(-6)}
            </span>
          </div>
        </div>

        {job.deliverableUri && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
            <span className="font-semibold text-slate-700">Submitted Deliverable: </span>
            <a
              href={job.deliverableUri}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-indigo-600 underline break-all"
            >
              {job.deliverableUri}
            </a>
            {job.status === "Submitted" && (
              <span className="ml-3 text-slate-500">
                {isOverdue
                  ? "(Review timeout elapsed)"
                  : `(Auto-timeout in ${secondsRemaining}s)`}
              </span>
            )}
          </div>
        )}
      </div>

      {/* 1. SELLER: Submit Deliverable (when status is Funded) */}
      {job.status === "Funded" && (
        <form
          onSubmit={handleSubmitWork}
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-3"
        >
          <h2 className="text-base font-semibold text-slate-900">
            Seller Action: Submit Deliverable
          </h2>
          <p className="text-xs text-slate-600">
            Provide a GitHub PR, commit URL, or deployment link for AI verification against the hashed spec.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="url"
              required
              placeholder="https://github.com/org/repo/pull/42"
              value={deliverableUri}
              onChange={(e) => setDeliverableUri(e.target.value)}
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Submit Work
            </button>
          </div>
        </form>
      )}

      {/* 2. AI ARBITRATION VERDICT & RETRYABLE EVALUATION */}
      {["Submitted", "VerdictProposed", "Disputed", "Released", "Refunded", "Resolved"].includes(
        job.status
      ) && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                AI Arbiter Evaluation
              </h2>
              <p className="text-xs text-slate-600">
                Arbiter relayer grades deliverable against canonical spec and posts verdict on-chain.
              </p>
            </div>

            {job.status === "Submitted" && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={isEvaluating}
                  onClick={handleRunAiEvaluation}
                  className="rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {isEvaluating
                    ? "Evaluating..."
                    : evalError
                    ? "Retry AI Evaluation"
                    : "Run AI Evaluation"}
                </button>
              </div>
            )}
          </div>

          {evalError && (
            <div
              className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-xs ${
                evalError.isTimeout404
                  ? "border-amber-300 bg-amber-50 text-amber-900"
                  : "border-red-200 bg-red-50 text-red-800"
              }`}
            >
              <span>{evalError.message}</span>
              {!evalError.isTimeout404 && (
                <button
                  type="button"
                  onClick={handleRunAiEvaluation}
                  className="rounded bg-red-700 px-2.5 py-1 font-semibold text-white hover:bg-red-800"
                >
                  Retry Now
                </button>
              )}
            </div>
          )}

          {job.status === "Submitted" && !verdict && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-xs">
              <span className="font-medium text-slate-600">Offline Demo Simulate:</span>
              <button
                type="button"
                onClick={() => handleSimulateOfflineVerdict("pass")}
                className="rounded bg-emerald-100 px-2.5 py-1 font-semibold text-emerald-800 hover:bg-emerald-200"
              >
                Pass Verdict
              </button>
              <button
                type="button"
                onClick={() => handleSimulateOfflineVerdict("fail")}
                className="rounded bg-red-100 px-2.5 py-1 font-semibold text-red-800 hover:bg-red-200"
              >
                Fail Verdict
              </button>
              <button
                type="button"
                onClick={() => handleSimulateOfflineVerdict("inconclusive")}
                className="rounded bg-amber-100 px-2.5 py-1 font-semibold text-amber-800 hover:bg-amber-200"
              >
                Inconclusive (Auto-Dispute)
              </button>
            </div>
          )}

          {verdict && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase ${
                    verdict.verdict === "pass"
                      ? "bg-emerald-100 text-emerald-800"
                      : verdict.verdict === "fail"
                      ? "bg-red-100 text-red-800"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  Verdict: {verdict.verdict}
                </span>
                <span className="text-xs font-medium text-slate-500 tabular-nums">
                  Score: {verdict.score}/100
                </span>
              </div>
              <p className="text-sm text-slate-800">{verdict.summary}</p>
            </div>
          )}
        </div>
      )}

      {/* 3. CLIENT ACTIONS: Approve & Release OR Raise Dispute */}
      {["Submitted", "VerdictProposed"].includes(job.status) && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-emerald-200 bg-white p-5 shadow-xs space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">
              Client Action: Approve &amp; Release Funds
            </h3>
            <p className="text-xs text-slate-600">
              Releases {amountSol.toFixed(2)} SOL (≈ ${amountUsd.toFixed(2)}) directly from the PDA vault to the Seller.
            </p>
            <button
              type="button"
              onClick={() => approveJob(pda)}
              className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Approve &amp; Release {amountSol.toFixed(2)} SOL
            </button>
          </div>

          <div className="rounded-xl border border-red-200 bg-white p-5 shadow-xs space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">
              Raise Escrow Dispute
            </h3>
            <p className="text-xs text-slate-600">
              {isOverdue || evalError?.isTimeout404 || verdict?.verdict === "fail"
                ? "Dispute window is unlocked. Escalate to Admin arbitration."
                : `Unlocks automatically if AI review fails or review times out (${secondsRemaining}s remaining).`}
            </p>
            <input
              type="text"
              placeholder="Reason for dispute (optional)"
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-red-500 focus:outline-none"
            />
            <button
              type="button"
              disabled={!isOverdue && !evalError?.isTimeout404 && verdict?.verdict !== "fail"}
              onClick={() => disputeJob(pda, disputeReason)}
              className="w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
            >
              Open Dispute
            </button>
          </div>
        </div>
      )}

      {/* 4. ADMIN RESOLUTION PANEL (when status is Disputed) */}
      {job.status === "Disputed" && (
        <div className="rounded-xl border border-amber-300 bg-amber-50/50 p-5 shadow-xs space-y-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Admin Arbitration: Resolve Disputed Escrow
            </h2>
            <p className="text-xs text-slate-600">
              {savedDisputeReason
                ? `Dispute Reason: "${savedDisputeReason}"`
                : "Select basis points (BPS) allocation between Client refund and Seller payout."}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              { label: "100% Refund Client", bps: 10000 },
              { label: "50% / 50% Split", bps: 5000 },
              { label: "100% Pay Seller", bps: 0 },
            ].map((preset) => (
              <button
                key={preset.bps}
                type="button"
                onClick={() => setClientBps(preset.bps)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                  clientBps === preset.bps
                    ? "border-indigo-600 bg-indigo-600 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white p-3 text-xs">
            <div>
              <span className="text-slate-500">Client Refund: </span>
              <strong className="text-slate-900 tabular-nums">
                {((amountSol * clientBps) / 10000).toFixed(2)} SOL ({(clientBps / 100).toFixed(0)}%)
              </strong>
            </div>
            <div>
              <span className="text-slate-500">Seller Payout: </span>
              <strong className="text-slate-900 tabular-nums">
                {((amountSol * (10000 - clientBps)) / 10000).toFixed(2)} SOL (
                {((10000 - clientBps) / 100).toFixed(0)}%)
              </strong>
            </div>
            <button
              type="button"
              onClick={() => resolveDispute(pda, clientBps)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
            >
              Execute On-Chain Split
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function JobDetailPage() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-500">Loading contract details...</div>}>
      <JobDetailContent />
    </Suspense>
  );
}