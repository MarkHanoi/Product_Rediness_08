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

export class ConsequencePreviewService implements ConsequencePreviewProvider {
  /**
   * @param planners      keyed by the CANONICAL (semantic) command type, e.g. `'wall.move'`.
   * @param context       a factory that materialises the read-only `PlanningContext` from
   *                      the live stores at the moment of preview — the planner never
   *                      reaches for globals; the caller supplies the views (consequence.ts).
   */
  constructor(
    private readonly planners: ReadonlyMap<string, ConsequencePlanner<WallMoveCommand>>,
    private readonly context: () => PlanningContext,
  ) {}

  async preview(command: PreviewCommand): Promise<ConsequencePlan | null> {
    const normalized = this.normalize(command);
    if (!normalized) return null;
    const planner = this.planners.get(normalized.type);
    if (!planner) return null;
    // The ONE call. `plan()` is contractually pure (G-REASON-01): no dispatch, no bus, no
    // store write, no event, no undo push. This service adds nothing on top — it routes
    // and returns. That is the whole reason preview is not an `executeCommand` mode.
    return planner.plan(normalized, this.context());
  }

  /**
   * Map a dispatched `(type, payload)` onto the semantic `WallMoveCommand` the planner
   * answers for. `wall.updateBaseline` (the live verb) and `wall.move` (the refused-but-
   * semantic verb, L-49) both resolve to the `'wall.move'` planner key.
   */
  private normalize(command: PreviewCommand): WallMoveCommand | null {
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
}
