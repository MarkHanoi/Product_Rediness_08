// §SEA-BAKE-POLYGONS (lane SEA-BAKE, 2026-09-05) — unit tests for tools/context-bake/seaPolygons.mjs,
// the bake-side reader that turns the osmdata "water polygons" shapefile into per-region GeoJSONSeq
// sea POLYGONS (the fix for L-12921 / L-12909 cause 2 / L-807: baked coastline LINES arrive as
// tile-clipped fragments the client walk must refuse; polygons survive clipping closed).
//
// WHAT IS PINNED, and how independent each pin is (§probe-can-be-wrong-three-ways):
//   • The classic-zip reader against a zip this spec WRITES with real CRC-32s — and, where the `unzip`
//     binary exists on the box, `unzip -t` is run on that same fixture so the reader is exercised on
//     an archive an INDEPENDENT tool accepts as well-formed (skipped by name where unzip is absent).
//   • The .shp reader against records this spec WRITES from the ESRI spec (file code 9994, BE record
//     headers in 16-bit words, LE content, PolygonZ trailing Z/M arrays). ⚠ Writer and reader share
//     ONE author's reading of the spec; no independent shapefile reader is available offline. The
//     bake-time floor is the reader's own structural assertions (record numbering, header length ==
//     bytes walked) and the per-region polygon COUNTS bake.mjs prints — a misparse cannot yield a
//     quiet empty, it throws by name or shows 0 polygons on a coastal region.
//   • Containment-based outer/hole assembly (NOT orientation): an outer written CCW is still an outer.
//   • Sutherland–Hodgman clipping: inside / outside / straddle / rect-inside-polygon.
//   • The region writer: one Feature per line with {sea:'1', source}, RFC 7946 winding, NO file for
//     a region with zero polygons (optional layer — absence, never an empty artefact).
//
// LAYERING: a build-tool test — no OTel span (P8 applies to exported package functions).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mod: any = await import(pathToFileURL(resolve(HERE, '..', 'seaPolygons.mjs')).href);

const DIR = mkdtempSync(join(tmpdir(), 'pryzm-seapoly-'));
afterAll(() => rmSync(DIR, { recursive: true, force: true }));

type Pt = [number, number];
type Ring = Pt[];

// ── fixture writers ───────────────────────────────────────────────────────────
function square(x0: number, y0: number, x1: number, y1: number, cw: boolean): Ring {
    const ccw: Ring = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
    return cw ? ccw.slice().reverse() : ccw;
}

/** ESRI .shp main file: 100-byte header + records. fileType 5 = Polygon, 15 = PolygonZ, 25 = PolygonM. */
function shpFile(fileType: number, records: Array<null | { rings: Ring[] }>): Buffer {
    const recs = records.map((rec, idx) => {
        let content: Buffer;
        if (!rec) {
            content = Buffer.alloc(4);
            content.writeInt32LE(0, 0); // Null shape
        } else {
            const numParts = rec.rings.length;
            const numPoints = rec.rings.reduce((a, r) => a + r.length, 0);
            const zm = fileType === 15 ? 2 * (16 + 8 * numPoints) : fileType === 25 ? 16 + 8 * numPoints : 0;
            content = Buffer.alloc(44 + 4 * numParts + 16 * numPoints + zm);
            content.writeInt32LE(fileType, 0);
            const xs = rec.rings.flat().map((p) => p[0]), ys = rec.rings.flat().map((p) => p[1]);
            content.writeDoubleLE(Math.min(...xs), 4); content.writeDoubleLE(Math.min(...ys), 12);
            content.writeDoubleLE(Math.max(...xs), 20); content.writeDoubleLE(Math.max(...ys), 28);
            content.writeInt32LE(numParts, 36); content.writeInt32LE(numPoints, 40);
            let start = 0;
            rec.rings.forEach((r, i) => { content.writeInt32LE(start, 44 + 4 * i); start += r.length; });
            let off = 44 + 4 * numParts;
            for (const r of rec.rings) for (const [x, y] of r) { content.writeDoubleLE(x, off); content.writeDoubleLE(y, off + 8); off += 16; }
            // Z/M ranges + arrays (PolygonZ/M) are left zero — the reader must not depend on them.
        }
        const h = Buffer.alloc(8);
        h.writeInt32BE(idx + 1, 0);
        h.writeInt32BE(content.length / 2, 4);
        return Buffer.concat([h, content]);
    });
    const body = Buffer.concat(recs);
    const head = Buffer.alloc(100);
    head.writeInt32BE(9994, 0);
    head.writeInt32BE((100 + body.length) / 2, 24);
    head.writeInt32LE(1000, 28);
    head.writeInt32LE(fileType, 32);
    return Buffer.concat([head, body]);
}

const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
})();
function crc32(buf: Buffer): number {
    let c = 0xffffffff;
    for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}
/** A classic zip (local headers + central directory + EOCD), real CRC-32s, stored or deflate. */
function zipFile(entries: Array<{ name: string; data: Buffer; deflate?: boolean }>): Buffer {
    const parts: Buffer[] = [], central: Buffer[] = [];
    let offset = 0;
    for (const e of entries) {
        const nameB = Buffer.from(e.name, 'utf8');
        const stored = e.deflate ? deflateRawSync(e.data) : e.data;
        const method = e.deflate ? 8 : 0;
        const crc = crc32(e.data);
        const loc = Buffer.alloc(30);
        loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(20, 4); loc.writeUInt16LE(0, 6); loc.writeUInt16LE(method, 8);
        loc.writeUInt16LE(0, 10); loc.writeUInt16LE(0x21, 12); loc.writeUInt32LE(crc, 14);
        loc.writeUInt32LE(stored.length, 18); loc.writeUInt32LE(e.data.length, 22); loc.writeUInt16LE(nameB.length, 26); loc.writeUInt16LE(0, 28);
        const cen = Buffer.alloc(46);
        cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0, 8); cen.writeUInt16LE(method, 10);
        cen.writeUInt16LE(0, 12); cen.writeUInt16LE(0x21, 14); cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(stored.length, 20); cen.writeUInt32LE(e.data.length, 24);
        cen.writeUInt16LE(nameB.length, 28); cen.writeUInt16LE(0, 30); cen.writeUInt16LE(0, 32); cen.writeUInt16LE(0, 34); cen.writeUInt16LE(0, 36); cen.writeUInt32LE(0, 38); cen.writeUInt32LE(offset, 42);
        parts.push(loc, nameB, stored);
        central.push(cen, nameB);
        offset += 30 + nameB.length + stored.length;
    }
    const cd = Buffer.concat(central);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10); eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16); eocd.writeUInt16LE(0, 20);
    return Buffer.concat([...parts, cd, eocd]);
}

const WGS84_PRJ = 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';

// ── the fixture sea ───────────────────────────────────────────────────────────
// Region A: a "coastal" rect lon 10–12 / lat 40–42. Region B: landlocked, nothing touches it.
const REGION_A: [number, number, number, number] = [10, 40, 12, 42];
const REGION_B: [number, number, number, number] = [20, 50, 21, 51];
const RECORDS: Array<null | { rings: Ring[] }> = [
    // 1 · an ocean cell that CONTAINS the whole region, with one island hole inside it (ESRI winding:
    //     outer CW, hole CCW)
    { rings: [square(9, 39, 13, 43, true), square(10.5, 40.5, 10.7, 40.7, false)] },
    // 2 · a polygon straddling the region's EAST edge
    { rings: [square(11.5, 40.2, 12.5, 40.4, true)] },
    // 3 · a polygon entirely OUTSIDE every region (bbox pre-filter must skip it)
    { rings: [square(14, 40, 15, 41, true)] },
    // 4 · a Null shape
    null,
    // 5 · an outer written CCW (non-ESRI) — containment, not orientation, must decide it is an outer
    { rings: [square(10.1, 41.5, 10.3, 41.7, false)] },
];

function inside(p: Pt, ring: ReadonlyArray<Pt>): boolean {
    let c = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i]!, [xj, yj] = ring[j]!;
        if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
}
function area(ring: ReadonlyArray<Pt>): number {
    let a = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j]![0] * ring[i]![1] - ring[i]![0] * ring[j]![1];
    return a / 2;
}

describe('seaPolygons.mjs — SEA_SOURCE + parseBboxCsv', () => {
    it('names the osmdata product, its licence and the probe it was verified with', () => {
        expect(mod.SEA_SOURCE.url).toBe('https://osmdata.openstreetmap.de/download/water-polygons-split-4326.zip');
        expect(mod.SEA_SOURCE.licence).toMatch(/ODbL/);
        expect(mod.SEA_SOURCE.probe.http).toBe(200);
        expect(mod.SEA_SOURCE.probe.bytes).toBeGreaterThan(500_000_000);
        expect(mod.SEA_FEATURE_TAGS).toEqual({ sea: '1', source: 'osmdata-water-polygons' });
    });
    it('parses the osmium -b order and refuses a malformed or inverted bbox by name', () => {
        expect(mod.parseBboxCsv('141.00,-37.60,153.70,-28.10')).toEqual([141, -37.6, 153.7, -28.1]);
        expect(() => mod.parseBboxCsv('1,2,3')).toThrow(/minlon,minlat,maxlon,maxlat/);
        expect(() => mod.parseBboxCsv('5,2,3,4')).toThrow(/west<east/);
    });
});

describe('seaPolygons.mjs — clipRingToRect (Sutherland–Hodgman)', () => {
    const rect = REGION_A;
    it('returns a ring fully inside unchanged (closed, orientation preserved)', () => {
        const r = square(10.2, 40.2, 10.4, 40.4, true);
        const c = mod.clipRingToRect(r, rect);
        expect(c).not.toBeNull();
        expect(c[0]).toEqual(c[c.length - 1]);
        expect(area(c) < 0).toBe(true); // still clockwise
        expect(c.length).toBe(5);
    });
    it('returns null for a ring fully outside', () => {
        expect(mod.clipRingToRect(square(14, 40, 15, 41, true), rect)).toBeNull();
    });
    it('returns the rect itself when the ring contains the rect (the whole region is sea)', () => {
        const c = mod.clipRingToRect(square(9, 39, 13, 43, true), rect);
        expect(c.length).toBe(5);
        const xs = c.map((p: Pt) => p[0]), ys = c.map((p: Pt) => p[1]);
        expect(Math.min(...xs)).toBe(10); expect(Math.max(...xs)).toBe(12);
        expect(Math.min(...ys)).toBe(40); expect(Math.max(...ys)).toBe(42);
        expect(Math.abs(area(c))).toBeCloseTo(4, 9);
    });
    it('clips a straddling ring to the edge, with new vertices exactly ON the edge', () => {
        const c = mod.clipRingToRect(square(11.5, 40.2, 12.5, 40.4, true), rect);
        expect(Math.max(...c.map((p: Pt) => p[0]))).toBe(12);
        expect(Math.abs(area(c))).toBeCloseTo(0.5 * 0.2, 9);
    });
});

describe('seaPolygons.mjs — assemblePolygons by containment, never orientation', () => {
    it('makes the CW square the outer and the CCW square inside it the hole', () => {
        const polys = mod.assemblePolygons(RECORDS[0]!.rings);
        expect(polys).toHaveLength(1);
        expect(polys[0].holes).toHaveLength(1);
    });
    it('treats a lone CCW ring as an OUTER (a misread orientation convention must not empty the sea)', () => {
        const stats = { holesDropped: 0, outers: 0, outersCw: 0 };
        const polys = mod.assemblePolygons(RECORDS[4]!.rings, stats);
        expect(polys).toHaveLength(1);
        expect(polys[0].holes).toHaveLength(0);
        expect(stats.outers).toBe(1);
        expect(stats.outersCw).toBe(0); // and the convention deviation is COUNTED, not hidden
    });
    it('nests three deep: ring-in-hole-in-outer is an outer again (a lake on an island in the sea)', () => {
        const polys = mod.assemblePolygons([square(0, 0, 10, 10, true), square(2, 2, 8, 8, false), square(4, 4, 6, 6, true)]);
        expect(polys).toHaveLength(2);
        const big = polys.find((p: { outer: Ring }) => Math.abs(area(p.outer)) === 100)!;
        expect(big.holes).toHaveLength(1);
    });
});

describe('seaPolygons.mjs — readShpPolygons', () => {
    it('reads Polygon records, skips the Null shape, and keeps the record bbox + rings', () => {
        const f = join(DIR, 'plain.shp');
        writeFileSync(f, shpFile(5, RECORDS));
        const recs = [...mod.readShpPolygons(f)];
        expect(recs.map((r: { recordNumber: number }) => r.recordNumber)).toEqual([1, 2, 3, 5]);
        expect(recs[0].rings).toHaveLength(2);
        expect(recs[0].bbox).toEqual([9, 39, 13, 43]);
        expect(recs[1].rings[0]).toHaveLength(5);
    });
    it('reads PolygonZ identically — the trailing Z/M arrays are ignored, never mis-offset', () => {
        const f5 = join(DIR, 'p5.shp'), f15 = join(DIR, 'p15.shp'), f25 = join(DIR, 'p25.shp');
        writeFileSync(f5, shpFile(5, RECORDS)); writeFileSync(f15, shpFile(15, RECORDS)); writeFileSync(f25, shpFile(25, RECORDS));
        const a = [...mod.readShpPolygons(f5)], b = [...mod.readShpPolygons(f15)], c = [...mod.readShpPolygons(f25)];
        expect(b).toEqual(a);
        expect(c).toEqual(a);
    });
    it('refuses a non-shapefile and a broken record sequence BY NAME (never an empty iteration)', () => {
        const bad = join(DIR, 'bad.shp');
        writeFileSync(bad, Buffer.alloc(120));
        expect(() => [...mod.readShpPolygons(bad)]).toThrow(/9994/);
        const seq = join(DIR, 'seq.shp');
        const buf = shpFile(5, RECORDS);
        buf.writeInt32BE(7, 100); // first record renumbered
        writeFileSync(seq, buf);
        expect(() => [...mod.readShpPolygons(seq)]).toThrow(/record 7 .* expected 1/);
        const trunc = join(DIR, 'trunc.shp');
        writeFileSync(trunc, shpFile(5, RECORDS).subarray(0, 100 + 8 + 4)); // header + one truncated record
        expect(() => [...mod.readShpPolygons(trunc)]).toThrow(/truncated|declares/);
    });
});

describe('seaPolygons.mjs — the classic zip reader + extractSeaShapefile', () => {
    const shpBytes = shpFile(5, RECORDS);
    const zipPath = join(DIR, 'water-polygons-split-4326.zip');
    beforeAll(() => {
        writeFileSync(zipPath, zipFile([
            { name: 'water-polygons-split-4326/README.txt', data: Buffer.from('fixture\n') },
            { name: 'water-polygons-split-4326/water_polygons.prj', data: Buffer.from(WGS84_PRJ), deflate: true },
            { name: 'water-polygons-split-4326/water_polygons.shp', data: shpBytes, deflate: true },
            { name: 'water-polygons-split-4326/water_polygons.dbf', data: Buffer.alloc(64, 0x20) },
        ]));
    });
    it('the fixture is a zip an INDEPENDENT tool accepts (unzip -t), where unzip exists', () => {
        const probe = spawnSync('unzip', ['-t', zipPath], { encoding: 'utf8' });
        if (probe.error) { console.warn('unzip not on this box — independence cross-check SKIPPED by name'); return; }
        expect(probe.status).toBe(0);
        expect(probe.stdout).toMatch(/No errors detected/);
    });
    it('lists every entry with method + sizes from the central directory', () => {
        const entries = mod.listZipEntries(zipPath);
        expect(entries.map((e: { name: string }) => e.name.split('/').pop())).toEqual(['README.txt', 'water_polygons.prj', 'water_polygons.shp', 'water_polygons.dbf']);
        const shp = entries.find((e: { name: string }) => e.name.endsWith('.shp'));
        expect(shp.method).toBe(8);
        expect(shp.usize).toBe(shpBytes.length);
        expect(shp.csize).toBeLessThan(shpBytes.length);
    });
    it('extracts the .shp (+ .prj, asserted WGS 84) byte-for-byte, streaming inflate', async () => {
        const outDir = join(DIR, 'x1');
        rmSync(outDir, { recursive: true, force: true });
        mkdirSync(outDir);
        const res = await mod.extractSeaShapefile(zipPath, outDir);
        expect(res.entry).toBe('water-polygons-split-4326/water_polygons.shp');
        expect(readFileSync(res.shp).equals(shpBytes)).toBe(true);
        expect(res.wkt).toMatch(/WGS_1984/);
    });
    it('refuses a product with no .prj, and one whose .prj is PROJECTED — the CRS must be PROVEN', async () => {
        const noPrj = join(DIR, 'noprj.zip');
        writeFileSync(noPrj, zipFile([{ name: 'a/water_polygons.shp', data: shpBytes }]));
        await expect(mod.extractSeaShapefile(noPrj, DIR)).rejects.toThrow(/no \.prj/);
        const projected = join(DIR, 'proj.zip');
        writeFileSync(projected, zipFile([
            { name: 'a/water_polygons.shp', data: shpBytes },
            { name: 'a/water_polygons.prj', data: Buffer.from('PROJCS["WGS_1984_Web_Mercator",GEOGCS["GCS_WGS_1984"]]') },
        ]));
        await expect(mod.extractSeaShapefile(projected, DIR)).rejects.toThrow(/not geographic WGS 84/);
    });
});

describe('seaPolygons.mjs — clipWaterPolygonsToRegions: one pass, per-region GeoJSONSeq', () => {
    const shp = join(DIR, 'regions.shp');
    const outA = join(DIR, 'coastal-sea.geojsonseq');
    const outB = join(DIR, 'landlocked-sea.geojsonseq');
    let result: { regions: Array<{ name: string; polygons: number; holes: number; vertices: number; out: string }>; stats: Record<string, number> };
    beforeAll(() => {
        writeFileSync(shp, shpFile(5, RECORDS));
        writeFileSync(outB, 'stale artefact from a previous run\n'); // must be REMOVED, not kept
        result = mod.clipWaterPolygonsToRegions(shp, [
            { name: 'coastal', bbox: REGION_A, out: outA },
            { name: 'landlocked', bbox: REGION_B, out: outB },
        ]);
    });
    it('writes the coastal region: 3 polygons (cell∖island, the clipped straddler, the CCW outer)', () => {
        const a = result.regions.find((r) => r.name === 'coastal')!;
        expect(a.polygons).toBe(3);
        expect(a.holes).toBe(1);
        const lines = readFileSync(outA, 'utf8').trim().split('\n');
        expect(lines).toHaveLength(3);
        const feats = lines.map((l) => JSON.parse(l));
        for (const f of feats) {
            expect(f.type).toBe('Feature');
            expect(f.properties.sea).toBe('1');
            expect(f.properties.source).toBe('osmdata-water-polygons');
            expect(f.geometry.type).toBe('Polygon');
            // RFC 7946: outer CCW, holes CW, every ring closed
            expect(area(f.geometry.coordinates[0]) > 0).toBe(true);
            for (const ring of f.geometry.coordinates) expect(ring[0]).toEqual(ring[ring.length - 1]);
            for (const ring of f.geometry.coordinates.slice(1)) expect(area(ring) < 0).toBe(true);
        }
        const cell = feats.find((f) => f.properties.osmdata_rec === 1)!;
        expect(cell.geometry.coordinates).toHaveLength(2);
        expect(inside([11.5, 41.5], cell.geometry.coordinates[0])).toBe(true);   // open sea in the cell
        expect(inside([10.6, 40.6], cell.geometry.coordinates[0])).toBe(true);   // …the island sits inside the outer
        expect(inside([10.6, 40.6], cell.geometry.coordinates[1])).toBe(true);   // …and inside the HOLE (land)
        expect(Math.abs(area(cell.geometry.coordinates[0]))).toBeCloseTo(4, 9);  // clipped to the 2°×2° region rect
        const straddler = feats.find((f) => f.properties.osmdata_rec === 2)!;
        expect(Math.max(...straddler.geometry.coordinates[0].map((p: Pt) => p[0]))).toBe(12);
        expect(feats.some((f) => f.properties.osmdata_rec === 3)).toBe(false);     // outside → never written
        expect(feats.some((f) => f.properties.osmdata_rec === 5)).toBe(true);      // CCW outer → still sea
    });
    it('writes NO file for the landlocked region and removes a stale one — absence, not an empty artefact', () => {
        const b = result.regions.find((r) => r.name === 'landlocked')!;
        expect(b.polygons).toBe(0);
        expect(existsSync(outB)).toBe(false);
    });
    it('reports honest stats: records walked, records touching a region, outers and the CW count', () => {
        expect(result.stats.records).toBe(4);       // 5 records, one Null
        expect(result.stats.touched).toBe(3);       // records 1, 2 and 5 touch region A; 3 is outside every rect
        expect(result.stats.features).toBe(3);
    });
});
