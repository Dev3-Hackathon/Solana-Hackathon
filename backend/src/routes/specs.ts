import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "../db";
import { specHashHex } from "../hash";
import { HttpError, parseBody, requirePubkey } from "../http";

export const specsRouter = Router();

// Limits from INTERFACE.md §3.1 (criteria: 3-6, each <= 200 chars).
// Strings are trimmed BEFORE hashing. The stored text and the hash always match,
// and clients must use the specHash we return rather than computing their own.
const specSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(2000),
  criteria: z.array(z.string().trim().min(1).max(200)).min(3).max(6),
});

const linkSchema = z.object({
  specId: z.string().min(1).max(100),
});

// 3.1  POST /api/specs
specsRouter.post("/specs", (req, res) => {
  const spec = parseBody(specSchema, req.body);
  const specHash = specHashHex(spec);
  const specId = randomUUID();

  db.prepare(
    `INSERT INTO specs (id, title, description, criteria_json, spec_hash)
     VALUES (?, ?, ?, ?, ?)`
  ).run(specId, spec.title, spec.description, JSON.stringify(spec.criteria), specHash);

  res.status(201).json({ specId, specHash });
});

// 3.2  POST /api/jobs/:jobPda/link-spec
// TODO (Step 6): read the on-chain Job and require job.spec_hash == the spec's hash.
// Until then the link is NOT verified against the chain, and we say so in the response.
specsRouter.post("/jobs/:jobPda/link-spec", (req, res) => {
  const jobPda = requirePubkey(req.params.jobPda);
  const { specId } = parseBody(linkSchema, req.body);

  const spec = db.prepare(`SELECT id FROM specs WHERE id = ?`).get(specId);
  if (!spec) throw new HttpError(404, "SPEC_NOT_FOUND", "No spec with that specId");

  const existing = db
    .prepare(`SELECT spec_id FROM job_specs WHERE job_pda = ?`)
    .get(jobPda) as { spec_id: string } | undefined;

  if (existing && existing.spec_id !== specId) {
    throw new HttpError(409, "JOB_ALREADY_LINKED", "This job is already linked to a different spec");
  }
  if (!existing) {
    db.prepare(`INSERT INTO job_specs (job_pda, spec_id) VALUES (?, ?)`).run(jobPda, specId);
  }

  console.warn(`[link-spec] ${jobPda} linked to ${specId} (NOT verified on-chain yet)`);
  res.json({ ok: true, verified: false });
});

// 3.3  GET /api/jobs/:jobPda/spec
specsRouter.get("/jobs/:jobPda/spec", (req, res) => {
  const jobPda = requirePubkey(req.params.jobPda);

  const row = db
    .prepare(
      `SELECT s.title, s.description, s.criteria_json, s.spec_hash
       FROM job_specs js JOIN specs s ON s.id = js.spec_id
       WHERE js.job_pda = ?`
    )
    .get(jobPda) as
    | { title: string; description: string; criteria_json: string; spec_hash: string }
    | undefined;

  if (!row) throw new HttpError(404, "SPEC_NOT_FOUND", "No spec is linked to this job");

  res.json({
    title: row.title,
    description: row.description,
    criteria: JSON.parse(row.criteria_json),
    specHash: row.spec_hash,
  });
});