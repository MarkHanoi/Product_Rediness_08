// §NL-ROOF-UNDERDETERMINED (lane ENVELOPE-NLDK, 2026-09-04) — two limits are NOT a roof.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ PHASE 0 CHANGED THIS MODULE'S STATUS FROM "EDGE CASE" TO "MAIN PATH"
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The lane brief flagged M5 as the measurement that could change the product's shape: *"if roofs
// are underdetermined on most parcels, UNDERDETERMINED is the MAIN PATH, not the exception."*
//
// It is the main path, and by a wider margin than the brief anticipated. Measured over 750 parcels
// (nl-phase0-report.json §M2_M5a):
//
//   goothoogte AND bouwhoogte CO-OCCUR ON  1 OF 500 land parcels  and  0 OF 250 urban parcels.
//   That one co-occurrence carried NO roof-form maatvoering at all
//   → 100% of observed co-occurrences are underdetermined by the structured fields alone.
//
// And the structured roof fields are not merely sparse, they are ABSENT:
//   max-dakhelling  0/343 land · 0/213 urban        max-nokhoogte  0/343 land · 0/213 urban
// i.e. across 556 parcels with a governing plan, SVBP2012 maatvoering published a roof-pitch or
// ridge-height value ZERO times.
//
// ⚠ THE ROOF RULES EXIST — THEY ARE JUST NOT IN THE STRUCTURED FIELDS. The plan-text census over
// 66 plans (§M4_M5b.m5b_and_census) found dakhelling in 28.8%, kap in 27.3%, dakvorm in 12.1%,
// nokrichting in 10.6% — and, measured 2026-09-04 at the founder's request, **nokhoogte in 6.1%
// (4/66), three of the four alongside dakhelling**. So nokhoogte does NOT track dakhelling's
// 28.8%; the pitch is the lever, the ridge height is rare. The honest state is
// `mechanism: 'present'` + `failure: 'pdf'` — the instrument HAS a roof rule and PRYZM did not
// extract it. It is emphatically NOT F1 ("the plan has no roof mechanism"), and it is NOT "the law
// permits any roof". Both would be false statements about someone's land.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE PROHIBITION (master prompt §7.4 + §15 acceptance criterion)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `goothoogte 4 m` + `bouwhoogte 10 m` DOES NOT DETERMINE A ROOF. It is two horizontal limits:
// the eaves may not exceed 4 m and nothing may exceed 10 m. Infinitely many roofs satisfy both —
// a 40° gable, a 55° gable, a mansard, a hip, a shed, a flat roof at 4 m with a 10 m stair core.
// Drawing "the" triangle between them invents a legal shape, and §15 names the required guard:
// *"goothoogte + bouwhoogte + no roof rule → UNDERDETERMINED, never a triangle — hand-built
// fixture."* `__tests__/nlRoofDeterminacy.test.ts` is that fixture.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ THE BOUND TYPE IS AN EXPLICIT FIELD (founder review §5, 2026-09-04)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// *"Render bounds, AND say WHICH bound. `bouwhoogte` alone → a prism upper bound. `goothoogte`
// alone → an eaves constraint and NO top. `dakhelling` from text → closes it. Three distinct
// output shapes, and the user needs to know which one they are looking at."*
//
// So every arm now carries `boundType: NlRoofBoundType`. UNDERDETERMINED is not one shape, it is
// several, and a renderer that draws "the bounding prism" for an eaves-only parcel has drawn a top
// the plan never stated — L-616 on the vertical axis. The bound type is what stops that.
//
// PURE (C58 §1.9). Deterministic (C58 §1.1). No I/O, no THREE, no DOM.

import type { RuleState } from '@pryzm/schemas';

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Inputs
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The roof-form rules a plan may state. Every field is TRISTATE — `number`/`string` when the rule
 * was READ, `null` when the plan was read and is silent, `undefined` when we never looked.
 *
 * ⚠ `null` AND `undefined` ARE DIFFERENT AND THE DIFFERENCE IS THE F1 QUESTION. "The plan states
 * no dakhelling" (null, a fact about the instrument) and "we did not extract the plan text"
 * (undefined, a fact about us) must not collapse — collapsing them is exactly what
 * `RuleMechanismPresence` exists to prevent.
 */
export interface NlRoofFormRules {
    /** `dakhelling` — roof pitch in degrees, or a [min, max] range where the plan gives one. */
    readonly dakhelling_deg?: number | readonly [number, number] | null;
    /** `nokhoogte` — ridge height in metres above peil, where stated SEPARATELY from bouwhoogte. */
    readonly nokhoogte_m?: number | null;
    /** `nokrichting` — mandated ridge ORIENTATION, verbatim ("evenwijdig aan de voorgevelrooilijn"). */
    readonly nokrichting?: string | null;
    /** `dakvorm` / `kapvorm` — a mandated roof FORM, verbatim ("zadeldak", "mansardekap"). */
    readonly dakvorm?: string | null;
    /** The plan requires a `kap` (a pitched roof) — true, or false where a flat roof is allowed. */
    readonly kapVerplicht?: boolean | null;
}

export interface NlRoofInputs {
    /** `maximum goothoogte (m)` — the EAVES limit. */
    readonly goothoogte_m: number | null;
    /** `maximum bouwhoogte (m)` — the OVERALL limit. Never the ridge of a determined roof. */
    readonly bouwhoogte_m: number | null;
    readonly roofRules?: NlRoofFormRules;
    /** Was the plan TEXT actually read? Drives `mechanism` — see the tristate note above. */
    readonly planTextExamined: boolean;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Outputs
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The legal BOUNDS on the roof — the escape hatch. Both planes are heights above `peil`, and this
 * type deliberately carries no datum: pair it with `NlVerticalEnvelope` (`nlPeil.ts`) to place it.
 * A roof exists somewhere in the slab between them; WHICH roof is not determined.
 */
export interface NlRoofBounds {
    /** Below this, the roof has not started — the eaves plane. `null` when no goothoogte. */
    readonly eavesLimitM: number | null;
    /** Nothing may exceed this. `null` when no bouwhoogte. */
    readonly overallLimitM: number | null;
    /** Vertical room the roof may occupy: `overallLimitM - eavesLimitM`, when both are known. */
    readonly roofZoneThicknessM: number | null;
}

/**
 * ⭐ WHICH bound the consumer is looking at. A CLOSED enum, one member per distinct shape.
 *
 *   - `prism-upper-bound`        — an overall cap and NO eaves plane. The whole building, roof
 *                                  included, fits under one horizontal plane. Draw the prism, hatched.
 *   - `eaves-plane-no-top`       — an eaves limit and NO overall cap. ⚠ NOTHING BOUNDS THE RIDGE.
 *                                  A consumer must draw the eaves plane and NO top surface; drawing
 *                                  a prism here invents a cap the plan never stated (L-616).
 *   - `roof-zone-slab`           — both limits, no roof-form rule: the roof lies in the slab between
 *                                  the eaves plane and the cap. The §15 canonical case. Draw the
 *                                  slab; never a surface inside it.
 *   - `section-closed-by-pitch`  — an eaves plane AND a single dakhelling: the roof PLANE is fixed in
 *                                  section from the eaves; the ridge follows from the building depth,
 *                                  which the plan does not fix and PRYZM does not hold. The cap, if
 *                                  any, still bounds. Closed in section, open in plan.
 *   - `closed-by-ridge`          — an eaves plane AND a nokhoogte: both planes fixed. The FORM
 *                                  (gable / hip / mansard) is still open.
 *   - `determined`               — the DETERMINED arm: form + pitch-or-ridge. One roof.
 *   - `none`                     — no vertical limit recovered at all. Not "unbounded" (L-616).
 */
export type NlRoofBoundType =
    | 'prism-upper-bound'
    | 'eaves-plane-no-top'
    | 'roof-zone-slab'
    | 'section-closed-by-pitch'
    | 'closed-by-ridge'
    | 'determined'
    | 'none';

/** One line a user sees for each bound type. */
export function describeNlRoofBoundType(t: NlRoofBoundType): string {
    switch (t) {
        case 'prism-upper-bound':
            return 'an overall cap and no eaves plane — everything, roof included, fits under one horizontal plane';
        case 'eaves-plane-no-top':
            return 'an eaves limit and NO overall cap — the eaves plane is bounded, the ridge is not; no top may be drawn';
        case 'roof-zone-slab':
            return 'an eaves plane and an overall cap with no roof-form rule — the roof lies somewhere in the slab between them';
        case 'section-closed-by-pitch':
            return 'an eaves plane and a single roof pitch — the roof plane is fixed in section; the ridge follows from a building depth the plan does not fix';
        case 'closed-by-ridge':
            return 'an eaves plane and a ridge height — both planes fixed; the roof form (gable, hip, mansard) is still open';
        case 'determined':
            return 'a unique roof — form and pitch (or ridge height) both fixed by the plan';
        case 'none':
            return 'no vertical limit recovered — not "unlimited": other rules may bind, and nothing may be drawn from this state';
    }
}

export type NlRoofDeterminacy =
    /**
     * 🟢 A UNIQUE roof geometry is fixed by the plan. ⚠ Reaching this arm requires a form AND a
     * pitch (or a ridge height), because a `zadeldak` with no pitch is still a family of roofs.
     */
    | {
          readonly status: 'DETERMINED';
          readonly boundType: 'determined';
          readonly bounds: NlRoofBounds;
          readonly form: string;
          readonly pitchDeg: number | readonly [number, number] | null;
          readonly ridgeHeightM: number | null;
          readonly why: string;
      }
    /**
     * 🟡 §9 class **C** — bounded underdetermined. The main path. Honest bounds, no unique roof.
     * ⚠ A CONSUMER MUST NOT DRAW A ROOF SURFACE FROM THIS ARM. What it MAY draw is named by
     * `boundType` — and for `eaves-plane-no-top` that is an eaves plane only, no prism.
     */
    | {
          readonly status: 'UNDERDETERMINED';
          readonly boundType: Exclude<NlRoofBoundType, 'determined' | 'none'>;
          readonly bounds: NlRoofBounds;
          /** The roof-form facts that WERE recovered — may be several, and still not enough. */
          readonly partialRules: readonly string[];
          /** Why no unique roof follows. Quoted to the user; never a bare "unknown". */
          readonly why: string;
          /** Did the plan text get read at all? Drives F1-vs-extraction-failure downstream. */
          readonly planTextExamined: boolean;
      }
    /**
     * 🔵 The plan caps overall height and states NO eaves limit and NO roof-form rule. There is no
     * roof QUESTION to underdetermine: anything up to `bouwhoogte` is permitted, roof included.
     * ⚠ This is NOT "we don't know" — it is a legally grounded statement that the instrument does
     * not shape the roof. Phase 0's commonest case by far (bouwhoogte without goothoogte:
     * 24 vs 2 land, 24 vs 6 urban). ⚠ Reached ONLY when no roof-form rule was recovered either —
     * a cap plus a dakvorm is UNDERDETERMINED (`prism-upper-bound`), because the plan DOES shape
     * the roof and saying otherwise would be false.
     */
    | {
          readonly status: 'UNSHAPED_BY_PLAN';
          readonly boundType: 'prism-upper-bound';
          readonly bounds: NlRoofBounds;
          readonly why: string;
      }
    /**
     * 🔴 No vertical limit of any kind was recovered. ⚠ NOT "unbounded" (L-616): other rules still
     * bind, and drawing this as unlimited is the overstatement that precedent exists to stop.
     */
    | {
          readonly status: 'NO_VERTICAL_LIMIT_RECOVERED';
          readonly boundType: 'none';
          readonly bounds: NlRoofBounds;
          readonly why: string;
      };

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/**
 * Decide the roof determinacy for one parcel. Pure and total.
 *
 * ⚠ THE ONE BRANCH THAT MUST NEVER BE ADDED: there is deliberately no path from
 * `goothoogte + bouwhoogte` to a pitch. `atan((bouwhoogte - goothoogte) / (depth / 2))` is a
 * plausible-looking formula that computes the pitch of a roof the plan did not require, from a
 * building depth the plan did not fix. It would satisfy a naive renderer and state a falsehood.
 */
export function resolveNlRoofDeterminacy(input: NlRoofInputs): NlRoofDeterminacy {
    const goot = isNum(input.goothoogte_m) ? input.goothoogte_m : null;
    const bouw = isNum(input.bouwhoogte_m) ? input.bouwhoogte_m : null;
    const r = input.roofRules ?? {};

    const bounds: NlRoofBounds = {
        eavesLimitM: goot,
        overallLimitM: bouw,
        roofZoneThicknessM: goot !== null && bouw !== null && bouw > goot ? bouw - goot : null,
    };

    if (goot === null && bouw === null) {
        return {
            status: 'NO_VERTICAL_LIMIT_RECOVERED',
            boundType: 'none',
            bounds,
            why:
                'neither a maximum bouwhoogte nor a maximum goothoogte was recovered for this ' +
                'parcel. ⚠ This does NOT mean the height is unlimited — other rules (overlays, ' +
                'vergunningvrij limits, the kommuneplan-equivalent tier) may still bind, and no ' +
                'height should be drawn from this state.',
        };
    }

    // What roof-form facts did we actually get? Collected before any verdict so both the
    // DETERMINED and UNDERDETERMINED arms report the same evidence set.
    const partial: string[] = [];
    if (r.dakvorm) partial.push(`dakvorm: ${r.dakvorm}`);
    if (r.kapVerplicht === true) partial.push('een kap is verplicht (pitched roof required)');
    if (r.kapVerplicht === false) partial.push('a flat roof is expressly permitted');
    if (r.dakhelling_deg !== null && r.dakhelling_deg !== undefined) {
        partial.push(
            Array.isArray(r.dakhelling_deg)
                ? `dakhelling ${r.dakhelling_deg[0]}–${r.dakhelling_deg[1]}°`
                : `dakhelling ${String(r.dakhelling_deg)}°`,
        );
    }
    if (isNum(r.nokhoogte_m)) partial.push(`nokhoogte ${r.nokhoogte_m} m`);
    if (r.nokrichting) partial.push(`nokrichting: ${r.nokrichting}`);

    const hasForm = typeof r.dakvorm === 'string' && r.dakvorm.trim() !== '';
    const singlePitch = typeof r.dakhelling_deg === 'number' && Number.isFinite(r.dakhelling_deg);
    const hasRidge = isNum(r.nokhoogte_m);

    // ⚠ DETERMINED requires a FORM **and** a pitch-or-ridge. A form alone ("zadeldak") is a family
    // of roofs; a pitch alone does not say gable-vs-hip-vs-shed. Both, and only both, fix one.
    if (hasForm && (singlePitch || hasRidge)) {
        return {
            status: 'DETERMINED',
            boundType: 'determined',
            bounds,
            form: r.dakvorm!,
            pitchDeg: singlePitch ? (r.dakhelling_deg as number) : null,
            ridgeHeightM: hasRidge ? (r.nokhoogte_m as number) : null,
            why:
                `the plan fixes both the roof FORM (${r.dakvorm}) and ` +
                (singlePitch ? `a single dakhelling (${String(r.dakhelling_deg)}°)` : `a nokhoogte (${String(r.nokhoogte_m)} m)`) +
                ', which together determine a unique roof within the height limits',
        };
    }

    // ⚠ goothoogte is what makes the roof a QUESTION. Without an eaves limit AND without any
    // roof-form rule the plan has not distinguished wall from roof, so there is nothing to
    // underdetermine. But a cap PLUS a roof-form rule IS a roof question — the plan shapes the roof
    // and simply does not fix it — so that case falls through to UNDERDETERMINED below.
    if (goot === null && partial.length === 0) {
        return {
            status: 'UNSHAPED_BY_PLAN',
            boundType: 'prism-upper-bound',
            bounds,
            why:
                `the plan caps overall bouwhoogte at ${String(bouw)} m and states no goothoogte and no ` +
                'roof-form rule. It does not distinguish wall from roof, so any roof fitting under ' +
                'the overall cap is permitted — this is a legally grounded absence of a roof rule, ' +
                'not a gap in PRYZM’s reading.',
        };
    }

    // ── WHICH bound? The founder's three shapes, made explicit. ─────────────────────────────
    let boundType: Exclude<NlRoofBoundType, 'determined' | 'none'>;
    if (goot === null) {
        boundType = 'prism-upper-bound'; // a cap plus partial roof rules, no eaves plane
    } else if (hasRidge) {
        boundType = 'closed-by-ridge';
    } else if (singlePitch) {
        boundType = 'section-closed-by-pitch';
    } else if (bouw === null) {
        boundType = 'eaves-plane-no-top';
    } else {
        boundType = 'roof-zone-slab';
    }

    return {
        status: 'UNDERDETERMINED',
        boundType,
        bounds,
        partialRules: Object.freeze(partial),
        planTextExamined: input.planTextExamined,
        why:
            (goot !== null
                ? `maximum goothoogte ${goot} m and maximum bouwhoogte ${bouw === null ? '(none)' : bouw + ' m'} ` +
                  'are TWO LIMITS, not a roof plane. '
                : `maximum bouwhoogte ${String(bouw)} m is a cap, not a roof plane. `) +
            (partial.length > 0
                ? `The recovered roof-form rules (${partial.join('; ')}) narrow the family but do not fix a unique roof. `
                : 'No roof-form rule (dakhelling / dakvorm / nokrichting / kap) was recovered. ') +
            (bounds.roofZoneThicknessM !== null
                ? `The roof must lie within the ${bounds.roofZoneThicknessM} m between the eaves plane and the overall cap. `
                : '') +
            `Bound type: ${boundType} — ${describeNlRoofBoundType(boundType)}. ` +
            '⚠ No unique roof geometry follows, and none may be drawn.',
    };
}

/**
 * Project onto the shared `RuleState` vocabulary. Parameter **C6 — shaping constraints**, which is
 * where a roof rule belongs (C2 is the height NUMBER; the roof is the SHAPE the height bounds).
 *
 * THE MAPPING, and why each arm lands where it does:
 *   DETERMINED                  → `resolved`, reachability `extractable` (it came out of prose)
 *   UNDERDETERMINED             → `unrecovered`, failure `pdf`, and `mechanism` is the interesting
 *                                 field: `'present'` when the plan text WAS read (the rule is in
 *                                 there, we did not get it out) and `'unknown'` when it was not.
 *                                 ⚠ NEVER `'absent'` — asserting F1 ("this plan has no roof
 *                                 mechanism") from a failed extraction is a false statement about
 *                                 the instrument, and the plan-text census (dakhelling in 28.8% of
 *                                 plans) says it would frequently be a WRONG one.
 *   UNSHAPED_BY_PLAN            → `refused` / `no-limit-stated`. ⚠ legallyGrounded TRUE — this is a
 *                                 statement about the LAW. And per `RuleAbsenceBasis`'s own
 *                                 warning, `no-limit-stated` is NOT "unbounded": the bouwhoogte
 *                                 cap still binds, which is why `bounds` travels alongside.
 *   NO_VERTICAL_LIMIT_RECOVERED → `unrecovered` / `missing-source`, mechanism `unknown`.
 */
export function nlRoofToRuleState(d: NlRoofDeterminacy, ref: RuleState['ref']): RuleState {
    switch (d.status) {
        case 'DETERMINED':
            return {
                rule: 'C6',
                status: 'resolved',
                reachability: 'extractable',
                value: d.why,
                unit: null,
                datum: null,
                provenance: 'pipeline-extracted',
                ref,
            };
        case 'UNDERDETERMINED':
            return {
                rule: 'C6',
                status: 'unrecovered',
                partial: null,
                reachability: 'extractable',
                failure: 'pdf',
                mechanism: d.planTextExamined ? 'present' : 'unknown',
                stoppedAt: d.why,
                ref,
            };
        case 'UNSHAPED_BY_PLAN':
            return {
                rule: 'C6',
                status: 'refused',
                reachability: 'source-complete',
                basis: 'no-limit-stated',
                reason: d.why,
                ref,
            };
        case 'NO_VERTICAL_LIMIT_RECOVERED':
            return {
                rule: 'C6',
                status: 'unrecovered',
                partial: null,
                reachability: 'extractable',
                failure: 'missing-source',
                mechanism: 'unknown',
                stoppedAt: d.why,
                ref,
            };
    }
}
