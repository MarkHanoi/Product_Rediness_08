/**
 * §GRAPH115 / ADR-0374 §2.7 — `wallAnchor` survives the REAL ProjectSerializer round trip
 * (the PERSIST103 pattern: production serializer → JSON wire → the restore path that SHIPS).
 *
 * C84 EI-6.1: a field is persisted only if the restore path that ships reads it. Both
 * hand-synced serializer copies (C78 §14.3) emit the key, both loader copies forward it to
 * `CreatePlumbingFixtureCommand`, and the command stamps it — proven here by EXECUTING the
 * real command over a real PlumbingStore, not by reading the JSON.
 *
 * C47 additive-optional: an unanchored fixture's wire entry carries NO `wallAnchor` key, so a
 * pre-§GRAPH115 snapshot is byte-identical and no schema version moves.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PlumbingStore } from '../../geometry-plumbing/src/PlumbingStore';
import { CreatePlumbingFixtureCommand } from '../../command-registry/src/plumbing/CreatePlumbingFixtureCommand';
import { mintWallAnchor, type WallAnchor } from '../../command-registry/src/attachments/WallAnchor';
import type { CommandContext } from '../../command-registry/src/types';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../..');

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

// ── Fixtures — the anchor is produced by the ONE real minter, never hand-written ─────

const HOST = { id: 'W-host', levelId: 'L1', baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }] };

function anchoredToilet(id: string): { record: Record<string, unknown>; anchor: WallAnchor } {
    const x = 1.5, z = -0.1, yaw = Math.atan2(0, -1);
    const anchor = mintWallAnchor({ x, z, yaw }, HOST, 'wall')!;
    return {
        anchor,
        record: {
            id, type: 'plumbing_fixture', fixtureType: 'toilet', toiletVariant: 'wall_hung',
            position: { x, y: 0, z }, rotation: { x: 0, y: yaw, z: 0, order: 'XYZ' },
            levelId: 'L1', levelName: 'Level 1', levelElevation: 0, baseOffset: 0,
            width: 0.4, height: 0.8, length: 0.7, properties: {},
            wallAnchor: anchor,
        },
    };
}

function freeBath(id: string): Record<string, unknown> {
    return {
        id, type: 'plumbing_fixture', fixtureType: 'bath',
        position: { x: 3, y: 0, z: 3 }, rotation: { x: 0, y: 0, z: 0, order: 'XYZ' },
        levelId: 'L1', levelName: 'Level 1', levelElevation: 0, baseOffset: 0,
        width: 1.7, height: 0.6, length: 0.75, properties: {},
        startPoint: { x: 2.15, y: 0, z: 3 }, endPoint: { x: 3.85, y: 0, z: 3 },
    };
}

async function serializeThroughProduction(plumbing: unknown[]): Promise<Record<string, unknown>> {
    const empty = { getAll: () => [] as unknown[] };
    const stores = {
        wallStore: { getAll: () => [], getLevels: () => [{ id: 'L1', name: 'Level 1', elevation: 0 }] },
        slabStore: empty, columnStore: empty, gridStore: empty, stairStore: empty, beamStore: empty,
        curtainWallStore: empty, roofStore: empty,
        plumbingStore: { getAll: () => plumbing },
        furnitureStore: empty, handrailStore: empty, openingStore: empty,
    } as unknown as Parameters<typeof ProjectSerializer.serialize>[0];
    return ProjectSerializer.serialize(
        stores,
        {} as Parameters<typeof ProjectSerializer.serialize>[1],
        { projectName: 'GRAPH115-wallAnchor-probe' },
    ) as unknown as Record<string, unknown>;
}

/** The restore path that SHIPS: the loader's exact payload shape into the real command over a real store. */
function restoreThroughProduction(p: Record<string, unknown>): PlumbingStore {
    const plumbingStore = new PlumbingStore();
    const level = { id: 'L1', name: 'Level 1', elevation: 0, height: 3, childrenIds: [] as string[] };
    const ctx = {
        stores: { plumbingStore },
        bimManager: {
            getLevelById: (id: string) => (id === 'L1' ? level : undefined),
            getLevels: () => [level],
            registerElement: () => {},
            unregisterElement: () => {},
        },
    } as unknown as CommandContext;
    // Byte-for-byte the loader's construction (apps/editor + persistence-client ProjectLoader, Step 10).
    const cmd = new CreatePlumbingFixtureCommand({
        id: p.id as string, fixtureType: p.fixtureType as never, toiletVariant: p.toiletVariant as never,
        position: p.position as never, rotation: p.rotation as never, levelId: p.levelId as string,
        baseOffset: (p.baseOffset as number) ?? 0, width: p.width as number, height: p.height as number, length: p.length as number,
        color: p.color as string, startPoint: p.startPoint as never, endPoint: p.endPoint as never,
        wallAnchor: p.wallAnchor as WallAnchor | undefined,
    });
    expect(cmd.execute(ctx).success).toBe(true);
    return plumbingStore;
}

async function roundTrip(records: Record<string, unknown>[]) {
    const snapshot = await serializeThroughProduction(records);
    const wire = JSON.parse(JSON.stringify(snapshot)) as { plumbing: Record<string, unknown>[] };
    return { snapshot, wire };
}

describe('§GRAPH115 — wallAnchor under a persistence round trip (PERSIST103 pattern)', () => {
    it('§1 — an anchored toilet comes back with its anchor DEEP-EQUAL, through the real command over a real store', async () => {
        const { record, anchor } = anchoredToilet('pl-1');
        const { wire } = await roundTrip([record]);
        expect(wire.plumbing[0]!.wallAnchor).toEqual(anchor);
        const store = restoreThroughProduction(wire.plumbing[0]!);
        expect(store.get('pl-1')!.wallAnchor).toEqual(anchor);
        expect(store.get('pl-1')!.position.x).toBeCloseTo(1.5, 12);
    });

    it('§2 — omit-when-absent (C47): a free-placed bath carries NO wallAnchor key on the wire and none after restore', async () => {
        const { wire } = await roundTrip([freeBath('pl-bath')]);
        expect('wallAnchor' in wire.plumbing[0]!).toBe(false);
        const store = restoreThroughProduction(wire.plumbing[0]!);
        expect(store.get('pl-bath')!.wallAnchor).toBeUndefined();
    });

    it('§3 — the probe would DETECT a silent strip (adversarial self-check)', async () => {
        const { record, anchor } = anchoredToilet('pl-1');
        const { wire } = await roundTrip([record]);
        delete wire.plumbing[0]!.wallAnchor;
        const store = restoreThroughProduction(wire.plumbing[0]!);
        expect(store.get('pl-1')!.wallAnchor).not.toEqual(anchor);
        expect(store.get('pl-1')!.wallAnchor).toBeUndefined();
    });

    describe('§4 — source pins: BOTH serializer copies emit it, BOTH loader copies forward it (C78 §14.3)', () => {
        const read = (rel: string) => readFileSync(resolve(REPO, rel), 'utf8');
        it.each([
            'packages/persistence-client/src/loader/ProjectSerializer.ts',
            'apps/editor/src/engine/persistence/ProjectSerializer.ts',
        ])('%s spreads wallAnchor only when present', (rel) => {
            expect(read(rel)).toMatch(/\.\.\.\(p\.wallAnchor \? \{ wallAnchor: \{ \.\.\.p\.wallAnchor \} \} : \{\}\)/);
        });
        it.each([
            'packages/persistence-client/src/loader/ProjectLoader.ts',
            'apps/editor/src/engine/persistence/ProjectLoader.ts',
        ])('%s forwards `wallAnchor: p.wallAnchor` into CreatePlumbingFixtureCommand', (rel) => {
            expect(read(rel)).toMatch(/wallAnchor:\s+p\.wallAnchor/);
        });
        it('CreatePlumbingFixtureCommand stamps the payload anchor verbatim and never invents one', () => {
            const src = read('packages/command-registry/src/plumbing/CreatePlumbingFixtureCommand.ts');
            expect(src).toMatch(/\.\.\.\(this\.payload\.wallAnchor \? \{ wallAnchor: \{ \.\.\.this\.payload\.wallAnchor \} \} : \{\}\)/);
        });
    });
});
