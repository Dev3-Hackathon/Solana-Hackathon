"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useJobs } from "../../context/JobContext";
import { DEMO_WALLETS, useSession } from "../../context/SessionContext";

const REVIEW_TIMEOUT_SECS = Number(process.env.NEXT_PUBLIC_REVIEW_TIMEOUT_SECS ?? 300);

export default function SellerPortalPage() {
  const { records, isLoaded, submitWork } = useJobs();
  const { role, loginAsDemo } = useSession();
  const [uriDrafts, setUriDrafts] = useState<Record<string, string>>({});

  const sellerJobs = records.filter((r) => r.job.freelancer === DEMO_WALLETS.seller);
  const pendingLamports = sellerJobs
    .filter((r) => !["Released", "Refunded", "Cancelled"].includes(r.job.status))
    .reduce((sum, r) => sum + r.job.amount, 0);

  if (!isLoaded) {
    return <div className="text-sm text-slate-500">Loading Seller Portal...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Seller Portal (Freelancer)
          </h1>
          <p className="text-sm text-slate-600">
            Submit deliverables, trigger AI evaluation, or dispute if review times out (D11).
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-right shadow-xs">
          <div className="text-xs font-medium text-slate-500">In-Progress Escrow</div>
          <div className="text-xl font-bold text-emerald-600 tabular-nums">
            {(pendingLamports / 1_000_000_000).toFixed(2)} SOL
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {sellerJobs.map((rec) => {
          const nowSecs = Math.floor(Date.now() / 1000);
          const isOverdue =
            rec.job.status === "Submitted" &&
            nowSecs >= rec.job.submittedAt + REVIEW_TIMEOUT_SECS;

          return (
            <div
              key={rec.pda}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-slate-400">#{rec.job.jobId}</span>
                    <h3 className="text-base font-semibold text-slate-900">{rec.title}</h3>
                    <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                      {rec.job.status}
                    </span>
                    {isOverdue && (
                      <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                        Review Timed Out · Dispute Unlocked
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-600">{rec.description}</p>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-sm font-bold text-slate-900 tabular-nums">
                      {(rec.job.amount / 1_000_000_000).toFixed(2)} SOL
                    </div>
                    <div className="font-mono text-xs text-slate-400">
                      {rec.pda.slice(0, 6)}...{rec.pda.slice(-4)}
                    </div>
                  </div>

                  <Link
                    href={`/jobs/${rec.pda}`}
                    onClick={() => {
                      if (role !== "seller") loginAsDemo("seller");
                    }}
                    className="rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    Open Contract →
                  </Link>
                </div>
              </div>

              {rec.job.status === "Accepted" && (
                <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                  <input
                    type="url"
                    placeholder="https://github.com/org/repo/pull/123"
                    value={uriDrafts[rec.pda] ?? ""}
                    onChange={(e) =>
                      setUriDrafts((prev) => ({ ...prev, [rec.pda]: e.target.value }))
                    }
                    className="min-w-[260px] flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const uri =
                        (uriDrafts[rec.pda] ?? "").trim() ||
                        "https://github.com/proofpay/demo-submission/pull/1";
                      if (role !== "seller") loginAsDemo("seller");
                      submitWork(rec.pda, uri);
                    }}
                    className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                  >
                    Submit Work (Start 300s Review)
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}