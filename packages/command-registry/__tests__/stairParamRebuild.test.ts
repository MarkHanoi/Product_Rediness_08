// ─── §FIX-STAIR-PARAM-NO-REGEN (L-215) — parametric-rebuild integration test ──
//
// Proves that a stair parameter edit routed through UpdateElementParameterCommand
// now re-derives the stair's geometry and rebuilds the mesh — via the declarative
// ElementRebuildRegistry (GenerateStairGeometryCommand), NOT a hard-coded branch —
// and that window / door / roof are untouched by the new mechanism (P3).

import { describe, it, expect } from 'vitest';
import { UpdateElementParameterCommand } from '../src/generic/UpdateElementParameterCommand';
import {
    resolveElementRebuildDescriptor,
    isGeometryAffectingChange,
} from '../src/generic/ElementRebuildRegistry';
import type { CommandContext } from '../src/types';

function makeStair(overrides: Record<string, any> = {}) {
    const now = new Date().toISOString();
    return {
        id: 'st-1',
        type: 'stair',
        levelId: 'L0',
        baseLevelId: 'L0',
        topLevelId: 'L1',
        baseOffset: 0,
        topOffset: 0,
        shape: 'I',
        startPosition: { x: 0, y: 0, z: 0 },
        width: 1.0,
        riserHeight: 0.17,
        treadDepth: 0.28,
        riserCount: 18,
        flights: [{ direction: { x: 1, y: 0, z: 0 }, riserCount: 18 }],
        landings: [],
        properties: {},
        parameters: {},
        fireRating: undefined,
        metadata: { createdAt: now, modifiedAt: now, version: 0, source: 'user' },
        ...overrides,
    };
}

/** Faithful in-memory stairStore stub mirroring StairStore.update's merge semantics. */
function makeStairStore(initial: any) {
    const map = new Map<string, any>([[initial.id, initial]]);
    return {
        get: (id: string) => map.get(id),
        getById: (id: string) => map.get(id),
        update: (id: string, updates: any) => {
            const cur = map.get(id);
            if (!cur) return undefined;
            const merged = { ...cur, ...updates };
            if (updates.properties && cur.properties) {
                merged.properties = { ...cur.properties, ...updates.properties };
            }
            map.set(id, merged);
            return merged;
        },
        peek: (id: string) => map.get(id),
    };
}

/** stairMeshBuilder stub recording every rebuild. */
function makeMeshBuilder() {
    const updates: any[] = [];
    const removed: string[] = [];
    return {
        updateStair: (stair: any) => { updates.push(structuredClone(stair)); },
        removeStair: (id: string) => { removed.push(id); },
        updates: () => updates,
        removed: () => removed,
        last: () => updates[updates.length - 1],
    };
}

function makeCtx(stairStore: any, meshBuilder: any) {
    return {
        stores: {
            stairStore,
            stairMeshBuilder: meshBuilder,
            wallStore: {
                getLevels: () => [
                    { id: 'L0', elevation: 0 },
                    { id: 'L1', elevation: 3.0 },
                ],
            },
        },
    } as unknown as CommandContext;
}

describe('UpdateElementParameterCommand — stair parametric rebuild (§FIX-STAIR-PARAM-NO-REGEN)', () => {
    it('width edit re-derives the landing polygon (L-shape) and rebuilds the mesh', () => {
        const stair = makeStair({
            shape: 'L',
            flights: [
                { direction: { x: 1, y: 0, z: 0 }, riserCount: 9 },
                { direction: { x: 0, y: 0, z: 1 }, riserCount: 9 },
            ],
            landings: [{ depth: 1.0 }],
        });
        const store = makeStairStore(stair);
        const mesh = makeMeshBuilder();
        const cmd = new UpdateElementParameterCommand({
            elementId: 'st-1', elementType: 'stair', parameters: { width: 1.4 },
        });

        const res = cmd.execute(makeCtx(store, mesh));
        expect(res.success).toBe(true);

        // landing depth re-derived to the new width…
        expect(store.peek('st-1').landings[0].depth).toBeCloseTo(1.4, 6);
        // …and the mesh was rebuilt from the reconciled record (no stale geometry).
        expect(mesh.updates().length).toBeGreaterThan(0);
        expect(mesh.last().landings[0].depth).toBeCloseTo(1.4, 6);
        expect(mesh.last().width).toBeCloseTo(1.4, 6);
    });

    it('riserHeight edit re-derives the riser COUNT', () => {
        const store = makeStairStore(makeStair());
        const mesh = makeMeshBuilder();
        const cmd = new UpdateElementParameterCommand({
            elementId: 'st-1', elementType: 'stair', parameters: { riserHeight: 0.15 },
        });

        cmd.execute(makeCtx(store, mesh));

        expect(store.peek('st-1').riserCount).toBe(20);            // round(3.0/0.15)
        expect(store.peek('st-1').flights[0].riserCount).toBe(20);
        expect(mesh.last().riserCount).toBe(20);
    });

    it('treadDepth edit updates the going (mesh rebuilt with the new tread depth)', () => {
        const store = makeStairStore(makeStair());
        const mesh = makeMeshBuilder();
        const cmd = new UpdateElementParameterCommand({
            elementId: 'st-1', elementType: 'stair', parameters: { treadDepth: 0.32 },
        });

        cmd.execute(makeCtx(store, mesh));

        expect(store.peek('st-1').treadDepth).toBeCloseTo(0.32, 6);
        expect(mesh.last().treadDepth).toBeCloseTo(0.32, 6);
    });

    it('the mesh is rebuilt (old mesh disposed) exactly when a geometry param changes', () => {
        const store = makeStairStore(makeStair());
        const mesh = makeMeshBuilder();

        // Geometry edit → rebuild.
        new UpdateElementParameterCommand({
            elementId: 'st-1', elementType: 'stair', parameters: { width: 1.2 },
        }).execute(makeCtx(store, mesh));
        expect(mesh.updates().length).toBe(1);

        // Non-geometry edit (fireRating) → the declared geometryParams do NOT match,
        // so no rebuild command is dispatched.
        new UpdateElementParameterCommand({
            elementId: 'st-1', elementType: 'stair', parameters: { fireRating: '60min' },
        }).execute(makeCtx(store, mesh));
        expect(mesh.updates().length).toBe(1); // unchanged — no extra rebuild
    });

    it('REGRESSION GUARD — window / door / roof are NOT routed through the new registry', () => {
        // Only stair registers a descriptor; window/door/roof keep their existing
        // branches in UpdateElementParameterCommand untouched (P3).
        expect(resolveElementRebuildDescriptor('stair')).toBeDefined();
        expect(resolveElementRebuildDescriptor('stairs')).toBeDefined();
        expect(resolveElementRebuildDescriptor('window')).toBeUndefined();
        expect(resolveElementRebuildDescriptor('door')).toBeUndefined();
        expect(resolveElementRebuildDescriptor('roof')).toBeUndefined();
        expect(resolveElementRebuildDescriptor('wall')).toBeUndefined();
    });

    it('isGeometryAffectingChange honours the declared params (incl. dot-notation roots)', () => {
        const stair = resolveElementRebuildDescriptor('stair')!;
        expect(isGeometryAffectingChange(stair, ['width'])).toBe(true);
        expect(isGeometryAffectingChange(stair, ['riserHeight'])).toBe(true);
        expect(isGeometryAffectingChange(stair, ['properties.railingType'])).toBe(true); // root match
        expect(isGeometryAffectingChange(stair, ['fireRating'])).toBe(false);
        expect(isGeometryAffectingChange(stair, ['mark'])).toBe(false);
    });
});
