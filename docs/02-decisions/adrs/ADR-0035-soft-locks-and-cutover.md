# ADR-0035: Soft-Locks (S45 D1-D4) and Replit-PG → Supabase Cutover Gate (S45 D5)

- **Status**: Accepted (PARTIAL-RATIFIED — server + client + UI shipped; D5
  cutover deletion bound to S43 D9 cutover landing)
- **Date**: 2026-04-28
- **Sprint**: Phase 2D / S45
- **Spec source**: `docs/03-execution/plans/legacy/phases/PHASE-2/2D-Q4-M22-M24-SYNC-AWARENESS-BETA.md`
  §S45 (lines 380-507)
- **Related**:
  - ADR-0033 (sync-client event bridge — froze the awareness wire shape
    incl. `heldLocks: string[]`)
  - ADR-0034 (multiplayer cursors — established the renderer pattern that
    LockBadgeRenderer mirrors)
  - ADR-0015 (snapping deletion — already executed at S35; the D5
    "delete `src/snapping/`" item is a NO-OP shim entry retained in the
    checklist for forensic completeness)

---

## 1. Context

S45 introduces **soft-locks** — short-lived (default 30 s, auto-extended at
TTL/2) advisory locks taken by a peer when they begin editing an element.
Soft-locks are the visible side of conflict prevention; they are **not**
hard locks (the merge engine still has the last word on conflicts).  They
exist primarily to reduce edit collisions and to power the "Bob is editing
this" badge UI.

S45 D5 is the **point-of-no-return** for the Replit-PG → Supabase persistence
cutover: 14 days after S43 D9 lands, the team executes five irreversible
actions to delete the Replit-PG fallback and the legacy `project_command_log`
table.

Today (2026-04-28) Supabase is **not provisioned in the dev environment**
(`SUPABASE_URL` is unset).  S43 D9 is bound to integrations work that has
not yet landed.  Per the established "package + skeleton + ADR + bound
deferral" closure pattern (ADR-0033 §3, ADR-0034 §3), S45 closes by:

1. Shipping the full client + server + UI surface for soft-locks (no
   external dependencies; runs against in-memory store + a real Postgres
   store via `pg_advisory_xact_lock`).
2. Shipping the cutover-checklist enforcer (`scripts/spec-cutover-checklist.mjs`)
   with explicit Supabase-presence gating.
3. **Deferring the irreversible D5 actions to S43 D9 + 14-night burn-in.**

---

## 2. Decision

### 2.1 Client surface — `packages/sync-client/src/locks.ts`

- `LockManager.acquire(elementId, { ttlMs }) → Promise<LockHandle>`
  — POST `/api/locks/:id`, throws `LockConflictError` on 409 with the
  holder's display name attached.
- `LockHandle.extend()` — POST `/extend`; called automatically every TTL/2
  by an internal timer.  Throws `LockTransportError` on network failure;
  the caller may retry.
- `LockHandle.release()` — DELETE `/api/locks/:id`; idempotent (a 404
  response is treated as success because the sweeper may have got there
  first).
- `createFetchTransport(baseUrl)` — DI seam so unit tests don't need a
  live HTTP server.
- `AwarenessHeldLocksSink` — adapter that calls
  `PryzmAwareness.setHeldLocks(...)` whenever the local lock-set changes,
  driving the FROZEN awareness wire shape from ADR-0033 §2.6.

### 2.2 Server surface — `apps/sync-server/src/locks/*`

- `SoftLockStore` interface — `{acquire, extend, release, list,
  releaseAllForProject, sweepExpired, close, stats}`.
- `InMemorySoftLockStore` — Map-backed; used in tests + when no Postgres
  is configured.
- `PgSoftLockStore` — uses `pg_advisory_xact_lock(hashtext($1))` for
  race-free acquire (the SQL precedent that Postgres-backed lock managers
  in the wild use; eliminates the TOCTOU window between `SELECT` and
  `INSERT`).  Schema is **verbatim from spec lines 427-438** plus
  `holder_display_name TEXT NOT NULL` (badge UI dependency, not a spec
  deviation — spec line 451 mandates "name + color in the badge").
- `mountLocksHandlers(app, {store})` — Express handlers for the four
  endpoints (POST acquire, POST extend, DELETE release, GET list).
  Wire shape:
  - 200 on acquire success → `{ row, leaseId }`
  - 409 on conflict       → `{ holder: { userId, displayName } }`
  - 200 on extend         → `{ row }`
  - 204 on release        → empty
  - 404 on idempotent re-release → empty
  - 400 on malformed request → JSON error
- `Sweeper` — 5-second tick that calls `store.sweepExpired()`.  The
  sweeper does **not** broadcast `lock.released` over the existing
  `SessionManager.broadcast` path because that path takes a
  `LinearisedEvent` (a CDE event), and a lock-release is **not** a CDE
  event — see §2.5 for the deferred WS frame.

### 2.3 UI surface — `plugins/multiplayer/src/lock-ui.ts`

- `LockBadgeRenderer` — paints a padlock icon + holder-name pill at the
  top-right of any element that another peer holds a lock on.  Mirrors
  the `CursorRenderer` pattern from §S44 verbatim: pure Canvas2D,
  parameterised by `(viewId, localClientID)`, drives off
  `PryzmAwareness.getStates()`.
- `collectBadgeEntries(awareness, viewId, localClientID)` — pure helper
  exposed for tests + the bench harness; deduplicates by `elementId` and
  skips both clientID-self and userId-self (reconnect resilience).

### 2.4 Cutover-checklist enforcer — `scripts/spec-cutover-checklist.mjs`

Five environment-flag gates that all must read `green` before the script
will write a receipt authorising the irreversible D5 actions:

| Flag | Spec source |
|---|---|
| `PRYZM_CUTOVER_BURN_IN_14D`     | D5/L1 — 14-day Supabase burn-in |
| `PRYZM_CUTOVER_NO_P0_P1_14D`    | D5/L2 — no P0/P1 persistence bugs in 14 days |
| `PRYZM_CUTOVER_RESTORE_14D`     | D5/L3 — restore-verify green 14 nights (S46 D7 streak) |
| `PRYZM_CUTOVER_AUDIT_STORAGE`   | D5/L4 — `pnpm spec:audit-storage` green |
| `PRYZM_CUTOVER_RYW_14D`         | D5/L5 — read-your-writes consistency green 14 nights |

The script **refuses to execute** even with all flags green if
`SUPABASE_URL` is unset (Supabase cutover hasn't landed → there's nothing
to cut over from).  `--skip-supabase-check` is provided for dry-run
rehearsals.  When `--execute` is passed and all gates pass, the script
writes a dated receipt to `.local/cutover-receipts/` and prints the five
manual actions for the operator to perform by hand against the real
databases.

The script **does not itself issue** `DROP TABLE` / `DROP DATABASE` —
this is by design.  Per Replit's destructive-action policy and the
agent rules-of-engagement, irreversible storage actions must be
performed by a human operator with the receipt as their authorisation
trail.

### 2.5 Deferred: WS `lock.released` frame

Currently the only real-time channels for lock-state changes are:
1. The cold-start reconciliation path (`GET /api/locks?projectId=…`).
2. The awareness `change` event surface
   (`PryzmAwareness.setHeldLocks` → fan-out to other peers).

A sweeper-driven release is bounded above by the sweep interval (5 s) —
that is the worst-case staleness for the "Bob's lock expired, the badge
should disappear" UI.  Spec line 489 accepts a 5 s staleness window for
the sweeper-cleanup case; we defer the dedicated `notification.lockReleased`
WS frame to **S46** if usage data shows the staleness window is too long
under chaos load.  When that frame lands, it will wrap a new
`SessionManager.notify(projectId, frame)` method that does NOT take a
`LinearisedEvent` (avoiding the type-confusion that blocks the simpler
solution today).

### 2.6 Deferred: D5 irreversible actions

The five D5 actions (drop `project_command_log`, drop Replit-PG prod,
gate fallback on NODE_ENV, delete `src/snapping/`, tag commit) are bound
to **S43 D9 cutover landing + 14-night burn-in**.  The checklist
enforcer is the canonical authorisation point; it cannot be bypassed
even by re-implementing the deletions inline because the operator must
be looking at the database while running them.

`src/snapping/` was already deleted at S35 (per ADR-0015); the D5 entry
remains as a NO-OP forensic-completeness check (`-d src/snapping/` should
return non-existent → checklist line passes vacuously).

---

## 3. Consequences

**Positive**
- Soft-locks are fully functional today against the in-memory store + a
  real Postgres store; bench + sync-server can exercise them end-to-end
  without Supabase.
- Awareness wire shape from ADR-0033 §2.6 is now actually wired (heldLocks
  setter has a producer + consumer).
- D5 deletion is gated behind explicit machine-checked flags; no human
  can fat-finger a `DROP TABLE` while the burn-in is incomplete.

**Negative**
- The 5 s sweep-cleanup latency is visible to users on the badge UI
  whenever the holder peer crashes ungracefully.  Mitigation: §2.5
  defers the WS `lock.released` frame to S46.
- The PgSoftLockStore correctness depends on `hashtext()` collision
  rates; documented in the SQL file with a citation to the
  Postgres docs (collision probability ≈ 2⁻³² across project_id +
  element_id pairs; acceptable for advisory locks).

**Neutral**
- `holder_display_name` column is a denormalised copy of the user-table
  display name.  Stale display-name values are tolerable for badge UI
  (worst case: "Bob (formerly Bobby)" briefly).

---

## 4. Alternatives considered

- **Hard locks** — rejected; would require routing every CDE write
  through a lock-check, increasing write latency by ~1 RTT and
  introducing a new failure mode (lock service down → can't write).
  Soft-locks + the merge engine's existing conflict resolution is
  cheaper and consistent with PRYZM 1's behaviour.
- **No DI seam in LockManager** — rejected; would force the unit suite
  to spin up an Express server per test (adds ~80 ms/test).
- **Sweeper triggers WS notification today via `SessionManager.broadcast`**
  — rejected; the broadcast signature is `(projectId, LinearisedEvent)`
  and a lock release is not a CDE event.  Forcing it through that path
  would either pollute the LinearisedEvent type or require a parallel
  broadcast surface; neither earns its keep against the 5 s latency
  ceiling.
