import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { env } from "./env";
import { arbiter, getArbiterBalanceSol } from "./solana";
import "./db";
import { HttpError } from "./http";
import { specsRouter } from "./routes/specs";
import { reportsRouter } from "./routes/reports";
import { deliverablesRouter } from "./routes/deliverables";
import { jobsRouter } from "./routes/jobs";

const app = express();
app.set("trust proxy", 1);
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const costlyEndpointLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: "Too many requests; please wait a minute before retrying",
      code: "RATE_LIMITED",
    });
  },
});

app.get("/api/health", async (_req, res) => {
  let aiService: "up" | "down" = "down";
  try {
    const r = await fetch(`${env.AI_SERVICE_URL}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    if (r.ok) aiService = "up";
  } catch {
    // AI service not running yet
  }

  const arbiterBalanceSol = await getArbiterBalanceSol();
  if (arbiterBalanceSol !== null && arbiterBalanceSol < 0.05) {
    console.warn(`[health] Low arbiter balance: ${arbiterBalanceSol} SOL`);
  }

  res.json({
    ok: true,
    arbiter: arbiter.publicKey.toBase58(),
    arbiterBalanceSol,
    aiService,
  });
});

app.use("/api/deliverables/snapshot", costlyEndpointLimiter);
app.use("/api/jobs/:jobPda/evaluate", costlyEndpointLimiter);
app.use("/api/deliverables/snapshot", costlyEndpointLimiter);
app.use("/api/jobs/create-for", costlyEndpointLimiter);

app.use("/api", specsRouter);
app.use("/api", reportsRouter);
app.use("/api", deliverablesRouter);
app.use("/api", jobsRouter);

// 404 + error handler: all errors use { error, code }
app.use((_req, res) => {
  res.status(404).json({ error: "Not found", code: "NOT_FOUND" });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  const type = (err as { type?: string } | null)?.type;
  if (type === "entity.parse.failed") {
    res.status(400).json({ error: "Request body is not valid JSON", code: "INVALID_JSON" });
    return;
  }
  if (type === "entity.too.large") {
    res.status(413).json({ error: "Request body too large", code: "PAYLOAD_TOO_LARGE" });
    return;
  }
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
});

app.listen(env.PORT, () => {
  console.log(`Backend listening on http://localhost:${env.PORT}`);
  console.log(`Arbiter pubkey: ${arbiter.publicKey.toBase58()}`);
});