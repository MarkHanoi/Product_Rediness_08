// Madrid (INE 28079) — PGOUM-97 rule pack for Normas Zonales 4, 5, 7, 8 and 9.
//
// ⚠⚠⚠ THIS FILE IS **NOT REGISTERED**, AND IT MUST NOT SELF-CERTIFY. Every number below was
// MACHINE-EXTRACTED and is `pipeline-extracted-unverified`. Registration + the render gate are the
// orchestrator's, and the render gate stays SHUT until a human signs
// `docs/04-reference/jurisdictions/es/es-md/28079-madrid/sources/VERIFICATION.md`. Transcribing an
// ordinance is a legal act; a pack cannot sign its own transcription.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// WHAT THIS IS
// ------------
// The Compendio 2025 de las NNUU del PGOUM-97 (consolidated 24-09-2025, 626 pp, born-digital, no
// OCR) states, per Norma Zonal and per grado, the *edificabilidad*, *altura*, *ocupación* and
// *retranqueos* that govern a Madrid parcel. `tools/madrid-extract/` read Título 8 of that document
// and emitted **282 cited records, 0 uncited non-null values** (`validate.py` enforces
// `articulo` + `apartado` on every one) into
// `docs/04-reference/jurisdictions/es/es-md/28079-madrid/extracted/nz{1,3,4,5,7,8,9}.json`.
// This file is the SHIPPABLE SUBSET of those records — the zones whose parameters are stated as
// constants the engine can solve — with each number carrying its article, apartado and page.
//
// ZONE CODES ARE THE LIVE MUNICIPAL VOCABULARY, NOT AN INVENTION. `AMB_TX_ETIQ` on
// `sigma.madrid.es/.../DESARROLLO_URBANO_ACTUALIZADO/NORMAS_ZONALES/MapServer/0` returns exactly
// 34 distinct values (probed live 2026-07-24, MADRID-DATA-RECON-SPIKE §2). The 23 codes below plus
// NZ 1's six (`1.1`…`1.6`, owned by `esMadridNZ1.ts`) plus NZ 3's five (refused here) are all 34.
//
// ⚠ NORMA ZONAL 1 IS NOT IN THIS PACK AND MUST NEVER BE ADDED TO IT. NZ 1 is a SETTLED
// `explicit-area` decision (`esMadridNZ1.ts`): its buildable footprint is PUBLISHED AS GEOMETRY
// (Fondo de la Edificación) and its *edificabilidad* is `E = S × Z × C` with Z read off the Plano
// de Condiciones de la Edificación per manzana. Transcribing it into parameters would be a lossy
// re-derivation of something already authoritative, and grados 1º–5º have NO tabulated height at
// all — Art. 8.1.15.1 fixes it case by case by the CPPHAN, a discretionary determination with no
// rule to encode. `packMap()` throws on a duplicate code, which is the mechanical guard.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// THE ADR-0271 QUESTION — IS ANY MADRID PARAMETER *DERIVED* RATHER THAN TABULATED?
// ═════════════════════════════════════════════════════════════════════════════════════════════
// Barcelona's *edificabilitat* turned out to be an ALGORITHM (PGM Art. 242.2), not a lookup, and
// encoding it as a constant would have been confidently wrong. The same check was run on Madrid,
// and **it found four derived parameters, not one**:
//
//   1. **NZ 4 *edificabilidad* IS A CONSTRUCTION, NOT A RATIO.** Art. 8.4.9.1 (PDF p. 414):
//      *"La superficie edificable de la parcela viene definida por el resultado de multiplicar la
//      altura en número de plantas que le corresponda en función del ancho de calle, según el
//      art. 8.4.10., por la superficie de parcela edificable comprendida dentro del polígono
//      definido por la alineación oficial, los linderos laterales y una línea paralela a dicha
//      alineación trazada a doce (12) metros"*. Buildable area = (storeys from the street-width
//      table) × (area of the 12 m depth band). There IS no NZ 4 FAR. `plotRatioFAR: null`, and a
//      number there would be the exact ADR-0271 failure. ⚠ The article ALSO validates the
//      `alignment` KIND: it literally names the buildable polygon as *alineación oficial +
//      linderos laterales + a parallel at 12 m*.
//   2. **The *altura* of NZ 4 and of NZ 9 grados 1º/2º is a STREET-WIDTH TABLE** (Arts. 8.4.10 and
//      8.9.10.1). A scalar would publish one street's answer for the whole zone — the L-526
//      failure. `maxHeight_m`/`maxFloors` are `null`; the tables live in `madridAnchoDeCalle.ts`
//      with a band-edge refusal, exactly as Barcelona's Art. 327.2 does.
//   3. **Several *retranqueos* are HEIGHT-PROPORTIONAL FORMULAS with an ordinance FLOOR** — NZ 5's
//      `max(5, H/2)`, NZ 8's `max(4, 2H/3)` and `max(3, H/2)`, NZ 4/NZ 9's `max(3, H/3)`. The
//      printed metre is the FLOOR, not the rule. See `resolveMadridSeparation_m` below for what
//      this pack does about it — and it is the single most dangerous number in the file.
//   4. **NZ 8 grado 6º's FAR is a STEP FUNCTION of parcel area** (Art. 8.8.9.1.f: 0,7 on the first
//      500 m², 0,5 on the excess). `madridNZ86FarForParcelArea` is the exact rule; the packed
//      scalar is deliberately the conservative 0,5.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// THE L-616 DISCIPLINE — A SOLID ENVELOPE MUST INTERSECT **ALL** DERIVED CONSTRAINTS
// ═════════════════════════════════════════════════════════════════════════════════════════════
// L-616 was massing that honoured a FAR while ignoring a height ceiling and drew an unknown
// setback as zero — over-stating by multiples. Three rules follow from it and every zone below
// obeys them:
//
//   (a) **A height-proportional setback is packed at the value that pairs with the zone's OWN
//       MAXIMUM HEIGHT.** `max(4, 2·H/3)` with NZ 8's 10,50 m cornisa is 7,00 m — not 4,00 m. The
//       floor is what binds on a bungalow; the pack draws the MAXIMUM envelope, so it must carry
//       the separation that maximum requires. Packing the floor would under-inset and over-state
//       the plot. (This is the Córdoba PAS-1 precedent — `side_m: 6.375` = ½·12,75 — applied
//       systematically.) The direction is deliberate: a shorter building needs LESS separation, so
//       this UNDER-states buildable area, which is the safe side.
//   (b) **Where the height itself is unresolved (the street-width zones), the proportional
//       setback CANNOT be resolved either, and the pack carries the ordinance FLOOR with the
//       under-inset stated in `MADRID_FLOOR_ONLY_SEPARATIONS`.** The floor is not correct; it is
//       strictly better than `null`, because `null` insets ZERO. Those zones are named as NOT
//       ready for human sign-off.
//   (c) **`null` is never a placeholder and never means zero.** Every `null` below is a cited
//       finding with a reason (C58 §1.7a). `maxCoverage: null` on NZ 4 means Art. 8.4.8.1 makes
//       occupation a RESIDUAL of the other rules; on NZ 9 it means Capítulo 8.9 contains no
//       occupation article at all. Neither is "0 % may be built".
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// GRANULARITY (C58 §1.11) — EVERY NUMBER IN THIS PACK IS **PARCEL**-GRANULARITY
// ═════════════════════════════════════════════════════════════════════════════════════════════
// Título 8 legislates per Norma Zonal and grado, and its denominator is stated per article as the
// *parcela edificable* (neta) — never the manzana, never the ámbito. Verbatim anchors: Art. 8.5.8
// *"coeficiente máximo de edificabilidad neta"*; Art. 8.7.9.1 *"edificabilidad neta sobre parcela
// edificable"*; Art. 8.8.8.1 *"aplicar a la superficie de parcela edificable"*; Art. 8.9.9
// *"por parcela edificable"*. Setbacks and heights are per-parcel by construction (they measure to
// that parcel's linderos and its own façade midpoint).
//
// ⚠ THE ONE BLOCK-GRANULARITY QUANTITY IN MADRID IS NZ 1's COEF_Z, published per `CODMANZANA` —
// and it is deliberately NOT in this pack (see the NZ 1 note above). `MADRID_PGOUM97_GRANULARITY`
// records the claim so a reader never has to infer it.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// PROVENANCE + THE HUMAN GATE
// ═════════════════════════════════════════════════════════════════════════════════════════════
// Source: **Compendio 2025 de las NNUU del PGOUM-97, consolidated 24-09-2025**, born-digital text
// layer (no OCR), read by `tools/madrid-extract/`. Every value has article + apartado + PDF page +
// verbatim quote in the `extracted/*.json` records. It is a MACHINE read of a primary text — above
// a guess, strictly BELOW a human verification. So:
//
//   • `defaultConfidence: 'pipeline-extracted-unverified'` (the permanent bottom tier, not a
//     provisional label that a cleaner PDF could promote);
//   • every `fieldProvenance` value is `'pipeline-extracted'`, never `'ordinance-pdf'`;
//   • `MADRID_ENVELOPE_VERIFIED` is **false** and belongs to the dispatcher, not to this file.
//
// PURE + deterministic (C58 §1.1/§1.9). Strategic context: C58 §1.2/§1.4/§1.6/§1.7a/§1.11/§2.2,
// C11, C03, ADR-0270, ADR-0271, ADR-0273, §envelope-solid-overstates-partial-data (L-616),
// docs/04-reference/jurisdictions/es/es-md/28079-madrid/findings/COMPENDIO-2025-EXTRACTION-01.md
// and COMPENDIO-2025-HEIGHT-DATUM-AND-NZ7.md.

import { trace } from '@opentelemetry/api';
import {
    JurisdictionZoningContractSchema,
    type JurisdictionZoningContract,
    type GeometricRule,
    type EnvelopeRefusal,
    type PermittedUse,
} from '@pryzm/schemas';
import { MADRID_JURISDICTION_ID } from './esMadridNZ1.js';

const tracer = trace.getTracer('pryzm.zoning.es.madrid');

/**
 * The honesty tier for every value in this pack. Named constants so the intent is greppable and
 * the test can assert the APPLIED values equal them (the Córdoba pattern).
 */
export const MADRID_PGOUM97_DEFAULT_CONFIDENCE = 'pipeline-extracted-unverified' as const;
export const MADRID_PGOUM97_FIELD_PROVENANCE = 'pipeline-extracted' as const;

/**
 * ⚠ THE HUMAN GATE. **FALSE, and it is not this file's to flip.**
 *
 * A pack cannot certify its own transcription of an ordinance. Until a Spanish-planning-literate
 * reviewer signs every value in `sources/VERIFICATION.md` — and that signature is recorded as a
 * C23 AIArtefact with `humanApproval`, per no-silent-graduation — the dispatcher must render a
 * cited "machine-extracted, unverified" REFUSAL for every Madrid parcel routed to this pack, and
 * NO number may reach the panel, the massing or `site.updateZoning`.
 *
 * Exported so the dispatcher imports the flag rather than restating it, exactly as
 * `CORDOBA_ENVELOPE_VERIFIED` is imported. Flipping it is a sign-off event, not a code change.
 */
export const MADRID_ENVELOPE_VERIFIED = false as const;

/** The document every citation in this pack resolves against. One string, not 25 copies. */
export const MADRID_PGOUM97_SOURCE =
    'Compendio 2025 de las Normas Urbanísticas del PGOUM-97 (Plan General de Ordenación Urbana de ' +
    'Madrid, aprobación definitiva 17-04-1997, BOCM 19-04-1997), texto consolidado 24-09-2025, ' +
    'Ayuntamiento de Madrid — Título 8, Normas Zonales. MACHINE-EXTRACTED from the born-digital ' +
    'text layer (tools/madrid-extract/), NOT human-verified: pipeline-extracted-unverified. ' +
    'Per-value records with verbatim quotes: docs/04-reference/jurisdictions/es/es-md/28079-madrid/extracted/.';

/**
 * C58 §1.11 — the GRANULARITY claim, stated rather than inferred. Every numeric field in this pack
 * is parcel-granularity; see the header for the verbatim denominator anchors per chapter.
 */
export const MADRID_PGOUM97_GRANULARITY = 'parcel' as const;

/**
 * ADR-0270 / C58 §2.2 — **the rule KIND per zone, stated explicitly.**
 *
 * The wrong KIND is a wrong SHAPE, not a wrong number, and no confidence chip corrects it. The
 * `geometricRule` field can only carry a kind when every edge has a number (`SetbackRuleSchema`
 * forbids `null`), so zones with a legitimately-null edge ship `geometricRule: null` — which the
 * engine reads as the legacy per-edge inset, i.e. `setback`. This map is therefore the AUTHORITY
 * on what each zone's kind IS, independent of how the schema had to express it, and the test
 * asserts the two agree wherever both exist.
 */
export const MADRID_PGOUM97_RULE_KINDS: Readonly<Record<string, 'setback' | 'alignment'>> =
    Object.freeze({
        // NZ 4 — the only alignment zone in the pack. Art. 8.4.9.1 literally defines the buildable
        // polygon as alineación oficial + linderos laterales + a parallel at 12 m.
        '4': 'alignment',
        // NZ 5 — bloques abiertos: separations from the linderos, no build-to line, no depth.
        '5.1': 'setback', '5.2': 'setback', '5.3': 'setback',
        // NZ 7 — baja densidad, aislada: retranqueos from the alineación oficial.
        '7.1.a': 'setback', '7.1.b': 'setback', '7.2.e': 'setback',
        // NZ 8 — vivienda unifamiliar: retranqueos + separations, all stated as distances.
        '8.1.a': 'setback', '8.1.c': 'setback',
        '8.2.a': 'setback', '8.2.b': 'setback', '8.2.c': 'setback',
        '8.3.a': 'setback', '8.3.c': 'setback',
        '8.4': 'setback', '8.5': 'setback', '8.6': 'setback',
        // NZ 9 — industrial. ⚠ Grados 1º/2º build ON the alineación with party walls, which LOOKS
        // like an alignment zone — but Art. 8.9.6.1's 12 m is a PARTY-WALL-REGIME threshold, not a
        // *fondo edificable* (the extraction says so verbatim, and Art. 8.9.14.1 contemplates a
        // build depth over 80 m). Encoding it as `alignment` with a 12 m depth would be NZ 4's
        // number imported into NZ 9's chapter — the L-526 failure. It is a `setback` zone.
        '9.1': 'setback', '9.2': 'setback', '9.3': 'setback',
        '9.4.a': 'setback', '9.4.b': 'setback', '9.5': 'setback',
    });

// ═════════════════════════════════════════════════════════════════════════════════════════════
// HEIGHT-PROPORTIONAL SEPARATIONS — the most dangerous numbers in the file
// ═════════════════════════════════════════════════════════════════════════════════════════════

/**
 * A PGOUM separation stated as `max(floor, factor × H)`. The printed metre is the **FLOOR**, and
 * on every zone in this pack whose maximum height exceeds `floor / factor` the FORMULA governs.
 *
 * ⚠ Packing the floor as if it were the rule is an OVER-STATEMENT of buildable area (a smaller
 * inset), which is the direction C58 §1.4 and L-616 forbid. NZ 8's `4 m` rear becomes `7,00 m` at
 * the chapter's own 10,50 m cornisa; NZ 5's `5 m` becomes `25,50 m` at grado 1º's 51 m coronación
 * — a five-fold difference on the constraint that shapes the plot.
 */
export interface MadridProportionalSeparation {
    /** The ordinance minimum, metres. Binds only while `factor × H ≤ floor_m`. */
    readonly floor_m: number;
    /** The multiplier on H (½, ⅔, ⅓ …). */
    readonly factor: number;
    /**
     * WHICH height H is. ⚠ `cornisa` and `coronación` are different quantities in the same units
     * (Arts. 6.6.5/6.6.6) and the chapters mix them deliberately — NZ 8's rear rule uses cornisa,
     * NZ 4's and NZ 9's use coronación, NZ 5's uses coronación. Interchanging them silently moves
     * the setback.
     */
    readonly heightDatum: 'cornisa' | 'coronación';
    readonly articulo: string;
    readonly apartado: string;
    readonly pdfPage: number;
    readonly verbatim: string;
}

/** NZ 5, Art. 8.5.6 ap. 4.a) — separación a linderos ≥ H/2 (coronación), mínimo 5 m. */
export const MADRID_NZ5_LINDERO_SEPARATION: MadridProportionalSeparation = Object.freeze({
    floor_m: 5,
    factor: 0.5,
    heightDatum: 'coronación',
    articulo: '8.5.6',
    apartado: '4.a)',
    pdfPage: 420,
    verbatim:
        'La edificación se dispondrá de modo que sus fachadas guarden una separación igual o ' +
        'superior a H/2 de su altura de coronación, respecto del lindero correspondiente, con ' +
        'mínimo de cinco (5) metros.',
});

/** NZ 8, Art. 8.8.6 ap. 2 — separación al lindero testero ≥ 2H/3 (cornisa), mínimo 4 m. */
export const MADRID_NZ8_TESTERO_SEPARATION: MadridProportionalSeparation = Object.freeze({
    floor_m: 4,
    factor: 2 / 3,
    heightDatum: 'cornisa',
    articulo: '8.8.6',
    apartado: '2',
    pdfPage: 441,
    verbatim:
        'Respecto al lindero testero, la separación será igual o superior a 2H:3 con un mínimo de ' +
        'cuatro (4) metros. Siendo el valor de (H), la altura de cornisa de los citados cuerpos, ' +
        'salvo en el grado 6º, en el que se tomará como valor de (H) la mayor de las alturas de ' +
        'cornisa de la construcción.',
});

/** NZ 8 grado 6º, Art. 8.8.6 ap. 1.f) — separación a linderos laterales ≥ H/2 (cornisa), mín. 3 m. */
export const MADRID_NZ86_LATERAL_SEPARATION: MadridProportionalSeparation = Object.freeze({
    floor_m: 3,
    factor: 0.5,
    heightDatum: 'cornisa',
    articulo: '8.8.6',
    apartado: '1.f)',
    pdfPage: 441,
    verbatim:
        'Grado 6º: La separación de la línea de edificación a los linderos laterales será igual o ' +
        'superior a la mitad de su altura (H/2) con un mínimo de tres (3) metros, tomando como ' +
        'valor de H la altura de cornisa correspondiente al lindero.',
});

/** NZ 4, Art. 8.4.5 ap. 2 — separación al lindero testero ≥ H/3 (coronación), mínimo 3 m. */
export const MADRID_NZ4_TESTERO_SEPARATION: MadridProportionalSeparation = Object.freeze({
    floor_m: 3,
    factor: 1 / 3,
    heightDatum: 'coronación',
    articulo: '8.4.5',
    apartado: '2',
    pdfPage: 411,
    verbatim:
        'La edificación se separará del lindero testero una distancia igual o superior a un tercio ' +
        '(1/3) de la altura de coronación de cada uno de los cuerpos de edificación enfrentados al ' +
        'mismo … con un mínimo de tres (3) metros.',
});

/** NZ 9 grados 1º/2º, Art. 8.9.6 ap. 1 — separación al lindero testero ≥ H/3 (coronación), mín. 3 m. */
export const MADRID_NZ9_TESTERO_SEPARATION: MadridProportionalSeparation = Object.freeze({
    floor_m: 3,
    factor: 1 / 3,
    heightDatum: 'coronación',
    articulo: '8.9.6',
    apartado: '1',
    pdfPage: 452,
    verbatim:
        'La edificación se separará del lindero testero una distancia igual o superior a H:3 de la ' +
        'altura de coronación de cada uno de los cuerpos de edificación enfrentados al mismo, con ' +
        'un mínimo de tres (3) metros.',
});

/**
 * Resolve a height-proportional separation at a given height.
 *
 * Returns `null` when `height_m` is unknown — **never the floor, and never 0**. A caller that
 * wants the floor must ask for it deliberately (see `MADRID_FLOOR_ONLY_SEPARATIONS`), because
 * substituting the floor for the rule is precisely the silent under-inset L-616 is about.
 *
 * PURE, deterministic, never throws. P8 — emits
 * `pryzm.zoning.es.madrid.resolveSeparation`.
 *
 * @param rule      the ordinance formula.
 * @param height_m  the governing H **in the rule's own datum** (`rule.heightDatum`). Passing a
 *                  cornisa figure to a coronación rule silently under-states the separation.
 */
export function resolveMadridSeparation_m(
    rule: MadridProportionalSeparation,
    height_m: number | null | undefined,
): number | null {
    const span = tracer.startSpan('pryzm.zoning.es.madrid.resolveSeparation');
    try {
        span.setAttribute('pryzm.madrid.separation.articulo', rule.articulo);
        if (typeof height_m !== 'number' || !Number.isFinite(height_m) || height_m <= 0) {
            span.setAttribute('pryzm.madrid.separation.resolved', false);
            return null;
        }
        const value = Math.max(rule.floor_m, rule.factor * height_m);
        span.setAttribute('pryzm.madrid.separation.resolved', true);
        span.setAttribute('pryzm.madrid.separation.floorBinds', value === rule.floor_m);
        return value;
    } finally {
        span.end();
    }
}

/**
 * ⚠ THE ZONES WHOSE SEPARATION IS PACKED AS AN ORDINANCE **FLOOR**, BECAUSE THEIR HEIGHT IS
 * UNRESOLVED — an under-inset, and therefore an OVER-STATEMENT of buildable area on any parcel
 * whose building exceeds the floor's break-even height.
 *
 * These are exactly the street-width-governed zones: their `maxHeight_m` is `null` (the height is
 * a table in `madridAnchoDeCalle.ts`), so `resolveMadridSeparation_m` has no H to resolve against.
 * The alternative is `null`, which insets ZERO and is strictly worse.
 *
 * **⇒ NONE OF THESE ZONES IS READY FOR HUMAN SIGN-OFF AS A POLYGON.** They lift the day the
 * street-width resolver feeds a height back in.
 */
export const MADRID_FLOOR_ONLY_SEPARATIONS: ReadonlyArray<{
    readonly zoneCode: string;
    readonly edge: 'front' | 'side' | 'rear';
    readonly packed_m: number;
    readonly breakEvenHeight_m: number;
    readonly why: string;
}> = Object.freeze([
    {
        zoneCode: '4',
        edge: 'rear',
        packed_m: MADRID_NZ4_TESTERO_SEPARATION.floor_m,
        breakEvenHeight_m: MADRID_NZ4_TESTERO_SEPARATION.floor_m / MADRID_NZ4_TESTERO_SEPARATION.factor,
        why:
            'Art. 8.4.5.2 is max(3, H_coronación/3) and NZ 4 has no scalar height (Art. 8.4.10 is a ' +
            'street-width table, and it states CORNISA while this rule needs CORONACIÓN). Mitigated ' +
            'but not cured by the 12 m alignment depth band, which already clips every parcel deeper ' +
            'than ~15 m before the testero rule could bite.',
    },
    {
        zoneCode: '9.1',
        edge: 'rear',
        packed_m: MADRID_NZ9_TESTERO_SEPARATION.floor_m,
        breakEvenHeight_m: MADRID_NZ9_TESTERO_SEPARATION.floor_m / MADRID_NZ9_TESTERO_SEPARATION.factor,
        why: 'Art. 8.9.6.1 is max(3, H_coronación/3); NZ 9 grado 1º height is the Art. 8.9.10.1 street-width table.',
    },
    {
        zoneCode: '9.2',
        edge: 'rear',
        packed_m: MADRID_NZ9_TESTERO_SEPARATION.floor_m,
        breakEvenHeight_m: MADRID_NZ9_TESTERO_SEPARATION.floor_m / MADRID_NZ9_TESTERO_SEPARATION.factor,
        why: 'Art. 8.9.6.1 is max(3, H_coronación/3); NZ 9 grado 2º height is the Art. 8.9.10.1 street-width table.',
    },
]);

// ═════════════════════════════════════════════════════════════════════════════════════════════
// NZ 8 GRADO 6º — the step-function FAR (Art. 8.8.9 ap. 1.f)
// ═════════════════════════════════════════════════════════════════════════════════════════════

/** Art. 8.8.9.1.f) — the parcel area, m², at which the coefficient steps down. */
export const MADRID_NZ86_FAR_STEP_M2 = 500;
/** Art. 8.8.9.1.f) — 7 m² per 10 m² on the first 500 m². */
export const MADRID_NZ86_FAR_FIRST = 0.7;
/** Art. 8.8.9.1.f) — 5 m² per 10 m² on the excess. */
export const MADRID_NZ86_FAR_EXCESS = 0.5;

/**
 * The EXACT Art. 8.8.9.1.f) rule: buildable floor area for an NZ 8 grado 6º parcel, m².
 *
 * *"Para parcelas de superficie menor o igual a quinientos (500) metros, siete (7) metros
 * cuadrados por cada diez (10) metros cuadrados. Para parcelas de superficie mayor de quinientos
 * (500) metros cuadrados, siete (7) … sobre los primeros quinientos (500) … y de cinco (5) …
 * sobre la superficie que exceda de quinientos (500)."* (PDF p. 443.)
 *
 * ⚠ The pack ships `plotRatioFAR: 0.5` for `8.6` — the EXCESS coefficient — deliberately. A single
 * scalar cannot be right for both sides of the step, and 0,7 would OVER-state every parcel above
 * 500 m² (a 1 000 m² parcel's true effective ratio is 0,60). 0,5 under-states, which is the safe
 * direction. This function is the correct answer and is what a future per-parcel hook must call.
 *
 * Returns `null` for a non-positive / non-finite area rather than guessing.
 * P8 — emits `pryzm.zoning.es.madrid.nz86Far`.
 */
export function madridNZ86BuildableArea_m2(parcelArea_m2: number): number | null {
    const span = tracer.startSpan('pryzm.zoning.es.madrid.nz86Far');
    try {
        if (
            typeof parcelArea_m2 !== 'number' ||
            !Number.isFinite(parcelArea_m2) ||
            parcelArea_m2 <= 0
        ) {
            span.setAttribute('pryzm.madrid.nz86.resolved', false);
            return null;
        }
        const first = Math.min(parcelArea_m2, MADRID_NZ86_FAR_STEP_M2);
        const excess = Math.max(0, parcelArea_m2 - MADRID_NZ86_FAR_STEP_M2);
        span.setAttribute('pryzm.madrid.nz86.stepped', excess > 0);
        return first * MADRID_NZ86_FAR_FIRST + excess * MADRID_NZ86_FAR_EXCESS;
    } finally {
        span.end();
    }
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// THE ZONES
// ═════════════════════════════════════════════════════════════════════════════════════════════

/** Every field this pack sets is machine-extracted; one object rather than 25 repetitions. */
const PROV = MADRID_PGOUM97_FIELD_PROVENANCE;

/** The provenance map for a fully-parameterised setback zone. */
function setbackProvenance(opts: { readonly front: boolean; readonly coverage: boolean; readonly far: boolean; readonly height: boolean }) {
    const p: Record<string, typeof PROV> = {
        'setback.side': PROV,
        'setback.rear': PROV,
        permittedUse: PROV,
    };
    if (opts.front) p['setback.front'] = PROV;
    if (opts.coverage) p.maxCoverage = PROV;
    if (opts.far) p.maxFAR = PROV;
    if (opts.height) {
        p.maxHeight = PROV;
        p.maxFloors = PROV;
    }
    return p;
}

/**
 * NZ 4's `alignment` rule. ⚠ `alignTo: 'street'` is what the ENGINE does — it measures the depth
 * band from the C19-classified `front` CADASTRAL edge. The LEGAL datum is the *alineación oficial*
 * (Art. 8.4.9.1), a separately-published municipal line that need not coincide with the cadastral
 * boundary. Declaring `'official-line'` would name a datum nothing resolves, so the substitution is
 * disclosed here instead of mislabelled in the data. It is a real, named approximation.
 */
export const MADRID_NZ4_RULE: GeometricRule = {
    kind: 'alignment',
    alignTo: 'street',
    // Art. 8.4.6.1 — *"El edificio situará una de sus fachadas exteriores SOBRE y a lo largo de la
    // alineación oficial en toda su altura"*. A mandatory build-to line, hence offset 0 — not a
    // permissive zero.
    alignmentOffset_m: 0,
    // Art. 8.4.5.1 — *"La edificación se adosará a los linderos laterales"*. Mandatory medianería.
    sideTreatment: 'party-wall',
    // Art. 8.4.7.1 — *"Se establece un fondo máximo edificable de doce (12) metros"*, measured
    // perpendicular from the alineación oficial (Art. 8.4.9.1 fixes the datum).
    buildableDepth_m: 12,
};

interface MadridZoneSpec {
    readonly code: string;
    readonly label: string;
    readonly permittedUse: ReadonlyArray<PermittedUse>;
    readonly maxHeight_m: number | null;
    readonly maxFloors: number | null;
    readonly plotRatioFAR: number | null;
    readonly maxCoverage: number | null;
    readonly setbacks: {
        readonly front_m: number | null;
        readonly side_m: number | null;
        readonly rear_m: number | null;
    };
    readonly geometricRule?: GeometricRule | null;
    readonly ordinanceRef: string;
}

function zone(spec: MadridZoneSpec) {
    return {
        code: spec.code,
        label: spec.label,
        permittedUse: [...spec.permittedUse],
        maxHeight_m: spec.maxHeight_m,
        maxFloors: spec.maxFloors,
        plotRatioFAR: spec.plotRatioFAR,
        maxCoverage: spec.maxCoverage,
        setbacks: { ...spec.setbacks },
        geometricRule: spec.geometricRule ?? null,
        fieldProvenance: setbackProvenance({
            front: spec.setbacks.front_m !== null,
            coverage: spec.maxCoverage !== null,
            far: spec.plotRatioFAR !== null,
            height: spec.maxHeight_m !== null,
        }),
        ordinanceRef: `${spec.ordinanceRef} — ${MADRID_PGOUM97_SOURCE}`,
    };
}

// ── NZ 5 heights are CORONACIÓN (Art. 8.5.9.1). Resolve the lindero separation at each grado's own
//    maximum, per L-616 rule (a). 51 → 25,50 | 30 → 15,00 | 15 → 7,50. ────────────────────────
const NZ5_SEP_G1 = resolveMadridSeparation_m(MADRID_NZ5_LINDERO_SEPARATION, 51)!;
const NZ5_SEP_G2 = resolveMadridSeparation_m(MADRID_NZ5_LINDERO_SEPARATION, 30)!;
const NZ5_SEP_G3 = resolveMadridSeparation_m(MADRID_NZ5_LINDERO_SEPARATION, 15)!;

// ── NZ 8 rear = max(4, 2H/3) at the grado's own CORNISA. 10,50 → 7,00 | 7,00 → 4,666… ─────────
const NZ8_REAR_AT_10_5 = resolveMadridSeparation_m(MADRID_NZ8_TESTERO_SEPARATION, 10.5)!;
const NZ8_REAR_AT_7 = resolveMadridSeparation_m(MADRID_NZ8_TESTERO_SEPARATION, 7)!;
// ── NZ 8 grado 6º lateral = max(3, H/2) at 10,50 cornisa → 5,25. ──────────────────────────────
const NZ86_SIDE = resolveMadridSeparation_m(MADRID_NZ86_LATERAL_SEPARATION, 10.5)!;

/**
 * Shared NZ 8 body — the ten grados differ only in the numbers passed in.
 *
 * `gradoLetter` is the apartado letter Arts. 8.8.6.1 / 8.8.7.1 / 8.8.8.1 / 8.8.9.1 all use for the
 * SAME grado (1º→a, 2º→b, 3º→c, 4º→d, 5º→e, 6º→f), so one argument cites four articles correctly.
 * `alturaApartado` is separate because Art. 8.8.10 splits differently: ap. 1 covers grados
 * 1º/2º/3º/4º/6º, ap. 2 covers grado 5º alone.
 */
function nz8Zone(args: {
    readonly code: string;
    readonly gradoLabel: string;
    readonly gradoLetter: 'a' | 'b' | 'c' | 'd' | 'e' | 'f';
    readonly alturaApartado: '1' | '2';
    readonly front_m: number;
    readonly side_m: number;
    readonly rear_m: number;
    readonly maxCoverage: number;
    readonly plotRatioFAR: number;
    readonly maxHeight_m: number;
    readonly maxFloors: number;
    readonly extraRef?: string;
}) {
    const g = `1.${args.gradoLetter})`;
    return zone({
        code: args.code,
        label: `Norma Zonal 8 — Edificación en vivienda unifamiliar, ${args.gradoLabel}`,
        permittedUse: ['residential'],
        maxHeight_m: args.maxHeight_m,
        maxFloors: args.maxFloors,
        plotRatioFAR: args.plotRatioFAR,
        maxCoverage: args.maxCoverage,
        setbacks: { front_m: args.front_m, side_m: args.side_m, rear_m: args.rear_m },
        ordinanceRef:
            `PGOUM-97 Art. 8.8.7 ap. ${g} (retranqueo a la alineación oficial ${args.front_m} m — the ` +
            `text says "superior a", i.e. STRICTLY greater), Art. 8.8.6 ap. ${g} (separación a los ` +
            `linderos laterales ${args.side_m} m), Art. 8.8.6 ap. 2 (lindero testero max(4, 2H/3) = ` +
            `${args.rear_m.toFixed(2)} m at the grado's own ${args.maxHeight_m} m de cornisa — the printed ` +
            `4 m is the FLOOR, not the rule), Art. 8.8.8 ap. ${g} (ocupación ` +
            `${(args.maxCoverage * 100).toFixed(0)} % — ⚠ a COMBINED above+below-grade budget, applied ` +
            `here as an above-grade cap, which under-states), Art. 8.8.9 ap. ${g} (edificabilidad neta ` +
            `${args.plotRatioFAR} m²/m² sobre parcela edificable), Art. 8.8.10 ap. ${args.alturaApartado} ` +
            `(${args.maxFloors} plantas / ${args.maxHeight_m} m de cornisa, medidos desde la cota de contacto ` +
            `con el terreno en el punto medio de la fachada de acceso; ⚠ a 12,00 m cornisa applies on the ` +
            `OTHER façades and a 12,50 m coronación ceiling to the 10 %-area top storey — neither modelled), ` +
            `Art. 8.8.1 ap. 3 (uso cualificado residencial, vivienda unifamiliar). ` +
            `⚠ NO fondo edificable exists in Capítulo 8.8 — buildableDepth is NULL, not zero. ⚠ The a/b/c ` +
            `NIVEL suffix governs the régimen de usos ONLY (Art. 8.8.16); every building parameter is per ` +
            `GRADO.` + (args.extraRef ? ` ${args.extraRef}` : ''),
    });
}

/**
 * The Madrid PGOUM-97 pack — Normas Zonales 4, 5, 7, 8, 9 (23 of the 34 live `AMB_TX_ETIQ` codes).
 *
 * `source: 'madrid-pgou'`; `crs: 'EPSG:25830'` (the municipal ArcGIS planes publish in UTM 30N /
 * ETRS89, as `esMadridNZ1.ts` records).
 */
export const ES_MADRID_PGOUM97_PACK: JurisdictionZoningContract =
    JurisdictionZoningContractSchema.parse({
        jurisdictionId: MADRID_JURISDICTION_ID,
        displayName: 'Madrid — PGOUM-97 Normas Zonales 4/5/7/8/9',
        source: 'madrid-pgou',
        crs: 'EPSG:25830',
        lastReviewed: '2026-07-31',
        defaultConfidence: MADRID_PGOUM97_DEFAULT_CONFIDENCE,
        zones: [
            // ══ NZ 4 — Edificación en manzana cerrada (Capítulo 8.4). ALIGNMENT. ═══════════════
            //
            // The densest, most valuable fabric in the pack, and the one zone whose KIND is not a
            // setback triple. Height AND edificabilidad are both DERIVED (see the header, items 1
            // and 2), so both are null and the depth band is what shapes the plot.
            zone({
                code: '4',
                label: 'Norma Zonal 4 — Edificación en manzana cerrada (sin grados)',
                // Art. 8.4.1.3 uso cualificado residencial; Art. 8.4.15 admits terciario,
                // dotacional and (lower floors) industrial as compatible uses.
                permittedUse: ['residential', 'mixed'],
                // ⚠ Art. 8.4.10 is a STREET-WIDTH TABLE (madridAnchoDeCalle.ts). A scalar would
                // publish one street's answer for the whole zone — the L-526 failure.
                maxHeight_m: null,
                maxFloors: null,
                // ⚠ ADR-0271 ANALOGUE. Art. 8.4.9.1 defines edificabilidad as a CONSTRUCTION
                // (plantas × the area of the 12 m band), not a ratio. There is no NZ 4 FAR.
                // ⚠ The 2,4 m²/m² of Art. 8.4.2.2.e) is NOT it: that is a ceiling on the
                // ENLARGEMENT of EXISTING exclusively-industrial buildings. Applying it to
                // new-build would be a real number answering a different question (C58 §1.11).
                plotRatioFAR: null,
                // Art. 8.4.8.1 — ocupación sobre rasante is *"la resultante de aplicar"* the
                // alignment/setback/depth rules. A RESIDUAL, not a percentage. null ≠ 0.
                maxCoverage: null,
                // Front 0 = the mandatory build-to line (Art. 8.4.6.1). Side 0 = mandatory
                // medianería (Art. 8.4.5.1). Rear null → see MADRID_FLOOR_ONLY_SEPARATIONS…
                // except it is NOT null here: the 12 m depth band already clips every parcel
                // deeper than 12 m, and 3 m is the cited Art. 8.4.5.2 floor for the rest.
                setbacks: { front_m: 0, side_m: 0, rear_m: MADRID_NZ4_TESTERO_SEPARATION.floor_m },
                geometricRule: MADRID_NZ4_RULE,
                ordinanceRef:
                    'PGOUM-97 Art. 8.4.7 ap. 1 (fondo máximo edificable 12 m, medido perpendicularmente ' +
                    'desde la alineación oficial), Art. 8.4.9 ap. 1 (the buildable polygon IS "la ' +
                    'alineación oficial, los linderos laterales y una línea paralela a dicha alineación ' +
                    'trazada a doce (12) metros" — which is why the KIND is alignment), Art. 8.4.6 ap. 1 ' +
                    '(fachada SOBRE la alineación oficial en toda su altura — alineación obligatoria, not ' +
                    'a permissive 0), Art. 8.4.5 ap. 1 (adosamiento a linderos laterales; ⚠ Arts. 8.4.5 ' +
                    'ap. 1.a) and ap. 5 impose a 3 m separation where the neighbour has licensed habitable ' +
                    'openings on the medianera or is of a different tipología — conditional, not modelled), ' +
                    'Art. 8.4.5 ap. 2 (lindero testero max(3, H_coronación/3) — the 3 m FLOOR is packed ' +
                    'because NZ 4 has no scalar height), Art. 8.4.1 ap. 3 + Art. 8.4.15 (usos: uso ' +
                    'cualificado residencial, con terciario/dotacional/industrial compatibles). ' +
                    '⚠ maxHeight/maxFloors NULL = the Art. 8.4.10 street-width table (plantas y altura de ' +
                    'cornisa por ancho de calle). ⚠ plotRatioFAR NULL = Art. 8.4.9 ap. 1 states ' +
                    'edificabilidad as a CONSTRUCTION, never a ratio. ⚠ maxCoverage NULL = Art. 8.4.8 ' +
                    'ap. 1 makes ocupación a residual. ⚠ Art. 8.4.6 ap. 1.b) moves the 12 m datum to a ' +
                    'set-back façade for whole-manzana-front actuaciones — not modelled.',
            }),

            // ══ NZ 5 — Edificación en bloques abiertos (Capítulo 8.5). SETBACK. ════════════════
            //
            // ⚠ THE HEIGHTS HERE ARE *CORONACIÓN*, NOT CORNISA (Art. 8.5.9.1). Do not compare 51 m
            // with NZ 4's or NZ 8's cornisa figures — they are different quantities.
            //
            // ⚠ THE FRONT EDGE IS NULL AND THAT IS AN OPEN GAP, NOT A FINDING WE ARE COMFORTABLE
            // WITH. Art. 8.5.6.3 measures the front separation to the STREET CENTRELINE
            // (*"respecto al eje de la calle"*), so the equivalent distance from the parcel
            // frontage is H/2 − (street width)/2 — parcel-and-street specific, and zero or
            // non-binding on a wide street. It is a NEW RULE TYPE, not a retranqueo, and no kind
            // in `GeometricRule` expresses it. `null` (skip the edge) rather than `0` (assert the
            // ordinance requires zero clearance) is the honest label, but the geometric effect is
            // the same: NO front inset. On a narrow street that OVER-STATES. The FAR (Art. 8.5.8)
            // and the 50 % ocupación (Art. 8.5.7.a) are what keep the numbers honest meanwhile.
            zone({
                code: '5.1',
                label: 'Norma Zonal 5 — Edificación en bloques abiertos, grado 1º',
                permittedUse: ['residential'],
                maxHeight_m: 51,
                maxFloors: 14,
                plotRatioFAR: 2.0,
                maxCoverage: 0.5,
                setbacks: { front_m: null, side_m: NZ5_SEP_G1, rear_m: NZ5_SEP_G1 },
                ordinanceRef:
                    'PGOUM-97 Art. 8.5.8 ap. 1) (edificabilidad neta 2,0 m²/m² sobre parcela edificable), ' +
                    'Art. 8.5.9 ap. 1.1) ("Catorce (14) plantas y cincuenta y un (51) metros" — altura de ' +
                    'CORONACIÓN medida desde la cota de nivelación de planta baja, Art. 8.5.10), ' +
                    'Art. 8.5.7 ap. a) (ocupación sobre rasante 50 % de la parcela edificable; ap. b) ' +
                    'permits 100 % bajo rasante), Art. 8.5.6 ap. 4.a) (separación a linderos ≥ H/2 con ' +
                    'mínimo 5 m ⇒ 25,50 m at the grado\'s own 51 m coronación — the 5 m is the FLOOR, and ' +
                    'packing it would under-inset by 20,50 m), Art. 8.5.1.3 (uso cualificado residencial). ' +
                    '⚠ FRONT NULL: Art. 8.5.6.3 measures to the EJE DE LA CALLE, a rule type PRYZM does ' +
                    'not model — see the block comment. ⚠ Art. 8.5.6.4.b) permits adosamiento per ' +
                    'Art. 6.3.13 (not modelled). ⚠ No fondo edificable exists in Capítulo 8.5.',
            }),
            zone({
                code: '5.2',
                label: 'Norma Zonal 5 — Edificación en bloques abiertos, grado 2º',
                permittedUse: ['residential'],
                maxHeight_m: 30,
                maxFloors: 8,
                plotRatioFAR: 1.6,
                maxCoverage: 0.5,
                setbacks: { front_m: null, side_m: NZ5_SEP_G2, rear_m: NZ5_SEP_G2 },
                ordinanceRef:
                    'PGOUM-97 Art. 8.5.8 ap. 2) (edificabilidad neta 1,6 m²/m²), Art. 8.5.9 ap. 1.2) ' +
                    '("Ocho (8) plantas y treinta (30) metros" — CORONACIÓN), Art. 8.5.7 ap. a) ' +
                    '(ocupación 50 %), Art. 8.5.6 ap. 4.a) (linderos ≥ H/2, mín 5 m ⇒ 15,00 m at 30 m), ' +
                    'Art. 8.5.1.3 (residencial). ⚠ FRONT NULL — Art. 8.5.6.3 eje-de-calle rule, not modelled.',
            }),
            zone({
                code: '5.3',
                label: 'Norma Zonal 5 — Edificación en bloques abiertos, grado 3º',
                permittedUse: ['residential'],
                maxHeight_m: 15,
                maxFloors: 4,
                plotRatioFAR: 1.4,
                maxCoverage: 0.5,
                setbacks: { front_m: null, side_m: NZ5_SEP_G3, rear_m: NZ5_SEP_G3 },
                ordinanceRef:
                    'PGOUM-97 Art. 8.5.8 ap. 3) (edificabilidad neta 1,4 m²/m²), Art. 8.5.9 ap. 1.3) ' +
                    '("Cuatro (4) plantas y quince (15) metros" — CORONACIÓN), Art. 8.5.7 ap. a) ' +
                    '(ocupación 50 %), Art. 8.5.6 ap. 4.a) (linderos ≥ H/2, mín 5 m ⇒ 7,50 m at 15 m), ' +
                    'Art. 8.5.1.3 (residencial). ⚠ FRONT NULL — Art. 8.5.6.3 eje-de-calle rule, not modelled.',
            }),

            // ══ NZ 7 — Edificación en baja densidad (Capítulo 8.7). SETBACK. ═══════════════════
            //
            // The cleanest zones in the pack: every parameter is a stated scalar and every setback
            // is a stated distance, not a formula. Grados 1º a and b share ALL building parameters
            // (Art. 8.7.17 confines the nivel to the régimen de usos).
            zone({
                code: '7.1.a',
                label: 'Norma Zonal 7 — Edificación en baja densidad, grado 1º nivel a',
                permittedUse: ['residential'],
                maxHeight_m: 14.5,
                maxFloors: 4,
                plotRatioFAR: 0.8,
                maxCoverage: 0.35,
                setbacks: { front_m: 4, side_m: 4, rear_m: 4 },
                ordinanceRef:
                    'PGOUM-97 Art. 8.7.9 ap. 1.a) (edificabilidad neta "ocho (8) m² por cada diez (10) m²" ' +
                    '= 0,8 m²/m² sobre parcela edificable), Art. 8.7.8 ap. 1 (ocupación SOBRE RASANTE ≤ 35 %; ' +
                    'bajo rasante 60 %, with a tiered 100 %/60 % override at 1.600 m² for fully-buried ' +
                    'storeys — not modelled), Art. 8.7.11 ap. 1 (4 plantas, altura de CORNISA 1.450 cm = ' +
                    '14,50 m medida desde la rasante de la acera en el punto medio de la línea de fachada — ' +
                    '⚠ Art. 8.7.11.1 EXPRESSLY overrides the aislada-typology datum to the pavement rasante), ' +
                    'Art. 8.7.6 ap. 1.b) (retranqueo mínimo a la alineación oficial 4 m; ⚠ ap. 1.a) makes it ' +
                    '5 m on calle Arturo Soria — a street-specific exception, not modelled), Art. 8.7.6 ' +
                    'ap. 2.a) (separación mínima a linderos 4 m, laterales y testero alike; ap. 2.b) permits ' +
                    'adosamiento to ONE lateral per Art. 6.3.13), Art. 8.7.1.3 (uso cualificado residencial). ' +
                    '⚠ No fondo edificable exists in Capítulo 8.7.',
            }),
            zone({
                code: '7.1.b',
                label: 'Norma Zonal 7 — Edificación en baja densidad, grado 1º nivel b',
                permittedUse: ['residential'],
                maxHeight_m: 14.5,
                maxFloors: 4,
                plotRatioFAR: 0.8,
                maxCoverage: 0.35,
                setbacks: { front_m: 4, side_m: 4, rear_m: 4 },
                ordinanceRef:
                    'PGOUM-97 Art. 8.7.9 ap. 1.a) (edificabilidad neta 0,8 m²/m² sobre parcela ' +
                    'edificable), Art. 8.7.8 ap. 1 (ocupación sobre rasante ' +
                    '35 %), Art. 8.7.11 ap. 1 (4 plantas / 14,50 m cornisa desde la rasante de la acera), ' +
                    'Art. 8.7.6 ap. 1.b) (retranqueo 4 m), Art. 8.7.6 ap. 2.a) (linderos 4 m), Art. 8.7.1.3 ' +
                    '(residencial). ⚠ Art. 8.7.18 ap. 2.b)i) states 1,2 m²/m² for terciario in EDIFICIO ' +
                    'EXCLUSIVO — an ALTERNATIVE-USE ceiling for nivel b only. It is NOT the residential ' +
                    'figure and is deliberately not packed: applying it to residential development would ' +
                    'over-state by 50 %.',
            }),
            zone({
                code: '7.2.e',
                label: 'Norma Zonal 7 — Edificación en baja densidad, grado 2º nivel "e" especial',
                // Art. 8.7.20 — *"el uso cualificado es el terciario en sus clases de oficinas y
                // hospedaje … Queda PROHIBIDO expresamente el uso residencial."*
                permittedUse: ['commercial'],
                maxHeight_m: 10.5,
                maxFloors: 3,
                plotRatioFAR: 1.0,
                maxCoverage: 0.3,
                setbacks: { front_m: 10, side_m: 7, rear_m: 7 },
                ordinanceRef:
                    'PGOUM-97 Art. 8.7.20 (grado 2º nivel "e": uso cualificado TERCIARIO oficinas y ' +
                    'hospedaje, uso residencial EXPRESAMENTE PROHIBIDO; edificabilidad máxima 1 m² por m² ' +
                    'de parcela edificable), Art. 8.7.8 ap. 2 (ocupación del CONJUNTO sobre y bajo rasante ' +
                    '≤ 30 % — a single combined budget), Art. 8.7.11 ap. 2 (3 plantas, cornisa 1.050 cm = ' +
                    '10,50 m desde la cota de nivelación de planta baja; ⚠ a 10 %-area top storey may reach ' +
                    'a 12,50 m CORONACIÓN — a different datum, not modelled), Art. 8.7.7 ap. 1 (retranqueo ' +
                    '"superior a diez (10) metros" — STRICTLY greater), Art. 8.7.7 ap. 2 (separación a ' +
                    'linderos ≥ 7 m). ⚠ CONFLICT RESOLVED BY SCOPE, not by precedence: Art. 8.7.9.1.b) ' +
                    'states 0,5 m²/m² for grado 2º, but that is the coefficient for the grado\'s RESIDENTIAL ' +
                    'uso cualificado, which Art. 8.7.20 forbids inside nivel "e" — so no parcel can be ' +
                    'subject to both. The Compendio contains no express derogation clause; this is a scope ' +
                    'reading a reviewer can overturn (COMPENDIO-2025-HEIGHT-DATUM-AND-NZ7.md).',
            }),

            // ══ NZ 8 — Edificación en vivienda unifamiliar (Capítulo 8.8). SETBACK. ════════════
            //
            // Six grados × the a/b/c nivel suffix = the ten live codes. Art. 8.8.16 confines the
            // nivel to the régimen de usos, so `8.1.a` and `8.1.c` carry IDENTICAL building
            // parameters — that is the ordinance, not a copy-paste slip.
            nz8Zone({
                code: '8.1.a', gradoLabel: 'grado 1º nivel a', gradoLetter: 'a', alturaApartado: '1',
                front_m: 10, side_m: 7, rear_m: NZ8_REAR_AT_10_5,
                maxCoverage: 0.2, plotRatioFAR: 0.3, maxHeight_m: 10.5, maxFloors: 3,
                extraRef:
                    '⚠ Grados 1º/2º: the retranqueo strip may not be built on above grade (Art. 8.8.7.2).',
            }),
            nz8Zone({
                code: '8.1.c', gradoLabel: 'grado 1º nivel c', gradoLetter: 'a', alturaApartado: '1',
                front_m: 10, side_m: 7, rear_m: NZ8_REAR_AT_10_5,
                maxCoverage: 0.2, plotRatioFAR: 0.3, maxHeight_m: 10.5, maxFloors: 3,
                extraRef:
                    '⚠ Art. 8.8.17 ap. 2.b) states 1,0 m²/m² and 40 % ocupación for nivel c — an ' +
                    'ALTERNATIVE-USE regime (terciario/dotacional in edificio exclusivo), NOT the ' +
                    'residential figures. Packing it would over-state the qualified use by 3,3×.',
            }),
            nz8Zone({
                code: '8.2.a', gradoLabel: 'grado 2º nivel a', gradoLetter: 'b', alturaApartado: '1',
                front_m: 7, side_m: 5, rear_m: NZ8_REAR_AT_10_5,
                maxCoverage: 0.3, plotRatioFAR: 0.5, maxHeight_m: 10.5, maxFloors: 3,
                extraRef: '⚠ Art. 8.8.6.4: in grado 2º nivel a, adosamiento only per Art. 8.8.4.2.c).',
            }),
            nz8Zone({
                code: '8.2.b', gradoLabel: 'grado 2º nivel b', gradoLetter: 'b', alturaApartado: '1',
                front_m: 7, side_m: 5, rear_m: NZ8_REAR_AT_10_5,
                maxCoverage: 0.3, plotRatioFAR: 0.5, maxHeight_m: 10.5, maxFloors: 3,
            }),
            nz8Zone({
                code: '8.2.c', gradoLabel: 'grado 2º nivel c', gradoLetter: 'b', alturaApartado: '1',
                front_m: 7, side_m: 5, rear_m: NZ8_REAR_AT_10_5,
                maxCoverage: 0.3, plotRatioFAR: 0.5, maxHeight_m: 10.5, maxFloors: 3,
            }),
            nz8Zone({
                code: '8.3.a', gradoLabel: 'grado 3º nivel a', gradoLetter: 'c', alturaApartado: '1',
                front_m: 4, side_m: 3, rear_m: NZ8_REAR_AT_10_5,
                maxCoverage: 0.4, plotRatioFAR: 0.7, maxHeight_m: 10.5, maxFloors: 3,
                extraRef:
                    '⚠ Art. 8.8.6.3/8.8.6.5: grados 3º/4º/5º may abut ONE lindero (agrupada, hilera, ' +
                    'adosada) per Art. 6.3.13 — an option, not an obligation, so the 3 m is packed.',
            }),
            nz8Zone({
                code: '8.3.c', gradoLabel: 'grado 3º nivel c', gradoLetter: 'c', alturaApartado: '1',
                front_m: 4, side_m: 3, rear_m: NZ8_REAR_AT_10_5,
                maxCoverage: 0.4, plotRatioFAR: 0.7, maxHeight_m: 10.5, maxFloors: 3,
            }),
            nz8Zone({
                code: '8.4', gradoLabel: 'grado 4º', gradoLetter: 'd', alturaApartado: '1',
                front_m: 4, side_m: 3, rear_m: NZ8_REAR_AT_10_5,
                maxCoverage: 0.5, plotRatioFAR: 1.0, maxHeight_m: 10.5, maxFloors: 3,
                extraRef:
                    '⚠ NZ 3 (Volumetría Específica) borrows THIS grado\'s parameters by reference ' +
                    '(Art. 8.3.5.3.a)i)) — that reference does NOT make NZ 3 packable; see madridNZ3Refusal.',
            }),
            nz8Zone({
                code: '8.5', gradoLabel: 'grado 5º', gradoLetter: 'e', alturaApartado: '2',
                front_m: 5, side_m: 3, rear_m: NZ8_REAR_AT_7,
                maxCoverage: 0.5, plotRatioFAR: 0.8, maxHeight_m: 7, maxFloors: 2,
                extraRef:
                    '⚠ Grado 5º is the ONLY NZ 8 grado on Art. 8.8.10 ap. 2 (2 plantas / 7,00 m), so its ' +
                    'testero separation resolves to 4,67 m, not 7,00 m.',
            }),
            nz8Zone({
                code: '8.6', gradoLabel: 'grado 6º', gradoLetter: 'f', alturaApartado: '1',
                front_m: 4, side_m: NZ86_SIDE, rear_m: NZ8_REAR_AT_10_5,
                maxCoverage: 0.3, plotRatioFAR: MADRID_NZ86_FAR_EXCESS, maxHeight_m: 10.5, maxFloors: 3,
                extraRef:
                    '⚠ TWO grado-6º-only departures. (1) The lateral separation is itself a formula — ' +
                    'Art. 8.8.6.1.f) max(3, H_cornisa/2) ⇒ 5,25 m at 10,50 m, not the printed 3 m. ' +
                    '(2) THE FAR IS A STEP FUNCTION OF PARCEL AREA — Art. 8.8.9.1.f): 0,7 m²/m² on the ' +
                    'first 500 m² and 0,5 on the excess. The packed 0,5 is the EXCESS coefficient, chosen ' +
                    'because 0,7 would over-state every parcel above 500 m². Call ' +
                    'madridNZ86BuildableArea_m2() for the exact rule.',
            }),

            // ══ NZ 9 — Edificación industrial (Capítulo 8.9). SETBACK. ════════════════════════
            //
            // ⚠ CAPÍTULO 8.9 CONTAINS NO OCUPACIÓN ARTICLE AT ALL — there is no equivalent of
            // 8.4.8 / 8.5.7 / 8.7.8 / 8.8.8 anywhere in Arts. 8.9.1–8.9.16. `maxCoverage: null`
            // on all six grados means "no coverage rule exists", NOT "0 % may be built". The
            // footprint is a residual of the separación (8.9.6), alineación (8.9.7) and
            // inter-building (8.9.8) rules together with the FAR (8.9.9).
            zone({
                code: '9.1',
                label: 'Norma Zonal 9 — Edificación industrial, grado 1º',
                permittedUse: ['industrial'],
                // Art. 8.9.10.1 street-width table → madridAnchoDeCalle.ts. NOT a scalar.
                maxHeight_m: null,
                maxFloors: null,
                plotRatioFAR: 2.4,
                maxCoverage: null,
                setbacks: { front_m: 0, side_m: 0, rear_m: MADRID_NZ9_TESTERO_SEPARATION.floor_m },
                ordinanceRef:
                    'PGOUM-97 Art. 8.9.9 ap. a) (edificabilidad neta 2,4 m²/m² por parcela edificable), ' +
                    'Art. 8.9.7 ap. 1 (fachada SOBRE y a lo largo de la alineación oficial — alineación ' +
                    'obligatoria, hence front 0, not a permissive zero), Art. 8.9.6 ap. 1 (entre medianeras ' +
                    'en los DOCE (12) PRIMEROS METROS DE FONDO, separándose 3 m del resto — ⚠ a two-tier ' +
                    'side rule PRYZM cannot express; the packed 0 is the first-12 m regime and OVER-STATES ' +
                    'beyond it), Art. 8.9.6 ap. 1 (lindero testero max(3, H_coronación/3) — the 3 m FLOOR ' +
                    'is packed because the height is unresolved; see MADRID_FLOOR_ONLY_SEPARATIONS), ' +
                    'Art. 8.9.1.3 (uso cualificado industrial). ⚠ maxHeight/maxFloors NULL = Art. 8.9.10.1 ' +
                    'street-width table (3 bands, top at 18 m — NOT NZ 4\'s 4-band table). ⚠ maxCoverage ' +
                    'NULL = Capítulo 8.9 has no ocupación article. ⚠ Art. 8.9.6.1\'s 12 m is a PARTY-WALL ' +
                    'threshold, NOT a fondo edificable — Art. 8.9.14.1 contemplates build depths over 80 m.',
            }),
            zone({
                code: '9.2',
                label: 'Norma Zonal 9 — Edificación industrial, grado 2º',
                permittedUse: ['industrial'],
                maxHeight_m: null,
                maxFloors: null,
                plotRatioFAR: 2.4,
                maxCoverage: null,
                setbacks: { front_m: 0, side_m: 0, rear_m: MADRID_NZ9_TESTERO_SEPARATION.floor_m },
                ordinanceRef:
                    'PGOUM-97 Art. 8.9.9 ap. a) (edificabilidad neta 2,4 m²/m²), Art. 8.9.7 ap. 1 ' +
                    '(alineación obligatoria), ' +
                    'Art. 8.9.6 ap. 1 (medianeras en los 12 primeros metros, 3 m en el resto — two-tier, ' +
                    'not expressible; packed 0 OVER-STATES beyond 12 m), Art. 8.9.6 ap. 1 (testero ' +
                    'max(3, H/3), floor packed), Art. 8.9.1.3 (industrial). ⚠ maxHeight NULL = ' +
                    'Art. 8.9.10.1 street-width table. ⚠ maxCoverage NULL = no ocupación article exists.',
            }),
            zone({
                code: '9.3',
                label: 'Norma Zonal 9 — Edificación industrial, grado 3º',
                // Art. 8.9.1.3 — *"industrial en coexistencia con terciario de oficinas"*.
                permittedUse: ['industrial', 'commercial'],
                maxHeight_m: 28,
                maxFloors: 7,
                plotRatioFAR: 1.6,
                maxCoverage: null,
                // ⚠ FRONT 0 MEANS "NO MINIMUM IS IMPOSED", NOT "BUILD ON THE LINE". Art. 8.9.7.2:
                // *"La nueva edificación podrá separarse de la alineación oficial en función de sus
                // necesidades."* The two readings differ legally but not geometrically — either way
                // the front edge is not eroded — so 0 is the correct ENVELOPE value and the legal
                // distinction lives in the ordinanceRef, where it cannot be extruded.
                setbacks: { front_m: 0, side_m: 3, rear_m: 3 },
                ordinanceRef:
                    'PGOUM-97 Art. 8.9.9 ap. b) (edificabilidad neta 1,6 m²/m²), Art. 8.9.10 ap. 2 ' +
                    '(7 plantas / 28 m de CORNISA), Art. 8.9.6 ap. 2 (separación al lindero correspondiente ' +
                    '≥ 3 m — the article does not distinguish lateral from testero in grados 3º/4º.a), ' +
                    'Art. 8.9.7 ap. 2 (NO minimum retranqueo — "podrá separarse … en función de sus ' +
                    'necesidades"; the packed 0 records the absence of a constraint, not a build-to line), ' +
                    'Art. 8.9.1.3 (industrial en coexistencia con terciario de oficinas). ⚠ maxCoverage ' +
                    'NULL = Capítulo 8.9 has no ocupación article. ⚠ Arts. 8.9.6.5/8.9.6.6 admit ' +
                    'adosamiento to a lateral lindero per Art. 6.3.13 — an option, not modelled.',
            }),
            zone({
                code: '9.4.a',
                label: 'Norma Zonal 9 — Edificación industrial, grado 4º nivel a',
                permittedUse: ['industrial'],
                maxHeight_m: 20,
                maxFloors: 5,
                plotRatioFAR: 2.4,
                maxCoverage: null,
                setbacks: { front_m: 0, side_m: 3, rear_m: 3 },
                ordinanceRef:
                    'PGOUM-97 Art. 8.9.9 ap. a) (edificabilidad neta 2,4 m²/m²), Art. 8.9.10 ap. 3 (5 plantas / 20 m de ' +
                    'CORNISA), Art. 8.9.6 ap. 2 (linderos ≥ 3 m), Art. 8.9.7 ap. 2 (no minimum retranqueo ' +
                    '— packed 0 = absence of a constraint), Art. 8.9.1.3 (industrial). ⚠ maxCoverage NULL ' +
                    '= no ocupación article in Capítulo 8.9.',
            }),
            zone({
                code: '9.4.b',
                label: 'Norma Zonal 9 — Edificación industrial, grado 4º nivel b',
                permittedUse: ['industrial'],
                maxHeight_m: 28,
                maxFloors: 7,
                plotRatioFAR: 2.4,
                maxCoverage: null,
                setbacks: { front_m: 8, side_m: 6, rear_m: 6 },
                ordinanceRef:
                    'PGOUM-97 Art. 8.9.9 ap. a) (edificabilidad neta 2,4 m²/m²), Art. 8.9.10 ap. 2 (7 plantas / 28 m de ' +
                    'CORNISA), Art. 8.9.6 ap. 3 (separación a linderos 6 m), Art. 8.9.7 ap. 3.a) ' +
                    '(separación mínima del plano de fachada a la alineación oficial 8 m), Art. 8.9.1.3 ' +
                    '(industrial). ⚠ maxCoverage NULL = no ocupación article in Capítulo 8.9.',
            }),
            zone({
                code: '9.5',
                label: 'Norma Zonal 9 — Edificación industrial, grado 5º',
                permittedUse: ['industrial'],
                maxHeight_m: 20,
                maxFloors: 5,
                plotRatioFAR: 2.0,
                maxCoverage: null,
                setbacks: { front_m: 6, side_m: 4, rear_m: 4 },
                ordinanceRef:
                    'PGOUM-97 Art. 8.9.9 ap. c) (edificabilidad neta 2,0 m²/m²), Art. 8.9.10 ap. 3 ' +
                    '(5 plantas / 20 m de CORNISA), Art. 8.9.6 ap. 4 (separación a linderos 4 m), ' +
                    'Art. 8.9.7 ap. 3.b) (retranqueo a la alineación oficial 6 m), Art. 8.9.1.3 ' +
                    '(industrial). ⚠ maxCoverage NULL = no ocupación article in Capítulo 8.9.',
            }),
        ],
    });

/**
 * The 23 zone codes this pack answers for — the live `AMB_TX_ETIQ` vocabulary, verbatim.
 *
 * ⚠ NOT here and MUST NOT BE ADDED: `1.1`…`1.6` (Norma Zonal 1 — `esMadridNZ1.ts` owns them as an
 * `explicit-area` zone; a settled decision) and `3.1`/`3.1.a`/`3.1.b`/`3.1.c`/`3.2` (Norma Zonal 3
 * — a cited REFUSAL, `madridNZ3Refusal`). 23 + 6 + 5 = the 34 codes `NORMAS_ZONALES/0` publishes.
 */
export const MADRID_PGOUM97_ZONE_CODES = [
    '4',
    '5.1', '5.2', '5.3',
    '7.1.a', '7.1.b', '7.2.e',
    '8.1.a', '8.1.c', '8.2.a', '8.2.b', '8.2.c', '8.3.a', '8.3.c', '8.4', '8.5', '8.6',
    '9.1', '9.2', '9.3', '9.4.a', '9.4.b', '9.5',
] as const;

/** Norma Zonal 3's live codes. A REFUSAL, never a pack — see `madridNZ3Refusal`. */
export const MADRID_NZ3_ZONE_CODES = ['3.1', '3.1.a', '3.1.b', '3.1.c', '3.2'] as const;

/**
 * NORMA ZONAL 3 — *Volumetría Específica*. A **legally grounded refusal**, and the clearest one in
 * Madrid: the ordinance ANSWERS the question, and its answer is "not by a zone envelope".
 *
 * Eleven cited quotes support it (`extracted/nz3-refusal.json`); four are decisive:
 *   • Art. 8.3.1 — *"se considera concluido el proceso de ocupación del espacio y, consecuentemente,
 *     en la misma medida SE HA AGOTADO EL APROVECHAMIENTO URBANÍSTICO."* The zone exists precisely
 *     because buildability is already consumed. There is nothing left to allocate by rule.
 *   • Art. 8.3.1 — *"el Plan General asume la consolidación de la ciudad resultante … SIN IMPONER
 *     UN NUEVO MODELO."* The Plan deliberately declines to state parameters.
 *   • Art. 8.3.3.1.b)/2 — even the qualified USE is *"el derivado de la calificación de las parcelas
 *     en los instrumentos de planeamiento inmediatamente anteriores"*: per-parcel, from a document
 *     PRYZM does not hold.
 *   • Art. 8.3.5.3.a)i) — a replacement building *"deberá inscribirse dentro de la envolvente
 *     exterior del edificio existente"*. The envelope IS the existing building — a survey figure,
 *     not a plan parameter.
 *
 * ⚠ Art. 8.3.5.3.a)i) also borrows NZ 5 and NZ 8 grado 4º parameters for repositioning, and
 * Art. 8.3.5.3.b)ii)b) mentions 1,4 m²/m². **Neither makes NZ 3 packable.** The 1,4 is NZ 5 grado
 * 3º's own figure (Art. 8.5.8.c) applied by reference to DOTACIONAL parcels only; generalising it
 * to NZ 3 land would be a real number answering a different question (C58 §1.11).
 *
 * `legallyGrounded: true` — this is the ordinance's answer, not a gap in PRYZM's data.
 * `code: 'derived-plan'` — buildability derives from an antecedent instrument, per parcel.
 *
 * P8 — emits `pryzm.zoning.es.madrid.nz3Refusal`.
 */
export function madridNZ3Refusal(knownFacts: readonly string[] = []): EnvelopeRefusal {
    const span = tracer.startSpan('pryzm.zoning.es.madrid.nz3Refusal');
    try {
        return {
            code: 'derived-plan',
            headline:
                'Madrid Norma Zonal 3 (Volumetría Específica) — the PGOUM states no buildable envelope here.',
            detail:
                'Norma Zonal 3 covers land where the PGOUM-97 considers the development process ' +
                'complete and the aprovechamiento urbanístico already exhausted (Art. 8.3.1), and ' +
                'where the Plan expressly consolidates what earlier instruments produced "sin imponer ' +
                'un nuevo modelo". So there is no zone-level edificabilidad, altura, ocupación or ' +
                'retranqueo to publish: buildability for your parcel comes from the ANTECEDENT ' +
                'planning instrument it was calificado under (the 1985 Plan General for grado 1º; the ' +
                'specific ordenación, APD or remitted plan for grado 2º), and for works on an existing ' +
                'building it equals that building\'s own surveyed floor area and outer envelope ' +
                '(Art. 8.3.5). PRYZM holds neither document, so rather than fabricate a setback triple ' +
                'or an edificabilidad it declines to draw a buildable envelope — no number is shown ' +
                'because none can be cited. What would unlock it: the per-parcel antecedent instrument, ' +
                'or a survey of the existing building.',
            ordinanceRef:
                'PGOUM-97 Art. 8.3.1 (aprovechamiento agotado; el Plan no impone un nuevo modelo), ' +
                'Art. 8.3.3 ap. 1.b) y 2 (uso cualificado derivado del planeamiento antecedente), ' +
                'Art. 8.3.4 ap. 1 y 2 (parcelación diferida), Art. 8.3.5 ap. 1 y ap. 3 (edificabilidad = ' +
                'la del edificio existente; la nueva edificación se inscribe en su envolvente) — ' +
                MADRID_PGOUM97_SOURCE,
            legallyGrounded: true,
            knownFacts: [...knownFacts],
        };
    } finally {
        span.end();
    }
}

/**
 * The "machine-extracted, unverified" refusal every Madrid parcel routed to THIS pack must receive
 * while `MADRID_ENVELOPE_VERIFIED === false`.
 *
 * ⚠ `legallyGrounded: false` — the LAW is known and transcribed; what is missing is a HUMAN
 * signature on our transcription. That is a statement about PRYZM's process, never about the
 * ordinance, and conflating the two is the §CONTEXT-DATA-HONESTY failure (L-422/457/469).
 * `code: 'source-data-unavailable'` for the same reason: it is our input that is not yet
 * admissible, not the plan that is silent.
 *
 * P8 — emits `pryzm.zoning.es.madrid.unverifiedRefusal`.
 */
export function madridPgoum97UnverifiedRefusal(
    zoneCode: string,
    knownFacts: readonly string[] = [],
): EnvelopeRefusal {
    const span = tracer.startSpan('pryzm.zoning.es.madrid.unverifiedRefusal');
    try {
        span.setAttribute('pryzm.madrid.zoneCode', zoneCode);
        return {
            code: 'source-data-unavailable',
            headline:
                `Madrid Norma Zonal ${zoneCode} — PRYZM holds the ordinance figures, but they are not ` +
                'yet human-verified.',
            detail:
                'PRYZM has transcribed the PGOUM-97 conditions for this zone from the Compendio 2025 ' +
                'of the Normas Urbanísticas (consolidated 24-09-2025), with the article, apartado, page ' +
                'and verbatim wording recorded for every number. That transcription was produced by an ' +
                'automated reader of the official text and has NOT yet been checked line by line by a ' +
                'human planning professional. Transcribing an ordinance is a legal act, so PRYZM will not ' +
                'render an envelope on an unverified reading: no number is shown until the verification ' +
                'record is signed. The figures themselves are already citable in the source dossier.',
            ordinanceRef: MADRID_PGOUM97_SOURCE,
            legallyGrounded: false,
            knownFacts: [...knownFacts],
        };
    } finally {
        span.end();
    }
}

// ─── WIRING TODO (ORCHESTRATOR ONLY — an implementer agent must not do any of this) ──────────────
//
// 1. ⛔ THE HUMAN GATE. `MADRID_ENVELOPE_VERIFIED` stays `false` until a Spanish-planning-literate
//    reviewer signs `docs/.../28079-madrid/sources/VERIFICATION.md` against the Compendio 2025, and
//    that signature is recorded as a C23 AIArtefact with `humanApproval`. Zones NOT ready for that
//    signature even in principle: `4`, `9.1`, `9.2` (unresolved street-width heights ⇒ floor-only
//    testero separations, see MADRID_FLOOR_ONLY_SEPARATIONS) and `5.1`/`5.2`/`5.3` (the Art. 8.5.6.3
//    eje-de-calle front rule is unmodelled). NZ 7 and NZ 8 are the sign-off-ready families.
// 2. ⛔ REGISTER in `registry.ts` — the Madrid `JurisdictionRegistration` currently carries
//    `packsByZone: packMap()` and a WIRING TODO asking for exactly this. Replace with
//    `packsByZone: packMap([ES_MADRID_PGOUM97_PACK, [...MADRID_PGOUM97_ZONE_CODES]])`, add
//    `refusalFor` routing MADRID_NZ3_ZONE_CODES → `madridNZ3Refusal`, and narrow
//    `noRulePackRefusal` to the genuinely-unpacked codes (NZ 1's `1.*`, which keeps
//    `madridNZ1Refusal`). `packMap()` throws on a duplicate, so adding `1.*` here is impossible.
// 3. ⛔ EXPORT from `packages/site-parcel-data/src/index.ts` (this file and
//    `madridAnchoDeCalle.ts` are not in the barrel yet).
// 4. ⛔ L5 DISPATCH — `apps/editor/src/ui/site/siteDispatch.ts` must resolve the zone code from
//    `NORMAS_ZONALES/MapServer/0.AMB_TX_ETIQ` (spatial point-intersect, same-origin proxy) and
//    gate on `MADRID_ENVELOPE_VERIFIED`, dispatching `madridPgoum97UnverifiedRefusal` while it is
//    false — the `applyCordobaZoningThenFallback` shape, verbatim.
// 5. ⛔ THE STREET-WIDTH RESOLVER. `madridAnchoDeCalle.ts` holds the three cuadros and refuses at a
//    band edge; nothing feeds it a width yet. Madrid's measured quantum set is {15, 30} (L-537
//    probe) — a Madrid `StreetWidthQuantisation` is the analogue of `BCN_STREET_WIDTH_QUANTISATION`
//    and must be derived from Madrid's own probe, never copied from Barcelona's {20, 30}.
//    Until it lands, `4`, `9.1` and `9.2` publish no height.
// 6. ⛔ NOT MODELLED, EACH A CITED GAP, none of them safe to invent: Art. 8.5.6.3's eje-de-calle
//    front rule (a NEW rule kind); NZ 9 grados 1º/2º's two-tier side rule (party wall for 12 m,
//    then 3 m); Art. 6.6.8.2's independent 2:1 cornisa/street-width cap; the per-façade height
//    datum split (access façade vs the rest, Art. 8.8.10.1); the 10 %-area top storey allowances;
//    NZ 7's tiered below-grade occupation; and NZ 8 grado 6º's per-parcel FAR step (use
//    `madridNZ86BuildableArea_m2`).
