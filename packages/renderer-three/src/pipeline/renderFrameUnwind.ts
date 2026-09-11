/**
 * renderFrameUnwind — put back the renderer state a THROWN WebGPU frame strands.
 *
 * §FRAME-THROW-STRANDS-RENDER-STATE · §ENVELOPE-EDIT-GPU-LIFETIME (L-13313) · C04 §2 (the frame
 * owner owns the frame) · ADR-0281 / ADR-0299 (a recovery must be able to succeed, or say it
 * cannot) · P2 (this package is the L1 THREE owner) · P3 (runs inside the one frame; no rAF).
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⭐ WHY THE FOUNDER'S VIEWPORT STAYED WHITE AFTER THE "ONE IMMEDIATE RECONSTRUCTION"
 * ═══════════════════════════════════════════════════════════════════════════════
 * three r183.2 mutates renderer / camera / scene state around the WebGPU frame and restores
 * it ONLY on a clean return. None of these is in a try/finally:
 *
 *   • `RenderPipeline.render()` (RenderPipeline.js:112-130) — `renderer.toneMapping =
 *     NoToneMapping`, `renderer.outputColorSpace = <working space>`, `renderer.xr.enabled =
 *     false`, around `this._quadMesh.render(renderer)` at :123;
 *   • `PassNode.updateBefore()` (PassNode.js:796-863) — `setRenderTarget(<pass RT>)`,
 *     `setMRT(<pass MRT>)`, `autoClear` / `transparent` / `opaque` / `contextNode`,
 *     `camera.layers.mask` (the ZONE pass narrows it to layer 2 only), `scene.overrideMaterial`
 *     and `scene.name`, around `renderer.render(scene, camera)` at :851.
 *
 * The founder's `setIndexBuffer … parameter 1 is not of type 'GPUBuffer'` threw from INSIDE
 * PassNode.js:851 (`_renderTransparents` of the scene pass). So the frame that threw left the
 * renderer BOUND TO THE SCENE PASS'S RENDER TARGET. From then on:
 *   - `Renderer._renderScene` picks its output as `this._renderTarget || this._outputRenderTarget`
 *     (Renderer.js:1392), so every later frame's composite quad — including every frame of the
 *     reconstruction's NEW pipeline — was drawn INTO that stale offscreen target, not the canvas;
 *   - the new PassNode captures the stale target as "current" (PassNode.js:796) and faithfully
 *     restores it after itself (:856), so the redirection is self-perpetuating;
 *   - nothing throws, so there is no RECURRED line; `_markFramePresented()` fires every frame,
 *     so the health badge reads OK;
 *   - and the canvas texture the thrown frame had already acquired (the outer quad pass BEGINS
 *     on it before its objects run, Renderer.js beginRender → _renderObjects) was never
 *     submitted, so the canvas presents transparent — the page's white shows through.
 * White viewport, no second error, blank thumbnail: exactly the founder's console. And no repair
 * lever — the ONE reconstruction, the bounded auto-recovery, the crash card's "Reload viewport"
 * (`_resetCompiledNodeStates` + rebuild) — touches renderer state, so none of them could ever
 * bring it back. `_assertLightweightFrameTarget` re-asserts the canvas on the WebGL2 path only.
 *
 * THE FIX. The frame owner snapshots that state immediately before `rp.render()` and, when
 * `rp.render()` throws, puts it back FIRST — before the pipeline is torn down and before any
 * repair is chosen. That is exactly what three would have restored had it not thrown, so on the
 * happy path it is a no-op: O(1) property reads per frame, no allocation.
 *
 * ⛔ NOT RESTORED, deliberately: the renderer's PRIVATE `_callDepth` / `_currentRenderContext` /
 * `_handleObjectFunction` (Renderer.js:1665-1671). The next `_renderScene` re-assigns the latter
 * two; a stale `_callDepth` only keys fresh RenderContexts (:1415) — it cannot redirect output —
 * and writing three's private fields is a larger hazard than that small leak.
 *
 * NOTE on OTel spans (P8 / C10 §2): intentionally span-free — a per-frame O(1) snapshot on the
 * render path, outside the handler zones `check-otel-spans.ts` gates.
 */

/** The renderer surface three's WebGPU frame mutates (Renderer.js / RenderPipeline.js / PassNode.js). */
interface UnwindableRenderer {
    getRenderTarget?(): unknown;
    setRenderTarget?(target: unknown, activeCubeFace?: number, activeMipmapLevel?: number): void;
    getActiveCubeFace?(): number;
    getActiveMipmapLevel?(): number;
    getMRT?(): unknown;
    setMRT?(mrt: unknown): unknown;
    autoClear?: boolean;
    transparent?: boolean;
    opaque?: boolean;
    contextNode?: unknown;
    toneMapping?: unknown;
    outputColorSpace?: unknown;
    xr?: { enabled?: boolean } | null;
}

interface UnwindableCamera {
    layers?: { mask: number } | null;
}

interface UnwindableScene {
    overrideMaterial?: unknown;
    name?: string;
}

/** Plain-property fields restored by identity, in the order three set them. */
const RENDERER_PROPS = [
    'autoClear',
    'transparent',
    'opaque',
    'contextNode',
    'toneMapping',
    'outputColorSpace',
] as const;
type RendererProp = typeof RENDERER_PROPS[number];

/**
 * §FRAME-THROW-STRANDS-RENDER-STATE — one reusable snapshot, owned by the frame owner
 * (`RenderPipelineManager`). `capture()` before `rp.render()`; `release()` after it returns;
 * `restore()` from its `catch`. Never throws.
 */
export class RenderFrameUnwind {
    private _renderer: UnwindableRenderer | null = null;
    private _camera: UnwindableCamera | null = null;
    private _scene: UnwindableScene | null = null;

    private _renderTarget: unknown = null;
    private _activeCubeFace = 0;
    private _activeMipmapLevel = 0;
    private _mrt: unknown = null;
    private readonly _props: Record<RendererProp, unknown> = {
        autoClear: undefined,
        transparent: undefined,
        opaque: undefined,
        contextNode: undefined,
        toneMapping: undefined,
        outputColorSpace: undefined,
    };
    private _xrEnabled: boolean | undefined = undefined;
    private _layersMask: number | undefined = undefined;
    private _overrideMaterial: unknown = undefined;
    private _sceneName: string | undefined = undefined;

    /** Snapshot the state the frame is about to hand three. Call immediately before `rp.render()`. */
    capture(renderer: unknown, camera: unknown, scene: unknown): void {
        try {
            const r = (renderer ?? null) as UnwindableRenderer | null;
            const c = (camera ?? null) as UnwindableCamera | null;
            const s = (scene ?? null) as UnwindableScene | null;
            this._renderer = r;
            this._camera = c;
            this._scene = s;
            if (r) {
                this._renderTarget = typeof r.getRenderTarget === 'function' ? r.getRenderTarget() : null;
                this._activeCubeFace = typeof r.getActiveCubeFace === 'function' ? r.getActiveCubeFace() : 0;
                this._activeMipmapLevel = typeof r.getActiveMipmapLevel === 'function' ? r.getActiveMipmapLevel() : 0;
                this._mrt = typeof r.getMRT === 'function' ? r.getMRT() : null;
                const bag = r as unknown as Record<RendererProp, unknown>;
                for (const k of RENDERER_PROPS) this._props[k] = bag[k];
                this._xrEnabled = r.xr?.enabled;
            }
            this._layersMask = c?.layers?.mask;
            this._overrideMaterial = s ? s.overrideMaterial : undefined;
            this._sceneName = s ? s.name : undefined;
        } catch {
            // A snapshot must never become the frame's failure. With no snapshot, restore() is a no-op.
            this.release();
        }
    }

    /** Drop the references once the frame returned cleanly — nothing outlives its frame here. */
    release(): void {
        this._renderer = null;
        this._camera = null;
        this._scene = null;
    }

    /**
     * Put back everything the throw stranded, then release. Never throws. Returns the names of
     * the fields that had DRIFTED and were restored — empty when the throw left nothing behind.
     */
    restore(): string[] {
        const drifted: string[] = [];
        const r = this._renderer;
        const c = this._camera;
        const s = this._scene;

        if (r) {
            // 1. THE CANVAS — the one that turned the viewport white (Renderer.js:1392).
            try {
                if (typeof r.getRenderTarget === 'function' && typeof r.setRenderTarget === 'function') {
                    const face = typeof r.getActiveCubeFace === 'function' ? r.getActiveCubeFace() : 0;
                    const mip = typeof r.getActiveMipmapLevel === 'function' ? r.getActiveMipmapLevel() : 0;
                    if (r.getRenderTarget() !== this._renderTarget || face !== this._activeCubeFace || mip !== this._activeMipmapLevel) {
                        r.setRenderTarget(this._renderTarget, this._activeCubeFace, this._activeMipmapLevel);
                        drifted.push('renderTarget');
                    }
                }
            } catch { /* best-effort — the recovery must still run */ }
            // 2. The pass's MRT layout — left in place, the composite would target attachments
            //    the canvas does not have (the L-253 invalid-pipeline shape).
            try {
                if (typeof r.getMRT === 'function' && typeof r.setMRT === 'function' && r.getMRT() !== this._mrt) {
                    r.setMRT(this._mrt);
                    drifted.push('mrt');
                }
            } catch { /* best-effort */ }
            // 3. Clear / draw-list / context flags and RenderPipeline.render's tone mapping +
            //    colour space (a stale NoToneMapping would re-key every later output node).
            const bag = r as unknown as Record<RendererProp, unknown>;
            for (const k of RENDERER_PROPS) {
                const was = this._props[k];
                if (was === undefined) continue; // absent at capture — never invent a field
                try {
                    if (bag[k] !== was) { bag[k] = was; drifted.push(k); }
                } catch { /* best-effort */ }
            }
            try {
                if (r.xr && this._xrEnabled !== undefined && r.xr.enabled !== this._xrEnabled) {
                    r.xr.enabled = this._xrEnabled;
                    drifted.push('xr.enabled');
                }
            } catch { /* best-effort */ }
        }

        // 4. The camera's layer mask — a throw inside the ZONE pass would otherwise leave every
        //    later scene pass drawing layer 2 (zones) only: an empty, white viewport.
        try {
            if (c?.layers && this._layersMask !== undefined && c.layers.mask !== this._layersMask) {
                c.layers.mask = this._layersMask;
                drifted.push('camera.layers.mask');
            }
        } catch { /* best-effort */ }

        // 5. The scene's per-pass override material and name.
        try {
            if (s) {
                if (this._overrideMaterial !== undefined && s.overrideMaterial !== this._overrideMaterial) {
                    s.overrideMaterial = this._overrideMaterial;
                    drifted.push('scene.overrideMaterial');
                }
                if (this._sceneName !== undefined && s.name !== this._sceneName) {
                    s.name = this._sceneName;
                    drifted.push('scene.name');
                }
            }
        } catch { /* best-effort */ }

        this.release();
        return drifted;
    }
}
