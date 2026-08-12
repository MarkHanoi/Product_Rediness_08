// ─── GATE · check-suppression-is-reversible — REGISTRATION SHIM ──────────────
//
// C72 §6.3 names this path as the gate's home. The full implementation ALREADY
// EXISTS at `tools/ga-gate/check-suppression-is-reversible.ts` (the contract
// header drifted — §6.3 said "NOT BUILT" after the ga-gate copy landed), and it
// implements every arm §6.3 specifies, on THIS suite's four-exit contract
// (it imports ../contract.js itself):
//
//   S0  floors, exit 2 — ≥15 production pause() sites across ≥6 files, ≥1
//       suppression marker field, ≥500 files read, executed controls passed.
//   S1  hard — a marker whose setter has ≥1 production caller must have a
//       release METHOD with ≥1 production caller (§4.1/§4.3).
//   S2  hard — pause()…resume() spanning a fallible call must sit in
//       try/finally (§4.2).
//   S3  named ratchet — every suppression flag declares `@suppression-scope
//       <level|batch|load-window|drag|frame|session>` (§4.4); the inline
//       SHRINK-ONLY ledger in the implementation names each entry.
//
// Verified 2026-08-12 against §6.3 arm-for-arm; negative-tested by planting an
// S1+S2+S3 violation file under src/ — all three arms fired and the run exited
// 3 (NOT ON THE LEDGER ×3). Duplicating ~600 lines of scanner here would mint a
// second rival measurement of the same subject (the C69 rival-list defect), so
// this file only makes the gate reachable from certify.ts's `gates/` loop and
// forwards the implementation's exit code untouched.
//
// §4.1 status note (UNDETERMINED, deliberately): `clearGraphAuthoritative`
// remains the implementation's S1 ledger entry. ADR-0126 GR1/GR2 makes graph
// authority a generation-time seed surrendered only on a manual structural
// add/remove; every candidate wider release (on generation end, on wall
// `update`, on explicit redetect) either defeats GR1 outright or risks
// re-introducing the founder's double-room defect on trimmed-loose generated
// walls. A wrong release is worse than a declared missing one — the entry
// stays RED on the ledger until the GR2-extension design (per-room surrender
// per ADR-0126 §GR2, or an update-commit surrender) is decided.

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXIT_MISCONFIGURED } from '../contract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const IMPL = resolve(__dirname, '../../../ga-gate/check-suppression-is-reversible.ts');

if (!existsSync(IMPL)) {
  // The gate has lost its subject — an absent implementation must read as
  // MISCONFIGURED, never as clean (L-812: a missing script file is never debt).
  console.log(`\n── check-suppression-is-reversible ${'─'.repeat(26)}`);
  console.log(`   ❌ implementation missing at ${IMPL} — MISCONFIGURED, never absorbable.`);
  process.exit(EXIT_MISCONFIGURED);
}

const r = spawnSync('npx', ['tsx', IMPL], { stdio: 'inherit', env: process.env, shell: true });
// A gate that could not even be spawned has measured nothing (`?? 2`, the L-774 rule).
process.exit(r.status ?? EXIT_MISCONFIGURED);
