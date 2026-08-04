// §SIPU-SHAPEFILE-CONTAINER — the reusable Canarian SIPU shapefile-pair parser (`.shp` + `.dbf`).
//
// WHAT THIS IS, AND WHY IT IS A SEPARATE FILE
// ─────────────────────────────────────────────────────────────────────────────────────────────
// Every Gobierno de Canarias SIPU package (`opendata.sitcan.es`, `format:SIPU`, 88 municipalities)
// ships its zoning FAMILIES (`EDIF`, `ZUSO`, `AMB`, …) as a real ESRI Shapefile triple — `.shp`
// (geometry) + `.dbf` (attribute table) + `.shx`/`.prj` — under a `02SIST/` folder, alongside an
// `.mdb` Access database carrying the SAME rows. `canariasSipuProvider.ts` / `esCanariasSipu.ts`
// consume the `.mdb` table shape (`SipuEdifRecord`) for Telde's EDIF (built-form) zones; THIS file
// is the OTHER half of the SIPU ingest surface — the geometry + zone-code layer, read from the
// shapefile pair directly, generically, for ANY SIPU family and ANY of the 88 municipalities, the
// same way `arcgisRest.ts` generalizes Sevilla's ArcGIS REST query rather than hand-inlining it.
//
// ⭐ VERIFIED AGAINST A REAL DOWNLOADED FIXTURE, NOT ASSUMED. El Sauzal's base PGO package
// (`221125-mmpgo-esa-usos-suelo-urbano-240702-240702-sipu.zip`) was downloaded and its
// `02SIST/ZUSO.dbf` header was parsed BYTE-BY-BYTE (dBase III/IV field-descriptor block, not a
// grep of the row content) this session. The REAL field list is exactly SEVEN columns:
//   ETIQUETA · CODIGO · ETIPLAN · TXTPLAN · OBS · PDF · CAPA
// Strings that LOOK like field names at a glance — `A10`, `A12`, `A17`, `A2_1` — are NOT header
// fields: they were found at byte offsets 34429/75739/520969/310088, far past the header (which
// ends at byte 257 for this file), sitting inside `ETIPLAN`/`TXTPLAN` DATA VALUES such as
// `"UF.A10"`, `"DO-A17"`, `"Zona CO-A2_1.Manzana 2.5.2"` — zone-code fragments the publisher wrote
// into the row content, not column headers. A grep-based field-name guess would have reported
// these as columns; the header-parse this file implements does not make that mistake.
//
// ⛔ SCOPE: ZONE CODE + GEOMETRY ONLY, NOTHING ELSE. `ZUSO.dbf`'s field list carries no height, no
// occupancy, no setback, no FAR — any building-parameter reading belongs to the `EDIF` family
// (`canariasSipuProvider.ts`), never to this one. This module does not assume such a field exists
// and does not look for one.
//
// PURITY: this file does ZERO I/O — it takes already-read `Buffer`s (from a file path or a fetched
// zip entry) and returns parsed records. The one impure step (reading the bytes off disk / network)
// is the CALLER's job, mirroring `arcgisRest.ts`'s fetch/parse split.
//
// Strategic context — canariasSipuProvider.ts, esCanariasSipu.ts, esTeldePgo2003.ts,
// containers/arcgisRest.ts (the sibling container this file's shape mirrors), C58 §1.1/§1.9.

// ══════════════════════════════════════════════════════════════════════════════════════════════
// DBF (dBase III/IV) — the attribute table half.
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** One field descriptor, read byte-for-byte from the DBF header — never guessed from row content. */
export interface DbfFieldDescriptor {
    /** Verbatim field name, up to 11 ASCII characters, as the publisher wrote it (e.g. `ETIQUETA`). */
    readonly name: string;
    /** The DBF type character (`C` character, `N` numeric, `F` float, `D` date, `L` logical, …). */
    readonly type: string;
    /** Field byte-length, from the descriptor's own `length` byte. */
    readonly length: number;
    /** Decimal-place count (meaningful for `N`/`F` fields only). */
    readonly decimals: number;
}

export interface DbfParseResult {
    /** dBase version byte (0x03 for dBase III w/o memo — Canarian SIPU tables measured at this). */
    readonly versionByte: number;
    readonly recordCount: number;
    readonly headerLength: number;
    readonly recordLength: number;
    /** The REAL header field list — this is the thing to trust, never a grep of the row bytes. */
    readonly fields: readonly DbfFieldDescriptor[];
    /** One object per row, keyed by the REAL field names, string values trimmed of pad bytes. */
    readonly rows: ReadonlyArray<Readonly<Record<string, string>>>;
}

/**
 * Parse a DBF (dBase III/IV) buffer's header + records using Node's `Buffer` API directly — no
 * dependency, because none of `shapefile`/`dbf`-family packages are installed in this monorepo
 * (checked: `pnpm-lock.yaml` carries neither this session).
 *
 * Layout (verified against the real `ZUSO.dbf` fixture, byte-for-byte):
 *   byte 0            version
 *   bytes 4-7   (LE)  record count
 *   bytes 8-9   (LE)  header length
 *   bytes 10-11 (LE)  record length
 *   byte 32...        field descriptor array, 32 bytes per field:
 *     bytes 0-10        field name, null-terminated ASCII (max 11 chars)
 *     byte 11           field type
 *     bytes 12-15       field data address (unused here)
 *     byte 16           field length
 *     byte 17           decimal count
 *   the descriptor array ends at the first `0x0D` terminator byte.
 *   Each RECORD is `recordLength` bytes: 1 deletion-flag byte, then each field's raw bytes in
 *   descriptor order (Canarian SIPU tables carry NO memo (`.dbt`) fields, so this reader does not
 *   special-case memo pointers).
 */
export function parseDbf(buf: Buffer): DbfParseResult {
    if (buf.length < 32) {
        throw new Error(`[sipu-shapefile] DBF buffer too short to hold a header (${buf.length} bytes)`);
    }
    const versionByte = buf.readUInt8(0);
    const recordCount = buf.readUInt32LE(4);
    const headerLength = buf.readUInt16LE(8);
    const recordLength = buf.readUInt16LE(10);

    const fields: DbfFieldDescriptor[] = [];
    let offset = 32;
    while (offset < headerLength - 1 && offset + 32 <= buf.length) {
        const first = buf[offset];
        if (first === undefined || first === 0x0d) break; // field-descriptor-array terminator
        const nameBytes = buf.subarray(offset, offset + 11);
        const nul = nameBytes.indexOf(0);
        const name = nameBytes.subarray(0, nul === -1 ? 11 : nul).toString('latin1');
        const type = String.fromCharCode(buf.readUInt8(offset + 11));
        const length = buf.readUInt8(offset + 16);
        const decimals = buf.readUInt8(offset + 17);
        fields.push({ name, type, length, decimals });
        offset += 32;
    }

    const rows: Array<Record<string, string>> = [];
    const dataStart = headerLength;
    for (let r = 0; r < recordCount; r++) {
        const recOffset = dataStart + r * recordLength;
        if (recOffset + recordLength > buf.length) break; // truncated buffer (e.g. a trimmed fixture)
        let fieldOffset = recOffset + 1; // skip the 1-byte deletion flag
        const row: Record<string, string> = {};
        for (const f of fields) {
            const raw = buf.subarray(fieldOffset, fieldOffset + f.length).toString('latin1');
            row[f.name] = raw.trim();
            fieldOffset += f.length;
        }
        rows.push(row);
    }

    return { versionByte, recordCount, headerLength, recordLength, fields, rows };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// SHP (ESRI Shapefile) — the geometry half. Polygon (shape type 5) only — the only type SIPU's
// zoning families (`EDIF`, `ZUSO`) publish; a differently-typed record is a typed refusal, never a
// silently-wrong coercion.
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** A single 2-D vertex in the shapefile's native projected CRS (metres — see the `.prj` sidecar). */
export interface ShpPoint {
    readonly x: number;
    readonly y: number;
}

/** One polygon record: a shape-type-5 record is one or more `parts` (rings), each a point ring. */
export interface ShpPolygonRecord {
    readonly recordNumber: number;
    /** Rings in shapefile part order — the FIRST is the outer ring by ESRI's own winding rule; any
     *  further rings may be holes or additional outer rings (multi-part polygons). This parser does
     *  not attempt hole/outer classification — that is a geometry-engine concern, out of scope for
     *  a container whose job is "hand back what the file says". */
    readonly parts: ReadonlyArray<readonly ShpPoint[]>;
}

const SHAPE_TYPE_NULL = 0;
const SHAPE_TYPE_POLYGON = 5;

/**
 * Parse an ESRI `.shp` polygon file. Shapefile layout (verified against the real `ZUSO.shp`
 * fixture): a 100-byte file header (big-endian file code at byte 0, shape type at byte 32 LE),
 * followed by variable-length records, each an 8-byte big-endian record header (record number,
 * content length in 16-bit words) then the shape content.
 *
 * A polygon record's content: shape type (LE int32) · bounding box (4 LE doubles) · numParts (LE
 * int32) · numPoints (LE int32) · part-start-index array (`numParts` LE int32s) · point array
 * (`numPoints` × 2 LE doubles, X then Y).
 *
 * ⚠ ONLY SHAPE TYPE 5 (Polygon) IS HANDLED. A record of any other type (including 0 / Null Shape,
 * which SIPU files do carry for a handful of deleted/empty rows) is SKIPPED, not coerced — a caller
 * that needs to know about a skipped record can compare `parseShpPolygons(...).length` against the
 * DBF's `recordCount`.
 */
export function parseShpPolygons(buf: Buffer): readonly ShpPolygonRecord[] {
    if (buf.length < 100) {
        throw new Error(`[sipu-shapefile] SHP buffer too short to hold a file header (${buf.length} bytes)`);
    }
    const fileCode = buf.readInt32BE(0);
    if (fileCode !== 9994) {
        throw new Error(`[sipu-shapefile] not an ESRI shapefile (file code ${fileCode}, expected 9994)`);
    }
    const fileLengthBytes = buf.readInt32BE(24) * 2; // stored as 16-bit-word count
    const headerShapeType = buf.readInt32LE(32);
    if (headerShapeType !== SHAPE_TYPE_POLYGON && headerShapeType !== SHAPE_TYPE_NULL) {
        // A non-polygon SIPU layer (points/lines) would need a different reader; refuse rather than
        // silently misinterpret its record bytes as polygon rings.
        throw new Error(
            `[sipu-shapefile] unsupported shapefile type ${headerShapeType} — only Polygon (5) is ` +
                'handled; SIPU zoning families (EDIF/ZUSO) are polygon layers, others are not.',
        );
    }

    const records: ShpPolygonRecord[] = [];
    const end = Math.min(buf.length, fileLengthBytes);
    let offset = 100;
    while (offset + 8 <= end) {
        const recordNumber = buf.readInt32BE(offset);
        const contentLengthBytes = buf.readInt32BE(offset + 4) * 2;
        const contentStart = offset + 8;
        const contentEnd = contentStart + contentLengthBytes;
        if (contentEnd > end) break; // truncated buffer (e.g. a trimmed fixture) — stop, don't guess

        const shapeType = buf.readInt32LE(contentStart);
        if (shapeType === SHAPE_TYPE_POLYGON) {
            const numParts = buf.readInt32LE(contentStart + 36);
            const numPoints = buf.readInt32LE(contentStart + 40);
            const partsStart = contentStart + 44;
            const partIndices: number[] = [];
            for (let p = 0; p < numParts; p++) {
                partIndices.push(buf.readInt32LE(partsStart + p * 4));
            }
            const pointsStart = partsStart + numParts * 4;
            const allPoints: ShpPoint[] = [];
            for (let i = 0; i < numPoints; i++) {
                const pOff = pointsStart + i * 16;
                allPoints.push({ x: buf.readDoubleLE(pOff), y: buf.readDoubleLE(pOff + 8) });
            }
            const parts: ShpPoint[][] = [];
            for (let p = 0; p < numParts; p++) {
                const start = partIndices[p]!;
                const stop = p + 1 < numParts ? partIndices[p + 1]! : numPoints;
                parts.push(allPoints.slice(start, stop));
            }
            records.push({ recordNumber, parts });
        }
        // SHAPE_TYPE_NULL (or anything else at the record level) is skipped, not coerced.
        offset = contentEnd;
    }
    return records;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE JOIN — one SIPU zoning feature = one DBF row + its same-index SHP polygon record.
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** One resolved SIPU zoning feature: a zone code + label read from the DBF, plus its geometry. */
export interface SipuZoneFeature {
    /** The zone-code field's value (default field name `ETIQUETA` — SIPU's own convention, shared
     *  by `EDIF` and `ZUSO` alike; override `zoneCodeField` if a family uses a different column). */
    readonly zoneCode: string | null;
    /** Every DBF column for this row, verbatim — callers needing a family-specific field (e.g.
     *  `ZUSO`'s `ETIPLAN`/`TXTPLAN`) read it from here rather than this module special-casing it. */
    readonly attributes: Readonly<Record<string, string>>;
    readonly polygon: ShpPolygonRecord;
}

export interface ParseSipuZoneLayerOptions {
    /** Which DBF column carries the zone code. Default `'ETIQUETA'` (SIPU's own convention). */
    readonly zoneCodeField?: string;
}

/**
 * Parse a SIPU shapefile PAIR (`.shp` + `.dbf` buffers from the SAME layer, e.g. `ZUSO.shp` /
 * `ZUSO.dbf`, or `EDIF.shp` / `EDIF.dbf`) into zone-code + geometry features.
 *
 * The join is BY RECORD INDEX — standard shapefile convention: the Nth DBF row describes the Nth
 * `.shp` record, in file order, no separate key. When the SHP parse skips a non-polygon record
 * (§`parseShpPolygons`), the corresponding DBF row is skipped too so the two arrays cannot drift out
 * of alignment silently.
 *
 * ⛔ NEVER READS A BUILDING PARAMETER. This function returns `zoneCode` + `attributes` +
 * `polygon` — nothing else. A caller wanting Telde's EDIF height/setback/coverage numbers uses
 * `canariasSipuProvider.ts`'s `readSipuZone` on the SAME row shape, not this module.
 */
export function parseSipuZoneLayer(
    shpBuf: Buffer,
    dbfBuf: Buffer,
    options: ParseSipuZoneLayerOptions = {},
): readonly SipuZoneFeature[] {
    const zoneCodeField = options.zoneCodeField ?? 'ETIQUETA';
    const dbf = parseDbf(dbfBuf);
    const polygons = parseShpPolygons(shpBuf);

    const features: SipuZoneFeature[] = [];
    const n = Math.min(dbf.rows.length, polygons.length);
    for (let i = 0; i < n; i++) {
        const row = dbf.rows[i]!;
        const polygon = polygons[i]!;
        const rawCode = row[zoneCodeField];
        const zoneCode = rawCode !== undefined && rawCode.trim() !== '' ? rawCode.trim() : null;
        features.push({ zoneCode, attributes: row, polygon });
    }
    return features;
}
