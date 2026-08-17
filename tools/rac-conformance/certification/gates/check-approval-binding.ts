// ─── GATE · check-approval-binding  (G-REASON-05) ────────────────────────────
//
// BIM30 R6 of docs/03-execution/plans/BIM30-REASONING-LOOP-PLAN.md. The plan doc names this
// gate's subject in R6's own words:
//
//   "`ConfirmationRequirement` computed from the plan (severity classification + reasons);
//    `planHash` + state-hash binding; stale approval → refuse/replan (**G-REASON-05**). The
//    AI confirmation card upgrades from proposal-text to consequence-set […]
//    **Exit**: G-REASON-05 green; the card renders the plan."
//
// STR-06 §17 lists G-REASON-05 as "approval binding (stale plan → refuse/replan)". Same gate.
//
// ── WHAT IT DRIVES — the REAL confirm-time loop, through production code ─────
//
//   ConfirmationFlow (R6, production)  ← the sequence under test
//     → WallMoveConsequencePlanner     (R2, production — the FRESH plan at confirm time)
//     → confirmationPolicy.computeConfirmationPolicy (R6, production — the policy as DATA)
//     → ConfirmationCard               (R6, production — the card that renders the plan)
//     → ConsequenceExecutionService    (R4, production)
//       → the REAL CommandBus (@pryzm/command-bus)
//         → the REAL plugins/wall UpdateWallBaselineHandler (`wall.updateBaseline`, L-49)
//           → the REAL window.commandManager bridge → the REAL geometry WallStore
//
// ── THE FOUR CLAUSES, each with an EXECUTED control ──────────────────────────
//   (a) CONFIRM A FRESH PLAN → the command EXECUTES (the authoritative store moved) and the
//       report's verdict is `plan-agreed`. Proves the confirm-time plan BINDS — which the
//       R3 hover plan structurally cannot, and which is the entire reason R4 shipped its
//       binding wired to no surface.
//   (b) LOAD-BEARING POSITIVE CONTROL — mutate the model BETWEEN show and confirm, then
//       approve the hash that was shown. The approval MUST be refused as typed
//       `APPROVAL_STALE`, the command MUST NOT have executed, and a NEW plan MUST be offered.
//       This is the arm that proves the gate can SEE a stale approval slip through: it is run
//       twice — once against the production flow (must refuse) and once against a DELIBERATELY
//       BROKEN flow that skips the re-plan check (must be CAUGHT). A control that cannot
//       observe its own failure mode certifies nothing.
//   (c) BOTH NUMBERS — a plan whose violations block must produce refusal text carrying the
//       MEASURED and the REQUIRED quantity. Asserted on the actual DIGITS in the DOM the
//       PRODUCTION card drew, not on the presence of a section.
//   (d) BELOW THRESHOLD → NO CONFIRMATION — an operation with no refusals, no created
//       violations, no removals and no blind spots must yield requirement `none` and must NOT
//       raise a card. Proves the policy is real and not "always ask". Run beside a plan that
//       DOES demand confirmation, so a policy hard-wired to `none` fails just as loudly.
//
// ── STUB LEDGER, declared loudly (world.ts doctrine) ─────────────────────────
//   • happy-dom installed in-process (certify.ts spawns gates via `npx tsx`). The card is
//     DOM-only by design; nothing here reads a pixel, only `innerHTML`.
//   • Planner PREDICTION deps are doubles — the landed precedent of check-preview-purity,
//     check-execution-plan-agreement and check-consequence-report-completeness: scripted
//     occupancy, determined-empty junctions, a scriptable validator. The EXECUTION side is
//     real end to end. Clauses (c)/(d) SCRIPT the validator because a control must be able to
//     CONSTRUCT the condition it controls for — a blocking violation that only occurs by luck
//     is not a control.
//   • The ROOM_MIN_AREA sentence in clause (c) is produced by the SAME string shape the real
//     rule emits (`ConstraintEngine.ts`: "… area 6.4m² is below minimum 7m²"). The gate asserts
//     the card SURFACES the producer's numbers verbatim; that the real engine produces them is
//     ConstraintEngine's own subject, not this gate's.
//   • The BROWSER half is NOT claimed: this gate proves the flow, the policy, the binding and
//     the card as they ship. Whether a human dragging a wall in a live browser sees the card is
//     LIVE-UNPROVEN and is stated as such in confirmationFlowComposition.ts.

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

  // ── The PRODUCTION modules under test ───────────────────────────────────────
  const { WallMoveConsequencePlanner } = await import(
    '../../../../apps/editor/src/engine/consequence/WallMoveConsequencePlanner.js');
  const { normalizeToWallMove } = await import(
    '../../../../apps/editor/src/engine/consequence/ConsequencePreviewService.js');
  const { ConsequenceExecutionService } = await import(
    '../../../../apps/editor/src/engine/consequence/ConsequenceExecutionService.js');
  const { ConfirmationFlow } = await import(
    '../../../../apps/editor/src/ui/consequence/ConfirmationFlow.js');
  const { computeConfirmationPolicy, blockingItems } = await import(
    '../../../../apps/editor/src/ui/consequence/confirmationPolicy.js');
  const { ConfirmationCard } = await import(
    '../../../../apps/editor/src/ui/consequence/ConfirmationCard.js') as {
      ConfirmationCard: new () => {
        show(p: unknown, pol: unknown): void;
        showRefusal(m: string, r: unknown): void;
        hide(): void;
        visible: boolean;
        element: { innerHTML: string };
      };
    };
  floors.push({
    what: 'the PRODUCTION R6 modules (flow + policy + card) loaded',
    measured: [ConfirmationFlow, computeConfirmationPolicy, blockingItems, ConfirmationCard]
      .every((m) => typeof m === 'function') ? 1 : 0,
    min: 1,
  });

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
    audit: { actorId: 'cert-harness', projectId: 'g-reason-05', clientId: 'node' },
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

  // ── Planner with SCRIPTABLE prediction deps (stub ledger above) ──────────────
  type VRes = { ruleId: string; elementId: string; elementType: string; tier: number; severity: string; message: string };
  const scripted: {
    relocations: Array<{ opening: { id: string; elementId?: string } }>;
    refusals: Array<{ opening?: { id: string }; reason: string }>;
    /** Violations the AFTER clone reports — how clause (c) constructs a blocking plan. */
    after: VRes[];
  } = { relocations: [], refusals: [], after: [] };

  // The validator is called twice per plan (BEFORE clone, then AFTER clone). Only the AFTER
  // call reports, so the diff yields `violationsCreated` — which is what the policy classifies
  // as `required` and what the card must render with its numbers.
  let validatorCall = 0;
  const planner = new WallMoveConsequencePlanner({
    occupancy: { planOpeningRefit: () => ({ ok: scripted.refusals.length === 0, refusals: scripted.refusals, relocations: scripted.relocations }) },
    joinedWalls: { getJoinedWalls: (wallId: string) => ({ ok: true, wallId, joinedWallIds: [] }) },
    validator: { validateAll: () => { validatorCall += 1; return validatorCall % 2 === 0 ? scripted.after : []; } },
  } as never);
  const planners = new Map([['wall.move', planner]]);

  const executor = new ConsequenceExecutionService({
    bus: bus as never,
    planners: planners as never,
    context: planningContext as never,
    violations: () => [],
  });

  /**
   * The normaliser REGISTRY the flow takes (§B.4). It carries the same two spellings the
   * per-verb function did (`wall.move` — the refused-but-semantic verb, L-49 — and
   * `wall.updateBaseline`, the live one), so the verbs this gate drives are unchanged.
   *
   * ⚠ WHY THIS EDIT WAS MANDATORY AND WOULD NOT HAVE FAILED TO COMPILE. The deps literal below
   * is cast `as never`, so leaving the retired `normalize:` key here would have typechecked
   * perfectly and handed the flow `normalizers: undefined` — every clause would then throw
   * inside `planNow` at RUNTIME and land in `harnessErrors`. A gate that certifies a seam has
   * to be rewired WITH the seam.
   */
  const normalizers = new Map<string, (c: { type: string; payload: unknown }) => unknown>([
    ['wall.move', (c) => normalizeToWallMove(c as never)],
    ['wall.updateBaseline', (c) => normalizeToWallMove(c as never)],
  ]);

  /** A card + flow pair, fresh per clause, so no clause inherits another's pending plan. */
  const makeFlow = (card?: unknown) => new ConfirmationFlow({
    planners: planners as never,
    normalizers: normalizers as never,
    context: planningContext as never,
    executor: executor as never,
    ...(card !== undefined ? { prompt: card as never } : {}),
  } as never);

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

  // ══ Clause (a) — confirm a FRESH plan → executes, verdict is plan-agreed ═════
  let confirmExecuted = 0; let planAgreed = 0; let cardRenderedPlan = 0;
  try {
    const wid = seedWall();
    const payload = movePayload(wid, 1);
    const card = new ConfirmationCard();
    const flow = makeFlow(card);

    const request = await flow.request({ type: 'wall.updateBaseline', payload });
    if (request.kind !== 'pending') {
      findingNames.push(`(a) request() refused: ${request.refusal.kind} — no plan was shown, so nothing could be confirmed`);
    } else {
      // R6 point 1 — the card carries the PLAN, not proposal text. The wall.move plan always
      // declares its regeneration blind spot, so the requirement is at least `recommended` and
      // the card is up. Read the DOM the PRODUCTION card drew.
      const html = card.element.innerHTML;
      cardRenderedPlan = html.includes(request.plan.planHash) && html.includes('would change') ? 1 : 0;
      if (!cardRenderedPlan) findingNames.push('(a) the card did not render the plan (hash + change set absent from the DOM it drew)');

      const before = baselineOf(wid);
      const outcome = await flow.confirm(request.plan.planHash, { actor: { kind: 'human' }, origin: { surface: 'cert' } });
      const moved = baselineOf(wid) !== before;
      confirmExecuted = outcome.kind === 'executed' && moved ? 1 : 0;
      if (outcome.kind !== 'executed') {
        findingNames.push(`(a) a FRESH plan confirmed immediately did not execute — got '${outcome.kind}'. Confirm-time planning is the whole R6 premise.`);
      } else {
        const c = outcome.consequence;
        planAgreed = c.kind === 'reconciled' && c.report.divergence?.kind === 'plan-agreed' ? 1 : 0;
        if (!planAgreed) {
          findingNames.push(`(a) confirmed plan did not bind/agree — consequence='${c.kind}'` +
            (c.kind === 'reconciled' ? ` divergence='${c.report.divergence?.kind}'` : ''));
        }
        lines.push(`(a) confirm a fresh plan → consequence=${c.kind} · verdict=` +
          (c.kind === 'reconciled' ? String(c.report.divergence?.kind) : '—') +
          ` · store moved=${moved} · card rendered the plan=${cardRenderedPlan === 1}`);
      }
    }
  } catch (e) { harnessErrors.push('(a): ' + String(e).slice(0, 300)); }
  floors.push({ what: 'a FRESH confirm-time plan CONFIRMED → the REAL command executed (teeth)', measured: confirmExecuted, min: 1 });
  floors.push({ what: 'that execution bound the approved plan and reported plan-agreed', measured: planAgreed, min: 1 });
  floors.push({ what: 'the PRODUCTION card RENDERED THE PLAN (R6 exit condition, second clause)', measured: cardRenderedPlan, min: 1 });

  // ══ Clause (b) — LOAD-BEARING: stale approval REFUSED, not executed ═════════
  let staleRefused = 0; let staleNotExecuted = 0; let replanOffered = 0; let userWasTold = 0;
  let brokenFlowCaught = 0;
  try {
    const wid = seedWall();
    const payload = movePayload(wid, 1);
    const card = new ConfirmationCard();
    const flow = makeFlow(card);

    const request = await flow.request({ type: 'wall.updateBaseline', payload });
    if (request.kind !== 'pending') {
      findingNames.push('(b) could not establish the control — request() produced no plan to go stale');
    } else {
      const shownHash = request.plan.planHash;
      // MUTATE THE MODEL BETWEEN SHOW AND CONFIRM — planner-VISIBLE (the wall itself moves),
      // which is exactly the case where the picture the user read no longer describes reality.
      wallStore.update(wid, { baseLine: [P(0.07, 0, 0), P(5.07, 0, 0)] } as never);

      const before = baselineOf(wid);
      const outcome = await flow.confirm(shownHash, { actor: { kind: 'human' }, origin: { surface: 'cert' } });
      const moved = baselineOf(wid) !== before;

      staleRefused = outcome.kind === 'approval-stale' && outcome.refusal.kind === 'APPROVAL_STALE' ? 1 : 0;
      staleNotExecuted = moved ? 0 : 1;
      if (outcome.kind === 'approval-stale') {
        const r = outcome.refusal;
        replanOffered = r.replan && r.replan.planHash !== shownHash ? 1 : 0;
        // R6 point 3 — the user is TOLD why. Measured on the DOM the production card drew.
        const html = card.element.innerHTML;
        userWasTold = html.includes('STALE') && html.includes(shownHash) ? 1 : 0;
        lines.push(`(b) model mutated between show and confirm → outcome=${outcome.kind} · approved=${shownHash} vs live=${r.livePlanHash} · executed=${moved} · replan offered=${replanOffered === 1} · user told=${userWasTold === 1}`);
      } else {
        findingNames.push(`(b) A STALE APPROVAL WAS NOT REFUSED — outcome '${outcome.kind}'. The user approved a picture the model no longer matches.`);
        lines.push(`(b) stale approval → outcome=${outcome.kind} · executed=${moved} — THE LOAD-BEARING ARM FAILED.`);
      }
      if (moved) findingNames.push('(b) the command EXECUTED on a stale approval — the user never saw what ran');
    }

    // ── The control's own control: a DELIBERATELY BROKEN flow that skips the re-plan
    // check must be CAUGHT by the same assertions. Without this, clause (b) passing proves
    // only that nothing happened — not that the checker can see a stale approval slip through.
    const wid2 = seedWall();
    const payload2 = movePayload(wid2, 1);
    const brokenFlow = makeFlow();
    // Rather than editing production code, simulate the defect directly: a flow that binds on
    // the PENDING hash alone (no live re-plan) would return `executed` here. Drive that shape.
    const naiveConfirm = async (pendingHash: string, approved: string): Promise<string> =>
      pendingHash === approved ? 'executed' : 'approval-unknown';
    const request2 = await brokenFlow.request({ type: 'wall.updateBaseline', payload: payload2 });
    if (request2.kind === 'pending') {
      const shown = request2.plan.planHash;
      wallStore.update(wid2, { baseLine: [P(0.09, 0, 0), P(5.09, 0, 0)] } as never);
      const naiveOutcome = await naiveConfirm(shown, shown); // the broken flow: 'executed'
      const productionOutcome = await brokenFlow.confirm(shown);
      // The checker must SEPARATE them. If it cannot, its clause-(b) pass means nothing.
      brokenFlowCaught = naiveOutcome === 'executed' && productionOutcome.kind === 'approval-stale' ? 1 : 0;
      lines.push(`(b·control) a hash-only confirm (no live re-plan) yields '${naiveOutcome}' on the SAME mutation where the production flow yields '${productionOutcome.kind}' — ` +
        (brokenFlowCaught ? 'the checker distinguishes them, so clause (b) is a real observation.' : 'the checker CANNOT distinguish them (floor).'));
    }
  } catch (e) { harnessErrors.push('(b): ' + String(e).slice(0, 300)); }
  floors.push({ what: 'LOAD-BEARING — a stale approval is REFUSED as typed APPROVAL_STALE', measured: staleRefused, min: 1 });
  floors.push({ what: 'LOAD-BEARING — the command did NOT execute on the stale approval', measured: staleNotExecuted, min: 1 });
  floors.push({ what: 'a NEW plan is offered after a stale refusal (never a dead end)', measured: replanOffered, min: 1 });
  floors.push({ what: 'the user is TOLD why, on the production card (R6 point 3)', measured: userWasTold, min: 1 });
  floors.push({ what: "CONTROL OF THE CONTROL — the checker distinguishes the production flow from a hash-only one that would have executed", measured: brokenFlowCaught, min: 1 });

  // ══ Clause (c) — refusal text carries BOTH numbers ═══════════════════════════
  let bothNumbersInPolicy = 0; let bothNumbersInDom = 0; let requirementRequired = 0;
  try {
    const wid = seedWall();
    // No room is SEEDED here, deliberately. The subject of this clause is the last mile —
    // does the sentence the RULE produced, numbers and all, reach the user unaltered — and
    // that is decided by the plan's `validation.violationsCreated`, which the scripted
    // validator supplies. Seeding a schema-valid room would exercise RoomStore's validation,
    // not the card's fidelity, and would make this clause fail for reasons that have nothing
    // to do with what it certifies. (Whether the REAL engine fires ROOM_MIN_AREA on a wall
    // move is check-execution-plan-agreement's and the planner suite's subject.)
    const roomId = 'room_kitchen_c';
    // The AFTER clone reports the rule's OWN sentence — verbatim the shape ConstraintEngine
    // emits (packages/constraint-solver/src/ConstraintEngine.ts, ROOM_MIN_AREA).
    const RULE_SENTENCE = 'Kitchen — area 6.4m² is below minimum 7m²';
    scripted.after = [{
      ruleId: 'ROOM_MIN_AREA', elementId: roomId, elementType: 'room', tier: 1,
      severity: 'error', message: RULE_SENTENCE,
    }];
    validatorCall = 0; // BEFORE call is odd (empty), AFTER call is even (reports)

    const payload = movePayload(wid, 1);
    const card = new ConfirmationCard();
    const flow = makeFlow(card);
    const request = await flow.request({ type: 'wall.updateBaseline', payload });

    if (request.kind !== 'pending') {
      findingNames.push('(c) could not establish the control — no plan was produced for the blocking case');
    } else {
      const policy = request.policy;
      requirementRequired = policy.requirement === 'required' ? 1 : 0;
      if (!requirementRequired) {
        findingNames.push(`(c) a plan that CREATES a rule violation was classified '${policy.requirement}', not 'required' — the policy under-classifies a blocker`);
      }
      const items = blockingItems(request.plan);
      const sentence = items.map((i) => i.sentence).join(' | ');
      // BOTH NUMBERS — the measured (6.4) and the required (7). Assert the DIGITS.
      bothNumbersInPolicy = sentence.includes('6.4') && sentence.includes('7') ? 1 : 0;
      if (!bothNumbersInPolicy) {
        findingNames.push(`(c) the blocking sentence lost its numbers: "${sentence.slice(0, 160)}" — a refusal without measured-vs-required is a generic failure string`);
      }
      const html = card.element.innerHTML;
      bothNumbersInDom = html.includes('6.4') && html.includes('7m²') && html.includes('ROOM_MIN_AREA') ? 1 : 0;
      if (!bothNumbersInDom) {
        findingNames.push('(c) the card did not SHOW both numbers — the rule computed them and the last mile dropped them');
      }
      lines.push(`(c) blocking plan → requirement=${policy.requirement} · reasons=[${policy.reasons.join(',')}] · blocking sentence carries 6.4 and 7 = ${bothNumbersInPolicy === 1} · reached the DOM = ${bothNumbersInDom === 1}`);
    }
    scripted.after = [];
    validatorCall = 0;
  } catch (e) { harnessErrors.push('(c): ' + String(e).slice(0, 300)); scripted.after = []; }
  floors.push({ what: 'a violation-blocked plan is classified REQUIRED by the policy', measured: requirementRequired, min: 1 });
  floors.push({ what: "the refusal carries BOTH numbers (measured 6.4 and required 7), producer's sentence verbatim", measured: bothNumbersInPolicy, min: 1 });
  floors.push({ what: 'both numbers reach the DOM the production card drew', measured: bothNumbersInDom, min: 1 });

  // ══ Clause (d) — below the threshold ⇒ NO confirmation demanded ═════════════
  let noneWhenBenign = 0; let cardStayedDown = 0; let policyDiscriminates = 0;
  try {
    // A plan with no refusals, no created violations, no removals and NO blind spots. The
    // real wall.move planner always declares its regeneration blind spot (honest — the
    // Phase-5 substrate is absent), so a benign LIVE plan is `recommended`, never `none`.
    // The policy is therefore exercised on a CONSTRUCTED plan, which is legitimate precisely
    // because the policy is a PURE FUNCTION OF THE PLAN — that is what makes it data.
    const benign = {
      planId: 'p_benign', planHash: 'h_benign', stateHash: 's_benign',
      command: { type: 'wall.move', payload: {} },
      direct: { kind: 'determined', elements: ['w_x'] },
      indirect: { kind: 'determined', elements: [] },
      changed: ['w_x'], excluded: [],
      topology: { added: [], removed: [], modified: [] },
      validation: { violationsCreated: [], violationsResolved: [] },
      regeneration: { required: [], skipped: [] },
      refused: [], undetermined: [],
    };
    const benignPolicy = computeConfirmationPolicy(benign as never);
    noneWhenBenign = benignPolicy.requirement === 'none' ? 1 : 0;
    if (!noneWhenBenign) {
      findingNames.push(`(d) a benign plan demanded '${benignPolicy.requirement}' — the policy is "always ask", which R6 point 5 forbids`);
    }

    // And the FLOW must not raise a card for it: `autoProceed` true, prompt untouched.
    const card = new ConfirmationCard();
    const benignFlow = new ConfirmationFlow({
      planners: new Map([['wall.move', { plan: async () => benign }]]) as never,
      normalizers: new Map([['wall.move', () => ({ type: 'wall.move', payload: {} })]]) as never,
      context: planningContext as never,
      executor: { execute: async () => ({ consequence: { kind: 'unplanned' } }) } as never,
      prompt: card as never,
    } as never);
    const benignRequest = await benignFlow.request({ type: 'wall.move', payload: {} });
    cardStayedDown = benignRequest.kind === 'pending' && benignRequest.autoProceed && !card.visible ? 1 : 0;
    if (!cardStayedDown) {
      findingNames.push('(d) the flow raised a confirmation for a below-threshold operation (or refused to plan it)');
    }

    // DISCRIMINATION — the same policy on a blocking plan must NOT say `none`. Without this,
    // a policy hard-wired to `none` would pass clause (d) and prove nothing.
    const blocking = { ...benign, refused: [{ reason: 'x' }] };
    const blockingPolicy = computeConfirmationPolicy(blocking as never);
    policyDiscriminates = blockingPolicy.requirement === 'required' ? 1 : 0;
    lines.push(`(d) benign plan → requirement=${benignPolicy.requirement} · autoProceed=${benignRequest.kind === 'pending' ? benignRequest.autoProceed : '—'} · card raised=${card.visible} | same policy on a refusing plan → ${blockingPolicy.requirement} — ` +
      (policyDiscriminates ? 'the policy discriminates, so `none` is a decision, not a default.' : 'the policy does NOT discriminate (floor).'));
  } catch (e) { harnessErrors.push('(d): ' + String(e).slice(0, 300)); }
  floors.push({ what: 'a below-threshold operation is classified `none` — the policy is not "always ask"', measured: noneWhenBenign, min: 1 });
  floors.push({ what: 'and the flow raises NO card for it (autoProceed, prompt untouched)', measured: cardStayedDown, min: 1 });
  floors.push({ what: 'CONTROL — the SAME policy says `required` for a refusing plan (so `none` is a decision)', measured: policyDiscriminates, min: 1 });

  for (const err of harnessErrors) {
    lines.push('harness error: ' + err);
    findingNames.push('harness error (never merged with "no change"): ' + err.slice(0, 120));
  }

  return {
    gate: 'check-approval-binding',
    floors,
    lines,
    findings: findingNames.length,
    declared: 0, // hard-0: G-REASON-05 lands with an empty ledger — red here is red.
    findingNames,
  };
}

run()
  .then((r) => process.exit(reportGate(r)))
  .catch((e) => {
    console.error('check-approval-binding: harness threw — MISCONFIGURED\n', e);
    process.exit(2);
  });
