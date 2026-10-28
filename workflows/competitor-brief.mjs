// Anonymous competitor brief from brand-level aggregates (brief input v1, see DATA-DICTIONARY.md).
// Measured Reel plays and estimated Story views stay in separate tables and are never summed.
import { int, pct, platformName, runCli, table } from "./lib.mjs";

export function validate(input) {
  const labels = new Set(input.brands.map((b) => b.label));
  if (!labels.has(input.subject)) throw new Error(`subject ${input.subject} is not in brands`);
  for (const b of input.brands) {
    const f = b.formats;
    if (f.reel + f.feed + f.story !== b.verified_posts)
      throw new Error(`${b.label}: formats do not add up to verified_posts`);
    if (b.returning_creators > b.creators) throw new Error(`${b.label}: more returning than creators`);
    const s = b.story_views_estimated;
    if (s && !(s.low <= s.mid && s.mid <= s.high)) throw new Error(`${b.label}: story estimate range out of order`);
    if (f.story > 0 && s === undefined) throw new Error(`${b.label}: story estimate must be null or a range`);
  }
  const byLabel = Object.fromEntries(input.brands.map((b) => [b.label, b]));
  for (const p of input.shared_creators) {
    if (!byLabel[p.a] || !byLabel[p.b]) throw new Error(`shared_creators names an unknown brand`);
    if (p.creators > Math.min(byLabel[p.a].creators, byLabel[p.b].creators))
      throw new Error(`${p.a}/${p.b}: more shared creators than one pool has`);
  }
}

const rank = (brands, key, label) =>
  1 + brands.filter((b) => key(b) > key(brands.find((x) => x.label === label))).length;

export function competitorBrief(input) {
  validate(input);
  const { brands, subject, period } = input;
  const me = brands.find((b) => b.label === subject);
  const others = brands.length - 1;
  const share = (b, k) => (b.verified_posts ? pct(b.formats[k] / b.verified_posts) : "n/a");

  const pairs = input.shared_creators
    .filter((p) => p.a === subject || p.b === subject)
    .sort((x, y) => y.creators - x.creators);

  const lines = [
    `# Competitor brief: ${subject} and ${others} tracked brands`,
    "",
    `${platformName(input.platform)}, ${period.start} to ${period.end} (${period.days} days). Synthetic example data.`,
    "",
    "## Creator pools",
    "",
    "Only verified brand posts count: a post needs link and tag evidence.",
    "",
    table(
      ["Brand", "Verified posts", "Left out (no evidence)", "Creators", "Returning", "New"],
      brands.map((b) => [b.label, b.verified_posts, b.left_out_posts, b.creators, b.returning_creators, b.creators - b.returning_creators]),
    ),
    "",
    `${subject} ranks ${rank(brands, (b) => b.verified_posts, subject)} of ${brands.length} by verified posts and ${rank(brands, (b) => b.creators, subject)} of ${brands.length} by creators.`,
    "",
    "## Format mix",
    "",
    table(
      ["Brand", "Reels", "Feed", "Stories"],
      brands.map((b) => [b.label, share(b, "reel"), share(b, "feed"), share(b, "story")]),
    ),
    "",
    "## Measured Reel plays",
    "",
    "Plays reported by the platform: gross plays, not unique reach.",
    "",
    table(["Brand", "Reel plays", "Reels"], brands.map((b) => [b.label, int(b.reel_plays_measured), b.formats.reel])),
    "",
    "## Estimated Story views",
    "",
    "Modelled, not measured. The low to high range is a modelled spread, not a confidence interval.",
    "",
    table(
      ["Brand", "Estimate", "Low to high", "Stories"],
      brands.map((b) => {
        const s = b.story_views_estimated;
        if (!s) return [b.label, b.formats.story ? "not available" : "no Stories", "", b.formats.story];
        return [b.label, int(s.mid), `${int(s.low)} to ${int(s.high)}`, b.formats.story];
      }),
    ),
    "",
    "## Shared creators",
    "",
    "Creator accounts that posted for both brands in the period. This counts accounts, not shared audience.",
    "",
    table(["Brands", "Shared creators", `Share of ${subject} pool`], pairs.map((p) => [
      `${p.a} and ${p.b}`, p.creators, me.creators ? pct(p.creators / me.creators) : "n/a",
    ])),
    "",
    "## Limits",
    "",
    "- Covers accounts and brands in the tracked set, not all of Instagram.",
    `- ${int(me.left_out_posts)} possible ${subject} posts were left out for lack of evidence.`,
    "- Measured and estimated values are never added into one number.",
    "- Story method: https://starlecta.com/en/methods/story-estimate",
    "",
  ];
  return lines.join("\n");
}

runCli(import.meta.url, competitorBrief);
