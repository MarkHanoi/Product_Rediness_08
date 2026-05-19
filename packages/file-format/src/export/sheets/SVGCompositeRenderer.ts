/**
 * SVGCompositeRenderer — DOC-3.3 full implementation
 *
 * Assembles a multi-layer SVG from projection linework, wall poche fills, and
 * annotation overlays.  Z-order (lowest → highest):
 *   1. Background  (white rect)
 *   2. Poche fills  (solid wall interiors from PocheFillBuilder)
 *   3. Projection linework  (per-layer <line> elements from OBC TechnicalDrawing)
 *   4. AEC symbol linework  (door swings, stair arrows, datum lines)
 *   5. Annotation overlay  (dimensions, tags, section marks, grid bubbles, …)
 *
 * Coordinate convention:
 *   SVG origin (0, 0) is the paper top-left.
 *   svgX(worldX) = (worldX − originX) / scale × 1000   [metres → paper mm]
 *   svgY(worldZ) = (worldZ − originZ) / scale × 1000   [metres → paper mm]
 *   1 SVG user unit = 1 mm.  SVG element carries width/height with "mm" units.
 *
 * Contract compliance:
 *   §01 §5  — No Three.js scene manipulation; geometry is read-only.
 *   §05 §4  — No DOM creation; pure string output.
 *   §01 §3.3 — All public input/output types are plain objects + primitives.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { PocheFillBuilder, PochePolygon } from '@pryzm/core-app-model/views';
import type { VGCategoryStyle } from '@pryzm/core-app-model';
import type { AnnotationElement } from '@pryzm/plugin-annotations';
import { HatchPatternLibrary, type SvgHatchDef } from './HatchPatternLibrary';

// ── Re-export for consumers that import only from this module ─────────────────
export type { PochePolygon };
export type SVGPochePolygon = PochePolygon;

// ─────────────────────────────────────────────────────────────────────────────
// ViewBox descriptor — callers supply paper-space dimensions for the SVG root
// ─────────────────────────────────────────────────────────────────────────────

export interface SVGViewBox {
    /** World-space X origin (metres) mapped to SVG left edge */
    originX: number;
    /** World-space Z origin (metres) mapped to SVG top edge */
    originZ: number;
    /** Width in paper-space mm */
    widthMm: number;
    /** Height in paper-space mm */
    heightMm: number;
    /** Drawing scale denominator (e.g. 100 for 1:100) */
    scale: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// ISO 13567 default line weights per layer (mm, paper-space)
// ─────────────────────────────────────────────────────────────────────────────

const ISO_LINE_WEIGHTS: Record<string, number> = {
    'A-WALL':              0.50,
    'A-WALL-PATT':         0.18,
    'A-DOOR':              0.35,
    'A-GLAZ':              0.35,
    'A-FLOR':              0.50,
    'A-FLOR-HRAL':         0.25,
    'A-COLS':              0.50,
    'A-STRS':              0.35,
    'A-ROOF':              0.35,
    'A-ROOF-OTLN':         0.25,
    'A-ANNO':              0.18,
    'A-ANNO-DIMS':         0.18,
    'A-ANNO-SYMB':         0.25,
    'A-ANNO-TEXT':         0.18,
    'S-GRID':              0.18,
    'S-BEAM':              0.35,
    'S-COLS':              0.50,
    'projection-visible':  0.25,
    'projection-hidden':   0.18,
};

/** PRYZM 1-6 line-weight scale → paper-space mm */
const PRYZM_WEIGHT_TO_MM = [0, 0.18, 0.25, 0.35, 0.50, 0.70, 1.00];

function pryzmWeightToMm(w: number): number {
    const idx = Math.round(Math.max(1, Math.min(6, w)));
    return PRYZM_WEIGHT_TO_MM[idx] ?? 0.25;
}

// ─────────────────────────────────────────────────────────────────────────────
// Extracted projection line segment (internal)
// ─────────────────────────────────────────────────────────────────────────────

interface ProjectionLine {
    x1: number; y1: number;
    x2: number; y2: number;
    layer: string;
    color: string;
    lineWeightMm: number;
    hidden: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// SVGCompositeRenderer
// ─────────────────────────────────────────────────────────────────────────────

export class SVGCompositeRenderer {

    private _pochePolygons: PochePolygon[] = [];
    private _projectionLines: ProjectionLine[] = [];
    private _annotations: AnnotationElement[] = [];
    private _viewBox: SVGViewBox;
    private _layerLineWeights: Record<string, number> = { ...ISO_LINE_WEIGHTS };

    constructor(viewBox: SVGViewBox) {
        this._viewBox = viewBox;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Configuration API
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Override line weights for specific layers (values in paper-space mm).
     * Merged on top of ISO defaults; call before renderToSVGString().
     */
    setLayerLineWeights(weights: Record<string, number>): this {
        Object.assign(this._layerLineWeights, weights);
        return this;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // DOC-2.5j — Poche layer API (unchanged)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Extract wall poche polygons from an OBC TechnicalDrawing layer and add
     * them to the internal poche buffer.
     */
    buildWallPoche(
        drawing: any,
        vgStyle: VGCategoryStyle,
        layerName = 'A-WALL',
    ): void {
        const layer = drawing?.layers?.get?.(layerName);
        if (!layer) return;

        const geo: THREE.BufferGeometry | undefined =
            (layer as any).geometry ??
            (layer as any).mesh?.geometry ??
            (layer as any).line?.geometry ??
            undefined;

        if (!geo) return;

        const opacity = 1 - (vgStyle.transparency / 100);
        const polygons = PocheFillBuilder.fromGeometry(geo, vgStyle.fillColor, opacity);

        // DOC-4.6 — propagate hatch pattern from VG style onto each polygon
        const fp = vgStyle.fillPattern;
        if (fp && fp !== 'solid') {
            const sc = vgStyle.edgeColor ?? '#333333';
            for (const poly of polygons) {
                poly.fillPattern = fp;
                poly.strokeColor = sc;
            }
        }

        this._pochePolygons.push(...polygons);
    }

    /**
     * Directly add pre-computed poche polygons to the renderer buffer.
     */
    addPocheLayer(polygons: PochePolygon[]): void {
        this._pochePolygons.push(...polygons);
    }

    /**
     * Clear the poche buffer.
     */
    clearPoche(): void {
        this._pochePolygons = [];
    }

    /** Read-only snapshot of the current poche polygon buffer. */
    get pochePolygons(): readonly PochePolygon[] {
        return this._pochePolygons;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // DOC-3.3 — Technical drawing linework ingestion
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Extract all LineSegments from an OBC TechnicalDrawing and accumulate them
     * into the internal projection-line buffer.  Call once per drawing/viewport
     * before renderToSVGString().
     *
     * @param drawing - OBC TechnicalDrawing (duck-typed; traverses `.three` Group).
     */
    setTechnicalDrawing(drawing: any): this {
        if (!drawing?.three) return this;
        this._projectionLines = [];

        (drawing.three as THREE.Group).traverse((child: THREE.Object3D) => {
            if (!(child instanceof THREE.LineSegments)) return;

            const layerName: string =
                child.userData?.layer ??
                child.userData?.layerName ??
                'projection-visible';

            const hidden = layerName.toLowerCase().includes('hidden') ||
                           child.userData?.hidden === true;

            const mat = child.material as THREE.LineBasicMaterial;
            const color = mat?.color ? '#' + mat.color.getHexString() : '#1a1a1a';

            // linewidth on LineBasicMaterial is the PRYZM 1-6 scale stored by VGSceneApplicator
            const rawWeight = (mat as any)?.linewidth;
            const lineWeightMm = (typeof rawWeight === 'number' && rawWeight >= 1 && rawWeight <= 6)
                ? pryzmWeightToMm(rawWeight)
                : (this._layerLineWeights[layerName] ?? ISO_LINE_WEIGHTS['projection-visible']);

            const posAttr = child.geometry?.getAttribute('position');
            if (!posAttr) return;

            const arr = posAttr.array as Float32Array;
            for (let i = 0; i + 5 < arr.length; i += 6) {
                const wx1 = arr[i],     wz1 = arr[i + 2];
                const wx2 = arr[i + 3], wz2 = arr[i + 5];
                if (wx1 === wx2 && wz1 === wz2) continue;
                this._projectionLines.push({
                    x1: wx1, y1: wz1,
                    x2: wx2, y2: wz2,
                    layer: layerName,
                    color,
                    lineWeightMm,
                    hidden,
                });
            }
        });

        return this;
    }

    /**
     * Set the annotation elements to render in the annotation overlay layer.
     * Replaces any previously set annotations.
     *
     * @param annotations - Flat array of AnnotationElement DTOs for this view.
     */
    setAnnotations(annotations: AnnotationElement[]): this {
        this._annotations = annotations.slice();
        return this;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // DOC-3.3 — Full SVG rendering
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Render the accumulated layers to a complete, standalone SVG string.
     *
     * Layer order:  background → poche fills → projection linework → annotations.
     */
    renderToSVGString(): string {
        const vb = this._viewBox;
        const W = vb.widthMm;
        const H = vb.heightMm;

        const sx = (wx: number): number => ((wx - vb.originX) / vb.scale) * 1000;
        const sy = (wz: number): number => ((wz - vb.originZ) / vb.scale) * 1000;
        const f = (n: number) => n.toFixed(3);

        const lines: string[] = [];

        // ── SVG root ─────────────────────────────────────────────────────────
        lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
        lines.push(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"`);
        lines.push(`     width="${W}mm" height="${H}mm" viewBox="0 0 ${f(W)} ${f(H)}">`);

        // ── DOC-4.6 — Collect hatch pattern defs for patterned poche polygons ──
        const hatchDefs: SvgHatchDef[] = [];
        const hatchMap  = new Map<PochePolygon, SvgHatchDef>();

        for (const poly of this._pochePolygons) {
            if (poly.fillPattern && poly.fillPattern !== 'solid') {
                const def = HatchPatternLibrary.getSvgPatternDef(
                    poly.fillPattern,
                    poly.fill,
                    poly.strokeColor ?? '#333333',
                    4, // 4 mm tile — standard 1:100 AEC hatch spacing
                );
                hatchDefs.push(def);
                hatchMap.set(poly, def);
            }
        }

        // ── <defs> block (hatch patterns) — inserted before background rect ──
        const defsBlock = HatchPatternLibrary.buildSvgDefs(hatchDefs);
        if (defsBlock) {
            lines.push(defsBlock);
        }

        // ── Background ───────────────────────────────────────────────────────
        lines.push(`  <rect width="${f(W)}" height="${f(H)}" fill="#ffffff"/>`);

        // ── Layer 1: Poche fills ──────────────────────────────────────────────
        if (this._pochePolygons.length > 0) {
            lines.push(`  <g id="poche-fills">`);
            for (const poly of this._pochePolygons) {
                const pts = poly.points.split(' ').map(pair => {
                    const [wx, wz] = pair.split(',').map(Number);
                    return `${f(sx(wx))},${f(sy(wz))}`;
                }).join(' ');
                // DOC-4.6 — use pattern fill reference for hatched polygons
                const def       = hatchMap.get(poly);
                const fillAttr  = def ? def.fillRef : poly.fill;
                lines.push(`    <polygon points="${pts}" fill="${fillAttr}" fill-opacity="${poly.opacity.toFixed(3)}" stroke="none"/>`);
            }
            lines.push(`  </g>`);
        }

        // ── Layer 2: Projection linework ──────────────────────────────────────
        if (this._projectionLines.length > 0) {
            // Group by layer name for clean SVG output
            const byLayer = new Map<string, ProjectionLine[]>();
            for (const pl of this._projectionLines) {
                if (!byLayer.has(pl.layer)) byLayer.set(pl.layer, []);
                byLayer.get(pl.layer)!.push(pl);
            }

            lines.push(`  <g id="projection-linework">`);
            for (const [layerName, segs] of byLayer) {
                const first = segs[0];
                const dash = first.hidden ? ` stroke-dasharray="4 2"` : '';
                const safeId = layerName.replace(/[^a-zA-Z0-9_-]/g, '_');
                lines.push(`    <g id="layer-${safeId}" stroke="${first.color}" stroke-linecap="round"${dash}>`);
                for (const seg of segs) {
                    const w = f(seg.lineWeightMm);
                    lines.push(`      <line x1="${f(sx(seg.x1))}" y1="${f(sy(seg.y1))}" x2="${f(sx(seg.x2))}" y2="${f(sy(seg.y2))}" stroke-width="${w}"/>`);
                }
                lines.push(`    </g>`);
            }
            lines.push(`  </g>`);
        }

        // ── Layer 3: Annotation overlay ───────────────────────────────────────
        if (this._annotations.length > 0) {
            const DEF_COLOR = '#1a2035';
            const DEF_FONT  = 'Arial, Helvetica, sans-serif';

            lines.push(`  <g id="annotations" fill="${DEF_COLOR}" stroke="${DEF_COLOR}" font-family="${DEF_FONT}">`);

            for (const ann of this._annotations) {
                const s    = ann.style ?? {};
                const p    = ann.parameters ?? {};
                const pts  = ann.geometry2D?.modelPoints ?? [];
                const off  = ann.geometry2D?.offset ?? 0;
                const lc   = s.lineColor ?? DEF_COLOR;
                const tc   = s.textColor ?? DEF_COLOR;
                const lw   = f(s.lineWeight ?? 0.25);
                const tsz  = s.textSizeMm ?? 2.5;
                const font = s.fontFamily ?? DEF_FONT;
                const arrSz = s.arrowSizeMm ?? 2.0;

                const p0 = pts[0] ? { x: sx(pts[0].x), y: sy(pts[0].z) } : null;
                const p1 = pts[1] ? { x: sx(pts[1].x), y: sy(pts[1].z) } : null;

                try {
                    switch (ann.type) {

                        // ── Linear dimension ─────────────────────────────────
                        case 'linear-dim': {
                            if (!p0 || !p1) break;
                            lines.push(...this._svgLinearDim(p0, p1, off, vb.scale, p, s, lc, tc, lw, tsz, font, arrSz));
                            break;
                        }

                        // ── Angular dimension ────────────────────────────────
                        case 'angular-dim': {
                            if (pts.length < 3) break;
                            const pV = { x: sx(pts[1].x), y: sy(pts[1].z) };
                            const pA = { x: sx(pts[0].x), y: sy(pts[0].z) };
                            const pB = { x: sx(pts[2].x), y: sy(pts[2].z) };
                            lines.push(...this._svgAngularDim(pV, pA, pB, p, lc, tc, lw, tsz, font));
                            break;
                        }

                        // ── Radius / diameter dimension ──────────────────────
                        case 'radius-dim':
                        case 'diameter-dim': {
                            if (!p0 || !p1) break;
                            const prefix = ann.type === 'radius-dim' ? 'R' : 'Ø';
                            const distM = Math.hypot(pts[1].x - pts[0].x, pts[1].z - pts[0].z);
                            const label = p.override ?? `${prefix}${Math.round(distM * 1000)}`;
                            const midX = (p0.x + p1.x) / 2;
                            const midY = (p0.y + p1.y) / 2;
                            lines.push(`    <g stroke="${lc}" fill="none" stroke-width="${lw}">`);
                            lines.push(`      <line x1="${f(p0.x)}" y1="${f(p0.y)}" x2="${f(p1.x)}" y2="${f(p1.y)}"/>`);
                            lines.push(`    </g>`);
                            lines.push(`    <text x="${f(midX)}" y="${f(midY - 1)}" font-size="${f(tsz)}" fill="${tc}" font-family="${font}" text-anchor="middle">${_esc(label)}</text>`);
                            break;
                        }

                        // ── Slope dimension ──────────────────────────────────
                        case 'slope-dim': {
                            if (!p0) break;
                            const slope = p.slopeRatio ?? p.slope ?? '1:10';
                            lines.push(`    <text x="${f(p0.x)}" y="${f(p0.y)}" font-size="${f(tsz)}" fill="${tc}" font-family="${font}" text-anchor="middle">${_esc(String(slope))}</text>`);
                            break;
                        }

                        // ── Text note ────────────────────────────────────────
                        case 'text-note': {
                            if (!p0) break;
                            const text = String(p.text ?? '');
                            const bold   = p.bold   ? 'bold'   : 'normal';
                            const italic = p.italic ? 'italic' : 'normal';
                            const rows = text.split('\n');
                            lines.push(`    <text x="${f(p0.x)}" y="${f(p0.y)}" font-size="${f(tsz)}" fill="${tc}" font-family="${font}" font-weight="${bold}" font-style="${italic}">`);
                            for (let ri = 0; ri < rows.length; ri++) {
                                const dy = ri === 0 ? '0' : `${f(tsz * 1.4)}`;
                                lines.push(`      <tspan x="${f(p0.x)}" dy="${dy}">${_esc(rows[ri])}</tspan>`);
                            }
                            lines.push(`    </text>`);
                            break;
                        }

                        // ── Detail line ──────────────────────────────────────
                        case 'detail-line': {
                            if (pts.length < 2) break;
                            const ptStr = pts.map(pt => `${f(sx(pt.x))},${f(sy(pt.z))}`).join(' ');
                            lines.push(`    <polyline points="${ptStr}" stroke="${lc}" stroke-width="${lw}" fill="none"/>`);
                            break;
                        }

                        // ── Element tag ──────────────────────────────────────
                        case 'tag': {
                            if (!p0) break;
                            const label = p.cachedLabel ?? p.labelExpression ?? '';
                            lines.push(...this._svgTagBubble(p0, label, tsz, tc, lc, lw, font));
                            if (p.showLeader && p1) {
                                lines.push(`    <line x1="${f(p0.x)}" y1="${f(p0.y)}" x2="${f(p1.x)}" y2="${f(p1.y)}" stroke="${lc}" stroke-width="${lw}" fill="none"/>`);
                            }
                            break;
                        }

                        // ── Spot elevation ───────────────────────────────────
                        case 'spot-elevation': {
                            if (!p0) break;
                            const unit      = p.unit ?? 'm';
                            const elevation = typeof p.elevation === 'number' ? p.elevation : 0;
                            const val = unit === 'mm' ? `${Math.round(elevation * 1000)} mm` : `${elevation.toFixed(3)} m`;
                            lines.push(`    <g stroke="${lc}" stroke-width="${lw}" fill="none">`);
                            lines.push(`      <polygon points="${f(p0.x)},${f(p0.y - arrSz)} ${f(p0.x + arrSz * 0.6)},${f(p0.y)} ${f(p0.x)},${f(p0.y + arrSz)} ${f(p0.x - arrSz * 0.6)},${f(p0.y)}" fill="${lc}"/>`);
                            lines.push(`    </g>`);
                            lines.push(`    <text x="${f(p0.x + arrSz + 0.5)}" y="${f(p0.y + tsz * 0.35)}" font-size="${f(tsz)}" fill="${tc}" font-family="${font}">${_esc(val)}</text>`);
                            break;
                        }

                        // ── Keynote ──────────────────────────────────────────
                        case 'keynote': {
                            if (!p0) break;
                            const key = p.keynoteKey ?? p.code ?? '';
                            lines.push(`    <circle cx="${f(p0.x)}" cy="${f(p0.y)}" r="${f(tsz * 0.8)}" stroke="${lc}" stroke-width="${lw}" fill="white"/>`);
                            lines.push(`    <text x="${f(p0.x)}" y="${f(p0.y + tsz * 0.35)}" font-size="${f(tsz * 0.85)}" fill="${tc}" font-family="${font}" text-anchor="middle">${_esc(key)}</text>`);
                            break;
                        }

                        // ── Door tag ─────────────────────────────────────────
                        case 'door-tag': {
                            if (!p0) break;
                            const lines2 = [
                                p.typeMark ?? p.type ?? 'D',
                                [p.width ? `W:${Math.round((p.width ?? 0) * 1000)}` : null,
                                 p.height ? `H:${Math.round((p.height ?? 0) * 1000)}` : null]
                                 .filter(Boolean).join(' '),
                            ].filter(Boolean);
                            lines.push(...this._svgMultilineTag(p0, lines2, tsz, tc, lc, lw, font));
                            break;
                        }

                        // ── Window tag ───────────────────────────────────────
                        case 'window-tag': {
                            if (!p0) break;
                            const lines2 = [
                                p.typeMark ?? p.type ?? 'W',
                                [p.width ? `W:${Math.round((p.width ?? 0) * 1000)}` : null,
                                 p.height ? `H:${Math.round((p.height ?? 0) * 1000)}` : null]
                                 .filter(Boolean).join(' '),
                            ].filter(Boolean);
                            lines.push(...this._svgMultilineTag(p0, lines2, tsz, tc, lc, lw, font));
                            break;
                        }

                        // ── Level tag ────────────────────────────────────────
                        case 'level-tag': {
                            if (!p0) break;
                            const elev = typeof p.elevation === 'number' ? p.elevation.toFixed(3) : '0.000';
                            const label2 = `${p.levelName ?? 'Level'} ▶ ${elev} m`;
                            const tri = `${f(p0.x - arrSz)},${f(p0.y)} ${f(p0.x)},${f(p0.y - arrSz)} ${f(p0.x)},${f(p0.y + arrSz)}`;
                            lines.push(`    <g stroke="${lc}" stroke-width="${lw}">`);
                            lines.push(`      <polygon points="${tri}" fill="${lc}"/>`);
                            lines.push(`      <line x1="${f(p0.x)}" y1="${f(p0.y)}" x2="${f(p0.x + vb.widthMm * 0.2)}" y2="${f(p0.y)}" stroke-dasharray="4 2"/>`);
                            lines.push(`    </g>`);
                            lines.push(`    <text x="${f(p0.x + arrSz + 1)}" y="${f(p0.y + tsz * 0.35)}" font-size="${f(tsz)}" fill="${tc}" font-family="${font}">${_esc(label2)}</text>`);
                            break;
                        }

                        // ── Grid bubble ──────────────────────────────────────
                        case 'grid-bubble': {
                            if (!p0) break;
                            const gname = String(p.gridName ?? p.gridId ?? p.label ?? '');
                            const r = tsz * 1.2;
                            lines.push(`    <g stroke="${lc}" stroke-width="${lw}">`);
                            lines.push(`      <circle cx="${f(p0.x)}" cy="${f(p0.y)}" r="${f(r)}" fill="white"/>`);
                            if (p1) {
                                lines.push(`      <line x1="${f(p0.x)}" y1="${f(p0.y)}" x2="${f(p1.x)}" y2="${f(p1.y)}"/>`);
                            }
                            lines.push(`    </g>`);
                            lines.push(`    <text x="${f(p0.x)}" y="${f(p0.y + tsz * 0.35)}" font-size="${f(tsz)}" fill="${tc}" font-family="${font}" text-anchor="middle" font-weight="bold">${_esc(gname)}</text>`);
                            break;
                        }

                        // ── Section mark ─────────────────────────────────────
                        case 'section-mark': {
                            if (!p0 || !p1) break;
                            const ref = p.sheetNumber ?? p.reference ?? '';
                            const det = p.detailNumber ?? p.detailRef ?? '';
                            const r2 = tsz * 1.4;
                            lines.push(`    <g stroke="${lc}" stroke-width="${lw}" fill="none">`);
                            lines.push(`      <line x1="${f(p0.x)}" y1="${f(p0.y)}" x2="${f(p1.x)}" y2="${f(p1.y)}" stroke-dasharray="6 3"/>`);
                            lines.push(`      <circle cx="${f(p0.x)}" cy="${f(p0.y)}" r="${f(r2)}" fill="white"/>`);
                            lines.push(`      <circle cx="${f(p1.x)}" cy="${f(p1.y)}" r="${f(r2)}" fill="white"/>`);
                            lines.push(`    </g>`);
                            lines.push(`    <text x="${f(p0.x)}" y="${f(p0.y - 0.5)}" font-size="${f(tsz * 0.8)}" fill="${tc}" font-family="${font}" text-anchor="middle">${_esc(det)}</text>`);
                            lines.push(`    <text x="${f(p0.x)}" y="${f(p0.y + tsz * 0.9)}" font-size="${f(tsz * 0.8)}" fill="${tc}" font-family="${font}" text-anchor="middle">${_esc(ref)}</text>`);
                            break;
                        }

                        // ── Elevation mark ───────────────────────────────────
                        case 'elevation-mark': {
                            if (!p0) break;
                            const ref2 = p.sheetNumber ?? '';
                            const det2 = p.detailNumber ?? '';
                            const r3   = tsz * 1.6;
                            const dir  = (p.directionDeg ?? 0) * (Math.PI / 180);
                            const ax   = p0.x + r3 * Math.cos(dir);
                            const ay   = p0.y + r3 * Math.sin(dir);
                            lines.push(`    <g stroke="${lc}" stroke-width="${lw}" fill="none">`);
                            lines.push(`      <circle cx="${f(p0.x)}" cy="${f(p0.y)}" r="${f(r3)}" fill="white"/>`);
                            lines.push(`      <line x1="${f(p0.x)}" y1="${f(p0.y)}" x2="${f(ax)}" y2="${f(ay)}"/>`);
                            lines.push(`    </g>`);
                            lines.push(`    <text x="${f(p0.x)}" y="${f(p0.y - 0.5)}" font-size="${f(tsz * 0.8)}" fill="${tc}" font-family="${font}" text-anchor="middle">${_esc(det2)}</text>`);
                            lines.push(`    <text x="${f(p0.x)}" y="${f(p0.y + tsz * 0.9)}" font-size="${f(tsz * 0.8)}" fill="${tc}" font-family="${font}" text-anchor="middle">${_esc(ref2)}</text>`);
                            break;
                        }

                        // ── Callout detail ───────────────────────────────────
                        case 'callout-detail': {
                            if (!p0) break;
                            const bw = tsz * 4;
                            const bh = tsz * 2;
                            const ref3  = p.sheetNumber ?? '';
                            const det3  = p.detailRef ?? p.detailNumber ?? '';
                            lines.push(`    <g stroke="${lc}" stroke-width="${lw}">`);
                            lines.push(`      <rect x="${f(p0.x - bw / 2)}" y="${f(p0.y - bh / 2)}" width="${f(bw)}" height="${f(bh)}" fill="white" rx="1"/>`);
                            if (p1) {
                                lines.push(`      <line x1="${f(p0.x + bw / 2)}" y1="${f(p0.y)}" x2="${f(p1.x)}" y2="${f(p1.y)}"/>`);
                            }
                            lines.push(`    </g>`);
                            lines.push(`    <text x="${f(p0.x)}" y="${f(p0.y - 0.3)}" font-size="${f(tsz * 0.85)}" fill="${tc}" font-family="${font}" text-anchor="middle">${_esc(det3)}</text>`);
                            lines.push(`    <text x="${f(p0.x)}" y="${f(p0.y + tsz)}" font-size="${f(tsz * 0.85)}" fill="${tc}" font-family="${font}" text-anchor="middle">${_esc(ref3)}</text>`);
                            break;
                        }

                        // ── Revision cloud ───────────────────────────────────
                        case 'revision-cloud': {
                            if (pts.length < 3) break;
                            const ptStr2 = pts.map(pt => `${f(sx(pt.x))},${f(sy(pt.z))}`).join(' ');
                            lines.push(`    <polygon points="${ptStr2}" fill="none" stroke="${lc}" stroke-width="${lw}" stroke-dasharray="3 1.5"/>`);
                            break;
                        }

                        // ── Room tag ─────────────────────────────────────────
                        case 'room-tag': {
                            if (!p0) break;
                            const roomName = p.roomName ?? '';
                            const roomNum  = p.roomNumber ?? '';
                            const area     = p.areaLabel ?? (typeof p.area === 'number' ? `${p.area.toFixed(2)} m²` : '');
                            lines.push(`    <g font-family="${font}" text-anchor="middle">`);
                            lines.push(`      <text x="${f(p0.x)}" y="${f(p0.y - tsz)}" font-size="${f(tsz)}" fill="${tc}" font-weight="bold">${_esc(roomName)}</text>`);
                            if (roomNum) {
                                lines.push(`      <text x="${f(p0.x)}" y="${f(p0.y)}" font-size="${f(tsz * 0.9)}" fill="${tc}">${_esc(roomNum)}</text>`);
                            }
                            if (area) {
                                lines.push(`      <text x="${f(p0.x)}" y="${f(p0.y + tsz * 1.2)}" font-size="${f(tsz * 0.8)}" fill="${tc}">${_esc(area)}</text>`);
                            }
                            lines.push(`    </g>`);
                            break;
                        }

                        // ── Room fill ────────────────────────────────────────
                        case 'room-fill': {
                            if (pts.length < 3) break;
                            const fillC  = p.fillColor ?? s.fillColor ?? '#e8f4ff';
                            const fillOp = p.fillOpacity ?? 0.4;
                            const ptStr3 = pts.map(pt => `${f(sx(pt.x))},${f(sy(pt.z))}`).join(' ');
                            lines.push(`    <polygon points="${ptStr3}" fill="${fillC}" fill-opacity="${fillOp}" stroke="none"/>`);
                            break;
                        }

                        // ── Level datum line ─────────────────────────────────
                        case 'level-datum-line': {
                            if (!p0) break;
                            const elevStr = typeof p.elevation === 'number' ? p.elevation.toFixed(3) : (p.label ?? '');
                            const levelNm = p.levelName ?? '';
                            const x2Datum = p0.x + (p.lengthMm ?? vb.widthMm * 0.15);
                            lines.push(`    <g stroke="${lc}" stroke-width="${lw}">`);
                            lines.push(`      <line x1="${f(p0.x)}" y1="${f(p0.y)}" x2="${f(x2Datum)}" y2="${f(p0.y)}"/>`);
                            // small triangle tick
                            lines.push(`      <polygon points="${f(p0.x)},${f(p0.y)} ${f(p0.x + arrSz)},${f(p0.y - arrSz)} ${f(p0.x + arrSz)},${f(p0.y + arrSz)}" fill="${lc}"/>`);
                            lines.push(`    </g>`);
                            const label3 = [levelNm, elevStr].filter(Boolean).join(' — ');
                            lines.push(`    <text x="${f(p0.x - 1)}" y="${f(p0.y - 1)}" font-size="${f(tsz)}" fill="${tc}" font-family="${font}" text-anchor="end">${_esc(label3)}</text>`);
                            break;
                        }

                        // ── Section grid line ────────────────────────────────
                        case 'section-grid-line': {
                            if (!p0 || !p1) break;
                            const gname2 = String(p.gridName ?? p.gridId ?? '');
                            const r4 = tsz * 1.2;
                            lines.push(`    <g stroke="${lc}" stroke-width="${lw}">`);
                            lines.push(`      <line x1="${f(p0.x)}" y1="${f(p0.y)}" x2="${f(p1.x)}" y2="${f(p1.y)}" stroke-dasharray="8 4"/>`);
                            lines.push(`      <circle cx="${f(p0.x)}" cy="${f(p0.y)}" r="${f(r4)}" fill="white"/>`);
                            lines.push(`      <circle cx="${f(p1.x)}" cy="${f(p1.y)}" r="${f(r4)}" fill="white"/>`);
                            lines.push(`    </g>`);
                            lines.push(`    <text x="${f(p0.x)}" y="${f(p0.y + tsz * 0.35)}" font-size="${f(tsz)}" fill="${tc}" font-family="${font}" text-anchor="middle" font-weight="bold">${_esc(gname2)}</text>`);
                            lines.push(`    <text x="${f(p1.x)}" y="${f(p1.y + tsz * 0.35)}" font-size="${f(tsz)}" fill="${tc}" font-family="${font}" text-anchor="middle" font-weight="bold">${_esc(gname2)}</text>`);
                            break;
                        }

                        // ── Roof slope arrow ─────────────────────────────────
                        case 'roof-slope-arrow': {
                            if (!p0) break;
                            const slope2 = p.slopeRatio ?? p.slope ?? '1:10';
                            const ang    = (p.directionDeg ?? 0) * (Math.PI / 180);
                            const tipX   = p0.x + arrSz * 2 * Math.cos(ang);
                            const tipY   = p0.y + arrSz * 2 * Math.sin(ang);
                            lines.push(...this._svgArrow(p0, { x: tipX, y: tipY }, lc, lw, arrSz));
                            lines.push(`    <text x="${f(p0.x)}" y="${f(p0.y - 1)}" font-size="${f(tsz)}" fill="${tc}" font-family="${font}" text-anchor="middle">${_esc(String(slope2))}</text>`);
                            break;
                        }

                        default:
                            // Unknown type — emit a small cross marker at p0 position as fallback
                            if (p0) {
                                lines.push(`    <g stroke="${lc}" stroke-width="${lw}"><line x1="${f(p0.x - 1)}" y1="${f(p0.y - 1)}" x2="${f(p0.x + 1)}" y2="${f(p0.y + 1)}"/><line x1="${f(p0.x + 1)}" y1="${f(p0.y - 1)}" x2="${f(p0.x - 1)}" y2="${f(p0.y + 1)}"/></g>`);
                            }
                    }
                } catch {
                    // Per-annotation render failure is non-fatal; skip and continue.
                }
            }

            lines.push(`  </g>`);
        }

        // ── Close SVG ────────────────────────────────────────────────────────
        lines.push(`</svg>`);

        return lines.join('\n');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Private SVG helper methods
    // ─────────────────────────────────────────────────────────────────────────

    /** Emit SVG elements for a linear dimension annotation. */
    private _svgLinearDim(
        a: { x: number; y: number },
        b: { x: number; y: number },
        offsetM: number,
        scale: number,
        p: Record<string, any>,
        _s: Record<string, any>,
        lc: string, tc: string,
        lw: string, tsz: number,
        font: string, arrSz: number,
    ): string[] {
        const f = (n: number) => n.toFixed(3);

        // Perpendicular direction in SVG paper-space
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny =  dx / len;

        // offset is in metres; convert to paper-space mm
        const offMm = (offsetM / scale) * 1000;

        const ax2 = a.x + nx * offMm;
        const ay2 = a.y + ny * offMm;
        const bx2 = b.x + nx * offMm;
        const by2 = b.y + ny * offMm;

        // Extension line gap (1 mm)
        const gap = 1.0;
        const ex1x = a.x + nx * gap; const ex1y = a.y + ny * gap;
        const ex2x = b.x + nx * gap; const ex2y = b.y + ny * gap;

        // Measurement value
        const distM = Math.hypot(b.x - a.x, b.y - a.y) / 1000 * scale; // back to world m
        const unit = p.unit ?? 'mm';
        let valStr: string;
        if (p.override) {
            valStr = String(p.override);
        } else if (unit === 'm') {
            valStr = `${distM.toFixed(3)} m`;
        } else if (unit === 'cm') {
            valStr = `${(distM * 100).toFixed(1)} cm`;
        } else {
            valStr = `${Math.round(distM * 1000)}`;
        }
        if (p.prefix) valStr = p.prefix + valStr;
        if (p.suffix) valStr = valStr + p.suffix;

        // Text angle (keep text readable)
        let angle = Math.atan2(by2 - ay2, bx2 - ax2) * (180 / Math.PI);
        if (angle > 90 || angle < -90) angle += 180;

        const midX = (ax2 + bx2) / 2;
        const midY = (ay2 + by2) / 2;
        const textOff = 1.2;

        const out: string[] = [];
        out.push(`    <g stroke="${lc}" stroke-width="${lw}" fill="none">`);
        // Extension lines
        out.push(`      <line x1="${f(ex1x)}" y1="${f(ex1y)}" x2="${f(ax2 + nx)}" y2="${f(ay2 + ny)}"/>`);
        out.push(`      <line x1="${f(ex2x)}" y1="${f(ex2y)}" x2="${f(bx2 + nx)}" y2="${f(by2 + ny)}"/>`);
        // Dimension line
        out.push(`      <line x1="${f(ax2)}" y1="${f(ay2)}" x2="${f(bx2)}" y2="${f(by2)}"/>`);
        // Arrowheads
        out.push(...this._svgArrow({ x: ax2, y: ay2 }, { x: bx2, y: by2 }, lc, lw, arrSz));
        out.push(...this._svgArrow({ x: bx2, y: by2 }, { x: ax2, y: ay2 }, lc, lw, arrSz));
        out.push(`    </g>`);
        // Label
        out.push(`    <text x="${f(midX)}" y="${f(midY - textOff)}" font-size="${f(tsz)}" fill="${tc}" font-family="${font}" text-anchor="middle" transform="rotate(${f(angle)},${f(midX)},${f(midY - textOff)})">${_esc(valStr)}</text>`);

        return out;
    }

    /** Emit SVG elements for an angular dimension annotation. */
    private _svgAngularDim(
        vertex: { x: number; y: number },
        ptA: { x: number; y: number },
        ptB: { x: number; y: number },
        p: Record<string, any>,
        lc: string, tc: string,
        lw: string, tsz: number,
        font: string,
    ): string[] {
        const f = (n: number) => n.toFixed(3);

        const angA = Math.atan2(ptA.y - vertex.y, ptA.x - vertex.x);
        const angB = Math.atan2(ptB.y - vertex.y, ptB.x - vertex.x);
        const r    = Math.min(
            Math.hypot(ptA.x - vertex.x, ptA.y - vertex.y),
            Math.hypot(ptB.x - vertex.x, ptB.y - vertex.y),
        ) * 0.5;

        const sx = vertex.x + r * Math.cos(angA);
        const sy = vertex.y + r * Math.sin(angA);
        const ex = vertex.x + r * Math.cos(angB);
        const ey = vertex.y + r * Math.sin(angB);

        let deltaRad = angB - angA;
        if (deltaRad < 0) deltaRad += 2 * Math.PI;
        const large  = deltaRad > Math.PI ? 1 : 0;

        const angDeg = typeof p.angleDeg === 'number' ? p.angleDeg : (deltaRad * 180 / Math.PI);
        const label  = p.override ?? `${angDeg.toFixed(1)}°`;

        const midAng = angA + deltaRad / 2;
        const lx     = vertex.x + (r + tsz + 1) * Math.cos(midAng);
        const ly     = vertex.y + (r + tsz + 1) * Math.sin(midAng);

        const out: string[] = [];
        out.push(`    <g stroke="${lc}" stroke-width="${lw}" fill="none">`);
        out.push(`      <path d="M ${f(sx)} ${f(sy)} A ${f(r)} ${f(r)} 0 ${large} 1 ${f(ex)} ${f(ey)}"/>`);
        out.push(`    </g>`);
        out.push(`    <text x="${f(lx)}" y="${f(ly)}" font-size="${f(tsz)}" fill="${tc}" font-family="${font}" text-anchor="middle">${_esc(label)}</text>`);

        return out;
    }

    /**
     * Emit a filled-triangle arrowhead from `from` pointing toward `to`.
     * The arrowhead is drawn at the `from` position, pointing at `to`.
     */
    private _svgArrow(
        from: { x: number; y: number },
        to:   { x: number; y: number },
        color: string, _lw: string, sizeMm: number,
    ): string[] {
        const f = (n: number) => n.toFixed(3);
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len; const uy = dy / len;
        const px = -uy;       const py = ux;

        const tipX = from.x;
        const tipY = from.y;
        const bx1  = from.x - ux * sizeMm + px * sizeMm * 0.4;
        const by1  = from.y - uy * sizeMm + py * sizeMm * 0.4;
        const bx2  = from.x - ux * sizeMm - px * sizeMm * 0.4;
        const by2  = from.y - uy * sizeMm - py * sizeMm * 0.4;

        return [`    <polygon points="${f(tipX)},${f(tipY)} ${f(bx1)},${f(by1)} ${f(bx2)},${f(by2)}" fill="${color}" stroke="none"/>`];
    }

    /** Emit a bordered tag bubble with centred text at position `p`. */
    private _svgTagBubble(
        pos: { x: number; y: number },
        label: string,
        tsz: number,
        tc: string, lc: string, lw: string,
        font: string,
    ): string[] {
        const f = (n: number) => n.toFixed(3);
        const w = Math.max(label.length * tsz * 0.6, tsz * 2);
        const h = tsz * 1.6;
        return [
            `    <g stroke="${lc}" stroke-width="${lw}">`,
            `      <rect x="${f(pos.x - w / 2)}" y="${f(pos.y - h / 2)}" width="${f(w)}" height="${f(h)}" fill="white" rx="1"/>`,
            `    </g>`,
            `    <text x="${f(pos.x)}" y="${f(pos.y + tsz * 0.35)}" font-size="${f(tsz)}" fill="${tc}" font-family="${font}" text-anchor="middle">${_esc(label)}</text>`,
        ];
    }

    /** Emit a stacked multi-line tag centred at `pos`. */
    private _svgMultilineTag(
        pos: { x: number; y: number },
        textLines: string[],
        tsz: number,
        tc: string, lc: string, lw: string,
        font: string,
    ): string[] {
        const f = (n: number) => n.toFixed(3);
        const lineH = tsz * 1.3;
        const blockH = lineH * textLines.length + 2;
        const blockW = Math.max(...textLines.map(t => t.length)) * tsz * 0.6 + 3;

        const out: string[] = [];
        out.push(`    <g stroke="${lc}" stroke-width="${lw}">`);
        out.push(`      <rect x="${f(pos.x - blockW / 2)}" y="${f(pos.y - blockH / 2)}" width="${f(blockW)}" height="${f(blockH)}" fill="white" rx="1"/>`);
        out.push(`    </g>`);
        out.push(`    <g font-family="${font}" text-anchor="middle" fill="${tc}">`);
        for (let i = 0; i < textLines.length; i++) {
            const y = pos.y - (textLines.length - 1) * lineH / 2 + i * lineH;
            const bold = i === 0 ? ' font-weight="bold"' : '';
            out.push(`      <text x="${f(pos.x)}" y="${f(y + tsz * 0.35)}" font-size="${f(i === 0 ? tsz : tsz * 0.85)}"${bold}>${_esc(textLines[i])}</text>`);
        }
        out.push(`    </g>`);
        return out;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Static convenience factory (DOC-2.5j, unchanged)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Quick helper for callers that only need wall poche from one drawing.
     */
    static renderWallPoche(
        drawing: any,
        vgStyle: VGCategoryStyle,
        viewBox: SVGViewBox,
        layerName = 'A-WALL',
    ): string {
        const r = new SVGCompositeRenderer(viewBox);
        r.buildWallPoche(drawing, vgStyle, layerName);
        return r.renderToSVGString();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Module-level utility: XML-escape text content
// ─────────────────────────────────────────────────────────────────────────────

function _esc(s: string): string {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
