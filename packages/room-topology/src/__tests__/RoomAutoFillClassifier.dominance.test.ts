// §DEPT153 (L-12540+) — the founder's dominance ruling, verbatim: *"bedrooms
// are either called rooms .... not understood, or dressing - same living -
// kitchen not recognized etc... more important - if bed → bedroom no matter
// what. if sofa → living. if sofa + kitchen + living → kitchen"* — proven
// against his own plan-view evidence (Level 1: two rooms with a visible BED
// were labelled "Dressing"; a room with a sofa, dining table and kitchen run
// was too; a room with a visible STAIR was left unclassified entirely).
//
// TWO independent defects, both pinned here:
//   1. TOKEN MATCHING — catalogue furniture kinds are underscore-joined
//      compounds ('kave_double_bed', 'kitchen_straight', 'sofa_2seat');
//      `\b` does not treat `_` as a boundary, so the OLD regexes never
//      matched them. `WARDROBE_RE` had no boundary check and kept firing —
//      wardrobe was not WINNING, everything else was going BLIND.
//   2. BED DOMINANCE BY CONSTRUCTION — "if bed -> bedroom no matter what" is
//      now a precondition in classifyRoomForAutofill, not row position, so a
//      future table edit cannot silently break it (test below proves this
//      directly, not by re-reading array order).
//
// Mirrors RoomAutoFillClassifier.test.ts's harness exactly (same
// makeStore/setContents shape) — this file adds AREA to the room fixture,
// which the pre-existing suite never needed.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { storeRegistry } from '@pryzm/core-app-model';
import { classifyRoomForAutofill, ROOM_AUTOFILL_RULES } from '../RoomAutoFillClassifier';

interface FakeElement { id: string; [k: string]: unknown }

function makeStore(records: FakeElement[]) {
    return {
        getAll: () => records,
        getById: (id: string) => records.find((r) => r.id === id),
    };
}

function setContents(
    roomId: string,
    contents: { furniture?: FakeElement[]; plumbing?: FakeElement[]; stairs?: FakeElement[] },
): void {
    (globalThis as any).window.roomContentsService = {
        getContents: (id: string) => (id === roomId
            ? {
                contained: {
                    furniture: (contents.furniture ?? []).map((f) => ({ id: f.id, label: String(f.name ?? f.id) })),
                    plumbing: (contents.plumbing ?? []).map((p) => ({ id: p.id, label: String(p.name ?? p.id) })),
                    stairs: (contents.stairs ?? []).map((s) => ({ id: s.id, label: String(s.name ?? s.id) })),
                },
            }
            : null),
    };
}

/** Registers the room store with a room carrying `computed.area` — the
 *  pre-existing suite's `{ id: 'r1' }` fixture never set this. */
function registerRoom(areaM2?: number): void {
    storeRegistry.register('room', makeStore([
        { id: 'r1', computed: areaM2 !== undefined ? { area: areaM2 } : undefined },
    ]));
}

/** Registers furniture whose `.name` is UNSET, so `gatherRoomAutofillSignals`
 *  falls back to `furnitureType` — the real catalogue-kind signal this suite
 *  is about, as opposed to a human-typed display name. */
function catalogueFurniture(items: Array<{ id: string; furnitureType: string }>): FakeElement[] {
    return items.map((i) => ({ id: i.id, furnitureType: i.furnitureType }));
}

describe('classifyRoomForAutofill — §DEPT153 catalogue-kind token matching', () => {
    beforeEach(() => {
        (globalThis as any).window = {};
        storeRegistry.register('plumbing', makeStore([]));
    });
    afterEach(() => { delete (globalThis as any).window; });

    it('a bed whose ONLY label is the catalogue furnitureType "kave_double_bed" is still detected as Bedroom', () => {
        registerRoom(10);
        const items = catalogueFurniture([{ id: 'f1', furnitureType: 'kave_double_bed' }]);
        storeRegistry.register('furniture', makeStore(items));
        setContents('r1', { furniture: items });

        // This is the OLD regex's exact failure mode: /\bbed\b/ does not
        // match 'kave_double_bed' (no boundary either side of "bed").
        expect(classifyRoomForAutofill('r1')).toEqual({
            ruleId: 'bedroom-bed', label: 'Bedroom', occupancyType: 'bedroom',
        });
    });

    it('a bed labelled by the PLAIN catalogue type "bed" is detected (unchanged baseline)', () => {
        registerRoom(10);
        const items = catalogueFurniture([{ id: 'f1', furnitureType: 'bed' }]);
        storeRegistry.register('furniture', makeStore(items));
        setContents('r1', { furniture: items });
        expect(classifyRoomForAutofill('r1')?.label).toBe('Bedroom');
    });

    it('the irregular catalogue bunk-bed kind "kave_bunkbed" (no separator before "bed") is still detected', () => {
        registerRoom(10);
        const items = catalogueFurniture([{ id: 'f1', furnitureType: 'kave_bunkbed' }]);
        storeRegistry.register('furniture', makeStore(items));
        setContents('r1', { furniture: items });
        expect(classifyRoomForAutofill('r1')?.label).toBe('Bedroom');
    });

    it('a kitchen whose ONLY label is the parametric run "kitchen_straight" is detected as Kitchen', () => {
        registerRoom(10);
        const items = catalogueFurniture([{ id: 'f1', furnitureType: 'kitchen_straight' }]);
        storeRegistry.register('furniture', makeStore(items));
        setContents('r1', { furniture: items });

        // The OLD regex required "kitchen unit"/"kitchen counter" specifically
        // — 'kitchen_straight' matched neither word AND used an underscore.
        expect(classifyRoomForAutofill('r1')).toEqual({
            ruleId: 'kitchen', label: 'Kitchen', occupancyType: 'kitchen',
        });
    });

    it('every parametric kitchen run variant is recognised', () => {
        for (const t of ['kitchen_straight', 'kitchen_l_shape', 'kitchen_u_shape', 'kitchen_island', 'kitchen_straight_tall']) {
            registerRoom(10);
            const items = catalogueFurniture([{ id: 'f1', furnitureType: t }]);
            storeRegistry.register('furniture', makeStore(items));
            setContents('r1', { furniture: items });
            expect(classifyRoomForAutofill('r1')?.occupancyType, `type ${t}`).toBe('kitchen');
        }
    });

    it('a sofa labelled by a catalogue variant ("sofa_2seat", "corner_sofa") is detected as Living', () => {
        for (const t of ['sofa_2seat', 'corner_sofa', 'barcelona_sofa_3seat']) {
            registerRoom(10);
            const items = catalogueFurniture([{ id: 'f1', furnitureType: t }]);
            storeRegistry.register('furniture', makeStore(items));
            setContents('r1', { furniture: items });
            expect(classifyRoomForAutofill('r1')?.label, `type ${t}`).toBe('Living');
        }
    });

    it('a desk labelled by a catalogue variant ("desk_zen") is detected as Office', () => {
        registerRoom(10);
        const items = catalogueFurniture([{ id: 'f1', furnitureType: 'desk_zen' }]);
        storeRegistry.register('furniture', makeStore(items));
        setContents('r1', { furniture: items });
        expect(classifyRoomForAutofill('r1')?.label).toBe('Office');
    });

    it('a dining table labelled by the catalogue type "dining_table" is detected as Dining', () => {
        registerRoom(10);
        const items = catalogueFurniture([{ id: 'f1', furnitureType: 'dining_table' }]);
        storeRegistry.register('furniture', makeStore(items));
        setContents('r1', { furniture: items });
        expect(classifyRoomForAutofill('r1')).toEqual({
            ruleId: 'dining-table', label: 'Dining', occupancyType: 'dining-room',
        });
    });

    it('a compound wardrobe variant ("corner_wardrobe") is still detected as Dressing when small (unchanged baseline)', () => {
        registerRoom(5);
        const items = catalogueFurniture([{ id: 'f1', furnitureType: 'corner_wardrobe' }]);
        storeRegistry.register('furniture', makeStore(items));
        setContents('r1', { furniture: items });
        expect(classifyRoomForAutofill('r1')?.label).toBe('Dressing');
    });

    // ── The founder's own acceptance rooms (Level 1 plan view) ────────────────

    it('ACCEPTANCE: 28.2 m² with bed + wardrobe -> Bedroom (was Dressing)', () => {
        registerRoom(28.2);
        const items = catalogueFurniture([
            { id: 'f1', furnitureType: 'nordic_bed' },
            { id: 'f2', furnitureType: 'wardrobe_l_shape' },
        ]);
        storeRegistry.register('furniture', makeStore(items));
        setContents('r1', { furniture: items });
        expect(classifyRoomForAutofill('r1')?.occupancyType).toBe('bedroom');
    });

    it('ACCEPTANCE: 24.7 m² with bed + wardrobe -> Bedroom (was Dressing)', () => {
        registerRoom(24.7);
        const items = catalogueFurniture([
            { id: 'f1', furnitureType: 'solid_wood_bed' },
            { id: 'f2', furnitureType: 'wardrobe' },
        ]);
        storeRegistry.register('furniture', makeStore(items));
        setContents('r1', { furniture: items });
        expect(classifyRoomForAutofill('r1')?.occupancyType).toBe('bedroom');
    });

    it('ACCEPTANCE: 75.0 m² with sofa + kitchen + dining table -> Kitchen (Kitchen-Living combo; was Dressing)', () => {
        registerRoom(75.0);
        const items = catalogueFurniture([
            { id: 'f1', furnitureType: 'sofa_3seat' },
            { id: 'f2', furnitureType: 'kitchen_u_shape' },
            { id: 'f3', furnitureType: 'dining_table' },
        ]);
        storeRegistry.register('furniture', makeStore(items));
        setContents('r1', { furniture: items });
        expect(classifyRoomForAutofill('r1')).toEqual({
            ruleId: 'kitchen-living-combo', label: 'Kitchen-Living', occupancyType: 'kitchen',
        });
    });

    it('ACCEPTANCE: 24.5 m² with a stair -> Core/stairwell (was left unclassified entirely)', () => {
        registerRoom(24.5);
        storeRegistry.register('furniture', makeStore([]));
        setContents('r1', { stairs: [{ id: 's1' }] });
        expect(classifyRoomForAutofill('r1')).toEqual({
            ruleId: 'core-stair', label: 'Core', occupancyType: 'stairwell',
        });
    });

    it('ACCEPTANCE: 8.9 m² with WC + basin -> Bathroom (already correct — must not regress)', () => {
        registerRoom(8.9);
        storeRegistry.register('furniture', makeStore([]));
        storeRegistry.register('plumbing', makeStore([
            { id: 'p1', fixtureType: 'wc' },
            { id: 'p2', fixtureType: 'basin' },
        ]));
        setContents('r1', { plumbing: [{ id: 'p1' }, { id: 'p2' }] });
        expect(classifyRoomForAutofill('r1')).toEqual({
            ruleId: 'bathroom-wet-fixtures', label: 'Bathroom', occupancyType: 'bathroom',
        });
    });
});

describe('classifyRoomForAutofill — §DOMINANCE-BED is TRUE BY CONSTRUCTION', () => {
    beforeEach(() => {
        (globalThis as any).window = {};
        storeRegistry.register('plumbing', makeStore([]));
    });
    afterEach(() => { delete (globalThis as any).window; });

    it('"bedroom-bed" is NOT a row in ROOM_AUTOFILL_RULES — it is a precondition, not array position', () => {
        expect(ROOM_AUTOFILL_RULES.some((r) => r.id === 'bedroom-bed')).toBe(false);
    });

    it('bed beats EVERY OTHER signal at once — wardrobe, kitchen, sofa, dining, desk all present, still Bedroom', () => {
        registerRoom(60); // large enough that area demotion would matter if it wrongly applied to bed
        const items = catalogueFurniture([
            { id: 'f1', furnitureType: 'bed' },
            { id: 'f2', furnitureType: 'wardrobe' },
            { id: 'f3', furnitureType: 'kitchen_straight' },
            { id: 'f4', furnitureType: 'sofa' },
            { id: 'f5', furnitureType: 'dining_table' },
            { id: 'f6', furnitureType: 'desk' },
        ]);
        storeRegistry.register('furniture', makeStore(items));
        setContents('r1', { furniture: items });
        expect(classifyRoomForAutofill('r1')).toEqual({
            ruleId: 'bedroom-bed', label: 'Bedroom', occupancyType: 'bedroom',
        });
    });

    it('bed dominance is NEVER overturned by area — a 224 m² room with a bed is still Bedroom, not demoted to unclassified', () => {
        registerRoom(224.65);
        const items = catalogueFurniture([{ id: 'f1', furnitureType: 'bed' }]);
        storeRegistry.register('furniture', makeStore(items));
        setContents('r1', { furniture: items });
        expect(classifyRoomForAutofill('r1')?.occupancyType).toBe('bedroom');
    });
});

describe('classifyRoomForAutofill — §AREA-DEMOTION is SECONDARY (wardrobe-only rooms only)', () => {
    beforeEach(() => {
        (globalThis as any).window = {};
        storeRegistry.register('plumbing', makeStore([]));
    });
    afterEach(() => { delete (globalThis as any).window; });

    it('a SMALL wardrobe-only room (< 14 m²) is still Dressing', () => {
        registerRoom(6);
        const items = catalogueFurniture([{ id: 'f1', furnitureType: 'wardrobe' }]);
        storeRegistry.register('furniture', makeStore(items));
        setContents('r1', { furniture: items });
        expect(classifyRoomForAutofill('r1')?.occupancyType).toBe('storage-residential');
    });

    it('a LARGE wardrobe-only room (>= 14 m², e.g. the founder\'s 224 m² example) is demoted to unclassified, never asserted as Dressing', () => {
        registerRoom(224.65);
        const items = catalogueFurniture([{ id: 'f1', furnitureType: 'wardrobe' }]);
        storeRegistry.register('furniture', makeStore(items));
        setContents('r1', { furniture: items });
        expect(classifyRoomForAutofill('r1')).toBeNull();
    });

    it('a room with NO recorded area still classifies wardrobe-only as Dressing (undefined never demotes — unknown is not "too big")', () => {
        registerRoom(undefined);
        const items = catalogueFurniture([{ id: 'f1', furnitureType: 'wardrobe' }]);
        storeRegistry.register('furniture', makeStore(items));
        setContents('r1', { furniture: items });
        expect(classifyRoomForAutofill('r1')?.occupancyType).toBe('storage-residential');
    });
});
