# Missing Contracts — Enterprise BIM/AEC Gap Audit

> **Stamp**: 2026-06-01 · **Status**: ACTIVE TRACKER
> **Scope**: identify every binding rule an enterprise BIM/AEC SaaS must codify · compare to the current contract suite · propose the gaps.
> **Method**: walked the Autodesk Forma + Revit + ArchiCAD + Stripe + Linear · checked against PRYZM's current 30 ratified contracts (C00–C18 + C24–C30 + draft C31) · cross-referenced with planning docs.
> **Result**: 18 contract gaps identified across 5 categories. Numbering proposed.

---

## §1 — What we have today (30 contracts)

| Category | Contracts | Status |
|---|---|---|
| Core platform (8) | C01 Arch · C02 Composition · C03 Schemas/Commands/State · C04 Rendering · C05 Persistence · C06 UI · C07 Plugin SDK · C08 Collab+Sec | All CANONICAL |
| Platform extensions (6) | C09 AI · C10 Perf+Obs · C11 Element creation · C12 Geospatial · C13 Project lifecycle · C14 Legacy elimination | All CANONICAL |
| Element semantics (4) | C15 Hosted elements · C16 Command authoring · C17 Batch creation · C18 Element preview visual | All CANONICAL |
| Output / interchange (5) | C24 Sheet · C25 IFC export · C26 Revit · C29 PDF · C30 Drawing set | All DRAFT |
| Inspect / data (2) | C27 BIM 3.0 Inspect · C28 Data panel | All DRAFT |
| Documentation (1) | C31 Documentation Authoring Protocol | DRAFT (this turn) |
| **Reserved gaps** | C19–C23 | UNFILLED |

## §2 — What an enterprise BIM/AEC SaaS must codify (checklist)

Walking the canonical list of binding rules a mature enterprise design platform needs:

### §2.1 — Foundation (have it)
✅ Architecture layered model · ✅ Composition root · ✅ Schemas/state · ✅ Rendering · ✅ Persistence · ✅ UI shell · ✅ Plugin SDK · ✅ Collaboration · ✅ Performance · ✅ AI

### §2.2 — Design & semantics (have it)
✅ Element creation pipeline · ✅ Hosted elements · ✅ Command authoring · ✅ Batch creation · ✅ Element preview visual

### §2.3 — Output & interchange (have most; some incomplete)
✅ Sheet composition · ✅ IFC export · ✅ Revit round-trip · ✅ PDF vector export · ✅ Drawing set management · ⬜ DXF/DWG round-trip · ⬜ Rhino interchange · ⬜ Print spec (drawing standards) · ⬜ COBie FM handover

### §2.4 — Site, environment, climate (partial)
✅ Geospatial coordinates (C12) · ⬜ Site model + parcel + context (C19) · ⬜ Building / Apartment aggregates (C20) · ⬜ Climate ingestion EPW + NOAA (C21) · ⬜ Sustainability + carbon · ⬜ Daylight + sun analysis

### §2.5 — Project lifecycle (have most)
✅ Project lifecycle + isolation (C13) · ✅ Legacy elimination (C14) · ⬜ Version & migration (.pryzm file versioning, breaking-change policy) · ⬜ Backup & DR · ⬜ Multi-region / sovereignty

### §2.6 — Security & compliance (have some)
✅ Auth + roles + ISO 19650 phase 1+2 (C08) · ⬜ Privacy / PII tier (C22) · ⬜ Provenance / audit trail for AI outputs (C23) · ⬜ GDPR / CCPA / data residency · ⬜ SOC 2 + audit log compliance · ⬜ Plugin trust & revocation (in C07, may need extraction)

### §2.7 — Inspect & data (have it, draft)
✅ BIM 3.0 Inspect (C27) · ✅ Data panel & automation (C28)

### §2.8 — Cross-cutting / commerce (missing)
⬜ Pricing + plan tiers contract · ⬜ Quotas + rate limits · ⬜ Marketplace economics (revenue share, payouts) · ⬜ Customer support tier · ⬜ Telemetry + analytics opt-in/opt-out (separate from C10 observability)

### §2.9 — Accessibility & device (missing)
⬜ WCAG 2.2 AA accessibility contract · ⬜ Mobile + tablet contract · ⬜ Browser/device compatibility matrix · ⬜ Internationalisation (i18n) + localisation (L10n)

### §2.10 — Documentation (have it now)
✅ Documentation authoring protocol (C31)

### §2.11 — Coordination & federated workflows (have BCF; need more)
✅ BCF round-trip (in plugins/bcf, contract-less today) · ⬜ Clash detection contract · ⬜ Schedule / 4D contract · ⬜ Cost / 5D contract · ⬜ Issue tracking integration

---

## §3 — Proposed missing contracts

Numbering plan: fill the C19–C23 reserved slots first (already informally named in PG0 / GS0 work), then continue with C32+ for new gaps.

### §3.1 — High priority (fill reserved slots C19–C23)

| Proposed | Title | Scope | Why now |
|---|---|---|---|
| **C19** | Site Model & Parcel | Site / parcel / building footprint / context-buildings schemas + commands + storage + IFC mapping. Companion to C12 Geospatial (which owns coordinate transforms only). | Apartment plan PG0 / GS0 (~19 wk) waits on this. Multi-apartment Tier 16 needs Site as a first-class element. |
| **C20** | Building & Apartment Aggregates | Building → level → apartment → room aggregation. Schema relationships + invariants. Wraps C13 Project lifecycle with the architectural hierarchy. | The Inspect tree (C27) implements this implicitly; needs codification. |
| **C21** | Climate Ingestion | EPW format reader · NOAA climate normals · solar + wind + temperature aggregates · per-site cache + invalidation. | GS0.4 deliverable. Climate-aware AI workflows wait on this. |
| **C22** | Privacy & PII Tier | What gets stored where, with what retention. PII vs project data vs telemetry. GDPR / CCPA compliance surface. BYOK boundaries. | Already referenced in PG0.6. SOC 2 audit waits on this. |
| **C23** | Provenance & AI Audit | Every AI-generated artefact traces its inputs · prompts · model · cost · timestamp. Output reproducibility. | C09 §6 mentions cost governance; provenance is a separate concern. Customer audit logs need this. |

### §3.2 — Medium priority (interchange + commerce)

| Proposed | Title | Scope |
|---|---|---|
| **C32** | DXF / DWG Round-Trip | Existing `plugins/dxf` is a stub. Needs the full contract for AutoCAD interchange. |
| **C33** | Rhino Interchange | Existing `plugins/rhino-import` covers import; round-trip + Grasshopper bridge contract missing. |
| **C34** | Print & Drawing Standards | Sheet size · linetypes · scales · north arrow conventions · drawing stamps per AIA + RIBA conventions. Companion to C24 Sheet (which is the engine; this is the standards). |
| **C35** | COBie FM Handover | Facility-management export — equipment lists, maintenance schedules. Tier-1 IFC + additional Pset coverage. |
| **C36** | Clash Detection & Coordination | Federated clash detection contract. Companion to BCF round-trip (which is the format). |
| **C37** | Schedule / 4D | Construction-phase scheduling export. Time-based phasing + animation. |
| **C38** | Cost / 5D | Cost estimation export. Quantity takeoffs + pricing tables. Companion to C28 Data + C25 Qto Psets. |

### §3.3 — Lower priority (cross-cutting + commerce)

| Proposed | Title | Scope |
|---|---|---|
| **C39** | Pricing & Plan Tiers | Solo / Studio / Mid-firm / Enterprise plan tiers · quotas · entitlements. Binding rules for what each tier sees. |
| **C40** | Marketplace Economics | Plugin payouts · revenue share · refund policy · published-author obligations. Binding rules for the marketplace SLA. |
| **C41** | Telemetry & Analytics | What we collect, how it's anonymised, opt-out surface. Separate from C10 Observability which is about debugging. |
| **C42** | Customer Support Tier | What support level each plan tier gets. SLAs. Escalation paths. |

### §3.4 — Accessibility + device (high-priority for enterprise readiness)

| Proposed | Title | Scope |
|---|---|---|
| **C43** | Accessibility (WCAG 2.2 AA) | Every UI surface conforms. Keyboard nav · screen reader · contrast · focus management. `packages/wcag-audit` is the implementation; needs the contract. |
| **C44** | Mobile & Tablet | What works on mobile · what doesn't · breakpoints · gesture conventions. `docs/05-guides/mobile/contract.md` exists as a guide; needs to be ratcheted to a contract. |
| **C45** | Browser & Device Matrix | Supported browsers · OS · hardware floor · WebGPU fallback policy. |
| **C46** | Internationalisation (i18n) & Localisation (L10n) | String externalisation · RTL support · locale-aware date/number/unit (architectural units especially: m vs ft).  |

### §3.5 — Versioning + DR (operational)

| Proposed | Title | Scope |
|---|---|---|
| **C47** | File-Format Versioning | `.pryzm` version evolution · breaking-change policy · forward/backward compatibility · migration runners. Companion to C05 Persistence. |
| **C48** | Backup & Disaster Recovery | RTO + RPO targets · backup cadence · restore procedure · DR drill schedule. |
| **C49** | Multi-Region & Sovereignty | EU/US/AP region routing · customer-managed data residency · BYOK boundaries. |

---

## §4 — Recommended sequence

### Phase 3.5 — fill reserved slots (C19–C23) — 5 contracts × ~3 days each = ~3 sprints

These are blocking on real work today:

1. **C19 Site Model** — unblocks GS0 multi-apartment + Site authoring UI
2. **C20 Building & Apartment Aggregates** — unblocks C27 Inspect tree formalization
3. **C21 Climate Ingestion** — unblocks climate-aware AI workflows
4. **C22 Privacy & PII** — unblocks SOC 2 audit prep
5. **C23 Provenance & AI Audit** — unblocks customer audit log requirements

### Phase 6.1 — interchange + commerce (C32–C38) — 7 contracts × ~2 days each = ~3 sprints

Unlocks the "production-grade BIM platform" capability gap:

6. C32 DXF/DWG
7. C33 Rhino
8. C34 Print & Drawing Standards
9. C35 COBie FM
10. C36 Clash Detection & Coordination
11. C37 Schedule / 4D
12. C38 Cost / 5D

### Phase 6.2 — cross-cutting commerce (C39–C42) — 4 contracts × ~2 days each

13. C39 Pricing & Plan Tiers
14. C40 Marketplace Economics
15. C41 Telemetry & Analytics (consent)
16. C42 Customer Support Tier

### Phase 6.3 — accessibility & device (C43–C46) — 4 contracts × ~2 days each

17. C43 Accessibility (WCAG 2.2 AA)
18. C44 Mobile & Tablet
19. C45 Browser & Device Matrix
20. C46 i18n/L10n

### Phase 6.4 — operational (C47–C49) — 3 contracts × ~2 days each

21. C47 File-Format Versioning
22. C48 Backup & DR
23. C49 Multi-Region & Sovereignty

---

## §5 — Total scope

- **18 missing contracts** (across 4 prioritised phases).
- **~46 contract-days** of pure writing (~9–10 weeks single-contributor; ~5 weeks at two parallel).
- **No code work** — these contracts encode rules that mostly already exist in code but aren't codified.

After this is done, PRYZM has **49 ratified contracts** covering every binding architectural surface an enterprise BIM/AEC SaaS needs.

---

## §6 — How to write each new contract

Per [C31 Documentation Authoring Protocol §2.1 Contract anatomy](./contracts/C31-DOCUMENTATION-AUTHORING-PROTOCOL.md). Every new contract:

1. Filename: `CNN-<UPPERCASE-HYPHENATED-TITLE>.md`
2. Stamp + Status: DRAFT initially
3. §1 Invariants (the binding rules — numbered §1.N)
4. §2 Schema (tables + types)
5. §3 Stores / API surface
6. §4 Commands
7. §5 UI (if applicable)
8. §6 Tests / CI gates
9. §7 NFT targets (if perf is at stake)
10. §8 Migration plan
11. §9 What is NOT in this contract
12. Cross-link from the C00 INDEX (`contracts/README.md`) on merge

---

## §7 — How we know we're done

When all 49 contracts (C00–C30 + C19–C23 + C31 + C32–C49) are CANONICAL and the documentation CI gates (per [DOCUMENTATION-GAPS-AND-NEXT-PHASES.md §7](../DOCUMENTATION-GAPS-AND-NEXT-PHASES.md)) are all hard-fail at green.

**Test**: a new joiner to the architecture team can answer "what rule binds X behaviour?" by reading exactly one contract, in under 5 minutes. If they can't, the contract is incomplete.

---

## §8 — Living doc

This audit is not a one-shot. As new domains emerge (e.g. embodied carbon, generative envelope design, AR/VR walkthrough), new contracts are needed. Append to §3 with a proposed CNN.

When a proposed contract is RATIFIED, its row in §3 moves to §1 of this doc and the contract list above grows.
