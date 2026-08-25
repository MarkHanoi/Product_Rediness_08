// C108 §6.1 (brief §19) — THE SYNTHETIC CORPUS. Ten facades, each with KNOWN
// GROUND TRUTH, plus four crop cases this lane added.
//
// ⛔ THIS IS THE ONLY THING THIS SUBSYSTEM HAS PROVEN. The founder's photograph is
// not in this repository (C108 §0.2, L-11001). Brief §19 asks for exactly this, and
// asks for it BEFORE the photograph is trusted:
//
//     "Before trusting the photograph, create synthetic facade tests … Every
//      synthetic input must have known ground truth."
//
// ⭐ AND IT IS THE ANTI-OVERFIT ENFORCEMENT (brief §22, C108 §9). A rule saying
// "do not tune to one image" is worth very little; TEN DIFFERENT FACADES that all
// have to pass is worth a great deal. A change that improves one and breaks another
// is visible in the same second.
//
// ── DETERMINISM ─────────────────────────────────────────────────────────────
// Case J needs noise. Noise does NOT mean `Math.random()` — C108 §5.2 bans it. A
// fixed-seed LCG is deterministic, reproducible and portable, so the "noisy" case
// is the same noise on every machine and every run, and a regression in it is a
// regression rather than a coin flip.

import type { Quad, RasterImage } from '../contracts/RasterImage.js';
import { createRasterImage } from '../contracts/RasterImage.js';
import {
    applyHomography,
    homographyFrom4,
    invert3,
} from '../reconstruction/rectification/homography.js';

// ── drawing primitives ───────────────────────────────────────────────────────

export interface Rgb {
    readonly r: number;
    readonly g: number;
    readonly b: number;
}

const WALL: Rgb = { r: 205, g: 200, b: 190 };
const OPENING: Rgb = { r: 38, g: 40, b: 46 };
// ⚠ THE SILHOUETTE CONTRAST IS A DELIBERATE PARAMETER OF THIS CORPUS, not a colour
// choice. Sky luma ~135 against wall luma ~200 is a 65-level step, while a window
// against that same wall is a 160-level step. So the FACADE OUTLINE is by far the
// weakest structurally-important edge in every one of these images — which is true
// of real facade photographs too, and is the reason `edgeHighPercentile` is 0.85
// rather than 0.90. At 0.90 the silhouette is discarded and the plane stage locks
// onto the outer WINDOW edges instead, losing 8% of the facade to every downstream
// measurement.
const SKY: Rgb = { r: 96, g: 140, b: 200 };
const SHADOW: Rgb = { r: 96, g: 94, b: 92 };
const CHROME: Rgb = { r: 250, g: 250, b: 250 };

function setPixel(img: RasterImage, x: number, y: number, c: Rgb): void {
    if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
    const p = (y * img.width + x) * 4;
    img.data[p] = c.r;
    img.data[p + 1] = c.g;
    img.data[p + 2] = c.b;
    img.data[p + 3] = 255;
}

function fillRect(img: RasterImage, x0: number, y0: number, x1: number, y1: number, c: Rgb): void {
    for (let y = Math.max(0, Math.round(y0)); y < Math.min(img.height, Math.round(y1)); y++) {
        for (let x = Math.max(0, Math.round(x0)); x < Math.min(img.width, Math.round(x1)); x++) {
            setPixel(img, x, y, c);
        }
    }
}

/**
 * Fill an opening whose head is a superellipse `|u|^n + |v|^n = 1`.
 *
 * `archRise` is the head height above the springing line. `archRise === 0` renders
 * a plain rectangle, which is the case-A/B/D/E/F/G/H opening.
 */
function fillOpening(
    img: RasterImage,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    archRise: number,
    n: number,
    c: Rgb,
): void {
    const w = x1 - x0;
    const halfW = w / 2;
    const cx = x0 + halfW;
    for (let x = Math.round(x0); x < Math.round(x1); x++) {
        let top = y0;
        if (archRise > 0 && halfW > 0) {
            const u = Math.min(1, Math.abs(x + 0.5 - cx) / halfW);
            const inner = 1 - Math.pow(u, n);
            const v = inner <= 0 ? 0 : Math.pow(inner, 1 / n);
            top = y0 + archRise * (1 - v);
        }
        for (let y = Math.round(top); y < Math.round(y1); y++) setPixel(img, x, y, c);
    }
}

/** A fixed-seed LCG. Deterministic by construction — see the header. */
function lcg(seed: number): () => number {
    let s = seed >>> 0;
    return (): number => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

// ── the corpus ───────────────────────────────────────────────────────────────

/**
 * What a case ASSERTS. Every field is a number known by construction, because the
 * generator drew it.
 *
 * ⛔ C108 §6.2: "no error thrown", "the array is non-empty" and "a facade was
 * produced" are NOT assertions and may not be added to this type.
 */
export interface GroundTruth {
    /** Number of vertical bays drawn. */
    readonly bays: number;
    /** Number of storeys drawn. */
    readonly storeys: number;
    /** Facade rect in SOURCE pixels — the quad the plane stage should recover. */
    readonly facadeRect: { x0: number; y0: number; x1: number; y1: number };
    /** Openings drawn, in source pixels. */
    readonly openings: readonly { x0: number; y0: number; x1: number; y1: number }[];
    /** `rise / halfWidth` of the drawn opening heads. 0 for rectangular. */
    readonly archness: number;
    /** Pixels the crop stage should trim from each side. All zero for a clean frame. */
    readonly chromeTrim: { top: number; bottom: number; left: number; right: number };
    /** Whether the crop is expected to REFUSE (C108 §3.1 caps). */
    readonly cropRefused: boolean;
    /** Number of drawn objects that must NOT become cells (features + outliers). */
    readonly nonGridObjects: number;
    /** Soffit band height in source pixels beneath each slab line; 0 = none drawn. */
    readonly soffitBandHeight: number;
    /** True when a curved-corner deformation was applied. */
    readonly curved: boolean;
    /** The DRAWN facade quad, when the case is not axis-aligned (case I). */
    readonly facadeQuad?: Quad;
}

export interface SyntheticCase {
    readonly id: string;
    readonly description: string;
    readonly image: RasterImage;
    readonly truth: GroundTruth;
}

/** Standard corpus geometry. One shape, so cases differ only in what they ADD. */
const W = 480;
const H = 360;
const FX0 = 40;
const FY0 = 30;
const FX1 = 440;
const FY1 = 330;
const BAYS = 5;
const STOREYS = 4;
const CELL_W = (FX1 - FX0) / BAYS; // 80
const CELL_H = (FY1 - FY0) / STOREYS; // 75

// ⚠ The opening is 60% of the cell, NOT 50%, and that is deliberate. At exactly
// half, an opening's two edges are EQUALLY spaced from cell to cell, so the true
// period is indistinguishable from its own first harmonic and the comb legitimately
// locks onto half a cell. A corpus that only contained that degenerate case would
// certify a period estimator that halves on real facades.
const OPEN_W = CELL_W * 0.6; // 48
const OPEN_H = CELL_H * 0.6; // 45

interface BuildSpec {
    readonly archRise?: number;
    readonly archN?: number;
    /** Cells to SKIP — case G. */
    readonly skip?: readonly { row: number; col: number }[];
    readonly noise?: number;
    readonly contrast?: number;
    readonly soffit?: number;
    readonly groundBreak?: boolean;
}

function openingRect(row: number, col: number): { x0: number; y0: number; x1: number; y1: number } {
    const cx = FX0 + CELL_W * (col + 0.5);
    const cy = FY0 + CELL_H * (row + 0.5);
    return { x0: cx - OPEN_W / 2, y0: cy - OPEN_H / 2, x1: cx + OPEN_W / 2, y1: cy + OPEN_H / 2 };
}

function buildBase(spec: BuildSpec): { image: RasterImage; openings: GroundTruth['openings'] } {
    const contrast = spec.contrast ?? 1;
    const mix = (c: Rgb): Rgb => ({
        r: 128 + (c.r - 128) * contrast,
        g: 128 + (c.g - 128) * contrast,
        b: 128 + (c.b - 128) * contrast,
    });
    const img = createRasterImage(W, H) as RasterImage;
    fillRect(img, 0, 0, W, H, mix(SKY));
    fillRect(img, FX0, FY0, FX1, FY1, mix(WALL));

    const openings: { x0: number; y0: number; x1: number; y1: number }[] = [];
    for (let row = 0; row < STOREYS; row++) {
        for (let col = 0; col < BAYS; col++) {
            if (spec.skip?.some((s) => s.row === row && s.col === col) === true) continue;
            const r = openingRect(row, col);
            fillOpening(img, r.x0, r.y0, r.x1, r.y1, spec.archRise ?? 0, spec.archN ?? 2, mix(OPENING));
            openings.push(r);
        }
    }

    if (spec.soffit !== undefined && spec.soffit > 0) {
        // Case D: a shaded band beneath each storey line — the ONLY depth cue a
        // single image carries, and the thing case D actually asserts.
        for (let row = 1; row < STOREYS; row++) {
            const y = FY0 + CELL_H * row;
            fillRect(img, FX0, y, FX1, y + spec.soffit, mix(SHADOW));
        }
    }

    if (spec.groundBreak === true) {
        // Case B: the lowest storey is NOT the repeating one — its openings are
        // replaced by one wide bay. Nothing tells the pipeline this is a "ground
        // floor"; it has to notice the comb stops holding.
        const y0 = FY0 + CELL_H * (STOREYS - 1);
        fillRect(img, FX0, y0, FX1, FY1, mix(WALL));
        // ⚠ Offset 0.45 of the cell, NOT 0.25: at 0.25 the wide opening's head lands
        // almost exactly where the regular comb's next tooth would be, so the missing
        // storey still SUPPORTS the tooth and the break becomes invisible. The break
        // has to be a real absence of rhythm, not a coincidence of position.
        fillRect(img, FX0 + CELL_W * 0.3, y0 + CELL_H * 0.45, FX1 - CELL_W * 0.3, FY1, mix(OPENING));
    }

    if (spec.noise !== undefined && spec.noise > 0) {
        const rnd = lcg(0x5eed1234);
        for (let i = 0; i < img.data.length; i += 4) {
            const d = (rnd() - 0.5) * 2 * spec.noise;
            img.data[i] = img.data[i]! + d;
            img.data[i + 1] = img.data[i + 1]! + d;
            img.data[i + 2] = img.data[i + 2]! + d;
        }
    }
    return { image: img, openings };
}

const NO_TRIM = { top: 0, bottom: 0, left: 0, right: 0 } as const;

function baseTruth(overrides: Partial<GroundTruth> = {}): GroundTruth {
    return {
        bays: BAYS,
        storeys: STOREYS,
        facadeRect: { x0: FX0, y0: FY0, x1: FX1, y1: FY1 },
        openings: [],
        archness: 0,
        chromeTrim: NO_TRIM,
        cropRefused: false,
        nonGridObjects: 0,
        soffitBandHeight: 0,
        curved: false,
        ...overrides,
    };
}

/** A — a plain rectangular window grid. The reference every other case moves from. */
export function caseA(): SyntheticCase {
    const { image, openings } = buildBase({});
    return {
        id: 'A',
        description: 'rectangular window grid, 5 bays x 4 storeys, head-on',
        image,
        truth: baseTruth({ openings }),
    };
}

/** B — the same grid with the lowest storey replaced: a BREAK in periodicity. */
export function caseB(): SyntheticCase {
    const { image, openings } = buildBase({ groundBreak: true });
    return {
        id: 'B',
        description: 'grid with a horizontal break: the lowest storey is one wide opening',
        image,
        // The lowest storey's four openings were painted over, so they are not truth.
        truth: baseTruth({ openings: openings.filter((o) => o.y0 < FY0 + CELL_H * (STOREYS - 1)) }),
    };
}

/** C — arched heads. `archness` must come back CONTINUOUS, not as a category. */
export function caseC(): SyntheticCase {
    const archRise = OPEN_W / 2; // rise == half-width => archness 1 by construction
    const { image, openings } = buildBase({ archRise, archN: 2 });
    return {
        id: 'C',
        description: 'grid with semicircular (n=2) arched opening heads',
        image,
        truth: baseTruth({ openings, archness: 1 }),
    };
}

/** D — projecting balconies. The SOFFIT BAND is truth; the DEPTH is not. */
export function caseD(): SyntheticCase {
    const soffit = 8;
    const { image, openings } = buildBase({ soffit });
    return {
        id: 'D',
        description: 'grid with projecting balcony slabs casting an 8 px soffit band',
        image,
        truth: baseTruth({ openings, soffitBandHeight: soffit }),
    };
}

/**
 * E — a curved corner.
 *
 * Rendered by horizontally compressing the outer bands, which is what wrapping a
 * facade around a corner does to its projection: the storey lines stop being
 * straight across the full width and bend in a CONSISTENT direction at every level.
 */
export function caseE(): SyntheticCase {
    const { image, openings } = buildBase({});
    const out = createRasterImage(W, H) as RasterImage;
    const edge = (FX1 - FX0) * 0.15;
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            let sx = x;
            let sy = y;
            if (x >= FX0 && x < FX1 && y >= FY0 && y < FY1) {
                const dl = x - FX0;
                const dr = FX1 - 1 - x;
                const t = Math.min(dl, dr);
                if (t < edge) {
                    // Bend the row downward toward the edge, by a fixed shape. The
                    // SIGN is the same on both sides at every storey, which is exactly
                    // what the curvature stage looks for.
                    //
                    // 26 px on a 300 px facade — ~9%. A facade wrapping a real corner
                    // bends its storey lines by far more than the millimetre a
                    // resampler contributes, and a case drawn at the detector's
                    // threshold tests the threshold rather than the detector.
                    const k = 1 - t / edge;
                    sy = y - k * k * 26;
                }
            }
            const p = (Math.max(0, Math.min(H - 1, Math.round(sy))) * W + sx) * 4;
            const q = (y * W + x) * 4;
            out.data[q] = image.data[p]!;
            out.data[q + 1] = image.data[p + 1]!;
            out.data[q + 2] = image.data[p + 2]!;
            out.data[q + 3] = 255;
        }
    }
    return {
        id: 'E',
        description: 'grid whose left and right edges bend, as a facade wrapping a corner does',
        image: out,
        truth: baseTruth({ openings, curved: true }),
    };
}

/**
 * F — a central vertical element spanning several storeys.
 *
 * ⭐ THE CASE THAT PROVES BRIEF §10 WITHOUT A RULE FOR IT. Nothing in the engine
 * knows what a lightwell is; this object is classified as a FEATURE purely because
 * it fails to match a comb node while being vertically continuous across >= 2 zones.
 */
export function caseF(): SyntheticCase {
    const skip = [0, 1, 2, 3].map((row) => ({ row, col: 2 }));
    const { image, openings } = buildBase({ skip });
    const cx = FX0 + CELL_W * 2.5;
    fillRect(image, cx - CELL_W * 0.2, FY0 + CELL_H * 0.2, cx + CELL_W * 0.2, FY1 - CELL_H * 0.2, OPENING);
    return {
        id: 'F',
        description: 'grid with a central vertical element spanning all storeys',
        image,
        truth: baseTruth({ openings, nonGridObjects: 1 }),
    };
}

/** G — missing windows. The comb must survive the gaps (brief §14). */
export function caseG(): SyntheticCase {
    const skip = [
        { row: 1, col: 1 },
        { row: 2, col: 3 },
        { row: 0, col: 4 },
    ];
    const { image, openings } = buildBase({ skip });
    return {
        id: 'G',
        description: 'grid with three windows missing — the period must not move',
        image,
        truth: baseTruth({ openings }),
    };
}

/**
 * H — foreground clutter.
 *
 * ⚠ Brief §2 requires that people, cars, plants and street furniture never become
 * facade elements. C108 §3.12 states the honest status: Milestone 1's defence is
 * STRUCTURAL — clutter is aperiodic, so it fails the comb match and lands in
 * `outliers` — and that is a MITIGATION, not a solution (L-11011). This case proves
 * the mitigation, not the requirement.
 */
export function caseH(): SyntheticCase {
    const { image, openings } = buildBase({});
    // ⚠ Placed in the WALL GAPS between window rows, not over them. An earlier
    // revision drew clutter overlapping a window; the two merged into one connected
    // component, so the case silently tested blob merging instead of the §15
    // classifier it exists for.
    fillRect(image, FX0 + 70, FY0 + 214, FX0 + 92, FY0 + 236, OPENING);
    fillRect(image, FX0 + 250, FY0 + 138, FX0 + 276, FY0 + 162, OPENING);
    return {
        id: 'H',
        description: 'grid plus two aperiodic foreground objects',
        image,
        truth: baseTruth({ openings, nonGridObjects: 2 }),
    };
}

/**
 * I — perspective. The homography must recover the DRAWN quad (brief §6).
 *
 * ⚠ A TRUE PROJECTIVE TRANSFORM, and it has to be. An earlier revision tapered the
 * rows by a factor linear in `u`, which LOOKS like perspective and is not one: no
 * homography maps it back, so rectification could not recover a uniform grid and
 * the bay count came back as 3 of 5. The case was testing the pipeline against a
 * deformation no camera can produce — a fake more capable of failing than reality.
 */
export function caseI(): SyntheticCase {
    const { image, openings } = buildBase({});
    const out = createRasterImage(W, H) as RasterImage;
    fillRect(out, 0, 0, W, H, SKY);

    const src: Quad = [
        { x: FX0, y: FY0 },
        { x: FX1, y: FY0 },
        { x: FX1, y: FY1 },
        { x: FX0, y: FY1 },
    ];
    // The right edge is nearer the vanishing point: shorter, and shifted inward.
    const dst: Quad = [
        { x: FX0 + 4, y: FY0 + 6 },
        { x: FX1 - 34, y: FY0 + 44 },
        { x: FX1 - 34, y: FY1 - 44 },
        { x: FX0 + 4, y: FY1 - 6 },
    ];
    const H_ = homographyFrom4(src, dst);
    const Hinv = H_ === null ? null : invert3(H_);
    if (Hinv === null) throw new Error('caseI: degenerate synthetic homography');

    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const p = applyHomography(Hinv, { x, y });
            if (p === null) continue;
            if (p.x < 0 || p.y < 0 || p.x > W - 1 || p.y > H - 1) continue;
            const s = (Math.round(p.y) * W + Math.round(p.x)) * 4;
            const q = (y * W + x) * 4;
            out.data[q] = image.data[s]!;
            out.data[q + 1] = image.data[s + 1]!;
            out.data[q + 2] = image.data[s + 2]!;
            out.data[q + 3] = 255;
        }
    }
    return {
        id: 'I',
        description: 'the case-A grid under a true projective transform',
        image: out,
        truth: baseTruth({ openings, facadeQuad: dst }),
    };
}

/**
 * J — noisy and low-contrast.
 *
 * ⭐ THE SUBTLE ASSERTION, AND THE DELIBERATE ONE: the pipeline must give the SAME
 * structural answer as case A at a STRICTLY LOWER reported confidence. A pipeline
 * that keeps its confidence high on a degraded image is the exact failure this
 * whole subsystem is shaped to avoid.
 */
export function caseJ(): SyntheticCase {
    const { image, openings } = buildBase({ noise: 10, contrast: 0.5 });
    return {
        id: 'J',
        description: 'the case-A grid at 50% contrast with deterministic additive noise',
        image,
        truth: baseTruth({ openings }),
    };
}

// ── crop cases (C108 §3.1; the orchestrator's correction to brief §1) ────────

/** K1 — a clean photograph. The crop must be a NO-OP: exactly 0 pixels trimmed. */
export function caseK1(): SyntheticCase {
    const { image, openings } = buildBase({});
    return {
        id: 'K1',
        description: 'clean photograph, no screenshot chrome — the crop must not touch it',
        image,
        truth: baseTruth({ openings }),
    };
}

/** K2 — the photograph inside solid screenshot chrome. */
export function caseK2(): SyntheticCase {
    const base = buildBase({});
    const top = 44;
    const bottom = 30;
    const out = createRasterImage(W, H + top + bottom) as RasterImage;
    fillRect(out, 0, 0, W, H + top + bottom, CHROME);
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const p = (y * W + x) * 4;
            const q = ((y + top) * W + x) * 4;
            out.data[q] = base.image.data[p]!;
            out.data[q + 1] = base.image.data[p + 1]!;
            out.data[q + 2] = base.image.data[p + 2]!;
            out.data[q + 3] = 255;
        }
    }
    return {
        id: 'K2',
        description: 'the photograph inside a solid 44 px / 30 px screenshot chrome band',
        image: out,
        truth: baseTruth({
            openings: base.openings,
            chromeTrim: { top, bottom, left: 0, right: 0 },
        }),
    };
}

/**
 * K3 — a clean photograph with a large uniform sky.
 *
 * ⛔ THE CASE THAT STOPS THE STAGE TRIMMING THE TOP OFF EVERY OUTDOOR PHOTOGRAPH.
 * The sky is low-variance like a UI bar, and is separated from one only by
 * inter-row variation: it drifts, a bar does not.
 */
export function caseK3(): SyntheticCase {
    const base = buildBase({});
    const skyH = 120;
    const out = createRasterImage(W, H + skyH) as RasterImage;
    for (let y = 0; y < skyH; y++) {
        const t = y / skyH;
        const c: Rgb = { r: 140 + 30 * t, g: 175 + 22 * t, b: 220 + 14 * t };
        fillRect(out, 0, y, W, y + 1, c);
    }
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const p = (y * W + x) * 4;
            const q = ((y + skyH) * W + x) * 4;
            out.data[q] = base.image.data[p]!;
            out.data[q + 1] = base.image.data[p + 1]!;
            out.data[q + 2] = base.image.data[p + 2]!;
            out.data[q + 3] = 255;
        }
    }
    return {
        id: 'K3',
        description: 'clean photograph beneath 120 px of gradient sky — the sky must SURVIVE',
        image: out,
        truth: baseTruth({ openings: base.openings }),
    };
}

/**
 * K4 — the over-trim trap.
 *
 * A flat band occupying most of the frame. Trimming it would satisfy every chrome
 * criterion and destroy the subject, so the stage must REFUSE (C108 §3.1). A
 * wrongly cropped building is not a degraded result — it is an unrecoverable one.
 */
export function caseK4(): SyntheticCase {
    const out = createRasterImage(W, H) as RasterImage;
    fillRect(out, 0, 0, W, H, CHROME);
    fillRect(out, 0, H - 60, W, H, WALL);
    fillRect(out, 40, H - 46, 120, H - 10, OPENING);
    return {
        id: 'K4',
        description: 'a flat band covering most of the frame — the crop must REFUSE, not comply',
        image: out,
        truth: baseTruth({ openings: [], cropRefused: true }),
    };
}

/** The brief §19 corpus, in the brief's own order, plus the four crop cases. */
export function allCases(): SyntheticCase[] {
    return [
        caseA(),
        caseB(),
        caseC(),
        caseD(),
        caseE(),
        caseF(),
        caseG(),
        caseH(),
        caseI(),
        caseJ(),
        caseK1(),
        caseK2(),
        caseK3(),
        caseK4(),
        caseL(),
    ];
}

// ── L — THE SHAPE THE CORPUS DID NOT HAVE (lane FACADEREAL60) ────────────────
//
// ⭐ WHY THIS CASE EXISTS, STATED PLAINLY: on 2026-08-25 the founder ran the FIRST
// REAL PHOTOGRAPH through this pipeline (L-11001) — a seven-storey, five-bay street
// block with a five-arch ground-floor arcade and balconies on every floor. The
// lattice came back 2 zones x 2 bays: FOUR cells on a building with ~35 openings.
//
// A–K are all FIVE BAYS x FOUR STOREYS with a flat ground floor. That is one shape,
// and it is a shape in which the true storey period is a QUARTER of the extent while
// its first harmonic is a HALF — i.e. exactly at `maxPeriodFraction`. The corpus
// therefore never contained a facade whose storey count was large enough for the
// comb's preference for FEW TEETH to beat the fundamental. This case does.
//
// ⛔ The founder's photograph is NOT in this repository and is not his to
// redistribute (C108 §0.2). This is a SYNTHETIC facade of the same CLASS, with
// ground truth the generator drew, which is the only kind of evidence C108 §6.2
// accepts. It proves the class, not his building.

const LW = 480;
const LH = 620;
const LFX0 = 40;
const LFY0 = 40;
const LFX1 = 440;
const LFY1 = 580;
const L_BAYS = 5;
/** Regular storeys ABOVE the arcade. The arcade is a seventh zone. */
const L_UPPER = 6;
const L_CELL_W = (LFX1 - LFX0) / L_BAYS; // 80
/** The arcade zone is TALLER than a storey, as a street arcade is. */
const L_ARCADE_H = 100;
const L_UPPER_H = (LFY1 - LFY0 - L_ARCADE_H) / L_UPPER; // 73.33
const L_OPEN_W = L_CELL_W * 0.6; // 48
const L_OPEN_H = L_UPPER_H * 0.6; // 44
/** Arch half-width == rise, so the drawn head is a true semicircle: archness 1. */
const L_ARCH_W = 60;
const L_ARCH_RISE = L_ARCH_W / 2;
const L_SOFFIT = 8;

/**
 * L — a multi-storey, multi-bay facade with an ARCADED ground floor.
 *
 * Drawn: 6 upper storeys x 5 bays of rectangular windows, a balcony soffit band
 * under every upper storey line, and 5 semicircular arches across the ground zone.
 * Ground truth: 7 zones, 5 bays, 35 openings, ground-zone archness 1, upper 0.
 */
export function caseL(): SyntheticCase {
    const img = createRasterImage(LW, LH) as RasterImage;
    fillRect(img, 0, 0, LW, LH, SKY);
    fillRect(img, LFX0, LFY0, LFX1, LFY1, WALL);

    const openings: { x0: number; y0: number; x1: number; y1: number }[] = [];
    for (let row = 0; row < L_UPPER; row++) {
        for (let col = 0; col < L_BAYS; col++) {
            const cx = LFX0 + L_CELL_W * (col + 0.5);
            const cy = LFY0 + L_UPPER_H * (row + 0.5);
            const r = {
                x0: cx - L_OPEN_W / 2,
                y0: cy - L_OPEN_H / 2,
                x1: cx + L_OPEN_W / 2,
                y1: cy + L_OPEN_H / 2,
            };
            fillOpening(img, r.x0, r.y0, r.x1, r.y1, 0, 2, OPENING);
            openings.push(r);
        }
    }

    // Balconies: the soffit band is the ONLY depth cue one image carries (C108 §3.10).
    for (let row = 1; row < L_UPPER; row++) {
        const y = LFY0 + L_UPPER_H * row;
        fillRect(img, LFX0, y, LFX1, y + L_SOFFIT, SHADOW);
    }

    // The arcade. ⛔ Nothing in the engine is told these are arches, that they are at
    // the bottom, or that a ground floor differs from a storey (brief §22).
    const arcadeTop = LFY1 - L_ARCADE_H;
    for (let col = 0; col < L_BAYS; col++) {
        const cx = LFX0 + L_CELL_W * (col + 0.5);
        const r = { x0: cx - L_ARCH_W / 2, y0: arcadeTop + 10, x1: cx + L_ARCH_W / 2, y1: LFY1 };
        fillOpening(img, r.x0, r.y0, r.x1, r.y1, L_ARCH_RISE, 2, OPENING);
        openings.push(r);
    }

    return {
        id: 'L',
        description:
            'seven zones (6 storeys + a 5-arch arcade) x 5 bays, balcony soffits — the founder\'s image CLASS',
        image: img,
        truth: {
            bays: L_BAYS,
            storeys: L_UPPER + 1,
            facadeRect: { x0: LFX0, y0: LFY0, x1: LFX1, y1: LFY1 },
            openings,
            // The UPPER openings are flat; the five arcade heads are semicircles.
            archness: 0,
            chromeTrim: NO_TRIM,
            cropRefused: false,
            nonGridObjects: 0,
            soffitBandHeight: L_SOFFIT,
            curved: false,
        },
    };
}

/** Ground truth about case L that no other case carries. */
export const CASE_L_TRUTH = Object.freeze({
    /** Zones, including the arcade. */
    zones: L_UPPER + 1,
    bays: L_BAYS,
    /** Openings drawn in the ARCADE zone — the ones whose heads are semicircular. */
    arcadeOpenings: L_BAYS,
    /** `rise / halfWidth` of the drawn arcade heads. */
    arcadeArchness: 1,
    /** Total openings drawn. */
    totalOpenings: L_UPPER * L_BAYS + L_BAYS,
    /** Facade-normalized Y of the arcade zone's TOP boundary (C108 §2.1: Y counts up). */
    arcadeTopY: L_ARCADE_H / (LFY1 - LFY0),
});
