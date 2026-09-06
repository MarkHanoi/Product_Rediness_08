// L-613 — THE PARCEL-PROVIDER ROUTING REGISTRY (pure).
//
// WHAT IT REPLACES
// ----------------
// `apps/editor/src/ui/site/parcel/index.ts` hard-coded ONE provider:
//
//     export const defaultParcelProvider: ParcelProvider = catastroParcelProvider;
//
// So the map's "Select parcel" mode resolved a REAL parcel only in Spain (Catastro). A click
// in France / the Netherlands / Norway / anywhere else fell to the honest-but-empty "no parcel —
// draw" state. This registry inverts that exactly as `resolveZoneDisposition` inverted the zoning
// gate: the map asks *"which cadastre answers at this point?"* and gets a routing verdict, so
// adding a country is a DATA ADDITION here, not an edit to the L5 map UI.
//
// WHY THE VERDICT CARRIES `kind` AND NOT JUST A PROVIDER ID
// --------------------------------------------------------
// Three states must stay distinct, and a bare `providerId | null` collapses them:
//
//   • `cadastral`          — an OPEN, keyless national cadastre answers here (live-probed). Route
//                            to its same-origin proxy; on a miss fall to the footprint.
//   • `footprint-fallback` — a cadastre EXISTS for this country but is NOT reachable keylessly from
//                            our environment (token-gated / IP geo-fenced / per-region licensed).
//                            We deliberately DO NOT try it; we go straight to the OSM footprint and
//                            label it honestly. `note` records the exact blocker.
//   • the UNIVERSAL default — no country matched. Still a footprint verdict, so selection works
//                             EVERYWHERE (Spain-parity globally), never a dead click.
//
// This is the SAME honesty distinction the zoning registry draws between `refusal` and
// `unregistered`: "we can't reach the legal source" and "there is no source" are different claims,
// and a footprint presented as a cadastral parcel would be the C58 §1.4 false-provenance failure.
//
// ROUTING PREDICATES: the national analogue of the city predicates the ZONING dispatch routes on
// (`countryBbox.ts`). PURE — data + a lookup, no I/O. The fetch lives in the editor proxies.
//
// LIVE-PROBE EVIDENCE (2026-07-24) is in docs/04-reference/jurisdictions/PARCEL-SELECT-COVERAGE.md.

import { trace, SpanStatusCode } from '@opentelemetry/api';
import {
    isInSpain,
    isInFrance,
    isInNetherlands,
    isInNorway,
    isInNRW,
    isInGermany,
    isInSwitzerland,
    isInDenmark,
    isInSaudiArabia,
    isInDeLand,
    DE_LAND_BBOX,
    isInCzechia,
    isInIreland,
    isInAustria,
    SPAIN_BBOX,
    FRANCE_BBOX,
    NETHERLANDS_BBOX,
    NORWAY_BBOX,
    NRW_BBOX,
    GERMANY_BBOX,
    SWITZERLAND_BBOX,
    DENMARK_BBOX,
    SAUDI_ARABIA_BBOX,
    CZECHIA_BBOX,
    IRELAND_BBOX,
    AUSTRIA_BBOX,
} from './countryBbox.js';
// L-650 Phase-4 batch — the new cadastral predicates live in their own provider modules (each
// provider owns its bbox + WFS/CRS knowledge, so the predicate ships beside the parser it gates).
// Imported here for ROUTING (the predicate) AND for SPECIFICITY (the bbox → area, so the smallest
// enclosing box wins the per-point priority resolver below — no manual tie-break order).
import { isInItaly, ITALY_BBOX } from './agenziaEntrateParcelProvider.js';
import { isInFlanders, FLANDERS_BBOX } from './flandersGrbParcelProvider.js';
import { isInNYC, NYC_BBOX } from './nycPlutoParcelProvider.js';
import { isInFinland, FINLAND_BBOX } from './mmlParcelProvider.js';
import { isInEngland, ENGLAND_BBOX } from './gbOsInspireParcelProvider.js';
// L-651 Phase-5 batch — the SIX providers that were BUILT + UNIT-TESTED but never registered here,
// so nothing routed to them and every click in their territory silently fell to OSM. Wiring them is
// this file's whole job: a provider with no registry row is inert code, and its own unit tests can
// never notice (they call the provider directly and never exercise reachability). See the per-row
// `note` for each one's LIVE-PROBE verdict (2026-07-31) — three resolve real parcels, three do not.
import { isInPortugal, PORTUGAL_BBOX } from './dgtParcelProvider.js';
import { isInSF, SF_BBOX } from './sfParcelProvider.js';
import { isInChicago, CHICAGO_BBOX } from './chicagoParcelProvider.js';
import { isInBrussels, BRUSSELS_BBOX } from './brusselsParcelProvider.js';
import { isInWallonia, WALLONIA_BBOX } from './walloniaParcelProvider.js';
import { isInScotland, SCOTLAND_BBOX } from './scotlandRosParcelProvider.js';
// L-12871 + L-12887 WAVE (2026-09-02) — the NATIONAL DECIDER and the five national rows it
// unblocks (EE · LT · PL · LU · SE). The resolver decides on real boundary geometry with a
// MEASURED tolerance; the bboxes below stay what they always were, PRE-FILTERS. Only the BBOX
// constants are imported from the adapters — never their isIn* predicates — because a new
// national row must not match on a rectangle (that is the defect L-12871 names).
import { resolveNationalJurisdiction, type NationalJurisdictionVerdict } from '../jurisdiction/nationalJurisdictionResolver.js';
import { ESTONIA_BBOX } from '../countryAdapters/ee/eeJurisdiction.js';
import { CROATIA_BBOX } from '../countryAdapters/hr/hrJurisdiction.js';
import { LITHUANIA_BBOX } from '../countryAdapters/lt/ltJurisdiction.js';
import { POLAND_BBOX } from '../countryAdapters/pl/plJurisdiction.js';
import { LUXEMBOURG_BBOX } from '../countryAdapters/lu/luJurisdiction.js';
import { SWEDEN_BBOX } from '../countryAdapters/se/seJurisdiction.js';
// LANE SI (europe-adapters-2, 2026-09-03) — SLOVENIA_BBOX is imported for the SPECIFICITY metric
// ONLY (`REGION_BBOX['SI']`); the SI row routes on `claimsNation('SI')`, never this rectangle.
import { SLOVENIA_BBOX } from '../countryAdapters/si/siJurisdiction.js';
// LANE HU (europe-adapters-2, 2026-09-03) — the HUNGARY_BBOX is imported for the SPECIFICITY metric
// ONLY (`REGION_BBOX['HU']`); the HU row routes on `claimsNation('HU')`, never this rectangle.
import { HUNGARY_BBOX } from '../countryAdapters/hu/huJurisdiction.js';
// LANE US-EXPAND (2026-09-03) — four MORE US jurisdictions on the SF/Chicago/NYC shape (bbox predicate
// + same-origin proxy), served by ONE shared ArcGIS client parameterised by config. The US is absent
// from the national resolver by design (see nationalJurisdictionResolver.ts), so these route on their
// bbox predicate directly, exactly like isInSF — no claimsNation, no rival dispatch. Both the BBOX
// (for specificity) and the isIn* predicate (for `contains`) are imported, since a US row DOES match
// on its rectangle (there is no US national claim to gate it, and no US box overlaps any other row).
import {
    US_MA_BBOX,
    isInMassachusetts,
    US_FL_BBOX,
    isInFlorida,
    US_WA_KING_BBOX,
    isInKingCountyWa,
    US_TX_HARRIS_BBOX,
    isInHarrisCountyTx,
} from '../countryAdapters/us/usJurisdiction.js';
// LANE USA-PARCELS (2026-09-06) — NINE more US jurisdictions on the identical shape: SEVEN whole
// STATES (NC · NY · OH · WI · MT · UT · VA) and TWO large COUNTIES (LA County CA · Maricopa AZ). Same
// rules as the US-EXPAND block above — bbox predicate for `contains`, bbox for the specificity metric,
// no claimsNation (the US is absent from the national resolver by design).
// ⚠ UNLIKE US-EXPAND, TWO OF THESE BOXES DO OVERLAP OTHER US ROWS, and that is real geography, not an
// oversight — see the row comments at the registration site for both bands and why each self-corrects.
import {
    US_NC_BBOX,
    isInNorthCarolina,
    US_NY_BBOX,
    isInNewYorkState,
    US_OH_BBOX,
    isInOhio,
    US_WI_BBOX,
    isInWisconsin,
    US_MT_BBOX,
    isInMontana,
    US_UT_BBOX,
    isInUtah,
    US_VA_BBOX,
    isInVirginia,
    US_CA_LA_BBOX,
    isInLosAngelesCounty,
    US_AZ_MARICOPA_BBOX,
    isInMaricopaCountyAz,
} from '../countryAdapters/us/usStatewideParcels.js';
// LANE USA-PARCELS · WAVE 2 (2026-09-06) — five more whole STATES, each a bbox `contains` + bbox
// specificity metric, exactly as the wave-1 US rows above. NJ and MD OVERTURN a same-day refusal
// whose probe had named the wrong host; see usStatewideParcelsWave2.ts for the correction in full.
import {
    US_NJ_BBOX,
    isInNewJersey,
    US_VT_BBOX,
    isInVermont,
    US_CT_BBOX,
    isInConnecticut,
    US_IN_BBOX,
    isInIndiana,
    US_MD_BBOX,
    isInMaryland,
} from '../countryAdapters/us/usStatewideParcelsWave2.js';
// LANE RO (2026-09-03) — SPECIFICITY-ONLY box for the DORMANT Romania row (contains is
// claimsNation('RO'), never this rectangle; the resolver decides). Imported for REGION_BBOX only.
import { ROMANIA_BBOX } from '../countryAdapters/ro/roJurisdiction.js';
// LANE LV (2026-09-03; LIVE since the 2026-09-03 boundary wave) — SPECIFICITY-ONLY box for the Latvia row (contains is
// claimsNation('LV'), never this rectangle; the resolver decides). Imported for REGION_BBOX only.
import { LATVIA_BBOX } from '../countryAdapters/lv/lvJurisdiction.js';
import { GREECE_BBOX } from '../countryAdapters/gr/grJurisdiction.js';
// LANE BG (2026-09-03; LIVE since the 2026-09-03 boundary wave) — SPECIFICITY-ONLY box for the Bulgaria row (contains is
// claimsNation('BG'), never this rectangle; the resolver decides). Imported for REGION_BBOX only.
import { BULGARIA_BBOX } from '../countryAdapters/bg/bgJurisdiction.js';
// LANE SK (2026-09-03; LIVE since the 2026-09-03 boundary wave) — SPECIFICITY-ONLY box for the Slovakia row (contains is
// claimsNation('SK'), never this rectangle; the resolver decides). Imported for REGION_BBOX only.
import { SLOVAKIA_BBOX } from '../countryAdapters/sk/skJurisdiction.js';
// LANE AU-OPEN (2026-09-03) — AUSTRALIA's six open states + two declared deferrals. Sub-national
// rows in the PROVEN US-<STATE> idiom: bbox `contains` predicates (NOT `claimsNation` — Australia
// is not in the national boundary set and, sitting at lon 112.9–153.7°E, no existing prefilter/row
// can ever match an AU point, so `resolveNationalJurisdiction` returns `no-national-candidate` and
// the registry keeps the bbox-matched set; see countryAdapters/au/auJurisdiction.ts for the proof).
// ⛔ Australian SOUTH AUSTRALIA is `AU-SA`, never `SA` (= Saudi Arabia above).
import {
    isInNsw,
    isInVic,
    isInQld,
    isInSaAu,
    isInTas,
    isInAct,
    isInWa,
    isInNt,
    AU_NSW_BBOX,
    AU_VIC_BBOX,
    AU_QLD_BBOX,
    AU_SA_BBOX,
    AU_TAS_BBOX,
    AU_ACT_BBOX,
    AU_WA_BBOX,
    AU_NT_BBOX,
} from '../countryAdapters/au/auJurisdiction.js';
// LANE ME-OPEN (2026-09-03) — MIDDLE EAST open channels: TR · IL · QA, each a keyless national
// cadastre live-probed 2026-09-02. Sub-national-of-nobody rows in the PROVEN SA idiom: bbox
// `contains` predicates (NOT `claimsNation` — none of the three has a polygon in the national
// boundary set, so `resolveNationalJurisdiction` REFUSES every TR/IL/QA point and the registry keeps
// the bbox-matched set; see each countryAdapters/<cc>/<cc>Jurisdiction.ts for the measured audit).
// ⛔ QA/IL both sit (partly) inside SAUDI_ARABIA_BBOX; the national resolver's SA REFUSAL — not row
// order — keeps them safe, and specificity (their far smaller boxes) puts the cadastre ahead of the
// SA footprint. Both the predicate (for `contains`) and the bbox (for REGION_BBOX) are imported.
import { isInTurkey, TURKEY_BBOX } from '../countryAdapters/tr/trJurisdiction.js';
import { isInIsrael, ISRAEL_BBOX } from '../countryAdapters/il/ilJurisdiction.js';
import { isInQatar, QATAR_BBOX } from '../countryAdapters/qa/qaJurisdiction.js';
// LANE ME-GULF (2026-09-02) — AE/KW/BH/OM are footprint-fallback DEFERRALS routed by
// `claimsNation` (the four countries are in the national boundary set), so ONLY their SPECIFICITY
// bboxes are imported here — never their isIn* predicates (a national row must not match on a
// rectangle; that is the L-12871 defect). See countryAdapters/gulf/.
import { UAE_BBOX, KUWAIT_BBOX, BAHRAIN_BBOX, OMAN_BBOX } from '../countryAdapters/gulf/gulfJurisdiction.js';
// LANE NZ-EVERYWHERE (2026-09-05) — NEW ZEALAND, the TR/AU idiom: a bbox `contains` predicate (NZ
// has no polygon in the national boundary set, so `claimsNation('NZ')` would be dead code; the
// resolver REFUSES every NZ point and the bbox row survives). The cadastre is LINZ layer 50772 "NZ
// Primary Parcels" (CC BY 4.0), API-key gated → the key lives ONLY on the BFF (C57 §1.2), the
// browser hits the same-origin `/api/parcel/nz`. Both predicate and bbox are imported.
import { isInNewZealand, NEW_ZEALAND_BBOX } from '../countryAdapters/nz/nzJurisdiction.js';

const _tracer = trace.getTracer('pryzm.parcel');

// ═════════════════════════════════════════════════════════════════════════════════════════════
// THE NATIONAL DECIDER (L-12871). `resolveNationalJurisdiction` answers "which sovereign state
// claims this point" from boundary geometry + a measured tolerance, or refuses BY NAME. It is
// consulted in two places:
//   • each NEW national row's `contains` is `claimsNation(cc)` — the row matches only where the
//     resolver CLAIMS that country, never where a rectangle happens to cover the point;
//   • `resolveParcelCandidates` filters the whole candidate set by the national claim, so the
//     pre-existing bbox rows (NO/DK/FI/FR/DE/…) also stop crossing borders (Tallinn no longer
//     offers Kartverket, Flensburg no longer offers Matriklen).
// One-entry memo: one click asks once for the filter and once per claimsNation row; all of those
// are the SAME point, so the resolver runs once per click, not seven times.
// ═════════════════════════════════════════════════════════════════════════════════════════════
let _nationalMemo: { lat: number; lon: number; v: NationalJurisdictionVerdict } | null = null;

/** The national verdict at a point, memoised for exactly one point (never a stale carry-over). */
function nationalVerdictAt(lat: number, lon: number): NationalJurisdictionVerdict {
    if (_nationalMemo && _nationalMemo.lat === lat && _nationalMemo.lon === lon) {
        return _nationalMemo.v;
    }
    const v = resolveNationalJurisdiction(lat, lon);
    _nationalMemo = { lat, lon, v };
    return v;
}

/**
 * A `contains` predicate that is TRUE only where the national-jurisdiction resolver CLAIMS the
 * given country (either basis: polygon-containment, or the nearest-polygon coastal rescue — safe
 * since L-12887 added the un-modelled-neighbour refusal ring). On a refusal it is false for
 * EVERY country, so a border-band click falls through to the bbox rows and the per-cadastre-null
 * walk — a refusal means "do not ASSERT a nationality", not "no parcel here". Pure; never throws.
 */
function claimsNation(regionCode: string): (lat: number, lon: number) => boolean {
    return (lat: number, lon: number): boolean => {
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
        const v = nationalVerdictAt(lat, lon);
        return v.ok && v.regionCode === regionCode;
    };
}

/** `'DE-NW'` → `'DE'`, `'US-NY-NYC'` → `'US'`, `'SE'` → `'SE'` — the country a row belongs to. */
function countryOfRegionCode(regionCode: string): string {
    const dash = regionCode.indexOf('-');
    return dash === -1 ? regionCode : regionCode.slice(0, dash);
}

/** How a click resolves to parcel geometry. */
export type ParcelProviderKind = 'cadastral' | 'footprint-fallback';

/** One country's parcel-routing registration. */
export interface ParcelJurisdiction {
    /** ISO 3166-1 alpha-2 (or a Land suffix, e.g. `DE-NW`) of the covered area. */
    readonly regionCode: string;
    readonly countryName: string;
    /** Stable provider/provenance id (`catastro` · `ign-fr` · `pdok-nl` · `geonorge-no` · `alkis-nrw` · `footprint`). */
    readonly providerId: string;
    /** Human attribution for the parcel info card. */
    readonly label: string;
    /**
     * The same-origin proxy route the editor calls for this country's cadastre, or null for a
     * footprint-fallback jurisdiction (no keyless cadastre to proxy).
     */
    readonly proxyPath: string | null;
    readonly kind: ParcelProviderKind;
    /** The routing predicate — the national analogue of the zoning dispatch's city predicates. */
    readonly contains: (lat: number, lon: number) => boolean;
    /** One-line reachability verdict / blocker, verbatim from the live probe. */
    readonly note: string;
}

/**
 * ROW ORDER IS NO LONGER LOAD-BEARING (L-650 fix). The dispatch below (`resolveParcelCandidates` /
 * `resolveParcelWithFallback`) is a per-point PRIORITY-FALLBACK resolver, not first-match: it finds
 * EVERY jurisdiction whose `contains` is true, orders them by SPECIFICITY (smallest bbox area first
 * — `parcelJurisdictionSpecificity`, derived from the row's bbox, never a manual order), then tries
 * them in that order and falls THROUGH to the next candidate whenever a provider yields null / no
 * parcel / an unreachable proxy. The most-specific enclosing box therefore wins, and a proxy-pending
 * NEW provider transparently yields to the enclosing LIVE cadastre.
 *
 * This eliminates the coarse-bbox border regressions the Phase-4 batch (56d6970f) introduced — the
 * overlaps below are now RESOLVED, not merely tolerated:
 *   • NRW ⊂ NL ⊂ Germany: Düsseldorf's smallest box is NRW → ALKIS wins; a Twente miss falls
 *     through to NL, no wasted dead-end.
 *   • CH ⊂ Germany: Zürich's smallest box is CH → swisstopo AV wins.
 *   • FI ⊂ NO: Helsinki's smallest box is FI → MML wins; NE Finnmark (Kirkenes) sits in FI∩NO, and
 *     when the FI proxy returns null the resolver falls THROUGH to NO → the live Kartverket cadastre.
 *   • BE-Flanders ⊂ NL+FR: Antwerp/Ghent's smallest box is Flanders → GRB wins; the Dutch SE strip
 *     (Eindhoven/Maastricht) sits in BE∩NL, and when the (proxy-pending) BE provider yields null the
 *     resolver falls THROUGH to NL → the live PDOK cadastre.
 *   • GB-England ⊂ FR: London/Brighton's smallest box is England; Calais sits in GB∩FR, and when the
 *     (proxy-pending) GB provider yields null the resolver falls THROUGH to FR → the live IGN cadastre.
 *   • IT ⊂ (near CH/FR): Italy's interior is IT; a NW border point (Turin strip / Bern / Nice) whose
 *     smaller enclosing box is CH or FR is tried first and self-corrects on the containing cadastre.
 *   • US-NYC has NO overlap with any box (Western hemisphere).
 * A misroute to a neighbour's CADASTRAL proxy remains self-correcting (that proxy returns null for a
 * point outside its territory → fall through), and every unmatched point ends at the universal
 * footprint. Rows stay ADDITIVE — order is purely cosmetic now; specificity decides everything.
 *
 * ⚠ PARTLY SUPERSEDED 2026-09-02 (L-12871) — the paragraph above is kept as the record of the
 * L-650 design, but "specificity decides everything" is no longer true and several of its border
 * examples no longer occur: `resolveParcelCandidates` now consults the NATIONAL-JURISDICTION
 * resolver first, and on a national CLAIM only the claimed country's rows survive (so Kirkenes
 * offers NO alone rather than FI-then-NO, Eindhoven offers NL alone rather than BE-then-NL, and
 * Calais offers FR alone rather than GB-then-FR). The specificity sort still orders sub-national
 * rows within one country and the whole set on a national REFUSAL. See the doc block on
 * `resolveParcelCandidates`.
 */
const PARCEL_JURISDICTIONS: readonly ParcelJurisdiction[] = [
    {
        // PT BEFORE ES: PORTUGAL_BBOX (36.9–42.2°N, −9.6..−6.1°E) sits ENTIRELY INSIDE SPAIN_BBOX
        // (Catastro's box reaches −18.5°E for the Canaries), so Lisbon/Porto/Faro would first-match
        // Spain without this precedence. The specificity resolver reaches the same verdict on its own
        // (PT ≈ 18.6 deg² ≪ ES ≈ 378 deg²); the row order only keeps the LEGACY single-verdict
        // `resolveParcelJurisdiction` honest for coverage/inspection callers. The reverse casualty is
        // the Spanish strip west of −6.1°E (Badajoz), which self-corrects: the SNIC WFS returns no
        // feature outside Portugal → fall through to Catastro.
        regionCode: 'PT',
        countryName: 'Portugal (Continente)',
        providerId: 'dgt-cadastro-predial',
        label: 'Cadastro Predial (Portugal · DGT / SNIC)',
        proxyPath: '/api/parcel/pt',
        kind: 'cadastral',
        contains: isInPortugal,
        note: 'DGT SNIC INSPIRE WFS 2.0 snicws.dgterritorio.gov.pt/geoserver/inspire/ows, typeName inspire:cadastralparcel, native EPSG:3763 → srsName=EPSG:4326 honoured server-side. VERIFIED-LIVE 2026-07-31 by this wiring pass: HTTP 200 application/json, real WGS84 MultiPolygon (feature cadastralparcel.1108210701 @ −7.5566,39.6702), CC BY 4.0 declared on GetCapabilities. Survey-grade, so `high` confidence IS earned on a point-in-parcel fact — but national coverage is INCOMPLETE (mainland only; built out per-município), so an unmapped município returns an honest no-parcel-here → footprint, NEVER a fabricated ring. Geometry-only: no ownership, no FAR, no height.',
    },
    {
        regionCode: 'ES',
        countryName: 'Spain',
        providerId: 'catastro',
        label: 'Catastro (Spain)',
        proxyPath: '/api/catastro/parcel',
        kind: 'cadastral',
        contains: isInSpain,
        note: 'OVC reverse-geocode + INSPIRE WFS GetParcel — keyless, live (the original L-380 pilot).',
    },
    // ══════════════════════════════════════════════════════════════════════════════════════
    // L-12871 BATCH (2026-09-02) — EE · LT · PL · LU · SE, the five countries whose adapters
    // were committed and tested but ROUTED NOWHERE (grep countryAdapters → 0 hits here before
    // this block). Every `contains` below is `claimsNation(cc)`: the national resolver's
    // boundary-geometry claim, NEVER a rectangle — LITHUANIA_BBOX contains the Polish towns
    // Suwałki and Sejny, SWEDEN_BBOX contains København, LUXEMBOURG_BBOX sits entirely inside
    // FRANCE_BBOX, and a smallest-box tiebreak routes all of them wrongly. Where the resolver
    // REFUSES (the Oder band, Haparanda/Tornio), these rows simply do not match and the click
    // falls to the surviving bbox rows / the footprint — never a confident wrong cadastre.
    // Row placement (before BE/FR/FI/NO/DK) keeps the LEGACY first-match
    // `resolveParcelJurisdiction` honest for coverage callers, exactly like the PT-before-ES
    // precedent above; the real dispatch orders by specificity and filters by the claim.
    {
        regionCode: 'EE',
        countryName: 'Estonia',
        providerId: 'ee-maaamet-kataster',
        label: 'Katastriüksus (Estonia · Maa- ja Ruumiamet kataster)',
        proxyPath: '/api/parcel/ee',
        kind: 'cadastral',
        contains: claimsNation('EE'),
        note: 'Maa- ja Ruumiamet kataster WFS (gsavalik.envir.ee/geoserver, kataster:ky_kehtiv) — keyless, live-probed 2026-08-31 by the E1d lane (real katastriüksus with tunnus + WGS84 ring; countryAdapters/ee/eeParcelProvider.ts carries the parser + transcripts). Proxy /api/parcel/ee WIRED server-side 2026-09-02 (euCadastreProxy.js `ee` row, srsName=4326 → WGS84 ring; live leg probe: Tallinn → tunnus 78401:114:0086). Routing is claimsNation("EE"): boundary geometry, so Kuressaare routes here while Rīga (LVA, un-modelled) and Narva-river band points refuse nationally and fall through.',
    },
    {
        // LANE HR (2026-09-03). The Croatian cadastre IS live + keyless — countryAdapters/hr/
        // resolveHrParcelAtWgs84Point PROVED a real Zagreb parcel (k.č. 2379, k.o. CENTAR 335240)
        // through DGU/Uređena zemlja cp_wms:CP.CadastralParcel. Registered 2026-09-03 as a
        // footprint-fallback with BOTH downstream wirings declared-deferred; BOTH cleared the SAME
        // DAY — (a) lane PROXY-LEGS wired + live-proved /api/parcel/hr (srsName=EPSG:4326 output,
        // 161-vert WGS84 ring), (b) lane BOUNDARY-WAVE promoted HRV to a claimable country — so
        // the row is now `cadastral` with its proxy seat (barrel-additions-hr.txt step (vi)).
        // providerId is reserved by hrParcelProvider.ts so the row and the adapter cannot drift.
        regionCode: 'HR',
        countryName: 'Croatia',
        providerId: 'hr-dgu-dkp-cp',
        label: 'Katastarska čestica (Croatia · DGU / Uređena zemlja DKP)',
        proxyPath: '/api/parcel/hr',
        kind: 'cadastral',
        contains: claimsNation('HR'),
        note: 'Croatia IS served KEYLESSLY: DGU/Uređena zemlja INSPIRE GeoServer cp_wms:CP.CadastralParcel (api.uredjenazemlja.hr/services/inspire/cp_wms/wfs, WFS 2.0.0, EPSG:3765) — live-probed 2026-09-03 by lane HR (Zagreb → BROJ_CESTICE 2379 / MATICNI_BROJ_KO 335240 (k.o. CENTAR) / ID 21609461, real Polygon; countryAdapters/hr/hrParcelProvider.ts carries the parser + transcripts audit/europe-adapters-2/2026-09-02/hr-transcripts/). The standards INSPIRE cp:CadastralParcel complex WFS is ORA-01000-degraded (app-schema cursor saturation), so the simple cp_wms channel is used. BOTH declared-deferred wirings CLEARED 2026-09-03: (1) lane PROXY-LEGS wired /api/parcel/hr in euCadastreProxy.js and LIVE-PROVED it (Zagreb through the leg -> k.č. 2379, k.o. 335240, 161-vertex WGS84 ring; cp_wms honours srsName=EPSG:4326 for OUTPUT — measured, correcting the HR-lane native-3765-only belief — so no reprojection module exists anywhere); (2) lane BOUNDARY-WAVE: HRV entered nationalBoundaries.json as a claimable country (regionCode "HR", the SI lane\'s pipeline-validated ne_10m rings) with HUN/SRB/BIH/MNE refusal-only land neighbours + the ["HRV", isInCroatia] prefilter and red-pin border tests, so claimsNation("HR") now claims Croatian points (Zagreb/Split/Osijek/Dubrovnik proven) and a Zagreb click routes HERE — cadastral, through the live proxy leg (the step (vi) flip, done). reviewBy 2026-10-03 stands only for the rules leg (none served; documents-only).',
    },
    {
        regionCode: 'LT',
        countryName: 'Lithuania',
        providerId: 'lt-rc-ntr-parcels-featureserver',
        label: 'Žemės sklypas (Lithuania · Registrų centras NTR, via Statistics Lithuania)',
        proxyPath: '/api/parcel/lt',
        kind: 'cadastral',
        contains: claimsNation('LT'),
        note: 'Registrų centras NTR parcels ArcGIS FeatureServer (osp-sdg.stat.gov.lt, ntr_sklypai) — keyless, live-probed 2026-09-01 by the E6-LT lane (countryAdapters/lt/ltParcelProvider.ts). Proxy /api/parcel/lt WIRED server-side 2026-09-02 (euCadastreProxy.js `lt` row, GET + outSR=4326 → WGS84 ring, ha→m² transform mirrored; live leg probe: Žvėrynas → kadastroNr 0101/0039:1406). Routing is claimsNation("LT"): Marijampolė (inside POLAND_BBOX) routes here; Polish Suwałki/Sejny (inside LITHUANIA_BBOX, the L-12871 witnesses) do NOT.',
    },
    {
        regionCode: 'PL',
        countryName: 'Poland',
        providerId: 'pl-gugik-uldk',
        label: 'Działka ewidencyjna (Poland · GUGiK ULDK)',
        proxyPath: '/api/parcel/pl',
        kind: 'cadastral',
        contains: claimsNation('PL'),
        note: 'GUGiK ULDK point query (uldk.gugik.gov.pl, EPSG:2180 → WGS84) — keyless, live-probed 2026-09-01 by the E6-PL lane (countryAdapters/pl/plUldkClient.ts). Proxy /api/parcel/pl WIRED server-side 2026-09-02 (euCadastreProxy.js `pl` row, srid=4326 → WGS84 WKT ring; live leg probe: Suwałki → 206301_1.0005.11523/3). Routing is claimsNation("PL"): Suwałki/Sejny/Zgorzelec route here; the German bank of the Oder/Neisse (Frankfurt (Oder), Görlitz) does NOT — and Słubice (POLISH, 485 m from the ne_10m DE boundary at a measured 1500 m tolerance) REFUSES nationally and falls to the DE footprint row, a recorded DATA limit (upgrade path: official DEU+POL boundaries in jurisdiction/data/), not a routing bug.',
    },
    {
        // LANE LU-PARCEL (2026-09-03) — FLIPPED footprint → LIVE cadastral. The E7-LU "LU has no
        // parcel source" verdict was about the PAG-GPKG channel (NUM_CADAST is not a key); it was
        // never a survey of the ACT cadastre. The Administration du cadastre et de la topographie
        // (ACT) publishes the parcel keylessly on the INSPIRE GeoServer — a DIFFERENT source that
        // resolves the parcel UNDER a click by geometry, not by the ambiguous key. LU was already
        // promoted to a claimable country in the L-12871 batch, so unlike SI/LV/HR this goes LIVE
        // the moment the euCadastreProxy `lu` leg lands (queued in barrel-additions-lu-parcel.txt).
        regionCode: 'LU',
        countryName: 'Luxembourg',
        providerId: 'lu-act-inspire-cp',
        label: 'Parcelle cadastrale (Luxembourg · ACT — INSPIRE Cadastral Parcels)',
        proxyPath: '/api/parcel/lu',
        kind: 'cadastral',
        contains: claimsNation('LU'),
        note: 'Luxembourg IS served KEYLESSLY: the ACT / INSPIRE Cadastral-Parcels WFS 2.0 (https://wms.inspire.geoportail.lu/geoserver/wfs, layer cp:CP.CadastralParcel, WGS84 output via srsName=EPSG:4326, "CC0" on GetCapabilities) resolves the real parcel at a WGS84 click — LIVE-PROBED 2026-09-03 by lane LU-PARCEL: the founder\'s reported click 49.61195,6.12926 → national_cadastral_reference 075F00137000000 (label 137, 140.92 m²), Esch-sur-Alzette 49.496,5.981 → 039A00606016640 (label 606/16640, 199.54 m²); countryAdapters/lu/luParcelProvider.ts carries the parser + point-in-polygon pick, __tests__/fixtures/lu-luxcity|lu-esch the recorded-live bodies. ⛔ TWO measured LU-specific facts: (1) a CQL INTERSECTS returns 0 (the SRID-less literal is read in native EPSG:2169) — the click path is a WGS84 urn bbox; (2) LU parcels are DENSE, so features[0] is the WRONG (adjacent) parcel and a coarse bbox truncates the true container past `count` — the proxy uses a SMALL window (±~11 m, count 30) + point-in-polygon, never features[0]. This SUPERSEDES the E7-LU "no parcel source" note, which measured only the PAG-GPKG NUM_CADAST channel (not a key: "N/A" 4.9%, 15,110 duplicate groups) — a different source. Routing is claimsNation("LU") (LUXEMBOURG_BBOX sits inside FRANCE_BBOX); border-band towns (Dudelange/Rumelange ↔ FR, Echternach/Grevenmacher ↔ DE) refuse nationally at the 1500 m tolerance and keep FR/DE fallback. ⚠ Goes live once the euCadastreProxy `lu` leg is merged (barrel-additions-lu-parcel.txt); a full miss still falls to the OSM footprint, never a fabricated parcel.',
    },
    {
        regionCode: 'SE',
        countryName: 'Sweden',
        providerId: 'se-lantmateriet-fastighetsindelning',
        label: 'Building footprint (OSM)',
        proxyPath: null,
        kind: 'footprint-fallback',
        contains: claimsNation('SE'),
        note: 'Sweden: Lantmäteriet Fastighetsindelning Direkt is CREDENTIAL-GATED — probed 2026-09-01 by the E7-SE lane: HTTP 401 (APIM code 900902) to an unregistered client, bodies committed as fixtures — so there is nothing behind a proxy route yet and this registers as a footprint-fallback (providerId reserved by countryAdapters/se/seParcelProvider.ts so the row and the deferred adapter cannot drift apart). Routing is claimsNation("SE"): Stockholm/Kiruna/Malmö stop reading as Norwegian/Danish; København, Røros, Tornio, Klaipėda and Kuressaare — all inside SWEDEN_BBOX — are NOT matched.',
    },
    {
        // LANE SI (europe-adapters-2, 2026-09-03) — SLOVENIA, registered in FINAL form: the parcel
        // service is LIVE + KEYLESS and proven at the capital, so this is a `cadastral` row. The
        // resolver gate CLEARED 2026-09-03 (lane BOUNDARY-WAVE): SVN is claimable, this row ROUTES.
        regionCode: 'SI',
        countryName: 'Slovenia',
        providerId: 'si-gurs-kn-parcele',
        label: 'Parcela (Slovenia · GURS Kataster nepremičnin)',
        proxyPath: '/api/parcel/si',
        kind: 'cadastral',
        contains: claimsNation('SI'),
        note: 'Slovenia IS served KEYLESSLY: the GURS Kataster nepremičnin GeoServer WFS (https://ipi.eprostor.gov.si/wfs-si-gurs-kn/ows, layer SI.GURS.KN:PARCELE, native EPSG:3794 / CC-BY-4.0) resolves the real cadastral parcel at a WGS84 point with no credential — LIVE-PROBED 2026-09-03 by lane SI (capital click Ljubljana 46.0569,14.5058 → KO_ID 1725 "1725 AJDOVŠČINA" ST_PARCELE 2468/4, EID_PARCELA 100100001379837235, POVRSINA 1896 m²; a WGS84 lat,lon urn bbox is reprojected server-side and srsName=EPSG:4326 returns a WGS84 ring; countryAdapters/si/siParcelProvider.ts carries the parser, __tests__/fixtures/si-ljubljana/ the recorded body). GATE CLEARED 2026-09-03 (lane BOUNDARY-WAVE): SVN was PROMOTED from refusal-only neighbour to claimable country (regionCode "SI", rings verbatim) + ["SVN", isInSlovenia] entered the resolver prefilters, so claimsNation("SI") now claims Slovenian points and a Ljubljana click routes HERE exclusively. ⚠ NEIGHBOUR-INTEGRITY REQUIREMENT (MEASURED with the real resolver via injected deps, 2026-09-03): promoting SVN ALONE annexes 7/10 border-hugging Croatian/Hungarian points to SI (the L-12887 defect); the promotion must land TOGETHER with Croatia + Hungary as resolver members — which the concurrent HR + HU lanes are already promoting to CLAIMABLE COUNTRIES (so no HRV/HUN neighbours are needed once all three land together; a stop-gap HRV/HUN neighbour ring set is provided in case SI lands alone). With that, 25/26 witnesses are correct and the one residual (a sub-1500 m Kolpa-river point) is the documented ne_10m tolerance floor, same class as the DE/PL Oder band. Ready-to-apply resolver + boundaries + euCadastreProxy.js si-row additions are queued for the orchestrator in audit/europe-adapters-2/2026-09-02/barrel-additions-si.txt (reviewBy 2026-12-01). ⭐ Proxy /api/parcel/si WIRED server-side 2026-09-03 (lane PROXY-LEGS applied the queued B3 row verbatim; LIVE-PROVEN through the leg: Ljubljana → refcat 1725 3274/13). Registered in FINAL form so clearing the gate is a single-line flip and never a misroute today (a Slovenian click falls to the universal footprint exactly as before).',
    },
    {
        regionCode: 'HU',
        countryName: 'Hungary',
        providerId: 'hu-lechner-inspire-cp',
        label: 'Building footprint (OSM)',
        proxyPath: null,
        kind: 'footprint-fallback',
        contains: claimsNation('HU'),
        note: 'Hungary: DECLARED DEFERRAL for national parcels. The national cadastre (állami ingatlan-nyilvántartási alaptérkép) is delivered by Lechner Tudásközpont via TAKARNET / Geoshop — PAID (rest-of-europe sweep §HU; envelope-geometry census row 26 "OPAQUE"). The ONE keyless Cadastral-Parcels service — the INSPIRE CP WFS (inspire.lechnerkozpont.hu/geoserver/CP/ows, CP:CP.CadastralParcels, EPSG:23700, ows:Fees NONE) — is real but covers ONLY the Mesterszállás sample municipality (1774 parcels), so a Budapest capital click returns numberMatched=0 (PROBED LIVE 2026-09-03 by lane HU; fixtures + transcript in __tests__/fixtures/hu-lechner-inspire-cp-2026-09-03/ + audit/europe-adapters-2/2026-09-02/lane-hu-transcripts/). Registered as footprint-fallback so a Hungarian click is honestly labelled rather than attributed to a neighbour; providerId reserved by countryAdapters/hu/huParcelProvider.ts (row + deferred adapter cannot drift). ⚠ INERT-BUT-SAFE TODAY: claimsNation("HU") is false because HUN is not yet a modelled country in nationalBoundaries.json (measured 2026-09-03) — a Budapest click therefore falls to the universal footprint exactly as before, never a misroute. The ready-to-apply resolver + boundaries additions (HUN rings, the ["HUN", isInHungary] prefilter, AND the HRV/SRB/ROU neighbour-integrity requirement + the ROU-collision warning with the concurrent RO lane) are queued for the orchestrator in audit/europe-adapters-2/2026-09-02/barrel-additions-hu.txt.',
    },
    // LANE LV (2026-09-03) — LATVIA, registered in its FINAL form. UNLIKE the HU/RO/GR deferrals in
    // this wave, LATVIA'S PARCEL SERVICE IS LIVE + KEYLESS (proven at the capital): the geolatvija
    // VRAA GeoServer vraa:parcel layer resolves a real land-unit at a WGS84 point. The ONLY gate is
    // GATE 2 (JURISDICTION), which CLEARED 2026-09-03: lane BOUNDARY-WAVE promoted LVA from
    // refusal-only neighbour to claimable country (as queued in
    // audit/europe-adapters-2/2026-09-02/barrel-additions-lv.txt §3), so claimsNation('LV') now
    // claims Latvian points and this row ROUTES. providerId reserved by
    // countryAdapters/lv/lvParcelProvider.ts so the row and the live adapter cannot drift.
    {
        regionCode: 'LV',
        countryName: 'Latvia',
        providerId: 'lv-vzd-kadastrs-geolatvija',
        label: 'Kadastra zemes vienība (Latvia · VZD / geolatvija)',
        proxyPath: '/api/parcel/lv',
        kind: 'cadastral',
        contains: claimsNation('LV'),
        note: 'Latvia IS served KEYLESSLY: the geolatvija VRAA GeoServer vraa:parcel layer (https://geolatvija.lv/geoserver/vraa/wfs, workspace vraa, CC-BY-4.0 per data.gov.lv dataset kadastralie-zemes-gabali-inspire) resolves the real cadastral land-unit at a WGS84 point with no credential — LIVE-PROBED 2026-09-03 by lane LV (Rīga / Pils iela 23 → cadastral code 01000070006, area 1435 m², WGS84 MultiPolygon; countryAdapters/lv/lvParcelProvider.ts carries the parser, __tests__/fixtures/lv-riga-pilsiela/ the recorded body). GATE 2 CLEARED 2026-09-03 (lane BOUNDARY-WAVE): LVA was PROMOTED from refusal-only neighbour to claimable country (regionCode "LV", rings verbatim) + ["LVA", isInLatvia] entered the resolver prefilters, so claimsNation("LV") now claims Latvian points (Rīga/Daugavpils/Liepāja proven) and a Rīga click routes HERE exclusively (lvJurisdiction.ts LV_JURISDICTION_DEFERRAL, reviewBy 2026-12-01; ready-to-apply additions queued in audit/europe-adapters-2/2026-09-02/barrel-additions-lv.txt). ⭐ Proxy /api/parcel/lv WIRED server-side 2026-09-03 (lane PROXY-LEGS, euCadastreProxy.js lv row with the point-in-polygon pickCandidate — the same containment rule the adapter click path gained the same day). Registered in FINAL form (cadastral, since the service is live-proven) so clearing the gate is a single-line flip and never a misroute today (a Latvian click falls to the universal footprint exactly as before).',
    },
    // LANE RO (2026-09-03) — ROMANIA, a TWO-GATE DECLARED DEFERRAL, registered in its FINAL form so
    // clearing the gates is a single-line flip. GATE 1 (SERVICE): the ANCPI geoportal host is
    // NXDOMAIN (measured 2026-09-02 + 2026-09-03), so there is nothing to route to — footprint-fallback,
    // proxyPath null. GATE 2 (JURISDICTION): ROU is absent from the national boundary set, so
    // claimsNation('RO') is FALSE everywhere today and this row is DORMANT (it matches nothing until a
    // boundary wave adds ROU, exactly as EE/LT/PL/LU/SE were added). providerId reserved by
    // countryAdapters/ro/roParcelProvider.ts so the row and the deferred adapter cannot drift apart.
    {
        regionCode: 'RO',
        countryName: 'Romania',
        providerId: 'ancpi-eterra3',
        label: 'Building footprint (OSM)',
        proxyPath: null,
        kind: 'footprint-fallback',
        contains: claimsNation('RO'),
        note: 'Romania: ANCPI geoportal (INSPIRE Cadastral Parcel, eterra3_publish/MapServer/1, INSPIRE_ID-keyed GeoJSON over ArcGIS Server) is the national cadastre — DEFERRED on TWO gates (countryAdapters/ro/). GATE 1 SERVICE: geoportal.ancpi.ro is NXDOMAIN from Google + Cloudflare DoH and curl exit 6, measured 2026-09-02 AND 2026-09-03 (apex ancpi.ro resolves — zone live, geoportal subdomain absent); no served bytes, so no parser is shipped ([[fake-more-capable-than-real]]) and the two resolvers refuse with a self-announcing transient (roAncpiGate.ts RO_ANCPI_DEFERRAL, reviewBy 2026-12-01). GATE 2 JURISDICTION: ROU is not a CLAIMABLE country in jurisdiction/data/nationalBoundaries.json (since 2026-09-03 it is a refusal-only NEIGHBOUR — Romanian border-band points now refuse BY NAME instead of falling through silently — but a neighbour can never be claimed), so claimsNation("RO") is false everywhere and THIS ROW IS DORMANT until a boundary wave promotes ROU to .countries (roJurisdiction.ts RO_JURISDICTION_DEFERRAL). Either gate alone keeps it dormant; both are open. Systematic land registration is also incomplete nationally (queryable ≠ complete per AOI).',
    },
    // LANE GR (2026-09-03) — GREECE. Unlike RO above, the SERVICE gate is CLEARED: the Hellenic
    // Cadastre operating-cadastre parcels answer a KEYLESS ArcGIS Online FeatureServer and were
    // LIVE-PROVEN at Athens (KAEK 050095701001). So this registers `cadastral` (not footprint —
    // the source is reachable). The JURISDICTION gate CLEARED 2026-09-03 (lane BOUNDARY-WAVE):
    // GRC entered the boundary set as a claimable country with ALB/MKD/TUR refusal-only
    // neighbours, so claimsNation('GR') claims Greek points and THIS ROW ROUTES (grJurisdiction.ts
    // GREECE_ROUTING_DEFERRAL, boundary half retired).
    // proxyPath is RESERVED: `/api/parcel/gr` needs a `gr` row in server/jurisdiction/
    // euCadastreProxy.js (the PROXY-EE-LT-PL pattern for a new country); until then a match self-
    // corrects to the footprint on the proxy 404. providerId reserved by countryAdapters/gr/.
    {
        regionCode: 'GR',
        countryName: 'Greece',
        providerId: 'gr-ktimatologio-geotemaxia-leitourgoun',
        label: 'Γεωτεμάχιο (Greece · Ελληνικό Κτηματολόγιο, operating cadastre)',
        proxyPath: '/api/parcel/gr',
        kind: 'cadastral',
        contains: claimsNation('GR'),
        note: 'Greece: Hellenic Cadastre (Ελληνικό Κτηματολόγιο) OPERATING-cadastre parcels — a KEYLESS ArcGIS Online FeatureServer (services-eu1.arcgis.com/40tFGWzosjaLJpmn, GEOTEMAXIA_LEITOURGOUN_ON_gdb/FeatureServer/0), LIVE-PROBED 2026-09-03 by the GR lane (real γεωτεμάχιο with KAEK + WGS84 ring; countryAdapters/gr/ carries the parser + recorded-live fixtures). Channel discovered via the official viewer maps.ktimatologio.gr Experience Builder config; the OLD INSPIRE path gis.ktimanet.gr/inspire is now HTTP 404 (do not resurrect). LIVE CLICK PROOF: Athens/Syntagma (37.9755,23.7348) → KAEK 050095701001, AREA 10839.77 m². Wiring step (1) CLEARED 2026-09-03 (lane BOUNDARY-WAVE): GRC entered jurisdiction/data/nationalBoundaries.json as a claimable country (regionCode "GR") with ALB/MKD/TUR refusal-only land neighbours + BGR claimable, so claimsNation("GR") now claims Greek points (Athens/Thessaloniki/Crete/Rhodes proven; Kastellorizo is below the ne_10m island threshold and refuses honestly). Step (2) ALSO CLEARED 2026-09-03: lane PROXY-LEGS wired the euCadastreProxy.js `gr` row, so /api/parcel/gr serves production clicks. Rules are DOCUMENTS-ONLY (όροι δόμησης = FEK-decree PDFs; no machine-readable zoning register).',
    },
    // LANE BG (2026-09-03) — BULGARIA. Like GR above (and unlike RO/HU), the SERVICE gate is
    // CLEARED: the GCCA/AGKK INSPIRE Cadastral-Parcels service answers a KEYLESS ArcGIS REST query
    // and was LIVE-PROVEN at Sofia (nationalcadastralref 68134.100.5). So this registers `cadastral`
    // (not footprint — the source is reachable). The JURISDICTION gate CLEARED 2026-09-03 (lane
    // BOUNDARY-WAVE): BGR entered the boundary set as a claimable country WITH the demanded
    // SRB/ROU/MKD/TUR neighbour integrity, so claimsNation('BG') claims Bulgarian points and THIS
    // ROW ROUTES (bgJurisdiction.ts BG_ROUTING_DEFERRAL, boundary half retired). proxyPath is RESERVED: `/api/parcel/bg` needs a `bg` row in server/jurisdiction/
    // euCadastreProxy.js (the PROXY-EE-LT-PL pattern for a new country); until then a match self-
    // corrects to the footprint on the proxy 404. providerId reserved by countryAdapters/bg/.
    {
        regionCode: 'BG',
        countryName: 'Bulgaria',
        providerId: 'bg-gcca-inspire-cadastral-parcel',
        label: 'Поземлен имот (Bulgaria · ГКГК/АГКК INSPIRE Cadastral Parcels)',
        proxyPath: '/api/parcel/bg',
        kind: 'cadastral',
        contains: claimsNation('BG'),
        note: 'Bulgaria: GCCA/AGKK (Агенция по геодезия, картография и кадастър) INSPIRE Cadastral-Parcels — a KEYLESS ArcGIS REST service (inspire.cadastre.bg/arcgis/rest/services/Cadastral_Parcel/MapServer/0, capabilities Data,Map,Query; layer 0 CP.CadastralParcel; stored EPSG:4258, outSR=4326 → WGS84 ring), LIVE-PROBED 2026-09-03 by lane BG (real поземлен имот with nationalcadastralref + WGS84 ring; countryAdapters/bg/ carries the parser + recorded-live fixtures __tests__/fixtures/bg-sofia-2026-09-03/ + transcript audit/europe-adapters-2/2026-09-02/lane-bg-transcripts/). Channel discovered via the national INSPIRE geoportal inspire.egov.bg → GeoNetwork record "Cadastral parcels - GCCA"; the KAIS app backend arcgis.cadastre.bg is WAF-guarded (do not use), and the INSPIRE download WFS is disabled for parcels (WMS GetFeatureInfo + REST query are the keyless channels). LIVE CLICK PROOF: Sofia capital (42.6975,23.3223) → nationalcadastralref 68134.100.5 (68134 = EKATTE for Sofia), areavalue 3499 m², id_namespace BG.CP, 51-vertex WGS84 ring. Wiring step (1) CLEARED 2026-09-03 (lane BOUNDARY-WAVE): BGR entered jurisdiction/data/nationalBoundaries.json as a claimable country (regionCode "BG") WITH the demanded RS/RO/TR/MK neighbour integrity (SRB/ROU/TUR/MKD refusal-only; GRC claimable), so claimsNation("BG") now claims Bulgarian points (Sofia/Plovdiv/Varna/Ruse proven). STILL PENDING: (2) /api/parcel/bg needs a euCadastreProxy.js `bg` row (outSR=4326 → WGS84 ring, areavalue served) to serve production clicks. Rules are DOCUMENTS-ONLY (ОУП/ПУП under ЗУТ = PDF/DWG per municipality; Sofia has a city GIS island Sofiaplan; no national machine-readable zoning register). The official cadastral EXTRACT is a PAID KAIS service (parcel axis YELLOW: free view/query, paid extract).',
    },
    // LANE SK (2026-09-03) — SLOVAKIA. Like GR above (and unlike RO), the SERVICE gate is CLEARED:
    // the ÚGKK/GKÚ ESKN C-register parcels answer a KEYLESS ArcGIS MapServer and were LIVE-PROVEN at
    // Bratislava (register-C id 2090872505, parcel №15, k.ú. 2933, 832 m²). So this registers
    // `cadastral` (not footprint — the source is reachable). The ONE open gate is JURISDICTION, and
    // it CLEARED 2026-09-03 (lane BOUNDARY-WAVE): SVK was PROMOTED from refusal-only neighbour to
    // claimable country + HUN entered as a new refusal-only neighbour, so claimsNation('SK') now
    // claims Slovak points (Bratislava/Košice/Žilina proven) and THIS ROW ROUTES; Komárno/Štúrovo
    // refuse within-tolerance naming HUN — the L-12887 border integrity working as designed
    // (skJurisdiction.ts SK_ROUTING_DEFERRAL, retiredOn 2026-09-03). proxyPath is RESERVED: `/api/parcel/sk`
    // needs an `sk` row in server/jurisdiction/euCadastreProxy.js (the PROXY-EE-LT-PL pattern for a
    // new country); until then a match self-corrects to the footprint on the proxy 404. providerId
    // reserved by countryAdapters/sk/.
    {
        regionCode: 'SK',
        countryName: 'Slovakia',
        providerId: 'sk-ugkk-eskn-kn-parcela-c',
        label: 'Parcela registra C (Slovakia · ÚGKK / GKÚ ESKN kataster)',
        proxyPath: '/api/parcel/sk',
        kind: 'cadastral',
        contains: claimsNation('SK'),
        note: 'Slovakia: ÚGKK/GKÚ ESKN cadastre — C-register parcels on a KEYLESS ArcGIS MapServer (kataster.skgeodesy.sk/eskn/rest/services/VRM/kn/MapServer, layer 9 "Plocha parcely C"), LIVE-PROBED 2026-09-03 by the SK lane (real parcel with PARCEL_NUMBER + CADASTRAL_UNIT_ID + WGS84 ring; countryAdapters/sk/ carries the parser + recorded-live fixtures). LIVE CLICK PROOF: Bratislava Old Town (48.1436,17.1077) → register-C id 2090872505, parcel №15, k.ú. 2933, DESCRIPTIVE_AREA 832 m², FOLIO_ID (LV) 335384911, national cultural monument. ⛔ The ESKN WAF blocks attribute where= (HTTP 403); objectIds= is allowed, so the by-id lookup uses objectIds. Wiring step (1) CLEARED 2026-09-03 (lane BOUNDARY-WAVE): SVK was PROMOTED to countries (regionCode "SK", rings verbatim) + the ["SVK", isInSlovakia] prefilter + HUN as a new refusal-only neighbour, so claimsNation("SK") now claims Slovak points (Bratislava/Košice/Žilina proven; Komárno/Štúrovo refuse within-tolerance naming HUN — the border integrity working as designed). Step (2) ALSO CLEARED 2026-09-03: lane PROXY-LEGS wired the euCadastreProxy.js `sk` row, so /api/parcel/sk serves production clicks. Rules are DOCUMENTS-ONLY (územné plány = municipal PDFs; state planning IS due ~2028; no machine-readable zoning register).',
    },
    {
        // ══════════════════════════════════════════════════════════════════════════════════════
        // BELGIUM — THREE REGIONAL PREDICATES, NOT ONE `isInBelgium`. The argument (L-651).
        // ══════════════════════════════════════════════════════════════════════════════════════
        // The ROI tracker floated "Wallonia/Brussels next behind one `isInBelgium`". That shape is
        // WRONG here, and the live probe (2026-07-31) is what settles it:
        //
        //  1. ONE PREDICATE FORCES ONE ROW, AND A ROW CARRIES ONE VERDICT. A `ParcelJurisdiction`
        //     has exactly one `providerId`, one `proxyPath`, one `kind` and one `note`. The three
        //     Belgian regions do NOT share any of those: Flanders GRB is a live keyless WFS
        //     (`cadastral`), while Brussels and Wallonia are — as probed below — NOT reachable at
        //     all (`footprint-fallback`). Collapsing them would have to pick ONE verdict for all
        //     three, which necessarily lies about two of them. That is the C58 §1.4 false-provenance
        //     failure, and it is exactly the "failure and absence collapse into one value" bug
        //     (§CONTEXT-DATA-HONESTY, L-422/457/467/469) this registry exists to prevent.
        //  2. THE ENCLAVE IS ALREADY SOLVED, BY MEASUREMENT NOT BY ORDERING. Brussels-Capital is an
        //     enclave inside Flemish Brabant, so BRUSSELS_BBOX ⊂ FLANDERS_BBOX and a naïve router
        //     WOULD hand Brussels clicks to GRB. The L-650 specificity resolver already prevents it
        //     without any manual tie-break: BRUSSELS_BBOX ≈ 0.038 deg² vs FLANDERS_BBOX ≈ 2.87 deg²,
        //     a 75× ratio, so Brussels always ranks first for its own points. Proven by test
        //     ("Brussels-Capital is NOT claimed by Flanders"), which fails if this row is removed.
        //  3. THE THREE REGIONS ARE DIFFERENT LEGAL SYSTEMS ANYWAY (VCRO / CoBAT / CoDT) with
        //     different portals, licences and blockers. The per-region `note` is what makes the C63
        //     DATA-SOURCES axis scorable per region; one merged row would erase that granularity.
        //  4. IT IS NOT EVEN THE CHEAPER PATH. The "one Belgium" efficiency was premised on the
        //     FEDERAL CADMAP/CadGIS service serving all three regions at once. PROBED 2026-07-31 and
        //     it does NOT: eservices.minfin.fgov.be/geoservices/inspire/wfs answers HTTP 302 to
        //     idp.iamfas.belgium.be (the Belgian federal FAS/SAML identity provider) and
        //     ccff02.minfin.fgov.be answers 403. The federal cadastre is IDENTITY-BOOTSTRAP-GATED —
        //     the same access class as SE BankID / DK MitID — so there is no single endpoint to put
        //     behind a single predicate. When federal access is ever obtained it should be added as
        //     a FOURTH, coarse `isInBelgium` row owning `/api/parcel/be`; being the largest box it
        //     sorts LAST by specificity and becomes the natural cross-region fall-through UNDER the
        //     three regional rows. Additive, not a replacement — which is only possible because the
        //     regions were kept separate.
        //
        // BE-BRU FIRST (tightest enclave first), then BE-VLG, then BE-WAL.
        regionCode: 'BE-BRU',
        countryName: 'Belgium (Brussels-Capital Region)',
        providerId: 'brussels-cadastre',
        label: 'Building footprint (OSM)',
        proxyPath: null,
        kind: 'footprint-fallback',
        contains: isInBrussels,
        note: 'Brussels-Capital has NO reachable keyless parcel endpoint — PROBED 2026-07-31, four surfaces, all negative: (a) gis.urban.brussels/geoserver ADVERTISES layer GAPD:AGDP_CAPA (Title "Cadastral parcels", DefaultCRS urn:ogc:def:crs:EPSG::31370) in GetCapabilities but every GetFeature form — WFS 2.0 + 1.1.0, global + workspace-scoped endpoint, bare `EPSG:4326` + `urn:ogc:def:crs:EPSG::4326` + native 31370 bbox — returns ExceptionReport "Feature type GAPD:AGDP_CAPA unknown", i.e. catalogued-but-not-served; (b) data.mobility.brussels/geoserver is live with 273 layers but its bm_urbis:urbadm_* set is addresses/municipalities/streets only, NO parcel layer; (c) geoservices-urbis.irisnet.be/geoserver needs a workspace and UrbAdm/UrbisAdm 404; (d) the FEDERAL CADMAP fallback is identity-gated (see the Belgium block comment above). datastore.brussels IS reachable (HTTP 200) but publishes the UrbIS "Parcels and buildings" product as a DOWNLOADABLE GeoPackage, which cannot serve a per-click point query — wiring it needs a nightly GPKG→PostGIS sync job, i.e. INFRASTRUCTURE, not a proxy line. STATUS = to-build (sync-first), deliberately NOT a dead `cadastral` row: this registers as a footprint so the C63 DATA-SOURCES axis reads an honest "no source wired" instead of a false "measured".',
    },
    {
        // BE-Flanders BEFORE FR + NL: Flanders' core (Antwerp/Ghent/Brussels enclave) sits inside
        // both FRANCE_BBOX and NETHERLANDS_BBOX, so this must win first to route them to GRB. The
        // Dutch SE strip (Eindhoven/Maastricht) is the documented self-correcting casualty.
        regionCode: 'BE-VLG',
        countryName: 'Belgium (Flemish Region)',
        providerId: 'flanders-grb',
        label: 'GRB (Belgium · Flanders · Digitaal Vlaanderen)',
        proxyPath: '/api/parcel/be-vlg',
        kind: 'cadastral',
        contains: isInFlanders,
        note: 'GRB Adp (administratieve percelen) — CAPAKEY + NIScode + geometry, EPSG:31370 → WGS84, open data (no key). FLANDERS ONLY: Brussels (CoBAT/UrbIS) + Wallonia (CoDT/PICC) are different systems; a Brussels/Wallonia click returns no ADP feature → footprint. ⭐ WIRED server-side, and the "not yet wired" warning this replaces was STALE — it survived the commit that landed the leg. RE-PROVEN END TO END 2026-09-04 (lane PARCEL-REACH round 4) through https://pryzm.fly.dev/api/parcel/be-vlg: HTTP 200 with a real WGS84 ring (Antwerpen → 11803C2165/00M000).',
    },
    {
        // BE-WAL AFTER BE-VLG: the two boxes overlap in Walloon Brabant (50.67–50.85°N), where
        // Flanders' smaller box wins and self-corrects on a GRB miss. Wallonia does NOT enclose the
        // Brussels enclave (Brussels is enclaved in Flemish Brabant, north of the Walloon border),
        // so BE-BRU vs BE-WAL is a partial overlap only and Brussels still wins its own points.
        regionCode: 'BE-WAL',
        countryName: 'Belgium (Walloon Region)',
        providerId: 'wallonia-cadastre',
        label: 'Building footprint (OSM)',
        proxyPath: null,
        kind: 'footprint-fallback',
        contains: isInWallonia,
        note: "Wallonia's DOCUMENTED cadastral endpoint DOES NOT EXIST — PROBED 2026-07-31 and this is the finding, not a timeout: geoservices.wallonie.be/geoserver/wfs answers a valid HTTP 200 GetCapabilities (104 KB) that advertises exactly 18 layers, ALL of them in the `Orthos` workspace (orthophoto mosaics) — there is NO cadastral/parcel layer, so the provider's documented typeName `CP:CadastralParcel` cannot resolve and would have returned silently empty forever. Workspace sweep cp / inspire_cp / cadastre / CADMAP all 404 (inspire_lu exists but is land-USE, not parcels); the ArcGIS REST tree (geoservices.wallonie.be/arcgis/rest/services) lists 26 folders and neither DONNEES_BASE nor LIMITES carries a cadastral MapServer. The FEDERAL CADMAP fallback is identity-gated (see the Belgium block comment above). STATUS = access-deferred: the SPW cadastral redistribution is either not public or lives on a surface not yet identified; needs a sourcing pass against the Géoportail de Wallonie catalogue, not a code change. Registered as a footprint so a Walloon click is honestly labelled, never silently attributed to a cadastre that does not answer.",
    },
    // ⚠ PLACED HERE DELIBERATELY, AND THE POSITION IS LOAD-BEARING — read before moving.
    // `resolveParcelCandidates` is order-independent (it sorts by specificity, and CZ 17.9 deg2 /
    // IE 21.7 / AT 21.6 all beat DE 73.5 and GB-ENG 51.2 on their own points). But its sibling
    // `resolveParcelJurisdiction` — the one COVERAGE and LABELLING callers use — walks
    // PARCEL_JURISDICTIONS in REGISTRATION ORDER and returns the FIRST `contains` match, with no
    // specificity step at all. Registered after DE/GB-ENG (measured 2026-09-04) these three rows
    // sorted first in the candidate list yet STILL reported `Praha → DE` and `Dublin → GB-ENG`,
    // i.e. the click resolved correctly while the label kept naming the wrong sovereign register.
    // ⛔ The file header's "ROW ORDER IS NO LONGER LOAD-BEARING (L-650 fix)" is true of
    // `resolveParcelCandidates` ONLY. Do not generalise it to this array.
    // ── LANE PARCEL-REACH (2026-09-04) — CZ · IE · AT: three countries with NO ROW AT ALL ───────
    // MEASURED DEFECT these close (resolveParcelCandidates, real city points, 2026-09-04):
    //   Praha  → `DE:footprint-fallback` — a Czech click was LABELLED GERMANY and served an OSM
    //            building outline, because GERMANY_BBOX reaches 15.1°E and nothing more specific
    //            existed. Not a footprint honestly labelled: a footprint under a WRONG NATIONALITY.
    //   Brno, Ostrava, Wien → NO CANDIDATE AT ALL (the resolver returned an empty list).
    //   Dublin → `GB-ENG:cadastral` — an Irish click routed to HM LAND REGISTRY ENGLAND, whose leg
    //            correctly returns zero features in Ireland, so the user got a footprint under a
    //            "cadastral" verdict naming the wrong sovereign register.
    // All three are now live and were probed COLD end-to-end through the production resolver.
    {
        regionCode: 'CZ',
        countryName: 'Czechia',
        providerId: 'cz-cuzk-inspire-cp',
        label: 'Parcela katastru nemovitostí (Czechia · ČÚZK INSPIRE)',
        proxyPath: '/api/parcel/cz',
        kind: 'cadastral',
        contains: isInCzechia,
        note: 'Czechia: ČÚZK (Český úřad zeměměřický a katastrální) INSPIRE Cadastral Parcels — a KEYLESS WFS 2.0 (services.cuzk.cz/wfs/inspire-cp-wfs.asp, Marushka 4.2.22.8; GetCapabilities advertises cp:CadastralParcel + cp:CadastralBoundary + cp:CadastralZoning), LIVE-PROBED 2026-09-04 by lane PARCEL-REACH. LIVE CLICK PROOF (cold, through resolveEuParcelOutcome): Praha Staré Město (50.0875,14.4213) → nationalCadastralReference 727024-1090, official areaValue 15869 m², "Staré Město, Praha", 296-vertex WGS84 ring; Brno (49.1951,16.6068) → 610003-534, 255 m²; Ostrava (49.8355,18.2925) → 713520-3589/33, 8561 m². TECHNICAL: SRSNAME=urn:ogc:def:crs:EPSG::4326 IS honoured (response geometry carries srsName="urn:ogc:def:crs:EPSG::4326") and the posList is LAT-FIRST ("50.086623 14.420771"), so the proxy parses it with axis:"latlon" — the DE-NRW/IT idiom, no new parser. GML ONLY; no JSON output format is advertised. ⭐ The service SERVES AN OFFICIAL AREA (<cp:areaValue uom="m2">), preferred over the shoelace estimate with the uom ASSERTED not assumed. ⚠ The municipality and cadastral-district NAMES live in xlink:title ATTRIBUTES on self-closing <cp:administrativeUnit>/<cp:zoning> elements, where a text read returns null — the proxy uses gmlAttr for them. COVERAGE, stated by the service\'s own Abstract: parcels exist for the territory carrying a DIGITAL cadastral map, "to the 2026-08-31 it is 99.50% of the Czech territory, i.e. 78 475.62km2"; the residual is an honest empty → footprint. ⚠ ROUTING IS THE BBOX, NOT claimsNation: CZE is in nationalBoundaries.json as a REFUSAL-ONLY NEIGHBOUR, not a claimable country, so claimsNation("CZ") is false at every Czech point and a claimsNation row would never route. Overlap with DE/PL/SK is safe because those ARE claimable — resolveParcelCandidates filters the pool to the claimed country and drops this row before it is tried. Promoting CZE to claimable is a boundary-set change (BOUNDARY-WAVE), not a parcel change. Rules are DOCUMENTS-ONLY (územní plány = municipal PDFs; no national machine-readable zoning register).',
    },
    {
        regionCode: 'IE',
        countryName: 'Ireland',
        providerId: 'ie-tailte-eireann-freehold',
        label: 'Cadastral parcel (Ireland · Tailte Éireann, registered title)',
        proxyPath: '/api/parcel/ie',
        kind: 'cadastral',
        contains: isInIreland,
        note: 'Ireland: Tailte Éireann (the merged Ordnance Survey Ireland / Property Registration Authority / Valuation Office) Cadastral Parcels — a KEYLESS ArcGIS Online FeatureServer (services-eu1.arcgis.com/FH5XCsx8rYXqnjF5/.../Cadastral_Parcels_Freehold/FeatureServer/12, 3,086,691 features, maxRecordCount 2000), LIVE-PROBED 2026-09-04 by lane PARCEL-REACH. LIVE CLICK PROOF (cold, end-to-end): Dublin (53.3503,-6.2610) → SP_ID 2577972, COUNTY_NAM Dublin, 221 m², 11-vertex ring; Cork (51.8990,-8.4767) → SP_ID 2254707; Galway (53.2720,-9.0510) → SP_ID 4457889. ⚠ LAYER 12, NOT 0 — /FeatureServer/0/query answers {"error":{"code":400,…,"The requested layer (layerId: 0) was not found."}}; LEASEHOLD is a SEPARATE SERVICE at layer 13 and is NOT yet queried by this row (a leasehold-only parcel therefore reads empty → footprint; wiring the second service is the named next step). outSR=4326 → standard GeoJSON [lon,lat] at full precision (14 dp), so the existing parser applies unchanged. ⚠ COVERAGE IS TITLE-BASED, NOT AN EXHAUSTIVE TESSELLATION — unlike ES/CZ/AT, streets, commonage and unregistered land carry NO polygon, so features:[] on a road is the NORMAL and TRUE answer (measured: O\'Connell St and Cork city centre both return zero while parcels metres away are dense). That empty must stay an honest "no registered title here" → footprint, never an outage. ⚠ NORTHERN IRELAND falls inside IRELAND_BBOX and is NOT served — Land & Property Services NI is a separate, non-keyless register — so a Belfast click is an honest empty → footprint; no GB-NIR claim may be derived from this row. ⚠ The proxy cites SP_ID (the stable spatial-parcel id), NEVER OBJECTID: OBJECTID is the ArcGIS row id and citing it would attribute a surrogate key to the national registry. NO FOLIO NUMBER is exposed by the layer (fields are OBJECTID, SP_ID, COUNTY_NAM, Shape__Area, Shape__Length only), so the parcel card carries the county and no title reference. Shape__Area is NOT asserted to be m² in the layer metadata, so area is geometry-derived.',
    },
    {
        regionCode: 'AT',
        countryName: 'Austria',
        providerId: 'at-bev-inspire-cp',
        label: 'Grundstück (Austria · BEV INSPIRE Kataster)',
        proxyPath: '/api/parcel/at',
        kind: 'cadastral',
        contains: isInAustria,
        note: 'Austria: BEV (Bundesamt für Eich- und Vermessungswesen) INSPIRE Cadastral Parcels — reachable ONLY through the GeoServer WMS GetFeatureInfo with INFO_FORMAT=application/json (data.bev.gv.at/geoserver/INSdataCP/wms, layer CP_CadastralParcel), LIVE-PROBED 2026-09-04 by lane PARCEL-REACH. LIVE CLICK PROOF (cold, end-to-end, rings verified WGS84 AND containing the click): Wien Stephansplatz (48.2084,16.3731) → AT.0002.I.6.CP.01004817, ring lat[48.20809,48.20890] lon[16.37243,16.37391] containsClick=true; Salzburg (47.7982,13.0465) → AT.0002.I.6.CP.565373695, containsClick=true; Innsbruck (47.2654,11.3927) → AT.0002.I.6.CP.81113B492. ⛔ ALL THREE BEV WFS ROUTES ARE DEAD — recorded so nobody re-walks them (all measured 2026-09-04): (1) data.bev.gv.at/geoserver/BEVdataKAT/wfs answers ows:ExceptionReport "ServiceUnavailable: Service GeoServer Enterprise WFS is disabled" — WFS is switched off org-wide on that GeoServer; (2) apps.bev.gv.at/bev.webservice/inspire answers 200 but its OperationsMetadata advertises only GetCapabilities/GetWSDL/GetProducts — NO FeatureTypeList and NO GetFeature — it is an INSPIRE pre-defined-DATASET DOWNLOAD service (bulk) declaring AccessConstraints "restricted, copyright, licence"; (3) kataster.bev.gv.at/ortho/ows IS a real WFS 2.0 but its FeatureTypeList holds only elevation and historic-map types (inspireEL_ALS_DSM/DTM, urmappe:*) — no cadastral parcel type. kataster.bev.gv.at/api → 404, /tiles → 403, inspire.bev.gv.at → does not resolve. ⛔ THE REQUEST MUST BE EPSG:3857, NEVER 4326, and this is the single most important fact on this row: that GeoServer\'s numDecimals is 3, so a 4326 answer is rounded to THREE DECIMAL DEGREES (~110 m) and the ring degenerates into repeated identical points (measured at Stephansplatz: [16.373,48.208],[16.373,48.208],[16.373,48.208]…). In EPSG:3857 the same three decimals are MILLIMETRES, so the ring is exact and the proxy\'s webMercatorToWgs84 inverse is loss-free at BIM scale. A degenerate ring is the worst failure mode available here — it LOOKS like a parcel and is not one. The proxy therefore queries a ±50 m Web-Mercator box and the CENTRE PIXEL of a 101×101 image (a point-intersect in all but name) and reprojects BEFORE point-in-polygon. ⚠ inspireId is the ONLY attribute the layer exposes — no Katastralgemeinde number, no Grundstücksnummer, confirmed against INFO_FORMAT=text/html on the same layer — so the parcel card carries no address rather than an invented one. ⚠ ROUTING IS THE BBOX, NOT claimsNation: AUT is a REFUSAL-ONLY NEIGHBOUR in nationalBoundaries.json, so claimsNation("AT") is false at every Austrian point and such a row would never route.',
    },
    {
        // GB-England BEFORE FR: England's south coast (Brighton/Portsmouth/Plymouth) sits inside
        // FRANCE_BBOX, so this must win first. Calais (inside ENGLAND_BBOX) is the reverse casualty.
        // `kind:'cadastral'` is for ROUTING only — the ownership general-boundary honesty + MEDIUM
        // confidence cap live in the parcel resolver (generalBoundary:true), NEVER scored HIGH.
        regionCode: 'GB-ENG',
        countryName: 'United Kingdom (England)',
        providerId: 'gb-os-inspire',
        label: 'HM Land Registry INSPIRE (England · ownership, general boundaries)',
        proxyPath: '/api/parcel/gb',
        kind: 'cadastral',
        contains: isInEngland,
        note: 'HMLR INSPIRE Index Polygons (freehold ownership INDEX extents, OGL v3), EPSG:27700 → WGS84. ⚠ OWNERSHIP with GENERAL BOUNDARIES (s.60 LRA 2002) — NOT a survey cadastre; confidence capped MEDIUM (generalBoundary:true), NEVER survey-grade like FR/ES/DK/CH. Per-LPA ATOM/GML download — proxy must aggregate/serve a point query. CONVERGENT-SECONDARY: endpoint + OGL redistribution NOT live-probed. ⚠ Proxy /api/parcel/gb not yet wired → null → OSM footprint until then.',
    },
    {
        // GB-SCT AFTER GB-ENG. ⚠ SPECIFICITY NEAR-TIE, read before reordering: SCOTLAND_BBOX ≈ 50.4
        // deg² is FRACTIONALLY SMALLER than ENGLAND_BBOX ≈ 51.2 deg², so in the Anglo-Scottish border
        // band (54.6–55.9°N, where both boxes overlap) Scotland is ranked FIRST by area even though
        // this row sits second. That is HARMLESS here and only because this row is a
        // `footprint-fallback` with `proxyPath: null`: the priority resolver calls it, the editor's
        // fetchFor returns null immediately (there is no proxy to call), and it falls THROUGH to the
        // live HMLR England cadastre. Asserted by the "Newcastle still resolves England" test. If a
        // real Scottish proxy is ever wired this row becomes `cadastral` and that near-tie turns into
        // a REAL border regression — at which point the right fix is a kind-aware sort (a
        // footprint-fallback must never outrank a cadastral candidate), NOT a hand-tuned bbox.
        // Flagged to the orchestrator rather than changed here, because the sort is shared state.
        regionCode: 'GB-SCT',
        countryName: 'United Kingdom (Scotland)',
        providerId: 'gb-sct-ros',
        label: 'Building footprint (OSM)',
        proxyPath: null,
        kind: 'footprint-fallback',
        contains: isInScotland,
        note: 'Registers of Scotland Cadastral Map has NO reachable keyless endpoint — PROBED 2026-07-31: inspire.ros.gov.uk and cagemap.ros.gov.uk DO NOT RESOLVE (DNS failure, not a timeout), www.ros.gov.uk answers HTTP 403 (bot-blocked), api.ros.gov.uk 404, and the Scottish Government ArcGIS host maps.gov.scot serves only NRS / ScotGov / Testing / Utilities folders with no cadastral service. The RoS Cadastral Map is delivered through ScotLIS as a LICENSED/subscription product, so this is an access + licence gate, not an outage. STATUS = access-deferred; NEEDS A CREDENTIAL — a Registers of Scotland / ScotLIS data agreement plus (once granted) a ROS_SCOTLIS_API_KEY carried server-side by the proxy. ⚠ Even once wired it is OWNERSHIP with GENERAL BOUNDARIES (Land Registration etc. (Scotland) Act 2012) — confidence capped MEDIUM (generalBoundary:true), NEVER survey-grade like FR/ES/PT/DK/CH — and registered land ≠ the whole landscape (the Sasine→Land-Register migration is incomplete), so a Sasine-only click is an honest no-parcel, not a defect.',
    },
    {
        // FI BEFORE NO: FINLAND_BBOX sits ENTIRELY inside NORWAY_BBOX (Kartverket's box reaches
        // 31.3°E), so Helsinki/Tampere/Rovaniemi would misroute to Norway without this precedence.
        // NE Norwegian Finnmark (Kirkenes) inside FINLAND_BBOX is the self-correcting casualty.
        regionCode: 'FI',
        countryName: 'Finland',
        providerId: 'mml',
        label: 'Building footprint (OSM)',
        proxyPath: null,
        kind: 'footprint-fallback',
        contains: isInFinland,
        note: '⛔ DEMOTED cadastral → footprint-fallback 2026-09-04 (lane PARCEL-REACH round 4) BECAUSE THE ROW WAS FALSE, not merely stale. It advertised kind:"cadastral" + proxyPath:"/api/parcel/fi" and its note claimed the key was "carried server-side by the proxy as HTTP Basic". MEASURED: GET https://pryzm.fly.dev/api/parcel/fi?lon=24.9384&lat=60.1699 → HTTP 404 with body {"error":"Unknown cadastre fi."}. There is NO `fi` key in EU_CADASTRE_SOURCES, no fi proxy module, and no MML_API_KEY anywhere under server/ — the key-carrying proxy the note described was never built. A Helsinki click could only ever produce an OSM footprint while the UI named the Finnish land register: the C58 §1.4 credibility failure, which is why kind/proxyPath now state the truth. THE SOURCE IS REAL AND THE GATE IS CHEAP: MML kiinteisto-avoin OGC API Features (PalstanSijaintitiedot), EPSG:3067 → WGS84, re-probed 2026-09-04 → HTTP 401 · server=BigIP · WWW-Authenticate: Basic realm="API-key required to access". The key is FREE and self-service at omatili.maanmittauslaitos.fi; we do not hold one. To restore this row to cadastral: obtain the key, add an `fi` leg to EU_CADASTRE_SOURCES carrying it server-side, prove it live, THEN flip kind+proxyPath back — in that order. providerId stays "mml" so the row and mmlParcelProvider.ts cannot drift apart. Åland excluded. ⭐ ONE AUTHORITY (decided 2026-09-02): mmlParcelProvider.ts REMAINS the FI parcel authority — countryAdapters/fi/ SUPPLEMENTS it (Ryhti PLANS, not parcels) and its fiJurisdiction.ts re-exports THIS provider’s predicate rather than minting a rival.',
    },
    {
        // US-NYC — no overlap with any box (Western hemisphere); position is free. Ordered here
        // BEFORE any future coarser US/footprint entry, per the nycPlutoParcelProvider note.
        regionCode: 'US-NY-NYC',
        countryName: 'United States (New York City)',
        providerId: 'nyc-pluto',
        label: 'MapPLUTO (NYC · Dept. of Finance + City Planning)',
        proxyPath: '/api/parcel/us-nyc',
        kind: 'cadastral',
        contains: isInNYC,
        note: 'NYC DCP MapPLUTO lot FeatureServer (BBL) — tax-lot polygon + ZoneDist1 + ResidFAR/CommFAR/FacilFAR + LotArea, keyless. // PROBE: verify the ArcGIS FeatureServer path live before prod (Socrata 64uk-42ks probed 2026-07-24). ⚠ Proxy /api/parcel/us-nyc not yet wired → null → OSM footprint until then.',
    },
    {
        // US-SF — no overlap with any other registered box (Western hemisphere, and far from NYC).
        regionCode: 'US-CA-SF',
        countryName: 'United States (San Francisco)',
        providerId: 'sf-datasf',
        label: 'Assessor parcels (San Francisco · DataSF)',
        proxyPath: '/api/parcel/us-sf',
        kind: 'cadastral',
        contains: isInSF,
        note: "DataSF assessor parcels (Socrata resource acdm-wktn) — VERIFIED-LIVE 2026-07-31 by this wiring pass: a SoQL spatial point query returns the real lot under the click (blklot 3584032, 3976 19TH ST) with a WGS84 MultiPolygon. ⚠ PROVIDER-DOC CORRECTION FOUND BY THE PROBE: the geometry column is `shape`, NOT `the_geom` as sfParcelProvider.ts documents — a query against `the_geom` is rejected, so this would have been a silently-empty wire. The live rows ALSO carry zoning_code/zoning_district inline (e.g. RH-2), which the parser surfaces only as an optional DRAFT lead. SF governs by height-and-bulk district, NOT a citywide FAR (ADR-0270), so NO farRatio is ever emitted. Area is geometry-derived (the upstream area field has ambiguous units), which is a geometry fact, not a legal claim.",
    },
    {
        // US-CHI — no overlap with any other registered box.
        regionCode: 'US-IL-CHI',
        countryName: 'United States (Chicago / Cook County)',
        providerId: 'chicago-cook',
        label: 'Parcels (Chicago · Cook County Assessor)',
        proxyPath: '/api/parcel/us-chi',
        kind: 'cadastral',
        contains: isInChicago,
        note: "Cook County parcel fabric — VERIFIED-LIVE 2026-07-31 by this wiring pass, but ONLY AFTER ROUTING AROUND BOTH DOCUMENTED ENDPOINTS, which are dead: gis.cookcountyil.gov/traditional/.../MapServer/44/query does not respond at all (connection timeout, and the gis12 alternate too), and the Chicago zoning companion data.cityofchicago.org/resource/5s3e-9pji is HTTP 404 (retired resource id). The WORKING surfaces are datacatalog.cookcountyil.gov/resource/77tz-riq7 (Socrata; SoQL intersects(the_geom,…) returned real PIN 0101100119 with a WGS84 MultiPolygon) and, for zoning, data.cityofchicago.org/resource/dj47-wfun. Parcel identity is the 10-digit PIN; area is geometry-derived. Zoning is a DRAFT lead only — Chicago's FAR/height live in the Zoning Ordinance, never inferred here.",
    },
    // ══════════════════════════════════════════════════════════════════════════════════════
    // LANE US-EXPAND (2026-09-03) — FOUR MORE US jurisdictions beyond the three cities, same shape.
    // ══════════════════════════════════════════════════════════════════════════════════════
    // The US-<STATE>[-<COUNTY>] idiom extended, each a bbox `contains` predicate + a same-origin proxy,
    // all four served by ONE shared ArcGIS client (countryAdapters/us/usArcgisParcelClient.ts). No US
    // box overlaps any other registered row (Western hemisphere), and the US is absent from the
    // national resolver by design, so each routes on its own rectangle exactly like isInSF. Every row
    // is `cadastral` and VERIFIED-LIVE 2026-09-03 with a real parcel id (see each `note`); placement
    // is cosmetic (specificity + the national-refusal fall-through decide). MA/FL are STATEWIDE;
    // WA-KING/TX-HARRIS are one county each, bbox'd to the county so an out-of-county click falls to
    // the footprint rather than a mis-attributed cadastre.
    {
        // US-MA — MassGIS statewide L3, the strongest single open US parcel dataset probed this lane.
        regionCode: 'US-MA',
        countryName: 'United States (Massachusetts · statewide)',
        providerId: 'us-ma-massgis-l3',
        label: 'MassGIS L3 Standardized Parcels (Massachusetts · statewide)',
        proxyPath: '/api/parcel/us-ma',
        kind: 'cadastral',
        contains: isInMassachusetts,
        note: 'MassGIS statewide L3 parcels — VERIFIED-LIVE 2026-09-03: keyless ArcGIS FeatureServer (arcgisserver.digital.mass.gov/.../AGOL/L3_Parcels_FeatureService_4326/FeatureServer/1), layer already published EPSG:4326, an intersects point query returned the real parcel under the click (LOC_ID F_574532_2920828, MAP_PAR_ID 02-024-00001, 455 MAIN ST, WORCESTER, FY2026) with a WGS84 ring. Statewide, so every in-state click resolves. LOC_ID is the statewide-unique standardized parcel id; area is geometry-derived. Zoning/FAR are municipal (Ch. 40A), NEVER inferred here.',
    },
    {
        // US-FL — FDOR statewide cadastral (Dept. of Revenue / FGIO). Second statewide fabric.
        regionCode: 'US-FL',
        countryName: 'United States (Florida · statewide)',
        providerId: 'us-fl-fdor-cadastral',
        label: 'FDOR Statewide Cadastral (Florida · Dept. of Revenue / FGIO)',
        proxyPath: '/api/parcel/us-fl',
        kind: 'cadastral',
        contains: isInFlorida,
        note: 'FDOR statewide cadastral — VERIFIED-LIVE 2026-09-03: keyless ArcGIS Online FeatureServer (services9.arcgis.com/Gh9awoU677aKree0/.../Florida_Statewide_Cadastral/FeatureServer/0, layer "FDOR Cadastral 2025", native EPSG:3086), an intersects JSON-geometry point query with outSR=4326 returned the real parcel under the click (PARCEL_ID 1829244ZI000075000020A, 325 N FLORIDA AVE, TAMPA, CO_NO 39 Hillsborough, ASMNT_YR 2025) with a WGS84 ring. ⚠ The hosted service REQUIRES JSON point geometry (a bare x,y string 400s) — the proxy must emit JSON. Statewide. PARCEL_ID is the DOR parcel id; area is geometry-derived. FL bulk/height is municipal, NEVER inferred here.',
    },
    {
        // US-WA-KING — King County (Seattle metro). One county; bbox'd to the county.
        regionCode: 'US-WA-KING',
        countryName: 'United States (King County, WA · Seattle metro)',
        providerId: 'us-wa-king-parcels',
        label: 'King County Parcels (Washington · Seattle metro)',
        proxyPath: '/api/parcel/us-wa-king',
        kind: 'cadastral',
        contains: isInKingCountyWa,
        note: 'King County (WA) parcels — VERIFIED-LIVE 2026-09-03: keyless ArcGIS MapServer (gismaps.kingcounty.gov/.../Property/KingCo_Parcels/MapServer/0, native EPSG:3857), an intersects point query with outSR=4326 returned the real parcel under the click (PIN 9831200275, MAJOR 983120 MINOR 0275, Capitol Hill Seattle) with a WGS84 ring. ONE COUNTY (Seattle metro), not statewide — a Spokane click falls to the footprint. Layer carries geometry + PIN; assessor data is a separate KingCo_PropertyInfo layer. Area is geometry-derived. Zoning/FAR municipal, NEVER inferred here.',
    },
    {
        // US-TX-HARRIS — Harris County / HCAD (Houston metro). One county; bbox'd to the county.
        // TX has no usable statewide open parcel service and the Travis County host did not resolve
        // keylessly this lane — both recorded in the findings; TX is wired county-first, Harris first.
        regionCode: 'US-TX-HARRIS',
        countryName: 'United States (Harris County, TX · Houston metro)',
        providerId: 'us-tx-harris-hcad',
        label: 'HCAD Parcels (Texas · Harris County · Houston metro)',
        proxyPath: '/api/parcel/us-tx-harris',
        kind: 'cadastral',
        contains: isInHarrisCountyTx,
        note: 'Harris County / HCAD parcels — VERIFIED-LIVE 2026-09-03: keyless ArcGIS MapServer (www.gis.hctx.net/.../HCAD/Parcels/MapServer/0, native EPSG:2278), an intersects point query with outSR=4326 returned the real parcel under the click (HCAD_NUM 0261520000043, 3217 MONTROSE BLVD, HOUSTON, tax_year 2025) with a WGS84 ring. ONE COUNTY (Houston metro), not statewide — TX has no usable statewide open parcel service (StratMap statewide returned nothing at Austin/Dallas; City-of-Austin layer is city-OWNED only) and the Travis County host did not resolve keylessly. HCAD_NUM is the account id; area is geometry-derived. Houston has no zoning; bulk is deed/ordinance, NEVER inferred here.',
    },
    // ══════════════════════════════════════════════════════════════════════════════════════
    // LANE USA-PARCELS (2026-09-06) — HOW FAR A US PARCEL CLICK ACTUALLY REACHES: +7 STATES, +2 COUNTIES.
    // ══════════════════════════════════════════════════════════════════════════════════════
    // Nine more rows on the SAME shape as the US-EXPAND block above (bbox `contains` + a same-origin
    // proxy + the shared ArcGIS client). Every one was LIVE-PROBED 2026-09-06 with a REAL parcel id and
    // a WGS84 ring at TWO separate localities, and every "statewide" claim was checked against the
    // service's OWN county denominator with `returnDistinctValues` rather than taken from its title —
    // which is how the two rows that are NOT statewide (US-NY 38/62, US-VA 94/95 counties) were caught
    // and are named as such in `countryName`, `label` AND `note` rather than rounded up (C58 §1.4).
    // The states this lane reached and could NOT wire — Texas statewide, NJ, KY, TN, MD, OR — are
    // enumerated as DATA with their verbatim HTTP answers in `USA_PARCEL_REFUSALS`
    // (countryAdapters/us/usStatewideParcels.ts), not omitted.
    {
        // US-NC — NC OneMap, 100 of 100 counties (measured). Overlaps US-VA in the 36.54–36.59°N
        // border strip only; VA's box is fractionally smaller so it is tried first there and
        // answers `empty` for a Carolina point, which is the documented self-correction.
        regionCode: 'US-NC',
        countryName: 'United States (North Carolina · statewide)',
        providerId: 'us-nc-onemap-parcels',
        label: 'NC OneMap Parcels (North Carolina · statewide)',
        proxyPath: '/api/parcel/us-nc',
        kind: 'cadastral',
        contains: isInNorthCarolina,
        note: 'NC OneMap statewide parcels — VERIFIED-LIVE 2026-09-06: keyless ArcGIS MapServer (services.nconemap.gov/secure/rest/services/NC1Map_Parcels/MapServer, LAYER 1 "Parcels (polys)" — layer 0 is the parcel POINT layer, native EPSG:2264 NC State Plane feet, 5,938,900 features). Point-intersect @ Charlotte (35.226987,-80.844178) → HTTP 200, 2463 bytes, application/json;charset=UTF-8: parno 07301103A, ownname "FIRST-CITIZENS BANK & TR CO", siteadd "128 S TRYON ST CHARLOTTE NC", cntyname Mecklenburg, 7-vertex WGS84 ring. Second locality @ Asheville (35.596416,-82.550408) → parno 964940785500000, "10 SPRUCE ST", cntyname Buncombe. COVERAGE MEASURED, NOT ASSUMED: returnDistinctValues on `cntyname` = 100 DISTINCT COUNTIES — all 100 of North Carolina. ⚠ outFields must be EXACT: `city`, `county` and `sitezip` do NOT exist on this layer and a query naming them fails WHOLESALE with HTTP 200 + {"error":{"code":400,"message":"Failed to execute query."}}; the real names are `scity`, `cntyname`, `szip`. Zoning/FAR are municipal, NEVER inferred here.',
    },
    {
        // US-NY — ⚠ NOT statewide: the SERVICE'S OWN layer-0 footprint lists 38 of New York's 62
        // counties, and the note names them. Still `cadastral` (those 38 hold most of the
        // population, incl. all five NYC boroughs); the other 24 are an honest `empty` → footprint.
        // Encloses US-NY-NYC, which keeps the city on specificity — deliberate, MapPLUTO is richer.
        regionCode: 'US-NY',
        countryName: 'United States (New York State · 38 of 62 counties)',
        providerId: 'us-ny-nysgis-taxparcels',
        label: 'NYS Tax Parcels Public (New York State · 38 counties)',
        proxyPath: '/api/parcel/us-ny',
        kind: 'cadastral',
        contains: isInNewYorkState,
        note: 'NYS Tax Parcels Public — VERIFIED-LIVE 2026-09-06: keyless ArcGIS MapServer (gisservices.its.ny.gov/.../NYS_Tax_Parcels_Public/MapServer, LAYER 1 — layer 0 is the county coverage FOOTPRINT, native EPSG:3857, 3,827,530 parcels, service description "Publication Date: May 2026. Updated annually."). Point-intersect @ Albany (42.6523009,-73.7568442) → HTTP 200, 2383 bytes: PRINT_KEY 76.7-1-1, SBL 07600700010010000000, PARCEL_ADDR "Eagle St", COUNTY_NAME/MUNI_NAME Albany, PROP_CLASS 652, CALC_ACRES 10.17558228, ROLL_YR 2025, 29-vertex WGS84 ring. ⛔ COVERAGE IS 38 OF NEW YORK\'S 62 COUNTIES, MEASURED FROM THE SERVICE\'S OWN LAYER 0 FOOTPRINT (Albany, Bronx, Broome, Cayuga, Chautauqua, Cortland, Erie, Genesee, Greene, Hamilton, Kings, Lewis, Livingston, Montgomery, New York, Oneida, Onondaga, Ontario, Orange, Oswego, Otsego, Putnam, Queens, Rensselaer, Richmond, Rockland, Schuyler, St Lawrence, Steuben, Suffolk, Sullivan, Tioga, Tompkins, Ulster, Warren, Wayne, Westchester, Wyoming). A click in Monroe / Nassau / Dutchess / Saratoga / Schenectady / Niagara or any other of the 24 absent counties returns zero features — an honest `empty` → OSM footprint, NEVER a wrong parcel. NYC is inside this box but US-NY-NYC (MapPLUTO) has a far smaller box and outranks it by specificity, which is right: MapPLUTO carries ZoneDist1/ResidFAR that this layer does not. PRINT_KEY is the county tax-map key and is unique only WITHIN its SWIS district, so SBL rides as the secondary id. Zoning/FAR are municipal, NEVER inferred here.',
    },
    {
        // US-OH — 88 of 88 counties (measured). Overlaps US-VA over WEST VIRGINIA, where NEITHER
        // service has data: both answer `empty` and the click falls to the footprint, correctly.
        regionCode: 'US-OH',
        countryName: 'United States (Ohio · statewide)',
        providerId: 'us-oh-odnr-statewide-parcels',
        label: 'Ohio Statewide Parcels (ODNR / OGRIP · statewide)',
        proxyPath: '/api/parcel/us-oh',
        kind: 'cadastral',
        contains: isInOhio,
        note: 'Ohio statewide parcels — VERIFIED-LIVE 2026-09-06: keyless ArcGIS MapServer (gis.ohiodnr.gov/.../OIT_Services/odnr_landbase/MapServer, LAYER 4 "Statewide Parcels", native EPSG:3857). Point-intersect @ Columbus (39.960019,-82.999580) → HTTP 200, 2133 bytes: PIN 010-000602, STATEWIDE_PIN 39049-010-000602, COUNTY Franklin, OWNER1 "VS STATE STREET LLC", ASSR_ACRES 0.19227437, 16-vertex WGS84 ring. Second locality @ Cleveland (41.500372,-81.695567) → PIN 10107004, STATEWIDE_PIN 39035-10107004, COUNTY Cuyahoga. COVERAGE MEASURED: returnDistinctValues on `COUNTY` = 88 DISTINCT COUNTIES — all 88 of Ohio. ⚠ FRESHNESS IS PER-COUNTY AND MUST NOT BE STATED AS ONE DATE: the layer serves its own `CurrentTo` export date per row and it read 1709269200000 (2024-03-01) for Franklin but 1686628800000 (2023-06-13) for Cuyahoga in the same session. STATEWIDE_PIN (county FIPS + auditor PIN) is the statewide-unique key; the bare PIN is unique only within its county, hence the ordering. The layer carries NO site address (`AUD_LINK` is a per-county auditor deep link). Zoning/FAR are municipal, NEVER inferred here.',
    },
    {
        // US-WI — 72 of 72 counties (measured). No overlap with any other registered box.
        regionCode: 'US-WI',
        countryName: 'United States (Wisconsin · statewide)',
        providerId: 'us-wi-doa-statewide-parcels',
        label: 'Wisconsin Statewide Parcels V12 (DOA / WLIP · statewide)',
        proxyPath: '/api/parcel/us-wi',
        kind: 'cadastral',
        contains: isInWisconsin,
        note: 'Wisconsin Statewide Parcels V12 — VERIFIED-LIVE 2026-09-06: keyless ArcGIS Online FeatureServer (services3.arcgis.com/n6uYoouQZW75n5WI/.../Wisconsin_Statewide_Parcels_DB/FeatureServer/0, layer "V1200_WisconsinParcels_2026", native EPSG:3857). Point-intersect @ Madison (43.072297,-89.400247) → HTTP 200, 9091 bytes: STATEID 025070923208015, PARCELID 070923208015, SITEADRESS "821 UNIVERSITY AVE", PLACENAME "CITY OF MADISON", TAXROLLYEAR 2025, 25-vertex WGS84 ring. Second locality @ Green Bay (44.512734,-88.012291) → STATEID 00911-259, "434 E WALNUT ST", CONAME BROWN, LOADDATE "2/05/2026". COVERAGE MEASURED: returnDistinctValues on `CONAME` = 73 values covering all 72 Wisconsin counties (the 73rd, "MENOMONIE", is an upstream spelling artefact of Menominee/the City of Menomonie, not a 73rd county). ⚠ THE SERVICE NAME CARRIES A `_DB` SUFFIX: `…/Wisconsin_Statewide_Parcels/FeatureServer` answers HTTP 200 with {"error":{"code":400,"message":"Invalid URL"}} — the live one is `Wisconsin_Statewide_Parcels_DB`. ⚠ `CNTY_NAME` does not exist (the county field is `CONAME`) and naming it fails the whole query with "\'outFields\' parameter is invalid". STATEID is the statewide-unique (county-FIPS-prefixed) parcel id; PARCELID is unique only within its county. Zoning/FAR are municipal, NEVER inferred here.',
    },
    {
        // US-MT — 56 of 56 counties (measured). No overlap with any other registered box.
        regionCode: 'US-MT',
        countryName: 'United States (Montana · statewide)',
        providerId: 'us-mt-msl-cadastral',
        label: 'Montana Cadastral Framework (MSL / Dept. of Revenue · statewide)',
        proxyPath: '/api/parcel/us-mt',
        kind: 'cadastral',
        contains: isInMontana,
        note: 'Montana Cadastral Framework — VERIFIED-LIVE 2026-09-06: keyless ArcGIS MapServer (gisservice.mt.gov/.../msdi_cadastral_map_v1/MapServer, LAYER 1 "Montana Parcels", copyrightText "Montana State Library, Department of Revenue", native EPSG:6514 MT State Plane metres). Point-intersect @ Helena (46.589655,-112.038221) → HTTP 200, 6755 bytes: PARCELID 05188830321090000, CountyName "Lewis and Clark", AddressLine1 "330 N LAST CHANCE GULCH", CityStateZip "HELENA, MT 59601", TaxYear 2026, PropType "Improved Property", LegalDescriptionShort "HELENA TOWNSITE 1869, S30, T10 N, R03 W, BLOCK 411, Lot 4, PT 4,5", 10-vertex WGS84 ring. Second locality @ Billings (45.782413,-108.499330) → PARCELID 03092703134050000, CountyName Yellowstone, "2408 MINNESOTA AVE". COVERAGE MEASURED: returnDistinctValues on `CountyName` = 56 DISTINCT COUNTIES — all 56 of Montana. ⛔ THE HOST MOVED AND THE OLD ONE STILL ANSWERS: gisservicemt.gov/arcgis/rest/services now returns HTTP 200 with 4387 bytes of text/html (a portal page, not the REST catalogue) — a probe that only checked the status code would have read that as healthy. The live REST host is gisservice.mt.gov. Note the source\'s own scope caveat, "taxable and tax-exempt parcels for MOST of Montana" — tribal trust land in particular is not a DOR-assessed parcel, so an on-reservation click can be a truthful `empty` → footprint. Zoning is municipal/county, NEVER inferred here.',
    },
    {
        // US-UT — 29 of 29 counties (measured). No overlap with any other registered box.
        regionCode: 'US-UT',
        countryName: 'United States (Utah · statewide)',
        providerId: 'us-ut-ugrc-parcels',
        label: 'Utah Statewide Parcels (UGRC · statewide)',
        proxyPath: '/api/parcel/us-ut',
        kind: 'cadastral',
        contains: isInUtah,
        note: 'Utah Statewide Parcels — VERIFIED-LIVE 2026-09-06: keyless ArcGIS Online FeatureServer (services1.arcgis.com/99lidPhWCzftIe9K/.../UtahStatewideParcels/FeatureServer/0, layer "StateWideParcels", native EPSG:3857, 1,596,196 parcels). Point-intersect @ Salt Lake City (40.761939,-111.891571) → HTTP 200, 2973 bytes: PARCEL_ID 15014300180000, PARCEL_ADD "18 W MARKET ST", PARCEL_CITY "Salt Lake City", County SaltLake, OWN_TYPE Private, ParcelsCur 1786492800000 (2026-08-11), 5-vertex WGS84 ring. Second locality @ Cedar City (37.678167,-113.062919) → PARCEL_ID B-0717-0002-0718, "95 W HARDING AVE", County Iron. COVERAGE MEASURED: returnDistinctValues on `County` = 29 DISTINCT COUNTIES — all 29 of Utah. ⚠ PARCEL_ID FORMAT IS PER-COUNTY, NOT STATEWIDE-NORMALISED (Salt Lake serves a 14-digit number, Iron serves "B-0717-0002-0718"), so it keys the parcel but must never be parsed as a uniform schema; `County` disambiguates. The layer serves its own `ParcelsCur` currency epoch per row, which is the honest freshness field. Zoning/FAR are municipal, NEVER inferred here.',
    },
    {
        // US-VA — 94 of 95 counties (Rappahannock absent, measured) + all 38 independent cities.
        // Overlaps US-NC (border strip) and US-OH (over West Virginia); see REGION_BBOX above.
        regionCode: 'US-VA',
        countryName: 'United States (Virginia · 94 counties + 38 cities)',
        providerId: 'us-va-vgin-parcels',
        label: 'Virginia Parcels (VGIN · 94 counties + 38 cities)',
        proxyPath: '/api/parcel/us-va',
        kind: 'cadastral',
        contains: isInVirginia,
        note: 'VGIN Virginia Parcels — VERIFIED-LIVE 2026-09-06: keyless ArcGIS MapServer (vginmaps.vdem.virginia.gov/.../VA_Base_Layers/VA_Parcels/MapServer/0, copyrightText "Virginia Geographic Information Network (VGIN)", native EPSG:3857). Point-intersect @ Richmond (37.538326,-77.431270) → HTTP 200, 3970 bytes: VGIN_QPID 5176000025467, PARCELID 517466, LOCALITY "Richmond City", FIPS 51760, LASTUPDATE 1775433600000 (2026-04-06), 64-vertex WGS84 ring. Second locality @ Pittsylvania County (36.654887,-79.391766) → VGIN_QPID 5114300000997, PARCELID 2329-19-0015, LASTUPDATE 1778112000000 (2026-05-07). ⛔ COVERAGE IS 94 OF VIRGINIA\'S 95 COUNTIES — MEASURED, NOT ROUNDED UP: returnDistinctValues on `LOCALITY` = 136 values = 94 counties + all 38 independent cities + 4 town rows (Bedford, Colonial Beach, Culpeper, Farmville); RAPPAHANNOCK COUNTY IS ABSENT, so a Washington-VA click is an honest `empty` → OSM footprint. ⚠ VGIN_QPID arrives as a JSON FLOAT (5176000025467.0) and is stringified, not parsed as a schema; PARCELID is the local jurisdiction\'s own id and is unique only within its LOCALITY. The source\'s own description states the boundaries are "for cartographic use and spatial analysis only, and not for use as legal descriptions or property surveys" and are NOT edge-matched across municipal boundaries — so this is an assessment fabric, never a survey. Zoning/FAR are municipal, NEVER inferred here.',
    },
    {
        // US-CA-LA — ONE COUNTY (the largest in the US by population). California has no open
        // statewide parcel service, so CA is wired county-first. Far south of US-CA-SF; no overlap.
        regionCode: 'US-CA-LA',
        countryName: 'United States (Los Angeles County, CA)',
        providerId: 'us-ca-la-county-parcels',
        label: 'LA County Assessor Parcels (California · Los Angeles County)',
        proxyPath: '/api/parcel/us-ca-la',
        kind: 'cadastral',
        contains: isInLosAngelesCounty,
        note: 'LA County Assessor parcels — VERIFIED-LIVE 2026-09-06: keyless ArcGIS MapServer (public.gis.lacounty.gov/public/rest/services/LACounty_Cache/LACounty_Parcel/MapServer/0, copyrightText "Los Angeles County Office of the Assessor", native EPSG:3857). Point-intersect @ downtown LA (34.054737,-118.241866) → HTTP 200, 2630 bytes: AIN 5161005902, APN 5161-005-902, SitusAddress "312 N SPRING ST", SitusCity "LOS ANGELES CA", SitusZIP 90012-4701, UseType Government, 32-vertex WGS84 ring. ⚠ THE FOLDER MATTERS: public.gis.lacounty.gov/public/rest/services/LACounty_Dynamic/Parcel/MapServer answers HTTP 200 with {"error":{"code":404,"message":"Service LACounty_Dynamic/Parcel/MapServer not found "}} — the live layer is in the LACounty_Cache folder, not LACounty_Dynamic. ONE COUNTY, not statewide: the bbox is the county (plus Catalina and San Clemente Island), and an Orange-County / Ventura / San Bernardino click inside the rectangle returns zero features — a truthful `empty` → footprint, never a mis-attributed parcel. AIN is the 10-digit Assessor Identification Number (the routing key); APN is the same value dash-formatted. California has NO open statewide parcel service, which is why CA is wired county-first. LA\'s zoning is City/County ordinance and is NEVER inferred here.',
    },
    {
        // US-AZ-MARICOPA — ONE COUNTY (Phoenix metro). Arizona's State Land Department publishes
        // TRUST land, not private lots, so AZ is wired county-first. No overlap with US-UT.
        regionCode: 'US-AZ-MARICOPA',
        countryName: 'United States (Maricopa County, AZ · Phoenix metro)',
        providerId: 'us-az-maricopa-parcels',
        label: 'Maricopa County Assessor Parcels (Arizona · Phoenix metro)',
        proxyPath: '/api/parcel/us-az-maricopa',
        kind: 'cadastral',
        contains: isInMaricopaCountyAz,
        note: 'Maricopa County (AZ) Assessor parcels — VERIFIED-LIVE 2026-09-06: keyless ArcGIS MapServer (gis.mcassessor.maricopa.gov/arcgis/rest/services/Parcels/MapServer/0, copyrightText "Maricopa County Assessor\'s Office", serviceDescription "Dynamic parcel boundaries", native EPSG:3857). Point-intersect @ Phoenix (33.449177,-112.074098) → HTTP 200, 1372 bytes: APN 11221001, APN_DASH 112-21-001, PHYSICAL_ADDRESS "50 N CENTRAL AVE   PHOENIX  85004", PHYSICAL_CITY PHOENIX, OWNER_NAME "PHOENIX CITY OF (LEASED OUT)", 7-vertex WGS84 ring. ONE COUNTY (Phoenix metro), not statewide — Arizona has no open statewide parcel service (the State Land Department publishes TRUST land, not private lots), so AZ is wired county-first and a Tucson / Flagstaff click falls to the OSM footprint rather than a mis-attributed cadastre. APN is the 8-digit book-map-item id; APN_DASH is the same value formatted. Zoning is municipal ordinance, NEVER inferred here.',
    },
    // ══════════════════════════════════════════════════════════════════════════════════════
    // LANE USA-PARCELS · WAVE 2 (2026-09-06) — FIVE MORE WHOLE STATES: NJ · VT · CT · IN · MD.
    // ══════════════════════════════════════════════════════════════════════════════════════
    // Same shape as the two US blocks above (bbox `contains` + same-origin proxy + the shared ArcGIS
    // client). Every row was LIVE-PROBED 2026-09-06 with a real parcel id and a WGS84 ring, and every
    // "statewide" claim was counted against the layer's OWN county/town field with
    // `returnDistinctValues` rather than read off its title — the method that caught US-NY (38/62)
    // and US-VA (94/95) in wave 1. ⭐ ALL FIVE MEASURED CLEAN: NJ 21/21 counties · VT 256 towns ·
    // CT 169/169 towns · IN 92/92 counties · MD 24/24 jurisdictions. Nothing had to be rounded down.
    //
    // ⛔ NJ AND MD OVERTURN A REFUSAL WRITTEN THE SAME DAY, both for the same reason — the earlier
    // probe named the WRONG HOST and recorded its 404/503 as the STATE's answer. The superseded rows
    // are kept in `USA_PARCEL_REFUSALS` with the correction attached, because the HTTP answers were
    // true and only the conclusion was wrong.
    //
    // OVERLAPS, all resolved by specificity (smallest bbox first) + the honest `empty` fall-through:
    //   • US-NJ (≈4.4 deg²), US-VT (≈4.6 deg²) and US-CT (≈2.2 deg²) all sit inside US-NY (≈36 deg²)
    //     and are far smaller, so each is tried FIRST on its own soil — correct, since the NYS layer
    //     carries no NJ/VT/CT parcels and would answer `empty` there anyway.
    //   • US-CT (≈2.2 deg²) vs US-MA (≈6.5 deg²): MA's rectangle overhangs Connecticut, CT is
    //     smaller and wins inside CT; a southern-MA click tries CT first, gets an honest `empty`,
    //     and falls through to MassGIS.
    //   • US-MD (≈8.3 deg²) vs US-VA (≈25 deg²) across the Potomac — MD is smaller and wins in MD.
    //   • US-IN (≈13.3 deg²) vs US-OH (≈17.0 deg²) share a 0.05° strip on the state line; IN is
    //     smaller and is tried first there, and answers `empty` for an Ohio point.
    {
        // US-NJ — NJGIN/NJOGIS statewide composite, 21 of 21 counties (measured).
        regionCode: 'US-NJ',
        countryName: 'United States (New Jersey · statewide)',
        providerId: 'us-nj-njgin-modiv-composite',
        label: 'NJ Parcels Composite / MOD-IV (New Jersey · statewide)',
        proxyPath: '/api/parcel/us-nj',
        kind: 'cadastral',
        contains: isInNewJersey,
        note: 'NJ statewide parcels composite — VERIFIED-LIVE 2026-09-06, and it OVERTURNS the US-NJ refusal recorded earlier the same day, which enumerated the NJ DEP host mapsdep.nj.gov and correctly found no parcels THERE. The publisher is the NJGIN/NJOGIS ArcGIS Online org: keyless FeatureServer services2.arcgis.com/XVOqAjTOJ5P6ngMu/.../Parcels_Composite_NJ_WM/FeatureServer/0, layer "Cad_parcel_mod4", native EPSG:102100, 3,481,240 features. Point-intersect @ Newark (40.780885,-74.155224) → HTTP 200, 1692 bytes: PAMS_PIN 0714_835_7, PROP_LOC "916-918 BROADWAY", MUN_NAME "NEWARK CITY", COUNTY ESSEX, 5-vertex WGS84 ring. Second county @ Jersey City (40.761628,-74.053565) → PAMS_PIN 0906_101_6_HM, HUDSON. COVERAGE MEASURED: returnDistinctValues on `COUNTY` = 21 of 21 New Jersey counties. PAMS_PIN (municipality_block_lot[_qualifier]) is the statewide-unique key. ⚠ FRESHNESS IS PER-ROW: max(PCLLASTUPD) = 2026-03-25 but the Newark row reads 2015-07-23 and the minimum is a corrupt 0111-12-01 — cite the row, never the max. ⚠ `CALC_ACRE` is a tax-roll acreage, NOT the polygon area; area is geometry-derived and the ring is independently verified against `Shape__Area` at ratio 1.0000. Zoning/FAR are municipal (MLUL), NEVER inferred here. ⚠ ROUTING, MEASURED: NYC_BBOX (40.47–40.93 N, -74.28 – -73.68 E) OVERHANGS THE HUDSON and covers BOTH Newark and Jersey City, and at ≈0.28 deg² it is far smaller than this row (≈4.4 deg²), so specificity tries MapPLUTO FIRST on New Jersey soil. The OUTCOME is still correct — MapPLUTO holds only NYC tax lots, returns nothing at Newark, and `resolveParcelWithFallback` falls THROUGH to this row, which answers — but it costs ONE WASTED UPSTREAM CALL on every click in the two largest cities in New Jersey. Named, not hidden; tightening NYC_BBOX to the true shoreline is the fix, and it lives in a different file.',
    },
    {
        // US-VT — VCGI statewide standardized parcels, 256 towns (all 255 + gores/grants).
        regionCode: 'US-VT',
        countryName: 'United States (Vermont · statewide)',
        providerId: 'us-vt-vcgi-standardized-parcels',
        label: 'VCGI Standardized Parcels (Vermont · statewide)',
        proxyPath: '/api/parcel/us-vt',
        kind: 'cadastral',
        contains: isInVermont,
        note: 'VCGI statewide standardized parcels — VERIFIED-LIVE 2026-09-06: keyless ArcGIS Online FeatureServer (services1.arcgis.com/BkFxaEFNwHqX3tAw/.../FS_VCGI_OPENDATA_Cadastral_VTPARCELS_poly_standardized_parcels_SP_v1/FeatureServer/0, native EPSG:32145 = VT State Plane METRES, 343,996 features). Point-intersect @ Burlington (44.522464,-73.266076) → HTTP 200, 9910 bytes: SPAN 114-035-10304, PARCID 023-1-016-000, TOWN BURLINGTON, YEAR 2025, SOURCEDATE 20250922, 5-vertex WGS84 ring. COVERAGE MEASURED: returnDistinctValues on `TOWN` = 256 — Vermont\'s 255 towns/cities plus the unorganised gores and grants, i.e. the full statewide tessellation. ⚠ SPAN IS NOT ONE-PER-POLYGON: condominium units share the School Property Account Number (measured: SPAN C-535-8371 on two polygons), so PARCID rides as the secondary id and is what separates stacked units. ⚠ A NULL SPAN is legitimate — WATER and other EXEMPT polygons carry no tax account and are refused as `no-parcel-id` rather than keyed on a surrogate. `ACRESGL` is Grand-List acreage, NOT the polygon area; area is geometry-derived, ring verified against `Shape__Area` (already m²) at ratio 1.0001. Zoning is municipal (24 V.S.A. ch. 117) and Act 250 is a separate permit regime — NEITHER inferred here.',
    },
    {
        // US-CT — CT GIS Office statewide CAMA+parcel layer, 169 of 169 towns (measured).
        regionCode: 'US-CT',
        countryName: 'United States (Connecticut · statewide)',
        providerId: 'us-ct-ctgis-cama-parcels',
        label: 'CT Statewide CAMA and Parcel Layer (Connecticut · statewide)',
        proxyPath: '/api/parcel/us-ct',
        kind: 'cadastral',
        contains: isInConnecticut,
        note: 'Connecticut statewide CAMA + parcel layer — VERIFIED-LIVE 2026-09-06: keyless ArcGIS Online FeatureServer (services3.arcgis.com/3FL1kr7L4LvwA2Kb/.../Connecticut_CAMA_and_Parcel_Layer/FeatureServer/0, owner ctgisoffice, native EPSG:103016 = CT State Plane US survey FEET, 1,320,686 features). Point-intersect @ Andover (41.697994,-72.387870) → HTTP 200, 10956 bytes: Parcel_ID "25/022/000019", Location "GILEAD RD", Town_Name Andover, 7-vertex WGS84 ring. COVERAGE MEASURED: returnDistinctValues on `Town_Name` = 169 of 169 — Connecticut has no county government, so the TOWN is the assessing unit and 169 towns is the correct statewide denominator, not 8 counties. FRESHNESS: `Parcel_Collection_Year` has a SINGLE distinct value, "2026" — one annual vintage statewide, unusually clean for a US fabric. ⚠ `Location` is NULL across whole towns (measured: all of Hartford), so the card must tolerate an address-less parcel; `Property_City` carries the locality. ⛔ `Mailing_Address` is the OWNER\'S address, often out of state — NEVER render it as the site address. ⚠ The layer carries a `Zone` string inline (measured "N3-1") — CONTEXT/DRAFT lead only; CT zoning is municipal (C.G.S. ch. 124) and no FAR or height is inferred here. `Land_Acres` is quantised to whole acres (measured: exactly 1 for parcels of 2561/3230/2357 m²) and is NEVER used; area is geometry-derived, ring verified against `Shape__Area` (ft²) at a constant ratio 0.0930 = 1/10.764.',
    },
    {
        // US-IN — IndianaMap/IGIO statewide parcels, 92 of 92 counties (measured).
        regionCode: 'US-IN',
        countryName: 'United States (Indiana · statewide)',
        providerId: 'us-in-indianamap-parcels',
        label: 'IndianaMap Parcel Boundaries (Indiana · statewide)',
        proxyPath: '/api/parcel/us-in',
        kind: 'cadastral',
        contains: isInIndiana,
        note: 'IndianaMap statewide parcel boundaries — VERIFIED-LIVE 2026-09-06: keyless ArcGIS FeatureServer (gisdata.in.gov/server/rest/services/Hosted/Parcel_Boundaries_of_Indiana_Current/FeatureServer/0, native EPSG:4326 — already WGS84, 3,682,675 features). Point-intersect @ Lake Village, Newton Co. (41.141519,-87.350124) → HTTP 200, 8537 bytes: state_parcel_id 564130801801, nguid "urn:emergency:uid:gis:PCL:821117010081481701:newtoncounty.in.gov", esri_poname "Lake Village", 37-vertex WGS84 ring. COVERAGE MEASURED: returnDistinctValues on `county_fips` = 92 of 92 Indiana counties. FRESHNESS: max(`loaddate`) = 2025-10-27, per-row and per-county. `state_parcel_id` (the DLGF statewide parcel number) is the statewide-unique key; the county-local `parcel_id`/`local_id` ride as secondary. ⛔ `SHAPE__Area` IS IN SQUARE DEGREES, not m² — the layer is served natively in 4326, so the value reads ~1.6e-6 for an 18,643 m² lot and passing it through would understate every Indiana parcel by ~10 orders of magnitude. Area is geometry-derived. ⚠ The point-intersect can return MORE THAN ONE feature (measured: 2) where county fabrics abut or a stacked polygon exists; first-wins, the same rule every other US row uses. Zoning/FAR are municipal (IC 36-7-4), NEVER inferred here.',
    },
    {
        // US-MD — MD iMAP / SDAT statewide parcel boundaries, 24 of 24 jurisdictions (measured).
        regionCode: 'US-MD',
        countryName: 'United States (Maryland · statewide)',
        providerId: 'us-md-sdat-parcel-boundaries',
        label: 'MD iMAP Parcel Boundaries (Maryland · statewide, SDAT)',
        proxyPath: '/api/parcel/us-md',
        kind: 'cadastral',
        contains: isInMaryland,
        note: 'Maryland statewide parcel boundaries — VERIFIED-LIVE 2026-09-06, and it OVERTURNS the US-MD refusal recorded earlier the same day, which read HTTP 503 "Site Maintenance" from geodata.md.gov and called Maryland an OUTAGE. ⚠ THE HOST DID NOT RECOVER: geodata.md.gov is STILL 503 on re-probe. The live iMAP host is mdgeodata.md.gov — an `md` PREFIX, a different hostname — serving PlanningCadastre/MD_ParcelBoundaries/MapServer/0, its own serviceDescription "parcel polygons of the entire state … from the State Department of Assessments and Taxation", native EPSG:102100, 2,288,725 features. Point-intersect @ Baltimore City (39.291530,-76.587071) → HTTP 200, 16196 bytes: ACCTID "0301011738 004", JURSCODE BACI, ADDRESS "2107 E BALTIMORE ST", CITY BALTIMORE, 6-vertex WGS84 ring. COVERAGE MEASURED: returnDistinctValues on `JURSCODE` = 24 — Maryland\'s 23 counties plus Baltimore City. FRESHNESS: max(`POLYDATE`) = "2026JAN" (a YYYYMON string, not an epoch). ⚠ ACCTID IS UNIQUE ONLY WITHIN ITS JURISDICTION — the statewide-unique key is the PAIR JURSCODE+ACCTID, the same shape as OH PIN vs STATEWIDE_PIN and NY PRINT_KEY vs SBL, so JURSCODE rides in the locality fields and must be shown beside the id. Area is geometry-derived; ring verified against `Shape.STArea()` at ratio 1.0000 on two of three sampled parcels — the third read 2.96× because it is MULTI-RING and the client areas the outer ring only (pre-existing on every US row, named not averaged). Zoning/FAR are municipal, NEVER inferred here.',
    },
    // ══════════════════════════════════════════════════════════════════════════════════════
    // LANE AU-OPEN (2026-09-03) — AUSTRALIA, the six OPEN states + two DECLARED DEFERRALS.
    // ══════════════════════════════════════════════════════════════════════════════════════
    // Sub-national codes AU-<STATE> (ISO 3166-2:AU), the proven US-<STATE> idiom extended — a bbox
    // `contains` per state, the shared client in countryAdapters/au/auStateCadastre.ts. Six returned
    // a REAL legal parcel id LIVE this session (transcripts audit/intl-parcels/2026-09-02/
    // transcripts-au/live-*.json). Placement here is cosmetic (an AU point matches ONLY AU rows —
    // continental isolation at lon 112.9–153.7°E); the real dispatch orders by specificity, which
    // ranks the enclaved ACT box (≈0.53 deg²) ahead of NSW (≈118 deg²) for Canberra, and each
    // state cadastre returns 0 features outside its own state so a shared-border click self-corrects
    // exactly as the pre-L-12871 European rows did. Proxies /api/parcel/au-<state> are NOT yet wired
    // server-side → each resolves null → OSM footprint until then (the LIVE proof is the direct
    // upstream probe recorded in the note + lane-au-open.md). ACT FIRST (enclave), deferrals LAST.
    {
        regionCode: 'AU-ACT',
        countryName: 'Australia (Australian Capital Territory)',
        providerId: 'au-act-actmapi-blocks',
        label: 'Block (ACT · ACTmapi · block/section)',
        proxyPath: '/api/parcel/au-act',
        kind: 'cadastral',
        contains: isInAct,
        note: 'ACTGOV_BLOCKS FeatureServer (services1.arcgis.com/E5n4f1VY84i0xSjy, layer 0) — keyless, live-probed 2026-09-03 @ Civic (149.1300,-35.2809): 4 features, 3 RETIRED (superseded — parser drops them, RETIRED≠current) + 1 APPROVED = block 44 section 19 (BLOCK_KEY 11080190044, CANBERRA CENTRAL), the resolved parcel; ACT is leasehold, block/section IS the parcel id and the Territory-Plan zone rides on the row. CC-BY-4.0 (hub item example; per-item confirm owed). ACT is enclaved in NSW → smallest box wins Canberra by specificity. ⭐ WIRED server-side (lane PROXY-LEGS 2026-09-03; the stale "not yet wired" warning this replaces survived the wiring commit). RE-PROVEN END TO END 2026-09-04 by lane PARCEL-REACH round 4 through https://pryzm.fly.dev/api/parcel/au-act — HTTP 200 with a real WGS84 ring.',
    },
    {
        regionCode: 'AU-TAS',
        countryName: 'Australia (Tasmania)',
        providerId: 'au-tas-thelist-cadastre',
        label: 'CadastreParcel (TAS · theLIST · PID + title)',
        proxyPath: '/api/parcel/au-tas',
        kind: 'cadastral',
        contains: isInTas,
        note: 'theLIST Public/CadastreParcels MapServer/0 (services.thelist.tas.gov.au) — keyless, live-probed 2026-09-03 @ Hobart (147.3272,-42.8821) → PID 3321248, title VOLUME 40374/FOLIO 3, TENURE Council, "49-51 MURRAY ST HOBART" — the richest parcel row in AU (id+title+tenure+address+area). Licence string UNKNOWN this session (theLIST records usually CC BY 3.0 AU; read the listdata record, reviewBy 2026-10-15). ⭐ WIRED server-side (lane PROXY-LEGS 2026-09-03; the stale "not yet wired" warning this replaces survived the wiring commit). RE-PROVEN END TO END 2026-09-04 by lane PARCEL-REACH round 4 through https://pryzm.fly.dev/api/parcel/au-tas — HTTP 200 with a real WGS84 ring.',
    },
    {
        regionCode: 'AU-VIC',
        countryName: 'Australia (Victoria)',
        providerId: 'au-vic-vicmap-cadastre',
        label: 'Vicmap Parcel (VIC · SPI)',
        proxyPath: '/api/parcel/au-vic',
        kind: 'cadastral',
        contains: isInVic,
        note: 'Vicmap open-data GeoServer WFS 2.0 (opendata.maps.vic.gov.au, open-data-platform:v_parcel_mp) — keyless, live-probed 2026-09-03 @ Melbourne (-37.8136,144.9631): INTERSECTS(geom,POINT(lat lon)) — CQL is LAT,LON order (a lon,lat probe returns 0 silently); srsName=EPSG:4326 → GeoJSON lon/lat; parcel_spi "PC366537" (the Standard Parcel Identifier), status A, crs urn EPSG::7844 (GDA2020≈WGS84). CC BY 4.0. ⭐ WIRED server-side (lane PROXY-LEGS 2026-09-03; the stale "not yet wired" warning this replaces survived the wiring commit). RE-PROVEN END TO END 2026-09-04 by lane PARCEL-REACH round 4 through https://pryzm.fly.dev/api/parcel/au-vic — HTTP 200 with a real WGS84 ring.',
    },
    {
        regionCode: 'AU-NSW',
        countryName: 'Australia (New South Wales)',
        providerId: 'au-nsw-dcs-cadastre',
        label: 'Land Parcel (NSW · DCS Spatial Services · lot/plan)',
        proxyPath: '/api/parcel/au-nsw',
        kind: 'cadastral',
        contains: isInNsw,
        note: 'DCS Spatial Services NSW_Land_Parcel_Property_Theme FeatureServer/8 (portal.spatial.nsw.gov.au) — keyless, live-probed 2026-09-03 @ Sydney Town Hall (151.20658,-33.87344) → lotidstring "100//DP1048011" (planlabel DP1048011, cadid 100105498), WGS84 polygon 21 verts. CC Attribution (data.nsw CKAN Cadastral Fabric). Road corridors are not lots (0 features → footprint). ⭐ WIRED server-side (lane PROXY-LEGS 2026-09-03; the stale "not yet wired" warning this replaces survived the wiring commit). RE-PROVEN END TO END 2026-09-04 by lane PARCEL-REACH round 4 through https://pryzm.fly.dev/api/parcel/au-nsw — HTTP 200 with a real WGS84 ring.',
    },
    {
        regionCode: 'AU-SA',
        countryName: 'Australia (South Australia)',
        providerId: 'au-sa-sappa-cadastre',
        label: 'Parcel (SA · PlanSA / SAPPA · plan/parcel + title)',
        proxyPath: '/api/parcel/au-sa',
        kind: 'cadastral',
        contains: isInSaAu,
        note: '⛔ regionCode AU-SA (Australian South Australia), NOT SA (Saudi). PlanSA SAPPA/PropertyPlanningAtlasV19 MapServer/41 (lsa2.geohub.sa.gov.au) — live-probed 2026-09-03 @ Rundle Mall (138.6010,-34.9235) → parcel_id "C21367   F1" (plan C21367 F1, title CT 5954/719). SOFT CloudFront WAF: 403 to a bare request, 200 WITH Referer https://sappa.plan.sa.gov.au/ (control probe live-sa-noreferer.txt = 403; NOT IP-geofenced like Saudi Balady) — the proxy adds the Referer server-side. Data itself CC Attribution (data.sa; open downloads exist). PlanSA live-endpoint terms owed a read (reviewBy 2026-12-01). ⭐ WIRED server-side (lane PROXY-LEGS 2026-09-03; the stale "not yet wired" warning this replaces survived the wiring commit). RE-PROVEN END TO END 2026-09-04 by lane PARCEL-REACH round 4 through https://pryzm.fly.dev/api/parcel/au-sa — HTTP 200 with a real WGS84 ring.',
    },
    {
        regionCode: 'AU-QLD',
        countryName: 'Australia (Queensland)',
        providerId: 'au-qld-qspatial-cadastre',
        label: 'Cadastral Parcel (QLD · QSpatial · lotplan)',
        proxyPath: '/api/parcel/au-qld',
        kind: 'cadastral',
        contains: isInQld,
        note: 'QSpatial PlanningCadastre/LandParcelPropertyFramework MapServer/4 (spatial-gis.information.qld.gov.au) — keyless, live-probed 2026-09-03 @ Brisbane CBD (153.0260,-27.4705): 2 features, the Lot Type Parcel carries lotplan "47SP317615" (lot 47/plan SP317615, tenure Lands Lease); the 2nd is an "Unlinked parcel or interest" with null lotplan (parser skips it). CC BY 4.0 (data.qld). ⭐ WIRED server-side (lane PROXY-LEGS 2026-09-03; the stale "not yet wired" warning this replaces survived the wiring commit). RE-PROVEN END TO END 2026-09-04 by lane PARCEL-REACH round 4 through https://pryzm.fly.dev/api/parcel/au-qld — HTTP 200 with a real WGS84 ring.',
    },
    {
        regionCode: 'AU-WA',
        countryName: 'Australia (Western Australia)',
        providerId: 'footprint',
        label: 'Building footprint (OSM)',
        proxyPath: null,
        kind: 'footprint-fallback',
        contains: isInWa,
        note: 'DECLARED DEFERRAL — WA geometry is keyless but the LEGAL IDENTIFIER is gated. Landgate SLIP layer 2 "Cadastre (No Attributes) (LGATE-001)" returns polygon geometry with NO lot/plan/id (au-sweep §4.1 @ Perth CBD: attributes {"objectid":1149809,"view_scale":"4K"} only, transcript wa-layer2-perth.json). The attributed products (LGATE-217 …) carry license_title "Custom (Other)" = a Landgate data agreement (price class unread — geoscape.com.au 403 to our probe). Registered as a footprint so a Perth click is honestly labelled, never attributed to a cadastre we cannot identify. Decision owed: buy the Landgate attributed cadastre vs geometry-only honesty label (reviewBy 2026-11-15). Planning layers (R-Codes, region/LPS zones) ARE keyless.',
    },
    {
        regionCode: 'AU-NT',
        countryName: 'Australia (Northern Territory)',
        providerId: 'footprint',
        label: 'Building footprint (OSM)',
        proxyPath: null,
        kind: 'footprint-fallback',
        contains: isInNt,
        note: 'DECLARED DEFERRAL — viewer/JS-app mediated, machine channel UNKNOWN (not zero). NR Maps (nrmaps.nt.gov.au) serves a JS loader issuing a jsessionid with no REST/OGC endpoint greppable; NTLIS/iPlan → 302 → dipl.nt.gov.au behind a Cloudflare "Just a moment…" challenge (HTTP 403); data.nt.gov.au CKAN has no cadastre/planning-scheme dataset (au-sweep §8.1, transcripts nt-nrmaps.html/nt-iplan.html/nt-ckan*.json). The data visibly exists behind the viewers — settle via a browser-session network capture of NR Maps (our curl env cannot execute its JS). Smallest market, last in launch order (reviewBy 2026-12-15). Registered as a footprint so a Darwin click is honestly labelled.',
    },
    {
        regionCode: 'FR',
        countryName: 'France',
        providerId: 'ign-fr',
        label: 'Cadastre (France · IGN PARCELLAIRE EXPRESS)',
        proxyPath: '/api/parcel/fr',
        kind: 'cadastral',
        contains: isInFrance,
        note: 'data.geopf.fr WFS CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle — HTTP 200 application/json, real MultiPolygon (idu 75104000AE0003 @ Paris), keyless.',
    },
    // ── LANE PARCEL-REACH (2026-09-04): GERMANY — 14 Länder promoted footprint → cadastral ──────
    // THE LARGEST SINGLE GAIN IN THIS LANE. Before today DE-NW was the ONLY German Land with a
    // keyless cadastre, and every other German click resolved `DE: footprint-fallback`. The reason
    // was written down in countryBbox.ts's own NRW comment — "every other Land's ALKIS is per-Land
    // licence-gated" — and it was MEASURED FALSE on 2026-09-04: fourteen of the remaining fifteen
    // serve a keyless parcel WFS, and all fourteen returned a real Flurstück at their capital
    // through the production resolver, cold, with no warming fetch. A belief that had been carried
    // as fact for six weeks cost the largest economy in Europe its parcel selection.
    //
    // ⚠ SPECIFICITY, NOT ORDER, RESOLVES THE OVERLAPS — the city-states are why this matters:
    // Berlin's box (0.32 deg²) sits inside Brandenburg's (8.28), Hamburg's (0.70) and Bremen's
    // (0.42) inside Niedersachsen's (14.28). `parcelJurisdictionSpecificity` ranks the smallest
    // enclosing box first, so each city-state wins its own points with no hand-tuned ordering.
    // ⚠ EVERY ROW NEEDS A REGION_BBOX ENTRY or it scores +Infinity and sorts LAST — which for a
    // city-state means silently handing its points to the surrounding Land.
    //
    // ⛔ BAYERN IS ABSENT, AND THAT IS A MEASURED REFUSAL RATHER THAN AN OMISSION: its INSPIRE ALKIS
    // WFS answers `401 Unauthorized · WWW-Authenticate: Basic realm="INSPIRE-WFS ALKIS"` (so does the
    // legacy ogc_alkis_ave.cgi), and Bayern's ENTIRE open-data catalogue was enumerated rather than
    // guessed at — 35 products — whose only ALKIS entries are raster: the Parzellarkarte record
    // states `"abgabe_datenformate":["PNG","JPEG"]` and "keine Flurstücksnummern", and its WMS
    // advertises every layer `queryable="0"` with NO GetFeatureInfo element at all. A Bavarian click
    // falls to the whole-Germany footprint row below, honestly labelled. Credentials from the LDBV
    // are the named unblock.
    {
        regionCode: 'DE-BW',
        countryName: 'Germany (Baden-Württemberg)',
        providerId: 'alkis-bw',
        label: 'Flurstück (Baden-Württemberg · ALKIS INSPIRE)',
        proxyPath: '/api/parcel/de-bw',
        kind: 'cadastral',
        contains: isInDeLand('DE-BW'),
        note: 'Baden-Württemberg: LGL Baden-Württemberg ALKIS INSPIRE Cadastral Parcels — a KEYLESS WFS 2.0 serving cp:CadastralParcel, LIVE-PROBED 2026-09-04 by lane PARCEL-REACH. LIVE CLICK PROOF (cold, through the production resolver): Stuttgart Schlossplatz (48.7784,9.1800) → 08146000000660000100, label 660/1, official areaValue 24718 m², 119-vertex ring. CRS: urn EPSG::4258 — this service advertises NO 4326 at all (only 25832/25833/4258). posList is LAT-FIRST, parsed with axis:"latlon" — the DE-NRW idiom, no new parser. GML only. The official areaValue is preferred over the shoelace estimate with its uom ASSERTED, never assumed (a hectare read as a square metre is a 10 000× error wearing a number’s confidence). ETRS89 (4258) where used differs from WGS84 by centimetres, far below BIM scale — the same rationale as the IT leg. Rules remain DOCUMENTS-ONLY: Bebauungspläne are municipal PDFs and XPlanung adoption is partial, so there is no national machine-readable zoning register to pair with this geometry.',
    },
    {
        regionCode: 'DE-HE',
        countryName: 'Germany (Hessen)',
        providerId: 'alkis-he',
        label: 'Flurstück (Hessen · ALKIS INSPIRE)',
        proxyPath: '/api/parcel/de-he',
        kind: 'cadastral',
        contains: isInDeLand('DE-HE'),
        note: 'Hessen: HVBG Hessen ALKIS INSPIRE Cadastral Parcels — a KEYLESS WFS 2.0 serving cp:CadastralParcel, LIVE-PROBED 2026-09-04 by lane PARCEL-REACH. LIVE CLICK PROOF (cold, through the production resolver): Frankfurt Römer (50.1106,8.6820) → 060460003001990040, label 199/40, 15100 m², 416-vertex ring. CRS: urn EPSG::4258. posList is LAT-FIRST, parsed with axis:"latlon" — the DE-NRW idiom, no new parser. GML only. The official areaValue is preferred over the shoelace estimate with its uom ASSERTED, never assumed (a hectare read as a square metre is a 10 000× error wearing a number’s confidence). ETRS89 (4258) where used differs from WGS84 by centimetres, far below BIM scale — the same rationale as the IT leg. Rules remain DOCUMENTS-ONLY: Bebauungspläne are municipal PDFs and XPlanung adoption is partial, so there is no national machine-readable zoning register to pair with this geometry.',
    },
    {
        regionCode: 'DE-NI',
        countryName: 'Germany (Niedersachsen)',
        providerId: 'alkis-ni',
        label: 'Flurstück (Niedersachsen · ALKIS INSPIRE)',
        proxyPath: '/api/parcel/de-ni',
        kind: 'cadastral',
        contains: isInDeLand('DE-NI'),
        note: 'Niedersachsen: LGLN Niedersachsen ALKIS INSPIRE Cadastral Parcels — a KEYLESS WFS 2.0 serving cp:CadastralParcel, LIVE-PROBED 2026-09-04 by lane PARCEL-REACH. LIVE CLICK PROOF (cold, through the production resolver): Hannover (52.3744,9.7386) → 034880045002110090, label 211/90, 2267 m². CRS: urn EPSG::4326. posList is LAT-FIRST, parsed with axis:"latlon" — the DE-NRW idiom, no new parser. GML only. The official areaValue is preferred over the shoelace estimate with its uom ASSERTED, never assumed (a hectare read as a square metre is a 10 000× error wearing a number’s confidence). ETRS89 (4258) where used differs from WGS84 by centimetres, far below BIM scale — the same rationale as the IT leg. Rules remain DOCUMENTS-ONLY: Bebauungspläne are municipal PDFs and XPlanung adoption is partial, so there is no national machine-readable zoning register to pair with this geometry.',
    },
    {
        regionCode: 'DE-SN',
        countryName: 'Germany (Sachsen)',
        providerId: 'alkis-sn',
        label: 'Flurstück (Sachsen · ALKIS INSPIRE)',
        proxyPath: '/api/parcel/de-sn',
        kind: 'cadastral',
        contains: isInDeLand('DE-SN'),
        note: 'Sachsen: GeoSN Sachsen ALKIS INSPIRE Cadastral Parcels — a KEYLESS WFS 2.0 serving cp:CadastralParcel, LIVE-PROBED 2026-09-04 by lane PARCEL-REACH. LIVE CLICK PROOF (cold, through the production resolver): Dresden (51.0504,13.7373) → 140208___02523001200, label 2523/12, 3724 m². CRS: urn EPSG::4258 — ⛔ asking THIS service for EPSG:4326 returns an HTML 400 WAF page, not an OWS exception, so a naive CRS retry looks like a network fault. posList is LAT-FIRST, parsed with axis:"latlon" — the DE-NRW idiom, no new parser. GML only. The official areaValue is preferred over the shoelace estimate with its uom ASSERTED, never assumed (a hectare read as a square metre is a 10 000× error wearing a number’s confidence). ETRS89 (4258) where used differs from WGS84 by centimetres, far below BIM scale — the same rationale as the IT leg. Rules remain DOCUMENTS-ONLY: Bebauungspläne are municipal PDFs and XPlanung adoption is partial, so there is no national machine-readable zoning register to pair with this geometry.',
    },
    {
        regionCode: 'DE-SH',
        countryName: 'Germany (Schleswig-Holstein)',
        providerId: 'alkis-sh',
        label: 'Flurstück (Schleswig-Holstein · ALKIS INSPIRE)',
        proxyPath: '/api/parcel/de-sh',
        kind: 'cadastral',
        contains: isInDeLand('DE-SH'),
        note: 'Schleswig-Holstein: LVermGeo Schleswig-Holstein ALKIS INSPIRE Cadastral Parcels — a KEYLESS WFS 2.0 serving cp:CadastralParcel, LIVE-PROBED 2026-09-04 by lane PARCEL-REACH. LIVE CLICK PROOF (cold, through the production resolver): Kiel (54.3233,10.1228) → 01253701700335, label 335, 4067 m². CRS: urn EPSG::4326. posList is LAT-FIRST, parsed with axis:"latlon" — the DE-NRW idiom, no new parser. GML only. The official areaValue is preferred over the shoelace estimate with its uom ASSERTED, never assumed (a hectare read as a square metre is a 10 000× error wearing a number’s confidence). ETRS89 (4258) where used differs from WGS84 by centimetres, far below BIM scale — the same rationale as the IT leg. Rules remain DOCUMENTS-ONLY: Bebauungspläne are municipal PDFs and XPlanung adoption is partial, so there is no national machine-readable zoning register to pair with this geometry.',
    },
    {
        regionCode: 'DE-BB',
        countryName: 'Germany (Brandenburg)',
        providerId: 'alkis-bb',
        label: 'Flurstück (Brandenburg · ALKIS INSPIRE)',
        proxyPath: '/api/parcel/de-bb',
        kind: 'cadastral',
        contains: isInDeLand('DE-BB'),
        note: 'Brandenburg: LGB Brandenburg ALKIS INSPIRE Cadastral Parcels — a KEYLESS WFS 2.0 serving cp:CadastralParcel, LIVE-PROBED 2026-09-04 by lane PARCEL-REACH. LIVE CLICK PROOF (cold, through the production resolver): Potsdam (52.3906,13.0645) → 12050100600984, label 984, 23421 m². CRS: urn EPSG::4326. posList is LAT-FIRST, parsed with axis:"latlon" — the DE-NRW idiom, no new parser. GML only. The official areaValue is preferred over the shoelace estimate with its uom ASSERTED, never assumed (a hectare read as a square metre is a 10 000× error wearing a number’s confidence). ETRS89 (4258) where used differs from WGS84 by centimetres, far below BIM scale — the same rationale as the IT leg. Rules remain DOCUMENTS-ONLY: Bebauungspläne are municipal PDFs and XPlanung adoption is partial, so there is no national machine-readable zoning register to pair with this geometry.',
    },
    {
        regionCode: 'DE-ST',
        countryName: 'Germany (Sachsen-Anhalt)',
        providerId: 'alkis-st',
        label: 'Flurstück (Sachsen-Anhalt · ALKIS INSPIRE)',
        proxyPath: '/api/parcel/de-st',
        kind: 'cadastral',
        contains: isInDeLand('DE-ST'),
        note: 'Sachsen-Anhalt: LVermGeo Sachsen-Anhalt ALKIS INSPIRE Cadastral Parcels — a KEYLESS WFS 2.0 serving cp:CadastralParcel, LIVE-PROBED 2026-09-04 by lane PARCEL-REACH. LIVE CLICK PROOF (cold, through the production resolver): Magdeburg (52.1205,11.6276) → 150938153004370005, label 437/5, 4450 m². CRS: urn EPSG::4326. posList is LAT-FIRST, parsed with axis:"latlon" — the DE-NRW idiom, no new parser. GML only. The official areaValue is preferred over the shoelace estimate with its uom ASSERTED, never assumed (a hectare read as a square metre is a 10 000× error wearing a number’s confidence). ETRS89 (4258) where used differs from WGS84 by centimetres, far below BIM scale — the same rationale as the IT leg. Rules remain DOCUMENTS-ONLY: Bebauungspläne are municipal PDFs and XPlanung adoption is partial, so there is no national machine-readable zoning register to pair with this geometry.',
    },
    {
        regionCode: 'DE-MV',
        countryName: 'Germany (Mecklenburg-Vorpommern)',
        providerId: 'alkis-mv',
        label: 'Flurstück (Mecklenburg-Vorpommern · ALKIS INSPIRE)',
        proxyPath: '/api/parcel/de-mv',
        kind: 'cadastral',
        contains: isInDeLand('DE-MV'),
        note: 'Mecklenburg-Vorpommern: LAiV Mecklenburg-Vorpommern ALKIS INSPIRE Cadastral Parcels — a KEYLESS WFS 2.0 serving cp:CadastralParcel, LIVE-PROBED 2026-09-04 by lane PARCEL-REACH. LIVE CLICK PROOF (cold, through the production resolver): Schwerin (53.6355,11.4012) → 13076807400006, label 6, 608 m². CRS: urn EPSG::4326. posList is LAT-FIRST, parsed with axis:"latlon" — the DE-NRW idiom, no new parser. GML only. The official areaValue is preferred over the shoelace estimate with its uom ASSERTED, never assumed (a hectare read as a square metre is a 10 000× error wearing a number’s confidence). ETRS89 (4258) where used differs from WGS84 by centimetres, far below BIM scale — the same rationale as the IT leg. Rules remain DOCUMENTS-ONLY: Bebauungspläne are municipal PDFs and XPlanung adoption is partial, so there is no national machine-readable zoning register to pair with this geometry.',
    },
    {
        regionCode: 'DE-SL',
        countryName: 'Germany (Saarland)',
        providerId: 'alkis-sl',
        label: 'Flurstück (Saarland · ALKIS INSPIRE)',
        proxyPath: '/api/parcel/de-sl',
        kind: 'cadastral',
        contains: isInDeLand('DE-SL'),
        note: 'Saarland: LVGL Saarland ALKIS INSPIRE Cadastral Parcels — a KEYLESS WFS 2.0 serving cp:CadastralParcel, LIVE-PROBED 2026-09-04 by lane PARCEL-REACH. LIVE CLICK PROOF (cold, through the production resolver): Saarbrücken (49.2402,6.9969) → 101014034000240005, label 24/5, 346 m². CRS: urn EPSG::4258. posList is LAT-FIRST, parsed with axis:"latlon" — the DE-NRW idiom, no new parser. GML only. The official areaValue is preferred over the shoelace estimate with its uom ASSERTED, never assumed (a hectare read as a square metre is a 10 000× error wearing a number’s confidence). ETRS89 (4258) where used differs from WGS84 by centimetres, far below BIM scale — the same rationale as the IT leg. Rules remain DOCUMENTS-ONLY: Bebauungspläne are municipal PDFs and XPlanung adoption is partial, so there is no national machine-readable zoning register to pair with this geometry.',
    },
    {
        regionCode: 'DE-HH',
        countryName: 'Germany (Hamburg)',
        providerId: 'alkis-hh',
        label: 'Flurstück (Hamburg · ALKIS)',
        proxyPath: '/api/parcel/de-hh',
        kind: 'cadastral',
        contains: isInDeLand('DE-HH'),
        note: 'Hamburg: LGV Hamburg ALKIS — a KEYLESS WFS 2.0 in the adv ALKIS-vereinfacht schema, the SAME schema the DE-NRW row has served in production since 2026-07-24, so it reuses that normaliser (flstkennz / flaeche / gemarkung) with ZERO new parsing. LIVE-PROBED 2026-09-04 by lane PARCEL-REACH. LIVE CLICK PROOF (cold, through the production resolver): Hamburg Rathaus (53.5503,9.9920) → flstkennz 020101___01658, Gemarkung Altstadt Nord, 16371 m². ⚠ HAMBURG’S AXIS FLIPS ON THE CRS *SPELLING*, NOT THE CRS: urn:ogc:def:crs:EPSG::4326 returns lat-first ("53.550913 9.992096") while the short EPSG:4326 returns lon-first on the SAME service and the SAME parcel — a hemisphere bug wearing a valid HTTP 200. The leg emits the urn form. ⛔ Do NOT switch to Hamburg’s INSPIRE service HH_WFS_INSPIRE_Flurstuecke: its GetCapabilities is clean but EVERY spatial query fails server-side with HTTP 500 "ST_Intersects: Operation on mixed SRID geometries (Polygon, 0) != (Polygon, 25832)" across all six CRS spellings and both the BBOX parameter and an explicit fes:BBOX filter. Without a bbox it returns features fine, so the fault is its own bbox reprojection — an availability fault, not an access one. Rules remain DOCUMENTS-ONLY (municipal Bebauungspläne; no national machine-readable zoning register).',
    },
    {
        regionCode: 'DE-RP',
        countryName: 'Germany (Rheinland-Pfalz)',
        providerId: 'alkis-rp',
        label: 'Flurstück (Rheinland-Pfalz · ALKIS)',
        proxyPath: '/api/parcel/de-rp',
        kind: 'cadastral',
        contains: isInDeLand('DE-RP'),
        note: 'Rheinland-Pfalz: LVermGeo Rheinland-Pfalz ALKIS — a KEYLESS WFS 2.0 in the adv ALKIS-vereinfacht schema, the SAME schema the DE-NRW row has served in production since 2026-07-24, so it reuses that normaliser (flstkennz / flaeche / gemarkung) with ZERO new parsing. LIVE-PROBED 2026-09-04 by lane PARCEL-REACH. LIVE CLICK PROOF (cold, through the production resolver): Mainz (49.9929,8.2473) → flstkennz 073701017000540010, Gemarkung Mainz. ⚠ TWO RLP SERVICES ARE PUBLISHED AND ONLY THIS ONE WORKS. The INSPIRE one advertised at geoportal.rlp.de/spatial-objects/584 proxies to geo5balance.vermkv.rlp — a NON-RESOLVING internal host (curl exit 6) — so its OGC-API façade answers success:false with features:[] for EVERY collection, and its licence reads "Gebührenpflichtig". The wired one comes from spatial-objects/519, licence "geldleistungsfrei; Datenlizenz Deutschland – Namensnennung – Version 2.0". A fee-bearing dead host and a free working one, published side by side. Rules remain DOCUMENTS-ONLY (municipal Bebauungspläne; no national machine-readable zoning register).',
    },
    {
        regionCode: 'DE-TH',
        countryName: 'Germany (Thüringen)',
        providerId: 'alkis-th',
        label: 'Flurstück (Thüringen · ALKIS)',
        proxyPath: '/api/parcel/de-th',
        kind: 'cadastral',
        contains: isInDeLand('DE-TH'),
        note: 'Thüringen: TLBG Thüringen ALKIS — a KEYLESS WFS 2.0 in the adv ALKIS-vereinfacht schema, the SAME schema the DE-NRW row has served in production since 2026-07-24, so it reuses that normaliser (flstkennz / flaeche / gemarkung) with ZERO new parsing. LIVE-PROBED 2026-09-04 by lane PARCEL-REACH. LIVE CLICK PROOF (cold, through the production resolver): Erfurt (50.9787,11.0328) → flstkennz 160101136001710002, Gemarkung Erfurt-Mitte, 528 m². ⛔ THE MOST DANGEROUS LEG IN THE GERMAN BLOCK, because its failure mode is a CLEAN EMPTY rather than an error: a DEGREE bbox (either CRS spelling) returns HTTP 200 with numberMatched="0", so a wrong bbox CRS reads as "no parcel here" FOREVER and no alarm ever fires. The BBOX must be EPSG:25832 METRES; SRSNAME may still request 4326 output, and does. The proxy’s wgs84ToUtm32n is verified against the SERVICE’S OWN ANSWER rather than a formula: the parcel it returned for the box 643060..643130 / 5648830..5648900 has vertex (50.97346115,11.03859290), which the function maps to (643122.6,5648852.0) — inside that box — with control (52N,9E) → easting exactly 500000.0. Rules remain DOCUMENTS-ONLY (municipal Bebauungspläne; no national machine-readable zoning register).',
    },
    {
        regionCode: 'DE-HB',
        countryName: 'Germany (Bremen)',
        providerId: 'alkis-hb',
        label: 'Flurstück (Bremen · ALKIS)',
        proxyPath: '/api/parcel/de-hb',
        kind: 'cadastral',
        contains: isInDeLand('DE-HB'),
        note: 'Bremen: LGV Bremen ALKIS — a KEYLESS WFS 2.0 in the adv ALKIS-vereinfacht schema, the SAME schema the DE-NRW row has served in production since 2026-07-24, so it reuses that normaliser (flstkennz / flaeche / gemarkung) with ZERO new parsing. LIVE-PROBED 2026-09-04 by lane PARCEL-REACH. LIVE CLICK PROOF (cold, through the production resolver): Bremen (53.0793,8.8017) → flstkennz 041003003001480032, Gemarkung Altstadt 3, 17844 m². Bremen serves typeName app:flurstuecke — deegree’s app: prefix over the SAME adv field names (flstkennz/flaeche/gemarkung), so the DE-NRW normaliser covers it UNCHANGED because gmlText’s pattern is prefix-agnostic. ⚠ deegree’s numberReturned attribute is UNRELIABLE here and on BW/RP — BW returns numberReturned="0" WITH a real parcel in the body and ships an XML comment admitting the attribute should read "unknown" — so members must be COUNTED, never trusted from the attribute. The proxy already counts members. Rules remain DOCUMENTS-ONLY (municipal Bebauungspläne; no national machine-readable zoning register).',
    },
    {
        regionCode: 'DE-BE',
        countryName: 'Germany (Berlin)',
        providerId: 'alkis-be',
        label: 'Flurstück (Berlin · ALKIS)',
        proxyPath: '/api/parcel/de-be',
        kind: 'cadastral',
        contains: isInDeLand('DE-BE'),
        note: 'Berlin: Geodateninfrastruktur Berlin ALKIS Flurstücke — a KEYLESS WFS 2.0 serving alkis_flurstuecke:flurstuecke as GeoJSON, the one true one-off in the German block. LIVE-PROBED 2026-09-04 by lane PARCEL-REACH. LIVE CLICK PROOF (cold, through the production resolver): Berlin Alexanderplatz (52.5219,13.4132) → fsko 11000191900388, Gemarkung Mitte, afl 10751 m², 68-vertex WGS84 ring. ⚠ THE BBOX MUST BE THE LON-FIRST SHORT FORM "lon,lat,lon,lat,EPSG:4326": the urn-ordered lat,lon form every other German leg uses returns numberMatched:0 on this service (measured) — another SILENT EMPTY, the same failure class as Thüringen. Native CRS is 25833 but SRSNAME=EPSG:4326 is honoured and output is standard GeoJSON [lon,lat]. Fields are fsko (Flurstückskennzeichen, ALKIS underscore padding stripped as the DE-NRW row already does) / afl (area m²) / namgmk (Gemarkung). ⚠ Berlin’s box sits INSIDE Brandenburg’s; SPECIFICITY (0.32 vs 8.28 deg²) makes Berlin win, never registration order.',
    },
    {
        // NRW BEFORE NL (Düsseldorf sits in both boxes) and before the whole-Germany footprint.
        regionCode: 'DE-NW',
        countryName: 'Germany (North Rhine-Westphalia)',
        providerId: 'alkis-nrw',
        label: 'ALKIS (Germany · NRW GeoBasis)',
        proxyPath: '/api/parcel/de-nrw',
        kind: 'cadastral',
        contains: isInNRW,
        note: 'wfs.nrw.de wfs_nw_alkis_vereinfacht ave:Flurstueck — HTTP 200 GML 3.2.1, real Flurstück (flstkennz 05311000400273, 2355 m² @ Düsseldorf), keyless. Other German Länder are per-Land licence-gated → footprint.',
    },
    {
        regionCode: 'NL',
        countryName: 'Netherlands',
        providerId: 'pdok-nl',
        label: 'Kadaster (Netherlands · PDOK BRK)',
        proxyPath: '/api/parcel/nl',
        kind: 'cadastral',
        contains: isInNetherlands,
        note: 'service.pdok.nl kadastralekaart WFS v5_0 kadastralekaart:Perceel — HTTP 200 application/json, real Polygon (perceel ASD04 F 6685 @ Amsterdam), keyless.',
    },
    {
        regionCode: 'NO',
        countryName: 'Norway',
        providerId: 'geonorge-no',
        label: 'Matrikkelen (Norway · Kartverket)',
        proxyPath: '/api/parcel/no',
        kind: 'cadastral',
        contains: isInNorway,
        note: 'wfs.geonorge.no matrikkelen-eiendomskart-teig app:Teig — HTTP 200 GML 3.2.1, real teig polygon (0301/208/644 @ Oslo), keyless. ⭐ ONE AUTHORITY (decided 2026-09-02): this proxy row REMAINS the NO parcel authority — countryAdapters/no/ SUPPLEMENTS it (NAP plans + a matrikkel client whose parcel leg is blocked on the shared xmlScan non-ASCII-name defect, see impl/barrel-additions-no.txt [1]) and its noJurisdiction.ts re-exports countryBbox.ts’s predicate rather than minting a rival. ⚠ L-12885: NORWAY_BBOX is wider than Kartverket’s declared service extent (58.02–70.67 N / 5.11–23.69 E); countryAdapters/no/noJurisdiction.ts carries NO_MATRIKKEL_SERVICE_BBOX to tell the two apart.',
    },
    {
        // CH BEFORE the whole-Germany footprint entry (Zurich pokes into GERMANY_BBOX).
        // L-627: flipped footprint → cadastral. The earlier "no keyless Liegenschaft layer" verdict
        // was about the geodienste.ch/av_0 WFS host; the FEDERAL geo.admin.ch identify service DOES
        // return the real Amtliche-Vermessung Grundstück keylessly (EGRID + parcel no. + canton),
        // all-canton, live-verified for ZH + GE 2026-07-26. Licence: geo.admin.ch FSDI terms — free,
        // commercial use permitted, fair-use bounded (~20 req/min avg), attribution "© swisstopo + canton".
        regionCode: 'CH',
        countryName: 'Switzerland',
        providerId: 'swisstopo-av',
        label: 'Amtliche Vermessung (Switzerland · swisstopo/cantons)',
        proxyPath: '/api/parcel/ch',
        kind: 'cadastral',
        contains: isInSwitzerland,
        note: 'api3.geo.admin.ch identify ch.kantone.cadastralwebmap-farbe → Esri-JSON rings; real Grundstück carrying egris_egrid (CH119192997709 @ Zürich), local number (AA8048), canton ak — keyless, all-canton (ZH + GE live-verified 2026-07-26). geo.admin.ch FSDI terms: free + commercial OK + fair-use (~20 req/min avg) + attribution © swisstopo + canton. See ch/findings/ZURICH-PARCEL-SOURCE.md.',
    },
    {
        // IT AFTER CH (Bern/Lugano keep swisstopo — ITALY_BBOX would otherwise swallow them) and
        // after FR (Nice keeps IGN). The NW Italian border strip west of 8.3°E (Turin) is the
        // self-correcting casualty. Italy's interior (lon > 8.3°E) routes here regardless of order.
        regionCode: 'IT',
        countryName: 'Italy',
        providerId: 'agenzia-entrate',
        label: 'Catasto (Italy · Agenzia delle Entrate)',
        proxyPath: '/api/parcel/it',
        kind: 'cadastral',
        contains: isInItaly,
        note: 'Agenzia delle Entrate INSPIRE Cartografia Catastale WFS 2.0 (CP:CadastralParcel), EPSG:6706 (ETRS89 ≈ WGS84 at BIM scale, no reprojection), keyless CC BY 4.0, verified-live 2026-07-24 (Rome/H501, Milan/F205, Turin/L219). AP Trento + Bolzano excluded (own Catasto tavolare / Libro Fondiario). ⭐ WIRED server-side, and the "not yet wired" warning this replaces was STALE — it survived the commit that landed the leg. RE-PROVEN END TO END 2026-09-04 (lane PARCEL-REACH round 4) through https://pryzm.fly.dev/api/parcel/it: HTTP 200 with a real WGS84 ring (Roma → H501A048100.A).',
    },
    {
        regionCode: 'DE',
        countryName: 'Germany (other Länder)',
        providerId: 'footprint',
        label: 'Building footprint (OSM)',
        proxyPath: null,
        kind: 'footprint-fallback',
        contains: isInGermany,
        note: 'ALKIS outside NRW is per-Land licence-gated (no keyless national WFS). Footprint fallback until a per-Land open WFS or a licence is wired.',
    },
    {
        // L-12888 (2026-09-02) — the DK note used to read as "Denmark cannot be served" while the
        // KEYLESS DAWA jordstykker leg sat probed and unregistered in countryAdapters/dk/. ONE
        // Danish row, ONE proxy seat (C84 EI-9): the DAWA leg is stacked INSIDE the
        // /api/parcel/dk proxy (server/jurisdiction/dkMatrikelProxy.js — keyed Datafordeler WFS
        // first, keyless DAWA on a miss or when unkeyed), it is NOT a rival registry row. The
        // package-side pure stub (parcelProviders/dkMatrikelParcelProvider.ts) keeps its L-449
        // deferred seam; the signed OFFLINE legislation half (Plandata → buildable envelope) is
        // separate and complete.
        regionCode: 'DK',
        countryName: 'Denmark',
        providerId: 'matrikel-dk',
        label: 'Matriklen (Denmark)',
        proxyPath: '/api/parcel/dk',
        kind: 'cadastral',
        contains: isInDenmark,
        note: 'Denmark IS served KEYLESSLY: DAWA jordstykker (api.dataforsyningen.dk, format=geojson) resolves the real cadastral parcel polygon + matrikelnr at a point with no credential — live-probed 2026-09-01 (transcripts audit/…/impl/lane-dk-transcripts/dawa-*.json) and re-verified 2026-09-02 (HTTP 200, Polygon 115 verts, matrikelnr 7000q @ København); countryAdapters/dk/dkParcelProvider.ts carries the package-side parser. The /api/parcel/dk proxy STACKS the legs (L-12888): keyed Datafordeler Matriklen WFS first (survey attribute join), keyless DAWA on a miss or when DATAFORDELER_API_KEY is unset — so a Copenhagen click reaches DAWA before any stub. Only the package-side pure provider remains an L-449 DEFERRED STUB seam; a full miss falls to the OSM footprint, never a fabricated parcel.',
    },
    // ══════════════════════════════════════════════════════════════════════════════════════
    // LANE ME-OPEN (2026-09-03) — TR · IL · QA, three keyless national cadastres live-probed
    // 2026-09-02 (UA PRYZM-Research/1.0). Each routes on a bbox `contains` predicate (the SA
    // idiom), NOT `claimsNation`: none has a polygon in the national boundary set, so
    // `resolveNationalJurisdiction` REFUSES every TR/IL/QA point and the registry keeps the
    // bbox-matched set (the "a refusal is not a dead click" path). QA/IL are placed BEFORE the
    // SA footprint so the legacy first-match resolver prefers the live cadastre; the real
    // dispatch already orders them ahead of SA by specificity (their boxes are far smaller).
    // Proxies /api/parcel/{tr,il,qa} are NOT wired server-side yet — the CHANNEL is live and
    // probed (adapter parsers built + tested), the proxy seat is the named remaining wiring
    // (same honest state as US-NY-NYC / IT). Licences are UNREAD → YELLOW (see each qaSources/
    // ilSources/trSources row); keyless ≠ licensed.
    // LANE NZ-EVERYWHERE (2026-09-05) — NEW ZEALAND. Registered `kind:'cadastral'` because the server
    // leg EXISTS (`/api/parcel/nz` → LINZ WFS layer 50772) and answers a DISTINCT outcome without its
    // key — not because a parcel has been served yet. ⚠ WIRED-KEY-PENDING: LINZ_API_KEY is not set on
    // Fly, so today the leg answers HTTP 503 `outcome:'unconfigured'` (uncached, never `empty`), the
    // WfsParcelProvider reads the non-OK as null, and the registry falls through to the honest OSM
    // footprint. The row is kept `cadastral` so the coverage panel says "keyed, key pending" rather
    // than misfiling NZ under "no cadastre" (Defect D2 in PARCEL-SELECT-COVERAGE is the OPPOSITE
    // failure — a cadastral row with NO leg; this row has the leg, the test, and the key gate).
    {
        regionCode: 'NZ',
        countryName: 'New Zealand',
        providerId: 'nz-linz-primary-parcels',
        label: 'Primary Parcel (New Zealand · LINZ · appellation + titles)',
        proxyPath: '/api/parcel/nz',
        kind: 'cadastral',
        contains: isInNewZealand,
        note: 'LINZ Data Service WFS 2.0, layer 50772 "NZ Primary Parcels" — API record probed 2026-09-05 (services/api/v1/layers/50772/ → HTTP 200): 2,796,502 features, CC BY 4.0, native EPSG:4167 (NZGD2000 ≈ WGS84), fields id/appellation/affected_surveys/parcel_intent/topology_type/statutory_actions/land_district/titles/survey_area/calc_area/shape. EVERY LINZ service is API-key gated: WFS+WMTS GetCapabilities keyless → HTTP 401 (Jetty); a GetFeature with a BOGUS key → HTTP 400 ows:ExceptionReport "Feature type data.linz.govt.nz:layer-50772 unknown" (the layer list is key-scoped, so a bad key reads as an unknown layer, never as a parcel absence — the leg classifies both non-OK answers `unreachable`). The key is free (self-service at data.linz.govt.nz/my/api/), lives ONLY in LINZ_API_KEY on the BFF (C57 §1.2; SECRETS-REGISTER row), and without it the leg answers 503 `unconfigured` — the C57 §1.5 amendment: a failure carries a distinct status, never 200 {parcel:null}. No live parcel has been served through this leg yet (no key held); the server fixture is field-verbatim from the API record, its ring is synthetic. Licence: CC BY 4.0 (attribution "Sourced from the LINZ Data Service and licensed for reuse under CC BY 4.0"). No modelled box overlaps NZ; the national resolver returns no-national-candidate.',
    },
    {
        regionCode: 'TR',
        countryName: 'Turkey',
        providerId: 'tr-tkgm-parsel',
        label: 'Kadastro (Turkey · TKGM parselsorgu)',
        proxyPath: '/api/parcel/tr',
        kind: 'cadastral',
        contains: isInTurkey,
        note: 'TKGM megsiswebapi.v3 point→parcel GeoJSON (cbsapi.tkgm.gov.tr) — keyless, VERIFIED-LIVE 2026-09-02 by this lane (GET /parsel/40.9819/29.0576 → HTTP 200, ada 3106 / parsel 258, İstanbul/Kadıköy, alan 816.27 m², nitelik "11 Katli…" storey signal, WGS84 Polygon; countryAdapters/tr/trParcelProvider.ts carries the parser, trTkgmClient.ts the 404-as-absent classifier). A no-parcel point answers a SEMANTIC 404 "Parsel Bulunamadı" (absent, not a fence). LICENCE UNREAD (YELLOW): TKGM bulk/WMS is priced+protocol-gated — the query endpoint being keyless is the bulk-vs-query distinction, read the usage-terms modal before prod. ⭐ WIRED server-side, and the "not yet wired" warning this replaces was STALE — it survived the commit that landed the leg. RE-PROVEN END TO END 2026-09-04 (lane PARCEL-REACH round 4) through https://pryzm.fly.dev/api/parcel/tr: HTTP 200 with a real WGS84 ring (İstanbul/Şişli → 954/36). No modelled box overlaps Turkey; the national resolver returns no-national-candidate.',
    },
    {
        regionCode: 'IL',
        countryName: 'Israel',
        providerId: 'il-govmap-parcel-all',
        label: 'Building footprint (OSM)',
        proxyPath: null,
        kind: 'footprint-fallback',
        contains: isInIsrael,
        note: 'govmap IdentifyByXY PARCEL_ALL (ags.govmap.gov.il) — keyless, VERIFIED-LIVE 2026-09-02 by this lane (POST ITM (179254,665111) → HTTP 200, gush 6952 / helka 139, registered area 7404 m², status מוסדר, centroid ITM (179256.4375,665120.5938); countryAdapters/il/ carries the parser + ilItm.ts the ITM↔WGS84 transform EPSG:2039, verified against the returned centroid → WGS84 (32.0783,34.7780)). The API speaks ITM only — the WGS84 click is projected IN THE LEG. National BULK parcel_all.zip is IL-IP GATED (403 from a foreign IP) but the QUERY endpoint is NOT fenced (bulk≠query). LICENCE UNREAD (YELLOW): bulk CKAN field reads "Other (Open)" but the query-API terms are unread. ⛔ DEMOTED cadastral → footprint-fallback 2026-09-04 (lane PARCEL-REACH round 4). The note below already said the leg was unwired, but kind:"cadastral" + proxyPath:"/api/parcel/il" contradicted it, and `kind` is what the UI labels from. MEASURED: GET https://pryzm.fly.dev/api/parcel/il?lon=34.7818&lat=32.0853 → HTTP 404 with body {"error":"Unknown cadastre il."} — a Tel Aviv click gets an OSM footprint under an Israeli-cadastre label. ⭐ THE LEG IS DELIBERATELY ABSENT AND SHOULD STAY SO UNTIL A RING CHANNEL IS PROVEN: govmap IdentifyByXY serves a CENTROID AND AN EXTENT, never a boundary ring, and publishing the extent RECTANGLE as the parcel is the L-616 overstatement family. Unblock by live-proving the ring channel (SDE.PARCEL_ALL feature query by the identify’s objectId, or the ags.govmap.gov.il ArcGIS export), wiring `il`, THEN flipping kind+proxyPath back — in that order. providerId is retained so the row and countryAdapters/il/ cannot drift apart. ⛔ Southern Israel sits inside SAUDI_ARABIA_BBOX; the national resolver REFUSES Israeli points (Saudi polygon far), so this row survives and outranks the SA footprint on specificity.',
    },
    {
        regionCode: 'QA',
        countryName: 'Qatar',
        providerId: 'qa-gisqatar-cadastre-plots',
        label: 'Plots (Qatar · GIS Center CadastrePlots)',
        proxyPath: '/api/parcel/qa',
        kind: 'cadastral',
        contains: isInQatar,
        note: 'CadastrePlots ArcGIS MapServer layer 0 (services.gisqatar.org.qa) — keyless, VERIFIED-LIVE 2026-09-02 by this lane (query @ 51.531,25.286 → HTTP 200, PIN 1010028, CDST_KEY 1010028, PD_NO "PD/4693/2019", PDAREA 183494 m², GFCODE PDGVCDST, 137-vertex WGS84 ring; countryAdapters/qa/qaParcelProvider.ts carries the parser). The layer is HIDDEN from the Vector folder listing — enumerate the qmap webmap, not the folder (GetCapabilities≠inventory). LICENCE UNREAD (YELLOW): no licence on the REST endpoint; keyless≠licensed — read gisqatar.org.qa terms + MME open-data policy before prod. ⭐ WIRED server-side, and the "not yet wired" warning this replaces was STALE — it survived the commit that landed the leg. RE-PROVEN END TO END 2026-09-04 (lane PARCEL-REACH round 4) through https://pryzm.fly.dev/api/parcel/qa: HTTP 200 with a real WGS84 ring (Doha → PIN 1010028). ⛔ Qatar sits inside SAUDI_ARABIA_BBOX; the national resolver REFUSES Doha (Saudi polygon ~80 km away), so QA survives and outranks the SA footprint on specificity.',
    },
    // ══════════════════════════════════════════════════════════════════════════════════════
    // LANE ME-GULF (2026-09-02) — AE · KW · BH · OM, four DECLARED-DEFERRAL parcel jurisdictions
    // probed hard 2026-09-02, re-probed 2026-09-03 (UA PRYZM-Research/1.0). ⭐ Unlike the ME-OPEN
    // TR/IL/QA rows above (bbox `contains`, no boundary polygon), each Gulf COUNTRY IS added to the
    // national boundary set (nationalBoundaries.json, same pinned ne_10m source, sha 239eec57…), so
    // every `contains` below is `claimsNation(cc)` — the resolver CLAIMS the point. This FIXES a
    // latent mislabel: SAUDI_ARABIA_BBOX (lon 34.4..55.7) covers Dubai/Abu Dhabi/Kuwait/Bahrain, so
    // before this lane a click there matched ONLY the SA footprint row and was labelled Saudi (or,
    // near the border, nearest-polygon-annexed to Saudi — the Vaduz→CHE class L-12887 named). All
    // four rows are footprint-fallback: no keyless cadastre is reachable — the per-jurisdiction gate
    // transcript + reviewBy live in countryAdapters/gulf/gulfDeferrals.ts (GULF_DEFERRALS). This is
    // the LU/SE precedent (a modelled-but-DEFERRED country routed by claimsNation, not a fake client).
    // (QA is the ME-OPEN lane's keyless row above; Qatar is deliberately NOT in the boundary set here.)
    {
        regionCode: 'AE',
        countryName: 'United Arab Emirates',
        providerId: 'footprint',
        label: 'Building footprint (OSM)',
        proxyPath: null,
        kind: 'footprint-fallback',
        contains: claimsNation('AE'),
        note: 'UAE parcels are EMIRATE competency; both founder-named targets are DECLARED DEFERRALS (countryAdapters/gulf/gulfDeferrals.ts). DUBAI (AE-DU) — vantage-network-fence: Dubai Pulse / geodubai.dm.gov.ae / gis.dm.gov.ae TCP-timeout (~21 s, RC=28) from every foreign vantage (re-probed 2026-09-03; corporate www.dm.gov.ae answers 200 via Azure CDN), and NO official DM/DLD keyless parcel FeatureServer on AGOL (official org dubaimunicipalityitd exposes one op-layer-less "HQ" webmap; the rest are third-party demos — GetCapabilities≠inventory checked past the viewer). ABU DHABI (AE-AZ) — waf: data.abudhabi F5 "Request Rejected" on every machine path (data.json / DKAN search), DKAN metastore TCP-timeout, all five AD-SDI hosts NXDOMAIN; UAE-PASS credential class unmeasured. Routing is claimsNation("AE"): AE/KW/BH/OM were added to the national boundary set so Dubai/Abu Dhabi/Sharjah CLAIM AE instead of being mislabelled/annexed Saudi. Footprint fallback until an in-region proxy or an emirate account clears a gate. reviewBy 2027-03-02.',
    },
    {
        regionCode: 'KW',
        countryName: 'Kuwait',
        providerId: 'footprint',
        label: 'Building footprint (OSM)',
        proxyPath: null,
        kind: 'footprint-fallback',
        contains: claimsNation('KW'),
        note: 'Kuwait: DECLARED DEFERRAL (no-open-channel). PACI (the civil-information authority that owns Kuwait’s parcel/address layer) is TCP-unreachable at its portal hosts / schannel cert-expired / connection-reset from our vantage; the one responsive host exposes no ArcGIS REST surface at guessable paths (302→/error/404); mapapi/geoportal/data.paci.gov.kw are NXDOMAIN. No parcel/zoning/building channel proven either way — gate class unmeasurable from here. Routing is claimsNation("KW") (KUWAIT_BBOX sits inside SAUDI_ARABIA_BBOX; the claim stops a Kuwaiti click reading as Saudi). Re-probe from an in-GCC vantage. Transcript kw-bh-om.txt; reviewBy 2027-03-02 (countryAdapters/gulf/gulfDeferrals.ts).',
    },
    {
        regionCode: 'BH',
        countryName: 'Bahrain',
        providerId: 'footprint',
        label: 'Building footprint (OSM)',
        proxyPath: null,
        kind: 'footprint-fallback',
        contains: claimsNation('BH'),
        note: 'Bahrain: DECLARED DEFERRAL (ekey-identity). The SLRB (Survey & Land Registration Bureau) corporate site answers 200 and names cadastral services routed through the national eKey login; every guessable GIS hostname (bahrainmaps.bh, gisbahrain.bh, gis.slrb.gov.bh, bsdi.bh) is NXDOMAIN; the open-data portal data.gov.bh holds only STATISTICS tables (q=parcel → 4 hits, all subdivision-regulation tables, no geometry). Routing is claimsNation("BH") — an island state ~25 km off the Saudi coast (beyond the 2 km coastal tolerance, so a clean CLAIM, not a Saudi coastal-rescue annexation). Gate: SLRB e-services via national eKey (fee schedule unread). Transcript kw-bh-om.txt; reviewBy 2027-03-02.',
    },
    {
        regionCode: 'OM',
        countryName: 'Oman',
        providerId: 'footprint',
        label: 'Building footprint (OSM)',
        proxyPath: null,
        kind: 'footprint-fallback',
        contains: claimsNation('OM'),
        note: 'Oman: DECLARED DEFERRAL (no-open-channel / vantage). The NSDI host onsdi.ncsi.gov.om resolves but drops foreign TCP (all paths ~21 s timeout); the Ministry of Housing & Urban Planning (the krooki/plot-certificate authority) WAF-403s; nsdi.gov.om/geoportal.gov.om/maps.gov.om are NXDOMAIN; data.gov.om is statistics-only. No parcel/zoning/building channel measurable; gate class UNKNOWN (registration vs geo-fence). Routing is claimsNation("OM"); OMAN_BBOX overlaps UAE_BBOX at the shared border + Musandam by design (the pre-filter is inclusive, the polygon decides). Re-probe from an in-region vantage. Transcript kw-bh-om.txt; reviewBy 2027-03-02.',
    },
    {
        regionCode: 'SA',
        countryName: 'Saudi Arabia',
        providerId: 'footprint',
        label: 'Building footprint (OSM)',
        proxyPath: null,
        kind: 'footprint-fallback',
        contains: isInSaudiArabia,
        note: 'Saudi Arabia: DECLARED DEFERRAL. ⭐ L-606 DELTA — the fence CHANGED CLASS from IP/WAF geo-fence to ArcGIS token / Balady-SSO gate (re-probed 2026-09-02 & 2026-09-03): the ArcGIS Enterprise 11.5 root + portal now ANSWER a foreign IP (umaps.balady.gov.sa 301→umaps.momah.gov.sa; /server/rest/services → folders [Hosted,umaps,Utilities]; /portal/sharing/rest → enterpriseVersion 11.5.0), but every DATA folder returns {"error":{"code":499,"message":"Token Required"}} (stable x3) and the viewer authenticates against ssoapp.balady.gov.sa (Balady SSO / Nafath). So an in-SA proxy alone NO LONGER suffices — the gate is credential-class (Balady SSO / Nafath identity, or a MOMRAH data agreement). Rules for SA are already banked NATIONALLY (2024 MOMRAH decision); only parcels+zoning geometry are behind this gate → footprint fallback. Transcript audit/intl-parcels/2026-09-02/transcripts-me-gulf/saudi.txt; reviewBy 2027-03-02 (countryAdapters/gulf/gulfDeferrals.ts). (⚠ contains stays the legacy isInSaudiArabia bbox — SAU is already in the national boundary set so resolveParcelCandidates filters it correctly; not migrated to claimsNation in this lane to keep the pre-existing row minimal.)',
    },
];

/** The universal fallback verdict — no country matched, so select the OSM footprint. */
export const UNIVERSAL_FOOTPRINT_JURISDICTION: ParcelJurisdiction = {
    regionCode: '??',
    countryName: 'Unknown',
    providerId: 'footprint',
    label: 'Building footprint (OSM)',
    proxyPath: null,
    kind: 'footprint-fallback',
    contains: () => true,
    note: 'No cadastral provider covers this point — the OSM building footprint gives Spain-parity "click to select" everywhere, labelled as a footprint, never as a legal parcel.',
};

/**
 * SPECIFICITY — the degree² area of a jurisdiction's coarse routing bbox (the row's own box, keyed
 * by `regionCode` so the two `footprint` rows — DE / SA — stay distinct). SMALLER = more specific =
 * higher priority. Derived from the bbox constants each provider already exports; NEVER a hand-kept
 * order. The exclusion holes (Åland, Trentino) shrink the effective territory but not the outer box,
 * which is exactly the right relative signal for "the smallest enclosing box wins". The universal
 * fallback (and any unmapped region) sorts LAST (`+Infinity`).
 */
interface RectBbox {
    readonly minLat: number;
    readonly maxLat: number;
    readonly minLon: number;
    readonly maxLon: number;
}
const REGION_BBOX: Readonly<Record<string, RectBbox>> = {
    ES: SPAIN_BBOX,
    FR: FRANCE_BBOX,
    NL: NETHERLANDS_BBOX,
    NO: NORWAY_BBOX,
    'DE-NW': NRW_BBOX,
    DE: GERMANY_BBOX,
    CH: SWITZERLAND_BBOX,
    DK: DENMARK_BBOX,
    SA: SAUDI_ARABIA_BBOX,
    // LANE PARCEL-REACH (2026-09-04). These three rows route on their RECTANGLE (CZE/AUT are
    // refusal-only neighbours, so claimsNation would never fire), which makes specificity a
    // REAL order here: CZECHIA_BBOX ~17.9 deg2 beats GERMANY_BBOX ~72.4 deg2 at Praha, and
    // IRELAND_BBOX ~21.7 deg2 beats ENGLAND_BBOX ~51.2 deg2 at Dublin. That is exactly how the
    // two measured mislabels (Praha->DE, Dublin->GB-ENG) are corrected without touching order.
    // LANE PARCEL-REACH (2026-09-04) — the 14 German Länder. SPREAD rather than listed one by
    // one, so a box added to DE_LAND_BBOX can never arrive here missing: a row absent from this
    // map scores +Infinity and sorts LAST, which for Berlin/Hamburg/Bremen would silently hand
    // the city-state's points to the Land whose box encloses it.
    ...DE_LAND_BBOX,
    CZ: CZECHIA_BBOX,
    IE: IRELAND_BBOX,
    AT: AUSTRIA_BBOX,
    IT: ITALY_BBOX,
    'BE-VLG': FLANDERS_BBOX,
    'GB-ENG': ENGLAND_BBOX,
    FI: FINLAND_BBOX,
    'US-NY-NYC': NYC_BBOX,
    // L-651 Phase-5 batch. ⚠ A row MISSING from this map scores +Infinity and therefore sorts LAST
    // among its candidates — which for an enclave like Brussels would silently hand its points to the
    // enclosing Flanders row and undo the whole point of registering it. Every new row needs an entry
    // here; `parcelRegistryWiring.test.ts` asserts that invariant for ALL rows so it cannot regress.
    PT: PORTUGAL_BBOX,
    'BE-BRU': BRUSSELS_BBOX,
    'BE-WAL': WALLONIA_BBOX,
    'GB-SCT': SCOTLAND_BBOX,
    'US-CA-SF': SF_BBOX,
    'US-IL-CHI': CHICAGO_BBOX,
    // LANE US-EXPAND (2026-09-03) — `contains` IS the rectangle for these four (the US is absent from
    // the national resolver), so specificity is a real order: no US box overlaps another, so each is
    // the sole candidate at its own points and the metric only guarantees a finite (never +Infinity)
    // rank. MA/FL are statewide boxes; WA-KING/TX-HARRIS are county boxes.
    'US-MA': US_MA_BBOX,
    'US-FL': US_FL_BBOX,
    'US-WA-KING': US_WA_KING_BBOX,
    'US-TX-HARRIS': US_TX_HARRIS_BBOX,
    // LANE USA-PARCELS (2026-09-06) — seven states + two counties. `contains` IS the rectangle for
    // all nine. TWO overlaps exist and both are ordered correctly BY AREA, which is why every one of
    // these needs its entry here (a missing row scores +Infinity and sorts LAST):
    //   • US-VA (≈25.0 deg²) vs US-NC (≈25.4 deg²) in the 36.54–36.59°N border strip — VA is
    //     fractionally smaller so it is tried first there; the NC parcels layer answers `empty` for a
    //     Virginia point and vice versa, so the fall-through self-corrects.
    //   • US-OH (≈17.0 deg²) vs US-VA in the lat 38.39–39.47 × lon -83.68–-80.51 band, which is
    //     entirely WEST VIRGINIA and eastern Kentucky — neither service covers it, both answer
    //     `empty`, and the click falls to the OSM footprint, which is the correct answer there.
    // US-NY also encloses US-NY-NYC (≈0.16 deg²), so MapPLUTO keeps New York City on specificity —
    // deliberate: MapPLUTO carries ZoneDist1/ResidFAR that the statewide tax-parcel layer does not.
    'US-NC': US_NC_BBOX,
    'US-NY': US_NY_BBOX,
    'US-OH': US_OH_BBOX,
    'US-WI': US_WI_BBOX,
    'US-MT': US_MT_BBOX,
    'US-UT': US_UT_BBOX,
    'US-VA': US_VA_BBOX,
    'US-CA-LA': US_CA_LA_BBOX,
    'US-AZ-MARICOPA': US_AZ_MARICOPA_BBOX,
    // Lane USA-PARCELS wave 2 (2026-09-06). Every one of these is SMALLER than the row it overlaps
    // (NJ/VT/CT inside US-NY; CT under MA's overhang; MD vs US-VA; IN vs US-OH on a 0.05° strip), so
    // specificity puts each state ahead on its own soil and the enclosing row stays the fall-through.
    'US-NJ': US_NJ_BBOX,
    'US-VT': US_VT_BBOX,
    'US-CT': US_CT_BBOX,
    'US-IN': US_IN_BBOX,
    'US-MD': US_MD_BBOX,
    // L-12871 batch (2026-09-02). ⚠ These bboxes are the rows' SPECIFICITY metric only — the
    // rows' `contains` is `claimsNation`, never the rectangle. Since the national filter in
    // `resolveParcelCandidates` keeps at most one country on a claim, specificity now orders
    // only SUB-NATIONAL rows within that country; these five have none, but every row still
    // needs a finite entry (a missing row scores +Infinity and sorts last — see the note above).
    EE: ESTONIA_BBOX,
    HR: CROATIA_BBOX, // lane HR — specificity metric only; the row's `contains` is claimsNation('HR'), never this box
    LT: LITHUANIA_BBOX,
    PL: POLAND_BBOX,
    LU: LUXEMBOURG_BBOX,
    SE: SWEDEN_BBOX,
    // LANE SI (2026-09-03) — specificity metric only for the Slovenia row (LIVE since the
    // 2026-09-03 boundary wave promoted SVN to a claimable country); the row routes on claimsNation('SI'). Overlaps ITALY_BBOX (the Trieste/Gorizia band), which is exactly why
    // routing is by boundary geometry, not this rectangle.
    SI: SLOVENIA_BBOX,
    // LANE HU (2026-09-03) — specificity metric only for the DORMANT Hungary row; the row routes on
    // claimsNation('HU'), which is false until HUN is a CLAIMABLE country (since the 2026-09-03
    // boundary wave HUN is a refusal-only NEIGHBOUR — Hungarian points now refuse BY NAME, but a
    // neighbour can never be claimed; barrel-additions-hu.txt Section B still names the promotion).
    HU: HUNGARY_BBOX,
    // LANE LV — specificity metric for the Latvia row (LIVE since the 2026-09-03 boundary wave
    // promoted LVA to a claimable country); never a router (claimsNation('LV') decides). Overlaps
    // EE/LT/SE boxes, which is exactly why routing is by boundary geometry, not this rectangle.
    LV: LATVIA_BBOX,
    // LANE RO — specificity metric for the DORMANT Romania row; never a router (claimsNation('RO')
    // decides, and is false until ROU enters the resolver). No existing box overlaps ROMANIA_BBOX.
    RO: ROMANIA_BBOX,
    // LANE GR (2026-09-03). Specificity-metric entry only — the row's `contains` is
    // claimsNation('GR') (LIVE since the 2026-09-03 boundary wave added GRC as claimable). No existing box overlaps GREECE_BBOX
    // in a way that matters, since the national filter decides and the box never asserts sovereignty.
    GR: GREECE_BBOX,
    // LANE BG (2026-09-03). Specificity-metric entry only — the row's `contains` is claimsNation('BG')
    // (LIVE since the 2026-09-03 boundary wave added BGR as claimable). No registered parcel box asserts sovereignty over BG
    // points; the box never routes, it only guarantees a finite (never +Infinity) specificity rank.
    BG: BULGARIA_BBOX,
    // LANE SK (2026-09-03). Specificity-metric entry only — the row's `contains` is claimsNation('SK')
    // (LIVE since the 2026-09-03 boundary wave PROMOTED SVK to a claimable country). No registered
    // parcel box overlaps SLOVAKIA_BBOX in a way that matters; the national filter decides.
    SK: SLOVAKIA_BBOX,
    // LANE AU-OPEN (2026-09-03) — the eight Australian state/territory boxes. `contains` IS the
    // rectangle here (not claimsNation), so specificity is the real within-Australia order: the
    // enclaved ACT box is smallest → wins Canberra ahead of NSW, and shared-border bands
    // (NSW∩VIC on the Murray, the Cameron-Corner quad-point) self-correct on service-null.
    'AU-ACT': AU_ACT_BBOX,
    'AU-TAS': AU_TAS_BBOX,
    'AU-VIC': AU_VIC_BBOX,
    'AU-NSW': AU_NSW_BBOX,
    'AU-SA': AU_SA_BBOX,
    'AU-QLD': AU_QLD_BBOX,
    'AU-WA': AU_WA_BBOX,
    'AU-NT': AU_NT_BBOX,
    // LANE ME-OPEN (2026-09-03) — TR · IL · QA. `contains` IS the rectangle (SA idiom, not
    // claimsNation), so specificity is the real order where boxes overlap: QATAR_BBOX (≈1.9 deg²)
    // and ISRAEL_BBOX (≈6.5 deg²) both sit inside SAUDI_ARABIA_BBOX (≈340 deg²) and therefore win
    // Doha / Tel Aviv ahead of the SA footprint; TURKEY_BBOX overlaps nothing. Every row needs a
    // finite entry (a missing one scores +Infinity and sorts last — parcelRegistryWiring asserts it).
    TR: TURKEY_BBOX,
    IL: ISRAEL_BBOX,
    QA: QATAR_BBOX,
    // LANE NZ-EVERYWHERE (2026-09-05) — `contains` IS the rectangle (TR/AU idiom). NEW_ZEALAND_BBOX
    // (≈168 deg²) overlaps NO registered box — the nearest is AU-NSW/AU-QLD at 153.7 E, ~12° of
    // Tasman Sea west of it — so this entry only guarantees a finite specificity rank.
    NZ: NEW_ZEALAND_BBOX,
    // LANE ME-GULF (2026-09-02). These are the rows' SPECIFICITY metric only — the rows' `contains`
    // is `claimsNation`, never the rectangle. Since the national filter keeps at most one country on
    // a claim, area orders only within a claim / on the refusal-fall-through path. Each still needs a
    // finite entry (a missing row scores +Infinity and sorts last — parcelRegistryWiring asserts it).
    AE: UAE_BBOX,
    KW: KUWAIT_BBOX,
    BH: BAHRAIN_BBOX,
    OM: OMAN_BBOX,
};

/**
 * The routing-bbox area (degree²) of a jurisdiction — its specificity metric.
 *
 * ⛔ SCOPE CORRECTED 2026-09-02 (L-12871): this used to be the whole tiebreak ("smaller = wins
 * first") and that rule is what routed Polish Suwałki to Lithuania and the German Oder bank to
 * Poland. Since the national filter in `resolveParcelCandidates`, area orders candidates ONLY
 * (a) WITHIN one claimed country (DE-NW before DE, BE-BRU before BE-VLG) and (b) on the
 * NATIONAL-REFUSAL fall-through path. It never decides between countries on a claim.
 */
export function parcelJurisdictionSpecificity(jur: ParcelJurisdiction): number {
    const b = REGION_BBOX[jur.regionCode];
    if (!b) return Number.POSITIVE_INFINITY;
    return (b.maxLat - b.minLat) * (b.maxLon - b.minLon);
}

/**
 * Every jurisdiction offered at the point, ordered for the priority-fallback walk. PURE + never
 * throws; a non-finite / unmatched point yields `[]`.
 *
 * ⛔ L-12871 (2026-09-02): THE NATIONAL DECIDER IS `resolveNationalJurisdiction`, NOT BOX AREA.
 *   1. Each row's own `contains` matches (bbox for the pre-existing rows, `claimsNation` for the
 *      L-12871 batch).
 *   2. When the national resolver CLAIMS a country, the candidate set is FILTERED to that
 *      country's rows alone — Tallinn stops offering Kartverket, Flensburg stops offering
 *      Matriklen, Luxembourg City stops offering Wallonia, Kirkenes stops offering MML. A wrong-
 *      country cadastre was previously "self-correcting on null", but a candidate that can only
 *      waste a round-trip and can never be right is noise, and for a LIVE wrong-country cadastre
 *      it is not even self-correcting at the border.
 *   3. When it REFUSES (border band, un-modelled neighbour, open sea) the full matched set
 *      survives in specificity order — the established per-cadastre-null fall-through decides,
 *      exactly as the refusal contract requires (a refusal ≠ a dead click).
 *
 * ⚠ THE SPECIFICITY SORT SURVIVES ONLY AS THE *WITHIN-COUNTRY* ORDER (DE-NW before DE; BE-BRU
 * before BE-VLG) and as the refusal-path fallback order. It never decides BETWEEN countries on a
 * claim any more — a smaller box is not a stronger claim to sovereignty, which is the whole of
 * L-12871 (LITHUANIA_BBOX < POLAND_BBOX would hand Polish Suwałki to the Lithuanian cadastre).
 */
export function resolveParcelCandidates(lat: number, lon: number): readonly ParcelJurisdiction[] {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
    const matches: ParcelJurisdiction[] = [];
    for (const j of PARCEL_JURISDICTIONS) {
        if (j.contains(lat, lon)) matches.push(j);
    }
    const verdict = nationalVerdictAt(lat, lon);
    let pool = matches;
    if (verdict.ok) {
        const own = matches.filter((j) => countryOfRegionCode(j.regionCode) === verdict.regionCode);
        // Defensive: a claim for a country with NO matching row (unreachable for the 16 modelled
        // countries today — each has a registered row) degrades to the refusal behaviour rather
        // than to an empty dead click.
        if (own.length > 0) pool = own;
    }
    return pool.sort((a, b) => {
        const d = parcelJurisdictionSpecificity(a) - parcelJurisdictionSpecificity(b);
        if (d !== 0) return d;
        // Deterministic tie-break: earlier registration wins (never a coin-flip on equal areas).
        return PARCEL_JURISDICTIONS.indexOf(a) - PARCEL_JURISDICTIONS.indexOf(b);
    });
}

/**
 * Route a WGS84 click-point to a SINGLE primary parcel jurisdiction, or the universal OSM footprint
 * when nothing matches. NEVER throws and ALWAYS returns a verdict, so a click is never dead
 * (C58 §1.4). This is the COVERAGE / LABELLING verdict — what the UI names as the register a click
 * belongs to.
 *
 * ⭐ IT IS NOW THE HEAD OF `resolveParcelCandidates`, NOT A SECOND ALGORITHM (lane PARCEL-REACH,
 * 2026-09-04). It used to walk PARCEL_JURISDICTIONS in REGISTRATION ORDER and return the first
 * `contains` match — consulting NEITHER specificity NOR the national verdict. So it could, and did,
 * disagree with the path that actually fetches the parcel: the click resolved from one register
 * while the LABEL named another. Measured before this change (2026-09-04):
 *   • Köln  → `FR`  — Köln (50.94, 6.96) sits inside FRANCE_BBOX, and the FR row is registered
 *                     before DE-NW, so a German click has been labelled FRANCE. Pre-existing.
 *   • München → `AT` — surfaced the moment AUSTRIA_BBOX was added: München is inside it, while the
 *                     national verdict claims DEU and the candidate list correctly held only DE.
 *   • Praha → `DE`, Dublin → `GB-ENG` — the two this lane set out to fix, which stayed wrong even
 *                     after the CZ/IE rows sorted FIRST as candidates.
 * Deriving it from the candidate list makes label and click agree BY CONSTRUCTION: the candidate
 * head is nationally filtered and specificity-ordered, so it is the register that will actually be
 * tried first. A verdict that can contradict the fetch is worse than a coarse one — it is a
 * confident falsehood about which sovereign register answers for the user's land (C58 §1.4).
 *
 * ⚠ Still a SINGLE verdict, and overlapping boxes remain coarse where the national resolver
 * REFUSES (border bands, and any country modelled only as a refusal-only neighbour). Callers doing
 * the real fetch MUST use `resolveParcelWithFallback`, which walks every candidate and falls
 * THROUGH on a miss.
 */
export function resolveParcelJurisdiction(lat: number, lon: number): ParcelJurisdiction {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return UNIVERSAL_FOOTPRINT_JURISDICTION;
    return resolveParcelCandidates(lat, lon)[0] ?? UNIVERSAL_FOOTPRINT_JURISDICTION;
}

/** A successful priority-fallback resolution: the parcel and the jurisdiction whose provider yielded it. */
export interface ParcelFallbackHit<T> {
    readonly jurisdiction: ParcelJurisdiction;
    readonly parcel: T;
}

/**
 * PER-POINT PRIORITY-FALLBACK dispatch — the L-650 border-regression fix. Walks the point's
 * candidates most-specific first (`resolveParcelCandidates`) and calls the injected per-jurisdiction
 * `fetchFor` on each, returning the FIRST non-null parcel together with its jurisdiction. Falls
 * THROUGH to the next candidate whenever a provider returns null / no-parcel / an unreachable proxy
 * (or throws — swallowed, never propagated), so a proxy-pending NEW provider transparently yields to
 * the enclosing LIVE cadastre (Eindhoven BE→NL, Kirkenes FI→NO, Calais GB→FR). Returns `null` when
 * every candidate yields nothing — the caller then applies its universal footprint fallback.
 *
 * The impure fetch is INJECTED (`fetchFor`) so this stays pure of network I/O and unit-testable; the
 * editor passes a callback that hits each jurisdiction's same-origin cadastre proxy. NEVER throws.
 * P8 span: `pryzm.parcel.resolveParcelWithFallback`.
 */
export async function resolveParcelWithFallback<T>(
    lat: number,
    lon: number,
    fetchFor: (jurisdiction: ParcelJurisdiction) => Promise<T | null> | T | null,
): Promise<ParcelFallbackHit<T> | null> {
    const span = _tracer.startSpan('pryzm.parcel.resolveParcelWithFallback');
    try {
        const candidates = resolveParcelCandidates(lat, lon);
        span.setAttribute('pryzm.parcel.lat', Number.isFinite(lat) ? lat : Number.NaN);
        span.setAttribute('pryzm.parcel.lon', Number.isFinite(lon) ? lon : Number.NaN);
        span.setAttribute('pryzm.parcel.candidateCount', candidates.length);
        span.setAttribute(
            'pryzm.parcel.candidates',
            candidates.map((c) => c.providerId).join(','),
        );
        for (const jurisdiction of candidates) {
            let parcel: T | null = null;
            try {
                parcel = await fetchFor(jurisdiction);
            } catch (err) {
                // A provider that throws is treated as a miss — fall through, never propagate.
                console.warn(
                    `[parcel-registry] ${jurisdiction.providerId} threw (non-fatal) — falling through:`,
                    (err as Error)?.message ?? err,
                );
                parcel = null;
            }
            if (parcel != null) {
                span.setAttribute('pryzm.parcel.hit', true);
                span.setAttribute('pryzm.parcel.resolvedBy', jurisdiction.providerId);
                span.setAttribute('pryzm.parcel.region', jurisdiction.regionCode);
                span.setStatus({ code: SpanStatusCode.OK });
                return { jurisdiction, parcel };
            }
        }
        span.setAttribute('pryzm.parcel.hit', false);
        span.setStatus({ code: SpanStatusCode.OK });
        return null;
    } catch (err) {
        // Defensive: the whole path is best-effort — never throw into the caller.
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        return null;
    } finally {
        span.end();
    }
}

/** Every registered parcel jurisdiction — read by the coverage doc / a future coverage globe. */
export function listParcelJurisdictions(): readonly ParcelJurisdiction[] {
    return PARCEL_JURISDICTIONS;
}
