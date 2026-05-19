// @pryzm/wcag-audit — critical-path declarations (S70 D6, ADR-0052 §B.2).
//
// PHASE-3D §S70 row #5 names four critical paths.  This module is the
// machine-readable shape so the audit doc + the smoke gate share one
// source of truth.

export type CriticalPathId = 'project-hub' | 'editor' | 'inspector' | 'sheet-view';

export interface CriticalPath {
  readonly id: CriticalPathId;
  readonly title: string;
  /** Route under the editor SPA; '/' for marketing landing. */
  readonly route: string;
  /** CSS selectors that MUST be present + accessible per the path. */
  readonly requiredSelectors: readonly string[];
  /** Sprint pointer for the audit-status row (when the path becomes
   *  fully testable). */
  readonly auditableSince: string;
  /** Notes pointing to the deferral row in the audit doc. */
  readonly deferralNote?: string;
}

export const CRITICAL_PATHS: readonly CriticalPath[] = Object.freeze([
  {
    id: 'project-hub',
    title: 'Project Hub',
    route: '/',
    requiredSelectors: ['#platform-root', 'main, [role="main"]', '[aria-label*="project" i], h1'],
    auditableSince: 'S70 D7',
    deferralNote: 'Marketing landing audited today; the discrete project-hub UI lands at S71 marketing-site polish — full audit at that sprint.',
  },
  {
    id: 'editor',
    title: 'Editor (3D viewport boot shell)',
    route: '/?pryzm2=1',
    requiredSelectors: ['#dck-workspace', '#container', 'main, [role="main"]'],
    auditableSince: 'S70 D7',
  },
  {
    id: 'inspector',
    title: 'Inspector panel',
    route: '/?pryzm2=1#inspector',
    requiredSelectors: ['#dck-right-dock', '[role="region"], aside'],
    auditableSince: 'S71',
    deferralNote: 'Inspector panel surface is stub-only at S70 in PRYZM 2; full a11y audit at S71 when the surface ships.',
  },
  {
    id: 'sheet-view',
    title: 'Sheet view',
    route: '/?pryzm2=1#sheet',
    requiredSelectors: ['main, [role="main"]', '[role="region"], section'],
    auditableSince: 'S71',
    deferralNote: 'Sheet view surface is stub-only at S70 in PRYZM 2; full a11y audit at S71 when the surface ships.',
  },
]);
