// L-550 / Phase 0.1 — THE RULE-PACK REGISTRY.
//
// WHAT IT REPLACES
// ----------------
// `apps/editor/src/ui/site/siteDispatch.ts` gated the whole real-envelope path on a literal:
//
//     const eixampleCodes = BCN_ENSANCHE_ZONE_CODES as readonly string[];
//     if (!qual || !eixampleCodes.includes(qual.clau)) { …estimated fallback… }
//
// So EVERY new clau — and every new city — required an edit to an L5 editor file, and the
// editor had to know which pack answers for which zone code. That is jurisdiction knowledge
// living above the data layer, which C58 §1.5 exists to forbid ("adding DK/ES is a new pack,
// never an engine edit" — the same argument applies one layer up, to the dispatcher).
//
// The registry inverts it: the editor asks *"what is the disposition of this zone?"* and gets one
// of three answers. Adding clau 13b, or Madrid, becomes a DATA ADDITION in this package.
//
// WHY THREE OUTCOMES AND NOT TWO
// ------------------------------
// The tempting shape is `pack | null`. It cannot express the distinction Phase 1b is entirely
// about: **"the ordinance grants no envelope here" and "we have not encoded this zone yet" are
// opposite claims.** A boolean collapses them, and the collapse is what put a fabricated setback
// triple on Collserola. So:
//
//   • `pack`         — a curated pack answers for this zone. Solve it.
//   • `refusal`      — the ordinance answers, and its answer is "no private buildable envelope".
//                      Dispatch a cited refusal. A POSITIVE result.
//   • `unregistered` — PRYZM has no pack for a zone that IS privately buildable. Keep today's
//                      behaviour (the estimated fallback, which honestly badges every value as
//                      ESTIMATED). ⚠ Deliberately NOT a refusal: refusing here would tell the
//                      user the law forbids building on their perfectly buildable plot.
//
// ⚠ PRECEDENCE, AND WHY IT IS THIS WAY ROUND: a registered PACK BEATS a refusal classification.
// If a future pack is authored for a clau this table currently refuses, the pack is the more
// specific, more researched statement and must win — and the mistake (a clau both refused and
// packed) then surfaces as a working envelope rather than as a silent denial. A silent denial is
// the harder bug to notice, so precedence points away from it.
//
// PURITY: L2-pure. Data + a lookup. No I/O.
//
// Strategic context — BARCELONA-COMPLETE-COVERAGE-PLAN.md §5 Phase 0.1, C58 §1.5, ADR-0272.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// §JURISDICTION-SPECIFICITY (L-652) — WHICH REGISTRATION GOVERNS A POINT TWO OF THEM CLAIM.
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// THE DEFECT THIS SECTION CLOSES. `listJurisdictionCoverage()` used to be consumed by a
// FIRST-MATCH lookup (`jurisdictionAt` in `siteEntryModel.ts`), and `REGISTRATIONS` happens to
// list Barcelona first. `BARCELONA_BBOX` is a LOOSE METROPOLITAN proximity gate (its own module
// says so) and it FULLY CONTAINS the boxes of L'Hospitalet, Badalona, Sant Boi and Cornellà. So
// every point in those four municipalities resolved to `es-08019-barcelona` — the coverage globe
// answered another municipality's land with Barcelona's packed numbers and Barcelona's citations,
// which is the exact mis-citation each of those four registrations was created to prevent. Their
// own comments say they are "peeled off before `isInBarcelona`"; that intent existed ONLY in the
// L5 dispatcher's hand-ordered `if` chain and had NO expression here at all. A wrong-jurisdiction
// answer is worse than no answer: it is a confident number attributed to the wrong law.
//
// THE RULE CHOSEN: **the claim with the FINEST DECLARED EXTENT RESOLUTION wins; an unbroken tie
// is an AMBIGUITY and is refused, never resolved.** Each registration declares
// `extentResolution` — `district` ≺ `municipal` ≺ `metropolitan` ≺ `national` — a statement about
// WHAT ITS OWN BOX IS, made on the same object as the box. `resolveJurisdictionClaim()` applies it
// once, for every registration, everywhere.
//
// WHY THIS AND NOT THE ALTERNATIVES (all of which were considered and rejected):
//
//   ✗ ROW ORDER. "List the specific one first" is what the dispatcher does today, and it is why
//     this bug existed: the ordering is invisible to any other consumer, and a registration
//     APPENDED at the bottom (the natural way to add a city) is silently the LOWEST priority —
//     exactly backwards, since a new registration is usually the more specific one.
//
//   ✗ SMALLEST-BBOX-WINS (the L-650 rule used by `parcelProviders/registry.ts`). It would give
//     the right answer for all four AMB pairs today, and it is still WRONG AS A RULE, for two
//     reasons this repo already has a live counter-example for. (1) It is KIND-BLIND:
//     `SCOTLAND_BBOX` ≈ 50.4 deg² is FRACTIONALLY SMALLER than `ENGLAND_BBOX` ≈ 51.2 deg², so on
//     the parcel side Scotland already outranks England across the whole 54.6–55.9°N border band —
//     inert only because that row is a proxy-less `footprint-fallback`. (2) It reads a
//     0.8-deg² measurement difference as a legal precedence claim, which it is not: two boxes of
//     similar size carry no information about which ordinance governs. Area is a proxy for
//     specificity; `extentResolution` IS specificity, declared by the party that knows.
//     ⚠ The parcel registry legitimately keeps the area rule: it resolves by WALKING every
//     candidate and falling through on a miss, so a mis-rank there costs one wasted fetch. Here
//     there is no walk — the verdict IS the answer — so the rule must be right the first time.
//
//   ✗ PEELING THE MUNICIPALITIES OUT OF `isInBarcelona`. Non-overlapping predicates would make
//     first-match safe, but it inverts the dependency (the metropolitan gate would import its four
//     neighbours) and it re-introduces the SECOND EDIT that C60 §2 exists to forbid: registering a
//     6th AMB city would require editing `barcelonaBbox.ts` too, and forgetting is silent.
//
//   ✗ REAL POLYGON EXTENTS. Correct in principle and the only thing that would also fix the
//     §EXTENT-SPILLS-A-BORDER limitation below — but PRYZM holds no municipal or national boundary
//     geometry, and inventing one is the fabrication this whole subsystem exists to refuse.
//
// ⚠ WIRING-TODO (owner: whoever next touches `siteDispatch.ts`) — THE ORDERING IS STILL STATED
// TWICE. The L5 dispatcher routes a committed parcel through a hand-ordered `if` chain
// (`isInLHospitalet` … before `isInBarcelona`), which today reaches the SAME verdict this rule
// does — `jurisdictionSpecificity.test.ts` asserts the four AMB points resolve to their own
// municipality, which is exactly what that chain produces. But two statements of one rule can
// drift, and only one of them is derived. The chain should become
// `resolveRegisteredJurisdictionAt(lat, lon)` + a switch on the resolved id, so registering a city
// stops requiring an edit to an L5 file at all (the same argument C58 §1.5 makes about packs, one
// layer up). Deliberately NOT done in this pass: it is a large diff in a file this change does not
// own, and correctness here does not depend on it.
//
// ⚠ §EXTENT-SPILLS-A-BORDER — A MEASURED, UNFIXED LIMITATION, RECORDED HERE SO IT IS NOT
// MISTAKEN FOR SOLVED. A rectangle cannot follow a national border, so the three NATIONAL
// registrations claim real foreign land: `NETHERLANDS_BBOX` claims Brussels, Antwerp, Düsseldorf
// and Cologne; `DENMARK_BBOX` claims Malmö, Gothenburg and Flensburg; `SWITZERLAND_BBOX` claims
// Como, Vaduz, Annecy and Konstanz. A click there is answered with the WRONG COUNTRY'S
// instrument (no number is drawn — the NL/DK/CH paths refuse — so it is a wrong CITATION rather
// than a fabricated value, but it is the same class). **The rule below cannot fix it**: there is
// no registered Belgian/German/Swedish/Italian jurisdiction to out-rank the national claim, and
// rectangle-minus-rectangle cannot separate the neighbours (`GERMANY_BBOX` alone swallows the
// eastern third of the Netherlands). The fix is a DATA addition — register the neighbour, and
// this rule resolves it with no engine edit — which `jurisdictionSpecificity.test.ts` proves with
// a synthetic Belgian claim so the closing move is pinned rather than described.

import { trace, SpanStatusCode } from '@opentelemetry/api';
import type { JurisdictionZoningContract, EnvelopeRefusal } from '@pryzm/schemas';
import { ES_BARCELONA_ENSANCHE_PACK, BCN_ENSANCHE_ZONE_CODES } from './esBarcelonaEnsanche.js';
import {
    ES_BARCELONA_NUCLI_ANTIC_PACK,
    BCN_NUCLI_ANTIC_ZONE_CODES,
} from './esBarcelonaNucliAntic.js';
import {
    ES_BARCELONA_SEMIINTENSIVA_PACK,
    BCN_SEMIINTENSIVA_ZONE_CODES,
} from './esBarcelonaSemiintensiva.js';
import {
    ES_BARCELONA_20A_AILLADA_PACK,
    BCN_20A_AILLADA_ZONE_CODES,
} from './esBarcelona20aAillada.js';
import {
    barcelonaZoneRefusalFor,
    barcelonaNoRulePackRefusal,
} from './esBarcelonaZoneClassification.js';
import { BARCELONA_BBOX, isInBarcelona } from '../providers/barcelonaBbox.js';
// L-606 — the Saudi/Riyadh DEMO pack + its coarse city gate.
import {
    SA_RIYADH_DEMO_PACK,
    SA_RIYADH_ZONE_CODES,
    SA_RIYADH_JURISDICTION_ID,
} from './saRiyadhDemo.js';
import { RIYADH_BBOX, isInRiyadh } from '../providers/riyadhBbox.js';
// L-608 — Madrid (INE 28079). NZ 1 stays a live-resolved `explicit-area` DECLARATION (its buildable
// footprint is published as geometry, not as parameters), so it is NOT in `packsByZone`; its refusal
// is the coverage answer for the `1.*` codes.
import {
    MADRID_JURISDICTION_ID,
    MADRID_NZ1_CODE_PREFIX,
    madridNZ1Refusal,
} from './esMadridNZ1.js';
// §MADRID-PGOUM97-WIRING — the PGOUM-97 Título 8 pack (Normas Zonales 4/5/7/8/9, 23 of the 34 live
// `AMB_TX_ETIQ` codes) + the NZ 3 legally-grounded refusal + the coverage gap for anything else.
// ⚠ REGISTERING IT DOES NOT RENDER A NUMBER. Every value in it is MACHINE-EXTRACTED from the
// Compendio 2025 and `pipeline-extracted-unverified`; the dispatcher's `MADRID_ENVELOPE_VERIFIED`
// gate is FALSE, so a Madrid parcel in one of these 23 zones receives a cited
// "machine-extracted, unverified" refusal, exactly as Córdoba's does. This registration exists so
// the C60 coverage globe, `resolveZoneDisposition` and the dispatcher share ONE source of truth.
import {
    ES_MADRID_PGOUM97_PACK,
    MADRID_PGOUM97_ZONE_CODES,
    MADRID_NZ3_ZONE_CODES,
    madridNZ3Refusal,
    madridUnknownZoneRefusal,
} from './esMadridPgoum97.js';
import { MADRID_BBOX, isInMadrid } from '../providers/madridBbox.js';
// ── Córdoba (INE 14021) PGOU-2001 — the 2-district pilot pack, machine-extracted + UNVERIFIED. ──
// ⚠ Registering it does NOT render a number: the dispatcher's VERIFICATION GATE
// (`CORDOBA_ENVELOPE_VERIFIED`) refuses every Córdoba parcel until `sources/VERIFICATION.md` is
// signed. This registration exists so the coverage globe (C60 §2) and the future subzone resolver
// have one source of truth; the refusal functions below are what a Córdoba parcel actually gets.
import {
    ES_CORDOBA_PGOU2001_PACK,
    CORDOBA_PGOU2001_ZONE_CODES,
    CORDOBA_JURISDICTION_ID,
} from './esCordobaPGOU2001.js';
import {
    cordobaZoneRefusalFor,
    cordobaNoRulePackRefusal,
    cordobaOutsidePilotRefusal,
    CORDOBA_MUNICIPAL_JURISDICTION_ID,
    CORDOBA_MUNICIPAL_ROADMAP_LINE,
} from './esCordobaZoneClassification.js';
import {
    CORDOBA_BBOX,
    isInCordoba,
    CORDOBA_MUNICIPAL_BBOX,
    isInCordobaMunicipality,
} from '../providers/cordobaBbox.js';
// ── SWITZERLAND (national) — Outcome-B zone-ID jurisdiction. Registered as a REFUSAL jurisdiction:
// the national WFS publishes the zone identity (resolved LIVE by the dispatcher's `resolveChZone`),
// but density/height are model+PDF-bound, so the buildable envelope refuses. `packsByZone` is empty;
// `noRulePackRefusal` returns the Swiss cited refusal. The extent lights the C60 coverage globe.
import { CH_JURISDICTION_ID, chZoningEnvelopeRefusal } from './chZoning.js';
import { SWITZERLAND_BBOX, isInSwitzerland } from '../providers/switzerlandBbox.js';
// ── Envelope Phase 2 — L'Hospitalet de Llobregat (INE 08101), the SECOND Catalan municipality. ──
// Registered as a REFUSAL jurisdiction, ON PURPOSE. L'Hospitalet shares Barcelona's metropolitan
// instrument (PGM-1976) and its clau source (the Catalan MUC), so it is ROUTED and its parcels
// resolve a zone — but PRYZM has NOT verified that any clau's numbers/geometry equal Barcelona's,
// so `packsByZone` is empty and `noRulePackRefusal` returns the cited unverified refusal for every
// parcel while `LHOSPITALET_ENVELOPE_VERIFIED` is false. The extent lights the C60 coverage globe
// (we DO answer here — with an honest refusal). See `esLHospitalet.ts` on why Barcelona's packs are
// NOT reused verbatim (mis-citation on another municipality's land).
import {
    LHOSPITALET_JURISDICTION_ID,
    lhospitaletUnverifiedRefusal,
} from './esLHospitalet.js';
import { LHOSPITALET_BBOX, isInLHospitalet } from '../providers/lhospitaletBbox.js';
// Badalona (INE 08015) — 3rd Catalan city, same refusal-jurisdiction pattern as L'Hospitalet.
import {
    BADALONA_JURISDICTION_ID,
    badalonaUnverifiedRefusal,
} from './esBadalona.js';
import { BADALONA_BBOX, isInBadalona } from '../providers/badalonaBbox.js';
// Sant Boi de Llobregat (INE 08200) — 4th Catalan city, same refusal-jurisdiction pattern as Badalona.
import {
    SANT_BOI_JURISDICTION_ID,
    santBoiUnverifiedRefusal,
} from './esSantBoi.js';
import { SANT_BOI_BBOX, isInSantBoi } from '../providers/santBoiBbox.js';
// Cornellà de Llobregat (INE 08073) — 5th Catalan city, same refusal-jurisdiction pattern as Sant Boi.
import {
    CORNELLA_JURISDICTION_ID,
    cornellaUnverifiedRefusal,
} from './esCornella.js';
import { CORNELLA_BBOX, isInCornella } from '../providers/cornellaBbox.js';
// ── Murcia (INE 30030), Región de Murcia — NOT Catalonia, NOT the AMB, NOT the PGM. ──
// A REFUSAL jurisdiction on its own regional footing: its instrument is the PGOU de Murcia and its
// AMBITO/land identity is read LIVE per parcel from the MUNICIPAL GeoServer
// (`Murcia:pgou_alineaciones` / `Murcia:pgou_sectores`) by the L5 dispatch.
//
// ⚠ `packsByZone` IS NO LONGER EMPTY (§MURCIA-PACK-REGISTERED). The PGOU *Normas Urbanísticas*
// (Texto Refundido diciembre 2012) has been sourced and transcribed — 14 calificaciones, each
// parameter carrying its article and a verbatim quote — so the pack is now REACHABLE from the
// registry. It is NOT AUTHORISED: `MURCIA_ENVELOPE_VERIFIED` is `false` and the L5 Murcia path
// refuses every parcel before `resolveZoneDisposition` is ever consulted. Registered on Córdoba's
// precedent (`ES_CORDOBA_PGOU2001_PACK`, gate also closed): wire it so it is SIGNABLE, and let the
// signature be the legal act — never the wiring.
import { MURCIA_JURISDICTION_ID, murciaNoRulePackRefusal } from './esMurciaEnvelope.js';
import { MURCIA_BBOX, isInMurcia } from '../providers/murciaBbox.js';
import {
    ES_MURCIA_PGOU2012_PACK,
    MURCIA_PGOU2012_ZONE_CODES,
    MURCIA_PGOU2012_VARIANT_ZONE_CODES,
} from './esMurciaPgou2012.js';
// ── VALÈNCIA (INE 46250), Comunitat Valenciana — ⚠ START OF THE VALÈNCIA BLOCK. ───────────────
// A REFUSAL jurisdiction, and — unlike Murcia and Córdoba — one whose gate a SIGNATURE CANNOT
// LIFT. The PGOU *Normas Urbanísticas* (mayo 1991) HAVE been sourced, read and transcribed; the
// transcription is complete and quoted verbatim per article. It still yields no number, because
// Arts. 6.18.2 / 6.19.1 / 6.25.1 / 6.30.1 define the buildable depth and the cornice height as
// functions of a storey count and a depth **graphed on the Plano C sheets**, which the city does
// not publish as data. `ES_VALENCIA_PGOU_PACK.zones` is therefore EMPTY BY CONSTRUCTION and is
// registered with an empty `packMap()` — there is nothing to key. See `esValenciaPgou.ts`.
import {
    VALENCIA_JURISDICTION_ID,
    valenciaNoRulePackRefusal,
} from './esValenciaEnvelope.js';
import { VALENCIA_BBOX, isInValencia } from '../providers/valenciaBbox.js';
// ── ⚠ END OF THE VALÈNCIA IMPORT BLOCK. ───────────────────────────────────────────────────────
// ── SEVILLA (INE 41091) — ⚠ START OF THE SEVILLA IMPORT BLOCK. ───────────────────────────────
// A REFUSAL jurisdiction, and — unlike Córdoba/Murcia — one with NO transcribed ordinance at
// all: `ES_SEVILLA_PGOU_PACK.zones` is empty because no PGOU-2006 article has been read yet (that
// is separate legal/research work). What IS live is the zone IDENTITY: Sevilla's own ArcGIS
// service resolves `zona_orden` per parcel (`resolveSevillaZone.ts`), so the refusal names the
// real zone instead of speaking generically. `SEVILLA_ENVELOPE_VERIFIED` is `false` and there is
// nothing behind the gate to sign yet. See `esSevilla.ts`.
import { SEVILLA_JURISDICTION_ID, sevillaNoRulePackRefusal } from './esSevilla.js';
import { SEVILLA_BBOX, isInSevilla } from '../providers/sevillaBbox.js';
// ── ⚠ END OF THE SEVILLA IMPORT BLOCK. ────────────────────────────────────────────────────────
// ── MÁLAGA (INE 29067) / GRANADA (INE 18087) — §RESEARCH-PENDING, NOT §L-449. ─────────────────
// Neither has a rulepack or a zone-identity resolver at all — this registration closes ONLY the
// §L-663 fabrication defect (no `isInX` branch meant every click fell to the estimated triple).
// See `esMalaga.ts` / `esGranada.ts` for each city's specific root blocker.
import { MALAGA_JURISDICTION_ID, malagaResearchPendingRefusal } from './esMalaga.js';
import { MALAGA_BBOX, isInMalaga } from '../providers/malagaBbox.js';
import { GRANADA_JURISDICTION_ID, granadaResearchPendingRefusal } from './esGranada.js';
import { GRANADA_BBOX, isInGranada } from '../providers/granadaBbox.js';
// ── ⚠ END OF THE MÁLAGA / GRANADA IMPORT BLOCK. ──────────────────────────────────────────────
// ── CARTAGENA (INE 30016, Región de Murcia) — ⚠ START OF THE CARTAGENA IMPORT BLOCK. ──────────
// A REFUSAL jurisdiction with a LIVE zone-identity WMS (currently-valid R0/1987 plan) — 3
// transcribed zones (Vc1/Vc2/Vu1), height+FAR+coverage cited, footprint structurally unresolved
// (setback not quantified in Título 4). See `esCartagena.ts`.
import { CARTAGENA_JURISDICTION_ID, cartagenaNoRulePackRefusal } from './esCartagena.js';
import { CARTAGENA_BBOX, isInCartagena } from '../providers/cartagenaBbox.js';
// ── ⚠ END OF THE CARTAGENA IMPORT BLOCK. ─────────────────────────────────────────────────────
// ── LORCA / MOLINA DE SEGURA / ALCANTARILLA / LAS TORRES DE COTILLAS (Región de Murcia) — ──────
// ⚠ START OF THE SECOND MURCIA-REGION BLOCK (2026-08-04). Four §RESEARCH-PENDING-style
// registrations, each naming its OWN specific confirmed blocker. Alcantarilla differs from its
// three siblings: it carries a real, live, COARSE land-use resolver (CARM's regional WFS), so its
// refusal can be land-use-class-named; the other three have no working resolver at all. None has
// a rulepack — see each city's own module for the full research citation.
import { LORCA_JURISDICTION_ID, lorcaResearchPendingRefusal } from './esLorca.js';
import { LORCA_BBOX, isInLorca } from '../providers/lorcaBbox.js';
import {
    MOLINA_DE_SEGURA_JURISDICTION_ID,
    molinaDeSeguraResearchPendingRefusal,
} from './esMolinaDeSegura.js';
import { MOLINA_DE_SEGURA_BBOX, isInMolinaDeSegura } from '../providers/molinaDeSeguraBbox.js';
import { ALCANTARILLA_JURISDICTION_ID, alcantarillaNoRulePackRefusal } from './esAlcantarilla.js';
import { ALCANTARILLA_BBOX, isInAlcantarilla } from '../providers/alcantarillaBbox.js';
import {
    LAS_TORRES_DE_COTILLAS_JURISDICTION_ID,
    lasTorresDeCotillasResearchPendingRefusal,
} from './esLasTorresDeCotillas.js';
import {
    LAS_TORRES_DE_COTILLAS_BBOX,
    isInLasTorresDeCotillas,
} from '../providers/lasTorresDeCotillasBbox.js';
// ── ⚠ END OF THE SECOND MURCIA-REGION IMPORT BLOCK. ─────────────────────────────────────────────
// ── ARAGÓN (Huesca INE 22125, Zaragoza INE 50297) — ⚠ START OF THE ARAGÓN IMPORT BLOCK. ───────
// Two REFUSAL jurisdictions. Registered because "Aragón is CLOSED" was a claim about the
// REGIONAL SIUa layer that does not survive at the municipal level — measured on 421 Zaragoza
// parcels, the regional tier was never reached on 412 of them. See `esAragon.ts`.
import {
    HUESCA_JURISDICTION_ID,
    ZARAGOZA_JURISDICTION_ID,
    ZARAGOZA_ENVELOPE_VERIFIED,
    huescaNoRulePackRefusal,
    zaragozaNoRulePackRefusal,
} from './esAragon.js';
import {
    HUESCA_BBOX,
    ZARAGOZA_BBOX,
    isInHuesca,
    isInZaragoza,
} from '../providers/aragonBbox.js';
// §ZGZ-SUBGRADO-PACK — the 4 transcribed A1 subgrados (3.1/3.2/4.1/4.2, Arts. 4.1.12/4.1.13/
// 4.1.15/4.1.17). ⚠ REGISTERING THIS PACK DOES NOT RENDER A NUMBER — see the gated `packsByZone`
// below, on the Córdoba precedent. `ZARAGOZA_ENVELOPE_VERIFIED` (declared once, in `esAragon.js`,
// imported above and reused here — never redeclared) stays `false` until a human signs.
import { ES_ZARAGOZA_PGOU2024_PACK, ZARAGOZA_ZONE_CODES } from './esZaragoza.js';
// ── ⚠ END OF THE ARAGÓN IMPORT BLOCK. ─────────────────────────────────────────────────────────
// ── L-449 SIGNED — Denmark (national, Plandata.dk). The FIRST fully-automated jurisdiction: its
//    buildable-envelope pack is resolved LIVE per parcel (`dkPlandataResolvedPack`) by the L5 DK
//    dispatch, so it registers with an EMPTY `packsByZone` and exists here to light the C60 coverage
//    globe. `DK_PLANDATA_JURISDICTION_ID` names the same jurisdiction the live DK ZoningRecord carries.
import { DK_PLANDATA_JURISDICTION_ID } from './dkPlandataEnvelope.js';
import { DENMARK_BBOX, isInDenmark } from '../providers/denmarkBbox.js';
// ── PARIS (INSEE 75056, Ville de Paris) — PLU bioclimatique. Like Denmark, an ANSWERING jurisdiction
//    whose envelope is resolved LIVE per parcel by the L5 dispatch, so `packsByZone` is EMPTY and this
//    registration's job is to light the C60 coverage globe. See the block comment at the registration.
import { PARIS_JURISDICTION_ID } from './frParisPluBioclimatique.js';
import { PARIS_BBOX, isInParis } from '../providers/parisBbox.js';
// ── NETHERLANDS (national) — bestemmingsplan bouwvlak + maatvoering, keyless via the PDOK RP WMS.
//    Same live-resolved shape as Denmark/Paris. ⚠ The routing predicate is the NATIONAL bbox the
//    dispatch itself gates on (`isInNetherlands`), imported — never restated — per the header rule.
import { NL_JURISDICTION_ID } from './nlBestemmingsplan.js';
import { NETHERLANDS_BBOX, isInNetherlands } from '../parcelProviders/countryBbox.js';
// ── CATALONIA (regional) — the CITED-REFUSAL jurisdiction of last resort for 947 municipalities.
//    Registered at the COARSEST rung any Catalan claim can hold (`'regional'`), so Barcelona, the
//    AMB municipalities and every future POUM pack out-rank it automatically. See its registration
//    at the very END of `REGISTRATIONS` — it is deliberately last in every sense.
import { CATALUNYA_JURISDICTION_ID, catalunyaRegistryRefusal } from './esCatalunya.js';
import { CATALUNYA_BBOX, isInCatalunya } from '../providers/catalunyaBbox.js';
// ── TELDE / CANARIAS (municipal) — the SIPU adapter's one wired municipality. See its
//    registration at the END of `REGISTRATIONS`, and §TELDE-BBOX-PROVENANCE in `teldeBbox.ts`
//    for where the extent was sourced from (it was sourced, not drawn).
import {
    TELDE_JURISDICTION_ID,
    canariasNoRulePackRefusal,
    canariasMultiInstrumentRefusal,
} from './esCanariasSipu.js';
import { ES_TELDE_PGO2003_PACK, TELDE_PGO2003_ZONE_CODES } from './esTeldePgo2003.js';
import { TELDE_BBOX, isInTelde } from '../providers/teldeBbox.js';
// ── EL SAUZAL / CANARIAS (municipal) — the second bespoke Canarias registration, on the SAME
//    "excluded from the generic 87, own literal entry" pattern as Telde above. See its
//    registration at the END of `REGISTRATIONS`, and `esElSauzal.ts` for the article-cited
//    Ciudad Jardín (RE-ViUf-*) transcription + the two named honesty gaps that keep
//    `EL_SAUZAL_ENVELOPE_VERIFIED` false.
import {
    EL_SAUZAL_JURISDICTION_ID,
    EL_SAUZAL_ENVELOPE_VERIFIED,
    EL_SAUZAL_ZONE_CODES,
    ES_EL_SAUZAL_PACK,
    elSauzalNoRulePackRefusal,
} from './esElSauzal.js';
import { EL_SAUZAL_BBOX, isInElSauzal } from '../providers/elSauzalBbox.js';
// ── THE OTHER 87 CANARIAS MUNICIPALITIES (§CANARIAS-88-REGISTRATION, 2026-08-03) — municipal,
//    same shape as Telde, generated below rather than hand-written 87 times. See the block
//    comment at `buildCanariasMunicipalRegistrations()` and `canariasMunicipalBboxes.ts` for the
//    provenance of every bbox.
import {
    CANARIAS_ROUTABLE_MUNICIPAL_BBOXES,
    CANARIAS_MULTI_INSTRUMENT_MUNICIPAL_BBOXES,
    isWithinCanariasMunicipalBbox,
    type CanariasMunicipalBboxEntry,
} from '../providers/canariasMunicipalBboxes.js';
// ── ILLES BALEARS (autonomous community) — LIVE-RESOLVED, `packsByZone` EMPTY, GATE SHUT (L-680).
//    The Denmark/Paris/NL shape: the pack is built per parcel from the MUIB fitxa by the L5 dispatch
//    (`resolveBalearsMuib` → `/api/es/balears-muib`), so there is nothing static to key here. See the
//    registration at the end of `REGISTRATIONS`.
import { BALEARS_JURISDICTION_ID, balearsRegistryRefusal } from './esBalearsMuib.js';
import { BALEARS_BBOX, isInBalears } from '../providers/balearsBbox.js';
// §JURISDICTION-ID-CARRIES-THE-INE — the branded INE vocabulary. See the section near the bottom.
import { parseIneCode, type IneCode } from '../providers/esMunicipalCode.js';

/** The jurisdiction id Barcelona packs and records use. One constant, not a scattered literal. */
export const BCN_JURISDICTION_ID = 'es-08019-barcelona';

/** What the registry knows about a (jurisdiction, zone) pair. */
export type ZoneDisposition =
    | {
          readonly kind: 'pack';
          readonly pack: JurisdictionZoningContract;
          readonly zoneCode: string;
      }
    | { readonly kind: 'refusal'; readonly zoneCode: string; readonly refusal: EnvelopeRefusal }
    | { readonly kind: 'unregistered'; readonly zoneCode: string };

/**
 * One jurisdiction's registrations. `packsByZone` is the authoritative map; `refusalFor` is a
 * function rather than a map so a jurisdiction may classify by pattern where its ordinance
 * genuinely works that way (Barcelona's does not — see `esBarcelonaZoneClassification.ts` on why
 * it enumerates).
 */
/**
 * L-593 / C60 §2 — WHERE a jurisdiction's registration APPLIES, in WGS84.
 *
 * WHY THIS LIVES ON THE REGISTRATION AND IS **NOT OPTIONAL**
 * ---------------------------------------------------------
 * The site-entry globe (C60) has to answer *"can PRYZM answer here?"* BEFORE a parcel
 * exists. Until now the only two statements of that were (a) `packsByZone`, which knows
 * WHAT we answer but not WHERE, and (b) the `isInBarcelona()` bbox living in a provider,
 * which knows WHERE but is not reachable from the registry. Any third statement — a
 * hand-drawn coverage polygon in the UI layer — would DRIFT from what the engine can
 * actually do, invisibly, which is precisely the failure class this codebase keeps
 * hitting. So coverage is declared HERE, on the same object as the packs, and:
 *
 *   • `bbox`/`contains` are the **imported routing constant and predicate the dispatcher
 *     itself routes on** (`siteDispatch.ts` → `isInBarcelona`), not a copy. A globe that
 *     lights a region the dispatcher would not route into is therefore unrepresentable.
 *   • `packZoneCodes` is NOT stored — `listJurisdictionCoverage()` reads it live from
 *     `packsByZone`, so registering a pack updates the globe with no second edit.
 *   • The field is REQUIRED. A future Madrid registration that forgot its extent would
 *     be a tsc error, not a city silently missing from the coverage globe.
 *
 * ⚠ A bbox is a COARSE claim, exactly as `barcelonaBbox.ts` says: it is a proximity gate,
 * never an authorisation. C60 §3 requires the entry UI to state the resolution it has
 * ("metropolitan area", not "this street") and to keep the real answer at the parcel step.
 */
export interface JurisdictionExtent {
    readonly minLat: number;
    readonly maxLat: number;
    readonly minLon: number;
    readonly maxLon: number;
}

/**
 * §JURISDICTION-SPECIFICITY — WHAT A REGISTRATION'S OWN `extent` IS, in administrative terms.
 *
 * This is NOT a measurement and NOT a description of the LAW's reach — it describes the BOX. A
 * registration knows what its own box was drawn to do, and nothing else does: `BARCELONA_BBOX`
 * is documented as "a loose gate that keeps the whole of Barcelona + its metropolitan neighbours
 * in", so it is `'metropolitan'` even though the pack it carries is the municipality's; Córdoba's
 * box is a 2-district pilot, so it is `'district'` even though its ordinance is municipal.
 *
 * Ordered FINEST → COARSEST. The finer claim governs a point both claim, because a coarser box is
 * by construction a PROXIMITY GATE that swept in land it does not speak for.
 *
 * ── §CATALUNYA-REGIONAL-RUNG (L-658) — `'regional'` IS NOW PRESENT, AND THIS PARAGRAPH RECORDS WHY.
 * This comment used to read *"`'regional'` is deliberately absent … Add it (between `municipal` and
 * `national`) with the registration that needs it."* **That registration has arrived**: Catalonia
 * (`es-ct-catalunya`), an autonomous community of 947 municipalities, registered so every Catalan
 * click gets a cited refusal naming the instrument that actually governs it.
 *
 * It sits between `'metropolitan'` and `'national'` — a region CONTAINS metropolitan areas, so it
 * must be coarser than one, and it is contained BY a state, so it must be finer than `'national'`.
 * That placement is what makes the whole design work without a single ordering edit anywhere else:
 * Barcelona's `'metropolitan'` box and the four AMB municipalities' `'municipal'` boxes all
 * out-rank the Catalonia claim automatically, and so will every future POUM pack. Registering a
 * Catalan municipality is a pure DATA addition, exactly as C58 §1.5 requires.
 *
 * ⚠ CALLING CATALONIA `'national'` WOULD HAVE BEEN THE EASY EDIT AND IT WAS REJECTED. `'national'`
 * is a claim about what the BOX IS, and Catalonia's box is not a state's; declaring it so would
 * make Catalonia TIE with a future Spain-wide registration instead of beating it on Catalan soil,
 * and a tie is refused as `'ambiguous'`. The declaration must be true for the rule to be sound.
 */
export type JurisdictionExtentResolution =
    | 'district'
    | 'municipal'
    | 'metropolitan'
    | 'regional'
    | 'national';

/** Finest → coarsest. The single source of the ordering; `RANK` is derived from it. */
export const JURISDICTION_EXTENT_RESOLUTIONS: readonly JurisdictionExtentResolution[] = [
    'district',
    'municipal',
    'metropolitan',
    'regional',
    'national',
];

/** Lower = finer = wins. Derived from the array above so the two cannot disagree. */
function extentResolutionRank(r: JurisdictionExtentResolution): number {
    return JURISDICTION_EXTENT_RESOLUTIONS.indexOf(r);
}

interface JurisdictionRegistration {
    readonly jurisdictionId: string;
    /** Human name of the covered area, in the ordinance's own terms. */
    readonly displayName: string;
    /** ISO 3166-1 alpha-2 of the sovereign state whose law the packs encode. */
    readonly countryCode: string;
    readonly countryName: string;
    /**
     * The coarse extent the dispatcher gates on. MUST be the same constant the routing
     * predicate uses — see the header above on why a copy is forbidden.
     */
    readonly extent: JurisdictionExtent;
    /** The routing predicate itself. `extent` is its bbox; this is its decision. */
    readonly contains: (lat: number, lon: number) => boolean;
    /**
     * §JURISDICTION-SPECIFICITY — what `extent` IS (see `JurisdictionExtentResolution`). REQUIRED,
     * for the same reason `extent` is: a registration that omitted it would be a `tsc` error, not
     * a city that silently loses (or silently wins) an overlap. It is the ONE input to
     * `resolveJurisdictionClaim()`, so declaring it wrong is the only way to route a point wrongly
     * — and `jurisdictionSpecificity.test.ts` re-derives every overlap from the shipped boxes, so
     * a wrong declaration fails CI rather than reaching a user.
     */
    readonly extentResolution: JurisdictionExtentResolution;
    /**
     * What the entry UI may honestly promise at this jurisdiction, in one line. Written
     * per-jurisdiction because "we hold the ordinance's depth construction and height
     * table" is a different promise from "we hold a setback triple".
     */
    readonly answerSummary: string;
    readonly packsByZone: ReadonlyMap<string, JurisdictionZoningContract>;
    readonly refusalFor: (
        zoneCode: string,
        harmonisedCode?: string | null,
        knownFacts?: readonly string[],
    ) => EnvelopeRefusal | null;
    /**
     * L-553 — the COVERAGE-GAP refusal for a privately-buildable zone this jurisdiction has no
     * pack for. Per-jurisdiction because the copy must name that jurisdiction's roadmap and speak
     * about its ordination types; a generic "no data" string would be exactly the illegible
     * honesty this decision exists to avoid.
     *
     * ⚠ OPTIONAL, and its absence is meaningful. A jurisdiction that declares NO coverage-gap
     * refusal keeps the estimated fallback for its unpacked zones. That is the correct default
     * for suburban/detached fabric, where a setback triple is the RIGHT shape and an estimate is
     * genuinely just an estimate. Switching it off wholesale would be standardising over a real
     * legal difference — the founder's ranking, inverted.
     */
    readonly noRulePackRefusal?: (
        zoneCode: string,
        zoneLabel?: string | null,
        knownFacts?: readonly string[],
    ) => EnvelopeRefusal;
}

/**
 * Extra signals the provider already returned, which a classifier MAY use — never must.
 *
 * `harmonisedCode` is Catalonia's cross-municipal `CODI_QUAL_MUC`. It exists here because the
 * L-550 coverage probe found COMPOSITE claus (`1a-5b`, `3-6b`, …) that no enumeration can
 * anticipate but whose harmonised class identifies them unambiguously as systems. It is an
 * OPTIONAL hint: omitting it degrades to the per-clau table, never to a wrong answer.
 */
export interface ZoneDispositionHints {
    readonly harmonisedCode?: string | null;
    /**
     * L-553 — the zone's name in the ordinance's own words (`DESC_QUAL_AJUNT` from the MUC).
     * Carried so the COVERAGE-GAP card can open by naming the user's zone, which is the fastest
     * way to distinguish "we don't have this zone's rules" from "it crashed".
     */
    readonly zoneLabel?: string | null;
    /**
     * L-553 — short "label: value" facts about this parcel the caller already holds (reference,
     * address, area). Shown so the refusal card is never a blank panel. Facts only — never a
     * constraint.
     */
    readonly knownFacts?: readonly string[];
}

/**
 * Build the zone→pack map from one or more (pack, codes) registrations.
 *
 * ⚠ THROWS on a duplicate code, at module load. Two packs claiming the same clau is not a
 * resolvable ambiguity — whichever the map ordering happened to keep would silently decide which
 * ordinance governs someone's land, and the loser would fail nowhere. A load-time throw is the
 * only failure mode that cannot be mistaken for a working envelope (the same reasoning that makes
 * `esBarcelonaEnsanche.ts` parse its schema at load).
 */
function packMap(
    ...registrations: ReadonlyArray<
        readonly [pack: JurisdictionZoningContract, codes: readonly string[]]
    >
): ReadonlyMap<string, JurisdictionZoningContract> {
    const m = new Map<string, JurisdictionZoningContract>();
    for (const [pack, codes] of registrations) {
        for (const c of codes) {
            if (m.has(c)) {
                throw new Error(
                    `[site-parcel-data] duplicate rule-pack registration for zone code "${c}" ` +
                        `(${m.get(c)!.displayName} vs ${pack.displayName}). One clau, one pack.`,
                );
            }
            m.set(c, pack);
        }
    }
    return m;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §CANARIAS-88-REGISTRATION (2026-08-03) — GENERATED, NOT HAND-WRITTEN, AND THAT IS DELIBERATE.
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// Every other registration in this file is a literal object because each carries its own
// bespoke `answerSummary` / research. 87 Canarias municipalities do not: within each of the two
// groups below (routable-but-unsigned, multi-instrument-ambiguous) every entry differs from its
// siblings ONLY in `jurisdictionId`, `displayName` and `extent` — the refusal TEXT, the pack
// (none), the resolution rung and the answer summary are the SAME FACT about Canarias repeated
// 41 (or 46) times. Writing that fact out as 87 near-identical literals would be the restatement
// this whole file's header warns against (drift risk: one manually-typed entry loses a word the
// other 86 have, and nothing catches it). A `.map()` over the sourced bbox tables in
// `canariasMunicipalBboxes.ts` makes the single fact the single source, and
// `canariasMunicipalBboxesTotality.test.ts` asserts the generated ids match the 41+46 municipality
// lists this was built from, so silent drift there fails CI instead of reaching a user.
//
// ⚠ TELDE IS NOT HERE. It keeps its own literal registration (its own pack, its own bespoke
// `answerSummary` naming the SIPU grammar it exercises) — see the TELDE / CANARIAS BLOCK below.
// This generator covers exactly the OTHER 87.
function buildCanariasMunicipalRegistrations(): readonly JurisdictionRegistration[] {
    const toRegistration = (
        m: CanariasMunicipalBboxEntry,
        answerSummary: string,
        noRulePackRefusal: JurisdictionRegistration['noRulePackRefusal'],
    ): JurisdictionRegistration => ({
        jurisdictionId: `es-${m.ine}-${m.jurisdictionSlug}`,
        displayName: m.name,
        countryCode: 'ES',
        countryName: 'Spain',
        extent: m.bbox,
        contains: (lat, lon) => isWithinCanariasMunicipalBbox(m.bbox, lat, lon),
        // Municipal, like Telde: each box is one town's own INSPIRE extent, not a proximity gate
        // over a wider area — see §CANARIAS-88-PROVENANCE in `canariasMunicipalBboxes.ts`.
        extentResolution: 'municipal',
        answerSummary,
        // EMPTY BY CONSTRUCTION — no municipality here has a transcribed EDIF pack (only Telde
        // does, and it is registered separately). Every parcel refuses.
        packsByZone: packMap(),
        refusalFor: () => null,
        noRulePackRefusal,
    });

    const routableSummary =
        'The Gobierno de Canarias publishes this municipality\'s plan as a SIPU package: EDIF.mdb ' +
        'carries the built-form parameters (setbacks, buildable depth, coverage, FAR, storeys, ' +
        'height with the datum disambiguated by schema) as named numeric columns, and the census ' +
        'of published resources shows exactly ONE municipality-wide base instrument governs here, ' +
        'so there is no vigencia question to answer. PRYZM has not transcribed this table into a ' +
        'signed pack, so every parcel receives a cited refusal — no number is published.';
    const routableRegistrations = CANARIAS_ROUTABLE_MUNICIPAL_BBOXES.map((m) =>
        toRegistration(m, routableSummary, (zoneCode, zoneLabel, knownFacts) =>
            canariasNoRulePackRefusal(zoneCode, zoneLabel ?? null, knownFacts ?? []),
        ),
    );

    const multiInstrumentSummary =
        'The Gobierno de Canarias publishes more than one municipality-wide base planning ' +
        'instrument for this municipality on opendata.sitcan.es, and Canarias publishes no ' +
        'currency/validity field in any SIPU family that would say which one is current. PRYZM ' +
        'will not guess which instrument governs your parcel, so every parcel receives a cited ' +
        'refusal naming that ambiguity — no number is published, and none would be even with a ' +
        'signature: the open question is which LAW applies, not whether PRYZM read one correctly.';
    const multiInstrumentRegistrations = CANARIAS_MULTI_INSTRUMENT_MUNICIPAL_BBOXES.map((m) =>
        toRegistration(m, multiInstrumentSummary, (zoneCode, zoneLabel, knownFacts) =>
            canariasMultiInstrumentRefusal(m.name, zoneCode, zoneLabel ?? null, knownFacts ?? []),
        ),
    );

    return [...routableRegistrations, ...multiInstrumentRegistrations];
}

const REGISTRATIONS: readonly JurisdictionRegistration[] = [
    {
        jurisdictionId: BCN_JURISDICTION_ID,
        displayName: 'Barcelona',
        countryCode: 'ES',
        countryName: 'Spain',
        // ⚠ THE SAME OBJECT/FUNCTION `siteDispatch.ts` routes on — imported, not restated.
        extent: BARCELONA_BBOX,
        contains: isInBarcelona,
        // ⚠ `'metropolitan'`, NOT `'municipal'`, AND THIS IS THE LINE THAT FIXES §LH-ENVELOPE.
        // `barcelonaBbox.ts` states plainly that its box "only needs to keep the whole of
        // Barcelona + its metropolitan neighbours in" — it is a PROXIMITY GATE ~44 × 42 km, four
        // times the municipality, and it fully contains the boxes of L'Hospitalet, Badalona, Sant
        // Boi and Cornellà. Declaring what it actually is makes those four municipal claims win
        // their own land by RULE, which is what the dispatcher's hand-ordered peel-off chain has
        // always done by ORDER. Calling this `'municipal'` would re-open the mis-citation.
        extentResolution: 'metropolitan',
        answerSummary:
            'Zoning (clau) from the Catalan MUC, the Art. 242 buildable-depth construction ' +
            'and the ordinance height tables — for the registered claus only. Everything ' +
            'else in the city is answered with a cited refusal, never an estimate.',
        packsByZone: packMap(
            // ADR-0271 — clau 13a/13E, the block-derived *profunditat edificable* pack. 24.2 % of
            // Barcelona's private buildable land (measured, plan §2.2).
            [ES_BARCELONA_ENSANCHE_PACK, BCN_ENSANCHE_ZONE_CODES],
            // L-583 §9 — clau 13b (*densificació urbana semiintensiva*), +8.8 pp ⇒ 33.0 %. The
            // SAME Art. 242 depth construction (it is the same article, reached via Art. 326), a
            // DIFFERENT height table (Art. 328, not Art. 327 — see `bcnAlcadaByZone.ts`, which is
            // what stops the dispatcher handing this zone 13a's numbers under 13a's citation).
            [ES_BARCELONA_SEMIINTENSIVA_PACK, BCN_SEMIINTENSIVA_ZONE_CODES],
            // L-591 — the ten `20a/*` claus (*ordenació en edificació aïllada*), +10.5 pp. The
            // FIRST Barcelona family whose ordinance states real front/lateral/fons distances, so
            // it registers a plain `kind: 'setback'` rule and needs no block ring at all.
            // ⚠ BARE `20a` IS NOT REGISTERED and must not be: it names the zone, not the subzone,
            // and the ten subzones span 0,25–1,50 in edificabilitat. It keeps the coverage-gap
            // refusal (see `BCN_20A_BARE_CLAU_UNRESOLVABLE`).
            [ES_BARCELONA_20A_AILLADA_PACK, BCN_20A_AILLADA_ZONE_CODES],
            // §L-595 — clau 12 (nucli antic, subzona I). ⚠ Governs the ANNEXED nuclis antics
            // (Gràcia, Sarrià, Sants, Sant Andreu, Horta) — Art. 315.2's *"nuclis antics
            // diferents del de Barcelona"* means other than CIUTAT VELLA, not other than the
            // municipality. Ciutat Vella is 12b and stays refused — ⚠ §CLAU-12B-TRAM-UNDEFINED
            // (L-676) CORRECTS THE REASON GIVEN HERE: it is NOT that the mean of the existing
            // neighbours is "an input we do not hold". PRYZM could read a neighbour height. What
            // Art. 320.3a never defines is *un tram de vial* — the DOMAIN the mean is taken over —
            // and Art. 320.2a hands this subzona's particular and detailed determination to a *pla
            // especial*. It is a delegated determination, not a missing dataset, so `12b` now takes
            // `barcelona12bNeighbourMeanRefusal` (`derived-plan`, legally grounded) and never
            // becomes registerable by acquiring LiDAR.
            [ES_BARCELONA_NUCLI_ANTIC_PACK, BCN_NUCLI_ANTIC_ZONE_CODES],
            // ⚠⚠ §L-590 / §L-590b — `ES_BARCELONA_INDUSTRIAL_PACK` (clau 22a) EXISTS AND IS
            // **NOT** LISTED HERE. THIS IS NOT AN OVERSIGHT. Do not "finish the job" by adding it.
            //
            // ⚠ THE REASON HAS CHANGED, SO READ IT AGAIN EVEN IF YOU READ IT BEFORE. The blocker
            // used to be the ENVELOPE MODEL: Art. 350.2's two-tier solid was inexpressible, so the
            // pack shipped `geometricRule: null`, which means "legacy per-edge inset" and on this
            // zone's (correctly) all-null setbacks erodes nothing. **ADR-0273 closed that.** The
            // `tiered-occupation` rule kind exists, `BuildableEnvelope` carries `tiers`, and this
            // pack's rule is solved end to end against a real block in
            // `esBarcelonaIndustrialPack.test.ts`.
            //
            // WHAT STILL BLOCKS REGISTRATION IS A LEGAL FACT PRYZM DOES NOT HOLD. Arts. 350.2.a–f
            // govern only industrial land *mancada de Pla Parcial*; land with a definitively
            // approved Pla Parcial is governed by Art. 350.1, where only the FAR and the
            // occupation are the PGM's and everything else comes from that plan. Neither the
            // Catastro parcel nor the MUC says which. ⚠ AND THIS GATES THE FOOTPRINT, NOT ONLY THE
            // HEIGHT: the FAR (2) and the occupation (90 %) are restated verbatim by Art. 350.1.1r
            // and are therefore regime-neutral, but Art. 350.2.b's band is not. Registering today
            // would apply that band — cited to Art. 350.2.b — to parcels Art. 350.1 may govern.
            // The error would be conservative (a band only restricts), and "conservative" has
            // never been the test: a confident mis-citation is the specific harm L-526 named.
            //
            // ⇒ Unblocking is (i) a Pla-Parcial coverage layer for Barcelona's industrial land, or
            // (ii) a founder ruling that 22a inside the municipality is `'none'` by default. Both
            // are determinations about the law. Read `BCN_22A_ENVELOPE_BLOCKER` (and its `.closed`
            // list) in `esBarcelonaIndustrial.ts` before touching this line.
            //
            // ── §L-590c (2026-07-22) — WHAT CHANGED, AND WHY IT IS STILL NOT A REGISTRATION ────
            //
            // 22a no longer returns the generic coverage gap. `barcelonaZoneRefusalFor` now hands
            // it a NAMED `regime-undetermined` refusal (ADR-0274) that publishes the regime-neutral
            // half of Art. 350 — the 2 m²st/m²s FAR, unconditional across all three paragraphs,
            // and the 90 % occupation WITH its *alineacions de vial* condition — under its own
            // narrowed citation, and names the exact missing legal fact for the rest.
            //
            // ⚠⚠ THAT ROUTE IS A **REFUSAL**, NOT A PACK, AND THE DISTINCTION IS THE SAFETY
            // PROPERTY. Adding the pack to this map would send 22a down `computeBuildableEnvelope`
            // with the `tiered-occupation` rule, which would cut an Art. 350.2.b band and publish
            // an Art. 350.2.e 5 m tier as the principal tier — both regime-gated, on parcels
            // Art. 350.1 may govern. Going through `refusalFor` instead keeps every numeric field
            // null and every polygon empty (`buildRefusedEnvelope`), so the two facts reach the
            // user as cited PROSE and nothing reaches the massing, the generator bounds or
            // `site.updateZoning`. `esBarcelonaIndustrialPack.test.ts` asserts exactly that.
            //
            // ⚠ FOUNDER RULING 2026-07-22 — "C now, B in parallel, hold A". **Option A (assume no
            // Pla Parcial by default) IS ON HOLD. Do not add a permissive default anywhere.**
            // Track B has since found that Barcelona's OWN municipal planning WMS answers the
            // regime question at a point (see V1-LAUNCH-READINESS-AUDIT L-590c/L-605) — and that
            // on Zona Franca 22a the answer is a Pla Parcial with 18,30 / 24,40 m heights, i.e.
            // option A would have been WRONG there. Wiring that source is a founder re-decision,
            // not an implementer's.
        ),
        refusalFor: barcelonaZoneRefusalFor,
        // L-553, founder-decided: Barcelona's remaining unpacked buildable claus (12, 12b, 22a,
        // 22@, 20a/*) refuse rather than show a generic setback triple. The dense Barcelona fabric is
        // *alineacions de vial*, so that triple is the wrong geometric OPERATION, and no badge
        // can label a category error.
        noRulePackRefusal: barcelonaNoRulePackRefusal,
    },
    // ── L-606 — Riyadh (Saudi Arabia). The MOMRAH national residential FOOTPRINT, mapped onto
    //    the plain `setback` kind + `maxCoverage`. The class is a user dropdown and the fronting
    //    street width is user-supplied (the Balady feed is geo-fenced — no live parcel fetch), so
    //    the setback triple is resolved per-parcel in the L5 dispatcher via `saRiyadhResolvedPack`.
    {
        jurisdictionId: SA_RIYADH_JURISDICTION_ID, // 'sa-ruh-riyadh'
        displayName: 'Riyadh',
        countryCode: 'SA',
        countryName: 'Saudi Arabia',
        // ⚠ THE SAME OBJECT/FUNCTION `siteDispatch.ts` routes on — imported, not restated.
        extent: RIYADH_BBOX,
        contains: isInRiyadh,
        // The Riyadh municipal area (Amanat Ar-Riyadh). Overlaps nothing registered.
        extentResolution: 'municipal',
        answerSummary:
            'National MOMRAH residential FOOTPRINT (setbacks + ground coverage) for the ' +
            'villa and apartment classes — the class is user-picked and the street width ' +
            'user-supplied (no reachable parcel feed). Height + floors REFUSE, per-field: ' +
            'they are set by the municipal approved plan and development authorities, not ' +
            'nationally.',
        packsByZone: packMap([SA_RIYADH_DEMO_PACK, [...SA_RIYADH_ZONE_CODES]]),
        refusalFor: () => null, // no per-zone legal refusal table for the demo
        // NO noRulePackRefusal: the two demo zones ARE the pack; unknown Saudi zones keep the
        // estimated fallback (suburban/detached fabric, where a setback triple is the right
        // shape) rather than a coverage-gap refusal.
    },
    // ── §MADRID-PGOUM97-WIRING (L-608 →) — Madrid (INE 28079), PGOUM-97 Título 8. ──
    //
    // ⚠⚠ REGISTERED, BUT RENDERS NO NUMBER — the Córdoba discipline, for the same reason. The 23
    // zones of `ES_MADRID_PGOUM97_PACK` were MACHINE-EXTRACTED from the Compendio 2025 by
    // `tools/madrid-extract/` and ship `defaultConfidence: 'pipeline-extracted-unverified'`. The L5
    // dispatcher gates every one of them on `MADRID_ENVELOPE_VERIFIED`, which is **false**, so a
    // Madrid parcel in a packed zone receives `madridPgoum97UnverifiedRefusal` — a cited
    // "machine-extracted, unverified" card — and NO number reaches the panel, the massing or
    // `site.updateZoning`. This registration wires packs + refusals + extent so the C60 coverage
    // globe, `resolveZoneDisposition` and the dispatcher share ONE source of truth; it is NOT an
    // authorisation to draw a number.
    //
    // ⚠ AND A SECOND, INDEPENDENT GATE EXISTS THAT NO SIGNATURE CLOSES. `ZoningRulesEngine`
    // hard-codes `let confidence: EnvelopeConfidence = 'estimated-ruleset'` and never reads a pack's
    // `defaultConfidence` — so the day a human signs `sources/VERIFICATION.md`, opening
    // `MADRID_ENVELOPE_VERIFIED` ALONE would surface these machine-read numbers wearing the violet
    // "Estimated" chip rather than the red `pipeline-extracted-unverified` one the renderer already
    // implements. That is a C58 engine defect, tracked separately; it does not block THIS
    // registration (the closed gate keeps every pack number out of the engine) and it DOES block the
    // sign-off. `madridWiring.test.ts` pins both halves so the ordering cannot be forgotten.
    //
    // THE THREE ROUTED FAMILIES, all keyed on the live `AMB_TX_ETIQ` vocabulary (34 codes,
    // VERIFIED-LIVE 2026-07-24) that `resolveMadridNormaZonal` reads:
    //   • `4`, `5.*`, `7.*`, `8.*`, `9.*` (23 codes) → `packsByZone` → the human-gated pack;
    //   • `3.*` (5 codes) → `refusalFor` → `madridNZ3Refusal`, a LEGALLY GROUNDED `derived-plan`
    //     refusal: Art. 8.3.1 says the aprovechamiento is already EXHAUSTED, so the ordinance's own
    //     answer is "not by a zone envelope". That refusal is correct whether or not anyone signs;
    //   • `1.*` (6 codes) → `noRulePackRefusal` → `madridNZ1Refusal`. NZ 1 is a SETTLED
    //     `explicit-area` decision (`esMadridNZ1.ts`): its footprint is PUBLISHED AS GEOMETRY and is
    //     resolved live per manzana by the dispatcher, so it must never enter `packsByZone`.
    //   • anything else → `madridUnknownZoneRefusal`, which names the coverage gap instead of
    //     mis-citing NZ 1 at it. Not hypothetical: Normas Zonales 2/6/10/11 are absent from
    //     `AMB_TX_ETIQ` for reasons `SOURCES.md` §0.3 records as UNDETERMINED.
    {
        jurisdictionId: MADRID_JURISDICTION_ID,
        displayName: 'Madrid',
        countryCode: 'ES',
        countryName: 'Spain',
        // ⚠ THE SAME OBJECT/FUNCTION `siteDispatch.ts` routes on — imported, not restated.
        extent: MADRID_BBOX,
        contains: isInMadrid,
        // The Madrid municipal term (INE 28079). Overlaps nothing registered.
        extentResolution: 'municipal',
        answerSummary:
            'PGOUM-97 Título 8 — 23 cited Norma-Zonal subzones (NZ 4/5/7/8/9), plus NZ 1 as an ' +
            'explicit-area zone whose buildable footprint is read live from the municipal plane and ' +
            'NZ 3 as a legally-grounded refusal (Art. 8.3.1: the aprovechamiento is exhausted). ' +
            '⚠ Every NZ 4/5/7/8/9 value is MACHINE-EXTRACTED from the Compendio 2025 and NOT ' +
            'human-verified, so PRYZM currently publishes NO buildable figure for those zones — each ' +
            'parcel gets a cited "unverified" refusal until sign-off. Never an estimate.',
        packsByZone: packMap([ES_MADRID_PGOUM97_PACK, [...MADRID_PGOUM97_ZONE_CODES]]),
        // The legally-grounded "no": Norma Zonal 3 (Volumetría Específica). ⚠ Unlike the unverified
        // gate above, this refusal survives sign-off — the ordinance itself declines to state an
        // envelope, so there is nothing a human signature could promote.
        refusalFor: (zoneCode, _harmonisedCode, knownFacts) =>
            (MADRID_NZ3_ZONE_CODES as readonly string[]).includes(zoneCode)
                ? madridNZ3Refusal(knownFacts ?? [])
                : null,
        // The coverage gap (C60 §3), SPLIT — because "NZ 1 publishes its footprint as geometry" and
        // "PRYZM has not read your zone's chapter" are opposite claims, and answering the second
        // with the first would be a confident mis-citation on land that is not in NZ 1.
        noRulePackRefusal: (zoneCode, zoneLabel, knownFacts) =>
            typeof zoneCode === 'string' && zoneCode.startsWith(MADRID_NZ1_CODE_PREFIX)
                ? madridNZ1Refusal(knownFacts ?? [])
                : madridUnknownZoneRefusal(zoneCode, zoneLabel ?? null, knownFacts ?? []),
    },
    // ── Córdoba (INE 14021) — PGOU-2001, the SUR + NOROESTE 2-district pilot. ────────────────────
    //
    // ⚠ REGISTERED, BUT RENDERS NO NUMBER. Every value in the pack is machine-OCR'd and
    // `pipeline-extracted-unverified`. The dispatcher's `CORDOBA_ENVELOPE_VERIFIED` gate refuses
    // every Córdoba parcel with a cited "machine-extracted, unverified" card until a human signs
    // `sources/VERIFICATION.md` (pack WIRING-TODO 3). This registration wires the pack + refusals +
    // extent so the coverage globe (C60 §2) and the future subzone resolver share one source; it is
    // NOT an authorisation to draw a number. `packsByZone` gives the 13 packed subzones precedence
    // for the day verification lands, exactly as Barcelona's does.
    {
        jurisdictionId: CORDOBA_JURISDICTION_ID,
        displayName: 'Córdoba (Sur + Noroeste pilot)',
        countryCode: 'ES',
        countryName: 'Spain',
        // ⚠ THE SAME OBJECT/PREDICATE `siteDispatch.ts` routes on — imported, not restated.
        extent: CORDOBA_BBOX,
        contains: isInCordoba,
        // ⚠ `'district'` — the box is the SUR + NOROESTE 2-district pilot (≈ 4.8 × 3.4 km), not
        // Córdoba's municipal term. Declaring `'municipal'` would let this pilot out-rank nothing
        // today but would wrongly TIE with a future whole-Córdoba registration instead of beating
        // it inside the pilot area.
        extentResolution: 'district',
        answerSummary:
            'PGOU-2001 ordenanzas for the Sur + Noroeste districts only (a 2-district pilot, ≈ the ' +
            'historic centre) — 13 setback/alignment subzones (PAS/OA/UAD full; CTP-1/MC partial, ' +
            'with DERIVED edificabilidad and per-street-width heights still null). ⚠ Every value is ' +
            'MACHINE-EXTRACTED (OCR) and NOT human-verified, so PRYZM currently publishes NO ' +
            'buildable figure here — each parcel gets a cited "unverified" refusal until sign-off.',
        packsByZone: packMap([ES_CORDOBA_PGOU2001_PACK, CORDOBA_PGOU2001_ZONE_CODES]),
        // The legally-grounded "no" families (CTP1-Campo de la Verdad, Uso Comercial, Elemento
        // protegido) — a document PRYZM does not hold fixes their envelope; they refuse even after
        // the packed subzones are verified.
        refusalFor: cordobaZoneRefusalFor,
        // The coverage gap (C60 §3): the unbindable families + the blank-ordenanza parcels, stating
        // the 2-district pilot scope. ⚠ NOTE: while the verification gate is closed the DISPATCHER
        // refuses the whole pilot before this table is consulted (see `applyCordobaZoningThenFallback`).
        noRulePackRefusal: cordobaNoRulePackRefusal,
    },
    // ── Córdoba (INE 14021) — THE REST OF THE MUNICIPALITY. §CORDOBA-MUNICIPAL-CLOSURE ──────────
    //
    // ⚠⚠ THIS REGISTRATION EXISTS TO SAY "NO", AND THAT IS ITS ENTIRE VALUE. It carries no pack and
    // never will (`packsByZone` is empty BY CONSTRUCTION). It is the Catalonia pattern one rung
    // down: answer where nothing else does, so the generic ESTIMATE can never be the answer.
    //
    // THE DEFECT IT CLOSES, MEASURED 2026-08-01. The pilot registration above claims 2 districts.
    // A parcel anywhere else in Córdoba matched no `contains` predicate in this table, so the §L-663
    // chokepoint's `resolveRegisteredJurisdictionAt` returned `'none'` — "genuinely uncovered land,
    // the estimate is honest here" — and `applyEstimatedZoning` PUBLISHED the generic triple
    // (3,0 / 1,5 / 3,0 m, FAR 2,00, coverage 50 %) on land PRYZM has read no article about. §L-663
    // is not at fault: it asks the registry, and the registry had the hole. Registering the
    // municipality closes it with no edit to `siteDispatch.ts` — exactly the property C58 §1.5
    // promises ("registering a new city closes this hole for that city with no edit there").
    //
    // ⚠ PRECEDENCE IS AUTOMATIC, NOT ORDERED. `'municipal'` is COARSER than the pilot's
    // `'district'`, so §JURISDICTION-SPECIFICITY makes the pilot win every point inside it. This
    // entry can therefore sit anywhere in the list and can never shadow the pilot — the reason the
    // pilot was declared `'district'` in the first place (see its `extentResolution` note).
    //
    // ⚠ IT DOES NOT LIGHT THE GLOBE GREEN. `packZoneCodes` is empty and the `answerSummary` says,
    // in the first sentence, that no buildable figure is published here. C60 §3 requires the entry
    // UI to state the resolution it has; this states a REFUSAL with its reason, which is a terminal
    // answer, not coverage.
    {
        jurisdictionId: CORDOBA_MUNICIPAL_JURISDICTION_ID, // 'es-14021-cordoba-municipal'
        displayName: 'Córdoba (municipality — outside the published pilot)',
        countryCode: 'ES',
        countryName: 'Spain',
        // ⚠ THE SAME OBJECT/PREDICATE any Córdoba dispatch would route on — imported, not restated.
        extent: CORDOBA_MUNICIPAL_BBOX,
        contains: isInCordobaMunicipality,
        // The municipal term of Córdoba (OSM relation 343207, `ine:municipio=14021`), rounded
        // outward. Coarser than the pilot's `'district'`, so the pilot always wins inside it.
        extentResolution: 'municipal',
        answerSummary: CORDOBA_MUNICIPAL_ROADMAP_LINE,
        // EMPTY BY CONSTRUCTION. There is no published calificación outside the 2 pilot districts to
        // key a pack on, so there is nothing to register. This is not a TODO.
        packsByZone: packMap(),
        // No per-zone legal table: outside the pilot no zone is ever resolved, so a zone-keyed legal
        // classification would be answering a question that was never asked.
        refusalFor: () => null,
        // The one product of this registration: the cited "COACo publishes no calificación for this
        // land" card — `no-plan-at-point` (durable), never the transient retry code.
        noRulePackRefusal: (_zoneCode, _zoneLabel, knownFacts) =>
            cordobaOutsidePilotRefusal(knownFacts ?? []),
    },
    // ── SWITZERLAND (national), Nutzungsplanung WFS — the Outcome-B zone-ID jurisdiction. ──
    //
    // ⚠ REGISTERED AS A REFUSAL JURISDICTION, ON PURPOSE. The national WFS (geodienste.ch
    // ms:grundnutzung) publishes the zone IDENTITY as structured data — but NOT its density
    // (Nutzungsziffer, a model-slotted + PDF-bound number the WFS does not surface) or height
    // (unmodelled entirely). So the honest disposition is: identify the zone, refuse the envelope.
    //
    // The DISPATCHER'S Swiss path (`applyChZoningThenFallback`) resolves the live zone via
    // `resolveChZone` and dispatches a refusal that CARRIES the identified zone (so it renders). This
    // registration exists so the C60 coverage globe lights Switzerland (we DO answer here — with an
    // honest refusal) and so `resolveZoneDisposition` answers `refusal` for any Swiss parcel: no code
    // maps to a pack (`packsByZone` empty), and `noRulePackRefusal` returns the Swiss cited refusal.
    //
    // WIRING TODO (orchestrator, when a canton's Typ catalogue is harvested + L-449-signed): author a
    // per-canton FAR pack (see `resolveChFarFromCantonCatalogue`), move it into `packsByZone` under the
    // verified zone codes, and narrow `noRulePackRefusal` to the still-unpacked cantons/zones.
    //
    // ── §ZURICH-BZO — THE CITY OF ZÜRICH IS NOW AN EXCEPTION TO "THE ENVELOPE REFUSES". ──────────
    // ⚠ THIS IS A CORRECTION TO THE SUMMARY BELOW, NOT A SECOND SWISS REGISTRATION, AND IT MUST NOT
    // BECOME ONE. Zürich (BFS-Nr 261) is inside `SWITZERLAND_BBOX`, so a second registration would
    // give the globe two overlapping Swiss claims with no rule for which wins — the drift C60 §2
    // exists to forbid. The city is handled INSIDE the Swiss dispatch instead: `isInZurichCity`
    // prefers the municipal `bzo_zone_v` zone-ID over the national Grundnutzung, and under the
    // owner-signed `CH_FAR_CERTIFIED` gate the §L-616 path COMPUTES a real AZ-capped envelope from
    // the BZO 700.100 transcription (`chZurichBzoCatalogue.ts`). The summary is worded to state that
    // exception rather than let the globe promise a blanket refusal the engine no longer performs.
    //
    // ⚠ `CH_ZURICH_BZO_PACK` STILL CANNOT ENTER `packsByZone`, and this is not an oversight: it
    // declares `zones: []`. It is a jurisdiction DECLARATION with no zone codes to key, so there is
    // literally nothing to map. The Zürich numbers are resolved live per parcel from the signed
    // catalogue by the dispatch — the same live-resolution shape as Denmark, Paris and the NL below.
    // The WIRING TODO above (a per-CANTON pack keyed by verified zone codes) is a different and still
    // open piece of work; do not mark it done because Zürich-city now answers.
    {
        jurisdictionId: CH_JURISDICTION_ID,
        displayName: 'Switzerland (national Grundnutzung)',
        countryCode: 'CH',
        countryName: 'Switzerland',
        // ⚠ THE SAME OBJECT/FUNCTION `siteDispatch.ts` routes on — imported, not restated.
        extent: SWITZERLAND_BBOX,
        contains: isInSwitzerland,
        // National. ⚠ §EXTENT-SPILLS-A-BORDER (header): this rectangle also claims Como, Vaduz,
        // Annecy and Konstanz. Registering IT / LI / FR / DE closes each by rule, with no edit here.
        // Zürich is NOT a second registration — see §ZURICH-BZO above on why that is deliberate.
        extentResolution: 'national',
        answerSummary:
            'Land-use ZONE identity from the national Nutzungsplanung WFS (geodienste.ch ' +
            'ms:grundnutzung) — code, label, main-use, the local abbreviation (e.g. W2), canton. ' +
            'Nationally the buildable envelope REFUSES: density (Nutzungsziffer) is model-slotted + ' +
            'PDF-bound and height/floors are not modelled, so PRYZM shows the zone but never a ' +
            'fabricated number. ONE EXCEPTION — the City of Zürich (BFS-Nr 261), where the municipal ' +
            'BZO WFS gives the finer zone code (e.g. W2bIII) plus a direct link to that parcel\'s ' +
            'BZO 700.100 ordinance, and an owner-signed transcription of the BZO Bauordnung table ' +
            'supplies the Ausnützungsziffer, Gebäudehöhe and Vollgeschosse — so a Zürich parcel gets ' +
            'a real GFA-capped envelope, shipped at estimated-ruleset because those numbers are a ' +
            'human transcription of the ordinance table, not a live structured attribute.',
        // No code maps to a pack yet — the zone is identified live and its envelope refuses.
        packsByZone: packMap(),
        // No per-zone legal refusal table; the coverage-gap refusal below covers all Swiss parcels.
        refusalFor: () => null,
        // Every Swiss zone code → the Grundnutzung envelope refusal (the current honest state). The
        // registry path has no live zone, so it refuses generically; the dispatcher path supplies the
        // identified-zone refusal via `resolveChZone`.
        noRulePackRefusal: (_zoneCode, _zoneLabel, knownFacts) =>
            chZoningEnvelopeRefusal(null, knownFacts ?? []),
    },
    // ── Envelope Phase 2 — L'Hospitalet de Llobregat (INE 08101), the SECOND Catalan municipality. ──
    //
    // ⚠ REGISTERED AS A REFUSAL JURISDICTION, ON PURPOSE — the honesty gate is the point of Phase 2.
    // L'Hospitalet is the "cheapest possible proof" that onboarding a city is a DATA addition at five
    // slots: it reuses Barcelona's zone source (the Catalan MUC, S3) and sits under the SAME
    // metropolitan instrument (PGM-1976), so the router predicate (S2, `isInLHospitalet`), this
    // registration (S5) and one dispatcher branch (L5) are the whole engineering cost. What it does
    // NOT reuse is Barcelona's NUMBERS: `packsByZone` is deliberately EMPTY because no human has
    // verified that any L'Hospitalet clau's height/FAR/coverage equals Barcelona's, and Barcelona's
    // *alçada reguladora* / official-street-width tables are municipality-specific. Reusing
    // `ES_BARCELONA_ENSANCHE_PACK` here would stamp `es-08019-barcelona` citations onto another
    // municipality's land — a confident mis-citation. So `noRulePackRefusal` returns the cited
    // unverified refusal for every L'Hospitalet parcel, and `resolveZoneDisposition` answers `refusal`.
    // The extent still lights the C60 coverage globe (we DO answer here — with an honest refusal).
    //
    // WIRING TODO (orchestrator, when the L-449 gate clears): confirm the L'Hospitalet claus + rule
    // shapes against the MUC + the municipal *text refós*, source L'Hospitalet's own height/street-
    // width tables, author an `es-08101-hospitalet` pack (or an explicit per-clau equivalence ruling
    // cited to L'Hospitalet), move it into `packsByZone`, and narrow `noRulePackRefusal`.
    {
        jurisdictionId: LHOSPITALET_JURISDICTION_ID,
        displayName: "L'Hospitalet de Llobregat",
        countryCode: 'ES',
        countryName: 'Spain',
        // ⚠ THE SAME OBJECT/FUNCTION `siteDispatch.ts` routes on — imported, not restated. Checked
        // BEFORE `isInBarcelona` (L'Hospitalet is inside the loose Barcelona metro box), so it peels
        // off only L'Hospitalet's core and leaves every Barcelona parcel byte-identical.
        extent: LHOSPITALET_BBOX,
        contains: isInLHospitalet,
        // ⚠ THE PEEL-OFF, NOW EXPRESSED AS A RULE AND NOT ONLY AS AN `if` ORDER. `'municipal'`
        // beats Barcelona's `'metropolitan'` box, which fully contains this one, so an
        // L'Hospitalet point resolves to `es-08101-hospitalet` for every consumer — the coverage
        // globe included — instead of only inside `siteDispatch`'s hand-ordered chain.
        extentResolution: 'municipal',
        answerSummary:
            "L'Hospitalet de Llobregat is routed and shares Barcelona's metropolitan plan (PGM-1976) " +
            'and clau source (the Catalan MUC), so the Art. 242.2 buildable-depth construction applies ' +
            "here as across the AMB. But PRYZM has NOT verified that any clau's numbers equal " +
            "Barcelona's, so it answers with a cited refusal — never a borrowed Barcelona figure — " +
            'until per-clau verification is signed.',
        // No code maps to a pack yet — see the block comment above (the honesty gate).
        packsByZone: packMap(),
        // No per-zone legal refusals authored for L'Hospitalet; the coverage/verification refusal covers all.
        refusalFor: () => null,
        // Every L'Hospitalet zone code → the unverified refusal (the current honest state).
        noRulePackRefusal: (zoneCode, zoneLabel, knownFacts) =>
            lhospitaletUnverifiedRefusal(zoneCode, zoneLabel ?? null, knownFacts ?? []),
    },
    // ⚠ Badalona (INE 08015) — REGISTERED AS A REFUSAL JURISDICTION, same honesty gate as
    // L'Hospitalet above. Same AMB fabric, PGM-1976 instrument + Catalan MUC (S3); `packsByZone` is
    // deliberately EMPTY (no clau's numbers verified vs Barcelona; Barcelona's height/street-width
    // tables are municipality-specific). `noRulePackRefusal` returns the cited unverified refusal for
    // every Badalona parcel; the extent still lights the C60 coverage globe. WIRING TODO (L-449 gate):
    // source Badalona's own tables, author an `es-08015-badalona` pack, move it into `packsByZone`.
    {
        jurisdictionId: BADALONA_JURISDICTION_ID,
        displayName: 'Badalona',
        countryCode: 'ES',
        countryName: 'Spain',
        // SAME object `siteDispatch.ts` routes on. Checked BEFORE `isInBarcelona` (Badalona is inside
        // the loose Barcelona metro box), so it peels off only Badalona's core; Barcelona byte-identical.
        extent: BADALONA_BBOX,
        contains: isInBadalona,
        // Municipal — beats Barcelona's metropolitan box, which fully contains this one.
        extentResolution: 'municipal',
        answerSummary:
            "Badalona is routed and shares Barcelona's metropolitan plan (PGM-1976) and clau source " +
            '(the Catalan MUC), so the Art. 242.2 buildable-depth construction applies here as across ' +
            "the AMB. But PRYZM has NOT verified that any clau's numbers equal Barcelona's, so it " +
            'answers with a cited refusal — never a borrowed Barcelona figure — until per-clau ' +
            'verification is signed.',
        packsByZone: packMap(),
        refusalFor: () => null,
        noRulePackRefusal: (zoneCode, zoneLabel, knownFacts) =>
            badalonaUnverifiedRefusal(zoneCode, zoneLabel ?? null, knownFacts ?? []),
    },
    // ⚠ Sant Boi de Llobregat (INE 08200) — REGISTERED AS A REFUSAL JURISDICTION, same honesty gate
    // as Badalona above. Same AMB fabric, PGM-1976 instrument + Catalan MUC (S3); `packsByZone` is
    // deliberately EMPTY (no clau's numbers verified vs Barcelona; Barcelona's height/street-width
    // tables are municipality-specific). `noRulePackRefusal` returns the cited unverified refusal for
    // every Sant Boi parcel; the extent still lights the C60 coverage globe. WIRING TODO (L-449 gate):
    // source Sant Boi's own tables, author an `es-08200-sant-boi` pack, move it into `packsByZone`.
    {
        jurisdictionId: SANT_BOI_JURISDICTION_ID,
        displayName: 'Sant Boi de Llobregat',
        countryCode: 'ES',
        countryName: 'Spain',
        // SAME object `siteDispatch.ts` routes on. Checked BEFORE `isInBarcelona` (Sant Boi is inside
        // the loose Barcelona metro box), so it peels off only Sant Boi's core; Barcelona byte-identical.
        extent: SANT_BOI_BBOX,
        contains: isInSantBoi,
        // Municipal — beats Barcelona's metropolitan box, which fully contains this one.
        extentResolution: 'municipal',
        answerSummary:
            "Sant Boi de Llobregat is routed and shares Barcelona's metropolitan plan (PGM-1976) and " +
            'clau source (the Catalan MUC), so the Art. 242.2 buildable-depth construction applies here ' +
            "as across the AMB. But PRYZM has NOT verified that any clau's numbers equal Barcelona's, so " +
            'it answers with a cited refusal — never a borrowed Barcelona figure — until per-clau ' +
            'verification is signed.',
        packsByZone: packMap(),
        refusalFor: () => null,
        noRulePackRefusal: (zoneCode, zoneLabel, knownFacts) =>
            santBoiUnverifiedRefusal(zoneCode, zoneLabel ?? null, knownFacts ?? []),
    },
    // ⚠ Cornellà de Llobregat (INE 08073) — REGISTERED AS A REFUSAL JURISDICTION, same honesty gate
    // as Sant Boi above. Same AMB fabric, PGM-1976 instrument + Catalan MUC (S3); `packsByZone` is
    // deliberately EMPTY (no clau's numbers verified vs Barcelona; Barcelona's height/street-width
    // tables are municipality-specific). `noRulePackRefusal` returns the cited unverified refusal for
    // every Cornellà parcel; the extent still lights the C60 coverage globe. WIRING TODO (L-449 gate):
    // source Cornellà's own tables, author an `es-08073-cornella-de-llobregat` pack, move it into `packsByZone`.
    {
        jurisdictionId: CORNELLA_JURISDICTION_ID,
        displayName: 'Cornellà de Llobregat',
        countryCode: 'ES',
        countryName: 'Spain',
        // SAME object `siteDispatch.ts` routes on. Checked BEFORE `isInBarcelona` (Cornellà is inside
        // the loose Barcelona metro box), so it peels off only Cornellà's core; Barcelona byte-identical.
        extent: CORNELLA_BBOX,
        contains: isInCornella,
        // Municipal — beats Barcelona's metropolitan box, which fully contains this one. ⚠ Its box
        // clears Sant Boi's by 0.002° of longitude and L'Hospitalet's by 0.003°: the four AMB
        // municipal boxes are mutually DISJOINT, so no same-rank ambiguity exists between them —
        // asserted, not assumed, by `jurisdictionSpecificity.test.ts`.
        extentResolution: 'municipal',
        answerSummary:
            "Cornellà de Llobregat is routed and shares Barcelona's metropolitan plan (PGM-1976) and " +
            'clau source (the Catalan MUC), so the Art. 242.2 buildable-depth construction applies here ' +
            "as across the AMB. But PRYZM has NOT verified that any clau's numbers equal Barcelona's, so " +
            'it answers with a cited refusal — never a borrowed Barcelona figure — until per-clau ' +
            'verification is signed.',
        packsByZone: packMap(),
        refusalFor: () => null,
        noRulePackRefusal: (zoneCode, zoneLabel, knownFacts) =>
            cornellaUnverifiedRefusal(zoneCode, zoneLabel ?? null, knownFacts ?? []),
    },
    // ── Murcia (INE 30030) — Región de Murcia. ───────────────────────────────────────────────────
    //
    // ⚠⚠ NOT A CATALAN CITY, AND NOT ROUTED LIKE ONE. The five registrations above share ONE
    // metropolitan instrument (PGM-1976) and ONE zone source (the Catalonia-wide MUC), which is why
    // each is a two-line variation on its neighbour. Murcia shares NEITHER: its instrument is the
    // PGOU de Murcia (Normas Urbanísticas) and its zone source is the MUNICIPAL GeoServer. Reusing
    // any Catalan predicate, pack or citation here would be the mis-citation §CONTEXT-DATA-HONESTY
    // forbids, on another autonomous community's land. The only thing shared is the SHAPE of the
    // slot — which is the whole point of the registry (C58 §1.5).
    //
    // ⚠ REGISTERED AS A REFUSAL JURISDICTION, ON PURPOSE, AND FOR A STRONGER REASON THAN COVERAGE.
    // The municipal service publishes the zone IDENTITY, the official designation, the land class
    // and a validity interval — and publishes NO numeric buildable parameter as an attribute (no
    // altura, no edificabilidad, no ocupación, no retranqueo; verified against the WFS
    // `DescribeFeatureType` schemas, not merely against one response). For the TA/TM/UA/UH/UM
    // families the PGOU says so ITSELF (Arts. 6.6.1–6.6.2, 5.24.5.1): the ordering is that of a
    // PRIOR, separately-approved instrument, identified by the expediente number after the ámbito
    // code. That is a LEGALLY GROUNDED `derived-plan` refusal, produced per-parcel from live data by
    // the L5 dispatch (`murciaEnvelopeDisposition`), not from this table.
    //
    // ⇒ `refusalFor` returns null and `noRulePackRefusal` returns the Murcia COVERAGE refusal — the
    // honest answer on the REGISTRY path, which has no live records and therefore cannot make the
    // stronger legal claim. The dispatcher path supplies the specific, cited one. Same division as
    // Switzerland and Madrid.
    //
    // ⚠ §MURCIA-PACK-REGISTERED (2026-08-01) — `packsByZone` IS NO LONGER EMPTY, AND THAT IS NOT AN
    // AUTHORISATION TO DRAW A NUMBER. The remaining ~33 % of Murcia's private buildable land that the
    // PGOU orders ITSELF (Título 5 Caps. 2–23) is now transcribed: `ES_MURCIA_PGOU2012_PACK` holds 14
    // calificaciones from the *Normas Urbanísticas*, Texto Refundido diciembre 2012 — the
    // municipality's own signed consolidation, carrying no *«sin valor normativo»* disclaimer — each
    // parameter with its article and a verbatim quote. Registering those codes makes the pack
    // REACHABLE (and therefore SIGNABLE, and visible to the C60 coverage probe via
    // `registeredPackZoneCodes`); it publishes nothing, because:
    //   (a) ⚠ UPDATED 2026-08-01 — `MURCIA_ENVELOPE_VERIFIED` is now **`true`** (SIG-MU1). This
    //       clause used to read `=== false` and was the reason the pack published nothing; it is no
    //       longer the reason. See (b).
    //   (b) the L5 Murcia dispatch answers from `murciaEnvelopeDisposition` before this table is
    //       consulted. Post-signature that disposition RENDERS on PGOU-direct packed land
    //       (§MURCIA-ENVELOPE-RENDER — the measured 23.51 % of buildable land SIG-MU1 authorises)
    //       and refuses, cited, everywhere else.
    // ⚠ SO MURCIA IS NO LONGER "REGISTERED BUT PUBLISHING NOTHING" — unlike Córdoba above, whose
    // pack remains gated. Do not read the two as the same posture any more.
    //
    // ⚠⚠ THE ORDER INSIDE `murciaEnvelopeDisposition` IS THE SAFETY PROPERTY, NOT THIS TABLE. Arts.
    // 5.25.3.3 / 5.26.3.3: inside a delegating ámbito a zonal code governs use and typology but NOT
    // altura/edificabilidad. So an `RM1` polygon inside a TA/PERI ámbito must be answered by the
    // remitted-ámbito branch, never from this pack. The registry holds a zone code and no ámbito, so
    // it CANNOT make that distinction — which is exactly why no Murcia dispatch path reads it.
    //
    // WIRING TODO (founder, a legal act — not an engineering one): sign
    // `es/es-mc/30030-murcia/sources/VERIFICATION.md` §SIG-1 and flip `MURCIA_ENVELOPE_VERIFIED`,
    // then teach the L5 dispatch the `kind: 'envelope'` branch (the disposition's `reason` field is
    // the interlock that keeps Murcia refusing honestly if the gate opens first). ⚠ That signature
    // would authorise at most the ~33 % measured ceiling — the delegated 67 % keeps its
    // `derived-plan` refusal, which NO signature can lift.
    {
        jurisdictionId: MURCIA_JURISDICTION_ID, // 'es-30030-murcia'
        displayName: 'Murcia',
        countryCode: 'ES',
        countryName: 'Spain',
        // ⚠ THE SAME OBJECT/FUNCTION `siteDispatch.ts` routes on — imported, not restated.
        extent: MURCIA_BBOX,
        contains: isInMurcia,
        // The Murcia municipal term (INE 30030 — one of Spain's largest, ≈ 45 × 48 km, which is
        // why its box dwarfs the Catalan municipal ones without being any less specific: this is
        // precisely why the ladder is a DECLARATION and not a measured area).
        extentResolution: 'municipal',
        answerSummary:
            'The PARCEL half is complete and live: the national Catastro path resolves the referencia ' +
            'catastral, the official boundary, the officially registered area and the existing ' +
            'buildings with their floor counts. The ZONING half resolves the calificación, its ' +
            'official designation, the ámbito, the land class and the record\'s validity interval ' +
            "live from Murcia's own municipal planning service. The buildable ENVELOPE REFUSES, and " +
            'for the TA/TM/UA/UH/UM ámbitos that refusal is the ordinance\'s own answer: PGOU Arts. ' +
            '6.6.2 / 5.24.5.1 remit the building conditions to a prior, separately-approved ' +
            'instrument, which PRYZM does not hold. No height, buildability, occupation or setback ' +
            'is published here — never an estimate, never a proxy figure.',
        // §MURCIA-PACK-REGISTERED — the 14 transcribed calificaciones, plus the two sub-variant
        // aliases the live layer publishes (`RF1`→RF, `IXT`→IX), registered as a SECOND tuple so the
        // "14 transcribed" count is never inflated to 16 by aliases. Both lists are DERIVED from the
        // pack, so they cannot drift from it. Gated: see §MURCIA-PACK-REGISTERED above.
        packsByZone: packMap(
            [ES_MURCIA_PGOU2012_PACK, MURCIA_PGOU2012_ZONE_CODES],
            [ES_MURCIA_PGOU2012_PACK, MURCIA_PGOU2012_VARIANT_ZONE_CODES],
        ),
        // No per-zone legal refusal TABLE: the legal refusal is a function of the live ámbito code
        // (`murciaEnvelopeDisposition`), not of a static enumeration.
        refusalFor: () => null,
        // The registry path has no live records, so it makes the weaker, honest claim: a statement
        // about PRYZM's coverage, never about the law.
        noRulePackRefusal: (zoneCode, zoneLabel, knownFacts) =>
            murciaNoRulePackRefusal(zoneCode, zoneLabel ?? null, knownFacts ?? []),
    },
    // ╔══════════════════════════════════════════════════════════════════════════════════════════╗
    // ║ ⚠ START OF THE VALÈNCIA BLOCK (INE 46250, Comunitat Valenciana). Confine València edits  ║
    // ║   to this block — `registry.ts` is a shared collision point.                             ║
    // ╚══════════════════════════════════════════════════════════════════════════════════════════╝
    //
    // ⚠⚠ THE ONLY REGISTRATION IN THIS FILE WHOSE REFUSAL A SIGNATURE CANNOT LIFT, AND THAT IS THE
    // POINT OF REGISTERING IT. Córdoba's pack is gated pending a signature; Murcia's gate has been
    // signed. València's is neither: there is **no number to sign**. The PGOU *Normas Urbanísticas*
    // (Documento Definitivo, mayo 1991) were retrieved from the municipality's own domain, read and
    // transcribed article by article — Arts. 6.3.1 · 6.15 · 6.16 · 6.17 · 6.18 · 6.19 · 6.25.1 ·
    // 6.30.1 · 5.19 — and the transcription is GOOD. It yields no envelope because the plan puts its
    // envelope on a DRAWING: «la altura … en función del número de plantas GRAFIADO EN EL PLANO C»
    // (6.19.1), «la profundidad edificable será la señalada EN EL PLANO C» (6.18.2). PRYZM does not
    // hold Plano C, and no amount of further reading produces it.
    //
    // ⇒ `packsByZone` IS EMPTY, and unlike Córdoba/Murcia that is not a gating decision — it is the
    // RESULT. `ES_VALENCIA_PGOU_PACK.zones` is `[]` by construction. Do not "finish" this by keying
    // a representative Np: `Hc = 4,80 + 2,90·Np` with a guessed Np is a FABRICATED DETERMINATION,
    // not a conservative estimate (L-616 mechanism-A). The pack object exists anyway so the C60
    // coverage probe sees a jurisdiction that is PRESENT with zero zones rather than ABSENT —
    // failure ≠ empty (§CONTEXT-DATA-HONESTY, L-422/457/467/469).
    //
    // ⚠ WHY `noRulePackRefusal` AND NOT A `derived-plan` REFUSAL, given the delegation IS measured.
    // 36,40 % of València's private buildable land (L-656 denominator: `clase = SU` ∧ Art. 6.3.1's
    // six zones = 1 874,9 ha) is ordered by a derived instrument, measured 2026-08-01 over the live
    // `MapServer/231.origen` column with shoelace areas in EPSG:25830. That land is entitled to the
    // STRONGER, legally-grounded `derived-plan` refusal — but only per-parcel, from the live
    // `origen` value, which this table cannot see: the registry path holds a zone code and no
    // record. Issuing the legal claim from here would assert the law on the 63,60 % it does not
    // apply to. So the registry makes the WEAKER, always-true claim about PRYZM's coverage, exactly
    // as Murcia's and Switzerland's registrations do, and the per-parcel legal claim waits for the
    // live `origen` read (CLOSURE-REGISTER #3).
    {
        jurisdictionId: VALENCIA_JURISDICTION_ID, // 'es-46250-valencia'
        displayName: 'València',
        countryCode: 'ES',
        countryName: 'Spain',
        // ⚠ THE SAME OBJECT/FUNCTION `siteDispatch.ts` routes on — imported, not restated.
        extent: VALENCIA_BBOX,
        contains: isInValencia,
        // ⚠ `municipal` is a DECLARATION of what the box was drawn to, not a claim that it equals
        // the term. València's box swallows the whole l'Horta ring (Mislata, Paterna, Burjassot,
        // Xirivella, Alfafar…), every one a different municipality with a different general plan.
        // The authoritative answer is Catastro's own `<cp>`+`<cm>` → 46250 via `composeIneCode()`.
        extentResolution: 'municipal',
        answerSummary:
            'The PARCEL half is complete, live and keyless: the national Catastro path resolves the ' +
            'referencia catastral and the official boundary by identifier, and València ' +
            'independently publishes the cadastral reference on its own municipal parcel layer, so ' +
            'there are two routes and neither needs a licence. The ZONING half is live too — the ' +
            "city's own ArcGIS service returns the calificación, its grade and, unusually, the " +
            'GOVERNING PLAN INSTRUMENT as a column, so PRYZM can name the document that orders a ' +
            'parcel without a second query. The buildable ENVELOPE refuses, and for València the ' +
            "reason is unusually sharp: the general plan's Normas Urbanísticas have been sourced " +
            'and transcribed article by article, and they set the maximum cornice height and the ' +
            'buildable depth by a storey count and a depth GRAPHED ON THE PLANO C SHEETS, which the ' +
            'city does not publish as data. No height, buildability, occupation or setback is ' +
            'published here — never an estimate, never a proxy figure.',
        // ⚠ EMPTY BY CONSTRUCTION, NOT BY GATING. See the block comment above.
        packsByZone: packMap(),
        // No per-zone legal refusal TABLE: València's legal refusal is a function of the live
        // `origen` instrument, not of a static zone enumeration.
        refusalFor: () => null,
        noRulePackRefusal: (zoneCode, zoneLabel, knownFacts) =>
            valenciaNoRulePackRefusal(zoneCode, zoneLabel ?? null, knownFacts ?? []),
    },
    // ╔══════════════════════════════════════════════════════════════════════════════════════════╗
    // ║ ⚠ END OF THE VALÈNCIA BLOCK.                                                             ║
    // ╚══════════════════════════════════════════════════════════════════════════════════════════╝
    // ╔══════════════════════════════════════════════════════════════════════════════════════════╗
    // ║ ⚠ START OF THE SEVILLA BLOCK. Confine Sevilla edits to this block.                       ║
    // ╚══════════════════════════════════════════════════════════════════════════════════════════╝
    // Sevilla (INE 41091) — the first Andalucían ArcGIS-REST-published municipality PRYZM has
    // registered. ⚠ 2026-08-03: `esSevilla.ts` now carries ONE transcribed zone (`SB`, Capítulo
    // V, Arts. 12.5.1-12.5.13) — but `packsByZone` below stays `packMap()` (EMPTY) ON PURPOSE:
    // wiring a per-zone compute path is a SEPARATE decision from transcribing the ordinance, and
    // `siteDispatch.ts`'s dedicated `applySevillaZoningThenFallback` never reads `packsByZone` for
    // Sevilla anyway — it always dispatches `sevillaNoRulePackRefusal` regardless of pack
    // contents. SB additionally hard-refuses at the GEOMETRY level even if a future pass does wire
    // it (see `SEVILLA_SB_FONDO_UNRESOLVED_RING` in `esSevilla.ts`), so this gap costs nothing
    // today; it is a named follow-up, not a silent omission.
    // The city's own ArcGIS service resolves the real `zona_orden` per parcel
    // (`resolveSevillaZone.ts`, layer 25 "Calificación", EPSG:25830 — CONFIRMED live, closing the
    // "CRS: NOT FOUND" gap two prior research passes left open), so `noRulePackRefusal` names the
    // real zone rather than speaking generically — the same shape as `cordobaUnverifiedRefusal`'s
    // conditional copy.
    {
        jurisdictionId: SEVILLA_JURISDICTION_ID, // 'es-41091-sevilla'
        displayName: 'Sevilla',
        countryCode: 'ES',
        countryName: 'Spain',
        // ⚠ THE SAME OBJECT/FUNCTION `siteDispatch.ts` routes on — imported, not restated.
        extent: SEVILLA_BBOX,
        contains: isInSevilla,
        // A loose municipal-term box; it spills into several bordering municipalities exactly as
        // Córdoba's and València's boxes do. See `sevillaBbox.ts`.
        extentResolution: 'municipal',
        answerSummary:
            'The ZONE half is live and keyless: Sevilla\'s own ArcGIS service ' +
            '(Info_Urban_Groups/PGOU/MapServer, layer 25 "Calificación") resolves the zona_orden ' +
            'zone identifier for any point, plus its land classification and the linked Normas ' +
            'documents — an unusually complete published GIS layer set (alignment, height-label, ' +
            'development-planning and modification layers are all published too). One zone (SB, ' +
            '"Suburbana") has been transcribed from its own ordinance PDF; every buildable figure ' +
            'is still refused, either because no other zone has been read yet or because SB\'s own ' +
            'buildable depth is a conditional occupancy rule the pack cannot honestly draw as a ' +
            'scalar — never an estimate, never a guess at what a zone name implies.',
        // ⚠ EMPTY ON PURPOSE, not by lack of transcription — see the comment above the block.
        packsByZone: packMap(),
        // No per-zone legal refusal table: nothing has been read from the ordinance yet, so there
        // is no legally-grounded classification to make — only the coverage-gap card applies.
        refusalFor: () => null,
        noRulePackRefusal: (zoneCode, zoneLabel, knownFacts) =>
            sevillaNoRulePackRefusal(zoneCode, zoneLabel ?? null, knownFacts ?? []),
    },
    // ╔══════════════════════════════════════════════════════════════════════════════════════════╗
    // ║ ⚠ END OF THE SEVILLA BLOCK.                                                               ║
    // ╚══════════════════════════════════════════════════════════════════════════════════════════╝
    // ╔══════════════════════════════════════════════════════════════════════════════════════════╗
    // ║ ⚠ START OF THE MÁLAGA / GRANADA §RESEARCH-PENDING BLOCK.                                  ║
    // ╚══════════════════════════════════════════════════════════════════════════════════════════╝
    // Neither is signable — there is no rulepack to sign. This registration exists ONLY to stop
    // the §L-663 fabrication defect: before it, neither city had an `isInX` branch anywhere, so
    // every click fell through to `applyEstimatedZoning`'s fabricated generic envelope.
    {
        jurisdictionId: MALAGA_JURISDICTION_ID, // 'es-29067-malaga'
        displayName: 'Málaga',
        countryCode: 'ES',
        countryName: 'Spain',
        extent: MALAGA_BBOX,
        contains: isInMalaga,
        extentResolution: 'municipal',
        answerSummary:
            "Málaga's municipal GeoServer publishes 43 feature types including a calificación " +
            'layer and an alignment layer — but every attempted read of a zoning layer fails ' +
            'with an authority-side database access error (control-tested: other layers on the ' +
            'same server serve normally). PRYZM has no zone-identity resolver and no rulepack ' +
            'for Málaga; every parcel receives a cited "not yet researched" refusal, never an ' +
            'estimate.',
        packsByZone: packMap(),
        refusalFor: () => null,
        noRulePackRefusal: () => malagaResearchPendingRefusal(),
    },
    {
        jurisdictionId: GRANADA_JURISDICTION_ID, // 'es-18087-granada'
        displayName: 'Granada',
        countryCode: 'ES',
        countryName: 'Spain',
        extent: GRANADA_BBOX,
        contains: isInGranada,
        extentResolution: 'municipal',
        answerSummary:
            'No planning source, GIS endpoint or zone-classification method has been identified ' +
            'for Granada yet. PRYZM has no zone-identity resolver and no rulepack; every parcel ' +
            'receives a cited "not yet researched" refusal, never an estimate.',
        packsByZone: packMap(),
        refusalFor: () => null,
        noRulePackRefusal: () => granadaResearchPendingRefusal(),
    },
    // ╔══════════════════════════════════════════════════════════════════════════════════════════╗
    // ║ ⚠ END OF THE MÁLAGA / GRANADA BLOCK.                                                      ║
    // ╚══════════════════════════════════════════════════════════════════════════════════════════╝
    // ╔══════════════════════════════════════════════════════════════════════════════════════════╗
    // ║ ⚠ START OF THE CARTAGENA BLOCK. Cartagena (INE 30016) has a LIVE WMS GetFeatureInfo        ║
    // ║ service (`resolveCartagenaZone.ts`) and a real currently-valid R0/1987 rulepack            ║
    // ║ (`esCartagena.ts`), but every zone's setbacks are "mandatory but unquantified" in the       ║
    // ║ source text — so every parcel resolves to a cited, zone-specific structural refusal,        ║
    // ║ never a fabricated box. `CARTAGENA_ENVELOPE_VERIFIED` is `false` — unsigned.                ║
    // ╚══════════════════════════════════════════════════════════════════════════════════════════╝
    {
        jurisdictionId: CARTAGENA_JURISDICTION_ID, // 'es-30016-cartagena'
        displayName: 'Cartagena',
        countryCode: 'ES',
        countryName: 'Spain',
        extent: CARTAGENA_BBOX,
        contains: isInCartagena,
        extentResolution: 'municipal',
        answerSummary:
            "Cartagena's `wms_RPG0` WMS service (the currently-valid 1987 PGMO, reinstated after " +
            "the 2012 revision's annulment) resolves a parcel's block, matrícula and zone-family " +
            'code live. PRYZM has a rulepack for the Vc1/Vc2/Vu1 residential zones citing PGMO 1987 ' +
            'Título Cuarto, but the "retranqueos a vial obligatorios" (mandatory road setbacks) are ' +
            'not quantified in the base ordinance text, so every parcel receives a cited, ' +
            'zone-specific structural refusal rather than a computed envelope.',
        packsByZone: packMap(),
        refusalFor: () => null,
        noRulePackRefusal: (zoneCode?: string | null) => cartagenaNoRulePackRefusal(zoneCode),
    },
    // ╔══════════════════════════════════════════════════════════════════════════════════════════╗
    // ║ ⚠ END OF THE CARTAGENA BLOCK.                                                              ║
    // ╚══════════════════════════════════════════════════════════════════════════════════════════╝
    // ╔══════════════════════════════════════════════════════════════════════════════════════════╗
    // ║ ⚠ START OF THE SECOND MURCIA-REGION BLOCK — Lorca / Molina de Segura / Alcantarilla /      ║
    // ║ Las Torres de Cotillas (2026-08-04). Four §RESEARCH-PENDING registrations; none has a       ║
    // ║ rulepack. This registration exists ONLY to stop the §L-663 fabrication defect for these     ║
    // ║ four municipalities — before it, none had an `isInX` branch, so every click fell through    ║
    // ║ to the estimated triple.                                                                    ║
    // ╚══════════════════════════════════════════════════════════════════════════════════════════╝
    {
        jurisdictionId: LORCA_JURISDICTION_ID, // 'es-30024-lorca'
        displayName: 'Lorca',
        countryCode: 'ES',
        countryName: 'Spain',
        extent: LORCA_BBOX,
        contains: isInLorca,
        extentResolution: 'municipal',
        answerSummary:
            "A parcel/point→ordinance query mechanism was located in Lorca's live viewer's own " +
            'production JavaScript bundle, but it requires a runtime session token automated ' +
            'fetch could not obtain, so it was never fired against a real coordinate. PRYZM has ' +
            'no working zone-identity resolver and no rulepack for Lorca; every parcel receives a ' +
            'cited "identified, not yet reachable" refusal, never an estimate.',
        packsByZone: packMap(),
        refusalFor: () => null,
        noRulePackRefusal: () => lorcaResearchPendingRefusal(),
    },
    {
        jurisdictionId: MOLINA_DE_SEGURA_JURISDICTION_ID, // 'es-30027-molina-de-segura'
        displayName: 'Molina de Segura',
        countryCode: 'ES',
        countryName: 'Spain',
        extent: MOLINA_DE_SEGURA_BBOX,
        contains: isInMolinaDeSegura,
        extentResolution: 'municipal',
        answerSummary:
            "Molina de Segura's public zoning viewer is white-labelled on a third-party SaaS SPA " +
            "whose backend API could not be enumerated by static fetch, and the city's own " +
            'ordinance PDFs carry image/vector-drawn tables that are not yet OCR\'d. PRYZM has no ' +
            'working zone-identity resolver and no rulepack; every parcel receives a cited ' +
            '"identified, not yet reachable" refusal, never an estimate.',
        packsByZone: packMap(),
        refusalFor: () => null,
        noRulePackRefusal: () => molinaDeSeguraResearchPendingRefusal(),
    },
    {
        jurisdictionId: ALCANTARILLA_JURISDICTION_ID, // 'es-30005-alcantarilla'
        displayName: 'Alcantarilla',
        countryCode: 'ES',
        countryName: 'Spain',
        extent: ALCANTARILLA_BBOX,
        contains: isInAlcantarilla,
        extentResolution: 'municipal',
        answerSummary:
            "CARM's own regional WFS resolves a COARSE, non-binding land-use classification for " +
            "any point in Alcantarilla, live. The operative 1983 PGOU's two ordinance source " +
            'documents (which would carry height/FAR/coverage/setback numbers) are hosted ' +
            'exclusively on SharePoint links that return HTTP 403 to automated fetch. PRYZM has ' +
            'no rulepack; every parcel receives a cited refusal, land-use-class-named when the ' +
            'live WFS resolves a feature, never an estimate.',
        packsByZone: packMap(),
        refusalFor: () => null,
        noRulePackRefusal: (_zoneCode, _zoneLabel, knownFacts) =>
            alcantarillaNoRulePackRefusal(null, knownFacts ?? []),
    },
    {
        jurisdictionId: LAS_TORRES_DE_COTILLAS_JURISDICTION_ID, // 'es-30038-las-torres-de-cotillas'
        displayName: 'Las Torres de Cotillas',
        countryCode: 'ES',
        countryName: 'Spain',
        extent: LAS_TORRES_DE_COTILLAS_BBOX,
        contains: isInLasTorresDeCotillas,
        extentResolution: 'municipal',
        answerSummary:
            'A real parcel-level zoning digitization exists for Las Torres de Cotillas, but it ' +
            'lives inside a commercial third-party SaaS (VisualUrb) that returns HTTP 401 without ' +
            'a paid licence, and the one municipal PDF carrying the UE/UZE setback figures ' +
            'returned corrupted/binary to automated extraction. PRYZM has no working zone-identity ' +
            'resolver and no rulepack; every parcel receives a cited "digitized but commercially ' +
            'gated" refusal, never an estimate.',
        packsByZone: packMap(),
        refusalFor: () => null,
        noRulePackRefusal: () => lasTorresDeCotillasResearchPendingRefusal(),
    },
    // ╔══════════════════════════════════════════════════════════════════════════════════════════╗
    // ║ ⚠ END OF THE SECOND MURCIA-REGION BLOCK.                                                   ║
    // ╚══════════════════════════════════════════════════════════════════════════════════════════╝
    // ╔══════════════════════════════════════════════════════════════════════════════════════════╗
    // ║ ⚠ START OF THE ARAGÓN BLOCK. Confine Aragón edits to this block.                         ║
    // ╚══════════════════════════════════════════════════════════════════════════════════════════╝
    // Both are REFUSAL jurisdictions with EMPTY `packsByZone`, for two DIFFERENT and specific
    // reasons — neither of them legislative. Huesca's ordinance is fully read and article-cited
    // but remits the depth and the storey count to a 1:1.000 plan sheet that is not yet
    // georeferenced; Zaragoza serves live parcel-precision zoning but withholds the one attribute
    // (the A1 subgrado) that selects the aprovechamiento article. See `esAragon.ts`.
    {
        jurisdictionId: HUESCA_JURISDICTION_ID,
        displayName: 'Huesca',
        countryCode: 'ES',
        countryName: 'Spain',
        extent: HUESCA_BBOX,
        contains: isInHuesca,
        extentResolution: 'municipal',
        answerSummary:
            'The PARCEL half is complete and keyless — the national Catastro path resolves the ' +
            'referencia catastral and the official boundary. The ORDINANCE has been read and ' +
            'transcribed article by article: PGOU Huesca (texto refundido 2008 of the 2003 plan) ' +
            'art. 8.4.8 defines the buildable footprint from the alineación oficial, the side ' +
            'boundaries and the línea de fondo edificable, and art. 8.4.10 sets height by the ' +
            'storey count drawn on plano nº 5. The buildable ENVELOPE refuses, and the reason is ' +
            'a DATA reason, not a legal one: both numbers are graphed on a 1:1.000 plan sheet. ' +
            'That sheet has been proven to be VECTOR CAD rather than an image, its legend has ' +
            'been read and its line styles bound — but it is not yet positioned on the ground ' +
            '(the best candidate fix was rejected at a 2.31 m median error, only 1.9× better ' +
            'than a deliberately wrong control offset). And the sheet draws the buildable-depth ' +
            'line and the height-change line in the SAME style under one legend caption, so even ' +
            'once positioned, that particular line cannot yet be attributed to one meaning. The ' +
            'written 20 m default is expressly overridden by the drawing and governs only one of ' +
            'two grades, so it is not a usable substitute. No height, buildability, occupation ' +
            'or depth is published here — never an estimate, never a proxy figure.',
        // ⚠ EMPTY BY CONSTRUCTION, as València: there is no zone code to key a pack to while the
        // governing figures live on an unpositioned drawing.
        packsByZone: packMap(),
        refusalFor: () => null,
        noRulePackRefusal: (zoneCode, zoneLabel, knownFacts) =>
            huescaNoRulePackRefusal(zoneCode, zoneLabel ?? null, knownFacts ?? []),
    },
    {
        jurisdictionId: ZARAGOZA_JURISDICTION_ID,
        displayName: 'Zaragoza',
        countryCode: 'ES',
        countryName: 'Spain',
        extent: ZARAGOZA_BBOX,
        contains: isInZaragoza,
        // `municipal` — the box is drawn to the término municipal, which for Zaragoza is
        // unusually large (973 km²) and contains 14 barrios rurales that are separate urban
        // nuclei. The authoritative answer stays Catastro <cp>+<cm> → 50297 via composeIneCode().
        extentResolution: 'municipal',
        answerSummary:
            'The PARCEL half is complete and keyless — the national Catastro plus the city’s own ' +
            'parcel layer, two independent routes. The ZONING half is LIVE: the municipal GIS ' +
            'serves 9,031 calificación polygons in EPSG:25830 across a 42-code vocabulary, 100% ' +
            'populated, at parcel precision — NOT the 1:15,000 regional layer, whose 21.8% ' +
            'legal-approval ceiling was measured NOT to bind on 97.9% of a 421-parcel sample. ' +
            'The governing instrument is served too: 525 ámbitos with links to their own normas ' +
            'and planos. ⚠ Arts. 4.1.12/4.1.13/4.1.15/4.1.17 (subgrados A1/3.1, A1/3.2, A1/4.1, ' +
            'A1/4.2) are now TRANSCRIBED and REGISTERED — but the buildable ENVELOPE still ' +
            'refuses: no human has signed off the transcription (`ZARAGOZA_ENVELOPE_VERIFIED` is ' +
            'false, the Córdoba discipline), and the live calificación feed the dispatch reads ' +
            'still resolves only the coarse "A1" code, not the subgrado a pack needs to key on. ' +
            'No height, buildability, occupation or depth is published here — never an estimate, ' +
            'never a proxy figure.',
        // ⚠⚠ GATED, NOT EMPTY. Unlike Huesca/València, Zaragoza now HAS 4 transcribed subgrados
        // (`esZaragoza.ts`). Exposing them through `packsByZone` unconditionally would let a FUTURE
        // subgrado-resolving caller reach a machine/human-transcribed-but-UNSIGNED number the
        // moment such a resolver is wired — before any human has verified this transcription. So
        // the map itself is gated on `ZARAGOZA_ENVELOPE_VERIFIED` (imported from `esAragon.js`,
        // the ONE declaration — see the import comment), mirroring `applyCordobaZoningThenFallback`'s
        // dispatcher-level gate check one layer up, at the point where a number could otherwise
        // leak through even without a live L5 dispatch function. While the gate is false this is
        // `packMap()` — empty — and every subgrado code falls through to the coverage-gap refusal
        // below, exactly as before this pack existed.
        packsByZone: ZARAGOZA_ENVELOPE_VERIFIED
            ? packMap([ES_ZARAGOZA_PGOU2024_PACK, [...ZARAGOZA_ZONE_CODES]])
            : packMap(),
        // Refusal is a function of the live zone, not of a static enumeration.
        refusalFor: () => null,
        noRulePackRefusal: (zoneCode, zoneLabel, knownFacts) =>
            zaragozaNoRulePackRefusal(zoneCode, zoneLabel ?? null, knownFacts ?? []),
    },
    // ╔══════════════════════════════════════════════════════════════════════════════════════════╗
    // ║ ⚠ END OF THE ARAGÓN BLOCK.                                                               ║
    // ╚══════════════════════════════════════════════════════════════════════════════════════════╝
    // ── L-449 SIGNED (Denmark, national) — Plandata.dk → buildable envelope, the FIRST fully-automated
    //    (OFFLINE-legislation) jurisdiction. UNLIKE the ES refusal-jurisdictions above, Denmark
    //    genuinely ANSWERS with real structured numbers — but its pack is resolved LIVE, PER PARCEL,
    //    from the Plandata WFS attributes by the L5 dispatch (`applyDkZoningThenFallback` →
    //    `dkPlandataResolvedPack`), not from a static zone-code table. So `packsByZone` is deliberately
    //    EMPTY and this registration's job is to LIGHT THE C60 COVERAGE GLOBE (Denmark is covered).
    //    The per-parcel HONEST outcomes (no-numbers / no-plan / unreachable refusals) are owned by that
    //    dispatch path, which does NOT consult `resolveZoneDisposition`; hence `refusalFor` returns null
    //    and no coverage-gap `noRulePackRefusal` is declared (a DK parcel is never handed the generic
    //    estimated fallback — the DK dispatch answers or honestly refuses it).
    {
        jurisdictionId: DK_PLANDATA_JURISDICTION_ID, // 'dk'
        displayName: 'Denmark (Plandata.dk)',
        countryCode: 'DK',
        countryName: 'Denmark',
        // ⚠ THE SAME OBJECT/FUNCTION the DK dispatch routes on — imported, not restated.
        extent: DENMARK_BBOX,
        contains: isInDenmark,
        // National. ⚠ §EXTENT-SPILLS-A-BORDER (header): this rectangle also claims Malmö,
        // Gothenburg and Flensburg. Registering SE / DE closes each by rule, with no edit here.
        extentResolution: 'national',
        answerSummary:
            'National Plandata.dk structured planning attributes → a buildable envelope under the ' +
            'L-449 signed BR18 §168–186 mapping (FAR = bebyggelsesprocent/100 with the density-scope ' +
            'caveat honoured; maximum height + storeys pass through). Resolved LIVE per parcel; when a ' +
            'plan publishes no renderable number (or none is adopted at the point) PRYZM refuses ' +
            'honestly, never an estimate.',
        // Resolved live per-parcel via `dkPlandataResolvedPack` — no static zone-code pack table.
        packsByZone: packMap(),
        // The live DK dispatch owns the per-parcel refusal outcomes; the registry path has no live plan.
        refusalFor: () => null,
    },
    // ── PARIS (INSEE 75056, Ville de Paris) — PLU bioclimatique, `FR_PARIS_PLU_CERTIFIED` ON. ────
    //
    // ⚠⚠ THIS REGISTRATION IS THE SLOT THAT WAS MISSING, AND ONLY THAT SLOT. Unlike Murcia, Paris
    // was NOT an orphan: the S2 gate (`isInParis`), the S3 resolver (`resolveParisEnvelope`) and the
    // L5 dispatch (`applyParisZoningThenFallback`) all shipped and all run on a click. What did not
    // ship was S5 — so France was DARK on the C60 coverage globe while the engine was, in fact,
    // drawing real published geometry there. A globe that under-states what the engine does is the
    // same class of defect as one that over-states it: both make the globe a second, drifting
    // statement of coverage, which is exactly what C60 §2 forbids.
    //
    // ⚠ DENMARK'S SHAPE, NOT BARCELONA'S — `packsByZone` IS DELIBERATELY EMPTY. Paris genuinely
    // ANSWERS with real numbers, but they are not in a static zone→pack table: `computeParisEnvelope`
    // extrudes the PUBLISHED `plub_ecm` buildable-footprint POLYGON (real geometry, resolved live per
    // parcel) to the published `plub_hauteur` ceiling. `FR_PARIS_PLU_PACK` exists but is a
    // DECLARATION of the rule's SHAPE; its UG zone carries `setbacks: 0/0/0`, which is the SUPERSEDED
    // "emprise = the parcel" assumption the ECM engine replaced. Putting it in `packsByZone` would
    // let any registry-path consumer inset a Paris parcel by 0/0/0 — i.e. publish the WHOLE PARCEL as
    // buildable under a Paris citation. That is the §L-616 OVERSTATES defect, and an empty map is
    // what forecloses it.
    //
    // ⚠ AND NO `noRulePackRefusal`, FOR A REASON WORTH READING. Madrid/Murcia/CH declare one; Paris
    // must not. Every Paris refusal that exists (`parisPluEnvelopeRefusal`, the engine's component
    // refusals) is a statement ABOUT A LIVE FETCH — "the ECM did not cover this point", "no published
    // height here". On the registry path no fetch happened, so quoting any of them would assert a
    // query PRYZM never made. Authoring a new coverage refusal instead would be a fiction about a
    // jurisdiction that is fully covered. Denmark faced the identical choice and resolved it the same
    // way: the dispatch owns every per-parcel outcome and never falls to the estimated triple (it
    // returns before `applyEstimatedZoning` in all branches), so nothing is left for this slot to say.
    //
    // GRANULARITY: PARCEL. The ECM footprint and the hauteur plafond are both published per-parcel
    // (the ECM carries the `c_asp` cadastral join), not per-block and not per-arrondissement.
    // RULE KIND: `explicit-area` (ADR-0270) — the ordinance publishes the buildable footprint AS
    // GEOMETRY. It is NOT a setback rule and NOT an alignment rule; a front/side/rear triple here
    // would be a wrong SHAPE, not a wrong number, and no confidence chip corrects that (C58 §2.2).
    {
        jurisdictionId: PARIS_JURISDICTION_ID, // 'fr-75056-paris'
        displayName: 'Paris (Ville de Paris)',
        countryCode: 'FR',
        countryName: 'France',
        // ⚠ THE SAME OBJECT/FUNCTION `siteDispatch.ts` routes on — imported, not restated.
        extent: PARIS_BBOX,
        contains: isInParis,
        // The Ville de Paris commune (INSEE 75056). Overlaps nothing registered — and would BEAT a
        // future Île-de-France / Grand Paris registration on its own territory, which is correct:
        // the PLU bioclimatique is the commune's own instrument.
        extentResolution: 'municipal',
        answerSummary:
            'PLU bioclimatique (règlement voted by the Conseil de Paris). PRYZM draws the PUBLISHED ' +
            'emprise constructible maximale — the real buildable-footprint polygon from Paris ' +
            'opendata plub_ecm — extruded to the published hauteur plafond (plub_hauteur, ' +
            'UG.3.2.1), with the zone identity read from the national Géoportail de l\'urbanisme. ' +
            'Per-parcel, never parcel-area × height. Where no ECM polygon covers the point, or no ' +
            'height is published, PRYZM refuses with a citation rather than estimate; the ' +
            'couronnement (UG.3.2.4) is a cited PARTIAL refusal when the crown code is withheld.',
        // Resolved live per parcel from the published ECM geometry — no static zone-code pack table.
        // ⚠ See the block comment: registering the pack here would re-enable a full-parcel envelope.
        packsByZone: packMap(),
        // The live Paris dispatch owns every per-parcel outcome; the registry path has no live ECM.
        refusalFor: () => null,
    },
    // ── NETHERLANDS (national) — bestemmingsplan, `NL_BESTEMMINGSPLAN_CERTIFIED` ON. ─────────────
    //
    // ⚠ SAME MISSING SLOT AS PARIS ABOVE, AND THE PACK ITSELF ASKED FOR THIS. `nlBestemmingsplan.ts`
    // carries a REGISTRATION NOTE reading: "This file is intentionally NOT imported by registry.ts…
    // If a `JurisdictionRegistration` is ever added to the coverage globe, its extent is the national
    // NL bbox + `contains` predicate." That is precisely what this is — the national bbox and the
    // national predicate the dispatch ALREADY gates on (`isInNetherlands`), imported rather than
    // restated so the globe cannot light a region the dispatcher would not route into.
    //
    // ⚠ `packsByZone` EMPTY — and here the reason is sharper than Paris's. `NL_ZONE_CODE` is
    // `'nl:bouwvlak'`, a SYNTHETIC handle PRYZM invented to key one explicit-area rule; it is not a
    // Dutch bestemming and appears in no plan. Listing it as a covered "zone code" on the globe would
    // publish our own internal token as though it were a legal category. The real bestemming (Wonen /
    // Gemengd / Bedrijf …) rides on the per-parcel ZoningRecord, live.
    //
    // NL is the strongest structured case PRYZM holds: the `maatvoering` objects carry SVBP2012
    // typeringen with STATED units, so a clean "maximum bouwhoogte (m)" is a genuine
    // `published-structured` metre value (Rotterdam 40 m / Utrecht 26 m / Groningen 24 m, verified
    // live 2026-07-26) — unlike Madrid's COEF_Z, whose FAR semantics stay withheld.
    //
    // ⚠ NO `noRulePackRefusal`, for the identical reason given at Paris: both NL refusals
    // (`nlBestemmingsplanRefusal` = "the PDOK service was temporarily unreachable…retried
    // automatically"; `nlNoPlanRefusal` = "PRYZM queried the WMS at this parcel and it answered…")
    // assert a fetch that the registry path did not perform. Quoting either would be a false
    // statement about our own data path — the §CONTEXT-DATA-HONESTY failure in miniature.
    //
    // GRANULARITY: PARCEL for the bouwvlak case; the §NL-SPARSE-FALLBACK case is the ZONE
    // (bestemmingsvlak) extent, which the dispatch renders as an explicit UPPER BOUND at reduced
    // confidence with a caveat saying so — never presented as a parcel-precise footprint.
    // RULE KIND: `explicit-area` (ADR-0270) — the plan publishes the bouwvlak AS GEOMETRY.
    {
        jurisdictionId: NL_JURISDICTION_ID, // 'nl-bestemmingsplan'
        displayName: 'Netherlands (bestemmingsplan)',
        countryCode: 'NL',
        countryName: 'Netherlands',
        // ⚠ THE SAME OBJECT/FUNCTION the NL dispatch routes on — imported, not restated.
        extent: NETHERLANDS_BBOX,
        contains: isInNetherlands,
        // National. ⚠ §EXTENT-SPILLS-A-BORDER (header) — the WORST of the three: this rectangle
        // claims Brussels, Antwerp, Düsseldorf and Cologne, so a Belgian or NRW click is answered
        // with `nlNoPlanRefusal`, a DUTCH instrument cited on foreign land. Registering BE / DE-NW
        // closes it by rule with no edit here; nothing short of real boundary geometry closes it
        // otherwise, and PRYZM holds none.
        extentResolution: 'national',
        answerSummary:
            'Every officially-published bestemmingsplan, nationwide and keyless, via the PDOK ' +
            '"Ruimtelijke plannen" WMS. PRYZM clips your parcel to the published bouwvlak ' +
            '(IMRO2012 / SVBP2012 — real geometry) and applies the plan\'s own maatvoering: ' +
            'maximum bouwhoogte (m), maximum bebouwingspercentage (%), maximum aantal bouwlagen — ' +
            'structured values with stated units. Where a plan publishes no bouwvlak, the zone ' +
            'extent is drawn as a clearly-labelled UPPER BOUND at reduced confidence; where neither ' +
            'is published, PRYZM refuses with a citation rather than estimate.',
        // Resolved live per parcel from the plan's bouwvlak + maatvoering — no static zone-code table.
        packsByZone: packMap(),
        // The live NL dispatch owns every per-parcel outcome; the registry path has no live plan.
        refusalFor: () => null,
    },
    // ═══════════════════════════════════════════════════════════════════════════════════════════
    // CATALONIA (regional) — THE ANSWER OF LAST RESORT FOR 947 MUNICIPALITIES.
    // ═══════════════════════════════════════════════════════════════════════════════════════════
    //
    // ⚠⚠ THIS REGISTRATION MUST STAY LAST, AND `'regional'` IS WHY IT CAN BE. Every other entry
    // above claims a district, a municipality, a metropolitan area or a state. This one claims an
    // AUTONOMOUS COMMUNITY, and it FULLY CONTAINS six registrations already in this list —
    // Barcelona, L'Hospitalet, Badalona, Sant Boi, Cornellà and (partly) nothing else Spanish.
    // Under §JURISDICTION-SPECIFICITY every one of them out-ranks it automatically, because
    // `'regional'` is coarser than both `'metropolitan'` and `'municipal'`. That is the entire
    // mechanism: **registering the 7th, 40th or 300th Catalan municipality is a pure DATA
    // addition** — a new registration at a finer rung simply wins its own land, with no edit to
    // this entry, no re-ordering, and no peel-off predicate. Contrast the four AMB municipalities,
    // whose precedence over Barcelona had to be discovered and fixed (§LH-ENVELOPE).
    //
    // ── WHAT PROBLEM IT ACTUALLY SOLVES ────────────────────────────────────────────────────────
    // Before it, a click anywhere in Catalonia outside the six registered municipalities reached NO
    // registered jurisdiction, so `resolveZoneDisposition` answered `'unregistered'` and the caller
    // fell through to the ESTIMATED fallback — a generic setback triple, on land PRYZM had never
    // read one article about. That is ~940 municipalities, including Girona, Lleida and Tarragona.
    //
    // ⚠ AND "REGISTER CATALONIA" DOES NOT MEAN "COVER CATALONIA WITH AN ENVELOPE". It cannot. The
    // PGM-1976 governs 27 municipalities (NNUU Art. 1.1 → the pre-2011 Entitat Municipal
    // Metropolitana, Decret llei 5/1974; see `esAmbPgmScope.ts` — AMB membership does NOT imply PGM
    // coverage), and each of the other ~920 has its own POUM, PGOU or Normes Subsidiàries. There is
    // no shared ordinance to transcribe, so `packsByZone` is EMPTY BY CONSTRUCTION and always will
    // be. What this registration delivers is ANSWER CORRECTNESS, not envelope coverage: a click
    // resolves its municipality, resolves its planning qualification live from the MUC, and gets a
    // refusal that NAMES THE INSTRUMENT which actually governs that land.
    //
    // ── WHY THAT REFUSAL IS WORTH SHIPPING (measured 2026-07-31, see `esCatalunya.ts`) ─────────
    //   • the MUC qualification layer answers for 947 / 947 municipalities — 0 genuine empties and,
    //     critically, 0 FETCH FAILURES, so the 947 is a measurement and not a masked outage;
    //   • the harmonised vocabulary is exactly 36 codes over a complete 546 696-row scan, and the
    //     `S…` (*sistema*) family alone is 36.0 % of Catalonia's qualification polygons — land the
    //     coarse code classifies CORRECTLY as carrying no private envelope, which is a legally
    //     grounded answer rather than a coverage gap;
    //   • `MUC:MUCVW_AMBIT_PG_INE` registers 8 396 general-planning expedients over 935 / 947
    //     municipalities (98.7 %), every one carrying a deep link into the Registre de Planejament
    //     Urbanístic de Catalunya. Girona resolves to its Revisió del PGOU (2001/001092/G), Lleida
    //     to 2002/000069/L, Tarragona to the Normes de Planejament Urbanístic 2021/075037/T (its
    //     POUM having been annulled — the register is RIGHT about that), Lladorre to its POUM.
    //
    // ⚠ NEVER A NUMBER. The MUC publishes a qualification CODE, not parameters — no height, no
    // edificabilitat, no occupation, no setback, for any municipality. And the harmonised code is a
    // WEAKER EVIDENCE TIER than a per-clau ordinance table (it is coarser by construction: 13a and
    // 13b are both `R2`), which the refusal copy states plainly rather than dressing up as an
    // article citation — the identical discipline `esBarcelonaZoneClassification.ts` already ships.
    //
    // ⚠ §CATALUNYA-SPILL — a rectangle cannot follow a border, and this one over-claims into Aragó,
    // the Comunitat Valenciana, Andorra and southern France. UNLIKE the NL/DK/CH spills recorded in
    // the header, this one is CLOSED — not by geometry, but by moving the decisive test onto the
    // INE code: `catalunyaNoRulePackRefusal()` refuses to emit a Catalan citation for any INE whose
    // province prefix is not 08/17/25/43. The globe may over-light; the CITATION cannot.
    {
        jurisdictionId: CATALUNYA_JURISDICTION_ID, // 'es-ct-catalunya'
        displayName: 'Catalonia (Mapa Urbanístic de Catalunya)',
        countryCode: 'ES',
        countryName: 'Spain',
        // ⚠ THE SAME OBJECT/FUNCTION any Catalonia dispatch routes on — imported, not restated.
        extent: CATALUNYA_BBOX,
        contains: isInCatalunya,
        // ⚠ `'regional'` — the rung added FOR this registration (§CATALUNYA-REGIONAL-RUNG). An
        // autonomous community: coarser than Barcelona's metropolitan box, finer than a state.
        extentResolution: 'regional',
        answerSummary:
            'Everywhere in Catalonia — all 947 municipalities — PRYZM resolves your parcel from the ' +
            'national Catastro and its planning qualification live from the Generalitat’s Mapa ' +
            'Urbanístic de Catalunya (measured 2026-07-31: the qualification layer answers for ' +
            '947/947, with zero fetch failures). For 935 of the 947 it also names the instrument ' +
            'that governs the land — the POUM, PGOU or Normes Subsidiàries — resolved by testing ' +
            'which plan boundary contains your parcel, with a direct link to its record in the ' +
            'Registre de Planejament Urbanístic de Catalunya. The buildable ENVELOPE refuses, and ' +
            'for public systems (36 % of Catalan qualification polygons) and non-urbanisable soil ' +
            'that refusal is a legally grounded answer rather than a gap. PRYZM publishes NO ' +
            'height, buildability, occupation or setback here: the MUC gives a qualification code, ' +
            'not parameters, and no single ordinance governs 947 municipalities. Envelope coverage ' +
            'grows one municipality at a time, and each one out-ranks this answer automatically.',
        // EMPTY BY CONSTRUCTION — there is no Catalonia-wide ordinance to key a pack on. This is
        // not a TODO; see the block comment above.
        packsByZone: packMap(),
        // No per-zone legal refusal TABLE: the legal classification is a function of the LIVE
        // harmonised MUC code (`classifyMucHarmonisedCode`), not of a static enumeration — and the
        // registry path has no live code. The dispatcher path supplies the specific, cited one.
        refusalFor: () => null,
        // Every Catalan zone code → the cited Catalonia refusal. ⚠ On THIS path no fetch has
        // happened, and `catalunyaRegistryRefusal` says so with an explicit `'not-attempted'`
        // rather than claiming a lookup failed — asserting a query PRYZM never made is the mistake
        // Paris and the Netherlands avoid above by declaring no hook at all. Catalonia cannot take
        // that option (answering where nothing else does is its entire purpose), so it carries the
        // honest fourth value instead.
        noRulePackRefusal: (zoneCode, zoneLabel, knownFacts) =>
            catalunyaRegistryRefusal(zoneCode ?? null, zoneLabel ?? null, knownFacts ?? []),
    },
    // ╔════════════════════════════════════════════════════════════════════════════════════════╗
    // ║ ⚠ START OF THE TELDE / CANARIAS BLOCK (INE 35026, Gran Canaria).                        ║
    // ╚════════════════════════════════════════════════════════════════════════════════════════╝
    //
    // ⚠ REGISTERED-AND-REFUSING, like Córdoba. `packsByZone` is POPULATED (unlike València, whose
    // zones array is empty BY CONSTRUCTION) — Canarias publishes real numbers, as named columns in
    // SIPU `EDIF.mdb`. What is missing is a SIGNATURE, so `CANARIAS_ENVELOPE_VERIFIED` (false)
    // keeps every parcel on a cited refusal. Registering it lights the C60 coverage globe
    // honestly: PRESENT with zones and gated, rather than ABSENT — failure ≠ empty
    // (§CONTEXT-DATA-HONESTY, L-422/457/467/469).
    //
    // ⚠⚠ THE DEFECT THIS CLOSES, MEASURED ON THIS BRANCH, NOT ASSUMED. The adapter, the pack and
    // its 27 known-answer tests all landed in f29820db — and NOT ONE Telde parcel could reach
    // them, because there was no registration and no bbox to register. `teldeRouting.test.ts`
    // proved it first: at the real Catastro parcel 8969903DS5997S,
    // `resolveRegisteredJurisdictionAt` returned `{ kind: 'none' }` against 16 registrations, none
    // claiming the point. `'none'` is NOT a refusal — it is read downstream as genuinely-uncovered
    // land, so the parcel fell onto `applyEstimatedZoning` and PRYZM published a FABRICATED
    // envelope on Canarian soil (§L-663). The hole was in the REGISTRY, not the chokepoint.
    //
    // ⚠ SCOPE IS 41 MUNICIPALITIES, NOT 88, AND ONLY TELDE IS WIRED. The other 46 publish 2+ base
    // instruments and Canarias publishes NO vigencia field in any SIPU family, so their governing
    // plan is undeterminable — `CANARIAS_MULTI_INSTRUMENT_BLOCKER` in `esCanariasSipu.ts` names
    // that blocker. Telde itself is registered on the adaptación-PLENA argument, which is
    // ASSERTED-UNVERIFIED. Registering the rest is a pure DATA addition, one box at a time.
    {
        jurisdictionId: TELDE_JURISDICTION_ID, // 'es-35026-telde'
        displayName: 'Telde',
        countryCode: 'ES',
        countryName: 'Spain',
        // ⚠ THE SAME OBJECT/FUNCTION any Telde dispatch routes on — imported, not restated.
        extent: TELDE_BBOX,
        contains: isInTelde,
        // The Telde municipal term (≈ 12 × 17 km). ⚠ The box spills into Valsequillo (INE 35031) —
        // measured, not feared; see §TELDE-BBOX-SPILL in `teldeBbox.ts` for why it is left wide and
        // how the INE code closes the citation.
        extentResolution: 'municipal',
        answerSummary:
            'The Gobierno de Canarias publishes every municipal plan as a SIPU package, and inside ' +
            'it EDIF.mdb carries the built-form parameters as NAMED NUMERIC COLUMNS — setbacks, ' +
            'buildable depth, coverage, FAR, storeys, and height with the DATUM disambiguated by ' +
            'schema (street vs parcel). That is machine-readable published data, not a PDF ' +
            'transcription, and it names BOTH geometric grammars PRYZM implements. PRYZM reads it ' +
            'and still publishes NO number: nobody has signed the reading against the plan’s own ' +
            'Normas Urbanísticas, so every parcel gets a cited refusal. Zones whose building line ' +
            'the plan puts on a DRAWING (DispObl = GRF) refuse on stronger, legally-grounded terms ' +
            'and will keep refusing after any signature.',
        packsByZone: packMap([ES_TELDE_PGO2003_PACK, TELDE_PGO2003_ZONE_CODES]),
        // No per-zone legal refusal TABLE: the refusal is a function of the SIPU grammar detected
        // on the live row, not of a static enumeration.
        refusalFor: () => null,
        // Every Telde zone code → the cited Canarias refusal.
        noRulePackRefusal: (zoneCode, zoneLabel, knownFacts) =>
            canariasNoRulePackRefusal(zoneCode, zoneLabel ?? null, knownFacts ?? []),
    },
    // ╔════════════════════════════════════════════════════════════════════════════════════════╗
    // ║ ⚠ END OF THE TELDE / CANARIAS BLOCK.                                                    ║
    // ╚════════════════════════════════════════════════════════════════════════════════════════╝
    // ╔════════════════════════════════════════════════════════════════════════════════════════╗
    // ║ ⚠ EL SAUZAL / CANARIAS BLOCK — the second bespoke municipality (§CANARIAS-88-REGISTRATION,║
    // ║   2026-08-03), excluded from the generic 86 for the same reason Telde is.               ║
    // ╚════════════════════════════════════════════════════════════════════════════════════════╝
    //
    // El Sauzal's SIPU package carries NO `EDIF.mdb` (unlike Telde) — its ZUSO shapefile is a
    // zoning-USE geometry layer with no numeric column at all (a proper DBF header parse, not a
    // grep, confirmed this — `resolveElSauzalZone.ts`). The numeric envelope here instead comes
    // from the PGOU's own "Normativa Urbanística" (Título X Cap. 3, Ciudad Jardín, Arts.
    // 10.24-10.32) — human/agent-transcribed, article-cited, real. ⚠⚠ STILL GATED SHUT:
    // `EL_SAUZAL_ENVELOPE_VERIFIED` is `false`, so `packsByZone` below is EMPTY while the gate is
    // shut (the Zaragoza pattern) — every RE-ViUf-* code, packed or not, falls through to
    // `elSauzalNoRulePackRefusal` until a human signs off. See `esElSauzal.ts` for the two named
    // gaps (`EL_SAUZAL_FICHERO_ANEXO_GAP`, `EL_SAUZAL_TYPOLOGY_BINDING_INFERENCE`) that keep the
    // gate closed even once transcribed.
    {
        jurisdictionId: EL_SAUZAL_JURISDICTION_ID, // 'es-38041-el-sauzal'
        displayName: 'El Sauzal',
        countryCode: 'ES',
        countryName: 'Spain',
        // ⚠ THE SAME OBJECT/FUNCTION any El Sauzal dispatch would route on — imported, not restated.
        extent: EL_SAUZAL_BBOX,
        contains: isInElSauzal,
        extentResolution: 'municipal',
        answerSummary:
            "El Sauzal's own SIPU zoning-use geometry (ZUSO, 529 polygons, 70-code ETIQUETA " +
            'vocabulary) resolves a parcel to its real zone code OFFLINE, from a committed extract ' +
            "of the municipality's own published package — not a live service, since El Sauzal " +
            'publishes none. For the RE-ViUf-* ("Ciudad Jardín") family, the PGOU\'s Normativa ' +
            'Urbanística (Título X, Cap. 3, Arts. 10.24-10.32) is read and article-cited: minimum ' +
            'plot, inscribed-circle diameter, net edificabilidad, height/storeys, coverage and ' +
            'setbacks. PRYZM still publishes NO number here: the typology binding is an inference ' +
            'and a per-area override ("fichero de ordenación anexo") this transcription did not ' +
            'find may exist unread, so every parcel receives a cited refusal, never an estimate.',
        // ⚠⚠ GATED, NOT POPULATED — mirrors `ZARAGOZA_ENVELOPE_VERIFIED`'s pattern exactly. While
        // the gate is false this is `packMap()` (empty), so `canariasMunicipalBboxesTotality.test.ts`
        // sees an empty `packZoneCodes` here too, same as every other unsigned Canarias entry.
        packsByZone: EL_SAUZAL_ENVELOPE_VERIFIED
            ? packMap([ES_EL_SAUZAL_PACK, [...EL_SAUZAL_ZONE_CODES]])
            : packMap(),
        refusalFor: () => null,
        noRulePackRefusal: (zoneCode, _zoneLabel, knownFacts) =>
            elSauzalNoRulePackRefusal(zoneCode ?? null, knownFacts ?? []),
    },
    // ╔════════════════════════════════════════════════════════════════════════════════════════╗
    // ║ ⚠ END OF THE EL SAUZAL / CANARIAS BLOCK.                                                ║
    // ╚════════════════════════════════════════════════════════════════════════════════════════╝
    // ╔════════════════════════════════════════════════════════════════════════════════════════╗
    // ║ ⚠ 86 MORE CANARIAS MUNICIPALITIES (§CANARIAS-88-REGISTRATION, 2026-08-03).              ║
    // ╚════════════════════════════════════════════════════════════════════════════════════════╝
    //
    // 40 routable (single determinable base instrument, unsigned) + 46 multi-instrument
    // (ambiguous governing plan) = 86 — every Canarias municipality except Telde (its own
    // registration above) and El Sauzal (INE 38041 — EXCLUDED here, see the comment beside its
    // skipped slot in `canariasMunicipalBboxes.ts`: a concurrently-landed, article-cited
    // transcription, `esElSauzal.ts`, is the more specific registration for that one town). See
    // `buildCanariasMunicipalRegistrations()` for why these are generated instead of 86 literal
    // entries, and `canariasMunicipalBboxes.ts` for where every bbox was sourced (the same
    // Catastro INSPIRE ATOM feeds `teldeBbox.ts` already trusts, extended to their other rows —
    // not invented, not derived from a different method).
    //
    // ⚠ 87/88 Canarias municipalities are registered by THIS block plus Telde; El Sauzal (38041)
    // owes its own registration (`esElSauzal.ts`), landing separately. None of the 87 publishes a
    // number: every one resolves to a cited refusal, never `applyEstimatedZoning`'s fabricated
    // generic triple. `CANARIAS_ENVELOPE_VERIFIED` stays `false`; this is a routing fix, not a
    // publication.
    ...buildCanariasMunicipalRegistrations(),
    // ── §BALEARS-REGISTRATION (L-680) — the ILLES BALEARS, the second `'regional'` registration. ──
    //
    // ⚠ THE DEFECT IT CLOSES IS THE CÓRDOBA-MUNICIPAL ONE, MEASURED: before this entry a click in
    // Mallorca matched NO `contains` predicate in this table, so §L-663's chokepoint read
    // `resolveRegisteredJurisdictionAt → 'none'` ("genuinely uncovered land, the estimate is honest
    // here") and `applyEstimatedZoning` PUBLISHED the generic triple — 3,0/1,5/3,0 m, FAR 2,00,
    // coverage 50 % — on land PRYZM has read no article about. Registering the community makes that
    // structurally impossible with no edit to `siteDispatch.ts`.
    //
    // ⚠ `'regional'` IS THE TRUE DECLARATION AND IT MATTERS. The box is the extent of the MUIB
    // CLASSIFICACIO layer, i.e. the whole autonomous community — 4 islands, 67 municipalities. Any
    // future Palma or Eivissa registration at `'municipal'` therefore out-ranks this one on its own
    // land automatically, with no re-ordering (§JURISDICTION-SPECIFICITY). Declaring it
    // `'municipal'` would make a future Palma entry TIE, and a tie is refused as ambiguous.
    //
    // ⚠ `packsByZone` IS EMPTY BY CONSTRUCTION, NOT AS A TODO. The 5,273 MUIB fitxes are already
    // machine-readable at stable URLs the zoning layer itself publishes; transcribing them into a
    // static table would freeze a live source. The pack is built PER PARCEL by `balearsResolvedPack`
    // — the same shape Denmark, Paris and the Netherlands register with.
    //
    // ⛔ REGISTRATION IS NOT AUTHORISATION (the Murcia/Córdoba precedent, stated once more because
    // this jurisdiction is the most tempting one yet). `BALEARS_ENVELOPE_VERIFIED` is `false` and
    // `OPEN_TOP_INDICATIVE_JURISDICTIONS` is empty, so every Balears parcel receives a CITED REFUSAL
    // and no number reaches the panel, the massing or `site.updateZoning`. Wire it so it is
    // SIGNABLE; let the signature be the legal act — never the wiring.
    {
        jurisdictionId: BALEARS_JURISDICTION_ID, // 'es-ib-balears'
        displayName: 'Illes Balears (Mapa Urbanístic de les Illes Balears)',
        countryCode: 'ES',
        countryName: 'Spain',
        // ⚠ THE SAME OBJECT/PREDICATE the L5 Balears dispatch routes on — imported, not restated.
        extent: BALEARS_BBOX,
        contains: isInBalears,
        extentResolution: 'regional',
        answerSummary:
            'Everywhere in the Illes Balears — Mallorca, Menorca, Eivissa and Formentera — PRYZM ' +
            'resolves your parcel from the national Catastro and its planning qualification live ' +
            'from the Govern’s Mapa Urbanístic de les Illes Balears: the zone code, the ' +
            'municipality’s own designation, the governing plan, the land class and the record’s ' +
            'validity interval, at the point. Uniquely among the Spanish sources measured so far, ' +
            'MUIB also links each zone to a STRUCTURED normative fitxa carrying the numeric ' +
            'parameters themselves — storeys, height, occupation, buildability, setbacks — which ' +
            'PRYZM reads and shows you. ⚠ PRYZM publishes NO buildable figure here: the reading is ' +
            'not human-signed (L-449) and six constraint families are unmodelled (heritage, flood, ' +
            'airport, coastal, environmental, and the island territorial plans), each of which can ' +
            'only reduce an envelope. Every parcel therefore receives a cited refusal that shows ' +
            'what the fitxa says — never an estimate.',
        // EMPTY BY CONSTRUCTION — the pack is live-resolved per parcel. See the block comment above.
        packsByZone: packMap(),
        // No per-zone legal refusal TABLE: the legal classification (superseded record, disowned
        // plan, rustic regime) is a function of the LIVE record, which this path does not hold.
        refusalFor: () => null,
        noRulePackRefusal: (zoneCode, zoneLabel, knownFacts) =>
            balearsRegistryRefusal(zoneCode ?? null, zoneLabel ?? null, knownFacts ?? []),
    },
];

const BY_JURISDICTION: ReadonlyMap<string, JurisdictionRegistration> = new Map(
    REGISTRATIONS.map((r) => [r.jurisdictionId, r]),
);

/**
 * Resolve what to do with a zone code. The ONE question the dispatcher asks.
 *
 * An unknown jurisdiction yields `unregistered`, not a throw: a plot outside every registered
 * city must keep working on the estimated path exactly as it does today.
 */
export function resolveZoneDisposition(
    jurisdictionId: string,
    zoneCode: string,
    hints?: ZoneDispositionHints,
): ZoneDisposition {
    const reg = BY_JURISDICTION.get(jurisdictionId);
    if (!reg) return { kind: 'unregistered', zoneCode };
    const pack = reg.packsByZone.get(zoneCode);
    // Pack precedence — see the header on why this order and not the reverse.
    if (pack) return { kind: 'pack', pack, zoneCode };
    const refusal = reg.refusalFor(
        zoneCode,
        hints?.harmonisedCode ?? null,
        hints?.knownFacts ?? [],
    );
    if (refusal) return { kind: 'refusal', zoneCode, refusal };
    // L-553 — a privately-buildable zone with no pack. If the jurisdiction declares a
    // coverage-gap refusal, REFUSE rather than let the caller draw a generic setback estimate.
    // Order matters: this runs LAST, so a legal refusal (a statement about the ordinance) can
    // never be displaced by a coverage refusal (a statement about PRYZM). Those two must not be
    // interchangeable and the precedence is what guarantees it.
    if (reg.noRulePackRefusal) {
        return {
            kind: 'refusal',
            zoneCode,
            refusal: reg.noRulePackRefusal(zoneCode, hints?.zoneLabel ?? null, hints?.knownFacts ?? []),
        };
    }
    return { kind: 'unregistered', zoneCode };
}

/**
 * Every zone code a pack answers for, per jurisdiction. Exported for the coverage probe so
 * "what does the engine cover today?" is read from the shipping registry rather than re-stated
 * in the probe — the probe must not be able to disagree with the code path it measures.
 */
export function registeredPackZoneCodes(jurisdictionId: string): readonly string[] {
    return [...(BY_JURISDICTION.get(jurisdictionId)?.packsByZone.keys() ?? [])];
}

/**
 * L-593 / C60 §2 — ONE registered jurisdiction, as the site-entry globe sees it.
 *
 * A projection of `REGISTRATIONS`, never a parallel table. `packZoneCodes` is read live
 * so it cannot lag the packs; `contains` IS the dispatcher's routing predicate.
 */
export interface JurisdictionCoverage {
    readonly jurisdictionId: string;
    readonly displayName: string;
    readonly countryCode: string;
    readonly countryName: string;
    readonly extent: JurisdictionExtent;
    readonly contains: (lat: number, lon: number) => boolean;
    /** §JURISDICTION-SPECIFICITY — the ONE input to `resolveJurisdictionClaim()`. */
    readonly extentResolution: JurisdictionExtentResolution;
    readonly answerSummary: string;
    /** Zone codes a curated pack answers for, live from `packsByZone`. */
    readonly packZoneCodes: readonly string[];
}

/**
 * **THE answer to "where can PRYZM actually answer?"** — derived from the shipping
 * registry, so it is definitionally incapable of disagreeing with the code path it
 * describes (the same argument as `registeredPackZoneCodes`, one level up).
 *
 * C60 §2 forbids any other source for the site-entry coverage layer. If this list is
 * empty, the honest globe is entirely dark — that is a correct rendering, not a bug.
 */
export function listJurisdictionCoverage(): readonly JurisdictionCoverage[] {
    return REGISTRATIONS.map((r) => ({
        jurisdictionId: r.jurisdictionId,
        displayName: r.displayName,
        countryCode: r.countryCode,
        countryName: r.countryName,
        extent: r.extent,
        contains: r.contains,
        extentResolution: r.extentResolution,
        answerSummary: r.answerSummary,
        packZoneCodes: [...r.packsByZone.keys()],
    }));
}

const _tracer = trace.getTracer('pryzm.zoning');

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §JURISDICTION-ID-CARRIES-THE-INE (2026-08-02) — RESOLVING A JURISDICTION BY MUNICIPAL CODE.
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// WHY THERE IS NO LOOKUP TABLE HERE. PRYZM's Spanish jurisdiction ids are already `<cc>-<INE>-
// <slug>` by convention (`saRiyadhDemo.ts` states it): `es-08019-barcelona`, `es-08101-hospitalet`,
// `es-46250-valencia`. The INE code is therefore ALREADY IN THE ID, and a second table mapping one
// to the other would be a restatement that can drift from the ids it describes — the L-422/457/
// 467/469 family, and the exact reason `ENVELOPE_PUBLICATION_GATES` reads gate CONSTANTS instead of
// restating their values. So this DERIVES the code from the id, and `ambMunicipalities.test.ts`
// asserts the derivation agrees with the AMB scope table for all five registered AMB ids.
//
// ⚠ THE MIDDLE SEGMENT IS **INE**, NEVER DGC. Every planning service in this corpus keys on INE
// (the AMB publishes `CODI_INE`; SIU's field is `ProvINE`); Catastro's DGC code is the odd one out
// and is NOT what these ids carry. The return type is a branded `IneCode` so that distinction
// survives the function boundary instead of decaying to a five-character string — DGC 08196 and
// INE 08196 are different municipalities, and one of them is inside the AMB extent.

/**
 * The INE municipal code carried by a `<cc>-<INE>-<slug>` jurisdiction id, or `null` when the id
 * does not carry one (`ch`, `dk`, `nl-bestemmingsplan`, `es-catalunya`, a malformed id).
 *
 * ⚠ `null` means "this id encodes no municipality", which is TRUE and common — regional and
 * national jurisdictions have no INE code. It is never an error state, and callers must not
 * substitute a default for it.
 *
 * PURE, total, never throws. P8 — emits `pryzm.zoning.ineCodeForJurisdiction`.
 */
export function ineCodeForJurisdiction(jurisdictionId: string): IneCode | null {
    const span = _tracer.startSpan('pryzm.zoning.ineCodeForJurisdiction');
    try {
        const parts = String(jurisdictionId ?? '').split('-');
        // `<cc>-<INE>-<slug…>` — at least three segments, and the SECOND must be five digits.
        const code = parts.length >= 3 ? parseIneCode(parts[1]) : null;
        span.setAttribute('jurisdictionId', String(jurisdictionId ?? ''));
        span.setAttribute('carriesIne', code !== null);
        return code;
    } finally {
        span.end();
    }
}

/**
 * The REGISTERED jurisdiction whose id carries this INE municipal code, or `null` when PRYZM
 * registers none.
 *
 * ⚠⚠ **A NON-NULL ANSWER IS ROUTING, NOT AUTHORISATION.** It says a registration exists and which
 * packs/refusals/extent apply. Whether PRYZM may PUBLISH a numeric envelope there is
 * `isEnvelopePublicationAuthorised()`, which fails closed and which four of the five AMB
 * municipalities currently fail. Reading this function as permission is the L-665 defect.
 *
 * ⚠ Derived from `REGISTRATIONS` on every call rather than indexed at load: the set is ~16 rows,
 * and a derived answer cannot lag the registrations the way a cached index can.
 *
 * PURE, total, never throws. P8 — emits `pryzm.zoning.registeredJurisdictionForIne`.
 */
export function registeredJurisdictionIdForIne(ine: IneCode): string | null {
    const span = _tracer.startSpan('pryzm.zoning.registeredJurisdictionForIne');
    try {
        for (const r of REGISTRATIONS) {
            if (ineCodeForJurisdiction(r.jurisdictionId) === ine) {
                span.setAttribute('ineCode', ine as string);
                span.setAttribute('jurisdictionId', r.jurisdictionId);
                span.setAttribute('registered', true);
                return r.jurisdictionId;
            }
        }
        span.setAttribute('ineCode', ine as string);
        span.setAttribute('registered', false);
        return null;
    } finally {
        span.end();
    }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §JURISDICTION-SPECIFICITY — THE ONE RESOLUTION RULE. Read the header for what was rejected.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The minimum a value must declare to take part in the resolution rule.
 *
 * Structural, so the rule is applied to `JurisdictionCoverage` in production AND to the pure
 * editor-side `CoverageEntry` fixtures — ONE implementation, never a second copy of the ordering.
 * That is the same argument as `listJurisdictionCoverage()` one level up: a rule stated twice is a
 * rule that can disagree with itself, and the disagreement is invisible.
 */
export interface JurisdictionClaim {
    readonly jurisdictionId: string;
    readonly contains: (lat: number, lon: number) => boolean;
    readonly extentResolution: JurisdictionExtentResolution;
}

/**
 * Who governs a point.
 *
 * ⚠ THERE IS NO FOURTH CASE AND THERE MUST NOT BE. `'ambiguous'` exists because the only other way
 * to answer two equally-specific overlapping claims is to pick one — and picking one is a
 * confident answer under the wrong ordinance, which this whole subsystem exists to refuse. An
 * ambiguity is a legitimate shippable answer ("PRYZM will not guess which ordinance governs this
 * point"); a coin flip is not.
 */
export type JurisdictionClaimResolution<T extends JurisdictionClaim> =
    /** No registration claims this point. */
    | { readonly kind: 'none' }
    /** Exactly one registration is strictly the most specific claimant. */
    | {
          readonly kind: 'resolved';
          readonly jurisdiction: T;
          /** Coarser registrations that also claim the point, finest-first. Diagnostics only. */
          readonly outranked: readonly T[];
      }
    /** ≥2 registrations tie at the finest resolution. Refuse — never pick. */
    | { readonly kind: 'ambiguous'; readonly candidates: readonly T[] };

/**
 * Apply the §JURISDICTION-SPECIFICITY rule to a list of claims. PURE; never throws; a non-finite
 * point yields `'none'`.
 *
 * Uses each claim's OWN `contains` predicate — the dispatcher's — rather than re-testing a bbox
 * here, so this can never light a region the dispatcher would refuse to route into (C60 §2).
 *
 * P8 span: `pryzm.zoning.resolveJurisdictionClaim`.
 */
export function resolveJurisdictionClaim<T extends JurisdictionClaim>(
    claims: readonly T[],
    lat: number,
    lon: number,
): JurisdictionClaimResolution<T> {
    const span = _tracer.startSpan('pryzm.zoning.resolveJurisdictionClaim');
    try {
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            span.setAttribute('pryzm.zoning.resolution', 'none');
            span.setStatus({ code: SpanStatusCode.OK });
            return { kind: 'none' };
        }
        const matched = claims.filter((c) => c.contains(lat, lon));
        span.setAttribute('pryzm.zoning.lat', lat);
        span.setAttribute('pryzm.zoning.lon', lon);
        span.setAttribute('pryzm.zoning.claimCount', matched.length);
        if (matched.length === 0) {
            span.setAttribute('pryzm.zoning.resolution', 'none');
            span.setStatus({ code: SpanStatusCode.OK });
            return { kind: 'none' };
        }
        // Stable: `filter` preserves registration order, and `sort` is stable in ES2019+, so equal
        // ranks keep registration order — which matters only for the DIAGNOSTIC `outranked` list,
        // never for the verdict (a rank tie is an ambiguity, not a first-wins).
        const ordered = [...matched].sort(
            (a, b) => extentResolutionRank(a.extentResolution) - extentResolutionRank(b.extentResolution),
        );
        const finest = extentResolutionRank(ordered[0]!.extentResolution);
        const tied = ordered.filter((c) => extentResolutionRank(c.extentResolution) === finest);
        if (tied.length > 1) {
            span.setAttribute('pryzm.zoning.resolution', 'ambiguous');
            span.setAttribute(
                'pryzm.zoning.candidates',
                tied.map((c) => c.jurisdictionId).join(','),
            );
            span.setStatus({ code: SpanStatusCode.OK });
            return { kind: 'ambiguous', candidates: tied };
        }
        span.setAttribute('pryzm.zoning.resolution', 'resolved');
        span.setAttribute('pryzm.zoning.jurisdictionId', ordered[0]!.jurisdictionId);
        span.setStatus({ code: SpanStatusCode.OK });
        return { kind: 'resolved', jurisdiction: ordered[0]!, outranked: ordered.slice(1) };
    } catch (err) {
        // A registration whose `contains` throws must not take the whole lookup down; the honest
        // outcome of "we could not decide" is the same as "nobody claims it" — never a guess.
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error)?.message });
        return { kind: 'none' };
    } finally {
        span.end();
    }
}

/**
 * **Which REGISTERED jurisdiction governs a WGS84 point.** The production entry point — the same
 * rule applied to `listJurisdictionCoverage()`, so no caller can supply a different claim list and
 * reach a different verdict for real land.
 *
 * P8 span: `pryzm.zoning.resolveRegisteredJurisdictionAt`.
 */
export function resolveRegisteredJurisdictionAt(
    lat: number,
    lon: number,
): JurisdictionClaimResolution<JurisdictionCoverage> {
    const span = _tracer.startSpan('pryzm.zoning.resolveRegisteredJurisdictionAt');
    try {
        const r = resolveJurisdictionClaim(listJurisdictionCoverage(), lat, lon);
        span.setAttribute('pryzm.zoning.resolution', r.kind);
        if (r.kind === 'resolved') {
            span.setAttribute('pryzm.zoning.jurisdictionId', r.jurisdiction.jurisdictionId);
        }
        span.setStatus({ code: SpanStatusCode.OK });
        return r;
    } finally {
        span.end();
    }
}
