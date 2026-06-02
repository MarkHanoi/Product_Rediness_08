#!/usr/bin/env node
// scripts/spec-cutover-checklist.mjs — S45 D5 point-of-no-return enforcer.
//
// Spec source: `phases/PHASE-2D-Q4-M22-M24-SYNC-AWARENESS-BETA.md` §S45
// lines 462-478.
//
//   D5 morning checklist (must all be GREEN before deletion):
//     [ ] 14-day Supabase burn-in elapsed clean.
//     [ ] No P0/P1 bugs touching persistence in the last 14 days.
//     [ ] `pnpm bench restore-verify` green for 14 consecutive nights.
//     [ ] `pnpm spec:audit-storage` green.
//     [ ] Read-your-writes consistency check job green for 14 consecutive nights.
//
//   D5 actions (irreversible):
//     1. DROP TABLE project_command_log;     -- in Supabase
//     2. Drop Replit-PG production database (snapshot kept for 30 days).
//     3. server.js: gate Replit-PG fallback on `NODE_ENV !== 'production'`.
//     4. Delete `src/snapping/`; lives in `packages/picking/` per ADR-0015.
//     5. Tag commit `phase2d-cutover-complete` for forensic trace.
//
// USAGE
// ─────────────────────────────────────────────────────────────────────────────
//   pnpm node scripts/spec-cutover-checklist.mjs           # report only
//   pnpm node scripts/spec-cutover-checklist.mjs --execute # would-execute (still gated)
//
// This script NEVER actually performs the destructive actions when
// `SUPABASE_URL` is unset — that's the entire point of S45 D5 deferral
// pattern (we ship the gate, deletion happens at S43 D9 + 14-night burn-in).
// When all five flags are PRYZM_CUTOVER_FLAGS=... = 'green', the script
// prints the irreversible action plan and (with --execute) writes a dated
// receipt under `.local/cutover-receipts/`.

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const FLAGS = [
  { key: 'PRYZM_CUTOVER_BURN_IN_14D',  spec: 'D5/L1 — 14-day Supabase burn-in elapsed clean' },
  { key: 'PRYZM_CUTOVER_NO_P0_P1_14D', spec: 'D5/L2 — no P0/P1 persistence bugs in 14 days' },
  { key: 'PRYZM_CUTOVER_RESTORE_14D',  spec: 'D5/L3 — restore-verify green 14 consecutive nights' },
  { key: 'PRYZM_CUTOVER_AUDIT_STORAGE', spec: 'D5/L4 — pnpm spec:audit-storage green' },
  { key: 'PRYZM_CUTOVER_RYW_14D',      spec: 'D5/L5 — read-your-writes consistency green 14 nights' },
];

const ACTIONS = [
  'DROP TABLE project_command_log; (Supabase)',
  'Drop Replit-PG production database (snapshot retained 30 days)',
  'server.js: gate Replit-PG fallback on NODE_ENV !== "production"',
  'Delete src/snapping/ (lives in packages/picking/ per ADR-0015)',
  'git tag phase2d-cutover-complete',
];

const args = new Set(process.argv.slice(2));
const execute = args.has('--execute');
const skipSupabaseCheck = args.has('--skip-supabase-check');

console.log('PRYZM 2 — S45 D5 cutover checklist');
console.log('===================================');

let allGreen = true;
for (const f of FLAGS) {
  const v = (process.env[f.key] ?? '').toLowerCase();
  const ok = v === 'green';
  console.log(`  [${ok ? 'x' : ' '}] ${f.spec}    (${f.key}=${v || 'unset'})`);
  if (!ok) allGreen = false;
}

const supabaseUrl = process.env.SUPABASE_URL ?? '';
console.log('');
console.log(`Supabase: ${supabaseUrl ? 'configured (' + redactUrl(supabaseUrl) + ')' : 'NOT CONFIGURED'}`);

if (!supabaseUrl && !skipSupabaseCheck) {
  console.log('');
  console.log('⚠  SUPABASE_URL is unset — Supabase cutover (S43 D9) has not landed.');
  console.log('   Per ADR-0035 §3, S45 D5 is bound to S43 D9 + 14-night burn-in.');
  console.log('   This script will refuse to execute even with all flags green.');
  console.log('   (Pass --skip-supabase-check to override for dry-run rehearsals.)');
  process.exit(allGreen ? 0 : 2);
}

if (!allGreen) {
  console.log('');
  console.log('✗ Checklist NOT all green — D5 deletion is DEFERRED.');
  console.log('  Per spec §S45 line 480, deferral pushes deletion to S46 D1');
  console.log('  and extends the rollback window.');
  process.exit(2);
}

console.log('');
console.log('✓ All checklist items GREEN.');
console.log('');
console.log('Irreversible actions on D5:');
for (const [i, a] of ACTIONS.entries()) console.log(`  ${i + 1}. ${a}`);

if (!execute) {
  console.log('');
  console.log('(Dry-run — pass --execute to write a receipt and proceed.)');
  process.exit(0);
}

const receiptDir = '.local/cutover-receipts';
if (!existsSync(receiptDir)) mkdirSync(receiptDir, { recursive: true });
const receipt = {
  timestamp: new Date().toISOString(),
  flags: Object.fromEntries(FLAGS.map(f => [f.key, process.env[f.key]])),
  supabaseUrl: redactUrl(supabaseUrl),
  actions: ACTIONS,
  note: 'This receipt is the durable record that the D5 checklist passed and the irreversible actions were authorised.  Per ADR-0035 §3 it must be checked into the repository under .local/cutover-receipts/ and referenced in the S43 D9 + S45 D5 audit row.',
};
const receiptPath = join(receiptDir, `${new Date().toISOString().slice(0, 10)}.json`);
writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
console.log('');
console.log(`✓ Receipt written: ${receiptPath}`);
console.log('  Now proceed to execute the 5 actions above by hand.  This script');
console.log('  intentionally does NOT issue the DROP TABLE / DROP DATABASE itself —');
console.log('  the operator must be looking at the database as they run them.');

function redactUrl(url) {
  try {
    const u = new URL(url);
    if (u.password) u.password = '***';
    return u.toString();
  } catch {
    return '<invalid-url>';
  }
}
