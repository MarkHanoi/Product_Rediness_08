// §FIX-WEBGPU-MRT-LAZY-ATTACHMENT (L-1510) — a pass may never acquire a colour attachment
// that its MRT declaration does not name.
//
// THE FOUNDER'S REPORT: "I clicked SSGi and TRAA and the scene collapsed", with the console
// flooding
//
//   [RenderPipelineManager] uncaptured WebGPU error: Attachment state of
//   [RenderPipeline "renderPipeline_MeshStandardMaterial_681"] is not compatible with
//   [RenderPassEncoder].
//   [RenderPassEncoder] expects { colorTargets: [0,1,2,3 = RGBA16Float], … }
//   [RenderPipeline ...]     has { colorTargets: [0 = RGBA16Float],       … }
//
// THE MECHANISM, and it is in three, not in us. `PassNode.getTexture(name)` is NOT a read
// (`three/src/nodes/display/PassNode.js:564-583`): for a name that is not already in
// `_textures` it CLONES `renderTarget.texture` and does `renderTarget.textures.push(texture)`.
// `getTextureNode(name)` funnels into it via `PassMultipleTextureNode.updateTexture()`. So
// merely ASKING a single-target pass for `normal` / `diffuseColor` / `velocity` grows its
// colour-attachment count. `setMRT()` — the separate call that makes materials EMIT those
// fragment outputs — was never made, because `_buildPipeline` had correctly built the cheap
// 1-target pass (§FIX-WEBGPU-INVALID-PIPELINE-MRT / L-253: SSGI and TRAA are off by default).
//
// Result: a 4-attachment render pass driven by 1-output shaders. Every submit rejected.
// `output`, `diffuseColor` and `normal` in the ScenePass MRT are HalfFloat/UnsignedByte/
// UnsignedByte — so "all four RGBA16Float" in the founder's console is itself the proof that
// three CLONED `output` three times rather than ScenePass declaring anything.
//
// THE ASSERTION WITH TEETH is NOT "textures.length === 4". A pass legitimately reaches four
// attachments once its MRT declares four. The invariant is the WebGPU validity condition
// itself:
//
//   EVERY texture in `renderTarget.textures` must be a name the MRT node DECLARES
//   (or the single `output` when there is no MRT at all).
//
// On the pre-fix code `activateSSGI()` leaves four attachments and `getMRT() === null`, so
// three of them are undeclared and `undeclaredAttachments()` below returns
// ['normal', 'diffuseColor', 'velocity']. That is the RED.
//
// These tests use the REAL `three/tsl` — real `PassNode`, real `SSGINode`, real `TRAANode`,
// real clone-and-push. A hand-written pass fake would be built from the same belief the test
// exists to check, and could not falsify it.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import * as TSL from 'three/tsl';
import { RenderPipelineManager } from '../src/pipeline/RenderPipelineManager.js';
import { createScenePass } from '../src/pipeline/ScenePass.js';
import { createZonePass } from '../src/pipeline/ZonePass.js';

// `RenderPipeline` is the only thing in the phase-2/3 build that wants a live GPU adapter.
vi.mock('three/webgpu', () => ({
    RenderPipeline: class {
        outputNode: unknown = null;
        constructor(_renderer: unknown) { /* no-op */ }
        render(): void { /* no-op */ }
        dispose(): void { /* no-op */ }
    },
}));

type AnyPass = {
    renderTarget: { textures: Array<{ name: string; type: number }> };
    getMRT(): { outputNodes: Record<string, unknown> } | null;
};

/**
 * The names on the render target that NOTHING declares — i.e. colour attachments with no
 * corresponding fragment-stage output. This is the exact condition WebGPU rejects.
 */
function undeclaredAttachments(pass: unknown): string[] {
    const p = pass as AnyPass;
    const mrtNode = p.getMRT();
    const declared = mrtNode ? Object.keys(mrtNode.outputNodes) : ['output'];
    return p.renderTarget.textures
        .map(t => t.name)
        .filter(name => !declared.includes(name));
}

type AnyRpm = Record<string, any>;

/** Put the manager in the state the founder's session was in when he clicked SSGI:
 *  WebGPU live, TSL loaded, and the CHEAP single-target scene pass built (SSGI/TRAA off). */
function primeWithCheapScenePass(rpm: RenderPipelineManager): AnyRpm {
    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const anyRpm = rpm as unknown as AnyRpm;
    anyRpm._webGpuActive = true;
    // `_tslLoaded` is a GETTER over `globalThis.__PRYZM_TSL__`, set in beforeEach.
    anyRpm._scene        = scene;
    anyRpm._camera       = camera;
    anyRpm._renderer     = {};                       // _currentBackendDevice() → null
    anyRpm._backgroundUniform = null;                // graph falls back to vec4(0,0,0,1)
    anyRpm._scenePass    = createScenePass(scene, camera, false); // the L-253 cheap pass
    anyRpm._scenePassHasGBuffer = false;
    anyRpm._zonePass     = createZonePass(scene, camera);
    return anyRpm;
}

beforeEach(() => {
    (globalThis as any).__PRYZM_TSL__ = TSL;
});

afterEach(() => {
    delete (globalThis as any).__PRYZM_TSL__;
    vi.restoreAllMocks();
});

describe('§FIX-WEBGPU-MRT-LAZY-ATTACHMENT (L-1510) — the three r183 mechanism', () => {
    it('getTextureNode() on an UNDECLARED name MUTATES the render target (this is the defect)', () => {
        const scene  = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera();
        const cheap  = createScenePass(scene, camera, false) as unknown as AnyPass;

        expect(cheap.getMRT()).toBeNull();
        expect(cheap.renderTarget.textures.length).toBe(1);

        // The read that founders think is a read.
        (cheap as any).getTextureNode('normal');

        expect(cheap.renderTarget.textures.length).toBe(2);
        expect(undeclaredAttachments(cheap)).toEqual(['normal']);
        // …and the clone carries `output`'s HalfFloat type — the founder's "all four
        // RGBA16Float", which ScenePass's own UnsignedByteType downgrade could never produce.
        expect(cheap.renderTarget.textures[1]!.type).toBe(THREE.HalfFloatType);
        expect(cheap.renderTarget.textures[1]!.type).toBe(cheap.renderTarget.textures[0]!.type);
    });

    it('`depth` is pre-registered and does NOT grow the colour attachments', () => {
        const scene  = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera();
        const cheap  = createScenePass(scene, camera, false) as unknown as AnyPass;
        (cheap as any).getTextureNode('depth');
        (cheap as any).getTextureNode('output');
        expect(cheap.renderTarget.textures.length).toBe(1);
        expect(undeclaredAttachments(cheap)).toEqual([]);
    });

    it('a pass built WITH its G-buffer declares every attachment it grows', () => {
        const scene  = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera();
        const full   = createScenePass(scene, camera, true) as unknown as AnyPass;

        expect(full.getMRT()).not.toBeNull();
        (full as any).getTextureNode('diffuseColor');
        (full as any).getTextureNode('normal');
        (full as any).getTextureNode('velocity');
        expect(full.renderTarget.textures.length).toBe(4);
        expect(undeclaredAttachments(full)).toEqual([]);
    });
});

describe('§FIX-WEBGPU-MRT-LAZY-ATTACHMENT (L-1510) — the founder\'s click', () => {
    it('activateSSGI() on a cheap scene pass leaves NO undeclared attachment', async () => {
        const rpm    = new RenderPipelineManager();
        const anyRpm = primeWithCheapScenePass(rpm);

        await rpm.activateSSGI();

        // RED before the fix: the pass is still the cheap one, getMRT() is null, and it now
        // carries normal + diffuseColor + velocity — the founder's four RGBA16Float targets.
        expect(undeclaredAttachments(anyRpm._scenePass)).toEqual([]);
        expect((anyRpm._scenePass as AnyPass).getMRT()).not.toBeNull();
        expect(anyRpm._scenePassHasGBuffer).toBe(true);
        expect(rpm.status.ssgiActive).toBe(true);
    });

    it('activateTRAA() reaches the same hole through `velocity` — and is closed too', async () => {
        const rpm    = new RenderPipelineManager();
        const anyRpm = primeWithCheapScenePass(rpm);

        await rpm.activateTRAA();

        expect(undeclaredAttachments(anyRpm._scenePass)).toEqual([]);
        expect(anyRpm._scenePassHasGBuffer).toBe(true);
        expect(rpm.status.traaActive).toBe(true);
    });

    it('SSGI then TRAA — the founder\'s exact sequence — stays clean', async () => {
        const rpm    = new RenderPipelineManager();
        const anyRpm = primeWithCheapScenePass(rpm);

        await rpm.activateSSGI();
        await rpm.activateTRAA();

        expect(undeclaredAttachments(anyRpm._scenePass)).toEqual([]);
        expect((anyRpm._scenePass as AnyPass).getMRT()).not.toBeNull();
        expect(rpm.status.ssgiActive).toBe(true);
        expect(rpm.status.traaActive).toBe(true);
    });

    it('the SSGI nodes composited are the ones derived from the LIVE pass, not a discarded one',
        async () => {
            const rpm    = new RenderPipelineManager();
            const anyRpm = primeWithCheapScenePass(rpm);

            await rpm.activateSSGI();
            const passAfterSsgi = anyRpm._scenePass;
            expect(anyRpm._cachedAo).not.toBeNull();
            expect(anyRpm._cachedGi).not.toBeNull();

            // A TRAA toggle must not strand the AO/GI nodes on a replaced pass.
            await rpm.activateTRAA();
            expect(anyRpm._scenePass).toBe(passAfterSsgi); // already G-buffered → no rebuild
            expect(anyRpm._cachedAo).not.toBeNull();
            expect(anyRpm._cachedGi).not.toBeNull();
        });
});

describe('§SCENEPASS-IDENTITY-CHOKEPOINT (L-1511) — derived nodes die with their pass', () => {
    it('rebuilding the scene pass drops the AO/GI nodes bound to the old render target',
        async () => {
            const rpm    = new RenderPipelineManager();
            const anyRpm = primeWithCheapScenePass(rpm);

            await rpm.activateSSGI();
            const firstPass = anyRpm._scenePass;
            expect(anyRpm._cachedAo).not.toBeNull();

            // This is what `recoverPipeline → bind() → _buildPipeline()` does after a device
            // loss. Before L-1511 the cached nodes survived it, and `activateSSGI()`'s
            // idempotency guard (`_ssgiActive && _cachedAo && _cachedGi && !params`) then
            // returned WITHOUT rebuilding — SSGI composited a dead render target for the rest
            // of the session.
            await anyRpm._buildPipeline();

            expect(anyRpm._scenePass).not.toBe(firstPass);
            expect(anyRpm._cachedAo).toBeNull();
            expect(anyRpm._cachedGi).toBeNull();
            expect(undeclaredAttachments(anyRpm._scenePass)).toEqual([]);

            // …and because the guard now reads TRUE state, recovery genuinely re-derives.
            await rpm.activateSSGI();
            expect(anyRpm._cachedAo).not.toBeNull();
            expect(undeclaredAttachments(anyRpm._scenePass)).toEqual([]);
        });

    it('activateSSGI(params) survives a rebuild — the params are re-applied, not defaulted',
        async () => {
            const rpm    = new RenderPipelineManager();
            const anyRpm = primeWithCheapScenePass(rpm);

            await rpm.activateSSGI({ radius: 3.25 });
            expect(anyRpm._ssgiParams).toEqual({ radius: 3.25 });

            await anyRpm._fullRebuild();
            expect(anyRpm._ssgiParams).toEqual({ radius: 3.25 });
            expect(undeclaredAttachments(anyRpm._scenePass)).toEqual([]);

            await rpm.deactivateSSGI();
            expect(anyRpm._ssgiParams).toBeUndefined();
        });
});
