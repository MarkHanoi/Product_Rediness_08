/**
 * DrawingPipelineWorker — Contract 23 §14 (Web Worker entry point)
 *
 * Implements drawing-pipeline stages 1–6 off the main thread.
 * The main thread (DrawingPipelineOrchestrator) projects geometry with OBC
 * EdgeProjector, serialises the resulting 2D coordinates as Float32Array, and
 * posts a PipelineRequest.  This worker processes that request and posts back
 * a PipelineResult containing StyledEdge[] and StyledPolygon[].
 *
 * Stage mapping (Contract 23 §14):
 *   Stage 1 — GeometryProvider     : Unpack Float32Array batches → internal edge list
 *   Stage 2 — ViewRangeFilter/classify: Derive VRZone from ISO layer tag suffix
 *   Stage 3 — CutIntersector       : Graph-stitch CUT edges → closed poche polygons
 *   Stage 4 — EdgeExtractor        : Partition edges by zone; drop HIDDEN
 *   Stage 5 — HLR Pass             : Cohen-Sutherland occluder test (PROJECTION/BEYOND)
 *   Stage 6 — StyleResolver        : Apply inline pen table + serialised rule overrides
 *
 * MANDATORY CONTRACT CONSTRAINTS (automatic defect if violated):
 *   ❌ No DOM access (window, document, HTMLElement, …)
 *   ❌ No Three.js renderer or scene-graph operations
 *   ❌ No Math.random() (world-anchored hatch; currently unused in Stage 3)
 *   ❌ No GPU depth readback
 *   ❌ No BRep/CSG
 */

import type {
    PipelineRequest,
    PipelineResult,
    PipelineError,
    PipelineElementBatch,
    SerializedRule,
    StyledEdge,
    StyledPolygon,
} from './DrawingPipelineTypes';

// ─── Locked constants (Contract 23 §1.4) ─────────────────────────────────────

const EPSILON           = 1e-6;
const SNAP_TOLERANCE    = 0.005;   // 5 mm — polygon stitching snap grid

// ─── Inline pen table (Contract 23 §8, locked values) ────────────────────────
//
// Mirrored from PenWeightTable.ts to keep the worker bundle free of THREE.js.
// Any change to PenWeightTable.ts MUST be reflected here.

interface PenStyle {
    widthMm:  number;
    color:    string;
    dashPx:   number[] | null;
    opacity:  number;
}

function pen(widthMm: number, color: string, dashPx: number[] | null = null, opacity = 1): PenStyle {
    return { widthMm, color, dashPx, opacity };
}

const SYSTEM_PEN_TABLE: Record<string, Record<string, PenStyle>> = {
    CUT: {
        wall:       pen(0.50, '#000000'),
        slab:       pen(0.50, '#000000'),
        column:     pen(0.70, '#000000'),
        structural: pen(0.70, '#000000'),
        beam:       pen(0.70, '#000000'),
        door:       pen(0.35, '#000000'),
        window:     pen(0.35, '#000000'),
        stair:      pen(0.35, '#000000'),
        roof:       pen(0.50, '#000000'),
        ceiling:    pen(0.35, '#000000'),
    },
    PROJECTION: {
        wall:       pen(0.25, '#000000'),
        slab:       pen(0.25, '#000000'),
        column:     pen(0.25, '#1e293b'),
        structural: pen(0.25, '#1e293b'),
        beam:       pen(0.25, '#1e293b'),
        door:       pen(0.18, '#1f2937'),
        window:     pen(0.18, '#1f2937'),
        stair:      pen(0.18, '#334155'),
        roof:       pen(0.18, '#475569', [3, 2]),
        ceiling:    pen(0.13, '#64748b', [2, 2]),
        furniture:  pen(0.13, '#303030'),
        lighting:   pen(0.13, '#303030'),
        plumbing:   pen(0.13, '#374151'),
        grid:       pen(0.13, '#0000cc', [8, 4]),
        annotation: pen(0.18, '#000000'),
        level:      pen(0.13, '#334155', [5, 3]),
    },
    BEYOND: {
        wall:       pen(0.13, '#6b7280', [4, 3], 0.55),
        slab:       pen(0.13, '#6b7280', [4, 3], 0.55),
        column:     pen(0.13, '#6b7280', [4, 3], 0.55),
        structural: pen(0.13, '#6b7280', [4, 3], 0.55),
        beam:       pen(0.13, '#6b7280', [4, 3], 0.55),
        door:       pen(0.13, '#6b7280', [4, 3], 0.55),
        window:     pen(0.13, '#6b7280', [4, 3], 0.55),
        stair:      pen(0.13, '#6b7280', [4, 3], 0.55),
        roof:       pen(0.13, '#6b7280', [4, 3], 0.55),
        ceiling:    pen(0.13, '#6b7280', [4, 3], 0.55),
        furniture:  pen(0.13, '#6b7280', [4, 3], 0.55),
        lighting:   pen(0.13, '#6b7280', [4, 3], 0.55),
    },
    HIDDEN: {
        _default:   pen(0.0, '#000000', null, 0),
    },
};

const DEFAULT_PEN: PenStyle = pen(0.13, '#374151');

function systemResolvePen(zone: string, category: string): PenStyle {
    return SYSTEM_PEN_TABLE[zone]?.[category]
        ?? SYSTEM_PEN_TABLE[zone]?.['wall']   // structural fallback
        ?? DEFAULT_PEN;
}

// ─── In-worker style resolver (mirrors GraphicsRulesEngine logic) ─────────────

function workerResolveStyle(
    zone:      string,
    category:  string,
    elementId: string,
    viewId:    string,
    rules:     SerializedRule[],
): PenStyle {
    const matching = rules.filter(r => {
        if (r.zone      && r.zone      !== zone)      return false;
        if (r.category  && r.category  !== category)  return false;
        if (r.viewId    && r.viewId    !== viewId)     return false;
        if (r.elementId && r.elementId !== elementId)  return false;
        // View/element rules require context to be present
        if (r.priority === 9000  && !viewId)     return false;
        if (r.priority === 10000 && !elementId)  return false;
        return true;
    });

    if (matching.length === 0) return systemResolvePen(zone, category);

    matching.sort((a, b) => a.priority - b.priority);
    const resolved: PenStyle = { ...systemResolvePen(zone, category) };
    for (const rule of matching) {
        const s = rule.style;
        if (s.widthMm !== undefined) resolved.widthMm = s.widthMm;
        if (s.color   !== undefined) resolved.color   = s.color;
        if (s.dashPx  !== undefined) resolved.dashPx  = s.dashPx ?? null;
        if (s.opacity !== undefined) resolved.opacity  = s.opacity;
    }
    return resolved;
}

// ─── Zone + category classification from ISO layer tag (Stage 2) ──────────────

type VRZone = 'CUT' | 'PROJECTION' | 'BEYOND' | 'HIDDEN';

function zoneFromLayerTag(layerTag: string): VRZone {
    if (/:cut$/i.test(layerTag))     return 'CUT';
    if (/:beyond$/i.test(layerTag))  return 'BEYOND';
    if (/:hidden$/i.test(layerTag))  return 'HIDDEN';
    return 'PROJECTION';
}

const ISO_LAYER_TO_CATEGORY: Record<string, string> = {
    'A-WALL':  'wall',
    'A-FLOR':  'slab',
    'A-COLS':  'column',
    'A-BEAM':  'beam',
    'A-DOOR':  'door',
    'A-GLAZ':  'window',
    'A-STRS':  'stair',
    'A-ROOF':  'roof',
    'A-FURN':  'furniture',
    'A-LGHT':  'lighting',
    'A-PLMB':  'plumbing',
    'A-CEIL':  'ceiling',
    'A-GRID':  'grid',
    'A-LEVL':  'level',
};

function categoryFromLayerTag(layerTag: string): string {
    const tag = layerTag.trim();
    for (const [prefix, cat] of Object.entries(ISO_LAYER_TO_CATEGORY)) {
        if (tag === prefix || tag.startsWith(`${prefix}:`) || tag.includes(` ${prefix}`)) {
            return cat;
        }
    }
    return 'wall';
}

// ─── ISO layer prefix for poche fill lookup ───────────────────────────────────

const ISO_POCHE_PREFIXES = ['A-WALL', 'A-COLS', 'A-FLOR', 'A-BEAM'];

function baseIsoLayerForPoche(layerTag: string): string | null {
    const tag = layerTag.trim();
    for (const prefix of ISO_POCHE_PREFIXES) {
        if (tag === prefix || tag.startsWith(`${prefix}:`) || tag.includes(` ${prefix}`)) {
            return prefix;
        }
    }
    return null;
}

// ─── Internal geometry types ──────────────────────────────────────────────────

interface RawEdge {
    h0: number;
    v0: number;
    h1: number;
    v1: number;
    elementId: string;
    layerTag:  string;
    zone:      VRZone;
    category:  string;
}

// ─── Stage 1 — GeometryProvider ───────────────────────────────────────────────

function stage1_geometryProvider(batches: PipelineElementBatch[]): RawEdge[] {
    const edges: RawEdge[] = [];

    for (const batch of batches) {
        const pos   = batch.positions;
        const count = pos.length;
        if (count < 4) continue;

        const zone     = zoneFromLayerTag(batch.layerTag);
        const category = categoryFromLayerTag(batch.layerTag);

        for (let i = 0; i + 3 < count; i += 4) {
            const h0 = pos[i]!;
            const v0 = pos[i + 1]!;
            const h1 = pos[i + 2]!;
            const v1 = pos[i + 3]!;

            if (!Number.isFinite(h0) || !Number.isFinite(v0) ||
                !Number.isFinite(h1) || !Number.isFinite(v1)) continue;

            const dh = h1 - h0;
            const dv = v1 - v0;
            if (dh * dh + dv * dv < EPSILON * EPSILON) continue;

            edges.push({ h0, v0, h1, v1, elementId: batch.elementId, layerTag: batch.layerTag, zone, category });
        }
    }

    return edges;
}

// ─── Stage 2 — ViewRangeFilter / classify ─────────────────────────────────────

interface ClassifiedEdges {
    cut:        RawEdge[];
    projection: RawEdge[];
    beyond:     RawEdge[];
}

function stage2_classify(edges: RawEdge[]): ClassifiedEdges {
    const cut:        RawEdge[] = [];
    const projection: RawEdge[] = [];
    const beyond:     RawEdge[] = [];

    for (const edge of edges) {
        switch (edge.zone) {
            case 'CUT':        cut.push(edge);        break;
            case 'PROJECTION': projection.push(edge); break;
            case 'BEYOND':     beyond.push(edge);     break;
            // HIDDEN — dropped
        }
    }

    return { cut, projection, beyond };
}

// ─── Stage 3 — CutIntersector / Poche polygon stitching ──────────────────────

interface PolyGroup {
    elementId: string;
    layerTag:  string;
    edges:     RawEdge[];
}

function snapKey(h: number, v: number): string {
    return `${Math.round(h / SNAP_TOLERANCE)},${Math.round(v / SNAP_TOLERANCE)}`;
}

function stitchPolygon(edges: RawEdge[]): number[][] {
    const adj = new Map<string, Array<{ h: number; v: number; edgeIdx: number }>>();
    const usedEdges = new Set<number>();

    function addAdj(k: string, h: number, v: number, idx: number) {
        let list = adj.get(k);
        if (!list) { list = []; adj.set(k, list); }
        list.push({ h, v, edgeIdx: idx });
    }

    for (let i = 0; i < edges.length; i++) {
        const e = edges[i]!;
        const ka = snapKey(e.h0, e.v0);
        const kb = snapKey(e.h1, e.v1);
        addAdj(ka, e.h1, e.v1, i);
        addAdj(kb, e.h0, e.v0, i);
    }

    const polygons: number[][] = [];

    for (let startIdx = 0; startIdx < edges.length; startIdx++) {
        if (usedEdges.has(startIdx)) continue;

        const startEdge = edges[startIdx]!;
        const chain: Array<{ h: number; v: number }> = [
            { h: startEdge.h0, v: startEdge.v0 },
            { h: startEdge.h1, v: startEdge.v1 },
        ];
        usedEdges.add(startIdx);

        const originKey = snapKey(startEdge.h0, startEdge.v0);
        let closed = false;
        let maxSteps = edges.length;

        while (!closed && maxSteps-- > 0) {
            const last = chain[chain.length - 1]!;
            const lastKey = snapKey(last.h, last.v);
            const neighbours = adj.get(lastKey);
            if (!neighbours) break;

            let extended = false;
            for (const nb of neighbours) {
                if (usedEdges.has(nb.edgeIdx)) continue;

                usedEdges.add(nb.edgeIdx);
                const nbKey = snapKey(nb.h, nb.v);

                if (nbKey === originKey && chain.length >= 3) {
                    closed = true;
                    break;
                }

                chain.push({ h: nb.h, v: nb.v });
                extended = true;
                break;
            }

            if (!extended) break;
        }

        if (closed && chain.length >= 3) {
            const flat: number[] = [];
            for (const pt of chain) { flat.push(pt.h, pt.v); }
            polygons.push(flat);
        }
    }

    return polygons;
}

function stage3_cutIntersector(
    classified:  ClassifiedEdges,
    pocheFills:  Record<string, string>,
): StyledPolygon[] {
    const groups = new Map<string, PolyGroup>();
    for (const edge of classified.cut) {
        const key = `${edge.elementId}::${edge.layerTag}`;
        let g = groups.get(key);
        if (!g) {
            g = { elementId: edge.elementId, layerTag: edge.layerTag, edges: [] };
            groups.set(key, g);
        }
        g.edges.push(edge);
    }

    const polygons: StyledPolygon[] = [];

    for (const group of groups.values()) {
        if (group.edges.length < 3) continue;

        const isoPrefix = baseIsoLayerForPoche(group.layerTag);
        if (!isoPrefix) continue;

        const fillColor = pocheFills[isoPrefix];
        if (!fillColor) continue;

        const stitched = stitchPolygon(group.edges);
        for (const verts of stitched) {
            if (verts.length < 6) continue;
            polygons.push({
                vertices:    verts,
                fillColor,
                opacity:     1,
                fillPattern: 'solid',
                strokeColor: fillColor,
                elementId:   group.elementId,
            });
        }
    }

    return polygons;
}

// ─── Stage 4 — EdgeExtractor ──────────────────────────────────────────────────

function stage4_edgeExtractor(classified: ClassifiedEdges): RawEdge[] {
    return [...classified.cut, ...classified.projection, ...classified.beyond];
}

// ─── Stage 5 — HLR Pass ──────────────────────────────────────────────────────

interface Occluder {
    hMin: number;
    hMax: number;
    vMin: number;
    vMax: number;
}

function buildOccluders(cutEdges: RawEdge[]): Occluder[] {
    const byElement = new Map<string, RawEdge[]>();
    for (const edge of cutEdges) {
        const id = edge.elementId || edge.layerTag;
        let list = byElement.get(id);
        if (!list) { list = []; byElement.set(id, list); }
        list.push(edge);
    }

    const occluders: Occluder[] = [];
    for (const edges of byElement.values()) {
        let hMin = Infinity, hMax = -Infinity;
        let vMin = Infinity, vMax = -Infinity;
        for (const e of edges) {
            hMin = Math.min(hMin, e.h0, e.h1);
            hMax = Math.max(hMax, e.h0, e.h1);
            vMin = Math.min(vMin, e.v0, e.v1);
            vMax = Math.max(vMax, e.v0, e.v1);
        }
        if (hMin < hMax && vMin < vMax) {
            occluders.push({ hMin, hMax, vMin, vMax });
        }
    }
    return occluders;
}

function isPointInsideOccluder(h: number, v: number, o: Occluder): boolean {
    return h >= o.hMin && h <= o.hMax && v >= o.vMin && v <= o.vMax;
}

function isSegmentOccludedHlr(h0: number, v0: number, h1: number, v1: number, occluders: Occluder[]): boolean {
    for (const o of occluders) {
        if (isPointInsideOccluder(h0, v0, o) && isPointInsideOccluder(h1, v1, o)) {
            return true;
        }
    }
    return false;
}

function stage5_hlr(edges: RawEdge[], cutEdges: RawEdge[]): RawEdge[] {
    if (cutEdges.length === 0) return edges;

    const occluders = buildOccluders(cutEdges);
    if (occluders.length === 0) return edges;

    return edges.filter(edge => {
        if (edge.zone === 'CUT') return true;
        return !isSegmentOccludedHlr(edge.h0, edge.v0, edge.h1, edge.v1, occluders);
    });
}

// ─── Stage 6 — StyleResolver ─────────────────────────────────────────────────

function stage6_styleResolver(
    edges:     RawEdge[],
    viewId:    string,
    rules:     SerializedRule[],
): StyledEdge[] {
    return edges.map(edge => {
        const p = workerResolveStyle(edge.zone, edge.category, edge.elementId, viewId, rules);
        return {
            h0:        edge.h0,
            v0:        edge.v0,
            h1:        edge.h1,
            v1:        edge.v1,
            color:     p.color,
            widthMm:   p.widthMm,
            opacity:   p.opacity,
            dashPx:    p.dashPx ?? null,
            zone:      edge.zone as 'CUT' | 'PROJECTION' | 'BEYOND',
            elementId: edge.elementId,
            layerTag:  edge.layerTag,
        };
    });
}

// ─── Pipeline entry point ─────────────────────────────────────────────────────

function runPipeline(req: PipelineRequest): PipelineResult {
    const t0 = performance.now();

    const tGeo = performance.now();
    const rawEdges = stage1_geometryProvider(req.batches);
    const tGeoEnd = performance.now();

    const tClassify = performance.now();
    const classified = stage2_classify(rawEdges);
    const tClassifyEnd = performance.now();

    const tIntersect = performance.now();
    const polygons = stage3_cutIntersector(classified, req.pocheFills);
    const tIntersectEnd = performance.now();

    const tExtract = performance.now();
    const extracted = stage4_edgeExtractor(classified);
    const tExtractEnd = performance.now();

    const tHlr = performance.now();
    const visible = stage5_hlr(extracted, classified.cut);
    const tHlrEnd = performance.now();

    const tStyle = performance.now();
    const styledEdges = stage6_styleResolver(visible, req.viewId, req.rules);
    const tStyleEnd = performance.now();

    const totalMs = performance.now() - t0;

    return {
        type:       'result',
        requestId:  req.requestId,
        edges:      styledEdges,
        polygons,
        durationMs: totalMs,
        stageTimes: {
            geometry:  tGeoEnd      - tGeo,
            classify:  tClassifyEnd - tClassify,
            intersect: tIntersectEnd - tIntersect,
            extract:   tExtractEnd  - tExtract,
            hlr:       tHlrEnd      - tHlr,
            style:     tStyleEnd    - tStyle,
        },
    };
}

// ─── Worker message handler ───────────────────────────────────────────────────

self.onmessage = (event: MessageEvent<PipelineRequest>) => {
    const req = event.data;

    if (req.type !== 'run') {
        console.warn('[DrawingPipelineWorker] Unknown message type:', (req as any).type);
        return;
    }

    try {
        const result = runPipeline(req);
        self.postMessage(result);
    } catch (err: unknown) {
        const msg    = err instanceof Error ? err.message : String(err);
        const stack  = err instanceof Error ? err.stack   : undefined;
        const error: PipelineError = {
            type:      'error',
            requestId: req.requestId,
            message:   msg,
            stack,
        };
        self.postMessage(error);
    }
};
