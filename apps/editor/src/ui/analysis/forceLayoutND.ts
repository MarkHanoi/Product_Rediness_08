/**
 * forceLayoutND — ONE Barnes-Hut force layout, in TWO or THREE dimensions.
 *
 * Layer Affected:  UI — Analysis surface (L7)
 * File:            apps/editor/src/ui/analysis/forceLayoutND.ts
 * ADR:             ADR-0343 §D.3 (no widget refreshes on-frame) · ADR-0364 §3.5
 * Contracts:       C66 §1.1 (nothing is "supported" at a size it was not benched at)
 * Issue log:       L-8430 · L-8431 · continues §PERF-GRAPH-BARNES-HUT (L-6620)
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⭐ WHY THIS FILE EXISTS: THE FOUNDER ASKED FOR A 3-D GRAPH, AND A 3-D FORCE
 *    LAYOUT NEEDS AN OCTREE WHERE THE 2-D ONE USES A QUADTREE
 * ═════════════════════════════════════════════════════════════════════════════
 * The obvious implementation is a second tree beside the first. That is exactly
 * the duplication this lane exists to avoid — this repository has already paid
 * for five minima tables, three commandManager counters and two IFC class maps,
 * and "a second layout" is on the short list of things the brief forbids.
 *
 * So the tree is DIMENSION-GENERIC: `2^D` children, the quadrant computed over
 * `D` axes, and `forceLayout` (2-D, the SVG card) and `forceLayout3D` (the new
 * WebGL viewport) are two thin callers of one implementation.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⛔ THE 2-D OUTPUT MUST NOT MOVE, AND THAT IS MEASURED, NOT ASSERTED
 * ═════════════════════════════════════════════════════════════════════════════
 * `nodeLinkSvg.ts` promises that every graph which drew before
 * §PERF-GRAPH-BARNES-HUT draws byte-identically, and `graphLayoutScale.spec.ts`
 * asserts determinism. A generalisation that quietly shifted every existing
 * diagram by a pixel would break a promise nobody would notice until two runs
 * stopped being comparable.
 *
 * ⭐ THE ARITHMETIC IS THEREFORE PRESERVED EXACTLY, NOT MERELY EQUIVALENTLY:
 *
 *   · the squared distance accumulates in AXIS ORDER (`s += d[0]*d[0]` then
 *     `s += d[1]*d[1]`), which for D=2 is bit-for-bit the old `dx*dx + dy*dy`;
 *   · the opening criterion divides by `size[0]` — the old code's `c.w` — not by
 *     a max-extent or a diagonal, because either would change the tree's
 *     behaviour on a non-square viewport;
 *   · the centre-of-mass update, the cooling schedule, the step clamp, the 0.7
 *     damping, the 44 px padding and the depth-24 coincident-point floor are the
 *     same expressions in the same order;
 *   · the repulsion constant BRANCHES on dimension rather than using a general
 *     `pow` — `Math.pow(x, 1)` is an approximated operation and using it for the
 *     2-D case would risk a last-bit difference for no benefit.
 *
 * `graphLayout3d.spec.ts` beside this file captures a fixed graph's 2-D layout
 * and asserts EXACT equality against the values the old implementation produced.
 *
 * ⛔ NO ANIMATION, NO rAF (P3). This is a one-shot solve; the caller decides when
 * to run it and the frame scheduler coalesces the redraw.
 * ⛔ NO `Math.random` ANYWHERE (determinism). The same model lays out the same
 * way on every open, which is what makes two runs comparable.
 *
 * L7 file. No THREE (P2), no rAF (P3), no `(window as any)` (P4), no store
 * writes (P6).
 */

/**
 * Barnes-Hut opening angle. Smaller = more exact and slower; 0 degenerates to the
 * exact O(n²) pass. 0.9 is the value the original Barnes & Hut (1986) paper uses
 * for the regime where accuracy is not the objective, and a graph layout is
 * emphatically that regime. ⛔ UNCHANGED from the 2-D implementation this
 * generalises — moving it would move every existing diagram.
 */
export const THETA = 0.9;

/**
 * Below this node count the EXACT O(n²) pass runs. Set to the ORIGINAL 60-node
 * cap on purpose: every graph that could be drawn before §PERF-GRAPH-BARNES-HUT
 * still takes the identical code path and produces the identical picture.
 */
export const EXACT_BELOW = 60;

/** Viewport inset, in the same units as `extent`. ⛔ Unchanged from the 2-D pass. */
const PADDING = 44;

/** One body. `p` and `v` are `dims`-length; allocated once and mutated in place. */
interface Body {
  readonly id: string;
  readonly p: number[];
  readonly v: number[];
}

/**
 * One tree cell. `body` is set only on a leaf holding exactly one body.
 * `children` has `2^dims` entries when subdivided.
 */
interface Cell {
  /** Lower corner, per axis. */
  readonly o: number[];
  /** Size, per axis. */
  readonly s: number[];
  /** Running centre of mass, per axis. */
  readonly c: number[];
  count: number;
  body: Body | null;
  children: Cell[] | null;
}

function newCell(o: number[], s: number[]): Cell {
  return { o, s, c: new Array(o.length).fill(0), count: 0, body: null, children: null };
}

/**
 * Split a cell into `2^dims` children.
 *
 * ⚠ CHILD ORDER IS PART OF THE CONTRACT. The index of a child is the bitmask of
 * "is this body past the midpoint on axis k", with axis 0 in bit 0. For D=2 that
 * yields the original `below*2 + right` ordering exactly, so traversal order —
 * and therefore floating-point accumulation order in `applyRepulsion` — is
 * unchanged. Reordering these would silently perturb every existing diagram.
 */
function subdivide(cell: Cell): void {
  const dims = cell.o.length;
  const half = cell.s.map((v) => v / 2);
  const kids: Cell[] = [];
  for (let mask = 0; mask < 1 << dims; mask++) {
    const origin = new Array<number>(dims);
    for (let k = 0; k < dims; k++) {
      origin[k] = cell.o[k]! + ((mask >> k) & 1 ? half[k]! : 0);
    }
    kids.push(newCell(origin, half));
  }
  cell.children = kids;
}

/** Which child of `cell` holds `b`. Deterministic, boundary-inclusive to the low side. */
function childIndex(cell: Cell, b: Body): number {
  let idx = 0;
  for (let k = 0; k < cell.o.length; k++) {
    if (b.p[k]! >= cell.o[k]! + cell.s[k]! / 2) idx |= 1 << k;
  }
  return idx;
}

/**
 * Insert one body. The running centre of mass is updated on the way DOWN, so no
 * second pass is needed.
 *
 * ⚠ `depth` is a hard stop and it is LOAD-BEARING rather than defensive: two
 * bodies at exactly the same coordinates can never be separated by subdivision,
 * so an unguarded insert recurses until the stack dies. Coincident bodies are
 * real here — the deterministic seeding places every node on one circle or one
 * sphere, and a graph with duplicate ids or a degenerate viewport can collapse
 * points. At the floor the cell simply holds several bodies in its aggregate,
 * which costs a little accuracy in a place where accuracy was already meaningless.
 */
function insert(cell: Cell, b: Body, depth = 0): void {
  const dims = cell.o.length;
  for (let k = 0; k < dims; k++) {
    cell.c[k] = (cell.c[k]! * cell.count + b.p[k]!) / (cell.count + 1);
  }
  cell.count += 1;

  if (cell.count === 1) { cell.body = b; return; }
  if (depth >= 24) return; // coincident-point floor — see the doc above

  if (cell.children === null) {
    subdivide(cell);
    const existing = cell.body;
    cell.body = null;
    if (existing) insert(cell.children![childIndex(cell, existing)]!, existing, depth + 1);
  }
  insert(cell.children![childIndex(cell, b)]!, b, depth + 1);
}

/**
 * Accumulate the repulsion `target` feels from everything in `cell`.
 *
 * ⛔ Reads `target.p` and writes only `target.v`, so a whole traversal is safe
 * while other bodies' positions are being read — which is why the caller can
 * build ONE tree per iteration and walk it once per body.
 */
function applyRepulsion(cell: Cell, target: Body, repulsion: number, dims: number): void {
  if (cell.count === 0) return;
  if (cell.body === target && cell.count === 1) return; // never repel from itself

  // ⚠ Axis-ordered accumulation. For D=2 this is bit-for-bit `dx*dx + dy*dy`.
  const d = new Array<number>(dims);
  let sq = 0;
  for (let k = 0; k < dims; k++) {
    d[k] = target.p[k]! - cell.c[k]!;
    sq += d[k]! * d[k]!;
  }
  const dist = Math.max(Math.sqrt(sq), 1);

  // The opening criterion. ⚠ `s[0]` — the old code's `c.w` — deliberately, not a
  // max extent: on a non-square viewport those differ, and the old behaviour is
  // the one every existing diagram was laid out under.
  if (cell.children === null || cell.s[0]! / dist < THETA) {
    // ⚠ `count` is the mass. A cell standing in for k bodies must push k times as
    // hard, or the approximation would systematically UNDER-repel dense regions
    // and the layout would clump exactly where it most needs to spread.
    const force = (repulsion * cell.count) / (dist * dist);
    for (let k = 0; k < dims; k++) target.v[k] = target.v[k]! + (d[k]! / dist) * force;
    return;
  }
  for (const child of cell.children) applyRepulsion(child, target, repulsion, dims);
}

/**
 * Seed positions deterministically.
 *
 * ⛔ 2-D IS THE ORIGINAL CIRCLE, EXPRESSION FOR EXPRESSION. 3-D is a Fibonacci
 * sphere — a closed form, no rejection sampling, no `Math.random`, so the same
 * graph seeds identically on every open, which is the property that makes two
 * runs of the 3-D view comparable at all.
 */
function seed(ids: readonly string[], extent: readonly number[]): Map<string, Body> {
  const dims = extent.length;
  const out = new Map<string, Body>();
  const n = ids.length;

  if (dims === 2) {
    const [W, H] = extent as [number, number];
    ids.forEach((id, i) => {
      const angle = (2 * Math.PI * i) / n;
      out.set(id, {
        id,
        p: [
          W / 2 + (W / 2 - PADDING) * 0.7 * Math.cos(angle),
          H / 2 + (H / 2 - PADDING) * 0.7 * Math.sin(angle),
        ],
        v: [0, 0],
      });
    });
    return out;
  }

  // Fibonacci sphere. The golden angle is a constant, not a tuned parameter.
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));
  ids.forEach((id, i) => {
    const y = n === 1 ? 0 : 1 - ((2 * i + 1) / n);
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = GOLDEN * i;
    const unit = [r * Math.cos(theta), y, r * Math.sin(theta)];
    const p = new Array<number>(dims);
    for (let k = 0; k < dims; k++) {
      p[k] = extent[k]! / 2 + (extent[k]! / 2 - PADDING) * 0.7 * unit[k]!;
    }
    out.set(id, { id, p, v: new Array<number>(dims).fill(0) });
  });
  return out;
}

/**
 * The repulsion constant.
 *
 * ⛔ BRANCHED ON DIMENSION RATHER THAN GENERALISED. A single
 * `Math.pow(volume, 2 / dims)` would collapse to `Math.pow(area, 1)` in 2-D, and
 * `Math.pow` is an implementation-approximated operation — using it where the old
 * code wrote a plain multiplication would risk a last-bit difference in every
 * existing diagram for no benefit whatsoever.
 */
function repulsionFor(extent: readonly number[], n: number): number {
  if (extent.length === 2) return (extent[0]! * extent[1]!) / Math.max(n, 1);
  const volume = extent.reduce((a, b) => a * b, 1);
  // Area-equivalent of the volume, so the constant keeps the same units as 2-D.
  return Math.cbrt(volume * volume) / Math.max(n, 1);
}

/**
 * Deterministic force-directed layout in `extent.length` dimensions.
 *
 * ⚠ COST. Below `EXACT_BELOW` the repulsion pass is the exact O(n²) one, above it
 * the Barnes-Hut tree at O(n log n). Per C66 §1.1 nothing here is a supported
 * capacity claim: `graphLayoutScale.spec.ts` asserts the COMPLEXITY SHAPE — which
 * is machine-stable — never a millisecond budget, which is not.
 */
export function layoutND(
  nodeIds: readonly string[],
  edgePairs: ReadonlyArray<readonly [string, string]>,
  extent: readonly number[],
  iterations = 160,
): Map<string, number[]> {
  const out = new Map<string, number[]>();
  if (nodeIds.length === 0) return out;

  const dims = extent.length;
  const positions = seed(nodeIds, extent);
  const repulsion = repulsionFor(extent, nodeIds.length);
  const attraction = 0.05;

  for (let iter = 0; iter < iterations; iter++) {
    const cooling = 1 - iter / iterations;

    if (nodeIds.length < EXACT_BELOW) {
      // ── EXACT. Every graph that could be drawn before §PERF-GRAPH-BARNES-HUT
      //    takes this path and produces the identical picture.
      for (let i = 0; i < nodeIds.length; i++) {
        const u = positions.get(nodeIds[i]!)!;
        for (let j = i + 1; j < nodeIds.length; j++) {
          const v = positions.get(nodeIds[j]!)!;
          let sq = 0;
          const d = new Array<number>(dims);
          for (let k = 0; k < dims; k++) {
            d[k] = u.p[k]! - v.p[k]!;
            sq += d[k]! * d[k]!;
          }
          const dist = Math.max(Math.sqrt(sq), 1);
          const force = repulsion / (dist * dist);
          for (let k = 0; k < dims; k++) {
            const step = (d[k]! / dist) * force;
            u.v[k] = u.v[k]! + step;
            v.v[k] = v.v[k]! - step;
          }
        }
      }
    } else {
      // ── BARNES-HUT. One tree per iteration, walked once per body. The tree is
      //    built over the CURRENT positions and no position moves during the walk
      //    (only velocities accumulate), so every body sees the same
      //    configuration — exactly as in the exact pass above.
      //
      //    ⚠ The root spans the PADDED VIEWPORT, not the bodies' bounding box:
      //    positions are clamped into that box at the end of every iteration, so
      //    the box is invariant and the tree's geometry cannot drift between
      //    iterations. A bounding-box root would rescale each pass and make the
      //    layout depend on its own history.
      const root = newCell(new Array<number>(dims).fill(0), [...extent]);
      for (const id of nodeIds) insert(root, positions.get(id)!);
      for (const id of nodeIds) applyRepulsion(root, positions.get(id)!, repulsion, dims);
    }

    for (const [a, b] of edgePairs) {
      const u = positions.get(a);
      const v = positions.get(b);
      if (!u || !v) continue;
      let sq = 0;
      const d = new Array<number>(dims);
      for (let k = 0; k < dims; k++) {
        d[k] = v.p[k]! - u.p[k]!;
        sq += d[k]! * d[k]!;
      }
      const dist = Math.max(Math.sqrt(sq), 1);
      const force = dist * attraction;
      for (let k = 0; k < dims; k++) {
        const step = (d[k]! / dist) * force;
        u.v[k] = u.v[k]! + step;
        v.v[k] = v.v[k]! - step;
      }
    }

    for (const body of positions.values()) {
      let sq = 0;
      for (let k = 0; k < dims; k++) sq += body.v[k]! * body.v[k]!;
      const speed = Math.sqrt(sq);
      const maxStep = 15 * cooling + 2;
      if (speed > maxStep) {
        for (let k = 0; k < dims; k++) body.v[k] = (body.v[k]! / speed) * maxStep;
      }
      for (let k = 0; k < dims; k++) {
        body.p[k] = Math.max(PADDING, Math.min(extent[k]! - PADDING, body.p[k]! + body.v[k]!));
        body.v[k] = body.v[k]! * 0.7;
      }
    }
  }

  for (const [id, body] of positions) out.set(id, body.p);
  return out;
}

/**
 * The 3-D layout the WebGL viewport draws.
 *
 * Returns coordinates in the SAME box convention as the 2-D pass — `0..extent[k]`
 * with a 44-unit inset — so a caller that already knows how to normalise the 2-D
 * output needs no second convention. `depth` defaults to the smaller of width and
 * height, which keeps the cloud roughly isotropic rather than a slab.
 */
export function forceLayout3D(
  nodeIds: readonly string[],
  edgePairs: ReadonlyArray<readonly [string, string]>,
  W: number,
  H: number,
  D: number = Math.min(W, H),
  iterations = 160,
): Map<string, readonly [number, number, number]> {
  const raw = layoutND(nodeIds, edgePairs, [W, H, D], iterations);
  const out = new Map<string, readonly [number, number, number]>();
  for (const [id, p] of raw) out.set(id, [p[0]!, p[1]!, p[2]!] as const);
  return out;
}
