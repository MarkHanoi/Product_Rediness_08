// C58 §1.14 / STRUCTURAL-SEAM-1 (lane E2a, 2026-09-01) — `ParcelBoundarySceneRenderer` RASTERISES
// THE SEAM. This suite pins the adoption the REPORT §M / §O REFACTOR row named as unfinished: the
// BIM/plan three.js surface was the LAST 4-field projection — it re-derived ONE prism
// (`insetPolygon × maxHeight_m`, or an invented 9 m fallback) and discarded `tiers[]`,
// `farLimitedHeight_m` and the slab rule. Each `it` below is RED against that pre-adoption
// renderer (falsification transcripts in audit/europe-site-intel/2026-08-31/impl/):
//
//   1. FAR-limited  → a translucent legal SHELL + an opaque FAR solid INSIDE it (§L-616),
//                     never one full-height prism claiming the whole shell as buildable.
//   2. TIERED       → one solid per tier (§1.7b.4), never one prism at the principal height
//                     over the whole ring.
//   3. NULL HEIGHT  → a 0.5 m footprint SLAB (§1.12.6), never an invented 9 m prism.
//
// Proof style: real `THREE.Shape`/`ExtrudeGeometry`/materials on the scene graph (no GPU), the
// same style `contextStudyMassingRender.test.ts` uses for this exact file. No pixels are
// rasterised — that limit is stated, not glossed over.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import type { BuildableEnvelope } from '@pryzm/schemas';
import {
    FOOTPRINT_ONLY_HEIGHT_M,
    SHELL_FILL_ALPHA,
    SOLID_FILL_ALPHA,
} from '@pryzm/site-parcel-data';

let mockEnvelope: BuildableEnvelope | null = null;
vi.mock('../src/ui/site/siteDispatch.js', () => ({
    getLastBuildableEnvelope: () => mockEnvelope,
    isLastEnvelopeSuggestedPreview: () => false,
}));

import { ParcelBoundarySceneRenderer } from '../src/ui/site/ParcelBoundarySceneRenderer';
import {
    resetContextDerivedStudyEnvelopeState,
    __resetContextDerivedStudyEnvelopeListenersForTests,
} from '../src/ui/site/contextDerivedStudyEnvelopeState';
import { __resetBuildableEnvelopeVisibilityForTests } from '../src/ui/site/envelopeVisibility';

const SITE_ID = 'site-e2a-seam1';
const RING = [
    { x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 10 }, { x: 0, z: 10 },
];
const BAND = [
    { x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 6 }, { x: 0, z: 6 },
];
const INTERIOR = [
    { x: 0, z: 6 }, { x: 20, z: 6 }, { x: 20, z: 10 }, { x: 0, z: 10 },
];

function fakeRuntime(): PryzmRuntime {
    return {
        events: { on: () => () => {} },
        siteModelStore: {
            getParcelBoundary: () => ({ polygon: RING, edgeClassifications: undefined }),
            subscribe: () => () => {},
            getSite: () => ({ id: SITE_ID }),
        },
    } as unknown as PryzmRuntime;
}

function findByName(root: THREE.Object3D, name: string): THREE.Object3D | null {
    let found: THREE.Object3D | null = null;
    root.traverse((o) => { if (o.name === name) found = o; });
    return found;
}

/** All meshes under the plan-backed envelope group. */
function envelopeMeshes(scene: THREE.Scene): THREE.Mesh[] {
    const group = findByName(scene, 'pryzm-buildable-envelope-volume');
    if (!group) return [];
    const meshes: THREE.Mesh[] = [];
    group.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
    return meshes;
}

/** Top of a mesh's extrusion in scene Y (metres; includes the 0.02 m ground lift). */
function topY(mesh: THREE.Mesh): number {
    mesh.geometry.computeBoundingBox();
    return mesh.geometry.boundingBox!.max.y;
}

function opacityOf(mesh: THREE.Mesh): number {
    const m = mesh.material;
    const mat = Array.isArray(m) ? (m[m.length - 1] as THREE.MeshBasicMaterial) : (m as THREE.MeshBasicMaterial);
    return mat.opacity;
}

describe('C58 §1.14 — ParcelBoundarySceneRenderer rasterises envelopeToMassing (Seam-1 adopted)', () => {
    let scene: THREE.Scene;
    let renderer: ParcelBoundarySceneRenderer;

    beforeEach(() => {
        mockEnvelope = null;
        resetContextDerivedStudyEnvelopeState();
        __resetContextDerivedStudyEnvelopeListenersForTests();
        __resetBuildableEnvelopeVisibilityForTests();
        scene = new THREE.Scene();
        renderer = new ParcelBoundarySceneRenderer(scene, fakeRuntime());
    });

    afterEach(() => {
        renderer.dispose();
    });

    it('§L-616 — a FAR-limited envelope draws a SHELL + a FAR solid, and the solid stops at the FAR height', () => {
        mockEnvelope = {
            status: 'ok',
            insetPolygon: RING,
            insetAreaM2: 200,
            maxHeight_m: 20,
            farLimitedHeight_m: 8,
            confidence: 'structured',
            tiers: [],
        } as unknown as BuildableEnvelope;
        renderer.refresh();

        const meshes = envelopeMeshes(scene);
        // PRE-ADOPTION RED: one full-height prism, no shell/far split at all.
        const shell = meshes.find((m) => m.name === 'pryzm-forma-envelope-height-shell');
        const far = meshes.find((m) => m.name === 'pryzm-forma-envelope-far-massing');
        expect(shell, 'the translucent legal-ceiling shell must be drawn').toBeDefined();
        expect(far, 'the opaque FAR solid must be drawn inside the shell').toBeDefined();
        // The shell is the outer legal bound (20 m); the volume CLAIM stops at the FAR height (8 m).
        expect(topY(shell!)).toBeCloseTo(20 + 0.02, 3);
        expect(topY(far!)).toBeCloseTo(8 + 0.02, 3);
        // Fill weights are the SEAM's one knob set, not per-surface literals.
        expect(opacityOf(shell!)).toBeCloseTo(SHELL_FILL_ALPHA, 6);
        expect(opacityOf(far!)).toBeCloseTo(SOLID_FILL_ALPHA, 6);
        expect((shell!.userData as { massingSolidRole?: string }).massingSolidRole).toBe('height-shell');
    });

    it('§1.7b.4 — a TIERED envelope draws one solid per tier, never one prism', () => {
        mockEnvelope = {
            status: 'ok',
            insetPolygon: BAND,
            insetAreaM2: 120,
            maxHeight_m: 17,
            confidence: 'block-constructed',
            tiers: [
                {
                    id: 'block-band', label: 'band', polygon: BAND, areaM2: 120,
                    baseHeight_m: 0, maxHeight_m: 17, maxFloors: null, ordinanceRef: null,
                },
                {
                    id: 'block-interior', label: 'interior', polygon: INTERIOR, areaM2: 80,
                    baseHeight_m: 0, maxHeight_m: 5, maxFloors: null, ordinanceRef: null,
                },
            ],
        } as unknown as BuildableEnvelope;
        renderer.refresh();

        const meshes = envelopeMeshes(scene);
        // PRE-ADOPTION RED: exactly one prism at 17 m over the whole inset ring.
        expect(meshes.length, 'a two-tier envelope is never one prism').toBe(2);
        const band = meshes.find((m) => m.name === 'pryzm-forma-envelope-tier-block-band');
        const interior = meshes.find((m) => m.name === 'pryzm-forma-envelope-tier-block-interior');
        expect(band).toBeDefined();
        expect(interior).toBeDefined();
        expect(topY(band!)).toBeCloseTo(17 + 0.02, 3);
        expect(topY(interior!)).toBeCloseTo(5 + 0.02, 3);
    });

    it('§1.12.6 — a NULL-height envelope draws the 0.5 m footprint slab, never an invented prism', () => {
        mockEnvelope = {
            status: 'ok',
            insetPolygon: RING,
            insetAreaM2: 200,
            maxHeight_m: null,
            confidence: 'structured',
            tiers: [],
        } as unknown as BuildableEnvelope;
        renderer.refresh();

        const meshes = envelopeMeshes(scene);
        // PRE-ADOPTION RED: a 9 m ENVELOPE_FALLBACK_HEIGHT_M prism — a height nobody published.
        expect(meshes).toHaveLength(1);
        expect(topY(meshes[0]!)).toBeCloseTo(FOOTPRINT_ONLY_HEIGHT_M + 0.02, 3);
        expect((meshes[0]!.userData as { massingSolidRole?: string }).massingSolidRole).toBe('footprint-slab');
    });
});
