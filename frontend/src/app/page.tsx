"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useConnection } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { useJobs } from "../context/JobContext";
import { DEMO_WALLETS, useSession } from "../context/SessionContext";
import { evaluateSellerRate, SellerRateAssessment } from "../lib/api";

const FALLBACK_SOL_USD = 150;

type EarningsPreset = "all" | "1m" | "3m" | "6m" | "1y";

const PRESET_OPTIONS: { id: EarningsPreset; label: string; days: number | null }[] = [
  { id: "1m", label: "Last Month", days: 30 },
  { id: "3m", label: "Last 3 Months", days: 90 },
  { id: "6m", label: "Last 6 Months", days: 180 },
  { id: "1y", label: "Last Year", days: 365 },
  { id: "all", label: "All Time", days: null },
];

interface SellerChartItem {
  id: string;
  label: string;
  dateLabel: string;
  timestampSecs: number;
  sol: number;
  released: boolean;
}

function resolveJobTimestampSecs(rec: {
  job: { submittedAt: number; deadline: number; jobId: number };
}): number {
  if (rec.job.submittedAt > 0) return rec.job.submittedAt;
  if (rec.job.deadline > 86400) return rec.job.deadline - 86400;
  // Deterministic fallback dates anchored near late 2026 so presets filter meaningfully
  const anchorSecs = 1764288000; // Nov 27, 2026
  const idxOffset = Math.max(0, (Number(rec.job.jobId) || 100) - 100);
  const spreadDays = [5, 22, 48, 95, 160, 250];
  const daysAgo = spreadDays[idxOffset % spreadDays.length] + idxOffset * 7;
  return anchorSecs - daysAgo * 86400;
}

function formatJobDate(rec: {
  job: { submittedAt: number; deadline: number; jobId: number };
}): string {
  const secs = resolveJobTimestampSecs(rec);
  return new Date(secs * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatAxisDate(secs: number): string {
  return new Date(secs * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function SellerEarningsChart({
  items,
  solUsdRate,
  preset,
  onPresetChange,
  earnedInRangeSol,
}: {
  items: SellerChartItem[];
  solUsdRate: number;
  preset: EarningsPreset;
  onPresetChange: (next: EarningsPreset) => void;
  earnedInRangeSol: number;
}) {
  const maxSol = Math.max(1, ...items.map((i) => i.sol));
  const width = 580;
  const height = 180;
  const padX = 40;
  const padTop = 20;
  const padBottom = 30;
  const plotW = width - padX * 2;
  const plotH = height - padTop - padBottom;

  const activePresetLabel =
    PRESET_OPTIONS.find((p) => p.id === preset)?.label ?? "All Time";

  const points = items.map((item, idx) => {
    const x =
      items.length === 1
        ? padX + plotW / 2
        : padX + (idx / (items.length - 1)) * plotW;
    const y = padTop + plotH - (item.sol / maxSol) * plotH;
    return { ...item, x, y };
  });

  const linePath = points
    .map(
      (pt, idx) => `${idx === 0 ? "M" : "L"} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`
    )
    .join(" ");

  const areaPath =
    points.length > 0
      ? `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${(
          padTop + plotH
        ).toFixed(1)} L ${points[0].x.toFixed(1)} ${(padTop + plotH).toFixed(1)} Z`
      : "";

  return (
    <div className="rounded-xl border border-blue-100 bg-white p-5 shadow-xs space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-slate-900">
            Earnings Over Time
          </h2>
          <p className="text-xs text-slate-600">
            Contract payout curve by date across your assigned escrows.
          </p>
        </div>

        {/* Earned value for the selected timeframe */}
        <div className="rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-2.5 text-right">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-800">
            Earned ({activePresetLabel})
          </div>
          <div className="text-lg font-bold text-blue-950 tabular-nums">
            {earnedInRangeSol.toFixed(2)} SOL
          </div>
          <div className="text-xs text-blue-800/80 tabular-nums">
            ≈ ${(earnedInRangeSol * solUsdRate).toFixed(2)} USD
          </div>
        </div>
      </div>

      {/* Preset timeframe buttons + legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-blue-50 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {PRESET_OPTIONS.map((opt) => {
            const active = preset === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onPresetChange(opt.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  active
                    ? "bg-blue-600 text-white shadow-2xs"
                    : "border border-blue-200 bg-blue-50/40 text-blue-900 hover:bg-blue-100/70"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-4 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-700" />
            Released
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-sky-400" />
            In Escrow
          </span>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-blue-200 bg-blue-50/30 p-6 text-center text-xs text-slate-500">
          No assigned contracts in {activePresetLabel.toLowerCase()}.
        </div>
      ) : (
        <div className="w-full overflow-x-auto">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-44 w-full min-w-[380px]"
            role="img"
            aria-label="Seller earnings line graph by date"
          >
            <defs>
              <linearGradient id="proofpayBlueArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2563eb" stopOpacity="0.24" />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.02" />
              </linearGradient>
            </defs>

            {[0, 0.5, 1].map((ratio) => {
              const y = padTop + plotH * (1 - ratio);
              return (
                <g key={ratio}>
                  <line
                    x1={padX}
                    y1={y}
                    x2={width - padX}
                    y2={y}
                    stroke="#dbeafe"
                    strokeDasharray="3 3"
                  />
                  <text
                    x={padX - 8}
                    y={y + 3}
                    textAnchor="end"
                    className="fill-slate-400 text-[10px] tabular-nums"
                  >
                    {(maxSol * ratio).toFixed(1)}
                  </text>
                </g>
              );
            })}

            {areaPath && <path d={areaPath} fill="url(#proofpayBlueArea)" />}

            {points.length > 1 && (
              <path
                d={linePath}
                fill="none"
                stroke="#2563eb"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {points.map((pt) => (
              <g key={pt.id}>
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r="4.5"
                  fill={pt.released ? "#1d4ed8" : "#38bdf8"}
                  stroke="#ffffff"
                  strokeWidth="1.5"
                >
                  <title>
                    {`${pt.dateLabel} (${pt.label}): ${pt.sol.toFixed(2)} SOL (≈ $${(
                      pt.sol * solUsdRate
                    ).toFixed(2)})`}
                  </title>
                </circle>
                <text
                  x={pt.x}
                  y={pt.y - 9}
                  textAnchor="middle"
                  className="fill-blue-950 text-[10px] font-semibold tabular-nums"
                >
                  {pt.sol.toFixed(2)}
                </text>
                <text
                  x={pt.x}
                  y={height - 8}
                  textAnchor="middle"
                  className="fill-slate-500 text-[10px]"
                >
                  {pt.dateLabel}
                </text>
              </g>
            ))}
          </svg>
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

  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [priceSavedNotice, setPriceSavedNotice] = useState<string | null>(null);
  const [rateMap, setRateMap] = useState<Record<string, SellerRateAssessment>>({});
  const [preset, setPreset] = useState<EarningsPreset>("all");

  useEffect(() => {
    setNowSecs(Math.floor(Date.now() / 1000));
    const t = setInterval(
      () => setNowSecs(Math.floor(Date.now() / 1000)),
      1000
    );
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let active = true;
    fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd"
    )
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
        r.job.freelancer === activeSeller ||
        r.job.freelancer === DEMO_WALLETS.seller
    );
  }, [records, role, walletAddress]);

  const filteredSellerJobs = useMemo(() => {
    const option = PRESET_OPTIONS.find((p) => p.id === preset);
    if (!option || option.days === null) return sellerJobs;
    const referenceNow = nowSecs > 0 ? nowSecs : 1764288000;
    const cutoffSecs = referenceNow - option.days * 86400;
    return sellerJobs.filter(
      (rec) => resolveJobTimestampSecs(rec) >= cutoffSecs
    );
  }, [sellerJobs, preset, nowSecs]);

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

  if (!isLoggedIn) {
    return (
      <div className="space-y-12 pb-8">
        <section className="rounded-2xl border border-blue-200 bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-50 p-8 shadow-xs space-y-5">
          <span className="inline-block rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">
            Solana Devnet · AI-Verified Escrow
          </span>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl max-w-2xl">
            Milestone escrows settled by verifiable specs and AI evaluation.
          </h1>
          <p className="text-sm leading-relaxed text-slate-600 max-w-2xl">
            ProofPay locks funds in deterministic Solana Program Derived Addresses
            (PDAs), benchmarks fair pricing upfront, and grades deliverables
            against hashed acceptance criteria.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Link
              href="/login"
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-blue-700"
            >
              Sign Up / Login
            </Link>
            <a
              href="#how-it-works"
              className="rounded-lg border border-blue-200 bg-white px-4 py-2.5 text-sm font-semibold text-blue-900 hover:bg-blue-50"
            >
              Learn More Below ↓
            </a>
          </div>
        </section>

        <section id="how-it-works" className="space-y-4 scroll-mt-20">
          <h2 className="text-xl font-bold text-slate-900">How ProofPay Works</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-blue-100 bg-white p-5 shadow-xs space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-sky-700">
                01 · Fund &amp; Price
              </div>
              <h3 className="text-base font-semibold text-slate-900">
                Fair Scope &amp; Vault Lock
              </h3>
              <p className="text-xs leading-relaxed text-slate-600">
                Clients benchmark fair SOL rates, hash acceptance criteria, and
                lock funds in a PDA escrow vault without custodial middlemen.
              </p>
            </div>

            <div className="rounded-xl border border-blue-100 bg-white p-5 shadow-xs space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                02 · Deliver &amp; Grade
              </div>
              <h3 className="text-base font-semibold text-slate-900">
                AI Arbiter Verification
              </h3>
              <p className="text-xs leading-relaxed text-slate-600">
                Sellers submit deliverables for structured AI evaluation against
                the recorded spec, with a per-job dispute window if reviews
                stall.
              </p>
            </div>

            <div className="rounded-xl border border-blue-100 bg-white p-5 shadow-xs space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                03 · Settle or Arbitrate
              </div>
              <h3 className="text-base font-semibold text-slate-900">
                Instant Release or Split
              </h3>
              <p className="text-xs leading-relaxed text-slate-600">
                Approved jobs release payouts directly to the seller; disputed or
                timed-out jobs route cleanly to admin split arbitration.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-blue-100 bg-white p-6 shadow-xs space-y-4">
          <h2 className="text-lg font-bold text-slate-900">Built for Every Role</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 text-xs">
            <div className="rounded-lg bg-sky-50/80 border border-sky-100 p-4 space-y-1">
              <div className="font-semibold text-sky-950">Clients</div>
              <p className="text-slate-600">
                Track created tasks, monitor status, and update escrow offers
                anytime to attract top builders.
              </p>
            </div>
            <div className="rounded-lg bg-blue-50/80 border border-blue-100 p-4 space-y-1">
              <div className="font-semibold text-blue-950">Sellers</div>
              <p className="text-slate-600">
                View wallet balance, check AI rate badges, track earnings
                charts, and submit deliverables.
              </p>
            </div>
            <div className="rounded-lg bg-indigo-50/80 border border-indigo-100 p-4 space-y-1">
              <div className="font-semibold text-indigo-950">Admins</div>
              <p className="text-slate-600">
                Review flagged disputes and overdue windows requiring operator
                approval and split execution.
              </p>
            </div>
          </div>
        </section>
      </div>
    );
  }

  if (role === "client") {
    const clientJobs = records.filter(
      (r) =>
        r.job.client === walletAddress || r.job.client === DEMO_WALLETS.client
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
              Review your created activities, check live status, and raise offers
              to make tasks more attractive.
            </p>
          </div>
          <Link
            href="/client"
            className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
          >
            + Create New Activity
          </Link>
        </div>

        {priceSavedNotice && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs font-medium text-blue-950">
            {priceSavedNotice}
          </div>
        )}

        <div className="space-y-3">
          {clientJobs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-blue-200 bg-white p-8 text-center text-sm text-slate-500">
              No activities created yet. Head to{" "}
              <Link
                href="/client"
                className="font-semibold text-blue-600 hover:underline"
              >
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
                !Number.isNaN(parsedDraft) && parsedDraft > 0
                  ? parsedDraft
                  : currentSol;

              return (
                <div
                  key={rec.pda}
                  className="rounded-xl border border-blue-100 bg-white p-5 shadow-xs space-y-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-slate-400">
                          #{rec.job.jobId}
                        </span>
                        <h2 className="text-base font-semibold text-slate-900">
                          {rec.title}
                        </h2>
                        <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-900">
                          {rec.job.status}
                        </span>
                        <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-800">
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

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-blue-50 pt-3">
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
                          setPriceDrafts((prev) => ({
                            ...prev,
                            [rec.pda]: e.target.value,
                          }))
                        }
                        className="w-28 rounded-lg border border-blue-200 bg-blue-50/40 px-2.5 py-1.5 text-xs font-semibold text-slate-900 tabular-nums focus:border-blue-600 focus:outline-none"
                      />
                      <span className="text-xs text-slate-500 tabular-nums">
                        (≈ ${(displaySol * solUsdRate).toFixed(2)})
                      </span>
                      <button
                        type="button"
                        onClick={() => handleSavePrice(rec.pda, currentSol)}
                        className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                      >
                        Update Price
                      </button>
                    </div>

                    <Link
                      href={`/jobs/${rec.pda}`}
                      className="text-xs font-semibold text-blue-600 hover:underline"
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

  if (role === "seller") {
    const totalContractSol = filteredSellerJobs.reduce(
      (sum, r) => sum + r.job.amount / LAMPORTS_PER_SOL,
      0
    );
    const earnedInRangeSol = filteredSellerJobs
      .filter((r) => r.job.status === "Released")
      .reduce((sum, r) => sum + r.job.amount / LAMPORTS_PER_SOL, 0);

    const chartItems: SellerChartItem[] = [...filteredSellerJobs]
      .sort((a, b) => resolveJobTimestampSecs(a) - resolveJobTimestampSecs(b))
      .map((rec) => {
        const ts = resolveJobTimestampSecs(rec);
        return {
          id: rec.pda,
          label: `#${rec.job.jobId}`,
          dateLabel: formatAxisDate(ts),
          timestampSecs: ts,
          sol: rec.job.amount / LAMPORTS_PER_SOL,
          released: rec.job.status === "Released",
        };
      });

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Seller Workspace &amp; Earnings
            </h1>
            <p className="text-sm text-slate-600">
              View your connected wallet details, earnings chart, and AI rate
              assessments.
            </p>
          </div>
          <Link
            href="/seller"
            className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
          >
            View All Contracts →
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 space-y-1">
            <div className="text-xs font-medium text-blue-950">
              Connected Wallet
            </div>
            <div className="font-mono text-sm font-semibold text-slate-900 break-all">
              {walletAddress}
            </div>
            <div className="text-[11px] text-slate-500">
              {isWalletConnected ? "Live Devnet Adapter" : "Demo Session Wallet"}
            </div>
          </div>

          <div className="rounded-xl border border-blue-100 bg-white p-4 space-y-1">
            <div className="text-xs font-medium text-slate-500">
              Wallet Balance
            </div>
            <div className="text-xl font-bold text-blue-700 tabular-nums">
              {liveWalletSol !== null ? `${liveWalletSol.toFixed(3)} SOL` : "—"}
            </div>
            <div className="text-xs text-slate-500 tabular-nums">
              {liveWalletSol !== null
                ? `≈ $${(liveWalletSol * solUsdRate).toFixed(2)} USD`
                : "Connect wallet for live RPC balance"}
            </div>
          </div>

          <div className="rounded-xl border border-blue-100 bg-white p-4 space-y-1">
            <div className="text-xs font-medium text-slate-500">
              Released / Total in Window
            </div>
            <div className="text-xl font-bold text-slate-900 tabular-nums">
              {earnedInRangeSol.toFixed(2)} / {totalContractSol.toFixed(2)} SOL
            </div>
            <div className="text-xs text-slate-500 tabular-nums">
              ≈ ${(earnedInRangeSol * solUsdRate).toFixed(2)} USD earned
            </div>
          </div>
        </div>

        <SellerEarningsChart
          items={chartItems}
          solUsdRate={solUsdRate}
          preset={preset}
          onPresetChange={setPreset}
          earnedInRangeSol={earnedInRangeSol}
        />

        <div className="space-y-2.5">
          <h2 className="text-base font-semibold text-slate-900">
            Assigned Tasks &amp; AI Rate ({filteredSellerJobs.length})
          </h2>
          {filteredSellerJobs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-blue-200 bg-white p-6 text-center text-xs text-slate-500">
              No assigned tasks in this timeframe.
            </div>
          ) : (
            filteredSellerJobs.map((rec) => {
              const jobSol = rec.job.amount / LAMPORTS_PER_SOL;
              const rate = rateMap[rec.pda];
              const badgeStyle =
                rate?.tier === "very_good"
                  ? "bg-blue-700 text-white border-blue-700"
                  : rate?.tier === "good"
                  ? "bg-sky-100 text-sky-900 border-sky-300"
                  : "bg-blue-50 text-blue-700 border-blue-200";

              return (
                <div
                  key={rec.pda}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-white p-4 shadow-xs"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-slate-400">
                        #{rec.job.jobId}
                      </span>
                      <span className="text-sm font-semibold text-slate-900">
                        {rec.title}
                      </span>
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
                    <p className="text-xs text-slate-500">
                      Date: {formatJobDate(rec)}
                    </p>
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
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                    >
                      Open →
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

  const approvalQueue = records.filter((rec) => {
    const windowSecs = Number(rec.job.disputeWindowSecs) || 300;
    const isOverdue =
      nowSecs > 0 &&
      rec.job.status === "Submitted" &&
      rec.job.submittedAt > 0 &&
      nowSecs >= rec.job.submittedAt + windowSecs;
    return (
      rec.job.status === "Disputed" ||
      isOverdue ||
      rec.job.status === "VerdictProposed"
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Admin Approval Queue
          </h1>
          <p className="text-sm text-slate-600">
            Tasks awaiting admin arbitration, dispute approval, or overdue
            review resolution.
          </p>
        </div>
        <Link
          href="/admin"
          className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
        >
          Full Admin Console →
        </Link>
      </div>

      <div className="space-y-3">
        {approvalQueue.length === 0 ? (
          <div className="rounded-xl border border-dashed border-blue-200 bg-white p-8 text-center text-sm text-slate-500">
            No tasks currently require admin approval.
          </div>
        ) : (
          approvalQueue.map((rec) => {
            const jobSol = rec.job.amount / LAMPORTS_PER_SOL;
            return (
              <div
                key={rec.pda}
                className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-blue-100 bg-white p-5 shadow-xs"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-slate-400">
                      #{rec.job.jobId}
                    </span>
                    <h2 className="text-base font-semibold text-slate-900">
                      {rec.title}
                    </h2>
                    <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-900">
                      {rec.job.status}
                    </span>
                    <span className="text-xs text-slate-500">
                      Created: {formatJobDate(rec)}
                    </span>
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
                    className="rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-800"
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