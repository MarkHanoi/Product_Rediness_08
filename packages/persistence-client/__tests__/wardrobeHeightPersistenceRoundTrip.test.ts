/**
 * §WARD118 (founder, 2026-08-26) — DOES A PRECISE WARDROBE HEIGHT (1.00 m) SURVIVE
 * A PERSISTENCE ROUND TRIP?
 *
 * The founder sets 1.00 m; the run inspector commits it to BOTH the top-level
 * `height` and `wardrobeCabinetConfig.height` (the engine reads the latter). A
 * value that is authored but stripped or re-defaulted at save / load would
 * reproduce the defect with a delay: the 1.00 m wardrobe renders until the file
 * is reopened, then comes back at 2.40. This file is that evidence — the
 * PERSIST103 pattern (mirrors `kitchenUpperUnitsPersistenceRoundTrip`).
 *
 * ── WHAT IS REAL HERE (C74 §3.4) ─────────────────────────────────────────────
 *   • The config is PRODUCED by the real `buildDefaultWardrobeCabinetConfig()`;
 *     only the height is authored, and the authored value is the founder's.
 *   • The save side is the REAL `ProjectSerializer.serialize` (`deepStrip` is the
 *     stage most likely to drop or coerce a field silently).
 *   • The wire is `JSON.stringify` → `JSON.parse` — what lands on disk.
 *   • The load side is the REAL `buildFurnitureRestorePayload`.
 *
 * ── NOT REAL ─────────────────────────────────────────────────────────────────
 *   • `ProjectLoader.load()` / `ImportProjectCommand` are not executed (they
 *     need a live CommandManager + ~40 singleton stores).
 *
 * ── ADVERSARIAL SELF-CHECK ───────────────────────────────────────────────────
 * §3 feeds a snapshot whose config height was deleted through the SAME
 * assertions and proves they go RED.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
    buildDefaultWardrobeCabinetConfig,
    type WardrobeCabinetConfig,
} from '../../geometry-furniture/src/WardrobeCabinetTypes';
import { buildFurnitureRestorePayload } from '../../command-registry/src/project/projectLoaderUtils';

beforeAll(() => {
    const g = globalThis as Record<string, unknown>;
    if (!g.DOMMatrix) g.DOMMatrix = class { };
    if (!g.Path2D) g.Path2D = class { };
    if (!g.ImageData) g.ImageData = class { };
});

let ProjectSerializer: typeof import('../src/loader/ProjectSerializer')['ProjectSerializer'];
beforeAll(async () => {
    ({ ProjectSerializer } = await import('../src/loader/ProjectSerializer'));
    expect(ProjectSerializer, 'ProjectSerializer failed to load').toBeDefined();
}, 120_000);

function wardrobeRecord(id: string, cfg: WardrobeCabinetConfig): Record<string, unknown> {
    return {
        id, type: 'furniture', furnitureType: cfg.layoutType, furnitureCategory: 'bedroom',
        position: { x: 2, y: 0, z: 3 }, rotation: { x: 0, y: 1.5707, z: 0, order: 'XYZ' },
        levelId: 'L1', baseOffset: 0,
        width: cfg.length, length: cfg.depth, height: cfg.height,
        material: 'wood',
        wardrobeCabinetConfig: cfg,
    };
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
        { projectName: 'WARD118-height-probe' },
    ) as unknown as Record<string, unknown>;
}

async function roundTrip(records: Record<string, unknown>[]) {
    const snapshot = await serializeThroughProduction(records);
    const wire = JSON.parse(JSON.stringify(snapshot)) as { furniture: Record<string, unknown>[] };
    const restored = wire.furniture.map(f => buildFurnitureRestorePayload(f));
    return { snapshot, wire, restored };
}

function assertHeight(restored: Record<string, unknown>, expected: number): void {
    expect(restored.height).toBe(expected);
    const cfg = restored.wardrobeCabinetConfig as WardrobeCabinetConfig | undefined;
    expect(cfg, 'wardrobeCabinetConfig must survive').toBeDefined();
    expect(cfg!.height).toBe(expected);
}

describe('§WARD118 — a precise wardrobe height under a persistence round trip', () => {

    it('§1 — 1.00 m on I, L and U survives save → wire → restore on BOTH fields, byte-faithfully', async () => {
        const records = (['wardrobe_straight', 'wardrobe_l_shape', 'wardrobe_u_shape'] as const).map((layout, i) => {
            const cfg = buildDefaultWardrobeCabinetConfig(layout);
            cfg.height = 1.0;
            return wardrobeRecord(`w${i}`, cfg);
        });
        const { restored } = await roundTrip(records);
        expect(restored.length).toBe(3);
        for (const r of restored as Record<string, unknown>[]) assertHeight(r, 1.0);
        // The rest of the config is intact too (arms + sections).
        const u = (restored[2] as Record<string, unknown>).wardrobeCabinetConfig as WardrobeCabinetConfig;
        expect(u.layoutType).toBe('wardrobe_u_shape');
        expect(u.lengthLeft).toBe(1.2);
        expect(u.sections!.length).toBe(8);
    }, 120_000);

    it('§2 — 0.6 m and a sub-centimetre value (1.234 m) survive without rounding', async () => {
        const a = buildDefaultWardrobeCabinetConfig('wardrobe_straight'); a.height = 0.6;
        const b = buildDefaultWardrobeCabinetConfig('wardrobe_l_shape');  b.height = 1.234;
        const { restored } = await roundTrip([wardrobeRecord('a', a), wardrobeRecord('b', b)]);
        assertHeight(restored[0] as Record<string, unknown>, 0.6);
        assertHeight(restored[1] as Record<string, unknown>, 1.234);
    }, 120_000);

    it('§3 — ADVERSARIAL: a snapshot whose config height was deleted goes RED through the same assertions', async () => {
        const cfg = buildDefaultWardrobeCabinetConfig('wardrobe_u_shape'); cfg.height = 1.0;
        const { wire } = await roundTrip([wardrobeRecord('adv', cfg)]);
        const tampered = JSON.parse(JSON.stringify(wire.furniture[0])) as Record<string, unknown>;
        delete (tampered.wardrobeCabinetConfig as Record<string, unknown>).height;
        const restored = buildFurnitureRestorePayload(tampered) as Record<string, unknown>;
        expect(() => assertHeight(restored, 1.0)).toThrow();
    }, 120_000);
});
