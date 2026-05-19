# PRYZM 2.0.0 — Release Notes (Platform)

**Release date**: 2026-04-29
**Sprint**: PRYZM 2 Phase 3D · S72 (M36 GA Launch Gate)
**Tag**: `v2.0.0` (operator-side `git tag` + push)
**Status**: D-day-actionable artefacts published. LAUNCH on D7 Tuesday (operator-side calendar gate).

This is the platform-level release notes for PRYZM 2.0.0 GA. The
self-host bundle release notes are at
[`pryzm-selfhost/RELEASE-NOTES-2.0.0.md`](pryzm-selfhost/RELEASE-NOTES-2.0.0.md).
The launch announcement / blog post draft is at
[`docs/marketing/GA-LAUNCH-BLOG-POST.md`](docs/marketing/GA-LAUNCH-BLOG-POST.md).
The 36-month build post-mortem is at
[`docs/post-mortems/PRYZM-2-build.md`](docs/post-mortems/PRYZM-2-build.md).

---

## 1. What ships at 2.0.0

### 1.1 Services (6-service self-host bundle)

| Service | Image tag | Schema version | File-format version |
|---|---|---|---|
| `postgres` | `postgres:16-alpine` (upstream) | n/a | n/a |
| `minio` | `minio/minio:RELEASE.2026-01-01T00-00-00Z` (upstream) | n/a | n/a |
| `sync-server` | `ghcr.io/pryzm/sync-server:2.0.0` | 1 | 1 (`.pryzm` v1 per SPEC-25) |
| `bake-worker` | `ghcr.io/pryzm/bake-worker:2.0.0` | 1 | 1 |
| `api-gateway` | `ghcr.io/pryzm/api-gateway:2.0.0` | 1 | 1 |
| `editor` | `ghcr.io/pryzm/editor:2.0.0` | 1 | 1 |

Machine-readable copy at [`pryzm-selfhost/version.json`](pryzm-selfhost/version.json).

### 1.2 Public APIs

- **REST + WebSocket** (`api-gateway`, port 5101): OAuth2-authenticated, rate-limited. 175 tests green at GA. See [`apps/docs-site/src/content/docs/api/`](apps/docs-site/src/content/docs/api/).
- **Headless** (`@pryzm/headless`, npm): Node 20.x compat asserted; flip from `private:true` to `private:false` at the operator-side npm publish step.
- **AI public API** (BYO-key, gated, budgeted): `selfHostPerCallCapUsd $25` default at self-host; SaaS tier per [`SPEC-28 §11`](docs/03_PRYZM3/reference/specs/SPEC-28-AI-PUBLIC-API.md).
- **Webhooks**: HMAC-SHA256 signing, bounded delivery, admin REST surface, synthetic test-fire route. < 0.06 ms/op signature verification.

### 1.3 Plugin SDK 1.0 + marketplace

- 30+ first-party plugins shipped (T1 wall, T2 window, T3 structural, T4 toy-cube, IFC import, IFC export, DXF import, Rhino import, BCF round-trip, …).
- Signed plugin marketplace (Ed25519 keypair; 90-day additive trusted-keys + immediate revocation list).
- `<iframe sandbox="allow-scripts">` strict — no `allow-same-origin`. K3-C kill-switch in force.

### 1.4 File format

- `.pryzm` v1 frozen at S71b D7. Round-trip guaranteed by `packages/file-format/__tests__/round-trip.test.ts`.
- `.pryzm-family` v1 frozen at S57.

### 1.5 Self-host

- `docker-compose up` → working PRYZM 2 in < 10 minutes on 4-vCPU Linux VM.
- ARM64 + x86_64 supported (Dockerfiles arch-agnostic; ARM64 multi-arch publish is operator-side post-GA).
- `pryzm install` / `pryzm upgrade` / `pryzm rollback` CLI for operator workflows.
- 6 services + named volumes + bridge network + secret files. See [`pryzm-selfhost/README.md`](pryzm-selfhost/README.md).

### 1.6 Security posture (M35 Q4 baseline)

- HoundDog scan: 0 findings (S68 D7 baseline).
- Plugin sandbox: `allow-scripts` only; escape-vector regression suite covers 5 categories.
- CSP strict-by-default at editor SPA front-door; per-plugin iframe CSP `default-src 'none'`.
- OAuth2 PKCE (RFC 7636 + OAuth 2.1) primitive in `packages/oauth2-pkce`.
- SAML / SCIM mappings as canonical contract; runtime adapter operator-side.
- Secret rotation playbook covers 13 secrets across 3 deployment topologies.
- See [`docs/security/`](docs/security/) for the 7 audit docs.

### 1.7 Accessibility

- WCAG 2.2 AA on critical paths (project hub, editor, inspector, sheet view).
- Focus-ring + skip-link + ARIA + contrast remediations landed S70 D7.
- Re-audit cadence: every-sprint smoke + quarterly full audit.
- See [`docs/accessibility/wcag-2.2-aa-audit-2026-04-28.md`](docs/accessibility/wcag-2.2-aa-audit-2026-04-28.md).

### 1.8 Performance

- 4 of 9 [`08-VISION §6`](docs/03_PRYZM3/08-VISION.md) NFT rows fully landed (`save-edit`, `idle-cpu`, `largest-model`, `bake-incremental`).
- 4 partial (cold-load small/medium/large + orbit-fps) — bench files exist; baseline-key promotion is the mechanical post-GA step.
- 1 documented gap (`undo-single`).
- 10K wall × 50 level largest fixture: opens & orbits (parse p95 39.769 ms / produce p95 193.867 ms; 30× / 46× under budget; **K3-F NOT TRIPPED**).
- See [`apps/bench/reports/M36-GA.md`](apps/bench/reports/M36-GA.md).

---

## 2. What's labeled "preview" at GA

### 2.1 PDF-to-BIM

PDF-to-BIM ships under the `'preview'` label per [ADR-029 Part E](docs/architecture/adr/0029-pdf-to-bim-preview-gate.md) + [ADR-0052 §E](docs/architecture/adr/0052-s70-browser-matrix-wcag-selfhost-publish-pdf-preview-lifecycle-deletion.md) + [ADR-0054 §C](docs/architecture/adr/0054-s72-m36-ga-launch-gate.md).

Why preview at GA: the SPEC-45 fixture corpus of ≥ 50 real PDF sets
has not been measured here; the preview-gate function defaults to
`'preview'` per its safety contract.

How to flip to `'full'`: run `evaluatePreviewGate(realMetrics)` from
[`apps/ai-worker/src/pdf-to-bim/preview-gate.ts`](apps/ai-worker/src/pdf-to-bim/preview-gate.ts)
against your own corpus. If it returns `'full'`, set
`PDF_TO_BIM_RELEASE_LABEL = 'full'` in your build. One-line constant
flip + release-notes delta. No API change.

---

## 3. Breaking changes vs PRYZM 1

PRYZM 2 is a **re-architecture**, not an upgrade-in-place. The PRYZM 1
self-host (1.x line) ended at the S61 sunset window. PRYZM 2.0.0 is
not API-compatible at the binary or HTTP level.

Per-project migration via `pryzm pack` (PRYZM 1) → `pryzm unpack`
(PRYZM 2). Batch migration tool ships during the 90-day sunset window.
See [`docs/operations/pryzm-1-sunset.md`](docs/operations/pryzm-1-sunset.md).

---

## 4. Carry-forwards (operator-side, named by sprint+day)

Every operator-side gate at GA is named in the M36-GA report §5
+ ADR-0054 §G + post-mortem §5. Highlights:

- LAUNCH on D7 Tuesday (S72 D7).
- First 24-h monitoring + 48-h triage (S72 D8 / S72 D9).
- Pen test (S68 R3D-02 — external vendor).
- Browser matrix live runs (S70 D2/D9 — `.github/workflows/browser-matrix.yml`).
- DR drill #1 (S70 D8 / S71 D8).
- Stripe checkout / pricing config (S71b D3 / S72 D4).
- Marketing site live + 5 case studies + 5-min demo video (S71b D1–D6).
- ≥ 100 paying users (post-LAUNCH KPI).
- Cold-load NFT baseline promotion (3 rows) + orbit-fps real-browser p95 (post-GA).
- ARM64 multi-arch publish + ghcr.io push (S70 D8 — operator-side via `pryzm-selfhost/scripts/publish-prep.sh --push`).
- SPEC-45 PDF corpus measurement → preview→full flip (post-GA).
- `src/` PRYZM 1 tree deletion (post 90-day sunset window).

---

## 5. Documentation

- User guide: [`docs.pryzm.com`](https://docs.pryzm.com).
- Plugin SDK: [`docs.pryzm.com/plugin-sdk`](https://docs.pryzm.com/plugin-sdk).
- Headless: [`docs.pryzm.com/headless`](https://docs.pryzm.com/headless).
- File format: [`docs.pryzm.com/file-format`](https://docs.pryzm.com/file-format).
- REST/WS API: [`docs.pryzm.com/api`](https://docs.pryzm.com/api).
- Self-host: [`docs.pryzm.com/selfhost`](https://docs.pryzm.com/selfhost).
- Accessibility: [`docs.pryzm.com/accessibility`](https://docs.pryzm.com/accessibility).
- M36 GA bench rollup: [`apps/bench/reports/M36-GA.md`](apps/bench/reports/M36-GA.md).
- 36-month post-mortem: [`docs/post-mortems/PRYZM-2-build.md`](docs/post-mortems/PRYZM-2-build.md).
- Post-GA roadmap: [`docs/roadmap/post-GA.md`](docs/roadmap/post-GA.md).
- PRYZM 1 sunset: [`docs/operations/pryzm-1-sunset.md`](docs/operations/pryzm-1-sunset.md).
- Cut-list log: [`docs/operations/cut-list-log.md`](docs/operations/cut-list-log.md).
- Status page + on-call runbook: [`docs/operations/status-page-and-on-call.md`](docs/operations/status-page-and-on-call.md).

---

## 6. Honest sign-off

Per the closure pattern S55 → S72 has used: this release is at
**D-day-actionable partial close**. Every artefact required by the
phase-doc §3 GA gate is in-repo at this commit; every operator-side
gate is named with a sprint+day pointer. The static GA-gate test
suite under `tests/ga-gate/` is green; the K3-F regression gate is
NOT TRIPPED at the most recent re-bench; the version manifests
agree on `2.0.0`.

The LAUNCH itself (D7 Tuesday) is operator-side. The release notes
are the contract; the LAUNCH is the calendar event that makes the
contract live.

---

*Authored 2026-04-29 at S72 D5. Owner: Architecture lead. For the
self-host bundle release notes (image manifests, upgrade pointer,
ghcr.io publish), see `pryzm-selfhost/RELEASE-NOTES-2.0.0.md`.*
