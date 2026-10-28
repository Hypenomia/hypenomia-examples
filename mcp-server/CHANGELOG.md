# Changelog

## 0.1.0 (unreleased)

- Read-only MCP server: stdio and stateless Streamable HTTP (`POST /mcp`).
- The SQS quality score is no longer returned for named creators: `score`, `bands.score`, `margins.score_points` and `comparable.same_formula_version` are gone from tool output; creator cards carry `quality_score_locked: true`. Editions that still contain a score are read but never echoed.
- `get_creator_example` and `compare_creator_examples` accept the slug or the Instagram handle (case-insensitive, optional `@`). New envelope field `matches` (records returned by the call); `count` stays the file record count.
- Tools: `search_creator_examples`, `get_creator_example`, `compare_creator_examples`, `get_instagram_benchmark`.
- Reads the exporter's public schema (`latest.json`, `header`, followers object, per-metric dates, both pair directions). Honours `serve_until`, unlisted revisions and removals; refuses synthetic editions without `MCP_ALLOW_SYNTHETIC=1`. No default data source.
- `get_sector_brief` removed: the public schema has no per-sector data.
- Tests run on an edition.
- `get_weekly_highlights` and `get_content_examples` are not listed until their public payloads exist.
- Renamed to Starlecta: package `starlecta-mcp-server`, bin `starlecta-mcp`, server name `starlecta-open-examples`, links to starlecta.com. Editions that carry the previous domain's support address still load.
