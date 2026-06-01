---
title: Self-Host Architecture
description: How the six self-host services fit together.
sidebar:
  order: 2
---

The PRYZM self-host stack is six services on one Docker network.  This page
explains what each one does and how requests flow through them.

## Service map

```
                         ┌─────────────────────┐
  http://<host>:3000 ──→ │  editor (nginx)     │ ──── /         → static SPA
                         │                     │ ──── /v1/*     → api-gateway
                         │                     │ ──── /ws       → api-gateway
                         └──────────┬──────────┘
                                    │ (HTTP + WS)
                                    ▼
                         ┌─────────────────────┐
                         │  api-gateway:5101   │ ──── REST: /v1/* (S65)
                         │  (Express 5 + ws)   │ ──── WS:   /ws  (S65)
                         └────┬──────┬─────────┘
                              │      │
                  ┌───────────┘      └──────────┐
                  ▼                              ▼
        ┌──────────────────┐           ┌──────────────────┐
        │ sync-server:4000 │           │ bake-worker:4001 │
        │ (CommandEvent +  │           │ (job runner)     │
        │  WS broadcast)   │           │                  │
        └────────┬─────────┘           └─────────┬────────┘
                 │                                │
                 ▼                                ▼
            ┌────────────────────────────────────────┐
            │           postgres:5432                │
            │  (event log, projects, marketplace,    │
            │   schema_migrations)                   │
            └────────────────────────────────────────┘
                                    ▲
                                    │ (artefact references)
                         ┌──────────┴──────────┐
                         │       minio         │
                         │  (S3-compatible:    │
                         │   bake outputs,     │
                         │   plugin bundles)   │
                         └─────────────────────┘
```

## Request flow examples

### "Open project hub"

1. Browser → `GET http://localhost:3000/` → nginx serves `index.html`.
2. SPA boots, calls `GET /v1/projects` → nginx proxies to `api-gateway:5101`.
3. api-gateway authenticates via the configured auth shim (S65 D2 default
   = test shim, S70 = production OAuth2/PKCE per ADR-0017).
4. api-gateway queries Postgres for the workspace's projects.
5. JSON response returns to the SPA via nginx.

### "Place a wall (collaborative)"

1. Editor establishes a WebSocket: `ws://localhost:3000/ws/<projectId>` →
   nginx upgrades to `ws://api-gateway:5101/ws/<projectId>`.
2. Editor sends a `place-wall` CommandEvent over WS.
3. api-gateway forwards the event to `sync-server:4000` (over WS) for
   linearisation.
4. sync-server appends to the Postgres event log, assigns monotonic seq,
   broadcasts to all connected clients on the same project.
5. sync-server fire-and-forget enqueues a bake job.
6. bake-worker dequeues, computes geometry deltas, writes the bake output
   to MinIO, updates Postgres job status.
7. Connected clients receive the broadcast via WS and re-render.

## Persistence

| Where               | What                                                           |
| ------------------- | -------------------------------------------------------------- |
| Postgres `pryzm` DB | Projects, members, CommandEvent log, marketplace plugins,      |
|                     | bake job state, audit log                                      |
| MinIO bucket(s)     | Bake artefacts (bin geometry, sceneIR), plugin bundles,        |
|                     | uploaded textures + IFC/DXF/Rhino source files                 |
| Docker volumes      | `pryzm-postgres-data` (PGDATA), `pryzm-minio-data` (/data)     |

## Networking

A single user-defined bridge network (`pryzm-net`) carries all inter-service
traffic.  Service-to-service DNS uses Docker's embedded resolver
(`127.0.0.11`); nginx's `upstream pryzm_api` resolves `api-gateway` via the
embedded DNS with `valid=10s` for restart resilience.

Only the editor's `:80` (mapped to host `:3000`) and MinIO's `:9001` (admin
console, mapped to host `:9001`) cross the host boundary.  `postgres`,
`sync-server`, `bake-worker`, and `api-gateway` are not host-exposed.

## Healthchecks

Compose runs a health probe per service.  `install.sh`'s wait loop polls
`docker compose ps` and exits successfully only when no service reports
`starting` or `unhealthy`.

| Service       | Probe                                                |
| ------------- | ---------------------------------------------------- |
| postgres      | `pg_isready -U pryzm -d pryzm`                       |
| minio         | `mc ready local`                                     |
| sync-server   | `wget -qO- http://localhost:4000/health` *(\*)*       |
| bake-worker   | `wget -qO- http://localhost:4001/health` *(\*)*       |
| api-gateway   | `wget -qO- http://localhost:5101/v1/health`          |
| editor        | `wget -qO- http://localhost/healthz`                 |

*(\*)* Sync-server and bake-worker `/health` routes are referenced by the
S67 compose verbatim per the phase doc but are not yet wired into the
service `app.ts` files at this commit.  Until they land, those two services
will report `unhealthy` after the start period — the services function
normally; they just don't self-report.  Wiring follow-up is in the S67
audit's "what didn't land" list.

## Where to look

- `pryzm-selfhost/docker-compose.yml` — service composition.
- `pryzm-selfhost/install.sh` — one-shot installer.
- `pryzm-selfhost/init-db/` — Postgres bootstrap SQL.
- `pryzm-selfhost/nginx/editor.conf` — front-door config.
- `apps/api-gateway/Dockerfile` (and sync-server, bake-worker, editor) —
  per-service multi-stage builds.
- `docs/02-decisions/adrs/0048-s67-self-host-docker-compose.md` —
  architectural decisions.
- `docs/02-decisions/adrs/0049-s67-multi-region-cut-decision.md` — the
  Tier-2 multi-region cut.
