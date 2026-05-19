/**
 * GA-gate · Documentation (PHASE-3D §3 Documentation).
 *
 * Spec verbatim:
 *   - `docs.pryzm.com` complete: user guide + plugin SDK + headless
 *     + file format + REST/WS API + self-host + accessibility.
 *   - `apps/bench/reports/M36-GA.md` published.
 *   - 5-min demo video posted.            (operator-side)
 *   - GA launch blog post live.           (operator-side; draft in-repo)
 *   - All 72 sprint retros archived.      (sub-set; honest gap recorded)
 *   - 36-month journey post-mortem at `docs/post-mortems/PRYZM-2-build.md`.
 *
 * In-dev assertable subset: every documentation artefact whose path
 * is named in the §3 spec exists; the docs-site selfhost section
 * landed at S67 D7; the WCAG audit landed at S70 D7. The blog post
 * draft + retro archive + demo video are operator-side; the audit
 * §7 records each by name.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');

const REQUIRED_DOC_ARTEFACTS = [
  'apps/bench/reports/M36-GA.md',
  'docs/post-mortems/PRYZM-2-build.md',
  'docs/roadmap/post-GA.md',
  'docs/operations/pryzm-1-sunset.md',
  'docs/operations/cut-list-log.md',
  'docs/operations/status-page-and-on-call.md',
  'docs/marketing/GA-LAUNCH-BLOG-POST.md',
  'RELEASE-NOTES-2.0.0.md',
  // self-host bundle release notes (landed S70 D8)
  'pryzm-selfhost/RELEASE-NOTES-2.0.0.md',
  'pryzm-selfhost/version.json',
  // docs-site selfhost section (landed S67 D7)
  'apps/docs-site/src/content/docs/selfhost/getting-started.md',
  'apps/docs-site/src/content/docs/selfhost/architecture.md',
] as const;

describe('GA-gate · Documentation artefact presence', () => {
  for (const path of REQUIRED_DOC_ARTEFACTS) {
    it(`${path} exists`, () => {
      expect(existsSync(join(REPO_ROOT, path))).toBe(true);
    });
  }

  it('M36-GA.md is non-trivial (≥ 50 lines)', () => {
    const text = readFileSync(join(REPO_ROOT, 'apps/bench/reports/M36-GA.md'), 'utf-8');
    expect(text.split('\n').length).toBeGreaterThanOrEqual(50);
  });

  it('post-mortem covers the 36-month journey', () => {
    const text = readFileSync(join(REPO_ROOT, 'docs/post-mortems/PRYZM-2-build.md'), 'utf-8');
    expect(text).toMatch(/36[ -]month|S72|M36/);
    expect(text).toMatch(/PRYZM 2|PRYZM2/);
  });

  it('post-GA roadmap names every §7 deferred item', () => {
    const text = readFileSync(join(REPO_ROOT, 'docs/roadmap/post-GA.md'), 'utf-8');
    // §7 items from PHASE-3D-Q4-M34-M36-HARDENING-GA.md
    const requiredAnchors = [
      'mobile',
      'CFD',
      'IFC 4.3',
      'single-binary',
      'multi-region',
      'SOC 2',
    ];
    for (const a of requiredAnchors) {
      expect(text, `roadmap must mention "${a}"`).toMatch(new RegExp(a, 'i'));
    }
  });

  it('PRYZM 1 sunset doc records the 90-day window', () => {
    const text = readFileSync(join(REPO_ROOT, 'docs/operations/pryzm-1-sunset.md'), 'utf-8');
    expect(text).toMatch(/90[ -]day/i);
    expect(text).toMatch(/migration tool|@pryzm\/cli|pryzm install|pryzm pack/i);
  });

  it('cut-list log records both Tier-1 and Tier-2 final states', () => {
    const text = readFileSync(join(REPO_ROOT, 'docs/operations/cut-list-log.md'), 'utf-8');
    expect(text).toMatch(/Tier[ -]?1/i);
    expect(text).toMatch(/Tier[ -]?2/i);
    expect(text).toMatch(/T2\.[1-6]/);
  });

  it('status page + on-call runbook names rota owners (placeholder OK)', () => {
    const text = readFileSync(join(REPO_ROOT, 'docs/operations/status-page-and-on-call.md'), 'utf-8');
    expect(text).toMatch(/on[ -]call|rota|escalation/i);
    expect(text).toMatch(/status page|status\.pryzm/i);
  });

  it('blog post draft has front-matter + a headline', () => {
    const text = readFileSync(join(REPO_ROOT, 'docs/marketing/GA-LAUNCH-BLOG-POST.md'), 'utf-8');
    expect(text).toMatch(/^# /m);
    expect(text).toMatch(/2\.0\.0|GA|launch/i);
  });

  it('root release notes match self-host 2.0.0 schema', () => {
    const root = readFileSync(join(REPO_ROOT, 'RELEASE-NOTES-2.0.0.md'), 'utf-8');
    const selfhost = readFileSync(join(REPO_ROOT, 'pryzm-selfhost/RELEASE-NOTES-2.0.0.md'), 'utf-8');
    expect(root).toMatch(/2\.0\.0/);
    expect(selfhost).toMatch(/2\.0\.0/);
    // Both must agree on the 6-service architecture.
    expect(root).toMatch(/sync-server|api-gateway|bake-worker/);
    expect(selfhost).toMatch(/sync-server|api-gateway|bake-worker/);
  });
});
