// VALIDATION — the four rules that stand between the `spacm_*` corpus and a fabricated envelope.
//
// ⚠ EVERY RULE HERE IS BACKED BY A MEASURED COUNT FROM THE COMMITTED CENSUS
// (`tools/madrid-spacm-probe/out/05-analyse.log`). None is a defensive precaution; each one fires
// on real rows, and the count is quoted so a future author cannot delete it as speculative.
//
// PURE. No I/O, no clock. Every function is total and never throws.

// §MADRID-SPACM-PORT (L-681) — ported VERBATIM from `tools/madrid-envelope-engine/validate.ts`.
// Every rule below is still backed by the SAME committed census; the move added OTel spans (P8)
// and changed nothing else. See `esMadridSpacmSchema.ts` §MADRID-SPACM-P8 for the span policy.

import { trace } from '@opentelemetry/api';
import type { Parameter, Contradiction } from './esMadridSpacmSchema.js';
import { published, unknown, contradicted } from './esMadridSpacmSchema.js';

const _tracer = trace.getTracer('pryzm.zoning');

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// RULE 1 · ZERO IS A SENTINEL UNTIL PROVEN A MEASUREMENT
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Read a `spacm_*` numeric field.
 *
 * ⛔ **`0` AND `null` BOTH MEAN UNKNOWN, AND `0` IS THE DANGEROUS ONE** because it survives every
 * null check and then behaves like a determination. Measured on the full 93,839-row census:
 *
 * | field | non-null | of which literal `0` |
 * |---|---:|---:|
 * | `NM_RTR_FRNT` | 41,564 | **7,225** |
 * | `NM_RTR_LATL` | 41,710 | 3,256 |
 * | `NM_RTR_POST` | 41,088 | 1,518 |
 * | `NM_FDO_MX_ED` | 12,448 | 1,182 |
 * | `NM_C_ED_ORD` | 35,996 | 238 |
 *
 * A zero front setback is a REAL and common ordinance (façade on the street line) — which is
 * exactly why this is hard. But the corpus does not distinguish *"the ordinance says build to the
 * line"* from *"nobody filled this cell in"*, and 7,225 of them cannot all be alignment zones in a
 * region whose fabric is overwhelmingly detached. ⇒ Under ADR-0287 the uncertainty changes the
 * legal outcome and there is no conservative branch, so `0` is read as UNKNOWN and the ALIGNMENT
 * grammar is reached through `NM_FDO_MX_ED` — a POSITIVE statement of buildable depth — never
 * through the absence of a setback.
 *
 * ⚠ The step-05 census itself counts "valid" as `non-null AND > 0` on these fields, so this
 * function and every published coverage figure for Madrid use the SAME definition. A validator
 * that disagreed with the measurement it is quoted beside would make both meaningless.
 */
export function readNumeric(
    raw: unknown,
    field: string,
    opts: { readonly min?: number; readonly max?: number } = {},
): Parameter {
    // P8 — emits `pryzm.zoning.madridSpacm.readNumeric`. The span WRAPS the untouched port rather
    // than re-indenting its seven return points, so the ported decision tree stays diff-clean.
    const span = _tracer.startSpan('pryzm.zoning.madridSpacm.readNumeric');
    try {
        const p = readNumericImpl(raw, field, opts);
        span.setAttribute('field', field);
        span.setAttribute('provenance', p.provenance);
        return p;
    } finally {
        span.end();
    }
}

function readNumericImpl(
    raw: unknown,
    field: string,
    opts: { readonly min?: number; readonly max?: number } = {},
): Parameter {
    if (raw === null || raw === undefined || raw === '') {
        return unknown(field, 'field is null/absent in the published row');
    }
    const n = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'));
    if (!Number.isFinite(n)) {
        return unknown(field, `field carried a non-numeric value ${JSON.stringify(raw)}`);
    }
    if (n === 0) {
        return unknown(field, 'value is literal 0 — a sentinel for "not recorded" in this corpus, '
            + 'not a measurement (7,225 zeros on NM_RTR_FRNT alone)');
    }
    if (n < 0) {
        return unknown(field, `value ${n} is negative — impossible for this dimension`);
    }
    if (opts.min !== undefined && n < opts.min) {
        return unknown(field, `value ${n} is below the plausible floor ${opts.min} for this dimension`);
    }
    if (opts.max !== undefined && n > opts.max) {
        return unknown(field, `value ${n} is above the plausible ceiling ${opts.max} for this dimension`);
    }
    return published(n, field);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// RULE 2 · `NM_OCP_MX` OUTSIDE 0–100 IS A NULL SUBSTITUTE
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * `NM_OCP_MX` is a maximum plot COVERAGE, i.e. a percentage. The census records
 * **`min 0.03 | p50 40 | max 300`** across 44,472 non-null rows.
 *
 * ⛔ **300 % COVERAGE IS NOT A COVERAGE.** A parcel cannot be more than fully covered, so a value
 * above 100 is the publisher storing a different quantity in this column — most likely a
 * *coeficiente de edificabilidad* (where 300 % = 3.0 m²/m² is entirely ordinary). Reading it as
 * coverage would clamp to 100 % and silently publish a full-plot footprint. Reading it as a FAR
 * would be us deciding what another body meant. **Both are determinations we may not make: the
 * value is of an UNKNOWN KIND (ADR-0270), and the honest output is `unknown`.**
 *
 * ⚠ 100 exactly is KEPT. Full coverage is lawful and common in *casco antiguo* fabric.
 */
export function readOccupationPct(raw: unknown, field = 'NM_OCP_MX'): Parameter {
    // P8 — emits `pryzm.zoning.madridSpacm.readOccupationPct`.
    const span = _tracer.startSpan('pryzm.zoning.madridSpacm.readOccupationPct');
    try {
        const out = readOccupationPctImpl(raw, field);
        span.setAttribute('field', field);
        span.setAttribute('provenance', out.provenance);
        return out;
    } finally {
        span.end();
    }
}

function readOccupationPctImpl(raw: unknown, field: string): Parameter {
    const p = readNumericImpl(raw, field);
    if (p.value === null) return p;
    if (p.value > 100) {
        return unknown(field, `value ${p.value} exceeds 100 % — a plot cannot be more than fully `
            + 'covered, so this column is carrying a quantity of a different KIND here (the census '
            + 'records values up to 300). Unknown, never clamped.');
    }
    return p;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// RULE 3 · HEIGHT AND STOREYS MUST NOT CONTRADICT
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * The plausible metres-per-storey band. Chosen to match the census's own contradiction test so the
 * validator and the measurement agree: *"metres-per-storey within [2.2, 5.0] : 43,955 (97.29 %) …
 * contradictory rows 1,224"*.
 *
 * The floor is a habitability minimum; the ceiling is generous enough to admit a *planta baja*
 * commercial storey plus structure without admitting an error.
 */
export const METRES_PER_STOREY_MIN = 2.2;
export const METRES_PER_STOREY_MAX = 5.0;

/** The outcome of cross-checking a height against a storey count. */
export interface HeightStoreyCheck {
    readonly height_m: Parameter;
    readonly storeys: Parameter;
    readonly contradiction: Contradiction | null;
    /** Metres per storey where both were present, else null. Recorded for the refusal card. */
    readonly metresPerStorey: number | null;
}

/**
 * Cross-check `NM_ALTURA` against `NM_N_PLTA`.
 *
 * ⛔⛔ **WHERE THEY CONTRADICT, BOTH ARE REFUSED. DO NOT AVERAGE. DO NOT SILENTLY PREFER ONE.**
 *
 * Measured: **1,224 rows of 45,179 with both fields positive imply an impossible storey height.**
 * The worst is not marginal — MAJADAHONDA *"VIVIENDA UNIFAMILIAR AISLADA"*, `NM_ALTURA=85` with
 * `NM_PLANTAS=2`, is **42.5 m per storey**: an 85-metre detached house.
 *
 * The temptation is to prefer `NM_N_PLTA` "because a storey count is harder to typo". That is a
 * hypothesis about the publisher's data entry, and acting on it would publish `2 × 3.5 = 7 m`
 * under a citation to a document that says 85. **The error is two-sided** — we cannot tell whether
 * the height or the count is the corrupted cell — and ADR-0287 is explicit that there is no
 * conservative-branch escape when the error is two-sided. So both parameters go to `contradicted`,
 * the row refuses with `parameters-contradict`, and the contradiction is REPORTED rather than
 * resolved.
 *
 * ⚠ A contradiction requires BOTH values. One present and one unknown is not a contradiction — it
 * is a single reading, and it stands.
 */
export function checkHeightAgainstStoreys(
    altura: Parameter,
    plantas: Parameter,
): HeightStoreyCheck {
    // P8 — emits `pryzm.zoning.madridSpacm.checkHeightAgainstStoreys`.
    const span = _tracer.startSpan('pryzm.zoning.madridSpacm.checkHeightAgainstStoreys');
    try {
        const out = checkHeightAgainstStoreysImpl(altura, plantas);
        span.setAttribute('contradicted', out.contradiction !== null);
        if (out.metresPerStorey !== null) span.setAttribute('metresPerStorey', out.metresPerStorey);
        return out;
    } finally {
        span.end();
    }
}

function checkHeightAgainstStoreysImpl(
    altura: Parameter,
    plantas: Parameter,
): HeightStoreyCheck {
    if (altura.value === null || plantas.value === null) {
        return { height_m: altura, storeys: plantas, contradiction: null, metresPerStorey: null };
    }
    const mps = altura.value / plantas.value;
    if (mps >= METRES_PER_STOREY_MIN && mps <= METRES_PER_STOREY_MAX) {
        return { height_m: altura, storeys: plantas, contradiction: null, metresPerStorey: mps };
    }
    const detail =
        `NM_ALTURA=${altura.value} m with NM_N_PLTA=${plantas.value} implies `
        + `${mps.toFixed(2)} m per storey, outside the plausible band `
        + `[${METRES_PER_STOREY_MIN}, ${METRES_PER_STOREY_MAX}]. The two published fields cannot `
        + 'both be true, and nothing in the corpus says which is wrong. Refusing both — preferring '
        + 'either would publish a number the ordinance\'s own other column contradicts.';
    return {
        height_m: contradicted('NM_ALTURA', detail),
        storeys: contradicted('NM_N_PLTA', detail),
        contradiction: { fields: ['NM_ALTURA', 'NM_N_PLTA'], detail },
        metresPerStorey: mps,
    };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// RULE 4 · PLAUSIBILITY BANDS PER DIMENSION
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Per-dimension plausible ranges, each derived from the census's own observed min/max so the band
 * excludes what the data shows to be corruption without excluding what it shows to be real.
 *
 * ⚠ These REJECT to `unknown`, they never clamp. Clamping would publish our ceiling under the
 * publisher's citation.
 */
/**
 * Apply a plausibility band to an ALREADY-read parameter.
 *
 * ⚠⚠ **THIS IS SPLIT FROM `readNumeric` FOR ONE REASON AND IT IS NOT STYLISTIC.** The MAJADAHONDA
 * row is `NM_ALTURA=85` with `NM_N_PLTA=2`. If the band ran first, 85 m would be rejected as
 * out-of-band and the record would say *"the height is implausible"* — which is TRUE and is the
 * WRONG FACT. The interesting, reportable, root-cause fact is that **two published columns
 * contradict each other**, and a reviewer who sees only "out of band" will go looking for a
 * transcription error in one field instead of distrusting both.
 *
 * ⇒ Order is: sentinel → **contradiction** → band. A test pins it (`adapter.test.ts` asserts the
 * contradiction detail contains `42.50`), because the correct order is invisible in the output
 * until you look for the reason rather than the refusal.
 */
export function applyBand(
    p: Parameter,
    band: { readonly min: number; readonly max: number },
): Parameter {
    // P8 — emits `pryzm.zoning.madridSpacm.applyBand`.
    const span = _tracer.startSpan('pryzm.zoning.madridSpacm.applyBand');
    try {
        const out = applyBandImpl(p, band);
        span.setAttribute('sourceField', p.sourceField ?? '');
        span.setAttribute('provenance', out.provenance);
        span.setAttribute('rejectedByBand', p.provenance !== out.provenance);
        return out;
    } finally {
        span.end();
    }
}

function applyBandImpl(
    p: Parameter,
    band: { readonly min: number; readonly max: number },
): Parameter {
    if (p.value === null) return p;
    if (p.value < band.min) {
        return unknown(p.sourceField, `value ${p.value} is below the plausible floor ${band.min} `
            + 'for this dimension');
    }
    if (p.value > band.max) {
        return unknown(p.sourceField, `value ${p.value} is above the plausible ceiling ${band.max} `
            + 'for this dimension');
    }
    return p;
}

export const BANDS = {
    /** Census: min 2.4, p50 7, max 85. 85 m is the MAJADAHONDA corruption; 60 m admits a tower. */
    height_m: { min: 2.2, max: 60 },
    /** Census: min 1, p50 2, max 14. */
    storeys: { min: 1, max: 40 },
    /** Census: min 2.5, p50 12, max 216. ⚠ 216 m of buildable depth is a block, not a parcel. */
    depth_m: { min: 2, max: 60 },
    /** Census: min 0.75, p50 3–4, max 50. */
    setback_m: { min: 0.5, max: 50 },
    /** Census: min 0.001, p50 0.6, max 58,601.75. ⚠ The max is a floorspace in a ratio column. */
    plotRatioFAR: { min: 0.01, max: 15 },
    /** Census: min 4, p50 8, max 700. */
    frontage_m: { min: 1, max: 200 },
} as const;
