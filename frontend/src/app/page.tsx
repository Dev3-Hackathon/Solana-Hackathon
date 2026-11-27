"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "../context/SessionContext";

export default function HomePage() {
  const router = useRouter();
  const { role, isReady } = useSession();

  useEffect(() => {
    if (isReady && role) {
      router.replace(`/${role}`);
    }
  }, [isReady, role, router]);

  return (
    <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xs">
      <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
        Solana Escrow + AI Arbitration
      </span>
      <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900">
        Trustless Freelance Escrow with Automated Verdict &amp; Dispute Protection
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        Funds are locked in a non-custodial Solana PDA. If the AI Arbiter does not post a verdict within the review timeout, either party can escalate to dispute—ensuring funds are never stuck.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/login"
          className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
        >
          Choose Role / Sign In
        </Link>
        <Link
          href="/client"
          className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Explore Client Portal
        </Link>
      </div>
    </div>
  );
}