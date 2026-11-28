"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { usePollar, WalletButton } from "@pollar/react";
import { DEMO_WALLETS, UserRole, useSession } from "../../context/SessionContext";

const WalletMultiButton = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false }
);

const ADMIN_PASSCODE = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || "admin";
const ADMIN_ALLOWLIST_WALLET = process.env.NEXT_PUBLIC_ADMIN_WALLET || "";
const ADMIN_AUTH_STORAGE_KEY = "proofpay_admin_unlocked";

const ROLES: {
  id: UserRole;
  title: string;
  subtitle: string;
  route: string;
  badge: string;
}[] = [
  {
    id: "client",
    title: "Client (Customer)",
    subtitle: "Create & fund escrow jobs, approve deliveries, or dispute timed-out reviews.",
    route: "/client",
    badge: "Buyer",
  },
  {
    id: "seller",
    title: "Seller (Freelancer)",
    subtitle: "Submit deliverables against locked escrows and trigger AI verification.",
    route: "/seller",
    badge: "Provider",
  },
  {
    id: "admin",
    title: "Admin / Protocol Operator",
    subtitle: "Inspect disputed escrows, timeout audit logs, and resolve split payouts.",
    route: "/admin",
    badge: "Arbiter Admin",
  },
];

export default function LoginPage() {
  const router = useRouter();
  const {
    role,
    walletAddress,
    isWalletConnected,
    isPollarConnected,
    setRole,
    loginAsDemo,
  } = useSession();

  const {
    isAuthenticated: isPollarAuthenticated,
    wallet: pollarWallet,
    wallets: pollarWallets,
    hasWallet,
    createWallet,
    login: pollarLogin,
    logout: pollarLogout,
    openReceiveModal,
  } = usePollar();

  const [showAdminPrompt, setShowAdminPrompt] = useState(false);
  const [adminPasscode, setAdminPasscode] = useState("");
  const [adminError, setAdminError] = useState<string | null>(null);
  const [pollarError, setPollarError] = useState<string | null>(null);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [creatingWallet, setCreatingWallet] = useState(false);

  const solanaPollarWallet = Array.isArray(pollarWallets)
    ? pollarWallets.find((w) => w.chain === "SOLANA")
    : undefined;
  const activePollarAddress =
    solanaPollarWallet?.address ?? pollarWallet?.address ?? null;

  const handlePollarGoogleLogin = () => {
    setPollarError(null);
    pollarLogin({ provider: "google" });
  };

  const handlePollarEmailLogin = () => {
    setPollarError(null);
    pollarLogin({ provider: "email" });
  };

  const handleCreatePollarWallet = async () => {
    setPollarError(null);
    setCreatingWallet(true);
    try {
      await createWallet();
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

  const completeLogin = (selected: (typeof ROLES)[number]) => {
    if (isWalletConnected) {
      setRole(selected.id);
    } else {
      loginAsDemo(selected.id);
    }
    router.push(selected.route);
  };

  const handleSelectRole = (selected: (typeof ROLES)[number]) => {
    if (selected.id === "admin") {
      const isAllowlisted =
        isWalletConnected &&
        ADMIN_ALLOWLIST_WALLET &&
        walletAddress === ADMIN_ALLOWLIST_WALLET;
      const alreadyUnlocked =
        window.sessionStorage.getItem(ADMIN_AUTH_STORAGE_KEY) === "true";

      if (!isAllowlisted && !alreadyUnlocked) {
        setShowAdminPrompt(true);
        setAdminError(null);
        return;
      }
    }

    completeLogin(selected);
  };

  const handleAdminUnlockSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPasscode.trim() === ADMIN_PASSCODE) {
      window.sessionStorage.setItem(ADMIN_AUTH_STORAGE_KEY, "true");
      setAdminError(null);
      setShowAdminPrompt(false);
      const adminRole = ROLES.find((r) => r.id === "admin")!;
      completeLogin(adminRole);
    } else {
      setAdminError("Invalid admin passcode.");
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Connect Wallet &amp; Select Portal
        </h1>
        <p className="text-sm text-slate-600">
          Sign in with Pollar for an instant gas-sponsored Solana wallet, connect Phantom/Solflare, or use a 1-click demo wallet.
        </p>
      </div>

      {/* Pollar Social / Embedded Wallet Box */}
      <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-5 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-900">
                Pollar Embedded Solana Wallet
              </span>
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-800">
                Gas-Sponsored USDC
              </span>
            </div>

            {activePollarAddress ? (
              <div className="space-y-1">
                <p className="text-xs font-medium text-emerald-700">
                  Provisioned Address:{" "}
                  <span className="font-mono break-all">{activePollarAddress}</span>
                </p>
                <p className="text-[11px] text-slate-500">
                  Fund this Devnet address via Solana Faucet (SOL) &amp; Circle Faucet (USDC).
                </p>
              </div>
            ) : isPollarAuthenticated ? (
              <p className="text-xs text-amber-700 font-medium">
                {hasWallet
                  ? "Authenticated — resolving Solana wallet address..."
                  : "Signed in with no wallet yet — click Create Wallet or use the Pollar button."}
              </p>
            ) : (
              <p className="text-xs text-slate-600">
                No browser extension required · Creates a Solana Devnet wallet on sign-in
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
                onClick={handlePollarGoogleLogin}
                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition"
              >
                Continue with Google
              </button>
              <button
                type="button"
                onClick={handlePollarEmailLogin}
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
                onClick={() => pollarLogout()}
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

      {/* External Solana Wallet Adapter Box */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-indigo-200 bg-indigo-50/40 p-5">
        <div className="space-y-1">
          <div className="text-sm font-semibold text-slate-900">
            External Solana Wallet (Phantom / Solflare)
          </div>
          {isWalletConnected && !isPollarConnected && walletAddress ? (
            <p className="text-xs text-emerald-700 font-medium">
              Connected: <span className="font-mono">{walletAddress}</span>
            </p>
          ) : (
            <p className="text-xs text-slate-600">
              {isPollarConnected
                ? "Pollar wallet is currently active above"
                : "Optional browser extension connection"}
            </p>
          )}
        </div>

        <WalletMultiButton />
      </div>

      {/* Role / Portal Selector */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-800">
          {isWalletConnected
            ? "Choose which portal to open with your connected wallet:"
            : "Or enter a portal with a 1-click Demo Wallet:"}
        </h2>

        <div className="grid grid-cols-1 gap-3">
          {ROLES.map((item) => {
            const isCurrent = role === item.id;
            const displayAddress =
              isWalletConnected && walletAddress
                ? walletAddress
                : DEMO_WALLETS[item.id];

            return (
              <div key={item.id} className="space-y-2">
                <button
                  type="button"
                  onClick={() => handleSelectRole(item)}
                  className={`w-full flex items-center justify-between gap-4 rounded-xl border p-4 text-left transition ${
                    isCurrent
                      ? "border-indigo-600 bg-indigo-50/40 ring-1 ring-indigo-600"
                      : "border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50"
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900">{item.title}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                        {item.badge}
                      </span>
                      {isCurrent && (
                        <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-xs font-medium text-white">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600">{item.subtitle}</p>
                    <p className="font-mono text-[11px] text-slate-400">
                      Wallet: {displayAddress.slice(0, 8)}...{displayAddress.slice(-6)}
                    </p>
                  </div>

                  <span className="shrink-0 text-sm font-semibold text-indigo-600">
                    Enter →
                  </span>
                </button>

                {/* Inline Admin Passcode Prompt */}
                {item.id === "admin" && showAdminPrompt && (
                  <form
                    onSubmit={handleAdminUnlockSubmit}
                    className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-amber-900">
                        Admin Operator Passcode Required
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAdminPrompt(false);
                          setAdminError(null);
                        }}
                        className="text-xs text-slate-500 hover:text-slate-700"
                      >
                        Cancel
                      </button>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        type="password"
                        required
                        autoFocus
                        placeholder={`Enter passcode (default: ${ADMIN_PASSCODE})`}
                        value={adminPasscode}
                        onChange={(e) => setAdminPasscode(e.target.value)}
                        className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                      />
                      <button
                        type="submit"
                        className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                      >
                        Unlock &amp; Enter →
                      </button>
                    </div>

                    {adminError && (
                      <p className="text-xs font-medium text-red-600">{adminError}</p>
                    )}
                  </form>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}