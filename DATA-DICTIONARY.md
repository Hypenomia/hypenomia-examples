# Data dictionary

Every field in `fixtures/`. A test checks this table against the fixtures in both directions.

Paths: `benchmark.` = `fixtures/benchmark-instagram-engagement.json`; `compare.` = `fixtures/compare-*.json`; `summary.` = the `a` and `b` objects inside a comparison; `brief.` = `fixtures/brief-input.json`. `[]` is any list item, `*` any key of a map. Every file also carries `_synthetic` (it is invented data), and `_source` or `_format`.

Definitions of the scores and rates: [SQS](https://hypenomia.com/en/methods/sqs), [engagement rate](https://hypenomia.com/en/methods/engagement), [Story estimate](https://hypenomia.com/en/methods/story-estimate).

## Benchmark: engagement rate by follower tier and category

Aggregates only; no account appears in this file.

| Path | Type | Meaning |
|---|---|---|
| `benchmark.platform` | string | `instagram` |
| `benchmark.universe` | string | `tracked_set`: the accounts Hypenomia tracks, not every creator in a country |
| `benchmark.network_scope` | string | networks enabled when the aggregate was built |
| `benchmark.computed_at` | ISO datetime, UTC | when the aggregate was built |
| `benchmark.data_as_of` | object | date range of the stored rates that were included |
| `benchmark.data_as_of.oldest` | ISO date or null | oldest included rate date |
| `benchmark.data_as_of.newest` | ISO date or null | newest included rate date |
| `benchmark.method` | object | how the numbers are made |
| `benchmark.method.version` | string | benchmark method version |
| `benchmark.method.metric` | string | `engagement_rate` |
| `benchmark.method.unit` | string | `percent` |
| `benchmark.method.formula` | string | the rate formula in words |
| `benchmark.method.window_days` | integer | look-back window of the rate (90) |
| `benchmark.method.er_methodology_versions` | map | rate method version → number of included accounts |
| `benchmark.method.er_methodology_versions.*` | integer | accounts on that version |
| `benchmark.method.min_sample` | integer | below this many accounts a cell shows no values |
| `benchmark.method.stale_after_days` | integer | a rate older than this, against the newest one, is excluded as `stale` |
| `benchmark.method.percentiles` | list of integers | the percentiles given per cell (25, 50, 75) |
| `benchmark.method.tiers` | list | follower tiers |
| `benchmark.method.tiers[].key` | string | `nano`, `micro`, `macro`, `mega` |
| `benchmark.method.tiers[].label` | string | label with the follower range |
| `benchmark.method.tiers[].min_followers` | integer | lower bound, inclusive |
| `benchmark.method.tiers[].max_followers` | integer or null | upper bound, exclusive; null = no upper bound |
| `benchmark.totals` | object | universe accounting |
| `benchmark.totals.active_accounts` | integer | active tracked accounts read |
| `benchmark.totals.without_follower_count` | integer | left out: no follower count, so no tier |
| `benchmark.totals.uncategorised` | integer | accounts without a category; they count only under `category = all` |
| `benchmark.cells` | list | one cell per tier × category, including `all` |
| `benchmark.cells[].tier` | string | tier key or `all` |
| `benchmark.cells[].category` | string | category slug or `all` |
| `benchmark.cells[].category_label` | string | category label |
| `benchmark.cells[].cohort` | integer | accounts in the cell |
| `benchmark.cells[].n` | integer | accounts in the cell with a usable rate |
| `benchmark.cells[].excluded` | map | reason → accounts left out of `n`; reasons: `no_recent_content`, `low_sample`, `no_usable_counts`, `not_measured`, `stale`, `no_snapshot` |
| `benchmark.cells[].excluded.*` | integer | accounts left out for that reason |
| `benchmark.cells[].suppressed` | boolean | true when `n` is below `min_sample`; the values are then null |
| `benchmark.cells[].p25` | number or null | 25th percentile of the rate, percent |
| `benchmark.cells[].p50` | number or null | median rate, percent |
| `benchmark.cells[].p75` | number or null | 75th percentile, percent |

## Comparison of two accounts

| Path | Type | Meaning |
|---|---|---|
| `compare.method_version` | string | comparison method version |
| `compare.platform` | string | `instagram` |
| `compare.margins` | object | what counts as "similar" |
| `compare.margins.score_points` | integer | scores within this many points are `similar` |
| `compare.margins.engagement_relative` | number | rates within this share of the higher rate are `similar` |
| `compare.margins.engagement_dates_days` | integer | rate dates further apart than this are flagged |
| `compare.a` | object | account summary of the first account |
| `compare.b` | object | account summary of the second account |
| `compare.comparable` | object or null | null when an account is not tracked |
| `compare.comparable.same_tier` | boolean | both in the same follower tier |
| `compare.comparable.same_formula_version` | boolean | both scores from the same SQS formula version |
| `compare.comparable.er_dates_gap_days` | integer or null | days between the two rate dates |
| `compare.comparable.er_dates_within_limit` | boolean | gap within `margins.engagement_dates_days` |
| `compare.bands` | object | how `a` stands against `b`, per metric; never a winner |
| `compare.bands.score` | object | score band |
| `compare.bands.score.band` | string | `higher`, `similar`, `lower` or `not_comparable` |
| `compare.bands.score.reason` | string or null | why not comparable: `not_tracked`, `score_missing`, `different_formula_versions` |
| `compare.bands.engagement` | object | rate band |
| `compare.bands.engagement.band` | string | `higher`, `similar`, `lower` or `not_comparable` |
| `compare.bands.engagement.reason` | string or null | why not comparable: `not_tracked`, `rate_missing` |
| `compare.notes` | list of strings | `different_size_groups`, `engagement_dates_far_apart`, `a_not_tracked`, `b_not_tracked` |
| `compare.limits` | map | fixed limit sentences, keyed by code |
| `compare.limits.quality_not_guarantee` | string | the score is no sales or reach guarantee |
| `compare.limits.no_audience_overlap` | string | audience overlap is not measured |

## Account summary (`a`, `b`)

| Path | Type | Meaning |
|---|---|---|
| `summary.method_version` | string | summary method version |
| `summary.platform` | string | `instagram` |
| `summary.handle` | string | the handle asked for; in these fixtures an invented, hyphenated name |
| `summary.found` | boolean | false = not in the tracked set; nothing is looked up live |
| `summary.message` | string | only when `found` is false |
| `summary.followers` | integer or null | stored follower count |
| `summary.tier` | string or null | follower tier key |
| `summary.tier_label` | string or null | tier label |
| `summary.category` | string or null | category slug |
| `summary.category_label` | string or null | category label |
| `summary.score` | object | stored SQS; never recomputed |
| `summary.score.state` | string | `scored`, `pending` (not calculated yet) or `insufficient_coverage` |
| `summary.score.display` | integer or null | score 0–100; null is not zero |
| `summary.score.coverage` | number or null | share of the score weight that was measured (0–1) |
| `summary.score.confidence` | string or null | `high`, `medium`, `low` |
| `summary.score.calculated_at` | ISO datetime or null | when the score was calculated |
| `summary.score.formula_version` | string or null | SQS formula version |
| `summary.score.reason` | string or null | why there is no score |
| `summary.engagement` | object | stored engagement rate |
| `summary.engagement.state` | string | `measured` or `not_measured` |
| `summary.engagement.rate` | number or null | percent; null is not zero |
| `summary.engagement.items_90d` | integer or null | posts and Reels in the 90-day window |
| `summary.engagement.window_days` | integer | 90 |
| `summary.engagement.reason` | string or null | why the rate is missing |
| `summary.engagement.note` | string or null | caveat on a measured rate |
| `summary.engagement.as_of` | ISO date or null | date of the stored rate |
| `summary.engagement.stale` | boolean | rate older than 7 days |
| `summary.limits` | map | same as `compare.limits` |
| `summary.limits.quality_not_guarantee` | string | as above |
| `summary.limits.no_audience_overlap` | string | as above |

## Brief input (example format, not the Hypenomia API)

| Path | Type | Meaning |
|---|---|---|
| `brief.platform` | string | `instagram` |
| `brief.period` | object | the period of the brief |
| `brief.period.start` | ISO date | first day |
| `brief.period.end` | ISO date | last day |
| `brief.period.days` | integer | length in days |
| `brief.subject` | string | the brand the brief is written for; must be one of `brands[].label` |
| `brief.brands` | list | one entry per brand, anonymised labels |
| `brief.brands[].label` | string | anonymised brand label |
| `brief.brands[].verified_posts` | integer | posts with link and tag evidence |
| `brief.brands[].left_out_posts` | integer | possible posts left out for lack of evidence |
| `brief.brands[].creators` | integer | creator accounts with at least one verified post |
| `brief.brands[].returning_creators` | integer | of those, accounts that also had a verified post in the 12 weeks before the period |
| `brief.brands[].formats` | object | verified posts by format; must add up to `verified_posts` |
| `brief.brands[].formats.reel` | integer | Reels |
| `brief.brands[].formats.feed` | integer | feed posts |
| `brief.brands[].formats.story` | integer | Stories |
| `brief.brands[].reel_plays_measured` | integer | gross Reel plays reported by the platform; not unique reach |
| `brief.brands[].story_views_estimated` | object or null | modelled Story views; null when no estimate exists |
| `brief.brands[].story_views_estimated.mid` | integer | estimate |
| `brief.brands[].story_views_estimated.low` | integer | low scenario |
| `brief.brands[].story_views_estimated.high` | integer | high scenario |
| `brief.shared_creators` | list | brand pairs |
| `brief.shared_creators[].a` | string | brand label |
| `brief.shared_creators[].b` | string | brand label |
| `brief.shared_creators[].creators` | integer | creator accounts with verified posts for both; not shared audience |
