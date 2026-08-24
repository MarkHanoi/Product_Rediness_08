# C66 — Concurrency & Scale

> **Stamp**: 2026-08-09 · **Status**: CANONICAL
> **Scope**: How many users PRYZM serves at once, what each instance may hold, and what must be true before a second instance exists. Server-side concurrency, horizontal-scale readiness, per-process state, and the degradation policy.
> **Key principle**: A capacity number that has not been measured is a **claim**, not a contract term.
> **References**: C10 (per-user latency NFTs — this contract is the orthogonal axis), C05 (persistence), C08 (collaboration & security), C49 (multi-region), C48 (backup/DR).
> **Origin**: `docs/03-execution/analysis/production-readiness-1000-users-2026-08-09.md`; L-770, L-336, L-391, L-786…L-803.
> **Changelog**: 2026-08-09 — created. The audit could not find a stated concurrency target anywhere in the repository; the only record of this system's capacity was a comment in `fly.toml`. That absence is why L-770 could sit at "acceptable for a closed beta" without anyone having to say how big the beta was.

---

## §0 — Why this contract exists

C10 answers *"how fast is PRYZM for one user?"* — 19 measured NFTs, all client-side. **Nothing answered *"how many users at once?"***

The consequence was not theoretical. `fly.toml:105` says *"Tuned for ~50 concurrent live editors"*; that comment was the single most load-bearing capacity statement in the codebase, and it is a comment. Meanwhile L-770 carried the disposition *"acceptable for a closed beta"* — defensible, and unfalsifiable while no document said what size beta was being accepted.

This contract makes the number a term.

---

## §1 — Stated targets

A tier is **HELD** only when a k6 run at that VU count passes the §6 thresholds, against a target of the same shape as production, recorded in `docs/03-execution/analysis/`. Otherwise it is **CLAIMED**.

| Tier | Concurrent users | Document assumption | Status | Evidence |
|---|---|---|---|---|
| **Closed beta** | 50 | ≤ 800 elements | **CLAIMED** | none — `fly.toml:105` is a comment (L-770) |
| **GA** | 300 | ≤ 2,000 elements | **not attempted** | blocked on §3 |
| **Scale** | 1,000 | ≤ 10,000 elements | **not attempted** | blocked on §3 + delta persistence (L-786) |

> **§1.1 — MUST.** No tier may be described as supported — in marketing, in a plan tier (C39), in a customer commitment, or in an ISSUE-LOG disposition — while its status is CLAIMED. "We think it holds" and "we measured it" are different statements and MUST NOT be written the same way. This is §CONTEXT-DATA-HONESTY applied to capacity.

> **§1.2 — MUST.** Every tier row carries a document-size assumption, because per-user cost is dominated by document size, not by user count (§2.3). A user count alone is meaningless.

> **§1.3 — the CLIENT-side cost of those document-size assumptions is now MEASURED, and it is the
> half that fails first** (added 2026-08-24, lane STARTUP27, L-10440, ADR-0368).
>
> §1.2 is right that document size dominates — but every tier row's element budget had only ever
> been reasoned about as a *server* cost. **MEASURED** on the real wall-open path
> (`refreshV2Cache` → `WallJoinResolver.resolveLevel` → `buildWall`;
> `packages/geometry-wall/__tests__/STARTUP27ProjectOpenScale.measure.test.ts`):
>
> | walls | wall-half of project open | per-wall |
> |---|---|---|
> | 200 | 1.5 s | 7.7 ms |
> | 3 960 | 13.4 s | 3.4 ms |
> | 20 240 | **98.6 s** | 4.9 ms |
>
> ⛔ **That figure EXCLUDES GPU upload, shader compile and first paint — it is a floor, not the
> user's wait**, and it is walls only, not the whole element census a tier row counts.
>
> **Consequences for the table above.** The **Scale** row's *"≤ 10,000 elements"* sits inside the
> superlinear region: junction resolve is *sub*linear to ~220 walls/level and **superlinear beyond**
> (4.6× the walls for 11× the time). The **GA** row's *"≤ 2,000 elements"* crosses
> `LevelScoped3DCullingService`'s ≥4000-element massing-LOD escalation once doors, windows and slabs
> are counted alongside walls.
>
> **MUST.** A tier's element budget MUST NOT be raised on server evidence alone. The client-side
> open cost is measured by the harness above and MUST be re-read when a budget moves — a tier whose
> server can serve 10,000 elements and whose client takes ninety seconds to open them is not HELD.

---

## §2 — Per-instance limits

### §2.1 — Current envelope

| Resource | Value | Source |
|---|---|---|
| vCPU | 1 (shared) | `fly.toml [[vm]]` |
| Memory | 512 MB | `fly.toml [[vm]]` |
| Instances | 1 (`min_machines_running = 1`, no autoscale policy) | `fly.toml [http_service]` |
| PG pool | 25 (`PG_POOL_MAX`) | `pgClient.js` — was 10 until L-787 |
| Request concurrency | soft 200 / hard 250 | `fly.toml [http_service.concurrency]` |
| Max request body | 50 MB | `server.js:438` |
| Socket.io buffer | 1 MB | `server.js` `maxHttpBufferSize` |

### §2.2 — The arithmetic that binds them

- **Pool.** `PG_POOL_MAX × instanceCount` MUST stay below the Supabase tier's client-connection limit. Exceeding it reproduces the 2026-07-06 saturation cascade (L-137) from the other side — the pool is not a free dial.
- **Memory.** `maxBodyBytes × concurrentWrites` MUST stay below instance memory. At 50 MB and 512 MB, **ten concurrent saves exceed total RAM before Postgres is reached.** This is the most direct OOM path in the system and it is a product of two independently-reasonable numbers.
- **CPU.** Node is single-threaded. One vCPU serves all TLS, JSON parsing, Socket.io fan-out and DB marshalling; there is no `cluster` and no `worker_threads` in `server.js`.

> **§2.3 — MUST.** Any change to `PG_POOL_MAX`, `maxHttpBufferSize`, the body limit, or the VM size MUST restate the §2.2 arithmetic in its commit message. These four numbers are coupled and have never been reasoned about together.

---

## §3 — The statelessness invariant

> **§3.1 — MUST NOT.** A second instance MUST NOT be started until every entry in §3.3 category **A** is moved to shared storage. Scaling out before then is a **correctness regression, not a capacity gain** — Socket.io rooms partition silently, and users in the same project stop seeing each other with no error raised anywhere (L-770).

> **§3.2 — MUST.** New module-level mutable state in `server/` is a contract violation unless it is a pure per-instance cache (category B) whose staleness is harmless and stated at the declaration.

### §3.3 — Per-process state inventory

Measured 2026-08-09. **This is the checklist for the Redis work; it is not a summary.**

**Category A — correctness-critical. Wrong at N > 1.**

| State | File | What breaks at N > 1 |
|---|---|---|
| Socket.io rooms | `server.js` (no adapter) | Room partitions; peers stop seeing each other **silently** |
| `_tokens` | `exportGuard.js:32` | ⚠ **Single-use 60 s export token issued by instance A cannot be redeemed on B — exports fail (N−1)/N of the time.** Found writing this contract; not in the original audit |
| rate-limit store | `rateLimiter.js` (MemoryStore) | Effective limit multiplies by N — the protection silently weakens as you scale (L-790) |
| `_inMemoryProjects` | `projectStore.js:44` | Divergent project views per instance (L-789 gated the write path; the map remains) |
| `_members` | `projectMembers.js:21` | Divergent membership — becomes load-bearing once L-336 lands |
| `_userPlans` / `_loadedSet` | `planStore.js:45,49` | Plan/quota decisions differ per instance (C39) |
| `_pending` | `pendingInvites.js:41` | An invite created on A is invisible on B |
| `_memoryRows` / `_memorySeq` | `manualAdminZoneStore.js:63,64` | Divergent rows **and a per-process sequence counter — id collisions across instances** |
| `store` | `familyMarketplaceRoutes.js:46` | Divergent marketplace state |
| `_userEmailCache` | `server.js` | Benign staleness, but unbounded (§4.2) |
| `_migrationsReady` / `_migrationsSettled` | `pgClient.js` | Each instance has its own view; concurrent boot migrations are guarded by a PG advisory lock (§B9), so this is **degraded, not broken** |

**Category B — per-instance caches. N copies = N× cold misses, never incorrect.**
~15 jurisdiction proxy `_cache` Maps (`parcelZoningProxy`, `overpassProxy`, `murciaPgouProxy`, `parisPluProxy`, …) plus their `_hits`/`_misses` counters. **Acceptable as-is.** Only the memory ceiling matters (§4.2).

**Category C — throttle windows. Rate multiplies by N.**

| State | File | Effect at N > 1 |
|---|---|---|
| `_windowStart` / `_accepted` / `_dropped` | `leads.js:33-35` | 60/min cap becomes 60N/min — spam control degrades linearly |
| `_windowStart` / `_sent` / `_suppressed` | `accessAttemptNotifier.js:55-57` | N× alert volume on the same event |
| `_windowStart` / `_logged` / `_dropped` | `cspReport.js:44-46` | N× CSP report log volume |

> **§3.4 — SHOULD.** Category C moves to the shared store with category A. A throttle that silently weakens as you scale is the same defect class as §3.1's rate limiter, just less visible.

---

## §4 — Source of truth

> **§4.1 — MUST.** Exactly one owner per datum. Where two mechanisms maintain the same value, one is authoritative and the others are caches that MUST be derivable from it.

| Datum | Authoritative owner | Status |
|---|---|---|
| Element geometry + properties | `ElementStore` (client) | ✅ |
| Level assignment | `LevelStore` | ✅ |
| Selection | `SelectionStore` | ✅ |
| Visibility intent | `packages/visibility` | ✅ (P7) |
| Camera | `CameraPositionService` | ⚠ also held by OBC `camera.controls`, unreconciled (L-802a) |
| Undo history | `RingBufferUndoStack` | ❌ split three ways, reconciled by `Date.now()` (L-793) |
| Persisted document | `project_versions.snapshot` (latest row) | ⚠ becomes patch-stream + compaction under L-786 |
| Project membership | `project_members` | ❌ **never read by the access gate** (L-336) |
| Plan / entitlement | `user_plans` | ⚠ shadowed by `planStore._userPlans` |
| `projects.version_count` | the `project_versions` row count | ❌ maintained three different ways (L-802e) |

> **§4.2 — MUST.** Every server-side cache has a bound: a max entry count, a TTL, or both. `_inMemoryProjects` and `_userEmailCache` currently have neither and grow for the life of the process on a 512 MB box.

---

## §5 — Degradation policy

> **§5.1 — MUST.** When durable storage is unavailable, the server **refuses honestly**. A failed durable write MUST NOT be reported as a success. A refusal and a success MUST NOT carry the same value.

> **§5.2 — MUST NOT.** No production code path may silently substitute volatile storage for durable storage. This is the L-789 defect, fixed in `97ad9f77`: `§SERVER-PG-DEGRADE` completed failed creates and deletes against an in-memory map and returned 201/200, so a transient pooler blip produced a project that appeared in the hub and evaporated on the next deploy. The delete path was worse — on a foreign-key violation the PG row survived and the "deleted" project reappeared.

> **§5.3 — MAY.** A volatile fallback is permitted **outside production**, gated on `NODE_ENV !== 'production'`, read **per call** (never captured at module load, or the gate depends on import order relative to whatever sets `NODE_ENV`). It MUST log that the data is volatile.

> **§5.4 — MUST.** A refusal propagates its underlying error class or SQL state to the HTTP boundary unwrapped, so the existing classifiers (`classifyV1Error`, `handleProjectApiError`) can map it: transient connection loss → retryable 503, FK violation → 410/422, missing relation → `schema_not_applied`. Wrapping it in a store-specific error destroys that mapping and forces every caller to re-derive it.

> **§5.5 — Note for operators.** Enforcing §5.1 makes previously-silent failures **visible**. Error rates will appear to rise on the deploy that lands it. They are not rising. Say so before the deploy, not after.

---

## §6 — Load-test contract

> **§6.1 — MUST.** `tools/load-test/pryzm-load.js` is the artefact that moves a §1 tier from CLAIMED to HELD. Its thresholds encode this contract's claims; a failing threshold is a confirmed finding, and a **passing** one falsifies an estimate and MUST be written back into the relevant ISSUE-LOG row rather than ignored.

> **§6.2 — MUST.** Scenarios run **concurrently** in a stated activity mix, not one endpoint at a time. The bottleneck is contention between the hub query, the snapshot read, the WebSocket fan-out and the autosave write for one pool and one CPU; a serial test measures endpoints and misses the interaction.

> **§6.3 — MUST.** The harness exercises **WebSockets**, not only HTTP. The load-bearing bottleneck is Socket.io fan-out; an HTTP-only harness returns a reassuring green while missing what breaks.

> **§6.4 — MUST NOT.** `STAGE=target` MUST NOT be run against production while §2.1 shows one instance with `min_machines_running = 1`. 1,000 VUs against one 512 MB machine is a real outage for real users. **A staging app is a prerequisite** — `fly.staging.toml` is described at `fly.toml:18-19` and does not exist (L-770).

> **§6.5 — MUST.** Every run is recorded in `docs/03-execution/analysis/` with stage, commit SHA and the raw summary. An unrecorded run is an anecdote.

---

## §7 — Open blockers against §1

Nothing may claim the **Scale** tier while any of these is open.

| Blocker | Why it is structural |
|---|---|
| **L-770** — one instance, no Socket.io adapter | Scale-out is currently a correctness regression, not a capacity gain (§3.1) |
| **L-786** — whole-document JSONB snapshots | Save cost is O(document), not O(change); ~16.6 MB per save per user at 793 elements |
| **L-336** — access gate is owner-only | Multi-user collaboration does not function; `project_members` is never read (§4) |
| **L-391** — CRDT sync-server undeployed | Production collab is last-writer-wins full-snapshot |
| **L-792** — row lock spans a multi-MB insert | Co-editors serialise, then one is rejected with 412 and their work is stranded |
| **L-442** — ~100 TS packages transpiled at boot | Boot time is scale-out latency; autoscale takes minutes, not seconds |
| **exportGuard tokens** (§3.3) | Exports break (N−1)/N of the time at N instances |
