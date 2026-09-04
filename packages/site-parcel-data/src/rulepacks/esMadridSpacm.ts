// ── Comunidad de Madrid (the 178 municipalities that are NOT the capital) — the registration. ──
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS REGISTERS, AND WHAT IT DELIBERATELY DOES NOT
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The adapter that turns a regional `sitcm:VPLA_V_ORDENANZA` row into a `GeometricRule` now lives
// in this package (`esMadridSpacmAdapter.ts` and its five siblings). This file is the JURISDICTION
// SURFACE for it: the id, the publication gate, and the cited refusal every Comunidad de Madrid
// parcel receives while that gate is shut.
//
// ⛔⛔ **NOTHING HERE PUBLISHES A NUMBER, AND THAT IS NOT AN OVERSIGHT.**
// `CM_SPACM_ENVELOPE_VERIFIED` is `false`. The L-449 legal gate is UNSIGNED, and flipping it is a
// founder act — never an implementer's. The adapter already carries this as a first-class refusal
// (`verification-gate-closed`), computed ALONGSIDE the routing refusals rather than instead of
// them, so signing the gate can never expose a refusal nobody had ever seen.
//
// ⚠⚠ **THE CAPITAL IS NOT IN THIS REGISTRATION AND MUST NEVER BE FOLDED INTO IT.**
// Madrid (INE 28079) keeps `esMadridNZ1.ts` / `esMadridPgoum97.ts`: a different publisher
// (`sigma.madrid.es`), a different corpus (PGOUM-97 Título 8), a different failure mode. And the
// Madrid NZ-1 position is SETTLED — parcel ring + cited COEF_Z, deliberately not computed further,
// because "C" is per-ficha case law and not an engineering gap (`madrid-nz1-ring-only-decision`).
// Under §JURISDICTION-SPECIFICITY the capital's `'municipal'` claim out-ranks this `'regional'`
// one automatically, so this registration cannot reach a capital parcel. That is the mechanism —
// not a convention someone must remember.
//
// ⚠ WHY THE CAPITAL COULD NOT BE THE PROVING MUNICIPALITY, STATED RATHER THAN GLOSSED.
// A census of `sigma.madrid.es` — 41 folders · 447 services · 3,591 layers · **24,718 fields** —
// scored every field name and alias against a lexeme set deliberately wider than the obvious one
// (`profundidad` beside `fondo`, `retiro` beside `retranqueo`). Result: **`depth: 0`,
// `setback: 0`.** The capital's own `Visor_Edificabilidad` layer does carry a buildability
// QUANTITY with its unit stated as a column, but 57.7 % of those rows are CATASTRO-derived (what
// exists, not what is allowed — ADR-0270 wrong-KIND) or the publisher's own estimate, and a
// FLOORSPACE CAP IS NOT A SOLID: with no published height anywhere, an envelope could only be
// drawn there by inventing a storey height, which is the L-616 fabrication verbatim.
// ⇒ The proving municipality FELL BACK to **Boadilla del Monte (INE 28022)**, and it is recorded
//   as a labelled fallback. A labelled fallback is legitimate; a silent substitution is not.
//
// PURITY: L2-pure (C58 §1.9) — no I/O, no THREE, no DOM, no clock. A refusal is data.
//
// Governance: C58 §1.3/§1.5/§1.13 · C60 · C63 · ADR-0270 · ADR-0283 · ADR-0287 · ADR-0293 ·
// L-449 · L-616 · L-656 · §CONTEXT-DATA-HONESTY.

import { trace } from '@opentelemetry/api';
import type { EnvelopeRefusal, EnvelopeRefusalCode } from '@pryzm/schemas';
import { isComunidadMadridIneCode } from '../providers/comunidadMadridBbox.js';
import type { RefusalReason } from './esMadridSpacmSchema.js';

const _tracer = trace.getTracer('pryzm.zoning');

/**
 * The jurisdiction id every Comunidad de Madrid record and registration uses. One constant.
 *
 * ⚠ NO INE SEGMENT, ON PURPOSE. `ineCodeForJurisdiction()` parses `<cc>-<INE>-<slug>` and returns
 * `null` here — which is TRUE: a regional jurisdiction encodes no single municipality. The same
 * shape Catalonia uses (`es-ct-catalunya`). Inventing a representative INE would make the registry
 * claim this registration IS one municipality, which is exactly what it is not.
 */
export const CM_SPACM_JURISDICTION_ID = 'es-md-comunidad-madrid';

/**
 * ⛔⛔ §CM-REGISTRATION-BLOCKED — WHY THIS ID IS NOT IN `registry.ts` YET, MEASURED.
 *
 * The port is complete: the adapter is L2, exported, spanned and green on 148 tests, and the
 * Boadilla record is byte-identical to the pre-port capture. What did NOT land is the
 * `JurisdictionRegistration`, and the reason is a MEASUREMENT that overturned my own first
 * assumption — recorded rather than deleted, because the wrong version was confidently wrong.
 *
 * ⚠ **MY FIRST DIAGNOSIS WAS "`MADRID_BBOX` IS ~6 km TOO LOOSE, TIGHTEN IT". IT IS FALSE.**
 * Sourcing the competent authority's OWN municipal boundaries — `Callejero:SIGI_V_MUNICIPIOS` on
 * `idem.comunidad.madrid`, keyless, read 2026-08-02 — gives:
 *
 *     MADRID   (28079)  lon [-3.888963, -3.518126]   lat [40.312065, 40.643280]
 *     BOADILLA (28022)  lon [-3.952589, -3.837814]   lat [40.377684, 40.456197]
 *
 * The shipped `MADRID_BBOX` lower longitude is `-3.90` against a real `-3.888963` — **938 m of
 * outward rounding, not 6 km**, and that rounding is the DELIBERATE discipline every `*Bbox.ts`
 * here states ("rounded OUTWARD … a too-tight gate silently drops real land, which is the failure
 * that cannot be seen"). Tightening it would be reversing a correct decision to make my own row fit.
 *
 * ⭐ **THE REAL FINDING: THE TWO MUNICIPAL TERMS GENUINELY INTERLEAVE — 4.35 km OF LONGITUDINAL
 * BBOX OVERLAP.** Madrid's western arm (Casa de Campo → El Pardo) reaches past Boadilla's eastern
 * edge. ⇒ **NO RECTANGLE CAN ROUTE BETWEEN THEM.** This is `registry.ts` §EXTENT-SPILLS-A-BORDER
 * exactly, and that section already names the only correct fix — REAL POLYGON EXTENTS — while
 * recording that it was rejected because *"PRYZM holds no municipal or national boundary geometry,
 * and inventing one is the fabrication this whole subsystem exists to refuse."*
 *
 * ⭐⭐ **THAT PREMISE IS NOW FALSE FOR THIS COMMUNITY, AND THAT IS THE UNBLOCKER.**
 * `Callejero:SIGI_V_MUNICIPIOS` publishes all 179 Comunidad de Madrid municipal boundary polygons
 * as geometry, keyless, on the SAME endpoint the ordinance corpus is read from. Nothing needs to be
 * invented; a boundary-polygon routing gate can be SOURCED. That is a real change to how the
 * registry routes (a `contains` predicate backed by geometry rather than a rectangle) and it is
 * bigger than a data addition, so it is named here rather than smuggled in.
 *
 * ⚠ A SECOND, INDEPENDENT BLOCKER, ALSO MEASURED: `jurisdictionSpecificity.test.ts` asserts *"each
 * registration's extent CENTRE resolves to that registration"*. The Comunidad de Madrid's bbox
 * centre is (40.585, -3.810) — inside Madrid capital's REAL extent, not merely its rounded one. So
 * that invariant is UNSATISFIABLE by any rectangle for a region whose capital sits at its centre;
 * Catalonia passes it only because Barcelona is coastal and therefore off-centre. Weakening a
 * shipped guard to admit my own row would be exactly backwards, so it was left alone.
 *
 * ⇒ UNTIL THEN, this surface is reachable BY IMPORT (`@pryzm/site-parcel-data`) and unreachable BY
 * CLICK. That is stated plainly rather than papered over: an adapter nothing routes to answers
 * nobody, which is the §authored-but-unwired failure this port set out to end, and it is only half
 * ended.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * ⭐ ADDENDUM 2026-09-04 (lane ENVELOPE-IBERIA round 4) — THE UNBLOCKER IS NO LONGER A PROPOSAL.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * The 2026-08-02 reading above quoted two BBOXES out of `Callejero:SIGI_V_MUNICIPIOS`. The whole
 * layer has now been FETCHED and put through the shipped predicate — the run is
 * `tools/envelope-slot-coverage/measureMadridRegion.ts` Goal A, artefacts
 * `out/es-md-region.slots.md` + `out/cm-sigi-municipios.geojson`:
 *
 *   • HTTP 200, `application/json`, **4,121,578 bytes · 179 features** (the layer's own census).
 *     ⚠ The FIRST attempt the same day returned **HTTP 400** with an Oracle
 *     `Unable to obtain connection` exception — the upstream, not the request. **A service failure
 *     is never a zero**; the shape below is the one that answered on retry, unchanged.
 *   • CRS `urn:ogc:def:crs:EPSG::25830` · Polygon × 170, MultiPolygon × 9 · **153,499 vertices**.
 *   • The INE key is **`CDMUNICIPIO`** — 3 digits, zero-padded, 179 distinct over 179 features;
 *     INE-5 composes as `'28' + CDMUNICIPIO`, the same key `VPLA_V_ORDENANZA.CD_MUNICIPIO` uses.
 *     ⚠ "keyless" in the paragraph above is now REFUTED: the layer carries its key.
 *   • **20 hand-chosen points through the SHIPPED `pointInRingsEvenOdd`: 20 of 20 land in EXACTLY
 *     ONE municipality**, seven of them inside the 4.35 km interleave band. 079 and 022 interiors
 *     are DISJOINT (0 vertices of either inside the other, 0 proper crossings).
 *   • Douglas-Peucker at **20 m → 20,682 vertices (−86.5 %, ≈478 KB)** and **50 m → 12,236
 *     (−92 %)** both keep all 20 classifications and both keep the two interiors disjoint. A
 *     3,000-point seeded control re-classifies **100.0 %** identically at 20 m, **99.7 %** at 50 m.
 *     ⚠ The 50 m delta is neighbours simplified INDEPENDENTLY opening hairline slivers on shared
 *     borders — a production gate must simplify shared edges once, or ask both near a border.
 *
 * ⛔⛔ AND THE COST OF NOT DOING IT IS NOW MEASURED ON REAL LAND, NOT ARGUED. Over 80 real Catastro
 * parcels drawn uniformly from the full INSPIRE CP populations of Boadilla del Monte (8,456) and
 * Colmenar Viejo (13,028), the SHIPPED `resolveRegisteredJurisdictionAt` claims
 * **`es-28079-madrid` at 30 of 40 Boadilla centroids and 7 of 40 Colmenar centroids** — 37 real
 * parcels routed to the CAPITAL's registration, which is a different plan, a different publisher
 * and a different pack. The SIGI predicate puts **80 of 80** in their own municipality. That is the
 * §EXTENT-SPILLS-A-BORDER failure happening, not risked.
 *
 * ⚠ STILL NOT WIRED, and deliberately: routing on geometry is a change to `registry.ts`'s contract
 * (a `contains` backed by ~478 KB of polygons, its own load path and its own staleness question),
 * the second blocker above (`jurisdictionSpecificity.test.ts`'s centre invariant) is untouched by
 * any of this, and `CM_SPACM_ENVELOPE_VERIFIED` is still false so nothing would publish anyway.
 * What changed is that the evidence is now on disk instead of being an argument.
 */
export const CM_SPACM_REGISTRATION_BLOCKED = true as const;

/**
 * Is a signed, verified Comunidad de Madrid envelope rule set available for PUBLICATION?
 *
 * ⛔ **`false`, AND AN IMPLEMENTER MAY NOT FLIP IT.** L-449: the flip is a legal act and travels
 * WITH a founder signature recorded in the dossier, never ahead of it. Murcia's gate reads `true`
 * because a signature exists; this one does not.
 *
 * ⚠ WHAT A SIGNATURE WOULD AND WOULD NOT AUTHORISE, measured, so the ask is honest:
 *  - it WOULD open the **39.38 %** of Boadilla's 1,958 ordinance polygons the adapter can solve
 *    (setback triple + a vertical limit, base plan governing directly);
 *  - it would NOT touch the **57.41 %** that are public systems — the ordinance's own "no";
 *  - it would NOT touch land inside a development ámbito. Moralzarzal is **0 % drawable** because
 *    a named ámbito covers 99.76 % of its rows; that is the routing guard WORKING, and no
 *    signature lifts it;
 *  - it would NOT close the OPEN TOP. AESA Barajas obstacle surfaces, heritage and flood all
 *    constrain DOWNWARD and are NOT held (ADR-0293, and L-616's ratified rule that a solid must
 *    intersect ALL derived constraints).
 *
 * ⚠ Every rate above is per ORDINANCE POLYGON. The regional corpus contains **no parcels**, so
 * none of these is the L-656 buildable-land denominator the C63 ENVELOPE axis scores. Quoting one
 * as if it were is the exact error L-656 ratified against.
 */
export const CM_SPACM_ENVELOPE_VERIFIED = false as const;

/**
 * The proving parcel, pinned as a constant so the claim is checkable rather than prose.
 * `proveParcel.ts` re-derives every one of these from the committed live capture.
 */
export const CM_SPACM_PROVEN_PARCEL = {
    cadastralRef: '4228504VK2742N',
    address: 'CL JUAN DE VILLANUEVA 10 BOADILLA DEL MONTE (MADRID)',
    /** ⚠ The 3-digit `CD_MUNICIPIO` key, NOT INE-5. `'28022'` returns ZERO on a clean HTTP 200. */
    cdMunicipio: '022',
    ine5: '28022',
    zone: 'RESIDENCIAL UNIFAMILIAR',
    recordId: 253995,
} as const;

/**
 * §6.1 — the adapter's `RefusalReason` → the schema's `EnvelopeRefusalCode`.
 *
 * ⭐ EVERY MAPPING IS TO AN EXISTING C58 CODE. No new code is introduced, because a new code is a
 * new RENDERING the UI would have to learn, and every one of these facts already has a home.
 *
 * ⚠⚠ **`source-data-unavailable` IS DELIBERATELY UNREACHABLE FROM THIS TABLE.** It is the only
 * TRANSIENT code and therefore the only one that earns a retry affordance. Not one adapter refusal
 * clears on a retry — a delegation, an ambiguity and a contradiction are all DURABLE — so offering
 * one would send the user round a loop for ever (the L-574 / §L-590c reasoning). Transport failure
 * is a different layer's fact and must be raised there, not laundered through a rule refusal.
 */
const REFUSAL_CODE_BY_REASON: Readonly<Record<RefusalReason, EnvelopeRefusalCode>> = {
    // ── LEGALLY GROUNDED — the ordinance's own answer. ───────────────────────────────────────
    'development-ambito-governs': 'derived-plan',
    'public-system': 'public-system',
    'not-urban-land': 'protected-soil',
    // ── ROUTING — statements about PRYZM's ability to SELECT, never about the law. ───────────
    'instrument-class-unpublished': 'regime-undetermined',
    'instrument-key-ambiguous': 'regime-undetermined',
    'routing-token-unrecognised': 'regime-undetermined',
    'parameters-contradict': 'regime-undetermined',
    // ── COVERAGE — statements about what PRYZM holds. ────────────────────────────────────────
    'no-grammar-determined': 'no-rule-pack',
    'required-parameter-unknown': 'no-rule-pack',
    'value-is-existing-derived': 'no-rule-pack',
    'value-is-publisher-estimate': 'no-rule-pack',
    'value-unit-undocumented': 'no-rule-pack',
    'verification-gate-closed': 'no-rule-pack',
};

/**
 * Map one adapter refusal reason onto the schema's refusal code.
 *
 * TOTAL by construction: the table is a `Record<RefusalReason, …>`, so adding a reason to the
 * adapter without mapping it is a `tsc` error rather than a runtime fall-through to a wrong code.
 *
 * PURE, total, never throws. P8 — emits `pryzm.zoning.madridSpacm.envelopeRefusalCodeFor`.
 */
export function envelopeRefusalCodeFor(reason: RefusalReason): EnvelopeRefusalCode {
    const span = _tracer.startSpan('pryzm.zoning.madridSpacm.envelopeRefusalCodeFor');
    try {
        const code = REFUSAL_CODE_BY_REASON[reason];
        span.setAttribute('reason', reason);
        span.setAttribute('code', code);
        return code;
    } finally {
        span.end();
    }
}

/**
 * The roadmap line, stated once. Same role as `MURCIA_ROADMAP_LINE`: the refusal card must say
 * what would change the answer, or the user cannot tell a coverage gap from a crash.
 */
export const CM_SPACM_ROADMAP_LINE =
    'Comunidad de Madrid coverage today: the PARCEL half is complete and live — the national ' +
    'Catastro path resolves the referencia catastral, the official boundary, the official area and ' +
    'the existing buildings with their floor counts, keyless. The ORDINANCE half is read and ' +
    'understood: the regional planning service publishes, per ordinance polygon, the zone ' +
    'designation, the land classification, the maximum height, the storey count, the plot ' +
    'coverage, the buildable depth and the front/side/rear setbacks, and PRYZM now holds a rule ' +
    'adapter that turns those into a buildable-envelope rule the engine can solve — proven end to ' +
    'end on a real parcel in Boadilla del Monte. What is missing is the human signature on that ' +
    'transcription: no Comunidad de Madrid figure has been legally verified for publication, so ' +
    'PRYZM publishes none. ⚠ And a signature would not unlock every parcel. Where a development ' +
    'instrument — a Plan Parcial, a Plan Especial, a Unidad de Ejecución — governs the land, the ' +
    'general plan DELEGATES and that instrument sets the buildability; PRYZM does not hold it, and ' +
    'no signature changes that. Where the general plan reserves the land for a road, a green space ' +
    'or a facility, the ordinance grants no private envelope at all — which is an answer, not a ' +
    'gap. Aeronautical obstacle surfaces around Barajas, heritage catalogues and flood zones are ' +
    'all known to constrain these parcels DOWNWARD and are not yet held, so any envelope PRYZM ' +
    'eventually draws here is an open top and will say so.';

/**
 * THE HONESTY-GATE refusal: returned for EVERY Comunidad de Madrid parcel outside the capital
 * while `CM_SPACM_ENVELOPE_VERIFIED` is false and no live ordinance row has been resolved.
 *
 * `code: 'no-rule-pack'` + `legallyGrounded: false` + `ordinanceRef: null` — a statement about
 * PRYZM's COVERAGE, not about the law. The distinction is load-bearing and must not be softened:
 * the ordinance almost certainly DOES grant an envelope on this urban land, so claiming a legal
 * "no" would tell the owner of a perfectly buildable plot that the law forbids building on it.
 * That is the opposite error, and it is worse.
 *
 * ⚠⚠ **§COMUNIDAD-MADRID-SPILL — THIS FUNCTION REFUSES TO MIS-CITE, AND RETURNS `null` TO DO IT.**
 * The registration's bbox is a rectangle and the Comunidad de Madrid is a diamond, so the box also
 * covers Toledo, Guadalajara, Segovia, Ávila and Cuenca. When the caller knows the parcel's INE
 * code and it is not a `28` one, this returns `null` rather than a Comunidad de Madrid refusal —
 * a wrong-jurisdiction citation is worse than no answer, because it is a confident claim
 * attributed to the wrong law. `null` when the INE code is UNKNOWN is NOT the behaviour: an absent
 * code is not evidence of being outside, so the refusal still issues and simply cites nothing.
 *
 * PURE, total, never throws. P8 — emits `pryzm.zoning.madridSpacm.noRulePackRefusal`.
 */
export function comunidadMadridNoRulePackRefusal(
    zoneCode?: string | null,
    zoneLabel?: string | null,
    knownFacts: readonly string[] = [],
    /** The parcel's INE-5 code where the caller holds it. ⚠ `undefined` ≠ "outside". */
    ineCode?: string | null,
): EnvelopeRefusal | null {
    const span = _tracer.startSpan('pryzm.zoning.madridSpacm.noRulePackRefusal');
    try {
        // The EXACT gate. Only a KNOWN, non-Madrid code suppresses the refusal; an unknown code
        // must not be read as "elsewhere" (§CONTEXT-DATA-HONESTY: absent ≠ negative).
        if (typeof ineCode === 'string' && ineCode.trim() !== '' && !isComunidadMadridIneCode(ineCode)) {
            span.setAttribute('suppressedForForeignIne', true);
            span.setAttribute('ineCode', ineCode.trim());
            return null;
        }
        span.setAttribute('suppressedForForeignIne', false);
        span.setAttribute('code', 'no-rule-pack');
        return buildCmCoverageRefusal(zoneCode, zoneLabel, knownFacts);
    } finally {
        span.end();
    }
}

/**
 * The REGISTRY-path refusal — the same card, with the §COMUNIDAD-MADRID-SPILL suppression
 * structurally unreachable.
 *
 * ⚠ THIS IS A SEPARATE FUNCTION RATHER THAN A NON-NULL ASSERTION AT THE CALL SITE, AND THE
 * DIFFERENCE MATTERS. `JurisdictionRegistration.noRulePackRefusal` returns a non-nullable
 * `EnvelopeRefusal`, and its inputs are a zone code and labels — it never holds a parcel, so it
 * never holds an INE code and the spill gate cannot fire. Writing `…!` at the registry would
 * encode that as an assumption that becomes a silent lie the day the registry signature gains a
 * parcel; expressing it as a function that CANNOT return null keeps the two paths honest
 * independently. Same split, and same reason, as Catalonia's `catalunyaRegistryRefusal`.
 *
 * PURE, total, never throws. P8 — emits `pryzm.zoning.madridSpacm.registryRefusal`.
 */
export function comunidadMadridRegistryRefusal(
    zoneCode?: string | null,
    zoneLabel?: string | null,
    knownFacts: readonly string[] = [],
): EnvelopeRefusal {
    const span = _tracer.startSpan('pryzm.zoning.madridSpacm.registryRefusal');
    try {
        span.setAttribute('code', 'no-rule-pack');
        return buildCmCoverageRefusal(zoneCode, zoneLabel, knownFacts);
    } finally {
        span.end();
    }
}

/** The one statement of the card. Private so the two public paths cannot drift apart. */
function buildCmCoverageRefusal(
    zoneCode: string | null | undefined,
    zoneLabel: string | null | undefined,
    knownFacts: readonly string[],
): EnvelopeRefusal {
    const zone =
        zoneLabel && zoneLabel.trim()
            ? `${zoneLabel.trim()}${zoneCode ? ` (${zoneCode})` : ''}`
            : zoneCode && zoneCode.trim()
              ? `Zone ${zoneCode}`
              : 'This Comunidad de Madrid parcel';

    return {
        code: 'no-rule-pack',
        headline: `${zone} — PRYZM has identified your land precisely and can read the ordinance that governs it, but no Comunidad de Madrid figure has been legally verified for publication, so it will not show one.`,
        detail:
            'The parcel itself is fully established from the Spanish Dirección General del ' +
            'Catastro: its referencia catastral, its official boundary, its officially ' +
            'registered area and any existing buildings with their floor counts are read live ' +
            'from the national INSPIRE services, by identifier — not inferred from a map pin. ' +
            'The governing ordinance is published by the Comunidad de Madrid as data, and PRYZM ' +
            'reads it: the zone designation, the land classification and, where the plan states ' +
            'them, the maximum height, storey count, plot coverage, buildable depth and setback ' +
            'distances. What PRYZM does NOT yet have is a human legal verification of that ' +
            'reading, and it will not publish a buildable figure without one. Rather than show ' +
            'an estimated or proxied number that would look like a determination, PRYZM shows ' +
            'none. ' +
            CM_SPACM_ROADMAP_LINE,
        ordinanceRef: null,
        legallyGrounded: false,
        knownFacts: [...knownFacts],
    };
}
