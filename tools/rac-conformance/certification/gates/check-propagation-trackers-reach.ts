// ─── GATE · check-propagation-trackers-reach ─────────────────────────────────
//
// SUBJECT: the FOUR bespoke propagation pairs that Level 4 of the maturity ladder
// actually rests on — `DoorDependencyTracker`, `WindowDependencyTracker`, the
// `DeleteElementCommand` §CASCADE-DELETE path, and `RoomTopologyObserver`.
//
// WHY THIS GATE EXISTS AT ALL. C72 §6.1.2(d) states it as an UNPROVEN in the
// contract's own words: *"Propagation that is bespoke (§0.3) — the ledger's
// subject is the four generic events only, and the bespoke trackers are ungated
// today. UNPROVEN: no gate asserts that the bespoke trackers still reach their
// pairs."* BIM30-GAP-REGISTER §10.1 files the same hole as **GATE · UNMAPPED ·
// PR-09**, and §10.2 is blunt about the consequence: a domain with an unmapped
// gate cannot be scored at all. The only propagation in this product that WORKS
// is the least-instrumented subsystem in it. This gate closes that.
//
// WHY IT IS EXECUTED AND NOT STATIC — the deliberate opposite of its sibling.
// `check-propagation-reaches` is static ON PURPOSE (C72 §6.1.1): "a listener
// exists" is a claim about the whole estate and no headless world composes the
// whole estate. THIS gate asks a different and narrower question — *does the
// registered listener still REACH its pair?* — and static analysis cannot answer
// it. A tracker whose `subscribe()` call is intact, whose index is intact, and
// whose `touch()` line has been commented out passes every grep ever written.
// So every arm below drives a REAL mutation through REAL stores and REAL
// commands and reads the downstream effect back independently (C70 L-INV-4).
//
// ─── RELATIONSHIP TO THE EXISTING TEST, STATED SO NOTHING IS DUPLICATED ──────
// `apps/editor/__tests__/wallMoveHostedOpeningCascadeFreeze.test.ts` already
// pins part of pair 1. It is cited, not repeated. It covers:
//   · a BASELINE move → exactly one touch per hosted door/window (termination)
//   · §HEAVY-LEVEL boundedness — O(K) not O(level), one commit barrier
//   · re-home semantics (C15 identity pinning) and index linearity
// It does NOT cover, and this gate does:
//   · A3/A4 — a HEIGHT-only and a THICKNESS-only wall edit. Both are branches of
//     `_wallGeometryChanged` (DoorDependencyTracker.ts:112-120, the window twin
//     at :93-101) that NO suite in the repository drives. Every existing test
//     moves the baseLine. Those two `if` lines could be deleted today and the
//     whole estate stays green.
//   · A5/A6 — cascade-delete to the EXTERNAL door/window stores. That path is
//     not in `WallStore.remove()` at all (proven by negative control N3); it
//     lives in `DeleteElementCommand.ts:243-260` §CASCADE-DELETE, and the freeze
//     test never deletes a wall.
//   · A7/A8 — `RoomTopologyObserver` in any form. The freeze test does not
//     construct one.
// It is also a vitest suite in another agent's territory, run by another config;
// a certification gate may not depend on someone else's runner to establish its
// own subject.
//
// ─── STUB LEDGER, declared loudly (world.ts doctrine) ────────────────────────
//   • happy-dom is installed as the global DOM IN-PROCESS rather than by vitest,
//     because `certify.ts` spawns gates as `npx tsx <file>`. The measured path is
//     store/tracker/command code; nothing under test reads a pixel or a layout.
//   • `shimCanvas2D()` is copied from `../world.ts` (its own stub-ledger entry):
//     happy-dom's `getContext('2d')` returns null, which crashes
//     `LevelVisualizer._makeLevelHead` — a level-head SPRITE texture, pure
//     presentation, no authoritative state.
//   • The store set is constructed arg-for-arg as `../world.ts` does (which in
//     turn mirrors `apps/editor/src/engine/initBuilders.ts`). The CommandBus and
//     `initBusHandlers` are NOT composed here: `apps/editor`'s bridge module
//     pulls `@pryzm/file-format` → `svg2pdf.js`, whose CJS interop resolves only
//     under a bundler. The pairs under test are store-level and command-level,
//     not bus-level, so no measured claim passes through the bus. **Anything
//     that WOULD need the bus is reported as "cannot see", never as clean.**
//   • A7's `commandManager` is a RECORDING sink, and that is the one place a
//     stand-in touches a verdict. It is legitimate here because the sink is not
//     the subject: the claim is *"a structural wall change makes the observer
//     EMIT a `ReDetectRoomsCommand` for the right level"*, and the recorder is
//     an independent read-back of the observer's output. Whether re-detection
//     then produces correct rooms is `check-topology-survives`'s subject, is NOT
//     asserted here, and is listed under "cannot see".
//
// ─── CONTROLS (C70 §5.6 / READINESS-GATES §2.2 — an arm with no watched failure
//     is UNPROVEN even when the file exists and exits 0) ─────────────────────
//   POSITIVE (PC1): `doorStore.touch(id)` with no wall in the picture must be
//     observed as exactly one 'update'. If the harness cannot see the effect it
//     is measuring, then "unchanged" and "nothing ran" are the same value — the
//     [[context-data-honesty-family]] defect — and every arm below is vacuous.
//     PC1 failing is a FLOOR, so the gate exits 2, never 0.
//   NEGATIVE, all four run INSIDE the gate on every invocation:
//     N1 — dispose the door tracker, repeat the identical wall move. The
//          comparator must now read 0. This is the arm-A1 comparator watched
//          going red against a deliberately broken tracker.
//     N2 — a wall `update` that changes NO geometry (a `properties` patch) must
//          produce 0 touches. Proves the comparator discriminates rather than
//          counting any wall event at all.
//     N3 — `wallStore.remove()` ALONE must leave the external door/window stores
//          POPULATED. This is the measured fact `DeleteElementCommand.ts:252-259`
//          documents in prose; asserting it makes A5/A6 a statement about the
//          COMMAND's cascade and not about the store's.
//     N4 — a paused `RoomTopologyObserver` must emit 0 redetects for the same
//          structural change that produced one in A7.
//   Every control that fails to go red counts against a FLOOR, so a blind
//   comparator exits 2 MISCONFIGURED. It cannot be absorbed as a finding.
//
// ─── FIRST READING, and the negative-control transcript ──────────────────────
// Recorded per §2.2 in ./tracker-pairs.json (`firstReading`, `negativeControl`).
//
// ─── WHAT THIS GATE CANNOT SEE ───────────────────────────────────────────────
//   (a) Whether the re-anchor is geometrically CORRECT. It asserts the pair is
//       REACHED — one touch per hosted opening — not that the resulting mesh sits
//       at the right transform. No fragment builders are registered here (the
//       same limit `world.ts` declares), so the Geometry link stays UNPROVEN.
//   (b) Anything that only manifests through the CommandBus verbs, for the
//       svg2pdf reason above.
//   (c) Whether room RE-DETECTION is correct — only that it is COMMANDED.
//   (d) The other six of `RoomTopologyObserver`'s seven suppression guards.
//       Only `paused` (N4) and the no-progress signature (A8) are driven.
//       `isBatching`, graph-authoritative, building-generation, drag-in-flight,
//       placement-mode and the post-batch cooldown are NOT exercised, and a
//       regression that leaves one of them stuck ON would not be caught here.
//   (e) Propagation under collaboration merge, and across a save/reload cycle.
//   (f) The trackers' behaviour when the SAME opening is re-homed mid-cascade —
//       that is the freeze test's §FIX-HOSTWALL-TRACKER-REHOME-SEMANTICS case.

import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';
import { reportGate, type GateResult, type Floor } from '../contract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LEDGER = resolve(__dirname, 'tracker-pairs.json');

// ── DOM install, BEFORE any @pryzm module is loaded ──────────────────────────
// Node ships its own `Event`/`EventTarget`/`CustomEvent`, and happy-dom's
// `dispatchEvent` REJECTS a Node `Event` ("parameter 1 is not of type 'Event'").
// `storeEventBus` dispatches on a happy-dom target, so these must be overwritten,
// not merely filled in where absent.
const hw = new Window({ url: 'http://localhost/' }) as unknown as Record<string, unknown>;
for (const k of [
  'document', 'navigator', 'HTMLElement', 'HTMLCanvasElement', 'Event', 'CustomEvent',
  'EventTarget', 'Node', 'location', 'requestAnimationFrame', 'cancelAnimationFrame',
  'getComputedStyle', 'DOMParser', 'Image', 'SVGElement', 'MutationObserver', 'ResizeObserver',
]) {
  const v = hw[k];
  if (v === undefined) continue;
  try { Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true }); }
  catch { /* a non-configurable host global stays as it is; the run reports loudly if it matters */ }
}
Object.defineProperty(globalThis, 'window', { value: hw, configurable: true, writable: true });

/** Copied from ../world.ts's stub ledger — see the header. */
function shimCanvas2D(): void {
  const proto = (globalThis as { HTMLCanvasElement?: { prototype: { getContext: (...a: unknown[]) => unknown } } })
    .HTMLCanvasElement?.prototype;
  if (!proto) return;
  const original = proto.getContext;
  proto.getContext = function (this: unknown, ...args: unknown[]) {
    const real = original.apply(this, args as never);
    if (real) return real;
    return new Proxy({}, {
      get: (_t, prop: string) => {
        if (prop === 'measureText') return () => ({ width: 0 });
        if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 });
        if (prop === 'canvas') return this;
        return () => undefined;
      },
      set: () => true,
    });
  };
}
shimCanvas2D();

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

/** Arms that RAN (established a subject and produced a verdict). */
let armsExercised = 0;
/** Controls that behaved as a control must. */
let controlsProven = 0;
/** Harness failures — an arm that THREW is never merged with "no change". */
const harnessErrors: string[] = [];

const ledger: Ledger | null = existsSync(LEDGER) ? (JSON.parse(readFileSync(LEDGER, 'utf8')) as Ledger) : null;

type P3 = { x: number; y: number; z: number };
const P = (x: number, y: number, z: number): P3 => ({ x, y, z });

async function run(): Promise<void> {
  const wnd = globalThis.window as unknown as Record<string, unknown>;
  wnd.__pryzmInitComplete = true;
  wnd.__wallDragInProgress = false;

  // ── The composed world: real stores, real CommandManager, real trackers ────
  const THREE = await import('@pryzm/renderer-three/three');
  const cam = await import('@pryzm/core-app-model');
  const { BimManager, ProjectContext } = cam as unknown as {
    BimManager: new (s: unknown, r: unknown) => Record<string, unknown>;
    ProjectContext: new () => Record<string, unknown>;
  };
  const { WallStore } = await import('@pryzm/geometry-wall');
  const { SlabStore } = await import('@pryzm/geometry-slab');
  const { ColumnStore } = await import('@pryzm/geometry-column');
  const { StairStore } = await import('@pryzm/geometry-stair');
  const { CurtainWallStore } = await import('@pryzm/geometry-curtain-wall');
  const { RoofStore } = await import('@pryzm/geometry-roof');
  const { PlumbingStore } = await import('@pryzm/geometry-plumbing');
  const { FurnitureStore } = await import('@pryzm/geometry-furniture');
  const { RoomStore, RoomTopologyObserver } = await import('@pryzm/room-topology');
  const { doorStore, DoorDependencyTracker } = await import('@pryzm/geometry-door');
  const { windowStore, WindowDependencyTracker } = await import('@pryzm/geometry-window');
  const registry = await import('@pryzm/command-registry');
  const { CommandManager, DeleteElementCommand } = registry as unknown as {
    CommandManager: new (ctx: unknown) => { execute: (c: unknown) => unknown };
    DeleteElementCommand: new (id: string) => unknown;
  };
  const anyCam = cam as unknown as Record<string, new (...a: unknown[]) => unknown>;

  const projectContext = new ProjectContext();
  const bimManager = new BimManager(new (THREE as unknown as { Scene: new () => unknown }).Scene(), undefined);
  wnd.projectContext = projectContext;
  wnd.bimManager = bimManager;

  // Store construction mirrors ../world.ts, which mirrors initBuilders.ts.
  const wallStore = new WallStore(projectContext as never, bimManager as never);
  const roofStore = new RoofStore(projectContext as never);
  const stores: Record<string, unknown> = {
    wallStore,
    slabStore: new SlabStore(projectContext as never),
    columnStore: new ColumnStore(projectContext as never),
    gridStore: new anyCam.GridStore(projectContext as never),
    stairStore: new StairStore(projectContext as never),
    beamStore: new anyCam.BeamStore(projectContext as never),
    curtainWallStore: new CurtainWallStore(),
    roofStore,
    plumbingStore: new PlumbingStore(),
    furnitureStore: new FurnitureStore(),
    handrailStore: new anyCam.HandrailStore(projectContext as never),
    openingStore: new anyCam.OpeningStore(projectContext as never),
    ceilingStore: new anyCam.CeilingStore(),
    floorStore: new anyCam.FloorStore(),
    roomStore: new RoomStore(projectContext as never, bimManager as never),
  };
  (bimManager as unknown as { setRoofStore(s: unknown): void }).setRoofStore(roofStore as never);
  (bimManager as unknown as { setGridStore(s: unknown): void }).setGridStore(stores.gridStore as never);
  for (const [k, v] of Object.entries(stores)) wnd[k] = v;

  const ctx = { bimManager, projectContext, stores, commandManager: undefined as unknown };
  const cm = new CommandManager(ctx);
  ctx.commandManager = cm;
  wnd.commandManager = cm;

  const levels = (bimManager as unknown as { getLevels(): Array<{ id: string }> }).getLevels() ?? [];
  const LEVEL = levels[0]?.id;
  floors.push({ what: 'levels the composed BimManager reports', measured: levels.length, min: 1 });
  if (!LEVEL) return;

  // Trackers, constructed exactly as production does:
  //   initBuilders.ts:721 / :725 — new Door/WindowDependencyTracker(cmRef, wallStore)
  const cmRef = { current: cm as unknown as { execute: (c: unknown, m?: unknown) => unknown } };
  let doorTracker = new DoorDependencyTracker(cmRef as never, wallStore as never);
  let windowTracker = new WindowDependencyTracker(cmRef as never, wallStore as never);
  floors.push({
    what: 'bespoke trackers constructed against the real WallStore',
    measured: [doorTracker, windowTracker].filter(Boolean).length, min: 2,
  });

  // ── Fixtures ──────────────────────────────────────────────────────────────
  let seq = 0;
  const mkWall = (childIds: string[], openings: unknown[]): Record<string, unknown> => ({
    id: `w_${seq++}`, type: 'wall', levelId: LEVEL, properties: {},
    childrenIds: [...childIds],
    baseLine: [P(0, 0, 0), P(5, 0, 0)],
    height: 3, thickness: 0.2, baseOffset: 0, openings,
    metadata: { createdAt: 1, modifiedAt: 1, createdBy: 'cert', version: 1 },
  });

  /** Seed one wall hosting one door and one window; returns the wall id. */
  const seedHostWall = (): string => {
    const w = mkWall(['d', 'n'], [
      { id: 'op_d', elementId: 'd', type: 'door', offset: 1.5, width: 0.9, height: 2.1, sillHeight: 0 },
      { id: 'op_n', elementId: 'n', type: 'window', offset: 3.5, width: 1.0, height: 1.2, sillHeight: 0.9 },
    ]);
    wallStore.add(w as never);
    doorStore.add({ id: 'd', openingId: 'op_d', wallId: w.id, offset: 1.5, width: 0.9, height: 2.1, sillHeight: 0 } as never);
    windowStore.add({ id: 'n', openingId: 'op_n', wallId: w.id, offset: 3.5, width: 1.0, height: 1.2, sillHeight: 0.9 } as never);
    doorTracker.bootstrap();
    windowTracker.bootstrap();
    return w.id as string;
  };

  const reset = (): void => {
    for (const w of wallStore.getAll()) wallStore.remove(w.id);
    doorStore.clear?.();
    windowStore.clear?.();
  };

  /** Count opening 'update' emissions (the re-anchor channel) while `fn` runs. */
  const countTouches = (fn: () => void): { door: number; window: number } => {
    const c = { door: 0, window: 0 };
    const ud = doorStore.subscribe((ev: string) => { if (ev === 'update') c.door++; });
    const uw = windowStore.subscribe((ev: string) => { if (ev === 'update') c.window++; });
    try { fn(); } finally { ud?.(); uw?.(); }
    return c;
  };

  const arm = (name: string, ok: boolean, detail: string): void => {
    armsExercised++;
    if (ok) lines.push(`✓  ${name}: ${detail}`);
    else { findingNames.push(name); lines.push(`❌ ${name}: ${detail}`); }
  };
  const control = (name: string, proven: boolean, detail: string): void => {
    if (proven) { controlsProven++; lines.push(`   ⟂ CONTROL ${name} PROVEN — ${detail}`); }
    else lines.push(`   ⟂ CONTROL ${name} FAILED — ${detail}  ← the comparator is BLIND; this is a FLOOR, not a finding.`);
  };

  // ══ PC1 · POSITIVE CONTROL ═══════════════════════════════════════════════
  // Can this harness observe an opening re-anchor AT ALL? If not, every
  // "0 divergences" below is the empty-seed lie wearing a tracker's uniform.
  let pc1 = 0;
  try {
    reset();
    const wid = seedHostWall();
    const c = countTouches(() => { doorStore.touch('d'); });
    pc1 = c.door === 1 ? 1 : 0;
    control('PC1 (positive)', pc1 === 1,
      `a bare doorStore.touch() on the seeded door emitted ${c.door} 'update'(s) — expected exactly 1. ` +
      `Host wall ${wid}; index=[${doorTracker.getDoorIdsForWall(wid).join(',')}].`);
  } catch (e) { harnessErrors.push('PC1: ' + String(e).slice(0, 200)); }
  floors.push({ what: 'PC1 positive control — the harness can observe a re-anchor', measured: pc1, min: 1 });

  // ══ A1/A2 · wall MOVE → hosted opening re-anchors ════════════════════════
  // The DoorDependencyTracker / WindowDependencyTracker path. Partially pinned
  // by wallMoveHostedOpeningCascadeFreeze.test.ts — kept here because A1 is also
  // the subject N1 breaks, and a negative control needs a live positive beside it.
  let a1Wall = '';
  try {
    reset();
    a1Wall = seedHostWall();
    const c = countTouches(() => {
      wallStore.update(a1Wall, { baseLine: [P(1, 0, 0), P(6, 0, 0)] } as never);
    });
    arm('pair:door/window · wall-move → re-anchor', c.door === 1 && c.window === 1,
      `baseLine move on a wall hosting 1 door + 1 window → door touches=${c.door} (want 1), ` +
      `window touches=${c.window} (want 1). 0 means the tracker no longer reaches its pair; ` +
      '>1 means the re-entrancy guard (§FIX-HOSTWALL-CASCADE-SET-REENTRANCY) regressed.');
  } catch (e) { harnessErrors.push('A1: ' + String(e).slice(0, 200)); }

  // ══ N1 · NEGATIVE CONTROL — break the tracker, watch A1's comparator go red ══
  try {
    doorTracker.dispose();
    const c = countTouches(() => {
      wallStore.update(a1Wall, { baseLine: [P(2, 0, 0), P(7, 0, 0)] } as never);
    });
    control('N1 (negative · tracker disposed)', c.door === 0,
      `with DoorDependencyTracker.dispose() called, the identical wall move produced ${c.door} door ` +
      "touch(es) — a correct comparator reads 0 here and would report arm A1 as a finding. " +
      `(The window tracker is untouched and still fired ${c.window}, proving the move itself happened.)`);
    doorTracker = new DoorDependencyTracker(cmRef as never, wallStore as never);
    doorTracker.bootstrap();
  } catch (e) { harnessErrors.push('N1: ' + String(e).slice(0, 200)); }

  // ══ A3 · wall HEIGHT change → openings respond ═══════════════════════════
  // `_wallGeometryChanged` branch 1. NOT driven by any existing suite.
  try {
    reset();
    const wid = seedHostWall();
    const c = countTouches(() => { wallStore.update(wid, { height: 4.2 } as never); });
    arm('pair:door/window · wall-height → re-anchor', c.door === 1 && c.window === 1,
      `height 3 → 4.2 produced door=${c.door} window=${c.window} touch(es) (want 1 each). ` +
      'This is the `prev.height !== next.height` branch of _wallGeometryChanged — the only ' +
      'coverage it has anywhere in the repository.');
  } catch (e) { harnessErrors.push('A3: ' + String(e).slice(0, 200)); }

  // ══ A4 · wall THICKNESS change → openings respond ════════════════════════
  try {
    reset();
    const wid = seedHostWall();
    const c = countTouches(() => { wallStore.update(wid, { thickness: 0.35 } as never); });
    arm('pair:door/window · wall-thickness → re-anchor', c.door === 1 && c.window === 1,
      `thickness 0.2 → 0.35 produced door=${c.door} window=${c.window} touch(es) (want 1 each). ` +
      'A thickness change moves the opening reveal in world space; the branch is untested elsewhere.');
  } catch (e) { harnessErrors.push('A4: ' + String(e).slice(0, 200)); }

  // ══ N2 · NEGATIVE CONTROL — an input the tracker MUST ignore ═════════════
  try {
    reset();
    const wid = seedHostWall();
    const c = countTouches(() => { wallStore.update(wid, { properties: { note: 'cert' } } as never); });
    control('N2 (negative · non-geometry patch)', c.door === 0 && c.window === 0,
      `a wall 'update' carrying only a \`properties\` patch produced door=${c.door} window=${c.window} ` +
      'touch(es) — must be 0. A comparator that counts any wall event would read 1 here and would ' +
      'report A1/A3/A4 green no matter what _wallGeometryChanged does.');
  } catch (e) { harnessErrors.push('N2: ' + String(e).slice(0, 200)); }

  // ══ N3 · NEGATIVE CONTROL — the store alone must NOT cascade ═════════════
  // DeleteElementCommand.ts:252-259 documents this in prose. Asserting it makes
  // A5/A6 a claim about the COMMAND, not an accident of the store.
  try {
    reset();
    const wid = seedHostWall();
    wallStore.remove(wid);
    const survived = doorStore.getAll().length === 1 && windowStore.getAll().length === 1;
    control('N3 (negative · store-only delete)', survived,
      `wallStore.remove() alone left doors=${doorStore.getAll().length} windows=${windowStore.getAll().length} ` +
      'in the EXTERNAL stores — expected 1 and 1. WallStore.remove() only cleans its own internal ' +
      'doors/windows maps (WallStore.ts:856-877 → removeOpening:1078-1088); if this reads 0 the ' +
      'A5/A6 comparator cannot tell the command\'s cascade from the store\'s and is not measuring ' +
      'DeleteElementCommand at all.');
  } catch (e) { harnessErrors.push('N3: ' + String(e).slice(0, 200)); }

  // ══ A5/A6 · wall DELETE → doors and windows cascade-delete ═══════════════
  // Driven through the REAL DeleteElementCommand on the REAL CommandManager.
  try {
    reset();
    const wid = seedHostWall();
    const before = { d: doorStore.getAll().length, n: windowStore.getAll().length };
    await (cm.execute(new DeleteElementCommand(wid)) as Promise<unknown>);
    const after = { d: doorStore.getAll().length, n: windowStore.getAll().length };
    arm('pair:cascade-delete · wall-delete → door removed', before.d === 1 && after.d === 0,
      `DeleteElementCommand(wall) — external doorStore ${before.d} → ${after.d} (want 1 → 0). ` +
      '§CASCADE-DELETE, DeleteElementCommand.ts:258. Without it DoorBuilder never receives a ' +
      "'remove' event and the hosted 3D mesh outlives its wall.");
    arm('pair:cascade-delete · wall-delete → window removed', before.n === 1 && after.n === 0,
      `DeleteElementCommand(wall) — external windowStore ${before.n} → ${after.n} (want 1 → 0). ` +
      'DeleteElementCommand.ts:259.');
    arm('pair:cascade-delete · tracker index purged', doorTracker.getDoorIdsForWall(wid).length === 0
      && windowTracker.getWindowIdsForWall(wid).length === 0,
      `after the delete the tracker indices for ${wid} hold ` +
      `door=[${doorTracker.getDoorIdsForWall(wid).join(',')}] window=[${windowTracker.getWindowIdsForWall(wid).join(',')}] ` +
      '— both must be empty or the index leaks across project lifetimes.');
  } catch (e) { harnessErrors.push('A5/A6: ' + String(e).slice(0, 300)); }

  // ══ A7 · structural wall change → RoomTopologyObserver redetects ═════════
  const emitted: Array<{ name: string; levelId: unknown }> = [];
  const recordingCm = {
    execute: (c: { constructor?: { name?: string }; levelId?: unknown }) => {
      emitted.push({ name: c?.constructor?.name ?? '?', levelId: (c as { levelId?: unknown })?.levelId });
    },
  };
  let observer: { attach(): void; pause(): void; resume(): void; dispose(): void } | null = null;
  try {
    reset();
    // initTools.ts:2192 — (wallStore, roomStore, commandManager, engine, bimManager, …)
    observer = new (RoomTopologyObserver as unknown as new (...a: unknown[]) => never)(
      wallStore, stores.roomStore, recordingCm, {}, bimManager,
    ) as unknown as typeof observer;
    observer!.attach();
    emitted.length = 0;
    wallStore.add(mkWall([], []) as never);
    await new Promise((r) => setTimeout(r, 450));   // DEBOUNCE_MS 150 + slack
    const hits = emitted.filter((e) => e.name === 'ReDetectRoomsCommand');
    arm('pair:room-topology · structural wall change → redetect', hits.length === 1,
      `a wall 'add' on level ${LEVEL} produced ${hits.length} ReDetectRoomsCommand(s) after the 150 ms ` +
      `debounce (want exactly 1); all emissions: [${emitted.map((e) => e.name).join(',') || 'none'}]. ` +
      '0 means the observer no longer reaches its pair; >1 means the debounce/coalesce collapsed.');
  } catch (e) { harnessErrors.push('A7: ' + String(e).slice(0, 300)); }

  // ══ N4 · NEGATIVE CONTROL — a paused observer must emit nothing ══════════
  try {
    observer?.pause();
    emitted.length = 0;
    wallStore.add(mkWall([], []) as never);
    await new Promise((r) => setTimeout(r, 450));
    control('N4 (negative · observer paused)', emitted.length === 0,
      `with pause() held, the same structural change produced ${emitted.length} emission(s) — must be 0. ` +
      'A7 reading 1 while N4 reads 0 is what makes A7 a measurement of the observer rather than of setTimeout.');
    observer?.resume();
  } catch (e) { harnessErrors.push('N4: ' + String(e).slice(0, 200)); }

  // ══ A8 · the no-progress SIGNATURE must cover the fields that re-anchor ══
  // RoomTopologyObserver gates redetects on `_computeWallSig` — id, baseline X/Z,
  // thickness, and (since §PR-09-WALLSIG-HEIGHT, 2026-08-17) HEIGHT. Baseline `y`
  // is still ABSENT from it, while BOTH trackers treat height and y as
  // geometry-changing (_wallGeometryChanged). So a wall edit that the opening
  // cascade considers a real move is, to the observer, byte-identical geometry:
  // the committed-path no-progress gate drops it, and it counts toward the
  // same-signature circuit breaker. Asserted as an arm because it is a divergence
  // between two halves of one propagation spine, measured, not argued.
  try {
    reset();
    const wid = seedHostWall();
    const sigOf = (): string =>
      (observer as unknown as { _computeWallSig(l: string): string })._computeWallSig(LEVEL);
    // ⚠ EACH PROBE IS COMPARED AGAINST THE SIGNATURE TAKEN IMMEDIATELY BEFORE ITS OWN EDIT,
    // never against `base`. This arm used to read `afterY !== base` and `afterThickness !==
    // base`, which measures the ACCUMULATED edits, not the field named in the sentence: the
    // height edit is still applied when the y probe runs, so the moment height entered the
    // signature the y and thickness readings went `true` FOR FREE and the whole arm went
    // green on an artefact. MEASURED 2026-08-17, the run §PR-09-WALLSIG-HEIGHT landed:
    // `height-only edit changes it: true; baseline-y-only edit changes it: true` against a
    // printed signature of "n1|w_9:0,0>5000,0#200^3000" — which contains no y term at all.
    // A comparator that cannot distinguish "this field is covered" from "some earlier field
    // is covered" is not a comparator (C70 §5.6). Tightened, never loosened: this can only
    // turn readings from true to false.
    const base = sigOf();
    wallStore.update(wid, { height: 4.9 } as never);
    const afterHeight = sigOf();
    wallStore.update(wid, { baseLine: [P(0, 2, 0), P(5, 2, 0)] } as never);
    const afterY = sigOf();
    wallStore.update(wid, { thickness: 0.4 } as never);
    const afterThickness = sigOf();
    const heightCovered = afterHeight !== base;
    const yCovered = afterY !== afterHeight;
    const thicknessCovered = afterThickness !== afterY;
    const covered = heightCovered && yCovered;
    arm('pair:room-topology · no-progress signature covers the re-anchor fields', covered,
      `_computeWallSig = ${JSON.stringify(base)} → ${JSON.stringify(afterThickness)}. ` +
      `height-only edit changes it: ${heightCovered}; ` +
      `baseline-y-only edit changes it: ${yCovered}; thickness edit changes it: ${thicknessCovered} ` +
      '(each measured against the signature immediately BEFORE that edit, so the readings are ' +
      'per-field and not cumulative). ' +
      'Both trackers rebuild hosted openings for height and y (DoorDependencyTracker.ts:131-139), so an ' +
      'edit that is a real geometry change to the cascade is invisible to the observer\'s no-progress gate ' +
      '(RoomTopologyObserver.ts:255-258) and to its circuit breaker (:525-539). REPORTED, NOT WORKED AROUND: ' +
      'HEIGHT was ruled in by the founder and is now covered (§PR-09-WALLSIG-HEIGHT, folded as integer ' +
      'millimetres). BASELINE `y` is a SEPARATE ruling — WallTypes.ts §WALL-AUDIT-2026-M7 calls ' +
      '`baseLine[*].y` a stale world-space mirror of `level.elevation`, and the authored vertical ' +
      'placement is `baseOffset`, which neither this signature nor `_wallGeometryChanged` reads — ' +
      'see the handoff in tracker-pairs.json.');
  } catch (e) { harnessErrors.push('A8: ' + String(e).slice(0, 300)); }

  try { observer?.dispose(); } catch { /* teardown */ }
  try { doorTracker.dispose(); windowTracker.dispose(); } catch { /* teardown */ }
}

await run().catch((e) => { harnessErrors.push('run(): ' + String(e).slice(0, 400)); });

// ── FLOORS ───────────────────────────────────────────────────────────────────
// Every floor sits BELOW its measured reading, per floors.ts's rule: floors are
// misconfiguration detectors, not difficulty settings. Lowering one is the same
// act as deleting the gate (C70 §5.3).
floors.push({ what: 'ledger tracker-pairs.json present', measured: ledger ? 1 : 0, min: 1 });
floors.push({ what: 'propagation pairs EXERCISED (an executed drive + read-back)', measured: armsExercised, min: 8 });
floors.push({ what: 'controls that behaved as controls (PC1 + N1..N4)', measured: controlsProven, min: 5 });
floors.push({ what: 'arms free of a harness error (a THROW is never "no change")', measured: harnessErrors.length === 0 ? 1 : 0, min: 1 });
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
  `SUBJECT SIZE: ${armsExercised} pair(s) exercised, ${controlsProven}/5 controls proven, ` +
  `${findingNames.length} finding(s). A count of divergences without a count of what was compared is the empty-seed lie.`,
);

process.exit(reportGate({
  gate: 'check-propagation-trackers-reach',
  floors,
  lines,
  findings: findingNames.length,
  declared: ledger?.declaredFindings.length ?? 0,
  findingNames,
  stale,
}));
