// §VEG-CANOPY-FROM-WOODS (L-12934) — the parks reader now carries the green area's KIND.
//
// THE FINDING THIS SPEC PINS. The OSM tags DO reach the client on the baked path; the reader simply
// never looked at them. Verified three ways before the field was added:
//   1. `bake.mjs` runs `osmium export` (keeps all tags) into `tippecanoe` with NO `-x` / `-y` /
//      `--exclude-all`, so tags survive into the MVT as feature attributes;
//   2. `contextTiles.toTags` stringifies every MVT property onto `ContextTileFeature.tags`;
//   3. `contextTiles.belongsToLayer` ALREADY gates the parks layer on `leisure` / `landuse` /
//      `natural` being present — a park with no tags would never have been read at all. The layer
//      works today, so the tags are there today.
// So NO bake change was needed: `classifyParkKind` reads what already arrives.
//
// Why the field matters: `natural=wood` / `landuse=forest` are CANOPY areas that
// `contextCanopySynth` fills with synthesised canopies; `leisure=park` / `landuse=grass` are LAWNS
// that must never be filled. Without the kind the renderer would either plant a forest on a lawn or
// leave every forest a flat green carpet — the founder's Jouy-en-Josas report.

import { describe, it, expect } from 'vitest';
import { classifyParkKind, parksFromTileFeatures, type ContextParkKind } from '../contextParks';
import type { ContextTileFeature } from '../contextTiles';

function feature(tags: Record<string, string>, rings: number[][][], syntheticId = 1): ContextTileFeature {
    return { rings, tags, syntheticId } as ContextTileFeature;
}

const SQUARE: number[][][] = [[[2.16, 48.75], [2.17, 48.75], [2.17, 48.76], [2.16, 48.76], [2.16, 48.75]]];

describe('§VEG-CANOPY-FROM-WOODS (L-12934) — classifyParkKind', () => {
    it('classifies each tag the bake\'s parks filter admits', () => {
        const cases: Array<[Record<string, string>, ContextParkKind]> = [
            [{ natural: 'wood' }, 'wood'],
            [{ landuse: 'forest' }, 'forest'],
            [{ leisure: 'park' }, 'park'],
            [{ landuse: 'grass' }, 'grass'],
            [{ landuse: 'recreation_ground' }, 'other'],   // in the bake's filter, NOT a canopy
            [{ natural: 'grassland' }, 'other'],
            [{ natural: 'scrub' }, 'other'],
        ];
        for (const [tags, expected] of cases) expect(classifyParkKind(tags)).toBe(expected);
    });

    it('is never fatal on a missing or empty tag bag — it answers `other`, not undefined', () => {
        expect(classifyParkKind(undefined)).toBe('other');
        expect(classifyParkKind({})).toBe('other');
    });

    it('a wood tagged ALSO as a park is a WOOD — the canopy fill is the more honest render', () => {
        expect(classifyParkKind({ natural: 'wood', leisure: 'park' })).toBe('wood');
        expect(classifyParkKind({ landuse: 'forest', leisure: 'park' })).toBe('forest');
    });
});

describe('§VEG-CANOPY-FROM-WOODS (L-12934) — parksFromTileFeatures carries the kind through', () => {
    it('tags a wood, a forest and a lawn distinctly, keeping the shipped ring + osmId behaviour', () => {
        const areas = parksFromTileFeatures([
            feature({ natural: 'wood' }, SQUARE, 10),
            feature({ landuse: 'forest' }, SQUARE, 11),
            feature({ leisure: 'park' }, SQUARE, 12),
            feature({ landuse: 'grass' }, SQUARE, 13),
        ]).areas;
        expect(areas.map((a) => a.kind)).toEqual(['wood', 'forest', 'park', 'grass']);
        // The shipped contract is untouched: closed ring as [lon,lat], synthetic id spaced by 16.
        expect(areas[0]!.ring[0]).toEqual([2.16, 48.75]);
        expect(areas.map((a) => a.osmId)).toEqual([160, 176, 192, 208]);
    });

    it('gives every ring of a MULTI-RING feature the same kind (one wood, several tile pieces)', () => {
        const areas = parksFromTileFeatures([feature({ natural: 'wood' }, [SQUARE[0]!, SQUARE[0]!], 20)]).areas;
        expect(areas).toHaveLength(2);
        expect(areas.every((a) => a.kind === 'wood')).toBe(true);
        expect(areas[0]!.osmId).not.toBe(areas[1]!.osmId);   // pieces never collide
    });

    it('an untagged feature is `other` — never silently promoted to a canopy area', () => {
        const areas = parksFromTileFeatures([feature({}, SQUARE, 30)]).areas;
        expect(areas).toHaveLength(1);
        expect(areas[0]!.kind).toBe('other');
    });

    it('still drops rings under 4 points (a stub is not a polygon)', () => {
        const areas = parksFromTileFeatures([feature({ natural: 'wood' }, [[[2.16, 48.75], [2.17, 48.75]]], 40)]).areas;
        expect(areas).toHaveLength(0);
    });
});
