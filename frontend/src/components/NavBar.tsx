"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { WalletButton } from "@pollar/react";
import { useSession } from "../context/SessionContext";
import { fetchBackendHealth } from "../lib/api";

const DUMMY_ARBITER_SOL = 0.42;

function ProofPayLogoMark() {
  return (
    <span className="inline-flex h-8 w-8 shrink-0 overflow-hidden rounded-lg border border-blue-200/80 shadow-xs transition group-hover:brightness-105">
      <img
        src="/logo/proofpay_logo.png"
        alt="ProofPay logo"
        className="h-full w-full object-cover"
      />
    </span>
  );
}

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { role, walletAddress, isPollarConnected, isReady, switchRole } = useSession();
  const [arbiterSol, setArbiterSol] = useState<number>(DUMMY_ARBITER_SOL);
  const [isLiveHealth, setIsLiveHealth] = useState<boolean>(false);
  const [showAdminDemoModal, setShowAdminDemoModal] = useState<boolean>(false);

  const isOnboardingPage = pathname === "/onboarding";

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
    { href: "/client", label: "Client Portal", adminOnly: false },
    { href: "/seller", label: "Seller Portal", adminOnly: false },
    { href: "/admin", label: "Admin Console", adminOnly: true },
  ];

  const isArbiterLow = arbiterSol < 0.05;

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2.5">
          {/* Left: Brand + Primary Navigation */}
          <div className="flex min-w-0 items-center gap-6">
            <Link
              href="/"
              aria-label="ProofPay Home"
              className="group flex shrink-0 items-center gap-2 focus:outline-none"
            >
              <ProofPayLogoMark />
              <span className="text-base font-semibold tracking-tight text-slate-900 group-hover:text-blue-700 transition">
                ProofPay
              </span>
            </Link>

            <nav className="flex items-center gap-1">
              {navLinks.map((link) => {
                const active = pathname.startsWith(link.href);

                if (link.adminOnly && isReady && role !== "admin") {
                  return (
                    <button
                      key={link.href}
                      type="button"
                      onClick={() => setShowAdminDemoModal(true)}
                      className={`h-9 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition ${
                        active
                          ? "bg-blue-50 text-blue-700"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      }`}
                    >
                      {link.label}
                    </button>
                  );
                }

                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`inline-flex h-9 items-center whitespace-nowrap rounded-lg px-3 text-sm font-medium transition ${
                      active
                        ? "bg-blue-50 text-blue-700"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right: Uniform h-9 Status + Pollar Wallet + Role */}
          <div className="flex shrink-0 items-center gap-2">
            {!isOnboardingPage && (
              <span
                className={`hidden h-9 whitespace-nowrap rounded-lg border px-3 text-xs font-medium tabular-nums lg:inline-flex items-center gap-1.5 ${
                  isArbiterLow
                    ? "border-red-200 bg-red-50 text-red-700"
                    : "border-slate-200 bg-slate-50 text-slate-600"
                }`}
                title={
                  isLiveHealth
                    ? "Live Backend Arbiter Relayer SOL Balance"
                    : "Dummy Arbiter Balance (Backend offline)"
                }
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isArbiterLow
                      ? "bg-red-500"
                      : isLiveHealth
                      ? "bg-emerald-500"
                      : "bg-amber-400"
                  }`}
                />
                Arbiter {arbiterSol.toFixed(2)} SOL
              </span>
            )}

            {isPollarConnected && (
              <div className="inline-flex h-9 items-center [&_button]:!h-9 [&_button]:!min-h-0 [&_button]:!rounded-lg [&_button]:!px-3 [&_button]:!py-0 [&_button]:!text-xs [&_button]:!font-semibold [&_button]:!leading-none">
                <WalletButton />
              </div>
            )}

            {isReady && role && walletAddress ? (
              <div className="inline-flex h-9 items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50/90 px-3 text-xs">
                <span className="font-semibold capitalize text-slate-800">
                  {role}
                </span>
                <span className="h-3.5 w-px bg-slate-200" />
                <button
                  type="button"
                  onClick={() => {
                    switchRole();
                    router.push("/login");
                  }}
                  className="font-medium text-blue-600 hover:text-blue-800 hover:underline"
                >
                  Switch
                </button>
              </div>
            ) : !isOnboardingPage ? (
              <Link
                href="/login"
                className="inline-flex h-9 items-center whitespace-nowrap rounded-lg bg-blue-600 px-3.5 text-xs font-semibold text-white hover:bg-blue-700 transition"
              >
                Connect / Login
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      {showAdminDemoModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-2xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-demo-modal-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-blue-200 bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">
                Admin Console Notice
              </span>
              <button
                type="button"
                onClick={() => setShowAdminDemoModal(false)}
                className="text-xs font-semibold text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <h2
              id="admin-demo-modal-title"
              className="text-base font-bold text-slate-900"
            >
              Demo Restriction
            </h2>

            <p className="text-sm leading-relaxed text-slate-700">
              This feature is only visible on the demo version and will not be
              visible to versions published
            </p>

            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowAdminDemoModal(false)}
                className="rounded-lg border border-blue-200 bg-white px-4 py-2 text-xs font-semibold text-blue-900 hover:bg-blue-50"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAdminDemoModal(false);
                  router.push("/admin");
                }}
                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
              >
                Open Demo Admin Anyway →
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}