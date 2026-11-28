"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePollar } from "@pollar/react";
import { useJobs } from "../../context/JobContext";
import { DEMO_WALLETS, useSession } from "../../context/SessionContext";
import { estimateJobPrice, PriceEstimateResponse } from "../../lib/api";

const FALLBACK_SOL_USD = 150;

export default function ClientPortalPage() {
  const { records, isLoaded, createJobWithPollar } = useJobs();
  const {
    role,
    walletAddress,
    pollarAddress,
    isPollarVerified,
    loginAsDemo,
  } = useSession();
  const { sendPayment } = usePollar();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [amountSol, setAmountSol] = useState("1.5");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdBanner, setCreatedBanner] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const [isEstimating, setIsEstimating] = useState(false);
  const [priceEstimate, setPriceEstimate] = useState<PriceEstimateResponse | null>(null);

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
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const parsedSol = parseFloat(amountSol);
  const validSol = !Number.isNaN(parsedSol) && parsedSol > 0 ? parsedSol : 0;
  const usdEstimate = validSol * solUsdRate;

  const isLowball = priceEstimate !== null && validSol < priceEstimate.minSol;
  const isHighball = priceEstimate !== null && validSol > priceEstimate.maxSol;
  const isOutOfBounds = isLowball || isHighball;

  const validateScopeAndBounds = (): boolean => {
    if (!title.trim()) {
      setCreateError("Please enter a job title.");
      return false;
    }
    if (isLowball && priceEstimate) {
      setCreateError(
        `Lowball protection: Amount (${validSol.toFixed(2)} SOL) is below the AI minimum of ${priceEstimate.minSol.toFixed(2)} SOL.`
      );
      return false;
    }
    if (isHighball && priceEstimate) {
      setCreateError(
        `Highball protection: Amount (${validSol.toFixed(2)} SOL) exceeds the AI maximum of ${priceEstimate.maxSol.toFixed(2)} SOL.`
      );
      return false;
    }
    return true;
  };

  const handleGetAiEstimate = async () => {
    if (!title.trim() && !description.trim()) {
      setCreateError("Enter a job title or acceptance criteria first so AI can price the scope.");
      return;
    }
    setCreateError(null);
    setIsEstimating(true);
    try {
      const estimate = await estimateJobPrice({
        title: title.trim(),
        description: description.trim(),
      });
      setPriceEstimate(estimate);
      setAmountSol(estimate.recommendedSol.toFixed(2));
    } finally {
      setIsEstimating(false);
    }
  };

  const activeClientWallet =
    role === "client" && walletAddress ? walletAddress : DEMO_WALLETS.client;

  const clientJobs = records.filter(
    (r) => r.job.client === activeClientWallet || r.job.client === DEMO_WALLETS.client
  );

  const lockedLamports = clientJobs
    .filter((r) => !["Released", "Refunded", "Cancelled"].includes(r.job.status))
    .reduce((sum, r) => sum + r.job.amount, 0);

  const handlePayEscrowWithPollar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || !validateScopeAndBounds()) return;

    if (!pollarAddress) {
      setCreateError("Connect a Pollar Solana wallet on /login to pay escrow with Pollar.");
      return;
    }
    if (!isPollarVerified) {
      setCreateError("Pollar session is not verified yet. Complete verification before paying.");
      return;
    }

    setCreateError(null);
    setCreatedBanner(null);
    setIsSubmitting(true);

    try {
      if (role !== "client") loginAsDemo("client");
      const created = await createJobWithPollar(
        title.trim(),
        description.trim() || "Written acceptance criteria attached.",
        validSol || 1,
        pollarAddress,
        sendPayment
      );
      setTitle("");
      setDescription("");
      setPriceEstimate(null);
      setCreatedBanner(
        `Paid & confirmed Job #${created.job.jobId} via Pollar (${validSol.toFixed(2)} SOL locked in PDA ${created.pda.slice(0, 6)}...${created.pda.slice(-4)}).`
      );
      setTimeout(() => setCreatedBanner(null), 6000);
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Pollar escrow payment failed."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isLoaded) {
    return <div className="text-sm text-slate-500">Loading Client Portal...</div>;
  }

  const canPayWithPollar = Boolean(pollarAddress && isPollarVerified);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Client Portal (Customer)
          </h1>
          <p className="text-sm text-slate-600">
            Fund non-custodial Solana escrows with Pollar, inspect AI verdicts, or dispute timed-out reviews.
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
        onSubmit={handlePayEscrowWithPollar}
        className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
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
              onChange={(e) => {
                setTitle(e.target.value);
                setPriceEstimate(null);
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="block text-xs font-medium text-slate-700">
                Escrow Amount (SOL)
              </label>
              <button
                type="button"
                disabled={isEstimating || isSubmitting}
                onClick={handleGetAiEstimate}
                className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
              >
                {isEstimating ? "Pricing..." : "✨ AI Fair Price"}
              </button>
            </div>
            <div className="relative mt-1 flex items-center">
              <input
                type="number"
                step="0.05"
                min="0.001"
                required
                disabled={isSubmitting}
                value={amountSol}
                onChange={(e) => setAmountSol(e.target.value)}
                className={`w-full rounded-lg border py-2 pl-3 pr-24 text-sm text-slate-900 tabular-nums focus:outline-none disabled:bg-slate-50 disabled:text-slate-400 ${
                  isOutOfBounds
                    ? "border-red-400 bg-red-50/30 focus:border-red-500"
                    : "border-slate-300 focus:border-indigo-500"
                }`}
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
            onChange={(e) => {
              setDescription(e.target.value);
              setPriceEstimate(null);
            }}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
          />
        </div>

        {/* AI Recommended Price Guardrail Banner */}
        {priceEstimate && (
          <div
            className={`rounded-lg border p-3.5 text-xs space-y-2 ${
              isOutOfBounds
                ? "border-red-200 bg-red-50/70 text-red-900"
                : "border-indigo-200 bg-indigo-50/60 text-slate-800"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                  AI Recommended: {priceEstimate.recommendedSol.toFixed(2)} SOL (≈ $
                  {(priceEstimate.recommendedSol * solUsdRate).toFixed(2)})
                </span>
                <span className="font-medium text-slate-600 tabular-nums">
                  Allowed Fair Band: {priceEstimate.minSol.toFixed(2)} –{" "}
                  {priceEstimate.maxSol.toFixed(2)} SOL
                </span>
              </div>

              {validSol !== priceEstimate.recommendedSol && (
                <button
                  type="button"
                  onClick={() => {
                    setAmountSol(priceEstimate.recommendedSol.toFixed(2));
                    setCreateError(null);
                  }}
                  className="rounded bg-white px-2.5 py-1 text-[11px] font-semibold text-indigo-700 border border-indigo-200 hover:bg-indigo-50"
                >
                  Snap to {priceEstimate.recommendedSol.toFixed(2)} SOL
                </button>
              )}
            </div>

            <p className="text-slate-600">{priceEstimate.rationale}</p>

            {isLowball && (
              <p className="font-semibold text-red-700">
                Lowball blocked: Please offer at least {priceEstimate.minSol.toFixed(2)} SOL for this scope.
              </p>
            )}
            {isHighball && (
              <p className="font-semibold text-red-700">
                Highball blocked: Cap escrow at {priceEstimate.maxSol.toFixed(2)} SOL or expand the acceptance criteria.
              </p>
            )}
          </div>
        )}

        {!canPayWithPollar && (
          <p className="text-xs text-slate-500">
            Sign in with Pollar and verify your session on{" "}
            <Link href="/login" className="font-semibold text-blue-600 hover:underline">
              /login
            </Link>{" "}
            to pay escrow with Pollar.
          </p>
        )}

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

          <div className="flex flex-wrap items-center gap-2">
            {!priceEstimate && (
              <button
                type="button"
                disabled={isEstimating || isSubmitting}
                onClick={handleGetAiEstimate}
                className="rounded-lg border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
              >
                {isEstimating ? "Analyzing Scope..." : "Check AI Fair Price"}
              </button>
            )}

            <button
              type="submit"
              disabled={isSubmitting || isOutOfBounds || !canPayWithPollar}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Paying with Pollar..." : "Pay escrow with Pollar"}
            </button>
          </div>
        </div>
      </form>

      {/* Client's Jobs List */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">
          Your Escrow Contracts ({clientJobs.length})
        </h2>

        {clientJobs.map((rec) => {
          const nowSecs = Math.floor(Date.now() / 1000);
          const windowSecs = Number(rec.job.disputeWindowSecs) || 300;
          const isOverdue =
            rec.job.status === "Submitted" &&
            rec.job.submittedAt > 0 &&
            nowSecs >= rec.job.submittedAt + windowSecs;
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