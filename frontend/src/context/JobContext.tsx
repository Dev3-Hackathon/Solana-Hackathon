"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { BN, Idl } from "@coral-xyz/anchor";
import { useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import { JobRecord, JobStatus, Verdict } from "../types";
import { SEED_JOBS } from "../lib/mockJobs";
import { postJobSpec, linkJobSpec } from "../lib/api";
import { useProgram } from "../hooks/useProgram";
import { DEMO_WALLETS } from "./SessionContext";

// Once Helya drops escrow.json into frontend/src/idl/escrow.json, uncomment:
// import escrowIdl from "../idl/escrow.json";
const ESCROW_IDL: Idl | null = null;

interface JobsContextValue {
  records: JobRecord[];
  isLoaded: boolean;
  isLiveChain: boolean;
  getJobByPda: (pda: string) => JobRecord | undefined;
  createJob: (
    title: string,
    description: string,
    amountSol: number,
    sellerAddress?: string
  ) => Promise<JobRecord>;
  submitWork: (pda: string, deliverableUri: string) => void;
  recordVerdict: (pda: string, verdict: Verdict, nextStatus?: JobStatus) => void;
  approveJob: (pda: string) => void;
  disputeJob: (pda: string, reason?: string) => void;
  resolveDispute: (pda: string, clientBps: number) => void;
  resetDemoData: () => void;
}

const JobsContext = createContext<JobsContextValue | undefined>(undefined);

const STORAGE_KEY = "proofpay_jobs_v1";

function to32ByteArray(specHash: number[] | string): number[] {
  if (Array.isArray(specHash)) {
    if (specHash.length !== 32) {
      throw new Error(`Invalid specHash length: expected 32 bytes, got ${specHash.length}`);
    }
    return specHash;
  }
  const cleanHex = specHash.startsWith("0x") ? specHash.slice(2) : specHash;
  const buf = Buffer.from(cleanHex, "hex");
  if (buf.length !== 32) {
    throw new Error(`Invalid hex specHash length: expected 32 bytes, got ${buf.length}`);
  }
  return Array.from(buf);
}

export function JobsProvider({ children }: { children: React.ReactNode }) {
  const { publicKey } = useWallet();
  const { program, isReady, deriveJobPda, deriveVaultPda } = useProgram(ESCROW_IDL);

  const [records, setRecords] = useState<JobRecord[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as JobRecord[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setRecords(parsed);
          setIsLoaded(true);
          return;
        }
      }
    } catch {
      // Fallback to seed jobs
    }
    setRecords(SEED_JOBS);
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (isLoaded) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    }
  }, [records, isLoaded]);

  const getJobByPda = (pda: string) => records.find((r) => r.pda === pda);

  const createJob = async (
    title: string,
    description: string,
    amountSol: number,
    sellerAddress: string = DEMO_WALLETS.seller
  ): Promise<JobRecord> => {
    const nextId =
      records.reduce((max, r) => Math.max(max, Number(r.job.jobId) || 0), 100) + 1;
    const now = Math.floor(Date.now() / 1000);
    const lamports = Math.round(amountSol * LAMPORTS_PER_SOL);

    // LIVE ON-CHAIN PATH (Active once ESCROW_IDL is provided and wallet is connected)
    if (isReady && program && publicKey) {
      const { specId, specHash } = await postJobSpec({
        title,
        description,
        criteria: [description],
      });
      const specHashBytes = to32ByteArray(specHash);

      const jobIdBn = new BN(nextId);
      const [jobPda] = deriveJobPda(publicKey, jobIdBn);
      const [vaultPda] = deriveVaultPda(jobPda);
      const freelancerPubkey = new PublicKey(sellerAddress);

      await (program.methods as Record<string, (...args: unknown[]) => {
        accounts: (accs: Record<string, PublicKey>) => { rpc: () => Promise<string> };
      }>)
        .createJob(jobIdBn, new BN(lamports), specHashBytes)
        .accounts({
          client: publicKey,
          freelancer: freelancerPubkey,
          job: jobPda,
          vault: vaultPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      await linkJobSpec(jobPda.toBase58(), { specId, specHash });

      const newRecord: JobRecord = {
        pda: jobPda.toBase58(),
        title,
        description,
        job: {
          jobId: nextId,
          client: publicKey.toBase58(),
          freelancer: freelancerPubkey.toBase58(),
          arbiter: "ArbIter444444444444444444444444444444444444",
          admin: DEMO_WALLETS.admin,
          amount: lamports,
          specHash: specHashBytes,
          deliverableUri: "",
          deliverableHash: new Array(32).fill(0),
          status: "Funded",
          verdict: 0,
          verdictScore: 0,
          verdictUri: "",
          verdictProposedAt: 0,
          disputeWindowSecs: 300,
          deadline: now + 86400,
          disputedBy: "",
          bump: 255,
          submittedAt: 0,
        },
      };

      setRecords((prev) => [newRecord, ...prev]);
      return newRecord;
    }

    // MOCK FALLBACK PATH (Used while awaiting Helya's IDL)
    const pda = `JobPda${nextId}Mock111111111111111111111111111111`;
    const newRecord: JobRecord = {
      pda,
      title,
      description,
      job: {
        jobId: nextId,
        client: publicKey ? publicKey.toBase58() : DEMO_WALLETS.client,
        freelancer: sellerAddress,
        arbiter: "ArbIter444444444444444444444444444444444444",
        admin: DEMO_WALLETS.admin,
        amount: lamports,
        specHash: new Array(32).fill(nextId % 255),
        deliverableUri: "",
        deliverableHash: new Array(32).fill(0),
        status: "Funded",
        verdict: 0,
        verdictScore: 0,
        verdictUri: "",
        verdictProposedAt: 0,
        disputeWindowSecs: 300,
        deadline: now + 86400,
        disputedBy: "",
        bump: 255,
        submittedAt: 0,
      },
    };
    setRecords((prev) => [newRecord, ...prev]);
    return newRecord;
  };

  const submitWork = (pda: string, deliverableUri: string) => {
    const now = Math.floor(Date.now() / 1000);
    setRecords((prev) =>
      prev.map((r) =>
        r.pda === pda
          ? {
              ...r,
              job: {
                ...r.job,
                status: "Submitted",
                deliverableUri,
                submittedAt: now,
              },
            }
          : r
      )
    );
  };

  const recordVerdict = (pda: string, verdict: Verdict, nextStatus?: JobStatus) => {
    const now = Math.floor(Date.now() / 1000);
    const verdictCode =
      verdict.verdict === "pass" ? 1 : verdict.verdict === "fail" ? 2 : 3;

    setRecords((prev) =>
      prev.map((r) => {
        if (r.pda !== pda) return r;
        const resolvedStatus: JobStatus =
          nextStatus ?? (verdict.verdict === "inconclusive" ? "Disputed" : "Submitted");
        return {
          ...r,
          verdict,
          job: {
            ...r.job,
            status: resolvedStatus,
            verdict: verdictCode,
            verdictScore: verdict.score,
            verdictProposedAt: now,
          },
        };
      })
    );
  };

  const approveJob = (pda: string) => {
    setRecords((prev) =>
      prev.map((r) =>
        r.pda === pda ? { ...r, job: { ...r.job, status: "Released" } } : r
      )
    );
  };

  const disputeJob = (pda: string, reason?: string) => {
    setRecords((prev) =>
      prev.map((r) =>
        r.pda === pda
          ? {
              ...r,
              disputeReason: reason || "Manual dispute raised",
              job: {
                ...r.job,
                status: "Disputed",
                disputedBy: r.job.client,
              },
            }
          : r
      )
    );
  };

  const resolveDispute = (pda: string, clientBps: number) => {
    const status: JobStatus =
      clientBps === 10000 ? "Refunded" : clientBps === 0 ? "Released" : "Resolved";
    setRecords((prev) =>
      prev.map((r) =>
        r.pda === pda ? { ...r, job: { ...r.job, status } } : r
      )
    );
  };

  const resetDemoData = () => {
    window.localStorage.removeItem(STORAGE_KEY);
    setRecords(SEED_JOBS);
  };

  return (
    <JobsContext.Provider
      value={{
        records,
        isLoaded,
        isLiveChain: isReady,
        getJobByPda,
        createJob,
        submitWork,
        recordVerdict,
        approveJob,
        disputeJob,
        resolveDispute,
        resetDemoData,
      }}
    >
      {children}
    </JobsContext.Provider>
  );
}

export function useJobs() {
  const ctx = useContext(JobsContext);
  if (!ctx) {
    throw new Error("useJobs must be used inside JobsProvider");
  }
  return ctx;
}