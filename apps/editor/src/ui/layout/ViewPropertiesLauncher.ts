/**
 * @file apps/editor/src/ui/layout/ViewPropertiesLauncher.ts
 *
 * §UX1-VP-DEFAULT-CLOSED — the bottom-right control that reopens
 * `VIEW PROPERTIES — Environment & Camera`.
 *
 * ── Why this module exists at all ────────────────────────────────────────────
 * The founder asked, twice, for panels to be CLOSED on startup — the second time
 * naming this panel, which "opens itself and covers a large part of the
 * right-hand viewport". `panelDefaults.ts` already had the row and already had
 * the answer written down, and its answer was a REFUSAL: the panel stayed OPEN on
 * the canvas because *"this lane has not measured a canvas-phase reopen route for
 * it (a named gap, L-1025) — closing a panel whose route back is unproven is
 * exactly the defect C82 §1.1 forbids"*.
 *
 * That refusal was correct. So the fix is to BUILD the missing route rather than
 * to relax the rule, and this file is that route. With it in place the registry
 * row flips to `closed` and L-1025 closes — the panel is one click away, never
 * gone. Nothing here special-cases View Properties: the mechanism is
 * `panelDefaults` + `phaseChrome`, and this is one consumer of it. The next panel
 * that wants to default closed adds a row and a launcher, not a boolean.
 *
 * ── Placement is MEASURED, not chosen ───────────────────────────────────────
 * The bottom-right corner is already occupied: `PerformanceModePanel.ts` mounts
 * `#perf-mode-trigger`, a 36 × 36 button at `bottom:80px; right:14px`. This
 * button therefore takes the next slot UP in the same stack — `bottom:122px;
 * right:14px`, 36 × 36, same right edge, 6 px apart — so the two read as one
 * corner cluster and neither displaces the other (C06 §7.2, no overlap).
 *
 * ⚠ RECORDED, NOT SILENTLY COPIED: `#perf-mode-trigger` is painted
 * `rgba(18,24,38,0.92)` — near-black, which is against this product's stated
 * white+purple palette, and a third panel idiom next to the glass one. This
 * button matches its GEOMETRY exactly (so the stack lines up) and takes its
 * COLOUR from the token layer instead of copying a treatment that should not
 * spread. Converting the ⚡ trigger is that lane's call, not this one's; it is
 * named here so the divergence is a known one rather than a new one.
 *
 * ── Phase ───────────────────────────────────────────────────────────────────
 * ABSENT on `onboarding-globe`, and that is the whole reconciliation of the two
 * founder rules that could otherwise contradict each other:
 *   · on PRYZM Earth, View Properties must be HIDDEN ENTIRELY → so must its
 *     launcher. A button that opens a panel which should not exist in that phase
 *     is worse than no button.
 *   · on the canvas it is CLOSED BUT OPENABLE → the launcher is present.
 * Both come from the one table, which is why they cannot drift apart.
 *
 * Contracts: C82 §1.1 (absence legal, unreachability not) · C43 SC 2.5.8 (the
 * button is 36 × 36, above the 24 px floor, with a visible focus ring) ·
 * C06 §6 (colour from `styles/tokens.ts`) · C06 §7.2 (declared screen region).
 */

import {
    isPanelOpen,
    onAppPhaseChanged,
    panelAbsent,
    setPanelOpen,
} from './panelDefaults';

/** The element id, mirrored in `phaseChrome.PHASE_CHROME_SELECTORS`. */
export const VIEW_PROPERTIES_LAUNCHER_ID = 'pryzm-view-properties-launcher';

/**
 * The `data-testid`, mirrored in the registry row's `reopen` field. They must
 * agree: the registry promises this control exists, and the spec reads that
 * promise, so a typo here is a promise the product does not keep.
 */
export const VIEW_PROPERTIES_LAUNCHER_TESTID = 'view-properties-launcher';

/**
 * Geometry of `#perf-mode-trigger`, read from PerformanceModePanel.ts rather than
 * guessed. Changing that button's size or offset without changing these will make
 * the stack ragged — which is why they are named constants with a source, not
 * literals sprinkled into a cssText string.
 */
const PERF_TRIGGER_BOTTOM_PX = 80;
const STACK_BUTTON_PX = 36;
const STACK_GAP_PX = 6;
const STACK_RIGHT_PX = 14;

let el: HTMLButtonElement | null = null;
let disposePhase: (() => void) | null = null;

function paint(btn: HTMLButtonElement): void {
    const open = isPanelOpen('view-properties');
    btn.setAttribute('aria-pressed', open ? 'true' : 'false');
    btn.style.background = open ? 'var(--app-accent, #6600FF)' : 'var(--app-panel-glass, rgba(255,255,255,0.92))';
    btn.style.color = open ? 'var(--app-panel-bg, #ffffff)' : 'var(--app-text, #1a2035)';
    btn.style.borderColor = open ? 'var(--app-accent, #6600FF)' : 'var(--app-border, #dde3f0)';
    btn.title = open
        ? 'Hide view properties (Environment & Camera)'
        : 'View properties — Environment & Camera';
}

function build(): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = VIEW_PROPERTIES_LAUNCHER_ID;
    btn.setAttribute('data-testid', VIEW_PROPERTIES_LAUNCHER_TESTID);
    btn.setAttribute('aria-label', 'View properties — Environment & Camera');
    // A glyph, not an icon font: this file must not add a dependency to place one
    // button. ◑ reads as "sun / shading", which is what the panel configures.
    btn.textContent = '◑';
    btn.style.cssText = [
        'position:fixed',
        `bottom:${PERF_TRIGGER_BOTTOM_PX + STACK_BUTTON_PX + STACK_GAP_PX}px`,
        `right:${STACK_RIGHT_PX}px`,
        // Below the onboarding overlay's 2147483000 on purpose: during onboarding
        // this button is not mounted at all, and on the canvas nothing should sit
        // above the wizard-class layer. 1200 matches #perf-mode-trigger exactly, so
        // the two cannot fight each other for the corner.
        'z-index:1200',
        `width:${STACK_BUTTON_PX}px`,
        `height:${STACK_BUTTON_PX}px`,
        'border-radius:8px',
        'border:1px solid var(--app-border, #dde3f0)',
        'font-size:16px',
        'line-height:1',
        'cursor:pointer',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'backdrop-filter:blur(15px) saturate(1.35)',
        '-webkit-backdrop-filter:blur(15px) saturate(1.35)',
        'box-shadow:var(--app-shadow-panel, 0 8px 32px rgba(30,50,120,0.13))',
        'transition:background 0.15s,color 0.15s,border-color 0.15s',
    ].join(';');
    paint(btn);

    btn.addEventListener('click', () => {
        const next = !isPanelOpen('view-properties');
        // The MODEL is the only thing written here. `phaseChrome` subscribes to
        // `onPanelStateChanged` and does the DOM — this module owns no panel nodes,
        // for the same reason `panelDefaults` owns none.
        setPanelOpen('view-properties', next);
        paint(btn);
        console.log(`[view-properties-launcher] view properties → ${next ? 'open' : 'closed'}.`);
    });
    btn.addEventListener('focus', () => {
        btn.style.outline = '2px solid var(--app-accent, #6600FF)';
        btn.style.outlineOffset = '2px';
    });
    btn.addEventListener('blur', () => { btn.style.outline = 'none'; });

    return btn;
}

/**
 * Mount / unmount the launcher for the CURRENT phase, and keep doing so as the
 * phase changes. Idempotent — safe to call from more than one boot path, which
 * matters because the thing this repo gets wrong most often is a surface that is
 * authored and then reached by nothing.
 *
 * Returns a disposer.
 */
export function installViewPropertiesLauncher(): () => void {
    const apply = (): void => {
        if (typeof document === 'undefined' || !document.body) return;
        // SKIP-MOUNT, not hide: on the globe the node is never created, so it is not
        // in the accessibility tree and cannot be tabbed to.
        if (panelAbsent('view-properties-launcher')) {
            if (el?.parentNode) el.parentNode.removeChild(el);
            el = null;
            return;
        }
        if (el?.isConnected) { paint(el); return; }
        el = build();
        document.body.appendChild(el);
    };

    apply();
    if (!disposePhase) disposePhase = onAppPhaseChanged(() => apply());

    return () => {
        try { disposePhase?.(); } catch { /* gone */ }
        disposePhase = null;
        if (el?.parentNode) el.parentNode.removeChild(el);
        el = null;
    };
}

/** TEST-ONLY: forget the module-level node/subscription between specs. */
export function __resetViewPropertiesLauncherForTests(): void {
    try { disposePhase?.(); } catch { /* gone */ }
    disposePhase = null;
    if (el?.parentNode) el.parentNode.removeChild(el);
    el = null;
}
