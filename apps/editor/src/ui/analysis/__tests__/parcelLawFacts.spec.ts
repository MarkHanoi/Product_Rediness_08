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

import { describe, expect, it } from 'vitest';
import {
    NOT_DERIVED_TEXT,
    PARCEL_LAW_ENVELOPE_ABSENT_TESTID,
    PARCEL_LAW_FACTS_TESTID,
    PARCEL_LAW_FACT_PREFIX,
    PARCEL_LAW_GEOMETRY_ABSENT_TESTID,
    PARCEL_LAW_REFUSAL_TESTID,
    buildParcelLawFacts,
} from '../parcelLawFacts';
import {
    PARCEL_LAW_FACTS_SLOT_TESTID,
    mountParcelLawTab,
    type ParcelLawCapabilityHost,
    type ParcelLawTabDeps,
} from '../parcelLawTab';
import { buildParcelLawModel } from '../../site/parcel/parcelLawModel';

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
        const slot = h.element.querySelector(`[data-testid="${PARCEL_LAW_FACTS_SLOT_TESTID}"]`);
        expect(slot).not.toBeNull();
        const facts = slot!.querySelector(`[data-testid="${PARCEL_LAW_FACTS_TESTID}"]`);
        expect(facts).not.toBeNull();
        // With no runtime there is no parcel and no determination — and it SAYS so, in both
        // halves, rather than rendering an empty box.
        expect(facts!.querySelector(`[data-testid="${PARCEL_LAW_GEOMETRY_ABSENT_TESTID}"]`)).not.toBeNull();
        expect(facts!.querySelector(`[data-testid="${PARCEL_LAW_ENVELOPE_ABSENT_TESTID}"]`)).not.toBeNull();
        h.dispose();
        host.remove();
    });
});
