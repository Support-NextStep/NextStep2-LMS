import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

export const BASE = "http://localhost:3000";

// ---------------------------------------------------------------------------
// Minimal manual cookie-jar HTTP client — native fetch has no automatic
// cookie jar, and this backend's auth is httpOnly-cookie based (see
// auth.controller.ts). One instance = one "virtual student" session.
// ---------------------------------------------------------------------------
export class Session {
  constructor() {
    this.cookies = {};
  }
  _absorb(res) {
    const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const c of raw) {
      const [pair] = c.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) this.cookies[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
    }
  }
  _cookieHeader() {
    return Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join("; ");
  }
  async request(method, path, body, timings) {
    const start = performance.now();
    let status = 0;
    let ok = false;
    let json = null;
    try {
      const res = await fetch(`${BASE}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(this._cookieHeader() ? { Cookie: this._cookieHeader() } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      this._absorb(res);
      status = res.status;
      ok = res.ok;
      const text = await res.text();
      json = text ? JSON.parse(text) : null;
    } catch (err) {
      status = 0; // network-level failure (ECONNREFUSED, aborted, etc.)
      json = { error: String(err && err.message ? err.message : err) };
    }
    const latencyMs = performance.now() - start;
    if (timings) timings.push({ method, path: normalizePath(path), status, ok, latencyMs, at: Date.now() });
    return { status, ok, json };
  }
  get(path, timings) { return this.request("GET", path, undefined, timings); }
  post(path, body, timings) { return this.request("POST", path, body ?? {}, timings); }
}

/** Collapses path params so /sessions/stack-implementation/... and /sessions/queue-implementation/... aggregate under one bucket for reporting. */
function normalizePath(path) {
  return path
    .replace(/\/sessions\/[^/]+/, "/sessions/:id")
    .replace(/\/subjects\/[^/]+/, "/subjects/:id")
    .replace(/\/courses\/[^/]+/, "/courses/:id")
    .replace(/submissions\/[a-f0-9-]{20,}/, "submissions/:id")
    .replace(/\?.*/, "");
}

export function percentile(sortedArr, p) {
  if (sortedArr.length === 0) return 0;
  const idx = Math.min(sortedArr.length - 1, Math.floor((p / 100) * sortedArr.length));
  return sortedArr[idx];
}

export function summarize(timings) {
  const latencies = timings.map((t) => t.latencyMs).sort((a, b) => a - b);
  const success = timings.filter((t) => t.ok).length;
  const errors4xx = timings.filter((t) => t.status >= 400 && t.status < 500).length;
  const errors5xx = timings.filter((t) => t.status >= 500 || t.status === 0).length;
  return {
    total: timings.length,
    success,
    errors: timings.length - success,
    errors4xx,
    errors5xx,
    p50: Math.round(percentile(latencies, 50)),
    p95: Math.round(percentile(latencies, 95)),
    p99: Math.round(percentile(latencies, 99)),
    max: latencies.length ? Math.round(latencies[latencies.length - 1]) : 0,
  };
}

export function summarizeByEndpoint(timings) {
  const groups = {};
  for (const t of timings) {
    const key = `${t.method} ${t.path}`;
    (groups[key] ??= []).push(t);
  }
  const out = {};
  for (const [key, arr] of Object.entries(groups)) out[key] = summarize(arr);
  return out;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function jitter(baseMs, spreadMs) {
  return baseMs + Math.random() * spreadMs;
}

/** Samples PostgreSQL's own view of active connections via a dedicated tiny client — separate from the app's own pool. */
export async function samplePgConnections() {
  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    const rows = await prisma.$queryRaw`
      SELECT count(*) FILTER (WHERE state = 'active') AS active,
             count(*) FILTER (WHERE state = 'idle') AS idle,
             count(*) AS total
      FROM pg_stat_activity
      WHERE datname = current_database()
    `;
    return { active: Number(rows[0].active), idle: Number(rows[0].idle), total: Number(rows[0].total) };
  } finally {
    await prisma.$disconnect();
  }
}

/** Same aggregation as EvaluationService.getQueueStats() (not exposed over HTTP — "observability only", see its own doc comment) — queried directly here the same way an external monitor would, rather than adding a new endpoint just for this load test. */
export async function sampleQueueStats() {
  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    const rows = await prisma.exerciseEvaluation.groupBy({ by: ["status"], _count: { _all: true } });
    const stats = { PENDING: 0, EVALUATING: 0, EVALUATED: 0, FAILED: 0 };
    for (const row of rows) stats[row.status] = row._count._all;
    return stats;
  } finally {
    await prisma.$disconnect();
  }
}

/** Backend Node process RSS/CPU via Windows wmic — best-effort, never throws. */
export function sampleProcess(pid) {
  try {
    const out = execSync(
      `wmic process where ProcessId=${pid} get WorkingSetSize,UserModeTime,KernelModeTime /format:csv`,
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    );
    const lines = out.trim().split("\n").filter(Boolean);
    const last = lines[lines.length - 1].split(",");
    // CSV columns: Node,KernelModeTime,UserModeTime,WorkingSetSize
    const workingSetBytes = Number(last[last.length - 1]);
    return { rssMb: Math.round(workingSetBytes / 1024 / 1024) };
  } catch {
    return { rssMb: null };
  }
}

export function findBackendPid() {
  try {
    const out = execSync(`netstat -ano | grep "LISTENING" | grep ":3000 "`, { encoding: "utf8", shell: "C:\\Program Files\\Git\\bin\\bash.exe" });
    const line = out.trim().split("\n")[0];
    const pid = line.trim().split(/\s+/).pop();
    return Number(pid);
  } catch {
    return null;
  }
}
