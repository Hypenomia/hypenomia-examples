// Pure tool handlers: (snapshot, args) -> { data, missing_reason, outcome, file }.
// No I/O. Arguments are already validated by the schemas in server.mjs.
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

export const MAX_RESULTS = 3;
const NOT_IN_POOL = "not_in_open_pool";
const SITE = "https://hypenomia.com";

function creatorCard(c, lang) {
  return {
    slug: c.slug,
    handle: c.handle,
    display_name: c.display_name,
    category: c.category,
    category_label: c.category_label,
    tier: c.tier,
    tier_label: c.tier_label,
    followers: { ...c.followers },
    engagement: { ...c.engagement },
    score: { ...c.score },
    turkey_basis: [...c.turkey_basis],
    pool_reason: { ...c.pool_reason, turkey_basis: [...c.pool_reason.turkey_basis] },
    url: `${SITE}/${lang}/tools/samples/${c.slug}`,
  };
}

// Same fixed order as the site: rounded followers descending (missing last), then slug.
function poolOrder(a, b) {
  return (b.followers.rounded ?? -1) - (a.followers.rounded ?? -1) || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
}

// A file that is not published yet: no content, the file's own reason.
function preparing(file) {
  return { file, missing_reason: file.header.missing_reason ?? "in_preparation", outcome: "in_preparation", data: { found: false, status: file.header.status } };
}

export function searchCreatorExamples(snap, { category, tier, lang }) {
  const file = snap.files.creators;
  if (file.header.status !== "published") return preparing(file);
  const all = [...snap.creators.values()];
  const matches = all.filter((c) => (!category || c.category === category) && (!tier || c.tier === tier)).sort(poolOrder);
  const results = matches.slice(0, MAX_RESULTS).map((c) => creatorCard(c, lang));
  const few = matches.length < MAX_RESULTS;
  return {
    file,
    missing_reason: few ? "few_open_samples" : null,
    outcome: few ? "few" : "ok",
    data: {
      filter: { category: category ?? null, tier: tier ?? null },
      open_pool_size: all.length,
      order: "followers_rounded_desc_then_slug",
      results,
    },
  };
}

export function getCreatorExample(snap, { slug, lang }) {
  const c = snap.creators.get(slug);
  if (!c) return notInPool(snap.files.creators);
  return {
    file: snap.files.creators,
    missing_reason: c.engagement.rate === null ? (c.engagement.missing_reason ?? "not_measured") : null,
    outcome: "ok",
    data: { found: true, ...creatorCard(c, lang) },
  };
}

function notInPool(file) {
  // Fixed body: nothing from the request is echoed, so every unknown input yields the same bytes.
  return { file, missing_reason: NOT_IN_POOL, outcome: "not_found", data: { found: false } };
}

export function compareCreatorExamples(snap, { slug_a, slug_b, lang }) {
  if (slug_a === slug_b) throw new McpError(ErrorCode.InvalidParams, "slug_a and slug_b must differ");
  const file = snap.files.pairs;
  const a = snap.creators.get(slug_a), b = snap.creators.get(slug_b);
  if (!a || !b) return notInPool(file);
  if (file.header.status !== "published") return preparing(file);
  // Both orders are published; bands read as "slug_a against slug_b". Never flipped here.
  const pair = snap.pairs.get(`${slug_a}|${slug_b}`);
  if (!pair) return { file, missing_reason: "pair_not_published", outcome: "not_found", data: { found: false } };
  return {
    file,
    missing_reason: null,
    outcome: "ok",
    data: {
      found: true,
      a: creatorCard(a, lang),
      b: creatorCard(b, lang),
      bands: structuredClone(pair.bands),
      comparable: pair.comparable === null ? null : { ...pair.comparable },
      margins: { ...file.margins },
      notes: [...pair.notes],
    },
  };
}

export function getInstagramBenchmark(snap, { tier = "all", category = "all" }) {
  const bench = snap.files.benchmark;
  if (bench.header.status !== "published") return preparing(bench);
  const m = bench.method;
  const common = {
    platform: bench.platform, metric: m.metric, unit: m.unit, universe: bench.universe, computed_at: bench.computed_at,
    window_days: m.window_days, min_sample: m.min_sample, stale_after_days: m.stale_after_days,
  };
  const cell = snap.cells.get(`${tier}|${category}`);
  if (!cell) return { file: bench, missing_reason: "no_such_cell", outcome: "not_found", data: { found: false, ...common } };
  const tierLabel = m.tiers.find((t) => t.key === tier)?.label ?? null;
  return {
    file: bench,
    missing_reason: cell.suppressed ? "below_min_sample" : null,
    outcome: cell.suppressed ? "suppressed" : "ok",
    data: {
      found: true,
      ...common,
      cell: {
        tier, tier_label: tierLabel, category, category_label: cell.category_label,
        cohort: cell.cohort, n: cell.n, excluded: { ...cell.excluded }, suppressed: cell.suppressed,
        p25: cell.suppressed ? null : cell.p25, p50: cell.suppressed ? null : cell.p50, p75: cell.suppressed ? null : cell.p75,
      },
    },
  };
}

export function envelope(snap, file, lang, r) {
  const h = file.header;
  return {
    schema_version: h.schema_version,
    snapshot_id: h.snapshot_id,
    edition: h.edition,
    data_as_of: h.data_as_of,
    period: h.period,
    method_version: h.method_version,
    count: h.count,
    source_url: h.source_url,
    method_url: h.method_url,
    missing_reason: r.missing_reason,
    lang,
    data: r.data,
  };
}

const asOf = (d) => (d.newest ? (d.oldest && d.oldest !== d.newest ? `${d.oldest} to ${d.newest}` : d.newest) : "unknown");
const kfmt = (f) => (f.rounded === null ? "n/a" : `~${f.rounded}`);

// Markdown view of the same structured data (one text block per result).
export function toMarkdown(env) {
  const d = env.data;
  const head = `Snapshot ${env.snapshot_id} · data as of ${asOf(env.data_as_of)} · method ${env.method_version}`;
  const foot = `Source: ${env.source_url} · Method: ${env.method_url}` + (env.missing_reason ? `\nMissing: ${env.missing_reason}` : "");
  let body;
  if (d.results) {
    body = [`Open samples matching the filter (${d.results.length} of at most ${MAX_RESULTS}; pool ${d.open_pool_size}):`,
      ...d.results.map((r) => `- ${r.display_name ?? r.handle} (${r.slug}) · ${r.category_label} · ${r.tier_label} · ${kfmt(r.followers)} followers · ER ${r.engagement.rate ?? "n/a"}${r.engagement.as_of ? ` (${r.engagement.as_of})` : ""}`)].join("\n");
  } else if (d.found === false) {
    body = d.status ? `Not available: ${d.status}.` : "Not found.";
  } else if (d.cell) {
    const c = d.cell;
    body = `Instagram engagement rate (${d.window_days}-day window), tier ${c.tier}, category ${c.category}: cohort ${c.cohort}, n ${c.n}` +
      (c.suppressed ? ", suppressed (below minimum sample)." : `, p25 ${c.p25}, median ${c.p50}, p75 ${c.p75} percent.`);
  } else if (d.a) {
    body = [`${d.a.display_name ?? d.a.handle} vs ${d.b.display_name ?? d.b.handle} (bands, a against b, no winner):`,
      `- score: ${d.bands.score.band}${d.bands.score.reason ? ` (${d.bands.score.reason})` : ""}`,
      `- engagement: ${d.bands.engagement.band}${d.bands.engagement.reason ? ` (${d.bands.engagement.reason})` : ""}`,
      d.notes.length ? `Notes: ${d.notes.join(", ")}` : ""].filter(Boolean).join("\n");
  } else {
    body = `${d.display_name ?? d.handle} (${d.slug}) · ${d.category_label} · ${d.tier_label} · ${kfmt(d.followers)} followers
Quality score ${d.score.display ?? "n/a"} (${d.score.formula_version ?? "n/a"}, ${d.score.calculated_at ?? "n/a"}); engagement ${d.engagement.rate ?? "n/a"}`;
  }
  return `${head}

${body}

${foot}`;
}
