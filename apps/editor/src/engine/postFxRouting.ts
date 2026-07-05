/**
 * @file apps/editor/src/engine/postFxRouting.ts
 * @description §FIX-POSTFX-WEBGPU (L-111) — backend-aware routing for the View
 *              Properties → POST-PROCESSING controls (Ambient Occlusion, Exposure)
 *              so they take effect on the LIVE renderer, which in the production
 *              default is the PRYZM-owned WebGPU renderer (resolvedPreference=webgpu).
 *
 * WHY
 * ───────────────────────────────────────────────────────────────────────────
 * In Phase 5 the OBC PostproductionRenderer is silenced (MANUAL mode,
 * postproduction.enabled=false) and a PRYZM-owned WebGPU renderer
 * (window.pryzmRenderer, driven by RenderPipelineManager's TSL pipeline) paints
 * the viewport. The historical listeners in initUI.ts poked ONLY the OBC
 * renderer:
 *   • Ambient Occlusion → OBC `postproduction.aoPass.blendIntensity` — which does
 *     nothing while OBC is silenced, so AO silently no-op'd on WebGPU (L-111).
 *   • Exposure → OBC `.three.toneMappingExposure` — changed an invisible renderer.
 *
 * On WebGPU the ambient-occlusion pass IS the TSL screen-space SSGI pass
 * (SSGINode with giIntensity=0 → AO-only, not full GI), owned by
 * RenderPipelineManager. `applyAmbientOcclusion` therefore routes the toggle to
 * the TSL pipeline on the WebGPU backend and falls back to the OBC aoPass on the
 * WebGL/OBC backend. `applyExposure` writes toneMappingExposure to every live
 * renderer passed in (OBC + WebGPU), so it takes effect on whichever is painting.
 *
 * CONTRACTS
 *   C04 (rendering/scheduling) — the WebGPU AO pass is the SSGI screen-space AO
 *     contribution owned by RenderPipelineManager; this helper only *routes* to it.
 *   §FIX-SSGI-DEFAULT-OFF (founder L-59) — SSGI is NOT forced on at boot; it is
 *     activated ONLY on explicit user opt-in (this AO toggle / the RenderRail SSGI
 *     toggle, which share the same rpm.activateSSGI() path). Default SSGI params
 *     are AO-only (giIntensity=0), so this drives the AO contribution rather than
 *     the heavy full-GI pipeline. No pipeline rebuild is forced for exposure, so
 *     the ADR-0111 shadow-freeze protections are untouched.
 *   P2 — no THREE import here; the tone-mapping enum value is passed in by the
 *     caller (initUI already owns a THREE import in the L7.5 transitional zone).
 *   P4 — no `(window as any)`; all deps arrive as narrow typed interfaces.
 *   P8 — the exported functions wrap their work in an OTel span (no-op tracer by
 *     default so headless/test contexts run without an SDK).
 */

// ── OTel span (P8) — swappable no-op tracer (mirrors scheduleClickZoom.ts) ────

export interface PostFxSpan {
  end(): void;
  setAttribute?(key: string, value: string | number | boolean): void;
}
export interface PostFxTracer {
  startSpan(name: string, attrs?: Readonly<Record<string, string | number | boolean>>): PostFxSpan;
}
const NOOP_SPAN: PostFxSpan = Object.freeze({ end() { /* noop */ } });
const NOOP_TRACER: PostFxTracer = Object.freeze({ startSpan: () => NOOP_SPAN });
let currentTracer: PostFxTracer = NOOP_TRACER;
export function setPostFxTracer(t: PostFxTracer): void { currentTracer = t; }
export function clearPostFxTracer(): void { currentTracer = NOOP_TRACER; }

// ── Ambient Occlusion ─────────────────────────────────────────────────────

/**
 * Narrow surface of RenderPipelineManager consumed by the AO route.
 * On the WebGPU backend `status.webGpuActive` is true and activate/deactivateSSGI
 * drive the TSL SSGI-AO pass. All methods are optional so older/degraded RPMs (or
 * `undefined` when the pipeline is not yet bound) route safely to the WebGL path.
 */
export interface SsgiPipelineLike {
  readonly status?: { readonly webGpuActive?: boolean };
  activateSSGI?: (params?: object) => Promise<void> | void;
  deactivateSSGI?: () => Promise<void> | void;
}

/** Applies the OBC/WebGL ambient-occlusion pass (blendIntensity). */
export type ObcAoApply = (enabled: boolean) => void;

export interface AmbientOcclusionResult {
  /** Which backend received the toggle. */
  readonly route: 'webgpu' | 'webgl';
  readonly enabled: boolean;
}

/**
 * Route the Ambient Occlusion toggle to the LIVE renderer.
 *
 *  • WebGPU backend (production default) → RenderPipelineManager SSGI-AO pass
 *    (activateSSGI / deactivateSSGI). SSGI-AO is only ever turned on by this
 *    explicit user opt-in (§FIX-SSGI-DEFAULT-OFF preserved).
 *  • WebGL / OBC backend → the supplied OBC aoPass applier.
 *
 * Never throws: a rejected SSGI promise is caught and logged so the toggle
 * handler stays alive.
 */
export function applyAmbientOcclusion(
  rpm: SsgiPipelineLike | null | undefined,
  obcApply: ObcAoApply,
  enabled: boolean,
): AmbientOcclusionResult {
  const isWebGpu = rpm?.status?.webGpuActive === true;
  const span = currentTracer.startSpan('pryzm.postfx.ambientOcclusion', {
    route: isWebGpu ? 'webgpu' : 'webgl',
    enabled,
  });
  try {
    if (isWebGpu) {
      // WebGPU: Ambient Occlusion === SSGI-AO on the TSL pipeline.
      try {
        const p = enabled ? rpm?.activateSSGI?.() : rpm?.deactivateSSGI?.();
        (p as Promise<void> | undefined)?.catch?.((err: unknown) => {
          console.warn('[postFxRouting] §FIX-POSTFX-WEBGPU AO (SSGI) toggle failed:', err);
        });
      } catch (err) {
        console.warn('[postFxRouting] §FIX-POSTFX-WEBGPU AO (SSGI) toggle threw:', err);
      }
      return { route: 'webgpu', enabled };
    }
    // WebGL / OBC fallback: drive the OBC PostproductionRenderer aoPass.
    obcApply(enabled);
    return { route: 'webgl', enabled };
  } finally {
    span.end();
  }
}

// ── Exposure ──────────────────────────────────────────────────────────────

/** Minimal tone-mapped renderer surface (structurally satisfied by any THREE renderer). */
export interface ToneMappedRenderer {
  toneMapping?: unknown;
  toneMappingExposure?: number;
}

export interface ExposureResult {
  /** How many live renderers actually received the new exposure. */
  readonly applied: number;
}

/**
 * Set tone-mapping exposure on every live renderer passed in.
 *
 * In the WebGPU default both the (silenced) OBC renderer and the live
 * window.pryzmRenderer are provided; only the WebGPU renderer is painting, so
 * writing it is what makes exposure visible. `toneMappingValue` is the
 * ACESFilmic enum value threaded from the caller (P2 — no THREE import here). The
 * UnifiedFrameLoop repaints the TSL pipeline every frame, so no pipeline rebuild
 * is required for the change to appear.
 */
export function applyExposure(
  renderers: ReadonlyArray<ToneMappedRenderer | null | undefined>,
  exposure: number,
  toneMappingValue: unknown,
): ExposureResult {
  const span = currentTracer.startSpan('pryzm.postfx.exposure', { exposure });
  try {
    let applied = 0;
    for (const r of renderers) {
      if (!r) continue;
      r.toneMapping = toneMappingValue;
      r.toneMappingExposure = exposure;
      applied++;
    }
    span.setAttribute?.('applied', applied);
    return { applied };
  } finally {
    span.end();
  }
}
