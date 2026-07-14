/**
 * RendererSwapOverlay.ts — §FEAT-SWAP-LOADING-OVERLAY (L-141)
 *
 * A lightweight, brand-styled full-viewport loading overlay shown ONLY while the
 * renderer backend is being live-swapped (ADR-0077 §RENDERER-LIVE-SWAP: WebGL ↔
 * WebGPU toggle) or recovered after a WebGPU device-loss (§FIX-HEAVY-SCENE-3D-
 * SCALABILITY / L-139 in createRenderer.ts). During either transition the old
 * renderer is disposed and a fresh one is built on a new canvas, so the viewport
 * briefly blanks/flickers with no indicator — this overlay covers that gap.
 *
 * Why this module (and not a new bespoke overlay framework):
 *   - It REUSES the shared PRYZM brand spinner `createPryzmLogoSpinner('lg')`
 *     (the SAME CSS 3-D pyramid shown by EngineLoadingOverlay + LoadingOverlayView).
 *     There is no new spinner/animation system here.
 *   - The spin runs on the CSS compositor thread, so it stays visually alive even
 *     while the main thread is blocked by GPU pipeline (re)compilation during the
 *     swap — no requestAnimationFrame (P3-safe: this file starts no rAF loop).
 *   - Pure UI: no engine / renderer / store imports (C01 §2 Layer Isolation).
 *
 * Robustness — the overlay can NEVER get stuck visible:
 *   - Call sites SHOW at the top of the swap/recovery and HIDE in a `finally`, so
 *     every show is paired with a hide even when the swap throws.
 *   - A ref-count tolerates the (rare) overlap of a manual swap and a device-loss
 *     recovery: the backdrop only clears once BOTH have released.
 *   - A hard safety backstop force-clears the overlay after SAFETY_MAX_MS in case
 *     a caller ever forgets its `finally`. This is a ceiling, NOT an artificial
 *     delay — the normal path hides the instant the swap completes/rolls back.
 *
 * Two tiny module-local functions are exported (show/hide) so BOTH swap call sites
 * — initScene.swapRendererBackend and createRenderer's device-loss handler — can
 * drive the ONE overlay instance. They are UI helpers (not command-bus handlers),
 * so the P8 OTel-span gate (which scans the plugin handler dirs only) does not apply;
 * the swap's own `pryzm.renderer.swap` span already records the transition.
 */

import { createPryzmLogoSpinner } from './PryzmLogoSpinner';

const OVERLAY_ID = 'pryzm-renderer-swap-overlay';
const STYLE_ID = 'pryzm-renderer-swap-overlay-style';

/** Hard ceiling so the overlay is never stuck if a caller forgets its finally. */
const SAFETY_MAX_MS = 20_000;
/** Fade duration — kept snappy so the cover feels instant, not sluggish. */
const FADE_MS = 180;

let _overlayEl: HTMLElement | null = null;
let _labelEl: HTMLElement | null = null;
/** Ref-count of active swap/recovery holders (swap + recovery may briefly overlap). */
let _holders = 0;
let _fadeOutTimer: ReturnType<typeof setTimeout> | null = null;
let _safetyTimer: ReturnType<typeof setTimeout> | null = null;

/** True in a browser DOM context (guards SSR / node unit-test environments). */
function _hasDom(): boolean {
    return typeof document !== 'undefined' && !!document.body;
}

function _ensureStyles(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    // §LOADING-WHITE-BACKDROP palette — a soft WHITE, see-through frosted scrim
    // (matches LoadingOverlayView) so the scene reads faintly behind, on the
    // PRYZM white+purple brand. No dark/black field.
    style.textContent = `
        #${OVERLAY_ID} {
            position: fixed;
            inset: 0;
            z-index: 90000;
            display: none;
            opacity: 0;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 26px;
            background: rgba(255, 255, 255, 0.72);
            backdrop-filter: blur(9px);
            -webkit-backdrop-filter: blur(9px);
            transition: opacity ${FADE_MS}ms ease;
            pointer-events: all;
            user-select: none;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
                         Helvetica, Arial, sans-serif;
        }
        #${OVERLAY_ID} .pryzm-swap-overlay__spinner {
            transform: scale(1.4);
            transform-origin: center center;
            overflow: visible;
            flex-shrink: 0;
        }
        #${OVERLAY_ID} .pryzm-swap-overlay__label {
            font-size: 12px;
            font-weight: 600;
            letter-spacing: 0.18em;
            text-transform: uppercase;
            color: #6600FF;
            text-align: center;
        }
        @media (prefers-reduced-motion: reduce) {
            #${OVERLAY_ID} { transition-duration: 0.001ms; }
        }
    `;
    document.head.appendChild(style);
}

function _build(): void {
    _ensureStyles();
    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;

    // Reuse the shared brand pyramid — compositor-thread spin, never frozen.
    const spinner = createPryzmLogoSpinner('lg');
    spinner.classList.add('pryzm-swap-overlay__spinner');

    const label = document.createElement('div');
    label.className = 'pryzm-swap-overlay__label';
    label.textContent = 'Switching renderer…';

    overlay.appendChild(spinner);
    overlay.appendChild(label);
    document.body.appendChild(overlay);

    _overlayEl = overlay;
    _labelEl = label;
}

function _clearSafetyTimer(): void {
    if (_safetyTimer !== null) {
        clearTimeout(_safetyTimer);
        _safetyTimer = null;
    }
}

/**
 * Show the renderer-swap overlay (ref-counted). Idempotent per holder — call once
 * at the top of a swap/recovery and pair it with exactly one hideRendererSwapOverlay()
 * in a `finally`. Safe to call outside a browser (no-ops).
 */
export function showRendererSwapOverlay(message = 'Switching renderer…'): void {
    if (!_hasDom()) return;
    if (!_overlayEl) _build();
    if (!_overlayEl) return;

    _holders++;
    if (_labelEl) _labelEl.textContent = message;

    // Cancel any in-flight fade-out so a re-show doesn't leave a half-faded overlay.
    if (_fadeOutTimer !== null) {
        clearTimeout(_fadeOutTimer);
        _fadeOutTimer = null;
    }

    _overlayEl.style.display = 'flex';
    // Force a reflow so the opacity transition runs from 0 → 1.
    void _overlayEl.offsetHeight;
    _overlayEl.style.opacity = '1';

    // (Re)arm the safety backstop — force-clear if a caller ever forgets finally.
    _clearSafetyTimer();
    _safetyTimer = setTimeout(() => {
        _holders = 0;
        _forceHide();
    }, SAFETY_MAX_MS);
}

/**
 * Release one holder of the renderer-swap overlay (ref-counted). The overlay only
 * fades out once every holder has released. Safe to call outside a browser, and
 * safe to over-call (the count floors at 0). Guaranteed to run from each swap/
 * recovery `finally`, so the overlay is always bounded by the transition.
 */
export function hideRendererSwapOverlay(): void {
    if (!_hasDom() || !_overlayEl) return;
    _holders = Math.max(0, _holders - 1);
    if (_holders > 0) return; // another swap/recovery still in flight
    _clearSafetyTimer();

    const el = _overlayEl;
    el.style.opacity = '0';
    if (_fadeOutTimer !== null) clearTimeout(_fadeOutTimer);
    _fadeOutTimer = setTimeout(() => {
        // Re-check: a new holder may have shown the overlay again during the fade.
        if (_holders === 0 && _overlayEl) _overlayEl.style.display = 'none';
        _fadeOutTimer = null;
    }, FADE_MS + 20);
}

/** Immediate, unconditional hide used only by the safety backstop. */
function _forceHide(): void {
    _clearSafetyTimer();
    if (_fadeOutTimer !== null) { clearTimeout(_fadeOutTimer); _fadeOutTimer = null; }
    if (_overlayEl) {
        _overlayEl.style.opacity = '0';
        _overlayEl.style.display = 'none';
    }
}

// ── Test-only reset (not used in production) ─────────────────────────────────
/** @internal — resets module state for unit tests. */
export function __resetRendererSwapOverlayForTest(): void {
    _clearSafetyTimer();
    if (_fadeOutTimer !== null) { clearTimeout(_fadeOutTimer); _fadeOutTimer = null; }
    _holders = 0;
    if (_overlayEl && _overlayEl.parentNode) _overlayEl.parentNode.removeChild(_overlayEl);
    _overlayEl = null;
    _labelEl = null;
}
