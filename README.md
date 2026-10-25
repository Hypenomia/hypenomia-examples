# hypenomia-examples

Hypenomia is an influencer analytics platform for brands and agencies in Turkey: track rival brands' Instagram creator collaborations — Stories, posts and Reels — compare creators and prepare reports with stated sources and methods. Website: [hypenomia.com](https://hypenomia.com).

This repository holds public examples: a read-only MCP server over an open sample edition, offline example workflows, and synthetic sample outputs. Licence: MIT (code). Report security issues to support@hypenomia.com, see [SECURITY.md](SECURITY.md).

**Türkçe:** Hypenomia, Türkiye'deki markalar ve ajanslar için bir influencer analitik platformudur: rakip markaların Instagram içerik üreticisi iş birliklerini (Story, gönderi ve Reels) izler, üreticileri karşılaştırır ve kaynak ve yöntemleri belirtilmiş raporlar hazırlar. Bu depo; açık örnek verisi üzerinde salt okunur bir MCP sunucusu, çevrimdışı örnek iş akışları ve tamamen sentetik örnek çıktılar içerir. Güvenlik bildirimleri: support@hypenomia.com.

The sample outputs and two small workflows cover the public influencer data tools: the Instagram engagement benchmark and the comparison of two creators. All data here is synthetic.

## Contents

| Path | What it is |
|---|---|
| `DATA-DICTIONARY.md` | every field in the sample files, its unit and what null means |
| `fixtures/benchmark-instagram-engagement.json` | a benchmark response: engagement rate by follower tier and category, aggregates only |
| `fixtures/compare-*.json` | three comparison responses: same tier, different groups, one account not tracked |
| `fixtures/brief-input.json` | brand-level aggregates in an example format for the brief workflow (not an API response) |
| `workflows/compare-two-creators.mjs` | writes a comparison note from a saved comparison response |
| `workflows/competitor-brief.mjs` | writes an anonymous competitor brief from brand aggregates |
| `expected/` | the notes the workflows produce from the fixtures |
| `mcp-server/` | read-only MCP server (stdio and stateless HTTP) over a public open-sample edition; own `package.json` with a pinned SDK, synthetic edition fixture and tests |

The JSON fixtures were produced by Hypenomia's own response builders from invented rows. Handles look like `example-creator-a`; Instagram does not allow hyphens in handles, so none of them is a real account.

## Run

Node 24. The workflows have no dependencies and no network. The MCP server in `mcp-server/` has its own README and pinned dependencies.

```sh
node workflows/compare-two-creators.mjs fixtures/compare-same-tier.json
node workflows/competitor-brief.mjs fixtures/brief-input.json
npm test
(cd mcp-server && npm ci && npm test)
```

`npm run golden` rewrites `expected/` after an intended change.

## Rules the workflows keep

- A comparison uses the bands in the response and never names a winner. If one account is not tracked, or the two scores come from different formula versions, that metric is not compared.
- Rates and scores keep their dates, coverage and missing-data reasons; null is never shown as zero.
- Measured Reel plays and estimated Story views stay in separate tables and are never added together. Plays are gross plays, not unique reach.
- Shared creators count accounts that posted for two brands, not shared audience.

## Limits

The data covers accounts Hypenomia tracks, not every creator. The quality score is no guarantee of sales or reach. Definitions: [SQS](https://hypenomia.com/en/methods/sqs), [engagement rate](https://hypenomia.com/en/methods/engagement), [Story estimate](https://hypenomia.com/en/methods/story-estimate).
