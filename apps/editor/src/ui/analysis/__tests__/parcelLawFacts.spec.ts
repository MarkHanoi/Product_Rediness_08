// §PARCEL-LAW-MODEL (STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §25.11 clauses 2–3) — the tab's
// rendering of the shared model, exercised as DOM.
//
// ⚠ WHY THIS FILE EXISTS SEPARATELY FROM `parcelLawModel.spec.ts`. That spec proves the MODEL
// is honest; this one proves the honesty SURVIVES THE RENDER. They are different failures and
// this repo has paid for the second one before: a value that is correctly `null` and then
// printed as `0`, or as an empty row, is indistinguishable to the reader from a derived
// figure — "an honest signal that is not LEGIBLE is not honest in effect" (§L-527/§L-553).
// So every assertion here is about what a person would SEE.
//
// It also pins REACHABILITY: `mountParcelLawTab` puts this section in the tab body with the
// PRODUCTION reader and renderer when a spec omits them, so a section that threw would be
// swallowed by the tab's non-fatal catch and simply not be there. That is the "committed ≠
// reachable" defect, and the last test is the one that would catch it.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    NOT_DERIVED_TEXT,
    PARCEL_LAW_BASIS_ATTR,
    PARCEL_LAW_ENVELOPE_ABSENT_TESTID,
    PARCEL_LAW_EQUAL_DIVISION_LEDE,
    PARCEL_LAW_FACTS_TESTID,
    PARCEL_LAW_FACT_PREFIX,
    PARCEL_LAW_GEOMETRY_ABSENT_TESTID,
    PARCEL_LAW_MEASURED_NOTE,
    PARCEL_LAW_MERGED_ATTR,
    PARCEL_LAW_REFUSAL_TESTID,
    PARCEL_LAW_SCENE_AREA_LABEL,
    buildParcelLawFacts,
    parcelRingMeasuredFacts,
} from '../parcelLawFacts';
import {
    PARCEL_LAW_DUPLICATE_REMOVED_ATTR,
    PARCEL_LAW_FACTS_LAW_SLOT_TESTID,
    PARCEL_LAW_FACTS_PLOT_SLOT_TESTID,
    PARCEL_LAW_PANEL_SLOT_TESTID,
    defaultParcelLawTabDeps,
    mountParcelLawTab,
    type ParcelLawCapabilityHost,
    type ParcelLawTabDeps,
} from '../parcelLawTab';
import { buildParcelLawModel } from '../../site/parcel/parcelLawModel';
import { parcelProvenanceToCardModel } from '../../site/parcel/parcelCard';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

const RECT = [
    { x: 0, z: 0 },
    { x: 40, z: 0 },
    { x: 40, z: 20 },
    { x: 0, z: 20 },
];

function envelope(over: Record<string, unknown> = {}): never {
    return {
        insetPolygon: [
            { x: 3, z: 3 }, { x: 37, z: 3 }, { x: 37, z: 17 }, { x: 3, z: 17 },
        ],
        insetAreaM2: 476,
        maxHeight_m: 18,
        farLimitedHeight_m: null,
        maxFloors: 6,
        maxFAR: 3.5,
        maxCoverage: 0.6,
        maxVolumeM3: 8568,
        footprintIsUpperBound: false,
        confidence: 'structured',
        granularity: 'parcel',
        status: 'ok',
        refusal: null,
        zoneCode: '13b',
        derivation: [
            { constraint: 'setback.front', value: 3, source: 'catastro-es', ordinanceRef: 'PGM Art. 242.2' },
            { constraint: 'setback.side', value: 3, source: 'catastro-es', ordinanceRef: null },
            { constraint: 'setback.rear', value: 3, source: 'catastro-es', ordinanceRef: null },
        ],
        caveats: [], tiers: [], permittedUse: [],
        ...over,
    } as never;
}

const fact = (root: HTMLElement, key: string): HTMLElement | null =>
    root.querySelector(`[data-testid="${PARCEL_LAW_FACT_PREFIX}${key}"]`);
const valueOf = (root: HTMLElement, key: string): string =>
    fact(root, key)?.querySelector('.anl-plaw-val')?.textContent ?? '';

describe('§25.11 — the tab states every migrated row, in the founder\'s own groups', () => {
    const model = buildParcelLawModel({
        parcelRing: RECT,
        edgeClassifications: ['front', 'side', 'rear', 'side'],
        identity: null,
        envelope: envelope(),
    });
    const root = buildParcelLawFacts(model);

    it('PARCEL — area, perimeter, bounding box and the edge count with its frontage clause', () => {
        expect(root.getAttribute('data-testid')).toBe(PARCEL_LAW_FACTS_TESTID);
        expect(valueOf(root, 'parcel-area')).toContain('800');
        expect(valueOf(root, 'parcel-perimeter')).toContain('120');
        expect(valueOf(root, 'parcel-bbox')).toBe('40.0 × 20.0 m');
        // The clause is part of the value, not a separate row — the count alone would let a
        // reader assume frontage was measured when it may never have been (§GR-10/GR-14).
        expect(valueOf(root, 'parcel-edges')).toBe('4 (1 street frontage)');
    });

    it('ORDINANCE LIMITS — setbacks, height, storeys, FAR and coverage AS PERCENT', () => {
        expect(valueOf(root, 'setback-front')).toBe('3.0 m');
        expect(valueOf(root, 'setback-side')).toBe('3.0 m');
        expect(valueOf(root, 'setback-rear')).toBe('3.0 m');
        expect(valueOf(root, 'max-height')).toBe('18.0 m');
        expect(valueOf(root, 'storeys')).toBe('6');
        expect(valueOf(root, 'max-far')).toBe('3.50');
        expect(valueOf(root, 'max-coverage')).toBe('60 %');
    });

    it('MASSING POTENTIAL — footprint, coverage, footprint perimeter, GFA, study volume', () => {
        expect(valueOf(root, 'footprint')).toContain('476');
        expect(valueOf(root, 'coverage')).toBe('60 %');
        expect(valueOf(root, 'footprint-perimeter')).toContain('96');
        expect(valueOf(root, 'gfa')).toContain('2,856');
        expect(valueOf(root, 'study-volume')).toContain('8,568');
    });

    it('PER STOREY — a labelled band table, ground first', () => {
        expect(root.querySelectorAll('[data-testid^="parcel-law-storey-"]')).toHaveLength(6);
        const ground = root.querySelector('[data-testid="parcel-law-storey-0"]');
        expect(ground?.textContent).toContain('Ground');
        expect(ground?.textContent).toContain('0.0–3.0 m');
        expect(root.querySelector('[data-testid="parcel-law-storey-1"]')?.textContent).toContain('Level 1');
    });

    it('CAPACITY — the module, the count and the article, for the zone it governs', () => {
        expect(valueOf(root, 'dwelling-module')).toBe('80 m² per dwelling');
        expect(valueOf(root, 'max-dwellings')).toBe('≈ 36');
        expect(valueOf(root, 'capacity-source')).toContain('Art. 323');
    });
});

describe('§25.11 — a withheld value READS as withheld, and never as a number', () => {
    it('⭐ every null renders the words "not derived", flagged so a spec and a reader agree', () => {
        const model = buildParcelLawModel({
            parcelRing: RECT,
            edgeClassifications: undefined,
            identity: null,
            envelope: envelope({
                maxFloors: null, maxHeight_m: null, maxFAR: null, maxCoverage: null,
                maxVolumeM3: null,
                derivation: [],
            }),
        });
        const root = buildParcelLawFacts(model);
        for (const key of ['max-height', 'storeys', 'max-far', 'max-coverage', 'gfa', 'study-volume']) {
            expect(valueOf(root, key)).toBe(NOT_DERIVED_TEXT);
            expect(fact(root, key)?.getAttribute('data-derived')).toBe('false');
        }
        // ⛔ C84 EI-1b — not a zero anywhere among the withheld rows, and not a bare dash.
        for (const key of ['max-height', 'storeys', 'max-far', 'gfa']) {
            expect(valueOf(root, key)).not.toMatch(/^0([.,]0+)?/);
            expect(valueOf(root, key)).not.toBe('—');
        }
        // …and PER STOREY is absent entirely rather than a table of invented bands.
        expect(root.querySelectorAll('[data-testid^="parcel-law-storey-"]')).toHaveLength(0);
    });

    it('an unreadable ring says so, and withholds area rather than printing 0 m²', () => {
        const root = buildParcelLawFacts(buildParcelLawModel({
            parcelRing: null, edgeClassifications: undefined, identity: null, envelope: envelope(),
        }));
        const miss = root.querySelector(`[data-testid="${PARCEL_LAW_GEOMETRY_ABSENT_TESTID}"]`);
        expect(miss).not.toBeNull();
        expect(miss!.textContent).toContain('missing READ, not a missing constraint');
        expect(fact(root, 'parcel-area')).toBeNull();
        expect(valueOf(root, 'coverage')).toBe(NOT_DERIVED_TEXT);
    });
});

describe('§25.11 — a refusal and an absence are ANSWERS with their own bodies', () => {
    it('a refusal states its reason and shows NO numeric ordinance rows', () => {
        const root = buildParcelLawFacts(buildParcelLawModel({
            parcelRing: RECT,
            edgeClassifications: undefined,
            identity: null,
            envelope: envelope({
                status: 'not-applicable', insetPolygon: [], insetAreaM2: 0,
                maxHeight_m: null, maxFloors: null, maxFAR: null, maxCoverage: null, maxVolumeM3: null,
                refusal: {
                    code: 'zone-rules-not-encoded',
                    headline: 'PRYZM has not encoded this zone yet',
                    detail: 'A coverage gap, not a legal finding.',
                    legallyGrounded: false,
                    knownFacts: ['Zone 22a identified'],
                    ordinanceRef: null,
                },
            }),
        }));
        const box = root.querySelector(`[data-testid="${PARCEL_LAW_REFUSAL_TESTID}"]`);
        expect(box).not.toBeNull();
        expect(box!.getAttribute('data-refusal-code')).toBe('zone-rules-not-encoded');
        expect(box!.getAttribute('data-legally-grounded')).toBe('false');
        expect(box!.textContent).toContain('Zone 22a identified');
        // §L-550/§L-553 — three dashes would read as "not filled in yet".
        expect(fact(root, 'max-height')).toBeNull();
        expect(fact(root, 'footprint')).toBeNull();
        // …but the parcel is still measured and still shown.
        expect(valueOf(root, 'parcel-area')).toContain('800');
    });

    it('no determination at all names the ROUTE, and estimates nothing meanwhile', () => {
        const root = buildParcelLawFacts(buildParcelLawModel({
            parcelRing: RECT, edgeClassifications: undefined, identity: null, envelope: null,
        }));
        const miss = root.querySelector(`[data-testid="${PARCEL_LAW_ENVELOPE_ABSENT_TESTID}"]`);
        expect(miss).not.toBeNull();
        expect(miss!.textContent).toContain('Commit a plot on the 2D map');
        expect(miss!.textContent).toContain('Nothing is estimated in the meantime');
    });

    it('a STORED determination wears its date — recency is never fabricated (C58 §1.4)', () => {
        const root = buildParcelLawFacts(buildParcelLawModel({
            parcelRing: RECT, edgeClassifications: undefined, identity: null,
            envelope: envelope(), determinedAtIso: '2026-08-21T09:14:00Z',
        }));
        expect(root.textContent).toContain('2026-08-21T09:14:00Z');
        expect(root.textContent).toContain('Nothing has been re-derived');
    });
});

describe('§25.11 — REACHABILITY: the section is really in the tab body', () => {
    it('⭐ mountParcelLawTab renders it with the PRODUCTION reader and renderer', () => {
        // The tab's fact render is wrapped in a non-fatal catch, so a section that threw would
        // be silently absent — "committed ≠ reachable". This is the assertion that notices.
        const host = document.createElement('div');
        document.body.appendChild(host);
        const capabilityHost: ParcelLawCapabilityHost = {
            pryzmGetSiteViewState: () => ({ segment: '2D', formaMode: 'plan', buildingFidelity: 'real' }),
        };
        const deps: ParcelLawTabDeps = {
            capabilityHost,
            runtime: null,
            buildParcelPanel: () => {
                const el = document.createElement('div');
                return { element: el, dispose: () => { /* noop */ } };
            },
            mountSwitcher: () => {
                const el = document.createElement('div');
                return { element: el, repaint: () => { /* noop */ }, dispose: () => { /* noop */ } };
            },
            wireStrip: () => 0,
            // ⛔ readParcelLawModel / renderParcelLawFacts deliberately OMITTED — the point of
            // this test is that the PRODUCTION pair runs.
        };
        const h = mountParcelLawTab(host, deps);
        // §PL-IA-Q (L-12998) put the ONE model into TWO slots. ⭐ §26.6 rule 1 (L-13046, founder
        // 2026-09-07: *"ALL THIS DATA IS DUPLICATED … NOT DUPLICATED NOT THERE"*) took the LAW half
        // back out: ORDINANCE LIMITS · MASSING POTENTIAL · PER STOREY · CAPACITY are owned by the
        // envelope card's *Full site & massing data* fold, in the same question, and the tab no
        // longer renders a second copy. ⛔ The point of this test is UNCHANGED for the plot half:
        // the production reader and renderer really run inside the tab body, and the unreadable
        // ring still arrives as a SENTENCE rather than an empty box.
        const plot = h.element.querySelector(`[data-testid="${PARCEL_LAW_FACTS_PLOT_SLOT_TESTID}"]`);
        const law = h.element.querySelector(`[data-testid="${PARCEL_LAW_FACTS_LAW_SLOT_TESTID}"]`);
        expect(plot).not.toBeNull();
        expect(law).not.toBeNull();
        expect(plot!.querySelector(`[data-testid="${PARCEL_LAW_FACTS_TESTID}"]`)).not.toBeNull();
        expect(plot!.querySelector(`[data-testid="${PARCEL_LAW_GEOMETRY_ABSENT_TESTID}"]`)).not.toBeNull();
        // ⛔ THE DUPLICATE IS GONE, AND THE SLOT SAYS SO — "moved to its owner" must be readable,
        // not inferred from an empty element (the L-13005 rule, applied to question 2).
        expect(law!.querySelector(`[data-testid="${PARCEL_LAW_FACTS_TESTID}"]`)).toBeNull();
        expect(law!.querySelector(`[data-testid="${PARCEL_LAW_ENVELOPE_ABSENT_TESTID}"]`)).toBeNull();
        expect(law!.getAttribute(PARCEL_LAW_DUPLICATE_REMOVED_ATTR)).toBe('envelope-card-site-data-fold');
        h.dispose();
        host.remove();
    });
});

// ═══════════════════════════════════════════════════════════════════════════════════════
// §ONE-PARCEL-BLOCK (L-13005) — ONE BLOCK, ONE TYPOGRAPHY, BOTH AREAS
// ═══════════════════════════════════════════════════════════════════════════════════════
//
// Founder 2026-09-06, red-boxing the second of two blocks headed PARCEL: *"the data of the
// parcel is incorrect format."* Question 1 rendered the parcel twice — the cadastral card,
// then a right-aligned figure list with an area of its own.
//
// ⛔ THE CONSTRAINT THAT MAKES THE FIX CORRECT, AND THE ONLY ONE THAT COULD MAKE IT WRONG:
// 801 m² and 803 m² are DIFFERENT FACTS — registry-declared vs measured from the ring — and
// collapsing them into one number would be a C57 §1.9 / §2.4 attribution loss. So the last
// test here is the one the change is subject to: ONE block, and BOTH numbers still in it,
// each labelled with where it came from.

const CADASTRAL_PROVENANCE = {
    kind: 'cadastral' as const,
    source: 'catastro',
    label: 'Catastro (Spain)',
    sourceVersion: null,
    retrievedAt: null,
    license: 'CC BY 4.0 · Dirección General del Catastro',
    sourceCrs: 'EPSG:25830',
    refcat: '3332402DF3833C',
    address: 'CL DOCTOR TRUETA 170 BARCELONA',
    jurisdictionId: 'ES',
    ingestTimestamp: '2026-09-06T20:15:19.569Z',
    confidence: {
        match: 'high' as const,
        areaSource: 'registry-declared' as const,
        areaOfficialM2: 801,
        // 800 is the shoelace over RECT above, so the card's ring row and the model's scene
        // measurement PRINT THE SAME NUMBER — the arm where one row states both.
        areaSigM2: 800,
        areaDeltaPct: null,
        pointToParcelM: null,
        candidateMarginM: null,
        geometryComplete: true,
    },
};

describe('§ONE-PARCEL-BLOCK — the ring measurements travel to the card, and nothing is lost', () => {
    const withIdentity = (over: Record<string, unknown> = {}): ReturnType<typeof buildParcelLawModel> =>
        buildParcelLawModel({
            parcelRing: RECT,
            edgeClassifications: ['front', 'side', 'rear', 'side'],
            identity: parcelProvenanceToCardModel({ ...CADASTRAL_PROVENANCE, ...over } as never),
            committedAreaM2: 800,
            envelope: envelope(),
        });

    it('projects perimeter, bounding box and boundary edges onto the card row shape', () => {
        const extras = parcelRingMeasuredFacts(withIdentity())!;
        expect(extras).not.toBeNull();
        const byId = new Map(extras.facts.map((f) => [f.testId, f]));
        expect(byId.get(`${PARCEL_LAW_FACT_PREFIX}parcel-perimeter`)?.value).toContain('120');
        expect(byId.get(`${PARCEL_LAW_FACT_PREFIX}parcel-bbox`)?.value).toBe('40.0 × 20.0 m');
        expect(byId.get(`${PARCEL_LAW_FACT_PREFIX}parcel-edges`)?.value).toBe('4 (1 street frontage)');
    });

    it('⭐ keeps the testids the retired block used — no figure loses its handle in the move', () => {
        const extras = parcelRingMeasuredFacts(withIdentity())!;
        for (const key of ['parcel-perimeter', 'parcel-bbox', 'parcel-edges']) {
            expect(extras.facts.some((f) => f.testId === `${PARCEL_LAW_FACT_PREFIX}${key}`)).toBe(true);
        }
    });

    it('states HOW they were measured — a third provenance in the block, named (C57 §1.9)', () => {
        expect(parcelRingMeasuredFacts(withIdentity())!.note).toBe(PARCEL_LAW_MEASURED_NOTE);
    });

    it('withholds a scene-area row when it PRINTS THE SAME as the card ring area', () => {
        // The card already says "Area (from ring) 800 m²"; a second identical row is exactly
        // the duplication this lane removed.
        const extras = parcelRingMeasuredFacts(withIdentity())!;
        expect(extras.facts.some((f) => f.label === PARCEL_LAW_SCENE_AREA_LABEL)).toBe(false);
    });

    it('⭐ SHOWS a labelled scene-area row when it prints DIFFERENTLY — disagreement is information', () => {
        const extras = parcelRingMeasuredFacts(withIdentity({
            confidence: { ...CADASTRAL_PROVENANCE.confidence, areaSigM2: 803 },
        }))!;
        const scene = extras.facts.find((f) => f.label === PARCEL_LAW_SCENE_AREA_LABEL);
        expect(scene, 'two ring measurements that print differently must both be shown').toBeDefined();
        expect(scene!.value).toContain('800');
        expect(scene!.hint ?? '').toContain('committed');
    });

    it('returns null — never an empty block — when the ring could not be read', () => {
        expect(parcelRingMeasuredFacts(buildParcelLawModel({
            parcelRing: null, edgeClassifications: undefined, identity: null, envelope: envelope(),
        }))).toBeNull();
    });

    it('the `plot` rendering no longer draws a SECOND parcel group, and SAYS the rows moved', () => {
        const root = buildParcelLawFacts(withIdentity(), { scope: 'plot' });
        expect(fact(root, 'parcel-area')).toBeNull();
        expect(fact(root, 'parcel-perimeter')).toBeNull();
        expect(fact(root, 'parcel-bbox')).toBeNull();
        expect(fact(root, 'parcel-edges')).toBeNull();
        // ⛔ "the rows moved" and "the rows are gone" are opposite facts, and an empty element
        // alone conflates them. The attribute is what keeps them apart for the next reader.
        expect(root.getAttribute(PARCEL_LAW_MERGED_ATTR)).toBe('card');
    });

    it('⛔ the ABSENCE SENTENCE still renders in `plot` — a card row cannot state a missing READ', () => {
        const root = buildParcelLawFacts(buildParcelLawModel({
            parcelRing: null, edgeClassifications: undefined, identity: null, envelope: envelope(),
        }), { scope: 'plot' });
        expect(root.querySelector(`[data-testid="${PARCEL_LAW_GEOMETRY_ABSENT_TESTID}"]`)).not.toBeNull();
        expect(root.getAttribute(PARCEL_LAW_MERGED_ATTR)).toBeNull();
    });

    it('`all` is UNCHANGED — a host with no card beside it still gets every row', () => {
        const root = buildParcelLawFacts(withIdentity());
        expect(valueOf(root, 'parcel-area')).toContain('800');
        expect(valueOf(root, 'parcel-perimeter')).toContain('120');
        expect(root.getAttribute(PARCEL_LAW_MERGED_ATTR)).toBeNull();
    });
});

describe('§ONE-PARCEL-BLOCK — END TO END: question 1, with the REAL producers', () => {
    function fakeRuntime(site: unknown): PryzmRuntime {
        const listeners = new Set<() => void>();
        return {
            siteModelStore: {
                getSite: () => site,
                subscribe: (l: () => void) => { listeners.add(l); return () => listeners.delete(l); },
            },
        } as unknown as PryzmRuntime;
    }

    it('⭐ ONE element headed PARCEL, carrying BOTH areas AND the ring measurements', () => {
        const site = {
            parcel: {
                boundary: { polygon: RECT, edgeClassifications: ['front', 'side', 'rear', 'side'] },
                area: 800,
                provenance: CADASTRAL_PROVENANCE,
            },
        };
        const hostEl = document.createElement('div');
        document.body.appendChild(hostEl);
        const seam = (h: HTMLElement | null): boolean => { void h; return false; };
        const previous = window.pryzmMountEnvelopeCard;
        window.pryzmMountEnvelopeCard = seam;
        const h = mountParcelLawTab(hostEl, {
            ...defaultParcelLawTabDeps(),
            capabilityHost: { pryzmMountEnvelopeCard: seam } as ParcelLawCapabilityHost,
            runtime: fakeRuntime(site),
        });

        const q1 = h.element.querySelector(`[data-testid="${PARCEL_LAW_PANEL_SLOT_TESTID}"]`)!;
        expect(q1).not.toBeNull();

        // ⛔ EXACTLY ONE BLOCK. Two elements headed PARCEL in question 1 is the defect itself.
        const cards = q1.querySelectorAll('[data-testid="parcel-info-card"]');
        expect(cards, 'question 1 must render the parcel ONCE').toHaveLength(1);
        const card = cards[0] as HTMLElement;

        // ⭐ BOTH AREAS SURVIVE, each labelled with where it came from. This is the assertion
        // the whole change is subject to: 801 is what the cadastre publishes, 800 is measured
        // over the ring, and one number in place of two would be an attribution loss.
        const text = card.textContent ?? '';
        expect(text).toContain('Area (registry)');
        expect(text).toContain('801');
        expect(text).toContain('Area (from ring)');
        expect(text).toContain('800');

        // …and every figure the retired second block carried is in that SAME element.
        expect(card.querySelector(`[data-testid="${PARCEL_LAW_FACT_PREFIX}parcel-perimeter"]`)).not.toBeNull();
        expect(card.querySelector(`[data-testid="${PARCEL_LAW_FACT_PREFIX}parcel-bbox"]`)).not.toBeNull();
        expect(card.querySelector(`[data-testid="${PARCEL_LAW_FACT_PREFIX}parcel-edges"]`)).not.toBeNull();
        expect(text).toContain('120');
        // Source and retrieved-at are untouched by the merge.
        expect(text).toContain('Catastro (Spain)');
        expect(text).toContain('2026-09-06T20:15:19.569Z');
        // ONE TYPOGRAPHY: every row in the block is a card row, none is an `anl-plaw-row`.
        expect(card.querySelectorAll('.anl-plaw-row')).toHaveLength(0);
        expect(card.querySelectorAll('.pryzm-parcel-card-row').length).toBeGreaterThanOrEqual(7);

        // ⛔ AND THE SECOND BLOCK IS GONE FROM QUESTION 1 — not merely quieter. The plot-scope
        // rendering states that its rows moved rather than leaving an ambiguous empty element.
        const plotSlot = h.element.querySelector(`[data-testid="${PARCEL_LAW_FACTS_PLOT_SLOT_TESTID}"]`)!;
        expect(plotSlot.querySelector(`[data-testid="${PARCEL_LAW_FACT_PREFIX}parcel-perimeter"]`)).toBeNull();
        expect(
            plotSlot.querySelector(`[${PARCEL_LAW_MERGED_ATTR}="card"]`),
            'the plot rendering must SAY the rows moved, not merely be empty',
        ).not.toBeNull();

        h.dispose();
        hostEl.remove();
        if (previous) window.pryzmMountEnvelopeCard = previous;
        else delete window.pryzmMountEnvelopeCard;
    });
});

// ── §LAW-ROW-BASIS (L-13018) — the row vocabulary, pinned on the founder's OWN pair ──────────
//
// Founder 2026-09-06: *"this data is still not well formatted … every row has the same visual
// weight, so `Max height 22.4 m` (a hard legal ceiling) reads exactly like `Footprint perimeter
// 85.7 m` (a derived convenience), and the six PER STOREY rows repeat `452 m²` six times without
// conveying that they are an EQUAL DIVISION rather than six measured facts."*
//
// ⚠ THESE ARE NOT STYLE ASSERTIONS AND THEY DELIBERATELY DO NOT READ A FONT-WEIGHT. Weight is a
// rendering of the BASIS, and the basis is the thing that must not rot: a future row added to
// ORDINANCE LIMITS without a basis silently reads as derived, and a future "tidy-up" that drops
// three of the six storey rows is exactly what the founder forbade. Pinning `data-basis` and the
// row COUNT catches both; pinning `750` catches a designer.
describe('§LAW-ROW-BASIS (L-13018) — a legal ceiling is distinguishable from a derived figure', () => {
    const model = buildParcelLawModel({
        parcelRing: RECT,
        edgeClassifications: ['front', 'side', 'rear', 'side'],
        identity: null,
        envelope: envelope(),
    });
    const root = buildParcelLawFacts(model);
    const basisOf = (key: string): string | null =>
        fact(root, key)?.getAttribute(PARCEL_LAW_BASIS_ATTR) ?? null;

    it('THE FOUNDER\'S OWN PAIR: Max height is a ceiling, Footprint perimeter is derived', () => {
        expect(basisOf('max-height')).toBe('ceiling');
        expect(basisOf('footprint-perimeter')).toBe('derived');
        // They must not merely differ — each must be the RIGHT one. A swap would pass a
        // "they are different" assertion and be the exact defect inverted.
        expect(basisOf('max-height')).not.toBe(basisOf('footprint-perimeter'));
    });

    it('every ORDINANCE LIMITS row is a ceiling — including the two that are not derived', () => {
        for (const key of ['setback-front', 'setback-side', 'setback-rear', 'max-height', 'storeys', 'max-far', 'max-coverage']) {
            expect(basisOf(key), `${key} must be a legal ceiling`).toBe('ceiling');
        }
    });

    it('every MASSING POTENTIAL row is derived — PRYZM computed them, the ordinance did not', () => {
        for (const key of ['footprint', 'coverage', 'footprint-perimeter', 'gfa', 'study-volume']) {
            expect(basisOf(key), `${key} must be derived`).toBe('derived');
        }
    });

    it('⛔ `not derived` SURVIVES and stays a ceiling — unknown is not zero (C58 §1.4)', () => {
        // The founder forbade fixing this block by deleting rows. Re-assert the honesty value
        // is still rendered, still visible, and still classed as the legal fact it is.
        const bare = buildParcelLawFacts(buildParcelLawModel({
            parcelRing: RECT,
            edgeClassifications: ['front', 'side', 'rear', 'side'],
            identity: null,
            envelope: envelope({ maxFAR: null, maxCoverage: null }),
        }));
        const far = bare.querySelector(`[data-testid="${PARCEL_LAW_FACT_PREFIX}max-far"]`)!;
        expect(far.textContent).toContain(NOT_DERIVED_TEXT);
        expect(far.getAttribute('data-derived')).toBe('false');
        expect(far.getAttribute(PARCEL_LAW_BASIS_ATTR)).toBe('ceiling');
    });

    it('PER STOREY — the equal-division lede leads, and all six rows SURVIVE beneath it', () => {
        const storeys = root.querySelectorAll('[data-testid^="parcel-law-storey-"]');
        // ⛔ NOT COLLAPSED. Six printed rows are what make the division checkable.
        expect(storeys.length).toBe(6);
        for (const r of storeys) {
            expect(r.getAttribute(PARCEL_LAW_BASIS_ATTR)).toBe('assumed');
        }
        const lede = root.querySelector('[data-testid="parcel-law-group-lede"]')!;
        expect(lede).not.toBeNull();
        expect(lede.textContent).toBe(PARCEL_LAW_EQUAL_DIVISION_LEDE);
        // ⭐ THE PLACEMENT IS THE FIX, SO THE PLACEMENT IS WHAT IS PINNED. The founder's report
        // is that the words were right and the position was wrong; a test that only asserted the
        // words exist would pass on the defect it was written to close. The lede must be the
        // FIRST thing in the group body, ahead of every storey row.
        const body = lede.parentElement!;
        expect(body.firstElementChild).toBe(lede);
        expect(body.contains(storeys[0]!)).toBe(true);
    });

    it('the group badges name the three bases, so the vocabulary is readable not inferred', () => {
        expect(root.querySelector('[data-testid="parcel-law-basis-ceiling"]')).not.toBeNull();
        expect(root.querySelector('[data-testid="parcel-law-basis-derived"]')).not.toBeNull();
        expect(root.querySelector('[data-testid="parcel-law-basis-assumed"]')).not.toBeNull();
    });

    it('the question-2 confidence probe still resolves — the source line did not move', () => {
        // `parcelLawQuestionGroup.ts` reads `.anl-plaw-group-source` as a confidence probe. A
        // badge added beside it must not have displaced it, or every collapsed summary loses
        // its confidence and C58 §1.2 is breached by a layout change.
        expect(root.querySelector('.anl-plaw-group-source')).not.toBeNull();
    });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// §ONE-TYPE-BASE (L-13077, FOUNDER RULING 2026-09-07: *"one base for the whole card"*)
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// `parcelLawIntentAgainstCeiling.ts` (question 3) was given a declared base in `3848c0cd`. This
// file had the SAME fall-through and kept it, so the card rendered question 1's figures at the
// document default (16 px) beside question 3's at 11.5 — one card, two type systems, neither
// chosen. These tests pin the base HERE and pin it EQUAL to the other section's, because the
// founder's ruling is about the card, not about a file.
//
// ⛔ THREE ARMS, DELIBERATELY, BECAUSE ONE OF THEM CANNOT SEE THE OTHERS' DEFECT:
//   A. a fresh `px` literal on any descendant — the original defect shape, and the one that
//      bypasses §UI-DENSITY-SCALE (`uiScale.ts` transforms the assembled STYLESHEET only, so an
//      inline literal moves with nothing and clears no floor);
//   B. an `em` that COMPOUNDS under the floor — legal to arm A, invisible to it, and a live trap
//      here: the basis badge is a CHILD of a heading that is itself stepped down, so `0.87em` on
//      it would land at 8.7 px. Arm B resolves the whole chain and measures what a reader gets;
//   C. the two files' bases being equal — arms A and B both pass on a card set in two sizes.
describe('§ONE-TYPE-BASE — the card has ONE base, and no child may leave it (L-13077)', () => {
    const src = readFileSync(resolve(__dirname, '../parcelLawFacts.ts'), 'utf8');
    const intentSrc = readFileSync(resolve(__dirname, '../parcelLawIntentAgainstCeiling.ts'), 'utf8');
    const baseOf = (s: string): number => {
        const m = /const SCALE_BASE_PX = ([\d.]+);/.exec(s);
        expect(m).not.toBeNull();
        return Number.parseFloat(m![1]!);
    };

    /** The size a reader actually gets, resolving every `em` up the chain to the root's px base. */
    const effectivePx = (node: HTMLElement, root: HTMLElement): number => {
        const chain: HTMLElement[] = [];
        for (let n: HTMLElement | null = node; n !== null; n = n.parentElement) {
            chain.push(n);
            if (n === root) break;
        }
        let px = Number.parseFloat(root.style.fontSize);
        for (const n of chain.reverse()) {
            const fs = n.style.fontSize;
            if (n === root || fs.length === 0) continue;
            const em = /^([\d.]+)em$/.exec(fs);
            if (em) px *= Number.parseFloat(em[1]!);
            else px = Number.parseFloat(fs);
        }
        return px;
    };

    const full = buildParcelLawFacts(buildParcelLawModel({
        parcelRing: RECT,
        edgeClassifications: ['front', 'side', 'rear', 'side'],
        identity: null,
        envelope: envelope(),
    }));

    it('A — the root declares the base in px, and NOTHING below it does', () => {
        // ⭐ Without this the figures fall through to the document default: nothing in the repo
        // styles `.anl-plaw-key` / `.anl-plaw-val` (they are hooks, not rules) and the Analysis
        // surface sets no body size, so "inherit" here means 16 px.
        expect(full.style.fontSize).toMatch(/^\d+(\.\d+)?px$/);
        expect(Number.parseFloat(full.style.fontSize)).toBeGreaterThanOrEqual(10);
        for (const n of full.querySelectorAll<HTMLElement>('*')) {
            const fs = n.style.fontSize;
            if (fs.length > 0) expect(fs).not.toMatch(/px$/);
        }
    });

    it('B — every element a reader sees resolves to 10 px or more, em-compounding included', () => {
        // ⛔ THE ARM THAT CATCHES WHAT ARM A CANNOT. `0.87em` is a legal value everywhere; on a
        // child of an already-stepped heading it lands at 8.7 px, which is the C43 / WCAG 2.2 AA
        // floor breach (`MIN_FONT_PX = 10`) that the old `8.5px` badge literal shipped. Both
        // spellings are the same defect and only this arm sees both.
        for (const n of full.querySelectorAll<HTMLElement>('*')) {
            const px = effectivePx(n, full);
            expect(Number.isFinite(px)).toBe(true);
            expect(px).toBeGreaterThanOrEqual(10);
        }
    });

    it('C — question 1 and question 3 declare the SAME base, so the card is set once', () => {
        // The bases are duplicated (the two renderings share no module below them) and this is
        // what stops the copy drifting. If a lane changes one, this fails and names the other.
        expect(baseOf(src)).toBe(baseOf(intentSrc));
    });

    it('⛔ the LAW\'s figure is never smaller than the derived figure beside it', () => {
        // ⭐ THIS IS THE INVERSION THE BASE REMOVED, AND IT WAS REAL, NOT HYPOTHETICAL. `ceiling`
        // rows were pinned at 11.5 px while every derived row fell through to 16 — so `Max height`
        // rendered SMALLER than `Perimeter`. This file's own comments forbid de-weighting a
        // ceiling by name; the defect arrived through the one path a comment cannot police.
        const ceilingVal = full
            .querySelector<HTMLElement>(`[${PARCEL_LAW_BASIS_ATTR}="ceiling"] .anl-plaw-val`);
        const derivedVal = full
            .querySelector<HTMLElement>(`[${PARCEL_LAW_BASIS_ATTR}="derived"] .anl-plaw-val`);
        expect(ceilingVal).not.toBeNull();
        expect(derivedVal).not.toBeNull();
        expect(effectivePx(ceilingVal!, full)).toBeGreaterThanOrEqual(effectivePx(derivedVal!, full));
        // …and it is the SAME size, not merely "not smaller": weight and air are what separate
        // the bases, which is what `fact()` has always claimed.
        expect(effectivePx(ceilingVal!, full)).toBe(effectivePx(derivedVal!, full));
    });

    it('⭐ the label steps down from its figure — the founder\'s "values much larger than labels", inverted honestly', () => {
        const row = fact(full, 'parcel-area')!;
        const k = row.querySelector<HTMLElement>('.anl-plaw-key')!;
        const v = row.querySelector<HTMLElement>('.anl-plaw-val')!;
        // The figure is the base; the label is one step down because it is prose. Before this
        // BOTH were 16 px, so there was no hierarchy at all — only an accident that looked like one.
        expect(effectivePx(v, full)).toBe(Number.parseFloat(full.style.fontSize));
        expect(effectivePx(k, full)).toBeLessThan(effectivePx(v, full));
        expect(effectivePx(k, full)).toBeGreaterThanOrEqual(10);
    });
});
