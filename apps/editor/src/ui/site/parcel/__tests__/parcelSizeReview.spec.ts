// §L-12912 — the parcel SIZE review (Belverde, Seixal: a 766 ha prédio presented as "your parcel").
//
// What these arms prove, in the order the founder would ask:
//   1. The Belverde ring, with the numbers SNIC actually served, is `oversize`, and the banner names
//      BOTH numbers and the source (C83 §1.2).
//   2. Every honest urban answer in the 53-row coverage corpus passes — ZERO false refusals — and the
//      corpus maximum itself (Mainz, 184 734 m²) is `within`, so the ceiling really is above the data.
//   3. A real, legitimately large RURAL parcel (Charneca de Caparica, 227 ha) is flagged but NOT
//      refused: the card still renders an ENABLED commit action.
//   4. `confidence.match` is untouched — the review is a separate flag beside the tier (C57 §2.4).
//   5. The card renders the parcel's own `source` id beside the label, not the registry's generic one.

import { describe, it, expect } from 'vitest';
import {
    assessParcelSize,
    parcelSizeReviewText,
    URBAN_PARCEL_AREA_CEILING_M2,
    PARCEL_SIZE_CORPUS,
    PARCEL_SIZE_CORPUS_AREAS_M2,
    PARCEL_SIZE_REVIEW_TESTID,
} from '../parcelSizeReview.js';
import { buildParcelCard, parcelFeatureToCardModel, type ParcelCardModel } from '../parcelCard.js';
import { parseWfsProxyResponse } from '../WfsParcelProvider.js';
import { resolveParcelAttribution, PARCEL_FOOTPRINT_ATTRIBUTION } from '../parcelRegistry.js';

/** A card model with the Belverde figures VERBATIM from the 2026-09-05 SNIC probe. */
const BELVERDE: ParcelCardModel = {
    kind: 'cadastral',
    source: 'dgt-cadastro-predial',
    label: 'Cadastro Predial (Portugal · DGT / SNIC)',
    refcat: 'AAA000091722',
    address: 'DICOFRE 151002',
    jurisdictionId: 'PT',
    sourceCrs: null,
    license: null,
    ingestTimestamp: null,
    areaOfficialM2: 7_662_344,
    areaSigM2: 7_670_659,
    areaSource: 'registry-declared',
    matchTier: 'high',
    geometryComplete: true,
};

const model = (over: Partial<ParcelCardModel>): ParcelCardModel => ({ ...BELVERDE, ...over });

/** The proxy row `/api/parcel/pt` returns for the Belverde click, post-§L-12912 (two area fields). */
const BELVERDE_PROXY_ROW = {
    parcel: {
        ring: [
            { lat: 38.5725, lon: -9.166 }, { lat: 38.5725, lon: -9.134 },
            { lat: 38.5975, lon: -9.134 }, { lat: 38.5975, lon: -9.166 },
        ],
        refcat: 'AAA000091722',
        areaM2: 7_662_344,
        areaOfficialM2: 7_662_344,
        areaSigM2: 7_670_659,
        address: 'DICOFRE 151002',
        source: 'dgt-cadastro-predial',
    },
};

describe('§L-12912 — the ceiling is derived from the measured corpus, not guessed', () => {
    it('the corpus is the 53 wired rows and its maximum is Mainz at 184 734 m²', () => {
        expect(PARCEL_SIZE_CORPUS_AREAS_M2).toHaveLength(53);
        expect(PARCEL_SIZE_CORPUS.rows).toBe(53);
        expect(PARCEL_SIZE_CORPUS.maxAreaM2).toBe(184_734);
        expect(PARCEL_SIZE_CORPUS_AREAS_M2.find(([cc]) => cc === 'de-rp')?.[1]).toBe(184_734);
    });

    it('the ceiling is the corpus maximum rounded UP to one significant figure', () => {
        const max = PARCEL_SIZE_CORPUS.maxAreaM2;
        const magnitude = 10 ** Math.floor(Math.log10(max));
        expect(URBAN_PARCEL_AREA_CEILING_M2).toBe(Math.ceil(max / magnitude) * magnitude);
        expect(URBAN_PARCEL_AREA_CEILING_M2).toBe(200_000);
    });

    it('ZERO false refusals: every honest urban answer in the corpus is `within`', () => {
        for (const [cc, area] of PARCEL_SIZE_CORPUS_AREAS_M2) {
            const r = assessParcelSize(model({ areaOfficialM2: null, areaSigM2: area, areaSource: 'derived-from-ring' }));
            expect(r.status, `${cc} @ ${area} m²`).toBe('within');
        }
    });

    it('the corpus maximum itself (Mainz) is `within` — the ceiling sits above the data, not on it', () => {
        const r = assessParcelSize(model({ areaOfficialM2: 184_734, areaSigM2: 184_800 }));
        expect(r.status).toBe('within');
        expect(parcelSizeReviewText(r, BELVERDE)).toBeNull();
    });
});

describe('§L-12912 — Belverde: the 766 ha prédio is a candidate, with both numbers and the source', () => {
    it('is `oversize`, judged on the registry figure, 41× the corpus maximum', () => {
        const r = assessParcelSize(BELVERDE);
        expect(r.status).toBe('oversize');
        expect(r.basis).toBe('registry-declared');
        expect(r.areaM2).toBe(7_662_344);
        expect(r.multiple).toBe(41.5);
        expect(r.ceilingM2).toBe(200_000);
    });

    it('the banner carries the registry area, the ring area, the ceiling, the corpus max and the source', () => {
        const text = parcelSizeReviewText(assessParcelSize(BELVERDE), BELVERDE)!;
        expect(text).toContain('7662344 m²');
        expect(text).toContain('766 ha');
        expect(text).toContain('7670659 m² from the ring');
        expect(text).toContain('200000 m²');
        expect(text).toContain('184734 m²');
        expect(text).toContain('41.5×');
        expect(text).toContain('Source: Cadastro Predial (Portugal · DGT / SNIC)');
        expect(text).toContain('Draw your lot instead');
    });

    it('the founder\'s actual card shape (proxy row → feature → model) is oversize and HIGH-confidence — the two are different facts', () => {
        const feature = parseWfsProxyResponse(BELVERDE_PROXY_ROW, 'unused')!;
        expect(feature.confidence?.match).toBe('high');            // a real cadastral parcel, registry area, click inside
        expect(feature.confidence?.areaSource).toBe('registry-declared');
        expect(feature.confidence?.areaOfficialM2).toBe(7_662_344);
        const m = parcelFeatureToCardModel(feature, 'Cadastro Predial (Portugal · DGT / SNIC)');
        expect(assessParcelSize(m).status).toBe('oversize');
        expect(m.matchTier).toBe('high');                          // the review did not touch the tier
    });

    it('the card renders the size banner above the numbers, and every action stays ENABLED', () => {
        const card = buildParcelCard(BELVERDE, {
            actions: [
                { label: 'Draw my lot instead  →', testId: 'parcel-draw-btn', variant: 'primary', onClick: () => {} },
                { label: 'Use this large parcel anyway', testId: 'parcel-use-btn', variant: 'secondary', onClick: () => {} },
            ],
        });
        expect(card.getAttribute('data-parcel-size-review')).toBe('oversize');
        const banner = card.querySelector(`[data-testid="${PARCEL_SIZE_REVIEW_TESTID}"]`)!;
        expect(banner).not.toBeNull();
        expect(banner.textContent).toContain('7662344 m²');
        // The banner precedes the identifier row — a reader who stops after one line has been told.
        const rows = Array.from(card.children).map((c) => c.getAttribute('data-testid') ?? c.className);
        expect(rows.indexOf(PARCEL_SIZE_REVIEW_TESTID)).toBeLessThan(rows.findIndex((r) => r === 'pryzm-parcel-card-row'));
        // Both areas still render as their own facts.
        expect(card.textContent).toContain('Area (registry)');
        expect(card.textContent).toContain('Area (from ring)');
        // Not a refusal: the commit button exists and is enabled.
        const use = card.querySelector<HTMLButtonElement>('[data-testid="parcel-use-btn"]')!;
        expect(use.disabled).toBe(false);
    });
});

describe('§L-12912 — an honest rural cadastre is flagged, never refused', () => {
    // AAA000060701 — Charneca de Caparica (DICOFRE 150314), 2 269 159 m² registry, 224 vertices:
    // a real rural holding in the same 2026-09-05 census, 1.5 km from Belverde.
    const RURAL = model({ refcat: 'AAA000060701', address: 'DICOFRE 150314', areaOfficialM2: 2_269_159, areaSigM2: 2_272_317 });

    it('227 ha is `oversize` — the banner says so with both numbers', () => {
        const r = assessParcelSize(RURAL);
        expect(r.status).toBe('oversize');
        expect(parcelSizeReviewText(r, RURAL)).toContain('2269159 m² (227 ha) registry-declared');
    });

    it('the card still offers an enabled commit — the review changes emphasis, not permission', () => {
        const card = buildParcelCard(RURAL, {
            actions: [{ label: 'Use this large parcel anyway', testId: 'parcel-use-btn', variant: 'secondary', onClick: () => {} }],
        });
        expect(card.querySelector<HTMLButtonElement>('[data-testid="parcel-use-btn"]')!.disabled).toBe(false);
    });

    it('a ring-derived area is judged when no registry area exists, and says so', () => {
        const r = assessParcelSize(model({ areaOfficialM2: null, areaSource: 'derived-from-ring' }));
        expect(r.status).toBe('oversize');
        expect(r.basis).toBe('derived-from-ring');
        expect(parcelSizeReviewText(r, model({ areaOfficialM2: null }))).toContain('computed from the ring');
    });

    it('a hand-drawn ring is not reviewed, and a model with no area is `unknown` — never a zero', () => {
        expect(assessParcelSize(model({ kind: 'user-drawn' })).status).toBe('not-applicable');
        expect(assessParcelSize(model({ areaOfficialM2: null, areaSigM2: null })).status).toBe('unknown');
        expect(buildParcelCard(model({ areaOfficialM2: 600, areaSigM2: 605 })).getAttribute('data-parcel-size-review')).toBe('within');
    });
});

describe('§L-12912 — the card names the cadastre that answered, not the registry\'s generic label', () => {
    it('renders the per-parcel source id beside the label when they differ', () => {
        const card = buildParcelCard(BELVERDE);
        expect(card.querySelector('[data-testid="parcel-source-attribution"]')!.textContent)
            .toBe('Source: Cadastro Predial (Portugal · DGT / SNIC) · dgt-cadastro-predial');
    });

    it('renders the label alone when it already IS the source', () => {
        const card = buildParcelCard(model({ label: 'dgt-cadastro-predial' }));
        expect(card.querySelector('[data-testid="parcel-source-attribution"]')!.textContent)
            .toBe('Source: dgt-cadastro-predial');
    });

    it('resolveParcelAttribution: a PT ring stamped dgt-cadastro-predial resolves to the DGT label, never the registry\'s', () => {
        const feature = parseWfsProxyResponse(BELVERDE_PROXY_ROW, 'unused')!;
        const a = resolveParcelAttribution(feature, 'Cadastral parcel / building footprint');
        expect(a.label).toBe('Cadastro Predial (Portugal · DGT / SNIC)');
        expect(a.regionCode).toBe('PT');
    });

    it('resolveParcelAttribution: a footprint fallback never inherits a cadastre\'s label', () => {
        const feature = parseWfsProxyResponse({ parcel: { ...BELVERDE_PROXY_ROW.parcel, source: 'footprint (OSM)' } }, 'unused')!;
        const a = resolveParcelAttribution(feature, 'Cadastral parcel / building footprint');
        expect(a.label).toBe(PARCEL_FOOTPRINT_ATTRIBUTION);
        expect(a.regionCode).toBeNull();
    });
});
