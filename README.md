# hypenomia-examples

Open examples for [Hypenomia](https://hypenomia.com), an influencer analytics platform for brands and agencies in Turkey. Hypenomia tracks Instagram creators and the brands they work with (Stories, posts and Reels), and publishes how each number is made.

**Who this is for:** developers and analysts at brands and agencies who want to see how Hypenomia's public numbers are shaped, read them from code, or connect them to an AI assistant through MCP. It is not the product and holds no live customer data.

**Türkçe:** Hypenomia, Türkiye'deki markalar ve ajanslar için bir influencer analitik platformudur; Instagram içerik üreticilerini ve çalıştıkları markaları (Story, gönderi, Reels) izler ve her sayının nasıl hesaplandığını yayımlar. Bu depo; açık örnek verisi üzerinde salt okunur bir MCP sunucusu, çevrimdışı örnek iş akışları ve tamamen sentetik örnek çıktılar içerir. Güvenlik bildirimleri: support@hypenomia.com.

## What you can do with it

| Need | Example in this repo | Guide on hypenomia.com |
|---|---|---|
| Compare two creators without declaring a winner, and see when a comparison is not valid | `workflows/compare-two-creators.mjs` | [Compare two creators](https://hypenomia.com/en/guides/compare-two-creators) |
| Brief a client on competitor brands' creator activity, from aggregates only | `workflows/competitor-brief.mjs` | [Agency sector and competitor brief](https://hypenomia.com/en/guides/agency-sector-competitor-brief) |
| Let an AI assistant read a small open sample pool and an engagement benchmark | `mcp-server/` (read-only MCP server) | [Docs](https://hypenomia.com/en/docs) |
| Understand every field and what null means | `DATA-DICTIONARY.md` | [Methods](https://hypenomia.com/en/methods) |

Also on hypenomia.com: [tracking competitor Instagram Stories](https://hypenomia.com/en/guides/track-competitor-instagram-stories), [sample reports](https://hypenomia.com/en/samples), [Turkey](https://hypenomia.com/en/turkey).

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

### MCP server

```sh
cd mcp-server
npm ci
npm test
MCP_ALLOW_SYNTHETIC=1 MCP_DATA_SOURCE=test/fixtures/edition-from-export npm run stdio
```

The server speaks MCP over stdio (or stateless HTTP with `npm start`). It advertises four read-only tools: `search_creator_examples`, `get_creator_example`, `compare_creator_examples`, `get_instagram_benchmark`. A `get_creator_example` call for `sentetik-guzellik-a` on the bundled synthetic edition returns:

```text
Sentetik Güzellik A (sentetik-guzellik-a) · Beauty · Micro · 10K–100K · ~48000 followers
Quality score 74 (sqs-b5c-1, 2026-10-25); engagement 3.1234
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
| `mcp-server/` | read-only MCP server (stdio and stateless HTTP) with its own `package.json`, pinned SDK, synthetic edition fixture and tests |

## Data and limits

- Everything in this repository is synthetic. The workflow fixtures use handles like `example-creator-a`; Instagram does not allow hyphens in handles, so none is a real account. The MCP edition fixture uses names like `synthetic_beauty_a` and slugs like `sentetik-guzellik-a`. They are invented and labelled synthetic, but a handle in the underscore form is valid on Instagram and could exist, so do not read it as a statement about any account.
- The MCP server serves a selected pool of open examples (10 in the bundled edition), not every creator in Turkey. There is no default data source: you point it at a public-data folder or URL. Hypenomia's live public edition is not published yet.
- Rules the workflows keep: a comparison uses the bands in the response and never names a winner; rates and scores keep their dates, coverage and missing-data reasons, and null is never shown as zero; measured Reel plays and estimated Story views are kept apart and never added; shared creators count accounts that posted for two brands, not shared audience.
- The quality score is no guarantee of sales or reach. Definitions: [SQS](https://hypenomia.com/en/methods/sqs), [engagement rate](https://hypenomia.com/en/methods/engagement), [Story estimate](https://hypenomia.com/en/methods/story-estimate).

## Licence and security

Code: MIT, see [LICENSE](LICENSE). The licence covers code only; reuse terms for Hypenomia data are separate and not published yet. Report security issues to support@hypenomia.com, see [SECURITY.md](SECURITY.md).
