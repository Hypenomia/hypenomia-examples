#!/usr/bin/env node
// Local stdio transport: the same server, one process per client. Logs go to stderr only (stdout is the protocol).
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SnapshotStore } from "./snapshot.mjs";
import { createMcpServer, ALL_TOOLS } from "./server.mjs";
import { makeLogger } from "./ops.mjs";

const source = process.env.MCP_DATA_SOURCE;
const log = makeLogger();
if (!source) { log({ event: "fatal", reason: "MCP_DATA_SOURCE is not set" }); process.exit(1); }
const store = new SnapshotStore(source, { onEvent: log, allowSynthetic: process.env.MCP_ALLOW_SYNTHETIC === "1" });
await store.refresh();
const tools = process.env.MCP_TOOLS ? process.env.MCP_TOOLS.split(",").map((s) => s.trim()) : ALL_TOOLS;
const server = createMcpServer(store, { tools });
await server.connect(new StdioServerTransport());
if (process.env.MCP_LOG === "1") log({ event: "stdio_ready", snapshot_id: store.get()?.manifest.snapshot_id });
