import { JobRecord } from "../types";

const DEMO_CLIENT = "CliEnt1111111111111111111111111111111111111";
const DEMO_SELLER = "SeLLer2222222222222222222222222222222222222";

const nowSecs = Math.floor(Date.now() / 1000);

export const SEED_JOBS: JobRecord[] = [
  {
    pda: "JobPda101Mock111111111111111111111111111111",
    title: "Build Solana Webhook Indexer",
    description: "Stream Anchor program events into Postgres with <200ms latency and unit tests.",
    job: {
      jobId: "101",
      client: DEMO_CLIENT,
      freelancer: DEMO_SELLER,
      amount: 1_500_000_000, // 1.5 SOL
      status: "Funded",
      specHash: new Array(32).fill(101),
      deliverableUrl: "",
      submittedAt: 0,
      disputedAt: 0,
    },
  },
  {
    pda: "JobPda102Mock111111111111111111111111111111",
    title: "Implement Token-2022 Transfer Hook",
    description: "Custom transfer hook validating allowlisted treasury accounts on Devnet.",
    job: {
      jobId: "102",
      client: DEMO_CLIENT,
      freelancer: DEMO_SELLER,
      amount: 2_500_000_000, // 2.5 SOL
      status: "Submitted",
      specHash: new Array(32).fill(102),
      deliverableUrl: "https://github.com/proofpay/token2022-hook/pull/14",
      submittedAt: nowSecs - 600, // Overdue (> 300s) so timeout dispute flow can be tested
      disputedAt: 0,
    },
  },
  {
    pda: "JobPda103Mock111111111111111111111111111111",
    title: "Audit Escrow PDA Constraints",
    description: "Verify signer checks, vault seeds, and dispute timeout bounds.",
    job: {
      jobId: "103",
      client: DEMO_CLIENT,
      freelancer: DEMO_SELLER,
      amount: 3_000_000_000, // 3.0 SOL
      status: "Disputed",
      specHash: new Array(32).fill(103),
      deliverableUrl: "https://github.com/proofpay/escrow-audit/blob/main/REPORT.md",
      submittedAt: nowSecs - 3600,
      disputedAt: nowSecs - 1800,
    },
    disputeReason: "AI review timed out before posting verdict.",
  },
];