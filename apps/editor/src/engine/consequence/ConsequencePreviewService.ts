// ConsequencePreviewService — R3 of docs/03-execution/plans/BIM30-REASONING-LOOP-PLAN.md.
//
// The PREVIEW invocation surface (ADR-0322 §3, STR-06 §4). It answers the question
// "what WOULD this command do?" by producing the one authoritative `ConsequencePlan`
// (packages/command-bus/src/consequence.ts) WITHOUT mutating anything.
//
// ── WHY THIS DOES NOT ROUTE THROUGH `executeCommand` (the bus) ────────────────────────
// `CommandBus.executeCommand` MUTATES: it dispatches a handler, writes stores, pushes
// undo, sets dirty flags, emits events. Adding a `{mode:'preview'}` branch there would
// force ONE of two defects:
//   • L1 command-bus would have to import an L7 planner to answer the preview branch —
//     an UPWARD import, the exact violation `check-layer-boundaries.ts` exits 3 on; or
//   • the bus would gain a bespoke preview path that re-implements consequence logic,
//     which is the "two preview implementations" ADR-0322 §8 forbids by name.
// So preview is NOT a bus mode. It is a SEPARATE L7 capability that reads the SAME
// contract type family. The bus is never touched: `preview()` below calls
// `planner.plan()` and returns — no dispatch, no handler, no store write, no event.
// The planner's own contract (consequence.ts) forbids it to mutate (G-REASON-01), so the
// whole path is read-only by construction, and the purity gate proves it
// (tools/rac-conformance/certification/gates/check-preview-purity.ts).
//
// ── WHY THIS LIVES IN apps/editor/src/engine (L7) ────────────────────────────────────
// Same reasoning as WallMoveConsequencePlanner.ts: the CONTRACT is L1
// (`@pryzm/command-bus`), so anything may implement it; the SERVICE composes L7 planners
// and reads L2/L3 store views, so it must sit at the top where every edge is downward.
// All runtime imports here are `import type` (erased) — the concrete planners and the
// `PlanningContext` factory are INJECTED (see the composition file), so this file couples
// nothing at import and is testable in a plain node env with doubles.

import type {
  ConsequencePlan,
  ConsequencePlanner,
  PlanningContext,
} from '@pryzm/command-bus';
import type { WallMoveCommand } from './WallMoveConsequencePlanner.js';

/**
 * A command as it arrives at the preview surface — the SAME `(type, payload)` shape the
 * bus dispatches (ADR-0324 §1: one funnel, never a parallel action taxonomy). The service
 * reasons about the SEMANTIC operation, not the bus verb (L-49): `wall.move` is a
 * deliberately-refused dead verb, `wall.updateBaseline` is the live mutation, and BOTH map
 * to the one `wall.move` planner — the plan is CONSUMED by the executor in R4, never
 * dispatched from here.
 */
export interface PreviewCommand {
  readonly type: string;
  readonly payload: unknown;
}

/**
 * The minimal capability the overlay (and any other preview consumer) depends on. Kept as
 * an interface so the overlay imports no engine singletons — it is handed a provider and
 * renders whatever `ConsequencePlan` comes back. Tests inject a fake provider; production
 * injects {@link ConsequencePreviewService}.
 */
export interface ConsequencePreviewProvider {
  /** Compute the plan for `command`, or `null` when no planner is registered for its type. */
  preview(command: PreviewCommand): Promise<ConsequencePlan | null>;
}

/** The wall.move payload as the planner expects it (`WallMoveCommand.payload`). */
type WallMovePayload = WallMoveCommand['payload'];

/** The `wall.updateBaseline` payload keys (plugins/wall UpdateWallBaseline, pinned by L-49). */
interface UpdateBaselinePayload {
  readonly wallId: string;
  readonly newBaseLine: WallMovePayload['baseLine'];
  readonly prevBaseLine?: WallMovePayload['baseLine'];
}

/**
 * Map a dispatched `(type, payload)` onto the semantic `WallMoveCommand` the planner
 * answers for. `wall.updateBaseline` (the live verb) and `wall.move` (the refused-but-
 * semantic verb, L-49) both resolve to the `'wall.move'` planner key.
 *
 * Exported (R4) so the EXECUTION service normalises with the SAME rule the preview
 * used — two normalisers would let preview and execute plan different semantic
 * commands for one dispatch, which is a plan-fidelity divergence minted at the front
 * door (the G-REASON-03 failure class, manufactured rather than measured).
 */
export function normalizeToWallMove(command: PreviewCommand): WallMoveCommand | null {
  if (command.type === 'wall.move') {
    const p = command.payload as Partial<WallMovePayload> | undefined;
    if (!p || typeof p.id !== 'string' || !p.baseLine) return null;
    return { type: 'wall.move', payload: { id: p.id, baseLine: p.baseLine } };
  }
  if (command.type === 'wall.updateBaseline') {
    const p = command.payload as Partial<UpdateBaselinePayload> | undefined;
    if (!p || typeof p.wallId !== 'string' || !p.newBaseLine) return null;
    return { type: 'wall.move', payload: { id: p.wallId, baseLine: p.newBaseLine } };
  }
  return null;
}

// ─── The GENERIC normaliser registry (C78 §5 · U-INV-5) ───────────────────────────────
//
// §PLANNER-REGISTRY-GENERIC (2026-08-13). `normalizeToWallMove` above is a PER-VERB
// function, and until now it was the only normaliser the three composition roots had.
// That made the whole consequence surface structurally single-family: a second planner
// could be put in the `planners` map and would STILL be unreachable, because every entry
// point funnelled through a function that returns `null` for any verb that is not
// `wall.move` / `wall.updateBaseline`. That is exactly U-INV-5's defect — a registry
// whose genericity is nominal because the lookup ahead of it is hard-coded — and it is
// why the Phase 6c `wall.create` planner sat authored-but-unreachable (C70 §4.2).
//
// The fix is a MAP from bus verb → semantic command, not a second `if`. Adding the third
// row of the golden-operation matrix (`opening.move`) is then a map entry plus a planner,
// with NO edit to any service: the services below take the map and know no verb names.
//
// Each rule returns `null` on a payload it cannot form a semantic command from. `null`
// remains a first-class answer meaning "this verb is not one I normalise", and the
// executor already distinguishes it from "no planner registered" via the typed
// `no-normalizer-for-verb` / `no-planner-registered` sub-reasons — that distinction is
// preserved unchanged and is what keeps a capability gap from printing as staleness.

/** A semantic command as the registry produces it: a canonical planner key + payload. */
export interface SemanticCommand {
  readonly type: string;
  readonly payload: unknown;
}

/** One normalisation rule: a dispatched command → a semantic command, or `null`. */
export type NormalizerRule = (command: PreviewCommand) => SemanticCommand | null;

/**
 * Map a dispatched `wall.create` onto the semantic `wall.create` command the Phase 6c
 * planner answers for (`WallCreateConsequencePlanner.WallCreateCommand`).
 *
 * The bus verb and the semantic verb are the SAME here — unlike wall.move, whose live
 * verb is `wall.updateBaseline` — so this rule is a VALIDATING pass-through rather than
 * a rename. It is still a rule and not a special case in the service, because the
 * validation is real: the planner's contract distinguishes "no baseLine supplied"
 * (a typed UNDETERMINED it handles internally) from "not a create payload at all".
 *
 * Deliberately PERMISSIVE about missing fields: `CreateWallPayload` makes every field
 * optional (`Wall.parse({})` is a valid wall), and the planner already answers the
 * no-baseLine case with a typed UNDETERMINED rather than a crash. Rejecting here would
 * turn a question the planner CAN answer into a silent `null` — the failure-as-emptiness
 * defect, moved one layer upstream. Only a structurally absent payload is refused.
 */
export function normalizeToWallCreate(command: PreviewCommand): SemanticCommand | null {
  if (command.type !== 'wall.create') return null;
  const p = command.payload;
  if (p === null || p === undefined || typeof p !== 'object') return null;
  return { type: 'wall.create', payload: p };
}

/**
 * THE canonical normaliser registry — bus verb → rule. The three composition roots share
 * this ONE map, for the same reason preview and execute shared ONE normaliser function
 * before it: two registries would let preview and execute form different semantic
 * commands for one dispatch (the G-REASON-03 divergence class).
 */
export const CONSEQUENCE_NORMALIZERS: ReadonlyMap<string, NormalizerRule> = new Map<
  string,
  NormalizerRule
>([
  ['wall.move', normalizeToWallMove],
  ['wall.updateBaseline', normalizeToWallMove],
  ['wall.create', normalizeToWallCreate],
]);

/**
 * The GENERIC normalise entry point. Looks the verb up in `registry` and applies its
 * rule; unknown verbs answer `null` exactly as the per-verb function did, so the typed
 * `no-normalizer-for-verb` path downstream is unchanged.
 *
 * The registry is a PARAMETER with a default so tests can drive a narrower or wider set
 * without mutating module state — the same injection discipline every other collaborator
 * in this subsystem follows.
 */
export function normalizeConsequenceCommand(
  command: PreviewCommand,
  registry: ReadonlyMap<string, NormalizerRule> = CONSEQUENCE_NORMALIZERS,
): SemanticCommand | null {
  return registry.get(command.type)?.(command) ?? null;
}

export class ConsequencePreviewService implements ConsequencePreviewProvider {
  /**
   * @param planners      keyed by the CANONICAL (semantic) command type, e.g. `'wall.move'`.
   * @param context       a factory that materialises the read-only `PlanningContext` from
   *                      the live stores at the moment of preview — the planner never
   *                      reaches for globals; the caller supplies the views (consequence.ts).
   */
  /**
   * @param planners   keyed by the CANONICAL (semantic) command type, e.g. `'wall.move'`,
   *                   `'wall.create'`. The value type is `ConsequencePlanner<never>` —
   *                   the FAMILY-AGNOSTIC form. It used to be
   *                   `ConsequencePlanner<WallMoveCommand>`, which made the map's key
   *                   generic but its VALUE single-family: a `wall.create` planner could
   *                   not be put in it without a cast, and the commit that authored one
   *                   declared exactly this as its blocker. `never` is the correct
   *                   variance here — a planner accepting `never` accepts whatever its
   *                   own normaliser rule produced, and the pairing of rule↔planner (not
   *                   the map's type) is what keeps them in step.
   * @param context    a factory that materialises the read-only `PlanningContext` from
   *                   the live stores at the moment of preview — the planner never
   *                   reaches for globals; the caller supplies the views (consequence.ts).
   * @param normalizers the bus-verb → semantic-command registry. Injected (default:
   *                   {@link CONSEQUENCE_NORMALIZERS}) so this service hard-codes NO verb
   *                   name at all — C78 §5 / U-INV-5.
   */
  constructor(
    private readonly planners: ReadonlyMap<string, ConsequencePlanner<never>>,
    private readonly context: () => PlanningContext,
    private readonly normalizers: ReadonlyMap<string, NormalizerRule> = CONSEQUENCE_NORMALIZERS,
  ) {}

  async preview(command: PreviewCommand): Promise<ConsequencePlan | null> {
    const normalized = this.normalize(command);
    if (!normalized) return null;
    const planner = this.planners.get(normalized.type);
    if (!planner) return null;
    // The ONE call. `plan()` is contractually pure (G-REASON-01): no dispatch, no bus, no
    // store write, no event, no undo push. This service adds nothing on top — it routes
    // and returns. That is the whole reason preview is not an `executeCommand` mode.
    return planner.plan(normalized as never, this.context());
  }

  /** Delegates to the module-level GENERIC normaliser — ONE rule set, three consumers. */
  private normalize(command: PreviewCommand): SemanticCommand | null {
    return normalizeConsequenceCommand(command, this.normalizers);
  }
}
