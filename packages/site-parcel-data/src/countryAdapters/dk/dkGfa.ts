// LANE DK (deliverable 2, consumer half) · THE DENOMINATOR BRANCH — the evaluator-side
// consumer of a DK `bebygpct` rule. Given the winning rule (precedence already resolved
// engine-side via R1 rank) and the parcel area, it either computes the RIGHT GFA or
// REFUSES NAMING THE BASIS. There is NO code path that multiplies a non-parcel-scoped
// percentage by the parcel area — the wrong-number path (the Aarhus af=1 trap: 180 % of
// the plan area as a WHOLE read as 180 % of one parcel) is structurally DEAD.
//
// WHY THIS LIVES IN THE ADAPTER: mapping `dk-bygberegnaf` codes onto computation
// semantics is COUNTRY knowledge (E4 control 5; L-664: adapters map, no table at L0).
// The generic evaluator resolves WHICH rule wins; what a Danish denominator code MEANS
// for arithmetic is decided here, through the same L-449 scope machinery the C58 path
// uses (`dkDensityScopeFromBygberegnaf` — one mapping, two consumers, no drift):
//
//   code 3 ("Den enkelte grund") / 4 ("Det enkelte jordstykke") → 'parcel'
//       → GFA = pct/100 × parcelArea (the Noerrebro af=4 case — valid).
//   code 1 ("Omraadet som helhed")  → 'planningArea' → REFUSE: the floor-area budget is
//       shared over the plan area; PRYZM holds no plan-area denominator, and a per-parcel
//       multiply is WRONG (lane 2 §DK-2, live Aarhus ramme 010109CY).
//   code 2 ("Den enkelte ejendom")  → 'property' → REFUSE: the ejendom may span several
//       matrikler; the parcel is not the denominator.
//   valueBasis ABSENT               → REFUSE: denominator not served — UNKNOWN is never
//       silently read as 'parcel' (E4 control 9).
//   value null (tier 6)             → REFUSE: UNKNOWN percentage.
//
// PURE, deterministic, never throws.

import { DkBygberegnafCodeSchema, dkBygberegnafRow, type SiteIntelRule } from '@pryzm/schemas';
import { dkDensityScopeFromBygberegnaf } from '../../rulepacks/dkPlandataEnvelope.js';
import { DK_BYGBEREGNAF_SCHEME } from './dkRuleMapper.js';

/** Why a GFA could not be computed from this rule — every reason NAMES its basis. */
export type DkGfaRefusalReason =
    /** valueBasis code 1 — the % is of the plan area as a whole (the Aarhus af=1 trap). */
    | 'basis-planning-area'
    /** valueBasis code 2 — the % is of the ejendom (may span several parcels). */
    | 'basis-property'
    /** No valueBasis on the rule — the register did not serve `bebygpctaf`. */
    | 'basis-not-served'
    /** valueBasis carries a scheme this consumer does not own — refuse, never guess. */
    | 'basis-foreign-scheme'
    /** The rule's value is null (tier-6 UNKNOWN percentage). */
    | 'value-unknown'
    /** The rule's value is not a positive finite number. */
    | 'value-not-numeric'
    /** parcelAreaM2 is not a positive finite number. */
    | 'parcel-area-invalid';

export type DkGfaOutcome =
    | {
          readonly kind: 'computed';
          /** GFA in m² = (bebygpct/100) × parcelAreaM2 — valid ONLY at parcel scope. */
          readonly gfaM2: number;
          readonly bebygpct: number;
          readonly parcelAreaM2: number;
          /** The served denominator code ('3' | '4') and its verbatim codelist row. */
          readonly basisCode: string;
          readonly basisDa: string;
          readonly basisEn: string;
          readonly detail: string;
      }
    | {
          readonly kind: 'refused';
          readonly reason: DkGfaRefusalReason;
          /** The served code where one exists (refusals NAME the basis), else null. */
          readonly basisCode: string | null;
          readonly basisDa: string | null;
          readonly detail: string;
      };

/**
 * Compute the per-parcel GFA a DK `bebygpct` rule permits — or refuse naming the basis.
 * The ONLY arithmetic branch requires `valueBasis` present, scheme `dk-bygberegnaf`, and
 * a code whose L-449 scope is 'parcel' (3/4). Everything else refuses; there is no
 * override parameter and no default — the wrong-number path cannot be reached.
 */
export function deriveDkGfaFromBebygpctRule(
    rule: SiteIntelRule,
    parcelAreaM2: number,
): DkGfaOutcome {
    const p = rule.provenance;
    const vb = p.valueBasis;

    if (vb === undefined) {
        return {
            kind: 'refused',
            reason: 'basis-not-served',
            basisCode: null,
            basisDa: null,
            detail:
                `rule ${rule.id}: the register served no bebygpctaf denominator code — the ` +
                'basis of this percentage is UNKNOWN, and UNKNOWN is never read as ' +
                "'parcel' (C63 / L-449 §DK-DENOMINATOR-BRANCH; E4 control 9)",
        };
    }
    if (vb.scheme !== DK_BYGBEREGNAF_SCHEME) {
        return {
            kind: 'refused',
            reason: 'basis-foreign-scheme',
            basisCode: vb.code,
            basisDa: null,
            detail:
                `rule ${rule.id}: valueBasis scheme "${vb.scheme}" is not ` +
                `"${DK_BYGBEREGNAF_SCHEME}" — this consumer refuses semantics it does not own`,
        };
    }
    const af = DkBygberegnafCodeSchema.safeParse(Number.parseInt(vb.code, 10));
    if (!af.success) {
        return {
            kind: 'refused',
            reason: 'basis-foreign-scheme',
            basisCode: vb.code,
            basisDa: null,
            detail:
                `rule ${rule.id}: valueBasis code "${vb.code}" is outside the state ` +
                'bygberegnaf codelist {1,2,3,4} — refused, never absorbed',
        };
    }
    const row = dkBygberegnafRow(af.data);
    const scope = dkDensityScopeFromBygberegnaf(af.data);

    if (scope !== 'parcel') {
        return {
            kind: 'refused',
            reason: scope === 'planningArea' ? 'basis-planning-area' : 'basis-property',
            basisCode: String(af.data),
            basisDa: row.da,
            detail:
                `rule ${rule.id}: bebygpct ${String(p.value)} % beregnes af: ${row.da} ` +
                `(bebygpctaf=${af.data} — ${row.en}) — NOT the individual parcel; a ` +
                'per-parcel multiply would state a wrong GFA (lane 2 §DK-2), so the ' +
                'computation is refused naming the basis',
        };
    }
    if (p.value === null) {
        return {
            kind: 'refused',
            reason: 'value-unknown',
            basisCode: String(af.data),
            basisDa: row.da,
            detail: `rule ${rule.id}: bebygpct is tier-6 UNKNOWN — no number to scale`,
        };
    }
    if (typeof p.value !== 'number' || !Number.isFinite(p.value) || p.value <= 0) {
        return {
            kind: 'refused',
            reason: 'value-not-numeric',
            basisCode: String(af.data),
            basisDa: row.da,
            detail: `rule ${rule.id}: bebygpct value ${JSON.stringify(p.value)} is not a positive number`,
        };
    }
    if (!Number.isFinite(parcelAreaM2) || parcelAreaM2 <= 0) {
        return {
            kind: 'refused',
            reason: 'parcel-area-invalid',
            basisCode: String(af.data),
            basisDa: row.da,
            detail: `rule ${rule.id}: parcelAreaM2 ${String(parcelAreaM2)} is not a positive number`,
        };
    }
    const gfaM2 = (p.value / 100) * parcelAreaM2;
    return {
        kind: 'computed',
        gfaM2,
        bebygpct: p.value,
        parcelAreaM2,
        basisCode: String(af.data),
        basisDa: row.da,
        basisEn: row.en,
        detail:
            `GFA = ${p.value} % × ${parcelAreaM2} m² = ${gfaM2} m² — valid because ` +
            `bebygpctaf=${af.data} (${row.da} — ${row.en}) is parcel-scoped (L-449)`,
    };
}
