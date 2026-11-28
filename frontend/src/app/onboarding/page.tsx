"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { usePollar } from "@pollar/react";
import { useSession } from "../../context/SessionContext";

export default function OnboardingPage() {
  const router = useRouter();
  const {
    pollarAddress,
    isPollarVerified,
    completeOnboarding,
    logout,
  } = useSession();
  const { isAuthenticated: isPollarAuthenticated } = usePollar();

  const [selectedRole, setSelectedRole] = useState<"client" | "seller">("client");

  const handleBackAndCancelLogin = () => {
    logout();
    router.push("/login");
  };

  const handleContinue = () => {
    completeOnboarding(selectedRole);
    router.push(selectedRole === "seller" ? "/seller" : "/client");
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">
            Step 2 of 2 · Onboarding
          </span>
          {isPollarAuthenticated && (
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                isPollarVerified
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-amber-100 text-amber-800"
              }`}
            >
              {isPollarVerified ? "Pollar Verified" : "Pollar Session Active"}
            </span>
          )}
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Complete Your ProofPay Profile
        </h1>
        <p className="text-sm text-slate-600">
          Review your profile details and choose whether you are joining as a Customer or a Seller.
        </p>
        {pollarAddress && (
          <p className="font-mono text-xs text-slate-500 break-all">
            Wallet ID: {pollarAddress}
          </p>
        )}
      </div>

      {/* Grayed-Out Personal Details Section (Demo Mode) */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-5 space-y-4 opacity-80">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-700">
              Personal Details
            </h2>
            <p className="text-xs text-slate-500">
              Profile fields are grayed out and pre-configured for the demo.
            </p>
          </div>
          <span className="rounded-full border border-slate-300 bg-slate-200/70 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
            Demo Locked
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-slate-400">
              Full Name
            </label>
            <input
              type="text"
              disabled
              value="Demo User (Pollar Verified)"
              className="mt-1 w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400">
              Email / Contact
            </label>
            <input
              type="email"
              disabled
              value="demo.user@proofpay.dev"
              className="mt-1 w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400">
              Display Handle
            </label>
            <input
              type="text"
              disabled
              value="@pollar_devnet_member"
              className="mt-1 w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400">
              Time Zone / Region
            </label>
            <input
              type="text"
              disabled
              value="Asia/Kuala_Lumpur (UTC+08:00)"
              className="mt-1 w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-400"
            />
          </div>
        </div>
      </div>

      {/* Role Choice at the Bottom: Seller or Customer */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            How do you want to use ProofPay?
          </h2>
          <p className="text-xs text-slate-600">
            Select whether you are signing up as a Customer (Client) or a Seller (Freelancer).
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setSelectedRole("client")}
            className={`rounded-xl border p-4 text-left transition space-y-1 ${
              selectedRole === "client"
                ? "border-blue-600 bg-blue-50/60 ring-1 ring-blue-600"
                : "border-slate-200 bg-white hover:border-blue-300"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-slate-900">
                Customer (Client)
              </span>
              {selectedRole === "client" && (
                <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                  Selected
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600">
              Create specs, fund escrow contracts with Pollar, approve work, or raise disputes.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setSelectedRole("seller")}
            className={`rounded-xl border p-4 text-left transition space-y-1 ${
              selectedRole === "seller"
                ? "border-indigo-600 bg-indigo-50/60 ring-1 ring-indigo-600"
                : "border-slate-200 bg-white hover:border-indigo-300"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-slate-900">
                Seller (Freelancer)
              </span>
              {selectedRole === "seller" && (
                <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                  Selected
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600">
              Review AI rate benchmarks, submit deliverables, trigger AI evaluation, and receive payouts.
            </p>
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 pt-2">
          <button
            type="button"
            onClick={handleBackAndCancelLogin}
            className="text-xs font-semibold text-slate-500 hover:text-red-600 transition"
          >
            ← Back (Cancel Login)
          </button>

          <button
            type="button"
            onClick={handleContinue}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-blue-700 transition"
          >
            Continue as {selectedRole === "seller" ? "Seller" : "Customer"} →
          </button>
        </div>
      </div>
    </div>
  );
}