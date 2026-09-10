// §PARCEL-LAW-MODEL — ARM 2 OF THE MIGRATION PROOF: the ENVELOPE CARD no longer derives the
// figures it renders (STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §25.11 clause 1).
//
// ⚠ THIS FILE IS DELIBERATELY SEPARATE FROM `parcelLawModel.spec.ts`, and the reason is a
// COORDINATION fact rather than a taste one. `apps/editor/src/ui/layout/GISAreaLayout.ts` was
// being edited by a second Parcel Law lane (§PARCEL-LAW-UNRESOLVED, STR §25.1 block B) in the
// same working tree at the moment this migration landed. The two lanes' hunks are interleaved
// in that one file, so it cannot be committed by either lane without carrying the other's
// in-flight work. These assertions therefore travel WITH `GISAreaLayout.ts`: whoever commits
// that file commits this spec, and until then neither is in the tree claiming something the
// other half does not yet support. Splitting it is what keeps `parcelLawModel.spec.ts` green
// on its own.
//
// A copy-paste of the rail panel's rows into the tab passes every value test in
// `parcelLawModel.spec.ts` and fails THIS file. That is the whole point of it.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string): string => readFileSync(resolve(process.cwd(), p), 'utf8');
/** Strip comments so a prose mention cannot pass a code assertion. */
const codeOnly = (src: string): string =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const GIS = 'apps/editor/src/ui/layout/GISAreaLayout.ts';

describe('§25.11 clause 1 — the envelope card RENDERS the model, it does not derive it', () => {

    it('⭐ the envelope card BUILDS the shared model rather than deriving these figures', () => {
        const src = codeOnly(read(GIS));
        expect(src).toContain('buildParcelLawModel');
        expect(src).toContain('permittedStudyFiguresOf');
        // The ring helpers are the shared ones now — the local shoelace is gone.
        expect(src).toContain('const polyAreaM2 = polygonAreaXZ');
        expect(src).toContain('const polyPerimeterM = polygonPerimeterXZ');
        expect(src).not.toMatch(/a \+= p\.x \* q\.z - q\.x \* p\.z/);
    });

    // §PARCEL-ROWS-HAVE-ONE-HOME (L-13302) — this arm REPLACED
    // `expect(src).toContain('const polyBboxM = polygonBboxXZ')`, and the replacement is
    // STRONGER, not weaker. That assertion demanded the card hold a local ALIAS of the shared
    // bounding-box producer. L-13302 then deleted the alias together with its one reader (the
    // fold's `Bounding box` row), so the card now reaches the figure through `ParcelLawGeometry`
    // and imports `polygonBboxXZ` nowhere. The old arm therefore failed the card for having
    // FEWER routes to the number than §25.11 clause 1 requires — it had pinned the migration's
    // intermediate step as if it were the destination.
    //
    // ⛔ The invariant §25.11 clause 1 actually protects is ONE PRODUCER, not one alias. So this
    // arm binds that directly, in both directions: the producer is defined exactly once and in
    // the model, the model is what fills the figure, and the card derives no rival.
    it('⭐ the bounding box has ONE producer, it lives in the model, and the card derives no rival', () => {
        const MODEL = 'apps/editor/src/ui/site/parcel/parcelLawModel.ts';
        const gis = codeOnly(read(GIS));
        const model = codeOnly(read(MODEL));

        // POSITIVE — the one producer, and the model is the thing that calls it.
        expect(model).toMatch(/export function polygonBboxXZ\s*\(/);
        expect(model).toContain('bboxWidthM: polygonBboxXZ(');
        expect(model).toContain('bboxDepthM: polygonBboxXZ(');

        // NEGATIVE — the card neither imports the producer nor re-derives it. A bounding box
        // over a ring is a min/max scan of `.x` and `.z`; if one reappears here, that is the
        // second bounding box the ledger note forbids.
        expect(gis).not.toContain('polygonBboxXZ');
        expect(gis).not.toMatch(/Math\.min\([^)]*\.x[^)]*\)[\s\S]{0,200}Math\.max\([^)]*\.z/);
    });

    it('⛔ the Art. 323 arithmetic exists in ONE place, and it is the model', () => {
        const src = codeOnly(read(GIS));
        // The card renders `law.capacity`; it no longer divides GFA by the module itself.
        expect(src).not.toMatch(/Math\.ceil\(\s*gfa\s*\/\s*BCN_ART323_DWELLING_MODULE_M2\s*\)/);
        expect(src).toContain('law.capacity');
    });

    it('⛔ the per-storey bands come from the model, not a second height ÷ storeys', () => {
        const src = codeOnly(read(GIS));
        expect(src).toContain('law.perStorey');
        expect(src).not.toMatch(/env\.maxHeight_m !== null && n > 0 \? env\.maxHeight_m \/ n : null/);
    });



});
