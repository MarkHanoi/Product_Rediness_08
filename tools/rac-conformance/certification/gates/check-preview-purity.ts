// ─── GATE · check-preview-purity  (G-REASON-01) ──────────────────────────────
//
// BIM30 R3 of docs/03-execution/plans/BIM30-REASONING-LOOP-PLAN.md, enforcing the
// PROHIBITION of STR-06 §4 / ADR-0322 §3:
//
//   "A successful preview leaves authoritative stores, event streams, undo state,
//    dirty state and externally observable command state unchanged. A byte-identical
//    final snapshot is NOT proof of non-mutation."
//
// So this gate does NOT merely diff a before/after snapshot. It drives a REAL `wall.move`
// preview through the production preview surface (`ConsequencePreviewService` →
// `WallMoveConsequencePlanner`, imported here — both are pure-logic modules whose every
// package import is `import type`, erased at runtime) and asserts FOUR invariants, each
// paired with a POSITIVE CONTROL that proves the harness could actually observe the
// violation it is checking for:
//
//   1. stores byte-identical across the preview   (control: a real execute DOES change them)
//   2. zero events emitted during the preview      (control: a real execute emits)
//   3. undo-stack depth unchanged                  (control: a real execute pushes)
//   4. dirty flag unchanged                        (control: a real execute sets it)
//
// A check that cannot be shown to fail has not been shown to work (contract.ts §C10). The
// four controls are FLOORS: if any control fails to register its mutation, the harness has
// not established that its detectors have teeth, and the gate exits 2 (MISCONFIGURED) —
// never 0. And every run drives a NEGATIVE CONTROL: a deliberately-impure "preview" that
// writes to the store is fed through the SAME purity checker, which must FLAG it; if it
// does not, that too is MISCONFIGURED. A gate never watched failing is not a gate.
//
// Node-native, no external binaries; the planner/service are loaded directly.

import { reportGate, type GateResult, type Floor } from '../contract.js';
import { WallMoveConsequencePlanner } from '../../../../apps/editor/src/engine/consequence/WallMoveConsequencePlanner.js';
import { ConsequencePreviewService } from '../../../../apps/editor/src/engine/consequence/ConsequencePreviewService.js';

// ── A self-contained instrumented world ──────────────────────────────────────
// Plain in-memory stores plus the three externally-observable mutation channels the
// prohibition names: an event log, an undo stack, and a dirty flag. The preview path has
// NO reference to any of these — which is the structural fact this gate demonstrates.

type Pt = { x: number; y: number; z: number };
interface Wall { id: string; baseLine: [Pt, Pt]; levelId: string; openings: unknown[] }

interface World {
  walls: Wall[];
  events: string[];
  undo: string[];
  dirty: boolean;
}

function freshWorld(): World {
  return {
    walls: [{ id: 'wall-1', baseLine: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }], levelId: 'L0', openings: [] }],
    events: [],
    undo: [],
    dirty: false,
  };
}

/** Read-only PlanningContext over a world's stores (getAll/getById only — no write surface). */
function contextFor(world: World) {
  return {
    getStore(storeId: string) {
      if (storeId !== 'wall') return undefined;
      return {
        getAll: () => world.walls as readonly unknown[],
        getById: (id: string) => world.walls.find((w) => w.id === id) ?? null,
      };
    },
  };
}

const TARGET_BASELINE = [{ x: 0.3, y: 0, z: 0 }, { x: 5.3, y: 0, z: 0 }];
const COMMAND = { type: 'wall.move' as const, payload: { id: 'wall-1', baseLine: TARGET_BASELINE } };

/** The production preview service, wired to the real planner with in-memory doubles. */
function buildService(world: World): ConsequencePreviewService {
  const planner = new WallMoveConsequencePlanner({
    occupancy: { planOpeningRefit: () => ({ ok: true, refusals: [], relocations: [] }) },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    joinedWalls: { getJoinedWalls: (wallId: string) => ({ ok: true, wallId, joinedWallIds: [] }) } as any,
    validator: { validateAll: () => [] },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  const planners = new Map<string, WallMoveConsequencePlanner>();
  planners.set('wall.move', planner);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new ConsequencePreviewService(planners as any, () => contextFor(world) as any);
}

// ── The four mutation channels, as pure observers ────────────────────────────
const snapStores = (w: World): string => JSON.stringify(w.walls);

interface Snapshot { stores: string; events: number; undo: number; dirty: boolean }
const snapshot = (w: World): Snapshot => ({ stores: snapStores(w), events: w.events.length, undo: w.undo.length, dirty: w.dirty });

/** The purity verdict: which of the four channels a preview left DIFFERENT (a violation). */
function violations(before: Snapshot, after: World): string[] {
  const v: string[] = [];
  if (snapStores(after) !== before.stores) v.push('stores mutated');
  if (after.events.length !== before.events) v.push('events emitted');
  if (after.undo.length !== before.undo) v.push('undo stack changed');
  if (after.dirty !== before.dirty) v.push('dirty flag changed');
  return v;
}

// ── A real execute (the POSITIVE control) and an impure preview (the NEGATIVE one) ──
function realExecute(world: World): void {
  world.walls[0]!.baseLine = TARGET_BASELINE as [Pt, Pt]; // authoritative store write
  world.events.push('wall.updateBaseline');                // event emitted
  world.undo.push('wall.updateBaseline');                  // undo pushed
  world.dirty = true;                                      // dirty set
}

function impurePreview(world: World): void {
  // A "preview" that cheats by writing to the store — exactly what G-REASON-01 forbids.
  world.walls[0]!.baseLine = TARGET_BASELINE as [Pt, Pt];
}

// ── Run ───────────────────────────────────────────────────────────────────────
async function run(): Promise<GateResult> {
  const floors: Floor[] = [];
  const lines: string[] = [];
  const findingNames: string[] = [];

  // 1) Drive the REAL preview and capture its purity verdict.
  const world = freshWorld();
  const before = snapshot(world);
  const service = buildService(world);
  const plan = await service.preview(COMMAND);
  const planProduced = plan ? 1 : 0;
  const realViolations = violations(before, world);

  // 2) POSITIVE controls — prove each detector has teeth on a real mutation.
  const cw = freshWorld();
  const cBefore = snapshot(cw);
  realExecute(cw);
  const storeCtl = snapStores(cw) !== cBefore.stores ? 1 : 0;
  const eventCtl = cw.events.length > cBefore.events ? 1 : 0;
  const undoCtl = cw.undo.length > cBefore.undo ? 1 : 0;
  const dirtyCtl = cw.dirty !== cBefore.dirty ? 1 : 0;

  // 3) NEGATIVE control — an impure preview MUST be flagged by the same checker.
  const nw = freshWorld();
  const nBefore = snapshot(nw);
  impurePreview(nw);
  const negCaught = violations(nBefore, nw).length > 0 ? 1 : 0;

  // ── FLOORS (subject-establishment; any unmet ⇒ exit 2) ───────────────────────
  floors.push({ what: 'planner + service loaded and preview produced a plan', measured: planProduced, min: 1 });
  floors.push({ what: 'POSITIVE control: a real execute changed the stores (detector has teeth)', measured: storeCtl, min: 1 });
  floors.push({ what: 'POSITIVE control: a real execute emitted an event', measured: eventCtl, min: 1 });
  floors.push({ what: 'POSITIVE control: a real execute pushed undo', measured: undoCtl, min: 1 });
  floors.push({ what: 'POSITIVE control: a real execute set the dirty flag', measured: dirtyCtl, min: 1 });
  floors.push({ what: 'NEGATIVE control: an impure preview was FLAGGED by the checker', measured: negCaught, min: 1 });

  // ── FINDINGS — the real preview must leave all four channels unchanged ─────────
  for (const v of realViolations) findingNames.push(`real wall.move preview: ${v}`);

  lines.push(`real preview → plan ${plan ? plan.planId : 'NULL'} · changed=${plan ? plan.changed.length : 0} · undetermined=${plan ? plan.undetermined.length : 0}`);
  lines.push(`real-preview purity violations: ${realViolations.length === 0 ? 'NONE (stores·events·undo·dirty all unchanged)' : realViolations.join(', ')}`);
  lines.push(`positive controls (must all be 1): store=${storeCtl} event=${eventCtl} undo=${undoCtl} dirty=${dirtyCtl}`);
  lines.push(`negative control (impure preview caught): ${negCaught === 1 ? 'YES' : 'NO'}`);

  return {
    gate: 'check-preview-purity',
    floors,
    lines,
    findings: findingNames.length,
    declared: 0, // hard-0: preview purity is an invariant, not a ratchet.
    findingNames,
  };
}

run()
  .then((r) => process.exit(reportGate(r)))
  .catch((e) => {
    // A gate that could not even run has measured nothing — file it as MISCONFIGURED,
    // never as clean (contract.ts §C10 / L-774).
    console.error('check-preview-purity: harness threw — MISCONFIGURED\n', e);
    process.exit(2);
  });
