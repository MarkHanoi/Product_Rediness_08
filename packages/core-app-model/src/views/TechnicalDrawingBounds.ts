/**
 * TechnicalDrawingBounds — computes the axis-aligned CONTENT bounding box
 * of a TechnicalDrawing by inspecting its line-segment geometry.
 *
 * The bounding box is in drawing space (X = horizontal, Z = vertical/depth).
 * Y is always 0 in drawing space (the drawing plane).
 *
 * This is used by PdfExportService, DxfExportService and `ViewportSvgComposer`
 * (the one on-sheet producer) to:
 *   1. Size viewports correctly based on actual content, not hardcoded defaults.
 *   2. Create DrawingViewport instances with correct bounds for DxfExporter.
 *
 * Usage:
 *   const bounds = TechnicalDrawingBounds.compute(drawing);
 *   if (bounds) {
 *       const { minX, maxX, minZ, maxZ, widthM, heightM } = bounds;
 *   }
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * §SHEET-BOUNDS-EXCLUDE-FURNITURE (L-1854) — DRAWING FURNITURE IS NOT CONTENT
 * ═══════════════════════════════════════════════════════════════════════════
 * The founder, 2026-08-21:
 *   "I placed a large east elevation that I was not able to remove because I
 *    could not reach the 'x' to close it."
 *
 * His console read:
 *   [SheetEditorPanel] Viewport … is 8020×415mm at 1:50 — larger than the
 *   usable sheet area.
 *
 * A0 is 1189 mm wide, so the viewport's close control sat about seven sheet
 * widths off-canvas. 8020 mm of paper at 1:50 is 401 m of world, for a building
 * whose own crop region was 8.1 m × 21.7 m. Nothing in the model is 401 m.
 *
 * THE 401 m IS `LevelDatumLineBuilder.HALF_EXTENT`, WHICH IS 200.
 * That builder injects one horizontal line per storey spanning ±200 m at the
 * storey elevation, on layer `A-ANNO-LEVL`. Its own comment asserts
 * *"toDrawingSpace naturally clips to the drawing extent"* — **it does not.**
 * `toDrawingSpace` projects; it does not clip. So 400 m of datum rule, plus
 * 2 × 0.5 m of padding, is 8040 mm at 1:50 — the founder's number, within the
 * width of his façade. Its sibling `SectionGridLineBuilder` does the same thing
 * on `S-GRID` with `HALF_HEIGHT = 100`, i.e. 200 m VERTICALLY; the founder did
 * not see that arm only because his project has no grids.
 *
 * ⚠ THE BUILDERS ARE NOT WRONG. A datum rule that runs past the building is
 * correct drafting practice — that is what a datum rule IS. The defect is that
 * this module measured furniture as if it were the subject of the drawing. The
 * fix therefore belongs HERE and the extents stay where they are: shrinking
 * `HALF_EXTENT` would trade one magic number for another and would still be
 * wrong for any building wider than the guess.
 *
 * WHY THE LAYER NAME IS THE DISCRIMINATOR, AND WHY IT IS SAFE TO READ
 * `userData.layer` is the ONLY channel that survives OBC's
 * `toDrawingSpace()` → `addProjectionLines()` hand-off: the former returns a
 * brand-new `LineSegments` (dropping every userData key the builder set) and the
 * latter stamps `object.userData.layer = name`. That is measured and written up
 * in `DrawingLayerIdentity.ts` (§VG-LAYER-IDENTITY-IS-THE-ONLY-SURVIVOR,
 * L-1600), which is also why `SVGCompositeRenderer` reads exactly this key.
 *
 * WHAT HAPPENS WHEN A DRAWING IS *ONLY* FURNITURE
 * `compute()` returns `null`, exactly as it does for an empty drawing. That is
 * deliberate [context-data-honesty]: "this drawing has no content" and "this
 * drawing is 400 m wide" are different facts, and the consumers already branch
 * on `null` to show an honest placeholder. Reporting the furniture's extent
 * would present drafting scaffolding as the building.
 *
 * Contract compliance:
 *   §01 §5  — Read-only; no scene or store mutation.
 *   §05     — No DOM side-effects; pure geometric utility.
 */

import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';

/**
 * ISO 13567 layers whose linework is deliberately sized to OVERSPAN the
 * drawing, and which therefore describe the sheet's furniture rather than the
 * building's extent.
 *
 * Membership is a claim about a layer's PURPOSE, not about how long its lines
 * happen to be: a datum rule is furniture at any length, and a 400 m wall is
 * content. So this is a named list, never a length heuristic — a heuristic
 * would silently drop a genuinely long building the day one is modelled.
 *
 * Both members are matched by ISO base name, so sub-layers (`A-ANNO-LEVL-TEXT`)
 * are covered without a second entry.
 */
export const NON_CONTENT_LAYERS: readonly string[] = [
    // LevelDatumLineBuilder — one ±200 m horizontal rule per storey.
    'A-ANNO-LEVL',
    // SectionGridLineBuilder — one ±100 m vertical line per structural grid.
    'S-GRID',
];

/**
 * True when `layerName` names drawing furniture rather than building content.
 * Exported so a consumer can explain an exclusion rather than merely apply it.
 */
export function isNonContentLayer(layerName: string | undefined | null): boolean {
    if (!layerName) return false;
    const upper = layerName.toUpperCase();
    return NON_CONTENT_LAYERS.some(l => upper === l || upper.startsWith(`${l}-`));
}

/**
 * Read the layer a drawing object was deposited on, walking to the parent when
 * the object itself carries no stamp (OBC stamps the LineSegments, but a
 * builder may nest one inside a named group).
 */
function _layerOf(obj: THREE.Object3D): string | undefined {
    const own = obj.userData?.['layer'] ?? obj.userData?.['layerName'];
    if (typeof own === 'string' && own) return own;
    const parent = obj.parent;
    const up = parent?.userData?.['layer'] ?? parent?.userData?.['layerName'];
    return typeof up === 'string' && up ? up : undefined;
}

export interface DrawingBounds {
    /** Drawing-space X range (horizontal axis). */
    minX: number;
    maxX: number;
    /** Drawing-space Z range (vertical axis; up = more negative Z in OBC convention). */
    minZ: number;
    maxZ: number;
    /** Width in drawing-space metres. */
    widthM: number;
    /** Height in drawing-space metres. */
    heightM: number;
    /** Centre point in drawing space. */
    centre: THREE.Vector2;
}

export namespace TechnicalDrawingBounds {

    /**
     * Compute the bounding box of all line geometry in `drawing`.
     * Returns `null` when the drawing is empty (no vertices found).
     *
     * The drawing uses the OBC convention: visible area is Y = 0 plane,
     * horizontal = X axis, depth = Z axis.
     */
    export function compute(drawing: OBC.TechnicalDrawing): DrawingBounds | null {
        let minX = Infinity, maxX = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;
        let found = false;

        // Access layers via the duck-typed internal map (OBC does not expose
        // a typed public iterator but the DataMap is always iterable).
        const anyDrawing = drawing as any;

        // ── Primary path: the drawing's own CONTENT linework ──────────────────
        //
        // §SHEET-BOUNDS-EXCLUDE-FURNITURE (L-1854) — this used to be the
        // *fallback*, behind `drawing.viewports`. The order is now inverted, and
        // that is a correctness fix rather than a preference:
        //
        //  · A `DrawingViewport.bbox` is a CAMERA FRUSTUM — the clip volume the
        //    projector was set up with. It is an upper bound on what could have
        //    been drawn, not a measurement of what was. This module's own name
        //    and docstring promise the content box.
        //  · The frustum path also cannot be layer-filtered, so it would silently
        //    re-admit the 400 m datum span this whole fix exists to exclude.
        //
        // Nothing in this repo populates `drawing.viewports` today
        // (`grep -rn 'viewports.create'` over `apps/ packages/ plugins/` → 0 call
        // sites, measured 2026-08-21), so inverting the order changes no shipped
        // reading — but it means that IF something starts populating it, content
        // still wins, which is the invariant worth pinning.
        const container: THREE.Object3D | undefined =
            anyDrawing.three ??
            anyDrawing._container ??
            anyDrawing.container ??
            anyDrawing.mesh;

        if (container) {
            container.traverse((obj: THREE.Object3D) => {
                if (!(obj instanceof THREE.LineSegments)) return;
                // Drawing furniture (level datum rules, structural grid lines)
                // is deliberately drawn far past the building. Measuring it as
                // content is what put the founder's close button seven sheet
                // widths off-canvas. See the file header.
                if (isNonContentLayer(_layerOf(obj))) return;
                const pos = obj.geometry?.getAttribute?.('position') as
                    THREE.BufferAttribute | undefined;
                if (!pos || pos.count === 0) return;
                found = true;
                for (let i = 0; i < pos.count; i++) {
                    const x = pos.getX(i);
                    const z = pos.getZ(i);
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (z < minZ) minZ = z;
                    if (z > maxZ) maxZ = z;
                }
            });
        }

        if (found) return _buildResult(minX, maxX, minZ, maxZ);

        // ── Fallback: viewport frusta ─────────────────────────────────────────
        // Reached only when the drawing carries no content linework at all. A
        // frustum is a worse answer than a measurement, but it is a better
        // answer than nothing for a drawing that has framing and no geometry.
        if (anyDrawing.viewports && typeof anyDrawing.viewports.entries === 'function') {
            for (const [, vp] of anyDrawing.viewports.entries()) {
                if (typeof vp.bbox?.min?.x === 'number') {
                    const b: THREE.Box3 = vp.bbox;
                    minX = Math.min(minX, b.min.x);
                    maxX = Math.max(maxX, b.max.x);
                    minZ = Math.min(minZ, b.min.z);
                    maxZ = Math.max(maxZ, b.max.z);
                    found = true;
                }
            }
        }

        if (!found) return null;
        return _buildResult(minX, maxX, minZ, maxZ);
    }

    /**
     * Convert DrawingBounds to mm dimensions at a given drawing scale.
     * @param bounds    - Result of `compute()`.
     * @param scale     - Drawing scale denominator (e.g. 100 = 1:100).
     * @param paddingM  - Optional padding in metres on each side (default 0.5 m).
     */
    export function toMm(
        bounds: DrawingBounds,
        scale: number,
        paddingM = 0.5,
    ): { widthMm: number; heightMm: number; padX: number; padZ: number } {
        const padX = paddingM;
        const padZ = paddingM;
        const mmPerM = 1000;

        const wM = (bounds.widthM + 2 * padX);
        const hM = (bounds.heightM + 2 * padZ);

        return {
            widthMm:  wM  * mmPerM / scale,
            heightMm: hM  * mmPerM / scale,
            padX,
            padZ,
        };
    }

    /**
     * Build a `DrawingViewportConfig`-compatible bounds object from DrawingBounds.
     * Adds optional padding in drawing-space metres.
     */
    export function toViewportConfig(
        bounds: DrawingBounds,
        scale = 100,
        paddingM = 0.5,
    ): { left: number; right: number; top: number; bottom: number; scale: number } {
        return {
            left:   bounds.minX - paddingM,
            right:  bounds.maxX + paddingM,
            top:    bounds.minZ - paddingM,
            bottom: bounds.maxZ + paddingM,
            scale,
        };
    }
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _buildResult(
    minX: number, maxX: number,
    minZ: number, maxZ: number,
): DrawingBounds {
    const widthM  = Math.max(0.1, maxX - minX);
    const heightM = Math.max(0.1, maxZ - minZ);
    return {
        minX, maxX, minZ, maxZ,
        widthM, heightM,
        centre: new THREE.Vector2(
            (minX + maxX) / 2,
            (minZ + maxZ) / 2,
        ),
    };
}
