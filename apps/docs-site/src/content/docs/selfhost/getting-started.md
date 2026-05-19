---
title: Self-Host Getting Started
description: Run PRYZM on your own infrastructure with Docker Compose.
sidebar:
  order: 1
---

PRYZM 2 ships a self-host Docker Compose stack so you can run the platform on
your own Linux box with one command.  Target install time: under 10 minutes
on a fresh VM with warm Docker cache.

> **Status (S67, 2026-04-28):** the stack scaffolding is complete and the
> compose file + Dockerfiles + install script are committed at
> `pryzm-selfhost/`.  Container images are not yet published to `ghcr.io`,
> so the install script builds them locally on first run (~5–15 min).
> Published images + ARM64 multi-arch ship at S70.

## What you get

A single Docker network with six services:

- **postgres** — Postgres 16, the application database.
- **minio** — S3-compatible storage for bake artefacts and plugin bundles.
- **sync-server** — collaborative editing event log.
- **bake-worker** — incremental geometry/scene baking.
- **api-gateway** — REST + WebSocket public API.
- **editor** — nginx serving the SPA and reverse-proxying API/WS traffic.

The user-facing front door is `http://<your-host>:3000`.

## Prerequisites

- Linux x86_64 (ARM64 supported once published images land).
- Docker 20.10+ with the Compose v2 plugin (`docker compose`) **or** legacy
  docker-compose v1.  The installer detects either.
- `openssl` for secret generation (preinstalled on every mainstream distro).
- 4 GB RAM, 10 GB free disk.

## Install

From a clone of the PRYZM repository:

```bash
cd pryzm-selfhost
./install.sh
```

The script:

1. Detects `docker compose` vs `docker-compose`.
2. Generates 24-byte hex secrets for Postgres and MinIO into `.secrets/`
   (skipped if they already exist).
3. Copies `.env.example` to `.env` if missing.
4. Builds all images (skip with `SKIP_BUILD=1` once published images land).
5. Brings the stack up and waits for every service to report healthy.

When healthchecks go green:

- Editor: `http://localhost:3000`
- MinIO admin console: `http://localhost:9001` (user `pryzm`, password from
  `.secrets/minio_password`)

## Day-2 operations

```bash
# Tail all logs
docker compose logs -f

# One service
docker compose logs -f api-gateway

# Restart after config change
docker compose restart api-gateway

# Rebuild after upstream code change
docker compose build api-gateway && docker compose up -d api-gateway

# Stop (data preserved)
docker compose down

# Stop and DELETE all data
docker compose down -v
```

`pryzm-selfhost/Makefile` wraps the common ones (`make up`, `make down`,
`make logs`, `make health`, `make nuke`).

## Secrets

Two files live in `.secrets/` after install:

```
.secrets/postgres_password
.secrets/minio_password
```

Both are mode 0600 and ignored by git.  To rotate:

1. Stop the stack: `docker compose down`.
2. Generate a new value: `echo -n "$(openssl rand -hex 24)" > .secrets/postgres_password`.
3. **For Postgres**, you also need to update the role password inside the
   database (the password file is read on container start to seed the
   superuser, but a running cluster doesn't re-read it).  Easiest path:
   `docker compose down -v` to wipe and start fresh, OR run
   `ALTER ROLE pryzm WITH PASSWORD '<new>';` against the live DB before
   updating the file.
4. Restart: `docker compose up -d`.

A turnkey rotation script lands at S68 D9 (secret-rotation playbook).

## Multi-region

Self-host is single-region by design.  The `PRYZM_REGION` env var in
`.env.example` is reserved for future use; setting it has no effect at S67.
Multi-region SaaS hosting is a Tier-2 cut for M36 GA per
[ADR-0049](#).  EU-resident customers should run the self-host stack on an
EU-located VM (Hetzner / OVH / Scaleway Frankfurt are all good choices).

## What is NOT yet in scope at S67

| Item                                  | Lands at | Notes                                                    |
| ------------------------------------- | -------- | -------------------------------------------------------- |
| Published `ghcr.io/pryzm/*` images    | S70      | Today, install script builds locally                     |
| ARM64 multi-arch                      | S70      | Dockerfiles are arch-agnostic; needs CI publish pipeline |
| Migration tooling                     | S70      | Move data from PRYZM SaaS to self-host                   |
| Self-host BYO-key AI safety cap       | S70      | Env var present in `.env.example`; runtime gate at S70   |
| TLS termination at editor nginx       | S70      | Today, expects upstream proxy to handle TLS              |
| Single-binary distribution            | post-GA  | Docker Compose path stable first                         |

## Troubleshooting

**Build hangs at "Installing dependencies"**
First-run pnpm install is ~2 GB.  Use `--progress=plain` to see live
output: `docker compose build --progress=plain`.  Subsequent builds are
fast thanks to Docker layer caching.

**`docker-compose: command not found`**
Install Docker with the Compose plugin (`docker compose version` works) or
install legacy `docker-compose` v1.

**Healthcheck timeout**
Bump the wait window: `HEALTHCHECK_TIMEOUT_SEC=600 ./install.sh`.  Then
inspect `docker compose ps` and `docker compose logs <service>`.  At S67,
sync-server and bake-worker `/health` endpoints are referenced by the
healthcheck but not yet wired into the service `app.ts` — until they land,
expect "unhealthy" reports for those two services.  The services themselves
work correctly; they just don't self-report.

**Port 3000 already in use**
Edit `pryzm-selfhost/docker-compose.yml`, change the editor `ports:` line:
`"3001:80"` and access at `http://localhost:3001`.

## Filing issues

Self-host issues: file at the PRYZM repo issues page with the `selfhost`
label.  Include `docker compose ps` + `docker compose logs --tail 200`
output.
