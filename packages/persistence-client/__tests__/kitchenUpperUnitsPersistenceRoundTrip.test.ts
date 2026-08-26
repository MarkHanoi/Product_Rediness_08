/**
 * §KITCHEN107 (L-11600) — DOES `kitchenConfig.upperUnits` SURVIVE A PERSISTENCE
 * ROUND TRIP?
 *
 * The upper (wall cabinet) row became its OWN unit list, carried as an ADDITIVE
 * field on `KitchenCabinetConfig` (C47: optional, omit-when-absent). A field that
 * is authored but silently stripped at save / load would reproduce the founder's
 * defect with a delay: the independent uppers would render until the file is
 * reopened, then collapse back to the derived defaults. This file is that
 * evidence — the PERSIST103 pattern (mirrors `regionSketchPersistenceRoundTrip`).
 *
 * ── WHAT IS REAL HERE (C74 §3.4 — a fixture that supplies the value under test
 *    proves nothing) ───────────────────────────────────────────────────────────
 *   • The fixture is PRODUCED by the real `buildDefaultKitchenConfig()` and the
 *     real `retargetKitchenConfig()` (`@pryzm/geometry-furniture` KitchenTypes) —
 *     this file never hand-writes an `upperUnits` literal.
 *   • The save side is the REAL `serializeFurniture` reached through the REAL
 *     `ProjectSerializer.serialize` (`deepStrip` is the stage most likely to drop
 *     a field silently).
 *   • The wire is `JSON.stringify` → `JSON.parse` — what actually lands on disk.
 *   • The load side is the REAL `buildFurnitureRestorePayload`
 *     (`command-registry/src/project/projectLoaderUtils.ts`), which the
 *     ImportProjectCommand fast path uses; the legacy `ProjectLoader` branch is
 *     PINNED by source assertion (§4) so it cannot drift into dropping the field.
 *   • The Zod `Furniture` element schema (`@pryzm/schemas/elements/Furniture`) is
 *     the PRYZM-3 catalogue DTO (catalogId / representations); it declares NO
 *     `kitchenConfig` and is applied nowhere on this path — measured, and pinned
 *     in §4 so a future application of it here would be noticed.
 *
 * ── NOT REAL, and why ────────────────────────────────────────────────────────
 *   • The full `ProjectLoader.load()` / `ImportProjectCommand` is NOT executed
 *     (needs a live CommandManager + ~40 singleton stores). The round trip covers
 *     serialise → wire → restore-payload, which is where every field either
 *     survives or does not.
 *
 * ── ADVERSARIAL SELF-CHECK ───────────────────────────────────────────────────
 * §3 feeds a snapshot whose `upperUnits` was deleted through the SAME assertions
 * and proves they go RED. Without it a green result here would be worthless.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    buildDefaultKitchenConfig,
    retargetKitchenConfig,
    type KitchenCabinetConfig,
} from '../../geometry-furniture/src/KitchenTypes';
import { buildFurnitureRestorePayload } from '../../command-registry/src/project/projectLoaderUtils';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../..');

/** `@pryzm/file-format` (imported by ProjectSerializer) pulls `pdfjs-dist` at module
 *  load, which touches `DOMMatrix` in a Node env. Pure module-load shims. */
beforeAll(() => {
    const g = globalThis as Record<string, unknown>;
    if (!g.DOMMatrix) g.DOMMatrix = class { };
    if (!g.Path2D) g.Path2D = class { };
    if (!g.ImageData) g.ImageData = class { };
});

/** Hoisted import with an explicit budget — see regionSketchPersistenceRoundTrip
 *  for why (the serializer's import graph transforms ~30 s cold). */
let ProjectSerializer: typeof import('../src/loader/ProjectSerializer')['ProjectSerializer'];
beforeAll(async () => {
    ({ ProjectSerializer } = await import('../src/loader/ProjectSerializer'));
    expect(ProjectSerializer, 'ProjectSerializer failed to load').toBeDefined();
}, 120_000);

// ── Fixtures — produced by the real config producers, never hand-written ─────

/** A placed kitchen FurnitureData record wrapping a real config. */
function kitchenRecord(id: string, cfg: KitchenCabinetConfig): Record<string, unknown> {
    return {
        id,
        type: 'furniture',
        furnitureType: cfg.layoutType,
        furnitureCategory: 'kitchen',
        position: { x: 2, y: 0, z: 3 },
        rotation: { x: 0, y: 1.5707, z: 0, order: 'XYZ' },
        levelId: 'L1',
        baseOffset: 0,
        width: cfg.length, length: cfg.depth, height: cfg.height,
        material: 'wood',
        kitchenConfig: cfg,
    };
}

/** An L+wall kitchen whose upper row has been AUTHORED away from the derived
 *  default: one glass door with a material override, one slot omitted. The
 *  authoring is applied on top of the real producer's output. */
function authoredTallL(): KitchenCabinetConfig {
    const cfg = buildDefaultKitchenConfig('kitchen_l_shape_tall');
    expect(cfg.upperUnits, 'producer must mint upperUnits for a tall layout').toBeDefined();
    cfg.upperUnits = cfg.upperUnits!.map(u => {
        if (u.arm === 'main' && u.index === 0) return { ...u, front: 'glass_door' as const, doorMaterialId: 'glass-clear' };
        if (u.arm === 'left' && u.index === 2) return { ...u, front: 'omitted' as const };
        return u;
    });
    return cfg;
}

/** A pre-§KITCHEN107 record: tall layout, `units` with appliances, NO upperUnits. */
function legacyTallL(): KitchenCabinetConfig {
    const cfg = buildDefaultKitchenConfig('kitchen_l_shape_tall');
    delete (cfg as { upperUnits?: unknown }).upperUnits;
    return cfg;
}

async function serializeThroughProduction(furniture: unknown[]): Promise<Record<string, unknown>> {
    const empty = { getAll: () => [] as unknown[] };
    const stores = {
        wallStore: { getAll: () => [], getLevels: () => [{ id: 'L1', name: 'Level 1', elevation: 0 }] },
        slabStore: empty, columnStore: empty, gridStore: empty, stairStore: empty, beamStore: empty,
        curtainWallStore: empty, roofStore: empty, plumbingStore: empty,
        furnitureStore: { getAll: () => furniture },
        handrailStore: empty, openingStore: empty,
    } as unknown as Parameters<typeof ProjectSerializer.serialize>[0];
    return ProjectSerializer.serialize(
        stores,
        {} as Parameters<typeof ProjectSerializer.serialize>[1],
        { projectName: 'KITCHEN107-upperUnits-probe' },
    ) as unknown as Record<string, unknown>;
}

/** serialise → JSON.stringify/parse (what lands on disk) → fast-path restore payload. */
async function roundTrip(records: Record<string, unknown>[]) {
    const snapshot = await serializeThroughProduction(records);
    const wire = JSON.parse(JSON.stringify(snapshot)) as { furniture: Record<string, unknown>[] };
    const restored = wire.furniture.map(f => buildFurnitureRestorePayload(f));
    return { snapshot, wire, restored };
}

// ═══════════════════════════════════════════════════════════════════════════════
describe('§KITCHEN107 — kitchenConfig.upperUnits under a persistence round trip', () => {

    describe('§1 — an AUTHORED upper row survives save → wire → restore byte-faithfully', () => {
        it('upperUnits deep-equals the authored list after the round trip', async () => {
            const cfg = authoredTallL();
            const { restored } = await roundTrip([kitchenRecord('fu-k1', cfg)]);
            const back = restored[0]!.kitchenConfig as KitchenCabinetConfig;
            expect(back.layoutType).toBe('kitchen_l_shape_tall');
            expect(back.upperUnits).toEqual(cfg.upperUnits);
        });

        it('the authored glass door + material and the omitted slot are both present on the far side', async () => {
            const { restored } = await roundTrip([kitchenRecord('fu-k1', authoredTallL())]);
            const back = restored[0]!.kitchenConfig as KitchenCabinetConfig;
            const glass = back.upperUnits!.find(u => u.arm === 'main' && u.index === 0);
            const gone  = back.upperUnits!.find(u => u.arm === 'left' && u.index === 2);
            expect(glass?.front).toBe('glass_door');
            expect(glass?.doorMaterialId).toBe('glass-clear');
            expect(gone?.front).toBe('omitted');
        });

        it('a config produced by retargetKitchenConfig (L-11601 type swap) round-trips with its minted upper row', async () => {
            // L (no uppers) → U+wall: the retarget mints uppers for three arms.
            const cfg = retargetKitchenConfig(buildDefaultKitchenConfig('kitchen_l_shape'), 'kitchen_u_shape_tall');
            expect(cfg.upperUnits!.some(u => u.arm === 'right')).toBe(true);
            const { restored } = await roundTrip([kitchenRecord('fu-k2', cfg)]);
            const back = restored[0]!.kitchenConfig as KitchenCabinetConfig;
            expect(back.layoutType).toBe('kitchen_u_shape_tall');
            expect(back.upperUnits).toEqual(cfg.upperUnits);
        });
    });

    describe('§2 — omit-when-absent (C47): a legacy record is NOT given phantom uppers by persistence', () => {
        it('a record without upperUnits comes back without upperUnits (derivation stays a BUILD-time concern)', async () => {
            const { wire, restored } = await roundTrip([kitchenRecord('fu-legacy', legacyTallL())]);
            expect('upperUnits' in (wire.furniture[0]!.kitchenConfig as object)).toBe(false);
            const back = restored[0]!.kitchenConfig as KitchenCabinetConfig;
            expect(back.upperUnits).toBeUndefined();
            // and the base row it DOES carry is intact (the founder's kitchen still has its hob/sink/fridge)
            expect(back.units!.some(u => u.appliance === 'hob')).toBe(true);
        });
    });

    describe('§3 — the probe would DETECT a silent strip (adversarial self-check)', () => {
        it('a wire snapshot with upperUnits deleted FAILS the §1 assertion', async () => {
            const cfg = authoredTallL();
            const snapshot = await serializeThroughProduction([kitchenRecord('fu-k1', cfg)]);
            const wire = JSON.parse(JSON.stringify(snapshot)) as { furniture: Record<string, unknown>[] };
            // Simulate a strip at the save stage.
            delete (wire.furniture[0]!.kitchenConfig as { upperUnits?: unknown }).upperUnits;
            const back = buildFurnitureRestorePayload(wire.furniture[0]).kitchenConfig as KitchenCabinetConfig;
            expect(back.upperUnits).not.toEqual(cfg.upperUnits);   // the §1 assertion goes red
            expect(back.upperUnits).toBeUndefined();
        });
    });

    describe('§4 — source pins: the two load branches forward kitchenConfig whole, and no schema sits on this path', () => {
        const read = (rel: string) => readFileSync(resolve(REPO, rel), 'utf8');

        it('persistence-client ProjectLoader forwards `kitchenConfig: f.kitchenConfig` (the legacy per-command path)', () => {
            const src = read('packages/persistence-client/src/loader/ProjectLoader.ts');
            expect(src).toMatch(/kitchenConfig:\s+f\.kitchenConfig,/);
        });

        it('projectLoaderUtils.buildFurnitureRestorePayload forwards `kitchenConfig: f.kitchenConfig` (the fast path)', () => {
            const src = read('packages/command-registry/src/project/projectLoaderUtils.ts');
            expect(src).toMatch(/kitchenConfig:\s+f\.kitchenConfig,/);
        });

        it('ProjectSerializer serialises kitchenConfig through deepStrip (a recursive key COPY, not an allow-list)', () => {
            const src = read('packages/persistence-client/src/loader/ProjectSerializer.ts');
            expect(src).toMatch(/kitchenConfig:\s+f\.kitchenConfig\s+\?\s+deepStrip\(f\.kitchenConfig\)/);
            // deepStrip copies every own key — the reason an additive field cannot be lost here.
            expect(src).toMatch(/for \(const key of Object\.keys\(obj\)\) \{\s*out\[key\] = deepStrip\(obj\[key\]\);/);
        });

        it('the Zod Furniture element schema declares no kitchenConfig (it is the PRYZM-3 catalogue DTO, not this record)', () => {
            const src = read('packages/schemas/src/elements/Furniture.ts');
            expect(src).not.toContain('kitchenConfig');
        });
    });
});
