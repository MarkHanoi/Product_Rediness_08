// §FEAT-FLOOR-SURFACE-FINISH (L-1881) — the ONE place that answers
// *"which plank/tile grid does this material imply?"*
//
// ─── WHY THIS EXISTS AT ALL, MEASURED 2026-08-21 (lane RAC1) ────────────────
//
// `FloorPanelBuilder` renders a floor finish from exactly TWO fields:
//
//   • its COLOUR   — `resolveFloorColor()` (FloorColourSystem.ts), which resolves
//     `floor.materialId` to the master catalogue's flat hex and nothing more;
//   • its PATTERN  — `finishSpec.finishPattern`, a ten-value enum that drives
//     `_buildTileGridOverlay` (FloorPanelBuilder.ts:389), a line grid drawn 1 mm
//     above the top face.
//
// ⛔ It binds NO TEXTURE MAPS. `applyMaterialMaps` — the one adapter that attaches
// a material's `maps` to a THREE material — is called by the SLAB, ROOF, WALL and
// CURTAIN-WALL builders and by no floor path at all (measured: `grep -rn
// applyMaterialMaps packages/geometry-slab/src` returns SlabFragmentBuilder only).
// So setting `materialId = 'parquet-oak-herringbone'` on a floor and stopping
// there paints a flat `#c8a96e` rectangle. The wood is right; the parquet is not
// there.
//
// The grid overlay IS the floor's pattern channel in this build, and it is real
// pixels. Deriving the right grid from the chosen material is therefore not a
// decoration — it is the difference between "the floor changed" and "the floor
// went a slightly different shade of brown", which is the founder-visible half of
// §L960-STEP3 applied to a different element family.
//
// ─── DERIVED, NEVER ENUMERATED ─────────────────────────────────────────────
//
// The mapping reads the master's OWN LABEL — the string the picker shows and the
// string `finishRef.ts` already matches against — so a material added to C100
// lands on a sensible grid with no edit here. A hand table of 245 material ids
// would be the seventh remember-don't-derive list this repository has paid for.
//
// PURE — no THREE, no DOM, no stores, no I/O. (An OTel span is observability,
// not a store read: the derivation below still depends on nothing but its
// argument, and `_floorPatternForMaterialLabel` is the whole of it.)

import { trace, type Tracer } from '@opentelemetry/api';
import type { FloorPattern } from '@pryzm/core-app-model';

// P8 / C10 §2 — same tracer idiom as `DeleteElementsBatchCommand.ts` /
// `moveReweldPreflight.ts` in this package (C84 EI-9: one tracer authority per
// package, never a second wrapper).
let _cachedTracer: Tracer | null = null;
function _tracer(): Tracer {
    _cachedTracer ??= trace.getTracer('@pryzm/command-registry', '0.1.0');
    return _cachedTracer;
}

/**
 * The grid a material's own label implies, or `'none'` when the label describes
 * no repeating unit.
 *
 * ⚠ `'none'` is a REAL ANSWER here, not a failure: a polished-concrete or
 * microcement floor genuinely has no joints, and drawing a 600 mm grid on one
 * would be an invented feature. `'seamless'` and `'terrazzo'` are likewise
 * accepted enum values that `_buildTileGridOverlay` deliberately skips.
 *
 * @param label the master catalogue's `label` (e.g. `"Parquet · Oak Chevron 45°
 *              (90 × 600)"`). Case-insensitive; punctuation-tolerant.
 */
export function floorPatternForMaterialLabel(label: string): FloorPattern {
    return _tracer().startActiveSpan('pryzm.floor.patternForMaterialLabel', (span) => {
        try {
            const pattern = _floorPatternForMaterialLabel(label);
            span.setAttribute('pryzm.floor.materialLabel', label);
            // Both sides are emitted because the header's whole complaint is that
            // a wrong derivation reads as "the floor went a slightly different
            // shade of brown". The label ALONE cannot tell you which arm fired,
            // and `'seamless'` is a real answer, not a fallback — a trace that
            // printed only the input could not tell those apart.
            span.setAttribute('pryzm.floor.pattern', pattern);
            return pattern;
        } finally {
            span.end();
        }
    });
}

function _floorPatternForMaterialLabel(label: string): FloorPattern {
    const t = label.toLowerCase();

    // ── Timber laid in a figured pattern. Checked BEFORE the plain-plank arm,
    //    because every one of these labels ALSO contains a board size and some
    //    contain the word "plank"; the figure is the more specific fact.
    const isTimber = /\b(?:parquet|timber|wood|oak|walnut|ash|birch|pine|teak|bamboo|plank|board)\b/.test(t);
    if (/\bherringbone\b/.test(t)) return isTimber ? 'plank-herringbone' : 'tile-herringbone';
    // Chevron / Hungarian point are mitred herringbones — the same 45°-ish
    // zig-zag grid, which is the closest true reading this enum can carry.
    if (/\b(?:chevron|hungarian)\b/.test(t)) return 'plank-herringbone';
    // Basket weave and Versailles are square PANELS of timber, so a square grid
    // reads them far better than a plank run does.
    if (/\b(?:basket weave|versailles)\b/.test(t)) return isTimber ? 'tile-600x600' : 'tile-300x300';

    if (/\bterrazzo\b/.test(t)) return 'terrazzo';

    // ── Explicit tile modules, read off the label's own dimensions. The master
    //    writes them as "600 × 600" (with U+00D7) or "600 x 600".
    const mod = /\b(\d{2,4})\s*[×x]\s*(\d{2,4})\b/.exec(t);
    if (mod !== null && !isTimber) {
        const a = Number(mod[1]);
        const b = Number(mod[2]);
        const long = Math.max(a, b);
        const short = Math.min(a, b);
        if (long === short) return short <= 400 ? 'tile-300x300' : 'tile-600x600';
        return 'tile-600x300';
    }

    // ── Plain timber boards: a plank run. `plank-90` is the enum's board-run
    //    value (100 m spacing across, 120 mm between boards).
    if (isTimber) return 'plank-90';

    if (/\b(?:tile|tiles|mosaic|hexagon|metro|subway|porcelain|ceramic|terracotta|marble|slate|quarry|chequer)\b/.test(t)) {
        return 'tile-600x600';
    }

    // ── Genuinely jointless surfaces — concrete, microcement, resin, carpet,
    //    paint. `'seamless'` is the enum's own word for exactly this, and the
    //    overlay skips it.
    return 'seamless';
}
