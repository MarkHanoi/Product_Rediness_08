// ─── GATE · check-consequence-report-completeness  (G-REASON-06) ─────────────
//
// BIM30 R5 of docs/03-execution/plans/BIM30-REASONING-LOOP-PLAN.md. The plan doc names
// this gate and its subject in R5's own words:
//
//   "`ConsequenceReport` produced from the actual execution record + the original plan —
//    never a second inference pass. Sections: changed / excluded / undetermined /
//    regenerated / refused / validation / provenance(actor+origin) / **predicted-vs-actual**.
//    `untouched` derived at report time. […]
//    **Exit**: G-REASON-06 completeness per declared contract, for `wall.move`."
//
// COMPLETENESS is therefore measured on TWO surfaces, and a gate that measured only one
// would certify half the exit condition:
//
//   THE REPORT   — does the object the R4 executor produces carry every section R5 names?
//   THE RENDERER — does the ConsequenceReportView (R5) actually SHOW them? STR-06 §2 is
//                  explicit that a divergence must be VISIBLE, not a console line, so a
//                  complete report nobody can see does not satisfy R5. The gate drives the
//                  REAL production renderer (apps/editor/src/ui/canvas/ConsequenceReportView.ts)
//                  over happy-dom and reads the DOM it produced — never a re-implementation.
//
// ── FIVE CLAUSES, each with a control ────────────────────────────────────────
//   (a) COMPLETENESS — a real wall.move report (preview → plan → execute → report through
//       the production services, real bus, real handler, real WallStore) carries every
//       section the plan doc names; each missing section is a finding BY NAME.
//   (b) POSITIVE CONTROL · divergence is VISIBLE — a report whose verdict is
//       `plan-fidelity-divergence` must render the divergence and its ids in the DOM. If
//       the renderer swallowed it, this clause fails; that is the STR-06 §2 defect.
//   (c) POSITIVE CONTROL · undetermined renders AS undetermined — a report with plan-time
//       blind spots must render them as blind spots, not as an empty section. Measured as
//       DOM text containing the reason code, not merely a non-empty panel.
//   (d) NEGATIVE CONTROL · no report ⇒ SAY SO — the renderer given a plan-less or stale
//       execution must render the typed ABSENCE, not a confident blank. Measured two ways:
//       the panel is non-empty AND it does NOT contain an agreement claim.
//   (e) METRICS — the typed `metrics` field (R5, the Phase 6b stopgap's replacement)
//       reaches the DOM as `before → after` with a UNIT.
//
// ── STUB LEDGER, declared loudly (world.ts doctrine) ─────────────────────────
//   • happy-dom installed in-process. The renderer is DOM-only by design; nothing here
//     reads a pixel, only `innerHTML`.
//   • The planner's PREDICTION deps are doubles (the landed precedent of
//     check-preview-purity and check-execution-plan-agreement): scripted occupancy,
//     determined-empty junctions, a no-violation validator. The EXECUTION side is real
//     end to end. Clauses (b)/(c)/(d)/(e) additionally drive the renderer over LITERAL
//     reports, because a control must be able to CONSTRUCT the condition it controls for —
//     a divergence that only occurs by luck is not a control.
//   • Rooms are seeded WITHOUT wall linkage in clause (a), so the room-boundary branch
//     declares its honest UNDETERMINED. Room-propagation completeness is roadmap Phase 5
//     and is NOT claimed here.

import { Window } from 'happy-dom';
import { reportGate, EXIT_MISCONFIGURED, type GateResult, type Floor } from '../contract.js';

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

/** The sections R5 names, each with the predicate that decides it is PRESENT on a report. */
const R5_SECTIONS: { name: string; present: (r: Record<string, unknown>) => boolean }[] = [
  { name: 'changed', present: (r) => Array.isArray((r.actual as { changed?: unknown })?.changed) },
  { name: 'excluded', present: (r) => Array.isArray((r.plan as { excluded?: unknown })?.excluded) },
  { name: 'undetermined', present: (r) => Array.isArray(r.undeterminedOutcomes) },
  { name: 'regenerated', present: (r) => Array.isArray((r.actual as { regenerated?: unknown })?.regenerated) },
  { name: 'refused', present: (r) => Array.isArray((r.plan as { refused?: unknown })?.refused) },
  { name: 'validation', present: (r) => r.validation !== undefined || r.validationUndetermined !== undefined },
  { name: 'provenance(actor)', present: (r) => typeof (r.provenance as { actor?: { kind?: unknown } })?.actor?.kind === 'string' },
  { name: 'predicted-vs-actual', present: (r) => r.predictedVsActual !== undefined && r.divergence !== undefined },
  { name: 'plan carried whole (never a second inference pass)', present: (r) => typeof (r.plan as { planHash?: unknown })?.planHash === 'string' },
];

async function run(): Promise<GateResult> {
  const wnd = globalThis.window as unknown as Record<string, unknown>;
  wnd.__pryzmInitComplete = true;

  // ── The R5 renderer under test — the PRODUCTION module, not a copy ──────────
  const { ConsequenceReportView } = await import(
    '../../../../apps/editor/src/ui/canvas/ConsequenceReportView.js') as {
      ConsequenceReportView: new () => { show(r: unknown): void; showConsequence(c: unknown): void; element: { innerHTML: string } };
    };
  floors.push({ what: 'the PRODUCTION ConsequenceReportView module loaded', measured: ConsequenceReportView ? 1 : 0, min: 1 });

  // ══ Clause (a) — the REAL loop, and the report's completeness ═══════════════
  let reportProduced = 0; let dispatchTeeth = 0; let renderedNonEmpty = 0;
  try {
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

    const dtoStores: Record<string, Record<string, unknown>> = { wall: {}, room: {}, door: {}, window: {}, stair: {} };
    const bus = new CommandBus({
      audit: { actorId: 'cert-harness', projectId: 'g-reason-06', clientId: 'node' },
      storesProvider: () => dtoStores as never,
    } as never);

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

    const asView = (s: { getAll(): unknown[]; getById?: (id: string) => unknown }) => ({
      getAll: () => s.getAll() as readonly unknown[],
      getById: (id: string) => (typeof s.getById === 'function' ? s.getById(id) ?? null : null),
    });
    const byId: Record<string, { getAll(): unknown[]; getById?: (id: string) => unknown }> = {
      wall: wallStore as never, room: roomStore as never, stair: stairStore as never,
      door: doorStore as never, window: windowStore as never,
    };
    const planningContext = () => ({ getStore: (id: string) => (byId[id] ? asView(byId[id]!) : undefined) });

    const planner = new WallMoveConsequencePlanner({
      occupancy: { planOpeningRefit: () => ({ ok: true, refusals: [], relocations: [] }) },
      joinedWalls: { getJoinedWalls: (wallId: string) => ({ ok: true, wallId, joinedWallIds: [] }) },
      validator: { validateAll: () => [] },
    } as never);
    const planners = new Map([['wall.move', planner]]);
    const preview = new ConsequencePreviewService(planners as never, planningContext as never);

    // THE R5 WIRING UNDER TEST: the view is the executor's SINK. The gate never calls
    // `show()` here — it lets the production seam deliver, then reads the DOM.
    const view = new ConsequenceReportView();
    const executor = new ConsequenceExecutionService({
      bus: bus as never,
      planners: planners as never,
      context: planningContext as never,
      violations: () => [],
      sink: (c: unknown) => view.showConsequence(c),
    } as never);

    const wall: Record<string, unknown> = {
      id: 'w_a', type: 'wall', levelId: LEVEL, properties: {}, childrenIds: [],
      baseLine: [P(0, 0, 0), P(5, 0, 0)], height: 3, thickness: 0.2, baseOffset: 0, openings: [],
      metadata: { createdAt: 1, modifiedAt: 1, createdBy: 'cert', version: 1 },
    };
    wallStore.add(wall as never);
    const live = wallStore.getById('w_a') as { baseLine: [P3, P3] };
    const prev = JSON.parse(JSON.stringify(live.baseLine)) as [P3, P3];
    const next = prev.map((p) => ({ x: p.x, y: p.y ?? 0, z: p.z + 1 })) as [P3, P3];
    const payload = { wallId: 'w_a', newBaseLine: next, prevBaseLine: prev };

    const before = JSON.stringify((wallStore.getById('w_a') as { baseLine: unknown }).baseLine);
    const plan = await preview.preview({ type: 'wall.updateBaseline', payload });
    const { consequence } = await executor.execute({ type: 'wall.updateBaseline', payload }, { plan: plan ?? undefined });
    dispatchTeeth = JSON.stringify((wallStore.getById('w_a') as { baseLine: unknown }).baseLine) !== before ? 1 : 0;

    if (consequence.kind !== 'reconciled') {
      findingNames.push(`(a) the real loop did not produce a report — got '${consequence.kind}'`);
    } else {
      reportProduced = 1;
      const r = consequence.report as unknown as Record<string, unknown>;
      const missing = R5_SECTIONS.filter((s) => !s.present(r)).map((s) => s.name);
      for (const m of missing) findingNames.push(`(a) R5 section MISSING from the report: ${m}`);
      lines.push(`(a) real wall.move → report: ${R5_SECTIONS.length - missing.length}/${R5_SECTIONS.length} R5 sections present` +
        (missing.length ? ` · MISSING [${missing.join(', ')}]` : '') +
        ` · undeterminedOutcomes=${(r.undeterminedOutcomes as unknown[] | undefined)?.length ?? 'NONE'}`);

      // The SINK delivered it to the PRODUCTION renderer — read what it drew.
      const dom = view.element.innerHTML;
      renderedNonEmpty = dom.trim().length > 0 ? 1 : 0;
      const shows = (needle: string) => dom.includes(needle);
      if (!shows('predicted vs actual')) findingNames.push('(a) the rendered panel omits the predicted-vs-actual section');
      if (!shows('untouched (derived')) findingNames.push('(a) the rendered panel omits the DERIVED untouched count (ADR-0322 §6)');
      lines.push(`(a) production sink → PRODUCTION renderer drew ${dom.length} chars of DOM (no gate-local re-implementation)`);
    }
  } catch (e) { harnessErrors.push('(a): ' + String(e).slice(0, 400)); }

  floors.push({ what: 'the REAL loop produced a ConsequenceReport (minimum evidence — no report ⇒ exit 2)', measured: reportProduced, min: 1 });
  floors.push({ what: 'the REAL dispatch mutated the authoritative WallStore (teeth)', measured: dispatchTeeth, min: 1 });
  floors.push({ what: 'the production sink delivered to the PRODUCTION renderer, which drew non-empty DOM', measured: renderedNonEmpty, min: 1 });

  // ── Literal reports for the controls (a control must CONSTRUCT its condition) ──
  const basePlan = {
    planId: 'p', planHash: 'h1', stateHash: 's1',
    command: { type: 'wall.move', payload: { id: 'wall-1' } },
    direct: { kind: 'determined', elements: ['wall-1'] },
    indirect: { kind: 'determined', elements: [] },
    changed: ['wall-1', 'room-k'], excluded: ['door-9'],
    topology: { added: [], removed: [], modified: [] },
    validation: { violationsCreated: [], violationsResolved: [] },
    regeneration: { required: [], skipped: [] },
    metrics: [{ elementId: 'room-k', metric: 'area', before: 12.4, after: 10.8, unit: 'm2' }],
    refused: [],
    undetermined: [{ scope: 'regeneration of elements dependent on wall wall-1', reason: 'NO_DEPENDENCY_INDEX' }],
  };
  const baseReport = (over: Record<string, unknown> = {}) => ({
    commandId: 'cmd-x', plan: basePlan,
    actual: { changed: ['wall-1', 'room-k'], topology: { added: [], removed: [], modified: [] }, regenerated: [] },
    predictedVsActual: { unexpected: [], missing: [], undeterminedResolved: [] },
    validation: { violationsCreated: [], violationsResolved: [] },
    divergence: { kind: 'plan-agreed' },
    undeterminedOutcomes: basePlan.undetermined.map((item) => ({
      item, outcome: 'undetermined-at-plan-time', actualChangedOutsidePrediction: [],
    })),
    provenance: { actor: { kind: 'human', id: 'u-7' }, origin: { surface: 'toolbar' } },
    ...over,
  });
  const draw = (r: unknown): string => {
    const v = new ConsequenceReportView();
    v.show(r);
    return v.element.innerHTML;
  };

  // ══ Clause (b) — POSITIVE CONTROL: a divergence is VISIBLE, not a log line ══
  let divergenceVisible = 0;
  try {
    const dom = draw(baseReport({
      divergence: { kind: 'plan-fidelity-divergence', unexpected: ['door-77'], missing: ['room-k'] },
      predictedVsActual: { unexpected: ['door-77'], missing: ['room-k'], undeterminedResolved: [] },
    }));
    const named = /DIVERGENCE/i.test(dom);
    const ids = dom.includes('door-77') && dom.includes('room-k');
    divergenceVisible = named && ids ? 1 : 0;
    lines.push(`(b) divergence rendering → named=${named} · both id sets shown=${ids} — ` +
      (divergenceVisible ? 'VISIBLE in the DOM (STR-06 §2 satisfied at the last mile).' : 'NOT visible — a divergence that only exists in an object is a console line with extra steps (floor).'));
  } catch (e) { harnessErrors.push('(b): ' + String(e).slice(0, 300)); }
  floors.push({ what: 'POSITIVE control — a plan-fidelity divergence RENDERS visibly, with its ids', measured: divergenceVisible, min: 1 });

  // ══ Clause (c) — POSITIVE CONTROL: UNDETERMINED renders AS undetermined ════
  let undeterminedVisible = 0;
  try {
    const dom = draw(baseReport({
      undeterminedOutcomes: [{
        item: { scope: 'regeneration of elements dependent on wall wall-1', reason: 'NO_DEPENDENCY_INDEX' },
        outcome: 'undetermined-at-plan-time',
        actualChangedOutsidePrediction: ['slab-4'],
      }],
      validationUndetermined: { scope: 'post-mutation validation delta', reason: 'ENGINE_NOT_AVAILABLE', detail: 'no snapshotter' },
    }));
    const asUndetermined = /UNDETERMINED/i.test(dom) && dom.includes('NO_DEPENDENCY_INDEX');
    const realityBeside = dom.includes('slab-4');
    const validationSaidNotMeasured = dom.includes('NOT MEASURED') && dom.includes('ENGINE_NOT_AVAILABLE');
    // The precise defect being controlled for: an unmeasured channel printing as a zero.
    const noFalseZero = !dom.includes('no violation changed');
    undeterminedVisible = asUndetermined && realityBeside && validationSaidNotMeasured && noFalseZero ? 1 : 0;
    lines.push(`(c) undetermined rendering → as-undetermined=${asUndetermined} · reality beside it=${realityBeside} · ` +
      `unmeasured validation says NOT MEASURED=${validationSaidNotMeasured} · did NOT print a false zero=${noFalseZero} — ` +
      (undeterminedVisible ? 'blind spots are shown as blind spots, never as empty.' : 'a blind spot rendered as nothing (floor).'));
  } catch (e) { harnessErrors.push('(c): ' + String(e).slice(0, 300)); }
  floors.push({ what: 'POSITIVE control — plan-time UNDETERMINED renders AS undetermined, never as an empty section', measured: undeterminedVisible, min: 1 });

  // ══ Clause (d) — NEGATIVE CONTROL: no report ⇒ say so, never a blank ═══════
  let absenceSpoken = 0;
  try {
    const v1 = new ConsequenceReportView();
    v1.showConsequence({
      kind: 'unplanned', commandId: 'c1',
      prediction: { kind: 'absent', reason: 'NO_PLAN_SUPPLIED' },
      actual: { changed: ['wall-1'], topology: { added: [], removed: [], modified: [] }, regenerated: [] },
    });
    const unplanned = v1.element.innerHTML;
    const v2 = new ConsequenceReportView();
    v2.showConsequence({
      kind: 'plan-stale', commandId: 'c2',
      refusal: { kind: 'PLAN_STALE', stalePlan: basePlan, plannedPlanHash: 'h1', plannedStateHash: 's1', livePlanHash: 'h9', liveStateHash: 's9' },
      actual: { changed: ['wall-1'], topology: { added: [], removed: [], modified: [] }, regenerated: [] },
    });
    const staleDom = v2.element.innerHTML;

    const saysNoReport = /NO CONSEQUENCE REPORT/i.test(unplanned) && /NO CONSEQUENCE REPORT/i.test(staleDom);
    const typedReasons = unplanned.includes('NO_PLAN_SUPPLIED') && staleDom.includes('PLAN_STALE');
    // The blank-panel defect and the false-confidence defect, both controlled for.
    const notBlank = unplanned.trim().length > 0 && staleDom.trim().length > 0;
    const noFalseAgreement = !/PLAN AGREED/.test(unplanned) && !/PLAN AGREED/.test(staleDom);
    absenceSpoken = saysNoReport && typedReasons && notBlank && noFalseAgreement ? 1 : 0;
    lines.push(`(d) no-report rendering → says so=${saysNoReport} · typed reasons shown=${typedReasons} · non-blank=${notBlank} · ` +
      `no false agreement claim=${noFalseAgreement} — ` +
      (absenceSpoken ? 'the absence of a prediction is SPOKEN, never a confident blank.' : 'a confident blank (floor).'));
  } catch (e) { harnessErrors.push('(d): ' + String(e).slice(0, 300)); }
  floors.push({ what: 'NEGATIVE control — a renderer given NO report says so rather than rendering a confident blank', measured: absenceSpoken, min: 1 });

  // ══ Clause (e) — the typed METRIC transition reaches the DOM with its unit ══
  let metricRendered = 0;
  try {
    const dom = draw(baseReport({
      metrics: [{ elementId: 'room-k', metric: 'area', before: 12.4, after: 10.9, unit: 'm2' }],
    }));
    const hasBoth = dom.includes('12.4 m²') && dom.includes('10.8 m²');   // the PREDICTED transition
    const hasMeasured = dom.includes('measured 10.9 m²');                  // the ACTUAL beside it
    metricRendered = hasBoth && hasMeasured ? 1 : 0;
    lines.push(`(e) metric rendering → predicted before→after with unit=${hasBoth} · measured actual beside it=${hasMeasured} — ` +
      (metricRendered ? 'the founder\'s "12.4 m² → 10.8 m²" line, from the TYPED field (R5), not a parsed sentence.' : 'the metric did not reach the DOM (floor).'));
  } catch (e) { harnessErrors.push('(e): ' + String(e).slice(0, 300)); }
  floors.push({ what: 'the typed metric transition renders as before → after WITH its unit', measured: metricRendered, min: 1 });

  for (const err of harnessErrors) {
    lines.push('harness error: ' + err);
    findingNames.push('harness error (never merged with "no findings"): ' + err.slice(0, 120));
  }

  return {
    gate: 'check-consequence-report-completeness',
    floors,
    lines,
    findings: findingNames.length,
    declared: 0, // hard-0: G-REASON-06 lands with an empty ledger — red here is red.
    findingNames,
  };
}

run()
  .then((r) => process.exit(reportGate(r)))
  .catch((e) => {
    console.error('check-consequence-report-completeness: harness threw — MISCONFIGURED\n', e);
    process.exit(EXIT_MISCONFIGURED);
  });
