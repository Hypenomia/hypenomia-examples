import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { EDITION_DIR, EDITION, SYNTH, copyEdition, rewrite, rewriteLatest, loadEdition } from "./helpers.mjs";
import { SnapshotStore, SnapshotError } from "../src/snapshot.mjs";

const withCopy = async (fn) => { const dir = copyEdition(); try { await fn(dir); } finally { rmSync(dir, { recursive: true }); } };
const at = (day) => () => Date.parse(`${day}T09:00:00+03:00`);

test("loads the exporter fixture edition: header structure, followers object, both pair directions", async () => {
  const s = await loadEdition(EDITION_DIR, SYNTH);
  assert.equal(s.creators.size, 10);
  assert.equal(s.pairs.size, 90, "10 x 9 ordered pairs");
  assert.equal(s.manifest.snapshot_id, "2026-10-26.r1");
  assert.equal(s.files.creators.header.period, null, "period may be null");
  assert.equal(typeof s.creators.get("sentetik-guzellik-a").followers, "object");
  assert.ok(s.pairs.has("sentetik-guzellik-a|sentetik-guzellik-b") && s.pairs.has("sentetik-guzellik-b|sentetik-guzellik-a"));
  assert.deepEqual(s.enums.tier, s.manifest.enums.tier);
});

test("a synthetic edition is refused unless the dev flag is set", async () => {
  await assert.rejects(loadEdition(EDITION_DIR), /synthetic edition refused/);
  await assert.rejects(new SnapshotStore(EDITION_DIR).refresh(), /synthetic edition refused/);
  assert.ok(await loadEdition(EDITION_DIR, { allowSynthetic: true }));
});

test("serve_until: served through the last day (Istanbul), unavailable after", async () => {
  await loadEdition(EDITION_DIR, { ...SYNTH, now: at("2026-11-09") });
  await assert.rejects(loadEdition(EDITION_DIR, { ...SYNTH, now: at("2026-11-10") }), /serve_until/);
  // late evening UTC on the last day is already the next day in Istanbul
  await assert.rejects(loadEdition(EDITION_DIR, { ...SYNTH, now: () => Date.parse("2026-11-09T21:30:00Z") }), /serve_until/);
});

test("a loaded edition stops being served at serve_until even if it was just re-read", async () => {
  let t = Date.parse("2026-11-09T09:00:00+03:00");
  const store = new SnapshotStore(EDITION_DIR, { ...SYNTH, now: () => t });
  await store.refresh();
  assert.ok(store.get());
  t = Date.parse("2026-11-10T00:30:00+03:00");
  assert.equal(store.get(), null, "expired without a refresh");
  await assert.rejects(store.refresh(), /serve_until/);
  assert.equal(store.get(), null, "re-reading the same old files does not make them current");
});

test("re-reading identical files keeps the data dates; loadedAt is not a data date", async () => {
  let t = Date.parse("2026-10-26T09:00:00+03:00");
  const store = new SnapshotStore(EDITION_DIR, { ...SYNTH, now: () => t });
  const first = await store.refresh();
  t += 3 * 3600_000;
  const second = await store.refresh();
  assert.notEqual(first.loadedAt, second.loadedAt);
  assert.deepEqual(second.files.creators.header.data_as_of, first.files.creators.header.data_as_of);
  assert.equal(second.manifest.generated_at, first.manifest.generated_at);
});

test("revision or edition not listed in latest.json drops the edition", async () => {
  await withCopy(async (dir) => {
    const store = new SnapshotStore(dir, SYNTH);
    await store.refresh();
    rewriteLatest(dir, (l) => { l.retained = [{ edition: "2026-10-19", revision: 1, manifest_sha256: "0".repeat(64) }]; });
    await assert.rejects(store.refresh(), /not listed/);
    assert.equal(store.get(), null);
  });
  await withCopy(async (dir) => {
    const store = new SnapshotStore(dir, SYNTH);
    await store.refresh();
    rewriteLatest(dir, (l) => { l.revision = 2; l.snapshot_id = `${EDITION}.r2`; l.retained[0].revision = 2; });
    await assert.rejects(store.refresh(), /edition or revision differs/);
    assert.equal(store.get(), null, "manifest r1 is no longer the listed revision");
  });
});

test("a manifest that differs from the hash in latest.json is rejected", async () => {
  await withCopy(async (dir) => {
    const p = path.join(dir, "editions", EDITION, "manifest.json");
    writeFileSync(p, readFileSync(p, "utf8").replace('"pool_size": 10', '"pool_size": 11'));
    await assert.rejects(loadEdition(dir, SYNTH), /sha256 differs/);
  });
});

test("file sha256 mismatch is rejected", async () => {
  await withCopy(async (dir) => {
    const p = path.join(dir, "editions", EDITION, "creators.json");
    writeFileSync(p, readFileSync(p, "utf8").replace("Sentetik Güzellik A", "Sentetik Güzellik Z"));
    await assert.rejects(loadEdition(dir, SYNTH), /sha256 mismatch/);
  });
});

test("envelope fields live in header; a file without one is rejected", async () => {
  await withCopy(async (dir) => {
    rewrite(dir, "creators", (b) => { delete b.header.period; });
    await assert.rejects(loadEdition(dir, SYNTH), /missing header field period/);
  });
  await withCopy(async (dir) => {
    rewrite(dir, "pairs", (b) => { delete b.header; });
    await assert.rejects(loadEdition(dir, SYNTH), /missing header/);
  });
});

test("a planted forbidden key or signed URL fails the load", async () => {
  for (const [mutate, re] of [
    [(b) => { b.creators[0].ig_user_id = "123"; }, /forbidden key/],
    [(b) => { b.creators[0].follower_count = 48123; }, /forbidden key/],
    [(b) => { b.creators[0].display_name = "https://x.s3.amazonaws.com/a?X-Amz-Signature=1"; }, /forbidden text/],
    [(b) => { b.creators[0].display_name = "write me at someone@example.com"; }, /forbidden text/],
    [(b) => { b.creators[0].slug = "Bad Slug"; }, /slug/],
    [(b) => { b.creators[0].category = "not_in_enum"; }, /outside manifest enums/],
  ]) {
    await withCopy(async (dir) => {
      rewrite(dir, "creators", mutate);
      await assert.rejects(loadEdition(dir, SYNTH), re);
    });
  }
});

test("a pair outside the pool, a self pair or a duplicate is rejected", async () => {
  for (const mutate of [(b) => { b.pairs[0].slug_b = "not-in-pool"; }, (b) => { b.pairs[0].slug_b = b.pairs[0].slug_a; }, (b) => { b.pairs[1] = b.pairs[0]; }]) {
    await withCopy(async (dir) => {
      rewrite(dir, "pairs", mutate);
      await assert.rejects(loadEdition(dir, SYNTH), /pair outside pool/);
    });
  }
});

function serve(handler) {
  return new Promise((resolve) => {
    const srv = http.createServer(handler).listen(0, "127.0.0.1", () => resolve({ srv, url: `http://127.0.0.1:${srv.address().port}/` }));
  });
}

test("URL source: loads, refuses redirects, 404 means gone, 500 keeps the last good copy", async () => {
  let mode = "ok";
  const { srv, url } = await serve((req, res) => {
    if (mode === "redirect") { res.writeHead(302, { location: "http://127.0.0.1:1/x" }); return res.end(); }
    if (mode === "gone") { res.writeHead(404); return res.end(); }
    if (mode === "error") { res.writeHead(500); return res.end(); }
    try { res.end(readFileSync(path.join(EDITION_DIR, req.url.slice(1)))); } catch { res.writeHead(404); res.end(); }
  });
  try {
    const store = new SnapshotStore(url, SYNTH);
    await store.refresh();
    assert.ok(store.get());
    mode = "error";
    await store.refresh();
    assert.ok(store.get(), "kept last good on transient error");
    mode = "redirect";
    await store.refresh();
    assert.ok(store.get(), "redirect is a failure, last good kept");
    mode = "gone";
    await assert.rejects(store.refresh(), SnapshotError);
    assert.equal(store.get(), null, "removal drops the old edition at once");
  } finally { srv.close(); }
});

test("stale snapshot beyond maxStaleMs is not served", async () => {
  const store = new SnapshotStore(EDITION_DIR, { ...SYNTH, maxStaleMs: 1 });
  await store.refresh();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(store.get(), null);
});
