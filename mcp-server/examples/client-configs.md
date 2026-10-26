# Client configuration (local stdio)

Replace `/path/to` with the folder that holds `mcp-server`. Run `npm ci` there once. `MCP_DATA_SOURCE` must point at a public-data root (directory or https URL); there is no default. For a synthetic development edition also set `MCP_ALLOW_SYNTHETIC=1`.

Claude Code:

```sh
claude mcp add hypenomia-examples -e MCP_DATA_SOURCE=/path/to/public-data -- node /path/to/mcp-server/src/stdio.mjs
```

Claude Desktop / any client with a JSON config:

```json
{
  "mcpServers": {
    "hypenomia-examples": {
      "command": "node",
      "args": ["/path/to/mcp-server/src/stdio.mjs"],
      "env": { "MCP_DATA_SOURCE": "/path/to/public-data" }
    }
  }
}
```

Local HTTP (stateless Streamable HTTP):

```sh
MCP_DATA_SOURCE=/path/to/public-data npm start   # listens on 127.0.0.1:8080
claude mcp add --transport http hypenomia-local http://127.0.0.1:8080/mcp
```

MCP Inspector (CLI):

```sh
npx @modelcontextprotocol/inspector@2.10.1 --cli node src/stdio.mjs -e MCP_DATA_SOURCE=/path/to/public-data --method tools/list
```
