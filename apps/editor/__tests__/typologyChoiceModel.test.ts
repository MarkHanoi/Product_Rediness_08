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
    confirmCopyFor,
    nextChoiceIndex,
    permittedUseForCategory,
    zoningAdvisoryFor,
    GENERATE_ROUTES,
} from '../src/ui/onboarding/typologyChoiceModel';
import { ONBOARDING_STYLES } from '../src/ui/onboarding/onboardingStyles';

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

// ── §CONFIRM-PANEL-UX ────────────────────────────────────────────────────────
// The founder's second complaint about this card was that its copy hard-coded
// "apartment". §TYPOLOGY-CHOICE-AT-CONFIRM fixed the heading and the CTA but left
// the BODY line describing an apartment for all four typologies. These tests pin
// all three strings to the chosen route so that cannot come back.

describe('confirmCopyFor — the card describes the typology the user actually chose', () => {
    const NOUNS: Record<string, string> = {
        apartment: 'apartment',
        house: 'house',
        'residential-building': 'residential building',
        office: 'office building',
    };

    it('never CALLS the building an apartment on a non-apartment route', () => {
        // The old hard-coded card said "Generate your apartment with AI?" / "rooms,
        // walls, doors and windows" whatever the user picked. What must never recur is
        // the card NAMING the thing an apartment. (A residential building's body line
        // legitimately mentions the apartment MIX — it is made of them — so the guard
        // is on the naming phrases, not on the word in every context.)
        for (const route of GENERATE_ROUTES) {
            if (route === 'apartment') continue;
            const copy = confirmCopyFor(route, NOUNS[route]!, 'drawn');
            const all = `${copy.title} ${copy.body} ${copy.cta}`.toLowerCase();
            for (const phrase of ['your apartment', 'an apartment', 'generate apartment']) {
                expect(all, `route "${route}" leaks "${phrase}": ${all}`).not.toContain(phrase);
            }
        }
    });

    it('the apartment-only body line does not survive onto the other three routes', () => {
        const apartmentBody = confirmCopyFor('apartment', 'apartment', 'drawn').body;
        expect(apartmentBody).toContain('rooms, walls, doors and windows');
        for (const route of GENERATE_ROUTES) {
            if (route === 'apartment') continue;
            expect(confirmCopyFor(route, NOUNS[route]!, 'drawn').body).not.toBe(apartmentBody);
        }
    });

    it('names the chosen noun in the title AND the CTA', () => {
        for (const route of GENERATE_ROUTES) {
            const noun = NOUNS[route]!;
            const copy = confirmCopyFor(route, noun, 'drawn');
            expect(copy.title).toContain(noun);
            expect(copy.cta).toContain(noun);
        }
    });

    it('gives every route a DISTINCT body line — a generic one would be wrong for three of four', () => {
        const bodies = GENERATE_ROUTES.map((r) => confirmCopyFor(r, NOUNS[r]!, 'drawn').body);
        expect(new Set(bodies).size).toBe(GENERATE_ROUTES.length);
    });

    it('says so when Generate opens a setup step rather than generating now', () => {
        // residential + office both open a parameter step from Generate
        // (§RESI-SETUP-AFTER-GENERATE, §TYPOLOGY-CHOICE-AT-CONFIRM). An unannounced
        // second step is the surprise the confirm card exists to remove.
        for (const route of ['residential-building', 'office'] as const) {
            const copy = confirmCopyFor(route, NOUNS[route]!, 'drawn');
            expect(copy.opensSetupStep).toBe(true);
            expect(copy.body.toLowerCase()).toContain("next you'll set");
        }
        for (const route of ['apartment', 'house'] as const) {
            expect(confirmCopyFor(route, NOUNS[route]!, 'drawn').opensSetupStep).toBe(false);
        }
    });

    it('reflects whether the user drew the plot or took the default', () => {
        expect(confirmCopyFor('apartment', 'apartment', 'drawn').body).toContain('the plot you drew');
        expect(confirmCopyFor('apartment', 'apartment', 'default-plot').body).toContain('your plot');
    });

    it('makes no claim about what it will build when no route is resolved', () => {
        const copy = confirmCopyFor(null, 'building', 'drawn');
        expect(copy.body.toLowerCase()).not.toContain('apartment');
        expect(copy.opensSetupStep).toBe(false);
    });
});

describe('buildTypologyChoices — the chip label is short enough for a small card', () => {
    it('renders a SHORT label, not the pack catalogue name', () => {
        const byId = new Map(buildTypologyChoices(ALL_MANIFESTS).map((c) => [c.id, c]));
        // e.g. 'Casa Unifamiliar (House)' / 'Office Building (Tower)' are correct in a
        // pack catalogue and would force the card wide (or truncate) in a 4-up chooser.
        expect(byId.get('casa-unifamiliar')!.chooserLabel).toBe('House');
        expect(byId.get('office-building')!.chooserLabel).toBe('Office building');
        expect(byId.get('residential-building')!.chooserLabel).toBe('Residential building');
        expect(byId.get('apartment')!.chooserLabel).toBe('Apartment');
        for (const c of byId.values()) {
            // Fits one line of an 11px chip in a 2-up grid inside a 360px card, so no
            // option is ever truncated — "smaller must not mean truncated".
            expect(c.chooserLabel.length, `"${c.chooserLabel}" is too long for the chip`)
                .toBeLessThanOrEqual(22);
            // The catalogue name is still carried — the controller uses it for the
            // chip's title/aria-label, so shortening the chip loses no information.
            expect(c.label.length).toBeGreaterThan(0);
        }
    });

    it('falls back to the pack displayName for a pack with no short label of ours', () => {
        // Registry stays the source of truth for WHICH typologies exist; the short
        // labels only cover the four we ship copy for.
        const aliased = { ...APARTMENT_MANIFEST, id: 'residential-multifamily', displayName: 'Legacy Resi' };
        const choice = buildTypologyChoices([aliased])[0]!;
        expect(choice.chooserLabel).toBe('Residential building'); // its route HAS a short label
        expect(choice.label).toBe('Legacy Resi');
    });
});

describe('nextChoiceIndex — the radiogroup is keyboard-operable (C43 / WAI-ARIA APG)', () => {
    it('moves forward and backward with both arrow axes', () => {
        expect(nextChoiceIndex(0, 'ArrowRight', 4)).toBe(1);
        expect(nextChoiceIndex(0, 'ArrowDown', 4)).toBe(1);
        expect(nextChoiceIndex(2, 'ArrowLeft', 4)).toBe(1);
        expect(nextChoiceIndex(2, 'ArrowUp', 4)).toBe(1);
    });

    it('wraps at both edges — a radiogroup is a cycle, never a dead end', () => {
        expect(nextChoiceIndex(3, 'ArrowRight', 4)).toBe(0);
        expect(nextChoiceIndex(0, 'ArrowLeft', 4)).toBe(3);
    });

    it('supports Home / End', () => {
        expect(nextChoiceIndex(2, 'Home', 4)).toBe(0);
        expect(nextChoiceIndex(1, 'End', 4)).toBe(3);
    });

    it('returns null for keys it does not own, so Tab/Enter/Space are never swallowed', () => {
        for (const key of ['Tab', 'Enter', ' ', 'a', 'Escape', 'PageDown']) {
            expect(nextChoiceIndex(0, key, 4), `swallowed "${key}"`).toBeNull();
        }
    });

    it('is total — degenerate counts and out-of-range indices cannot throw', () => {
        expect(nextChoiceIndex(0, 'ArrowRight', 0)).toBeNull();
        expect(nextChoiceIndex(-1, 'ArrowRight', 3)).toBe(1);
        expect(nextChoiceIndex(99, 'ArrowLeft', 3)).toBe(2);
        expect(nextChoiceIndex(0, 'ArrowRight', 1)).toBe(0);
    });
});

describe('the confirm card takes its colours from the ONE token layer (C51 §2.1.4)', () => {
    // A mirror surface once shipped '#5a4282' while the editor shipped '#6600FF'.
    // The guard is mechanical: the confirm-panel rules may reference CSS custom
    // properties from src/ui/styles/tokens.ts, never a colour literal of their own.
    const CONFIRM_BLOCKS = ONBOARDING_STYLES
        .split('\n')
        .filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
        .filter((l) => /--confirm|os-typology-choice|os-section-label|os-hint--muted|os-hint--warn/.test(l)
            || /^\s{2}/.test(l));

    it('declares no hex or rgb() colour literal in the confirm-panel rules', () => {
        const offenders: string[] = [];
        // Walk the confirm-scoped rule blocks only; the rest of this legacy sheet
        // predates the token layer and is out of this change's scope.
        const rules = ONBOARDING_STYLES.split('}');
        for (const rule of rules) {
            if (!/--confirm|os-typology-choice|os-section-label|os-hint--(muted|warn)/.test(rule)) continue;
            const body = rule.slice(rule.indexOf('{') + 1);
            const stripped = body.replace(/\/\*[\s\S]*?\*\//g, '');
            const literals = stripped.match(/#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(/g);
            if (literals) offenders.push(`${rule.split('{')[0]!.trim()} → ${literals.join(', ')}`);
        }
        expect(offenders, `colour literals outside the token layer:\n${offenders.join('\n')}`)
            .toEqual([]);
        expect(CONFIRM_BLOCKS.length).toBeGreaterThan(0); // the filter actually matched
    });

    it('references the shared token custom properties', () => {
        for (const token of ['--app-accent', '--app-text', '--app-text-2', '--app-panel-bg', '--app-radius-md']) {
            expect(ONBOARDING_STYLES).toContain(`var(${token})`);
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
