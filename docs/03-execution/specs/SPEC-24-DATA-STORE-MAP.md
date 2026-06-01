# SPEC-24 — Data Store Map

| Field | Value |
|---|---|
| Status | Active — normative |
| Version | 1.0 |
| Date | 2026-04-27 |
| Owner | Architecture lead |
| Closes | `GAP-REVIEW-2026-04-27.md §11, §24.5, §29 #24` (Stripe + Supabase + Replit-PG triple-store) |
| Phases | 2D (Supabase production cutover), 3A (read-replica), 3D (data-residency dual-region) |
| Replaces / extends | none — first canonical mapping |

> One row per persisted entity. Four columns per row: **today** (Phase 1 closed) / **M18** (Phase 2B end) / **M24** (Phase 2D beta) / **M36** (GA). Plus the migration sprint that moves it. Without this map, every persistence/sync/bake/billing decision is approximate.

---

## §1 The map

Format: **entity** → today / M18 / M24 / M36 / migration sprint(s).

### §1.1 Identity & access

| Entity | Today | M18 | M24 | M36 |
|---|---|---|---|---|
| `pryzm_users` (profile, hashed pwd, plan, stripe_customer_id) | Replit PG OR Supabase | **Supabase only** | Supabase | Supabase + read-replica |
| OAuth tokens (Google, Microsoft) | Supabase `oauth_tokens` | Supabase `oauth_tokens` | Supabase `oauth_tokens` | Supabase `oauth_tokens` (encrypted at rest) |
| Sessions (JWT — stateless) | none (in cookie) | none (in cookie) | none (in cookie) | none (in cookie) |
| **SAML/SCIM** mappings | n/a | n/a | n/a | Supabase `enterprise_idp` (per `[strategic ADR-021]`) |

**Migration sprint:** S43 — Replit PG → Supabase production cutover. After S43 the fallback path remains in code (dev convenience) but production health-check fails fast if `SUPABASE_URL` missing.

### §1.2 Project + version data

| Entity | Today | M18 | M24 | M36 |
|---|---|---|---|---|
| `projects` (metadata, owner, sharing) | Supabase | Supabase | Supabase | Supabase + read-replica |
| `project_versions` (snapshots) | Supabase + R2 chunks | Supabase + R2 chunks | Supabase + R2 chunks | Supabase + R2 chunks (cross-region) |
| `events` (PRYZM event log per SPEC-02 §2) | not yet | **Supabase `events` table** | Supabase `events` (compaction-aware) | Supabase events + archive |
| `chunks/*.glb` | not yet | R2 (per project prefix) | R2 (per project prefix) | R2 (regional + cross-region replication) |
| `imports/source.ifc.zst` | not yet | R2 (per project) | R2 | R2 |
| Snapshot compaction artefacts (`__snapshot.v1`) | n/a | created at S20 | per SPEC-02 §3 | per SPEC-02 §3 |

**Migration sprint:** S20 — bake worker writes R2 chunks; S22 — `events` table introduced; S38 — older Supabase JSON snapshots fully migrated to event log + chunks.

### §1.3 Realtime / collaboration

| Entity | Today | M18 | M24 | M36 |
|---|---|---|---|---|
| `project_command_log` (24h relay) | Supabase, probabilistic 2% cleanup | replaced by Yjs, deprecated | **deleted at S45** | n/a |
| Yjs awareness | not yet | not yet | in-memory on sync-server | in-memory + Redis pub/sub for multi-instance |
| Soft locks (`LockRecord`) | not yet | not yet | Postgres `soft_locks` table | Postgres `soft_locks` |
| Cursor/presence | Socket.io ephemeral | Yjs awareness ephemeral | Yjs awareness ephemeral | Yjs awareness ephemeral |
| Sheet comments | Supabase `sheet_comments` | Supabase `sheet_comments` | Supabase `sheet_comments` | Supabase `sheet_comments` (with full-text) |

**Migration sprint:** S43 — Yjs sync server live. S45 — `project_command_log` deleted (after dual-run window confirms no rollback needed). Replace probabilistic 2% cleanup with BullMQ scheduled sweep job at S31 (Phase 2B start; Phase 2A holds no gap-closure work per 2026-04-27 directive).

### §1.4 Visibility / view state

| Entity | Today | M18 | M24 | M36 |
|---|---|---|---|---|
| `visibility_intents` | Supabase | Supabase | Supabase + Yjs-mirrored | Supabase + Yjs |
| View templates | Supabase `view_templates` | Supabase `view_templates` | Supabase `view_templates` | Supabase `view_templates` |
| Sheet sets / sheet revisions | not yet | Supabase `sheets` + `sheet_revisions` | Supabase | Supabase |

### §1.5 Type catalog & template registry

| Entity | Today | M18 | M24 | M36 |
|---|---|---|---|---|
| `template_registry` (system templates) | Supabase | Supabase | Supabase | Supabase |
| Project type catalog (per-project Wall/Door/... types) | embedded in event log | embedded in event log | embedded in event log | embedded in event log |
| Material library | not yet | `packages/material-library/` (embedded) + project-overrides in event log | same | same |

### §1.6 AI L7.5

| Entity | Today | M18 | M24 | M36 |
|---|---|---|---|---|
| AI proposals (approval queue) | none — routes call out, no queue | **Supabase `ai_proposals`** | Supabase `ai_proposals` | Supabase + R2 attachments |
| AI usage events (cost tracking per SPEC-28) | none | Supabase `ai_usage` | Supabase `ai_usage` | Supabase `ai_usage` + Honeycomb metric |
| Prompt SHA registry | none | Supabase `ai_prompts` (immutable) | Supabase | Supabase + R2 archive |

**Migration sprint:** S33 — proposal queue lit. S49 — full L7.5 architectural promotion (per Phase 3A).

### §1.7 Plugin SDK

| Entity | Today | M18 | M24 | M36 |
|---|---|---|---|---|
| Plugin manifest registry | not yet | Supabase `plugin_manifests` (first-party only) | Supabase | Supabase + R2 (3rd-party assets) |
| Plugin install state per workspace | not yet | Supabase `workspace_plugins` | Supabase | Supabase |
| Plugin execution audit log | not yet | not yet | Supabase `plugin_audit` | Supabase `plugin_audit` (SOC2 evidence) |

### §1.8 Billing

| Entity | Today | M18 | M24 | M36 |
|---|---|---|---|---|
| Subscriptions | Stripe (truth) + `pryzm_users.plan` cache | Stripe + cache | Stripe + cache | Stripe + cache + audit log |
| Stripe webhooks | Supabase `webhooks` (queue) | Supabase `webhooks` | Supabase `webhooks` | Supabase `webhooks` (with replay) |
| Invoice attachments | Stripe | Stripe | Stripe | Stripe + R2 archive |

### §1.9 Telemetry & observability (per `[strategic ADR-007]`)

| Stream | Today | M18 | M24 | M36 |
|---|---|---|---|---|
| OTel traces | not yet | Tempo (self-host) + Honeycomb (managed) | both | both |
| OTel metrics | not yet | Prometheus + Honeycomb | both | both |
| Frontend Web Vitals | not yet | OTel via web-vitals lib | OTel | OTel |
| AI cost metric | not yet | Honeycomb `pryzm.ai.cost.usd` | Honeycomb | Honeycomb |

### §1.10 SOC2 evidence (per `[strategic ADR-021]`)

| Evidence kind | Today | M18 | M24 | M36 |
|---|---|---|---|---|
| Access reviews | manual | manual | quarterly automated reports | quarterly automated reports |
| Change management | git history | git history + PR audit | git + Linear | git + Linear |
| Incident response | n/a | runbook in `docs/runbooks/` | runbook + on-call | runbook + on-call + post-mortem db |
| Vendor management | manual | manual | spreadsheet | Vanta-style integration (M36 stretch) |

---

## §2 The "today" reality (Phase 1 closed)

Stripe + Supabase + Replit Postgres is **three Postgres in flight**. Per SPEC-15 §4:
- Replit Postgres: dev/preview only after S43.
- Supabase: production truth from S43 onward.
- Stripe: subscription truth (Stripe is canonical; Postgres is cache).

Until S43, both Postgres back-ends run; the auto-fallback in `server.js` survives. **From S43, production fails fast without Supabase.**

---

## §3 Cross-cutting rules

### §3.1 Single source of truth per entity
Every row in §1 has **one** owning store. Caches (in-memory, Redis) are explicitly labelled. No "either Replit PG or Supabase" rows in production after S43.

### §3.2 Migration is forward-only
Schema migrations live under `packages/file-format/migrations/` (per SPEC-02 §4) and `infra/db/migrations/`. Both are forward-only; rollback is via PITR (Supabase) plus event-log replay.

### §3.3 PII & residency (per `[strategic ADR-021]`)
Every entity row containing PII (users, billing) is **regional-pinned** at M36. Project content + R2 chunks follow the workspace's pinned region.

### §3.4 Backup verification
Quarterly automated restore-into-staging + checksum, per ADR-013 + this SPEC. Bench `apps/bench/restore-verify.ts` runs nightly (S55+).

---

## §4 Anti-patterns this SPEC forbids

- **No new entity created in production code without a row in §1.** (Bench `pnpm spec:audit-storage` greps for table creates and asserts they appear in this map.)
- **No "either DB" code path** ships to production post-S43.
- **No service-role keys** in route handlers (per SPEC-08 §6, enforced by ESLint custom rule).
- **No PII in R2** — projects are content; users live in Postgres only.

---

## §5 Phase rollout

| Sprint | Deliverable |
|---|---|
| S31 (Phase 2B start; Phase 2A holds no gap-closure work per 2026-04-27 directive) | SPEC-24 land; `pnpm spec:audit-storage` lint introduced (warning); BullMQ scheduled sweep replaces probabilistic command-log cleanup. |
| S33 | `ai_proposals` queue table created. |
| S43 | Supabase production cutover; health-check live; auto-fallback gated by NODE_ENV. |
| S45 | `project_command_log` deleted (post Yjs verification). |
| S55 | Backup verification bench live. |
| S70 | Multi-region prep (Tier-2 cuttable per ADR-018 T2.6). |
| S72 (M36 GA) | Map fully realised; `pnpm spec:audit-storage` is error level. |

---

## §6 Cross-references
- ADR-002 sync; ADR-003 R2; ADR-005 Redis/BullMQ; ADR-013 persistence ops; ADR-018 cut list (T2.6); ADR-021 enterprise/data residency.
- SPEC-02 persistence; SPEC-03 sync; SPEC-08 security; SPEC-15 deployment topology; SPEC-27 migration & rollback; SPEC-28 AI cost model.
- Phase docs: PHASE-2D §3 cutover plan; PHASE-3D §5 SOC2 evidence.
