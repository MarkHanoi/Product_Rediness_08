// §FIX-PERSIST-KITCHEN-WARDROBE-LIGHTING (L-85) regression.
//
// Kitchen (composite furniture), wardrobe (furniture) and lighting elements were
// present after creation but GONE after project close→reopen. Two independent
// root causes, both on the DEFAULT-ON fast load path (ImportProjectCommand):
//
//   • LIGHTING — the fixture is persisted (ProjectSerializer §PERSIST-LIGHTING)
//     and the LightingStore is registered in ProjectScopeRegistry, so
//     ClearProjectCommand.clearAll() WIPES it on every open — but the fast load
//     path had NO lighting restore step (only the legacy per-command ProjectLoader
//     path restored lighting). Every light was cleared and never re-created.
//
//   • KITCHEN / WARDROBE — ordinary FurnitureData carrying the parametric RUN
//     configs (kitchenConfig / wardrobeCabinetConfig). If the restore mapping
//     drops a config, FurnitureFactory throws ("requires kitchenConfig") or
//     collapses the RUN to a single primitive (Contract 13 §2). The restore
//     mapping is now single-sourced + tested so those configs round-trip.
//
// These are pure DATA tests (no THREE, no DOM, no runtime) over the exported
// restore-payload builders that the ImportProjectCommand fast path uses — mirrors
// the loadHealDegeneratePolygon / RblDegeneratePersistenceGuard pattern.

import { describe, it, expect } from 'vitest';
import {
    buildFurnitureRestorePayload,
    buildAIElementRestorePayload,
    buildLightingRestorePayload,
} from '../src/project/projectLoaderUtils';

// A faithful serialised kitchen furniture record (ProjectSerializer.serializeFurniture output).
function serializedKitchen(overrides: Record<string, any> = {}): any {
    return {
        id: 'fu-kitchen-1',
        type: 'furniture',
        furnitureType: 'kitchen_l_shape',
        furnitureCategory: 'kitchen',
        position: { x: 2, y: 0, z: 3 },
        rotation: { x: 0, y: 1.5707, z: 0, order: 'XYZ' },
        levelId: 'L0',
        baseOffset: 0,
        width: 3.6,
        length: 0.6,
        height: 0.9,
        material: 'wood',
        kitchenConfig: {
            layoutType: 'kitchen_l_shape',
            runs: [{ length: 3.6 }, { length: 2.4 }],
            worktopHeight: 0.9,
        },
        metadata: { placedBy: 'kitchen-tool' },
        ...overrides,
    };
}

// A faithful serialised wardrobe furniture record.
function serializedWardrobe(overrides: Record<string, any> = {}): any {
    return {
        id: 'fu-wardrobe-1',
        type: 'furniture',
        furnitureType: 'wardrobe_straight',
        furnitureCategory: 'wardrobes',
        position: { x: 5, y: 0, z: 1 },
        rotation: { x: 0, y: 0, z: 0, order: 'XYZ' },
        levelId: 'L1',
        baseOffset: 0,
        width: 2.4,
        length: 0.6,
        height: 2.2,
        lo3: 200,
        wardrobeCabinetConfig: {
            layoutType: 'wardrobe_straight',
            modules: [{ width: 0.6 }, { width: 0.6 }],
        },
        ...overrides,
    };
}

// A faithful serialised ai_element furniture record (ProjectSerializer.serializeFurniture
// output — furnitureType 'ai_element' carrying the procedural aiElementConfig).
function serializedAIElement(overrides: Record<string, any> = {}): any {
    return {
        id: 'fu-ai-1',
        type: 'furniture',
        furnitureType: 'ai_element',
        position: { x: 4, y: 0, z: 2 },
        rotation: { x: 0, y: 0.7853, z: 0, order: 'XYZ' },
        levelId: 'L0',
        baseOffset: 0.1,
        width: 0.5,
        length: 0.5,
        height: 1.6,
        material: 'metal',
        color: '#8899aa',
        aiElementConfig: {
            version: '1.0',
            elementType: 'ai_floor_lamp',
            displayName: 'Floor Lamp',
            boundingBox: { w: 0.5, h: 1.6, d: 0.5 },
            components: [{ shape: 'cylinder', size: [0.05, 1.6, 0.05], position: [0, 0.8, 0] }],
            metadata: { generatedAt: '2026-07-17T00:00:00Z', prompt: 'a tall floor lamp' },
        },
        ...overrides,
    };
}

// A faithful serialised lighting record (ProjectSerializer §PERSIST-LIGHTING deepStrip output).
function serializedLight(overrides: Record<string, any> = {}): any {
    return {
        id: 'light-1',
        type: 'lighting',
        fixtureType: 'downlight_recessed',
        position: { x: 2, y: 2.7, z: 3 },
        rotation: { x: 0, y: 0, z: 0, order: 'XYZ' },
        levelId: 'L0',
        roomId: 'room-7',
        hostId: 'ceiling-3',
        tags: ['general'],
        properties: { intensity: 800, emergency: false },
        ...overrides,
    };
}

describe('§FIX-PERSIST-KITCHEN-WARDROBE-LIGHTING — buildFurnitureRestorePayload (kitchen/wardrobe)', () => {
    it('a kitchen RUN preserves furnitureType + kitchenConfig + placement (Contract 13 §2 round-trip)', () => {
        const k = serializedKitchen();
        const p = buildFurnitureRestorePayload(k);

        // The two fields whose loss regressed the RUN on reopen:
        expect(p.furnitureType).toBe('kitchen_l_shape');
        expect(p.kitchenConfig).toEqual(k.kitchenConfig);
        // Placement + identity survive verbatim:
        expect(p.id).toBe('fu-kitchen-1');
        expect(p.position).toEqual({ x: 2, y: 0, z: 3 });
        expect(p.rotation).toEqual({ x: 0, y: 1.5707, z: 0, order: 'XYZ' });
        expect(p.levelId).toBe('L0');
        expect(p.furnitureCategory).toBe('kitchen');
        expect(p.metadata).toEqual({ placedBy: 'kitchen-tool' });
    });

    it('a wardrobe RUN preserves furnitureType + wardrobeCabinetConfig + lo3', () => {
        const w = serializedWardrobe();
        const p = buildFurnitureRestorePayload(w);

        expect(p.furnitureType).toBe('wardrobe_straight');
        expect(p.wardrobeCabinetConfig).toEqual(w.wardrobeCabinetConfig);
        expect(p.lo3).toBe(200);
        expect(p.levelId).toBe('L1');
        expect(p.width).toBe(2.4);
        expect(p.height).toBe(2.2);
    });

    it('defaults baseOffset (0.2) and material (wood) when the record omits them', () => {
        const bare = serializedKitchen({ baseOffset: undefined, material: undefined });
        const p = buildFurnitureRestorePayload(bare);
        expect(p.baseOffset).toBe(0.2);
        expect(p.material).toBe('wood');
    });
});

describe('§FIX-PERSIST-KITCHEN-WARDROBE-LIGHTING — buildLightingRestorePayload', () => {
    it('a well-formed fixture round-trips every field the CreateLightingCommand consumes', () => {
        const lt = serializedLight();
        const p = buildLightingRestorePayload(lt);

        expect(p).not.toBeNull();
        expect(p!.id).toBe('light-1');
        expect(p!.fixtureType).toBe('downlight_recessed');
        expect(p!.position).toEqual({ x: 2, y: 2.7, z: 3 });
        expect(p!.rotation).toEqual({ x: 0, y: 0, z: 0, order: 'XYZ' });
        expect(p!.levelId).toBe('L0');
        expect(p!.roomId).toBe('room-7');
        expect(p!.hostId).toBe('ceiling-3');
        expect(p!.tags).toEqual(['general']);
        expect(p!.properties).toEqual({ intensity: 800, emergency: false });
    });

    it('drops a record missing the load-bearing keys (would dispatch a doomed command)', () => {
        expect(buildLightingRestorePayload(null)).toBeNull();
        expect(buildLightingRestorePayload(undefined)).toBeNull();
        expect(buildLightingRestorePayload({})).toBeNull();
        expect(buildLightingRestorePayload(serializedLight({ id: undefined }))).toBeNull();
        expect(buildLightingRestorePayload(serializedLight({ fixtureType: undefined }))).toBeNull();
        expect(buildLightingRestorePayload(serializedLight({ levelId: undefined }))).toBeNull();
        expect(buildLightingRestorePayload(serializedLight({ position: undefined }))).toBeNull();
    });

    it('optional bindings (roomId/hostId/tags) are allowed to be absent', () => {
        const minimal = serializedLight({ roomId: undefined, hostId: undefined, tags: undefined, rotation: undefined });
        const p = buildLightingRestorePayload(minimal);
        expect(p).not.toBeNull();
        expect(p!.id).toBe('light-1');
        expect(p!.roomId).toBeUndefined();
        expect(p!.hostId).toBeUndefined();
        expect(p!.rotation).toBeUndefined();
    });
});

describe('§FIX-PERSIST-AI-ELEMENT — buildAIElementRestorePayload (ai_element round-trip)', () => {
    it('an ai_element preserves aiElementConfig verbatim + placement (Contract 13 §2 round-trip)', () => {
        const a = serializedAIElement();
        const p = buildAIElementRestorePayload(a);

        expect(p).not.toBeNull();
        // The field whose loss made ai_elements vanish on reopen — the ENTIRE
        // procedural geometry lives here, and only CreateAIElementCommand rebuilds it:
        expect(p!.aiElementConfig).toEqual(a.aiElementConfig);
        // Identity + placement survive verbatim:
        expect(p!.id).toBe('fu-ai-1');
        expect(p!.levelId).toBe('L0');
        expect(p!.position).toEqual({ x: 4, y: 0, z: 2 });
        expect(p!.rotation).toEqual({ x: 0, y: 0.7853, z: 0, order: 'XYZ' });
        expect(p!.baseOffset).toBe(0.1);
        expect(p!.material).toBe('metal');
        expect(p!.color).toBe('#8899aa');
    });

    it('returns null for NON-ai_element furniture so it falls back to the generic furniture path', () => {
        // A kitchen / wardrobe / plain sofa must NOT be routed to CreateAIElementCommand.
        expect(buildAIElementRestorePayload(serializedKitchen())).toBeNull();
        expect(buildAIElementRestorePayload(serializedWardrobe())).toBeNull();
        expect(buildAIElementRestorePayload({ furnitureType: 'sofa', id: 'x', levelId: 'L0', position: { x: 0, y: 0, z: 0 } })).toBeNull();
    });

    it('returns null for a malformed ai_element (no config / missing keys) → safe fallback, never a doomed command', () => {
        expect(buildAIElementRestorePayload(null)).toBeNull();
        expect(buildAIElementRestorePayload(undefined)).toBeNull();
        expect(buildAIElementRestorePayload({})).toBeNull();
        expect(buildAIElementRestorePayload(serializedAIElement({ aiElementConfig: undefined }))).toBeNull();
        expect(buildAIElementRestorePayload(serializedAIElement({ id: undefined }))).toBeNull();
        expect(buildAIElementRestorePayload(serializedAIElement({ levelId: undefined }))).toBeNull();
        expect(buildAIElementRestorePayload(serializedAIElement({ position: undefined }))).toBeNull();
    });

    it('defaults baseOffset (0) and material (wood) when the record omits them', () => {
        const bare = serializedAIElement({ baseOffset: undefined, material: undefined, rotation: undefined });
        const p = buildAIElementRestorePayload(bare);
        expect(p).not.toBeNull();
        expect(p!.baseOffset).toBe(0);
        expect(p!.material).toBe('wood');
        expect(p!.rotation).toEqual({ x: 0, y: 0, z: 0 });
    });
});

// A whole-snapshot furniture-array round-trip: the loader routes each record to the
// correct restore command and NO furniture type is silently dropped. This is the
// L-85 acceptance gate at the load-payload boundary — every parametric config that
// drives geometry (kitchen RUN, wardrobe cabinet, ai_element procedural) survives.
describe('§L-85 — mixed furniture array survives the restore-routing round-trip (no silent drop)', () => {
    it('routes kitchen/wardrobe → furniture payload (config kept) and ai_element → ai payload (config kept)', () => {
        const furnitureArray = [
            serializedKitchen({ id: 'k1' }),
            serializedWardrobe({ id: 'w1' }),
            serializedAIElement({ id: 'ai1' }),
            { id: 'sofa1', type: 'furniture', furnitureType: 'sofa', position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, order: 'XYZ' }, levelId: 'L0', width: 2, length: 0.9, height: 0.8, material: 'fabric' },
        ];

        // Mirror the loader's per-record routing decision.
        const routed = furnitureArray.map((f) => {
            const ai = buildAIElementRestorePayload(f);
            return ai ? { via: 'ai' as const, id: f.id, payload: ai } : { via: 'furniture' as const, id: f.id, payload: buildFurnitureRestorePayload(f) };
        });

        // Every input produced exactly one restore payload — nothing dropped.
        expect(routed).toHaveLength(4);
        expect(routed.map((r) => r.id)).toEqual(['k1', 'w1', 'ai1', 'sofa1']);

        const byId = Object.fromEntries(routed.map((r) => [r.id, r]));

        // Kitchen → furniture path, kitchenConfig preserved.
        expect(byId['k1'].via).toBe('furniture');
        expect((byId['k1'].payload as any).kitchenConfig).toBeDefined();

        // Wardrobe → furniture path, wardrobeCabinetConfig preserved.
        expect(byId['w1'].via).toBe('furniture');
        expect((byId['w1'].payload as any).wardrobeCabinetConfig).toBeDefined();

        // ai_element → ai path, aiElementConfig preserved.
        expect(byId['ai1'].via).toBe('ai');
        expect((byId['ai1'].payload as any).aiElementConfig).toBeDefined();

        // Plain sofa → furniture path (no special config), still restored.
        expect(byId['sofa1'].via).toBe('furniture');
        expect((byId['sofa1'].payload as any).furnitureType).toBe('sofa');
    });
});
