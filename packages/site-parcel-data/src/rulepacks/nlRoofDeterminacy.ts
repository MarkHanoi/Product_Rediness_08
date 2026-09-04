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
// nokrichting in 10.6%. So the honest state is `mechanism: 'present'` + `failure: 'pdf'` — the
// instrument HAS a roof rule and PRYZM did not extract it. It is emphatically NOT F1 ("the plan
// has no roof mechanism"), and it is NOT "the law permits any roof". Both of those would be false
// statements about someone's land, and they are the two failure directions this module blocks.
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
// WHAT IS STILL TRUE AND USEFUL, so the refusal is not a dead end (L-942 — a refusing gate needs
// its escape hatch): the two limits DO bound the roof, tightly and legally. This module emits
// those bounds as `NlRoofBounds` — the volume between the goot plane and the bouwhoogte plane is
// where the roof must live. A massing study may draw that PRISM (honest, an upper bound, hatched)
// and must not draw a roof surface inside it. `NL-ENVELOPE-MASTER-PROMPT.md` §9 class **C**:
// bounded underdetermined — honest bounds, no unique geometry.
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

export type NlRoofDeterminacy =
    /**
     * 🟢 A UNIQUE roof geometry is fixed by the plan. ⚠ Reaching this arm requires a form AND a
     * pitch (or a ridge height), because a `zadeldak` with no pitch is still a family of roofs.
     */
    | {
          readonly status: 'DETERMINED';
          readonly bounds: NlRoofBounds;
          readonly form: string;
          readonly pitchDeg: number | readonly [number, number] | null;
          readonly ridgeHeightM: number | null;
          readonly why: string;
      }
    /**
     * 🟡 §9 class **C** — bounded underdetermined. The main path. Honest bounds, no unique roof.
     * ⚠ A CONSUMER MUST NOT DRAW A ROOF SURFACE FROM THIS ARM. It may draw the bounding prism.
     */
    | {
          readonly status: 'UNDERDETERMINED';
          readonly bounds: NlRoofBounds;
          /** The roof-form facts that WERE recovered — may be several, and still not enough. */
          readonly partialRules: readonly string[];
          /** Why no unique roof follows. Quoted to the user; never a bare "unknown". */
          readonly why: string;
          /** Did the plan text get read at all? Drives F1-vs-extraction-failure downstream. */
          readonly planTextExamined: boolean;
      }
    /**
     * 🔵 The plan caps overall height and states NO eaves limit and no roof form. There is no roof
     * QUESTION to underdetermine: anything up to `bouwhoogte` is permitted, roof included.
     * ⚠ This is NOT "we don't know" — it is a legally grounded statement that the instrument does
     * not shape the roof. Phase 0's commonest case by far (bouwhoogte without goothoogte:
     * 24 vs 2 land, 24 vs 6 urban).
     */
    | {
          readonly status: 'UNSHAPED_BY_PLAN';
          readonly bounds: NlRoofBounds;
          readonly why: string;
      }
    /**
     * 🔴 No vertical limit of any kind was recovered. ⚠ NOT "unbounded" (L-616): other rules still
     * bind, and drawing this as unlimited is the overstatement that precedent exists to stop.
     */
    | {
          readonly status: 'NO_VERTICAL_LIMIT_RECOVERED';
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

    // ⚠ goothoogte is what makes the roof a QUESTION. Without an eaves limit the plan has not
    // distinguished wall from roof, so there is nothing to underdetermine.
    if (goot === null) {
        return {
            status: 'UNSHAPED_BY_PLAN',
            bounds,
            why:
                `the plan caps overall bouwhoogte at ${String(bouw)} m and states no goothoogte and no ` +
                'roof-form rule. It does not distinguish wall from roof, so any roof fitting under ' +
                'the overall cap is permitted — this is a legally grounded absence of a roof rule, ' +
                'not a gap in PRYZM’s reading.',
        };
    }

    return {
        status: 'UNDERDETERMINED',
        bounds,
        partialRules: Object.freeze(partial),
        planTextExamined: input.planTextExamined,
        why:
            `maximum goothoogte ${goot} m and maximum bouwhoogte ${bouw === null ? '(none)' : bouw + ' m'} ` +
            'are TWO LIMITS, not a roof plane. ' +
            (partial.length > 0
                ? `The recovered roof-form rules (${partial.join('; ')}) narrow the family but do not fix a unique roof. `
                : 'No roof-form rule (dakhelling / dakvorm / nokrichting / kap) was recovered. ') +
            (bounds.roofZoneThicknessM !== null
                ? `The roof must lie within the ${bounds.roofZoneThicknessM} m between the eaves plane and the overall cap. `
                : '') +
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
                reachability: 'extractable',
                failure: 'missing-source',
                mechanism: 'unknown',
                stoppedAt: d.why,
                ref,
            };
    }
}
