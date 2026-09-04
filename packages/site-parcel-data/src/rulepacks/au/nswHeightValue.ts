// §NSW-UNITS — three meanings of one number, kept as three TYPES.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE ERROR THIS FILE EXISTS TO MAKE UNREPRESENTABLE
// ══════════════════════════════════════════════════════════════════════════════════════════════
// NSW `Height of Buildings` (Principal/14) serves `MAX_B_H` alongside a `UNITS` domain:
//
//   `m`      — metres ABOVE EXISTING GROUND LEVEL (a height).
//   `m(RL)`  — an ABSOLUTE AHD elevation, a "Reduced Level" (a level, not a height).
//   `NA`     — there is NO numeric control. REFUSE. Never default, never treat as unbounded.
//
// Collapsing `m` and `m(RL)` into one nullable number yields a perfectly well-formed building that
// is wrong by the site's elevation — **fifty metres in parts of Sydney** (build prompt §6). The
// two are not convertible without terrain, and a solver that adds terrain to an `m(RL)` value
// makes the same error twice.
//
// Measured incidence (PHASE0-REPORT §M3.1): across a uniform random sample of 2,000 NSW parcels,
// HOB `UNITS` read `m` 1,212 times and **`m(RL)` once**. ~0.08% state-wide — and concentrated in
// CBDs, where a fifty-metre error is worth the most money. A 1-in-1,200 case that a type system
// can eliminate for free is exactly the case a type system should eliminate: it will never be
// caught by eyeballing output.
//
// Floor Height Restriction (Local Provisions/469) values are ALSO absolute levels — measured
// `LAY_CLASS` values 40.9 / 41.2 / 41.5 / 41.8 / 42.1 / 42.4 / 42.7 / 64.1, all SINGLETON, a
// flood-prone Hunter Valley town: these are flood planning levels in AHD, not building heights.
//
// ⛔ HANDOFF, NOT A LOCAL DECISION. `packages/schemas/src/site/HeightDatum.ts` (ADR-0377) already
// models absolute-vs-relative correctly, but its `AbsoluteVerticalFrameSchema` is
// `z.enum(['NGF', 'NHN', 'EH2000'])` — **`'AHD'` is not a member**, and that file is owned by the
// ENVELOPE-FR lane. This module therefore carries its own narrow `'AHD'` literal and REFUSES
// cross-datum arithmetic locally, rather than minting a rival frame vocabulary or editing another
// lane's file. When `'AHD'` is appended upstream (append-only + ADR, per that file's own
// discipline), `NswAbsoluteLevel.frame` should become the shared type. Recorded so the seam is
// visible instead of quietly permanent.
//
// P5-adjacent purity: pure total functions, no I/O, no clock, no RNG.
// Contracts: C58 §1.4 (refuse rather than fabricate), C62/C75 (provenance), ADR-0377.

/** The vertical datum NSW measures relative heights from. Standard Instrument dictionary term. */
export const NSW_RELATIVE_DATUM = 'existing_ground_level' as const;

/**
 * ⚠ `existing ground level` is NOT `natural ground level`. The Standard Instrument defines height
 * from EXISTING ground level, which on a site with prior earthworks (cut, fill, a demolished
 * basement) differs materially from the natural surface. A LiDAR-derived terrain model samples the
 * EXISTING surface, which is the correct one — but only if the survey postdates the earthworks.
 * Recorded because "we used terrain" is not the same claim as "we used the legally correct datum".
 */
export const NSW_RELATIVE_DATUM_NOTE =
    'Standard Instrument: height is measured from EXISTING ground level, which is not natural ground level after earthworks.';

/** A height measured upward from existing ground level. Needs terrain to become an elevation. */
export interface NswHeightAboveGround {
    readonly kind: 'height_above_ground';
    readonly value_m: number;
    readonly datum: typeof NSW_RELATIVE_DATUM;
}

/** An absolute elevation in the Australian Height Datum. ALREADY absolute — never add terrain. */
export interface NswAbsoluteLevel {
    readonly kind: 'absolute_level';
    readonly value_m_AHD: number;
    /** Local literal pending `'AHD'` being appended to the shared frame enum — see file header. */
    readonly frame: 'AHD';
}

/** `UNITS = 'NA'`: the map carries a polygon but states no numeric control. REFUSE, never default. */
export interface NswNoNumericControl {
    readonly kind: 'no_numeric_control';
    readonly reason: string;
}

/** The units string was absent or not one we have OBSERVED. Refuse; do not assume metres. */
export interface NswUninterpretableHeight {
    readonly kind: 'uninterpretable';
    readonly rawValue: number | null;
    readonly rawUnits: string | null;
    readonly reason: string;
}

export type NswHeightValue =
    | NswHeightAboveGround
    | NswAbsoluteLevel
    | NswNoNumericControl
    | NswUninterpretableHeight;

/** The `UNITS` domain values OBSERVED live. Anything else is `uninterpretable`, never assumed. */
export const NSW_OBSERVED_UNITS: readonly string[] = Object.freeze(['m', 'm(RL)', 'NA']);

/**
 * Type a raw NSW height reading. **Total** — every input maps to a member, and the failure members
 * carry the raw input so a caller can say what it saw.
 *
 * ⛔ There is deliberately NO default branch to metres. An unrecognised `UNITS` value is
 * `uninterpretable`, because assuming metres for an unknown domain member is precisely the
 * fifty-metre error in a different disguise.
 */
export function parseNswHeight(value: number | null, units: string | null): NswHeightValue {
    const u = units === null ? null : units.trim();

    if (u === 'NA') {
        return {
            kind: 'no_numeric_control',
            reason: "NSW HOB UNITS='NA': the polygon applies but states no numeric height control.",
        };
    }
    if (value === null || !Number.isFinite(value)) {
        return {
            kind: 'uninterpretable',
            rawValue: value,
            rawUnits: u,
            reason: 'No finite numeric height value was served.',
        };
    }
    if (u === 'm') {
        return { kind: 'height_above_ground', value_m: value, datum: NSW_RELATIVE_DATUM };
    }
    if (u === 'm(RL)') {
        return { kind: 'absolute_level', value_m_AHD: value, frame: 'AHD' };
    }
    return {
        kind: 'uninterpretable',
        rawValue: value,
        rawUnits: u,
        reason:
            u === null
                ? 'No UNITS value was served; NSW heights are not assumed to be metres.'
                : `Unrecognised UNITS value ${JSON.stringify(u)}; not in the observed domain ${NSW_OBSERVED_UNITS.join(' | ')}.`,
    };
}

/**
 * Floor Height Restriction (Local Provisions/469) and any other layer whose `LAY_CLASS` IS the
 * level. These are ALWAYS absolute AHD levels — the layer has no `UNITS` column to disambiguate,
 * and the measured values (40.9…64.1 in Singleton) are flood planning levels.
 *
 * Kept a separate constructor rather than a `parseNswHeight(v, 'm(RL)')` call so that the
 * "this layer is absolute BY LAYER, not by an attribute" fact is stated once, in code, at the only
 * place that knows it.
 */
export function nswAbsoluteLevelFromLayClass(value: number | null): NswHeightValue {
    if (value === null || !Number.isFinite(value)) {
        return {
            kind: 'uninterpretable',
            rawValue: value,
            rawUnits: null,
            reason: 'Floor Height Restriction LAY_CLASS did not parse as a finite level.',
        };
    }
    return { kind: 'absolute_level', value_m_AHD: value, frame: 'AHD' };
}

/** True only for the two members that carry a usable number. */
export function isNumericHeight(h: NswHeightValue): h is NswHeightAboveGround | NswAbsoluteLevel {
    return h.kind === 'height_above_ground' || h.kind === 'absolute_level';
}

/**
 * Can these two readings be compared or intersected AT ALL without terrain?
 *
 * Only when both are the same kind. A relative height and an absolute level are **not comparable**
 * — deciding which is lower requires the site's ground elevation, and guessing it is the
 * fifty-metre error. Returns `false` rather than throwing so callers degrade to "vertically
 * unplaced" (build prompt §7) instead of crashing or, far worse, picking one.
 */
export function areHeightsComparable(a: NswHeightValue, b: NswHeightValue): boolean {
    if (!isNumericHeight(a) || !isNumericHeight(b)) return false;
    return a.kind === b.kind;
}

/** Human-readable, unit-bearing rendering. Never bare — a number without its datum is the bug. */
export function describeNswHeight(h: NswHeightValue): string {
    switch (h.kind) {
        case 'height_above_ground':
            return `${h.value_m} m above existing ground level`;
        case 'absolute_level':
            return `RL ${h.value_m_AHD} m AHD (absolute)`;
        case 'no_numeric_control':
            return 'no numeric height control (UNITS=NA)';
        case 'uninterpretable':
            return `uninterpretable height (${h.reason})`;
    }
}
