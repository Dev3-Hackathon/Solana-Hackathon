"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { createInitialMockRecords, JobRecord } from "../mock";
import { DEMO_WALLETS } from "./SessionContext";

interface JobsContextValue {
  records: JobRecord[];
  isLoaded: boolean;
  createJob: (title: string, description: string, amountSol: number) => JobRecord;
  submitWork: (pda: string, deliverableUri: string) => void;
  approveJob: (pda: string) => void;
  disputeJob: (pda: string, disputedByWallet: string) => void;
  resolveDispute: (pda: string, releaseToSeller: boolean) => void;
}

const JobsContext = createContext<JobsContextValue | null>(null);

export function JobsProvider({ children }: { children: React.ReactNode }) {
  const [records, setRecords] = useState<JobRecord[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const nowSecs = Math.floor(Date.now() / 1000);
    setRecords(createInitialMockRecords(nowSecs));
    setIsLoaded(true);
  }, []);

  const createJob = (title: string, description: string, amountSol: number): JobRecord => {
    const nowSecs = Math.floor(Date.now() / 1000);
    const nextId = 100 + records.length + 1;
    const newRecord: JobRecord = {
      pda: `JobPDA${nextId}11111111111111111111111111111111111`,
      title,
      description,
      verdict: null,
      job: {
        jobId: nextId,
        client: DEMO_WALLETS.client,
        freelancer: DEMO_WALLETS.seller,
        arbiter: "Arbiter33333333333333333333333333333333333333",
        admin: DEMO_WALLETS.admin,
        amount: Math.round(amountSol * 1_000_000_000),
        specHash: [1, 2, 3, 4],
        deliverableUri: "",
        deliverableHash: [],
        status: "Accepted",
        verdict: 0,
        verdictScore: 0,
        verdictUri: "",
        verdictProposedAt: 0,
        disputeWindowSecs: Number(process.env.NEXT_PUBLIC_DEMO_WINDOW_SECS ?? 180),
        deadline: nowSecs + 86400,
        disputedBy: "",
        bump: 250,
        submittedAt: 0,
      },
    };
    setRecords((prev) => [newRecord, ...prev]);
    return newRecord;
  };

  const submitWork = (pda: string, deliverableUri: string) => {
    const nowSecs = Math.floor(Date.now() / 1000);
    setRecords((prev) =>
      prev.map((rec) =>
        rec.pda === pda
          ? {
              ...rec,
              job: {
                ...rec.job,
                deliverableUri,
                status: "Submitted",
                submittedAt: nowSecs,
              },
            }
          : rec
      )
    );
  };

  const approveJob = (pda: string) => {
    setRecords((prev) =>
      prev.map((rec) =>
        rec.pda === pda ? { ...rec, job: { ...rec.job, status: "Released" } } : rec
      )
    );
  };

  const disputeJob = (pda: string, disputedByWallet: string) => {
    setRecords((prev) =>
      prev.map((rec) =>
        rec.pda === pda
          ? {
              ...rec,
              job: {
                ...rec.job,
                status: "Disputed",
                disputedBy: disputedByWallet,
              },
            }
          : rec
      )
    );
  };

  const resolveDispute = (pda: string, releaseToSeller: boolean) => {
    setRecords((prev) =>
      prev.map((rec) =>
        rec.pda === pda
          ? {
              ...rec,
              job: {
                ...rec.job,
                status: releaseToSeller ? "Released" : "Refunded",
              },
            }
          : rec
      )
    );
  };

  return (
    <JobsContext.Provider
      value={{
        records,
        isLoaded,
        createJob,
        submitWork,
        approveJob,
        disputeJob,
        resolveDispute,
      }}
    >
      {children}
    </JobsContext.Provider>
  );
}

export function useJobs() {
  const ctx = useContext(JobsContext);
  if (!ctx) throw new Error("useJobs must be used inside JobsProvider");
  return ctx;
}