# Hypenomia open-examples MCP server

A small, read-only [Model Context Protocol](https://modelcontextprotocol.io) server. It lets an assistant read what [Hypenomia](https://hypenomia.com) publishes openly: a selected pool of example creators, and an Instagram engagement benchmark. It reads the same public edition files the website reads (`latest.json`, `manifest.json`, `creators.json`, `pairs.json`, `benchmark.json`, produced by the exporter in the customer API repo). It has no database, API, provider or secret access.

Status: early example build. There is no default data source and no built-in data. Tests use a **synthetic** edition (`test/fixtures/edition-from-export/`). A synthetic edition is refused unless `MCP_ALLOW_SYNTHETIC=1` is set (development only).

Coverage: the selected open samples and the tracked set, not every creator in Turkey. Always cite `data_as_of`; stop when `missing_reason` is set; never add measured and estimated numbers.

## Quickstart

Node 24.

```sh
cd mcp-server
npm ci
npm test                 # contract, filter sweep, no-oracle, HTTP and stdio tests
export MCP_ALLOW_SYNTHETIC=1 MCP_DATA_SOURCE=test/fixtures/edition-from-export   # bundled edition is synthetic
npm run stdio            # stdio server (for local clients)
npm start                # stateless HTTP on 127.0.0.1:8080, POST /mcp
```

Connect a client: see [examples/client-configs.md](examples/client-configs.md).

## Tools

All tools are `readOnlyHint`, `idempotentHint`, not `openWorldHint`; inputs reject unknown arguments; every result has an `outputSchema`.

| Tool | Input | Returns |
|---|---|---|
| `search_creator_examples` | optional `category`, `tier`, `lang` (`en`/`tr`) | at most 3 open samples, fixed order (followers desc, then slug), never widened. Fewer than 3 matches sets `missing_reason: few_open_samples` |
| `get_creator_example` | `slug` (or the Instagram handle, case-insensitive, with or without `@`), `lang` | published summary of one open sample; any unknown key returns the same bytes (`found:false`, `not_in_open_pool`) |
| `compare_creator_examples` | `slug_a`, `slug_b` (different creators; slug or handle), `lang` | the published pair for exactly (`slug_a`, `slug_b`): engagement bands (the SQS quality score is not public for named creators and is never returned) read "a against b", comparable flags, notes. Both orders are published; nothing is flipped. No winner |
| `get_instagram_benchmark` | `tier` or `all`, `category` or `all` | one cell: cohort, n, excluded counts, p25/p50/p75. Suppressed cells give `null` and `below_min_sample`, never 0 |

Sector briefs, weekly highlights, content examples, list pages and brand pages are not tools (the bundled edition also carries `lists.json` and `brands.json`, which the server does not read): the public schema has no per-sector data and the weekly and content files are never read (`MCP_TOOLS` controls which tools are exposed).

Every result is `structuredContent = {schema_version, snapshot_id, edition, data_as_of:{oldest,newest}, period (object or null), method_version, count, matches, source_url, method_url, missing_reason, lang, data}` (taken from the file `header`) plus one Markdown `text` block. Field meanings: [DATA-DICTIONARY.md](DATA-DICTIONARY.md).

Invalid input (unknown enum, extra argument, bad edition string) comes back as a tool error whose text starts with `MCP error -32602` (SDK 1.32 reports validation errors this way).

## Data source

`MCP_DATA_SOURCE` (required, no default) is the public-data root: a directory or an `http(s)` base URL containing `latest.json` and `editions/<date>/...`. All reading is in `src/snapshot.mjs`:

- an edition is served only while `latest.json` lists its exact (edition, revision) and manifest hash, and only up to `manifest.serve_until` (Istanbul date, checked on every request, not only at load); anything unlisted, removed or expired is dropped and tools answer "Data temporarily unavailable";
- an edition with `synthetic: true` is refused unless `MCP_ALLOW_SYNTHETIC=1`;
- re-reading the same old files never makes them newer: results carry the files' own `data_as_of`, and `serve_until` bounds their life;

- every file read is size-capped and checked against its manifest sha256, byte count and `header` (edition, snapshot_id, file, count); same-origin only, no redirects, 5 s timeout;
- a forbidden key (internal ids, exact followers, bio, contact, media URLs) or text pattern (signed URLs, emails other than `support@hypenomia.com`) fails the load;
- creators, pairs and benchmark cells are cross-checked against the manifest enums, samples and the pool;
- HTTP mode refreshes every 10 minutes; a transient failure keeps the last good edition up to 24 hours, a missing (404/410) or unlisted edition is dropped at once.

## HTTP behaviour

`POST /mcp` only; `GET`/`DELETE` give 405. One JSON-RPC message per request, JSON responses, no session id, no SSE. 413 over 16 KB, 415 wrong content type, 406 wrong accept, 400 batch or bad protocol version, 403 non-allowlisted `Origin`, 429 (with `Retry-After`) after 30 tool calls/min or 1,000/day per client address, 503 global breaker. `/healthz`, `/readyz` (503 without a snapshot).

Environment (all optional except `MCP_DATA_SOURCE`): `PORT`, `HOST`, `MCP_DATA_SOURCE` (required), `MCP_ALLOW_SYNTHETIC` (dev only), `MCP_REFRESH_MS`, `MCP_MAX_STALE_MS`, `MAX_BODY_BYTES`, `MAX_RESPONSE_BYTES`, `RATE_PER_MIN`, `RATE_PER_DAY`, `RATE_GLOBAL_PER_DAY`, `REQUEST_TIMEOUT_MS`, `ALLOWED_ORIGINS` (comma list), `CLIENT_IP_HEADER` (only behind a trusted proxy, e.g. `cf-connecting-ip`), `MCP_TOOLS`.

Logs (stderr, one JSON line per request) hold tool, public arguments, outcome (`ok|not_found|few|suppressed|in_preparation|invalid|rate_limited|error`), `snapshot_id`, latency, bytes, self-reported client, protocol version and a daily-salted hash of the truncated network prefix. No raw IPs.

## Licence and data terms

The code is MIT-licensed ([LICENSE](../LICENSE)). The licence covers code only. Reuse of the data is governed by separate data terms, see [DATA-TERMS.md](../DATA-TERMS.md) (draft). See [SECURITY.md](../SECURITY.md) to report a problem.
