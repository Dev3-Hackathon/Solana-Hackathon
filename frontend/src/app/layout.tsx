import type { Metadata } from "next";
import "./globals.css";
import { SessionProvider } from "../context/SessionContext";
import Navbar from "../components/NavBar";

export const metadata: Metadata = {
  title: "ProofPay — Solana Escrow & AI Arbitration",
  description: "Non-custodial freelance escrow on Solana with AI verdict arbitration",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased flex flex-col">
        <SessionProvider>
          <Navbar />
          <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
            {children}
          </main>
          <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
            Non-custodial PDA escrow · Arbiter can only propose verdicts, never move funds
          </footer>
        </SessionProvider>
      </body>
    </html>
  );
}