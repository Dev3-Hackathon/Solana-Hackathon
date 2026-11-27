import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { env } from "./env";

const file = path.resolve(env.DATABASE_PATH);
fs.mkdirSync(path.dirname(file), { recursive: true });

export const db = new Database(file);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Schema from INTERFACE.md §3.10
db.exec(`
  CREATE TABLE IF NOT EXISTS specs (
    id            TEXT PRIMARY KEY,
    title         TEXT NOT NULL,
    description   TEXT NOT NULL,
    criteria_json TEXT NOT NULL,
    spec_hash     TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE TABLE IF NOT EXISTS job_specs (
    job_pda TEXT PRIMARY KEY,
    spec_id TEXT NOT NULL REFERENCES specs(id)
  );

  CREATE TABLE IF NOT EXISTS snapshots (
    id         TEXT PRIMARY KEY,
    job_pda    TEXT NOT NULL,
    source_url TEXT NOT NULL,
    content    BLOB NOT NULL,
    sha256     TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX IF NOT EXISTS idx_snapshots_job ON snapshots(job_pda);

  CREATE TABLE IF NOT EXISTS reports (
    job_pda          TEXT PRIMARY KEY,
    verdict_json     TEXT NOT NULL,
    on_chain_verdict TEXT,
    tx_sig           TEXT,
    created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE TABLE IF NOT EXISTS dispute_notes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    job_pda    TEXT NOT NULL,
    wallet     TEXT NOT NULL,
    reason     TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX IF NOT EXISTS idx_notes_job ON dispute_notes(job_pda);
`);

// Migration: snapshots.content_type was added in Step 4 (text | html | github_bundle).
const snapshotCols = db.prepare(`PRAGMA table_info(snapshots)`).all() as { name: string }[];
if (!snapshotCols.some((c) => c.name === "content_type")) {
  db.exec(`ALTER TABLE snapshots ADD COLUMN content_type TEXT NOT NULL DEFAULT 'text'`);
}