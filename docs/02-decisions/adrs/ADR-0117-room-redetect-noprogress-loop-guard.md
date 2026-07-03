# ADR-0117 — Room re-detection is loop-guarded so a non-closing room loop cannot re-arm forever (§FIX-ROOMREDETECT-NOPROGRESS-GUARD)

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
