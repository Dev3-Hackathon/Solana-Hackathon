"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useJobs } from "../../context/JobContext";
import { DEMO_WALLETS, useSession } from "../../context/SessionContext";

const REVIEW_TIMEOUT_SECS = Number(process.env.NEXT_PUBLIC_REVIEW_TIMEOUT_SECS ?? 300);
const FALLBACK_SOL_USD = 150;

export default function SellerPortalPage() {
  const { records, isLoaded } = useJobs();
  const { role, walletAddress, loginAsDemo } = useSession();

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

  const activeSellerWallet =
    role === "seller" && walletAddress ? walletAddress : DEMO_WALLETS.seller;

  const sellerJobs = records.filter(
    (r) => r.job.freelancer === activeSellerWallet || r.job.freelancer === DEMO_WALLETS.seller
  );

  const activeEscrowLamports = sellerJobs
    .filter((r) => !["Released", "Refunded", "Cancelled"].includes(r.job.status))
    .reduce((sum, r) => sum + r.job.amount, 0);

  const earnedLamports = sellerJobs
    .filter((r) => r.job.status === "Released")
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
            Deliver work against locked escrow contracts, trigger AI verification, and claim payouts.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            1 SOL ≈ ${solUsdRate.toFixed(2)} USD{isLiveRate ? "" : " (est.)"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-right shadow-xs">
            <div className="text-xs font-medium text-slate-500">In-Progress Escrow</div>
            <div className="text-xl font-bold text-indigo-600 tabular-nums">
              {(activeEscrowLamports / 1_000_000_000).toFixed(2)} SOL
            </div>
            <div className="text-xs text-slate-500 tabular-nums">
              ≈ ${((activeEscrowLamports / 1_000_000_000) * solUsdRate).toFixed(2)} USD
            </div>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-right shadow-xs">
            <div className="text-xs font-medium text-emerald-800">Released Earnings</div>
            <div className="text-xl font-bold text-emerald-700 tabular-nums">
              {(earnedLamports / 1_000_000_000).toFixed(2)} SOL
            </div>
            <div className="text-xs text-emerald-700/80 tabular-nums">
              ≈ ${((earnedLamports / 1_000_000_000) * solUsdRate).toFixed(2)} USD
            </div>
          </div>
        </div>
      </div>

      {/* Seller's Assigned Contracts */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">
          Assigned Contracts ({sellerJobs.length})
        </h2>

        {sellerJobs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            No contracts assigned to this seller wallet yet.
          </div>
        ) : (
          sellerJobs.map((rec) => {
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
                      if (role !== "seller") loginAsDemo("seller");
                    }}
                    className="rounded-lg border border-slate-300 bg-black px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    Open Contract →
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