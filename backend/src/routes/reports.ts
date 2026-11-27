import { Router } from "express";
import { db } from "../db";
import { HttpError, requirePubkey } from "../http";

export const reportsRouter = Router();

// 3.7  GET /api/reports/:jobPda
// Returns the stored Verdict, or 404 REPORT_NOT_FOUND when no AI report exists
// (for example a job disputed after the review timeout, which has no verdict).
reportsRouter.get("/reports/:jobPda", (req, res) => {
  const jobPda = requirePubkey(req.params.jobPda);

  const row = db
    .prepare(`SELECT verdict_json FROM reports WHERE job_pda = ?`)
    .get(jobPda) as { verdict_json: string } | undefined;

  if (!row) {
    throw new HttpError(404, "REPORT_NOT_FOUND", "No AI report exists for this job");
  }

  res.json(JSON.parse(row.verdict_json));
});