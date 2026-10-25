// Logging (no raw IPs) and in-process limits. Cloudflare is the primary limiter in production.
import { createHash, randomBytes } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import net from "node:net";

export const requestContext = new AsyncLocalStorage();

const SALT = randomBytes(16).toString("hex"); // per process; combined with the UTC day below

// /24 for IPv4, /64 for IPv6, then a salted hash that changes daily. The raw address never reaches a log line.
export function hashIp(ip, day = new Date().toISOString().slice(0, 10)) {
  let prefix = "unknown";
  const v4 = ip?.replace(/^::ffff:/, "");
  if (v4 && net.isIPv4(v4)) prefix = v4.split(".").slice(0, 3).join(".");
  else if (ip && net.isIPv6(ip)) prefix = ip.split(":").slice(0, 4).join(":");
  return createHash("sha256").update(`${SALT}|${day}|${prefix}`).digest("hex").slice(0, 16);
}

export function makeLogger(write = (line) => process.stderr.write(line + "\n")) {
  return (entry) => write(JSON.stringify({ ts: new Date().toISOString(), ...entry }));
}

export class RateLimiter {
  constructor({ perMin = 30, perDay = 1000, globalPerDay = 20000, now = () => Date.now(), maxKeys = 50000 } = {}) {
    Object.assign(this, { perMin, perDay, globalPerDay, now, maxKeys });
    this.keys = new Map();
    this.global = { day: "", n: 0 };
  }
  // Returns { ok:true } or { ok:false, status, retryAfter, scope }.
  hit(key) {
    const t = this.now();
    const day = new Date(t).toISOString().slice(0, 10);
    if (this.global.day !== day) { this.global = { day, n: 0 }; this.keys.clear(); }
    const secsToMidnight = Math.max(1, Math.ceil((Date.parse(day) + 86400_000 - t) / 1000));
    if (this.global.n >= this.globalPerDay) return { ok: false, status: 503, retryAfter: secsToMidnight, scope: "global" };
    let e = this.keys.get(key);
    if (!e) {
      if (this.keys.size >= this.maxKeys) this.keys.clear();
      e = { min: Math.floor(t / 60000), nMin: 0, nDay: 0 };
      this.keys.set(key, e);
    }
    const minute = Math.floor(t / 60000);
    if (e.min !== minute) { e.min = minute; e.nMin = 0; }
    if (e.nDay >= this.perDay) return { ok: false, status: 429, retryAfter: secsToMidnight, scope: "ip_day" };
    if (e.nMin >= this.perMin) return { ok: false, status: 429, retryAfter: Math.max(1, 60 - Math.floor((t % 60000) / 1000)), scope: "ip_min" };
    e.nMin++; e.nDay++; this.global.n++;
    return { ok: true };
  }
}
