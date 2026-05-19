# ADR-007 — Telemetry Backend

| Field | Value |
|---|---|
| Status | **Accepted** — 2026-04-27 |
| Closes | `05-IMPLEMENTATION-PLAN.md §17` row ADR-007 |
| Required by | Sprint S01 (Phase 1A — P8 OTel CI gate active) |
| Owner | Architecture lead |
| Implementation | `packages/otel/` (SDK wrapper); `apps/otel-collector/` (self-host); Honeycomb account (SaaS). |
| Spec dependency | `SPEC-10-OBSERVABILITY.md`, `08-VISION §3` P8 |

---

## Context

`08-VISION §3` P8 mandates "Every public function in `packages/` and every command in `apps/editor/` emits an OpenTelemetry span." A CI gate enforces this. The decision facing this ADR is **where the spans go** — which backend(s) ingest, store, and visualise them.

Constraints:
- D7 (enterprise self-host) cannot require an external SaaS. Audit-grade trace data must be storable in the customer's own VPC.
- The PRYZM team needs trace inspection without standing up infrastructure on day 1.
- Trace volume at GA: ~5–20k spans/sec across all tenants; bursty during AI batch commits and bake storms.
- Cost ceiling: telemetry must not exceed ~5% of the product's hosting bill at GA.

`05-IMPLEMENTATION-PLAN.md §17` proposed "Honeycomb / self-hosted Tempo / both → Both — self-host primary, Honeycomb option for hosted customers." `10-MASTER-IMPLEMENTATION-PLAN-36M.md` row ADR-007 amended this to "OTel SDK + self-hostable Tempo + Honeycomb dev account." This ADR ratifies the amended position.

---

## Decision

**OpenTelemetry SDK at every emission point; dual-export to (a) self-hostable Grafana Tempo and (b) Honeycomb dev account.**

### Code-level
- `packages/otel/` wraps the OTel JS SDK with PRYZM defaults (resource attributes, sampling, propagation).
- Browser code uses `@opentelemetry/sdk-trace-web` + `@opentelemetry/exporter-trace-otlp-http`.
- Server code uses `@opentelemetry/sdk-node` + the same OTLP HTTP exporter.
- All spans go to a single `apps/otel-collector/` (OpenTelemetry Collector), which fans out to backends.

### Backends
- **SaaS production:**
  - Primary: self-hosted Grafana Tempo (long-term storage in R2).
  - Mirror: Honeycomb (dev/debug account; 7-day retention; sampled at 10% of trace volume).
  - The team uses Honeycomb for fast ad-hoc debugging during Phase 1–2; Tempo is the system-of-record from S22 onward.
- **Self-host (D7 enterprise):**
  - Tempo in the customer's docker-compose (per ADR-012).
  - Honeycomb path is **disabled by default**; enabled only if the customer ships a Honeycomb API key in their config.
  - Customers may also point the collector at their own backend (Datadog, New Relic, Splunk Observability) via OTLP. Support is best-effort, documented in `docs/operations/telemetry-byo.md`.

### Sampling
- Browser: head-based 10% of normal sessions, 100% of error sessions, 100% of any session that opted in via `?diag=1`.
- Server: head-based 100% of error spans, tail-based 5% of normal spans, 100% of slow spans (> p99 latency).
- AI batches and migrations: 100% (low volume, high diagnostic value).

### Resource attributes (always emitted)
`service.name`, `service.version`, `service.instance.id`, `pryzm.tenant.id`, `pryzm.project.id` (when known), `pryzm.actor.id` (when authn'd), `pryzm.layer` (`L0`..`L7.5`), `deployment.environment` (`dev`/`staging`/`prod`/`self-host`).

### Propagation
- W3C traceparent end-to-end: browser → edge → sync-server / bake-worker / ai-worker.
- Y.Doc updates carry `traceparent` in their metadata for cross-client correlation when meaningful.

### CI gate (P8)
- Per package, every exported function listed in `index.ts` must have a matching span declaration in `spans.ts`. Linted by `tools/lint-otel-coverage.ts`. Warning at S04, error at S08.

---

## Consequences

**Positive:**
- D7 (self-host) is unblocked — no external SaaS dependency required.
- The team gets fast iteration via Honeycomb during the build phase without paying for full retention.
- Single SDK + single collector simplifies the developer mental model.
- Customers can bring their own backend without changing PRYZM code.

**Negative:**
- Two backends to monitor in production (Tempo + Honeycomb dev).
- Self-hosted Tempo requires an ops investment (S3-compatible bucket = R2; query layer; alerting).
- Sampling tuning is ongoing; aggressive head-sampling can lose detail on rare bugs (mitigated by tail-sampling on error/slow).

**Mitigation:**
- Tempo runs on the same R2 bucket layout as event chunks (per ADR-003); no new storage primitive.
- A Grafana stack (Tempo + Prometheus + Loki) ships as a single docker-compose file in `apps/observability-stack/` for both PRYZM hosted and D7.

---

## Alternatives considered

### Honeycomb only (SaaS-only)
- Rejected: blocks D7. Cost at full retention is also material at our predicted volume.

### Tempo only
- Rejected: slows the build phase; the team needs a hosted UI from day 1, and standing up a robust query layer in S01 is wasted effort.

### Datadog
- Rejected as default: cost; vendor lock-in; D7 incompatible. Supported as a customer-side BYO backend.

### Custom log-based tracing
- Rejected: rebuilds OTel poorly; loses the broad ecosystem.

### Per-emission-point opt-in (no CI gate)
- Rejected: P8 mandates universal coverage. Without the gate, coverage drifts.

---

## Phase rollout
- S01 — `packages/otel/` SDK wrapper lands; first spans emitted from `packages/wire/`.
- S02 — collector deployed in dev; Honeycomb dev account wired.
- S04 — P8 lint at warning level.
- S08 — P8 lint at error level; Tempo dev instance live.
- S22 (M12 alpha) — Tempo prod instance live in EU-W and US-E; sampling defaults set; on-call dashboard ships.
- S43 — AI batch trace propagation end-to-end.
- S48 (M24 beta) — alerting rules complete (latency, error rate, queue depth).
- S72 (M36 GA) — D7 docker-compose includes the full Grafana stack; runbook documented.
