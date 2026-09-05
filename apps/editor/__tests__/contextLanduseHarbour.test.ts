// §L-12909 (2026-09-05) — Marseille's Vieux-Port and Joliette basins rendered as TAN LAND in the 3D
// Site while the 2D map beside them showed water. Cause (1) of two: `landuse=port` / `landuse=harbour`
// were classified URBAN and draped as ground, and in OSM a harbour landuse polygon routinely covers
// the basin water together with the quays. The client now refuses to colour them (the water layer
// owns what is inside a harbour coastline). Cause (2), the sea mask closing at the outer breakwater,
// is the §SEA-LEFT-HAND-WALK rewrite's business (L-12911) and is not asserted here.
import { describe, it, expect } from 'vitest';
import { classifyLanduse, LANDUSE_NOT_GROUND } from '../src/ui/geospatial/contextLanduse';

describe('§L-12909 — harbour and port landuse never paint as ground', () => {
    it('port / harbour classify to null (dropped), not urban', () => {
        expect(classifyLanduse('port')).toBeNull();
        expect(classifyLanduse('harbour')).toBeNull();
    });

    it('the water-bearing set is exactly the two values, and neither is in the urban class', () => {
        expect([...LANDUSE_NOT_GROUND].sort()).toEqual(['harbour', 'port']);
        for (const v of LANDUSE_NOT_GROUND) expect(classifyLanduse(v)).toBeNull();
    });

    it('the rest of the urban and rural classes are unchanged', () => {
        expect(classifyLanduse('residential')).toBe('urban');
        expect(classifyLanduse('industrial')).toBe('urban');
        expect(classifyLanduse('railway')).toBe('urban');
        expect(classifyLanduse('farmland')).toBe('rural');
        expect(classifyLanduse('unknown-value')).toBeNull();
        expect(classifyLanduse(undefined)).toBeNull();
    });
});
