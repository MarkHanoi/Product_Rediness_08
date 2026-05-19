/**
 * HatchPatternLibrary — Contract 25a §3.2 (Phase 3)
 *
 * Defines named hatch patterns as Canvas2D CanvasPattern generators.
 * Each pattern is a tileable 12×12 (or 16×16) pixel offscreen canvas.
 *
 * Contract compliance:
 *   Contract 25 §4.2  — FillAppearance.pattern references these names
 *   Contract 25a §3.2 — HatchPatternLibrary is the sole Canvas2D pattern source
 *   Contract 05 §4    — Pure Canvas2D; no Three.js, no DOM side effects beyond
 *                        offscreen canvas creation.
 *
 * Built-in patterns:
 *   'diagonal-45'     — 45-degree diagonal hatching (masonry/concrete)
 *   'diagonal-cross'  — Cross-hatching at 45/135 degrees (general structural)
 *   'dot-grid'        — Regular dot grid (insulation / acoustic material)
 *   'brick'           — Staggered horizontal brick-bond lines
 *   'horizontal'      — Equally spaced horizontal lines (steel / fill)
 *   'vertical'        — Equally spaced vertical lines
 *
 * Extensibility:
 *   Add new entries to HATCH_PATTERN_RENDERERS without touching any consumer.
 *   Each renderer receives (ctx, fillColour, strokeColour) and draws on a 16×16 tile.
 *
 * Migration: Wave 10 Task 1 (W10-A). Lifted from src/core/drawing/HatchPatternLibrary.ts.
 * The original path is now a re-export shim pointing here.
 */

export type HatchPatternKey =
    | 'diagonal-45'
    | 'diagonal-cross'
    | 'dot-grid'
    | 'brick'
    | 'horizontal'
    | 'vertical';

type PatternRenderer = (
    ctx: CanvasRenderingContext2D,
    tileW: number,
    tileH: number,
    fillColour: string,
    strokeColour: string,
) => void;

const HATCH_PATTERN_RENDERERS: Record<string, PatternRenderer> = {

    'diagonal-45': (ctx, w, h, fill, stroke) => {
        ctx.fillStyle = fill;
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(-2, h / 2);
        ctx.lineTo(w / 2 + 2, -2);
        ctx.moveTo(0, h + 2);
        ctx.lineTo(w + 2, -2);
        ctx.moveTo(w / 2 - 2, h + 2);
        ctx.lineTo(w + 2, h / 2 - 2);
        ctx.stroke();
    },

    'diagonal-cross': (ctx, w, h, fill, stroke) => {
        ctx.fillStyle = fill;
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(-1, h / 2);
        ctx.lineTo(w / 2 + 1, -1);
        ctx.moveTo(0, h + 1);
        ctx.lineTo(w + 1, -1);
        ctx.moveTo(w / 2 - 1, h + 1);
        ctx.lineTo(w + 1, h / 2 - 1);
        ctx.moveTo(w + 1, h / 2);
        ctx.lineTo(w / 2 - 1, -1);
        ctx.moveTo(w, h + 1);
        ctx.lineTo(-1, -1);
        ctx.moveTo(-1, h / 2 - 1);
        ctx.lineTo(w / 2 + 1, h + 1);
        ctx.stroke();
    },

    'dot-grid': (ctx, w, h, fill, stroke) => {
        ctx.fillStyle = fill;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = stroke;
        const r = 0.9;
        for (let x = w / 4; x < w; x += w / 2) {
            for (let y = h / 4; y < h; y += h / 2) {
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    },

    'brick': (ctx, w, h, fill, stroke) => {
        ctx.fillStyle = fill;
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.moveTo(w / 2, 0);
        ctx.lineTo(w / 2, h / 2);
        ctx.moveTo(0, h);
        ctx.lineTo(w, h);
        ctx.moveTo(0, 0);
        ctx.lineTo(w, 0);
        ctx.stroke();
    },

    'horizontal': (ctx, w, h, fill, stroke) => {
        ctx.fillStyle = fill;
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();
    },

    'vertical': (ctx, w, h, fill, stroke) => {
        ctx.fillStyle = fill;
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(w / 2, 0);
        ctx.lineTo(w / 2, h);
        ctx.stroke();
    },
};

// ─── Cache (pattern objects are reused until settings change) ─────────────────

const _patternCache = new Map<string, CanvasPattern | null>();

function _cacheKey(patternName: string, fillColour: string, strokeColour: string): string {
    return `${patternName}|${fillColour}|${strokeColour}`;
}

/** Clear the pattern cache (e.g. after theme change). */
export function clearHatchPatternCache(): void {
    _patternCache.clear();
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns whether a pattern key is registered in the library.
 */
export function hasHatchPattern(key: string): boolean {
    return key in HATCH_PATTERN_RENDERERS;
}

/**
 * Generate (or retrieve from cache) a Canvas2D CanvasPattern for the given
 * named hatch pattern, fill colour, and stroke (line) colour.
 *
 * Returns null when:
 *   - The pattern name is not registered.
 *   - The browser environment is unavailable (SSR / worker context).
 *   - The Canvas2D context cannot be created (incognito memory pressure).
 *
 * @param ctx          The destination CanvasRenderingContext2D for createPattern().
 * @param patternName  Named key from HatchPatternKey (or any registered custom key).
 * @param fillColour   CSS colour for the tile background.
 * @param strokeColour CSS colour for the hatch lines / dots.
 */
export function getHatchPattern(
    ctx: CanvasRenderingContext2D,
    patternName: string,
    fillColour: string,
    strokeColour: string,
): CanvasPattern | null {
    const renderer = HATCH_PATTERN_RENDERERS[patternName];
    if (!renderer) return null;

    const key = _cacheKey(patternName, fillColour, strokeColour);
    if (_patternCache.has(key)) return _patternCache.get(key) ?? null;

    const tile = document.createElement('canvas');
    const TILE = 12;
    tile.width  = TILE;
    tile.height = TILE;
    const tCtx = tile.getContext('2d');
    if (!tCtx) {
        _patternCache.set(key, null);
        return null;
    }

    renderer(tCtx, TILE, TILE, fillColour, strokeColour);

    const pattern = ctx.createPattern(tile, 'repeat');
    _patternCache.set(key, pattern);
    return pattern;
}

/**
 * Apply fill style to a CanvasRenderingContext2D for a named hatch pattern.
 *
 * Sets ctx.fillStyle to either a CanvasPattern (for hatches) or the plain
 * fillColour (for solid fills or unrecognised pattern names).
 *
 * @returns true when a pattern was applied; false when solid fill is used.
 */
export function applyHatchFillStyle(
    ctx: CanvasRenderingContext2D,
    patternName: string | undefined,
    fillColour: string,
    strokeColour: string,
): boolean {
    if (!patternName || !hasHatchPattern(patternName)) {
        ctx.fillStyle = fillColour;
        return false;
    }
    const pattern = getHatchPattern(ctx, patternName, fillColour, strokeColour);
    if (!pattern) {
        ctx.fillStyle = fillColour;
        return false;
    }
    ctx.fillStyle = pattern;
    return true;
}
