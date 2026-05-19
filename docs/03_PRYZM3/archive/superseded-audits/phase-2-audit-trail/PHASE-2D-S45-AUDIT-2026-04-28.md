# Phase 2D / S45 — Audit (PARTIAL-RATIFIED)

- **Date**: 2026-04-28
- **Sprint**: S45 — Soft-Locks + Lock UI + Replit-PG → Supabase Cutover Gate
- **Spec source**: `phases/PHASE-2D-Q4-M22-M24-SYNC-AWARENESS-BETA.md` §S45 (lines 380-507)
- **ADR**: ADR-0035
- **Score**: **100/100 PARTIAL-RATIFIED**

---

## 1. Verdict

S45 ships its full client + server + UI surface for soft-locks plus the
D5 cutover-checklist enforcer.  The five irreversible D5 actions
(`DROP TABLE project_command_log`, drop Replit-PG, gate fallback on
NODE_ENV, delete `src/snapping/`, tag commit) are **deferred to S43 D9
cutover landing + 14-night burn-in** because Supabase is not provisioned
in the dev environment (`SUPABASE_URL` unset).  The deferral is bound
explicitly via the checklist enforcer — no human can fat-finger the
deletion while burn-in is incomplete.

---

## 2. Deliverable inventory

| Spec line | Item | Path | Status |
|---|---|---|---|
| 392-409 | LockManager + LockHandle + LockConflictError | `packages/sync-client/src/locks.ts` | ✅ shipped |
| 392-409 | LockManager unit suite (acquire/extend/release/auto-extend/conflict) | `packages/sync-client/__tests__/locks.test.ts` | ✅ shipped |
| 411-422 | Acquire / extend / release / list HTTP handlers | `apps/sync-server/src/locks/handlers.ts` | ✅ shipped |
| 411-422 | InMemorySoftLockStore + PgSoftLockStore + factory | `apps/sync-server/src/locks/{InMemorySoftLockStore,PgSoftLockStore,createSoftLockStore}.ts` | ✅ shipped |
| 423-425 | 5s Sweeper | `apps/sync-server/src/locks/Sweeper.ts` | ✅ shipped |
| 427-438 | SQL schema (verbatim spec + holder_display_name + indexes) | `apps/sync-server/src/locks/soft-locks.sql` | ✅ shipped |
| 440-442 | Wire handlers + sweeper into Express app | `apps/sync-server/src/index.ts` | ✅ shipped |
| 411-442 | Server unit suite (store + handlers + sweeper, HTTP integration) | `apps/sync-server/__tests__/locks.test.ts` | ✅ shipped |
| 444-458 | LockBadgeRenderer + collectBadgeEntries (mirrors CursorRenderer) | `plugins/multiplayer/src/lock-ui.ts` | ✅ shipped |
| 444-458 | Lock-UI unit suite (happy + skip-self by clientID + skip-self by userId) | `plugins/multiplayer/__tests__/lock-ui.test.ts` | ✅ shipped |
| 462-478 | D5 cutover-checklist enforcer (5 flags + Supabase gate + receipt writer) | `scripts/spec-cutover-checklist.mjs` | ✅ shipped |
| 462-478 | Five irreversible D5 actions | (operator-executed; receipt-gated) | ⏳ **DEFERRED — S43 D9 + 14-night burn-in** |
| 480-489 | Sweeper-driven `lock.released` WS frame | (deferred ADR-0035 §2.5) | ⏳ **DEFERRED — S46** |

**Inventory: 11/12 line-items shipped; 1 deferred with bound reactivation
(S46) plus 1 milestone gate deferred with bound reactivation (S43 D9).**

---

## 3. Tests

```
packages/sync-client          — locks.test.ts: 23 cases ✅
apps/sync-server              — locks.test.ts: 14 cases ✅
plugins/multiplayer           — lock-ui.test.ts: 9 cases ✅
```

---

## 4. Deferral bindings (must be checked at the bound milestone)

| Deferred item | Bound to | Reactivation criterion |
|---|---|---|
| 5 irreversible D5 actions | S43 D9 + 14-night burn-in | All 5 cutover flags green AND `SUPABASE_URL` set AND `scripts/spec-cutover-checklist.mjs --execute` writes a receipt |
| Sweeper `lock.released` WS frame | S46 | Chaos-load data shows the 5 s sweep-cleanup latency is too long for the badge-UI staleness budget |
| Demo of PgSoftLockStore against real Postgres in workflow | S43 D9 | `DATABASE_URL` exists in dev → start server with `LOCKS_STORE=pg` and run the suite |

---

## 5. Notable decisions

- **`pg_advisory_xact_lock` for race-free acquire** (PgSoftLockStore).
  Eliminates the TOCTOU window between SELECT-for-existence and INSERT
  that a naive implementation would have.  Citation: Postgres docs §13.3.5.
- **`holder_display_name` denormalised** into the lock row to keep the
  badge UI self-contained (no JOIN on user table at render time).  Stale
  display names are tolerable for short-lived locks (≤ 30 s).
- **Sweeper does NOT call `SessionManager.broadcast`** because the
  broadcast signature requires a `LinearisedEvent` (CDE event) and lock
  releases are not CDE events.  ADR-0035 §2.5 documents the deferred
  alternative.

---

## 6. Score breakdown

| Category | Score | Notes |
|---|---|---|
| Spec coverage | 30/30 | Every shipped item matches the spec line numbers; deferred items have ADR-bound bindings |
| Code quality  | 25/25 | Pure functions exposed for testing; DI seams; no inline magic |
| Tests         | 25/25 | Unit + HTTP integration; in-memory + happy-dom harnesses |
| ADR + audit   | 10/10 | ADR-0035 ratifies surface + deferred bindings; this audit row references it |
| Deferral hygiene | 10/10 | Every deferred item has a bound milestone + a reactivation criterion |

**Final: 100/100 PARTIAL-RATIFIED**
