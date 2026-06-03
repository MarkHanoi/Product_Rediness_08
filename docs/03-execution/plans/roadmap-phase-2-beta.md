# PRYZM — Roadmap Phase 2: Beta (6–18 months)

> **Stamp**: 2026-06-03 · **Status**: CANONICAL · **Horizon**: H2 — phase roadmap
> **Reconciled 2026-06-03** to ADR-055/C51 (`pryzm.so` canonical; `pryzm.app` retired).
> **Window**: 2027-01-01 → 2028-06-30 (~18 months, ~36 sprints of 2 weeks)
> **Authority**: this doc owns **the Phase 2 delivery list** — platform breadth + 10+ typologies + first Enterprise pilots + marketplace flywheel. Sits between [Phase 1 Alpha](./roadmap-phase-1-alpha.md) and [Phase 3 GA](./roadmap-phase-3-ga.md).
> **Foundation above**: [vision-2030.md](./vision-2030.md) themes T1–T5 → Phase 2 is months 7–24 of the arc.

---

## §1 — Phase 2 exit criteria

Phase 2 closes when **all** of these hold:

| # | Criterion | Verification |
|---|---|---|
| **E1** | **10 typologies** shipped (apartment + house + small-office + 7 more per [typology-expansion §5](./typology-expansion-roadmap.md)) | Reference projects × 5 per typology; nightly playwright |
| **E2** | **First 5 Enterprise customers** signed (≥ 50 seats each; per [personas C4](../../01-strategy/personas.md)) | Stripe MRR > $50,000 from Enterprise tier |
| **E3** | **500 paying customers** total across Solo + Studio + Mid-firm + Enterprise | Stripe MRR > $35,000 |
| **E4** | **100 active marketplace developers** (≥ 1 sale in trailing 90 days) | Marketplace dashboard |
| **E5** | **500 marketplace artefacts** published | Marketplace dashboard |
| **E6** | **C24/C28/C29/C30 sheet + data + PDF + drawing-set** capabilities canonical and shipping | Customer can author sheet → export PDF → revision-tracked |
| **E7** | **SOC 2 Type II audit** passed | Auditor report |
| **E8** | **Federated clash detection** (C36) with Solibri + Navisworks live | BCF round-trip nightly with 3 reference projects |
| **E9** | **L5 daylight + acoustic + sightline** perceptual validators live | Validators run on apartment + house + office reference projects |
| **E10** | **EU region** live (Frankfurt primary + Dublin secondary) per [C49](../../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md) | 5+ EU customers running in EU region |

Closure recorded via **ADR-NNN-phase-2-exit-beta.md** (immutable).

---

## §2 — Phase 2 capability buckets

| # | Bucket | Weeks |
|---|---|---|
| **B1** | **7 additional typologies** (co-working + gym + pharmacy + clinic + restaurant + shop + car-park) | ~50 wk |
| **B2** | **C24 Sheet Composition + C29 PDF + C30 Drawing Set + C34 Print Standards** | ~32 wk |
| **B3** | **C27 BIM 3.0 Inspect + C28 Data Panel** | ~30 wk |
| **B4** | **Marketplace flywheel growth** (100 developers; 500 artefacts; featured placement editorial; dev events) | ~12 wk + dev-rel staff |
| **B5** | **First Enterprise pilots** (5 customers; SOC 2 audit; ISO 19650 Phase 1 compliance) | ~25 wk + sales staff |
| **B6** | **EU region launch** (Frankfurt + Dublin) per C49 | ~12 wk |
| **B7** | **L5 perceptual sim** (daylight full + acoustic + sightline) + L7 typology priors (per-typology) | ~14 wk |
| **B8** | **Federated clash detection (C36) + BCF round-trip** | ~10 wk |
| **B9** | **i18n** — first TIER 1 locale ships (de-DE) + first TIER 2 (es-ES) | ~12 wk |
| **B10** | **Accessibility WCAG 2.2 AA external audit pass** (C43) | ~8 wk |
| **B11** | **Sovereignty + BYOK for Enterprise** | ~10 wk |
| **B12** | **Schedules + Data Panel automation** evolution | ~8 wk |

**Total capacity required**: ~223 effective dev-weeks. Phase 2 = 18 months. Team grows from ~13 (Phase 1) → ~30 (Phase 2) per [go-to-market §8.2](../../01-strategy/go-to-market.md).

---

## §3 — Bucket B1: 7 additional typologies (~50 wk)

Per [typology-expansion §5](./typology-expansion-roadmap.md), the typologies shipping in Phase 2:

| # | Typology | Category | Target quarter | Weeks (steady state) |
|---|---|---|---|---|
| 4 | Townhouse / row house | Residential | 2027 Q1 | 7 |
| 5 | Co-living unit | Residential | 2027 Q1 | 7 |
| 6 | Co-working space | Workplace | 2027 Q2 | 7 |
| 7 | Gym / fitness studio | Sports + leisure | 2027 Q2 | 7 |
| 8 | Pharmacy | Healthcare | 2027 Q3 | 7 |
| 9 | GP surgery / clinic | Healthcare | 2027 Q3 | 7 |
| 10 | Restaurant / café | Retail + hospitality | 2027 Q4 | 8 |

Each typology delivers the standard surface (per [typology-expansion §9](./typology-expansion-roadmap.md)):

| Per-typology deliverable | Detail |
|---|---|
| `packages/schemas/src/typology/<id>/` | programRules · roomTypes · validators · furniturePresets |
| `packages/typology-pipeline/src/typologies/<id>/` | registration + wiring |
| `packages/ai-host/src/workflows/<id>Layout/` | AI workflow with retry logic |
| `packages/ai-host/src/workflows/<id>Layout/det/` | Deterministic engine (D-GYM, D-PHARMA, etc.) |
| `packages/typology-pipeline/src/typologies/<id>/validators/` | accessibility · services · regulatory |
| 5 reference projects | `__fixtures__/typologies/<id>/*.pryzm` |
| `apps/editor/src/ui/typology/<id>/IntroPanel.tsx` | Per-typology brief capture |
| SPEC-NN per typology | Spec doc |

### §3.1 — Per-typology highlights

| Typology | Distinguishing pipeline aspect |
|---|---|
| Townhouse | Storey count + party-wall + garden + street-frontage constraints (different from house: row geometry constraints) |
| Co-living | Shared kitchen + shared bathroom + private bedroom programmatic split; privacy gradient differs from apartment |
| Co-working | Membership-tier zoning + meeting-room booking-friendly layout + WiFi acoustic separation |
| Gym | Sound separation (cardio vs studios vs weights) · ventilation per zone · changing-room privacy gradient · accessibility shower count |
| Pharmacy | Controlled-substance storage (volumetric + access-control) · consultation room (GDPR-relevant) · customer queue topology · counter design |
| Clinic | Consultation rooms + waiting area · accessibility · privacy gradient (clinical vs reception) · separate clean/dirty utility |
| Restaurant | Kitchen-to-dining flow · health-code separation (raw meat) · accessibility · WC ratio per cover count · acoustic |

---

## §4 — Bucket B2: Sheet + PDF + Drawing Set (~32 wk)

The "publication-grade output" deliverable for D11 (per [engineering-vision §4](../../01-strategy/engineering-vision.md)).

### §4.1 — C24 Sheet Composition Engine (~14 wk)

| # | Deliverable | Cites |
|---|---|---|
| 4.1 | `plugins/sheets/` UX polish (existing PRYZM 2 base from S37) | [C24 §3](../../02-decisions/contracts/C24-SHEET-COMPOSITION-ENGINE.md) |
| 4.2 | `packages/schemas/src/sheet/` migration from plugin | [C24 §2](../../02-decisions/contracts/C24-SHEET-COMPOSITION-ENGINE.md) |
| 4.3 | Section/elevation viewports — new viewport kinds | [C24 §1.4](../../02-decisions/contracts/C24-SHEET-COMPOSITION-ENGINE.md) |
| 4.4 | Dimension + annotation integration into sheets | [C24 §3](../../02-decisions/contracts/C24-SHEET-COMPOSITION-ENGINE.md) |
| 4.5 | Title block per drawing-standards (DIN + AIA + RIBA + ISO 19650) | [C34](../../02-decisions/contracts/C34-PRINT-AND-DRAWING-STANDARDS.md) |
| 4.6 | Vector renderer for sheets (no raster fallback per CI gate) | [C24 §1.3](../../02-decisions/contracts/C24-SHEET-COMPOSITION-ENGINE.md) |

### §4.2 — C29 PDF Vector Export (~10 wk)

| # | Deliverable | Cites |
|---|---|---|
| 4.7 | `packages/pdf-export/` full implementation of the typed stub | [C29 §1](../../02-decisions/contracts/C29-PDF-VECTOR-EXPORT.md) |
| 4.8 | PDF/A-3 compliance | [C29 §1.4](../../02-decisions/contracts/C29-PDF-VECTOR-EXPORT.md) |
| 4.9 | Tagged-PDF for accessibility | [C29 §1.5](../../02-decisions/contracts/C29-PDF-VECTOR-EXPORT.md) + [C43](../../02-decisions/contracts/C43-ACCESSIBILITY.md) |
| 4.10 | Font embedding + line-weight calibration | [C29 §1.6](../../02-decisions/contracts/C29-PDF-VECTOR-EXPORT.md) |
| 4.11 | Optional IFC-embed (single-deliverable PDF + IFC) | [C29 §1.7](../../02-decisions/contracts/C29-PDF-VECTOR-EXPORT.md) |
| 4.12 | Print-calibration test harness (1m × 1m validation) | [C29 §6](../../02-decisions/contracts/C29-PDF-VECTOR-EXPORT.md) |

### §4.3 — C30 Drawing Set Management (~6 wk)

| # | Deliverable | Cites |
|---|---|---|
| 4.13 | `SheetSetStore` in `packages/stores/` | [C30 §3](../../02-decisions/contracts/C30-DRAWING-SET-MANAGEMENT.md) |
| 4.14 | Revision tracking state machine (draft → issued → superseded) | [C30 §1.2](../../02-decisions/contracts/C30-DRAWING-SET-MANAGEMENT.md) |
| 4.15 | Transmittal package generator (single PDF/A-3 cover + drawing register + N sheets) | [C30 §1.4](../../02-decisions/contracts/C30-DRAWING-SET-MANAGEMENT.md) |
| 4.16 | Revision-cloud annotations | [C30 §1.5](../../02-decisions/contracts/C30-DRAWING-SET-MANAGEMENT.md) |

### §4.4 — C34 Print + Drawing Standards (~2 wk)

| # | Deliverable | Cites |
|---|---|---|
| 4.17 | Drawing-standards pack format (`.pryzm-drawing-standards`) | [C34 §2](../../02-decisions/contracts/C34-PRINT-AND-DRAWING-STANDARDS.md) |
| 4.18 | First 4 standards: AIA + RIBA + DIN + ISO 19650 | [C34 §1.15](../../02-decisions/contracts/C34-PRINT-AND-DRAWING-STANDARDS.md) |
| 4.19 | Per-region default standard applied at project creation | [C46](../../02-decisions/contracts/C46-I18N-AND-L10N.md) |

---

## §5 — Bucket B3: BIM 3.0 Inspect + Data Panel (~30 wk)

### §5.1 — C27 BIM 3.0 Inspect Model (~16 wk)

| # | Deliverable | Cites |
|---|---|---|
| 5.1 | `InspectSelectionStore` in `packages/stores/` | [C27 §3](../../02-decisions/contracts/C27-BIM3-INSPECT-MODEL.md) |
| 5.2 | `IsolationVisibilityIntent` in `packages/visibility/` (P7) | [C27 §3](../../02-decisions/contracts/C27-BIM3-INSPECT-MODEL.md) |
| 5.3 | `IsolationAnimator` in `packages/renderer-three/` (fade-out + fade-in for selection isolation) | [C27 §4](../../02-decisions/contracts/C27-BIM3-INSPECT-MODEL.md) |
| 5.4 | Spatial-relationship resolver across Site → Building → Level → Apartment → Room → ElementType → ElementInstance | [C27 §3](../../02-decisions/contracts/C27-BIM3-INSPECT-MODEL.md) |
| 5.5 | `apps/editor/src/ui/inspect/` — full Inspect panel UI (master tree + per-node dashboards) | [C27 §5](../../02-decisions/contracts/C27-BIM3-INSPECT-MODEL.md) |
| 5.6 | Migration: PropertyInspector (80 files) → Inspect tree | [C27 §8](../../02-decisions/contracts/C27-BIM3-INSPECT-MODEL.md) |
| 5.7 | Per-element-type sub-panel (Door panel · Window panel · Wall panel) | [C27 §5](../../02-decisions/contracts/C27-BIM3-INSPECT-MODEL.md) |

### §5.2 — C28 Data Panel + Automation (~14 wk)

| # | Deliverable | Cites |
|---|---|---|
| 5.8 | `packages/data-engine/` full implementation | [C28 §3](../../02-decisions/contracts/C28-DATA-PANEL-AND-AUTOMATION.md) |
| 5.9 | `DataStore` in `packages/stores/` | [C28 §3](../../02-decisions/contracts/C28-DATA-PANEL-AND-AUTOMATION.md) |
| 5.10 | Unified grid across all element types | [C28 §1.1](../../02-decisions/contracts/C28-DATA-PANEL-AND-AUTOMATION.md) |
| 5.11 | Quality-rules engine sourcing 266+ rules from constraint DB + G-classes + A-classes | [C28 §1.2](../../02-decisions/contracts/C28-DATA-PANEL-AND-AUTOMATION.md) |
| 5.12 | Bulk-edit commands through commandBus (P6) | [C28 §1.3](../../02-decisions/contracts/C28-DATA-PANEL-AND-AUTOMATION.md) |
| 5.13 | Tier 1/2/3 rule execution (on-edit / on-save / on-demand) | [C28 §1.4](../../02-decisions/contracts/C28-DATA-PANEL-AND-AUTOMATION.md) |
| 5.14 | Export to Excel/CSV/JSON/IFC-Pset/SQL | [C28 §4](../../02-decisions/contracts/C28-DATA-PANEL-AND-AUTOMATION.md) |
| 5.15 | Cron scheduling + email-on-violation | [C28 §4](../../02-decisions/contracts/C28-DATA-PANEL-AND-AUTOMATION.md) |

---

## §6 — Bucket B4: Marketplace flywheel growth (~12 wk + dev-rel staffing)

| # | Deliverable | Cites |
|---|---|---|
| 6.1 | Developer relations hire (full-time) | [platform-strategy §10.2](../../01-strategy/platform-strategy.md) |
| 6.2 | First plugin-developer hackathon (1 in 2027 Q2) | [platform-strategy §10.2](../../01-strategy/platform-strategy.md) |
| 6.3 | Marketplace editorial featured-placement (weekly curated picks) | [C40 §1.10](../../02-decisions/contracts/C40-MARKETPLACE-ECONOMICS.md) |
| 6.4 | First 10 typology packs community-authored (alongside 4 PRYZM-first-party Q2 typologies) | [typology §8](./typology-expansion-roadmap.md) |
| 6.5 | Family-platform expansion: more sketcher tools in component-editor | [C07] |
| 6.6 | Plugin-author monthly newsletter | [platform-strategy §10.2](../../01-strategy/platform-strategy.md) |
| 6.7 | Multi-language SDK docs (en + de + fr) | [C46](../../02-decisions/contracts/C46-I18N-AND-L10N.md) |
| 6.8 | Established-developer programme (per [C40 §1.10](../../02-decisions/contracts/C40-MARKETPLACE-ECONOMICS.md)) — first 10 qualifying | NEW |

**Target end-of-Phase-2**: 100 active developers · 500 artefacts · 1 established-developer per [C40 §1.10](../../02-decisions/contracts/C40-MARKETPLACE-ECONOMICS.md).

---

## §7 — Bucket B5: First Enterprise pilots (~25 wk)

| # | Deliverable | Detail |
|---|---|---|
| 7.1 | Account executive hire | per [go-to-market §8.2](../../01-strategy/go-to-market.md) |
| 7.2 | SOC 2 Type II audit prep + audit run | External auditor (Drata, Vanta, Strike Graph or similar); 6-month observation period |
| 7.3 | SAML SSO implementation (Okta · Azure AD · Google Workspace) | Currently NOT shipped — Phase 2 deliverable |
| 7.4 | Password reset flow + multi-factor auth (TOTP) | Currently NOT shipped |
| 7.5 | Audit log surface (every customer-data access) + 7-year retention | [C13](../../02-decisions/contracts/C13-PROJECT-LIFECYCLE-AND-ISOLATION.md) + [C23](../../02-decisions/contracts/C23-PROVENANCE-AND-AI-AUDIT.md) |
| 7.6 | Custom Enterprise contract templates (legal team) | per [C49 §1.5](../../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md) Enterprise data-residency clause |
| 7.7 | Named CSM SLA for Enterprise tier | per [C42 §1.1](../../02-decisions/contracts/C42-CUSTOMER-SUPPORT-TIER.md) |
| 7.8 | Custom-CRS surface (Enterprise customers bring their own coordinate system) | extends [C12](../../02-decisions/contracts/C12-GEOSPATIAL.md) |
| 7.9 | First 5 Enterprise customers onboarded | Sales motion per [go-to-market §2.3](../../01-strategy/go-to-market.md) |

---

## §8 — Bucket B6: EU region launch (~12 wk)

| # | Deliverable | Cites |
|---|---|---|
| 8.1 | EU region primary (eu-central-1 / Frankfurt) production deployment | [C49 §1.2](../../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md) |
| 8.2 | EU region secondary (eu-west-1 / Dublin) standby + failover testing | [C49 §1.3](../../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md) |
| 8.3 | Cloudflare DNS region routing (`eu.pryzm.so` subdomain) | [C49 §1.7](../../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md) |
| 8.4 | Region-scoped JWT tokens with `iss` claim | [C49 §1.6](../../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md) |
| 8.5 | Wrong-region redirect UX | [C49 §5.4](../../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md) |
| 8.6 | Cross-region access gate + audit ledger | [C49 §1.4](../../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md) |
| 8.7 | First DR drill across EU region failover | [C48 §1.11](../../02-decisions/contracts/C48-BACKUP-AND-DR.md) |
| 8.8 | Migrate 5 willing EU customers to EU region | Customer success motion |

---

## §9 — Bucket B7: L5 perceptual + L7 typology priors (~14 wk)

| # | Deliverable | Cites |
|---|---|---|
| 9.1 | Daylight full simulation (vs the rule-checker shipped in Phase 1) — Radiance integration or custom | [site-and-cognition §3.4](../../01-strategy/site-and-cognition-strategy.md) |
| 9.2 | Acoustic separation validator (sound transmission between rooms) | [site-and-cognition §3.4](../../01-strategy/site-and-cognition-strategy.md) |
| 9.3 | Sightline / visual-connectivity analysis | [site-and-cognition §3.4](../../01-strategy/site-and-cognition-strategy.md) |
| 9.4 | Thermal-comfort heuristics (Q1 first slice) | [C21] |
| 9.5 | L7 typology priors expand to 10 typologies (apartment + 9 more) | [typology §6](./typology-expansion-roadmap.md) |
| 9.6 | Constraint-violation visualisation in inspect tree with severity colours | [C27 §5](../../02-decisions/contracts/C27-BIM3-INSPECT-MODEL.md) |

---

## §10 — Bucket B8: Federated clash + BCF (~10 wk)

| # | Deliverable | Cites |
|---|---|---|
| 10.1 | `packages/clash-detection/` NEW — generic clash engine | [C36](../../02-decisions/contracts/C36-CLASH-DETECTION-AND-COORDINATION.md) |
| 10.2 | BCF 3.0 round-trip with Solibri (`plugins/bcf/` polish) | [C36 §1.4](../../02-decisions/contracts/C36-CLASH-DETECTION-AND-COORDINATION.md) |
| 10.3 | BCF round-trip with Navisworks | [C36 §1.4](../../02-decisions/contracts/C36-CLASH-DETECTION-AND-COORDINATION.md) |
| 10.4 | BCF round-trip with BIMcollab | [C36 §1.4](../../02-decisions/contracts/C36-CLASH-DETECTION-AND-COORDINATION.md) |
| 10.5 | Clash detection UI panel | [C36 §5](../../02-decisions/contracts/C36-CLASH-DETECTION-AND-COORDINATION.md) |
| 10.6 | Per-clash severity + workflow assignment | [C36 §3](../../02-decisions/contracts/C36-CLASH-DETECTION-AND-COORDINATION.md) |
| 10.7 | First 3 federated-clash reference projects (mid-firm customer-validated) | Customer success |

---

## §11 — Bucket B9: Internationalisation (~12 wk)

| # | Deliverable | Cites |
|---|---|---|
| 11.1 | en-GB locale bundle (overrides for UK English vs en-US) | [C46](../../02-decisions/contracts/C46-I18N-AND-L10N.md) |
| 11.2 | de-DE locale bundle (TIER 1 first) — AI-translated + human-reviewed | [C46 §1.2](../../02-decisions/contracts/C46-I18N-AND-L10N.md) |
| 11.3 | fr-FR locale bundle (TIER 1 second) | [C46 §1.2](../../02-decisions/contracts/C46-I18N-AND-L10N.md) |
| 11.4 | ja-JP locale bundle (TIER 1 third — AP market) | [C46 §1.2](../../02-decisions/contracts/C46-I18N-AND-L10N.md) |
| 11.5 | es-ES locale bundle (TIER 2 first) | [C46 §1.2](../../02-decisions/contracts/C46-I18N-AND-L10N.md) |
| 11.6 | Locale switcher UI + per-project unit-system override | [C46 §5](../../02-decisions/contracts/C46-I18N-AND-L10N.md) |
| 11.7 | Architectural-units doctrine: project unitSystem vs user display preference | [C46 §1.1](../../02-decisions/contracts/C46-I18N-AND-L10N.md) |
| 11.8 | IFC export carries unit declaration matching project (not user display) | [C46 §1.8](../../02-decisions/contracts/C46-I18N-AND-L10N.md) |
| 11.9 | AI host locale-aware system prompts + per-locale glossary | [C46 §1.7](../../02-decisions/contracts/C46-I18N-AND-L10N.md) |

---

## §12 — Bucket B10: Accessibility WCAG 2.2 AA external audit (~8 wk)

| # | Deliverable | Cites |
|---|---|---|
| 12.1 | All `critical` + `serious` axe-core violations remediated | [C43 §6](../../02-decisions/contracts/C43-ACCESSIBILITY.md) |
| 12.2 | Screen-reader QA pass (NVDA · JAWS · VoiceOver) | [C43 §1.5](../../02-decisions/contracts/C43-ACCESSIBILITY.md) |
| 12.3 | External accreditation audit (Deque or TPG) | [C43 §1.13](../../02-decisions/contracts/C43-ACCESSIBILITY.md) |
| 12.4 | VPAT 2.5-INT first publication | [C43 §1.14](../../02-decisions/contracts/C43-ACCESSIBILITY.md) |
| 12.5 | Accessibility statement page live at `pryzm.so/accessibility` | [C43 §5.3](../../02-decisions/contracts/C43-ACCESSIBILITY.md) |
| 12.6 | Report-an-accessibility-issue flow | [C43 §5.6](../../02-decisions/contracts/C43-ACCESSIBILITY.md) |

---

## §13 — Bucket B11: Sovereignty + BYOK (~10 wk)

| # | Deliverable | Cites |
|---|---|---|
| 13.1 | AWS KMS integration for per-region encryption keys | [C49 §1.3](../../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md) + [C48](../../02-decisions/contracts/C48-BACKUP-AND-DR.md) |
| 13.2 | BYOK onboarding flow (Enterprise customer connects their KMS) | [C49 §1.3](../../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md) |
| 13.3 | `data.residency.eu` + `data.residency.us` entitlement gates | [C39](../../02-decisions/contracts/C39-PRICING-AND-PLAN-TIERS.md) |
| 13.4 | Region-migration workflow (Enterprise customer moves from EU → UK) | [C49 §1.9](../../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md) |
| 13.5 | Compliance evidence package (one-stop bundle for procurement) | NEW |

---

## §14 — Bucket B12: Schedules + Data Panel automation evolution (~8 wk)

Building on Phase 1 deliverables:

| # | Deliverable |
|---|---|
| 14.1 | Schedule rules engine: 50+ pre-built rules + per-typology rule packs |
| 14.2 | Automation surface: cron-scheduled rule runs + email-on-violation |
| 14.3 | API surface for third-party schedule consumers (Data Panel API per C28) |
| 14.4 | Cost catalog import (RSMeans + BCIS preview — full 5D in Phase 3) |

---

## §15 — Contract gap closures in Phase 2

| Contract | Phase 1 state | Phase 2 closure |
|---|---|---|
| C19/C20/C21 | CANONICAL (Phase 1) | Stable + expansion to 10 typologies |
| C22 PII | Partial | Full ratification — DSAR live across all tiers |
| C23 Provenance | Partial | Full ratification |
| **C24 Sheet Composition** | DRAFT | **CANONICAL** |
| **C27 BIM 3.0 Inspect** | Partial | **CANONICAL** |
| **C28 Data Panel** | DRAFT | **CANONICAL** |
| **C29 PDF Vector Export** | DRAFT | **CANONICAL** |
| **C30 Drawing Set** | DRAFT | **CANONICAL** |
| **C34 Print Standards** | DRAFT | **CANONICAL** (with 4 standards) |
| **C36 Clash Detection** | DRAFT | **CANONICAL** |
| C39 Pricing | Partial | Stable + multi-currency + first regional discounts |
| C40 Marketplace | Partial | Stable + established-developer programme live |
| C41 Telemetry | Partial | Stable + per-locale consent regimes |
| **C43 Accessibility** | Partial | **CANONICAL** (external audit pass) |
| C44 Mobile + Tablet | Partial | Stable + Mid-firm-tier mobile use cases |
| **C45 Browser + Device Matrix** | Partial | **CANONICAL** (full TIER 1 + TIER 2) |
| **C46 i18n + L10n** | Partial | Stable + 5 TIER 1/2 locales |
| C48 Backup + DR | Partial | Stable + quarterly drill cadence |
| **C49 Multi-Region** | DRAFT | Partial — EU region live; US + AP + UK in Phase 3 |
| **C50 Typology Pipeline** | DRAFT | **CANONICAL** (10 typologies) |
| **Future C51 (proposed)** — Customer Onboarding Pipeline | NEW | DRAFT |

**Summary**: 11 contracts move to CANONICAL in Phase 2; 1 new (C50) ratifies; new C51 drafted.

---

## §16 — Risk + dependency register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | SOC 2 audit fails on first attempt | Medium | High (Enterprise pipeline stalls) | 6-month pre-audit observation period; remediation budget allocated |
| R2 | EU region launch reveals data-residency edge cases | Medium | Medium | Customer pilots in EU before public open |
| R3 | Typology pipeline doesn't scale to gym/pharmacy (cognition gap) | Medium | High | Architect-consultant per typology; reference project early in cycle |
| R4 | Marketplace flywheel slower than projected (< 50 developers by mid-Phase) | Medium | Medium | Dev-rel hire + hackathon + referral programme |
| R5 | First Enterprise customer's IT team rejects browser-only stance | Low | Medium | Self-host option as exception path |
| R6 | Inspect tree migration breaks Property Inspector backward-compat | Medium | High | 6-month dual-run period; per-feature opt-in |
| R7 | PDF export print-calibration fails on a major printer driver | Medium | Medium | 5-printer matrix test |

---

## §17 — Cross-references

| Doc | Relationship |
|---|---|
| [vision-2030.md](./vision-2030.md) | Phase 2 = months 7–24 of the 5-year arc |
| [roadmap-phase-1-alpha.md](./roadmap-phase-1-alpha.md) | Predecessor — Phase 1 foundations |
| [roadmap-phase-3-ga.md](./roadmap-phase-3-ga.md) | Successor — GA + multi-region full |
| [typology-expansion-roadmap.md](./typology-expansion-roadmap.md) | 10 typologies shipping = Phase 2 |
| [annual-2027.md](./annual-2027.md) | Most of Phase 2 = 2027 (year 2) |
| [roadmap-enterprise-delivery.md](./roadmap-enterprise-delivery.md) | First Enterprise pilots = Phase 2 |
| [cadence-and-planning-system.md](./cadence-and-planning-system.md) | This is H2; quarterly is H4 derivative |

---

*End — PRYZM Roadmap Phase 2: Beta, 2026-06-03 (reconciled to ADR-055/C51) — CANONICAL.*
