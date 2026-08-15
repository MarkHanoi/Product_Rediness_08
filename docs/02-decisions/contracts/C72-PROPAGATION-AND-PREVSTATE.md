# C72 — Propagation and prevState

> **Stamp**: 2026-08-12 · **Status**: CANONICAL
> **Scope**: how a change reaches everything that depends on it. Owns the change-propagation protocol — the generic cascade, the bespoke per-pair trackers, the pre-mutation state (`prevState`) that diff-based propagation requires, and the suppression flags that switch propagation off. Owns nothing about *what* the dependent element then recomputes: that is C73.
> **Key principle**: *A cascade nobody listens to and a diff with no `prevState` are the same defect — a change that arrives nowhere.* Propagation is a claim about **two** things: that a subscriber exists, and that the subscriber receives enough to act. Asserting either alone is theatre.
> **Authority**: subordinate to `STR-03-engineering-vision.md` / `STR-04-architecture.md`. Peers with **C03** (schemas/commands/state — owns what a command *is* and what a store write *is*), **C16** (command authoring — owns how a mutation is written), **C11** (element creation pipeline — owns the forward build), **C15** (hosted elements — owns the door/window↔wall pairing this contract's best-wired path serves), **C04** (rendering/scheduling — owns *when* a marked-dirty thing is redrawn), **C05**/**C13** (persistence & lifecycle — own the load/hydrate window this contract's suppression flags live inside), **C69** (the verb register — owns the enumeration of what can *start* a propagation), **C73** (determinism & tolerance — owns what the recompute must produce). Supersedes nothing.
> **Gate**: `tools/rac-conformance/certification/gates/check-propagation-reaches.ts` (exists; ledger `cascade-events.json`). Two further gates are **specified here and NOT YET BUILT**: `check-prevstate-contract`, `check-suppression-is-reversible`.
> **Changelog**: 2026-08-12 — created as part of the BIM 3.0 suite, from the Phase 0 propagation sweep. Every number in §0 was re-measured at HEAD on this date.

---

## §0 — Why this contract exists

PRYZM has a generic change-propagation protocol. It is **dead**, it has been dead for
long enough that a `TODO` id is attached to it, and it is dead in a way that looks alive
to every audit method short of running it.

**Measured at HEAD, 2026-08-12:**

- `packages/core-app-model/src/DependencyResolver.ts` dispatches four CustomEvents —
  `pryzm-dep-cascade` (line 120), `pryzm-room-reval` (128), `pryzm-hosted-reval` (133),
  `pryzm-structural-cascade` (138). **All four carry `TODO(TASK-15)` on the dispatch
  line itself.**
- **Zero listeners.** A sweep of production `.ts`/`.tsx` across `packages`, `plugins`,
  `apps`, `src`, `server` finds no `addEventListener`, `.on(`, or `.subscribe(` for any
  of the four names. The only other hits in the estate are the emitter's own doc-comment
  and the typed catalog.
- `setRebuildDispatcher` — the "tighter integration" escape hatch the file's own comment
  points at — has **2 hits, both inside `DependencyResolver.ts`** (the doc-comment at
  line 155, the definition at 207). It is never called.
- `operation === 'delete'` returns `[]`. The one operation with the largest dependent
  fan-out computes nothing.

### §0.1 — Why it survived: a typed catalog entry reads like wiring

All four names have **typed entries** in `packages/event-bus/src/catalog.ts` (lines 212,
216, 230, 232), with payload shapes. That is the whole explanation for the survival time.
An auditor greps the event name, finds a declaration in a central catalog with a type on
it, and concludes the event is part of the system. It is a *contract for a payload*, not
evidence of a *consumer*. **A typed declaration is not wiring, and this repository must
stop reading it as such** — it is the same shape as the authored-but-unwired hazard that
`check-verb-register.ts` (C69 §2.1 `UNKNOWN`) exists to name.

### §0.2 — Why one arm is not enough

`StoreChangeEvent` (`packages/core-app-model/src/StoreEventBus.ts:63–80`) **was**
`{ elementId, elementType, operation, timestamp }` plus two `@deprecated` reserved flags,
carrying **no pre-mutation state**. `DependencyResolver` subscribes to the *bus*, not to
the stores — so even if listeners appeared, the diff-based work those listeners exist to
do (adjacent-wall discovery, property-only fast paths) was structurally unreachable.

> ✅ **CLOSED 2026-08-12 (`1341b3bc`).** `StoreChangeEvent` now declares an **optional**
> `prevState` (ARM B1), the `pryzm-dep-cascade` catalog payload declares it (ARM B2), and
> the default dispatcher populates it from the trigger event. Optional, so none of the 23
> existing subscribers change behaviour. **Scope, stated rather than overclaimed:** the
> field flows from **WallStore's** bridge only — the store whose classifier actually
> consumes the third argument — per §3.1, which scopes the MUST to stores with a live diff
> consumer. The other §STEP7 store bridges still emit four fields. Meanwhile `prevState` **is** emitted, as an optional third callback argument,
by exactly **5** stores — `packages/geometry-wall/src/WallStore.ts`,
`packages/geometry-slab/src/SlabStore.ts`,
`packages/core-app-model/src/stores/ColumnStore.ts`,
`packages/geometry-column/src/ColumnStore.ts`,
`packages/core-app-model/src/stores/RoomBoundingLineStore.ts` — out of **120** `*Store.ts`
files in `packages/` (non-test). `WallStore.ts:19` even says *"DependencyResolver uses
prevState"*. It cannot: nothing carrying it reaches the resolver.

So: **listeners without `prevState`** can only invalidate wholesale — that is the ADR-057
defect. **`prevState` without listeners** is a perfectly-shaped event nobody receives.
Only both is propagation. This is why the gate has two arms, and why a one-armed gate
would have been worse than none.

### §0.3 — What actually works, and must not be "cleaned up"

Everything that propagates in PRYZM today is **bespoke per-pair wiring**, and it works:
`DoorDependencyTracker` / `WindowDependencyTracker`, `WallRebuildCoordinator`,
`RoomTopologyObserver`, cascade-delete, and the `SpatialAuthority` level-rebuild callback.
Level 4 of the BIM maturity ladder rests on **this**, not on the cascade. A refactor that
retires the bespoke trackers in favour of the generic path would retire the only working
propagation in the product.

---

## §1 — The two arms (the definition of "propagates")

> **§1.1 — MUST.** A declared propagation channel **propagates** only if **both** hold:
> **ARM A** — at least one production source (not the catalog declaration, not the emitter
> file, not a test) registers a handler for it; and **ARM B** — the emitter can and does
> carry pre-mutation state, in two places, both required:
> **B1** the emitter's *trigger source type* declares a pre-mutation field (the emitter
> *could* forward one), and **B2** the event's own typed catalog entry declares one (the
> emitter *does*, and a listener may rely on it).
> B1 without B2 is a source that holds the data and drops it. B2 without B1 is a contract
> promising data nobody holds.

> **§1.2 — MUST NOT.** No document, gate, review or PR description may describe a channel
> as "wired", "live" or "propagating" on the strength of a typed catalog entry, a doc
> comment, or an emitter alone (§0.1).

> **§1.3 — MUST.** Arm A's detector is **deliberately generous**: it accepts every
> subscription shape the estate uses (`addEventListener`, `.on(`, `events.on(`,
> `.subscribe(`, `runtime.events.on(`). A false negative here — a real listener the
> pattern missed — would report a defect that is not there, and the gate's entire
> authority is that its findings are real.

---

## §2 — The generic cascade: wire it or delete it

> **§2.1 — MUST.** The four declared cascade events are a **decision debt, not a feature**.
> Each must reach one of exactly two terminal states: **WIRED** (passes both arms of §1.1)
> or **DELETED** (dispatch site, catalog entry and ledger row removed in one commit). No
> third state is permitted to persist.

> **§2.2 — MUST NOT.** No new consumer, plugin, contract or plan may be written *against*
> the generic cascade while it is in neither terminal state. Building on an unwired channel
> converts one dead subsystem into a dependency graph of dead subsystems.

> **§2.3 — MUST.** `operation === 'delete'` returning `[]` is a **finding of the same
> class as a missing listener**, and must be recorded as such if the cascade is wired
> rather than deleted. Deletion has the largest dependent fan-out of any operation;
> computing nothing for it is not a conservative default, it is a silent one.

> **§2.4 — the do-not-rebuild rule (MUST NOT).** The bespoke trackers named in §0.3 are
> **protected**. They may not be removed, deprecated, or routed through the generic
> cascade as part of wiring it. A migration off them requires the replacement to be
> demonstrated propagating *first*, per-pair, under §4 — never a flag-day swap.

### §2.5 — ⚠ MEASURED 2026-08-15: THE RUNNER §2.1's "WIRED" STATE REQUIRES DOES NOT EXIST IN PRODUCTION

**§2.1 offers two terminal states, WIRED or DELETED, and assumes reaching WIRED is a matter of
registering a handler. Measurement says otherwise, and the contract must say so rather than let
successive lanes discover it one at a time.**

Lane R2 (PR-11, commit `278b99e5`) implemented `room.recomputeBoundary` properly — a genuine
tri-state determination returning independently-determined forward AND inverse impacts, with four
reasons reused from C78 §8.1's closed union, differentiation proven by executing the suite against
a no-op stand-in (6 failed) and against a wrong-impact stand-in (6 failed, a **different** set). The
handler is real. **PR-11 still cannot reach WIRED**, for a reason no row anticipated:

> **`new CascadeRunner()` appears ONLY IN TEST FILES, repo-wide.** There is no live registry in
> production for `registerCrossHandlers` to register into.

So `registerCrossHandlers` having zero production callers was **never a wiring oversight**. The
channel §2.1 describes has no production instance at all — the tests instantiate their own runner,
which is why every suite around it passes while nothing propagates in the product. This is the
authored-but-unwired class one level up: not an unreached handler, but an unreached *framework*.

**Consequences, binding:**
1. **A handler registered against a runner that only tests instantiate does NOT satisfy §2.1's
   WIRED state**, and must not be reported as satisfying it. §1.1's two arms are unreachable by
   construction until a production runner exists.
2. **Standing up a production `CascadeRunner` is a composition-root change** (P1 — production code
   obtains a runtime only via `composeRuntime()`), and therefore a sequenced, founder-visible
   decision, not a task a handler lane may absorb.
3. **§2.2 now bites harder than when it was written.** "No new consumer may be written against the
   generic cascade while it is in neither terminal state" was aimed at plugins; it applies equally
   to any lane tempted to register a handler and call the row closed. A registration into a
   nonexistent registry is precisely the "dependency graph of dead subsystems" §2.2 forbids.
4. Until it is resolved, the honest status of any such row is **"handler real, channel absent"** —
   which is neither WIRED nor DELETED, and is therefore a THIRD state §2.1 does not permit to
   persist. **That contradiction is the finding, and it is the decision this section escalates.**

---

## §3 — prevState

> **§3.1 — MUST.** A store whose consumers make *diff-based* decisions — "did only a
> property change?", "which neighbours moved?", "is this a whole-level rebuild or a local
> one?" — emits the pre-mutation snapshot as the third callback argument on `update`
> (absent on `add`; there is no prior state). This is the `§STEP7` convention already
> carried by the stores in §0.2 and it is the one to copy.
> > ⚠ **CENSUS CORRECTED 2026-08-12.** §0.2 said *"exactly 5 stores emit prevState."*
> > `check-prevstate-contract` (built this day) measured **10 of 19 update-emitting stores** carry
> > it on ≥1 site (Door and Window in both duplicate copies, RoomStore and RoomBoundingLineStore
> > included). The gate is the authority on the count (C69 §0.1 — cite the gate, never a prose
> > number); this line no longer states one. The gate's shrink-only ledger names **21 2-arg emit
> > sites** — the work is not "5 stores lack it" but "these 21 sites do", and
> > `WallStore.ts:1021/1065/1102/1134` are the highest-value strikes: WallStore is the store whose
> > classifier actually consumes the third argument.

> **§3.2 — MUST.** A change-notification **type** that a diff consumer subscribes to
> declares a pre-mutation field. `StoreChangeEvent` did not, and that was the standing
> finding: a consumer subscribed to a type that structurally cannot carry what it needs
> is unfixable at the consumer.
>
> > ✅ **SATISFIED 2026-08-12 (`1341b3bc`)** — the type declares it, the catalog payload
> > declares it, the dispatcher populates it. The MUST now reads forward, not backward: a
> > *new* diff consumer may not be introduced against a type that cannot carry its input.
> > The `check-prevstate-contract` ledger (21 → **17** sites, the four WallStore strikes
> > paid) is the authority on how much of the emit surface still starves.

> **§3.3 — MUST NOT.** A propagation path may not be introduced whose classifier's only
> `no-prevState` branch is its *shipping* branch. The openings fast path was unreachable
> for want of **two arguments** — `WallStore.updateDoor` / `updateWindow` emitted without
> the pre-mutation wall, so every opening edit classified `whole-level` with reason
> `no-prevState`. Both call sites now pass it (`WallStore.ts:1279`, `:1363`).

> **§3.4 — MUST (the seam rule).** *A propagation test whose fixture supplies the very
> value under test proves nothing.* Every existing classifier test passed throughout the
> §3.3 defect, because each one **built `prevState` by hand** and handed it to the
> classifier. They tested the classifier; the broken thing was the **seam** — the emit.
> A propagation test MUST drive the real mutation entry point and observe what the real
> subscriber received. `packages/geometry-wall/__tests__/WallOpeningEmitSeam.test.ts` is
> the shape to copy; the hand-built-fixture tests remain valid as *classifier* tests and
> must not be mistaken for propagation tests.

> **§3.5 — MUST NOT.** `prevState` may not be reconstructed by the consumer by re-reading
> the store. After the mutation the store holds the *new* value; a re-read yields a diff
> of a thing against itself, which classifies as "unchanged" — a false clean, and
> failure-as-emptiness (§CONTEXT-DATA-HONESTY).

---

## §4 — Suppression must be reversible

Propagation is switched off in two places in this repository, and **both switch-offs
outlive their reason**.

> **§4.1 — MUST.** Every suppression flag has a **reachable release path in production
> code**. `RoomTopologyObserver._graphAuthoritativeLevels` (`packages/room-topology/src/
> RoomTopologyObserver.ts:101`) is marked from four production sites
> (`ApartmentLayoutExecutor`, `HouseLayoutExecutor` ×2 and their kin). Its **public
> release method `clearGraphAuthoritative` (line 110) has 1 definition, 0 production
> callers, 1 test caller.** The only release that actually runs is the narrow inline GR2
> branch at line 169 — a manual `add`/`remove` of a wall on that level, *outside* a batch.
> An `update`, a batched mutation, or a level the user never structurally edits stays
> frozen for the session. Every generated level therefore keeps its rooms suppressed by
> default.

> **§4.2 — MUST.** A pause/resume pair around a fallible operation is written with
> `try { … } finally { resume() }`. `apps/editor/src/engine/initPersistence.ts:362` pauses
> `roomTopologyObserver` and `syncStateEngine` and resumes at :372 with **no `finally`**.
> A throw inside `ProjectLoader.load` leaves topology observation and sync-state recompute
> off for the remainder of the session, silently, with the project loaded and looking fine.

> **§4.3 — MUST NOT.** A release mechanism may not be *by construction* a no-op — a
> sweep, method or hook that nothing in production reaches. §4.1 is precisely that, and it
> is indistinguishable from a working release to anyone reading the class.

> **§4.4 — MUST.** Suppression is **scoped and announced**. A flag that suppresses for a
> level, a batch or a load window states which, and its lifetime is bounded by that scope,
> not by process lifetime.

---

## §5 — Reconciliation must cover what it names

> **§5.1 — MUST.** A reconciliation whose element-type whitelist names N types either
> handles N types or **records the shortfall by name**.
> `packages/core-app-model/src/SpatialAuthority.ts:243` declares
> `RECONCILABLE_TYPES = { Wall, window, door, Window, Door, Slab, Column, Beam, Roof,
> Furniture, CurtainWall, Stair, Handrail }` — thirteen entries.
> **It is exported and has zero consumers anywhere in the repository.** The actual
> level-elevation reconcile is the single callback in
> `apps/editor/src/engine/initWallLevelSubscribers.ts:36–53`: it rebuilds **walls**
> (`builder.updateWall`) and **slabs** (`slabStore.triggerRebuild`) and nothing else.
> Columns, beams, stairs, roofs, furniture, curtain walls and handrails on a re-elevated
> level are **stranded at the old elevation**.

> **§5.2 — MUST NOT.** A whitelist, registry or ledger may be exported without a consumer.
> It is the §0.1 hazard in its purest form: it reads as coverage and is an opinion.

---

## §6 — The gates

### §6.1 — `check-propagation-reaches` — EXISTS

`tools/ga-gate/`-peer path: `tools/rac-conformance/certification/gates/check-propagation-reaches.ts`,
ledger `./cascade-events.json`.

| Check | Kind | What it asserts |
|---|---|---|
| **floors** | exit **2** | the ledger loaded, ≥1 event declared, ≥**1500** production files scanned, ≥**200** typed catalog entries readable. A sweep of an empty tree would report "no listener anywhere" for every event and look like a *maximal* finding — the floor makes that a misconfiguration, not a pass. |
| **ARM A** | finding | ≥1 production listener per declared event (§1.1, generous detector per §1.3) |
| **ARM B1** | finding | the emitter's trigger-source type declares a pre-mutation field |
| **ARM B2** | finding | the event's typed catalog entry declares one |
| **ledger** | exit **3** | `declaredFindings` is **named and shrink-only**; a finding that stops appearing must leave the ledger in the same commit — *"debt that has been paid must not stay on the books."* |

**Reading at mint time (2026-08-11): 8 findings, all 8 declared** — four
`ARM-A no listener`, four `ARM-B emitter carries no prevState`, one pair per event.
The gate was GREEN *at its declared level*, which per C66 §1.1 means "the known defect
has not grown", **not** "propagation works".

> ✅ **CURRENT READING (2026-08-12, commit `1341b3bc`): 0 findings, hard-0, no baseline.**
> The four events were resolved by the §2.1 wire-or-delete decision, **per event from
> evidence, not by wiring all four**:
> - `pryzm-room-reval` **DELETED** — duplicated the protected `RoomTopologyObserver`.
> - `pryzm-hosted-reval` **DELETED** — duplicated the EXECUTED-PROVEN Door/Window trackers.
> - `pryzm-structural-cascade` **DELETED** — its `sitsOn`/`supports` coverage travels
>   inside `pryzm-dep-cascade`'s tasks.
> - `pryzm-dep-cascade` **WIRED, both arms** — a real listener
>   (`apps/editor/src/engine/initDependencyCascade.ts`) routing **only** `sitsOn`/
>   `supports`, the one pair EV-03 measured no bespoke tracker serving, into the
>   *existing* rebuild entry points. Priorities 2/3 are explicitly skipped, citing the
>   trackers that own them — a second cascade over the same pairs would double-rebuild.
>
> Dispatch, catalog entry and ledger row were removed together for each deletion, with
> dated tombstones at all three sites, so `grep` can no longer read a dead event as
> wiring. `declaredFindings` is now `[]` and the entry was struck from `gate-debt.json`
> in the same commit — **debt that has been paid does not stay on the books.**
>
> **What this does NOT claim.** §6.1.1 still binds: the gate is static, so
> "the listener is registered" is source-proven, and the browser-level routing of
> `pryzm-dep-cascade → initDependencyCascade` is **NOT** executed-proven. The routed
> pair also stays *idle* until `sitsOn` edges exist in the graph — which the Phase-3
> rebuild widening (`df8f67a2`) began emitting at load time on the same day.

> **§6.1.1 — why this gate is static, not runtime.** "A listener exists" is a claim about
> the whole estate, and no headless world composes the whole estate — the certification
> world registers 9 plugin bridges out of 48 plugins. A runtime probe answers "no listener
> in *this* world", a strictly weaker sentence than the one §1.1 asks.

> **§6.1.2 — what it cannot see.** (a) A listener registered from a string built at
> runtime. (b) Whether a listener that exists does anything correct — arm A is presence,
> not behaviour. (c) Whether a `prevState`-carrying emitter carries the *right* snapshot.
> (d) Propagation that is bespoke (§0.3) — the ledger's subject is the four generic events
> only, and the bespoke trackers are ungated today. **UNPROVEN: no gate asserts that the
> bespoke trackers still reach their pairs.**

### §6.2 — `check-prevstate-contract` — SPECIFIED, NOT BUILT

Subject: every store whose subscribers make diff-based decisions (§3.1), and every
change-notification type such a subscriber consumes (§3.2).

| Check | Kind | What it asserts |
|---|---|---|
| **P0** | exit **2** | ≥ a floor of `*Store.ts` files read and ≥1 diff consumer discovered |
| **P1** | ratchet, **named** | every store on the declared diff-consumer list emits the third argument on **every** `update` emit site — not merely declares the parameter in its listener type |
| **P2** | hard | no classifier ships whose `no-prevState` branch is its only reachable branch (§3.3) |
| **P3** | ratchet, **named** | a propagation test exists per pair that drives the **real** mutation entry point (§3.4); hand-built-fixture tests do not satisfy it |

Baselines must be pinned **at the measured reading**, per `check-offset-implementations.ts`'s
own correction: a ratchet sitting above its reading is not a ratchet, it is free slots.

### §6.3 — `check-suppression-is-reversible` — SPECIFIED, NOT BUILT

Subject: every suppression flag, pause/resume pair and authority marker.

| Check | Kind | What it asserts |
|---|---|---|
| **S0** | exit **2** | ≥1 suppression site discovered (a scan finding none is misconfigured, not clean) |
| **S1** | hard | every marker with ≥1 production caller has a **release with ≥1 production caller** (§4.1, §4.3) |
| **S2** | hard | every `pause()`…`resume()` pair spanning a fallible call is inside `try/finally` (§4.2) |
| **S3** | ratchet, **named** | declared scope per flag; a flag with no declared scope is a finding |

---

## §7 — Exit conditions

- **§6.1 exits** when `cascade-events.json.declaredFindings` reaches **0** — every event
  either wired (both arms) or deleted (§2.1) — and the ledger file is removed with the
  gate's finding path.
- **§6.2 exits** when P1 and P3 reach **0** named entries and `StoreChangeEvent` (or its
  successor) carries a pre-mutation field, at which point §3.2's standing finding closes.
- **§6.3 exits** when S1 and S2 are hard-0 with no exemptions and S3's unscoped list is
  empty.
- **§5 exits** when `RECONCILABLE_TYPES` has a consumer that handles every type it names,
  or the list is reduced to the types actually handled (§5.1, §5.2). Reducing the list is
  an acceptable exit — *narrowing a claim to the truth is a fix*; leaving it broad is not.

---

## §8 — Anti-patterns

- **§8.a — Reading a typed catalog entry as wiring.** §0.1. The single highest-yield
  misreading in this subsystem's history.
- **§8.b — A one-armed propagation gate.** §0.2. Listeners-only or `prevState`-only is
  theatre and is worse than no gate, because it is green.
- **§8.c — Testing the classifier and calling it propagation.** §3.4. If the fixture
  supplies the value under test, the seam is untested.
- **§8.d — Reconstructing `prevState` from the store.** §3.5. Diffs a value against
  itself and reports "unchanged".
- **§8.e — A release method with no production caller.** §4.1/§4.3. Reads as reversible,
  is not.
- **§8.f — `pause()` without `finally`.** §4.2. The failure mode is a silently degraded
  session, not a crash.
- **§8.g — Retiring a bespoke tracker in favour of the generic path.** §2.4. The bespoke
  path is the working one.
- **§8.h — An exported whitelist with no consumer.** §5.2.
- **§8.i — Building on the unwired cascade.** §2.2.
