// §PLATEAU-JP (2026-09-06, lane JAPAN-FULL) — the DECISIONS of the Japanese national height stamp, pinned
// against bytes taken from the live service.
//
// THREE FIXTURES, and what each is:
//   • jp-plateau-tileset-chiyoda-lod1-2026-09-06.json — VERBATIM, 14,778 B, the LoD1 `tileset.json` for
//     千代田区 exactly as `assets.cms.plateau.reearth.io` served it (HTTP 200, last-modified 2026-03-10).
//   • jp-plateau-b3dm-chiyoda-data4-2026-09-06.bin — VERBATIM, 107,352 B, the RANGE-GET PREFIX
//     (`bytes=0-107351`) of that tileset's `data/data4.b3dm`. Not a truncation we invented: 107,352 is
//     exactly `28 + ftJSON 20 + ftBIN 0 + btJSON 105,416 + btBIN 1,888`, i.e. what the reader asks for.
//     In THIS tile `bldg:measuredHeight` is a BINARY DOUBLE reference.
//   • jp-plateau-b3dm-chiyoda-data0-first8-2026-09-06.bin — DERIVED, and labelled so. Built from the
//     REAL leaf tile `data/data0.b3dm` (1,846 buildings, 10.2 MB of batch-table JSON) by keeping eight
//     rows — the first six 点群から取得_中央値 and the first two 取得不可のため一律値（3m） — and dropping
//     the nested `attributes` column. The VALUES and, decisively, the ENCODING are the live service's
//     (measuredHeight as a JSON ARRAY here, `_x`/`_y` still binary); the row COUNT is ours.
//     [[fake-more-capable-than-real]]: the array-vs-binary split was DISCOVERED in the live bytes, not
//     invented here, so this fixture can still falsify the reader.
//
// LAYERING: a build-tooling spec like its siblings — no OTel span (P8 binds exported package functions,
// not bake tooling).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    JP_PLATEAU, JP_CITY_BBOXES, JP_PLATEAU_INDEX_URLS,
    parseB3dmHeader, readB3dmBatchTable, batchTableColumn, batchTableFeatureCount,
    plateauPartsFromBatchTable, tilesetLeafTiles, regionOfBoundingVolume, bboxesIntersect,
    resolveTileUrl, tileFormatOf, pointInRing, partGrid, matchPartsToFootprint, areaWeightedP90,
    plateauLod1TilesetUrl, plateauCityCode, plateauRecordsForBboxes,
} from '../heights/jpPlateau.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const fx = (n: string) => resolve(HERE, 'fixtures', n);
const TILESET = JSON.parse(readFileSync(fx('jp-plateau-tileset-chiyoda-lod1-2026-09-06.json'), 'utf8'));
const B3DM_BIN_ENC = readFileSync(fx('jp-plateau-b3dm-chiyoda-data4-2026-09-06.bin'));
const B3DM_ARR_ENC = readFileSync(fx('jp-plateau-b3dm-chiyoda-data0-first8-2026-09-06.bin'));
const INDEX_2025 = JSON.parse(readFileSync(fx('jp-plateau-index-2025-excerpt-2026-09-06.json'), 'utf8'));

describe('§PLATEAU-JP — the tileset declares a measured height AND a position per building', () => {
    it('the live tileset.json declares bldg:measuredHeight with a real min/max', () => {
        expect(TILESET.properties['bldg:measuredHeight']).toEqual({ minimum: 0.8, maximum: 209.5 });
    });

    it('and declares the per-feature POSITION columns the geometric join depends on', () => {
        // Without _x/_y there is no way to place a PLATEAU building against an OSM footprint, and the
        // whole channel would collapse to "read the 2.11 GB CityGML zip". These keys are the reason it does not.
        for (const k of ['_x', '_y', '_xmin', '_xmax', '_ymin', '_ymax']) {
            expect(Object.keys(TILESET.properties), `tileset must declare ${k}`).toContain(k);
        }
    });

    it('walks the tree to LEAVES only — a REPLACE tileset would double-count if parents were read', () => {
        expect(TILESET.root.refine).toBe('REPLACE');
        const leaves = tilesetLeafTiles(TILESET);
        expect(leaves).toHaveLength(15);
        expect(leaves.every((l) => /^data\/data\d+\.b3dm$/.test(l.uri))).toBe(true);
        // Chiyoda's root and mid nodes hold 19-20 coarse buildings each; the 15 leaves hold all 12,558.
        expect(leaves.map((l) => l.uri)).not.toContain('data/data19.b3dm'); // data19 is the ROOT's own content
    });

    it('filters leaves by bbox, and a bbox outside Japan selects none', () => {
        const kanda = tilesetLeafTiles(TILESET, [139.76962, 35.69614, 139.78270, 35.70514]);
        expect(kanda.length).toBeGreaterThan(0);
        expect(kanda.length).toBeLessThan(15);
        expect(tilesetLeafTiles(TILESET, [2.1, 41.3, 2.2, 41.4])).toHaveLength(0); // Barcelona
    });

    it('converts a 3D Tiles `region` (radians) to degrees and REFUSES a box/sphere volume', () => {
        const deg = regionOfBoundingVolume(TILESET.root.boundingVolume)!;
        expect(deg[0]).toBeCloseTo(139.73017, 4);
        expect(deg[3]).toBeCloseTo(35.70518, 4);
        // null, not a guess: an unexpected volume must never silently become "the whole world".
        expect(regionOfBoundingVolume({ box: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1] })).toBeNull();
        expect(regionOfBoundingVolume({ sphere: [0, 0, 0, 100] })).toBeNull();
    });

    it('resolves a tile uri against its tileset URL', () => {
        expect(resolveTileUrl('https://h/a/b/tileset.json', 'data/data0.b3dm')).toBe('https://h/a/b/data/data0.b3dm');
        expect(resolveTileUrl('https://h/a/b/tileset.json', 'https://other/x.b3dm')).toBe('https://other/x.b3dm');
    });
});

describe('§PLATEAU-JP — the b3dm reader, on both encodings the live service uses', () => {
    it('parses the header with BYTE offsets (the batch table is full of Japanese text)', () => {
        const h = parseB3dmHeader(B3DM_BIN_ENC)!;
        expect(h).toMatchObject({ version: 1, byteLength: 197452, ftJSON: 20, ftBIN: 0, btJSON: 105416, btBIN: 1888 });
        // The prefix a range GET must ask for — and exactly the fixture's own size.
        expect(h.prefixBytes).toBe(107352);
        expect(B3DM_BIN_ENC.length).toBe(h.prefixBytes);
    });

    it('refuses anything that is not a b3dm rather than reading an error page as a tile', () => {
        expect(parseB3dmHeader(Buffer.from('<!DOCTYPE html><html><head><title>502 Bad Gateway'))).toBeNull();
        expect(parseB3dmHeader(Buffer.from('glTF\0\0\0'))).toBeNull(); // the 台東区 shape
        expect(parseB3dmHeader(Buffer.alloc(10))).toBeNull();
    });

    it('⭐ reads bldg:measuredHeight when it is a BINARY DOUBLE reference (data4.b3dm)', () => {
        const bt = readB3dmBatchTable(B3DM_BIN_ENC)!;
        expect(batchTableFeatureCount(bt.json)).toBe(19);
        expect(Array.isArray(bt.json['bldg:measuredHeight'])).toBe(false);
        expect(bt.json['bldg:measuredHeight']).toMatchObject({ componentType: 'DOUBLE', type: 'SCALAR' });
        const h = batchTableColumn(bt.json, bt.bin, 'bldg:measuredHeight', 19)!;
        expect(h[0]).toBeCloseTo(20.3, 5);
        expect(Math.max(...h)).toBeCloseTo(198.6, 5);
    });

    it('⭐ reads the SAME key when it is a JSON ARRAY (leaf data0.b3dm) — the branch that silently ships zeroes if missed', () => {
        const bt = readB3dmBatchTable(B3DM_ARR_ENC)!;
        expect(Array.isArray(bt.json['bldg:measuredHeight'])).toBe(true);
        expect(bt.json._x).toMatchObject({ componentType: 'DOUBLE' }); // still binary in the same tile
        const h = batchTableColumn(bt.json, bt.bin, 'bldg:measuredHeight', 8)!;
        expect(h.slice(0, 6)).toEqual([33.8, 24.9, 8.7, 48.8, 14.2, 34.3]);
        const x = batchTableColumn(bt.json, bt.bin, '_x', 8)!;
        expect(x[0]).toBeCloseTo(139.7727, 3);
    });

    it('returns null for an absent column and for a byteOffset past the end of the binary', () => {
        const bt = readB3dmBatchTable(B3DM_ARR_ENC)!;
        expect(batchTableColumn(bt.json, bt.bin, 'no:such:key', 8)).toBeNull();
        expect(batchTableColumn({ k: { byteOffset: 1_000_000, componentType: 'DOUBLE', type: 'SCALAR' } }, bt.bin, 'k', 8)).toBeNull();
    });
});

describe('§PLATEAU-JP — the HONESTY GATE: which heights are a measurement', () => {
    it('every building in data4 is a point-cloud median and is kept', () => {
        const bt = readB3dmBatchTable(B3DM_BIN_ENC)!;
        const r = plateauPartsFromBatchTable(bt.json, bt.bin);
        expect(r.features).toBe(19);
        expect(r.parts).toHaveLength(19);
        expect(r.heightTypes).toEqual({ '点群から取得_中央値': 19 });
        expect(r.skipped).toEqual({ refusedType: 0, unknownType: 0, noHeight: 0, outOfRange: 0, noPosition: 0 });
        expect(r.parts[0]).toMatchObject({ id: '13101-bldg-1619' });
        expect(r.parts[0].clon).toBeCloseTo(139.7732, 3);
        expect(r.parts[0].clat).toBeCloseTo(35.6986, 3);
    });

    it("⛔ REFUSES 取得不可のため一律値（3m） BY NAME — PLATEAU's own 'could not measure' default is not a measurement", () => {
        const bt = readB3dmBatchTable(B3DM_ARR_ENC)!;
        const r = plateauPartsFromBatchTable(bt.json, bt.bin);
        expect(r.features).toBe(8);
        expect(r.parts).toHaveLength(6);                       // the two refused rows do NOT become parts
        expect(r.skipped.refusedType).toBe(2);
        expect(r.heightTypes).toEqual({ '点群から取得_中央値': 6, '取得不可のため一律値（3m）': 2 });
        // ⚠ this is the whole point: stamping those two as `measured-lidar` would draw a fabricated
        // 3 m carpet that is indistinguishable from a footprint with no data at all (L-12946).
        expect(r.parts.map((p) => p.h)).toEqual([33.8, 24.9, 8.7, 48.8, 14.2, 34.3]);
    });

    it('an UNSEEN uro:lod1HeightType is counted and NOT stamped — a new code must be read before it is trusted', () => {
        const r = plateauPartsFromBatchTable({
            gml_id: ['a', 'b'],
            'bldg:measuredHeight': [12, 13],
            _x: [139.7, 139.7], _y: [35.6, 35.6],
            'uro:lod1HeightType': ['点群から取得_中央値', '将来の新しいコード'],
        }, Buffer.alloc(0));
        expect(r.parts).toHaveLength(1);
        expect(r.skipped.unknownType).toBe(1);
    });

    it('drops a height outside [minHeightM, maxHeightM] and a building with no position, each by name', () => {
        const r = plateauPartsFromBatchTable({
            gml_id: ['tall', 'nopos', 'zero'],
            'bldg:measuredHeight': [900, 20, 0],
            _x: [139.7, null, 139.7], _y: [35.6, null, 35.6],
            'uro:lod1HeightType': ['点群から取得_中央値', '点群から取得_中央値', '点群から取得_中央値'],
        }, Buffer.alloc(0));
        expect(r.parts).toHaveLength(0);
        expect(r.skipped.outOfRange).toBe(1);
        expect(r.skipped.noPosition).toBe(1);
        expect(r.skipped.noHeight).toBe(1);
        expect(JP_PLATEAU.maxHeightM).toBeGreaterThan(300);   // Abeno Harukas is 300 m — the clamp must not cut Japan's tallest
    });
});

describe('§PLATEAU-JP — the join is GEOMETRIC, and says so', () => {
    const square = (cx: number, cy: number, r: number) =>
        [[cx - r, cy - r], [cx + r, cy - r], [cx + r, cy + r], [cx - r, cy + r], [cx - r, cy - r]] as [number, number][];

    it('matches FORWARD: a PLATEAU centroid inside the OSM ring', () => {
        const parts = [{ id: 'a', h: 40, clon: 139.7, clat: 35.6, x0: 139.6999, y0: 35.5999, x1: 139.7001, y1: 35.6001, area: 4e-8 }];
        const rec = { ext: square(139.7, 35.6, 0.0004), interiors: [], clon: 139.7, clat: 35.6 };
        const { owned, via } = matchPartsToFootprint(rec, partGrid(parts).get([139.6996, 35.5996, 139.7004, 35.6004]));
        expect(via).toBe('forward');
        expect(owned.map((p) => p.id)).toEqual(['a']);
    });

    it('matches REVERSE when OSM has SPLIT one PLATEAU building — the smallest containing box wins', () => {
        const parts = [
            { id: 'big', h: 90, clon: 139.71, clat: 35.61, x0: 139.69, y0: 35.59, x1: 139.73, y1: 35.63, area: 1.6e-3 },
            { id: 'small', h: 30, clon: 139.705, clat: 35.605, x0: 139.6995, y0: 35.5995, x1: 139.7005, y1: 35.6005, area: 1e-6 },
        ];
        const rec = { ext: square(139.7, 35.6, 0.00005), interiors: [], clon: 139.7, clat: 35.6 };
        const { owned, via } = matchPartsToFootprint(rec, parts);
        expect(via).toBe('reverse');
        expect(owned.map((p) => p.id)).toEqual(['small']);
    });

    it('matches NEITHER when nothing is near — the footprint keeps its ORIGINAL OSM tags, never a neighbour height', () => {
        const parts = [{ id: 'far', h: 40, clon: 140.9, clat: 36.9, x0: 140.89, y0: 36.89, x1: 140.91, y1: 36.91, area: 4e-4 }];
        const rec = { ext: square(139.7, 35.6, 0.0004), interiors: [], clon: 139.7, clat: 35.6 };
        expect(matchPartsToFootprint(rec, parts).via).toBeNull();
    });

    it('a PLATEAU centroid inside a HOLE of the footprint is not owned by it', () => {
        const ext = square(139.7, 35.6, 0.002);
        const hole = square(139.7, 35.6, 0.001);
        const parts = [{ id: 'courtyard', h: 40, clon: 139.7, clat: 35.6, x0: 139.6999, y0: 35.5999, x1: 139.7001, y1: 35.6001, area: 4e-8 }];
        const rec = { ext, interiors: [hole], clon: 139.7, clat: 35.6 };
        // it falls back to REVERSE (the centroid IS inside the part box) but must NOT be a forward match
        expect(matchPartsToFootprint(rec, parts).via).not.toBe('forward');
        expect(pointInRing(139.7, 35.6, hole)).toBe(true);
    });

    it('one owned part gives that height exactly; several give the AREA-WEIGHTED P90, not the max', () => {
        expect(areaWeightedP90([{ h: 17.5, area: 1 } as never])).toBe(17.5);
        // a big 10 m hall with a small 90 m tower attached: the hall dominates the area, so the P90 is
        // NOT 90 — a footprint drawn round a block must not inherit the tower.
        const owned = [{ h: 10, area: 100 }, { h: 90, area: 1 }] as never[];
        expect(areaWeightedP90(owned)).toBe(10);
        expect(areaWeightedP90([])).toBeNull();
    });
});

describe('§PLATEAU-JP — tile formats, and the ⛔ named refusal', () => {
    it('classifies b3dm, glb and anything else', () => {
        expect(tileFormatOf('data/data0.b3dm')).toBe('b3dm');
        expect(tileFormatOf('18/232850/39536_bldg_Building.glb')).toBe('glb');
        expect(tileFormatOf('sub/tileset.json')).toBe('other');
        expect(tileFormatOf(undefined as never)).toBe('other');
    });

    it('the module NAMES the one municipality that ships .glb rather than leaving it a silent zero', () => {
        const src = readFileSync(resolve(HERE, '../heights/jpPlateau.mjs'), 'utf8');
        expect(src).toMatch(/13106/);            // 台東区 — measured, not assumed
        expect(src).toMatch(/EXT_structural_metadata/);
        expect(src).toMatch(/NAMED REFUSAL/);
    });
});

describe('§PLATEAU-JP — the index, and the working set', () => {
    it('picks the TEXTURED LoD1 building tileset out of an index row', () => {
        const chiyoda = INDEX_2025.data_update.find((r: never) => /13101/.test((r as { ori_id: string }).ori_id));
        const url = plateauLod1TilesetUrl(chiyoda)!;
        expect(url).toMatch(/_bldg_3dtiles.*lod1\/tileset\.json$/);
        expect(url).not.toMatch(/no_texture/);
        expect(plateauCityCode(chiyoda)).toBe('13101');
        expect(plateauLod1TilesetUrl({ tileset: [{ url: 'https://h/x_fld_3dtiles/tileset.json' }] })).toBeNull();
    });

    it('selects only municipalities near the working set — a Tokyo bbox does not pull an Aomori town', () => {
        const recs = plateauRecordsForBboxes([{ year: 2025, json: INDEX_2025 }], [[139.66, 35.60, 139.85, 35.76]]);
        expect(recs.map((r) => r.code)).toEqual(['13101']);
        expect(recs[0].city).toBe('千代田区');
        // 鰺ヶ沢町 (02321) is in the same fixture and 4.9° north — it must not be selected.
        const all = plateauRecordsForBboxes([{ year: 2025, json: INDEX_2025 }], [[122.9, 24.0, 153.99, 45.6]]);
        expect(all.map((r) => r.code).sort()).toEqual(['02321', '13101']);
    });

    it('when a city appears in several fiscal years the NEWEST wins — reading two would double-count', () => {
        const older = JSON.parse(JSON.stringify(INDEX_2025));
        const recs = plateauRecordsForBboxes(
            [{ year: 2022, json: older }, { year: 2025, json: INDEX_2025 }],
            [[139.66, 35.60, 139.85, 35.76]],
        );
        expect(recs).toHaveLength(1);
        expect(recs[0].year).toBe(2025);
    });

    it('the working set is a BOUNDED city list — the whole-country row must not retain a nation', () => {
        expect(JP_CITY_BBOXES.length).toBe(10);
        expect(JP_CITY_BBOXES.map((c) => c.city)).toContain('tokyo');
        const totalDeg2 = JP_CITY_BBOXES.reduce((s, c) => s + (c.bbox[2] - c.bbox[0]) * (c.bbox[3] - c.bbox[1]), 0);
        expect(totalDeg2).toBeLessThan(1);              // vs ~671 deg² for the japan region bbox
        for (const { city, bbox } of JP_CITY_BBOXES) {
            expect(bbox[0], `${city} w<e`).toBeLessThan(bbox[2]);
            expect(bbox[1], `${city} s<n`).toBeLessThan(bbox[3]);
            // inside the bake.mjs `japan` bbox, or the join would retain footprints the region never bakes
            expect(bboxesIntersect(bbox, [122.9, 24.0, 153.99, 45.6]), `${city} inside japan`).toBe(true);
        }
    });

    it('six index years are declared, all on the stable CKAN download path (the S3 signature is per-request)', () => {
        expect(JP_PLATEAU_INDEX_URLS).toHaveLength(6);
        for (const { url } of JP_PLATEAU_INDEX_URLS) expect(url).toMatch(/^https:\/\/www\.geospatial\.jp\/ckan\/dataset\/[\w-]+\/resource\/[\w-]+\/download\/mlit_plateau_3d_\d{4}\.json$/);
    });

    it('the licence and attribution are carried with the data, not left to a reader to remember', () => {
        expect(JP_PLATEAU.attribution).toMatch(/国土交通省/);
        expect(JP_PLATEAU.attribution).toMatch(/PDL 1\.0/);
        expect(JP_PLATEAU.attribution).toMatch(/CC BY 4\.0/);
    });
});
