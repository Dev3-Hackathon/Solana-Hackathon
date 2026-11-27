export type JobStatus =
  | "Created"
  | "Funded"
  | "Accepted"
  | "Submitted"
  | "VerdictProposed"
  | "Disputed"
  | "Released"
  | "Refunded"
  | "Resolved"
  | "Cancelled";

export interface Job {
  jobId: number;
  client: string;
  freelancer: string;
  arbiter: string;
  admin: string;
  amount: number; // lamports
  specHash: number[];
  deliverableUri: string;
  deliverableHash: number[];
  status: JobStatus;
  verdict: number; // 0: none, 1: pass, 2: fail, 3: inconclusive
  verdictScore: number;
  verdictUri: string;
  verdictProposedAt: number;
  disputeWindowSecs: number;
  deadline: number;
  disputedBy: string;
  bump: number;
  submittedAt: number;
}

export interface Verdict {
  verdict: "pass" | "fail" | "inconclusive";
  score: number;
  criteria: {
    criterion: string;
    met: boolean | null;
    evidence: string;
    confidence: number;
  }[];
  summary: string;
  risks: string[];
}

export interface JobRecord {
  pda: string;
  title: string;
  description: string;
  job: Job;
  verdict?: Verdict;
  disputeReason?: string;
}