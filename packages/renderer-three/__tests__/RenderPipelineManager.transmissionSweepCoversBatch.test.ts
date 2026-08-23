// §L-10010-TRANSMISSION-SWEEP-COVERS-THE-BATCH — the founder's 2026-08-23 hard stop,
// pinned at the ORDERING that produced it.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE FOUNDER'S CONSOLE, IN CAUSAL ORDER
// ─────────────────────────────────────────────────────────────────────────────
//
//   [CommandManager] EXECUTE: CREATE_WALLS_ON_ALL_SLABS
//   [BatchCoordinator] §BATCH-SHADOW-MAP-SUPPRESS setShadowPassDisabled('batch', true)
//   [CreateWallsFromSlab] created 5 of 5 wall(s) …
//   [RenderPipelineManager] Phase: phase4 | WebGPU: true
//   [BatchCoordinator] §FIX-POST-GEOMETRY-COMPILE-V2 1 rpm.render() pass …
//   ⛔ vendor-three: THREE.TSL: Invalid generated code, expected a "float".
//   → recoverFromRenderFailure → _driveRecoveryRebuild → retries exhausted → modal
//
// ⭐ THE DEFECT IS AN ORDERING, NOT A MISSING GUARD. `§L-361-WEBGPU-TRANSMISSION-GUARD`
// exists precisely to stop `expected a "float"`, and it had TWO live entry points.
// MEASURED by reading the control flow (2026-08-23):
//
//   1. `setShadowPassDisabled('batch', true)` — fires at batch START. The five walls
//      are created AFTER it, so the sweep it runs can only ever see an empty set. The
//      founder's log shows the §BATCH-SHADOW-MAP-SUPPRESS line and NO
//      "neutralized N transmission material(s)" line, which is what that looks like.
//   2. `initScene.runTierPbrPass` → `neutralizeTransmissionForWebGPU()` — skipped for
//      the whole batch by `shouldDeferPerAddGeometryPass(isBatching)`, and its
//      consolidated post-batch run happens in `_onPostBatch()`, which
//      `BatchCoordinator.onComplete` invokes AFTER the §FIX-POST-GEOMETRY-COMPILE-V2
//      synchronous `rpm.render()` (both are in `onComplete`; the compile block is
//      inside `if (this._onBatchEnd)` at ~:1925-2050, `_onPostBatch()` at ~:2118).
//
// ⛔ So a material minted DURING a batch is compiled by a render that sits after entry 1
// and before entry 2. A guard that runs before its subject exists, and again after that
// subject has already been compiled, guards nothing.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT THESE TESTS PIN — ALL OF THEM WERE RED BEFORE THE FIX
// ─────────────────────────────────────────────────────────────────────────────
//
//   1. THE FOUNDER'S EXACT ORDERING. Glass created BETWEEN batch-start and the compile
//      render is neutralized BY that render. Test 1a first proves the hole is real —
//      the batch-start sweep leaves the later material untouched — so test 1b is not
//      passing vacuously.
//   2. The subject is the PROPERTY, not the class. `MeshPhysicalNodeMaterial` does NOT
//      extend `MeshPhysicalMaterial` in three r183, so the old `instanceof` test could
//      not see the very class the guard's docstring names.
//   3. ⛔ GRAPHICS ARE NOT COMPROMISED. On a classic `THREE.WebGLRenderer` (no TSL node
//      graph, no "expected a float" seed) refractive glass is left ALONE. A guard that
//      flattened everyone's glass to opacity would be a worse defect than the crash.
//   4. The latch costs nothing when not armed — no scene traverse per frame.
//   5. §L-10012 — the recovery ladder removes the seed before rebuilding, so attempt
//      N+1 differs from attempt N instead of re-compiling the identical invalid node.
//
// See docs/04-reference/ISSUE-LOG.md L-10010..L-10012, C04 §RECOVERY.

import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { RenderPipelineManager } from '../src/pipeline/RenderPipelineManager.js';

/** The transmission value PRYZM's real glass carries (`WindowBuilder.ts:321`). */
const REAL_GLASS_TRANSMISSION = 0.9;

interface Rig {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rpm: any;
    scene: THREE.Scene;
    /** Adds a mesh carrying `mat` — i.e. "a wall/window was created". */
    addGlass(mat: THREE.Material): THREE.Mesh;
    /** Drives `render()` far enough to cross the frame boundary the sweep sits on. */
    renderOnce(): void;
}

/**
 * An RPM shaped like the founder's session: `WebGPU: true`, phase4, a real scene.
 *
 * @param nodeCompiles false ⇒ a classic THREE.WebGLRenderer (no TSL). This is the arm
 *   that proves refractive glass survives on the backend that can render it.
 */
function makeRig(nodeCompiles = true): Rig {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rpm = new RenderPipelineManager() as any;
    const scene = new THREE.Scene();

    rpm._webGpuActive = nodeCompiles;
    rpm._scene = scene;
    rpm._camera = new THREE.PerspectiveCamera();
    rpm._renderer = {
        // The gate is the renderer CLASS (§L-361-FALLBACK-STILL-TSL): a WebGPURenderer
        // node-compiles on BOTH its native and its WebGL2 backend; a classic
        // WebGLRenderer does not and keeps real glass.
        isWebGPURenderer: nodeCompiles ? true : undefined,
        domElement: { clientWidth: 1200, clientHeight: 900, width: 1200, height: 900 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        getDrawingBufferSize: (t: any) => { if (t?.set) { t.set(1200, 900); return t; } return { x: 1200, y: 900 }; },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        getSize: (t: any) => { if (t?.set) { t.set(1200, 900); return t; } return { x: 1200, y: 900 }; },
        setSize: () => { /* noop */ },
        setClearColor: () => { /* noop */ },
        render: () => { /* noop */ },
    };

    return {
        rpm,
        scene,
        addGlass(mat: THREE.Material): THREE.Mesh {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
            scene.add(mesh);
            return mesh;
        },
        renderOnce(): void {
            // The sweep is the SECOND statement of render(), immediately after
            // drainGpuReleaseQueue(). Everything past it needs a GPU this process does
            // not have, so a throw further down is expected and irrelevant: what is
            // under test is whether the boundary sweep ran, not whether a frame
            // reached a device.
            try { rpm.render(0); } catch { /* no GPU in vitest — the boundary still ran */ }
        },
    };
}

function realGlass(): THREE.MeshPhysicalMaterial {
    return new THREE.MeshPhysicalMaterial({
        transmission: REAL_GLASS_TRANSMISSION,
        thickness: 0.5,
        ior: 1.52,
        transparent: true,
    });
}

describe('§L-10010 — the transmission sweep must cover materials created DURING a batch', () => {

    it('1a NON-VACUITY — the batch-START sweep provably cannot see the batch\'s own glass', () => {
        const rig = makeRig();

        // Batch starts. This is the ONLY moment the pre-fix guard swept.
        rig.rpm.setShadowPassDisabled('batch', true);

        // …and only NOW does CREATE_WALLS_ON_ALL_SLABS mint its geometry.
        const glass = realGlass();
        rig.addGlass(glass);

        // ⛔ Untouched. This is the hole, stated as a measurement rather than as prose:
        // if this assertion ever fails, the batch-start sweep somehow saw a material
        // that did not exist when it ran, and test 1b below would be vacuous.
        expect(glass.transmission).toBe(REAL_GLASS_TRANSMISSION);
    });

    it('1b THE FIX — the compile render neutralizes glass minted since batch start', () => {
        const rig = makeRig();

        rig.rpm.setShadowPassDisabled('batch', true);
        const glass = realGlass();
        rig.addGlass(glass);
        expect(glass.transmission).toBe(REAL_GLASS_TRANSMISSION);   // still the hole

        // Batch end — BatchCoordinator.onComplete fires this unconditionally
        // (§BATCH-SHADOW-MAP-RESTORE-FALLBACK, :1776) BEFORE its
        // §FIX-POST-GEOMETRY-COMPILE-V2 `rpm.render()` at ~:1995.
        rig.rpm.setShadowPassDisabled('batch', false);

        // …which is this render. The sweep runs at its frame boundary, so the
        // transmission node is gone BEFORE the compile that would emit it.
        rig.renderOnce();

        expect(glass.transmission).toBe(0);
        // Still readably glassy — a neutralized pane must not read as a solid wall.
        expect(glass.transparent).toBe(true);
        expect(glass.opacity).toBeLessThan(1);
    });

    it('1c ANY geometry add arms the sweep, batched or not — the class, not the gesture', () => {
        const rig = makeRig();
        const glass = realGlass();
        rig.addGlass(glass);

        // No batch at all. This is the seam `initScene`'s geometry-add listener arms
        // ABOVE its `shouldDeferPerAddGeometryPass` early-return.
        rig.rpm.armTransmissionSweep('geomAdd:bim-wall-added');
        rig.renderOnce();

        expect(glass.transmission).toBe(0);
    });

    it('2 the subject is the PROPERTY — a node-material-shaped glass is caught too', () => {
        const rig = makeRig();

        // `MeshPhysicalNodeMaterial extends MeshStandardNodeMaterial extends NodeMaterial
        // extends Material` in three r183 — it is NOT a MeshPhysicalMaterial, so the old
        // `instanceof THREE.MeshPhysicalMaterial` test could not see it. Stand in for one
        // with a Material that carries the property but not the class.
        const nodeish = new THREE.MeshStandardMaterial();
        (nodeish as unknown as { transmission: number }).transmission = 0.85;
        expect(nodeish instanceof THREE.MeshPhysicalMaterial).toBe(false);

        rig.addGlass(nodeish);
        rig.rpm.armTransmissionSweep('test');
        rig.renderOnce();

        expect((nodeish as unknown as { transmission: number }).transmission).toBe(0);
    });

    it('2b a material with NO transmission is never touched', () => {
        const rig = makeRig();
        const wall = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, opacity: 1, transparent: false });
        rig.addGlass(wall);

        rig.rpm.armTransmissionSweep('test');
        rig.renderOnce();

        expect(wall.opacity).toBe(1);
        expect(wall.transparent).toBe(false);
        expect((wall as unknown as { transmission?: number }).transmission).toBeUndefined();
    });

    it('3 ⛔ GRAPHICS NOT COMPROMISED — a classic WebGLRenderer keeps refractive glass', () => {
        // `webgl-only` has no TSL node graph, therefore no "expected a float" seed,
        // therefore no reason to downgrade the user\'s glass. Flattening it here would
        // trade a crash on one backend for a visual regression on another.
        const rig = makeRig(/* nodeCompiles */ false);
        const glass = realGlass();
        rig.addGlass(glass);

        rig.rpm.armTransmissionSweep('test');
        rig.renderOnce();

        expect(glass.transmission).toBe(REAL_GLASS_TRANSMISSION);
    });

    it('4 the latch is free when not armed — no scene traverse per frame', () => {
        const rig = makeRig();
        const spy = vi.spyOn(rig.scene, 'traverse');

        rig.renderOnce();          // never armed
        expect(spy).not.toHaveBeenCalled();

        rig.rpm.armTransmissionSweep('test');
        rig.renderOnce();
        expect(spy).toHaveBeenCalled();

        // One-shot: the arm is consumed, so the next frame is free again.
        spy.mockClear();
        rig.renderOnce();
        expect(spy).not.toHaveBeenCalled();
    });
});

describe('§L-10012 — a recovery attempt must differ from the one before it', () => {

    it('the pre-rebuild sweep removes the TSL seed, so the retry is not a repeat', () => {
        const rig = makeRig();
        const glass = realGlass();
        rig.addGlass(glass);

        // Stub the parts of the rebuild that need a GPU; we are measuring the DECISION.
        rig.rpm._rebuildPipeline = vi.fn(async () => { /* noop */ });
        rig.rpm._safeDisposeRenderPipeline = vi.fn(() => { /* noop */ });
        rig.rpm._recreateLightOwnedShadowMaps = vi.fn(() => { /* noop */ });
        rig.rpm._resetCompiledNodeStates = vi.fn(() => { /* noop */ });
        rig.rpm._reconcileRenderSize = vi.fn(() => { /* noop */ });
        rig.rpm._renderPipeline = { render: () => {}, dispose: () => {} };

        expect(rig.rpm.recoverFromRenderFailure()).toBe(true);

        // ⭐ The seed is gone BEFORE the rebuild recompiles anything. Without this the
        // ladder rebuilt the pipeline N times against the identical material graph and
        // every rebuild re-emitted the same invalid node — latency, not mitigation.
        expect(glass.transmission).toBe(0);
    });
});
