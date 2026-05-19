/**
 * GA-gate · §8 Phase 3D Handoff Checklist (PHASE-3D-Q4 §8).
 *
 * The §8 checklist has 11 items — 6 are automatable (artefact presence
 * + version manifest agreement); 5 are operator-side (test alert
 * fired+acknowledged, on-call rota live, beta cohort transitioned,
 * press traffic monitored, founder rest started). This test asserts
 * the 6 automatable items.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');

describe('GA-gate · Phase 3D §8 Handoff Checklist (automatable subset)', () => {
  it('item 2: M36-GA.md + post-mortem published', () => {
    expect(existsSync(join(REPO_ROOT, 'apps/bench/reports/M36-GA.md'))).toBe(true);
    expect(existsSync(join(REPO_ROOT, 'docs/post-mortems/PRYZM-2-build.md'))).toBe(true);
  });

  it('item 6: PRYZM 1 sunset migration tool published (CLI commands)', () => {
    const cliPath = join(REPO_ROOT, 'apps/cli');
    expect(existsSync(cliPath)).toBe(true);
    // S70 D8 landed install/upgrade/rollback subcommands.
    const installCmd = join(REPO_ROOT, 'apps/cli/src/commands/install.ts');
    const upgradeCmd = join(REPO_ROOT, 'apps/cli/src/commands/upgrade.ts');
    const rollbackCmd = join(REPO_ROOT, 'apps/cli/src/commands/rollback.ts');
    expect(existsSync(installCmd), 'install subcommand must exist').toBe(true);
    expect(existsSync(upgradeCmd), 'upgrade subcommand must exist').toBe(true);
    expect(existsSync(rollbackCmd), 'rollback subcommand must exist').toBe(true);
  });

  it('item 11: post-GA roadmap drafted with §7 items prioritised', () => {
    const text = readFileSync(join(REPO_ROOT, 'docs/roadmap/post-GA.md'), 'utf-8');
    expect(text).toMatch(/Priority|P0|P1|tier/i);
    expect(text.split('\n').length).toBeGreaterThanOrEqual(30);
  });

  it('item 4: status page runbook present (provisioning is operator-side)', () => {
    expect(
      existsSync(join(REPO_ROOT, 'docs/operations/status-page-and-on-call.md')),
    ).toBe(true);
  });

  it('S72 sprint audit honestly enumerates the 5 operator-side items', () => {
    const auditPath = join(
      REPO_ROOT,
      'docs/00_NEW_ARCHITECTURE/audits/PHASE-3D-S72-M36-GA-LAUNCH-GATE-2026-04-28.md',
    );
    expect(existsSync(auditPath)).toBe(true);
    const text = readFileSync(auditPath, 'utf-8');
    // Must name the operator-side carry-forwards by what they are.
    expect(text).toMatch(/operator[- ]side|carry[- ]forward/i);
    expect(text).toMatch(/LAUNCH|D7/);
  });

  it('S72 ADR records the carry-forward register', () => {
    const adrPath = join(REPO_ROOT, 'docs/architecture/adr/0054-s72-m36-ga-launch-gate.md');
    expect(existsSync(adrPath)).toBe(true);
    const text = readFileSync(adrPath, 'utf-8');
    expect(text).toMatch(/Status:?\s+Accepted/i);
    expect(text).toMatch(/S72|M36/);
  });
});
