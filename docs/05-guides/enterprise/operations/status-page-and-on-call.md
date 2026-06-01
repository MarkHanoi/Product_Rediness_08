# Status Page + On-Call Runbook

**Date opened**: 2026-04-29 (S72 D3 deliverable)
**Owner**: Founder + Architecture lead
**Source**: phase-doc §S72 D3 (*"support workflow + status page"*) + §8 handoff items 3+4+5+8

This is the runbook for the status page + on-call rota that the
phase-doc §S72 D3 charter calls out and the §8 handoff items 3–5
sign off on. The runbook is in-repo at S72 close; the live
provisioning of the status page (status.pryzm.com / hosted
StatusPage / Better Stack / Cachet / etc.) is operator-side.

---

## §1 Status page

### §1.1 Provisioning (operator-side)

The status page lives at `https://status.pryzm.com` (DNS provisioning
operator-side; suggest CNAME to a hosted provider for the LAUNCH
window; self-hosted Cachet or Atlassian Statuspage are both
acceptable). The provisioning checklist:

1. Register `status.pryzm.com` DNS record.
2. Provision the hosted status page (provider-specific UI).
3. Configure components (one per service):
   - `editor` (front-door, port 3000 → :80 nginx)
   - `api-gateway` (REST + WS surface)
   - `sync-server` (CRDT linearisation)
   - `bake-worker` (incremental bake job queue)
   - `marketplace-api` (plugin marketplace REST)
   - `ai-host` (BYO-key gated)
   - `postgres` (persistence)
   - `minio` (artefact storage)
4. Wire each component to a healthcheck (per `pryzm-selfhost/docker-compose.yml` §F healthcheck table; `/health` for sync-server + bake-worker + api-gateway; `/healthz` for editor; `pg_isready` for postgres; `mc-ready` for minio).
5. Configure incident severities: SEV1 (full outage), SEV2 (single-service degraded), SEV3 (degraded performance), SEV4 (informational).
6. Configure subscriber notifications (email + RSS + webhook for downstream automation).

### §1.2 What goes on the status page (and what doesn't)

- **DOES**: service health (per §1.1 components), scheduled maintenance windows, incident updates with sev + ETA + remediation status.
- **DOES NOT**: customer-data exposure (incident detail without severities lands at `incidents@pryzm.com` not the public status page), pen-test findings (until disclosed), security advisory content (lands at `security@pryzm.com` mailing list).

---

## §2 On-call rota

### §2.1 Rota during 90-day post-LAUNCH window

| Window | Primary on-call | Secondary on-call | Cadence |
|---|---|---|---|
| LAUNCH day (S72 D7 Tuesday) + 24h | Founder | Architecture lead | Active monitoring |
| LAUNCH day +24h to +72h | Architecture lead | Founder | Active monitoring |
| Days 4–14 | Founder + Architecture lead alternating | Other | Daily check-in 09:00 UTC |
| Days 15–30 | Architecture lead | Founder | 3× weekly |
| Days 31–60 | Architecture lead | Founder | Weekly |
| Days 61–90 | Founder + Architecture lead alternating | Other | Weekly |

Rota owners are placeholders pending operator sign-off. Update this
table when the rota is finalised.

### §2.2 Escalation path

1. **SEV1 (full outage)**: Primary on-call paged immediately (PagerDuty / Opsgenie / SMS + phone). Secondary on-call paged at +5 min. Founder notified at +10 min if not already on the page.
2. **SEV2 (single-service degraded)**: Primary on-call paged within 5 min. Secondary at +30 min.
3. **SEV3 (performance degradation)**: Primary on-call notified via Slack/email; response within 1 h.
4. **SEV4 (informational)**: Logged in incident tracker; no page.

### §2.3 Communication channels

- **Internal**: Slack `#on-call` (high-velocity), `#incidents` (status updates).
- **External**: status.pryzm.com (incident updates), `support@pryzm.com` (customer queries), `security@pryzm.com` (security disclosure).
- **Press / launch traffic**: Founder owns; phase-doc §8 item 9 handoff.

---

## §3 Monitoring + alerting

### §3.1 Telemetry surfaces

- OTel scaffolding lands per S65 D7 (region-aware attributes) + S68 D7 (per-service spans + traces). End-to-end OTel coverage measurement is operator-side at provisioning.
- Per-service `/health` endpoint (sync-server + bake-worker + api-gateway): `{ status: 'ok', service: '<svc>', sprint: 'S67', uptimeMs: <ms> }`.
- Editor `/healthz` returning `200 ok` (per `pryzm-selfhost/nginx/editor.conf` server block).
- Postgres + MinIO use upstream healthchecks (`pg_isready` / `mc-ready`).

### §3.2 Alerting thresholds (suggested at LAUNCH; tune from real data)

| Metric | Warning | Critical | Action |
|---|---|---|---|
| Front-door 5xx rate (5-min window) | > 1% | > 5% | Page on-call (SEV2 / SEV1) |
| API p95 latency | > 200 ms | > 500 ms | Page on-call (SEV3 / SEV2) |
| Sync-server WS connection error rate | > 0.5% | > 2% | Page on-call (SEV2 / SEV1) |
| Bake-worker job failure rate (15-min) | > 5% | > 20% | Page on-call (SEV3 / SEV2) |
| Postgres connection pool utilisation | > 70% | > 90% | Page on-call (SEV3 / SEV2) |
| MinIO 5xx rate | > 0.1% | > 1% | Page on-call (SEV2 / SEV1) |
| BYO-key per-call cost > selfHostPerCallCapUsd | warning per call | block per call | Per-call ceiling fires (S70 D8 `SELF_HOST_CAP_EXCEEDED`) |
| K3-F bench gate (any NFT > 10% slip) | n/a (binary) | trip → halt | Halt forward 3D work; root-cause + fix; re-bench (per master-plan §K3-F) |

### §3.3 Test-alert verification (§8 handoff item 3)

Before LAUNCH (S72 D4 launch dry-run):

1. Fire a synthetic SEV3 alert on each service (`/health` returning non-200 for 30 s).
2. Confirm primary on-call receives the page via the configured channel (PagerDuty / SMS).
3. Confirm secondary on-call receives the page at the configured timeout.
4. Confirm the alert auto-resolves when `/health` returns 200 again.
5. Sign off in `docs/05-guides/enterprise/operations/status-page-and-on-call.md` §3.3 with the test date.

---

## §4 Incident response runbook

### §4.1 Incident detection

- Automated: alerting per §3.2 fires.
- Customer-reported: `support@pryzm.com` triages; high-severity reports escalate to on-call within 15 min.
- Status-page subscriber inquiries: routed to `support@pryzm.com`.

### §4.2 Incident handling

1. **Acknowledge**: Primary on-call acknowledges page within target time per §2.2.
2. **Assess**: Identify scope (per-service, per-region, per-customer) within 5 min.
3. **Communicate**: Open status-page incident with sev + initial ETA. Update at minimum every 30 min until resolved.
4. **Mitigate**: Apply runbook (per `docs/archive/pryzm3-internal/runbooks/`). If runbook absent, escalate to secondary on-call + Architecture lead.
5. **Resolve**: Status page updated to "Resolved"; incident retro scheduled within 7 days.
6. **Retro**: Lands in `docs/03-execution/status/post-mortems/<incident-id>.md` per the post-mortem template.

### §4.3 DR-runbook pointer

For data-loss scenarios specifically, see `docs/archive/pryzm3-internal/runbooks/DR-DRILL-RUNBOOK.md` §10 (rollback runbook). DR drill #1 is operator-side carry-forward (S70 D8 / S71 D8 per `docs/03-execution/status/post-mortems/PRYZM-2-build.md` §5 row 7).

---

## §5 Support workflow

The phase-doc §S72 D3 charter pairs status page with "support workflow".
The support workflow at GA:

1. Customer files via `support@pryzm.com` or in-app feedback widget.
2. Triage SLA: 4 business hours for first response.
3. Severity classification:
   - **P0**: data loss, system down, security regression — escalate to on-call within 15 min.
   - **P1**: blocking customer workflow — fix within 7 days.
   - **P2**: non-blocking workflow issue — fix within 30 days.
   - **P3**: feature request — added to `docs/03-execution/plans/post-ga-roadmap.md` re-prioritisation.
4. Communication: customer receives status update at triage + at fix-deploy + at resolution.
5. Disclosure: security-related issues route through `security@pryzm.com` separately; public disclosure follows `docs/04-reference/security/secret-rotation-playbook.md` §4 emergency timeline (1h / 4h / 24h / 7d).

---

## §6 What this runbook does NOT do

1. Does NOT provision the status page (operator-side).
2. Does NOT configure PagerDuty / Opsgenie (operator-side).
3. Does NOT name the rota owners by name (placeholder pending operator sign-off).
4. Does NOT define the SLO commitments to customers (operator-side; depends on contract terms).
5. Does NOT create the DNS records for status.pryzm.com.
6. Does NOT run the test-alert verification (§3.3 is the sign-off checkbox; the actual run is operator-side at S72 D4 launch dry-run).

What it DOES: enumerate the components, the rota structure, the
escalation path, the alert thresholds, and the incident response
flow so the operator-side provisioning is mechanical configuration,
not design decisions.

---

## §7 Cross-references

- phase-doc §S72 D3 + §8 handoff items 3+4+5+8
- ADR-0054 §G (operator-side carry-forward register)
- `docs/03-execution/status/post-mortems/PRYZM-2-build.md` §5 (carry-forward register rows 1+2+3+8)
- `docs/04-reference/security/secret-rotation-playbook.md` §4 (emergency disclosure timeline)
- `docs/archive/pryzm3-internal/runbooks/DR-DRILL-RUNBOOK.md` §10 (DR runbook)
- `pryzm-selfhost/docker-compose.yml` §F (healthcheck table) + `pryzm-selfhost/nginx/editor.conf` (front-door config)

---

*Authored 2026-04-29 at S72 D3. Owner: Founder + Architecture lead.
Live status-page provisioning + PagerDuty configuration + DNS records
are operator-side. Update this runbook when the rota owners + SLOs
are signed off post-LAUNCH.*
