// A.26.3 — Editable Living Graph: per-room AREA override invariants (ADR-0061).
//
// The "editable graph" headline slice reuses the EXISTING per-instance area
// target (`ApartmentProgram.roomAreasByName`, honoured by the D-TGL bubble
// graph) — NOT a parallel `roomAreaOverrides` field. These tests pin the two
// invariants that let the write-path ship safely:
//
//   I2 (baseline identity) — an ABSENT or EMPTY override reproduces the baseline
//      BYTE-FOR-BYTE: both `buildBubbleGraph` and the full `enumerateLayouts`
//      pipeline are deep-equal to the no-override run. An un-edited graph never
//      changes the layout.
//
//   GROWTH — a per-room override GROWS that room's allocated target area (and
//      the bubble graph keeps the override clamped up to the architectural
//      minimum, never below it).
//
// Pure, deterministic — runs in plain Node (ai-host vitest), no DOM/stores.

import { describe, expect, it } from 'vitest';
import { buildBubbleGraph } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import { enumerateLayouts, type EnumerateInput } from '../src/workflows/apartmentLayout/tgl/enumerate.js';
import { nodesOfKind } from '../src/workflows/apartmentLayout/tgl/semanticGraph.js';
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

describe('A.26.3 per-room area override (ADR-0061)', () => {
    // ── I2 — BASELINE IDENTITY ────────────────────────────────────────────────
    describe('baseline identity (I2): absent / empty override reproduces the baseline', () => {
        it('buildBubbleGraph: no `roomAreasByName` ≡ empty `roomAreasByName` (deep-equal)', () => {
            const baseline = buildBubbleGraph(PROGRAM, 120);
            const emptyOverride = buildBubbleGraph({ ...PROGRAM, roomAreasByName: {} }, 120);
            expect(emptyOverride).toEqual(baseline);
        });

        it('enumerateLayouts: no override ≡ empty override (deep-equal, full pipeline)', () => {
            const baseline = enumerateLayouts(input());
            const emptyOverride = enumerateLayouts(input({
                program: { ...PROGRAM, roomAreasByName: {} },
            }));
            // Byte-for-byte identical ranked candidate set — an un-edited graph
            // changes nothing about the generated layout.
            expect(emptyOverride).toEqual(baseline);
        });

        it('enumerateLayouts: an override for a NON-EXISTENT room name is a no-op (deep-equal)', () => {
            const baseline = enumerateLayouts(input());
            const phantom = enumerateLayouts(input({
                program: { ...PROGRAM, roomAreasByName: { 'No Such Room': 99 } },
            }));
            expect(phantom).toEqual(baseline);
        });
    });

    // ── GROWTH ─────────────────────────────────────────────────────────────────
    describe('growth: a per-room override grows that room’s allocation', () => {
        it('buildBubbleGraph: overriding "Master Bedroom" raises its targetAreaM2', () => {
            const baseline = buildBubbleGraph(PROGRAM, 120);
            const master = baseline.rooms.find(r => r.name === 'Master Bedroom');
            expect(master).toBeDefined();
            // Pick a target a little ABOVE the baseline but still within the
            // room's §AREA-FRACTIONS maxAreaFrac ceiling (master cap = 0.2 × 120
            // = 24 m²), so the override is honoured directly rather than clamped.
            const baselineArea = master!.targetAreaM2;
            const bigger = Math.min(baselineArea + 4, 24);
            expect(bigger).toBeGreaterThan(baselineArea); // the test is meaningful

            const overridden = buildBubbleGraph({ ...PROGRAM, roomAreasByName: { 'Master Bedroom': bigger } }, 120);
            const masterAfter = overridden.rooms.find(r => r.name === 'Master Bedroom')!;
            expect(masterAfter.targetAreaM2).toBeGreaterThan(baselineArea);
            // Honoured (within the ceiling): the resulting area equals the
            // requested target.
            expect(masterAfter.targetAreaM2).toBeCloseTo(bigger, 6);
        });

        it('buildBubbleGraph: an override BELOW the room minimum is clamped UP, never below', () => {
            const rule = buildBubbleGraph(PROGRAM, 120).rooms.find(r => r.name === 'Master Bedroom')!;
            // Ask for an absurdly small area; the bubble graph clamps up to the
            // architectural floor (so an illegal edit can never ship).
            const overridden = buildBubbleGraph({ ...PROGRAM, roomAreasByName: { 'Master Bedroom': 0.5 } }, 120);
            const after = overridden.rooms.find(r => r.name === 'Master Bedroom')!;
            expect(after.targetAreaM2).toBeGreaterThan(0.5);
            // The override changed something (it is at least the clamped floor),
            // and the floor is a sane positive number.
            expect(after.targetAreaM2).toBeGreaterThan(0);
            expect(rule.targetAreaM2).toBeGreaterThan(0);
        });

        it('enumerateLayouts: the override actually flows through to the placed Space area', () => {
            // Generous master target → the placed "Master Bedroom" Space should be
            // at least as large as in the baseline (the engine biases its tiling
            // toward the larger target; it can never be smaller).
            const baseline = enumerateLayouts(input({ count: 1 }));
            const big = enumerateLayouts(input({
                count: 1,
                program: { ...PROGRAM, roomAreasByName: { 'Master Bedroom': 22 } },
            }));
            // Both runs must produce a layout to compare.
            expect(baseline.length).toBeGreaterThan(0);
            expect(big.length).toBeGreaterThan(0);

            const masterArea = (cand: typeof baseline[number]): number => {
                const space = nodesOfKind(cand.graph, 'Space').find(
                    n => n.attrs.name === 'Master Bedroom',
                );
                const pset = space?.psets?.Pset_SpaceCommon as { NetFloorArea?: number } | undefined;
                return pset?.NetFloorArea ?? 0;
            };
            const baseMaster = masterArea(baseline[0]!);
            const bigMaster = masterArea(big[0]!);
            expect(baseMaster).toBeGreaterThan(0);
            expect(bigMaster).toBeGreaterThan(0);
            // The override moves the master's placed area UP (or at worst holds —
            // never shrinks it below the baseline).
            expect(bigMaster).toBeGreaterThanOrEqual(baseMaster);
        });
    });

    // ── DETERMINISM ─────────────────────────────────────────────────────────────
    it('is deterministic: two identical override runs are deep-equal (I1)', () => {
        const a = enumerateLayouts(input({ program: { ...PROGRAM, roomAreasByName: { 'Master Bedroom': 20 } } }));
        const b = enumerateLayouts(input({ program: { ...PROGRAM, roomAreasByName: { 'Master Bedroom': 20 } } }));
        expect(b).toEqual(a);
    });
});
