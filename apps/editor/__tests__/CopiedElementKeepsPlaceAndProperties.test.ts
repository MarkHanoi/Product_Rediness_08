/**
 * §FIX-COPY-PAYLOAD-FIELD-NAMES (L-978 · C84 EI-2a · C79 §7.4)
 *
 * ─── THE DEFECT ─────────────────────────────────────────────────────────────
 * `CopyPlanToolHandler._copyCurtainWall` dispatched `curtain-wall.create` with
 * `start`, `end`, `gridXSpacing` and `gridYSpacing`. `CreateCurtainWallPayload`
 * accepts NONE of the four, and neither does `CommandEventBridge`'s
 * `curtain-wall.create` case — so a copied curtain wall was minted at the L0
 * schema's DEFAULT baseLine `(0,0,0)→(4,0,0)` with the default 1.2 × 1.5 m bays,
 * regardless of where the original stood or how it was divided, and nothing
 * threw. The user copied a curtain wall and got an unrelated one at the origin.
 *
 * The sweep of the same file found two more of the same family and one
 * deliberate non-defect; each has its own `describe` below, and each names what
 * it is.
 *
 * ─── WHY THE ASSERTIONS READ A COMMITTED RECORD ─────────────────────────────
 * Per §committed-is-not-reachable, no arm asserts on the payload alone. Each
 * runs the REAL handler from `plugins/*`, and the curtain-wall arms carry on
 * through the REAL `CommandEventBridge` and THE `curtainWallCreatedMirror` that
 * `initTools.ts` calls, into a real `CurtainWallStore` — the store
 * `CurtainWallBuilder` meshes from and `ScheduleExtractor` reports from.
 *
 * The payload builders are executed from `copyPayloads.ts`, the module extracted
 * out of `CopyPlanToolHandler` for exactly this reason: every dispatch in that
 * class sits behind a two-click canvas gesture and a `window.*Store` read, so
 * nothing in any suite could build one of these payloads — which is how four
 * wrong field names survived in plain sight.
 */

import { describe, it, expect, vi } from 'vitest';
import { CurtainWallStore } from '@pryzm/geometry-curtain-wall';
import { createId } from '@pryzm/schemas';
import {
    curtainWallCopyPayload,
    wallCopyPayload,
    slabCopyPayload,
    columnCopyPayload,
    furnitureCopyPayload,
    type LegacyCurtainWallLike,
    type LegacyWallLike,
    type LegacySlabLike,
    type LegacyColumnLike,
    type LegacyFurnitureLike,
} from '../src/engine/views/plantools/copyPayloads';

const LEVEL_ID = 'L1';
/** The copy gesture under test: 10 m east, 4 m south. */
const DX = 10;
const DZ = 4;

/** Real branded ids — every L0 element schema pins `id` to `<kind>_<ULID>`, so a
 *  hand-rolled probe id is refused before any of this is measured. */
const nextId = (kind: string): string => createId(kind as never) as unknown as string;

/** The L0 `CurtainWall` schema defaults — what a payload the handler cannot read
 *  falls through to. Quoted from `packages/schemas/src/elements/CurtainWall.ts`. */
const CW_DEFAULT_BASELINE = [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }];
const CW_DEFAULT_BAY_WIDTH = 1.2;
const CW_DEFAULT_BAY_HEIGHT = 1.5;

/** A real legacy `CurtainWallData` standing well away from the origin, divided
 *  on a grid that is NOT the schema default in either axis. */
function sourceCurtainWall(extra: Partial<LegacyCurtainWallLike> = {}): LegacyCurtainWallLike {
    return {
        levelId: LEVEL_ID,
        baseLine: [{ x: 25, y: 3.2, z: 40 }, { x: 33, y: 3.2, z: 40 }],
        height: 4.5,
        baseOffset: 0.3,
        gridXSpacing: 0.9,
        gridYSpacing: 2.25,
        mullionSize: 0.08,
        panelThickness: 0.024,
        ...extra,
    };
}

// ─── Real receivers ──────────────────────────────────────────────────────────

/** Run the REAL `CreateCurtainWallHandler`; return its committed record. */
async function commitCurtainWall(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const { CreateCurtainWallHandler } = await import(
        '../../../plugins/curtain-wall/src/handlers/CreateCurtainWall'
    );
    const handler = new CreateCurtainWallHandler();
    const ctx = { stores: { curtainwall: {} } } as never;
    const verdict = handler.canExecute(ctx, payload as never);
    if (!verdict.valid) throw new Error(`REFUSED: ${verdict.reason}`);
    const res = handler.execute(ctx, payload as never);
    const forward = res.forward as Array<{ value?: Record<string, unknown> }>;
    return forward[0]?.value ?? {};
}

/** bus record → real `CommandEventBridge` → the emitted `<kind>.created`. */
async function createdEventFor(
    type: string,
    eventName: string,
    payload: Record<string, unknown>,
    forward: readonly unknown[] = [],
): Promise<Record<string, unknown>> {
    // Imported from source, not the barrel: `@pryzm/runtime-composer`'s index
    // transitively pulls `pdfjs-dist`, which touches `DOMMatrix` at module scope.
    const { wireCommandEventBridge } = await import(
        '../../../packages/runtime-composer/src/CommandEventBridge'
    );
    let ev: Record<string, unknown> | undefined;
    let emit!: (bytes: unknown, record: unknown) => void;
    const patches = { subscribe: (cb: (b: unknown, r: unknown) => void) => { emit = cb; return () => {}; } };
    const events = {
        emit: (name: string, p: unknown) => { if (name === eventName) ev = p as Record<string, unknown>; },
    };
    wireCommandEventBridge(patches as never, events as never);
    emit(new Uint8Array(), {
        id: `evt-${type}`, type, payload,
        affectedStores: ['x'], audit: { actorId: 'probe' }, forward,
    });
    if (!ev) throw new Error(`CommandEventBridge emitted no ${eventName} for a ${type} record`);
    return ev;
}

/** The whole user-visible chain for a copied curtain wall, ending in a real store. */
async function copiedCurtainWallInStore(
    extra: Partial<LegacyCurtainWallLike> = {},
): Promise<Record<string, unknown>> {
    const id = nextId('curtainwall');
    const payload = curtainWallCopyPayload(sourceCurtainWall(extra), DX, DZ, id);
    await commitCurtainWall(payload);                      // proves the handler accepts it
    const ev = await createdEventFor('curtain-wall.create', 'curtain-wall.created', payload);
    const { curtainWallRecordFromCreatedEvent } = await import('../src/engine/curtainWallCreatedMirror');
    const record = curtainWallRecordFromCreatedEvent(ev as never);
    expect(record, 'a copied curtain wall must not be refused by the §P3.1-CW mirror').not.toBeNull();
    const store = new CurtainWallStore();
    store.add(record as never);
    const stored = store.get(id);
    expect(stored, 'the copied curtain wall must reach the CurtainWallStore').toBeDefined();
    return stored as unknown as Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// L-978 — the curtain wall
// ─────────────────────────────────────────────────────────────────────────────

describe('§FIX-COPY-PAYLOAD-FIELD-NAMES — a copied curtain wall lands where the original was', () => {
    it('MECHANISM — the dispatch speaks the payload\'s vocabulary, not the legacy store\'s', () => {
        const payload = curtainWallCopyPayload(sourceCurtainWall(), DX, DZ, nextId('curtainwall'));
        // Positive control on the SAME object: a key that was ALWAYS correct.
        expect(payload['height'], '`height` is spelled the same in both vocabularies').toBe(4.5);
        expect(payload['baseLine'], 'CreateCurtainWallPayload wants `baseLine`').toBeDefined();
        expect(payload['start'], '`start` is not a CreateCurtainWallPayload key').toBeUndefined();
        expect(payload['end'], '`end` is not a CreateCurtainWallPayload key').toBeUndefined();
        expect(payload['bayWidth'], 'legacy `gridXSpacing` is L0 `bayWidth`').toBe(0.9);
        expect(payload['gridXSpacing'], '`gridXSpacing` is not a CreateCurtainWallPayload key').toBeUndefined();
        expect(payload['bayHeight'], 'legacy `gridYSpacing` is L0 `bayHeight`').toBe(2.25);
        expect(payload['gridYSpacing'], '`gridYSpacing` is not a CreateCurtainWallPayload key').toBeUndefined();
    });

    it('ARM 1 — the COMMITTED curtain wall stands at the copy destination, not at the schema default', async () => {
        const committed = await commitCurtainWall(
            curtainWallCopyPayload(sourceCurtainWall(), DX, DZ, nextId('curtainwall')),
        );
        expect(committed['baseLine']).toEqual([
            { x: 35, y: 3.2, z: 44 },
            { x: 43, y: 3.2, z: 44 },
        ]);
        expect(
            committed['baseLine'],
            'every copied curtain wall used to be minted at the L0 default baseLine',
        ).not.toEqual(CW_DEFAULT_BASELINE);
    });

    it('ARM 2 — the COMMITTED curtain wall keeps the original\'s division, not the default bays', async () => {
        const committed = await commitCurtainWall(
            curtainWallCopyPayload(sourceCurtainWall(), DX, DZ, nextId('curtainwall')),
        );
        expect(committed['bayWidth']).toBe(0.9);
        expect(committed['bayWidth'], 'the default always won').not.toBe(CW_DEFAULT_BAY_WIDTH);
        expect(committed['bayHeight']).toBe(2.25);
        expect(committed['bayHeight']).not.toBe(CW_DEFAULT_BAY_HEIGHT);
    });

    it('ARM 3 — the copy reaches a real CurtainWallStore with the destination geometry AND the source grid', async () => {
        const stored = await copiedCurtainWallInStore();
        expect(stored['baseLine']).toEqual([
            { x: 35, y: 3.2, z: 44 },
            { x: 43, y: 3.2, z: 44 },
        ]);
        expect(stored['baseLine'], 'the store used to receive the origin').not.toEqual(CW_DEFAULT_BASELINE);
        // `migrateToGridSystem()` reads exactly these two; the mullion count is theirs.
        expect(stored['gridXSpacing']).toBe(0.9);
        expect(stored['gridYSpacing']).toBe(2.25);
        expect(stored['gridXSpacing']).not.toBe(CW_DEFAULT_BAY_WIDTH);
    });

    it('ARM 4 — `mullionSize`, `panelThickness`, `baseOffset` and `height` survive the round trip through both vocabularies', async () => {
        const stored = await copiedCurtainWallInStore();
        // legacy `mullionSize` → payload `mullionThickness` → legacy `mullionSize`.
        expect(stored['mullionSize']).toBe(0.08);
        expect(stored['mullionSize'], 'the mirror default is 0.05').not.toBe(0.05);
        expect(stored['panelThickness']).toBe(0.024);
        expect(stored['baseOffset']).toBe(0.3);
        expect(stored['baseOffset'], 'a dropped baseOffset reads as 0').not.toBe(0);
        expect(stored['height']).toBe(4.5);
        expect(stored['levelId']).toBe(LEVEL_ID);
    });

    it('ARM 5 — a wall whose baseLine has no `y` is REFUSED BY NAME, which is why the copy must carry it', async () => {
        const src = sourceCurtainWall();
        const bad = curtainWallCopyPayload(src, DX, DZ, nextId('curtainwall'));
        (bad['baseLine'] as Array<Record<string, unknown>>).forEach(p => { delete p['y']; });
        await expect(commitCurtainWall(bad)).rejects.toThrow(/finite Vec3/);
        // Paired positive on the SAME expression: with `y` present it is accepted,
        // so ARM 5 is not refusing every curtain wall.
        await expect(
            commitCurtainWall(curtainWallCopyPayload(src, DX, DZ, nextId('curtainwall'))),
        ).resolves.toBeDefined();
    });

    it('ARM 6 — an ambiguous material is NAMED, not silently mis-filed into the one generic slot', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const payload = curtainWallCopyPayload(
                sourceCurtainWall({ mullionMaterialId: 'mat-anodised-al', glazingMaterialId: 'mat-low-e' }),
                DX, DZ, nextId('curtainwall'),
            );
            // The copy does NOT guess which of the two the single `materialId` means.
            expect(payload['materialId'], 'guessing swaps a silent drop for a silent mis-file').toBeUndefined();
            expect(warn).toHaveBeenCalled();
            const said = String(warn.mock.calls[0]?.[0]);
            expect(said).toContain('mullionMaterialId');
            expect(said).toContain('glazingMaterialId');
        } finally {
            warn.mockRestore();
        }
    });

    it('ARM 6 CONTROL — a wall with NEITHER material id warns about nothing', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            curtainWallCopyPayload(sourceCurtainWall(), DX, DZ, nextId('curtainwall'));
            expect(warn, 'the ordinary curtain wall must copy silently').not.toHaveBeenCalled();
        } finally {
            warn.mockRestore();
        }
    });

    it('ARM 7 — a non-uniform `gridSystem` cannot be carried and SAYS SO, rather than copying as uniform in silence', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            curtainWallCopyPayload(
                sourceCurtainWall({ gridSystem: { uAxis: [], vAxis: [], cells: [] } }),
                DX, DZ, nextId('curtainwall'),
            );
            expect(warn).toHaveBeenCalled();
            expect(String(warn.mock.calls[0]?.[0])).toContain('gridSystem');
        } finally {
            warn.mockRestore();
        }
    });

    it('CONTROL — an UNSTATED grid still lands on the documented L0 defaults, unchanged by any of this', async () => {
        const bare: LegacyCurtainWallLike = {
            levelId: LEVEL_ID,
            baseLine: [{ x: 25, y: 0, z: 40 }, { x: 33, y: 0, z: 40 }],
            height: 3,
        };
        const committed = await commitCurtainWall(curtainWallCopyPayload(bare, DX, DZ, nextId('curtainwall')));
        expect(committed['bayWidth']).toBe(CW_DEFAULT_BAY_WIDTH);
        expect(committed['bayHeight']).toBe(CW_DEFAULT_BAY_HEIGHT);
        // …and the geometry is still the destination, not the default.
        expect(committed['baseLine']).toEqual([{ x: 35, y: 0, z: 44 }, { x: 43, y: 0, z: 44 }]);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// The sweep — wall
// ─────────────────────────────────────────────────────────────────────────────

function sourceWall(extra: Partial<LegacyWallLike> = {}): LegacyWallLike {
    return {
        levelId: LEVEL_ID,
        baseLine: [{ x: 5, y: 3.2, z: 7 }, { x: 11, y: 3.2, z: 7 }],
        height: 2.7,
        thickness: 0.2,
        ...extra,
    };
}

async function commitWall(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const { CreateWallHandler } = await import('../../../plugins/wall/src/handlers/CreateWall');
    const handler = new CreateWallHandler();
    const ctx = { stores: { wall: {} } } as never;
    const verdict = handler.canExecute(ctx, payload as never);
    if (!verdict.valid) throw new Error(`REFUSED: ${verdict.reason}`);
    const forward = handler.execute(ctx, payload as never).forward as Array<{ value?: Record<string, unknown> }>;
    return forward[0]?.value ?? {};
}

describe('§FIX-COPY-PAYLOAD-FIELD-NAMES (sweep) — the wall copy', () => {
    it('MECHANISM — both baseLine endpoints carry `y`; `Vec3` has no default for it', () => {
        const payload = wallCopyPayload(sourceWall(), DX, DZ, nextId('wall'));
        const bl = payload['baseLine'] as Array<Record<string, number>>;
        // Positive control on the SAME endpoints: x and z were always carried.
        expect(bl[0]['x'], 'the x delta was always applied').toBe(15);
        expect(bl[0]['z']).toBe(11);
        expect(bl[0]['y'], 'the endpoint was built as {x, z} — y was dropped').toBe(3.2);
        expect(bl[1]['y']).toBe(3.2);
    });

    it('ARM 1 — a copied wall COMMITS, at the destination, instead of throwing a ZodError into the catch', async () => {
        const committed = await commitWall(wallCopyPayload(sourceWall(), DX, DZ, nextId('wall')));
        expect(committed['baseLine']).toEqual([
            { x: 15, y: 3.2, z: 11 },
            { x: 21, y: 3.2, z: 11 },
        ]);
        expect(committed['thickness']).toBe(0.2);
    });

    it('ARM 1 CONTROL — the SAME wall with `y` stripped is refused, so ARM 1 measures the y and not the delta', async () => {
        const bad = wallCopyPayload(sourceWall(), DX, DZ, nextId('wall'));
        (bad['baseLine'] as Array<Record<string, unknown>>).forEach(p => { delete p['y']; });
        await expect(commitWall(bad)).rejects.toThrow();
    });

    it('ARM 2 — a copied CURVED wall stays curved; the copy used to commit the straight chord', async () => {
        const curve = { control: { x: 8, y: 3.2, z: 10 }, segments: 16 };
        const committed = await commitWall(
            wallCopyPayload(sourceWall({ curve }), DX, DZ, nextId('wall')),
        );
        expect(committed['curve'], '`curve` is a CreateWallPayload key the copy never sent').toEqual(curve);
        expect(committed['curve']).not.toBeUndefined();
    });

    it('ARM 3 — a copied LAYERED wall keeps its finish stack', async () => {
        // The legacy `WallLayer` (`geometry-wall/src/WallTypes.ts`) is field-for-field
        // the L0 `WallLayer`, which is why the stack can be forwarded verbatim.
        const layers = [
            { name: 'Render',    function: 'finish-exterior', thickness: 0.02, materialColor: '#6600FF' },
            { name: 'Blockwork', function: 'structure',       thickness: 0.16 },
            { name: 'Plaster',   function: 'finish-interior', thickness: 0.02, materialColor: '#ffffff' },
        ];
        const committed = await commitWall(
            wallCopyPayload(sourceWall({ layers }), DX, DZ, nextId('wall')),
        );
        expect((committed['layers'] as unknown[])?.length).toBe(3);
        expect(committed['layers']).not.toBeUndefined();
    });

    it('CONTROL — a plain straight unlayered wall carries neither key, and is otherwise untouched', async () => {
        const committed = await commitWall(wallCopyPayload(sourceWall(), DX, DZ, nextId('wall')));
        expect(committed['curve']).toBeUndefined();
        expect(committed['layers']).toBeUndefined();
        expect(committed['height']).toBe(2.7);
        expect(committed['levelId']).toBe(LEVEL_ID);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// The sweep — slab
// ─────────────────────────────────────────────────────────────────────────────

function sourceSlab(extra: Partial<LegacySlabLike> = {}): LegacySlabLike {
    return {
        levelId: LEVEL_ID,
        width: 6, depth: 4, thickness: 0.25,
        position: { x: 2, y: 0, z: 3 },
        polygon: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }, { x: 0, y: 4 }],
        baseOffset: -0.1,
        materialId: 'mat-concrete-c30',
        materialColor: '#9aa0a6',
        systemTypeId: 'slabtype-generic-250',
        ...extra,
    };
}

async function commitSlab(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const { CreateSlabHandler } = await import('../../../plugins/slab/src/handlers/CreateSlab');
    const handler = new CreateSlabHandler();
    const ctx = { stores: { slab: {} } } as never;
    const verdict = handler.canExecute(ctx, payload as never);
    if (!verdict.valid) throw new Error(`REFUSED: ${verdict.reason}`);
    const forward = handler.execute(ctx, payload as never).forward as Array<{ value?: Record<string, unknown> }>;
    return forward[0]?.value ?? {};
}

describe('§FIX-COPY-PAYLOAD-FIELD-NAMES (sweep) — the slab copy', () => {
    it('MECHANISM — the four keys CreateSlabPayload accepts and the copy never sent', () => {
        const payload = slabCopyPayload(sourceSlab(), DX, DZ, nextId('slab'), 'guid-1');
        // Positive control on the SAME object: the geometry keys were always sent.
        expect(payload['thickness'], 'thickness was always carried').toBe(0.25);
        expect(payload['materialId']).toBe('mat-concrete-c30');
        expect(payload['materialColor']).toBe('#9aa0a6');
        expect(payload['systemTypeId']).toBe('slabtype-generic-250');
        expect(payload['baseOffset']).toBe(-0.1);
    });

    it('ARM 1 — the COMMITTED slab keeps its material, its finish colour and its slab TYPE', async () => {
        const committed = await commitSlab(slabCopyPayload(sourceSlab(), DX, DZ, nextId('slab'), 'guid-2'));
        expect(committed['materialId']).toBe('mat-concrete-c30');
        expect(committed['materialId'], 'a copied slab used to commit with no material at all').not.toBeUndefined();
        expect(committed['materialColor']).toBe('#9aa0a6');
        expect(committed['systemTypeId']).toBe('slabtype-generic-250');
        expect(committed['baseOffset']).toBe(-0.1);
    });

    it('ARM 2 — the polygon carries worldZ in BOTH `y` and `z`, the §FIX-SLAB-ZERO-AREA convention the sibling plan tool already uses', () => {
        const payload = slabCopyPayload(sourceSlab(), DX, DZ, nextId('slab'), 'guid-3');
        expect(payload['polygon']).toEqual([
            { x: 10, y: 4,  z: 4  },
            { x: 16, y: 4,  z: 4  },
            { x: 16, y: 8,  z: 8  },
            { x: 10, y: 8,  z: 8  },
        ]);
        // Positive control on the SAME points: `y` is still the legacy plan axis.
        expect((payload['polygon'] as Array<Record<string, number>>)[2]!['y']).toBe(8);
    });

    it('ARM 2b — `position` is NOT translated, because the builder world point is `position + vertex`', () => {
        // `SlabFragmentBuilder` sets pivot = position + centroid(polygon) and child
        // offset = -centroid, so a vertex lands at `position.x + vertex.x`. Adding the
        // delta to BOTH the polygon and the position would place the copy at 2 × delta.
        const payload = slabCopyPayload(sourceSlab(), DX, DZ, nextId('slab'), 'guid-3b');
        expect(payload['position']).toEqual({ x: 2, y: 0, z: 3 });
        expect(payload['position'], 'translating both halves doubles the copy distance').not.toEqual({ x: 12, y: 0, z: 7 });
    });

    it('ARM 3 — `systemTypeId: null` ("plain slab") is normalised away, not forwarded as a value the schema rejects', async () => {
        const payload = slabCopyPayload(sourceSlab({ systemTypeId: null }), DX, DZ, nextId('slab'), 'guid-4');
        expect(payload['systemTypeId']).toBeUndefined();
        // Paired positive on the SAME expression: a real id IS forwarded.
        expect(
            slabCopyPayload(sourceSlab(), DX, DZ, nextId('slab'), 'guid-5')['systemTypeId'],
        ).toBe('slabtype-generic-250');
        await expect(commitSlab(payload)).resolves.toBeDefined();
    });

    it('ARM 4 — a layer stack has no slot on either receiver and is NAMED rather than dropped in silence', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            slabCopyPayload(sourceSlab({ layers: [{ name: 'screed' }, { name: 'structure' }] }),
                DX, DZ, nextId('slab'), 'guid-6');
            expect(warn).toHaveBeenCalled();
            expect(String(warn.mock.calls[0]?.[0])).toContain('layer');
        } finally {
            warn.mockRestore();
        }
    });

    it('CONTROL — a plain slab with no material and no type warns about nothing and commits', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const bare: LegacySlabLike = {
                levelId: LEVEL_ID, thickness: 0.2,
                position: { x: 0, y: 0, z: 0 },
                polygon: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }],
            };
            const committed = await commitSlab(slabCopyPayload(bare, DX, DZ, nextId('slab'), 'guid-7'));
            expect(warn).not.toHaveBeenCalled();
            expect(committed['thickness']).toBe(0.2);
        } finally {
            warn.mockRestore();
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// The sweep — furniture
// ─────────────────────────────────────────────────────────────────────────────

function sourceFurniture(extra: Partial<LegacyFurnitureLike> = {}): LegacyFurnitureLike {
    return {
        levelId: LEVEL_ID,
        furnitureType: 'bed-double',
        position: { x: 1, y: 0, z: 2 },
        rotation: { x: 0, y: Math.PI / 2, z: 0 },
        baseOffset: 0,
        width: 1.6, length: 2.0, height: 0.5,
        material: 'wood',
        ...extra,
    };
}

describe('§FIX-COPY-PAYLOAD-FIELD-NAMES (sweep) — the furniture copy', () => {
    it('MECHANISM — `rotation` is the SCALAR yaw both receivers read, not the legacy EulerDTO object', () => {
        const payload = furnitureCopyPayload(sourceFurniture(), DX, DZ, nextId('furniture'));
        // Positive control on the SAME object: `position` stays an object, correctly.
        expect(payload['position'], 'position is a Vec3 on both sides').toEqual({ x: 11, y: 0, z: 6 });
        expect(payload['rotation']).toBe(Math.PI / 2);
        expect(
            typeof payload['rotation'],
            'the §FT-FURNITURE bridge writes `{ x: 0, y: ev.rotation ?? 0, z: 0 }` — an OBJECT survives the ?? and nests inside y',
        ).toBe('number');
    });

    it('ARM 1 — the emitted `furniture.created` carries a number, so the legacy mirror\'s `y` is a number', async () => {
        const payload = furnitureCopyPayload(sourceFurniture(), DX, DZ, nextId('furniture'));
        const ev = await createdEventFor('furniture.create', 'furniture.created', payload);
        expect(typeof ev['rotation']).toBe('number');
        expect(ev['rotation']).toBe(Math.PI / 2);
        // The exact expression `initTools.ts` §FT-FURNITURE evaluates on this event.
        const legacyRotation = { x: 0, y: (ev['rotation'] as number) ?? 0, z: 0 };
        expect(typeof legacyRotation.y, 'a copied rotated item used to mirror with an object here').toBe('number');
        expect(legacyRotation.y).toBe(Math.PI / 2);
        // The rest of the mirror's inputs must be untouched by this change.
        expect(ev['position']).toEqual({ x: 11, y: 0, z: 6 });
        expect(ev['furnitureType']).toBe('bed-double');
        expect(ev['width']).toBe(1.6);
    });

    it('ARM 2 — a scalar `rotation` already in the store passes through unchanged', () => {
        const payload = furnitureCopyPayload(
            sourceFurniture({ rotation: 1.25 }), DX, DZ, nextId('furniture'),
        );
        expect(payload['rotation']).toBe(1.25);
    });

    it('ARM 3 — an L-shaped sofa\'s arm geometry has no slot on either receiver and is NAMED', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            furnitureCopyPayload(
                sourceFurniture({
                    furnitureType: 'sofa-corner',
                    widthMain: 2.4, lengthSide: 1.8,
                    startPoint: { x: 0, y: 0, z: 0 },
                    cornerPoint: { x: 2.4, y: 0, z: 0 },
                    endPoint: { x: 2.4, y: 0, z: 1.8 },
                }),
                DX, DZ, nextId('furniture'),
            );
            expect(warn).toHaveBeenCalled();
            const said = String(warn.mock.calls[0]?.[0]);
            expect(said).toContain('widthMain');
            expect(said).toContain('cornerPoint');
        } finally {
            warn.mockRestore();
        }
    });

    it('CONTROL — an ordinary item copies silently and keeps the fields the mirror does read', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const payload = furnitureCopyPayload(sourceFurniture(), DX, DZ, nextId('furniture'));
            expect(warn).not.toHaveBeenCalled();
            expect(payload['furnitureType']).toBe('bed-double');
            expect(payload['width']).toBe(1.6);
            expect(payload['length']).toBe(2.0);
            expect(payload['material']).toBe('wood');
            expect(payload['levelId']).toBe(LEVEL_ID);
        } finally {
            warn.mockRestore();
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// The sweep — the column, which is NOT a defect and must stay loud
// ─────────────────────────────────────────────────────────────────────────────

async function commitColumn(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const { CreateColumnHandler } = await import('../../../plugins/column/src/handlers/CreateColumn');
    const handler = new CreateColumnHandler();
    const ctx = { stores: { column: {} } } as never;
    const verdict = handler.canExecute(ctx, payload as never);
    if (!verdict.valid) throw new Error(`REFUSED: ${verdict.reason}`);
    const forward = handler.execute(ctx, payload as never).forward as Array<{ value?: Record<string, unknown> }>;
    return forward[0]?.value ?? {};
}

function sourceColumn(profile: string): LegacyColumnLike {
    return {
        levelId: LEVEL_ID,
        position: { x: 4, y: 0, z: 9 },
        height: 3, rotation: 0,
        profile,
        width: 0.4, depth: 0.4, baseOffset: 0,
    };
}

describe('§FIX-COPY-PAYLOAD-FIELD-NAMES (sweep) — the column stays LOUD (C84 EI-3, deliberately unfixed)', () => {
    it('a steel `UC` column REFUSES rather than minting a wrong column — do not turn this into silence', async () => {
        await expect(
            commitColumn(columnCopyPayload(sourceColumn('UC'), DX, DZ, nextId('column'))),
        ).rejects.toThrow();
        await expect(
            commitColumn(columnCopyPayload(sourceColumn('UB'), DX, DZ, nextId('column'))),
        ).rejects.toThrow();
    });

    it('CONTROL — a concrete column copies normally, so the refusal above is the STEEL case and not every column', async () => {
        const committed = await commitColumn(columnCopyPayload(sourceColumn('rectangular'), DX, DZ, nextId('column')));
        expect(committed['shape']).toBe('rectangular');
        expect(committed['origin']).toEqual({ x: 14, y: 0, z: 13 });
        expect(committed['height']).toBe(3);
    });
});
