// ── VALÈNCIA (INE 46250) — the LAYER 212 read path: parser · geometry validator · heritage seam. ──
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS FILE IS, AND THE ONE LINE IT DOES NOT CROSS
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// València's ENVELOPE is blocked on ONE external answer: what `MapServer/212.altura` encodes
// (`VALENCIA_R5_ASK`). The founder's ruling, 2026-08-02:
//
//   "Wait. Don't engineer around missing authority. No heuristic. No inferred semantics. No
//    workaround… Do not substitute engineering for legal interpretation."
//   engineering: essentially_complete · continue_now: [parser, testing, refusal logic,
//                geometry validation, heritage integration hooks] · wait_only_for:
//                [authoritative definition of altura, heritage access]
//
// ⇒ The distinction this file is built around: **engineering AROUND a missing authority is
// forbidden; engineering AHEAD of it is expected.** So everything here is the machinery that will be
// needed the moment the answer arrives — and NONE of it decides what `altura` means.
//
// ⚠⚠ **THE PARSER PARSES; IT DOES NOT INTERPRET.** There is deliberately NO `storeys` variant in
// `ValenciaAlturaValue`. A bare `5` is returned as `bare-integer`, never as "5 storeys", because
// whether a bare integer is a *número de plantas*, an Np, or something else is exactly the unresolved
// question (ADR-0287 — València is that ADR's worked example; ADR-0283 — UNKNOWN is a valid product
// state). A future author who learns the answer BINDS the interpretation elsewhere; they do not edit
// this file to make `5` mean five storeys.
//
// PURITY: L2-pure (C58 §1.9) — no I/O, no THREE, no DOM, no clock. OTel spans on every exported
// function (P8 / C58 §1.10).
//
// Contracts/ADRs: C58 §1.4/§1.5/§1.7a/§1.9/§1.10/§1.14.4 · C11 · C63 · ADR-0270 (rule KIND) ·
// ADR-0283 · ADR-0287 · L-616 (`0` never means unknown) · L-422/457/467/469 (failure ≠ empty).

import { trace, SpanStatusCode } from '@opentelemetry/api';
import type { EnvelopeRefusal } from '@pryzm/schemas';
import {
    valenciaHeritageRefusal,
    type ValenciaHeritageDisposition,
} from './esValenciaEnvelope.js';

const tracer = trace.getTracer('pryzm.zoning');

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 1 — THE PARSER
// ══════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * A parsed `MapServer/212.altura` value. **A shape, not a meaning.**
 *
 * ⚠ Every numeric variant carries `interpretationBound: false`. That field is not decoration — it is
 * the type-level reminder that the number has been READ but not UNDERSTOOD, and a consumer that
 * ignores it is doing the thing ADR-0287 forbids.
 *
 * The variants come from a measured census of the live field (21 975 polygons by area, plus a
 * 156-point area-weighted sample over the buildable denominator), not from imagination — every one
 * of them occurs.
 */
export type ValenciaAlturaValue =
    /**
     * A bare integer in 1…30. ⚠ **The only class that could ever become an envelope input — and its
     * meaning is UNKNOWN.** Do not read `value` as a storey count.
     */
    | { readonly kind: 'bare-integer'; readonly value: number; readonly interpretationBound: false; readonly raw: string }
    /**
     * ⚠⚠ The literal `0`. **NEVER coerced, never defaulted, never merged into `bare-integer`.**
     * C58 §1.7a / L-616: `null` means unknown and `0` never does. Measured, it is 34,13 % of the
     * layer's area but only 10,3 % of buildable land, and it co-occurs with non-buildable ground
     * (street complement, *espacios libres*) — so it is probably a true zero there, and "probably"
     * is not a licence to coerce it.
     */
    | { readonly kind: 'zero'; readonly interpretationBound: false; readonly raw: string }
    /** A bare integer above 30 (`2000`, `538650`). Not a plausible storey count under any reading. */
    | { readonly kind: 'integer-out-of-range'; readonly value: number; readonly interpretationBound: false; readonly raw: string }
    /**
     * `<=5` / `Max 5` — a **BOUND**, not a value (L-616's distinction). ⚠ It is EDA's largest bucket
     * on buildable land (20 of 55 sampled), so collapsing it to its number would silently convert a
     * ceiling into a determination across the single biggest open-block zone in the city.
     */
    | { readonly kind: 'bounded'; readonly bound: number; readonly interpretationBound: false; readonly raw: string }
    /** `13m` — metres, explicitly suffixed. A different UNIT, i.e. a different KIND (ADR-0270). */
    | { readonly kind: 'metres'; readonly value: number; readonly raw: string }
    /** `0.8m2t/m2s` — a floor-area ratio. */
    | { readonly kind: 'far'; readonly value: number; readonly raw: string }
    /** `10235m2t` — absolute buildable floorspace in m². */
    | { readonly kind: 'floorspace-m2t'; readonly value: number; readonly raw: string }
    /** `S=39600.65m2s` — a SITE area. ⚠ Bare site areas also occur, and they wear a storey's clothes. */
    | { readonly kind: 'site-area-m2s'; readonly value: number; readonly raw: string }
    /** `PROTEGIDO`, `BIC`, `BRL`, `PROT_*` — existing-building-derived. NOT a number (ADR-0270). */
    | { readonly kind: 'protection-derived'; readonly raw: string }
    /** `PPARCIAL`, `DIFERIDO A5`, `ORD_DET`, `NORMATIVA` — the answer is in another instrument. */
    | { readonly kind: 'delegated'; readonly raw: string }
    /** Empty or whitespace. */
    | { readonly kind: 'blank'; readonly raw: string }
    /** ⚠ Anything else — `-+-`, `_`, `+-`, `EC`, `M15b`, `ET=1999210`. Never guessed at. */
    | { readonly kind: 'unrecognised'; readonly raw: string };

/** Every `kind` a parse can produce, so a consumer enumerates the source of truth (never a hand copy). */
export const VALENCIA_ALTURA_KINDS = [
    'bare-integer', 'zero', 'integer-out-of-range', 'bounded', 'metres', 'far',
    'floorspace-m2t', 'site-area-m2s', 'protection-derived', 'delegated', 'blank', 'unrecognised',
] as const;

/** The largest bare integer treated as plausibly a storey-scale figure. Above it → out-of-range. */
export const VALENCIA_ALTURA_PLAUSIBLE_MAX = 30;

/** Parse a captured numeric group. `undefined` (an unmatched group) yields `NaN`, never 0. */
const num = (s: string | undefined): number => (s === undefined ? Number.NaN : Number(s.replace(',', '.')));

/**
 * Parse one raw `altura` string into a typed shape.
 *
 * ⚠ **ORDER IS THE CONTRACT.** The bound pattern (`<=5`) is tested BEFORE the bare-integer pattern,
 * because `Number('<=5')` is `NaN` but a sloppier regex would strip the operator and yield `5` — the
 * silent-coercion trap one field over from the `0` sentinel. Likewise the suffixed units are tested
 * before the bare number, so `13m` can never be read as the integer 13.
 *
 * Total: every input returns a variant; `unrecognised` is a real answer, never a throw and never a
 * default number. PURE; never throws. OTel span `pryzm.zoning.parseValenciaAltura` (P8).
 */
export function parseValenciaAltura(raw: string | null | undefined): ValenciaAlturaValue {
    const span = tracer.startSpan('pryzm.zoning.parseValenciaAltura');
    try {
        const s = (raw ?? '').trim();
        const out = parseInner(s);
        span.setAttribute('kind', out.kind);
        span.setAttribute('rawLength', s.length);
        span.setAttribute('resultFields', 'kind');
        span.setStatus({ code: SpanStatusCode.OK });
        return out;
    } finally {
        span.end();
    }
}

function parseInner(s: string): ValenciaAlturaValue {
    if (s === '') return { kind: 'blank', raw: s };

    // ⚠ BOUNDS FIRST — `<=5`, `<= 5`, `Max 5`, `MAX5`. A bound is not a value.
    const bound = s.match(/^(?:<=|≤|m[aá]x(?:imo)?\.?)\s*(\d+(?:[.,]\d+)?)$/i);
    if (bound) {
        const v = num(bound[1]);
        if (Number.isFinite(v)) return { kind: 'bounded', bound: v, interpretationBound: false, raw: s };
    }

    // ⚠ SUFFIXED UNITS BEFORE BARE NUMBERS — a wrong unit is a wrong KIND, not a wrong number.
    const far = s.match(/^(\d+(?:[.,]\d+)?)\s*m2t\s*\/\s*m2s$/i);
    if (far) return { kind: 'far', value: num(far[1]), raw: s };

    const siteArea = s.match(/^S\s*=\s*(\d+(?:[.,]\d+)?)\s*m2s$/i);
    if (siteArea) return { kind: 'site-area-m2s', value: num(siteArea[1]), raw: s };

    const m2t = s.match(/^(\d+(?:[.,]\d+)?)\s*m2t$/i);
    if (m2t) return { kind: 'floorspace-m2t', value: num(m2t[1]), raw: s };

    const metres = s.match(/^(\d+(?:[.,]\d+)?)\s*m$/i);
    if (metres) return { kind: 'metres', value: num(metres[1]), raw: s };

    // Existing-building-derived and delegated regimes — words, never numbers.
    if (/(protegid|^bic\b|^brl\b|prot_)/i.test(s)) return { kind: 'protection-derived', raw: s };
    if (/(pparcial|diferido|ord_det|normativa|plan\s+especial|estudio\s+de\s+detalle)/i.test(s)) {
        return { kind: 'delegated', raw: s };
    }

    // Bare integers LAST, and split three ways. A decimal is NOT a bare integer.
    if (/^\d+$/.test(s)) {
        const v = Number(s);
        if (v === 0) return { kind: 'zero', interpretationBound: false, raw: s };
        if (v <= VALENCIA_ALTURA_PLAUSIBLE_MAX) {
            return { kind: 'bare-integer', value: v, interpretationBound: false, raw: s };
        }
        return { kind: 'integer-out-of-range', value: v, interpretationBound: false, raw: s };
    }

    return { kind: 'unrecognised', raw: s };
}

/**
 * Is this parsed value even a CANDIDATE to become an envelope input once `altura` is defined?
 *
 * ⚠ **`true` DOES NOT MEAN USABLE.** It means "this is the class the municipal answer would be
 * about". Publication is still gated by `valenciaAlturaRouteIsPublishable()`, which is `false`.
 * Exposed so the eventual binding has one place to key on rather than re-deriving the taxonomy.
 *
 * PURE; never throws. OTel span `pryzm.zoning.valenciaAlturaIsCandidateInput` (P8).
 */
export function valenciaAlturaIsCandidateInput(v: ValenciaAlturaValue): boolean {
    const span = tracer.startSpan('pryzm.zoning.valenciaAlturaIsCandidateInput');
    try {
        const candidate = v.kind === 'bare-integer';
        span.setAttribute('kind', v.kind);
        span.setAttribute('candidate', candidate);
        span.setAttribute('resultFields', 'candidate');
        span.setStatus({ code: SpanStatusCode.OK });
        return candidate;
    } finally {
        span.end();
    }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 2 — THE MOVEMENT-POLYGON GEOMETRY VALIDATOR
// ══════════════════════════════════════════════════════════════════════════════════════════════════

/** A ring as ArcGIS returns it: `[x, y]` pairs. Metres when `outSR=25830`. */
export type ValenciaRing = readonly (readonly [number, number])[];

/** What a movement-polygon validation found. `ok` means every check passed. */
export interface ValenciaMovementPolygonReport {
    readonly ok: boolean;
    /** Machine-readable findings, empty when `ok`. */
    readonly findings: readonly ValenciaGeometryFinding[];
    /** Net area in m² (outer rings minus holes), or `null` when it could not be computed. */
    readonly areaM2: number | null;
    /** Mean width proxy `2A/P` in metres — the *profundidad edificable* scale. `null` if unknown. */
    readonly meanWidthM: number | null;
    /** Count of interior rings — the *patio de manzana* case. */
    readonly holeCount: number;
}

export type ValenciaGeometryFinding =
    /** ⚠ Areas ≪ 1 m² across a city polygon ⇒ the rings are in DEGREES, not EPSG:25830 metres. */
    | { readonly code: 'crs-looks-like-degrees'; readonly detail: string }
    /** Fewer than 3 distinct vertices, or zero/negative net area. */
    | { readonly code: 'degenerate-ring'; readonly detail: string }
    /** No rings at all. */
    | { readonly code: 'empty-geometry'; readonly detail: string }
    /** ⚠ The movement polygon is LARGER than the calificación polygon that should contain it. */
    | { readonly code: 'exceeds-calificacion'; readonly detail: string }
    /** A hole that is not strictly inside the outer ring's extent. */
    | { readonly code: 'hole-outside-outer'; readonly detail: string };

/**
 * ⚠ **A polygon whose net area is under this (m²) is treated as a CRS error, not a tiny parcel.**
 *
 * This is not a hypothetical. The first run of the 2026-08-02 geometry measurement used ArcGIS
 * `identify`, which returns geometry in the **mapExtent's** SR — degrees — and every mean width came
 * back as `0.0 m`. The numbers looked like data and were a unit error. A València alignment polygon
 * is a city block's buildable band; 1 m² is four orders of magnitude below the smallest real one,
 * while a degree-squared area for such a polygon is ~1e-7. The gap is unambiguous.
 */
export const VALENCIA_MIN_PLAUSIBLE_POLYGON_M2 = 1;

const signedArea = (r: ValenciaRing): number => {
    let a = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const pi = r[i]; const pj = r[j];
        if (!pi || !pj) continue;
        a += pj[0] * pi[1] - pi[0] * pj[1];
    }
    return a / 2;
};
const ringPerimeter = (r: ValenciaRing): number => {
    let p = 0;
    for (let i = 1; i < r.length; i++) {
        const a = r[i - 1]; const b = r[i];
        if (!a || !b) continue;
        p += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    return p;
};
const distinctVertices = (r: ValenciaRing): number =>
    new Set(r.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`)).size;

/**
 * Validate a layer-212 movement polygon — **the standing validator the n=54 one-off measurement
 * became.**
 *
 * Founder decision R1 (2026-08-02) makes this geometry the LEGAL DATUM for the buildable depth:
 * Art. 6.18.1 sets the *ocupación* by the alineaciones, and the city publishes them. A datum that
 * load-bearing must be checked on every read, not sampled once — which is what turns
 * *"0 of 54 exceeded their calificación"* from a finding into an invariant.
 *
 * Checks, in order: geometry present · CRS plausibility · degeneracy · holes inside their outer ring ·
 * containment within the calificación polygon (when one is supplied).
 *
 * ⚠ **Containment is compared by AREA, and the tolerance is deliberate.** The two layers are digitised
 * independently, so an exact topological test would fire on rounding. `toleranceRatio` defaults to 2 %:
 * a movement polygon may not exceed 102 % of its calificación polygon.
 *
 * Never throws — a malformed input yields findings, because a validator that throws on bad data is a
 * validator that cannot report bad data. OTel span `pryzm.zoning.validateValenciaMovementPolygon` (P8).
 */
export function validateValenciaMovementPolygon(
    movementRings: readonly ValenciaRing[] | null | undefined,
    calificacionRings?: readonly ValenciaRing[] | null,
    opts: { readonly toleranceRatio?: number } = {},
): ValenciaMovementPolygonReport {
    const span = tracer.startSpan('pryzm.zoning.validateValenciaMovementPolygon');
    try {
        const findings: ValenciaGeometryFinding[] = [];
        const rings = (movementRings ?? []).filter((r) => Array.isArray(r) && r.length > 0);
        if (rings.length === 0) {
            findings.push({ code: 'empty-geometry', detail: 'no rings supplied' });
            span.setAttribute('ok', false);
            span.setAttribute('resultFields', 'findings');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, findings, areaM2: null, meanWidthM: null, holeCount: 0 };
        }

        const areas = rings.map(signedArea);
        // ArcGIS winds outer rings clockwise and holes counter-clockwise, so the signs cancel and a
        // patio de manzana is subtracted without a separate ring-classification pass.
        const net = Math.abs(areas.reduce((s, a) => s + a, 0));
        const outerSign = Math.sign(areas[0] ?? 0);
        const holes = areas.filter((a) => Math.sign(a) !== outerSign && a !== 0);
        const perimeter = rings.reduce((s, r) => s + ringPerimeter(r), 0);

        for (const [i, r] of rings.entries()) {
            const ai = areas[i] ?? 0;
            if (distinctVertices(r) < 3 || ai === 0) {
                findings.push({
                    code: 'degenerate-ring',
                    detail: `ring ${i}: ${distinctVertices(r)} distinct vertices, signed area ${ai}`,
                });
            }
        }

        if (net > 0 && net < VALENCIA_MIN_PLAUSIBLE_POLYGON_M2) {
            findings.push({
                code: 'crs-looks-like-degrees',
                detail: `net area ${net} is below ${VALENCIA_MIN_PLAUSIBLE_POLYGON_M2} m² — the rings are `
                    + 'almost certainly in degrees. Query with outSR=25830; `identify` returns the '
                    + "mapExtent's SR, which is how a whole measurement once read 0.0 m wide.",
            });
        }

        // Holes must sit inside the outer ring's extent. A cheap bbox test: it catches the real
        // failure (a hole belonging to a different polygon) without a full point-in-polygon pass.
        if (holes.length > 0) {
            const ext = (r: ValenciaRing): [number, number, number, number] => {
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                for (const p of r) {
                    if (!p) continue;
                    if (p[0] < minX) minX = p[0];
                    if (p[1] < minY) minY = p[1];
                    if (p[0] > maxX) maxX = p[0];
                    if (p[1] > maxY) maxY = p[1];
                }
                return [minX, minY, maxX, maxY];
            };
            const outer0 = rings[0];
            const o = outer0 ? ext(outer0) : [Infinity, Infinity, -Infinity, -Infinity] as [number, number, number, number];
            for (const [i, r] of rings.entries()) {
                if (i === 0 || Math.sign(areas[i] ?? 0) === outerSign) continue;
                const h = ext(r);
                if (h[0] < o[0] || h[1] < o[1] || h[2] > o[2] || h[3] > o[3]) {
                    findings.push({ code: 'hole-outside-outer', detail: `ring ${i} extends beyond the outer ring` });
                }
            }
        }

        // ⭐ THE INVARIANT: a movement polygon never exceeds the zone polygon it sits in (0 of 54).
        let ok = findings.length === 0;
        if (calificacionRings && calificacionRings.length > 0) {
            const calNet = Math.abs(calificacionRings.map(signedArea).reduce((s, a) => s + a, 0));
            const tol = opts.toleranceRatio ?? 0.02;
            if (calNet > 0 && net > calNet * (1 + tol)) {
                findings.push({
                    code: 'exceeds-calificacion',
                    detail: `movement ${net.toFixed(0)} m² > calificación ${calNet.toFixed(0)} m² `
                        + `(+${((net / calNet - 1) * 100).toFixed(1)} %, tolerance ${(tol * 100).toFixed(0)} %) `
                        + '— contradicts the R1 movement-geometry premise; do NOT use this polygon as a depth datum',
                });
            }
            ok = findings.length === 0;
        }

        span.setAttribute('ok', ok);
        span.setAttribute('findingCount', findings.length);
        span.setAttribute('holeCount', holes.length);
        span.setAttribute('resultFields', 'ok,findings,areaM2,meanWidthM');
        span.setStatus({ code: SpanStatusCode.OK });
        return {
            ok,
            findings,
            areaM2: net,
            meanWidthM: perimeter > 0 ? (2 * net) / perimeter : null,
            holeCount: holes.length,
        };
    } finally {
        span.end();
    }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 3 — THE INPUT STATUS MATRIX  (§VALENCIA-INPUT-MATRIX, founder check 2026-08-02)
//
// > "Don't let `altura` become a catch-all explanation. List every input needed by the envelope
// >  engine… You may discover that only one or two variables truly block envelope generation."
//
// The check was right to run, and the answer is: **`altura` is NOT a catch-all — it is the single
// gate for 85,5 % of the reachable land, and the residue has a DIFFERENT and cheaper owner (us).**
// Every row below is the status of a real `ComputeBuildableEnvelopeInput` field, cited.
// ══════════════════════════════════════════════════════════════════════════════════════════════════

/** How an envelope input stands today. */
export type ValenciaInputStatus =
    /** Held, cited, and usable now. */
    | 'resolved'
    /** ⭐ The ordinance regulates by another mechanism, so the field has NO value BY DESIGN. */
    | 'not-the-rule-kind'
    /** Ours to build; no external dependency. */
    | 'engineering'
    /** Ours to read; a chapter of the ordinance nobody has transcribed. */
    | 'unread-ordinance'
    /** ⛔ Only a third party can resolve it. */
    | 'external-authority';

export interface ValenciaEnvelopeInput {
    /** The `ComputeBuildableEnvelopeInput` field, or the engine concept it feeds. */
    readonly input: string;
    readonly status: ValenciaInputStatus;
    /** Which zones this row's status applies to. */
    readonly zones: readonly string[];
    readonly evidence: string;
}

/**
 * ⭐ **EVERY INPUT `computeBuildableEnvelope` NEEDS FOR AN ENS/EDA VALÈNCIA ENVELOPE.**
 *
 * ⚠⚠ **THE FINDING THAT MATTERS: the engine already has València's rule kind.** `explicit-area`
 * (ADR-0270) clips the parcel to a PUBLISHED buildable footprint, supports interior holes (the
 * *patio de manzana*) and multi-part footprints, and **hard-fails rather than falling through to a
 * whole-parcel inset** when the footprint is absent. That is exactly the shape decision **D-005**
 * gave València: layer 212's movement polygon IS the published footprint. **No new solver is
 * needed** — the remaining engineering is declaring the rule on the pack and injecting the ring.
 *
 * ⇒ **If `altura` were answered tomorrow, an ENS/EDA envelope WOULD emit**, after two steps that
 * need no external answer and are ours: declare `geometricRule: explicit-area` on the packed zones,
 * and wire the layer-212 footprint alongside the CLOSURE-REGISTER #4 `origen` resolver.
 *
 * ⚠ **ONE HONEST RESIDUAL RISK, not a blocker.** `solveExplicitArea` refuses `non-convex-both` —
 * where NEITHER the parcel nor the footprint is convex, the intersection is not computed exactly and
 * the engine refuses rather than approximate (C58 §1.4). València's movement polygons carry holes on
 * ~19 % of sampled ENS/EDA land, so a non-zero share of parcels will take that refusal. It is a
 * REFUSAL, never a wrong number — and its size is unmeasured, so it is named, not estimated.
 */
export const VALENCIA_ENVELOPE_INPUT_STATUS: readonly ValenciaEnvelopeInput[] = [
    {
        input: 'parcelRing', status: 'resolved', zones: ['*'],
        evidence: 'Catastro INSPIRE CP, by identifier — and València publishes `refcat` on its own '
            + 'parcel layer too, so there are TWO routes and neither needs a licence. PARCEL axis '
            + 'measured 99.2 % (N=120, 0 transport failures).',
    },
    {
        input: 'edgeClassifications', status: 'resolved', zones: ['*'],
        evidence: 'Derived from the parcel ring against the street network, as every other city does. '
            + 'No València-specific input.',
    },
    {
        input: 'zoning.zoneCode (califi/tipoca)', status: 'engineering', zones: ['*'],
        evidence: 'Live and KEYLESS on MapServer/231 — califi + tipoca + origen sit on ONE row, so no '
            + 'second spatial join. What is missing is the proxy + resolver (CLOSURE-REGISTER #4). '
            + 'Ours, ~1 day, needs no external answer.',
    },
    {
        input: 'geometricRule = explicit-area', status: 'engineering', zones: ['ENS', 'EDA'],
        evidence: '⭐ The kind ALREADY EXISTS in ZoningRulesEngine (ADR-0270): it clips the parcel to a '
            + 'published footprint, supports patio-de-manzana holes and multi-part footprints, and '
            + 'HARD-FAILS instead of falling through to a whole-parcel inset. Declaring it on the pack '
            + 'is a data change, not a new solver.',
    },
    {
        input: 'explicitAreaFootprint (the buildable depth)', status: 'resolved', zones: ['ENS', 'EDA'],
        evidence: '⭐ D-005 / founder decision R1 — layer 212 IS the published movement polygon and the '
            + 'geometry IS the legal datum. Art. 6.18.1: «La ocupación de la parcela edificable se '
            + 'ajustará a las alineaciones definidas en el Plano C». Measured n=54: median mean-width '
            + '15.6 m, NEVER larger than its calificación polygon (0/54). Validated on every read by '
            + 'validateValenciaMovementPolygon().',
    },
    {
        input: 'setbacks.front/side/rear', status: 'not-the-rule-kind', zones: ['ENS'],
        evidence: '⭐ SETTLED BY ARTICLE, not merely absent. Art. 6.18.2: «La edificación no podrá '
            + 'retranquearse de la alineación exterior» — retranqueos are FORBIDDEN, so the envelope '
            + 'is alignment-bound and a front/side/rear triple is the wrong SHAPE (ADR-0270), not a '
            + 'missing number. For an explicit-area rule the published footprint IS the setback.',
    },
    {
        input: 'setbacks.front/side/rear', status: 'unread-ordinance', zones: ['UFA'],
        evidence: '⛔ THE GENUINE SECOND BLOCKER, and it is OURS, not `altura`. UFA-2 (hilera) and '
            + 'UFA-3 (aislada) are SETBACK typologies whose parcel and volume conditions live in '
            + 'Arts. 6.36/6.37 and 6.39/6.40 — NOT READ. Art. 6.29.1 remits them to Secciones 3–5. '
            + 'Category Legal/ours, ~1 day of reading. 5.87 pp of buildable land.',
    },
    {
        input: 'maxFAR (edificabilidad)', status: 'not-the-rule-kind', zones: ['ENS', 'EDA'],
        evidence: '⭐ NOT A GAP — a FINDING. The ENS and EDA chapters contain NO edificabilidad figure '
            + 'at all (searched). The envelope is alineación + profundidad + altura de cornisa by '
            + 'design, so a null FAR is the ordinance working as written.',
    },
    {
        input: 'maxCoverage (ocupación)', status: 'not-the-rule-kind', zones: ['ENS', 'EDA'],
        evidence: '⭐ Art. 6.18.1 sets the ocupación BY THE ALIGNMENTS — so it is the same geometry as '
            + 'the explicit-area footprint, not a separate ratio. Publishing a coverage percentage '
            + 'here would be a second, weaker statement of a constraint we already hold exactly.',
    },
    {
        input: 'permittedUse (usos)', status: 'resolved', zones: ['*'],
        evidence: 'Published live on MapServer/231 as `uso` / `tipouso` / `uso_califi`. ⚠ It is not an '
            + 'envelope-GEOMETRY input — it never shapes the solid — so it cannot block emission; it '
            + 'rides the derivation trace.',
    },
    {
        input: 'maxHeight_m / maxFloors', status: 'external-authority', zones: ['ENS', 'EDA', 'UFA'],
        evidence: '⛔ THE GATE. Art. 6.19.1 Hc = 4,80 + 2,90·Np (EDA 5,30) with Np = graphed plantas − 1. '
            + '`altura` is storey-scale (metres refuted 4×) but its offset is undocumented and sits '
            + 'BELOW the built storey count on 81 % of sampled buildings, modally by two — a TWO-SIDED '
            + 'error, so ADR-0287 forbids a conservative branch. Owner: the founder (R5). '
            + '⚠ This is ONE blocker, not two: "storeys vs metres" is settled, only the offset is open.',
    },
    {
        input: 'heritage overlay', status: 'external-authority', zones: ['*'],
        evidence: '⚠ SECONDARY / DEPLOYMENT ONLY (founder R3). It constrains DOWNWARD after the base '
            + 'ordinance is known, so it blocks shipping, not modelling. The seam is built '
            + '(applyValenciaHeritageConstraint) and refuses where heritage may apply.',
    },
    {
        input: 'every other zone (CHP · TER · IND)', status: 'unread-ordinance', zones: ['CHP', 'TER', 'IND'],
        evidence: '⚠ Chapters NOT READ — and `altura` is IRRELEVANT to them, which is exactly why this '
            + 'matrix was worth building. 3.35 pp of buildable land, ours to read.',
    },
] as const;

/**
 * ⭐ **THE COVERAGE-LOSS MATRIX — 100 % of València's buildable land in four buckets.**
 *
 * The standing rule, applied. Percentages are of the L-656 private-buildable denominator
 * (1 869,6 ha server-side / 1 874,9 ha client-side — the two methods agree to 0,28 %).
 *
 * ⚠⚠ **THE 63,60 % `no-pack` DOES DECOMPOSE, AND THE ROADMAP CHANGES BECAUSE OF IT.** Reported as
 * one undifferentiated block it read as *"63,60 % waiting on `altura`"*. Measured:
 *
 * | bucket | share | owner |
 * |---|---:|---|
 * | **Legally impossible** — delegated to a derived instrument; terminal, cited, CORRECT | **36,40 %** | nobody: it is the right answer |
 * | **Awaiting authoritative interpretation** — ENS 32,97 + EDA 21,40, gated ONLY by `altura` | **54,37 %** | the founder (R5) |
 * | **Awaiting interpretation AND our own reading** — UFA: `altura` **plus** unread Arts. 6.36/6.37/6.39/6.40 | **5,87 %** | founder + us |
 * | **Awaiting our own reading alone** — CHP + TER + IND chapters; `altura` is irrelevant here | **3,35 %** | us |
 * | **Data unavailable** | **0,00 %** | — |
 *
 * ⭐ **`Data unavailable` IS EMPTY, AND THAT IS THE HEADLINE.** Before D-005 the whole 63,60 % was
 * filed as data acquisition — *"Plano C is unpublished; an institution, a fee, an unknown timeline"*.
 * After it, **no València land is blocked by missing data at all.**
 *
 * ⭐ **`altura` gates 54,37 of the 63,60 pp — 85,5 % of the reachable land — and 9,22 pp is ours.**
 * So it is genuinely close to a single-blocker city, but *not* a pure one: **9,22 pp would not emit
 * even with a perfect answer tomorrow**, and saying otherwise would have been the reporting error
 * this exercise was run to catch.
 */
export const VALENCIA_COVERAGE_LOSS = {
    denominatorHa: 1869.6,
    /** Delegated to a derived instrument (PE/RI/MP/ED/PRI/PP/…). Terminal and correct. */
    legallyImpossiblePct: 36.4,
    /** ENS 32.97 + EDA 21.40 — gated by `altura` ALONE. */
    awaitingInterpretationOnlyPct: 54.37,
    /** UFA — `altura` AND its unread setback chapters. */
    awaitingInterpretationAndOurReadingPct: 5.87,
    /** CHP + TER + IND — unread chapters; independent of `altura`. */
    awaitingOurReadingOnlyPct: 3.35,
    /** ⭐ Nothing. After D-005 no València land is blocked by absent data. */
    dataUnavailablePct: 0,
    /**
     * ⚠ Not a bucket — an ORTHOGONAL deployment gate over all of the above. Counting it as a land
     * share would double-count every parcel (founder R3).
     */
    heritageIsOrthogonalDeploymentGate: true,
} as const;

/**
 * Would an ENS/EDA envelope emit if `altura` were answered tomorrow? Returns the inputs that would
 * STILL be missing — empty means yes.
 *
 * ⚠ It answers for ENS/EDA only, and deliberately: UFA and CHP/TER/IND have their own unread
 * chapters, and folding them in would reproduce the very catch-all this matrix exists to break.
 *
 * PURE; never throws. OTel span `pryzm.zoning.valenciaInputsStillMissingIfAlturaAnswered` (P8).
 */
export function valenciaInputsStillMissingIfAlturaAnswered(): readonly ValenciaEnvelopeInput[] {
    const span = tracer.startSpan('pryzm.zoning.valenciaInputsStillMissingIfAlturaAnswered');
    try {
        const still = VALENCIA_ENVELOPE_INPUT_STATUS.filter(
            (r) =>
                (r.zones.includes('ENS') || r.zones.includes('EDA') || r.zones.includes('*'))
                // `engineering` is OURS and needs no external answer, so it does not gate the
                // question "is `altura` the only thing we are WAITING on?" — but it is reported
                // separately by the caller, never silently dropped.
                && (r.status === 'external-authority' || r.status === 'unread-ordinance')
                && r.input !== 'maxHeight_m / maxFloors',
        );
        span.setAttribute('stillMissingCount', still.length);
        span.setAttribute('resultFields', 'inputs');
        span.setStatus({ code: SpanStatusCode.OK });
        return still;
    } finally {
        span.end();
    }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 4 — THE HERITAGE INTEGRATION SEAM
// ══════════════════════════════════════════════════════════════════════════════════════════════════

/** Inputs to the heritage constraint. Both height fields are nullable and both may be unknown. */
export interface ValenciaHeritageConstraintInput {
    readonly disposition: ValenciaHeritageDisposition;
    /** The base-ordinance maximum, once `altura` is authoritatively defined. `null` until then. */
    readonly candidateMaxHeightM?: number | null;
    /** The heritage regime's own maximum, once the gated layers are reachable. `null` until then. */
    readonly heritageMaxHeightM?: number | null;
}

/** The outcome of applying heritage to a candidate envelope. */
export type ValenciaHeritageConstraintOutcome =
    | { readonly kind: 'refuse'; readonly refusal: EnvelopeRefusal }
    | { readonly kind: 'constrained'; readonly maxHeightM: number; readonly boundBy: 'heritage' | 'base-ordinance' };

/**
 * Apply the heritage overlay to a candidate envelope — **the seam, built ahead of the data.**
 *
 * Founder ruling R3, 2026-08-02: *"Heritage is a legal overlay. It should constrain envelopes after
 * the base ordinance is known… heritage available → constrain; heritage unavailable → refuse where
 * heritage may apply. **Never ignore heritage.**"*
 *
 * ⚠⚠ **HERITAGE ONLY EVER REDUCES.** The constrained result is `min(base, heritage)` and there is no
 * branch that can raise a height. That is L-616's ratified rule — a SOLID must intersect ALL derived
 * constraints — and the error Córdoba spent a day un-fabricating.
 *
 * **TODAY THIS ALWAYS REFUSES**, because `VALENCIA_HERITAGE_DATA_AVAILABLE` is `false` and no
 * `candidateMaxHeightM` exists while `altura` is unresolved. That is the point: the seam is built, so
 * *"heritage access obtained"* becomes a DATA change (pass `heritageMaxHeightM`) rather than an
 * engineering project.
 *
 * PURE; never throws. OTel span `pryzm.zoning.applyValenciaHeritageConstraint` (P8).
 */
export function applyValenciaHeritageConstraint(
    input: ValenciaHeritageConstraintInput,
): ValenciaHeritageConstraintOutcome {
    const span = tracer.startSpan('pryzm.zoning.applyValenciaHeritageConstraint');
    try {
        const { disposition, candidateMaxHeightM, heritageMaxHeightM } = input;
        const base = typeof candidateMaxHeightM === 'number' && Number.isFinite(candidateMaxHeightM)
            && candidateMaxHeightM > 0 ? candidateMaxHeightM : null;
        const heritage = typeof heritageMaxHeightM === 'number' && Number.isFinite(heritageMaxHeightM)
            && heritageMaxHeightM > 0 ? heritageMaxHeightM : null;

        // 1. No base envelope ⇒ nothing to constrain. (Today: always, `altura` is unresolved.)
        // 2. Heritage MAY apply and we cannot see it ⇒ refuse. Never publish through an unknown.
        // 3. Heritage APPLIES and we do not hold its limit ⇒ refuse: we know it binds, not by how much.
        if (base === null || disposition === 'may-apply-unknown' || (disposition === 'applies' && heritage === null)) {
            const outcome: ValenciaHeritageConstraintOutcome = {
                kind: 'refuse',
                refusal: valenciaHeritageRefusal(disposition),
            };
            span.setAttribute('outcome', 'refuse');
            span.setAttribute('disposition', disposition);
            span.setAttribute('hasBase', base !== null);
            span.setAttribute('hasHeritageLimit', heritage !== null);
            span.setAttribute('resultFields', 'refusal');
            span.setStatus({ code: SpanStatusCode.OK });
            return outcome;
        }

        // 4. Heritage applies AND we hold its limit ⇒ the stricter of the two. Downward only.
        const maxHeightM = heritage !== null ? Math.min(base, heritage) : base;
        const boundBy = heritage !== null && heritage < base ? 'heritage' : 'base-ordinance';
        span.setAttribute('outcome', 'constrained');
        span.setAttribute('boundBy', boundBy);
        span.setAttribute('resultFields', 'maxHeightM,boundBy');
        span.setStatus({ code: SpanStatusCode.OK });
        return { kind: 'constrained', maxHeightM, boundBy };
    } finally {
        span.end();
    }
}
