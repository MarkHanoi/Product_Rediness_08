// §NSW-DCP-TWO-AXES — the DCP binds in STOREYS while the LEP binds in METRES, **both apply, and
// they are not inter-convertible.**
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE STRUCTURE, MEASURED (City of Sydney AGOL, live 2026-09-04 — `sydney-dcp-vocab.json`)
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   Sydney_Development_Control_Plan_2012/FeatureServer/7 `Storeys`  3,592 polygons, 17 distinct
//   …/5 `Storeys`                                                   1,214 polygons, 11 distinct
//   …/3 `SetbackType`                                                 311 polygons, 28 distinct
//   …/12 `SetbackType`                                                133 polygons, 22 distinct
//
// The LEP says `Sydney Local Environmental Plan 2012` cl 4.3, `9 m`. The DCP says `Storeys: "2"`.
// **Both bind. Neither implies the other.** A 9 m envelope holds two generous storeys or three mean
// ones; the DCP does not care which, and the LEP does not care how many.
//
// ⛔⛔ THE ONE FORBIDDEN MOVE IS A FLOOR-TO-FLOOR ASSUMPTION. `metres / 3.1` is a design decision
// dressed as arithmetic, and it is wrong in both directions: it invents a storey the DCP forbids
// on a generous section, and deletes one the DCP permits on a tight one. This module therefore has
// **no function that converts between the axes**, and that absence is the design.
//
// ⭐ THIS IS A PLATFORM CONCERN, NOT AN NSW ONE. Lane PT reports the identical structure from
// RGEU art. 65 — a storey-count control standing alongside a metric height. Two jurisdictions
// arriving at the same shape independently is the signal that the SHARED envelope model needs a
// storey axis, rather than each rulepack inventing a conversion. This file is deliberately shaped
// as the NSW instance of a general type so that promotion costs a move, not a rewrite.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⚠ THE VOCABULARY IS NOT NUMERIC AND A `parseInt` OVER IT IS A SILENT DEFECT
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Measured `Storeys` values on layer 7: "1".."15" **plus `">15"` on 38 polygons and `null` on 1**.
// On layer 5, additionally `"Existing height"` on 2. `parseInt(">15")` is `NaN`;
// `Number(">15")` is `NaN`; and `parseInt("15 storeys")` would be 15 — three ways to be wrong, one
// of which looks right. The closed enum below makes each of them a distinct, named outcome.
//
// P5-adjacent purity: pure data + pure total functions. No I/O, no clock, no RNG.
// Contracts: C58 §1.2/§1.4 (never overstate; refuse rather than fabricate), C62, C63, C74 §0, C75.

/**
 * A DCP storey limit, as a closed result. ⛔ Never a bare `number | null`: the four outcomes have
 * four different meanings and only one of them is a limit you can build against.
 *
 *  - `count`          — an integer maximum number of storeys.
 *  - `open-ended`     — `">15"` (38 polygons). The DCP declines to state an upper bound in
 *                       storeys here **because the LEP metric height is doing the work**. It is
 *                       NOT "unlimited" and it is NOT 15.
 *  - `existing`       — `"Existing height"` (2 polygons). The limit is the building that is
 *                       already there — a fact about the site, not about the plan. Unanswerable
 *                       from the plan alone.
 *  - `not-stated`     — the polygon exists and the field is null (1 polygon), or no polygon
 *                       covers the parcel. ⚠ These two are folded together HERE and split by the
 *                       caller, because only the caller knows whether it looked.
 */
export type NswStoreyLimit =
    | { readonly kind: 'count'; readonly maxStoreys: number; readonly raw: string }
    | { readonly kind: 'open-ended'; readonly aboveStoreys: number; readonly raw: string }
    | { readonly kind: 'existing'; readonly raw: string }
    | { readonly kind: 'not-stated'; readonly raw: string | null; readonly reason: string };

/**
 * Read one served `Storeys` value. **Total** — every input maps to a named outcome.
 *
 * ⛔ NO SUBSTRING MATCHING, NO `parseInt` FALLBACK. `">15"` differs from `"15"` by one character
 * and by the entire question of whether a number bounds the building.
 */
export function nswReadStoreys(value: string | number | null | undefined): NswStoreyLimit {
    if (value === null || value === undefined) {
        return {
            kind: 'not-stated',
            raw: null,
            reason: 'No storey value was served on this DCP polygon.',
        };
    }
    const raw = String(value).trim();
    if (raw === '') {
        return { kind: 'not-stated', raw: '', reason: 'The served storey value is empty.' };
    }
    if (raw === 'Existing height') {
        return { kind: 'existing', raw };
    }
    const gt = /^>\s*(\d+)$/.exec(raw);
    const gtN = gt?.[1];
    if (gtN !== undefined) {
        return { kind: 'open-ended', aboveStoreys: Number(gtN), raw };
    }
    if (/^\d+$/.test(raw)) {
        return { kind: 'count', maxStoreys: Number(raw), raw };
    }
    return {
        kind: 'not-stated',
        raw,
        reason:
            `The served storey value ${JSON.stringify(raw)} is not in the measured City of Sydney ` +
            'DCP vocabulary (integers, ">15", "Existing height"). Reported, not interpreted — ' +
            'guessing a number out of an unrecognised string is how ">15" becomes 15.',
    };
}

/** A sentence for the reader, per outcome. Used verbatim in refusals. */
export function describeNswStoreyLimit(s: NswStoreyLimit): string {
    switch (s.kind) {
        case 'count':
            return `${s.maxStoreys} storeys (development control plan)`;
        case 'open-ended':
            return (
                `more than ${s.aboveStoreys} storeys — the DCP states no upper bound in storeys here ` +
                '(38 polygons state ">15"). ⛔ This is NOT unlimited: the LEP metric height still ' +
                `binds, and it is NOT ${s.aboveStoreys} storeys either.`
            );
        case 'existing':
            return (
                'the height of the existing building ("Existing height"). The limit is a fact about ' +
                'what stands on the site, not a value in the plan, and it is not answerable from ' +
                'planning data alone.'
            );
        case 'not-stated':
            return `no storey limit stated (${s.reason})`;
    }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE TWO-AXIS CONSTRAINT
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** Whether the DCP storey axis was even LOOKED at. ⛔ "Did not look" ≠ "looked and found none". */
export type NswStoreyCoverage = 'polygon-found' | 'no-polygon-here' | 'not-queried';

/**
 * ⭐ THE ENVELOPE'S VERTICAL ANSWER WHEN TWO INSTRUMENTS MEASURE IT IN DIFFERENT UNITS.
 *
 * Deliberately shaped as an INTERSECTION of two independent constraints with no arithmetic
 * relationship. The consumer must satisfy both; this type refuses to pretend one determines the
 * other.
 */
export interface NswDualVerticalConstraint {
    /** The metric limit, from the LEP/SEPP Height of Buildings map. Owned by the precedence engine. */
    readonly metres: { readonly value: number; readonly datum: 'existing_ground_level' | 'AHD' } | null;
    /** The storey limit, from the DCP. */
    readonly storeys: NswStoreyLimit | null;
    readonly storeyCoverage: NswStoreyCoverage;
    /** The DCP that drew the storey polygon — City of Sydney serves 20 distinct plan names. */
    readonly dcpName: string | null;
    /**
     * ⛔ `true` when a consumer could satisfy the metric limit and still be refused consent by the
     * storey control, or vice versa. Which is to say: whenever BOTH axes carry a real limit.
     * A single-axis envelope is not a full answer on any parcel where this is `true`.
     */
    readonly bothAxesBind: boolean;
    /** Why this is not one number, in the words the reader gets. */
    readonly explanation: string;
}

/**
 * Compose the two axes. ⛔ Contains no division, no multiplication, and no floor-to-floor constant.
 */
export function nswDualVerticalConstraint(params: {
    readonly metres: NswDualVerticalConstraint['metres'];
    readonly storeys: NswStoreyLimit | null;
    readonly storeyCoverage: NswStoreyCoverage;
    readonly dcpName?: string | null;
}): NswDualVerticalConstraint {
    const { metres, storeys, storeyCoverage } = params;
    const dcpName = params.dcpName ?? null;
    const storeyBinds =
        storeys !== null && (storeys.kind === 'count' || storeys.kind === 'existing');
    const bothAxesBind = metres !== null && storeyBinds;

    let explanation: string;
    if (bothAxesBind) {
        explanation =
            `TWO CONSTRAINTS, TWO UNITS, BOTH BINDING — the environmental planning instrument caps ` +
            `this site at ${metres!.value} m (${metres!.datum === 'AHD' ? 'AHD' : 'above existing ground level'}) ` +
            `and ${dcpName ?? 'the development control plan'} caps it at ` +
            `${describeNswStoreyLimit(storeys!)}. ⛔ They are NOT inter-convertible: dividing metres ` +
            'by an assumed floor-to-floor height would invent a storey on a generous section and ' +
            'delete one on a tight section. A design must satisfy both, and PRYZM reports both.';
    } else if (metres !== null && storeys !== null && storeys.kind === 'open-ended') {
        explanation =
            `The instrument caps this site at ${metres.value} m and the development control plan ` +
            `states ${describeNswStoreyLimit(storeys)} The metric cap is the binding one here — but ` +
            'the storey control has not gone away, it has declined to state a ceiling.';
    } else if (metres !== null && storeyCoverage === 'no-polygon-here') {
        explanation =
            `The instrument caps this site at ${metres.value} m. No development-control-plan storey ` +
            'polygon covers this parcel, so the storey axis is unconstrained BY THE PLAN THAT WAS ' +
            'READ — which is not the same as unconstrained: 29 of 356 cross-referenced City of ' +
            'Sydney approvals fell outside every storey polygon (`onlineda-crossref.json`).';
    } else if (storeyCoverage === 'not-queried') {
        explanation =
            'The development-control-plan storey axis was NOT QUERIED for this parcel. ⛔ That is a ' +
            'different answer from "no storey control applies", and it must not be rendered as one.';
    } else if (metres === null && storeyBinds) {
        explanation =
            `No metric height was resolved, and the development control plan states ` +
            `${describeNswStoreyLimit(storeys!)}. A storey count alone does not produce a volume; ` +
            'it constrains one.';
    } else {
        explanation = 'Neither axis carries a limit that could be resolved from the sources read.';
    }

    return { metres, storeys, storeyCoverage, dcpName, bothAxesBind, explanation };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// SETBACKS — the value is INSIDE the type string, and the types are not one control
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Measured `SetbackType` vocabulary, layers 3 (28 strings / 311 polygons) and 12 (22 / 133).
// The distance is in the string: `"6m Minimum setback"`, `"2.4m Setback - Footpath widening"`.
//
// ⛔ AND THE KINDS ARE NOT INTERCHANGEABLE — THIS IS WHERE A REGEX OVER THE NUMBER GOES WRONG.
// `"4m Build to alignment"` is a **build-to line**: an obligation to place the façade ON it, the
// opposite of a minimum setback. `"…Setback - Footpath widening"` is land to be given up for
// public footpath — an exclusion strip, the same shape as Murcia's 7 m cesión
// (§MURCIA-PGOU-EJES-IS-ROAD-AXIS). `"Landscape setback"` bars building but is a planting
// obligation. `"Upper level setback"` applies only above a level the string does not state.
// A reader that extracts `4` and calls it a setback has conflated four different controls.

/** What a `SetbackType` string actually requires. ⛔ Not a synonym set. */
export type NswSetbackKind =
    /** Façade must be at least this far back. The only one that is a plain minimum. */
    | 'minimum-setback'
    /** Applies only ABOVE some level, which the served string does not state. */
    | 'upper-level-setback'
    /** Building barred and the strip must be planted. */
    | 'landscape-setback'
    /** Land to be surrendered/kept clear for public footpath. An exclusion strip, not a setback. */
    | 'footpath-widening'
    /** ⛔ An OBLIGATION to build TO the line — the inverse of a setback. */
    | 'build-to-alignment'
    /** A named public-domain corridor of varying width. */
    | 'green-network'
    /** Recognised kind, and the width is stated as "varying" rather than as a number. */
    | 'varying-width'
    /** Not in the measured vocabulary. REFUSE. */
    | 'unknown';

export interface NswSetbackControl {
    readonly raw: string;
    readonly kind: NswSetbackKind;
    /** Metres, when the string states a number. `null` for every "varying width" string. */
    readonly distance_m: number | null;
    /** `true` when this control excludes building from the strip at ground level. */
    readonly barsBuildingAtGround: boolean;
    /** One sentence naming what this actually requires. */
    readonly note: string;
}

/**
 * Read one `SetbackType`. **Total.**
 *
 * The number is parsed only from the leading `<n>m` token, and only after the KIND is recognised
 * from the measured vocabulary — so an unrecognised string yields `unknown` with `distance_m` null
 * even when it contains a plausible-looking number.
 */
export function nswReadSetbackType(setbackType: string | null | undefined): NswSetbackControl {
    const raw = setbackType?.trim() ?? '';
    if (raw === '') {
        return {
            raw: '',
            kind: 'unknown',
            distance_m: null,
            barsBuildingAtGround: false,
            note: 'No SetbackType was served.',
        };
    }

    // ⛔ KIND FIRST. The number is meaningless until we know which control it belongs to.
    let kind: NswSetbackKind;
    let barsBuildingAtGround = true;
    let note: string;
    if (/build to alignment/i.test(raw)) {
        kind = 'build-to-alignment';
        barsBuildingAtGround = false;
        note =
            '⛔ A BUILD-TO ALIGNMENT, not a setback: the façade is required to sit ON this line. ' +
            'Reading it as a minimum setback inverts the control and shrinks the footprint by the ' +
            'stated distance on a site where the plan requires the opposite.';
    } else if (/footpath widening/i.test(raw)) {
        kind = 'footpath-widening';
        note =
            'Land kept clear for FOOTPATH WIDENING — an exclusion strip in the public interest, not ' +
            'a building setback. It reduces the developable area and the two are accounted ' +
            'differently (C63: the denominator is buildable land).';
    } else if (/liveable green network/i.test(raw)) {
        kind = 'green-network';
        note = 'A Liveable Green Network corridor. Width is stated as varying on most polygons.';
    } else if (/landscape setback/i.test(raw)) {
        kind = 'landscape-setback';
        note =
            'A LANDSCAPE setback: building is barred AND the strip carries a planting obligation. ' +
            'Satisfying the distance alone does not satisfy the control.';
    } else if (/upper level setback/i.test(raw)) {
        kind = 'upper-level-setback';
        barsBuildingAtGround = false;
        note =
            '⚠ An UPPER LEVEL setback — it applies only above some level, and the served string does ' +
            'NOT state which. It does not bar building at ground level. The trigger level lives in ' +
            'the DCP text and has not been read.';
    } else if (/(primary|side|active edge|minimum) setback/i.test(raw)) {
        kind = 'minimum-setback';
        note = 'A minimum setback from the named boundary. Building is barred within the strip.';
    } else {
        return {
            raw,
            kind: 'unknown',
            distance_m: null,
            barsBuildingAtGround: false,
            note:
                `${JSON.stringify(raw)} is not in the measured City of Sydney SetbackType vocabulary ` +
                '(50 strings across layers 3 and 12). Reported, not applied — extracting a number ' +
                'from an unrecognised control is the error this refusal exists to prevent.',
        };
    }

    if (/var(ying|\.)\s*width|varying width/i.test(raw)) {
        return { raw, kind: 'varying-width', distance_m: null, barsBuildingAtGround, note: `${note} Width stated as VARYING; no number is served.` };
    }
    const m = /^(\d+(?:\.\d+)?)\s*m\b/i.exec(raw);
    const num = m?.[1];
    const distance_m = num === undefined ? null : Number(num);
    return {
        raw,
        kind,
        distance_m: Number.isFinite(distance_m ?? Number.NaN) ? distance_m : null,
        barsBuildingAtGround,
        note:
            distance_m === null
                ? `${note} ⚠ No leading "<n>m" token, so no distance is served on this string.`
                : note,
    };
}

/**
 * ⭐ THE MEASURED VOCABULARY, ENUMERATED, so a coverage test can assert that the reader recognises
 * every string the service actually serves — the property that "50 strings, all handled" claims.
 * Source: `phase0-transcripts/sydney-dcp-vocab.json`, layers 3 and 12, live 2026-09-04.
 */
export const NSW_SYDNEY_DCP_SETBACK_VOCABULARY: readonly string[] = Object.freeze([
    // layer 3 — 28 strings, 311 polygons
    '6m Minimum setback',
    '4m Upper level setback',
    '3m Landscape setback',
    '2m Landscape setback',
    '3m Upper level setback',
    '1.5m Primary setback',
    '3m Primary setback',
    '6m Upper level setback',
    '4m Landscape setback',
    '2m Upper level setback',
    '4m Build to alignment',
    '6m Landscape setback',
    '5m Landscape setback',
    '1.5m Landscape setback',
    '1m Upper level setback',
    '3m Active edge setback',
    '3m Side setback',
    '10m Upper level setback',
    '12m Landscape setback',
    '12m Upper level setback',
    '2.5m Primary setback',
    '4m Primary setback',
    '7m Landscape setback',
    '8m Upper level setback',
    '10m Landscape setback',
    '2.5m Landscape setback',
    '5m Upper level setback',
    'Landscape setback varying width',
    // layer 12 — 22 strings, 133 polygons
    '1.4m Setback - Footpath widening',
    '2.4m Setback - Footpath widening',
    '3m Setback - Footpath widening',
    '10m Landscape setback',
    'Liveable Green Network var. width',
    '2m Setback - Footpath widening',
    '1.2m Setback - Footpath widening',
    '4m Setback - Footpath widening',
    '6.4m Footpath widening / Landscape setback',
    'Footpath widening varying width',
    '0.5m Setback - Footpath widening',
    '1.5m Setback - Footpath widening',
    '10m Setback - Liveable Green Network',
    '2m Footpath widening / Landscape setback',
    '12.5m Landscape setback',
    '1m Setback - Footpath widening',
    '2.9m Setback - Footpath widening',
    '3.2m Setback - Footpath widening',
    '6m Setback - Footpath widening',
]);

/**
 * The measured `Storeys` vocabulary, layers 7 and 5. Same purpose as the setback list: a coverage
 * test that fails when the service starts serving something the reader has never seen.
 */
export const NSW_SYDNEY_DCP_STOREY_VOCABULARY: readonly (string | null)[] = Object.freeze([
    '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15',
    '>15',
    'Existing height',
    null,
]);
