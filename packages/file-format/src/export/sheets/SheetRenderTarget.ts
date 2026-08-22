/**
 * SheetRenderTarget — §SHEET-CHROME-IS-NOT-THE-DRAWING (L-3804)
 *
 * WHO IS LOOKING AT THIS SHEET: a person editing it, or a sheet of paper.
 *
 * ─── WHY THIS FILE EXISTS ──────────────────────────────────────────────────
 * The founder, 2026-08-21:
 *   "No view frame in the PDF. The blue viewport border and the `{3D} … 1:50`
 *    label bar are on-screen editing affordances. They must not print."
 *
 * He is right, and the reason is not cosmetic. A drawing frame printed on an
 * issued drawing is a MARK ON THE DRAWING. A reader cannot tell a viewport
 * border from a section box, a match line, or a detail bubble — all of which
 * are real annotation that means something. Printing the editor's furniture
 * puts marks on a construction document that no one drew and that nothing in
 * the model backs. That is the same failure as an invented address in the title
 * block (L-3806), in ink instead of text.
 *
 * ─── WHY A TARGET, AND NOT A `hideFrame` FLAG ──────────────────────────────
 * The founder asked for this explicitly: *"make that an explicit render-target
 * distinction (screen vs print), not a hidden flag."*
 *
 * A boolean parameter answers ONE question and has to be re-asked, correctly,
 * at every future call site — and the whole lineage of defects in this
 * subsystem is call sites that forgot an option the other surface applied
 * (`PdfExportService` silently dropping `cropWorldM`, L-1874; two surfaces
 * disagreeing about whether `position` is a corner or a centre, L-1874; two
 * rival viewport producers, L-1630). A TARGET answers the question once, by
 * name, and every chrome decision is derived from it. Adding a new affordance
 * means adding a field HERE, where both surfaces read it, rather than adding a
 * flag that one of the two forgets to pass.
 *
 * ⛔ THE DEFAULT IS DELIBERATELY NOT 'screen'. `chromeFor` takes the target as
 * a required argument precisely so that a new export surface cannot inherit
 * editing furniture by saying nothing.
 *
 * Contract compliance:
 *   C06 §13.3 — one producer per surface; this is the one CHROME POLICY.
 *   §05 §4    — pure data; no DOM, no jsPDF, no rendering.
 *   P8        — every exported function carries an OpenTelemetry span.
 */

import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('@pryzm/file-format');

/**
 * Who the composition is FOR.
 *
 * `'screen'` — the live sheet editor. The user is arranging viewports and needs
 *   to see where each one begins and ends, what scale it is at, and how to
 *   remove it.
 * `'print'`  — PDF / print / DXF paper space. The output is a document. Only
 *   things that are part of the DRAWING may appear.
 */
export type SheetRenderTarget = 'screen' | 'print';

/**
 * Which viewport affordances this target draws.
 *
 * Every field is an EDITING affordance — something that helps a person
 * manipulate a placement. None of them is drawing content. They are enumerated
 * rather than lumped under one boolean so that a future affordance has an
 * obvious home and cannot be added as "chrome, probably fine to print".
 */
export interface ViewportChrome {
    /** The rectangle around the viewport showing its extent. */
    readonly frame: boolean;
    /** The `1:50` scale label beneath the viewport. */
    readonly scaleLabel: boolean;
    /** The view-type / view-name label bar. */
    readonly titleBar: boolean;
    /** The `✕` remove control and resize handles. */
    readonly editControls: boolean;
    /** The dated "snapshot · 4m ago" badge over a 3D capture. */
    readonly snapshotBadge: boolean;
}

const SCREEN_CHROME: ViewportChrome = {
    frame:         true,
    scaleLabel:    true,
    titleBar:      true,
    editControls:  true,
    snapshotBadge: true,
};

/**
 * ⛔ EVERY FIELD IS FALSE, AND THAT IS THE WHOLE POINT. If a future affordance
 * needs to print, it is not chrome — it is drawing content, and it belongs in
 * `ViewportSvgComposer` with the linework, not here.
 *
 * `snapshotBadge` is false with a caveat worth stating: a 3D capture on paper
 * IS dated information, and §SHEET-3D-SNAPSHOT-IS-DATED (L-1875) exists because
 * presenting a stale frame as live is a lie. The badge is suppressed in print
 * because it is a screen affordance drawn over the image, not because the
 * staleness stops mattering. `PdfExportService` logs the capture's age at
 * export instead, so the fact is not lost — it changes channel. Recorded as an
 * open question in the ISSUE-LOG (L-3805) rather than settled quietly.
 */
const PRINT_CHROME: ViewportChrome = {
    frame:         false,
    scaleLabel:    false,
    titleBar:      false,
    editControls:  false,
    snapshotBadge: false,
};

/**
 * The chrome policy for a target.
 *
 * Required argument, no default — see the header. A surface that does not say
 * who it is drawing for does not get to guess.
 */
export function chromeFor(target: SheetRenderTarget): ViewportChrome {
    return tracer.startActiveSpan('pryzm.sheets.chromeFor', (span): ViewportChrome => {
        try {
            span.setAttribute('pryzm.render_target', target);
            return target === 'print' ? PRINT_CHROME : SCREEN_CHROME;
        } finally {
            span.end();
        }
    });
}
