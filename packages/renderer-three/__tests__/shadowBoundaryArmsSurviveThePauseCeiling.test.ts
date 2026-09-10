/**
 * §PAUSE-FLAG-IS-NOT-THE-SUBMIT-GATE (L-13282)
 * §A-LIVENESS-CEILING-MAY-NOT-DEFEAT-A-CORRECTNESS-PAUSE (L-13283)
 * §FOREIGN-SHADOW-MAP-CLAIM (L-13281)
 *
 * ── THE FOUNDER'S EVIDENCE (production `app.pryzm.so`, WebGPU, 2026-09-10) ─────
 *   [RenderPipelineManager] SHADOW_REBUILD_COMPLETE elapsed=16799.0ms
 *   [RenderPipelineManager] §RECOVERY-MUST-REFUSE a SHADOW depth resource was destroyed
 *     while still referenced by an in-flight submit (GPUDevice.uncapturederror:
 *     'Destroyed texture [Texture "ShadowDepthTexture"] used in a submit …')
 *   … §L-966-BOUNDED-AUTO-RECOVERY 1/2 … 2/2 … budget EXHAUSTED
 *   [RenderPipelineManager] Phase: error
 *   … §L900-FRAME-SKIP-ATTRIBUTION 120 consecutive frames declined at gate "pipelineError"
 *
 * ── WHY EIGHT EXISTING TESTS IN THIS FAMILY WERE ALL GREEN ────────────────────
 * `recoveryShadowSubmitOrdering`, `shadowMapReallocBoundary`, `shadowReallocFreeze`,
 * `shadowFreeze`, `ShadowQualityUpgrader.mapReallocOrdering`,
 * `ShadowQualityUpgrader.foreignRendererClaim`, `destroyedGpuResource` and
 * `uncapturedGpuError` all measure the guards against a submit pause that HOLDS.
 * On 2026-09-09 — ONE DAY before the founder's crash — §SUBMIT-PAUSE-IS-BOUNDED
 * (L-13270, commit 5e463032) made that premise conditional: past
 * `MAX_SUBMIT_PAUSE_MS` the pause RELEASES and frames submit while
 * `_shadowRebuildPaused` is still `true`. Every arm gated on that FLAG therefore
 * silently switched off across a window in which frames were being encoded — and
 * on the founder's open that window was 16 799 ms against a 2 000 ms ceiling,
 * i.e. ~14.8 s.
 *
 * ⭐ THE TWO DEFECTS THESE ARMS PIN, IN THE ORDER THEY BITE:
 *   L-13282  the DERIVED caster detector (`_orderPendingCasterReleasesAtBoundary`)
 *            early-returns on the flag, so a latent `castShadow` free lands
 *            mid-encode with nothing watching → the crash.
 *   L-13283  `recoverFromRenderFailure()` opens a NESTED guard and then frees every
 *            light-owned shadow map. On an already-overstayed window that guard
 *            never actually shut, so the RECOVERY re-created the fault from inside
 *            the repair — twice — which is precisely the 1/2 → 2/2 → EXHAUSTED
 *            sequence in the founder's console. The crash is L-13282; the DEAD
 *            VIEWPORT is L-13283.
 *
 * Every arm below drives the REAL `RenderPipelineManager.render()` — the same entry
 * point the single rAF calls — against real three r183.2 `LightsNode` /
 * `DirectionalLightNode` plumbing, never a hand-rolled disposer. The rig is the one
 * `shadowCasterFlipAtBoundary.test.ts` ARM C already uses, so a reader can compare
 * the two directly.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from '../src/three-re-export';
import { DirectionalLightNode, LightsNode } from 'three/webgpu';
import {
    drainShadowCasterFlipQueue,
    shadowMapClaimedByWebGlRenderer,
    lightsWithForeignShadowMapClaim,
    type ShadowOwningLight,
} from '../src/safeDispose.js';
import { RenderPipelineManager } from '../src/pipeline/RenderPipelineManager.js';

/** The 2 000 ms ceiling §SUBMIT-PAUSE-IS-BOUNDED (L-13270) installed. */
const CEILING_MS = 2000;

/** A live shadow render target double minted by the WebGPU node path (a bare RenderTarget). */
function makeNodeShadowMap() {
    return { dispose: vi.fn(), width: 2048, height: 2048, setSize: vi.fn() };
}

/**
 * The target `WebGLShadowMap.render()` mints — three brands it
 * `isWebGLRenderTarget = true` (WebGLRenderTarget.js:28), which the node path
 * (`NodeBuilder.createRenderTarget` → `new RenderTarget`) never sets.
 */
function makeWebGlClaimedShadowMap() {
    return { dispose: vi.fn(), width: 512, height: 512, setSize: vi.fn(), isWebGLRenderTarget: true };
}

/** A REAL shadow-casting DirectionalLight with a REAL three `DirectionalLightNode`. */
function makeCasterWithNode(map: unknown = makeNodeShadowMap()) {
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.name = 'pascal-key-light';
    light.castShadow = true;
    (light.shadow as unknown as { map: unknown }).map = map;
    const node = new (DirectionalLightNode as unknown as new (l: unknown) => {
        shadowNode: { dispose: () => void } | null;
    })(light);
    const shadowNodeDispose = vi.fn();
    node.shadowNode = { dispose: shadowNodeDispose };
    return { light, node, shadowNodeDispose };
}

type Rig = ReturnType<typeof makeRig>;

/**
 * An RPM whose `render()` reaches the boundary arms AND the submit on the
 * native-WebGPU path.
 *
 * ⚠ `_renderPipeline` is INSTALLED deliberately. Without it every frame short-circuits
 * at the `noPipeline` gate, which sits ABOVE the submit-pause gate — so a rig that
 * omitted it could never tell "the pause held this frame" from "this frame never got
 * that far", and every pause assertion in this file would be reading the wrong gate.
 * `submits` counts the ONE place a frame is actually encoded (`rp.render()`), which is
 * the quantity the whole defect is about.
 */
function makeRig(lights: unknown[]) {
    const lightsNode = new LightsNode().setLights(lights as never[]);
    const nodeCaches = {
        _objects:   { dispose: vi.fn() },
        _pipelines: { dispose: vi.fn() },
        _nodes:     { dispose: vi.fn() },
        _bindings:  { dispose: vi.fn() },
    };
    const submits = { count: 0 };
    const rpm = new RenderPipelineManager() as unknown as RenderPipelineManager & Record<string, unknown>;
    (rpm as Record<string, unknown>)._webGpuActive = true;
    (rpm as Record<string, unknown>)._scene = new THREE.Scene();
    (rpm as Record<string, unknown>)._renderPipeline = { render: () => { submits.count++; } };
    (rpm as Record<string, unknown>)._renderer = {
        ...nodeCaches,
        lighting: { getNode: () => lightsNode },
        shadowMap: { enabled: true, type: 1, autoUpdate: true },
        backend: { isWebGPUBackend: true },
        domElement: { clientWidth: 1200, clientHeight: 900, width: 1200, height: 900 },
        getDrawingBufferSize: (t: { set?: (a: number, b: number) => unknown }) =>
            (t?.set ? (t.set(1200, 900), t) : { x: 1200, y: 900 }),
        getSize: (t: { set?: (a: number, b: number) => unknown }) =>
            (t?.set ? (t.set(1200, 900), t) : { x: 1200, y: 900 }),
        setSize: () => { /* noop */ },
        setClearAlpha: () => { /* noop */ },
    };
    return { rpm, nodeCaches, submits };
}

/** Did this frame reach the submit path, or was it declined at the pause gate? */
function skippedAtPauseGate(rig: Rig): boolean {
    return rig.rpm.getFrameSkipReport().lastSkipReason === 'shadowRebuildPaused';
}

// ── clock control ──────────────────────────────────────────────────────────────
// `performance.now()` is the ONLY clock §SUBMIT-PAUSE-IS-BOUNDED reads, and the
// deferred `_endShadowRebuildGuard()` releases run on `setTimeout`. They are driven
// SEPARATELY here on purpose: the founder's window is one in which wall-clock time
// has passed and the release has NOT yet arrived, and a helper that advanced both
// together could not express it.
let nowMs = 0;
function tick(ms: number): void { nowMs += ms; }

beforeEach(() => {
    nowMs = 10_000;
    vi.useFakeTimers();
    vi.spyOn(performance, 'now').mockImplementation(() => nowMs);
    vi.spyOn(console, 'log').mockImplementation(() => { /* quiet */ });
    vi.spyOn(console, 'warn').mockImplementation(() => { /* quiet */ });
    vi.spyOn(console, 'error').mockImplementation(() => { /* quiet */ });
    drainShadowCasterFlipQueue(); // isolate the module-level queue
});
afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('§PAUSE-FLAG-IS-NOT-THE-SUBMIT-GATE (L-13282) — the boundary arms follow the SUBMIT, not the flag', () => {
    it('PREMISE: past the ceiling the pause flag is still true and frames DO submit (this is L-13270, and it is correct)', () => {
        const { light } = makeCasterWithNode();
        const rig = makeRig([light]);

        rig.rpm.runShadowCasterMutation(() => { /* a real caller opening a real pause */ });

        // Inside the ceiling: the gate holds, exactly as every older test assumes.
        rig.rpm.render();
        expect(skippedAtPauseGate(rig)).toBe(true);
        expect((rig.rpm as unknown as Record<string, unknown>)._shadowRebuildPaused).toBe(true);

        // The founder's window: 16 799 ms of rebuild against a 2 000 ms ceiling.
        tick(CEILING_MS + 500);
        rig.rpm.render();

        // ⭐ The flag says "paused". The viewport is painting anyway. Those two facts
        // stopped being the same question on 2026-09-09, and everything below is the
        // consequence nobody re-audited.
        expect((rig.rpm as unknown as Record<string, unknown>)._shadowRebuildPaused).toBe(true);
        expect(skippedAtPauseGate(rig)).toBe(false);
    });

    it('⭐ THE REGRESSION: a bare castShadow=false inside the overstayed window is ORDERED at the boundary', () => {
        const { light, node, shadowNodeDispose } = makeCasterWithNode();
        const rig = makeRig([light]);

        // Frame 0 — settle the fingerprint against the casting state.
        rig.rpm.render();
        expect(rig.rpm.boundaryCasterReleaseCount).toBe(0);

        // A long shadow rebuild opens the pause (the founder's 16.8 s window).
        rig.rpm.runShadowCasterMutation(() => { /* rebuild in flight */ });
        tick(CEILING_MS + 500); // the ceiling releases submits; the flag stays true

        // The defect, verbatim: some other tick flips a caster with no guard and no
        // announcement — the tier gate, the furniture shadow budget, a sun driver.
        // three frees NOTHING yet; the free is LATENT and detonates inside the next
        // open command encoder (RenderObjects.js:127-129).
        light.castShadow = false;
        expect(shadowNodeDispose).not.toHaveBeenCalled();

        // The next frame WILL submit (proved by the premise arm above). So the
        // boundary MUST order the free here, before any encoder for it exists.
        rig.rpm.render();

        // TOOTH: with the old `if (this._shadowRebuildPaused) return;` gate every one
        // of these is the opposite — the detector never ran, the light kept its live
        // map, and three freed it mid-submit → "Destroyed texture [ShadowDepthTexture]
        // used in a submit" → §RECOVERY-MUST-REFUSE → dead viewport.
        expect(rig.rpm.boundaryCasterReleaseCount).toBe(1);
        expect(shadowNodeDispose).toHaveBeenCalledTimes(1);
        expect(node.shadowNode).toBeNull();
        expect((light.shadow as unknown as { map: unknown }).map).toBeNull();
        // Nothing may still BIND the map we just freed (§L-819).
        expect(rig.nodeCaches._objects.dispose).toHaveBeenCalledTimes(1);
        expect(rig.nodeCaches._bindings.dispose).toHaveBeenCalledTimes(1);
    });

    it('while the pause is ACTUALLY HOLDING the arm still stands down — the deferral is not weakened, only re-aimed', () => {
        const { light, shadowNodeDispose } = makeCasterWithNode();
        const rig = makeRig([light]);
        rig.rpm.render();

        rig.rpm.runShadowCasterMutation(() => { /* holding */ });
        tick(CEILING_MS - 100); // still inside the ceiling

        light.castShadow = false;
        rig.rpm.render();

        // Deliberately NOT released: no frame is being encoded, so the latent free
        // cannot detonate, and the fingerprint is left unrecorded so the FIRST
        // submitting boundary still sees it.
        expect(skippedAtPauseGate(rig)).toBe(true);
        expect(rig.rpm.boundaryCasterReleaseCount).toBe(0);
        expect(shadowNodeDispose).not.toHaveBeenCalled();

        // …and it does. The deferral is preserved end-to-end.
        tick(CEILING_MS);
        rig.rpm.render();
        expect(rig.rpm.boundaryCasterReleaseCount).toBe(1);
        expect(shadowNodeDispose).toHaveBeenCalledTimes(1);
    });
});

describe('§A-LIVENESS-CEILING-MAY-NOT-DEFEAT-A-CORRECTNESS-PAUSE (L-13283) — the half that killed the RECOVERY', () => {
    it('⭐ a guard opened on an ALREADY-OVERSTAYED window actually holds submits', () => {
        const rig = makeRig([makeCasterWithNode().light]);

        // Window 1: a long rebuild that overstays. The ceiling releases submits — right.
        rig.rpm.runShadowCasterMutation(() => { /* the 16.8 s rebuild */ });
        tick(CEILING_MS + 5_000);
        rig.rpm.render();
        expect(skippedAtPauseGate(rig)).toBe(false); // painting, as L-13270 intends

        // Window 2: a LATER caller — in production this is `recoverFromRenderFailure()`
        // step 1, opened immediately before `_recreateLightOwnedShadowMaps()` frees every
        // light-owned ShadowDepthTexture. Its entire safety argument is that this gate
        // shuts.
        rig.rpm.runShadowCasterMutation(() => { /* the recovery's free happens in here */ });
        rig.rpm.render();

        // TOOTH: with the outermost-stamp-only rule this was `false` — the expired clock
        // swallowed the new guard, the recovery freed shadow maps while frames were being
        // submitted, and each attempt re-armed the very fault it was repairing. That is
        // the founder's 1/2 → 2/2 → budget EXHAUSTED → phase=error, verbatim.
        expect(skippedAtPauseGate(rig)).toBe(true);
    });

    it('the re-stamped window is itself BOUNDED — L-13270 is honoured, not undone', () => {
        const rig = makeRig([makeCasterWithNode().light]);

        rig.rpm.runShadowCasterMutation(() => { /* window 1 */ });
        tick(CEILING_MS + 1_000);
        rig.rpm.runShadowCasterMutation(() => { /* window 2, re-stamps */ });

        rig.rpm.render();
        expect(skippedAtPauseGate(rig)).toBe(true);   // holds, as correctness requires

        tick(CEILING_MS + 1);
        rig.rpm.render();
        expect(skippedAtPauseGate(rig)).toBe(false);  // …and releases, as liveness requires
    });

    it('a nested guard opened INSIDE a healthy window does NOT restart the clock (§L930-SUBMIT-PAUSE-DEPTH stands)', () => {
        const rig = makeRig([makeCasterWithNode().light]);

        rig.rpm.runShadowCasterMutation(() => {
            tick(CEILING_MS - 200);
            // Nested, while the outer window is still healthy: must NOT re-stamp, or a
            // re-arming inner pause could hold the ceiling off forever — the unbounded
            // case L-13270 exists to end.
            rig.rpm.runShadowCasterMutation(() => { /* nested */ });
        });

        tick(300); // outer window is now past the ceiling
        rig.rpm.render();
        expect(skippedAtPauseGate(rig)).toBe(false);
    });
});

describe('§FOREIGN-SHADOW-MAP-CLAIM (L-13281) — a SECOND WebGL renderer over the same scene', () => {
    it('the predicate is a CONSTRUCTION: only WebGLShadowMap mints a target three brands isWebGLRenderTarget', () => {
        const nodeOwned = makeCasterWithNode(makeNodeShadowMap()).light;
        const claimed   = makeCasterWithNode(makeWebGlClaimedShadowMap()).light;
        const bare      = new THREE.DirectionalLight();

        expect(shadowMapClaimedByWebGlRenderer(nodeOwned as unknown as ShadowOwningLight)).toBe(false);
        expect(shadowMapClaimedByWebGlRenderer(claimed   as unknown as ShadowOwningLight)).toBe(true);
        expect(shadowMapClaimedByWebGlRenderer(bare      as unknown as ShadowOwningLight)).toBe(false);
        expect(shadowMapClaimedByWebGlRenderer(null)).toBe(false);
        expect(lightsWithForeignShadowMapClaim(
            [nodeOwned, claimed, bare] as unknown as ShadowOwningLight[],
        )).toHaveLength(1);
    });

    it('⭐ the claim is HEALED at the next frame boundary — before any encoder for that frame exists', () => {
        const { light, node, shadowNodeDispose } = makeCasterWithNode();
        const rig = makeRig([light]);
        rig.rpm.render();
        expect(rig.rpm.foreignShadowClaimHealCount).toBe(0);

        // The L-205 dual-renderer claim, verbatim: OBC's WebGL renderer ran a shadow
        // pass over the shared scene and replaced the slot
        // (WebGLShadowMap.js:209/214/227). NOTHING the caster fingerprint observes has
        // moved — same light, same id, same castShadow, same mapSize — which is exactly
        // why every other boundary arm is blind to it.
        const before = rig.rpm.boundaryCasterReleaseCount;
        (light.shadow as unknown as { map: unknown }).map = makeWebGlClaimedShadowMap();

        rig.rpm.render();

        expect(rig.rpm.foreignShadowClaimHealCount).toBe(1);
        expect(rig.rpm.boundaryCasterReleaseCount).toBe(before); // not a caster flip
        expect(shadowNodeDispose).toHaveBeenCalledTimes(1);
        expect(node.shadowNode).toBeNull();
        expect((light.shadow as unknown as { map: unknown }).map).toBeNull();
        expect(rig.nodeCaches._bindings.dispose).toHaveBeenCalledTimes(1);
        // The frame that recompiles is one we do not submit.
        expect(skippedAtPauseGate(rig)).toBe(true);
    });

    it('it lifts the §RECOVERY-MUST-REFUSE-NO-FLOOD latch — a viewport already frozen comes BACK', () => {
        const { light } = makeCasterWithNode(makeWebGlClaimedShadowMap());
        const rig = makeRig([light]);
        // The state the founder was left in: the refusal latch holding the loop shut
        // over a destroyed light-owned map, with a pipeline still installed.
        (rig.rpm as unknown as Record<string, unknown>)._hasPipelineError = true;

        rig.rpm.render();

        expect(rig.rpm.foreignShadowClaimHealCount).toBe(1);
        expect((rig.rpm as unknown as Record<string, unknown>)._hasPipelineError).toBe(false);
    });

    it('a node-owned map costs nothing, every frame', () => {
        const { light, shadowNodeDispose } = makeCasterWithNode();
        const rig = makeRig([light]);

        rig.rpm.render();
        rig.rpm.render();
        rig.rpm.render();

        expect(rig.rpm.foreignShadowClaimHealCount).toBe(0);
        expect(shadowNodeDispose).not.toHaveBeenCalled();
        expect(rig.nodeCaches._bindings.dispose).not.toHaveBeenCalled();
        expect((rig.rpm as unknown as Record<string, unknown>)._shadowRebuildPaused).toBe(false);
    });

    it('inert on the WebGL2 fallback, where a WebGLRenderTarget in that slot is CORRECT', () => {
        const { light, shadowNodeDispose } = makeCasterWithNode(makeWebGlClaimedShadowMap());
        const rig = makeRig([light]);
        (rig.rpm as unknown as Record<string, unknown>)._webGpuActive = false;

        rig.rpm.render();

        expect(rig.rpm.foreignShadowClaimHealCount).toBe(0);
        expect(shadowNodeDispose).not.toHaveBeenCalled();
    });
});
