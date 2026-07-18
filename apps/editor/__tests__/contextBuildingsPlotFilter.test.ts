// §PLOT-CLEAR-ENVELOPE (L-402c) — unit tests for the PURE on-plot footprint filter: the
// OSM context building the user is REPLACING (sitting on the committed working plot) must be
// removed from the context set so it can't bury the translucent #6600FF buildable-envelope
// study volume, WITHOUT stripping the surrounding neighbourhood context. No network here.

import { describe, it, expect } from 'vitest';
import {
    pointInPolygon,
    footprintOnParcel,
    partitionFootprintsByParcel,
    type ContextBuildingFeature,
    type PlanarRing,
} from '../src/ui/geospatial/contextBuildings';

/** A square ring of half-size `d` centred on (cx,cy). Closed (trailing dup vertex). */
function square(cx: number, cy: number, d: number): PlanarRing {
    return [
        [cx - d, cy - d], [cx + d, cy - d],
        [cx + d, cy + d], [cx - d, cy + d], [cx - d, cy - d],
    ];
}

function feat(osmId: number, ring: PlanarRing): ContextBuildingFeature {
    return {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring.map((p) => [p[0]!, p[1]!])] },
        properties: { heightM: 9, osmId },
    };
}

// A plot ~40 m across at a Barcelona-ish lon/lat (~2.17, 41.39). Scale is irrelevant to
// the topological tests, so a small square in degrees stands in for the committed parcel.
const PARCEL = square(2.17, 41.39, 0.0002);

describe('§PLOT-CLEAR-ENVELOPE pointInPolygon', () => {
    it('is true inside, false outside', () => {
        expect(pointInPolygon(2.17, 41.39, PARCEL)).toBe(true);
        expect(pointInPolygon(2.18, 41.39, PARCEL)).toBe(false);
    });
    it('returns false for a degenerate ring', () => {
        expect(pointInPolygon(0, 0, [[0, 0], [1, 1]])).toBe(false);
    });
});

describe('§PLOT-CLEAR-ENVELOPE footprintOnParcel', () => {
    it('flags a footprint whose centroid is inside the plot (the building being replaced)', () => {
        const onPlot = square(2.17, 41.39, 0.00012); // smaller, centred on the plot
        expect(footprintOnParcel(onPlot, PARCEL)).toBe(true);
    });

    it('keeps a neighbour footprint fully outside the plot', () => {
        const neighbour = square(2.1706, 41.39, 0.0001); // clearly to the east, no overlap
        expect(footprintOnParcel(neighbour, PARCEL)).toBe(false);
    });

    it('keeps a neighbour that merely grazes the plot corner (1 of 4 verts in, centroid out)', () => {
        // Centred NE of the plot's NE corner so only its SW vertex dips over the line.
        const grazing = square(2.1703, 41.3903, 0.00015);
        expect(footprintOnParcel(grazing, PARCEL)).toBe(false);
    });

    it('flags a footprint that straddles the line but lies mostly on the plot', () => {
        // Centre just inside the east edge → most vertices + the centroid over the plot.
        const mostlyOn = square(2.1699, 41.39, 0.00012);
        expect(footprintOnParcel(mostlyOn, PARCEL)).toBe(true);
    });

    it('flags a large footprint that engulfs a small plot (parcel-centroid-in-footprint)', () => {
        // Off-centre + large: the footprint's OWN centroid sits east of the plot (so the
        // centroid + vertex-fraction tests both miss), yet it fully contains the plot — the
        // parcel-centroid-in-footprint branch must still flag it.
        const engulfing = square(2.1712, 41.39, 0.0016);
        expect(footprintOnParcel(engulfing, PARCEL)).toBe(true);
    });

    it('is a no-op for degenerate rings', () => {
        expect(footprintOnParcel([[0, 0], [1, 1]], PARCEL)).toBe(false);
        expect(footprintOnParcel(square(2.17, 41.39, 0.0001), [[0, 0], [1, 1]])).toBe(false);
    });
});

describe('§PLOT-CLEAR-ENVELOPE partitionFootprintsByParcel', () => {
    it('removes only the on-plot building(s), keeps the neighbourhood', () => {
        const plotBuilding = feat(1, square(2.17, 41.39, 0.00012));
        const neighbourA = feat(2, square(2.1706, 41.39, 0.0001));
        const neighbourB = feat(3, square(2.17, 41.396, 0.0001));
        const { kept, removed } = partitionFootprintsByParcel(
            [plotBuilding, neighbourA, neighbourB], PARCEL,
        );
        expect(removed.map((f) => f.properties.osmId)).toEqual([1]);
        expect(kept.map((f) => f.properties.osmId)).toEqual([2, 3]);
    });

    it('removes nothing when no parcel is committed (null) — unchanged behaviour', () => {
        const features = [feat(1, square(2.17, 41.39, 0.00012)), feat(2, square(2.18, 41.39, 0.0001))];
        const { kept, removed } = partitionFootprintsByParcel(features, null);
        expect(removed).toHaveLength(0);
        expect(kept.map((f) => f.properties.osmId)).toEqual([1, 2]);
    });

    it('removes nothing for a degenerate parcel ring', () => {
        const features = [feat(1, square(2.17, 41.39, 0.00012))];
        const { removed } = partitionFootprintsByParcel(features, [[0, 0], [1, 1]]);
        expect(removed).toHaveLength(0);
    });
});
