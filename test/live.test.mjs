import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { summarize } from "../live/agent-tools.mjs";

const root = new URL("../", import.meta.url);
const script = fileURLToPath(new URL("live/agent-tools.mjs", root));

function cli(args, env) {
  return new Promise((resolve) => {
    execFile(process.execPath, [script, ...args], { env: { ...process.env, STARLECTA_AGENT_KEY: "", ...env } }, (error, stdout, stderr) =>
      resolve({ code: error ? error.code : 0, stdout, stderr }),
    );
  });
}

async function withServer(handler, fn) {
  const seen = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, body });
      handler(req, res, seen.length);
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`, seen);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

const json = (res, status, body, headers = {}) => {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(body));
};

test("a keyed command without STARLECTA_AGENT_KEY stops before any request", async () => {
  const out = await cli(["lookup", "synthetic_beauty_a"], { STARLECTA_BASE_URL: "http://127.0.0.1:9" });
  assert.equal(out.code, 2);
  assert.match(out.stderr, /needs an agent key/);
});

test("search maps flags to the documented query names and sends the bearer header", async () => {
  await withServer(
    (req, res) => json(res, 200, { count: "fewer than 10", cards: [] }),
    async (base, seen) => {
      const out = await cli(["search", "--tier", "micro", "--category", "beauty", "--followers-min", "10000", "--followers-max", "100000", "--er-measured"], {
        STARLECTA_BASE_URL: base,
        STARLECTA_AGENT_KEY: "slk_TEST",
      });
      assert.equal(out.code, 0, out.stderr);
      const url = new URL(seen[0].url, base);
      assert.equal(url.pathname, "/api/agent/tools/search");
      assert.deepEqual(Object.fromEntries(url.searchParams), {
        tier: "micro",
        category: "beauty",
        followers_min: "10000",
        followers_max: "100000",
        er_measured: "true",
      });
      assert.equal(seen[0].auth, "Bearer slk_TEST");
      assert.match(out.stdout, /Matches: fewer than 10/);
    },
  );
});

test("ai-search posts the sentence as JSON", async () => {
  await withServer(
    (req, res) => json(res, 200, { count: 3 }),
    async (base, seen) => {
      const out = await cli(["ai-search", "Turkish beauty creators"], { STARLECTA_BASE_URL: base, STARLECTA_AGENT_KEY: "slk_TEST" });
      assert.equal(out.code, 0, out.stderr);
      assert.equal(seen[0].method, "POST");
      assert.deepEqual(JSON.parse(seen[0].body), { sentence: "Turkish beauty creators" });
    },
  );
});

test("429 waits Retry-After once and retries once", async () => {
  await withServer(
    (req, res, n) => (n === 1 ? json(res, 429, { error: "rate_limited" }, { "retry-after": "0" }) : json(res, 200, { status: "open" })),
    async (base, seen) => {
      const out = await cli(["lookup", "synthetic_beauty_a"], { STARLECTA_BASE_URL: base, STARLECTA_AGENT_KEY: "slk_TEST" });
      assert.equal(out.code, 0, out.stderr);
      assert.equal(seen.length, 2);
      assert.match(out.stderr, /Waiting 0 s once/);
    },
  );
});

test("a second 429 stops with a non-zero exit and no third request", async () => {
  await withServer(
    (req, res) => json(res, 429, {}, { "retry-after": "0" }),
    async (base, seen) => {
      const out = await cli(["lookup", "synthetic_beauty_a"], { STARLECTA_BASE_URL: base, STARLECTA_AGENT_KEY: "slk_TEST" });
      assert.equal(out.code, 1);
      assert.equal(seen.length, 2);
    },
  );
});

test("429 without Retry-After is not retried", async () => {
  await withServer(
    (req, res) => json(res, 429, {}),
    async (base, seen) => {
      const out = await cli(["lookup", "synthetic_beauty_a"], { STARLECTA_BASE_URL: base, STARLECTA_AGENT_KEY: "slk_TEST" });
      assert.equal(out.code, 1);
      assert.equal(seen.length, 1);
    },
  );
});

test("401 prints the key hint and exits non-zero", async () => {
  await withServer(
    (req, res) => json(res, 401, { error: "invalid_key" }),
    async (base) => {
      const out = await cli(["compare", "a_b", "c_d"], { STARLECTA_BASE_URL: base, STARLECTA_AGENT_KEY: "slk_TEST" });
      assert.equal(out.code, 1);
      assert.match(out.stderr, /invalid_key/);
    },
  );
});

test("trend-cloud works without a key and prefers structuredContent", async () => {
  await withServer(
    (req, res) => {
      const data = { period: "last_7_days", computed_at: "2026-01-01T00:00:00Z", hashtags: [{ tag: "#x", posts: 1 }] };
      json(res, 200, { jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: "{}" }], structuredContent: data } });
    },
    async (base, seen) => {
      const out = await cli(["trend-cloud"], { STARLECTA_BASE_URL: base });
      assert.equal(out.code, 0, out.stderr);
      assert.equal(seen[0].auth, undefined);
      assert.match(out.stdout, /#x {2}1 posts/);
    },
  );
});

test("an MCP isError answer (HTTP 200) exits non-zero", async () => {
  await withServer(
    (req, res) => json(res, 200, { jsonrpc: "2.0", id: 1, result: { isError: true, content: [{ type: "text", text: "This tool needs an agent key." }] } }),
    async (base) => {
      const out = await cli(["trend-cloud"], { STARLECTA_BASE_URL: base });
      assert.equal(out.code, 1);
      assert.match(out.stderr, /needs an agent key/);
    },
  );
});

test("the summary never crashes on an unknown shape", () => {
  for (const cmd of ["lookup", "compare", "search", "ai-search", "trend-cloud"]) {
    for (const data of [{}, { unexpected: [1, 2] }, [], null, "text", { cards: [null, 5, {}] }]) {
      assert.equal(typeof summarize(cmd, data), "string");
    }
  }
});

test("MCP config examples are valid JSON and carry only the placeholder key", () => {
  const dir = new URL("live/mcp-configs/", root);
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  assert.ok(files.length >= 4);
  for (const f of files) {
    const text = readFileSync(new URL(f, dir), "utf8");
    JSON.parse(text);
    assert.match(text, /starlecta\.com\/mcp/);
  }
});

test("no agent key is committed anywhere in the live docs, configs or README", () => {
  const files = [
    "README.md",
    "live/WALKTHROUGH.md",
    "live/agent-tools.mjs",
    ...readdirSync(new URL("live/mcp-configs/", root)).map((f) => `live/mcp-configs/${f}`),
  ];
  for (const f of files) {
    const hits = [...readFileSync(new URL(f, root), "utf8").matchAll(/slk_[A-Za-z0-9_]+/g)].map((m) => m[0]);
    for (const h of hits) assert.match(h, /^slk_(YOUR_KEY|TEST|FAKE)$/, `${f} holds ${h}`);
  }
});
