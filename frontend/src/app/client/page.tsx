"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useJobs } from "../../context/JobContext";
import { DEMO_WALLETS, useSession } from "../../context/SessionContext";

const REVIEW_TIMEOUT_SECS = Number(process.env.NEXT_PUBLIC_REVIEW_TIMEOUT_SECS ?? 300);
const FALLBACK_SOL_USD = 150;

export default function ClientPortalPage() {
  const { records, isLoaded, createJob } = useJobs();
  const { role, walletAddress, loginAsDemo } = useSession();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [amountSol, setAmountSol] = useState("1.5");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdBanner, setCreatedBanner] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const [solUsdRate, setSolUsdRate] = useState<number>(FALLBACK_SOL_USD);
  const [isLiveRate, setIsLiveRate] = useState<boolean>(false);

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
      .catch(() => {
        // Keep FALLBACK_SOL_USD when offline
      });
    return () => {
      active = false;
    };
  }, []);

  const parsedSol = parseFloat(amountSol);
  const usdEstimate =
    !Number.isNaN(parsedSol) && parsedSol > 0 ? parsedSol * solUsdRate : 0;

  const activeClientWallet =
    role === "client" && walletAddress ? walletAddress : DEMO_WALLETS.client;

  const clientJobs = records.filter(
    (r) => r.job.client === activeClientWallet || r.job.client === DEMO_WALLETS.client
  );

  const lockedLamports = clientJobs
    .filter((r) => !["Released", "Refunded", "Cancelled"].includes(r.job.status))
    .reduce((sum, r) => sum + r.job.amount, 0);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isSubmitting) return;

    setCreateError(null);
    setCreatedBanner(null);
    setIsSubmitting(true);

    try {
      if (role !== "client") loginAsDemo("client");
      const created = await createJob(
        title.trim(),
        description.trim() || "Written acceptance criteria attached.",
        Number(amountSol) || 1
      );
      setTitle("");
      setDescription("");
      setCreatedBanner(
        `Created & funded Job #${created.job.jobId} (${amountSol} SOL ≈ $${usdEstimate.toFixed(2)} USD locked in PDA).`
      );
      setTimeout(() => setCreatedBanner(null), 4000);
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Failed to create escrow job."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isLoaded) {
    return <div className="text-sm text-slate-500">Loading Client Portal...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Client Portal (Customer)
          </h1>
          <p className="text-sm text-slate-600">
            Fund non-custodial Solana escrows, inspect AI verdicts, or dispute timed-out reviews.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-right shadow-xs">
          <div className="text-xs font-medium text-slate-500">Active Escrow Locked</div>
          <div className="text-xl font-bold text-indigo-600 tabular-nums">
            {(lockedLamports / 1_000_000_000).toFixed(2)} SOL
          </div>
          <div className="text-xs text-slate-500 tabular-nums">
            ≈ ${((lockedLamports / 1_000_000_000) * solUsdRate).toFixed(2)} USD
          </div>
        </div>
      </div>

      {/* Create & Fund Escrow Form */}
      <form
        onSubmit={handleCreate}
        className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            Create &amp; Fund New Escrow Job
          </h2>
          <span className="text-xs text-slate-500">
            1 SOL ≈ ${solUsdRate.toFixed(2)} USD{isLiveRate ? "" : " (est.)"}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-700">Job Title</label>
            <input
              type="text"
              required
              disabled={isSubmitting}
              placeholder="e.g., Build Solana Webhook Indexer"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">
              Escrow Amount (SOL)
            </label>
            <div className="relative mt-1 flex items-center">
              <input
                type="number"
                step="0.1"
                min="0.1"
                required
                disabled={isSubmitting}
                value={amountSol}
                onChange={(e) => setAmountSol(e.target.value)}
                className="w-full rounded-lg border border-slate-300 py-2 pl-3 pr-24 text-sm text-slate-900 tabular-nums focus:border-indigo-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
              />
              <span className="pointer-events-none absolute right-2.5 rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 tabular-nums">
                ≈ ${usdEstimate.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700">
            Acceptance Criteria Summary (Hashed on-chain)
          </label>
          <input
            type="text"
            disabled={isSubmitting}
            placeholder="e.g., Unit tests passing, PR merged, latency under 200ms"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            {createdBanner && (
              <span className="text-xs font-medium text-emerald-700">
                {createdBanner}
              </span>
            )}
            {createError && (
              <span className="text-xs font-medium text-red-600">
                {createError}
              </span>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Creating & Linking Spec..." : "Create & Lock Funds"}
          </button>
        </div>
      </form>

      {/* Client's Jobs List */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">
          Your Escrow Contracts ({clientJobs.length})
        </h2>

        {clientJobs.map((rec) => {
          const nowSecs = Math.floor(Date.now() / 1000);
          const isOverdue =
            rec.job.status === "Submitted" &&
            nowSecs >= rec.job.submittedAt + REVIEW_TIMEOUT_SECS;
          const jobSol = rec.job.amount / 1_000_000_000;

          return (
            <div
              key={rec.pda}
              className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs"
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-slate-400">#{rec.job.jobId}</span>
                  <h3 className="text-base font-semibold text-slate-900">{rec.title}</h3>
                  <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                    {rec.job.status}
                  </span>
                  {isOverdue && (
                    <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                      Review Overdue · Dispute Unlocked
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-600">{rec.description}</p>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-sm font-bold text-slate-900 tabular-nums">
                    {jobSol.toFixed(2)} SOL{" "}
                    <span className="text-xs font-normal text-slate-500">
                      (≈ ${(jobSol * solUsdRate).toFixed(2)})
                    </span>
                  </div>
                  <div className="font-mono text-xs text-slate-400">
                    {rec.pda.slice(0, 6)}...{rec.pda.slice(-4)}
                  </div>
                </div>

                <Link
                  href={`/jobs/${rec.pda}`}
                  onClick={() => {
                    if (role !== "client") loginAsDemo("client");
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                >
                  Manage Job →
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}