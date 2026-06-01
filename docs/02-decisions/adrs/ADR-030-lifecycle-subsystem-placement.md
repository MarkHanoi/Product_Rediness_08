# ADR-030 — Lifecycle Subsystem Placement

| Field | Value |
|---|---|
| Status | **Accepted** — 2026-04-27 |
| Closes | `GAP-REVIEW-2026-04-27.md §29 #14` (legacy `src/lifecycle/` placement undecided in new architecture) |
| Required by | Sprint S31 (Phase 2B start — codebase migration plan finalised per SPEC-27 §4.3; Phase 2A holds no gap-closure work per 2026-04-27 directive) |
| Owner | Architecture lead |
| Implementation | `packages/lifecycle/` OR `plugins/lifecycle/` per Part B; `apps/editor/src/main.ts` composition root |
| Spec dependency | SPEC-09 plugin SDK (capabilities); SPEC-27 migration & rollback §4 |

---

## Context

The legacy code has `src/lifecycle/` (~3,400 LOC) handling element instantiation hooks, project-open / project-close lifecycle events, plugin activation events, and a few cross-cutting "before commit" / "after commit" interceptors. The new architecture's package list (`10-MASTER…` §3.2) does not mention lifecycle; the gap review §29 #14 flagged the omission.

The question: **does lifecycle survive as a first-party subsystem, or does it dissolve into the command bus + plugin SDK?**

---

## Decision

### Part A — split, with the smaller half surviving

Most legacy lifecycle responsibilities **dissolve**:

| Legacy lifecycle responsibility | New home |
|---|---|
| `before-commit` / `after-commit` interceptors | `packages/command-bus/` middleware chain (per SPEC-03 §3.4) |
| Element instantiation hooks (`onCreate`, `onUpdate`, `onDelete`) | per-family handlers + `[strategic ADR-002]` event log; plugins subscribe via `extension_points` per SPEC-09 |
| Project-open / project-close | `apps/editor/src/main.ts` boot/shutdown sequence; emits `project.opened` / `project.closed` events that plugins subscribe to per SPEC-09 §4 |
| View activation events | `packages/view-state/` (already in package list); emits `view.activated` event |
| Plugin activation events | `packages/plugin-sdk/` (already in package list); plugin manifest's `extension_points` |

The smaller half — **cross-family lifecycle coordination** — survives as a first-party plugin:

### Part B — `plugins/lifecycle/` for the cross-family slice

A small plugin (~500 LOC target) under `plugins/lifecycle/` that handles:

- **Cross-family invariants**: e.g., "when a wall is deleted, hosted doors/windows must be re-hosted or deleted." This is family-agnostic and lives outside any single family's plugin.
- **Project-wide validation passes**: e.g., "after every commit, run the structural-loadpath validator if structural elements are present." Per `[strategic ADR-020]` robustness budget.
- **Composite-rebake triggers**: e.g., "when a level z-elevation changes, re-bake all elements on that level."

This plugin uses standard SPEC-09 capabilities; it is not privileged code. It can be replaced by a third-party plugin if a customer wants different cross-family semantics.

### Part C — what `plugins/lifecycle/` is **not**

- **Not a god-object**. Each per-family plugin owns its own create/update/delete logic.
- **Not a place for orchestration shortcuts**. If a flow needs to coordinate multiple families, the proper home is here only when the coordination is genuinely cross-family. Otherwise, it's a per-family handler.
- **Not the rendering scheduler**. That's `packages/render-runtime/` per ADR-022.

### Part D — sprint deletion of legacy `src/lifecycle/`

Per SPEC-27 §4.3:
- S31 — `plugins/lifecycle/` skeleton; the cross-family coordination cases ported.
- S37 — legacy interceptors moved to `packages/command-bus/` middleware.
- S43 — instantiation hooks deleted from `src/lifecycle/`; replacements live in per-family plugins.
- S65 — view + project lifecycle events deleted; replacements in `packages/view-state/` + `apps/editor/src/main.ts`.
- S70 — `src/lifecycle/` deleted entirely (per SPEC-27 §4.3).

### Part E — telemetry + plugin contract

`plugins/lifecycle/` emits events:
- `pryzm.lifecycle.cross_family_check.<rule>.run` (counter).
- `pryzm.lifecycle.cross_family_check.<rule>.duration_ms` (histogram).
- `pryzm.lifecycle.cross_family_check.<rule>.failed` (counter; > threshold = release blocker per ADR-020).

Plugin contract:
```ts
interface CrossFamilyRule {
  id: string;                // e.g. 'wall-delete-rehosts-openings'
  trigger: EventPattern;     // e.g. 'wall.delete' | 'level.update_elevation'
  affectedFamilies: ElementFamily[];
  run(ctx: CrossFamilyContext): Promise<RuleResult>;
}
```

`CrossFamilyContext` is built per SPEC-13 discipline; the rule is pure-input pure-output; no DOM; no global state.

---

## Consequences

**Positive:**
- The new architecture has no orphan subsystems; lifecycle either dissolves into appropriate layers or lives as one small first-party plugin.
- Cross-family coordination has a clear home; it doesn't leak into per-family plugins.
- Customer / 3rd-party plugins can override or extend cross-family rules.

**Negative:**
- A subset of the legacy `src/lifecycle/` code becomes harder to find (split across handlers + middleware + plugin); mitigated by SPEC-27 §4.3 deletion log and a migration grep table in the strangler-fig docs.
- `plugins/lifecycle/` could become a dumping ground if discipline lapses; mitigated by Part C anti-patterns + code review.

---

## Alternatives considered

### A1 — Keep `packages/lifecycle/` as a first-party package
Rejected: most of its legacy work doesn't belong in any one package; making it a package requires every package to depend on it, which is the kind of god-package the new architecture exists to avoid.

### A2 — Pure dissolution; no `plugins/lifecycle/`
Rejected: cross-family invariants would scatter across N family plugins, each duplicating shared rules. A small dedicated home is better.

### A3 — Lifecycle as a `packages/command-bus/` extension only
Rejected: cross-family rules need access to scene-cache + view-state + storage, not just commands; living entirely in command-bus middleware is too narrow.

---

## Phase rollout

- S31 — ADR-030 land (Phase 2B start; Phase 2A holds no gap-closure); cross-family rule list audited from legacy `src/lifecycle/`; `plugins/lifecycle/` skeleton + first three rules ported.
- S37 — middleware path lit in `packages/command-bus/`.
- S43 — instantiation hooks fully replaced.
- S55 — telemetry + release-blocker thresholds lit.
- S65 — view/project lifecycle events fully replaced.
- S70 — legacy `src/lifecycle/` deleted.
- S72 (M36 GA) — `plugins/lifecycle/` GA-shipped; rule library documented.
