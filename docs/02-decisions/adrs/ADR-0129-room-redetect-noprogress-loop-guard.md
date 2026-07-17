> **Renumbered 2026-07-16**: originally filed as `ADR-0117` (added 2026-07-03 13:19), which collided with [ADR-0117 — Uniform `material.set` surface](./ADR-0117-uniform-material-set-command.md) (added 2026-07-03 10:36, earlier). Renumbered to **ADR-0129** to resolve the duplicate. Body below is unchanged from the original. See the old→new map in [adrs/README.md §2.1](./README.md).

# ADR-0129 (formerly ADR-0117) — Room re-detection is loop-guarded so a non-closing room loop cannot re-arm forever (§FIX-ROOMREDETECT-NOPROGRESS-GUARD)

> Fixes founder blocker **L-63** — "create a wall with a hosted door, then MOVE it → the whole app freezes."
> A SECOND, distinct freeze mechanism from ADR-0099 (which removed the O(walls × openings) rebuild scan).

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-07-03 |
| Owner | Room topology (`packages/room-topology/src/RoomTopologyObserver.ts`) |
| Builds on | ADR-0099 (§FIX-HOSTWALL-DOOR-INDEX / §FIX-HOSTWALL-MOVE-COALESCE) · ADR-0098 F3 §FIX-WALLMOVE-REDETECT-DEFER · §FIX-WALL-JOIN-BASELINE-IMMUTABLE |
| Governs | The wall-move → whole-level room-redetect re-arm loop |
| Tags | §FIX-ROOMREDETECT-NOPROGRESS-GUARD |
| Contracts | C11 (room re-detection lifecycle) · P3 (no new rAF — timer-based, drains on the existing schedule) · P6 (redetect still dispatched via `ReDetectRoomsCommand`) · 8-layer rule respected (room-topology stays L-low) |

## Context

The founder reported a hard, reproducible total freeze: **create a wall with a hosted door, then MOVE
the wall.** Main thread pegged, UI dead. The production log shows the exact mechanism — and it is NOT
the ADR-0099 quadratic-scan freeze (that one is fixed):

```
[WallJoinResolver] §MULTI-CLUSTER-PARTITION-TRIM wall=…(start) angled arm 0.313m off junction → square-cap to consensus
[RoomDetectionEngine] §DIAG-PARTITION-REACH reconnected guest=… onto host=… body — closed a 307mm dangling gap
[RoomDetectionEngine] §DIAG-ROOM-LOOP BREAK … endpoint 307mm from centreline EXCEEDS hostSnap 200mm → loop will NOT close (flood/merge risk)
```

1. The join resolver square-caps the moved arm to a cluster **consensus** point that sits **> hostSnap
   (200 mm)** from the host body the room loop must close against — a **dangling gap the room loop
   cannot close**.
2. The wall rebuild emits `bim-wall-mutation-committed`; `RoomTopologyObserver` runs a **whole-level**
   room re-detection.
3. Re-detection cannot close the loop (the > hostSnap break), and the churn re-emits a committed
   signal, which **re-arms another whole-level redetect** — **every frame**. Whole-level
   `RoomDetection` per frame pegs the main thread → freeze.

The guards already in place (`§FIX-WALLMOVE-REDETECT-DEFER` drag-defer, ADR-0099 coalesce) cover the
*during-drag* storm and the per-opening fan-out. They do **not** cover a **post-commit** loop that
re-arms on a non-closing room loop with **stable** geometry.

## Decision — §FIX-ROOMREDETECT-NOPROGRESS-GUARD

**Invariant.** Room re-detection is a **pure function of the level's wall geometry** (plus curtain
walls / slabs, which drive their own subscriptions). Because a join is a *render-time footprint*
operation (`§FIX-WALL-JOIN-BASELINE-IMMUTABLE` — a join never mutates a stored baseline), the STORE
baselines are **stable** across the loop. Therefore a redetect requested on **byte-identical** wall
geometry can make **no progress**; running it again only pegs the main thread. Re-detection must not
be **rescheduled** on no-progress.

Two bounds in `RoomTopologyObserver`, keyed on a cheap per-level **wall signature** (`id` + baseline
endpoints @ mm + thickness, order-independent):

1. **Committed-path no-progress gate** (`_onWallMutationCommitted`) — before arming the soft-coalesce
   redetect for a level, compute its wall signature. If it equals the signature the **last completed
   redetect** saw, the event can make no progress → **do not arm**. A genuine wall edit changes the
   signature and releases the gate immediately. The loop after a > hostSnap dangling gap breaks after
   **exactly one** redetect.
2. **Execution circuit-breaker** (`_executeRedetect`) — four paths reach the execution chokepoint
   *without* passing the committed gate (the WallStore debounce timer, the forced-fire branch, the
   soft-coalesce timer, `scheduleRedetectAllLevels`). If the **same** wall signature fires redetect
   more than `NOPROGRESS_MAX` (6) times inside `NOPROGRESS_WINDOW_MS` (1 s) — a per-frame runaway from
   any re-arm source — stop firing until the geometry genuinely changes. A real interaction never
   redetects one level six times in a second on identical wall geometry (all wall/slab/CW inputs are
   debounced); a 60 fps runaway trips within ~100 ms.

The signature is `''` (guard inert) when the wall store cannot be read (e.g. a minimal harness with no
`getByLevel`), so behaviour there is exactly as before this ADR.

### Why the guard, not (only) a resolver-side geometry change

The coordinator's brief asked for two parts: (1) the resolver trim should not leave a > hostSnap
dangling gap, and (2) a loop guard. Part 2 is implemented here as the **definitive** fix — it stops the
freeze regardless of any residual geometry edge-case, and maps cleanly to the C11 re-detection
lifecycle (idempotent re-detection).

Part 1 (a `WallJoinResolver` trim change) was **investigated and deliberately NOT shipped in this
pass**: the same `§MULTI-CLUSTER-PARTITION-TRIM` consensus square-cap is **desired** in a sibling
case — `WallJoinResolver._repro_passthrough` pins that a 290 mm perpendicular partition **must** be
pulled onto the junction (consensus lands on a *committed corner*, i.e. ON the host body, so the loop
closes). The discriminator between "consensus on the host body (cap is correct)" and "consensus off a
*different* host body the room needs (cap orphans)" is **not derivable from the cluster alone** — the
relevant host is chosen at detection time, downstream of the resolver. A `dConsArm`-travel heuristic
regresses the 290 mm case; a consensus-to-pass-through-body heuristic is a no-op on the repro (Priority-1
committed-corner consensus) yet risks **silent** regressions in untested generated-house room-sealing
paths. Per the whole-architecture mandate, shipping a speculative trim change was judged worse than a
precise, tested loop guard. A targeted Part-1 fix should be done once the **exact failing project
geometry** is captured (recommended follow-up).

## Consequences

- The wall-move-with-hosted-door freeze is removed at the re-arm loop: a non-closing room loop can
  no longer spin whole-level re-detection. The room simply does not seal at the > hostSnap gap (a
  visible, correct outcome the user can fix by moving the wall) — the app stays responsive.
- No behavioural change on the happy path: a genuine wall move/add/remove/thickness edit changes the
  signature and re-detects exactly as before; the drag-defer + coalesce guards are untouched.
- Non-wall triggers (slab / column / curtain-wall / bounding-line) route through their own
  subscriptions and are unaffected (the committed gate is wall-path-only; the circuit-breaker keys on
  the wall signature and never trips on debounced, changing-geometry interactions).
- Tests: `packages/room-topology/src/__tests__/roomRedetectNoProgressGuard.test.ts` — N committed
  events on unchanged walls → exactly ONE redetect; a genuine edit re-detects again; a direct-call
  runaway is bounded (≤ `NOPROGRESS_MAX`), never infinite; the minimal-harness path is inert. The
  existing `wallMoveRedetectDefer` + `observerGraphAuthoritative` suites stay green.


## Sibling — §FIX-WALLFLUSH-NOPROGRESS-GUARD (the WALL-REBUILD flush loop — 2026-07-04, L-97)

**Status:** SHIPPED. The same no-progress pattern as §FIX-ROOMREDETECT-NOPROGRESS-GUARD, applied to
`apps/editor/src/engine/WallRebuildCoordinator._flush` — a THIRD, distinct hard-freeze the founder
reported (L-97), different from both this ADR's room-redetect loop (L-63) and ADR-0099's quadratic
scan.

**Defect (L-97).** Wall with a hosted door → move the wall → app freezes. Stack: an infinite
`requestAnimationFrame` loop entirely inside the WALL flush —
`§SELF-CLUSTER-GUARD → _handleMultiWallClusters → resolveLevel → _flush → tick → requestAnimationFrame → …`.

**Root cause.** `_flush` writes each resolved wall's baseline back to the store (`store.update`); that
mutation fires a BUFFERED `wall:update` that re-arms `_scheduleFlush` after `_joinsResolving` clears.
§PRESERVE-IDEMPOTENT already stopped the *preserve* branch from re-writing an unchanged anchor, but
when the moved door-bearing wall clusters with a `§SELF-CLUSTER-GUARD` wall (a wall whose BOTH
endpoints fall in one junction cluster — a short stub / degenerate wall near the corner), the moved
wall's resolve is **non-idempotent**: the `_bMoved && !_preserve` branch writes a re-trimmed baseline
every flush → re-arm → the flush never converges → the main thread pegs.

**Fix.** `_flush` is a pure function of the level's wall REBUILD inputs. Two bounds, keyed on a
per-level signature (id + baseline @ mm + thickness + height + baseOffset + openings + layers + curve
+ material):
1. **No-progress gate** — at the TOP of `_flush`, BEFORE both the openings-only fast path and the
   whole-level path: if every affected level's signature is byte-identical to what the last completed
   flush already built, skip the flush entirely (no resolve, no `store.update`, no
   `bim-wall-mutation-committed`) → the loop terminates after ONE flush. Because the gate compares the
   CURRENT store geometry to the last *built output*, it converges whether the resolver would re-write
   a stable baseline or an oscillating one (the re-armed flush is skipped before it can write again).
2. **Circuit-breaker** — trips if the same signature reaches `_flush` more than 8 times inside 1 s
   (any re-arm source / a rebuild input the signature does not capture).

The signature covers material / height / baseOffset, so a legitimate material or elevation edit (which
leaves the join geometry unchanged) still changes it and is NEVER suppressed — only the true no-op
re-arm (the baseline anchor write-back) is gated out. The recorded signature is refreshed at the end of
BOTH the openings-only fast path and the whole-level path.

- **Locus:** [`WallRebuildCoordinator`](../../../../apps/editor/src/engine/WallRebuildCoordinator.ts) —
  `_levelWallSig` + the gate/breaker at the top of `_flush` + the per-path signature record. No change
  to `WallJoinResolver` / the geometry; the geometry root (a self-cluster wall making a neighbour's
  resolve non-idempotent) is rendered harmless by the convergent flush. Builds on §PRESERVE-IDEMPOTENT
  (which fixed the sibling preserve-branch loop) and §FIX-WALL-JOIN-BASELINE-IMMUTABLE.
- **Tests:** [`apps/editor/__tests__/wallFlushNoProgressGuard.test.ts`](../../../../apps/editor/__tests__/wallFlushNoProgressGuard.test.ts)
  — a wall-move-with-hosted-door converges in bounded frames (commit barrier fires a bounded number of
  times, not ~per-frame); N no-op re-arms on unchanged geometry cause ZERO extra rebuilds while a
  genuine geometry edit still rebuilds. The 39-test wall-coordinator / freeze / preserve / reload-
  stability suite stays green (the gate never suppresses a load-flush or a real edit).
- **Alignment:** P3 (no NEW rAF — the flush still drains on the existing frame scheduler; the guard only
  *stops* re-arming it) · P6 (mutations unchanged) · ADR-0099 / ADR-0055 (wall-rebuild + junction
  context). Same family as the room-redetect guard above: room re-detection and the wall flush are BOTH
  pure functions of the level's wall geometry, so both are made convergent by a no-progress signature.
