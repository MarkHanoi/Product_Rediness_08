// §ES-MUNICIPAL-CODE-VOCABULARY — TWO FIVE-DIGIT VOCABULARIES THAT LOOK IDENTICAL AND ARE NOT.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE DEFECT THIS MODULE EXISTS TO MAKE IMPOSSIBLE
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Spain numbers its municipalities TWICE, with two different five-digit schemes that share a
// format and share a province prefix, so a value from one is INDISTINGUISHABLE from a value of the
// other by inspection, by regex, or by any runtime check that looks at the string alone:
//
//   • **INE** — Instituto Nacional de Estadística. The statistical/administrative code. Every
//     Spanish PLANNING service in this corpus keys on it: the AMB Refós publishes `CODI_INE`,
//     Catalonia's MUC keys on it, SIU's field is literally `ProvINE`.
//   • **DGC** — Dirección General del Catastro. The CADASTRAL code, used by Catastro and only by
//     Catastro. It is the odd one out, and it is the one this pipeline also touches, because
//     parcel GEOMETRY comes from Catastro while ordinance POLYGONS come from planning services.
//
// ⇒ **The boundary between the two vocabularies runs straight through this package.** A parcel is
//   fetched in one vocabulary's world and its zoning resolved in the other's.
//
// THREE MEASURED COLLISIONS (see `ES_MUNICIPAL_CODE_COLLISIONS`). Each is the same five digits
// naming two DIFFERENT municipalities, with nothing in the payload announcing which scheme it is
// in. `08196` is the dangerous one for this package specifically: its INE reading
// (Sant Andreu de la Barca) is INSIDE the AMB Refós extent and has published polygons, so a DGC
// `08196` leaking into an INE slot does not fail — it returns real, plausible, WRONG geometry for
// a municipality 40 km away. Nothing in this repo caught it; the existing guards passed cleanly.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE RULE, AND HOW IT IS ENFORCED HERE
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   **DGC only where Catastro requires it. INE everywhere else. An EXPLICIT conversion at the
//   boundary that FAILS LOUDLY.**
//
//   1. **The identifier is TYPE-DISTINGUISHED, never a bare string.** `IneCode` and `DgcCode` are
//      branded, so `tsc` REJECTS passing one where the other is expected. A bare `'08196'` cannot
//      cross the boundary at all — it is not assignable to either without going through a parser
//      that states which vocabulary it is reading. This is the whole point: the previous defect
//      was not a wrong value, it was an UNLABELLED one.
//   2. **The crosswalk has NO silent fallback.** PRYZM holds no INE↔DGC crosswalk table (it is not
//      published as open data in a form this repo has sourced), so `crosswalkMunicipalCode`
//      refuses `no-crosswalk-held` for every code — and refuses `ambiguous-collision` LOUDER for a
//      code in the collision register. It NEVER returns the input unchanged. "The digits usually
//      match" is true and is exactly the assumption that produced three collisions.
//   3. **The collision register is a KNOWN-ANSWER CONTROL**, not documentation. A code in it is a
//      code where identity-conversion is provably wrong, and `esMunicipalCode.test.ts` asserts the
//      refusal on each one.
//
// ⚠ WHAT THIS MODULE DOES NOT CLAIM. `ES_MUNICIPAL_CODE_COLLISIONS` is the set of collisions PRYZM
// has MEASURED, not the set that exists. Absence from it is not evidence of agreement — it is
// absence of a measurement, which is why the crosswalk refuses on codes that are not in it too
// (`no-crosswalk-held`), rather than treating "not known to collide" as "safe to pass through".
// That is the §CONTEXT-DATA-HONESTY rule applied to an identifier: a failure and an empty are the
// same value unless the code makes them different.
//
// PURITY: L2-pure (C58 §1.1/§1.9) — frozen data + total pure lookups. No I/O, no clock, no RNG.
// P8 — every exported function emits a span.
//
// Strategic context — C58 §1.5/§1.9, §CONTEXT-DATA-HONESTY, L-422/457/467/469 (failure vs empty).

import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('pryzm.zoning.es.municipalCode');

/**
 * A five-digit **INE** municipal code (Instituto Nacional de Estadística) — `PPMMM`, province then
 * municipality. The vocabulary every Spanish PLANNING service in this corpus publishes.
 *
 * ⚠ Branded. It is NOT `string`, and a `DgcCode` is NOT assignable to it. Obtain one only from
 * `parseIneCode` / `ineCodeLiteral`, so the vocabulary is stated at the point of entry.
 */
export type IneCode = string & { readonly __municipalCodeVocabulary: 'ine' };

/**
 * A five-digit **DGC** municipal code (Dirección General del Catastro) — the CADASTRAL vocabulary.
 * Used by Catastro, and by nothing else in this pipeline.
 *
 * ⚠ Branded, and deliberately NOT interchangeable with `IneCode` — see the header. The three
 * measured collisions are all cases where the same digits are valid in both and mean different
 * places.
 */
export type DgcCode = string & { readonly __municipalCodeVocabulary: 'dgc' };

/** Which of the two vocabularies a five-digit municipal code is written in. */
export type EsMunicipalCodeVocabulary = 'ine' | 'dgc';

/** Exactly five ASCII digits. Both vocabularies share this shape — which is the problem. */
const FIVE_DIGITS = /^\d{5}$/;

function isWellFormed(raw: unknown): raw is string {
    return typeof raw === 'string' && FIVE_DIGITS.test(raw);
}

/**
 * Read an untrusted value AS AN INE CODE. Returns `null` when it is not five digits — never
 * throws, never coerces, never pads.
 *
 * ⚠ Calling this is a STATEMENT that the source publishes INE (e.g. the AMB `CODI_INE` field, the
 * MUC, SIU's `ProvINE`). It performs no validation that the digits name a real municipality — that
 * is a data question this module cannot answer, and pretending otherwise would be the fabrication
 * this package exists to refuse.
 *
 * P8 — emits `pryzm.zoning.es.municipalCode.parseIne`.
 */
export function parseIneCode(raw: unknown): IneCode | null {
    const span = tracer.startSpan('pryzm.zoning.es.municipalCode.parseIne');
    try {
        const ok = isWellFormed(raw);
        span.setAttribute('wellFormed', ok);
        return ok ? (raw as IneCode) : null;
    } finally {
        span.end();
    }
}

/**
 * Read an untrusted value AS A DGC (Catastro) CODE. Returns `null` when it is not five digits.
 *
 * ⚠ Calling this is a STATEMENT that the source is Catastro. If you are reading a planning
 * service, you want `parseIneCode` — see the header, and see `08196`.
 *
 * P8 — emits `pryzm.zoning.es.municipalCode.parseDgc`.
 */
export function parseDgcCode(raw: unknown): DgcCode | null {
    const span = tracer.startSpan('pryzm.zoning.es.municipalCode.parseDgc');
    try {
        const ok = isWellFormed(raw);
        span.setAttribute('wellFormed', ok);
        return ok ? (raw as DgcCode) : null;
    } finally {
        span.end();
    }
}

/**
 * Brand a COMPILE-TIME LITERAL as an INE code, for the handful of places a code is written into
 * source (Barcelona's `08019`, test fixtures). Throws at module load on a malformed literal —
 * which is a typo in committed source, not a runtime condition, so a load-time throw is the only
 * failure mode that cannot be mistaken for a working query (the `packMap` argument).
 */
export function ineCodeLiteral(raw: string): IneCode {
    if (!isWellFormed(raw)) {
        throw new Error(
            `[site-parcel-data] "${raw}" is not a five-digit INE municipal code. This is a literal ` +
                `in committed source, so it is a typo, not a runtime condition.`,
        );
    }
    return raw as IneCode;
}

/** As `ineCodeLiteral`, for a Catastro (DGC) literal. */
export function dgcCodeLiteral(raw: string): DgcCode {
    if (!isWellFormed(raw)) {
        throw new Error(
            `[site-parcel-data] "${raw}" is not a five-digit DGC (Catastro) municipal code.`,
        );
    }
    return raw as DgcCode;
}

/** One measured case where the same five digits name two different municipalities. */
export interface EsMunicipalCodeCollision {
    /** The five digits, identical in both vocabularies. */
    readonly code: string;
    /** The municipality these digits name in the INE (planning) vocabulary. */
    readonly ineMunicipality: string;
    /** The municipality these digits name in the DGC (Catastro) vocabulary. */
    readonly dgcMunicipality: string;
    /** Why this particular collision is dangerous HERE, in one line. */
    readonly hazard: string;
}

/**
 * §ES-CODE-COLLISIONS — the collisions PRYZM has MEASURED. Three, as of 2026-08-02.
 *
 * ⚠ THIS IS A CONTROL, NOT A REFERENCE. Each row is a known-answer case where treating the two
 * vocabularies as one produces a confident wrong municipality. `esMunicipalCode.test.ts` asserts
 * that the crosswalk refuses every one of them, so a future author who "simplifies" the crosswalk
 * into an identity function fails CI on real data rather than shipping.
 *
 * ⚠ AND IT IS NOT EXHAUSTIVE. See the header: absence from this list is absence of a measurement.
 */
export const ES_MUNICIPAL_CODE_COLLISIONS: readonly EsMunicipalCodeCollision[] = Object.freeze([
    Object.freeze({
        code: '08196',
        ineMunicipality: 'Sant Andreu de la Barca',
        dgcMunicipality: 'Sant Andreu de Llavaneres',
        hazard:
            'The INE reading is INSIDE the AMB Refós extent and HAS published OV/QU polygons ' +
            '(measured live 2026-08-02), so a DGC 08196 arriving in an INE slot does not refuse — ' +
            'it returns real, plausible geometry for a municipality ~40 km away on the Maresme ' +
            'coast. Both are Barcelona province, so a province-prefix sanity check passes too.',
    }),
    Object.freeze({
        code: '46250',
        ineMunicipality: 'València',
        dgcMunicipality: 'Turís',
        hazard:
            'València is a registered PRYZM jurisdiction (`es-46250-valencia`, INE). A DGC 46250 ' +
            'would silently address a 6 000-inhabitant town instead of Spain’s third city.',
    }),
]);

/** Fast membership index over the collision register. */
const COLLIDING = new Set<string>(ES_MUNICIPAL_CODE_COLLISIONS.map((c) => c.code));

/**
 * Whether these five digits are a MEASURED collision — i.e. a code where the INE and DGC readings
 * provably name different municipalities.
 *
 * ⚠ `false` means "not measured to collide", NEVER "measured to agree". Do not use it to authorise
 * an identity conversion; use `crosswalkMunicipalCode`, which refuses either way.
 *
 * P8 — emits `pryzm.zoning.es.municipalCode.isColliding`.
 */
export function isKnownCollidingMunicipalCode(code: string): boolean {
    const span = tracer.startSpan('pryzm.zoning.es.municipalCode.isColliding');
    try {
        const hit = COLLIDING.has(code);
        span.setAttribute('code', code);
        span.setAttribute('colliding', hit);
        return hit;
    } finally {
        span.end();
    }
}

/** Why a vocabulary conversion refused. Closed vocabulary — these are operationally distinct. */
export type MunicipalCodeCrosswalkRefusal =
    /** The input was not five digits. */
    | 'malformed-code'
    /**
     * ⛔ The code is in `ES_MUNICIPAL_CODE_COLLISIONS`: the two vocabularies provably disagree
     * here, so passing the digits through would name the WRONG municipality. The loudest refusal.
     */
    | 'ambiguous-collision'
    /**
     * PRYZM holds no INE↔DGC crosswalk for this code. The honest default, and it is the answer for
     * every non-colliding code too — "the digits usually match" is not a crosswalk.
     */
    | 'no-crosswalk-held';

/** The result of a vocabulary conversion. There is no third state and no pass-through. */
export type MunicipalCodeCrosswalk<T> =
    | { readonly ok: true; readonly code: T }
    | { readonly ok: false; readonly reason: MunicipalCodeCrosswalkRefusal; readonly detail: string };

function refuse(
    reason: MunicipalCodeCrosswalkRefusal,
    detail: string,
): { ok: false; reason: MunicipalCodeCrosswalkRefusal; detail: string } {
    return { ok: false, reason, detail };
}

/**
 * §ES-VOCABULARY-BOUNDARY — convert a municipal code between the INE and DGC vocabularies.
 *
 * ⛔ **IT ALWAYS REFUSES TODAY, AND THAT IS THE CORRECT BEHAVIOUR.** PRYZM has sourced no INE↔DGC
 * crosswalk. This function exists so that the day some caller needs one, it gets a NAMED REFUSAL at
 * the boundary instead of a bare string that silently means the wrong municipality — which is
 * exactly how `08196` and `46250` got through. It is the interlock, not the converter.
 *
 * ⚠ DO NOT "FIX" THIS BY RETURNING THE INPUT. Identity is measurably wrong on at least three
 * codes, two of which sit inside jurisdictions PRYZM already ships. If you hold a real crosswalk,
 * add it as DATA and this function starts answering; until then an absent answer costs nothing and
 * a wrong municipality costs a fabricated legal claim about someone else's land.
 *
 * P8 — emits `pryzm.zoning.es.municipalCode.crosswalk`.
 */
export function crosswalkMunicipalCode(
    code: string,
    from: EsMunicipalCodeVocabulary,
    to: EsMunicipalCodeVocabulary,
): MunicipalCodeCrosswalk<IneCode | DgcCode> {
    const span = tracer.startSpan('pryzm.zoning.es.municipalCode.crosswalk');
    try {
        span.setAttribute('from', from);
        span.setAttribute('to', to);
        span.setAttribute('code', code);
        if (!isWellFormed(code)) {
            span.setAttribute('reason', 'malformed-code');
            return refuse(
                'malformed-code',
                `"${code}" is not a five-digit Spanish municipal code in either vocabulary.`,
            );
        }
        if (from === to) {
            // Not a conversion at all — hand back the same digits, branded for the vocabulary the
            // caller already declared. This is the ONE safe identity, because no boundary is
            // crossed. The cast is sound precisely BECAUSE `from === to`: the brand asserted is the
            // one the caller already holds. Any other branch reaching a cast would be the bug.
            span.setAttribute('reason', 'same-vocabulary');
            return { ok: true, code: code as IneCode | DgcCode };
        }
        const collision = ES_MUNICIPAL_CODE_COLLISIONS.find((c) => c.code === code);
        if (collision) {
            span.setAttribute('reason', 'ambiguous-collision');
            return refuse(
                'ambiguous-collision',
                `${code} is a MEASURED INE/DGC collision: INE ${code} = ${collision.ineMunicipality}, ` +
                    `DGC ${code} = ${collision.dgcMunicipality}. ${collision.hazard} Converting ` +
                    `${from}→${to} by passing the digits through would name the wrong municipality.`,
            );
        }
        span.setAttribute('reason', 'no-crosswalk-held');
        return refuse(
            'no-crosswalk-held',
            `PRYZM holds no INE↔DGC crosswalk, so it cannot convert ${code} from ${from} to ` +
                `${to}. Absence from ES_MUNICIPAL_CODE_COLLISIONS is absence of a MEASUREMENT, not ` +
                `evidence the two vocabularies agree here.`,
        );
    } finally {
        span.end();
    }
}
