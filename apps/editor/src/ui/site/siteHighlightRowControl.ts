// §RESI-ORCH-HIGHLIGHT-DOM (lane RESI-ORCH, 2026-09-04) — the DOM half of "click a NUMBER, light
// the GEOMETRY" (STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §3).
//
// ── WHY THIS IS ITS OWN MODULE, AND NOT FORTY LINES INSIDE `GISAreaLayout.ts` ────────────────
// The vocabulary (`siteGeometryHighlight.ts`) is pure and pinned by 30 tests. The scene half
// (`ParcelBoundarySceneRenderer.ts`) subscribes and draws. Between them sat the only part a USER
// actually touches — the label that becomes a button, and the click that writes the store — and
// it lived as two closures inside a 6,000-line layout file where no test could reach it. That is
// the [[committed-is-not-reachable]] shape at the exact hop the founder experiences: a store that
// toggles perfectly in a unit test and a button nobody has ever proven flips it.
//
// So this module owns the label markup and the wire, GISAreaLayout only CALLS them, and
// `siteHighlightRowControl.spec.ts` mounts the real markup in happy-dom, calls the real wire, and
// CLICKS. The store reading it asserts is the same one the scene subscribes to.
//
// ── THE THREE VISUAL STATES, NEVER TWO ──────────────────────────────────────────────────────
// ⛔ A row whose geometry EXISTS renders as a real, focusable `<button>`. A row whose geometry
// does NOT exist renders as ordinary text with a dimmed ◎ carrying the REASON in its title —
// never as a control that swallows a click. A dead click is indistinguishable from a broken
// product AND from "we looked and found nothing": that is the §CONTEXT-DATA-HONESTY conflation
// wearing an affordance, and `describeSiteHighlightAvailability` exists so this file never has to
// decide availability itself. It only renders the decision it is handed.
//
// ── THE PRESSED STATE IS REPAINTED IN PLACE, NOT BY RE-RENDERING THE CARD ───────────────────
// Every read-out row lives inside the default-collapsed `<details data-testid=
// "envelope-section-site-data">` fold. Rebuilding `panel.innerHTML` re-emits that `<details>`
// WITHOUT `open`, so the fold would snap shut on every click — closing the very section holding
// the row the user just clicked, which reads as the click having destroyed the panel. Repainting
// a handful of attributes leaves the user's disclosure state exactly where they put it.
//
// P4 — no globals. P6 — writes ONE session store, dispatches nothing, touches no scene.
// C08 §3.1 — every interpolated runtime string routes through the local `escHtml`.

import { trace } from '@opentelemetry/api';
import {
    describeSiteHighlightReach,
    getSiteHighlight,
    toggleSiteHighlight,
    SITE_HIGHLIGHT_ATTR,
    type SiteHighlightAvailability,
    type SiteHighlightSubject,
} from './siteGeometryHighlight';

const _tracer = trace.getTracer('pryzm.site.siteHighlightRowControl');

/** Local HTML escaper — the guard this file declares for itself (C08 §3.1). */
function escHtml(value: unknown): string {
    return String(value ?? '').replace(/[&<>"']/g, (c) => (
        c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
    ));
}

/** The attribute an UNAVAILABLE row carries, so a test can prove it is text and not a control. */
export const SITE_HIGHLIGHT_UNAVAILABLE_ATTR = 'data-site-highlight-unavailable';

// -- §SITE-HIGHLIGHT-REACH -- THE ROW SAYS WHERE THE ANSWER WILL APPEAR -------------------
//
// The Parcel Law tab offers FOUR views and exactly ONE of them subscribes to the highlight store
// (see the §SITE-HIGHLIGHT-REACH block in `siteGeometryHighlight.ts` for the measurement). So a
// founder in 3D Site clicks "Area", the button dutifully repaints its ◉, and nothing lights up.
// The row ASSERTED that something happened, which is worse than an un-pressable row: it reads as
// a broken product rather than as "not in this view".
//
// ⚠ THE ROW STAYS A BUTTON. The tempting fix is to render it un-clickable when nothing can draw
// it -- symmetrical with the geometry rule above -- and it would be a REGRESSION: this card can
// render before `initScene` constructs the scene renderer, so the registry is legitimately empty
// for a moment, and a row demoted to text never recovers (nothing re-renders the card on
// registration). Disabling a working control on a timing race is a worse failure than a tooltip
// that under-informs, so reach is carried as INFORMATION -- in the title and in a queryable
// attribute -- and never as a capability gate. `paintSiteHighlightRows` re-derives it, so a row
// rendered before the scene existed corrects itself on the next paint.
/** `n` surfaces can draw this row's emphasis; `0` means a click changes nothing on screen. */
export const SITE_HIGHLIGHT_REACH_ATTR = 'data-site-highlight-reach';
/**
 * The row's availability REASON, parked on the element so `paintSiteHighlightRows` can recompose
 * the whole title without being handed the availability model again. Without it a repaint could
 * only fix the attribute, leaving a stale SENTENCE beside a corrected number — two halves of one
 * fact disagreeing on the same element, which is the defect this section is closing.
 */
export const SITE_HIGHLIGHT_REASON_ATTR = 'data-site-highlight-reason';

/** The one composer of a row's tooltip, so build and repaint cannot word it differently. */
function composeRowTitle(reason: string, reachSentence: string): string {
    return `${reason} ${reachSentence} Click again to clear.`;
}

const ON_BG = '#f3eeff';
const ON_INK = '#6600FF';
const OFF_INK = '#6b6480';
const OFF_RULE = '#c3bdd6';

/**
 * The label cell of one read-out row.
 *
 * @param label      the row's user-facing label ("Max footprint")
 * @param subject    which of the six §3 subjects this row points at
 * @param avail      the availability DECISION for that subject — computed once per render by
 *                   `describeSiteHighlightAvailability`, never re-derived here
 * @param isOn       whether this subject is the one currently emphasised
 */
export function buildSiteHighlightLabelHtml(
    label: string,
    subject: SiteHighlightSubject,
    avail: SiteHighlightAvailability,
    isOn: boolean,
): string {
    if (avail.available) {
        // §SITE-HIGHLIGHT-REACH — read here rather than passed in, so the call sites in the card
        // need no signature change and cannot forget it. See the block above for why this informs
        // rather than gates.
        const reach = describeSiteHighlightReach();
        return `<button type="button" ${SITE_HIGHLIGHT_ATTR}="${escHtml(subject)}"
                   ${SITE_HIGHLIGHT_REACH_ATTR}="${reach.surfaces.length}"
                   ${SITE_HIGHLIGHT_REASON_ATTR}="${escHtml(avail.reason)}"
                   aria-pressed="${isOn ? 'true' : 'false'}"
                   title="${escHtml(composeRowTitle(avail.reason, reach.sentence))}"
                   style="appearance:none;background:${isOn ? ON_BG : 'transparent'};border:none;
                          border-bottom:1px dotted ${isOn ? ON_INK : OFF_RULE};padding:0 2px;margin:0;
                          cursor:pointer;font:inherit;color:${isOn ? ON_INK : OFF_INK};
                          font-weight:${isOn ? '700' : 'inherit'};border-radius:3px;">${escHtml(label)}<span data-hl-glyph="1">${isOn ? ' ◉' : ' ◎'}</span></button>`;
    }
    // The honest unreachable arm: text, a dimmed glyph, and the REASON where a hover finds it.
    return `<span style="color:${OFF_INK};">${escHtml(label)}<span
             ${SITE_HIGHLIGHT_UNAVAILABLE_ATTR}="${escHtml(subject)}"
             title="${escHtml(avail.reason)}" style="color:#ddd8ea;cursor:help;"> ◎</span></span>`;
}

/**
 * Repaint every highlight button under `root` from the store — pressed state, colours, glyph.
 * Idempotent; safe to call when no buttons exist.
 */
export function paintSiteHighlightRows(root: ParentNode): void {
    const on = getSiteHighlight();
    // §SITE-HIGHLIGHT-REACH — re-derived on every paint, ONCE for the whole root. A card rendered
    // before `initScene` registered the scene carries `0` in its markup; this is what corrects it,
    // and it is why the reach is information rather than a capability gate.
    const reach = describeSiteHighlightReach();
    root.querySelectorAll<HTMLButtonElement>(`[${SITE_HIGHLIGHT_ATTR}]`).forEach((b) => {
        const s = b.getAttribute(SITE_HIGHLIGHT_ATTR);
        const isOn = s !== null && s === on;
        b.setAttribute('aria-pressed', isOn ? 'true' : 'false');
        b.setAttribute(SITE_HIGHLIGHT_REACH_ATTR, String(reach.surfaces.length));
        // Recompose the WHOLE title from the parked reason, never patch half of it.
        const reason = b.getAttribute(SITE_HIGHLIGHT_REASON_ATTR);
        if (reason !== null) b.setAttribute('title', composeRowTitle(reason, reach.sentence));
        b.style.background = isOn ? ON_BG : 'transparent';
        b.style.borderBottom = `1px dotted ${isOn ? ON_INK : OFF_RULE}`;
        b.style.color = isOn ? ON_INK : OFF_INK;
        b.style.fontWeight = isOn ? '700' : '';
        const glyph = b.querySelector<HTMLElement>('[data-hl-glyph]');
        if (glyph) glyph.textContent = isOn ? ' ◉' : ' ◎';
    });
}

/**
 * Attach the click handlers to every highlight button under `root`.
 *
 * Each button WRITES the subject and does nothing else: it does not reach into a scene, does not
 * know which renderers exist, and does not re-render the card. The store notifies its
 * subscribers (`ParcelBoundarySceneRenderer` draws; this card repaints its own pressed state so
 * the ◉ glyph agrees with what is on screen) — the push-not-poll contract `envelopeVisibility.ts`
 * already enforces, and the reason "the panel changed the flag but the scene never heard" cannot
 * happen here.
 *
 * `stopPropagation` + `preventDefault` because the rows sit inside a `<details>` whose summary
 * toggles on click, and the whole card header is a drag handle.
 *
 * ⚠ ONLY AVAILABLE ROWS ARE BUTTONS AT ALL — the unavailable ones are text with their reason in a
 * `title`, so there is nothing here to guard against. A disabled control that still looks like a
 * control is the dead click by another name.
 *
 * @returns the number of buttons wired — so a caller (or a test) can tell "wired nothing" from
 *          "wired six" instead of inferring it from silence.
 */
export function wireSiteHighlightRows(root: ParentNode): number {
    const span = _tracer.startSpan('pryzm.site.wireSiteHighlightRows');
    try {
        let wired = 0;
        root.querySelectorAll<HTMLButtonElement>(`[${SITE_HIGHLIGHT_ATTR}]`).forEach((btn) => {
            const subject = btn.getAttribute(SITE_HIGHLIGHT_ATTR) as SiteHighlightSubject | null;
            if (!subject) return;
            btn.onclick = (ev) => {
                ev.stopPropagation();
                ev.preventDefault();
                toggleSiteHighlight(subject);
                paintSiteHighlightRows(root);
            };
            wired++;
        });
        span.setAttribute('pryzm.siteHighlight.wiredButtons', wired);
        return wired;
    } finally {
        span.end();
    }
}
