// §VALENCIA-ALINEACIONES — the LIVE read of `MapServer/212`, València's published alignment layer.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS CLOSES, AND WHAT IT DELIBERATELY DOES NOT
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// `esValenciaAlineaciones.ts` has, since 2026-08-02, held a PARSER for `altura`, a VALIDATOR for the
// movement polygon, and a row asserting `explicitAreaFootprint` is *resolved*. What it never had was
// a way to actually GET one: layer 212 was named in prose across five files and **fetched by no
// code at all**. That is the authored-but-unwired failure — an input marked `resolved` that no
// caller can obtain is indistinguishable, at runtime, from an input that does not exist.
//
// This file is the missing seam, and nothing more. It is the ONE impure boundary for layer 212,
// mirroring `resolveMurciaZoning` / `resolveMurciaStreetWidth`: fetch, validate, hand back a typed
// result, never throw. Every judgement stays in the L2-pure rulepack.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ THE GATE. THIS FILE CANNOT OPEN IT, AND IS BUILT SO THAT NOBODY OPENS IT BY ACCIDENT.
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// Founder ruling R2 (2026-08-02) stands, untouched: `altura`'s offset convention is undocumented and
// measured TWO-SIDED — 81 % of n=105 sit BELOW the built storey count, modally by two — so no
// heuristic, not even a conservative one, may be adopted. `VALENCIA_ENVELOPE_VERIFIED` remains
// `false` and this file does not read it, set it, or route around it.
//
// ⇒ A successful resolution returns a FOOTPRINT and an explicit `heightStatus: 'blocked-r2'`. There
//   is no code path here that yields a height, a storey count or an envelope. `altura` is carried
//   through `parseValenciaAltura` — which returns a SHAPE, never a meaning — purely so a caller can
//   display the raw published value alongside the refusal.
//
// ⇒ What an alignment UNLOCKS: the buildable FOOTPRINT in plan (the *profundidad edificable* that
//   Art. 6.18.1 puts on the alignments). What it does NOT unlock: the third dimension. A footprint
//   with no height is an area, not an envelope.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// CRS — READ FROM PUBLISHED METADATA, NEVER INFERRED, NEVER MEASURED AFTER REPROJECTION
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// Layer 212 declares `sourceSpatialReference.wkid = 25830` (ETRS89 / UTM 30N) in its own `?f=json`.
// The caller's point arrives as WGS84 lat/lon, so `inSR=4326` asks the PUBLISHER to locate the point
// — but `outSR=25830` brings the GEOMETRY back on its native metric grid, and the response's own
// `spatialReference` is ASSERTED before any ring is accepted.
//
// ⚠ This ordering is the whole point. A sibling agent found Murcia measuring on 4326 geometry
// quantised to ~10 m against legal bands at 8 m and 12 m. Here, no ring this file returns has ever
// been reprojected; `validateValenciaMovementPolygon` therefore measures real metres, and its
// `crs-looks-like-degrees` finding stays armed as the backstop.
//
// Contracts/ADRs: C58 §1.4/§1.5/§1.7a/§1.9/§1.10 · C11 (element-creation pipeline) · C63 ·
// ADR-0270 (rule KIND: `explicit-area`) · ADR-0283 (UNKNOWN is a valid product state) · ADR-0287 ·
// L-616 (`0` never means unknown; an UNKNOWN is never drawn as zero or unbounded) ·
// L-422/457/467/469 (failure ≠ empty — `service-error` and `no-polygon-here` are DIFFERENT results).

import { trace, SpanStatusCode } from '@opentelemetry/api';
import {
    parseValenciaAltura,
    validateValenciaMovementPolygon,
    valenciaAlturaGroundClass,
    type ValenciaAlturaValue,
    type ValenciaGroundClass,
    type ValenciaMovementPolygonReport,
    type ValenciaRing,
} from '../rulepacks/esValenciaAlineaciones.js';
import { isInValencia } from './valenciaBbox.js';

const tracer = trace.getTracer('pryzm.zoning');

/** The published feature service. València's own geoportal; CC BY 4.0; no key, no licence. */
export const VALENCIA_ARCGIS_SERVICE =
    'https://geoportal.valencia.es/server/rest/services/OPENDATA/UrbanismoEInfraestructuras/MapServer';

/** `PGOU - Alineacions / PGOU - Alineaciones` — 21 975 polygons, the movement-polygon layer. */
export const VALENCIA_ALINEACIONES_LAYER = 212 as const;

/** `Qualificació` — the calificación plane, used ONLY as the containment check on 212. */
export const VALENCIA_CALIFICACION_LAYER = 231 as const;

/**
 * ETRS89 / UTM zone 30N. **Read from `sourceSpatialReference.wkid` on the layer's own metadata**
 * (`…/212?f=json`, 2026-08-03), not inferred from how well the coordinates fit.
 */
export const VALENCIA_NATIVE_EPSG = 25830 as const;

/**
 * The catalogue entry that publishes this service as open data.
 * `datos.gob.es` → Ayuntamiento de València, "PGOU - Alineaciones", CC BY 4.0.
 */
export const VALENCIA_ALINEACIONES_CATALOGUE =
    'https://datos.gob.es/es/catalogo/l01462508-pgou-alineaciones';

/**
 * ⭐ **THE MEASUREMENT THAT MAKES THIS LAYER USABLE AS A LEGAL DATUM.**
 *
 * Founder decision R1 took layer 212 as the authoritative movement geometry by DOCTRINE ("authoritative
 * publication defines the boundary of knowledge"). `VALENCIA_MOVEMENT_GEOMETRY_DECISION.reopenOnlyIf`
 * names the contrary evidence that would overturn it: *"the municipality states the polygon is a block
 * outline, or a measurement shows it exceeding its calificación polygon at scale."*
 *
 * This constant records the INDEPENDENT GEOMETRIC CORROBORATION that had never been run — a paired
 * control against the publisher's OWN street centreline (`MapServer/223 Eixos de carrer`), in native
 * EPSG:25830, by clamped point-to-SEGMENT distance. It is reported because the same method is what
 * CONVICTED two sibling layers: Murcia's `pgou_ejes` (2.1 % on-frontage, 69.7 % midway) and Córdoba's
 * `sup_viales` (a street EDGE, not an alignment).
 *
 * ⚠ It corroborates the FOOTPRINT and says nothing whatever about `altura`. R2 is untouched.
 */
export const VALENCIA_ALINEACIONES_GEOMETRY_EVIDENCE = {
    measuredAt: '2026-08-03',
    method:
        'clamped point-to-SEGMENT distance (never a ray — the Córdoba agent\'s first ray method was ' +
        'broken and only a paired control caught it), from cadastral-parcel boundary sample points ' +
        'every 2 m, in native EPSG:25830. Edges were split FRONTAGE vs PARTY by an INDEPENDENT ' +
        'criterion (shared with another parcel within 0.5 m) BEFORE any distance to 212 was read.',
    tool: 'tools/valencia-alineaciones-probe/',
    /** ⭐ Parcel frontage sits ON the 212 boundary. */
    frontageToAlineaciones: { n: 56_775, medianM: 0.004, p75M: 0.151, onLinePct: 80.1 },
    /** ⭐ THE CONTROL: the publisher's own street axis sits half a street away. */
    frontageToStreetAxis: { n: 56_775, medianM: 8.854, p25M: 5.56, onLinePct: 1.0 },
    /** 212 is COARSER than the cadastre — so it is not a redrawn copy of it. */
    granularity: { alineacionesPolygons: 21_975, urbanCadastralParcels: 38_356, ratio: 1.75 },
    /**
     * The PARTY control fired at 52 % on-line, which alone would be the signature of a cadastre
     * copy. It is not one: 68,8 % of party-wall points lying on a 212 boundary have polygons of
     * DIFFERENT `altura` on either side (n = 42 250). The interior edges exist because the LEGAL
     * VALUE changes there, not because the cadastre does.
     */
    interiorEdgesAreOrdinanceSubdivisions: { n: 42_250, differingAlturaPct: 68.8 },
    /**
     * ⚠ The correction that stopped a street being shipped as a footprint: 212 tiles the city, so
     * only the BUILDING-CLASS union is the buildable footprint. Leakage of the street centreline
     * onto building-class ground is under 1 %.
     */
    centrelineOnBuildingClassPct: 0.96,
    verdict:
        'NOT a street centreline: the axis lies 8.85 m from the frontage that the 212 boundary sits ' +
        'on (median 0.004 m, 80.1 % within 1 m) — the same signature that convicted Murcia\'s ' +
        'pgou_ejes, with the sign reversed. NOT a cadastre copy: 1.75× coarser, and its interior ' +
        'edges track a change in altura. 212 is a legal ordinance layer that TILES the municipality; ' +
        'the ALIGNMENT is the boundary between building-class and non-building ground.',
} as const;

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// THE RESULT TYPE
// ══════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Why a resolution produced no footprint.
 *
 * ⚠ `no-polygon-here` and `service-error` are SEPARATE members and must stay separate. Collapsing an
 * unreachable service into "there is nothing here" is the §CONTEXT-DATA-HONESTY defect
 * (L-422/457/467/469): it converts a transport failure into a confident statement about the law.
 */
export type ValenciaAlineacionesRefusal =
    /** The point is outside the València routing box. */
    | 'out-of-valencia'
    /** No `fetch` was supplied and none exists in scope. */
    | 'no-fetch'
    /** ⚠ The service did not answer, or answered an ArcGIS error. NOT "no polygon here". */
    | 'service-error'
    /** The service answered correctly and there is genuinely no alignment polygon at this point. */
    | 'no-polygon-here'
    /**
     * ⭐ The polygon here is `altura = 0` — ground the plan records as carrying NO building
     * (carriageway, *espacios libres*). A real, citable answer: there is no footprint here because
     * none is granted. ⚠ NOT an error, and NOT the same as `altura-unknown`.
     */
    | 'not-building-ground'
    /**
     * ⚠ The polygon's `altura` is `blank`/`unrecognised`/out-of-range — genuinely UNKNOWN. The
     * footprint is withheld rather than drawn as zero or as the whole parcel (L-616, ADR-0283).
     */
    | 'altura-unknown'
    /** A polygon came back but failed `validateValenciaMovementPolygon` — see `validation`. */
    | 'invalid-geometry';

/** What layer 212 says at a point. A FOOTPRINT — never an envelope. */
export interface ValenciaAlineacionesHit {
    readonly ok: true;
    /**
     * The movement-polygon rings, in **native EPSG:25830 metres**, exactly as published.
     * Outer rings clockwise, *patio de manzana* holes counter-clockwise (ArcGIS winding).
     */
    readonly rings: readonly ValenciaRing[];
    readonly epsg: typeof VALENCIA_NATIVE_EPSG;
    /**
     * ⚠ The raw `altura` PARSED, not INTERPRETED. Every numeric variant carries
     * `interpretationBound: false`. Reading `.value` as a storey count is exactly what ADR-0287 and
     * founder ruling R2 forbid.
     */
    readonly altura: ValenciaAlturaValue;
    /**
     * ⭐ ALWAYS `'building-ground'` on a hit. The other two classes are refusals, not results —
     * see `ValenciaAlineacionesRefusal`. Carried so a caller can assert it rather than trust it.
     */
    readonly groundClass: Extract<ValenciaGroundClass, 'building-ground'>;
    /** `protec` verbatim — non-blank means a heritage protection level is recorded. */
    readonly protec: string | null;
    /** `ttggss` verbatim — the ordinance key. */
    readonly ttggss: string | null;
    /** The standing validator's report. `ok` here is a precondition of returning at all. */
    readonly validation: ValenciaMovementPolygonReport;
    /**
     * ⛔ ALWAYS `'blocked-r2'`. There is no branch that sets anything else, and adding one requires
     * the municipal answer (`VALENCIA_R5_ASK`) — not a better parser and not a chosen branch.
     */
    readonly heightStatus: 'blocked-r2';
    /** Human-readable, citable, and safe to render next to the footprint. */
    readonly heightBlockedBecause: string;
}

export interface ValenciaAlineacionesMiss {
    readonly ok: false;
    readonly reason: ValenciaAlineacionesRefusal;
    readonly detail?: string;
    /** Present only for `invalid-geometry`, so the caller can report WHAT was wrong. */
    readonly validation?: ValenciaMovementPolygonReport;
    /**
     * Present for `not-building-ground` / `altura-unknown` — the parsed (never interpreted) value
     * that produced the refusal, so the UI can cite the published figure while refusing.
     */
    readonly altura?: ValenciaAlturaValue;
}

export type ValenciaAlineacionesResolution = ValenciaAlineacionesHit | ValenciaAlineacionesMiss;

export interface ValenciaAlineacionesDeps {
    readonly fetchImpl?: typeof globalThis.fetch;
    /** Override the service root (tests, or a same-origin proxy). */
    readonly serviceBase?: string;
    /**
     * Check containment inside the calificación polygon (`MapServer/231`) — the R1 reopen guard.
     * Defaults `true`. A 231 failure NEVER fails the resolution; containment is simply not asserted.
     */
    readonly checkCalificacionContainment?: boolean;
}

const HEIGHT_BLOCKED_BECAUSE =
    'València publishes the buildable FOOTPRINT (alineaciones, MapServer/212) but not a usable ' +
    'height: PGOU Art. 6.19.1 sets the cornice as Hc = 4,80 + 2,90·Np from a storey count GRAPHED on ' +
    'Plano C, and the layer\'s `altura` column has an undocumented offset measured on BOTH sides of ' +
    'the built storey count (81 % of n=105 below it, modally by two). Founder ruling R2: await an ' +
    'authoritative definition of the field; adopt no heuristic. No height is published here — never ' +
    'an estimate, never a proxy figure.';

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// THE SEAM
// ══════════════════════════════════════════════════════════════════════════════════════════════════

/** Esri rings → `ValenciaRing[]`, dropping anything non-finite. Pure. */
function ringsFrom(geometry: unknown): ValenciaRing[] {
    const raw = (geometry as { rings?: unknown } | null)?.rings;
    if (!Array.isArray(raw)) return [];
    const out: ValenciaRing[] = [];
    for (const ring of raw) {
        if (!Array.isArray(ring)) continue;
        const pts: (readonly [number, number])[] = [];
        for (const p of ring) {
            if (!Array.isArray(p) || p.length < 2) continue;
            const x = Number(p[0]);
            const y = Number(p[1]);
            if (Number.isFinite(x) && Number.isFinite(y)) pts.push([x, y] as const);
        }
        if (pts.length >= 3) out.push(pts);
    }
    return out;
}

const attrsOf = (f: { attributes?: Record<string, unknown> } | undefined): Record<string, unknown> =>
    f?.attributes ?? {};

const blank = (v: unknown): string | null => {
    const s = typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
    return s.length ? s : null;
};

/**
 * Query one polygon layer at a WGS84 point, returning features whose geometry is in
 * **native EPSG:25830**. Throws only on transport/ArcGIS error — the caller maps that to
 * `service-error`, which is deliberately NOT the same as an empty answer.
 */
async function queryAtPoint(
    fetchImpl: typeof globalThis.fetch,
    base: string,
    layer: number,
    lat: number,
    lon: number,
): Promise<ReadonlyArray<{ attributes?: Record<string, unknown>; geometry?: unknown }>> {
    const geometry = encodeURIComponent(JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }));
    const url =
        `${base}/${layer}/query?geometry=${geometry}&geometryType=esriGeometryPoint` +
        `&spatialRel=esriSpatialRelIntersects&inSR=4326&outSR=${VALENCIA_NATIVE_EPSG}` +
        `&outFields=*&returnGeometry=true&resultRecordCount=8&f=json`;

    const res = await fetchImpl(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body: unknown = await res.json();
    const b = body as {
        error?: { code?: number; message?: string };
        spatialReference?: { wkid?: number; latestWkid?: number };
        features?: ReadonlyArray<{ attributes?: Record<string, unknown>; geometry?: unknown }>;
    };
    // ⚠ ArcGIS returns HTTP 200 with an `error` body. That is a FAILURE, not an empty result.
    if (b.error) throw new Error(`ArcGIS ${b.error.code ?? '?'}: ${b.error.message ?? 'error'}`);
    const feats = b.features ?? [];
    // ⚠ ASSERT the CRS we asked for actually came back. A silently declined `outSR` is precisely
    // how a lossy reprojection enters unnoticed and turns every metre below into a fiction.
    if (feats.length > 0) {
        const wkid = b.spatialReference?.latestWkid ?? b.spatialReference?.wkid;
        if (wkid !== VALENCIA_NATIVE_EPSG) {
            throw new Error(`layer ${layer} answered wkid ${String(wkid)}, expected ${VALENCIA_NATIVE_EPSG}`);
        }
    }
    return feats;
}

/**
 * Resolve València's published alignment (movement) polygon at a point.
 *
 * **NEVER THROWS** — every miss is a typed refusal, so the L5 dispatcher always has something honest
 * to render. OTel span `pryzm.zoning.resolveValenciaAlineaciones` (P8 / C58 §1.10).
 *
 * ⚠ **THE RESULT IS A FOOTPRINT, NOT AN ENVELOPE.** Feed `rings` to the `explicit-area` rule
 * (ADR-0270), which clips the parcel to a published footprint, supports *patio de manzana* holes and
 * HARD-FAILS rather than falling through to a whole-parcel inset. Do NOT pair it with a height
 * derived from `altura`: `heightStatus` is `'blocked-r2'` on every success, and that is the gate.
 */
export async function resolveValenciaAlineaciones(
    point: { lat: number; lon: number } | null | undefined,
    deps: ValenciaAlineacionesDeps = {},
): Promise<ValenciaAlineacionesResolution> {
    const span = tracer.startSpan('pryzm.zoning.resolveValenciaAlineaciones');
    span.setAttribute('provider', 'valencia-pgou-alineaciones-212');
    span.setAttribute('epsg', VALENCIA_NATIVE_EPSG);
    try {
        if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lon) || !isInValencia(point.lat, point.lon)) {
            span.setAttribute('resultFields', 'out-of-valencia');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'out-of-valencia' };
        }
        const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
        if (typeof fetchImpl !== 'function') {
            span.setAttribute('resultFields', 'no-fetch');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'no-fetch' };
        }
        const base = deps.serviceBase ?? VALENCIA_ARCGIS_SERVICE;

        let features: ReadonlyArray<{ attributes?: Record<string, unknown>; geometry?: unknown }>;
        try {
            features = await queryAtPoint(fetchImpl, base, VALENCIA_ALINEACIONES_LAYER, point.lat, point.lon);
        } catch (e) {
            // ⚠ UNREACHABLE ≠ EMPTY. This must never become `no-polygon-here`.
            span.setAttribute('resultFields', 'service-error');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'service-error', detail: e instanceof Error ? e.message : String(e) };
        }

        const feature = features[0];
        if (!feature) {
            // The service DID answer, and answered "nothing here". A genuine empty.
            span.setAttribute('resultFields', 'no-polygon-here');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'no-polygon-here' };
        }

        // ⭐⭐ THE GROUND-CLASS GATE, AND IT COMES BEFORE THE GEOMETRY IS EVER RETURNED.
        // Layer 212 TILES the municipality — carriageway included, carried at `altura = 0`
        // (measured: 40,8 % of street-centreline points fall inside a 212 polygon; only 0,96 % of
        // them on building-class ground). Returning "the polygon at this point" unconditionally
        // would hand a STREET back as a buildable footprint. So a non-building or unknown class is
        // a REFUSAL with its own reason, never a ring.
        const altura = parseValenciaAltura(blank(attrsOf(feature)['altura']));
        const groundClass = valenciaAlturaGroundClass(altura);
        if (groundClass !== 'building-ground') {
            const reason = groundClass === 'not-building-ground' ? 'not-building-ground' : 'altura-unknown';
            span.setAttribute('resultFields', reason);
            span.setAttribute('alturaKind', altura.kind);
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason, detail: `altura kind=${altura.kind}`, altura };
        }

        const rings = ringsFrom(feature.geometry);

        // The R1 reopen guard: 212 must not exceed its calificación polygon. Best-effort — a 231
        // failure leaves containment UNASSERTED rather than falsely asserted or falsely denied.
        let calificacionRings: ValenciaRing[] | null = null;
        if (deps.checkCalificacionContainment !== false) {
            try {
                const cal = await queryAtPoint(fetchImpl, base, VALENCIA_CALIFICACION_LAYER, point.lat, point.lon);
                const g = cal[0]?.geometry;
                if (g) calificacionRings = ringsFrom(g);
            } catch {
                calificacionRings = null; // unknown, not "contains" and not "exceeds"
            }
        }

        const validation = validateValenciaMovementPolygon(rings, calificacionRings);
        if (!validation.ok) {
            span.setAttribute('resultFields', 'invalid-geometry');
            span.setStatus({ code: SpanStatusCode.OK });
            return {
                ok: false,
                reason: 'invalid-geometry',
                detail: validation.findings.map((f) => f.code).join(','),
                validation,
            };
        }

        const attrs = attrsOf(feature);
        span.setAttribute('resultFields', 'rings,altura,groundClass,protec,ttggss');
        span.setAttribute('areaM2', validation.areaM2 ?? -1);
        span.setAttribute('alturaKind', altura.kind);
        span.setAttribute('heightStatus', 'blocked-r2');
        span.setStatus({ code: SpanStatusCode.OK });
        return {
            ok: true,
            rings,
            epsg: VALENCIA_NATIVE_EPSG,
            altura,
            groundClass: 'building-ground',
            protec: blank(attrs['protec']),
            ttggss: blank(attrs['ttggss']),
            validation,
            heightStatus: 'blocked-r2',
            heightBlockedBecause: HEIGHT_BLOCKED_BECAUSE,
        };
    } catch (e) {
        // Defence in depth: this function's contract is that it never throws.
        span.setAttribute('resultFields', 'service-error');
        span.setStatus({ code: SpanStatusCode.OK });
        return { ok: false, reason: 'service-error', detail: e instanceof Error ? e.message : String(e) };
    } finally {
        span.end();
    }
}
