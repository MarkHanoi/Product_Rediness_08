// ─── GATE · check-execution-plan-agreement  (G-REASON-03) ────────────────────
//
// BIM30 R4 of docs/03-execution/plans/BIM30-REASONING-LOOP-PLAN.md — the plan doc
// names this gate's subject in R4's own words: "**G-REASON-03 execution-plan
// agreement**: predicted ≈ actual with `unexpected / missing / undetermined`
// explicitly categorised. Plan-fidelity divergence is the named failure class."
// (STR-06 §17 lists it under the same name; the working brief called it the
// "plan-fidelity" gate — same gate, and the plan doc's name wins.)
//
// WHAT IT DRIVES — the REAL loop, preview → plan → execute → report, through
// production code end to end:
//
//   ConsequencePreviewService → WallMoveConsequencePlanner   (R2/R3, production)
//     → ConsequenceExecutionService                          (R4, production)
//       → the REAL CommandBus (@pryzm/command-bus)
//         → the REAL plugins/wall UpdateWallBaselineHandler (`wall.updateBaseline`,
//           the live wall-move verb — L-49; `wall.move` itself is the refused dead
//           verb, §FIX-DEAD-MOVE-VERB-REFUSE)
//           → the REAL window.commandManager bridge → UpdateWallBaselineCommand
//             → the REAL geometry WallStore (the authoritative store)
//
// FOUR CLAUSES, each with the control that proves the harness could see it fail:
//   (a) a bound plan yields a ConsequenceReport that reconciles EVERY plan item —
//       changed ids land in actual∪missing, and every plan-time UNDETERMINED item
//       is carried as `undetermined-at-plan-time`, never scored, never dropped.
//   (b) POSITIVE CONTROL — deliberate divergence: state is mutated between plan
//       and execute in a way the planner CANNOT see (a hosted door is deleted from
//       its own store; the planner's hash covers walls + plan body, neither of
//       which moves), so a predicted relocation cannot happen. The report MUST
//       name it (`plan-fidelity-divergence`, `missing`), not absorb it.
//   (c) NEGATIVE CONTROL — staleness: state the planner CAN see (the wall itself)
//       is mutated between plan and execute. Binding MUST refuse with the typed
//       `PLAN_STALE`, the command MUST still execute plan-less (today's behaviour
//       preserved), and the stale plan MUST be carried as evidence, never claimed
//       as the prediction.
//   (d) plan-less execute works and reports the TYPED ABSENCE of a prediction
//       (`NO_PLAN_SUPPLIED`) — never an after-the-fact fabricated one.
//
// ─── STUB LEDGER, declared loudly (world.ts doctrine) ────────────────────────
//   • happy-dom installed in-process (certify.ts spawns gates via `npx tsx`; the
//     measured path is store/bus/command code — nothing reads a pixel).
//   • Planner deps are doubles (same as check-preview-purity, the landed
//     precedent): occupancy is a scripted `planOpeningRefit`, joinedWalls answers
//     determined-empty, the validator answers no-violations. The EXECUTION side is
//     real end to end; the doubles script the PREDICTION side so each clause's
//     input plan is deterministic. The real-occupancy / real-junction /
//     linked-room prediction arms are R5+ scope and are NOT claimed here.
//   • Rooms are seeded WITHOUT wall linkage, so the room-boundary branch declares
//     its honest UNDETERMINED — this gate proves the R4 reconciliation machinery,
//     not room-propagation completeness (roadmap Phase 5 substrate).

import { Window } from 'happy-dom';
import { reportGate, type GateResult, type Floor } from '../contract.js';

// ── DOM install, BEFORE any @pryzm module loads (trackers-gate pattern) ───────
const hw = new Window({ url: 'http://localhost/' }) as unknown as Record<string, unknown>;
for (const k of [
  'document', 'navigator', 'HTMLElement', 'HTMLCanvasElement', 'Event', 'CustomEvent',
  'EventTarget', 'Node', 'location', 'requestAnimationFrame', 'cancelAnimationFrame',
  'getComputedStyle', 'DOMParser', 'Image', 'SVGElement', 'MutationObserver', 'ResizeObserver',
]) {
  const v = hw[k];
  if (v === undefined) continue;
  try { Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true }); }
  catch { /* non-configurable host global — the run reports loudly if it matters */ }
}
Object.defineProperty(globalThis, 'window', { value: hw, configurable: true, writable: true });

/** Copied from ../world.ts's stub ledger — happy-dom canvas 2D shim. */
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

type P3 = { x: number; y: number; z: number };
const P = (x: number, y: number, z: number): P3 => ({ x, y, z });

const floors: Floor[] = [];
const lines: string[] = [];
const findingNames: string[] = [];
const harnessErrors: string[] = [];

async function run(): Promise<GateResult> {
  const wnd = globalThis.window as unknown as Record<string, unknown>;
  wnd.__pryzmInitComplete = true;

  // ── The composed world: real stores, real CommandManager, real bus ──────────
  const THREE = await import('@pryzm/renderer-three/three');
  const cam = await import('@pryzm/core-app-model');
  const { BimManager, ProjectContext } = cam as unknown as {
    BimManager: new (s: unknown, r: unknown) => Record<string, unknown>;
    ProjectContext: new () => Record<string, unknown>;
  };
  const { WallStore } = await import('@pryzm/geometry-wall');
  const { StairStore } = await import('@pryzm/geometry-stair');
  const { RoomStore } = await import('@pryzm/room-topology');
  const { doorStore } = await import('@pryzm/geometry-door');
  const { windowStore } = await import('@pryzm/geometry-window');
  const { CommandManager } = (await import('@pryzm/command-registry')) as unknown as {
    CommandManager: new (ctx: unknown) => { execute: (c: unknown) => unknown };
  };
  const { CommandBus } = await import('@pryzm/command-bus');

  // The R2/R3/R4 PRODUCTION modules under test (pure-logic files; package imports
  // inside them are `import type`, erased — check-preview-purity precedent).
  const { WallMoveConsequencePlanner } = await import(
    '../../../../apps/editor/src/engine/consequence/WallMoveConsequencePlanner.js');
  const { ConsequencePreviewService } = await import(
    '../../../../apps/editor/src/engine/consequence/ConsequencePreviewService.js');
  const { ConsequenceExecutionService } = await import(
    '../../../../apps/editor/src/engine/consequence/ConsequenceExecutionService.js');

  const projectContext = new ProjectContext();
  const bimManager = new BimManager(new (THREE as unknown as { Scene: new () => unknown }).Scene(), undefined);
  wnd.projectContext = projectContext;
  wnd.bimManager = bimManager;

  const wallStore = new WallStore(projectContext as never, bimManager as never);
  const roomStore = new RoomStore(projectContext as never, bimManager as never);
  const stairStore = new StairStore(projectContext as never);
  const stores: Record<string, unknown> = { wallStore, roomStore, stairStore, doorStore, windowStore };
  for (const [k, v] of Object.entries(stores)) wnd[k] = v;

  const ctx = { bimManager, projectContext, stores, commandManager: undefined as unknown };
  const cm = new CommandManager(ctx);
  ctx.commandManager = cm;
  wnd.commandManager = cm;

  const levels = (bimManager as unknown as { getLevels(): Array<{ id: string }> }).getLevels() ?? [];
  const LEVEL = levels[0]?.id ?? 'L0';

  // Real CommandBus, wired as ../world.ts wires it (detached DTO sinks — exactly
  // production's storesAsRecordView shape; nothing reads a verdict from them).
  const dtoStores: Record<string, Record<string, unknown>> = { wall: {}, room: {}, door: {}, window: {}, stair: {} };
  const bus = new CommandBus({
    audit: { actorId: 'cert-harness', projectId: 'g-reason-03', clientId: 'node' },
    storesProvider: () => dtoStores as never,
  } as never);

  // The REAL live wall-move verb handler (plugins/wall — the L-49 pinned bridge).
  let handlerRegistered = 0;
  try {
    const mod = await import('../../../../plugins/wall/src/handlers/UpdateWallBaseline.js') as Record<string, unknown>;
    for (const v of Object.values(mod)) {
      if (v && typeof v === 'object' && (v as { type?: string }).type === 'wall.updateBaseline') {
        bus.register(v as never);
        handlerRegistered = 1;
        break;
      }
    }
  } catch (e) { harnessErrors.push('handler import: ' + String(e).slice(0, 300)); }
  floors.push({ what: 'REAL wall.updateBaseline handler registered on the REAL bus', measured: handlerRegistered, min: 1 });

  // ── PlanningContext over the REAL stores (read-only adapters) ────────────────
  const asView = (s: { getAll(): unknown[]; getById?: (id: string) => unknown }) => ({
    getAll: () => s.getAll() as readonly unknown[],
    getById: (id: string) => (typeof s.getById === 'function' ? s.getById(id) ?? null : null),
  });
  const byId: Record<string, { getAll(): unknown[]; getById?: (id: string) => unknown }> = {
    wall: wallStore as never, room: roomStore as never, stair: stairStore as never,
    door: doorStore as never, window: windowStore as never,
  };
  const planningContext = () => ({
    getStore: (id: string) => (byId[id] ? asView(byId[id]!) : undefined),
  });

  // ── Planner with scripted PREDICTION deps (stub ledger above) ────────────────
  // `relocations` is mutable so clause (b) can script a predicted relocation.
  const scripted: { relocations: Array<{ opening: { id: string; elementId?: string } }> } = { relocations: [] };
  const planner = new WallMoveConsequencePlanner({
    occupancy: { planOpeningRefit: () => ({ ok: true, refusals: [], relocations: scripted.relocations }) },
    joinedWalls: { getJoinedWalls: (wallId: string) => ({ ok: true, wallId, joinedWallIds: [] }) },
    validator: { validateAll: () => [] },
  } as never);
  const planners = new Map([['wall.move', planner]]);
  const preview = new ConsequencePreviewService(planners as never, planningContext as never);
  const executor = new ConsequenceExecutionService({
    bus: bus as never,
    planners: planners as never,
    context: planningContext as never,
    violations: () => [], // scripted validator ⇒ the measured actual delta is empty by construction
  });

  // ── Fixtures ─────────────────────────────────────────────────────────────────
  let seq = 0;
  const mkWall = (): Record<string, unknown> => ({
    id: `w_${seq++}`, type: 'wall', levelId: LEVEL, properties: {}, childrenIds: [],
    baseLine: [P(0, 0, 0), P(5, 0, 0)], height: 3, thickness: 0.2, baseOffset: 0, openings: [],
    metadata: { createdAt: 1, modifiedAt: 1, createdBy: 'cert', version: 1 },
  });
  const seedWall = (): string => { const w = mkWall(); wallStore.add(w as never); return w.id as string; };
  const movePayload = (wid: string, dz: number) => {
    const wall = wallStore.getById(wid) as { baseLine: [P3, P3] };
    const prev = JSON.parse(JSON.stringify(wall.baseLine)) as [P3, P3];
    const next = prev.map((p) => ({ x: p.x, y: p.y ?? 0, z: p.z + dz })) as [P3, P3];
    return { wallId: wid, newBaseLine: next, prevBaseLine: prev };
  };
  const baselineOf = (wid: string): string =>
    JSON.stringify((wallStore.getById(wid) as { baseLine: unknown })?.baseLine ?? null);

  // ══ Clause (a) — bound plan → full reconciliation, agreement expected ════════
  let planProduced = 0; let dispatchTeeth = 0;
  try {
    const wid = seedWall();
    const payload = movePayload(wid, 1);
    const plan = await preview.preview({ type: 'wall.updateBaseline', payload });
    planProduced = plan ? 1 : 0;
    if (plan) {
      const before = baselineOf(wid);
      const { consequence } = await executor.execute({ type: 'wall.updateBaseline', payload }, { plan });
      const after = baselineOf(wid);
      dispatchTeeth = after !== before ? 1 : 0; // the REAL bridge mutated the authoritative store
      if (consequence.kind !== 'reconciled') {
        findingNames.push(`(a) bound plan did not reconcile — got '${consequence.kind}' (planHash ${plan.planHash})`);
      } else {
        const r = consequence.report;
        const actualSet = new Set(r.actual.changed);
        const missingSet = new Set(r.predictedVsActual.missing);
        const uncovered = plan.changed.filter((id) => !actualSet.has(id) && !missingSet.has(id));
        if (uncovered.length > 0) findingNames.push(`(a) plan items NOT reconciled: [${uncovered.join(',')}]`);
        if ((r.undeterminedOutcomes?.length ?? -1) !== plan.undetermined.length) {
          findingNames.push(`(a) undetermined coverage: plan declared ${plan.undetermined.length} item(s), report carries ${r.undeterminedOutcomes?.length ?? 'NONE'}`);
        }
        if (r.divergence?.kind !== 'plan-agreed') {
          findingNames.push(`(a) happy path diverged: unexpected=[${r.predictedVsActual.unexpected.join(',')}] missing=[${r.predictedVsActual.missing.join(',')}]`);
        }
        lines.push(`(a) bound execute → report: actual.changed=[${r.actual.changed.join(',')}] · divergence=${r.divergence?.kind} · undeterminedOutcomes=${r.undeterminedOutcomes?.length} (plan declared ${plan.undetermined.length})`);
      }
    }
  } catch (e) { harnessErrors.push('(a): ' + String(e).slice(0, 300)); }
  floors.push({ what: 'preview produced a plan over the real stores (minimum evidence)', measured: planProduced, min: 1 });
  floors.push({ what: 'the REAL dispatch mutated the authoritative WallStore (teeth)', measured: dispatchTeeth, min: 1 });

  // ══ Clause (b) — POSITIVE CONTROL: planner-blind mutation ⇒ NAMED divergence ═
  let divergenceNamed = 0;
  try {
    const wid = seedWall();
    doorStore.add({ id: 'd_ghost', openingId: 'op_g', wallId: wid, offset: 1.5, width: 0.9, height: 2.1, sillHeight: 0 } as never);
    scripted.relocations = [{ opening: { id: 'op_g', elementId: 'd_ghost' } }]; // prediction: d_ghost relocates
    const payload = movePayload(wid, 1);
    const plan = await preview.preview({ type: 'wall.updateBaseline', payload });
    // MUTATE BETWEEN PLAN AND EXECUTE, planner-blind: the door leaves its store.
    // (stateHash covers walls; the scripted branches do not read the door store;
    // re-planning yields a byte-identical plan, so binding SHOULD still hold.)
    (doorStore as unknown as { remove?: (id: string) => void; delete?: (id: string) => void }).remove?.('d_ghost');
    if (plan) {
      const { consequence } = await executor.execute({ type: 'wall.updateBaseline', payload }, { plan });
      if (consequence.kind === 'reconciled') {
        const d = consequence.report.divergence;
        const named = d?.kind === 'plan-fidelity-divergence' && d.missing.includes('d_ghost');
        divergenceNamed = named ? 1 : 0;
        lines.push(`(b) deliberate divergence → verdict=${d?.kind} · missing=[${d?.kind === 'plan-fidelity-divergence' ? d.missing.join(',') : ''}] — ` +
          (named ? 'REPORTED as the named failure class, not absorbed.' : 'ABSORBED — the comparator is blind (floor).'));
      } else {
        lines.push(`(b) binding unexpectedly refused ('${consequence.kind}') — the planner saw the mutation it was scripted not to see; control not established.`);
      }
    }
    scripted.relocations = [];
  } catch (e) { harnessErrors.push('(b): ' + String(e).slice(0, 300)); }
  floors.push({ what: 'POSITIVE control — a deliberate plan/execution divergence is REPORTED, not absorbed', measured: divergenceNamed, min: 1 });

  // ══ Clause (c) — NEGATIVE CONTROL: planner-visible mutation ⇒ typed PLAN_STALE ═
  let staleTyped = 0;
  try {
    const wid = seedWall();
    const payload = movePayload(wid, 1);
    const plan = await preview.preview({ type: 'wall.updateBaseline', payload });
    // MUTATE BETWEEN PLAN AND EXECUTE, planner-VISIBLE: the wall itself moves.
    wallStore.update(wid, { baseLine: [P(0.05, 0, 0), P(5.05, 0, 0)] } as never);
    if (plan) {
      const before = baselineOf(wid);
      const { consequence } = await executor.execute({ type: 'wall.updateBaseline', payload }, { plan });
      const moved = baselineOf(wid) !== before;
      const ok = consequence.kind === 'plan-stale'
        && consequence.refusal.kind === 'PLAN_STALE'
        && consequence.refusal.plannedPlanHash !== consequence.refusal.livePlanHash
        && consequence.refusal.stalePlan.planId === plan.planId
        && moved; // staleness ≠ command failure — plan-less execution preserved
      staleTyped = ok ? 1 : 0;
      lines.push(`(c) stale binding → kind=${consequence.kind} · planned=${plan.planHash} vs live=${consequence.kind === 'plan-stale' ? consequence.refusal.livePlanHash : '—'} · command still executed=${moved} — ` +
        (ok ? 'typed PLAN_STALE, stale plan carried as evidence, never as prediction.' : 'WRONG shape (floor).'));
    }
  } catch (e) { harnessErrors.push('(c): ' + String(e).slice(0, 300)); }
  floors.push({ what: 'NEGATIVE control — stale planHash refused as typed PLAN_STALE, command still executed plan-less', measured: staleTyped, min: 1 });

  // ══ Clause (d) — plan-less execute: typed absence, never a fabricated prediction ═
  let absenceTyped = 0;
  try {
    const wid = seedWall();
    const payload = movePayload(wid, 1);
    const before = baselineOf(wid);
    const { consequence } = await executor.execute({ type: 'wall.updateBaseline', payload });
    const moved = baselineOf(wid) !== before;
    const ok = consequence.kind === 'unplanned'
      && consequence.prediction.kind === 'absent'
      && consequence.prediction.reason === 'NO_PLAN_SUPPLIED'
      && moved
      && consequence.actual.changed.includes(wid);
    absenceTyped = ok ? 1 : 0;
    lines.push(`(d) plan-less execute → kind=${consequence.kind} · prediction=${consequence.kind === 'unplanned' ? consequence.prediction.reason : '—'} · actual.changed=[${consequence.kind !== 'reconciled' ? consequence.actual.changed.join(',') : ''}] — ` +
      (ok ? 'typed absence; reality still independently read back.' : 'WRONG shape (floor).'));
  } catch (e) { harnessErrors.push('(d): ' + String(e).slice(0, 300)); }
  floors.push({ what: 'plan-less execute works and reports the TYPED absence of a prediction', measured: absenceTyped, min: 1 });

  for (const err of harnessErrors) {
    lines.push('harness error: ' + err);
    findingNames.push('harness error (never merged with "no change"): ' + err.slice(0, 120));
  }

  return {
    gate: 'check-execution-plan-agreement',
    floors,
    lines,
    findings: findingNames.length,
    declared: 0, // hard-0: G-REASON-03 lands with an empty ledger — red here is red.
    findingNames,
  };
}

run()
  .then((r) => process.exit(reportGate(r)))
  .catch((e) => {
    console.error('check-execution-plan-agreement: harness threw — MISCONFIGURED\n', e);
    process.exit(2);
  });
