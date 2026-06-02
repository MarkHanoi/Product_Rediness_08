#!/usr/bin/env node
// scripts/cutover-checklist.mjs — Supabase cutover enforcer (W-06).
//
// Spec: `phases/audits/PHASE-2-CLOSE-IMPLEMENTATION-PLAN-2026-04-28.md` §W-06.
// Authority: ADR-0035 §"D5 deletions" (gate behind a checklist enforcer).
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// The cutover has 7 ordered steps; this script enforces them as a single
// idempotent CLI.  The destructive D5 actions (DROP project_command_log,
// drop the Replit-PG fallback, gate fallback on NODE_ENV, etc) refuse to
// run unless the restore-verify burn-in counter is at ≥ 14 consecutive
// green nights.
//
// Steps (`--step` flag):
//   1. provision-check   — verifies SUPABASE_URL + keys are present.
//   2. connectivity      — fetches /rest/v1/ and asserts 200/401 (auth-gated).
//   3. apply-migration   — invokes `psql -f apps/sync-server/migrations/…`.
//   4. dual-write-on     — flips SYNC_EVENT_LOG=pg in the deployed env.
//   5. burn-in-status    — prints the streak counter; exits 0 if ≥ 14.
//   6. d5-actions        — destructive cleanup; refuses unless step 5 PASSes.
//   7. tag-commit        — git tag m24-cutover-burn-in-complete (founder-only).
//
// USAGE
// ─────────────────────────────────────────────────────────────────────────────
//   node scripts/cutover-checklist.mjs --step provision-check
//   node scripts/cutover-checklist.mjs --step connectivity
//   node scripts/cutover-checklist.mjs --step burn-in-status
//   node scripts/cutover-checklist.mjs --step d5-actions   # blocked unless burn-in is 14+
//
// Without `--step`, prints the full checklist + per-step status and exits 0.

import { promises as fs } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const MIGRATION_FILE = join(REPO_ROOT, 'apps', 'sync-server', 'migrations', '001_phase2_supabase.sql');
const STREAK_FILE = join(REPO_ROOT, '.local', 'restore-verify-streak.json');
const REQUIRED_BURN_IN_DAYS = Number(process.env.PRYZM_BURN_IN_DAYS_REQUIRED ?? 14);

const STEPS = [
  'provision-check',
  'connectivity',
  'apply-migration',
  'dual-write-on',
  'burn-in-status',
  'd5-actions',
  'tag-commit',
];

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return def;
  return process.argv[i + 1] ?? def;
}

function flag(name) {
  return process.argv.includes(`--${name}`);
}

function ok(msg) { console.log(`  ✓ ${msg}`); }
function warn(msg) { console.log(`  ⚠ ${msg}`); }
function bad(msg) { console.error(`  ✗ ${msg}`); }

async function readStreak() {
  try {
    const text = await fs.readFile(STREAK_FILE, 'utf-8');
    const j = JSON.parse(text);
    return {
      streak: Number(j.streak ?? 0),
      lastUpdated: j.lastUpdated ?? null,
      lastResult: j.lastResult ?? null,
    };
  } catch {
    return { streak: 0, lastUpdated: null, lastResult: null };
  }
}

async function stepProvisionCheck() {
  console.log('\n[1/7] provision-check — Supabase env vars present?');
  const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
  let missing = 0;
  for (const k of required) {
    if (process.env[k] && process.env[k].length > 0) ok(`${k} set`);
    else { bad(`${k} missing`); missing++; }
  }
  if (missing > 0) {
    console.error(
      '\n  → Set these via the Replit secrets panel — DO NOT commit.\n'
      + '    Founder action; agent cannot provision Supabase.',
    );
    return 1;
  }
  return 0;
}

async function stepConnectivity() {
  console.log('\n[2/7] connectivity — can we reach Supabase REST?');
  if (!process.env.SUPABASE_URL) { bad('SUPABASE_URL not set; run --step provision-check first'); return 1; }
  try {
    const r = await fetch(process.env.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/');
    if (r.status === 401 || r.status === 200) {
      ok(`HTTP ${r.status} from /rest/v1/ (auth-gated, healthy)`);
      return 0;
    }
    bad(`unexpected HTTP ${r.status} from /rest/v1/`);
    return 1;
  } catch (e) {
    bad(`fetch failed: ${e?.message ?? e}`);
    return 1;
  }
}

async function stepApplyMigration() {
  console.log('\n[3/7] apply-migration — apply 001_phase2_supabase.sql');
  const exists = await fs.stat(MIGRATION_FILE).then(() => true).catch(() => false);
  if (!exists) { bad(`migration file missing: ${MIGRATION_FILE}`); return 1; }
  const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    warn('DATABASE_URL not set — printing the command for the founder to run:');
    console.log(`\n    psql "$DATABASE_URL" -f ${MIGRATION_FILE.replace(REPO_ROOT + '/', '')}\n`);
    return 0;  // intentional: this step is informational unless DATABASE_URL is set.
  }
  if (flag('dry-run')) {
    ok(`would invoke: psql "$DATABASE_URL" -f ${MIGRATION_FILE}`);
    return 0;
  }
  const r = spawnSync('psql', [dbUrl, '-f', MIGRATION_FILE], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  if (r.status !== 0) { bad(`psql exited ${r.status}`); return 1; }
  ok('migration applied');
  return 0;
}

async function stepDualWriteOn() {
  console.log('\n[4/7] dual-write-on — flip SYNC_EVENT_LOG=pg in the deployed env');
  const cur = process.env.SYNC_EVENT_LOG;
  if (cur === 'pg') ok('SYNC_EVENT_LOG=pg already');
  else warn(`SYNC_EVENT_LOG=${cur ?? '<unset>'} — set to "pg" via the secrets panel`);
  ok('the in-memory event log remains the dev/test default; pg engages only when set');
  return 0;
}

async function stepBurnInStatus() {
  console.log(`\n[5/7] burn-in-status — restore-verify streak (need ≥ ${REQUIRED_BURN_IN_DAYS})`);
  const s = await readStreak();
  if (s.lastUpdated === null) {
    warn(`no streak file at ${STREAK_FILE}`);
    warn('streak counter starts after first successful `pnpm bench restore-verify`');
    return 0;
  }
  console.log(`  streak: ${s.streak}  lastResult: ${s.lastResult}  lastUpdated: ${s.lastUpdated}`);
  if (s.streak >= REQUIRED_BURN_IN_DAYS) {
    ok(`burn-in complete (≥ ${REQUIRED_BURN_IN_DAYS} green nights)`);
    return 0;
  }
  bad(`burn-in NOT complete; ${REQUIRED_BURN_IN_DAYS - s.streak} more night(s) required`);
  return 1;
}

async function stepD5Actions() {
  console.log('\n[6/7] d5-actions — destructive cleanup (gated)');
  const s = await readStreak();
  if (s.streak < REQUIRED_BURN_IN_DAYS) {
    bad(`REFUSED — burn-in counter is ${s.streak}/${REQUIRED_BURN_IN_DAYS}`);
    bad('Re-run --step burn-in-status until it PASSes, then re-run this step.');
    return 1;
  }
  console.log('  Burn-in clear. The following 5 destructive actions are now allowed:');
  console.log('    1. DROP TABLE project_command_log              (Replit-PG)');
  console.log('    2. Decommission Replit-PG (delete add-on)');
  console.log('    3. Gate the in-memory fallback on NODE_ENV !== "production"');
  console.log('    4. Delete `src/snapping/` (PRYZM 1 dead code per S61 D5)');
  console.log('    5. git tag m24-cutover-burn-in-complete');
  if (!flag('execute')) {
    warn('--execute not passed; printed actions only.  Re-run with --execute to perform.');
    return 0;
  }
  bad('--execute is reserved for the founder.  Agent cannot run destructive cutover.');
  return 1;
}

async function stepTagCommit() {
  console.log('\n[7/7] tag-commit — `git tag m24-cutover-burn-in-complete`');
  warn('Founder action.  Agent does not perform git write operations.');
  console.log('  Founder runs:  git tag m24-cutover-burn-in-complete && git push --tags');
  return 0;
}

const handlers = {
  'provision-check': stepProvisionCheck,
  'connectivity': stepConnectivity,
  'apply-migration': stepApplyMigration,
  'dual-write-on': stepDualWriteOn,
  'burn-in-status': stepBurnInStatus,
  'd5-actions': stepD5Actions,
  'tag-commit': stepTagCommit,
};

const requested = arg('step', null);
if (requested) {
  const fn = handlers[requested];
  if (!fn) {
    console.error(`unknown --step ${requested}; valid: ${STEPS.join(', ')}`);
    process.exit(2);
  }
  process.exit((await fn()) || 0);
}

console.log('\n=== Phase 2 cutover checklist (W-06) ===');
console.log('Run with `--step <name>` to execute one step; without --step prints status.\n');
let total = 0;
for (const name of STEPS) {
  const r = (await handlers[name]()) || 0;
  total += r;
}
console.log('\n=== Summary ===');
if (total === 0) {
  console.log('All informational steps green.  Destructive steps require --execute (founder).');
  process.exit(0);
}
console.error(`${total} step(s) failed.  See messages above.`);
process.exit(1);
