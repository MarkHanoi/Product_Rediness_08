// E7-LU — THE LUXEMBOURG COUNTRY ADAPTER (REPORT §J shape; E7-FAMILY §6 A/F).
//
// §J CONFORMANCE MAP:
//   country      → 'LU'
//   sources()    → LU_ADAPTER_SOURCES (one typed row, dated probe, CC0 confirmed at the deed)
//   parcel       → resolveLuParcelAtWgs84Point (LIVE ACT / INSPIRE cp:CP.CadastralParcel WFS, lane
//                  LU-PARCEL 2026-09-03 — the click-to-select leg the founder bug L-? needed). The
//                  older resolveLuParcelByNumCadast (below) stays for GPKG key lookups but is NOT
//                  the click path: NUM_CADAST is not unique, so a click resolves by GEOMETRY here.
//   planGeometry → resolveLuNqPapByXtfId / resolveLuNqPapCandidatesForEnvelope (bbox CANDIDATES)
//   rules        → kind: 'structured' — resolveLuZoneChain below (FetchOutcome<LuZoneChain>)
//   documents    → the partie-écrite FILENAME travels verbatim on every rule's source.document;
//                  Luxembourg serves no document URL, so no Document entity is minted and no
//                  retriever is pretended
//   precedence   → LU_APPLICABILITY_LADDER, recorded as DATA + the honest caveats
//   vocabulary   → LU_COEFFICIENT_VOCABULARY (luRuleMapper.ts)
//
// §SEAM-E1BC-FETCHCHAIN: as in `ee/index.ts`, the shared SDK `CountryAdapter`/`fetchChain` type
// is not this lane's to mint. `fetchChain` here is keyed by the NQ-PAP transfer id, because that
// is the only unique key Luxembourg serves. When the SDK type lands, reconcile HERE.
//
// ⛔ WHY THE CHAIN IS KEYED ON A ZONE AND NOT ON A PARCEL — and it is the interesting fact about
// Luxembourg, not a shortcut. EE/DK/LT/PL all resolve parcel → plan → rules. LU cannot, honestly:
// its cadastral key is ambiguous (15,110 duplicate groups) and its only spatial join is a bbox
// R-tree (bbox ⊃ polygon). So the chain resolves the ZONE — which is where the four coefficients
// actually live, and which the statute says they govern as an AVERAGE over the whole zone rather
// than per parcel (RGD 08/03/2017 Art. 26). Keying on the parcel would have imported a precision
// neither the register nor the law offers. The parcel leg is still exposed, and carries its
// ambiguity in its own type.

import { SpanStatusCode, trace } from '@opentelemetry/api';
import type {
    FetchOutcome,
    SiteIntelPlan,
    SiteIntelRule,
    SiteIntelSource,
    SiteIntelZone,
} from '@pryzm/schemas';
import { fetchLuPagManifest, type LuPagDeps, type LuPagManifest } from './luPagGpkgClient.js';
import { resolveLuNqPapByXtfId } from './luPagProvider.js';
import { resolveLuParcelAtWgs84Point, type LuCadastralParcel } from './luParcelProvider.js';
import { mapLuNqPapRowToRules } from './luRuleMapper.js';
import { LU_ADAPTER_SOURCES } from './luSources.js';
import type { LuNqPapRow } from './luPagGpkgClient.js';

const tracer = trace.getTracer('pryzm.siteintel.lu');

/**
 * §J `precedence: ApplicabilityLadder` — Luxembourg's, as DATA. It exists in LAW but NOT as a
 * per-feature fact the register serves, which is why every rule carries `rank: null` (the
 * E7-FAMILY §6 E third case: "the ladder exists but is adapter DATA, not a per-rule fact").
 */
export const LU_APPLICABILITY_LADDER = [
    {
        step: 'PAP « nouveau quartier » — the zone-level degré d’utilisation du sol (COS/CUS/CSS/DL)',
        mode:
            'DIRECT structured attributes, PAG_PAG_NQ_PAP — 3,017 zones nationally. The values ' +
            'are ZONE AVERAGES that individual lots may exceed (RGD 08/03/2017 Art. 26).',
    },
    {
        step: 'PAP « quartier existant » — PAG_PAG_ZONES_QE',
        mode:
            'NO NUMERICS SERVED. 18,743 zones carry only the partie-écrite FILENAME ' +
            '(NOM_FICHIER_EC/GR, a DOCX). Numeric limits there require the extraction pipeline ' +
            '(tier 4 → 5), never inline parsing. Most buildable land in a mature country is here.',
    },
    {
        step: 'PAG base zoning — PAG_PAG_ZONAGE (CATEGORIE: HAB_1, MIX_v, BEP, AGR, …)',
        mode: 'DIRECT (use category only). 46,191 zones, 25 measured national codes, no numerics.',
    },
    {
        step: 'height / setbacks / storey count',
        mode:
            'ABSENT FROM THE ENTIRE MODEL — measured across all 27 feature classes 2026-09-01. ' +
            'They live in the PAP and the DOCX partie écrite. Luxembourg is broad-and-shallow: ' +
            'four areal parameters nationally, and nothing vertical.',
    },
    {
        step: 'règlement sur les bâtisses (communal building regulation)',
        mode:
            'NOT IN THIS ARTEFACT and not machine-readable nationally — a per-commune document. ' +
            'Absence from the PAG dataset ≠ absence of a rule.',
    },
] as const;

/** One resolved NQ-PAP zone with its rules AND the minted referents those rules cite. */
export interface LuResolvedNqPapZone {
    readonly row: LuNqPapRow;
    /** The minted `SiteIntelPlan` (the commune's PAG), or null when no CODE_COM was served. */
    readonly planEntity: SiteIntelPlan | null;
    /** The minted `SiteIntelZone` the rules cite, or null (referent ladder step 2/3). */
    readonly zoneEntity: SiteIntelZone | null;
    /** Seven rules — one per vocabulary entry, tier-6 UNKNOWNs included and never dropped. */
    readonly rules: readonly SiteIntelRule[];
}

/** The full chain for one zone: manifest (live) → zone row (artefact) → rules (pure mapper). */
export interface LuZoneChain {
    /**
     * The LIVE dataset manifest — licence, refresh timestamp, current artefact URL. Carried as
     * its own outcome: the artefact can be readable while the portal is down, and that must not
     * read as "no data".
     */
    readonly manifest: FetchOutcome<LuPagManifest>;
    readonly zone: LuResolvedNqPapZone;
}

/**
 * Resolve the chain for one NQ-PAP transfer id.
 *
 * PURE ORCHESTRATION of typed outcomes: the zone leg failing fails the chain (there is nothing
 * to hang rules on); the manifest leg is carried as its own FetchOutcome so a portal outage
 * degrades provenance without destroying the answer. The mapper's one structural refusal (a row
 * with neither geometry nor commune) is caught and carried as a transient naming the cause —
 * never a silent drop.
 */
export async function resolveLuZoneChain(
    xtfId: string,
    deps: LuPagDeps = {},
    nowIso?: string,
): Promise<FetchOutcome<LuZoneChain>> {
    return tracer.startActiveSpan(
        'pryzm.siteintel.lu.resolveZoneChain',
        async (span): Promise<FetchOutcome<LuZoneChain>> => {
            try {
                span.setAttribute('lu.xtfId', xtfId);
                // The parenthesised form — the one three of four sibling adapters use and the
                // only one that survives a caller passing a full ISO timestamp (E7-FAMILY §6 F,
                // and the DK defect L-12873 it names).
                const fetchedAtIso = (nowIso ?? new Date().toISOString()).slice(0, 10);

                const [manifest, zoneOutcome] = await Promise.all([
                    fetchLuPagManifest(deps),
                    resolveLuNqPapByXtfId(xtfId, deps),
                ]);

                if (zoneOutcome.status !== 'found') {
                    span.setStatus(
                        zoneOutcome.status === 'transient'
                            ? { code: SpanStatusCode.ERROR, message: zoneOutcome.reason }
                            : { code: SpanStatusCode.OK },
                    );
                    return zoneOutcome;
                }

                let mapped;
                try {
                    mapped = mapLuNqPapRowToRules(zoneOutcome.value, fetchedAtIso);
                } catch (e) {
                    const reason = `mapper-refused: ${e instanceof Error ? e.message : String(e)}`;
                    span.setStatus({ code: SpanStatusCode.ERROR, message: reason });
                    return { status: 'transient', reason };
                }

                span.setStatus({ code: SpanStatusCode.OK });
                return {
                    status: 'found',
                    value: {
                        manifest,
                        zone: {
                            row: zoneOutcome.value,
                            planEntity: mapped.plan,
                            zoneEntity: mapped.zone,
                            rules: mapped.rules,
                        },
                    },
                };
            } finally {
                span.end();
            }
        },
    );
}

/** The assembled LU country adapter — the §J shape as a value (E7-FAMILY §6 F). */
export const luCountryAdapter = {
    country: 'LU' as const,
    sources: (): readonly SiteIntelSource[] => LU_ADAPTER_SOURCES,
    // §J `parcel` — the LIVE ACT / INSPIRE cadastral-parcel click leg (lane LU-PARCEL, 2026-09-03).
    // This is a DIFFERENT source from the PAG-GPKG rules half and from the ambiguous NUM_CADAST
    // key-join below (`resolveLuParcelByNumCadast`): it resolves the parcel UNDER a WGS84 click via
    // the keyless INSPIRE WFS, joined to the rules by geometry (point ∈ parcel), never by the
    // duplicate-prone NUM_CADAST. One authority per concept (C84 EI-9).
    parcel: {
        resolveAtWgs84Point: (
            lat: number,
            lon: number,
        ): Promise<FetchOutcome<LuCadastralParcel>> => resolveLuParcelAtWgs84Point(lat, lon),
    },
    rules: { kind: 'structured' as const, fetchChain: resolveLuZoneChain },
    precedence: LU_APPLICABILITY_LADDER,
};

export { LUXEMBOURG_BBOX, isInLuxembourg, LU_NATIVE_CRS } from './luJurisdiction.js';
export {
    LU_DATA_PUBLIC_API,
    LU_PAG_ARTEFACT_BYTES_2026_08_31,
    LU_PAG_ARTEFACT_SHA256_2026_08_31,
    LU_PAG_ARTEFACT_URL_2026_08_31,
    LU_PAG_DATASET_SLUG,
    LU_PAG_TABLES,
    buildLuPagDatasetUrl,
    fetchLuPagManifest,
    parseLuPagManifest,
    type LuFondDePlanRow,
    type LuLurefEnvelope,
    type LuNqPapRow,
    type LuPagDeps,
    type LuPagGpkgReader,
    type LuPagManifest,
    type LuServedGeometry,
    type LuZonageRow,
} from './luPagGpkgClient.js';
export {
    LU_NUM_CADAST_SENTINEL,
    parseLuFondDePlanRow,
    parseLuNqPapRow,
    parseLuZonageRow,
    resolveLuNqPapByXtfId,
    resolveLuNqPapCandidatesForEnvelope,
    resolveLuParcelByNumCadast,
    resolveLuZonageCandidatesForEnvelope,
    type LuNqPapBboxCandidates,
    type LuParcelMatches,
} from './luPagProvider.js';
export {
    LU_COEFFICIENT_VOCABULARY,
    LU_NORMATIVE_FORCE,
    LU_NQ_PAP_CENSUS_2026_09_01,
    LU_RULE_AUTHORITY,
    LU_RULE_DATASET,
    LU_VALUE_BASIS_CODES,
    LU_VALUE_BASIS_SCHEME,
    classifyLuCoefficient,
    countLuUnknownRules,
    luPlanEntityId,
    luRuleEntityId,
    luZoneEntityId,
    mapLuNqPapRowToRules,
    mapLuRowToPlan,
    mapLuRowToZone,
    type LuClassifiedCoefficient,
    type LuCoefficientKind,
    type LuCoefficientVocabularyEntry,
    type LuMappedRuleSet,
} from './luRuleMapper.js';
export { LU_ADAPTER_ENDPOINT_BINDINGS, LU_ADAPTER_SOURCES, LU_PAG_SOURCE_ID } from './luSources.js';
export {
    LU_PARCEL_CLICK_COUNT,
    LU_PARCEL_CLICK_HALF_DEG,
    LU_PARCEL_LAYER,
    LU_PARCEL_PROVIDER_ID,
    LU_PARCEL_PROVIDER_LABEL,
    LU_PARCEL_WFS_BASE,
    LU_PARCEL_WGS84_URN,
    buildLuParcelClickUrl,
    extractLuOwsExceptionText,
    luOuterRing,
    luParcelWfsGetFeatures,
    luRingContains,
    luSectionFromZoning,
    parseLuParcelFeature,
    pickLuParcelFeature,
    pickedLuParcelOutcome,
    resolveLuParcelAtWgs84Point,
    type LuCadastralParcel,
    type LuParcelWfsDeps,
    type LuParcelWfsFeature,
} from './luParcelProvider.js';
