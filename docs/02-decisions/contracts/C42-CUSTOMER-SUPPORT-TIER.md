# C42 — Customer Support Tier

> **Stamp**: 2026-06-01 · **Status**: DRAFT
> **Scope**: governs **customer + developer support** — the SLAs, escalation paths, tooling, response cadences, and human staffing model for resolving issues raised by paying customers and marketplace developers. Codifies the four support-channel surfaces (in-product help, email, priority email, named CSM), the priority/severity matrix, the first-response and resolution SLAs per plan tier, the escalation chain to engineering, the customer-facing communication standards, the post-mortem cadence for SEV-1 incidents, and the support analytics that feed the in-product trust signals. **One support-tier value** per [C39](C39-PRICING-AND-PLAN-TIERS.md) plan; channel access flows from the entitlement registry, not from per-feature gating.
> **Depends on**: [C08](C08-COLLABORATION-AND-SECURITY.md) (auth + role for support agent access to customer projects), [C10](C10-PERFORMANCE-AND-OBSERVABILITY.md) (operational spans surface incident severity), [C22](C22-PRIVACY-AND-PII-TIER.md) (support agents access PII under audited break-glass), [C23](C23-PROVENANCE-AND-AI-AUDIT.md) (support-agent actions on customer data are audited), [C39](C39-PRICING-AND-PLAN-TIERS.md) (support entitlements gate channel access), [C40](C40-MARKETPLACE-ECONOMICS.md) (developer-side support routing).
> **Sibling**: [C39](C39-PRICING-AND-PLAN-TIERS.md), [C40](C40-MARKETPLACE-ECONOMICS.md).
> **Downstream**: support agent rota · escalation pager · SEV-1 post-mortem retrospective · CSAT / NPS measurement · status page · documentation gap-analysis.
> **Key principles**: **P5** (support-ticket schemas pure), **P6** (every support-ticket state transition via commandBus), **P8** (every SLA breach + every break-glass PII access emits a span).
> **Master plan**: [PRYZM3-MASTER-IMPLEMENTATION-PLAN-2026-05-31.md §12 (Phase 6.2 commerce)](../03-execution/plans/master-implementation-plan.md).
> **Audit-source**: [MISSING-CONTRACTS-AUDIT-2026-06-01.md §3.3](../MISSING-CONTRACTS-AUDIT-2026-06-01.md).

---

## §1 — Invariants

### §1.1 — Four channels, gated by plan tier

The support channel surface is exactly four:

| Channel | Gated by | Hours | Mode |
|---|---|---|---|
| **In-product help** (search docs + AI assistant + community link) | All tiers including unauthenticated visitors | 24 / 7 | self-serve |
| **Email** (`support@pryzm.app`) | Solo + Studio + Mid-firm + Enterprise | business hours (region-dependent) | async |
| **Priority email** (`priority@pryzm.app`) | Mid-firm + Enterprise (via `entitlement: 'support.priority'`) | 24 / 7 | async — 4 h SLA |
| **Named CSM** (Customer Success Manager — dedicated person) | Enterprise (via `entitlement: 'support.named_csm'`) | business hours | sync + async |

A fifth informal channel — public community (forum or Discord — TBD per §10) — is not contracted; it is a goodwill surface. No SLA. Out of scope for this contract.

### §1.2 — Severity tiers + first-response SLAs

Every support ticket carries a `severity` set at intake (customer self-declares; agent may revise on triage):

| Severity | Definition | Mid-firm/Enterprise SLA | Studio SLA | Solo SLA |
|---|---|---|---|---|
| **SEV-1** | Production down for the customer; data loss; security; > 5 users blocked | 1 h first response · 4 h target resolution | 8 h first response | 1 business day |
| **SEV-2** | Significant impairment; workaround possible; < 5 users affected | 4 h first response · 1 business day resolution | 1 business day first response | 2 business days |
| **SEV-3** | Minor bug or how-to; no production impact | 1 business day first response · 5 business days resolution | 2 business days first response | 5 business days |
| **SEV-4** | Feature request / wishlist / general feedback | 5 business days acknowledgement; no resolution SLA | 5 business days acknowledgement | 10 business days acknowledgement |

The Mid-firm/Enterprise rows in the table correspond to the `entitlement: 'support.sla.4h'` and `'support.priority'` keys per [C39](C39-PRICING-AND-PLAN-TIERS.md). Solo + Studio tiers have a single SLA row each, applied across all severities.

### §1.3 — SLA clock starts at customer-submission, NOT triage

The first-response clock starts when the customer submits the ticket (email arrives, in-product chat opens, CSM call request sent). Triage time counts. Hand-offs between agents do NOT pause the clock. The first response (any acknowledgement from a human agent — auto-replies do NOT count) stops the first-response clock.

Resolution clock continues until the ticket transitions to `resolved`. A `waiting_on_customer` pause stops the resolution clock; agent resumption restarts it. The total time spent in `waiting_on_customer` is recorded for SLA-audit purposes.

### §1.4 — Every ticket has a single owning agent

Each ticket has exactly one `assignedAgentId` at any moment. Multiple agents may comment but only the owning agent transitions state. Re-assignment is explicit (`ticket.reassign`); the new agent inherits the SLA clock. "No-owner" is a CI failure on tickets older than 30 min in `assigned` state — the support tooling auto-pages a manager.

### §1.5 — Break-glass PII access is auditable

Per [C22](C22-PRIVACY-AND-PII-TIER.md), customer PII (project content, generated artefacts, AI conversation history, room geometry — anything a customer might consider sensitive) is restricted by default. Support agents access it via a "break-glass" mechanism: `support.requestBreakGlass({ ticketId, scope, justification, durationMin })`.

Every break-glass request:

- Requires a written `justification` ≥ 40 chars (longer than the §1.8 override threshold in [C39](C39-PRICING-AND-PLAN-TIERS.md) — PII access is higher-stakes)
- Auto-expires (default 60 min, max 4 h)
- Notifies the affected customer's org-admin within 1 hour (email + in-product banner)
- Is logged via [C23](C23-PROVENANCE-AND-AI-AUDIT.md) audit trail (the customer can request the audit per their DSAR right)
- Is rate-limited per agent (max 5 active break-glass sessions; > 5 routes through a manager-approval step)

A break-glass session with no recorded agent activity in 10 min auto-closes. Read-only is the default; write access requires a separate elevated break-glass flag + manager approval.

### §1.6 — Every SLA breach emits an alert + a span

Per P8:

- `pryzm.support.sla.breach` — `{ ticketId, severity, clockKind: 'first_response' \| 'resolution', breachedAtMin }`
- `pryzm.support.breakglass.opened` — `{ ticketId, agentId, scope, justification, expiresAt }`
- `pryzm.support.breakglass.closed` — `{ ticketId, agentId, durationMin, writeActions }`
- `pryzm.support.ticket.transition` — `{ ticketId, from, to, byActor }`
- `pryzm.support.csat.recorded` — `{ ticketId, score: 1\|2\|3\|4\|5 }`
- `pryzm.support.sev1.opened` — `{ ticketId, customerId, summary }`
- `pryzm.support.sev1.resolved` — `{ ticketId, customerId, durationMin, rootCause }`

Spans MUST open at the public boundary of `packages/support/`. SEV-1 events double as pager fires + Slack-channel notifications (`#support-sev1`).

### §1.7 — Every SEV-1 has a post-mortem within 5 business days

Every SEV-1 ticket triggers a post-mortem (PMI = Post-Mortem-Initiative) document written to `docs/04-incidents/YYYY-MM-DD-<short>-PMI.md` within 5 business days of resolution. The PMI carries: timeline · impact · root cause · 5-whys · remediation actions · customer comms log · what-went-well / what-went-wrong. The PMI follows [C31](C31-DOCUMENTATION-AUTHORING-PROTOCOL.md) authoring rules.

Aggregate SEV-1 metrics (count, MTTR, repeat-causes) ship in the monthly trust-report (public, redacted per §1.10).

### §1.8 — Status page is the canonical public health signal

`status.pryzm.app` is the canonical public health signal during incidents. Updates cadence during SEV-1:

- First post within 30 min of incident detection
- Update every 30 min until resolved
- Final "All clear" post + a link to the eventual PMI

The status page is owned by the on-call engineer in coordination with the support team. Direct customer comms (email, in-product banner) reference the status page; the page is the single source of truth.

### §1.9 — CSAT + NPS measurement

Every ticket resolution closes with a CSAT survey (1-5 stars) sent ≤ 24 h post-resolution. Response rate target ≥ 30 %; CSAT target ≥ 4.2.

NPS is measured quarterly via in-product survey (TIER-2 telemetry per [C41](C41-TELEMETRY-AND-ANALYTICS.md), opt-in respected). Target NPS ≥ 40 by end-of-year-1, ≥ 50 by end-of-year-2.

Both CSAT and NPS feed the monthly support trust-report; agents are NOT individually-comp'd on these (avoiding the goodhart-failure of agents pressuring customers to rate them well).

### §1.10 — Customer communications standards

Every support response from PRYZM follows three baseline rules:

- **No "we'll look into it"** — every response either (a) acknowledges + provides an ETA, (b) provides a workaround, or (c) escalates with a stated timeline
- **Plain language** — no jargon without definition; no internal product-team slang (no "PRYZM 3" / "C12 issue" leaking to customers)
- **One issue per ticket** — multi-issue threads are split into separate tickets at intake (the agent does it; the customer keeps one master ticket as a thread tracker)

A monthly QA sample (5 % of resolved tickets) is reviewed by a senior agent against these rules; agents who repeatedly miss are coached.

### §1.11 — Developer-side support is a peer surface

Marketplace developers (per [C40](C40-MARKETPLACE-ECONOMICS.md)) receive support via the same tooling but a separate channel: `developer-support@pryzm.app`. SLA is one tier higher than the developer's customer-org plan (a developer on Solo plan gets Studio-equivalent support); established-developers (per [C40 §1.10](C40-MARKETPLACE-ECONOMICS.md)) get Mid-firm-equivalent support.

The reason: developer issues often block customer-facing artefacts; faster developer support reduces customer impact.

### §1.12 — Support tooling is product-grade

Support agents work in a first-party tool (`apps/admin-tools/src/support/`) backed by the same data plane as the customer-facing product. No "shadow CRM" with manual data sync. Helpdesk integration is optional (Zendesk / Linear-tickets) but the canonical ticket lives in the PG-backed `SupportTicketStore`.

Rationale: support-agent context-switching across CRM + product + analytics is a major source of slow first-response. A single-pane tool keeps the agent in flow.

### §1.13 — Discipline-neutrality + jurisdictional fairness

Support SLAs MUST NOT depend on the customer's discipline (architect vs. QS vs. contractor) or the customer's jurisdiction. A US Mid-firm customer and a Japanese Mid-firm customer get the same SLA. Per the C00 governance discipline-neutrality bar.

Hours-of-coverage: business hours support follows a follow-the-sun rota (EU + NA + AP coverage); 24/7 priority email is — by design — equally responsive in every timezone.

### §1.14 — Refund / credit authority

Support agents may issue:

- Refunds up to £200 / $200 / €200 per ticket — no manager approval
- Refunds £200 – £1,000 — manager approval
- Refunds > £1,000 — head-of-support + finance approval

Credits (extending the customer's billing-cycle anchor or adding bonus AI tokens) follow the same thresholds. Every refund / credit is recorded with `reason: string ≥ 16 chars` per [C39](C39-PRICING-AND-PLAN-TIERS.md) override schema.

### §1.15 — Knowledge-base self-serve target

A target of ≥ 60 % of incoming questions resolved without agent involvement (self-serve via docs + AI helper + in-product banners). Measured weekly; misses trigger a docs-gap-analysis review. Self-serve resolution is preferred over agent escalation because (a) customers solve faster and (b) it scales without linear staffing.

---

## §2 — Schema (in `packages/schemas/src/support/`)

L0-pure. No I/O, no THREE, no DOM.

### §2.1 — Top-level types

| Schema | Owns |
|---|---|
| `SupportTicket` | `{ id: TicketId, orgId, userId, source: TicketSource, severity: 'SEV-1' \| 'SEV-2' \| 'SEV-3' \| 'SEV-4', subject, body, state: TicketState, assignedAgentId?: AgentId, slaFirstResponseAt?, slaResolutionAt?, createdAt, firstResponseAt?, resolvedAt?, closedAt?, csatScore?: 1\|2\|3\|4\|5, csatComment? }` |
| `TicketSource` | `'in_product_chat' \| 'email' \| 'priority_email' \| 'csm_call' \| 'api' \| 'phone_callback'` |
| `TicketState` | `'new' \| 'assigned' \| 'in_progress' \| 'waiting_on_customer' \| 'waiting_on_engineering' \| 'resolved' \| 'closed' \| 'reopened'` |
| `TicketComment` | `{ id, ticketId, authorKind: 'agent' \| 'customer' \| 'system', authorId, body, postedAt, internal: boolean }` |
| `BreakGlassSession` | `{ id, ticketId, agentId, scope: BreakGlassScope, justification: string, durationMin: number, openedAt, expiresAt, closedAt?, writeActionCount: number }` |
| `BreakGlassScope` | `'org' \| 'project' \| 'project_readonly'` |
| `RefundOrCredit` | `{ id, ticketId, kind: 'refund' \| 'credit', amountCents: number, currency: ISO4217, reason: string, approvedByAgentId, approvedAt }` (reason ≥ 16 chars) |
| `SLABreach` | `{ id, ticketId, clockKind: 'first_response' \| 'resolution', expectedMin, actualMin, breachAt, severityAtBreach }` |
| `Agent` | `{ id: AgentId, displayName, email, role: 'agent' \| 'senior_agent' \| 'manager' \| 'csm', timezone, languages: ISO639[], skills: string[], onLeave: boolean }` |
| `Rota` | `{ id, periodStart, periodEnd, region: 'EU' \| 'NA' \| 'AP', shiftAssignments: ShiftAssignment[] }` |
| `ShiftAssignment` | `{ rotaId, agentId, startsAt, endsAt, severityCoverage: ('SEV-1'\|'SEV-2'\|'SEV-3'\|'SEV-4')[] }` |
| `PMI` | `{ id, ticketId, draftedBy: AgentId, draftedAt, finalizedAt?, fileLocation: URL, status: 'draft' \| 'finalized' \| 'published' }` |
| `CSATResult` | `{ ticketId, score, comment?, submittedAt }` |
| `KnowledgeBaseQuery` | `{ id, sessionId, userId?, query, suggestionsReturned, suggestionClicked?, resolvedSelfServe: boolean, queriedAt }` |

### §2.2 — Branded IDs

`TicketId`, `AgentId`, `RotaId`, `BreakGlassSessionId`, `RefundOrCreditId`, `SLABreachId`, `PMIId` are branded string IDs per ADR-0001.

### §2.3 — Field-level constraints

| Field | Constraint |
|---|---|
| `SupportTicket.subject` | `length >= 4 AND length <= 200` after trim |
| `SupportTicket.body` | `length >= 10` after trim; max unlimited |
| `BreakGlassSession.justification` | `length >= 40` after trim (per §1.5) |
| `BreakGlassSession.durationMin` | `1 <= n <= 240` (4 h max); default 60 |
| `RefundOrCredit.reason` | `length >= 16` after trim (per §1.14 + [C39](C39-PRICING-AND-PLAN-TIERS.md) override convention) |
| `RefundOrCredit.amountCents` | `integer > 0` |
| `CSATResult.score` | `1 <= n <= 5` |
| `PMI.fileLocation` | matches `docs/04-incidents/YYYY-MM-DD-[a-z0-9-]+-PMI\.md` |

### §2.4 — Foreign keys

| FK | Target | Cascade |
|---|---|---|
| `SupportTicket.orgId` | `Org` | org-delete preserves tickets (compliance retention) |
| `SupportTicket.assignedAgentId` | `Agent` | agent off-boarding triggers `ticket.reassign` to manager queue |
| `BreakGlassSession.ticketId` | `SupportTicket` | ticket-resolution does NOT auto-close active sessions (agent must explicitly close) |
| `PMI.ticketId` | `SupportTicket` | unique 1:1 — at most one PMI per ticket |

### §2.5 — SLA-clock derivation

`slaFirstResponseAt` and `slaResolutionAt` are derived at ticket-create time from the customer's plan tier × severity matrix (§1.2). The schema validator enforces: a Mid-firm SEV-1 ticket created at T = `2026-06-01T10:00:00Z` MUST have `slaFirstResponseAt = T + 1h` and `slaResolutionAt = T + 4h`. Pause time (waiting_on_customer) adds to both clocks.

---

## §3 — Stores

### §3.1 — `SupportTicketStore` (`server/support/SupportTicketStore.ts`)

Server-side. Holds the canonical ticket records + comments + state-transition log. Real-time updates flow via Yjs to the support tooling UI for agents and via standard polling to the customer's in-product ticket view.

### §3.2 — `BreakGlassLedger` (`server/support/BreakGlassLedger.ts`)

Server-side, append-only. Every `BreakGlassSession` open / close / write-action is recorded. Used by the [C23](C23-PROVENANCE-AND-AI-AUDIT.md) audit trail.

### §3.3 — `AgentRotaStore` (`server/support/AgentRotaStore.ts`)

Server-side. Holds the rota across regions; consulted by the auto-assigner when a new ticket arrives.

### §3.4 — `KnowledgeBaseStore` (`server/support/KnowledgeBaseStore.ts`)

Server-side. Index of help-doc snippets + AI helper responses. Queries are recorded for the self-serve resolution metric (§1.15).

### §3.5 — Persistence

All server-side stores persist to PostgreSQL. Tickets + comments + breakglass + refunds are retained per [C13](C13-PROJECT-LIFECYCLE-AND-ISOLATION.md) — 7-year retention for compliance + accounting.

### §3.6 — Ticket flow

```
customer: opens ticket via email / in-product chat / CSM call
   │
   ▼  intake: parse email or capture chat → create SupportTicket
   │     - severity default = customer self-declare (SEV-3 if unset)
   │     - derive slaFirstResponseAt + slaResolutionAt from plan × severity
   │
   ▼  auto-assign: AgentRotaStore.findAvailable(severity, region, skills)
   │     - on miss: ticket stays in 'new' queue; SLA clock ticking
   │     - on hit: state → 'assigned', ticket.assignedAgentId = agent
   │
   ▼  agent acknowledges (state → 'in_progress', firstResponseAt = now)
   │     - stops the first-response clock
   │     - SLA-breach detection runs continuously; cron job alerts on overdue
   │
   ▼  agent investigates: may open BreakGlass, may escalate to engineering
   │     - state may toggle 'waiting_on_customer' (pauses resolution clock)
   │     - state may toggle 'waiting_on_engineering' (escalation; clock keeps running)
   │
   ▼  agent resolves (state → 'resolved', resolvedAt = now)
   │     - issues refund/credit if warranted
   │     - sends CSAT survey at +24h
   │
   ▼  customer either:
   │     - confirms resolution (state → 'closed')
   │     - reopens within 7 days (state → 'reopened'; SLA clock resumes)
   │     - silent → auto-close at +7 days post-resolve
   │
   ▼  if severity == 'SEV-1': trigger PMI drafting (§1.7)
```

---

## §4 — Commands

All commands route through `commandBus` per P6 + [C16](C16-COMMAND-AUTHORING-PROTOCOL.md). All open OTel spans per §1.6.

### §4.1 — Customer-facing

| Command | Effect |
|---|---|
| `support.openTicket` | Create a `SupportTicket` (severity self-declared); routes to intake queue |
| `support.addComment` | Append a `TicketComment` (customer side; internal: false) |
| `support.requestRefund` | Customer-initiated refund request (within 14-day window per [C39](C39-PRICING-AND-PLAN-TIERS.md); routes to support if outside window) |
| `support.submitCSAT` | Submit CSAT score + optional comment for a resolved ticket |
| `support.requestCallback` | Enterprise + Mid-firm — request a CSM call (creates ticket with source: 'csm_call') |
| `support.reopenTicket` | Reopen a resolved ticket within 7 days |

### §4.2 — Agent-facing

| Command | Effect |
|---|---|
| `support.assignTicket` | Self-assign or assign-to-other |
| `support.transitionState` | Move ticket through state machine (assigned → in_progress → waiting_on_customer → … → resolved) |
| `support.setSeverity` | Re-triage severity (revises SLA clocks accordingly) |
| `support.addAgentComment` | Append `TicketComment` (agent side); `internal: true` for private comments |
| `support.issueRefund` | Issue a refund (within agent's authority cap per §1.14) |
| `support.issueCredit` | Issue billing credit (within agent's authority cap per §1.14) |
| `support.requestBreakGlass` | Open a BreakGlassSession with justification + duration + scope |
| `support.closeBreakGlass` | Explicitly close a break-glass session (auto-close at expiry otherwise) |
| `support.escalateToEngineering` | Move to `waiting_on_engineering`; pages on-call engineer |
| `support.draftPMI` | Initiate PMI doc for a resolved SEV-1; writes to `docs/04-incidents/` |
| `support.publishPMI` | Finalise PMI + (if customer opt-in) make public link |

### §4.3 — Manager-facing

| Command | Effect |
|---|---|
| `support.reassignBulk` | Bulk re-assign tickets (agent off-boarding, leave, region shift) |
| `support.approveLargeRefund` | Approve a refund > £200 (per §1.14) |
| `support.approveBreakGlassExtension` | Extend a break-glass session beyond agent's per-agent cap |
| `support.overrideSeverity` | Override agent's severity setting (with reason) |

### §4.4 — Server-only

| Command | Effect |
|---|---|
| `support.runSLABreachCheck` | Cron (every minute) — checks open tickets against SLA clocks; emits `pryzm.support.sla.breach` on overdue + alerts via PagerDuty / Slack |
| `support.autoCloseStale` | Cron (hourly) — auto-closes resolved tickets > 7 days old |
| `support.deliverCSATSurvey` | Cron (every 5 min) — sends CSAT survey at +24h post-resolve |
| `support.snapshotKBQuery` | Nightly — aggregates the day's KB queries for self-serve resolution metric (§1.15) |
| `support.expireBreakGlass` | Cron (every minute) — closes expired break-glass sessions |

---

## §5 — UI

### §5.1 — In-product help (customer)

`apps/editor/src/ui/help/` — accessible via the `?` icon in the editor top bar. Renders:

- Search box (queries the KB; AI helper synthesises an answer with citations)
- "Talk to a human" CTA (gated to plan tier; routes to email or chat depending on plan)
- Recent tickets list (links to ticket history)
- Status link → `status.pryzm.app`

The "Talk to a human" CTA opens an in-product chat for Mid-firm + Enterprise; opens an email composer for Solo + Studio. Per §1.1.

### §5.2 — Customer ticket inbox

`apps/editor/src/ui/help/tickets/` — a per-org inbox of tickets. Renders:

- Open / resolved / closed filters
- Per-ticket: severity badge, SLA-status indicator (green / amber / red), assigned agent display
- Click to open full thread (all non-internal comments visible)

The customer sees agent comments marked `internal: false`; internal team chatter is hidden.

### §5.3 — Agent tooling

`apps/admin-tools/src/support/` — the agent's workplace, gated to `agent`, `senior_agent`, `manager`, or `csm` role. Renders:

- **Queue** — unassigned tickets sorted by SLA urgency
- **My tickets** — assigned tickets sorted by next-action-due
- **Ticket detail** — full thread (incl. internal comments) + agent-only side panel:
  - Customer context (plan tier, signup date, recent activity per [C41](C41-TELEMETRY-AND-ANALYTICS.md))
  - Project context (most-recent project, last error, last AI workflow)
  - Break-glass CTA (gated to manager-approval if scope > project_readonly)
  - Refund/credit CTA (within agent's authority)
  - Escalate-to-engineering CTA
  - Severity + state transition controls
- **Knowledge base composer** — agents can promote a ticket-resolution to the KB

### §5.4 — Status page

Hosted separately (e.g. statuspage.io subdomain `status.pryzm.app`). Components:

- 5 service health indicators (Editor · Sync · AI · Storage · Marketplace)
- Active incidents (with timeline updates)
- Incident history (last 90 days)
- Subscribe-by-email CTA

The status page is NOT in the editor codebase; it's a third-party SaaS. Updates flow via webhook from `support.transitionState` on SEV-1 tickets.

### §5.5 — Trust report (monthly customer-facing)

A monthly trust report (PDF + web) published at `pryzm.app/trust` for the prior month:

- SLA attainment per severity tier (e.g. "98.5 % of SEV-1 tickets met first-response SLA")
- Mean-time-to-resolve aggregates
- CSAT score
- Incident summary + PMI links (per §1.7)
- Roadmap items shipped in the month

Generated by a scheduled job (`support.runMonthlyTrustReport`) reading from `SupportTicketStore` aggregates.

### §5.6 — Keyboard surface (agent tooling)

| Key | Effect |
|---|---|
| `J` / `K` | Navigate queue |
| `Enter` | Open focused ticket |
| `R` | Reply (agent) |
| `I` | Toggle internal-comment mode |
| `S` | Set severity |
| `B` | Open break-glass request |
| `Ctrl + Shift + R` | Open refund modal |
| `Ctrl + E` | Escalate to engineering |

WCAG 2.2 AA per [C43](C43-ACCESSIBILITY.md) — every CTA reachable by keyboard; screen-reader announces ticket severity + SLA status.

---

## §6 — CI gates

| Gate | Path | What it checks |
|---|---|---|
| `check-sla-clock-derivation` | `tools/ga-gate/check-sla-clock-derivation.ts` | Every ticket's `slaFirstResponseAt` + `slaResolutionAt` match the §1.2 matrix for the customer's plan × severity |
| `check-ticket-state-machine` | `tools/ga-gate/check-ticket-state-machine.ts` | `TicketState` transitions follow the documented graph |
| `check-breakglass-justification` | runtime — schema validator | Every `BreakGlassSession.justification.length >= 40` (per §1.5) |
| `check-refund-authority` | runtime — schema validator | `RefundOrCredit.amountCents` within the approving agent's authority (per §1.14) |
| `check-support-spans` | extends `check-spans.ts` | Every public `packages/support/` boundary function carries an OTel span (per §1.6) |
| `check-support-schemas-pure` | extends schema-purity check | `packages/schemas/src/support/` has zero I/O, zero THREE, zero DOM (per P5) |
| `check-sev1-pmi-deadline` | scheduled job + alert | Every resolved SEV-1 has a published PMI within 5 business days; misses alert head-of-support |
| `check-breakglass-rate-limit` | runtime — boundary | Per-agent max 5 active break-glass sessions enforced (per §1.5) |
| `check-no-orphan-tickets` | scheduled job + alert | Tickets in `assigned` state for > 30 min with no agent activity escalate to manager (per §1.4) |
| `check-pmi-naming` | extends `check-doc-naming.ts` | PMI files match `docs/04-incidents/YYYY-MM-DD-<short>-PMI.md` (per §2.3) |
| `check-discipline-neutral-support` | manual review | SLAs + tooling do not differentiate by customer discipline or jurisdiction (per §1.13) |
| `check-no-direct-store-write` | eslint rule | UI code under `apps/admin-tools/src/support/` MUST NOT import `SupportTicketStore` directly for mutation; only via `commandBus` (per P6) |

### §6.2 — Conformance suites

| Suite | Path | Asserts |
|---|---|---|
| SLA matrix | `packages/support/__tests__/sla-matrix.test.ts` | Every (plan × severity) combination produces the documented first-response + resolution clocks |
| State machine | `packages/support/__tests__/state-machine.test.ts` | Every state transition is legal per the graph; illegal transitions rejected |
| Break-glass | `server/support/__tests__/breakglass.test.ts` | Justification ≥ 40 chars enforced; expiry auto-close fires; rate-limit blocks 6th concurrent session |
| Refund authority | `server/support/__tests__/refund-authority.test.ts` | £200 / £1k / unlimited tiers gate correctly; manager approval flow tested |
| Auto-assign | `server/support/__tests__/auto-assign.test.ts` | Rota lookups match severity + region + skills; SEV-1 prefers EU agent if customer is EU; falls back |
| CSAT delivery | `server/support/__tests__/csat-delivery.test.ts` | Survey sent at +24h post-resolve; reminder at +48h; response captured + linked to ticket |
| KB self-serve | `server/support/__tests__/kb-self-serve.test.ts` | Query → suggestions → click + resolved-self-serve flag captured for the §1.15 metric |
| PMI drafting | `server/support/__tests__/pmi-drafting.test.ts` | SEV-1 resolve triggers PMI draft within 1 business day; finalisation by day 5; published with appropriate redactions |

---

## §7 — NFT targets

| NFT | Target | Bench |
|---|---|---|
| Ticket-intake latency (email arrival → ticket created) | < 30 s | `ticket-intake.bench.ts` (new) |
| Auto-assignment latency | < 5 s | `auto-assign.bench.ts` (new) |
| Agent ticket-detail cold mount | < 800 ms | `agent-ticket-cold.bench.ts` (new) |
| Customer ticket-inbox cold mount | < 500 ms | `customer-inbox-cold.bench.ts` (new) |
| Break-glass session open latency | < 1 s | `breakglass-open.bench.ts` (new) |
| SLA-breach-check cron (10k open tickets) | < 30 s | `sla-breach-check.bench.ts` (new) |
| Monthly trust report generation | < 5 min | `monthly-trust-report.bench.ts` (new) |
| KB query → suggestion roundtrip | < 1 s p95 | `kb-query.bench.ts` (new) |

---

## §8 — Migration plan

### §8.1 — New package `packages/support/`

```
packages/support/
  src/
    index.ts                       — composeSupport() boundary
    slaMatrix.ts                   — plan × severity → SLA clocks
    stateMachine.ts                — TicketState transitions
    severityTriage.ts              — auto-set + revise severity
    breakGlass/
      requestor.ts                 — agent-facing open
      expiry.ts                    — auto-close
      audit.ts                     — write to C23 audit
    refund/
      authorityCheck.ts            — §1.14 thresholds
    csat/
      surveyDelivery.ts            — +24h trigger
    pmi/
      drafter.ts                   — SEV-1 PMI scaffolder
    kb/
      queryRouter.ts               — search docs + AI helper
    schemas/                       — re-exports
```

Wired into `composeRuntime()` at L3 (server-side composition). Client-side surfaces a thin `supportClient.ts` for command dispatch.

### §8.2 — Server-side: `server/support/`

```
server/support/
  SupportTicketStore.ts            — PG-backed
  BreakGlassLedger.ts              — PG append-only
  AgentRotaStore.ts                — PG-backed; YAML rota import tool
  KnowledgeBaseStore.ts            — PG-backed; ETL from docs/
  intake/
    emailIntake.ts                 — IMAP / Postmark inbound webhook
    chatIntake.ts                  — in-product chat WS handler
    csmIntake.ts                   — Cal.com / Calendly integration for CSM bookings
  slaCron.ts                       — every-minute breach-check
  csatCron.ts                      — survey scheduler
  trustReportGenerator.ts          — monthly aggregator
  statusPageWebhook.ts             — outbound → statuspage.io
```

### §8.3 — Phased rollout

| Phase | Deliverable | Estimate |
|---|---|---|
| SUP-α-1 | `packages/schemas/src/support/` + zod | 0.5 wk |
| SUP-α-2 | `SupportTicketStore` + PG migrations | 0.5 wk |
| SUP-α-3 | SLA matrix derivation + state machine | 0.5 wk |
| SUP-β-1 | Email intake (Postmark) + auto-assign | 1 wk |
| SUP-β-2 | Agent tooling MVP (queue + ticket detail + comment) | 1.5 wk |
| SUP-β-3 | Break-glass + audit-trail integration | 1 wk |
| SUP-β-4 | Refund / credit + authority gate + Stripe integration | 0.5 wk |
| SUP-γ-1 | SLA-breach cron + pager / Slack integration | 0.5 wk |
| SUP-γ-2 | CSAT survey delivery + capture | 0.3 wk |
| SUP-γ-3 | In-product help surface + ticket-inbox UI | 1.5 wk |
| SUP-γ-4 | Knowledge base + AI helper + self-serve metric | 1.5 wk |
| SUP-γ-5 | PMI drafter + post-incident workflow | 0.5 wk |
| SUP-δ-1 | Monthly trust-report generator + publication | 0.5 wk |
| SUP-δ-2 | Status page + webhook | 0.5 wk |
| SUP-δ-3 | CI gates (§6) all green | 0.5 wk |

**Total: ~11 wk** (within the master plan's Phase 6.2 budget when paralleled with C41).

### §8.4 — Backward compatibility

Today PRYZM uses a single `support@pryzm.app` email + a manual triage spreadsheet. The new tooling is greenfield; old tickets are imported in a one-off batch at SUP-β-2 cutover. No customer-facing migration required.

### §8.5 — Test plan

Per [C03](C03-SCHEMAS-COMMANDS-AND-STATE.md) test convention. Every state transition + every SLA matrix cell + every break-glass scenario + every refund authority threshold has a unit test. End-to-end: an EU Mid-firm customer opens a SEV-1 ticket → auto-assign to EU agent → first response within 1 h → break-glass with manager approval → resolution within 4 h → PMI drafted in 1 day → published in 5 days → CSAT delivered + recorded.

---

## §9 — What is NOT in this contract

- **Customer subscription billing** — [C39](C39-PRICING-AND-PLAN-TIERS.md). Refunds tie back into the billing surface, but the entitlement gating + plan-tier definition belong to C39.
- **Developer payouts** — [C40](C40-MARKETPLACE-ECONOMICS.md). Developer-side support is bridged here (§1.11) but the payout machinery lives in C40.
- **Operational observability spans** — [C10](C10-PERFORMANCE-AND-OBSERVABILITY.md). Spans that detect incidents feed the support workflow; the span machinery itself is C10.
- **Status page hosting** — third-party SaaS (statuspage.io or equivalent); PRYZM's contract is the webhook + the publishing cadence, not the implementation.
- **Sales-led commercial conversations** — Enterprise contract negotiation, custom pricing, RFP responses. Adjacent commercial workflow; not codified here.
- **Onboarding workflows** — initial product onboarding (first-project tutorial, etc.) is a marketing + product surface, not a support surface.
- **Training + certification programmes** — out of scope.
- **Community moderation** (Discord / forum) — out of scope; goodwill surface, no SLA.
- **Customer-success ROI tracking** — Enterprise CSM use; tracked separately in CRM. Not in this contract.
- **Outbound proactive support** — e.g. detecting a customer's project is failing and reaching out before they ticket. Future surface; not in §1 invariants today.

---

## §10 — Open questions (DRAFT-stage)

1. **Community channel choice**. Forum (Discourse) vs. Discord vs. Slack-Connect. Each has different moderation cost + searchability + adoption profile. Decision pending; tracked as a forthcoming ADR. The contract does not depend on this — community is explicitly out of contract.
2. **24/7 staffing model**. Initial assumption: a thin always-on team in NA + EU + AP regions, expanding as ticket volume grows. The exact rota structure (8h shifts per region · follow-the-sun rotation · paid on-call for SEV-1 outside business hours) needs head-of-support input.
3. **AI helper depth**. The KB AI helper today is conceptual; how deeply should it integrate with the editor (e.g. can it execute a workflow on the user's behalf)? Trade-off: power vs. risk of AI doing the wrong thing on a live project.
4. **Refund authority thresholds**. £200 / £1k / unlimited are starting numbers. With real ticket volume + abuse data we'll likely adjust. Open: should the thresholds be regional (e.g. lower in markets with lower median ticket size)?
5. **CSAT response-rate boost**. 30 % target is industry-typical but feels low. Tactics: in-product reminders, lower-friction survey UI, mid-resolution checks. Trade-off: customer-pestering vs. data quality. Defer to a CSAT-focused experiment.
6. **PMI publication policy**. §1.7 says PMIs go to `docs/04-incidents/` with [C31](C31-DOCUMENTATION-AUTHORING-PROTOCOL.md) format. Some PMIs may carry customer-specific detail that can't be public. Process: redact + publish redacted version + keep internal version private. Per-PMI customer-consent step?
7. **Break-glass duration default**. §1.5 says 60 min default, 240 max. Most break-glass investigations finish in < 30 min; should the default be 30? More aggressive auto-close reduces accidental-leak risk but may interrupt agents mid-investigation. Operational data needed.
8. **Agent skill model**. Today an agent is "all-purpose"; auto-assignment doesn't differentiate. As specialisations emerge (IFC expert · AI expert · billing expert · enterprise account expert) a skills field on `Agent` will start to matter for routing. Currently `Agent.skills` exists in schema but is unused by `auto-assign`.

---

## §11 — Cross-reference summary

| Contract | Relationship |
|---|---|
| [C03](C03-SCHEMAS-COMMANDS-AND-STATE.md) | P6 — every support mutation through commandBus; schemas L0-pure |
| [C08](C08-COLLABORATION-AND-SECURITY.md) | Auth + role surface — `agent`, `senior_agent`, `manager`, `csm` roles; break-glass uses [C08] auth tokens |
| [C10](C10-PERFORMANCE-AND-OBSERVABILITY.md) | Operational spans surface incident severity; SLA-breach spans feed pager |
| [C13](C13-PROJECT-LIFECYCLE-AND-ISOLATION.md) | Per-project access via break-glass; ticket retention 7 yrs |
| [C16](C16-COMMAND-AUTHORING-PROTOCOL.md) | All `support.*` commands follow the protocol |
| [C22](C22-PRIVACY-AND-PII-TIER.md) | Break-glass = audited PII access; redaction in PMI publication |
| [C23](C23-PROVENANCE-AND-AI-AUDIT.md) | Audit trail for every agent action on customer data |
| [C31](C31-DOCUMENTATION-AUTHORING-PROTOCOL.md) | PMI authoring follows the documentation protocol |
| [C39](C39-PRICING-AND-PLAN-TIERS.md) | `support.priority`, `support.sla.4h`, `support.named_csm` entitlements gate channels |
| [C40](C40-MARKETPLACE-ECONOMICS.md) | Developer-side support is the peer surface |
| [C41](C41-TELEMETRY-AND-ANALYTICS.md) | NPS + CSAT shipped as TIER-2 telemetry; support analytics through the same backend |
| [C43](C43-ACCESSIBILITY.md) | Agent tooling + customer help surfaces meet WCAG 2.2 AA |
| [C48](C48-BACKUP-AND-DR.md) | Ticket store backup follows the policy |

---

*End — C42 Customer Support Tier, 2026-06-01 — DRAFT.*
