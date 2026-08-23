# ADR-0367 — The plugin registration contract moves to L5, and ONE family proves it

| | |
|---|---|
| Status | **ACCEPTED** — implemented 2026-08-23, lane PLUGIN2 |
| Supersedes | the "Layering note" at `apps/editor/src/PluginRegistry.ts:13-17` (kept verbatim in place, annotated) |
| Amends | **C01 §3** (layer membership of the extension contract) · **C11 §6.3** (element-creation registration) |
| Issue-log | **L-9921** (the move) · **L-9922** (the family it proved, and the defect that proved it) |
| Gate | `tools/ga-gate/check-plugin-census-equivalence.ts` (L-9920) — **ARM A 25 → 24** |
| Audit source | `docs/04-reference/AUDIT/A-architecture.md` §4.3, rows **A8–A11**, recommendation **R2** |

---

## 1. Context — one placement decision, nine shipped defects

`PluginDescriptor` — the record a plugin contributes at boot (store key, store
factory, handler set, auxiliaries, contributions, subscriptions) — was declared at
`apps/editor/src/PluginRegistry.ts:133`. That file is **L7**, the top of the model,
and the file said so and called it a decision:

> ```
> // Layering note.  Each `PluginDescriptor` is constructed in this file
> // (apps/editor → plugins is the correct dep direction; the reverse would
> // require plugins to import editor types and would reintroduce a cycle).
> // Per-plugin `descriptor.ts` files were considered and rejected on those
> // grounds; the descriptor records below are the single source of truth.
> ```

The reasoning is **locally correct**. It is also the root cause of everything
downstream of it. A contract type at the TOP of a stack cannot be named by anything
below it, so **a plugin could not describe itself**. Therefore all 28 descriptors
were hand-written in one 1,184-line L7 file; therefore the composition root
imported 30 plugins by name; therefore the plugin census was hand-maintained;
therefore it drifted.

**The cost is measured, not inferred. Nine element families have shipped fully
built, fully tested by their own suites, and undispatchable by the application:**
furniture, plumbing, rooms, structural and dimensions (E-finish.0.E), then lighting
(§LIGHTING-STORE-FIX), pool (L-5200), lift (L-5700) and balcony (L-5600). Each
failed the same way — no descriptor meant no `storeKey`, meant no key in
`storesAsRecordView(stores)`, meant `CommandBus.buildContext` threw

```
<verb>: required store '<key>' is missing from HandlerContext.stores
```

*before any mutation.* The mitigation shipped each time was one more per-family
reachability test: **N tests for N families, with the (N+1)th uncovered by
construction.**

Pascal's equivalent contract (`Plugin` / `NodeDefinition`) sits at
`packages/core/src/registry/types.ts` — the **bottom** layer. A plugin describing
itself there is a downward import, which is always legal. *That single difference
is the whole distance between an open and a closed extension model* (AUDIT-A §4.3).

## 2. Decision

**Move the registration contract to L5 (`packages/plugin-sdk`), name it for what it
is, and prove it with exactly ONE family.**

1. `packages/plugin-sdk/src/registration.ts` declares **`PluginRegistration`**,
   plus `PluginRegistrationDeps` and `PluginContributionLike`. Exported from the SDK
   barrel.
2. `apps/editor/src/PluginRegistry.ts` keeps `PluginDescriptor` as a **local alias**
   — `PluginRegistration<PluginContribution, RoomEventRuntime>` — so no existing
   call site moves.
3. `ALL_PLUGINS` accepts **both shapes**: inline object literals (27, unchanged) and
   bare identifiers referencing a descriptor authored inside the plugin (1).
4. `plugins/section-view/src/registration.ts` authors
   `sectionViewPluginRegistration` against the L5 contract.

### 2.1 Why the name is not `PluginDescriptor`

⚠ **`PluginDescriptor` was already taken, twice, by two different things.**

| # | Location | What it actually is |
|---|---|---|
| 1 | `packages/plugin-sdk/src/descriptor.ts` | `= PluginManifest` — the on-disk `plugin.manifest.json` envelope, **LOCKED for v1.x by ADR-0038 §Decision C** and published to npm as `@pryzm/sdk` |
| 2 | `packages/runtime-composer/src/types.ts` | what `PluginsSlot.list()` returns — the **catalogue row** |
| 3 | `apps/editor/src/PluginRegistry.ts:133` | the **registration record** — the subject of this ADR |

Re-pointing (1) would be a breaking change to a published package. Three unrelated
types sharing one name in one repo is *how a census drifts in the first place*, so
the moved type is named for what it is and the L7 alias absorbs the diff.

### 2.2 Why the two type parameters exist

⛔ L5 may **not** name `@pryzm/plugin-rooms`' `RoomEventRuntime` — that is an
**L5 → L6 upward** import, precisely the edge this move exists to delete, and
`check-layer-boundaries.ts` is a ratchet currently *above* its own ceiling. It also
should not name `@pryzm/runtime-composer`'s `PluginContribution`, whose `activate`
takes the entire `PryzmRuntime`.

Both are therefore **type parameters**, supplied by `apps/editor` — the only layer
that legally knows both. This generalises what `plugins/wall/src/contributions.ts`
already did by hand (a local structural `WallContributionRuntime` instead of a
static dep), and writes it down once instead of per plugin.

## 3. Consequences — measured before and after

| Reading | Command | Before | After |
|---|---|---|---|
| census **ARM A** (on disk, contributes nothing at boot) | `check-plugin-census-equivalence.ts` | **25** | **24** ⭐ |
| census ARM B / E / F | same | 13 / 5 / 3 | 13 / 5 / 3 (unchanged) |
| census arms C / D / G / H | same | hard 0 | hard 0 |
| descriptors authored **in a plugin package** | same, header line | **0** | **1** |
| **SDK-facade bypasses** | `check-l7-boundary.ts` | 83 files / ceiling 84 | **83 / 84 — RC=0, unchanged** |
| upward imports · unclassified · banned 3rd-party | `check-layer-boundaries.ts` | 103 · 15 · 121 | **103 · 15 · 121 — unchanged** |

⭐ **The bypass row is the load-bearing one.** `plugins/section-view` →
`@pryzm/plugin-sdk` is L6 → L5: downward **and through the facade**, so the
shrink-only bypass ratchet does not move. `packages/plugin-sdk` →
`@pryzm/command-bus` / `@pryzm/stores` is L5 → L1/L3, also downward, and both were
already declared dependencies. **No new `package.json` dependency was added
anywhere**, so `pnpm-lock.yaml` is untouched.

A second gate arm was added in the same commit: `MIN_AUTHORED_REFS = 1`. If every
`ALL_PLUGINS` element reverted to an inline literal, `resolveDescriptorRef()` would
never run and arm H would report a clean hard-0 **having examined nothing** — the
failure this gate exists to catch, one level up.

## 4. The family chosen, and why it was not a cosmetic migration

**`section-view`, chosen because it was live-broken.** MEASURED:

- `apps/editor/src/engine/engineLauncher.ts:711` has called
  `registerSectionHandlers(_bus)` on the real runtime bus since §P3.4-SE, so all six
  `section.*` verbs **were registered**.
- No descriptor existed, so `ALL_PLUGINS` contributed no `section` store key.
- All six handlers declare `affectedStores = ['section']` and read
  `ctx.stores.section`.
- ⇒ **every dispatch died at `CommandBus.buildContext` before touching anything.**

This is the **tenth** instance of the pool / lift / lighting shape — and the first
found by a gate (census arm A) instead of by a person trying to use the feature.

Two supporting facts, both of which were themselves defects:

- `plugins/section-view/src/store.ts` (`SectionStore`) existed and was **not
  exported from the plugin barrel**. A barrel that omits a real export is
  indistinguishable from a package that lacks it.
- `engineLauncher` needed **no edit**: its `_bus` is the §OI-053 skip-if-present
  proxy, so the composition root now registers first and that call becomes an
  idempotent no-op — the same relationship `registerWallHandlers` already has.

### 4.1 Proof

`apps/editor/__tests__/sectionViewReachableThroughComposedRuntime.test.ts` —
**8 cases, all green**, reading `rt.stores.section` off the REAL
`bootstrapWithEverything()`. It never builds a store, a stores bag or a bus of its
own, because *the provider is the thing that breaks and a test that supplies it
cannot observe its absence*.

R-2 is an **identity** assertion (`toContain`, i.e. `Object.is`) that `ALL_PLUGINS`
holds the very object declared in the plugin — a `toEqual` would also pass against
an inline L7 copy, i.e. against the arrangement this ADR ends.

⚠ **What a green run does NOT establish, stated so nobody reads more into it.** It
proves the six verbs dispatch and their patches reach the bound store. It does
**not** prove a person can draw a section (there is no tool activator at all; C104
R-10 makes a reachability claim inadmissible without a pointer-layer proof), and it
does **not** prove a section renders. `section.moveLine` still **REFUSES**, and R-6
pins that refusal so a later reader cannot delete it on the strength of "the store
is wired now". The refusal's own text was amended in place: one clause of it
("the section plugin also contributes no store through PluginRegistry") became
false with this change and was corrected rather than left to rot.

## 5. What was deliberately NOT done

- ⛔ **The other eight dark families were not switched on.** Moving a mechanism and
  enabling N features are different risks and must not share a commit.
- ⛔ **The 27 inline descriptors were not migrated.** Both shapes are first-class.
- ⛔ **`PluginContribution` was not moved to L5.** Consequence, stated as a limit
  rather than quietly half-done: a plugin can author a registration with **no**
  `contributions` and no `wireSubscriptions` (readonly arrays are covariant, so
  `readonly PluginContributionLike[]` is not assignable to the host's narrower
  `readonly PluginContribution[]`). `section-view` needs neither. Item 2 below.

## 6. Ordered backlog

**Mechanism, in dependency order:**

1. **Migrate the remaining 27 descriptors** to self-authored registrations, raising
   `MIN_AUTHORED_REFS` in the census gate each time. Independent per plugin; no
   ordering constraint among them.
2. **Move `PluginContribution` to L5** (or introduce an L5 contribution union the
   host widens). Unblocks a plugin authoring its own toolbar/panel entries —
   currently the single reason such a descriptor must stay inline. **Blocks item 1
   for any plugin that contributes UI** (today: `wall`).
3. **Move `wireSubscriptions`' runtime shape to L5** — same argument, smaller blast
   radius (today: `rooms` only).
4. **Delete the L7 `PluginDescriptor` alias** once 1–3 land and no call site needs
   it.

**Families, in the order they should be wired — ranked by whether the code is real,
then by census arm moved:**

| # | Family | Arm it moves | State, measured | Blocker |
|---|---|---|---|---|
| 1 | `levels` | A **and** B | REAL — `buildLevelHandlerSet()` returns a genuine `CommandHandler`; `affectedStores = []` | needs a `PLUGIN_CATALOG` row (`PluginHost.ts`) to also clear arm B — **runtime-composer, not this lane's file** |
| 2 | `sheets` | A | REAL — `SheetStore` + `buildSheetHandlerSet` exist | ⛔ `check-verb-register.ts` reports `sheet.create` **SHADOWED** — a second registration site at `initBusHandlers.ts:2202` already loses. Resolve the duplicate FIRST |
| 3 | `plan-view` | A | REAL stores (`LevelStore`, `PlanViewSourceStore`) + `registerPlanViewHandlers` | store-key collision review against the engine's level stores |
| 4 | `ifc-export` | A | REAL — `InMemoryIFCMetaStore` + `registerIFCExportHandlers` | handler shape is `registerX`, not a `build…HandlerSet` factory |
| 5 | `bcf` | A | handlers exist as `registerBCFHandlers`; a `BCFTool` is already imported by the registry | ships a `plugin.manifest.json` — reconcile manifest against registration |
| 6 | `cross` | A | `registerCrossHandlers` exists | its cascade rules are inert until `CascadeRunner` is registered (ADR-0323 / BIM30 R2) |
| 7 | `visibility-intent` | A **and** B | `buildVisibilityIntentHandlerSet` exists; **zero importers repo-wide** | P7's unchecked axes — see C01 P7 exit condition |
| 8 | `geospatial` | A **and** B | ⛔ **STUB** — handlers are `{ commandType, handle }` printing `console.debug`, NOT `CommandHandler` | rewrite against the real interface first |

⛔ **`navigate`, `ai-floorplan`, `ai-generative`, `ai-query`, `ai-rules`, `ai-voice`
and `ifc-import` are STUBS in the same way** — their "handler sets" are
`{ commandType, handle }` objects that log to the console. **Wiring one would move a
census arm down while shipping a fake**, which is worse than the dark directory it
replaces ([[fake-more-capable-than-real]]). They are excluded from the ranking above
on purpose, not overlooked.

⚠ **`pool` and `boundary-line` are lane MIRROR3's** and are not in this backlog.

## 7. Rejected alternatives

- **Move the type to L0/L1.** It names `Store` (L3) and `CommandHandler` (L1); L5 is
  the lowest layer that can hold it without dragging those down too.
- **Keep the type at L7 and generate the descriptors.** A generator over a closed
  table is still a closed table — the census would still be hand-seeded and the
  drift arms would still have to be watched. This removes the cause instead.
- **Rename the SDK's `PluginDescriptor` to `PluginManifest` and reuse the name.**
  Breaking change to a published npm package, locked by ADR-0038.
