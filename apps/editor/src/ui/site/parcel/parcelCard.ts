// §L-1581 (C06 §13.3 · C57 §1.4 / §1.5 / §1.9 / §2.4) — THE ONE PRODUCER OF THE
// PARCEL DATA CARD.
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────────
//
// The founder: *"there was a panel for each parcel with data … it is not accessible
// now"*. It was not deleted — it was never reachable outside the map modal. The card
// was ~160 lines of DOM built inside a closure in `SiteBoundaryMap2D.ts`
// (`showParcelCard` / `showStubParcelCard`, lines 1001-1150), so it lived and died with
// the map overlay and nothing else in the app could mount it.
//
// The obvious fix — hand-write a second card in the GIS rail panel — is the exact defect
// C06 §13.3 exists to prevent, and this repo has already paid for it twice: five rival
// hand-written GIS button lists (L-1187) and, one day before this, the buildability card,
// where §GIS-ENVELOPE-REHOST (L-1362) states the reason plainly — two GIS surfaces that
// disagree about whether land is buildable. Two parcel cards that can disagree about
// whether a ring is a legal cadastral parcel is the same failure with a legal consequence
// attached.
//
// So there is ONE producer, and both surfaces call it:
//
//   • `SiteBoundaryMap2D` mounts it for the LIVE fetched `ParcelFeature` (pre-commit),
//     with "Use this parcel" / "Draw instead" actions.
//   • `ProjectBrowserPanel._buildGISPanel` mounts it for the COMMITTED
//     `Parcel.provenance` (post-commit), read-only.
//
// The two hosts differ only in which ADAPTER produces the view-model and which actions
// they pass. Every fact row, every honesty label and every absent-state string is
// produced here exactly once, so the two surfaces cannot drift.
//
// ── THE HONESTY RULES THIS FILE ENFORCES ────────────────────────────────────────
//
//  1. **A footprint is never presented as a cadastral parcel** (C57 §1.5 / §1.13.4;
//     `FootprintParcelProvider.ts:14` says so in its own header). It gets a banner, its
//     identifier row is labelled `OSM id` rather than `Ref`, and `isCadastral` is read
//     from the `kind` FIELD — never from a substring test on the source string, which is
//     one provider rename away from silently reclassifying a footprint.
//  2. **Registry-declared area and ring-derived area are different facts** (C57 §2.4;
//     collapsing them was KV-3, fixed by §L-640). The row is LABELLED with which one it
//     is, and when both exist and disagree, both numbers are shown.
//  3. **An unknown is never a zero and never a blank** (C84 EI-1b, and the same rule the
//     envelope slot's empty state follows). Absent provenance renders a stated-absence
//     card naming the reason.
//  4. **Attribution is mandatory** (C57 §1.9): the provider's human `label` is rendered
//     wherever its data is, on every non-absent variant.
//
// ── APPEARANCE ──────────────────────────────────────────────────────────────────
//
// ⛔ NO COLOUR LITERAL IN THIS FILE. Every rule is a `.pryzm-parcel-card*` class in
// `styles/panels/projectBrowser.ts`, built from the shared `--app-*` / `--pryzm-*`
// tokens — the L-1361 rule. A hex here would be C84 EI-8 a third time, and would also be
// invisible to the §UI-DENSITY-SCALE transform (it rewrites the injected stylesheet and
// cannot see `Object.assign(el.style, …)`). The stylesheet is injected globally by
// `AppTheme.ts`, so the same classes paint the card inside the map overlay and inside the
// rail panel.

import type { ParcelProvenance, ParcelSourceKind } from '@pryzm/schemas';
import type { ParcelFeature } from './ParcelProvider.js';
import { assessParcelSize, parcelSizeReviewText, PARCEL_SIZE_REVIEW_TESTID } from './parcelSizeReview.js';
// ⭐ §26.6 rule 2 (L-13046, founder 2026-09-07): *"IF THE USER SELECTS AREA IT WORKS LIKE A
// HYPERLINK … THE AREA IN THE LEFT HAND SIDE 2D MAP VIEW OR 3D SITE VIEW SHOULD HIGHLIGHT THE AREA
// (IN PRYZM VIOLET COLOUR)."* The row label becomes the SAME control the envelope card's fold has
// carried since §RESI-ORCH-HIGHLIGHT — built by the ONE builder in `siteHighlightRowControl.ts`,
// which writes the ONE store every site view subscribes to. This file decides nothing about
// availability and nothing about what lights: it is handed a DECISION and typesets it (C08 §3.1:
// the builder is DOM, so this card still has no HTML sink).
import { getSiteHighlight, type SiteHighlightAvailability, type SiteHighlightSubject } from '../siteGeometryHighlight.js';
import { buildSiteHighlightLabelEl } from '../siteHighlightRowControl.js';

/** The `data-testid` on the card root, whichever surface hosts it. */
export const PARCEL_CARD_TESTID = 'parcel-info-card';
/** The `data-testid` on the stated-absence variant. */
export const PARCEL_CARD_ABSENT_TESTID = 'parcel-info-absent';

// ── The exact strings. Named constants so a test can assert them verbatim and so the
//    two surfaces cannot render two different wordings of the same fact. ────────────

/**
 * §L-1581 — the stated-absence body. Shown when a Site has a committed boundary but
 * `parcel.provenance` is `null`.
 *
 * It names the REASON, because "not recorded" without a cause reads as a bug. Two causes
 * are possible and we genuinely cannot tell them apart from the stored data — so the text
 * says both rather than picking one, which is the same discipline `ProjectLoader`'s
 * §L-545 branch applies to a pre-provenance snapshot.
 */
export const PARCEL_PROVENANCE_ABSENT_TEXT =
    'Parcel provenance is not recorded for this parcel. The boundary was committed before '
    + 'PRYZM persisted cadastral attribution, or it was drawn by hand — the two are '
    + 'indistinguishable from what was saved. Source, reference and area basis are UNKNOWN, '
    + 'not absent: nothing has been assumed in their place. Re-select this plot on the 2D map '
    + 'to record them.';

/** §L-1581 — shown when there is no committed boundary at all yet. A different fact. */
export const PARCEL_NO_BOUNDARY_TEXT =
    'No parcel boundary committed yet. Open the 2D map and select a plot — or draw one — and '
    + 'its cadastral reference, address, area and source appear here.';

/**
 * §L-1581 (C57 §1.5 / §1.13.4) — the footprint banner. A footprint is the BUILDING
 * outline, not the land boundary. This wording is the one place it is said.
 */
export const PARCEL_FOOTPRINT_WARNING =
    '⚠ Building footprint (OSM) — NOT a legal cadastral parcel. This is the building outline, '
    + 'not the land boundary, and it carries no cadastral reference.';

/** §L-1581 — a hand-drawn ring. Authoritative for the user's intent, for nothing else. */
export const PARCEL_USER_DRAWN_NOTE =
    '✎ Drawn by hand — not sourced from a cadastre. Authoritative for your intent only.';

/**
 * §L-1581 (C57 §2.4 / KV-3, §L-640) — said whenever the area shown was computed by us
 * rather than published by the source. Never merged into the plain "Area" row.
 */
export const PARCEL_AREA_DERIVED_NOTE =
    'Area computed from the ring (shoelace) — the source publishes no registry area.';

/** The card's normalised view-model. Both adapters below produce this shape. */
export interface ParcelCardModel {
    readonly kind: ParcelSourceKind;
    /** Provider id — 'catastro' · 'ign-fr' · 'footprint' … */
    readonly source: string;
    /** C57 §1.9 attribution string. Always rendered. */
    readonly label: string;
    readonly refcat: string | null;
    readonly address: string | null;
    readonly jurisdictionId: string | null;
    readonly sourceCrs: string | null;
    readonly license: string | null;
    readonly ingestTimestamp: string | null;
    /** Registry-declared area (m²) or null when the source publishes none. */
    readonly areaOfficialM2: number | null;
    /** Shoelace area (m²) over the ring, or null when it could not be computed. */
    readonly areaSigM2: number | null;
    readonly areaSource: 'registry-declared' | 'derived-from-ring' | null;
    readonly matchTier: 'high' | 'medium' | 'low' | null;
    readonly geometryComplete: boolean | null;
}

/** An action button the host wants on the card (the map's "Use this parcel", …). */
export interface ParcelCardAction {
    readonly label: string;
    readonly testId?: string;
    readonly variant?: 'primary' | 'secondary';
    readonly disabled?: boolean;
    readonly title?: string;
    readonly onClick: () => void;
}

export interface ParcelCardOptions {
    /** Card heading. Defaults to 'PARCEL'. */
    readonly title?: string;
    readonly actions?: readonly ParcelCardAction[];
    /**
     * Text for the absent variant. Defaults to `PARCEL_PROVENANCE_ABSENT_TEXT`. A host
     * with a DIFFERENT absence (no boundary at all) passes `PARCEL_NO_BOUNDARY_TEXT` —
     * the two are distinct facts and the card refuses to conflate them.
     */
    readonly absentText?: string;
    /**
     * §L-12912 (lane PT-BELVERDE-LOTS) — host-supplied notes rendered ABOVE the fact rows, after
     * the kind banner. The map uses them when the ring on the card is a footprint offered IN
     * PLACE OF an oversize cadastral holding: the note names both rings and both numbers, and the
     * displaced holding's own size-review banner is carried here so it stays in view (C83 §1.2).
     * Additive — the rail panel passes none and renders exactly as before.
     */
    readonly leadNotes?: readonly ParcelCardLeadNote[];
    /**
     * §ONE-PARCEL-BLOCK (L-13005) — ring measurements contributed by the host, rendered in
     * THIS card's typography rather than in a second block headed PARCEL beside it.
     *
     * Placed directly after the area rows, because they measure the same ring the areas
     * measure, and before `Zone pack` / `Match`, which are classification rather than
     * measurement. Additive: the rail panel, the GIS section and the map overlay pass none
     * and render exactly as before.
     */
    readonly extraFacts?: readonly ParcelCardExtraFact[];
    /**
     * §ONE-PARCEL-BLOCK — the attribution line for `extraFacts`, rendered beneath them.
     *
     * ⛔ NOT OPTIONAL DECORATION. The rows above it are measured in SCENE metres off the
     * committed ring, while `Area (registry)` is what the cadastre publishes and
     * `Area (from ring)` is a shoelace over the published geometry. Three provenances in one
     * block with only one of them stated would be exactly the C57 §1.9 attribution loss the
     * merge was forbidden to cause. Shown only when `extraFacts` is non-empty.
     */
    readonly extraFactsNote?: string;
    /**
     * §26.6 rule 2 (L-13046) — makes the card's OWN area row(s) a hyperlink to the parcel on
     * whichever view is open. The card renders `Area (registry)` / `Area (from ring)` from the
     * model, not from `extraFacts`, so the host cannot reach those labels through the seam above;
     * this is the one field that lets it. Omitted by every host but the Parcel Law tab, which is
     * the only host whose views subscribe to the highlight store.
     */
    readonly areaHighlight?: ParcelCardRowHighlight;
}

/**
 * §26.6 rule 2 (L-13046) — what a hyperlinked row points at, DECIDED BY THE HOST.
 *
 * ⛔ THE CARD DOES NOT DECIDE AVAILABILITY. `availability` arrives already computed by
 * `describeSiteHighlightAvailability` (or its per-edge sibling) so this producer never re-derives
 * whether a ring exists; it only renders the button or the text-with-reason that decision names.
 */
export interface ParcelCardRowHighlight {
    readonly subject: SiteHighlightSubject;
    readonly availability: SiteHighlightAvailability;
}

/** A host note placed above the fact rows. `tone` picks the warn vs note class. */
export interface ParcelCardLeadNote {
    readonly text: string;
    readonly testId?: string;
    readonly tone?: 'warn' | 'note';
}

/**
 * §ONE-PARCEL-BLOCK (L-13005) — a host-supplied fact row rendered INSIDE the card, in the
 * card's own row typography.
 *
 * ⭐ WHY THIS SEAM EXISTS, AND WHY IT IS NOT "the card computing more things". The founder
 * red-boxed the Parcel Law tab and said *"the data of the parcel is incorrect format"*: the
 * tab rendered the parcel TWICE — this card, then immediately a second right-aligned figure
 * list headed PARCEL carrying `Area · Perimeter · Bounding box · Boundary edges`. Two blocks,
 * two typographies, two alignments, the area in both. The §26 lane named the duplication and
 * left it pending *"a host-arbiter decision, not a lane"*; the founder has now made that
 * decision: it is ONE block.
 *
 * The merge had exactly one sound direction. This file is the ONE PRODUCER of the cadastral
 * card (C06 §13.3, and this file's own header states the legal consequence of a second one),
 * so re-rendering `Ref / Addr / Area (registry) / Area (from ring) / Source / Retrieved`
 * inside the analysis surface's fact renderer would have minted the second producer the
 * header forbids. The ring MEASUREMENTS travel the other way instead: the caller hands them
 * in, and they are typeset by the card, which is what makes "one typography" true by
 * construction rather than by review.
 *
 * ⛔ THE CARD STILL COMPUTES NOTHING. `value` arrives already formatted, already honest — a
 * withheld figure arrives as its caller's `not derived` wording, never as a blank this file
 * invents. The card contributes typography and placement; the caller contributes truth.
 *
 * `testId` is supplied by the caller SO THAT THE MERGE LOSES NO SELECTOR: the Parcel Law tab
 * passes the very `parcel-law-fact-*` ids its second block used, so every figure keeps the
 * handle it had before it moved.
 */
export interface ParcelCardExtraFact {
    /** `data-testid` on the row. Supplied by the caller — see above. */
    readonly testId: string;
    readonly label: string;
    /** Already formatted, already honest. This file never reformats and never substitutes. */
    readonly value: string;
    /** Tooltip on the label. The caller's own explanation of what the figure is. */
    readonly hint?: string;
    /**
     * §26.6 rule 2 — when present, the label is the highlight CONTROL rather than text: following
     * it lights `subject` on every subscribed view, in PRYZM violet. See `ParcelCardRowHighlight`.
     */
    readonly highlight?: ParcelCardRowHighlight;
}

/**
 * §L-1581 — is this ring a legal cadastral parcel? Reads the `kind` FIELD.
 *
 * The pre-existing map card asked `/footprint/i.test(parcel.source)`
 * (`SiteBoundaryMap2D.ts:1035`). That works only for as long as every footprint provider
 * keeps the substring "footprint" in its id — a rename, or a second fallback source named
 * anything else, silently reclassifies a building outline as a legal parcel. The kind is
 * therefore stamped at the adapter and read here.
 */
export function isCadastralCardModel(m: ParcelCardModel | null | undefined): boolean {
    return m?.kind === 'cadastral';
}

/**
 * §L-1581 — the COMMIT-SEAM adapter: a fetched `ParcelFeature` → the persisted
 * `ParcelProvenance`. THE one place the fetched shape becomes the stored shape.
 *
 * `kind` is derived here, once, from the provider id plus the confidence tier's own
 * footprint marker, so the classification cannot differ between what is stored and what
 * is drawn. Everything the adapter did not supply stays `null` — this function never
 * invents a `sourceCrs`, a `license` or a `refcat`.
 */
export function parcelFeatureToProvenance(
    feature: ParcelFeature,
    opts?: {
        readonly providerLabel?: string | null;
        readonly jurisdictionId?: string | null;
        readonly sourceCrs?: string | null;
        readonly license?: string | null;
        readonly sourceVersion?: string | null;
        readonly now?: () => string;
    },
): ParcelProvenance {
    const source = (feature.source ?? '').trim() || 'unknown';
    // The footprint providers stamp their id as 'footprint' and their per-parcel source as
    // 'footprint (OSM)'. Both start with the token, and both are OURS — this is the one
    // sanctioned place the string is interpreted, and it produces a FIELD that every
    // downstream reader keys off instead of re-testing the string.
    const kind: ParcelSourceKind = /^footprint\b/i.test(source) ? 'footprint' : 'cadastral';
    const conf = feature.confidence;
    return {
        kind,
        source,
        label: (opts?.providerLabel ?? '').trim() || source,
        sourceVersion: opts?.sourceVersion ?? null,
        retrievedAt: null,
        license: opts?.license ?? null,
        sourceCrs: opts?.sourceCrs ?? null,
        refcat: typeof feature.refcat === 'string' && feature.refcat.length > 0 ? feature.refcat : null,
        address: typeof feature.address === 'string' && feature.address.length > 0 ? feature.address : null,
        jurisdictionId: opts?.jurisdictionId ?? null,
        ingestTimestamp: (opts?.now ?? (() => new Date().toISOString()))(),
        confidence: conf
            ? {
                  match: conf.match,
                  areaSource: conf.areaSource,
                  areaOfficialM2: conf.areaOfficialM2,
                  areaSigM2: conf.areaSigM2,
                  areaDeltaPct: conf.areaDeltaPct,
                  pointToParcelM: conf.pointToParcelM,
                  candidateMarginM: conf.candidateMarginM,
                  geometryComplete: conf.geometryComplete,
              }
            : null,
    };
}

/** §L-1581 — LIVE (pre-commit) adapter: a fetched `ParcelFeature` → the card view-model. */
export function parcelFeatureToCardModel(
    feature: ParcelFeature,
    providerLabel?: string | null,
): ParcelCardModel {
    // Routed through the SAME normaliser the commit uses, so what the map shows before the
    // commit and what the rail shows after it are produced by one function, not two.
    return parcelProvenanceToCardModel(
        parcelFeatureToProvenance(feature, { providerLabel }),
        // `areaM2` is the provider's backward-compat field (C57 §2.1): official where the
        // source published one, shoelace otherwise. It is used ONLY as a last-resort ring
        // area when no confidence block exists — never promoted to "registry-declared".
        Number.isFinite(feature.areaM2) ? feature.areaM2 : null,
    );
}

/** §L-1581 — COMMITTED adapter: the persisted `ParcelProvenance` → the card view-model. */
export function parcelProvenanceToCardModel(
    prov: ParcelProvenance,
    fallbackRingAreaM2?: number | null,
): ParcelCardModel {
    const c = prov.confidence;
    return {
        kind: prov.kind,
        source: prov.source,
        label: prov.label,
        refcat: prov.refcat,
        address: prov.address,
        jurisdictionId: prov.jurisdictionId,
        sourceCrs: prov.sourceCrs,
        license: prov.license,
        ingestTimestamp: prov.ingestTimestamp,
        areaOfficialM2: c?.areaOfficialM2 ?? null,
        areaSigM2: c?.areaSigM2 ?? (Number.isFinite(fallbackRingAreaM2 ?? NaN) ? (fallbackRingAreaM2 as number) : null),
        areaSource: c?.areaSource ?? null,
        matchTier: c?.match ?? null,
        geometryComplete: c?.geometryComplete ?? null,
    };
}

// ── DOM ─────────────────────────────────────────────────────────────────────────

function el<K extends keyof HTMLElementTagNameMap>(
    tag: K, cls: string, text?: string,
): HTMLElementTagNameMap[K] {
    const n = document.createElement(tag);
    n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
}

/**
 * The label cell of a row: plain text, or — §26.6 rule 2 — the highlight control the host decided
 * this row carries. ONE key-cell builder for the card's own rows and the host's extras, so the two
 * cannot render the affordance differently.
 */
function keyCell(label: string, hint?: string, highlight?: ParcelCardRowHighlight): HTMLSpanElement {
    const k = el('span', 'pryzm-parcel-card-key');
    if (highlight) {
        k.appendChild(buildSiteHighlightLabelEl(
            label,
            highlight.subject,
            highlight.availability,
            getSiteHighlight() === highlight.subject,
        ));
    } else {
        k.textContent = label;
    }
    if (hint) k.title = hint;
    return k;
}

/**
 * One label/value row.
 *
 * §26.6.1 (L-13046) — `inlineNote` renders ON THE SAME LINE as the value, as a third, muted cell
 * of the same flex row. Founder: *"`Area computed from the ring (shoelace); the source publishes no
 * legal area` must sit ON THE SAME LINE as the Area, not as an orphaned caption beneath it."* It
 * keeps the `parcel-area-derived-note` testid it always had, so nothing that looked for the
 * sentence loses it — only its placement moved.
 */
function fact(
    label: string,
    value: string,
    opts?: {
        readonly highlight?: ParcelCardRowHighlight;
        readonly inlineNote?: { readonly text: string; readonly testId: string };
    },
): HTMLDivElement {
    const row = el('div', 'pryzm-parcel-card-row');
    row.appendChild(keyCell(label, undefined, opts?.highlight));
    row.appendChild(el('span', 'pryzm-parcel-card-val', value));
    if (opts?.inlineNote) {
        const n = el('span', 'pryzm-parcel-card-note pryzm-parcel-card-note--inline', opts.inlineNote.text);
        n.setAttribute('data-testid', opts.inlineNote.testId);
        row.appendChild(n);
    }
    return row;
}

/**
 * §ONE-PARCEL-BLOCK (L-13005) — the host's ring measurements, in THIS card's row typography.
 *
 * ⛔ NO WITHHELD-VALUE ARM, AND THAT IS DELIBERATE. A `not derived` row needs a legible
 * signal (§L-527/§L-553: an honest signal that is not legible is not honest in effect), and
 * the one this card could give it lives in `styles/panels/projectBrowser.ts`. The caller
 * therefore contributes rows only for figures it actually holds: when the ring could not be
 * read there are NO extras, and the caller states the absence as a sentence of its own. A row
 * that reaches here is a measured row.
 */
function appendExtraFacts(
    root: HTMLElement,
    facts: readonly ParcelCardExtraFact[],
    note?: string,
): void {
    if (facts.length === 0) return;
    for (const f of facts) {
        const row = el('div', 'pryzm-parcel-card-row');
        row.setAttribute('data-testid', f.testId);
        // §26.6 rule 2 — the host's DECISION, typeset here. A row handed no `highlight` renders
        // exactly as it did before this field existed.
        row.appendChild(keyCell(f.label, f.hint, f.highlight));
        row.appendChild(el('span', 'pryzm-parcel-card-val', f.value));
        root.appendChild(row);
    }
    if (note) {
        const n = el('div', 'pryzm-parcel-card-note', note);
        n.setAttribute('data-testid', 'parcel-card-extra-facts-note');
        root.appendChild(n);
    }
}

function m2(n: number): string {
    // No thousands separator by locale — a locale-formatted number in a legal read-out is a
    // different string per user, which makes a screenshot and a test disagree.
    return `${Math.round(n)} m²`;
}

function appendActions(root: HTMLElement, actions: readonly ParcelCardAction[]): void {
    if (actions.length === 0) return;
    const bar = el('div', 'pryzm-parcel-card-actions');
    for (const a of actions) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `pryzm-parcel-card-btn pryzm-parcel-card-btn--${a.variant ?? 'secondary'}`;
        b.textContent = a.label;
        if (a.testId) b.setAttribute('data-testid', a.testId);
        if (a.title) b.title = a.title;
        if (a.disabled) {
            b.disabled = true;
            b.setAttribute('aria-disabled', 'true');
        } else {
            b.addEventListener('click', () => a.onClick());
        }
        bar.appendChild(b);
    }
    root.appendChild(bar);
}

/**
 * §L-1581 — BUILD THE CARD. `null` model ⇒ the stated-absence variant.
 *
 * ⚠ The absent variant is not a degraded copy of the full card with empty values. It is a
 * DIFFERENT card carrying a SENTENCE, because a card of blank rows reads as a crash and a
 * card of zeroed rows reads as a fact (C84 EI-1b). It still renders any actions the host
 * passed, so a host can offer a route out of the absence rather than a dead end.
 */
export function buildParcelCard(
    model: ParcelCardModel | null,
    opts: ParcelCardOptions = {},
): HTMLElement {
    const root = el('div', 'pryzm-parcel-card');
    root.setAttribute('data-testid', PARCEL_CARD_TESTID);
    root.appendChild(el('div', 'pryzm-parcel-card-title', opts.title ?? 'PARCEL'));

    if (!model) {
        root.setAttribute('data-parcel-provenance', 'absent');
        const note = el('div', 'pryzm-parcel-card-absent', opts.absentText ?? PARCEL_PROVENANCE_ABSENT_TEXT);
        note.setAttribute('data-testid', PARCEL_CARD_ABSENT_TESTID);
        root.appendChild(note);
        // §ONE-PARCEL-BLOCK (L-13005) — the ring measurements belong on THIS arm too. A parcel
        // whose attribution was never recorded still has a ring, and how big / how long / how
        // many edges it is remains a fact we hold when where it came from is not (the same
        // reasoning `buildParcelSectionBody` states for the area row it adds to this arm).
        appendExtraFacts(root, opts.extraFacts ?? [], opts.extraFactsNote);
        appendActions(root, opts.actions ?? []);
        return root;
    }

    root.setAttribute('data-parcel-kind', model.kind);
    root.setAttribute('data-parcel-provenance', 'present');

    // ── The kind banner FIRST, above the numbers it qualifies. A reader who stops after
    //    one line must still have been told what this ring is.
    if (model.kind === 'footprint') {
        const warn = el('div', 'pryzm-parcel-card-warn', PARCEL_FOOTPRINT_WARNING);
        warn.setAttribute('data-testid', 'parcel-footprint-warning');
        root.appendChild(warn);
    } else if (model.kind === 'user-drawn') {
        const note = el('div', 'pryzm-parcel-card-note', PARCEL_USER_DRAWN_NOTE);
        note.setAttribute('data-testid', 'parcel-user-drawn-note');
        root.appendChild(note);
    }

    // ── §L-12912 (PT-BELVERDE-LOTS) — the host's lead notes: "why THIS ring" when a footprint
    //    stands in for an oversize holding, plus the displaced holding's size banner. Rendered
    //    before the size review of the ring actually on the card, which for a footprint is
    //    `within` and says nothing — the warning about the holding must not vanish with it.
    for (const n of opts.leadNotes ?? []) {
        const note = el('div', n.tone === 'note' ? 'pryzm-parcel-card-note' : 'pryzm-parcel-card-warn', n.text);
        if (n.testId) note.setAttribute('data-testid', n.testId);
        root.appendChild(note);
    }

    // ── §L-12912 — the SIZE review, above the numbers it qualifies (Belverde: a 766 ha prédio
    //    presented as "your parcel"). A separate categorical flag beside the match tier — never
    //    inside it (C57 §2.4) — carrying both numbers and the source (C83 §1.2). It changes what
    //    the banner says and which action the host makes primary; it never hides the parcel.
    const size = assessParcelSize(model);
    root.setAttribute('data-parcel-size-review', size.status);
    const sizeText = parcelSizeReviewText(size, model);
    if (sizeText) {
        const warn = el('div', 'pryzm-parcel-card-warn', sizeText);
        warn.setAttribute('data-testid', PARCEL_SIZE_REVIEW_TESTID);
        root.appendChild(warn);
    }

    // ── Identifier. LABELLED BY KIND: a footprint's id is an OSM way id, and calling it
    //    "Ref" in the same typography a referencia catastral uses is the false-provenance
    //    the banner above just denied.
    if (model.refcat) {
        root.appendChild(fact(model.kind === 'footprint' ? 'OSM id' : 'Ref', model.refcat));
    } else {
        root.appendChild(fact('Ref', 'not published by this source'));
    }
    if (model.address) root.appendChild(fact('Addr', model.address));

    // ── Area. C57 §2.4 / KV-3: the two areas are DIFFERENT FACTS and are never merged.
    //    When both exist they are both shown; the row label always states the basis.
    //    §26.6 rule 2 — each area row is the parcel hyperlink when the host supplied one; the
    //    two rows point at the SAME plot, because they are two measurements of one ring.
    const highlight = opts.areaHighlight;
    if (model.areaSource === 'registry-declared' && model.areaOfficialM2 !== null) {
        root.appendChild(fact('Area (registry)', m2(model.areaOfficialM2), { highlight }));
        if (model.areaSigM2 !== null) {
            root.appendChild(fact('Area (from ring)', m2(model.areaSigM2), { highlight }));
        }
    } else if (model.areaSigM2 !== null) {
        // §26.6.1 — the derivation note sits ON THE SAME LINE as the figure it qualifies.
        root.appendChild(fact('Area (from ring)', m2(model.areaSigM2), {
            highlight,
            inlineNote: { text: PARCEL_AREA_DERIVED_NOTE, testId: 'parcel-area-derived-note' },
        }));
    } else {
        root.appendChild(fact('Area', 'not determinable from this ring'));
    }

    // ── §ONE-PARCEL-BLOCK (L-13005) — the host's ring measurements, HERE and not in a second
    //    block beside this one. After the areas because they measure the same ring; before
    //    `Zone pack` / `Match` because those are classification, not measurement.
    appendExtraFacts(root, opts.extraFacts ?? [], opts.extraFactsNote);

    if (model.jurisdictionId) root.appendChild(fact('Zone pack', model.jurisdictionId));
    if (model.sourceCrs) root.appendChild(fact('Source CRS', model.sourceCrs));
    if (model.matchTier) {
        // C57 §2.4 — the tier is built from categorical facts only. Rendering it as a WORD
        // rather than a percentage keeps it that way: a percentage invites a reader to
        // compare two parcels on a scale that was never calibrated.
        root.appendChild(fact('Match', model.matchTier));
    }
    if (model.geometryComplete === false) {
        root.appendChild(el('div', 'pryzm-parcel-card-warn',
            '⚠ The published ring is incomplete or degenerate — figures derived from it are unreliable.'));
    }

    // ── C57 §1.9 — ATTRIBUTION IS MANDATORY wherever the provider's data is displayed.
    //    §L-12912: the per-parcel provenance id (`ParcelFeature.source`, e.g. `dgt-cadastro-predial`)
    //    is rendered beside the human label whenever the two differ. The Belverde card read
    //    "Cadastral parcel / building footprint" — the ROUTING REGISTRY's generic label — and
    //    nothing on it said which cadastre had answered.
    const attributionText = model.source && model.source !== model.label
        ? `Source: ${model.label} · ${model.source}`
        : `Source: ${model.label}`;
    const attribution = el('div', 'pryzm-parcel-card-source', attributionText);
    attribution.setAttribute('data-testid', 'parcel-source-attribution');
    root.appendChild(attribution);
    if (model.license) {
        root.appendChild(el('div', 'pryzm-parcel-card-source', `Licence: ${model.license}`));
    }
    if (model.ingestTimestamp) {
        root.appendChild(el('div', 'pryzm-parcel-card-source', `Retrieved: ${model.ingestTimestamp}`));
    }

    appendActions(root, opts.actions ?? []);
    return root;
}
