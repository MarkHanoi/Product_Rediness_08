# Dead-write remediation — plan for founder approval

> **Stamp**: 2026-08-11 · **Status**: PROPOSAL, awaiting founder ratification. Nothing here is implemented.
> **Scope**: the four items handed to PLAN-DEADWRITES — (1) "five lying move verbs", (2) `ceiling.update`,
> (3) collaboration leg C, (4) `check-sync-disposition`'s 19% blindness — verified against source before planning.
> **Governing**: C69 (verb register) · C16 §5.1 `CA-17`…`CA-21` (liveness) · C03 §4.6 U-2b · C66 §1 (tier claims) · C08.
> **Precedents cited, not re-derived**: L-815 `§FIX-DIMS-REACH-RECORD` (retire-the-shadow) · L-839
> `§FIX-ROOF-UPDATE-REACH-RECORD` (route c) · L-220 `§FIX-TRANSFORM-DRAG-PAYLOAD-AUDIT` + G7
> `§FIX-MOVE-SLAB-AND-HANDRAIL` (distinct-verb bridge) · `§FIX-DEAD-VERB-REFUSE` (the 17 refusals).
> **Not duplicated here**: leg C already has a full plan at
> [`L-391-CRDT-COLLAB-PLAN.md`](L-391-CRDT-COLLAB-PLAN.md). §5 below only states what changed and what it costs.

---

## 0 — Headline: the brief's item 1 is wrong, and the real defect is two verbs it does not name

**The five verbs named in the brief (`wall.move`, `wall.transform`, `door.move`, `window.move`,
`slab.move`) are not dispatched by any production surface.** Moving a wall in the 3-D gizmo does
*not* go through `wall.move`. It goes through `wall.updateBaseline`, which is a live
`commandManager` bridge and does write the geometry store.

The single table that decides what a move dispatches is
`apps/editor/src/engine/transforms/elementMove.ts:102-127` (`MOVE_COMMAND_BY_TYPE`), and the 3-D
gizmo's own dispatch list is `apps/editor/src/engine/registerTransformDragHandler.ts` (13
`dragDispatch(...)` call sites, lines 135–642). Neither contains a single `<kind>.move` verb from
the brief's list. `planMoveParity.spec.ts` pins the two surfaces to that one table.

What that means for the plan:

- The premise *"a move verb that REFUSES is useless to a user — the gizmo must move things"* **does
  not apply to these five.** The gizmo already moves things by another name. Refusal is therefore
  not only acceptable, it is the correct route (`CA-18`).
- The **real** dead move path is a verb the brief does not mention: **`wall.updateCurtainWall`** —
  which the 3-D gizmo *does* dispatch on every curtain-wall drag
  (`registerTransformDragHandler.ts:435`), and which writes a detached DTO store.

---

## 1 — ONE PROBLEM OR FOUR? — verdict

**One structural fact. Three unrelated remediation classes. The brief's grouping is not one of them.**

### 1.1 The structural fact is confirmed

`packages/runtime-composer/src/composeRuntime.ts:1498` builds `StoresSlot` as
`{ registerHydrator, hydrate, viewState, project }` — nothing else. The geometry stores
(`wallStore`, `slabStore`, `curtainWallStore`, …) are constructed by
`apps/editor/src/engine/engineLauncher.ts` (e.g. `:305`, `:774`, `:824`) and are never referenced by
`composeRuntime`. `grep committer packages/runtime-composer/src` finds only the *scene* committer —
**zero store committers are registered**, so a plugin-DTO write is never bridged back. The
headless-probe finding in the brief is correct.

### 1.2 But it does NOT make the five move verbs one fix

The composition split explains *why* a plugin `produceCommand` handler is inert. It does **not**
explain the brief's item 1, because nothing dispatches those verbs. Fixing the composition root
would make five verbs nobody calls become live. Zero user-visible change. **One ADR does not beat
four patches here, because there are not four patches — there is one refusal batch, one shadow
retirement, one bridge, and two gate fixes, and they share no code.**

### 1.3 The honest classification of every move/transform/rotate verb

Measured from `docs/04-reference/API-VERB-REGISTER.md` (generated) cross-checked against source.

| Class | Verbs | What is true | Route |
|---|---|---|---|
| **A — dead parallel family, never dispatched** | `wall.move`, `wall.transform`, `door.move`, `window.move`, `slab.move`, plus `annotation.move`, `beam.move`, `column.move`, `curtain-wall.move`, `dimension.move`, `furniture.move`, `furniture.rotate`, `lighting.move`, `plumbing.move`, `roof.move`, `section.moveLine`, `stair.rotate`, `structural.move`, `curtain-wall.rotatePanel`, `cube.move` | `produceCommand` → `ctx.stores.<kind>` (detached). No production dispatcher. Named in `CHAT_UNAVAILABLE` / `CapabilityRefusal`, so they cannot be retired. | **REFUSE** (17-verb pattern) |
| **B — production move path, genuinely dead** | `wall.updateCurtainWall`, `ceiling.update` | The gizmo *does* dispatch these; the winning handler writes a detached store; a geometry-owning legacy command exists and is unreachable. | **(c) retire shadow** (`ceiling.update`) / **L-220 distinct bridge** (`wall.updateCurtainWall`) |
| **C — production move path, live** | `wall.updateBaseline`, `wall.cascadeBaseline`, `door.setOffset`, `window.setOffset`, `column.update`, `beam.update`, `floor.update`, `roof.update`, `furniture.updateParameters`, `plumbing.moveFixture`, `stair.move`, `room.updateBoundary`, `room.move`, `slab.movePolygon`, `handrail.moveBaseLine` | Reaches `commandManager` → geometry store. | none |
| **D — instrument defects** | the register's liveness heuristic; `check-sync-disposition`'s discovery | The gates measuring the above are themselves wrong. | gate-only |

Class C contains a **false UNKNOWN**: `wall.updateBaseline` is reported UNKNOWN by
`check-verb-register.ts` but is live. See §6.

---

## 2 — Per move verb: the route, the precedent, the estimate

### 2.1 Class A — the five (and the fifteen behind them): **REFUSE**

**Route.** `§FIX-DEAD-VERB-REFUSE` — `canExecute` returns an unconditional
`{ valid: false, reason: … }` naming the live alternative ("moving a wall commits through
`wall.updateBaseline`; use the Move tool or the 3-D gizmo"). Do **not** retire: `CapabilityRefusal.ts:404,409-419`
and `ChatCapabilityRegistry.ts:2032-2046` name all five by wire identifier, and retiring would make
chat's own refusal cite a nonexistent command — the exact reason the 17 were refused rather than deleted.

**Why not (b) "make it write authoritatively".** There is no caller to benefit. `wall.move` is a
one-line facade over `TransformWallHandler` (`plugins/wall/src/handlers/MoveWall.ts:29-41`, marked
`@deprecated`). Making it live would create a *second* wall-move mutation path against P6.

**One live consumer to check before landing.** `plugins/cross/src/slab-wall.ts:161,179,195`
synthesises `wall.transform` from a slab cascade. **`CascadeRunner` is never registered in
production** — `grep cascadeRunner.register` finds only `packages/command-bus/__tests__/cascade.test.ts`
and commented-out examples in the `plugins/cross` headers. So there is no live consumer today, and a
refusal makes the cross rule fail *loudly* if it is ever wired — which is the desired direction.

**Estimate — including the lying tests, which is the expensive half.**

| File | Cases to convert | What they assert today |
|---|---|---|
| `plugins/wall/__tests__/handlers.test.ts` | 2 (`wall.move`) | `env.store.get(id)?.baseLine[1].x` on a `new WallStore()` |
| `plugins/wall/__tests__/s10-transform-wall.test.ts` | 8 (`wall.transform`) | `env.store.get(id)!.baseLine[0]` + inverse-patch replay, same DTO store |
| `plugins/door/__tests__/handlers.test.ts` | 2 | `env.door.get(id)?.offset` on a `new DoorStore()` |
| `plugins/window/__tests__/handlers.test.ts` | 2 | `env.window.get(id)?.offset` on a `new WindowStore()` |
| `plugins/slab/__tests__/handlers.test.ts` | 1 | `env.slab.get(id)?.boundary[0]` on a `new SlabStore()` |
| `plugins/wall/__tests__/baseline-fixtures.test.ts` | 2 (`move.json`) | `resolves.toBeDefined()` — a does-not-throw assertion |
| `apps/bench/src/benches/wall-handlers.bench.ts` | 1 | `sample.p95 > 0` — times a handler that changes nothing |
| `apps/editor/__tests__/transformDragUndoCapture.matrix.test.ts` | 1 (`slab.move`) | ring-buffer entry over a bare object-literal "store" |
| **Total** | **19** | |

15 of the 19 read a `new XStore()` that **the surrounding comments in the same files already
identify as detached** (`plugins/wall/__tests__/handlers.test.ts:179-184`;
`plugins/door/__tests__/handlers.test.ts:172`). Five further test files
(`plugins/cross/__tests__/*`, `packages/command-bus/__tests__/cascade.test.ts`) use these verbs as
*strings* against stub rules and are unaffected by a `canExecute` refusal.

> ⚠ The matrix file is a trap of its own: `transformDragUndoCapture.matrix.test.ts` has **14 cases
> covering `column.move`, `beam.move`, `stair.move`, `slab.move`, `plumbing.move`,
> `structural.move`, `furniture.move`, `furniture.rotate`, `stair.rotate`** — i.e. it is the pinning
> test for the *whole* Class A family, not just slab. Refusing the five without deciding the other
> fifteen leaves this file half-converted. **Refuse the whole class in one commit.**

**Estimate: 2–3 days** (5 handlers + 19 test conversions + refusal-code registration per
`check-refusal-identity.ts` + register regeneration + `UNKNOWN_LIVENESS_BASELINE` shrink). Refusing
the full 20-verb class rather than 5 adds roughly half a day, not double.

### 2.2 Class B — `wall.updateCurtainWall`: **L-220 distinct-verb bridge**

**This is the item the brief missed, and it is the only one a user can see today.**

- Winner: `plugins/curtain-wall/src/handlers/UpdateCurtainWall.ts:29` — `type: 'wall.updateCurtainWall'`,
  `affectedStores: ['curtainwall']`, `produceCommand(ctx.stores.curtainwall, …)`. Its header says
  *"Replaced F-1.3 commandManager bridge with authoritative Immer produceCommand"* — the bridge was
  **removed**, and the file mentions `commandManager` only in that comment; there is no call.
- No bridge exists in `initBusHandlers.ts` for this verb (grep of all 90 `type:` specs — absent).
- The geometry-owning command **does** exist and is orphaned:
  `packages/command-registry/src/curtainwall/UpdateCurtainWallCommand.ts:66,77,114` →
  `context.stores.curtainWallStore` — the store `engineLauncher.ts:305,774` constructs.
- Dispatchers: `registerTransformDragHandler.ts:435` (3-D gizmo) and `elementMove.ts:303`
  (plan Move tool). Both surfaces move a curtain wall, report success, and change nothing
  authoritative.

**Route.** Verbatim `§FIX-MOVE-SLAB-AND-HANDRAIL` (G7): add a `initBusHandlers` spec under a
**distinct** type the plugin cannot shadow (`curtainwall.moveBaseLine`, matching
`handrail.moveBaseLine`) → `UpdateCurtainWallCommand`; repoint `MOVE_COMMAND_BY_TYPE` and the
gizmo branch; leave the plugin handler intact for the future DTO migration. Route (c) is **not**
available — there is no shadowed bridge to un-shadow.

**Estimate: 1.5–2 days.** Includes an executed read-back probe (`CA-21`) modelled on
`apps/editor/__tests__/RoofUpdateReachesGeometryStore.test.ts`, plus `planMoveParity.spec.ts`
update. Test debt is small: `apps/bench/src/benches/curtain-wall-handlers.bench.ts` is timing-only.
**Risk:** curtain walls also carry `curtain-wall.setGrid` / `setOutline` / `resize` / `setMaterial`
etc. on the same detached store — **do not expand scope**; fix the move, log the rest.

### 2.3 Class B — `ceiling.update`: **route (c), retire the shadow**

**Verdict: the roof fix is directly transplantable. Three differences to state.**

Identical: `plugins/ceiling/src/handlers/UpdateCeiling.ts:29` is an object-literal handler,
`type: 'ceiling.update'`, `affectedStores: ['ceiling']`, `produceCommand(ctx.stores.ceiling, …)`;
`initBusHandlers.ts:631-636` is a `stores: []` bridge → `UpdateCeilingCommand`; the register lists
both sites under *Declaring sites* and marks the verb `SHADOWED`. That is `roof.update` exactly.
The payload key matches on both arms (`ceilingId`) — `roof.update` needed `id`, so this is *easier*.

**Difference 1 — undo routing changes.** The ceiling plugin handler's header states it was migrated
to `produceCommand` *specifically* so the ring buffer receives a real inverse. Retiring it moves
`ceiling.update` undo to the legacy `commandManager` stack (`stores: []`, no `undoPatch`), the same
place `roof.update` and `schedule.update` already live. `elementMove.ts:361-367` already omits
`_recordUndo`/`_prev` for ceiling, so no payload changes — but **`UpdateCeilingCommand` must be read
to confirm it registers an inverse**, and if it does not, the bridge needs an `undoPatch` like
`floor.update` has. That is the only thing that could turn a half-day into two days.

**Difference 2 — zero existing tests.** `plugins/ceiling/__tests__/handlers.test.ts` covers
`create`/`delete`/`setBoundary`/`setHeight` and **has no `ceiling.update` case at all**. Nothing to
convert; a `CeilingUpdateReachesGeometryStore.test.ts` twin must be written from scratch. Three
routing/string tests elsewhere (`MaterialDispatch.test.ts:141`, `planMoveParity.spec.ts:115`,
`packages/ai-host/__tests__/capability-acceptance.test.ts:1391`) assert dispatched command shape and
are unaffected.

**Difference 3 — a sibling is left behind.** `ceiling.updateLayers`
(`plugins/ceiling/src/handlers/UpdateCeilingLayers.ts`) is UNKNOWN on the same detached store and is
**not** part of this fix. Log it; do not scope-creep.

**Estimate: 0.5–1 day.** Cheapest item on the board and the highest confidence.

---

## 3 — Leg C (collaboration transport)

**Correction to the brief: a sync server *does* ship.** `apps/sync-server` is a real workspace —
Express + `ws`, `yjs`, Postgres advisory locks, a `Dockerfile`, migrations, a chaos suite. The brief's
"no sync server ships" is false. The two true gaps are narrower and both are already written up in
[`L-391-CRDT-COLLAB-PLAN.md`](L-391-CRDT-COLLAB-PLAN.md) §1.4:

1. **Not deployed.** The single repo `fly.toml` runs one process (`processes = ["app"]`, port 5000).
   `apps/sync-server` appears in no `fly.toml`, no root `Dockerfile`, no workflow.
2. **Not protocol-compatible.** The client factory is stock `y-websocket`
   (`packages/sync-client/src/websocketProviderFactory.ts:17,37`), which speaks the y-protocols
   binary sync + awareness framing. `grep -r 'y-protocols|readSyncMessage' apps/sync-server/src`
   → **zero hits**; the server speaks a JSON command-event protocol, and its
   `YjsProjectCache.ts` merge cache is never wired into the WebSocket dispatch. **Deploying it as-is
   gives `WebsocketProvider` nothing to talk to.**

**Client gate** (`apps/editor/src/engine/engineLauncher.ts:952-964`): needs *both*
`VITE_COLLAB_CRDT === 'true'` and `VITE_SYNC_URL`. Both unset → strict no-op. Default OFF is correct
and should stay OFF until §2 below is true.

**Scope, not build — two options for founder decision:**

| Option | Work | Ongoing | Gets you |
|---|---|---|---|
| **C-1: stock relay** | a `fly.toml` + Dockerfile for an off-the-shelf `y-websocket`/Hocuspocus process; set the two env vars; no repo TS beyond config | one small Fly machine | real CRDT replication, no auth, no server-side persistence of the Y.Doc |
| **C-2: teach `apps/sync-server` y-protocols** | implement binary sync + awareness in `SessionManager.handleMessage`, wire `YjsProjectCache`, keep the existing authz + Postgres event log | same machine | replication **plus** the auth and durability the launch actually needs |

C-1 is days; C-2 is the multi-week project L-391 already scopes. **Recommendation: neither, yet** —
this is the September launch's HUMAN DECISION (L-391 disposition: *"deploy … OR descope multi-user
real-time for V1 and remove the conflict-UI claim"*), and it is downstream of every item in §2.

**C66 — what tier this would let us claim: none.** C66 §1 defines a tier as HELD only when a k6 run
at that VU count passes §6 thresholds against a production-shaped target, recorded in
`docs/03-execution/analysis/`. **Zero tiers are HELD today** (Closed beta 50 = CLAIMED, GA 300 and
Scale 1,000 not attempted). Deploying transport does not move a tier — it merely makes the closed-beta
tier *measurable*. The artefact that moves it, `tools/load-test/pryzm-load.js`, is authored and has
never been run (L-800). C66 §1.1 forbids describing any tier as supported until then.

---

## 4 — `check-sync-disposition`'s 19% blindness

**Root cause, confirmed.** `tools/ga-gate/check-sync-disposition.ts:120-121` discovers handlers with
two regexes that both require an **object literal** (`type: '…'` within 900/400 chars of
`affectedStores`). Most handlers here are classes (`readonly type = 'wall.create';`). Its `MIN_FILES`
floor of 400 is cleared 3× over (1229 files read) and its `propertyVerbs.length < 20` floor is
cleared by 39 — so both honesty floors are inert. It exits **0** with *"Every property-mutation
command type declares its sync disposition"* over 60 of ~320 handler types.

**The correct discovery already exists** and is in the same directory:
`tools/ga-gate/check-verb-register.ts:122-139` (`TYPE_DECL_RE`, matching both forms) plus the
second-stage evidence filter `handlerish()` at `:161-171` — which exists precisely because the loose
regex admits element-kind discriminants, and whose doc comment names `check-sync-disposition` as the
victim of that noise (`door`, `rectangular`, `sitsOn`).

**The true undeclared count is 139**, and it is already published:
`docs/04-reference/API-VERB-REGISTER.md:25` (`sync UNDECLARED (property verbs) | 139`), derived by
`check-verb-register.ts:589-592`, which copies `PROPERTY_VERB_RE` **verbatim** from the sync gate and
loads `SYNC_DISPOSITIONS` live. `grep -c '| UNDECLARED |'` over the register → 139, independently.
`packages/sync-client/src/syncDisposition.ts` carries **58** declarations (25 element-property, of
which exactly 1 is LWW; 33 not-synced).

> **Contradiction to the brief:** the figure "137 undeclared" comes from the comment at
> `check-sync-disposition.ts:265`. It is a **stale transcription** — exactly what C64 §2.13 / C69 §0.1
> forbid. The number is 139 today and will move again. Cite the register.

**Plan — two commits, deliberately separated:**

1. **Make it see (half a day).** Port `TYPE_DECL_RE` + `handlerish()` from `check-verb-register.ts`
   (import, do not copy — C69 §3.2's rule applied to gates). Raise `MIN_FILES` to 900 and
   `MIN_VERBS` to a floor derived from the register's reading, per C69 §3.5's spirit. **The gate flips
   from green to ~139 hard failures the moment it can see.** Land it with a **named, shrink-only
   `UNDECLARED_BASELINE` of those 139 verbs, checked in both directions** (C69 §3.4 / §7.c — a bare
   count lets a PR fix one and break another). Never lower a floor to go green (§3.5).
2. **Shrink the baseline (weeks, not days).** 139 dispositions, each a real C08 decision, not a
   mechanical annotation. The register already records the sharpest sub-problem: the batch/`"all"`
   verbs cannot express a subject because it is late-bound — 9 are declared `not-synced` for exactly
   that reason today. **Do not estimate this as one task.** Sequence it behind the launch decision in
   §3: declaring a sync disposition for a transport that is not deployed is documentation, not
   behaviour.

---

## 5 — THE ORDER, and the smallest first step

### The smallest first step, with the largest effect

> **Fix the liveness heuristic in `tools/ga-gate/check-verb-register.ts` and regenerate the register.
> Nothing else. No product code.**

`check-verb-register.ts:495` classifies a handler as a legacy bridge only when it mentions
`commandManager`/`_cmExec` **AND** `affectedStores.length === 0`:

```ts
return (/\b(commandManager|_cmExec)\b/.test(slice)) && stores.length === 0;
```

Two consequences, both measured:

- **False UNKNOWN.** `plugins/wall/src/handlers/UpdateWallBaseline.ts` declares
  `affectedStores: ['wall']` (deliberately, for ring-buffer undo — L-49) *and* calls
  `cm.execute(new UpdateWallBaselineCommand(...))` at `:122`. It is live; the register says UNKNOWN.
  **This one row is why the brief concluded wall moves are dead.** A wrong instrument produced a
  wrong plan, and correcting the instrument is cheaper than executing the wrong plan.
- **False LIVE risk.** The test is a *mention*, not a call. `UpdateCurtainWall.ts` and
  `UpdateCeiling.ts` mention `commandManager` only in comments; they are correctly not-LIVE today
  only because they declare stores. Remove the `stores.length === 0` guard naively and both become
  false LIVE.

**The correct change is therefore one clause, not one flag:** require an actual invocation
(`cm.execute(` / `_cmExec(` / `commandManager` followed by `.execute(`), and drop the
`stores.length === 0` requirement. Verified by hand against all 27 handler files that mention
`commandManager` and declare a non-empty `affectedStores`: exactly **two** call it —
`UpdateWallBaseline.ts` and `MoveRoom.ts`. The rest mention it in prose. The change is narrow,
falsifiable, and negative-testable the same way §6 of C69 records for every other arm.

Cost: **half a day**, no product source touched, and it re-baselines the numbers every subsequent
item is measured against. This is §8.1 of the ISSUE-LOG applied to itself.

### Full order

| # | Item | Why here | Est. |
|---|---|---|---|
| **1** | Register liveness heuristic + regenerate | Every other item is graded by this instrument; it is currently wrong about the headline verb | 0.5 d |
| **2** | `ceiling.update` — retire the shadow (route c) | Proven template, zero tests to convert, payload keys already match. Fastest proof the method still works | 0.5–1 d |
| **3** | `wall.updateCurtainWall` — L-220 distinct bridge | The only *user-visible* dead move on the board. Independent of 2 | 1.5–2 d |
| **4** | Class A refusals — all 20, not 5 | Largest test-conversion cost; must land as one commit or `transformDragUndoCapture.matrix.test.ts` ends up half-converted | 2–3 d |
| **5** | `check-sync-disposition` discovery + named 139-verb baseline | Depends on 1 (shares the discovery code) and is meaningless before 4 settles which verbs refuse | 0.5 d |
| **6** | Shrink the 139 · Leg C | Both gated on the September multi-user launch decision (L-391). Not schedulable until that is made | — |

**Total for items 1–5: 5–7 working days.** Items 1–3 alone (2.5–3.5 days) close every dead write on
a path a user can actually take.

---

## 6 — What I found that contradicts the brief

1. **"Five move verbs lie … moving a wall in the 3-D gizmo reports success and changes nothing."**
   **False.** Wall moves dispatch `wall.updateBaseline`, a live `commandManager` bridge
   (`UpdateWallBaseline.ts:119-122`), pinned by L-49 and `planMoveParity.spec.ts`. None of the five
   named verbs is dispatched by the gizmo, the plan Move tool, the Align tool, the property panel, or
   the drag controllers. They are a dead parallel family.
2. **"Only `room.move` is a live bridge."** **False.** `wall.updateBaseline`, `stair.move` and
   `furniture.updateParameters` are all hybrid plugin handlers that call `window.commandManager`
   *and* declare `affectedStores` for ring-buffer undo. This is also why `stair.move` being SHADOWED
   is harmless: the shadow *winner* bridges too. `ceiling.update`'s winner does not — which is the
   whole difference.
3. **"A move verb that REFUSES is useless to a user — so (c) or (b) are the realistic options."**
   **Inverted.** For the five named, refusal is the *only* correct route (`CA-18`), and it costs the
   user nothing.
4. **The brief omits the real defect.** `wall.updateCurtainWall` — dispatched by both move surfaces,
   writing a detached DTO store, with an orphaned `UpdateCurtainWallCommand` sitting on the geometry
   store. Every curtain-wall move in production is a silent no-op.
5. **"No sync server ships."** **False.** `apps/sync-server` is a full workspace with a Dockerfile,
   `ws`, `yjs`, Postgres advisory locks and a chaos suite. The real gaps are *undeployed* and
   *wrong protocol* — narrower and already documented in `L-391-CRDT-COLLAB-PLAN.md` §1.4.
6. **"137 undeclared."** Stale. 139 today, per the generated register — and the 137 lives in a gate
   comment, which is precisely the hand-transcribed number C69 §0.1 exists to forbid.
7. **The register itself has a false negative** (§5). One row, one clause, and it is the row the
   brief's central claim rests on.

---

## 7 — What remains UNPROVEN

- **No executed probe exists for `ceiling.update` or `wall.updateCurtainWall`.** Every classification
  above is *static* — source reading plus the register's static discovery. `CA-21` requires a
  dispatch-then-read-back against the authoritative store. Until those two probes are written and
  watched failing, "dead" is a very well-evidenced inference, not a measurement. The
  `RoofUpdateReachesGeometryStore.test.ts` twin is the first deliverable of items 2 and 3, not the last.
- **Whether `UpdateCeilingCommand` registers an inverse on the `commandManager` stack** — not read.
  This is the single unknown that could double item 2's estimate.
- **Runtime registration is invisible to all of this** (C69 §6.1a). `CascadeRunner` is never
  registered in any file I could grep, but a dynamic registration would not show up. If cascade is
  live somewhere I did not find, `wall.transform` has a consumer and item 4's route changes.
- **The 139 undeclared verbs have not been triaged.** Some fraction is certainly noise of the kind
  `handlerish()` filters; the register applies that filter, but nobody has read the 139 by name.
- **Leg C is unpriced.** Neither option in §3 has a costed Fly machine size, an auth design, or a
  Y.Doc durability answer.
- **The composition-root split was not re-probed by me.** I confirmed `StoresSlot`'s shape and the
  absence of store committers statically; I did not re-run the headless probe that produced the
  `wallStore=ABSENT` output.
