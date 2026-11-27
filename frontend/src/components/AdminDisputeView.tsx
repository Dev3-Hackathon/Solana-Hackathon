"use client";

import React, { useEffect, useState } from "react";
import { Job, Verdict } from "../types";
import { fetchJobReport } from "../lib/api";

interface AdminDisputeViewProps {
  jobPda: string;
  job: Job;
  fallbackVerdict?: Verdict | null;
  onRelease: () => void | Promise<void>;
  onRefund: () => void | Promise<void>;
}

export default function AdminDisputeView({
  jobPda,
  job,
  fallbackVerdict = null,
  onRelease,
  onRefund,
}: AdminDisputeViewProps) {
  const [verdict, setVerdict] = useState<Verdict | null>(fallbackVerdict);
  const [isTimeout, setIsTimeout] = useState<boolean>(!fallbackVerdict && job.verdict === 0);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    async function loadReport() {
      // Skip network fetch for local demo PDAs; use mock state directly
      if (jobPda.startsWith("JobPDA")) {
        setVerdict(fallbackVerdict);
        setIsTimeout(!fallbackVerdict && job.verdict === 0);
        return;
      }

      setLoading(true);
      try {
        const res = await fetchJobReport(jobPda);
        if (!active) return;
        if (res.isTimeout) {
          setIsTimeout(true);
          setVerdict(null);
        } else if (res.data) {
          setIsTimeout(false);
          setVerdict(res.data);
        }
      } catch {
        if (!active) return;
        setVerdict(fallbackVerdict);
        setIsTimeout(!fallbackVerdict);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadReport();
    return () => {
      active = false;
    };
  }, [jobPda, job.verdict, fallbackVerdict]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
        <div>
          <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-semibold text-purple-800">
            Admin Arbitration Console
          </span>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">
            Disputed Job #{job.jobId}
          </h3>
        </div>
        <div className="text-right text-xs text-slate-500">
          <div className="font-semibold text-slate-700">
            Escrow: {(job.amount / 1_000_000_000).toFixed(2)} SOL
          </div>
          {job.disputedBy && (
            <div className="font-mono">
              Disputed by: {job.disputedBy.slice(0, 6)}...{job.disputedBy.slice(-4)}
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="py-6 text-center text-sm text-slate-500">
          Fetching AI arbitration report...
        </div>
      ) : isTimeout || !verdict ? (
        <div className="mt-4 rounded-lg border border-slate-300 bg-slate-100 p-4 text-slate-800">
          <p className="font-semibold text-slate-900">
            No AI verdict was posted (review timed out).
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Escalated under Decision D11 after the review window elapsed with no verdict (404 REPORT_NOT_FOUND). Please inspect the deliverable manually before resolving:
          </p>
          {job.deliverableUri && (
            <a
              href={job.deliverableUri}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block break-all font-mono text-xs text-indigo-600 underline"
            >
              {job.deliverableUri}
            </a>
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                AI Arbiter Recommendation
              </div>
              <p className="mt-1 text-sm text-slate-800">{verdict.summary}</p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${
                  verdict.verdict === "pass"
                    ? "bg-emerald-100 text-emerald-800"
                    : verdict.verdict === "fail"
                    ? "bg-red-100 text-red-800"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                {verdict.verdict}
              </span>
              <span className="rounded-lg bg-slate-900 px-3 py-1 text-sm font-bold text-white tabular-nums">
                {verdict.score}/100
              </span>
            </div>
          </div>

          {verdict.risks.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-600">Risks:</span>
              {verdict.risks.map((risk, i) => (
                <span
                  key={i}
                  className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-900"
                >
                  {risk}
                </span>
              ))}
            </div>
          )}

          <div className="space-y-2.5">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Acceptance Criteria Breakdown
            </h4>
            {verdict.criteria.map((c, idx) => (
              <div
                key={idx}
                className="rounded-lg border border-slate-200 bg-white p-3.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <span
                      className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        c.met === true
                          ? "bg-emerald-100 text-emerald-700"
                          : c.met === false
                          ? "bg-red-100 text-red-700"
                          : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {c.met === true ? "✓" : c.met === false ? "✗" : "?"}
                    </span>
                    <span className="text-sm font-medium text-slate-900">
                      {c.criterion}
                    </span>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-slate-500 tabular-nums">
                    {Math.round(c.confidence * 100)}% conf
                  </span>
                </div>
                <p className="mt-1.5 pl-7 text-xs text-slate-600">“{c.evidence}”</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 pt-4">
        <button
          type="button"
          onClick={onRefund}
          className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
        >
          Refund Client
        </button>
        <button
          type="button"
          onClick={onRelease}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-emerald-700"
        >
          Release to Freelancer
        </button>
      </div>
    </div>
  );
}