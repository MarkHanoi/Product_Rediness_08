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
/**
 * §STAGE-01-DENSITY (C115 §1.4 `C115-111`, L-13139) — the `data-testid` on the card's PRIMARY
 * area row: `Area (registry)` where the source publishes one, else `Area (from ring)`, else the
 * `not determinable from this ring` row.
 *
 * ⭐ IT EXISTS BECAUSE A DIGEST HAD NOTHING TO MIRROR. Since the §ONE-PARCEL-BLOCK merge
 * (L-13005) the plot area is typeset by THIS card, and question 1's collapsed digest probed
 * `[data-testid="parcel-law-fact-parcel-area"] .anl-plaw-val` — a class this card has never
 * emitted. Both probes missed, so a committed plot collapsed to the words *"no plot committed"*
 * (L-13139 / C115 §15 D-10). C115-99: a probe MUST move with the rendering it mirrors; this is
 * the handle that lets it.
 */
export const PARCEL_CARD_AREA_ROW_TESTID = 'parcel-card-area';
/**
 * §STAGE-01-DENSITY (C115 §1.4 `C115-111` / §11 `C115-93`) — the `data-testid` on the
 * *"View full parcel data"* disclosure, when a host asks for one.
 *
 * ⚠ THE KEY IS THE MEMORY. `C115-92`: an untagged `<details>` is not a disclosure — it cannot
 * remember, and this card is rebuilt whole on every site-store notification, so a fold with no
 * key would snap shut under the reader's cursor several times a minute.
 */
export const PARCEL_CARD_DETAIL_FOLD_TESTID = 'parcel-full-technical-detail';

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
    /**
     * §STAGE-01-DENSITY (C115 §1.4 `C115-111` / `C115-152`) — host rows that belong to the
     * TECHNICAL half of the parcel: shown inside the *"View full parcel data"* disclosure when
     * `detailFold` is supplied, and inline directly after `extraFacts` when it is not.
     *
     * ⛔ THE SPLIT IS ABOUT PLACEMENT, NEVER ABOUT TRUTH. `C115-40` forbids row-level
     * withholding: nothing here is dropped in either arm, and a host that asks for no fold gets
     * exactly the card it got before this field existed, row for row and in the same order.
     */
    readonly detailFacts?: readonly ParcelCardExtraFact[];
    /**
     * §STAGE-01-DENSITY (C115 §1.4 `C115-111` · §11 `C115-93`) — ⭐ the *"View full parcel data"*
     * disclosure the founder asked for, as a HOST-DRIVEN option.
     *
     * Supplied only by the Parcel Law panel today. Every other host (the 2D map overlay, the GIS
     * rail section, the PARCEL rail panel) passes none and renders the flat card unchanged.
     */
    readonly detailFold?: ParcelCardDetailFold;
}

/**
 * §STAGE-01-DENSITY (C115 §1.4 `C115-111`) — the *"View full parcel data"* disclosure.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * ⭐ THE CARD HOLDS NO FOLD STATE, AND THAT IS WHY THIS IS NOT A SIXTH MECHANISM
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * C115 §11 measured FIVE rival disclosure mechanisms on this one surface, and `C115-91` forbids
 * fixing that by adding a third open-state map. So this card mints none: `open` arrives from the
 * host and `onToggle` reports back to it. The Parcel Law panel backs both with the SAME
 * session-scoped map its six question groups already use (`parcelLawQuestionGroup.ts`), which is
 * one of the two map-backed implementations §11 names — one map, one key space (`data-testid`),
 * one session scope. That is the pattern `envelopeCardFoldIsOpen` established for the envelope
 * card's cost fold, applied to a DOM producer instead of a string one.
 *
 * ⛔ WHAT MAY NEVER GO BEHIND IT. `C115-152`: density may be bought with disclosure, never with
 * de-weighting an honesty string. The kind banner (footprint / hand-drawn), the size review, the
 * `Match` tier, the incomplete-geometry warning, every area row with its basis, and the C57 §1.9
 * `Source:` attribution stay on the VISIBLE FACE in every arm — the caller cannot move them,
 * because this card decides their placement, not the caller.
 */
export interface ParcelCardDetailFold {
    /** Stable `data-testid` on the `<details>`. Defaults to `PARCEL_CARD_DETAIL_FOLD_TESTID`. */
    readonly testId?: string;
    /** The summary line. `C115-92`: it MUST name what is inside, not merely a category. */
    readonly summary: string;
    /** A second, muted summary line listing the contents, so a collapsed fold stays navigable. */
    readonly contents?: string;
    /** Whether it opens expanded. Read from the host's ONE open-state map. */
    readonly open: boolean;
    /** Reports the reader's toggle back to the host's map. */
    readonly onToggle?: (open: boolean) => void;
    /**
     * Host nodes appended INSIDE the fold, after the technical rows.
     *
     * ⚠ THE NODES ARE MOVED, NOT COPIED. The Parcel Law panel hands in the one
     * `PARCEL_LAW_PLOT_ROUTE_NOTE` element it owns and keeps its reference; `appendChild` re-homes
     * that same node on every card render, so the panel's own `hidden` logic keeps working and
     * there is never a second copy of the sentence to drift.
     */
    readonly hostNodes?: readonly Node[];
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
        /** §STAGE-01-DENSITY — a stable handle on one of the card's OWN rows (L-13139). */
        readonly testId?: string;
    },
): HTMLDivElement {
    const row = el('div', 'pryzm-parcel-card-row');
    if (opts?.testId) row.setAttribute('data-testid', opts.testId);
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

/**
 * §STAGE-01-DENSITY (C115 §1.4 `C115-111` · §11 `C115-92`/`C115-93`) — the *"View full parcel
 * data"* disclosure, or `null` when the host asked for none.
 *
 * The card holds no open-state map (see `ParcelCardDetailFold`): `open` comes in, the `toggle`
 * event goes back out, and the host — which survives the card's own `replaceChildren` rebuilds —
 * is what remembers.
 */
function buildDetailFold(spec: ParcelCardDetailFold): { root: HTMLDetailsElement; body: HTMLElement } {
    const details = document.createElement('details');
    details.className = 'pryzm-parcel-card-fold';
    details.setAttribute('data-testid', spec.testId ?? PARCEL_CARD_DETAIL_FOLD_TESTID);
    details.open = spec.open;
    const summary = document.createElement('summary');
    summary.className = 'pryzm-parcel-card-fold-summary';
    summary.appendChild(el('span', 'pryzm-parcel-card-fold-label', spec.summary));
    // `C115-92` — a collapsed fold must still be navigable, so it names its own contents rather
    // than making the reader open it to find out whether the row they want is inside.
    if (spec.contents) {
        summary.appendChild(el('span', 'pryzm-parcel-card-note', spec.contents));
    }
    details.appendChild(summary);
    const body = el('div', 'pryzm-parcel-card-fold-body');
    details.appendChild(body);
    if (spec.onToggle) {
        // `onToggle` is ASSIGNED via addEventListener on a freshly created node — the card is
        // rebuilt whole, so there is exactly one listener per element and no stacking is possible.
        details.addEventListener('toggle', () => spec.onToggle?.(details.open));
    }
    return { root: details, body };
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
        //
        // ⛔ NO FOLD ON THE ABSENCE ARM, DELIBERATELY. This card is a SENTENCE plus whatever ring
        // measurements survive; folding two or three rows under a disclosure would cost a click
        // and save nothing, and `C115-39` clause 1 is explicit that a stated absence has
        // something to say. `detailFacts` therefore render inline here, never behind a control.
        //
        // ⚠ THE NOTE FOLLOWS THE LAST NON-EMPTY GROUP, so a host that supplies `extraFacts` and
        // no `detailFacts` keeps the attribution line it has always had. `appendExtraFacts`
        // returns early on an empty list, so the note is rendered exactly once either way — and
        // dropping it would be the C57 §1.9 attribution loss the merge was forbidden to cause.
        const absentDetail = opts.detailFacts ?? [];
        appendExtraFacts(root, opts.extraFacts ?? [], absentDetail.length === 0 ? opts.extraFactsNote : undefined);
        appendExtraFacts(root, absentDetail, opts.extraFactsNote);
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
    //
    // §STAGE-01-DENSITY (L-13139) — the PRIMARY area row carries `PARCEL_CARD_AREA_ROW_TESTID`.
    // Since the §ONE-PARCEL-BLOCK merge this card is the only surface that prints the plot's
    // area, and question 1's collapsed digest had no handle on it, so a committed plot summarised
    // itself as "no plot committed". A digest is a mirror; a mirror needs something to point at.
    const highlight = opts.areaHighlight;
    if (model.areaSource === 'registry-declared' && model.areaOfficialM2 !== null) {
        root.appendChild(fact('Area (registry)', m2(model.areaOfficialM2), {
            highlight, testId: PARCEL_CARD_AREA_ROW_TESTID,
        }));
        if (model.areaSigM2 !== null) {
            root.appendChild(fact('Area (from ring)', m2(model.areaSigM2), { highlight }));
        }
    } else if (model.areaSigM2 !== null) {
        // §26.6.1 — the derivation note sits ON THE SAME LINE as the figure it qualifies.
        root.appendChild(fact('Area (from ring)', m2(model.areaSigM2), {
            highlight,
            testId: PARCEL_CARD_AREA_ROW_TESTID,
            inlineNote: { text: PARCEL_AREA_DERIVED_NOTE, testId: 'parcel-area-derived-note' },
        }));
    } else {
        // ⚠ THE HANDLE IS ON THIS ARM TOO. "not determinable from this ring" is an ANSWER, and a
        // digest that mirrored only the numeric arms would fall back to "no plot committed" on a
        // plot that is committed and whose area we honestly cannot state — failure and emptiness
        // collapsing into one value (C84 EI-1b), which is the very defect L-13139 is.
        root.appendChild(fact('Area', 'not determinable from this ring', {
            testId: PARCEL_CARD_AREA_ROW_TESTID,
        }));
    }

    // ── §STAGE-01-DENSITY (C115 §1.4 `C115-111`) — WHERE THE TECHNICAL HALF GOES ────────────
    //
    // Founder 2026-09-07: section ① is too tall. `C115-111` already prescribed the answer and
    // recorded it as unbuilt — the full technical detail sits behind *"View full parcel data"*.
    // This is where it is built, and `C115-152` is the budget it is built to: density may be
    // bought with disclosure, NEVER with row-level withholding (`C115-40`), NEVER by de-weighting
    // an honesty string (`C115-37`), and NEVER by hiding attribution (C57 §1.9).
    //
    // So the fold takes CLASSIFICATION and PROVENANCE-DETAIL only — zone pack, source CRS,
    // retrieval date, and the host's ring measurements with their attribution line. Everything
    // that is a claim about the land or a caveat on it stays on the face: the kind banner, the
    // size review, both areas with their bases, `Match`, the incomplete-geometry warning, and
    // `Source:`.
    const fold = opts.detailFold ? buildDetailFold(opts.detailFold) : null;
    // With no fold this is the card root, so every append below lands exactly where it always
    // did — the flat card, row for row, for the 2D map overlay and both rail hosts.
    const technical: HTMLElement = fold ? fold.body : root;

    // ── §ONE-PARCEL-BLOCK (L-13005) — the host's ring measurements. The FACE half (the
    //    scene-measured area, which is an AREA and stays with the other two) is appended here;
    //    the measurement half travels into the fold with the note that attributes it.
    const detailFacts = opts.detailFacts ?? [];
    appendExtraFacts(root, opts.extraFacts ?? [], detailFacts.length === 0 ? opts.extraFactsNote : undefined);
    appendExtraFacts(technical, detailFacts, opts.extraFactsNote);

    if (model.jurisdictionId) technical.appendChild(fact('Zone pack', model.jurisdictionId));
    if (model.sourceCrs) technical.appendChild(fact('Source CRS', model.sourceCrs));
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
        // ⛔ ON THE FACE, NOT IN THE FOLD. C57 §1.9 — attribution is a LICENCE OBLIGATION, not a
        // technical detail, and *"a provider whose license requires specific attribution text
        // MUST carry that exact text"* wherever the data is displayed. A licence line one click
        // away is a licence line that was not displayed.
        root.appendChild(el('div', 'pryzm-parcel-card-source', `Licence: ${model.license}`));
    }
    if (model.ingestTimestamp) {
        // The retrieval DATE is provenance detail rather than attribution — it says how old the
        // reading is, which the reader asks second, after who published it. It goes in the fold
        // when there is one, and stays exactly where it was when there is not.
        technical.appendChild(el('div', 'pryzm-parcel-card-source', `Retrieved: ${model.ingestTimestamp}`));
    }

    if (fold) {
        // The host's own nodes last, inside the fold — see `ParcelCardDetailFold.hostNodes`:
        // MOVED, never copied, so the host keeps its reference and there is no second copy.
        for (const n of opts.detailFold?.hostNodes ?? []) {
            try {
                fold.body.appendChild(n);
            } catch (e) {
                console.warn('[gis][parcel-card] host node could not be placed in the fold (non-fatal):', e);
            }
        }
        root.appendChild(fold.root);
    }

    appendActions(root, opts.actions ?? []);
    return root;
}
