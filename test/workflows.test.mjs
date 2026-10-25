import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { test } from "node:test";
import { compareNote } from "../workflows/compare-two-creators.mjs";
import { competitorBrief, validate } from "../workflows/competitor-brief.mjs";
import { readJson } from "../workflows/lib.mjs";

const root = new URL("../", import.meta.url);
const fixture = (name) => readJson(new URL(`fixtures/${name}.json`, root));
const UPDATE = process.env.UPDATE_GOLDEN === "1";

function golden(name, actual) {
  const url = new URL(`expected/${name}.md`, root);
  if (UPDATE) writeFileSync(url, actual);
  assert.equal(actual, readFileSync(url, "utf8").replace(/\r\n/g, "\n"));
}

const COMPARES = ["compare-same-tier", "compare-different-groups", "compare-one-not-tracked"];

for (const name of COMPARES) {
  test(`compare note matches golden: ${name}`, () => golden(name, compareNote(fixture(name))));
}

test("compare note never names a winner", () => {
  for (const name of COMPARES) assert.doesNotMatch(compareNote(fixture(name)), /winner|better|best|recommend/i);
});

test("an untracked side gets no band", () => {
  const note = compareNote(fixture("compare-one-not-tracked"));
  assert.doesNotMatch(note, /is (higher|lower|similar)/);
  assert.match(note, /Quality score: not comparable \(one account is not tracked\)/);
});

test("different formula versions are not compared", () => {
  const note = compareNote(fixture("compare-different-groups"));
  assert.match(note, /Quality score: not comparable \(the scores come from different formula versions\)/);
  assert.match(note, /different follower tiers/);
  assert.match(note, /measured 10 days apart/);
});

test("bands come from the payload, not recomputed", () => {
  const c = fixture("compare-same-tier");
  c.bands.engagement = { band: "lower", reason: null };
  assert.match(compareNote(c), /Engagement rate: example-creator-a is lower than/);
});

test("competitor brief matches golden", () => golden("competitor-brief", competitorBrief(fixture("brief-input"))));

test("measured and estimated values never share a table", () => {
  const brief = competitorBrief(fixture("brief-input"));
  const sections = brief.split("\n## ");
  const measured = sections.find((s) => s.startsWith("Measured Reel plays"));
  const estimated = sections.find((s) => s.startsWith("Estimated Story views"));
  assert.ok(measured && estimated);
  assert.doesNotMatch(measured, /88,400/);
  assert.doesNotMatch(estimated, /486,300/);
  assert.doesNotMatch(brief, /total/i);
});

test("inconsistent brief input is refused", () => {
  const bad = fixture("brief-input");
  bad.brands[0].formats.reel += 1;
  assert.throws(() => validate(bad), /formats do not add up/);
  const pair = fixture("brief-input");
  pair.shared_creators[0].creators = 99;
  assert.throws(() => validate(pair), /more shared creators/);
  const subj = fixture("brief-input");
  subj.subject = "Brand Z";
  assert.throws(() => validate(subj), /not in brands/);
});
