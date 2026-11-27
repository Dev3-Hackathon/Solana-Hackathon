import { Job, Verdict } from "./types";
import { DEMO_WALLETS } from "./context/SessionContext";

export interface JobRecord {
  pda: string;
  title: string;
  description: string;
  job: Job;
  verdict: Verdict | null;
}

export const mockVerdictPass: Verdict = {
  verdict: "pass",
  score: 88,
  criteria: [
    {
      criterion: "Implements responsive escrow dashboard with role detection",
      met: true,
      evidence: "JobActionPanel renders distinct controls for Client, Freelancer, and Admin wallets.",
      confidence: 0.95,
    },
    {
      criterion: "Handles review timeout after 300 seconds without stuck funds",
      met: true,
      evidence: "CountdownTimer triggers timeout state at submittedAt + 300s and exposes Dispute button.",
      confidence: 0.92,
    },
    {
      criterion: "Includes automated end-to-end devnet transaction tests",
      met: false,
      evidence: "Unit tests present, but devnet integration suite is still pending IDL deployment.",
      confidence: 0.84,
    },
  ],
  summary: "Deliverable meets core functional and D11 timeout requirements; minor test coverage gap noted.",
  risks: ["Devnet E2E test suite pending final program deploy"],
};

export function createInitialMockRecords(nowSecs: number): JobRecord[] {
  const windowSecs = Number(process.env.NEXT_PUBLIC_DEMO_WINDOW_SECS ?? 180);

  return [
    {
      pda: "JobPDA11111111111111111111111111111111111111",
      title: "Solana Escrow Frontend Integration",
      description: "Build role-aware escrow UI with D11 review timeout and dispute window countdowns.",
      verdict: null,
      job: {
        jobId: 101,
        client: DEMO_WALLETS.client,
        freelancer: DEMO_WALLETS.seller,
        arbiter: "Arbiter33333333333333333333333333333333333333",
        admin: DEMO_WALLETS.admin,
        amount: 2_500_000_000, // 2.5 SOL
        specHash: [1, 2, 3, 4],
        deliverableUri: "https://github.com/proofpay/demo-deliverable/pull/42",
        deliverableHash: [5, 6, 7, 8],
        status: "Submitted",
        verdict: 0,
        verdictScore: 0,
        verdictUri: "",
        verdictProposedAt: 0,
        disputeWindowSecs: windowSecs,
        deadline: nowSecs + 86400,
        disputedBy: "",
        bump: 255,
        submittedAt: nowSecs - 60, // 4 mins left on 300s timer
      },
    },
    {
      pda: "JobPDA22222222222222222222222222222222222222",
      title: "FastAPI AI Arbiter Timeout Hardening",
      description: "Enforce 45s evaluation budget and return inconclusive on model_timeout.",
      verdict: null,
      job: {
        jobId: 102,
        client: DEMO_WALLETS.client,
        freelancer: DEMO_WALLETS.seller,
        arbiter: "Arbiter33333333333333333333333333333333333333",
        admin: DEMO_WALLETS.admin,
        amount: 4_000_000_000, // 4.0 SOL
        specHash: [2, 3, 4, 5],
        deliverableUri: "https://github.com/proofpay/ai-service/pull/19",
        deliverableHash: [6, 7, 8, 9],
        status: "Submitted",
        verdict: 0,
        verdictScore: 0,
        verdictUri: "",
        verdictProposedAt: 0,
        disputeWindowSecs: windowSecs,
        deadline: nowSecs + 86400,
        disputedBy: "",
        bump: 254,
        submittedAt: nowSecs - 310, // Past 300s review timeout -> D11 Dispute unlocked
      },
    },
    {
      pda: "JobPDA33333333333333333333333333333333333333",
      title: "Anchor PDA Vault Security Audit",
      description: "Verify checked_add math and signer constraints across all 10 instructions.",
      verdict: mockVerdictPass,
      job: {
        jobId: 103,
        client: DEMO_WALLETS.client,
        freelancer: DEMO_WALLETS.seller,
        arbiter: "Arbiter33333333333333333333333333333333333333",
        admin: DEMO_WALLETS.admin,
        amount: 5_000_000_000, // 5.0 SOL
        specHash: [3, 4, 5, 6],
        deliverableUri: "https://github.com/proofpay/programs/pull/7",
        deliverableHash: [7, 8, 9, 10],
        status: "VerdictProposed",
        verdict: 1,
        verdictScore: 88,
        verdictUri: "http://localhost:4000/api/reports/JobPDA33333333333333333333333333333333333333",
        verdictProposedAt: nowSecs - 30, // 150s remaining in dispute window
        disputeWindowSecs: windowSecs,
        deadline: nowSecs + 86400,
        disputedBy: "",
        bump: 253,
        submittedAt: nowSecs - 120,
      },
    },
    {
      pda: "JobPDA44444444444444444444444444444444444444",
      title: "SDK Webhook Relayer Service",
      description: "Deliverable submitted, AI review timed out (404 REPORT_NOT_FOUND), escalated by seller.",
      verdict: null,
      job: {
        jobId: 104,
        client: DEMO_WALLETS.client,
        freelancer: DEMO_WALLETS.seller,
        arbiter: "Arbiter33333333333333333333333333333333333333",
        admin: DEMO_WALLETS.admin,
        amount: 3_200_000_000, // 3.2 SOL
        specHash: [4, 5, 6, 7],
        deliverableUri: "https://github.com/proofpay/relayer/pull/3",
        deliverableHash: [8, 9, 10, 11],
        status: "Disputed",
        verdict: 0,
        verdictScore: 0,
        verdictUri: "",
        verdictProposedAt: 0,
        disputeWindowSecs: windowSecs,
        deadline: nowSecs + 86400,
        disputedBy: DEMO_WALLETS.seller,
        bump: 252,
        submittedAt: nowSecs - 500,
      },
    },
  ];
}