// C108 §3.4 / SPEC S9 (brief §7) — zones, bays and the cell lattice.
//
// ⛔ GEOMETRIC, NOT SEMANTIC. Brief §7 spells the required output out — `zone 0:
// y = 0.00 -> 0.20` — and forbids the labels: no "ground floor", no "upper floors",
// no "parapet". Those are readings a human makes of a geometry; this stage produces
// the geometry.
//
// ⭐ THE BOUNDARY SET IS THE UNION OF (comb teeth) AND (periodicity breaks), and
// that union is the whole reason the pipeline never needs a ground-floor rule. The
// comb gives the regular storey rhythm; the BREAK gives the place where that rhythm
// stops holding — which, on a building with an arcade at street level, is exactly
// the ground-floor boundary. It was discovered, not assumed (brief §22).

import type { CombFit } from '../periodicity/comb.js';

/**
 * Boundary positions along one axis, in samples, always including 0 and `extent`.
 *
 * Boundaries closer together than `minSeparation` are merged — a comb tooth landing
 * one pixel from a detected break is the same boundary seen twice, and emitting
 * both would mint a zero-height zone that every later stage then has to defend
 * against.
 */
export function boundaries(
    extent: number,
    fit: CombFit | null,
    breaks: readonly number[],
    minSeparation: number,
): number[] {
    const raw: number[] = [0, extent];
    if (fit !== null && fit.period > 0) {
        // ⭐ `latticePhase`, NOT `phase` — see CombFit's own note. The structure comb
        // sits on the repeated FEATURE (a window edge); the lattice sits in the quiet
        // gap BETWEEN cells. Using the former here shifts every cell by half a window.
        for (let p = fit.latticePhase; p < extent; p += fit.period) {
            const i = Math.round(p);
            if (i > 0 && i < extent) raw.push(i);
        }
    }
    for (const b of breaks) {
        if (b > 0 && b < extent) raw.push(Math.round(b));
    }
    raw.sort((a, b) => a - b);

    const merged: number[] = [];
    for (const v of raw) {
        if (merged.length === 0 || v - merged[merged.length - 1]! >= minSeparation) merged.push(v);
        else merged[merged.length - 1] = Math.min(merged[merged.length - 1]!, v);
    }
    if (merged[0] !== 0) merged.unshift(0);
    if (merged[merged.length - 1] !== extent) merged.push(extent);

    // ⭐ TRIM THE PHASE SLIVERS. The comb locks onto the strongest phase, which for
    // a facade is a window edge rather than a storey boundary — so the first and
    // last bands are routinely a fraction of a period long. Those are not zones,
    // they are the EDGE of one, and emitting them adds an empty row and an empty
    // column to every lattice.
    //
    // Keyed on the MEASURED period, never on a count: this is not "drop the first
    // zone", it is "a band that cannot contain half a period is not a band".
    if (fit !== null && fit.period > 0 && merged.length > 2) {
        const half = fit.period * 0.5;
        if (merged[1]! - merged[0]! < half) merged.splice(1, 1);
    }
    if (fit !== null && fit.period > 0 && merged.length > 2) {
        const half = fit.period * 0.5;
        const last = merged.length - 1;
        if (merged[last]! - merged[last - 1]! < half) merged.splice(last - 1, 1);
    }
    return merged;
}

export interface Band {
    /** Start in samples, inclusive. */
    readonly from: number;
    /** End in samples, exclusive. */
    readonly to: number;
}

/** Consecutive boundary pairs as bands. Zero-height bands are dropped. */
export function bandsFromBoundaries(bounds: readonly number[]): Band[] {
    const out: Band[] = [];
    for (let i = 0; i + 1 < bounds.length; i++) {
        const from = bounds[i]!;
        const to = bounds[i + 1]!;
        if (to > from) out.push({ from, to });
    }
    return out;
}

/**
 * Map an image-space row band to the facade's NORMALIZED coordinates.
 *
 * ⚠ THE Y FLIP HAPPENS HERE, AND ONLY HERE (C108 §2.1, brief §5). Image rows count
 * DOWN from the top; facade `Y` counts UP from the bottom. Every other stage works
 * in image space, so there is exactly one place to get this wrong, and it is
 * this function.
 */
export function bandToNormalizedY(band: Band, imageHeight: number): { y: number; height: number } {
    const height = (band.to - band.from) / imageHeight;
    const y = 1 - band.to / imageHeight;
    return { y: Math.max(0, Math.min(1, y)), height: Math.max(0, Math.min(1, height)) };
}

/** Map an image-space column band to normalized X. No flip — X agrees already. */
export function bandToNormalizedX(band: Band, imageWidth: number): { x: number; width: number } {
    return {
        x: Math.max(0, Math.min(1, band.from / imageWidth)),
        width: Math.max(0, Math.min(1, (band.to - band.from) / imageWidth)),
    };
}
