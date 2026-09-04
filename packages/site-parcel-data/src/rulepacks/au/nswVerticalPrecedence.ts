// §NSW-PRECEDENCE — which of up to ten competing vertical controls governs, and WHY.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE PRODUCT. Not a downloader.
// ══════════════════════════════════════════════════════════════════════════════════════════════
// NSW is the most machine-readable envelope jurisdiction PRYZM has met — acquisition is a solved
// problem and a moat for nobody. The hard part is that a single Sydney parcel can be intersected
// by the principal HOB, an Alternative HOB, an Incentive HOB, a Building Height Allowance, a
// Building Height Plane, a Floor Height Restriction, a Sun Plane Protection area and an Airport
// Buffer — **different legal instruments with different triggers, NOT alternatives to minimise
// over** (build prompt §5).
//
// ⛔⛔ NEVER TAKE THE MINIMUM. Which control governs is a LEGAL question answered by the LEP
// clause, not an arithmetic one. *Tightest-number-wins is a guess wearing a plausible face.*
//
// The measured proof, from a uniform random sample of 2,000 NSW parcels (PHASE0-REPORT §M3.4):
//
//     152//DP877246   HOB 8.5 m  +  Building Height Allowance 2.1
//
// `min(8.5, 2.1) = 2.1 m`. That is a garage on a site where an 8.5 m house is permitted, produced
// confidently, with a citation attached. The 2.1 is not a competing height AT ALL — it is an
// additive allowance granted under condition. And:
//
//     5//DP240402     HOB 12 m   +  Alternative HOB 25 m
//                     FSR        +  Alt FSR Affordable 2.5  +  Alt FSR Employment 3.5
//
// `max()` is worse than `min()` here: reporting 25 m / FSR 3.5 invents an entitlement worth
// roughly double the site's actual yield, on a site where the uplift may never be granted.
// *"A conditional uplift presented as an entitlement is the worst output this engine can produce."*
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// HOW OFTEN THIS FIRES — measured, so the engine is sized honestly (PHASE0-REPORT §M3)
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   Uniform random (n=2,000):  >1 vertical control on **0.30%** of parcels.
//   Urban-weighted (n=600):    **9.3%** overall, and **68.3% of Sydney CBD parcels**.
//   And **39.2% of NSW parcels carry NO vertical control at all** — 130× more common than a
//   precedence conflict. The dominant path through this engine is the F1-vs-F2 decision, not
//   precedence. Both are implemented; only one is rare.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE CONSTRAINT THAT SHAPES THE WHOLE DESIGN
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Build prompt §5 step 2 says "resolve each control's `LEGIS_REF_CLAUSE`". **That field is 0.0%
// populated on 10 of the 12 vertical overlay layers** (PHASE0-REPORT §M1.3). The designed input
// does not exist. Roles therefore come from `nswClauseRegistry.ts` — a static, signed,
// hand-extracted mapping — and a control with no registry entry is `UNRESOLVED`: carried, cited,
// and **not applied**. That is not a limitation to be worked around; it is the correct answer to
// "which governs?" when nobody has established which governs.
//
// Output vocabulary is the SHARED one — `packages/schemas/src/site/zoning/RuleState.ts`, which
// already reconciles this brief's A/B/C/D/E/F1/F2 letters (its `ANSWER_DETERMINACY_RECONCILIATION`
// names `NSW-ENVELOPE-BUILD-PROMPT.md` §11 explicitly). ⛔ No third taxonomy is minted here.
//
// P5-adjacent purity: pure total functions over already-fetched features. No I/O, no clock, no RNG
// — the same parcel and the same data vintage produce a byte-identical result (build prompt §13).
//
// Contracts: C58 §1.2/§1.4 (never overstate, refuse rather than fabricate), C62 (authority),
// C63 (denominator honesty), C74 §0, C75 (provenance). ADR-0377 (height datum).

import type { RuleSourceRef, RuleState } from '@pryzm/schemas';

import {
    isNswAdditiveAllowance,
    isNswAbsoluteLevelLayer,
    isNswInclinedPlaneLayer,
    nswLayerName,
    NSW_LAYER,
    NSW_SERVICE,
} from './nswPortalLayers.js';
import {
    nswLookupRuling,
    type NswControlRuling,
    type NswLegalRole,
} from './nswClauseRegistry.js';
import {
    areHeightsComparable,
    describeNswHeight,
    isNumericHeight,
    nswAbsoluteLevelFromLayClass,
    parseNswHeight,
    NSW_RELATIVE_DATUM,
    type NswHeightValue,
} from './nswHeightValue.js';
import { nswNumber, nswText, type NswAttributeBag } from './nswPortalAttributes.js';
import {
    describeNswAxisExclusion,
    isNswDatumSubstitution,
    isNswUnevaluatedTopConstraint,
    nswPrincipalHobSemantics,
    nswQuantitySemantics,
    type NswQuantitySemantics,
} from './nswLayName.js';
import {
    nswInstrumentClass,
    nswResolveInstrumentContest,
    type NswInstrumentClass,
} from './nswInstrumentPrecedence.js';
import {
    isNswSeppReplica,
    nswBandedValue,
    nswReducedLevelConflict,
    nswSeppLayer,
} from './nswSeppLayers.js';
import {
    nswMayContributeValue,
    nswMayPublish,
    nswResolveCitation,
    nswRuleSourceRef,
    type NswCitation,
} from './nswCitationState.js';

/** One vertical control found intersecting the parcel, after typing and role resolution. */
export interface NswVerticalControl {
    readonly layerId: number;
    readonly layerName: string;
    /** `EPI_NAME` — the instrument that drew this polygon. */
    readonly instrument: string | null;
    readonly lga: string | null;
    /** `LAY_CLASS` — where NSW actually keeps the control value. */
    readonly layClass: string | null;
    /**
     * ⭐ WHAT the number measures, read from the 100%-populated `LAY_NAME` (`nswLayName.ts`).
     * ⛔ `quantity.constrainsEnvelopeTop === false` means the control never enters height
     * precedence — not as a base, not as a cap, not as an uplift. It is on a different axis.
     */
    readonly quantity: NswQuantitySemantics;
    /** The typed height. Never a bare number — see `nswHeightValue.ts`. */
    readonly height: NswHeightValue;
    readonly role: NswLegalRole;
    /** For CONDITIONAL controls: the condition, in the instrument's words. */
    readonly condition: string | null;
    /** Clause citation: the per-feature `LEGIS_REF_CLAUSE` if served, else the registry's. */
    readonly clause: string | null;
    /**
     * ⭐ WHERE the clause came from, as a closed enum — `nswCitationState.ts` ARM B.
     * ⛔ A control whose `citation.state` is `'absent'` may NEVER contribute a number. This field
     * is what makes that property checkable rather than emergent.
     */
    readonly citation: NswCitation;
    /** `true` when the value is an increment to add, not a maximum to compare. */
    readonly additive: boolean;
    /** `true` when the control is an inclined plane, not a flat cap. */
    readonly inclinedPlane: boolean;
    /**
     * A named disagreement between two independent readings of the same fact — today, the
     * per-feature `LAY_NAME` datum against the retained layer-id list. `null` when they agree.
     *
     * ⚠ SURFACED, NEVER SILENTLY RESOLVED. Two sources disagreeing about whether a number is
     * absolute or above-ground is the fifty-metre error announcing itself in advance; picking a
     * winner in code would discard the warning. §PROBE-CAN-BE-WRONG-THREE-WAYS.
     */
    readonly schemaSurprise: string | null;
    readonly ruling: NswControlRuling | null;
    /**
     * Which SERVICE the layer id belongs to. `null` = the Principal / Local Provisions family.
     * ⛔ SEPP layer numbering is independent; without this the registry can apply a SEPP clause to
     * a Local Provisions layer that happens to share an integer.
     */
    readonly service: 'SEPP' | null;
    /**
     * ⭐ `EPI_TYPE`, read. THE FIELD THAT MAKES THE SEPP ACCEPTANCE CRITERION SATISFIABLE.
     * Principal/14 carries 743 SEPP-drawn polygons alongside 40,221 LEP ones; before this field
     * was read, a SEPP height and an LEP height were indistinguishable rows of one layer.
     */
    readonly instrumentClass: NswInstrumentClass;
    /**
     * `true` when this control SUBSTITUTES the datum the base height is measured from
     * (Byron LEP 2014 cl 4.3A). ⛔ Neither a cap nor an uplift; see `nswLayName.ts`.
     */
    readonly substitutesDatum: boolean;
    /**
     * ⚠ `true` when this SEPP-service control was MEASURED to duplicate what Principal/14 already
     * serves at the same point. Carried rather than filtered at the door, so a caller that fetched
     * it anyway is told WHY it is being ignored instead of watching it vanish.
     */
    readonly seppReplica: boolean;
}

/** An uplift that MIGHT apply. Reported with its condition and NEVER folded into `baseHeight`. */
export interface NswConditionalUplift {
    readonly control: NswVerticalControl;
    /** The condition that must be met, or `null` when the role itself is unresolved. */
    readonly condition: string | null;
    /** Why this was not applied. Always populated — an unapplied uplift owes the reader a reason. */
    readonly notAppliedBecause: string;
}

/** A cap applied on top of whatever governs, by intersection. Never raises anything. */
export interface NswHardCap {
    readonly control: NswVerticalControl;
    /** `true` when the cap was actually intersected into the answer. */
    readonly applied: boolean;
    /** When `applied` is false, why not — e.g. a datum mismatch needing terrain. */
    readonly notAppliedBecause: string | null;
}

export interface NswVerticalResolution {
    /** The single governing base height, cited. `null` when none could be established. */
    readonly baseHeight: NswHeightValue | null;
    readonly baseControl: NswVerticalControl | null;
    /** Listed, cited, **NOT APPLIED**. */
    readonly conditionalUplifts: readonly NswConditionalUplift[];
    /** Caps; `applied` says whether each actually constrained the answer. */
    readonly hardCaps: readonly NswHardCap[];
    /** Every control considered, including those that resolved to nothing. */
    readonly allControls: readonly NswVerticalControl[];
    /** The shared per-rule state for C2 (maximum height). The published answer. */
    readonly state: RuleState;
    /**
     * `true` when the envelope cannot be placed vertically because an absolute cap must be
     * compared against a relative base and no terrain was supplied (build prompt §7).
     */
    readonly verticallyUnplaced: boolean;
    /**
     * ⭐ CONTROLS PRESENT, UNCITED, AND THEREFORE NOT APPLIED — the ARM B residue.
     *
     * Measured: `LEGIS_REF_CLAUSE` is 0.0% populated on 10 of the 12 vertical overlay layers
     * (PHASE0-REPORT §M1.3), so on a parcel carrying one of them this list is non-empty and there
     * is nothing PRYZM can do about it from the data.
     */
    readonly uncitedConstraints: readonly NswVerticalControl[];
    /**
     * ⚠⚠ THE FIELD A CONSUMER MUST NOT IGNORE. `true` when at least one constraint that could
     * only ever REDUCE this envelope was seen and not applied, because it carries no clause.
     *
     * **The reported height is then an UPPER BOUND, not a determination** — build prompt §11
     * status **C** (bounded, geometrically underdetermined), not status A.
     *
     * ⛔ L-616 IS THE REASON THIS FLAG EXISTS RATHER THAN BEING LEFT IMPLICIT. An UNKNOWN
     * constraint rendered as absent is an OVERSTATEMENT on real land — the standing precedent in
     * this repository, and the exact error the uncited-cap path would otherwise commit. Refusing
     * to apply an uncited cap is correct (we cannot assert a limit we cannot cite); presenting the
     * result as a settled maximum is NOT. Both halves are required, which is why the engine
     * reports the number AND this flag rather than choosing between them.
     */
    readonly envelopeIsUpperBound: boolean;
    /**
     * `true` when every control that contributed to the answer is publishable — served clause or
     * a SIGNED registry ruling (build prompt §1.4: status A is unreachable without a named
     * signer). `false` means development-only: correct to compute, not yet correct to ship.
     */
    readonly publishable: boolean;
    /**
     * ⭐ Controls that SUBSTITUTE the measurement datum, reported separately because they are
     * neither caps nor uplifts and belong in neither list. Non-empty means the base height's
     * ORIGIN is in question — see `nswLayName.ts`'s round-4 correction box.
     */
    readonly datumControls: readonly NswVerticalControl[];
    /**
     * The instrument-precedence decision, when two competing base controls had to be ranked.
     * `null` when there was no contest. Carries the verbatim clause that decided it.
     */
    readonly instrumentContest: string | null;
    /** Human-readable trace of the decision, for the explain-why panel. */
    readonly explanation: readonly string[];
}

/** What the caller feeds in: one raw feature per intersecting control. */
export interface NswRawControlHit {
    readonly layerId: number;
    readonly attributes: NswAttributeBag;
    /**
     * Which ePlanning service this layer id came from. Omit (or `null`) for the Principal and
     * Local Provisions services, whose ids share one namespace. Pass `'SEPP'` for a hit from
     * `Planning_Portal_SEPP`.
     *
     * ⛔ NOT OPTIONAL BECAUSE IT IS UNIMPORTANT — optional because omitting it is the correct
     * answer for the two services that have always been read here, and adding a third namespace
     * must not silently reinterpret the existing two.
     */
    readonly service?: 'SEPP' | null;
}

/** Optional context that changes what can be decided. */
export interface NswPrecedenceContext {
    /**
     * Ground elevation at the parcel, m AHD. Supplying it lets absolute and relative controls be
     * compared. ⛔ Omit it rather than guess — a guessed ground level is the fifty-metre error.
     */
    readonly groundLevel_m_AHD?: number | null;
    /**
     * `true` when the parcel is land where a height control correctly does not apply — an RE1
     * reservation, a waterway, a rail corridor. Drives **F2** (a correct null) instead of **F1**
     * (a gap). ⛔ Only set this from a positive land-class reading; defaulting it to `true` would
     * relabel every gap as a correct null and corrupt every coverage figure PRYZM publishes.
     */
    readonly landHasNoHeightSubject?: boolean;
}

const RULE_C2 = 'C2' as const; // EnvelopeParameterKey: maximum height.

/** The scalar of a numeric height, whichever datum it is in. ⛔ Only ever compared LIKE-FOR-LIKE. */
function heightMagnitude(h: NswHeightValue): number {
    return h.kind === 'absolute_level' ? h.value_m_AHD : h.kind === 'height_above_ground' ? h.value_m : Number.NaN;
}

/** Stable de-duplication by identity, preserving first-seen order so output stays deterministic. */
function dedupeControls(list: readonly NswVerticalControl[]): NswVerticalControl[] {
    const out: NswVerticalControl[] = [];
    for (const c of list) if (!out.includes(c)) out.push(c);
    return out;
}

/**
 * ⭐ THE EXACT L-616 QUESTION, AND IT IS NARROWER THAN "WAS SOMETHING LEFT UNAPPLIED".
 *
 * Could this unapplied control, **under any legal role still available to it**, produce a LOWER
 * answer than the one being reported? Only then is the reported height an upper bound rather than
 * a determination.
 *
 * ⚠ THE DISTINCTION IS WORTH THE FUNCTION, because the two obvious rules are both wrong:
 *   - "flag nothing unapplied" hides real caps — the L-616 overstatement;
 *   - "flag everything unapplied" marks parcel `5//DP240402` as underdetermined on the strength of
 *     an Alternative HOB of **25 m against a base of 12 m**. Whatever role that control turns out
 *     to have — override, alternative, even a cap — no reading of it yields less than 12. Calling
 *     that envelope unsettled is a false alarm, and a flag that cries wolf on the common case
 *     stops being read on the rare one.
 *
 * So: not comparable (different datums, no number, unknown meaning) ⇒ **could lower** — we cannot
 * rule it out and must not pretend to. Comparable and strictly below the base ⇒ could lower.
 * Comparable and at or above the base ⇒ cannot lower, whatever its role.
 */
function couldLowerTheAnswer(c: NswVerticalControl, base: NswVerticalControl | null): boolean {
    if (base === null) return true;
    if (!areHeightsComparable(base.height, c.height)) return true;
    return heightMagnitude(c.height) < heightMagnitude(base.height);
}

/**
 * The E1a legal address for an emitted state — `nswCitationState.ts` ARM A.
 *
 * ⚠ EVERY ARM OF `RuleState` CARRIES ONE, INCLUDING THE REFUSALS. A refusal with no citation is
 * an unsourced claim about the law (C58 §1.3), so the no-controls path below still names the
 * service and layer it read and found empty — "we looked HERE and there was nothing" is a
 * citation, and it is the one a reader needs in order to check us.
 */
function ref(control: NswVerticalControl | null): RuleSourceRef {
    return nswRuleSourceRef({
        layerId: control?.layerId ?? NSW_LAYER.HEIGHT_OF_BUILDINGS,
        service: NSW_SERVICE.PRINCIPAL,
        instrument: control?.instrument ?? null,
        objectId: control?.layClass ?? null,
        citation: control?.citation ?? null,
    });
}

/** Type + classify ONE raw hit. Pure; never throws. */
export function nswReadControl(hit: NswRawControlHit): NswVerticalControl {
    const a = hit.attributes;
    const service = hit.service ?? null;
    const instrument = nswText(a, 'EPI_NAME');
    const lga = nswText(a, 'LGA_NAME');
    const layClass = nswText(a, 'LAY_CLASS');
    const servedClause = nswText(a, 'LEGIS_REF_CLAUSE');
    const instrumentClass = nswInstrumentClass(nswText(a, 'EPI_TYPE'));

    // ── Height typing, driven by the SERVED semantics rather than by the layer id. ────────────
    // ⛔ The old shape of this block assumed `'m'` for every overlay and consulted a hand-written
    // layer-id list for the exceptions. That is exactly how layer 429's minimum AHD levels were
    // read as heights above ground: the list was wrong, and the default swallowed the difference.
    // `LAY_NAME` is 100% populated on 996/996 vertical overlay features and states the datum.
    // ⚠ The two services do not share a schema: `LAY_NAME` exists on Local Provisions / SEPP and
    // NOT on Principal/14, whose semantics come from its own `UNITS` domain instead. Asking the
    // wrong service for the wrong field returns `undefined` and classifies the state's principal
    // height control as off-axis — silently, and in the safe-looking direction. See nswLayName.ts.
    // ⚠ THE PRINCIPAL SCHEMA IS KEYED ON THE LAYER ID **AND THE SERVICE**. `SEPP/14` is not the
    // Height of Buildings Map; it is whatever the SEPP service numbers 14. Before `service` existed
    // this test was `hit.layerId === 14` alone, which is correct for two services and wrong for the
    // third — the exact shape of the alias defect this pack has already paid for twice.
    const isPrincipalHob = service === null && hit.layerId === NSW_LAYER.HEIGHT_OF_BUILDINGS;
    // The SEPP service's LEGACY-schema layers carry MAX_B_H + UNITS and no LAY_NAME at all
    // (measured: null on 100% of features across layers 44/118/134/614/631/648/684). Reading them
    // through the LAY_NAME vocabulary returns UNKNOWN and refuses a control the service states
    // plainly, so they take the UNITS path instead.
    const seppFacts = service === 'SEPP' ? nswSeppLayer(hit.layerId) : null;
    const isSeppLegacyHob = seppFacts?.schema === 'legacy-maxbh';
    const quantity =
        isPrincipalHob || isSeppLegacyHob
            ? nswPrincipalHobSemantics(nswText(a, 'UNITS'))
            : nswQuantitySemantics(nswText(a, 'LAY_NAME'));

    // ⛔ THE REDUCED-LEVEL DATUM CONFLICT, CHECKED BEFORE ANY NUMBER IS READ. SEPP/718's own
    // attributes disagree about whether its value is metres above ground or an AHD level, and a
    // reader that picks one has discarded the warning rather than resolved it.
    const rdlConflict = nswReducedLevelConflict(
        nswText(a, 'MAP_TYPE'),
        nswText(a, 'MAP_NAME'),
        nswText(a, 'LAY_NAME'),
        nswText(a, 'UNITS'),
    );

    let height: NswHeightValue;
    if (rdlConflict) {
        height = { kind: 'uninterpretable', rawValue: nswNumber(a, 'LAY_CLASS'), rawUnits: nswText(a, 'UNITS'), reason: rdlConflict };
    } else if (isPrincipalHob || isSeppLegacyHob) {
        // Principal/14 carries its own UNITS domain (m | m(RL) | NA) plus the split
        // MAX_B_H_M / MAX_B_H_RL columns; `parseNswHeight` refuses anything outside it.
        height = parseNswHeight(nswNumber(a, 'MAX_B_H'), nswText(a, 'UNITS'));
    } else if (quantity.datum === 'AHD') {
        height = nswAbsoluteLevelFromLayClass(nswNumber(a, 'LAY_CLASS'));
    } else if (quantity.datum === 'existing_ground_level') {
        // ⭐ THE MODERN SEPP SCHEMA KEEPS A SYMBOLOGY BAND IN LAY_CLASS, NOT A VALUE. `nswNumber`
        // already rejects "80-99.9" — safe, and a 16-metre loss when LABEL says 96. `nswBandedValue`
        // recovers the label ONLY when the band corroborates it, and refuses when they disagree.
        const banded = nswBandedValue(layClass, nswText(a, 'LABEL'));
        height =
            banded.kind === 'exact'
                ? parseNswHeight(banded.value, 'm')
                : banded.kind === 'band-only'
                  ? { kind: 'uninterpretable', rawValue: null, rawUnits: 'm', reason: banded.reason }
                  : parseNswHeight(nswNumber(a, 'LAY_CLASS'), 'm');
    } else {
        // Applicability-only or an unrecognised LAY_NAME. ⛔ NOT assumed to be metres — the whole
        // point of the closed vocabulary is that an unlisted string refuses instead of defaulting.
        height = {
            kind: 'uninterpretable',
            rawValue: nswNumber(a, 'LAY_CLASS'),
            rawUnits: null,
            reason: describeNswAxisExclusion(quantity),
        };
    }
    // Cross-check against the retained layer-id list. A disagreement is a schema surprise, and it
    // is surfaced in the explanation rather than silently resolved in favour of either side.
    const datumDisagreement =
        hit.layerId !== NSW_LAYER.HEIGHT_OF_BUILDINGS &&
        isNswAbsoluteLevelLayer(hit.layerId) !== (quantity.datum === 'AHD');

    const ruling = nswLookupRuling(instrument, hit.layerId, layClass, service);
    const citation = nswResolveCitation(servedClause, ruling, hit.layerId);
    return {
        layerId: hit.layerId,
        layerName: seppFacts?.name ?? nswLayerName(hit.layerId),
        service,
        instrumentClass,
        substitutesDatum: isNswDatumSubstitution(quantity),
        seppReplica: service === 'SEPP' && isNswSeppReplica(hit.layerId),
        instrument,
        lga,
        layClass,
        quantity,
        height,
        role: ruling?.role ?? 'UNRESOLVED',
        condition: ruling?.condition ?? null,
        clause: citation.clause,
        citation,
        additive: isNswAdditiveAllowance(hit.layerId),
        inclinedPlane: isNswInclinedPlaneLayer(hit.layerId),
        schemaSurprise: datumDisagreement
            ? `Datum disagreement on ${nswLayerName(hit.layerId)}: LAY_NAME ` +
              `${JSON.stringify(quantity.layName)} implies ` +
              `${quantity.datum === 'AHD' ? 'an absolute AHD level' : 'a height above ground'}, ` +
              "while the pack's layer classification implies the other. Reported, not resolved."
            : null,
        ruling,
    };
}

/**
 * Resolve the governing vertical control for a parcel.
 *
 * ⛔ THE FUNCTION CONTAINS NO `Math.min` OVER COMPETING CONTROLS, AND MUST NOT ACQUIRE ONE.
 * Caps are intersected because a cap is legally an intersection; bases are never minimised,
 * because choosing between two bases is a legal act.
 */
export function resolveNswVerticalPrecedence(
    hits: readonly NswRawControlHit[],
    ctx: NswPrecedenceContext = {},
): NswVerticalResolution {
    const controls = hits.map(nswReadControl);
    const explanation: string[] = [];

    // ── 0. No controls at all. F1 (our gap) vs F2 (a correct null). ────────────────────────────
    // Measured: this is 39.2% of NSW parcels — the single most common outcome, not an edge case.
    if (controls.length === 0) {
        if (ctx.landHasNoHeightSubject === true) {
            explanation.push(
                'No vertical control intersects this parcel, and the land is of a class where a height ' +
                    'control correctly does not apply (F2 — a correct null, not a coverage gap).',
            );
            return {
                baseHeight: null,
                baseControl: null,
                conditionalUplifts: [],
                hardCaps: [],
                allControls: [],
                datumControls: [],
                instrumentContest: null,
                verticallyUnplaced: false,
                uncitedConstraints: [],
                envelopeIsUpperBound: false,
                publishable: true,
                explanation,
                state: {
                    rule: RULE_C2,
                    status: 'refused',
                    reachability: 'source-complete',
                    basis: 'rule-not-applicable',
                    reason:
                        'Land carries no subject for a height control (reservation / waterway / public system). ' +
                        'The law states no height here; this is not a data gap.',
                    ref: ref(null),
                },
            };
        }
        explanation.push(
            'No vertical control intersects this parcel. The Height of Buildings map was read and ' +
                'carries no polygon here (F1 — a GAP, and ours). ' +
                'This must NOT be rendered as "the law sets no height limit".',
        );
        return {
            baseHeight: null,
            baseControl: null,
            conditionalUplifts: [],
            hardCaps: [],
            allControls: [],
            datumControls: [],
            instrumentContest: null,
            verticallyUnplaced: false,
            uncitedConstraints: [],
            envelopeIsUpperBound: false,
            publishable: true,
            explanation,
            state: {
                rule: RULE_C2,
                status: 'unrecovered',
                partial: null,
                reachability: 'source-complete',
                failure: 'missing-source',
                mechanism: 'absent',
                stoppedAt: 'No HOB polygon intersects the parcel on Planning_Portal_Principal_Planning/14.',
                ref: ref(null),
            },
        };
    }

    // ── 1a. AXIS FIRST, ROLE SECOND. ⛔ THE 152//DP877246 GUARD, IN ITS CORRECTED FORM. ────────
    //
    // A control is excluded from the height question before its legal role is even considered,
    // whenever `LAY_NAME` says its number is not on the envelope-top axis. Measured parcel
    // `152//DP877246` carries HOB 8.5 m and a layer-429 value of 2.1 whose `LAY_NAME` is
    // "Minimum Level Australian Height Datum (AHD)" — a minimum habitable floor level in Ballina,
    // a coastal flood LGA. `min(8.5, 2.1) = 2.1` is a garage where an 8.5 m house is permitted.
    //
    // ⚠ THE EARLIER GUARD FOR THIS PARCEL EXCLUDED IT AS AN "ADDITIVE ALLOWANCE" AND WAS WRONG
    // ABOUT WHY (see `nswPortalLayers.ts` NSW_ADDITIVE_ALLOWANCE_LAYERS). It got the right answer
    // on this parcel from a false premise, which is worse than failing: the premise generalises.
    // Axis exclusion is the true property, and it is read from a field populated on 996/996
    // features rather than from a hand-written layer list.
    // THREE buckets, not two, and the third is the one that used to hide inside the second:
    //   offAxis      — does not bound the top at all (a minimum floor level). Ignoring it for
    //                  height purposes overstates NOTHING.
    //   unevaluated  — DOES bound the top and serves no usable number (a sun access plane, an
    //                  airport buffer, a Building Height Plane class). ⛔ Ignoring one of these
    //                  DOES overstate — L-616 — so it drives `envelopeIsUpperBound` below.
    //   onAxis       — bounds the top and serves a number. Only these enter the role partition.
    //
    // ⭐ ROUND-4: A FOURTH BUCKET, AND IT IS THE ONE ROUND THREE PUT IN THE WRONG PLACE.
    //   datumControls — SUBSTITUTE the origin the base height is measured from (Byron LEP 2014
    //                   cl 4.3A). Round 3 filed layer 429 under `offAxis`, and `offAxis` means
    //                   "ignoring this overstates NOTHING". That is false for a datum: ignoring it
    //                   leaves the base height on the wrong origin, wrong by
    //                   (datum level - existing ground level) in whichever direction the site
    //                   slopes. Handled below, after the base is established.
    //
    // ⚠ AND FIRST, THE DE-DUPLICATION GUARD. A SEPP-service layer measured to REPLICATE what
    // Principal/14 already serves at the same point must not be counted twice: two identical BASE
    // controls is a status-D precedence conflict, i.e. a REFUSAL on a parcel that has one answer —
    // a regression that arrives disguised as coverage. Reported, never silently dropped.
    const replicas = controls.filter((c) => c.seppReplica);
    for (const c of replicas) {
        const facts = c.service === 'SEPP' ? nswSeppLayer(c.layerId) : null;
        explanation.push(
            `NOT COUNTED TWICE — SEPP service layer ${c.layerId} (${c.layerName}) was measured to ` +
                'serve the same control the principal planning layer already serves at this point. ' +
                `${facts?.replicaEvidence ?? ''} It is read and set aside; counting it again would ` +
                'manufacture a second base control and refuse a parcel that has one answer.',
        );
    }
    const live = controls.filter((c) => !c.seppReplica);

    const datumControls = live.filter((c) => c.substitutesDatum);
    const offAxis = live.filter((c) => !c.quantity.bearsOnEnvelopeTop && !c.substitutesDatum);
    const unevaluated = live.filter((c) => isNswUnevaluatedTopConstraint(c.quantity));
    const onAxis = live.filter((c) => c.quantity.constrainsEnvelopeTop);
    for (const c of datumControls) {
        explanation.push(
            `MEASUREMENT DATUM, NOT A LIMIT — ${c.layerName} (${c.layClass ?? 'no class'}): ` +
                describeNswAxisExclusion(c.quantity),
        );
    }
    for (const c of offAxis) {
        explanation.push(
            `EXCLUDED FROM HEIGHT PRECEDENCE — ${c.layerName} (${c.layClass ?? 'no class'}): ` +
                describeNswAxisExclusion(c.quantity),
        );
    }
    for (const c of unevaluated) {
        explanation.push(
            `BOUNDS THE ENVELOPE AND COULD NOT BE EVALUATED — ${c.layerName} ` +
                `(${c.layClass ?? 'no class'}): ` +
                describeNswAxisExclusion(c.quantity),
        );
    }
    // ⭐ THE §13 SEPP CRITERION, MADE LEGIBLE RATHER THAN MERELY STRUCTURAL.
    //
    // "A SEPP-covered parcel is never resolved LEP-alone" is already enforced downstream — an
    // unreadable SEPP control lands in `unevaluated`, which sets `envelopeIsUpperBound` and blocks
    // publication. But a reader looking at the trace would see only "an unreadable control", and
    // WHICH INSTRUMENT could not be read is the whole point of the criterion.
    //
    // Measured on `parramatta-north-ssp-stack`: Principal/14 returns Parramatta LEP 2023 at 20 m
    // alongside SEPP (Precincts—Central River City) 2021 at 6 with `UNITS` null. The SEPP applies,
    // it may well displace the 20, and its own service gives no units to read it by. Emitting 20 m
    // with no mention of the policy would be LEP-alone in everything but bookkeeping.
    for (const c of live) {
        if (c.instrumentClass !== 'SEPP') continue;
        if (c.quantity.constrainsEnvelopeTop) continue;
        explanation.push(
            `⚠ A STATE ENVIRONMENTAL PLANNING POLICY APPLIES HERE AND COULD NOT BE EVALUATED — ` +
                `${c.instrument ?? 'an unnamed SEPP'} (${c.layerName}): ` +
                `${describeNswHeight(c.height)}. A SEPP that applies may displace the local plan ` +
                'entirely, so any height reported below is at most an upper bound, and this parcel ' +
                'is NOT resolved on the local environmental plan alone.',
        );
    }
    for (const c of controls) {
        if (c.schemaSurprise) explanation.push(`⚠ ${c.schemaSurprise}`);
    }

    // ── 1b. Partition by legal role, over the on-axis controls only. ──────────────────────────
    let instrumentContest: string | null = null;
    const additive = onAxis.filter((c) => c.additive);
    const nonAdditive = onAxis.filter((c) => !c.additive);

    const bases = nonAdditive.filter((c) => c.role === 'BASE');
    const overrides = nonAdditive.filter((c) => c.role === 'OVERRIDE');
    const caps = nonAdditive.filter((c) => c.role === 'CAP');
    const conditionals = nonAdditive.filter((c) => c.role === 'CONDITIONAL');
    const unresolved = nonAdditive.filter((c) => c.role === 'UNRESOLVED');

    // ── 2. Establish the base. OVERRIDE replaces BASE where present. ───────────────────────────
    let baseControl: NswVerticalControl | null = null;
    let conflict = false;

    if (overrides.length === 1) {
        baseControl = overrides[0]!;
        explanation.push(
            `${baseControl.layerName} OVERRIDES the principal control (${baseControl.clause ?? 'clause not served'}).`,
        );
    } else if (overrides.length > 1) {
        conflict = true;
        explanation.push(`${overrides.length} OVERRIDE controls intersect and the clauses do not rank them.`);
    } else if (bases.length === 1) {
        baseControl = bases[0]!;
        explanation.push(
            `Base height from ${baseControl.layerName}: ${describeNswHeight(baseControl.height)}` +
                (baseControl.clause ? ` (${baseControl.clause}).` : ' — no clause served.'),
        );
    } else if (bases.length > 1) {
        // ⭐ ROUND-4 — ASK THE INSTRUMENTS BEFORE REFUSING. Measured: Principal/14 returns TWO rows
        // on a State Significant Precinct parcel, one LEP-drawn and one SEPP-drawn (fixtures
        // `parramatta-north-ssp-stack`, `hornsby-ehc-stack`). The SEPPs answer the question in their
        // own words — "this Chapter prevails to the extent of the inconsistency" — and refusing
        // when the instrument answers is the mirror image of guessing when it does not.
        //
        // ⛔ `nswResolveInstrumentContest` IS HANDED NO VALUES, ONLY INSTRUMENT IDENTITIES. Hornsby
        // is the proof: LEP 8.5 m against SEPP 9.5 m, where the correct answer is the LARGER number.
        // Any "conservative" tie-break gets that parcel wrong by a metre and Parramatta
        // (LEP 20 m vs SEPP 6) wrong by fourteen.
        const contest = nswResolveInstrumentContest(
            bases.map((b) => ({ instrument: b.instrument, epiType: b.instrumentClass })),
        );
        instrumentContest = contest.explanation;
        explanation.push(contest.explanation);
        if (contest.winnerIndex !== null) {
            baseControl = bases[contest.winnerIndex]!;
            for (const b of bases) {
                if (b === baseControl) continue;
                explanation.push(
                    `DISPLACED — ${b.layerName} (${b.instrument ?? 'unnamed instrument'}) ` +
                        `${describeNswHeight(b.height)} is set aside by the prevailing instrument ` +
                        'above. ⚠ Set aside, not deleted: the clause resolves an INCONSISTENCY, so ' +
                        'where the two instruments agree the displaced one still stands.',
                );
            }
        } else {
            // ⛔ Build prompt §5.6: two BASE controls the clauses do not resolve → status D. NOT min().
            conflict = true;
            explanation.push(
                `${bases.length} BASE controls intersect this parcel and nothing read so far ranks ` +
                    'them: ' +
                    bases.map((b) => `${b.layerName} ${describeNswHeight(b.height)}`).join(' vs ') +
                    '. Choosing between them is a legal act, not an arithmetic one.',
            );
        }
    }

    if (conflict) {
        return {
            baseHeight: null,
            baseControl: null,
            conditionalUplifts: [],
            hardCaps: [],
            allControls: controls,
            datumControls,
            instrumentContest,
            verticallyUnplaced: false,
            uncitedConstraints: live.filter((c) => !nswMayContributeValue(c.citation.state)),
            envelopeIsUpperBound: false,
            publishable: false,
            explanation,
            state: {
                rule: RULE_C2,
                status: 'refused',
                reachability: 'interpretive',
                basis: 'requires-determination',
                reason: explanation[explanation.length - 1]!,
                ref: ref(bases[0] ?? overrides[0] ?? null),
            },
        };
    }

    // ── 3. Conditional uplifts and unresolved-role controls: reported, NEVER applied. ──────────
    const uplifts: NswConditionalUplift[] = [
        ...conditionals.map(
            (c): NswConditionalUplift => ({
                control: c,
                condition: c.condition,
                notAppliedBecause:
                    'Conditional uplift. It applies only if its condition is met, which is a consent ' +
                    'decision, not a property of the land. Presenting it as an entitlement would overstate yield.',
            }),
        ),
        ...additive.map(
            (c): NswConditionalUplift => ({
                control: c,
                condition: c.condition,
                notAppliedBecause:
                    'Additive height allowance, not a competing maximum. It increments the base under ' +
                    'condition; it is neither a cap nor an alternative, and must never be minimised against the base.',
            }),
        ),
        ...unresolved.map(
            (c): NswConditionalUplift => ({
                control: c,
                condition: null,
                notAppliedBecause:
                    `Legal role not established. ${c.layerName} serves no LEGIS_REF_CLAUSE ` +
                    '(measured 0.0% populated on this layer family) and no signed registry entry exists, ' +
                    'so whether it replaces, supplements or caps the base is unknown. Reported, not applied.',
            }),
        ),
        // Off-axis controls are REPORTED here rather than dropped. They are real constraints on
        // this land — a minimum floor level genuinely binds — they simply do not answer the
        // height question, and a reader who never sees them cannot tell that we read them.
        ...[...offAxis, ...unevaluated].map(
            (c): NswConditionalUplift => ({
                control: c,
                condition: null,
                notAppliedBecause: describeNswAxisExclusion(c.quantity),
            }),
        ),
    ];
    for (const u of uplifts) {
        explanation.push(
            `NOT APPLIED — ${u.control.layerName} ${describeNswHeight(u.control.height)}: ${u.notAppliedBecause}`,
        );
    }

    // ── 4. Caps: intersected, but only when the datums are comparable AND the cap is CITED. ───
    let verticallyUnplaced = false;
    const hardCaps: NswHardCap[] = caps.map((c) => {
        // ⛔ ARM B, and it is checked FIRST, before geometry and before datums. A cap is an
        // assertion that someone's land is more constrained than the base control says. Making
        // that assertion without a clause is the §1.2 bug in its most expensive form, because
        // unlike an uplift it cannot be spotted by an owner who knows their site is under-built.
        if (!nswMayContributeValue(c.citation.state)) {
            return {
                control: c,
                applied: false,
                notAppliedBecause:
                    c.citation.absenceReason ??
                    'No clause citation could be resolved for this cap, so it is not applied.',
            };
        }
        if (c.inclinedPlane) {
            const p = c.ruling?.plane ?? null;
            if (!p) {
                return {
                    control: c,
                    applied: false,
                    notAppliedBecause:
                        'Inclined-plane control with unresolved parameters (angle and/or origin line). ' +
                        'Bounded but geometrically underdetermined — emitted as a named constraint, ' +
                        'never as an extruded prism.',
                };
            }
            return {
                control: c,
                applied: true,
                notAppliedBecause: null,
            };
        }
        if (!isNumericHeight(c.height)) {
            return {
                control: c,
                applied: false,
                notAppliedBecause: `Cap carries no usable value: ${describeNswHeight(c.height)}.`,
            };
        }
        if (baseControl && !areHeightsComparable(baseControl.height, c.height)) {
            if (ctx.groundLevel_m_AHD === null || ctx.groundLevel_m_AHD === undefined) {
                verticallyUnplaced = true;
                return {
                    control: c,
                    applied: false,
                    notAppliedBecause:
                        'Cap is an absolute AHD level and the base is a height above existing ground level. ' +
                        'Comparing them requires the site ground elevation, which was not supplied. ' +
                        'The envelope is reported vertically unplaced rather than placed by a guess.',
                };
            }
        }
        return { control: c, applied: true, notAppliedBecause: null };
    });
    for (const h of hardCaps) {
        explanation.push(
            h.applied
                ? `CAP APPLIED — ${h.control.layerName} ${describeNswHeight(h.control.height)}.`
                : `CAP NOT APPLIED — ${h.control.layerName}: ${h.notAppliedBecause}`,
        );
    }

    // ── 4b. The ARM B residue, and the L-616 flag. ─────────────────────────────────────────────
    // Every control we saw and could not cite. ⚠ Uplifts are EXCLUDED from `envelopeIsUpperBound`
    // on purpose: an unapplied uplift makes the answer CONSERVATIVE, and a conservative answer is
    // not an overstatement. Only an unapplied CAP inflates the envelope, and only that inflation
    // is what L-616 forbids leaving unlabelled.
    const uncitedConstraints = live.filter((c) => !nswMayContributeValue(c.citation.state));

    // ⛔ THE L-616 LEDGER. Every control that could only ever REDUCE this envelope and did not get
    // applied. Four ways in, and each one was a separate near-miss:
    //   1. bears on the top, serves no number (sun access, airport buffer, an unresolvable
    //      Building Height Plane class) — status C, the build prompt's own §8 case;
    //   2. serves a number on the top axis but its LEGAL ROLE is unresolved, so we cannot rule out
    //      that it is a CAP. ⚠ Filing these with the conditional uplifts — which is where they
    //      went — quietly assumes they can only RAISE the answer. Nothing establishes that;
    //   3. a cap the engine declined to apply (uncited, or a datum mismatch needing terrain);
    //   4. a conditional whose value is comparable and STRICTLY BELOW the base, where ignoring it
    //      is not the conservative choice it is for an uplift.
    const unappliedCapControls = hardCaps.filter((h) => !h.applied).map((h) => h.control);
    const unappliedTopConstraints = dedupeControls([
        // 1. Bears on the top and serves no number — nothing to compare, so it could lower.
        ...unevaluated,
        // 2 + 4. A number on the top axis that was not applied because its legal role is unknown,
        //        or because its condition is not established. Flagged only if it could LOWER.
        ...[...onAxis.filter((c) => c.role === 'UNRESOLVED'), ...conditionals].filter((c) =>
            couldLowerTheAnswer(c, baseControl),
        ),
        // 3. A cap the engine declined to apply — uncited, or a datum mismatch needing terrain.
        //    ⚠ A cap is always flagged: a cap that could not be evaluated is the L-616 case in
        //    its purest form, and `couldLowerTheAnswer` would wave through a cap sitting above the
        //    base only by assuming the cap means what its number says, which is what was in doubt.
        ...unappliedCapControls,
    ]);
    const envelopeIsUpperBound = unappliedTopConstraints.length > 0;
    if (envelopeIsUpperBound) {
        explanation.push(
            `UPPER BOUND, NOT A DETERMINATION — ${unappliedTopConstraints.length} constraint(s) ` +
                'that could reduce this envelope were found and not applied: ' +
                unappliedTopConstraints.map((c) => c.layerName).join('; ') +
                '. The height below is the most this site could be, not the most it may be ' +
                '(build prompt §11 status C, not status A).',
        );
    }

    // ── 5. Emit. ───────────────────────────────────────────────────────────────────────────────
    if (!baseControl) {
        explanation.push(
            'Controls intersect this parcel but none of them is an established BASE control.',
        );
        return {
            baseHeight: null,
            baseControl: null,
            conditionalUplifts: uplifts,
            hardCaps,
            allControls: controls,
            datumControls,
            instrumentContest,
            verticallyUnplaced,
            uncitedConstraints,
            envelopeIsUpperBound,
            publishable: false,
            explanation,
            state: {
                rule: RULE_C2,
                status: 'unrecovered',
                partial: null,
                reachability: 'extractable',
                failure: 'semantic',
                mechanism: 'present',
                stoppedAt:
                    'Vertical controls intersect the parcel but none has an established BASE role; ' +
                    'LEGIS_REF_CLAUSE is unpopulated on this layer family and no signed registry entry matched.',
                ref: ref(controls[0] ?? null),
            },
        };
    }

    const h = baseControl.height;
    if (h.kind === 'no_numeric_control') {
        // UNITS='NA'. The instrument applies and deliberately states no number. F2-adjacent, but
        // it is `no-limit-stated`, NOT `rule-not-applicable`, and ⛔ NOT "unbounded" (L-616).
        return {
            baseHeight: h,
            baseControl,
            conditionalUplifts: uplifts,
            hardCaps,
            allControls: controls,
            datumControls,
            instrumentContest,
            verticallyUnplaced,
            uncitedConstraints,
            envelopeIsUpperBound,
            publishable: nswMayPublish(baseControl.citation.state),
            explanation: [
                ...explanation,
                "UNITS='NA': the height map applies here and states no numeric control. Refusing. " +
                    'This is NOT an unbounded height — other controls still bind.',
            ],
            state: {
                rule: RULE_C2,
                status: 'refused',
                reachability: 'source-complete',
                basis: 'no-limit-stated',
                reason:
                    "NSW Height of Buildings UNITS='NA': the instrument applies and states no numeric " +
                    'height control. Not unbounded; not a data gap.',
                ref: ref(baseControl),
            },
        };
    }
    if (!isNumericHeight(h)) {
        return {
            baseHeight: h,
            baseControl,
            conditionalUplifts: uplifts,
            hardCaps,
            allControls: controls,
            datumControls,
            instrumentContest,
            verticallyUnplaced,
            uncitedConstraints,
            envelopeIsUpperBound,
            publishable: false,
            explanation: [...explanation, describeNswHeight(h)],
            state: {
                rule: RULE_C2,
                status: 'unrecovered',
                partial: null,
                reachability: 'source-complete',
                failure: 'semantic',
                mechanism: 'present',
                stoppedAt: describeNswHeight(h),
                ref: ref(baseControl),
            },
        };
    }

    // ⛔ ARM B ON THE BASE ITSELF. A base height with no citation is the §1.2 bug exactly as
    // written: a number in PRYZM's output with no clause behind it. It does not become `resolved`.
    //
    // ⚠ IN PRACTICE THIS BRANCH IS RARE AND THAT IS BY CONSTRUCTION, NOT BY LUCK. Principal/14
    // serves LEGIS_REF_CLAUSE on 94.8% of features, and the remaining 5.2% fall through to the
    // registry's wildcard Standard Instrument cl 4.3 row — which is REAL LAW, not a default: the
    // Standard Instrument makes cl 4.3 the principal height control in every NSW LEP. So a base
    // HOB reaches `absent` only when the feature is uncited AND no instrument row matches, which
    // is a registry defect worth surfacing rather than a routine outcome.
    if (!nswMayContributeValue(baseControl.citation.state)) {
        return {
            baseHeight: h,
            baseControl,
            conditionalUplifts: uplifts,
            hardCaps,
            allControls: controls,
            datumControls,
            instrumentContest,
            verticallyUnplaced,
            uncitedConstraints,
            envelopeIsUpperBound,
            publishable: false,
            explanation: [
                ...explanation,
                `NOT EMITTED AS A VALUE — ${describeNswHeight(h)} was read from the service and ` +
                    'carries no clause citation. A height with no clause is not a parameter.',
            ],
            state: {
                rule: RULE_C2,
                status: 'unrecovered',
                partial: null,
                reachability: 'source-complete',
                failure: 'semantic',
                mechanism: 'present',
                stoppedAt:
                    baseControl.citation.absenceReason ??
                    'The governing height control carries no clause citation.',
                ref: ref(baseControl),
            },
        };
    }

    // ══════════════════════════════════════════════════════════════════════════════════════════
    // ⭐ 4c. THE MEASUREMENT DATUM. Byron LEP 2014 cl 4.3A, and the round-4 correction in code.
    // ══════════════════════════════════════════════════════════════════════════════════════════
    // A DATUM control does not cap and does not uplift: it moves the ORIGIN the base height is
    // measured from. Where one applies, "8.5 m" does not mean 8.5 m above existing ground level —
    // it means 8.5 m above the stated AHD level, i.e. an ABSOLUTE top.
    //
    // ⛔ AND WHERE THE DATUM CONTROL IS UNCITED THE BASE HEIGHT IS NOT A NUMBER WE MAY REPORT.
    // This is the case the previous two rounds both got wrong in opposite directions. Round 3's
    // answer — report 8.5 m above existing ground level and flag nothing — is not conservative:
    // the error runs BOTH ways depending on whether the site sits above or below the stated level,
    // so it is not covered by `envelopeIsUpperBound` (which asserts "could only be lower"). The
    // honest state is `verticallyUnplaced`: we know the magnitude and not the origin.
    let effective: NswHeightValue = h;
    if (datumControls.length > 0) {
        if (datumControls.length > 1) {
            explanation.push(
                `${datumControls.length} measurement-datum controls apply to this parcel and nothing ` +
                    'read so far says which supplies the origin. Two origins is not an average.',
            );
            verticallyUnplaced = true;
        } else {
            const d = datumControls[0]!;
            const usable = nswMayContributeValue(d.citation.state) && d.height.kind === 'absolute_level';
            if (!usable) {
                verticallyUnplaced = true;
                explanation.push(
                    `VERTICALLY UNPLACED — ${d.layerName} substitutes the datum this height is ` +
                        'measured from, and it could not be used: ' +
                        (d.height.kind !== 'absolute_level'
                            ? describeNswHeight(d.height)
                            : (d.citation.absenceReason ?? 'no clause citation could be resolved for it')) +
                        `. The base control states ${describeNswHeight(h)}, but on this land that ` +
                        'magnitude is measured from a level we cannot establish, so the envelope has ' +
                        'a height and no position. ⛔ Reporting it as metres above existing ground ' +
                        'level would be wrong by (datum level − ground level) in whichever direction ' +
                        'the site slopes — an error that runs BOTH ways and is therefore not an ' +
                        'upper bound. One signed registry row for this instrument closes it.',
                );
                return {
                    baseHeight: h,
                    baseControl,
                    conditionalUplifts: uplifts,
                    hardCaps,
                    allControls: controls,
                    datumControls,
                    instrumentContest,
                    verticallyUnplaced: true,
                    uncitedConstraints,
                    envelopeIsUpperBound,
                    publishable: false,
                    explanation,
                    state: {
                        rule: RULE_C2,
                        status: 'unrecovered',
                        partial: null,
                        reachability: 'extractable',
                        failure: 'semantic',
                        mechanism: 'present',
                        stoppedAt:
                            `${describeNswHeight(h)} was read from ${baseControl.layerName}, and ` +
                            `${d.layerName} substitutes the datum it is measured from without a ` +
                            'usable value or citation. A magnitude on an unknown origin is not a height.',
                        ref: ref(baseControl),
                    },
                };
            }
            if (h.kind === 'height_above_ground') {
                effective = {
                    kind: 'absolute_level',
                    value_m_AHD: d.height.value_m_AHD + h.value_m,
                    frame: 'AHD',
                };
                explanation.push(
                    `DATUM SUBSTITUTED — ${d.clause ?? d.layerName}: the maximum height is measured ` +
                        `from RL ${d.height.value_m_AHD} m AHD, not from existing ground level, so ` +
                        `${h.value_m} m places the envelope top at RL ${d.height.value_m_AHD + h.value_m} ` +
                        'm AHD. ⛔ This is an ADDITION because the clause moves the origin — it is not ' +
                        'an additive height bonus, and it is not a competing maximum to minimise against.',
                );
            } else {
                explanation.push(
                    `${d.layerName} substitutes the measurement datum, and the base control is ` +
                        `already absolute (${describeNswHeight(h)}). Applying a datum to a value that ` +
                        'is already in that datum would double-count the ground. Reported, not applied.',
                );
            }
        }
    }

    return {
        baseHeight: effective,
        baseControl,
        conditionalUplifts: uplifts,
        hardCaps,
        allControls: controls,
        datumControls,
        instrumentContest,
        verticallyUnplaced,
        uncitedConstraints,
        envelopeIsUpperBound,
        // Build prompt §1.4: a named signer is the condition for publication. `registry-unsigned`
        // computes correctly and ships to nobody. ⚠ A relocated datum inherits the DATUM control's
        // publishability too: an answer standing on an unsigned reading of where the tape measure
        // starts is not more publishable than that reading.
        publishable:
            nswMayPublish(baseControl.citation.state) &&
            !envelopeIsUpperBound &&
            !verticallyUnplaced &&
            datumControls.every((d) => nswMayPublish(d.citation.state)),
        explanation,
        state: {
            rule: RULE_C2,
            status: 'resolved',
            reachability: 'source-complete',
            value: effective.kind === 'absolute_level' ? effective.value_m_AHD : (effective as { value_m: number }).value_m,
            unit: effective.kind === 'absolute_level' ? 'm AHD' : 'm',
            // ⛔ NEVER OMITTED. `RuleState.resolved` treats an unresolved datum as `unrecovered`
            // for the same reason `nswHeightValue.ts` exists: a number on an unknown plane cannot
            // be multiplied into a volume, and 'm' vs 'm AHD' differ by the site's elevation.
            datum:
                effective.kind === 'absolute_level'
                    ? 'AHD'
                    : (effective as { datum: typeof NSW_RELATIVE_DATUM }).datum,
            // The government published this number as a polygon attribute. That is what
            // `published-structured` means, and it is true whether or not a human has signed the
            // ROLE ruling — the signature governs publication (`publishable` above), not where the
            // number came from. ⛔ Conflating the two would let an unsigned ruling silently
            // downgrade a government-published value, or an in-house reading claim to be one.
            provenance: 'published-structured',
            ref: ref(baseControl),
        },
    };
}
