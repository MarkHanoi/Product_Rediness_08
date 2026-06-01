# C41 — Telemetry & Analytics

> **Stamp**: 2026-06-01 · **Status**: DRAFT
> **Scope**: governs **product telemetry, behavioural analytics, and consent capture** — the data PRYZM collects about how customers and developers use the product (NOT the operational observability spans, which are [C10](C10-PERFORMANCE-AND-OBSERVABILITY.md)). Codifies the consent state machine, the event-name taxonomy, the property allowlist, the PII redaction layer, the opt-out propagation across browser sessions and devices, the data-retention schedule, the analytics-export to BI tools, and the in-product surfaces (cookie banner, in-product consent settings, telemetry dashboard for admins). **Separation principle**: observability spans diagnose what the product is doing; telemetry events describe what the user is doing. The two are governed by different contracts and have different consent + retention + access controls.
> **Depends on**: [C08](C08-COLLABORATION-AND-SECURITY.md) (auth + role for admin telemetry views), [C10](C10-PERFORMANCE-AND-OBSERVABILITY.md) (operational spans — siblings, not parent), [C22](C22-PRIVACY-AND-PII-TIER.md) (PII tier — telemetry MUST NOT cross into PII without explicit consent), [C13](C13-PROJECT-LIFECYCLE-AND-ISOLATION.md) (per-project telemetry isolation), [C23](C23-PROVENANCE-AND-AI-AUDIT.md) (AI-output provenance is a sibling; telemetry says "user clicked Generate", provenance says "this artefact was produced by model X").
> **Sibling**: [C10](C10-PERFORMANCE-AND-OBSERVABILITY.md), [C22](C22-PRIVACY-AND-PII-TIER.md), [C23](C23-PROVENANCE-AND-AI-AUDIT.md).
> **Downstream**: product analytics dashboards (PostHog or comparable, depending on §10) · sales weekly review · churn modelling · feature-adoption metrics · marketing-attribution pipeline.
> **Key principles**: **P5** (event schemas pure), **P6** (consent state mutations via commandBus), **P8** (every consent-state change emits an operational span, distinct from the telemetry event itself), **P0.3** (plugin-emitted telemetry is sandbox-validated against the same event taxonomy).
> **Master plan**: [PRYZM3-MASTER-IMPLEMENTATION-PLAN-2026-05-31.md §12 (Phase 6.2 commerce)](../03-execution/plans/master-implementation-plan.md).
> **Audit-source**: [MISSING-CONTRACTS-AUDIT-2026-06-01.md §3.3](../MISSING-CONTRACTS-AUDIT-2026-06-01.md).

---

## §1 — Invariants

### §1.1 — Three event tiers + strict tier-gating

Telemetry events partition into three tiers with progressively stricter consent requirements:

- **TIER-1 ESSENTIAL** — events PRYZM MUST collect to operate the product safely (account creation success/failure, security events, quota threshold crossings, fatal-error events). Consent is implicit at signup; opting out terminates the account.
- **TIER-2 PRODUCT** — events PRYZM uses to improve the product (feature use, panel open/close, command frequency, performance regression detection). Default OPT-IN at signup in EU/UK; default OPT-IN in NA/AP. The user MAY toggle.
- **TIER-3 MARKETING** — events PRYZM uses for marketing attribution (UTM-source landing, conversion funnel, churn signal). Default OFF everywhere; explicit opt-in required.

The event-name registry (§2.5) declares the tier for every event. Emitting a TIER-2 or TIER-3 event from code while the user is opted out raises a `ConsentViolationError` at the telemetry boundary (rejected, never sent).

### §1.2 — Default opt-in matrix is jurisdiction-aware

Default consent at signup depends on the user's detected jurisdiction:

| Jurisdiction | TIER-1 | TIER-2 | TIER-3 |
|---|---|---|---|
| EU/UK (GDPR) | implicit | OPT-IN required | OPT-IN required |
| US (CCPA / CDPA / etc.) | implicit | default ON | OPT-IN required |
| Canada (PIPEDA) | implicit | default ON | OPT-IN required |
| AU/NZ | implicit | default ON | OPT-IN required |
| All other | implicit | default ON | OPT-IN required |

Detection: server-side IP geolocation at signup time (NOT browser locale, which can be fragile). The jurisdiction record persists with the account; subsequent travel does NOT re-evaluate. The user MAY change their own jurisdiction record in settings (e.g. on actual residency change), and the consent defaults re-apply (TIER-2 in EU defaults back to OPT-IN required).

### §1.3 — Consent is a per-user, multi-device-replicated state

Every user has a `ConsentRecord` carrying `{ tier1: 'implicit', tier2: 'opted_in' | 'opted_out' | 'not_decided', tier3: 'opted_in' | 'opted_out' | 'not_decided', decidedAt }`. Updates flow through `consent.set` (§4) and replicate to every active session via the Yjs sync channel within 5 seconds. An opted-out user MUST NOT have TIER-2 events captured on another open session — the client-side event sink consults the local ConsentRecord on every event.

`not_decided` is the legitimate transient state for new EU/UK users who haven't yet seen the consent banner; events are NOT emitted in this state. The product MUST surface the banner within 60 seconds of session start.

### §1.4 — Event-name taxonomy is closed and append-only

Every event name follows the `area.subject.action` pattern: e.g. `editor.wall.created`, `marketplace.artefact.purchased`, `ai.apartment.generation.completed`. The full registry lives in `packages/telemetry/src/eventRegistry.ts`. Adding an event requires a PR with the schema declaration; CI rejects emit calls with names not in the registry.

Renames are forbidden — once an event ships, the name is permanent. To retire an event, mark `deprecated: true` and stop emitting. The dashboard consumer continues to honour old names for at least 12 months (analytics historical-comparison requires this).

### §1.5 — Property allowlist + PII redaction at the boundary

Every event carries a typed property bag with a fixed schema declared in the registry. The boundary layer (`packages/telemetry/src/sink.ts`) validates the bag against the registered schema and drops unknown properties (silent — but logged to ops). PII redaction runs at the SAME boundary: any property matching `*.email`, `*.phone`, `*.userName`, `*.ip`, `*.address`, `*.payment*`, `*.token` is dropped + a counter incremented. Custom code MUST NOT attempt to bypass; an eslint rule + a runtime check both enforce.

The redaction list is intentionally conservative — it is acceptable to drop borderline properties and add them back via explicit opt-in per [C22](C22-PRIVACY-AND-PII-TIER.md) rules.

### §1.6 — User identifiers are pseudonymous in TIER-2 and TIER-3

TIER-2 + TIER-3 events carry `userPseudoId` — a stable HMAC of `userId` with a per-environment key. The mapping `userPseudoId → userId` exists ONLY in a server-side restricted-access database (the "PII bridge", per [C22 §1.5](C22-PRIVACY-AND-PII-TIER.md)). The downstream analytics warehouse (PostHog / BigQuery / etc.) sees only the pseudo-id. Joining to PII requires a separate restricted query through the PII bridge.

TIER-1 events MAY carry the raw `userId` because they relate to account integrity (e.g. a security event MUST reference the actual account).

### §1.7 — Per-project telemetry isolation

A TIER-2 event MUST carry `orgPseudoId` + (when applicable) `projectPseudoId`. The pseudo-ids are HMACs of the underlying `OrgId` / `ProjectId` with the per-environment key. Cross-org join in the analytics warehouse goes through the PII bridge (restricted role). Per [C13](C13-PROJECT-LIFECYCLE-AND-ISOLATION.md) isolation — a customer in tier Studio MUST NOT be inferable across the analytics warehouse without explicit join authorisation.

### §1.8 — Opt-out propagation is < 5 seconds across all devices

When the user opts out via `consent.set`, the new state replicates via Yjs sync to all live sessions within 5 seconds. The client-side event sink reads the latest `ConsentRecord` synchronously on every event emission. There is NO client cache of the previous consent state beyond the next sync tick.

On opt-out, the buffered (not-yet-shipped) event queue is purged client-side, before the next batch ship.

### §1.9 — DSAR ("subject access request") delivery + right-to-erasure cascade

Per [C22](C22-PRIVACY-AND-PII-TIER.md) §1.4 GDPR/CCPA support, a user may request:

- **A complete copy of all events keyed to their `userPseudoId`** — fulfilled within 30 days via `telemetry.exportUserEvents` (§4); CSV + JSON formats.
- **Deletion of all events keyed to their `userPseudoId`** — fulfilled within 90 days. Deletion cascades to the analytics warehouse + the cold backup tier; the PII bridge mapping is removed. After deletion the events are not recoverable.

Deletion is irreversible — UI confirms via a high-friction modal (typed-confirm).

### §1.10 — Cookie + local-storage minimisation

PRYZM uses ONE first-party cookie (`pryzm.session`) for authentication per [C08](C08-COLLABORATION-AND-SECURITY.md). The telemetry layer adds ONE local-storage entry (`pryzm.consent`) caching the consent decision client-side for fast read. No tracking cookies, no third-party cookies, no fingerprinting beacons. The marketing site (`apps/docs-site`) MAY add one analytics cookie (PostHog / equivalent) — gated on TIER-3 consent.

### §1.11 — In-product surfaces MUST surface the opt-out

Every screen that triggers TIER-2 / TIER-3 emission MUST be reachable to a route where the user can toggle their consent: a fixed menu item under Settings → Privacy → Telemetry. The footer of every page (excluding the editor canvas) carries a "Privacy" link to the same page. The opt-out toggle SHALL update the `ConsentRecord` via `consent.set` and replicate.

### §1.12 — Retention schedule

| Tier | Hot (queryable) | Cold (backup-only) | Total retention |
|---|---|---|---|
| TIER-1 ESSENTIAL | 90 days | 7 years | 7 years (legal hold for fraud / accounting) |
| TIER-2 PRODUCT | 18 months | 6 months | 24 months |
| TIER-3 MARKETING | 13 months | 12 months | 25 months |

After total retention, events are deleted from both tiers. Cold-tier deletion follows the [C48](C48-BACKUP-AND-DR.md) backup rotation.

### §1.13 — Sampling for high-volume TIER-2 events

Events tagged `highVolume: true` in the registry are sampled at 1/10 by default to control storage cost. Sampling is documented at the registry; the analytics layer scales counters by the sampling ratio when reporting absolute counts. The list of high-volume events lives in the registry — not in client code — to keep the policy auditable.

Sampling MUST NOT apply to TIER-1 events (every essential event is captured) or to any event marked `sampling: 'always'` (e.g. funnel-critical events used in revenue reporting).

### §1.14 — Discipline-neutrality

Event names and property schemas MUST NOT presume the customer's discipline. Use neutral keys (`element.created` not `wall.created.by_architect`). Discipline tags MAY appear as event properties when the user's project explicitly carries that classification; but the event name itself stays neutral.

### §1.15 — Every consent state change emits an operational span

Per P8 (NOT a telemetry event — telemetry events would be self-referential and a consent-change must record even when the user has opted OUT of TIER-2/TIER-3):

- `pryzm.consent.update` — `{ userId, tier, fromState, toState, source: 'banner' \| 'settings' \| 'jurisdiction_change' \| 'admin_override' }`
- `pryzm.consent.replicateAck` — `{ userId, deviceCount, latencyMs }`
- `pryzm.telemetry.consentViolation` — `{ userPseudoId?, tier, eventName, droppedReason }` (the boundary-level drop trace, fires only on rejected emissions; useful to catch code that didn't ship through the resolver)

Spans MUST open at the public boundary of `packages/telemetry/`.

---

## §2 — Schema (in `packages/schemas/src/telemetry/`)

L0-pure. No I/O, no THREE, no DOM.

### §2.1 — Top-level types

| Schema | Owns |
|---|---|
| `EventTier` | `'TIER-1-ESSENTIAL' \| 'TIER-2-PRODUCT' \| 'TIER-3-MARKETING'` |
| `EventName` | Branded string matching `[a-z][a-z0-9]*\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*`; registered in `eventRegistry.ts` |
| `EventSchema` | `{ name: EventName, tier: EventTier, properties: ZodSchema, sampling?: number, highVolume?: boolean, deprecated?: boolean }` |
| `TelemetryEvent` | `{ name: EventName, tier: EventTier, properties: Record<string, JsonValue>, emittedAt: ISOTimestamp, userPseudoId?: string, orgPseudoId?: string, projectPseudoId?: string, sessionId: string }` |
| `ConsentRecord` | `{ userId: UserId, jurisdiction: ISO3166, tier1: 'implicit', tier2: 'opted_in' \| 'opted_out' \| 'not_decided', tier3: 'opted_in' \| 'opted_out' \| 'not_decided', tier2DecidedAt?, tier3DecidedAt?, lastSyncedAt }` |
| `ConsentSyncEvent` | `{ userId, fromTierStates, toTierStates, source: ConsentSource, occurredAt }` |
| `ConsentSource` | `'banner' \| 'settings' \| 'signup_default' \| 'jurisdiction_change' \| 'admin_override' \| 'dsar_erasure'` |
| `DSARRequest` | `{ id, userId, kind: 'export' \| 'erasure', requestedAt, fulfilledAt?, exportLocation?: URL }` |
| `JurisdictionDefaultMatrix` | `{ jurisdiction: ISO3166, tier2Default: 'opt_in_required' \| 'opted_in', tier3Default: 'opt_in_required' \| 'opted_in' }` (compile-time constant) |
| `PseudoIdMap` | `{ userPseudoId: string, userId: UserId, salt: string, createdAt }` (the PII bridge table) |
| `AnalyticsExport` | `{ id, kind: 'csv' \| 'json' \| 'parquet', tier: EventTier, periodStart, periodEnd, fileLocation: URL, signedAt, retentionExpires }` |

### §2.2 — Event registry shape (excerpt)

```ts
export const EVENT_REGISTRY = {
  // TIER-1 ESSENTIAL
  'auth.user.signed_up':         { tier: 'TIER-1-ESSENTIAL', sampling: 'always',
                                   properties: z.object({ jurisdiction: z.string(), planTier: z.string() }) },
  'auth.user.signed_in':         { tier: 'TIER-1-ESSENTIAL', sampling: 'always',
                                   properties: z.object({ method: z.enum(['password', 'oauth-google', 'oauth-microsoft', 'sso-saml']) }) },
  'security.event.suspicious':   { tier: 'TIER-1-ESSENTIAL', sampling: 'always',
                                   properties: z.object({ kind: z.string(), severity: z.enum(['low','medium','high','critical']) }) },
  'billing.subscription.churn':  { tier: 'TIER-1-ESSENTIAL', sampling: 'always',
                                   properties: z.object({ fromTier: z.string(), reason: z.string().nullable() }) },

  // TIER-2 PRODUCT
  'editor.element.created':      { tier: 'TIER-2-PRODUCT', highVolume: true,
                                   properties: z.object({ elementType: z.string(), via: z.enum(['tool','batch','ai','import']) }) },
  'editor.panel.opened':         { tier: 'TIER-2-PRODUCT',
                                   properties: z.object({ panel: z.string() }) },
  'ai.apartment.generation.completed': { tier: 'TIER-2-PRODUCT',
                                   properties: z.object({ durationMs: z.number(), engine: z.enum(['llm','deterministic-tgl']) }) },
  'ifc.export.completed':        { tier: 'TIER-2-PRODUCT',
                                   properties: z.object({ durationMs: z.number(), elementCount: z.number() }) },
  // … many more

  // TIER-3 MARKETING
  'lp.landing.viewed':           { tier: 'TIER-3-MARKETING',
                                   properties: z.object({ utmSource: z.string().optional(), utmMedium: z.string().optional() }) },
  'lp.signup.completed':         { tier: 'TIER-3-MARKETING',
                                   properties: z.object({ utmSource: z.string().optional() }) },
} as const;
```

### §2.3 — Property-key forbidden patterns (PII redaction list)

The boundary drops any property whose key matches:

- Contains `email`, `phone`, `address`, `name`, `username`, `ip`, `payment`, `card`, `token`, `password`, `key`, `secret`
- Matches the pattern `*Id` for any identifier NOT already in the registered schema (catches accidental leaks of raw ids)

False positives are addressed by adding a registered property to the schema (which exempts it from the regex check).

### §2.4 — Field-level constraints

| Field | Constraint |
|---|---|
| `EventName` | matches `^[a-z][a-z0-9]*\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$` |
| `TelemetryEvent.emittedAt` | ISO-8601 UTC; client SHALL NOT use Date.now() formatted in local TZ |
| `ConsentRecord.jurisdiction` | ISO 3166-1 alpha-2; default is geolocated at signup |
| `userPseudoId` | non-empty; HMAC-SHA256(`userId`, env-key); 64 hex chars |
| `DSARRequest.exportLocation` | signed S3 URL with TTL ≤ 7 days |
| `EventSchema.sampling` | `number ∈ (0, 1]` or `'always'`; only `highVolume: true` events MAY sample < 1 |

### §2.5 — Reserved event-name areas (the first segment)

| Area | Owns |
|---|---|
| `auth.*` | Signup, signin, signout, password reset, SSO |
| `billing.*` | Subscription state transitions, payment, refund, churn |
| `editor.*` | Editor canvas interactions, element creation, tool use, panel open/close |
| `ai.*` | AI workflow start/complete/error, model selection |
| `marketplace.*` | Artefact view, install, purchase, review |
| `ifc.*`, `revit.*`, `dxf.*`, `dwg.*`, `rhino.*`, `pdf.*`, `dwg.*`, `cobie.*` | Interchange formats |
| `cost.*`, `schedule.*`, `clash.*` | 5D / 4D / coordination |
| `lp.*` | Landing-page + marketing funnel (TIER-3) |
| `security.*` | Security / fraud detection events (TIER-1) |
| `plugin.*` | Plugin lifecycle (install / enable / disable / error) |
| `collab.*` | Collaboration session events (join, leave, conflict) |

New areas require an ADR + registry update.

---

## §3 — Stores

### §3.1 — `ConsentStore` (`packages/telemetry/src/consentStore.ts`)

Client-side. Holds the current user's `ConsentRecord`. Reactive — every component reads via `useConsent()`. Replicates via Yjs sync.

### §3.2 — `EventBufferStore` (`packages/telemetry/src/eventBuffer.ts`)

Client-side. Holds events queued for ship (typically 100-event batches every 10s). On consent change to opted_out for a tier, all matching buffered events are purged before the next ship.

### §3.3 — `ConsentLedgerStore` (server-side, `server/telemetry/ConsentLedgerStore.ts`)

Server-side. Append-only `ConsentSyncEvent` log per user — every change is recorded with source and timestamp. Used as the audit trail for GDPR / CCPA compliance.

### §3.4 — `PseudoIdBridgeStore` (server-side, `server/telemetry/PseudoIdBridgeStore.ts`)

Server-side, RESTRICTED ACCESS — only the PII-bridge role (per [C22](C22-PRIVACY-AND-PII-TIER.md)) MAY query. Holds `PseudoIdMap`. Every query is auditable per [C23](C23-PROVENANCE-AND-AI-AUDIT.md).

### §3.5 — Persistence

Server-side stores in PostgreSQL. The events themselves are not stored in PG — they ship to a dedicated analytics backend (PostHog cloud, Clickhouse, or BigQuery — selection in §10). The consent ledger + the PseudoIdMap stay in the operational PG instance.

### §3.6 — Event sink pipeline

```
caller: telemetry.emit('editor.element.created', { elementType: 'wall', via: 'tool' })
   │
   ▼  lookup eventRegistry[name]
   │     - missing → throw EventNotRegisteredError (caller bug)
   │     - deprecated → log + still emit (12-month compat per §1.4)
   │
   ▼  consult ConsentStore for the event's tier
   │     - TIER-1 → always emit
   │     - TIER-2 → emit iff tier2 === 'opted_in'
   │     - TIER-3 → emit iff tier3 === 'opted_in'
   │     - not_decided / opted_out → drop + emit pryzm.telemetry.consentViolation span if surprising
   │
   ▼  validate properties against registered zod schema
   │     - unknown keys dropped (silent + counter)
   │     - PII-pattern keys dropped (logged)
   │
   ▼  sampling check (drop with probability 1 - rate for highVolume events)
   │
   ▼  attach userPseudoId / orgPseudoId / projectPseudoId / sessionId / emittedAt
   │
   ▼  push to EventBufferStore
   │
   ▼  every 10s OR on buffer-full:
   │     - serialise as JSON batch
   │     - ship to analytics backend
   │     - on success: clear buffer
   │     - on failure: keep buffer; retry next tick (exponential backoff)
```

---

## §4 — Commands

All commands route through `commandBus` per P6 + [C16](C16-COMMAND-AUTHORING-PROTOCOL.md). All open OTel spans per §1.15.

### §4.1 — Consent surface

| Command | Effect |
|---|---|
| `consent.set` | Update the user's `ConsentRecord` for a specific tier; replicates via Yjs to all sessions; writes a `ConsentSyncEvent` to the ledger |
| `consent.openBanner` | Surface the consent banner (initial onboarding, or after a 12-month re-prompt) |
| `consent.acceptAll` | Convenience — opt in to TIER-2 + TIER-3 (banner CTA) |
| `consent.rejectAll` | Convenience — opt out of TIER-2 + TIER-3 (banner CTA) |
| `consent.changeJurisdiction` | User-initiated jurisdiction change; re-evaluates defaults |

### §4.2 — DSAR surface (privacy)

| Command | Effect |
|---|---|
| `telemetry.exportUserEvents` | DSAR — generate a CSV/JSON of all events for the user across all tiers; signed-URL delivery |
| `telemetry.eraseUserEvents` | DSAR — schedule erasure across hot + cold tiers (90-day SLA); cascades to PII bridge removal |
| `telemetry.viewMyData` | Read-only — surface a summary of what's stored about the user (privacy-transparency surface) |

### §4.3 — Admin / sales-ops surface

| Command | Effect |
|---|---|
| `telemetry.runExport` | Admin — generate an `AnalyticsExport` for a period + tier + filters; routes through the PII bridge with audit trail |
| `telemetry.flagEventForRedaction` | Sales-ops — mark an event id for post-hoc redaction (e.g. customer-reported PII leak); cascades to analytics warehouse |

### §4.4 — Server-only

| Command | Effect |
|---|---|
| `consent.syncReplicate` | Yjs replication trigger — broadcasts a consent change to all live sessions |
| `consent.reprompt` | 12-month cron — re-surfaces the banner for users whose last decision is > 12 months old (compliance best-practice) |
| `pseudoId.rotate` | Admin — rotate the env-key + remint all `userPseudoId` (used on key compromise) |
| `telemetry.runRetentionSweep` | Daily cron — deletes events past the retention window (§1.12) |

---

## §5 — UI

### §5.1 — Cookie / consent banner

The banner appears within 60 s of first session start for an EU/UK user (or any user whose `ConsentRecord.tier2 === 'not_decided'`). Renders:

- **Headline** — "We respect your privacy."
- **Body** — short copy explaining the three tiers (TIER-1 implicit, TIER-2 opt-in for product improvement, TIER-3 opt-in for marketing)
- **CTAs** — `Accept all` · `Reject all` · `Customize…` (opens settings)
- **Footer link** — "Privacy policy" link (opens marketing site policy page)

The banner blocks emission of TIER-2 + TIER-3 until decided. The editor remains usable underneath (no modal lock).

### §5.2 — Settings → Privacy → Telemetry

A persistent surface in `apps/editor/src/ui/settings/privacy/`. Renders:

- Three toggles (TIER-1 read-only "Essential — required for the product", TIER-2 toggle, TIER-3 toggle) with copy explaining each tier
- Jurisdiction display + change-flow
- "What's stored about me?" CTA (opens `telemetry.viewMyData` result)
- "Download my data" CTA (opens `telemetry.exportUserEvents`)
- "Delete my data" CTA (opens high-friction confirm + `telemetry.eraseUserEvents`)
- "Last decided at" timestamp

The page is reachable from every footer (per §1.11).

### §5.3 — Admin telemetry dashboard

`apps/admin-tools/src/telemetry/` — gated to PRYZM staff with the `analyst` role. Renders:

- Event volume per tier per day
- Consent decision distribution (TIER-2 opt-in rate by jurisdiction; TIER-3 opt-in rate)
- Top events + top property values per event
- Funnel views (signup → first project → first AI generation → first sheet export → first IFC export)
- Sampling-applied counter (so absolute counts can be back-scaled correctly)

The dashboard reads via the PII bridge for any user-id resolution; every query is logged.

### §5.4 — In-product transparency surface

`telemetry.viewMyData` renders a per-tier breakdown: "We've recorded N TIER-1 events (signup, sign-in), N TIER-2 events (product improvement), N TIER-3 events (marketing)." Each tier is expandable to show the top events + last 10 events with timestamps. No raw property values are exposed in the surface (just the event name + the timestamp) to keep the page understandable; full export is via `telemetry.exportUserEvents`.

### §5.5 — Keyboard surface

| Key | Effect |
|---|---|
| `Esc` (in consent banner) | Treated as "Reject all" (no dark pattern of dismiss = accept) |
| `1` / `2` / `3` (in banner) | Quick-toggle the three CTAs |
| `Ctrl + Shift + ,` | Jump to Settings → Privacy → Telemetry |

WCAG 2.2 AA per [C43](C43-ACCESSIBILITY.md) — banner traps focus, has labeled CTAs, screen-reader announces tier names and consequences.

---

## §6 — CI gates

| Gate | Path | What it checks |
|---|---|---|
| `check-event-registered` | `tools/ga-gate/check-event-registered.ts` | Every `telemetry.emit('name')` call passes a name listed in `eventRegistry.ts` (per §1.4) |
| `check-event-name-pattern` | `tools/ga-gate/check-event-name-pattern.ts` | Every registry entry name matches `area.subject.action` regex (per §2.4) |
| `check-event-no-rename` | `tools/ga-gate/check-event-no-rename.ts` | git-diff fails if a registry entry name is renamed (vs marked `deprecated: true`) (per §1.4) |
| `check-pii-redaction` | `tools/ga-gate/check-pii-redaction.ts` | No registered property name matches the PII forbidden pattern (per §2.3); if it must, an explicit override file lists exceptions with rationale |
| `check-consent-respected` | runtime — sink boundary | Every emitted event is consistent with the current `ConsentRecord` for its tier (per §1.1) |
| `check-tier-1-implicit-only` | runtime — sink boundary | A TIER-1 event MUST NOT depend on tier2 / tier3 consent state (per §1.1) |
| `check-pseudo-id-in-tier-2-and-3` | runtime — sink boundary | Every TIER-2 / TIER-3 event carries `userPseudoId` not raw `userId` (per §1.6) |
| `check-telemetry-spans` | extends `check-spans.ts` | Every public `packages/telemetry/` boundary function carries an OTel span (per §1.15) |
| `check-telemetry-schemas-pure` | extends schema-purity check | `packages/schemas/src/telemetry/` has zero I/O, zero THREE, zero DOM (per P5) |
| `check-pii-bridge-restricted` | `tools/ga-gate/check-pii-bridge-restricted.ts` | No code path outside `server/telemetry/PseudoIdBridgeStore.ts` queries the bridge (per §1.6) |
| `check-banner-within-60s` | E2E — playwright | Consent banner surfaces within 60 s for a fresh EU/UK session (per §1.3) |
| `check-dsar-90d-sla` | scheduled job + alert | `DSARRequest.kind = 'erasure'` records are fulfilled within 90 days; any older fires a hard alert |
| `check-no-direct-store-write` | eslint rule | UI code under `apps/editor/src/ui/settings/privacy/` MUST NOT import `ConsentStore` directly for mutation; only via `commandBus` (per P6) |

### §6.2 — Conformance suites

| Suite | Path | Asserts |
|---|---|---|
| Consent state machine | `packages/telemetry/__tests__/consent-state.test.ts` | Every (jurisdiction × tier × source) tuple produces the documented default + transition |
| Sink-boundary drop | `packages/telemetry/__tests__/sink-boundary.test.ts` | Unknown event names rejected; PII-keyed properties dropped; sampling applied; consent respected |
| Replication latency | `packages/telemetry/__tests__/replication.test.ts` | A `consent.set` on session A propagates to session B within 5 s (Yjs sync) |
| DSAR export | `server/telemetry/__tests__/dsar-export.test.ts` | Export returns every event keyed to the user; signed URL is valid; expiry honoured |
| DSAR erasure | `server/telemetry/__tests__/dsar-erasure.test.ts` | After erasure, no event in hot/cold has the user's pseudo-id; PII bridge row removed |
| Retention sweep | `server/telemetry/__tests__/retention.test.ts` | Events past the tier's retention window are deleted; events within the window are retained |
| Pseudo-id rotation | `server/telemetry/__tests__/pseudo-id-rotate.test.ts` | Rotation re-mints pseudo-ids + the bridge mapping; existing events become unresolvable post-rotation (intentional |
| Banner surface timing | `tests/e2e/consent-banner.spec.ts` | Banner surfaces within 60 s; Esc treated as Reject |

---

## §7 — NFT targets

| NFT | Target | Bench |
|---|---|---|
| `telemetry.emit` boundary | < 0.5 ms | `telemetry-emit.bench.ts` (new) |
| Sink buffer flush (100 events) | < 50 ms (network excluded) | `sink-flush.bench.ts` (new) |
| Consent replication latency | < 5 s p95 | inherited from CRDT-sync budget |
| Banner first-paint | < 100 ms after surfaceTrigger | `banner-paint.bench.ts` (new) |
| Retention sweep job (1B events) | < 4 h | `retention-sweep.bench.ts` (new) |
| DSAR export (1y of 1 user's events) | < 60 s | `dsar-export.bench.ts` (new) |
| DSAR erasure (1y of 1 user's events) | < 24 h end-to-end (hot + cold) | `dsar-erasure.bench.ts` (new) |
| Pseudo-id HMAC compute | < 10 µs per event | inherited from crypto budget |

---

## §8 — Migration plan

### §8.1 — New package `packages/telemetry/`

```
packages/telemetry/
  src/
    index.ts                       — composeTelemetry() boundary
    sink.ts                        — boundary-validating event sink
    consentStore.ts                — client-side ConsentRecord
    eventBuffer.ts                 — queue + ship
    eventRegistry.ts               — the canonical registry (§2.2)
    pseudoIdClient.ts              — client-side pseudo-id resolver (calls server)
    sampling.ts                    — per-event sampling
    redaction.ts                   — PII pattern check
    schemas/                       — re-exports
```

Wired into `composeRuntime()` at L3.

### §8.2 — Server-side: `server/telemetry/`

```
server/telemetry/
  ConsentLedgerStore.ts            — PG append-only ledger
  PseudoIdBridgeStore.ts           — PG, restricted-access
  dsarHandler.ts                   — export + erasure
  retentionSweep.ts                — daily cron
  consentReprompt.ts               — 12-month cron
  analyticsExportAPI.ts            — admin export endpoint
  postHogAdapter.ts (or equivalent) — analytics-backend shipper
```

### §8.3 — Phased rollout

| Phase | Deliverable | Estimate |
|---|---|---|
| TEL-α-1 | `packages/schemas/src/telemetry/` + zod | 0.3 wk |
| TEL-α-2 | `eventRegistry.ts` first cut (~80 events) | 0.5 wk |
| TEL-α-3 | `packages/telemetry/` sink + consent store + event buffer | 0.5 wk |
| TEL-β-1 | Server: ConsentLedgerStore + PseudoIdBridgeStore + sync API | 0.5 wk |
| TEL-β-2 | Analytics adapter (PostHog SDK or equivalent) + ship pipeline | 0.5 wk |
| TEL-β-3 | Cookie banner UI + Settings → Privacy → Telemetry surface | 1 wk |
| TEL-β-4 | DSAR export + erasure + transparency surface | 1 wk |
| TEL-γ-1 | Migrate existing scattered analytics calls to registered events (sweep) | 1.5 wk |
| TEL-γ-2 | Admin telemetry dashboard + funnel views | 1 wk |
| TEL-γ-3 | Retention sweep + pseudo-id rotation tooling | 0.5 wk |
| TEL-δ-1 | CI gates (§6) all green; legacy ad-hoc analytics removed | 0.5 wk |

**Total: ~7.5 wk** (within the master plan's Phase 6.2 budget when paralleled with C42).

### §8.4 — Backward compatibility

Existing ad-hoc analytics (a small scattering of `fetch('/api/analytics', ...)` in the editor today) operates without consent gating in legacy paths. The TEL-γ-1 sweep migrates each site to a registered event; the legacy endpoint is decommissioned at TEL-δ-1.

### §8.5 — Analytics backend selection

Three candidate backends, decision pending §10 OQ-1:

- **PostHog Cloud** — fastest to ship, self-serve UI, EU regional hosting available, requires careful PII-bridge setup
- **Clickhouse + Looker** — self-hosted, max control, higher ops overhead
- **BigQuery + Looker Studio** — Google-cloud-native, fast for ad-hoc; data-residency concerns for EU customers

Recommended path is PostHog with EU-hosted plan; alternative to be confirmed in OQ-1 ADR.

### §8.6 — Test plan

Per [C03](C03-SCHEMAS-COMMANDS-AND-STATE.md) test convention. Every (tier × consent state × event tier) tuple has a unit test. End-to-end: a fixture EU user signs up → banner appears → opts in to TIER-2 only → uses editor → switches jurisdictions to NA → opts in to TIER-3 → DSAR exports → DSAR erases. All assertions check the consent ledger + the analytics backend.

---

## §9 — What is NOT in this contract

- **Operational observability spans** — [C10](C10-PERFORMANCE-AND-OBSERVABILITY.md). Spans diagnose what the product is doing (latency, errors, perf); telemetry events describe what the user is doing.
- **AI provenance** — [C23](C23-PROVENANCE-AND-AI-AUDIT.md). Provenance traces an AI artefact's lineage; telemetry says "the user clicked Generate".
- **Server-side logs** — operational logs are owned by [C10](C10-PERFORMANCE-AND-OBSERVABILITY.md). User-facing telemetry routes through this contract.
- **Cookie consent for the marketing site only** — `apps/docs-site` follows this contract for the TIER-3 marketing cookie; the same banner / consent record. The marketing site MUST NOT use a different consent backend.
- **Customer-facing dashboards of telemetry data** — out of scope. PRYZM admins see the dashboard (§5.3); customers see only their own data via `telemetry.viewMyData` (§5.4).
- **Embedded analytics on customer's own projects** (e.g. "how many people opened my floor plan") — out of scope; that would be a separate analytics product layered on top.
- **A/B testing infrastructure** — A/B tests do emit telemetry events (assignment + observed outcome) but the test-runner machinery (assignment, exposure tracking, rollback) is owned by a separate forthcoming contract (or per-team feature flags via [C10](C10-PERFORMANCE-AND-OBSERVABILITY.md) sampling).
- **Replay / session-recording** — not collected. Heatmaps / mouse-replay / DOM-snapshot tooling is explicitly NOT in scope (PII + bandwidth concerns).
- **Third-party SDKs for marketing automation** (HubSpot, Marketo, Segment ingest, Customer.io) — MAY consume the analytics export but MUST NOT have client-side SDKs in the editor.
- **TLS / transport security** — owned by [C08](C08-COLLABORATION-AND-SECURITY.md).

---

## §10 — Open questions (DRAFT-stage)

1. **Backend selection** — PostHog Cloud (EU-hosted), Clickhouse self-hosted, or BigQuery? Decision affects ops cost, EU data residency story, and DSAR fulfilment latency. Decision needed before TEL-β-2; tracked as an upcoming ADR.
2. **In-EU TIER-2 default**. Should TIER-2 default to `opted_in` even in EU if the events are "strictly necessary for service improvement"? Legal-counsel advice is to default to opt-in required (current §1.2). This is conservative; the alternative is a smaller, well-defined sub-set of TIER-2 that defaults to in even in EU (e.g. "performance-regression detection").
3. **Re-prompt cadence**. §4.4 mentions 12-month re-prompt. ICO guidance suggests 6 months for high-volume marketing consent; for TIER-2 the 12-month is more justifiable. Differentiated cadence per tier?
4. **Pseudo-id collision risk**. HMAC-SHA256 produces 256-bit pseudo-ids — collision-free in practice for any feasible user count. But a downstream analytics tool may truncate to 64-bit; that introduces a 1-in-4B collision risk at 65k users. Worth documenting an explicit "DO NOT TRUNCATE" clause for the analytics backend?
5. **Event-buffer persistence across reload**. Today buffer is in-memory; a force-reload during a long offline session loses events. Should we persist to indexedDB (with consent check on hydration)? Trade-off: more durable analytics vs more local data.
6. **DSAR-erasure of TIER-1 events**. TIER-1 is legally retained for fraud / accounting. Erasure cannot fully delete TIER-1 events (auth events have a 7-year legal hold). The transparency surface must explain this to the user.
7. **Plugin-emitted telemetry**. Plugins (per [C07](C07-PLUGIN-SDK-AND-MARKETPLACE.md)) can emit events through the same sink. Should plugins have their own event-name namespace (e.g. `plugin.<plugin-id>.subject.action`)? Currently they use the host namespace; CI may not catch a misuse. Worth adding a sandbox-validated namespace.
8. **Cross-device opt-out lag**. §1.8 says < 5 s. If a user opts out on phone but their desktop is offline, the desktop will continue to capture until reconnection. Acceptable per the SLA's "5 s of connected sessions" wording — but worth surfacing explicitly in the privacy policy.

---

## §11 — Cross-reference summary

| Contract | Relationship |
|---|---|
| [C03](C03-SCHEMAS-COMMANDS-AND-STATE.md) | P6 — every consent mutation through commandBus; schemas L0-pure |
| [C08](C08-COLLABORATION-AND-SECURITY.md) | Auth + role surface — `analyst` role gates admin dashboard; cookie minimisation aligns |
| [C10](C10-PERFORMANCE-AND-OBSERVABILITY.md) | Sibling — operational spans vs. user telemetry are governed separately |
| [C13](C13-PROJECT-LIFECYCLE-AND-ISOLATION.md) | Per-project pseudo-id isolation; project-delete cascades to telemetry exclusion |
| [C16](C16-COMMAND-AUTHORING-PROTOCOL.md) | All `consent.*`, `telemetry.*` commands follow the protocol |
| [C22](C22-PRIVACY-AND-PII-TIER.md) | Telemetry MUST NOT cross into PII; PII bridge is the join point; redaction list aligned |
| [C23](C23-PROVENANCE-AND-AI-AUDIT.md) | Telemetry events on AI workflow START / COMPLETE; provenance records the artefact lineage |
| [C39](C39-PRICING-AND-PLAN-TIERS.md) | Entitlement state changes emit TIER-1 events; quota threshold-crossings TIER-1 |
| [C40](C40-MARKETPLACE-ECONOMICS.md) | Marketplace purchase + refund + chargeback events emit TIER-1 (essential) |
| [C42](C42-CUSTOMER-SUPPORT-TIER.md) | Customer-support actions emit TIER-2 (with consent) for support analytics |
| [C43](C43-ACCESSIBILITY.md) | Consent banner + privacy settings meet WCAG 2.2 AA |
| [C48](C48-BACKUP-AND-DR.md) | Cold-tier retention follows backup rotation policy |

---

*End — C41 Telemetry & Analytics, 2026-06-01 — DRAFT.*
