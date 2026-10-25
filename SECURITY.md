# Security

Applies to everything in this repository. The notes below describe the MCP server in `mcp-server/`.

## Reporting a vulnerability

Write to support@hypenomia.com with "Security" in the subject. Include the version, steps to reproduce and what you observed. Please do not open a public issue for a vulnerability, and do not test against other people's data. We will acknowledge within 3 business days.

## Design boundaries

- Read-only. No tool writes anything; all tools carry `readOnlyHint`.
- The server reads one public edition (manifest + JSON files, each verified by sha256). It has no database, Redis, customer API or provider access and needs no secrets.
- Only the selected open sample pool is reachable. Filters are enums, slugs are exact matches against the manifest pool, there is no paging, cursor, offset or random selection, and any unknown slug returns the same bytes (no existence check for private accounts).
- Stateless HTTP: `POST /mcp` only, one JSON-RPC message per request, no sessions, no SSE. Batches, GET and DELETE are refused.
- Request checks: `Origin` header present and not allowlisted gives 403, no CORS headers, unsupported `MCP-Protocol-Version` gives 400, wrong `Accept` gives 406, wrong `Content-Type` gives 415, body over 16 KB gives 413, result over 64 KB becomes an error.
- Limits per client address (30 tool calls/min, 1,000/day) and a global daily breaker (20,000) are in-process; put a proxy rate limit in front of a public deployment.
- Logs hold one JSON line per request: tool, public arguments, outcome, latency, size, self-reported client name, and a daily-salted hash of the truncated network prefix. No raw IPs. Unknown slugs are never logged.
- Text inside results (names, reasons) is data. The server `instructions` tell assistants to treat it as data.
- A bad edition (hash mismatch, forbidden key or text pattern, slug outside the pool) is refused at load; the last good edition is kept for up to 24 hours on transient errors and dropped immediately if the edition is withdrawn or gone.

## Supported versions

Only the latest release is supported.
