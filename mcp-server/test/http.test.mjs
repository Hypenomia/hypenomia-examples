import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { createHttpServer, configFromEnv } from "../src/http.mjs";
import { SnapshotStore } from "../src/snapshot.mjs";
import { EDITION_DIR, readyStore, bytes } from "./helpers.mjs";

const logs = [];
let server, base, store;
const cfg = { ...configFromEnv({}), allowedOrigins: ["https://allowed.example"], perMin: 1000, perDay: 100000, globalPerDay: 1000000 };

async function start(overrides = {}, st = store) {
  const s = createHttpServer({ ...cfg, ...overrides }, st, (e) => logs.push(e));
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  return { s, url: `http://127.0.0.1:${s.address().port}` };
}
before(async () => {
  store = await readyStore();
  const r = await start();
  server = r.s; base = r.url;
});
after(() => server.close());

const H = { "content-type": "application/json", accept: "application/json, text/event-stream" };
const rpc = (method, params, id = 1) => JSON.stringify({ jsonrpc: "2.0", id, method, params });
const post = (body, headers = {}, url = base) => fetch(`${url}/mcp`, { method: "POST", headers: { ...H, ...headers }, body });
const INIT = { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } };

test("POST initialize: JSON response, no session id, no SSE", async () => {
  const r = await post(rpc("initialize", INIT));
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type"), /application\/json/);
  assert.equal(r.headers.get("mcp-session-id"), null);
  const j = await r.json();
  assert.equal(j.result.serverInfo.name, "starlecta-open-examples");
  assert.match(j.result.instructions, /data_as_of/);
});

test("GET and DELETE on /mcp are 405; unknown path 404", async () => {
  for (const method of ["GET", "DELETE", "PUT"]) {
    const r = await fetch(`${base}/mcp`, { method });
    assert.equal(r.status, 405, method);
    assert.equal(r.headers.get("allow"), "POST");
  }
  assert.equal((await fetch(`${base}/other`)).status, 404);
});

test("batch, malformed, non-JSON-RPC, wrong content type, wrong accept", async () => {
  assert.equal((await post(`[${rpc("tools/list", {})}]`)).status, 400);
  assert.equal((await post("{not json")).status, 400);
  assert.equal((await post(JSON.stringify({ hello: 1 }))).status, 400);
  assert.equal((await post(rpc("tools/list", {}), { "content-type": "text/plain" })).status, 415);
  assert.equal((await post(rpc("tools/list", {}), { accept: "text/html" })).status, 406);
});

test("oversize body is 413 (declared and streamed)", async () => {
  const big = rpc("tools/call", { name: "search_creator_examples", arguments: { pad: "x".repeat(20000) } });
  assert.equal((await post(big)).status, 413);
});

test("Origin: present and not allowlisted is 403; allowlisted passes; absent passes", async () => {
  assert.equal((await post(rpc("tools/list", {}), { origin: "https://evil.example" })).status, 403);
  assert.equal((await post(rpc("tools/list", {}), { origin: "https://allowed.example" })).status, 200);
  assert.equal((await post(rpc("tools/list", {}))).status, 200);
  const r = await post(rpc("tools/list", {}), { origin: "https://allowed.example" });
  assert.equal(r.headers.get("access-control-allow-origin"), null, "no CORS headers");
});

test("unsupported MCP-Protocol-Version is 400", async () => {
  assert.equal((await post(rpc("tools/list", {}), { "mcp-protocol-version": "1999-01-01" })).status, 400);
  assert.equal((await post(rpc("tools/list", {}), { "mcp-protocol-version": "2025-06-18" })).status, 200);
});

test("notification gets 202", async () => {
  const r = await post(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }));
  assert.equal(r.status, 202);
});

test("SDK HTTP client: list, call every tool, byte-identical not_in_open_pool", async () => {
  const client = new Client({ name: "http-test", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
  const tools = (await client.listTools()).tools.map((t) => t.name);
  assert.equal(tools.length, 4);
  const a = await client.callTool({ name: "get_creator_example", arguments: { slug: "nike" } });
  const b = await client.callTool({ name: "get_creator_example", arguments: { slug: "zzz-9" } });
  assert.equal(bytes(a), bytes(b));
  const s = await client.callTool({ name: "search_creator_examples", arguments: { category: "travel", tier: "mega" } });
  assert.equal(s.structuredContent.data.results.length, 1);
  assert.equal(s.structuredContent.missing_reason, "few_open_samples");
  await client.close();
});

test("full filter sweep over HTTP stays inside the manifest pool", async () => {
  const snap = store.get();
  const pool = new Set(snap.creators.keys());
  const client = new Client({ name: "sweep", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
  let n = 0;
  for (const lang of snap.enums.lang) for (const category of [undefined, ...snap.enums.category]) for (const tier of [undefined, ...snap.enums.tier]) {
    const r = await client.callTool({ name: "search_creator_examples", arguments: { lang, ...(category && { category }), ...(tier && { tier }) } });
    assert.ok(r.structuredContent.data.results.every((x) => pool.has(x.slug)));
    assert.ok(r.structuredContent.data.results.length <= 3);
    n++;
  }
  assert.equal(n, 48);
  await client.close();
});

test("rate limit: 429 with Retry-After on tool calls; initialize and tools/list are not counted", async () => {
  const { s, url } = await start({ perMin: 3 });
  try {
    const call = () => post(rpc("tools/call", { name: "get_instagram_benchmark", arguments: {} }), {}, url);
    const codes = [];
    for (let i = 0; i < 5; i++) codes.push((await call()).status);
    assert.deepEqual(codes, [200, 200, 200, 429, 429]);
    const r = await call();
    assert.ok(Number(r.headers.get("retry-after")) >= 1);
    assert.equal((await post(rpc("tools/list", {}), {}, url)).status, 200);
  } finally { s.close(); }
});

test("global daily breaker returns 503 with Retry-After", async () => {
  const { s, url } = await start({ globalPerDay: 1 });
  try {
    const call = () => post(rpc("tools/call", { name: "get_instagram_benchmark", arguments: {} }), {}, url);
    assert.equal((await call()).status, 200);
    const r = await call();
    assert.equal(r.status, 503);
    assert.ok(r.headers.get("retry-after"));
  } finally { s.close(); }
});

test("readiness fails without a snapshot and tools say data is unavailable", async () => {
  const empty = new SnapshotStore("/nonexistent-edition");
  assert.equal(configFromEnv({}).source, null, "no default data source");
  assert.equal(configFromEnv({}).allowSynthetic, false);
  const { s, url } = await start({}, empty);
  try {
    assert.equal((await fetch(`${url}/readyz`)).status, 503);
    assert.equal((await fetch(`${url}/healthz`)).status, 200);
  } finally { s.close(); }
});

test("response cap: tiny cap turns a result into an error", async () => {
  const { s, url } = await start({ maxResponseBytes: 200 });
  try {
    const j = await (await post(rpc("tools/call", { name: "search_creator_examples", arguments: {} }), {}, url)).json();
    assert.equal(j.result.isError, true);
  } finally { s.close(); }
});

test("logs: one JSON line per request, outcome set, no raw IP, unknown slug not logged", async () => {
  logs.length = 0;
  await post(rpc("initialize", INIT));
  await post(rpc("tools/call", { name: "get_creator_example", arguments: { slug: "private_handle_42" } }));
  await post(rpc("tools/call", { name: "get_creator_example", arguments: { slug: "sentetik-guzellik-a" } }));
  await post(rpc("tools/call", { name: "get_instagram_benchmark", arguments: { tier: "all", category: "fitness_health" } }));
  await post(`[${rpc("tools/list", {})}]`);
  await new Promise((r) => setTimeout(r, 50));
  const lines = logs.filter((l) => l.path === "/mcp");
  assert.ok(lines.length >= 5);
  const text = JSON.stringify(logs);
  assert.ok(!text.includes("127.0.0.1") && !text.includes("::1") && !text.includes("::ffff"), "no raw IP");
  assert.ok(!text.includes("private_handle_42"));
  const init = lines.find((l) => l.method === "initialize");
  assert.deepEqual(init.client, { name: "t", version: "1" });
  assert.equal(init.protocol_version, "2025-06-18");
  const nf = lines.find((l) => l.tool === "get_creator_example" && l.outcome === "not_found");
  assert.equal(nf.args.slug, "<unknown>");
  assert.ok(lines.find((l) => l.args?.slug === "sentetik-guzellik-a" && l.outcome === "ok"));
  assert.ok(lines.find((l) => l.tool === "get_instagram_benchmark" && l.outcome === "suppressed"));
  assert.ok(lines.find((l) => l.status === 400 && l.outcome === "invalid"));
  for (const l of lines) { assert.match(l.ip_hash, /^[0-9a-f]{16}$/); assert.equal(typeof l.latency_ms, "number"); assert.ok(l.bytes >= 0); }
});

test("stdio transport serves the same tools", async () => {
  const client = new Client({ name: "stdio-test", version: "1" });
  await client.connect(new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("../src/stdio.mjs", import.meta.url))],
    env: { ...process.env, MCP_DATA_SOURCE: EDITION_DIR, MCP_ALLOW_SYNTHETIC: "1" },
    stderr: "ignore",
  }));
  assert.equal((await client.listTools()).tools.length, 4);
  const r = await client.callTool({ name: "get_instagram_benchmark", arguments: { tier: "all", category: "fitness_health" } });
  assert.equal(r.structuredContent.missing_reason, "below_min_sample");
  await client.close();
});

test("stdio without MCP_DATA_SOURCE, or with a synthetic edition and no dev flag, refuses to start", async () => {
  for (const env of [{}, { MCP_DATA_SOURCE: EDITION_DIR }]) {
    const client = new Client({ name: "stdio-refuse", version: "1" });
    const e = { ...process.env, ...env };
    delete e.MCP_ALLOW_SYNTHETIC;
    if (!env.MCP_DATA_SOURCE) delete e.MCP_DATA_SOURCE;
    await assert.rejects(client.connect(new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL("../src/stdio.mjs", import.meta.url))], env: e, stderr: "ignore" })));
  }
});
