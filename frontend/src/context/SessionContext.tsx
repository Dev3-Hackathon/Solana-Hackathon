"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
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
  isReady: boolean;
  isWalletConnected: boolean;
  isPollarConnected: boolean;
  loginAsDemo: (role: UserRole) => void;
  setRole: (role: UserRole) => void;
  logout: () => void;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

const STORAGE_KEY = "proofpay_demo_role";

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const { publicKey, connected, disconnect } = useWallet();
  const {
    isAuthenticated: isPollarAuthenticated,
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

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY) as UserRole | null;
    if (saved && saved in DEMO_WALLETS) {
      setRoleState(saved);
    }
    setIsReady(true);
  }, []);

  useEffect(() => {
    if (!isReady) return;

    const hasLiveWallet =
      Boolean(pollarAddress) || (connected && Boolean(publicKey));

    if (hasLiveWallet && !role) {
      setRoleState("client");
      window.localStorage.setItem(STORAGE_KEY, "client");
    }
  }, [isReady, pollarAddress, connected, publicKey, role]);

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

  const phantomAddress = publicKey ? publicKey.toBase58() : null;
  const liveAddress = pollarAddress ?? phantomAddress;
  const walletAddress = isReady
    ? liveAddress ?? (role ? DEMO_WALLETS[role] : null)
    : null;

  return (
    <SessionContext.Provider
      value={{
        role: isReady ? role : null,
        walletAddress,
        isReady,
        isWalletConnected: isReady ? Boolean(liveAddress) : false,
        isPollarConnected: isReady ? Boolean(pollarAddress) : false,
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