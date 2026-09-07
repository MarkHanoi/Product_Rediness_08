// §PARCEL-LAW-MODEL (STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §25.11) — the ONE model, and the
// proof that the migration is a MIGRATION rather than a copy.
//
// The founder's ask is *"[the rail panel's data] SHOULD MIGRATE AND EXTEND TO THE NEW PARCEL
// LAW TAB"*, and §25.11 clause 1 turns that into an invariant: ONE model, rendered twice.
// The failure mode it forbids is a copy-paste that "looks right" — so this spec asserts two
// different things:
//
//   ARM 1 — the model itself: every honesty rule holds as a VALUE (a null is a null, an
//           unmeasured frontage is not a landlocked one, GFA is withheld without storeys).
//   ARM 2 — the SEAM: `GISAreaLayout.ts` no longer carries the arithmetic, and the source of
//           both surfaces is read to prove there is no second derivation. A copy-paste passes
//           every value test in ARM 1 and fails ARM 2, which is precisely why ARM 2 exists.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    PARCEL_LAW_MAX_LISTED_STOREYS,
    buildParcelLawModel,
    permittedStudyFiguresOf,
    polygonBboxXZ,
    polygonPerimeterXZ,
    resolveDepthTerm,
} from '../parcelLawModel';

const read = (p: string): string => readFileSync(resolve(process.cwd(), p), 'utf8');
/** Strip line comments + block comments so a prose mention cannot pass a code assertion. */
const codeOnly = (src: string): string =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** A 40 × 20 m rectangle: area 800 m², perimeter 120 m, bbox 40 × 20. */
const RECT = [
    { x: 0, z: 0 },
    { x: 40, z: 0 },
    { x: 40, z: 20 },
    { x: 0, z: 20 },
];

/** A minimal envelope. Only the fields the model reads; everything else stays absent. */
function envelope(over: Record<string, unknown> = {}): never {
    return {
        insetPolygon: [
            { x: 3, z: 3 },
            { x: 37, z: 3 },
            { x: 37, z: 17 },
            { x: 3, z: 17 },
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
        caveats: [],
        tiers: [],
        permittedUse: [],
        ...over,
    } as never;
}

describe('§PARCEL-LAW-MODEL — the geometry half is one shared derivation', () => {
    it('measures area, perimeter and the BOUNDING BOX off the committed ring', () => {
        const m = buildParcelLawModel({
            parcelRing: RECT,
            edgeClassifications: ['front', 'side', 'rear', 'side'],
            identity: null,
            envelope: envelope(),
        });
        expect(m.geometry).not.toBeNull();
        expect(m.geometry!.areaM2).toBeCloseTo(800, 6);
        expect(m.geometry!.perimeterM).toBeCloseTo(120, 6);
        expect(m.geometry!.bboxWidthM).toBeCloseTo(40, 6);
        expect(m.geometry!.bboxDepthM).toBeCloseTo(20, 6);
        expect(m.geometry!.edgeCount).toBe(4);
        expect(m.geometry!.frontEdgeCount).toBe(1);
    });

    it('⭐ an UNRECORDED frontage is not a landlocked one — the three-way value survives', () => {
        // §GR-10/GR-14 — `null` (nobody classified), `0` (classified, landlocked) and `n > 0`
        // are three different facts. A model that defaults the array to `[]` reports the
        // NEGATIVE one about a parcel nobody measured.
        const unmeasured = buildParcelLawModel({
            parcelRing: RECT, edgeClassifications: undefined, identity: null, envelope: envelope(),
        });
        expect(unmeasured.geometry!.frontEdgeCount).toBeNull();
        expect(unmeasured.geometry!.frontageClause).toContain('not recorded');

        const landlocked = buildParcelLawModel({
            parcelRing: RECT,
            edgeClassifications: ['side', 'side', 'rear', 'side'],
            identity: null,
            envelope: envelope(),
        });
        expect(landlocked.geometry!.frontEdgeCount).toBe(0);
        expect(landlocked.geometry!.frontageClause).not.toBe(unmeasured.geometry!.frontageClause);
        // Neither arm is EMPTY — an empty string is the render-layer spelling of the conflation.
        expect(unmeasured.geometry!.frontageClause.length).toBeGreaterThan(0);
        expect(landlocked.geometry!.frontageClause.length).toBeGreaterThan(0);
    });

    it('an absent ring is a NAMED absence, never a zero-area parcel', () => {
        const m = buildParcelLawModel({
            parcelRing: null, edgeClassifications: undefined, identity: null, envelope: envelope(),
        });
        expect(m.geometry).toBeNull();
        expect(m.geometryAbsence).toBe('ring-unreadable');
        // ⛔ and the massing half must not invent a coverage against a parcel it cannot read.
        expect(m.massing!.coveragePct).toBeNull();
    });

    it('a two-vertex ring is DEGENERATE, which is a different fact from unreadable', () => {
        const m = buildParcelLawModel({
            parcelRing: [{ x: 0, z: 0 }, { x: 1, z: 1 }],
            edgeClassifications: undefined, identity: null, envelope: envelope(),
        });
        expect(m.geometryAbsence).toBe('ring-degenerate');
    });
});

describe('§PARCEL-LAW-MODEL — the ordinance and massing halves, with their nulls intact', () => {
    it('carries setbacks, height, storeys, FAR and coverage as PERCENT', () => {
        const m = buildParcelLawModel({
            parcelRing: RECT, edgeClassifications: undefined, identity: null, envelope: envelope(),
        });
        const o = m.ordinance!;
        expect(o.setbackFrontM).toBe(3);
        expect(o.setbackSideM).toBe(3);
        expect(o.setbackRearM).toBe(3);
        expect(o.maxHeightM).toBe(18);
        expect(o.maxFloors).toBe(6);
        expect(o.maxFAR).toBe(3.5);
        // The envelope carries a 0–1 fraction; the conversion happens ONCE, here.
        expect(o.maxCoveragePct).toBe(60);
        expect(o.citation).toBe('PGM Art. 242.2');
        expect(o.zoneCode).toBe('13b');
    });

    it('⭐ GFA is WITHHELD when the pack derived no storey count — never footprint × a guess', () => {
        const m = buildParcelLawModel({
            parcelRing: RECT,
            edgeClassifications: undefined,
            identity: null,
            envelope: envelope({ maxFloors: null }),
        });
        expect(m.massing!.footprintM2).toBe(476);
        expect(m.massing!.gfaM2).toBeNull();
        // …and everything downstream of GFA inherits the null rather than inventing a count.
        expect(m.capacity!.maxDwellings).toBeNull();
        expect(m.perStorey).toBeNull();
    });

    it('coverage is footprint ÷ parcel, computed once', () => {
        const m = buildParcelLawModel({
            parcelRing: RECT, edgeClassifications: undefined, identity: null, envelope: envelope(),
        });
        expect(m.massing!.coveragePct).toBeCloseTo((476 / 800) * 100, 6);
        expect(m.massing!.gfaM2).toBe(476 * 6);
    });

    it('a zero footprint is NOT DERIVED, not a confident zero', () => {
        const m = buildParcelLawModel({
            parcelRing: RECT,
            edgeClassifications: undefined,
            identity: null,
            envelope: envelope({ insetPolygon: [], insetAreaM2: 0 }),
        });
        expect(m.massing!.footprintM2).toBeNull();
        expect(m.massing!.footprintPerimeterM).toBeNull();
        // ⭐ AND SO IS GFA. The pre-migration card printed "not derived" for the footprint and
        // "0 m²" for the GFA immediately under it — two spellings of one absence, the numeric one
        // being a claim about the user's land. On the model a null is a null all the way down.
        expect(m.massing!.gfaM2).toBeNull();
        expect(m.capacity!.maxDwellings).toBeNull();
    });
});

describe('§PARCEL-LAW-MODEL — per storey and capacity', () => {
    it('bands the storeys by an EQUAL DIVISION, and says so by carrying floorToFloorM', () => {
        const m = buildParcelLawModel({
            parcelRing: RECT, edgeClassifications: undefined, identity: null, envelope: envelope(),
        });
        const ps = m.perStorey!;
        expect(ps.totalCount).toBe(6);
        expect(ps.storeys).toHaveLength(6);
        expect(ps.floorToFloorM).toBeCloseTo(3, 6);
        expect(ps.storeys[0]!.label).toBe('Ground');
        expect(ps.storeys[1]!.label).toBe('Level 1');
        expect(ps.storeys[1]!.bandFromM).toBeCloseTo(3, 6);
        expect(ps.storeys[1]!.bandToM).toBeCloseTo(6, 6);
        expect(ps.truncatedCount).toBe(0);
    });

    it('⭐ NO max height ⇒ NO band — the storeys carry area alone, never an invented ftf', () => {
        const m = buildParcelLawModel({
            parcelRing: RECT,
            edgeClassifications: undefined,
            identity: null,
            envelope: envelope({ maxHeight_m: null, maxVolumeM3: null }),
        });
        const ps = m.perStorey!;
        expect(ps.floorToFloorM).toBeNull();
        expect(ps.storeys.every((s) => s.bandFromM === null && s.bandToM === null)).toBe(true);
        expect(m.massing!.studyVolumeM3).toBeNull();
    });

    it('truncates a tall stack and REPORTS how many it withheld', () => {
        const m = buildParcelLawModel({
            parcelRing: RECT,
            edgeClassifications: undefined,
            identity: null,
            envelope: envelope({ maxFloors: 55 }),
        });
        expect(m.perStorey!.storeys).toHaveLength(PARCEL_LAW_MAX_LISTED_STOREYS);
        expect(m.perStorey!.truncatedCount).toBe(55 - PARCEL_LAW_MAX_LISTED_STOREYS);
        expect(m.perStorey!.totalCount).toBe(55);
    });

    it('capacity is offered ONLY for the zones its ordinance governs', () => {
        const bcn = buildParcelLawModel({
            parcelRing: RECT, edgeClassifications: undefined, identity: null, envelope: envelope(),
        });
        expect(bcn.capacity).not.toBeNull();
        expect(bcn.capacity!.moduleM2).toBe(80);
        expect(bcn.capacity!.maxDwellings).toBe(Math.ceil((476 * 6) / 80));

        const elsewhere = buildParcelLawModel({
            parcelRing: RECT,
            edgeClassifications: undefined,
            identity: null,
            envelope: envelope({ zoneCode: 'RM1' }),
        });
        // ⛔ Absent, never zeroed: PRYZM holds no dwelling rule for this zone, and printing 0
        // would be a legal claim about the user's land that no ordinance makes.
        expect(elsewhere.capacity).toBeNull();
    });
});

describe('§PARCEL-LAW-MODEL — refusals and absences are ANSWERS, not empty numeric rows', () => {
    it('a refusal carries its content and NO numeric section', () => {
        const m = buildParcelLawModel({
            parcelRing: RECT,
            edgeClassifications: undefined,
            identity: null,
            envelope: envelope({
                status: 'not-applicable',
                insetPolygon: [],
                insetAreaM2: 0,
                maxHeight_m: null,
                maxFloors: null,
                maxFAR: null,
                maxCoverage: null,
                maxVolumeM3: null,
                refusal: {
                    code: 'zone-rules-not-encoded',
                    headline: 'PRYZM has not encoded this zone yet',
                    detail: 'A coverage gap, not a legal finding.',
                    legallyGrounded: false,
                    knownFacts: ['Zone 22a identified'],
                    ordinanceRef: null,
                },
            }),
        });
        expect(m.envelopeState).toBe('refused');
        expect(m.refusal!.code).toBe('zone-rules-not-encoded');
        expect(m.refusal!.legallyGrounded).toBe(false);
        // §L-550/§L-553 — three dashes would read as "not filled in yet". The sections are ABSENT.
        expect(m.ordinance).toBeNull();
        expect(m.massing).toBeNull();
        expect(m.perStorey).toBeNull();
        // …but the parcel geometry survives: the plot is still real and still measured.
        expect(m.geometry!.areaM2).toBeCloseTo(800, 6);
    });

    it('no envelope at all is ABSENT, and distinguishable from a refusal', () => {
        const m = buildParcelLawModel({
            parcelRing: RECT, edgeClassifications: undefined, identity: null, envelope: null,
        });
        expect(m.envelopeState).toBe('absent');
        expect(m.refusal).toBeNull();
        expect(m.confidence).toBeNull();
    });

    it('a STORED determination carries its date, so recency cannot be fabricated', () => {
        const m = buildParcelLawModel({
            parcelRing: RECT,
            edgeClassifications: undefined,
            identity: null,
            envelope: envelope(),
            determinedAtIso: '2026-08-21T09:14:00Z',
        });
        expect(m.determinedAtIso).toBe('2026-08-21T09:14:00Z');
    });
});

describe('§PARCEL-LAW-MODEL — the local-language depth term is READ, never hard-coded', () => {
    it('takes the term from the citation the card is already quoting', () => {
        // §CARD-DEPTH-TERM (L-676) — the card printed the Catalan on Murcia cards whose own
        // ordinance says «fondo máximo edificable».
        expect(resolveDepthTerm('PGM Art. 242.2 — profunditat edificable')).toBe('profunditat edificable');
        expect(resolveDepthTerm('PGOU Art. 5.5.3 — fondo máximo edificable')).toBe('profundidad edificable');
        expect(resolveDepthTerm(null)).toBe('buildable depth rule');
    });

    it('an ALIGNMENT zone surfaces the depth and its granularity', () => {
        const m = buildParcelLawModel({
            parcelRing: RECT,
            edgeClassifications: undefined,
            identity: null,
            envelope: envelope({
                derivation: [
                    { constraint: 'alignment.depth', value: 16, source: 'pgm-bcn', ordinanceRef: 'PGM Art. 242.2 — profunditat edificable' },
                    { constraint: 'alignment.depthBinding', value: 1, source: 'pgm-bcn', ordinanceRef: null },
                    { constraint: 'alignment.offset', value: 2.5, source: 'pgm-bcn', ordinanceRef: null },
                ],
            }),
        });
        expect(m.ordinance!.buildableDepthM).toBe(16);
        expect(m.ordinance!.depthIsBlockGranular).toBe(true);
        expect(m.ordinance!.alignmentOffsetM).toBe(2.5);
        expect(m.ordinance!.depthTerm).toBe('profunditat edificable');
    });
});

describe('§PARCEL-LAW-MODEL — the pure helpers', () => {
    it('perimeter and bbox handle the short rings without throwing', () => {
        expect(polygonPerimeterXZ([])).toBe(0);
        expect(polygonPerimeterXZ([{ x: 1, z: 1 }])).toBe(0);
        expect(polygonBboxXZ([])).toEqual({ w: 0, d: 0 });
    });

    it('permittedStudyFiguresOf falls back to the shoelace when insetAreaM2 is 0', () => {
        const f = permittedStudyFiguresOf({ insetPolygon: RECT, insetAreaM2: 0, maxFloors: 2 });
        expect(f.footprintM2).toBeCloseTo(800, 6);
        expect(f.gfaM2).toBeCloseTo(1600, 6);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// ARM 2 — THE SEAM. A copy-paste passes every test above; this is what it fails.
// ═══════════════════════════════════════════════════════════════════════════════════════════

describe('§25.11 clause 1 — ONE model, rendered twice (the files this lane owns)', () => {
    const TAB = 'apps/editor/src/ui/analysis/parcelLawTab.ts';
    const FACTS = 'apps/editor/src/ui/analysis/parcelLawFacts.ts';

    it('⭐ the TAB renders the shared model and computes nothing of its own', () => {
        const tab = codeOnly(read(TAB));
        expect(tab).toContain('resolveParcelLawModel');
        expect(tab).toContain('buildParcelLawFacts');

        const facts = codeOnly(read(FACTS));
        // ⛔ No second reader, no store, no fetch, and no arithmetic over ENVELOPE fields.
        // It reads MODEL fields (`ordinance.maxFloors`); touching `insetPolygon` or `derivation`
        // here would be a second derivation wearing a renderer's name.
        expect(facts).not.toMatch(/getLastBuildableEnvelope|resolveStoredBuildableDetermination/);
        expect(facts).not.toMatch(/siteModelStore/);
        expect(facts).not.toMatch(/fetch\s*\(/);
        expect(facts).not.toMatch(/insetAreaM2|insetPolygon|maxHeight_m|\.derivation/);
        // C08 §3.1 — no HTML sink on a surface that renders provider-supplied planning strings.
        expect(facts).not.toMatch(/innerHTML|insertAdjacentHTML|outerHTML/);
    });

    it('⛔ the RAIL PANEL keeps its route and gains NO second reader (C19 §5.6 clause 4)', () => {
        // §25.11 clause 3. The rail renders the SINGLETON card, which renders the model — so
        // the two surfaces agree without the rail importing an envelope reader, which its own
        // spec forbids (`parcelRailPanel.spec.ts`: *"⛔ NEVER re-derives"*).
        const rail = codeOnly(read('apps/editor/src/ui/site/parcel/parcelRailPanel.ts'));
        expect(rail).toContain('mountParcelSection');
        expect(rail).toContain('pryzmMountEnvelopeCard');
        expect(rail).not.toMatch(/getLastBuildableEnvelope|resolveStoredBuildableDetermination/);
        expect(rail).not.toMatch(/buildParcelLawModel/);
    });

    it('⛔ the model is PURE — no DOM, no store, no window, no fetch', () => {
        const src = codeOnly(read('apps/editor/src/ui/site/parcel/parcelLawModel.ts'));
        expect(src).not.toMatch(/document\.|innerHTML|createElement/);
        expect(src).not.toMatch(/window/);
        expect(src).not.toMatch(/siteModelStore|fetch\s*\(/);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════════════
// §26.6.2 (L-13046) — THE SETBACK REGISTER'S INPUTS: one row per EDGE, and each setback
// constraint with ITS OWN citation (C58 §1.3 per constraint, not per parcel).
// ═══════════════════════════════════════════════════════════════════════════════════════

describe('§26.6.2 — edges, per edge, with the classification AS RECORDED', () => {
    it('one edge per ring vertex, with its length and the label the array carries', () => {
        const m = buildParcelLawModel({
            parcelRing: RECT,
            edgeClassifications: ['front', 'side', 'rear', 'side'],
            identity: null,
            envelope: envelope(),
        });
        const edges = m.geometry!.edges;
        expect(edges.map((e) => e.index)).toEqual([0, 1, 2, 3]);
        expect(edges.map((e) => e.lengthM)).toEqual([40, 20, 40, 20]);
        expect(edges.map((e) => e.classification)).toEqual(['front', 'side', 'rear', 'side']);
    });

    it('⛔ NOT RECORDED is null PER EDGE — never "unclassified", never inferred (C19 §10.1 pending)', () => {
        const none = buildParcelLawModel({ parcelRing: RECT, edgeClassifications: undefined, identity: null, envelope: envelope() });
        expect(none.geometry!.edges.every((e) => e.classification === null)).toBe(true);
        expect(none.edgeClassifications).toBeNull();
        // A wrong-length array is the schema's own "nobody classified" shape — same answer.
        const short = buildParcelLawModel({ parcelRing: RECT, edgeClassifications: ['front'], identity: null, envelope: envelope() });
        expect(short.geometry!.edges.every((e) => e.classification === null)).toBe(true);
        // …but the RAW array is carried through untouched, for the frontage rule to read.
        expect(short.edgeClassifications).toEqual(['front']);
    });

    it('carries each setback constraint with ITS OWN citation, and only the ones the trace has', () => {
        const m = buildParcelLawModel({ parcelRing: RECT, edgeClassifications: undefined, identity: null, envelope: envelope() });
        const rules = m.ordinance!.rules;
        expect(rules['setback.front']).toEqual({ valueM: 3, ordinanceRef: 'PGM Art. 242.2', provenance: null, source: 'catastro-es' });
        expect(rules['setback.side']!.ordinanceRef).toBeNull();
        expect(rules['alignment.depth']).toBeUndefined();
        expect(rules['alignment.offset']).toBeUndefined();
    });
});
