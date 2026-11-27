import { Job, Verdict } from './types';

const nowSecs = Math.floor(Date.now() / 1000);

export const mockJobSubmitted: Job = {
  jobId: 1,
  client: "ClientPubkey11111111111111111111111111111111111",
  freelancer: "FreelancerPubkey11111111111111111111111111111111",
  arbiter: "ArbiterPubkey11111111111111111111111111111111111",
  admin: "AdminPubkey111111111111111111111111111111111111",
  amount: 1000000000, // 1 SOL
  specHash: new Array(32).fill(0),
  deliverableUri: "http://localhost:4000/api/deliverables/123",
  deliverableHash: new Array(32).fill(0),
  status: "Submitted",
  verdict: 0,
  verdictScore: 0,
  verdictUri: "",
  verdictProposedAt: 0,
  disputeWindowSecs: 180,
  deadline: nowSecs + 86400,
  disputedBy: "11111111111111111111111111111111",
  bump: 255,
  submittedAt: nowSecs - 200, // 模拟已经提交了 200 秒 (配合 300s 超时测试)
};

export const mockVerdictPass: Verdict = {
  verdict: "pass",
  score: 85,
  criteria: [{ criterion: "Code compiles", met: true, evidence: "Build successful", confidence: 0.95 }],
  summary: "The deliverable meets all specified criteria.",
  risks: [],
};
