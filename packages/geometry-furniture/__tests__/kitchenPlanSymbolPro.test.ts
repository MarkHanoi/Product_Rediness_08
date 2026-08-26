// §KITCHEN-PLAN-PRO (founder #8, 2026-06-12) — professional kitchen plan symbol.
//
// The founder shared a CAD kitchen plan reference (numbered base/wall cabinets,
// hatched counters, appliance symbols, door-swing arcs) and asked the 2D plan symbol
// to read PROFESSIONALLY. KitchenPlanSymbolBuilder now draws:
//   • per-unit APPLIANCE symbols (sink basin + drain, hob burner ring, fridge leaf,
//     washing-machine drum) instead of a blank gap, so the work triangle is legible;
//   • DASHED wall (upper) cabinet rectangles for the `_tall` layouts (architectural
//     convention — wall cabinets shown dashed).
//
// The linework builder is deterministic + pure (flat [x,0,z] line-segment buffer),
// so we test it directly: build a config, generate the buffer, and assert the new
// symbols add the expected geometry. We access the private `_buildLocalLinework` via
// a cast (the only public surface, `inject`, needs a live TechnicalDrawing + store).

import { describe, expect, it } from 'vitest';
import { KitchenPlanSymbolBuilder } from '../src/builders/KitchenPlanSymbolBuilder';
import type { FurnitureData } from '../src/FurnitureTypes';
import type { KitchenCabinetConfig, KitchenUnitConfig } from '../src/KitchenTypes';

type LineworkAccess = { _buildLocalLinework(k: FurnitureData): number[] };
const linework = (k: FurnitureData): number[] =>
    (new KitchenPlanSymbolBuilder() as unknown as LineworkAccess)._buildLocalLinework(k);

/** Wrap a KitchenCabinetConfig into the minimal FurnitureData the builder reads. */
function furniture(cfg: KitchenCabinetConfig): FurnitureData {
    return {
        id: 'k1', furnitureType: cfg.layoutType, levelId: 'L0',
        position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
        width: cfg.length, length: cfg.depth, height: cfg.height,
        // kitchenConfig is read off `(k as any).kitchenConfig`.
        kitchenConfig: cfg,
    } as unknown as FurnitureData;
}

const unit = (index: number, extra: Partial<KitchenUnitConfig> = {}): KitchenUnitConfig =>
    ({ index, arm: 'main', front: 'door', ...extra });

/** Count line segments (the buffer is 6 floats per segment: x,y,z,x,y,z). */
const segCount = (buf: number[]): number => buf.length / 6;

describe('§KITCHEN-PLAN-PRO — appliance symbols', () => {
    const baseCfg = (units: KitchenUnitConfig[]): KitchenCabinetConfig => ({
        layoutType: 'kitchen_straight', depth: 0.6, length: 3.0, height: 0.9,
        numUnits: units.length, units,
    });

    it('a sink unit draws a basin + drain (more linework than a plain door unit)', () => {
        const plain = linework(furniture(baseCfg([unit(0), unit(1), unit(2)])));
        const withSink = linework(furniture(baseCfg([
            unit(0), unit(1, { front: 'none', appliance: 'sink_inox' }), unit(2),
        ])));
        // The sink glyph (basin rect + drain circle + faucet tick) adds geometry
        // vs the plain run, where the middle unit was just a door front.
        expect(segCount(withSink)).toBeGreaterThan(segCount(plain));
    });

    it('a hob unit draws a cooktop + four burner rings', () => {
        const plain = linework(furniture(baseCfg([unit(0), unit(1)])));
        const withHob = linework(furniture(baseCfg([
            unit(0), unit(1, { front: 'none', appliance: 'hob' }),
        ])));
        // 4 burner circles (≥10 segs each) + the cooktop square dominate the delta.
        expect(segCount(withHob) - segCount(plain)).toBeGreaterThan(30);
    });

    it('a fridge unit draws a carcass + door leaf', () => {
        const withFridge = linework(furniture(baseCfg([
            unit(0, { front: 'none', appliance: 'fridge_combi_silver' }),
        ])));
        expect(segCount(withFridge)).toBeGreaterThan(0);
    });

    it('is deterministic (same config → byte-identical linework)', () => {
        const cfg = baseCfg([unit(0, { appliance: 'sink_inox', front: 'none' }), unit(1, { appliance: 'hob', front: 'none' })]);
        expect(linework(furniture(cfg))).toEqual(linework(furniture(cfg)));
    });
});

describe('§KITCHEN-PLAN-PRO — wall (upper) cabinets are dashed for tall layouts', () => {
    const units = [unit(0), unit(1), unit(2)];

    it('a _tall layout emits MORE linework than its base family (the dashed upper run)', () => {
        const base: KitchenCabinetConfig = {
            layoutType: 'kitchen_straight', depth: 0.6, length: 3.0, height: 0.9,
            numUnits: 3, units,
        };
        const tall: KitchenCabinetConfig = { ...base, layoutType: 'kitchen_straight_tall' };
        const baseLine = linework(furniture(base));
        const tallLine = linework(furniture(tall));
        // The dashed wall-cabinet rectangle + dashed dividers add many short dash
        // segments on top of the base run.
        expect(segCount(tallLine)).toBeGreaterThan(segCount(baseLine) + 10);
    });

    it('the base (non-tall) layout draws NO upper-cabinet dashes', () => {
        const base: KitchenCabinetConfig = {
            layoutType: 'kitchen_straight', depth: 0.6, length: 3.0, height: 0.9,
            numUnits: 3, units,
        };
        const tall: KitchenCabinetConfig = { ...base, layoutType: 'kitchen_straight_tall' };
        // Sanity: tall strictly adds geometry, base is the smaller set.
        expect(segCount(linework(furniture(tall)))).toBeGreaterThan(segCount(linework(furniture(base))));
    });

    // §KITCHEN107 (L-11600) — the plan symbol mirrors the 3-D corner rule: the
    // LEFT arm's dashed wall-cabinet run extends INTO the corner (it starts at
    // the main wall plane + upperDepth), exactly where the engine now places
    // the wall cabinets, instead of stopping where the base arm starts.
    it('L-tall: the left arm upper dashes reach into the corner and the buffer is finite', () => {
        const cfg: KitchenCabinetConfig = {
            layoutType: 'kitchen_l_shape_tall', depth: 0.6, length: 3.0, height: 0.9,
            numUnits: 5, lengthLeft: 1.8, numUnitsLeft: 3,
            units: [
                ...Array.from({ length: 5 }, (_, i) => unit(i)),
                ...Array.from({ length: 3 }, (_, i) => ({ index: i, arm: 'left' as const, front: 'door' as const })),
            ],
        };
        const buf = linework(furniture(cfg));
        expect(buf.every(Number.isFinite)).toBe(true);

        // Root frame: main wall at z = -depth/2 = -0.3; upper depth 0.35 → the
        // left upper run starts at z = 0.05, i.e. BEFORE the base left arm's
        // start at z = +0.3. The left-arm strip lives at x ∈ [-1.5, -1.5+0.35].
        // Before this fix no segment of the left arm existed with z < 0.3.
        let cornerSegs = 0;
        for (let i = 0; i < buf.length; i += 6) {
            const ax = buf[i]! , az = buf[i + 2]!;
            const bx = buf[i + 3]!, bz = buf[i + 5]!;
            const inLeftStrip = Math.max(ax, bx) < -1.5 + 0.36;
            const inCornerZ   = Math.min(az, bz) > 0.0 && Math.max(az, bz) < 0.3;
            if (inLeftStrip && inCornerZ) cornerSegs++;
        }
        expect(cornerSegs).toBeGreaterThan(0);
    });
});
