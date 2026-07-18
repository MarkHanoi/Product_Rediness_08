// §L-401 (design INSIDE the envelope — compliant-by-construction) — pure-decision tests
// for `pickBuildableFootprint`: given the cached C58 envelope + the raw parcel, which
// polygon should a generator (apartment / house / office / residential) build within?
// The envelope INSET when it's valid (setbacks applied), else the raw parcel (unchanged).

import { describe, it, expect } from 'vitest';
import { pickBuildableFootprint } from '../src/ui/site/siteDispatch';
import type { BuildableEnvelope } from '@pryzm/schemas';

const parcel = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 8 }, { x: 0, z: 8 }];
const inset = [{ x: 3, z: 1.5 }, { x: 7, z: 1.5 }, { x: 7, z: 5 }, { x: 3, z: 5 }];

const mkEnv = (over: Partial<BuildableEnvelope>): BuildableEnvelope =>
    ({ status: 'ok', insetPolygon: inset, maxHeight_m: 12, ...over } as unknown as BuildableEnvelope);

describe('§L-401 pickBuildableFootprint — build inside the envelope', () => {
    it('uses the envelope INSET when the envelope is ok (compliant-by-construction)', () => {
        const r = pickBuildableFootprint(mkEnv({}), parcel);
        expect(r.source).toBe('envelope');
        expect(r.polygon).toEqual(inset);
        expect(r.maxHeightM).toBe(12);
    });

    it('falls back to the raw parcel when there is NO envelope cached', () => {
        const r = pickBuildableFootprint(null, parcel);
        expect(r.source).toBe('parcel');
        expect(r.polygon).toEqual(parcel);
        expect(r.maxHeightM).toBeNull();
    });

    it('falls back to the parcel when the envelope is degenerate / rejected / none (not ok)', () => {
        expect(pickBuildableFootprint(mkEnv({ status: 'degenerate' }), parcel).source).toBe('parcel');
        expect(pickBuildableFootprint(mkEnv({ status: 'rejected' as BuildableEnvelope['status'] }), parcel).source).toBe('parcel');
        expect(pickBuildableFootprint(mkEnv({ status: 'none' }), parcel).source).toBe('parcel');
    });

    it('falls back to the parcel when the inset ring collapsed below 3 points', () => {
        const collapsed = mkEnv({ insetPolygon: [{ x: 0, z: 0 }, { x: 1, z: 1 }] as BuildableEnvelope['insetPolygon'] });
        expect(pickBuildableFootprint(collapsed, parcel).source).toBe('parcel');
    });

    it('carries maxHeightM through only when numeric (null when the envelope has no height)', () => {
        expect(pickBuildableFootprint(mkEnv({ maxHeight_m: null }), parcel).maxHeightM).toBeNull();
        expect(pickBuildableFootprint(mkEnv({ maxHeight_m: 18 }), parcel).maxHeightM).toBe(18);
    });
});
