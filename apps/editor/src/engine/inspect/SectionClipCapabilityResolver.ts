/**
 * SectionClipCapabilityResolver — §SECTION-3D-CAPABILITY (L-1760..L-1762, 2026-08-21)
 *
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Builder/inspect layer (pure decision derivation — no store,
 *                    registry, or semantic-graph mutation; the CALLER owns every
 *                    renderer write and the button's rendered state).
 * Architectural Classification: A (view-only)
 *
 * Impact Assessment: Semantic No · Constraint No · Graph No · Topology No ·
 *                    Store-Registry No · Undo No.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * The bottom bar has shipped a "Section Box" button since the 2026-05-19
 * baseline, wired to `SectionBoxTool` via `window.sectionBoxTool`. It is
 * reachable and it is NOT dead code — but on most backends it cannot produce a
 * cut, and it said nothing about that. Two independent reasons, both MEASURED
 * against `three@0.183.2` and the Phase 5 boot path:
 *
 *  1. **The renderer it was handed does not draw.** `BottomActionMenu` resolved
 *     `window.world.renderer.three` — the OBC `PostproductionRenderer`, which
 *     Phase 5 (`initScene.ts` "Phase 5: PRYZM-Owned WebGPU Renderer") puts into
 *     `RendererMode.MANUAL` with postproduction off and then never renders
 *     again. The live renderer is `window.pryzmRenderer`. This is the mechanism
 *     ISSUE-LOG **L-1486** measured and left OPEN.
 *
 *  2. **On the Phase-5 backends there is no renderer clipping API at all.**
 *     `createRenderer()` returns an object TYPED `THREE.WebGLRenderer`, but at
 *     runtime it is a `WebGPURenderer` for BOTH the `'webgpu'` and
 *     `'webgl-fallback'` backends. In three r183 the common renderer base
 *     (`three/src/renderers/common/Renderer.js`) has **no `clippingPlanes` and
 *     no `localClippingEnabled` property**, and it never reads
 *     `material.clippingPlanes`: clipping there flows ONLY through
 *     `ClippingContext`, fed exclusively by `THREE.ClippingGroup` scene objects
 *     (`common/ClippingContext.js` `update()` reads `clippingGroup.clippingPlanes`
 *     and `updateGlobal()` contributes no planes at all). This repo uses no
 *     `ClippingGroup` anywhere.
 *
 *     ⚠ This is why "just point it at `window.pryzmRenderer`" is NOT the fix and
 *     must not be attempted as one: on `'webgpu'` / `'webgl-fallback'` it would
 *     write a property nothing reads — trading one silent no-op for another.
 *
 * Only a genuine `THREE.WebGLRenderer` — the `'webgl-only'` backend, i.e. Phase 5
 * aborted at boot, or the `'webgl-classic'` live-swap — honours
 * `renderer.clippingPlanes`. That is exactly the founder's recollection that
 * this "worked back ago while using WebGL", and it is correct.
 *
 * ── WHY A CAPABILITY PROBE AND NOT A BACKEND-NAME TEST ──────────────────────
 * `window.pryzmRendererBackend` is the app's single source of truth for WHICH
 * backend is live, and it is reused here — but only for the DISCLOSURE TEXT.
 * The available/unavailable decision probes the live renderer object for the
 * clipping API itself, because the backend name and the clipping capability are
 * not the same fact: `'webgl-only'` reached via boot-abort and via the
 * `'webgl-classic'` live swap are the same name but different objects, and
 * `isLightweightWebGlBackend()` groups `'webgl-fallback'` (a WebGPURenderer,
 * cannot clip) together with `'webgl-only'` (a WebGLRenderer, can). Asking the
 * object the question we actually care about is the honest test —
 * [[probe-can-be-wrong-three-ways]]. ⛔ Do NOT replace this with a string
 * comparison against the backend name.
 *
 * ── THE CONTRACT THIS SERVES ────────────────────────────────────────────────
 * C06 §13.5 — an unresolvable action MUST render DISABLED, marked, and carrying
 * its stated reason; it MUST NOT be painted as a live button ("a dead button
 * that looked alive is its own bug, and the founder had been clicking them").
 * C84 EI-1b — failure and emptiness must not be the same value: "nothing
 * happened and I don't know why" and "this isn't available, because X" are
 * different facts and must not render the same.
 *
 * Correspondingly `reason` is non-null IFF `available` is false — a live action
 * carrying an unavailability reason, or a dead one carrying none, is the defect
 * C06 §13.5 names as a tombstone pretending to be a feature.
 */

import { trace } from '@opentelemetry/api';

const _tracer = trace.getTracer('pryzm-engine');

/** The mechanism by which a 3-D section cut can be produced on the live renderer. */
export type SectionClipMechanism =
    /** `renderer.clippingPlanes` — the global clip set on a genuine THREE.WebGLRenderer. */
    | 'renderer-global-planes'
    /** No mechanism is available on the live renderer. */
    | 'none';

/**
 * The live-renderer facts this decision is derived from.
 *
 * Deliberately structural and `unknown`-typed: `createRenderer()` declares its
 * result as `THREE.WebGLRenderer` for call-site compatibility even when the
 * runtime object is a `WebGPURenderer`, so the declared TYPE cannot be trusted
 * to answer this question and must not be used to.
 */
export interface SectionClipProbe {
    /**
     * The renderer that actually draws frames — `window.pryzmRenderer`, falling
     * back to the OBC renderer when Phase 5 aborted (in which case OBC IS live).
     */
    readonly liveRenderer: unknown;
    /**
     * `window.pryzmRendererBackend` — the app's authoritative active-backend
     * name. Used for the disclosure text ONLY, never for the verdict.
     */
    readonly backend?: string | null;
}

/** A pure decision describing whether a 3-D section can be cut, and why not. */
export interface SectionClipCapability {
    /** True when the live renderer can produce a real clipped cut. */
    readonly available: boolean;
    /** How the caller should cut. `'none'` iff `available` is false. */
    readonly mechanism: SectionClipMechanism;
    /**
     * Human-readable reason the action is unavailable, for the disabled
     * control's label. Non-null IFF `available` is false (C06 §13.5).
     */
    readonly reason: string | null;
}

/**
 * True when `r` is a genuine `THREE.WebGLRenderer` that honours the global
 * `renderer.clippingPlanes` set.
 *
 * `localClippingEnabled` is declared ONLY on `three/src/renderers/WebGLRenderer.js`
 * in r183 and exists on no other renderer class, which makes its PRESENCE (not
 * its value — the app deliberately keeps it false, see QF-1 below) an exact
 * structural discriminator for the classic renderer.
 */
function honoursGlobalClipPlanes(r: unknown): boolean {
    if (r === null || typeof r !== 'object') return false;
    const cand = r as { localClippingEnabled?: unknown; clippingPlanes?: unknown };
    return typeof cand.localClippingEnabled === 'boolean' && Array.isArray(cand.clippingPlanes);
}

/**
 * Resolve whether a live 3-D section cut is possible, and state why when it is not.
 *
 * Pure derivation — mutates nothing and touches no renderer. The caller owns the
 * button's rendered state and every clipping write.
 *
 * @param probe the live renderer plus the active backend name for disclosure.
 * @returns availability, the mechanism to use, and a reason when unavailable.
 */
export function resolveSectionClipCapability(probe: SectionClipProbe): SectionClipCapability {
    return _tracer.startActiveSpan('pryzm.inspect.resolveSectionClipCapability', (span) => {
        try {
            const backend = probe.backend ?? null;
            let result: SectionClipCapability;

            if (probe.liveRenderer === null || probe.liveRenderer === undefined) {
                // Not-ready is a DIFFERENT fact from not-supported and must read
                // differently — the first resolves itself, the second never does.
                result = {
                    available: false,
                    mechanism: 'none',
                    reason: 'Section: the 3D renderer is still starting up — try again in a moment.',
                };
            } else if (honoursGlobalClipPlanes(probe.liveRenderer)) {
                result = { available: true, mechanism: 'renderer-global-planes', reason: null };
            } else {
                // The actionable half matters as much as the honest half: the
                // founder already has a GPU pill that switches the backend, so
                // name the remedy rather than only the refusal.
                const named = backend ? `The active GPU backend (${backend})` : 'The active GPU backend';
                result = {
                    available: false,
                    mechanism: 'none',
                    reason:
                        `Section: unavailable on WebGPU. ${named} draws through the WebGPU renderer, ` +
                        'which provides no clipping-plane API. Switch GPU to WebGL in the GPU control ' +
                        'to cut a 3D section.',
                };
            }

            span.setAttribute('pryzm.section_clip.available', result.available);
            span.setAttribute('pryzm.section_clip.mechanism', result.mechanism);
            if (backend) span.setAttribute('pryzm.section_clip.backend', backend);
            span.end();
            return result;
        } catch (err) {
            span.recordException(err as Error);
            span.end();
            // Fail CLOSED, with a reason. An exception here means we could not
            // establish that clipping works — offering a live button on that
            // basis is precisely the silent no-op this resolver exists to end.
            const failedClosed: SectionClipCapability = {
                available: false,
                mechanism: 'none',
                reason: 'Section: unavailable — the renderer capability could not be determined.',
            };
            return failedClosed;
        }
    });
}
