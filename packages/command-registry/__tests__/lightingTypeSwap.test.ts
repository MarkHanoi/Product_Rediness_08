// ─── §FEAT-ELEMENT-TYPE-PICKER-REGISTRY — the lighting type swap ─────────────────
//
// THE DEFECT THIS PINS: lighting had no type picker anywhere in the product, and the
// `element.changeType` route that DID exist could not express a type change in a
// typed way — `UpdateLightingParametersCommand`'s patch explicitly OMITTED
// `fixtureType`, so the bus branch compiled only via `as any`. A type hole standing
// in for a missing feature: nothing selected a fixture type, so nothing noticed that
// the command could not carry one.
//
// Asserted here:
//   (1) the catalogue is enumerable, non-empty, and its ids are exactly the fixture
//       types the geometry union declares — a catalogue that names a type the builder
//       cannot build renders nothing, silently;
//   (2) a swap writes `fixtureType` to the store the fragment builder reads, and
//       asks the builder to rebuild (a light's whole geometry switches on its type);
//   (3) in place — the id, level and position are untouched;
//   (4) undo restores the exact prior record, including the prior fixtureType;
//   (5) the command declares the store it actually writes (`lighting`, not `level`),
//       which is what buildUndoStoreMap() covers.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    BUILT_IN_LIGHTING_TYPES,
    getLightingTypeDefinition,
} from '@pryzm/geometry-lighting';
import { UpdateLightingParametersCommand } from '../src/lighting/UpdateLightingParametersCommand';
import type { CommandContext } from '../src/types';

const LIGHT_ID = 'light_test_1';

function makeLight(): Record<string, unknown> {
    return {
        id: LIGHT_ID,
        type: 'lighting',
        levelId: 'L0',
        fixtureType: 'downlight',
        position: { x: 1, y: 2.6, z: 3 },
        downlightParams: { radius: 0.06 },
    };
}

function makeEnv() {
    const map = new Map<string, Record<string, unknown>>([[LIGHT_ID, makeLight()]]);
    const rebuilt: string[] = [];
    const lightingStore = {
        has: (id: string) => map.has(id),
        get: (id: string) => map.get(id),
        update: (id: string, patch: Record<string, unknown>) => {
            const cur = map.get(id);
            if (!cur) return;
            map.set(id, { ...cur, ...patch, id });
        },
    };
    const w = window as unknown as Record<string, unknown>;
    w.lightingStore = lightingStore;
    w.lightingFragmentBuilder = { update: (d: { id: string }) => { rebuilt.push(d.id); } };
    return {
        ctx: { stores: { lightingStore } } as unknown as CommandContext,
        read: () => map.get(LIGHT_ID)!,
        rebuilt,
    };
}

describe('lighting type swap — §FEAT-ELEMENT-TYPE-PICKER-REGISTRY', () => {
    let env: ReturnType<typeof makeEnv>;
    beforeEach(() => { env = makeEnv(); });
    afterEach(() => {
        const w = window as unknown as Record<string, unknown>;
        delete w.lightingStore;
        delete w.lightingFragmentBuilder;
    });

    it('(1) the catalogue is enumerable, non-empty and uniquely keyed', () => {
        expect(BUILT_IN_LIGHTING_TYPES.length).toBeGreaterThan(1);
        const ids = BUILT_IN_LIGHTING_TYPES.map(t => t.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const t of BUILT_IN_LIGHTING_TYPES) {
            expect(t.name.length).toBeGreaterThan(0);
            expect(['ceiling', 'floor', 'table', 'wall']).toContain(t.mount);
        }
    });

    it('(1) every catalogue id is a fixture type the builder can build', () => {
        // The union is compile-time only, so this asserts the join key holds by
        // construction: `getLightingTypeDefinition` round-trips every id, and the ids
        // are typed as LightingFixtureType (a wrong literal would not compile).
        for (const t of BUILT_IN_LIGHTING_TYPES) {
            expect(getLightingTypeDefinition(t.id)?.id).toBe(t.id);
        }
        expect(getLightingTypeDefinition('not-a-fixture')).toBeUndefined();
    });

    it('(2) a swap writes fixtureType to the store and rebuilds the fixture', () => {
        const cmd = new UpdateLightingParametersCommand({
            elementId: LIGHT_ID,
            patch: { fixtureType: 'pendant_cluster' },
        });
        expect(cmd.canExecute(env.ctx).ok).toBe(true);
        expect(cmd.execute(env.ctx).success).toBe(true);

        expect(env.read().fixtureType).toBe('pendant_cluster');
        expect(env.rebuilt).toContain(LIGHT_ID);
    });

    it('(3) in place — id, level and position survive the swap', () => {
        const before = structuredClone(env.read());
        new UpdateLightingParametersCommand({
            elementId: LIGHT_ID, patch: { fixtureType: 'linear_led' },
        }).execute(env.ctx);

        const after = env.read();
        expect(after.id).toBe(LIGHT_ID);
        expect(after.levelId).toBe(before.levelId);
        expect(after.position).toEqual(before.position);
    });

    it('(4) undo restores the prior fixture type', () => {
        const cmd = new UpdateLightingParametersCommand({
            elementId: LIGHT_ID, patch: { fixtureType: 'floor_arc_brass' },
        });
        cmd.execute(env.ctx);
        expect(env.read().fixtureType).toBe('floor_arc_brass');

        expect(cmd.undo(env.ctx).success).toBe(true);
        expect(env.read().fixtureType).toBe('downlight');
        expect(env.rebuilt.filter(id => id === LIGHT_ID).length).toBe(2);   // swap + undo
    });

    it('(5) the command declares the store it actually writes', () => {
        const cmd = new UpdateLightingParametersCommand({ elementId: LIGHT_ID, patch: {} });
        expect(cmd.affectedStores).toEqual(['lighting']);
    });

    it('REFUSES an unknown element rather than silently succeeding', () => {
        const cmd = new UpdateLightingParametersCommand({ elementId: 'nope', patch: { fixtureType: 'pendant' } });
        expect(cmd.canExecute(env.ctx).ok).toBe(false);
    });
});
