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
    type NswHeightValue,
} from './nswHeightValue.js';
import { nswNumber, nswText, type NswAttributeBag } from './nswPortalAttributes.js';
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
    readonly ruling: NswControlRuling | null;
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
    /** Human-readable trace of the decision, for the explain-why panel. */
    readonly explanation: readonly string[];
}

/** What the caller feeds in: one raw feature per intersecting control. */
export interface NswRawControlHit {
    readonly layerId: number;
    readonly attributes: NswAttributeBag;
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
    const instrument = nswText(a, 'EPI_NAME');
    const lga = nswText(a, 'LGA_NAME');
    const layClass = nswText(a, 'LAY_CLASS');
    const servedClause = nswText(a, 'LEGIS_REF_CLAUSE');

    // Height typing. The Principal HOB layer carries MAX_B_H + UNITS; overlays carry LAY_CLASS.
    let height: NswHeightValue;
    if (hit.layerId === NSW_LAYER.HEIGHT_OF_BUILDINGS) {
        height = parseNswHeight(nswNumber(a, 'MAX_B_H'), nswText(a, 'UNITS'));
    } else if (isNswAbsoluteLevelLayer(hit.layerId)) {
        height = nswAbsoluteLevelFromLayClass(nswNumber(a, 'LAY_CLASS'));
    } else {
        // Overlay layers state metres above existing ground level in LAY_CLASS. A non-numeric
        // LAY_CLASS (a class letter, a phrase) yields `uninterpretable`, not a zero.
        height = parseNswHeight(nswNumber(a, 'LAY_CLASS'), 'm');
    }

    const ruling = nswLookupRuling(instrument, hit.layerId, layClass);
    const citation = nswResolveCitation(servedClause, ruling, hit.layerId);
    return {
        layerId: hit.layerId,
        layerName: nswLayerName(hit.layerId),
        instrument,
        lga,
        layClass,
        height,
        role: ruling?.role ?? 'UNRESOLVED',
        condition: ruling?.condition ?? null,
        clause: citation.clause,
        citation,
        additive: isNswAdditiveAllowance(hit.layerId),
        inclinedPlane: isNswInclinedPlaneLayer(hit.layerId),
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
            verticallyUnplaced: false,
            uncitedConstraints: [],
            envelopeIsUpperBound: false,
            publishable: true,
            explanation,
            state: {
                rule: RULE_C2,
                status: 'unrecovered',
                reachability: 'source-complete',
                failure: 'missing-source',
                mechanism: 'absent',
                stoppedAt: 'No HOB polygon intersects the parcel on Planning_Portal_Principal_Planning/14.',
                ref: ref(null),
            },
        };
    }

    // ── 1. Partition by legal role. ────────────────────────────────────────────────────────────
    // ⚠ Additive allowances are removed from base candidacy FIRST. This is the 152//DP877246
    // guard: a 2.1 m allowance is not a candidate maximum and must never be compared against 8.5.
    const additive = controls.filter((c) => c.additive);
    const nonAdditive = controls.filter((c) => !c.additive);

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
        // ⛔ Build prompt §5.6: two BASE controls the clauses do not resolve → status D. NOT min().
        conflict = true;
        explanation.push(
            `${bases.length} BASE controls intersect this parcel and no clause ranks them: ` +
                bases.map((b) => `${b.layerName} ${describeNswHeight(b.height)}`).join(' vs ') +
                '. Choosing between them is a legal act, not an arithmetic one.',
        );
    }

    if (conflict) {
        return {
            baseHeight: null,
            baseControl: null,
            conditionalUplifts: [],
            hardCaps: [],
            allControls: controls,
            verticallyUnplaced: false,
            uncitedConstraints: controls.filter((c) => !nswMayContributeValue(c.citation.state)),
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
    const uncitedConstraints = controls.filter((c) => !nswMayContributeValue(c.citation.state));
    const uncitedCaps = hardCaps.filter(
        (h) => !h.applied && !nswMayContributeValue(h.control.citation.state),
    );
    const envelopeIsUpperBound = uncitedCaps.length > 0;
    if (envelopeIsUpperBound) {
        explanation.push(
            `UPPER BOUND, NOT A DETERMINATION — ${uncitedCaps.length} constraint(s) that can only ` +
                'reduce this envelope were found and could not be cited, so they were not applied. ' +
                'The height below is the most this site could be, not the most it may be (status C).',
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
            verticallyUnplaced,
            uncitedConstraints,
            envelopeIsUpperBound,
            publishable: false,
            explanation,
            state: {
                rule: RULE_C2,
                status: 'unrecovered',
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
            verticallyUnplaced,
            uncitedConstraints,
            envelopeIsUpperBound,
            publishable: false,
            explanation: [...explanation, describeNswHeight(h)],
            state: {
                rule: RULE_C2,
                status: 'unrecovered',
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

    return {
        baseHeight: h,
        baseControl,
        conditionalUplifts: uplifts,
        hardCaps,
        allControls: controls,
        verticallyUnplaced,
        uncitedConstraints,
        envelopeIsUpperBound,
        // Build prompt §1.4: a named signer is the condition for publication. `registry-unsigned`
        // computes correctly and ships to nobody.
        publishable: nswMayPublish(baseControl.citation.state) && !envelopeIsUpperBound,
        explanation,
        state: {
            rule: RULE_C2,
            status: 'resolved',
            reachability: 'source-complete',
            value: h.kind === 'absolute_level' ? h.value_m_AHD : h.value_m,
            unit: h.kind === 'absolute_level' ? 'm AHD' : 'm',
            // ⛔ NEVER OMITTED. `RuleState.resolved` treats an unresolved datum as `unrecovered`
            // for the same reason `nswHeightValue.ts` exists: a number on an unknown plane cannot
            // be multiplied into a volume, and 'm' vs 'm AHD' differ by the site's elevation.
            datum: h.kind === 'absolute_level' ? 'AHD' : h.datum,
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
