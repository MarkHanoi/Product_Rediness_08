# ADR-012 — Self-Host Minimum Requirements

| Field | Value |
|---|---|
| Status | **Accepted** — 2026-04-27 |
| Closes | `05-IMPLEMENTATION-PLAN.md §17` row ADR-012 |
| Required by | Sprint S70 (Phase 3D — D7 self-host bundle ships) |
| Owner | Architecture lead |
| Implementation | `apps/self-host/` (docker-compose stack); `apps/self-host-helm/` (Helm chart, post-GA). |
| Spec dependency | `SPEC-08-SECURITY-COLLAB.md` §8.3 |

---

## Context

D7 (enterprise self-host) is a v1 differentiator. Customers in regulated industries (defense contractors, government clients, EU GDPR-strict tenants) require the entire PRYZM stack runnable in their own VPC without phoning home to PRYZM-managed services.

`05-IMPLEMENTATION-PLAN.md §17` proposed "Docker Compose for SMB; Helm chart for enterprise." `10-MASTER-IMPLEMENTATION-PLAN-36M.md` row ADR-012 sharpened this to "`docker-compose up` deploys editor + sync-server + bake-worker + Postgres + R2-compatible (MinIO bundled). Single-binary later." This ADR ratifies that as v1; Helm and single-binary are post-v1.

---

## Decision

**v1 ships a single `docker-compose.yml` that brings the full stack up on one host with `docker compose up -d`. Helm chart and single-binary are post-GA additions.**

### Bundled stack (v1, M36 GA)

```
              ┌───────────────────────────┐
              │  Caddy (TLS termination)  │
              └───────────────────────────┘
                        │
       ┌────────────────┼────────────────┐
       ▼                ▼                ▼
 ┌─────────┐     ┌────────────┐    ┌───────────┐
 │ editor  │     │ sync-server│    │ ai-worker │
 │ (static)│     │ (Node WS)  │    │ (Node)    │
 └─────────┘     └────────────┘    └───────────┘
                        │                │
                        ▼                │
                ┌────────────┐           │
                │ Postgres 16│           │
                └────────────┘           │
                        │                │
                ┌────────────┐           │
                │ Redis 7    │◄──────────┤
                │ (BullMQ)   │           │
                └────────────┘           │
                        ▲                │
                ┌────────────┐           │
                │ bake-worker│◄──────────┘
                │ (Node)     │
                └────────────┘
                        │
                ┌────────────┐
                │ MinIO      │ ◄─ persistent volume
                │ (S3 API)   │
                └────────────┘
                ┌────────────┐
                │ Tempo +    │ ◄─ traces (OTel collector)
                │ Prometheus │
                │ + Loki     │
                │ + Grafana  │
                └────────────┘
```

### Components and how they're sized
| Service | Image | Purpose | Default resources |
|---|---|---|---|
| `editor` | `pryzm/editor:<ver>` (nginx-served static build) | Serves the editor SPA | 0.25 CPU / 256 MiB |
| `sync-server` | `pryzm/sync-server:<ver>` | Yjs WebSocket per project + event-log writer | 1 CPU / 1 GiB |
| `bake-worker` | `pryzm/bake-worker:<ver>` | Geometry/IFC/DWG/PDF jobs (BullMQ consumer) | 2 CPU / 2 GiB |
| `ai-worker` | `pryzm/ai-worker:<ver>` | LLM call gateway (customer-supplied keys) | 0.5 CPU / 1 GiB |
| `postgres` | `postgres:16` | Persistence (RLS-enforced) | 1 CPU / 2 GiB / 50 GiB volume |
| `redis` | `redis:7` | BullMQ queue, ephemeral session caches | 0.25 CPU / 512 MiB |
| `minio` | `minio/minio` | S3-compatible object store (chunks + exports + audit spillover) | 1 CPU / 1 GiB / 200 GiB volume |
| `caddy` | `caddy:2` | TLS termination + reverse proxy | 0.25 CPU / 256 MiB |
| `observability` | Grafana+Tempo+Prom+Loki | OTel collector + dashboards | 1 CPU / 2 GiB / 100 GiB volume |

Total minimum host: 8 CPU / 12 GiB RAM / 350 GiB disk. Tested on a 4-CPU / 16 GiB VM as a smoke target (slow but functional).

### `.env` (single config surface)
- `PRYZM_DOMAIN` — public domain for the install.
- `POSTGRES_PASSWORD`, `MINIO_ROOT_PASSWORD`, `REDIS_PASSWORD`.
- `AI_LLM_PROVIDER` (`anthropic` | `openai` | `azure-openai` | `none`) + `AI_LLM_API_KEY`.
- `JWT_SECRET` (rotated quarterly per SPEC-08 §2.2).
- `EMAIL_PROVIDER` (`smtp` | `none`).
- Optional: `HONEYCOMB_API_KEY` (off by default, per ADR-007).

### Air-gap support
- All images and dependencies must be loadable from a tarball: `pryzm-self-host-<ver>.tar.gz` containing all images + the docker-compose file + a `README.md` with the offline install steps.
- No external API calls during install or boot (other than customer-configured LLM endpoint and SMTP).
- License-key check is offline (signed JWT bundled in the install).

### What's not in v1 (deferred)
- **Helm chart** — Phase 4. Customers needing Kubernetes can run docker-compose on a VM in v1.
- **Single-binary distribution** — Phase 4. Useful for laptop demos; not material for production.
- **Multi-node sync-server with shared Y.Doc state** — out of v1; one sync-server pod per install.
- **HA Postgres** — customers run their own HA Postgres if they need it (the compose stack documents how to point `sync-server` at an external DB).

### Upgrade path
- Customer pulls the new docker-compose file + new image tags.
- `docker compose pull && docker compose up -d` does a rolling restart of stateless services.
- Postgres migrations run via a one-shot `pryzm-migrate` container at boot of `sync-server`.
- Event-log compaction (per SPEC-02 §3) runs on a cron sidecar.

---

## Consequences

**Positive:**
- One host. One file. One command. The bar customers expect.
- Air-gap viable; no SaaS dependency.
- All components are open-source-license-compatible (MinIO/Postgres/Redis/Caddy/Grafana stack are all permissive).
- Same components used in PRYZM-hosted SaaS, so behavior parity is high.

**Negative:**
- Single-host install is not HA. Documented limitation; HA is a Phase 4 add-on.
- Self-host does not get hosted SaaS conveniences (auto-scaling bake workers, multi-region replication).
- Operations runbook required: backup, upgrade, key rotation, incident response. Documented in `docs/operations/self-host/`.

---

## Alternatives considered

### Helm chart for v1
- Rejected: too much surface area for v1; many customers don't run Kubernetes. Helm becomes a Phase 4 add-on once usage patterns are clear.

### VM image (OVA/AMI) for v1
- Rejected: locks customers to a specific hypervisor or cloud. Docker is universal.

### Cloud-only (refuse self-host)
- Rejected: kills D7; loses regulated and EU-strict customers.

### Multi-cloud Terraform modules
- Considered. Out of v1; provided as community examples post-GA.

### Snapcraft / Flatpak
- Rejected: irrelevant to the buyer profile.

---

## Phase rollout
- S22 (M12 alpha) — local docker-compose used by the team for daily dev (proves the stack composes correctly).
- S48 (M24 beta) — internal beta of self-host: PRYZM team runs an instance off the public-facing compose file end-to-end.
- S58 — first design partner self-hosts.
- S64 — air-gap install tested on a network-isolated VM.
- S70 — D7 enterprise install runbook complete; first paying self-host customer in production.
- S72 (M36 GA) — published support matrix; Helm chart and single-binary tracked as v2 work.
