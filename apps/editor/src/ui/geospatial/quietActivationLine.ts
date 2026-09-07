/**
 * quietActivationLine.ts — the UNOBTRUSIVE half of §STARTUP-QUIET-ACTIVATION.
 *
 * FOUNDER 2026-09-07: *"in the project start up — after the user adds the location — or cadastral
 * information — do the zoom in to the location way slower — to ideally not have the loading page
 * at all."*
 *
 * ⭐ WHAT THIS IS, AND WHAT IT IS EMPHATICALLY NOT. It is **not a second loading overlay**, and it
 * must never grow into one. `LoadingOverlayController` is still the ONE overlay with N producers
 * (L-270) and it still owns every failure, every escape action and the input gate. This is a single
 * read-only LINE of text over the live scene, shown only while the start-up camera descent is
 * covering the load, carrying the SAME strings the splash would have carried. The moment anything
 * goes wrong, `viewActivationLoading` raises the real overlay and this line is cleared.
 *
 * ⛔ IT GATES NOTHING. `pointer-events: none`, no backdrop, no z-index war with the splash (it sits
 * far below the overlay's 88880 backdrop, so if the overlay is ever raised it wins outright). A
 * user can see it and cannot get stuck behind it.
 *
 * P3 — no `requestAnimationFrame`, no timer, no polling: it repaints only when the producer hands
 * it a new string. P4 — no `window` casts; it touches `document` only.
 */

import { trace } from '@opentelemetry/api';

const _tracer = trace.getTracer('pryzm.geospatial.quiet-activation-line');

const EL_ID = 'pryzm-quiet-activation-line';
const STYLE_ID = 'pryzm-quiet-activation-line-style';

function ensureStyles(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    // §PREVIEW-COLOR-UNIFIED-PRYZM-PURPLE — #6600FF is the one brand accent; white + purple, no
    // black (founder brand rule). Deliberately low-contrast against the scene: this is a status
    // whisper over a cinematic descent, not a modal.
    style.textContent = `
        #${EL_ID} {
            position: fixed;
            left: 50%;
            bottom: 28px;
            transform: translateX(-50%);
            z-index: 60;
            display: none;
            align-items: center;
            gap: 10px;
            max-width: min(78vw, 720px);
            padding: 7px 16px;
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.92);
            border: 1px solid rgba(102, 0, 255, 0.18);
            box-shadow: 0 6px 22px rgba(20, 0, 60, 0.14);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            color: #2A1A55;
            font: 500 12px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            letter-spacing: 0.01em;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            pointer-events: none;
        }
        #${EL_ID}[data-visible="1"] { display: flex; }
        #${EL_ID} .pryzm-quiet-dot {
            flex: 0 0 auto;
            width: 7px;
            height: 7px;
            border-radius: 50%;
            background: #6600FF;
            animation: pryzm-quiet-pulse 1.4s ease-in-out infinite;
        }
        @keyframes pryzm-quiet-pulse {
            0%, 100% { opacity: 0.35; transform: scale(0.85); }
            50%      { opacity: 1;    transform: scale(1.1); }
        }
        @media (prefers-reduced-motion: reduce) {
            #${EL_ID} .pryzm-quiet-dot { animation: none; opacity: 0.9; }
        }
    `;
    document.head.appendChild(style);
}

function ensureEl(): HTMLElement {
    const existing = document.getElementById(EL_ID);
    if (existing) return existing;
    ensureStyles();
    const el = document.createElement('div');
    el.id = EL_ID;
    el.setAttribute('data-testid', EL_ID);
    // Announced politely: a status whisper is still a status, and a screen-reader user gets the
    // same information a sighted one does. `polite`, never `assertive` — it must not interrupt.
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    const dot = document.createElement('span');
    dot.className = 'pryzm-quiet-dot';
    dot.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    text.className = 'pryzm-quiet-text';
    el.appendChild(dot);
    el.appendChild(text);
    document.body.appendChild(el);
    return el;
}

/**
 * Show (or, with `null`, clear) the one quiet activation line.
 *
 * Never throws: the caller is a loading producer, and a cosmetic line that cannot paint is not a
 * reason to fail — or to hold up — a view activation. A DOM-free environment is a no-op.
 *
 * P8: carries an OTel span (this is the module's only exported function).
 */
export function showQuietActivationLine(line: string | null): void {
    const span = _tracer.startSpan('pryzm.geospatial.quiet-activation-line.show');
    try {
        if (typeof document === 'undefined' || !document.body) return;
        if (line === null || line.trim().length === 0) {
            const el = document.getElementById(EL_ID);
            if (el) {
                el.setAttribute('data-visible', '0');
                const text = el.querySelector('.pryzm-quiet-text');
                if (text) text.textContent = '';
            }
            return;
        }
        const el = ensureEl();
        const text = el.querySelector('.pryzm-quiet-text');
        if (text && text.textContent !== line) text.textContent = line;
        el.setAttribute('data-visible', '1');
    } catch (e) {
        console.warn('[quietActivationLine] could not paint the in-view status line (ignored):', e);
    } finally {
        span.end();
    }
}
