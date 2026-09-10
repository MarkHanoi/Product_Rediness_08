// §ENVELOPE-TOOL-ON-THE-SITE-VIEWS (L-13017 · C58 §1.19 · STR §26.4, founder 2026-09-06)
//
// THE FOUNDER'S SENTENCE, AND WHAT IT IS ACTUALLY ASKING FOR
// ---------------------------------------------------------
//     *"for now also I am not able yet to create the envelope on the 2D site view / 3D site — it
//      should OPEN A PANEL LIKE WHEN YOU CREATE A WALL OR SLAB WITH THE TOOLS."*
//
// ⭐ THE MECHANICS WERE ALREADY THERE, AT EFFORT ZERO — WHAT WAS MISSING WAS THE ENTRY POINT.
// `spaceEnvelope.batch.create` has NO view gating, and the panel that dispatches it
// (`mountParcelLawEnvelopeAuthoring`) reads everything it needs off the runtime and commits
// through the bus. It works perfectly with 3D Site open. It was simply only ever mounted inside
// the Parcel Law TAB, so on the two views the founder actually authors on there was no way to
// reach it. That is the [[authored-but-unwired-is-the-bottleneck]] shape: audit REACHABILITY, not
// existence.
//
// ⛔ ONE COMMAND PATH, TWO INPUT SURFACES (P6 · C58 §1.19 clause 1).
// This module carries NO creation logic of its own. It mounts the SAME panel, which builds the
// SAME `buildEnvelopeAuthoringPlan` and dispatches the SAME `bus.executeCommand(plan.command,
// plan.payload)`. Two authoring implementations WILL drift, and the 2D plan draws the AUTHORING
// frame de-rotated by θ from the 2D map BY DESIGN (ADR-0115), so a hand-rolled second path would
// carry a frame bug on top of the drift. C58 §1.19 clause 1 states this as a normative rule:
// *"Authoring is a ROUTE, NOT A MODE … committed through the command bus … It is NOT a bespoke
// drawing surface bolted to one view, and it is NOT a second envelope pipeline."*
//
// ── WHY A FLOATING PANEL AND NOT A NEW BAR ─────────────────────────────────────────────────
// The founder photographed THREE view switchers over one pane the same day (L-13015), so a lane
// that answers "I cannot reach this" by minting a fourth floating bar has traded one complaint
// for another. This is ONE panel with ONE close affordance, opened by an action that already has
// a home (`gisActionRegistry`: `site.create-envelope`) and by the 2D map's own existing tool
// strip. It is a SINGLETON — a second open re-targets the one panel rather than stacking a
// second, the same §MAP-IS-A-SINGLETON-TOO (L-12992) rule the map itself follows.
//
// ── WHAT IT DELIBERATELY DOES NOT DO, STATED SO IT IS NOT MISTAKEN FOR DONE ────────────────
// ⚠ THE ARROW FACE-DRAG the founder names in L-13007 (*"it should STRETCH THE ENVELOPE LIVE WITH
// THE ARROWS"*) is the EDIT half and is NOT here. It is not a stub and it is not pretended: the
// panel says what it extrudes and where that ring came from, in its own words, so a user is never
// left guessing which geometry they just committed.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ §ENVELOPE-DRAW C4 (lane ENVELOPE-DRAW-2, 2026-09-07) — DRAWING THE PERIMETER IS NOW *HERE*
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The paragraph above used to open *"Direct manipulation — drawing the footprint vertex-by-vertex
// on the map — is NOT here"*, and that half is what this commit closes. The founder's top-priority
// sentence, stated three times: *"THE MOST IMPORTANT IS THE CAPACITY TO CREATE — DRAW — DESIGN
// BUILDABLE ENVELOPES IN THE 2D SITE VIEW AND 3D SITE VIEW."*
//
// ⛔ AND THE DRAW BUTTON STILL CARRIES NO GESTURE, NO PROJECTION AND NO COMMAND. It calls
// `armEnvelopeDraw()`, which arms every site surface attached to the registry; the gesture lives in
// `siteEnvelopeDrawArming.ts` over `BoundaryPathAuthor`, and the ring it finishes lands in the ONE
// session slot the panel below already reads as its first footprint route. This module stays what
// its header says it is: an ENTRY POINT.
//
// ⭐ WITH NO ADAPTER ATTACHED THE BUTTON REFUSES OUT LOUD, AND THAT IS THE CORRECT INTERMEDIATE
// STATE — NOT A STUB. `ENVELOPE_DRAW_NO_SURFACE_REASON` names why nothing armed AND the route back
// (open the site-authoring split; you can still extrude the permitted footprint from this panel).
// A button that silently did nothing would be L-1187 again; a button hidden until the adapters land
// would hide the milestone from the person who asked for it.
//
// ⚠ AND THE TOOL IS NEVER GATED ON AN ENVELOPE EXISTING (C58 §1.20). The action is reachable
// whether or not a rule pack solved anything: the panel's own `FootprintSource` ladder already
// distinguishes "the permitted ring", "your own fitted plate", "your own study" and "nothing yet,
// and here is how to supply one" — four states, four sentences, no dead ends. A `null` envelope
// is a STATE TO RENDER, not a branch to skip (§1.20 clause 4).
//
// P4 — no `(window as any)`; the host is passed in. C08 §3.1 — createElement + textContent only.

import { trace } from '@opentelemetry/api';
import {
    mountParcelLawEnvelopeAuthoring,
    type ParcelLawEnvelopeAuthoringHandle,
} from '../analysis/parcelLawEnvelopeAuthoring';
// §ENVELOPE-DRAW C4 — the arm/disarm pair and the status the button paints itself from. ⛔ Both
// halves in the same import for the same reason they live in the same module: L-7801.
import {
    armEnvelopeDraw,
    disarmEnvelopeDraw,
    getEnvelopeDrawStatus,
    subscribeEnvelopeDrawStatus,
    setEnvelopeDrawMode,
    subscribeEnvelopeDrawMode,
    resolveEnvelopeDrawMode,
    ENVELOPE_DRAW_BAR_MODES,
    ENVELOPE_DRAW_NO_SURFACE_REASON,
} from './siteEnvelopeDrawArming';
// §ENVELOPE-MODE-BAR (L-13152) — the ONE persistent in-viewport mode strip, reused. ⛔ Not a copy:
// this is the shared successor to the four hand-maintained HUDs, already reused by pool, balcony and
// boundary-line. See `ENVELOPE_DRAW_BAR_MODES` for why the pills are declared beside the mode store.
import { DrawingModeBar } from '../DrawingModeBar';
// §ENVELOPE-CARD-FOLDS (L-13249) — the ONE disclosure these floating Site panels use.
import { buildPanelFold } from './panelFold';
import {
    getDrawnEnvelopeFootprint,
    subscribeDrawnEnvelopeFootprint,
} from './drawnEnvelopeFootprintState';
// ⭐⭐ §ANOTHER-ENVELOPE-IS-THE-SAME-ROSTER (L-13304) — THE MULTI-BUILDING FLOW, REUSED VERBATIM.
// ⛔ NOT A SECOND IMPLEMENTATION, and the temptation to write one is the single defect shape this
// repository fights hardest. `masterPlanSection` IS the roster the founder is describing — Add
// another profile / per-profile Remove / Clear all / one "Create all blocks" through ONE command
// and ONE Ctrl+Z — and it reads and writes the SAME `drawnEnvelopeFootprintState` profile list this
// panel's own draw already appends to. Mounting it here gives the roster a second HOST, not a
// second FLOW: whatever the user does on either surface, the other reads it on its next repaint,
// because there is only one store underneath both. See `openSiteEnvelopeTool` for the wiring.
import {
    defaultMasterPlanSectionDeps,
    mountMasterPlanSection,
    type MasterPlanSectionHandle,
} from './masterPlanSection';

const _tracer = trace.getTracer('pryzm.site.siteEnvelopeTool');

/** The floating panel's root. One name, so a surface and a test agree. */
export const SITE_ENVELOPE_PANEL_TESTID = 'site-envelope-tool-panel';
/** §ENVELOPE-CARD-FOLDS (L-13249) — the lede disclosure. Also its key in the shared fold memory. */
export const SITE_ENVELOPE_LEDE_FOLD_TESTID = 'site-envelope-lede-fold';
/** The tool BUTTON a site surface renders to arm this. */
export const SITE_ENVELOPE_TOOL_BTN_TESTID = 'site-envelope-tool-btn';
/** The panel's close affordance. */
export const SITE_ENVELOPE_CLOSE_TESTID = 'site-envelope-tool-close';
/** §ENVELOPE-DRAW C4 — the button that arms the perimeter draw on every attached site surface. */
export const SITE_ENVELOPE_DRAW_BTN_TESTID = 'site-envelope-draw-btn';
/**
 * §ENVELOPE-DRAW C4 — the line under that button. It carries, in order of what is true: the
 * REFUSAL when no surface armed, the live hint while drawing, or what was drawn. `data-draw-state`
 * says which — `refused` / `armed` / `drawn` / `idle`.
 */
export const SITE_ENVELOPE_DRAW_STATUS_TESTID = 'site-envelope-draw-status';

/**
 * §ANOTHER-ENVELOPE-IS-THE-SAME-ROSTER (L-13304) — the fold holding the shared master-plan roster.
 * Also its key in the shared fold memory, so the user's open/closed choice survives a re-target.
 */
export const SITE_ENVELOPE_ROSTER_FOLD_TESTID = 'site-envelope-roster-fold';

const VIOLET = '#6600FF';

/**
 * ⭐⭐ §THE-TOOL-LIVES-IN-THE-PANEL (L-13308, founder 2026-09-10) — HOW THIS PANEL PRESENTS.
 *
 * FOUNDER, defect 2 of 5: *"Also this information should be part of the main panel — check image
 * 4."* Image 4 is the right-hand SITE panel at Massing options.
 *
 * ⛔ TWO PRESENTATIONS, ONE PANEL — never two panels. The singleton, the command path, the
 * subscriptions and the roster are identical on both; what differs is whether the root floats over
 * a viewport or flows inside a card that already has its own frame, scroll and close affordance.
 * Drawing a floating card INSIDE another card gives the user a box in a box with two ✕ buttons,
 * which is why this is a mode rather than "just append it somewhere else".
 */
export interface SiteEnvelopeToolPresentation {
    /**
     * TRUE ⇒ the host is a PANEL SLOT: flow in place, full width, no shadow, no ✕.
     * FALSE / omitted ⇒ the historical floating card over a positioned viewport host.
     */
    readonly inline?: boolean;
}

export interface SiteEnvelopeToolHandle {
    readonly element: HTMLElement;
    /** Is this panel currently mounted and visible? A READING, not a remembered command. */
    isOpen(): boolean;
    close(): void;
}

/**
 * The ONE live panel, or null. A SINGLETON on purpose — see the header. Module-local, exactly as
 * `siteGeometryHighlight`'s store is, and for the same reason: a surface that opened a second copy
 * would have two panels reading one runtime and disagreeing on the next repaint.
 */
let live: {
    root: HTMLElement;
    authoring: ParcelLawEnvelopeAuthoringHandle;
    /** §ENVELOPE-DRAW C4 — the draw-status and drawn-ring subscriptions this panel opened. */
    unsubs: readonly (() => void)[];
    /** Repaint the draw row (button pressed state + status line) from the READING. */
    paintDraw: () => void;
    /**
     * §ENVELOPE-MODE-BAR (L-13152) — the mode strip, up only while the draw is ARMED.
     * ⛔ It hangs off the panel singleton so `closeSiteEnvelopeTool` takes it down with everything
     * else. A strip that outlived its panel is L-7801's shape wearing different chrome, and
     * `DrawingModeBar` appends to `document.body`, so nothing else would ever remove it.
     */
    modeBar: DrawingModeBar;
    /**
     * §ANOTHER-ENVELOPE-IS-THE-SAME-ROSTER (L-13304) — the shared master-plan roster, mounted into
     * this panel. ⛔ It hangs off the singleton for the same reason `modeBar` does: it opens its own
     * store subscriptions, and a roster that outlived its panel would keep repainting a detached
     * tree forever. `closeSiteEnvelopeTool` disposes it.
     */
    roster: MasterPlanSectionHandle | null;
    /** §THE-TOOL-LIVES-IN-THE-PANEL (L-13308) — repaint the root + close button for a host. */
    applyPresentation: (p: SiteEnvelopeToolPresentation) => void;
} | null = null;

/** Whether the tool panel is open right now. Surfaces paint their button's pressed state from it. */
export function isSiteEnvelopeToolOpen(): boolean {
    return live !== null && live.root.isConnected;
}

/** Close the panel, if one is open. Idempotent; never throws. */
export function closeSiteEnvelopeTool(): void {
    const current = live;
    live = null;
    if (!current) return;
    // ⛔ §ENVELOPE-DRAW C4 — CLOSING THE PANEL DISARMS THE DRAW. L-7801 is exactly this: the chrome
    // came down and the handler stayed live, so the next click on the map kept authoring. The
    // FINISHED drawing survives (`disarmEnvelopeDraw` only drops the in-progress ring), so
    // re-opening the panel still finds the perimeter the user drew.
    try { disarmEnvelopeDraw(); } catch { /* a disarm must not block the close */ }
    // §ENVELOPE-MODE-BAR — UNCONDITIONAL. `dismiss()` is idempotent, and a strip left on
    // `document.body` after its panel is gone has no owner to remove it.
    try { current.modeBar.dismiss(); } catch { /* a stranded strip must not block the close */ }
    for (const un of current.unsubs) {
        try { un(); } catch { /* teardown is best-effort */ }
    }
    // §ANOTHER-ENVELOPE-IS-THE-SAME-ROSTER (L-13304) — the roster's subscriptions are ITS OWN, so
    // it is disposed here rather than left to the `unsubs` loop above. ⛔ The PROFILES SURVIVE by
    // design: they live in `drawnEnvelopeFootprintState`, not in the section, so closing the panel
    // never discards work the user has drawn — re-opening (or the Parcel Law tab) finds the same
    // roster. That is the whole reason this is one store with two hosts.
    try { current.roster?.dispose(); } catch { /* a disposed roster must not block the close */ }
    try { current.authoring.dispose(); } catch { /* a disposed panel must not block the close */ }
    try { current.root.remove(); } catch { /* already detached */ }
    console.log('[site] §ENVELOPE-TOOL-ON-THE-SITE-VIEWS panel closed.');
}

/**
 * Open (or re-target) the envelope authoring panel over `parent`.
 *
 * ⭐ RE-TARGET, NEVER RE-MOUNT — the §MAP-IS-A-SINGLETON-TOO (L-12992) rule. Opening the tool from
 * the 2D map's strip and then from the GIS rail must move the ONE panel, not stack a second: two
 * panels over one runtime would each hold their own "what the user last typed" and the second
 * create would silently discard the first's entry. `appendChild` MOVES an already-parented node.
 *
 * @param parent a POSITIONED host (`position: relative|absolute`) — the panel is absolutely placed.
 */
export function openSiteEnvelopeTool(
    parent: HTMLElement,
    presentation: SiteEnvelopeToolPresentation = {},
): SiteEnvelopeToolHandle {
    const span = _tracer.startSpan('pryzm.site.openSiteEnvelopeTool');
    try {
        if (live && live.root.isConnected) {
            if (live.root.parentElement !== parent) {
                parent.appendChild(live.root);
                console.log('[site] §ENVELOPE-TOOL-ON-THE-SITE-VIEWS panel re-targeted (ONE panel, no second mount).');
            }
            // §THE-TOOL-LIVES-IN-THE-PANEL (L-13308) — a re-target can cross presentations (the
            // Site panel's card, then the 2-D map's own strip). The chrome has to follow the host,
            // or the panel arrives floating inside a card, or flat over a viewport with no frame.
            live.applyPresentation(presentation);
            live.authoring.repaint();
            live.paintDraw();
            // §ANOTHER-ENVELOPE-IS-THE-SAME-ROSTER — a re-target is a re-read. The roster may have
            // gained profiles from the Parcel Law tab while this panel sat on another view.
            try { live.roster?.refresh(); } catch { /* a stale roster must not block the re-target */ }
            const held = live;
            return {
                element: held.root,
                isOpen: () => isSiteEnvelopeToolOpen(),
                close: closeSiteEnvelopeTool,
            };
        }

        const root = document.createElement('div');
        root.setAttribute('data-testid', SITE_ENVELOPE_PANEL_TESTID);
        // Declared here so `applyPresentation` below can hide it; wired further down.
        const closeBtn = document.createElement('button');

        // ═════════════════════════════════════════════════════════════════════════════════════
        // ⭐⭐ §THE-TOOL-LIVES-IN-THE-PANEL (L-13308) — TWO PRESENTATIONS OF THE ONE PANEL
        // ═════════════════════════════════════════════════════════════════════════════════════
        // FOUNDER, defect 2 of 5: *"Also this information should be part of the main panel — check
        // image 4."* Image 4 is the SITE panel at Massing options. Pressing "Draw my own massing
        // on the view" there produced a floating card over the viewport, holding state that
        // belongs to the card he pressed — two surfaces to track, and nothing saying they are one
        // thing.
        //
        // ⛔ THIS IS A MODE, NOT A SECOND PANEL. The singleton, the command path, the roster and
        // every subscription are identical on both arms. Only the CHROME differs, and it has to:
        // an absolutely-positioned card with its own shadow and its own ✕, drawn INSIDE another
        // card that already has a frame and a close control, is a box in a box with two ways to
        // dismiss it. `data-presentation` says which arm rendered, so a surface and a test agree.
        const applyPresentation = (pres: SiteEnvelopeToolPresentation): void => {
            const inline = pres.inline === true;
            root.setAttribute('data-presentation', inline ? 'inline' : 'floating');
            root.style.cssText = inline
                ? [
                    // ⭐ FLOWS IN PLACE. No `position`, no `top/right`, no `z-index`, no shadow —
                    // the host card supplies all four, and repeating them here is what produced
                    // the second window. No `max-height`/`overflow` either: the Site panel is
                    // already the scroll container, and a nested scroller traps the wheel.
                    'display:block', 'width:100%', 'box-sizing:border-box', 'margin-top:6px',
                    `border:1px solid ${VIOLET}`, 'border-radius:8px', 'background:#ffffff',
                    'padding:9px 10px 10px', 'font:12px/1.45 system-ui, sans-serif',
                    'color:#2c2740', 'min-width:0', 'max-width:100%',
                ].join(';')
                : [
                    // ⭐⭐ §ENVELOPE-CARD-FOLDS (L-13249) — FOUNDER, three times: *"we need to make
                    // is 20% of the space with drop down menus that the usser opens on deman and
                    // the card expands - it is too large"*.
                    //
                    // ⚠ "20%" IS READ AS 20% OF THE PANE THIS PANEL FLOATS OVER, not of the whole
                    // window, and the difference is not pedantry: this card is absolutely
                    // positioned inside the RIGHT (3-D) pane of a split, so on his 2 037 px screen
                    // a window-relative 20% would be ~407 px — WIDER than the 340 px he called too
                    // large. `20%` of the pane, clamped, is the reading under which his sentence
                    // and his screenshot agree.
                    //
                    // ⛔ THE CLAMPS ARE NOT DECORATION. `min(…)` alone would let a wide monitor
                    // make it huge again and a narrow pane crush it to unreadable; `max(240px, …)`
                    // keeps the storey rows and the create control legible, and 340 px stays the
                    // ceiling so this can only ever shrink from what shipped. The 32 px
                    // subtraction is the existing gutter.
                    'position:absolute', 'top:64px', 'right:16px',
                    'width:clamp(240px, 20%, 340px)', 'max-width:calc(100% - 32px)',
                    'max-height:calc(100% - 96px)', 'overflow:auto', 'z-index:40',
                    'background:#ffffff', `border:1px solid ${VIOLET}`, 'border-radius:10px',
                    'box-shadow:0 6px 22px rgba(60,52,40,0.22)', 'padding:12px 13px 13px',
                    'font:12px/1.45 system-ui, sans-serif', 'color:#2c2740', 'pointer-events:auto',
                ].join(';');
            // ⛔ THE ✕ IS HIDDEN INLINE, NOT REMOVED. Two close controls on one card is the box-in
            // -a-box tell, and the card's own disclosure already collapses this. It must stay in
            // the DOM because a later re-target back to the floating arm needs it, and because
            // `SITE_ENVELOPE_CLOSE_TESTID` is a contract other surfaces bind to.
            closeBtn.hidden = inline;
        };

        const head = document.createElement('div');
        head.style.cssText = 'display:flex;align-items:flex-start;gap:8px;margin-bottom:6px;';
        const title = document.createElement('div');
        title.style.cssText = `flex:1;font-weight:700;font-size:12.5px;color:${VIOLET};`;
        title.textContent = 'Envelope tool';
        closeBtn.type = 'button';
        closeBtn.setAttribute('data-testid', SITE_ENVELOPE_CLOSE_TESTID);
        closeBtn.setAttribute('aria-label', 'Close the envelope tool');
        closeBtn.textContent = '×';
        closeBtn.style.cssText = [
            'appearance:none', 'border:none', 'background:transparent', 'cursor:pointer',
            `color:${VIOLET}`, 'font:600 17px/1 system-ui, sans-serif', 'padding:0 2px',
        ].join(';');
        closeBtn.addEventListener('click', () => closeSiteEnvelopeTool());
        head.appendChild(title);
        head.appendChild(closeBtn);
        root.appendChild(head);
        // §THE-TOOL-LIVES-IN-THE-PANEL (L-13308) — paint the chrome now that the ✕ exists. ⛔ It
        // cannot run at root creation: `applyPresentation` reads `closeBtn`, and a painter that
        // ran before its subject existed is the §L-13002 shape (a reader running before the write
        // it depends on).
        applyPresentation(presentation);

        // ⭐ THE HONEST LEDE. It says which half of the founder's ask this is, so "create works and
        // drag does not yet" is something he READS rather than discovers. C58 §1.19 clause 3 also
        // requires that an authored envelope never badge itself as a solved one — the panel below
        // already labels its own footprint source, and this line names the object being made.
        // ⭐ §ENVELOPE-CARD-FOLDS (L-13249) — THE LEDE FOLDS. It is the single largest block of
        // prose on a cold arrival and it explains rather than reports: nobody needs to re-read
        // "this is design intent, not what the law permits" on every open. ⛔ NOT DELETED — the
        // C58 §1.19 clause 3 point it makes (an authored envelope is never a solved one) is why
        // the card is honest, so it collapses to a summary the reader can open, and the fold
        // remembers what they chose for this session.
        const ledeFold = buildPanelFold({
            id: SITE_ENVELOPE_LEDE_FOLD_TESTID,
            summary: 'What this tool makes',
            open: false,
        });
        const lede = document.createElement('div');
        lede.style.cssText = 'font-size:10.5px;color:#6b6480;';
        lede.textContent =
            'Creates a LEVEL envelope — your own design intent, not a statement of what the law '
            + 'permits. It is committed through the same command the Parcel Law tab uses, so there '
            + 'is one envelope and one undo.';
        // ⛔ ONE SENTENCE WAS DROPPED, NOT SHORTENED, AND IT WAS FALSE: *"Dragging a face to
        // stretch it is not built yet."* Face drag SHIPPED (§ENVELOPE-FACE-DRAG-PER-LEVEL,
        // L-13236) and the 3-D Site installs it — this very panel's own console line says
        // *"the 3D Site is now a FACE-DRAG surface"*. `roomProgrammePanel.ts` had its copy of
        // that claim corrected when the gesture landed; this one was missed, so the card was
        // telling the founder a shipped feature did not exist. Removed as a CORRECTION.
        ledeFold.body.appendChild(lede);
        root.appendChild(ledeFold.el);

        // ── §ENVELOPE-DRAW C4 — THE DRAW ROW ──────────────────────────────────────────────────
        // One button and one sentence. The button ARMS; the sentence says what is true right now,
        // and never invents a fourth state: refused / armed / drawn / idle, painted from the
        // registry's own READING (`getEnvelopeDrawStatus`), never from a flag this module remembers.
        const drawRow = document.createElement('div');
        drawRow.style.cssText = 'margin-bottom:8px;';
        const drawBtn = document.createElement('button');
        drawBtn.type = 'button';
        drawBtn.setAttribute('data-testid', SITE_ENVELOPE_DRAW_BTN_TESTID);
        drawBtn.textContent = 'Draw the perimeter on this view';
        drawBtn.title =
            'Click corner by corner on the site view; double-click or Enter closes the perimeter, '
            + 'Backspace removes the last corner, Esc cancels. The height comes from the number of '
            + 'floor levels below — a plan map has no vertical axis.';
        const drawStatus = document.createElement('div');
        drawStatus.setAttribute('data-testid', SITE_ENVELOPE_DRAW_STATUS_TESTID);
        drawStatus.setAttribute('data-draw-state', 'idle');
        drawStatus.style.cssText = 'margin-top:4px;font-size:9.5px;line-height:1.45;color:#6b6480;';
        drawRow.appendChild(drawBtn);
        drawRow.appendChild(drawStatus);
        root.appendChild(drawRow);

        /** The last refusal, held until the next arm — a refusal the user never read is a no-op. */
        let refusal: string | null = null;

        // ═════════════════════════════════════════════════════════════════════════════════
        // ⭐⭐ §ENVELOPE-MODE-BAR (L-13152) — THE PRYZM MODE STRIP, MOUNTED FOR THIS GESTURE
        // ═════════════════════════════════════════════════════════════════════════════════
        // The founder: *"I need the draw tool as you see on the image 4 - as we have in pryzm"*, and
        // earlier *"i would like the panel with curved - stright line - orothogonal etc.. as we have
        // with the slab / wall tool"*.
        //
        // ⛔ REUSED, NOT REBUILT. `DrawingModeBar` is the shared strip that already replaced four
        // per-tool HUD copies and is already driven by pool, balcony and boundary-line. ⛔ AND IT IS
        // NON-DESTRUCTIVE BY CONTRACT: `onSelect` writes the mode store and NOTHING else — no
        // re-arm — which is why switching mode mid-draw keeps the corners already placed. That is
        // the exact defect the component was built to remove, and `setEnvelopeDrawMode`'s own body
        // already honours it (it drops only a half-finished loop anchor or arc midpoint).
        const modeBar = new DrawingModeBar();

        /**
         * ⛔ THE STRIP CAN BE REFUSED, AND A SILENT REFUSAL IS THE WHOLE FAILURE MODE THIS LANE
         * EXISTS TO CLOSE. `DrawingModeBar.show` calls `refuseElementAuthoring` (§AUTHORING-CONTEXT-
         * GATE, L-5103), which blocks the `onboarding-globe` phase — and the phase only latches to
         * `'canvas'` when a BIM view is activated. A user who reaches the 3-D Site and this panel
         * without ever opening a BIM view therefore gets NO STRIP AND NO SENTENCE, which is exactly
         * *"I still cannot see the mode bar"* with nothing in the UI to act on
         * ([[committed-is-not-reachable]]).
         *
         * ⛔ THE GATE IS NOT BYPASSED. It exists to keep a stray strip off the parcel map, and this
         * lane does not get to punch a hole in a safety gate on its way past. What changes is that
         * the refusal becomes VISIBLE: the draw row says the modes are keyboard-only right now and
         * names the six keys, so the gesture still works and the user knows why the pills are absent.
         */
        let modeBarRefused = false;

        /** Raise the strip when the draw is armed, take it down when it is not. Idempotent. */
        const paintModeBar = (): void => {
            const armed = getEnvelopeDrawStatus().armed;
            if (!armed) { modeBar.dismiss(); modeBarRefused = false; return; }
            if (modeBar.isVisible()) { modeBar.setMode(resolveEnvelopeDrawMode()); return; }
            modeBar.show({
                // ⛔ THE WALL'S OWN WORD, NOT A SECOND ONE — the same note `ToolsAreaLayout` carries
                // at its own two call sites. `.wdh-mode-lbl` uppercases it, which is why the
                // founder's screenshot reads "MODE:".
                label: 'Mode:',
                modes: ENVELOPE_DRAW_BAR_MODES,
                initialMode: resolveEnvelopeDrawMode(),
                // ⛔ THE STORE, AND ONLY THE STORE (§05-BIM-UI-ARCHITECTURE §7.1). The gesture reads
                // `resolveEnvelopeDrawMode()` fresh on every click, so this lands on the NEXT corner
                // with no re-arm and no loss of the current perimeter.
                onSelect: (id) => setEnvelopeDrawMode(id),
                // ⚠ The wall bar's default is *"ESC to finish"*, which is WRONG here and dangerously
                // so: on this gesture Esc CANCELS and Enter finishes. A shared component with a
                // per-tool hint is exactly why `escHint` exists.
                escHint: 'ENTER closes · ESC cancels',
                // ⭐⭐ §SITE-AUTHORING-IS-NOT-BIM-AUTHORING (L-13303) — THE FIX FOR THE ADMISSION
                // BELOW. Founder: *"i want exactly what I have when I create a slab — the same —
                // as the shape of the perimeter is similar."* He had the keyboard fallback and no
                // pills, on EVERY attempt, and the reason was not that the strip was unbuilt.
                //
                // ⛔ MEASURED, NOT GUESSED: `appPhase()` is `'onboarding-globe'` for the WHOLE
                // site-authoring session — `setAppPhase('canvas')` fires only when onboarding
                // DISPOSES or a BIM view activates (recorded twice in this repo by L-13297, after
                // it regressed his massing panel on the same wrong model of that phase's
                // lifetime). This gesture runs ONLY on the 2-D Site Map and the 3-D Site. So the
                // phase clause refused this strip on 100% of its surfaces and 0% of anyone
                // else's: it was dead by construction, which is why the sentence under the button
                // had to exist at all.
                //
                // ⛔ THE GATE IS STILL ASKED AND IS STILL CLOSED FOR THE THING IT WAS BUILT FOR.
                // `'bim-element'` is the default, so WA / CW / DO / SL on the parcel map at step 3
                // of 4 — the founder's original L-5103 report — refuse exactly as before. What
                // this declares is that a SITE perimeter draw is not a BIM element creation, and
                // it is honest: `armEnvelopeDraw()` has already succeeded above (it refuses on its
                // own when no site surface is attached), so a strip only ever rises over a gesture
                // the user explicitly armed on a surface that exists.
                gestureKind: 'site-authoring',
            });
            // ⛔ ASKED, NOT ASSUMED. `show()` returns void and refuses by returning early, so the
            // ONLY way to know whether the strip is on screen is to read it back.
            modeBarRefused = !modeBar.isVisible();
            if (modeBarRefused) {
                // ⚠ SINCE L-13303 THIS SHOULD NEVER FIRE — `'site-authoring'` is available in every
                // phase. It is KEPT, not deleted, and that is deliberate: `show()` refuses by
                // returning early and returns `void`, so the only way to know the strip is on
                // screen is to read it back. If a future arm is added to the gate, the user gets a
                // sentence and the console gets a line instead of the silent absence this lane
                // spent its first hour diagnosing. A refusal nobody can see is the whole defect.
                console.warn(
                    '[site] §ENVELOPE-MODE-BAR the mode strip was REFUSED by the authoring-context gate '
                    + 'even though this gesture declares gestureKind:"site-authoring" (L-13303), which is '
                    + 'available in EVERY phase. A NEW arm has been added to elementAuthoringAvailability. '
                    + 'The six draw modes stay reachable by keyboard — L / O / C / Q / I / E — and the draw '
                    + 'row says so.',
                );
            }
        };

        const paintDraw = (): void => {
            // §ENVELOPE-MODE-BAR — FIRST, not last: the armed sentence below reports whether the strip
            // made it on screen, so it has to be composed AFTER the attempt rather than before it.
            paintModeBar();
            const status = getEnvelopeDrawStatus();
            const drawn = getDrawnEnvelopeFootprint();
            drawBtn.setAttribute('aria-pressed', status.armed ? 'true' : 'false');
            drawBtn.textContent = status.armed
                ? 'Cancel the perimeter draw'
                : drawn !== null
                    ? 'Draw the perimeter again'
                    : 'Draw the perimeter on this view';
            drawBtn.style.cssText = [
                'appearance:none', 'cursor:pointer', 'border-radius:8px', 'padding:6px 10px',
                'font:600 11px/1 system-ui, sans-serif', 'width:100%', 'box-sizing:border-box',
                `border:1px solid ${VIOLET}`,
                status.armed ? `background:${VIOLET}` : 'background:#faf9fd',
                status.armed ? 'color:#ffffff' : `color:${VIOLET}`,
            ].join(';');

            let state: 'refused' | 'armed' | 'drawn' | 'idle';
            let text: string;
            if (refusal !== null) {
                state = 'refused';
                text = refusal;
            } else if (status.armed) {
                state = 'armed';
                // §ENVELOPE-MODE-BAR — the strip's absence is REPORTED, with the way to work without
                // it, rather than leaving the user hunting for pills that were refused in silence.
                const modeNote = modeBarRefused
                    ? ' ⚠ The mode strip is not available on this screen yet, so the shapes are on the '
                      + 'keyboard instead: L linear · O orthogonal · C curved · Q rectangular · '
                      + 'I circular · E elliptical.'
                    : '';
                text = (status.refusal !== null
                    ? `${status.refusal} ${status.hint}`
                    : `Drawing on ${status.surfaces} site view${status.surfaces === 1 ? '' : 's'} — `
                      + `whichever you click first owns the gesture. ${status.hint}`) + modeNote;
            } else if (drawn !== null) {
                state = 'drawn';
                text =
                    `You drew a ${drawn.ring.length}-corner perimeter of ${drawn.areaM2.toFixed(0)} m² on `
                    + `${drawn.surfaceId === 'site-3d' ? 'the 3D Site view' : 'the 2D Site Map'}. It is the `
                    + 'footprint the control below will extrude — set the number of floor levels and press '
                    + 'Create. ⛔ Nothing is committed until you do.';
            } else {
                state = 'idle';
                text =
                    'Click corner by corner on the site view; double-click or Enter closes the perimeter, '
                    + 'Backspace removes the last corner, Esc cancels. ⚠ A perimeter has no HEIGHT: the '
                    + 'storeys below supply it, on both site views.';
            }
            drawStatus.textContent = text;
            drawStatus.setAttribute('data-draw-state', state);
            drawStatus.style.color = state === 'refused' ? '#8a5a00' : '#6b6480';
            drawStatus.style.background = state === 'refused' ? '#fdf8ee' : '';
            drawStatus.style.borderLeft = state === 'refused' ? '2px solid #c9973a' : '';
            drawStatus.style.padding = state === 'refused' ? '4px 6px' : '';
            drawStatus.style.borderRadius = state === 'refused' ? '0 5px 5px 0' : '';
        };

        drawBtn.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            refusal = null;
            if (getEnvelopeDrawStatus().armed) {
                disarmEnvelopeDraw();
                paintDraw();
                return;
            }
            // ⛔ THE REFUSAL IS THE PRODUCT WHEN NO SURFACE IS ATTACHED — printed verbatim, with the
            // route back inside it. `ENVELOPE_DRAW_NO_SURFACE_REASON` is imported so this module and
            // the registry cannot drift into two spellings of one sentence.
            const activation = armEnvelopeDraw();
            if (!activation.ok) refusal = activation.reason ?? ENVELOPE_DRAW_NO_SURFACE_REASON;
            paintDraw();
        });

        const slot = document.createElement('div');
        root.appendChild(slot);
        parent.appendChild(root);

        // ⛔ THE ONE PANEL, MOUNTED — never a re-implementation. Its default deps read the live
        // runtime per call (§L-545) and it dispatches through the bus itself, so this module holds
        // no runtime handle, no id minting and no command string.
        const authoring = mountParcelLawEnvelopeAuthoring(slot);

        // ═════════════════════════════════════════════════════════════════════════════════════
        // ⭐⭐ §ANOTHER-ENVELOPE-IS-THE-SAME-ROSTER (L-13304) — "I WANT TO DRAW ANOTHER BUILDING"
        // ═════════════════════════════════════════════════════════════════════════════════════
        // FOUNDER, 2026-09-10: *"after i create the first envelope the panel only allows me to
        // continue defining the levels or start from scratch — i need to have a small panel saying
        // want to draw another building envelope — and like that will be a new entity."*
        //
        // ⭐ HE IS ON THE WRONG SURFACE, NOT ASKING FOR SOMETHING THAT DOES NOT EXIST. The roster
        // he is describing SHIPPED (`masterPlanSection.ts`, ADR-0383) — *Add another profile*,
        // per-profile *Remove*, *Clear all profiles*, and one *Create all blocks* that dispatches
        // ONE command for N buildings, so N blocks are ONE Ctrl+Z. It was mounted in exactly one
        // place: Parcel Law question 2. On the two site views he actually authors on, the only
        // envelope surface is THIS panel, and this panel offered one envelope and nothing else.
        // [[authored-but-unwired-is-the-bottleneck]] — audit REACHABILITY, not existence.
        //
        // ⛔ SO IT IS MOUNTED, NOT REBUILT — AND THE DISTINCTION IS THE WHOLE FIX. A second
        // "draw another" control here would be this repository's dominant defect: two multi-profile
        // flows over one session, drifting on the first divergence, each with its own idea of what
        // the roster holds. There is ONE `mountMasterPlanSection`, ONE
        // `buildMasterPlanAuthoringPlan`, ONE `drawnEnvelopeFootprintState` profile list. What this
        // adds is a HOST. Everything the user does here is visible in Parcel Law and vice versa on
        // the next repaint, because neither surface holds a copy — both read the store.
        //
        // ⭐ WHY IT SITS BELOW THE SINGLE-ENVELOPE PANEL AND NOT INSTEAD OF IT. His sentence is
        // *"and like that will be a new entity"* — a SECOND building, after a first one he is happy
        // with. The panel above is how the first one gets its levels and gets created; this is the
        // answer to "now another". Replacing the panel would take away the flow he had just used.
        //
        // ⚠ FOLDED SHUT BY DEFAULT (§ENVELOPE-CARD-FOLDS, L-13249). He has told us three times the
        // card is too large. A user with one building never opens this; a user who wants a second
        // has a control that says so in his own words on the summary line.
        const rosterFold = buildPanelFold({
            id: SITE_ENVELOPE_ROSTER_FOLD_TESTID,
            summary: 'Draw another building envelope',
            open: false,
        });
        let roster: MasterPlanSectionHandle | null = null;
        try {
            const why = document.createElement('div');
            why.style.cssText = 'font-size:10px;line-height:1.45;color:#6b6480;';
            why.textContent =
                'Each profile is a separate building. Draw one perimeter per building, then Create '
                + 'all blocks makes them together — one command, one undo. This is the SAME roster '
                + 'the Parcel Law tab shows, so a profile drawn here appears there too.';
            rosterFold.body.appendChild(why);
            // ⛔ NO RUNTIME PROP IS PASSED. `defaultMasterPlanSectionDeps()` resolves the live
            // runtime PER CALL (§L-545) and falls back to `window.runtime`; handing it a captured
            // handle from this module would re-open §L-12916, where a card read a null runtime prop
            // and rendered a figure that had never been created.
            roster = mountMasterPlanSection(rosterFold.body, defaultMasterPlanSectionDeps());
        } catch (e) {
            // ⛔ A REFUSAL IS A VALUE, AND IT IS RENDERED. The single-envelope flow above is
            // untouched by a roster that failed to mount, so the panel must NOT go dark — but the
            // user must not be left pressing a fold that silently contains nothing either.
            console.warn('[site] §ANOTHER-ENVELOPE-IS-THE-SAME-ROSTER mount threw (non-fatal):', e);
            const failed = document.createElement('div');
            failed.style.cssText =
                'font-size:10px;line-height:1.45;color:#8a5a00;background:#fdf8ee;'
                + 'border-left:2px solid #c9973a;padding:4px 6px;border-radius:0 5px 5px 0;';
            failed.textContent =
                'The multi-building roster could not be mounted on this surface. The single envelope '
                + 'above still works, and the roster is still reachable in the Parcel Law tab under '
                + 'question 2.';
            rosterFold.body.appendChild(failed);
        }
        root.appendChild(rosterFold.el);
        // §ENVELOPE-DRAW C4 — the two READ channels this row paints from. ⛔ The panel below
        // subscribes to the drawn-ring slot ITSELF, so this row never repaints it: one producer,
        // one subscriber each, no chain where a missed hop leaves half the panel stale.
        const unsubs: (() => void)[] = [];
        try { unsubs.push(subscribeEnvelopeDrawStatus(() => paintDraw())); }
        catch (e) { console.warn('[site] §ENVELOPE-DRAW status subscribe threw (non-fatal):', e); }
        try { unsubs.push(subscribeDrawnEnvelopeFootprint(() => paintDraw())); }
        catch (e) { console.warn('[site] §ENVELOPE-DRAW ring subscribe threw (non-fatal):', e); }
        // §ENVELOPE-MODE-BAR — the THIRD channel, and it is its own: a mode can be switched from the
        // strip's keyboard accelerator without the arm status changing at all, so the highlight would
        // otherwise sit on the previous pill until some unrelated repaint moved it.
        try { unsubs.push(subscribeEnvelopeDrawMode(() => paintModeBar())); }
        catch (e) { console.warn('[site] §ENVELOPE-MODE-BAR mode subscribe threw (non-fatal):', e); }
        paintDraw();
        live = { root, authoring, unsubs, paintDraw, modeBar, roster, applyPresentation };
        span.setAttribute('pryzm.siteEnvelopeTool.opened', true);
        console.log(
            '[site] §ENVELOPE-TOOL-ON-THE-SITE-VIEWS panel opened over a site view — ONE command '
            + 'path (spaceEnvelope.batch.create, via buildEnvelopeAuthoringPlan), two entry points.',
        );
        return { element: root, isOpen: () => isSiteEnvelopeToolOpen(), close: closeSiteEnvelopeTool };
    } finally {
        span.end();
    }
}

/** Open if closed, close if open. What a tool BUTTON binds to. Returns the state now in force. */
export function toggleSiteEnvelopeTool(
    parent: HTMLElement,
    presentation: SiteEnvelopeToolPresentation = {},
): boolean {
    if (isSiteEnvelopeToolOpen()) { closeSiteEnvelopeTool(); return false; }
    openSiteEnvelopeTool(parent, presentation);
    return true;
}

/**
 * Build the tool BUTTON a site surface renders in its own chrome.
 *
 * ⚠ THE BUTTON IS NEVER DISABLED ON "no envelope solved" (C58 §1.20 clause 1). The panel it opens
 * is exactly where a user with no solved envelope learns what is missing and what would supply it
 * — disabling the way in would make the absence of an envelope block the parcel-law process, which
 * is the founder ruling this clause records.
 */
export function buildSiteEnvelopeToolButton(getHost: () => HTMLElement | null): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('data-testid', SITE_ENVELOPE_TOOL_BTN_TESTID);
    btn.textContent = 'Envelope';
    btn.title =
        'Create a level envelope on this view — the same command the Parcel Law tab uses, so there '
        + 'is one envelope and one undo.';
    const paint = (): void => {
        const on = isSiteEnvelopeToolOpen();
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        btn.style.cssText = [
            'appearance:none', 'cursor:pointer', 'border-radius:7px', 'padding:5px 10px',
            'font:600 11px/1 system-ui, sans-serif',
            `border:1px solid ${VIOLET}`,
            on ? `background:${VIOLET}` : 'background:rgba(255,255,255,0.95)',
            on ? 'color:#ffffff' : `color:${VIOLET}`,
        ].join(';');
    };
    btn.addEventListener('click', () => {
        const host = getHost();
        if (!host) {
            // ⛔ NEVER A SILENT NO-OP (L-1187). A pressed button whose effect is invisible reads as
            // a broken product; say what is missing instead.
            console.warn(
                '[site] §ENVELOPE-TOOL-ON-THE-SITE-VIEWS — no host element to open the panel over, '
                + 'so nothing was opened. This is a wiring gap in PRYZM, not a finding about the parcel.',
            );
            return;
        }
        toggleSiteEnvelopeTool(host);
        paint();
    });
    paint();
    return btn;
}

/** Test-only reset — drops the singleton without touching the DOM the spec owns. */
export function __resetSiteEnvelopeToolForTests(): void {
    const current = live;
    live = null;
    // §ENVELOPE-DRAW C4 — a dropped singleton whose subscriptions stayed live would repaint a
    // detached row on the NEXT spec's gesture. Same rule as the close path, minus the DOM.
    for (const un of current?.unsubs ?? []) {
        try { un(); } catch { /* teardown is best-effort */ }
    }
}
