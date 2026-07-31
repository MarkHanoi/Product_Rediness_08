/**
 * PURE PARSERS + EVIDENCE MODEL for the Murcia parcel probe. No I/O.
 *
 * ── THE THREE STATES ─────────────────────────────────────────────────────────
 * Every field this probe reports carries one of exactly three states. Two is not
 * enough, and a permissive default is never acceptable (L-616):
 *
 *   VERIFIED            — read from a live upstream response or a primary document
 *   ASSERTED-UNVERIFIED — stated by a source we have not independently confirmed
 *   UNKNOWN             — we do not know. NOT zero, NOT a default, NOT "no limit".
 *
 * `UNKNOWN` must never be silently coerced into a number downstream. That is
 * exactly the L-616 failure: an unknown setback drawn as zero, and a FAR ceiling
 * ignored, produced a massing ~5× over the legal envelope.
 */

export type EvidenceState = 'VERIFIED' | 'ASSERTED-UNVERIFIED' | 'UNKNOWN';

export interface Evidenced<T> {
    readonly state: EvidenceState;
    /** Null whenever state is UNKNOWN. Never a placeholder number. */
    readonly value: T | null;
    /** URL, document + article, or the upstream field this came from. */
    readonly source: string | null;
    /** ISO date the evidence was observed. */
    readonly observedAt: string | null;
    readonly note?: string;
}

export function verified<T>(value: T, source: string, observedAt: string, note?: string): Evidenced<T> {
    return { state: 'VERIFIED', value, source, observedAt, note };
}
export function asserted<T>(value: T, source: string, observedAt: string, note?: string): Evidenced<T> {
    return { state: 'ASSERTED-UNVERIFIED', value, source, observedAt, note };
}
export function unknown<T>(note: string): Evidenced<T> {
    return { state: 'UNKNOWN', value: null, source: null, observedAt: null, note };
}

// ── Geometry ─────────────────────────────────────────────────────────────────

export interface LatLon {
    readonly lat: number;
    readonly lon: number;
}

/**
 * Planar area (m²) of a small WGS84 ring via a local equirectangular projection.
 * Byte-for-byte the same method as `ringAreaM2` in `server/parcelZoningProxy.js`,
 * so the probe's DERIVED area and production's can never disagree.
 */
export function ringAreaM2(ring: readonly LatLon[]): number {
    if (ring.length < 3) return 0;
    const R = 6_378_137;
    const d2r = Math.PI / 180;
    const first = ring[0];
    if (!first) return 0;
    const cos0 = Math.cos(first.lat * d2r);
    const xz = ring.map((p) => ({ x: p.lon * d2r * R * cos0, z: p.lat * d2r * R }));
    let a = 0;
    for (let i = 0; i < xz.length; i++) {
        const p = xz[i];
        const q = xz[(i + 1) % xz.length];
        if (!p || !q) continue;
        a += p.x * q.z - q.x * p.z;
    }
    return Math.abs(a / 2);
}

/** Great-circle-ish distance (m) between two WGS84 points, good at parcel scale. */
export function distanceM(a: LatLon, b: LatLon): number {
    const R = 6_378_137;
    const d2r = Math.PI / 180;
    const dLat = (b.lat - a.lat) * d2r;
    const dLon = (b.lon - a.lon) * d2r * Math.cos(((a.lat + b.lat) / 2) * d2r);
    return Math.hypot(dLat, dLon) * R;
}

/** Ray-casting point-in-ring, mirroring `pointInRing` in the production proxy. */
export function pointInRing(p: LatLon, ring: readonly LatLon[]): boolean {
    if (ring.length < 3) return false;
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i];
        const b = ring[j];
        if (!a || !b) continue;
        const intersect =
            a.lat > p.lat !== b.lat > p.lat &&
            p.lon < ((b.lon - a.lon) * (p.lat - a.lat)) / (b.lat - a.lat || 1e-12) + a.lon;
        if (intersect) inside = !inside;
    }
    return inside;
}

// ── OVC reverse geocode ──────────────────────────────────────────────────────

export interface ReverseCandidate {
    readonly refcat: string;
    readonly address: string | null;
    /** OVC `<dis>` — metres from the query point to that parcel. 0 means "the point is on it". */
    readonly distanceM: number;
    /** INE province code from `<cp>` (e.g. 30 = Murcia). */
    readonly provinceCode: string | null;
    /** INE municipality code WITHIN the province from `<cm>` (30 = Murcia city ⇒ INE 30030). */
    readonly municipalityCode: string | null;
}

/**
 * Parse `Consulta_RCCOOR_Distancia` XML into nearest-first candidates.
 * The refcat is the concatenation `<pc1><pc2>` (7 + 7 chars = the 14-char parcel
 * reference; the full 20-char reference adds the 4-char property + 2 control chars,
 * which this endpoint does not return for the parcel itself).
 */
export function parseReverseGeocode(xml: string): ReverseCandidate[] {
    if (typeof xml !== 'string' || xml.length === 0) return [];
    const out: ReverseCandidate[] = [];
    const blocks = xml.match(/<pcd\b[\s\S]*?<\/pcd>/gi) ?? [];
    for (const block of blocks) {
        const pc1 = (block.match(/<pc1\b[^>]*>\s*([^<]*?)\s*<\/pc1>/i) ?? [])[1];
        const pc2 = (block.match(/<pc2\b[^>]*>\s*([^<]*?)\s*<\/pc2>/i) ?? [])[1];
        if (!pc1 || !pc2) continue;
        const ldt = (block.match(/<ldt\b[^>]*>\s*([^<]*?)\s*<\/ldt>/i) ?? [])[1];
        const dis = (block.match(/<dis\b[^>]*>\s*([^<]*?)\s*<\/dis>/i) ?? [])[1];
        const cp = (block.match(/<cp\b[^>]*>\s*([^<]*?)\s*<\/cp>/i) ?? [])[1];
        const cm = (block.match(/<cm\b[^>]*>\s*([^<]*?)\s*<\/cm>/i) ?? [])[1];
        const d = dis != null ? Number.parseFloat(dis) : Number.NaN;
        out.push({
            refcat: `${pc1.trim()}${pc2.trim()}`,
            address: ldt && ldt.trim().length > 0 ? ldt.trim() : null,
            distanceM: Number.isFinite(d) ? d : Number.POSITIVE_INFINITY,
            provinceCode: cp ? cp.trim() : null,
            municipalityCode: cm ? cm.trim() : null,
        });
    }
    return out.sort((a, b) => a.distanceM - b.distanceM);
}

/**
 * Compose the 5-digit INE municipality code from OVC's `<cp>` + `<cm>`.
 * ⚠ `<cm>` is the municipality index WITHIN the province, so the INE code is
 * `cp` zero-padded to 2 + `cm` zero-padded to 3. Murcia = 30 + 030 = `30030`.
 * Returns null rather than guessing when either part is missing.
 */
export function ineMunicipalityCode(c: ReverseCandidate): string | null {
    if (!c.provinceCode || !c.municipalityCode) return null;
    const p = c.provinceCode.padStart(2, '0');
    const m = c.municipalityCode.padStart(3, '0');
    if (!/^\d{2}$/.test(p) || !/^\d{3}$/.test(m)) return null;
    return `${p}${m}`;
}

// ── INSPIRE CP parcel ────────────────────────────────────────────────────────

export interface ParcelGeometry {
    readonly refcat: string | null;
    readonly ring: LatLon[];
    /**
     * The OFFICIAL registry area (INSPIRE `cp:areaValue`). Null when the source does
     * not publish it — an honest Unknown, never a derived number wearing an
     * official label (C57 §2.1 / L-640).
     */
    readonly areaOfficialM2: number | null;
    /** OUR shoelace area. Reported SEPARATELY so the two can be cross-checked. */
    readonly areaDerivedM2: number;
    /** `cp:referencePoint` — Catastro's own point for the parcel. */
    readonly referencePoint: LatLon | null;
    /** `cp:beginLifespanVersion` — when this cadastral version took effect. */
    readonly beginLifespanVersion: string | null;
    /** `cp:label` — the parcel's number within its cadastral zone. */
    readonly label: string | null;
    /** srsName echoed by the service, so a silent axis-order change is visible. */
    readonly srsName: string | null;
}

/**
 * Parse an INSPIRE `GetParcel` GML 3.2.1 document.
 * ⚠ AXIS ORDER: when srsName is EPSG:4326 the OGC axis order is **lat lon**, so
 * `posList` values pair as (lat, lon). This is the opposite of GeoJSON. Getting it
 * wrong silently relocates a Murcia parcel into the Atlantic.
 */
export function parseParcelGml(gml: string): ParcelGeometry | null {
    if (typeof gml !== 'string' || gml.length === 0) return null;
    const posMatch = gml.match(/<(?:[\w.-]+:)?posList\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?posList>/i);
    if (!posMatch || !posMatch[1]) return null;
    const nums = posMatch[1]
        .trim()
        .split(/\s+/)
        .map((s) => Number.parseFloat(s))
        .filter((n) => Number.isFinite(n));
    if (nums.length < 6) return null;
    const ring: LatLon[] = [];
    for (let i = 0; i + 1 < nums.length; i += 2) {
        const lat = nums[i];
        const lon = nums[i + 1];
        if (lat === undefined || lon === undefined) continue;
        ring.push({ lat, lon });
    }
    if (ring.length < 3) return null;

    const areaMatch = gml.match(
        /<(?:[\w.-]+:)?areaValue\b[^>]*>\s*([\d.]+)\s*<\/(?:[\w.-]+:)?areaValue>/i,
    );
    let areaOfficialM2: number | null = null;
    if (areaMatch && areaMatch[1]) {
        const v = Number.parseFloat(areaMatch[1]);
        if (Number.isFinite(v) && v > 0) areaOfficialM2 = v;
    }

    const refcat = (gml.match(
        /<(?:[\w.-]+:)?nationalCadastralReference\b[^>]*>\s*([^<]*?)\s*<\//i,
    ) ?? [])[1];
    const label = (gml.match(/<(?:[\w.-]+:)?label\b[^>]*>\s*([^<]*?)\s*<\//i) ?? [])[1];
    const begin = (gml.match(
        /<(?:[\w.-]+:)?beginLifespanVersion\b[^>]*>\s*([^<]*?)\s*<\//i,
    ) ?? [])[1];
    const srs = (gml.match(/srsName="([^"]+)"/i) ?? [])[1];

    let referencePoint: LatLon | null = null;
    const posPoint = gml.match(/<(?:[\w.-]+:)?pos\b[^>]*>\s*([-\d.]+)\s+([-\d.]+)\s*<\//i);
    if (posPoint && posPoint[1] && posPoint[2]) {
        const a = Number.parseFloat(posPoint[1]);
        const b = Number.parseFloat(posPoint[2]);
        if (Number.isFinite(a) && Number.isFinite(b)) referencePoint = { lat: a, lon: b };
    }

    return {
        refcat: refcat ?? null,
        ring,
        areaOfficialM2,
        areaDerivedM2: ringAreaM2(ring),
        referencePoint,
        beginLifespanVersion: begin ?? null,
        label: label ?? null,
        srsName: srs ?? null,
    };
}

// ── INSPIRE BU building parts ────────────────────────────────────────────────

export interface BuildingPart {
    readonly localId: string | null;
    /** INSPIRE `numberOfFloorsAboveGround` — the "ALTURAS" the LOD/height input needs. */
    readonly floorsAboveGround: number | null;
    readonly floorsBelowGround: number | null;
    readonly ring: LatLon[];
}

/**
 * Parse `GetBuildingPartByParcel` GML.
 * ⚠ NAMESPACE: Catastro serves building parts under `bu-ext2d:`, NOT `bu:` — the
 * capabilities advertise `bu:Building` as the return type, but the members are
 * `bu-ext2d:BuildingPart`. Matching on `bu:` alone silently yields zero parts on a
 * parcel that is fully built. All element matching here is prefix-agnostic.
 *
 * An EMPTY result is a real answer (a vacant plot), and the caller distinguishes it
 * from a failure via the transport-layer `empty` outcome, not by this returning [].
 */
export function parseBuildingParts(gml: string): BuildingPart[] {
    if (typeof gml !== 'string' || gml.length === 0) return [];
    const blocks =
        gml.match(/<(?:[\w.-]+:)?BuildingPart\b[\s\S]*?<\/(?:[\w.-]+:)?BuildingPart>/gi) ?? [];
    const out: BuildingPart[] = [];
    for (const block of blocks) {
        const num = (re: RegExp): number | null => {
            const m = block.match(re);
            if (!m || !m[1]) return null;
            const v = Number.parseInt(m[1].trim(), 10);
            return Number.isFinite(v) ? v : null;
        };
        const localId = (block.match(/<(?:[\w.-]+:)?localId\b[^>]*>\s*([^<]*?)\s*<\//i) ?? [])[1];
        const posMatch = block.match(
            /<(?:[\w.-]+:)?posList\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?posList>/i,
        );
        const ring: LatLon[] = [];
        if (posMatch && posMatch[1]) {
            const nums = posMatch[1]
                .trim()
                .split(/\s+/)
                .map((s) => Number.parseFloat(s))
                .filter((n) => Number.isFinite(n));
            for (let i = 0; i + 1 < nums.length; i += 2) {
                const lat = nums[i];
                const lon = nums[i + 1];
                if (lat === undefined || lon === undefined) continue;
                ring.push({ lat, lon });
            }
        }
        out.push({
            localId: localId ?? null,
            floorsAboveGround: num(/<(?:[\w.-]+:)?numberOfFloorsAboveGround\b[^>]*>\s*(-?\d+)\s*</i),
            floorsBelowGround: num(/<(?:[\w.-]+:)?numberOfFloorsBelowGround\b[^>]*>\s*(-?\d+)\s*</i),
            ring,
        });
    }
    return out;
}
