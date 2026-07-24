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
        answerSummary: r.answerSummary,
        packZoneCodes: [...r.packsByZone.keys()],
    }));
}
