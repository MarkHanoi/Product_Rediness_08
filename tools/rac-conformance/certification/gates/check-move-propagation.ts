// ─── GATE · check-move-propagation ───────────────────────────────────────────
//
// SUBJECT: **GR-12 — mutation-update on MOVE.** The founder's original question,
// the one that created C79:
//
//     "closed polyline of walls → slab by region → move a wall — does the slab
//      follow?"
//
// C78 §6 calls move **"the unmeasured lifecycle phase"**. C79 §5.5 records, as the
// contract's own UNPROVEN, that *no path in this repository has been shown to
// distinguish the five recomputation states*. C71 §6.2 notes move-time invalidation
// *"has no arm in any of the three [graph gates] — the first thing to add"*. This
// gate is that arm.
//
// WHY IT MUST EXIST SEPARATELY FROM `check-region-host-attribution`. That gate is
// green: 11 of 11 region paths CONFORM. But its own §6.3 caveat says, verbatim, that
// a green table *"says NOTHING about whether the finish follows when its wall
// moves"*. Attribution-at-creation and consumption-at-move are two different claims,
// and the second one is the capability. A reference graph nothing reads is C70 §4.2's
// machinery-present / capability-unreachable, and it would read as done to anyone
// auditing by grep — C72 §0's exact mechanism.
//
// ─── HOW THE ARMS SPLIT, AND WHY ─────────────────────────────────────────────
//
// EXECUTED (A1–A4, slab). C79 §8.3(b) is explicit that no static gate can answer
// this: *"none of these gates observe RUNTIME behaviour, so 'move a wall and the slab
// follows' — the founder's actual question — remains provable only by an executed
// test."* So A1–A4 compose the REAL `SlabStore`, the REAL `SlabDependencyTracker`
// (constructed the way `apps/editor/src/engine/initTools.ts:825` constructs it), the
// REAL `traceRegionSketchAtPoint`, and the REAL `SlabFragmentBuilder.resolveLoop`,
// then MOVE A WALL and read the effect back.
//
// STRUCTURAL (A5–A7, floor finish · ceiling · roof). These are not executed because
// **there is nothing to execute**: no listener exists to drive. Driving a move at a
// family with no subscriber would produce a zero that means "I built no harness",
// not "the family does not follow" — the two-values-one-reading defect this suite
// exists to forbid. So each of the three is measured as a STRUCTURAL claim with an
// independent read-back, and N3 proves the same scanner reports NON-zero for the
// family that does have consumers.
//
// ─── CONTROLS (C74 §6.2 — an arm never watched failing is UNPROVEN) ──────────
//   PC1 · POSITIVE, and a FLOOR. With `tracker.bootstrap()` called, the identical
//         wall move must produce exactly 1 rebuild AND re-derive 24 m² → 36 m². If
//         this fails, the harness cannot see a re-projection at all, every "does not
//         follow" below is vacuous, and the gate exits 2 — never 0, never 1.
//   N1  · NEGATIVE. The SAME move over a reference-STRIPPED sketch (a pre-`e6c8cb58`
//         coordinate-only slab) must leave the geometry at 24 m². This is the
//         would-it-detect-a-non-follower proof: a probe that reports FOLLOWS for a
//         slab that cannot possibly follow is measuring its own fixture (C74 §3.4).
//   N2  · NEGATIVE. Moving a wall the slab does NOT reference must produce 0
//         rebuilds even after bootstrap. Without it, A1's counter could be counting
//         any wall event.
//   N3  · NEGATIVE, for the structural arms. The identical consumer scan run against
//         the SLAB's `HostReferenceEdge` must find MANY consumers. A scanner that
//         returns 0 for everything would report A5–A7 red whatever the tree does.
//
// ─── WHAT THIS GATE CANNOT SEE ───────────────────────────────────────────────
//  (a) Whether the re-projected geometry is CORRECT in a rendered scene. It stops at
//      the polygon `SlabFragmentBuilder` extrudes — which is where "does it follow"
//      is decided, but it is not a pixel.
//  (b) The wall store is a probe double (two surfaces: `subscribe`, `getById`). The
//      production `WallStore` is an L2 package with a `ProjectContext`/`BimManager`
//      dependency this gate does not compose. The double is the SUBJECT of the move,
//      never the source of the answer.
//  (c) Collaboration merge, undo/redo of a move, and multi-level moves.
//  (d) Whether a USER is told which edges follow (C79 §10.6 — still no UI surface).
//  (e) The roof arm reads the roof DATA MODEL. It does not execute a roof move,
//      because `RoofData` has no field a reference could occupy, so there is no
//      reference for a move to consume.
//
// EXECUTED SIBLING: `packages/geometry-slab/__tests__/c79MovePropagation.test.ts`
// (16 tests) carries the long-form evidence, including the §5.2.1 forbidden-collapse
// demonstration and the post-load arm that closes C79 §10.1's named residual.

import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';
import { reportGate, type GateResult, type Floor } from '../contract.js';
import { collectSources, type SourceFile } from './scan.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LEDGER = resolve(__dirname, 'move-propagation.json');
const REPO = resolve(__dirname, '../../../..');

// ── DOM install, BEFORE any @pryzm module loads ──────────────────────────────
// Copied from check-propagation-trackers-reach.ts for the same reason: gates are
// spawned as `npx tsx <file>`, Node's own Event/CustomEvent are rejected by
// happy-dom's dispatchEvent, and `SlabStore`'s DOMEventBus dispatches on window.
const hw = new Window({ url: 'http://localhost/' }) as unknown as Record<string, unknown>;
for (const k of [
  'document', 'navigator', 'HTMLElement', 'HTMLCanvasElement', 'Event', 'CustomEvent',
  'EventTarget', 'Node', 'location', 'requestAnimationFrame', 'cancelAnimationFrame',
  'getComputedStyle', 'DOMParser', 'Image', 'SVGElement', 'MutationObserver', 'ResizeObserver',
]) {
  const v = hw[k];
  if (v === undefined) continue;
  try { Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true }); }
  catch { /* a non-configurable host global stays as it is */ }
}
Object.defineProperty(globalThis, 'window', { value: hw, configurable: true, writable: true });

// ─────────────────────────────────────────────────────────────────────────────

interface Ledger {
  '//': string[];
  firstReading?: string;
  negativeControl?: string[];
  declaredFindings: string[];
}

const floors: Floor[] = [];
const lines: string[] = [];
const findingNames: string[] = [];
const stale: string[] = [];

/** Arms that RAN — established a subject and produced a verdict. */
let armsExercised = 0;
/** Controls that behaved as a control must. */
let controlsProven = 0;
/** Families enumerated as region-derived. A discovery of zero is exit 2. */
let familiesEnumerated = 0;
const harnessErrors: string[] = [];

const ledger: Ledger | null = existsSync(LEDGER)
  ? (JSON.parse(readFileSync(LEDGER, 'utf8')) as Ledger)
  : null;

const arm = (name: string, ok: boolean, detail: string): void => {
  armsExercised++;
  if (ok) lines.push(`✓  ${name}: ${detail}`);
  else { findingNames.push(name); lines.push(`❌ ${name}: ${detail}`); }
};
const control = (name: string, proven: boolean, detail: string): void => {
  if (proven) { controlsProven++; lines.push(`   ⟂ CONTROL ${name} PROVEN — ${detail}`); }
  else lines.push(`   ⟂ CONTROL ${name} FAILED — ${detail}  ← the comparator is BLIND; this is a FLOOR, not a finding.`);
};

// ═════════════════════════════════════════════════════════════════════════════
// The probe wall store — two surfaces, because the code under test uses two.
// ═════════════════════════════════════════════════════════════════════════════

type ProbeWall = { id: string; baseLine: { x: number; y: number; z: number }[]; thickness: number };

class ProbeWallStore {
  private walls = new Map<string, ProbeWall>();
  private listeners: ((e: string, w: ProbeWall) => void)[] = [];
  seed(w: ProbeWall): void { this.walls.set(w.id, w); }
  getById(id: string): ProbeWall | undefined { return this.walls.get(id); }
  getAll(): ProbeWall[] { return [...this.walls.values()]; }
  subscribe(cb: (e: string, w: ProbeWall) => void): () => void {
    this.listeners.push(cb);
    return () => { this.listeners = this.listeners.filter((l) => l !== cb); };
  }
  /** Vanish a wall WITHOUT a 'remove' event — the resolver's `undetermined` case. */
  vanish(id: string): void { this.walls.delete(id); }
  /** THE ACT under measurement. */
  move(id: string, dx: number, dz: number): void {
    const w = this.walls.get(id);
    if (!w) throw new Error(`probe wall "${id}" not seeded`);
    w.baseLine = w.baseLine.map((p) => ({ x: p.x + dx, y: p.y, z: p.z + dz }));
    for (const l of this.listeners) l('update', w);
  }
  asRegionWalls(): Array<{ id: string; baseLine: { x: number; z: number }[] }> {
    return this.getAll().map((w) => ({ id: w.id, baseLine: w.baseLine.map((p) => ({ x: p.x, z: p.z })) }));
  }
}

/** 6 m × 4 m room of four straight walls — C79 §10.3's reference fixture. */
function seedRoom(s: ProbeWallStore): void {
  const w = (id: string, x0: number, z0: number, x1: number, z1: number): ProbeWall => ({
    id, thickness: 0.2,
    baseLine: [{ x: x0, y: 0, z: z0 }, { x: x1, y: 0, z: z1 }],
  });
  s.seed(w('w-south', 0, 0, 6, 0));
  s.seed(w('w-east', 6, 0, 6, 4));
  s.seed(w('w-north', 6, 4, 0, 4));
  s.seed(w('w-west', 0, 4, 0, 0));
  // A wall that bounds nothing — N2's subject.
  s.seed(w('w-detached', 20, 20, 26, 20));
}

const area = (poly: ReadonlyArray<{ x: number; y: number }> | null): number => {
  if (!poly || poly.length < 3) return 0;
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!, q = poly[(i + 1) % poly.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a / 2);
};

// ═════════════════════════════════════════════════════════════════════════════
// The structural scanner — used by A5/A6 and, as N3, by the slab control.
// ═════════════════════════════════════════════════════════════════════════════

/** Strip comments so a symbol named only in PROSE is never counted as a consumer. */
const codeOf = (t: string): string =>
  t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/**
 * Files that reference `symbol` IN CODE, excluding the file that DECLARES it and
 * any barrel that merely re-exports it. What remains is a consumer: something that
 * could read the reference and act on it.
 */
function consumersOf(sources: SourceFile[], symbol: string, declaredIn: RegExp): string[] {
  // Identifier-boundary match, NOT substring: `FloorHostReferenceEdge` must not be
  // counted as a use of `HostReferenceEdge`. Getting that wrong would inflate N3's
  // control count with the very files A5/A6 are measuring as empty — a control that
  // borrows its evidence from the arm it is meant to check.
  const re = new RegExp(`(?<![A-Za-z0-9_$])${symbol}(?![A-Za-z0-9_$])`);
  const out: string[] = [];
  for (const f of sources) {
    if (declaredIn.test(f.rel)) continue;
    if (/\/(index|stores\/index)\.ts$/.test(f.rel)) continue; // barrel re-export
    if (re.test(codeOf(f.text))) out.push(f.rel);
  }
  return out;
}

// ═════════════════════════════════════════════════════════════════════════════

async function run(): Promise<void> {
  const wnd = globalThis.window as unknown as Record<string, unknown>;

  const slabMod = await import('@pryzm/geometry-slab');
  // §C79-5.2-SLAB-STATES — the reporting channel A3/A4 read. Imported from the
  // package barrel, i.e. the same surface production consumes; a gate that
  // re-implemented the classification would be measuring itself.
  const classifySlabRecompute = (slabMod as unknown as {
    classifySlabRecompute: (i: {
      slabId: string;
      previousRing: { x: number; y: number }[] | null | undefined;
      resolution: unknown;
    }) => { state: string; reason?: string; subReason: string; numbers?: { oldAreaM2: number; newAreaM2: number } };
  }).classifySlabRecompute;
  const {
    SlabStore, SlabDependencyTracker, traceRegionSketchAtPoint, SlabFragmentBuilder,
  } = slabMod as unknown as {
    SlabStore: new () => {
      add(s: unknown): void;
      getById(id: string): { sketch?: { outerLoop: unknown }; polygon?: { x: number; y: number }[] } | undefined;
      triggerRebuild(id: string): void;
    };
    SlabDependencyTracker: new (s: unknown, w: unknown, r: unknown) => { bootstrap(): void; dispose(): void };
    traceRegionSketchAtPoint: (w: unknown, x: number, z: number) => {
      sketch: { outerLoop: { edges: Array<Record<string, unknown>> } };
      ring: { x: number; y: number }[];
      attribution: { hostEdges: number; freeEdges: number };
    } | null;
    SlabFragmentBuilder: { resolveLoop(l: unknown): { x: number; y: number }[] | null };
  };
  const resolveLoop = (l: unknown): { x: number; y: number }[] | null =>
    (SlabFragmentBuilder as unknown as { resolveLoop(x: unknown): { x: number; y: number }[] | null }).resolveLoop(l);

  // §C79-5.2-SLAB-STATES — the same call, WITH the per-edge provenance A3/A4 read.
  interface LoopVerdict {
    ring: { x: number; y: number }[] | null;
    fullyLive: boolean;
    edgeOutcomes: { index: number; source: string; state: string; reason?: string }[];
    undetermined?: { reason: string; subReason: string };
  }
  const resolveLoopVerdict = (l: unknown): LoopVerdict =>
    (SlabFragmentBuilder as unknown as { resolveLoopVerdict(x: unknown): LoopVerdict }).resolveLoopVerdict(l);
  const classify = (
    slabId: string,
    previousRing: { x: number; y: number }[] | null | undefined,
    resolution: LoopVerdict,
  ) => classifySlabRecompute({ slabId, previousRing, resolution });

  /** A minimal, schema-valid region slab — the shape the plan handler commits. */
  const regionSlab = (id: string, sketch: unknown, ring: { x: number; y: number }[]): unknown => ({
    id, type: 'slab', levelId: 'L0', thickness: 0.2,
    position: { x: 0, y: 0, z: 0 },
    polygon: ring, sketch,
    ifcData: { guid: `guid-${id}`, ifcClass: 'IfcSlab' },
  });

  /** Compose one world: real store, real tracker, real tracer, a moved wall. */
  const world = (opts: { bootstrap: boolean; stripRefs?: boolean }) => {
    const walls = new ProbeWallStore();
    seedRoom(walls);
    wnd.wallStore = walls;                      // WallFaceResolver.ts:37 reads this
    const store = new SlabStore();
    const rebuilds: string[] = [];
    const real = store.triggerRebuild.bind(store);
    store.triggerRebuild = (id: string): void => { rebuilds.push(id); real(id); };
    const tracker = new SlabDependencyTracker(store, walls, { current: undefined });

    const traced = traceRegionSketchAtPoint(walls.asRegionWalls(), 3, 2);
    if (!traced) throw new Error('the tracer found no region at (3,2) — the fixture is broken');
    let sketch: { outerLoop: { edges: Array<Record<string, unknown>> } } = traced.sketch;
    if (opts.stripRefs) {
      // The pre-`e6c8cb58` coordinate-only slab: same ring, no references.
      sketch = {
        outerLoop: {
          edges: traced.sketch.outerLoop.edges.map((e) =>
            e.type === 'hostReference'
              ? { type: 'freeLine', ...(e.fallback as Record<string, unknown>) }
              : e),
        },
      };
    }
    store.add(regionSlab('sb', sketch, traced.ring));
    if (opts.bootstrap) tracker.bootstrap();
    return { walls, store, tracker, rebuilds, sketch, traced };
  };

  // ══ PC1 · POSITIVE CONTROL, and a FLOOR ═════════════════════════════════════
  // Can this harness see a re-projection AT ALL? If not, every zero below means
  // "I built no harness", and that is the empty-seed lie in a tracker's uniform.
  let pc1 = 0;
  try {
    const w = world({ bootstrap: true });
    const before = area(resolveLoop(w.sketch.outerLoop));
    w.walls.move('w-north', 0, 2);
    const after = area(resolveLoop(w.sketch.outerLoop));
    pc1 = (w.rebuilds.length === 1 && Math.abs(before - 24) < 1e-6 && Math.abs(after - 36) < 1e-6) ? 1 : 0;
    control('PC1 (positive · bootstrapped tracker)', pc1 === 1,
      `with tracker.bootstrap() called, a 2 m move of w-north produced ${w.rebuilds.length} rebuild(s) ` +
      `(want 1) and re-derived ${before.toFixed(3)} m² → ${after.toFixed(3)} m² (want 24 → 36). ` +
      'The re-projection MECHANISM works and this harness can observe it.');
    w.tracker.dispose();
  } catch (e) { harnessErrors.push('PC1: ' + String(e).slice(0, 300)); }
  floors.push({ what: 'PC1 positive control — the harness can observe a re-projection', measured: pc1, min: 1 });

  // ══ N1 · NEGATIVE CONTROL — would this probe DETECT a non-following slab? ════
  try {
    const w = world({ bootstrap: true, stripRefs: true });
    const before = area(resolveLoop(w.sketch.outerLoop));
    w.walls.move('w-north', 0, 2);
    const after = area(resolveLoop(w.sketch.outerLoop));
    control('N1 (negative · references stripped)', Math.abs(after - before) < 1e-9 && Math.abs(after - 24) < 1e-6,
      `a reference-STRIPPED sketch (the pre-e6c8cb58 coordinate-only slab) over the IDENTICAL 2 m move ` +
      `re-derived ${before.toFixed(3)} m² → ${after.toFixed(3)} m² — it must stay 24, and PC1 must move to 36. ` +
      'This is the would-it-detect-a-non-follower proof: the comparator distinguishes a slab that FOLLOWED ' +
      'from a slab that could not possibly have followed, over the same wall move.');
    w.tracker.dispose();
  } catch (e) { harnessErrors.push('N1: ' + String(e).slice(0, 300)); }

  // ══ N2 · NEGATIVE CONTROL — an input the tracker MUST ignore ════════════════
  try {
    const w = world({ bootstrap: true });
    w.rebuilds.length = 0;
    w.walls.move('w-detached', 1, 1);
    control('N2 (negative · unreferenced wall moved)', w.rebuilds.length === 0,
      `moving w-detached — a wall no edge of this slab references — produced ${w.rebuilds.length} rebuild(s); ` +
      'must be 0. A counter that ticked on any wall event would call A1 green whatever the graph holds.');
    w.tracker.dispose();
  } catch (e) { harnessErrors.push('N2: ' + String(e).slice(0, 300)); }

  // ══ A1 · THE FOUNDER'S QUESTION, EXECUTED ═══════════════════════════════════
  familiesEnumerated++; // slab (region)
  try {
    const w = world({ bootstrap: false });   // exactly how a live session creates one
    w.walls.move('w-north', 0, 2);
    arm('slab·region · a slab created AFTER wiring re-projects when a bounding wall moves',
      w.rebuilds.length >= 1,
      `a region slab added through the production write path (SlabStore.add) and then a 2 m move of a ` +
      `bounding wall produced ${w.rebuilds.length} rebuild request(s) — want ≥ 1. ` +
      'ROOT CAUSE: SlabStore.emit fires `bim-slab-{added,updated,removed}` with the F.events.18 payload ' +
      '`{ id }` (event-bus/src/catalog.ts:95-97), while SlabDependencyTracker.ts:57-67 guards on ' +
      '`e.detail.slab` / `e.detail.slabId` — so registerSlab() is UNREACHABLE from the event path and the ' +
      'dependency graph stays empty. Only bootstrap() (initTools.ts:828, run ONCE at wiring) ever fills it, ' +
      'which PC1 proves works. initBuilders.ts:367-383 was fixed for this exact shape mismatch ' +
      '(§DOM-EVENT-LISTENER-AUDIT-2026-05-18); the two trackers were not. ' +
      'SlabWallConnectivityService.ts:115-122 carries the identical defect.');
    w.tracker.dispose();
  } catch (e) { harnessErrors.push('A1: ' + String(e).slice(0, 300)); }

  // ══ A2 · what follows — the MESH or the MODEL? ══════════════════════════════
  try {
    const w = world({ bootstrap: true });    // best case: the graph IS populated
    w.walls.move('w-north', 0, 2);
    const stored = w.store.getById('sb')!;
    const drawn = area(resolveLoop((stored.sketch as { outerLoop: unknown }).outerLoop));
    const recorded = area(stored.polygon ?? null);
    arm('slab·region · the STORED polygon follows the move, not only the drawn mesh',
      Math.abs(drawn - recorded) < 1e-6,
      `after the move the builder draws ${drawn.toFixed(3)} m² (createSlabMeshWithEdges:978 prefers ` +
      `data.sketch) but SlabData.polygon still records ${recorded.toFixed(3)} m². Nothing writes the ` +
      're-derived ring back to the model, so every consumer that reads the POLYGON — root.userData.polygon ' +
      '(SlabFragmentBuilder:445), schedules, area take-off, export, and any downstream region detection — ' +
      'sees the PRE-MOVE shape. "It follows" is true of the picture and false of the record.');
    w.tracker.dispose();
  } catch (e) { harnessErrors.push('A2: ' + String(e).slice(0, 300)); }

  // ══ A3 · C79 §5.2.1 — `preserved` vs `undetermined` ═════════════════════════
  //
  // ⚠ PREDICATE CORRECTED 2026-08-14, and the correction is the FINDING, not a
  // convenience. The arm used to require `JSON.stringify(ringA) !== JSON.stringify(ringB)`
  // — i.e. it could only ever go green if the two RINGS differed. But the two
  // rings are the same by construction ("the same PIXELS and opposite FACTS"),
  // and the only way to make them differ is to DELETE the §4.3 fallback, which
  // C79 §4.3 requires and this ledger's own note forbids in these words: *"The
  // fix is a reason channel on the resolve result, never the removal of the
  // fallback."* So the old predicate demanded the one repair the arm's own
  // prescription rules out. It is now the honest question — CAN THE CALLER TELL?
  // — and it is STRICTER, not looser: the byte-identity of the rings is still
  // measured and is now a REQUIRED half of the verdict (if the rings ever stop
  // matching, this arm fails, because the §5.2.1 claim would be true for the
  // wrong reason), and a channel that answered `undetermined` for everything is
  // ruled out by requiring the live case to report `live` with no reason.
  try {
    const w = world({ bootstrap: true });
    w.walls.move('w-north', 0, 0);                       // PRESERVED: a zero move
    const preserved = resolveLoop(w.sketch.outerLoop);
    const preservedV = resolveLoopVerdict(w.sketch.outerLoop);

    const w2 = world({ bootstrap: true });
    // UNDETERMINED: the host becomes unresolvable WITHOUT a 'remove' event, so no
    // C79 §4 degradation runs and `resolveOrFallback` returns the stale
    // authoring-time fallback (WallFaceResolver.ts).
    w2.walls.vanish('w-north');
    const undetermined = resolveLoop(w2.sketch.outerLoop);
    const undeterminedV = resolveLoopVerdict(w2.sketch.outerLoop);

    const sameRing = JSON.stringify(preserved) === JSON.stringify(undetermined);
    const preservedState = classify('sb', w.traced.ring, preservedV).state;
    const undeterminedState = classify('sb', w2.traced.ring, undeterminedV).state;
    const undeterminedReason = classify('sb', w2.traced.ring, undeterminedV).reason;
    arm('all families · C79 §5.2.1 — `preserved` and `undetermined` are distinguishable at the caller',
      sameRing                                   // the pixels really are identical
      && preservedV.fullyLive === true           // …and the live case is not just refused
      && preservedState === 'preserved'
      && undeterminedV.fullyLive === false
      && undeterminedState === 'undetermined'
      && undeterminedReason === 'STALE_DERIVED_STATE',
      `a zero-move re-derivation and a re-derivation whose host cannot be resolved return the SAME ` +
      `${area(preserved).toFixed(3)} m² ring, byte-identical: ${sameRing} — and the CALLER now reads ` +
      `"${preservedState}" vs "${undeterminedState}" (${undeterminedReason}). ` +
      'WallFaceResolver.resolve() returns null — it KNOWS the host is gone — and ' +
      'resolveWithProvenance() now says so beside the identical geometry instead of absorbing it ' +
      '(§C79-5.2-SLAB-STATES). The §4.3 fallback is NOT removed: C79 §5.2.1 asks whether the caller ' +
      'can tell, not whether the pixels differ.');
    w.tracker.dispose(); w2.tracker.dispose();
  } catch (e) { harnessErrors.push('A3: ' + String(e).slice(0, 300)); }

  // ══ A4 · C79 §5.2 — is ANY of the five states reported? ═════════════════════
  //
  // ⚠ PREDICATE STRENGTHENED 2026-08-14. It used to sniff `triggerRebuild() !==
  // undefined || ring.state !== undefined` — a shape check that any non-void
  // return would satisfy, including a meaningless one. It now DRIVES three
  // distinct outcomes through the real path and requires three DISTINCT named
  // states, each a member of C79 §5.2's five, with both numbers on the
  // `conflicted` refusal (§5.2.2 / C73 §4). The original observation is kept in
  // the message because it is still true and is why the channel exists: the ring
  // entry points are deliberately unchanged, so no draw path moved.
  try {
    const zero = world({ bootstrap: true });
    zero.walls.move('w-north', 0, 0);
    const vZero = classify('sb', zero.traced.ring, resolveLoopVerdict(zero.sketch.outerLoop));

    const grew = world({ bootstrap: true });
    grew.walls.move('w-north', 0, 2);
    const vGrew = classify('sb', grew.traced.ring, resolveLoopVerdict(grew.sketch.outerLoop));

    const inverted = world({ bootstrap: true });
    inverted.walls.move('w-north', 0, -8);   // drive the north wall THROUGH the south
    const vInv = classify('sb', inverted.traced.ring, resolveLoopVerdict(inverted.sketch.outerLoop));

    const FIVE = ['preserved', 'resized', 'regenerated', 'conflicted', 'undetermined'];
    const seen = [vZero.state, vGrew.state, vInv.state];
    const trig = zero.store.triggerRebuild('sb') as unknown;
    arm('all families · C79 §5.2 — a re-derivation reports exactly one of the five states',
      seen.every((s) => FIVE.includes(s))
      && new Set(seen).size === 3
      && vZero.state === 'preserved' && vGrew.state === 'resized' && vInv.state === 'conflicted'
      && vInv.numbers !== undefined && vGrew.numbers !== undefined,
      `three re-derivations of the SAME slab over three different wall moves report three DISTINCT ` +
      `states: zero move → "${vZero.state}", +2 m → "${vGrew.state}" ` +
      `(${vGrew.numbers?.oldAreaM2.toFixed(3)} → ${vGrew.numbers?.newAreaM2.toFixed(3)} m²), ` +
      `north-through-south → "${vInv.state}" (${vInv.subReason}). ` +
      `The ring entry points are UNCHANGED by design — SlabStore.triggerRebuild still → ` +
      `${String(trig)}, SlabFragmentBuilder.resolveLoop still → a bare ring | null — because the state ` +
      'is a property of a RE-DERIVATION, not of a ring; it travels beside the geometry in ' +
      'SlabFragmentBuilder.resolveLoopVerdict + classifySlabRecompute, and SlabDependencyTracker.' +
      'recomputeForWall returns it. `regenerated` is classified but NOT producible by a wall move ' +
      '(computePolygon returns one vertex per segment and a move changes neither edge count nor host ' +
      'set) — named in slabRecomputeVerdict.ts, owned by the sketch-EDIT path, not counted as shipped. ' +
      'STILL OPEN and NOT claimed by this arm: C79 §10.6 — no USER-facing surface carries the refusal; ' +
      'a console.warn is a developer trace, not a message.');
    zero.tracker.dispose(); grew.tracker.dispose(); inverted.tracker.dispose();
  } catch (e) { harnessErrors.push('A4: ' + String(e).slice(0, 300)); }

  // ══ STRUCTURAL ARMS — the families with nothing to drive ════════════════════
  const sources = collectSources(REPO, ['packages', 'apps', 'plugins']);
  floors.push({ what: 'source files walked for the consumer scan', measured: sources.length, min: 2000 });

  // N3 · the scanner is not blind: the SLAB's edge type has many consumers.
  const slabConsumers = consumersOf(sources, 'HostReferenceEdge', /geometry-slab\/src\/SketchTypes\.ts$/);
  control('N3 (negative · the consumer scanner discriminates)', slabConsumers.length >= 4,
    `the identical scan run against the SLAB's HostReferenceEdge finds ${slabConsumers.length} consumer ` +
    `file(s) — e.g. ${slabConsumers.slice(0, 4).join(', ')}. A scanner that returned 0 for every symbol ` +
    'would report A5/A6 red whatever the tree contained.');

  // A5 / A6 · floor finish and ceiling.
  for (const fam of [
    { family: 'floor-finish', symbol: 'FloorHostReferenceEdge', decl: /stores\/FloorTypes\.ts$/, builder: 'FloorPanelBuilder.ts:122' },
    { family: 'ceiling', symbol: 'CeilingHostReferenceEdge', decl: /stores\/CeilingTypes\.ts$/, builder: 'CeilingPanelBuilder.ts:220' },
  ]) {
    familiesEnumerated++;
    const consumers = consumersOf(sources, fam.symbol, fam.decl);
    arm(`${fam.family} · the host reference written at creation is READ by something`,
      consumers.length > 0,
      `${fam.symbol} has ${consumers.length} consumer file(s) in packages/ + apps/ + plugins/ outside its ` +
      `own declaration and the barrel${consumers.length ? ` — ${consumers.join(', ')}` : ''}. ` +
      `C79 §6.3 rows 6-10 made this family CONFORMING at CREATION on 2026-08-13; the edges are correct and ` +
      `resolvable. Nothing consumes them: there is no ${fam.family} dependency tracker anywhere ` +
      `(the only wallStore.subscribe sites are door, window, slab ×2, room-topology and four snap providers), ` +
      `and ${fam.builder} builds geometry from \`boundary.polygon\` — the sketch is not an input. ` +
      'Additionally the finish edge speaks `{x,z}` while the ONE resolver in the tree ' +
      '(WallFaceResolver, Segment2D `{x,y}`) speaks `{x,y}`, so even a new tracker could not call it without ' +
      'a coordinate adapter that does not exist. C70 §4.2: machinery present, capability unreachable.');
  }

  // A7 · roof — there is no field a reference could occupy.
  familiesEnumerated++;
  try {
    const roofTypes = sources.find((f) => f.rel.endsWith('geometry-roof/src/RoofTypes.ts'));
    if (!roofTypes) throw new Error('RoofTypes.ts not found — the roof subject could not be established');
    const code = codeOf(roofTypes.text);
    const capable = /hostReference|HostReferenceEdge|boundingWallIds|sketch\s*\??\s*:/.test(code);
    const traceAdapter = sources.find((f) => f.rel.endsWith('geometry-roof/src/RoofRegionTrace.ts'));
    arm('roof·region · the region attribution reaches a reference-capable field on the roof record',
      capable,
      `RoofTypes.ts declares no field that can carry a boundary reference (searched hostReference, ` +
      `HostReferenceEdge, boundingWallIds, sketch): \`RoofFootprint.polygon\` is a bare ` +
      `[number, number][]. ` +
      (traceAdapter
        ? 'RoofRegionTrace.ts now routes roof-by-region onto the SHARED tracer and RETURNS the five ' +
          'attribution counts (C79 §6.5, retiring WallRegionDetector) — so the attribution EXISTS and is ' +
          'reported, and is then discarded for want of anywhere to put it. That module names this same gap ' +
          'itself. '
        : 'WallRegionDetector projects the traced loop to bare coordinates before returning (C79 §0.1(1)). ') +
      'The L0 bus schema compounds it: `packages/schemas/src/elements/Roof.ts` types `boundary` as Vec3[], ' +
      'and Zod strips unknown keys, so a reference cannot even TRANSIT the bus. Roof therefore does not ' +
      'follow, cannot follow, and — unlike the finishes — has no correct data sitting unread. ' +
      'This is a NAMED GAP with an owner (@pryzm/geometry-roof), not a silent one.');
  } catch (e) { harnessErrors.push('A7: ' + String(e).slice(0, 300)); }
}

await run().catch((e) => { harnessErrors.push('run(): ' + String(e).slice(0, 400)); });

// ── FLOORS — misconfiguration detectors, never difficulty settings ───────────
floors.push({ what: 'ledger move-propagation.json present', measured: ledger ? 1 : 0, min: 1 });
floors.push({ what: 'region-derived FAMILIES enumerated (slab · floor · ceiling · roof)', measured: familiesEnumerated, min: 4 });
floors.push({ what: 'move-propagation arms driven to a verdict', measured: armsExercised, min: 7 });
floors.push({ what: 'controls that behaved as controls (PC1 + N1..N3)', measured: controlsProven, min: 4 });
floors.push({ what: 'arms free of a harness error (a THROW is never "does not follow")', measured: harnessErrors.length === 0 ? 1 : 0, min: 1 });
for (const e of harnessErrors) lines.push(`‼  HARNESS ERROR — ${e}`);

// ── Ledger staleness — a paid debt must LEAVE the ledger ─────────────────────
if (ledger) {
  for (const declared of ledger.declaredFindings) {
    if (!findingNames.includes(declared)) {
      lines.push(`⚠  STALE LEDGER ENTRY: "${declared}" is declared but no longer measured — strike it in the commit that fixed it.`);
      stale.push(declared);
    }
  }
}

lines.push(
  `SUBJECT SIZE: ${familiesEnumerated} region-derived famil(ies), ${armsExercised} arm(s) driven, ` +
  `${controlsProven}/4 controls proven, ${findingNames.length} finding(s). ` +
  'A count of families that do not follow, without a count of families examined, is the empty-seed lie.',
);

const result: GateResult = {
  gate: 'check-move-propagation',
  floors,
  lines,
  findings: findingNames.length,
  declared: ledger?.declaredFindings.length ?? 0,
  findingNames,
  stale,
};
process.exit(reportGate(result));
