/**
 * §RESI-ORCH-MASSING-OPTIONS (STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §7) — N MASSINGS, EACH WITH ITS
 * REASON, AND NONE OF THEM RECOMMENDED.
 *
 * ⭐ THE THREE PROPERTIES THIS SUITE EXISTS TO PIN, in the order they can hurt:
 *   1. NOTHING IS CLAMPED. A plate that cannot reach the permitted floor area within the permitted
 *      storeys says so with BOTH counts and the shortfall in m² — `RESI-ORCHESTRATOR-PLAN` §6
 *      risk 2, the [[confident-register-rows-are-the-wrong-ones]] shape.
 *   2. NOTHING IS FALSELY REFUSED EITHER. That shortfall is a legal design and stays pickable;
 *      withdrawing it would be [[bulk-vs-query-endpoint-false-refusals]] wearing a rule citation.
 *   3. NOTHING IS INVENTED. No storeys without a derived GFA, no height without a derived maximum,
 *      no L-shape PRYZM cannot solve, and no bar drawn at zero for an axis that is unknown.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
    enumerateMassingOptions,
    MASSING_OPTION_FAMILIES,
    MASSING_FAMILY_COVERAGE,
    MASSING_FAMILIES_NOT_YET_SOLVED,
    type MassingOptionInputs,
} from '../massingOptionModel';
import {
    buildMassingOptionsFold,
    MASSING_OPTIONS_SECTION_TESTID,
    MASSING_OPTIONS_GENERATE_BTN_TESTID,
    MASSING_PICK_ATTR,
} from '../envelopeCardSections';

afterEach(() => {
    document.body.innerHTML = '';
});

/** A 40 × 25 m permitted plate — 1000 m², comfortably eroded four ways. */
const RING = [
    { x: 0, z: 0 },
    { x: 40, z: 0 },
    { x: 40, z: 25 },
    { x: 0, z: 25 },
];

const BASE: MassingOptionInputs = {
    permittedRing: RING,
    permittedFootprintM2: 1000,
    permittedGfaM2: 3000,
    maxFloors: 3,
    maxHeightM: 10.5,
    parcelAreaM2: 1400,
};

function ok(inputs: MassingOptionInputs) {
    const set = enumerateMassingOptions(inputs);
    if (!set.ok) throw new Error(`expected options, got refusal: ${set.reason}`);
    return set;
}

describe('enumerateMassingOptions — the four coverage options', () => {
    it('refuses, with a reason, when there is no permitted footprint', () => {
        const set = enumerateMassingOptions({ ...BASE, permittedRing: [], permittedFootprintM2: 0 });
        expect(set.ok).toBe(false);
        if (set.ok) return;
        expect(set.reason).toBe('no-permitted-footprint');
        expect(set.text).toContain('guess');
    });

    it('produces one option per family, in descending coverage, with stable ids', () => {
        const set = ok(BASE);
        expect(set.options.length).toBe(MASSING_OPTION_FAMILIES.length);
        expect(set.options.map((o) => o.family)).toEqual([...MASSING_OPTION_FAMILIES]);
        expect(set.options.map((o) => o.id)).toEqual(
            MASSING_OPTION_FAMILIES.map((f) => `massing-${f}`),
        );
        const areas = set.options.map((o) => o.footprintAreaM2!);
        for (let i = 1; i < areas.length; i++) expect(areas[i]!).toBeLessThan(areas[i - 1]!);
    });

    it('⛔ is DETERMINISTIC — the same inputs give byte-identical options', () => {
        expect(JSON.stringify(ok(BASE).options)).toBe(JSON.stringify(ok(BASE).options));
    });

    it('the full plate IS the permitted footprint — no erosion, no drift', () => {
        const full = ok(BASE).options[0]!;
        expect(full.family).toBe('full-plate');
        expect(full.footprintAreaM2).toBeCloseTo(1000, 0);
        expect(full.proposal!.insetM).toBe(0);
        expect(full.coverageOfPermitted).toBeCloseTo(1, 3);
    });

    it('each eroded plate lands near its coverage fraction', () => {
        for (const o of ok(BASE).options.slice(1)) {
            const want = MASSING_FAMILY_COVERAGE[o.family];
            expect(Math.abs(o.coverageOfPermitted! - want), o.family).toBeLessThan(0.05);
        }
    });

    it('every eroded option carries `shape-approximated` — it is a study, not a setback rule', () => {
        const set = ok(BASE);
        expect(set.options[0]!.limitations.some((l) => l.code === 'shape-approximated')).toBe(false);
        for (const o of set.options.slice(1)) {
            const l = o.limitations.find((x) => x.code === 'shape-approximated');
            expect(l, o.family).toBeTruthy();
            expect(l!.severity).toBe('warning');
        }
    });
});

describe('the storey arithmetic', () => {
    it('states the storeys the permitted floor area takes on each plate', () => {
        const set = ok(BASE); // 3000 m² permitted over 1000 / 750 / 500 / 333 m² plates
        expect(set.options[0]!.storeysToRealisePermittedGfa).toBe(3);
        expect(set.options[1]!.storeysToRealisePermittedGfa).toBe(4);
        expect(set.options[2]!.storeysToRealisePermittedGfa).toBe(6);
        expect(set.options[3]!.storeysToRealisePermittedGfa).toBe(9);
    });

    it('⛔ a sub-square-metre plate wobble does NOT add a whole storey', () => {
        // ⭐ THIS TEST FOUND A REAL DEFECT and is the reason the ceil is taken against the plate's
        // upper measurement bound. The erosion solver hits a target to within its own stated
        // tolerance, so the "half plate" of a 1,000 m² footprint comes back at 499 m², not 500.
        // A bare `Math.ceil(3000 / 499)` is 7 — the user would read SEVEN storeys for a plate that
        // plainly needs six, and the figure would flip between renders of the same parcel.
        const half = ok(BASE).options.find((o) => o.family === 'half-plate')!;
        expect(half.footprintAreaM2!).toBeLessThan(500);        // the wobble is real
        expect(half.footprintAreaM2!).toBeGreaterThan(498);
        expect(half.storeysToRealisePermittedGfa).toBe(6);      // and it does not cost a storey
        // ⛔ …while the REALISED area still uses the ACTUAL plate. The margin decides how many
        // storeys are needed, never how much floor they yield.
        expect(half.realisedGfaM2).toBeCloseTo(half.footprintAreaM2! * 3, 6);
    });

    it('⛔ a plate that cannot reach the permitted GFA states BOTH counts and the shortfall', () => {
        const set = ok(BASE);
        const half = set.options.find((o) => o.family === 'half-plate')!;
        const l = half.limitations.find((x) => x.code === 'storeys-exceed-cap');
        expect(l).toBeTruthy();
        expect(l!.text).toContain('6 storeys');   // needed
        expect(l!.text).toContain('permits 3');   // permitted
        expect(l!.text).toMatch(/15\d\d m. less than the parcel permits/); // the shortfall
        // ⛔ and the realised figure is the CAP's, not the ask's — stated, never substituted.
        expect(half.realisedGfaM2).toBeCloseTo(half.footprintAreaM2! * 3, 0);
    });

    it('⛔ that shortfall is a WARNING and the option stays pickable — no false refusal', () => {
        const half = ok(BASE).options.find((o) => o.family === 'half-plate')!;
        expect(half.limitations.find((x) => x.code === 'storeys-exceed-cap')!.severity).toBe('warning');
        expect(half.refused).toBe(false);
        expect(half.proposal).not.toBeNull();
    });

    it('⛔ NO derived GFA ⇒ no storey figure at all, and the reason is stated', () => {
        const set = ok({ ...BASE, permittedGfaM2: null, maxFloors: null });
        for (const o of set.options) {
            expect(o.storeysToRealisePermittedGfa, o.family).toBeNull();
            expect(o.realisedGfaM2, o.family).toBeNull();
            expect(o.limitations.some((l) => l.code === 'gfa-not-derived'), o.family).toBe(true);
        }
    });

    it('⛔ NO derived max height ⇒ no height, and the reason says why one is not divided out', () => {
        const set = ok({ ...BASE, maxHeightM: null });
        for (const o of set.options) {
            expect(o.heightM, o.family).toBeNull();
            const l = o.limitations.find((x) => x.code === 'height-not-derived');
            expect(l, o.family).toBeTruthy();
            expect(l!.text).toContain('would look exactly like one it read from the ordinance');
        }
    });

    it('states a height only by an even division, and says so in the statement', () => {
        const full = ok(BASE).options[0]!;
        expect(full.heightM).toBeCloseTo(10.5, 3); // 3 storeys × (10.5 / 3)
        expect(full.statement).toContain('not a regulated storey height');
    });
});

describe('the axes are FACTS, never a ranking', () => {
    it('every option carries the same five axes, each with a meaning', () => {
        for (const o of ok(BASE).options) {
            expect(o.scores.map((a) => a.key)).toEqual([
                'coverage', 'open-ground', 'storeys', 'gfa-realised', 'storey-headroom',
            ]);
            for (const a of o.scores) expect(a.meaning, `${o.family}/${a.key}`).not.toBe('');
        }
    });

    it('⛔ an axis that cannot be derived is NULL, never 0 — a 0 bar reads as a measured worst case', () => {
        const set = ok({ ...BASE, parcelAreaM2: null, permittedGfaM2: null, maxFloors: null });
        for (const o of set.options) {
            for (const key of ['open-ground', 'storeys', 'gfa-realised', 'storey-headroom'] as const) {
                const a = o.scores.find((x) => x.key === key)!;
                expect(a.normalised, `${o.family}/${key}`).toBeNull();
                expect(a.display, `${o.family}/${key}`).toBeNull();
            }
        }
    });

    it('⛔ NO option carries an aggregate score or a "recommended" flag', () => {
        for (const o of ok(BASE).options) {
            expect(Object.keys(o)).not.toContain('score');
            expect(Object.keys(o)).not.toContain('recommended');
            expect(Object.keys(o)).not.toContain('rank');
        }
    });

    it('the caveat names the shapes PRYZM does NOT solve', () => {
        expect(ok(BASE).caveat).toBe(MASSING_FAMILIES_NOT_YET_SOLVED);
        expect(MASSING_FAMILIES_NOT_YET_SOLVED).toContain('L-shaped');
        expect(MASSING_FAMILIES_NOT_YET_SOLVED).toContain('will not draw a rectangle and call it an L');
    });
});

describe('dedupe — two targets that erode to one ring are ONE option', () => {
    it('never returns two options whose plates are the same area', () => {
        // A long thin ring collapses under erosion far sooner than a square one.
        const thin = [{ x: 0, z: 0 }, { x: 60, z: 0 }, { x: 60, z: 4 }, { x: 0, z: 4 }];
        const set = enumerateMassingOptions({
            ...BASE, permittedRing: thin, permittedFootprintM2: 240, permittedGfaM2: 480,
        });
        if (!set.ok) return; // a total refusal is also honest for a degenerate ring
        const areas = set.options.map((o) => o.footprintAreaM2).filter((a): a is number => a !== null);
        for (let i = 1; i < areas.length; i++) {
            expect(Math.abs(areas[i]! - areas[i - 1]!)).toBeGreaterThan(1);
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// The fold — idle by default, refused options listed without a button
// ─────────────────────────────────────────────────────────────────────────────

describe('buildMassingOptionsFold', () => {
    const arm = (): string | null =>
        document.querySelector(`[data-testid="${MASSING_OPTIONS_SECTION_TESTID}"]`)
            ?.getAttribute('data-state') ?? null;

    it('⛔ opens IDLE with a Generate button — nothing is enumerated on a card render', () => {
        document.body.innerHTML = buildMassingOptionsFold({ kind: 'idle' });
        expect(arm()).toBe('idle');
        expect(document.querySelector(`[data-testid="${MASSING_OPTIONS_GENERATE_BTN_TESTID}"]`)).not.toBeNull();
        expect(document.querySelector(`[${MASSING_PICK_ATTR}]`)).toBeNull();
    });

    it('renders one card per option, each with a pick button, and states that PRYZM picks none', () => {
        document.body.innerHTML = buildMassingOptionsFold({ kind: 'computed', set: ok(BASE) });
        expect(arm()).toBe('computed');
        expect(document.querySelectorAll('[data-massing-option]').length).toBe(4);
        expect(document.querySelectorAll(`[${MASSING_PICK_ATTR}]`).length).toBe(4);
        expect(document.body.textContent ?? '').toContain('PRYZM does not pick one');
    });

    it('prints the shortfall limitation in the card, keyed on its CODE not its prose', () => {
        document.body.innerHTML = buildMassingOptionsFold({ kind: 'computed', set: ok(BASE) });
        const l = document.querySelector('[data-massing-limitation="storeys-exceed-cap"]');
        expect(l).not.toBeNull();
        expect(l!.getAttribute('data-severity')).toBe('warning');
    });

    it('renders the refusal arm with its reason when there is no permitted footprint', () => {
        document.body.innerHTML = buildMassingOptionsFold({
            kind: 'computed',
            set: enumerateMassingOptions({ ...BASE, permittedRing: [], permittedFootprintM2: 0 }),
        });
        expect(arm()).toBe('refused');
        expect(document.body.textContent ?? '').toContain('nothing to generate massing options inside');
    });

    it('⛔ an undrawable axis prints "not derived", never a zero-width bar', () => {
        document.body.innerHTML = buildMassingOptionsFold({
            kind: 'computed',
            set: ok({ ...BASE, parcelAreaM2: null, permittedGfaM2: null, maxFloors: null }),
        });
        expect((document.body.textContent ?? '').match(/not derived/g)?.length ?? 0).toBeGreaterThan(0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE SOURCE PIN — the card must call this, or the suite certifies a shelf
// ─────────────────────────────────────────────────────────────────────────────

describe('GISAreaLayout actually reaches the enumerator', () => {
    const card = readFileSync(resolve(__dirname, '../../layout/GISAreaLayout.ts'), 'utf8');

    it('renders the fold, wires generate/pick/hide, and enumerates only on the click', () => {
        expect(card).toContain('buildMassingOptionsFold(');
        expect(card).toContain('wireMassingOptions(panel)');
        expect(card).toContain('enumerateMassingOptions({');
        // The enumeration lives INSIDE the generate handler, not in the render path.
        const genIdx = card.indexOf('MASSING_OPTIONS_GENERATE_BTN_TESTID}"]');
        const enumIdx = card.indexOf('enumerateMassingOptions({');
        expect(genIdx).toBeGreaterThan(-1);
        expect(enumIdx).toBeGreaterThan(genIdx);
    });

    it('⛔ a picked option writes the ONE §5 proposal channel — no second store', () => {
        expect(card).toContain('setTargetFootprintProposal(option.proposal)');
    });

    it('⛔ carries a staleness gate, so options never outlive the envelope they measured', () => {
        expect(card).toContain('massingOptionsForFootprintM2');
    });
});
