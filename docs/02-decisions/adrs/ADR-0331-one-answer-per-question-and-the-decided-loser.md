# ADR-0331 — One answer per question: the convergence direction was already decided, and the rival is the plugin DTO substrate

| Field | Value |
|---|---|
| Status | **Accepted** for §D1–§D4 · **ESCALATED to the founder** for §D5 (the bake-stack disposition) |
| Date | 2026-08-18 |
| Lane | Z8 — repo-wide duplication audit |
| Decides | "Everything is duplicated — which copy wins, and how do we converge without breaking what works?" |
| Records, does not make | The **direction** was decided by [ADR-0318](ADR-0318-composeruntime-owns-authoritative-stores.md) (Accepted 2026-08-11). This ADR applies that decision to the ~19 families ADR-0318 left to per-kind migration, and adds the axis ADR-0318 does not cover: **rival geometry implementations**. |
| Contributes to | [**C84 — ELEMENT INTEGRITY**](../contracts/C84-ELEMENT-INTEGRITY.md) — this lane's invariants were merged in as **EI-9…EI-13** plus the `[Z8]`-marked amendments. C84 was independently minted the same day by the four-audit sweep; the merge and its three resolved disagreements are in **C84 §0**, and the source draft is preserved at [`Z8-SOURCE-DRAFT-one-answer-per-question.md`](../../03-execution/plans/Z8-SOURCE-DRAFT-one-answer-per-question.md) |
| Evidence | [`DUPLICATION-AUDIT-AND-CONVERGENCE-ROADMAP.md`](../../03-execution/plans/DUPLICATION-AUDIT-AND-CONVERGENCE-ROADMAP.md) — every count is a measured file/call-site count at HEAD `4dd9f820`, not an estimate |
| Executed proof | `tests/parity/wall/stackAB-miter-parity.test.ts` — 10 pass, 1 pinned `it.fails` |
| Constrains | `apps/editor/src/PluginRegistry.ts` · `apps/editor/src/engine/initTools.ts` · `initBusHandlers.ts` · `apps/editor/src/engine/undo/performUndoRedo.ts` · `packages/geometry-kernel/src/producers/` · `packages/geometry-wall/src/` · `apps/bake-worker/` |
| Subordinate to | STR-03 · STR-04 · C03 · C16 §5.1 · C69 · C70 · ADR-0318 |
| Tags | `§Z8-ONE-ANSWER`, `§Z8-STACK-PARITY`, `§Z8-CURVED-MITER-BAKE-DIVERGENCE` |

---

## Context — what was measured, and what the measuring corrected

The founder asked for a census of duplication across the whole repo, then: *"check REALLY REALLY well
whether those are DUPLICATED or CO-LIVING… for the time being, wall, slab, most elements work well from
a UI/UX standpoint."* That caution was correct and it changed three verdicts.

**What is real.** Four structural facts, each with a runtime consequence:

1. **Two element-store construction roots that never exchange references.**
   `apps/editor/src/engine/initBuilders.ts` builds the geometry stores the renderer, serializer and
   exporter read. `apps/editor/src/PluginRegistry.ts:228-465` builds **22** plugin DTO stores
   (`buildStore: () => new XStore()`, invoked at `bootstrap.everything.ts:142`) that bus handlers write.
   The only wiring between them, `composeRuntime.ts:1548-1559`, registers **Root A's** objects.
   **19 families are TWO LIVE**; eight of those (room, door, window, grid, stair, structural, dimension,
   view) have **no bridge at all**.

2. **One store key names two different objects at two different times.** A handler declaring
   `affectedStores: ['wall']` writes `ctx.stores.wall` (plugin DTO). `buildUndoStoreMap()`
   (`performUndoRedo.ts:308-353`) resolves the same key to `window.wallStore` (geometry) across
   **24 keys / 21 globals**. `_covered()` passes, the ring buffer runs, and an inverse patch lands on a
   store that never received the forward. C16 CA-19 names this hazard; it is live.

3. **The duality is already compiled into the base class.** `packages/stores/src/Store.ts:99-125`
   skips *"a nested patch whose root element is ABSENT from this store"*, and its own comment gives the
   reason: `attachStores` re-applies the forward patch to *"a DETACHED plugin DTO instance (see
   PluginRegistry `buildStore: () => new FloorStore()`) that never held the element"*, which threw Immer
   error 18 — *the founder's `floor.update failed`*. A workaround for the rivalry sits in the base class
   of every plugin store. That is one structural defect, not N accidents.

4. **⭐ Two complete parallel geometry stacks, and they disagree.**
   - Stack A — `packages/geometry-wall/` → `WallFragmentBuilder` → `initBuilders.ts` → the viewport.
   - Stack B — `packages/geometry-kernel/src/producers/` (26 files) + `plugins/*/src/committer/`
     (20 files) → `produceWall` → `HeadlessBakeSession.ts:124` → `RebakeChunkJob.ts:79` → ChunkWriter.

   Stack B does **not** render in the editor: `composeRuntime.ts:1397` imports
   `bootstrap.render.everything` only inside `runScene` (`:1389`), reached only via
   `runtime.scene.mount(canvas)`, and `src/main.ts:407` passes **`canvas: null`**. No production
   `scene.mount(` call site exists.
   **But it is not dead.** `HeadlessBakeSession.ts:23,131` calls `produceWall` for real, and that worker
   ships in `pryzm-selfhost/docker-compose.yml:94`.

   **The executed measurement.** Nothing in the repo had ever compared the two:
   `wall-snapshot.test.ts` snapshots Stack B against *itself*; `wall-headless-node.test.ts` compares
   Stack B in-process against Stack B in a worker thread. Both are Stack-B-only. The new harness feeds
   identical inputs to both:

   | case | max &#124;Δposition&#124; |
   |---|---|
   | straight / mitered prism, 6 cases | ≤ 1.2e-8 m |
   | curved plain / layer-offset / base-offset, 3 cases | ≤ 2.2e-7 m |
   | **curved, MITERED at both ends** | **9.774 m** |

   Nine of ten agree to float32 storage noise — **a valuable negative result** that de-risks
   convergence. The tenth is the case `§FIX-CURVED-WALL-MITER-WATERTIGHT` exists for: Stack A
   (`CurvedWallLayerBuilder.ts:69-83`) projects the miter plane and **writes back into the corner
   table the face loops consume**; Stack B (`buildCurvedLayer.ts:133-137, 159-165`) projects the cap
   quad only and its face loops (`:95-118`) consume unprojected stations. **Stack B predates a fix
   Stack A shipped.**

**What the caution corrected — three findings measured DOWN.** Recorded because the discipline is the
point:

- **The ten `<kind>.delete` verbs are DORMANT, not latent bugs.** Measured: every real delete reaches
  `element.delete` → `DeleteElement.ts:57` → `DeleteElementCommand`, or `BimService.ts:169-172` →
  the same command. No UI, chat, or collab path dispatches any `<kind>.delete`. The audit had ranked
  this as its largest gap; it is not.
- **`RENDER_MATERIAL_LIBRARY` is an UNWIRED OVERLAY**, not a rival master — 16 entries, one
  display-only importer (`MaterialsBucket.ts:16`), **zero** call sites for `createRenderMaterial` or
  `BIM_TO_RENDER_MATERIAL_MAP`.
- **`src/elements/` does not exist.** `plugins/wall/src/store.ts:3` cites a deleted path; there is no
  third wall store there.

**Two live consequences the census surfaced only because it went to dispatch sites:**

- **`plugins/cross/src/wall-room.ts:53,61` registers `wall.delete` as the wall→room cascade trigger.
  Nothing dispatches `wall.delete`, so the room boundary recompute never fires on a user delete** —
  `boundingWallIds` go stale while `DeleteElementCommand` purges the `boundedBy` edges.
- **Two UI delete paths diverge on two kinds.** `element.delete` routes `opening`/`lighting` to
  specialised commands using `elementType` (`DeleteElement.ts:53,55`); `BimService.deleteSelected()`
  never reads `elementType` (`BimService.ts:167`). Delete-key and context-menu therefore take
  different branches for those two kinds. **NOT MEASURED** whether the branches produce identical state.

---

## Decision

### §D1 — The direction is NOT reopened: the geometry store wins, the plugin DTO store is the loser

Restated so no future lane re-litigates it. **ADR-0318 already decided this**, and its own words name
the loser: *"every `new WallStore()` from `PluginRegistry` is a detached store whose writes render
nowhere and serialize never"*; I-1 requires `runtime.stores.elements.get(k)` to BE the serializer's
instance, *"never a copy, never a rival"*; Option 3 (*bless the split*) was rejected as *"a dead end
the founder's own decision drivers exclude"*.

**Therefore convergence runs plugin → geometry. Two moves are PROHIBITED:**
- **Promoting the plugin DTO store to authoritative** for any kind. It contradicts ADR-0318.
- **Mirroring bus writes INTO the plugin store.** That manufactures the copy I-1 forbids and makes
  both untrustworthy.

### §D2 — Retire the verb, do not mirror the state *(the general pattern, chosen on evidence)*

The brief asked whether `§FIX-ROOF-UPDATE-REACH-RECORD` (L-839) — *removing* `roof.update` from the
plugin handler set so a bridge owns the verb against the legacy store — generalises. **It does, and it
is adopted as the default.**

**Why.** Registration is **first-registration-wins**: `CommandBus.register()` throws on a duplicate
(`CommandBus.ts:101`), every later registrar guards with a skip (`initBusHandlers.ts:451, 499, 2589,
2732`; the `engineLauncher.ts:513-525` Proxy), and `composeRuntime` runs before `initBusHandlers`
(`engineLauncher.ts:131` vs `:468`). So **the plugin arm wins by default, silently.** Removing the
plugin handler does not add a mechanism — it **stops a shadow**, and the surviving arm already writes
the authoritative store. It inverts *which copy goes stale* instead of maintaining a mirror.

**The three honest costs, stated because a pattern adopted without its costs is a slogan:**
1. **Undo moves to the legacy `commandManager` stack.** The plugin arm's `produceCommand` inverse is
   lost. Acceptable — it is where `roof.update`, `ceiling.update` and `schedule.update` already live —
   but **each migration must confirm the legacy command registers an inverse**, or the bridge needs an
   `undoPatch` (the `floor.update` shape).
2. **It is per-verb.** 210 verbs read UNKNOWN. This is many small moves, not one large one.
3. **It does not reduce the store count.** The plugin store stops being *written*; deleting the class
   is a separate, later step (`plugins/rooms/src/store.ts:23-29` is the worked retirement path).

**Where §D2 does NOT apply — use the alternative and say which:**
- **No legacy command exists** ⇒ **refuse** with a named reason (C16 CA-18), never succeed silently.
- **The verb is genuinely unreachable** ⇒ leave it; do not spend a migration on a dormant verb (the
  ten `<kind>.delete` verbs).

### §D3 — ⭐ The structural fix that makes §D2 finite: apply the FORWARD patch through the adapter the INVERSE already uses

> ⛔ **EXECUTED 2026-08-18 (lane AD1) — AND THE DECISION BELOW MUST NOT BE WIRED AS WRITTEN.**
> This section was reasoned from two sentences in the adapter's own header. Both were run against
> real verbs, real handlers, real forward patches and the real legacy stores, and read back out of
> those stores (C16 CA-21):
> `apps/editor/__tests__/D3ForwardPatchThroughAdapter.probe.test.ts`.
>
> - **The PATCH-SHAPE half is TRUE.** `path[0]` is the element id, not the store key.
> - **The SURFACE-ANALYSIS half is FALSE**, and it is the half this decision rests on:
>   `SlabStore.update(id, nextState: SlabData)` (`SlabStore.ts:259-273`) is a **whole-record
>   replace**, so the adapter's one-key partial reduces a real slab to `{ thickness: 0.35 }` — no
>   id, no polygon, no position, no levelId — with **zero diagnostics**.
> - **A store-relative PATH is not a legacy FIELD.** `roof.setPitch` writes L1 `pitch` (radians);
>   the legacy builder reads `slope` (rise/run), and `pitch` occurs **zero** times in
>   `packages/geometry-roof/src`. The write "succeeds", fires exactly one mutation, emits nothing,
>   and moves nothing the renderer reads.
> - **The create shape — the only shape the header cites — cannot enter the store at all.** The L1
>   `roof.create` value is refused by `RoofDataAddSchema` on four fields (`footprint` vs `boundary`,
>   `roofType` vs `shape`, absent `baseOffset`, `metadata.version: 0`), and the adapter's per-op
>   `try/catch` turns that throw into one `console.error` no caller ever sees.
> - **The branch §D3 would meet most is mute.** A depth-2 field patch for an id the legacy store does
>   not hold is a silent no-op, while the whole-element arm warns on the identical id.
>
> **Consequence for the sequencing.** §D3's three named hazards below are real but insufficient:
> they guard against applying the write TWICE. What is measured is that applying it ONCE is
> already wrong for two of the three families probed. **A shape-translation layer (L1 record →
> legacy record, per family) and a merge-vs-replace declaration per store are PREREQUISITES,
> not follow-ups.** Until both exist, §D3 converts a verb that does nothing into a verb that
> corrupts — which C84 §1 ranks strictly worse.
>
> **This also lands on the UNDO path, which is not hypothetical.** `buildUndoStoreMap()` already
> maps `slab` → `window.slabStore`; `_movePatchPair` (`initBusHandlers.ts:565-579`) emits one
> depth-2 `replace` **per field**; `slab.movePolygon` (`stores: ['slab']`) uses it from the 3-D
> gizmo and the plan move tool. *UNVERIFIED: no browser session was run — the store behaviour and
> the patch shapes are measured; the dispatch→Ctrl+Z chain is read from source.*

Measured, and it is the highest-leverage finding in the audit.
`apps/editor/src/engine/undo/elementUndoStoreAdapter.ts` (365 LOC) **already gives every legacy
geometry store an `applyPatch` surface**, duck-typed over `add`/`remove`/`update`/`getById`, verified
by its own header across **13 store types**, and it already performs the `bimManager` + `elementRegistry`
spatial re-registration. Its header states the patch shape it consumes:

> *"every `Create<Element>Handler` does `produceCommand(ctx.stores.<x>, d => d[id] = element)` over a
> `Record<id,T>`, so patches are store-relative"*

— i.e. **exactly the patches the plugin handlers already emit.**

> **The machinery to land a plugin handler's write on the authoritative store exists, is
> production-tested, and runs today — on the UNDO side only. The forward side goes to the DTO store
> instead. The asymmetry IS the bug.**

**Decision: route the FORWARD patch through the same adapter, so `affectedStores: ['wall']` names one
object for a command's whole lifecycle (C84 EI-1).** This converts an open-ended per-verb programme
into one wiring change plus a per-verb enablement list.

**Three hazards, each with its guard — this is why §D3 is sequenced behind a probe, not landed:**
1. **Double-write.** A verb already bridged to `commandManager` would be applied twice. ⇒ Forward-apply
   is **opt-in per verb**, and only for verbs the register reads UNKNOWN.
2. **Create bridges.** The 12 `.created` bridges already write the legacy store; forward-applying
   `wall.create` would double-add. ⇒ Creates are **excluded** until their bridge is retired in the same
   commit.
3. **Declared scope holes.** The adapter deliberately excludes hosted elements (door/window — undo must
   also remove the host opening) and levels. ⇒ Those keep the legacy route; the exclusion is declared,
   not discovered.

### §D4 — Rival geometry implementations are governed by C84, and viewport ≡ bake is a hard rule

C84 EI-11 binds: the geometry a user sees and the geometry the system bakes/exports must come from the
same function on the same inputs. Two consequences accepted here:

- **`§Z8-CURVED-MITER-BAKE-DIVERGENCE` is a DEFECT, not a tolerance.** Pinned `it.fails`. A curved
  mitered wall bakes as a different solid from the one on screen.
- **A caller may not silently substitute inputs.** `produceWall(w, NO_JOINS, 0)`
  (`HeadlessBakeSession.ts:139`) discards neighbour joins and forces level elevation to zero, both
  marked *"v0"*. Under C84 EI-11 that must be declared and must refuse loudly rather than bake a
  plausible wall at the wrong height.

### §D5 — ESCALATED: what is Stack B *for*?

**This ADR does not decide it, because the answer is a product decision, not an architectural one.**
Three coherent end-states; the measured facts under each are in the roadmap §8.5:

| | End state | What it costs | What it buys |
|---|---|---|---|
| **B-1** | **Stack B is THE geometry engine**; the editor migrates onto it (finish `bootstrap.render.everything`, mount the renderer) | the largest change on the board; Stack B covers 4 of 20 families today | one implementation, headless-native, server-side evaluation |
| **B-2** | **Stack B serves bake/export only**; Stack A stays the viewport | a mandatory per-family parity harness forever (C84 EI-11) | smallest change; the divergence becomes *gated* rather than *unknown* |
| **B-3** | **Stack B is retired**; bake calls Stack A | Stack A is THREE-coupled (P2 — `import * as THREE` is legal only in `renderer-three`), so this needs a THREE-free extraction | one implementation, no parity burden |

⛔ **Until §D5 is decided, nothing in `packages/geometry-kernel/src/producers/` or
`plugins/*/src/committer/` may be deleted** (C84 §3.5.2). An editor-only importer census reads all 26
producers as dead; the bake worker calls them.

---

## Consequences

- **C84 is minted** and binds every PR that adds a second implementation of an existing question.
- **`tests/parity/wall/stackAB-miter-parity.test.ts` exists** and is the template for the slab, door and
  window harnesses C84 EI-11 owes.
- **`check-verb-liveness.ts`'s GROW-ONLY baseline is the proof-gate for §D2/§D3** — every migration
  raises it by name. Reading at this ADR: **PROVEN 7 / 326**.
- **Five of C84's eight invariants have no gate.** Stated, not inferred; the roadmap orders them.
- **No product code was changed by this lane.** Seven lanes are editing wall/roof/slab/material/chat
  code concurrently.

## Named residual risks (open, not resolved here)

- ~~**§D3 has not been executed.** It is inferred from the adapter's own header and surface analysis.~~
  **EXECUTED 2026-08-18 (lane AD1) on three verbs across two families —
  `apps/editor/__tests__/D3ForwardPatchThroughAdapter.probe.test.ts`.** The probe the roadmap
  sequenced (STR-03 §12.3 invariant 2, *ship the probe before the fix*) is shipped, and it **refutes
  the premise**: see the block at the head of §D3. The residual risk is no longer *"unmeasured"* —
  it is *"§D3 needs a per-family shape translator and a merge-vs-replace declaration per store
  before any wiring, and the adapter's field arm has three measured defects that already reach the
  undo path."*
- **The parity harness covers `buildMiterPrism` and `buildCurvedLayerGeometry`, not `produceWall`
  end-to-end.** The opening-carve, layered and instanced arms are **NOT MEASURED** across stacks.
- **Slab, door and window have no cross-stack harness at all** — the other three families
  `bootstrap.render.everything.ts:137-170` covers.
- **Whether the two UI delete paths produce identical state for `opening` and `lighting`** —
  NOT MEASURED.
- **C78 §21 OQ7 (*"are the six rival plugin DTO stores dead or live?"*) is answered structurally, not
  by a runtime probe.** The audit establishes two roots that never exchange references and 19 TWO-LIVE
  families; it did not run a live browser session to observe divergent contents.
- **`plugins/plan-view`, `pool`, `bcf`, `cross`, `multiplayer`, `toy-cube`, `ifc-export`, `sheets`,
  `schedules` store classes are constructed nowhere** — candidates for deletion, pending the §2.1
  census across non-editor hosts.
