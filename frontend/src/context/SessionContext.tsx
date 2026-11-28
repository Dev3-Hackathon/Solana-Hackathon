"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
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
  isReady: boolean;
  isWalletConnected: boolean;
  isPollarConnected: boolean;
  isPollarVerified: boolean;
  loginAsDemo: (role: UserRole) => void;
  setRole: (role: UserRole) => void;
  logout: () => void;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

const STORAGE_KEY = "proofpay_demo_role";

export function SessionProvider({ children }: { children: React.ReactNode }) {
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

    if (pollarAddress && !role) {
      setRoleState("client");
      window.localStorage.setItem(STORAGE_KEY, "client");
    }
  }, [isReady, pollarAddress, role]);

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
  };

  const walletAddress = isReady
    ? pollarAddress ?? (role ? DEMO_WALLETS[role] : null)
    : null;

  return (
    <SessionContext.Provider
      value={{
        role: isReady ? role : null,
        walletAddress,
        pollarAddress: isReady ? pollarAddress : null,
        isReady,
        isWalletConnected: isReady ? Boolean(pollarAddress) : false,
        isPollarConnected: isReady ? Boolean(pollarAddress) : false,
        isPollarVerified: isReady ? isPollarVerified : false,
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