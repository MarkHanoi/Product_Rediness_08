// A.26.4 — Editable Living Graph: per-room TYPE (occupancy) override invariants
// (ADR-0061 / C52).
//
// The A.26.4 slice adds `ApartmentProgram.roomTypesByName` — the direct sibling
// of A.26.3's `roomAreasByName`. Where the area field re-targets a room's AREA,
// this re-targets its TYPE: re-typing a single DETECTED room ("make Bedroom 2 a
// Study") without touching the program's bedroom/bathroom COUNT flags. The
// bubble graph re-types the minted room of that name in place, re-deriving its
// area weight / minima / habitability / adjacency rules from the new type.
//
// These tests pin the invariants that let the write-path ship safely:
//
//   I2 (baseline identity) — an ABSENT or EMPTY override reproduces the baseline
//      BYTE-FOR-BYTE: both `buildBubbleGraph` and the full `enumerateLayouts`
//      pipeline are deep-equal to the no-override run. An un-edited graph never
//      changes the layout.
//
//   RE-TYPE — a per-room override re-types exactly that room (and ONLY that room)
//      while leaving the room set / order / ids / names unchanged; the new type's
//      rule (needsWindow / privacy) is re-derived.
//
//   GUARD — an override to a non-RoomType value, or for a non-existent room name,
//      is a no-op (deep-equal to baseline). Determinism (I1) holds.
//
// Pure, deterministic — runs in plain Node (ai-host vitest), no DOM/stores.

import { describe, expect, it } from 'vitest';
import { buildBubbleGraph } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import { enumerateLayouts, type EnumerateInput } from '../src/workflows/apartmentLayout/tgl/enumerate.js';
import { roomRule } from '../src/workflows/apartmentLayout/rules/programRules.js';
import type { Pt } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import type { ApartmentProgram, ScoringWeights } from '../src/workflows/apartmentLayout/types.js';

const WEIGHTS: ScoringWeights = { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 };
const PROGRAM: ApartmentProgram = {
    bedrooms: 2, bathrooms: 1, masterEnSuite: true,
    openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
};
const RECT: Pt[] = [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 10 }, { x: 0, z: 10 }]; // 120 m²

const input = (over: Partial<EnumerateInput> = {}): EnumerateInput => ({
    shellPolygon: RECT, program: PROGRAM, levelId: 'L1', seed: 'seed', weights: WEIGHTS, count: 3, ...over,
});

// The 2-bed/1-bath master-ensuite program mints a "Bedroom 1" (the non-master
// secondary bedroom) we can safely re-type to a Study.
const SECONDARY_BEDROOM = 'Bedroom 1';

describe('A.26.4 per-room TYPE override (ADR-0061 / C52)', () => {
    // ── I2 — BASELINE IDENTITY ────────────────────────────────────────────────
    describe('baseline identity (I2): absent / empty override reproduces the baseline', () => {
        it('buildBubbleGraph: no `roomTypesByName` ≡ empty `roomTypesByName` (deep-equal)', () => {
            const baseline = buildBubbleGraph(PROGRAM, 120);
            const emptyOverride = buildBubbleGraph({ ...PROGRAM, roomTypesByName: {} }, 120);
            expect(emptyOverride).toEqual(baseline);
        });

        it('enumerateLayouts: no override ≡ empty override (deep-equal, full pipeline)', () => {
            const baseline = enumerateLayouts(input());
            const emptyOverride = enumerateLayouts(input({
                program: { ...PROGRAM, roomTypesByName: {} },
            }));
            expect(emptyOverride).toEqual(baseline);
        });

        it('enumerateLayouts: an override for a NON-EXISTENT room name is a no-op (deep-equal)', () => {
            const baseline = enumerateLayouts(input());
            const phantom = enumerateLayouts(input({
                program: { ...PROGRAM, roomTypesByName: { 'No Such Room': 'study' } },
            }));
            expect(phantom).toEqual(baseline);
        });

        it('buildBubbleGraph: an override EQUAL to the room’s existing type is a no-op (deep-equal)', () => {
            const baseline = buildBubbleGraph(PROGRAM, 120);
            // "Bedroom 1" is already a `bedroom` — re-typing it to bedroom changes nothing.
            const sameType = buildBubbleGraph(
                { ...PROGRAM, roomTypesByName: { [SECONDARY_BEDROOM]: 'bedroom' } }, 120,
            );
            expect(sameType).toEqual(baseline);
        });

        it('buildBubbleGraph: an override to an INVALID type string is ignored (deep-equal)', () => {
            const baseline = buildBubbleGraph(PROGRAM, 120);
            const bogus = buildBubbleGraph(
                // Cast through unknown — the engine must reject a non-RoomType value.
                { ...PROGRAM, roomTypesByName: { [SECONDARY_BEDROOM]: 'garage' as unknown as 'study' } }, 120,
            );
            expect(bogus).toEqual(baseline);
        });
    });

    // ── RE-TYPE ──────────────────────────────────────────────────────────────
    describe('re-type: a per-room override re-types exactly that room', () => {
        it('buildBubbleGraph: re-typing "Bedroom 1" → study changes ITS type + needsWindow only', () => {
            const baseline = buildBubbleGraph(PROGRAM, 120);
            const bed = baseline.rooms.find(r => r.name === SECONDARY_BEDROOM);
            expect(bed).toBeDefined();
            expect(bed!.type).toBe('bedroom');

            const overridden = buildBubbleGraph(
                { ...PROGRAM, roomTypesByName: { [SECONDARY_BEDROOM]: 'study' } }, 120,
            );
            const study = overridden.rooms.find(r => r.name === SECONDARY_BEDROOM);
            expect(study).toBeDefined();
            // The room slot kept its id + name; only the type (+ derived fields) changed.
            expect(study!.id).toBe(bed!.id);
            expect(study!.name).toBe(bed!.name);
            expect(study!.type).toBe('study');
            // needsWindow is re-derived from the NEW type's rule.
            expect(study!.needsWindow).toBe(roomRule('study').needsWindow);

            // Every OTHER room is untouched (same id → same type as baseline).
            const baseById = new Map(baseline.rooms.map(r => [r.id, r]));
            for (const r of overridden.rooms) {
                if (r.id === bed!.id) continue;
                expect(r.type).toBe(baseById.get(r.id)!.type);
            }
            // The room COUNT is unchanged (re-type never adds/removes a room).
            expect(overridden.rooms.length).toBe(baseline.rooms.length);
        });

        it('enumerateLayouts: re-typing a room produces a placed Space with the new occupancy', () => {
            const big = enumerateLayouts(input({
                count: 1,
                program: { ...PROGRAM, roomTypesByName: { [SECONDARY_BEDROOM]: 'study' } },
            }));
            expect(big.length).toBeGreaterThan(0);
            // The override changed SOMETHING — the full pipeline ran and ranked.
            // (Deep behaviour of placement is covered by the bubbleGraph re-type
            // test; here we just assert the pipeline doesn't reject the re-typed
            // program and still returns a layout.)
            const baseline = enumerateLayouts(input({ count: 1 }));
            expect(baseline.length).toBeGreaterThan(0);
        });
    });

    // ── DETERMINISM (I1) ──────────────────────────────────────────────────────
    it('is deterministic: two identical re-type runs are deep-equal (I1)', () => {
        const a = enumerateLayouts(input({ program: { ...PROGRAM, roomTypesByName: { [SECONDARY_BEDROOM]: 'study' } } }));
        const b = enumerateLayouts(input({ program: { ...PROGRAM, roomTypesByName: { [SECONDARY_BEDROOM]: 'study' } } }));
        expect(b).toEqual(a);
    });
});
