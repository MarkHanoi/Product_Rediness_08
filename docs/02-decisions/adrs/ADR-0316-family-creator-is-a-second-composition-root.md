# ADR-0316 — The Family Creator is a second composition root, and that is correct

- **Status:** Accepted
- **Date:** 2026-08-11
- **Supersedes:** nothing. **Superseded by:** nothing.
- **Governs:** `apps/component-editor/src/app/familyEditorRuntime.ts`,
  `tools/ga-gate/check-single-compose.ts` (`MAX_RIVALS`)
- **Contracts touched:** C01 §1 (P1 — single composition root), C03 §4.1 (undo granularity)
- **Issue-log:** L-812 (§P1-UNENFORCED), W5-5

---

## 1. Context — a magic constant was standing in for a decision

Principle **P1** says: *production code obtains a runtime ONLY via `composeRuntime()` in
`packages/runtime-composer`.* The P1 gate, `tools/ga-gate/check-single-compose.ts`, landed
2026-08-09 and found exactly one rival factory:

```
apps/component-editor/src/app/familyEditorRuntime.ts:56  createFamilyEditorRuntime
```

The gate passed only because `MAX_RIVALS` was frozen at `1`. The gate's own docstring was
honest about this — it called the rival "a GENUINE second composition root" and said
"separate surface" is *"a reason to argue the case in an ADR, not a reason the gate should
be blind to it."*

That argument was never made. A constant was doing the work of a decision. This ADR either
makes the argument or the rival goes away. It makes the argument.

## 2. What each root actually constructs — measured, not asserted

| | `composeRuntime()` (`packages/runtime-composer`) | `createFamilyEditorRuntime()` (`apps/component-editor`) |
|---|---|---|
| Command bus | `@pryzm/command-bus` `CommandBus` — typed handlers with `affectedStores`, `canExecute()` pre-flight, forward+inverse **Immer patch pairs**, alias table, CRDT applier hook | local `createCommandBus()` — `verb → { category, execute }`, executor returns a **closure inverse** |
| Undo | `RingBufferUndoStack` (cap 200) + `applyRingBufferSide()` re-applying patches to L1 stores; plus a legacy `commandManager` adapter path | bounded array of `{verb, category, undo}` closures, cap 100 |
| Stores | 14 BIM/domain stores — `Building`, `Level`, `Apartment`, `Room`, `SiteModel`, `Climate`, `Provenance`, `IfcMeta`, `FamilyRegistry`, `LayoutOptions`, `AiApprovalQueue`, apartment/room parameter stores | 6 authoring stores — `sketchDoc`, `constraint`, `selection`, `referencePlane`, `solid`, (`viewTab` owned by `AppShell`) |
| Solver | none | `@pryzm/constraint-solver` — `MockSolver` at boot, lazy `loadSolver()` upgrade to planegcs WASM, hot-swapped through `solverRef` |
| Persistence | `buildPersistenceSlot()` → `@pryzm/persistence-client` (`ProjectListClient`, `MembersClient`), `openProject()`, workspace surface attach | **none** — `.pryzm-family` artefacts via `@pryzm/file-format`, no project |
| Collaboration | `SyncSlot` over `@pryzm/sync-client` (Yjs CRDT), presence, `status: 'CONFLICTED'` | **none** |
| Renderer | `bootstrapScene`, `@pryzm/renderer`, `buildWorkspaceSurface()` from `@pryzm/renderer-three` | **none** (3D view tab is a lazy `import()` behind the bundle gate) |
| Typology packs | 4 packs registered (apartment, casa-unifamiliar, residential-building, office-building) + `TypologyRegistry` + `PipelineRouter` | **none** |
| Plugin host | `PluginHost` + boot contributions | **none** |
| Other slots | ~45 typed slots (`auth`, `entitlements`, `cde`, `geospatial`, `structural`, `ifc`, `rhino`, `bcf`, `pdf`, `physics`, `input`, `picking`, `camera`, `workspace`, `visibility`, `ai`, …) | 8 fields, all authoring |
| Telemetry | `@opentelemetry/api` + `initTracing()` global provider | local `otel.ts` span emitter, ~0 KB, swappable sink — deliberately avoids the SDK |
| Required caller input | `audit: RuntimeAudit` **and** `bootstrapFn` (production: `bootstrapWithEverything` from `@pryzm/editor`) | nothing |
| Workspace deps | **25** `@pryzm/*` packages | **3** (`constraint-solver`, `file-format`, `geometry-kernel`) |
| Async | `async` — awaits data-half bootstrap + persistence | synchronous |

## 3. Why delegation is not merely unattractive — it is impossible

Three measured facts, in order of decisiveness.

1. **The bundle budget.** `apps/component-editor` is governed by
   `__tests__/quality-gates/bundle-budget.test.ts`: first-paint eager JS **≤ 180 KB gzip**,
   and no eagerly-loaded chunk may match `/three/i`. Its current eager chunk is
   **6,226 bytes gzip** — 3.4 % of budget. `composeRuntime()` statically imports
   `buildWorkspaceSurface` from the `@pryzm/renderer-three` barrel, which eagerly re-exports
   `GLTFLoader`, `EffectComposer`, `TransformControls` and the postprocessing passes. Measured
   in this repo: `three/build/three.core.js` is **281,053 bytes gzip** — **1.53× the entire
   budget**, before a single line of PRYZM code. Delegation does not slow the Family Creator
   down; it makes its stated contract unsatisfiable.

2. **`bootstrapFn` is a required option with no default.** Production supplies
   `bootstrapWithEverything` from `@pryzm/editor`. `apps/component-editor` would therefore
   have to depend on `apps/editor` — an app→app edge, both at L7 — or pass a stub, in which
   case the bus arrives with **no handlers and no stores**, and the family editor still has
   to construct its own sketch/constraint/solid stores and register its own commands. The
   rival wiring would survive delegation intact, with `composeRuntime()` bolted underneath it.
   Two roots, plus a dependency.

3. **The slot surface is answering a different question.** Of ~45 slots on `PryzmRuntime`,
   the Family Creator would use `events` and `toasts`. Everything else — `projectContext`,
   `persistence`, `sync`, `typology`, `geospatial`, `cde`, `entitlements`, `siteModelStore` —
   is either meaningless here or actively wrong. Widening `composeRuntime()` to make those
   optional would make `composeRuntime()` worse for its actual consumer, which is the outcome
   P1 exists to prevent.

## 4. Decision

`createFamilyEditorRuntime()` is a **legitimate second composition root** for a second
product surface. `MAX_RIVALS` stays at **1** and now cites this ADR.

`MAX_RIVALS` is **not** raised past 1. A third rival is a new ADR or a bug.

### 4.1 What the two roots MUST keep in common

These are invariants, enforced by
`apps/component-editor/__tests__/app/secondCompositionRoot.invariants.test.ts`. A change that
breaks one of them is a defect, not a new baseline.

1. **Commands are the only mutation path (P6).** Every store the runtime exposes to UI has a
   registered command family that mutates it. No direct store writes from UI code.
2. **Everything authored is reachable.** Every `*_VERB` constant in `src/commands/**` is
   registered on the bus by the composition root. *(This ADR's audit found `referencePlane.*`
   (4 verbs) and `solid.*` (3 verbs) authored, unit-tested, and constructed only inside their
   own tests — unreachable in production. Fixed in the same change.)*
3. **Undo granularity is identical.** A batch is **ONE** undo step in both roots
   (C03 §4.1, ADR-0314). The *mechanism* may differ; the number of Ctrl-Z presses a user needs
   may not.
4. **Every dispatch emits a span (P8).** Core emits `pryzm.<domain>.<verb>`; the family editor
   emits `pryzm.family.command.<verb>`.
5. **Dispose is total.** Tearing the runtime down drains the undo stack and drops
   subscriptions — no leak that outlives the surface.
6. **Exactly one root per surface.** One factory in `apps/component-editor/src`, one in
   `packages/runtime-composer`. Neither may sprout a sibling.

### 4.2 What they are ALLOWED to differ on

1. **Undo mechanism.** Immer patch pairs + `RingBufferUndoStack` vs closure inverses. The
   family editor's state is in-memory and never CRDT-merged or replayed from a persisted log,
   so patch pairs would buy it nothing.
2. **Handler shape.** `canExecute`/`execute`/`affectedStores` vs `category`/`execute`.
3. **Verb spelling.** Core house style is dot-separated **kebab**-case, ratcheted by
   `tools/ga-gate/check-command-naming.ts`. The family editor uses dot-separated **camel**
   segments (`constraint.addCoincident`). This is permitted **only because family verbs are
   never wire identifiers** — they are not persisted to `project_command_log`, not sent over
   CRDT, and not replayed. Note `check-command-naming.ts` scans only `plugins/*/src` and
   `packages/command-registry/src`, so this namespace is currently ungoverned; that is
   acceptable while it stays in-memory, and stops being acceptable the moment it does not.
4. **Telemetry transport.** A ~0 KB local span emitter with a swappable sink, rather than
   `@opentelemetry/api` (~30 KB), because of the budget in §3.1.
5. **Sync/async construction, and the entire slot surface.**

## 5. What would make this decision WRONG later

Any **one** of the following retires this ADR. They are ordered by how likely they are to
happen, and each has a mechanical tripwire so it is noticed rather than discovered.

1. **The Family Creator gains a project.** If family documents become server-persisted
   entities with ownership, sharing or permissions, it needs `persistence`, `projectContext`
   and `auth` — three slots `composeRuntime()` already owns and this root would have to
   reinvent. *Tripwire: clause 2 of the invariants test forbids importing
   `@pryzm/persistence-client`.*
2. **Two users edit one family at once.** Collaboration means CRDT means the patch-pair undo
   model, because closure inverses cannot be merged or replayed. That single requirement
   collapses §4.2.1 and most of §2 with it. *Tripwire: `@pryzm/sync-client` is forbidden.*
3. **The 3D view stops being lazy.** If the Family Creator needs an eagerly-mounted renderer,
   argument §3.1 evaporates — THREE is in the first-paint chunk either way, and the budget
   that justified the split no longer exists. *Tripwire: `bundle-budget.test.ts` +
   `@pryzm/renderer-three` forbidden.*
4. **The editor embeds the Family Creator in-process.** Today it is a standalone SPA reached
   by deep link. Mounting it inside `apps/editor` puts two live command buses and two undo
   stacks in one window, and a user's Ctrl-Z becomes ambiguous. That is a merge, not a
   coexistence. *Tripwire: `@pryzm/editor` and `@pryzm/command-bus` are forbidden imports.*
5. **Family verbs become durable.** If any `family.*` verb is written to `project_command_log`,
   sent over the wire, or replayed, §4.2.3 is void — it is a wire identifier and must join the
   canonical namespace under `check-command-naming.ts`.
6. **A third rival appears.** `MAX_RIVALS` would have to rise, and a "second surface" argument
   that licenses a third is not an argument, it is a loophole. Delete this ADR and design the
   general case.

**Honest limits of this ADR.** It does not claim the two roots are safe to diverge — only that
they are *cheaper apart than together, today, under measured constraints*. Every number in §3
is a snapshot: the 6,226 B eager chunk, the 281,053 B three.core, the 25-vs-3 dependency
counts. Re-measure before citing them. And the invariants in §4.1 are the ones that were
*testable* — they do not prove the mutation paths agree in every respect, only that they agree
where a user could tell the difference.

## 6. Consequences

- `tools/ga-gate/check-single-compose.ts` holds `MAX_RIVALS = 1` with a citation to this ADR.
  The constant is no longer magic; it is a pointer.
- `familyEditorRuntime.ts` now registers `referencePlane.*` and `solid.*`, which no user could
  reach before. Seven commands went from authored to reachable.
- `apps/component-editor/__tests__/app/secondCompositionRoot.invariants.test.ts` turns future
  drift into a test failure at the moment it is introduced, rather than a discovery years later.
- `createFamilyEditorRuntime` is **deliberately NOT added to `FACTORY_ALLOWLIST`**. Allowlisting
  would make it invisible; baselining keeps it counted, named in the gate's output on every CI
  run, and unable to grow.
