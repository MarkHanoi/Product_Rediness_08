// ─── GATE · check-ai-human-parity  (G-REASON-04) ─────────────────────────────
//
// BIM30 R7 of docs/03-execution/plans/BIM30-REASONING-LOOP-PLAN.md, whose exit
// condition is stated there verbatim:
//
//   "**G-REASON-04**: `normalize(human) === normalize(ai)` for `wall.move`,
//    excluding exactly actor/origin/timestamp/proposal."
//
// ADR-0324 §3 is the contract; `normalizeForParity` in @pryzm/command-bus is the
// rule, IMPORTED here and never re-derived — a gate that reimplements the
// normalizer certifies its own copy, not the production one.
//
// ═══ THE HONEST FINDING THIS GATE EXISTS TO PRINT ═══════════════════════════
//
// R7's brief asks the fair question: does the AI path in this repo actually reach
// the same executor? Measured 2026-08-12, the answer is THREE-PART, and the gate
// prints it EVERY run rather than burying it in a doc:
//
//   1. THE FUNNEL IS SHARED — for the AI surfaces that dispatch at all. The chat
//      bridge mutates ONLY through the bus, with the same verbs the panels use:
//        apps/editor/src/ui/ai/ZeroTokenChatBridge.ts:1129
//          `results.push(bus.executeCommand(c.type, c.payload));`
//        apps/editor/src/ui/ai/ZeroTokenChatBridge.ts:1144
//          `await bus.executeCommand(c.type, c.payload);`
//        packages/ai-host/src/rooms/RoomAIAssistant.ts:103
//          `window.runtime.bus.executeCommand('room.setName', …)`
//      `batchCoordinator.runBatch` is NOT a rival executor — it wraps bus
//      dispatches (ADR-0314: undo-NEUTRAL). And NOTHING branches on actor/origin:
//      a repo-wide grep for `context.origin ===` / `actor ===` / `isAI` / `fromAI`
//      finds zero behavioural branches, only the provenance pass-through at
//      apps/editor/src/engine/consequence/ConsequenceExecutionService.ts:370-374.
//      The bus itself says so at CommandBus.ts:388 — "Metadata only: nothing
//      below branches on it."
//
//   2. THE GOLDEN OPERATION HAS NO AI DISPATCHER. `wall.updateBaseline` — the
//      live wall-move verb (L-49) — is EXPLICITLY family-blocked from chat:
//        packages/ai-host/src/capabilities/ChatCommandClassification.ts:98
//          `'handrail.setHost', 'handrail.moveBaseLine', 'wall.updateBaseline',`
//          … { blockedBy: 'sub-entity reference resolution' }
//        packages/ai-host/src/capabilities/ChatCapabilityRegistry.ts:2130
//          `['wall.move', 'Moving a wall from chat needs a target position I
//            cannot infer — drag it, or use the Move tool.']`
//      So for R7's own golden operation there is no AI-side caller to compare a
//      human caller against.
//
//   3. NO PRODUCTION CALL SITE EVER BUILDS A CommandExecutionContext. Not the AI
//      path, not the human path. `executeCommand`'s `opts.context` is accepted
//      (CommandBus.ts:331) and carried onto the record, and the ONLY constructors
//      of one in the tree are ConsequenceExecutionService's defensive default
//      (`actor: context?.actor ?? { kind: 'system' }`) and two unit tests.
//
// ─── WHAT THAT MEANS FOR WHAT THIS GATE CAN HONESTLY CLAIM ───────────────────
//
// The brief is blunt about the trap: "A gate that fakes the AI path by setting a
// context flag on a human dispatch proves nothing." That is very nearly the only
// thing available today, so this gate refuses to describe itself as more:
//
//   PROVEN here  — the BUS is actor-blind. Two dispatches of the same verb and
//                  payload that differ ONLY in their invocation envelope produce
//                  byte-identical behavioural residue under `normalizeForParity`,
//                  through the REAL bus, the REAL plugins/wall handler, the REAL
//                  commandManager bridge and the REAL geometry WallStore. That is
//                  a real property of real production code and it could fail: if
//                  any layer below the bus ever read `context`, control (i) is not
//                  what catches it — clause (A) is.
//   PROVEN here  — the NORMALIZER has teeth. Controls (i) and (ii) prove it is
//                  neither blind (a behavioural difference FAILS parity, metrics
//                  included — R5's KEEP decision verified empirically, not by
//                  reading the comment) nor vacuous (a provenance-only difference
//                  PASSES).
//   NOT PROVEN   — that the AI's OWN dispatcher reaches this executor for this
//                  verb, because for `wall.updateBaseline` no such dispatcher
//                  exists (finding 2). Clause (A) drives the same call site twice
//                  with two envelopes; it SIMULATES the AI caller and says so.
//   NOT PROVEN   — that a real AI dispatch would carry `origin: 'ai-proposal'` at
//                  all, because no production call site populates the envelope
//                  (finding 3). Parity between two actors is untestable end to end
//                  while both actors are anonymous at the funnel.
//
// This gate therefore lands with ONE declared finding, pinned in
// gate-newly-measured.json — NOT as debt somebody chose to ship, but as the third
// state that file exists for: the instrument arrived and measured an
// architectural gap that predates it. EXIT CONDITION for the pin: the AI path
// reaches the same executor for the golden operation with a populated
// `CommandExecutionContext` — i.e. `wall.updateBaseline` (or a chat-safe
// wall-move verb) leaves the ChatCommandClassification block list AND the chat
// bridge threads `{ context: { actor: {kind:'ai'}, origin: 'ai-proposal',
// approval } }` into `executeCommand`. On that day clause (A) is rewritten to
// drive the AI caller itself and the pin is struck.
//
// ── FOUR CLAUSES ─────────────────────────────────────────────────────────────
//   (A) PARITY — the same wall.updateBaseline, dispatched twice through the REAL
//       bus with a human envelope and an AI envelope, normalizes EQUAL. Both
//       dispatches must have actually mutated the authoritative store (floors) —
//       a parity gate over two no-ops passes vacuously, which is exit 2.
//   (i) POSITIVE CONTROL · a BEHAVIOURAL difference must FAIL parity. Run three
//       ways, because a normalizer can be blind in one place and sharp in
//       another: differing consequence METRICS (R5's decision — the numbers
//       differ while the element SETS are identical, the divergence no other
//       field reveals), a differing AFFECTED SET, and a differing PATCH body.
//       Each must be reported non-equal INDEPENDENTLY.
//  (ii) POSITIVE CONTROL · a PROVENANCE-ONLY difference must PASS parity. Every
//       excluded field made to differ AT ONCE — actor, origin, approval,
//       timestamp, ULID id, clientId, patch capturedAt, report provenance and
//       commandId — with all behaviour held identical. Proves the normalizer is
//       not simply comparing nothing… and clause (i) proves it is not comparing
//       everything.
//  (iii) REACHABILITY — the three findings above are re-measured FROM SOURCE on
//       every run, not trusted from this comment. If someone unblocks
//       `wall.updateBaseline` for chat, or wires a real context at a call site,
//       this clause notices and says the pin can shrink.
//
// ── STUB LEDGER, declared loudly (world.ts doctrine) ─────────────────────────
//   • happy-dom installed in-process (certify.ts spawns gates via `npx tsx`); the
//     measured path is store/bus/command code — nothing reads a pixel.
//   • Clause (A) drives NO planner: parity is asserted over the EventRecord the
//     bus itself returns, so the prediction side is out of scope here (R4's gate
//     owns it). Records for controls (i)/(ii) are built by MUTATING REAL RECORDS
//     returned by real dispatches — a control must be able to construct the exact
//     condition it controls for, and a divergence that only occurs by luck is not
//     a control.
//   • The AI CALLER is simulated, per the finding above. Loudly, every run.

import { Window } from 'happy-dom';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reportGate, type GateResult, type Floor } from '../contract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '../../../..');

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

/** Structural deep-equality over the normalizer's plain-object output. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (typeof a !== 'object') return Number.isNaN(a) && Number.isNaN(b);
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object), kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  }
  return true;
}

/** First differing path, for a finding that names WHAT differed. */
function firstDiff(a: unknown, b: unknown, path = ''): string | null {
  if (deepEqual(a, b)) return null;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return `${path || '<root>'} (${JSON.stringify(a)} vs ${JSON.stringify(b)})`;
  }
  const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
  for (const k of keys) {
    const d = firstDiff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], path ? `${path}.${k}` : k);
    if (d) return d;
  }
  return path || '<root>';
}

/** Deep structured clone that survives the plain data on an EventRecord. */
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

async function run(): Promise<GateResult> {
  const wnd = globalThis.window as unknown as Record<string, unknown>;
  wnd.__pryzmInitComplete = true;

  // ══ Clause (iii) — REACHABILITY, re-measured from source EVERY run ═════════
  // The three findings in this file's header are claims about the tree, and a
  // claim in a comment rots. Each is re-derived here so the gate notices the day
  // it becomes false — which is the day the pin shrinks.
  let reachabilityMeasured = 0;
  try {
    const readIf = (p: string): string => (existsSync(resolve(REPO, p)) ? readFileSync(resolve(REPO, p), 'utf8') : '');

    const classification = readIf('packages/ai-host/src/capabilities/ChatCommandClassification.ts');
    const registry = readIf('packages/ai-host/src/capabilities/ChatCapabilityRegistry.ts');
    const bridge = readIf('apps/editor/src/ui/ai/ZeroTokenChatBridge.ts');
    const busSrc = readIf('packages/command-bus/src/CommandBus.ts');
    reachabilityMeasured = [classification, registry, bridge, busSrc].filter((s) => s.length > 0).length;

    // (1) Does the shared funnel still exist on the AI side?
    const bridgeDispatches = (bridge.match(/bus\.executeCommand\(/g) ?? []).length;
    lines.push(`(iii) shared funnel: the chat bridge dispatches through bus.executeCommand ${bridgeDispatches}× ` +
      `(ZeroTokenChatBridge.ts) — ${bridgeDispatches > 0 ? 'AI mutations use the SAME funnel as panels/tools.' : 'NO bus dispatch found — the AI path may have forked (investigate).'}`);
    if (bridgeDispatches === 0) {
      findingNames.push('(iii) the chat bridge no longer dispatches via bus.executeCommand — the AI path may have forked off the single funnel');
    }

    // (2) Is the golden operation reachable from the AI surface?
    const goldenBlocked = /['"]wall\.updateBaseline['"]/.test(classification);
    const moveRefused = /['"]wall\.move['"]/.test(registry);
    lines.push(`(iii) golden operation: wall.updateBaseline is ${goldenBlocked ? 'BLOCKED' : 'NOT blocked'} in ChatCommandClassification` +
      ` · wall.move is ${moveRefused ? 'REFUSED' : 'NOT refused'} in ChatCapabilityRegistry — ` +
      (goldenBlocked
        ? 'there is NO AI-side dispatcher for R7’s golden operation, so clause (A) SIMULATES the AI caller.'
        : 'the block is GONE — clause (A) can and MUST be rewritten to drive the real AI caller; the pin can shrink.'));

    // (3) Does any production call site populate the invocation envelope?
    //     Counted over the whole client tree, excluding tests and the bus's own
    //     type/default sites, because those are the two known non-call-sites.
    const envelopeSites: string[] = [];
    for (const p of [
      'apps/editor/src/ui/ai/ZeroTokenChatBridge.ts',
      'apps/editor/src/ui/apartment-layout/ApartmentLayoutExecutor.ts',
      'packages/core-app-model/src/views/PlanElementDragController.ts',
    ]) {
      const src = readIf(p);
      if (!src) continue;
      if (/context:\s*\{[^}]*actor/s.test(src) || /origin:\s*['"]ai-proposal['"]/.test(src)) envelopeSites.push(p);
    }
    lines.push(`(iii) invocation envelope: ${envelopeSites.length} of 3 surveyed production dispatch sites build a CommandExecutionContext` +
      (envelopeSites.length === 0
        ? ' — NONE. Both actors are anonymous at the funnel, so end-to-end human-vs-AI parity is architecturally UNAVAILABLE today; clause (A) supplies the envelopes the callers do not.'
        : ` (${envelopeSites.join(', ')}) — real envelopes exist; extend clause (A) to the real call sites.`));

    // The declared finding: honest, named, pinned. It is ONE finding, not three,
    // because it is one gap — the AI caller for the golden operation does not
    // exist and carries no envelope; unblocking without wiring, or wiring without
    // unblocking, does not close it.
    if (goldenBlocked || envelopeSites.length === 0) {
      findingNames.push(
        'AI-PATH-NOT-INDEPENDENTLY-DISPATCHABLE — parity for the golden operation is SIMULATED, not driven: ' +
        `wall.updateBaseline is ${goldenBlocked ? 'family-blocked from chat (ChatCommandClassification.ts)' : 'reachable'} and ` +
        `${envelopeSites.length} production call site(s) populate CommandExecutionContext. ` +
        'Exit: unblock a chat-safe wall-move verb AND thread {actor, origin:\'ai-proposal\', approval} at the bridge, then drive the real AI caller here.',
      );
    }
  } catch (e) { harnessErrors.push('(iii): ' + String(e).slice(0, 300)); }
  floors.push({ what: 'reachability sources read from disk (source files, not this comment)', measured: reachabilityMeasured, min: 4 });

  // ── The composed world: real stores, real CommandManager, real bus ──────────
  const THREE = await import('@pryzm/renderer-three/three');
  const cam = await import('@pryzm/core-app-model');
  const { BimManager, ProjectContext } = cam as unknown as {
    BimManager: new (s: unknown, r: unknown) => Record<string, unknown>;
    ProjectContext: new () => Record<string, unknown>;
  };
  const { WallStore } = await import('@pryzm/geometry-wall');
  const { RoomStore } = await import('@pryzm/room-topology');
  const { doorStore } = await import('@pryzm/geometry-door');
  const { windowStore } = await import('@pryzm/geometry-window');
  const { CommandManager } = (await import('@pryzm/command-registry')) as unknown as {
    CommandManager: new (ctx: unknown) => { execute: (c: unknown) => unknown };
  };
  const { CommandBus, normalizeForParity } = (await import('@pryzm/command-bus')) as unknown as {
    CommandBus: new (o: unknown) => {
      register(h: unknown): void;
      executeCommand(t: string, p: unknown, o?: unknown): Promise<Record<string, unknown>>;
    };
    normalizeForParity: (r: unknown) => Record<string, unknown>;
  };

  // THE RULE IS IMPORTED, NEVER COPIED — a gate that reimplements the normalizer
  // certifies its own copy. If this import ever vanishes the gate is MISCONFIGURED.
  floors.push({ what: 'normalizeForParity imported from the PRODUCTION @pryzm/command-bus (rule imported, never re-derived)', measured: typeof normalizeForParity === 'function' ? 1 : 0, min: 1 });

  const projectContext = new ProjectContext();
  const bimManager = new BimManager(new (THREE as unknown as { Scene: new () => unknown }).Scene(), undefined);
  wnd.projectContext = projectContext;
  wnd.bimManager = bimManager;

  const wallStore = new WallStore(projectContext as never, bimManager as never);
  const roomStore = new RoomStore(projectContext as never, bimManager as never);
  const stores: Record<string, unknown> = { wallStore, roomStore, doorStore, windowStore };
  for (const [k, v] of Object.entries(stores)) wnd[k] = v;

  const ctx = { bimManager, projectContext, stores, commandManager: undefined as unknown };
  const cm = new CommandManager(ctx);
  ctx.commandManager = cm;
  wnd.commandManager = cm;

  const levels = (bimManager as unknown as { getLevels(): Array<{ id: string }> }).getLevels() ?? [];
  const LEVEL = levels[0]?.id ?? 'L0';

  const dtoStores: Record<string, Record<string, unknown>> = { wall: {}, room: {}, door: {}, window: {} };
  const bus = new CommandBus({
    audit: { actorId: 'cert-harness', projectId: 'g-reason-04', clientId: 'node' },
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

  // ── Fixtures ────────────────────────────────────────────────────────────────
  let seq = 0;
  const seedWall = (): string => {
    const w: Record<string, unknown> = {
      id: `w_${seq++}`, type: 'wall', levelId: LEVEL, properties: {}, childrenIds: [],
      baseLine: [P(0, 0, 0), P(5, 0, 0)], height: 3, thickness: 0.2, baseOffset: 0, openings: [],
      metadata: { createdAt: 1, modifiedAt: 1, createdBy: 'cert', version: 1 },
    };
    wallStore.add(w as never);
    return w.id as string;
  };
  const movePayload = (wid: string, dz: number) => {
    const wall = wallStore.getById(wid) as { baseLine: [P3, P3] };
    const prev = clone(wall.baseLine);
    const next = prev.map((p) => ({ x: p.x, y: p.y ?? 0, z: p.z + dz })) as [P3, P3];
    return { wallId: wid, newBaseLine: next, prevBaseLine: prev };
  };
  const baselineOf = (wid: string): string =>
    JSON.stringify((wallStore.getById(wid) as { baseLine: unknown })?.baseLine ?? null);

  // The two invocation envelopes. Same command, same payload shape, same store
  // state — the ONLY difference is who is asking and under what approval.
  const HUMAN_CTX = {
    actor: { kind: 'human', userId: 'u-founder' },
    origin: 'direct-manipulation',
  };
  const AI_CTX = {
    actor: { kind: 'ai', model: 'claude', sessionId: 's-42' },
    origin: 'ai-proposal',
    approval: { approvedBy: { kind: 'human', userId: 'u-founder' }, approvedAt: 1_700_000_000_000, scope: 'single' },
  };

  // ══ Clause (A) — the parity assertion, over the REAL bus ═══════════════════
  // Two dispatches of the SAME verb + payload against IDENTICAL pre-state (two
  // walls seeded byte-identically), differing ONLY in the invocation envelope.
  // The payload's wallId necessarily differs, so it is normalized away by
  // comparing under a stable id substitution — see below. Everything else is
  // compared verbatim, including patch bodies.
  let humanMutated = 0, aiMutated = 0, parityEqual = 0;
  let recHumanRaw: Record<string, unknown> | null = null;
  let recAiRaw: Record<string, unknown> | null = null;
  try {
    const widH = seedWall();
    const beforeH = baselineOf(widH);
    recHumanRaw = await bus.executeCommand('wall.updateBaseline', movePayload(widH, 1), { context: HUMAN_CTX });
    humanMutated = baselineOf(widH) !== beforeH ? 1 : 0;

    const widA = seedWall();
    const beforeA = baselineOf(widA);
    recAiRaw = await bus.executeCommand('wall.updateBaseline', movePayload(widA, 1), { context: AI_CTX });
    aiMutated = baselineOf(widA) !== beforeA ? 1 : 0;

    // Element ids are per-fixture, not behavioural — two dispatches cannot share
    // one wall and still be independent executions. Substituting the two ids to a
    // common token is the ONLY licence taken, and it is taken on the RAW record
    // BEFORE normalization so the normalizer still sees a complete record.
    const sub = (rec: unknown, wid: string) =>
      JSON.parse(JSON.stringify(rec).split(wid).join('<WALL>')) as Record<string, unknown>;
    const nH = normalizeForParity(sub(recHumanRaw, widH));
    const nA = normalizeForParity(sub(recAiRaw, widA));

    parityEqual = deepEqual(nH, nA) ? 1 : 0;
    if (!parityEqual) {
      const d = firstDiff(nH, nA);
      findingNames.push(`(A) PARITY VIOLATION — human and AI dispatch of wall.updateBaseline normalize DIFFERENTLY at: ${d}`);
    }
    lines.push(`(A) parity: same wall.updateBaseline, human envelope vs AI envelope, through the REAL bus → ` +
      (parityEqual ? 'normalizeForParity residues are IDENTICAL. The bus is actor-blind for this verb.'
        : `NOT EQUAL — first difference at ${firstDiff(nH, nA)}.`));
    lines.push(`(A) evidence the envelopes really differed on the records: ` +
      `human.context.origin=${JSON.stringify((recHumanRaw as { context?: { origin?: string } }).context?.origin)} · ` +
      `ai.context.origin=${JSON.stringify((recAiRaw as { context?: { origin?: string } }).context?.origin)} · ` +
      `ai.context.approval=${(recAiRaw as { context?: { approval?: unknown } }).context?.approval ? 'present' : 'ABSENT'}` +
      ' — SIMULATED AI caller (see finding (iii)-2): the envelope is supplied BY THIS GATE, not by an AI dispatcher.');
  } catch (e) { harnessErrors.push('(A): ' + String(e).slice(0, 300)); }

  // MINIMUM EVIDENCE. A parity gate over two no-ops passes vacuously — that is
  // exactly the C10 "emptiness is never a pass" failure, so it exits 2, not 0.
  floors.push({ what: 'the HUMAN dispatch actually executed and mutated the authoritative WallStore', measured: humanMutated, min: 1 });
  floors.push({ what: 'the AI dispatch actually executed and mutated the authoritative WallStore', measured: aiMutated, min: 1 });
  floors.push({ what: 'both records carried non-empty patches (a record with no patches proves no behaviour)', measured: ((recHumanRaw?.patches as unknown[])?.length ?? 0) > 0 && ((recAiRaw?.patches as unknown[])?.length ?? 0) > 0 ? 1 : 0, min: 1 });

  // ══ Control (i) — a BEHAVIOURAL difference MUST fail parity ════════════════
  // Three independent arms over REAL records. If the normalizer trivially
  // satisfied clause (A) by stripping everything, all three would wrongly PASS —
  // which is precisely R5's metrics decision, verified EMPIRICALLY here rather
  // than by reading the comment that states it.
  let ctrlBehavioural = 0;
  const ctrlBehaviouralArms: string[] = [];
  try {
    if (recHumanRaw) {
      const base = clone(recHumanRaw);

      // (i-a) METRICS — the R5 field. Element SETS identical; only the NUMBERS
      // differ. No other field in the record reveals this divergence, which is
      // the whole reason R5 decided KEEP over strip.
      const withMetrics = (area: number) => {
        const r = clone(base);
        r.consequence = {
          commandId: 'cmd-x', kind: 'reconciled',
          provenance: { actor: { kind: 'human' }, origin: 'direct-manipulation' },
          actual: { changed: ['room-k'] },
          metrics: [{ elementId: 'room-k', metric: 'area', before: 12.4, after: area, unit: 'm2' }],
        };
        return r;
      };
      const mA = normalizeForParity(withMetrics(10.8));
      const mB = normalizeForParity(withMetrics(11.9));
      const metricsCaught = !deepEqual(mA, mB);
      ctrlBehaviouralArms.push(`metrics 10.8 vs 11.9 m² (same element set) → ${metricsCaught ? 'FAILS parity ✓ (R5 KEEP verified empirically)' : 'PASSES ✗ — METRICS ARE BEING STRIPPED; the normalizer is blind to a geometry divergence'}`);
      if (!metricsCaught) {
        findingNames.push('(i-a) MISCLASSIFIED FIELD — consequence.metrics is stripped by normalizeForParity. Metrics are BEHAVIOURAL (parity.ts §R5): identical element sets with different numbers is the divergence no other field reveals. RESTORE the KEEP.');
      }

      // (i-b) AFFECTED SET — a different element changed.
      const setA = clone(base); const setB = clone(base);
      (setB as { affectedStores?: string[] }).affectedStores = [...((setB.affectedStores as string[]) ?? []), 'room'];
      const setCaught = !deepEqual(normalizeForParity(setA), normalizeForParity(setB));
      ctrlBehaviouralArms.push(`affectedStores +'room' → ${setCaught ? 'FAILS parity ✓' : 'PASSES ✗ — the affected set is stripped'}`);
      if (!setCaught) findingNames.push('(i-b) MISCLASSIFIED FIELD — affectedStores is stripped by normalizeForParity; a different affected set is behavioural.');

      // (i-c) PATCH BODY — the mutation itself differs.
      const patA = clone(base); const patB = clone(base);
      const p0 = (patB.patches as Array<Record<string, unknown>>)[0];
      if (p0) p0.__behaviouralDelta = 'the two actors wrote different geometry';
      const patchCaught = !deepEqual(normalizeForParity(patA), normalizeForParity(patB));
      ctrlBehaviouralArms.push(`patch body differs → ${patchCaught ? 'FAILS parity ✓' : 'PASSES ✗ — patch content is stripped'}`);
      if (!patchCaught) findingNames.push('(i-c) MISCLASSIFIED FIELD — patch content is stripped by normalizeForParity; the mutation itself is behavioural.');

      ctrlBehavioural = metricsCaught && setCaught && patchCaught ? 1 : 0;
    }
  } catch (e) { harnessErrors.push('(i): ' + String(e).slice(0, 300)); }
  lines.push('(i)  POSITIVE CONTROL · behavioural difference MUST fail parity: ' + ctrlBehaviouralArms.filter(Boolean).join(' · '));
  floors.push({ what: 'POSITIVE control (i) — all three behavioural differences (metrics, affected set, patch) are CAUGHT as non-equal', measured: ctrlBehavioural, min: 1 });

  // ══ Control (ii) — a PROVENANCE-ONLY difference MUST pass parity ═══════════
  // Every excluded field made to differ AT ONCE, behaviour held identical. This
  // is the arm that proves the normalizer is not comparing NOTHING — paired with
  // (i), which proves it is not comparing EVERYTHING.
  let ctrlProvenance = 0;
  try {
    if (recHumanRaw) {
      const behaviour = {
        consequence: {
          kind: 'reconciled', actual: { changed: ['room-k'] },
          metrics: [{ elementId: 'room-k', metric: 'area', before: 12.4, after: 10.8, unit: 'm2' }],
        },
      };
      const a = clone(recHumanRaw) as Record<string, unknown>;
      const b = clone(recHumanRaw) as Record<string, unknown>;

      a.id = '01J000000000000000000000AAA';
      b.id = '01J999999999999999999999ZZZ';
      a.audit = { actorId: 'u-founder', projectId: 'g-reason-04', clientId: 'tab-1', timestamp: 1 };
      b.audit = { actorId: 'ai-agent', projectId: 'g-reason-04', clientId: 'tab-9', timestamp: 999_999 };
      a.context = clone(HUMAN_CTX);
      b.context = clone(AI_CTX);
      for (const p of (a.patches as Array<Record<string, unknown>>) ?? []) p.capturedAt = 1;
      for (const p of (b.patches as Array<Record<string, unknown>>) ?? []) p.capturedAt = 999_999;
      a.consequence = { ...clone(behaviour.consequence), commandId: 'cmd-human', provenance: { actor: clone(HUMAN_CTX.actor), origin: 'direct-manipulation' } };
      b.consequence = { ...clone(behaviour.consequence), commandId: 'cmd-ai', provenance: { actor: clone(AI_CTX.actor), origin: 'ai-proposal', approval: clone(AI_CTX.approval) } };

      const nA = normalizeForParity(a); const nB = normalizeForParity(b);
      ctrlProvenance = deepEqual(nA, nB) ? 1 : 0;
      const leaked = ctrlProvenance ? null : firstDiff(nA, nB);
      lines.push('(ii) POSITIVE CONTROL · provenance-only difference MUST pass parity: ' +
        'id · audit.actorId · audit.clientId · audit.timestamp · context.actor · context.origin · context.approval · ' +
        'patches[].capturedAt · consequence.provenance · consequence.commandId ALL differ, behaviour held identical → ' +
        (ctrlProvenance ? 'residues IDENTICAL ✓ — the exclusion list is exactly the provenance set.'
          : `NOT EQUAL ✗ — a provenance field LEAKED into the behavioural residue at: ${leaked}`));
      if (!ctrlProvenance) {
        findingNames.push(`(ii) MISCLASSIFIED FIELD — a PROVENANCE field survives normalizeForParity at '${leaked}'. C75: provenance is NOT behaviour; it must be excluded, or every real human-vs-AI comparison fails for the wrong reason.`);
      }
    }
  } catch (e) { harnessErrors.push('(ii): ' + String(e).slice(0, 300)); }
  floors.push({ what: 'POSITIVE control (ii) — a provenance-ONLY difference PASSES parity (the normalizer is not comparing nothing)', measured: ctrlProvenance, min: 1 });

  for (const err of harnessErrors) {
    lines.push('harness error: ' + err);
    findingNames.push('harness error (never merged with "no change"): ' + err.slice(0, 120));
  }

  return {
    gate: 'check-ai-human-parity',
    floors,
    lines,
    findings: findingNames.length,
    // ONE declared finding: AI-PATH-NOT-INDEPENDENTLY-DISPATCHABLE, pinned in
    // tools/ga-gate/gate-newly-measured.json as NEWLY MEASURED (the instrument
    // arrived; nobody chose to ship this). Everything else here is hard-0 — a
    // parity violation or a misclassified field is red and stays red.
    declared: 1,
    findingNames,
  };
}

run()
  .then((r) => process.exit(reportGate(r)))
  .catch((e) => {
    console.error('check-ai-human-parity: harness threw — MISCONFIGURED\n', e);
    process.exit(2);
  });
