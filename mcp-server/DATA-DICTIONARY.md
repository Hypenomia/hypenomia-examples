# Data dictionary: edition files and tool results

Source of truth: the exporter's public schema (`api/schemas/public_snapshot.py`, generated JSON Schemas in `public-data/schema/`). The server reads `latest.json`, `manifest.json`, `creators.json`, `pairs.json` and `benchmark.json`; the weekly, content and insights files are never read. Test data is synthetic.

## Header (every edition file) and tool envelope

Each edition file starts with a `header`; every tool result repeats it as a flat envelope.

| Field | Meaning |
|---|---|
| `schema_version` | `px11-public-edition-v1` |
| `snapshot_id`, `edition` | `YYYY-MM-DD.rN` and `YYYY-MM-DD` |
| `data_as_of` | `{oldest, newest}` dates of the measurements behind the file (either may be null) |
| `period` | `{start, end, end_exclusive, tz}` or `null` (these files have none today) |
| `method_version` | label of the method behind the file |
| `count` | records in the file (not the number of matches) |
| `matches` | result records this call returned: search 0 to 3 (capped, never a total beyond the cap), get and compare 1 if found else 0, benchmark 1 if the cell exists else 0 |
| `source_url`, `method_url` | where the file and the method live |
| `missing_reason` | `null`, or why data is missing. Never read a missing value as zero |
| `lang` | tool results only: `en` or `tr` (affects the sample page link) |
| `data` | tool results only: the tool payload |

Tool-level `missing_reason` values: `not_in_open_pool`, `few_open_samples`, `below_min_sample`, `no_such_cell`, `pair_not_published`, `in_preparation`, plus the creator's own reason (for example `not_measured`).

## Edition files

| File | Content |
|---|---|
| `latest.json` | the served `edition` and `revision`, and `retained[]` (edition, revision, manifest sha256). Only a listed (edition, revision) is served |
| `manifest.json` | `edition`, `revision`, `serve_until` (last day served), `synthetic`, `enums` (`category`, `tier` of the pool), `samples[]`, `pool_size`, `files[{name, sha256, bytes, count, status}]`, `removal_contact` |
| `creators.json` | `creators[]`: the open pool |
| `pairs.json` | `margins` and `pairs[]`: every ordered pair (slug_a, slug_b), both directions |
| `benchmark.json` | `method` (window, min_sample, tiers), `totals`, `cells[]` of tier x category |

## Creator

| Field | Meaning |
|---|---|
| `slug`, `handle`, `display_name`, `platform` | identity; `slug` matches `^[a-z0-9]+(-[a-z0-9]+)*$`, at most 64 characters |
| `category`, `category_label`, `tier`, `tier_label` | category and follower tier (`micro` 10K-100K, `macro` 100K-1M, `mega` 1M+ in the pool) |
| `followers` | `{rounded, unit, as_of, missing_reason}`. `rounded` is rounded down to `unit` (1K below 100K, 10K below 1M, 100K above). Exact counts are never published |
| `engagement` | `{state, rate, unit, window_days, items_90d, as_of, stale, missing_reason}`. `state` is `measured` or `not_measured`; `rate` is percent ((likes + comments) / followers x 100, weighted median); a measured 0 is 0, a missing value is `null` |
| `quality_score_locked` | always `true`. The SQS quality score is not public for named creators and is never returned, even if an older edition file still carries a `score` block (it is read for validation only). It is available in the customer panel |
| `turkey_basis`, `pool_reason` | evidence for the Turkey basis, and the template inputs for why the account is in the pool (the wording lives on the site) |
| `url` | sample page on hypenomia.com for the requested `lang` |

Rejected at load if they appear: internal ids, exact followers, follower history, bio, contact data, captions, media URLs, audience data.

## Search result

`data = {filter:{category,tier}, open_pool_size, order, results[<=3]}`. `order` is `followers_rounded_desc_then_slug` (missing followers last). No paging, cursor, offset or random order exists.

## Pair / compare result

| Field | Meaning |
|---|---|
| `a`, `b` | the two creators in the requested order |
| `bands.engagement` | `{band, reason}` read "a against b"; `band` is `higher`, `lower`, `similar` or `not_comparable` |
| `comparable` | `{same_tier, same_formula_version, er_dates_gap_days, er_dates_within_limit}` or `null` |
| `margins` | `engagement_relative`, `engagement_dates_days` (`score_points` is not returned) |
| `notes` | e.g. `different_size_groups`, `engagement_dates_far_apart` |

There is no winner field. The pair is looked up for exactly (`slug_a`, `slug_b`); the reverse order is its own published record.

## Benchmark cell

| Field | Meaning |
|---|---|
| `cell.tier`, `cell.category` | `all` or a key; `tier_label`, `category_label` |
| `cell.cohort`, `cell.n` | accounts in the tracked set for the cell; accounts with a usable engagement rate |
| `cell.excluded` | counts excluded by reason |
| `cell.suppressed` | as published; `p25`/`p50`/`p75` are then `null` |
| `window_days`, `min_sample`, `stale_after_days`, `universe`, `computed_at` | from the file |
