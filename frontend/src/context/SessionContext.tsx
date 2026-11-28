"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { WalletName } from "@solana/wallet-adapter-base";
import { useWallet } from "@solana/wallet-adapter-react";
import { usePollar } from "@pollar/react";

export type UserRole = "client" | "seller" | "admin";

export const DEMO_WALLETS: Record<UserRole, string> = {
  client: "CliEnt1111111111111111111111111111111111111",
  seller: "SeLLer2222222222222222222222222222222222222",
  admin: "AdmIn33333333333333333333333333333333333333",
};

interface SessionContextValue {
  role: UserRole | null;
  walletAddress: string | null;
  pollarAddress: string | null;
  phantomAddress: string | null;
  isReady: boolean;
  isWalletConnected: boolean;
  isPollarConnected: boolean;
  isPollarVerified: boolean;
  connectPhantom: () => Promise<void>;
  loginAsDemo: (role: UserRole) => void;
  setRole: (role: UserRole) => void;
  logout: () => void;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

const STORAGE_KEY = "proofpay_demo_role";

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const {
    publicKey,
    connected,
    wallets,
    select,
    connect,
    disconnect,
  } = useWallet();
  const {
    isAuthenticated: isPollarAuthenticated,
    verified: isPollarVerifiedRaw,
    wallet: pollarWallet,
    wallets: pollarWallets,
    logout: pollarLogout,
  } = usePollar();

  const [role, setRoleState] = useState<UserRole | null>(null);
  const [isReady, setIsReady] = useState(false);

  const solanaPollarWallet = Array.isArray(pollarWallets)
    ? pollarWallets.find((w) => w.chain === "SOLANA")
    : undefined;
  const pollarAddress = isPollarAuthenticated
    ? solanaPollarWallet?.address ?? pollarWallet?.address ?? null
    : null;
  const phantomAddress = connected && publicKey ? publicKey.toBase58() : null;
  const isPollarVerified = Boolean(isPollarAuthenticated && isPollarVerifiedRaw);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY) as UserRole | null;
    if (saved && saved in DEMO_WALLETS) {
      setRoleState(saved);
    }
    setIsReady(true);
  }, []);

  useEffect(() => {
    if (!isReady) return;

    const hasLiveWallet = Boolean(pollarAddress) || Boolean(phantomAddress);

    if (hasLiveWallet && !role) {
      setRoleState("client");
      window.localStorage.setItem(STORAGE_KEY, "client");
    }
  }, [isReady, pollarAddress, phantomAddress, role]);

  const connectPhantom = async () => {
    const phantomAdapter = wallets.find((w) =>
      w.adapter.name.toLowerCase().includes("phantom")
    );
    const targetName: WalletName =
      phantomAdapter?.adapter.name ?? ("Phantom" as WalletName);

    select(targetName);
    await new Promise((resolve) => setTimeout(resolve, 50));
    await connect();
  };

  const setRole = (nextRole: UserRole) => {
    setRoleState(nextRole);
    window.localStorage.setItem(STORAGE_KEY, nextRole);
  };

  const loginAsDemo = (nextRole: UserRole) => {
    setRole(nextRole);
  };

  const logout = () => {
    setRoleState(null);
    window.localStorage.removeItem(STORAGE_KEY);
    if (isPollarAuthenticated) {
      try {
        pollarLogout();
      } catch {
        // Ignore logout errors during session reset
      }
    }
    if (connected) {
      disconnect().catch(() => {});
    }
  };

  const liveAddress = pollarAddress ?? phantomAddress;
  const walletAddress = isReady
    ? liveAddress ?? (role ? DEMO_WALLETS[role] : null)
    : null;

  return (
    <SessionContext.Provider
      value={{
        role: isReady ? role : null,
        walletAddress,
        pollarAddress: isReady ? pollarAddress : null,
        phantomAddress: isReady ? phantomAddress : null,
        isReady,
        isWalletConnected: isReady ? Boolean(liveAddress) : false,
        isPollarConnected: isReady ? Boolean(pollarAddress) : false,
        isPollarVerified: isReady ? isPollarVerified : false,
        connectPhantom,
        loginAsDemo,
        setRole,
        logout,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used inside SessionProvider");
  }
  return ctx;
}