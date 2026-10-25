// Stateless Streamable HTTP: POST /mcp only. One JSON-RPC message per request, JSON responses, no sessions, no SSE.
import http from "node:http";
import { fileURLToPath } from "node:url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SUPPORTED_PROTOCOL_VERSIONS } from "@modelcontextprotocol/sdk/types.js";
import { SnapshotStore } from "./snapshot.mjs";
import { createMcpServer, ALL_TOOLS, SERVER_VERSION } from "./server.mjs";
import { RateLimiter, hashIp, makeLogger, requestContext } from "./ops.mjs";

const rpcError = (code, message) => JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null });

export function configFromEnv(env = process.env) {
  const n = (k, d) => (env[k] ? Number(env[k]) : d);
  return {
    port: n("PORT", 8080),
    host: env.HOST ?? "127.0.0.1",
    source: env.MCP_DATA_SOURCE ?? null, // public-data root (directory or https URL); no default, so nothing synthetic is served by accident
    allowSynthetic: env.MCP_ALLOW_SYNTHETIC === "1", // development only; synthetic editions are refused otherwise
    refreshMs: n("MCP_REFRESH_MS", 600_000),
    maxStaleMs: n("MCP_MAX_STALE_MS", 24 * 3600_000),
    maxBodyBytes: n("MAX_BODY_BYTES", 16 * 1024),
    maxResponseBytes: n("MAX_RESPONSE_BYTES", 64 * 1024),
    perMin: n("RATE_PER_MIN", 30),
    perDay: n("RATE_PER_DAY", 1000),
    globalPerDay: n("RATE_GLOBAL_PER_DAY", 20000),
    timeoutMs: n("REQUEST_TIMEOUT_MS", 2000),
    allowedOrigins: (env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    clientIpHeader: env.CLIENT_IP_HEADER?.toLowerCase() || null, // e.g. cf-connecting-ip, only behind a trusted proxy
    tools: env.MCP_TOOLS ? env.MCP_TOOLS.split(",").map((s) => s.trim()) : ALL_TOOLS,
  };
}

export function createHttpServer(cfg, store, log = makeLogger()) {
  const limiter = new RateLimiter({ perMin: cfg.perMin, perDay: cfg.perDay, globalPerDay: cfg.globalPerDay });

  async function readBody(req) {
    const declared = Number(req.headers["content-length"] ?? 0);
    if (declared > cfg.maxBodyBytes) return { tooLarge: true };
    const chunks = []; let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > cfg.maxBodyBytes) return { tooLarge: true };
      chunks.push(c);
    }
    return { text: Buffer.concat(chunks).toString("utf8") };
  }

  return http.createServer(async (req, res) => {
    const started = process.hrtime.bigint();
    const ctx = { outcome: "ok" };
    const ip = (cfg.clientIpHeader && String(req.headers[cfg.clientIpHeader] ?? "").split(",")[0].trim()) || req.socket.remoteAddress;
    let bytes = 0;
    const origWrite = res.write.bind(res), origEnd = res.end.bind(res);
    res.write = (c, ...a) => { bytes += Buffer.byteLength(c); return origWrite(c, ...a); };
    res.end = (c, ...a) => { if (c && typeof c !== "function") bytes += Buffer.byteLength(c); return origEnd(c, ...a); };
    res.on("close", () => {
      const e = {
        method: ctx.rpc ?? req.method, http_method: req.method, path: req.url?.split("?")[0], status: res.statusCode,
        tool: ctx.tool ?? null, args: ctx.args ?? null, outcome: ctx.outcome, snapshot_id: ctx.snapshot_id ?? store.get()?.manifest.snapshot_id ?? null,
        latency_ms: Number((process.hrtime.bigint() - started) / 1000n) / 1000, bytes, ip_hash: hashIp(ip),
        client: ctx.client ?? null, protocol_version: ctx.protocol ?? req.headers["mcp-protocol-version"] ?? null,
      };
      log(e);
    });
    const send = (status, body, headers = {}, outcome) => {
      if (outcome) ctx.outcome = outcome;
      if (res.headersSent) return;
      res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", ...headers });
      res.end(body);
    };

    try {
      const path = req.url?.split("?")[0];
      if (path === "/healthz") return send(200, '{"status":"ok"}');
      if (path === "/readyz") return store.get() ? send(200, '{"status":"ready"}') : send(503, '{"status":"no_snapshot"}');
      if (path !== "/mcp") return send(404, rpcError(-32601, "Not found"), {}, "invalid");
      if (req.method !== "POST") return send(405, rpcError(-32000, "Method not allowed"), { allow: "POST" }, "invalid");

      const origin = req.headers.origin;
      if (origin !== undefined && !cfg.allowedOrigins.includes(origin)) return send(403, rpcError(-32000, "Origin not allowed"), {}, "invalid");
      const pv = req.headers["mcp-protocol-version"];
      if (pv !== undefined && !SUPPORTED_PROTOCOL_VERSIONS.includes(pv)) return send(400, rpcError(-32000, "Unsupported MCP-Protocol-Version"), {}, "invalid");
      if (!String(req.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) return send(415, rpcError(-32000, "Content-Type must be application/json"), {}, "invalid");
      const accept = String(req.headers.accept ?? "");
      if (!/application\/json|\*\/\*/.test(accept)) return send(406, rpcError(-32000, "Accept must include application/json"), {}, "invalid");

      const b = await readBody(req);
      if (b.tooLarge) { res.setHeader("connection", "close"); return send(413, rpcError(-32000, "Request body too large"), {}, "invalid"); }
      let msg;
      try { msg = JSON.parse(b.text); } catch { return send(400, rpcError(-32700, "Parse error"), {}, "invalid"); }
      if (Array.isArray(msg)) return send(400, rpcError(-32600, "Batch requests are not supported"), {}, "invalid");
      if (!msg || typeof msg !== "object" || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return send(400, rpcError(-32600, "Invalid request"), {}, "invalid");
      ctx.rpc = msg.method;
      if (msg.method === "initialize") { ctx.client = msg.params?.clientInfo ? { name: String(msg.params.clientInfo.name).slice(0, 64), version: String(msg.params.clientInfo.version).slice(0, 32) } : null; ctx.protocol = msg.params?.protocolVersion ?? null; }
      if (msg.method === "tools/call") {
        const l = limiter.hit(ip ?? "unknown");
        if (!l.ok) return send(l.status, JSON.stringify({ jsonrpc: "2.0", id: msg.id ?? null, error: { code: -32000, message: l.status === 429 ? "Rate limit exceeded" : "Service busy" } }), { "retry-after": String(l.retryAfter) }, "rate_limited");
      }

      req.headers.accept = "application/json, text/event-stream"; // the SDK transport requires both
      const server = createMcpServer(store, { tools: cfg.tools, maxResponseBytes: cfg.maxResponseBytes });
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      const timer = setTimeout(() => send(504, rpcError(-32000, "Request timeout"), {}, "error"), cfg.timeoutMs);
      res.on("close", () => { clearTimeout(timer); transport.close().catch(() => {}); server.close().catch(() => {}); });
      await server.connect(transport);
      await requestContext.run(ctx, () => transport.handleRequest(req, res, msg));
      if (res.statusCode === 400 || res.statusCode === 406) ctx.outcome = "invalid";
    } catch {
      send(500, rpcError(-32603, "Internal error"), {}, "error");
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cfg = configFromEnv();
  const log = makeLogger();
  if (!cfg.source) { log({ event: "fatal", reason: "MCP_DATA_SOURCE is not set" }); process.exit(1); }
  const store = new SnapshotStore(cfg.source, { maxStaleMs: cfg.maxStaleMs, onEvent: log, allowSynthetic: cfg.allowSynthetic });
  await store.refresh();
  store.start(cfg.refreshMs);
  const server = createHttpServer(cfg, store, log);
  server.requestTimeout = 10_000;
  server.headersTimeout = 5_000;
  server.listen(cfg.port, cfg.host, () => log({ event: "listening", host: cfg.host, port: cfg.port, version: SERVER_VERSION }));
}
