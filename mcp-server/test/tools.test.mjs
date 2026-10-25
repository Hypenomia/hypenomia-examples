import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { randomBytes } from "node:crypto";
import { readyStore, connectInMemory, call, bytes, collectKeys } from "./helpers.mjs";

let store, snap, conn, client;
before(async () => {
  store = await readyStore();
  snap = store.get();
  conn = await connectInMemory(store);
  client = conn.client;
});
after(() => conn.close());

const ENVELOPE = ["schema_version", "snapshot_id", "edition", "data_as_of", "period", "method_version", "count", "source_url", "method_url", "missing_reason", "lang", "data"];
const ALLOWED_KEYS = new Set([...ENVELOPE, "oldest", "newest", "start", "end", "end_exclusive", "tz",
  "filter", "category", "tier", "open_pool_size", "order", "results", "slug", "handle", "display_name", "category_label", "tier_label",
  "followers", "rounded", "unit", "as_of", "missing_reason", "engagement", "state", "rate", "window_days", "items_90d", "stale",
  "score", "display", "coverage", "confidence", "calculated_at", "formula_version", "turkey_basis",
  "pool_reason", "template", "url", "found",
  "a", "b", "bands", "band", "reason", "comparable", "same_tier", "same_formula_version", "er_dates_gap_days", "er_dates_within_limit",
  "margins", "score_points", "engagement_relative", "engagement_dates_days", "notes",
  "platform", "metric", "universe", "computed_at", "min_sample", "stale_after_days", "cell", "cohort", "n", "excluded", "suppressed", "p25", "p50", "p75", "status"]);
const FORBIDDEN_KEYS = ["id", "ig_user_id", "platform_user_id", "follower_count", "bio", "email", "phone", "caption", "s3_media_url", "growth_30d", "extra_data"];
const A = "sentetik-guzellik-a", B = "sentetik-guzellik-b";

const allResults = [];
const run = async (name, args) => { const r = await call(client, name, args); allResults.push(r); return r; };

test("tools/list: four read-only tools, closed input schemas, output schema", async () => {
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), ["compare_creator_examples", "get_creator_example", "get_instagram_benchmark", "search_creator_examples"]);
  for (const t of tools) {
    assert.equal(t.annotations.readOnlyHint, true, t.name);
    assert.equal(t.annotations.idempotentHint, true);
    assert.equal(t.annotations.openWorldHint, false);
    assert.equal(t.annotations.destructiveHint, false);
    assert.equal(t.inputSchema.additionalProperties, false, `${t.name} input must be closed`);
    assert.ok(t.outputSchema, `${t.name} outputSchema`);
  }
});

test("search: full category x tier x lang sweep stays inside the manifest pool, max 3, fixed order", async () => {
  const pool = new Set(snap.creators.keys());
  let calls = 0;
  for (const lang of snap.enums.lang) {
    for (const category of [undefined, ...snap.enums.category]) {
      for (const tier of [undefined, ...snap.enums.tier]) {
        const args = { lang, ...(category && { category }), ...(tier && { tier }) };
        const r = await run("search_creator_examples", args);
        calls++;
        const s = r.structuredContent;
        assert.ok(!r.isError);
        assert.ok(s.data.results.length <= 3);
        assert.equal(s.lang, lang);
        for (const x of s.data.results) {
          assert.ok(pool.has(x.slug));
          if (category) assert.equal(x.category, category);
          if (tier) assert.equal(x.tier, tier);
        }
        const f = s.data.results.map((x) => x.followers.rounded);
        assert.deepEqual(f, [...f].sort((a, b) => b - a), "followers desc");
        const expected = [...snap.creators.values()].filter((c) => (!category || c.category === category) && (!tier || c.tier === tier)).length;
        assert.equal(s.missing_reason, expected < 3 ? "few_open_samples" : null, "never widened");
        assert.equal(s.data.results.length, Math.min(3, expected));
        assert.equal(bytes(r), bytes(await call(client, "search_creator_examples", args)), "deterministic");
      }
    }
  }
  assert.equal(calls, 2 * 6 * 4);
});

test("search: bad enum, extra argument and unknown tool are rejected", async () => {
  const bad = await call(client, "search_creator_examples", { category: "not-a-category" });
  assert.equal(bad.isError, true);
  assert.match(bad.content[0].text, /-32602/);
  const extra = await call(client, "search_creator_examples", { limit: 50 });
  assert.equal(extra.isError, true);
  for (const bogus of [{ offset: 1 }, { cursor: "x" }, { random: true }, { page: 2 }]) {
    assert.equal((await call(client, "search_creator_examples", bogus)).isError, true);
  }
  assert.equal((await call(client, "get_sector_brief", { sector: "hair-care" }).catch(() => ({ isError: true }))).isError, true, "no sector tool: the public schema has no sector data");
  const nope = await call(client, "get_all_creators", {}).catch(() => ({ isError: true }));
  assert.equal(nope.isError, true);
});

test("get one sample: followers object, per-metric dates, stale and missing reasons are carried, not zeroed", async () => {
  const a = (await run("get_creator_example", { slug: A })).structuredContent;
  assert.equal(a.data.found, true);
  assert.deepEqual(a.data.followers, { rounded: 48000, unit: 1000, as_of: "2026-10-25", missing_reason: null });
  assert.equal(a.data.score.display, 74);
  assert.equal(a.data.score.calculated_at, "2026-10-25");
  assert.equal(a.data_as_of.newest, "2026-10-25");
  assert.equal(a.period, null);
  const zero = (await run("get_creator_example", { slug: "sentetik-yemek-a" })).structuredContent;
  assert.equal(zero.data.engagement.rate, 0, "a measured 0 stays 0");
  assert.equal(zero.data.engagement.state, "measured");
  const stale = (await run("get_creator_example", { slug: "sentetik-seyahat-a" })).structuredContent;
  assert.equal(stale.data.engagement.stale, true);
  const pending = (await run("get_creator_example", { slug: "sentetik-yasam-a" })).structuredContent;
  assert.equal(pending.data.score.state, "pending");
  assert.equal(pending.data.score.display, null);
  const none = (await run("get_creator_example", { slug: "sentetik-yemek-b" })).structuredContent;
  assert.equal(none.data.score.state, "insufficient_coverage");
});

test("no existence oracle: every unknown input yields identical bytes", async () => {
  const unknown = ["unknown-a", "Unknown-A", "@unknown-a", "some_private_handle", "with space", "", "x".repeat(64), "../../etc/passwd", "sentetik-yok",
    "SENTETIK-GUZELLIK-A", " sentetik-guzellik-a", ...Array.from({ length: 40 }, () => randomBytes(8).toString("hex"))];
  for (const lang of ["en", "tr"]) {
    const outs = new Set();
    for (const slug of unknown) outs.add(bytes(await call(client, "get_creator_example", { slug, lang })));
    assert.equal(outs.size, 1, `get ${lang}`);
    const r = JSON.parse([...outs][0]);
    assert.equal(r.s.missing_reason, "not_in_open_pool");
    assert.equal(r.s.data.found, false);
    const cmp = new Set();
    for (const slug of unknown.slice(0, 20)) {
      cmp.add(bytes(await call(client, "compare_creator_examples", { slug_a: A, slug_b: slug, lang })));
      cmp.add(bytes(await call(client, "compare_creator_examples", { slug_a: slug.slice(0, 60) + "q", slug_b: B, lang })));
    }
    assert.equal(cmp.size, 1, `compare ${lang}`);
  }
  const over = await call(client, "get_creator_example", { slug: "x".repeat(65) });
  assert.equal(over.isError, true);
  assert.ok(!over.content[0].text.includes("xxxxxxxx"), "invalid input is not echoed");
});

test("compare: identical slugs rejected; both directions are published and looked up exactly, never flipped", async () => {
  const same = await call(client, "compare_creator_examples", { slug_a: A, slug_b: A });
  assert.equal(same.isError, true);
  const slugs = [...snap.creators.keys()];
  let n = 0;
  for (const x of slugs) for (const y of slugs) {
    if (x === y) continue;
    const d = (await call(client, "compare_creator_examples", { slug_a: x, slug_b: y })).structuredContent.data;
    const pair = snap.pairs.get(`${x}|${y}`);
    assert.equal(d.found, true, `${x} ${y}`);
    assert.equal(d.a.slug, x);
    assert.equal(d.b.slug, y);
    assert.deepEqual(d.bands, pair.bands, "bands exactly as published for this order");
    assert.deepEqual(d.comparable, pair.comparable);
    assert.deepEqual(d.notes, pair.notes);
    assert.ok(!JSON.stringify(d).match(/winner|better|best/i));
    n++;
  }
  assert.equal(n, 90);
  const ab = snap.pairs.get(`${A}|${B}`), ba = snap.pairs.get(`${B}|${A}`);
  assert.ok(ab && ba);
});

test("compare: a pair missing from the file is pair_not_published, not a flipped reverse", async () => {
  const { pairs, ...rest } = snap;
  const trimmed = new Map(pairs);
  trimmed.delete(`${A}|${B}`);
  const c = await connectInMemory({ get: () => ({ ...rest, pairs: trimmed }) });
  const r = await call(c.client, "compare_creator_examples", { slug_a: A, slug_b: B });
  assert.equal(r.structuredContent.missing_reason, "pair_not_published");
  assert.equal(r.structuredContent.data.found, false);
  await c.close();
});

test("benchmark: every cell, suppressed cells are null with a reason, never zero", async () => {
  let suppressed = 0, ok = 0;
  for (const tier of ["all", ...snap.enums.benchmark_tier]) {
    for (const category of ["all", ...snap.enums.benchmark_category]) {
      const r = await run("get_instagram_benchmark", { tier, category });
      const s = r.structuredContent;
      const cell = snap.cells.get(`${tier}|${category}`);
      if (!cell) { assert.equal(s.missing_reason, "no_such_cell"); continue; }
      if (cell.suppressed) {
        suppressed++;
        assert.equal(s.missing_reason, "below_min_sample");
        assert.equal(s.data.cell.p50, null); assert.notEqual(s.data.cell.p50, 0);
        assert.equal(s.data.cell.n, cell.n);
      } else {
        ok++;
        assert.equal(s.missing_reason, null);
        assert.equal(s.data.cell.p50, cell.p50);
        assert.equal(s.data.cell.p25, cell.p25);
        assert.equal(s.data.cell.p75, cell.p75);
      }
    }
  }
  assert.ok(suppressed > 0 && ok > 0, `suppressed ${suppressed}, ok ${ok}`);
  const dflt = (await call(client, "get_instagram_benchmark", {})).structuredContent.data.cell;
  assert.equal(dflt.tier, "all"); assert.equal(dflt.category, "all");
});

test("contract: envelope on every result, key allowlist, no forbidden keys or text", () => {
  assert.ok(allResults.length > 150);
  const keys = new Set();
  for (const r of allResults) {
    assert.deepEqual(Object.keys(r.structuredContent), ENVELOPE);
    assert.equal(r.content.length, 1);
    assert.equal(r.content[0].type, "text");
    assert.ok(r.content[0].text.includes(r.structuredContent.data_as_of.newest));
    collectKeys(r.structuredContent, keys);
    const text = JSON.stringify(r);
    assert.ok(!/amazonaws|x-amz|svc\.cluster|@(?!hypenomia)/i.test(text));
  }
  for (const k of keys) assert.ok(ALLOWED_KEYS.has(k) || (/^[a-z_]+$/.test(k) && (snap.enums.category.includes(k) || ["no_recent_content", "no_snapshot", "stale", "low_sample", "no_usable_counts", "not_measured"].includes(k))), `unexpected key ${k}`);
  for (const k of FORBIDDEN_KEYS) assert.ok(!keys.has(k), `forbidden key ${k}`);
});

test("size cap: oversize result becomes an error, not a truncated body", async () => {
  const small = await connectInMemory(store, { maxResponseBytes: 200 });
  const r = await call(small.client, "search_creator_examples", {});
  assert.equal(r.isError, true);
  assert.equal(r.structuredContent, undefined);
  await small.close();
});

test("no data: expired snapshot gives a clear temporary error", async () => {
  let live = true;
  const flaky = { get: () => (live ? snap : null) };
  const c = await connectInMemory(flaky);
  assert.equal((await call(c.client, "get_instagram_benchmark", {})).isError, undefined);
  live = false;
  const r = await call(c.client, "get_instagram_benchmark", {});
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /temporarily unavailable/i);
  await c.close();
});

test("serve_until over MCP: past the last day every tool answers unavailable", async () => {
  let t = Date.parse("2026-11-09T12:00:00+03:00");
  const timed = await readyStore(undefined, { now: () => t });
  const c = await connectInMemory(timed);
  assert.equal((await call(c.client, "get_instagram_benchmark", {})).isError, undefined);
  t = Date.parse("2026-11-10T00:01:00+03:00");
  const r = await call(c.client, "search_creator_examples", {});
  assert.equal(r.isError, true);
  assert.equal(r.structuredContent, undefined);
  await c.close();
});

test("MCP_TOOLS: unlisted tools are not exposed", async () => {
  const c = await connectInMemory(store, { tools: ["get_instagram_benchmark"] });
  assert.deepEqual((await c.client.listTools()).tools.map((t) => t.name), ["get_instagram_benchmark"]);
  await c.close();
});

test("parity: tool values equal the edition files field by field", async () => {
  for (const c of snap.files.creators.creators) {
    const d = (await call(client, "get_creator_example", { slug: c.slug })).structuredContent.data;
    assert.deepEqual(d.followers, c.followers);
    assert.deepEqual(d.engagement, c.engagement);
    assert.deepEqual(d.score, c.score);
    assert.equal(d.category, c.category);
    assert.equal(d.tier_label, c.tier_label);
  }
});
