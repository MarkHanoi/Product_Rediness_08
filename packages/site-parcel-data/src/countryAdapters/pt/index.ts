// LANE PT-ZONEID (demo gap G4) — THE PORTUGAL COUNTRY ADAPTER: national ZONE IDENTITY on CRUS
// + the zone-named, source-cited refusal. Assembled on the §J shape the EE/DK/LT/PL/FR adapters
// established (mirror the proven executor, no rival).
//
// WHAT THIS LEG DELIVERS AND REFUSES, IN ONE SENTENCE: every mainland-Portugal point gets a
// NAMED answer — «Solo Urbano - Espaços habitacionais, PDM de ÉVORA, registo/depósito n.º
// 04.07.05/PDM/02/2025/162, Vigente — no envelope asserted» — instead of the blind Estimated
// triple; NUMERIC envelopes are structurally unrepresentable in this adapter's output (the
// numbers live in each município's Regulamento PDF — pt/LEGISLATION-RATE.md ~0 % structured;
// the first pack DRAFT exists for Porto and is gate-shut, see `ptPortoPdmDraft.ts`).
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
// Portuguese jurisdiction today, and the one drafted pack (Porto) is UNCERTIFIED and unregistered
// by design. When a signed PT pack is ever registered, add FR's rung-0 guard
// (`resolveRegisteredJurisdictionAt`, never a copied bbox — L-12871) in the SAME commit that
// registers it; until then a guard rung would be dead code asserting a coverage that does not
// exist. The Porto DRAFT is instead surfaced as a COVERAGE-statement upgrade on the refusal
// (`ptPortoPdmDraftRefusal`), changing no code/legallyGrounded.
//
// FetchOutcome end-to-end (C57 §1.5): empty and failure are DIFFERENT values — the collection's
// served zero (sea, un-transcribed land) is `absent`; the source not answering is `transient`
// and never falls through to an estimate (§CONTEXT-DATA-HONESTY).

import { fetchFound, type FetchOutcome } from '@pryzm/schemas';
import type { PtFetchDeps } from './ptCrusClient.js';
import { resolvePtZoneRefusalAtPoint, type PtZoneIdentity } from './ptCrusZone.js';
import { ptDevelopabilityRefusal } from './ptDevelopability.js';
import { ptPlanInterventionOverride, type PtPdmObjectEvidence } from './ptPdmObjectGates.js';
import { ptPortoPdmDraftRefusal, PT_PORTO_DTCC } from './ptPortoPdmDraft.js';
import { PT_ADAPTER_SOURCES } from './ptSources.js';

/**
 * §J `precedence: ApplicabilityLadder` — Portugal's, as DATA. No numeric rules appear on any
 * rung of THIS adapter; the numeric arm arrives only with a human-signed pack + the E8
 * Portuguese reader (weeks-class, not demo-critical — DEMO-READINESS G4).
 */
export const PT_APPLICABILITY_LADDER = [
    {
        step: 'registered jurisdiction pack — NONE registered for PT today (Porto draft is gate-shut)',
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
            'statement. Porto (DTCC 1312) additionally names its unsigned pack draft.',
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
}

/**
 * §E1d-shape chain leg — the §J `rules` arm: resolve the CRUS zone containing the point, then
 * carry its cited refusal through THREE upgrades in order (each a statement change only —
 * code/legallyGrounded untouched — except the last, which is a typed REPLACEMENT):
 *   1. Porto (DTCC 1312): the gate-shut pack-draft coverage line (`ptPortoPdmDraftRefusal`).
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

    // 1 · Porto's coverage-statement upgrade (unchanged behaviour).
    let refusal =
        zone.dtcc === PT_PORTO_DTCC ? ptPortoPdmDraftRefusal(zone) : resolved.value.refusal;

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
    PT_PORTO_PDM_CERTIFIED,
    PT_PORTO_PDM_DRAFT,
    PT_PORTO_PDM_SOURCE,
    ptPortoPdmDraftRefusal,
    type PtPdmDraftValue,
} from './ptPortoPdmDraft.js';
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
