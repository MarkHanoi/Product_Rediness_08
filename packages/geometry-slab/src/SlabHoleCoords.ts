// SlabHoleCoords — the L1 ⇄ LEGACY coordinate contract for a slab hole.
//
// ADDITIVE. Added by §FEAT-SWIMMING-POOL-ELEMENT (L-292); see ADR-0124 §5.
// Nothing in geometry-slab changes behaviour — this file only NAMES a conversion
// that was previously missing, and whose absence is a live bug.
//
// ═══════════════════════════════════════════════════════════════════════════════
// THE DEFECT THIS FILE EXISTS TO MAKE UNMISSABLE: THERE ARE **TWO** `holes` FIELDS,
// THEY HAVE THE SAME NAME, THEY ARE IN DIFFERENT COORDINATE SPACES, AND ONLY ONE OF
// THEM RENDERS.
// ═══════════════════════════════════════════════════════════════════════════════
//
//   L1 / SCHEMA  `@pryzm/schemas` Slab.holes : Vec3[][]
//                → { x: worldX, y: LEVEL ELEVATION, z: worldZ }
//                → written by the bus handlers `slab.addHole` / `slab.removeHole`
//                → **RENDERS NOTHING.** Nothing bridges it to the mesh.
//
//   LEGACY       `geometry-slab` SlabData.holes : { x, y }[][]
//                → { x: worldX, y: worldZ }        ← `y` IS **worldZ**, NOT elevation
//                → read by `SlabFragmentBuilder` (source 1, `semanticHoles`) and
//                  triangulated into the real void
//                → **THIS is the one that renders.**
//
// Feed an L1 `Vec3` loop straight into the legacy field and every vertex collapses
// onto the line z = levelElevation (usually 0) — a degenerate, zero-area "hole" that
// punches nothing and silently does so. That is not a hypothetical: it is exactly
// what a naive "just compose SlabData.holes" pool would have shipped.
//
// So the conversion gets a name, one home, and a test. Any code moving a hole loop
// across the L1/legacy seam MUST route through here.

import { trace } from '@opentelemetry/api';

const _tracer = trace.getTracer('pryzm-geometry-slab');

/** An L1 / schema hole vertex: `y` is the LEVEL ELEVATION. */
export interface L1HoleVertex { readonly x: number; readonly y: number; readonly z: number }
/** A LEGACY hole vertex as `SlabFragmentBuilder` triangulates it: `y` is **worldZ**. */
export interface LegacyHoleVertex { readonly x: number; readonly y: number }

/**
 * L1 (`Vec3`, y = elevation) → LEGACY (`{x,y}`, y = worldZ).
 *
 * This is the direction that MATTERS: it is what turns a hole recorded on the
 * semantic slab into a hole the user can actually see.
 *
 * The projection is `(x, _, z) → (x, z)` — we DROP the elevation, because a slab
 * hole is a plan-space loop and the slab supplies its own elevation. Getting this
 * backwards (keeping `y`) is the collapse described in the header.
 */
export function l1HolesToLegacy(holes: readonly (readonly L1HoleVertex[])[]): LegacyHoleVertex[][] {
  return _tracer.startActiveSpan('pryzm.slab.l1HolesToLegacy', (span) => {
    try {
      const out = holes.map((loop) => loop.map((p) => ({ x: p.x, y: p.z })));
      span.setAttribute('pryzm.slab.holeCount', out.length);
      return out;
    } finally {
      span.end();
    }
  });
}

/**
 * LEGACY (`{x,y}`, y = worldZ) → L1 (`Vec3`, y = elevation).
 *
 * The inverse needs the slab's level elevation supplied, because the legacy form
 * THREW IT AWAY. That asymmetry is the whole reason the two spaces must never be
 * conflated by assignment.
 */
export function legacyHolesToL1(
  holes: readonly (readonly LegacyHoleVertex[])[],
  levelElevation: number,
): L1HoleVertex[][] {
  return _tracer.startActiveSpan('pryzm.slab.legacyHolesToL1', (span) => {
    try {
      const out = holes.map((loop) => loop.map((p) => ({ x: p.x, y: levelElevation, z: p.y })));
      span.setAttribute('pryzm.slab.holeCount', out.length);
      return out;
    } finally {
      span.end();
    }
  });
}
