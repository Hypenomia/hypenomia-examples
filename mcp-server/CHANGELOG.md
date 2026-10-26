# Changelog

## 0.1.0 (unreleased)

- Read-only MCP server: stdio and stateless Streamable HTTP (`POST /mcp`).
- `get_creator_example` and `compare_creator_examples` accept the slug or the Instagram handle (case-insensitive, optional `@`). New envelope field `matches` (records returned by the call); `count` stays the file record count.
- Tools: `search_creator_examples`, `get_creator_example`, `compare_creator_examples`, `get_instagram_benchmark`.
- Reads the exporter's public schema (`latest.json`, `header`, followers object, per-metric dates, both pair directions). Honours `serve_until`, unlisted revisions and removals; refuses synthetic editions without `MCP_ALLOW_SYNTHETIC=1`. No default data source.
- `get_sector_brief` removed: the public schema has no per-sector data.
- Tests run on an edition.
- `get_weekly_highlights` and `get_content_examples` are not listed until their public payloads exist.
