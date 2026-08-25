/**
 * @file packages/geometry-furniture/src/builders/carpetPatterns.ts
 *
 * §CARPET97 (founder, 2026-08-25) — the procedural carpet PATTERN LIBRARY.
 *
 * WHY THIS MODULE EXISTS SEPARATELY FROM THE BUILDERS
 * ---------------------------------------------------
 * `ChevronCarpetBuilder` / `PatchworkCarpetBuilder` / `StripeCarpetBuilder` each
 * inline their own canvas drawing next to their own THREE geometry. Three
 * copies of one shape was tolerable; THIRTEEN would not be. Worse, the drawing
 * half is the only half with interesting logic and it is the half that CANNOT
 * be unit-tested through the builders — `happy-dom` returns **null** from
 * `canvas.getContext('2d')` (measured, §CARPET97), so any test that drives a
 * builder never reaches a single drawing statement.
 *
 * So the split is:
 *   • THIS module — PURE. No THREE, no DOM value imports, no `document`. It owns
 *     (a) the per-design specification, (b) the parametric PLAN (canvas size,
 *     motif counts, real-world wavelengths) and (c) the drawing itself, against
 *     a MINIMAL structural context interface. All three are directly testable.
 *   • `carpetTexture.ts` — the THREE/DOM seam (canvas → CanvasTexture).
 *   • `ParametricCarpetBuilders.ts` / `RoundBraidedCarpetBuilder.ts` — geometry.
 *
 * THE PARAMETRIC RULE (non-negotiable, inherited from ChevronCarpetBuilder)
 * ------------------------------------------------------------------------
 * A pattern is computed from REAL-WORLD dimensions divided by a fixed
 * wavelength, so resizing a rug EXTENDS the pattern (more repeats at constant
 * real-world scale) rather than STRETCHING it. `planCarpetTexture()` is where
 * that rule lives, and `motifCountX/Y` + `wavelengthXm/Ym` are what pins it in
 * tests: across two sizes the COUNT must move and the WAVELENGTH must not.
 *
 * Two designs qualify that rule honestly rather than pretending:
 *   • `checkerboard` sets `snapToWholePeriods` — a checkerboard whose border
 *     lands on a half square is simply wrong, so the count is ROUNDED and the
 *     residual (≤ half a square) is absorbed into the square size. Wavelength is
 *     therefore constant to within ±½ period, not exactly. Stated, not hidden.
 *   • `colour_block` is a COMPOSITION, not a repeat. It is kept parametric by
 *     laying the asymmetric blocks on a fixed 0.55 m module grid: block SIZE is
 *     constant in metres, block COUNT grows with the rug.
 *
 * PERFORMANCE ("LIGHT — PERFORMANCE BEST POSSIBLE", founder)
 * ----------------------------------------------------------
 * Two levers, both measured in `__tests__/carpetPatterns.test.ts`:
 *
 *  1. A BOUNDED canvas. The existing three carpets budget ~64-80 px per motif
 *     with a 4096 px cap, which for a 3.0 × 2.0 m patchwork rug mints a
 *     1920 × 1280 canvas = 9.83 MB of RGBA (13.1 MB once mipmapped). A rug is a
 *     floor object read from ≥1.5 m away; 256 px/m (≈3.9 mm per texel) is ample.
 *     `CARPET_PX_PER_METRE = 256` with a hard `CARPET_MAX_CANVAS_PX = 1024` cap
 *     puts the same rug at 768 × 512 = 1.57 MB (2.10 MB mipmapped) — 6.2× lighter.
 *
 *  2. TILING where the design is genuinely periodic. `tiled: true` draws ONE
 *     period and lets `texture.repeat` do the rest, which is not merely cheaper
 *     but a STRICTER statement of the parametric rule (the repeat count IS
 *     dimension ÷ wavelength). A checkerboard drops from 1.57 MB to a 256 × 256
 *     tile (262 KB); `fine_stripe` is uniform along its length, so it is a
 *     256 × 4 strip — 4 KB.
 *
 * NOT DONE, deliberately: no cross-instance texture CACHE. A shared texture
 * cannot keep the `dispose`-frees-the-map contract the existing three
 * established (first dispose would blind every other rug holding it), and the
 * only provably-safe alternative — a `markSharedGpuResource` cache released at
 * project close, as `SharedMaterialCache` does — leaks one texture per distinct
 * (variant, width, length) FOREVER while the user drags a rug's resize handle.
 * Per-build textures + a hard resolution cap is the safe trade. See the report.
 *
 * Determinism: every design is a pure function of its dimensions. No `Math.random`.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. The drawing surface — a MINIMAL structural subset of CanvasRenderingContext2D
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Exactly the 2D-context surface the pattern drawers use — no more.
 *
 * Declared structurally (rather than as `CanvasRenderingContext2D`) for two
 * reasons: it keeps this module free of DOM *types* as well as DOM values, and
 * it makes a test double IMPOSSIBLE to make more capable than the real thing —
 * the double must implement this interface, and the real context is checked
 * against it at the one call site that passes it in (`carpetTexture.ts`).
 *
 * The style/join fields are `unknown` rather than `string` on purpose: the real
 * DOM type is `string | CanvasGradient | CanvasPattern`, which is assignable to
 * `unknown` but not to `string`. Widening here is what lets the REAL context
 * satisfy this interface. Drawers only ever assign CSS colour strings.
 */
export interface Carpet2DContext {
    fillStyle: unknown;
    strokeStyle: unknown;
    lineWidth: number;
    lineCap: unknown;
    lineJoin: unknown;
    miterLimit: number;
    globalAlpha: number;
    fillRect(x: number, y: number, w: number, h: number): void;
    beginPath(): void;
    closePath(): void;
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
    arc(x: number, y: number, r: number, a0: number, a1: number, ccw?: boolean): void;
    fill(): void;
    stroke(): void;
    save(): void;
    restore(): void;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. The ten designs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * §CARPET97 — the ten designs the founder photographed, plus the tenth of my
 * own choosing. Ids are the `variant` stamped on the group's userData and the
 * suffix of the `parametric_<id>_carpet` FurnitureType.
 */
export type CarpetPatternId =
    | 'staggered_stripe'    // 1 — terracotta bands, phase-offset in 3 columns
    | 'checkerboard'        // 2 — large rust/cream squares, edge to edge
    | 'bordered_jute'       // 3 — jute field, inset checkered sage border
    | 'braided_jute'        // 4 — concentric rectangular braid rings, tonal only
    | 'colour_block'        // 5 — Bauhaus asymmetric blocks + L-shaped focal
    | 'moons'               // 6 — overlapping circles / half-circles, blues
    | 'round_braided'       // 7 — ROUND. concentric bright braid on jute
    | 'line_art'            // 8 — one continuous black meander on cream
    | 'fine_stripe'         // 9 — dense thin stripes + orange/tan blocks
    | 'diamond_trellis';    // 10 — my choice. indigo diamond lattice on ivory

/** Every design except the round one — i.e. those whose body is a rectangle. */
export const RECTANGULAR_CARPET_PATTERNS: readonly CarpetPatternId[] = [
    'staggered_stripe', 'checkerboard', 'bordered_jute', 'braided_jute',
    'colour_block', 'moons', 'line_art', 'fine_stripe', 'diamond_trellis',
];

/** The one design that is NOT a rectangle. Kept as its own list so a caller
 *  that assumes a rectangular footprint cannot pick it up by accident. */
export const ROUND_CARPET_PATTERNS: readonly CarpetPatternId[] = ['round_braided'];

export interface CarpetPatternSpec {
    /** Human label — carousel card + family-registry name. */
    readonly label: string;
    /** Body slab colour (also the fallback colour when no 2D context exists). */
    readonly bodyColor: number;
    /** Fringe colour. Ignored by round designs (they have no short ends). */
    readonly fringeColor: number;
    /** MeshStandardMaterial roughness for the pattern overlay. */
    readonly roughness: number;
    /** Body shape. `round` ⇒ diameter = min(width, length); no fringe. */
    readonly shape: 'rect' | 'round';
    /** True ⇒ draw ONE period and tile via texture.repeat (see header §2). */
    readonly tiled: boolean;
    /** Real-world motif period along X, in metres. */
    readonly periodXm: number;
    /** Real-world motif period along Y (length), in metres. 0 ⇒ uniform. */
    readonly periodYm: number;
    /** Round the repeat count to whole periods (checkerboard borders). */
    readonly snapToWholePeriods: boolean;
}

export const CARPET_PATTERNS: Readonly<Record<CarpetPatternId, CarpetPatternSpec>> = {
    staggered_stripe: {
        label: 'Staggered Stripe Carpet',
        bodyColor: 0xefe4d4, fringeColor: 0xe6d8c4, roughness: 0.94,
        shape: 'rect', tiled: true,
        // 3 columns × 0.45 m, band pair 2 × 0.13 m. One tile = one full
        // running-bond cycle, so the three column phases wrap seamlessly.
        periodXm: 1.35, periodYm: 0.26, snapToWholePeriods: false,
    },
    checkerboard: {
        label: 'Checkerboard Carpet',
        bodyColor: 0xefe3d0, fringeColor: 0xe6d8c2, roughness: 0.93,
        shape: 'rect', tiled: true,
        // 0.36 m squares → a 3.0 m rug reads ~8 columns, matching the reference.
        periodXm: 0.72, periodYm: 0.72, snapToWholePeriods: true,
    },
    bordered_jute: {
        label: 'Bordered Jute Carpet',
        bodyColor: 0xd9c9a3, fringeColor: 0xe3d6b4, roughness: 0.97,
        shape: 'rect', tiled: false,
        periodXm: 0.10, periodYm: 0.10, snapToWholePeriods: false,
    },
    braided_jute: {
        label: 'Braided Jute Carpet',
        bodyColor: 0xd6c396, fringeColor: 0xd6c396, roughness: 0.97,
        shape: 'rect', tiled: false,
        periodXm: 0.075, periodYm: 0.075, snapToWholePeriods: false,
    },
    colour_block: {
        label: 'Colour Block Carpet',
        bodyColor: 0xece5d8, fringeColor: 0xded5c4, roughness: 0.92,
        shape: 'rect', tiled: false,
        periodXm: 0.55, periodYm: 0.55, snapToWholePeriods: false,
    },
    moons: {
        label: 'Moons Carpet',
        bodyColor: 0xece4d6, fringeColor: 0xded5c4, roughness: 0.93,
        shape: 'rect', tiled: false,
        periodXm: 0.42, periodYm: 0.42, snapToWholePeriods: false,
    },
    round_braided: {
        label: 'Round Braided Rug',
        bodyColor: 0xe0d6bf, fringeColor: 0xe0d6bf, roughness: 0.96,
        shape: 'round', tiled: false,
        periodXm: 0.09, periodYm: 0.09, snapToWholePeriods: false,
    },
    line_art: {
        label: 'Line Art Carpet',
        bodyColor: 0xf2ece0, fringeColor: 0xe9e0d0, roughness: 0.94,
        shape: 'rect', tiled: false,
        periodXm: 0.55, periodYm: 0.55, snapToWholePeriods: false,
    },
    fine_stripe: {
        label: 'Fine Stripe Carpet',
        bodyColor: 0xefe6d6, fringeColor: 0xe6dbc6, roughness: 0.93,
        shape: 'rect', tiled: true,
        // Uniform along the length ⇒ periodYm = 0 ⇒ a 4 px-tall strip texture.
        periodXm: 0.84, periodYm: 0, snapToWholePeriods: false,
    },
    diamond_trellis: {
        label: 'Diamond Trellis Carpet',
        bodyColor: 0xf0ebe0, fringeColor: 0xe6ded0, roughness: 0.94,
        shape: 'rect', tiled: true,
        periodXm: 0.30, periodYm: 0.30, snapToWholePeriods: false,
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. The parametric plan — canvas budget + motif counts
// ─────────────────────────────────────────────────────────────────────────────

/** Texel density, px per real-world metre. ≈3.9 mm/texel. See header §2.1. */
export const CARPET_PX_PER_METRE = 256;
/** Hard per-axis cap for a FULL-canvas design. A 4 m rug does not need 4096². */
export const CARPET_MAX_CANVAS_PX = 1024;
/** Floor for a full-canvas axis (a bath mat must still read). */
export const CARPET_MIN_CANVAS_PX = 32;
/** Per-axis cap for a TILED design — one period never needs more than this. */
export const CARPET_MAX_TILE_PX = 512;
/** Floor for a tiled axis. */
export const CARPET_MIN_TILE_PX = 32;
/** Height of the strip texture used by designs uniform along their length. */
export const CARPET_UNIFORM_AXIS_PX = 4;

export interface CarpetTexturePlan {
    readonly patternId: CarpetPatternId;
    readonly canvasW: number;
    readonly canvasH: number;
    /** Pixels per real-world metre ACTUALLY achieved on each axis (post-cap). */
    readonly pxPerMetreX: number;
    readonly pxPerMetreY: number;
    /** True ⇒ canvas holds ONE period; the texture repeats. */
    readonly tiled: boolean;
    /** texture.repeat — 1/1 for full-canvas designs. */
    readonly repeatX: number;
    readonly repeatY: number;
    /** How many motifs the rug shows end to end. THE parametric quantity. */
    readonly motifCountX: number;
    readonly motifCountY: number;
    /** Achieved real-world motif period. MUST stay constant as the rug grows. */
    readonly wavelengthXm: number;
    readonly wavelengthYm: number;
}

const roundTo4 = (v: number): number => Math.max(4, Math.round(v / 4) * 4);
const clampFull = (v: number): number =>
    Math.min(CARPET_MAX_CANVAS_PX, Math.max(CARPET_MIN_CANVAS_PX, roundTo4(v)));
/** Ceil to a power of two — tiled textures repeat, and NPOT + RepeatWrapping +
 *  mipmaps is only universally safe on POT dimensions. Ceil (not round) so a
 *  small period never loses line crispness to a downward snap. */
const clampTilePot = (v: number): number => {
    const pot = 2 ** Math.ceil(Math.log2(Math.max(1, v)));
    return Math.min(CARPET_MAX_TILE_PX, Math.max(CARPET_MIN_TILE_PX, pot));
};

/**
 * Compute the canvas budget and the motif counts for one rug.
 *
 * PURE — this is the function the "extends, does not stretch" tests drive.
 */
export function planCarpetTexture(
    patternId: CarpetPatternId,
    widthM: number,
    lengthM: number,
): CarpetTexturePlan {
    const spec = CARPET_PATTERNS[patternId];
    const w = Math.max(0.05, widthM);
    const l = Math.max(0.05, lengthM);

    if (!spec.tiled) {
        const canvasW = clampFull(w * CARPET_PX_PER_METRE);
        const canvasH = clampFull(l * CARPET_PX_PER_METRE);
        return {
            patternId,
            canvasW, canvasH,
            pxPerMetreX: canvasW / w,
            pxPerMetreY: canvasH / l,
            tiled: false,
            repeatX: 1, repeatY: 1,
            // The motif is drawn at real-world scale ON the canvas, so the
            // wavelength is exactly the spec period however the canvas is capped.
            motifCountX: w / spec.periodXm,
            motifCountY: spec.periodYm > 0 ? l / spec.periodYm : 1,
            wavelengthXm: spec.periodXm,
            wavelengthYm: spec.periodYm > 0 ? spec.periodYm : l,
        };
    }

    let repeatX = w / spec.periodXm;
    let repeatY = spec.periodYm > 0 ? l / spec.periodYm : 1;
    if (spec.snapToWholePeriods) {
        repeatX = Math.max(1, Math.round(repeatX));
        repeatY = Math.max(1, Math.round(repeatY));
    }
    const canvasW = clampTilePot(spec.periodXm * CARPET_PX_PER_METRE);
    const canvasH = spec.periodYm > 0
        ? clampTilePot(spec.periodYm * CARPET_PX_PER_METRE)
        : CARPET_UNIFORM_AXIS_PX;
    return {
        patternId,
        canvasW, canvasH,
        pxPerMetreX: canvasW / spec.periodXm,
        pxPerMetreY: spec.periodYm > 0 ? canvasH / spec.periodYm : canvasH,
        tiled: true,
        repeatX, repeatY,
        motifCountX: repeatX,
        motifCountY: repeatY,
        wavelengthXm: w / repeatX,
        wavelengthYm: spec.periodYm > 0 ? l / repeatY : l,
    };
}

/**
 * GPU bytes one carpet texture occupies: RGBA8 plus the full mip chain (×4/3).
 * Used by the perf test and by the report — a number, not an adjective.
 */
export function carpetTextureBytes(plan: CarpetTexturePlan): number {
    return Math.round(plan.canvasW * plan.canvasH * 4 * (4 / 3));
}

/**
 * §CARPET97 — the canvas budget for the THREE PRE-EXISTING carpets (chevron,
 * patchwork, stripe), so the whole family shares one ceiling.
 *
 * Those three each computed `min(4096, motifs × 64-to-80 px)`, which for the
 * 3.0 × 2.0 m rug the auto-furnish `rug` kind places in EVERY room mints a
 * 1920 × 1280 canvas — 12.5 MB with mips, per rug, in every room. Their MOTIF
 * maths is already resolution-independent (every one of them derives its step
 * as `canvasW / motifCount`), so re-pointing the canvas size at this helper
 * changes crispness and nothing else: the drawn pattern is unchanged.
 *
 * Kept as its own function rather than folded into `CARPET_PATTERNS` because
 * those three are not §CARPET97 designs and do not belong in the design table.
 */
export function legacyCarpetCanvasSize(widthM: number, lengthM: number): {
    canvasW: number; canvasH: number; pxPerMetreX: number; pxPerMetreY: number;
} {
    const w = Math.max(0.05, widthM);
    const l = Math.max(0.05, lengthM);
    const canvasW = clampFull(w * CARPET_PX_PER_METRE);
    const canvasH = clampFull(l * CARPET_PX_PER_METRE);
    return { canvasW, canvasH, pxPerMetreX: canvasW / w, pxPerMetreY: canvasH / l };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Deterministic variety — how the auto-furnish `rug` kind picks a design
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Seed a variant choice from a WORLD POSITION.
 *
 * Same shape as `WallTapestryBuilder`'s §DECOR-VARIETY seed (founder,
 * 2026-06-18): stable across regenerations for a given layout, different per
 * room, and pure — so command snapshots round-trip byte-identically.
 */
export function carpetSeedFromPosition(x = 0, y = 0, z = 0): number {
    return Math.abs(
        Math.round(x * 7.31) +
        Math.round(z * 13.77) * 31 +
        Math.round(y * 3.13),
    );
}

/**
 * Pick a RECTANGULAR design for a seed. The round design is excluded on purpose:
 * `rug` and `wall_tapestry` both hand down a rectangular footprint, and a round
 * body would silently shrink it to min(width, length).
 */
export function pickCarpetPatternForSeed(seed: number): CarpetPatternId {
    const n = RECTANGULAR_CARPET_PATTERNS.length;
    return RECTANGULAR_CARPET_PATTERNS[((Math.round(seed) % n) + n) % n]!;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Drawing
// ─────────────────────────────────────────────────────────────────────────────

/** Deterministic 32-bit hash of two integers. No Math.random anywhere here. */
function hash2(a: number, b: number): number {
    let h = ((Math.round(a) | 0) * 73856093) ^ ((Math.round(b) | 0) * 19349663);
    h ^= h >>> 13;
    return h >>> 0;
}

/** Deterministic 0..1 from a 32-bit hash. */
const unit = (h: number): number => (h % 100000) / 100000;

/** Metres → canvas px on each axis. */
const px = (plan: CarpetTexturePlan, m: number): number => m * plan.pxPerMetreX;
const py = (plan: CarpetTexturePlan, m: number): number => m * plan.pxPerMetreY;

/**
 * Deterministic woven grain. Dots are sized in PIXELS (1-2 px) rather than
 * metres because their job is to break up flat fill at texel scale; the DENSITY
 * is per square metre, so the grain stays at constant real-world coarseness.
 */
function speckle(
    ctx: Carpet2DContext,
    plan: CarpetTexturePlan,
    colors: readonly string[],
    perSqM: number,
    seedBase: number,
): void {
    const areaSqM = (plan.canvasW / plan.pxPerMetreX) * (plan.canvasH / Math.max(1, plan.pxPerMetreY));
    const n = Math.min(24000, Math.max(0, Math.round(perSqM * areaSqM)));
    let s = (seedBase >>> 0) || 1;
    for (let i = 0; i < n; i++) {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        const x = (s >>> 9) % Math.max(1, plan.canvasW - 2);
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        const y = (s >>> 9) % Math.max(1, plan.canvasH - 2);
        ctx.fillStyle = colors[(s >>> 5) % colors.length]!;
        ctx.fillRect(x, y, 2, 2);
    }
}

const fillAll = (ctx: Carpet2DContext, plan: CarpetTexturePlan, color: string): void => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, plan.canvasW, plan.canvasH);
};

/**
 * Draw `patternId` onto `ctx`, sized by `plan`.
 *
 * PURE with respect to the plan: the same (id, plan) always produces the same
 * call sequence. Every drawer works in METRES via `px()` / `py()` so a capped
 * canvas degrades resolution, never real-world scale.
 */
export function drawCarpetPattern(
    patternId: CarpetPatternId,
    ctx: Carpet2DContext,
    plan: CarpetTexturePlan,
): void {
    switch (patternId) {
        case 'staggered_stripe': return drawStaggeredStripe(ctx, plan);
        case 'checkerboard':     return drawCheckerboard(ctx, plan);
        case 'bordered_jute':    return drawBorderedJute(ctx, plan);
        case 'braided_jute':     return drawBraidedJute(ctx, plan);
        case 'colour_block':     return drawColourBlock(ctx, plan);
        case 'moons':            return drawMoons(ctx, plan);
        case 'round_braided':    return drawRoundBraided(ctx, plan);
        case 'line_art':         return drawLineArt(ctx, plan);
        case 'fine_stripe':      return drawFineStripe(ctx, plan);
        case 'diamond_trellis':  return drawDiamondTrellis(ctx, plan);
    }
}

// ── 1. Staggered stripe ──────────────────────────────────────────────────────
// Terracotta bands on cream, split into three vertical columns whose band phase
// is offset by a third of a band pair — the running-bond look of the reference.
// TILED: one tile = 3 columns × 1 band pair, so the phases wrap seamlessly.
const STAGGER_CREAM = '#efe4d4';
const STAGGER_TERRACOTTA = '#b8542f';
const STAGGER_COLUMN_M = 0.45;
const STAGGER_BAND_M = 0.13;

function drawStaggeredStripe(ctx: Carpet2DContext, plan: CarpetTexturePlan): void {
    fillAll(ctx, plan, STAGGER_CREAM);
    const colW = px(plan, STAGGER_COLUMN_M);
    const bandH = py(plan, STAGGER_BAND_M);
    const periodH = bandH * 2;
    ctx.fillStyle = STAGGER_TERRACOTTA;
    for (let c = 0; c < 3; c++) {
        const phase = (c / 3) * periodH;
        // k from -1 so the band that wraps in from the top edge is drawn too.
        for (let k = -1; k <= Math.ceil(plan.canvasH / periodH) + 1; k++) {
            const y = k * periodH + phase;
            ctx.fillRect(Math.round(c * colW), Math.round(y),
                Math.ceil(colW) + 1, Math.ceil(bandH));
        }
    }
    // A whisper of weave so the flat fills do not read as vinyl.
    speckle(ctx, plan, ['rgba(0,0,0,0.05)', 'rgba(255,255,255,0.05)'], 900, 0x5a17);
}

// ── 2. Checkerboard ──────────────────────────────────────────────────────────
// Large rust / cream squares, high contrast, edge to edge. TILED 2 × 2 squares.
const CHECK_CREAM = '#efe3d0';
const CHECK_RUST = '#a8482a';

function drawCheckerboard(ctx: Carpet2DContext, plan: CarpetTexturePlan): void {
    fillAll(ctx, plan, CHECK_CREAM);
    const halfW = plan.canvasW / 2;
    const halfH = plan.canvasH / 2;
    ctx.fillStyle = CHECK_RUST;
    ctx.fillRect(0, 0, Math.ceil(halfW), Math.ceil(halfH));
    ctx.fillRect(Math.floor(halfW), Math.floor(halfH), Math.ceil(halfW), Math.ceil(halfH));
    speckle(ctx, plan, ['rgba(0,0,0,0.06)', 'rgba(255,255,255,0.06)'], 1100, 0x9c31);
}

// ── 3. Bordered jute ─────────────────────────────────────────────────────────
// Natural jute field with a checkered sage/natural border band inset from all
// four edges. FULL canvas — the border is positional, not periodic.
const JUTE_FIELD = '#d9c9a3';
const JUTE_LIGHT = '#e3d6b4';
const JUTE_DARK = '#c6b287';
const BORDER_SAGE = '#7d8b63';
const BORDER_INSET_M = 0.12;
const BORDER_BAND_M = 0.10;
const BORDER_CHECK_M = 0.10;

function drawBorderedJute(ctx: Carpet2DContext, plan: CarpetTexturePlan): void {
    fillAll(ctx, plan, JUTE_FIELD);
    speckle(ctx, plan, [JUTE_LIGHT, JUTE_DARK, 'rgba(0,0,0,0.05)'], 5200, 0x31a7);

    const insetX = px(plan, BORDER_INSET_M);
    const insetY = py(plan, BORDER_INSET_M);
    const bandX = px(plan, BORDER_BAND_M);
    const bandY = py(plan, BORDER_BAND_M);
    const checkX = Math.max(2, px(plan, BORDER_CHECK_M));
    const checkY = Math.max(2, py(plan, BORDER_CHECK_M));

    const x0 = insetX, y0 = insetY;
    const x1 = plan.canvasW - insetX, y1 = plan.canvasH - insetY;

    // Top + bottom runs.
    for (let i = 0, x = x0; x < x1; i++, x += checkX) {
        const w = Math.min(checkX, x1 - x);
        ctx.fillStyle = i % 2 === 0 ? BORDER_SAGE : JUTE_LIGHT;
        ctx.fillRect(Math.round(x), Math.round(y0), Math.ceil(w) + 1, Math.ceil(bandY));
        ctx.fillStyle = i % 2 === 0 ? JUTE_LIGHT : BORDER_SAGE;
        ctx.fillRect(Math.round(x), Math.round(y1 - bandY), Math.ceil(w) + 1, Math.ceil(bandY));
    }
    // Left + right runs (skip the corners already painted above).
    for (let i = 0, y = y0 + bandY; y < y1 - bandY; i++, y += checkY) {
        const h = Math.min(checkY, y1 - bandY - y);
        ctx.fillStyle = i % 2 === 0 ? JUTE_LIGHT : BORDER_SAGE;
        ctx.fillRect(Math.round(x0), Math.round(y), Math.ceil(bandX), Math.ceil(h) + 1);
        ctx.fillStyle = i % 2 === 0 ? BORDER_SAGE : JUTE_LIGHT;
        ctx.fillRect(Math.round(x1 - bandX), Math.round(y), Math.ceil(bandX), Math.ceil(h) + 1);
    }
}

// ── 4. Braided jute ──────────────────────────────────────────────────────────
// Plain natural jute worked as concentric rectangular braid rings from the
// perimeter inward. TONAL variation only — no second colour, per the reference.
const BRAID_TONES = ['#dcc9a0', '#d2bd91', '#e2d2ad'] as const;
const BRAID_RING_M = 0.075;

function drawBraidedJute(ctx: Carpet2DContext, plan: CarpetTexturePlan): void {
    fillAll(ctx, plan, BRAID_TONES[0]);
    const ringX = Math.max(2, px(plan, BRAID_RING_M));
    const ringY = Math.max(2, py(plan, BRAID_RING_M));
    const rings = Math.ceil(Math.min(plan.canvasW / ringX, plan.canvasH / ringY) / 2) + 1;

    for (let r = 0; r < rings; r++) {
        const x = r * ringX, y = r * ringY;
        const w = plan.canvasW - 2 * x, h = plan.canvasH - 2 * y;
        if (w <= 0 || h <= 0) break;
        ctx.fillStyle = BRAID_TONES[r % BRAID_TONES.length]!;
        // Ring = four bars. Drawn as bars rather than a stroked rect so the
        // interface stays at fillRect and the corners overlap cleanly.
        ctx.fillRect(Math.round(x), Math.round(y), Math.ceil(w), Math.ceil(ringY));
        ctx.fillRect(Math.round(x), Math.round(y + h - ringY), Math.ceil(w), Math.ceil(ringY));
        ctx.fillRect(Math.round(x), Math.round(y), Math.ceil(ringX), Math.ceil(h));
        ctx.fillRect(Math.round(x + w - ringX), Math.round(y), Math.ceil(ringX), Math.ceil(h));

        // Plait ticks — short cross-marks along each ring so it reads as rope
        // rather than a painted line. Deterministic, spaced in real metres.
        ctx.fillStyle = 'rgba(0,0,0,0.10)';
        const tick = Math.max(1, Math.round(ringX * 0.18));
        const step = Math.max(3, Math.round(ringX * 1.15));
        for (let t = 0; t < w; t += step) {
            ctx.fillRect(Math.round(x + t), Math.round(y), tick, Math.ceil(ringY));
            ctx.fillRect(Math.round(x + t), Math.round(y + h - ringY), tick, Math.ceil(ringY));
        }
        const stepV = Math.max(3, Math.round(ringY * 1.15));
        const tickV = Math.max(1, Math.round(ringY * 0.18));
        for (let t = 0; t < h; t += stepV) {
            ctx.fillRect(Math.round(x), Math.round(y + t), Math.ceil(ringX), tickV);
            ctx.fillRect(Math.round(x + w - ringX), Math.round(y + t), Math.ceil(ringX), tickV);
        }
    }
    speckle(ctx, plan, ['rgba(0,0,0,0.05)', 'rgba(255,255,255,0.06)'], 3000, 0x77b3);
}

// ── 5. Colour block (Bauhaus) ────────────────────────────────────────────────
// Asymmetric rectangular blocks on a FIXED 0.55 m module grid (so block SIZE is
// constant in metres and block COUNT grows with the rug — the parametric rule
// applied to a composition). One pale-blue L reads as the focal point.
const BLOCK_MODULE_M = 0.55;
const BLOCK_PALETTE = [
    '#2f3336', // charcoal
    '#55606b', // slate
    '#2e7f7b', // teal
    '#d19a2b', // mustard
    '#9aa0a4', // grey
    '#ece5d8', // cream
    '#55606b',
    '#2f3336',
] as const;
const BLOCK_PALE = '#a9c4d6';
const BLOCK_CREAM = '#ece5d8';

function drawColourBlock(ctx: Carpet2DContext, plan: CarpetTexturePlan): void {
    fillAll(ctx, plan, BLOCK_CREAM);
    const modW = px(plan, BLOCK_MODULE_M);
    const modH = py(plan, BLOCK_MODULE_M);
    const cols = Math.max(2, Math.round(plan.canvasW / modW));
    const rows = Math.max(2, Math.round(plan.canvasH / modH));
    const cellW = plan.canvasW / cols;
    const cellH = plan.canvasH / rows;

    const taken: boolean[] = new Array(cols * rows).fill(false);
    const at = (c: number, r: number): number => r * cols + c;

    // The L-shaped focal block: a 2×2 module group, deterministically placed
    // just off-centre, painted pale blue with its top-right cell knocked back
    // to cream — which is exactly how the reference reads.
    const lc = Math.min(cols - 2, Math.max(0, Math.floor(cols / 2) - 1));
    const lr = Math.min(rows - 2, Math.max(0, Math.floor(rows / 3)));

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (taken[at(c, r)]) continue;
            if (c >= lc && c < lc + 2 && r >= lr && r < lr + 2) continue;
            const h = hash2(c + 11, r + 7);
            // 1×1 / 2×1 / 1×2 / 2×2, clamped to what is actually free.
            let bw = (h & 1) ? 2 : 1;
            let bh = (h & 2) ? 2 : 1;
            if (c + bw > cols) bw = 1;
            if (r + bh > rows) bh = 1;
            for (let dc = 0; dc < bw; dc++) {
                for (let dr = 0; dr < bh; dr++) {
                    const cc = c + dc, rr = r + dr;
                    if (taken[at(cc, rr)] || (cc >= lc && cc < lc + 2 && rr >= lr && rr < lr + 2)) {
                        bw = Math.min(bw, dc || 1);
                        bh = Math.min(bh, dr || 1);
                    }
                }
            }
            for (let dc = 0; dc < bw; dc++) {
                for (let dr = 0; dr < bh; dr++) taken[at(c + dc, r + dr)] = true;
            }
            ctx.fillStyle = BLOCK_PALETTE[(h >>> 3) % BLOCK_PALETTE.length]!;
            ctx.fillRect(
                Math.round(c * cellW), Math.round(r * cellH),
                Math.ceil(bw * cellW) + 1, Math.ceil(bh * cellH) + 1,
            );
        }
    }

    // Focal L, painted last so nothing overdraws it.
    ctx.fillStyle = BLOCK_PALE;
    ctx.fillRect(Math.round(lc * cellW), Math.round(lr * cellH),
        Math.ceil(2 * cellW) + 1, Math.ceil(2 * cellH) + 1);
    ctx.fillStyle = BLOCK_CREAM;
    ctx.fillRect(Math.round((lc + 1) * cellW), Math.round(lr * cellH),
        Math.ceil(cellW) + 1, Math.ceil(cellH) + 1);

    speckle(ctx, plan, ['rgba(0,0,0,0.05)', 'rgba(255,255,255,0.05)'], 1400, 0xb14d);
}

// ── 6. Moons ─────────────────────────────────────────────────────────────────
// Overlapping circles and half-circles in navy / mid-blue / grey / cream, laid
// loosely on a fixed 0.42 m real-world lattice. FULL canvas.
const MOON_GROUND = '#ece4d6';
const MOON_PALETTE = ['#23324d', '#4f7599', '#9ba7ad', '#ece4d6'] as const;
const MOON_CELL_M = 0.42;

function drawMoons(ctx: Carpet2DContext, plan: CarpetTexturePlan): void {
    fillAll(ctx, plan, MOON_GROUND);
    const cellW = Math.max(6, px(plan, MOON_CELL_M));
    const cellH = Math.max(6, py(plan, MOON_CELL_M));
    const cols = Math.max(1, Math.ceil(plan.canvasW / cellW));
    const rows = Math.max(1, Math.ceil(plan.canvasH / cellH));

    for (let r = -1; r <= rows; r++) {
        for (let c = -1; c <= cols; c++) {
            const h = hash2(c + 3, r + 5);
            const cx = (c + 0.5) * cellW + (unit(h) - 0.5) * cellW * 0.35;
            const cy = (r + 0.5) * cellH + (unit(h >>> 7) - 0.5) * cellH * 0.35;
            const rad = Math.min(cellW, cellH) * (0.42 + unit(h >>> 11) * 0.22);
            ctx.fillStyle = MOON_PALETTE[(h >>> 3) % MOON_PALETTE.length]!;
            const kind = (h >>> 17) % 3;
            ctx.beginPath();
            if (kind === 0) {
                ctx.arc(cx, cy, rad, 0, Math.PI * 2);
            } else {
                // Half circle — a chord-closed arc. Orientation from the hash so
                // the field reads hand-laid rather than gridded.
                const a0 = ((h >>> 21) % 4) * (Math.PI / 2);
                ctx.arc(cx, cy, rad, a0, a0 + Math.PI);
            }
            ctx.closePath();
            ctx.fill();
        }
    }
    speckle(ctx, plan, ['rgba(0,0,0,0.05)', 'rgba(255,255,255,0.05)'], 1400, 0x2f8e);
}

// ── 7. Round braided ─────────────────────────────────────────────────────────
// Concentric braided rings in mixed bright colours on natural jute. The canvas
// is SQUARE (diameter × diameter); CircleGeometry's UVs map it 1:1 onto the disc.
const ROUND_GROUND = '#e0d6bf';
const ROUND_PALETTE = [
    '#c1452f', '#d98b2b', '#e3c34a', '#4b8b6b', '#2f6f9e', '#8a5a9e', '#e0d6bf',
] as const;
const ROUND_RING_M = 0.09;

function drawRoundBraided(ctx: Carpet2DContext, plan: CarpetTexturePlan): void {
    fillAll(ctx, plan, ROUND_GROUND);
    const cx = plan.canvasW / 2;
    const cy = plan.canvasH / 2;
    const ringPx = Math.max(2, px(plan, ROUND_RING_M));
    const maxR = Math.min(cx, cy);
    const rings = Math.max(1, Math.ceil(maxR / ringPx));

    ctx.lineCap = 'butt';
    for (let i = rings; i >= 0; i--) {
        const rOuter = Math.min(maxR, (i + 1) * ringPx);
        ctx.fillStyle = ROUND_PALETTE[i % ROUND_PALETTE.length]!;
        ctx.beginPath();
        ctx.arc(cx, cy, rOuter, 0, Math.PI * 2);
        ctx.closePath();
        ctx.fill();
    }
    // Plait ticks — short radial dashes at constant real-world spacing so each
    // ring reads as a coiled rope rather than a flat annulus.
    ctx.strokeStyle = 'rgba(0,0,0,0.14)';
    ctx.lineWidth = Math.max(1, ringPx * 0.16);
    for (let i = 0; i <= rings; i++) {
        const rMid = Math.min(maxR, (i + 0.5) * ringPx);
        const circumference = 2 * Math.PI * rMid;
        const ticks = Math.max(6, Math.round(circumference / Math.max(3, ringPx * 1.2)));
        for (let t = 0; t < ticks; t++) {
            const a = (t / ticks) * Math.PI * 2 + i * 0.21;
            const r0 = Math.max(0, rMid - ringPx * 0.45);
            const r1 = Math.min(maxR, rMid + ringPx * 0.45);
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
            ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
            ctx.stroke();
        }
    }
}

// ── 8. Line art ──────────────────────────────────────────────────────────────
// ONE continuous meandering black line looping across a cream ground. High
// cream-to-line ratio; deterministic jitter gives the hand-drawn wobble.
const LINE_GROUND = '#f2ece0';
const LINE_INK = '#1c1a18';
const LINE_LOOP_M = 0.55;
const LINE_WEIGHT_M = 0.013;

function drawLineArt(ctx: Carpet2DContext, plan: CarpetTexturePlan): void {
    fillAll(ctx, plan, LINE_GROUND);
    const pitchX = Math.max(8, px(plan, LINE_LOOP_M));
    const pitchY = Math.max(8, py(plan, LINE_LOOP_M));
    const cols = Math.max(1, Math.round(plan.canvasW / pitchX));
    const rows = Math.max(1, Math.round(plan.canvasH / pitchY));
    const stepX = plan.canvasW / cols;
    const stepY = plan.canvasH / rows;

    ctx.strokeStyle = LINE_INK;
    ctx.lineWidth = Math.max(1, px(plan, LINE_WEIGHT_M));
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    let first = true;
    for (let r = 0; r < rows; r++) {
        const leftToRight = r % 2 === 0;
        const y = (r + 0.5) * stepY;
        for (let i = 0; i < cols; i++) {
            const c = leftToRight ? i : cols - 1 - i;
            const h = hash2(c + 2, r + 9);
            const cx = (c + 0.5) * stepX;
            const jx = (unit(h) - 0.5) * stepX * 0.22;
            const jy = (unit(h >>> 9) - 0.5) * stepY * 0.22;
            const rad = Math.min(stepX, stepY) * (0.24 + unit(h >>> 15) * 0.14);
            const ex = cx + jx, ey = y + jy;
            if (first) { ctx.moveTo(ex - rad * 2, ey); first = false; }
            // Approach the loop, then a full loop as four quadratic quarters.
            ctx.quadraticCurveTo(ex - rad * 1.6, ey - rad * 0.9, ex - rad, ey);
            ctx.quadraticCurveTo(ex - rad, ey - rad * 1.4, ex, ey - rad);
            ctx.quadraticCurveTo(ex + rad * 1.4, ey - rad, ex + rad, ey);
            ctx.quadraticCurveTo(ex + rad, ey + rad * 1.4, ex, ey + rad);
            ctx.quadraticCurveTo(ex - rad * 1.4, ey + rad, ex - rad * 0.5, ey + rad * 0.4);
            ctx.quadraticCurveTo(ex + rad * 0.6, ey + rad * 0.2, ex + rad * 2, ey);
        }
        // Carry the line down to the next row and reverse direction.
        if (r < rows - 1) {
            const yNext = (r + 1.5) * stepY;
            const edge = leftToRight ? plan.canvasW * 0.97 : plan.canvasW * 0.03;
            ctx.quadraticCurveTo(edge, y + stepY * 0.5, edge, yNext);
        }
    }
    ctx.stroke();
}

// ── 9. Fine vertical stripe with blocks ──────────────────────────────────────
// Dense thin dark stripes on cream, interrupted by solid orange and tan vertical
// blocks. Uniform along the length ⇒ a 4 px-tall TILED strip: 4 KB of texture.
const FINE_CREAM = '#efe6d6';
const FINE_INK = '#2b2823';
const FINE_ORANGE = '#cf6a2a';
const FINE_TAN = '#c39b62';
const FINE_STRIPE_M = 0.028;
const FINE_STRIPE_RUN_M = 0.60;
const FINE_BLOCK_M = 0.12;

function drawFineStripe(ctx: Carpet2DContext, plan: CarpetTexturePlan): void {
    fillAll(ctx, plan, FINE_CREAM);
    const stripeW = Math.max(1, px(plan, FINE_STRIPE_M));
    const runW = px(plan, FINE_STRIPE_RUN_M);
    const blockW = px(plan, FINE_BLOCK_M);

    ctx.fillStyle = FINE_INK;
    for (let x = 0; x + stripeW * 0.5 < runW; x += stripeW * 2) {
        ctx.fillRect(Math.round(x), 0, Math.max(1, Math.round(stripeW)), plan.canvasH);
    }
    ctx.fillStyle = FINE_ORANGE;
    ctx.fillRect(Math.round(runW), 0, Math.ceil(blockW) + 1, plan.canvasH);
    ctx.fillStyle = FINE_TAN;
    ctx.fillRect(Math.round(runW + blockW), 0, Math.ceil(blockW) + 1, plan.canvasH);
}

// ── 10. Diamond trellis (my choice — see the builder header for why) ─────────
// Indigo diamond lattice on ivory. TILED at one 0.30 m cell: the diamond touches
// all four edge midpoints, so a single cell wraps seamlessly in both axes.
const TRELLIS_IVORY = '#f0ebe0';
const TRELLIS_INDIGO = '#33456b';
const TRELLIS_WEIGHT_M = 0.014;

function drawDiamondTrellis(ctx: Carpet2DContext, plan: CarpetTexturePlan): void {
    fillAll(ctx, plan, TRELLIS_IVORY);
    const w = plan.canvasW, h = plan.canvasH;
    ctx.strokeStyle = TRELLIS_INDIGO;
    ctx.lineWidth = Math.max(1, px(plan, TRELLIS_WEIGHT_M));
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const diamond = (inset: number): void => {
        ctx.beginPath();
        ctx.moveTo(inset, h / 2);
        ctx.lineTo(w / 2, inset);
        ctx.lineTo(w - inset, h / 2);
        ctx.lineTo(w / 2, h - inset);
        ctx.closePath();
        ctx.stroke();
    };
    diamond(0);
    // Second, inset lattice line — the classic double trellis.
    ctx.lineWidth = Math.max(1, px(plan, TRELLIS_WEIGHT_M) * 0.6);
    diamond(Math.min(w, h) * 0.14);

    // Wool grain, kept inside the tile so it cannot seam at the wrap.
    speckle(ctx, plan, ['rgba(0,0,0,0.06)', 'rgba(255,255,255,0.07)'], 2600, 0x4d92);
}
