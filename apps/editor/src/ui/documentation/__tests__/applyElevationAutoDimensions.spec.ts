// §FEAT-AUTO-DIMENSION-ELEVATION-VIEWS (L-263) — the ELEVATION executor's pure seams.
//
// The two things that can silently produce a WRONG drawing are (1) façade selection
// and datum resolution, and (2) the (H, V) ⇄ world round-trip. Both are pure and both
// are proved here, without a runtime, a browser or a ViewPlane.

import { describe, it, expect, vi } from 'vitest';

// makePointRef() mints ids via crypto.randomUUID and createId() needs no DOM, but
// the module graph pulls THREE through the renderer-three re-export — which is the
// P2-sanctioned path and loads fine under happy-dom/node.
import {
  buildElevationSnapshot,
  elevationSegmentToAnnotation,
} from '../applyElevationAutoDimensions';
import { resolveAutoDimensionStrategy } from '../autoDimensionActiveView';
import { planElevationAutoDimensions } from '@pryzm/auto-dimension';

// A front elevation viewed along +Z: `normal` points AWAY from the viewer, so the
// camera sits at −Z and the NEAREST façade is the one with the SMALLEST z. H = world
// X; right = cross(worldUp, normal) = (1, 0, 0) ⇒ hSign = +1.
const FRONT = {
  hWorldAxis: 'x' as const,
  hSign: 1 as const,
  right:  { x: 1, z: 0 },
  normal: { x: 0, z: 1 },
};

const LEVELS = [
  { id: 'L0', name: 'Ground',  elevation: 0 },
  { id: 'L1', name: 'Level 1', elevation: 3 },
];

/**
 * Two walls on the SAME façade (z = 0), one on each level, plus a REAR wall at
 * z = 8 that must not be dimensioned, plus a SIDE wall running in Z that is edge-on.
 */
function walls() {
  return [
    {
      id: 'w_front_L0', levelId: 'L0', height: 3, thickness: 0.2,
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }] as const,
      openings: [
        { elementId: 'win_1', type: 'window' as const, offset: 2, width: 1.5, height: 1.5, sillHeight: 0.9 },
        { elementId: 'win_2', type: 'window' as const, offset: 6, width: 1.5, height: 1.5, sillHeight: 0.9 },
      ],
    },
    {
      id: 'w_front_L1', levelId: 'L1', height: 3, thickness: 0.2,
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }] as const,
      openings: [],
    },
    // REAR façade — same orientation, 8 m further from the viewer. Must be excluded.
    {
      id: 'w_rear_L0', levelId: 'L0', height: 3, thickness: 0.2,
      baseLine: [{ x: 0, y: 0, z: 8 }, { x: 10, y: 0, z: 8 }] as const,
      openings: [{ elementId: 'win_rear', type: 'window' as const, offset: 4, width: 1, height: 1, sillHeight: 2.0 }],
    },
    // SIDE wall — runs in Z, edge-on to this view. Must be excluded.
    {
      id: 'w_side', levelId: 'L0', height: 3, thickness: 0.2,
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 8 }] as const,
      openings: [],
    },
  ];
}

describe('buildElevationSnapshot — façade selection (the documented heuristic)', () => {
  it('keeps only the walls that face the viewer and run across the view', () => {
    const built = buildElevationSnapshot(walls(), LEVELS, FRONT)!;
    expect(built).not.toBeNull();
    expect([...built.facadeWallIds].sort()).toEqual(['w_front_L0', 'w_front_L1']);
    // The rear window must never appear on the front elevation.
    expect(built.snapshot.openings.map((o) => o.id)).toEqual(['win_1', 'win_2']);
  });

  it('measures the façade extent and the datums from the REAL records (L-127)', () => {
    const { snapshot } = buildElevationSnapshot(walls(), LEVELS, FRONT)!;
    expect(snapshot.hMin).toBe(0);
    expect(snapshot.hMax).toBe(10);
    expect(snapshot.baseElevation).toBe(0);
    // Topmost wall: L1 datum (3) + its real height (3) = 6. Not a literal.
    expect(snapshot.topElevation).toBe(6);
  });

  it('says the top datum is the TOP OF WALL — never silently claims a ridge', () => {
    const { snapshot } = buildElevationSnapshot(walls(), LEVELS, FRONT)!;
    expect(snapshot.topDatumKind).toBe('wall-top');
  });

  it('resolves opening sill/head to ABSOLUTE world-Y via the host level datum', () => {
    const { snapshot } = buildElevationSnapshot(walls(), LEVELS, FRONT)!;
    const w = snapshot.openings.find((o) => o.id === 'win_1')!;
    expect(w.levelId).toBe('L0');
    expect(w.sill).toBe(0.9);          // L0 datum (0) + sillHeight (0.9)
    expect(w.head).toBe(2.4);          // sill + real opening height (1.5)
    expect(w.hMin).toBe(2);            // offset is the LEFT EDGE (§OPENING-OFFSET-LEFTEDGE-UNIFY)
    expect(w.hMax).toBe(3.5);          // offset + width
  });

  it('returns null — rather than a wrong drawing — when no wall faces the view', () => {
    const sideOnly = [walls()[3]];
    expect(buildElevationSnapshot(sideOnly, LEVELS, FRONT)).toBeNull();
  });

  it('handles a LEFT/RIGHT elevation (H = world Z) with a mirrored horizontal sign', () => {
    // Looking along +X: H = world Z, right = (0,0,-1) ⇒ hSign = −1.
    const side = { hWorldAxis: 'z' as const, hSign: -1 as const, right: { x: 0, z: -1 }, normal: { x: 1, z: 0 } };
    const built = buildElevationSnapshot(walls(), LEVELS, side)!;
    expect(built.facadeWallIds).toEqual(['w_side']);
    // The side wall spans world z 0…8 ⇒ H = −z ⇒ −8…0. (toBeCloseTo: −0 is not +0.)
    expect(built.snapshot.hMin).toBeCloseTo(-8, 9);
    expect(built.snapshot.hMax).toBeCloseTo(0, 9);
  });
});

describe('elevationSegmentToAnnotation — the (H, V) ⇄ world round-trip', () => {
  it('inverts the renderer projection exactly: H = hSign · world[hAxis], V = world Y', () => {
    const built = buildElevationSnapshot(walls(), LEVELS, FRONT)!;
    const { segments } = planElevationAutoDimensions(built.snapshot, { viewId: 'vd_elev' });
    const overall = segments.find((s) => s.rule === 'overall-height')!;

    const ann = elevationSegmentToAnnotation(overall, FRONT, built.facadeDepth, 'vd_elev');
    const [p, q] = ann.geometry2D.modelPoints;

    // The renderer's _ptH/_ptV must reproduce the segment's (h, v1)/(h, v2).
    const ptH = (pt: { x: number; z: number }) => FRONT.hSign * (FRONT.hWorldAxis === 'x' ? pt.x : pt.z);
    expect(ptH(p!)).toBeCloseTo(overall.h, 9);
    expect(ptH(q!)).toBeCloseTo(overall.h, 9);
    expect(p!.y).toBeCloseTo(overall.v1, 9);   // V is world Y — the whole point of the view type
    expect(q!.y).toBeCloseTo(overall.v2, 9);
    // Both points sit on the façade plane (the depth coordinate is pinned).
    expect(p!.z).toBeCloseTo(built.facadeDepth, 9);
    expect(q!.z).toBeCloseTo(built.facadeDepth, 9);
  });

  it('stamps WORLD UP as the measurement normal so the dim renders as a clean VERTICAL', () => {
    const built = buildElevationSnapshot(walls(), LEVELS, FRONT)!;
    const { segments } = planElevationAutoDimensions(built.snapshot, { viewId: 'vd_elev' });
    const ann = elevationSegmentToAnnotation(segments[0]!, FRONT, built.facadeDepth, 'vd_elev');
    expect(ann.geometry2D.measurementNormal).toEqual({ x: 0, y: 1, z: 0 });
    expect(ann.type).toBe('linear-dim');           // the type the plan renderer actually draws
    expect(ann.ownerViewId).toBe('vd_elev');       // owned by the elevation, or it renders nowhere
  });

  it('carries the signed world-metre offset the renderer already consumes', () => {
    const built = buildElevationSnapshot(walls(), LEVELS, FRONT)!;
    const { segments } = planElevationAutoDimensions(built.snapshot, { viewId: 'vd_elev' });
    for (const s of segments) {
      const ann = elevationSegmentToAnnotation(s, FRONT, built.facadeDepth, 'vd_elev');
      expect(ann.geometry2D.offset).toBeCloseTo(s.offsetH, 9);
    }
  });

  it('end-to-end: a 2-storey façade yields overall height + floor-to-floor + typical sill/head', () => {
    const built = buildElevationSnapshot(walls(), LEVELS, FRONT)!;
    const { segments } = planElevationAutoDimensions(built.snapshot, { viewId: 'vd_elev', detailLevel: 'fine' });
    const byRule = (r: string) => segments.filter((s) => s.rule === r);

    expect(byRule('overall-height')).toHaveLength(1);
    expect(byRule('overall-height')[0]!.valueM).toBe(6);           // 0 → top of wall at 6

    // 2 levels ⇒ L0→L1 (3 m) + L1→top (3 m).
    expect(byRule('floor-to-floor').map((s) => s.valueM)).toEqual([3, 3]);

    // The two identical windows are ONE typical group — that is what a drawing shows.
    expect(byRule('opening-sill')).toHaveLength(1);
    expect(byRule('opening-sill')[0]!.referenceIds).toEqual(['win_1', 'win_2']);
    expect(byRule('opening-sill')[0]!.valueM).toBeCloseTo(0.9, 9);  // sill height
    expect(byRule('opening-head')[0]!.valueM).toBeCloseTo(1.5, 9);  // opening height
  });
});

describe('resolveAutoDimensionStrategy — ONE action, routed by the active view', () => {
  it('routes plan-family views to the horizontal strategy', () => {
    expect(resolveAutoDimensionStrategy('plan')).toBe('plan');
    expect(resolveAutoDimensionStrategy('ceiling-plan')).toBe('plan');
    expect(resolveAutoDimensionStrategy('structural-plan')).toBe('plan');
  });

  it('routes elevation views to the vertical strategy', () => {
    expect(resolveAutoDimensionStrategy('elevation')).toBe('elevation');
    expect(resolveAutoDimensionStrategy('building-elevation')).toBe('elevation');
  });

  it('does NOT pretend to support sections — the section rule set is genuinely different', () => {
    expect(resolveAutoDimensionStrategy('section')).toBe('unsupported');
    expect(resolveAutoDimensionStrategy('3d')).toBe('unsupported');
    expect(resolveAutoDimensionStrategy(undefined)).toBe('unsupported');
  });
});

// Keep vi imported-and-used so the lint rule about unused imports stays honest.
void vi;
