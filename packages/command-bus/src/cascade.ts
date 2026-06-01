// CascadeRunner — cross-element cascade-rule registration (S10-T6).
//
// Lifts the inline cascade logic from `src/commands/walls/CascadeWallBaselineCommand.ts:223`
// (PRYZM 1) into a generic L4 service per
// `code-level ADR docs/02-decisions/adrs/0012-cross-element-cascade-rule-registration.md`.
//
// CONTRACT (spec PHASE-1B-Q2-M4-M6 §S10 typed contracts, line 1059):
//
//   • A `CascadeRule` declares (1) which root command types it fires for
//     (`appliesTo`), (2) which entity ids must recompute (`resolveAffected`),
//     and (3) how to synthesise the follow-on cascade command for each
//     affected id (`synthesize`).
//
//   • `CascadeRunner.dispatch(rootCmd)` performs Kahn-style BFS:
//
//        visited = Set<EntityId>()
//        queue   = [{ cmd: rootCmd, depth: 0 }]
//        while queue:
//            { cmd, depth } = queue.shift()
//            if depth > MAX_CASCADE_DEPTH: throw CascadeDepthExceededError
//            entityId = extractEntityId(cmd)
//            if visited.has(entityId): emit `cascade.cycle.dropped`; continue
//            visited.add(entityId); results.push(cmd)
//            for each rule that appliesTo(cmd.type):
//                for each affectedId in rule.resolveAffected(cmd):
//                    queue.push({
//                      cmd:   rule.synthesize(affectedId, rootCmd),
//                      depth: depth + 1,
//                    })
//        return results
//
//   • `MAX_CASCADE_DEPTH = 16` — empirical, see S10 blocker R2 in the spec.
//     Pathological topologies (cycle of N walls all join-cascade-coupled)
//     terminate via the visited-set; the depth guard exists as a separate
//     safety net for malformed rule graphs that visit FRESH entities at
//     each step (would otherwise be unbounded).
//
//   • Cycle drops are emitted as OTel SPAN EVENTS named `cascade.cycle.dropped`
//     with attributes `entity.id` + `depth`.  At S10 the OTel surface is
//     a `null`-safe duck-typed object — production wiring lands when
//     `pryzm.cascade.dispatch` is added to the bus' `withSpan` chain
//     (S10-T10 wiring; the runner ITSELF stays decoupled from the bus
//     so it can be unit-tested without a tracer provider).

import type { Patch } from './types.js';

/** Minimal command shape consumed by the cascade runner.  Compatible with
 *  the wider `Command` notion used by the bus (`{ type, payload }`).  We
 *  do NOT depend on the bus' richer `EventRecord` here — the runner is a
 *  PURE planner that returns a list of follow-on commands; the BUS is
 *  the executor.  Keeping the runner decoupled means the same instance
 *  can plan a cascade in tests, in dry-run "what-if" tooling, and at
 *  command-execute time without changes. */
export interface CascadeCommand {
  readonly type: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

/** Tiny duck-type around an OTel span — covers the only two methods the
 *  runner uses (`addEvent`, `setAttribute`) so production code that wires
 *  `pryzm.cascade.dispatch` via `withSpan` can pass the live span in,
 *  while tests can pass `undefined` (cycle drops then become silent). */
export interface CascadeOtelSpan {
  addEvent(name: string, attrs?: Readonly<Record<string, unknown>>): void;
  setAttribute(key: string, value: string | number | boolean): void;
}

export interface CascadeContext {
  /** Read-only stores keyed by store id — passed straight through to
   *  `rule.resolveAffected` so a rule can inspect e.g. neighbouring
   *  wall geometry to decide which ids cascade. */
  readonly stores: Readonly<Record<string, unknown>>;
  /** Optional span for cycle-drop / depth-exceeded telemetry.  When
   *  absent the runner still works — telemetry is a no-op. */
  readonly otel?: CascadeOtelSpan;
}

/** Default entity-id extractor — mirrors spec line 1111
 *  (`cmd.payload.id ?? cmd.payload.wallId`).  A rule that needs a
 *  different field can override at registration time via
 *  `CascadeRunner.register({ ..., extractEntityId })`. */
export function defaultExtractEntityId(cmd: CascadeCommand): string {
  const p = cmd.payload as Record<string, unknown>;
  const id = (p.id ?? p.wallId ?? p.entityId) as string | undefined;
  if (typeof id !== 'string' || id.length === 0) {
    throw new CascadeRunnerError(
      `cascade: cannot extract entity id from cmd.type=${cmd.type} ` +
        `(payload has no string 'id' / 'wallId' / 'entityId' field). ` +
        `Provide a custom extractEntityId on the CascadeRule.`,
    );
  }
  return id;
}

/** A cascade rule.  See `packages/command-bus/__tests__/cascade.test.ts`
 *  for canonical worked examples (single-step, T-junction, cycle drop). */
export interface CascadeRule {
  /** Stable identifier — used for OTel attributes + dedupe at register
   *  time.  Two rules with the same key throw at register. */
  readonly key: string;
  /** Returns true iff this rule fires for the given root cmd type. */
  appliesTo(cmdType: string): boolean;
  /** Walk: from a root cmd → the entity ids whose state needs to
   *  recompute.  The list MAY contain the root entity itself; the
   *  runner's visited-set will drop it on the second visit. */
  resolveAffected(
    cmd: CascadeCommand,
    ctx: CascadeContext,
  ): readonly string[];
  /** Synth: given an affected entity id + the root cmd that originated
   *  the cascade, produce the follow-on cmd that the runner will then
   *  re-walk (so a recompute can ITSELF cascade further). */
  synthesize(
    affectedId: string,
    rootCmd: CascadeCommand,
    ctx: CascadeContext,
  ): CascadeCommand;
  /** Optional override of the default `payload.id ?? payload.wallId`
   *  extraction — useful when the cascade payload uses a different
   *  field name (e.g. `slabId` for slab outline cascades). */
  readonly extractEntityId?: (cmd: CascadeCommand) => string;
}

/** Empirical depth cap — see S10 blocker R2 in the spec.  Visited-set
 *  alone protects against cycles of fixed entities; this guards against
 *  rules that synthesise FRESH entities at each step (would otherwise
 *  be unbounded).  16 is generous: the deepest realistic chain in
 *  PRYZM 1 is `wall.move → cascade neighbour → cascade neighbour → ...`
 *  through ~5 walls. */
export const MAX_CASCADE_DEPTH = 16;

export class CascadeRunnerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CascadeRunnerError';
  }
}

export class CascadeDepthExceededError extends CascadeRunnerError {
  constructor(public readonly depth: number) {
    super(
      `cascade: depth ${depth} exceeded MAX_CASCADE_DEPTH (${MAX_CASCADE_DEPTH}). ` +
        `Likely a cascade rule synthesising fresh entity ids at each step.`,
    );
    this.name = 'CascadeDepthExceededError';
  }
}

export interface CascadeDispatchStats {
  readonly entitiesVisited: number;
  readonly cyclesDropped: number;
  readonly maxDepth: number;
  readonly commandsTotal: number;
}

export class CascadeRunner {
  private readonly rules = new Map<string, CascadeRule>();

  register(rule: CascadeRule): void {
    if (this.rules.has(rule.key)) {
      throw new CascadeRunnerError(
        `cascade rule already registered: ${rule.key}`,
      );
    }
    if (typeof rule.appliesTo !== 'function' ||
        typeof rule.resolveAffected !== 'function' ||
        typeof rule.synthesize !== 'function') {
      throw new CascadeRunnerError(
        `${rule.key}: a CascadeRule must implement appliesTo + resolveAffected + synthesize.`,
      );
    }
    this.rules.set(rule.key, rule);
  }

  unregister(key: string): boolean {
    return this.rules.delete(key);
  }

  has(key: string): boolean {
    return this.rules.has(key);
  }

  /** Convenience for tests + dev tools. */
  get registeredKeys(): readonly string[] {
    return [...this.rules.keys()];
  }

  /** Plan a cascade: BFS from `rootCmd`, returning the ordered list of
   *  commands that should be executed (root first, then synthesised
   *  follow-ons in BFS order).  The runner does NOT execute anything —
   *  callers feed the returned list to the bus' `executeCommand` in
   *  order.  See `apps/editor/src/bootstrap.ts` for wiring. */
  dispatch(
    rootCmd: CascadeCommand,
    ctx: CascadeContext,
  ): { readonly commands: readonly CascadeCommand[]; readonly stats: CascadeDispatchStats } {
    const visited = new Set<string>();
    let cyclesDropped = 0;
    let maxDepth = 0;
    const queue: Array<{ cmd: CascadeCommand; depth: number }> = [
      { cmd: rootCmd, depth: 0 },
    ];
    const results: CascadeCommand[] = [];

    while (queue.length > 0) {
      const { cmd, depth } = queue.shift()!;
      if (depth > MAX_CASCADE_DEPTH) {
        ctx.otel?.setAttribute('cascade.depth.exceeded', true);
        throw new CascadeDepthExceededError(depth);
      }
      if (depth > maxDepth) maxDepth = depth;

      // Find the FIRST applicable rule to extract the entity id.  The
      // entity-id field is usually consistent across rules that target
      // the same element family (id / wallId / slabId), so any rule that
      // matches will give us the right extractor.  When no rule matches,
      // we fall back to the default extractor — the cmd still gets
      // pushed to results (it counts as visited), it just doesn't
      // propagate further.
      const matchingRules = [...this.rules.values()].filter(r => r.appliesTo(cmd.type));
      const extractor = matchingRules[0]?.extractEntityId ?? defaultExtractEntityId;
      const entityId = extractor(cmd);

      if (visited.has(entityId)) {
        cyclesDropped += 1;
        ctx.otel?.addEvent('cascade.cycle.dropped', {
          'entity.id': entityId,
          depth,
          'cmd.type': cmd.type,
        });
        continue;
      }
      visited.add(entityId);
      results.push(cmd);

      for (const rule of matchingRules) {
        const affected = rule.resolveAffected(cmd, ctx);
        for (const affectedId of affected) {
          queue.push({
            cmd: rule.synthesize(affectedId, rootCmd, ctx),
            depth: depth + 1,
          });
        }
      }
    }

    const stats: CascadeDispatchStats = {
      entitiesVisited: visited.size,
      cyclesDropped,
      maxDepth,
      commandsTotal: results.length,
    };
    ctx.otel?.setAttribute('cascade.commands.total', stats.commandsTotal);
    ctx.otel?.setAttribute('cascade.entities.visited', stats.entitiesVisited);
    ctx.otel?.setAttribute('cascade.depth.max', stats.maxDepth);
    if (cyclesDropped > 0) {
      ctx.otel?.setAttribute('cascade.cycles.dropped', cyclesDropped);
    }
    return { commands: results, stats };
  }
}

// Re-export the JSON-Patch type so callers building cascade-aware
// handlers don't pull `immer` directly.
export type { Patch };
