// L-550 / Phase 0.3 of `BARCELONA-COMPLETE-COVERAGE-PLAN.md` — THE REFUSAL VOCABULARY.
//
// WHAT THIS EXISTS TO FIX
// -----------------------
// Until now the editor had exactly two outcomes for a parcel: a solved envelope, or
// `applyEstimatedZoning` — the generic estimated rule pack, which produces a front/side/rear
// setback triple for ANY polygon it is handed. That triple was therefore rendered, in the same
// purple volume and the same card, over:
//
//   • a Collserola forest reserve (clau 27/28/29 — *sòl no urbanitzable*),
//   • the Ronda de Dalt (clau SX1 — *sistema viari*),
//   • the Parc de la Ciutadella (clau 6a),
//   • and a clau 18 *volumetria específica* plot whose buildability the PGM explicitly delegates
//     to an approved volumetric ordering for that site (Art. 306).
//
// In each case the ORDINANCE ANSWERS THE QUESTION, and its answer is "not by a zone envelope".
// Rendering an estimate there is not a conservative approximation — it is a fabricated legal
// claim about land that cannot be developed at all, and it is indistinguishable on screen from
// a real determination. That is the L-459 defect class (a constructed number rendering as a
// surveyed one) and the §CONTEXT-DATA-HONESTY family (a REFUSAL and a FAILURE collapsing to the
// same value) meeting on the same card.
//
// WHY A REFUSAL IS A *POSITIVE* ANSWER, NOT A SHORTFALL
// ----------------------------------------------------
// "Complete Barcelona" cannot mean "every parcel gets a polygon" — §3.5 of the plan measured
// 22.5 % of the city's private buildable land on clau 18, where the PGM states no rule and
// points at a different document per site. For that land the legally correct output IS a
// reasoned, cited refusal. This module is what makes that output expressible, so the city can
// be 100 % HONESTLY TIERED (constructed / refused / certified) long before it is 100 %
// constructed.
//
// PURITY: L2-pure (C58 §1.9) — no I/O, no THREE, no DOM, no clock. A refusal is data.
//
// Strategic context — C58 §1.2/§1.3/§1.4, C23,
// docs/04-reference/jurisdictions/es/es-ct/08019-barcelona/BARCELONA-COMPLETE-COVERAGE-PLAN.md §0.3/§1.1/§5.

import { trace } from '@opentelemetry/api';
import type { BuildableEnvelope, EnvelopeRefusal } from '@pryzm/schemas';

/** P8 — one tracer for this module's exported constructors. Same precedent as `registry.ts`. */
const _tracer = trace.getTracer('pryzm.zoning');

/**
 * Build the `BuildableEnvelope` that says "no private buildable envelope applies here, and here
 * is why".
 *
 * ⚠ EVERY numeric field is null/zero and `insetPolygon` is EMPTY, deliberately and permanently.
 * A refusal that carried a height or an area would be re-admitting the fabrication through the
 * back door — downstream consumers (`storeyCap`, the generators, the massing render) read those
 * fields and would happily extrude one. `status: 'not-applicable'` additionally makes
 * `dispatchEnvelope` CLEAR any previously-persisted `buildableRing` rather than leave a stale one
 * that still looks authoritative (C58 §1.7a, the L-445 lesson).
 *
 * `confidence: 'not-determined'` is the honest label: no determination was made. It is NOT a
 * weaker `estimated-ruleset`, and the UI must not badge it as an estimate.
 *
 * ⚠ **§L-590c / ADR-0276 — "EVERY NUMERIC FIELD IS NULL" IS UNCHANGED, AND THE NEW
 * `regime-undetermined` REFUSAL DOES NOT DENT IT.** That card DOES state two limits of PGM
 * Art. 350 — but in `refusal.detail` + `refusal.ordinanceRef`, i.e. PROSE UNDER A CITATION, never
 * in a field. C58 §1.13.7 makes the permission explicit and keeps §1.13.3 intact, for the exact
 * reason this comment gives: `storeyCap`, the generators and the massing path read these fields
 * and will extrude whatever they find. **If you are here because you want to "just put the FAR
 * in `maxFAR` since we know it" — that is the back door, and it is also impossible to do
 * honestly: Art. 350's occupation cap is CONDITIONAL on the sector's ordering type, and a
 * schema field cannot carry a condition.**
 */
/**
 * §L-574 — the status a refusal carries. Defaults to `'not-applicable'` (the L-550 legal
 * refusal). Pass `'none'` for `source-data-unavailable`, where the ordinance DOES apply and we
 * simply could not fetch what it needs.
 *
 * ⚠ THE TWO ARE NOT INTERCHANGEABLE, and the schema says why (`EnvelopeStatus`):
 * `'not-applicable'` means the ordinance ANSWERED and its answer was "not by a zone envelope";
 * `'none'` means the determination was attempted and found no data. Stamping a Catastro outage
 * as `'not-applicable'` would assert a legal fact we have not established — about someone's
 * land — which is the failure/refusal collapse this project has paid for three times
 * (L-422/L-467/L-469). Both clear a stale `buildableRing` (`dispatchEnvelope` writes only on
 * `'ok'`), so the L-445 protection is unchanged either way.
 */
/**
 * ⚠ `zoneCode` is `string | null`. NULL IS A REAL, DISTINCT ANSWER and it earned its place with
 * §L-663: the refusal raised when PRYZM could not resolve the zone AT ALL (the planning-map lookup
 * did not name one) has no zone to state, and inventing a placeholder string — `'unknown'`,
 * `'generic-urban'`, the jurisdiction id — would put a zone-shaped token on the card and in
 * `Parcel.zoning.category`, where every downstream reader treats it as a resolved qualification.
 * `Parcel.zoning.category` is already `string | null` for exactly this reason, and the card renders
 * `zoneCode ?? 'n/a'`. Say nothing rather than say a name we do not have.
 */
export function buildRefusedEnvelope(
    zoneCode: string | null,
    refusal: EnvelopeRefusal,
    status: 'not-applicable' | 'none' = 'not-applicable',
): BuildableEnvelope {
    return {
        insetPolygon: [],
        maxHeight_m: null,
        // §L-616 — a refusal has no massing at all; the FAR-realistic height is null like every
        // other numeric field (this literal never goes through `.parse()`, so the schema default
        // would not apply and the field would be structurally absent on a type that requires it).
        farLimitedHeight_m: null,
        maxFloors: null,
        maxFAR: null,
        maxCoverage: null,
        maxVolumeM3: null,
        insetAreaM2: 0,
        // §L-619 — a refusal draws no footprint at all; false like every other flag (this literal
        // never goes through `.parse()`, so the schema default would not apply otherwise).
        footprintIsUpperBound: false,
        // §L-619 — a refusal has no footprint, so there is nothing to have PLACED and no void to
        // attribute. Null like every other field (this literal never goes through `.parse()`, so
        // the schema default would not apply and the fields would be structurally absent).
        placement: null,
        openSpace: null,
        permittedUse: [],
        confidence: 'not-determined',
        // The refusal is a statement about THIS parcel's zone — a parcel-level answer, even
        // though it is not a parcel-level *number*. Stamping `'unknown'` would imply we are
        // unsure what the statement is about, which we are not (C58 §1.11.4).
        granularity: 'parcel',
        status,
        zoneCode,
        // No derivation rows: there is no constraint to explain. The `refusal` field carries the
        // explanation, and the compliance report renders zero rows rather than an empty table of
        // dashes that would read as "not filled in yet".
        derivation: [],
        caveats: [refusal.headline, refusal.detail],
        // §L-590b — no tiers: a refusal has no geometry at all, tiered or otherwise. Explicit
        // rather than relying on the schema default, because this object is a TS literal that
        // never goes through `.parse()`, so the default would not apply and the field would be
        // structurally absent on a type that requires it.
        tiers: [],
        refusal,
    };
}

/**
 * Is this envelope a refusal? The single predicate every consumer should branch on, so the
 * status never has to be string-matched at ten call sites (and so a future status does not
 * silently fall into an `ok` branch).
 *
 * §L-574 — this previously hard-coded `status === 'not-applicable'`, which silently excluded the
 * new `source-data-unavailable` refusal (status `'none'`): every consumer would have treated it
 * as an ordinary empty envelope and its card would never have rendered. Caught by test, not by
 * review — which is exactly why the accepted statuses are now a NAMED LIST rather than a literal
 * buried in an expression.
 *
 * ⚠ IT IS DELIBERATELY STILL AN ALLOW-LIST, not simply `refusal !== null`. A `degenerate`
 * envelope carrying a refusal object is a contradictory state (the constraints consumed the
 * parcel AND the ordinance declined), and classifying it as a refusal would let a producer bug
 * render as a polished explanation. Refusing to recognise the impossible combination is what
 * makes the bug surface. **A new refusal kind MUST add its status here.**
 */
const REFUSAL_STATUSES: ReadonlySet<BuildableEnvelope['status']> = new Set([
    'not-applicable', // L-550 — the ordinance grants no private envelope here (legal).
    'none',           // L-574 — attempted, but an input was unavailable (data path).
]);

export function isRefusedEnvelope(env: BuildableEnvelope | null | undefined): boolean {
    return !!env && env.refusal != null && REFUSAL_STATUSES.has(env.status);
}

/**
 * §L-574 — is this refusal about PRYZM's DATA PATH rather than the law or our coverage?
 *
 * The one refusal that is TRANSIENT, and therefore the only one where offering a RETRY is
 * honest. Exposed as a predicate so no surface has to string-match the code (the same reason
 * `isRefusedEnvelope` exists).
 */
export function isTransientRefusal(env: BuildableEnvelope | null | undefined): boolean {
    return isRefusedEnvelope(env) && env!.refusal!.code === 'source-data-unavailable';
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// §L-663 — THE REFUSAL THAT REPLACES THE GENERIC ESTIMATE INSIDE A REGISTERED JURISDICTION.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// WHAT WENT WRONG (founder, prod 2026-08-01, build 6f7c9fd5). A boundary hand-drawn at Carrer de
// la Diputació × Carrer de Roger de Llúria — the dead centre of the Eixample, clau `13a`, four
// shipped Barcelona packs — rendered the `estimated-default` triple: front 3.0 m / side 1.5 m /
// rear 3.0 m, FAR 2.00, coverage 50 %, badged `EST · zone generic-urban · no citation`. Selecting
// the SAME block's Catastro parcel (refcat 0627603DF3802H) on the same build resolved clau 13a
// from the MUC and refused honestly. Two answers, one piece of land.
//
// The badge was not the defect — the badge worked. The defect is that a *routing* failure
// (`fetchQualificationAtPoint` returned null, which conflates a Generalitat outage, a non-200, a
// non-JSON body and a genuine empty into one value) was converted into a NUMBER. §CONTEXT-DATA-
// HONESTY, once more: an outage, a genuine empty and a resolved-but-unpacked zone are THREE
// different answers, and none of them is 3.0 / 1.5 / 3.0.
//
// WHY A GENERIC ESTIMATE IS WORSE INSIDE A COVERED CITY THAN OUTSIDE ONE. Outside every
// registered jurisdiction, `estimated-default` is an honest, badged approximation and PRYZM makes
// no other claim about that land. Inside one, the same card contradicts a determination we can
// make and, on *segons alineacions de vial* fabric like the Eixample, the setback triple is the
// wrong geometric OPERATION, not an imprecise number (C58 §1.11) — it draws a volume spanning the
// full plot depth on the most valuable land in Barcelona. The user cannot tell the two apart, so
// the estimate silently overrides the refusal the same city would otherwise give them.
//
// ⇒ Inside a registered jurisdiction the estimated pack is UNREACHABLE, structurally, at the one
// chokepoint that dispatches it (`applyEstimatedZoning` in `siteDispatch.ts`). This is what it
// dispatches instead.
//
// ⚠ THE CODE IS `source-data-unavailable`, DELIBERATELY, AND THE OTHER FOUR WOULD EACH LIE:
//   • a legally-grounded code (`public-system`, `derived-plan`, …) would assert an ordinance fact
//     about someone's land that we have not established — the false negative L-553 ranks worst;
//   • `no-rule-pack` would claim a coverage gap we do not have (Barcelona ships four packs);
//   • `regime-undetermined` would claim we identified the zone and its two regimes — we did not
//     identify the zone at all;
//   • `no-plan-at-point` would assert the AUTHORITY answered "nothing published here". The
//     provider cannot currently tell that apart from an outage, so asserting it would be a
//     measurement we have not taken (see the WIRING TODO at the foot of this block).
// `source-data-unavailable` is the honest residue: attempted, could not complete, retry may clear
// it — and it is the only code whose retry affordance is not a lie.
//
// WIRING TODO (§L-663 follow-up, NOT this slice): `MucZoningProvider.fetchQualificationAtPoint`
// returns `null` for a network error, a non-200, a non-JSON body AND an explicit `{zoning:null}`.
// Splitting those into an outcome union would let this refusal say "the Generalitat's planning map
// is not responding" vs "the planning map answers, and it publishes no qualification at this
// point" — the second being `no-plan-at-point`. The provider is the right place to fix it; until
// it is fixed, this card states only what we can prove.

/**
 * §L-663 — the refusal shown where the generic `estimated-default` triple used to be drawn inside
 * a jurisdiction PRYZM has registered.
 *
 * Jurisdiction-agnostic BY DESIGN: it states no article, no zone and no number, so it cannot
 * mis-cite any city's ordinance. Everything city-specific on the card comes from the registration
 * itself (`displayName` + `answerSummary`, both read live from `listJurisdictionCoverage()`), so a
 * newly-registered city gets a correct card with no edit here — the same "one statement of
 * coverage" discipline the registry header requires.
 *
 * ⚠ It is a LAST RESORT, not a substitute for a city's own refusal. Every jurisdiction path that
 * knows the zone must emit its own cited refusal (Barcelona's `no-rule-pack` / `derived-plan` /
 * `source-data-unavailable` cards, etc.); this one exists only for the residue where the zone was
 * never resolved, and its copy says exactly that rather than pretending to more.
 *
 * P8 — OTel span (`@opentelemetry/api` is already an L2 dependency of this package; `registry.ts`
 * in this same directory sets the precedent). A span on a pure constructor is a no-op without an
 * exporter, so the module's stated purity is unaffected.
 */
export function estimateSuppressedRefusal(opts: {
    /** The registration's own `displayName`, e.g. `'Barcelona'`. Never a hand-typed city name. */
    readonly jurisdictionDisplayName: string;
    /** The registration's own `answerSummary` — what PRYZM may honestly promise at this city. */
    readonly answerSummary?: string | null;
    /** Short "label: value" facts already in hand. Facts only — never a constraint (L-553). */
    readonly knownFacts?: readonly string[];
}): EnvelopeRefusal {
    const span = _tracer.startSpan('pryzm.zoning.estimateSuppressedRefusal');
    try {
        const city = opts.jurisdictionDisplayName.trim() || 'this jurisdiction';
        span.setAttribute('pryzm.zoning.jurisdictionDisplayName', city);
        const summary = opts.answerSummary?.trim();
        return {
            code: 'source-data-unavailable',
            // Rule 1 (L-553) — open with what we DO know: we cover this land, and we could not
            // finish. Naming the city is the fastest proof this is missing data, not a crash.
            headline:
                `${city} — PRYZM could not determine the planning zone for this parcel.`,
            detail:
                // ⚠ "FALLS INSIDE THE COVERAGE AREA", NOT "WE HOLD YOUR CITY'S RULES". The claim
                // this card is entitled to make is exactly the one the registry made: the point is
                // inside a registered EXTENT. An extent is a coarse proximity gate, never an
                // authorisation (C60 §3, and `barcelonaBbox.ts` says so in the same words) — and
                // several of them are documented as SPILLING across a border they cannot follow
                // (§CATALUNYA-SPILL, and the NL/DK/CH national boxes). Claiming to hold the
                // ordinance of whichever registration happened to claim the pixel would be a
                // coverage over-statement on the far side of that spill, on someone's land.
                `This parcel falls inside PRYZM's ${city} coverage area, so PRYZM would normally ` +
                'resolve your planning zone and apply that zone\'s rules. The planning-map lookup ' +
                'did not return a zone for this boundary, so there is no ordinance to apply. ' +
                // The sentence that makes the suppression legible, and the whole point of §L-663.
                'Rather than fall back to a generic front/side/rear estimate, we are showing you ' +
                'nothing: inside an area we cover, a generic figure is indistinguishable on screen ' +
                'from a real determination, and for street-aligned fabric it is the wrong SHAPE ' +
                'rather than an imprecise number. ' +
                'This is a data-availability problem on our side, not a limit on your land, and it ' +
                'is usually temporary — retrying, or selecting the cadastral parcel instead of ' +
                'drawing the boundary by hand, often resolves it.' +
                (summary ? ` What PRYZM can answer here: ${summary}` : ''),
            // NOT an ordinance citation. Nothing about the law failed; our data path did. Citing an
            // article for it would be the L-526 error.
            ordinanceRef: null,
            // A statement about PRYZM's data path, never about the law.
            legallyGrounded: false,
            knownFacts: [...(opts.knownFacts ?? [])],
        };
    } finally {
        span.end();
    }
}
