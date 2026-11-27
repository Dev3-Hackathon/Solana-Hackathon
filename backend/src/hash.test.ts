import test from "node:test";
import assert from "node:assert/strict";
import { sha256Hex, canonicalSpec, specHashHex, hexToBytes, bytesToHex } from "./hash";

test("sha256 matches known vectors", () => {
  assert.equal(
    sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
  );
  assert.equal(
    sha256Hex(""),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  );
});

test("canonical spec always uses key order title, description, criteria", () => {
  // Deliberately pass the keys in a different order
  const spec = {
    criteria: ["a", "b", "c"],
    description: "d",
    title: "t",
  };
  assert.equal(
    canonicalSpec(spec),
    '{"title":"t","description":"d","criteria":["a","b","c"]}'
  );
});

test("known spec gives a known hash", () => {
  const spec = {
    title: "Landing page",
    description: "Build a landing page for a cafe",
    criteria: [
      "Responsive navbar",
      "Contact form",
      "3 menu items",
      "Footer with opening hours",
    ],
  };
  assert.equal(
    specHashHex(spec),
    "25c06aa77ba75988a84de3f03150aa041293df42edacc5f25e14629c9f03a517"
  );
});

test("hex <-> bytes round trip gives 32 bytes", () => {
  const hex = sha256Hex("abc");
  const bytes = hexToBytes(hex);
  assert.equal(bytes.length, 32);
  assert.equal(bytesToHex(bytes), hex);
});

test("hexToBytes rejects bad input", () => {
  assert.throws(() => hexToBytes("xyz"));
  assert.throws(() => hexToBytes("ab"));
});