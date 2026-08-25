// REALPHOTO73 probe — READ-ONLY lane. Nothing here touches src/. It re-implements the
// pieces under test (lattice extension rule, S13 fit, soffit candidate rows) as local
// copies so that "current" vs "proposed" can be measured on the SAME blob set.
import { reconstructFacade, resolveOptions } from '../src/index.js';
import type { FacadeReconstructionOptions } from '../src/index.js';
import { createRasterImage, toGray } from '../src/contracts/RasterImage.js';
import type { RasterImage, Rect, Quad, GrayImage } from '../src/contracts/RasterImage.js';
import { deriveLatticeFromOpenings, latticeIsUsable } from '../src/reconstruction/geometry/openingLattice.js';
// ⚠ The corpus module is being edited by another lane (CONF72) and may not parse; load it lazily and optionally.
type CorpusModule = typeof import('../src/testing/syntheticFacades.js');
export async function corpusModule(): Promise<CorpusModule | null> {
    try { return await import('../src/testing/syntheticFacades.js'); } catch (e) {
        console.log(`[live corpus module unavailable (${String(e).split('\n')[0]}) — falling back to the HEAD snapshot probe-rp73-corpus-head.local.mts]`);
        try { return (await import('./probe-rp73-corpus-head.local.mts')) as unknown as CorpusModule; } catch (e2) { console.log(`[HEAD snapshot unavailable too: ${String(e2).split('\n')[0]}]`); return null; }
    }
}
import type { OpeningLattice, LatticeAxis } from '../src/reconstruction/geometry/openingLattice.js';
import { findBlobs, otsuThreshold, fitArch } from '../src/reconstruction/openings/detect.js';
import type { Blob } from '../src/reconstruction/openings/detect.js';
import { detectSoffits, soffitCueForBoundary, soffitShadowIndex } from '../src/reconstruction/projections/soffit.js';
import { projectionProfiles, fitComb, detectBreaks } from '../src/reconstruction/periodicity/comb.js';
import { boundaries, bandsFromBoundaries } from '../src/reconstruction/geometry/lattice.js';
import type { Band } from '../src/reconstruction/geometry/lattice.js';

// ── drawing (copied from the corpus so variants are exact deltas of case M) ────────
interface Rgb { r: number; g: number; b: number }
const WALL: Rgb = { r: 205, g: 200, b: 190 };
const OPENING: Rgb = { r: 38, g: 40, b: 46 };
const SKY: Rgb = { r: 96, g: 140, b: 200 };
const SHADOW: Rgb = { r: 96, g: 94, b: 92 };
const RAILING: Rgb = { r: 52, g: 54, b: 58 };
const SLAT: Rgb = { r: 82, g: 82, b: 88 };
const GLAZING: Rgb = { r: 58, g: 62, b: 70 };
const GLAZING_JOINT: Rgb = { r: 96, g: 100, b: 108 };
const SLAB_FACE: Rgb = { r: 190, g: 186, b: 178 };
const LIT: Rgb = { r: 225, g: 222, b: 214 };
function setPixel(img: RasterImage, x: number, y: number, c: Rgb): void {
    if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
    const p = (y * img.width + x) * 4;
    img.data[p] = c.r; img.data[p + 1] = c.g; img.data[p + 2] = c.b; img.data[p + 3] = 255;
}
function fillRect(img: RasterImage, x0: number, y0: number, x1: number, y1: number, c: Rgb): void {
    for (let y = Math.max(0, Math.round(y0)); y < Math.min(img.height, Math.round(y1)); y++)
        for (let x = Math.max(0, Math.round(x0)); x < Math.min(img.width, Math.round(x1)); x++) setPixel(img, x, y, c);
}
function fillOpening(img: RasterImage, x0: number, y0: number, x1: number, y1: number, archRise: number, n: number, c: Rgb): void {
    const w = x1 - x0; const halfW = w / 2; const cx = x0 + halfW;
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
const M_RAIL_ARC = 3;
function fillRailing(img: RasterImage, x0: number, y0: number, x1: number, y1: number): void {
    const w = x1 - x0; const cx = x0 + w / 2;
    for (let x = Math.round(x0); x < Math.round(x1); x++) {
        const u = Math.max(-1, Math.min(1, (x + 0.5 - cx) / (w / 2)));
        const top = y0 - M_RAIL_ARC * (1 - u * u);
        for (let y = Math.round(top); y < Math.round(y1); y++) setPixel(img, x, y, RAILING);
    }
}
function fillSlats(img: RasterImage, x0: number, y0: number, x1: number, y1: number): void {
    for (let y = Math.round(y0); y < Math.round(y1); y++) {
        if ((y - Math.round(y0)) % 4 >= 2) continue;
        for (let x = Math.round(x0); x < Math.round(x1); x++) setPixel(img, x, y, SLAT);
    }
}

// case M constants (verbatim)
const MW = 560, MH = 620, MFX0 = 40, MFY0 = 40, MFX1 = 520, MFY1 = 580;
const M_SLOTS = 6, M_SLOT_W = (MFX1 - MFX0) / M_SLOTS, M_WINDOW_SLOTS = [0, 1, 3, 4, 5], M_STRIP_SLOT = 2;
const M_UPPER = 6, M_ARCADE_H = 100, M_UPPER_H = (MFY1 - MFY0 - M_ARCADE_H) / M_UPPER;
const M_OPEN_W = M_SLOT_W * 0.6, M_OPEN_H = M_UPPER_H * 0.6, M_ARCH_W = 60, M_ARCH_RISE = M_ARCH_W / 2, M_SOFFIT = 8;
const M_RAIL_OVERLAP = Math.round(M_OPEN_H * 0.18), M_RAIL_WING = 12, M_RAIL_BELOW = 4;

interface Variant {
    id: string;
    extraLeft?: number; extraRight?: number;      // blank wall beyond the outer bays (H1)
    cornerRail?: 'none' | 'merged' | 'separate';   // corner-balcony railing beyond outer windows (H1/H2)
    railWing?: number;                             // railing wing past each jamb (H2)
    lit?: 'none' | 'jambs-dark' | 'head-only';     // bright shop interior in the arcade (H3)
    perBaySoffit?: number;                         // soffit shadow only under each window bay, this many px wide (H4b)
    debugWide?: boolean;
}
interface Drawn { image: RasterImage; quad: Quad; facade: Rect; W: number; H: number }

export function drawM(v: Variant): Drawn {
    const eL = v.extraLeft ?? 0, eR = v.extraRight ?? 0;
    const W = MW + eL + eR, H = MH;
    const FX0 = MFX0, FX1 = MFX1 + eL + eR;
    const ox = eL; // slot origin shift
    const img = createRasterImage(W, H) as RasterImage;
    fillRect(img, 0, 0, W, H, SKY);
    fillRect(img, FX0, MFY0, FX1, MFY1, WALL);
    const wing = v.railWing ?? M_RAIL_WING;
    for (let row = 1; row < M_UPPER; row++) {
        const y = MFY0 + M_UPPER_H * row;
        if (v.perBaySoffit !== undefined) {
            for (const slot of M_WINDOW_SLOTS) {
                const cx = ox + MFX0 + M_SLOT_W * (slot + 0.5);
                fillRect(img, cx - v.perBaySoffit / 2, y, cx + v.perBaySoffit / 2, y + M_SOFFIT, SHADOW);
            }
        } else fillRect(img, FX0, y, FX1, y + M_SOFFIT, SHADOW);
    }
    const outerL = ox + MFX0 + M_SLOT_W * 0.5, outerR = ox + MFX0 + M_SLOT_W * 5.5;
    for (let row = 0; row < M_UPPER; row++) {
        for (const slot of M_WINDOW_SLOTS) {
            const cx = ox + MFX0 + M_SLOT_W * (slot + 0.5);
            const cy = MFY0 + M_UPPER_H * (row + 0.5);
            const r = { x0: cx - M_OPEN_W / 2, y0: cy - M_OPEN_H / 2, x1: cx + M_OPEN_W / 2, y1: cy + M_OPEN_H / 2 };
            fillOpening(img, r.x0, r.y0, r.x1, r.y1, 0, 2, OPENING);
            fillSlats(img, r.x0, r.y0, r.x1, r.y1);
            let rx0 = r.x0 - wing, rx1 = r.x1 + wing;
            if (v.cornerRail === 'merged') {
                if (cx === outerL) rx0 = FX0 + 2;
                if (cx === outerR) rx1 = FX1 - 2;
            }
            fillRailing(img, rx0, r.y1 - M_RAIL_OVERLAP, rx1, r.y1 + M_RAIL_BELOW);
            if (v.cornerRail === 'separate') {
                // a 6-px bright pier between the window's railing and the corner railing
                if (cx === outerL) fillRailing(img, FX0 + 2, r.y1 - M_RAIL_OVERLAP, rx0 - 6, r.y1 + M_RAIL_BELOW);
                if (cx === outerR) fillRailing(img, rx1 + 6, r.y1 - M_RAIL_OVERLAP, FX1 - 2, r.y1 + M_RAIL_BELOW);
            }
        }
    }
    const arcadeTop = MFY1 - M_ARCADE_H;
    for (const slot of M_WINDOW_SLOTS) {
        const cx = ox + MFX0 + M_SLOT_W * (slot + 0.5);
        const r = { x0: cx - M_ARCH_W / 2, y0: arcadeTop + 10, x1: cx + M_ARCH_W / 2, y1: MFY1 };
        fillOpening(img, r.x0, r.y0, r.x1, r.y1, M_ARCH_RISE, 2, OPENING);
        const springing = r.y0 + M_ARCH_RISE;
        if (v.lit === 'jambs-dark') fillRect(img, r.x0 + 4, springing + 6, r.x1 - 4, r.y1, LIT);
        if (v.lit === 'head-only') fillRect(img, r.x0, springing + 6, r.x1, r.y1, LIT);
    }
    const sx0 = ox + MFX0 + M_SLOT_W * M_STRIP_SLOT + 8, sx1 = ox + MFX0 + M_SLOT_W * (M_STRIP_SLOT + 1) - 8;
    const sTop = MFY0 + 6;
    fillRect(img, sx0, sTop, sx1, MFY1, GLAZING);
    for (let y = Math.round(sTop); y < MFY1; y += 16) fillRect(img, sx0, y, sx1, y + 1, GLAZING_JOINT);
    for (let x = Math.round(sx0) + 8; x < sx1; x += 16) fillRect(img, x, sTop, x + 1, MFY1, GLAZING_JOINT);
    for (let row = 1; row < M_UPPER; row++) {
        const y = MFY0 + M_UPPER_H * row;
        fillRect(img, sx0, y - 2, sx1, y + M_SOFFIT, SLAB_FACE);
    }
    fillRect(img, sx0, arcadeTop - 2, sx1, arcadeTop + M_SOFFIT, SLAB_FACE);
    const quad: Quad = [{ x: FX0, y: MFY0 }, { x: FX1, y: MFY0 }, { x: FX1, y: MFY1 }, { x: FX0, y: MFY1 }];
    return { image: img, quad, facade: { x0: FX0, y0: MFY0, x1: FX1, y1: MFY1 }, W, H };
}
/** The DRAWN openings of a variant, in source px (30 windows + 5 arches), independent of the corpus module. */
export function drawnOpenings(v: Variant): { x0: number; y0: number; x1: number; y1: number }[] {
    const ox = v.extraLeft ?? 0; const out: { x0: number; y0: number; x1: number; y1: number }[] = [];
    for (let row = 0; row < M_UPPER; row++) for (const slot of M_WINDOW_SLOTS) {
        const cx = ox + MFX0 + M_SLOT_W * (slot + 0.5), cy = MFY0 + M_UPPER_H * (row + 0.5);
        out.push({ x0: cx - M_OPEN_W / 2, y0: cy - M_OPEN_H / 2, x1: cx + M_OPEN_W / 2, y1: cy + M_OPEN_H / 2 });
    }
    const arcadeTop = MFY1 - M_ARCADE_H;
    for (const slot of M_WINDOW_SLOTS) { const cx = ox + MFX0 + M_SLOT_W * (slot + 0.5); out.push({ x0: cx - M_ARCH_W / 2, y0: arcadeTop + 10, x1: cx + M_ARCH_W / 2, y1: MFY1 }); }
    return out;
}

// ── pipeline replica up to the FINAL blob set (index.ts S7..S9b), verified against diagnostics ──
interface Replica {
    rect: RasterImage; gray: GrayImage; blobs: Blob[]; zone: OpeningLattice; bay: OpeningLattice;
    rowsProfile: number[]; profileZoneBands: Band[]; profileBayBands: Band[]; refined: boolean;
}
export function replicate(rect: RasterImage, opts: FacadeReconstructionOptions): Replica {
    const gray = toGray(rect);
    const { rows, cols } = projectionProfiles(gray);
    const rowFit = fitComb(rows, opts), colFit = fitComb(cols, opts);
    const rowBreaks = rowFit === null ? [] : detectBreaks(rows, rowFit, opts);
    const colBreaks = colFit === null ? [] : detectBreaks(cols, colFit, opts);
    const minSepY = Math.max(2, Math.round(rect.height * opts.minPeakSeparationFraction * 2));
    const minSepX = Math.max(2, Math.round(rect.width * opts.minPeakSeparationFraction * 2));
    const pz = bandsFromBoundaries(boundaries(rect.height, rowFit, rowBreaks, minSepY));
    const pb = bandsFromBoundaries(boundaries(rect.width, colFit, colBreaks, minSepX));
    const full: Rect = { x0: 0, y0: 0, x1: rect.width, y1: rect.height };
    const thr = otsuThreshold(gray, full);
    const cellAreaFor = (z: number, b: number): number => (rect.width * rect.height) / Math.max(1, z * b);
    let blobs = findBlobs(gray, full, thr, opts, cellAreaFor(pz.length, pb.length));
    let zone = deriveLatticeFromOpenings(blobs, 'y', rect.height, opts);
    let bay = deriveLatticeFromOpenings(blobs, 'x', rect.width, opts);
    let refined = false;
    if (opts.latticeSource === 'openings' && opts.openingLatticeRefine && latticeIsUsable(zone) && latticeIsUsable(bay)) {
        const derived = zone.centres.length * bay.centres.length;
        if (derived !== pz.length * pb.length) {
            const r2 = findBlobs(gray, full, thr, opts, cellAreaFor(zone.centres.length, bay.centres.length));
            const z2 = deriveLatticeFromOpenings(r2, 'y', rect.height, opts);
            const b2 = deriveLatticeFromOpenings(r2, 'x', rect.width, opts);
            if (latticeIsUsable(z2) && latticeIsUsable(b2)) { blobs = r2; zone = z2; bay = b2; refined = true; }
        }
    }
    return { rect, gray, blobs, zone, bay, rowsProfile: rows, profileZoneBands: pz, profileBayBands: pb, refined };
}

// ── H1: a local copy of deriveLatticeFromOpenings with the extension rule parameterised ──
type ExtRule = 'current' | 'any-detection' | 'ortho-band-detection' | 'ortho-floor-detection' | 'none';
function median(values: readonly number[]): number {
    if (values.length === 0) return 0;
    const s = [...values].sort((a, b) => a - b);
    return s[Math.floor((s.length - 1) / 2)]!;
}
function centreOf(b: Rect, a: LatticeAxis): number { return a === 'x' ? (b.x0 + b.x1) / 2 : (b.y0 + b.y1) / 2; }
function sizeOf(b: Rect, a: LatticeAxis): number { return a === 'x' ? b.x1 - b.x0 : b.y1 - b.y0; }
interface LocalLattice { centres: number[]; boundaries: number[]; kept: number; interpolated: number; extended: number; refusedByExtension: number; pitch: number; medianSupport: number; vacated: number[]; refused: string | null; keptCentres: number[]; keptSupport: number[] }
function deriveLocal(blobs: readonly { bbox: Rect }[], axis: LatticeAxis, extent: number, opts: FacadeReconstructionOptions, rule: ExtRule): LocalLattice {
    const refuse = (s: string): LocalLattice => ({ centres: [], boundaries: [], kept: 0, interpolated: 0, extended: 0, refusedByExtension: 0, pitch: 0, medianSupport: 0, vacated: [], refused: s, keptCentres: [], keptSupport: [] });
    if (blobs.length < 2 || extent < 4) return refuse('too few');
    const sizes = blobs.map((b) => sizeOf(b.bbox, axis));
    const medianSize = median(sizes);
    if (!(medianSize > 0)) return refuse('degenerate');
    const lo = medianSize / opts.openingLatticeSizeBandFactor, hi = medianSize * opts.openingLatticeSizeBandFactor;
    const ortho: LatticeAxis = axis === 'x' ? 'y' : 'x';
    const orthoSizes = blobs.map((b) => sizeOf(b.bbox, ortho));
    const medianOrtho = median(orthoSizes);
    const loO = medianOrtho / opts.openingLatticeSizeBandFactor, hiO = medianOrtho * opts.openingLatticeSizeBandFactor;
    const voters: { centre: number; idx: number }[] = [];
    for (let i = 0; i < blobs.length; i++) {
        const s = sizes[i]!; if (s < lo || s > hi) continue;
        const o = orthoSizes[i]!; if (medianOrtho > 0 && (o < loO || o > hiO)) continue;
        voters.push({ centre: centreOf(blobs[i]!.bbox, axis), idx: i });
    }
    if (voters.length < 2) return refuse('voters<2');
    voters.sort((a, b) => a.centre - b.centre);
    const gapThreshold = medianSize * opts.openingLatticeGapFactor;
    const groups: { centre: number; idx: number }[][] = [[voters[0]!]];
    for (let i = 1; i < voters.length; i++) {
        const v = voters[i]!; const cur = groups[groups.length - 1]!;
        if (v.centre - cur[cur.length - 1]!.centre > gapThreshold) groups.push([v]); else cur.push(v);
    }
    const rawCentres = groups.map((g) => g.reduce((a, b) => a + b.centre, 0) / g.length);
    const rawSupport = groups.map((g) => g.length);
    const medianSupport = median(rawSupport);
    if (medianSupport < 2) return refuse('median support<2');
    const minSupport = medianSupport * opts.openingLatticeMinSupportRatio;
    let kept: { centre: number; idx: number[] }[] = [];
    for (let i = 0; i < groups.length; i++) if (rawSupport[i]! >= minSupport) kept.push({ centre: rawCentres[i]!, idx: groups[i]!.map((v) => v.idx) });
    const vacated: number[] = [];
    if (axis === 'x' && kept.length >= 3) {
        const ratioOf = (k: { idx: number[] }): number | null => {
            if (k.idx.length < 2) return null;
            const boxes = k.idx.map((i) => blobs[i]!.bbox).sort((a, b) => (ortho === 'y' ? a.y0 - b.y0 : a.x0 - b.x0));
            const gaps: number[] = [];
            for (let i = 1; i < boxes.length; i++) { const p = boxes[i - 1]!, n = boxes[i]!; gaps.push(Math.max(0, ortho === 'y' ? n.y0 - p.y1 : n.x0 - p.x1)); }
            const size = median(boxes.map((b) => sizeOf(b, ortho)));
            return size > 0 ? Math.max(...gaps) / size : null;
        };
        const ratios = kept.map(ratioOf);
        const measured = ratios.filter((r): r is number => r !== null);
        if (measured.length >= 3) {
            const cut = median(measured) * opts.openingLatticeContinuityRatio;
            const surv: typeof kept = [];
            for (let i = 0; i < kept.length; i++) { const r = ratios[i] ?? null; if (r !== null && r < cut) vacated.push(kept[i]!.centre); else surv.push(kept[i]!); }
            kept = surv;
        }
    }
    if (kept.length < opts.openingLatticeMinLines) return refuse('lines<min');
    const centres = kept.map((k) => k.centre);
    const spacings: number[] = []; for (let i = 1; i < centres.length; i++) spacings.push(centres[i]! - centres[i - 1]!);
    const pitch = median(spacings);
    if (!(pitch > 0)) return refuse('pitch');
    const filled: number[] = [centres[0]!]; let interpolated = 0;
    for (let i = 1; i < centres.length; i++) {
        const a = centres[i - 1]!, b = centres[i]!; const ratio = (b - a) / pitch; const k = Math.round(ratio);
        if (k >= 2 && Math.abs(ratio - k) <= opts.openingLatticeGapIntegerTolerance) {
            for (let j = 1; j < k; j++) { const c = a + ((b - a) * j) / k; if (vacated.some((v) => Math.abs(v - c) <= gapThreshold)) continue; filled.push(c); interpolated++; }
        }
        filled.push(b);
    }
    // ── step 5, parameterised ──
    let extended = 0, refusedByExtension = 0;
    const bandHasDetection = (line: number): boolean => {
        const b0 = Math.max(0, line - pitch / 2), b1 = Math.min(extent, line + pitch / 2);
        for (let i = 0; i < blobs.length; i++) {
            const c = centreOf(blobs[i]!.bbox, axis);
            if (c < b0 || c >= b1) continue;
            if (rule === 'any-detection') return true;
            const o = orthoSizes[i]!;
            if (rule === 'ortho-floor-detection') { if (medianOrtho > 0 && o < loO) continue; return true; } // one-sided: at least opening-sized on the ortho axis
            if (medianOrtho > 0 && (o < loO || o > hiO)) continue; // ortho band, same factor, same median
            return true;
        }
        return false;
    };
    const allow = (line: number): boolean => rule === 'current' ? true : rule === 'none' ? false : bandHasDetection(line);
    while (filled[0]! - pitch > 0) { const c = filled[0]! - pitch; if (!allow(c)) { refusedByExtension++; break; } filled.unshift(c); extended++; }
    while (filled[filled.length - 1]! + pitch < extent) { const c = filled[filled.length - 1]! + pitch; if (!allow(c)) { refusedByExtension++; break; } filled.push(c); extended++; }
    const bounds: number[] = [0]; for (let i = 1; i < filled.length; i++) bounds.push((filled[i - 1]! + filled[i]!) / 2); bounds.push(extent);
    return { centres: filled, boundaries: bounds, kept: kept.length, interpolated, extended, refusedByExtension, pitch, medianSupport, vacated, refused: null, keptCentres: centres, keptSupport: kept.map((k) => k.idx.length) };
}

// ── H2: the head plateau (copied from fitArchImpl's §L-11123 step) ──
interface Head { L: number; R: number; stepWins: boolean; superRes: number; stepRes: number }
export function headPlateau(topProfile: readonly number[], opts: FacadeReconstructionOptions): Head {
    const whole: Head = { L: 0, R: topProfile.length - 1, stepWins: false, superRes: NaN, stepRes: NaN };
    if (topProfile.length < 8) return whole;
    const margin = Math.max(2, Math.round(topProfile.length * 0.05));
    const core = topProfile.slice(margin, topProfile.length - margin);
    if (core.length < 8) return whole;
    let apex = Infinity; for (const v of core) if (v < apex) apex = v;
    const depth = core.map((v) => v - apex);
    const halfWidth = topProfile.length / 2;
    const us = core.map((_, i) => Math.max(-1, Math.min(1, (i + margin - (topProfile.length - 1) / 2) / halfWidth)));
    const fitAt = (n: number): number => {
        let num = 0, den = 0; const shape: number[] = [];
        for (const u of us) { const inner = 1 - Math.pow(Math.abs(u), n); const v = inner <= 0 ? 0 : Math.pow(inner, 1 / n); shape.push(1 - v); }
        for (let i = 0; i < shape.length; i++) { num += depth[i]! * shape[i]!; den += shape[i]! * shape[i]!; }
        const amp = den > 1e-9 ? num / den : 0; let sq = 0;
        for (let i = 0; i < shape.length; i++) { const d = amp * shape[i]! - depth[i]!; sq += d * d; }
        return Math.sqrt(sq / shape.length);
    };
    let best = Infinity;
    const logMin = Math.log(opts.superellipseNMin), logMax = Math.log(opts.superellipseNMax);
    for (let i = 0; i < opts.superellipseNSteps; i++) { const n = Math.exp(logMin + ((logMax - logMin) * i) / (opts.superellipseNSteps - 1)); const r = fitAt(n); if (r < best) best = r; }
    const n = core.length;
    const ps = new Array<number>(n + 1).fill(0), ps2 = new Array<number>(n + 1).fill(0);
    for (let i = 0; i < n; i++) { ps[i + 1] = ps[i]! + depth[i]!; ps2[i + 1] = ps2[i]! + depth[i]! * depth[i]!; }
    const sseOut = (a: number, b: number): number => { const cnt = b - a; if (cnt <= 0) return 0; const s = ps[b]! - ps[a]!, q = ps2[b]! - ps2[a]!; return q - (s * s) / cnt; };
    let bestStep = Infinity, bL = 0, bR = n - 1;
    for (let L = 0; L < n; L++) for (let R = L + 3; R < n; R++) { const sse = (ps2[R + 1]! - ps2[L]!) + sseOut(0, L) + sseOut(R + 1, n); if (sse < bestStep) { bestStep = sse; bL = L; bR = R; } }
    const stepRes = Math.sqrt(bestStep / n);
    const wholePlateau = bL === 0 && bR === n - 1;
    const wins = !wholePlateau && stepRes < best;
    return { L: wins ? bL + margin : 0, R: wins ? bR + margin : topProfile.length - 1, stepWins: wins, superRes: best, stepRes };
}

// ── S13 replica, with the fit source parameterised ──
interface Classified { matched: number; features: number; outliers: number; shadows: number; consumed: number; failWidth: number; failHeight: number; failArea: number; failTol: number; outlierBoxes: { w: number; h: number; wc: number; hc: number; hw: number }[]; matchedByCell: Map<string, Blob>; }
function classify(rep: Replica, zoneBands: Band[], bayBands: Band[], soffits: ReturnType<typeof detectSoffits>, opts: FacadeReconstructionOptions, useHead: boolean, consumedIdx: Set<number>): Classified {
    const blobs = rep.blobs;
    const cellOf = (bx: number, by: number) => { const row = zoneBands.findIndex((b) => by >= b.from && by < b.to); const col = bayBands.findIndex((b) => bx >= b.from && bx < b.to); return row < 0 || col < 0 ? null : { row, col }; };
    const assigned = new Map<string, Blob>();
    let features = 0, outliers = 0, shadows = 0, failWidth = 0, failHeight = 0, failArea = 0, failTol = 0;
    const outlierBoxes: Classified['outlierBoxes'] = [];
    for (let i = 0; i < blobs.length; i++) {
        const blob = blobs[i]!;
        if (consumedIdx.has(i)) continue;
        let x0 = blob.bbox.x0, x1 = blob.bbox.x1;
        if (useHead) { const h = headPlateau(blob.topProfile, opts); if (h.stepWins) { x0 = blob.bbox.x0 + h.L; x1 = blob.bbox.x0 + h.R + 1; } }
        const bx = (x0 + x1) / 2, by = (blob.bbox.y0 + blob.bbox.y1) / 2;
        const cell = cellOf(bx, by);
        let matched = false;
        let lost = false;
        if (cell !== null) {
            const zone = zoneBands[cell.row]!, bay = bayBands[cell.col]!;
            const cw = bay.to - bay.from, ch = zone.to - zone.from;
            const dx = Math.abs(bx - (bay.from + cw / 2)) / Math.max(1, cw), dy = Math.abs(by - (zone.from + ch / 2)) / Math.max(1, ch);
            const okW = (x1 - x0) <= cw * opts.combMatchMaxSizeRatio, okH = (blob.bbox.y1 - blob.bbox.y0) <= ch * opts.combMatchMaxSizeRatio, okA = blob.area <= cw * ch * opts.openingMaxArea;
            const okT = dx <= opts.combMatchTolerance && dy <= opts.combMatchTolerance;
            if (okW && okH && okA && okT) {
                const key = `${cell.row},${cell.col}`; const ex = assigned.get(key);
                if (ex === undefined || blob.area > ex.area) { if (ex !== undefined) outliers++; assigned.set(key, blob); matched = true; } else { outliers++; lost = true; }
            } else { if (!okW) failWidth++; if (!okH) failHeight++; if (!okA) failArea++; if (!okT) failTol++; }
        }
        if (lost) continue;
        if (!matched) {
            const sb = soffitShadowIndex(blob.bbox, soffits, opts.soffitShadowMinInside);
            if (sb !== null) { shadows++; continue; }
            const zoneSpan = zoneBands.filter((b) => blob.bbox.y0 < b.to && blob.bbox.y1 > b.from).length;
            if (zoneSpan >= 2) features++; else outliers++;
            if (cell !== null) { const zone = zoneBands[cell.row]!, bay = bayBands[cell.col]!; outlierBoxes.push({ w: blob.bbox.x1 - blob.bbox.x0, h: blob.bbox.y1 - blob.bbox.y0, wc: (blob.bbox.x1 - blob.bbox.x0) / (bay.to - bay.from), hc: (blob.bbox.y1 - blob.bbox.y0) / (zone.to - zone.from), hw: (x1 - x0) / (bay.to - bay.from) }); }
        }
    }
    return { matched: assigned.size, features, outliers, shadows, consumed: consumedIdx.size, failWidth, failHeight, failArea, failTol, outlierBoxes, matchedByCell: assigned };
}

// ── H4: candidate rows ──
function peakCandidates(peaks: readonly number[], h: number): number[] { return peaks.filter((y) => y > 2 && y < h - 2); }
function boundaryCandidates(profile: readonly number[], zoneBands: Band[], h: number): number[] {
    const out: number[] = [];
    for (let i = 1; i < zoneBands.length; i++) {
        const b = zoneBands[i]!.from;
        const half = Math.min(zoneBands[i - 1]!.to - zoneBands[i - 1]!.from, zoneBands[i]!.to - zoneBands[i]!.from) / 2;
        const lo = Math.max(3, Math.round(b - half)), hi = Math.min(h - 3, Math.round(b + half));
        let best = -1, bv = -Infinity;
        for (let y = lo; y <= hi; y++) { const v = profile[y]!; if (v > bv) { bv = v; best = y; } }
        if (best >= 0 && !out.includes(best)) out.push(best);
    }
    return out.sort((a, b) => a - b);
}
/** P3 — every raw local maximum of the row-gradient profile within half a zone of each interior boundary. No prominence, no NMS. */
function boundaryLocalMaxima(profile: readonly number[], zoneBands: Band[], h: number): number[] {
    const out = new Set<number>();
    for (let i = 1; i < zoneBands.length; i++) {
        const b = zoneBands[i]!.from;
        const half = Math.min(zoneBands[i - 1]!.to - zoneBands[i - 1]!.from, zoneBands[i]!.to - zoneBands[i]!.from) / 2;
        const lo = Math.max(3, Math.round(b - half)), hi = Math.min(h - 3, Math.round(b + half));
        for (let y = lo; y <= hi; y++) if (profile[y]! >= profile[y - 1]! && profile[y]! > profile[y + 1]!) out.add(y);
    }
    return [...out].sort((a, b) => a - b);
}
// ── H4b — a copy of detectSoffits whose coverage test is PER BAY (median bay), not full-width ──
function detectSoffitsPerBay(img: GrayImage, slabRows: readonly number[], bayBands: Band[], opts: FacadeReconstructionOptions, exclusions: Rect[][] = []): { y: number; bandHeight: number; drop: number }[] {
    const h = img.height, w = img.width;
    const maxSearch = Math.max(2, Math.round(h * opts.soffitSearchFraction));
    const refHeight = Math.max(2, Math.round(h * 0.02));
    const rowMean = (y: number): number => { let s = 0; for (let x = 0; x < w; x++) s += img.data[y * w + x]!; return s / w; };
    const wallLevel = (y0: number, y1: number): number => { const from = Math.max(0, y0), to = Math.min(h, y1); if (to <= from) return 0; const v: number[] = []; for (let y = from; y < to; y++) for (let x = 0; x < w; x++) v.push(img.data[y * w + x]!); v.sort((a, b) => a - b); return v[Math.min(v.length - 1, Math.max(0, Math.round((v.length - 1) * opts.soffitReferencePercentile)))]!; };
    const bayCoverageMedian = (y: number, ref: number): number => { const cov: number[] = []; for (let bi = 0; bi < bayBands.length; bi++) { const b = bayBands[bi]!; if ((exclusions[bi] ?? []).some((r) => y >= r.y0 && y < r.y1)) { cov.push(0); continue; } const x0 = Math.ceil(b.from), x1 = Math.floor(b.to); let dark = 0; for (let x = x0; x < x1; x++) if (ref - img.data[y * w + x]! >= opts.soffitMinDrop) dark++; cov.push(dark / Math.max(1, x1 - x0)); } return median(cov); };
    const grow = (y: number, dir: -1 | 1): { band: number; drop: number; terminated: boolean } => {
        const refFrom = dir === 1 ? y - refHeight : y + 1;
        const ref = wallLevel(refFrom, refFrom + refHeight);
        if (ref <= 0) return { band: 0, drop: 0, terminated: false };
        let band = 0, dropSum = 0, terminated = false;
        for (let d = 1; d <= maxSearch; d++) {
            const row = y + dir * d; if (row < 0 || row >= h) break;
            const drop = ref - rowMean(row);
            // ⚠ the row MEAN drop is kept as in src; the coverage clause is the one under test
            if (bayCoverageMedian(row, ref) < opts.soffitMinCoverage) { terminated = true; break; }
            band = d; dropSum += drop;
        }
        return { band, drop: band > 0 ? dropSum / band : 0, terminated };
    };
    const found: { top: number; bottom: number; drop: number }[] = [];
    for (const y of [...slabRows].sort((a, b) => a - b)) {
        const down = grow(y, 1), up = grow(y, -1);
        const useDown = down.band >= up.band; const chosen = useDown ? down : up;
        if (chosen.band < 2 || !chosen.terminated) continue;
        found.push(useDown ? { top: y, bottom: y + chosen.band, drop: chosen.drop } : { top: y - chosen.band, bottom: y, drop: chosen.drop });
    }
    found.sort((a, b) => a.top - b.top || a.bottom - b.bottom);
    const out: { y: number; bandHeight: number; drop: number }[] = []; let last: typeof found[number] | null = null;
    for (const f of found) { if (last !== null && f.top < last.bottom) { if (f.bottom - f.top > last.bottom - last.top) { last.top = f.top; last.bottom = f.bottom; last.drop = f.drop; out[out.length - 1] = { y: last.top, bandHeight: last.bottom - last.top, drop: last.drop }; } continue; } last = { ...f }; out.push({ y: f.top, bandHeight: f.bottom - f.top, drop: f.drop }); }
    return out;
}
function servedBoundaries(zoneBands: Band[], soffits: ReturnType<typeof detectSoffits>): number {
    let n = 0; for (let i = 1; i < zoneBands.length; i++) if (soffitCueForBoundary(zoneBands[i]!.from, soffits) !== null) n++; return n;
}
function mapperLine(soffitCount: number, zones: number): string {
    const interior = Math.max(1, zones - 1); const cov = soffitCount / interior;
    return `balconies at ${soffitCount} of ${interior} storey lines (coverage ${cov.toFixed(2)} ${cov >= 0.6 ? '>= 0.6 APPLIED' : '< 0.6 NOT applied'})`;
}

// ── run one image ──
async function run(id: string, image: RasterImage, quad: Quad | undefined, truth: { bays: number; zones: number; openings: number; soffitLines: number }, verbose: boolean, debugWide = false): Promise<void> {
    const opts = resolveOptions(quad === undefined ? {} : { facadeQuad: quad });
    const { ir, diagnostics: d } = await reconstructFacade(image, quad === undefined ? undefined : { facadeQuad: quad });
    const rect = d.rectified.image; if (rect === null) { console.log(id, 'NO PLANE'); return; }
    const rep = replicate(rect, opts);
    const same = rep.blobs.length === d.blobs.length && rep.blobs.every((b, i) => { const q = d.blobs[i]!.bbox; return b.bbox.x0 === q.x0 && b.bbox.y0 === q.y0 && b.bbox.x1 === q.x1 && b.bbox.y1 === q.y1; });
    const cells = ir.facade.zones.flatMap((z) => z.cells); const matched = cells.filter((c) => c.opening !== null).length;
    const zb = d.lattice.zones, bb = d.lattice.bays;
    console.log(`\n=== ${id} === truth bays ${truth.bays} zones ${truth.zones} openings ${truth.openings} soffit-lines ${truth.soffitLines} | rect ${rect.width}x${rect.height} | replica blobs ${same ? 'IDENTICAL' : 'DIFFER'} (${rep.blobs.length})`);
    console.log(`  pipeline: zones ${ir.facade.zones.length} x bays ${ir.facade.zones[0]?.cells.length ?? 0} | matched ${matched} features ${ir.facade.features.length} outliers ${ir.facade.outliers.length} | structConf ${ir.facade.periodicity.confidence?.toFixed(2)}`);
    console.log(`  lattice zones: fromOpenings ${zb.fromOpenings}, interp ${zb.interpolated} EXTENDED ${zb.extended} rejected ${zb.rejected} pitch ${zb.pitch?.toFixed(1)} support ${zb.medianSupport} | bays: fromOpenings ${bb.fromOpenings}, interp ${bb.interpolated} EXTENDED ${bb.extended} rejected ${bb.rejected} pitch ${bb.pitch?.toFixed(1)} support ${bb.medianSupport}`);
    console.log(`  bay boundaries: ${bb.boundaries.map((v) => v.toFixed(0)).join(' ')}`);
    for (const n of d.notes) if (/lattice|openings:/.test(n)) console.log('   ·', n);

    // H1 — extension rule on the SAME final blob set
    const rules: ExtRule[] = ['current', 'any-detection', 'ortho-band-detection', 'ortho-floor-detection', 'none'];
    for (const axis of ['x', 'y'] as const) {
        const extent = axis === 'x' ? rect.width : rect.height;
        const line = rules.map((r) => { const l = deriveLocal(rep.blobs, axis, extent, opts, r); return `${r}: ${l.refused ?? `${l.centres.length} lines (kept ${l.kept} +interp ${l.interpolated} +ext ${l.extended}, ext-refused ${l.refusedByExtension})`}`; }).join('  |  ');
        const real = axis === 'x' ? rep.bay : rep.zone;
        const localCur = deriveLocal(rep.blobs, axis, extent, opts, 'current');
        const agree = real.refusedReason === null && localCur.refused === null && real.centres.length === localCur.centres.length && real.centres.every((c, i) => Math.abs(c - localCur.centres[i]!) < 1e-9);
        console.log(`  H1 ${axis === 'x' ? 'BAYS ' : 'ZONES'} [local copy ${agree ? 'agrees with' : 'DISAGREES WITH'} src] ${line}`);
        if (axis === 'x' && localCur.refused === null) console.log(`     kept x-centres ${localCur.keptCentres.map((c) => c.toFixed(0)).join(' ')} support ${localCur.keptSupport.join(' ')} vacated ${localCur.vacated.map((c) => c.toFixed(0)).join(' ') || '-'} pitch ${localCur.pitch.toFixed(1)} extent ${extent}`);
        if (axis === 'x') {
            // H2(c): voters carry their HEAD span instead of the bbox on x
            const headBlobs = rep.blobs.map((b) => { const h = headPlateau(b.topProfile, opts); return { bbox: h.stepWins ? { ...b.bbox, x0: b.bbox.x0 + h.L, x1: b.bbox.x0 + h.R + 1 } : b.bbox }; });
            const lh = deriveLocal(headBlobs, 'x', extent, opts, 'ortho-floor-detection');
            console.log(`     HEAD-span voters (ortho-floor ext): ${lh.refused ?? `${lh.centres.length} lines, pitch ${lh.pitch.toFixed(1)}, kept ${lh.keptCentres.map((c) => c.toFixed(0)).join(' ')}, boundaries ${lh.boundaries.map((c) => c.toFixed(0)).join(' ')}`}`);
        }
    }

    // H2 — S13 with bbox vs head plateau, on the pipeline's own bands
    const zoneBands = bandsFromBoundaries(zb.boundaries), bayBands = bandsFromBoundaries(bb.boundaries);
    const consumed = new Set<number>(); for (const g of [...rep.bay.continuousMembers, ...rep.zone.continuousMembers]) for (const i of g) consumed.add(i);
    const slabRows = peakCandidates(d.rows!.peaks, rect.height);
    const soffCur = detectSoffits(rep.gray, slabRows, opts);
    const c0 = classify(rep, zoneBands, bayBands, soffCur, opts, false, consumed);
    const c1 = classify(rep, zoneBands, bayBands, soffCur, opts, true, consumed);
    const reunited = rep.bay.continuousMembers.length + rep.zone.continuousMembers.length;
    console.log(`  H2 S13 replica bbox-fit: matched ${c0.matched} feat ${c0.features}+${reunited} outl ${c0.outliers} shadows ${c0.shadows} consumed ${c0.consumed} [${c0.matched === matched && c0.features + reunited === ir.facade.features.length && c0.outliers === ir.facade.outliers.length ? 'agrees with pipeline' : 'DIFFERS from pipeline'}] fails: width ${c0.failWidth} height ${c0.failHeight} area ${c0.failArea} tol ${c0.failTol}`);
    console.log(`  H2 S13 replica HEAD-fit: matched ${c1.matched} feat ${c1.features}+${reunited} outl ${c1.outliers} shadows ${c1.shadows} fails: width ${c1.failWidth} height ${c1.failHeight} area ${c1.failArea} tol ${c1.failTol}`);
    if (c0.outlierBoxes.length > 0) console.log(`  H2 unmatched boxes (w/cell, h/cell, head/cell): ${c0.outlierBoxes.map((o) => `${o.wc.toFixed(2)}/${o.hc.toFixed(2)}/${o.hw.toFixed(2)}`).join(' ')}`);
    let wins = 0; const ratios: number[] = [];
    for (const b of rep.blobs) { const h = headPlateau(b.topProfile, opts); if (h.stepWins) { wins++; ratios.push((h.R - h.L + 1) / (b.bbox.x1 - b.bbox.x0)); } }
    console.log(`  H2 head plateau: step model wins on ${wins}/${rep.blobs.length} blobs; plateau/bbox width ratios ${ratios.length ? `${Math.min(...ratios).toFixed(2)}..${Math.max(...ratios).toFixed(2)}` : '-'}`);
    const bayFix = deriveLocal(rep.blobs, 'x', rect.width, opts, 'ortho-floor-detection');
    const zoneFix = deriveLocal(rep.blobs, 'y', rect.height, opts, 'ortho-floor-detection');
    if (bayFix.refused === null && zoneFix.refused === null) {
        const zbF = bandsFromBoundaries(zoneFix.boundaries), bbF = bandsFromBoundaries(bayFix.boundaries);
        const c2 = classify(rep, zbF, bbF, soffCur, opts, true, consumed);
        const c3 = classify(rep, zbF, bbF, soffCur, opts, false, consumed);
        console.log(`  H1+H2 (ortho-FLOOR ext + head fit): ${zoneFix.centres.length} zones x ${bayFix.centres.length} bays, matched ${c2.matched} feat ${c2.features}+${reunited} outl ${c2.outliers} fails w ${c2.failWidth} h ${c2.failHeight} a ${c2.failArea} | same lattice, bbox fit: matched ${c3.matched} outl ${c3.outliers} fails w ${c3.failWidth} h ${c3.failHeight} a ${c3.failArea}`);
        if (debugWide) {
            const cellOf = (bx: number, by: number) => { const row = zbF.findIndex((b) => by >= b.from && by < b.to); const col = bbF.findIndex((b) => bx >= b.from && bx < b.to); return row < 0 || col < 0 ? null : { row, col }; };
            for (let i = 0; i < rep.blobs.length; i++) {
                const b = rep.blobs[i]!; if (consumed.has(i)) continue;
                const bw = b.bbox.x1 - b.bbox.x0, bh = b.bbox.y1 - b.bbox.y0;
                const cell = cellOf((b.bbox.x0 + b.bbox.x1) / 2, (b.bbox.y0 + b.bbox.y1) / 2);
                const cw = cell === null ? NaN : bbF[cell.col]!.to - bbF[cell.col]!.from, ch = cell === null ? NaN : zbF[cell.row]!.to - zbF[cell.row]!.from;
                if (!(bw > 1.3 * cw) && !(bh > 1.3 * ch) && !(b.area > 0.85 * cw * ch)) continue;
                const hp = headPlateau(b.topProfile, opts);
                const hx0 = b.bbox.x0 + hp.L, hx1 = b.bbox.x0 + hp.R + 1;
                const hc = cellOf((hx0 + hx1) / 2, (b.bbox.y0 + b.bbox.y1) / 2);
                console.log(`     WIDE blob ${i}: bbox x[${b.bbox.x0},${b.bbox.x1}) y[${b.bbox.y0},${b.bbox.y1}) w ${bw} h ${bh} area ${b.area} rect ${b.rectangularity.toFixed(2)} | cell ${cell === null ? '-' : `${cell.row},${cell.col}`} cw ${cw.toFixed(0)} ch ${ch.toFixed(0)} w/cw ${(bw / cw).toFixed(2)} h/ch ${(bh / ch).toFixed(2)} area/cell ${(b.area / (cw * ch)).toFixed(2)} | plateau wins ${hp.stepWins} L ${hp.L} R ${hp.R} superRes ${hp.superRes.toFixed(2)} stepRes ${hp.stepRes.toFixed(2)} head w ${hx1 - hx0} head/cw ${((hx1 - hx0) / cw).toFixed(2)} head cell ${hc === null ? '-' : `${hc.row},${hc.col}`}`);
            }
        }
    }

    // H3 — arcade row: last zone's cells
    const sizesW = rep.blobs.map((b) => b.bbox.x1 - b.bbox.x0), sizesH = rep.blobs.map((b) => b.bbox.y1 - b.bbox.y0);
    const medW = median(sizesW), medH = median(sizesH);
    const lastZone = zoneBands[zoneBands.length - 1]!;
    const arcadeBlobs = rep.blobs.map((b, i) => ({ b, i })).filter(({ b, i }) => { const cy = (b.bbox.y0 + b.bbox.y1) / 2; return cy >= lastZone.from && cy < lastZone.to && !consumed.has(i); });
    const archLine = arcadeBlobs.map(({ b }) => { const a = fitArch(b.topProfile, opts); const key = [...c0.matchedByCell.entries()].find(([, v]) => v === b)?.[0] ?? 'UNMATCHED'; return `[w ${b.bbox.x1 - b.bbox.x0} h ${b.bbox.y1 - b.bbox.y0} rect ${b.rectangularity.toFixed(2)} w/medW ${((b.bbox.x1 - b.bbox.x0) / medW).toFixed(2)} h/medH ${((b.bbox.y1 - b.bbox.y0) / medH).toFixed(2)} ${key} arch ${a.archness.toFixed(2)}]`; });
    console.log(`  H3 last-zone blobs (${arcadeBlobs.length}; band = [1/2.5, 2.5] of medians W ${medW} H ${medH}): ${archLine.join(' ')}`);
    const arcadeCells = ir.facade.zones[ir.facade.zones.length - 1]!.cells;
    console.log(`  H3 IR arcade zone: ${arcadeCells.filter((c) => c.opening !== null).length}/${arcadeCells.length} cells carry an opening; archness ${arcadeCells.map((c) => (c.opening === null ? '-' : c.opening.archness.toFixed(2))).join(' ')}; >=0.5: ${arcadeCells.filter((c) => c.opening !== null && c.opening.archness >= 0.5).length}`);

    // H4 — soffit candidates
    const pCand = slabRows;
    const bCand = boundaryCandidates(d.rows!.profile, zoneBands, rect.height);
    const interiorB = zoneBands.slice(1).map((b) => b.from);
    const nearBoundary = (y: number): boolean => interiorB.some((b, i) => Math.abs(y - b) <= (zoneBands[i + 1]!.to - zoneBands[i + 1]!.from) / 2);
    const suppressed = pCand.filter((y) => !nearBoundary(y));
    const lmCand = boundaryLocalMaxima(d.rows!.profile, zoneBands, rect.height);
    const variants: [string, number[]][] = [['current(peaks)', pCand], ['boundary-argmax (REFUTED form)', bCand], ['P3 boundary local-maxima', lmCand], ['P3 ∪ peaks', [...new Set([...pCand, ...lmCand])].sort((a, b) => a - b)], ['peaks-minus-storey (simulated failure)', suppressed]];
    for (const [name, cand] of variants) {
        const s = detectSoffits(rep.gray, cand, opts);
        console.log(`  H4 ${name.padEnd(40)} candidates ${String(cand.length).padStart(2)} -> soffits ${String(s.length).padStart(2)}, serving ${servedBoundaries(zoneBands, s)}/${zoneBands.length - 1} interior boundaries; mapper: ${mapperLine(s.length, zoneBands.length)}`);
    }
    {
        const sBay = detectSoffitsPerBay(rep.gray, lmCand, bayBands, opts);
        console.log(`  H4b P3 + PER-BAY(median) coverage           candidates ${String(lmCand.length).padStart(2)} -> soffits ${String(sBay.length).padStart(2)}, serving ${servedBoundaries(zoneBands, sBay)}/${zoneBands.length - 1} interior boundaries; mapper: ${mapperLine(sBay.length, zoneBands.length)}`);
        // H4b-CELL: coverage measured over the HEAD SPAN of the opening matched in each bay (any zone),
        // i.e. where C108 §3.10 puts the claim (cell.protrusion). Bays with no matched opening use the bay width.
        const spanBands: Band[] = bayBands.map((b, col) => {
            const hs: { from: number; to: number }[] = [];
            for (const [key, blob] of c0.matchedByCell) { if (Number(key.split(',')[1]) !== col) continue; const h = headPlateau(blob.topProfile, opts); hs.push(h.stepWins ? { from: blob.bbox.x0 + h.L, to: blob.bbox.x0 + h.R + 1 } : { from: blob.bbox.x0, to: blob.bbox.x1 }); }
            if (hs.length === 0) return b;
            return { from: median(hs.map((s) => s.from)), to: median(hs.map((s) => s.to)) };
        });
        const sCell = detectSoffitsPerBay(rep.gray, lmCand, spanBands, opts);
        console.log(`  H4b P3 + PER-CELL(head-span, median bay)    candidates ${String(lmCand.length).padStart(2)} -> soffits ${String(sCell.length).padStart(2)}, serving ${servedBoundaries(zoneBands, sCell)}/${zoneBands.length - 1} interior boundaries; mapper: ${mapperLine(sCell.length, zoneBands.length)} | bands ${sCell.map((s) => `y${s.y}+${s.bandHeight}`).join(' ')}`);
        // + EXCLUSION: an opening's own pixels (its matched blob bbox, railing included) are not evidence of a projection.
        const excl: Rect[][] = bayBands.map((_, col) => [...c0.matchedByCell.entries()].filter(([k]) => Number(k.split(',')[1]) === col).map(([, b]) => b.bbox));
        const sCellX = detectSoffitsPerBay(rep.gray, lmCand, spanBands, opts, excl);
        console.log(`  H4b P3 + PER-CELL + opening-row EXCLUSION   candidates ${String(lmCand.length).padStart(2)} -> soffits ${String(sCellX.length).padStart(2)}, serving ${servedBoundaries(zoneBands, sCellX)}/${zoneBands.length - 1} interior boundaries; mapper: ${mapperLine(sCellX.length, zoneBands.length)} | bands ${sCellX.map((s) => `y${s.y}+${s.bandHeight}`).join(' ')}`);
    }
    if (verbose) {
        console.log(`  H4 zone boundaries ${interiorB.map((v) => v.toFixed(0)).join(' ')} | peaks ${pCand.join(' ')} | boundary-argmax ${bCand.join(' ')} | P3 ${lmCand.join(' ')}`);
        console.log(`  H4 soffits(current): ${soffCur.map((s) => `y${s.y}+${s.bandHeight}(drop ${s.drop.toFixed(0)})`).join(' ')}`);
    }
}

const which = process.env.RP73_MAIN === '0' ? 'none' : (process.argv[2] ?? 'all');
const M_TRUTH = { bays: 5, zones: 7, openings: 35, soffitLines: 5 };
const corpusMod = which === 'none' ? null : await corpusModule();
if (which === 'all' || which === 'M') {
    const base = drawM({ id: 'M' });
    if (corpusMod !== null) {
        const ref = corpusMod.caseM().image;
        let diff = 0; for (let i = 0; i < ref.data.length; i++) if (ref.data[i] !== base.image.data[i]) diff++;
        console.log(`drawM({}) vs caseM(): ${diff === 0 ? 'BYTE-IDENTICAL' : `${diff} bytes differ`} (${base.W}x${base.H})`);
    }
    await run('M auto-plane (as the corpus test runs it)', base.image, undefined, M_TRUTH, true);
    await run('M user-quad (as the founder ran it, plane 1.00)', base.image, base.quad, M_TRUTH, true);
}
if (which === 'all' || which === 'H1') {
    for (const v of [
        { id: 'M-edge L+80 (one blank pitch left)', extraLeft: 80 },
        { id: 'M-edge L+80 R+80', extraLeft: 80, extraRight: 80 },
        { id: 'M-edge L+48 (0.6 pitch)', extraLeft: 48 },
        { id: 'M-corner-merged L+48 R+48', extraLeft: 48, extraRight: 48, cornerRail: 'merged' as const },
        { id: 'M-corner-separate L+48 R+48', extraLeft: 48, extraRight: 48, cornerRail: 'separate' as const },
        { id: 'M-corner-merged L+80 R+80', extraLeft: 80, extraRight: 80, cornerRail: 'merged' as const },
    ]) { const dr = drawM(v); await run(v.id, dr.image, dr.quad, M_TRUTH, false); }
    if (corpusMod !== null) {
        const b = corpusMod.caseB();
        const bq: Quad = [{ x: 40, y: 30 }, { x: 440, y: 30 }, { x: 440, y: 330 }, { x: 40, y: 330 }];
        await run('case B auto-plane', b.image, undefined, { bays: 5, zones: 4, openings: 15, soffitLines: 0 }, false);
        await run('case B user-quad', b.image, bq, { bays: 5, zones: 4, openings: 15, soffitLines: 0 }, false);
    }
}
if (which === 'all' || which === 'H2') {
    for (const v of [
        { id: 'M-wing20 (railing 88px in 80px slots: merges across piers)', railWing: 20 },
        { id: 'M-wing15 (78px, 2px pier)', railWing: 15 },
    ]) { const dr = drawM(v); await run(v.id, dr.image, dr.quad, M_TRUTH, false); }
}
if (which === 'all' || which === 'H3') {
    for (const v of [
        { id: 'M-lit jambs-dark (bright interior, 4px dark jambs)', lit: 'jambs-dark' as const },
        { id: 'M-lit head-only (bright interior to the jambs)', lit: 'head-only' as const },
    ]) { const dr = drawM(v); await run(v.id, dr.image, dr.quad, M_TRUTH, false); }
}
if (which === 'all' || which === 'H4') {
    for (const wpx of [72, 48, 40]) {
        const dr = drawM({ id: 'M-perbay', perBaySoffit: wpx });
        await run(`M-perbay soffit ${wpx}px per window slot (row coverage ${(5 * wpx / 480).toFixed(2)} of facade width)`, dr.image, dr.quad, M_TRUTH, true);
    }
}
if (which === 'H2DBG') {
    const dr = drawM({ id: 'dbg', extraLeft: 80, extraRight: 80, cornerRail: 'merged' });
    await run('M-corner-merged L+80 R+80 (debug wide blobs)', dr.image, dr.quad, M_TRUTH, false, true);
    const dr2 = drawM({ id: 'dbg2', extraLeft: 48, extraRight: 48, cornerRail: 'separate' });
    await run('M-corner-separate L+48 R+48 (debug wide blobs)', dr2.image, dr2.quad, M_TRUTH, false, true);
}
if (which.startsWith('corpus') && corpusMod !== null) {
    const only = which.includes(':') ? which.split(':')[1]!.split(',') : null;
    for (const c of corpusMod.allCases()) {
        if (only !== null && !only.includes(c.id)) continue;
        const t = c.truth;
        await run(`corpus ${c.id}`, c.image, undefined, { bays: t.bays, zones: t.storeys, openings: t.openings.length, soffitLines: t.soffitBandHeight > 0 ? t.storeys - 1 : 0 }, false);
    }
}
