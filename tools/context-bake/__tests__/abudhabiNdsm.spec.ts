// §ADSDI-NDSM (2026-09-05, lane ME-ABUDHABI-I3S) — the Abu Dhabi measured-height stamp's DECISIONS, unit-tested.
// `heights/abudhabiNdsm.mjs` is the pure half (the LICENCE READ, exportImage URL + axis order, pixel budget, the
// service verdict, the byte sniff, the refusal parser, the hollow-TIFF verdict, the mosaic pre-check, the city
// working set); the raster/network half in heights/abudhabiNdsmStamp.mjs imports heightSources.mjs, which vitest
// cannot load (see mdsBboxCoversTerrainRegion.spec.ts) — which is why the decisions were pulled out.
//
// WHAT EACH TEST PINS, and why it earned a test rather than a comment:
//   • the licence — the brief named the I3S city model; the SDI Terms scope reuse to catalogued "Open Data", the
//     I3S item is uncatalogued (licenseInfo null), and sid 2012 `50CM_AD_DSM_DTM` IS "Open Data". The verbatim
//     fixtures pin BOTH halves of that verdict so nobody re-opens the I3S without re-reading the Terms.
//   • the service verdict — read from the two verbatim ?f=json bodies: F32 / 0.5 m / 3857 / 15000×4100, and the
//     mosaic rectangles the module hard-codes are byte-equal to the bodies (a drifted constant would refuse real cells).
//   • the byte sniff — this server labels a 156 B JSON refusal `image/tiff`; a content-type check is worthless here.
//   • the hollow-TIFF verdict — an off-mosaic cell is a 994 B TIFF whose 20 tiles are all 0 bytes (EMPTY), a
//     partially empty one is a defect (ERROR); geotiff.js throws on both, so the verdict must come first.
//   • the mosaic pre-check — the gate cell is inside both mosaics; the offshore probe cell is outside; both refusals
//     happen before a request.
//   • city bboxes — inside the bake.mjs `abudhabi` row, inside both mosaics, the CI spot-check point inside the core.
//
// LAYERING: a build/inspection tool test — no OTel span (P8 applies to exported package functions).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    AD_ADSDI, AD_CITY_BBOXES, AD_ADSDI_OVERSIZE_REFUSAL_VERBATIM, adNdsmExportImageUrl, adNdsmPxDims,
    adNdsmServiceVerdict, cellInsideMosaics, hollowTiffVerdict, lonLatTo3857, ndsmDifference, parseAdNdsmRefusal, sniffBodyKind,
} from '../heights/abudhabiNdsm.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
type Bbox = [number, number, number, number];
const fixture = (name: string) => readFileSync(resolve(HERE, 'fixtures', name), 'utf8');
const GATE_CELL: Bbox = [54.369, 24.449, 54.381, 24.461];      // the 2026-09-05 probe box (padded 0.01° cell)
const OFFSHORE_CELL: Bbox = [53.30, 24.90, 53.31, 24.91];       // 60 km offshore — the hollow-TIFF probe
const GATE_POINT = { lon: 54.3773, lat: 24.4539 };              // CI spot-check (Al Markaziyah)

describe('§ADSDI-NDSM — the licence read, pinned on the verbatim catalogue + Terms fixtures', () => {
    const cat = JSON.parse(fixture('ae-adsdi-datacatalogue-building-dsm-dtm-records-2026-09-05.json'));
    const tc = JSON.parse(fixture('ae-adsdi-sdi-terms-and-conditions-clauses-2026-09-05.json'));
    it('sid 2012 `50CM_AD_DSM_DTM` and sid 2013 are catalogued "Open Data" by the Department of Government Enablement', () => {
        const bySid = new Map<number, Record<string, unknown>>(cat.records.map((r: Record<string, unknown>) => [r.sid as number, r]));
        for (const sid of [2012, 2013]) {
            const r = bySid.get(sid)!;
            expect(r, `sid ${sid}`).toBeDefined();
            expect(r.layer_sensitivity_en).toBe('Open Data');
            expect(r.costodian_en).toBe('Department of Government Enablement');
            expect(r.layer_type).toBe('Satellite Imagery');   // photogrammetric, not LiDAR — the module says so
        }
        expect(bySid.get(2012)!.layer_name_en).toBe('50CM_AD_DSM_DTM');
        // the catalogued BUILDING layer is Open Data too — footprints + floors, NO height field (recorded, not wired)
        expect(bySid.get(1046)!.layer_sensitivity_en).toBe('Open Data');
    });
    it('the Terms permit Open Data reuse with attribution and confer NO licence otherwise (why the I3S is refused)', () => {
        expect(tc.clauses.tc_accesstodatali1).toContain('Users are permitted to download, use, and integrate Open Data within their own business operations');
        expect(tc.clauses.tc_accesstodatali1).toContain('users should credit the SDI Data Catalog as the source');
        expect(tc.clauses.tc_Definitionsli1).toContain('free of charge and without restrictions on its use, redistribution, or adaptation');
        expect(tc.clauses.tc_intellectualpropertyrights2).toContain('nothing in these Terms should be construed as conferring any license');
        expect(tc.clauses.tc_intellectualpropertyrights3).toContain("without DGE's express prior written consent");
    });
    it('the module carries the attribution the Terms ask for and names the method as photogrammetric, not LiDAR', () => {
        expect(AD_ADSDI.attribution).toContain('Abu Dhabi SDI Data Catalog');
        expect(AD_ADSDI.attribution).toContain('Department of Government Enablement');
        expect(AD_ADSDI.method).toContain('photogrammetric');
        expect(AD_ADSDI.method).toContain('NOT LiDAR');
        expect(AD_ADSDI.heightSourceTag).toContain('photogrammetric');
    });
    it('reads nothing from the I3S city model — no SceneServer URL anywhere in the module', () => {
        const src = readFileSync(resolve(HERE, '../heights/abudhabiNdsm.mjs'), 'utf8');
        const code = src.split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n');
        expect(code).not.toMatch(/SceneServer/);
        expect(code).not.toMatch(/abu_dhabi_3d_city_model/);
        const stamp = readFileSync(resolve(HERE, '../heights/abudhabiNdsmStamp.mjs'), 'utf8').split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n');
        expect(stamp).not.toMatch(/SceneServer/);
    });
});

describe('§ADSDI-NDSM — exportImage URL', () => {
    it('emits bbox in LON,LAT (xmin,ymin,xmax,ymax) with 4326 in and out, F32, noData=-9999, f=image (the live-verified shape)', () => {
        // The served GeoTIFF read back as [54.369, 24.448408, 54.381, 24.461592] — ArcGIS re-fits the extent.
        const url = adNdsmExportImageUrl(AD_ADSDI.dsm, GATE_CELL, { width: 1216, height: 1336 });
        expect(url.startsWith('https://arcgis.sdi.abudhabi.ae/agsimage/rest/services/ImageService/IMGSER_AUH_DSM3_50CM/ImageServer/exportImage?')).toBe(true);
        expect(url).toContain('bbox=54.369,24.449,54.381,24.461');
        expect(url).toContain('bboxSR=4326');
        expect(url).toContain('imageSR=4326');
        expect(url).toContain('size=1216,1336');
        expect(url).toContain('format=tiff');
        expect(url).toContain('pixelType=F32');
        expect(url).toContain('noData=-9999');
        expect(url).toContain('f=image');
    });
    it('never emits the LAT,LON order that silently asks for a raster in the Indian Ocean', () => {
        const url = adNdsmExportImageUrl(AD_ADSDI.dtm, GATE_CELL, { width: 10, height: 10 });
        expect(url).not.toContain('bbox=24.449,54.369');
    });
    it('the DSM and DTM services are the two probed ImageServers (DSM part 3 = the Abu Dhabi metro mosaic), and nothing else', () => {
        expect(AD_ADSDI.dsm).toBe('https://arcgis.sdi.abudhabi.ae/agsimage/rest/services/ImageService/IMGSER_AUH_DSM3_50CM/ImageServer');
        expect(AD_ADSDI.dtm).toBe('https://arcgis.sdi.abudhabi.ae/agsimage/rest/services/ImageService/IMGSER_AUH_DTM_50CM/ImageServer');
    });
});

describe('§ADSDI-NDSM — pixel budget', () => {
    it('sizes a ~1 m request from the box in metres (Abu Dhabi latitude) — the probed 1216 × 1336', () => {
        expect(adNdsmPxDims(GATE_CELL, 1.0)).toEqual({ width: 1216, height: 1336 });
    });
    it('caps at the probed service maxima (15000 × 4100) and floors at 2 px', () => {
        expect(adNdsmPxDims([54.28, 24.33, 54.75, 24.62], 1.0)).toEqual({ width: 15000, height: 4100 });
        expect(adNdsmPxDims([54.37, 24.45, 54.3700001, 24.4500001], 1.0)).toEqual({ width: 2, height: 2 });
    });
    it('a padded 0.01° cell at 1 m stays under the 4100-px height cap (the binding axis)', () => {
        expect(adNdsmPxDims(GATE_CELL, 1.0).height).toBeLessThan(4100);
    });
});

describe('§ADSDI-NDSM — service verdict (from the verbatim ?f=json bodies)', () => {
    it('reads the live DSM3 metadata as F32 / 15000×4100 / 3857 / 0.5 m, and the module mosaic rectangle equals the body', () => {
        const v = adNdsmServiceVerdict(fixture('ae-adsdi-imgser-auh-dsm3-50cm-imageserver-2026-09-05.json'))!;
        expect(v.ok).toBe(true);
        expect(v.pixelType).toBe('F32');
        expect(v.maxWidth).toBe(15000);
        expect(v.maxHeight).toBe(4100);
        expect(v.nativeWkid).toBe(3857);
        expect(v.pixelSizeM).toBeCloseTo(0.5, 5);
        expect(v.extent3857).toEqual(AD_ADSDI.mosaic3857.dsm);
        expect(AD_ADSDI.maxWidth).toBe(v.maxWidth); expect(AD_ADSDI.maxHeight).toBe(v.maxHeight);
    });
    it('reads the live DTM metadata the same way, and its rectangle equals the module constant', () => {
        const v = adNdsmServiceVerdict(fixture('ae-adsdi-imgser-auh-dtm-50cm-imageserver-2026-09-05.json'))!;
        expect(v.ok).toBe(true); expect(v.pixelType).toBe('F32'); expect(v.maxHeight).toBe(4100);
        expect(v.pixelSizeM).toBe(0.5);
        expect(v.extent3857).toEqual(AD_ADSDI.mosaic3857.dtm);
    });
    it('refuses a non-F32 service by name, a 499 token document by name, and returns null (UNKNOWN) for a non-document', () => {
        expect(adNdsmServiceVerdict(JSON.stringify({ pixelType: 'U8', maxImageWidth: 4096 }))!.ok).toBe(false);
        const tok = adNdsmServiceVerdict('{"error":{"code":499,"message":"Token Required","details":[]}}')!;
        expect(tok.ok).toBe(false); expect(tok.reason).toContain('499');
        expect(adNdsmServiceVerdict('<html>maintenance</html>')).toBeNull();
        expect(adNdsmServiceVerdict('')).toBeNull();
        expect(adNdsmServiceVerdict(undefined as unknown as string)).toBeNull();
    });
});

describe('§ADSDI-NDSM — the refusal inside an HTTP 200 labelled image/tiff', () => {
    it('names the oversize refusal from the verbatim 156-byte body', () => {
        expect(AD_ADSDI_OVERSIZE_REFUSAL_VERBATIM.length).toBe(156);
        expect(parseAdNdsmRefusal(AD_ADSDI_OVERSIZE_REFUSAL_VERBATIM)).toBe('400 Invalid or missing input parameters. — The requested image exceeds the size limit.');
    });
    it('sniffs the body by its bytes: little/big-endian TIFF magic → tiff, a leading `{` → json, anything else → other', () => {
        expect(sniffBodyKind(new Uint8Array([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]))).toBe('tiff');
        expect(sniffBodyKind(new Uint8Array([0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08]))).toBe('tiff');
        expect(sniffBodyKind(new TextEncoder().encode(AD_ADSDI_OVERSIZE_REFUSAL_VERBATIM))).toBe('json');
        expect(sniffBodyKind(new TextEncoder().encode('  \n{"error":1}'))).toBe('json');
        expect(sniffBodyKind(new TextEncoder().encode('<html>'))).toBe('other');
        expect(sniffBodyKind(new Uint8Array(0))).toBe('other');
        expect(sniffBodyKind(new TextEncoder().encode('II*\0').buffer)).toBe('tiff');   // ArrayBuffer accepted
        expect(sniffBodyKind('II*' as unknown as Uint8Array)).toBe('other');            // never throws
    });
    it('returns null for a TIFF header, a non-error JSON, or nothing', () => {
        expect(parseAdNdsmRefusal('II* ')).toBeNull();
        expect(parseAdNdsmRefusal('{"currentVersion":10.91}')).toBeNull();
        expect(parseAdNdsmRefusal('')).toBeNull();
    });
});

describe('§ADSDI-NDSM — the hollow TIFF (the off-mosaic answer: 20 tiles, every one 0 bytes)', () => {
    it('all-empty → hollow (an honest EMPTY), some-empty → partial (a defect), none-empty → neither', () => {
        expect(hollowTiffVerdict(new Array(20).fill(0))).toEqual({ tiles: 20, empty: 20, hollow: true, partial: false });
        expect(hollowTiffVerdict([65536, 0, 65536])).toEqual({ tiles: 3, empty: 1, hollow: false, partial: true });
        expect(hollowTiffVerdict(new Uint32Array([65536, 65536]))).toEqual({ tiles: 2, empty: 0, hollow: false, partial: false });
    });
    it('returns null (UNKNOWN) when there are no counts at all — the decoder decides', () => {
        expect(hollowTiffVerdict(null)).toBeNull();
        expect(hollowTiffVerdict([])).toBeNull();
        expect(hollowTiffVerdict(undefined)).toBeNull();
    });
});

describe('§ADSDI-NDSM — the mosaic pre-check (refuse before a request)', () => {
    it('projects lon/lat to the mosaics’ EPSG:3857 metres (spherical Mercator, R = 6378137)', () => {
        const [x, y] = lonLatTo3857(54.3773, 24.4539);
        // independent: x = lon·π/180·R = 6053253.3; y = R·ln(tan(π/4 + lat·π/360)) = 2808816.2
        expect(x).toBeCloseTo(6053253.3, 0);
        expect(y).toBeCloseTo(2808816.2, 0);
    });
    it('the gate cell is inside BOTH mosaics; the offshore probe cell is outside (it answered a hollow TIFF live)', () => {
        expect(cellInsideMosaics(GATE_CELL)).toBe(true);
        expect(cellInsideMosaics(OFFSHORE_CELL)).toBe(false);
    });
    it('a cell inside the DSM rectangle but outside the DTM rectangle is refused too (a one-sided answer cannot be differenced)', () => {
        // DSM3 y-min 2,674,607 m (lat ≈ 23.37) vs DTM y-min 2,740,000 m (lat ≈ 23.90): a cell at lat 23.6 sees DSM only.
        expect(cellInsideMosaics([54.5, 23.60, 54.51, 23.61])).toBe(false);
    });
});

describe('§ADSDI-NDSM — DSM − DTM differencing is the CZ solver, reused', () => {
    const bbox: Bbox = [54.369, 24.448408, 54.381, 24.461592];
    const raster = (vals: number[]) => ({ width: 2, height: 2, values: Float32Array.from(vals), bboxNative: bbox.slice() });
    it('differences pixel for pixel and masks −9999 on either side', () => {
        const nd = ndsmDifference(raster([12.5, -9999, 4.4, 2.6]), raster([2.5, 2.6, -9999, 2.6]), { nodata: AD_ADSDI.nodata })!;
        expect(nd.values[0]).toBeCloseTo(10, 5);
        expect(Number.isNaN(nd.values[1])).toBe(true);
        expect(Number.isNaN(nd.values[2])).toBe(true);
        expect(nd.values[3]).toBe(0);
        expect(nd.masked).toBe(2);
    });
});

describe('§AD-CITY-BBOXES — the abudhabi row working set', () => {
    const bake = readFileSync(resolve(HERE, '../bake.mjs'), 'utf8');
    const row = bake.match(/\{\s*name:\s*'abudhabi'\s*,[^\n]*bbox:\s*'(-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)'/);
    const region: Bbox = [Number(row![1]), Number(row![2]), Number(row![3]), Number(row![4])];
    it('has unique cities and city-sized bboxes inside the bake.mjs abudhabi row AND inside both mosaics', () => {
        const names = AD_CITY_BBOXES.map((c) => c.city);
        expect(new Set(names).size).toBe(names.length);
        for (const { city, bbox } of AD_CITY_BBOXES) {
            const [w, s, e, n] = bbox;
            expect(e - w, `${city} lon span`).toBeGreaterThan(0.03); expect(e - w, `${city} lon span`).toBeLessThan(0.3);
            expect(n - s, `${city} lat span`).toBeGreaterThan(0.03); expect(n - s, `${city} lat span`).toBeLessThan(0.2);
            expect(w >= region[0] && s >= region[1] && e <= region[2] && n <= region[3], `${city} inside abudhabi row`).toBe(true);
            expect(cellInsideMosaics([w, s, w + 0.01, s + 0.01]), `${city} SW cell in mosaics`).toBe(true);
            expect(cellInsideMosaics([e - 0.01, n - 0.01, e, n]), `${city} NE cell in mosaics`).toBe(true);
        }
    });
    it('the CI spot-check point (Al Markaziyah) and the terrain.mjs probe point are inside `abudhabi-core`', () => {
        const [w, s, e, n] = AD_CITY_BBOXES.find((x) => x.city === 'abudhabi-core')!.bbox;
        expect(GATE_POINT.lon > w && GATE_POINT.lon < e && GATE_POINT.lat > s && GATE_POINT.lat < n).toBe(true);
        expect(54.37 > w && 54.37 < e && 24.47 > s && 24.47 < n).toBe(true);
    });
    it('the working set is small enough for the measured budget (≈ 55 s per populated cell): ≤ 120 cells', () => {
        const cells = AD_CITY_BBOXES.reduce((acc, { bbox: [w, s, e, n] }) => acc + Math.ceil((e - w) / 0.01) * Math.ceil((n - s) / 0.01), 0);
        expect(cells).toBeLessThanOrEqual(120);
    });
});
