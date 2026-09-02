#!/usr/bin/env node
/**
 * tools/perf/outer/live-api-baseline.mjs — LANE BASE-OUTER (2026-09-02)
 *
 * Axis C (project creation, API leg) + axis D (snapshot fetch leg) measured
 * against a PRODUCTION target over the real network, as an ANONYMOUS session
 * on the legacy /api/projects routes (the only routes production serves an
 * unauthenticated caller — /api/v1/* returns 401; see findings doc).
 *
 * Measures, N runs each (median + p95):
 *   create        POST /api/projects                       — real Supabase INSERT
 *   save          POST /api/projects/:id/versions          — 300-wall snapshot (~100 KB)
 *   fetchLatest   GET  /api/projects/:id/latest-version    — the editor's D-axis snapshot fetch
 *   list          GET  /api/projects                       — hub project list
 * Every project this script creates is DELETEd at the end and the deletion is
 * verified; a failed cleanup exits non-zero.
 *
 * Falsification (run with PERF_FALSIFY=1): points fetchLatest at a BOGUS
 * project id and asserts the harness REPORTS FAILURE (404) instead of
 * recording a fast number. A harness that cannot fail is not a harness.
 *
 * Reproduce:
 *   node tools/perf/outer/live-api-baseline.mjs                  # default N=10, https://pryzm.fly.dev
 *   PERF_BASE=http://localhost:5000 node tools/perf/outer/live-api-baseline.mjs
 *   PERF_FALSIFY=1 node tools/perf/outer/live-api-baseline.mjs
 */
import { buildSeedSnapshot } from './seedSnapshot.mjs';

const BASE = process.env.PERF_BASE ?? 'https://pryzm.fly.dev';
const N = parseInt(process.env.PERF_N ?? '10', 10);
const TOKEN = process.env.PERF_TOKEN ?? null; // optional Bearer for authed targets
const HDRS = { 'Content-Type': 'application/json', ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) };

const stats = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)];
  return { n: s.length, min: +s[0].toFixed(1), median: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), max: +s[s.length - 1].toFixed(1) };
};
async function timed(fn) {
  const t0 = performance.now();
  const r = await fn();
  return { ms: performance.now() - t0, r };
}

if (process.env.PERF_FALSIFY === '1') {
  // ── Falsification arm: a bogus id must FAIL, not produce a number ──────────
  const bogus = 'proj-1000000000000-bogusbogus1';
  const { ms, r } = await timed(() => fetch(`${BASE}/api/projects/${bogus}/latest-version`, { headers: HDRS }));
  if (r.status === 200) {
    // Production currently DOES return 200 {version:null} for a bogus id (finding
    // F3 in audit/perf/2026-09-02/findings-outer.md) — this arm exits non-zero so
    // the lie can never be recorded as a baseline number.
    console.error(`FALSIFICATION FAILED: bogus project id returned 200 in ${ms.toFixed(1)}ms — harness would have recorded a lie.`);
    process.exitCode = 1;
  } else {
    console.log(`FALSIFICATION OK: bogus id → HTTP ${r.status} (no timing recorded). Harness fails when its subject is broken.`);
  }
  // Drain undici keepalive sockets before exiting — a hard process.exit() here
  // trips a libuv assert on Windows (observed: src\win\async.c:76 → RC 127).
  await new Promise((res) => setTimeout(res, 200));
  process.exit(process.exitCode ?? 0);
}

const created = [];
const t = { create: [], save: [], fetchLatest: [], list: [] };
const snapshot = buildSeedSnapshot(75); // 300 walls
const savePayload = JSON.stringify({ label: 'perf-api-bench', snapshot, elementCount: 300 });
console.log(`target=${BASE} N=${N} snapshotBytes=${Buffer.byteLength(savePayload)}`);

// warm-up request (TLS/keepalive) — not recorded
await fetch(`${BASE}/api/projects`, { headers: HDRS });

for (let i = 0; i < N; i++) {
  const c = await timed(() => fetch(`${BASE}/api/projects`, { method: 'POST', headers: HDRS, body: JSON.stringify({ name: `perf-api-bench-${Date.now()}-${i}` }) }));
  if (c.r.status !== 201) { console.error(`create[${i}] HTTP ${c.r.status} — aborting`); break; }
  const proj = (await c.r.json()).project;
  created.push(proj.id);
  t.create.push(c.ms);

  const s = await timed(() => fetch(`${BASE}/api/projects/${proj.id}/versions`, { method: 'POST', headers: HDRS, body: savePayload }));
  if (s.r.status !== 201) { console.error(`save[${i}] HTTP ${s.r.status}`); await s.r.text(); }
  else t.save.push(s.ms);

  const f = await timed(async () => { const r = await fetch(`${BASE}/api/projects/${proj.id}/latest-version`, { headers: HDRS }); await r.text(); return r; });
  if (f.r.status !== 200) console.error(`fetchLatest[${i}] HTTP ${f.r.status}`);
  else t.fetchLatest.push(f.ms);

  const l = await timed(async () => { const r = await fetch(`${BASE}/api/projects`, { headers: HDRS }); await r.text(); return r; });
  if (l.r.status === 200) t.list.push(l.ms);
}

// ── Cleanup: delete everything we created, verify ────────────────────────────
let cleanupFailed = false;
for (const id of created) {
  const r = await fetch(`${BASE}/api/projects/${id}`, { method: 'DELETE', headers: HDRS });
  if (r.status !== 200) { console.error(`cleanup DELETE ${id} → HTTP ${r.status}`); cleanupFailed = true; }
}
const out = {};
for (const [k, v] of Object.entries(t)) out[k] = v.length ? stats(v) : 'NO DATA';
const cell = {
  target: BASE, when: new Date().toISOString(), unit: 'ms', runs: N,
  snapshotBytes: Buffer.byteLength(savePayload),
  note: 'Anonymous legacy /api/projects surface (the only one live prod serves a throwaway session — see findings F1/F2). create=POST /api/projects · save=POST versions (300-wall snapshot) · fetchLatest=GET latest-version (the D-axis server leg) · list=GET /api/projects.',
  ...out,
};
console.log(JSON.stringify(cell, null, 2));
if (cleanupFailed) { console.error('CLEANUP INCOMPLETE — projects left behind, see errors above.'); process.exitCode = 1; }
console.log(`cleanup OK — ${created.length} project(s) deleted.`);
// Merge into the shared baseline JSON when PERF_OUT is set (same merge-write
// contract as outer-baseline.spec.ts writeResult()).
if (process.env.PERF_OUT && !cleanupFailed) {
  const { readFileSync, writeFileSync, mkdirSync } = await import('node:fs');
  const { dirname } = await import('node:path');
  mkdirSync(dirname(process.env.PERF_OUT), { recursive: true });
  let cur = {};
  try { cur = JSON.parse(readFileSync(process.env.PERF_OUT, 'utf8')); } catch { /* first write */ }
  cur['live-api'] = cell;
  writeFileSync(process.env.PERF_OUT, JSON.stringify(cur, null, 2) + '\n');
  console.log(`merged cell 'live-api' into ${process.env.PERF_OUT}`);
}
