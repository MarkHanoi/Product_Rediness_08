# SPEC-10 — Observability (P8, OTel)

| Field | Value |
|---|---|
| Status | Active — normative |
| Version | 1.0 |
| Date | 2026-04-27 |
| Owner | Architecture lead |
| Closes | `CRITICAL-REVIEW-2026-04-27.md §B10` |
| Phases | 1A (OTel scaffold), 1A close (P8 lint warning), 1B (P8 lint error), 1D (M12 alpha dashboard), 3D (full SLO dashboards) |

> P8 — "Observability is shipped, not bolted on" — must not collapse under its own weight. Naïve "span on every function" produces unreadable traces and a giant cost line. This spec defines the **layered span hierarchy**, sampling strategy, cost ceiling, what gets traced vs metriced vs logged, and the SLO dashboards.

---

## §1 The three pillars

| Pillar | Backend | Examples | Cost shape |
|---|---|---|---|
| **Traces** | OpenTelemetry over OTLP → Honeycomb (or Tempo + Grafana) | command lifecycle, kernel ops, sync round-trip | high per event, head-sampled |
| **Metrics** | Prometheus / OTel Metrics | rps, p95 latency, error rate, AI cost/h | aggregated, low cost |
| **Logs** | structured JSON Lines → Loki | start/stop, errors, warnings | high volume, search-only |

Traces are the showpiece (D5: "every operation traceable"). Metrics drive SLO alerts. Logs are the fallback for what the other two missed.

---

## §2 Span hierarchy (closes B10 gap "span-on-every-function will be unreadable")

### §2.1 The four levels

| Level | Sample rate | Examples |
|---|---|---|
| **L0 — Top-level** | 100% | `command.execute`, `ai.proposal.lifecycle`, `view.paint`, `project.load` |
| **L1 — Layer-crossing** | 100% on errors, 1% on success | `kernel.wall.geometry`, `sync.broadcast`, `persistence.event.append` |
| **L2 — Per-element / per-frame** | 0.1% (head sampling) | `kernel.snap`, `renderer.element.draw`, `drawing.classify-edge` |
| **L3 — Inner loops** | 0% (metric only) | per-vertex transforms, per-pixel work — never traced |

### §2.2 Rule of thumb
- A span SHOULD exist when its parent caller is uncertain how long it took.
- A span SHOULD NOT exist when the operation is < 0.1 ms.
- Inner loops emit metrics (counters, histograms) — not spans.

### §2.3 Span attributes — common set
Every span carries:
- `actor.id`, `actor.kind` (`human|ai|system|migration`).
- `project.id`.
- `tenant.id`.
- `pryzm.layer` (L0–L7.5).
- `pryzm.sprint` (build-time injected).
- `result` (`success|error|cancelled`).
- `error.code` (when `result=error`).

Plus per-span specific attributes documented in each subsystem SPEC.

---

## §3 Sampling strategy

### §3.1 Head sampling
- L0 spans: always sampled.
- L1 spans: parent-based; if parent is sampled, child is sampled — keeps traces complete.
- L2 spans: 0.1% baseline; sampled at 100% if any ancestor span has `result=error`.

### §3.2 Tail sampling (cloud, post-collection)
- Honeycomb-side rule: any trace with `error=true` retained in full.
- Any trace with `duration_ms > p99` retained in full.
- Otherwise: 1% retention for L1 + parent.

### §3.3 Per-tenant overrides
- Enterprise tenants can set their sampling rate (1%–100%) for their own traces.
- The sampling decision is deterministic per `(tenantId, traceId)` so they can correlate.

---

## §4 Cost ceiling (closes B10 gap "no cost budget for OTel")

### §4.1 Targets
- p50 cost per active editor: < $0.10/month.
- p95 cost per active editor: < $0.50/month.
- Total observability bill at 1000 paid seats: < $1000/month.

### §4.2 How
- Aggressive metric-vs-trace split (§2).
- Tail sampling (§3.2).
- Drop high-cardinality attributes that don't drive insights (e.g. don't tag spans with `elementId` for L1+ spans — too many uniques; do tag for L0 user-facing actions).
- 7-day retention for L2 traces; 30 days for L0/L1 traces; 90 days for metrics.

### §4.3 Alert
- A weekly Looker / Grafana snapshot of cost per pillar + per tenant; alert at 80% of monthly target.

---

## §5 Required spans by subsystem

Each subsystem SPEC carries its own span catalog. Aggregated:

- L0 Persistence: SPEC-02 §10.
- L1 Stores: per-element subsystem; baseline `store.applyPatch`.
- L2 Command Bus: `command.execute` (L0 span — always).
- L3 Sync: SPEC-03 (translator, broadcast, lock).
- L4 Geometry: SPEC-01 §7.
- L5 Renderer / FrameScheduler: `frame.scheduler.tick`, `renderer.frame.render`.
- L5 Drawing: SPEC-04 §10.
- L6 Plugin Host: SPEC-09 §9.
- L7 Presentation: tool-handler activations only (`ui.tool.activate`).
- L7.5 AI: SPEC-07 §8.
- Spatial: SPEC-06 §9.
- Types: SPEC-05 §9.
- Security: SPEC-08 §10.

CI gate (P8):
- Any new exported function in a `packages/<layer>/` matching the L0/L1 criteria of §2 must have a span by S04 (warning), S08 (error).
- Lint enforces: span name pattern `<subsystem>.<verb>.<noun?>`; required attributes present.

---

## §6 Metrics catalog (always-on, low cost)

### §6.1 Service-wide
- `pryzm.editor.fps` (gauge): rolling p95 FPS per active session.
- `pryzm.editor.idle_cpu_pct` (gauge): rolling 60 s mean.
- `pryzm.command.rate` (counter): per `command_id`.
- `pryzm.command.error.rate` (counter): per `command_id` + `error.code`.
- `pryzm.sync.broadcast.lag_ms` (histogram): per project room.
- `pryzm.ai.cost.usd` (counter): per `tenant_id` + `plugin_id`.
- `pryzm.persistence.event.append.duration_ms` (histogram).
- `pryzm.persistence.chunk.size_bytes` (histogram).
- `pryzm.bake.queue.depth` (gauge): per worker.
- `pryzm.api.request.duration_ms` (histogram): per route.

### §6.2 Per-tenant rollups
- Active editors / day.
- Total events / day.
- Total chunk bytes written / day.
- AI cost / day.
- Errors / day.

---

## §7 SLO dashboards

### §7.1 Editor SLOs
| SLO | Target (M36 GA) | Indicator |
|---|---|---|
| First contentful paint | p95 < 800 ms | `pryzm.editor.fcp_ms` |
| Time to interactive (small project) | p95 < 1.5 s | `pryzm.editor.tti_ms` |
| Frame rate at interaction | p95 ≥ 55 fps | `pryzm.editor.fps` |
| Idle CPU | p95 < 2% | `pryzm.editor.idle_cpu_pct` |
| Command success rate | > 99.5% | `1 - error_rate` |
| Sync round-trip | p95 < 250 ms | `pryzm.sync.broadcast.lag_ms` |

### §7.2 Server SLOs
| SLO | Target | Indicator |
|---|---|---|
| API availability | 99.9% | uptime check |
| Persistence event-append | p95 < 50 ms | metric histogram |
| Bake worker queue depth | p95 < 10 jobs | `pryzm.bake.queue.depth` |
| AI worker error rate | < 1% | computed |

### §7.3 Per-customer SLOs (Enterprise)
- Tenant-scoped views of all of the above.

---

## §8 Logging policy

### §8.1 What logs
- WARN/ERROR lines from any layer.
- Authn/authz events (also in audit log per SPEC-08 §7).
- Plugin crashes (per plugin id).
- Migration runs.

### §8.2 What doesn't log
- DEBUG / INFO from production. These are span attributes or metrics, not logs.
- PII or secrets ever. PII fields are stripped at the structured-logger middleware.

### §8.3 Format
- JSON Lines, one event per line.
- Required keys: `ts`, `level`, `service`, `actor.id`, `tenant.id`, `project.id`, `request.id`, `message`.
- Stack traces in `error.stack`; cause chain preserved.

---

## §9 Alerting

### §9.1 Alert channels
- PagerDuty for paged on-calls (server outages).
- Slack `#pryzm-alerts` for warnings.
- Email digest for weekly trends.

### §9.2 Pages (must wake someone up)
- API availability < 99% for 5 min.
- Sync server p95 > 1000 ms for 10 min.
- Postgres replication lag > 60 s.
- Plugin error rate > 5% for 10 min on any first-party plugin.

### §9.3 Warnings (Slack, no page)
- Cost target approaching 80% of monthly budget.
- New error.code seen for first time.
- p95 SLO breached for 30 min.

---

## §10 Privacy / compliance
- No PII or project-content text in trace attributes (use IDs).
- Project content (drawing primitives, IFC entities) NEVER appears in observability streams.
- Per-region observability backends: EU traffic stays in EU.
- 7/30/90 day retention per pillar (§4.2).

---

## §11 Phase rollout

| Sprint | Deliverable |
|---|---|
| S01 | OTel scaffold; collector running; trace + metric pipelines functional. |
| S04 | P8 lint installed (warning only). |
| S08 | P8 lint flips to error; first-party span coverage at 80%. |
| S22 (Phase 1D) | M12 alpha dashboard live; 6 SLOs computed. |
| S43 | Per-tenant dashboards. |
| S55 | Cost-ceiling alert + weekly snapshot. |
| S72 (Phase 3D, M36 GA) | Full SLO dashboards (§7); pen-test review of observability data flow. |

---

## §12 Cross-references
- Conflict mapping: `CONFLICT-ANALYSIS.md §3.6` (AI cost), §6.4.
- Layer-by-layer: every layer SPEC's "OpenTelemetry instrumentation" section.
- Phases: M12, M24, M36 dashboards.
- Differentiator: D5 (`08-VISION §5`).
