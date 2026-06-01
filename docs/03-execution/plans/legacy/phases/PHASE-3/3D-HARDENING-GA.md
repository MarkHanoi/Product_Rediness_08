# Phase 3D — Self-Host, Hardening, Browser Matrix, GA Launch
## Q4 of Phase 3 · Months 34–36 · Sprints S67–S72

> **Authority note (added 2026-04-27).** This sub-phase doc is subordinate to the SPEC and ADR series. Conflict precedence: `docs/03_PRYZM3/reference/specs/SPEC-*` → `docs/03_PRYZM3/reference/adrs/ADR-*` (cited as `[strategic ADR-NNN]`) → `10-MASTER-IMPLEMENTATION-PLAN-36M.md` → `CRITICAL-REVIEW-2026-04-27.md` → `05-IMPLEMENTATION-PLAN.md` → this phase doc. Sprint-scoped ADRs in `docs/architecture/adr/NNNN-slug.md` are cited as `[ADR NNNN-slug]`.
>
> **Strategic anchor**: `08-VISION.md` → `10-MASTER-IMPLEMENTATION-PLAN-36M.md` §6 → `phases/PHASE-3-COMPLETION-GA-M25-M36.md` §5 → this file.
>
> **Coalescing-window invariant**: every reference to bake/event coalescing means **250 ms** per `[strategic ADR-010]`.

---

## Executive Summary

**Sub-phase goal**: production hardening + public launch. Self-host Docker Compose ships in < 10 minutes on fresh Linux. Pen test + RLS audit + plugin sandbox audit + SOC2 evidence pipeline all clean. Performance hardened on 10K-wall × 50-level largest fixture. Browser matrix (Chrome / Firefox / Safari / Edge + iPad) green. WCAG 2.2 AA on critical paths. Marketing site + docs site + 5-min demo + 5 case studies + Stripe checkout live. **PRYZM 2.0.0 GA tagged at S72**.

**Why 3D is the most "external-facing" quarter of Phase 3**: every other quarter has been internal — building, deleting, refactoring. 3D is the quarter where the world sees PRYZM 2 for what it is: open self-host, full browser matrix, public marketing, paying customers. The discipline is to ship what was built, not to add new features. K3-E applies: pen test critical findings without 7-day fix path delay GA by 1 month.

**The four hardest problems in 3D**:

1. **Self-host fresh-VM install in < 10 minutes** (S67) — the install must work on Ubuntu, Debian, RHEL, ARM64, and x86_64. Per SPEC-15 §7 the Docker Compose stack provisions Postgres + MinIO + sync-server + bake-worker + editor + api-gateway atomically.
2. **Pen test critical-severity remediation within Phase 3D window** (S68) — third-party pen test runs S68 D1–D2; remediations S68 D3–D8; if a critical finding lacks a 7-day fix path, GA delays.
3. **10K-wall × 50-level largest-fixture perf** (S69) — every NFT target re-benched. Any > 5% regression vs M24 hunted to root cause. K3-F applies: > 10% regression on any NFT target halts forward 3D work.
4. **Cross-browser parity** (S70) — Safari WebGPU detection + WebGL2 fallback paths; iPad tablet review mode; Firefox-specific fixes; visual diff < 5 px per browser.

---

## §0 Reading Conventions

**ADR citation format**: `[strategic ADR-NNN]` for strategic series; `[ADR NNNN-slug]` for sprint-scoped.

**GA-gate invariant**: every M36 GA gate criterion in §5 must be GREEN before launch on S72 D7. Yellow on any criterion delays launch by 1 week minimum.

**Cut-list invariant**: per `[strategic ADR-018]` T2.6 multi-region prep is cuttable; if not cut, EU-West + US-East regional Supabase primaries provisioned per SPEC-24 §1.3 + SPEC-15 §3.1 in S67. Default cut for M36; if reverted, cost = 2 sprints (i.e., GA slips to ~M38).

---

## §1 Track Allocation for 3D

### Track A — Self-host, security, SOC2, perf, DR (Agent A)

| Item | Sprint |
|---|---|
| `pryzm-selfhost/docker-compose.yml` deploys editor + sync-server + bake-worker + Postgres + MinIO in < 10 min | S67 |
| Multi-region prep — Tier-2 cuttable per `[strategic ADR-018]` T2.6 | S67 |
| Third-party pen test contract + report | S68 |
| CSP audit: report at `docs/security/csp-audit-2026-Q4.md` | S68 |
| Plugin sandbox audit (independent confirmation no escapes) | S68 |
| RLS audit on Postgres: every table has policy | S68 |
| OAuth2 review: PKCE flow correct; token expiry + refresh handled | S68 |
| `runDependencyAudit`, `runSastScan`, `runHoundDogScan` all clean | S68 |
| SOC2 quarterly access-review automation per SPEC-24 §1.10 | S68 |
| SAML / SCIM mappings table per `[strategic ADR-021]` + SPEC-24 §1.1 | S68 |
| Full bench suite re-run on baseline + production-scale fixtures | S69 |
| 10K wall × 50 level fixture (`tests/fixtures/largest.pryzm`) | S69 |
| `apps/bench/largest-model.ts` confirms < target | S69 |
| Memory profile: no leaks over 4-hour session simulation | S69 |
| DR drill: rollback runbook tested in last DR drill per SPEC-27 §9 | S69 |

### Track B — Browser matrix, a11y, marketing, GA launch (Agent B)

| Item | Sprint |
|---|---|
| Cross-browser CI matrix in GitHub Actions | S70 |
| Visual regression suite per browser (Chrome reference; others diff < 5 px) | S70 |
| Tablet review mode confirmed on iPad Safari | S70 |
| WCAG 2.2 AA audit + remediations | S70 |
| Self-host docker-compose published per SPEC-15 §7 | S70 |
| Self-host migration tooling published per SPEC-27 §7 | S70 |
| PDF-to-BIM public preview launch per `[strategic ADR-029]` | S70 |
| Self-host BYO-key safety cap enforced per SPEC-28 §11 | S70 |
| Legacy `src/lifecycle/` **deleted** per SPEC-27 §4.3 + ADR-030 Part D | S70 |
| `pryzm.com` marketing site + pricing + Stripe checkout | S71 |
| `docs.pryzm.com` consolidation complete | S71 |
| 5-min demo video + 5 case studies | S71 |
| Format v1 frozen per SPEC-26 | S71 |
| `git tag v2.0.0` + release notes | S72 |
| GA launch blog post + press outreach | S72 |
| Production OTel dashboards + alerting + on-call rota | S72 |
| PRYZM 1 sunset confirmation: 90-day window (started S61); migration tool published; final shutdown date | S72 |

### Joint Deliverables

| Item | Sprint |
|---|---|
| Sprint-scoped `[ADR 0014-traa-ssgi-idle-budget]` (final tune) | S69 D1 |
| 3D demo recording (15-min screencast) | S72 D6 |
| `apps/bench/reports/M35-perf.md` | S69 D7 |
| `apps/bench/reports/M36-GA.md` | S72 D5 |
| `docs/post-mortems/PRYZM-2-build.md` | S72 D10 |

---

## §2 Sprint-by-Sprint Detail

---

### S67 — Self-Host Docker Compose + Multi-Region Decision
**Weeks 133–134 (Month 34)**

---

#### Context and Why This Matters

Per the master plan and ADR-012 (self-host minimums), D3 (open self-host) is a binding GA requirement. Customer C3 (large enterprise IT) cannot adopt without this; without C3 adoption the post-GA ARR ramp slips by ~2 quarters.

The Docker Compose stack provisions **everything**: Postgres + MinIO + sync-server + bake-worker + editor (served by api-gateway) + an entry script that initialises schema + creates the first admin user. Per SPEC-15 §7 the `install.sh` one-shot installer wraps the whole flow.

ARM64 + x86_64 multi-arch images ship from S67 D5 onward.

Multi-region decision: per `[strategic ADR-018]` T2.6 default cut for M36; if reverted, EU-West + US-East regional Supabase primaries provisioned per SPEC-24 §1.3 + SPEC-15 §3.1.

---

#### Implementation Detail — `docker-compose.yml`

```yaml
# pryzm-selfhost/docker-compose.yml

version: '3.9'
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: pryzm
      POSTGRES_USER: pryzm
      POSTGRES_PASSWORD_FILE: /run/secrets/postgres_password
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./init-db:/docker-entrypoint-initdb.d
    secrets: [postgres_password]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U pryzm"]
      interval: 5s
      retries: 10

  minio:
    image: minio/minio:RELEASE.2026-01-01T00-00-00Z
    command: server /data --console-address :9001
    environment:
      MINIO_ROOT_USER: pryzm
      MINIO_ROOT_PASSWORD_FILE: /run/secrets/minio_password
    volumes: [minio-data:/data]
    secrets: [minio_password]
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]

  sync-server:
    image: ghcr.io/pryzm/sync-server:2.0.0
    depends_on: { postgres: { condition: service_healthy } }
    environment:
      DATABASE_URL: postgres://pryzm@postgres:5432/pryzm
      LOG_LEVEL: info
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:8080/health"]

  bake-worker:
    image: ghcr.io/pryzm/bake-worker:2.0.0
    depends_on: { postgres: { condition: service_healthy }, minio: { condition: service_healthy } }
    environment:
      DATABASE_URL:    postgres://pryzm@postgres:5432/pryzm
      MINIO_ENDPOINT:  http://minio:9000
      WORKER_CONCURRENCY: '4'

  api-gateway:
    image: ghcr.io/pryzm/api-gateway:2.0.0
    ports: ['3000:3000']
    depends_on: { sync-server: { condition: service_healthy } }
    environment:
      SYNC_WS_URL:     ws://sync-server:8080
      DATABASE_URL:    postgres://pryzm@postgres:5432/pryzm

secrets:
  postgres_password: { file: ./.secrets/postgres_password }
  minio_password:    { file: ./.secrets/minio_password }

volumes:
  postgres-data:
  minio-data:
```

---

#### Implementation Detail — `install.sh`

```bash
#!/usr/bin/env bash
# pryzm-selfhost/install.sh — one-shot installer for Ubuntu/Debian/RHEL.
set -euo pipefail

require() { command -v "$1" >/dev/null || { echo "Missing $1"; exit 1; }; }
require docker; require docker-compose

mkdir -p .secrets
[ -f .secrets/postgres_password ] || openssl rand -hex 24 > .secrets/postgres_password
[ -f .secrets/minio_password    ] || openssl rand -hex 24 > .secrets/minio_password
chmod 600 .secrets/*

[ -f .env ] || cp .env.example .env

docker-compose pull
docker-compose up -d

echo "Waiting for healthchecks (max 5 minutes)..."
timeout 300 bash -c 'until docker-compose ps | grep -q "healthy"; do sleep 2; done'

echo "PRYZM is live at http://localhost:3000"
echo "Default admin credentials in .secrets/admin.txt"
```

---

#### Daily Plan

- **D1**: docker-compose composition; secrets management.
- **D2**: MinIO + Postgres init scripts + healthchecks.
- **D3**: sync-server + bake-worker + editor + api-gateway containers.
- **D4**: install script.
- **D5**: ARM64 build pipeline.
- **D6**: fresh-VM install test (Ubuntu, Debian, RHEL); install-time bench.
- **D7**: docs at `docs.pryzm.com/selfhost/`.
- **D8**: lint.
- **D9**: multi-region decision per `[strategic ADR-018]` T2.6.
- **D10**: demo + buffer.

---

#### Exit Criteria for S67

- Fresh Linux VM → `docker-compose up` → working PRYZM at `localhost:3000` in < 10 minutes.
- ARM64 + x86_64 both working.
- Multi-region decision recorded.

---

### S68 — Security Hardening + SOC2 Automation + SAML/SCIM
**Weeks 135–136 (Month 34–35)**

---

#### Context and Why This Matters

S68 is the security gate of Phase 3D. A third-party pen test runs S68 D1–D2; remediations S68 D3–D8. Per K3-E if a critical finding lacks a 7-day fix path, GA delays by 1 month and the pen test re-runs.

SOC2 quarterly access-review automation per SPEC-24 §1.10 lights up; SAML / SCIM mappings table per `[strategic ADR-021]` + SPEC-24 §1.1 lit for enterprise SSO.

---

#### Daily Plan

- **D1–D2**: pen test (external; founder coordinates).
- **D3**: CSP audit + remediation (CSP report at `docs/security/csp-audit-2026-Q4.md`).
- **D4**: sandbox audit (independent confirmation no escapes).
- **D5**: RLS audit on Postgres: every table has policy; verified test queries.
- **D6**: OAuth2 review: PKCE flow correct; token expiry + refresh handled.
- **D7**: dependency + SAST + HoundDog scans; SOC2 access-review automation.
- **D8**: remediations.
- **D9**: demo + secret-rotation playbook.
- **D10**: buffer.

---

#### Exit Criteria for S68

- Pen test report clean; no critical findings without 7-day fix.
- HoundDog clean; SAST clean; SCA clean.
- CSP gates production traffic; RLS verified.
- SOC2 quarterly access-review automation operational.
- SAML / SCIM mappings table operational for at least 1 enterprise tenant.

---

### S69 — Performance Hardening + DR Drill + Largest Fixture
**Weeks 137–138 (Month 35)**

---

#### Context and Why This Matters

Every NFT target in `08-VISION.md §6` re-benched. Regressions hunted. 10K wall × 50 level fixture (`tests/fixtures/largest.pryzm`) is the production-scale gate. Per K3-F if regression > 10% on any NFT target, halt forward 3D work; root-cause + fix; re-bench.

DR drill: rollback runbook tested in last DR drill per SPEC-27 §9.

---

#### Daily Plan

- **D1**: baseline re-bench.
- **D2**: production-scale fixture creation (`tests/fixtures/largest.pryzm`).
- **D3**: large-model bench.
- **D4**: regression hunting (any > 5% slip).
- **D5**: memory profile + leak hunt over 4-hour session simulation.
- **D6**: DR drill execution (rollback runbook test).
- **D7**: perf doc updates; `apps/bench/reports/M35-perf.md` published.
- **D8**: lint.
- **D9**: demo.
- **D10**: buffer.

---

#### Exit Criteria for S69

- Every NFT target green incl. 10K-wall largest fixture.
- No memory leaks over 4h session.
- DR drill green; rollback runbook validated.

---

### S70 — Browser Matrix + WCAG + Self-Host Publish + PDF-to-BIM Preview + Lifecycle Deletion
**Weeks 139–140 (Month 35–36)**

---

#### Context and Why This Matters

S70 closes the open browser-matrix gap: Chrome 130+, Firefox 132+, Safari 18.4+ (Mac + iPad review mode), Edge — full test suite passes. WCAG 2.2 AA audit complete on critical paths.

Self-host docker-compose **publishes** per SPEC-15 §7. Self-host migration tooling **publishes** per SPEC-27 §7. PDF-to-BIM **public preview launch** per `[strategic ADR-029]` (gating decision per ADR-029 Part E). Self-host BYO-key safety cap enforced per SPEC-28 §11.

Legacy `src/lifecycle/` **deleted** per SPEC-27 §4.3 + ADR-030 Part D — the descriptor-driven hooks from S65 are now the sole lifecycle path.

---

#### Daily Plan

- **D1**: CI matrix wiring.
- **D2**: Firefox-specific fixes.
- **D3**: Safari-specific fixes (WebGPU detection + WebGL2 fallback paths).
- **D4**: Edge confirmation (mostly Chromium).
- **D5**: iPad tablet mode.
- **D6**: a11y audit + remediations.
- **D7**: more a11y remediations.
- **D8**: self-host publish; PDF-to-BIM preview launch; legacy `src/lifecycle/` deletion.
- **D9**: demo.
- **D10**: buffer.

---

#### Exit Criteria for S70

- All 4 browsers pass full test suite.
- Tablet review mode functional.
- WCAG 2.2 AA achieved on critical paths (project hub, editor, inspector, sheet view).
- Self-host docker-compose + migration tooling published.
- PDF-to-BIM public preview launched (gating decision recorded).
- `src/lifecycle/` deleted.

---

### S71 — Marketing Site + Docs Consolidation + Demo + Format Freeze
**Weeks 141–142 (Month 36)**

---

#### Context and Why This Matters

S71 puts the public face on PRYZM 2:

- `pryzm.com` — marketing site (home, features, pricing, customers, blog, signup).
- `docs.pryzm.com` — full docs (consolidates plugin SDK, headless, file format, REST/WS API, self-host, user guide).
- 5-min demo video — recorded, edited, captioned.
- 5 case studies — drawn from beta cohort with permission.
- Pricing page: free / pro / team / enterprise / self-host tiers with Stripe checkout integration.
- Signup flow live; email verification; project hub onboarding.
- SEO: sitemap, robots.txt, Open Graph metadata, structured data.

Format v1 **frozen** per SPEC-26: no schema changes post-S71 except via SPEC-26 v2 (post-GA).

---

#### Daily Plan

- **D1**: site scaffolding + branding.
- **D2**: marketing copy.
- **D3**: pricing + Stripe integration.
- **D4**: docs consolidation.
- **D5**: demo video recording + editing.
- **D6**: case study writeups.
- **D7**: SEO + metadata; format v1 freeze.
- **D8**: launch dry-run.
- **D9**: demo.
- **D10**: buffer.

---

#### Exit Criteria for S71

- All sites live (pryzm.com, docs.pryzm.com).
- Demo video posted.
- Signup works end-to-end; checkout works.
- Format v1 frozen.

---

### S72 — M36 GA LAUNCH GATE
**Weeks 143–144 (Month 36)**

---

#### Context and Why This Matters

PRYZM 2.0.0 tagged. Public launch. Press. Monitoring. Support workflow live. GA blog post. PRYZM 1 sunset announced (90-day migration window — already counting from S61). Launch on a **non-Friday** (per master plan; D7 = Tuesday).

---

#### Daily Plan

- **D1**: final integration sweep.
- **D2**: monitoring + alerting verification.
- **D3**: support workflow + status page.
- **D4**: launch dry-run.
- **D5**: release tag + notes; `apps/bench/reports/M36-GA.md` published.
- **D6**: launch blog post.
- **D7**: **LAUNCH** (Tuesday).
- **D8**: first 24-hour monitoring + response.
- **D9**: 48-hour mark + initial issue triage.
- **D10**: retro + `docs/post-mortems/PRYZM-2-build.md`.

---

## §3 M36 GA Gate — Full Exit Criteria

### Functional

- Every D1–D10 differentiator delivered.
- Every element family + documentation pipeline + multi-user + AI + IFC/DXF/Rhino + component editor (deferred per `[strategic ADR-018]` T2.2 to v2 backlog) functional.
- Plugin SDK 1.0 + marketplace + ≥ 30 first-party plugins + ≥ 5 third-party plugins.
- Public REST + WS + headless + AI APIs documented + rate-limited + OAuth2-authenticated.
- Self-host: fresh `docker-compose up` deploys in < 10 minutes (Linux x86 + ARM).

### Performance

- Every NFT target in `08-VISION.md §6` green.
- 10K wall × 50 level largest fixture confirmed working.
- No memory leaks over 4h session.

### Architectural

- All legacy deleted (`src/legacy/` empty).
- 0 `(window as any)` sites repo-wide.
- 0 non-scheduler rAF.
- 0 THREE imports outside committers.
- 100% OTel coverage on hot paths.

### Quality

- Zero P0 / P1 bugs open.
- Pen test report clean.
- HoundDog scan clean.
- SAST clean.
- WCAG 2.2 AA on critical paths.
- Browser matrix green (Chrome / Firefox / Safari / Edge + iPad).

### Bench (added per gap review; consolidated from PHASE-3-COMPLETION-GA §Gap-Closure)

- `pnpm bench all` green at SPEC §11 Phase rollout requirements for every SPEC.
- `pnpm bench single-frame-owner-audit` green per ADR-023 Part F.
- `pnpm bench webgpu-feature-readiness` green if WebGPU is the default per `[strategic ADR-025]` Part C.
- Editor production bundle has zero `react` symbols (build-time gate per `[strategic ADR-026]` Part C).
- All SPEC-30 §2 four tiers green.
- SOC2 evidence pipeline produces quarterly auto-reports per `[strategic ADR-021]` + ADR-028 Part G.

### GA exit (consolidated)

GA ships only when **all** of:

1. M24 beta gate items elapsed cleanly.
2. Phase 3 rollout above complete.
3. `[strategic ADR-018]` Tier-1 + Tier-2 capacity cuts decided and reflected in scope.
4. Legacy `src/engine/`, `src/lifecycle/`, `src/styles/`, `src/visibility/` all deleted.
5. `pnpm bench all` green for two consecutive weeks.

### Business

- Marketing site live; pricing + checkout functional.
- 5 published case studies.
- ≥ 100 paying users on PRYZM 2.
- PRYZM 1 sunset announced; migration window active; migration tool published.
- Status page live; monitoring + alerting verified.

### Documentation

- `docs.pryzm.com` complete: user guide + plugin SDK + headless + file format + REST/WS API + self-host + accessibility.
- `apps/bench/reports/M36-GA.md` published.
- 5-min demo video posted.
- GA launch blog post live.
- All 72 sprint retros archived in `docs/retros/`.
- 36-month journey post-mortem at `docs/post-mortems/PRYZM-2-build.md`.

---

## §4 Phase 3D Risk Register

| ID | Risk | Likelihood | Impact | Mitigation | Touch sprint |
|---|---|---|---|---|---|
| R3D-01 | Self-host install fails on common Linux distros | Medium | High | Test matrix across Ubuntu/Debian/RHEL/Rocky + ARM64 in S67 | S67 |
| R3D-02 | Pen test reveals critical issue | Medium | Critical | S68 has Days 1–7 reserved; S69 has buffer; if blocking, delay GA by 1 month | S68 |
| R3D-03 | Browser matrix reveals Safari-blocking issue | Medium | High | WebGL2 fallback always present; visual-diff per-browser; iPad early test | S70 |
| R3D-04 | 10K-wall fixture exposes new perf cliff | Medium | High | S69 perf hunting sprint; if missed, scope down largest-fixture target with disclosed ceiling | S69 |
| R3D-05 | Founder burnout in final stretch | High | High | 1-week mandatory rest after S60 (M30); GA launch on a non-Friday; stakeholder support escalation routes ready | M30, M36 |
| R3D-06 | DR drill exposes runbook gap | Medium | High | S69 D6 dedicated to DR drill; remediation immediate; gate on green-on-redo | S69 |
| R3D-07 | PDF-to-BIM accuracy bar not met for preview launch | Medium | Medium | Preview gating per `[strategic ADR-029]` Part E; if not met, preview defers to post-GA | S70 |
| R3D-08 | Multi-region cut reverted late | Low | High | S67 D9 decision; reversal cost = 2 sprints (i.e., GA slips ~M38) | S67 |
| R3D-09 | Marketing site / pricing config error at launch | Low | Medium | Launch dry-run S71 D8; checkout end-to-end test on staging | S71 |
| R3D-10 | First-48-hour traffic exceeds CDN capacity | Medium | Medium | Pre-warm CDN; status page for graceful degradation | S72 |

---

## §5 Phase 3D Kill-Switches

- **K3D-A** (= K3-E) — If at S68 (M35) pen test reveals critical-severity finding without 7-day fix path, delay GA by 1 month and re-run pen test.
- **K3D-B** (= K3-F) — If at S69 (M35) regression > 10% on any NFT target, halt forward 3D work; root-cause + fix; re-bench.
- **K3D-C** (= K3-G) — If at S70 (M35–M36) any browser fails the full test suite, halt GA marketing; either fix or publicly document the unsupported browser.
- **K3D-D** — If at S70 PDF-to-BIM accuracy bar (per `[strategic ADR-029]` Part E) is not met, defer public preview to post-GA; ship under "preview" or full label per ADR-029 Part E gate.

---

## §6 Gap-Closure Subphase — Phase 3D (binding; consolidated)

| Sprint | Gap-closure deliverable | Closes |
|---|---|---|
| **S67** | Multi-region prep — Tier-2 cuttable per `[strategic ADR-018]` T2.6; if not cut, EU-West + US-East regional Supabase primaries provisioned per SPEC-24 §1.3 + SPEC-15 §3.1. | `[strategic ADR-018]`, SPEC-15, SPEC-24 |
| **S68** | SOC2 quarterly access-review automation per SPEC-24 §1.10. SAML / SCIM mappings table per `[strategic ADR-021]` + SPEC-24 §1.1. | `[strategic ADR-021]`, SPEC-24 |
| **S69** | DR drill: rollback runbook tested in last DR drill per SPEC-27 §9. | SPEC-27 |
| **S70** | Self-host docker-compose published per SPEC-15 §7. Self-host migration tooling published per SPEC-27 §7. PDF-to-BIM public preview launch per `[strategic ADR-029]`. Self-host BYO-key safety cap enforced per SPEC-28 §11. Legacy `src/lifecycle/` **deleted** per SPEC-27 §4.3 + ADR-030 Part D. | SPEC-15, SPEC-27, SPEC-28, `[strategic ADR-029]`, ADR-030 |
| **S71** | Final hardening; all SPEC §11 Phase rollout items checked. Format v1 frozen per SPEC-26. | all SPECs |
| **S72** (GA) | All targets green: SPEC-15 §8 perf; SPEC-30 §2 all four tiers; SPEC-26 round-trip; ADR-022 single-frame-owner; `[strategic ADR-026]` zero `react` symbols in editor bundle; ADR-027 formula library frozen at v1; ADR-028 SOC2 evidence audit-trail captured; `[strategic ADR-029]` accuracy bar measured; ADR-030 `plugins/lifecycle/` GA-shipped. PDF-to-BIM ships under "preview" or full label per `[strategic ADR-029]` Part E gate. | all |

---

## §7 What Phase 3D Explicitly Did NOT Do — Post-GA Roadmap Seeds

These are deliberately deferred to post-GA so the M36 launch is achievable:

- **Native mobile authoring app** (NG4 in `08-VISION.md`).
- **CFD / FEM / energy simulation in-editor** (NG3) — these are post-GA plugins.
- **IFC 4.3 advanced features** (per `[strategic ADR-008]`).
- **Single-binary self-host** (after Docker Compose path stable).
- **Multi-region SaaS deployment** (US/EU/APAC failover).
- **SOC 2 / ISO 27001 certification** (post-GA, ~6 months).
- **AI plugin marketplace tier** (revenue-share for AI workflow authors).
- **Real-time co-presence in component editor** (component editor is single-author at GA — and per `[strategic ADR-018]` T2.2 deferred to v2 backlog).
- **PRYZM 1 → PRYZM 2 batch migration tool** (S72 ships per-project migration; batch tool in 90-day window).

---

## §8 Phase 3D → Post-GA Handoff Checklist

Items that must be true on M36 evening after launch:

- [ ] All M36 GA gate criteria signed off.
- [ ] `apps/bench/reports/M36-GA.md` and `docs/post-mortems/PRYZM-2-build.md` published.
- [ ] Production monitoring + alerting verified (test alert fired + acknowledged).
- [ ] Status page live and updating.
- [ ] On-call rota live (founder + agent escalation).
- [ ] PRYZM 1 sunset migration tool published; migration window counter visible to existing users.
- [ ] Beta cohort transitioned to GA pricing tier.
- [ ] First 48-hour monitoring rota staffed.
- [ ] Press / launch announcement traffic monitored; CDN scale-up confirmed.
- [ ] Founder on mandatory 2-week rest by M36 + 1 week.
- [ ] Post-GA roadmap document drafted at `docs/roadmap/post-GA.md` with the §7 items prioritised.

---

*Last updated: 2026-04-27. Owner: Founder + Architecture lead. Conflicts? See Authority note at top. The most external-facing quarter of Phase 3 — every other quarter built; this one ships. The hardest moment is S68 D2 (pen test results); the most consequential is S72 D7 (LAUNCH). Both have explicit kill-switches and contingency plans.*
