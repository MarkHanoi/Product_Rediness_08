// PRYZM-EARTH-ONBOARDING PRD Milestone 1 (docs/03-execution/plans/
// PRYZM-EARTH-ONBOARDING-PRD-2026-08-06.md §10, §12 conflict #1) — regression
// test for the auto-generated placeholder name used when "+ New Project"
// bypasses the name/description/type modal and hands off straight to guided
// onboarding.
//
// SCOPE NOTE: `apps/editor/vitest.config.ts` runs its suites under
// `environment: 'node'` deliberately (several other suites assert
// node-shaped behaviour, e.g. `bootstrap.data.test.ts:85` — no DOM globals).
// `ProjectHub.ts` itself is un-importable under this config: it transitively
// pulls in DOM-constructing modules at import time (`./AppTheme` →
// `ViewTabBar.ts` calls `document.createElement` from a constructor reached
// at module-scope), confirmed by actually running this suite against
// `../src/ui/platform/ProjectHub.js` first (`ReferenceError: document is not
// defined` from `ViewTabBar.ts:90`). That is exactly why the auto-naming
// logic Milestone 1 introduces lives in its own DOM-free module,
// `projectAutoName.ts` (`ProjectHub.ts` imports and re-exports it) — so it can
// be unit-tested directly, without a jsdom harness this suite's config
// deliberately avoids introducing. The click-handler wiring itself (three
// entry points now calling `startGuidedOnboardingDirect` instead of
// `openNewModal`) is a small, directly-readable diff in `ProjectHub.ts`
// reviewed alongside this test rather than DOM-simulated here.

import { describe, expect, it } from 'vitest';
import { generateUntitledSiteName } from '../src/ui/platform/projectAutoName.js';

describe('generateUntitledSiteName (PRYZM Earth Milestone 1 auto-naming)', () => {
  it('produces the "Untitled Site — <timestamp>" placeholder format', () => {
    const name = generateUntitledSiteName(new Date(2026, 7, 6, 9, 5)); // Aug 6 2026, 09:05
    expect(name).toBe('Untitled Site — 2026-08-06 09:05');
  });

  it('zero-pads single-digit month/day/hour/minute', () => {
    const name = generateUntitledSiteName(new Date(2026, 0, 2, 3, 4)); // Jan 2 2026, 03:04
    expect(name).toBe('Untitled Site — 2026-01-02 03:04');
  });

  it('is deterministic for a given Date (no hidden randomness/locale dependency)', () => {
    const d = new Date(2027, 11, 31, 23, 59);
    expect(generateUntitledSiteName(d)).toBe(generateUntitledSiteName(new Date(d.getTime())));
  });

  it('defaults to the current time when no Date is supplied', () => {
    const before = Date.now();
    const name = generateUntitledSiteName();
    const after = Date.now();
    expect(name.startsWith('Untitled Site — ')).toBe(true);
    // Sanity: the embedded year matches "now" (avoids a stale/mocked clock bug).
    const nowYear = new Date(before <= after ? after : before).getFullYear();
    expect(name).toContain(String(nowYear));
  });

  it('never returns an empty or whitespace-only name (the auto-create path relies on a non-blank name)', () => {
    const name = generateUntitledSiteName();
    expect(name.trim().length).toBeGreaterThan('Untitled Site — '.length);
  });
});
