"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { usePollar } from "@pollar/react";
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
  const { role, walletAddress, isPollarConnected, isReady, logout } = useSession();
  const { openReceiveModal } = usePollar();
  const [arbiterSol, setArbiterSol] = useState<number>(DUMMY_ARBITER_SOL);
  const [isLiveHealth, setIsLiveHealth] = useState<boolean>(false);
  const [showAdminDemoModal, setShowAdminDemoModal] = useState<boolean>(false);

  const homeHref = "/";

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
      <header className="sticky top-0 z-20 border-b border-blue-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link
              href={homeHref}
              aria-label="ProofPay Home"
              className="group flex items-center gap-2.5 focus:outline-none"
            >
              <ProofPayLogoMark />
              <span className="font-semibold tracking-tight text-slate-900 group-hover:text-blue-700 transition">
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
                      className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                        active
                          ? "bg-blue-50 text-blue-700"
                          : "text-slate-600 hover:bg-blue-50/70 hover:text-blue-950"
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
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                      active
                        ? "bg-blue-50 text-blue-700"
                        : "text-slate-600 hover:bg-blue-50/70 hover:text-blue-950"
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
              Devnet · Pollar
            </span>

            {isReady && role && walletAddress ? (
              <div className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50/50 px-3 py-1.5 text-xs">
                <span className="font-semibold capitalize text-blue-700">
                  {role}
                </span>
                {isPollarConnected && (
                  <span className="rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    Pollar
                  </span>
                )}
                <span className="font-mono text-slate-500">
                  {walletAddress.slice(0, 4)}...{walletAddress.slice(-4)}
                </span>
                {isPollarConnected && (
                  <button
                    type="button"
                    onClick={() => openReceiveModal()}
                    className="font-medium text-blue-700 hover:underline"
                  >
                    Receive
                  </button>
                )}
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
                className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
              >
                Connect / Login
              </Link>
            )}
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