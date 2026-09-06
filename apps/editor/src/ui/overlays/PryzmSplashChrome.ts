/**
 * PryzmSplashChrome.ts — §SPLASH-IS-ONE-COMPONENT (founder 2026-09-06).
 *
 * THE FOUNDER'S ASK, verbatim: *"the loading, don't use the current one (photo 1), add photo 2,
 * which is the project start-up."*
 *
 *   • PHOTO 1 = the view-activation surface (`LoadingOverlayView`): a flat purple-grey field
 *     (`--pryzm-loading-ground`), the prism, "Opening the 3D Site", a phase line, a tile counter
 *     and a percentage.
 *   • PHOTO 2 = the boot splash (`EngineLoadingOverlay`): a soft pastel MESH GRADIENT, the white
 *     3-D PRYZM pyramid at hero scale, the PRYZM wordmark, a hairline rule and one small
 *     letterspaced caption.
 *
 * ⭐ WHY THIS MODULE EXISTS AT ALL — "SAME LOOK" MUST MEAN "SAME CODE".
 * The cheap way to satisfy that ask is to copy photo 2's hexes and gradient stack into the view
 * surface. That is EXACTLY the defect the founder reported earlier the same day (L-12965: seven
 * colours defined twice in the 2D and 3D palettes, drifted apart, and neither definition was
 * wrong on its own). Two definitions of one look do not stay one look. So the mesh gradient, the
 * pyramid slot, the wordmark, the hairline track and the caption live HERE, once, and BOTH
 * surfaces are built from this factory:
 *
 *     EngineLoadingOverlay  (engine boot)        → ground + column, caption = boot stage
 *     LoadingOverlayView    (view activation,
 *                            batch execution)    → ground + column, caption = producer's label,
 *                                                  meta = the producer's OWN honest numbers
 *
 * ⛔ THE HONEST PROGRESS SURVIVES THE RESTYLE. The founder wants the prettier screen AND to know
 * it is working: the tile counter ("48 / 49 tiles") and the percentage are NOT dropped for a mute
 * splash — they are rendered on the `meta` row beneath the caption. A loading screen that says
 * less than the one it replaces is a regression wearing a nicer background.
 *
 * ⛔ THE PYRAMID STAYS ON THE COMPOSITOR THREAD (§PRYZM-LOGO-SPINNER / C04 / P3). It is
 * `createPryzmLogoSpinner('lg')` — a CSS 3-D animation — precisely so it keeps turning through
 * the 100 ms–20 s main-thread LONGTASKs a Cesium tile upload or a geometry drain produces. Never
 * reintroduce a rAF/JS painter here; `requestAnimationFrame` belongs to the frame scheduler alone.
 *
 * C01 §2 — pure UI. No engine import, no Cesium, no store. It builds DOM and injects one
 * stylesheet; every caller owns its own state machine.
 *
 * P8: every exported function carries an OTel span.
 */

import { trace } from '@opentelemetry/api';
import { createPryzmLogoSpinner } from './PryzmLogoSpinner';

const _tracer = trace.getTracer('pryzm.ui.pryzm-splash-chrome');

const STYLE_ID = 'pryzm-splash-chrome-style';

/** The slots a caller drives. Everything else is presentation and needs no handle. */
export interface PryzmSplashChrome {
    /** The centred column (pyramid → wordmark → track → caption → meta → actions). */
    readonly column: HTMLElement;
    /** The CSS 3-D pyramid wrapper (compositor-driven — never animate it from JS). */
    readonly spinner: HTMLElement;
    /** The "PRYZM" wordmark block. */
    readonly wordmark: HTMLElement;
    /** The hairline rule that is ALSO the progress track. */
    readonly track: HTMLElement;
    /** The filled bar inside `track` — drive it with a CSS `width`, never a rAF. */
    readonly bar: HTMLElement;
    /** The small uppercase caption ("DOWNLOADING BIM ENGINE…", "OPENING THE 3D SITE"). */
    readonly caption: HTMLElement;
    /** The honest-numbers row under the caption ("Streaming terrain… · 48 / 49 tiles · 59%"). */
    readonly meta: HTMLElement;
    /** Escape actions — empty and hidden until a producer surfaces a failure. */
    readonly actions: HTMLElement;
}

/**
 * Inject the ONE splash stylesheet. Idempotent — the second caller (there are two surfaces, and
 * both can be alive at once) is a no-op, which is why the look cannot drift between them.
 */
export function ensurePryzmSplashStyles(): void {
    const span = _tracer.startSpan('pryzm.ui.pryzm-splash-chrome.ensureStyles');
    try {
        if (typeof document === 'undefined') return;
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = SPLASH_CSS;
        document.head.appendChild(style);
    } finally {
        span.end();
    }
}

/**
 * Build the splash column. The caller owns the GROUND element (so it can keep its own id, z-index
 * and pointer-events gate) and adds `pryzm-splash-ground` to it; this returns the column to put
 * on top of it — or, for a single-element surface like the engine boot, the same element can
 * carry `pryzm-splash-ground` and host this column directly.
 */
export function buildPryzmSplashChrome(): PryzmSplashChrome {
    const span = _tracer.startSpan('pryzm.ui.pryzm-splash-chrome.build');
    try {
        ensurePryzmSplashStyles();

        const column = document.createElement('div');
        column.className = 'pryzm-splash-column';

        // §PRYZM-LOGO-SPINNER — the CSS 3-D pyramid, at hero scale (photo 2's proportions).
        const spinner = createPryzmLogoSpinner('lg');
        spinner.classList.add('pryzm-splash-pyramid');

        const wordmark = document.createElement('div');
        wordmark.className = 'pryzm-splash-wordmark';
        const name = document.createElement('span');
        name.className = 'pryzm-splash-name';
        name.textContent = 'PRYZM';
        wordmark.appendChild(name);

        // The hairline rule IS the progress track — one element, two readings, which is why the
        // splash can carry real progress without gaining a second piece of chrome.
        const track = document.createElement('div');
        track.className = 'pryzm-splash-track';
        const bar = document.createElement('div');
        bar.className = 'pryzm-splash-bar';
        track.appendChild(bar);

        const caption = document.createElement('div');
        caption.className = 'pryzm-splash-caption';
        caption.setAttribute('data-testid', 'pryzm-splash-caption');

        // ⛔ THE HONEST ROW. Empty → `:empty` collapses it, so the engine boot (which has no
        // counter to show) renders photo 2 exactly, with no reserved gap.
        const meta = document.createElement('div');
        meta.className = 'pryzm-splash-meta';
        meta.setAttribute('data-testid', 'pryzm-splash-meta');

        const actions = document.createElement('div');
        actions.className = 'pryzm-splash-actions';
        actions.hidden = true;

        column.appendChild(spinner);
        column.appendChild(wordmark);
        column.appendChild(track);
        column.appendChild(caption);
        column.appendChild(meta);
        column.appendChild(actions);

        return { column, spinner, wordmark, track, bar, caption, meta, actions };
    } finally {
        span.end();
    }
}

/**
 * Build one escape-hatch button in the splash's own vocabulary. Used by the ERROR state of any
 * producer, so a failed activation and a failed boot never grow two button styles.
 */
export function buildPryzmSplashButton(label: string, primary: boolean): HTMLButtonElement {
    const span = _tracer.startSpan('pryzm.ui.pryzm-splash-chrome.button');
    try {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'pryzm-splash-btn' + (primary ? ' pryzm-splash-btn--primary' : '');
        b.textContent = label;
        return b;
    } finally {
        span.end();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// THE ONE STYLESHEET. Every value below was the engine-boot splash's already-shipped value
// (`EngineLoadingOverlay.ensureStyles`, photo 2) — this is a MOVE, not a re-design, so the boot
// screen the founder pointed AT is unchanged and the view surface now inherits it.
// ─────────────────────────────────────────────────────────────────────────────
const SPLASH_CSS = `
/* ── THE GROUND ────────────────────────────────────────────────────────────────
 * Pastel mesh gradient (a static snapshot of the landing page's lp4-mesh-flow), so
 * boot → onboarding → site activation read as one continuous surface.
 * ⚠ The final \`#f3f0ff\` is OPAQUE on purpose: §LOAD-MASK-OPAQUE-WHITE (L-483) — the thing
 * behind a view transition is a Cesium globe whose 3D tiles have not painted, i.e. a DARK
 * sphere, and a translucent scrim let it through as a muddy wash. Brand is white + purple,
 * explicitly no black. Do not reintroduce an alpha here. */
.pryzm-splash-ground {
    position: fixed; inset: 0;
    background:
        radial-gradient(ellipse at 22% 44%, #c8b6ff 0%, transparent 54%),
        radial-gradient(ellipse at 72% 22%, #daceff 0%, transparent 52%),
        radial-gradient(ellipse at 58% 78%, #b8a2ff 0%, transparent 48%),
        radial-gradient(ellipse at 38% 72%, #ece7ff 0%, transparent 50%),
        #f3f0ff;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    user-select: none;
    overflow: hidden;
}

/* ── THE COLUMN ─────────────────────────────────────────────────────────────── */
.pryzm-splash-column {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    user-select: none;
    text-align: center;
}

/* The lg spinner is 44×56 px base; at 2.8× it is ~123×157 px — photo 2's hero proportion.
 * overflow:visible lets the prism's purple drop-shadow extend past the bounding box. */
.pryzm-splash-pyramid {
    transform: scale(2.8);
    transform-origin: center center;
    margin-bottom: 52px;
    overflow: visible;
    flex-shrink: 0;
    opacity: 0;
    animation: pryzm-splash-fade-in 0.9s cubic-bezier(0.22,1,0.36,1) 0.08s forwards;
}

.pryzm-splash-wordmark {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    margin-bottom: 32px;
    opacity: 0;
    animation: pryzm-splash-fade-in 0.9s cubic-bezier(0.22,1,0.36,1) 0.22s forwards;
}
.pryzm-splash-name {
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    font-size: clamp(28px, 5vw, 40px);
    font-weight: 700;
    letter-spacing: 8px;
    color: rgba(60,30,120,0.82);
    line-height: 1;
}

/* The hairline rule = the progress track. */
.pryzm-splash-track {
    position: relative; z-index: 1;
    width: min(200px, 48vw); height: 1.5px;
    background: rgba(100,60,200,0.12);
    border-radius: 999px; overflow: hidden;
    margin-bottom: 12px;
    opacity: 0;
    animation: pryzm-splash-fade-in 0.7s ease 0.36s forwards;
}
/* §LOADING-REAL-PROGRESS — a CSS \`width\` transition, i.e. the COMPOSITOR drives it, so the bar
 * keeps moving through a blocked main thread exactly like the pyramid does. */
.pryzm-splash-bar {
    height: 100%; width: 0%;
    background: linear-gradient(90deg, #8B5CF6 0%, #6600FF 100%);
    border-radius: inherit;
    transition: width 0.44s cubic-bezier(0.22,1,0.36,1);
    box-shadow: 0 0 8px rgba(102,0,255,0.45);
}

.pryzm-splash-caption {
    position: relative; z-index: 1;
    min-height: 16px;
    font-size: 10px; font-weight: 500;
    letter-spacing: 0.22em; text-transform: uppercase;
    color: rgba(80,60,140,0.58);
    transition: opacity 0.3s ease;
    opacity: 0;
    animation: pryzm-splash-fade-in 0.7s ease 0.44s forwards;
}
.pryzm-splash-caption--ready { color: rgba(80,60,140,0.72); letter-spacing: 0.26em; }

/* ⛔ THE HONEST ROW — the counter + percentage the founder still wants to see. Darker than the
 * caption on purpose: it carries NUMBERS, and \`rgba(80,60,140,0.58)\` composites to 2.9:1 on this
 * ground, which is under AA for 11 px type. The token is the one the loading surfaces already
 * share, so a future ground change retunes both at once. \`:empty\` collapses the row entirely, so
 * a producer with nothing honest to add (the engine boot) renders photo 2 unchanged. */
.pryzm-splash-meta {
    position: relative; z-index: 1;
    margin-top: 9px;
    font-size: 11px; font-weight: 500;
    letter-spacing: 0.04em;
    color: var(--pryzm-loading-note, #3f3757);
    font-variant-numeric: tabular-nums;
    opacity: 0;
    animation: pryzm-splash-fade-in 0.7s ease 0.52s forwards;
    max-width: min(520px, 86vw);
}
.pryzm-splash-meta:empty { display: none; }
.pryzm-splash-meta-pct { color: var(--pryzm-loading-accent, #4700b3); font-weight: 600; }

/* ── ERROR state — a readiness signal that never arrives must be ESCAPABLE (L-250). ── */
.pryzm-splash-caption--error {
    color: var(--pryzm-loading-error, #b4232a);
    text-transform: none; letter-spacing: 0.01em; font-size: 13px;
    white-space: normal; max-width: min(520px, 86vw);
}
.pryzm-splash-actions {
    display: flex; gap: 8px; margin-top: 20px; justify-content: center;
    pointer-events: auto;
}
.pryzm-splash-actions[hidden] { display: none; }
.pryzm-splash-btn {
    appearance: none;
    /* A white fill alone cannot BOUND this control on a pastel ground (SC 1.4.11) — the border
       is what bounds it, which is why it is the accent and not a tint. */
    border: 1px solid var(--pryzm-loading-accent, #4700b3);
    background: #ffffff;
    color: var(--pryzm-loading-accent, #4700b3);
    cursor: pointer;
    padding: 7px 14px; border-radius: 8px;
    font: 600 12px/1 system-ui, sans-serif;
}
.pryzm-splash-btn:hover { background: #f4f0ff; }
.pryzm-splash-btn--primary {
    background: var(--pryzm-loading-accent, #4700b3);
    border-color: var(--pryzm-loading-accent, #4700b3);
    color: #ffffff;
}
.pryzm-splash-btn--primary:hover { background: #35008a; }

@keyframes pryzm-splash-fade-in {
    from { opacity: 0; transform: translateY(-10px); }
    to   { opacity: 1; transform: translateY(0); }
}
@media (max-width: 520px) {
    .pryzm-splash-pyramid { transform: scale(2.0); margin-bottom: 40px; }
    .pryzm-splash-name    { font-size: 26px; letter-spacing: 5px; }
}
@media (prefers-reduced-motion: reduce) {
    .pryzm-splash-pyramid,
    .pryzm-splash-wordmark,
    .pryzm-splash-track,
    .pryzm-splash-caption,
    .pryzm-splash-meta { animation-duration: 0.001ms !important; }
}
`;
