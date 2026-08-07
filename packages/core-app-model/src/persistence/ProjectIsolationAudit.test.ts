/**
 * ProjectIsolationAudit — L-224 §AUDIT-PROJECT-ISOLATION-E2E.
 *
 * Unit-tests the PURE `detectLeaks()` core: the audit now runs on EVERY load and
 * compares live state against the loaded snapshot's expected element-id set, so
 * it must (a) stay silent on a legitimately-populated load (zero false positives)
 * and (b) fire on cross-project leftovers (the "open another project" case).
 */

import { describe, it, expect } from 'vitest';
import { detectLeaks, type AuditInput } from './ProjectIsolationAudit';

function base(partial: Partial<AuditInput>): AuditInput {
    return {
        projectId: 'B',
        expectedIds: new Set<string>(),
        sceneObjects: [],
        storeElements: [],
        globals: [],
        ...partial,
    };
}

describe('detectLeaks — populated load (zero false positives)', () => {
    it('is CLEAN when every live element id is in the expected set', () => {
        const report = detectLeaks(base({
            expectedIds: new Set(['wall_B1', 'slab_B2']),
            sceneObjects: [
                { userData: { elementId: 'wall_B1', elementType: 'wall' } },
                { userData: { elementId: 'slab_B2', elementType: 'slab' } },
            ],
            storeElements: [
                { store: 'wallStore', ids: ['wall_B1'] },
                { store: 'slabStore', ids: ['slab_B2'] },
            ],
        }));
        expect(report).toBeNull();
    });
});

describe('detectLeaks — cross-project leftovers (the founder case)', () => {
    it('FLAGS a foreign element in a store (id not in expected set)', () => {
        const report = detectLeaks(base({
            expectedIds: new Set(['wall_B1']),
            storeElements: [{ store: 'wallStore', ids: ['wall_B1', 'furniture_A9'] }],
        }));
        expect(report).not.toBeNull();
        const surf = report!.findings.map(f => f.surface);
        expect(surf).toContain('store.foreignElement');
        expect(report!.findings.find(f => f.surface === 'store.foreignElement')!.count).toBe(1);
    });

    it('FLAGS a foreign element left in the THREE scene', () => {
        const report = detectLeaks(base({
            expectedIds: new Set(['wall_B1']),
            sceneObjects: [{ userData: { elementId: 'plumbing_A1', elementType: 'plumbing' } }],
        }));
        expect(report!.findings.map(f => f.surface)).toContain('scene.foreignElement');
    });

    it('empty project (empty expected set) flags ANY surviving element', () => {
        const report = detectLeaks(base({
            expectedIds: new Set<string>(),
            storeElements: [{ store: 'wallStore', ids: ['wall_A1'] }],
        }));
        expect(report!.findings.map(f => f.surface)).toContain('store.foreignElement');
    });
});

describe('detectLeaks — always-junk surfaces (independent of ids)', () => {
    it('FLAGS an underlay mesh even when ids all match', () => {
        const report = detectLeaks(base({
            expectedIds: new Set(['wall_B1']),
            sceneObjects: [
                { userData: { elementId: 'wall_B1', elementType: 'wall' } },
                { name: 'FloorPlanUnderlay_1', userData: {} },
            ],
        }));
        expect(report!.findings.map(f => f.surface)).toContain('scene.underlay');
    });

    it('FLAGS a surviving window singleton', () => {
        const report = detectLeaks(base({
            expectedIds: new Set(['wall_B1']),
            globals: ['window.floorPlanUnderlayTool is non-null'],
        }));
        expect(report!.findings.map(f => f.surface)).toContain('window.globals');
    });
});

describe('detectLeaks — unknown expectation degrades safely', () => {
    it('does NOT flag store/element ids when expectedIds is null, but still flags junk', () => {
        const report = detectLeaks(base({
            expectedIds: null, // loader bypassed → expectation unknown
            storeElements: [{ store: 'wallStore', ids: ['wall_A1'] }],
            sceneObjects: [{ userData: { isIfcGroup: true } }],
        }));
        const surf = report!.findings.map(f => f.surface);
        expect(surf).toContain('scene.ifc');            // always-junk still fires
        expect(surf).not.toContain('store.foreignElement'); // id checks suppressed
        expect(surf).not.toContain('scene.foreignElement');
    });
});

// ── §C13-SCENE-ID-KEY ────────────────────────────────────────────────────────
//
// C13 §3.10/§3.11, variant five of the L-676 → L-694 → L-711 → L-713 family: the
// scene tripwire read a userData key the SCENE DOES NOT USE.
//
// EVERY fixture in this block is copied verbatim from the builder cited above it,
// with the file:line it came from. That citation is the point of the block: the
// pre-existing tests all plant `{ elementId, elementType }`, a shape produced by
// exactly one builder (StairMeshBuilder) and by no other, so they proved only that
// the detector agrees with itself. If a builder is renamed or re-keyed, these
// fixtures must be updated with it — and the update is the moment someone re-reads
// whether the audit can still see that family.
describe('detectLeaks — the userData shape production builders ACTUALLY stamp', () => {
    it('FLAGS a foreign WALL root (WallFragmentBuilder.ts:822 — `id`, not `elementId`)', () => {
        const report = detectLeaks(base({
            expectedIds: new Set(['wall_B1']),
            sceneObjects: [
                { userData: { id: 'wall_A9', elementType: 'wall', type: 'wall', selectable: true } },
            ],
        }));
        expect(report).not.toBeNull();
        const finding = report!.findings.find(f => f.surface === 'scene.foreignElement');
        expect(finding).toBeDefined();
        expect(finding!.details).toEqual(['wall_A9']);
    });

    it('FLAGS a foreign SLAB root (SlabFragmentBuilder.ts:398)', () => {
        const report = detectLeaks(base({
            expectedIds: new Set<string>(),
            sceneObjects: [
                { userData: { id: 'slab_A2', type: 'slab', elementType: 'Slab', modelId: 'model-default', selectable: true } },
            ],
        }));
        expect(report!.findings.map(f => f.surface)).toContain('scene.foreignElement');
    });

    it('FLAGS a foreign ROOM-BOUNDING-LINE root (RoomBoundingLineBuilder.ts:87 — `type` only, no `elementType`)', () => {
        const report = detectLeaks(base({
            expectedIds: new Set<string>(),
            sceneObjects: [
                { userData: { id: 'rbl_A3', type: 'roomBoundingLine', levelId: 'L0', version: 1 } },
            ],
        }));
        expect(report!.findings.map(f => f.surface)).toContain('scene.foreignElement');
    });

    it('counts a wall ONCE even though its root and every part mesh repeat the id', () => {
        const report = detectLeaks(base({
            expectedIds: new Set<string>(),
            sceneObjects: [
                { userData: { id: 'wall_A9', elementType: 'wall', type: 'wall', selectable: true } },   // root  :822
                { userData: { id: 'wall_A9', parentId: 'wall_A9', elementType: 'WallPart', role: 'geometry' } },  // :1693
                { userData: { id: 'wall_A9', wallId: 'wall_A9', parentId: 'wall_A9', elementType: 'WallLayer' } }, // :1423
                { userData: { role: 'hit-proxy' } },                                                    // :1098
            ],
        }));
        expect(report!.findings.find(f => f.surface === 'scene.foreignElement')!.count).toBe(1);
    });

    it('stays CLEAN when the wall IS in the expected set (no false positive)', () => {
        const report = detectLeaks(base({
            expectedIds: new Set(['wall_B1']),
            sceneObjects: [
                { userData: { id: 'wall_B1', elementType: 'wall', type: 'wall', selectable: true } },
                { userData: { id: 'wall_B1', parentId: 'wall_B1', elementType: 'WallPart' } },
            ],
        }));
        expect(report).toBeNull();
    });
});

describe('detectLeaks — DECLARED scene exemptions (zero false positives)', () => {
    it('does NOT flag the always-on ProjectOrigin datum (ProjectOriginMarker.ts:82)', () => {
        const report = detectLeaks(base({
            expectedIds: new Set<string>(),   // brand-new empty project
            sceneObjects: [
                {
                    userData: {
                        id: 'project-origin', type: 'project-origin', category: 'project-origin',
                        isProjectOrigin: true, selectable: false, pickable: false,
                    },
                },
            ],
        }));
        expect(report).toBeNull();
    });

    it('does NOT flag a transient tool-preview ghost (StairMeshBuilder.ts:308)', () => {
        const report = detectLeaks(base({
            expectedIds: new Set<string>(),
            sceneObjects: [{ name: 'stair-preview-group', userData: { isPreview: true, id: 'stair_tmp', type: 'stair' } }],
        }));
        expect(report).toBeNull();
    });

    it('does NOT flag a LEVEL line whose level IS in the expected set (LevelVisualizer.ts:241)', () => {
        // Levels are NOT exempt — they are serialized project state, so the fix is
        // that ProjectLoader now publishes `snapshot.levels` into the expectation.
        const report = detectLeaks(base({
            expectedIds: new Set(['L0']),
            sceneObjects: [{ userData: { elementType: 'LevelLine', id: 'L0' } }],
        }));
        expect(report).toBeNull();
    });

    it('DOES flag a level line from a FOREIGN project (proves the exemption is not a blanket)', () => {
        const report = detectLeaks(base({
            expectedIds: new Set(['L0']),
            sceneObjects: [{ userData: { elementType: 'LevelLine', id: 'L-10-1777891581763-10' } }],
        }));
        expect(report!.findings.map(f => f.surface)).toContain('scene.foreignElement');
    });
});
