// LANE PT-ZONEID (demo gap G4) — THE PORTUGAL COUNTRY ADAPTER: national ZONE IDENTITY on CRUS
// + the zone-named, source-cited refusal. Assembled on the §J shape the EE/DK/LT/PL/FR adapters
// established (mirror the proven executor, no rival).
//
// WHAT THIS LEG DELIVERS AND REFUSES, IN ONE SENTENCE: every mainland-Portugal point gets a
// NAMED answer — «Solo Urbano - Espaços habitacionais, PDM de ÉVORA, registo/depósito n.º
// 04.07.05/PDM/02/2025/162, Vigente — no envelope asserted» — instead of the blind Estimated
// triple; NUMERIC envelopes are structurally unrepresentable in this adapter's output (the
// numbers live in each município's Regulamento PDF — pt/LEGISLATION-RATE.md ~0 % structured;
// the first pack exists for Porto, CERTIFIED 2026-09-02 — §PORTO-SIGN-OFF + ADR-0379, lane
// PORTO-FLIP — see `ptPortoPdmDraft.ts`: coverage statement + the FUC moda-da-cércea
// evaluation; still NO drawn envelope and NO registered jurisdiction).
//
// §J CONFORMANCE MAP:
//   country      → 'PT'
//   sources()    → PT_ADAPTER_SOURCES (typed row, dated probe log — ptSources.ts)
//   parcel       → NOT here: the wired path stays parcelProviders `dgt-cadastro-predial` +
//                  /api/parcel/pt (live-proven, DEMO-READINESS axis 1) — no rival is minted
//   planGeometry → NOT here: identity only; CRUS polygons are consumed for the containment
//                  pick, never re-served
//   rules        → kind: 'zone-identity-refusal' — resolvePtZoneIdentityAt below
//                  (FetchOutcome<PtZoneIdentity>; identity + refusal, NEVER a number).
//                  Distinct from FR's 'zone-identity' BY NAME because the value shape differs
//                  (PT: one contained zone + refusal; FR: a deferred/zone/rnu union) — a
//                  consumer that treats either as a numeric-rule source is wrong by type.
//   documents    → registo_ou_deposito (SNIT legal-deposit ref) + situacao_pdm travel VERBATIM
//                  on every identity and every refusal's instrument line
//   precedence   → PT_APPLICABILITY_LADDER below, recorded as DATA + honest caveat
//   vocabulary   → NONE, deliberately: this adapter maps no numeric parameters, so declaring
//                  a rule vocabulary would advertise a mapping that does not exist
//
// NO REGISTERED-JURISDICTION RUNG (deliberate, unlike FR): `rulepacks/registry.ts` registers no
// Portuguese jurisdiction today. The Porto pack is CERTIFIED (§PORTO-SIGN-OFF, 2026-09-02) but
// deliberately UNREGISTERED — it draws no envelope; its outputs are the certified coverage
// statement + the FUC moda evaluation ON the refusal card. When a PT pack that DRAWS is ever
// registered, add FR's rung-0 guard
// (`resolveRegisteredJurisdictionAt`, never a copied bbox — L-12871) in the SAME commit that
// registers it; until then a guard rung would be dead code asserting a coverage that does not
// exist. The Porto DRAFT is instead surfaced as a COVERAGE-statement upgrade on the refusal
// (`ptPortoPdmDraftRefusal`), changing no code/legallyGrounded.
//
// FetchOutcome end-to-end (C57 §1.5): empty and failure are DIFFERENT values — the collection's
// served zero (sea, un-transcribed land) is `absent`; the source not answering is `transient`
// and never falls through to an estimate (§CONTEXT-DATA-HONESTY).

import { fetchFound, type FetchOutcome } from '@pryzm/schemas';
import type { ContextSetInput } from '../../rulepacks/declarative/evaluateContextAggregate.js';
import type { PtFetchDeps } from './ptCrusClient.js';
import { resolvePtZoneRefusalAtPoint, type PtZoneIdentity } from './ptCrusZone.js';
import { ptDevelopabilityRefusal } from './ptDevelopability.js';
import {
    extractPtFrenteUrbana,
    type PtFrenteUrbanaData,
    type PtFrenteUrbanaExtraction,
} from './ptFrenteUrbana.js';
import { ptPlanInterventionOverride, type PtPdmObjectEvidence } from './ptPdmObjectGates.js';
import {
    evaluatePtPortoCercea,
    ptPortoFucTipo,
    ptPortoPdmDraftRefusal,
    PT_PORTO_DTCC,
    PT_PORTO_PDM_CERTIFIED,
    type PtPortoCerceaUpgrade,
} from './ptPortoPdmDraft.js';
import { PT_ADAPTER_SOURCES } from './ptSources.js';

/**
 * §J `precedence: ApplicabilityLadder` — Portugal's, as DATA. No numeric rules appear on any
 * rung of THIS adapter; the numeric arm arrives only with a human-signed pack + the E8
 * Portuguese reader (weeks-class, not demo-critical — DEMO-READINESS G4).
 */
export const PT_APPLICABILITY_LADDER = [
    {
        step: 'registered jurisdiction pack — NONE registered for PT today (the Porto pack is CERTIFIED §PORTO-SIGN-OFF but draws no envelope and stays unregistered)',
        mode:
            'FUTURE: when a signed PT pack is registered, mint FR\'s rung-0 ' +
            'resolveRegisteredJurisdictionAt guard in the same commit. Never a copied bbox (L-12871).',
    },
    {
        step: 'CRUS national zone identity (DGT OGC API collection `crus`, point-bbox + containment pick)',
        mode:
            'IDENTITY: classificacao_e_qualificacao / classe_2021 / categoria_2021 verbatim + the ' +
            'PDM instrument (registo_ou_deposito, situacao_pdm) → zone-named cited refusal. The code ' +
            'is legally grounded ONLY where DR 15/2015 categoria semantics settle it (espaço verde / ' +
            'equipamento / non-edificável solo rústico); everything else is a no-rule-pack coverage ' +
            'statement. Porto (DTCC 1312) additionally carries its CERTIFIED pack statement + the ' +
            'FUC moda-da-cércea evaluation (§PORTO-SIGN-OFF + ADR-0379).',
    },
    {
        step: 'mainland routing bbox (PORTUGAL_BBOX — Continente only)',
        mode:
            'PRE-FILTER, never the decider: outside → absent without a fetch (CRUS is Continente-' +
            'only; Açores/Madeira run their own regimes). Inside, the collection\'s own served zero ' +
            'is the real "nothing here".',
    },
] as const;

/**
 * Chain dependencies (lane PT-ENVELOPE): the fetch seam + the OPTIONAL Anexo I-PO object
 * layer for the 22/132 derivability gate. The object layer is injectable because NO public
 * channel serves it today (measured 2026-09-02 — see `ptPdmObjectGates.ts`'s header): when a
 * channel appears, wire THIS dep, never a rival chain.
 */
export interface PtChainDeps extends PtFetchDeps {
    /**
     * Resolve the Anexo I-PO objects whose OBJETOS_POLIGONO polygons CONTAIN the point
     * (containment is the provider's job — the CRUS containment-pick discipline).
     *   • found     → the containing objects (possibly none of them 22/132).
     *   • absent    → the layer answered and no object exists here (a durable fact).
     *   • transient → the layer did not answer — the chain CAVEATS the card rather than
     *                 silently certifying "no PU/PP override" (never overstate).
     */
    readonly resolvePdmObjectsAt?: (
        lat: number,
        lon: number,
    ) => Promise<FetchOutcome<readonly PtPdmObjectEvidence[]>>;
    /**
     * LANE PORTO-FLIP (§PORTO-SIGN-OFF + ADR-0379): resolve the RAW frente-urbana context for
     * the point — the clipped fronting way (between two successive intersecting public ways,
     * Art. 3.º l) plus the context buildings with their per-member height provenance. The pure
     * extractor (`extractPtFrenteUrbana`) then constructs the member set; construction is NEVER
     * this dep's job. Injectable because NO Portuguese channel serves cércea-comparable heights
     * today (§T2 boundary: as-is heights enter ONLY as this rule's named input) and C12 §8
     * forbids a new context fetch in this package — the runtime's existing context machinery
     * supplies the data. No dep wired ⇒ the moda evaluation refuses `context-set-unavailable`
     * BY NAME on the card — never a substituted scalar.
     */
    readonly resolveFrenteUrbanaAt?: (
        lat: number,
        lon: number,
    ) => Promise<FetchOutcome<PtFrenteUrbanaData>>;
}

/**
 * §E1d-shape chain leg — the §J `rules` arm: resolve the CRUS zone containing the point, then
 * carry its cited refusal through THREE upgrades in order (each a statement change only —
 * code/legallyGrounded untouched — except the last, which is a typed REPLACEMENT):
 *   1. Porto (DTCC 1312): the certified-pack coverage line + (FUC I/II) the moda-da-cércea
 *      outcome (`ptPortoPdmDraftRefusal`; §PORTO-SIGN-OFF + ADR-0379, lane PORTO-FLIP).
 *   2. NATIONAL DEVELOPABILITY (lane PT-ENVELOPE): the closed-catalogue verdict + citation
 *      (`ptDevelopabilityRefusal`) — a no-op when the catalogue cannot settle the categoria
 *      (the falsification contract: sever the catalogue, the prior honest refusal returns).
 *   3. OBJECT 22/132 DERIVABILITY GATE: when the injectable object layer serves a PU/PP área
 *      de intervenção CONTAINING the point, the card is REPLACED by the `derived-plan`
 *      refusal naming the overriding plan (`ptPlanInterventionOverride`) — the PDM's verdict
 *      is not governing there. A transient object layer CAVEATS the card by name instead of
 *      silently certifying no override exists.
 */
export async function resolvePtZoneIdentityAt(
    lat: number,
    lon: number,
    deps: PtChainDeps = {},
): Promise<FetchOutcome<PtZoneIdentity>> {
    const resolved = await resolvePtZoneRefusalAtPoint(lat, lon, deps);
    if (resolved.status !== 'found') return resolved;
    const zone = resolved.value.zone;

    // 1 · Porto's coverage-statement upgrade — and, gate OPEN (§PORTO-SIGN-OFF + ADR-0379),
    //     the moda-da-cércea evaluation for FUC tipo I/II zones. The member set arrives ONLY
    //     through the pure extractor over the injected dep; no dep, or a dep that fails, is the
    //     honest `context-set-unavailable` — the card then names the failed precondition and
    //     NEVER substitutes the 21 m cap (the draft header's founding trap).
    let refusal: typeof resolved.value.refusal;
    if (zone.dtcc === PT_PORTO_DTCC) {
        let cercea: PtPortoCerceaUpgrade | null = null;
        const tipo = ptPortoFucTipo(zone);
        if (PT_PORTO_PDM_CERTIFIED && tipo !== null) {
            let contextSet: ContextSetInput;
            let extraction: PtFrenteUrbanaExtraction | null = null;
            if (!deps.resolveFrenteUrbanaAt) {
                contextSet = {
                    status: 'unavailable',
                    why:
                        'no frente-urbana context source is wired in this runtime — the way + ' +
                        'building heights that would constitute the member set were never ' +
                        'fetched (PtChainDeps.resolveFrenteUrbanaAt absent)',
                };
            } else {
                const fetched = await deps.resolveFrenteUrbanaAt(lat, lon);
                if (fetched.status === 'found') {
                    extraction = extractPtFrenteUrbana(fetched.value);
                    contextSet = extraction.contextSet;
                } else if (fetched.status === 'absent') {
                    // The source answered and found NO fronting public way — the frontage
                    // cannot be ESTABLISHED, which is unavailability of the SET, not an empty
                    // set (empty = an established frontage with zero built members).
                    contextSet = {
                        status: 'unavailable',
                        why: `the frontage source answered without a fronting way (${fetched.reason})`,
                    };
                } else {
                    contextSet = {
                        status: 'unavailable',
                        why: `the frontage source did not answer (${
                            fetched.status === 'transient' ? fetched.reason : 'aborted'
                        })`,
                    };
                }
            }
            cercea = evaluatePtPortoCercea(tipo, contextSet, extraction, null);
        }
        refusal = ptPortoPdmDraftRefusal(zone, cercea);
    } else {
        refusal = resolved.value.refusal;
    }

    // 2 · The national developability verdict (no-op on a catalogue miss — never a guess).
    refusal = ptDevelopabilityRefusal(zone, refusal);

    // 3 · The PU/PP derivability gate, only where an object layer is wired.
    if (deps.resolvePdmObjectsAt) {
        const objects = await deps.resolvePdmObjectsAt(lat, lon);
        if (objects.status === 'found') {
            const override = ptPlanInterventionOverride(zone, objects.value);
            if (override !== null) refusal = override;
        } else if (objects.status === 'transient' || objects.status === 'aborted') {
            // The layer exists but did not answer (or was superseded): saying nothing would
            // silently certify "no PU/PP override", which may overstate. Caveat by name.
            refusal = {
                ...refusal,
                detail:
                    refusal.detail +
                    ' ⚠ The Anexo I-PO plan-intervention layer (PU/PP override check, códigos ' +
                    `22/132) did not answer (${objects.reason ?? 'aborted'}) — whether a site-` +
                    'specific plan overrides the PDM at this point is UNVERIFIED on this card.',
            };
        }
        // absent → the layer answered "no object here": the durable clean case, no change.
    }

    return fetchFound({ zone, refusal });
}

/**
 * The assembled PT country adapter — the §J shape as a value. (The shared SDK type is still
 * E1bc's to mint — the EE §SEAM-E1BC-FETCHCHAIN note applies verbatim; reconcile HERE when it
 * lands, never by editing core to match an adapter.)
 */
export const ptCountryAdapter = {
    country: 'PT' as const,
    sources: () => PT_ADAPTER_SOURCES,
    rules: { kind: 'zone-identity-refusal' as const, fetchChain: resolvePtZoneIdentityAt },
    precedence: PT_APPLICABILITY_LADDER,
};

export {
    PT_CRUS_BBOX_HALF_DEG,
    PT_CRUS_COLLECTION,
    PT_CRUS_OGCAPI_ENDPOINT,
    PT_CRUS_POINT_LIMIT,
    PT_CRUS_PROXY_PATH,
    buildPtCrusPointUrl,
    parsePtCrusItemsBody,
    ptCrusFeaturesAtPoint,
    ptGetJson,
    type PtCrusRawFeature,
    type PtFetchDeps,
    type PtLonLatRing,
} from './ptCrusClient.js';
export {
    PT_CRUS_JURISDICTION_ID,
    classifyPtCrusClasse,
    parsePtCrusZone,
    ptCrusZoneRefusal,
    ptRefusalCodeForZone,
    resolvePtCrusZoneAtPoint,
    resolvePtZoneRefusalAtPoint,
    type PtCrusClasse,
    type PtCrusZone,
    type PtZoneIdentity,
} from './ptCrusZone.js';
export {
    PT_PORTO_DTCC,
    PT_PORTO_JURISDICTION_ID,
    PT_PORTO_MODA_CERCEA_RULE,
    PT_PORTO_PDM_CERTIFIED,
    PT_PORTO_PDM_DRAFT,
    PT_PORTO_PDM_SOURCE,
    evaluatePtPortoCercea,
    ptPortoCerceaStatement,
    ptPortoFucTipo,
    ptPortoPdmDraftRefusal,
    type PtPdmDraftValue,
    type PtPortoCerceaUpgrade,
    type PtPortoFucTipo,
} from './ptPortoPdmDraft.js';
// LANE PORTO-FLIP — the frente-urbana extractor (ADR-0379 lane-A-row-1 seat; members injected).
export {
    extractPtFrenteUrbana,
    PT_FRONTAGE_BAND_M,
    PT_FRONTAGE_MIN_EXTENT_M,
    type PtFrenteUrbanaData,
    type PtFrenteUrbanaExtraction,
    type PtFrontageBuilding,
    type PtFrontagePoint,
    type PtFrontageWay,
} from './ptFrenteUrbana.js';
export { PT_ADAPTER_SOURCES, PT_CRUS_SOURCE_ID } from './ptSources.js';
// LANE PT-ENVELOPE — the vendored national catalogue (Aviso n.º 9282/2021 Anexo I) + the
// developability map + the object gates, explicit list (the pt barrel discipline: no export *).
export {
    PT_ANEXO_I_PO_OBJECTS,
    PT_ANEXO_I_PO_TRUNCATION,
    PT_ATO_SERIE_DOMAIN,
    PT_ATO_TIPO_DOMAIN,
    PT_CONDICIONANTES_CODES,
    PT_CONDICIONANTES_THEMES,
    PT_PDM_FIVE_TABLE_SCHEMA,
    PT_PDM_NORM_CITATION,
    PT_PDM_NORM_CONFORMANCE_CAVEAT,
    PT_PDM_TOPOLOGY_GUARANTEE,
    PT_PLANTA_DOMAIN,
    PT_SOIL_CATEGORIES,
    normalisePtDesignacao,
    ptAnexoPoObjectByCodigo,
    ptSoilCategoryByCodigo,
    ptSoilCategoryByName,
    type PtAnexoPoObject,
    type PtAtoSerie,
    type PtAtoTipo,
    type PtCondicionanteCode,
    type PtPdmTable,
    type PtPdmTableField,
    type PtSoilCategory,
    type PtSoloClasse,
} from './ptPdmDataModel.js';
export {
    PT_DEVELOPABILITY_BY_CODIGO,
    ptDevelopabilityForZone,
    ptDevelopabilityRefusal,
    type PtDevelopabilityStatement,
    type PtDevelopabilityVerdict,
} from './ptDevelopability.js';
export {
    PT_PLAN_INTERVENTION_CODES,
    parsePtAtoEspecifico,
    parsePtSrupServCitation,
    ptAtoCitation,
    ptPlanInterventionOverride,
    ptSrupCitationLine,
    type PtAtoEspecificoRow,
    type PtPdmObjectEvidence,
    type PtSrupServCitation,
} from './ptPdmObjectGates.js';

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LANE ENVELOPE-IBERIA round 4 (§PT-DOCTRINE-REACH) — THE DERIVATION, MADE REACHABLE.
//
// ⛔ THE DEFECT THIS CLOSES, AND IT IS A RECURRENCE. Round 2 (`9c14009f`) shipped the seven
// doctrine modules and round 3's scorecard found them exported from NO barrel and imported by
// NOTHING. Round 3 (`e9593136`) composed them into `derivePtEnvelope` — and shipped THAT the same
// way: `grep -rn 'derivePtEnvelope'` over the repo returned **one file, its own definition**. The
// pipeline was `export`ed from its module and re-exported by nobody, so no consumer outside
// `countryAdapters/pt/` could reach it and no test ran it. §committed-is-not-reachable, twice, one
// level apart. The list below is the fix; `ptDerivePtEnvelope.test.ts` is the proof it runs.
//
// ⚠ REACHABLE ≠ WIRED, and this block does NOT wire anything. `ptCountryAdapter.rules` stays
// `zone-identity-refusal`, `registry.ts` still registers no Portuguese jurisdiction, and the
// §PORTO-SIGN-OFF signature authorises the coverage statement + the moda evaluation, NOT an
// envelope-drawing pack. What changes is that a caller — a test, a probe, a future chain leg — can
// now IMPORT the derivation instead of re-implementing the step order. See
// `docs/04-reference/jurisdictions/pt/PT-DOCTRINE-SCORECARD.md` for what is still missing (the
// feed: no município has a `PtRegulamentoIndex`, no B4 condicionante read, no S from the DGT MDT).
// ══════════════════════════════════════════════════════════════════════════════════════════════
export {
    derivePtEnvelope,
    ptDerivedJurisdictionId,
    ptResolvedPack,
    type PtConstraintApplied,
    type PtDeriveInput,
    type PtDerivation,
    type PtParcelBlock,
    type PtRefusalEntry,
    type PtRegulatoryIdentity,
    type PtResolvedPackInput,
    type PtVolumeBlock,
} from './derivePtEnvelope.js';
// The provenance vocabulary every emitted PT value carries (doctrine §0.1).
export {
    ptAssumed,
    ptBlockingReasons,
    ptCollectAssumptions,
    ptResolved,
    ptUnresolved,
    type PtDerivationMethod,
    type PtInstrumentRef,
    type PtProvenancedValue,
    type PtValueConfidence,
} from './ptProvenance.js';
// §2.6 — the concept dictionary, and the version boundary that decides which one governs.
export {
    normalisePtTerm,
    ptConceptsWithoutC58Seat,
    resolveConceptDictionaryVersion,
    typeCheckPtToken,
    PT_CERCEA_LOCAL_DEFINITION_CONFLICT,
    PT_CONCEPTS,
    PT_DICTIONARY_BOUNDARY_DATE,
    PT_LEXICON_SCOPE,
    PT_TERM_ALIASES,
    type PtConcept,
    type PtConceptDictionaryVersion,
    type PtConceptUnit,
    type PtDictionaryResolution,
    type PtTermAlias,
    type PtTokenCheck,
} from './ptConceptLexicon.js';
// §11 A1 — the parcel-geometry precedence ladder.
export {
    resolvePtParcelGeometrySource,
    PT_A1_PRECEDENCE,
    PT_BUPI_WATCH,
    type PtA1Input,
    type PtA1Outcome,
    type PtParcelSourceRung,
} from './ptParcelSource.js';
// §5 / §12.3 — DL 82/2021 art. 61, the rústico fuel-management strip.
export {
    evaluatePtRusticoFuelStrip,
    PT_DL82_ART61_CITATION,
    PT_DL82_ART61_REVIEW_WATCH,
    PT_DL82_ART61_STRIP_M,
    type PtRusticoFuelStripInput,
    type PtRusticoFuelStripOutcome,
    type PtTristate,
} from './ptRusticoFuelStrip.js';
// §6 / §12.5 — ETIQUETA is the join key, BEFORE any text similarity.
export {
    joinPtEtiqueta,
    PT_ETIQUETA_WATCH,
    type PtEtiquetaJoin,
    type PtRegulamentoEntry,
    type PtRegulamentoIndex,
    type PtRegulamentoNumber,
} from './ptEtiquetaJoin.js';
// §2.4 / §4 / §3 art. 65 — the five height quantities, never collapsed, and the multi-value datum.
export {
    ptFacadeDatums,
    ptJointHeightStoreys,
    ptTopCapAboveSoleira,
    ptUnresolvedHeight,
    PT_RGEU_ART65,
    PT_RGEU_ART65_MIN_PE_DIREITO_M,
    PT_RGEU_STATUS_WATCH,
    type PtBindingSide,
    type PtDatum,
    type PtFacadeDatum,
    type PtGoverningHeightQuantity,
    type PtHeightLimits,
    type PtJointHeightStoreys,
    type PtTopCapOutcome,
} from './ptHeightQuantities.js';
// §2.5 / §12.8–9 — C1 (always inferred) and the polígono de implantação from Re/Af.
export {
    buildPtPoligonoImplantacao,
    inferPtC1Family,
    ptRecuoAfastamentoValue,
    PT_C1_INSTRUMENT,
    PT_C1_VOCABULARY,
    type PtC1Family,
    type PtC1Inference,
    type PtC1VocabularyEntry,
    type PtImplantacaoInput,
    type PtImplantacaoOutcome,
} from './ptImplantacao.js';
// §11 B4 — condicionantes, with the RAN/REN EXCLUSION layers (69/82) and the APA licence gate.
export {
    evaluatePtCondicionantes,
    PT_APA_LICENCE_GATE,
    PT_CONDICIONANTE_RAN,
    PT_CONDICIONANTE_RAN_EXCLUSAO,
    PT_CONDICIONANTE_REN,
    PT_CONDICIONANTE_REN_EXCLUSAO,
    PT_RJRAN_INSTRUMENT,
    PT_RJREN_INSTRUMENT,
    type PtAppliedCondicionante,
    type PtCondicionanteEffect,
    type PtCondicionantesInput,
    type PtCondicionantesVerdict,
    type PtLayerHit,
    type PtRenSource,
} from './ptCondicionantes.js';
// §3 — RGEU art. 59 (the inclined plane) and art. 60 (10 m between façades with openings).
export {
    buildPtRgeuArt59Planes,
    solvePtRgeuArt59,
    PT_RGEU_ART59,
    PT_RGEU_ART59_CORNER_RUN_M,
    PT_RGEU_ART59_DOWNHILL_TOLERANCE_M,
    PT_RGEU_ART59_SLOPE_PER_M,
    type PtArt59Band,
    type PtArt59Corner,
    type PtArt59Frontage,
    type PtArt59Input,
    type PtArt59Planes,
    type PtArt59Solve,
} from './ptRgeuArt59.js';
export {
    evaluatePtRgeuArt60,
    PT_RGEU_ART60,
    PT_RGEU_ART60_MIN_M,
    type PtArt60Edge,
    type PtArt60EdgeOutcome,
    type PtArt60Verdict,
} from './ptRgeuArt60.js';
// §2.2 / §12.11–12 — the national Ac counting rule, the Iu trim, and the disaggregated yield.
export {
    ptCountAc,
    ptEmitAcYield,
    ptIndices,
    ptTrimToIu,
    PT_AC_USES,
    PT_DR5_2019_INDICES,
    type PtAcCount,
    type PtAcCountOutcome,
    type PtAcUse,
    type PtAcYield,
    type PtFloorInput,
    type PtIndices,
    type PtIndicesInput,
    type PtIuTrim,
} from './ptAcCounting.js';
// §7 / §8 — the other derived-plan flags (20/135/136/138) and the topology invariant.
export {
    ptAugiRefusal,
    ptDerivedPlanFlags,
    ptDoubleClassificationDefect,
    PT_DERIVED_PLAN_FLAG_CODES,
    PT_RJRU_INSTRUMENT,
    type PtClassificationClaim,
    type PtDerivedPlanFlags,
} from './ptPdmObjectGates.js';
