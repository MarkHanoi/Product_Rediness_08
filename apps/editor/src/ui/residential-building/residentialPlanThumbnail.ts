// Residential building (multi-family) — the modal LIVE PREVIEW plan thumbnail.
//
// §BUILDING-PREVIEW-MODULAR (founder 2026-06-26) — this file is now a thin ADAPTER: it
// turns the orchestrator's OK result into the SHARED, building-type-agnostic
// `BuildingPlanDescriptor` and delegates ALL rendering to `buildBuildingPlanSvg`
// (apps/editor/src/ui/preview-kit/). House, residential building, and every future typology
// share that one renderer + aesthetic — a new typology only writes an adapter like this one.
//
// §BUILDING-PREVIEW-MODULAR L-SHAPE FIX — the preview boundary is now the REAL drawn
// footprint POLYGON (the L / clip polygon), de-rotated from the WORLD parcel into the LOCAL
// plan frame the cells live in, NOT the bounding-box rectangle the old renderer drew.
//
// §RESI-PREVIEW-CORRIDOR-CONTINUOUS — the corridor bands are passed as abutting fill-only
// rects the shared renderer merges into one continuous band (preserved).
//
// PURE: no DOM, no THREE — returns an SVG STRING. Type-only ai-host import (erased).

import type { ResidentialBuildingOk, PlacedApartment, ResidentialRigidTransform } from '@pryzm/ai-host';
import { buildBuildingPlanSvg } from '../preview-kit/buildingPlanSvg.js';
import type {
    BuildingPlanDescriptor, PlanCell, PlanCorridor, PlanLegendEntry, PlanPt, PlanRect,
} from '../preview-kit/buildingPlanDescriptor.js';

interface Rectish { x0: number; z0: number; x1: number; z1: number }
type Edge = 'x0' | 'x1' | 'z0' | 'z1';

// Typology fills graduate light→saturated by bedroom count, all in the purple family.
const TYPO_FILL: Record<string, string> = {
    T1: '#efeaff', T2: '#dcd0ff', T3: '#c3adff', T4: '#a883ff',
};
const TYPO_LABEL: Record<string, string> = {
    T1: 'Studio / 1-bed', T2: '2-bed', T3: '3-bed', T4: '4-bed',
};
const PARTITION_STROKE = '#9b8cc4';
const CORE_FILL = '#6600ff';
const CORE_STROKE = '#4a00bf';
const CORRIDOR_FILL = '#f2eeff';
const CORRIDOR_STROKE = '#cfc2f2';

/** Inverse rigid transform: WORLD parcel XZ → LOCAL (principal-axis) by −θ about the pivot,
 *  so the world footprint polygon lands in the SAME LOCAL frame the cells/core/corridor use. */
function unrotate(p: { x: number; z: number }, xf: ResidentialRigidTransform): PlanPt {
    if (!xf.thetaRad) return { x: p.x, z: p.z };
    const c = Math.cos(-xf.thetaRad), s = Math.sin(-xf.thetaRad);
    const dx = p.x - xf.pivot.x, dz = p.z - xf.pivot.z;
    return { x: xf.pivot.x + dx * c - dz * s, z: xf.pivot.z + dx * s + dz * c };
}

/** Drop near-duplicate consecutive vertices (a clean ring for the preview). */
function cleanRing(poly: readonly PlanPt[]): PlanPt[] {
    const out: PlanPt[] = [];
    for (const p of poly) {
        const prev = out[out.length - 1];
        if (prev && Math.hypot(p.x - prev.x, p.z - prev.z) < 0.02) continue;
        out.push({ x: p.x, z: p.z });
    }
    if (out.length >= 2) {
        const a = out[0]!, b = out[out.length - 1]!;
        if (Math.hypot(a.x - b.x, a.z - b.z) < 0.02) out.pop();
    }
    return out;
}

/** Pick a representative UPPER floor (first upper level with apartments); fall back to any
 *  level that has apartments, else the last level. */
function pickLevelIndex(result: ResidentialBuildingOk): number {
    const per = result.perLevelApartments;
    let firstWithApts = -1;
    for (let i = 0; i < per.length; i++) {
        const p = per[i];
        if (!p) continue;
        if (p.apartments.length > 0) {
            if (p.role === 'upper') return i;
            if (firstWithApts < 0) firstWithApts = i;
        }
    }
    return firstWithApts >= 0 ? firstWithApts : Math.max(0, per.length - 1);
}

/**
 * Build the residential `BuildingPlanDescriptor` for one representative floor. Exported so
 * the descriptor (and the L-shape footprint) is unit-testable WITHOUT rendering. PURE.
 */
export function buildResidentialPlanDescriptor(result: ResidentialBuildingOk): BuildingPlanDescriptor | null {
    const idx = pickLevelIndex(result);
    const per = result.perLevelApartments[idx];
    const level = result.levels[idx];
    const core = result.core as Rectish;
    const corridorsIn = (per?.publicCorridor ?? []) as readonly Rectish[];
    const apts = (per?.apartments ?? []) as readonly PlacedApartment[];

    // §BUILDING-PREVIEW-MODULAR L-SHAPE FIX — the REAL footprint polygon, de-rotated WORLD→LOCAL.
    // `levels[idx].footprint` is the WORLD drawn parcel (the L); `result.transform` maps it to the
    // LOCAL frame the cells/core are in. When the footprint is absent/degenerate, fall back to the
    // drawn bbox over the cells (the legacy behaviour) so the preview still renders.
    let footprint: PlanPt[] = [];
    if (level?.footprint && level.footprint.length >= 3) {
        footprint = cleanRing(level.footprint.map(p => unrotate({ x: p.x, z: p.z }, result.transform)));
    }
    if (footprint.length < 3) {
        // Fallback bbox over core + corridors + cells (LOCAL).
        let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
        const acc = (r: Rectish): void => {
            if (r.x0 < x0) x0 = r.x0; if (r.z0 < z0) z0 = r.z0;
            if (r.x1 > x1) x1 = r.x1; if (r.z1 > z1) z1 = r.z1;
        };
        acc(core); for (const c of corridorsIn) acc(c); for (const c of apts) acc(c.cell.rect as Rectish);
        if (!Number.isFinite(x0) || x1 - x0 < 1e-3 || z1 - z0 < 1e-3) return null;
        footprint = [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];
    }

    const cells: PlanCell[] = apts.map((c) => {
        const r = c.cell.rect as PlanRect;
        const ok = c.status === 'ok';
        return ok
            ? {
                rect: r, fillKey: c.typology, label: c.typology,
                subLabel: `${Math.round(c.targetAreaM2)} m²`,
                doorEdge: c.cell.doorEdge as Edge,
            }
            : { rect: r, fillKey: c.typology, muted: true, label: c.typology, mutedNote: 'no fit' };
    });

    // §RESI-PREVIEW-CORRIDOR-CONTINUOUS — pass the bands as fill-only rects; the shared renderer
    // draws them under the cells with one fill so they read as one continuous circulation band.
    const corridors: PlanCorridor[] = corridorsIn.map(r => ({ rect: r as PlanRect }));

    // Legend: typologies actually present (placed) + core + corridor.
    const present = new Set<string>();
    for (const c of apts) if (c.status === 'ok') present.add(c.typology);
    const legend: PlanLegendEntry[] = [];
    for (const t of ['T1', 'T2', 'T3', 'T4']) {
        if (present.has(t)) legend.push({ fill: TYPO_FILL[t]!, stroke: PARTITION_STROKE, label: `${t} · ${TYPO_LABEL[t]!}` });
    }
    legend.push({ fill: CORE_FILL, stroke: CORE_STROKE, label: 'Core' });
    legend.push({ fill: CORRIDOR_FILL, stroke: CORRIDOR_STROKE, label: 'Corridor' });

    return {
        footprint,
        cells,
        corridors,
        core: { rect: core as PlanRect, label: 'CORE' },
        palette: { fills: TYPO_FILL, defaultFill: TYPO_FILL.T2! },
        legend,
        levelLabel: idx <= 0 ? 'Ground floor' : `Floor ${idx}`,
        northArrow: true,
        scaleBar: true,
    };
}

/**
 * Build a top-down floor-plan SVG (string) for one representative floor of the residential
 * building. Thin wrapper over the shared `buildBuildingPlanSvg` — see the module header.
 * Returns '' (with placed/rejected 0) when there is no geometry to draw.
 */
export function buildResidentialPlanSvg(
    result: ResidentialBuildingOk,
    opts: { targetPx?: number } = {},
): { svg: string; levelLabel: string; placed: number; rejected: number } {
    const descriptor = buildResidentialPlanDescriptor(result);
    if (!descriptor) return { svg: '', levelLabel: '', placed: 0, rejected: 0 };
    const out = buildBuildingPlanSvg(descriptor, opts);
    return { svg: out.svg, levelLabel: out.levelLabel, placed: out.placed, rejected: out.muted };
}
