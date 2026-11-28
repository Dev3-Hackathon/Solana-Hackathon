"use client";

import React, { useEffect, useState } from "react";
import { PollarProvider } from "@pollar/react";

export function PollarWrapper({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const apiKey =
    process.env.NEXT_PUBLIC_POLLAR_API_KEY ??
    process.env.NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY ??
    "";

  if (!apiKey && mounted && process.env.NODE_ENV !== "production") {
    console.warn(
      "[PollarWrapper] Missing NEXT_PUBLIC_POLLAR_API_KEY in environment."
    );
  }

  // Avoid SSR rendering of PollarProvider so browser-only wallet/session state initializes cleanly on client.
  if (!mounted) {
    return <div className="min-h-screen" aria-hidden="true" />;
  }

  return (
    <PollarProvider client={{ apiKey }}>
      {children}
    </PollarProvider>
  );
}