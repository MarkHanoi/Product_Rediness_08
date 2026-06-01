# PRYZM — Master Execution Tracker

> **Stamp**: 2026-06-01 · **Status**: CANONICAL · **The day-to-day navigation tracker**
> **Purpose**: ONE table answering "what's the next thing to do?" — every active sub-phase across Phases A/B/C with goal, description+refs, status.
> **Companion to**: the layered plans ([cadence-and-planning-system.md](./cadence-and-planning-system.md) explains the planning system; this doc is the operational view across all horizons).
> **Update cadence**: at every sprint close + on any major status change. PR + review.

---

## §1 — How to read this tracker

- **Phase letter** (A · B · C) maps to roadmap phase: A=Alpha (0-6mo), B=Beta (6-18mo), C=GA (18-36mo).
- **Sub-phase** is a numbered increment within the phase (A.1, A.2, …).
- **Goal**: the one-line deliverable.
- **Description + refs**: detail + links to the canonical contract/spec/plan.
- **Status**: see §2.

## §2 — Status legend

| Status | Meaning |
|---|---|
| ✅ DONE | Shipped + acceptance criteria met + in production |
| 🟢 IN PROGRESS | Active work in current/next sprint |
| 🟡 NEXT UP | Scheduled for the next 2 sprints |
| ⚪ PLANNED | Scheduled later in this phase |
| 🔴 BLOCKED | Cannot proceed without dependency resolution |
| 🔵 DEFERRED | Pushed out beyond this phase by deliberate decision |
| ⚫ CLOSED-DEFERRED | Decided not to ship; ADR recorded |

---

## §3 — Phase A — Alpha (Current; 2026-Q3 to 2026-Q4; ~6 months)

**Phase A exit criteria**: see [roadmap-phase-1-alpha.md §1](./roadmap-phase-1-alpha.md). 10 criteria (E1–E10). Closure ADR raised at end of 2026-Q4.

### §3.1 — Phase A capability buckets + sub-phases

| Phase | Goal | Description + references | Status |
|---|---|---|---|
| **A.1** | **TypologyPipeline package scaffold** | NEW `packages/typology-pipeline/` + `composeRuntime()` slot integration. Refs: [phase-1-alpha §3.1](./roadmap-phase-1-alpha.md), [typology-expansion §4](./typology-expansion-roadmap.md). Owner: Engineer 1. | 🟢 IN PROGRESS (Sprint 1) |
| **A.2** | **TypologyManifest schema** | `packages/schemas/src/typology/manifest.ts` — zod-validated TypologyManifest. Refs: [typology-expansion §4.1](./typology-expansion-roadmap.md). | 🟢 IN PROGRESS (Sprint 1) |
| **A.3** | **TypologyRegistry slot + dispatch router** | TypologyRegistryStore reactive + TypologyPipelineRouter.dispatch(typologyId, role, site, brief). Refs: [typology-expansion §4.2–4.3](./typology-expansion-roadmap.md). | 🟡 NEXT UP (Sprint 2) |
| **A.4** | **Apartment refactored as TypologyPack** | Existing `apartmentLayout` → `packages/typology-pipeline/src/typologies/apartment/`. Refs: [phase-1-alpha §3.2](./roadmap-phase-1-alpha.md). | 🟡 NEXT UP (Sprint 2) |
| **A.5** | **RAC chatbot UI v1** | `apps/editor/src/ui/onboarding/RACChatbot.tsx` — role + typology + brief flow. Refs: [product-vision §5 Step 2](../../01-strategy/product-vision.md), [typology-expansion §2](./typology-expansion-roadmap.md). | ⚪ PLANNED (Sprint 3) |
| **A.6** | **TypologyPicker UI** | 10-category card grid. Refs: [typology-expansion §3](./typology-expansion-roadmap.md). | ⚪ PLANNED (Sprint 3) |
| **A.7** | **C19 Site element schemas + SiteStore** | NEW `packages/schemas/src/site/` + `SiteStore`. Refs: [C19](../../02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md), [phase-1-alpha §4.1](./roadmap-phase-1-alpha.md). | 🟢 IN PROGRESS (Sprint 1–2) |
| **A.8** | **Site authoring UI (Cesium-light)** | Cream/warm-white map aesthetic per [product-vision §5 Step 3](../../01-strategy/product-vision.md). Refs: [phase-1-alpha §4.1.4](./roadmap-phase-1-alpha.md). | ⚪ PLANNED (Sprint 3–4) |
| **A.9** | **IFC4X3 `IfcSite` round-trip** | Through `plugins/ifc-export/` + `plugins/ifc-import/`. Refs: [C25 §3](../../02-decisions/contracts/C25-IFC-EXPORT-PRODUCTION.md). | ⚪ PLANNED (Sprint 3) |
| **A.10** | **C21 Climate ingestion (EPW + NOAA)** | NEW `packages/climate/`. Refs: [C21](../../02-decisions/contracts/C21-CLIMATE-INGESTION.md), [phase-1-alpha §4.3](./roadmap-phase-1-alpha.md). | ⚪ PLANNED (Sprint 3–6) |
| **A.11** | **Climate substrate UI panel** | Sun-path + wind-rose + temperature/humidity profiles. Refs: [phase-1-alpha §4.3](./roadmap-phase-1-alpha.md). | ⚪ PLANNED (Sprint 4) |
| **A.12** | **`@pryzm/sdk` npm publish (OI-011)** | `pnpm --filter @pryzm/plugin-sdk publish --access public`. Refs: [phase-1-alpha §5.1](./roadmap-phase-1-alpha.md). | 🔴 BLOCKED (npm token + 2FA setup required) |
| **A.13** | **`@pryzm/headless` npm publish (OI-012)** | Same as A.12 for headless. Refs: [phase-1-alpha §5.2](./roadmap-phase-1-alpha.md). | 🔴 BLOCKED (same as A.12) |
| **A.14** | **DNS `marketplace.pryzm.app` (OI-013)** | Cloudflare DNS + TLS cert. Refs: [phase-1-alpha §5.3](./roadmap-phase-1-alpha.md). | 🟡 NEXT UP (Sprint 1) |
| **A.15** | **First 5 PRYZM-first-party plugins listed** | BCF · IFC-Export · DXF · Multiplayer · Cesium-bridge. Refs: [phase-1-alpha §5.7](./roadmap-phase-1-alpha.md). | ⚪ PLANNED (Sprint 2–4) |
| **A.16** | **Marketplace UX polish** | browse + filter + detail + install flow. Refs: [phase-1-alpha §5.4](./roadmap-phase-1-alpha.md). | ⚪ PLANNED (Sprint 3) |
| **A.17** | **`pryzm.app` domain cutover** | From `pryzm.so` legacy; landing-page rebuild per [manifesto §5 brand voice](../../01-strategy/manifesto.md). Refs: [phase-1-alpha §8](./roadmap-phase-1-alpha.md). | 🟡 NEXT UP (Sprint 1–5) |
| **A.18** | **Pricing page from entitlement registry** | `apps/docs-site/src/pricing.tsx` reads `entitlementRegistry.ts` at build. Refs: [C39 §1.13](../../02-decisions/contracts/C39-PRICING-AND-PLAN-TIERS.md). | ⚪ PLANNED (Sprint 3) |
| **A.19** | **Brand-voice content sweep** | Every customer-facing string audited against [manifesto §5](../../01-strategy/manifesto.md). | ⚪ PLANNED (Sprint 5) |
| **A.20** | **C50 Typology Pipeline contract — DRAFT** | NEW contract. Refs: [typology-expansion §10](./typology-expansion-roadmap.md). | 🟡 NEXT UP (Sprint 2) |
| **A.21** | **House typology end-to-end** | T2 ship. 12 room types + AI workflow + D-HOUSE + validators + 5 reference projects. Refs: [phase-1-alpha §3.3](./roadmap-phase-1-alpha.md), [typology-expansion §5](./typology-expansion-roadmap.md). | ⚪ PLANNED (Sprint 7–9) |
| **A.22** | **Small-Office typology end-to-end** | T3 ship. 8 room types + AI workflow + D-OFFICE + validators + 5 reference projects. Refs: [phase-1-alpha §3.4](./roadmap-phase-1-alpha.md). | ⚪ PLANNED (Sprint 10–12) |
| **A.23** | **C20 Building + Apartment Aggregates ratification** | Site → Building → Level → Apartment → Room schemas. Refs: [C20](../../02-decisions/contracts/C20-BUILDING-AND-APARTMENT-AGGREGATES.md). | ⚪ PLANNED (Sprint 7–9) |
| **A.24** | **Inspect tree wired with aggregates** | Site → Building → Level → Apartment → Room → Element hierarchy. Refs: [C27 §3](../../02-decisions/contracts/C27-BIM3-INSPECT-MODEL.md). | ⚪ PLANNED (Sprint 8) |
| **A.25** | **IFC4X3 Pset coverage gap-fill** | All shipped element types export canonical Pset; `IfcSpace` + `IfcZone` + `IfcFurniture` coverage. Refs: [C25 §3](../../02-decisions/contracts/C25-IFC-EXPORT-PRODUCTION.md), [phase-1-alpha §9](./roadmap-phase-1-alpha.md). | ⚪ PLANNED (Sprint 7–9) |
| **A.26** | **Revit IFC4X3-RV variant exporter** | The Revit-import-friendly variant. Refs: [C26](../../02-decisions/contracts/C26-REVIT-ROUND-TRIP.md). | ⚪ PLANNED (Sprint 8) |
| **A.27** | **10-project IFC round-trip nightly** | Reference suite per [C25 §6](../../02-decisions/contracts/C25-IFC-EXPORT-PRODUCTION.md). | ⚪ PLANNED (Sprint 9) |
| **A.28** | **First 3 community-authored family packs** | IKEA-style kitchen system · UK door catalogue · JIS-spec window catalogue. Refs: [phase-1-alpha §6.4](./roadmap-phase-1-alpha.md). | ⚪ PLANNED (Sprint 8–9) |
| **A.29** | **Family marketplace UX polish** | 3D preview · Ed25519 verify badge · install flow. Refs: [phase-1-alpha §6](./roadmap-phase-1-alpha.md). | ⚪ PLANNED (Sprint 8) |
| **A.30** | **C22 PII tier — partial ratification** | DSAR export + erasure endpoints + privacy settings UI. Refs: [C22](../../02-decisions/contracts/C22-PRIVACY-AND-PII-TIER.md), [phase-1-alpha §7.1](./roadmap-phase-1-alpha.md). | ⚪ PLANNED (Sprint 4–6) |
| **A.31** | **C23 Provenance graph — partial ratification** | Per-AI-artefact provenance graph + UI in inspect tree. Refs: [C23](../../02-decisions/contracts/C23-PROVENANCE-AND-AI-AUDIT.md), [phase-1-alpha §7.2](./roadmap-phase-1-alpha.md). | ⚪ PLANNED (Sprint 6, 11) |
| **A.32** | **WCAG axe-core CI: critical + serious all green** | All `critical` + `serious` axe violations remediated. Refs: [C43 §6](../../02-decisions/contracts/C43-ACCESSIBILITY.md), [phase-1-alpha §7.3](./roadmap-phase-1-alpha.md). | ⚪ PLANNED (Sprint 8–10) |
| **A.33** | **Keyboard registry + cheat-sheet UI** | All editor tools registered; `?` cheat-sheet modal. Refs: [C43 §1.3](../../02-decisions/contracts/C43-ACCESSIBILITY.md). | ⚪ PLANNED (Sprint 8) |
| **A.34** | **Color-contrast token sweep** | All foreground/background pairs ≥ AA. Refs: [C43 §1.5](../../02-decisions/contracts/C43-ACCESSIBILITY.md). | ⚪ PLANNED (Sprint 9) |
| **A.35** | **C48 Backup + DR runbooks** | Per-failure-mode runbooks: DB primary fail · ransomware · accidental delete · regional outage. Refs: [C48 §1.10](../../02-decisions/contracts/C48-BACKUP-AND-DR.md). | ⚪ PLANNED (Sprint 10) |
| **A.36** | **C48 First DR drill (simulated PG primary failure)** | Drill + retrospective + runbook v2. Refs: [C48 §1.11](../../02-decisions/contracts/C48-BACKUP-AND-DR.md). | ⚪ PLANNED (Sprint 11) |
| **A.37** | **Cognition L1–L4 hardening — 100 new rules code-enforced** | 152 → 252 rules (out of 248-spec total; some are spec-expansion). Refs: [phase-1-alpha §10](./roadmap-phase-1-alpha.md). | ⚪ PLANNED (Sprint 2–12, continuous) |
| **A.38** | **L5 daylight rule-checker** | Mandatory window per room + minimum aperture. Refs: [phase-1-alpha §10.2](./roadmap-phase-1-alpha.md). | ⚪ PLANNED (Sprint 7) |
| **A.39** | **L5 perceptual evaluator (corridor width · sightline · aspect ratio)** | First-pass perceptual layer. Refs: [phase-1-alpha §10.3](./roadmap-phase-1-alpha.md). | ⚪ PLANNED (Sprint 8) |
| **A.40** | **First 50 paying customers** | Solo + Studio PLG. Target $1500 MRR. Refs: [phase-1-alpha §1 E8](./roadmap-phase-1-alpha.md). | ⚪ PLANNED (Sprint 6–12, marketing-led) |
| **A.41** | **Phase 1 exit ADR (ADR-NNN-phase-1-exit-alpha)** | Immutable closure decision. Refs: [phase-1-alpha §1](./roadmap-phase-1-alpha.md), [cadence §6](./cadence-and-planning-system.md). | ⚪ PLANNED (Sprint 12–13, end-Q4) |

---

## §4 — Phase B — Beta (6–18 months; 2027-Q1 to 2028-Q2; ~18 months)

**Phase B exit criteria**: see [roadmap-phase-2-beta.md §1](./roadmap-phase-2-beta.md). 10 criteria. Closure ADR at end of 2028-Q2.

| Phase | Goal | Description + references | Status |
|---|---|---|---|
| **B.1** | Townhouse / row-house typology (T4) | Per [typology-expansion §5](./typology-expansion-roadmap.md) #4. Q1 2027. | 🔵 DEFERRED (Phase B) |
| **B.2** | Co-living unit typology (T5) | #5. Q1 2027. | 🔵 DEFERRED |
| **B.3** | Co-working space typology (T6) | #6. Q2 2027. | 🔵 DEFERRED |
| **B.4** | Gym / fitness studio typology (T7) | #7. Q2 2027. D-GYM engine. | 🔵 DEFERRED |
| **B.5** | Pharmacy typology (T8) | #8. Q3 2027. D-PHARMA engine + controlled-substance storage + GDPR-relevant consultation room. | 🔵 DEFERRED |
| **B.6** | GP surgery / clinic typology (T9) | #9. Q3 2027. | 🔵 DEFERRED |
| **B.7** | Restaurant / café typology (T10) | #10. Q4 2027. | 🔵 DEFERRED |
| **B.8** | **C24 Sheet Composition Engine — CANONICAL** | Vector renderer + viewports + section/elevation. Refs: [C24](../../02-decisions/contracts/C24-SHEET-COMPOSITION-ENGINE.md), [phase-2-beta §4.1](./roadmap-phase-2-beta.md). | 🔵 DEFERRED |
| **B.9** | **C29 PDF Vector Export — CANONICAL** | `packages/pdf-export/` implementation + PDF/A-3 + Tagged-PDF. Refs: [C29](../../02-decisions/contracts/C29-PDF-VECTOR-EXPORT.md). | 🔵 DEFERRED |
| **B.10** | **C30 Drawing Set Management — CANONICAL** | `SheetSetStore` + revision tracking + transmittal package. Refs: [C30](../../02-decisions/contracts/C30-DRAWING-SET-MANAGEMENT.md). | 🔵 DEFERRED |
| **B.11** | **C34 Print + Drawing Standards (4 standards)** | AIA + RIBA + DIN + ISO 19650. Refs: [C34](../../02-decisions/contracts/C34-PRINT-AND-DRAWING-STANDARDS.md). | 🔵 DEFERRED |
| **B.12** | **C27 BIM 3.0 Inspect Model — CANONICAL** | Full Inspect tree + isolation animator + spatial resolver. Refs: [C27](../../02-decisions/contracts/C27-BIM3-INSPECT-MODEL.md), [phase-2-beta §5.1](./roadmap-phase-2-beta.md). | 🔵 DEFERRED |
| **B.13** | **C28 Data Panel + Automation — CANONICAL** | Unified grid + quality-rules engine + bulk-edit + export + cron. Refs: [C28](../../02-decisions/contracts/C28-DATA-PANEL-AND-AUTOMATION.md). | 🔵 DEFERRED |
| **B.14** | **EU region launch (Frankfurt + Dublin)** | Per [C49 §1.2](../../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md). | 🔵 DEFERRED |
| **B.15** | **Region-scoped JWT + wrong-region redirect** | Per [C49 §1.6](../../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md). | 🔵 DEFERRED |
| **B.16** | **Cross-region access gate + audit ledger** | Per [C49 §1.4](../../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md). | 🔵 DEFERRED |
| **B.17** | **First 5 Enterprise customers signed** | Per [roadmap-enterprise-delivery §6](./roadmap-enterprise-delivery.md). | 🔵 DEFERRED |
| **B.18** | **SOC 2 Type II audit pass** | 6-month observation + external audit. Refs: [phase-2-beta §7.2](./roadmap-phase-2-beta.md). | 🔵 DEFERRED |
| **B.19** | **SAML SSO (Okta · Azure AD · Google Workspace)** | Currently NOT shipped — Phase 2. Refs: [phase-2-beta §7.3](./roadmap-phase-2-beta.md). | 🔵 DEFERRED |
| **B.20** | **Password reset + multi-factor auth (TOTP)** | Currently NOT shipped — Phase 2. | 🔵 DEFERRED |
| **B.21** | **Audit log surface + 7-year retention** | Per [C13](../../02-decisions/contracts/C13-PROJECT-LIFECYCLE-AND-ISOLATION.md) + [C23](../../02-decisions/contracts/C23-PROVENANCE-AND-AI-AUDIT.md). | 🔵 DEFERRED |
| **B.22** | **C36 Federated clash + BCF round-trip** | Solibri + Navisworks + BIMcollab. Refs: [C36](../../02-decisions/contracts/C36-CLASH-DETECTION-AND-COORDINATION.md). | 🔵 DEFERRED |
| **B.23** | **L5 daylight full simulation** (vs Phase A's rule-checker) | Radiance integration or custom solver. Refs: [phase-2-beta §9.1](./roadmap-phase-2-beta.md). | 🔵 DEFERRED |
| **B.24** | **L5 acoustic separation validator** | Sound transmission between rooms. Refs: [phase-2-beta §9.2](./roadmap-phase-2-beta.md). | 🔵 DEFERRED |
| **B.25** | **L7 typology priors expand to 10 typologies** | Apartment + 9 more priors. | 🔵 DEFERRED |
| **B.26** | **i18n TIER 1: en-GB + de-DE + fr-FR + ja-JP** | Per [C46](../../02-decisions/contracts/C46-I18N-AND-L10N.md). | 🔵 DEFERRED |
| **B.27** | **i18n TIER 2: es-ES first** | Per [C46 §1.2](../../02-decisions/contracts/C46-I18N-AND-L10N.md). | 🔵 DEFERRED |
| **B.28** | **Locale switcher + per-project unit-system** | Per [C46 §5](../../02-decisions/contracts/C46-I18N-AND-L10N.md). | 🔵 DEFERRED |
| **B.29** | **WCAG 2.2 AA external audit (Deque/TPG) + first VPAT** | Per [C43 §1.13](../../02-decisions/contracts/C43-ACCESSIBILITY.md). | 🔵 DEFERRED |
| **B.30** | **AWS KMS + BYOK Enterprise onboarding** | Per [C49 §1.3](../../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md). | 🔵 DEFERRED |
| **B.31** | **Marketplace dev hackathon + 100 active developers** | Refs: [phase-2-beta §6](./roadmap-phase-2-beta.md). | 🔵 DEFERRED |
| **B.32** | **500 marketplace artefacts** | Per [phase-2-beta §1 E5](./roadmap-phase-2-beta.md). | 🔵 DEFERRED |
| **B.33** | **Established-developer programme (first 10)** | Per [C40 §1.10](../../02-decisions/contracts/C40-MARKETPLACE-ECONOMICS.md). | 🔵 DEFERRED |
| **B.34** | **C45 Browser + Device Matrix — CANONICAL** | Per [C45](../../02-decisions/contracts/C45-BROWSER-AND-DEVICE-MATRIX.md). | 🔵 DEFERRED |
| **B.35** | **Phase 2 exit ADR (ADR-NNN-phase-2-exit-beta)** | End of 2028-Q2. | 🔵 DEFERRED |

---

## §5 — Phase C — GA + post-GA (18–36 months; 2028-Q3 to 2029-Q4; ~18 months)

**Phase C exit criteria**: see [roadmap-phase-3-ga.md §1](./roadmap-phase-3-ga.md). 12 criteria.

| Phase | Goal | Description + references | Status |
|---|---|---|---|
| **C.1–C.15** | **Typologies #11–#25** | Shop · car-park · school · library · hotel · hospital · warehouse · care-home · spa · vet · day-care · university · supermarket · distribution-centre · data-centre. Per [typology-expansion §5](./typology-expansion-roadmap.md). | 🔵 DEFERRED |
| **C.16** | **US region launch (us-east-1 + us-west-2)** | Per [C49 §1.2](../../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md). | 🔵 DEFERRED |
| **C.17** | **AP region launch (ap-northeast-1 + ap-southeast-1)** | Tokyo + Singapore. | 🔵 DEFERRED |
| **C.18** | **UK region launch (eu-west-2 — separate from EU)** | Per [C49 §1.5](../../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md). | 🔵 DEFERRED |
| **C.19** | **L6 behavioural simulation (pedestrian flow + occupancy)** | Per [site-and-cognition §3.4](../../01-strategy/site-and-cognition-strategy.md). | 🔵 DEFERRED |
| **C.20** | **L7 typology priors expand to all 25** | + community-authored long tail. | 🔵 DEFERRED |
| **C.21** | **Constraint DB expand to 1000 rules code-enforced** | From 250 (Phase B) to 1000. | 🔵 DEFERRED |
| **C.22** | **C26 Revit round-trip — production full** | RVT/RFA via IFC4 + optional Python adapter + 100-project reference suite. Refs: [C26](../../02-decisions/contracts/C26-REVIT-ROUND-TRIP.md). | 🔵 DEFERRED |
| **C.23** | **C32 DXF/DWG round-trip — CANONICAL** | ODA library integration. Refs: [C32](../../02-decisions/contracts/C32-DXF-DWG-ROUND-TRIP.md). | 🔵 DEFERRED |
| **C.24** | **C33 Rhino interchange — CANONICAL** | NURBS round-trip + Grasshopper bridge. Refs: [C33](../../02-decisions/contracts/C33-RHINO-INTERCHANGE.md). | 🔵 DEFERRED |
| **C.25** | **C35 COBie FM Handover — CANONICAL** | Tier-1 IFC + COBie Pset coverage. Refs: [C35](../../02-decisions/contracts/C35-COBIE-FM-HANDOVER.md). | 🔵 DEFERRED |
| **C.26** | **C37 Schedule 4D — CANONICAL** | Gantt + time-phasing + Synchro/Asta export. Refs: [C37](../../02-decisions/contracts/C37-SCHEDULE-4D.md). | 🔵 DEFERRED |
| **C.27** | **C38 Cost 5D — CANONICAL** | `packages/cost-engine/` + RSMeans/BCIS/Spon's importers + CSI/NRM2/Uniformat roll-ups. Refs: [C38](../../02-decisions/contracts/C38-COST-5D.md). | 🔵 DEFERRED |
| **C.28** | **Cognition substrate as published API** | REST API for third-party consumers. Refs: [phase-3-ga §10](./roadmap-phase-3-ga.md). | 🔵 DEFERRED |
| **C.29** | **30+ Enterprise customers signed** | Per [roadmap-enterprise-delivery §8](./roadmap-enterprise-delivery.md). | 🔵 DEFERRED |
| **C.30** | **ISO 19650 Phase 2 + Phase 3 audit pass** | Production + completion phases. | 🔵 DEFERRED |
| **C.31** | **Self-host option (defence + intelligence customers)** | Per [C49 §1.6](../../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md). | 🔵 DEFERRED |
| **C.32** | **First government procurement win** | UK Cabinet Office or US GSA. | 🔵 DEFERRED |
| **C.33** | **Marketplace 2000 artefacts + 200 active devs** | Per [phase-3-ga §1 E5](./roadmap-phase-3-ga.md). | 🔵 DEFERRED |
| **C.34** | **30% of revenue from marketplace-adjacent** | Per [phase-3-ga §1 E6](./roadmap-phase-3-ga.md). | 🔵 DEFERRED |
| **C.35** | **TIER 2 i18n complete (pt-BR + zh-CN) + TIER 3 RTL pilot** | ar-SA + he-IL. | 🔵 DEFERRED |
| **C.36** | **Annual external WCAG audit (recurring)** | Per [C43 §1.13](../../02-decisions/contracts/C43-ACCESSIBILITY.md). | 🔵 DEFERRED |
| **C.37** | **Quarterly DR drill per region** | Per [C48 §1.11](../../02-decisions/contracts/C48-BACKUP-AND-DR.md). | 🔵 DEFERRED |
| **C.38** | **First C47 file-format MAJOR bump** | When schema invariant breaks. Refs: [C47](../../02-decisions/contracts/C47-FILE-FORMAT-VERSIONING.md). | 🔵 DEFERRED |
| **C.39** | **Phase 3 exit ADR (ADR-NNN-phase-3-exit-ga)** | End of 2029-Q4. | 🔵 DEFERRED |

---

## §6 — Phase D + beyond (Phase 4 / 36-month+; 2030+)

Per [vision-2030.md](./vision-2030.md). Driven by marketplace flywheel + community-authored typology expansion. No detailed sub-phase tracking until end of Phase C.

---

## §7 — Cross-cutting sub-phases (continuous; not phase-locked)

Some work spans phases:

| ID | Goal | Cadence | Status |
|---|---|---|---|
| **X.1** | NFT bench maintenance + new benches per shipped feature | Per-PR + per-feature | 🟢 IN PROGRESS (continuous) |
| **X.2** | C14 Cast-count tripwire — ratchet toward zero | Per-PR | 🟢 IN PROGRESS (baseline holds) |
| **X.3** | OTel span coverage — every new public function | Per-PR via `check-otel-spans.ts` | 🟢 IN PROGRESS (hard-fail gate) |
| **X.4** | Constraint DB rule curation | Continuous | 🟢 IN PROGRESS (A.37 active) |
| **X.5** | Customer support intake + SEV-1 PMI cadence | Per [C42](../../02-decisions/contracts/C42-CUSTOMER-SUPPORT-TIER.md) | 🟢 IN PROGRESS (low volume) |
| **X.6** | Documentation cadence per [C31](../../02-decisions/contracts/C31-DOCUMENTATION-AUTHORING-PROTOCOL.md) | Continuous | 🟢 IN PROGRESS (this commit) |
| **X.7** | Sprint retros + per-sprint planning | Per-sprint | 🟢 IN PROGRESS |
| **X.8** | Marketplace + dev-rel ecosystem development | Continuous | ⚪ PLANNED (starts A.14–A.16) |
| **X.9** | Sales pipeline development (mid-firm + enterprise) | Continuous from Q4 | ⚪ PLANNED |
| **X.10** | Brand-voice content moderation per [manifesto §5](../../01-strategy/manifesto.md) | Per-customer-surface | 🟢 IN PROGRESS |

---

## §8 — Immediate next 5 actions (the "what's next" answer)

The 5 actions to do FIRST, in priority order, as of 2026-06-01:

| Order | Sub-phase | Action | Owner | Time-box |
|---|---|---|---|---|
| **1** | **A.12** | `pnpm --filter @pryzm/plugin-sdk publish --access public` | Founder + ops | 1 day |
| **2** | **A.14** | DNS provision `marketplace.pryzm.app` | Ops | 1 day |
| **3** | **A.1 + A.2** | Scaffold `packages/typology-pipeline/` + TypologyManifest schema | Engineer 1 | 1 sprint (2 weeks) |
| **4** | **A.7** | `packages/schemas/src/site/` schemas + SiteStore | Engineer 2 + Architect 2 | 1 sprint (2 weeks) |
| **5** | **A.17** | `pryzm.app` DNS + cert + landing-page rebuild | Designer 2 + Ops + Marketing | 2 sprints (4 weeks) |

Actions 1+2 unblock the marketplace (`npm` publish requires the npm token; DNS requires the cert). Actions 3+4 are the TypologyPipeline scaffold + Site substrate scaffold — both feed everything downstream. Action 5 is the brand cutover.

---

## §9 — Capacity vs commitment dashboard (Phase A)

| Sprint | Window | Capacity (dev-wk) | Committed (dev-wk) | Slack |
|---|---|---:|---:|---:|
| S1 | Jul 1–14 | 5.5 | 5.0 | 0.5 |
| S2 | Jul 15–28 | 5.5 | 5.0 | 0.5 |
| S3 | Jul 29–Aug 11 | 5.5 | 5.0 | 0.5 |
| S4 | Aug 12–25 | 5.5 | 4.5 | 1.0 |
| S5 | Aug 26–Sep 8 | 5.5 | 4.5 | 1.0 |
| S6 | Sep 9–22 | 5.5 | 4.5 | 1.0 |
| Q3 buffer | Sep 23–30 | (planning) | — | — |
| S7 | Oct 1–14 | 5.5 | 5.0 | 0.5 |
| S8 | Oct 15–28 | 5.5 | 5.0 | 0.5 |
| S9 | Oct 29–Nov 11 | 5.5 | 5.0 | 0.5 |
| S10 | Nov 12–25 | 5.0 (US Thanksgiving) | 4.5 | 0.5 |
| S11 | Nov 26–Dec 9 | 5.5 | 5.0 | 0.5 |
| S12 | Dec 10–23 | 5.5 | 4.5 | 1.0 |
| Holiday | Dec 24–31 | — | ADR-only | — |
| **Phase A total** | **Q3–Q4 2026** | **~65** | **~57** | **~8 (12%)** |

Per [quarterly-2026-Q3 §1](./quarterly-2026-Q3.md) + [quarterly-2026-Q4 §1](./quarterly-2026-Q4.md). Slack is reserve for incident response + customer escalations.

---

## §10 — Cross-references

| Doc | Relationship |
|---|---|
| [cadence-and-planning-system.md](./cadence-and-planning-system.md) | The planning system this tracker operates in |
| [vision-2030.md](./vision-2030.md) | H1 — Phase A/B/C/D arc derives from |
| [roadmap-phase-1-alpha.md](./roadmap-phase-1-alpha.md) | Phase A full detail |
| [roadmap-phase-2-beta.md](./roadmap-phase-2-beta.md) | Phase B full detail |
| [roadmap-phase-3-ga.md](./roadmap-phase-3-ga.md) | Phase C full detail |
| [typology-expansion-roadmap.md](./typology-expansion-roadmap.md) | Typology pipeline + 25-typology roadmap |
| [roadmap-enterprise-delivery.md](./roadmap-enterprise-delivery.md) | Customer-delivery sequence |
| [annual-2026.md](./annual-2026.md) | H3 — current year |
| [quarterly-2026-Q3.md](./quarterly-2026-Q3.md) | H4 — current quarter |
| [quarterly-2026-Q4.md](./quarterly-2026-Q4.md) | H4 — next quarter |

---

## §11 — How this tracker updates

- **Every sprint close** — update status (⚪ → 🟢 → ✅) on completed sub-phases
- **On any 🔴 BLOCKED** — surface in next standup; raise unblock plan
- **On 🔵 DEFERRED change** — record reason; raise ADR if material
- **On every new sub-phase** — add to the right phase table + check capacity
- **Quarterly close** — move closed sub-phases to a `Phase-A-CLOSED.md` summary; refresh capacity table

Per [cadence-and-planning-system §10 cardinal rules](./cadence-and-planning-system.md): plans flow down; reality flows up. When a sprint discovery invalidates a tracker assumption, update + raise an ADR.

---

*End — PRYZM Master Execution Tracker, 2026-06-01 — CANONICAL.*
