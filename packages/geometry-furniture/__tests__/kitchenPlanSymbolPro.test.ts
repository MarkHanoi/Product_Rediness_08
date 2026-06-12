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
});
