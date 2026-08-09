#!/usr/bin/env tsx
/**
 * @file tools/ga-gate/run-all.ts
 * @description Orchestrator for all PRYZM GA gate checks.
 *
 * Contract C01 §5 — all gates MUST pass before a PR merges.
 * Wave A14 (S118) — wired into .github/workflows/ci.yml as a single step.
 *
 * Gates run (in order, all must exit 0):
 *   1.  check-cast-count.ts                  — (window as any) ratchet (P4)
 *   2.  check-raf-count.ts                   — rAF owner ratchet (P3)
 *   3.  check-three-imports.ts               — THREE isolation (P2)
 *   4.  check-engine-bootstrap-loc.ts        — EngineBootstrap.ts deleted (P1)
 *   5.  check-l7-boundary.ts                 — no direct @pryzm/* in plugins (L7)
 *   6.  check-motion-gate-coverage.ts        — motion gate coverage (P8)
 *   7.  check-otel-spans.ts                  — 184/184 handler OTel spans (S03/C10)
 *   8.  check-ctrl-z-wired.ts               — Ctrl-Z ring-buffer wired (C03/Wave36)
 *   9.  check-project-isolation.ts           — C13 project-isolation anchors (Wave35)
 *   9b. check-declared-project-scopes.ts     — ADR-0298 declared isolation-probe set (C13 §3.10)
 *   10. check-no-commandmanager.ts           — cmdMgr alias + literal ratchet (OI-046 / Phase E.5.x)
 *   11. check-no-workspacemountbridge.ts     — workspace bridge (D.4) elimination (Phase 2 Task 2.2)
 *   12. check-per-package-compile.ts         — per-package tsc --noEmit (Phase H · C01 §5 · Task 7.2)
 *   13. check-scene-graph.ts                — NME proxy-in-scene tripwire (G2-T2/doc50)
 *   14. check-geometry-ceiling.ts           — releaseGroups disposeProxies ceiling (G1-T4/doc50)
 *   15. check-apps-editor-ghost-dirs.ts      — ghost directory guard (G7/doc50)
 *   16. check-window-store-in-packages.ts   — window.xStore reads in packages/ (OI-047 / Phase E.stores)
 *   17. check-custom-event-packages.ts      — CustomEvent dispatches in packages/ (OI-048 / Phase F.events)
 *   18. check-commandmanager-any.ts         — commandManager: any typed params (OI-049 / Phase E.types)
 *   19. check-structuredclone-new-commands.ts — structuredClone undo in command-registry (OI-050 / Phase E.undo)
 *   20. check-xss-guards.ts                 — repo-wide HTML-sink scan, per-file ratchet (P0/OI-051, L-407)
 *   21. check-custom-event-apps.ts          — CustomEvent dispatches in apps/editor/src/ (OI-050 / Phase F.events.2)
 *   22. check-zoning-fidelity-label.ts      — estimated zoning value never rendered authoritative (C58 §6 / ADR-0279 BLOCKER-1)
 *   23. check-height-fidelity.ts           — 3D-Site height honesty (L-646 / L-647)
 *   24. check-write-route-auth.ts          — every mutating Express route is authenticated or declared-exempt (C08 §1.2, L-406)
 *   25. check-command-naming.ts            — one domain, one command prefix spelling (L-796)
 *   26. check-layer-boundaries.ts          — THE layer gate; eslint-plugin-boundaries never was (L-809)
 *   27. check-single-compose.ts            — P1 single composition root (L-812, was MISSING)
 *   28. check-domain-purity.ts             — P5 schemas are pure (L-812, was MISSING)
 *   29. check-no-direct-store-writes.ts    — P6 commands are the only mutation path (L-812, was MISSING)
 *   30. check-visibility-intent-not-ui.ts  — P7 visibility intent ≠ UI (L-812, was MISSING)
 *
 * §P1/P5/P6/P7-UNENFORCED (L-812, 2026-08-09). C01 §5 listed gates 27–30 as
 * hard-fail and merge-blocking. **None of the four script files existed.** P6 in
 * particular — "commands are the only mutation path" — underpins undo, CRDT merge
 * and the AI batch-apply path, and nothing in this repository checked it. The
 * inventory described enforcement that was never written, and the only reason
 * that survived fifteen months is that nothing ever attempted to run it. See the
 * `missing` pre-flight below, which now makes that specific lie impossible.
 *
 * Phase 0 (OI-046 through OI-050): Gates 16–19 are the new gates added to close
 * the aliasing loophole and establish ratchets for all four remaining legacy patterns.
 * All four ratchets start at their 2026-05-16 baselines and decrease per Phase E/F sprint.
 * Gate 21 (F.events.2) extends the CustomEvent ratchet to the apps-tier (297 sites baseline).
 *
 * Exit codes:
 *   0 — all gates passed
 *   1 — one or more gates failed (gate name + exit code logged)
 */

import { spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));

interface Gate {
  name: string;
  script: string;
}

const GATES: Gate[] = [
  { name: 'cast-count (P4)',                          script: 'check-cast-count.ts' },
  { name: 'raf-count (P3)',                           script: 'check-raf-count.ts' },
  { name: 'three-imports (P2)',                       script: 'check-three-imports.ts' },
  { name: 'engine-bootstrap-loc (P1)',                script: 'check-engine-bootstrap-loc.ts' },
  { name: 'l7-boundary (L7)',                         script: 'check-l7-boundary.ts' },
  { name: 'motion-gate-coverage (P8)',                script: 'check-motion-gate-coverage.ts' },
  { name: 'otel-spans (S03/C10)',                     script: 'check-otel-spans.ts' },
  { name: 'ctrl-z-wired (C03/Wave36)',                script: 'check-ctrl-z-wired.ts' },
  { name: 'project-isolation-gate (C13/Wave35)',      script: 'check-project-isolation.ts' },
  { name: 'declared-project-scopes (ADR-0298)',        script: 'check-declared-project-scopes.ts' },
  { name: 'no-commandmanager (OI-046/Phase E.5.x)',  script: 'check-no-commandmanager.ts' },
  { name: 'no-workspacemountbridge (Phase2/Task2.2)', script: 'check-no-workspacemountbridge.ts' },
  { name: 'per-package-compile (Phase H/Task7.2)',    script: 'check-per-package-compile.ts' },
  { name: 'scene-graph (G2-T2/doc50)',                script: 'check-scene-graph.ts' },
  { name: 'geometry-ceiling (G1-T4/doc50)',           script: 'check-geometry-ceiling.ts' },
  { name: 'apps-editor-ghost-dirs (G7/doc50)',        script: 'check-apps-editor-ghost-dirs.ts' },
  { name: 'window-store-in-packages (OI-047/E.stores)', script: 'check-window-store-in-packages.ts' },
  { name: 'custom-event-packages (OI-048/F.events)',  script: 'check-custom-event-packages.ts' },
  { name: 'commandmanager-any (OI-049/E.types)',      script: 'check-commandmanager-any.ts' },
  { name: 'structuredclone-commands (OI-050/E.undo)', script: 'check-structuredclone-new-commands.ts' },
  { name: 'xss-sink-scan (P0/OI-051/L-407)',          script: 'check-xss-guards.ts' },
  { name: 'custom-event-apps (OI-050/F.events.2)',    script: 'check-custom-event-apps.ts' },
  { name: 'zoning-fidelity-label (C58§6/ADR-0279)',   script: 'check-zoning-fidelity-label.ts' },
  { name: 'height-fidelity (L-646/L-647)',            script: 'check-height-fidelity.ts' },
  { name: 'write-route-auth (C08§1.2/L-406)',         script: 'check-write-route-auth.ts' },
  { name: 'command-naming (L-796)',                   script: 'check-command-naming.ts' },
  { name: 'layer-boundaries (L-809)',                 script: 'check-layer-boundaries.ts' },
  // §P1/P5/P6/P7-UNENFORCED (L-812) — the four principles C01 §5 listed as
  // hard-fail gates whose SCRIPT FILES DID NOT EXIST. Added 2026-08-09.
  { name: 'single-compose (P1/L-812)',                script: 'check-single-compose.ts' },
  { name: 'domain-purity (P5/L-812)',                 script: 'check-domain-purity.ts' },
  { name: 'no-direct-store-writes (P6/L-812)',        script: 'check-no-direct-store-writes.ts' },
  { name: 'visibility-intent-not-ui (P7/L-812)',      script: 'check-visibility-intent-not-ui.ts' },
];

let anyFailed = false;

console.log('[ga-gate/run-all] Running all GA convergence gates...\n');

// §GA-GATE-RUNNER-COULD-NOT-SPAWN (L-774) — THE SUITE HAS NEVER RUN ON WINDOWS.
//
// `spawnSync('npx', …)` WITHOUT `shell: true` cannot execute `npx` on win32,
// because the thing on PATH is `npx.cmd` and Node's spawn will not run a `.cmd`
// through the raw CreateProcess path. Every gate therefore returned
// `status: 1` with NO output, and the runner faithfully reported all 25 as
// FAILED — including gates that pass in isolation seconds earlier
// (`check-project-isolation`, `check-declared-project-scopes` both do).
//
// ⚠ THAT IS WHY NOBODY WIRED IT INTO CI. The launch audit correctly found this
// suite is "invoked by nothing" and read that as neglect. The likelier story is
// the reverse: someone tried, saw 25/25 fail on their machine, could not tell a
// broken runner from a broken codebase, and left it out. A verification tool that
// fails 100% of the time teaches nothing and gets switched off — the same lesson
// as the deploy proof that once failed a healthy release.
//
// The tell was cheap and available the whole time: a gate that PASSES standalone
// and FAILS inside the runner is a statement about the RUNNER. Total failure is
// almost never 25 independent defects.
//
// `shell: true` is the portable fix (POSIX unaffected). The path is quoted
// because a shell re-parses the argv.
const NEEDS_SHELL = process.platform === 'win32';
const spawnGate = (scriptPath: string) => spawnSync(
  'npx',
  ['tsx', NEEDS_SHELL ? `"${scriptPath}"` : scriptPath],
  { stdio: 'inherit', encoding: 'utf8', shell: NEEDS_SHELL },
);

// §GA-GATE-RATCHET (L-775) — SHRINK-ONLY DEBT BASELINE.
//
// Fixing L-774 let this suite run for the first time and revealed 16 genuine
// failures — drift accumulated over however long nothing was checking. Two bad
// options and one good one:
//
//   ✗ Wire it in blocking now  → every PR fails on pre-existing debt, so within a
//                                day someone adds `continue-on-error: true` and we
//                                are back to a gate that gates nothing. That is
//                                exactly how the EXISTING ga-gate job ended up
//                                advisory.
//   ✗ Leave it unwired         → the 16 stay invisible and grow.
//   ✓ Ratchet                  → today's failures are DECLARED DEBT; CI blocks a
//                                gate that newly breaks, and blocks a gate that
//                                starts passing without being removed from the
//                                baseline. Debt can only shrink.
//
// This mirrors `declared-project-scope-debt.json`, the pattern already proven in
// this repo. Keyed on `script` (a filename) not `name` (a display string that
// carries phase tags and gets edited).
//
// ⚠ A BASELINED GATE THAT STARTS PASSING IS A FAILURE. Without that rule the
// baseline is write-only: debt gets paid and nobody notices, so the file drifts
// into a list of things that are actually fine and stops meaning anything. Being
// forced to delete the line is what makes the number trustworthy.
const debtPath = join(__dir, 'gate-debt.json');
let baseline: Set<string>;
try {
  const raw = JSON.parse(readFileSync(debtPath, 'utf8')) as { failing?: string[] };
  baseline = new Set(raw.failing ?? []);
} catch {
  // No baseline file ⇒ no declared debt ⇒ every failure is a regression. That is
  // the correct default: absence of a debt file must not mean "tolerate anything".
  baseline = new Set<string>();
}

const nowFailing: string[] = [];
const nowPassing: string[] = [];

// §MISSING-GATE-IS-NOT-DEBT (L-812) — a gate whose FILE does not exist is not a
// failing gate; it is a lie in the inventory. C01 §5 named five hard-fail gates
// (check-single-compose, ci-check-domain-purity, ci-check-no-direct-store-writes,
// intent-not-ui.test, ci-check-spans) that had never been written, and nothing
// noticed for fifteen months because nothing tried to run them. This loop is
// checked BEFORE any gate runs and is NOT eligible for the debt baseline —
// declaring debt against a file that does not exist is meaningless.
const missing = GATES.filter((g) => !existsSync(join(__dir, g.script)));
if (missing.length > 0) {
  console.error(
    `\n[ga-gate/run-all] ❌ ${missing.length} GATE SCRIPT(S) DO NOT EXIST:\n`
    + missing.map((g) => `    - ${g.script}  (${g.name})`).join('\n')
    + '\n  An inventory entry with no file behind it is worse than an omission: it reads as'
    + '\n  coverage. Write the gate or delete the row — the debt baseline cannot excuse this.',
  );
  process.exit(1);
}

for (const gate of GATES) {
  const scriptPath = join(__dir, gate.script);
  const result = spawnGate(scriptPath);
  const code = result.status ?? 1;

  // §MISCONFIG-IS-NEVER-DEBT (L-811) — exit 2 means the gate could not evaluate
  // (unreadable root, empty walk, missing prerequisite). That is categorically
  // different from "the code is dirty", so it is NEVER absorbed by the debt
  // ledger. The whole ripgrep episode is what this clause exists to prevent: for
  // months three gates died with `spawnSync rg ENOENT` and their crash was
  // indistinguishable, to this runner, from the known failure they were
  // baselined for.
  if (code === 2) {
    nowFailing.push(gate.script);
    console.error(`\n[ga-gate/run-all] ❌ MISCONFIGURED (exit 2, never excusable as debt): ${gate.name}`);
    anyFailed = true;
    continue;
  }

  if (code !== 0) {
    nowFailing.push(gate.script);
    const known = baseline.has(gate.script);
    console.error(
      `\n[ga-gate/run-all] ${known ? '🟡 KNOWN-DEBT' : '❌ REGRESSION'}: ${gate.name} (exit ${code})`,
    );
    if (!known) anyFailed = true;
  } else {
    nowPassing.push(gate.script);
    console.log(`[ga-gate/run-all] ✅ PASSED: ${gate.name}`);
  }
}

// Shrink-only enforcement: a gate on the baseline that now passes MUST be removed.
const fixedButStillDeclared = [...baseline].filter((s) => nowPassing.includes(s));
if (fixedButStillDeclared.length > 0) {
  console.error(
    `\n[ga-gate/run-all] ❌ BASELINE IS STALE — ${fixedButStillDeclared.length} gate(s) now PASS but are still`
    + ' declared as debt. Remove them from tools/ga-gate/gate-debt.json:\n'
    + fixedButStillDeclared.map((s) => `    - ${s}`).join('\n')
    + '\n  (The ratchet only means anything if paid debt leaves the ledger.)',
  );
  anyFailed = true;
}

console.log(
  `\n[ga-gate/run-all] ── ${nowPassing.length} passing · ${nowFailing.length} failing `
  + `(${nowFailing.filter((s) => baseline.has(s)).length} declared debt, `
  + `${nowFailing.filter((s) => !baseline.has(s)).length} regression) ──`,
);

// ── INFORMATIONAL SECTION — convergence booleans (R4) ────────────────────────
// Not a PR gate. Booleans #7–#9 require external infrastructure (npm publish,
// marketplace DNS, Stripe webhook) — they will show FALSE until Phase F-3 human
// actions are complete. The suite always continues regardless of exit code.
// Recommendation: PRYZM3-FULL-AUDIT-2026-05-14 §25 R4 — informational post-deploy check.
console.log('\n[ga-gate/run-all] ── Informational: convergence booleans (R4) ──');
const convScriptPath = join(__dir, '../../scripts/check/check-pryzm3-exists.ts');
const convResult = spawnGate(convScriptPath);
if ((convResult.status ?? 1) !== 0) {
  console.log('[ga-gate/run-all] ℹ️  Some convergence booleans FALSE (infra-pending items #7–#9 expected).');
} else {
  console.log('[ga-gate/run-all] ℹ️  All 9 convergence booleans TRUE. ✅');
}
console.log('[ga-gate/run-all] ────────────────────────────────────────────────\n');

const GATE_COUNT = GATES.length;
const declaredDebt = nowFailing.filter((s) => baseline.has(s)).length;

if (anyFailed) {
  console.error(`\n[ga-gate/run-all] BLOCKED — a gate regressed, or the debt baseline is stale. Fix the above before merging.`);
  process.exit(1);
}

// ⚠ THIS MESSAGE MUST NOT SAY "ALL GREEN" WHILE GATES ARE FAILING.
// The pre-ratchet version printed "All 25 gates green ✅" on exit 0, which after
// the ratchet landed would have been a lie: 16 gates fail, they are merely
// TOLERATED. Reporting tolerated debt as success is the §CONTEXT-DATA-HONESTY
// failure this repo keeps paying for — it is how the 16 became invisible in the
// first place. Exit 0 here means "no REGRESSION", never "no problems".
if (declaredDebt > 0) {
  console.log(
    `\n[ga-gate/run-all] ✅ NO REGRESSION — ${nowPassing.length}/${GATE_COUNT} gates pass.`
    + `\n[ga-gate/run-all] ⚠ ${declaredDebt} gate(s) still FAIL as declared debt (tools/ga-gate/gate-debt.json).`
    + `\n[ga-gate/run-all]   C01 §5 requires ALL gates to pass. That is not yet true — this run did not verify it.`,
  );
} else {
  console.log(`\n[ga-gate/run-all] All ${GATE_COUNT} gates green, zero declared debt. ✅ C01 §5 satisfied.`);
}
process.exit(0);
