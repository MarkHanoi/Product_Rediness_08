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
// ⚠ THIS IS THE **CREATE** HALF. Direct manipulation — drawing the footprint vertex-by-vertex on
// the map, and the arrow FACE-DRAG the founder names in L-13007 (*"it should STRETCH THE ENVELOPE
// LIVE WITH THE ARROWS"*) — is the EDIT half and is NOT here. It is not a stub and it is not
// pretended: the panel says what it extrudes and where that ring came from, in its own words, so
// a user is never left guessing which geometry they just committed.
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

const _tracer = trace.getTracer('pryzm.site.siteEnvelopeTool');

/** The floating panel's root. One name, so a surface and a test agree. */
export const SITE_ENVELOPE_PANEL_TESTID = 'site-envelope-tool-panel';
/** The tool BUTTON a site surface renders to arm this. */
export const SITE_ENVELOPE_TOOL_BTN_TESTID = 'site-envelope-tool-btn';
/** The panel's close affordance. */
export const SITE_ENVELOPE_CLOSE_TESTID = 'site-envelope-tool-close';

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
let live: { root: HTMLElement; authoring: ParcelLawEnvelopeAuthoringHandle } | null = null;

/** Whether the tool panel is open right now. Surfaces paint their button's pressed state from it. */
export function isSiteEnvelopeToolOpen(): boolean {
    return live !== null && live.root.isConnected;
}

/** Close the panel, if one is open. Idempotent; never throws. */
export function closeSiteEnvelopeTool(): void {
    const current = live;
    live = null;
    if (!current) return;
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

        const slot = document.createElement('div');
        root.appendChild(slot);
        parent.appendChild(root);

        // ⛔ THE ONE PANEL, MOUNTED — never a re-implementation. Its default deps read the live
        // runtime per call (§L-545) and it dispatches through the bus itself, so this module holds
        // no runtime handle, no id minting and no command string.
        const authoring = mountParcelLawEnvelopeAuthoring(slot);
        live = { root, authoring };
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
    live = null;
}
