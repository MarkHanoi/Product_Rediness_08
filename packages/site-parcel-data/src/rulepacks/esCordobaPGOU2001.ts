// Córdoba (INE 14021) — PGOU-2001 (Texto Refundido Oct. 2002) rule pack.
//
// ⚠⚠⚠ THIS FILE IS NOW REGISTERED (WIRING-TODO 1/2/4/5 applied) — but the HONESTY GATE means it
// renders NO number. Every Córdoba parcel resolves to a cited REFUSAL until a human signs
// `sources/VERIFICATION.md`: registration + refusal, never registration + a machine-read number.
// The gate lives in the dispatcher (`applyCordobaZoningThenFallback`, `CORDOBA_ENVELOPE_VERIFIED`).
// ============================================================================================
//
// PROVENANCE & CONFIDENCE — READ THIS BEFORE TRUSTING A SINGLE NUMBER
// ------------------------------------------------------------------
// Every value below was **machine-extracted** (OCR / vision-read) from the scanned/born-digital
// PGOU-2001 ordinance PDFs served by the COACo GeoServer (`coaco:ordenanzas.link`). It has passed the
// cheap auto-gates (locale-normalise, range, algorithm-detector) but has **NOT been human-verified
// against the source**. Its TRUE honesty tier is `pipeline-extracted-unverified` — the permanent tier
// BELOW `estimated-ruleset` defined in `docs/04-reference/ORDINANCE-EXTRACTION-PIPELINE.md §3`.
//
// ⚠ THE STALE CLAIM IS CORRECTED (this comment used to say the enum was absent — it is NOT):
// `pipeline-extracted-unverified` (EnvelopeConfidence + RulePackDefaultConfidence) and
// `pipeline-extracted` (FieldProvenance) ALREADY EXIST in
// `packages/schemas/src/site/zoning/ProvenanceFlags.ts`. So, applied here (WIRING-TODO 1/2, DONE):
//
//   • `defaultConfidence: CORDOBA_INTENDED_DEFAULT_CONFIDENCE` (`pipeline-extracted-unverified`) — the
//     honest, permanent bottom tier. It NO LONGER over-states, because the schema now accepts it.
//   • `fieldProvenance` is `'pipeline-extracted'` (= CORDOBA_INTENDED_FIELD_PROVENANCE) on every value:
//     machine-extracted, strictly BELOW the human `'ordinance-pdf'`, and it drives the LOUDER-than-
//     estimated "machine-extracted, unverified" affordance (ORDINANCE-EXTRACTION-PIPELINE.md §3.1c).
//
// ⚠ THE INTERLOCK MOVED, IT DID NOT DISAPPEAR. The pack is registered, so the honest tier is now the
// LABEL. The SAFETY is the VERIFICATION GATE in the dispatcher: until `sources/VERIFICATION.md` is
// human-signed, every Córdoba parcel renders a cited REFUSAL and NO numeric envelope reaches the
// panel/massing (WIRING-TODO 3/5). A number renders only AFTER sign-off, and even then as
// `pipeline-extracted-unverified` with the louder affordance — never as a plain estimate.
//
// ⬆⬆ 2026-08-01 — SECOND-PASS SOURCE VERIFICATION DONE. Every article cited below was re-read from
// the publisher's own PDFs by an INDEPENDENT method: the raster-render path, because `O_PAS2`,
// `O_OA1`, `O_CTP1` and `O_MC` have a ZERO-CHARACTER text layer and `O_UAD3` uses subset CID fonts.
// RESULT: **13 of 13 subzones verified, ZERO wrong values** — including MC-3 = 3,50 (correct; the
// range-gate flag was a false alarm) and the whole MC per-street-width height table.
// THREE defects were found, NONE of them a wrong shipped digit — see VERIFICATION.md §SIG-1:
//   D1 ✅ UAD *profundidad máxima edificable* (Art. 13.9.3.3 — 16/18/16 m) was STATED IN THE SOURCE
//         AND MISSING FROM THIS PACK. ⬆ CLOSED 2026-08-02: all three UAD subzones now carry an
//         `alignment` geometricRule with the stated depth (see the UAD block below). It was
//         reported first and patched second, so the founder saw it before signing. The change only
//         ever REMOVES buildable area — it closes an L-616 overstatement, it does not add capacity.
//   D2 ⚠  the CTP-1 ocupación step-function was mis-documented (middle band is an ABSOLUTE 100 m²
//         cap, not 100 %); the shipped scalar 0.80 is correct and unaffected.
//   D3 ⚠  the MC "no fondo stated" rationale is FALSE (Art. 13.5.2.4 says depth is *libre*, bounded
//         by ocupación); the structural refusal stays correct, but for the HEIGHT reason only.
// Verification ledger + the measured ENVELOPE ceiling (≈16 % full / ≈31 % any, of BUILDABLE land):
//   docs/04-reference/jurisdictions/es/es-an/14021-cordoba/sources/VERIFICATION.md
// Full extraction record, per family, per field, with the gate flags and the source article:
//   docs/04-reference/jurisdictions/es/es-an/14021-cordoba/findings/OCR-EXTRACTION-RESULTS.md
// Pack design rationale + what is deliberately NOT packed:
//   docs/04-reference/jurisdictions/es/es-an/14021-cordoba/findings/ORDENANZA-PACK-SPEC.md
//
// WHAT IS PACKED AND WHY (5 families, ~89 % of the 5 725-parcel Sur+Noroeste pilot)
// --------------------------------------------------------------------------------
//   • PAS (Plurifamiliar Aislada) — FULL. Every field a stated scalar. `kind:'setback'`.
//   • OA  (Ordenación Abierta)    — FULL. `kind:'setback'`.
//   • UAD (Unifamiliar Adosada)   — FULL. Retranqueo setbacks PLUS an `alignment` geometricRule
//     carrying the stated Art. 13.9.3.3 *profundidad máxima edificable* (16/18/16 m from the vial
//     alignment), so a deep UAD parcel clips to the depth band instead of drawing the whole plot.
//   • CTP-1 (Colonia Tradicional Popular) — PARTIAL. altura+ocupación+alignment clean; edificabilidad
//     is DERIVED (null). Alignment zone (front on the vial line) → `setbacks:null` PLUS an
//     `alignment` geometricRule carrying the REAL 16 m *profundidad edificable* (Art. 13.8.2.4), so
//     it clips to a depth band and never draws the whole parcel (L-616 guard).
//   • MC  (Manzana Cerrada)       — PARTIAL. coverage+use clean; height is a per-street-width TABLE
//     (null scalar); edificabilidad DERIVED except MC-3 (3.50, which the range gate flags). Alignment
//     zone with NO held depth → an `explicit-area` geometricRule with an UNRESOLVABLE footprint handle
//     (CORDOBA_MC_FONDO_UNRESOLVED_RING): a cited STRUCTURAL REFUSAL, never a full-parcel box (L-616).
//   • PTC (Campo de la Verdad)    — ⭐ PARTIAL, PACKED 2026-08-04. Art. 13.4.1 redirects the envelope
//     to the Conjunto Histórico Tomo VI "Ordenanza de Protección Tipológica" (Art. 43-55), which IS
//     now held (`Normativa_del_conjunto_histórico.pdf` / `normativa_PEPCH_Revisado.pdf`, cross-
//     verified verbatim via `pdftotext`). coverage+use clean (70 %/80 %, Art. 46.1); height is
//     PER-PARCEL from an unheld plan sheet (Art. 49.1) → null; no stated buildable depth (Art. 47's
//     patio-siting rule is real but not a numeric depth) → `explicit-area` with an UNRESOLVABLE
//     footprint handle (CORDOBA_PTCV_FOOTPRINT_UNRESOLVED_RING), MC-shaped, never a full-parcel box.
//
// WHAT IS DELIBERATELY NOT PACKED (each a cited "no", never an estimate) — see the SPEC:
//   • Uso Industrial — 1 parcel, subzone-unbindable, ocupación DERIVED (the sufficiency trap).
//   • Uso Comercial — context-dependent overlay (defers to underlying zone / Plan Parcial).
//   • Elemento protegido — a preservation regime; envelope = the existing building. A refusal, not a pack.
//   • Unifamiliar Aislada (UAS) — ⚠ STALE-CLAIM CORRECTED 2026-08-04: this line used to say "dead
//     `O_UAS1` link; content in no held document". That is no longer true of the CONTENT: Art. 13.10
//     (6 subzones, UAS-1…UAS-6, every field a stated scalar — edificabilidad 0,40→0,18, parcela
//     mínima 600→1.700 m², ocupación 40 %→18 %, altura PB+1/7 m, retranqueos 6 m frontal / 3 m
//     lindero) was RECOVERED from the consolidated, born-digital "PLAN GENERAL DE ORDENACION
//     CORDOBA 2001, TEXTO REFUNDIDO OCT. 2002 — NORMATIVA: USOS, ORDENANZAS Y URBANIZACIÓN" (Tomo
//     II; innovaciones 1-2-2021 / guía práctica 26-5-2021), the SAME volume this file already cites
//     as its authoritative source — see `findings/CORDOBA-ORDINANCE-REGISTRY.md §6`. What is STILL
//     true, and is the actual reason this family stays unpacked, is the exact same shape as Uso
//     Industrial above: the COACo `coaco:ordenanzas` calificación names only the FAMILY
//     ("Unifamiliar Aislada"), never a UAS-1…UAS-6 subzone suffix, so the one UAS parcel in the pilot
//     cannot be BOUND to any single row of the six — picking one (FAR ranges 0,40 down to 0,18,
//     parcela mínima 600 up to 1.700 m²) would be a guess dressed as a determination, exactly the
//     `regime-undetermined` case `cordobaUasChapterUnobtainableRefusal` in
//     `esCordobaZoneClassification.ts` is written for. Content-known ≠ parcel-bindable; do not pack
//     until the publisher's calificación carries a subzone key (`CORDOBA-ORDINANCE-REGISTRY.md §6`:
//     "Record the numbers for the SPEC; do not auto-pack until binding is solved").
//
// EVERY `null` BELOW IS A FINDING WITH A REASON (C58 §1.7a: null ≠ 0), never a placeholder:
//   • edificabilidad null on CTP-1 / MC-1/2/4 = the DERIVED "resultante de las Normas de Composición"
//     algorithm — emitting a number would be the confident-wrong catastrophe.
//   • maxHeight/maxFloors null on MC = the per-street-width TABLE (Art. 13.5.3.1); a scalar would
//     publish one street's answer for the whole zone (the L-526 failure). Needs a street-width resolver.
//   • setbacks null on CTP-1/MC = alignment zones (façade ON the vial line); null makes containment
//     SKIP the edge, whereas 0 would assert "the ordinance requires zero clearance".
//
// Legal frame: PGOU-2001, LOUA → LISTA (Ley 7/2021). Source volume: "PLAN GENERAL DE ORDENACION
// CORDOBA 2001, TEXTO REFUNDIDO OCT. 2002 — NORMATIVA: USOS ORDENANZAS Y URBANIZACION", Gerencia de
// Urbanismo, Ayuntamiento de Córdoba. Strategic context: C57, C58 §1.1/§1.2/§1.4/§1.6/§1.7a/§1.11/§2.2,
// C23 §1.1, ORDINANCE-EXTRACTION-PIPELINE.md, §CONTEXT-DATA-HONESTY.

import { trace, SpanStatusCode } from '@opentelemetry/api';
import {
    JurisdictionZoningContractSchema,
    type JurisdictionZoningContract,
} from '@pryzm/schemas';

/** The jurisdiction id Córdoba packs and records use. One constant, not a scattered literal. */
export const CORDOBA_JURISDICTION_ID = 'es-14021-cordoba';

/**
 * The honesty tier for every value in this pack. The enum now EXISTS in `ProvenanceFlags.ts`, so
 * these are APPLIED below (WIRING-TODO 1/2 done): `defaultConfidence` = the confidence constant,
 * every `fieldProvenance` value = the provenance constant. Recorded as named constants so the
 * intent is greppable and the test can assert the applied values equal them.
 */
export const CORDOBA_INTENDED_DEFAULT_CONFIDENCE = 'pipeline-extracted-unverified' as const;
export const CORDOBA_INTENDED_FIELD_PROVENANCE = 'pipeline-extracted' as const;

const SRC =
    'PGOU-Córdoba-2001 (Texto Refundido Oct. 2002), Normativa: Usos Ordenanzas y Urbanización, ' +
    'Gerencia de Urbanismo, Ayuntamiento de Córdoba. MACHINE-EXTRACTED (OCR/vision), NOT ' +
    'human-verified — pipeline-extracted-unverified. See findings/OCR-EXTRACTION-RESULTS.md.';

/**
 * ⚠ L-616 GUARD — the MC (Manzana Cerrada) STRUCTURAL REFUSAL handle.
 *
 * Every MC subzone is an ALIGNMENT zone (façade on the vial line, Art. 13.5.2.3) with setbacks null.
 * With NO `geometricRule` it would inset by 0 and draw the WHOLE PARCEL the day the gate opens
 * (ENVELOPE-REALISM-MATRIX mechanism A — the latent OVERSTATES-BOTH this file must never permit).
 *
 * ⚠ D3 — THIS RATIONALE WAS WRONG AND IS CORRECTED (2026-08-01, verified 380 dpi). It used to read
 * "MC states NO *profundidad edificable* we hold". Art. **13.5.2.4** in fact states: «Cuando este
 * parámetro no venga expresamente fijado, se entenderá **libre**, con la única condición de que la
 * ocupación del edificio en planta no podrá rebasar los límites … del apartado 5» — depth is
 * UNCONSTRAINED, bounded by ocupación, which this pack HOLDS (0.70 / 0.90). So the ordinance itself
 * requires NO MC block-fondo geometry source: unlike `block-derived-alignment` (PGM Art. 242.2) or
 * `tiered-occupation` (PGM Art. 350.2), Art. 13.5.2.4's depth is not a function of the BLOCK at all.
 *
 * ⚠ RE-CHECKED 2026-08-04 (CLOSURE-REGISTER footprint task) — A LATER, SEPARATE CLAIM BUILT ON D3 WAS
 * ALSO WRONG, and is corrected here so this comment stops contradicting itself: "no block ring is
 * needed" was read as "the height resolver ALONE lifts MC to a real envelope" (see the retracted
 * framing this replaced, and WIRING-TODO 6 below). It does not, because "no block needed" is not the
 * same claim as "no footprint construction needed". Checked directly against the `GeometricRule`
 * union (`packages/schemas/src/site/GeometricRule.ts`) and `ZoningRulesEngine.ts`'s solve paths:
 *   • `alignment` requires a STATED, STRICTLY-POSITIVE `buildableDepth_m` scalar (schema: `z.number()
 *     .positive()`, not nullable/optional). Art. 13.5.2.4 states no number — it states the opposite,
 *     that no number applies — so writing `buildableDepth_m: null` (or any invented figure) is not a
 *     legal value of this kind; it would either fail Zod validation or, worse, publish a fabricated
 *     depth under a citation that says depth is free (C58 §1.7a).
 *   • `explicit-area` (this kind, below) needs an actual PUBLISHED footprint ring injected by a
 *     provider (`resolveExplicitAreaRing` / `solveExplicitArea`, `geometry/explicitArea.ts`) — the
 *     Madrid `Fondo de la Edificación` polyline case. Córdoba's PGOU does not publish MC footprints as
 *     geometry (Art. 13.5.2.4 is a NUMERIC occupation rule, not a drawn plan), so there is nothing for
 *     `ringRef` to resolve to. `CORDOBA_MC_FONDO_UNRESOLVED_RING` names exactly that absence.
 *   • `block-derived-alignment` / `tiered-occupation` both require a block ring by their own schema
 *     (`requiresBlockRing()`) AND both construct depth from a BLOCK-level geometric condition (Art.
 *     242.2's concentric band, Art. 350.2's area equality on the block) that Art. 13.5.2.4 does not
 *     state — MC's occupation cap is a plain area ratio of the PARCEL, not a shape derived from the
 *     block, so neither kind's construction is even the right one to reach for here.
 *   • The engine's occupation cap (`maxCoverage`) is ALSO not a general footprint-shaping mechanism
 *     today: `ZoningRulesEngine.ts` applies `maxCoverage.value * polygonArea(parcelRing)` as an area
 *     clamp on the STUDY VOLUME (`maxVolumeM3`) ONLY inside the `tiered-occupation` branch
 *     (`tiers.length > 0`), never as a general ring-shaping clip (ADR-0272 §3.2: "a coverage limit
 *     constrains HOW MUCH ground is occupied, never WHERE, so it must not reshape a polygon"). There is
 *     no existing code path, for ANY `geometricRule` kind, that turns "ocupación ≤ 70 %/90 % of the
 *     parcel, no depth clip" into a footprint RING on its own — and it could not do so honestly even if
 *     wired up, because an area cap with no siting rule does not determine a unique polygon (where the
 *     70 % sits on the plot is exactly the thing Art. 13.5.2.4 does not say).
 *
 * So THE FOOTPRINT GROUND FOR THE REFUSAL ALSO STANDS, independently of height, and independently of
 * any block geometry PRYZM lacks. It is a GENUINE PRODUCT/ENGINEERING GAP, not a missing external data
 * source: closing it needs either (a) real published MC footprint geometry for Córdoba (unlikely to
 * exist, per the above), or (b) a NEW `GeometricRule` kind — e.g. an "occupation-only" variant that
 * states an explicit siting convention for how the capped area sits on the parcel (analogous to how
 * `tiered-occupation` states a concentric-band convention for Art. 350.2) — plus the matching engine
 * solve path. Designing that kind is a schema/engine change with its own citation and test surface; it
 * is explicitly OUT OF SCOPE for this pack file (C58 §1.7a: this file states facts about the ordinance,
 * it does not invent geometric conventions the ordinance itself never specifies).
 *
 * ⬆⬆ 2026-08-04 — (b) IS NOW BUILT: `OccupationCappedAlignmentRuleSchema` (`kind:
 * 'occupation-capped-alignment'`, `packages/schemas/src/site/GeometricRule.ts`, ADR-0288) plus its
 * `ZoningRulesEngine.ts` solve branch and `occupationCappedDepth.ts` geometry helper. Tested standalone
 * in `occupationCappedAlignmentEnvelope.test.ts` against a synthetic fixture pack — NOT against
 * Córdoba. Read that schema's header before considering it for MC: it does not extract a shape from
 * Art. 13.5.2.4, it CONSTRUCTS the maximal legally-consistent rectangle at the alignment's frontage
 * width and says so, loudly, in every caveat and derivation row it produces — a documented PRYZM
 * ENGINEERING DECISION, never presented as the ordinance's own stated shape.
 *
 * ⚠⚠ MC IS DELIBERATELY **NOT** WIRED TO IT HERE. Three independent reasons, not one:
 *   1. MC's height ground (Art. 13.5.3.1's per-street-width table) is STILL UNRESOLVED (no
 *      street-width resolver consumes `CORDOBA_MC_STREET_WIDTH_HEIGHT_TABLE` yet — see
 *      `cordobaMcResolvedPack`'s own header). Wiring the footprint alone would change MC's engine
 *      `status` from `degenerate` (today, via the unresolvable `explicit-area` ring) to `ok` WITH a
 *      real footprint and a `null` height/volume — a materially different shape of "no number yet"
 *      that this pack's existing structural-refusal tests (`esCordobaEnvelopeCompute.test.ts`,
 *      "MC-* is a STRUCTURAL REFUSAL") are not written to assert, and changing that assertion is a
 *      considered decision about what MC's refusal should look like, not a side-effect of adding a
 *      capability elsewhere.
 *   2. Confidence, not mechanics. The rectangle-at-frontage-width construction is defensible and
 *      tested in isolation, but "genuinely confident enough to bind it to a live, sign-gated pack"
 *      is a higher bar than "the tests pass" — and per the founder's own standing instruction on
 *      this exact gap, that bar is met by STOPPING at "capability built and tested in isolation,
 *      not yet wired to MC" rather than wiring it on mechanical confidence alone.
 *   3. ⚠ CORRECTED — `CORDOBA_ENVELOPE_VERIFIED` is **TRUE** (signed 2026-08-03,
 *      `esCordobaZoneClassification.ts:48`), NOT false as an earlier draft of this note claimed.
 *      That makes reason 1 MORE pressing, not less: MC's `explicit-area` structural refusal is
 *      LIVE in production today, so wiring the footprint half without the height half would be a
 *      real, user-visible `status` change (degenerate → ok-with-null-height) on a live pack, not a
 *      hypothetical one behind a closed gate. Separately, per this session's own capability audit,
 *      MC's remaining height ground (the street-width table) is judged NOT closeable by
 *      engineering alone — it needs an external alignment/frontage document Córdoba's publishers
 *      do not publish; sourcing it is a founder-level effort, unconfirmed as of this writing.
 * The footprint ground therefore STILL STANDS on its own, narrower reading: it is no longer "no
 * `GeometricRule` kind CAN express this" (that gap is closed) but "MC has not yet been RE-POINTED at
 * the kind that can" — a deliberate, separate, later decision. WIRING-TODO 6 below is corrected to
 * match.
 *
 * THE REFUSAL THEREFORE STANDS ON TWO INDEPENDENT GROUNDS, not one:
 *   1. HEIGHT — MC's height is a per-street-width TABLE we do not yet resolve (Art. 13.5.3.1,
 *      maxHeight null), so no storey count and therefore no volume can be honestly produced.
 *   2. FOOTPRINT — no `GeometricRule` kind in the current schema can honestly express "unconstrained
 *      depth, bounded only by a parcel-level ocupación cap with no stated siting rule" (see above).
 * Closing ONLY the height ground (the street-width resolver, WIRING-TODO 6) does NOT lift MC to a real
 * envelope by itself — the footprint ground is a separate, still-open blocker.
 *
 * The honest shape in the `GeometricRule` union is therefore `explicit-area` with a footprint HANDLE
 * that is DELIBERATELY UNRESOLVABLE for Córdoba: no MC footprint geometry is ever injected, so the
 * engine HARD-FAILS to `status:'degenerate'` and yields NO envelope (ZoningRulesEngine ~L661) — a
 * cited structural refusal, never a full-parcel box. It lifts to a real envelope only once BOTH the MC
 * street-width height resolver AND a new occupation-only geometric-rule capability (or real published
 * footprint geometry) exist — two independent unlocks, not one. The ring ref names the footprint gap so
 * a future reader does not mistake it for a published-geometry claim.
 */
export const CORDOBA_MC_FONDO_UNRESOLVED_RING =
    'cordoba-mc-fondo:UNRESOLVED/pgou-13.5.3.1-street-width-table' as const;

/**
 * ⚠⚠ PT-CV (Campo de la Verdad, `code:'PTC'`) — the MC-SHAPED STRUCTURAL REFUSAL handle.
 *
 * 2026-08-04 — PACKED. PGOU Art. 13.4.1 (TomoIIB_TR_A4_Revisado_Parte2.pdf) redirects this zone's
 * envelope to *"la Memoria y Normativa correspondiente al Conjunto Histórico (Tomo VI. Conjunto
 * Histórico)"* — the "PT" (Protección Tipológica) ordinance — except parcelación, which follows CTP
 * instead (a field this schema does not carry, so the exception has no effect on any packed value).
 * Tomo VI is NOW HELD in the corpus as `Normativa_del_conjunto_histórico.pdf` (internally titled
 * "TOMO VIB. CONJUNTO HISTÓRICO", 353 439 chars) and independently corroborated, article-for-article
 * and figure-for-figure, by the sibling `normativa_PEPCH_Revisado.pdf` (164 282 chars, the "Revisado"
 * standalone Normas). Both were extracted with `pdftotext` and cross-read verbatim for THIS pack
 * (2026-08-04), not merely re-quoted from a prior summary — see the article-by-article citations
 * on the `PTC` zone block below.
 *
 * WHAT IS STATED, VERIFIED VERBATIM IN BOTH DOCUMENTS:
 *   • Art. 46.1 — ocupación máxima 70 % de parcela (80 % edificación residencial unifamiliar).
 *   • Art. 45.2 — *"se prohíben toda clase de retranqueos debiéndose mantener el plano de fachada
 *     en toda su superficie"* — retranqueos categorically prohibited (front alignment, offset 0).
 *   • Art. 49.2 — alturas reguladoras máximas by floor count: PB 4,50 m · PB+1 8,00 m · PB+2 11,00 m
 *     · PB+3 14,00 m.
 *   • Art. 50 — one basement floor, capped at the ground-floor footprint.
 *
 * ⚠⚠ WHY `maxHeight_m` / `maxFloors` ARE STILL `null` DESPITE ART. 49.2's TABLE — read Art. 49.1
 * FIRST, verbatim, both documents: *"El número máximo de plantas autorizable es el que se recoge
 * PARA CADA PARCELA en el plano de edificación (ES)."* The height table is a floor-count → metres
 * CONVERSION, not a zone-wide answer: WHICH row applies to a given parcel is a PER-PARCEL
 * determination published on a separate plan sheet ("plano de edificación (ES)"). This is the EXACT
 * same structural shape as `CORDOBA_MC_STREET_WIDTH_HEIGHT_TABLE` (a real, verified table this pack
 * still cannot bind to a scalar because the KEY that selects a row is not held) — so PT-CV gets the
 * same honest treatment: the table is recorded in this comment for citability, `maxHeight_m` and
 * `maxFloors` stay `null`, and nothing may read a floor-count off it until an `(ES)` plan resolver
 * exists. Publishing one row (say, PB+2 → 11,00 m) as a zone-wide scalar would assert a determination
 * for every parcel in the zone that the ordinance itself explicitly delegates to a per-parcel plan.
 *
 * ⭐ 2026-08-04 — THE `(ES)` SHEETS ARE NOW HELD, AND THE REFUSAL IS STRONGER FOR IT, NOT WEAKER.
 * 15 "plano de edificación" sheets (`corpus/Edification/E12ollerias.pdf` … `E62confederacion.pdf`,
 * one per Conjunto Histórico sector) are now in the corpus. `pdftotext` on all 15 yields almost no
 * extractable text (31–547 chars per sheet vs. ~130–490 KB of PDF each) — these are vector line
 * drawings, not text documents; every one of Art. 21/27/40/43/49/56/59/61/118-141's repeated cites
 * to "el plano de edificación (ES)" (verified across `normativa_PEPCH_Revisado.pdf`) point at THIS
 * kind of sheet. What little text IS embedded is a scatter of short catalogued-building reference
 * codes (`EA nn`, `EV nn`, `CC nn`, `MA nn`, `MC n`, `MV nn` — protection-catalogue IDs, per Art.
 * 27's "Monumentos, edificios y conjuntos catalogados" zone) plus bare single digits (`1`–`6`)
 * scattered among them that are consistent with being the per-parcel floor-count labels Art. 49.1
 * describes for the un-catalogued (Protección Tipológica / Zona Renovada) parcels — BUT `pdftotext`
 * carries no positional/geometric information, so none of these tokens can be tied to a specific
 * parcel, and no sheet's extracted text names "PT-CV", "Campo de la Verdad", or any parcel/cadastral
 * reference. No "leyenda" (legend) text was found embedded in any of the 15 sheets either — the key
 * to the codes above is inferred from the normativa's own article text, not from an on-sheet legend.
 * CONCLUSION: this is not a missing-document gap any more — the document is held and confirms, via
 * its own unreadable-as-text form, that Art. 49.1's "per parcel on the plan sheet" framing is a real
 * MAP-READ determination (a GIS/vector-overlay problem), not a zone-wide scalar merely absent from
 * this corpus. Extracting a specific parcel's floor count would require parsing/rendering the vector
 * geometry (OCR or CAD-layer extraction), which is out of scope here; `maxHeight_m` and `maxFloors`
 * stay `null` on that basis, now for a verified rather than an assumed reason. Separately: the PT
 * chapter's *profundidad edificable* gap (next paragraph) was re-checked against these same 15
 * sheets — no depth/crujía dimension is stated as text on any of them either, so that gap is
 * unchanged.
 *
 * ⚠⚠ WHY THE FOOTPRINT IS `explicit-area` (UNRESOLVED), NOT `alignment` WITH A STATED DEPTH — unlike
 * CTP-1 (Art. 13.8.2.4, 16 m from the alignment) or UAD (Art. 13.9.3.3, 16/18/16 m), the PT chapter
 * (Art. 43-55) states NO *profundidad edificable* / *fondo edificable* number anywhere — verified by
 * a targeted read of the full chapter text, not merely its absence from a keyword search. What it
 * states instead is TWO independent, non-numeric-depth constraints: (a) Art. 46.1's 70 %/80 %
 * ocupación cap (a PARCEL-area ratio, not a depth), and (b) Art. 47's mandatory *patio principal* —
 * ≥25 % of parcel area (20 % unifamiliar), minimum side 7 m/5 m/4 m by use, sited so the façade-to-
 * patio distance is ≤10 m AND the patio falls within the first-to-third *crujía* (structural bay).
 * This is NOT the MC shape (Art. 13.5.2.4: depth "libre", bounded ONLY by ocupación, no siting rule
 * at all) — PT-CV's Art. 47 imposes a real siting/positioning rule for the mandatory open space, one
 * this pack has no numeric *crujía* width to translate into a buildable-depth band. Reaching for
 * `occupation-capped-alignment` (ADR-0288's "maximal legally-consistent rectangle at the alignment's
 * frontage width, capped by ocupación, no stated siting rule") here would be a MIS-FIT, not a
 * conservative approximation: it would construct a rectangle that ignores Art. 47's patio-siting rule
 * entirely and could legally overstate footprint depth on any parcel where that rectangle swallows
 * space Art. 47 requires to stay open near the façade — exactly the confident-wrong shape C58 §1.7a
 * forbids. So PT-CV mirrors MC's OWN honest answer instead: `explicit-area` with an UNRESOLVABLE
 * footprint handle — a cited structural refusal, never a full-parcel box, never a mis-fit rectangle.
 *
 * NET EFFECT: PT-CV is now REGISTERED (closing the "deferred to an unheld Tomo VI" state — Tomo VI IS
 * held and its PT ordinance IS read) but, like MC, it still resolves to NO buildable envelope — on
 * TWO independent grounds (height is per-parcel-plan-keyed; footprint has no stated depth and no
 * geometric-rule kind can honestly express Art. 47's siting constraint without real footprint or
 * *crujía* data this pack does not hold). Both grounds are genuinely open engineering/data gaps, not
 * placeholders — closing either alone does not lift the refusal.
 */
export const CORDOBA_PTCV_FOOTPRINT_UNRESOLVED_RING =
    'cordoba-ptcv-fondo:UNRESOLVED/pgou-conjunto-historico-art47-patio-siting' as const;

/**
 * One band of the Art. 13.5.3.1 per-street-width height table. `maxStreetWidth_m: null` marks the
 * open top band (strictly greater than the previous band's bound — the ordinance's own "> N m" row).
 * `maxFloors` follows this pack's PB+n convention used everywhere else (UAD-1 "PB+1" → maxFloors 2),
 * i.e. ground floor + n upper storeys.
 */
export interface CordobaMcHeightBand {
    readonly maxStreetWidth_m: number | null;
    readonly storeys: string; // ordinance's own "PB+n" notation, kept verbatim for citability
    readonly maxFloors: number;
    readonly maxHeight_m: number;
}

/**
 * ⭐ CLOSURE-REGISTER blocker 8 / D3 — the VERIFIED MC per-street-width height table, Art. 13.5.3.1,
 * transcribed exact band-for-band for all four subzones and cross-verified TWICE independently
 * against the publisher's own PDFs (the raster-render path, since `O_MC` has a zero-character text
 * layer): `sources/VERIFICATION.md` §SIG-1 (lines 44-46, 106-107 — "the MC per-street-width height
 * table §2.5 is exact, band for band, for all four subzones"), `findings/OCR-EXTRACTION-RESULTS.md`
 * §2.5 (lines 249-253, the transcription this table mirrors verbatim), `HEIGHT.md` (H3).
 *
 * ⚠⚠ THIS IS DATA, NOT A COMPUTE PATH. It exists so the verified table stops living only in a
 * comment (`maxHeight_m: null` below still stands, unchanged, on every MC zone). It is deliberately
 * **not** consumed anywhere yet: applying it needs a MEASURED street width per parcel frontage, and
 * PRYZM has no Córdoba street-width resolver (CLOSURE-REGISTER blocker 8/25 — the Barcelona
 * `bcnAlcadaNucliAntic.ts` analogue does not exist here). Looking a value up in this table against a
 * fabricated or unmeasured width would be the exact L-526 failure the `null` scalar exists to
 * prevent — so nothing in this pack, the dispatcher, or the engine may read this constant until that
 * resolver lands and is cited at the call site. Do not delete the surrounding `maxHeight_m: null`
 * fields to "use" this table — the null is the honesty gate, this constant is the payload behind it.
 */
export const CORDOBA_MC_STREET_WIDTH_HEIGHT_TABLE: Readonly<
    Record<'MC-1' | 'MC-2' | 'MC-3' | 'MC-4', readonly CordobaMcHeightBand[]>
> = {
    'MC-1': [
        { maxStreetWidth_m: 8, storeys: 'PB+2', maxFloors: 3, maxHeight_m: 9.75 },
        { maxStreetWidth_m: 10, storeys: 'PB+3', maxFloors: 4, maxHeight_m: 12.75 },
        { maxStreetWidth_m: 14, storeys: 'PB+4', maxFloors: 5, maxHeight_m: 16.75 },
        { maxStreetWidth_m: 16, storeys: 'PB+5', maxFloors: 6, maxHeight_m: 19.5 },
        { maxStreetWidth_m: null, storeys: 'PB+6', maxFloors: 7, maxHeight_m: 22.5 },
    ],
    'MC-2': [
        { maxStreetWidth_m: 10, storeys: 'PB+2', maxFloors: 3, maxHeight_m: 9.75 },
        { maxStreetWidth_m: null, storeys: 'PB+3', maxFloors: 4, maxHeight_m: 12.75 },
    ],
    'MC-3': [
        { maxStreetWidth_m: 10, storeys: 'PB+2', maxFloors: 3, maxHeight_m: 9.75 },
        { maxStreetWidth_m: 15, storeys: 'PB+3', maxFloors: 4, maxHeight_m: 12.75 },
        { maxStreetWidth_m: 20, storeys: 'PB+4', maxFloors: 5, maxHeight_m: 16.75 },
        { maxStreetWidth_m: null, storeys: 'PB+5', maxFloors: 6, maxHeight_m: 19.5 },
    ],
    // MC-4 shares MC-2's band structure verbatim (Art. 13.5.3.1 states them jointly).
    'MC-4': [
        { maxStreetWidth_m: 10, storeys: 'PB+2', maxFloors: 3, maxHeight_m: 9.75 },
        { maxStreetWidth_m: null, storeys: 'PB+3', maxFloors: 4, maxHeight_m: 12.75 },
    ],
} as const;

// ══════════════════════════════════════════════════════════════════════════════════════════════
// §COR-MC-ANCHO — resolving a MEASURED street width against the table above (Art. 13.5.3.1).
// ══════════════════════════════════════════════════════════════════════════════════════════════
// This is Córdoba's exact analogue of `esMurciaAnchoDeCalle.ts`'s `resolveMurciaAnchoDeCalle`: the
// TABLE above is `ordinance-pdf`-tier (human-verified, VERIFICATION.md §SIG-1), the WIDTH fed into
// it is `measured-geometry` (constructed from cadastral block geometry, never an *ample oficial* —
// Córdoba publishes none). The two tiers must never blur (ADR-0271).
//
// PURE (C58 §1.9) — no I/O, no THREE, no DOM, no clock, no RNG. Never throws. OTel span on the one
// exported resolver (P8 / C58 §1.10). This function NEVER accepts a verified-sign-off parameter —
// the L-449 human-certification gate is `CORDOBA_ENVELOPE_VERIFIED`, enforced once at the DISPATCH
// level (`applyCordobaZoningThenFallback`), never re-implemented here.

const cordobaMcTracer = trace.getTracer('pryzm.zoning');

/** The calificaciones the Art. 13.5.3.1 table covers. */
export type CordobaMcZone = keyof typeof CORDOBA_MC_STREET_WIDTH_HEIGHT_TABLE;

/** The article every resolution from this table cites. */
export const CORDOBA_MC_HEIGHT_ARTICLE = 'PGOU de Córdoba (2001), Art. 13.5.3.1' as const;

/**
 * ⚠⚠ ADR-0287 BAND-EDGE GUARD, metres — a SIGNED FOUNDER REQUIREMENT, not a tuned constant.
 *
 * Catastro's own positional-accuracy figure for urban parcels is ±0.20 m (BOE-A-2015-11655
 * §7.2(e)). A street width is measured frontage-to-frontage — TWO independent cadastral edges,
 * each carrying that error — so the combined 2σ uncertainty is
 * `2 · √(0.20² + 0.20²) ≈ 0.5657 m`. The MC bands are 2 m apart in places (MC-1: 8/10/14/16 m);
 * ADR-0287's own worked example (Murcia) is exactly this shape: "a width measured at 4.00 ± 0.15 m
 * does not yield 'about 3 storeys' — it yields EITHER 3 OR 2, and publishing either one asserts a
 * legal outcome we cannot support." A measured width sitting within this guard of a band boundary
 * MUST NOT choose a storey band — see `resolveCordobaMcHeightForWidth`.
 *
 * Computed, not hand-typed, so a future edit to the Catastro accuracy figure cannot silently drift
 * from the guard it is supposed to justify.
 */
export const CORDOBA_MC_ADR0287_GUARD_M = 2 * Math.sqrt(0.2 ** 2 + 0.2 ** 2); // ≈ 0.5657 m

/**
 * Why a measured width did not resolve a band.
 *   `bad-input`  — not a usable positive finite width.
 *   `band-edge`  — ADR-0287: the width sits within `CORDOBA_MC_ADR0287_GUARD_M` of a table
 *                  boundary, so a MEASURED value cannot choose the storey band.
 *   `no-band`    — the width fell outside every row (a table gap). Every zone's top band is
 *                  open-ended (`maxStreetWidth_m: null`), so this is structurally unreachable for
 *                  a finite positive width today — kept as a typed reason rather than an
 *                  assumption, in case a future table revision removes the open top band.
 */
export type CordobaMcHeightRefusalReason = 'bad-input' | 'band-edge' | 'no-band';

export type CordobaMcHeightResolution =
    | {
          readonly ok: true;
          readonly zone: CordobaMcZone;
          readonly article: string;
          readonly maxHeight_m: number;
          readonly maxFloors: number;
          /** The ordinance's own "PB+n" notation, kept verbatim for citability. */
          readonly storeys: string;
          readonly band: CordobaMcHeightBand;
      }
    | {
          readonly ok: false;
          readonly zone: CordobaMcZone;
          readonly article: string;
          readonly reason: CordobaMcHeightRefusalReason;
          /** Candidate heights straddling the guarded boundary, for an honest "we cannot say". */
          readonly straddles: readonly number[];
      };

/** Every finite boundary in a zone's table — the values a measured width must not sit on top of. */
function cordobaMcBandEdges(bands: readonly CordobaMcHeightBand[]): number[] {
    const out = new Set<number>();
    for (const b of bands) {
        if (b.maxStreetWidth_m !== null) out.add(b.maxStreetWidth_m);
    }
    return [...out].sort((a, b) => a - b);
}

/** The heights of the (at most two) bands meeting at `edge`. */
function cordobaMcStraddlingHeights(bands: readonly CordobaMcHeightBand[], edge: number): number[] {
    const idx = bands.findIndex((b) => b.maxStreetWidth_m === edge);
    if (idx === -1) return [];
    const heights = [bands[idx]!.maxHeight_m];
    const next = bands[idx + 1];
    if (next) heights.push(next.maxHeight_m);
    return [...new Set(heights)].sort((a, b) => a - b);
}

/**
 * Resolve a MEASURED Córdoba MC street width to the storeys/height Art. 13.5.3.1 grants.
 *
 * PURE (same input ⇒ byte-identical output), never throws. OTel span
 * `pryzm.zoning.resolveCordobaMcHeightForWidth` (P8 / C58 §1.10).
 *
 * ⚠ IT NEVER CLAMPS TO THE NEAREST BAND AND NEVER PICKS A DEFAULT WIDTH — an unusable or
 * boundary-straddling input returns `ok: false`, which the caller must render as a cited refusal,
 * never a fabricated height (C58 §1.4, ADR-0287).
 *
 * ⚠ THIS FUNCTION TAKES NO SIGN-OFF / VERIFIED PARAMETER. The L-449 human-certification gate
 * (`CORDOBA_ENVELOPE_VERIFIED`) is checked exactly once, at the dispatcher, before this function is
 * ever reached — duplicating that check here would create a second place for the two to drift.
 *
 * @param zone     the MC subzone whose table governs (`MC-1`…`MC-4`).
 * @param width_m  the measured street width, metres (frontage-to-frontage).
 */
export function resolveCordobaMcHeightForWidth(
    zone: CordobaMcZone,
    width_m: number,
): CordobaMcHeightResolution {
    const span = cordobaMcTracer.startSpan('pryzm.zoning.resolveCordobaMcHeightForWidth');
    try {
        const bands = CORDOBA_MC_STREET_WIDTH_HEIGHT_TABLE[zone];
        const article = CORDOBA_MC_HEIGHT_ARTICLE;
        span.setAttribute('zone', zone);

        if (typeof width_m !== 'number' || !Number.isFinite(width_m) || width_m <= 0) {
            span.setAttribute('resultFields', 'bad-input');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, zone, article, reason: 'bad-input', straddles: [] };
        }
        span.setAttribute('width_m', width_m);

        // ── ADR-0287 — check EVERY finite boundary in THIS zone's table, not just the first one
        // the width happens to be compared against. A zone with several bands (MC-1 has four) must
        // refuse near ANY of them, not only the nearest-checked.
        const edges = cordobaMcBandEdges(bands);
        const straddledEdge = edges.find((e) => Math.abs(width_m - e) < CORDOBA_MC_ADR0287_GUARD_M);
        if (straddledEdge !== undefined) {
            const straddles = cordobaMcStraddlingHeights(bands, straddledEdge);
            span.setAttribute('resultFields', 'band-edge');
            span.setAttribute('straddledEdge_m', straddledEdge);
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, zone, article, reason: 'band-edge', straddles };
        }

        // Bands are listed ascending by `maxStreetWidth_m`, with the last row's `null` meaning
        // unbounded above — so the first row whose bound is null-or-not-exceeded governs.
        const chosen = bands.find((b) => b.maxStreetWidth_m === null || width_m <= b.maxStreetWidth_m);
        if (!chosen) {
            span.setAttribute('resultFields', 'no-band');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, zone, article, reason: 'no-band', straddles: [] };
        }

        span.setAttribute('resultFields', 'band');
        span.setAttribute('maxFloors', chosen.maxFloors);
        span.setAttribute('maxHeight_m', chosen.maxHeight_m);
        span.setStatus({ code: SpanStatusCode.OK });
        return {
            ok: true,
            zone,
            article,
            maxHeight_m: chosen.maxHeight_m,
            maxFloors: chosen.maxFloors,
            storeys: chosen.storeys,
            band: chosen,
        };
    } finally {
        span.end();
    }
}

/**
 * §COR-MC-RESOLVED-PACK — turn ONE resolved band into a one-zone rule pack, mirroring
 * `murciaAnchoResolvedPack`'s shape exactly.
 *
 * ⚠⚠ THE `geometricRule` IS DELIBERATELY UNCHANGED — still `explicit-area` /
 * `CORDOBA_MC_FONDO_UNRESOLVED_RING`. Resolving the HEIGHT does not resolve the FOOTPRINT: Art.
 * 13.5.2.4 leaves the *fondo edificable* unconstrained (bounded only by ocupación), but — per D3's
 * 2026-08-04 correction on `CORDOBA_MC_FONDO_UNRESOLVED_RING`'s own header, read that comment first —
 * this is NOT a "needs a block-fondo geometry source" gap (MC's depth is not block-derived at all). It
 * is that NO `GeometricRule` kind in the current schema can express "unconstrained depth, capped only
 * by a parcel-level ocupación ratio with no stated siting rule": `alignment` requires a positive
 * `buildableDepth_m`, `explicit-area` requires real published footprint geometry Córdoba does not
 * publish for MC, and the engine's `maxCoverage` cap only shapes a ring inside the `tiered-occupation`
 * branch (ADR-0272 §3.2). So `computeBuildableEnvelope` will keep hard-refusing on the footprint
 * ground alone until a new occupation-only rule kind (or real footprint geometry) lands — a separate,
 * out-of-scope capability from this height resolver. This function only stops the refusal being
 * blamed on a height table PRYZM can now actually resolve. `maxHeight_m`/`maxFloors` populated
 * here are true and citable the day the footprint unlocks; nothing about this call needs to change
 * then.
 *
 * @param widthAuthorityNote  the constructed-width authority string from the street-width
 *   resolver — folded into `ordinanceRef` so it reaches the user, not just a log line.
 */
export function cordobaMcResolvedPack(
    zone: CordobaMcZone,
    resolved: Extract<CordobaMcHeightResolution, { ok: true }>,
    widthAuthorityNote: string,
): JurisdictionZoningContract {
    return JurisdictionZoningContractSchema.parse({
        jurisdictionId: CORDOBA_JURISDICTION_ID,
        displayName: `Córdoba — PGOU ${resolved.article} (ancho de calle, resolved per parcel)`,
        source: 'manual',
        crs: 'EPSG:4326',
        lastReviewed: '2026-08-04',
        defaultConfidence: CORDOBA_INTENDED_DEFAULT_CONFIDENCE,
        zones: [{
            code: zone,
            label: `${zone} — PGOU ${resolved.article} (altura por ancho de calle)`,
            permittedUse: ['residential', 'mixed'],
            maxHeight_m: resolved.maxHeight_m,
            maxFloors: resolved.maxFloors,
            plotRatioFAR: zone === 'MC-3' ? 3.5 : null, // Art. 13.5.2.2 — MC-3 only, unchanged from the base pack
            maxCoverage: zone === 'MC-4' ? 0.9 : 0.7,   // Art. 13.5.2.5 — unchanged from the base pack
            setbacks: { front_m: null, side_m: null, rear_m: null },
            // ⚠ L-616 GUARD — UNCHANGED. See the doc-comment above: height ≠ footprint.
            geometricRule: { kind: 'explicit-area', ringRef: CORDOBA_MC_FONDO_UNRESOLVED_RING },
            fieldProvenance: {
                maxHeight: CORDOBA_INTENDED_FIELD_PROVENANCE,
                maxFloors: CORDOBA_INTENDED_FIELD_PROVENANCE,
                maxCoverage: CORDOBA_INTENDED_FIELD_PROVENANCE,
                permittedUse: CORDOBA_INTENDED_FIELD_PROVENANCE,
            },
            ordinanceRef:
                `${resolved.article}: ${resolved.storeys} = ${resolved.maxHeight_m.toFixed(2)} m. ` +
                'PGOU Art. 13.5.2.5 (ocup. PB 100 % / PA 70–90 %), 13.5.2.3 (alineación a vial), ' +
                `13.5.2.4 (fondo edificable libre, sin geometría de manzana resuelta). ⚠ STREET WIDTH: ` +
                `${widthAuthorityNote} ${SRC}`,
        }],
    });
}

/**
 * The Córdoba PGOU-2001 pack. `source:'manual'` (curated artefact, no published-structured feed);
 * `crs:'EPSG:4326'` (COACo GeoServer WFS default). Zone `code` matches the calificación subzone name
 * the dispatcher will resolve from `coaco:ordenanzas.ordenanza` + the `O_*` link suffix.
 */
export const ES_CORDOBA_PGOU2001_PACK: JurisdictionZoningContract =
    JurisdictionZoningContractSchema.parse({
        jurisdictionId: CORDOBA_JURISDICTION_ID,
        displayName: 'Córdoba — PGOU-2001 (Sur + Noroeste pilot)',
        source: 'manual',
        crs: 'EPSG:4326',
        lastReviewed: '2026-07-23',
        // WIRING-TODO 1/2 (DONE) — the honest permanent bottom tier (the enum now exists). The
        // safety is no longer this label but the dispatcher's VERIFICATION GATE (see header).
        defaultConfidence: CORDOBA_INTENDED_DEFAULT_CONFIDENCE,
        zones: [
            // ── Plurifamiliar Aislada (PAS) — FULL, Art. 13.7 ────────────────────────────────
            {
                code: 'PAS-1',
                label: 'Plurifamiliar Aislada, subzona PAS-1 (PGOU Art. 13.7)',
                permittedUse: ['residential', 'mixed'],
                maxHeight_m: 12.75,          // Art. 13.7.3.3 — PB+3
                maxFloors: 4,                // PB+3 = 4 storeys
                plotRatioFAR: 1.2,           // Art. 13.7.2.1
                maxCoverage: 0.4,            // Art. 13.7.2.4 (hard cap 0.60, 13.7.2.5.d)
                setbacks: { front_m: 3, side_m: 6.375, rear_m: 6.375 }, // 13.7.3.1: front 3 m; lateral ½·h @ max h
                fieldProvenance: {
                    maxHeight: 'pipeline-extracted', maxFloors: 'pipeline-extracted', maxFAR: 'pipeline-extracted',
                    maxCoverage: 'pipeline-extracted', 'setback.front': 'pipeline-extracted',
                    'setback.side': 'pipeline-extracted', 'setback.rear': 'pipeline-extracted', permittedUse: 'pipeline-extracted',
                },
                ordinanceRef:
                    'PGOU Art. 13.7.2.1 (FAR 1,2), 13.7.2.4 (ocup. 40 %), 13.7.3.3 (PB+3, 12,75 m), ' +
                    '13.7.3.1 (retranqueo 3 m; lateral ½·altura). ' + SRC,
            },
            {
                code: 'PAS-2',
                label: 'Plurifamiliar Aislada, subzona PAS-2 (PGOU Art. 13.7)',
                permittedUse: ['residential', 'mixed'],
                maxHeight_m: 12.75,
                maxFloors: 4,
                plotRatioFAR: 1.66,
                maxCoverage: 0.5,
                setbacks: { front_m: 3, side_m: 6.375, rear_m: 6.375 },
                fieldProvenance: {
                    maxHeight: 'pipeline-extracted', maxFloors: 'pipeline-extracted', maxFAR: 'pipeline-extracted',
                    maxCoverage: 'pipeline-extracted', 'setback.front': 'pipeline-extracted',
                    'setback.side': 'pipeline-extracted', 'setback.rear': 'pipeline-extracted', permittedUse: 'pipeline-extracted',
                },
                ordinanceRef:
                    'PGOU Art. 13.7.2.1 (FAR 1,66), 13.7.2.4 (ocup. 50 %), 13.7.3.3 (PB+3, 12,75 m), ' +
                    '13.7.3.1 (retranqueo 3 m; lateral ½·altura). ' + SRC,
            },
            {
                code: 'PAS-3',
                label: 'Plurifamiliar Aislada, subzona PAS-3 (PGOU Art. 13.7)',
                permittedUse: ['residential', 'mixed'],
                maxHeight_m: 19.5,           // Art. 13.7.3.3 — PB+5
                maxFloors: 6,                // PB+5 = 6 storeys
                plotRatioFAR: 2.0,
                maxCoverage: 0.4,
                setbacks: { front_m: 3, side_m: 9.75, rear_m: 9.75 }, // lateral ½·19,50
                fieldProvenance: {
                    maxHeight: 'pipeline-extracted', maxFloors: 'pipeline-extracted', maxFAR: 'pipeline-extracted',
                    maxCoverage: 'pipeline-extracted', 'setback.front': 'pipeline-extracted',
                    'setback.side': 'pipeline-extracted', 'setback.rear': 'pipeline-extracted', permittedUse: 'pipeline-extracted',
                },
                ordinanceRef:
                    'PGOU Art. 13.7.2.1 (FAR 2,00), 13.7.2.4 (ocup. 40 %), 13.7.3.3 (PB+5, 19,50 m), ' +
                    '13.7.3.1 (retranqueo 3 m; lateral ½·altura). ' + SRC,
            },
            // ── Ordenación Abierta (OA) — FULL, Art. 13.6 ────────────────────────────────────
            {
                code: 'OA-1',
                label: 'Ordenación Abierta, subzona OA-1 (PGOU Art. 13.6)',
                permittedUse: ['residential', 'mixed'],
                maxHeight_m: 21,             // Art. 13.6.3.1 — top of the PB+3..PB+6 band
                maxFloors: 7,                // PB+6 = 7 storeys
                plotRatioFAR: 1.4,           // Art. 13.6.2.2
                maxCoverage: 0.4,            // Art. 13.6.2.3 (all floors; cap 0.60 sótano garaje)
                // Art. 13.6.3.3: separación a linderos privados ≥ ½·altura, min 3 m (= 10,5 m @ 21 m).
                // OA-1 states no front retranqueo (open block) → front null (skip the edge).
                setbacks: { front_m: null, side_m: 10.5, rear_m: 10.5 },
                fieldProvenance: {
                    maxHeight: 'pipeline-extracted', maxFloors: 'pipeline-extracted', maxFAR: 'pipeline-extracted',
                    maxCoverage: 'pipeline-extracted', 'setback.side': 'pipeline-extracted', 'setback.rear': 'pipeline-extracted',
                    permittedUse: 'pipeline-extracted',
                },
                ordinanceRef:
                    'PGOU Art. 13.6.2.2 (FAR 1,4), 13.6.2.3 (ocup. 40 %), 13.6.3.1 (PB+3..PB+6, máx 21 m), ' +
                    '13.6.3.3 (linderos privados ½·altura, min 3 m). ' + SRC,
            },
            {
                code: 'OA-2',
                label: 'Ordenación Abierta, subzona OA-2 (PGOU Art. 13.6)',
                permittedUse: ['residential', 'mixed'],
                maxHeight_m: 21,
                maxFloors: 7,
                plotRatioFAR: 1.6,
                maxCoverage: 0.4,
                // OA-2 (13.6.3.2): parcels on vials must ALIGN → front 0.
                setbacks: { front_m: 0, side_m: 10.5, rear_m: 10.5 },
                fieldProvenance: {
                    maxHeight: 'pipeline-extracted', maxFloors: 'pipeline-extracted', maxFAR: 'pipeline-extracted',
                    maxCoverage: 'pipeline-extracted', 'setback.front': 'pipeline-extracted',
                    'setback.side': 'pipeline-extracted', 'setback.rear': 'pipeline-extracted', permittedUse: 'pipeline-extracted',
                },
                ordinanceRef:
                    'PGOU Art. 13.6.2.2 (FAR 1,6), 13.6.2.3 (ocup. 40 %), 13.6.3.1 (PB+3..PB+6, máx 21 m), ' +
                    '13.6.3.2 (alineada a vial), 13.6.3.3 (linderos privados ½·altura, min 3 m). ' + SRC,
            },
            // ── Unifamiliar Adosada (UAD) — Art. 13.9 (recovered from O_UAD3) ───────────────
            //
            // ✅ D1 CLOSED (2026-08-02) — THE STATED DEPTH IS NOW PACKED ON ALL THREE SUBZONES.
            // Art. 13.9.3.3 states a *profundidad máxima edificable* — UAD-1 16 m · UAD-2 18 m ·
            // UAD-3 16 m — measured FROM THE VIAL ALIGNMENT (verified 380 dpi, 2026-08-01;
            // OCR-EXTRACTION-RESULTS §2.3 and sources/VERIFICATION.md §D1 both record it). Until
            // now NONE of it was carried, so the envelope was bounded by the setback inset alone
            // and OVER-STATED deep parcels.
            //
            // ⚠ For UAD-3 that was the L-616 mechanism-A failure VERBATIM: front 0 + side 0
            // (party-wall) + rear 5 m with NO depth band draws essentially the WHOLE PARCEL — the
            // exact outcome CTP-1's `alignment` rule and MC's unresolvable ring exist to prevent,
            // left unguarded on the one family that also needed it. And its "latent" premise was
            // REFUTED: UAD-3 binds 31 505,01 m² = 1,934 % of published pilot land, not 0,00 %
            // (CLOSURE-REGISTER, measured live 2026-08-01 through `subzoneCodeFromLink`).
            //
            // ⚠⚠ THIS IS A CONSTRAINT ADDED, NEVER A NUMBER INVENTED. Every depth below is quoted
            // from Art. 13.9.3.3; nothing is derived, assumed or defaulted. The effect is strictly
            // to REDUCE buildability (an UNKNOWN constraint must never be drawn as unbounded —
            // that overstates real land), so it cannot manufacture capacity that the pack did not
            // already grant.
            //
            // WHY `kind: 'alignment'` AND NOT A DEEPER REAR SETBACK — the two are NOT
            // interchangeable (depthBandClip.ts): a rear setback measures from the REAR boundary,
            // so on a deep parcel it leaves the depth unconstrained and on a shallow one it
            // over-constrains; they coincide only when parcel depth happens to equal
            // `depth + rear_m`. The ordinance measures from the ALIGNMENT, so the alignment rule
            // is the only faithful shape. It is the SHARED, region-agnostic capability already
            // driving CTP-1 here and Barcelona's 13a/13b — not a Córdoba special case.
            //
            // ⚠ NO DOUBLE-COUNTING: the engine builds the inset from `setbacks` and then clips the
            // band from `parcelRing[frontIdx]` — the ALIGNMENT itself, not the set-back façade
            // (ZoningRulesEngine, ADR-0270 P2). So UAD-1's 4 m retranqueo and its 16 m depth-from-
            // alignment compose exactly as Art. 13.9 reads; `alignmentOffset_m` is recorded as the
            // provenance/derivation row and does NOT re-apply the inset.
            //
            // ⚠ STILL GATED: `CORDOBA_ENVELOPE_VERIFIED` is false, so nothing here renders a number
            // today. This closes the OVERSTATEMENT, it does not open the gate.
            {
                code: 'UAD-1',
                label: 'Unifamiliar Adosada, subzona UAD-1 (PGOU Art. 13.9)',
                permittedUse: ['residential'],
                maxHeight_m: 7,              // Art. 13.9.3.5 — PB+1, 7 m
                maxFloors: 2,
                plotRatioFAR: 1.0,          // Art. 13.9.2.3
                maxCoverage: 0.6,           // Art. 13.9.2.2
                // 13.9.3.2 front 4 m; adosada lateral = party-wall (0); 13.9.3.4 rear 5 m.
                setbacks: { front_m: 4, side_m: 0, rear_m: 5 },
                // D1 — Art. 13.9.3.3: profundidad máxima edificable 16 m desde la alineación.
                geometricRule: {
                    kind: 'alignment',
                    alignTo: 'street',
                    alignmentOffset_m: 4,      // = the 13.9.3.2 retranqueo; recorded, not re-applied
                    sideTreatment: 'party-wall', // adosada — medianera on both laterals
                    buildableDepth_m: 16,      // Art. 13.9.3.3
                },
                fieldProvenance: {
                    maxHeight: 'pipeline-extracted', maxFloors: 'pipeline-extracted', maxFAR: 'pipeline-extracted',
                    maxCoverage: 'pipeline-extracted', 'setback.front': 'pipeline-extracted',
                    'setback.side': 'pipeline-extracted', 'setback.rear': 'pipeline-extracted', permittedUse: 'pipeline-extracted',
                    // Machine-extracted (OCR, 13.9.3.3) — strictly below the human `ordinance-pdf` tier.
                    'alignment.depth': 'pipeline-extracted',
                },
                ordinanceRef:
                    'PGOU Art. 13.9.2.3 (FAR 1,0), 13.9.2.2 (ocup. 60 %), 13.9.3.5 (PB+1, 7 m), ' +
                    '13.9.3.2 (retranqueo fachada 4 m), lateral medianera (adosada, 0), 13.9.3.4 (fondo 5 m), ' +
                    '13.9.3.3 (profundidad máx. edificable 16 m desde la alineación de vial). ' + SRC,
            },
            {
                code: 'UAD-2',
                label: 'Unifamiliar Adosada, subzona UAD-2 (PGOU Art. 13.9)',
                permittedUse: ['residential'],
                maxHeight_m: 7,
                maxFloors: 2,
                plotRatioFAR: 0.7,
                maxCoverage: 0.4,
                setbacks: { front_m: 5, side_m: 0, rear_m: 6 }, // front 5 m; party-wall; fondo 6 m
                // D1 — Art. 13.9.3.3: profundidad máxima edificable 18 m desde la alineación.
                geometricRule: {
                    kind: 'alignment',
                    alignTo: 'street',
                    alignmentOffset_m: 5,      // = the 13.9.3.2 retranqueo; recorded, not re-applied
                    sideTreatment: 'party-wall',
                    buildableDepth_m: 18,      // Art. 13.9.3.3
                },
                fieldProvenance: {
                    maxHeight: 'pipeline-extracted', maxFloors: 'pipeline-extracted', maxFAR: 'pipeline-extracted',
                    maxCoverage: 'pipeline-extracted', 'setback.front': 'pipeline-extracted',
                    'setback.side': 'pipeline-extracted', 'setback.rear': 'pipeline-extracted', permittedUse: 'pipeline-extracted',
                    'alignment.depth': 'pipeline-extracted',
                },
                ordinanceRef:
                    'PGOU Art. 13.9.2.3 (FAR 0,7), 13.9.2.2 (ocup. 40 %), 13.9.3.5 (PB+1, 7 m), ' +
                    '13.9.3.2 (retranqueo fachada 5 m), lateral medianera (adosada, 0), 13.9.3.4 (fondo 6 m), ' +
                    '13.9.3.3 (profundidad máx. edificable 18 m desde la alineación de vial). ' + SRC,
            },
            {
                code: 'UAD-3',
                label: 'Unifamiliar Adosada, subzona UAD-3 (PGOU Art. 13.9)',
                permittedUse: ['residential'],
                maxHeight_m: 7,
                maxFloors: 2,
                plotRatioFAR: 1.0,
                maxCoverage: 0.6,
                // 13.9.3.2: UAD-3 disposed ON the vial alignment → front 0; party-wall; fondo 5 m.
                setbacks: { front_m: 0, side_m: 0, rear_m: 5 },
                // ⚠⚠ D1, AND THIS IS THE ONE THAT WAS ACTUALLY DANGEROUS. front 0 + side 0 +
                // rear 5 with NO depth band drew essentially the WHOLE PARCEL (L-616 mechanism A)
                // on the 1,934 % of pilot land UAD-3 really binds. Art. 13.9.3.3 states 16 m.
                geometricRule: {
                    kind: 'alignment',
                    alignTo: 'street',
                    alignmentOffset_m: 0,      // 13.9.3.2 — built ON the alineación de vial
                    sideTreatment: 'party-wall',
                    buildableDepth_m: 16,      // Art. 13.9.3.3
                },
                fieldProvenance: {
                    maxHeight: 'pipeline-extracted', maxFloors: 'pipeline-extracted', maxFAR: 'pipeline-extracted',
                    maxCoverage: 'pipeline-extracted', 'setback.front': 'pipeline-extracted',
                    'setback.side': 'pipeline-extracted', 'setback.rear': 'pipeline-extracted', permittedUse: 'pipeline-extracted',
                    'alignment.depth': 'pipeline-extracted',
                },
                ordinanceRef:
                    'PGOU Art. 13.9.2.3 (FAR 1,0), 13.9.2.2 (ocup. 60 %), 13.9.3.5 (PB+1, 7 m), ' +
                    '13.9.3.2 (alineación a vial, front 0), lateral medianera (adosada, 0), 13.9.3.4 (fondo 5 m), ' +
                    '13.9.3.3 (profundidad máx. edificable 16 m desde la alineación de vial). ' + SRC,
            },
            // ── Colonia Tradicional Popular (CTP-1) — PARTIAL, Art. 13.8 ─────────────────────
            // Alignment zone (front on the vial line) → setbacks null. edificabilidad DERIVED → null.
            {
                code: 'CTP-1',
                label: 'Colonia Tradicional Popular, subzona CTP-1 (PGOU Art. 13.8)',
                permittedUse: ['residential'],
                maxHeight_m: 7,             // Art. 13.8.3.1 — PB+1, 7 m (cumbrera 9,75 for attic)
                maxFloors: 2,
                // Art. 13.8.2.3 — "resultante de la aplicación de las Normas de Composición" = DERIVED.
                // ⚠⚠ THIS DOES NOT MEAN CTP-1 HAS NO BUILDABLE FLOOR AREA — verified 2026-08-04
                // against `ZoningRulesEngine.ts` (the `alignment`/`block-derived-alignment` branch,
                // ~L843-911) and pinned by `esCordobaEnvelopeCompute.test.ts`
                // ("derives a REAL maxVolumeM3..."). `computeFarLimitedHeight` (farLimitedHeight.ts)
                // treats a null `maxFAR` as "does not bind" (NO_BIND), never as a reason to refuse —
                // so the engine still computes `maxVolumeM3 = footprint × maxHeight_m`, where the
                // footprint is the real 16 m alignment depth-band clip below (Art. 13.8.2.4) and the
                // height is the real 7 m PB+1 cap (Art. 13.8.3.1). That IS "las Normas de Composición"
                // literally applied — height × depth-clipped footprint — with zero coefficient
                // invented. `plotRatioFAR: null` only means no SEPARATE FAR ceiling exists to further
                // LOWER that height below 7 m (the way MC-3's stated 3,50 would); it never means "no
                // envelope" or "no GFA". So CTP-1 needs NO edificabilidad hook to be functionally
                // complete — WIRING-TODO 6's remaining CTP-1 half is ocupación's step-function alone
                // (D2, below), not this field. Do not "fix" this null; it is already correct AND
                // already load-bearing.
                plotRatioFAR: null,
                // Art. 13.8.2.5 — STEP-FUNCTION of parcel size. ⚠ D2, CORRECTED 2026-08-01 (400 dpi):
                // the source reads «Parcelas de hasta 100 m2, el 100%. Parcela de más de 100 m2 y menos
                // de 125 m2, 100 m2. Parcelas de más de 125 m2, el 80%.» — the MIDDLE band is an
                // ABSOLUTE 100 m² CAP, **not** 100 %. (This comment previously said "≤125 m² → 100 %",
                // which is wrong and would over-state a 124 m² parcel by ~24 % if WIRING-TODO 6 were
                // implemented from it.) 0.80 is the large-parcel value and is CORRECT; it UNDER-states
                // small parcels (safe). A future hook applies the true step from `sup_pc_m2`.
                maxCoverage: 0.8,
                setbacks: { front_m: null, side_m: null, rear_m: null }, // alignment: façade on vial line
                // ⚠ L-616 GUARD (ENVELOPE-REALISM-MATRIX, Córdoba row) — an ALIGNMENT rule, NOT the
                // legacy setback inset. Without a geometricRule this alignment zone (setbacks null →
                // 0 inset) would fall to the whole-parcel footprint the moment the gate opens
                // (mechanism A). Art. 13.8.2.4 states a real *profundidad máxima edificable* of 16 m
                // from the vial alignment (OCR READ-CLEAN, see OCR-EXTRACTION-RESULTS §2.4), so the
                // honest shape is: build ON the vial line (offset 0), party walls on the laterals
                // (adosada/medianera fabric), and a 16 m depth band. The engine composes
                // inset-per-edge THEN clipToDepthBand; with no `front` edge it HARD-FAILS to
                // `degenerate` (never a full-depth fallback — see ZoningRulesEngine ~L403).
                geometricRule: {
                    kind: 'alignment',
                    alignTo: 'street',
                    alignmentOffset_m: 0,
                    sideTreatment: 'party-wall',
                    buildableDepth_m: 16, // Art. 13.8.2.4 — máx 16 m desde la alineación de vial
                },
                fieldProvenance: {
                    maxHeight: 'pipeline-extracted', maxFloors: 'pipeline-extracted', maxCoverage: 'pipeline-extracted',
                    permittedUse: 'pipeline-extracted',
                    // The 16 m depth is machine-extracted (OCR, 13.8.2.4), strictly below the human
                    // `ordinance-pdf` tier. The engine reads `alignment.depth` for the derivation row.
                    'alignment.depth': 'pipeline-extracted',
                    // NB: plotRatioFAR intentionally absent — it is null-DERIVED, not machine-extracted.
                },
                ordinanceRef:
                    'PGOU Art. 13.8.3.1 (PB+1, 7 m), 13.8.2.5 (ocup. step; 80 % >125 m²), 13.8.2.1 ' +
                    '(fachada en alineación de vial), 13.8.2.4 (profundidad máx 16 m). ⚠ edificabilidad ' +
                    'DERIVED (13.8.2.3, "resultante de las Normas de Composición") → null, never a number. ' + SRC,
            },
            // ── Manzana Cerrada (MC) — PARTIAL, Art. 13.5 ────────────────────────────────────
            // Alignment zone (front on vial line). Height is a per-street-width TABLE → maxHeight null.
            // edificabilidad DERIVED for MC-1/2/4 → null; MC-3 = 3,50 (⚠ > range gate 3.0, flagged).
            {
                code: 'MC-1',
                label: 'Manzana Cerrada, subzona MC-1 (PGOU Art. 13.5)',
                permittedUse: ['residential', 'mixed'],
                maxHeight_m: null,          // Art. 13.5.3.1 — per-street-width table (see SPEC), not a scalar
                maxFloors: null,
                plotRatioFAR: null,         // Art. 13.5.2.2 — "no se fija … Normas de composición" = DERIVED
                maxCoverage: 0.7,           // Art. 13.5.2.5 — plantas altas 70 % (planta baja 100 %)
                setbacks: { front_m: null, side_m: null, rear_m: null }, // alignment: façade on vial line
                // ⚠ L-616 GUARD — structural refusal (never a full-parcel box). See CORDOBA_MC_FONDO_UNRESOLVED_RING.
                geometricRule: { kind: 'explicit-area', ringRef: CORDOBA_MC_FONDO_UNRESOLVED_RING },
                fieldProvenance: { maxCoverage: 'pipeline-extracted', permittedUse: 'pipeline-extracted' },
                ordinanceRef:
                    'PGOU Art. 13.5.2.5 (ocup. PB 100 % / PA 70 %), 13.5.2.3 (alineación a vial), 13.5.4 ' +
                    '(uso resid. plurifam.). ⚠ altura Art. 13.5.3.1 = per-street-width TABLE → null; ' +
                    'verified table: CORDOBA_MC_STREET_WIDTH_HEIGHT_TABLE[\'MC-1\'] (not yet consumed — ' +
                    'no street-width resolver). edificabilidad 13.5.2.2 DERIVED → null. ' + SRC,
            },
            {
                code: 'MC-2',
                label: 'Manzana Cerrada, subzona MC-2 (PGOU Art. 13.5)',
                permittedUse: ['residential', 'mixed'],
                maxHeight_m: null,
                maxFloors: null,
                plotRatioFAR: null,
                maxCoverage: 0.7,
                setbacks: { front_m: null, side_m: null, rear_m: null },
                // ⚠ L-616 GUARD — structural refusal (never a full-parcel box). See CORDOBA_MC_FONDO_UNRESOLVED_RING.
                geometricRule: { kind: 'explicit-area', ringRef: CORDOBA_MC_FONDO_UNRESOLVED_RING },
                fieldProvenance: { maxCoverage: 'pipeline-extracted', permittedUse: 'pipeline-extracted' },
                ordinanceRef:
                    'PGOU Art. 13.5.2.5 (ocup. PB 100 % / PA 70 %), 13.5.2.3 (alineación a vial). ⚠ altura ' +
                    '13.5.3.1 TABLE (≤10 m→PB+2; >10→PB+3) → null; verified table: ' +
                    'CORDOBA_MC_STREET_WIDTH_HEIGHT_TABLE[\'MC-2\'] (not yet consumed — no street-width ' +
                    'resolver). edificabilidad 13.5.2.2 DERIVED → null. ' + SRC,
            },
            {
                code: 'MC-3',
                label: 'Manzana Cerrada, subzona MC-3 (PGOU Art. 13.5)',
                permittedUse: ['residential', 'mixed'],
                maxHeight_m: null,
                maxFloors: null,
                // ⚠ Art. 13.5.2.2 — MC-3 edificabilidad neta = 3,50 m²t/m²s. EXCEEDS the FAR range gate
                // [0.2, 3.0] → the pipeline routes it to a HUMAN (do not auto-accept). Packed because the
                // read is confident (a genuine high-density subzone) but the gate flag rides with it.
                plotRatioFAR: 3.5,
                maxCoverage: 0.7,
                setbacks: { front_m: null, side_m: null, rear_m: null },
                // ⚠ L-616 GUARD — structural refusal (never a full-parcel box). See CORDOBA_MC_FONDO_UNRESOLVED_RING.
                geometricRule: { kind: 'explicit-area', ringRef: CORDOBA_MC_FONDO_UNRESOLVED_RING },
                fieldProvenance: { maxFAR: 'pipeline-extracted', maxCoverage: 'pipeline-extracted', permittedUse: 'pipeline-extracted' },
                ordinanceRef:
                    'PGOU Art. 13.5.2.2 (FAR 3,50 — ⚠ OUT OF RANGE [0.2,3.0], human-verify), 13.5.2.5 ' +
                    '(ocup. PB 100 % / PA 70 %), 13.5.2.3 (alineación a vial). ⚠ altura 13.5.3.1 TABLE → null; ' +
                    'verified table: CORDOBA_MC_STREET_WIDTH_HEIGHT_TABLE[\'MC-3\'] (not yet consumed — ' +
                    'no street-width resolver). ' + SRC,
            },
            {
                code: 'MC-4',
                label: 'Manzana Cerrada, subzona MC-4 (PGOU Art. 13.5)',
                permittedUse: ['residential', 'mixed'],
                maxHeight_m: null,
                maxFloors: null,
                plotRatioFAR: null,
                maxCoverage: 0.9,           // Art. 13.5.2.5.2 — MC-4 plantas altas 90 % (planta baja 100 %)
                setbacks: { front_m: null, side_m: null, rear_m: null },
                // ⚠ L-616 GUARD — structural refusal (never a full-parcel box). See CORDOBA_MC_FONDO_UNRESOLVED_RING.
                geometricRule: { kind: 'explicit-area', ringRef: CORDOBA_MC_FONDO_UNRESOLVED_RING },
                fieldProvenance: { maxCoverage: 'pipeline-extracted', permittedUse: 'pipeline-extracted' },
                ordinanceRef:
                    'PGOU Art. 13.5.2.5.2 (ocup. PB 100 % / PA 90 %), 13.5.2.3 (alineación a vial). ⚠ altura ' +
                    '13.5.3.1 TABLE (MC-2/MC-4 band) → null; verified table: ' +
                    'CORDOBA_MC_STREET_WIDTH_HEIGHT_TABLE[\'MC-4\'] (not yet consumed — no street-width ' +
                    'resolver). edificabilidad 13.5.2.2 DERIVED → null. ' + SRC,
            },
            // ── PT-CV (Campo de la Verdad, Conjunto Histórico "PT" ordinance) — PARTIAL, redirected
            // by Art. 13.4.1 to the Tomo VI / Conjunto Histórico "Ordenanza de Protección Tipológica"
            // (Art. 43-55). ⭐ NEWLY PACKED 2026-08-04 — Tomo VI is now HELD (see
            // `CORDOBA_PTCV_FOOTPRINT_UNRESOLVED_RING`'s header for the full verification record and
            // the reasoning behind every null below). `code:'PTC'` — NOT the family name
            // "CTP1-Campo de la Verdad" — because `subzoneCodeFromLink` parses the live COACo
            // `coaco:ordenanzas.link` basename `O_PTC.pdf` to the bare token `PTC` (no trailing
            // digits), and `resolveZoneDisposition` looks up `packsByZone` by THAT code, exactly the
            // convention every other zone in this pack already follows (`O_MC1`→`MC-1`,
            // `O_PAS2`→`PAS-2`, …). The family name stays the classification-table matching key in
            // `esCordobaZoneClassification.ts`, a DIFFERENT, coarser field.
            {
                code: 'PTC',
                label: 'Campo de la Verdad, Conjunto Histórico — Ordenanza de Protección Tipológica (PGOU Art. 13.4.1 → Tomo VI, Art. 43-55)',
                permittedUse: ['residential', 'mixed'],
                // Art. 49.1: floor count is fixed PER PARCEL on a plan sheet ("plano de edificación
                // (ES)") this corpus does not hold — a scalar would publish one parcel's answer for
                // the whole zone (the same L-526 shape as MC's per-street-width table). Art. 49.2's
                // PB/PB+1/PB+2/PB+3 → 4,50/8,00/11,00/14,00 m table is real and verified but is a
                // floor-count→metres CONVERSION, not a zone-wide selector; see the header comment.
                maxHeight_m: null,
                maxFloors: null,
                // PT chapter (Art. 43-55) states no edificabilidad/FAR coefficient anywhere — unlike
                // CTP-1/MC, which each have a dedicated FAR article. DERIVED-or-absent → null, never 0.
                plotRatioFAR: null,
                maxCoverage: 0.7, // Art. 46.1 — 70 % general; 80 % unifamiliar residencial (conservative: the lower, non-overstating value; see ordinanceRef)
                // Art. 45.2: retranqueos categorically prohibited (façade on the vial line) — an
                // ALIGNMENT zone, same shape as CTP-1/MC. setbacks stay null (the geometricRule below
                // carries the alignment concept); null ≠ 0 keeps the engine skipping the edge rather
                // than asserting a numeric clearance the ordinance does not state that way.
                setbacks: { front_m: null, side_m: null, rear_m: null },
                // ⚠ L-616 GUARD — structural refusal (never a full-parcel box), MC-shaped: no stated
                // buildable depth (Art. 47's patio-siting rule is real but not reducible to a
                // buildableDepth_m this pack can honestly state). See
                // CORDOBA_PTCV_FOOTPRINT_UNRESOLVED_RING's header for why `occupation-capped-alignment`
                // was considered and rejected as a mis-fit for this zone.
                geometricRule: { kind: 'explicit-area', ringRef: CORDOBA_PTCV_FOOTPRINT_UNRESOLVED_RING },
                fieldProvenance: { maxCoverage: 'pipeline-extracted', permittedUse: 'pipeline-extracted' },
                ordinanceRef:
                    'PGOU Art. 13.4.1 (PT-CV envelope → Conjunto Histórico Tomo VI, "Ordenanza de ' +
                    'Protección Tipológica"; parcelación only follows CTP — no effect on any field ' +
                    'here). Tomo VI / normativa_PEPCH_Revisado.pdf, Art. 46.1 (ocup. 70 %, 80 % ' +
                    'unifamiliar), 45.2 (retranqueos prohibidos, alineación a vial), 47 (patio ' +
                    'principal ≥25 %/20 %, lado mín. 7/5/4 m, distancia a fachada ≤10 m, 1ª-3ª ' +
                    'crujía — no reducible a una profundidad edificable), 49.1 (nº plantas POR ' +
                    'PARCELA en el plano de edificación (ES), no held → maxHeight/maxFloors null), ' +
                    '49.2 (alturas reguladoras PB 4,50 / PB+1 8,00 / PB+2 11,00 / PB+3 14,00 m — ' +
                    'conversion table, not a zone-wide selector), 50 (sótano, 1 planta, ocup. ≤ PB). ' +
                    SRC,
            },
        ],
    });

/**
 * The zone codes this pack answers for. Registered against the calificación subzone the dispatcher
 * resolves from `coaco:ordenanzas.ordenanza` + the `O_*` link suffix (e.g. `O_PAS2`→PAS-2, `O_MC3`→MC-3).
 *
 * ⚠ NOT registered here and MUST NOT be — each a cited "no", see the SPEC:
 *   Uso Industrial (subzone-unbindable, ocupación DERIVED), Uso Comercial (context-dependent),
 *   Elemento protegido (preservation → refusal), Unifamiliar Aislada (dead link).
 *
 * ⭐ 2026-08-04 — `PTC` (Campo de la Verdad) IS now registered — see the `PTC` zone block above and
 * `CORDOBA_PTCV_FOOTPRINT_UNRESOLVED_RING`'s header. Tomo VI is held and its "PT" ordinance is read;
 * the zone still resolves to no envelope (structural refusal, MC-shaped), but that is now a PACKED
 * refusal like MC, not a "document not held" coverage gap. `esCordobaZoneClassification.ts`'s legal
 * classification table no longer carries a `CTP1-Campo de la Verdad` entry for this reason.
 */
export const CORDOBA_PGOU2001_ZONE_CODES = [
    'PAS-1', 'PAS-2', 'PAS-3',
    'OA-1', 'OA-2',
    'UAD-1', 'UAD-2', 'UAD-3',
    'CTP-1',
    'MC-1', 'MC-2', 'MC-3', 'MC-4',
    'PTC',
] as const;

// ─── WIRING-TODO — STATUS after this PR (the pack is REGISTERED but renders NO number) ───────────
// 1. ✅ DONE. `pipeline-extracted-unverified` (EnvelopeConfidence + RulePackDefaultConfidence) and
//    `pipeline-extracted` (FieldProvenance) ALREADY EXIST in `ProvenanceFlags.ts` (the header's
//    "not yet present" claim was STALE and is corrected above).
// 2. ✅ DONE. `defaultConfidence` = CORDOBA_INTENDED_DEFAULT_CONFIDENCE; every `fieldProvenance`
//    value = 'pipeline-extracted' (= CORDOBA_INTENDED_FIELD_PROVENANCE). Asserted by esCordobaPack.test.ts.
// 3. ⛔ OPEN — THE HUMAN GATE (but now SIGNABLE). The machine half is DONE: on 2026-08-01 every value
//    in §2 of OCR-EXTRACTION-RESULTS.md was re-read from the publisher's PDFs via the raster-render
//    path (the text layer is empty for 4 of 5 documents) — 13/13 subzones, ZERO wrong values, pinned
//    by `__tests__/esCordobaOcrVerification.test.ts`. What remains is the LEGAL ACT: a
//    Spanish-planning-literate human signing `sources/VERIFICATION.md` §SIG-1 and, per
//    no-silent-graduation, a C23 AIArtefact with humanApproval. ⚠ Signing is ALSO conditional on the
//    confidence-badge fix (the engine currently ignores a pack's declared confidence) and on D1
//    (missing UAD depth) being closed before UAD-3 may bind. UNTIL SIGNED, `CORDOBA_ENVELOPE_VERIFIED`
//    stays false and every Córdoba parcel renders a cited REFUSAL, never a machine-read number.
// 4. ✅ DONE. Registered in `registry.ts`: a Córdoba JurisdictionRegistration (Sur+Noroeste extent +
//    `contains` from `providers/cordobaBbox.ts`; `answerSummary` naming the pilot scope + the derived/
//    tabular gaps + the unverified status), `packsByZone: packMap([ES_CORDOBA_PGOU2001_PACK,
//    CORDOBA_PGOU2001_ZONE_CODES])`, `refusalFor: cordobaZoneRefusalFor` (the legally-grounded
//    not-extractable families) and `noRulePackRefusal: cordobaNoRulePackRefusal` (the coverage-gap card
//    stating the 2-district pilot scope, for the unbindable families + the blank-ordenanza parcels).
// 5. ✅ DONE (as a GATE, not a renderer). `applyCordobaZoningThenFallback` in `siteDispatch.ts` routes a
//    Córdoba parcel; while `CORDOBA_ENVELOPE_VERIFIED === false` it dispatches the honest
//    machine-extracted-unverified refusal and NO numeric envelope reaches the panel/massing. The
//    subzone resolver (`ordenanza` + `O_*` link suffix → COACo WFS) + the re-tiered louder-than-
//    estimated render turn on together WITH step 3; both are the same sign-off event.
// 6. ⛔ OPEN — RE-SCOPED 2026-08-01 (D3), CORRECTED AGAIN 2026-08-04 (see the D3 correction on
//    `CORDOBA_MC_FONDO_UNRESOLVED_RING`'s own header — read that first). Author (a) the CTP-1
//    ocupación step-function hook from `sup_pc_m2` — ⚠ encode the TRUE step: ≤100 m² → 100 %; >100
//    and <125 m² → an ABSOLUTE 100 m² CAP; >125 m² → 80 % (NOT "≤125 → 100 %"); (b) the MC
//    per-street-width height resolver, the Córdoba analogue of `bcnAlcadaNucliAntic.ts`. An MC
//    block-fondo geometry source is NO LONGER REQUIRED: Art. 13.5.2.4 makes MC depth *libre*, bounded
//    by the ocupación this pack already holds, and that ratio is a PARCEL quantity, not a BLOCK one.
//    ⚠ RETRACTED CLAIM (2026-08-04): this item used to say the height resolver ALONE lifts MC to a
//    real envelope. That is FALSE — checked directly against `GeometricRule.ts` and
//    `ZoningRulesEngine.ts` (see the D3 correction). "No block ring needed" ≠ "no footprint
//    construction needed": NO `geometricRule` kind in the current schema can turn "unconstrained
//    depth, ocupación-capped, no stated siting rule" into a footprint ring — `alignment` needs a
//    positive `buildableDepth_m` Art. 13.5.2.4 does not state, `explicit-area` needs published
//    footprint geometry Córdoba does not publish for MC, and the engine's `maxCoverage` cap shapes a
//    ring only inside `tiered-occupation` (ADR-0272 §3.2), never generally. MC's footprint blocker is
//    therefore a SEPARATE, independent gap from its height blocker — a new occupation-only
//    `geometricRule` kind (or real footprint geometry), not merely a resolver. The height resolver
//    remains real, valuable work (MC is 16.86 % of pilot buildable land) — it just closes ONE of
//    MC's two grounds, not both. Until BOTH ship, MC stays a structural refusal via `explicit-area` +
//    CORDOBA_MC_FONDO_UNRESOLVED_RING (WIRING-TODO 7, below), CTP-1 clips to 16 m.
//    ⬆ 2026-08-04 — PARTIAL: the verified table itself is now real, typed, citable data
//    (`CORDOBA_MC_STREET_WIDTH_HEIGHT_TABLE`, all four subzones), so it no longer lives only as a
//    comment. It is DELIBERATELY NOT CONSUMED — no street-width resolver exists to look a parcel's
//    frontage width up against, and PRYZM has no verified Córdoba positional-accuracy figure for
//    Catastro yet either (needed for any future raycast-based width measurement's error buffer,
//    ADR-0287). The resolver + its call site remain fully open; do not wire this table into
//    `siteDispatch.ts` or the engine until both land and are cited at the call site.
//    ⬆ 2026-08-04 — THE FOOTPRINT HALF OF THIS ITEM IS NOW BUILT AND TESTED, BUT NOT WIRED. The
//    "new occupation-only `geometricRule` kind" this item called for exists:
//    `OccupationCappedAlignmentRuleSchema` (`kind: 'occupation-capped-alignment'`, ADR-0288,
//    `packages/schemas/src/site/GeometricRule.ts`) plus the matching `ZoningRulesEngine.ts` solve
//    branch and `geometry/occupationCappedDepth.ts` helper — schema + engine tested in ISOLATION
//    against a synthetic fixture (`occupationCappedAlignmentEnvelope.test.ts`), never against
//    Córdoba. Read that schema's header (and the ⬆ 2026-08-04 addendum on
//    `CORDOBA_MC_FONDO_UNRESOLVED_RING`'s own header, above) before reaching for it here: the kind
//    does not extract a shape from Art. 13.5.2.4, it CONSTRUCTS one (the maximal legally-consistent
//    rectangle at the alignment's frontage width) and labels every output as a PRYZM engineering
//    decision, never an ordinance-stated fact. MC-1..4 STAY on `explicit-area` +
//    `CORDOBA_MC_FONDO_UNRESOLVED_RING` in THIS pack — re-pointing them at the new kind is a
//    separate, later, considered decision (three independent reasons given at the addendum above),
//    not a mechanical follow-up to the kind existing. Height (Art. 13.5.3.1's table) is STILL
//    unresolved regardless, so MC keeps refusing either way until both grounds close.
// 8. ⛔ OPEN (D1, BLOCKING for UAD-3). Carry the stated UAD *profundidad máxima edificable*
//    (Art. 13.9.3.3 — UAD-1 16 m · UAD-2 18 m · UAD-3 16 m) as a `geometricRule`. Without it UAD-3
//    (front 0 + side 0 + no depth band) is an unguarded L-616 mechanism-A whole-parcel overstatement.
// 7. ✅ DONE (L-616 guard). CTP-1 carries a real `alignment` geometricRule (16 m depth, Art. 13.8.2.4);
//    MC-1..4 carry an `explicit-area` geometricRule with an UNRESOLVABLE footprint handle. Neither can
//    ever fall to the whole-parcel inset (ENVELOPE-REALISM-MATRIX mechanism A) once the gate opens.
//    Verified end-to-end in `esCordobaEnvelopeCompute.test.ts`.
