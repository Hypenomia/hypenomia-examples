import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { readJson } from "../workflows/lib.mjs";

const root = new URL("../", import.meta.url);
const fixtureDir = new URL("fixtures/", root);
const files = readdirSync(fixtureDir).filter((f) => f.endsWith(".json"));

const PREFIX = (f) => (f.startsWith("benchmark") ? "benchmark" : f.startsWith("compare") ? "compare" : "brief");
const MAPS = new Set(["benchmark.method.er_methodology_versions", "benchmark.cells[].excluded"]);

function paths(node, prefix, out) {
  if (!prefix.endsWith("[]")) out.add(prefix);
  if (Array.isArray(node)) {
    for (const v of node) paths(v, `${prefix}[]`, out);
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (k.startsWith("_")) continue;
      if (MAPS.has(prefix)) paths(v, `${prefix}.*`, out);
      else if (prefix === "compare" && (k === "a" || k === "b")) {
        out.add(`compare.${k}`);
        paths(v, "summary", out);
      } else paths(v, `${prefix}.${k}`, out);
    }
  }
  return out;
}

function fixturePaths() {
  const out = new Set();
  for (const f of files) paths(readJson(new URL(f, fixtureDir)), PREFIX(f), out);
  for (const p of ["benchmark", "compare", "brief", "summary"]) out.delete(p);
  return out;
}

function dictionaryPaths() {
  const text = readFileSync(new URL("DATA-DICTIONARY.md", root), "utf8");
  return new Set([...text.matchAll(/^\| `([^`]+)` \|/gm)].map((m) => m[1]));
}

test("data dictionary and fixtures name the same fields", () => {
  const fx = fixturePaths();
  const dict = dictionaryPaths();
  assert.deepEqual([...fx].filter((p) => !dict.has(p)).sort(), [], "fields missing from DATA-DICTIONARY.md");
  assert.deepEqual([...dict].filter((p) => !fx.has(p)).sort(), [], "dictionary rows with no fixture field");
});

test("every fixture is marked synthetic", () => {
  for (const f of files) assert.match(readJson(new URL(f, fixtureDir))._synthetic, /^Synthetic/, f);
});

test("fixtures carry no real identities, contacts or keys", () => {
  for (const f of files) {
    const text = readFileSync(new URL(f, fixtureDir), "utf8");
    assert.doesNotMatch(text, /@|instagram\.com\/|https?:\/\//, f);
    assert.doesNotMatch(text, /(api_?key|token|secret)=/i, f);
    assert.doesNotMatch(text, /"(id|ig_user_id|username|email)":/, f);
    for (const [, h] of text.matchAll(/"handle": "([^"]*)"/g)) assert.match(h, /^example-creator-[a-z]$/, f);
  }
});
