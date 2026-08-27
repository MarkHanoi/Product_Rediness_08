// §ENV3D164 (L-12700) — the founder types "24.5 m" on the parcel card (§MANUALENV159, shipped
// live in 56f7f393) and gets a study massing FOLD, but no 3-D volume was ever drawn for it. This
// suite pins the ADAPTER that routes `ContextDerivedStudyEnvelope` (the card's data) into
// `ParcelBoundarySceneRenderer` (the EXISTING three.js volume renderer that already draws the
// plan-backed `BuildableEnvelope` — C84 EI-9: one renderer, two input sources, not a second one).
//
// WHAT IS MEASURED HERE, and how:
//   1. A saved study (no plan-backed envelope) draws a TEAL, OPEN-TOP volume with a DASHED rim —
//      never the plan-backed envelope's violet/grey closed prism with a solid outline. Real
//      `THREE.Shape` / `ExtrudeGeometry` / materials are constructed (no GPU needed for this), so
//      the geometry + material claims are PROVEN, not asserted from reading the source.
//   2. MUTUAL EXCLUSIVITY: when a real, `ok` `BuildableEnvelope` is ALSO cached, the study volume
//      is never drawn alongside it (the schema's own scope: a study is offered only where no
//      normative envelope resolves at all).
//   3. The reused Volume/Footprint toggles (`envelopeVisibility.ts`) gate the study exactly as
//      they gate a real envelope — 'volume' / 'ground-shade' / 'none' — no third, study-only
//      control.
//   4. TEARDOWN: a study computed for one site does not survive `resetContextDerivedStudyEnvelopeState()`
//      (the same reset `GISAreaLayout.ts`'s project-switch path already calls) — proof the C13 §4
//      leak class §MANUALENV159 just closed for the CARD cannot reopen for the new 3-D path.
//
// NOT MEASURED (named, not glossed over): this environment has no WebGL/WebGPU context, so no
// pixel was ever rasterised — the assertions below are on the THREE.js SCENE GRAPH (mesh names,
// material colours/opacities/flags, group membership) that a real renderer consumes, which is the
// same proof style `parcelShadeIsNotMirrored.test.ts` already uses for this exact file.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import type { ContextDerivedStudyEnvelopeResult } from '@pryzm/site-parcel-data';
import type { BuildableEnvelope } from '@pryzm/schemas';

// ── Controllable stand-in for the plan-backed envelope cache (siteDispatch.ts) ──────────────────
// `ParcelBoundarySceneRenderer` imports ONLY these two names from that (512 KB) module; replacing
// it wholesale for this test file is safe because nothing else in the render path this suite
// exercises imports anything else from it.
let mockEnvelope: BuildableEnvelope | null = null;
vi.mock('../src/ui/site/siteDispatch.js', () => ({
    getLastBuildableEnvelope: () => mockEnvelope,
    isLastEnvelopeSuggestedPreview: () => false,
}));

import { ParcelBoundarySceneRenderer } from '../src/ui/site/ParcelBoundarySceneRenderer';
import {
    setContextDerivedStudyEnvelope,
    resetContextDerivedStudyEnvelopeState,
    __resetContextDerivedStudyEnvelopeListenersForTests,
} from '../src/ui/site/contextDerivedStudyEnvelopeState';
import {
    setBuildableEnvelopeVisible,
    setBuildableEnvelopeFootprintVisible,
    __resetBuildableEnvelopeVisibilityForTests,
} from '../src/ui/site/envelopeVisibility';

const SITE_ID = 'site-env3d164';
const PARCEL_RING = [
    { x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 8 }, { x: 0, z: 8 },
];

/** A minimal fake `PryzmRuntime` — just enough surface for this renderer's constructor + reads. */
function fakeRuntime(): PryzmRuntime {
    return {
        events: { on: () => () => {} },
        siteModelStore: {
            getParcelBoundary: () => ({ polygon: PARCEL_RING, edgeClassifications: undefined }),
            subscribe: () => () => {},
            getSite: () => ({ id: SITE_ID }),
        },
    } as unknown as PryzmRuntime;
}

function okStudyResult(heightM: number): ContextDerivedStudyEnvelopeResult {
    return {
        ok: true,
        study: {
            status: 'context-derived-study',
            footprintPolygon: PARCEL_RING,
            footprintAreaM2: 80,
            setback_m: 0,
            maxHeight_m: heightM,
            heightBasis: {
                method: 'median-neighbour-height',
                sourceLabel: 'test fixture',
                sampledCount: 4,
                excludedAssumedCount: 0,
                radius_m: 50,
                medianHeight_m: heightM,
                minHeight_m: heightM,
                maxHeight_m: heightM,
                sampledAtIso: '2026-08-27T00:00:00.000Z',
            },
            disclaimer: 'INDICATIVE ONLY — test fixture.',
        },
    } as ContextDerivedStudyEnvelopeResult;
}

function okEnvelope(): BuildableEnvelope {
    return {
        status: 'ok',
        insetPolygon: PARCEL_RING,
        insetAreaM2: 80,
        maxHeight_m: 15,
        confidence: 'authoritative',
    } as unknown as BuildableEnvelope;
}

/** Find a named object anywhere under `root`, or null. */
function findByName(root: THREE.Object3D, name: string): THREE.Object3D | null {
    let found: THREE.Object3D | null = null;
    root.traverse((o) => { if (o.name === name) found = o; });
    return found;
}

describe('§ENV3D164 — ParcelBoundarySceneRenderer draws the STUDY massing (card → 3-D adapter)', () => {
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

    it('draws NOTHING for the envelope/study slot when neither exists', () => {
        expect(findByName(scene, 'pryzm-buildable-envelope-volume')).toBeNull();
        expect(findByName(scene, 'pryzm-context-study-massing-volume')).toBeNull();
    });

    it('draws the study volume — teal, open-top, dashed rim — once a study is saved for this site', () => {
        setContextDerivedStudyEnvelope(SITE_ID, okStudyResult(12.3));
        renderer.refresh();

        const group = findByName(scene, 'pryzm-context-study-massing');
        expect(group).not.toBeNull();

        const mesh = findByName(scene, 'pryzm-context-study-massing-volume') as THREE.Mesh | null;
        expect(mesh).not.toBeNull();
        expect(mesh!.userData.isContextStudyMassingVolume).toBe(true);
        expect(mesh!.userData.contextStudyHeightBasisMethod).toBe('median-neighbour-height');
        // Open-top: TWO materials (transparent cap + visible side), never the closed single-material
        // prism a plan-backed envelope without an open-top posture would get.
        expect(Array.isArray(mesh!.material)).toBe(true);
        const mats = mesh!.material as THREE.MeshBasicMaterial[];
        expect(mats).toHaveLength(2);
        expect(mats[0]!.opacity).toBe(0); // the cap — invisible, i.e. genuinely open
        expect(mats[1]!.color.getHex()).toBe(0x00a99a); // teal — NOT the plan-backed violet/grey
        expect(mats[1]!.color.getHex()).not.toBe(0x6600ff);
        expect(mats[1]!.color.getHex()).not.toBe(0x9a93b0);

        const rim = findByName(scene, 'pryzm-context-study-massing-rim') as THREE.Line | null;
        expect(rim).not.toBeNull();
        expect(rim!.material).toBeInstanceOf(THREE.LineDashedMaterial);
        // computeLineDistances() must have run or THREE draws the dashed line solid.
        expect(rim!.geometry.attributes.lineDistance).toBeDefined();

        // Never simultaneously the plan-backed envelope's own mesh name.
        expect(findByName(scene, 'pryzm-buildable-envelope-volume')).toBeNull();
    });

    it('MUTUAL EXCLUSIVITY — a real plan-backed envelope wins; the study does not also draw', () => {
        setContextDerivedStudyEnvelope(SITE_ID, okStudyResult(12.3));
        mockEnvelope = okEnvelope();
        renderer.refresh();

        expect(findByName(scene, 'pryzm-buildable-envelope-volume')).not.toBeNull();
        expect(findByName(scene, 'pryzm-context-study-massing')).toBeNull();
    });

    it('reuses the Volume/Footprint toggles — footprint-only shows a study ground shade, never a third control', () => {
        setContextDerivedStudyEnvelope(SITE_ID, okStudyResult(12.3));
        setBuildableEnvelopeVisible(false); // "Volume: OFF"
        setBuildableEnvelopeFootprintVisible(true); // "Footprint: ON" (the default)

        const mesh = findByName(scene, 'pryzm-context-study-massing-ground-shade') as THREE.Mesh | null;
        expect(mesh).not.toBeNull();
        expect(mesh!.userData.contextStudyGroundShade).toBe(true);
        // A flat shade has no top to leave open — single material, not the two-slot open-top array.
        expect(Array.isArray(mesh!.material)).toBe(false);
    });

    it('both toggles off draws nothing for the study either (no third control, same authority)', () => {
        setContextDerivedStudyEnvelope(SITE_ID, okStudyResult(12.3));
        setBuildableEnvelopeVisible(false);
        setBuildableEnvelopeFootprintVisible(false);

        expect(findByName(scene, 'pryzm-context-study-massing')).toBeNull();
    });

    it('TEARDOWN — resetContextDerivedStudyEnvelopeState() (the C13 project-switch reset) clears the volume', () => {
        setContextDerivedStudyEnvelope(SITE_ID, okStudyResult(12.3));
        renderer.refresh();
        expect(findByName(scene, 'pryzm-context-study-massing-volume')).not.toBeNull();

        resetContextDerivedStudyEnvelopeState();

        expect(findByName(scene, 'pryzm-context-study-massing-volume')).toBeNull();
    });

    it('a REFUSED study (ok: false) draws no geometry — the refusal is words on the card, not a shape', () => {
        setContextDerivedStudyEnvelope(SITE_ID, {
            ok: false,
            reason: 'insufficient-neighbour-sample',
            realSampleCount: 1,
            excludedAssumedCount: 0,
        });
        renderer.refresh();

        expect(findByName(scene, 'pryzm-context-study-massing')).toBeNull();
    });
});
