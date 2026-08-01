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
// L-608 — Madrid (INE 28079). Registered as a REFUSAL jurisdiction: the NZ 1 pack is authored as
// an `explicit-area` DECLARATION, but its buildable footprint is resolved live from the municipal
// ArcGIS plane and the zone code is unverified, so no code maps to a pack yet (see below).
import { MADRID_JURISDICTION_ID, madridNZ1Refusal } from './esMadridNZ1.js';
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
} from './esCordobaZoneClassification.js';
import { CORDOBA_BBOX, isInCordoba } from '../providers/cordobaBbox.js';
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
// zone source is the MUNICIPAL GeoServer (`Murcia:pgou_alineaciones` / `Murcia:pgou_sectores`),
// resolved LIVE per parcel by the L5 dispatch, not from a static zone-code table. So `packsByZone`
// is deliberately EMPTY, exactly like Denmark's and Switzerland's; this registration lights the C60
// coverage globe and gives `resolveZoneDisposition` an honest answer for a Murcia zone code.
import { MURCIA_JURISDICTION_ID, murciaNoRulePackRefusal } from './esMurciaEnvelope.js';
import { MURCIA_BBOX, isInMurcia } from '../providers/murciaBbox.js';
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
            // municipality. Ciutat Vella is 12b and stays refused (its height is the mean of
            // existing neighbours, an input we do not hold).
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
    // ── L-608 — Madrid (INE 28079), PGOUM-97 Norma Zonal 1. ──
    //
    // ⚠ REGISTERED AS A REFUSAL JURISDICTION, ON PURPOSE. `ES_MADRID_NZ1_PACK` is authored as an
    // `explicit-area` DECLARATION (the buildable footprint is published as GEOMETRY, not as
    // parameters), and the engine's `explicit-area` branch exists — but two things gate a real
    // registration, and until BOTH clear the honest disposition is a cited refusal, never a
    // fabricated number:
    //   (1) the buildable RING is resolved LIVE per manzana (`resolveMadridNZ1Ring`) from
    //       sigma.madrid.es; no same-origin Madrid proxy is wired yet, so it cannot resolve here;
    //   (2) the exact Norma-Zonal code the live calificación plane reports for an NZ 1 parcel is
    //       UNVERIFIED (that service returned HTTP 500 on 2026-07-23). Mapping a code to the pack
    //       before it is verified would register on a guess.
    //
    // ⇒ `packsByZone` is deliberately EMPTY (no code maps to a pack yet) and `noRulePackRefusal`
    // returns the Madrid NZ 1 refusal for every zone code, so `resolveZoneDisposition` answers
    // `refusal` for any Madrid parcel. The extent still lights the C60 coverage globe (we DO answer
    // here — with an honest refusal). The dispatcher's Madrid path resolves the ring independently
    // and solves ONLY when a ring is available, refusing (via the same `madridNZ1Refusal`) otherwise.
    //
    // WIRING TODO (orchestrator, when both gates clear): move the pack into `packsByZone` under its
    // VERIFIED code(s), and remove `noRulePackRefusal` (or narrow it to genuinely-unpacked NZ codes).
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
            'Madrid PGOUM-97 Norma Zonal 1 is modelled as an explicit-area zone (the buildable ' +
            'footprint is published as geometry). PRYZM answers here with a cited refusal until the ' +
            'published footprint is resolvable live and the zone code is verified — never an estimate.',
        // No code maps to a pack yet — see the block comment above.
        packsByZone: packMap(),
        // No per-zone legal refusals authored for Madrid; the coverage-gap refusal below covers all.
        refusalFor: () => null,
        // Every Madrid zone code → the NZ 1 explicit-area refusal (the current honest state).
        noRulePackRefusal: (_zoneCode, _zoneLabel, knownFacts) => madridNZ1Refusal(knownFacts),
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
    // ⇒ `packsByZone` is EMPTY (no static zone code maps to a pack), `refusalFor` returns null, and
    // `noRulePackRefusal` returns the Murcia COVERAGE refusal — the honest answer on the REGISTRY
    // path, which has no live records and therefore cannot make the stronger legal claim. The
    // dispatcher path supplies the specific, cited one. Same division as Switzerland and Madrid.
    //
    // WIRING TODO (orchestrator, when a governing instrument is sourced + human-signed into
    // `es/es-mc/30030-murcia/sources/VERIFICATION.md`): author the pack cited to THAT instrument
    // (a Plan Parcial, not the general plan — the general plan expressly declines the question),
    // move it into `packsByZone` and flip `MURCIA_ENVELOPE_VERIFIED`. That is a legal act.
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
        // Resolved live per-parcel from the municipal GeoServer — no static zone-code pack table.
        packsByZone: packMap(),
        // No per-zone legal refusal TABLE: the legal refusal is a function of the live ámbito code
        // (`murciaEnvelopeDisposition`), not of a static enumeration.
        refusalFor: () => null,
        // The registry path has no live records, so it makes the weaker, honest claim: a statement
        // about PRYZM's coverage, never about the law.
        noRulePackRefusal: (zoneCode, zoneLabel, knownFacts) =>
            murciaNoRulePackRefusal(zoneCode, zoneLabel ?? null, knownFacts ?? []),
    },
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

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §JURISDICTION-SPECIFICITY — THE ONE RESOLUTION RULE. Read the header for what was rejected.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const _tracer = trace.getTracer('pryzm.zoning');

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
