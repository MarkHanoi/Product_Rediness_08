// §FEAT-KITCHEN-ACCURATE-PREVIEW / §FEAT-KITCHEN-PLAN-SYMBOL (ADR-0112,
// founder L-34 / L-35) — the kitchen placement PREVIEW ghost and the placed
// PLAN SYMBOL are driven by ONE config→linework builder, so the preview is the
// exact configured cabinet run (true L / U / galley / single-wall / island
// outline + glyphs), never a bounding box, and the symbol reflects the real arm
// lengths / unit counts.
//
// These assertions pin the pure, deterministic linework surface
// (`buildConfigLinework`) that both the 3D ghost (KitchenCabinetEngine, tested
// separately) and the plan ghost (FurniturePlanToolHandler) and the placed
// symbol share. The buffer is a flat [x,0,z, x,0,z, …] line-segment list.

import { describe, expect, it } from 'vitest';
import {
    KitchenPlanSymbolBuilder,
    kitchenPlanSymbolBuilder,
} from '../src/builders/KitchenPlanSymbolBuilder';
import { buildDefaultKitchenConfig } from '../src/KitchenTypes';
import type { KitchenCabinetConfig, KitchenUnitConfig } from '../src/KitchenTypes';

const builder = new KitchenPlanSymbolBuilder();

/** Count line segments (the buffer is 6 floats per segment: x,y,z,x,y,z). */
const segCount = (buf: number[]): number => buf.length / 6;

/** Axis-aligned bounding box of the flat [x,0,z,…] buffer. */
function bbox(buf: number[]): { minX: number; maxX: number; minZ: number; maxZ: number } {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i + 5 < buf.length; i += 6) {
        for (const [x, z] of [[buf[i], buf[i + 2]], [buf[i + 3], buf[i + 5]]] as const) {
            minX = Math.min(minX, x!); maxX = Math.max(maxX, x!);
            minZ = Math.min(minZ, z!); maxZ = Math.max(maxZ, z!);
        }
    }
    return { minX, maxX, minZ, maxZ };
}

const unit = (index: number, extra: Partial<KitchenUnitConfig> = {}): KitchenUnitConfig =>
    ({ index, arm: 'main', front: 'door', ...extra });

describe('§FEAT-KITCHEN-ACCURATE-PREVIEW — preview linework ≡ placed-symbol linework', () => {
    it('L-shape: the shared linework is NOT a bounding box — the arm return extends past the main-run depth', () => {
        const cfg = buildDefaultKitchenConfig('kitchen_l_shape', 'door');
        const buf = kitchenPlanSymbolBuilder.buildConfigLinework(cfg);
        expect(segCount(buf)).toBeGreaterThan(0);

        // A bounding box would be a single rectangle: exactly 2 distinct Z values.
        // The true L has a LEFT arm that extends far in +Z beyond the main run, so
        // the Z-extent must exceed the main-run depth (≈0.6 m) by the arm length.
        const box = bbox(buf);
        const zExtent = box.maxZ - box.minZ;
        expect(zExtent).toBeGreaterThan(cfg.depth + 1.0);   // arm ≈ 1.8 m
        // And the X-extent spans the full main run length (± overhang), proving the
        // outline is the real footprint, not a depth-only strip.
        expect(box.maxX - box.minX).toBeGreaterThan(cfg.length - 0.5);
    });

    it('preview and placed symbol call the SAME builder → byte-identical linework', () => {
        const cfg = buildDefaultKitchenConfig('kitchen_l_shape', 'door');
        // The plan-preview path (FurniturePlanToolHandler) and the placed-symbol
        // path (inject → _buildLocalLinework) both funnel through the same config.
        const preview = kitchenPlanSymbolBuilder.buildConfigLinework(cfg);
        const placed  =
            (builder as unknown as { _buildLocalLinework(k: unknown): number[] })
                ._buildLocalLinework({ kitchenConfig: cfg } as unknown as never);
        expect(preview).toEqual(placed);
    });

    it('is deterministic (same config → identical buffer)', () => {
        const cfg = buildDefaultKitchenConfig('kitchen_u_shape', 'door');
        expect(kitchenPlanSymbolBuilder.buildConfigLinework(cfg))
            .toEqual(kitchenPlanSymbolBuilder.buildConfigLinework(cfg));
    });
});

describe('§FEAT-KITCHEN-PLAN-SYMBOL — symbol reflects the configured unit count', () => {
    const straight = (n: number): KitchenCabinetConfig => ({
        layoutType: 'kitchen_straight', depth: 0.6, length: 3.0, height: 0.9,
        numUnits: n,
        units: Array.from({ length: n }, (_, i) => unit(i)),   // plain door units
    });

    it('more units → more section dividers (N units add N−1 dividers each rebuild)', () => {
        const three = kitchenPlanSymbolBuilder.buildConfigLinework(straight(3));
        const six   = kitchenPlanSymbolBuilder.buildConfigLinework(straight(6));
        // Each extra unit adds one divider tick + one door-swing (arc = 8 segs) +
        // one front edge, so the 6-unit run is strictly larger than the 3-unit run.
        expect(segCount(six)).toBeGreaterThan(segCount(three));
        // The delta is at least the extra dividers (3) — monotonic in unit count.
        expect(segCount(six) - segCount(three)).toBeGreaterThanOrEqual(3);
    });
});

// Direct access to the pure work-triangle drawer — the cleanest way to pin its
// behaviour without confounding cabinet/arc geometry.
type TriKind = 'sink' | 'hob' | 'fridge';
interface TriPoint { x: number; z: number; kind: TriKind }
type TriAccess = { _drawWorkTriangle(out: number[], pts: TriPoint[]): void };
const drawTriangle = (pts: TriPoint[]): number[] => {
    const out: number[] = [];
    (builder as unknown as TriAccess)._drawWorkTriangle(out, pts);
    return out;
};

describe('§FEAT-KITCHEN-PLAN-SYMBOL — work-triangle overlay', () => {
    const sink:   TriPoint = { x: 0,   z: 0, kind: 'sink'   };
    const hob:    TriPoint = { x: 1.5, z: 0, kind: 'hob'    };
    const fridge: TriPoint = { x: 0.8, z: 1.2, kind: 'fridge' };

    it('all three poles → a closed triangle (dashed legs present)', () => {
        const buf = drawTriangle([sink, hob, fridge]);
        expect(segCount(buf)).toBeGreaterThan(0);
    });

    it('only ONE pole → no triangle (needs ≥2 distinct poles)', () => {
        expect(drawTriangle([sink]).length).toBe(0);
    });

    it('two poles → a single connecting leg (fewer dashes than the full triangle)', () => {
        const twoLeg = drawTriangle([sink, hob]);
        const full   = drawTriangle([sink, hob, fridge]);
        expect(segCount(twoLeg)).toBeGreaterThan(0);
        expect(segCount(full)).toBeGreaterThan(segCount(twoLeg));
    });

    it('the default straight run (sink + hob + fridge) draws the triangle end-to-end', () => {
        // Regression: buildConfigLinework for the default kitchen includes triangle legs.
        const withTri = kitchenPlanSymbolBuilder.buildConfigLinework(
            buildDefaultKitchenConfig('kitchen_straight', 'door'),
        );
        const noAppliances = kitchenPlanSymbolBuilder.buildConfigLinework(straightNoAppliances());
        expect(segCount(withTri)).toBeGreaterThan(segCount(noAppliances));
    });
});

function straightNoAppliances(): KitchenCabinetConfig {
    const n = 5;
    return {
        layoutType: 'kitchen_straight', depth: 0.6, length: 3.0, height: 0.9,
        numUnits: n,
        units: Array.from({ length: n }, (_, i) => unit(i)),
        frontMaterialId: 'wood-oak',
        countertopMaterialId: 'stone-marble-white',
    };
}
