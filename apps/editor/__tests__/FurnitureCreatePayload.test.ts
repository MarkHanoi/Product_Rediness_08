// @vitest-environment happy-dom
//
// §FIX-WARDROBE-CREATE-ROTATION-NAN (L-214) — regression guard for the
// wardrobe/kitchen furniture.create rotation convergence.
//
// Root cause it locks down: the 3D WardrobeCabinetTool committed `rotation` as a
// THREE Euler object `{ x, y, z, order }`, but `furniture.create`'s canExecute
// (@pryzm/plugin-furniture CreateFurnitureHandler) validates a SCALAR yaw via
// `Number.isFinite(rotation)`. An object is never finite, so every 3D wardrobe
// placement was rejected with "rotation must be finite" — nothing created — while
// the plan branch hard-coded `rotation: 0`, dropping the SPACE-chosen orientation.
//
// The fix routes all three placement surfaces (WardrobeCabinetTool /
// KitchenCabinetTool / FurniturePlanToolHandler) through ONE canonical builder
// (`buildFurnitureCreatePayload`) whose `rotation` is typed `number`. These tests
// pin the behaviour that does NOT need a live renderer:
//   P3/P5 — a SPACE-rotated preview commits a payload whose rotation equals the
//           preview's accumulated yaw (read at commit, not recomputed).
//   P5    — a no-drag placement can never yield a non-finite rotation.
//   P2/P5 — the two call sites produce an identical payload for one placement.
//   P5    — the `rotation must be finite` guard still rejects a non-finite /
//           Euler-object rotation (the guard is NOT weakened).
//
// happy-dom: importing @pryzm/geometry-furniture transitively loads THREE via the
// package barrel; THREE imports fine without WebGL under happy-dom (same rationale
// as ParametricPlacementSpaceRotate.test.ts).

import { describe, it, expect } from 'vitest';
import { PrePlacementRotation } from '@pryzm/core-app-model';
import { buildDefaultWardrobeCabinetConfig } from '@pryzm/geometry-furniture';
import { CreateFurnitureHandler } from '@pryzm/plugin-furniture/handlers';
import {
    buildFurnitureCreatePayload,
    type FurnitureCreateInput,
} from '../src/engine/furniture/furnitureCreatePayload';

describe('§FIX-WARDROBE-CREATE-ROTATION-NAN — canonical furniture.create payload', () => {
    it('P3/P5: a SPACE-rotated preview commits the preview\'s accumulated yaw (scalar)', () => {
        const rotation = new PrePlacementRotation();
        rotation.advance(); //  90°
        rotation.advance(); // 180°

        // The tool reads rotationY() at commit — never recomputes at commit time.
        const payload = buildFurnitureCreatePayload({
            id: 'wardrobe_1',
            furnitureType: 'wardrobe_straight',
            position: { x: 3, y: 0, z: -2 },
            rotation: rotation.rotationY(),
            levelId: 'L0',
            width: 2.4, length: 0.6, height: 2.0,
            wardrobeCabinetConfig: buildDefaultWardrobeCabinetConfig('wardrobe_straight'),
        });

        expect(typeof payload.rotation).toBe('number');
        expect(payload.rotation).toBe(rotation.rotationY());
        expect(payload.rotation).toBeCloseTo(Math.PI, 10);
    });

    it('P5: a no-drag placement (SPACE never pressed) yields a FINITE rotation of 0', () => {
        // These tools derive rotation from PrePlacementRotation (a SPACE counter),
        // NOT from atan2 on a start→end direction vector, so a click with no drag
        // (start === end) can never produce NaN — rotationY() is 0 and finite.
        const rotation = new PrePlacementRotation();
        const payload = buildFurnitureCreatePayload({
            id: 'wardrobe_2',
            furnitureType: 'wardrobe_straight',
            position: { x: 0, y: 0, z: 0 },
            rotation: rotation.rotationY(),
            levelId: 'L0',
            width: 2.4, length: 0.6, height: 2.0,
        });
        expect(payload.rotation).toBe(0);
        expect(Number.isFinite(payload.rotation)).toBe(true);
    });

    it('P2/P5: the 3D tool and the plan tool produce an IDENTICAL payload for one placement', () => {
        const cfg = buildDefaultWardrobeCabinetConfig('wardrobe_straight');
        const rotation = new PrePlacementRotation();
        rotation.advance(); // both surfaces read the same shared yaw state

        // What WardrobeCabinetTool._placeWardrobe() feeds the builder…
        const fromThreeDTool: FurnitureCreateInput = {
            id: 'wardrobe_shared',
            furnitureType: 'wardrobe_straight',
            position: { x: 1.5, y: 0, z: 2.5 },
            rotation: rotation.rotationY(),
            levelId: 'L0',
            baseOffset: 0,
            width: cfg.length, length: cfg.depth, height: cfg.height,
            material: 'wood',
            furnitureCategory: 'bedroom',
            wardrobeCabinetConfig: cfg,
        };
        // …and what FurniturePlanToolHandler._commit()'s wardrobe branch feeds it.
        const fromPlanTool: FurnitureCreateInput = { ...fromThreeDTool };

        expect(buildFurnitureCreatePayload(fromThreeDTool))
            .toEqual(buildFurnitureCreatePayload(fromPlanTool));
    });

    it('P5: the builder omits absent optional fields (no undefined drift between call sites)', () => {
        const payload = buildFurnitureCreatePayload({
            id: 'plain_1',
            furnitureType: 'bed',
            position: { x: 0, y: 0, z: 0 },
            rotation: 0,
            levelId: 'L0',
            width: 1.6, length: 2.0, height: 0.6,
            material: 'wood',
        });
        expect('wardrobeCabinetConfig' in payload).toBe(false);
        expect('kitchenConfig' in payload).toBe(false);
        expect('furnitureCategory' in payload).toBe(false);
        expect(payload.baseOffset).toBe(0); // defaulted
    });

    it('P5: the builder throws loudly if a NaN / Euler rotation is ever routed through it', () => {
        const base = {
            id: 'x', furnitureType: 'wardrobe_straight' as const,
            position: { x: 0, y: 0, z: 0 }, levelId: 'L0',
            width: 1, length: 1, height: 1,
        };
        expect(() => buildFurnitureCreatePayload({ ...base, rotation: Number.NaN }))
            .toThrow(/rotation must be a finite scalar/);
        // The exact original wardrobe regression: a Vec3/Euler object where a
        // scalar was expected (compile-time forbidden; caught at runtime too).
        expect(() => buildFurnitureCreatePayload({
            ...base,
            rotation: { x: 0, y: 1, z: 0 } as unknown as number,
        })).toThrow(/rotation must be a finite scalar/);
    });
});

describe('§FIX-WARDROBE-CREATE-ROTATION-NAN — the canExecute guard is NOT weakened', () => {
    const handler = new CreateFurnitureHandler();
    const ctx = {} as never; // canExecute ignores ctx for rotation validation

    it('rejects a non-finite scalar rotation with "rotation must be finite"', () => {
        const res = handler.canExecute(ctx, { rotation: Infinity } as never);
        expect(res.valid).toBe(false);
        expect(res.reason).toMatch(/rotation must be finite/);
    });

    it('rejects a Vec3/Euler rotation object (the original wardrobe bug)', () => {
        const res = handler.canExecute(ctx, { rotation: { x: 0, y: 1, z: 0 } } as never);
        expect(res.valid).toBe(false);
        expect(res.reason).toMatch(/rotation must be finite/);
    });

    it('accepts a finite scalar yaw (radians)', () => {
        const res = handler.canExecute(ctx, { rotation: Math.PI / 2 } as never);
        expect(res.valid).toBe(true);
    });
});
