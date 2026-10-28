// Comparison note for two creators from a saved Starlecta comparison payload.
// Uses the bands the payload carries; never recomputes them and never names a winner.
import { int, pct, platformName, runCli, table } from "./lib.mjs";

const NOTES = {
  different_size_groups: "The two accounts are in different follower tiers; rates and scores move with size.",
  engagement_dates_far_apart: (c) =>
    `The engagement rates were measured ${c.comparable.er_dates_gap_days} days apart.`,
  a_not_tracked: null,
  b_not_tracked: null,
};

const REASONS = {
  not_tracked: "one account is not tracked",
  score_missing: "a score is missing on one side",
  different_formula_versions: "the scores come from different formula versions",
  rate_missing: "an engagement rate is missing on one side",
};

function scoreCell(s) {
  if (!s.found) return "not tracked";
  const q = s.score;
  if (q.display == null) return `no score: ${q.reason}`;
  return `${q.display} (coverage ${pct(q.coverage)}, confidence ${q.confidence})`;
}

function rateCell(s) {
  if (!s.found) return "not tracked";
  const e = s.engagement;
  if (e.rate == null) return `not measured: ${e.reason}`;
  const old = e.stale ? ", older than 7 days" : "";
  return `${e.rate}% (${e.items_90d} posts and reels, as of ${e.as_of}${old})`;
}

const cell = (s, f) => (s.found ? f(s) ?? "unknown" : "not tracked");

function bandLine(name, band, c, unit) {
  if (band.band === "not_comparable") return `- ${name}: not comparable (${REASONS[band.reason] ?? band.reason}).`;
  const words = { higher: "higher than", lower: "lower than", similar: "similar to" }[band.band];
  return `- ${name}: ${c.a.handle} is ${words} ${c.b.handle} (${unit}).`;
}

export function compareNote(c) {
  const { a, b } = c;
  const m = c.margins;
  const lines = [
    `# Comparison note: ${a.handle} and ${b.handle}`,
    "",
    `Source: Starlecta public comparison (${c.method_version}), ${platformName(c.platform)}. Stored values only.`,
    "",
    table(
      ["", a.handle, b.handle],
      [
        ["Follower tier", cell(a, (s) => s.tier_label), cell(b, (s) => s.tier_label)],
        ["Followers", cell(a, (s) => (s.followers == null ? null : int(s.followers))), cell(b, (s) => (s.followers == null ? null : int(s.followers)))],
        ["Category", cell(a, (s) => s.category_label), cell(b, (s) => s.category_label)],
        ["Quality score (SQS)", scoreCell(a), scoreCell(b)],
        ["SQS formula", cell(a, (s) => s.score.formula_version ?? "none yet"), cell(b, (s) => s.score.formula_version ?? "none yet")],
        ["Engagement rate, 90 days", rateCell(a), rateCell(b)],
      ],
    ),
    "",
    "## How they stand",
    "",
    bandLine("Quality score", c.bands.score, c, `"similar" means within ${m.score_points} points`),
    bandLine("Engagement rate", c.bands.engagement, c, `"similar" means within ${pct(m.engagement_relative)} of the higher rate`),
  ];

  const notes = c.notes
    .map((n) => (typeof NOTES[n] === "function" ? NOTES[n](c) : n in NOTES ? NOTES[n] : n))
    .filter(Boolean);
  for (const s of [a, b]) if (s.found && s.engagement.stale) notes.push(`${s.handle}: the engagement rate is older than 7 days.`);
  for (const s of [a, b]) if (!s.found && s.message) notes.push(`${s.handle}: ${s.message}`);
  notes.push(...Object.values(c.limits));
  lines.push("", "## Read before deciding", "", ...[...new Set(notes)].map((n) => `- ${n}`));
  lines.push(
    "",
    "Definitions: https://starlecta.com/en/methods/sqs and https://starlecta.com/en/methods/engagement",
    "",
  );
  return lines.join("\n");
}

runCli(import.meta.url, compareNote);
