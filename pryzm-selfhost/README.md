# PRYZM Self-Host

> **Status:** S67 (PHASE-3D) — Docker Compose stack scaffolding landed; container
> images are not yet published to `ghcr.io`.  Self-host runs today by building
> images locally with `./install.sh` (the script does this for you).
> Published images + ARM64 multi-arch shipping at S67 D5 / S70.

---

## Quick start

```bash
cd pryzm-selfhost
./install.sh
```

When healthchecks go green (target: <10 min on a 4-vCPU VM with warm cache),
PRYZM is live at **http://localhost:3000**.

The MinIO admin console is at http://localhost:9001 (user: `pryzm`, password:
`cat .secrets/minio_password`).

---

## What ships

| Service       | Image                                      | Internal port | Exposed | Purpose                                 |
| ------------- | ------------------------------------------ | ------------- | ------- | --------------------------------------- |
| `postgres`    | `postgres:16-alpine`                       | 5432          | —       | application DB                          |
| `minio`       | `minio/minio:RELEASE.2026-01-01T…`         | 9000 / 9001   | 9001    | S3-compatible bake-artefact storage     |
| `sync-server` | `ghcr.io/pryzm/sync-server:2.0.0`          | 4000          | —       | CommandEvent linearisation + WS         |
| `bake-worker` | `ghcr.io/pryzm/bake-worker:2.0.0`          | 4001          | —       | incremental bake jobs                   |
| `api-gateway` | `ghcr.io/pryzm/api-gateway:2.0.0`          | 5101          | —       | REST + WS public surface (S65)          |
| `editor`      | `ghcr.io/pryzm/editor:2.0.0`               | 80            | **3000**| nginx: SPA + reverse-proxy API/WS       |

The stack is one Docker network (`pryzm-net`) with two named volumes
(`pryzm-postgres-data`, `pryzm-minio-data`).

---

## Prerequisites

- Linux x86_64 (ARM64 supported once published images land — S67 D5).
- Docker 20.10+ with Compose plugin (`docker compose`) **or** docker-compose v1
  (`docker-compose`).  `install.sh` auto-detects.
- `openssl` for secret generation.
- 4 GB RAM, 10 GB disk free.
- Outbound HTTPS to `ghcr.io` (only if `SKIP_BUILD=1`) and to npm registry
  (during local build).

---

## Files

```
pryzm-selfhost/
  docker-compose.yml      # 6-service stack (see ADR-0048)
  install.sh              # one-shot installer (idempotent)
  .env.example            # copy to .env on first run
  .gitignore              # excludes .secrets/ and .env
  init-db/
    01-bootstrap.sql      # schema_migrations + pryzm app schema
    02-marketplace.sql    # marketplace plugins schema (S64)
  Makefile                # convenience targets: build / up / down / logs / nuke
  README.md               # this file
```

Per-service Dockerfiles live alongside their source:

```
apps/api-gateway/Dockerfile
apps/sync-server/Dockerfile
apps/bake-worker/Dockerfile
apps/editor/Dockerfile
```

The build context for every service is the repository root (the parent of this
directory) so each `Dockerfile` can resolve `pnpm-workspace.yaml`,
`packages/*`, and its own `apps/<self>/`.

---

## Operations

```bash
# Tail all logs
docker compose logs -f

# One service
docker compose logs -f api-gateway

# Restart a service after code changes
docker compose build api-gateway && docker compose up -d api-gateway

# Stop everything (volumes preserved)
docker compose down

# Stop + delete data (DESTRUCTIVE)
docker compose down -v
```

For `make`-based shortcuts see the included `Makefile`.

---

## Secrets

`install.sh` generates two secret files on first run:

```
.secrets/postgres_password        # 24 hex bytes, mode 0600
.secrets/minio_password           # 24 hex bytes, mode 0600
```

These are mounted as Docker secrets into `postgres` and `minio`.  They are
**not** committed to git (see `.gitignore`).  To rotate:

```bash
docker compose down
echo -n "$(openssl rand -hex 24)" > .secrets/postgres_password
# (Postgres rotation also requires updating the in-DB role password —
#  see docs.pryzm.com/selfhost/getting-started for the full runbook.)
docker compose up -d
```

---

## What is NOT yet shipped (deferred to later sprints)

| Item                                        | Sprint | Status |
| ------------------------------------------- | ------ | ------ |
| Container images published to `ghcr.io/pryzm/*` | S70 D8 | manifest landed (`version.json`); push deferred to operator-side via `scripts/publish-prep.sh` (no ghcr.io creds in the dev container) |
| ARM64 multi-arch images                     | post-GA | deferred — Dockerfiles are arch-agnostic; multi-arch buildx wiring lands post-GA per ADR-0052 §B.3 |
| Fresh-VM tested on Ubuntu / Debian / RHEL   | S67 D6 | deferred — needs real VM matrix |
| Self-host migration tooling                 | S70 D8 | **landed** — `pryzm install` / `pryzm upgrade` / `pryzm rollback` shipped in `@pryzm/cli` (per SPEC-27 §7) |
| Self-host BYO-key safety cap (runtime enforcement) | S70 D8 | **landed** — `PRYZM_SELFHOST=1` + `PRYZM_SELFHOST_PER_CALL_CAP_USD=<N>` env vars enforced in `CostMeter` ($25 default, per SPEC-28 §11 + ADR-0052 §B.6) |
| Documented at `docs.pryzm.com/selfhost/`    | S67 D7 | landed at `apps/docs-site/src/content/docs/selfhost/` |
| 2.0.0 release notes + manifest              | S70 D8 | **landed** — `RELEASE-NOTES-2.0.0.md` + `version.json` + `scripts/publish-prep.sh` |

See `docs/03_PRYZM3/archive/superseded-audits/PHASE-3D-S67-AUDIT-2026-04-28.md` for the
S67 honest D-by-D status, and `RELEASE-NOTES-2.0.0.md` for the 2.0.0 self-host
bundle (S70 D8).

### S70 D8 — what just landed

```bash
# 1. Migration tooling (SPEC-27 §7):
pnpm pryzm install                  # idempotent first-run installer
pnpm pryzm upgrade --to=2.1.0       # one-minor-up plan (best-effort)
pnpm pryzm rollback --to=2.0.0      # one-minor-back guard

# 2. BYO-key safety cap (SPEC-28 §11):
export PRYZM_SELFHOST=1
export PRYZM_SELFHOST_PER_CALL_CAP_USD=25     # default; override here
docker compose up -d                          # CostMeter rejects single calls > $25

# 3. Publish manifest (operator-side handoff):
./scripts/publish-prep.sh                     # dry-run validation
GHCR_PAT=<...> ./scripts/publish-prep.sh --push  # actually push (operator only)
```

---

## Troubleshooting

**Build hangs at "Installing dependencies"**
The pnpm install across the full workspace is large (~2 GB of `node_modules`).
First run can take 10+ minutes on a cold cache.  Re-runs are <1 min thanks to
Docker layer caching.  Use `--progress=plain` to see live output:

```bash
docker compose build --progress=plain
```

**`docker-compose: command not found`**
You have Docker without the Compose plugin.  Either install Compose v2
(`apt install docker-compose-plugin` on Debian/Ubuntu, or follow Docker's
official install) or install legacy v1 (`apt install docker-compose`).

**Healthcheck timeout**
Bump the wait window:

```bash
HEALTHCHECK_TIMEOUT_SEC=600 ./install.sh
```

Then inspect:

```bash
docker compose ps
docker compose logs <service-name>
```

**Port 3000 already in use**
Edit `docker-compose.yml` `editor.ports` (e.g., `"3001:80"`).

---

## Multi-region

Multi-region is a Tier-2 cuttable item per `[strategic ADR-018]` T2.6, decided
in S67 D9 to **cut for M36 GA**.  See
`docs/architecture/adr/0049-s67-multi-region-cut-decision.md` for the decision
record.  If reverted post-GA, EU-West + US-East regional Supabase primaries
are provisioned per SPEC-24 §1.3 + SPEC-15 §3.1.

---

## License + contact

This stack is bound by the same license as the rest of the PRYZM repository.
Self-host issues: file at https://github.com/pryzm-com/pryzm/issues with the
`selfhost` label.
