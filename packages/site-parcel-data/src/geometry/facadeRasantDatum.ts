// §FACADE-RASANT-DATUM (L-584) — the height datum, measured where the ordinance says to measure it.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// THE DEFECT THIS EXISTS TO FIX IS A LEGAL ONE, NOT A RENDERING ONE
// ═════════════════════════════════════════════════════════════════════════════════════════════
// Today PRYZM takes ONE terrain sample, at the parcel-boundary CENTROID, and seats the whole
// massing on it (`CesiumViewport.clampTerrainThenReplace` → `formaTerrainBaseHeight`). The PGM
// measures the *alçada reguladora* from the **rasant at the FAÇADE**, and it says so in an article
// that leaves nothing to interpretation. On any sloping street the two are different numbers, so
// the height we publish is not approximately wrong — it is measured from the wrong plane, which is
// a compliance defect. `docs/…/08019-barcelona/CLOSURE-REGISTER.md` #8 · `RATE.md` TERRAIN axis.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// §V7 — CLOSED. THE ORDINANCE **STATES** THE RULE, INCLUDING THE CORNER CASE.
// ═════════════════════════════════════════════════════════════════════════════════════════════
// This was carried as an open reading task ("V7 — which point does the ordinance measure FROM?",
// `findings/PHASE-3-DECIDING-PROBES.md`) on the assumption the answer might have to be
// CONSTRUCTED. It does not. **PGM-1976 Normes Urbanístiques, Art. 240 «Regles sobre determinació
// d'alçades»** answers every part of it, read verbatim from the primary text held in this repo
// (`docs/04-reference/jurisdictions/es/es-ct/08019-barcelona/PGM-NNUU-metropolitana.pdf`, Títol IV,
// Cap. 2n, Secc. 2a). Each rule below is transcribed, not paraphrased.
//
// ── Art. 240.1 — «Punt de referència per amidar l'alçada reguladora màxima» ────────────────────
//   «la determinació del punt de referència o punt d'origen per a l'amidament de l'alçada dependrà
//    de la RASANT DEL VIAL que serveixi de paràmetre regulador…»
//   a. «Si la rasant del carrer, PRESA A LA LÍNIA DE FAÇANA, presenta una diferència de nivells
//      entre l'extrem de la façana de cota major i el centre d'aquesta de menys de 0,60 m,
//      l'alçada reguladora màxima s'ha d'amidar AL CENTRE DE LA FAÇANA, a partir de la rasant de
//      la voravia en aquest punt.»
//   b. «Si la diferència de nivells és major de 0,60 m l'alçada reguladora màxima s'ha d'amidar a
//      partir d'un nivell situat a 0,60 m PER SOTA de la cota de l'extrem de la línia de façana de
//      cota major.»
//   c. «Quan l'aplicació d'aquesta regla doni lloc al fet que, en determinats punts de la façana,
//      la rasant de la voravia se situï a més de 3 m per dessota d'aquell punt d'aplicació de
//      l'altura reguladora, LA FAÇANA S'HAURÀ DE DIVIDIR EN ELS TRAMS NECESSARIS per tal que això
//      no s'esdevingui. A cada un dels trams, l'alçada reguladora s'haurà d'amidar d'acord amb les
//      regles anteriors, COM SI CADA TRAM FOS FAÇANA INDEPENDENT.»
//
// ── Art. 240.2 — one street front ──────────────────────────────────────────────────────────────
//   «L'alçada reguladora s'haurà d'amidar a la façana del solar o per cada tram independent en què
//    es divideixi per aplicació de les regles descrites a l'apartat anterior.»
//
// ── Art. 240.3 — ⭐ THE CORNER PARCEL. **STATED**, and stated in two branches. ─────────────────
//   a. «Si l'alçada és la mateixa a cada front de vial, caldrà aplicar el que es disposa al número
//      1 anterior, PERÒ OPERANT AMB EL CONJUNT DE LES FAÇANES DESENVOLUPADES COM SI FOS UNA DE
//      SOLA.»
//   b. «Si les alçades reguladores són diferents, les més grans es podran córrer pels carrers més
//      estrets adjacents, fins a una longitud màxima, comptada a partir de la cantonada o última
//      flexió del xamfrà o del punt de tangència amb l'alineació del vial de menor amplada en cas
//      d'acord corbat que, amb un LÍMIT MÀXIM DE 30 m, sigui la major de les dues següents: UN COP
//      I MIG l'amplada del carrer adjacent o la determinada per la intersecció sobre l'alineació
//      del vial de menor amplada, de la prolongació de la LÍNIA LÍMIT DE LA PROFUNDITAT EDIFICABLE
//      corresponent al carrer d'amplada major.»
//
// ── Art. 240.4 — two fronts that do NOT form a corner ──────────────────────────────────────────
//   «…l'edificació dels quals en cada frontal estigui separada de l'altre per l'espai lliure
//    interior d'illa, s'han de regular, pel que fa a l'alçada, COM SI ES TRACTÉS D'EDIFICIS
//    INDEPENDENTS.»
//
// ⇒ **So we never have to pick.** Where the plan speaks we obey it; where it needs an input we do
// not hold (240.3.b), we REFUSE and cite the article that would answer. A cited refusal naming the
// rule the user can read is a correct answer; a datum chosen because the plan looked ambiguous
// would not be.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ WHY THIS MODULE IS NOT WIRED INTO THE VIEWPORT IN THE SAME CHANGE
// ═════════════════════════════════════════════════════════════════════════════════════════════
// Probe **V8** measured the terrain we actually serve under Barcelona: median served vertex
// spacing **57.34 m**, median TIN edge **76.44 m**, source PNOA **MDT25** at 25 m native GSD, and
// **zero** samples inside a 1,000 × 20 m Eixample street. Nyquist for a 20 m street is ≤ 10 m.
// The Eixample centroid→façade distance is ~56.6 m — i.e. *the same cell*.
//
// Seating the massing on "per-façade" samples drawn from that surface would produce numbers that
// LOOK like a rasant and are a bilinear blend of the same two postings. It would close L-584
// **falsely**, which is worse than leaving it open. So this module ships with a hard
// `terrain-posting-too-coarse` refusal (`assertPostingResolves`) that the wiring MUST consult, and
// the wiring lands when the bake serves MDT05 (V8 §V8.6 — a two-value config change in the bake,
// owned elsewhere). **A refusal is the correct output until then.**
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// §CONTEXT-DATA-HONESTY — three values, never collapsed (L-422/457/467/469)
// ═════════════════════════════════════════════════════════════════════════════════════════════
//   • a sample that FAILED to resolve            → `z_m: null` → `terrain-not-sampled`
//   • terrain that resolved but CANNOT SEPARATE   → `terrain-posting-too-coarse`
//     the façade points
//   • a datum resolved from a bare-earth DTM      → resolved, with `provenance` recorded and a
//     rather than the kerb the article names        caveat attached — never silently promoted
// None of these is "ground level is 0". The existing viewport falls back to 0 on a failed sample,
// which makes "seated on real ground" indistinguishable from "seated on a fabricated zero".
//
// PURITY: L2-pure (C58 §1.9). No I/O, no clock, no THREE, no DOM. Terrain samples are INJECTED —
// this module decides what they mean, it does not fetch them.

import type { Pt } from '@pryzm/schemas';
import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('pryzm.zoning.geometry');

// ─────────────────────────────────────────────────────────────────────────────
// The article's own scalars. Transcribed; never tuned.
// ─────────────────────────────────────────────────────────────────────────────

/** Art. 240.1.a/b — the level difference that switches the datum from centre-of-façade to `high−0,60`. */
export const RASANT_CENTRE_TOLERANCE_M = 0.6;

/** Art. 240.1.c — no point of the pavement may sit more than this far below its tram's datum. */
export const RASANT_MAX_DROP_M = 3;

/**
 * Nyquist: a posting can only *resolve* a feature at least twice its spacing.
 *
 * ⚠ NOT A TUNING KNOB. It is why probe V8 vetoes running the façade-vs-centroid test on MDT25.
 */
export const RASANT_NYQUIST_FACTOR = 2;

// ─────────────────────────────────────────────────────────────────────────────
// Inputs
// ─────────────────────────────────────────────────────────────────────────────

/** Where the injected elevations came from. ⚠ Three different values; never defaulted. */
export type RasantProvenance =
    /** The kerb/pavement level the article actually names («la rasant de la voravia»). */
    | 'kerb-surveyed'
    /** A bare-earth DTM sampled at the façade line. Legally a PROXY for the kerb, not the kerb. */
    | 'dtm-bare-earth'
    /** A digital SURFACE model — includes buildings and canopy. Not a rasant at all. */
    | 'dsm-surface'
    /** Provenance not declared by the caller. Never assume the best case. */
    | 'unknown';

/** One elevation reading taken ON the façade line. */
export interface RasantSample {
    /** Distance from the façade's start, metres, monotonically increasing. */
    readonly s_m: number;
    /**
     * Ground elevation, metres. ⚠ `null` = THE SAMPLE DID NOT RESOLVE. It is not sea level, it is
     * not zero, and it must never be substituted with one.
     */
    readonly z_m: number | null;
}

/** One street front of the parcel — a parcel edge classified `front` (C19 §2.7). */
export interface FacadeFront {
    readonly id: string;
    /** Length of the façade line, metres. */
    readonly length_m: number;
    /** Rasant readings along the façade line, ordered by `s_m`. At least two are required. */
    readonly samples: readonly RasantSample[];
    /**
     * The *alçada reguladora* this front resolves to, metres — the output of
     * `resolveBcnAlcadaForZone` for the street this front faces. `null` when unresolved, which is
     * NOT the same as "the fronts have equal heights".
     */
    readonly regulatedHeight_m: number | null;
    /**
     * Does this front meet the NEXT front in the list at a *cantonada* or *xamfrà*?
     *
     * Art. 240.3 (corner) and Art. 240.4 (fronts separated by the interior-of-block free space) are
     * DIFFERENT rules with different outcomes, and only the caller's geometry knows which applies.
     */
    readonly formsCornerWithNext: boolean;
}

export interface RasantDatumOptions {
    readonly provenance: RasantProvenance;
    /**
     * Median spacing of the terrain source's independent postings, metres. Injected so the Nyquist
     * guard is measured against the surface actually served, not against an assumption.
     */
    readonly postingSpacing_m: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Outputs
// ─────────────────────────────────────────────────────────────────────────────

/** Which limb of Art. 240.1 produced a tram's datum. */
export type RasantRule = 'art-240-1-a' | 'art-240-1-b';

/** One *tram* of façade, in the article's sense — a stretch measured as an independent façade. */
export interface RasantTram {
    readonly frontId: string;
    readonly fromS_m: number;
    readonly toS_m: number;
    /** The origin plane for the *alçada reguladora* over this tram, metres. */
    readonly datum_m: number;
    readonly rule: RasantRule;
    /** Article the datum was measured under, for the trace. */
    readonly ordinanceRef: string;
}

export type RasantRefusalCode =
    /** At least one façade sample did not resolve. NOT "the ground is flat". */
    | 'terrain-not-sampled'
    /** The terrain cannot separate the points the article distinguishes (probe V8). */
    | 'terrain-posting-too-coarse'
    /** The parcel has no edge classified as a street front, so there is no façade line. */
    | 'no-front-edge'
    /** ⭐ The ordinance ANSWERS; PRYZM lacks an input its answer needs. A claim about us, not the law. */
    | 'derived-input-missing'
    /** We cannot tell WHICH limb of Art. 240.3 applies, because a regulated height is unresolved. */
    | 'regulated-height-unknown';

export interface RasantRefusal {
    readonly code: RasantRefusalCode;
    readonly headline: string;
    readonly detail: string;
    /** The article the user can read. Never null — a refusal without a citation is a shrug. */
    readonly ordinanceRef: string;
    /** Verbatim, from the primary text. */
    readonly quote: string;
    /**
     * `true` only when the ORDINANCE is what stops us. `false` when the ordinance answers and PRYZM
     * is the one missing something (L-616 / Murcia §R-7: never attribute our gap to the law).
     */
    readonly legallyGrounded: boolean;
}

export type RasantDatumResult =
    | {
          readonly ok: true;
          /** One or more trams; ≥2 whenever Art. 240.1.c forced a division. */
          readonly trams: readonly RasantTram[];
          /** Which Art. 240 case was applied. */
          readonly rule: 'art-240-2' | 'art-240-3-a' | 'art-240-4';
          readonly provenance: RasantProvenance;
          /** Honest qualifications on a resolved answer. Empty is a real value here. */
          readonly caveats: readonly string[];
      }
    | { readonly ok: false; readonly refusal: RasantRefusal };

const ART_240 = 'PGM-1976, Normes Urbanístiques, Títol IV, Cap. 2n, Secc. 2a, Art. 240 «Regles sobre determinació d\'alçades»';

const Q_240_1 =
    '«Si la rasant del carrer, presa a la línia de façana, presenta una diferència de nivells entre ' +
    "l'extrem de la façana de cota major i el centre d'aquesta de menys de 0,60 m, l'alçada " +
    "reguladora màxima s'ha d'amidar al centre de la façana, a partir de la rasant de la voravia en " +
    'aquest punt.»';

const Q_240_3_B =
    "«Si les alçades reguladores són diferents, les més grans es podran córrer pels carrers més " +
    "estrets adjacents, fins a una longitud màxima, comptada a partir de la cantonada o última " +
    "flexió del xamfrà o del punt de tangència amb l'alineació del vial de menor amplada … que, amb " +
    'un límit màxim de 30 m, sigui la major de les dues següents: un cop i mig l\'amplada del carrer ' +
    "adjacent o la determinada per la intersecció sobre l'alineació del vial de menor amplada, de la " +
    'prolongació de la línia límit de la profunditat edificable corresponent al carrer d\'amplada major.»';

// ─────────────────────────────────────────────────────────────────────────────
// 1 — where to sample: the façade LINE, not the centroid
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The points at which a caller must sample terrain to measure a façade's rasant: along the façade
 * line itself, at `spacing_m` intervals, **always including both ends and the centre** because
 * Art. 240.1.a/b names exactly those three.
 *
 * ⚠ THE ENDS AND THE CENTRE ARE NOT OPTIONAL. A uniform grid that misses them cannot evaluate the
 * article's own test, however dense it is.
 *
 * Pure. OTel span `pryzm.rasant.facadeSamplePoints` (P8).
 *
 * @param a façade line start, scene-XZ metres
 * @param b façade line end, scene-XZ metres
 * @param spacing_m requested sample spacing; clamped to ≥ 0.5 m
 */
export function facadeSamplePoints(a: Pt, b: Pt, spacing_m: number): { point: Pt; s_m: number }[] {
    const span = tracer.startSpan('pryzm.rasant.facadeSamplePoints');
    try {
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const len = Math.hypot(dx, dz);
        span.setAttribute('facadeLength_m', len);
        if (!(len > 0)) {
            span.setAttribute('resultFields', 'degenerate');
            span.setStatus({ code: SpanStatusCode.OK });
            return [{ point: { x: a.x, z: a.z }, s_m: 0 }];
        }
        const step = Math.max(0.5, spacing_m);
        const sSet = new Set<number>([0, len / 2, len]);
        for (let s = step; s < len; s += step) sSet.add(Number(s.toFixed(4)));
        const ss = [...sSet].sort((p, q) => p - q);
        span.setAttribute('sampleCount', ss.length);
        span.setStatus({ code: SpanStatusCode.OK });
        return ss.map((s) => ({
            point: { x: a.x + (dx * s) / len, z: a.z + (dz * s) / len },
            s_m: s,
        }));
    } finally {
        span.end();
    }
}

/**
 * Can a terrain of this posting *resolve* a feature of this size? Nyquist, nothing more.
 *
 * ⚠ THIS IS THE PROBE-V8 VETO IN CODE. Barcelona's served terrain posts at ~57 m; an Eixample
 * façade-to-centroid distance is ~57 m. Sampling "per façade" on that surface returns the same
 * blended value at both points and would close L-584 with an artefact.
 *
 * Pure. OTel span `pryzm.rasant.assertPostingResolves` (P8).
 */
export function assertPostingResolves(postingSpacing_m: number, featureSize_m: number): boolean {
    const span = tracer.startSpan('pryzm.rasant.assertPostingResolves');
    try {
        span.setAttribute('postingSpacing_m', postingSpacing_m);
        span.setAttribute('featureSize_m', featureSize_m);
        const ok =
            Number.isFinite(postingSpacing_m) &&
            postingSpacing_m > 0 &&
            Number.isFinite(featureSize_m) &&
            featureSize_m > 0 &&
            postingSpacing_m * RASANT_NYQUIST_FACTOR <= featureSize_m;
        span.setAttribute('resultFields', ok ? 'resolves' : 'too-coarse');
        span.setStatus({ code: SpanStatusCode.OK });
        return ok;
    } finally {
        span.end();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2 — Art. 240.1 over one continuous run of samples
// ─────────────────────────────────────────────────────────────────────────────

interface Reading { readonly s: number; readonly z: number }

/** Elevation at parameter `s`, linearly interpolated between the two bracketing readings. */
function zAt(rs: readonly Reading[], s: number): number {
    const first = rs[0]!;
    const last = rs[rs.length - 1]!;
    if (s <= first.s) return first.z;
    if (s >= last.s) return last.z;
    for (let i = 1; i < rs.length; i++) {
        const lo = rs[i - 1]!;
        const hi = rs[i]!;
        if (s <= hi.s) {
            const t = hi.s === lo.s ? 0 : (s - lo.s) / (hi.s - lo.s);
            return lo.z + t * (hi.z - lo.z);
        }
    }
    return last.z;
}

/**
 * Art. 240.1.a/b applied to one run: the datum, and which limb produced it.
 *
 * «diferència de nivells entre l'extrem de la façana de cota major i el centre d'aquesta» — the
 * comparison is HIGHEST END vs CENTRE, not end vs end. Reading it as end-vs-end is the obvious
 * mis-transcription and it gives a different datum on any concave or convex street profile.
 */
function datumForRun(rs: readonly Reading[]): { datum_m: number; rule: RasantRule } {
    const first = rs[0]!;
    const last = rs[rs.length - 1]!;
    const highestEnd = Math.max(first.z, last.z);
    const centre = zAt(rs, (first.s + last.s) / 2);
    const diff = highestEnd - centre;
    // ⚠ THE EPSILON IS NOT A FUDGE. «0,60 m» is a decimal the article states exactly; binary
    // floating point cannot hold it, so a difference the surveyor intends AS 0,60 arrives here as
    // 0.5999999999999996 and would silently take limb (a) — the opposite of «menys de 0,60». The
    // epsilon makes the article's own boundary decide the branch instead of IEEE-754 rounding.
    return diff < RASANT_CENTRE_TOLERANCE_M - 1e-9
        ? { datum_m: centre, rule: 'art-240-1-a' }
        : { datum_m: highestEnd - RASANT_CENTRE_TOLERANCE_M, rule: 'art-240-1-b' };
}

/** Does every reading in the run sit within 3 m below the run's own datum? (Art. 240.1.c) */
function runSatisfiesDrop(rs: readonly Reading[], datum_m: number): boolean {
    for (const r of rs) if (datum_m - r.z > RASANT_MAX_DROP_M) return false;
    return true;
}

/**
 * Divide a run into the *trams necessaris* of Art. 240.1.c, each measured «com si cada tram fos
 * façana independent».
 *
 * Greedy-longest and therefore deterministic: extend a tram while it still satisfies the 3 m rule
 * *under its own recomputed datum*, cut at the last index that did, and start the next tram there.
 * Trams share their cut reading, so the façade is covered without gaps.
 *
 * Returns `null` when even a two-reading tram cannot satisfy the rule — which is not a legal
 * outcome but a SAMPLING one: the readings are too far apart to place a compliant tram between
 * them. The caller turns that into `terrain-posting-too-coarse`, never into a datum.
 */
function splitIntoTrams(rs: readonly Reading[]): { from: number; to: number; datum_m: number; rule: RasantRule }[] | null {
    const out: { from: number; to: number; datum_m: number; rule: RasantRule }[] = [];
    let i = 0;
    // Bounded by the reading count: every iteration advances `i` by ≥1.
    while (i < rs.length - 1) {
        let best = -1;
        let bestDatum = 0;
        let bestRule: RasantRule = 'art-240-1-a';
        for (let j = i + 1; j < rs.length; j++) {
            const run = rs.slice(i, j + 1);
            const d = datumForRun(run);
            if (runSatisfiesDrop(run, d.datum_m)) {
                best = j;
                bestDatum = d.datum_m;
                bestRule = d.rule;
            } else {
                break;
            }
        }
        if (best < 0) return null;
        out.push({ from: rs[i]!.s, to: rs[best]!.s, datum_m: bestDatum, rule: bestRule });
        i = best;
    }
    return out.length > 0 ? out : null;
}

function refuse(
    code: RasantRefusalCode,
    headline: string,
    detail: string,
    quote: string,
    legallyGrounded: boolean,
): RasantDatumResult {
    return { ok: false, refusal: { code, headline, detail, ordinanceRef: ART_240, quote, legallyGrounded } };
}

/** Validate + narrow one front's samples, or say precisely what is wrong with them. */
function readingsFor(front: FacadeFront, opts: RasantDatumOptions): Reading[] | RasantDatumResult {
    if (front.samples.length < 2) {
        return refuse(
            'terrain-not-sampled',
            `Front ${front.id}: fewer than two rasant readings on the façade line.`,
            'Art. 240.1 compares the level at the ENDS of the façade line with the level at its CENTRE. ' +
                'With fewer than two readings that comparison cannot be made, and PRYZM will not substitute ' +
                'a single value for it — a one-point datum is exactly the L-584 defect.',
            Q_240_1,
            false,
        );
    }
    if (front.samples.some((s) => s.z_m === null || !Number.isFinite(s.z_m))) {
        return refuse(
            'terrain-not-sampled',
            `Front ${front.id}: at least one rasant reading did not resolve.`,
            'The terrain service returned no elevation for a point on the façade line. ⚠ That is NOT a ' +
                'ground level of zero and NOT flat ground — it is an absent measurement, and seating a ' +
                'building on a fabricated zero is indistinguishable, on screen, from seating it on real ' +
                'ground. PRYZM publishes no datum here.',
            Q_240_1,
            false,
        );
    }
    if (!assertPostingResolves(opts.postingSpacing_m, front.length_m)) {
        return refuse(
            'terrain-posting-too-coarse',
            `Front ${front.id}: the terrain cannot resolve a ${front.length_m.toFixed(1)} m façade.`,
            `The terrain posts independent heights every ~${opts.postingSpacing_m.toFixed(1)} m; resolving a ` +
                `${front.length_m.toFixed(1)} m façade needs ≤ ${(front.length_m / RASANT_NYQUIST_FACTOR).toFixed(1)} m ` +
                '(Nyquist). Every reading along this façade would be a blend of the same postings, so a ' +
                '"per-façade" datum computed from it would look measured and be an artefact — the exact ' +
                'error probe V8 vetoed. PRYZM refuses rather than close L-584 falsely.',
            Q_240_1,
            false,
        );
    }
    const rs = front.samples
        .map((s) => ({ s: s.s_m, z: s.z_m as number }))
        .sort((a, b) => a.s - b.s);
    return rs;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3 — the public resolver
// ─────────────────────────────────────────────────────────────────────────────

function caveatsFor(provenance: RasantProvenance): string[] {
    switch (provenance) {
        case 'kerb-surveyed':
            return [];
        case 'dtm-bare-earth':
            return [
                'Art. 240.1.a measures «a partir de la rasant de la VORAVIA» — the finished pavement. ' +
                    'These readings are a bare-earth DTM sampled on the façade line: a PROXY for the kerb, ' +
                    'not the kerb. The difference is the pavement build-up and any local re-grading.',
            ];
        case 'dsm-surface':
            return [
                '⚠ These readings come from a SURFACE model, which includes buildings and canopy. That is ' +
                    'not a rasant at any point where anything stands on the ground. Treat this datum as ' +
                    'indicative only.',
            ];
        case 'unknown':
            return [
                '⚠ The caller did not declare where these elevations came from. An undeclared provenance is ' +
                    'not a kerb survey and must not be reported as one.',
            ];
    }
}

/**
 * Resolve the *alçada reguladora* datum for ONE street front — Art. 240.2 with Art. 240.1's rules,
 * including the Art. 240.1.c division into *trams*.
 *
 * Pure; deterministic. OTel span `pryzm.rasant.resolveFacadeRasantDatum` (P8).
 */
export function resolveFacadeRasantDatum(
    front: FacadeFront,
    opts: RasantDatumOptions,
): RasantDatumResult {
    const span = tracer.startSpan('pryzm.rasant.resolveFacadeRasantDatum');
    try {
        span.setAttribute('frontId', front.id);
        span.setAttribute('facadeLength_m', front.length_m);
        span.setAttribute('provenance', opts.provenance);
        const rs = readingsFor(front, opts);
        if (!Array.isArray(rs)) {
            span.setAttribute('resultFields', `refusal:${(rs as { refusal: RasantRefusal }).refusal.code}`);
            span.setStatus({ code: SpanStatusCode.OK });
            return rs as RasantDatumResult;
        }
        const parts = splitIntoTrams(rs);
        if (!parts) {
            span.setAttribute('resultFields', 'refusal:terrain-posting-too-coarse');
            span.setStatus({ code: SpanStatusCode.OK });
            return refuse(
                'terrain-posting-too-coarse',
                `Front ${front.id}: no compliant tram can be placed between adjacent readings.`,
                'Art. 240.1.c requires the façade to be divided until no point of the pavement sits more ' +
                    'than 3 m below its tram\'s datum. Between two neighbouring readings here the drop still ' +
                    'exceeds 3 m, so the division the article requires falls between samples. Sample the ' +
                    'façade line more finely; PRYZM will not report a non-compliant datum.',
                Q_240_1,
                false,
            );
        }
        span.setAttribute('resultFields', 'trams');
        span.setAttribute('tramCount', parts.length);
        span.setStatus({ code: SpanStatusCode.OK });
        return {
            ok: true,
            rule: 'art-240-2',
            provenance: opts.provenance,
            caveats: caveatsFor(opts.provenance),
            trams: parts.map((p) => ({
                frontId: front.id,
                fromS_m: p.from,
                toS_m: p.to,
                datum_m: p.datum_m,
                rule: p.rule,
                ordinanceRef: `${ART_240}, ap. 1.${p.rule === 'art-240-1-a' ? 'a' : 'b'} i ap. 2`,
            })),
        };
    } finally {
        span.end();
    }
}

/**
 * Resolve the datum for a WHOLE PARCEL, dispatching on Art. 240.2 / 240.3 / 240.4.
 *
 * ⭐ **THE CORNER-PARCEL ANSWER, AND IT IS THE ORDINANCE'S OWN.**
 *
 * - Two fronts that do NOT meet at a corner (Art. 240.4) → resolved **independently**, one set of
 *   trams per front. The plan says «com si es tractés d'edificis independents».
 * - A corner or *xamfrà* where the regulated heights are **the same** (Art. 240.3.a) → the fronts
 *   are concatenated into ONE developed façade and Art. 240.1 is applied to that whole, «operant
 *   amb el conjunt de les façanes desenvolupades com si fos una de sola». Note what this means in
 *   practice: the datum is generally NOT the same as either façade's own, because the ends of the
 *   *combined* line are the far ends of the two streets.
 * - A corner where the regulated heights **differ** (Art. 240.3.b) → the plan answers, and its
 *   answer needs the *profunditat edificable* limit line of the wider street, the *última flexió*
 *   of the xamfrà (or the tangency point on a curved junction) and the adjacent street width.
 *   ⚠ PRYZM does not hold that geometry, so this **REFUSES with the article quoted**. It is
 *   `legallyGrounded: false` on purpose: the ordinance is not the thing that is missing — we are.
 *
 * Pure; deterministic. OTel span `pryzm.rasant.resolveParcelRasantDatum` (P8).
 */
export function resolveParcelRasantDatum(
    fronts: readonly FacadeFront[],
    opts: RasantDatumOptions,
): RasantDatumResult {
    const span = tracer.startSpan('pryzm.rasant.resolveParcelRasantDatum');
    try {
        span.setAttribute('frontCount', fronts.length);
        span.setAttribute('provenance', opts.provenance);

        if (fronts.length === 0) {
            span.setAttribute('resultFields', 'refusal:no-front-edge');
            span.setStatus({ code: SpanStatusCode.OK });
            return refuse(
                'no-front-edge',
                'This parcel has no edge classified as a street front, so it has no façade line.',
                'Art. 240 measures the height from the rasant «presa a la línia de façana». Without a ' +
                    'classified front edge there is no façade line to take it at. ⚠ This is a statement about ' +
                    "PRYZM's edge classification, not about the parcel — the parcel certainly has a frontage.",
                Q_240_1,
                false,
            );
        }

        if (fronts.length === 1) {
            const r = resolveFacadeRasantDatum(fronts[0]!, opts);
            span.setAttribute('resultFields', r.ok ? 'art-240-2' : `refusal:${r.refusal.code}`);
            span.setStatus({ code: SpanStatusCode.OK });
            return r;
        }

        const corner = fronts.some((f) => f.formsCornerWithNext);

        // ── Art. 240.4 — separated by the interior-of-block free space: independent buildings. ──
        if (!corner) {
            const trams: RasantTram[] = [];
            const caveats = new Set<string>(caveatsFor(opts.provenance));
            for (const f of fronts) {
                const r = resolveFacadeRasantDatum(f, opts);
                if (!r.ok) {
                    span.setAttribute('resultFields', `refusal:${r.refusal.code}`);
                    span.setStatus({ code: SpanStatusCode.OK });
                    return r;
                }
                trams.push(...r.trams);
                for (const c of r.caveats) caveats.add(c);
            }
            span.setAttribute('resultFields', 'art-240-4');
            span.setAttribute('tramCount', trams.length);
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: true, rule: 'art-240-4', provenance: opts.provenance, caveats: [...caveats], trams };
        }

        // ── Art. 240.3 — cantonada / xamfrà. Which limb? ──
        if (fronts.some((f) => f.regulatedHeight_m === null)) {
            span.setAttribute('resultFields', 'refusal:regulated-height-unknown');
            span.setStatus({ code: SpanStatusCode.OK });
            return refuse(
                'regulated-height-unknown',
                'Corner parcel: PRYZM cannot tell which limb of Art. 240.3 applies.',
                'Art. 240.3 splits on whether the *alçada reguladora* is the SAME on each street front ' +
                    '(240.3.a) or DIFFERENT (240.3.b), and the two limbs give different datums. At least one ' +
                    'front here has no resolved regulated height, so the test cannot be run. ⚠ An unresolved ' +
                    'height is not an equal height — assuming 240.3.a because the comparison failed would ' +
                    'silently pick the branch that happens to be computable.',
                '«a. Si l\'alçada és la mateixa a cada front de vial… b. Si les alçades reguladores són diferents…»',
                false,
            );
        }

        const heights = fronts.map((f) => f.regulatedHeight_m as number);
        const allEqual = heights.every((h) => Math.abs(h - heights[0]!) < 1e-9);

        if (!allEqual) {
            span.setAttribute('resultFields', 'refusal:derived-input-missing');
            span.setStatus({ code: SpanStatusCode.OK });
            return refuse(
                'derived-input-missing',
                'Corner parcel with DIFFERENT regulated heights — Art. 240.3.b answers this, and PRYZM ' +
                    'does not hold the geometry its answer needs.',
                'The plan is not silent here and PRYZM will not choose for it. Art. 240.3.b lets the greater ' +
                    'height run along the narrower adjacent street for a length measured from the corner, the ' +
                    'last flexion of the xamfrà, or the point of tangency on a curved junction — capped at ' +
                    '30 m, and equal to the GREATER of (i) 1.5 × the adjacent street width and (ii) the point ' +
                    'where the prolongation of the *profunditat edificable* limit line of the WIDER street ' +
                    'meets the narrower street\'s alignment. Beyond that point the remainder takes its own ' +
                    'street\'s height «com si l\'esmentada resta constituís una unitat independent». PRYZM ' +
                    'holds neither the xamfrà flexion/tangency point nor the profunditat-edificable ' +
                    'prolongation for this junction, so it publishes no datum and no height for this parcel. ' +
                    '⚠ Reading the ordinance is not the blocker — the geometry is.',
                Q_240_3_B,
                false,
            );
        }

        // ── Art. 240.3.a — «operant amb el conjunt de les façanes desenvolupades com si fos una de sola». ──
        // The fronts are laid end to end into a single developed façade, and Art. 240.1 is applied
        // to THAT. ⚠ The combined run's ENDS are the far ends of the two streets, so the datum is
        // generally not either façade's own — which is the whole point of the article.
        const developed: Reading[] = [];
        let offset = 0;
        for (const f of fronts) {
            const rs = readingsFor(f, opts);
            if (!Array.isArray(rs)) {
                span.setAttribute('resultFields', `refusal:${(rs as { refusal: RasantRefusal }).refusal.code}`);
                span.setStatus({ code: SpanStatusCode.OK });
                return rs as RasantDatumResult;
            }
            for (const r of rs) {
                // The shared corner reading is not duplicated — it is one point on one line.
                if (developed.length > 0 && Math.abs(offset + r.s - developed[developed.length - 1]!.s) < 1e-9) continue;
                developed.push({ s: offset + r.s, z: r.z });
            }
            offset += f.length_m;
        }

        const parts = splitIntoTrams(developed);
        if (!parts) {
            span.setAttribute('resultFields', 'refusal:terrain-posting-too-coarse');
            span.setStatus({ code: SpanStatusCode.OK });
            return refuse(
                'terrain-posting-too-coarse',
                'Corner parcel: no compliant tram can be placed on the developed façade.',
                'Art. 240.3.a develops the two fronts as one façade and then applies Art. 240.1.c to it. ' +
                    'Between two neighbouring readings on that developed line the drop still exceeds 3 m, so ' +
                    'the required division falls between samples. Sample the façade lines more finely.',
                Q_240_1,
                false,
            );
        }

        // Map each tram of the developed façade back onto the front it starts in, so a consumer can
        // still seat geometry per front.
        const bounds: { id: string; from: number; to: number }[] = [];
        let acc = 0;
        for (const f of fronts) {
            bounds.push({ id: f.id, from: acc, to: acc + f.length_m });
            acc += f.length_m;
        }
        const frontIdAt = (s: number): string =>
            bounds.find((b) => s >= b.from && s < b.to)?.id ?? bounds[bounds.length - 1]!.id;

        span.setAttribute('resultFields', 'art-240-3-a');
        span.setAttribute('tramCount', parts.length);
        span.setStatus({ code: SpanStatusCode.OK });
        return {
            ok: true,
            rule: 'art-240-3-a',
            provenance: opts.provenance,
            caveats: [
                ...caveatsFor(opts.provenance),
                'Art. 240.3.a — the street fronts were developed as a SINGLE façade and the datum measured ' +
                    'over the whole. It is generally not the datum either front would have on its own.',
            ],
            trams: parts.map((p) => ({
                frontId: frontIdAt(p.from),
                fromS_m: p.from,
                toS_m: p.to,
                datum_m: p.datum_m,
                rule: p.rule,
                ordinanceRef: `${ART_240}, ap. 3.a (amb ap. 1.${p.rule === 'art-240-1-a' ? 'a' : 'b'})`,
            })),
        };
    } finally {
        span.end();
    }
}
