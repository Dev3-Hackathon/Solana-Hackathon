"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePollar, WalletButton } from "@pollar/react";
import { useSession } from "../../context/SessionContext";

function formatDateTimeStamp(date: Date): string {
  return new Intl.DateTimeFormat("en-MY", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date);
}

export default function LoginPage() {
  const router = useRouter();
  const {
    role,
    pollarAddress,
    isPollarVerified,
    hasCompletedOnboarding,
    logout,
  } = useSession();

  const {
    isAuthenticated: isPollarAuthenticated,
    wallet: pollarWallet,
    wallets: pollarWallets,
    hasWallet,
    createWallet,
    login: pollarLogin,
    openReceiveModal,
  } = usePollar();

  const [pollarError, setPollarError] = useState<string | null>(null);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [creatingWallet, setCreatingWallet] = useState(false);
  const [walletTimestamp, setWalletTimestamp] = useState<Date | null>(null);

  const solanaPollarWallet = Array.isArray(pollarWallets)
    ? pollarWallets.find((w) => w.chain === "SOLANA")
    : undefined;
  const activePollarAddress =
    solanaPollarWallet?.address ?? pollarWallet?.address ?? pollarAddress ?? null;

  useEffect(() => {
    if (!activePollarAddress) {
      setWalletTimestamp(null);
      return;
    }

    setWalletTimestamp(new Date());

    if (!hasCompletedOnboarding || !role) {
      router.replace("/onboarding");
    }
  }, [activePollarAddress, hasCompletedOnboarding, role, router]);

  const handleDisconnectPollar = () => {
    setWalletTimestamp(null);
    setPollarError(null);
    logout();
  };

  const triggerPollarProviderLogin = (provider: "google" | "email") => {
    setPollarError(null);
    try {
      const result = pollarLogin({ provider }) as unknown | Promise<unknown>;
      if (result && typeof (result as Promise<unknown>).catch === "function") {
        (result as Promise<unknown>).catch((err: unknown) => {
          setPollarError(
            err instanceof Error
              ? err.message
              : `Pollar ${provider} sign-in failed.`
          );
        });
      }
    } catch (err) {
      setPollarError(
        err instanceof Error
          ? err.message
          : `Pollar ${provider} sign-in failed.`
      );
    }
  };

  const handleCreatePollarWallet = async () => {
    setPollarError(null);
    setCreatingWallet(true);
    try {
      await createWallet();
      setWalletTimestamp(new Date());
      router.replace("/onboarding");
    } catch (err) {
      setPollarError(
        err instanceof Error ? err.message : "Could not create Pollar wallet."
      );
    } finally {
      setCreatingWallet(false);
    }
  };

  const handleCopyPollarAddress = async () => {
    if (!activePollarAddress) return;
    await navigator.clipboard.writeText(activePollarAddress);
    setCopiedAddress(true);
    setTimeout(() => setCopiedAddress(false), 2000);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1">
        <span className="inline-block rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">
          Step 1 of 2 · Sign In
        </span>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Connect Pollar Wallet
        </h1>
        <p className="text-sm text-slate-600">
          Sign in with Pollar to continue to onboarding and choose Customer or Seller.
        </p>
      </div>

      {/* Pollar Social / Embedded Wallet Box */}
      <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-5 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-slate-900">
                Pollar Embedded Solana Wallet
              </span>
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-800">
                Customer &amp; Seller Ready
              </span>
              {isPollarAuthenticated && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    isPollarVerified
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {isPollarVerified ? "Verified" : "Unverified"}
                </span>
              )}
            </div>

            {activePollarAddress ? (
              <div className="space-y-1">
                <p className="text-xs font-medium text-emerald-700">
                  Provisioned Address:{" "}
                  <span className="font-mono break-all">{activePollarAddress}</span>
                </p>
                <p className="text-[11px] text-slate-500">
                  Redirecting to onboarding...
                </p>
                {walletTimestamp && (
                  <p className="text-[11px] font-medium text-slate-600 tabular-nums">
                    Session timestamp: {formatDateTimeStamp(walletTimestamp)}
                  </p>
                )}
              </div>
            ) : isPollarAuthenticated ? (
              <p className="text-xs text-amber-700 font-medium">
                {hasWallet
                  ? "Authenticated — resolving Solana wallet address..."
                  : "Signed in with no wallet yet — click Create Wallet or use the Pollar button."}
              </p>
            ) : (
              <p className="text-xs text-slate-600">
                No browser extension required · Takes you to onboarding to pick Customer or Seller
              </p>
            )}
          </div>

          <WalletButton />
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {!isPollarAuthenticated ? (
            <>
              <button
                type="button"
                onClick={() => triggerPollarProviderLogin("google")}
                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition"
              >
                Continue with Google
              </button>
              <button
                type="button"
                onClick={() => triggerPollarProviderLogin("email")}
                className="rounded-lg border border-blue-300 bg-white px-3.5 py-2 text-xs font-semibold text-blue-900 hover:bg-blue-50 transition"
              >
                Email Login
              </button>
            </>
          ) : (
            <>
              {!activePollarAddress && (
                <button
                  type="button"
                  disabled={creatingWallet}
                  onClick={handleCreatePollarWallet}
                  className="rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {creatingWallet ? "Creating Wallet..." : "Create Wallet"}
                </button>
              )}
              {activePollarAddress && (
                <>
                  <button
                    type="button"
                    onClick={handleCopyPollarAddress}
                    className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {copiedAddress ? "Copied!" : "Copy Address"}
                  </button>
                  <button
                    type="button"
                    onClick={() => openReceiveModal()}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                  >
                    Receive / QR
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={handleDisconnectPollar}
                className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
              >
                Disconnect
              </button>
            </>
          )}
        </div>

        {pollarError && (
          <p className="text-xs font-medium text-red-600">{pollarError}</p>
        )}
      </div>
    </div>
  );
}