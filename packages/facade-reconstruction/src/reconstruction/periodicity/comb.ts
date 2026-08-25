// C108 §3.5 / SPEC S7-S10 (brief §7, §14) — profiles, periodicity, breaks, symmetry.
//
// ⭐ THIS IS THE FILE THAT MAKES BRIEF §22 MECHANICAL RATHER THAN ASPIRATIONAL.
//
// §22 names the failure exactly: `if (fiveFloors)`, `if (archedGroundFloor)`. A rule
// saying "don't do that" is worth very little. What is worth a lot is that there is
// nowhere in this pipeline for such a constant to LIVE:
//
//   • the floor count is `round(extent / period)` from a phase-locked comb fit;
//   • the ground-floor zone is a BREAK the comb-fit score finds;
//   • the symmetry axis is an argmax of a cross-correlation, and a LOW score is
//     reported as low rather than snapped to the middle.
//
// Nothing here knows what a floor, a ground floor or a bay is. It knows about
// signals with periods, and about where those periods stop holding.

import type { ProfileDiagnostic } from '../../contracts/Diagnostics.js';
import type { FacadeReconstructionOptions } from '../../contracts/Options.js';
import type { GrayImage } from '../../contracts/RasterImage.js';
import { sobel } from '../preprocess/filters.js';

/**
 * Row and column projection profiles of gradient energy.
 *
 * The ROW profile sums `|gy|` — vertical gradient, which is what a horizontal
 * floor/slab line produces. The COLUMN profile sums `|gx|`. Using the matching
 * component (rather than the magnitude) is what stops a strong vertical edge from
 * voting in the horizontal profile and inventing a floor line.
 */
export function projectionProfiles(gray: GrayImage): { rows: number[]; cols: number[] } {
    const g = sobel(gray);
    const rows = new Array<number>(gray.height).fill(0);
    const cols = new Array<number>(gray.width).fill(0);
    for (let y = 0; y < gray.height; y++) {
        for (let x = 0; x < gray.width; x++) {
            const i = y * gray.width + x;
            rows[y] = rows[y]! + Math.abs(g.gy[i]!);
            cols[x] = cols[x]! + Math.abs(g.gx[i]!);
        }
    }
    return { rows, cols };
}

/** Scale a profile into [0,1]. A flat profile becomes all-zero, not all-one. */
export function normalizeProfile(profile: readonly number[]): number[] {
    let min = Infinity;
    let max = -Infinity;
    for (const v of profile) {
        if (v < min) min = v;
        if (v > max) max = v;
    }
    const range = max - min;
    if (!(range > 0)) return profile.map(() => 0);
    return profile.map((v) => (v - min) / range);
}

/**
 * Normalised autocorrelation of a mean-removed signal, for lags `0..n/2`.
 *
 * Mean removal matters: without it every signal correlates strongly with itself at
 * every lag (the DC term dominates) and the "period" found is whatever the window
 * length happens to be.
 */
export function autocorrelation(signal: readonly number[]): number[] {
    const n = signal.length;
    if (n < 4) return [];
    const mu = signal.reduce((a, b) => a + b, 0) / n;
    const centred = signal.map((v) => v - mu);
    let denom = 0;
    for (const v of centred) denom += v * v;
    if (!(denom > 0)) return new Array<number>(Math.floor(n / 2)).fill(0);
    const maxLag = Math.floor(n / 2);
    const out = new Array<number>(maxLag).fill(0);
    for (let lag = 0; lag < maxLag; lag++) {
        let s = 0;
        for (let i = 0; i + lag < n; i++) s += centred[i]! * centred[i + lag]!;
        out[lag] = s / denom;
    }
    return out;
}

/** Peaks by prominence against the profile's own range, with a min separation. */
export function findPeaks(
    profile: readonly number[],
    opts: FacadeReconstructionOptions,
): number[] {
    const n = profile.length;
    if (n < 3) return [];
    const norm = normalizeProfile(profile);
    const minSep = Math.max(1, Math.round(n * opts.minPeakSeparationFraction));
    const candidates: { index: number; value: number }[] = [];
    for (let i = 1; i < n - 1; i++) {
        if (norm[i]! >= norm[i - 1]! && norm[i]! > norm[i + 1]! && norm[i]! >= opts.minPeakProminence) {
            candidates.push({ index: i, value: norm[i]! });
        }
    }
    // Greedy NMS by descending value; ties by ascending index so the result is a
    // total order and never depends on sort stability.
    candidates.sort((a, b) => b.value - a.value || a.index - b.index);
    const kept: number[] = [];
    for (const c of candidates) {
        if (kept.every((k) => Math.abs(k - c.index) >= minSep)) kept.push(c.index);
    }
    return kept.sort((a, b) => a - b);
}

export interface CombFit {
    /** Period in samples. */
    readonly period: number;
    /**
     * Phase in samples of the STRUCTURE comb — the offset that maximises energy on
     * the teeth. This is where the repeated FEATURE sits (a window edge), and it is
     * what break detection asks about.
     */
    readonly phase: number;
    /**
     * ⭐ Phase in samples of the LATTICE — the offset that MINIMISES energy on the
     * teeth. This is where the cell BOUNDARY sits, and it is a different number.
     *
     * The corpus is what forced these apart. A window contributes TWO profile peaks
     * per cell, at its left and right edges, so a comb at the true period locks onto
     * one of them — never onto the boundary between cells, which is in the middle of
     * the WALL GAP where the profile is quiet. Using the structure phase as the
     * lattice offset produced cells shifted by half a window: the first and last
     * bands came out 81 and 123 samples wide against a period of 102, and every
     * opening-to-cell size ratio was wrong by up to 27%.
     *
     * "A cell boundary is where nothing happens" is the whole idea, and it needs no
     * knowledge of window widths, gaps or building types (brief §22).
     */
    readonly latticePhase: number;
    /** Fit score in [0,1]: how much better the teeth are than the average sample. */
    readonly fit: number;
    /** Number of whole repeats across the extent. */
    readonly repeats: number;
}

/**
 * Score one (period, phase) comb against a normalised profile.
 *
 * The score is the mean profile value AT the teeth divided by the mean everywhere,
 * squashed into [0,1]. A ratio rather than a raw sum, because a raw sum rewards
 * short periods (more teeth) and would always pick the smallest period allowed.
 */
function scoreComb(norm: readonly number[], period: number, phase: number): number {
    const n = norm.length;
    let toothSum = 0;
    let toothCount = 0;
    for (let p = phase; p < n; p += period) {
        const i = Math.round(p);
        if (i < 0 || i >= n) continue;
        // A one-sample tooth is brittle against sub-pixel period error; take the
        // local max over +/-1 so a half-sample drift does not collapse the score.
        toothSum += Math.max(norm[Math.max(0, i - 1)]!, norm[i]!, norm[Math.min(n - 1, i + 1)]!);
        toothCount++;
    }
    if (toothCount < 2) return 0;
    const all = norm.reduce((a, b) => a + b, 0) / n;
    if (!(all > 0)) return 0;
    const ratio = toothSum / toothCount / all;
    // ⚠ MONOTONE AND UNSATURATED, and that matters more than it looks.
    //
    // An earlier revision returned `min(1, (ratio-1)/2)`, which SATURATES at 1 for
    // any ratio >= 3. Every strong comb then scored exactly 1.0, the comparison
    // between periods became a tie, and the tie-break decided the answer — so the
    // pipeline reported TWO storeys on a four-storey facade because 2 was the
    // longer period among equals. A score that cannot distinguish its own inputs
    // hands the decision to whatever breaks the tie, silently.
    //
    // `(ratio-1)/(ratio+1)` is 0 when the teeth are no better than average, and
    // approaches 1 without ever reaching it.
    return Math.max(0, (ratio - 1) / (ratio + 1));
}

/**
 * Fit a periodic comb to a profile: autocorrelation for the candidate period,
 * exhaustive phase grid, then parabolic refinement of the period.
 *
 * ⛔ Deterministic throughout — a fixed grid, no random restarts, no RANSAC
 * (C108 §5.2). Returns `null` when NO period is supported, which is a real answer:
 * a facade with three irregular openings has no period, and inventing one for it is
 * exactly the fabrication this subsystem refuses.
 */
export function fitComb(
    profile: readonly number[],
    opts: FacadeReconstructionOptions,
): CombFit | null {
    const n = profile.length;
    if (n < 8) return null;
    const norm = normalizeProfile(profile);
    const ac = autocorrelation(norm);
    if (ac.length === 0) return null;

    const minP = Math.max(2, Math.round(n * opts.minPeriodFraction));
    const maxP = Math.min(ac.length - 1, Math.round(n * opts.maxPeriodFraction));
    if (maxP <= minP) return null;

    // Candidate periods: every local maximum of the autocorrelation in range. Taking
    // ALL of them and re-scoring with the comb (rather than trusting the single
    // largest autocorrelation peak) is what makes case G — a grid with MISSING
    // windows — work: the gaps depress the autocorrelation without moving the comb.
    const candidates: number[] = [];
    for (let lag = minP; lag <= maxP; lag++) {
        if (ac[lag]! > ac[lag - 1]! && ac[lag]! >= ac[Math.min(ac.length - 1, lag + 1)]!) {
            candidates.push(lag);
        }
    }
    if (candidates.length === 0) {
        for (let lag = minP; lag <= maxP; lag++) candidates.push(lag);
    }

    // Score every (period, phase) on the grid, then choose in TWO steps.
    const scored: { period: number; phase: number; fit: number }[] = [];
    for (const period of candidates) {
        let bestPhase = 0;
        let bestPhaseFit = -Infinity;
        for (let s = 0; s < opts.combPhaseSteps; s++) {
            const phase = (s / opts.combPhaseSteps) * period;
            const fit = scoreComb(norm, period, phase);
            // Tie-break on the SMALLER phase, so the choice is a total order.
            if (fit > bestPhaseFit) {
                bestPhaseFit = fit;
                bestPhase = phase;
            }
        }
        scored.push({ period, phase: bestPhase, fit: bestPhaseFit });
    }
    if (scored.length === 0) return null;

    // ⭐ STEP 2 — AMONG NEAR-EQUAL FITS, TAKE THE SHORTEST PERIOD: THE FUNDAMENTAL.
    //
    // A comb at 2x the true period hits half the teeth and scores IDENTICALLY on a
    // mean-based measure — there is no information in the score to separate them.
    // Preferring the longer one reports half the storeys; preferring the shorter
    // one is the standard fundamental-frequency choice and is safe here because a
    // SUB-harmonic (half the true period) lands between real teeth and scores
    // strictly worse, so it never wins the 5% band.
    const bestFit = Math.max(...scored.map((s) => s.fit));
    if (!(bestFit > 0)) return null;
    const nearBest = scored.filter((s) => s.fit >= bestFit * 0.95);
    nearBest.sort((a, b) => a.period - b.period || a.phase - b.phase);
    const best = nearBest[0]!;

    // Parabolic refinement of the period around the winner, at its own phase.
    const p = best.period;
    const f0 = scoreComb(norm, p - 1, best.phase);
    const f1 = best.fit;
    const f2 = scoreComb(norm, p + 1, best.phase);
    const denom = f0 - 2 * f1 + f2;
    const refined = Math.abs(denom) > 1e-9 ? p + (0.5 * (f0 - f2)) / denom : p;
    const period = Math.max(minP, Math.min(maxP, refined));

    // The lattice phase: the same grid search, minimised instead of maximised.
    let latticePhase = 0;
    let quietest = Infinity;
    for (let s = 0; s < opts.combPhaseSteps; s++) {
        const phase = (s / opts.combPhaseSteps) * period;
        const energy = scoreComb(norm, period, phase);
        if (energy < quietest) {
            quietest = energy;
            latticePhase = phase;
        }
    }

    return {
        period,
        phase: best.phase,
        latticePhase,
        fit: best.fit,
        repeats: Math.max(1, Math.round(n / period)),
    };
}

/**
 * Where the comb STOPS holding (brief §14: *"detect breaks in periodicity"*).
 *
 * ⭐ This is how the ground-floor zone is DISCOVERED rather than assumed, and it is
 * the single most important consequence of the whole periodicity design: a facade
 * whose ground level is an arcade has a window comb that simply fails there. The
 * pipeline learns the zone boundary from the failure. It never needed to know that
 * ground floors are different.
 */
export function detectBreaks(
    profile: readonly number[],
    fit: CombFit,
    opts: FacadeReconstructionOptions,
): number[] {
    const n = profile.length;
    const norm = normalizeProfile(profile);
    if (!(fit.period > 0)) return [];

    // ── PER-TOOTH SUPPORT, NOT A SLIDING RE-FIT ─────────────────────────────
    // ⚠ An earlier revision re-scored the comb inside a sliding window. The corpus
    // falsified it immediately: a window two periods wide contains only two teeth,
    // `scoreComb` refuses to score fewer than two, and a phase landing on a window
    // edge dropped it to one — so the score collapsed to zero and a PERFECTLY
    // REGULAR grid reported a break in its own middle. The detector was measuring
    // its own window arithmetic, not the facade.
    //
    // Asking each tooth whether the profile actually supports it has no such
    // artefact, needs no window width, and localises the break to the tooth rather
    // than to a smear the width of the window.
    const teeth: { at: number; value: number }[] = [];
    for (let p = fit.phase; p < n; p += fit.period) {
        const i = Math.round(p);
        if (i < 0 || i >= n) continue;
        teeth.push({
            at: i,
            value: Math.max(norm[Math.max(0, i - 1)]!, norm[i]!, norm[Math.min(n - 1, i + 1)]!),
        });
    }
    if (teeth.length < 3) return [];

    const sorted = teeth.map((t) => t.value).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    if (!(median > 0)) return [];

    // ⭐ A MISS IS RELATIVE TO THE OTHER TEETH, and that is what makes case G work:
    // three windows missing out of twenty depresses each affected row's peak by a
    // fifth, not to zero, so no tooth reads as a miss and the grid keeps its period.
    // A whole storey that is not part of the rhythm reads as a miss immediately.
    const breaks: number[] = [];
    for (const t of teeth) {
        if (t.value < median * opts.breakDropRatio) breaks.push(t.at);
    }
    return breaks;
}

/** Build the diagnostic record for one profile (brief §18). */
export function profileDiagnostic(
    profile: readonly number[],
    opts: FacadeReconstructionOptions,
): ProfileDiagnostic {
    const norm = normalizeProfile(profile);
    const fit = fitComb(profile, opts);
    return {
        profile: norm,
        autocorrelation: autocorrelation(norm),
        peaks: findPeaks(profile, opts),
        period: fit?.period ?? null,
        phase: fit?.phase ?? null,
        fit: fit?.fit ?? null,
        breaks: fit === null ? [] : detectBreaks(profile, fit, opts),
    };
}

export interface SymmetryResult {
    /** Axis position in samples, or `null` when no axis was supported. */
    readonly axis: number | null;
    /** Normalised cross-correlation score in [0,1], or `null`. */
    readonly score: number | null;
}

/**
 * Measure mirror symmetry of a profile (brief §7).
 *
 * ⛔ THE BRIEF'S HYPOTHESIS IS A HYPOTHESIS. §7 says the facade *appears*
 * symmetrical about a central element and then says, in as many words, **"test
 * whether this is statistically supported"** and **"measure the symmetry"**. So a
 * low score is REPORTED as low, `axis` is never defaulted to the middle, and an
 * asymmetric facade gets an honest answer rather than a flattering one.
 */
export function measureSymmetry(profile: readonly number[]): SymmetryResult {
    const n = profile.length;
    if (n < 8) return { axis: null, score: null };
    const norm = normalizeProfile(profile);
    const mu = norm.reduce((a, b) => a + b, 0) / n;
    const centred = norm.map((v) => v - mu);

    let bestAxis = -1;
    let bestScore = -Infinity;
    // Only axes with at least a quarter of the profile on each side: a "symmetry
    // axis" at sample 3 of 400 is an arithmetic artefact, not a facade feature.
    const lo = Math.floor(n * 0.25);
    const hi = Math.ceil(n * 0.75);
    for (let axis = lo; axis <= hi; axis++) {
        const reach = Math.min(axis, n - 1 - axis);
        if (reach < n * 0.2) continue;
        let num = 0;
        let dl = 0;
        let dr = 0;
        for (let d = 1; d <= reach; d++) {
            const l = centred[axis - d]!;
            const r = centred[axis + d]!;
            num += l * r;
            dl += l * l;
            dr += r * r;
        }
        const denom = Math.sqrt(dl * dr);
        if (!(denom > 0)) continue;
        const score = num / denom;
        if (score > bestScore || (score === bestScore && axis < bestAxis)) {
            bestScore = score;
            bestAxis = axis;
        }
    }
    if (bestAxis < 0 || !Number.isFinite(bestScore)) return { axis: null, score: null };
    // Map correlation [-1,1] to [0,1]; a perfectly anti-symmetric profile scores 0,
    // which is the honest reading of "no mirror symmetry here".
    return { axis: bestAxis, score: Math.max(0, Math.min(1, (bestScore + 1) / 2)) };
}
