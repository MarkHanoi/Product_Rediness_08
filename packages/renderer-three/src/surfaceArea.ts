/**
 * @pryzm/renderer-three — §SURFACE-WITH-NO-AREA-REFUSES-THE-PASS  (L-1470)
 *
 * THE ONE AUTHORITY on the question *"does this renderer's output surface have any
 * area to draw into?"* — and the one place that says so when the answer is no.
 *
 * ── The defect (founder, 2026-08-20, production, WebGPU live) ───────────────
 *   [.WebGL-0x…] GL_INVALID_FRAMEBUFFER_OPERATION: glClear:
 *       Framebuffer is incomplete: Attachment has zero size.
 *   245x  … glDrawElements: Framebuffer is incomplete: Attachment has zero size.
 *   9x    … glDrawArrays:   Framebuffer is incomplete: Attachment has zero size.
 *   WebGL: too many errors, no more errors will be reported to the console for this context.
 *
 * ⭐ **The context is `[.WebGL-…]` while the session's MAIN renderer is native
 * WebGPU.** Those are two different surfaces, and only one of them is broken.
 *
 * ── Why the surface is zero, and why it is zero FOREVER rather than transiently ──
 * MEASURED from real source, both halves, 2026-08-20:
 *
 *  1. `mainRendererVisibility._apply()` (apps/editor/.../mainRendererVisibility.ts)
 *     sets `el.style.display = 'none'` on `#container` — the OBC canvas's PARENT —
 *     whenever the plan / split pane asks for the 3D surface to be hidden.
 *
 *  2. OBC's own `SimpleRenderer.resize` (@thatopen/components/dist/index.mjs:14535)
 *     is, in full:
 *         const width  = size ? size.x : this.container.clientWidth;
 *         const height = size ? size.y : this.container.clientHeight;
 *         this.three.setSize(width, height);
 *     **No `Math.max`, no `> 0` guard, no `||` fallback** — and it is wired to a
 *     `ResizeObserver` on that same parent (index.mjs:14680).
 *
 * So hiding the container makes OBC's observer fire with a 0x0 box and drive
 * `three.setSize(0, 0)`. The WebGL canvas's BACKING STORE becomes 0x0 and **stays
 * 0x0 for as long as the container is hidden** — CSS `display` never restores it,
 * and PRYZM's own guarded `resize()` (`container.clientWidth || window.innerWidth`)
 * does not win, because OBC's observer is the last writer.
 *
 * ⭐ **Ask the question this repo has been paid to ask: CAN THIS CONDITION EVER BE
 * SATISFIED? No.** A surface sized from a `display:none` container is not
 * *momentarily* zero on the way to being laid out — it is zero until something
 * unrelated makes the container visible again. Every pass submitted in between is
 * discarded by the driver, and after ~255 errors Chrome stops reporting entirely,
 * so the *next* real defect on that context is invisible too. **The flood is what
 * hides findings** (L-1402: 488 undrawn window frames stayed invisible exactly
 * this way).
 *
 * ── Why the existing self-gate did not catch it ─────────────────────────────
 * `clearObcBaseFramebuffer` already self-gates — but on
 * `pryzmCanvas.style.display === 'none'`, i.e. an INLINE STYLE on a DIFFERENT
 * ELEMENT. That is a proxy for "is somebody else painting into my surface", and it
 * is a fine answer to *that* question. It is not an answer to *this* one. Here the
 * **container** is hidden and `pryzmCanvas.style.display` is untouched, so the gate
 * passes and the clear runs into a zero-area framebuffer on every presented frame.
 *
 * ⛔ **NOT FIXED BY CLAMPING TO 1x1.** A 1x1 target still discards the image; it
 * merely converts a loud, diagnosable driver error into a silent wrong picture.
 * (`PlanViewCanvas.setSize`'s `Math.max(1, …)` is that trade knowingly taken for a
 * Canvas2D surface, where there is no framebuffer to be incomplete. It is not a
 * precedent for a GL surface.) The rule this module enforces is the one the brief
 * states: **a pass MUST NOT be created against, or run on, a surface with no area —
 * and it must say so ONCE, not 245 times.**
 *
 * ── Reflow-free by construction ─────────────────────────────────────────────
 * Every read here is of the **backing store** (`getDrawingBufferSize` → `getSize` →
 * `domElement.width/height`), never `clientWidth`/`clientHeight`. Two reasons, and
 * both matter:
 *   • `clientWidth` forces a layout reflow, and this runs on every frame.
 *   • The backing store is *the dimension the attachments are actually allocated
 *     from*, so a zero here IS the "Attachment has zero size" condition rather than
 *     a correlate of it. `three.setSize(0, 0)` sets `domElement.width = 0`, so the
 *     defect above is fully visible to a backing-store read.
 *
 * C04 §1.5 (ONE authority, READ not PUSHED) and §3.1.2 (§GPU-RESOURCE-LIFETIME).
 * P2: structurally typed — no THREE value or type import — so the gate is
 * unit-testable without a GPU and adds no coupling.
 */

/** The shape of a renderer this module needs. All members optional by design. */
export interface SurfaceSizedRendererLike {
    getDrawingBufferSize?: (target: { set?: (x: number, y: number) => unknown; x?: number; y?: number }) =>
        { x?: number; y?: number } | undefined | null;
    getSize?: (target: { set?: (x: number, y: number) => unknown; x?: number; y?: number }) =>
        { x?: number; y?: number } | undefined | null;
    domElement?: { width?: number; height?: number } | null;
}

/** What {@link measureSurface} found, and whether it found anything at all. */
export interface SurfaceMeasurement {
    /** Backing-store width in device pixels. `null` when no accessor could be read. */
    readonly width: number | null;
    /** Backing-store height in device pixels. `null` when no accessor could be read. */
    readonly height: number | null;
    /** Which accessor answered — for the diagnostic, so a reader can tell WHY. */
    readonly via: 'getDrawingBufferSize' | 'getSize' | 'domElement' | 'unreadable';
}

/**
 * Measure a renderer's output backing store, reflow-free.
 *
 * Tries the accessors in the order that most closely tracks the real attachment
 * allocation. Returns `via: 'unreadable'` with null dimensions when the object
 * exposes none of them — which is NOT the same fact as "zero", and the two must not
 * be conflated (see {@link hasDrawableArea}).
 */
export function measureSurface(renderer: unknown): SurfaceMeasurement {
    const r = renderer as SurfaceSizedRendererLike | null | undefined;
    if (!r) return { width: null, height: null, via: 'unreadable' };

    // A reusable probe would be shared mutable state across every caller; these
    // gates run once per frame per surface, so a fresh literal is the honest cost.
    for (const name of ['getDrawingBufferSize', 'getSize'] as const) {
        const read = r[name];
        if (typeof read !== 'function') continue;
        try {
            const probe: { x: number; y: number; set?: (x: number, y: number) => unknown } = {
                x: 0,
                y: 0,
                set(x: number, y: number) { this.x = x; this.y = y; return this; },
            };
            const out = read.call(r, probe) ?? probe;
            const w = typeof out.x === 'number' ? out.x : probe.x;
            const h = typeof out.y === 'number' ? out.y : probe.y;
            if (typeof w === 'number' && typeof h === 'number' && Number.isFinite(w) && Number.isFinite(h)) {
                return { width: w, height: h, via: name };
            }
        } catch {
            // A throwing accessor is not evidence of zero — fall through and try the next.
        }
    }

    const el = r.domElement;
    if (el && typeof el.width === 'number' && typeof el.height === 'number') {
        return { width: el.width, height: el.height, via: 'domElement' };
    }
    return { width: null, height: null, via: 'unreadable' };
}

/**
 * ⭐ THE PREDICATE. `true` when this renderer's surface has real area to draw into.
 *
 * **An UNREADABLE surface answers `true`, deliberately.** This gate exists to refuse
 * a pass, and refusing on an absence of evidence would turn every minimal harness
 * and every renderer shape this module has not met into a silently frozen viewport.
 * "I could not measure" and "I measured zero" are different facts and only the
 * second one is a refusal — the same distinction §RETIRE-ZERO-IS-NOT-ONE-FACT
 * (L-1410) had to draw for a detach count of `0`.
 */
export function hasDrawableArea(renderer: unknown): boolean {
    const { width, height } = measureSurface(renderer);
    if (width === null || height === null) return true; // unreadable ≠ zero
    return width > 0 && height > 0;
}

/** A single site's aggregated suppression state. */
interface SiteState {
    /** Frames refused since the CURRENT suppression began. */
    suppressed: number;
    /** Frames refused across the whole session, over every episode. */
    suppressedTotal: number;
    /** Number of distinct episodes (transitions into suppression). */
    episodes: number;
    /** Whether the "I am refusing" message has already been emitted this episode. */
    announced: boolean;
    /** The measurement that opened the current episode. */
    openedWith: SurfaceMeasurement | null;
}

/** A read-only snapshot of what the gate has refused. */
export interface ZeroAreaReport {
    readonly site: string;
    readonly suppressed: number;
    readonly suppressedTotal: number;
    readonly episodes: number;
    readonly suppressing: boolean;
}

/**
 * §SURFACE-WITH-NO-AREA-REFUSES-THE-PASS — the gate, with the log the founder's
 * console did not have.
 *
 * ⭐ **C04 §INST.4 — AGGREGATE ON THE REASON, AND THE MESSAGE MUST SURVIVE.** The
 * driver printed 255 lines and then went silent forever; that is the anti-pattern
 * this replaces. Here each *site* emits:
 *   • exactly ONE `console.warn` when it STARTS refusing, naming the measured size,
 *     which accessor answered, and the fact that the condition is not self-clearing;
 *   • exactly ONE `console.info` when it RESUMES, carrying the count it refused —
 *     so the episode is closed with a number rather than trailing off;
 *   • nothing at all in between, however many frames that is.
 *
 * ⭐ And the counts SURVIVE the flood in {@link report} / {@link reportAll}, because
 * a message that scrolled past at frame 3 of 40,000 is not a finding a human can
 * retrieve. That is the half `console` alone has never provided here.
 */
export class ZeroAreaSurfaceGate {
    private readonly _sites = new Map<string, SiteState>();

    /**
     * May a pass run against `renderer` on behalf of `site`?
     *
     * @param site  A stable label for the CALL SITE (not the surface) — it is the
     *              aggregation key, and it is what the log names.
     * @returns `true` to proceed, `false` to refuse this frame.
     */
    admit(renderer: unknown, site: string): boolean {
        const state = this._sites.get(site) ?? {
            suppressed: 0, suppressedTotal: 0, episodes: 0, announced: false, openedWith: null,
        };
        this._sites.set(site, state);

        const measured = measureSurface(renderer);
        const ok = measured.width === null || measured.height === null
            ? true
            : measured.width > 0 && measured.height > 0;

        if (ok) {
            if (state.suppressed > 0) {
                const refused = state.suppressed;
                state.suppressed = 0;
                state.announced  = false;
                state.openedWith = null;
                console.info(
                    `[renderer-three] §SURFACE-WITH-NO-AREA-REFUSES-THE-PASS "${site}" RESUMED — ` +
                    `the surface has area again (${measured.width}x${measured.height} via ` +
                    `${measured.via}). ${refused} frame(s) were refused while it had none.`,
                );
            }
            return true;
        }

        state.suppressed++;
        state.suppressedTotal++;
        if (!state.announced) {
            state.announced  = true;
            state.episodes++;
            state.openedWith = measured;
            console.warn(
                `[renderer-three] §SURFACE-WITH-NO-AREA-REFUSES-THE-PASS "${site}" is REFUSING to ` +
                `submit: its output surface measures ${measured.width}x${measured.height} ` +
                `(via ${measured.via}), so every draw into it would be discarded with ` +
                `"Framebuffer is incomplete: Attachment has zero size". ` +
                `⛔ This does NOT clear on its own — a surface sized from a display:none container ` +
                `stays zero until that container is shown again (L-1470). ` +
                `This message is emitted ONCE per episode; call getZeroAreaSurfaceReport() for counts.`,
            );
        }
        return false;
    }

    /** The surviving record for one site, or `null` if that site never ran. */
    report(site: string): ZeroAreaReport | null {
        const s = this._sites.get(site);
        if (!s) return null;
        return {
            site,
            suppressed: s.suppressed,
            suppressedTotal: s.suppressedTotal,
            episodes: s.episodes,
            suppressing: s.suppressed > 0,
        };
    }

    /** The surviving record for every site that has ever been gated. */
    reportAll(): ZeroAreaReport[] {
        return Array.from(this._sites.keys())
            .map((k) => this.report(k))
            .filter((r): r is ZeroAreaReport => r !== null);
    }

    /** Test seam — forget every site. */
    reset(): void { this._sites.clear(); }
}

/**
 * The process-wide gate. ONE instance, so every refusing site shares one
 * aggregation table and one report — C04 §1.5's "one authority" applied to the
 * diagnostic as well as to the decision.
 */
export const zeroAreaSurfaceGate = new ZeroAreaSurfaceGate();

/**
 * ⭐ THE CALL EVERY DRAW SITE USES. `true` → proceed; `false` → refuse this frame.
 * Aggregated, so a site may call it every frame forever and produce two log lines.
 */
export function admitSurface(renderer: unknown, site: string): boolean {
    return zeroAreaSurfaceGate.admit(renderer, site);
}

/** The surviving counts, for a console reader or a test. */
export function getZeroAreaSurfaceReport(): ZeroAreaReport[] {
    return zeroAreaSurfaceGate.reportAll();
}
