import { Router } from "express";
import {
  AiServiceResponseError,
  AiServiceTimeoutError,
  AiServiceUnavailableError,
  AiServiceValidationError,
  DeliverableContentType,
  evaluateDeliverable,
  Verdict,
  VerdictOutcome,
} from "../ai";
import { db } from "../db";
import { env } from "../env";
import {
  buildMalformedFallbackReport,
  isInvalidStatusAnchorError,
  resolveOnChainVerdict,
} from "../evaluate";
import { sha256Hex } from "../hash";
import { HttpError, parseBody, requirePubkey } from "../http";
import {
  confirmFundingOnChain,
  createJobForOnChain,
  getJob,
  isNotFundedAnchorError,
  proposeVerdictOnChain,
} from "../solana";
import { z } from "zod";

export const jobsRouter = Router();

// In-memory lock preventing concurrent evaluations of the same job (B15).
const inFlightEvaluations = new Set<string>();

interface ReportRow {
  verdict_json: string;
  on_chain_verdict: VerdictOutcome | null;
  tx_sig: string | null;
}

interface SpecRow {
  title: string;
  description: string;
  criteria_json: string;
}

interface SpecHashRow {
  id: string;
  spec_hash: string;
}

interface SnapshotRow {
  source_url: string;
  content: Buffer;
  sha256: string;
  content_type: DeliverableContentType;
}

const createJobForSchema = z.object({
  client: z.string().trim().min(32).max(64),
  freelancer: z.string().trim().min(32).max(64),
  amountLamports: z
    .union([z.string(), z.number().int().positive()])
    .transform((v) => String(v).trim())
    .refine((v) => /^\d+$/.test(v) && BigInt(v) >= 1_000_000n, {
      message: "amountLamports must be an integer >= 1000000 (0.001 SOL)",
    }),
  specId: z.string().trim().min(1).max(128),
  deadline: z.number().int(),
  disputeWindowSecs: z.number().int().min(5).max(604_800),
});

// POST /api/jobs/create-for (Pollar relayer path)
jobsRouter.post("/jobs/create-for", async (req, res) => {
  const body = parseBody(createJobForSchema, req.body);
  const client = requirePubkey(body.client);
  const freelancer = requirePubkey(body.freelancer);

  if (client === freelancer) {
    throw new HttpError(400, "INVALID_FREELANCER", "Freelancer must differ from client");
  }

  const nowSecs = Math.floor(Date.now() / 1000);
  if (body.deadline <= nowSecs) {
    throw new HttpError(400, "DEADLINE_PASSED", "Deadline must be in the future");
  }

  const spec = db
    .prepare(`SELECT id, spec_hash FROM specs WHERE id = ?`)
    .get(body.specId) as SpecHashRow | undefined;

  if (!spec) {
    throw new HttpError(404, "SPEC_NOT_FOUND", `Spec not found: ${body.specId}`);
  }

  let created: { jobPda: string; jobId: string; txSignature: string };
  try {
    created = await createJobForOnChain({
      client,
      freelancer,
      amountLamports: body.amountLamports,
      specHashHex: spec.spec_hash,
      deadline: body.deadline,
      disputeWindowSecs: body.disputeWindowSecs,
    });
  } catch (err) {
    throw new HttpError(
      502,
      "TX_FAILED",
      `Failed to submit create_job_for on-chain: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  db.prepare(
    `INSERT INTO job_specs (job_pda, spec_id)
     VALUES (?, ?)
     ON CONFLICT(job_pda) DO UPDATE SET spec_id = excluded.spec_id`
  ).run(created.jobPda, spec.id);

  console.log(`[create-for] created ${created.jobPda} for client ${client} (tx: ${created.txSignature})`);
  res.status(201).json(created);
});

// POST /api/jobs/:jobPda/confirm-funding (Pollar payment confirmation)
jobsRouter.post("/jobs/:jobPda/confirm-funding", async (req, res) => {
  const jobPda = requirePubkey(req.params.jobPda);

  const job = await getJob(jobPda);
  if (job.status === "funded") {
    res.json({ status: "funded", txSignature: null });
    return;
  }
  if (job.status !== "created") {
    throw new HttpError(
      409,
      "INVALID_STATUS",
      `Job must be in 'created' status to confirm funding (current: '${job.status}')`
    );
  }

  let txSignature: string;
  try {
    txSignature = await confirmFundingOnChain(jobPda);
  } catch (err) {
    if (isNotFundedAnchorError(err)) {
      throw new HttpError(
        409,
        "NOT_FUNDED",
        "Job PDA does not hold the required escrow amount yet"
      );
    }
    if (isInvalidStatusAnchorError(err)) {
      throw new HttpError(
        409,
        "INVALID_STATUS",
        "Job is no longer in 'created' status"
      );
    }
    throw new HttpError(
      502,
      "TX_FAILED",
      `Failed to submit confirm_funding on-chain: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  console.log(`[confirm-funding] ${jobPda} marked funded (tx: ${txSignature})`);
  res.json({ status: "funded", txSignature });
});

// 3.6  POST /api/jobs/:jobPda/evaluate
jobsRouter.post("/jobs/:jobPda/evaluate", async (req, res) => {
  const jobPda = requirePubkey(req.params.jobPda);

  // 1. Retry-safe idempotency check (B14)
  const existingReport = db
    .prepare(`SELECT verdict_json, on_chain_verdict, tx_sig FROM reports WHERE job_pda = ?`)
    .get(jobPda) as ReportRow | undefined;

  if (existingReport && existingReport.tx_sig && existingReport.on_chain_verdict) {
    console.log(`[evaluate] ${jobPda} already finalized on-chain (${existingReport.tx_sig})`);
    res.json({
      report: JSON.parse(existingReport.verdict_json) as Verdict,
      onChainVerdict: existingReport.on_chain_verdict,
      txSignature: existingReport.tx_sig,
    });
    return;
  }

  // 2. In-flight lock (B15)
  if (inFlightEvaluations.has(jobPda)) {
    throw new HttpError(
      409,
      "EVALUATION_IN_PROGRESS",
      "An evaluation is already running for this job"
    );
  }

  inFlightEvaluations.add(jobPda);
  try {
    // 3. Read on-chain Job and verify status == submitted (B16)
    const job = await getJob(jobPda);
    if (job.status !== "submitted") {
      throw new HttpError(
        409,
        "INVALID_JOB_STATUS",
        `Job must be in 'submitted' status to evaluate (current: '${job.status}')`
      );
    }

    let report: Verdict;
    let onChainVerdict: VerdictOutcome;

    if (existingReport) {
      // Retry path: report already saved, only on-chain tx needs to be re-sent
      console.log(`[evaluate] ${jobPda} retrying on-chain propose_verdict from saved report`);
      report = JSON.parse(existingReport.verdict_json) as Verdict;
      onChainVerdict = existingReport.on_chain_verdict ?? resolveOnChainVerdict(report);
    } else {
      // 4. Load linked spec & snapshot matching on-chain deliverableHash
      const specRow = db
        .prepare(
          `SELECT s.title, s.description, s.criteria_json
           FROM job_specs js JOIN specs s ON s.id = js.spec_id
           WHERE js.job_pda = ?`
        )
        .get(jobPda) as SpecRow | undefined;

      if (!specRow) {
        throw new HttpError(404, "SPEC_NOT_FOUND", "No spec is linked to this job");
      }

      const snapshot = db
        .prepare(
          `SELECT source_url, content, sha256, content_type
           FROM snapshots
           WHERE sha256 = ?
           ORDER BY created_at DESC
           LIMIT 1`
        )
        .get(job.deliverableHash) as SnapshotRow | undefined;

      if (!snapshot) {
        throw new HttpError(
          409,
          "HASH_MISMATCH",
          "No stored snapshot matches the on-chain deliverable_hash"
        );
      }

      const actualHash = sha256Hex(snapshot.content);
      if (actualHash !== job.deliverableHash) {
        throw new HttpError(
          409,
          "HASH_MISMATCH",
          "Stored snapshot bytes do not match on-chain deliverable_hash"
        );
      }

      const criteria = JSON.parse(specRow.criteria_json) as string[];

      // 5. Call Python AI service
      console.log(`[evaluate] ${jobPda} calling AI service`);
      try {
        report = await evaluateDeliverable({
          job_title: specRow.title,
          description: specRow.description,
          criteria,
          deliverable: {
            source_url: snapshot.source_url,
            content: snapshot.content.toString("utf8"),
            content_type: snapshot.content_type,
          },
        });
      } catch (err) {
        if (
          err instanceof AiServiceTimeoutError ||
          err instanceof AiServiceUnavailableError
        ) {
          console.warn(`[evaluate] ${jobPda} AI service unavailable: ${err.message}`);
          throw new HttpError(
            503,
            "AI_UNAVAILABLE",
            "AI evaluation service is temporarily unavailable; please retry"
          );
        }
        if (
          err instanceof AiServiceValidationError ||
          err instanceof AiServiceResponseError
        ) {
          console.warn(`[evaluate] ${jobPda} invalid AI output, falling back to inconclusive: ${err.message}`);
          report = buildMalformedFallbackReport(criteria, err.message);
        } else {
          throw err;
        }
      }

      // 6. Apply pass rule D9
      onChainVerdict = resolveOnChainVerdict(report);

      // 7. Save report BEFORE sending on-chain tx (retry-safe)
      db.prepare(
        `INSERT INTO reports (job_pda, verdict_json, on_chain_verdict, tx_sig)
         VALUES (?, ?, ?, NULL)
         ON CONFLICT(job_pda) DO UPDATE SET
           verdict_json = excluded.verdict_json,
           on_chain_verdict = excluded.on_chain_verdict`
      ).run(jobPda, JSON.stringify(report), onChainVerdict);
    }

    // 8. Post verdict on-chain signed by arbiter
    const verdictUri = `${env.BACKEND_PUBLIC_URL.replace(/\/+$/, "")}/api/reports/${jobPda}`;
    console.log(`[evaluate] ${jobPda} submitting propose_verdict (${onChainVerdict}, score=${report.score})`);

    let txSignature: string;
    try {
      txSignature = await proposeVerdictOnChain(
        jobPda,
        onChainVerdict,
        report.score,
        verdictUri
      );
    } catch (err) {
      if (isInvalidStatusAnchorError(err)) {
        console.warn(`[evaluate] ${jobPda} on-chain status changed before propose_verdict landed`);
        throw new HttpError(
          409,
          "INVALID_JOB_STATUS",
          "Job is no longer in 'submitted' status (already approved or disputed)"
        );
      }
      throw new HttpError(
        502,
        "TX_FAILED",
        `Failed to submit propose_verdict on-chain: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // 9. Persist tx_sig
    db.prepare(
      `UPDATE reports SET on_chain_verdict = ?, tx_sig = ? WHERE job_pda = ?`
    ).run(onChainVerdict, txSignature, jobPda);

    console.log(`[evaluate] ${jobPda} verdict posted on-chain: ${txSignature}`);
    res.json({ report, onChainVerdict, txSignature });
  } finally {
    inFlightEvaluations.delete(jobPda);
  }
});

const disputeNoteSchema = z.object({
  wallet: z.string().trim().min(32).max(64),
  reason: z.string().trim().min(1).max(1000),
});

interface DisputeNoteRow {
  wallet: string;
  reason: string;
  created_at: string;
}

// 3.8  POST /api/jobs/:jobPda/dispute-note
jobsRouter.post("/jobs/:jobPda/dispute-note", (req, res) => {
  const jobPda = requirePubkey(req.params.jobPda);
  const { wallet, reason } = parseBody(disputeNoteSchema, req.body);
  requirePubkey(wallet);

  db.prepare(
    `INSERT INTO dispute_notes (job_pda, wallet, reason) VALUES (?, ?, ?)`
  ).run(jobPda, wallet, reason);

  console.log(`[dispute-note] ${jobPda} note added by ${wallet}`);
  res.status(201).json({ ok: true });
});

// 3.8  GET /api/jobs/:jobPda/dispute-notes
jobsRouter.get("/jobs/:jobPda/dispute-notes", (req, res) => {
  const jobPda = requirePubkey(req.params.jobPda);

  const rows = db
    .prepare(
      `SELECT wallet, reason, created_at
       FROM dispute_notes
       WHERE job_pda = ?
       ORDER BY id ASC`
    )
    .all(jobPda) as DisputeNoteRow[];

  res.json({
    notes: rows.map((r) => ({
      wallet: r.wallet,
      reason: r.reason,
      createdAt: r.created_at,
    })),
  });
});