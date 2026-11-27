"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useJobs } from "../../context/JobContext";
import { useSession } from "../../context/SessionContext";
import AdminDisputeView from "../../components/AdminDisputeView";

export default function AdminConsolePage() {
  const { records, isLoaded, resolveDispute } = useJobs();
  const { role, loginAsDemo } = useSession();
  const [banner, setBanner] = useState<string | null>(null);

  const disputedJobs = records.filter((r) => r.job.status === "Disputed");
  const resolvedJobs = records.filter((r) =>
    ["Released", "Refunded"].includes(r.job.status)
  );

  const handleResolve = (pda: string, jobId: number, releaseToSeller: boolean) => {
    if (role !== "admin") loginAsDemo("admin");
    resolveDispute(pda, releaseToSeller);
    setBanner(
      `Resolved Job #${jobId}: funds ${
        releaseToSeller ? "released to Freelancer" : "refunded to Client"
      }.`
    );
    setTimeout(() => setBanner(null), 4000);
  };

  if (!isLoaded) {
    return <div className="text-sm text-slate-500">Loading Admin Console...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Admin Dispute Console
          </h1>
          <p className="text-sm text-slate-600">
            Review contested AI verdicts and D11 review-timeout escalations.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-right shadow-xs">
          <div className="text-xs font-medium text-slate-500">Open Disputes</div>
          <div className="text-xl font-bold text-purple-700 tabular-nums">
            {disputedJobs.length}
          </div>
        </div>
      </div>

      {banner && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
          {banner}
        </div>
      )}

      {disputedJobs.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
          No active disputes in queue. Escalate a timed-out job from{" "}
          <Link href="/seller" className="font-semibold text-indigo-600 underline">
            Seller
          </Link>{" "}
          or{" "}
          <Link href="/client" className="font-semibold text-indigo-600 underline">
            Client
          </Link>{" "}
          to test D11 arbitration.
        </div>
      ) : (
        <div className="space-y-6">
          {disputedJobs.map((rec) => (
            <div key={rec.pda} className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-sm font-semibold text-slate-800">
                  {rec.title}
                </span>
                <Link
                  href={`/jobs/${rec.pda}`}
                  className="text-xs font-medium text-indigo-600 hover:underline"
                >
                  Open Full Job View →
                </Link>
              </div>
              <AdminDisputeView
                jobPda={rec.pda}
                job={rec.job}
                fallbackVerdict={rec.verdict}
                onRelease={() => handleResolve(rec.pda, rec.job.jobId, true)}
                onRefund={() => handleResolve(rec.pda, rec.job.jobId, false)}
              />
            </div>
          ))}
        </div>
      )}

      {resolvedJobs.length > 0 && (
        <div className="space-y-2 pt-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Recently Settled ({resolvedJobs.length})
          </h2>
          {resolvedJobs.map((rec) => (
            <div
              key={rec.pda}
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm"
            >
              <span className="font-medium text-slate-800">
                #{rec.job.jobId} · {rec.title}
              </span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  rec.job.status === "Released"
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-slate-200 text-slate-800"
                }`}
              >
                {rec.job.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}