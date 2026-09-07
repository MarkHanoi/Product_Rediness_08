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

import { describe, it, expect, afterEach, vi } from 'vitest';

// ⛔ THE LIVE-SITE READER IS MOCKED AWAY, AND THAT IS AN ASSERTION, NOT A CONVENIENCE.
//
// `enumerateMassingOptions` has exactly ONE impurity: when `targetGroundFloorAreaM2` or `siting`
// is OMITTED it reads the live site through `massingSitingContext`. Every case below passes both
// explicitly, so the real reader must never be consulted — and this factory PINS that, because a
// future edit that reads the store unconditionally would start returning these stubs instead of a
// real answer and the suite would notice.
//
// ⭐ IT IS ALSO WHY THIS SUITE STILL RUNS IN SECONDS. `massingSitingContext` statically imports
// `siteDispatch`, whose module graph reaches the whole GIS/Cesium/command surface — measured
// 2026-09-06 at ~270 s of transform for a one-assertion probe spec. A factory mock means Vitest
// never loads the real module, so the honest-isolation choice and the fast choice are the same
// choice. ⚠ Its own behaviour is pinned separately, in `massingSitingContext.spec.ts`.
vi.mock('../massingSitingContext', () => ({
    resolveLiveMassingSitingContext: () => null,
    resolveLiveTargetGroundFloorAreaM2: () => null,
}));
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
    enumerateMassingOptions,
    MASSING_OPTION_FAMILIES,
    MASSING_FAMILY_COVERAGE,
    MASSING_FAMILIES_NOT_YET_SOLVED,
    MASSING_SHAPES_SIZED_TO_LARGEST_FIT,
    type MassingCoverageFamily,
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
    // ⭐ BOTH SITING INPUTS ARE PASSED EXPLICITLY AS `null`, AND THAT IS DELIBERATE.
    // OMITTING them means *"read the live site"* — the one impurity `enumerateMassingOptions`
    // has — and a suite whose baseline depends on two module-level cells being empty is a suite
    // that passes for a reason nobody wrote down. Explicit `null` keeps every assertion below
    // byte-deterministic on its arguments alone; the shape-family tests override them.
    targetGroundFloorAreaM2: null,
    siting: null,
};

function ok(inputs: MassingOptionInputs) {
    const set = enumerateMassingOptions(inputs);
    if (!set.ok) throw new Error(`expected options, got refusal: ${set.reason}`);
    return set;
}

const SHAPE_FAMILIES = ['bar-i', 'ell', 'ell-non-orthogonal', 'u-court'] as const;
const isCoverage = (f: string): f is MassingCoverageFamily =>
    (MASSING_OPTION_FAMILIES as readonly string[]).includes(f);

/** The COVERAGE options only — the plate family's size ladder, in its own order. */
function plates(inputs: MassingOptionInputs) {
    return ok(inputs).options.filter((o) => isCoverage(o.family));
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
        const ps = plates(BASE);
        expect(ps.length).toBe(MASSING_OPTION_FAMILIES.length);
        expect(ps.map((o) => o.family)).toEqual([...MASSING_OPTION_FAMILIES]);
        expect(ps.map((o) => o.id)).toEqual(
            MASSING_OPTION_FAMILIES.map((f) => `massing-${f}`),
        );
        const areas = ps.map((o) => o.footprintAreaM2!);
        for (let i = 1; i < areas.length; i++) expect(areas[i]!).toBeLessThan(areas[i - 1]!);
    });

    // ⭐ L-13037 — *"an architect chooses among shapes before choosing among sizes"*: the SHAPE
    // families lead the list and the four plates follow as one shape's size ladder.
    it('⭐ lists the SHAPE families FIRST and the four plates after them', () => {
        const families = ok(BASE).options.map((o) => o.family);
        expect(families.slice(0, 4)).toEqual([...SHAPE_FAMILIES]);
        expect(families.slice(4)).toEqual([...MASSING_OPTION_FAMILIES]);
    });

    it('⛔ is DETERMINISTIC — the same inputs give byte-identical options', () => {
        expect(JSON.stringify(ok(BASE).options)).toBe(JSON.stringify(ok(BASE).options));
    });

    it('the full plate IS the permitted footprint — no erosion, no drift', () => {
        const full = plates(BASE)[0]!;
        expect(full.family).toBe('full-plate');
        expect(full.footprintAreaM2).toBeCloseTo(1000, 0);
        expect(full.proposal!.insetM).toBe(0);
        expect(full.coverageOfPermitted).toBeCloseTo(1, 3);
    });

    it('each eroded plate lands near its coverage fraction', () => {
        for (const o of plates(BASE).slice(1)) {
            const want = MASSING_FAMILY_COVERAGE[o.family as MassingCoverageFamily];
            expect(Math.abs(o.coverageOfPermitted! - want), o.family).toBeLessThan(0.05);
        }
    });

    it('every eroded option carries `shape-approximated` — it is a study, not a setback rule', () => {
        const ps = plates(BASE);
        expect(ps[0]!.limitations.some((l) => l.code === 'shape-approximated')).toBe(false);
        for (const o of ps.slice(1)) {
            const l = o.limitations.find((x) => x.code === 'shape-approximated');
            expect(l, o.family).toBeTruthy();
            expect(l!.severity).toBe('warning');
        }
    });
});

describe('the storey arithmetic', () => {
    it('states the storeys the permitted floor area takes on each plate', () => {
        const ps = plates(BASE); // 3000 m² permitted over 1000 / 750 / 500 / 333 m² plates
        expect(ps[0]!.storeysToRealisePermittedGfa).toBe(3);
        expect(ps[1]!.storeysToRealisePermittedGfa).toBe(4);
        expect(ps[2]!.storeysToRealisePermittedGfa).toBe(6);
        expect(ps[3]!.storeysToRealisePermittedGfa).toBe(9);
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
        for (const o of set.options.filter((x) => !x.refused)) {
            expect(o.storeysToRealisePermittedGfa, o.family).toBeNull();
            expect(o.realisedGfaM2, o.family).toBeNull();
            expect(o.limitations.some((l) => l.code === 'gfa-not-derived'), o.family).toBe(true);
        }
    });

    it('⛔ NO derived max height ⇒ no height, and the reason says why one is not divided out', () => {
        const set = ok({ ...BASE, maxHeightM: null });
        for (const o of set.options.filter((x) => !x.refused)) {
            expect(o.heightM, o.family).toBeNull();
            const l = o.limitations.find((x) => x.code === 'height-not-derived');
            expect(l, o.family).toBeTruthy();
            expect(l!.text).toContain('would look exactly like one it read from the ordinance');
        }
    });

    it('states a height only by an even division, and says so in the statement', () => {
        const full = plates(BASE)[0]!;
        expect(full.heightM).toBeCloseTo(10.5, 3); // 3 storeys × (10.5 / 3)
        expect(full.statement).toContain('not a regulated storey height');
    });
});

describe('the axes are FACTS, never a ranking', () => {
    it('every PLATE option carries the same five axes, each with a meaning', () => {
        for (const o of plates(BASE)) {
            expect(o.scores.map((a) => a.key)).toEqual([
                'coverage', 'open-ground', 'storeys', 'gfa-realised', 'storey-headroom',
            ]);
            for (const a of o.scores) expect(a.meaning, `${o.family}/${a.key}`).not.toBe('');
        }
    });

    it('⛔ an axis that cannot be derived is NULL, never 0 — a 0 bar reads as a measured worst case', () => {
        const set = ok({ ...BASE, parcelAreaM2: null, permittedGfaM2: null, maxFloors: null });
        for (const o of set.options.filter((x) => isCoverage(x.family))) {
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

    // ⭐ REWRITTEN 2026-09-06 (lane PL-MASSING-OPTIONS). This test read
    //   expect(caveat).toBe(MASSING_FAMILIES_NOT_YET_SOLVED);
    //   expect(MASSING_FAMILIES_NOT_YET_SOLVED).toContain('L-shaped');
    // and it PINNED A CAPABILITY CLAIM THAT IS NO LONGER TRUE — the constant said PRYZM could not
    // solve an L, and §RESI-ORCH-MASSING-SHAPES now does. A test that pins a stale limitation is a
    // ratchet holding the product back, so it is corrected rather than deleted: the RULE it existed
    // to defend (never draw a rectangle and call it an L) is still asserted, on the new wording.
    // ⭐ REWRITTEN AGAIN 2026-09-07 (lane MASSING-SHAPES, L-13037). This test pinned
    //   expect(set.options.length).toBe(MASSING_OPTION_FAMILIES.length);
    //   expect(set.caveat).toBe(MASSING_SHAPES_NEED_A_TARGET_AREA);
    // i.e. it CERTIFIED THE BRANCH THE FOUNDER'S FOUR-PLATES SCREENSHOT WAS TAKEN ON — the shapes
    // withheld for want of an area typed in a different section. The shapes are now sized to their
    // largest fit, listed, and say so; the caveat names the action that sizes them.
    it('⭐ with NO target area the shape families are STILL LISTED, at their largest fit, and say so', () => {
        const set = ok(BASE); // BASE carries a null targetGroundFloorAreaM2
        expect(set.options.length).toBe(MASSING_OPTION_FAMILIES.length + SHAPE_FAMILIES.length);
        expect(set.caveat).toBe(MASSING_SHAPES_SIZED_TO_LARGEST_FIT);
        expect(set.caveat).toContain('LARGEST size');
        expect(set.caveat).toContain('Propose a ground floor');
        const ell = set.options.find((o) => o.family === 'ell')!;
        expect(ell.refused).toBe(false);
        expect(ell.proposal).not.toBeNull();
        // The option carries the fact of its sizing as a CODED limitation, with both numbers.
        const l = ell.limitations.find((x) => x.code === 'sized-to-largest-fit')!;
        expect(l).toBeTruthy();
        expect(l.text).toContain('1000 m²');
        expect(l.text).toContain(`${ell.footprintAreaM2!.toFixed(0)} m²`);
        // ⛔ The channel's "asked for" is the area the user is choosing — never a fabricated target.
        expect(ell.proposal!.targetAreaM2).toBeCloseTo(ell.footprintAreaM2!, 6);
    });

    it('the caveat still states the rule, and names what is STILL not solved', () => {
        const set = ok({ ...BASE, targetGroundFloorAreaM2: 180, siting: null });
        expect(set.caveat).toBe(MASSING_FAMILIES_NOT_YET_SOLVED);
        expect(MASSING_FAMILIES_NOT_YET_SOLVED).toContain('will not draw a rectangle and call it an L');
        expect(MASSING_FAMILIES_NOT_YET_SOLVED).toContain('Not yet offered');
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
        const areas = set.options.filter((o) => isCoverage(o.family))
            .map((o) => o.footprintAreaM2).filter((a): a is number => a !== null);
        for (let i = 1; i < areas.length; i++) {
            expect(Math.abs(areas[i]! - areas[i - 1]!)).toBeGreaterThan(1);
        }
        // ⭐ §ONE-RING-ONE-OPTION — and ACROSS families: on a 4 m strip the largest bar IS the
        // full plate, so exactly one of them is listed, and the L / U — which clip to that same
        // bar — are REFUSED by name rather than listed as a rectangle wearing a letter.
        const rings = set.options.filter((o) => o.proposal !== null).map((o) => o.proposal!.ring);
        for (let i = 0; i < rings.length; i++) {
            for (let j = i + 1; j < rings.length; j++) {
                const a = rings[i]!; const b = rings[j]!;
                const same = a.length === b.length
                    && a.every((p) => b.some((q) => Math.hypot(p.x - q.x, p.z - q.z) <= 0.05));
                expect(same, `options ${i} and ${j} share one ring`).toBe(false);
            }
        }
        const ell = set.options.find((o) => o.family === 'ell')!;
        expect(ell.refused).toBe(true);
        expect(ell.limitations[0]!.text).toContain('clips to a plain bar');
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
        // 4 shapes + 4 plates; the non-orthogonal L is refused on the rectangle and has no button.
        expect(document.querySelectorAll('[data-massing-option]').length).toBe(8);
        expect(document.querySelectorAll(`[${MASSING_PICK_ATTR}]`).length).toBe(7);
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

// ─────────────────────────────────────────────────────────────────────────────
// §RESI-ORCH-MASSING-SHAPES (STR §25.3) — THE SHAPE FAMILIES ON THE CARD.
//
// The engine's own behaviour is pinned in `massingShapeOptions.spec.ts`. THIS block pins the join:
// that a shape reaches the card as a first-class option, that picking it rides the ONE proposal
// channel, and that §25.2's remainder arithmetic travels with it.
// ─────────────────────────────────────────────────────────────────────────────

const WITH_TARGET: MassingOptionInputs = {
    ...BASE,
    // The founder's worked instruction, verbatim: *"180 sqm brut in ground floor"*.
    targetGroundFloorAreaM2: 180,
    siting: {
        latDeg: 41.39,
        lngDeg: 2.17,
        neighbours: [],
        neighbourSnapshotTaken: true,
        originLabel: 'test',
    },
};

describe('the shape families reach the card', () => {
    it('leads with I, L, the non-orthogonal L and U, and the four coverage options follow', () => {
        const set = ok(WITH_TARGET);
        const families = set.options.map((o) => o.family);
        expect(families.slice(0, 4)).toEqual(['bar-i', 'ell', 'ell-non-orthogonal', 'u-court']);
        expect(families.slice(4)).toEqual([...MASSING_OPTION_FAMILIES]);
        expect(set.caveat).toBe(MASSING_FAMILIES_NOT_YET_SOLVED);
    });

    it('⛔ picking a shape rides the ONE §5 proposal channel — no second geometry path', () => {
        const ell = ok(WITH_TARGET).options.find((o) => o.family === 'ell')!;
        expect(ell.proposal).not.toBeNull();
        expect(ell.proposal!.ok).toBe(true);
        expect(ell.proposal!.targetAreaM2).toBe(180);
        expect(ell.proposal!.permittedAreaM2).toBe(1000);
        expect(ell.proposal!.ring.length).toBeGreaterThanOrEqual(6); // an L, not a rectangle
        expect(Math.abs(ell.proposal!.achievedAreaM2 - 180)).toBeLessThanOrEqual(1);
    });

    it('⭐ STR §25.2 — the card states what is LEFT for the floors above, with both numbers', () => {
        const bar = ok(WITH_TARGET).options.find((o) => o.family === 'bar-i')!;
        const axis = bar.scores.find((a) => a.key === 'upper-floors-remaining')!;
        expect(axis.display).toContain('m² BRUT');
        // 3,000 m² permitted BRUT − a ~180 m² ground floor ⇒ ~2,820 m² left.
        expect(axis.display).toContain('2820');
        expect(bar.statement).toContain('for the floors above');
    });

    it('the computed siting axes travel through to the option, keys intact', () => {
        const bar = ok(WITH_TARGET).options.find((o) => o.family === 'bar-i')!;
        const keys = bar.scores.map((a) => a.key);
        expect(keys).toEqual([
            'south-facade', 'sun-facade', 'overlooking', 'open-outlook',
            'street-frontage', 'forecourt', 'upper-floors-remaining',
        ]);
        // ⭐ AND THE SUN NUMBER IS REAL — a lat/lon was supplied, so it was ray-traced, not withheld.
        expect(bar.scores.find((a) => a.key === 'sun-facade')!.normalised).not.toBeNull();
    });

    it('⛔ a REFUSED family is LISTED, with its reason and WITHOUT a pick button', () => {
        // The 40 × 25 m plate is orthogonal, so the non-orthogonal L has no angle to derive.
        const nonOrtho = ok(WITH_TARGET).options.find((o) => o.family === 'ell-non-orthogonal')!;
        expect(nonOrtho.refused).toBe(true);
        expect(nonOrtho.proposal).toBeNull();
        const l = nonOrtho.limitations.find((x) => x.code === 'shape-family-refused')!;
        expect(l.severity).toBe('error');
        expect(l.text).toContain('will not invent an angle');
    });

    it('a shape that reaches the target is NEVER marked refused, even when it cannot use the whole GFA', () => {
        for (const o of ok(WITH_TARGET).options.filter((x) => x.family !== 'ell-non-orthogonal').slice(0, 3)) {
            expect(o.refused, o.family).toBe(false);
            expect(o.proposal, o.family).not.toBeNull();
        }
    });

    it('⛔ DETERMINISTIC with the shape families on — byte-identical across runs', () => {
        expect(JSON.stringify(ok(WITH_TARGET).options)).toBe(JSON.stringify(ok(WITH_TARGET).options));
    });

    it('⭐ REACHABILITY — the shipped fold renders a card + a pick button for every solved shape', () => {
        document.body.innerHTML = buildMassingOptionsFold({ kind: 'computed', set: ok(WITH_TARGET) });
        // 4 coverage + 4 shape families = 8 cards; the refused non-orthogonal L has no button.
        expect(document.querySelectorAll('[data-massing-option]').length).toBe(8);
        expect(document.querySelector('[data-massing-option="massing-shape-ell"]')).not.toBeNull();
        expect(document.querySelector(`[${MASSING_PICK_ATTR}="massing-shape-ell"]`)).not.toBeNull();
        expect(document.querySelector(`[${MASSING_PICK_ATTR}="massing-shape-ell-non-orthogonal"]`)).toBeNull();
        expect(document.querySelector('[data-massing-option="massing-shape-ell-non-orthogonal"]')
            ?.getAttribute('data-refused')).toBe('1');
        // The computed reasons are on the page, not just in the model.
        expect(document.body.textContent ?? '').toContain('South-facing façade');
        expect(document.body.textContent ?? '').toContain('Façade daylight (equinox)');
        expect(document.body.textContent ?? '').toContain('Overlooked façade');
    });
});
