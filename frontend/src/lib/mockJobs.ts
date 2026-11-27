import { JobRecord } from "../types";

const DEMO_CLIENT = "CliEnt1111111111111111111111111111111111111";
const DEMO_SELLER = "SeLLer2222222222222222222222222222222222222";
const DEMO_ADMIN = "AdmIn33333333333333333333333333333333333333";
const DEMO_ARBITER = "ArbIter444444444444444444444444444444444444";

const nowSecs = Math.floor(Date.now() / 1000);

export const SEED_JOBS: JobRecord[] = [
  {
    pda: "JobPda101Mock111111111111111111111111111111",
    title: "Build Solana Webhook Indexer",
    description: "Stream Anchor program events into Postgres with <200ms latency and unit tests.",
    job: {
      jobId: 101,
      client: DEMO_CLIENT,
      freelancer: DEMO_SELLER,
      arbiter: DEMO_ARBITER,
      admin: DEMO_ADMIN,
      amount: 1_500_000_000, // 1.5 SOL
      specHash: new Array(32).fill(101),
      deliverableUri: "",
      deliverableHash: new Array(32).fill(0),
      status: "Funded",
      verdict: 0,
      verdictScore: 0,
      verdictUri: "",
      verdictProposedAt: 0,
      disputeWindowSecs: 300,
      deadline: nowSecs + 86400,
      disputedBy: "",
      bump: 255,
      submittedAt: 0,
    },
  },
  {
    pda: "JobPda102Mock111111111111111111111111111111",
    title: "Implement Token-2022 Transfer Hook",
    description: "Custom transfer hook validating allowlisted treasury accounts on Devnet.",
    job: {
      jobId: 102,
      client: DEMO_CLIENT,
      freelancer: DEMO_SELLER,
      arbiter: DEMO_ARBITER,
      admin: DEMO_ADMIN,
      amount: 2_500_000_000, // 2.5 SOL
      specHash: new Array(32).fill(102),
      deliverableUri: "https://github.com/proofpay/token2022-hook/pull/14",
      deliverableHash: new Array(32).fill(102),
      status: "Submitted",
      verdict: 0,
      verdictScore: 0,
      verdictUri: "",
      verdictProposedAt: 0,
      disputeWindowSecs: 300,
      deadline: nowSecs + 86400,
      disputedBy: "",
      bump: 254,
      submittedAt: nowSecs - 600, // Overdue (> 300s) so timeout dispute flow can be tested
    },
  },
  {
    pda: "JobPda103Mock111111111111111111111111111111",
    title: "Audit Escrow PDA Constraints",
    description: "Verify signer checks, vault seeds, and dispute timeout bounds.",
    job: {
      jobId: 103,
      client: DEMO_CLIENT,
      freelancer: DEMO_SELLER,
      arbiter: DEMO_ARBITER,
      admin: DEMO_ADMIN,
      amount: 3_000_000_000, // 3.0 SOL
      specHash: new Array(32).fill(103),
      deliverableUri: "https://github.com/proofpay/escrow-audit/blob/main/REPORT.md",
      deliverableHash: new Array(32).fill(103),
      status: "Disputed",
      verdict: 3,
      verdictScore: 48,
      verdictUri: "",
      verdictProposedAt: nowSecs - 1800,
      disputeWindowSecs: 300,
      deadline: nowSecs + 86400,
      disputedBy: DEMO_CLIENT,
      bump: 253,
      submittedAt: nowSecs - 3600,
    },
    disputeReason: "AI review timed out before posting verdict.",
  },
];