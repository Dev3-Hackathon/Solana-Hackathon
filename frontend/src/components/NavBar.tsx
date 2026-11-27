"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "../context/SessionContext";
import { fetchBackendHealth } from "../lib/api";

const DUMMY_ARBITER_SOL = 0.42;

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { role, walletAddress, logout } = useSession();
  const [arbiterSol, setArbiterSol] = useState<number>(DUMMY_ARBITER_SOL);
  const [isLiveHealth, setIsLiveHealth] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    fetchBackendHealth().then((health) => {
      if (!active) return;
      if (typeof health?.arbiterBalanceSol === "number") {
        setArbiterSol(health.arbiterBalanceSol);
        setIsLiveHealth(true);
      } else {
        setArbiterSol(DUMMY_ARBITER_SOL);
        setIsLiveHealth(false);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const navLinks = [
    { href: "/client", label: "Client Portal" },
    { href: "/seller", label: "Seller Portal" },
    { href: "/admin", label: "Admin Console" },
  ];

  const isArbiterLow = arbiterSol < 0.05;

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
              P
            </span>
            <span className="font-semibold tracking-tight text-slate-900">
              ProofPay
            </span>
          </Link>

          <nav className="flex items-center gap-1">
            {navLinks.map((link) => {
              const active = pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                    active
                      ? "bg-indigo-50 text-indigo-700"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2.5">
          <span
            className={`inline-block rounded-full border px-2.5 py-1 text-xs font-medium tabular-nums ${
              isArbiterLow
                ? "border-red-300 bg-red-50 text-red-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-800"
            }`}
            title={
              isLiveHealth
                ? "Live Backend Arbiter Relayer SOL Balance"
                : "Dummy Arbiter Balance (Backend offline)"
            }
          >
            Arbiter: {arbiterSol.toFixed(3)} SOL
            {isArbiterLow ? " (Low!)" : !isLiveHealth ? " · Mock" : ""}
          </span>

          <span className="hidden rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 sm:inline-block">
            Devnet · Mock Preview
          </span>

          {role && walletAddress ? (
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs">
              <span className="font-semibold capitalize text-indigo-700">
                {role}
              </span>
              <span className="font-mono text-slate-500">
                {walletAddress.slice(0, 4)}...{walletAddress.slice(-4)}
              </span>
              <button
                type="button"
                onClick={() => {
                  logout();
                  router.push("/login");
                }}
                className="ml-1 font-medium text-red-600 hover:underline"
              >
                Switch
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
            >
              Connect / Login
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}