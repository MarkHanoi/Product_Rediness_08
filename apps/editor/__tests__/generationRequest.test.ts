// §GEN-REQUEST-UNION (RAC U5b.1) — the typed GenerationRequest union + the
// brief mappers (`houseRequestFromBrief` / `officeRequestFromBrief` /
// `apartmentRequestFromBrief` around the shipped `residentialRequestFromBrief`
// template). Pure functions — plain vitest, no DOM.

import { describe, expect, it } from 'vitest';
import {
    apartmentRequestFromBrief,
    generationRequestFromBrief,
    houseRequestFromBrief,
    officeRequestFromBrief,
    residentialGenerationFromBrief,
    HOUSE_DEFAULT_STOREYS,
    HOUSE_STOREYS_MAX,
} from '../src/ui/generation/generationRequest.js';

const SQUARE = [
    { x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 20 }, { x: 0, z: 20 },
];

describe('houseRequestFromBrief', () => {
    it('defaults to 2 storeys and clamps to the manifest [1,3] range', () => {
        expect(houseRequestFromBrief({}).storeyCount).toBe(HOUSE_DEFAULT_STOREYS);
        expect(houseRequestFromBrief({ floors: 1 }).storeyCount).toBe(1);
        expect(houseRequestFromBrief({ floors: 9 }).storeyCount).toBe(HOUSE_STOREYS_MAX);
        expect(houseRequestFromBrief({ floors: '3' }).storeyCount).toBe(3);
    });

    it('threads roof kind / floor-to-floor / the shared apartment program fields', () => {
        const r = houseRequestFromBrief({ floors: 2, roofKind: 'hip', floorToFloorM: 3.2, bedrooms: 4, bathrooms: 2 });
        expect(r.options.roofKind).toBe('hip');
        expect(r.options.floorToFloorM).toBe(3.2);
        expect(r.options.programOverride).toMatchObject({ bedrooms: 4, bathrooms: 2 });
    });

    it('an invalid roof kind is skipped, never guessed', () => {
        expect(houseRequestFromBrief({ roofKind: 'dome' }).options.roofKind).toBeUndefined();
    });
});

describe('officeRequestFromBrief', () => {
    it('storeys ride the shared resolveOfficeStoreyCount ([1,40], default 40)', () => {
        expect(officeRequestFromBrief({}, null).request.stories).toBe(40);
        expect(officeRequestFromBrief({ floors: 5 }, null).request.stories).toBe(5);
        expect(officeRequestFromBrief({ floors: 90 }, null).request.stories).toBe(40);
    });

    it('radius: brief preview value wins → parcel-fitted circle → 22 m default', () => {
        expect(officeRequestFromBrief({ officeRadiusM: 18 }, SQUARE).request.radiusM).toBe(18);
        const fitted = officeRequestFromBrief({}, SQUARE).request.radiusM;
        expect(fitted).toBeGreaterThan(0);
        expect(fitted).toBeLessThanOrEqual(10); // inside the 20×20 plot
        expect(officeRequestFromBrief({}, null).request.radiusM).toBe(22);
    });

    it('culture / colours pass through only when valid', () => {
        const r = officeRequestFromBrief({
            officeCulture: 'open-plan-first',
            officeFacadeColor: '#ffffff',
            officeGlassColor: 'not-a-hex',
            officeWithInterior: true,
        }, null);
        expect(r.request.culture).toBe('open-plan-first');
        expect(r.request.facadeColor).toBe('#ffffff');
        expect(r.request.glassColor).toBeUndefined();
        expect(r.withInterior).toBe(true);
    });
});

describe('residential + apartment arms', () => {
    it('residential wraps the shipped residentialRequestFromBrief template verbatim', () => {
        const r = residentialGenerationFromBrief({ floors: 6, T2: true, T3: true }, SQUARE);
        expect(r.kind).toBe('residential-building');
        expect(r.request.upperLevels).toBe(6);
        expect(r.request.typologies).toEqual({ T1: false, T2: true, T3: true, T4: false });
        expect(r.request.footprint).toBe(SQUARE);
    });

    it('apartment lifts the ONE resolveApartmentBrief mapping into the union', () => {
        const r = apartmentRequestFromBrief({ bedrooms: 3, masterEnSuite: true });
        expect(r.kind).toBe('apartment');
        expect(r.programOverride).toMatchObject({ bedrooms: 3, masterEnSuite: true });
    });
});

describe('generationRequestFromBrief — the route-keyed dispatcher', () => {
    it('routes each resolveGenerateRoute id to its mapper', () => {
        expect(generationRequestFromBrief('house', {}, null)).toMatchObject({ kind: 'house' });
        expect(generationRequestFromBrief('office', {}, SQUARE)).toMatchObject({ kind: 'office' });
        expect(generationRequestFromBrief('apartment', {}, null)).toMatchObject({ kind: 'apartment' });
        expect(generationRequestFromBrief('residential-building', {}, SQUARE)).toMatchObject({ kind: 'residential-building' });
    });

    it('residential without a usable footprint returns an honest error, never a degenerate request', () => {
        const out = generationRequestFromBrief('residential-building', {}, null);
        expect('error' in out && out.error).toContain('draw a plot');
    });
});
