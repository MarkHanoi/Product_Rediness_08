# INCIDENT ANALYSIS — 2026-07-06 — Production DB-degradation cascade (create / open / save failing)

- **Status:** ACTIVE incident, root-caused. Tracked as **L-137** (systemic) + L-132/L-134/L-136 (per-symptom fixes).
- **Reporter:** founder, during an intensive same-day bug/perf session.
- **Symptom (founder words):** "all of a sudden" project **creation** ("Create & guide me"), project **opening**, and **general performance** all fail/slow.

## 1. Symptoms (all observed today, all trace to ONE cause)

| Symptom | Console evidence | Underlying op |
|---|---|---|
| Create times out | `POST /api/v1/projects` → `timeout (HTTP 0)` / `request timed out after 12000ms`; live probe **HTTP 000 @ 15s** | DB **write** (projectStore.createProject) |
| Project won't open (card greys) | `join-project denied … reason: database error during access check` | DB **read** (projectAccess ownership check) |
| Version-save fails | `/api/projects/…/versions 500`, `[ServerSyncQueue] Attempt N failed — status 500` | DB **write** (version insert) |
| Thumbnail upload fails | `/api/projects/…/thumbnail 500/502` | DB/storage write |
| Earlier: server 503 flapping | `migrations_in_progress`, root/api `000` every ~5 min | boot-migration gate on restart |
| General slowness | live probe: `GET /api/v1/projects` 401 in **7.5s** (normal ~0.3s) | DB read latency |

**Single common cause: the production Postgres/Supabase (transaction-pooler, :6543) is SATURATED/DEGRADED** — every request that touches the DB is slow (7.5s), hanging (15s HTTP 000), or erroring (500). Nothing is wrong with the founder's projects or the product logic.

## 2. Root cause — the cascade (why "all of a sudden")

The server pool is small and the DB is a shared, connection-limited Supabase pooler. Three factors compounded **over the last ~1–2 hours of this session** into a positive-feedback spiral:

**(A) Deploy churn — the primary trigger (operational, my doing).** To ship the day's fixes I pushed to `main` **~15 times**. Every push = a full Fly redeploy = a hard server restart. Each restart:
- runs boot migrations → a `migrations_in_progress` 503 window (L-132/L-134);
- opens a **new** pg `Pool({ max: 10 })` (`server/pgClient.js:87`) to Supabase;
- if the departing instance's up-to-10 connections don't drain within `kill_timeout = "10s"` (fly.toml), they **linger on Supabase's side** until Supabase times them out. ~15 restarts × up to 10 conns ⇒ **many stale/lingering client connections** against Supabase's finite pooler client-limit.

**(B) Heavy DB write load.** The founder drew many walls; each edit-burst triggers an autosave that POSTs a full compressed version (~0.8 MB) to `/api/v1/projects/:id/versions`. 20 versions/project × multiple projects (+50 projects total) = sustained DB write volume against the same small pool.

**(C) Retry amplification.** `ServerSyncQueue` retries failed saves (the `Attempt 9 failed — status 500` lines). When the DB is already saturated, **retries add MORE load** to the exhausted pool → deeper saturation. Positive feedback.

**The mechanism (why it locks up):** the pool is `max: 10`. Under a slow pooler, each query holds its slot for seconds (or hangs). The header comment at `pgClient.js:96` states it exactly: *"a single hung query holds a pool slot (max:10) indefinitely; under load …"*. Once all 10 slots are held by slow/hung queries, **every new create/open/save queues and times out** at `connectionTimeoutMillis: 10000` → the `HTTP 000 @ 15s` we measure. Access-check reads then error → `projectAccess.js` **fails closed** → opens denied.

**Since when:** the early session (few deploys, light load) was healthy. Degradation began as the **deploy count climbed** (first the 503 flapping, then pooler saturation) and **large-project saves accumulated**, escalating over the last hour to full create/open timeouts. **It is NOT a product-code regression** — no server DB/pool/migration code changed this session; the triggers are operational (deploy frequency + save/retry load) hitting pre-existing capacity/resilience limits.

## 3. Code gaps that turn a transient DB blip into a hard failure

1. **`projectAccess.js:57-61` fails CLOSED on a Supabase error** → a transient DB hiccup reads as "not owner" → open permanently denied (no retry). The PG path (`:91-94`) falls through but Supabase does not; neither returns a *retryable* signal. → **L-136**.
2. **No client retry on the retryable state for create/open** beyond transport timeout (L-134 covers `migrations_in_progress`; a degraded-DB 500/timeout on open isn't retried gracefully into a "retry" affordance for the OPEN path).
3. **`ServerSyncQueue` retry storm** — retries a saturated DB without a circuit-breaker/backoff cap, amplifying load.
4. **Pool `max:10` + `kill_timeout 10s`** — small pool with no explicit drain-on-shutdown ⇒ restart churn can leak connections; a few hung queries exhaust the pool.
5. **Autosave writes to the SERVER on every edit-burst** — with IndexedDB now the primary store (L-131 P4), the server-sync could be far less aggressive/coalesced to relieve DB write pressure.

## 4. Plan (mapped to contracts; SAFE code vs INFRA)

**Immediate (stop the spiral) — no code:**
- STOP the deploy churn (done — holding all pushes). Let Supabase drop the lingering idle connections; the pooler recovers as slots free. Pause heavy save/testing for a few minutes so the pool drains.

**Code resilience (SAFE, ship in the next single batch):**
- **P-A (L-136):** `projectAccess.js` — Supabase error FALLS THROUGH to PG/in-memory (match PG path); if all sources unverifiable due to DB error, return `{allowed:false, retryable:true}` → join/HTTP returns **503 retryable** via `server/errors.js` (OI-060), never a permanent deny. **Preserve the security contract — never fail OPEN.** Client retries the OPEN path + shows "couldn't open — retry."
- **P-B (L-137):** `ServerSyncQueue` — cap retries + exponential backoff + **circuit-breaker** (stop hammering a DB returning 5xx; resume on health) so retries never amplify a saturation.
- **P-C (L-137):** pg pool hygiene — drain/close the pool on SIGTERM/SIGINT before exit (and align `kill_timeout` to allow it) so a restart doesn't leak Supabase connections. Consider `max` sizing vs Supabase's pooler client-limit.
- **P-D (L-137):** reduce server autosave-write frequency/coalescing now that IndexedDB is the primary store (P4) — fewer DB writes per edit-burst.

**Infra (founder sign-off, deploy/ops):**
- Supabase pooler capacity/tier (client-connection limit) vs the app's pool `max` and concurrency; direct (:5432) vs tx-pooler (:6543) trade-offs.
- **Zero-downtime deploy (L-133)** so restarts stop churning connections + boot windows.
- Batch deploys (orchestrator discipline) — do NOT push per-fix during founder testing.

## 5. Prevention (process)

- **Batch pushes.** One deploy per work-batch, not per-fix — every deploy is a server restart + connection churn + boot-migration window.
- Zero-downtime rollout (L-133) removes the restart outage entirely.
- The resilience fixes above make any future transient DB blip a graceful "retry," not a hard create/open failure.

---
_Linked: L-132 (create timeout+retry, shipped), L-134 (retry migrations 503, committed), L-136 (access-check fail-closed), L-133 (zero-downtime deploy), L-131 P4 (IndexedDB-primary version store)._
