#!/usr/bin/env node
/**
 * tools/perf/outer/run-outer-local.mjs — LANE BASE-OUTER (2026-09-02)
 *
 * Boots the LOCAL PRODUCTION target and runs the browser-layer baseline spec
 * against it:
 *
 *   1. Requires a fresh `dist/` (vite build output). Refuses to run without one
 *      — that is the admissibility gate: the Vite DEV server starves the Node
 *      event loop, so dev-mode timings are INADMISSIBLE for baselines.
 *   2. Starts `tsx server.js` with a CLEAN env (no .env inherited — no founder
 *      secrets, no production database). `server.js:143` computes
 *      `isProd = npm_lifecycle_event !== 'dev' && existsSync('dist')`, so this
 *      serves the BUILT app via express.static with NO Vite middleware, while
 *      tsx only pays a one-off boot cost for the two @pryzm TS imports (§L-442)
 *      — request handling is identical to production. Stores fall back to the
 *      in-memory path (Round 40) — API legs are therefore LAN/in-memory times;
 *      pair them with tools/perf/outer/live-api-baseline.mjs for the WAN+DB leg.
 *   3. Mints a session JWT with the LOCAL throwaway SESSION_SECRET. The email
 *      claim must pass server/betaAccessAllowlist.js `isBetaAllowed` because
 *      §BETA-GATE-CHECKED-PER-REQUEST re-checks the claim on every request —
 *      the claim is just a string inside a token that never leaves this
 *      machine and no account row is created anywhere.
 *   4. Runs the Playwright spec (axis C, axis D, falsification, CPU profile).
 *   5. Kills the server. All projects the spec created are deleted by the spec
 *      itself; the store is in-memory anyway and dies with the process.
 *
 * Reproduce:
 *   node --max-old-space-size=6144 node_modules/vite/bin/vite.js build   # once
 *   node tools/perf/outer/run-outer-local.mjs
 * Options:
 *   PERF_PORT (default 5311) · PERF_RUNS (default 5) · PERF_KEEP_SERVER=1
 */
import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const require = createRequire(resolve(repoRoot, 'package.json'));

const PORT = parseInt(process.env.PERF_PORT ?? '5311', 10);
const BASE = `http://localhost:${PORT}`;

// ── 1. dist/ admissibility gate ──────────────────────────────────────────────
const distIndex = resolve(repoRoot, 'dist', 'index.html');
if (!existsSync(distIndex)) {
  console.error('REFUSED: dist/index.html missing — build first (vite build). Dev-mode timings are inadmissible.');
  process.exit(1);
}
const distAgeH = (Date.now() - statSync(distIndex).mtimeMs) / 3.6e6;
console.log(`[run-outer-local] dist/index.html age: ${distAgeH.toFixed(1)}h (record this beside any number you quote)`);

// ── 2. clean-env production server ───────────────────────────────────────────
const SESSION_SECRET = `perf-outer-local-${Math.random().toString(36).slice(2)}`;
const serverEnv = {
  // Deliberately NOT process.env: no .env is loaded (we invoke tsx directly,
  // not `npm run dev`), and we do not forward the shell env either, so no
  // founder secret or production DATABASE_URL can leak into this run.
  PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP,
  APPDATA: process.env.APPDATA, LOCALAPPDATA: process.env.LOCALAPPDATA, USERPROFILE: process.env.USERPROFILE,
  COMSPEC: process.env.COMSPEC, PATHEXT: process.env.PATHEXT, windir: process.env.windir,
  PORT: String(PORT),
  SESSION_SECRET,
  NODE_ENV: 'production',
  // server.js:291-299 hard-refuses to boot in prod mode without a DB env var.
  // PRYZM_FORCE_INMEMORY=1 is the repo's own sanctioned offline mode
  // (server/pgClient.js §CONN-DEV): it short-circuits resolveConnectionString()
  // BEFORE the URL is ever read, so the placeholder below is never dialed —
  // it exists solely to satisfy the presence check at boot.
  PRYZM_FORCE_INMEMORY: '1',
  SUPABASE_DB_URL: 'postgresql://never-dialed-placeholder.invalid:5432/ignored',
};
console.log(`[run-outer-local] starting tsx server.js on :${PORT} (clean env, in-memory stores)…`);
const tsxCli = resolve(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const server = spawn(process.execPath, [tsxCli, 'server.js'], { cwd: repoRoot, env: serverEnv, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
server.stdout.on('data', d => { serverLog += d; });
server.stderr.on('data', d => { serverLog += d; });
const killServer = () => { try { server.kill(); } catch { /* already dead */ } };
process.on('exit', () => { if (process.env.PERF_KEEP_SERVER !== '1') killServer(); });

// wait for health
let healthy = false;
for (let i = 0; i < 120; i++) {
  try {
    const r = await fetch(`${BASE}/api/health`);
    if (r.ok) { healthy = true; break; }
  } catch { /* not up yet */ }
  await new Promise(r => setTimeout(r, 1000));
}
if (!healthy) {
  console.error('server never became healthy. Last log:\n' + serverLog.slice(-3000));
  process.exit(1);
}
console.log('[run-outer-local] server healthy.');
// Assert the server took the PROD static path, not Vite middleware.
const shell = await (await fetch(`${BASE}/`)).text();
if (shell.includes('/@vite/client')) {
  console.error('REFUSED: server is serving the Vite DEV client — timings would be inadmissible.');
  process.exit(1);
}

// ── 3. mint the session token ────────────────────────────────────────────────
const jwt = require('jsonwebtoken');
// The email claim must be on server/betaAccessAllowlist.js (checked per request,
// §BETA-GATE-CHECKED-PER-REQUEST). Local-only token, local-only secret.
const TOKEN = jwt.sign({ sub: 'user-perf-outer', email: 'antoniocanerosan@gmail.com' }, SESSION_SECRET, { expiresIn: '2h' });
const me = await fetch(`${BASE}/api/auth/me`, { headers: { Authorization: `Bearer ${TOKEN}` } });
if (me.status !== 200) {
  console.error(`token sanity check failed: /api/auth/me → HTTP ${me.status}`);
  process.exit(1);
}
console.log('[run-outer-local] token accepted by /api/auth/me.');

// ── 4. run the spec ──────────────────────────────────────────────────────────
const pw = spawn(process.execPath, [resolve(repoRoot, 'node_modules', '@playwright', 'test', 'cli.js'), 'test', '--config', resolve(here, 'playwright.outer.config.ts')], {
  cwd: repoRoot,
  env: { ...process.env, PERF_LOCAL_URL: BASE, PERF_TOKEN: TOKEN, PERF_RUNS: process.env.PERF_RUNS ?? '5' },
  stdio: 'inherit',
});
const rc = await new Promise(res => pw.on('close', res));

// ── 5. teardown ──────────────────────────────────────────────────────────────
if (process.env.PERF_KEEP_SERVER === '1') {
  console.log(`[run-outer-local] PERF_KEEP_SERVER=1 — server left on :${PORT} (token on stdout below).\nPERF_TOKEN=${TOKEN}`);
} else {
  killServer();
}
process.exit(rc === 0 ? 0 : 1);
