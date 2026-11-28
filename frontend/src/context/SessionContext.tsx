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
  hasCompletedOnboarding: boolean;
  completeOnboarding: (nextRole: UserRole) => void;
  loginAsDemo: (role: UserRole) => void;
  setRole: (role: UserRole) => void;
  switchRole: () => void;
  logout: () => void;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

const ROLE_STORAGE_KEY = "proofpay_demo_role";
const ONBOARDING_STORAGE_KEY = "proofpay_pollar_onboarded";

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const {
    isAuthenticated: isPollarAuthenticated,
    verified: isPollarVerifiedRaw,
    wallet: pollarWallet,
    wallets: pollarWallets,
    logout: pollarLogout,
  } = usePollar();

  const [role, setRoleState] = useState<UserRole | null>(null);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [isReady, setIsReady] = useState(false);

  const solanaPollarWallet = Array.isArray(pollarWallets)
    ? pollarWallets.find((w) => w.chain === "SOLANA")
    : undefined;
  const pollarAddress = isPollarAuthenticated
    ? solanaPollarWallet?.address ?? pollarWallet?.address ?? null
    : null;
  const isPollarVerified = Boolean(isPollarAuthenticated && isPollarVerifiedRaw);

  useEffect(() => {
    const savedRole = window.localStorage.getItem(ROLE_STORAGE_KEY) as UserRole | null;
    if (savedRole && savedRole in DEMO_WALLETS) {
      setRoleState(savedRole);
    }
    const onboarded = window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === "true";
    setHasCompletedOnboarding(onboarded);
    setIsReady(true);
  }, []);

  const setRole = (nextRole: UserRole) => {
    setRoleState(nextRole);
    window.localStorage.setItem(ROLE_STORAGE_KEY, nextRole);
  };

  const completeOnboarding = (nextRole: UserRole) => {
    setRoleState(nextRole);
    setHasCompletedOnboarding(true);
    window.localStorage.setItem(ROLE_STORAGE_KEY, nextRole);
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
  };

  const loginAsDemo = (nextRole: UserRole) => {
    setRole(nextRole);
  };

  const switchRole = () => {
    setRoleState(null);
    window.localStorage.removeItem(ROLE_STORAGE_KEY);
  };

  const logout = () => {
    setRoleState(null);
    setHasCompletedOnboarding(false);
    window.localStorage.removeItem(ROLE_STORAGE_KEY);
    window.localStorage.removeItem(ONBOARDING_STORAGE_KEY);
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
        hasCompletedOnboarding: isReady ? hasCompletedOnboarding : false,
        completeOnboarding,
        loginAsDemo,
        setRole,
        switchRole,
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