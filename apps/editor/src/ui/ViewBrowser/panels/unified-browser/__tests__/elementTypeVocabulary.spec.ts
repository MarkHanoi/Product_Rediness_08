/**
 * @file apps/editor/src/ui/ViewBrowser/panels/unified-browser/__tests__/elementTypeVocabulary.spec.ts
 *
 * §BROWSER-ONE-VOCABULARY (L-1172) — the Project tree's `UNKNOWN 227`.
 *
 * ─── THE FOUNDER'S REPORT (2026-08-19, production) ──────────────────────────
 * His Level 15 node read `WALL 25 · SLAB 1 · UNKNOWN 227 · ROOM 1`, immediately
 * after a bulk window create. 227 elements on one level with no type at all.
 *
 * ─── ⭐ THE ELEMENTS GENUINELY HAVE NO TYPE — THAT IS THE FINDING ────────────
 * This is NOT a casing mismatch and not a lookup bug. `DoorOpeningSchema`
 * (`packages/geometry-door/src/DoorTypes.ts`), `WindowOpeningSchema`
 * (`packages/geometry-window/src/WindowTypes.ts`) and `BeamData`
 * (`packages/core-app-model/src/stores/BeamTypes.ts`) declare NO `type` /
 * `elementType` field. They are Zod objects in default STRIP mode, so a caller
 * that passes `type` has it DELETED on the way in — a door record cannot carry
 * its own kind today even deliberately. Every other store in `getAllStores`
 * declares one. `UNKNOWN` is therefore exactly `doors + windows + beams`, and
 * `groupByType`'s `?? 'Unknown'` was reporting that accurately.
 *
 * ⚠ THE ROOT FIX IS THE DTO, AND IT IS NOT THIS FILE. Adding the field changes
 * the persisted schema and every safeParse round-trip, so it belongs to the
 * geometry-door / geometry-window / core-app-model owners. What is fixed here is
 * the READ: the browser stops rendering `UNKNOWN` for elements whose kind is
 * knowable, using PROVENANCE — a record returned by `window.doorStore` IS a
 * door — rather than inventing a fourth private vocabulary (the C84 EI-8/EI-9
 * trap). The `declared` branch always wins, so the day the DTO carries `type`
 * this table goes quiet on its own.
 *
 * ─── THE NEGATIVE CONTROL ───────────────────────────────────────────────────
 * A fix that guessed would relabel things it should not. The controls pin that a
 * DECLARED type is never overridden by provenance, and that an element in no
 * store still reports `Unknown` — a row the tree cannot name stays visible as a
 * finding rather than being quietly absorbed into a plausible bucket.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { elementTypeName, groupByType } from '../BrowserDataHelpers';

type AnyRec = Record<string, unknown>;

/** A store stand-in shaped like the real ones: `getById` is a Map lookup. */
function fakeStore(records: AnyRec[]): AnyRec {
    const byId = new Map(records.map((r) => [String(r.id), r]));
    return {
        getAll: () => records,
        getById: (id: string) => byId.get(String(id)),
    };
}

const w = () => globalThis as unknown as Record<string, unknown>;

/** A door record EXACTLY as `DoorStore.add()` freezes it — note: no `type` key. */
const DOOR = Object.freeze({
    id: 'd-1', openingId: 'o-1', wallId: 'w-1',
    offset: 1, width: 0.9, height: 2.1, sillHeight: 0, doorType: 'single',
});
/** A window record as `WindowStore.add()` freezes it — likewise typeless. */
const WINDOW = Object.freeze({
    id: 'win-1', openingId: 'o-2', wallId: 'w-1',
    offset: 3, width: 1.2, height: 1.4, sillHeight: 0.9, windowType: 'single',
});
/** A beam — the third typeless DTO, and the one nobody had noticed. */
const BEAM = Object.freeze({ id: 'b-1', levelId: 'L15' });
/** A wall — the control: it DECLARES its type, like every other store. */
const WALL = Object.freeze({ id: 'w-1', type: 'wall', levelId: 'L15' });

const STORE_KEYS = [
    'wallStore', 'curtainWallStore', 'slabStore', 'floorStore', 'ceilingStore',
    'doorStore', 'windowStore', 'openingStore', 'furnitureStore', 'lightingStore',
    'stairStore', 'handrailStore', 'columnStore', 'beamStore', 'plumbingStore', 'roomStore',
];

describe('§BROWSER-ONE-VOCABULARY — elementTypeName', () => {
    beforeEach(() => {
        for (const k of STORE_KEYS) delete w()[k];
        w().wallStore = fakeStore([WALL]);
        w().doorStore = fakeStore([DOOR]);
        w().windowStore = fakeStore([WINDOW]);
        w().beamStore = fakeStore([BEAM]);
    });
    afterEach(() => {
        for (const k of STORE_KEYS) delete w()[k];
    });

    // ⭐ THE DIFFERENTIATOR. These three records are byte-for-byte what the stores hold in
    // production — no `type`, no `elementType` — and they must no longer read as 'Unknown'.
    it('names a typeless DOOR record by the store that holds it', () => {
        expect(elementTypeName(DOOR)).toBe('door');
    });

    it('names a typeless WINDOW record by the store that holds it', () => {
        expect(elementTypeName(WINDOW)).toBe('window');
    });

    it('names a typeless BEAM record — the third typeless DTO, in the same bucket', () => {
        expect(elementTypeName(BEAM)).toBe('beam');
    });

    // ── Negative controls ────────────────────────────────────────────────────
    // A DECLARED type is the authority and provenance never overrides it. If this ever
    // inverted, the browser would be re-classifying elements that already know what they are.
    it('never overrides a DECLARED type with provenance', () => {
        w().doorStore = fakeStore([{ ...WALL }]); // a wall sitting in the wrong store
        expect(elementTypeName(WALL)).toBe('wall');
    });

    // A row the tree cannot name must stay VISIBLE as `Unknown`. Absorbing it into a
    // plausible-looking bucket would turn a finding into a silent misreport — the same
    // false-negative shape as the defect this fixes, with the opposite sign.
    it('still reports Unknown for a record in no known store', () => {
        expect(elementTypeName({ id: 'ghost-1' })).toBe('Unknown');
    });

    it('never throws on junk input from a half-initialised engine', () => {
        expect(elementTypeName(null)).toBe('Unknown');
        expect(elementTypeName(undefined)).toBe('Unknown');
        expect(elementTypeName('not-an-element')).toBe('Unknown');
        expect(elementTypeName({})).toBe('Unknown');
    });

    // ⭐ THE FOUNDER'S TREE ROW, reproduced then fixed. This is the assertion that would have
    // failed before the change: every hosted opening landed in one `Unknown` group.
    it('groupByType files the founder\'s level into NAMED groups, not one UNKNOWN pile', () => {
        const groups = groupByType([WALL, DOOR, WINDOW, BEAM], 'L15');
        expect([...groups.keys()].sort()).toEqual(['beam', 'door', 'wall', 'window']);
        expect(groups.has('Unknown')).toBe(false);
        expect(groups.get('window')!.length).toBe(1);
    });

    // Provenance is memoised per record. The tree re-renders on every selection change, and
    // the founder's model holds ~3,300 openings — a per-row rescan of 16 stores on every
    // repaint is the kind of cost that shows up as a stall, not as a bug report.
    it('memoises the provenance lookup so a re-render does not re-scan the stores', () => {
        let calls = 0;
        const counting = fakeStore([DOOR]);
        const inner = counting.getById as (id: string) => unknown;
        counting.getById = (id: string) => { calls++; return inner(id); };
        w().doorStore = counting;
        expect(elementTypeName(DOOR)).toBe('door');
        const afterFirst = calls;
        elementTypeName(DOOR);
        elementTypeName(DOOR);
        expect(calls).toBe(afterFirst);
    });
});
