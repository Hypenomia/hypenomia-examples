// The only module that reads public data. Everything else gets a validated, frozen snapshot object.
// Layout = the exporter's public-data root (api/schemas/public_snapshot.py):
//   latest.json, editions/<YYYY-MM-DD>/{manifest,creators,pairs,benchmark,weekly,content,insights}.json
// Source: a local public-data directory, or an https/http base URL of the same layout.
// An edition is served only while latest.json lists its (edition, revision), before serve_until,
// and (synthetic editions) only with an explicit allowSynthetic flag.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EDITION_RE = /^\d{4}-\d{2}-\d{2}$/;
const SCHEMA = "px11-public-edition-v1";
const READ_FILES = ["creators", "pairs", "benchmark"];
const HEADER_KEYS = ["schema_version", "snapshot_id", "edition", "file", "status", "data_as_of", "period", "method_version", "method_url", "source_url", "count", "missing_reason"];
// Defence in depth: keys that must never appear in a public edition.
const FORBIDDEN_KEYS = new Set(["id", "account_id", "influencer_account_id", "ig_user_id", "platform_user_id", "user_id", "internal_id", "internal_slug",
  "follower_count", "followers_exact", "growth_30d", "follower_history", "bio", "biography", "email", "phone", "external_url", "city", "gender",
  "caption", "s3_media_url", "thumbnail", "thumbnail_file_path", "media_url", "views", "audience_reach_multiple", "virality_level", "extra_data",
  "notes_internal", "notes_private", "sqs_components", "reel_er", "rationale", "traits", "checks", "verified_by"]);
const FORBIDDEN_TEXT = /amazonaws|x-amz|svc\.cluster\.local|[\w.+-]+@(?!(?:starlecta|hypenomia)\.com\b)[\w-]+\.[\w.]+/i;

export const LIMITS = { fileBytes: 2_000_000, fetchTimeoutMs: 5000 };

export class SnapshotError extends Error {
  constructor(message, { gone = false } = {}) { super(message); this.name = "SnapshotError"; this.gone = gone; }
}

// Today in Istanbul, the zone serve_until is written in.
export function istanbulDay(ms = Date.now()) {
  return new Date(ms).toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });
}

function deepCheck(node, where) {
  if (Array.isArray(node)) return node.forEach((v) => deepCheck(v, where));
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (FORBIDDEN_KEYS.has(k)) throw new SnapshotError(`${where}: forbidden key "${k}"`);
      deepCheck(v, where);
    }
  } else if (typeof node === "string" && FORBIDDEN_TEXT.test(node)) {
    throw new SnapshotError(`${where}: forbidden text pattern`);
  }
}

async function readSource(source, name) {
  if (/^https?:\/\//.test(source)) {
    const base = source.endsWith("/") ? source : `${source}/`;
    const url = new URL(name, base);
    if (url.origin !== new URL(base).origin) throw new SnapshotError("cross-origin file");
    const res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(LIMITS.fetchTimeoutMs) });
    if (res.status === 404 || res.status === 410) throw new SnapshotError(`${name}: HTTP ${res.status}`, { gone: true });
    if (!res.ok) throw new SnapshotError(`${name}: HTTP ${res.status}`);
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > LIMITS.fileBytes) throw new SnapshotError(`${name}: too large`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > LIMITS.fileBytes) throw new SnapshotError(`${name}: too large`);
    return buf;
  }
  try {
    const buf = await readFile(path.join(source, ...name.split("/")));
    if (buf.length > LIMITS.fileBytes) throw new SnapshotError(`${name}: too large`);
    return buf;
  } catch (e) {
    if (e instanceof SnapshotError) throw e;
    throw new SnapshotError(`${name}: ${e.code ?? e.message}`, { gone: e.code === "ENOENT" });
  }
}

function parse(buf, name) {
  try { return JSON.parse(buf.toString("utf8")); } catch { throw new SnapshotError(`${name}: invalid JSON`); }
}
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

function requireHeader(h, name) {
  if (!h || typeof h !== "object") throw new SnapshotError(`${name}: missing header`);
  for (const k of HEADER_KEYS) if (!(k in h)) throw new SnapshotError(`${name}: missing header field ${k}`);
  if (h.schema_version !== SCHEMA) throw new SnapshotError(`${name}: unsupported schema_version`);
}

export async function loadEdition(source, { allowSynthetic = false, now = Date.now } = {}) {
  const latest = parse(await readSource(source, "latest.json"), "latest.json");
  if (latest.schema_version !== SCHEMA || !EDITION_RE.test(latest.edition ?? "") || !Number.isInteger(latest.revision) || !Array.isArray(latest.retained)) {
    throw new SnapshotError("latest.json: invalid");
  }
  if (latest.snapshot_id !== `${latest.edition}.r${latest.revision}`) throw new SnapshotError("latest.json: snapshot_id does not match edition and revision");
  const listed = latest.retained.find((r) => r.edition === latest.edition);
  if (!listed || listed.revision !== latest.revision) throw new SnapshotError("latest.json: edition not listed with this revision", { gone: true });

  const manifestBuf = await readSource(source, `editions/${latest.edition}/manifest.json`);
  if (sha256(manifestBuf) !== listed.manifest_sha256) throw new SnapshotError("manifest.json: sha256 differs from latest.json");
  const manifest = parse(manifestBuf, "manifest.json");
  if (manifest.schema_version !== SCHEMA) throw new SnapshotError("manifest.json: unsupported schema_version");
  if (manifest.edition !== latest.edition || manifest.revision !== latest.revision || manifest.snapshot_id !== latest.snapshot_id) {
    throw new SnapshotError("manifest.json: edition or revision differs from latest.json", { gone: true });
  }
  if (manifest.synthetic && !allowSynthetic) throw new SnapshotError("synthetic edition refused (set MCP_ALLOW_SYNTHETIC=1 for development only)", { gone: true });
  if (!EDITION_RE.test(manifest.serve_until ?? "")) throw new SnapshotError("manifest.json: serve_until invalid");
  if (istanbulDay(now()) > manifest.serve_until) throw new SnapshotError("edition past serve_until", { gone: true });
  if (!Array.isArray(manifest.files) || !Array.isArray(manifest.samples)) throw new SnapshotError("manifest.json: files or samples invalid");
  const enums = manifest.enums ?? {};
  for (const k of ["category", "tier"]) if (!Array.isArray(enums[k])) throw new SnapshotError(`manifest.enums.${k} missing`);
  deepCheck(manifest, "manifest.json");

  const bodies = {};
  for (const name of READ_FILES) {
    const entry = manifest.files.find((f) => f.name === name);
    if (!entry) throw new SnapshotError(`${name}: not listed in manifest`);
    const buf = await readSource(source, `editions/${latest.edition}/${name}.json`);
    if (sha256(buf) !== entry.sha256) throw new SnapshotError(`${name}.json: sha256 mismatch`);
    if (entry.bytes !== buf.length) throw new SnapshotError(`${name}.json: size differs from manifest`);
    const body = parse(buf, `${name}.json`);
    requireHeader(body.header, `${name}.json`);
    const h = body.header;
    if (h.file !== name || h.snapshot_id !== manifest.snapshot_id || h.edition !== manifest.edition) throw new SnapshotError(`${name}.json: header differs from manifest`);
    if (h.status !== entry.status || h.count !== entry.count) throw new SnapshotError(`${name}.json: header differs from manifest entry`);
    deepCheck(body, `${name}.json`);
    bodies[name] = body;
  }

  const creators = new Map();
  for (const c of bodies.creators.creators) {
    if (!SLUG_RE.test(c.slug) || c.slug.length > 64 || creators.has(c.slug)) throw new SnapshotError("creators.json: bad or duplicate slug");
    if (!enums.category.includes(c.category) || !enums.tier.includes(c.tier)) throw new SnapshotError("creators.json: value outside manifest enums");
    creators.set(c.slug, Object.freeze(c));
  }
  if (creators.size !== manifest.pool_size || manifest.samples.length !== creators.size || manifest.samples.some((s) => !creators.has(s.slug))) {
    throw new SnapshotError("manifest.json: samples differ from creators.json");
  }
  // Both directions are published: look up (slug_a, slug_b) exactly, never flip.
  const pairs = new Map();
  for (const p of bodies.pairs.pairs) {
    const key = `${p.slug_a}|${p.slug_b}`;
    if (!creators.has(p.slug_a) || !creators.has(p.slug_b) || p.slug_a === p.slug_b || pairs.has(key)) throw new SnapshotError("pairs.json: pair outside pool, self pair or duplicate");
    pairs.set(key, Object.freeze(p));
  }
  const bench = bodies.benchmark;
  const cells = new Map(bench.cells.map((c) => [`${c.tier}|${c.category}`, Object.freeze(c)]));
  const benchmarkTiers = bench.method.tiers.map((t) => t.key);
  const benchmarkCategories = [...new Set(bench.cells.map((c) => c.category))].filter((c) => c !== "all").sort();
  return Object.freeze({
    manifest, latest,
    enums: { lang: ["en", "tr"], category: enums.category, tier: enums.tier, benchmark_category: benchmarkCategories, benchmark_tier: benchmarkTiers },
    creators, pairs, cells,
    files: { creators: bodies.creators, pairs: bodies.pairs, benchmark: bench },
    serveUntil: manifest.serve_until,
    loadedAt: now(),
  });
}

// Holds the last good snapshot. Refresh failures keep it for maxStaleMs (source unreachable only);
// a "gone" answer (removed, revision unlisted, expired, synthetic refused) drops it at once.
// serve_until is checked on every get(), so a freshly re-read old edition is still unavailable once expired.
export class SnapshotStore {
  constructor(source, { maxStaleMs = 24 * 3600_000, onEvent = () => {}, allowSynthetic = false, now = Date.now } = {}) {
    Object.assign(this, { source, maxStaleMs, onEvent, allowSynthetic, now });
    this.snap = null; this.timer = null;
  }
  async refresh() {
    try {
      const next = await loadEdition(this.source, { allowSynthetic: this.allowSynthetic, now: this.now });
      this.snap = next;
      this.onEvent({ event: "snapshot_loaded", snapshot_id: next.manifest.snapshot_id });
    } catch (e) {
      if (e instanceof SnapshotError && e.gone) this.snap = null;
      this.onEvent({ event: "snapshot_refresh_failed", reason: e.message, kept_last_good: Boolean(this.get()) });
      if (!this.snap) throw e;
    }
    return this.snap;
  }
  get() {
    if (!this.snap) return null;
    if (this.now() - this.snap.loadedAt > this.maxStaleMs) return null;
    if (istanbulDay(this.now()) > this.snap.serveUntil) return null;
    return this.snap;
  }
  start(everyMs) {
    this.timer = setInterval(() => this.refresh().catch(() => {}), everyMs);
    this.timer.unref();
  }
  stop() { clearInterval(this.timer); }
}
