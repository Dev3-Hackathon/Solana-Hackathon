import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateDeliverable,
  AiServiceValidationError,
  AiServiceUnavailableError,
  AiServiceTimeoutError,
  AiServiceResponseError,
  type EvaluateRequest,
  type Verdict,
} from "./ai";

const sampleRequest: EvaluateRequest = {
  job_title: "Landing page",
  description: "Build a landing page for a cafe",
  criteria: ["Responsive navbar", "Contact form"],
  deliverable: {
    source_url: "https://example.com/index.html",
    content: "<html><body><nav>Menu</nav><form><input type='email'/></form></body></html>",
    content_type: "html",
  },
};

const sampleVerdict: Verdict = {
  verdict: "pass",
  score: 92,
  criteria: [
    {
      criterion: "Responsive navbar",
      met: true,
      evidence: "Found <nav> element with navigation links.",
      confidence: 0.95,
    },
    {
      criterion: "Contact form",
      met: null,
      evidence: "Form tag exists but submission handler could not be verified statically.",
      confidence: 0.6,
    },
  ],
  summary: "Deliverable satisfies the core structural criteria.",
  risks: ["Form backend endpoint not verified"],
  model: "gemini-4-hydrogen",
  evaluatedAt: "2026-11-27T12:00:00Z",
};

test("evaluateDeliverable returns typed Verdict on HTTP 200", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;

  const mockFetch: typeof fetch = async (url, init) => {
    capturedUrl = String(url);
    capturedInit = init;
    return new Response(JSON.stringify(sampleVerdict), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const result = await evaluateDeliverable(sampleRequest, {
    baseUrl: "http://localhost:8000/",
    fetchFn: mockFetch,
  });

  assert.equal(capturedUrl, "http://localhost:8000/evaluate");
  assert.equal(capturedInit?.method, "POST");
  assert.deepEqual(JSON.parse(String(capturedInit?.body)), sampleRequest);
  assert.deepEqual(result, sampleVerdict);
  assert.equal(result.criteria[1].met, null);
});

test("evaluateDeliverable throws AiServiceValidationError on HTTP 422", async () => {
  const errorPayload = {
    detail: [{ loc: ["body", "criteria"], msg: "List should have at least 1 item", type: "too_short" }],
  };

  const mockFetch: typeof fetch = async () =>
    new Response(JSON.stringify(errorPayload), {
      status: 422,
      headers: { "Content-Type": "application/json" },
    });

  await assert.rejects(
    () => evaluateDeliverable(sampleRequest, { fetchFn: mockFetch }),
    (err: unknown) => {
      assert.ok(err instanceof AiServiceValidationError);
      assert.equal(err.status, 422);
      assert.deepEqual(err.body, errorPayload);
      return true;
    }
  );
});

test("evaluateDeliverable throws AiServiceUnavailableError on HTTP 502 without retrying", async () => {
  let callCount = 0;
  const errorPayload = { detail: "All LLM providers failed" };

  const mockFetch: typeof fetch = async () => {
    callCount += 1;
    return new Response(JSON.stringify(errorPayload), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  };

  await assert.rejects(
    () => evaluateDeliverable(sampleRequest, { fetchFn: mockFetch }),
    (err: unknown) => {
      assert.ok(err instanceof AiServiceUnavailableError);
      assert.equal(err.status, 502);
      assert.deepEqual(err.body, errorPayload);
      return true;
    }
  );

  assert.equal(callCount, 1, "must not retry 502 responses");
});

test("evaluateDeliverable throws AiServiceResponseError on malformed HTTP 200 payload", async () => {
  const malformedPayload = {
    verdict: "pass",
    score: 95,
    // missing `criteria`, `summary`, `risks`
  };

  const mockFetch: typeof fetch = async () =>
    new Response(JSON.stringify(malformedPayload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  await assert.rejects(
    () => evaluateDeliverable(sampleRequest, { fetchFn: mockFetch }),
    (err: unknown) => {
      assert.ok(err instanceof AiServiceResponseError);
      assert.equal(err.status, 200);
      assert.match(err.message, /malformed Verdict payload/);
      return true;
    }
  );
});

test("evaluateDeliverable throws AiServiceTimeoutError when request exceeds timeout", async () => {
  const mockFetch: typeof fetch = (_url, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const abortErr = new Error("The operation was aborted");
        abortErr.name = "AbortError";
        reject(abortErr);
      });
    });

  await assert.rejects(
    () => evaluateDeliverable(sampleRequest, { timeoutMs: 15, fetchFn: mockFetch }),
    (err: unknown) => {
      assert.ok(err instanceof AiServiceTimeoutError);
      assert.match(err.message, /timed out after 15ms/);
      return true;
    }
  );
});

test("contract test: matches Hamza's exact HTML request and inconclusive Verdict payload", async () => {
  const hamzaRequest: EvaluateRequest = {
    job_title: "Landing page",
    description: "Build a landing page for a cafe",
    criteria: [
      "Responsive navbar",
      "Contact form",
      "3 menu items",
      "Footer with opening hours",
    ],
    deliverable: {
      source_url: "https://example.com/cafe/index.html",
      content:
        '<!doctype html><html><body><nav class="nav">Menu</nav><form id="contact"></form></body></html>',
      content_type: "html",
    },
  };

  const hamzaResponse = {
    verdict: "inconclusive",
    score: 40,
    criteria: [
      { criterion: "Responsive navbar", met: true, evidence: '<nav class="nav">', confidence: 0.7 },
      { criterion: "Contact form", met: true, evidence: '<form id="contact">', confidence: 0.8 },
      { criterion: "3 menu items", met: null, evidence: "", confidence: 0.2 },
      { criterion: "Footer with opening hours", met: false, evidence: "", confidence: 0.9 },
    ],
    summary: "Partial implementation; some criteria could not be verified.",
    risks: ["incomplete_deliverable"],
  };

  let sentBody: unknown;
  const mockFetch: typeof fetch = async (_url, init) => {
    sentBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify(hamzaResponse), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const result = await evaluateDeliverable(hamzaRequest, { fetchFn: mockFetch });

  assert.deepEqual(sentBody, hamzaRequest);
  assert.equal(result.verdict, "inconclusive");
  assert.equal(result.score, 40);
  assert.deepEqual(
    result.criteria.map((c) => c.criterion),
    hamzaRequest.criteria
  );
  assert.equal(result.criteria[2].met, null);
  assert.equal(result.criteria[2].evidence, "");
  assert.deepEqual(result.risks, ["incomplete_deliverable"]);
});