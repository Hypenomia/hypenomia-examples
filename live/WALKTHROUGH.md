# Walkthrough: a shortlist of Turkish beauty creators

Goal: find Turkish beauty creators with AI search, look up two of them, compare them, and write a short note a colleague can check. It uses the hosted MCP server (`https://starlecta.com/mcp`) and needs an agent key, see [auth.md](https://starlecta.com/auth.md). Setup per client: [mcp-configs](mcp-configs/README.md). It uses 4 tool calls, inside the limit of 6 requests a minute and the daily limits (lookup 30, compare 15, search 30, AI search 10 per key).

**What is real and what is not.** Only the Trend Cloud excerpt in the last section was captured from the live server (2026-10-30). Everything else here is **illustrative**: the handles (`synthetic_beauty_a`, `synthetic_beauty_b`) are invented, the numbers are made up, and the field names are a sketch built from what [auth.md](https://starlecta.com/auth.md) says an answer holds, not a published schema. A handle in the underscore form is valid on Instagram and could exist; it is not a statement about any account. When you run the steps yourself, read the real answer: `node live/agent-tools.mjs` prints the full JSON under its summary.

## 1. AI search: one sentence

Tool: `ai_search_influencers`, input: one sentence of 2 to 200 characters, Turkish or English. The sentence is read as the same filters as `search_influencers` (fast mode only).

```json
{ "name": "ai_search_influencers",
  "arguments": { "sentence": "Türkiye'den güzellik ve makyaj içerik üreticileri, 10 bin ile 100 bin takipçi, ölçülmüş etkileşim oranı olanlar" } }
```

The same call from a terminal:

```sh
export STARLECTA_AGENT_KEY=slk_YOUR_KEY
node live/agent-tools.mjs ai-search "Türkiye'den güzellik ve makyaj içerik üreticileri, 10 bin ile 100 bin takipçi, ölçülmüş etkileşim oranı olanlar"
```

Shape of the answer (**illustrative**). Per auth.md it holds a count (shown as `fewer than 10` below 10), at most two open cards, and the number of locked results. Per the server card, AI search cards also carry a match share and the niches that matched. It never lists tracked or locked identities.

```json
{
  "count": "50 or more",
  "cards": [
    { "handle": "synthetic_beauty_a", "status": "open", "tier": "micro", "category": "beauty", "match_share": 0.82, "niches": ["makeup", "skincare"] },
    { "handle": "synthetic_beauty_b", "status": "open", "tier": "micro", "category": "beauty", "match_share": 0.77, "niches": ["makeup"] }
  ],
  "locked": 48
}
```

Read it as: many creators match, two are shown, the rest are counted but not named. The two cards are the shortlist candidates. Do not try to widen the list by repeating the call with variations; the terms forbid building lists in bulk.

## 2. Look up each candidate

Tool: `lookup_influencer`, input: `handle` (with or without `@`).

```json
{ "name": "lookup_influencer", "arguments": { "handle": "synthetic_beauty_a" } }
```

```sh
node live/agent-tools.mjs lookup synthetic_beauty_a
```

A handle is `open`, `tracked` or `not_listed`:

- `open`: public follower count (rounded down, with its record date) and the measured engagement rate with its date and the number of posts and Reels counted.
- `tracked`: name, tier, category and a rounded follower band, no metric.
- `not_listed`: no match, or an account that cannot be shown.

Every other field is a locked placeholder. The Starlecta Quality Score (SQS) is not part of these tools for named creators. Illustrative shape:

```json
{
  "handle": "synthetic_beauty_a",
  "status": "open",
  "tier": "micro",
  "category": "beauty",
  "followers": { "value": 48000, "as_of": "2026-10-28" },
  "engagement_rate": { "value": 0.031, "as_of": "2026-10-28", "items_counted": 38 }
}
```

If the engagement rate is missing, treat it as not measured (the method needs at least 3 measurable posts or Reels in 90 days), not as zero.

## 3. Compare the two

Tool: `compare_influencers`, input: `a` and `b`.

```json
{ "name": "compare_influencers", "arguments": { "a": "synthetic_beauty_a", "b": "synthetic_beauty_b" } }
```

```sh
node live/agent-tools.mjs compare synthetic_beauty_a synthetic_beauty_b
```

The answer puts the two side by side on the same method and dates: followers, engagement rate and an engagement band. Illustrative shape:

```json
{
  "a": { "handle": "synthetic_beauty_a", "followers": 48000, "engagement_rate": 0.031 },
  "b": { "handle": "synthetic_beauty_b", "followers": 52000, "engagement_rate": 0.029 },
  "engagement_band": "similar",
  "as_of": "2026-10-28"
}
```

A band such as `similar` is not a verdict. If one side is `tracked` and the other `open`, or either has no measured rate, there is nothing to compare on engagement: say so in the note.

## 4. Write the shortlist note

Keep what the tools gave you, with its date, and leave out what they did not. A note built from the illustrative answers above would read:

```text
Shortlist: Turkish beauty creators, micro tier (Starlecta public tools, queried 2026-10-30)

1. @synthetic_beauty_a, about 48K followers (as of 2026-10-28), engagement rate 3.1% over 38 posts and Reels (as of 2026-10-28).
2. @synthetic_beauty_b, about 52K followers (as of 2026-10-28), engagement rate 2.9% (as of 2026-10-28).

Compared on the same method and dates, the engagement of the two is in the same band ("similar"). This is not a ranking.
Not known from these tools: quality score, audience, brands worked with.
The search matched many more creators than the two shown; the other matches are not named by the public tools.
Source: https://starlecta.com (public tools, agent key). Figures are dated as above.
```

Rules worth keeping in your own notes: quote a figure with its date; never turn `not measured` into 0; do not call a creator better; say what the tools cannot tell you. Metric definitions: [engagement rate](https://starlecta.com/en/methods/engagement), [SQS](https://starlecta.com/en/methods/sqs).

## A real answer: Trend Cloud (no key)

`trend_cloud` needs no key and returns aggregate counts for the last 7 days. This is a real excerpt (top 3 of each list, computed 2026-10-30T19:17:01Z, called with `node live/agent-tools.mjs trend-cloud`; the full answer has 30 hashtags and 20 each of products, platforms and brands):

```json
{
  "period": "last_7_days",
  "computed_at": "2026-10-30T19:17:01.331943Z",
  "hashtags": [
    { "tag": "#29ekimcumhuriyetbayramı", "posts": 2657 },
    { "tag": "#29ekim", "posts": 2126 },
    { "tag": "#cumhuriyetbayramı", "posts": 1673 }
  ],
  "products": [
    { "name": "Bodrum Mandalina Macunu", "brand": "81 ilden", "shares": 413 },
    { "name": "Retinal (%0,1) Shot Corrector Booster Krem 20 ML", "brand": "RESETIFY", "shares": 342 },
    { "name": "Dyson Clean+Wash Hygiene Islak Zemin", "brand": "Dyson", "shares": 237 }
  ],
  "platforms": [
    { "name": "Trendyol", "shares": 65625 },
    { "name": "Hepsiburada", "shares": 60511 },
    { "name": "YouTube", "shares": 5698 }
  ],
  "brands": [
    { "name": "RESETIFY", "shares": 472 },
    { "name": "81 ilden", "shares": 413 },
    { "name": "Dyson", "shares": 294 }
  ],
  "source": "https://starlecta.com/en/tools/trend-cloud"
}
```

Hashtag counts are posts; product, platform and brand counts are shares, as the field names say. Counts change daily; cite the `computed_at` date, and read the page at the `source` address for how it is built.

## When a call fails

- REST endpoints: `401` with `{"error":"invalid_key"}` means the key is missing, wrong or revoked; `429` with `Retry-After` means wait that many seconds; `404` means the tool is switched off.
- MCP: a missing or wrong key comes back as HTTP 200 with `isError: true` and a text block, not as 401. Check `isError`.
- `agent-tools.mjs` waits for `Retry-After` once, tries once more, and then stops with a non-zero exit code.
