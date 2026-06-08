// A.25.3 — Living Design Parameters: the four NON-scoring engine-tuning axes
// (adjacency / accessibility / climate / space) → EngineTuning, plus the
// engine-side bindings each axis drives. Validates that:
//   • the NEUTRAL position (all four at 0.5) is IDENTITY (returns null), and
//   • each axis at its extreme changes exactly its target engine input as
//     expected, leaving the others at their neutral constants.

import { describe, expect, it } from 'vitest';
import {
    designParamsToEngineTuning,
    DEFAULT_DESIGN_PARAMS,
    type DesignParams,
} from '../src/workflows/apartmentLayout/designParamsToScoringWeights.js';
import { computeObjectives } from '../src/workflows/apartmentLayout/tgl/objectives.js';
import { buildBubbleGraph } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import { generateDeterministicLayouts } from '../src/workflows/apartmentLayout/tgl/runDeterministicLayout.js';
import type { ShellAnalysis } from '../src/workflows/apartmentLayout/shellAnalysis.js';
import type {
    ApartmentProgram,
    ApartmentConstraints,
    ScoringWeights,
} from '../src/workflows/apartmentLayout/types.js';

// ── designParamsToEngineTuning ───────────────────────────────────────────────

describe('designParamsToEngineTuning — NEUTRAL identity invariant', () => {
    it('all four axes at the neutral midpoint (0.5) returns null (identity — no tuning)', () => {
        expect(designParamsToEngineTuning(DEFAULT_DESIGN_PARAMS)).toBeNull();
    });

    it('an empty / no-arg call is neutral ⇒ null', () => {
        expect(designParamsToEngineTuning({})).toBeNull();
    });

    it('the legacy four scorer sliders never trigger tuning on their own', () => {
        // Moving only daylight/privacy/kitchen/compactness leaves the four A.25.3
        // axes at 0.5 → still identity → null.
        expect(designParamsToEngineTuning({ daylight: 1, privacy: 0, kitchen: 1, compactness: 0 })).toBeNull();
    });
});

describe('designParamsToEngineTuning — per-axis bindings', () => {
    it('climate slider drives solarWeight; neutral reproduces the D6 default 0.6', () => {
        // Neutral climate (with another axis moved so tuning is non-null) → 0.6.
        const neutralClimate = designParamsToEngineTuning({ climate: 0.5, space: 1 });
        expect(neutralClimate?.solarWeight).toBe(0.6);
        // Extremes.
        expect(designParamsToEngineTuning({ climate: 1 })?.solarWeight).toBe(1);
        expect(designParamsToEngineTuning({ climate: 0 })?.solarWeight).toBe(0);
        // Monotonic.
        const lo = designParamsToEngineTuning({ climate: 0.25 })!.solarWeight!;
        const hi = designParamsToEngineTuning({ climate: 0.75 })!.solarWeight!;
        expect(hi).toBeGreaterThan(lo);
    });

    it('accessibility slider drives corridorWidthM; neutral reproduces the engine default 1.2 m', () => {
        const neutral = designParamsToEngineTuning({ accessibility: 0.5, space: 1 });
        expect(neutral?.corridorWidthM).toBe(1.2);
        expect(designParamsToEngineTuning({ accessibility: 1 })?.corridorWidthM).toBe(1.8);
        expect(designParamsToEngineTuning({ accessibility: 0 })?.corridorWidthM).toBe(1.0);
        // High accessibility → strictly wider than neutral.
        expect(designParamsToEngineTuning({ accessibility: 1 })!.corridorWidthM!)
            .toBeGreaterThan(1.2);
    });

    it('adjacency slider drives adjacencyStrictness; neutral reproduces 1.0', () => {
        const neutral = designParamsToEngineTuning({ adjacency: 0.5, space: 1 });
        expect(neutral?.adjacencyStrictness).toBe(1);
        expect(designParamsToEngineTuning({ adjacency: 1 })?.adjacencyStrictness).toBe(2);
        expect(designParamsToEngineTuning({ adjacency: 0 })?.adjacencyStrictness).toBe(0.5);
        // High adjacency → strictly stricter than neutral.
        expect(designParamsToEngineTuning({ adjacency: 1 })!.adjacencyStrictness!)
            .toBeGreaterThan(1);
    });

    it('space slider drives spaceGenerosity; neutral reproduces 1.0', () => {
        const neutral = designParamsToEngineTuning({ space: 0.5, climate: 1 });
        expect(neutral?.spaceGenerosity).toBe(1);
        expect(designParamsToEngineTuning({ space: 1 })?.spaceGenerosity).toBe(1.6);
        expect(designParamsToEngineTuning({ space: 0 })?.spaceGenerosity).toBe(0.6);
        expect(designParamsToEngineTuning({ space: 1 })!.spaceGenerosity!)
            .toBeGreaterThan(1);
    });

    it('clamps out-of-range / non-finite inputs', () => {
        expect(designParamsToEngineTuning({ climate: 5 })?.solarWeight)
            .toBe(designParamsToEngineTuning({ climate: 1 })?.solarWeight);
        expect(designParamsToEngineTuning({ climate: -5 })?.solarWeight)
            .toBe(designParamsToEngineTuning({ climate: 0 })?.solarWeight);
        // NaN on every axis → all neutral → null.
        expect(designParamsToEngineTuning({
            adjacency: Number.NaN, accessibility: Number.NaN, climate: Number.NaN, space: Number.NaN,
        } as Partial<DesignParams>)).toBeNull();
    });
});

// ── space → bubble-graph area allocation ─────────────────────────────────────

describe('space → bubble-graph habitable-room area (engine binding)', () => {
    const program: ApartmentProgram = {
        bedrooms: 2, bathrooms: 1, masterEnSuite: false,
        openPlanKitchenDining: false, livingRoom: true, entranceHall: true,
    };
    const SHELL_AREA = 90;

    it('neutral spaceGenerosity (1.0) reproduces the baseline area allocation byte-for-byte', () => {
        const baseline = buildBubbleGraph(program, SHELL_AREA);
        const neutral = buildBubbleGraph(program, SHELL_AREA, undefined, { spaceGenerosity: 1.0 });
        const areaByName = (g: ReturnType<typeof buildBubbleGraph>) =>
            Object.fromEntries(g.rooms.map(r => [r.name, r.targetAreaM2]));
        expect(areaByName(neutral)).toEqual(areaByName(baseline));
    });

    it('high spaceGenerosity grows the living room vs the baseline', () => {
        const baseline = buildBubbleGraph(program, SHELL_AREA);
        const generous = buildBubbleGraph(program, SHELL_AREA, undefined, { spaceGenerosity: 1.6 });
        const livingBase = baseline.rooms.find(r => r.type === 'living')!.targetAreaM2;
        const livingGen = generous.rooms.find(r => r.type === 'living')!.targetAreaM2;
        expect(livingGen).toBeGreaterThan(livingBase);
    });
});

// ── adjacency → objectives.adjacency axis (engine binding) ───────────────────

describe('adjacency → adjacencyStrictness (computeObjectives binding)', () => {
    // A tiny synthetic graph: kitchen (strongly prefers dining = 1.0) and a
    // corridor (kitchen↔corridor preference 0.3). The bubble declares BOTH edges
    // but only the WEAK one (kitchen↔corridor) is realised as a door — the strong
    // kitchen↔dining is NOT. Higher strictness should LOWER the adjacency axis
    // (penalising the missed strong adjacency harder) relative to neutral.
    function buildFixture() {
        const bubble = {
            rooms: [
                { id: 'k', type: 'kitchen' as const, name: 'Kitchen', targetAreaM2: 10, isPrivate: false, needsWindow: true },
                { id: 'd', type: 'dining' as const, name: 'Dining', targetAreaM2: 9, isPrivate: false, needsWindow: false },
                { id: 'c', type: 'corridor' as const, name: 'Corridor', targetAreaM2: 4, isPrivate: false, needsWindow: false },
            ],
            edges: [
                { a: 'k', b: 'd', via: 'door' as const },   // strong (pref 1.0) — UNREALISED
                { a: 'k', b: 'c', via: 'door' as const },   // weak (pref 0.3) — realised
            ],
            corridorId: 'c', entryId: null,
        };
        const space = (guid: string, sourceId: string, type: string) => ({
            kind: 'Space' as const, guid, sourceId,
            attrs: { spaceType: type, netAreaM2: 10, needsWindow: type === 'kitchen', isPrivate: false },
            geometry: { polygon: [{ x: 0, z: 0 }, { x: 3, z: 0 }, { x: 3, z: 3 }, { x: 0, z: 3 }] },
        });
        const graph = {
            nodes: [space('gk', 'k', 'kitchen'), space('gd', 'd', 'dining'), space('gc', 'c', 'corridor')],
            // Realise ONLY kitchen↔corridor as a door.
            edges: [{ kind: 'CONNECTS_THROUGH' as const, from: 'gk', to: 'gc' }],
        };
        const metrics = { connected: true, perSpaceDepth: { gk: 1, gd: 2, gc: 0 } };
        return { bubble, graph, metrics };
    }

    it('neutral strictness (1.0) reproduces the baseline adjacency axis exactly', () => {
        const { bubble, graph, metrics } = buildFixture();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const base = computeObjectives(graph as any, metrics as any, bubble as any, 1, 1, undefined);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const neutral = computeObjectives(graph as any, metrics as any, bubble as any, 1, 1, undefined, 1.0);
        expect(neutral.adjacency).toBeCloseTo(base.adjacency, 10);
    });

    it('high strictness penalises the MISSED strong adjacency harder (lower axis than neutral)', () => {
        const { bubble, graph, metrics } = buildFixture();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const neutral = computeObjectives(graph as any, metrics as any, bubble as any, 1, 1, undefined, 1.0);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const strict = computeObjectives(graph as any, metrics as any, bubble as any, 1, 1, undefined, 3.0);
        // satisfied = weak (0.3); required = strong (1.0) + weak (0.3).
        // strictness raises preference to a power: strong stays ≈1, weak 0.3^3≈0.027
        // → satisfied/required falls. So a missed strong adjacency hurts more.
        expect(strict.adjacency).toBeLessThan(neutral.adjacency);
    });
});

// ── climate → solar weight (end-to-end engine binding) ───────────────────────

describe('climate → solarWeight (generateDeterministicLayouts binding)', () => {
    const program: ApartmentProgram = {
        bedrooms: 2, bathrooms: 1, masterEnSuite: false,
        openPlanKitchenDining: false, livingRoom: true, entranceHall: true,
    };
    const constraints: ApartmentConstraints = {
        minCorridorWidth: 1000, wallThickness: 100, floorToCeiling: 2700, wallTypeId: 'partition',
    };
    const weights: ScoringWeights = { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 };
    const shell: ShellAnalysis = {
        perimeter: [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 9 }, { x: 0, z: 9 }],
        netAreaM2: 90, widthM: 10, depthM: 9, faces: [],
    } as unknown as ShellAnalysis;

    it('a high climate solarWeight produces a valid (non-empty) layout deterministically', () => {
        // Site at a non-equatorial latitude so the solar bias is active.
        const a = generateDeterministicLayouts(
            shell, program, constraints, weights, 3,
            undefined, undefined, { latDeg: 51.5 }, undefined, undefined,
            { solarWeight: 1.0 },
        );
        const b = generateDeterministicLayouts(
            shell, program, constraints, weights, 3,
            undefined, undefined, { latDeg: 51.5 }, undefined, undefined,
            { solarWeight: 1.0 },
        );
        expect(a.length).toBeGreaterThan(0);
        // Deterministic: same inputs ⇒ identical summaries.
        expect(a.map(o => o.summary)).toEqual(b.map(o => o.summary));
    });

    it('NEUTRAL tuning (undefined) reproduces the legacy layout exactly (Pareto-equality)', () => {
        const baseline = generateDeterministicLayouts(
            shell, program, constraints, weights, 3,
            undefined, undefined, { latDeg: 51.5 },
        );
        const withUndefinedTuning = generateDeterministicLayouts(
            shell, program, constraints, weights, 3,
            undefined, undefined, { latDeg: 51.5 }, undefined, undefined,
            undefined,
        );
        expect(withUndefinedTuning.map(o => o.summary)).toEqual(baseline.map(o => o.summary));
        // Wall geometry identical too (byte-stable).
        expect(JSON.stringify(withUndefinedTuning[0]?.walls))
            .toEqual(JSON.stringify(baseline[0]?.walls));
    });

    it('a wider accessibility corridor changes the generated geometry vs the baseline', () => {
        const baseline = generateDeterministicLayouts(
            shell, program, constraints, weights, 3,
            undefined, undefined, { latDeg: 51.5 },
        );
        const wide = generateDeterministicLayouts(
            shell, program, constraints, weights, 3,
            undefined, undefined, { latDeg: 51.5 }, undefined, undefined,
            { corridorWidthM: 1.8 },
        );
        expect(baseline.length).toBeGreaterThan(0);
        expect(wide.length).toBeGreaterThan(0);
        // The carved corridor strip is wider → at least one option's geometry differs.
        expect(JSON.stringify(wide[0]?.walls)).not.toEqual(JSON.stringify(baseline[0]?.walls));
    });
});
