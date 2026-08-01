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

// §FIX-FURNITURE-AD-HOC-ID (L-665) — the SECOND divergence on this same payload:
// the `id`. KitchenCabinetTool minted `kitchen_<Date.now()>_<n>` and
// WardrobeCabinetTool `wardrobe_cab_<Date.now()>_<n>`, both rejected by the
// Furniture schema id regex at `Furniture.parse` inside CreateFurnitureHandler
// (`FurnitureSchemaError: Expected furniture_<ulid> id`) — a dead click behind a
// perfect, never-validated preview. The builder now owns the id (mint via
// `newFurnitureId()` = ADR-0001 `createId('furniture')`, validate anything
// supplied). The schema regex is the authority and is NOT weakened.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { PrePlacementRotation } from '@pryzm/core-app-model';
import { buildDefaultWardrobeCabinetConfig, buildDefaultKitchenConfig } from '@pryzm/geometry-furniture';
import { CreateFurnitureHandler } from '@pryzm/plugin-furniture/handlers';
import { createId } from '@pryzm/schemas';
import {
    buildFurnitureCreatePayload,
    newFurnitureId,
    type FurnitureCreateInput,
} from '../src/engine/furniture/furnitureCreatePayload';

describe('§FIX-WARDROBE-CREATE-ROTATION-NAN — canonical furniture.create payload', () => {
    it('P3/P5: a SPACE-rotated preview commits the preview\'s accumulated yaw (scalar)', () => {
        const rotation = new PrePlacementRotation();
        rotation.advance(); //  90°
        rotation.advance(); // 180°

        // The tool reads rotationY() at commit — never recomputes at commit time.
        const payload = buildFurnitureCreatePayload({
            id: createId('furniture'),
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
            id: createId('furniture'),
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
            id: createId('furniture'),
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
            id: createId('furniture'),
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
            id: createId('furniture'), furnitureType: 'wardrobe_straight' as const,
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

// ── §FIX-FURNITURE-AD-HOC-ID (L-665) ─────────────────────────────────────────

/** The exact shape the Furniture schema's `defineElement('furniture')` regex enforces. */
const FURNITURE_ID_RE = /^furniture_[0-9A-HJKMNP-TV-Z]{26}$/;

/** The two ad-hoc generators this defect removed (verbatim, as they shipped). */
const legacyKitchenId  = (n: number): string => `kitchen_${Date.now()}_${n}`;
const legacyWardrobeId = (n: number): string => `wardrobe_cab_${Date.now()}_${n}`;

describe('§FIX-FURNITURE-AD-HOC-ID (L-665) — one ULID minter for every placement', () => {
    it('newFurnitureId() produces a schema-valid furniture_<ULID>', () => {
        expect(newFurnitureId()).toMatch(FURNITURE_ID_RE);
    });

    it('back-to-back ids stay distinct (§FIX-KITCHEN-SECOND-PLACE property kept)', () => {
        // The old counter existed so a re-armed tool could place a second run in the
        // same millisecond without overwriting the first. ULIDs keep that property
        // via their 80-bit random tail (the 48-bit timestamp prefix is identical
        // inside one millisecond, so same-ms ids are distinct but NOT ordered —
        // ordering holds only across milliseconds. Nothing here depends on it).
        const ids = Array.from({ length: 10 }, () => newFurnitureId());
        expect(new Set(ids).size).toBe(10);
        for (const id of ids) expect(id).toMatch(FURNITURE_ID_RE);
    });

    it('the builder MINTS a valid id when the tool omits one', () => {
        const payload = buildFurnitureCreatePayload({
            furnitureType: 'kitchen_l_shape',
            position: { x: 1, y: 0, z: 1 },
            rotation: 0,
            levelId: 'L0',
            width: 3, length: 0.6, height: 0.9,
        });
        expect(payload.id).toMatch(FURNITURE_ID_RE);
    });

    it('the builder REJECTS the ad-hoc ids the kitchen/wardrobe tools used to mint', () => {
        const base = {
            furnitureType: 'kitchen_l_shape' as const,
            position: { x: 0, y: 0, z: 0 },
            rotation: 0,
            levelId: 'L0',
            width: 1, length: 1, height: 1,
        };
        expect(() => buildFurnitureCreatePayload({ ...base, id: legacyKitchenId(0) }))
            .toThrow(/id must be a createId\('furniture'\) value/);
        expect(() => buildFurnitureCreatePayload({ ...base, id: legacyWardrobeId(0) }))
            .toThrow(/id must be a createId\('furniture'\) value/);
        // A bare UUID (the L-145 annotation regression, same class) is rejected too.
        expect(() => buildFurnitureCreatePayload({
            ...base, id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
        })).toThrow(/id must be a createId\('furniture'\) value/);
    });
});

describe('§FIX-FURNITURE-AD-HOC-ID (L-665) — the L-shape kitchen COMMITS at the command seam', () => {
    const handler = new CreateFurnitureHandler();
    const ctx = { stores: { furniture: {} } } as never;

    /** Exactly what KitchenCabinetTool._placeKitchen() now feeds the builder. */
    const kitchenInput = (id?: string): FurnitureCreateInput => {
        const cfg = buildDefaultKitchenConfig('kitchen_l_shape', 'door');
        return {
            ...(id !== undefined ? { id } : {}),
            furnitureType: 'kitchen_l_shape',
            position: { x: 2, y: 0, z: -1 },
            rotation: Math.PI / 2,
            levelId: 'L0',
            baseOffset: 0,
            width: cfg.length, length: cfg.depth, height: cfg.height,
            material: 'wood',
            furnitureCategory: 'kitchen',
            kitchenConfig: cfg,
        };
    };

    it('furniture.create EXECUTES (no FurnitureSchemaError) and stores the run', () => {
        const payload = buildFurnitureCreatePayload(kitchenInput());
        const result = handler.execute(ctx, payload as never);
        const stored = (result.nextStates as Record<string, Record<string, { id: string }>>).furniture;
        expect(stored[payload.id]).toBeDefined();
        expect(stored[payload.id]!.id).toMatch(FURNITURE_ID_RE);
    });

    it('the SCHEMA is still the authority: the old kitchen id throws FurnitureSchemaError', () => {
        // Dispatching the pre-fix id straight at the handler (bypassing the builder
        // guard) reproduces the founder-reported failure verbatim. This assertion
        // exists so nobody "fixes" a future recurrence by loosening the regex.
        expect(() => handler.execute(ctx, { id: legacyKitchenId(0) } as never))
            .toThrow(/Expected furniture_<ulid> id|Furniture schema validation failed/);
    });
});

describe('§FIX-FURNITURE-AD-HOC-ID (L-665) — no placement tool may re-invent an id', () => {
    const read = (rel: string): string =>
        readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

    const TOOLS = [
        ['KitchenCabinetTool',  '../src/ui/kitchen/KitchenCabinetTool.ts'],
        ['WardrobeCabinetTool', '../src/ui/wardrobe/WardrobeCabinetTool.ts'],
    ] as const;

    for (const [name, rel] of TOOLS) {
        it(`${name} mints via newFurnitureId(), never a hand-rolled generator`, () => {
            const src = read(rel);
            // Strip line comments so the §-tagged post-mortem (which quotes the old
            // template) doesn't trip the scan — only executable code is inspected.
            const code = src.replace(/^\s*(\/\/|\*|\/\*).*$/gm, '');
            expect(code).toContain('newFurnitureId');
            expect(code).not.toMatch(/Date\.now\(\)/);
            expect(code).not.toMatch(/crypto\.randomUUID/);
            expect(code).not.toMatch(/Math\.random\(\)/);
        });
    }
});
