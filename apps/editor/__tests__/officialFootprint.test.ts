// §OFFICIAL-FOOTPRINTS — client (L-12939, 2026-09-05, lane ES-CATASTRO-FOOTPRINTS).
//
// The tag contract and the two draw predicates that keep the 3D massing and the 2D plan from
// drawing the same building twice.
//
// WHAT EARNED A TEST, and why:
//
//  • **The tag keys must equal the bake's.** `officialFootprint.ts` and
//    `tools/context-bake/footprints/officialFootprints.mjs` each hold their own copy of the key
//    table — one is client TypeScript, one is build tooling, neither can import the other. A
//    rename that reaches only one side is a SILENT pass-through failure: the tiles carry the data,
//    the client reads none of it, and nothing errors. This test imports BOTH and asserts equality,
//    which is the only thing that can catch it.
//  • **The two predicates are complementary, never both true for the same feature.** They are the
//    double-draw guard; if a refactor ever made them agree, official buildings would render twice
//    in 3D (a max(parts)-tall prism z-fighting its own parts) and the plan would sprout the
//    internal division lines of every building.
//  • **An outline with NO parts is still extruded.** The one exception, and it is not cosmetic —
//    a missing neighbour silently deletes a shadow, a party wall and a view obstruction from a
//    study. Drawing it coarse is strictly better than not drawing it.
//  • **`floors: 0` survives as 0.** The founder's own parcel has a 26.7 m² patio at zero storeys.
//    Reading that as "unknown" and defaulting it would fabricate a building on a courtyard; this
//    is the one place where UNKNOWN and ZERO are both legal and mean different things (C57 §1.5).
//  • **An unrecognised source returns undefined**, rather than being passed through as "official".
//  • **The summary separates counts by source** (C57 §1.9) — a single total cannot distinguish
//    "the register landed" from "we are still drawing OSM", which is the founder's actual question.
import { describe, it, expect } from 'vitest';

import {
    OFFICIAL_TAGS,
    readOfficialFootprint,
    refsWithParts,
    shouldDrawInPlan,
    shouldExtrudeInMassing,
    summariseOfficialFootprints,
} from '../src/ui/geospatial/officialFootprint';
// The PRODUCING half. Imported so a key rename on either side fails HERE.
import { OFFICIAL_TAGS as BAKE_TAGS, officialFootprintProps } from '../../../tools/context-bake/footprints/officialFootprints.mjs';

/** The founder's own parcel — CL Isla Lanzarote 4, Arroyo del Moro, Córdoba. */
const REFCAT = '1950501UG4915S';

/** Build the tag bag exactly as the bake writes it, then stringify as the tiles deliver it. */
function bakedTags(rec: Record<string, unknown>): Record<string, string> {
    const props = officialFootprintProps(rec) as Record<string, string | number>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(props)) out[k] = String(v);
    return out;
}

describe('officialFootprint · the tag contract matches the bake', () => {
    it('client OFFICIAL_TAGS === bake OFFICIAL_TAGS, key for key', () => {
        expect({ ...OFFICIAL_TAGS }).toEqual({ ...BAKE_TAGS });
    });
});

describe('officialFootprint · reading the tags the bake writes', () => {
    const outlineTags = bakedTags({
        source: 'es_catastro', ref: REFCAT, part: false, floors: 3, floorsBelow: 1,
        floorsKind: 'max-of-parts', use: 'residential', built: 2020, condition: 'functional',
    });
    const patioTags = bakedTags({
        source: 'es_catastro', ref: REFCAT, part: true, floors: 0, floorsBelow: 0,
        floorsKind: 'register', use: null, built: 2020, condition: null,
    });

    it('reads the whole-building outline, and says the floor count is DERIVED', () => {
        const f = readOfficialFootprint(outlineTags);
        expect(f).toBeDefined();
        expect(f!.source).toBe('es_catastro');
        expect(f!.ref).toBe(REFCAT);
        expect(f!.part).toBe(false);
        expect(f!.floors).toBe(3);
        expect(f!.floorsBelow).toBe(1);
        // Catastro publishes `numberOfFloorsAboveGround` as NIL on every Building; 3 is the bake's
        // max over the parts. A derived number presented as a register field is the C58 §1.4 defect.
        expect(f!.floorsKind).toBe('max-of-parts');
        expect(f!.built).toBe(2020);
        expect(f!.condition).toBe('functional');
        expect(f!.heightM).toBe(9);
        expect(f!.heightKind).toBe('floors×3.0');
    });

    it('reads a 0-storey part as 0, never as unknown', () => {
        const f = readOfficialFootprint(patioTags);
        expect(f!.part).toBe(true);
        expect(f!.floorsKind).toBe('register');
        // The bake omits `building:levels` at 0 (it is not a levels tag) but DOES write an explicit
        // 0 m. "No storeys above ground" must reach the renderer as a fact, not as a gap to fill.
        expect(f!.heightM).toBe(0);
        expect(f!.floors).toBeUndefined();
    });

    it('returns undefined for an OSM footprint — absent is NORMAL, not "unknown provenance"', () => {
        expect(readOfficialFootprint({ building: 'yes', 'building:levels': '4' })).toBeUndefined();
        expect(readOfficialFootprint(undefined)).toBeUndefined();
    });

    it('returns undefined for a source it cannot NAME, rather than passing it through', () => {
        // A tag we cannot name is not a provenance; presenting one as if it were is how "official"
        // becomes a word that means nothing.
        expect(readOfficialFootprint({ building: 'yes', [OFFICIAL_TAGS.source]: 'some_register' }))
            .toBeUndefined();
    });

    it('writes NO `height` tag, so the client cannot mistake the derivation for a survey', () => {
        // resolveHeightWithProvenance reads `height` as provenance `tagged`. The register's storey
        // count rides `building:levels` and resolves through the existing `derived-levels` rung —
        // one METRES_PER_LEVEL constant in the renderer, no special case, no laundered derivation.
        expect(outlineTags.height).toBeUndefined();
        expect(outlineTags['building:height']).toBeUndefined();
        expect(outlineTags['building:levels']).toBe('3');
    });
});

describe('officialFootprint · the double-draw guard', () => {
    const outline = readOfficialFootprint(bakedTags({
        source: 'es_catastro', ref: REFCAT, part: false, floors: 3, floorsBelow: 0,
        floorsKind: 'max-of-parts', use: 'residential', built: 2020, condition: 'functional',
    }));
    const part = readOfficialFootprint(bakedTags({
        source: 'es_catastro', ref: REFCAT, part: true, floors: 2, floorsBelow: 0,
        floorsKind: 'register', use: null, built: 2020, condition: null,
    }));

    it('massing takes the PARTS; the plan takes the OUTLINES — never both', () => {
        expect(shouldExtrudeInMassing(part, true)).toBe(true);
        expect(shouldDrawInPlan(part)).toBe(false);
        expect(shouldExtrudeInMassing(outline, true)).toBe(false);
        expect(shouldDrawInPlan(outline)).toBe(true);
        // The invariant, stated directly: for an official feature the two are complementary.
        for (const f of [part, outline]) {
            expect(shouldExtrudeInMassing(f, true) === shouldDrawInPlan(f)).toBe(false);
        }
    });

    it('still extrudes an outline that has NO parts — a missing neighbour deletes a shadow', () => {
        expect(shouldExtrudeInMassing(outline, false)).toBe(true);
    });

    it('leaves every OSM footprint exactly as it was', () => {
        expect(shouldExtrudeInMassing(undefined, false)).toBe(true);
        expect(shouldExtrudeInMassing(undefined, true)).toBe(true);
        expect(shouldDrawInPlan(undefined)).toBe(true);
    });

    it('answers "does this outline have parts" from the DATA, not an assumption', () => {
        expect(refsWithParts([{ official: part }, { official: outline }])).toEqual(new Set([REFCAT]));
        expect(refsWithParts([{ official: outline }])).toEqual(new Set());
        expect(refsWithParts([{}, { official: undefined }])).toEqual(new Set());
    });
});

describe('officialFootprint · the founder-readable summary', () => {
    it('separates the counts by source, so "landed" and "still OSM" cannot look the same', () => {
        const mk = (part: boolean, ref: string) => ({
            official: readOfficialFootprint(bakedTags({
                source: 'es_catastro', ref, part, floors: part ? 2 : 3, floorsBelow: 0,
                floorsKind: part ? 'register' : 'max-of-parts', use: 'residential', built: 2020, condition: 'functional',
            })),
        });
        const s = summariseOfficialFootprints([
            mk(true, REFCAT), mk(true, REFCAT), mk(true, REFCAT), mk(true, REFCAT),
            mk(false, REFCAT),
            {}, {}, {},   // three OSM footprints
        ]);
        expect(s).toMatchObject({ parts: 4, buildings: 1, osmOnly: 3, sources: ['es_catastro'] });
        expect(s.line).toBe('4 official part(s) of 1 building(s) + 3 OSM-only [es_catastro]');
    });

    it('names no source when nothing official is in view', () => {
        const s = summariseOfficialFootprints([{}, {}]);
        expect(s.line).toBe('0 official part(s) of 0 building(s) + 2 OSM-only');
    });
});
