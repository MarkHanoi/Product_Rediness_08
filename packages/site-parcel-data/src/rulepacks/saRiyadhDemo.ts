// L-606 — Saudi Arabia / Riyadh DEMO rule pack.
//
// The MOMRAH national residential FOOTPRINT (setbacks + ground coverage), authored from the primary
// 2024 ministerial decision (قرار وزاري 1/4500943139-1446), read live. Full provenance:
//   docs/04-reference/jurisdictions/sa/SAUDI-PRIMARY-DECISION-EXTRACT.md   (the numbers, page-cited)
//   docs/04-reference/jurisdictions/sa/sa-01/ruh-riyadh/                   (the Riyadh demo record)
//
// jurisdictionId `sa-ruh-riyadh` — `<cc>-<code>-<slug>` per JURISDICTION-PLAYBOOK §2, exactly as
// `es-08019-barcelona` is `<cc>-<INE>-<slug>` (the region segment `sa-01` lives in the FOLDER path,
// not the id, mirroring how `es-ct` is absent from the Barcelona id). Saudi has no INE/LAU-equivalent
// open municipal code, so the `<code>` segment is UN/LOCODE **RUH** (`SA RUH`, Riyadh) — a documented
// international standard, lowercased. ⚠ Flagged for replacement if MOMRAH's Amana numeric code is
// ever verified (see the Riyadh README §municipal-code-choice).
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// 1. DOES SAUDI FIT OUR RULE MODEL? — YES, AND IT IS THE SIMPLEST KIND WE HAVE.
// ═════════════════════════════════════════════════════════════════════════════════════════════
// The Saudi residential FOOTPRINT is a pure NATIONAL function of `street width + plot class`:
//
//     front = max(streetWidth / 5, 3 m)     side = max(streetWidth / 5, 2 m)     rear = max(streetWidth / 5, 2 m)
//     coverage(ground) = villa 0.75 · apartment 0.65
//
// The buildable footprint is `plot ⊖ {front,side,rear}` capped at `coverage × plotArea`. That is the
// `setback` geometricRule kind (C58 §2.2, ADR-0270) — a plain per-edge INSET via
// `insetPolygonPerEdge` — plus a `maxCoverage`. No parcel→zone portal, no block dissolve, no
// profunditat-edificable construction, no tiered solid. It is the cheapest possible pack shape.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// 2. THE SETBACK IS WIDTH-DEPENDENT — AND THAT NEEDS **NO NEW RULE KIND** (the 20a precedent).
// ─────────────────────────────────────────────────────────────────────────────────────────────
// The one thing the plain `setback` kind cannot carry is a distance that is a FUNCTION of a runtime
// input (the street width) rather than a scalar. But that gap already exists and already has a
// pattern — the SAME one `esBarcelona20aAillada.ts` uses for its width-indexed FAR/height:
//
//     ship the field NULL in the pack + a pure RESOLVER module + the dispatcher attaches the
//     constructed value with its own derivation row.
//
// Here the resolver is `resolveSaudiSetbacks(streetWidth_m, plotClass)` and `saRiyadhResolvedPack()`
// attaches its triple to the zone's `setbacks` with `ordinance-pdf` provenance. The GEOMETRIC
// OPERATION is unchanged — a per-edge inset — so `geometricRule` stays `null` (the legacy inset,
// which is exactly `kind: 'setback'`). **Adding a `street-proportional-setback` KIND would be the
// wrong response for this demo**, for the same reason 20a did not add one: the operation is a plain
// inset, and the width-dependence belongs in a resolver, not in a new geometric shape. The argument
// for when a new kind WOULD be right (the gated production path, per-edge width) is the SCHEMA SPEC
// at the foot of this file — a diff SKETCH only; no shipped schema file is edited here.
//
// ⚠ WHY THE RESOLVER MUST REFUSE WHEN THE WIDTH IS MISSING, RATHER THAN SHIP THE FLOOR. The pack
// ships `setbacks: null`. If a consumer read that as "0 m" the inset would erode nothing and publish
// the WHOLE parcel as buildable — a gross over-statement (C58 §1.4 forbids exactly this direction).
// And shipping the FLOOR triple {3,2,2} as the operative value would be just as wrong the other way
// on any street ≥ 15 m, where `w/5` exceeds the floor: it would UNDER-set the setback and OVER-state
// the footprint. So the width is REQUIRED, and `resolveSaudiSetbacks` returns `ok:false` (never a
// plausible number) when it is absent — mirroring `resolve20aEdificabilitat`'s `needs-street-width`.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// 3. §NULLS — every null is a finding, not a gap.
// ─────────────────────────────────────────────────────────────────────────────────────────────
//   • `setbacks.{front,side,rear}` = NULL — the operative distance is `max(w/5, floor)`, a function
//     of the street width, resolved per-parcel by `resolveSaudiSetbacks` (§2). Cited, not empty.
//   • `maxHeight_m` = NULL, `maxFloors` = NULL — a **field-level BOUNDED cited-null refusal**
//     (C58 §1.13), NOT a whole-envelope refusal. The EXACT floors + height are municipal: §4 cl. 1
//     defers them to the approved plan (المخطط المعتمد), and development-authority regs
//     (RCRC/ROSHN/NEOM/Diriyah…) PREVAIL on conflict (§1 cl. 3). BUT — unlike the first pass claimed
//     — the decision DOES set a national numeric CEILING on the vertical extent: a villa ≤ 14 m and
//     ≤ ground+1+annex (§5-1-5 cl. 3; §3-1), an apartment ≤ 23 m (§3-2..§3-4). The exact value
//     WITHIN that ceiling is what refuses; the ceiling itself is national and is carried in
//     `SA_HEIGHT_PLAN_DEFERRED_REF` + `SA_MAX_HEIGHT_M`. These two fields stay NULL (not rendered)
//     because rendering the ceiling would OVER-state where the plan restricts below it (C58 §1.4);
//     the FOOTPRINT (setbacks + coverage) stays intact regardless. So no envelope field is a total
//     unknown: 4 of 6 are pinned nationally, the other 2 are nationally BOUNDED.
//   • `plotRatioFAR` = NULL — the residential decision has **no FAR at all** (grep of the 42-page
//     text: 0 hits for معامل البناء). Saudi residential buildability is coverage% + setbacks +
//     floor count, not FAR. The "FAR 3" figure elsewhere is a COMMERCIAL/hotel document. This is a
//     genuine absence in the residential regime, not an unencoded value.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// 4. CONFIDENCE — `estimated-ruleset`, and NOTHING here is `structured`.
// ─────────────────────────────────────────────────────────────────────────────────────────────
// The numbers are `VERIFIED-LIVE` from the primary decision, and their per-field provenance is
// `ordinance-pdf` (transcribed from a legal PDF, which drives the amber "verify against the
// ordinance" affordance). But the pack's `defaultConfidence` is `estimated-ruleset`, NOT
// `structured`: the SOURCES.md trust gate (playbook §3.3 / L-449) requires the governing CLAUSE
// NUMBERS to be human-transcribed per field and a VERIFICATION.md sign-off to exist before a pack
// may self-declare `structured`. The decision PDF is read; the clause-by-clause transcription and
// the human sign-off are NOT yet done (see the Riyadh `sources/`), so the honest ship tier is
// `estimated-ruleset`. This mirrors `esBarcelona20aAillada` exactly: `ordinance-pdf` per field,
// `estimated-ruleset` at the pack, nothing certified.
//
// PURE + deterministic (C58 §1.1). Validated against the L0 schema at module load — a malformed pack
// fails loudly at import, never silently. Strategic context: C57, C58 §1.2/§1.4/§1.11/§1.13/§2.2,
// ADR-0270, L-606, JURISDICTION-PLAYBOOK.

import {
    JurisdictionZoningContractSchema,
    type JurisdictionZoningContract,
    type ZoningRule,
} from '@pryzm/schemas';

/** `<cc>-<code>-<slug>` — the pack identity, equal to the folder path `jurisdictions/sa/sa-01/ruh-riyadh/`. */
export const SA_RIYADH_JURISDICTION_ID = 'sa-ruh-riyadh';

/** The two demo zone codes. National taxonomy has four classes; the demo ships the two that differ
 *  geometrically (villa 0.75 vs apartment 0.65 ground coverage). apt-commercial / apt-administrative
 *  share the apartment 0.65 footprint and are a follow-up (they add ground-floor use, not a new
 *  footprint rule). */
export const SA_RIYADH_ZONE_CODES = ['sa-villa', 'sa-apartment'] as const;
export type SaRiyadhZoneCode = (typeof SA_RIYADH_ZONE_CODES)[number];

/** A demo plot class the user selects in a dropdown (no per-parcel portal lookup — §1). */
export type SaudiPlotClass = 'villa' | 'apartment';

// ── The national constants, each with its page citation (SAUDI-PRIMARY-DECISION-EXTRACT.md §4). ──

/** Ch. 4 — ground-floor نسبة البناء (coverage) by class. The FOOTPRINT-governing figure. */
export const SA_GROUND_COVERAGE = Object.freeze({ villa: 0.75, apartment: 0.65 } as const);
/** Ch. 4 — upper/repeated-floor coverage (both classes 0.75) and upper-annex 0.70 of the floor
 *  beneath. NOT the footprint field — recorded as constants because `ZoningRule.maxCoverage` is a
 *  single scalar and the FOOTPRINT the demo draws is the GROUND floor. */
export const SA_UPPER_COVERAGE = 0.75;
export const SA_ANNEX_COVERAGE_OF_FLOOR_BENEATH = 0.7;

/** Ch. 2 / Ch. 4 §4.2 — the setback formula's divisor and per-class floors (metres). */
export const SA_SETBACK_STREET_DIVISOR = 5;
export const SA_SETBACK_FLOOR = Object.freeze({ front_m: 3, side_m: 2, rear_m: 2 } as const);
/** Ch. 4 (villa p18 cl. 5) — the explicit ≥ 6 m front floor at street ≥ 30 m. ⚠ SUBSUMED by
 *  `max(w/5, 3)`: `w/5 ≥ 6 ⟺ w ≥ 30`, so `max(w/5, 3)` already yields ≥ 6 m for any street ≥ 30 m.
 *  Recorded because the ordinance states it, applied automatically by the formula (see the caveat in
 *  `resolveSaudiSetbacks`). This also side-steps the apartment ≥ 30 m case the extract could NOT
 *  verify: it never binds, because `w/5 > 6` for `w > 30`. */
export const SA_FRONT_FLOOR_WIDE_STREET_M = 6;
export const SA_WIDE_STREET_THRESHOLD_M = 30;

/** §4-2 cl. 4 / §4-3 cl. 4 — the NEIGHBOUR-facing (party) separation. A DIFFERENT quantity from the
 *  street-facing side/rear above, and NOT part of the resolved street triple: the demo does not
 *  classify the party edge per-parcel. Carried so a consumer states it, never silently drops it. */
export const SA_NEIGHBOUR_SIDE_M = Object.freeze({
    villa: 1.5,
    apartment_le5floors: 2,
    apartment_gt5floors: 3,
} as const);

// ── The NATIONAL VERTICAL CEILING — a cited numeric UPPER BOUND per class. ──────────────────────
//
// 🔴 MAXIMISATION (2026-07-23, L-606 re-read of the primary PDF, machine-transcribed). The vertical
// extent is NOT purely municipal: the decision states an EXPLICIT, national, numeric CEILING per
// class. This was under-recorded in the first pass (which treated 23 m as "only a class boundary,
// not a cap" and did not surface the villa metre cap at all):
//
//   • VILLA — total height ≤ 14 m (§5-1-5 cl. 3, "الحد الأقصى لارتفاع الفلل السكنية 14 متر",
//     measured pavement→upper-annex roof slab per the §2 definition) AND floors ≤ ground + 1 upper
//     + upper annex (§3-1, "بحد أقصى دورين وملحق علوي"). BOTH are national hard caps.
//   • APARTMENT / commercial / administrative — total height ≤ 23 m (§3-2/§3-3/§3-4,
//     "لا يزيد ارتفاعها الكلي عن 23م"); above 23 m the building is HIGH-RISE (§2 definition) and
//     OUT of scope (§1-1). So for an in-scope apartment, 23 m is BOTH the class boundary AND the
//     national height ceiling.
//
// ⚠ WHY THESE ARE NOT RENDERED AS `maxHeight_m` / `maxFloors`. They are the MAXIMUM the national law
// permits, not the value a given parcel is granted: §4 cl. 1 defers the SPECIFIC permitted floors +
// height to the municipal approved plan (المخطط المعتمد), which may set LOWER (heritage, airport,
// density zones), and development authorities may override entirely (§1 cl. 3). Rendering 14 m / 23 m
// as the height would OVER-state wherever the plan restricts below the cap — the one direction
// C58 §1.4 forbids. So `maxHeight_m`/`maxFloors` stay NULL (the exact value refuses) and the ceiling
// is surfaced in the refusal text (`SA_HEIGHT_PLAN_DEFERRED_REF`) as a BOUNDED refusal — a cited
// national upper bound, not a bare "unknown". A future L5 flow MAY offer a clearly-labelled
// "national-maximum envelope" toggle rendering to this cap; that is a UI opt-in, never the default.
export const SA_MAX_HEIGHT_M = Object.freeze({ villa: 14, apartment: 23 } as const);
/** §3-1 — a villa is nationally capped at ground + 1 upper floor + an upper annex (ملحق علوي). */
export const SA_MAX_FLOORS_VILLA = Object.freeze({
    mainFloors: 2, // ground + 1 upper ("دورين")
    plusUpperAnnex: true, // + ملحق علوي (penthouse-class annex, ≤ 70% of the floor beneath)
    plusBasement: true, // + قبو (basement; not counted in total height per §5-1-5 cl. 4)
} as const);

/** The primary-source citation carried on every value in this pack. */
const SA_MOMRAH_DECISION_REF =
    'قرار وزاري رقم 1/4500943139 (1446 H ≈ 21 Jul 2024) — اشتراطات إنشاء المباني السكنية ' +
    '(Requirements for the construction of residential buildings), وزارة الشؤون البلدية والقروية ' +
    'والإسكان (MOMRAH). Read live from momah.gov.sa (HTTP 200, application/pdf, 5,084,557 B, 42 pp) ' +
    'and mirrored at balady.gov.sa — two independent government hosts. CLAUSE-CITED (machine ' +
    'transcription, L-606, 2026-07-23): villa ground coverage 75% §4-1 cl. 1; villa setbacks ' +
    'max(w/5,{3,2}) §4-1 cl. 4 (front ≥6 m at w≥30 m §4-1 cl. 5); apartment ground coverage 65% ' +
    '§4-2 cl. 1; apartment/admin setbacks §4-2 cl. 4 / §4-3 cl. 4; classes §3-1..§3-4; definitions ' +
    '§2. ⚠ estimated-ruleset — clause numbers are now transcribed, but a human VERIFICATION.md ' +
    'sign-off (playbook §3.4 / L-449) is still absent, so nothing is certified `structured`. ' +
    'See docs/04-reference/jurisdictions/sa/SAUDI-PRIMARY-DECISION-EXTRACT.md.';

/** The field-level BOUNDED cited-null refusal on height/floors (C58 §1.13). NOT a whole-envelope
 *  refusal, and NOT a bare "unknown": the EXACT value refuses (municipal), but a NATIONAL numeric
 *  CEILING is cited alongside — the honest maximum the demo can state without over-building. */
export const SA_HEIGHT_PLAN_DEFERRED_REF =
    'Floors + maximum height are BOUNDED nationally but not PINNED nationally. National CEILING: a ' +
    'villa ≤ 14 m and ≤ ground + 1 upper + upper annex (§5-1-5 cl. 3; §3-1); an apartment ≤ 23 m ' +
    '(§3-2..§3-4, above which it is high-rise and out of scope, §1-1). The EXACT permitted floors + ' +
    'height WITHIN that ceiling are deferred to the municipal approved plan (المخطط المعتمد) per ' +
    'planning zone (§4 cl. 1) and may be set LOWER; region/city development-authority regulations ' +
    '(RCRC/ROSHN/NEOM/Diriyah Gate…) PREVAIL on any conflict (§1 cl. 3). PRYZM holds no reachable ' +
    'per-zone source for the exact Riyadh value (candidates trc.alriyadh.gov.sa, rcrc.gov.sa, ' +
    'istitlaa.ncc.gov.sa are geo-fenced/WAF-blocked from outside SA; measured negatives on shape, ' +
    'not proof of absence). So height/floors REFUSE the exact value here, per-field — with the ' +
    'national ceiling cited — while the footprint (setbacks + coverage) stays intact. Rendering the ' +
    'ceiling as the height would over-state where the plan restricts below it (C58 §1.4), so ' +
    'maxHeight_m/maxFloors stay null and the cap lives here, in the refusal. — ' +
    SA_MOMRAH_DECISION_REF;

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The street-proportional SETBACK RESOLVER — mapped onto the `setback` kind (§2), never a new kind.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Why a setback triple could not be stated. One value = one missing input, never a bare failure. */
export type SaudiSetbackRefusal =
    /** No street width was supplied. `max(w/5, floor)` is undefined without it, and the floor alone
     *  would over-state the footprint on any street ≥ 15 m — so we refuse, we do not guess. */
    | 'needs-street-width';

export type SaudiSetbackResolution =
    | {
          readonly ok: true;
          /** The resolved street-facing setback triple (metres). Feed to `insetPolygonPerEdge`. */
          readonly front_m: number;
          readonly side_m: number;
          readonly rear_m: number;
          /** The article that STATES the rule. */
          readonly article: string;
          /** How it was reached, for the derivation row. */
          readonly why: string;
          /** Conditions the ordinance imposes that PRYZM did NOT apply/verify. Never empty. */
          readonly caveats: readonly string[];
      }
    | {
          readonly ok: false;
          readonly reason: SaudiSetbackRefusal;
          readonly detail: string;
      };

/**
 * Resolve the Saudi street-facing setback triple for a plot, from its fronting street width.
 *
 * PURE, deterministic, never throws. `front = max(w/5, 3)`, `side = rear = max(w/5, 2)`. Returns
 * `ok:false` (with the specific missing input) rather than a plausible number when the width is
 * absent — because in this regime the plausible number over-states the footprint (§2).
 *
 * @param streetWidth_m  عرض الشارع (frontage-to-frontage). In the demo, user-supplied; the value the
 *   geo-fenced Balady feed would otherwise carry. `streetWidth.ts` measures the same quantity where
 *   opposing parcel rings are available.
 * @param plotClass      villa | apartment (user dropdown). Governs only the caveats + neighbour rule
 *   here — the street-facing triple is identical for both classes (Ch. 4 §4.2).
 */
export function resolveSaudiSetbacks(
    streetWidth_m: number | null | undefined,
    plotClass: SaudiPlotClass,
): SaudiSetbackResolution {
    const w = streetWidth_m;
    if (typeof w !== 'number' || !Number.isFinite(w) || w <= 0) {
        return {
            ok: false,
            reason: 'needs-street-width',
            detail:
                'The Saudi setback is max(streetWidth/5, {front 3, side/rear 2}) m (2024 MOMRAH ' +
                'decision, Ch. 4 §4.2). Without the fronting street width the proportional term is ' +
                'undefined; the floor triple {3,2,2} alone would under-set the setback — and so ' +
                'over-state the footprint — on any street ≥ 15 m, the direction C58 §1.4 forbids. ' +
                'Supply عرض الشارع (frontage-to-frontage) to resolve.',
        };
    }
    const proportional = w / SA_SETBACK_STREET_DIVISOR;
    const front_m = Math.max(proportional, SA_SETBACK_FLOOR.front_m);
    const side_m = Math.max(proportional, SA_SETBACK_FLOOR.side_m);
    const rear_m = Math.max(proportional, SA_SETBACK_FLOOR.rear_m);
    const neighbour =
        plotClass === 'villa'
            ? `≥ ${SA_NEIGHBOUR_SIDE_M.villa} m (villa)`
            : `≥ ${SA_NEIGHBOUR_SIDE_M.apartment_le5floors} m (apartment ≤ 5 floors) / ` +
              `≥ ${SA_NEIGHBOUR_SIDE_M.apartment_gt5floors} m (> 5 floors)`;
    return {
        ok: true,
        front_m,
        side_m,
        rear_m,
        article:
            plotClass === 'villa'
                ? '2024 MOMRAH decision §4-1 cl. 4 (villa setbacks) — max(street width / 5, {front 3, side/rear 2})'
                : '2024 MOMRAH decision §4-2 cl. 4 (apartment setbacks) — max(street width / 5, {front 3, side/rear 2})',
        why:
            `street width ${w.toFixed(2)} m → w/5 = ${proportional.toFixed(2)} m → ` +
            `front max(${proportional.toFixed(2)}, 3) = ${front_m.toFixed(2)} m, ` +
            `side/rear max(${proportional.toFixed(2)}, 2) = ${side_m.toFixed(2)} m`,
        caveats: [
            w >= SA_WIDE_STREET_THRESHOLD_M
                ? `Street ≥ ${SA_WIDE_STREET_THRESHOLD_M} m: the ordinance's explicit ≥ ` +
                  `${SA_FRONT_FLOOR_WIDE_STREET_M} m front floor is already satisfied — ` +
                  `w/5 = ${proportional.toFixed(2)} m ≥ ${SA_FRONT_FLOOR_WIDE_STREET_M} m by ` +
                  'construction (w/5 ≥ 6 ⟺ w ≥ 30).'
                : `Street < ${SA_WIDE_STREET_THRESHOLD_M} m: the front floor is the 3 m minimum.`,
            `Neighbour (party) side separation is a SEPARATE quantity: ${neighbour} (Ch. 4 §4.2). ` +
                'It is NOT in this street-facing triple — the demo does not classify the party edge ' +
                'per-parcel, so this triple is applied to the street-facing edges (or uniformly).',
            'The ground-floor build-in-setback allowance (a building MAY occupy the setback zone at ' +
                'ground floor along ≤ 70 % of the plot perimeter, ≤ 4.5 m tall — Ch. 4 §4.3 cl. 8) ' +
                'is a RELAXATION and is NOT applied: omitting it under-builds, the safe direction.',
            'The municipal approved plan may set DIFFERENT setbacks on commercial streets (Ch. 1 §1 ' +
                'cl. 2) and per zone (Ch. 4 §4.1), and development-authority regs override on ' +
                'conflict (Ch. 1 §1 cl. 3). This national triple is the default, not the last word.',
        ],
    };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The pack (the TEMPLATE: setbacks null, resolved per-parcel — §2).
// ─────────────────────────────────────────────────────────────────────────────────────────────

function zoneFor(code: SaRiyadhZoneCode): ZoningRule {
    const isVilla = code === 'sa-villa';
    const coverage = isVilla ? SA_GROUND_COVERAGE.villa : SA_GROUND_COVERAGE.apartment;
    const label = isVilla
        ? 'Villa (فيلا سكنية, SBC R3) — national footprint (demo)'
        : 'Residential apartment (عمارة سكنية, SBC R2, ≤ 23 m) — national footprint (demo)';
    return {
        code,
        label,
        permittedUse: ['residential'],
        // §NULLS — municipal/authority plan; a field-level cited-null refusal (C58 §1.13).
        maxHeight_m: null,
        maxFloors: null,
        // §NULLS — no residential FAR exists in this regime.
        plotRatioFAR: null,
        // The ground-floor coverage — the footprint-governing figure (§3). Ordinance constant.
        maxCoverage: coverage,
        // §NULLS — the operative setback is max(w/5, floor), resolved per-parcel by
        // resolveSaudiSetbacks + attached by saRiyadhResolvedPack. Null here is the CITED template,
        // not a gap: shipping a scalar would be wrong for every street ≠ the one it was written for.
        setbacks: { front_m: null, side_m: null, rear_m: null },
        // `null` = the legacy per-edge inset, which IS `kind: 'setback'` — the correct operation.
        // The width-dependence lives in the resolver, not in a new geometric shape (§2). No new
        // GeometricRule kind is declared or needed for the demo.
        geometricRule: null,
        fieldProvenance: {
            // The footprint numbers are transcribed from the legal PDF → ordinance-pdf (drives the
            // amber "verify against the ordinance" affordance). setback.* is stamped ordinance-pdf
            // by saRiyadhResolvedPack once resolved; here the fields are null so no row is asserted.
            maxCoverage: 'ordinance-pdf',
            permittedUse: 'ordinance-pdf',
        },
        ordinanceRef:
            (isVilla
                ? 'Villa: ground coverage ≤ 75 % (§4-1 cl. 1); setbacks max(w/5, {front 3, side/rear 2}) m ' +
                  '(§4-1 cl. 4, front ≥6 m at w≥30 m §4-1 cl. 5); national height ceiling ≤ 14 m & ' +
                  '≤ ground+1+annex (§5-1-5 cl. 3; §3-1). '
                : 'Apartment: ground coverage ≤ 65 % (§4-2 cl. 1); setbacks max(w/5, {front 3, side/rear 2}) m ' +
                  '(§4-2 cl. 4); national height ceiling ≤ 23 m (§3-2). ') +
            SA_HEIGHT_PLAN_DEFERRED_REF,
    };
}

/**
 * The Riyadh demo pack — TWO zones, `setbacks` null (resolved per-parcel). `source: 'manual'` (a
 * hand-curated pack from a PDF, not a structured feed — the enum has no MOMRAH member; see the
 * WIRING TODO on adding one). `defaultConfidence: 'estimated-ruleset'` (§4). Parsed at load.
 */
export const SA_RIYADH_DEMO_PACK: JurisdictionZoningContract =
    JurisdictionZoningContractSchema.parse({
        jurisdictionId: SA_RIYADH_JURISDICTION_ID,
        displayName: 'Riyadh — MOMRAH national residential footprint (demo)',
        source: 'manual',
        crs: 'EPSG:4326',
        lastReviewed: '2026-07-23',
        defaultConfidence: 'estimated-ruleset',
        zones: SA_RIYADH_ZONE_CODES.map(zoneFor),
    });

/** Map a demo plot class to its zone code. */
export function saRiyadhZoneCodeForClass(plotClass: SaudiPlotClass): SaRiyadhZoneCode {
    return plotClass === 'villa' ? 'sa-villa' : 'sa-apartment';
}

export type SaRiyadhResolvedPack =
    | { readonly ok: true; readonly pack: JurisdictionZoningContract; readonly why: string }
    | { readonly ok: false; readonly reason: SaudiSetbackRefusal; readonly detail: string };

/**
 * Build a PER-PARCEL resolved pack: `SA_RIYADH_DEMO_PACK` with the chosen zone's `setbacks` filled
 * from `resolveSaudiSetbacks(streetWidth_m, plotClass)` and stamped `ordinance-pdf` provenance. This
 * is the honest injection point — the setback is an ordinance-derived value, so `ordinance-pdf` (not
 * `published-structured`) is the correct per-field provenance, and the engine reads it from
 * `zone.setbacks`. The dispatcher passes the returned pack to `computeBuildableEnvelope`.
 *
 * Refuses (mirroring the resolver) when the width is missing — the footprint is then genuinely
 * unresolvable, and a cited refusal is the answer, not a whole-parcel envelope.
 *
 * PURE, deterministic. Re-parsed through the L0 schema so a malformed clone fails loudly.
 */
export function saRiyadhResolvedPack(
    streetWidth_m: number | null | undefined,
    plotClass: SaudiPlotClass,
): SaRiyadhResolvedPack {
    const r = resolveSaudiSetbacks(streetWidth_m, plotClass);
    if (!r.ok) return { ok: false, reason: r.reason, detail: r.detail };
    const code = saRiyadhZoneCodeForClass(plotClass);
    const zones = SA_RIYADH_DEMO_PACK.zones.map((z) =>
        z.code === code
            ? {
                  ...z,
                  setbacks: { front_m: r.front_m, side_m: r.side_m, rear_m: r.rear_m },
                  fieldProvenance: {
                      ...z.fieldProvenance,
                      'setback.front': 'ordinance-pdf' as const,
                      'setback.side': 'ordinance-pdf' as const,
                      'setback.rear': 'ordinance-pdf' as const,
                  },
              }
            : z,
    );
    const pack = JurisdictionZoningContractSchema.parse({ ...SA_RIYADH_DEMO_PACK, zones });
    return { ok: true, pack, why: r.why };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// WIRING TODO (orchestrator) — this pack is NOT registered. Three edits, all data/additive.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// (A) packages/site-parcel-data/src/index.ts — export the surface (mirrors the 20a block):
//
//     export {
//         SA_RIYADH_DEMO_PACK,
//         SA_RIYADH_ZONE_CODES,
//         SA_RIYADH_JURISDICTION_ID,
//         resolveSaudiSetbacks,
//         saRiyadhResolvedPack,
//         saRiyadhZoneCodeForClass,
//         SA_GROUND_COVERAGE,
//         SA_MAX_HEIGHT_M,
//         SA_MAX_FLOORS_VILLA,
//         SA_HEIGHT_PLAN_DEFERRED_REF,
//         type SaudiPlotClass,
//         type SaRiyadhZoneCode,
//         type SaudiSetbackResolution,
//         type SaudiSetbackRefusal,
//         type SaRiyadhResolvedPack,
//     } from './rulepacks/saRiyadhDemo.js';
//
// (B) packages/site-parcel-data/src/rulepacks/registry.ts — add a JurisdictionRegistration. Needs a
//     Riyadh bbox provider (new file `providers/riyadhBbox.ts` exporting `RIYADH_BBOX` +
//     `isInRiyadh(lat,lon)`, mirroring `barcelonaBbox.ts`; Riyadh ≈ 24.4–25.1 N, 46.4–47.1 E — a
//     COARSE proximity gate, C60 §3). Then, inside REGISTRATIONS:
//
//         {
//             jurisdictionId: SA_RIYADH_JURISDICTION_ID,          // 'sa-ruh-riyadh'
//             displayName: 'Riyadh',
//             countryCode: 'SA',
//             countryName: 'Saudi Arabia',
//             extent: RIYADH_BBOX,
//             contains: isInRiyadh,
//             answerSummary:
//                 'National MOMRAH residential FOOTPRINT (setbacks + ground coverage) for the ' +
//                 'villa and apartment classes — the class is user-picked and the street width ' +
//                 'user-supplied (no reachable parcel feed). Height + floors REFUSE, per-field: ' +
//                 'they are set by the municipal approved plan and development authorities, not ' +
//                 'nationally.',
//             packsByZone: packMap([SA_RIYADH_DEMO_PACK, [...SA_RIYADH_ZONE_CODES]]),
//             refusalFor: () => null,      // no per-zone legal refusal table for the demo
//             // NO noRulePackRefusal: the two demo zones ARE the pack; unknown Saudi zones keep the
//             // estimated fallback (suburban/detached fabric, where a setback triple is the right
//             // shape) rather than a coverage-gap refusal.
//         },
//
//     ⚠ Import `SA_RIYADH_DEMO_PACK`, `SA_RIYADH_ZONE_CODES`, `SA_RIYADH_JURISDICTION_ID` at the top
//     of registry.ts. The `packMap` guard throws on a duplicate code — 'sa-villa'/'sa-apartment' do
//     not collide with any Barcelona clau, so it is clean.
//
// (C) The L5 DEMO DISPATCHER (apps/editor) — the runtime flow, NOT an engine edit:
//       1. user picks class → `saRiyadhZoneCodeForClass(plotClass)`.
//       2. user supplies fronting street width → `saRiyadhResolvedPack(width, plotClass)`.
//          If `ok:false` → dispatch a cited refusal (needs-street-width), draw no envelope.
//       3. build a ZoningRecord: `{ zoneCode, zoneLabel, jurisdictionId: 'sa-ruh-riyadh',
//          structuredFields: {}, overlays: [], ordinanceRef: null, provenance: {...} }` (shape per
//          `estimatedDefaultZoningRecord()`), and call
//          `computeBuildableEnvelope({ parcelRing, edgeClassifications, zoning, rulePack: result.pack })`.
//       The engine insets by the resolved triple (ordinance-pdf), caps by coverage, and returns
//       `maxHeight/maxFloors = null` with the cited refusal — confidence `estimated-ruleset`.
//
// OPTIONAL schema follow-up (NOT for the demo): add `'momrah'` to `ZoningPackSourceSchema`
// (packages/schemas/src/site/zoning/JurisdictionZoningContract.ts) so `source` need not be 'manual'.
// A one-line enum addition; deferred because it edits a shipped schema file under concurrent edit.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// SCHEMA SPEC (diff SKETCH only — no shipped schema file edited here) — `street-proportional-setback`
// ═════════════════════════════════════════════════════════════════════════════════════════════
// WHEN this becomes the cleaner home (NOT the demo): the GATED PRODUCTION path, where the width comes
// from measured/read cadastral geometry PER EDGE (a corner plot fronts two streets of different
// widths). Then the width-proportionality belongs INSIDE the compliance engine — resolved per edge
// at solve time — rather than pre-resolved by a UI caller into one triple. The demo's single
// user-supplied width → one triple does NOT need this; a per-edge width does.
//
// Sketch (to add to packages/schemas/src/site/GeometricRule.ts, as an ADR — do not hand-edit):
//
//     export const StreetProportionalSetbackRuleSchema = z.object({
//         kind: z.literal('street-proportional-setback'),
//         divisor: z.number().positive(),                 // MOMRAH ⇒ 5
//         frontFloor_m: z.number().nonnegative(),         // ⇒ 3
//         sideFloor_m: z.number().nonnegative(),          // ⇒ 2
//         rearFloor_m: z.number().nonnegative(),          // ⇒ 2
//     });   // add to GeometricRuleSchema union; requiresBlockRing → false (it needs a WIDTH, not a block)
//
// The engine's setback branch would, per edge i: `s_i = max(edgeStreetWidth_i / divisor, floor(class_i))`
// then `insetPolygonPerEdge` as today — reusing the SAME inset (no second solver), exactly as the
// demo resolver does, but with a per-edge width the engine measures rather than a single input. This
// is additive (ADR-0270 reason 3/4: a new variant, a compile-checked switch arm), touches no shipped
// pack, and would let the Saudi pack drop its resolver in favour of a declared rule once a reachable
// per-edge width source exists. Until then, the demo mapping onto `setback` is strictly simpler and
// ships today.
