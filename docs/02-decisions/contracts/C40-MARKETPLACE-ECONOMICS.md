# C40 — Marketplace Economics

> **Stamp**: 2026-06-01 · **Status**: DRAFT
> **Scope**: governs the **economic contract** between PRYZM (the platform) and the plugin / family / pricing-catalogue authors (the developers) who publish on the marketplace. Codifies revenue share, payout cadence, refund policy, chargeback handling, sales-tax/VAT treatment, tax-form collection (W-9 / W-8BEN / equivalent), anti-abuse (review fraud, trial abuse, payout-laundering), category gating, deprecation policy, and the developer dashboard. **One developer-facing pricing model** — every saleable artefact on the marketplace (plugin, family pack, pricing catalogue, parameter rules pack, template pack) prices the same way and pays out on the same cadence.
> **Depends on**: [C07](C07-PLUGIN-SDK-AND-MARKETPLACE.md) (plugin runtime + sandbox + Ed25519 signing — the technical surface that this contract economically binds), [C08](C08-COLLABORATION-AND-SECURITY.md) (developer auth + role surface), [C13](C13-PROJECT-LIFECYCLE-AND-ISOLATION.md) (data isolation between developer org and customer org), [C22](C22-PRIVACY-AND-PII-TIER.md) (developer PII for payouts), [C23](C23-PROVENANCE-AND-AI-AUDIT.md) (audit trail for payouts), [C39](C39-PRICING-AND-PLAN-TIERS.md) (customer plan tier modulates install rights + influences revenue share).
> **Sibling**: [C39](C39-PRICING-AND-PLAN-TIERS.md) (customer-facing pricing), [C42](C42-CUSTOMER-SUPPORT-TIER.md) (developer support tier).
> **Downstream**: developer onboarding flow · payout pipeline (Stripe Connect) · tax-form intake (Stripe Tax + Stripe 1099 reporting) · developer dashboard analytics · category curation workflow · marketplace-search ranking signals.
> **Key principles**: **P5** (payout schemas pure), **P6** (every payout-affecting mutation via commandBus), **P8** (every payout calculation + every dispute event emits a span), **P0.3** (family / pricing-catalogue / rules-pack plugins are first-class — this contract treats them identically to code plugins for payout purposes).
> **Master plan**: [PRYZM3-MASTER-IMPLEMENTATION-PLAN-2026-05-31.md §12 (Phase 6.2 commerce)](../03-execution/plans/master-implementation-plan.md).
> **Audit-source**: [MISSING-CONTRACTS-AUDIT-2026-06-01.md §3.3](../MISSING-CONTRACTS-AUDIT-2026-06-01.md).

---

## §1 — Invariants

### §1.1 — Single revenue-share formula across all artefact kinds

Every saleable artefact on the marketplace (code plugin · family pack · pricing catalogue · parameter rules pack · template pack · drawing standards pack) pays out on the same formula: **developer 70 % · PRYZM 30 %**. There is no per-category split, no introductory discount, no "founders' rate". Cross-category parity is invariant — if PRYZM ever needs to differentiate (e.g. higher cut for marketplace-hosted ML model artefacts), it requires an ADR + a new artefact kind + a 6-month notice to existing developers.

The 30 % platform fee is gross — PRYZM absorbs Stripe payment-processing fees out of its share. Developers see the gross sale price → their 70 % → their net after their local tax obligations. This is a deliberate simplicity choice (one ratio, no surprises).

### §1.2 — Payout currency follows the developer's Stripe Connect account

A developer's payout is settled in the currency of their Stripe Connect account (typically the developer's country of registration). When a sale occurs in a different currency, Stripe handles conversion at the time of payout; the conversion rate at settlement (NOT at sale) is recorded on the `PayoutLine`. Sales-tax obligations are also computed at settlement currency.

### §1.3 — Payouts run on the 1st of every month for prior-month earnings

A monthly cadence: at 00:00 UTC on the 1st of each calendar month, all `PayoutLine` rows for the prior month transition `pending → ready` and a Stripe Connect batch is created. Developers receive funds typically within 3 business days (per Stripe Connect SLAs in their country). Developers with `pending - refundReserve < payoutMinimum` (default £25 / $25 / €25) roll over to the next cycle.

A weekly or daily payout cadence is explicitly NOT offered (operational complexity not warranted by developer demand). Enterprise developer arrangements (negotiated separately) MAY override this cadence; such overrides are documented as `PayoutSchedule` overrides per developer.

### §1.4 — Refund reserve is 14 days

Every sale carries a 14-day refund window (customer-side) per PRYZM's general refund policy. Funds for sales in the trailing 14 days of any month are NOT included in that month's payout — they roll into the next month's batch. The reserve protects against payout-clawbacks when refunds happen post-payout.

A `PayoutLine` in the 14-day window is `state: 'in_reserve'`; on day 15 it transitions to `pending`. If a refund is issued during reserve, the line is cancelled (not paid out, never appears on the developer's invoice).

### §1.5 — Chargebacks reverse the developer's share

When Stripe issues a chargeback (forced refund initiated by the customer's bank), PRYZM debits the developer's account for the original 70 % share + a flat £15 / $15 / €15 chargeback handling fee per Stripe's standard chargeback fee. The platform fee (30 %) is also reversed — PRYZM bears the platform share of the chargeback loss.

The chargeback fee is configurable per developer per a discretionary fee waiver; sales-ops MAY waive for developers with > £10,000 cumulative payouts and a chargeback rate < 0.5 % (an "established developer" override per §1.10).

### §1.6 — Developers MUST complete tax-form intake before first payout

A developer's first `PayoutLine` is HELD until the developer's tax form (W-9 for US persons, W-8BEN/W-8BEN-E for non-US, plus VAT-MOSS for EU sellers) is completed via Stripe Tax. The hold is enforced by `payout.eligibilityCheck` (§4); held lines accumulate as `state: 'held_no_tax_form'` until completion. PRYZM is the merchant-of-record for the marketplace transaction; PRYZM files 1099-K / equivalent for developers per IRS thresholds. The hold is non-bypassable per US IRS / UK HMRC rules.

### §1.7 — Refund policy is one-click + 14-day no-questions-asked

Customers MAY refund any marketplace purchase within 14 days of purchase via a self-serve "Refund" button in their billing settings. The refund is automatic — no developer approval required, no "are you sure" friction. The developer is notified via the developer dashboard but cannot block the refund.

Post-14 days, refunds are case-by-case (handled by [C42](C42-CUSTOMER-SUPPORT-TIER.md) customer support); when granted, the developer share is reversed and the developer is notified.

Rationale: no-friction refund is a marketplace-trust signal. Mature marketplaces (Stripe-direct subscription, Shopify App Store, Apple App Store) trend toward this; PRYZM matches.

### §1.8 — Pricing changes apply forward-only

A developer MAY change an artefact's price at any time via `marketplace.updatePrice` (§4). The new price takes effect for new purchases; existing customers retain the price they paid (for subscription-style artefacts, the price they last paid renews at that amount until the developer signals otherwise via `marketplace.updateSubscriptionPrice` with 30-day notice).

A price decrease for existing customers is permitted (developer goodwill); a price increase requires 30-day notice in writing to existing subscribers per consumer-protection law (UK CMA, EU consumer directive, US state-by-state).

### §1.9 — Anti-abuse: review fraud + payout laundering

Every review carries the reviewer's `OrgId` + `purchaseId` + `reviewedAt`. A review without a confirmed purchase is forbidden (schema validator). Reviews from organisations that share a fingerprint cluster with the developer's organisation are flagged and excluded from public ratings (the flag is private; developer sees them in their dashboard with a "self-review" badge).

Payout-laundering attempts (e.g. developer A purchases their own artefact via shell organisation B to inflate sales metrics + extract their 70 % share minus processing fees) are deterred by:

- Self-purchase detection: same fingerprint cluster + same payment-method fingerprint
- A 60-day claw-back window for purchases from new orgs (< 90 days old) at the developer's discretion
- Stripe-side risk scoring on the customer's payment method

Detected laundering revokes the developer's payouts pending review; persistent violators are de-listed and their accumulated balance forfeit per the marketplace terms.

### §1.10 — Established-developer overrides

Developers with > £10,000 cumulative payouts AND > 12 months on the marketplace AND < 0.5 % chargeback rate AND no anti-abuse flags qualify for "established developer" status. The status grants:

- Chargeback handling-fee waiver (§1.5)
- Reduced refund-reserve window (7 days instead of 14)
- Priority developer support per [C42](C42-CUSTOMER-SUPPORT-TIER.md)
- Featured-placement opportunities (curatorial — not algorithmic)
- Early access to new marketplace surfaces (e.g. ML-model marketplace if/when launched)

Status is computed nightly; an `EstablishedDeveloper` flag is persisted on the developer record and surfaces in their dashboard with the qualifying criteria + how to retain.

### §1.11 — Category gating: some categories require curation

Marketplace categories split into `open` (anyone can publish — utility plugins, family packs, drawing standards) and `curated` (PRYZM reviews each submission — pricing catalogues that quote licensed third-party data like RSMeans / BCIS / Spon's, AI-model-backed artefacts, anything claiming regulatory compliance). Curated submissions go through `marketplace.submitForReview` (§4) and surface in a curatorial queue; approval / rejection is a [C42](C42-CUSTOMER-SUPPORT-TIER.md) team workflow.

A developer SHALL NOT bypass curation by mis-categorising a curated artefact as open; CI checks the published manifest's declared categories against an allowlist of curated keywords and flags suspicious entries.

### §1.12 — Deprecation policy: artefacts live 12 months post-unpublish

When a developer unpublishes an artefact (no longer available for new install) the artefact remains installed for existing customers for 12 months and remains supported by the developer for that window. After 12 months the artefact is fully sunset — customers receive a 30-day notice + a recommended replacement (if any) + an export of any artefact-owned data.

PRYZM-initiated removal (security breach, terms-of-service violation, legal demand) bypasses the 12-month policy and removes the artefact immediately; the developer is notified per the terms-of-service and may dispute via [C42](C42-CUSTOMER-SUPPORT-TIER.md) escalation.

### §1.13 — Every payout calculation + every dispute event emits a span

Per P8:

- `pryzm.marketplace.payout.compute` — `{ developerId, periodStart, periodEnd, lineCount, gross, platformFee, net, currency }`
- `pryzm.marketplace.payout.batch` — `{ batchId, developerCount, totalNet, currency }`
- `pryzm.marketplace.refund` — `{ saleId, customerId, developerId, refundedCents, reason }`
- `pryzm.marketplace.chargeback` — `{ saleId, customerId, developerId, chargebackCents, chargebackFee, networkReason }`
- `pryzm.marketplace.priceChange` — `{ artefactId, fromPriceCents, toPriceCents, currency }`
- `pryzm.marketplace.curation.submit` — `{ artefactId, developerId, category }`
- `pryzm.marketplace.curation.decide` — `{ artefactId, decision: 'approved' \| 'rejected', reviewerId, reasonHash }`

Spans MUST open at the public boundary of `packages/marketplace-economics/`.

### §1.14 — Developer dashboard data lags by < 24 h

Sales · refunds · chargeback events visible in the developer dashboard MUST lag underlying Stripe events by no more than 24 h (typically far less; the SLA is the upper bound). Aggregation is via a nightly ETL job into the developer analytics store. Real-time is explicitly NOT promised — the 24 h SLA frames developer expectations.

### §1.15 — Discipline-neutrality + jurisdictional neutrality

The contract MUST NOT presume the developer is in any particular jurisdiction (US default, UK default, EU default), and MUST NOT presume the artefact category (BIM vs CAD vs FM vs cost). The schemas use ISO codes (ISO 3166 for country, ISO 4217 for currency) and let Stripe Tax handle per-jurisdiction obligations.

---

## §2 — Schema (in `packages/schemas/src/marketplace/`)

L0-pure. No I/O, no THREE, no DOM.

### §2.1 — Top-level types

| Schema | Owns |
|---|---|
| `DeveloperAccount` | `{ id: DeveloperId, orgId: OrgId, displayName, country: ISO3166, currency: ISO4217, stripeConnectAccountId, taxFormStatus: 'pending' \| 'submitted' \| 'verified' \| 'rejected', taxFormVerifiedAt?, establishedDeveloper: boolean, joinedAt }` |
| `Artefact` | `{ id: ArtefactId, developerId, kind: ArtefactKind, slug, displayName, category, version: SemVer, status: 'draft' \| 'pending_review' \| 'published' \| 'unpublished' \| 'sunset' \| 'removed', publishedAt?, unpublishedAt?, removedAt?, removalReason? }` |
| `ArtefactKind` | `'plugin' \| 'family-pack' \| 'pricing-catalogue' \| 'rules-pack' \| 'template-pack' \| 'drawing-standards-pack'` |
| `ArtefactPrice` | `{ artefactId, model: 'one-time' \| 'subscription-monthly' \| 'subscription-annual' \| 'free', priceCents: number, currency: ISO4217, validFrom: ISODate, supersededBy?: ArtefactPriceId }` (versioned per §1.8) |
| `Sale` | `{ id: SaleId, artefactId, developerId, customerOrgId, customerUserId, grossCents, currency, paidAt, stripeChargeId, refundedAt?, refundedCents?, chargedBackAt?, chargedBackCents?, fingerprint }` |
| `PayoutLine` | `{ id: PayoutLineId, developerId, saleId, periodMonth: 'YYYY-MM', state: 'in_reserve' \| 'pending' \| 'ready' \| 'paid' \| 'cancelled' \| 'held_no_tax_form', grossCents, platformFeeCents, netCents, currency, batchId? }` |
| `PayoutBatch` | `{ id: PayoutBatchId, periodMonth: 'YYYY-MM', developerId, lineCount, totalNetCents, currency, createdAt, paidAt?, stripeTransferId? }` |
| `Refund` | `{ id: RefundId, saleId, refundedCents, currency, reason: 'customer_self_serve' \| 'support_granted' \| 'chargeback', initiatedBy: 'customer' \| 'support' \| 'stripe', initiatedAt }` |
| `Chargeback` | `{ id: ChargebackId, saleId, chargebackCents, chargebackFeeCents, currency, networkReason: string, occurredAt, disputedByDeveloper: boolean }` |
| `Review` | `{ id: ReviewId, artefactId, reviewerOrgId, reviewerUserId, purchaseId: SaleId, rating: 1\|2\|3\|4\|5, body: string, submittedAt, status: 'live' \| 'flagged_self_review' \| 'flagged_spam' \| 'hidden' }` |
| `CurationDecision` | `{ id: CurationDecisionId, artefactId, decision: 'approved' \| 'rejected' \| 'needs_changes', reviewerId, reasonHash, decidedAt }` (reasonHash from §2.4) |
| `FingerprintCluster` | `{ id, orgIds: OrgId[], paymentMethodFingerprints: string[], ipClasses: string[], createdAt, lastSeenAt }` |
| `EstablishedDeveloperSnapshot` | `{ developerId, computedAt, cumulativePayoutsCents, monthsActive, chargebackRate, abuseFlags: number, qualifies: boolean }` |

### §2.2 — Branded IDs

`DeveloperId`, `ArtefactId`, `SaleId`, `PayoutLineId`, `PayoutBatchId`, `RefundId`, `ChargebackId`, `ReviewId`, `CurationDecisionId`, `ArtefactPriceId` are branded string IDs per ADR-0001.

### §2.3 — Field-level constraints

| Field | Constraint |
|---|---|
| `Artefact.slug` | `[a-z0-9-]+`, 3-64 chars, unique per developer; URL-safe |
| `Artefact.version` | strict semver `MAJOR.MINOR.PATCH`; MAJOR bumps require 30-day notice for subscription artefacts |
| `ArtefactPrice.priceCents` | `integer >= 0`; zero means "free"; negative rejected |
| `Sale.grossCents` | matches the `ArtefactPrice.priceCents` at `paidAt` (per §1.8 forward-only) |
| `PayoutLine.platformFeeCents` | exactly `floor(grossCents × 0.30)`; never inferred elsewhere |
| `PayoutLine.netCents` | exactly `grossCents - platformFeeCents`; never inferred |
| `Review.body` | `length >= 20 AND length <= 2000` after `trim()` |
| `Review.purchaseId` | MUST resolve to a `Sale` from `reviewerOrgId` for `artefactId`; schema validator enforces |
| `Chargeback.networkReason` | one of the Stripe-documented reason codes (e.g. `fraudulent`, `product_not_received`, `subscription_canceled`) |

### §2.4 — `CurationDecision.reasonHash`

Curation reasons are written by PRYZM reviewers in a back-office tool; the curated reason is NOT shared verbatim with the developer (avoid surfacing internal review-process detail). Instead a 64-char SHA-256 hash of the canonical reason is stored on the decision record; sales-ops can lookup the hash → full reason in the back-office tool. Developers see a high-level reason category (`needs_changes`: 'documentation' / 'security' / 'licensing' / 'scope' / 'quality') only.

### §2.5 — Foreign keys

| FK | Target | Cascade |
|---|---|---|
| `Sale.artefactId` | `Artefact` | artefact unpublish does NOT cascade-cancel sales (existing customers retain per §1.12) |
| `Sale.customerOrgId` | `Org` | org-delete does NOT cascade-delete sales (audit retention per [C13](C13-PROJECT-LIFECYCLE-AND-ISOLATION.md)) |
| `PayoutLine.saleId` | `Sale` | refund cascade: when `Sale.refundedAt` set, paired `PayoutLine.state` → `cancelled` |
| `Review.purchaseId` | `Sale` | per §1.9 — reviewer MUST own a sale to publish review |

---

## §3 — Stores

### §3.1 — `MarketplaceCatalogueStore` (`packages/marketplace-economics/src/catalogueStore.ts`)

Holds the public `Artefact` set + `ArtefactPrice` + `Review` (lightweight, read-heavy). Backed by PostgreSQL with a read-through cache; mutation is restricted to commands.

### §3.2 — `SalesLedgerStore` (`server/marketplace/SalesLedgerStore.ts`)

Server-only. Append-only ledger of every `Sale` + `Refund` + `Chargeback`. Used by the payout pipeline + developer dashboard + financial-audit exports. Append-only is enforced by PG row-level security (only inserts; no updates of existing rows; corrections via compensating `RefundRecord` or `ChargebackRecord` entries).

### §3.3 — `PayoutLedgerStore` (`server/marketplace/PayoutLedgerStore.ts`)

Server-only. Holds the `PayoutLine` set across all developers + the `PayoutBatch` history. The batch creator is the sole writer (§4 `payout.runMonthlyBatch`); state transitions are pre-defined and CI-validated.

### §3.4 — `DeveloperAccountStore` (`server/marketplace/DeveloperAccountStore.ts`)

Server-only. Holds `DeveloperAccount` + the `EstablishedDeveloperSnapshot` + the `FingerprintCluster` index.

### §3.5 — Persistence

Server-side stores persist in PostgreSQL. The `payout_*`, `sale_*`, `refund_*`, `chargeback_*` tables are append-only (PG triggers reject UPDATEs that flip `paidAt` / `refundedAt` after first-set). Backups follow [C48](C48-BACKUP-AND-DR.md) policy.

### §3.6 — Payout pipeline

```
cron: 00:00 UTC on 1st of month
   │
   ▼  for each developer with pending lines
   │     1. compute eligibility: tax-form verified? minimum hit?
   │     2. collect all PayoutLines where state == 'pending'
   │        (excludes 'in_reserve' from the last 14 days)
   │        (excludes 'held_no_tax_form')
   │     3. open OTel span: pryzm.marketplace.payout.compute
   │     4. sum gross + platform fee + net (assertion: net = gross - platformFee)
   │     5. create PayoutBatch { developerId, totalNetCents, currency }
   │     6. update lines: state → 'ready', batchId = newBatch.id
   │
   ▼  for each PayoutBatch
   │     7. Stripe Connect transfer (idempotency-key = batchId)
   │     8. on Stripe success: state → 'paid', PayoutBatch.paidAt = now
   │     9. on Stripe failure: write retry attempt; alert sales-ops; lines remain 'ready'
   │
   ▼  emit summary span: pryzm.marketplace.payout.batch
```

The pipeline is deterministic + idempotent — re-running for the same `periodMonth` skips already-paid lines via the `batchId` set.

---

## §4 — Commands

All commands route through `commandBus` per P6 + [C16](C16-COMMAND-AUTHORING-PROTOCOL.md). All open OTel spans per §1.13.

### §4.1 — Developer-facing

| Command | Effect |
|---|---|
| `marketplace.createDraft` | Create a draft `Artefact` (status: `draft`) under the developer's account |
| `marketplace.updateDraft` | Mutate a draft artefact's metadata / version / category |
| `marketplace.setPrice` | Create a new `ArtefactPrice` for the artefact; new price applies forward-only (§1.8) |
| `marketplace.submitForReview` | Transition a draft to `pending_review` (curated artefacts) OR directly to `published` (open category) |
| `marketplace.publish` | Transition `draft → published` for open-category artefacts |
| `marketplace.unpublish` | Transition `published → unpublished`; existing installs retain per §1.12 |
| `marketplace.sunset` | Transition `unpublished → sunset` after 12 months; notification + replacement-suggestion fires |
| `marketplace.disputeChargeback` | Initiate a Stripe chargeback dispute; PRYZM forwards evidence to Stripe |
| `marketplace.viewPayoutHistory` | Read-only — fetch the developer's `PayoutLine` + `PayoutBatch` history |
| `marketplace.exportSalesCSV` | Read-only — export the developer's sales for an arbitrary period |

### §4.2 — Customer-facing

| Command | Effect |
|---|---|
| `marketplace.purchase` | Buy an artefact; creates a `Sale` + a 14-day refund-window timer |
| `marketplace.refund` | Customer self-serve — within 14 days of purchase; cascades to `PayoutLine.state = cancelled` |
| `marketplace.submitReview` | Submit a `Review` for an owned artefact |
| `marketplace.flagReview` | Flag a review as spam / hateful / off-topic — surfaces to support queue |

### §4.3 — Sales-ops / curation-facing

| Command | Effect |
|---|---|
| `marketplace.decideReview` | Approve / reject a `pending_review` artefact; reason logged |
| `marketplace.removeArtefact` | PRYZM-initiated removal (terms violation / security / legal); skips §1.12 grace |
| `marketplace.grantEstablishedDeveloper` | Manual override to grant established-developer status |
| `marketplace.waiveFee` | Waive a chargeback fee for an established developer per §1.5 |

### §4.4 — Server-only (pipeline-driven)

| Command | Effect |
|---|---|
| `payout.runMonthlyBatch` | Cron — runs the §3.6 pipeline |
| `payout.eligibilityCheck` | Pre-payout — verifies tax-form + minimum threshold |
| `payout.markPaid` | Stripe webhook — transfer succeeded |
| `payout.markFailed` | Stripe webhook — transfer failed; retry queued |
| `chargeback.record` | Stripe webhook — chargeback received; debits developer balance |
| `refund.process` | Stripe webhook — refund settled; cascades to `PayoutLine` |
| `fingerprint.cluster` | Nightly — recomputes `FingerprintCluster` index |
| `establishedDeveloper.recompute` | Nightly — recomputes `EstablishedDeveloperSnapshot` |
| `tax.formSubmitted` | Stripe Tax webhook — developer's tax form verified; releases `held_no_tax_form` lines |

---

## §5 — UI

### §5.1 — Developer dashboard

`apps/docs-site/src/developer/dashboard/` — the developer-facing surface, gated behind a developer-role login. Sections:

- **Overview** — last-30-day gross + net + payouts pending; chargeback / refund rate badges; established-developer status with qualifying criteria
- **Artefacts** — table of every artefact (draft / published / unpublished / sunset) with version + sales + revenue per row; CTA to create new
- **Sales** — paginated ledger with filters (date range / artefact / customer-country); export to CSV
- **Payouts** — payout-batch history + the upcoming batch's pending-line preview; Stripe transfer status per batch
- **Reviews** — review feed + flag history + the developer's reply surface (replies appear under the review on the public page)
- **Disputes** — chargebacks awaiting dispute deadline; evidence-upload surface
- **Settings** — Stripe Connect account · payout currency · tax-form status · payout schedule (read-only except for Enterprise developer arrangements)

### §5.2 — Customer-facing marketplace

The customer-side marketplace (catalogue + search + detail + install) lives in `apps/editor/src/ui/marketplace/`. C40 governs only the economic UI surfaces:

- **Pricing display** — every artefact lists the current price + the subscription cadence; "billed in your account currency" tooltip
- **Refund button** — in the customer's billing settings, every artefact within the 14-day window shows a one-click refund CTA
- **Review CTA** — after install (or after 7 days of use, whichever comes first), the customer is prompted to leave a review
- **Sunset notice** — when an installed artefact transitions to `sunset`, the project surfaces a non-dismissable banner listing the 30-day countdown + the suggested replacement (if any)

### §5.3 — Curation queue (sales-ops back-office)

`apps/admin-tools/src/curation/` — only accessible to PRYZM staff with the `curator` role. Renders the `pending_review` queue, the per-artefact review checklist, and the decision CTA. Decisions write `CurationDecision` records with hashed reasons (§2.4).

### §5.4 — Developer dispute surface

When a chargeback fires, the developer is notified via email + dashboard. The dispute surface lets them upload evidence (sales records · communication logs · refund attempts); the evidence is forwarded to Stripe via Stripe's dispute API. PRYZM does NOT adjudicate the dispute — Stripe + the customer's bank do.

### §5.5 — Keyboard surface (dev dashboard)

| Key | Effect |
|---|---|
| `Ctrl + K` | Quick-jump (overview / artefacts / sales / payouts / reviews / settings) |
| `N` (in artefacts list) | New draft artefact |
| `R` (in sales list) | Process refund (curated workflow for staff override) |

WCAG 2.2 AA per [C43](C43-ACCESSIBILITY.md) — table rows are screen-reader-announced with column headers; sortable columns are keyboard-operable.

---

## §6 — CI gates

| Gate | Path | What it checks |
|---|---|---|
| `check-payout-formula` | `tools/ga-gate/check-payout-formula.ts` | Every `PayoutLine` satisfies `platformFeeCents == floor(grossCents × 0.30) AND netCents == grossCents - platformFeeCents` (per §1.1 + §2.3) |
| `check-payout-state-machine` | `tools/ga-gate/check-payout-state-machine.ts` | `PayoutLine.state` transitions follow the documented graph (`in_reserve → pending → ready → paid` OR `cancelled` OR `held_no_tax_form`) — illegal transitions rejected |
| `check-tax-form-before-payout` | runtime + CI | No `PayoutLine` transitions to `paid` while `DeveloperAccount.taxFormStatus != 'verified'` (per §1.6) |
| `check-marketplace-spans` | extends `check-spans.ts` | Every public `packages/marketplace-economics/` + `server/marketplace/` boundary function carries an OTel span (per §1.13) |
| `check-marketplace-schemas-pure` | extends schema-purity check | `packages/schemas/src/marketplace/` has zero I/O, zero THREE, zero DOM (per P5) |
| `check-review-requires-purchase` | runtime — schema validator | Every `Review.purchaseId` resolves to an existing `Sale` from the reviewing org (per §1.9) |
| `check-curation-category-allowlist` | `tools/ga-gate/check-curation-category-allowlist.ts` | Artefact manifests declaring curated categories (`pricing-catalogue`, `regulatory-claim`) are routed through `marketplace.submitForReview` not `marketplace.publish` (per §1.11) |
| `check-payout-append-only` | runtime — PG row-level security | `PayoutLine` UPDATEs other than the documented state transitions are rejected at DB level (per §3.5) |
| `check-no-platform-fee-override` | `tools/ga-gate/check-no-platform-fee-override.ts` | No code path overrides the 30 % platform fee (per §1.1); only test fixtures may, and those are isolated |
| `check-pricing-forward-only` | runtime — schema validator | `Sale.grossCents` matches the `ArtefactPrice.priceCents` valid at `Sale.paidAt`; mismatch rejected (per §1.8) |
| `check-discipline-neutral-marketplace` | `tools/ga-gate/check-discipline-neutral-marketplace.ts` | No artefact-kind-specific revenue-share or payout-cadence logic (per §1.15) |
| `check-no-direct-store-write` | eslint rule | UI code under `apps/docs-site/src/developer/` MUST NOT import `PayoutLedgerStore` directly for mutation; only via `commandBus` (per P6) |

### §6.2 — Conformance suites

| Suite | Path | Asserts |
|---|---|---|
| Payout-formula | `packages/marketplace-economics/__tests__/payout-formula.test.ts` | 1000 randomised gross amounts all produce the exact `floor(grossCents × 0.30)` platform fee + net |
| Refund-cascade | `packages/marketplace-economics/__tests__/refund-cascade.test.ts` | A refund within 14 days cancels the paired `PayoutLine`; outside the window the line stays paid |
| Chargeback-flow | `packages/marketplace-economics/__tests__/chargeback.test.ts` | A chargeback after payout reverses developer balance + applies the £15 fee; established-developer fee waiver applies when flag set |
| Established-developer | `packages/marketplace-economics/__tests__/established-developer.test.ts` | Threshold (£10k + 12mo + < 0.5% chargeback) triggers status; degradation in any criterion revokes |
| Fingerprint clustering | `server/marketplace/__tests__/fingerprint.test.ts` | Self-purchase detection across org-clone, payment-method overlap, IP class |
| Tax-form gating | `server/marketplace/__tests__/tax-form-gate.test.ts` | First payout held until tax form verified; release on Stripe Tax webhook |
| Curation queue | `apps/admin-tools/__tests__/curation.test.ts` | Curated artefacts cannot self-publish; reason hash recorded; developer sees high-level reason only |
| Review-requires-purchase | `packages/marketplace-economics/__tests__/review-purchase.test.ts` | Schema rejects reviews without a paired Sale; self-review fingerprint flag fires |

---

## §7 — NFT targets

| NFT | Target | Bench |
|---|---|---|
| Payout batch run (1k developers, ~10k lines) | < 30 s | `payout-batch.bench.ts` (new) |
| Sale → PayoutLine creation latency | < 100 ms | `sale-to-payoutline.bench.ts` (new) |
| Developer dashboard cold load (last 30 days, ~5k sales) | < 800 ms | `dev-dashboard-cold.bench.ts` (new) |
| Sales CSV export (1 year, ~50k rows) | < 5 s | `sales-csv-export.bench.ts` (new) |
| Stripe Connect transfer p95 | < 2 s | inherited from Stripe Connect SLA |
| Fingerprint clustering job (10k orgs) | < 10 min | `fingerprint-cluster.bench.ts` (new) |
| Established-developer recompute (10k developers) | < 5 min | `established-recompute.bench.ts` (new) |
| Curation queue cold load (~100 pending) | < 500 ms | `curation-queue-cold.bench.ts` (new) |

---

## §8 — Migration plan

### §8.1 — New package `packages/marketplace-economics/`

```
packages/marketplace-economics/
  src/
    index.ts                       — composeMarketplaceEconomics() boundary
    payout/
      formula.ts                   — gross → platformFee → net
      stateMachine.ts              — PayoutLine.state transitions
      eligibility.ts               — tax-form + threshold check
    sale/
      record.ts                    — Sale creation + fingerprint capture
      refund.ts                    — refund processing
      chargeback.ts                — chargeback processing
    review/
      gate.ts                      — requires-purchase + self-review flag
      moderation.ts                — spam / hateful / off-topic detection
    establishedDeveloper/
      compute.ts                   — threshold check
      snapshot.ts                  — nightly snapshot writer
    fingerprint/
      cluster.ts                   — clustering algorithm
    curation/
      categorize.ts                — open vs curated routing
      decideRecord.ts              — reason hashing
    schemas/                       — re-exports from packages/schemas/src/marketplace/
```

Wired into `composeRuntime()` at L3 (server-side composition). Browser-side only loads the read-only catalogue + customer-facing surfaces.

### §8.2 — Server-side: `server/marketplace/`

```
server/marketplace/
  SalesLedgerStore.ts              — PG-backed append-only sales ledger
  PayoutLedgerStore.ts             — PG-backed payout ledger
  DeveloperAccountStore.ts         — PG-backed developer accounts
  stripeConnectWebhook.ts          — Connect webhook router → payout state updates
  stripeTaxWebhook.ts              — tax form verified → release held payouts
  payoutCron.ts                    — monthly batch driver
  fingerprintNightlyJob.ts         — nightly fingerprint clustering
  establishedDeveloperNightlyJob.ts — nightly snapshot writer
  curationQueueAPI.ts              — back-office endpoints for /admin/curation
```

### §8.3 — Phased rollout

| Phase | Deliverable | Estimate |
|---|---|---|
| MKT-α-1 | `packages/schemas/src/marketplace/` (all §2 schemas) + zod | 0.5 wk |
| MKT-α-2 | `packages/marketplace-economics/` skeleton + boundary + spans | 0.3 wk |
| MKT-β-1 | SalesLedgerStore + PayoutLedgerStore + DeveloperAccountStore (PG migrations) | 1 wk |
| MKT-β-2 | Sale recording + refund processing + chargeback processing | 1 wk |
| MKT-β-3 | Payout cron + monthly batch driver + Stripe Connect integration | 1 wk |
| MKT-β-4 | Tax-form gating + Stripe Tax webhook | 0.5 wk |
| MKT-γ-1 | Developer dashboard UI (overview / artefacts / sales / payouts / settings) | 2 wk |
| MKT-γ-2 | Curation queue back-office tool | 0.5 wk |
| MKT-γ-3 | Reviews + flag / moderation workflow + self-review detection | 0.5 wk |
| MKT-γ-4 | Fingerprint clustering job + established-developer nightly recompute | 1 wk |
| MKT-δ-1 | Customer-facing refund button + sunset notice + review CTA | 0.5 wk |
| MKT-δ-2 | CI gates (§6) all green | 0.5 wk |

**Total: ~9 wk** (within the master plan's Phase 6.2 budget when paralleled with C39).

### §8.4 — Backward compatibility

The existing marketplace surface (per [C07](C07-PLUGIN-SDK-AND-MARKETPLACE.md) and the PRYZM 2 marketplace API in `server.js`) operates without revenue split today (single-developer-internal mode). The C40 economic layer is greenfield; first published developer artefact is the trigger to enable. No customer migration required.

### §8.5 — Test plan

Per [C03](C03-SCHEMAS-COMMANDS-AND-STATE.md) test convention. Every revenue-affecting code path carries a determinism test (the payout formula MUST never produce drifting results). Every state transition has both a happy-path and a failure-path test. End-to-end: a fixture developer onboards → tax-form completes → publishes → first sale → 14-day reserve elapses → first payout batch → refund → state-cascade → chargeback → dispute.

---

## §9 — What is NOT in this contract

- **Plugin runtime / sandbox / Ed25519 signing** — [C07](C07-PLUGIN-SDK-AND-MARKETPLACE.md). C40 governs the money; C07 governs the runtime.
- **Customer-side pricing tiers** — [C39](C39-PRICING-AND-PLAN-TIERS.md). C40 deals with developer payouts; C39 deals with customer subscriptions.
- **Stripe Connect onboarding UI** — Stripe-hosted; PRYZM redirects to Stripe Connect onboarding via `Stripe.accounts.create()`.
- **Tax filing on behalf of developers** — Stripe Tax + Stripe 1099-K handles this in supported jurisdictions; PRYZM does NOT compute jurisdiction-specific tax.
- **Marketing of the marketplace** — separate marketing/sales track. Featured-placement opportunities (§1.10) are commercially negotiated, not policy.
- **Free artefacts** — pricing model `'free'` is supported (zero `priceCents`); these do NOT generate `PayoutLine` records. Free artefact economics (e.g. sponsored placement) are out of scope for this contract.
- **Bundled / cross-sell pricing** — out of scope. The `'subscription-annual'` model offers an implicit discount but no built-in bundle. Bundles MAY be added with an ADR.
- **Customer review-of-developer separately from artefact** — out of scope. A `Review` is scoped to an artefact, not the developer.
- **Developer trust score / public rating beyond established-developer flag** — out of scope. Public rating is the artefact rating, not the developer.
- **Localised pricing** — Stripe handles per-customer-currency display via Stripe Adaptive Pricing; the artefact's reference price stays in one currency.
- **In-app purchases inside an artefact** — out of scope. An artefact charges once or on the subscription cadence; nested IAP would require a new contract.
- **Affiliate programme** — out of scope.

---

## §10 — Open questions (DRAFT-stage)

1. **VAT-MOSS scheme post-Brexit**. PRYZM is UK-incorporated; EU sellers needing VAT MOSS need clarity on whether PRYZM or the developer files. Stripe Tax handles most but the registered-of-record varies. Sales + legal need to land this before MKT-β-3 ships.
2. **Annual subscription proration on price change**. §1.8 says forward-only — but for annual subscriptions, mid-cycle prorations are common. Open: do we prorate or honour the original price until renewal? Currently leaning honour-until-renewal (simpler + clearer); needs sales-feedback.
3. **Refund window on subscription artefacts**. §1.4 says 14 days. For a £500/year subscription, is 14 days right? Apple App Store does 30 days for subscriptions; should PRYZM match? Decision pending consumer-protection review.
4. **Established-developer threshold**. The £10k + 12mo + < 0.5 % numbers are starting values, not validated. Should they be configurable per category (e.g. easier for first-mover categories like rules-packs)? Open until the first 50 established-developer candidates appear in data.
5. **Currency conversion at settlement vs purchase**. §1.2 says settlement-time. A volatile-FX-period developer could see their net change between sale and payout. Open whether to lock at sale time (developer-favourable, costs PRYZM the FX risk) or stay at settlement (developer absorbs).
6. **Tax-form re-verification cadence**. W-9 / W-8BEN forms are valid for 3 years (US) / 3 years (UK). PRYZM should re-prompt before expiry; the schedule + UI flow are unspecified.
7. **Auto-pause payouts on suspicious activity**. Today the fingerprint job flags but doesn't auto-pause. Should high-confidence laundering signals automatically `held_pending_review` the next payout? Risk of false positives blocking legitimate developers — needs a careful threshold.
8. **Developer-of-record vs author-of-record**. When a developer's organisation has multiple authors, who owns the payout — the org or the author? Current schema is org-level (`DeveloperAccount.orgId`). Multi-author splits (50/50 between two authors of a co-authored family pack) would need a `PayoutSplitRule` table; deferred to post-DRAFT.

---

## §11 — Cross-reference summary

| Contract | Relationship |
|---|---|
| [C03](C03-SCHEMAS-COMMANDS-AND-STATE.md) | P6 — every marketplace mutation through commandBus; schemas L0-pure |
| [C07](C07-PLUGIN-SDK-AND-MARKETPLACE.md) | The runtime + sandbox + signing layer beneath C40's economic layer |
| [C08](C08-COLLABORATION-AND-SECURITY.md) | Developer login + role gating (`developer`, `curator`, `support` roles) |
| [C10](C10-PERFORMANCE-AND-OBSERVABILITY.md) | P8 spans for every payout calculation + dispute event |
| [C13](C13-PROJECT-LIFECYCLE-AND-ISOLATION.md) | Sales-ledger retention follows project-lifecycle retention rules |
| [C16](C16-COMMAND-AUTHORING-PROTOCOL.md) | All `marketplace.*`, `payout.*` commands follow the protocol |
| [C22](C22-PRIVACY-AND-PII-TIER.md) | Developer PII (tax form, bank details) sits in the PII tier |
| [C23](C23-PROVENANCE-AND-AI-AUDIT.md) | Audit trail for payout state transitions + curation decisions |
| [C39](C39-PRICING-AND-PLAN-TIERS.md) | Customer plan tier modulates marketplace install rights; established-developer flag may feed back to customer-side entitlements |
| [C42](C42-CUSTOMER-SUPPORT-TIER.md) | Curation queue staffing + dispute escalation paths |
| [C43](C43-ACCESSIBILITY.md) | Developer dashboard meets WCAG 2.2 AA |
| [C48](C48-BACKUP-AND-DR.md) | Sales-ledger + payout-ledger backup cadence |

---

*End — C40 Marketplace Economics, 2026-06-01 — DRAFT.*
