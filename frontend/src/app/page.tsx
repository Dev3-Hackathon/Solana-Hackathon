"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useConnection } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { useJobs } from "../context/JobContext";
import { DEMO_WALLETS, useSession } from "../context/SessionContext";
import { evaluateSellerRate, SellerRateAssessment } from "../lib/api";

const FALLBACK_SOL_USD = 150;

function formatJobDate(rec: { job: { submittedAt: number; deadline: number; jobId: number } }): string {
  // Derive an approximate creation timestamp from deadline minus standard 24h window when available
  const approxCreatedSecs =
    rec.job.deadline > 86400
      ? rec.job.deadline - 86400
      : rec.job.submittedAt > 0
      ? rec.job.submittedAt
      : 0;

  if (approxCreatedSecs > 0) {
    return new Date(approxCreatedSecs * 1000).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  return `Job #${rec.job.jobId}`;
}

function SellerEarningsChart({
  items,
  solUsdRate,
}: {
  items: { label: string; sol: number; released: boolean }[];
  solUsdRate: number;
}) {
  const maxSol = Math.max(1, ...items.map((i) => i.sol));

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Earnings Overview</h2>
          <p className="text-xs text-slate-600">
            Contract value breakdown across your assigned escrows (SOL &amp; USD).
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-xs bg-indigo-600" />
            Released
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-xs bg-sky-300" />
            In Escrow
          </span>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500">
          No earnings data yet. Assigned contracts will appear here.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6 items-end pt-2">
          {items.map((item) => {
            const heightPct = Math.max(12, Math.round((item.sol / maxSol) * 100));
            return (
              <div key={item.label} className="flex flex-col items-center gap-1.5">
                <div className="text-[11px] font-semibold text-slate-800 tabular-nums">
                  {item.sol.toFixed(2)} SOL
                </div>
                <div className="flex h-28 w-full max-w-[56px] items-end rounded-lg bg-slate-100 p-1">
                  <div
                    style={{ height: `${heightPct}%` }}
                    className={`w-full rounded-md transition-all ${
                      item.released ? "bg-indigo-600" : "bg-sky-400"
                    }`}
                    title={`${item.label}: ${item.sol.toFixed(2)} SOL (≈ $${(
                      item.sol * solUsdRate
                    ).toFixed(2)})`}
                  />
                </div>
                <div className="truncate max-w-[76px] font-mono text-[11px] text-slate-500">
                  {item.label}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function HomePage() {
  const { records, isLoaded, updateJobPrice } = useJobs();
  const { role, walletAddress, isWalletConnected, loginAsDemo } = useSession();
  const { connection } = useConnection();

  const [solUsdRate, setSolUsdRate] = useState<number>(FALLBACK_SOL_USD);
  const [nowSecs, setNowSecs] = useState<number>(0);
  const [liveWalletSol, setLiveWalletSol] = useState<number | null>(null);

  // Client inline price editing state
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [priceSavedNotice, setPriceSavedNotice] = useState<string | null>(null);

  // Seller rate benchmarks
  const [rateMap, setRateMap] = useState<Record<string, SellerRateAssessment>>({});

  useEffect(() => {
    setNowSecs(Math.floor(Date.now() / 1000));
    const t = setInterval(() => setNowSecs(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
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

  useEffect(() => {
    if (!walletAddress) {
      setLiveWalletSol(null);
      return;
    }
    let active = true;
    try {
      const pk = new PublicKey(walletAddress);
      connection
        .getBalance(pk)
        .then((lamports) => {
          if (active) setLiveWalletSol(lamports / LAMPORTS_PER_SOL);
        })
        .catch(() => {
          if (active) setLiveWalletSol(null);
        });
    } catch {
      setLiveWalletSol(null);
    }
    return () => {
      active = false;
    };
  }, [connection, walletAddress]);

  const sellerJobs = useMemo(() => {
    const activeSeller =
      role === "seller" && walletAddress ? walletAddress : DEMO_WALLETS.seller;
    return records.filter(
      (r) =>
        r.job.freelancer === activeSeller || r.job.freelancer === DEMO_WALLETS.seller
    );
  }, [records, role, walletAddress]);

  useEffect(() => {
    if (!isLoaded || role !== "seller" || sellerJobs.length === 0) return;
    let active = true;
    Promise.all(
      sellerJobs.map(async (rec) => {
        const offeredSol = rec.job.amount / LAMPORTS_PER_SOL;
        const assessment = await evaluateSellerRate({
          title: rec.title,
          description: rec.description,
          offeredSol,
        });
        return [rec.pda, assessment] as const;
      })
    ).then((entries) => {
      if (!active) return;
      const next: Record<string, SellerRateAssessment> = {};
      for (const [pda, assessment] of entries) next[pda] = assessment;
      setRateMap(next);
    });
    return () => {
      active = false;
    };
  }, [isLoaded, role, sellerJobs]);

  if (!isLoaded) {
    return <div className="text-sm text-slate-500">Loading ProofPay...</div>;
  }

  const isLoggedIn = Boolean(role && walletAddress);

  // 1. LOGGED OUT: Info Page + Sign Up / Login + Scrollable Details
  if (!isLoggedIn) {
    return (
      <div className="space-y-12 pb-8">
        <section className="rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 via-blue-50/70 to-indigo-50/80 p-8 shadow-xs space-y-5">
          <span className="inline-block rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-800">
            Solana Devnet · AI-Verified Escrow
          </span>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl max-w-2xl">
            Milestone escrows settled by verifiable specs and AI evaluation.
          </h1>
          <p className="text-sm leading-relaxed text-slate-600 max-w-2xl">
            ProofPay locks funds in deterministic Solana Program Derived Addresses (PDAs), benchmarks fair pricing upfront, and grades deliverables against hashed acceptance criteria.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Link
              href="/login"
              className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-indigo-700"
            >
              Sign Up / Login
            </Link>
            <a
              href="#how-it-works"
              className="rounded-lg border border-sky-200 bg-white px-4 py-2.5 text-sm font-semibold text-sky-900 hover:bg-sky-50"
            >
              Learn More Below ↓
            </a>
          </div>
        </section>

        <section id="how-it-works" className="space-y-4 scroll-mt-20">
          <h2 className="text-xl font-bold text-slate-900">How ProofPay Works</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-sky-700">
                01 · Fund &amp; Price
              </div>
              <h3 className="text-base font-semibold text-slate-900">
                Fair Scope &amp; Vault Lock
              </h3>
              <p className="text-xs leading-relaxed text-slate-600">
                Clients benchmark fair SOL rates, hash acceptance criteria, and lock funds in a PDA escrow vault without custodial middlemen.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                02 · Deliver &amp; Grade
              </div>
              <h3 className="text-base font-semibold text-slate-900">
                AI Arbiter Verification
              </h3>
              <p className="text-xs leading-relaxed text-slate-600">
                Sellers submit deliverables for structured AI evaluation against the recorded spec, with a per-job dispute window if reviews stall.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                03 · Settle or Arbitrate
              </div>
              <h3 className="text-base font-semibold text-slate-900">
                Instant Release or Split
              </h3>
              <p className="text-xs leading-relaxed text-slate-600">
                Approved jobs release payouts directly to the seller; disputed or timed-out jobs route cleanly to admin split arbitration.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
          <h2 className="text-lg font-bold text-slate-900">Built for Every Role</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 text-xs">
            <div className="rounded-lg bg-sky-50/70 border border-sky-100 p-4 space-y-1">
              <div className="font-semibold text-sky-950">Clients</div>
              <p className="text-slate-600">
                Track created tasks, monitor status, and update escrow offers anytime to attract top builders.
              </p>
            </div>
            <div className="rounded-lg bg-blue-50/70 border border-blue-100 p-4 space-y-1">
              <div className="font-semibold text-blue-950">Sellers</div>
              <p className="text-slate-600">
                View wallet balance, check AI rate badges, track earnings charts, and submit deliverables.
              </p>
            </div>
            <div className="rounded-lg bg-indigo-50/70 border border-indigo-100 p-4 space-y-1">
              <div className="font-semibold text-indigo-950">Admins</div>
              <p className="text-slate-600">
                Review flagged disputes and overdue windows requiring operator approval and split execution.
              </p>
            </div>
          </div>
        </section>
      </div>
    );
  }

  // 2. LOGGED IN AS CLIENT: Created Activities, Status, Date Created, Adjust Price
  if (role === "client") {
    const clientJobs = records.filter(
      (r) => r.job.client === walletAddress || r.job.client === DEMO_WALLETS.client
    );

    const handleSavePrice = (pda: string, currentSol: number) => {
      const rawDraft = priceDrafts[pda];
      const nextVal = rawDraft !== undefined ? parseFloat(rawDraft) : currentSol;
      if (Number.isNaN(nextVal) || nextVal < 0.1) return;
      updateJobPrice(pda, nextVal);
      setPriceSavedNotice(`Updated escrow offer to ${nextVal.toFixed(2)} SOL.`);
      setTimeout(() => setPriceSavedNotice(null), 3000);
    };

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Client Activity Dashboard
            </h1>
            <p className="text-sm text-slate-600">
              Review your created activities, check live status, and raise offers to make tasks more attractive.
            </p>
          </div>
          <Link
            href="/client"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
          >
            + Create New Activity
          </Link>
        </div>

        {priceSavedNotice && (
          <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-xs font-medium text-sky-900">
            {priceSavedNotice}
          </div>
        )}

        <div className="space-y-3">
          {clientJobs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
              No activities created yet. Head to{" "}
              <Link href="/client" className="font-semibold text-indigo-600 hover:underline">
                Client Portal
              </Link>{" "}
              to fund your first job.
            </div>
          ) : (
            clientJobs.map((rec) => {
              const currentSol = rec.job.amount / LAMPORTS_PER_SOL;
              const draftValue = priceDrafts[rec.pda] ?? currentSol.toFixed(2);
              const parsedDraft = parseFloat(draftValue);
              const displaySol =
                !Number.isNaN(parsedDraft) && parsedDraft > 0 ? parsedDraft : currentSol;

              return (
                <div
                  key={rec.pda}
                  className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-slate-400">#{rec.job.jobId}</span>
                        <h2 className="text-base font-semibold text-slate-900">{rec.title}</h2>
                        <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-900">
                          {rec.job.status}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                          Created: {formatJobDate(rec)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600">{rec.description}</p>
                    </div>

                    <div className="text-right">
                      <div className="text-sm font-bold text-slate-900 tabular-nums">
                        {currentSol.toFixed(2)} SOL
                      </div>
                      <div className="text-xs text-slate-500 tabular-nums">
                        ≈ ${(currentSol * solUsdRate).toFixed(2)} USD
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="text-xs font-medium text-slate-700">
                        Adjust Offer (SOL):
                      </label>
                      <input
                        type="number"
                        step="0.05"
                        min="0.1"
                        value={draftValue}
                        onChange={(e) =>
                          setPriceDrafts((prev) => ({ ...prev, [rec.pda]: e.target.value }))
                        }
                        className="w-28 rounded-lg border border-sky-200 bg-sky-50/40 px-2.5 py-1.5 text-xs font-semibold text-slate-900 tabular-nums focus:border-indigo-500 focus:outline-none"
                      />
                      <span className="text-xs text-slate-500 tabular-nums">
                        (≈ ${(displaySol * solUsdRate).toFixed(2)})
                      </span>
                      <button
                        type="button"
                        onClick={() => handleSavePrice(rec.pda, currentSol)}
                        className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700"
                      >
                        Update Price
                      </button>
                    </div>

                    <Link
                      href={`/jobs/${rec.pda}`}
                      className="text-xs font-semibold text-indigo-600 hover:underline"
                    >
                      Inspect Contract →
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

  // 3. LOGGED IN AS SELLER: Wallet Info + Earnings Chart
  if (role === "seller") {
    const totalContractSol = sellerJobs.reduce(
      (sum, r) => sum + r.job.amount / LAMPORTS_PER_SOL,
      0
    );
    const releasedSol = sellerJobs
      .filter((r) => r.job.status === "Released")
      .reduce((sum, r) => sum + r.job.amount / LAMPORTS_PER_SOL, 0);

    const chartItems = sellerJobs.map((rec) => ({
      label: `#${rec.job.jobId}`,
      sol: rec.job.amount / LAMPORTS_PER_SOL,
      released: rec.job.status === "Released",
    }));

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Seller Workspace &amp; Earnings
            </h1>
            <p className="text-sm text-slate-600">
              View your connected wallet details, earnings chart, and AI rate assessments.
            </p>
          </div>
          <Link
            href="/seller"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
          >
            View All Contracts →
          </Link>
        </div>

        {/* Wallet Information Card */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-4 space-y-1">
            <div className="text-xs font-medium text-sky-900">Connected Wallet</div>
            <div className="font-mono text-sm font-semibold text-slate-900 break-all">
              {walletAddress}
            </div>
            <div className="text-[11px] text-slate-500">
              {isWalletConnected ? "Live Devnet Adapter" : "Demo Session Wallet"}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-1">
            <div className="text-xs font-medium text-slate-500">Wallet Balance</div>
            <div className="text-xl font-bold text-indigo-700 tabular-nums">
              {liveWalletSol !== null ? `${liveWalletSol.toFixed(3)} SOL` : "—"}
            </div>
            <div className="text-xs text-slate-500 tabular-nums">
              {liveWalletSol !== null
                ? `≈ $${(liveWalletSol * solUsdRate).toFixed(2)} USD`
                : "Connect wallet for live RPC balance"}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-1">
            <div className="text-xs font-medium text-slate-500">Assigned / Released Volume</div>
            <div className="text-xl font-bold text-slate-900 tabular-nums">
              {releasedSol.toFixed(2)} / {totalContractSol.toFixed(2)} SOL
            </div>
            <div className="text-xs text-slate-500 tabular-nums">
              ≈ ${(releasedSol * solUsdRate).toFixed(2)} USD released
            </div>
          </div>
        </div>

        <SellerEarningsChart items={chartItems} solUsdRate={solUsdRate} />

        <div className="space-y-2.5">
          <h2 className="text-base font-semibold text-slate-900">Assigned Tasks &amp; AI Rate</h2>
          {sellerJobs.map((rec) => {
            const jobSol = rec.job.amount / LAMPORTS_PER_SOL;
            const rate = rateMap[rec.pda];
            const badgeStyle =
              rate?.tier === "very_good"
                ? "bg-indigo-600 text-white border-indigo-600"
                : rate?.tier === "good"
                ? "bg-sky-100 text-sky-900 border-sky-300"
                : "bg-blue-50 text-blue-700 border-blue-200";

            return (
              <div
                key={rec.pda}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-slate-400">#{rec.job.jobId}</span>
                    <span className="text-sm font-semibold text-slate-900">{rec.title}</span>
                    <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-800">
                      {rec.job.status}
                    </span>
                    {rate && (
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${badgeStyle}`}
                      >
                        AI Rate: {rate.label}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">Created: {formatJobDate(rec)}</p>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-slate-900 tabular-nums">
                    {jobSol.toFixed(2)} SOL
                  </span>
                  <Link
                    href={`/jobs/${rec.pda}`}
                    onClick={() => {
                      if (role !== "seller") loginAsDemo("seller");
                    }}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                  >
                    Open →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // 4. LOGGED IN AS ADMIN: Tasks Requiring Approval
  const approvalQueue = records.filter((rec) => {
    const windowSecs = Number(rec.job.disputeWindowSecs) || 300;
    const isOverdue =
      rec.job.status === "Submitted" &&
      rec.job.submittedAt > 0 &&
      nowSecs >= rec.job.submittedAt + windowSecs;
    return rec.job.status === "Disputed" || isOverdue || rec.job.status === "VerdictProposed";
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Admin Approval Queue
          </h1>
          <p className="text-sm text-slate-600">
            Tasks awaiting admin arbitration, dispute approval, or overdue review resolution.
          </p>
        </div>
        <Link
          href="/admin"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
        >
          Full Admin Console →
        </Link>
      </div>

      <div className="space-y-3">
        {approvalQueue.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            No tasks currently require admin approval.
          </div>
        ) : (
          approvalQueue.map((rec) => {
            const jobSol = rec.job.amount / LAMPORTS_PER_SOL;
            return (
              <div
                key={rec.pda}
                className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-slate-400">#{rec.job.jobId}</span>
                    <h2 className="text-base font-semibold text-slate-900">{rec.title}</h2>
                    <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-800">
                      {rec.job.status}
                    </span>
                    <span className="text-xs text-slate-500">Created: {formatJobDate(rec)}</span>
                  </div>
                  <p className="text-xs text-slate-600">{rec.description}</p>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-sm font-bold text-slate-900 tabular-nums">
                      {jobSol.toFixed(2)} SOL
                    </div>
                    <div className="text-xs text-slate-500 tabular-nums">
                      ≈ ${(jobSol * solUsdRate).toFixed(2)} USD
                    </div>
                  </div>
                  <Link
                    href={`/jobs/${rec.pda}`}
                    className="rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    Review &amp; Approve →
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