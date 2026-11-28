"use client";

import React, { useEffect, useState } from "react";
import { PollarProvider } from "@pollar/react";
import { solanaWalletStandardAdapters } from "@pollar/solana-wallet-standard-adapter";

export function PollarWrapper({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [adapters, setAdapters] = useState<
    ReturnType<typeof solanaWalletStandardAdapters>
  >([]);

  useEffect(() => {
    try {
      setAdapters(solanaWalletStandardAdapters());
    } catch {
      setAdapters([]);
    }
    setMounted(true);
  }, []);

  const apiKey =
    process.env.NEXT_PUBLIC_POLLAR_API_KEY ??
    process.env.NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY ??
    "";

  // Don't render the provider (or anything that depends on it) on the server.
  if (!mounted) {
    return <div className="min-h-screen" aria-hidden="true" />;
  }

  return (
    <PollarProvider
      client={{
        apiKey,
        ...(adapters.length > 0 ? { walletAdapters: adapters } : {}),
      }}
    >
      {children}
    </PollarProvider>
  );
}