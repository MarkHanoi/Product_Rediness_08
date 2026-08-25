// C108 §3.1 (brief §1) — isolate the photograph from screenshot chrome.
//
// ── THE CORRECTION THIS STAGE CARRIES ────────────────────────────────────────
// Brief §1 describes the input as a screenshot with a phone status bar, a LinkedIn
// header, post text and reaction buttons around the photograph. The image relayed
// to the orchestrator appeared to be a CLEAN, already-cropped photograph with no UI
// chrome at all. **Neither reading can be verified from this repository** (C108
// §0.2), so this stage is built for BOTH and is CAPPED.
//
// ── THREE REFUSALS, AND THE SECOND IS THE ONE THAT MATTERS ───────────────────
//  1. NO-OP on a clean photograph. Nothing qualifies ⇒ nothing is trimmed.
//  2. ⛔ CAPPED. Never more than `maxTrimFraction` from a side, never below
//     `minAreaFraction` of the area. A candidate that exceeds either is REFUSED and
//     the full frame is returned with `applied: false`.
//
//     A wrongly cropped building is not a degraded result — it is an UNRECOVERABLE
//     one. Every downstream stage then measures the wrong rectangle, confidently,
//     and the diagnostics all look perfectly reasonable.
//
//     ⚠ THE CAP MUST BE APPLIED AFTER DETECTION, NOT DURING IT. An earlier revision
//     stopped SCANNING at `maxTrimFraction`, which meant an over-trimming band was
//     silently truncated instead of detected — and the refusal branch became
//     UNREACHABLE. A gate that cannot fire is worse than no gate: it reads as a
//     guarantee in the contract and does nothing in the code. Corpus case K4 exists
//     to keep that branch reachable.
//
//  3. ⛔ SKY IS NOT CHROME, AND FLATNESS ALONE CANNOT TELL THEM APART.
//     A clear sky and a solid UI bar are both low-variance. Three further criteria
//     separate them, and ALL are required:
//       • BAND DRIFT — a UI bar's level is constant end to end; sky ramps.
//       • INTER-ROW DELTA — a UI bar's adjacent rows are identical; sky's are not.
//       • CHROMA + EXTREMENESS — UI chrome is NEUTRAL (white/near-black) and at an
//         extreme level; sky is a SATURATED blue at a mid level.
//     Without the third, a perfectly flat sky is indistinguishable from a white bar
//     by any local measurement, and the stage trims the top off every outdoor
//     photograph — silently and plausibly, which is the worst combination there is.
//
//     ⚠ ITS KNOWN LIMIT, STATED: a blown-out OVERCAST WHITE sky is neutral AND
//     extreme, and would read as chrome. The cap bounds the damage; L-11010 records
//     that the whole stage is proven against SYNTHETIC chrome only.
//
// Corpus: K1 (clean ⇒ 0 px), K2 (chrome ⇒ known inner rect), K3 (gradient sky
// survives), K4 (over-trim trap ⇒ REFUSED).

import type { GrayImage, RasterImage, Rect } from '../../contracts/RasterImage.js';
import type { FacadeReconstructionOptions } from '../../contracts/Options.js';
import { mean, variance } from '../preprocess/filters.js';

export interface CropResult {
    readonly rect: Rect;
    readonly applied: boolean;
    /** Non-null only when a CAP refused the crop — never when nothing qualified. */
    readonly refusedReason: string | null;
    readonly notes: readonly string[];
}

interface BandStats {
    /** Variance ALONG the line (is this line flat?). */
    readonly flatness: number;
    /** Mean absolute difference to the NEXT parallel line (is this a solid bar?). */
    readonly interLineDelta: number;
    /** Mean luma. */
    readonly level: number;
    /** Mean chroma in [0,1] — `(max-min)/max` over RGB. UI chrome is ~0. */
    readonly saturation: number;
}

function rowStats(gray: GrayImage, rgb: RasterImage, y: number): BandStats {
    const { width: w, height: h, data } = gray;
    const from = y * w;
    const nextY = Math.min(h - 1, y + 1);
    let delta = 0;
    let sat = 0;
    for (let x = 0; x < w; x++) {
        delta += Math.abs(data[from + x]! - data[nextY * w + x]!);
        const p = (y * w + x) * 4;
        const r = rgb.data[p]!;
        const g = rgb.data[p + 1]!;
        const b = rgb.data[p + 2]!;
        const mx = Math.max(r, g, b);
        sat += mx > 0 ? (mx - Math.min(r, g, b)) / mx : 0;
    }
    return {
        flatness: variance(data, from, from + w),
        interLineDelta: delta / w,
        level: mean(data, from, from + w),
        saturation: sat / w,
    };
}

function colStats(gray: GrayImage, rgb: RasterImage, x: number): BandStats {
    const { width: w, height: h, data } = gray;
    const col = new Float32Array(h);
    const nextX = Math.min(w - 1, x + 1);
    let delta = 0;
    let sat = 0;
    for (let y = 0; y < h; y++) {
        col[y] = data[y * w + x]!;
        delta += Math.abs(data[y * w + x]! - data[y * w + nextX]!);
        const p = (y * w + x) * 4;
        const r = rgb.data[p]!;
        const g = rgb.data[p + 1]!;
        const b = rgb.data[p + 2]!;
        const mx = Math.max(r, g, b);
        sat += mx > 0 ? (mx - Math.min(r, g, b)) / mx : 0;
    }
    return {
        flatness: variance(col),
        interLineDelta: delta / h,
        level: mean(col),
        saturation: sat / h,
    };
}

/** Is this single line chrome-like on its own terms? */
function lineIsChrome(s: BandStats, opts: FacadeReconstructionOptions): boolean {
    if (s.flatness > opts.chromeUniformityMax) return false;
    if (s.interLineDelta > opts.chromeInterRowMax) return false;
    if (s.saturation > opts.chromeSaturationMax) return false;
    return s.level >= opts.chromeLightMin || s.level <= opts.chromeDarkMax;
}

/**
 * Advance from one side while the lines read as a solid UI bar, then verify the
 * band terminates in a step. Returns the number of lines to trim — `0` when the
 * side is not chrome.
 *
 * ⛔ The scan is NOT capped here (see the header, refusal 2). Capping belongs to
 * the caller, so that an over-trimming band is DETECTED and refused rather than
 * quietly truncated into something that looks acceptable.
 */
function scanSide(
    lineCount: number,
    statsAt: (i: number) => BandStats,
    opts: FacadeReconstructionOptions,
): number {
    const limit = Math.floor(lineCount * 0.9);
    let i = 0;
    let firstLevel: number | null = null;
    while (i < limit && i < lineCount - 1) {
        const s = statsAt(i);
        if (!lineIsChrome(s, opts)) break;
        if (firstLevel === null) firstLevel = s.level;
        // BAND DRIFT: a UI bar does not ramp. Sky does.
        else if (Math.abs(s.level - firstLevel) > opts.chromeBandDriftMax) break;
        i++;
    }
    if (i === 0) return 0;

    // The band must TERMINATE in a step: chrome abuts content, it does not fade
    // into it. Compared across the boundary at `i` — the last two chrome lines
    // against the first two beyond them.
    const before = (statsAt(Math.max(0, i - 2)).level + statsAt(Math.max(0, i - 1)).level) / 2;
    const after =
        (statsAt(Math.min(lineCount - 1, i)).level + statsAt(Math.min(lineCount - 1, i + 1)).level) / 2;
    if (Math.abs(after - before) < opts.chromeStepMin) return 0;
    return i;
}

/**
 * Detect and (if the caps permit) apply the screenshot-chrome crop.
 *
 * ⛔ Never throws on a clean image and never returns an empty rect.
 */
export function detectChromeCrop(
    image: RasterImage,
    gray: GrayImage,
    opts: FacadeReconstructionOptions,
): CropResult {
    const { width: w, height: h } = gray;
    const full: Rect = { x0: 0, y0: 0, x1: w, y1: h };
    const notes: string[] = [];

    if (!opts.cropEnabled) {
        return { rect: full, applied: false, refusedReason: null, notes: ['crop: disabled by options'] };
    }

    const top = scanSide(h, (i) => rowStats(gray, image, i), opts);
    const bottom = scanSide(h, (i) => rowStats(gray, image, h - 1 - i), opts);
    const left = scanSide(w, (i) => colStats(gray, image, i), opts);
    const right = scanSide(w, (i) => colStats(gray, image, w - 1 - i), opts);

    if (top === 0 && bottom === 0 && left === 0 && right === 0) {
        // ⭐ Cases K1/K3: the no-op path. `refusedReason` stays null because nothing
        // was refused — nothing qualified, which is a different fact and a consumer
        // should be able to tell them apart.
        notes.push('crop: no chrome band qualified — frame used as given (brief §1, no-op path)');
        return { rect: full, applied: false, refusedReason: null, notes };
    }

    // ⛔ THE CAPS (case K4), applied AFTER detection so the refusal is reachable.
    const worst = Math.max(top / h, bottom / h, left / w, right / w);
    if (worst > opts.maxTrimFraction) {
        notes.push(
            `crop: REFUSED — a side would lose ${(worst * 100).toFixed(1)}% > cap ${(opts.maxTrimFraction * 100).toFixed(0)}% (C108 §3.1)`,
        );
        return { rect: full, applied: false, refusedReason: 'cap-exceeded', notes };
    }

    const rect: Rect = { x0: left, y0: top, x1: w - right, y1: h - bottom };
    const areaFrac = ((rect.x1 - rect.x0) * (rect.y1 - rect.y0)) / (w * h);
    if (areaFrac < opts.minAreaFraction) {
        notes.push(
            `crop: REFUSED — remaining area ${(areaFrac * 100).toFixed(1)}% < floor ${(opts.minAreaFraction * 100).toFixed(0)}% (C108 §3.1)`,
        );
        return { rect: full, applied: false, refusedReason: 'cap-exceeded', notes };
    }

    notes.push(`crop: applied t=${top} b=${bottom} l=${left} r=${right}`);
    return { rect, applied: true, refusedReason: null, notes };
}
