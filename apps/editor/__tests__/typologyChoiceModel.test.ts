// §TYPOLOGY-CHOICE-AT-CONFIRM — REACHABILITY tests for the onboarding typology chooser.
//
// The point of this suite is NOT "does a generator exist" (the codebase's recurring
// authored-but-unwired trap: capability that was written, tested and never connected).
// It is: for every typology the chooser OFFERS, does the SAME resolver the
// OnboardingStepController dispatches on return a wired generate route? A menu entry
// that silently no-ops is worse than a missing entry — failure and empty look identical.
//
// So the suite drives the REAL pack manifests (the ones composeRuntime registers)
// through the REAL route resolver (the one `generateAndFinish` switches on).

import { describe, it, expect } from 'vitest';
import { APARTMENT_MANIFEST } from '@pryzm/typology-pack-apartment';
import { CASA_UNIFAMILIAR_MANIFEST } from '@pryzm/typology-pack-casa-unifamiliar';
import { RESIDENTIAL_BUILDING_MANIFEST } from '@pryzm/typology-pack-residential-building';
import { OFFICE_BUILDING_MANIFEST } from '@pryzm/typology-pack-office-building';
import {
    resolveGenerateRoute,
    buildTypologyChoices,
    permittedUseForCategory,
    zoningAdvisoryFor,
    GENERATE_ROUTES,
} from '../src/ui/onboarding/typologyChoiceModel';

const ALL_MANIFESTS = [
    APARTMENT_MANIFEST,
    CASA_UNIFAMILIAR_MANIFEST,
    RESIDENTIAL_BUILDING_MANIFEST,
    OFFICE_BUILDING_MANIFEST,
];

describe('typologyChoiceModel — reachability (authored ≠ wired)', () => {
    it('every registered first-party pack resolves to a wired generate route', () => {
        for (const m of ALL_MANIFESTS) {
            const route = resolveGenerateRoute(m.id);
            expect(route, `pack "${m.id}" has no wired generate route`).not.toBeNull();
            expect(GENERATE_ROUTES).toContain(route!);
        }
    });

    it('the four founder-requested typologies each map to a DISTINCT route', () => {
        const routes = ALL_MANIFESTS.map((m) => resolveGenerateRoute(m.id));
        expect(new Set(routes).size).toBe(4);
    });

    it('routes the legacy alias ids the pre-existing dispatch already understood', () => {
        // §RESI-MULTIFAMILY shipped with the routing id `residential-multifamily`
        // while the registered pack id is `residential-building`. BOTH must route,
        // or a brief captured under either id silently generates nothing.
        expect(resolveGenerateRoute('residential-multifamily')).toBe('residential-building');
        expect(resolveGenerateRoute('residential-building')).toBe('residential-building');
        expect(resolveGenerateRoute('office')).toBe('office');
        expect(resolveGenerateRoute('office-building')).toBe('office');
    });

    it('returns null — never a default — for a typology with no wired generator', () => {
        // Silently falling back to the apartment generator is the exact defect this
        // guards: the user picks X and gets Y with no statement that it happened.
        expect(resolveGenerateRoute('gym')).toBeNull();
        expect(resolveGenerateRoute('')).toBeNull();
        expect(resolveGenerateRoute(undefined)).toBeNull();
    });
});

describe('typologyChoiceModel — the chooser only offers what it can build', () => {
    it('offers all four registered packs', () => {
        const choices = buildTypologyChoices(ALL_MANIFESTS);
        expect(choices.map((c) => c.id)).toEqual([
            'apartment',
            'casa-unifamiliar',
            'residential-building',
            'office-building',
        ]);
    });

    it('drops any pack whose generator is not wired, rather than rendering a dead button', () => {
        const unwired = { ...APARTMENT_MANIFEST, id: 'gym', displayName: 'Gym' };
        const choices = buildTypologyChoices([...ALL_MANIFESTS, unwired]);
        expect(choices.map((c) => c.id)).not.toContain('gym');
        expect(choices).toHaveLength(4);
    });

    it('carries the pack-declared label + a route for every choice', () => {
        for (const c of buildTypologyChoices(ALL_MANIFESTS)) {
            expect(c.label.length).toBeGreaterThan(0);
            expect(c.noun.length).toBeGreaterThan(0);
            expect(GENERATE_ROUTES).toContain(c.route);
        }
    });
});

describe('typologyChoiceModel — zoning advisory (C58 §10.2 is PENDING: advise, never gate)', () => {
    it('maps the pack-declared category onto the C58 permitted-use vocabulary', () => {
        expect(permittedUseForCategory('residential')).toBe('residential');
        expect(permittedUseForCategory('workplace')).toBe('commercial');
        // A category with no defensible use-class mapping must say so, not guess.
        expect(permittedUseForCategory('specialist')).toBeNull();
    });

    it('UNRESOLVED zoning reads differently from a FORBIDDEN use', () => {
        const unresolved = zoningAdvisoryFor('residential', null);
        const empty = zoningAdvisoryFor('residential', { permittedUse: [] });
        const conflict = zoningAdvisoryFor('residential', { permittedUse: ['commercial'] });

        expect(unresolved.kind).toBe('unresolved');
        expect(empty.kind).toBe('unresolved');
        expect(conflict.kind).toBe('conflict');

        // The whole point: "we don't know" and "it's not allowed" must never render
        // as the same sentence (§CONTEXT-DATA-HONESTY — failure and empty are the
        // same VALUE, so they must not be the same MESSAGE).
        expect(unresolved.message).not.toBe(conflict.message);
        expect(unresolved.message.toLowerCase()).toContain("haven't");
        expect(conflict.message.toLowerCase()).toContain('recorded');
    });

    it('stays silent when the resolved zoning permits the chosen use', () => {
        const ok = zoningAdvisoryFor('residential', { permittedUse: ['residential', 'mixed'] });
        expect(ok.kind).toBe('permitted');
        expect(ok.message).toBe('');
    });

    it("treats 'mixed' zoning as permitting any use class", () => {
        expect(zoningAdvisoryFor('workplace', { permittedUse: ['mixed'] }).kind).toBe('permitted');
    });

    it('never reports a conflict for a category it cannot classify', () => {
        // No mapping ⇒ no claim. Inventing one would be the L-669 defect (UI stating
        // a constraint no engine computed).
        expect(zoningAdvisoryFor('specialist', { permittedUse: ['residential'] }).kind)
            .toBe('unresolved');
    });

    it('is advisory only — no advisory kind blocks generation', () => {
        for (const env of [null, { permittedUse: [] }, { permittedUse: ['industrial'] as const }]) {
            expect(zoningAdvisoryFor('residential', env).blocksGeneration).toBe(false);
        }
    });
});
