"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export type UserRole = "client" | "seller" | "admin";

export const DEMO_WALLETS: Record<UserRole, string> = {
  client: "Client1111111111111111111111111111111111111",
  seller: "Freelancer222222222222222222222222222222222",
  admin: "Admin4444444444444444444444444444444444444444",
};

interface SessionContextValue {
  role: UserRole | null;
  walletAddress: string | null;
  isReady: boolean;
  loginAsDemo: (role: UserRole) => void;
  logout: () => void;
}

const SessionContext = createContext<SessionContextValue>({
  role: null,
  walletAddress: null,
  isReady: false,
  loginAsDemo: () => {},
  logout: () => {},
});

const STORAGE_KEY = "proofpay_demo_role";

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<UserRole | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY) as UserRole | null;
    if (saved && saved in DEMO_WALLETS) {
      setRole(saved);
    }
    setIsReady(true);
  }, []);

  const loginAsDemo = (nextRole: UserRole) => {
    window.localStorage.setItem(STORAGE_KEY, nextRole);
    setRole(nextRole);
  };

  const logout = () => {
    window.localStorage.removeItem(STORAGE_KEY);
    setRole(null);
  };

  return (
    <SessionContext.Provider
      value={{
        role,
        walletAddress: role ? DEMO_WALLETS[role] : null,
        isReady,
        loginAsDemo,
        logout,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}