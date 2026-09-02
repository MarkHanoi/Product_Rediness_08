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
 * §E1d-shape chain leg — the §J `rules` arm: resolve the CRUS zone containing the point, then
 * carry its ready-made cited refusal; for Porto (DTCC 1312) the refusal is upgraded to name the
 * gate-shut pack draft (a coverage-statement change only — code/legallyGrounded untouched).
 */
export async function resolvePtZoneIdentityAt(
    lat: number,
    lon: number,
    deps: PtFetchDeps = {},
): Promise<FetchOutcome<PtZoneIdentity>> {
    const resolved = await resolvePtZoneRefusalAtPoint(lat, lon, deps);
    if (resolved.status !== 'found') return resolved;
    if (resolved.value.zone.dtcc !== PT_PORTO_DTCC) return resolved;
    return fetchFound({
        zone: resolved.value.zone,
        refusal: ptPortoPdmDraftRefusal(resolved.value.zone),
    });
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
