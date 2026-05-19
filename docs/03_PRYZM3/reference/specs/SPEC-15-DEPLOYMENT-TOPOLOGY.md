# SPEC-15 — Deployment Topology (Replit + External Cloud)

| Field | Value |
|---|---|
| Status | Active — normative |
| Version | 1.0 |
| Date | 2026-04-27 |
| Owner | Architecture lead |
| Closes | `GAP-REVIEW-2026-04-27.md §6.2, §13.1, §28, §29 #10` |
| Phases | 2D (sync server), 3C (public APIs), 3D (GA hardening) |
| Replaces / extends | none — first canonical deployment doc |

> This SPEC defines exactly **where every PRYZM 2 process runs, how they talk, what guarantees Replit gives us, and where the corpus's R2/MinIO/BullMQ/Yjs choices land in actual deployment units**. Without this, no `apps/*` server can be designed correctly.

---

## §1 Deployment surfaces

PRYZM 2 ships across **three deployment surfaces**:

| Surface | Owner | Primary use | Exposure |
|---|---|---|---|
| **Replit Hosted** | Replit (us) | Replit-hosted SaaS for individual + small-team customers | `pryzm.replit.app` + custom domains |
| **PRYZM Cloud (managed)** | PRYZM Inc | Managed multi-tenant cloud (Enterprise) | `app.pryzm.com`, `api.pryzm.com` |
| **Self-host** | Customer | On-premise / customer cloud | `docker-compose up` |

Phase 2D ships Replit Hosted only. Phase 3C/3D ships PRYZM Cloud + self-host. The architecture is identical across all three; only the ops differ.

---

## §2 Replit-Hosted topology (Phase 2D → GA)

### §2.1 Six processes

| Process | Replit deployment kind | Reason |
|---|---|---|
| `apps/editor` (web) | **Static / Autoscale** | SPA + Vite assets; CDN-friendly |
| `apps/sync-server` | **Reserved VM** | persistent Yjs WebSocket connections require sticky long-lived processes |
| `apps/bake-worker` | **Autoscale** | stateless BullMQ job consumer; horizontally scalable |
| `apps/ai-worker` | **Autoscale** | stateless; Anthropic / Cloudflare Worker relay |
| `apps/api-gateway` | **Autoscale** | stateless REST gateway in front of the others |
| `apps/billing-webhook` | **Reserved VM** | Stripe webhook signature verification; isolation from main API |

### §2.2 Why Reserved VM for sync-server

Yjs awareness + Socket.io / WS sessions are **stateful by definition**. Autoscale spins up new instances on traffic; persistent WS connections break or fan-out poorly across instances unless we add a Redis-backed pub/sub broker. We avoid that complexity at v1 by pinning sync-server to a Reserved VM.

If concurrency > Reserved VM single-instance ceiling (~2,000 concurrent WS per VM under our load shape), we add a second Reserved VM with an in-front load-balancer that does **sticky-session** routing by `projectId` hash. Documented as `SPEC-15 §2.2.1` follow-up at S60.

### §2.3 Why Autoscale for bake-worker / ai-worker / api-gateway

Stateless consumers. BullMQ already provides job-level reliability (Redis as the queue). Autoscale freely.

### §2.4 Networking

- All processes share a **Replit private network** (`replit.private` DNS).
- External traffic enters via `pryzm.replit.app` → load balancer → `apps/api-gateway` and `apps/editor`.
- `apps/sync-server` has its own subdomain `sync.pryzm.replit.app` (WS tunneling).
- `apps/billing-webhook` has its own subdomain `billing.pryzm.replit.app` for Stripe webhook isolation.

---

## §3 External services (the four boundaries)

### §3.1 Postgres

| Surface | Provider | Notes |
|---|---|---|
| Replit Hosted (dev / preview) | Replit Postgres | development & preview environments |
| Replit Hosted (production) | **Supabase** | PITR, replication, mature backup story |
| PRYZM Cloud | Supabase Enterprise (regional) | EU-West + US-East per `SPEC-08` |
| Self-host | Customer Postgres ≥ 14 | per `[strategic ADR-012]` |

**Migration path Replit Postgres → Supabase**: at production cutover, run `pnpm migrate-pg` (one-shot dump → restore). Documented in SPEC-27.

### §3.2 Object storage

| Surface | Provider | Notes |
|---|---|---|
| Replit Hosted | **Cloudflare R2** | per `[strategic ADR-003]`; cheapest egress |
| PRYZM Cloud | Cloudflare R2 (regional buckets) | per-tenant prefix; lifecycle policies |
| Self-host | MinIO (bundled in compose) | per `[strategic ADR-012]` |

R2 is **never accessed directly from the browser**. Signed URLs are issued by `apps/api-gateway` (read) and `apps/bake-worker` (write).

### §3.3 Redis (BullMQ)

| Surface | Provider | Notes |
|---|---|---|
| Replit Hosted | **Upstash Redis** | TLS, per-tenant DB |
| PRYZM Cloud | Upstash or Redis Cloud | regional |
| Self-host | Bundled Redis 7 | per ADR-012 |

Redis is the queue for BullMQ (`[strategic ADR-005]`). Not used as a session store. Not used as a cache (we have scene-cache packages).

### §3.4 Anthropic / OpenAI

- All AI calls route through `apps/ai-worker`.
- `apps/ai-worker` calls Anthropic directly OR via `CF_WORKER_URL` (Cloudflare Worker relay) to hide keys.
- API keys live in Replit Secrets. Never in repo. Never in `replit.md`.

---

## §4 The "three Postgres in flight" problem (closes §13.1)

Today (Phase 1 implemented):
- Stripe holds subscription truth.
- Supabase OR Replit Postgres holds project + version data.
- Some Replit envs only have Replit PG configured; Supabase is fallback-not-primary.

**SPEC-15 ratifies**: from S43 onward, **production = Supabase only**. Replit Postgres is dev/preview only. The auto-fallback in `server.js` is preserved for dev convenience but is **forbidden in production deploys**:

- A startup health check in `apps/api-gateway` fails fast if `process.env.NODE_ENV === 'production' && !SUPABASE_URL`.
- Documented in SPEC-27 §3 (migration), SPEC-15 §6 (env requirements).

---

## §5 Authentication (closes §29 #21)

The four auth paths (custom JWT / Google OAuth / Microsoft OAuth / future SAML+SCIM) all funnel into a single **`apps/api-gateway` AuthService**. The gateway is the only process that:
- Verifies tokens.
- Issues session cookies.
- Bridges OAuth → custom JWT (cross-implementation security audit lives here).

`apps/sync-server` and `apps/bake-worker` accept only **gateway-issued JWTs**, never OAuth-direct.

This satisfies the SPEC-08 §6 demand for service-role-key removal: server-internal RPC uses gateway-issued service tokens (short-lived, signed by `SESSION_SECRET`), not Supabase service-role keys.

---

## §6 Required environment variables (production)

| Variable | Required | Purpose |
|---|---|---|
| `NODE_ENV` | yes | gates the Supabase health check |
| `SUPABASE_URL` | yes (prod) | Postgres |
| `SUPABASE_ANON_KEY` | yes | client SDK |
| `SUPABASE_DB_URL` | yes | server-side connection (rotate quarterly) |
| `R2_ACCOUNT_ID` | yes | object storage |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | yes | signed URLs |
| `UPSTASH_REDIS_URL` | yes | BullMQ |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | yes | billing |
| `SESSION_SECRET` | yes | JWT signing (rotate annually with rolling key versioning) |
| `ANTHROPIC_API_KEY` or `CF_WORKER_URL` | yes | AI routes |
| `OAUTH_GOOGLE_*` / `OAUTH_MICROSOFT_*` | optional | OAuth |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | yes | observability (per `[strategic ADR-007]`) |
| `HONEYCOMB_API_KEY` | optional | dual-export |

The full list is canonicalised in `apps/api-gateway/src/config/env.ts` with Zod validation; missing required vars fail boot.

---

## §7 Self-host topology (Phase 3D)

A single `docker-compose.yml` deploys:

```yaml
services:
  pryzm-editor:        # Vite SSR + static
  pryzm-api-gateway:   # Node 20
  pryzm-sync-server:   # Node 20 + WS
  pryzm-bake-worker:   # Node 20 + BullMQ
  pryzm-ai-worker:     # Node 20 (BYO API keys)
  pryzm-billing-webhook: # Node 20 (skipped for self-host)
  pryzm-postgres:      # Postgres 14
  pryzm-redis:         # Redis 7
  pryzm-minio:         # MinIO (S3-compatible)
```

Per `[strategic ADR-012]` minimums. Single-binary self-host is **post-GA** (per ADR-018 cut list).

---

## §8 Performance + scale targets (binding)

| Surface | Target | Measurement |
|---|---|---|
| `apps/api-gateway` | p95 < 100 ms for non-list reads | OTel histogram |
| `apps/sync-server` | 50 concurrent users / project, < 250 ms broadcast lag p95 | per `[strategic ADR-019]` & SPEC-03 |
| `apps/bake-worker` | bake job p95 < 30 s for medium project | SPEC-02 §6 |
| `apps/ai-worker` | p95 < 5 s for `/api/ai/voice/parse`, p95 < 30 s for room programme | SPEC-07 §4 |
| `apps/editor` cold load | TTFP < 800 ms (small project) | SPEC-12 §8 |

---

## §9 Capacity-cut interactions (per ADR-018)

If velocity slips and ADR-018 Tier-2 fires, this SPEC adjusts:
- T2.6 (single-region residency) → drop EU-West Reserved VM; PRYZM Cloud is single-region.
- T2.5 (online-install only) → drop air-gap support from compose; pull from registry only.

---

## §10 Phase rollout

| Sprint | Deliverable |
|---|---|
| S31 (Phase 2B start; Phase 2A holds no gap-closure work per 2026-04-27 directive) | SPEC-15 land; `apps/api-gateway` skeleton; env-var Zod schema. |
| S38 | `apps/sync-server` skeleton (Reserved VM provisioned, WS endpoint stubbed). |
| S43 (Phase 2D start) | Sync server Yjs running on Reserved VM; Upstash Redis live; Supabase production cutover. |
| S55 (Phase 3B) | OBC removed → bake-worker bundle smaller → autoscale ceiling raised. |
| S65 (Phase 3C) | Public API `api.pryzm.com` lights up via api-gateway. |
| S70 (Phase 3D) | Self-host docker-compose published. |
| S72 (M36 GA) | All targets §8 green; SOC2 evidence runs collected. |

---

## §11 Cross-references
- ADR-002 sync architecture; ADR-003 R2; ADR-005 BullMQ; ADR-007 OTel; ADR-012 self-host minimums; ADR-018 cut list; ADR-021 enterprise security; ADR-022 backend runtime topology (this SPEC's compendium ADR).
- SPEC-02 persistence; SPEC-03 sync; SPEC-08 security; SPEC-12 bundle; SPEC-24 data store map; SPEC-27 migration & rollback.
- Phase docs: PHASE-2D §6 deployment cutover; PHASE-3C §4 public API; PHASE-3D §3 self-host.
