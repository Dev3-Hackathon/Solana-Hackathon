"use client";

import React from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { DEMO_WALLETS, UserRole, useSession } from "../../context/SessionContext";

const WalletMultiButton = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false }
);

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
  const { role, walletAddress, isWalletConnected, setRole, loginAsDemo } = useSession();

  const handleSelectRole = (selected: (typeof ROLES)[number]) => {
    if (isWalletConnected) {
      setRole(selected.id);
    } else {
      loginAsDemo(selected.id);
    }
    router.push(selected.route);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Connect Wallet &amp; Select Portal
        </h1>
        <p className="text-sm text-slate-600">
          Connect a Solana Devnet wallet (Phantom or Solflare) to sign real transactions, or continue with a 1-click demo wallet.
        </p>
      </div>

      {/* Real Solana Wallet Adapter Box */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-indigo-200 bg-indigo-50/60 p-5">
        <div className="space-y-1">
          <div className="text-sm font-semibold text-slate-900">
            Solana Devnet Wallet
          </div>
          {isWalletConnected && walletAddress ? (
            <p className="text-xs text-emerald-700 font-medium">
              Connected: <span className="font-mono">{walletAddress}</span>
            </p>
          ) : (
            <p className="text-xs text-slate-600">
              No wallet connected · Using mock demo addresses until connected
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
            const displayAddress = isWalletConnected && walletAddress
              ? walletAddress
              : DEMO_WALLETS[item.id];

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectRole(item)}
                className={`flex items-center justify-between gap-4 rounded-xl border p-4 text-left transition ${
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
            );
          })}
        </div>
      </div>
    </div>
  );
}