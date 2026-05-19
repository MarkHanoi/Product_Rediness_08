/**
 * GA-gate · Quality (PHASE-3D §3 Quality).
 *
 * Spec verbatim:
 *   - Zero P0 / P1 bugs open.
 *   - Pen test report clean.            (operator-side, S68 R3D-02)
 *   - HoundDog scan clean.              (S68 D7 baseline = 0 findings)
 *   - SAST clean.                       (operator-side re-run S68 D8)
 *   - WCAG 2.2 AA on critical paths.    (S70 D7)
 *   - Browser matrix green.             (operator-side live runs)
 *
 * In-dev assertable subset: every quality artefact required by §3
 * exists in-repo. Live verification gates (pen test, SAST re-run,
 * browser matrix live runs, P0/P1 zero) are operator-side and
 * recorded in the S72 audit §7.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');

const REQUIRED_QUALITY_ARTEFACTS = [
  // S68 security posture (7 docs + 1 ADR)
  'docs/security/csp-audit-2026-Q4.md',
  'docs/security/plugin-sandbox-audit-2026-Q4.md',
  'docs/security/rls-audit-2026-Q4.md',
  'docs/security/oauth2-review-2026-Q4.md',
  'docs/security/saml-scim-mappings.md',
  'docs/security/secret-rotation-playbook.md',
  'docs/security/scans-2026-Q4-baseline.md',
  'docs/architecture/adr/0050-s68-security-hardening-posture.md',
  // S70 WCAG audit
  'docs/accessibility/wcag-2.2-aa-audit-2026-04-28.md',
] as const;

describe('GA-gate · Quality artefact presence', () => {
  for (const path of REQUIRED_QUALITY_ARTEFACTS) {
    it(`${path} exists`, () => {
      expect(existsSync(join(REPO_ROOT, path))).toBe(true);
    });
  }

  it('HoundDog scan baseline records "0 findings"', () => {
    const text = readFileSync(join(REPO_ROOT, 'docs/security/scans-2026-Q4-baseline.md'), 'utf-8');
    expect(text).toMatch(/HoundDog/);
    expect(text).toMatch(/0 findings|clean|no findings/i);
  });

  it('CSP audit records the editor-SPA strict default', () => {
    const text = readFileSync(join(REPO_ROOT, 'docs/security/csp-audit-2026-Q4.md'), 'utf-8');
    expect(text).toContain("default-src 'self'");
    expect(text).toContain("frame-ancestors 'self'");
  });

  it('WCAG audit declares re-audit cadence', () => {
    const text = readFileSync(join(REPO_ROOT, 'docs/accessibility/wcag-2.2-aa-audit-2026-04-28.md'), 'utf-8');
    expect(text).toMatch(/re-audit cadence|every-sprint smoke|quarterly/i);
  });

  it('plugin sandbox audit confirms allow-scripts without allow-same-origin (K3-C)', () => {
    const text = readFileSync(join(REPO_ROOT, 'docs/security/plugin-sandbox-audit-2026-Q4.md'), 'utf-8');
    expect(text).toContain('allow-scripts');
    expect(text).not.toMatch(/allow-same-origin\b(?!.*not allowed|.*forbidden)/);
  });
});

describe('GA-gate · S72 release artefacts', () => {
  /**
   * The S72 close lands one ADR + one sprint report + one audit
   * + the M36-GA milestone bench roll-up. All four are §3-blocking.
   */
  const S72_DELIVERABLES = [
    'docs/architecture/adr/0054-s72-m36-ga-launch-gate.md',
    'apps/bench/reports/S72-m36-ga-launch-gate-2026-04-28.md',
    'docs/00_NEW_ARCHITECTURE/audits/PHASE-3D-S72-M36-GA-LAUNCH-GATE-2026-04-28.md',
    'apps/bench/reports/M36-GA.md',
  ] as const;

  for (const path of S72_DELIVERABLES) {
    it(`${path} exists`, () => {
      expect(existsSync(join(REPO_ROOT, path))).toBe(true);
    });
  }
});
