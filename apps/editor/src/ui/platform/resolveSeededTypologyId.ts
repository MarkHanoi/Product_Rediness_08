// PRYZM-EARTH-ONBOARDING PRD Phase 2 (docs/03-execution/plans/
// PRYZM-EARTH-ONBOARDING-PRD-2026-08-06.md §14) — the pure typology-seed
// resolution `PlatformRouter.showOnboarding()` uses to decide whether the RAC
// role/typology chat can be skipped.
//
// Deliberately its OWN file, with zero DOM/THREE/I-O imports (mirrors
// `projectAutoName.ts`'s rationale, Milestone 1): `PlatformRouter.ts`
// transitively pulls in DOM-constructing modules at import time (`ProjectHub`,
// `LandingPage`, `AuthModal`, …), which makes it un-importable under this app's
// node-environment vitest config (`apps/editor/vitest.config.ts` — deliberately
// `environment: 'node'`). Keeping this pure function isolated here lets the
// Phase 2 routing decision be unit-tested directly without a DOM harness.

import { trace } from '@opentelemetry/api';

const _tracer = trace.getTracer('pryzm.platform.router');

/** The New-Project modal's legacy "Project Type" select value → registered
 *  typology id mapping. Mirrors `PlatformRouter._typologyForProjectType` 1:1
 *  (kept in sync manually — see that method's own comments for why each
 *  mapping exists); duplicated here rather than imported so this module stays
 *  free of any import that could pull DOM-constructing code in transitively. */
export function typologyForProjectType(
    projectType: string | undefined,
    registryHas: (id: string) => boolean,
): string | undefined {
    if (!projectType) return undefined;
    const v = projectType.trim().toLowerCase();
    if (v === 'residential-multifamily') return 'residential-multifamily';
    if (v === 'commercial' || v === 'office' || v === 'office-building' || v === 'commercial-office') {
        return 'office-building';
    }
    let candidate: string | undefined;
    if (v === 'apartment') candidate = 'apartment';
    else if (v === 'casa-unifamiliar' || v === 'house' || v === 'casa') candidate = 'casa-unifamiliar';
    if (candidate && registryHas(candidate)) return candidate;
    return undefined;
}

/**
 * Resolve the typology id `showOnboarding()` seeds the RAC-skip path with.
 *
 * PRYZM-EARTH-ONBOARDING PRD Phase 2 — founder-confirmed override of Phase 1
 * §13.3's deferral ("the goal ... is after click new project - go directly to
 * PRYZM EARTH"). `directEntry: true` (set only by ProjectHub's no-modal
 * "+ New Project" gesture) means there is no seeded project type to resolve —
 * the modal that used to seed one is gone (Milestone 1). Rather than build a
 * new typology-DEFERRED generate path (a materially larger change the PRD
 * itself warns against bundling into one pass, §10 "Explicitly rejected as a
 * milestone shape"), this defaults to the one shipped, always-available
 * generator (`'apartment'`) so the EXISTING authed+seededTypologyId bypass in
 * `showOnboarding` fires and the RAC role/typology chat is skipped entirely —
 * landing the user straight on the `location` step (the PRYZM Earth globe).
 *
 * Returns `undefined` (⇒ RAC still asks) for every other path: the legacy
 * modal-seeded flow with no confident typology mapping, and the anonymous
 * "Build something" RAC entry (no `directEntry`).
 *
 * Exported (not inline) per P8 — every new exported function carries at least
 * one OTel span.
 */
export function resolveSeededTypologyId(
    seed: { projectType?: string; directEntry?: boolean } | undefined,
    registryHas: (id: string) => boolean,
): string | undefined {
    const span = _tracer.startSpan('pryzm.platform.router.resolveSeededTypologyId');
    try {
        return typologyForProjectType(seed?.projectType, registryHas) ?? (seed?.directEntry ? 'apartment' : undefined);
    } finally {
        span.end();
    }
}
