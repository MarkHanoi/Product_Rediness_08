// ─── CE-02: the HEADLESS FRAGMENT BUILD — giving the Geometry axis a SUBJECT ──
//
// BIM30-IMPLEMENTATION-ROADMAP §3 link 4: "the Geometry axis is UNPROVEN
// EVERYWHERE HEADLESSLY because no fragment builders run in the harness. An axis
// with no subject cannot exit 0 or 1." This module is that subject.
//
// ── WHAT WAS ACTUALLY MEASURED, AND WHY THE P2 CONSTRAINT DOES NOT BLOCK IT ──
//
// P2 says `import * as THREE` is allowed ONLY in packages/renderer-three. The
// fragment builders DO import THREE — through `@pryzm/renderer-three/three`,
// the SANCTIONED FACADE, which is the same specifier `world.ts` already uses to
// hand BimManager a real THREE.Scene. So a headless fragment build breaches
// nothing: it imports the facade like every other consumer.
//
// The constraint that DOES bite is a different one, and it is worth stating
// precisely because the P2 rule is a red herring here: THREE's `BufferGeometry`,
// `Mesh` and `Scene` are PURE CPU OBJECTS. They allocate typed arrays and hold
// vertex data with no GPU, no WebGL context and no canvas. What needs a GPU is
// `WebGLRenderer.render()` — and this harness never calls it. So the CPU half of
// geometry (triangulation, extrusion, CSG openings, miter joins, transforms) is
// fully measurable headlessly, and the GPU half is not measurable AT ALL, here
// or anywhere in this repository's test estate. That split is the honest
// boundary and it is declared in `GEOMETRY_UNPROVEN` below.
//
// ── THE ONE REAL HEADLESS OBSTACLE, AND ITS NAMED FIX ────────────────────────
//
// Roof and slab builders do not build synchronously — they enqueue onto the P3
// frame bus (`getFrameScheduler().schedule('pre-render', ...)`) and drain on a
// tick. Headlessly the scheduler is NEVER STARTED (no rAF exists in Node), and
// `FrameScheduler.tick()` returns immediately on `if (!this.running) return`.
// So an enqueued roof build waits for a frame that can never arrive — EXACTLY
// the L-716 unsatisfiable-gate shape `world.ts` already documents for
// ProjectLoader. MEASURED: roof enqueued, `drainSync()` drained nothing
// (`getPending()` was `[]`, because `schedule()` registers a TICK LISTENER, not
// a priority-queue request), and the scene held 0 meshes indefinitely.
//
// The fix is `pumpFrames()` below: start the scheduler and drive `tick()`
// directly. This runs the REAL production drain path — the same
// `_drainBuildQueue` a browser frame would call — rather than reaching past it,
// which is why it is a legitimate subject and not a harness fork. It is
// declared here loudly so nobody has to rediscover it.

import type { World } from './world';

/** One family's build reading. `error` is never swallowed — an unbuilt family is a FINDING. */
export interface FamilyGeometry {
  family: string;
  /** elements handed to the builder */
  attempted: number;
  /** elements the builder produced at least one mesh for */
  built: number;
  meshes: number;
  vertices: number;
  triangles: number;
  /** non-empty when the builder threw — recorded verbatim, never absorbed */
  error: string;
  /** how this family reaches geometry: 'sync' or 'frame-bus' (needs pumpFrames) */
  path: 'sync' | 'frame-bus';
}

export interface HeadlessBuildResult {
  families: FamilyGeometry[];
  totals: { meshes: number; vertices: number; triangles: number };
  /** frames pumped to drain the frame-bus families */
  framesPumped: number;
}

/** Count meshes / vertices / triangles in a scene subtree. The comparator's raw oracle. */
export function countGeometry(root: unknown): { meshes: number; vertices: number; triangles: number } {
  let meshes = 0, vertices = 0, triangles = 0;
  (root as { traverse(cb: (o: unknown) => void): void }).traverse((o: unknown) => {
    const m = o as { isMesh?: boolean; geometry?: { index?: { count: number }; attributes?: { position?: { count: number } } } };
    if (!m.isMesh || !m.geometry) return;
    meshes++;
    const pos = m.geometry.attributes?.position?.count ?? 0;
    vertices += pos;
    triangles += m.geometry.index ? m.geometry.index.count / 3 : pos / 3;
  });
  return { meshes, vertices, triangles };
}

/**
 * Drive the P3 frame bus synchronously so frame-bus builders actually drain.
 *
 * `tick()` is private on the scheduler and `isRunning` is a GETTER, not a
 * method — both measured. `start()` must precede any tick or the `!this.running`
 * guard swallows it silently, which is the failure that makes a roof build look
 * like "the builder produced nothing" when the truth is "the frame never came".
 */
export function pumpFrames(scheduler: unknown, frames = 4): number {
  const s = scheduler as { start(): void; drainSync(): unknown; tick(now: number): void };
  try { s.start(); } catch { /* already running is fine */ }
  let pumped = 0;
  for (let i = 0; i < frames; i++) {
    try { s.drainSync(); } catch { /* priority queue may be empty; tick listeners still matter */ }
    try { s.tick(performance.now()); pumped++; } catch { break; }
  }
  return pumped;
}

/**
 * Build geometry from the seeded world through the REAL fragment builders.
 *
 * Each family gets its OWN scene so a family that throws cannot silently
 * contaminate another family's count — a shared scene would let one builder's
 * leftovers read as another's output, which is the "0 divergences over the
 * wrong subject" shape in miniature.
 */
export async function buildHeadlessGeometry(world: World): Promise<HeadlessBuildResult> {
  const THREE = await import('@pryzm/renderer-three/three') as unknown as { Scene: new () => unknown };
  const families: FamilyGeometry[] = [];
  const s = world.stores;

  const record = (
    family: string, path: 'sync' | 'frame-bus', attempted: number,
    scene: unknown, built: number, error: string,
  ): void => {
    const c = countGeometry(scene);
    families.push({ family, attempted, built, ...c, error, path });
  };

  // ── WALL — synchronous. `buildWall(data)` adds directly to the scene. ──────
  {
    const scene = new THREE.Scene();
    const walls = (s.wallStore?.getAll?.() ?? []) as Array<{ id: string }>;
    let built = 0, error = '';
    try {
      const { WallFragmentBuilder } = await import('@pryzm/geometry-wall') as any;
      const b = new WallFragmentBuilder(scene, world.bimManager);
      for (const w of walls) {
        const before = countGeometry(scene).meshes;
        try { b.buildWall(w); } catch (e) { error ||= `wall ${w.id}: ${String(e).slice(0, 200)}`; }
        if (countGeometry(scene).meshes > before) built++;
      }
    } catch (e) { error = `builder unavailable: ${String(e).slice(0, 300)}`; }
    record('wall', 'sync', walls.length, scene, built, error);
  }

  // ── SLAB — `updateSlab` is synchronous OUTSIDE a batch, frame-bus inside one.
  // Nothing here batches, so this takes the synchronous `_buildSlab` path; the
  // pump below is harmless insurance rather than a dependency.
  {
    const scene = new THREE.Scene();
    const slabs = (s.slabStore?.getAll?.() ?? []) as Array<{ id: string }>;
    let built = 0, error = '';
    try {
      const { SlabFragmentBuilder } = await import('@pryzm/geometry-slab') as any;
      const b = new SlabFragmentBuilder(scene, world.bimManager);
      for (const sl of slabs) {
        const before = countGeometry(scene).meshes;
        try { b.updateSlab(sl); } catch (e) { error ||= `slab ${sl.id}: ${String(e).slice(0, 200)}`; }
        if (countGeometry(scene).meshes > before) built++;
      }
    } catch (e) { error = `builder unavailable: ${String(e).slice(0, 300)}`; }
    record('slab', 'sync', slabs.length, scene, built, error);
  }

  // ── COLUMN — synchronous `build(data)`; throws SpatialAuthorityError on a
  // dangling level, which is a REAL refusal and is recorded as one.
  {
    const scene = new THREE.Scene();
    const cols = (s.columnStore?.getAll?.() ?? []) as Array<{ id: string }>;
    let built = 0, error = '';
    try {
      const { ColumnFragmentBuilder } = await import('@pryzm/geometry-column') as any;
      const b = new ColumnFragmentBuilder(scene, world.bimManager, null);
      for (const c of cols) {
        const before = countGeometry(scene).meshes;
        try { b.build(c); } catch (e) { error ||= `column ${c.id}: ${String(e).slice(0, 200)}`; }
        if (countGeometry(scene).meshes > before) built++;
      }
    } catch (e) { error = `builder unavailable: ${String(e).slice(0, 300)}`; }
    record('column', 'sync', cols.length, scene, built, error);
  }

  // ── BEAM — synchronous `build(data)`. ─────────────────────────────────────
  {
    const scene = new THREE.Scene();
    const beams = (s.beamStore?.getAll?.() ?? []) as Array<{ id: string }>;
    let built = 0, error = '';
    try {
      const { BeamFragmentBuilder } = await import('@pryzm/geometry-beam') as any;
      const b = new BeamFragmentBuilder(scene);
      for (const bm of beams) {
        const before = countGeometry(scene).meshes;
        try { b.build(bm); } catch (e) { error ||= `beam ${bm.id}: ${String(e).slice(0, 200)}`; }
        if (countGeometry(scene).meshes > before) built++;
      }
    } catch (e) { error = `builder unavailable: ${String(e).slice(0, 300)}`; }
    record('beam', 'sync', beams.length, scene, built, error);
  }

  // ── ROOF — FRAME-BUS. Enqueues and returns; produces nothing until a tick.
  // This is the family that proves `pumpFrames` is load-bearing rather than
  // decorative: WITHOUT the pump this family measures 0 meshes forever.
  let framesPumped = 0;
  {
    const scene = new THREE.Scene();
    const roofs = (s.roofStore?.getAll?.() ?? []) as Array<{ id: string }>;
    let error = '';
    try {
      const { RoofFragmentBuilder } = await import('@pryzm/geometry-roof') as any;
      const b = new RoofFragmentBuilder(scene, world.bimManager);
      for (const r of roofs) {
        try { b.updateRoof(r); } catch (e) { error ||= `roof ${r.id}: ${String(e).slice(0, 200)}`; }
      }
      const { getFrameScheduler } = await import('@pryzm/frame-scheduler') as any;
      framesPumped = pumpFrames(getFrameScheduler(), 6);
    } catch (e) { error = `builder unavailable: ${String(e).slice(0, 300)}`; }
    const c = countGeometry(scene);
    record('roof', 'frame-bus', roofs.length, scene, c.meshes > 0 ? roofs.length : 0, error);
  }

  const totals = families.reduce(
    (a, f) => ({ meshes: a.meshes + f.meshes, vertices: a.vertices + f.vertices, triangles: a.triangles + f.triangles }),
    { meshes: 0, vertices: 0, triangles: 0 },
  );
  return { families, totals, framesPumped };
}

// ─── THE POLYGON-OFFSET ORACLE (§2.4) ────────────────────────────────────────
//
// "An operation with an oracle is worth ten with self-consistency." Every other
// reading in this module is SELF-CONSISTENT — it proves the builder produced
// triangles, not that the triangles are CORRECT. This one has a hand-checked
// answer: offsetting the 12 x 8 shell outward by the roof's declared 300 mm
// overhang must produce a 12.6 x 8.6 ring, exactly, spread 0.000.
//
// Per §2.4 a degenerate result must arrive as a LABELLED `{ degenerate, reason }`
// and never as an empty array or a silent clamp — so a degenerate answer here is
// reported with its reason rather than counted as a miss.

export interface OracleResult {
  ran: boolean;
  passed: boolean;
  detail: string;
  expected: { width: number; depth: number };
  actual: { width: number; depth: number } | null;
  spread: number;
}

export async function runOffsetOracle(overhang: number): Promise<OracleResult> {
  const expected = { width: 12 + 2 * overhang, depth: 8 + 2 * overhang };
  try {
    // `@pryzm/geometry-kernel` does not export the deep `./pure/polygonOffset`
    // specifier (measured: vite "Missing specifier"), and `geometry-roof`'s
    // barrel re-exports the SAME function — so the oracle imports it there.
    // This is the production consumer's own path, not a back door.
    const { offsetPolygon } = await import('@pryzm/geometry-roof') as any;
    const ring: Array<[number, number]> = [[0, 0], [12, 0], [12, 8], [0, 8]];
    const r = offsetPolygon(ring, overhang);
    if (r?.degenerate) {
      return {
        ran: true, passed: false, expected, actual: null, spread: NaN,
        detail: `offsetPolygon returned a LABELLED degenerate result: ${r.reason ?? '(no reason given)'} — ` +
          'reported as a named refusal, not counted as a silent miss (§2.4).',
      };
    }
    const poly = (r?.polygon ?? []) as Array<[number, number]>;
    if (poly.length < 3) {
      return {
        ran: true, passed: false, expected, actual: null, spread: NaN,
        detail: `offsetPolygon returned ${poly.length} vertices with degenerate=false — ` +
          'an empty result that did not declare itself degenerate is exactly the §2.4 failure shape.',
      };
    }
    const xs = poly.map((p) => p[0]), zs = poly.map((p) => p[1]);
    const actual = {
      width: Math.max(...xs) - Math.min(...xs),
      depth: Math.max(...zs) - Math.min(...zs),
    };
    const spread = Math.max(Math.abs(actual.width - expected.width), Math.abs(actual.depth - expected.depth));
    const passed = spread < 1e-9;
    return {
      ran: true, passed, expected, actual, spread,
      detail: passed
        ? `offset ${overhang} m over the 12x8 shell gave ${actual.width.toFixed(3)} x ${actual.depth.toFixed(3)}, ` +
          `expected ${expected.width.toFixed(3)} x ${expected.depth.toFixed(3)}, spread ${spread.toExponential(2)} — ` +
          'a KNOWN answer matched, not a self-consistency check.'
        : `offset ${overhang} m gave ${actual.width.toFixed(4)} x ${actual.depth.toFixed(4)}, ` +
          `expected ${expected.width.toFixed(4)} x ${expected.depth.toFixed(4)} — spread ${spread.toExponential(3)}.`,
    };
  } catch (e) {
    return {
      ran: false, passed: false, expected, actual: null, spread: NaN,
      detail: `ORACLE DID NOT RUN: ${String(e).slice(0, 300)} — a "0 divergences" from an oracle that never ` +
        'executed is vacuous (§4.4 way 3), so this reports as not-ran rather than as a pass.',
    };
  }
}

// ─── §4.3 THE IN-RUN NEGATIVE CONTROL ────────────────────────────────────────
//
// "Each harness runs its own checker over a DELIBERATELY BROKEN FIXTURE INSIDE
// THE RUN. If the checker calls the broken fixture clean, the run is
// `blind-comparator` -> exit 2, and EVERY VERDICT IT PRODUCED THAT RUN IS
// INVALIDATED — not downgraded, invalidated."
//
// The checker under test is `countGeometry`, because it is the single comparator
// every Geometry verdict in this module rests on. If it cannot tell a real mesh
// from a hollowed one, every triangle count above is worthless — and the correct
// response is to throw the whole run away rather than to publish a lower grade.
//
// THREE planted defects, each a different way a build can be wrong:
//   1. AN EMPTY SCENE must not read as geometry. (the empty-seed shape)
//   2. A MESH WITH NO POSITION ATTRIBUTE must not read as vertices. (the
//      hollow-object shape — an object that LOOKS like a mesh in the tree)
//   3. A REAL MESH must read as non-zero. Without this arm a comparator that
//      returns 0 for EVERYTHING would pass arms 1 and 2 and be called sighted —
//      a blind comparator that is blind in the safe direction is still blind.

export interface NegativeControl {
  arm: string;
  expectation: string;
  sighted: boolean;
  observed: string;
}

export async function runNegativeControl(): Promise<{ arms: NegativeControl[]; blind: boolean }> {
  const THREE = await import('@pryzm/renderer-three/three') as any;
  const arms: NegativeControl[] = [];

  // ARM 1 — an EMPTY scene must count as zero geometry.
  {
    const empty = new THREE.Scene();
    const c = countGeometry(empty);
    arms.push({
      arm: 'empty-scene',
      expectation: 'an empty scene must report 0 meshes / 0 triangles',
      sighted: c.meshes === 0 && c.triangles === 0,
      observed: `meshes=${c.meshes} triangles=${c.triangles}`,
    });
  }

  // ARM 2 — a HOLLOWED mesh (isMesh true, geometry with no position) must not
  // contribute vertices. This is the tamper that matters: it is shaped exactly
  // like a real mesh in a `traverse`, and a comparator reading `children.length`
  // instead of the position attribute would call it clean.
  {
    const scene = new THREE.Scene();
    const hollow = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    scene.add(hollow);
    const c = countGeometry(scene);
    arms.push({
      arm: 'hollow-mesh',
      expectation: 'a mesh whose geometry carries NO position attribute must report 0 vertices',
      sighted: c.meshes === 1 && c.vertices === 0 && c.triangles === 0,
      observed: `meshes=${c.meshes} vertices=${c.vertices} triangles=${c.triangles}`,
    });
  }

  // ARM 3 — a REAL box must be SEEN. Guards the safe-direction blindness.
  {
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()));
    const c = countGeometry(scene);
    arms.push({
      arm: 'real-box-must-be-seen',
      expectation: 'a real BoxGeometry mesh must report > 0 vertices and > 0 triangles',
      sighted: c.meshes === 1 && c.vertices > 0 && c.triangles > 0,
      observed: `meshes=${c.meshes} vertices=${c.vertices} triangles=${c.triangles}`,
    });
  }

  return { arms, blind: arms.some((a) => !a.sighted) };
}

/**
 * What a headless build CANNOT prove, named per §5 so no reader mistakes the
 * axis for coverage. Each entry is UNPROVEN — neither a pass nor a fail — and
 * each carries the REASON, because §5's whole discipline is that a limitation
 * declared without a name is indistinguishable from an oversight.
 */
export const GEOMETRY_UNPROVEN: Array<{ what: string; reason: string }> = [
  {
    what: 'GPU and shader geometry',
    reason: 'Anything computed in a shader is outside every gate and every harness here (§5.2). ' +
      'This build never constructs a WebGLRenderer and never calls render(); it measures the CPU ' +
      'half — triangulation, extrusion, transforms — and the GPU half stays outside even now that ' +
      'the CPU half has a subject.',
  },
  {
    what: 'Visual correctness of the produced meshes',
    reason: 'Triangle counts are a STABILITY oracle, not a CORRECTNESS one (§5.5). A builder ' +
      'emitting a well-formed wrong shape passes every count arm. Only polygon offset carries a ' +
      'hand-checked answer, and it is run here for exactly that reason.',
  },
  {
    what: 'Cross-architecture float determinism',
    reason: 'This build runs in ONE process on ONE architecture (§5.3). Platform-dependent ' +
      'floating-point differences — a Windows founder vs a Linux CI runner — are not measured by ' +
      'anything in this repository.',
  },
  {
    what: 'Materials, textures and instanced rendering paths',
    reason: 'Instanced builders key off live renderer state that no headless scene establishes; ' +
      'the builders take their non-instanced branch here. The instanced path is therefore ' +
      'UNBUILT, not proven, and must not be inferred from the non-instanced counts.',
  },
  {
    what: 'The frame-scheduled build under REAL frame pressure',
    reason: 'pumpFrames() drives tick() directly. That is the real production drain path, but it ' +
      'runs without budget contention, so adaptive per-frame budgeting and the LONGTASK collapse ' +
      'behaviour are exercised by nothing here.',
  },
];
