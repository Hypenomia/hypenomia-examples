#!/usr/bin/env node
// Command line client for Starlecta's live public tools. Node 24, no dependencies.
//   STARLECTA_AGENT_KEY=slk_... node live/agent-tools.mjs lookup some_handle
// Key and limits: https://starlecta.com/auth.md
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

const BASE = (process.env.STARLECTA_BASE_URL || "https://starlecta.com").replace(/\/$/, "");
const MAX_WAIT_SECONDS = 120;

const USAGE = `Usage: node live/agent-tools.mjs <command> [arguments]

  lookup <handle>
  compare <handle-a> <handle-b>
  search [--tier T] [--category CODE] [--followers-min N] [--followers-max N] [--er-measured]
  ai-search "<one sentence, 2 to 200 characters>"
  trend-cloud                     (no key needed)

Key: set STARLECTA_AGENT_KEY. How to get one: https://starlecta.com/auth.md
Options on any command: --json (print only the JSON)`;

export class CliError extends Error {
  constructor(message, code = 1) {
    super(message);
    this.code = code;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function once(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  return { res, text };
}

// One request; on 429 waits Retry-After seconds once and tries once more.
async function send(url, init, log) {
  let { res, text } = await once(url, init);
  if (res.status === 429) {
    const wait = Number(res.headers.get("retry-after"));
    if (!res.headers.has("retry-after") || !Number.isFinite(wait) || wait < 0) {
      throw new CliError(`Rate limit reached (429) and no usable Retry-After header: ${text.slice(0, 300)}`);
    }
    if (wait > MAX_WAIT_SECONDS) {
      throw new CliError(`Rate limit reached (429); Retry-After is ${wait} s, longer than the ${MAX_WAIT_SECONDS} s this script waits. Try again later.`);
    }
    log(`Rate limit reached (429). Waiting ${wait} s once, then trying again.`);
    await sleep(wait * 1000);
    ({ res, text } = await once(url, init));
    if (res.status === 429) {
      throw new CliError(`Rate limit still reached after waiting (429, Retry-After ${res.headers.get("retry-after")}). Stopping.`);
    }
  }
  if (res.status === 401) {
    throw new CliError(`401 invalid_key: the key is missing, wrong or revoked. Get one with POST ${BASE}/api/agent/keys (see ${BASE}/auth.md). ${text.slice(0, 200)}`);
  }
  if (res.status === 404) throw new CliError("404: that tool is switched off.");
  if (!res.ok) throw new CliError(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  return { res, text };
}

function parseBody(text, contentType) {
  if (/text\/event-stream/.test(contentType || "")) {
    const data = text.split("\n").filter((l) => l.startsWith("data:")).pop();
    if (!data) throw new CliError("Empty event stream from the MCP server.");
    return JSON.parse(data.slice(5));
  }
  return JSON.parse(text);
}

export async function rest(path, { key, query, body } = {}, log = console.error) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(query || {})) if (v !== undefined) url.searchParams.set(k, String(v));
  const headers = { accept: "application/json", authorization: `Bearer ${key}` };
  const init = body === undefined ? { headers } : { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(body) };
  const { text } = await send(url, init, log);
  return JSON.parse(text);
}

// trend_cloud needs no key; the MCP server is stateless, so one tools/call is enough.
export async function mcpCall(name, args = {}, key, log = console.error) {
  const headers = { "content-type": "application/json", accept: "application/json, text/event-stream" };
  if (key) headers.authorization = `Bearer ${key}`;
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });
  const { res, text } = await send(`${BASE}/mcp`, { method: "POST", headers, body }, log);
  const message = parseBody(text, res.headers.get("content-type"));
  if (message.error) throw new CliError(`MCP error ${message.error.code}: ${message.error.message}`);
  const result = message.result || {};
  const first = result.content?.find((c) => c.type === "text")?.text;
  // The MCP server answers a missing key with HTTP 200 and isError: true, not with 401.
  if (result.isError) throw new CliError(`MCP tool error: ${first ?? JSON.stringify(result)}`);
  if (result.structuredContent) return result.structuredContent;
  if (first === undefined) throw new CliError("The MCP answer holds no text content.");
  return JSON.parse(first);
}

const get = (o, ...names) => {
  for (const n of names) if (o && o[n] !== undefined && o[n] !== null) return o[n];
  return undefined;
};

const show = (v) => (typeof v === "object" ? JSON.stringify(v) : v);

function cardLine(card) {
  if (!card || typeof card !== "object") return String(card);
  const handle = get(card, "handle", "username");
  const parts = [
    handle ? `@${String(handle).replace(/^@/, "")}` : undefined,
    get(card, "name", "display_name"),
    get(card, "tier"),
    get(card, "category"),
  ].filter(Boolean);
  const followers = get(card, "followers", "followers_band", "followers_rounded");
  if (followers !== undefined) parts.push(`followers ${show(followers)}`);
  const er = get(card, "engagement_rate", "er");
  if (er !== undefined) parts.push(`engagement ${show(er)}`);
  const status = get(card, "status");
  if (status) parts.push(`status ${status}`);
  return parts.length ? parts.join(" · ") : JSON.stringify(card);
}

const topLines = (title, list, label) =>
  Array.isArray(list) && list.length ? [`${title}:`, ...list.slice(0, 5).map((x) => `  ${label(x)}`)] : [];

// Best-effort summary. Only trend_cloud has a shape this repo has seen; for the
// keyed tools every line is optional and the full JSON is always printed after it.
export function summarize(command, data) {
  if (!data || typeof data !== "object") return "";
  const lines = [];
  if (command === "trend-cloud") {
    lines.push(`Trend Cloud, ${get(data, "period") ?? "last 7 days"}, computed ${get(data, "computed_at") ?? "(date not given)"}`);
    lines.push(...topLines("Hashtags", data.hashtags, (x) => `${x.tag}  ${x.posts} posts`));
    lines.push(...topLines("Products", data.products, (x) => `${x.name} (${x.brand})  ${x.shares} shares`));
    lines.push(...topLines("Platforms", data.platforms, (x) => `${x.name}  ${x.shares} shares`));
    lines.push(...topLines("Brands", data.brands, (x) => `${x.name}  ${x.shares} shares`));
    return lines.join("\n");
  }
  const status = get(data, "status");
  if (status) lines.push(`Status: ${status}`);
  const count = get(data, "count", "total");
  if (count !== undefined) lines.push(`Matches: ${show(count)}`);
  const locked = get(data, "locked", "locked_count");
  if (typeof locked === "number") lines.push(`Locked results: ${locked}`);
  const cards = get(data, "cards", "results", "open_cards");
  if (Array.isArray(cards)) lines.push(...cards.map((c) => `- ${cardLine(c)}`));
  else if (command === "lookup") lines.push(cardLine(get(data, "card", "influencer") ?? data));
  const a = get(data, "a");
  const b = get(data, "b");
  if (a || b) lines.push(`A: ${cardLine(a)}`, `B: ${cardLine(b)}`);
  return lines.join("\n");
}

function requireKey() {
  const key = process.env.STARLECTA_AGENT_KEY;
  if (!key) {
    throw new CliError(
      `This command needs an agent key. Set STARLECTA_AGENT_KEY.\nGet a key: POST ${BASE}/api/agent/keys with {"label","email","use"} (see ${BASE}/auth.md), or use the form at ${BASE}/en/agents/key.\ntrend-cloud works without one.`,
      2,
    );
  }
  return key;
}

const OPTIONS = {
  tier: { type: "string" },
  category: { type: "string" },
  "followers-min": { type: "string" },
  "followers-max": { type: "string" },
  "er-measured": { type: "boolean" },
  json: { type: "boolean" },
  help: { type: "boolean", short: "h" },
};

export async function run(argv, log = console.error) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true });
  } catch (e) {
    throw new CliError(`${e.message}\n\n${USAGE}`, 2);
  }
  const { values, positionals } = parsed;
  const [command, ...args] = positionals;
  if (values.help || !command) throw new CliError(USAGE, values.help ? 0 : 2);
  const need = (n) => {
    if (args.length !== n) throw new CliError(`${command} takes ${n} argument${n === 1 ? "" : "s"}.\n\n${USAGE}`, 2);
  };

  let data;
  if (command === "trend-cloud") {
    need(0);
    data = await mcpCall("trend_cloud", {}, process.env.STARLECTA_AGENT_KEY, log);
  } else if (command === "lookup") {
    need(1);
    data = await rest("/api/agent/tools/lookup", { key: requireKey(), query: { handle: args[0] } }, log);
  } else if (command === "compare") {
    need(2);
    data = await rest("/api/agent/tools/compare", { key: requireKey(), query: { a: args[0], b: args[1] } }, log);
  } else if (command === "search") {
    need(0);
    // Values are passed through unchecked: the server answers 400 for a value it does not accept.
    const query = {
      category: values.category,
      tier: values.tier,
      followers_min: values["followers-min"],
      followers_max: values["followers-max"],
      er_measured: values["er-measured"] ? "true" : undefined,
    };
    data = await rest("/api/agent/tools/search", { key: requireKey(), query }, log);
  } else if (command === "ai-search") {
    need(1);
    data = await rest("/api/agent/tools/ai-search", { key: requireKey(), body: { sentence: args[0] } }, log);
  } else {
    throw new CliError(`Unknown command: ${command}\n\n${USAGE}`, 2);
  }

  const summary = values.json ? "" : summarize(command, data);
  return `${summary ? `${summary}\n\n` : ""}${JSON.stringify(data, null, 2)}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.argv.slice(2)).then(
    (out) => console.log(out),
    (e) => {
      if (e instanceof CliError) {
        (e.code === 0 ? console.log : console.error)(e.message);
        process.exitCode = e.code;
      } else {
        console.error(`Unexpected error: ${e.message}`);
        process.exitCode = 1;
      }
    },
  );
}
