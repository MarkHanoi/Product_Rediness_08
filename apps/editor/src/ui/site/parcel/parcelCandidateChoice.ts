// §L-12912 / lane PT-BELVERDE-LOTS — WHICH RING IS THE PRIMARY CANDIDATE when the cadastre's
// answer is a holding, not a lot.
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────────
//
// Belverde (Seixal, Portugal), founder's SECOND report 2026-09-05 on the deployed §L-12912 fix:
// "parcel is still not correct — massive parcels incorrect". The first fix was honest — the card
// now says the 766 ha prédio AAA000091722 is a candidate, not "your parcel", and Draw is primary —
// but honesty about the wrong ring is not the founder's lot. The source hunt recorded in
// `docs/04-reference/jurisdictions/pt/findings/belverde-lot-sources-2026-09-05.md` establishes that
// NOBODY publishes Belverde's lot polygons: DGT SNIC serves the prédio, BUPi RGG has nothing there,
// DGT's OGC API `cadastro` collection has nothing there, and the Câmara Municipal do Seixal's own
// ArcGIS server publishes the loteamento PERIMETER (137 ha, alvará 6/70), the lot NUMBER as a point
// and the BUILDING outline — never the lot polygon. So the best ring the estate can put in front
// of the user at that click is the building outline, and the product must say exactly what it is.
//
// ── THE RULE (C57 §1.5 / §1.9 · C83 §1.2 · §L-640) ─────────────────────────────
//
//   oversize cadastral answer  +  an OSM footprint under the click
//       → the FOOTPRINT is the primary candidate, titled as a house outline and NOT a cadastral
//         parcel; the holding stays one deliberate click away ("Use the 766 ha holding anyway");
//         Draw stays available. The card carries BOTH numbers and names BOTH rings.
//   oversize cadastral answer  +  no footprint
//       → Draw is primary (the §L-12912 behaviour, unchanged); the holding stays a secondary commit.
//   any other size status
//       → the cadastral answer is primary, exactly as before. This helper changes nothing there.
//
// It NEVER substitutes silently: the chosen ring is returned beside the ring it displaced, with a
// sentence that says which is which and why. It never touches `confidence.match` — the footprint
// arrives `low` by construction (§L-640, `computeParcelConfidence(kind:'footprint-fallback')`) and
// this file refuses a "footprint" that is not one (wrong `source`, or a tier a footprint cannot
// carry) rather than promote it.
//
// PURE (no THREE / Cesium / DOM / network).

import type { ParcelFeature } from './ParcelProvider.js';
import type { ParcelSizeReview } from './parcelSizeReview.js';

/** Which ring the card leads with. */
export type ParcelPrimaryCandidate = 'cadastral' | 'footprint' | 'draw';

export interface ParcelCandidateChoice {
    readonly primary: ParcelPrimaryCandidate;
    /** The ring the map highlights and the card models. */
    readonly shown: ParcelFeature;
    /**
     * The oversize cadastral answer kept one deliberate click away, or null when the cadastral
     * answer IS the primary candidate (then `shown` is it).
     */
    readonly holding: ParcelFeature | null;
    /** Card heading override; null keeps the producer's default ('PARCEL'). */
    readonly cardTitle: string | null;
    /** The sentence that names both rings and both numbers; null when nothing was displaced. */
    readonly why: string | null;
    /** Label for the secondary "commit the holding" action; null when there is no holding. */
    readonly useHoldingLabel: string | null;
    /** The map chip hint for this state. */
    readonly chip: string;
}

/** §L-12912 — the card title when the footprint leads. The brief's wording, verbatim. */
export const PARCEL_FOOTPRINT_CANDIDATE_TITLE =
    'Your house outline (OSM footprint — not a cadastral parcel)';

/** `data-testid` on the "why this ring" note the host places on the card. */
export const PARCEL_CANDIDATE_WHY_TESTID = 'parcel-candidate-why';
/** `data-testid` on the secondary action that commits the displaced holding. */
export const PARCEL_USE_HOLDING_TESTID = 'parcel-use-holding-btn';

const CHIP_TAIL = ' · Esc to cancel';

/**
 * Is this feature an honest footprint fallback? The `source` must carry the sanctioned token
 * (`footprint (OSM)` — the same test `parcelFeatureToProvenance` applies), the ring must be
 * usable, and a confidence block, when present, must read `low`: a footprint that claims
 * `medium`/`high` is not one this product knows how to have produced (§L-640), so it is refused.
 */
export function isFootprintCandidate(f: ParcelFeature | null | undefined): f is ParcelFeature {
    if (!f) return false;
    if (!/^footprint\b/i.test(f.source ?? '')) return false;
    if (!Array.isArray(f.ring) || f.ring.length < 3) return false;
    if (f.confidence && f.confidence.match !== 'low') return false;
    return true;
}

function m2(n: number): string {
    // No locale separators — the same string in a screenshot and a test.
    return `${Math.round(n)} m²`;
}

function ha(n: number): string {
    return `${Math.round(n / 10_000)} ha`;
}

function footprintAreaM2(f: ParcelFeature): number | null {
    const fromConf = f.confidence?.areaSigM2;
    if (typeof fromConf === 'number' && Number.isFinite(fromConf) && fromConf > 0) return fromConf;
    return Number.isFinite(f.areaM2) && f.areaM2 > 0 ? f.areaM2 : null;
}

/**
 * Decide the primary candidate for a click whose cadastral answer has been size-reviewed.
 *
 * `size` is the review of `cadastral` (`assessParcelSize` over its card model). `footprint` is
 * whatever the footprint provider returned at the SAME click, or null. The function is total: it
 * never throws and always returns a `shown` ring.
 */
export function chooseParcelCandidate(input: {
    readonly cadastral: ParcelFeature;
    readonly size: ParcelSizeReview;
    readonly footprint: ParcelFeature | null;
}): ParcelCandidateChoice {
    const { cadastral, size, footprint } = input;

    if (size.status !== 'oversize' || size.areaM2 === null) {
        return {
            primary: 'cadastral',
            shown: cadastral,
            holding: null,
            cardTitle: null,
            why: null,
            useHoldingLabel: null,
            chip: `Review the parcel, then “Use this parcel”${CHIP_TAIL}`,
        };
    }

    const holdingArea = size.areaM2;
    const holdingBasis = size.basis === 'registry-declared' ? 'registry-declared' : 'computed from the ring';
    const holdingRef = cadastral.refcat ? cadastral.refcat : 'an unreferenced parcel';
    const useHoldingLabel = `Use the ${ha(holdingArea)} holding anyway`;
    const holdingSentence =
        `The cadastre answered this click with ${holdingRef} — ${m2(holdingArea)} (${ha(holdingArea)}), `
        + `${holdingBasis} — above the ${m2(size.ceilingM2)} review ceiling. That is the land holding the `
        + `cadastre publishes here, not your lot: the lots are not in the published cadastre.`;

    if (isFootprintCandidate(footprint)) {
        const fpArea = footprintAreaM2(footprint);
        const fpSentence = fpArea !== null
            ? `Offered instead: the OSM building outline under your click (${footprint.refcat}), `
              + `${m2(fpArea)} computed from its ring — match “low” by construction, because a `
              + `footprint is a building outline and never a cadastral parcel.`
            : `Offered instead: the OSM building outline under your click (${footprint.refcat}) — `
              + `match “low” by construction, because a footprint is a building outline and never a `
              + `cadastral parcel.`;
        return {
            primary: 'footprint',
            shown: footprint,
            holding: cadastral,
            cardTitle: PARCEL_FOOTPRINT_CANDIDATE_TITLE,
            why: `${holdingSentence} ${fpSentence} Use it as a starting boundary, draw your lot, or commit the holding deliberately.`,
            useHoldingLabel,
            chip: `The cadastre served a ${ha(holdingArea)} holding — your house outline is offered instead. `
                + `Use it, draw your lot, or use the holding deliberately${CHIP_TAIL}`,
        };
    }

    return {
        primary: 'draw',
        shown: cadastral,
        holding: cadastral,
        cardTitle: null,
        why: `${holdingSentence} No OSM building outline was found under this click, so there is nothing `
            + `smaller to offer: draw your lot, or use the holding deliberately.`,
        useHoldingLabel,
        chip: `This parcel is very large — probably not your lot. Draw your lot, or use it deliberately${CHIP_TAIL}`,
    };
}
