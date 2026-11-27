"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useJobs } from "../../context/JobContext";
import { useSession } from "../../context/SessionContext";

const REVIEW_TIMEOUT_SECS = Number(process.env.NEXT_PUBLIC_REVIEW_TIMEOUT_SECS ?? 300);
const ADMIN_PASSCODE = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || "admin";
const ADMIN_ALLOWLIST_WALLET = process.env.NEXT_PUBLIC_ADMIN_WALLET || "";
const ADMIN_AUTH_STORAGE_KEY = "proofpay_admin_unlocked";
const FALLBACK_SOL_USD = 150;

export default function AdminConsolePage() {
  const { records, isLoaded, resetDemoData } = useJobs();
  const { role, walletAddress, isWalletConnected, loginAsDemo, setRole } = useSession();

  const [isUnlocked, setIsUnlocked] = useState(false);
  const [passcodeInput, setPasscodeInput] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  const [filter, setFilter] = useState<"attention" | "all" | "resolved">("attention");
  const [solUsdRate, setSolUsdRate] = useState<number>(FALLBACK_SOL_USD);
  const [isLiveRate, setIsLiveRate] = useState<boolean>(false);

  // Restore admin unlock state or auto-unlock if connected wallet matches allowlist
  useEffect(() => {
    if (
      isWalletConnected &&
      ADMIN_ALLOWLIST_WALLET &&
      walletAddress === ADMIN_ALLOWLIST_WALLET
    ) {
      setIsUnlocked(true);
      if (role !== "admin") setRole("admin");
      return;
    }

    const savedUnlock = window.sessionStorage.getItem(ADMIN_AUTH_STORAGE_KEY);
    if (savedUnlock === "true") {
      setIsUnlocked(true);
    }
  }, [isWalletConnected, walletAddress, role, setRole]);

  useEffect(() => {
    let active = true;
    fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const price = data?.solana?.usd;
        if (active && typeof price === "number" && price > 0) {
          setSolUsdRate(price);
          setIsLiveRate(true);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (passcodeInput.trim() === ADMIN_PASSCODE) {
      setAuthError(null);
      setIsUnlocked(true);
      window.sessionStorage.setItem(ADMIN_AUTH_STORAGE_KEY, "true");
      if (isWalletConnected) {
        setRole("admin");
      } else {
        loginAsDemo("admin");
      }
    } else {
      setAuthError("Invalid admin passcode.");
    }
  };

  const handleLockAdmin = () => {
    setIsUnlocked(false);
    setPasscodeInput("");
    window.sessionStorage.removeItem(ADMIN_AUTH_STORAGE_KEY);
  };

  if (!isLoaded) {
    return <div className="text-sm text-slate-500">Loading Admin Console...</div>;
  }

  // Passcode Gate View
  if (!isUnlocked) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
        <div className="space-y-1">
          <span className="inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
            Restricted Access
          </span>
          <h1 className="text-xl font-bold text-slate-900">
            Admin &amp; Arbitration Console
          </h1>
          <p className="text-xs text-slate-600">
            Enter the protocol operator passcode to inspect disputes and execute on-chain split resolutions.
          </p>
        </div>

        <form onSubmit={handleUnlock} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-700">
              Admin Passcode
            </label>
            <input
              type="password"
              required
              placeholder="Enter operator passcode"
              value={passcodeInput}
              onChange={(e) => setPasscodeInput(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {authError && (
            <p className="text-xs font-medium text-red-600">{authError}</p>
          )}

          <button
            type="submit"
            className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Unlock Admin Console
          </button>
        </form>

        <p className="text-[11px] text-slate-400">
          Demo passcode: <code className="font-mono text-slate-600">{ADMIN_PASSCODE}</code> · On-chain payouts still require the authority keypair.
        </p>
      </div>
    );
  }

  const nowSecs = Math.floor(Date.now() / 1000);

  const isOverdueJob = (status: string, submittedAt: number) =>
    status === "Submitted" && submittedAt > 0 && nowSecs >= submittedAt + REVIEW_TIMEOUT_SECS;

  const disputedJobs = records.filter((r) => r.job.status === "Disputed");
  const overdueJobs = records.filter((r) =>
    isOverdueJob(r.job.status, r.job.submittedAt)
  );
  const resolvedJobs = records.filter((r) =>
    ["Released", "Refunded", "Resolved", "Cancelled"].includes(r.job.status)
  );

  const disputedLamports = disputedJobs.reduce((sum, r) => sum + r.job.amount, 0);

  const filteredRecords = records.filter((r) => {
    if (filter === "attention") {
      return (
        r.job.status === "Disputed" ||
        isOverdueJob(r.job.status, r.job.submittedAt)
      );
    }
    if (filter === "resolved") {
      return ["Released", "Refunded", "Resolved", "Cancelled"].includes(r.job.status);
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header & Summary Metrics */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Admin &amp; Arbitration Console
            </h1>
            <button
              type="button"
              onClick={handleLockAdmin}
              className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500 hover:bg-slate-50"
            >
              Lock
            </button>
          </div>
          <p className="text-sm text-slate-600">
            Monitor disputed escrows, timed-out reviews, and execute split payouts.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            1 SOL ≈ ${solUsdRate.toFixed(2)} USD{isLiveRate ? "" : " (est.)"} · Review Timeout:{" "}
            {REVIEW_TIMEOUT_SECS}s
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-right shadow-xs">
            <div className="text-xs font-medium text-amber-900">Disputed Escrow</div>
            <div className="text-xl font-bold text-amber-800 tabular-nums">
              {(disputedLamports / 1_000_000_000).toFixed(2)} SOL
            </div>
            <div className="text-xs text-amber-800/80 tabular-nums">
              ≈ ${((disputedLamports / 1_000_000_000) * solUsdRate).toFixed(2)} USD
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-right shadow-xs">
            <div className="text-xs font-medium text-slate-500">Needs Attention</div>
            <div className="text-xl font-bold text-slate-900 tabular-nums">
              {disputedJobs.length + overdueJobs.length}
            </div>
            <div className="text-xs text-slate-500">
              {disputedJobs.length} disputed · {overdueJobs.length} overdue
            </div>
          </div>
        </div>
      </div>

      {/* Filter Tabs & Demo Reset */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2">
          {[
            {
              id: "attention" as const,
              label: `Needs Attention (${disputedJobs.length + overdueJobs.length})`,
            },
            { id: "all" as const, label: `All Contracts (${records.length})` },
            { id: "resolved" as const, label: `Settled (${resolvedJobs.length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                filter === tab.id
                  ? "bg-indigo-600 text-white"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={resetDemoData}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          Reset Demo Jobs
        </button>
      </div>

      {/* Queue List */}
      <div className="space-y-3">
        {filteredRecords.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            No escrow contracts match this filter.
          </div>
        ) : (
          filteredRecords.map((rec) => {
            const overdue = isOverdueJob(rec.job.status, rec.job.submittedAt);
            const jobSol = rec.job.amount / 1_000_000_000;

            return (
              <div
                key={rec.pda}
                className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs"
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-slate-400">#{rec.job.jobId}</span>
                    <h3 className="text-base font-semibold text-slate-900">{rec.title}</h3>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        rec.job.status === "Disputed"
                          ? "bg-amber-100 text-amber-800"
                          : rec.job.status === "Released" || rec.job.status === "Resolved"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-indigo-50 text-indigo-700"
                      }`}
                    >
                      {rec.job.status}
                    </span>
                    {overdue && (
                      <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                        Review Overdue
                      </span>
                    )}
                    {rec.verdict && (
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 uppercase">
                        AI: {rec.verdict.verdict}
                      </span>
                    )}
                  </div>

                  <p className="text-sm text-slate-600">{rec.description}</p>

                  {rec.disputeReason && (
                    <p className="text-xs font-medium text-amber-800">
                      Dispute Note: &ldquo;{rec.disputeReason}&rdquo;
                    </p>
                  )}

                  <div className="flex flex-wrap gap-4 font-mono text-[11px] text-slate-400">
                    <span>Client: {rec.job.client.slice(0, 6)}...{rec.job.client.slice(-4)}</span>
                    <span>Seller: {rec.job.freelancer.slice(0, 6)}...{rec.job.freelancer.slice(-4)}</span>
                    <span>PDA: {rec.pda.slice(0, 6)}...{rec.pda.slice(-4)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-sm font-bold text-slate-900 tabular-nums">
                      {jobSol.toFixed(2)} SOL{" "}
                      <span className="text-xs font-normal text-slate-500">
                        (≈ ${(jobSol * solUsdRate).toFixed(2)})
                      </span>
                    </div>
                  </div>

                  <Link
                    href={`/jobs/${rec.pda}`}
                    onClick={() => {
                      if (role !== "admin") loginAsDemo("admin");
                    }}
                    className="rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    {rec.job.status === "Disputed" ? "Arbitrate →" : "Inspect →"}
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}