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
// C08 §3.1 — the control is BUILT as DOM (`buildSiteHighlightLabelEl`); the HTML form is its
// serialisation, so every runtime string is escaped by the serialiser and this file keeps no
// escaper of its own (§26.6 rule 2, L-13046 — see that builder's header).

import { trace } from '@opentelemetry/api';
import {
    describeSiteHighlightReach,
    getSiteHighlight,
    isSiteHighlightSubject,
    subscribeSiteHighlight,
    toggleSiteHighlight,
    SITE_HIGHLIGHT_ATTR,
    type SiteHighlightAvailability,
    type SiteHighlightSubject,
} from './siteGeometryHighlight';

const _tracer = trace.getTracer('pryzm.site.siteHighlightRowControl');

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
 * ⭐ §26.6 rule 2 (L-13046) — THE ONE BUILDER of a highlight label, as DOM.
 *
 * Until this lane the label existed only as an HTML string, which suited the envelope card (an
 * `innerHTML` template) and nothing else: `parcelCard.ts` — the ONE producer of the question-1
 * card, and the place the founder's `Area` / `Perimeter` / `Bounding box` / `Boundary edges` rows
 * actually live — builds with `createElement` + `textContent` and has no HTML sink by rule
 * (C08 §3.1). So the card's rows could not be buttons without either a second copy of this markup
 * or a sink the card forbids itself. This is neither: the DOM builder is the definition, and
 * `buildSiteHighlightLabelHtml` below is its serialisation, so the two hosts render one control.
 *
 * @param label      the row's user-facing label ("Max footprint")
 * @param subject    which subject this row points at — one of the fixed seven, one ring edge, or
 *                   one room. ⛔ `null` IS A REAL CASE, NOT A CONVENIENCE: §26.6.4's room rows are
 *                   built from records that may carry no id, and a record with no id cannot be
 *                   NAMED as a subject at all. Such a row must still render — as text, with its
 *                   reason — because dropping it would make the per-level count disagree with the
 *                   programme's, and rendering it as a silent plain label would hide the fact that
 *                   PRYZM cannot address it. A `null` subject can never take the button arm.
 * @param avail      the availability DECISION for that subject — computed once per render by
 *                   `describeSiteHighlightAvailability` / `describeEdgeHighlightAvailability` /
 *                   `describeRoomHighlightAvailability`, never re-derived here
 * @param isOn       whether this subject is the one currently emphasised
 */
export function buildSiteHighlightLabelEl(
    label: string,
    subject: SiteHighlightSubject | null,
    avail: SiteHighlightAvailability,
    isOn: boolean,
): HTMLElement {
    // ⛔ NO SUBJECT ⇒ NO CONTROL, whatever the availability decision says. A button carrying an
    // empty `data-site-highlight` would be wired by nothing (`wireSiteHighlightRows` rejects any
    // value the vocabulary does not know) and would swallow the click — the dead click this whole
    // module exists to prevent. The two conditions are checked together so the button arm below is
    // reachable ONLY with a real subject in hand.
    if (avail.available && subject !== null) {
        // §SITE-HIGHLIGHT-REACH — read here rather than passed in, so the call sites in the card
        // need no signature change and cannot forget it. See the block above for why this informs
        // rather than gates.
        const reach = describeSiteHighlightReach();
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute(SITE_HIGHLIGHT_ATTR, subject);
        btn.setAttribute(SITE_HIGHLIGHT_REACH_ATTR, String(reach.surfaces.length));
        btn.setAttribute(SITE_HIGHLIGHT_REASON_ATTR, avail.reason);
        btn.setAttribute('aria-pressed', isOn ? 'true' : 'false');
        btn.title = composeRowTitle(avail.reason, reach.sentence);
        btn.style.cssText =
            `appearance:none;background:${isOn ? ON_BG : 'transparent'};border:none;`
            + `border-bottom:1px dotted ${isOn ? ON_INK : OFF_RULE};padding:0 2px;margin:0;`
            + `cursor:pointer;font:inherit;color:${isOn ? ON_INK : OFF_INK};`
            + `font-weight:${isOn ? '700' : 'inherit'};border-radius:3px;`;
        btn.appendChild(document.createTextNode(label));
        const glyph = document.createElement('span');
        glyph.setAttribute('data-hl-glyph', '1');
        glyph.textContent = isOn ? ' ◉' : ' ◎';
        btn.appendChild(glyph);
        return btn;
    }
    // The honest unreachable arm: text, a dimmed glyph, and the REASON where a hover finds it.
    const wrap = document.createElement('span');
    wrap.style.color = OFF_INK;
    wrap.appendChild(document.createTextNode(label));
    const marker = document.createElement('span');
    // `''` when there is no subject at all — the attribute still marks the row as the un-clickable
    // arm (which is what a test asserts on), and its EMPTY value says the row could not be named,
    // which is a different fact from a named subject whose geometry is missing.
    marker.setAttribute(SITE_HIGHLIGHT_UNAVAILABLE_ATTR, subject ?? '');
    marker.title = avail.reason;
    marker.style.cssText = 'color:#ddd8ea;cursor:help;';
    marker.textContent = ' ◎';
    wrap.appendChild(marker);
    return wrap;
}

/**
 * The label cell of one read-out row, as markup — for the `innerHTML`-templated envelope card.
 * ⛔ A SERIALISATION OF `buildSiteHighlightLabelEl`, never a second copy of the control: the DOM
 * serialiser escapes every runtime string (C08 §3.1), which is why this file no longer carries an
 * escaper of its own.
 */
export function buildSiteHighlightLabelHtml(
    label: string,
    subject: SiteHighlightSubject | null,
    avail: SiteHighlightAvailability,
    isOn: boolean,
): string {
    return buildSiteHighlightLabelEl(label, subject, avail, isOn).outerHTML;
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
            const subject = btn.getAttribute(SITE_HIGHLIGHT_ATTR);
            // ⛔ Only a subject the store's vocabulary knows is wired. A row carrying an attribute
            // value nothing can draw would be the dead click this module exists to prevent, one
            // typo away — so it stays inert here and the spec counts it as un-wired.
            if (!isSiteHighlightSubject(subject)) return;
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

/**
 * ⭐ §26.6 rule 2 (L-13046) — KEEP EVERY ROW UNDER `root` PAINTED FROM THE STORE, whoever wrote it.
 *
 * `wireSiteHighlightRows` repaints the root it was wired on, and only on ITS OWN click. The Parcel
 * Law tab now carries highlight rows in two places that are wired by two callers: question 1's
 * cadastral card (wired by the tab) and the singleton envelope card's fold (wired by
 * `GISAreaLayout`, on the card's `panel` root, every time the card re-renders). A click on either
 * writes the ONE store; without this, the other's ◉ would go stale — the row would assert an
 * emphasis the scene had already moved off. This is the same push-not-poll subscription every
 * drawing surface holds, applied to the rows that NAME the subject.
 *
 * ⛔ NOT a drawing surface, so it does NOT call `registerSiteHighlightSurface` — a panel that
 * repaints its own pressed state is not a view that draws the geometry (`siteGeometryHighlight.ts`
 * §SITE-HIGHLIGHT-REACH: counting the panel as a viewport is the fake-more-capable-than-real shape).
 *
 * @returns the unsubscribe; call it when `root` leaves the document.
 */
export function keepSiteHighlightRowsPainted(root: ParentNode): () => void {
    const span = _tracer.startSpan('pryzm.site.keepSiteHighlightRowsPainted');
    try {
        return subscribeSiteHighlight(() => {
            try {
                paintSiteHighlightRows(root);
            } catch (e) {
                console.warn('[site][highlight] row repaint failed (non-fatal):', e);
            }
        });
    } finally {
        span.end();
    }
}
