"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useJobs } from "../../../context/JobContext";
import { DEMO_WALLETS, useSession, UserRole } from "../../../context/SessionContext";
import JobActionPanel from "../../../components/JobActionPanel";
import AdminDisputeView from "../../../components/AdminDisputeView";

export default function JobDetailPage() {
  const params = useParams<{ pda: string }>();
  const pda = params?.pda ?? "";

  const { records, isLoaded, approveJob, disputeJob, resolveDispute } = useJobs();
  const { role, walletAddress, loginAsDemo } = useSession();
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  if (!isLoaded) {
    return <div className="text-sm text-slate-500">Loading contract details...</div>;
  }

  const record = records.find((r) => r.pda === pda);

  if (!record) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Escrow Job Not Found</h2>
        <p className="font-mono text-xs text-slate-500">{pda}</p>
        <Link
          href="/client"
          className="inline-block rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white"
        >
          Back to Portal
        </Link>
      </div>
    );
  }

  const { job } = record;
  const activeRole: UserRole = role ?? "seller";
  const activeWallet = walletAddress ?? DEMO_WALLETS[activeRole];

  const showNotice = (msg: string) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 4000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Link href={`/${activeRole}`} className="hover:underline">
              ← Back to {activeRole} portal
            </Link>
            <span>·</span>
            <span className="font-mono">
              {pda.slice(0, 8)}...{pda.slice(-6)}
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            #{job.jobId} · {record.title}
          </h1>
        </div>

        {/* Quick Demo Role Switcher right on the job page */}
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-xs">
          {(["client", "seller", "admin"] as UserRole[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => loginAsDemo(r)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition ${
                activeRole === r
                  ? "bg-indigo-600 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {actionNotice && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-900">
          {actionNotice}
        </div>
      )}

      {/* Contract Metadata Grid */}
      <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs sm:grid-cols-3">
        <div>
          <div className="text-xs font-medium text-slate-500">Escrow Status</div>
          <div className="mt-1 inline-flex rounded-full bg-indigo-50 px-2.5 py-0.5 text-sm font-semibold text-indigo-700">
            {job.status}
          </div>
        </div>

        <div>
          <div className="text-xs font-medium text-slate-500">Locked Amount</div>
          <div className="mt-1 text-base font-bold text-slate-900 tabular-nums">
            {(job.amount / 1_000_000_000).toFixed(2)} SOL
          </div>
        </div>

        <div>
          <div className="text-xs font-medium text-slate-500">Submitted At (UTC)</div>
          <div className="mt-1 font-mono text-xs text-slate-800">
            {job.submittedAt > 0
              ? new Date(job.submittedAt * 1000).toISOString().replace("T", " ").slice(0, 19) + " UTC"
              : "Not submitted yet"}
          </div>
        </div>

        <div className="sm:col-span-3 border-t border-slate-100 pt-3">
          <div className="text-xs font-medium text-slate-500">Specification</div>
          <p className="mt-0.5 text-sm text-slate-800">{record.description}</p>
        </div>

        {job.deliverableUri && (
          <div className="sm:col-span-3 border-t border-slate-100 pt-3">
            <div className="text-xs font-medium text-slate-500">Submitted Deliverable URI</div>
            <a
              href={job.deliverableUri}
              target="_blank"
              rel="noreferrer"
              className="mt-0.5 inline-block break-all font-mono text-xs text-indigo-600 underline"
            >
              {job.deliverableUri}
            </a>
          </div>
        )}
      </div>

      {/* Role-aware Action Panel (Submitted & VerdictProposed) */}
      <JobActionPanel
        job={job}
        currentWallet={activeWallet}
        onApprove={() => {
          approveJob(pda);
          showNotice("Approved! Escrow funds released to Freelancer.");
        }}
        onRetryAI={() => {
          showNotice("Triggered POST /api/jobs/:pda/evaluate on Backend (port 4000).");
        }}
        onDispute={() => {
          disputeJob(pda, activeWallet);
          showNotice("Dispute submitted on-chain! Status moved to Disputed.");
        }}
      />

      {/* Admin Arbitration View when Disputed */}
      {job.status === "Disputed" && (
        <AdminDisputeView
          jobPda={pda}
          job={job}
          fallbackVerdict={record.verdict}
          onRelease={() => {
            resolveDispute(pda, true);
            showNotice("Admin resolved dispute: funds released to Freelancer.");
          }}
          onRefund={() => {
            resolveDispute(pda, false);
            showNotice("Admin resolved dispute: funds refunded to Client.");
          }}
        />
      )}

      {/* Settled Banner */}
      {(job.status === "Released" || job.status === "Refunded") && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
          <span className="font-semibold">Contract Settled ({job.status}):</span>{" "}
          Escrow vault closed and funds transferred on-chain.
        </div>
      )}
    </div>
  );
}