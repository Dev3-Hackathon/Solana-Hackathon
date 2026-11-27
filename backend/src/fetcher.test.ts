import test from "node:test";
import assert from "node:assert/strict";
import { assertPublicUrl, isPrivateIp } from "./safeFetch";
import { isCandidateFile, parseGithubUrl } from "./github";

test("isPrivateIp blocks private and local addresses", () => {
  for (const ip of [
    "127.0.0.1", "10.1.2.3", "192.168.0.5", "172.16.0.1", "172.31.255.255",
    "169.254.169.254", "0.0.0.0", "100.64.0.1", "224.0.0.1",
    "::1", "::", "fc00::1", "fd12::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:7f00:1",
  ]) {
    assert.equal(isPrivateIp(ip), true, `${ip} should be blocked`);
  }
});

test("isPrivateIp allows public addresses", () => {
  for (const ip of ["8.8.8.8", "1.1.1.1", "140.82.112.3", "172.32.0.1", "2606:4700:4700::1111"]) {
    assert.equal(isPrivateIp(ip), false, `${ip} should be allowed`);
  }
});

test("assertPublicUrl rejects unsafe URLs", async () => {
  for (const u of [
    "ftp://example.com/file",
    "file:///etc/passwd",
    "http://localhost/x",
    "http://127.0.0.1/x",
    "http://[::1]/x",
    "http://10.0.0.1/x",
    "http://192.168.1.1/x",
    "http://169.254.169.254/latest/meta-data",
    "http://2130706433/", // 127.0.0.1 written as one number
    "http://example.com:8080/x",
    "https://user:pass@example.com/x",
    "http://printer.local/x",
  ]) {
    await assert.rejects(assertPublicUrl(new URL(u)), `${u} should be rejected`);
  }
});

test("parseGithubUrl understands repo, branch and file URLs", () => {
  assert.equal(parseGithubUrl(new URL("https://example.com/a/b")), null);

  assert.deepEqual(parseGithubUrl(new URL("https://github.com/octocat/Hello-World")), {
    kind: "repo", owner: "octocat", repo: "Hello-World", ref: "HEAD",
  });
  assert.deepEqual(parseGithubUrl(new URL("https://github.com/octocat/Hello-World.git/")), {
    kind: "repo", owner: "octocat", repo: "Hello-World", ref: "HEAD",
  });
  assert.deepEqual(parseGithubUrl(new URL("https://github.com/octocat/Hello-World/tree/dev")), {
    kind: "repo", owner: "octocat", repo: "Hello-World", ref: "dev",
  });
  assert.deepEqual(parseGithubUrl(new URL("https://github.com/o/r/blob/main/src/app.js")), {
    kind: "file", rawUrl: "https://raw.githubusercontent.com/o/r/main/src/app.js",
  });
  assert.throws(() => parseGithubUrl(new URL("https://github.com/octocat")));
  assert.throws(() => parseGithubUrl(new URL("https://github.com/o/r/issues/1")));
});

test("isCandidateFile keeps source files and skips junk", () => {
  assert.equal(isCandidateFile("src/index.ts", 1000), true);
  assert.equal(isCandidateFile("Dockerfile", 300), true);
  assert.equal(isCandidateFile("package-lock.json", 1000), false);
  assert.equal(isCandidateFile("node_modules/x/index.js", 1000), false);
  assert.equal(isCandidateFile("logo.png", 1000), false);
  assert.equal(isCandidateFile("big.js", 60 * 1024), false);
  assert.equal(isCandidateFile("empty.js", 0), false);
  assert.equal(isCandidateFile("app.min.js", 1000), false);
});