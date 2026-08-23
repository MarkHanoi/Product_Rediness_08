# ADR-0361 — A project teardown is an OWNER, not an event subscription

> **Date**: 2026-08-23 · **Status**: ACCEPTED · **Lane**: ISO45
> **Contract**: [C13 §3.14, §3.15](../contracts/C13-PROJECT-LIFECYCLE-AND-ISOLATION.md) · **Issue log**: L-8100..L-8180
> **Amends**: [C13 §3.9](../contracts/C13-PROJECT-LIFECYCLE-AND-ISOLATION.md) · **Extends**: [ADR-0298](./ADR-0298-isolation-probes-are-declared-not-discovered.md)

---

## Context

The founder opened a project and the C13 audit reported another project's geometry inside it:

```
scene.foreignElement×37  (instanced-group-stair-railing_L1787150975010_… ; aada3f1f-… ⇐ stair-railing ; …)
scope.foreignProject×1   (site.model still owned by proj-1787150674754-fe43bbbc18c5)
```

`L1787150975010` is a level of the project the second finding names. Thirty-six stair-railings and their aggregate `InstancedMesh` had survived a project switch.

`InstancedElementRenderer` documents its own project-close contract in its header — *"When the scene is cleared (project close), call `clear()`"* — and `clear()` is correct, reviewed, and unit-tested. It had **one** production call site:

```ts
// apps/editor/src/engine/initScene.ts:708
window.addEventListener('clear-project', () => { … instancedElementRenderer.clear() … });
```

Measured 2026-08-23, with two tools because a single grep is not proof: `'clear-project'` has **8 occurrences repo-wide, every one a listener or a doc comment, and zero dispatchers**; `grep -c 'clear-project' packages/event-bus/src/catalog.ts` → **0**, so it was not even a declared event. The teardown had never run. Not once, on any project switch, since it was written.

This is the third recurrence of one shape (L-224 → L-320 → L-8100): correct teardown code, reachable from nothing.

## The decision

**A project-scoped surface is torn down by a registered OWNER, not by an event subscription.**

Concretely, three rules — C13 §3.14:

1. A teardown MUST be driven by a `ProjectScopeRegistry` entry, or triggered by an event **declared in `packages/event-bus/src/catalog.ts`**. An undeclared event cannot be emitted by any typed producer, so a teardown wired to one is unwired by construction.
2. **A rendering aggregate is project-scoped state** and needs a named owner exactly like a store.
3. **A probe MUST be able to contradict its own teardown.**

## Why not simply re-point the listener at `bim-project-cleared`?

Because that is the same fragile shape with a different string literal in it, and the shape is what failed. The one-line fix would have been correct today and silently dead after the next event rename — which is precisely the history: `'clear-project'` was presumably live once.

An owner is structurally different: `ClearProjectCommand` iterates the registry, so a scope cannot become unreachable without deleting the registration, which is a visible edit rather than an invisible drift. It is also the mechanism the other 61 scopes already use, so this removes a special case rather than adding one.

## Why a rendering aggregate is the WORST case for event-shaped teardown

`InstancedElementRenderer._hashGeometry` keys groups by

```
${elementType}_${levelId}_${idx}_${vtx}_${x0}_${y0}_${z0}_${material.uuid}
```

— (elementType × level × geometry × material). **There is no project in the key.** A per-element store can at least be reconciled against a snapshot's id set; an aggregate has **no project identity to be torn down by** and no per-element handle at all (an `InstancedMesh` exposes no per-instance `userData`). Its only correct teardown is bulk, which means its only correct teardown is the one that was dead.

## Why the probe must not reset its own stamp on a lifecycle event

`render.instancedElements` answers *"which project does the state you hold belong to?"* from a stamp taken at load. The stamp is cleared **only inside `clear()`** — never by a `bim-project-cleared` listener.

That asymmetry is the entire mechanism. If a "a switch happened" listener reset the stamp, then a switch on which the teardown **failed** would reset it too, and the probe would report the incoming project as the owner of the outgoing project's geometry — laundering the exact leak it exists to catch. **A probe that can only ever agree with its teardown is decoration.** The regression suite asserts the contradiction case directly.

`groupCount === 0` remains the only route to a `null` answer, so a stale stamp can never make a genuinely empty renderer look dirty. A non-empty renderer answers with a project id or with an explicit `<instanced-owner-unstamped>` marker, never `null`: *"I hold 37 groups and cannot say whose"* is not cleanliness (the L-713 rule).

## Consequences

**Accepted.**

* The audit gains `scene.foreignInstancedGroup`, attributing aggregates by the `levelId` they already stamp. This **removes a permanent false positive** — the synthetic `instanced-group-…` id can never appear in a snapshot, so every aggregate had been reported as a foreign element on every load in every project. A permanently-red audit is ignored, which costs what a blind one costs.
* ⛔ The id arm is suppressed **only when the level is readable**. An aggregate with no `levelId` still falls through and is still reported. Unknown never becomes clean.
* `stair.railings` is registered, closing the data half: `StairRailingStore` had no owner and no mention in `ClearProjectCommand`, and is absent from the audit's `AUDITED_STORE_GLOBALS` — which is why the report showed a scene finding with no store finding beside it.
* A new gate arm (§C13-TEARDOWN-TRIGGER-DECLARED) enforces rule 1, shrink-only against a **named** baseline of two reasoned exceptions.
* **Cost**: the teardown now runs at `clearAll()` time rather than on a DOM event, i.e. slightly earlier in the switch. Verified safe in both orderings — a builder's later `unregister(id)` finds no record and no-ops.

**Not addressed by this ADR, stated rather than implied.** The `site.model` finding in the same report is **not** explained by it. That scope *is* registered and *does* have a probe, so its mechanism differs: the owner exists and either did not clear or was re-seeded. Diagnosing it needs a runtime trace of switch ordering, which static analysis cannot supply. ⛔ The two findings appeared together; that is not evidence they share a root.

## Alternatives rejected

* **Put the project id in the aggregation key.** Would make aggregates project-attributable, but it multiplies group count by nothing useful (only one project is ever open) and leaves every *other* unowned surface unfixed. It treats a symptom of "no owner" as if it were a keying problem.
* **A repo-wide "every listener needs a dispatcher" gate.** Measured: 75 listened-but-never-dispatched event names exist, almost all native browser events, and dispatch through computed names is not decidable by grep. Such a gate would ship false positives and be muted — the failure mode C13 §3.10 rates as worse than having no gate.
* **Exempt `instanced-group-…` ids from the audit.** Removes the false positive and the coverage together. Rejected under C13 §3.10: a clean verdict that never looked is worse than no verdict.
