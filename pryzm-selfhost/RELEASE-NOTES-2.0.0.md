# PRYZM Self-Host — 2.0.0 Release Notes

**Release date**: 2026-04-28
**Sprint**: Phase 3D · S70 · Day 8
**Status**: Manifest published; image push deferred to operator-side (see §5).

---

## 1. What's new since 1.x

PRYZM 2.0.0 is the first **PRYZM 2** self-host bundle. PRYZM 1 self-host (1.x line) ended at the S61 sunset window; PRYZM 2.0.0 is a re-architecture, not an upgrade-in-place.

| Capability | 1.x | 2.0.0 | Reference |
|---|---|---|---|
| Multiplayer (CRDT-backed CommandEvent linearisation) | — | yes (sync-server) | SPEC-23 |
| Incremental bake worker (job queue + S3-backed artefacts) | — | yes (bake-worker + MinIO) | SPEC-24 |
| Plugin SDK (declarative descriptor + signed marketplace) | — | yes (S62/S64) | SPEC-30 |
| Public REST + WebSocket API | — | yes (api-gateway) | SPEC-32 |
| AI integrations (gated + budgeted) | — | yes (AI host + cost meter; BYO-key cap default $25) | SPEC-28 + ADR-0052 §B.6 |
| Self-host bundle (Docker Compose 6-service split) | — | yes (postgres + minio + sync-server + bake-worker + api-gateway + editor) | ADR-0048 |
| `pryzm install` / `pryzm upgrade` / `pryzm rollback` CLI | — | yes (`@pryzm/cli` ships with three new subcommands) | SPEC-27 §7 |
| PDF-to-BIM (preview label) | — | yes | ADR-029 Part E + ADR-0052 §B.5 |

---

## 2. Component matrix

| Service | Image tag | Schema version | File-format version |
|---|---|---|---|
| `postgres` | `postgres:16-alpine` (upstream) | n/a | n/a |
| `minio` | `minio/minio:RELEASE.2026-01-01T00-00-00Z` (upstream) | n/a | n/a |
| `sync-server` | `ghcr.io/pryzm/sync-server:2.0.0` | 1 | 1 (`.pryzm` v1 per SPEC-25) |
| `bake-worker` | `ghcr.io/pryzm/bake-worker:2.0.0` | 1 | 1 |
| `api-gateway` | `ghcr.io/pryzm/api-gateway:2.0.0` | 1 | 1 |
| `editor` | `ghcr.io/pryzm/editor:2.0.0` | 1 | 1 |

Machine-readable copy at `pryzm-selfhost/version.json`.

---

## 3. Breaking changes vs PRYZM 1 self-host (1.x)

PRYZM 2.0.0 is **not** an in-place upgrade target from any PRYZM 1.x. Operators on 1.x must:

1. Export project archives via the PRYZM 1 export tool (1.9.x — last 1.x line).
2. Stand up PRYZM 2.0.0 fresh (`./install.sh`).
3. Import each `.pryzm` v1 archive via the editor's "Import PRYZM 1 project" dialog.

The PRYZM 1 → PRYZM 2 conversion path is one-way (no round-trip). See `apps/editor/migrations/sunset-pryzm1.md` §5 for the full migration playbook.

---

## 4. Operator-side migration tooling (new in 2.0.0)

`@pryzm/cli` now ships three subcommands targeting the self-host stack (per SPEC-27 §7):

```bash
pnpm pryzm install                  # idempotent first-run installer
pnpm pryzm upgrade --to=2.0.0       # schema + file-format migrations
pnpm pryzm rollback --to=2.0.0      # one-minor-back guard per SPEC-27 §7.3
```

`install` is a thin wrapper over `pryzm-selfhost/install.sh` (S67 D1). `upgrade` and `rollback` are new at S70 D8.

---

## 5. Image push status — operator-side

The 2.0.0 manifest (`version.json`) is published in this commit. Pushing the per-service container images to `ghcr.io/pryzm/*:2.0.0` requires `GHCR_PAT` credentials that this development environment does not hold. Operators run:

```bash
cd pryzm-selfhost
GHCR_PAT=<...> ./scripts/publish-prep.sh        # dry-run validation
GHCR_PAT=<...> ./scripts/publish-prep.sh --push # actually pushes
```

`./install.sh` continues to build images locally on first run, so the **end-user experience is identical whether or not the images are published to ghcr.io**. The publish step matters only for ARM64 multi-arch shipping (deferred from S67 D5) + faster cold starts on bandwidth-constrained operators.

See `docs/architecture/adr/0052-…-lifecycle-deletion.md` §B.3 for the rationale.

---

## 6. Known limitations at 2.0.0

- **PDF-to-BIM**: ships under "preview" label per ADR-0052 §B.5 + the gate mechanism in `apps/ai-worker/src/pdf-to-bim/preview-gate.ts`. SPEC-45 fixture-corpus measurement deferred to S72 D5 GA tag.
- **`plugins/lifecycle/`**: post-occupancy panel surface is deferred. The DataWorkbench `'lifecycle'` panel slot is empty until the plugin ports the surface (per ADR-030 §B + ADR-0052 §B.7).
- **ARM64 images**: amd64-only at 2.0.0; ARM64 multi-arch shipping deferred (see §5).
- **WCAG 2.2 AA**: the 4 critical paths named in PHASE-3D §S70 row #5 are partially audited at S70 D6/D7 — see `docs/accessibility/wcag-2.2-aa-audit-2026-04-28.md` for the per-path status.

---

## 7. Cross-references

- ADR-0048 — S67 self-host docker-compose 6-service split.
- ADR-0052 — S70 sprint-scoped decision record (this release).
- SPEC-15 §7 — self-host topology.
- SPEC-27 §7 — self-host migration tooling.
- SPEC-28 §11 — BYO-key safety cap.
- `docs/architecture/adr/0048-s67-self-host-docker-compose.md`.
