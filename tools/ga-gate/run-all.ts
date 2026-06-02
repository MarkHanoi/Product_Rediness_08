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
 *   20. check-xss-guards.ts                 — innerHTML interpolation safety ratchet (P0/OI-051)
 *   21. check-custom-event-apps.ts          — CustomEvent dispatches in apps/editor/src/ (OI-050 / Phase F.events.2)
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
  { name: 'xss-guards (P0/OI-051)',                   script: 'check-xss-guards.ts' },
  { name: 'custom-event-apps (OI-050/F.events.2)',    script: 'check-custom-event-apps.ts' },
];

let anyFailed = false;

console.log('[ga-gate/run-all] Running all GA convergence gates...\n');

for (const gate of GATES) {
  const scriptPath = join(__dir, gate.script);
  const result = spawnSync('npx', ['tsx', scriptPath], {
    stdio: 'inherit',
    encoding: 'utf8',
  });
  const code = result.status ?? 1;
  if (code !== 0) {
    console.error(`\n[ga-gate/run-all] ❌ FAILED: ${gate.name} (exit ${code})`);
    anyFailed = true;
  } else {
    console.log(`[ga-gate/run-all] ✅ PASSED: ${gate.name}`);
  }
}

// ── INFORMATIONAL SECTION — convergence booleans (R4) ────────────────────────
// Not a PR gate. Booleans #7–#9 require external infrastructure (npm publish,
// marketplace DNS, Stripe webhook) — they will show FALSE until Phase F-3 human
// actions are complete. The suite always continues regardless of exit code.
// Recommendation: PRYZM3-FULL-AUDIT-2026-05-14 §25 R4 — informational post-deploy check.
console.log('\n[ga-gate/run-all] ── Informational: convergence booleans (R4) ──');
const convScriptPath = join(__dir, '../../scripts/check/check-pryzm3-exists.ts');
const convResult = spawnSync('npx', ['tsx', convScriptPath], { stdio: 'inherit', encoding: 'utf8' });
if ((convResult.status ?? 1) !== 0) {
  console.log('[ga-gate/run-all] ℹ️  Some convergence booleans FALSE (infra-pending items #7–#9 expected).');
} else {
  console.log('[ga-gate/run-all] ℹ️  All 9 convergence booleans TRUE. ✅');
}
console.log('[ga-gate/run-all] ────────────────────────────────────────────────\n');

const GATE_COUNT = GATES.length;
if (anyFailed) {
  console.error(`\n[ga-gate/run-all] One or more of ${GATE_COUNT} gates failed. Fix the above before merging.`);
  process.exit(1);
} else {
  console.log(`\n[ga-gate/run-all] All ${GATE_COUNT} gates green. ✅`);
  process.exit(0);
}
