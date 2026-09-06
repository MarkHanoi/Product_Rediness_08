// §ES-CATASTRO-FOOTPRINTS (L-12939, 2026-09-05, lane ES-CATASTRO-FOOTPRINTS) — the Spanish
// official-footprint adapter's DECISIONS, unit-tested against a fixture trimmed from the REAL
// Córdoba feed (`A.ES.SDGC.BU.14900.*.gml`, downloaded 2026-09-05).
//
// WHAT EACH TEST PINS, and why it earned a test rather than a comment:
//
//  • **NIL ≠ 0.** Every Catastro Building carries `numberOfFloorsAboveGround xsi:nil="true"`.
//    Reading that as 0 would flatten all of Spain to ground level while the pipeline reported
//    full coverage — the §CONTEXT-DATA-HONESTY failure-vs-empty collapse, at national scale.
//    `parseNillableInt` must return null, and the Building's floors must then be DERIVED.
//  • **floors 0 IS a value.** The founder's parcel has a 26.7 m² patio at 0 storeys. It must
//    survive as 0 (emitted, 0 m, not extruded), never as "unknown", never defaulted to 9 m.
//    This is the one place where UNKNOWN and ZERO are both legal and mean different things.
//  • **max-of-parts is PER REFCAT** and is labelled `max-of-parts`, never `register` — a derived
//    number presented as a register field is the C58 §1.4 defect.
//  • **The reprojection lands on the real house.** EPSG:25830 → WGS84 must put refcat
//    1950501UG4915S in Arroyo del Moro, Córdoba (≈ -4.796, 37.888), not 400 km away in the
//    adjacent UTM zone. A wrong zone still produces a plausible-looking footprint, so only a
//    coordinate assertion catches it.
//  • **No `height` tag is written.** `floors × 3.0` is a derivation; the client reads a `height`
//    tag as provenance `tagged` ("surveyed-ish"). Writing it there would launder the derivation
//    into a survey. The metres travel under `pryzm:height_floors_m` with `pryzm:height_kind`.
//  • **official-wins drops only COVERED footprints**, and only against OUTLINES. Blanket-dropping
//    OSM under a `footprintSource` row would erase the Basque Country and Navarra — which run
//    foral cadastres and publish no ES.SDGC feed — from the map entirely.
//  • **The real ZIP container parses.** `readZipCentralDirectory` + `zipEntryStream` are
//    hand-rolled (no unzip dependency; this lane may not edit package.json), so the test builds a
//    real DEFLATE zip and reads it back rather than trusting the byte offsets by inspection.
//  • **The default bake path is untouched** — `footprintMergeMode` returns 'osm' for a region
//    with no `footprintSource`, which is the claim most likely to rot silently.
//
// LAYERING: a build/inspection tool test, like its siblings — no OTel span (P8 applies to
// exported package functions, not bake tooling).
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { deflateRawSync, crc32 } from 'node:zlib';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';

import {
    bboxesIntersect,
    buildingFloorsFromParts,
    mapCatastroUse,
    parseAtomEntries,
    parseCatastroMember,
    parseCrsFromCategory,
    parseGeorssPolygonBbox,
    parseMunicipalityTitle,
    parseMunicipalityZip,
    parseNillableInt,
    parsePosList,
    readZipCentralDirectory,
    streamFeatureMembers,
    wfsParcelPartsUrl,
} from '../footprints/esCatastro.mjs';
import {
    HEIGHT_KIND_FLOORS,
    OFFICIAL_METRES_PER_FLOOR,
    OFFICIAL_TAGS,
    buildOfficialOutlineIndex,
    formatOfficialMergeLine,
    officialFootprintProps,
    osmFootprintIsCovered,
    pointInRing,
    ringCentroid,
} from '../footprints/officialFootprints.mjs';
import { assertFootprintConfig, ES_CATASTRO_FOOTPRINTS, FOOTPRINT_MERGE_MODE } from '../footprints/footprintMerge.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BUILDING_GML = readFileSync(resolve(HERE, 'fixtures/esCatastro-building.gml'), 'utf8');
const PART_GML = readFileSync(resolve(HERE, 'fixtures/esCatastro-buildingpart.gml'), 'utf8');

/** The founder's parcel — CL Isla Lanzarote 4, Arroyo del Moro, Córdoba. */
const REFCAT = '1950501UG4915S';

// ── a real DEFLATE zip, built in-test, so the hand-rolled container reader is EXERCISED ──
function buildZip(entries: { name: string; text: string }[]): string {
    const locals: Buffer[] = [];
    const centrals: Buffer[] = [];
    let offset = 0;
    for (const e of entries) {
        const raw = Buffer.from(e.text, 'latin1');
        const comp = deflateRawSync(raw);
        const crc = crc32(raw);
        const name = Buffer.from(e.name, 'latin1');
        const lh = Buffer.alloc(30);
        lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6);
        lh.writeUInt16LE(8, 8); lh.writeUInt32LE(0, 10); lh.writeUInt32LE(crc, 14);
        lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(raw.length, 22);
        lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
        locals.push(lh, name, comp);
        const ch = Buffer.alloc(46);
        ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
        ch.writeUInt16LE(0, 8); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(crc, 16);
        ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(raw.length, 24);
        ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(offset, 42);
        centrals.push(ch, name);
        offset += 30 + name.length + comp.length;
    }
    const cd = Buffer.concat(centrals);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
    eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
    const path = resolve(mkdtempSync(resolve(tmpdir(), 'pryzm-catastro-')), 'BU.14900.zip');
    writeFileSync(path, Buffer.concat([...locals, cd, eocd]));
    return path;
}

async function membersOf(gml: string): Promise<string[]> {
    const out: string[] = [];
    await streamFeatureMembers(Readable.from([Buffer.from(gml, 'latin1')]), (m) => out.push(m));
    return out;
}

describe('esCatastro · ATOM discovery', () => {
    it('reads a georss polygon as lat/lon and returns [w,s,e,n]', () => {
        // The REAL Córdoba municipality bbox from ES.SDGC.bu.atom_14.xml (2026-09-05).
        const bbox = parseGeorssPolygonBbox(
            '37.6700352611207 -4.9880416869088 37.6700352611207 -4.35880929733449 '
            + '38.0271962710839 -4.35880929733449 38.0271962710839 -4.9880416869088 '
            + '37.6700352611207 -4.9880416869088',
        );
        expect(bbox).not.toBeNull();
        const [w, s, e, n] = bbox as number[];
        // Córdoba is at ~37.9 N, 4.8 W — longitudes NEGATIVE, latitudes ~37–38. A lon/lat swap
        // would put w ≈ 37.67, which is in Turkey.
        expect(w).toBeCloseTo(-4.988, 3);
        expect(e).toBeCloseTo(-4.3588, 3);
        expect(s).toBeCloseTo(37.670, 3);
        expect(n).toBeCloseTo(38.027, 3);
        // …and it must contain the founder's own parcel.
        expect(bboxesIntersect(bbox as number[], [-4.80, 37.885, -4.79, 37.892])).toBe(true);
    });

    it('parses the municipality entry: title, ZIP href, and the PER-MUNICIPALITY EPSG', () => {
        // Verbatim from the live ES.SDGC.bu.atom_14.xml entry for 14900-CORDOBA.
        const entry = `<feed><entry>
      <title> 14900-CORDOBA buildings</title>
      <link rel="enclosure" href="https://www.catastro.hacienda.gob.es/INSPIRE/Buildings/14/14900-CORDOBA/A.ES.SDGC.BU.14900.zip" type="application/atom+xml" hreflang="en" />
      <georss:polygon>37.6700352611207 -4.9880416869088 37.6700352611207 -4.35880929733449 38.0271962710839 -4.35880929733449 38.0271962710839 -4.9880416869088 37.6700352611207 -4.9880416869088</georss:polygon>
      <category term="http://www.opengis.net/def/crs/EPSG/0/25830"  label="ETRS89"/>
    </entry></feed>`;
        const [e] = parseAtomEntries(entry);
        expect(e.href).toBe('https://www.catastro.hacienda.gob.es/INSPIRE/Buildings/14/14900-CORDOBA/A.ES.SDGC.BU.14900.zip');
        // Spain spans EPSG:25829/25830/25831 and the ZONE IS DECLARED PER MUNICIPALITY. Reading it
        // from the feed is why no province→zone table exists anywhere in this adapter.
        expect(e.epsg).toBe('EPSG:25830');
        expect(parseMunicipalityTitle(e.title)).toEqual({ code: '14900', name: 'CORDOBA' });
    });

    it('normalises the province feed href from http:// (which answers 302) to https://', () => {
        // Verbatim from the live root ES.SDGC.BU.atom.xml, Córdoba entry.
        const entry = '<feed><entry><title>Territorial office 14</title>'
            + '<link rel="enclosure" href="http://www.catastro.hacienda.gob.es/INSPIRE/buildings/14/ES.SDGC.bu.atom_14.xml" type="application/atom+xml" />'
            + '<georss:polygon> 37.184 -5.586 37.184 -4.001 38.729 -4.001 38.729 -5.586 37.184 -5.586</georss:polygon>'
            + '</entry></feed>';
        expect(parseAtomEntries(entry)[0].href).toMatch(/^https:\/\//);
    });

    it('returns null for a missing CRS category — the caller must REFUSE, never guess a zone', () => {
        expect(parseCrsFromCategory('<entry><title>x</title></entry>')).toBeNull();
    });
});

describe('esCatastro · GML parsing', () => {
    it('parses NIL as null, not 0 — the Building floor count is genuinely absent', async () => {
        const [building] = await membersOf(BUILDING_GML);
        expect(building).toContain(REFCAT);
        expect(parseNillableInt(building, 'numberOfFloorsAboveGround')).toBeNull();
        const rec = parseCatastroMember(building);
        expect(rec?.part).toBe(false);
        expect(rec?.floors).toBeNull();
        // …while the register fields that ARE populated come through intact.
        expect(rec?.built).toBe(2020);
        expect(rec?.condition).toBe('functional');
        expect(rec?.use).toBe('residential');
    });

    it('parses a BuildingPart floor count of 0 as the REAL VALUE 0, never as unknown', async () => {
        const members = await membersOf(PART_GML);
        const patio = members.find((m) => m.includes(`${REFCAT}_part1`))!;
        const rec = parseCatastroMember(patio);
        expect(rec?.part).toBe(true);
        expect(rec?.ref).toBe(REFCAT);           // the `_partN` suffix is stripped, never emitted
        expect(rec?.floors).toBe(0);             // ← the patio. 0 is a measurement here.
        expect(rec?.floors).not.toBeNull();
    });

    it('parses floorsBelow independently of floorsAbove', async () => {
        const members = await membersOf(PART_GML);
        const tall = members.find((m) => m.includes(`${REFCAT}_part3`))!;
        const rec = parseCatastroMember(tall);
        expect(rec?.floors).toBe(3);
        expect(rec?.floorsBelow).toBe(1);
    });

    it('splits members without holding the document, and refuses a non-Catastro stream', async () => {
        expect((await membersOf(PART_GML)).length).toBe(3);
        await expect(
            streamFeatureMembers(Readable.from([Buffer.alloc(65 << 20, 0x20)]), () => {}),
        ).rejects.toThrow(/no <\/gml:featureMember> in 64 MB/);
    });

    it('takes the EXTERIOR ring (the first posList) and rejects a degenerate one', () => {
        const pts = parsePosList('<gml:posList srsDimension="2" count="5"> 1 2 3 4 5 6 1 2</gml:posList>');
        expect(pts).toEqual([[1, 2], [3, 4], [5, 6], [1, 2]]);
        expect(parsePosList('<gml:posList> 1 2</gml:posList>')).toBeNull();
    });

    it('maps the Catastro use codes and never invents one', () => {
        expect(mapCatastroUse('1_residential')).toBe('residential');
        expect(mapCatastroUse('3_industrial')).toBe('industrial');
        expect(mapCatastroUse('99_unheard_of')).toBe('yes');  // honest generic, not a guess
        expect(mapCatastroUse(null)).toBeNull();
    });
});

describe('esCatastro · floors derivation', () => {
    it('derives the building floor count as max-of-parts', () => {
        expect(buildingFloorsFromParts([0, 2, 3, 2])).toBe(3);   // the founder's real parcel
    });

    it('returns null (never 0) when NO parts are held — absent ≠ zero storeys', () => {
        expect(buildingFloorsFromParts([])).toBeNull();
        expect(buildingFloorsFromParts([null, undefined] as unknown as number[])).toBeNull();
    });

    it('returns 0 when every part really is 0 — a pure-patio parcel is a real answer', () => {
        expect(buildingFloorsFromParts([0, 0])).toBe(0);
    });
});

describe('esCatastro · full ZIP → Features (the real container reader)', () => {
    const zip = buildZip([
        { name: 'A.ES.SDGC.BU.14900.building.gml', text: BUILDING_GML },
        { name: 'A.ES.SDGC.BU.14900.buildingpart.gml', text: PART_GML },
        { name: 'A.ES.SDGC.BU.MD.14900.xml', text: '<md/>' },
    ]);

    it('reads the central directory and finds both GML entries', () => {
        const entries = readZipCentralDirectory(zip);
        expect(entries.map((e) => e.name)).toEqual([
            'A.ES.SDGC.BU.14900.building.gml',
            'A.ES.SDGC.BU.14900.buildingpart.gml',
            'A.ES.SDGC.BU.MD.14900.xml',
        ]);
        expect(entries[0].method).toBe(8);   // DEFLATE — the real feed's method
    });

    it('emits one Feature per part AND per building, reprojected onto the real house', async () => {
        const feats: Record<string, unknown>[] = [];
        const stats = await parseMunicipalityZip(zip, 'EPSG:25830', (f) => feats.push(f));
        expect(stats.parts).toBe(3);
        expect(stats.buildings).toBe(2);

        const props = (f: Record<string, unknown>) => f.properties as Record<string, unknown>;
        const mine = feats.filter((f) => props(f)[OFFICIAL_TAGS.ref] === REFCAT);
        expect(mine.length).toBe(3);  // 2 parts + 1 outline

        // ── the reprojection landed in Arroyo del Moro, Córdoba ──
        const outline = mine.find((f) => props(f)[OFFICIAL_TAGS.part] === 'false')!;
        const ring = (outline.geometry as { coordinates: number[][][] }).coordinates[0];
        // Arroyo del Moro, Córdoba. Computed from the fixture's REAL ETRS89/UTM30N easting+northing
        // (341926.454, 4194877.609). ⚠ Reading the same numbers as UTM31N — the adjacent Spanish
        // zone, and the one Barcelona uses — yields lon **+1.2024**, i.e. a point in the
        // Mediterranean ~440 km east, at a latitude that still looks Spanish. That is why the zone
        // is read per-municipality from the ATOM `<category>` and never assumed.
        expect(ring[0][0]).toBeCloseTo(-4.7976256, 5);
        expect(ring[0][1]).toBeCloseTo(37.8876933, 5);
        expect(ring[0]).toEqual(ring[ring.length - 1]);  // closed

        // ── the outline's floors are DERIVED (max of 0 and 3), and SAID to be ──
        expect(props(outline)['building:levels']).toBe(3);
        expect(props(outline)[OFFICIAL_TAGS.floorsKind]).toBe('max-of-parts');
        expect(props(outline)[OFFICIAL_TAGS.built]).toBe(2020);
        expect(props(outline)[OFFICIAL_TAGS.condition]).toBe('functional');
        expect(props(outline).building).toBe('residential');
        expect(props(outline)[OFFICIAL_TAGS.source]).toBe('es_catastro');

        // ── the patio survives at 0 floors, 0 m, and IS a part ──
        const patio = mine.find((f) => props(f)['building:part'] === 'yes'
            && props(f)[OFFICIAL_TAGS.heightM] === 0)!;
        expect(patio).toBeDefined();
        expect(props(patio)['building:levels']).toBeUndefined();  // 0 is not a levels tag…
        expect(props(patio)[OFFICIAL_TAGS.heightM]).toBe(0);      // …but it IS an explicit 0 m
        expect(props(patio)[OFFICIAL_TAGS.heightKind]).toBe(HEIGHT_KIND_FLOORS);

        // ── the 3-storey part reads its OWN floors, not the building's ──
        const tall = mine.find((f) => props(f)['building:levels'] === 3
            && props(f)[OFFICIAL_TAGS.part] === 'true')!;
        expect(tall).toBeDefined();
        expect(props(tall)[OFFICIAL_TAGS.floorsKind]).toBe('register');
        expect(props(tall)['building:levels:underground']).toBe(1);

        // ── max-of-parts is PER REFCAT: the 2-storey neighbour did not inherit 3 ──
        const neighbour = feats.find((f) => props(f)[OFFICIAL_TAGS.ref] === '9999901UG4915S'
            && props(f)[OFFICIAL_TAGS.part] === 'false')!;
        expect(props(neighbour)['building:levels']).toBe(2);
        expect(props(neighbour).building).toBe('industrial');
    });

    it('honours a bbox filter without changing what it emits inside it', async () => {
        const inside: unknown[] = [];
        // A box around the founder's parcel only — it excludes the synthetic neighbour to its east.
        await parseMunicipalityZip(zip, 'EPSG:25830', (f) => inside.push(f), { bbox: [-4.7977, 37.8876, -4.7974, 37.8879] });
        const all: unknown[] = [];
        await parseMunicipalityZip(zip, 'EPSG:25830', (f) => all.push(f));
        expect(inside.length).toBeGreaterThan(0);
        expect(inside.length).toBeLessThan(all.length);
    });

    it('REFUSES an unregistered CRS rather than guessing a zone', async () => {
        await expect(parseMunicipalityZip(zip, 'EPSG:99999', () => {}))
            .rejects.toThrow(/no proj4 def registered/);
    });
});

describe('officialFootprints · the tag contract', () => {
    const rec = {
        source: 'es_catastro', ref: REFCAT, part: false, floors: 3, floorsBelow: 1,
        floorsKind: 'max-of-parts', use: 'residential', built: 2020, condition: 'functional',
    };

    it('NEVER writes a `height` tag — a floors derivation must not read as a survey', () => {
        const p = officialFootprintProps(rec);
        // contextBuildings.ts resolveHeightWithProvenance reads `height` as provenance `tagged`.
        expect(p.height).toBeUndefined();
        expect(p['building:height']).toBeUndefined();
        // The derived metres travel labelled, under their own key.
        expect(p[OFFICIAL_TAGS.heightM]).toBe(9);   // 3 × 3.0
        expect(p[OFFICIAL_TAGS.heightKind]).toBe(HEIGHT_KIND_FLOORS);
        expect(HEIGHT_KIND_FLOORS).toBe('floors×3.0');
        expect(OFFICIAL_METRES_PER_FLOOR).toBe(3.0);
    });

    it('writes the layer-defining tag the tile reader requires — `building` on outlines, `building:part` on parts', () => {
        // contextTiles.ts LAYER_DEFINING_TAGS.buildings = ['building', 'building:part']; a feature
        // with neither is DROPPED by belongsToLayer, silently.
        expect(officialFootprintProps(rec).building).toBe('residential');
        expect(officialFootprintProps(rec)['building:part']).toBeUndefined();
        const part = officialFootprintProps({ ...rec, part: true, use: null });
        expect(part['building:part']).toBe('yes');
        expect(part.building).toBeUndefined();
        expect(part[OFFICIAL_TAGS.part]).toBe('true');
    });

    it('omits a floor count it does not have, rather than writing 0', () => {
        const p = officialFootprintProps({ ...rec, floors: null, floorsBelow: null });
        expect(p['building:levels']).toBeUndefined();
        expect(p[OFFICIAL_TAGS.heightM]).toBeUndefined();
        expect(p[OFFICIAL_TAGS.heightKind]).toBeUndefined();
    });
});

describe('official-wins merge', () => {
    const outline = {
        type: 'Feature',
        properties: officialFootprintProps({
            source: 'es_catastro', ref: REFCAT, part: false, floors: 3, floorsBelow: 0,
            floorsKind: 'max-of-parts', use: 'residential', built: 2020, condition: 'functional',
        }),
        geometry: { type: 'Polygon', coordinates: [[[-4.797, 37.888], [-4.796, 37.888], [-4.796, 37.889], [-4.797, 37.889], [-4.797, 37.888]]] },
    };
    const index = buildOfficialOutlineIndex([outline]);

    const osmAt = (lon: number, lat: number) => ({
        type: 'Feature',
        properties: { building: 'yes' },
        geometry: { type: 'Polygon', coordinates: [[[lon, lat], [lon + 0.0001, lat], [lon + 0.0001, lat + 0.0001], [lon, lat + 0.0001], [lon, lat]]] },
    });

    it('drops an OSM footprint whose centroid falls inside an official outline', () => {
        expect(osmFootprintIsCovered(osmAt(-4.7965, 37.8885), index)).toBe(true);
    });

    it('KEEPS an OSM footprint outside official coverage — a register\'s silence is not "nothing here"', () => {
        // The Basque Country and Navarra run foral cadastres and publish NO ES.SDGC feed. Blanket-
        // dropping OSM under a footprintSource row would erase Bilbao from the map.
        expect(osmFootprintIsCovered(osmAt(-2.935, 43.263), index)).toBe(false);  // Bilbao
        expect(osmFootprintIsCovered(osmAt(-4.790, 37.888), index)).toBe(false);  // next street over
    });

    it('is centroid-based and index-consistent', () => {
        const ring = outline.geometry.coordinates[0];
        expect(ringCentroid(ring)).not.toBeNull();
        expect(pointInRing([-4.7965, 37.8885], ring)).toBe(true);
        expect(pointInRing([-4.7900, 37.8885], ring)).toBe(false);
        expect(index.indexed).toBe(1);
    });

    it('formats the log line with counts SEPARATED BY SOURCE', () => {
        expect(formatOfficialMergeLine('spain', 'es_catastro', { parts: 4, buildings: 1, osmKept: 7, osmDropped: 2 }))
            .toBe('▶ official footprints · spain: es_catastro — 4 official part(s) of 1 building(s) '
                + '+ 7 OSM-only (dropped 2 OSM footprint(s) covered by an official outline)');
    });
});

describe('bake wiring', () => {
    // ⚠ THIS LANE'S ORIGINAL MERGE WAS DELETED, DELIBERATELY. It shipped an ES-specific
    // `official-wins` merge with its own centroid-in-outline index; on wiring it into bake.mjs the
    // France lane (L-12940) turned out to have already landed `mergeReplaceInBbox` in the working
    // tree, doing the same job with better-argued semantics. Two rival merges for "national
    // footprints beat OSM" is how one later reads as the fix for the other. There is ONE merge,
    // in frBdtopo.mjs, and both countries call it — these tests pin the shared contract.

    it('leaves a region with NO footprintSource untouched — the default bake path is unchanged', () => {
        expect(assertFootprintConfig([{ name: 'koln', heightJoin: 'lod2nrw' }])).toEqual([]);
        expect(assertFootprintConfig([{ name: 'barcelona' }])).toEqual([]);
    });

    it('accepts the wired spain row on the SAME merge mode france uses', () => {
        expect(FOOTPRINT_MERGE_MODE).toBe('replace-in-bbox');
        expect(assertFootprintConfig([{
            name: 'spain', footprintSource: 'es_catastro', footprintMerge: 'replace-in-bbox',
            footprintBboxes: ['-4.85,37.83,-4.72,37.94'],
        }])).toEqual([]);
    });

    it('REFUSES an unknown source, a wrong merge mode, and an unbounded working set', () => {
        // Each must fail bake's cheap `--check` step rather than at hour four of a 330-minute job.
        expect(assertFootprintConfig([{ name: 'x', footprintSource: 'nope', footprintMerge: 'replace-in-bbox', footprintBboxes: ['1,2,3,4'] }]))
            .toEqual([expect.stringContaining('is not one of')]);
        // A plain `replace` deletes every municipality outside the working set — for Spain that is
        // the whole Basque Country and Navarra, which Catastro does not publish at all.
        expect(assertFootprintConfig([{ name: 'spain', footprintSource: 'es_catastro', footprintMerge: 'replace', footprintBboxes: ['1,2,3,4'] }]))
            .toEqual([expect.stringContaining("only 'replace-in-bbox' is supported")]);
        expect(assertFootprintConfig([{ name: 'spain', footprintSource: 'es_catastro', footprintMerge: 'replace-in-bbox', footprintBboxes: [] }]))
            .toEqual([expect.stringContaining('working set is EMPTY')]);
    });

    it('declares Spain OPT-IN, so a bulk ZIP pull is never added to a bake unasked', () => {
        // MEASURED: Córdoba alone is 22.9 MB of ZIP → 597 MB of GML → ~250 s, so the nine-city
        // working set is ~40–70 min on top of a job that already runs to a 330-minute ceiling.
        // France's WFS pages and carries no flag, so its behaviour is unchanged by this lane.
        expect(ES_CATASTRO_FOOTPRINTS.optIn).toBe('footprints');
        expect(ES_CATASTRO_FOOTPRINTS.label).toContain('Catastro');
        expect(ES_CATASTRO_FOOTPRINTS.attribution).toContain('Catastro');
        expect(typeof ES_CATASTRO_FOOTPRINTS.write).toBe('function');
    });
});

describe('esCatastro · the live single-parcel WFS door', () => {
    it('builds the stored query that EXISTS (GetBuildingPartByParcel) at version=2', () => {
        const url = wfsParcelPartsUrl(REFCAT);
        // ⚠ `version=2.0.0` answers HTTP 400 with an HTML page reading "No se puede procesar su
        // petición." — and `GetBuildingPartByRefcat` answers an OWS exception, "Request parameter
        // ... not exists". Both were probed 2026-09-05; both are pinned here so a plausible-looking
        // "correction" to either token has to argue with a test.
        expect(url).toContain('version=2&');
        expect(url).not.toContain('version=2.0.0');
        expect(url).toContain('STOREDQUERIE_ID=GetBuildingPartByParcel');
        expect(url).toContain(`refcat=${REFCAT}`);
    });
});
