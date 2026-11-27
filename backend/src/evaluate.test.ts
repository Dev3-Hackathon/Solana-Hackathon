import test from "node:test";
import assert from "node:assert/strict";
import { Verdict } from "./ai";
import {
  buildMalformedFallbackReport,
  isInvalidStatusAnchorError,
  resolveOnChainVerdict,
  VERDICT_CODES,
} from "./evaluate";

function makeVerdict(overrides: Partial<Verdict> = {}): Verdict {
  return {
    verdict: "pass",
    score: 85,
    criteria: [
      { criterion: "Criterion 1", met: true, evidence: "Found in README", confidence: 0.95 },
      { criterion: "Criterion 2", met: true, evidence: "Found in index.ts", confidence: 0.9 },
      { criterion: "Criterion 3", met: true, evidence: "Tests pass", confidence: 0.92 },
    ],
    summary: "All criteria satisfied.",
    risks: [],
    ...overrides,
  };
}

test("resolveOnChainVerdict returns pass when verdict=pass, score>=70, and all criteria met", () => {
  assert.equal(resolveOnChainVerdict(makeVerdict({ score: 70 })), "pass");
  assert.equal(resolveOnChainVerdict(makeVerdict({ score: 100 })), "pass");
  assert.equal(VERDICT_CODES.pass, 1);
});

test("resolveOnChainVerdict downgrades pass to fail when score < 70", () => {
  assert.equal(resolveOnChainVerdict(makeVerdict({ score: 69 })), "fail");
});

test("resolveOnChainVerdict downgrades pass to fail when any criterion is false or null", () => {
  const withFalse = makeVerdict({
    criteria: [
      { criterion: "C1", met: true, evidence: "ok", confidence: 0.9 },
      { criterion: "C2", met: false, evidence: "missing", confidence: 0.9 },
      { criterion: "C3", met: true, evidence: "ok", confidence: 0.9 },
    ],
  });
  assert.equal(resolveOnChainVerdict(withFalse), "fail");

  const withNull = makeVerdict({
    criteria: [
      { criterion: "C1", met: true, evidence: "ok", confidence: 0.9 },
      { criterion: "C2", met: null, evidence: "", confidence: 0.2 },
      { criterion: "C3", met: true, evidence: "ok", confidence: 0.9 },
    ],
  });
  assert.equal(resolveOnChainVerdict(withNull), "fail");
});

test("resolveOnChainVerdict preserves inconclusive even if score >= 70", () => {
  const inc = makeVerdict({ verdict: "inconclusive", score: 80 });
  assert.equal(resolveOnChainVerdict(inc), "inconclusive");
  assert.equal(VERDICT_CODES.inconclusive, 3);
});

test("buildMalformedFallbackReport creates valid inconclusive structure", () => {
  const report = buildMalformedFallbackReport(["A", "B", "C"], "Bad JSON");
  assert.equal(report.verdict, "inconclusive");
  assert.equal(report.score, 0);
  assert.equal(report.criteria.length, 3);
  assert.equal(report.criteria[0].met, null);
  assert.deepEqual(report.risks, ["model_output_invalid"]);
});

test("isInvalidStatusAnchorError detects Anchor InvalidStatus errors", () => {
  assert.equal(
    isInvalidStatusAnchorError(new Error("AnchorError thrown in programs/escrow. Error Code: InvalidStatus.")),
    true
  );
  assert.equal(isInvalidStatusAnchorError(new Error("Blockhash not found")), false);
});