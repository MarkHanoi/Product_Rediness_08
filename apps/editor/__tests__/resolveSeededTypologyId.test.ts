// PRYZM-EARTH-ONBOARDING PRD Phase 2 (docs/03-execution/plans/
// PRYZM-EARTH-ONBOARDING-PRD-2026-08-06.md §14) — regression test for the
// routing decision that lets "+ New Project" (no-modal, `directEntry: true`)
// skip the RAC role/typology chat and land straight on the `location` step
// (PRYZM Earth), while leaving every other onboarding entry point (legacy
// modal-seeded, anonymous "Build something") asking as before.
//
// SCOPE NOTE: mirrors `projectHubAutoNamedOnboarding.test.ts`'s rationale —
// `PlatformRouter.ts` is un-importable under this app's node-environment
// vitest config (it transitively pulls DOM-constructing modules at import
// time via `ProjectHub`/`LandingPage`/`AuthModal`), so the pure routing
// decision was extracted into `resolveSeededTypologyId.ts` specifically so it
// can be unit-tested directly, without a jsdom harness.

import { describe, expect, it } from 'vitest';
import { resolveSeededTypologyId, typologyForProjectType } from '../src/ui/platform/resolveSeededTypologyId.js';

const registryHasAll = () => true;
const registryHasNone = () => false;

describe('resolveSeededTypologyId (PRYZM Earth Phase 2 — RAC-skip routing)', () => {
    it('directEntry with no projectType defaults to "apartment" (the no-modal "+ New Project" path)', () => {
        expect(resolveSeededTypologyId({ directEntry: true }, registryHasAll)).toBe('apartment');
    });

    it('directEntry with no projectType still defaults to "apartment" even when the registry is degraded', () => {
        // The default is NOT gated on registry.has() — it must never leave the
        // guided "+ New Project" gesture stranded on RAC just because the
        // registry lookup is unavailable.
        expect(resolveSeededTypologyId({ directEntry: true }, registryHasNone)).toBe('apartment');
    });

    it('directEntry with an undefined seed object still defaults to "apartment"', () => {
        expect(resolveSeededTypologyId({ directEntry: true, projectType: undefined }, registryHasAll)).toBe('apartment');
    });

    it('NOT directEntry, no projectType — resolves undefined (RAC still asks); the anonymous "Build something" / no-seed path', () => {
        expect(resolveSeededTypologyId(undefined, registryHasAll)).toBeUndefined();
        expect(resolveSeededTypologyId({}, registryHasAll)).toBeUndefined();
    });

    it('directEntry is irrelevant once a projectType resolves confidently — the explicit mapping wins', () => {
        expect(resolveSeededTypologyId({ directEntry: true, projectType: 'house' }, registryHasAll)).toBe('casa-unifamiliar');
    });

    it('legacy modal-seeded path (no directEntry) still resolves a confident projectType mapping', () => {
        expect(resolveSeededTypologyId({ projectType: 'commercial' }, registryHasAll)).toBe('office-building');
    });

    it('legacy modal-seeded path with an unrecognised projectType and no directEntry resolves undefined (RAC asks)', () => {
        expect(resolveSeededTypologyId({ projectType: 'mixed-use' }, registryHasAll)).toBeUndefined();
    });
});

describe('typologyForProjectType (unchanged O.5 mapping, re-verified after extraction)', () => {
    it('maps apartment only when the registry has it', () => {
        expect(typologyForProjectType('apartment', registryHasAll)).toBe('apartment');
        expect(typologyForProjectType('apartment', registryHasNone)).toBeUndefined();
    });

    it('maps house/casa variants to casa-unifamiliar when registered', () => {
        expect(typologyForProjectType('house', registryHasAll)).toBe('casa-unifamiliar');
        expect(typologyForProjectType('casa', registryHasAll)).toBe('casa-unifamiliar');
        expect(typologyForProjectType('casa-unifamiliar', registryHasAll)).toBe('casa-unifamiliar');
    });

    it('maps commercial/office variants to office-building regardless of registry (not registry-gated)', () => {
        expect(typologyForProjectType('commercial', registryHasNone)).toBe('office-building');
        expect(typologyForProjectType('office', registryHasNone)).toBe('office-building');
        expect(typologyForProjectType('office-building', registryHasNone)).toBe('office-building');
        expect(typologyForProjectType('commercial-office', registryHasNone)).toBe('office-building');
    });

    it('maps residential-multifamily regardless of registry (not registry-gated)', () => {
        expect(typologyForProjectType('residential-multifamily', registryHasNone)).toBe('residential-multifamily');
    });

    it('returns undefined for an empty/undefined projectType', () => {
        expect(typologyForProjectType(undefined, registryHasAll)).toBeUndefined();
        expect(typologyForProjectType('', registryHasAll)).toBeUndefined();
    });

    it('returns undefined for an unrecognised projectType', () => {
        expect(typologyForProjectType('mixed-use', registryHasAll)).toBeUndefined();
    });

    it('is case/whitespace tolerant', () => {
        expect(typologyForProjectType('  Apartment  ', registryHasAll)).toBe('apartment');
        expect(typologyForProjectType('HOUSE', registryHasAll)).toBe('casa-unifamiliar');
    });
});
