# C49 — Multi-Region & Sovereignty

> **Stamp**: 2026-06-01 · **Status**: DRAFT
> **Scope**: governs **data residency and multi-region operation** — where each customer's data physically lives, the per-region failover topology, the cross-region replication policy (and its sovereignty constraints), the customer-managed region selection at onboarding, the BYOK + per-region KMS surface, the latency-routing policy, the audit-log of cross-region access, the region-fallback escalation, and the compliance bindings (GDPR EU residency, US federal contract residency, AP regional residency). Codifies the four-region topology PRYZM commits to (EU + US + AP + UK; see §1.2 for nuance), the per-class data-residency matrix, the runtime region-binding (every API request resolves to a region; cross-region calls are explicit + audited), and the customer-facing sovereignty CTA + the documented exception process. **Every customer's data lives in their chosen region; cross-region travel is rare, audited, and customer-consented.**
> **Depends on**: [C08](C08-COLLABORATION-AND-SECURITY.md) (auth tokens are region-scoped), [C13](C13-PROJECT-LIFECYCLE-AND-ISOLATION.md) (project lifecycle binds to region), [C22](C22-PRIVACY-AND-PII-TIER.md) (PII residency rules; GDPR + CCPA compliance), [C23](C23-PROVENANCE-AND-AI-AUDIT.md) (audit trail for cross-region access), [C39](C39-PRICING-AND-PLAN-TIERS.md) (Enterprise tier `data.residency.eu` + `data.residency.us` + `data.residency.ap` entitlements), [C48](C48-BACKUP-AND-DR.md) (per-region backup; secondary stays in same sovereignty), [C41](C41-TELEMETRY-AND-ANALYTICS.md) (per-region analytics warehousing).
> **Sibling**: [C48](C48-BACKUP-AND-DR.md). C48 = "data over time"; C49 = "data over space".
> **Downstream**: Region-aware DNS / CDN routing (Cloudflare / AWS Route 53) · per-region S3 buckets · per-region PostgreSQL instances · per-region Stripe customer records (for tax residency) · per-region AI host endpoints (Anthropic regional endpoints when available) · per-region marketplace mirror · per-region status page · trust page sovereignty section · contracts with regulatory frameworks (UK GDPR, EU GDPR, US Section 508, etc.).
> **Key principles**: **P5** (region-binding schemas L0-pure), **P6** (region-switching is a command, audited), **P8** (every cross-region API call emits a span), **P0.3** (plugin runtime is region-aware — plugins don't get to make uncontrolled cross-region requests).
> **Master plan**: [PRYZM3-MASTER-IMPLEMENTATION-PLAN-2026-05-31.md §14 (Phase 6.4 operational)](../03-execution/plans/master-implementation-plan.md).
> **Audit-source**: [MISSING-CONTRACTS-AUDIT-2026-06-01.md §3.5](../MISSING-CONTRACTS-AUDIT-2026-06-01.md).

---

## §1 — Invariants

### §1.1 — Every customer org is bound to a primary region at creation

When an `Org` is created, a `primaryRegion` is selected — either explicitly by the customer (Enterprise) or auto-derived from sign-up IP geolocation + the customer's stated billing country. The `primaryRegion` is sticky — changing it is a heavy operation requiring data migration (per §1.9). Every API request, every project, every backup, every AI invocation for the org runs in the primary region by default.

The `primaryRegion` value is written to the org record at creation + cannot be modified by routine commands; only `region.migrateOrg` (admin-only, §4.3) changes it.

### §1.2 — The four regions

```
EU   — Frankfurt (eu-central-1) primary; Dublin (eu-west-1) secondary
US   — N. Virginia (us-east-1) primary; Oregon (us-west-2) secondary
AP   — Tokyo (ap-northeast-1) primary; Singapore (ap-southeast-1) secondary
UK   — London (eu-west-2) primary; Ireland (eu-west-1) shared secondary (per §1.5 caveat)
```

UK as a separate region is necessary post-Brexit — the UK has its own data-residency framework (UK GDPR) distinct from EU. UK customers preferring strict UK residency choose UK; UK customers OK with EU residency choose EU. The shared secondary in Ireland is acceptable for both EU and UK customers (Ireland is in both GDPR jurisdictions).

Additional regions (Canada, Australia, Brazil, India, Middle East) are post-DRAFT — added per customer demand + an ADR.

### §1.3 — Per-data-class residency matrix

| Data class | Primary region | Secondary region | Cross-region access |
|---|---|---|---|
| CLASS-1 PROJECT (per [C48](C48-BACKUP-AND-DR.md)) | `primaryRegion` | Same-sovereignty secondary | Only via `region.requestCrossRegionAccess` (audited) |
| CLASS-2 BILLING + AUTH | `primaryRegion` | Same-sovereignty secondary | Stripe is global by necessity; tax records stay in primary |
| CLASS-3 TELEMETRY | `primaryRegion` analytics warehouse | None (single region) | Internal analytics access via the PII bridge (per [C41](C41-TELEMETRY-AND-ANALYTICS.md)) |
| AI host invocations | `primaryRegion` (Anthropic regional endpoint when available; else global with route-via-region) | None | Subject to AI vendor's residency commitments |
| Marketplace artefacts (per [C40](C40-MARKETPLACE-ECONOMICS.md)) | Global mirror (CDN-served) | Global | Public artefacts only — no customer-specific data |
| Plugin runtime (per [C07](C07-PLUGIN-SDK-AND-MARKETPLACE.md)) | `primaryRegion` | None | Plugin sandbox refuses requests to other regions |
| Session tokens (per [C08](C08-COLLABORATION-AND-SECURITY.md)) | `primaryRegion` | None | Token issued per region; cross-region session requires re-auth |

The "same-sovereignty secondary" rule is binding: an EU customer's secondary is EU (Dublin); a US customer's secondary is US (Oregon). PRYZM never cross-sovereignty-replicates without explicit Enterprise contractual override.

### §1.4 — Cross-region access is rare, audited, and consent-gated

Cross-region access for customer data happens in only three documented scenarios:

1. **DR failover** — automatic during a primary-region outage; data restores to the same-sovereignty secondary
2. **Support break-glass** ([C42](C42-CUSTOMER-SUPPORT-TIER.md) §1.5) — an agent in region A accesses a customer's data in region B; the access is logged + the customer notified within 1 hour
3. **Customer-initiated migration** — `region.migrateOrg` (§4.3); the customer signs a written consent (or its programmatic equivalent for self-serve)

Every cross-region API call MUST resolve through `region.crossRegionGate.check()`. Calls that don't go through the gate are a CI failure. The gate validates the auditable rationale, opens an OTel span, writes to [C23](C23-PROVENANCE-AND-AI-AUDIT.md) audit, and notifies the affected customer.

### §1.5 — UK + EU customers MAY choose either; cross-region between them requires explicit choice

UK customers may pick `UK` region (UK-only data residency) or `EU` region (EU data residency). UK customers picking `EU` accept that data may transit through Frankfurt + Dublin. UK customers picking `UK` accept that backup secondary may be in Ireland (the EU). The customer signs off at signup; the choice is sticky.

The contract recognises this is a fine-grained sovereignty decision. The customer-facing flow surfaces the trade-off with specific copy ("If you choose UK, your data stays primarily in London with backup in Dublin. If you choose EU, data may be processed in either Frankfurt or Dublin.").

### §1.6 — Authentication is region-scoped

Auth tokens issued in region A are NOT valid in region B. A user signing in to `eu.pryzm.app` does NOT inherit a session at `us.pryzm.app`. The token includes `iss: 'eu-central-1'`; the API checks token issuer against the resolved region.

A user attempting to access a different region's API receives a 403 with a "wrong region" error + a redirect to the correct region's URL (auto-resolved from the user's org).

Single-customer multi-region (a user belonging to two orgs in different regions) is supported — the user signs in to each region separately. SSO bridging across regions is an Enterprise feature requiring per-region identity-provider setup.

### §1.7 — Region-routed DNS + CDN

The customer-facing entrypoint `pryzm.app` resolves via Cloudflare to the nearest healthy region. The customer's org is encoded in a subdomain or path (e.g. `eu.pryzm.app/<orgSlug>` or `pryzm.app/<region>/<orgSlug>`). The exact URL strategy is decided in §10 OQ-1.

CDN caches public assets (marketing site, status page, marketplace listings) globally. Customer-specific responses are not CDN-cached (per [C08](C08-COLLABORATION-AND-SECURITY.md) auth requirements).

### §1.8 — Latency budget per region

| Operation | Within-region latency budget |
|---|---|
| API GET (cached) | < 50 ms p95 |
| API GET (uncached) | < 200 ms p95 |
| API POST (mutation) | < 300 ms p95 |
| AI invocation | < 1.5 s p95 (per [C09](C09-AI-AND-VISIBILITY-INTENT.md)) |
| File save (10 MB) | < 800 ms p95 (per [C47](C47-FILE-FORMAT-VERSIONING.md) NFT) |
| Live collaboration (CRDT round-trip) | < 100 ms p95 |

A customer accessing a region from a far away physical location (e.g. EU customer travelling to JP) experiences additional network latency that PRYZM cannot eliminate without cross-region replication of their data — which we don't do (per §1.3). The customer-facing copy notes the trade-off ("data sovereignty has a latency cost").

### §1.9 — Customer-initiated migration is a high-friction, audited workflow

When a customer requests to move their org from region A to region B (e.g. EU → UK after corporate restructuring), the process:

1. Customer initiates via `region.migrateOrg` (Enterprise; lower tiers require support escalation)
2. Customer signs a migration consent — explicitly listing the source region, target region, and a 48-hour read-only freeze
3. PRYZM ops schedules the migration (typically 24-48 hours after consent)
4. The migration:
   - Set the org to read-only in source region (write blocked)
   - Snapshot CLASS-1 + CLASS-2 data from source
   - Transfer (encrypted) to target region's primary
   - Verify integrity at target
   - Switch DNS resolution for the org to target region
   - Re-encrypt with target-region KMS key
   - Delete from source after 30-day post-migration retention (allows rollback)

5. Customer is notified at each milestone

Migration timing budget: < 4 days for projects up to 100 GB; longer projects scheduled per their actual size.

### §1.10 — Plugin runtime is region-aware + sandbox-restricted

Plugins (per [C07](C07-PLUGIN-SDK-AND-MARKETPLACE.md)) run in the customer's `primaryRegion`. The plugin sandbox refuses outbound HTTP to non-PRYZM domains by default; whitelisted domains are reviewed at marketplace curation (per [C40](C40-MARKETPLACE-ECONOMICS.md) §1.11).

A plugin that needs to contact an external service in a different region (e.g. a UK plugin calling a UK government API) MUST declare its required external regions; PRYZM's review gates this against the customer's sovereignty constraint. Customers with strict residency can choose to not install such plugins.

### §1.11 — Every cross-region operation emits a span

Per P8:

- `pryzm.region.detected` — `{ orgId, primaryRegion, resolvedFrom: 'org_record' \| 'ip_geo' \| 'enterprise_contract' }` (per session)
- `pryzm.region.crossRegionAccess` — `{ orgId, fromRegion, toRegion, kind: 'dr_failover' \| 'support_breakglass' \| 'customer_migration', authorisedBy }`
- `pryzm.region.migrationStart` — `{ orgId, fromRegion, toRegion, projectCount, byteSize, scheduledAt }`
- `pryzm.region.migrationComplete` — `{ orgId, fromRegion, toRegion, durationMs }`
- `pryzm.region.tokenIssuerMismatch` — `{ orgId, expectedRegion, tokenRegion }`
- `pryzm.region.sovereigntyViolationAttempt` — `{ orgId, expectedRegion, attemptedRegion, blockedAt }` (a serious event — fires SEV-2 if it slips past the gate)

Spans MUST open at the public boundary of `packages/region/`.

### §1.12 — DR failover preserves sovereignty

When the primary region fails (per [C48](C48-BACKUP-AND-DR.md) DR drill scenarios), failover routes customer traffic to the SAME-SOVEREIGNTY secondary. EU customers fail over from Frankfurt → Dublin (both EU). The contract NEVER fails over EU → US even if US has spare capacity.

If the same-sovereignty secondary is also unavailable, the contract DECLINES service rather than violate sovereignty. The status page surfaces this explicitly. Multi-AZ within each region is the in-region resilience.

### §1.13 — Compliance bindings

The region selection drives compliance bindings:

| Region | Bindings |
|---|---|
| EU + UK | GDPR, EU GDPR + UK GDPR; right to access + erase; 30-day DSAR fulfilment per [C22](C22-PRIVACY-AND-PII-TIER.md) |
| US | CCPA, CPRA (CA); CDPA (VA); CPA (CO); state-by-state; SOC 2 Type II; HIPAA NOT applicable |
| AP (JP) | APPI (Japan); JIS Q 27001 ; PIPL not applicable (PIPL = China) |
| (Future CN region) | PIPL; CSL; DSL — out of scope for current contract |

A customer in region X is bound by X's compliance regime; PRYZM upholds the regime as the data processor.

### §1.14 — Trust page sovereignty section

`pryzm.app/trust` carries a sovereignty section listing:

- The 4 regions + secondary placements
- Per-region compliance bindings
- The cross-region access scenarios (§1.4)
- Average frequency of cross-region access (anonymised — "0.3 % of customers per year experience a DR failover")
- Customer's own current region (logged-in view)
- "Request a region migration" CTA + the documentation link

### §1.15 — Discipline-neutrality + jurisdictional honesty

The region matrix MUST NOT vary by customer discipline. Per the C00 governance bar.

The contract explicitly does NOT promise residency in regions PRYZM does not operate (e.g. a customer asking "is my data in Canada?" gets honest "no, your closest region is US" — not a misleading promise).

---

## §2 — Schema (in `packages/schemas/src/region/`)

L0-pure. No I/O, no THREE, no DOM.

### §2.1 — Top-level types

| Schema | Owns |
|---|---|
| `RegionId` | `'EU' \| 'US' \| 'AP' \| 'UK'` (future additions per ADR) |
| `RegionSpec` | `{ id: RegionId, displayName, primaryAWSRegion, secondaryAWSRegion, sovereigntyFramework: ('EU-GDPR' \| 'UK-GDPR' \| 'CCPA' \| 'APPI' \| ...)[], dataCenterCity, supportRotaWindow }` |
| `RegionRegistry` | `Record<RegionId, RegionSpec>` (compile-time constant) |
| `OrgRegionBinding` | `{ orgId, primaryRegion: RegionId, enterprise_data_residency_clause?: string, signedAt, signedBy }` |
| `CrossRegionAccessKind` | `'dr_failover' \| 'support_breakglass' \| 'customer_migration' \| 'audit_query' \| 'admin_override'` |
| `CrossRegionAuditRecord` | `{ id, orgId, fromRegion, toRegion, kind: CrossRegionAccessKind, authorisedBy: UserId \| 'system', recordedAt, reasonHash, customerNotifiedAt? }` |
| `RegionMigrationRequest` | `{ id, orgId, fromRegion, toRegion, requestedAt, consentSignedAt?, scheduledAt?, completedAt?, status: 'requested' \| 'consented' \| 'in_progress' \| 'completed' \| 'cancelled' }` |
| `RegionHealthState` | `{ region: RegionId, status: 'healthy' \| 'degraded' \| 'unavailable', degradedComponents: string[], lastChecked }` |
| `SovereigntyViolationAttempt` | `{ id, orgId, expectedRegion, attemptedRegion, blockedAt, blockingComponent: string }` |
| `TokenIssuer` | branded string — the AWS region code that issued the auth token |

### §2.2 — Field-level constraints

| Field | Constraint |
|---|---|
| `OrgRegionBinding.signedBy` | non-empty UserId; admin-only set |
| `OrgRegionBinding.enterprise_data_residency_clause` | required for Enterprise; optional otherwise |
| `CrossRegionAuditRecord.reasonHash` | 64-char SHA-256 (the reason itself stored in operational logs; hash here) |
| `RegionMigrationRequest.toRegion` | MUST differ from `fromRegion` |
| `RegionHealthState.degradedComponents` | non-empty when `status === 'degraded'` |

### §2.3 — Cross-region routing table

The compile-time routing rule for failover (same-sovereignty matrix from §1.3):

```ts
export const FAILOVER_ROUTES = {
  EU: 'EU',     // EU primary failover stays EU (Frankfurt → Dublin)
  UK: 'UK',     // UK primary failover stays UK (London → Ireland with caveat)
  US: 'US',     // US primary failover stays US (us-east-1 → us-west-2)
  AP: 'AP',     // AP primary failover stays AP (Tokyo → Singapore)
};
```

No entry maps to a different sovereignty; this is the binding invariant.

---

## §3 — Stores

### §3.1 — `RegionStore` (`packages/region/src/store.ts`)

Client + server. Holds the current session's resolved region + the `OrgRegionBinding`. Read-only at runtime; per-org-creation set.

### §3.2 — `CrossRegionAccessLedger` (server-side, `server/region/CrossRegionAccessLedger.ts`)

Server-side, append-only. Every cross-region API call records here.

### §3.3 — `RegionMigrationStore` (server-side, `server/region/RegionMigrationStore.ts`)

Server-side. Holds in-progress + historical `RegionMigrationRequest` records.

### §3.4 — `RegionHealthMonitor` (server-side, `server/region/RegionHealthMonitor.ts`)

Server-side. Per-region health probes + DR-failover decision logic. Consults [C48](C48-BACKUP-AND-DR.md) for the failover triggers.

### §3.5 — Persistence

Server-side stores in PostgreSQL. Each region's PG is the authoritative store for that region's orgs; cross-region access requires the cross-region gate.

### §3.6 — Region resolution pipeline

```
inbound request:
   │
   ▼  parse the URL (subdomain or path)
   │     - extract regionId
   │
   ▼  parse Authorization token
   │     - read iss claim (TokenIssuer)
   │     - if iss != resolved region → emit pryzm.region.tokenIssuerMismatch
   │     - return 403 "wrong region; please sign in to <correct region URL>"
   │
   ▼  resolve the orgId from token
   │     - lookup OrgRegionBinding.primaryRegion
   │     - if primaryRegion != resolved region:
   │           - emit pryzm.region.sovereigntyViolationAttempt
   │           - return 403 "this org belongs to <other region>"
   │
   ▼  proceed to normal request handling
   │
   ▼  if a cross-region operation is needed:
   │     - check region.crossRegionGate.check()
   │     - if not authorised → reject + emit
   │     - if authorised → execute + write CrossRegionAuditRecord
```

---

## §4 — Commands

All commands route through `commandBus` per P6 + [C16](C16-COMMAND-AUTHORING-PROTOCOL.md). All open OTel spans per §1.11.

### §4.1 — Customer-facing

| Command | Effect |
|---|---|
| `region.viewCurrent` | Read-only — show the customer's currently bound region |
| `region.requestMigration` | Customer-initiated migration request (Enterprise; routes via support for Mid-firm and below) |
| `region.signMigrationConsent` | Customer signs the consent for an ongoing migration |
| `region.viewCrossRegionLog` | Read-only — show CrossRegionAuditRecord history for the customer's org (transparency surface) |

### §4.2 — Admin / sales-ops-facing

| Command | Effect |
|---|---|
| `region.assignAtSignup` | Auto-set the primary region at org creation (server-side) |
| `region.declareEnterpriseContract` | Sales-ops attaches a `enterprise_data_residency_clause` to an Enterprise org |
| `region.crossRegionAccessGrant` | Support agent or admin grants a one-time cross-region access (writes to ledger) |
| `region.scheduleMigration` | Ops schedules a customer-consented migration |
| `region.cancelMigration` | Customer or admin cancels a pending migration |
| `region.recordHealthState` | Region health monitor updates state (triggered by health probes) |

### §4.3 — Server-only

| Command | Effect |
|---|---|
| `region.failOver` | Cron / probe-driven — triggers failover from primary to same-sovereignty secondary |
| `region.failOverRecovery` | When primary returns to health, restore traffic |
| `region.aggregateRegionDistribution` | Weekly — analytics over per-region customer distribution |
| `region.auditCrossRegionAccess` | Nightly — review the day's CrossRegionAuditRecord entries for anomalies |
| `region.notifyCustomerOfAccess` | Customer-notification trigger (within 1 h of cross-region access per §1.4) |

---

## §5 — UI

### §5.1 — Region selection at signup (Enterprise)

`apps/docs-site/src/signup/enterprise/` — Enterprise customers see an explicit region selector with:

- The 4 regions + compliance bindings
- A "I'm not sure" CTA → wizard that asks about regulatory + customer-location preferences + recommends a region
- The choice is recorded + signed (a clickwrap)

Solo + Studio + Mid-firm customers do NOT see the selector; their region is IP-derived. Mid-firm + Enterprise customers may request a region change via `region.requestMigration`.

### §5.2 — Account settings → Region & sovereignty

`apps/editor/src/ui/settings/region/` — every customer can view:

- Current primary region + display name
- Compliance bindings for that region
- Last cross-region access (if any) — with timestamp + kind + "View details" link
- Migration request CTA (Enterprise self-serve; Mid-firm via support)

### §5.3 — Cross-region access notification

When a cross-region access fires, the customer is notified via:

- Email (within 1 h)
- In-product banner (persistent until acknowledged)
- The org-admin's inbox

The notification carries the kind (DR failover / support break-glass / migration), the timestamp, the rough scope ("3 projects affected"), and a CTA to "View access log".

### §5.4 — Wrong-region redirect

When a user hits `us.pryzm.app/foo` but their org is EU, the server returns 403 with a friendly redirect page: "This account belongs to the EU region. [Sign in at eu.pryzm.app →]". No automatic redirect (avoiding token-leak on redirect).

### §5.5 — DR-status with sovereignty context

The `pryzm.app/dr-status` page (per [C48](C48-BACKUP-AND-DR.md) §5.3) carries a per-region status indicator. EU customers see EU + Dublin status; US customers see US + Oregon status.

### §5.6 — Region migration UI

When a migration is in progress, the affected customer sees:

- Editor banner "Migration in progress — Read-only mode" (during the 48-hour freeze)
- Estimated completion time
- A "Cancel migration" CTA (until the data transfer starts; thereafter cancel is destructive + requires support)

### §5.7 — Trust page sovereignty section

Per §1.14 — the public commitment surface.

### §5.8 — Keyboard surface

Standard keyboard accessibility per [C43](C43-ACCESSIBILITY.md). No region-specific keyboard surfaces.

---

## §6 — CI gates

| Gate | Path | What it checks |
|---|---|---|
| `check-cross-region-via-gate` | `tools/ga-gate/check-cross-region-via-gate.ts` | No code path makes a cross-region call without going through `region.crossRegionGate.check()` |
| `check-failover-route-sovereignty` | runtime — schema validator | Every `FAILOVER_ROUTES` entry maps a region to itself or a same-sovereignty region (per §1.3 + §1.12) |
| `check-region-spans` | extends `check-spans.ts` | Every public `packages/region/` boundary function carries an OTel span (per §1.11) |
| `check-region-schemas-pure` | extends schema-purity check | `packages/schemas/src/region/` has zero I/O, zero THREE, zero DOM (per P5) |
| `check-token-issuer-region` | runtime — middleware | Every issued auth token includes `iss` claim with the issuing region; tokens without `iss` rejected |
| `check-no-cross-region-cdn-cache` | runtime — CDN config | CDN does NOT cache responses keyed to customer data across regions |
| `check-org-region-required` | runtime — schema validator | Every `Org` has a non-null `primaryRegion`; org-creation without one rejected |
| `check-migration-consent-window` | runtime — schema validator | Every `RegionMigrationRequest` has `consentSignedAt` within 48 hours before `scheduledAt` |
| `check-cross-region-audit-emit` | runtime — middleware | Every cross-region access emits the audit record before the operation proceeds |
| `check-discipline-neutral-region` | manual review | Region selection logic does not vary by customer discipline (per §1.15) |
| `check-no-direct-store-write` | eslint rule | UI code MUST NOT import `RegionStore` directly for mutation; only via `commandBus` (per P6) |

### §6.2 — Conformance suites

| Suite | Path | Asserts |
|---|---|---|
| Region resolution | `packages/region/__tests__/resolution.test.ts` | Inbound requests resolve to the correct region; wrong-region requests return 403 |
| Cross-region gate | `packages/region/__tests__/cross-region-gate.test.ts` | Calls without the gate's authorisation are blocked; gate authorisations are logged |
| Failover routing | `packages/region/__tests__/failover-routing.test.ts` | DR failover stays within the same sovereignty; never crosses |
| Migration workflow | `server/region/__tests__/migration-workflow.test.ts` | The 4-step migration completes; consent signed; data transferred + verified; source-region cleanup at +30 days |
| Customer notification | `server/region/__tests__/customer-notification.test.ts` | Cross-region access fires email + in-product banner within 1 h |
| Token issuer check | `packages/region/__tests__/token-issuer.test.ts` | A token issued in EU rejected for US API access |
| Sovereignty violation block | `packages/region/__tests__/sovereignty-violation.test.ts` | An attempted cross-sovereignty backup is blocked |
| Plugin region-aware | `packages/region/__tests__/plugin-region.test.ts` | Plugins running in EU cannot make outbound requests to non-EU domains without manifest declaration |

---

## §7 — NFT targets

| NFT | Target | Bench |
|---|---|---|
| Region resolution at request entry | < 5 ms | `region-resolve.bench.ts` (new) |
| Cross-region gate check | < 50 ms (includes audit-log write) | `cross-region-gate.bench.ts` (new) |
| DR failover (region trigger → traffic re-routed) | < 4 h end-to-end (per [C48](C48-BACKUP-AND-DR.md) §1.5) | inherited from C48 DR drill |
| Migration (100 GB project, intra-sovereignty) | < 4 days | `region-migration.bench.ts` (new) |
| Customer notification dispatch | < 1 h | inherited from notification budget |
| Wrong-region redirect serve | < 100 ms | `wrong-region-redirect.bench.ts` (new) |
| Trust-page sovereignty section render | < 500 ms | `trust-sovereignty.bench.ts` (new) |

---

## §8 — Migration plan

### §8.1 — New package `packages/region/`

```
packages/region/
  src/
    index.ts                       — composeRegion() boundary
    store.ts                       — RegionStore
    resolver.ts                    — inbound region resolution
    crossRegionGate.ts             — authorisation gate
    tokenIssuer.ts                 — issuer claim validation
    failoverRouter.ts              — FAILOVER_ROUTES enforcement
    pluginRegionGuard.ts           — plugin sandbox region-awareness
    schemas/                       — re-exports
```

Wired into `composeRuntime()` at L3 (very early — region resolution precedes most downstream work).

### §8.2 — Server-side: `server/region/`

```
server/region/
  CrossRegionAccessLedger.ts       — PG append-only
  RegionMigrationStore.ts          — PG-backed
  RegionHealthMonitor.ts           — health probes
  migrationCoordinator.ts          — 4-step workflow orchestration
  customerNotificationDispatcher.ts — cross-region access alerts
  signupRegionDetector.ts          — IP-geo + customer-stated country
```

### §8.3 — Phased rollout

| Phase | Deliverable | Estimate |
|---|---|---|
| REG-α-1 | `packages/schemas/src/region/` + zod + RegionRegistry | 0.5 wk |
| REG-α-2 | `packages/region/` resolver + RegionStore + tokenIssuer | 0.5 wk |
| REG-α-3 | DNS / CDN routing setup (Cloudflare config) | 1 wk |
| REG-β-1 | Per-region PostgreSQL instances + per-region S3 buckets (4 regions live) | 2 wk |
| REG-β-2 | Cross-region gate + audit ledger | 1 wk |
| REG-β-3 | Wrong-region redirect + token issuer check | 0.5 wk |
| REG-β-4 | Sign-up region assignment (Enterprise selector + IP-geo default) | 1 wk |
| REG-γ-1 | Migration workflow (request, consent, execute, verify, cleanup) | 2 wk |
| REG-γ-2 | DR failover wiring (per [C48](C48-BACKUP-AND-DR.md)) + sovereignty preservation | 1 wk |
| REG-γ-3 | Customer cross-region access notification (email + in-product banner) | 0.5 wk |
| REG-γ-4 | Plugin region-aware sandbox | 0.5 wk |
| REG-δ-1 | Trust page sovereignty section + region settings UI | 0.5 wk |
| REG-δ-2 | CI gates (§6) all green | 0.5 wk |

**Total: ~11.5 wk** (Phase 6.4 — significant infrastructure work).

### §8.4 — Backward compatibility

The product today is single-region (US). The C49 migration brings up EU + UK + AP regions; existing US customers continue to operate in US with no migration. New customer sign-up defaults to IP-geo (typically the closest region); existing customers may opt-in to migration via `region.requestMigration`.

### §8.5 — Test plan

Per [C03](C03-SCHEMAS-COMMANDS-AND-STATE.md) test convention. Region resolution + cross-region gate + failover routing + migration workflow all have unit suites. End-to-end: a fixture EU customer signs up → org bound to EU → editor renders in eu.pryzm.app → an attempt to access via us.pryzm.app returns 403 → DR failover simulation routes EU customer to Dublin (NOT to US) → migration to UK requested → consent signed → data transferred → org now bound to UK.

---

## §9 — What is NOT in this contract

- **Anthropic regional endpoint configuration** — covered by [C09](C09-AI-AND-VISIBILITY-INTENT.md). C49 declares the intent; C09 wires it.
- **Stripe regional account configuration** — covered by [C39](C39-PRICING-AND-PLAN-TIERS.md) + [C40](C40-MARKETPLACE-ECONOMICS.md). Stripe Connect operates globally; PRYZM doesn't operate separate Stripe accounts per region today.
- **Email / SMS sender per region** — out of scope. PRYZM uses a single global email provider (Postmark) + per-region sender-domain branding optional.
- **AI vendor diversification per region** — out of scope. Anthropic is the AI vendor; regional endpoint availability per Anthropic's own roadmap.
- **Telemetry warehouse per region** — covered by [C41](C41-TELEMETRY-AND-ANALYTICS.md). C49 declares per-region warehouse separation; C41 wires it.
- **CN / India / Brazil / Middle East regions** — post-DRAFT additions. Each requires an ADR + a customer-demand signal + a compliance review.
- **Internal team region access** — PRYZM employees may operate from any region; their access to customer data is gated per [C42](C42-CUSTOMER-SUPPORT-TIER.md) break-glass.
- **Regional UI variants** — covered by [C46](C46-I18N-AND-L10N.md). C49 does not specify which locale is displayed in which region.
- **Per-region drawing standards** — covered by [C34](C34-PRINT-AND-DRAWING-STANDARDS.md). Customers in region X are NOT forced to use X's drawing standard; the customer chooses.
- **HIPAA / healthcare compliance** — out of scope. PRYZM does not target healthcare contracts; this would need a separate compliance track.

---

## §10 — Open questions (DRAFT-stage)

1. **URL strategy: subdomain vs path**. Currently undecided between `eu.pryzm.app` (subdomain) and `pryzm.app/eu/` (path). Subdomain is cleaner + simpler cookie isolation; path is fewer DNS records. Trade-off TBD; ADR pending.
2. **CN region demand**. China is a major architecture market but PIPL + GFW compliance is heavy. Should PRYZM commit to a CN region in year 2? Decision depends on enterprise sales pipeline + compliance budget.
3. **Canada as separate region or under US**. Canadian customers prefer Canadian data residency. Currently included in US region; some asking for separate CA region. Trade-off: per-customer demand vs. additional region cost. Defer to operational data.
4. **Cross-region session for one user belonging to two orgs**. §1.6 says SSO bridging is Enterprise. Should there be a "linked accounts" surface for non-Enterprise users with orgs in two regions? Likely yes, but design is non-trivial. Defer.
5. **Marketplace artefact mirroring**. §1.3 says marketplace is global. Some artefacts (e.g. China-specific BIM rule packs) might be region-restricted. Should the marketplace gate downloads by region? Likely no — let the customer decide.
6. **Plugin manifest cross-region declarations**. §1.10 says plugin can declare required external regions. The exact manifest schema + the curation gate need design. Defer.
7. **Customer-initiated migration timing**. §1.9 says 4 days for 100 GB. Larger projects may take longer; is there a customer-facing SLA, or "best effort"?
8. **Audit-log retention**. CrossRegionAccessLedger records are part of [C13](C13-PROJECT-LIFECYCLE-AND-ISOLATION.md) 7-year retention. Sufficient? Or longer for regulator-friendly cases?

---

## §11 — Cross-reference summary

| Contract | Relationship |
|---|---|
| [C03](C03-SCHEMAS-COMMANDS-AND-STATE.md) | P6 — every region mutation through commandBus; schemas L0-pure |
| [C07](C07-PLUGIN-SDK-AND-MARKETPLACE.md) | Plugin sandbox is region-aware |
| [C08](C08-COLLABORATION-AND-SECURITY.md) | Auth tokens region-scoped; CRDT sync is in-region |
| [C09](C09-AI-AND-VISIBILITY-INTENT.md) | AI host endpoint selection per region |
| [C10](C10-PERFORMANCE-AND-OBSERVABILITY.md) | P8 spans for every cross-region operation |
| [C13](C13-PROJECT-LIFECYCLE-AND-ISOLATION.md) | Project lifecycle tied to region; audit retention 7 yrs |
| [C16](C16-COMMAND-AUTHORING-PROTOCOL.md) | All `region.*` commands follow the protocol |
| [C22](C22-PRIVACY-AND-PII-TIER.md) | Per-region compliance regimes (GDPR / CCPA / APPI) |
| [C23](C23-PROVENANCE-AND-AI-AUDIT.md) | Cross-region access audit trail |
| [C39](C39-PRICING-AND-PLAN-TIERS.md) | `data.residency.eu/us/ap` entitlements gate Enterprise selection |
| [C40](C40-MARKETPLACE-ECONOMICS.md) | Plugin region-aware curation + payout routing |
| [C41](C41-TELEMETRY-AND-ANALYTICS.md) | Per-region telemetry warehouse |
| [C42](C42-CUSTOMER-SUPPORT-TIER.md) | Support break-glass cross-region access |
| [C46](C46-I18N-AND-L10N.md) | Locale + region are independent; documented |
| [C48](C48-BACKUP-AND-DR.md) | Sibling — backups respect sovereignty; cross-region failover stays in-sovereignty |

---

*End — C49 Multi-Region & Sovereignty, 2026-06-01 — DRAFT.*
