// REALPHOTO73 — H5 probe. Runs the floor-plan importer's RASTER primitive
// (apps/ai-worker/src/pdf-to-bim/raster-cv.ts: binarize → despeckle → close →
// boundary → Hough segments) on case M and its variants, closes segments into
// rectangles, and counts rectangles that coincide with DRAWN openings (IoU >= 0.5)
// against the fill-based blob detector's matched count. READ-ONLY: nothing in src/
// or apps/ is touched; the import is a relative path into the app for measurement.
import { reconstructFacade } from '../src/index.js';
import type { Quad, RasterImage } from '../src/contracts/RasterImage.js';
import { drawM, drawnOpenings, corpusModule, replicate, headPlateau } from './probe-rp73-main.local.mts';
import { resolveOptions } from '../src/index.js';
import {
    rgbaToGray, otsuThreshold, binarize, despeckle, morphClose3, extractBoundary, houghSegments,
    DEFAULT_RASTER_CV_OPTIONS,
} from '../../apps/ai-worker/src/pdf-to-bim/raster-cv.js';
import type { LineSegmentPx } from '../../apps/ai-worker/src/pdf-to-bim/raster-cv.js';

interface Box { x0: number; y0: number; x1: number; y1: number }
const iou = (a: Box, b: Box): number => {
    const ix = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
    const iy = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
    const inter = ix * iy; const ua = (a.x1 - a.x0) * (a.y1 - a.y0) + (b.x1 - b.x0) * (b.y1 - b.y0) - inter;
    return ua > 0 ? inter / ua : 0;
};

/** Close Hough segments into axis-aligned rectangles: two vertical segments with overlapping y-span,
 *  bridged by a horizontal segment near the top and one near the bottom. Tolerance = the Hough
 *  stage's own lineDistTolPx rounded up; overlap floors are the definitional half. */
function closeRectangles(segs: LineSegmentPx[], tol: number): Box[] {
    const vert = segs.filter((s) => Math.abs(s.x1 - s.x2) <= 2 && Math.abs(s.y2 - s.y1) >= 8).map((s) => ({ x: (s.x1 + s.x2) / 2, y0: Math.min(s.y1, s.y2), y1: Math.max(s.y1, s.y2) }));
    const horz = segs.filter((s) => Math.abs(s.y1 - s.y2) <= 2 && Math.abs(s.x2 - s.x1) >= 8).map((s) => ({ y: (s.y1 + s.y2) / 2, x0: Math.min(s.x1, s.x2), x1: Math.max(s.x1, s.x2) }));
    const boxes: Box[] = [];
    for (let i = 0; i < vert.length; i++) for (let j = 0; j < vert.length; j++) {
        const a = vert[i]!, b = vert[j]!;
        if (b.x - a.x < 8) continue;
        const y0 = Math.max(a.y0, b.y0), y1 = Math.min(a.y1, b.y1);
        const shorter = Math.min(a.y1 - a.y0, b.y1 - b.y0);
        if (y1 - y0 < 0.5 * shorter) continue;
        const w = b.x - a.x;
        const top = horz.find((h) => Math.abs(h.y - y0) <= tol && Math.min(h.x1, b.x) - Math.max(h.x0, a.x) >= 0.5 * w);
        const bot = horz.find((h) => Math.abs(h.y - y1) <= tol && Math.min(h.x1, b.x) - Math.max(h.x0, a.x) >= 0.5 * w);
        if (top === undefined || bot === undefined) continue;
        const box: Box = { x0: a.x, y0: top.y, x1: b.x, y1: bot.y };
        if (box.y1 - box.y0 < 8) continue;
        if (boxes.some((o) => iou(o, box) > 0.7)) continue;
        boxes.push(box);
    }
    return boxes;
}

/** The IMPORTER's closure: two PARALLEL segments (stage2-walls detectWallPairs) — a jamb pair or a head/sill
 *  pair — bound a box; no fourth edge is required. Spacing floor = the Hough walker's own minLineLengthPx
 *  fraction (8 px), overlap floor = the definitional half. No mm band: the importer's 50–600 mm / 500 mm
 *  constants are floor-plan semantics and are reported separately. */
function pairBoxes(segs: LineSegmentPx[]): { boxes: Box[]; vertPairs: number; horzPairs: number } {
    const vert = segs.filter((s) => Math.abs(s.x1 - s.x2) <= 2 && Math.abs(s.y2 - s.y1) >= 8).map((s) => ({ x: (s.x1 + s.x2) / 2, y0: Math.min(s.y1, s.y2), y1: Math.max(s.y1, s.y2) }));
    const horz = segs.filter((s) => Math.abs(s.y1 - s.y2) <= 2 && Math.abs(s.x2 - s.x1) >= 8).map((s) => ({ y: (s.y1 + s.y2) / 2, x0: Math.min(s.x1, s.x2), x1: Math.max(s.x1, s.x2) }));
    const boxes: Box[] = []; let vp = 0, hp = 0;
    const push = (box: Box): void => { if (!boxes.some((o) => iou(o, box) > 0.7)) boxes.push(box); };
    for (let i = 0; i < vert.length; i++) for (let j = 0; j < vert.length; j++) {
        const a = vert[i]!, b = vert[j]!; if (b.x - a.x < 8) continue;
        const y0 = Math.max(a.y0, b.y0), y1 = Math.min(a.y1, b.y1);
        if (y1 - y0 < 0.5 * Math.min(a.y1 - a.y0, b.y1 - b.y0)) continue;
        vp++; push({ x0: a.x, y0, x1: b.x, y1 });
    }
    for (let i = 0; i < horz.length; i++) for (let j = 0; j < horz.length; j++) {
        const a = horz[i]!, b = horz[j]!; if (b.y - a.y < 8) continue;
        const x0 = Math.max(a.x0, b.x0), x1 = Math.min(a.x1, b.x1);
        if (x1 - x0 < 0.5 * Math.min(a.x1 - a.x0, b.x1 - b.x0)) continue;
        hp++; push({ x0, y0: a.y, x1, y1: b.y });
    }
    return { boxes, vertPairs: vp, horzPairs: hp };
}

async function runH5(id: string, image: RasterImage, quad: Quad, openingsSrc: readonly Box[], facade: Box): Promise<void> {
    const { ir, diagnostics: d } = await reconstructFacade(image, { facadeQuad: quad });
    const rect = d.rectified.image!;
    const sx = rect.width / (facade.x1 - facade.x0), sy = rect.height / (facade.y1 - facade.y0);
    const drawn: Box[] = openingsSrc.map((o) => ({ x0: (o.x0 - facade.x0) * sx, y0: (o.y0 - facade.y0) * sy, x1: (o.x1 - facade.x0) * sx, y1: (o.y1 - facade.y0) * sy }));
    // ── the importer's primitive, verbatim order (raster-cv.ts analyseRasterFloorPlan stage 1-2) ──
    const t0 = Date.now();
    const gray = rgbaToGray(rect.data, rect.width, rect.height);
    const thr = otsuThreshold(gray);
    const mask = morphClose3(despeckle(binarize(gray, thr), DEFAULT_RASTER_CV_OPTIONS.speckleMinNeighbours));
    const boundary = extractBoundary(mask);
    const segs = houghSegments(boundary, DEFAULT_RASTER_CV_OPTIONS);
    const boxes = closeRectangles(segs, Math.ceil(DEFAULT_RASTER_CV_OPTIONS.lineDistTolPx) + 1);
    const pairs = pairBoxes(segs);
    const ms = Date.now() - t0;
    // ── scoring ──
    const hit = drawn.map((o) => boxes.some((b) => iou(o, b) >= 0.5));
    const falseBoxes = boxes.filter((b) => !drawn.some((o) => iou(o, b) >= 0.5));
    const pairHit = drawn.map((o) => pairs.boxes.some((b) => iou(o, b) >= 0.5));
    const pairFalse = pairs.boxes.filter((b) => !drawn.some((o) => iou(o, b) >= 0.5));
    const pairBestIoU = drawn.map((o) => Math.max(0, ...pairs.boxes.map((b) => iou(o, b))));
    console.log(`  PAIR closure (the importer's): ${pairs.boxes.length} boxes from ${pairs.vertPairs} jamb pairs + ${pairs.horzPairs} head/sill pairs | drawn openings with a pair box at IoU>=0.5: ${pairHit.filter(Boolean).length}/${drawn.length} (best IoU per opening: min ${Math.min(...pairBestIoU).toFixed(2)} median ${[...pairBestIoU].sort((a, b) => a - b)[Math.floor(pairBestIoU.length / 2)]!.toFixed(2)}) | FALSE pair boxes ${pairFalse.length}`);
    // ── the derived filter for (c): the lattice's OWN 2-D size band around the median MATCHED opening (the fill
    //    detector's matched cells, head-span width × bbox height), factor 2.5, plus at most one box per lattice cell
    //    (largest IoU with the cell's centre-box wins). No new constant.
    {
        // The fill detector's matched blobs, with their HEAD SPAN on x (the jamb span) — the replica is index-aligned with diagnostics.blobs.
        const optsR = resolveOptions({ facadeQuad: quad });
        const rep = replicate(rect, optsR);
        const headBoxOf = new Map<string, Box>();
        d.blobs.forEach((b, i) => { if (b.matchedCell === null) return; const blob = rep.blobs[i]!; const hp = headPlateau(blob.topProfile, optsR); const x0 = hp.stepWins ? blob.bbox.x0 + hp.L : blob.bbox.x0, x1 = hp.stepWins ? blob.bbox.x0 + hp.R + 1 : blob.bbox.x1; headBoxOf.set(`${b.matchedCell.row},${b.matchedCell.col}`, { x0, y0: blob.bbox.y0, x1, y1: blob.bbox.y1 }); });
        const matchedBoxes = [...headBoxOf.values()].map((b) => ({ w: b.x1 - b.x0, h: b.y1 - b.y0 }));
        const med = (v: number[]): number => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)]! : 0; };
        const mw = med(matchedBoxes.map((b) => b.w)), mh = med(matchedBoxes.map((b) => b.h)), f = 2.5;
        const inBand = pairs.boxes.filter((b) => { const w = b.x1 - b.x0, h = b.y1 - b.y0; return mw > 0 && mh > 0 && w >= mw / f && w <= mw * f && h >= mh / f && h <= mh * f; });
        const zb = d.lattice.zones.boundaries, bb = d.lattice.bays.boundaries;
        const cellOf = (x: number, y: number): string | null => { let r = -1, c = -1; for (let i = 0; i + 1 < zb.length; i++) if (y >= zb[i]! && y < zb[i + 1]!) r = i; for (let i = 0; i + 1 < bb.length; i++) if (x >= bb[i]! && x < bb[i + 1]!) c = i; return r < 0 || c < 0 ? null : `${r},${c}`; };
        const perCell = new Map<string, Box>();
        for (const b of inBand) { const k = cellOf((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2); if (k === null) continue; const [r, c] = k.split(',').map(Number) as [number, number]; const cell: Box = { x0: bb[c]!, y0: zb[r]!, x1: bb[c + 1]!, y1: zb[r + 1]! }; const cur = perCell.get(k); if (cur === undefined || iou(b, cell) > iou(cur, cell)) perCell.set(k, b); }
        const survivors = [...perCell.values()];
        const sHit = drawn.filter((o) => survivors.some((b) => iou(o, b) >= 0.5)).length;
        const sFalse = survivors.filter((b) => !drawn.some((o) => iou(o, b) >= 0.5)).length;
        console.log(`  (c) FILTERED by the lattice's 2-D size band (median matched ${mw.toFixed(0)}x${mh.toFixed(0)}, x/÷2.5) + one per cell: ${inBand.length} in band -> ${survivors.length} survivors | drawn hit ${sHit}/${drawn.length} | false survivors ${sFalse} (cells ${ (zb.length - 1) * (bb.length - 1) })`);
        // (c2) AGREEMENT selector: per cell, the in-band pair box with the largest IoU against the FILL detector's
        //      opening box where the fill matched one; where it did not, the in-band box whose size is nearest
        //      (log-ratio) to the median matched size. Reports recovery on exactly the cells the fill lost.
        const fillBox = headBoxOf;
        const byCell = new Map<string, Box[]>();
        for (const b of inBand) { const k = cellOf((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2); if (k === null) continue; (byCell.get(k) ?? byCell.set(k, []).get(k)!).push(b); }
        const chosen: { box: Box; via: 'agreement' | 'size' }[] = [];
        for (const [k, list] of byCell) {
            const fb = fillBox.get(k);
            if (fb !== undefined) { let best = list[0]!, bi = -1; for (const b of list) { const v = iou(b, fb); if (v > bi) { bi = v; best = b; } } chosen.push({ box: best, via: 'agreement' }); }
            else { let best = list[0]!, bd = Infinity; for (const b of list) { const dd = Math.abs(Math.log((b.x1 - b.x0) / mw)) + Math.abs(Math.log((b.y1 - b.y0) / mh)); if (dd < bd) { bd = dd; best = b; } } chosen.push({ box: best, via: 'size' }); }
        }
        const hitAny = drawn.filter((o) => chosen.some((c) => iou(o, c.box) >= 0.5)).length;
        const fillMissed = drawn.filter((o) => ![...fillBox.values()].some((fb) => iou(o, fb) >= 0.5));
        const recovered = fillMissed.filter((o) => chosen.some((c) => c.via === 'size' && iou(o, c.box) >= 0.5)).length;
        const falseChosen = chosen.filter((c) => !drawn.some((o) => iou(o, c.box) >= 0.5)).length;
        console.log(`  (c2) AGREEMENT selector: ${chosen.length} chosen (${chosen.filter((c) => c.via === 'agreement').length} by agreement, ${chosen.filter((c) => c.via === 'size').length} by size) | drawn hit ${hitAny}/${drawn.length} | fill missed ${fillMissed.length}, RECOVERED by the edge source ${recovered} | false chosen ${falseChosen}`);
    }
    const sizes = pairFalse.map((b) => `${(b.x1 - b.x0).toFixed(0)}x${(b.y1 - b.y0).toFixed(0)}`);
    const hist = new Map<string, number>(); for (const s of sizes) hist.set(s, (hist.get(s) ?? 0) + 1);
    console.log(`    false pair-box sizes (w x h, count): ${[...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, n]) => `${k}×${n}`).join(' ')}`);
    // per-edge coverage (is each drawn edge covered by SOME segment?) — the weaker claim
    const edgeCovered = (o: Box): number => {
        const tol = 3; let n = 0;
        const v = segs.filter((s) => Math.abs(s.x1 - s.x2) <= 2), h = segs.filter((s) => Math.abs(s.y1 - s.y2) <= 2);
        const ov = (a0: number, a1: number, b0: number, b1: number): number => Math.min(a1, b1) - Math.max(a0, b0);
        if (v.some((s) => Math.abs(s.x1 - o.x0) <= tol && ov(Math.min(s.y1, s.y2), Math.max(s.y1, s.y2), o.y0, o.y1) >= 0.5 * (o.y1 - o.y0))) n++;
        if (v.some((s) => Math.abs(s.x1 - o.x1) <= tol && ov(Math.min(s.y1, s.y2), Math.max(s.y1, s.y2), o.y0, o.y1) >= 0.5 * (o.y1 - o.y0))) n++;
        if (h.some((s) => Math.abs(s.y1 - o.y0) <= tol && ov(Math.min(s.x1, s.x2), Math.max(s.x1, s.x2), o.x0, o.x1) >= 0.5 * (o.x1 - o.x0))) n++;
        if (h.some((s) => Math.abs(s.y1 - o.y1) <= tol && ov(Math.min(s.x1, s.x2), Math.max(s.x1, s.x2), o.x0, o.x1) >= 0.5 * (o.x1 - o.x0))) n++;
        return n;
    };
    const edges = drawn.map(edgeCovered);
    const fillMatched = ir.facade.zones.flatMap((z) => z.cells).filter((c) => c.opening !== null).length;
    // arched openings (drawn with a curved head) — flag separately: their head is not a line
    console.log(`\n=== H5 ${id} === rect ${rect.width}x${rect.height} otsu ${thr} | segments ${segs.length} (vert ${segs.filter((s) => Math.abs(s.x1 - s.x2) <= 2).length}, horz ${segs.filter((s) => Math.abs(s.y1 - s.y2) <= 2).length}) | rectangles closed ${boxes.length} | ${ms} ms`);
    console.log(`  drawn openings ${drawn.length}: RECTANGLE IoU>=0.5 on ${hit.filter(Boolean).length} | edges covered 4/4: ${edges.filter((e) => e === 4).length}, >=3/4: ${edges.filter((e) => e >= 3).length}, both jambs: ${drawn.filter((o) => { const v = segs.filter((s) => Math.abs(s.x1 - s.x2) <= 2); const ov = (s: LineSegmentPx) => Math.min(Math.max(s.y1, s.y2), o.y1) - Math.max(Math.min(s.y1, s.y2), o.y0) >= 0.5 * (o.y1 - o.y0); return v.some((s) => Math.abs(s.x1 - o.x0) <= 3 && ov(s)) && v.some((s) => Math.abs(s.x1 - o.x1) <= 3 && ov(s)); }).length}`);
    console.log(`  FALSE rectangles (no drawn opening at IoU>=0.5): ${falseBoxes.length} — sizes ${falseBoxes.slice(0, 12).map((b) => `${(b.x1 - b.x0).toFixed(0)}x${(b.y1 - b.y0).toFixed(0)}`).join(' ')}${falseBoxes.length > 12 ? ' …' : ''}`);
    console.log(`  FILL detector (S12/S13 as shipped): matched ${fillMatched} of ${drawn.length}`);
    const missByFill = drawn.length - fillMatched, missByEdge = drawn.length - hit.filter(Boolean).length;
    console.log(`  => misses: fill ${missByFill}, edge-rectangle ${missByEdge}`);
}

for (const v of [
    { id: 'case M (as drawn — drawM is byte-identical to caseM)' },
    { id: 'M-corner-merged L+80 R+80 (fill lost 12 outer windows)', extraLeft: 80, extraRight: 80, cornerRail: 'merged' as const },
    { id: 'M-corner-separate L+48 R+48', extraLeft: 48, extraRight: 48, cornerRail: 'separate' as const },
    { id: 'M-lit jambs-dark (fill lost all 5 arches)', lit: 'jambs-dark' as const },
    { id: 'M-wing20 (railings merge across piers; fill matched 14)', railWing: 20 },
]) {
    const dr = drawM(v);
    await runH5(v.id, dr.image, dr.quad, drawnOpenings(v), dr.facade);
}
const corpus = await corpusModule();
if (corpus !== null) {
    const L = corpus.caseL();
    await runH5('case L (clean, no railings)', L.image, [{ x: L.truth.facadeRect.x0, y: L.truth.facadeRect.y0 }, { x: L.truth.facadeRect.x1, y: L.truth.facadeRect.y0 }, { x: L.truth.facadeRect.x1, y: L.truth.facadeRect.y1 }, { x: L.truth.facadeRect.x0, y: L.truth.facadeRect.y1 }], L.truth.openings, L.truth.facadeRect);
    const C = corpus.caseC();
    await runH5('case C (all heads semicircular — edge closure has no top line)', C.image, [{ x: 40, y: 30 }, { x: 440, y: 30 }, { x: 440, y: 330 }, { x: 40, y: 330 }], C.truth.openings, C.truth.facadeRect);
    const B = corpus.caseB();
    await runH5('case B (wide ground opening)', B.image, [{ x: 40, y: 30 }, { x: 440, y: 30 }, { x: 440, y: 330 }, { x: 40, y: 330 }], B.truth.openings, B.truth.facadeRect);
}
