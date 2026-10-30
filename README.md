# starlecta-examples

Open examples for [Starlecta](https://starlecta.com), an influencer analytics platform for brands and agencies in Turkey. Starlecta tracks Instagram creators and the brands they work with (Stories, posts and Reels), and explains metric definitions and scope.

**Who this is for:** developers and analysts at brands and agencies who want to see how Starlecta's public numbers are shaped, read them from code, or connect them to an AI assistant through MCP. It is not the product and holds no customer data; the live tools it documents are Starlecta's public ones.

**Türkçe:** Starlecta, Türkiye'deki markalar ve ajanslar için bir influencer analitik platformudur; Instagram içerik üreticilerini ve çalıştıkları markaları (Story, gönderi, Reels) izler ve metrik tanımlarını ve kapsamını açıklar. Bu depo; starlecta.com'daki canlı ücretsiz araçları ve ajan anahtarıyla barındırılan MCP sunucusunu anlatır ("Live tools" bölümü), ayrıca açık örnek verisi üzerinde salt okunur yerel bir MCP sunucusu, çevrimdışı örnek iş akışları ve tamamen sentetik örnek çıktılar içerir. Güvenlik bildirimleri: support@starlecta.com.

## Live tools on starlecta.com

Besides the offline examples below, Starlecta runs free tools on real data. Everything in this section is hosted by Starlecta; the code in this repository only calls it. Source of truth for access, limits and endpoints: [starlecta.com/auth.md](https://starlecta.com/auth.md). More: [docs](https://starlecta.com/en/docs), page index [llms.txt](https://starlecta.com/llms.txt), MCP [server card](https://starlecta.com/.well-known/mcp/server-card.json).

**Free web tools** (in a browser, no sign-up):

| Tool | URL |
|---|---|
| Influencer lookup | [starlecta.com/en/demo](https://starlecta.com/en/demo) |
| Compare two influencers | [starlecta.com/en/demo/compare](https://starlecta.com/en/demo/compare) |
| Search and AI search | [starlecta.com/en/demo/search](https://starlecta.com/en/demo/search) |
| Trend Cloud (hashtags, products, platforms and brands shared in the last 7 days) | [starlecta.com/en/tools/trend-cloud](https://starlecta.com/en/tools/trend-cloud) |
| Engagement rate calculator | [starlecta.com/en/tools/engagement-rate-calculator](https://starlecta.com/en/tools/engagement-rate-calculator) |
| Story views estimator | [starlecta.com/en/tools/story-views-estimator](https://starlecta.com/en/tools/story-views-estimator) |
| Campaign content planner | [starlecta.com/en/tools/campaign-content-planner](https://starlecta.com/en/tools/campaign-content-planner) |

The interactive demo is for people in a browser; do not automate it. Agents use a key (below). The live tools answer from Starlecta's tracked accounts and show dated, rounded figures; they are not a full list of creators in Turkey.

**Hosted MCP server:** `https://starlecta.com/mcp` (Streamable HTTP, stateless). Tools: `lookup_influencer`, `compare_influencers`, `search_influencers`, `ai_search_influencers`, `trend_cloud`. `trend_cloud` works without a key. Discovery card: [server-card.json](https://starlecta.com/.well-known/mcp/server-card.json). Client setup (Cursor, VS Code, Claude Desktop, Claude Code): [live/mcp-configs](live/mcp-configs/README.md).

**Get a key (an agent can do this itself, once):**

```sh
curl -X POST https://starlecta.com/api/agent/keys   -H 'content-type: application/json'   -d '{"label":"<agent or company name, up to 80 characters>","email":"<contact e-mail>","use":"<what the agent will do, up to 200 characters>"}'
```

The key starts with `slk_` and is shown once; Starlecta keeps only a hash. Keys per address and per day are limited, so ask for one and reuse it. A person can use the form instead ([English](https://starlecta.com/en/agents/key), [Türkçe](https://starlecta.com/tr/ajanlar/anahtar)). Keep the key secret: never put it in a page, a public repository or a shared prompt. Use it as `Authorization: Bearer slk_...` on the MCP server and on the REST endpoints. Use a key for the purpose you gave; do not share or resell it, copy the catalogue, build lists in bulk or get around the limits with several keys. Revocation: write to support@starlecta.com.

**REST endpoints** (all need the bearer header; OpenAPI: [public-pages.json](https://starlecta.com/openapi/public-pages.json)):

- Lookup: `GET https://starlecta.com/api/agent/tools/lookup?handle=<instagram handle>`
- Compare: `GET https://starlecta.com/api/agent/tools/compare?a=<handle>&b=<handle>`
- Search: `GET https://starlecta.com/api/agent/tools/search?category=<code>&tier=<micro|macro|mega>&followers_min=<n>&followers_max=<n>&er_measured=<true|false>` (every filter is optional)
- AI search: `POST https://starlecta.com/api/agent/tools/ai-search` with `{"sentence": "<one sentence, 2 to 200 characters>"}`. The sentence is read as the same filters as Search (fast mode only).

**What an answer holds:** each handle is `open` (public follower count and measured engagement rate, dated), `tracked` (name, tier, category and a rounded follower band, no metric) or `not_listed` (no match, or an account that cannot be shown). Search returns a count (shown as `fewer than 10` below 10), up to two open cards and the number of locked results; it never lists tracked or locked identities. The Starlecta Quality Score is not part of these tools for named creators. Quote a figure together with its date.

**Limits per key** (launch values; the response that issues your key lists yours):

| | |
|---|---|
| Per day | lookup 30, compare 15, search 30, AI search 10 |
| Per minute | 6 requests, all tools together |
| Shared | a daily total across all agent keys also applies, separate from the visitor limits of the website |

`429` with `Retry-After` means a limit was reached: wait that many seconds. `401` with `{"error":"invalid_key"}` means the key is missing, wrong or revoked. `404` means that tool is switched off. The MCP server reports a missing or wrong key differently: HTTP 200 with `isError: true` and a text block, not 401.

**Try it from the command line** ([live/agent-tools.mjs](live/agent-tools.mjs), Node 24, no dependencies; it reads the key from `STARLECTA_AGENT_KEY`, waits for `Retry-After` once and stops):

```sh
node live/agent-tools.mjs trend-cloud                  # no key needed
export STARLECTA_AGENT_KEY=slk_YOUR_KEY
node live/agent-tools.mjs lookup <handle>
node live/agent-tools.mjs compare <handle-a> <handle-b>
node live/agent-tools.mjs search --tier micro --category beauty --er-measured
node live/agent-tools.mjs ai-search "Turkish beauty creators with 10K to 100K followers"
```

`trend-cloud` prints, for example (a real excerpt, computed 2026-10-30T19:17Z; counts change daily):

```text
Trend Cloud, last_7_days, computed 2026-10-30T19:17:01.331943Z
Hashtags:
  #29ekimcumhuriyetbayramı  2657 posts
  #29ekim  2126 posts
Platforms:
  Trendyol  65625 shares
  Hepsiburada  60511 shares
```

A worked example with illustrative answers (AI search, two lookups, a comparison and a shortlist note): [live/WALKTHROUGH.md](live/WALKTHROUGH.md). Terms: [terms](https://starlecta.com/en/terms), [privacy](https://starlecta.com/en/privacy).

## Offline examples: what you can do with them

| Need | Example in this repo | Guide on starlecta.com |
|---|---|---|
| Compare two creators without declaring a winner, and see when a comparison is not valid | `workflows/compare-two-creators.mjs` | [Compare two creators](https://starlecta.com/en/guides/compare-two-creators) |
| Brief a client on competitor brands' creator activity, from aggregates only | `workflows/competitor-brief.mjs` | [Agency sector and competitor brief](https://starlecta.com/en/guides/agency-sector-competitor-brief) |
| Let an AI assistant read a small open sample pool and an engagement benchmark | `mcp-server/` (read-only MCP server) | [Docs](https://starlecta.com/en/docs) |
| Understand every field and what null means | `DATA-DICTIONARY.md` | [Methods](https://starlecta.com/en/methods) |

Also on starlecta.com: [tracking competitor Instagram Stories](https://starlecta.com/en/guides/track-competitor-instagram-stories), [sample reports](https://starlecta.com/en/samples), [Turkey](https://starlecta.com/en/turkey).

## Try it

Node 24. The workflows have no dependencies and no network.

```sh
node workflows/compare-two-creators.mjs fixtures/compare-same-tier.json
```

```text
# Comparison note: example-creator-a and example-creator-b
...
| Quality score (SQS) | 74 (coverage 92%, confidence high) | 66 (coverage 78%, confidence high) |
| Engagement rate, 90 days | 3.1% (38 posts and reels, as of 2026-10-21) | 2.9% (25 posts and reels, as of 2026-10-21) |

## How they stand

- Quality score: example-creator-a is higher than example-creator-b ("similar" means within 5 points).
- Engagement rate: example-creator-a is similar to example-creator-b ("similar" means within 15% of the higher rate).
```

When one account is not tracked, the note says so instead of inventing a number (`fixtures/compare-one-not-tracked.json`):

```text
- Quality score: not comparable (one account is not tracked).
- Engagement rate: not comparable (one account is not tracked).
```

```sh
node workflows/competitor-brief.mjs fixtures/brief-input.json
```

```text
# Competitor brief: Brand A and 3 tracked brands

Instagram, 2026-09-14 to 2026-10-13 (30 days). Synthetic example data.

| Brand | Verified posts | Left out (no evidence) | Creators | Returning | New |
| --- | --- | --- | --- | --- | --- |
| Brand A | 31 | 64 | 19 | 7 | 12 |
...
Brand A ranks 2 of 4 by verified posts and 2 of 4 by creators.
```

Full outputs are in `expected/`. Run the tests with `npm test`; `npm run golden` rewrites `expected/` after an intended change.

### Local MCP server (synthetic edition)

```sh
cd mcp-server
npm ci
npm test
MCP_ALLOW_SYNTHETIC=1 MCP_DATA_SOURCE=test/fixtures/edition-from-export npm run stdio
```

The server speaks MCP over stdio (or stateless HTTP with `npm start`). It advertises four read-only tools: `search_creator_examples`, `get_creator_example`, `compare_creator_examples`, `get_instagram_benchmark`. A `get_creator_example` call for `sentetik-guzellik-a` on the bundled synthetic edition returns:

```text
Sentetik Güzellik A (sentetik-guzellik-a) · Beauty · Micro · 10K–100K · ~48000 followers
Engagement 3.1234; quality score (SQS): in the customer panel
```

and an unknown name returns `Not found.` with `Missing: not_in_open_pool`, never an invented row. Client setup (Claude Code, Claude Desktop, MCP Inspector): [mcp-server/examples/client-configs.md](mcp-server/examples/client-configs.md). Details: [mcp-server/README.md](mcp-server/README.md).

## Contents

| Path | What it is |
|---|---|
| `DATA-DICTIONARY.md` | every field in the sample files, its unit and what null means |
| `fixtures/benchmark-instagram-engagement.json` | a benchmark response: engagement rate by follower tier and category, aggregates only |
| `fixtures/compare-*.json` | three comparison responses: same tier, different groups, one account not tracked |
| `fixtures/brief-input.json` | brand-level aggregates in an example format for the brief workflow (not an API response) |
| `workflows/` | the two offline workflows |
| `expected/` | the notes the workflows produce from the fixtures |
| `live/` | the live-tools helpers: `agent-tools.mjs` (command line client), `mcp-configs/` (Cursor, VS Code, Claude Desktop and Claude Code setups for the hosted server) and `WALKTHROUGH.md` |
| `mcp-server/` | read-only local MCP server (stdio and stateless HTTP) with its own `package.json`, pinned SDK, synthetic edition fixture and tests |

## Data and limits

- The fixtures, expected outputs and the bundled MCP edition in this repository are synthetic. The one real, dated excerpt is the Trend Cloud sample in the live-tools section and in [live/WALKTHROUGH.md](live/WALKTHROUGH.md), captured from the hosted server on 2026-10-30; every other example answer in `live/` is marked illustrative. The workflow fixtures use handles like `example-creator-a`; Instagram does not allow hyphens in handles, so none is a real account. The MCP edition fixture uses names like `synthetic_beauty_a` and slugs like `sentetik-guzellik-a`. They are invented and labelled synthetic, but a handle in the underscore form is valid on Instagram and could exist, so do not read it as a statement about any account.
- The local MCP server in `mcp-server/` serves a selected pool of open examples (10 in the bundled edition), not every creator in Turkey. It has no default data source: you point it at a public-data folder or URL, and the open edition files are not published. For live data use the hosted tools above, which answer from Starlecta's tracked accounts with the limits stated there.
- Rules the workflows keep: a comparison uses the bands in the response and never names a winner; rates and scores keep their dates, coverage and missing-data reasons, and null is never shown as zero; measured Reel plays and estimated Story views are kept apart and never added; shared creators count accounts that posted for two brands, not shared audience.
- The quality score is no guarantee of sales or reach. The SQS formula and weights are not published here; the MCP server never returns a score for a named creator, and the SQS values in the workflow output above are invented fixture numbers for the placeholder handles `example-creator-a` and `example-creator-b`. Definitions: [SQS](https://starlecta.com/en/methods/sqs), [engagement rate](https://starlecta.com/en/methods/engagement), [Story estimate](https://starlecta.com/en/methods/story-estimate).

## Licence and security

Code: MIT, see [LICENSE](LICENSE). The licence covers code only; reuse terms for Starlecta data are separate, see [DATA-TERMS.md](DATA-TERMS.md) (draft). Report security issues to support@starlecta.com, see [SECURITY.md](SECURITY.md).
