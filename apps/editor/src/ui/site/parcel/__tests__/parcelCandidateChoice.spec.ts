// §L-12912 / lane PT-BELVERDE-LOTS — the primary-candidate decision when the cadastre serves a
// holding, not a lot (Belverde, Seixal: founder's second report 2026-09-05).
//
// What these arms prove, in the order the founder would ask:
//   1. oversize + an OSM footprint under the click → the FOOTPRINT is primary, titled as a house
//      outline and NOT a cadastral parcel; the 766 ha holding is named, numbered and one deliberate
//      click away ("Use the 766 ha holding anyway"); Draw survives. Both numbers are in the text.
//   2. oversize without a footprint → Draw primary, holding secondary — the §L-12912 behaviour.
//   3. within → the cadastral answer is primary and nothing about the card changes.
//   4. Never a silent substitution: the footprint keeps match 'low' by construction (§L-640); a
//      "footprint" whose source or tier says otherwise is REFUSED, not promoted.
//   5. The card, built by THE one producer, renders the footprint banner, the why-note, the holding's
//      own size-review banner, and three actions in the stated order.

import { describe, it, expect } from 'vitest';
import {
    chooseParcelCandidate,
    isFootprintCandidate,
    PARCEL_FOOTPRINT_CANDIDATE_TITLE,
    PARCEL_CANDIDATE_WHY_TESTID,
    PARCEL_USE_HOLDING_TESTID,
} from '../parcelCandidateChoice.js';
import { assessParcelSize, parcelSizeReviewText, PARCEL_SIZE_REVIEW_TESTID } from '../parcelSizeReview.js';
import { buildParcelCard, parcelFeatureToCardModel } from '../parcelCard.js';
import { pickFootprintAtPoint } from '../footprintPick.js';
import { resolveParcelAttribution, PARCEL_FOOTPRINT_ATTRIBUTION } from '../parcelRegistry.js';
import type { ParcelFeature } from '../ParcelProvider.js';
import type { ContextBuildingFeature } from '../../../geospatial/contextBuildings.js';

/** A ~40 m × 40 m square ring — geometry stands in for the 500-vertex prédio; the AREAS are verbatim. */
function square(lat: number, lon: number, halfDeg: number): { lat: number; lon: number }[] {
    return [
        { lat: lat - halfDeg, lon: lon - halfDeg }, { lat: lat - halfDeg, lon: lon + halfDeg },
        { lat: lat + halfDeg, lon: lon + halfDeg }, { lat: lat + halfDeg, lon: lon - halfDeg },
    ];
}

/**
 * The Belverde holding with the figures SNIC served at the real lot point (-9.15011, 38.58370;
 * lote 797, nº 36) on 2026-09-05: AAA000091722 · areavalue 7 662 344 m² · DICOFRE 151002.
 */
const HOLDING: ParcelFeature = {
    ring: square(38.5837, -9.1501, 0.02),
    refcat: 'AAA000091722',
    areaM2: 7_662_344,
    address: 'DICOFRE 151002',
    source: 'dgt-cadastro-predial',
    confidence: {
        match: 'high',
        areaSource: 'registry-declared',
        areaOfficialM2: 7_662_344,
        areaSigM2: 7_670_659,
        areaDeltaPct: 0.1,
        pointToParcelM: 0,
        candidateMarginM: null,
        geometryComplete: true,
    },
};

/** An OSM building outline containing the lot point, produced by the REAL footprint picker. */
const OSM_HOUSE: ContextBuildingFeature = {
    type: 'Feature',
    // The picker's property bag is wider than this fixture needs; the double assertion is deliberate
    // and narrow — a direct cast is refused because the two shapes do not overlap structurally.
    properties: { osmId: 123456789, height: 6, levels: 2 } as unknown as ContextBuildingFeature['properties'],
    geometry: {
        type: 'Polygon',
        coordinates: [[
            [-9.15018, 38.58364], [-9.15004, 38.58364], [-9.15004, 38.58376], [-9.15018, 38.58376], [-9.15018, 38.58364],
        ]],
    },
} as ContextBuildingFeature;

function footprintAtLot(): ParcelFeature {
    const fp = pickFootprintAtPoint([OSM_HOUSE], -9.15011, 38.5837);
    if (!fp) throw new Error('fixture: the house must contain the lot point');
    return fp;
}

function sizeOf(f: ParcelFeature) {
    return assessParcelSize(parcelFeatureToCardModel(f, 'Cadastro Predial (Portugal · DGT / SNIC)'));
}

describe('§L-12912 chooseParcelCandidate — oversize + footprint → the footprint is primary', () => {
    it('leads with the house outline, names the 766 ha holding with both numbers, keeps Draw', () => {
        const footprint = footprintAtLot();
        const size = sizeOf(HOLDING);
        expect(size.status).toBe('oversize');

        const c = chooseParcelCandidate({ cadastral: HOLDING, size, footprint });
        expect(c.primary).toBe('footprint');
        expect(c.shown).toBe(footprint);
        expect(c.holding).toBe(HOLDING);
        expect(c.cardTitle).toBe(PARCEL_FOOTPRINT_CANDIDATE_TITLE);
        expect(c.cardTitle).toBe('Your house outline (OSM footprint — not a cadastral parcel)');
        expect(c.useHoldingLabel).toBe('Use the 766 ha holding anyway');
        // Both rings, both numbers, the basis, the ceiling — checkable, not merely believable.
        expect(c.why).toContain('AAA000091722');
        expect(c.why).toContain('7662344 m²');
        expect(c.why).toContain('766 ha');
        expect(c.why).toContain('registry-declared');
        expect(c.why).toContain('200000 m²');
        expect(c.why).toContain('OSM 123456789');
        expect(c.why).toContain(`${Math.round(footprint.areaM2)} m²`);
        expect(c.why).toContain('never a cadastral parcel');
        expect(c.chip).toContain('766 ha holding');
    });

    it('the offered footprint is low-tier by construction and attributed as OSM, never as the cadastre', () => {
        const footprint = footprintAtLot();
        expect(footprint.source).toBe('footprint (OSM)');
        expect(footprint.confidence?.match).toBe('low');
        const attribution = resolveParcelAttribution(footprint, 'Cadastro Predial (Portugal · DGT / SNIC)');
        expect(attribution.label).toBe(PARCEL_FOOTPRINT_ATTRIBUTION);
        expect(attribution.regionCode).toBeNull();
    });
});

describe('§L-12912 chooseParcelCandidate — oversize without a footprint → Draw is primary', () => {
    it('keeps the §L-12912 behaviour: cadastral ring shown, holding secondary, Draw primary', () => {
        const size = sizeOf(HOLDING);
        const c = chooseParcelCandidate({ cadastral: HOLDING, size, footprint: null });
        expect(c.primary).toBe('draw');
        expect(c.shown).toBe(HOLDING);
        expect(c.holding).toBe(HOLDING);
        expect(c.cardTitle).toBeNull();
        expect(c.useHoldingLabel).toBe('Use the 766 ha holding anyway');
        expect(c.why).toContain('No OSM building outline was found under this click');
        expect(c.why).toContain('7662344 m²');
    });
});

describe('§L-12912 chooseParcelCandidate — within → unchanged', () => {
    it('a normal urban parcel is primary even when a footprint exists under the click', () => {
        const lot: ParcelFeature = { ...HOLDING, refcat: 'AAA000000195', areaM2: 195, confidence: {
            ...HOLDING.confidence!, areaOfficialM2: 195, areaSigM2: 196,
        } };
        const size = sizeOf(lot);
        expect(size.status).toBe('within');
        const c = chooseParcelCandidate({ cadastral: lot, size, footprint: footprintAtLot() });
        expect(c.primary).toBe('cadastral');
        expect(c.shown).toBe(lot);
        expect(c.holding).toBeNull();
        expect(c.cardTitle).toBeNull();
        expect(c.why).toBeNull();
        expect(c.useHoldingLabel).toBeNull();
    });

    it('unknown / not-applicable sizes never displace the cadastral answer', () => {
        const noArea: ParcelFeature = { ...HOLDING, areaM2: NaN, confidence: undefined };
        const size = sizeOf(noArea);
        expect(size.status).toBe('unknown');
        expect(chooseParcelCandidate({ cadastral: noArea, size, footprint: footprintAtLot() }).primary).toBe('cadastral');
    });
});

describe('§L-12912 isFootprintCandidate — never a silent substitution', () => {
    it('refuses a ring whose source is not a footprint, even when it is small', () => {
        const smallCadastral: ParcelFeature = { ...HOLDING, refcat: 'AAA000000195', areaM2: 195 };
        expect(isFootprintCandidate(smallCadastral)).toBe(false);
        const c = chooseParcelCandidate({ cadastral: HOLDING, size: sizeOf(HOLDING), footprint: smallCadastral });
        expect(c.primary).toBe('draw');
        expect(c.shown).toBe(HOLDING);
    });

    it('refuses a "footprint" that carries a tier a footprint cannot have (§L-640)', () => {
        const fp = footprintAtLot();
        const promoted: ParcelFeature = { ...fp, confidence: { ...fp.confidence!, match: 'medium' } };
        expect(isFootprintCandidate(promoted)).toBe(false);
        expect(chooseParcelCandidate({ cadastral: HOLDING, size: sizeOf(HOLDING), footprint: promoted }).primary).toBe('draw');
    });

    it('refuses a degenerate ring', () => {
        const fp = footprintAtLot();
        expect(isFootprintCandidate({ ...fp, ring: fp.ring.slice(0, 2) })).toBe(false);
        expect(isFootprintCandidate(null)).toBe(false);
    });
});

describe('§L-12912 the card, built by the one producer, for the footprint-primary state', () => {
    it('renders the footprint banner, the why-note, the holding size banner and the three actions in order', () => {
        const footprint = footprintAtLot();
        const holdingModel = parcelFeatureToCardModel(HOLDING, 'Cadastro Predial (Portugal · DGT / SNIC)');
        const size = assessParcelSize(holdingModel);
        const c = chooseParcelCandidate({ cadastral: HOLDING, size, footprint });
        const shownModel = parcelFeatureToCardModel(
            c.shown, resolveParcelAttribution(c.shown, 'Cadastro Predial (Portugal · DGT / SNIC)').label,
        );
        const holdingBanner = parcelSizeReviewText(size, holdingModel)!;
        const card = buildParcelCard(shownModel, {
            title: c.cardTitle ?? undefined,
            leadNotes: [
                { text: c.why!, testId: PARCEL_CANDIDATE_WHY_TESTID },
                { text: holdingBanner, testId: PARCEL_SIZE_REVIEW_TESTID },
            ],
            actions: [
                { label: 'Use my house outline  →', testId: 'parcel-use-btn', variant: 'primary', onClick: () => {} },
                { label: c.useHoldingLabel!, testId: PARCEL_USE_HOLDING_TESTID, variant: 'secondary', onClick: () => {} },
                { label: 'Draw my lot instead', testId: 'parcel-draw-btn', variant: 'secondary', onClick: () => {} },
            ],
        });

        expect(card.getAttribute('data-parcel-kind')).toBe('footprint');
        expect(card.querySelector('.pryzm-parcel-card-title')!.textContent)
            .toBe('Your house outline (OSM footprint — not a cadastral parcel)');
        expect(card.querySelector('[data-testid="parcel-footprint-warning"]')).not.toBeNull();
        expect(card.querySelector(`[data-testid="${PARCEL_CANDIDATE_WHY_TESTID}"]`)!.textContent).toContain('766 ha');
        // The displaced holding's own review banner is kept in view (C83 §1.2 — both numbers).
        expect(card.querySelector(`[data-testid="${PARCEL_SIZE_REVIEW_TESTID}"]`)!.textContent).toContain('7662344 m²');
        expect(card.querySelector('[data-testid="parcel-source-attribution"]')!.textContent)
            .toContain(PARCEL_FOOTPRINT_ATTRIBUTION);
        expect(card.querySelector('.pryzm-parcel-card-row .pryzm-parcel-card-key')!.textContent).toBe('OSM id');

        const buttons = Array.from(card.querySelectorAll<HTMLButtonElement>('.pryzm-parcel-card-btn'));
        expect(buttons.map((b) => b.getAttribute('data-testid'))).toEqual([
            'parcel-use-btn', PARCEL_USE_HOLDING_TESTID, 'parcel-draw-btn',
        ]);
        expect(buttons[0]!.className).toContain('--primary');
        expect(buttons[1]!.textContent).toBe('Use the 766 ha holding anyway');
        expect(buttons[1]!.disabled).toBe(false); // deliberate, never disabled
        expect(buttons[2]!.className).toContain('--secondary');
    });

    it('a card with no lead notes renders exactly as before (additive option)', () => {
        const model = parcelFeatureToCardModel(HOLDING, 'Cadastro Predial (Portugal · DGT / SNIC)');
        const card = buildParcelCard(model, {});
        expect(card.querySelector(`[data-testid="${PARCEL_CANDIDATE_WHY_TESTID}"]`)).toBeNull();
        expect(card.querySelectorAll(`[data-testid="${PARCEL_SIZE_REVIEW_TESTID}"]`).length).toBe(1);
    });
});
