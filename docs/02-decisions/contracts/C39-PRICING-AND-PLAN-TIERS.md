# C39 — Pricing & Plan Tiers

> **Stamp**: 2026-06-01 · **Status**: DRAFT
> **Scope**: governs the **commercial surface** that every other contract bumps into when a feature is gated — plan tiers, entitlements, quotas, billing-cycle state, trial-to-paid conversion, dunning, customer-managed downgrade safety. Codifies the `PlanTier` enum, the `Entitlement` map, the `QuotaCounter`, the `BillingState` machine, the `entitlement.*` command bus surface, the Stripe-side wiring (server-only), and the UI conventions for paywalls and quota meters. Every feature gate in the product MUST resolve to a single `Entitlement` key declared here.
> **Depends on**: [C07](C07-PLUGIN-SDK-AND-MARKETPLACE.md) (marketplace plugin install gating), [C08](C08-COLLABORATION-AND-SECURITY.md) (auth + role surface — entitlements compose with roles), [C09](C09-AI-AND-VISIBILITY-INTENT.md) (AI usage quotas), [C10](C10-PERFORMANCE-AND-OBSERVABILITY.md) (OTel spans for quota events), [C13](C13-PROJECT-LIFECYCLE-AND-ISOLATION.md) (per-project quota tracking), [C22](C22-PRIVACY-AND-PII-TIER.md) (billing PII tier).
> **Sibling**: [C40](C40-MARKETPLACE-ECONOMICS.md) (plugin revenue share — depends on C39 for plan-aware payouts), [C42](C42-CUSTOMER-SUPPORT-TIER.md) (SLA gated by plan).
> **Downstream**: every feature-gating decision in the product · in-app paywall + upgrade flows · invoicing exports · accounting reconciliation · sales-collateral pricing pages.
> **Key principles**: **P1** (entitlement resolver is the single composition surface for feature gating), **P5** (entitlement schemas pure), **P6** (entitlement mutations via commandBus), **P8** (every entitlement check + quota tick emits a span).
> **Master plan**: [PRYZM3-MASTER-IMPLEMENTATION-PLAN-2026-05-31.md §12 (Phase 6.2 commerce)](../03-execution/plans/master-implementation-plan.md).
> **Audit-source**: [MISSING-CONTRACTS-AUDIT-2026-06-01.md §3.3](../MISSING-CONTRACTS-AUDIT-2026-06-01.md).

---

## §1 — Invariants

### §1.1 — Every feature gate MUST resolve through `entitlements.check(key)`

No code path may inspect `user.plan === 'pro'` or any equivalent string literal to decide whether a feature is available. Every gate flows through one resolver: `entitlements.check(entitlementKey: EntitlementKey)`. The resolver consults the current `BillingState` + plan tier + per-customer overrides + active trial flag and returns `{ allowed, reason, requiredTier?, quotaRemaining? }`. Direct plan-string inspection is a CI failure (`check-no-plan-literal`).

Rationale: tier names change (the 2027 rename will break the codebase if every file inspects a string); gates need to compose with trials, overrides, dunning grace periods, and customer-managed pause states.

### §1.2 — Entitlement keys are append-only

Once published in `entitlementRegistry.ts`, an `EntitlementKey` MUST NOT be renamed or removed. To retire a gate, mark the entry `deprecated: true` with a `replacedBy?: EntitlementKey`. The resolver returns `allowed: true` for deprecated entries (deprecated gates open). The registry is the source of truth for sales and marketing collateral; renames break SEO, invoices, and customer contracts.

### §1.3 — The four canonical plan tiers

```
Solo        — individual freelancer
Studio      — small team (≤ 5 seats)
Mid-firm    — growth (≤ 50 seats)
Enterprise  — custom (negotiated quotas + SSO + data residency + named CSM)
```

No tier MAY be added without an explicit ADR and a corresponding `entitlementRegistry` revision. The `Free` tier is **not** a plan — it is the unauthenticated + trial surface (§1.7); paying customers never sit in `Free`.

### §1.4 — Quotas are append-only counters; never silent drift

Every metered resource (projects · seats · AI tokens · storage GB · concurrent collab sessions · IFC exports per month) has a single `QuotaCounter` keyed by `(orgId, quotaKey, periodStart)`. Ticks happen via `quota.tick(orgId, key, delta)` — a commandBus call (§4). A tick that would exceed the quota raises a `QuotaExceededError` from the resolver; the calling code MUST surface a paywall, NOT swallow the error. Silent retry with `delta-1` is forbidden (`check-quota-no-silent-decrement`).

Counters reset at the start of each billing cycle (UTC midnight on the cycle anchor date); reset is a separate command (`quota.resetCycle`) emitted by the Stripe-webhook handler, never by client code.

### §1.5 — Entitlements compose with roles, not replace them

[C08](C08-COLLABORATION-AND-SECURITY.md) owns the **role** model (`owner` · `admin` · `editor` · `viewer` · per-project ACLs). Entitlements gate WHAT plan is paid for; roles gate WHO can do what within a project. The composition is AND: a user MAY perform action X if `role.allows(X) AND entitlement.allows(X)`. The resolver order is roles-first then entitlements (an unauthenticated viewer hits the role wall before the entitlement wall); when both deny, the surfaced error MUST be the role one (avoid leaking pricing to unauthorized users).

### §1.6 — Downgrade safety: data lives, features dim

Downgrading from Mid-firm to Studio MUST NOT delete the customer's data. Projects in excess of the new tier's quota go into `read-only` mode (badged in the project list); plugins that the new tier no longer entitles are disabled but not uninstalled; AI history persists but new generations gate. The customer SHALL retain export rights for 90 days after downgrade per [C13](C13-PROJECT-LIFECYCLE-AND-ISOLATION.md) lifecycle policy.

### §1.7 — Trials are time-boxed, single-attempt, abuse-gated

A new organisation MAY redeem **one** 14-day Studio-tier trial (default; trial length per the `trialConfig` in `entitlementRegistry`). The trial ends at `trialStartedAt + trialDays`; thereafter the org transitions to `Solo` (with grace) or to `expired` if the user does not act. Trial fingerprints (organisation domain + payment-method fingerprint + IP class) are tracked to deny serial-trial abuse; the abuse policy lives in [C40](C40-MARKETPLACE-ECONOMICS.md) §3 with the marketplace anti-abuse surface but the trial gate calls into it.

### §1.8 — Dunning is a state-machine, not ad-hoc retry

Failed-payment recovery follows a fixed state machine: `active → past_due (day 0 fail) → retry_1 (day 3) → retry_2 (day 7) → retry_3 (day 14) → suspended (day 21) → cancelled (day 60)`. The state machine is implemented in `server/billing/dunningMachine.ts` and is driven exclusively by Stripe webhooks; client code MUST NOT advance the state. The `suspended` state is read-only access; `cancelled` triggers the 90-day export grace per §1.6.

### §1.9 — Customer-managed pause

Enterprise customers MAY pause a subscription for up to 90 days per calendar year (e.g. parental leave for solo studios, project hiatus for mid-firms). Paused state preserves quotas and entitlements at zero (no charges, no usage); resume restores the prior tier. Pause is a customer-self-service command (`subscription.pause`) for Studio + Mid-firm, an account-management commitment for Enterprise (handled via [C42](C42-CUSTOMER-SUPPORT-TIER.md)).

### §1.10 — BYOK + Enterprise SSO are entitlements, not features

Bring-your-own-key (Anthropic / OpenAI keys for the AI host) and SAML-SSO (Okta · Azure AD · Google Workspace) are gated by `entitlement: 'sso.enterprise'` + `entitlement: 'ai.byok'`. They appear in the entitlement registry. They MUST NOT be wired into the UI via a feature-flag side-channel; the same resolver path applies.

### §1.11 — Every entitlement check emits an OTel span

Per P8:

- `pryzm.entitlement.check` — `{ orgId, userId, key, allowed, reason, requiredTier }`
- `pryzm.quota.tick` — `{ orgId, key, delta, previous, current, periodStart }`
- `pryzm.quota.exceeded` — `{ orgId, key, current, cap }`
- `pryzm.billing.stateTransition` — `{ orgId, from, to, cause }`

Spans MUST open at the public boundary of `packages/entitlements/`. The span surface is used by [C10](C10-PERFORMANCE-AND-OBSERVABILITY.md) NFT dashboards (false-positive paywall hits) and by the sales-ops weekly review.

### §1.12 — Billing state is server-authoritative

The browser never holds an authoritative `BillingState`. The server emits a signed `EntitlementBundle` on session start (and on Stripe webhook events) via the `/api/entitlements/me` endpoint. The bundle carries `(orgId, tier, billingState, trialStatus, quotas, signedAt, signature)`. The client caches the bundle in memory for 5 min; after that it MUST re-fetch. The signature uses the same JWT secret as [C08](C08-COLLABORATION-AND-SECURITY.md) session tokens.

### §1.13 — Pricing-page copy is generated from the registry

The marketing pricing page (`apps/docs-site/src/pages/pricing.astro` — Astro Starlight page; the original spec named it `.tsx` but it was realised as `.astro` per [ADR-052 §1](../adrs/ADR-052-docs-site-marketing-surface.md)) reads `@pryzm/entitlements` at build time and renders the canonical comparison matrix. Hand-edited HTML feature lists on the pricing page are forbidden (`check-pricing-page-derived`); when sales adds a feature row, they add an entitlement entry and the page rebuilds.

The page deploys to `pryzm.so/pricing` via Cloudflare Pages (the canonical host for the marketing surface per [ADR-052](../adrs/ADR-052-docs-site-marketing-surface.md)). The build command imports `@pryzm/entitlements` at build time so the matrix is regenerated on every deploy. There is no client-side JS; the page is pure HTML at the edge. Full deploy runbook: [docs/05-guides/deployments/CLOUDFLARE-PAGES-SETUP.md](../../05-guides/deployments/CLOUDFLARE-PAGES-SETUP.md).

### §1.14 — Discipline-neutrality

Plan tiers MUST NOT presume the customer's discipline (architect · interior designer · QS · contractor · facility manager). The entitlement registry uses neutral keys (`ai.tokens.monthly`, not `ai.architectural-tokens.monthly`). Per the C00 governance discipline-neutrality bar.

---

## §2 — Schema (in `packages/schemas/src/billing/`)

L0-pure. No I/O, no THREE, no DOM.

### §2.1 — Top-level types

| Schema | Owns |
|---|---|
| `PlanTier` | `'solo' \| 'studio' \| 'mid-firm' \| 'enterprise'` |
| `BillingState` | `'trial' \| 'active' \| 'past_due' \| 'retry_1' \| 'retry_2' \| 'retry_3' \| 'suspended' \| 'paused' \| 'cancelled'` |
| `EntitlementKey` | Branded string — e.g. `'ai.generation.apartment'`, `'ifc.export.production'`, `'sheets.unlimited'`. Registry lookup mandatory. |
| `EntitlementValue` | `{ key, mode: 'gate' \| 'quota', cap?: number, deprecated?: boolean, replacedBy?: EntitlementKey, requiredTier: PlanTier }` |
| `EntitlementBundle` | `{ orgId, userId, tier, billingState, trialStatus, entitlements: Record<EntitlementKey, EntitlementValue>, quotas: QuotaSnapshot[], signedAt, signature, expiresAt }` |
| `QuotaCounter` | `{ orgId, key: EntitlementKey, periodStart: ISODate, periodEnd: ISODate, used: number, cap: number, lastTickAt }` |
| `QuotaSnapshot` | `{ key, used, cap, periodEnd }` — the slice surfaced to the client |
| `TrialStatus` | `{ active: boolean, startedAt?, endsAt?, daysRemaining?, fingerprint }` |
| `Subscription` | `{ orgId, planTier, billingState, stripeSubscriptionId, currentPeriodStart, currentPeriodEnd, pausedUntil?, cancelledAt?, mrrCents, currency: ISO4217 }` |
| `DunningEvent` | `{ orgId, kind: 'payment_failed' \| 'retry_succeeded' \| 'suspended' \| 'cancelled', occurredAt, stripeEventId, attemptNumber? }` |
| `EntitlementOverride` | `{ orgId, key, mode: 'force_allow' \| 'force_deny' \| 'cap_override', value?, reason: string, grantedBy: UserId, grantedAt, expiresAt? }` (≥ 16-char reason required) |

### §2.2 — `entitlementRegistry.ts`

The single source of truth, hand-authored, version-controlled, code-reviewed. Structure:

```ts
export const ENTITLEMENT_REGISTRY = {
  'projects.count':            { mode: 'quota', caps: { solo: 3, studio: 25, 'mid-firm': 250, enterprise: Infinity } },
  'seats.count':               { mode: 'quota', caps: { solo: 1, studio: 5, 'mid-firm': 50, enterprise: Infinity } },
  'ai.tokens.monthly':         { mode: 'quota', caps: { solo: 50_000, studio: 500_000, 'mid-firm': 5_000_000, enterprise: Infinity } },
  'storage.gb':                { mode: 'quota', caps: { solo: 5, studio: 50, 'mid-firm': 500, enterprise: Infinity } },
  'collab.concurrent':         { mode: 'quota', caps: { solo: 1, studio: 5, 'mid-firm': 25, enterprise: Infinity } },
  'ifc.export.production':     { mode: 'gate',  requiredTier: 'studio' },
  'revit.roundtrip':           { mode: 'gate',  requiredTier: 'mid-firm' },
  'sso.enterprise':            { mode: 'gate',  requiredTier: 'enterprise' },
  'ai.byok':                   { mode: 'gate',  requiredTier: 'enterprise' },
  'data.residency.eu':         { mode: 'gate',  requiredTier: 'enterprise' },
  'support.priority':          { mode: 'gate',  requiredTier: 'mid-firm' },
  'cost.5d.export.sap':        { mode: 'gate',  requiredTier: 'enterprise' },
  // … see §2.5 for the full registry
} as const;
```

The shape is exact-checked by zod; CI fails any drift between the `as const` literal and the consumer types.

### §2.3 — Branded IDs

`OrgId`, `SubscriptionId`, `EntitlementKey`, `StripeCustomerId`, `StripeSubscriptionId` are branded string IDs per the ADR-0001 typed-ID strategy.

### §2.4 — Field-level constraints

| Field | Constraint |
|---|---|
| `Subscription.mrrCents` | `integer >= 0`; expressed in the smallest unit of `currency` (no fractions) |
| `Subscription.currency` | ISO 4217; MUST match the Stripe customer's settlement currency |
| `EntitlementBundle.signature` | non-empty HMAC-SHA256 of canonical-JSON-of-bundle-fields, computed with the session JWT secret |
| `EntitlementBundle.expiresAt` | exactly 5 min after `signedAt`; client MUST NOT trust a stale bundle |
| `QuotaCounter.used` | `integer >= 0`; SHALL NOT go negative even on rollback (clamped at 0) |
| `EntitlementOverride.reason` | `length >= 16` after `trim()`; line breaks count as one char each |
| `DunningEvent.stripeEventId` | unique per `orgId`; idempotency key (replays are ignored) |

### §2.5 — Registry coverage matrix

The registry SHALL cover, at minimum:

| Domain | Entitlement keys |
|---|---|
| Project lifecycle | `projects.count` · `projects.read_only_on_excess` · `project.export` |
| Seats + collab | `seats.count` · `collab.concurrent` · `collab.named_guest` |
| AI | `ai.tokens.monthly` · `ai.apartment_generation` · `ai.byok` · `ai.advanced_models` |
| Storage | `storage.gb` · `storage.attachments.max_size_mb` · `storage.version_history.days` |
| Interchange | `ifc.export.production` · `dxf.export` · `dwg.export` · `rhino.export` · `revit.roundtrip` · `cobie.export` |
| Sheets & docs | `sheets.unlimited` · `sheets.pdf_export` · `sheets.transmittal_package` · `print.calibrated` |
| Cost + schedule | `cost.5d.estimate` · `cost.5d.export.sap` · `schedule.4d.export` · `clash.detection` |
| Identity + sec | `sso.enterprise` · `audit.export` · `data.residency.eu` · `data.residency.us` · `data.residency.ap` |
| Support + SLA | `support.priority` · `support.sla.4h` · `support.named_csm` |
| Marketplace | `marketplace.private_plugins` · `marketplace.org_wide_install` |

Every product-team PR that introduces a gate MUST add the entry in the same commit; CI checks this.

### §2.6 — Reserved deprecation states

| State | Meaning |
|---|---|
| `deprecated: true` | Entry remains for back-compat; resolver returns `allowed: true` |
| `replacedBy: K2` | Telemetry surfaces both K and K2 hits; reporters use K2 |
| `removedAt: ISODate` | After 365 days post-deprecation, entry MAY be marked `removedAt`; remains in registry forever (back-compat for old invoices) |

---

## §3 — Stores

### §3.1 — `EntitlementStore` (`packages/entitlements/src/store.ts`)

Holds the current session's `EntitlementBundle` plus an in-memory cache of resolved gates (keyed by `EntitlementKey`, evicted on bundle refresh). Reactive — UI components subscribe via `useEntitlement(key)` (returns `{ allowed, quotaRemaining, requiredTier }`).

### §3.2 — `QuotaStore` (`packages/entitlements/src/quotaStore.ts`)

Holds the per-period `QuotaCounter` set for the current org. Updated by `quota.tick` commands (§4). Optimistically updated on the client; server is authoritative — a server reconciliation event MAY revert an optimistic tick (rare; logged).

### §3.3 — `SubscriptionStore` (`server/billing/SubscriptionStore.ts`)

Server-side store holding `Subscription` + `DunningEvent[]` per `orgId`. Persisted to PostgreSQL. Stripe webhook handler is the sole writer.

### §3.4 — Persistence

Client side: nothing persists across browser sessions — every login fetches a fresh bundle. Server side: `Subscription` + `QuotaCounter` + `EntitlementOverride` persist in PostgreSQL; the `entitlements` and `quota_counters` tables are part of the [C13](C13-PROJECT-LIFECYCLE-AND-ISOLATION.md) backup scope.

### §3.5 — Resolver pipeline

```
caller: entitlements.check('ai.tokens.monthly', deltaIfQuota: 1500)
   │
   ▼  load EntitlementBundle from EntitlementStore (re-fetch if expiresAt < now)
   │
   ▼  look up EntitlementKey in registry
   │   - unknown key → throw EntitlementKeyNotFoundError (caller bug)
   │
   ▼  if mode === 'gate':
   │     allowed = (bundle.tier rank ≥ requiredTier rank) OR override.force_allow
   │
   ▼  if mode === 'quota':
   │     counter = QuotaStore.get(key)
   │     remaining = (counter.cap - counter.used)
   │     allowed = (remaining ≥ deltaIfQuota) OR override.force_allow
   │
   ▼  apply EntitlementOverride if present (force_allow / force_deny / cap_override)
   │
   ▼  apply BillingState gates:
   │     - 'suspended' → deny all mutation-class keys; allow read-only
   │     - 'paused'    → deny all; allow only 'project.export' + 'auth.*'
   │     - 'cancelled' → deny all except 'project.export' (within 90-day grace)
   │
   ▼  emit OTel span: pryzm.entitlement.check
   │
   ▼  return { allowed, reason, requiredTier?, quotaRemaining? }
```

---

## §4 — Commands

All commands route through `commandBus` per P6 + [C16](C16-COMMAND-AUTHORING-PROTOCOL.md). All open OTel spans per §1.11.

| Command | Effect |
|---|---|
| `entitlements.refreshBundle` | Re-fetch `EntitlementBundle` from server; replaces in-store bundle |
| `quota.tick` | Increment a counter by `delta`; rejects if would-exceed unless override present |
| `quota.resetCycle` | Server-only — invoked by Stripe webhook handler when a billing cycle resets |
| `quota.allocateBackfill` | Server-only — handle off-cycle credit (e.g. customer bought a top-up) |
| `subscription.upgrade` | Client-initiated — opens Stripe Checkout for the target tier |
| `subscription.downgrade` | Schedules downgrade at current-period-end; takes effect on `cycle.end` webhook |
| `subscription.pause` | Pauses for N days (max 90); requires `entitlement: 'subscription.pause'` |
| `subscription.resume` | Resumes early from pause |
| `subscription.cancel` | Schedules cancellation at current-period-end |
| `subscription.reactivate` | Reverses a scheduled cancellation before period end |
| `billing.updatePaymentMethod` | Opens Stripe Setup flow; on success updates default PM |
| `billing.applyOverride` | Server-only — sales-ops surface for `EntitlementOverride` (granting a forced-allow or cap raise for a specific customer); requires `support` role and a justification |
| `billing.recordDunningEvent` | Server-only — Stripe webhook handler advances the state machine |
| `trial.start` | Client-initiated — begins the trial; checks fingerprint against abuse table |
| `trial.convert` | Client-initiated — converts a trial to a paid subscription (Stripe Checkout) |
| `trial.expire` | Server-only — cron-driven, transitions `trial → solo` (or `expired` if no PM on file) |

---

## §5 — UI

### §5.1 — Paywall modal

Triggered when `entitlements.check()` returns `allowed: false` with a `requiredTier > current`. The modal renders:

- **Headline** — the feature name (read from the registry's `displayLabel`)
- **Requirement** — "Available on Studio and up" (read from registry)
- **Comparison** — the next tier above current, with the 3-5 most-cited entitlements as bullets
- **CTA** — `Upgrade to <tier>` (opens Stripe Checkout via `subscription.upgrade`)
- **Dismiss** — closes modal; the underlying action is NOT performed

The modal MUST be dismissible (no dark patterns). Per [C43](C43-ACCESSIBILITY.md), it traps focus, has a labelled close button, and announces via aria-live.

### §5.2 — Quota meter widget

Persistent in the UI shell footer for the three most-watched quotas (`ai.tokens.monthly`, `projects.count`, `storage.gb`). Each meter renders `used / cap` with a fill bar; ≥ 80 % renders amber, ≥ 95 % renders red with a "Top up" CTA.

The widget is keyboard-focusable + screen-reader-announces the value when changes pass a threshold (80 / 95 / 100 %).

### §5.3 — Billing settings page

`apps/editor/src/ui/settings/billing/` — the single in-product surface for plan / payment / invoice management. Renders:

- Current plan + billing cycle anchor
- Next invoice amount + date
- Payment method (last 4 + brand)
- Plan comparison table (generated from registry per §1.13)
- Cancel / pause / downgrade controls (with §1.6 + §1.8 safety modals)
- Invoice history (read from Stripe; cached 5 min)

### §5.4 — Trial banner

When `trialStatus.active === true`, a persistent banner at the top of the editor renders "X days left in trial — Add payment method →". Dismissible per-session but resurfaces at next session start until the trial ends or converts.

### §5.5 — Suspended / paused state shell

When `billingState === 'suspended'` the editor shell renders a read-only banner ("Subscription past due — update payment method →") and routes all mutating gates to the dunning-update flow. When `billingState === 'paused'` the editor renders an "Account paused" landing page with a resume CTA + an export-data CTA.

### §5.6 — Downgrade safety modal

`subscription.downgrade` opens a confirmation modal that lists exactly which projects will go read-only (per §1.6) and which plugins will disable. The modal blocks confirmation until the user types `DOWNGRADE` (case-sensitive) into a confirm field — high-friction by design.

### §5.7 — Keyboard surface

| Key | Effect |
|---|---|
| `Ctrl + Shift + B` | Open billing settings |
| `Esc` (in paywall modal) | Dismiss |
| `Enter` (in upgrade CTA) | Open Stripe Checkout |

WCAG 2.2 AA per [C43](C43-ACCESSIBILITY.md) — every billing CTA is reachable by keyboard, every quota meter announces value changes, paywall modals trap focus.

---

## §6 — CI gates

| Gate | Path | What it checks |
|---|---|---|
| `check-no-plan-literal` | `tools/ga-gate/check-no-plan-literal.ts` | No source file matches the regex `\bplan\s*===\s*['"](solo\|studio\|mid-firm\|enterprise)['"]` — every gate MUST go through resolver (per §1.1) |
| `check-entitlement-registry-coverage` | `tools/ga-gate/check-entitlement-registry-coverage.ts` | Every call to `entitlements.check(key)` references a key present in `entitlementRegistry.ts` (per §2.5) |
| `check-entitlement-append-only` | `tools/ga-gate/check-entitlement-append-only.ts` | git-diff fails if a registry entry is removed (vs marked `deprecated: true`) (per §1.2) |
| `check-quota-no-silent-decrement` | `tools/ga-gate/check-quota-no-silent-decrement.ts` | No `try/catch` around `quota.tick(...)` that swallows `QuotaExceededError` and retries with `delta - 1` (per §1.4) |
| `check-entitlement-spans` | extends `check-spans.ts` | Every public `packages/entitlements/` boundary function carries an OTel span (per §1.11) |
| `check-entitlements-schemas-pure` | extends existing schema-purity check | `packages/schemas/src/billing/` has zero I/O, zero THREE, zero DOM (per P5) |
| `check-pricing-page-derived` | `tools/ga-gate/check-pricing-page-derived.ts` | `apps/docs-site/src/pricing.tsx` is generated; no hand-edited feature-list HTML (per §1.13) |
| `check-bundle-signature` | runtime — server middleware | Every client `/api/entitlements/me` response carries a valid signature; client rejects on signature failure (per §1.12) |
| `check-stripe-webhook-signature` | runtime — server middleware | Every Stripe webhook hit verifies the `Stripe-Signature` header before mutating any store |
| `check-override-justification` | runtime — schema validator | Every `EntitlementOverride.reason.length >= 16` (per §2.4) |
| `check-no-direct-store-write` | eslint rule | UI code under `apps/editor/src/ui/settings/billing/` MUST NOT import `EntitlementStore` directly for mutation; only via `commandBus` (per P6 + §1.5) |
| `check-discipline-neutral-entitlements` | manual review + lint of registry keys | No registry key contains discipline strings (`architectural`, `residential`, `commercial`, etc.) (per §1.14) |

### §6.2 — Conformance suites

| Suite | Path | Asserts |
|---|---|---|
| Resolver semantics | `packages/entitlements/__tests__/resolver/*.test.ts` | Resolver returns correct `{allowed, reason}` for every (tier × billingState × key) tuple |
| Dunning state machine | `server/billing/__tests__/dunningMachine.test.ts` | Every Stripe webhook event drives the state machine to the correct next state; idempotency check (replays no-op) |
| Quota optimism | `packages/entitlements/__tests__/quota-optimism.test.ts` | Optimistic tick + server reconciliation produces a consistent counter under concurrent updates |
| Bundle signing | `server/billing/__tests__/bundle-signing.test.ts` | Signed bundle round-trips; tampered bundle is rejected; expired bundle is re-fetched |
| Trial fingerprint | `server/billing/__tests__/trial-fingerprint.test.ts` | Serial-trial attempts are blocked across (orgDomain × paymentMethodFingerprint × ipClass) |
| Downgrade safety | `packages/entitlements/__tests__/downgrade.test.ts` | Downgrade puts excess projects read-only, does not delete data, surfaces explicit project-by-project notice |

---

## §7 — NFT targets

| NFT | Target | Bench |
|---|---|---|
| `entitlements.check` (cold) | < 5 ms | `entitlements-check-cold.bench.ts` (new) |
| `entitlements.check` (warm, in-cache) | < 0.1 ms | `entitlements-check-warm.bench.ts` (new) |
| `quota.tick` (single command latency) | < 20 ms client-perceived (incl. optimistic update) | inherited from C03 command budget |
| Bundle refresh (server round-trip) | < 200 ms p95 | `bundle-refresh.bench.ts` (new) |
| Paywall modal mount | < 100 ms | inherited from C04 panel-mount budget |
| Pricing-page build (registry → HTML) | < 5 s | `pricing-page-build.bench.ts` (new) |
| Stripe webhook handler p95 | < 300 ms | `stripe-webhook-latency.bench.ts` (new) |
| Quota-counter PG write p95 | < 50 ms | inherited from C05 persistence budget |

---

## §8 — Migration plan

### §8.1 — New package `packages/entitlements/`

```
packages/entitlements/
  src/
    index.ts                       — composeEntitlements() boundary (P8 spans here)
    resolver/
      check.ts                     — main resolver per §3.5
      gateResolver.ts              — mode === 'gate' branch
      quotaResolver.ts             — mode === 'quota' branch
      overrideResolver.ts          — applies EntitlementOverride
      billingStateGates.ts         — suspended / paused / cancelled gates
    registry/
      entitlementRegistry.ts       — the canonical registry (§2.2)
      registryTypes.ts             — branded EntitlementKey + zod
    store.ts                       — EntitlementStore
    quotaStore.ts                  — QuotaStore (client side)
    bundleFetcher.ts               — /api/entitlements/me client
    bundleVerifier.ts              — signature check
  __tests__/
    resolver/*.test.ts
    registry-shape.test.ts
    bundle-roundtrip.test.ts
```

Wired into `composeRuntime()` at L3 (depends on schemas L0 + stores L3, but not on plugins or renderer). The package is dependency-free of THREE / DOM.

### §8.2 — Server-side: `server/billing/`

```
server/billing/
  SubscriptionStore.ts             — PG-backed Subscription persistence
  QuotaCounterStore.ts             — PG-backed QuotaCounter persistence
  dunningMachine.ts                — state machine driver
  bundleSigner.ts                  — HMAC-SHA256 signing
  bundleEndpoint.ts                — /api/entitlements/me handler
  stripeWebhook.ts                 — Stripe event router → dunning + cycle reset
  trialAbuseGate.ts                — fingerprint check
  overrideAdmin.ts                 — sales-ops surface (auth-gated to support role)
```

The existing `server/billing/` (current Stripe integration is ~300 LOC scattered across `server.js`) is consolidated here under a single module surface.

### §8.3 — Phased rollout

| Phase | Deliverable | Estimate |
|---|---|---|
| ENT-α-1 | `packages/schemas/src/billing/` (all §2 schemas) + zod | 0.3 wk |
| ENT-α-2 | `entitlementRegistry.ts` first cut + CI append-only gate | 0.5 wk |
| ENT-α-3 | `packages/entitlements/` resolver + EntitlementStore | 0.5 wk |
| ENT-β-1 | Server: bundleEndpoint + bundleSigner + middleware | 0.5 wk |
| ENT-β-2 | Server: SubscriptionStore + dunningMachine + Stripe webhook | 1 wk |
| ENT-β-3 | QuotaStore + quota.tick command + optimistic update + reconciliation | 0.5 wk |
| ENT-γ-1 | Migrate existing string-literal gates to resolver (sweep) | 1 wk |
| ENT-γ-2 | Billing settings page UI | 1 wk |
| ENT-γ-3 | Paywall modal + quota meter + trial banner | 0.5 wk |
| ENT-γ-4 | Downgrade safety modal + suspended / paused shells | 0.5 wk |
| ENT-δ-1 | Pricing-page generator from registry + replace static page | 0.5 wk |
| ENT-δ-2 | Sales-ops overrideAdmin surface | 0.5 wk |
| ENT-δ-3 | CI gates (§6) all green; legacy gates removed | 0.3 wk |

**Total: ~7 wk** (within the master plan's Phase 6.2 budget when paralleled with C40).

### §8.4 — Backward compatibility

The existing Stripe scaffolding in `server.js` continues to operate during the rollout. The new `bundleEndpoint` is wired alongside; the resolver consults whichever is authoritative based on the `ENTITLEMENTS_BUNDLE_ENABLED` env var (default off until ENT-γ-3 lands).

Existing string-literal gates (`if (user.plan === 'pro')`) are temporarily allowed in `tools/ga-gate/check-no-plan-literal.ts` baseline file; that baseline shrinks to zero over the ENT-γ-1 sweep. Final gate enforcement is hard-fail.

### §8.5 — Test plan

Per [C03](C03-SCHEMAS-COMMANDS-AND-STATE.md) test convention. Every resolver path + every dunning transition + every webhook → state-machine mapping carries a unit test. End-to-end: a fixture customer goes trial → solo → studio → mid-firm → downgrade → past_due → suspended → cancelled and assertions check the bundle, the quotas, and the UI shells at every step.

---

## §9 — What is NOT in this contract

- **Plugin revenue share + marketplace payouts** — [C40](C40-MARKETPLACE-ECONOMICS.md). C39 covers the customer's plan; C40 covers the developer's payout.
- **Customer support SLAs** — [C42](C42-CUSTOMER-SUPPORT-TIER.md). C39 declares the `support.priority` and `support.sla.4h` entitlement keys; C42 defines the actual response targets and escalation paths.
- **Telemetry consent capture** — [C41](C41-TELEMETRY-AND-ANALYTICS.md). The opt-in/opt-out preference is a separate signal; consent is not an entitlement.
- **Stripe checkout UI** — Stripe-hosted; C39 only specifies the redirect entry + the webhook return path.
- **Invoice templating** — Stripe-hosted; PRYZM does not author invoice PDFs.
- **Tax calculation** — Stripe Tax handles it; C39 records the customer-side currency but not the per-jurisdiction tax line.
- **Coupon + promotion-code surface** — Stripe Promotions handles it; the bundle does NOT carry the active coupon. (Sales-ops view via Stripe dashboard.)
- **Free-tier specification** — there is no free tier. The trial fills the role of "evaluate before paying"; expired trial → forced authentication wall or Solo plan with PM-on-file.
- **Per-feature usage-based metering beyond the §2.5 registry** — additional metered axes (e.g. `ifc.export.count.monthly`) MAY be added to the registry but require an ADR.
- **Marketplace economics** — see [C40](C40-MARKETPLACE-ECONOMICS.md).
- **Accessibility of the paywall modal itself** — defined by [C43](C43-ACCESSIBILITY.md); C39 references it but does not author the WCAG rules.

---

## §10 — Open questions (DRAFT-stage)

1. **Trial length per region**. EU consumer-protection rules favour a 30-day trial with a no-questions-asked refund window for the first 14 days. NA practice is 14 days. Current §1.7 reads 14; per-region trial config needs sales + legal input before CANONICAL.
2. **AI quota top-up granularity**. Today caps reset monthly. Customers exceeding `ai.tokens.monthly` mid-cycle want to top up without upgrading. Should top-ups be standalone Stripe products (one-off charge) or auto-overage with caps?
3. **Per-seat vs per-org billing for Studio**. Studio currently charges per-seat (5 seats × £/seat). Some early customers prefer org-flat. Needs sales-validation; deferred to a pricing-page experiment.
4. **Enterprise minimum**. Enterprise is "negotiated"; should there be a floor (e.g. £25k/year)? Current answer: no floor, but the smallest deal closed is the floor in practice. Track for future review.
5. **Education discount**. University/research customers expect a steep discount. Currently ad-hoc; the registry has no `educational` flag. Open whether to add a tier-modifier or hand-craft via overrides.
6. **Plugin author free seats**. Marketplace developers want a free Studio seat to develop against (see [C40](C40-MARKETPLACE-ECONOMICS.md)). Could be a `marketplace.developer_seat` entitlement-override granted on plugin publication.
7. **MRR currency**. `Subscription.mrrCents` is in the customer's settlement currency. Internal MRR reporting wants a single reporting-currency view (GBP). Where to convert + at what rate? Likely the analytics warehouse, not the bundle.
8. **Bundle TTL of 5 min**. Trade-off: shorter TTL = faster downgrade propagation but more server load. Should TTL be per-endpoint (e.g. checks for high-cost gates re-fetch more often)? Defer to operational data.

---

## §11 — Cross-reference summary

| Contract | Relationship |
|---|---|
| [C03](C03-SCHEMAS-COMMANDS-AND-STATE.md) | P6 — every entitlement mutation through commandBus; schemas L0-pure |
| [C07](C07-PLUGIN-SDK-AND-MARKETPLACE.md) | Plugin install gating via `marketplace.private_plugins` + `marketplace.org_wide_install` |
| [C08](C08-COLLABORATION-AND-SECURITY.md) | Roles compose AND with entitlements; bundle signing reuses session JWT secret |
| [C09](C09-AI-AND-VISIBILITY-INTENT.md) | AI token quotas + `ai.byok` gating |
| [C10](C10-PERFORMANCE-AND-OBSERVABILITY.md) | P8 OTel spans for every entitlement event |
| [C13](C13-PROJECT-LIFECYCLE-AND-ISOLATION.md) | 90-day export grace after cancellation; per-project quota tracking |
| [C16](C16-COMMAND-AUTHORING-PROTOCOL.md) | All `entitlement.*`, `quota.*`, `subscription.*` commands follow the protocol |
| [C22](C22-PRIVACY-AND-PII-TIER.md) | Billing data sits in the PII tier; Stripe PII boundary |
| [C40](C40-MARKETPLACE-ECONOMICS.md) | Plan-tier-aware payout splits + developer free seats |
| [C42](C42-CUSTOMER-SUPPORT-TIER.md) | `support.*` entitlement keys gate the SLA |
| [C43](C43-ACCESSIBILITY.md) | Paywall modal + quota meter meet WCAG 2.2 AA |

---

*End — C39 Pricing & Plan Tiers, 2026-06-01 — DRAFT.*
