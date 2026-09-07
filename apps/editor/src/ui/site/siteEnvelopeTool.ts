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
import {
    getDrawnEnvelopeFootprint,
    subscribeDrawnEnvelopeFootprint,
} from './drawnEnvelopeFootprintState';

const _tracer = trace.getTracer('pryzm.site.siteEnvelopeTool');

/** The floating panel's root. One name, so a surface and a test agree. */
export const SITE_ENVELOPE_PANEL_TESTID = 'site-envelope-tool-panel';
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

const VIOLET = '#6600FF';

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
export function openSiteEnvelopeTool(parent: HTMLElement): SiteEnvelopeToolHandle {
    const span = _tracer.startSpan('pryzm.site.openSiteEnvelopeTool');
    try {
        if (live && live.root.isConnected) {
            if (live.root.parentElement !== parent) {
                parent.appendChild(live.root);
                console.log('[site] §ENVELOPE-TOOL-ON-THE-SITE-VIEWS panel re-targeted (ONE panel, no second mount).');
            }
            live.authoring.repaint();
            live.paintDraw();
            const held = live;
            return {
                element: held.root,
                isOpen: () => isSiteEnvelopeToolOpen(),
                close: closeSiteEnvelopeTool,
            };
        }

        const root = document.createElement('div');
        root.setAttribute('data-testid', SITE_ENVELOPE_PANEL_TESTID);
        root.style.cssText = [
            'position:absolute', 'top:64px', 'right:16px', 'width:340px', 'max-width:calc(100% - 32px)',
            'max-height:calc(100% - 96px)', 'overflow:auto', 'z-index:40',
            'background:#ffffff', `border:1px solid ${VIOLET}`, 'border-radius:10px',
            'box-shadow:0 6px 22px rgba(60,52,40,0.22)', 'padding:12px 13px 13px',
            'font:12px/1.45 system-ui, sans-serif', 'color:#2c2740', 'pointer-events:auto',
        ].join(';');

        const head = document.createElement('div');
        head.style.cssText = 'display:flex;align-items:flex-start;gap:8px;margin-bottom:6px;';
        const title = document.createElement('div');
        title.style.cssText = `flex:1;font-weight:700;font-size:12.5px;color:${VIOLET};`;
        title.textContent = 'Envelope tool';
        const close = document.createElement('button');
        close.type = 'button';
        close.setAttribute('data-testid', SITE_ENVELOPE_CLOSE_TESTID);
        close.setAttribute('aria-label', 'Close the envelope tool');
        close.textContent = '×';
        close.style.cssText = [
            'appearance:none', 'border:none', 'background:transparent', 'cursor:pointer',
            `color:${VIOLET}`, 'font:600 17px/1 system-ui, sans-serif', 'padding:0 2px',
        ].join(';');
        close.addEventListener('click', () => closeSiteEnvelopeTool());
        head.appendChild(title);
        head.appendChild(close);
        root.appendChild(head);

        // ⭐ THE HONEST LEDE. It says which half of the founder's ask this is, so "create works and
        // drag does not yet" is something he READS rather than discovers. C58 §1.19 clause 3 also
        // requires that an authored envelope never badge itself as a solved one — the panel below
        // already labels its own footprint source, and this line names the object being made.
        const lede = document.createElement('div');
        lede.style.cssText = 'font-size:10.5px;color:#6b6480;margin-bottom:8px;';
        lede.textContent =
            'Creates a LEVEL envelope — your own design intent, not a statement of what the law '
            + 'permits. It is committed through the same command the Parcel Law tab uses, so there '
            + 'is one envelope and one undo. Dragging a face to stretch it is not built yet.';
        root.appendChild(lede);

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

        /** Raise the strip when the draw is armed, take it down when it is not. Idempotent. */
        const paintModeBar = (): void => {
            const armed = getEnvelopeDrawStatus().armed;
            if (!armed) { modeBar.dismiss(); return; }
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
            });
        };

        const paintDraw = (): void => {
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
                text = status.refusal !== null
                    ? `${status.refusal} ${status.hint}`
                    : `Drawing on ${status.surfaces} site view${status.surfaces === 1 ? '' : 's'} — `
                      + `whichever you click first owns the gesture. ${status.hint}`;
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
            // §ENVELOPE-MODE-BAR — driven from the SAME reading as the button and the status line, so
            // the strip cannot be up while the row says idle. One subscription, one repaint.
            paintModeBar();
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
        live = { root, authoring, unsubs, paintDraw, modeBar };
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
export function toggleSiteEnvelopeTool(parent: HTMLElement): boolean {
    if (isSiteEnvelopeToolOpen()) { closeSiteEnvelopeTool(); return false; }
    openSiteEnvelopeTool(parent);
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
