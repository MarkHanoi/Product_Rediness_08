# ADR-012 — Cross-element cascade-rule registration

* **Status:** Accepted
* **Sprint:** S10 (`phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S10-T6, lines 1052-1075)
* **Date:** 2026-04-27
* **Supersedes:** —
* **Superseded by:** —

## Context

PRYZM 1 expressed cascades as **inline branches inside the
command itself**.  `src/commands/walls/CascadeWallBaselineCommand.ts:223`
is the canonical example:

```ts
//  PRYZM 1 — abridged
class CascadeWallBaselineCommand {
  execute(ctx) {
    const affected = bimManager.findWallsJoiningAt(this.wallId);
    for (const id of affected) {
      new RecomputeMiterCommand(id).execute(ctx);   // ← inline fan-out
    }
  }
}
```

Three problems with this pattern:

1. **Coupling.**  Wall code knows the *names* of every other element type
   that may need to recompute when the wall's baseline moves.  Any new
   element family means editing every existing element family.
2. **No depth guard.**  Pathological topologies (a cycle of N walls all
   join-cascade-coupled) recurse until stack overflow.  PRYZM 1 has had
   two production bugs of this shape in the last quarter (logged in
   PRYZM-1 issues #4112 and #4287 — both root-caused to unbounded
   cascade fan-out from a single `WallTool.commitMove` invocation).
3. **No observability.**  Cycles are silently dropped (or worse, infinite-loop)
   with no telemetry surface for the FRP layer to subscribe to.

S10 grows this surface significantly — `wall.move`, `wall.transform`,
`wall.join`, `wall.cut`, `wall.changeLevel`, `wall.createOpening`,
`wall.bulkSetVisuals`, `wall.setLayers` all need to fan out to *some*
set of follow-on commands.  Hard-wiring every fan-out per the PRYZM 1
pattern would multiply the coupling problem.

## Decision

Lift the cascade pattern into a **generic L4 service**, `CascadeRunner`,
in `packages/command-bus/src/cascade.ts`, that accepts a registry of
`CascadeRule` objects:

```ts
export interface CascadeRule {
  /** Command types this rule fires for — matched against
   *  `cmd.type` at dispatch time. */
  readonly appliesTo: readonly string[];

  /** Returns the entity ids that must recompute when `rootCmd` runs. */
  resolveAffected(rootCmd: { type: string; payload: unknown }): readonly string[];

  /** Synthesises the follow-on cascade command for each affected id. */
  synthesize(
    affectedId: string,
    rootCmd: { type: string; payload: unknown },
  ): { type: string; payload: unknown };
}
```

`CascadeRunner.dispatch(rootCmd)` performs Kahn-style BFS:

```text
visited = Set<EntityId>()
queue   = [{ cmd: rootCmd, depth: 0 }]
while queue:
    { cmd, depth } = queue.shift()
    if depth > MAX_CASCADE_DEPTH: throw CascadeDepthExceededError
    entityId = extractEntityId(cmd)
    if visited.has(entityId): emit `cascade.cycle.dropped`; continue
    visited.add(entityId); results.push(cmd)
    for each rule that appliesTo(cmd.type):
        for each affectedId in rule.resolveAffected(cmd):
            queue.push({
              cmd:   rule.synthesize(affectedId, rootCmd),
              depth: depth + 1,
            })
return results
```

* **`MAX_CASCADE_DEPTH = 16`** — empirical, see S10 blocker R2 in the
  spec.  Pathological topologies (cycle of N walls all join-cascade-coupled)
  terminate via the visited-set; the depth guard exists as a separate
  safety net for malformed rule graphs that visit FRESH entities at
  each step (would otherwise be unbounded).

* **Cycle drops are emitted as OTel SPAN EVENTS** named
  `cascade.cycle.dropped` with attributes `entity.id` + `depth`.  At
  S10 the OTel surface is a `null`-safe duck-typed object — production
  wiring lands when the OTel collector arrives in S11+.

* **Rule registration is L3 (committer)** — `bootstrap.ts` calls
  `cascadeRunner.register(rule)` once for each cross-element relationship
  the active plugin set declares.  The wall plugin's S10 wiring registers
  three rules: `wall.move → wall.recomputeMiter`,
  `wall.transform → wall.recomputeMiter`, and
  `wall.join → wall.recomputeMiter` for the *other* wall in the join.

## Consequences

* **(+)** New element families add cascade behaviour by registering rules
  at bootstrap time; no edits to existing handlers.
* **(+)** Single, audited depth-guard + cycle-drop path.  All cascade
  observability flows through one OTel surface.
* **(+)** Pure-function rule shape — `resolveAffected` and `synthesize`
  are deterministic and unit-testable in isolation.
* **(−)** Two-step debugging: a cascade chain is now spread across
  registered rules instead of inlined into the command.  Mitigated by
  the OTel span tree — every dispatched command is a child span of the
  root, so the chain is visible in any OTel-aware UI.
* **(−)** Rule fan-out happens **after** the root command commits — so
  a cascaded miter recompute that fails does NOT roll the root back.
  This matches PRYZM 1 semantics (where the inline fan-out also ran
  after the root mutation).  S11+ is expected to introduce a
  `CascadeTransaction` for atomic-rollback semantics; out of scope for
  S10.

## References

* Implementation: `packages/command-bus/src/cascade.ts` (header cites this ADR)
* Spec: `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S10-T6 (lines 1052-1075)
* PRYZM 1 prior art: `src/commands/walls/CascadeWallBaselineCommand.ts:223`
* Related ADRs: ADR-008 (wall handler triage), ADR-013 (intent resolver)
