/**
 * @file apps/editor/src/ui/facade/facadeOverlays.ts
 *
 * C108 §6.3 — brief §18's overlay layers, drawn on a canvas.
 *
 *     "Overlays on the actual uploaded photograph … I should be able to look at
 *      the result and immediately see whether the algorithm understood the
 *      facade."  — brief §18
 *
 * ⭐ AGAINST A REAL PHOTOGRAPH THESE ARE THE ONLY ORACLE THERE IS. The corpus has
 * ground truth to assert on; the founder's building has none, so his eye is the
 * test and this file is what it gets to look at. L-11001 is open precisely
 * because the engine has never seen a real photograph — the first one WILL find
 * failures, and a layer that renders blank instead of saying why would hide them.
 *
 * ⛔ EVERY LAYER REPORTS WHY IT COULD NOT DRAW. `LayerResult.reason` is the
 * failure-vs-empty distinction C62 §1.1 makes for values, applied to pictures: a
 * blank canvas could equally mean "nothing was found" or "this stage never ran",
 * and those are different answers.
 *
 * ⛔ NO `@pryzm/facade-reconstruction/testing` IMPORT. That subpath pulls in
 * `node:zlib`; see facadeRaster.ts's header.
 */

import type { FacadeDiagnostics, FacadeIR } from '@pryzm/facade-reconstruction';

import { blankCanvas, paintRaster } from './facadeRaster';

export const PURPLE = '#6600FF';
export const CYAN = '#00C8D0';
export const AMBER = '#FFA500';
export const RED = '#E03040';
const GREY = '#B0B0B8';

export interface LayerResult {
    readonly ok: boolean;
    /** Why nothing (or nothing useful) was drawn. `null` when the layer drew. */
    readonly reason: string | null;
}

export interface FacadeLayer {
    readonly id: string;
    readonly label: string;
    /** The brief §18 clause this layer exists to answer. */
    readonly clause: string;
    draw(canvas: HTMLCanvasElement, ir: FacadeIR, d: FacadeDiagnostics): LayerResult;
}

const OK: LayerResult = { ok: true, reason: null };
function refuse(reason: string): LayerResult {
    return { ok: false, reason };
}

/** The standing refusal for every layer that lives on the rectified facade. */
const NO_PLANE =
    'No facade plane, so there is no rectified facade to draw on. Automatic detection is ' +
    'ALLOWED to be uncertain (brief §6) — click "Set facade corners" and pick the four ' +
    'corners yourself. That is the specified fallback, not a failure.';

// ── shared drawing helpers ───────────────────────────────────────────────────

function stroke(ctx: CanvasRenderingContext2D, colour: string, width = 1.5): void {
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
}

function vLine(ctx: CanvasRenderingContext2D, x: number, h: number): void {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, h);
    ctx.stroke();
}

function hLine(ctx: CanvasRenderingContext2D, y: number, w: number): void {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(w, y + 0.5);
    ctx.stroke();
}

/**
 * `|x/a|^n + |y/b|^n = 1` — the brief §8/§9 opening, drawn as the engine fitted
 * it rather than as a rectangle.
 */
function superellipse(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    a: number,
    b: number,
    n: number,
): void {
    const e = 2 / Math.max(1e-6, n);
    ctx.beginPath();
    for (let i = 0; i <= 160; i++) {
        const t = (i / 160) * Math.PI * 2;
        const ct = Math.cos(t);
        const st = Math.sin(t);
        const x = cx + Math.sign(ct) * Math.pow(Math.abs(ct), e) * a;
        const y = cy - Math.sign(st) * Math.pow(Math.abs(st), e) * b;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();
}

/**
 * The colour a confidence scalar is drawn in.
 *
 * ⛔ `null` is NOT the bottom of the ramp — it is neutral grey. The measured ramp
 * runs red -> amber -> purple, so "we did not measure this" can never be read off
 * the picture as "we measured it and it is bad". Same rule, same reason, as
 * `confidenceColour` in the engine's overlay module (C62 §1.1).
 */
export function confidenceCss(score: number | null, alpha = 0.55): string {
    if (score === null) return `rgba(154, 154, 160, ${alpha})`;
    const t = Math.max(0, Math.min(1, score));
    const from = t < 0.5 ? [0xe0, 0x30, 0x40] : [0xff, 0xa5, 0x00];
    const to = t < 0.5 ? [0xff, 0xa5, 0x00] : [0x66, 0x00, 0xff];
    const u = t < 0.5 ? t / 0.5 : (t - 0.5) / 0.5;
    const c = from.map((v, i) => Math.round(v + (to[i]! - v) * u));
    return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})`;
}

/** ⚠ The C108 §2.1 flip, in one place. The IR counts Y UP; a raster counts rows DOWN. */
function irRectToPixels(
    node: { x: number; y: number; width: number; height: number },
    w: number,
    h: number,
): { x: number; y: number; width: number; height: number } {
    return {
        x: node.x * w,
        y: (1 - (node.y + node.height)) * h,
        width: node.width * w,
        height: node.height * h,
    };
}

// ── the layers, in brief §18's own order ─────────────────────────────────────

export const FACADE_LAYERS: readonly FacadeLayer[] = [
    {
        id: 'crop',
        label: 'Cropped photograph',
        clause: 'brief §18 — "cropped photograph"',
        draw(canvas, _ir, d) {
            return paintRaster(canvas, d.crop.image) === null ? refuse('no 2-D canvas context') : OK;
        },
    },
    {
        id: 'edges',
        label: 'Edge map',
        clause: 'the edge map every line and plane measurement was made from',
        draw(canvas, _ir, d) {
            return paintRaster(canvas, d.edges.image) === null ? refuse('no 2-D canvas context') : OK;
        },
    },
    {
        id: 'quad',
        label: 'Facade quadrilateral',
        clause: 'brief §18 — "detected facade quadrilateral"',
        draw(canvas, _ir, d) {
            const ctx = paintRaster(canvas, d.crop.image);
            if (ctx === null) return refuse('no 2-D canvas context');
            const q = d.facadeQuad.quad;
            if (q === null) {
                // ⭐ The refusal is DRAWN. A red frame says "I did not find a plane"
                // far more usefully than an empty overlay, which could equally mean
                // the stage never ran.
                stroke(ctx, RED, 4);
                ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
                return refuse(NO_PLANE);
            }
            stroke(ctx, PURPLE, 2.5);
            ctx.beginPath();
            ctx.moveTo(q[0].x, q[0].y);
            for (let i = 1; i < 4; i++) ctx.lineTo(q[i]!.x, q[i]!.y);
            ctx.closePath();
            ctx.stroke();
            ctx.fillStyle = PURPLE;
            for (const p of q) {
                ctx.beginPath();
                ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
                ctx.fill();
            }
            return OK;
        },
    },
    {
        id: 'rectified',
        label: 'Rectified facade',
        clause: 'brief §18 — "rectified facade"',
        draw(canvas, _ir, d) {
            const img = d.rectified.image;
            if (img === null) return refuse(NO_PLANE);
            return paintRaster(canvas, img) === null ? refuse('no 2-D canvas context') : OK;
        },
    },
    {
        id: 'zones',
        label: 'Horizontal zone lines',
        clause: 'brief §18 — "horizontal floor/zone lines"',
        draw(canvas, ir, d) {
            const img = d.rectified.image;
            if (img === null) return refuse(NO_PLANE);
            const ctx = paintRaster(canvas, img);
            if (ctx === null) return refuse('no 2-D canvas context');
            if (ir.facade.zones.length === 0) return refuse('no horizontal structure was resolved.');
            stroke(ctx, CYAN, 2);
            for (const zone of ir.facade.zones) {
                hLine(ctx, (1 - zone.y) * canvas.height, canvas.width);
                hLine(ctx, (1 - (zone.y + zone.height)) * canvas.height, canvas.width);
            }
            // AMBER = a periodicity BREAK (brief §14): where the comb stops fitting.
            if (d.rows !== null && d.rows.breaks.length > 0) {
                stroke(ctx, AMBER, 2);
                for (const b of d.rows.breaks) hLine(ctx, b, canvas.width);
            }
            return OK;
        },
    },
    {
        id: 'bays',
        label: 'Vertical bay lines',
        clause: 'brief §18 — "vertical bay lines"',
        draw(canvas, ir, d) {
            const img = d.rectified.image;
            if (img === null) return refuse(NO_PLANE);
            const ctx = paintRaster(canvas, img);
            if (ctx === null) return refuse('no 2-D canvas context');
            const cells = ir.facade.zones[0]?.cells ?? [];
            if (cells.length === 0) return refuse('no vertical structure was resolved.');
            stroke(ctx, CYAN, 2);
            for (const cell of cells) {
                vLine(ctx, cell.x * canvas.width, canvas.height);
                vLine(ctx, (cell.x + cell.width) * canvas.width, canvas.height);
            }
            if (d.cols !== null && d.cols.breaks.length > 0) {
                stroke(ctx, AMBER, 2);
                for (const b of d.cols.breaks) vLine(ctx, b, canvas.height);
            }
            return OK;
        },
    },
    {
        id: 'openings',
        label: 'Opening masks',
        clause: 'brief §18 — "opening masks"',
        draw(canvas, _ir, d) {
            const img = d.rectified.image;
            if (img === null) return refuse(NO_PLANE);
            const ctx = paintRaster(canvas, img);
            if (ctx === null) return refuse('no 2-D canvas context');
            if (d.blobs.length === 0) return refuse('no components survived the opening detector.');
            // ⭐ The colour split IS the information: brief §10 and §15 both turn on
            // "did this fit the grid", and PURPLE-vs-AMBER answers that at a glance
            // instead of requiring the JSON to be read.
            for (const b of d.blobs) {
                const matched = b.matchedCell !== null;
                stroke(ctx, matched ? PURPLE : AMBER, 2);
                ctx.strokeRect(b.bbox.x0, b.bbox.y0, b.bbox.x1 - b.bbox.x0, b.bbox.y1 - b.bbox.y0);
            }
            return OK;
        },
    },
    {
        id: 'arches',
        label: 'Arches',
        clause: 'brief §18 — "arches"; brief §9 — archness is CONTINUOUS, never bucketed',
        draw(canvas, ir, d) {
            const img = d.rectified.image;
            if (img === null) return refuse(NO_PLANE);
            const ctx = paintRaster(canvas, img);
            if (ctx === null) return refuse('no 2-D canvas context');
            let drawn = 0;
            ctx.font = '11px ui-monospace, monospace';
            for (const zone of ir.facade.zones) {
                for (const cell of zone.cells) {
                    const o = cell.opening;
                    if (o === null) continue;
                    const r = irRectToPixels(cell, canvas.width, canvas.height);
                    stroke(ctx, PURPLE, 2);
                    superellipse(
                        ctx,
                        r.x + r.width / 2,
                        r.y + r.height / 2,
                        o.a * canvas.width,
                        o.b * canvas.height,
                        o.n,
                    );
                    // ⛔ The NUMBER, not a label. There is no threshold at which an
                    // opening "becomes an arch" (brief §9) and this overlay must not
                    // invent one by drawing some of them differently.
                    ctx.fillStyle = AMBER;
                    ctx.fillText(o.archness.toFixed(2), r.x + 3, r.y + 13);
                    drawn++;
                }
            }
            return drawn === 0 ? refuse('no cell carries an opening, so no head profile was fitted.') : OK;
        },
    },
    {
        id: 'projections',
        label: 'Projection regions',
        clause: 'brief §18 — "balcony/projection regions"',
        draw(canvas, _ir, d) {
            const img = d.rectified.image;
            if (img === null) return refuse(NO_PLANE);
            const ctx = paintRaster(canvas, img);
            if (ctx === null) return refuse('no 2-D canvas context');
            if (d.soffits.length === 0) {
                return refuse('no soffit shadow band qualified — no projection cue was found in this facade.');
            }
            // ⛔ The BAND is drawn, never a depth. C108 §3.10: the cue is measured
            // and the depth is UNKNOWN, so an overlay that drew a projection would
            // be claiming the one number this engine refuses to produce.
            for (const s of d.soffits) {
                ctx.fillStyle = 'rgba(255, 165, 0, 0.30)';
                ctx.fillRect(0, s.y, canvas.width, s.bandHeight);
                stroke(ctx, RED, 2);
                hLine(ctx, s.y, canvas.width);
            }
            return OK;
        },
    },
    {
        id: 'symmetry',
        label: 'Symmetry axis',
        clause: 'brief §18 — "symmetry axis"; brief §7 — a HYPOTHESIS the test may reject',
        draw(canvas, ir, d) {
            const img = d.rectified.image;
            if (img === null) return refuse(NO_PLANE);
            const ctx = paintRaster(canvas, img);
            if (ctx === null) return refuse('no 2-D canvas context');
            const axis = ir.facade.symmetry.axisX;
            if (axis === null) {
                // ⛔ Never defaulted to 0.5. "Approximately symmetrical" is the
                // brief's hypothesis, and the test is allowed to fail.
                return refuse('no symmetry axis was supported by the cross-correlation — it is NOT assumed to be the centre.');
            }
            stroke(ctx, PURPLE, 2.5);
            ctx.setLineDash([8, 6]);
            vLine(ctx, axis * canvas.width, canvas.height);
            ctx.setLineDash([]);
            return OK;
        },
    },
    {
        id: 'periodicity',
        label: 'Periodicity plots',
        clause: 'brief §18 — "periodicity plots"; brief §14 — repeats are MEASURED, never constant',
        draw(canvas, _ir, d) {
            // A SYNTHESIZED chart, not an overlay: the thing being shown is a 1-D
            // signal, and drawing it over the photograph would hide both.
            const strips: { signal: readonly number[]; peaks: readonly number[]; colour: string; label: string }[] = [];
            if (d.rows !== null) {
                strips.push({ signal: d.rows.profile, peaks: d.rows.peaks, colour: PURPLE, label: 'row profile' });
                strips.push({ signal: d.rows.autocorrelation, peaks: [], colour: CYAN, label: 'row autocorrelation' });
            }
            if (d.cols !== null) {
                strips.push({ signal: d.cols.profile, peaks: d.cols.peaks, colour: PURPLE, label: 'column profile' });
                strips.push({ signal: d.cols.autocorrelation, peaks: [], colour: CYAN, label: 'column autocorrelation' });
            }
            if (strips.length === 0) return refuse('neither projection profile was produced.');
            const stripHeight = 88;
            const width = 640;
            const ctx = blankCanvas(canvas, width, strips.length * stripHeight, '#0d121e');
            if (ctx === null) return refuse('no 2-D canvas context');
            ctx.font = '10px ui-monospace, monospace';
            strips.forEach((s, i) => {
                const top = i * stripHeight;
                stroke(ctx, 'rgba(255,255,255,0.14)', 1);
                hLine(ctx, top, width);
                ctx.fillStyle = 'rgba(255,255,255,0.55)';
                ctx.fillText(s.label, 6, top + 13);
                if (s.signal.length === 0) return;
                let lo = Infinity;
                let hi = -Infinity;
                for (const v of s.signal) {
                    if (v < lo) lo = v;
                    if (v > hi) hi = v;
                }
                const span = hi - lo;
                const xOf = (k: number): number => (k / Math.max(1, s.signal.length - 1)) * (width - 1);
                const yOf = (v: number): number =>
                    span > 0 ? top + stripHeight - 6 - ((v - lo) / span) * (stripHeight - 22) : top + stripHeight / 2;
                stroke(ctx, AMBER, 1);
                for (const p of s.peaks) {
                    ctx.beginPath();
                    ctx.moveTo(xOf(p), top + 16);
                    ctx.lineTo(xOf(p), top + stripHeight - 4);
                    ctx.stroke();
                }
                stroke(ctx, s.colour, 1.5);
                ctx.beginPath();
                ctx.moveTo(xOf(0), yOf(s.signal[0]!));
                for (let k = 1; k < s.signal.length; k++) ctx.lineTo(xOf(k), yOf(s.signal[k]!));
                ctx.stroke();
            });
            return OK;
        },
    },
    {
        id: 'reconstruction',
        label: 'Reconstructed geometry',
        clause: 'brief §18 — "reconstructed geometry"',
        draw(canvas, ir, _d) {
            // ⭐ Drawn from the IR AND NOTHING ELSE. Anything the photograph shows
            // and this picture does not is a thing the pipeline did not record —
            // which is the question brief §18 exists to make answerable at a glance.
            const ctx = blankCanvas(canvas, 640, 640, '#0d121e');
            if (ctx === null) return refuse('no 2-D canvas context');
            if (ir.facade.zones.length === 0 && ir.facade.features.length === 0 && ir.facade.outliers.length === 0) {
                return refuse('the IR carries no zones, features or outliers — nothing was reconstructed.');
            }
            const W = canvas.width;
            const H = canvas.height;
            for (const zone of ir.facade.zones) {
                for (const cell of zone.cells) {
                    const r = irRectToPixels(cell, W, H);
                    stroke(ctx, 'rgba(176,176,184,0.55)', 1);
                    ctx.strokeRect(r.x, r.y, r.width, r.height);
                    const o = cell.opening;
                    if (o === null) continue;
                    stroke(ctx, PURPLE, 2);
                    superellipse(ctx, r.x + r.width / 2, r.y + r.height / 2, o.a * W, o.b * H, o.n);
                }
            }
            for (const f of ir.facade.features) {
                const r = irRectToPixels(f, W, H);
                stroke(ctx, CYAN, 2.5);
                ctx.strokeRect(r.x, r.y, r.width, r.height);
            }
            for (const o of ir.facade.outliers) {
                const r = irRectToPixels(o, W, H);
                stroke(ctx, AMBER, 2.5);
                ctx.strokeRect(r.x, r.y, r.width, r.height);
            }
            const axis = ir.facade.symmetry.axisX;
            if (axis !== null) {
                stroke(ctx, PURPLE, 1.5);
                ctx.setLineDash([8, 6]);
                vLine(ctx, axis * W, H);
                ctx.setLineDash([]);
            }
            stroke(ctx, GREY, 1);
            ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
            return OK;
        },
    },
    {
        id: 'confidence',
        label: 'Confidence heatmap',
        clause: 'brief §18 — "confidence heatmap"; C108 §4 — confidence is FIRST-CLASS',
        draw(canvas, ir, d) {
            const img = d.rectified.image;
            if (img === null) return refuse(NO_PLANE);
            const ctx = paintRaster(canvas, img);
            if (ctx === null) return refuse('no 2-D canvas context');
            if (ir.facade.zones.length === 0) return refuse('no lattice cells to colour.');
            for (const zone of ir.facade.zones) {
                for (const cell of zone.cells) {
                    const r = irRectToPixels(cell, canvas.width, canvas.height);
                    ctx.fillStyle = confidenceCss(cell.confidence);
                    ctx.fillRect(r.x + 1, r.y + 1, Math.max(0, r.width - 2), Math.max(0, r.height - 2));
                    if (cell.confidence === null) {
                        // Hatch the unknowns: a tint alone reads as a dim measurement.
                        ctx.save();
                        ctx.beginPath();
                        ctx.rect(r.x, r.y, r.width, r.height);
                        ctx.clip();
                        stroke(ctx, 'rgba(20,20,24,0.45)', 1);
                        for (let k = -r.height; k < r.width; k += 8) {
                            ctx.beginPath();
                            ctx.moveTo(r.x + k, r.y);
                            ctx.lineTo(r.x + k + r.height, r.y + r.height);
                            ctx.stroke();
                        }
                        ctx.restore();
                    }
                }
            }
            return OK;
        },
    },
];
