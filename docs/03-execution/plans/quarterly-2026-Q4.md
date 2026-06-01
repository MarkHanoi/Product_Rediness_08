# PRYZM — Quarterly Plan 2026 Q4 (Oct–Dec 2026)

> **Stamp**: 2026-06-01 · **Status**: CANONICAL · **Horizon**: H4 — quarterly
> **Window**: 2026-10-01 → 2026-12-31 (~13 weeks; 6 × 2-week sprints, S7–S12)
> **Authority**: this doc owns **Q4 2026 sprint-by-sprint deliverables** — the back half of Phase 1. Q4 close = Phase 1 exit = ADR-NNN-phase-1-exit-alpha.md raised.
> **Foundation above**: [annual-2026.md §2.2](./annual-2026.md) → [roadmap-phase-1-alpha.md](./roadmap-phase-1-alpha.md) closes at end of Q4.

---

## §1 — Q4 2026 theme + capacity

**Theme**: **House + Small-Office typologies ship · Phase 1 exit criteria all green · first 50 paying customers**.

| Sprint | Window | Capacity (dev-weeks) |
|---|---|---|
| S7 | Oct 1–14 | ~5.5 |
| S8 | Oct 15–28 | ~5.5 |
| S9 | Oct 29 – Nov 11 | ~5.5 |
| S10 | Nov 12–25 | ~5.5 (US Thanksgiving week impacts buffer) |
| S11 | Nov 26 – Dec 9 | ~5.5 |
| S12 | Dec 10–23 | ~5.5 |
| Holiday + Phase 1 retro | Dec 24–31 | Phase 1 ADR drafting + retro |

Net Q4 dev-week capacity: ~33 weeks. Q4 work allocation: ~30 dev-weeks committed; ~3 weeks buffer (holiday season).

---

## §2 — Q4 epics + owners

| Epic | Engineer | Architect | Designer | Sprints |
|---|---|---|---|---|
| **E1 — House typology end-to-end** | Engineer 1 (lead) | Architect 1 | Designer 1 | S7–S9 |
| **E2 — Small-office typology end-to-end** | Engineer 1 (extend) | Architect 1 | Designer 1 | S10–S12 |
| **E3 — C20 Building + Apartment Aggregates ratification** | Engineer 2 | Architect 2 | — | S7–S9 |
| **E4 — IFC + Revit polish (PSet coverage + IFC4X3-RV)** | Engineer 5 (lead) | Architect 1 | — | S7–S10 |
| **E5 — Family marketplace UX + 3 community packs** | Engineer 3 + Dev-rel | — | Designer 2 | S8–S11 |
| **E6 — WCAG audit prep (axe-core CI all critical/serious green)** | Engineer 4 (lead) | — | Designer 1 + 2 (accessibility fixes) | S8–S12 |
| **E7 — Backup + DR runbooks + first drill** | Engineer 4 (extend) | — | — | S10–S12 |
| **E8 — Cognition substrate L1–L4 hardening (50 → 100 new rules)** | Engineer 6 (lead) | Architect 1 + Architect 2 | — | S7–S12 |
| **E9 — First 50 paying customers + Phase 1 exit ADR** | Marketing + product + Founder | — | Marketing | continuous; ADR in S13 |
| **E10 — Per-sprint NFT bench maintenance** | All engineers | — | — | continuous |

---

## §3 — Sprint-by-sprint plan

### §3.1 — Sprint 7 (Oct 1–14): House typology kickoff + IFC polish + L5 daylight

| # | Deliverable | Owner | Epic |
|---|---|---|---|
| 7.1 | House `program-rules.json` — 12 room types authored | Architect 1 + Engineer 1 | E1 |
| 7.2 | House AI workflow scaffold (`packages/ai-host/src/workflows/houseLayout/`) | Engineer 1 | E1 |
| 7.3 | House deterministic engine D-HOUSE first cut | Engineer 1 | E1 |
| 7.4 | C20 Building + Level + Apartment aggregates schemas | Engineer 2 + Architect 2 | E3 |
| 7.5 | IFC4X3 Pset coverage gap-fill (door + window + slab Pset completeness) | Engineer 5 | E4 |
| 7.6 | `axe-core` baseline integration into CI — `critical` + `serious` count baseline established | Engineer 4 | E6 |
| 7.7 | First marketplace family pack: UK door catalogue (community-authored) | Engineer 3 + Dev-rel | E5 |
| 7.8 | L5 daylight rule-checker (mandatory window per room) | Engineer 6 + Architect 2 | E8 |
| 7.9 | 10 more cognition rules (Q4 total target: 100 additional → 252 enforced) | Engineer 6 | E8 |

**S7 acceptance**: House pipeline scaffolded; C20 schemas authored; IFC PSet coverage 60% → 80%; axe-core baseline established.

### §3.2 — Sprint 8 (Oct 15–28): House polish + Inspect tree + community marketplace growth

| # | Deliverable | Owner | Epic |
|---|---|---|---|
| 8.1 | House AI workflow + retry logic + provenance integration | Engineer 1 | E1 |
| 8.2 | House validators (setback compliance · party-wall · garden minimum · daylight) | Engineer 1 + Architect 1 | E1 |
| 8.3 | Inspect tree wired with Site → Building → Level → Apartment → Room → Element hierarchy | Engineer 2 + Designer 1 | E3 |
| 8.4 | IFC4X3 `IfcSpace` + `IfcZone` export coverage | Engineer 5 + Architect 1 | E4 |
| 8.5 | Revit IFC4X3-RV variant exporter (the Revit-import-friendly variant) | Engineer 5 | E4 |
| 8.6 | Marketplace family-pack 3D preview UI | Engineer 3 + Designer 2 | E5 |
| 8.7 | First marketplace family pack: JIS-spec window catalogue (community-authored) | Engineer 3 + Dev-rel | E5 |
| 8.8 | WCAG: keyboard registry covering all editor tools + cheat-sheet UI | Engineer 4 + Designer 1 | E6 |
| 8.9 | L5 perceptual evaluator: corridor width + sightline + room aspect ratio scoring | Engineer 6 + Architect 2 | E8 |
| 8.10 | 15 more cognition rules implemented (Q4 progress: 25/100) | Engineer 6 | E8 |

**S8 acceptance**: House AI workflow generates valid layouts on 5 reference projects; Inspect tree fully wired; IFC4X3-RV variant exports work; axe-core CI all `critical` green.

### §3.3 — Sprint 9 (Oct 29 – Nov 11): House ships + C20 ratifies + DSAR full

| # | Deliverable | Owner | Epic |
|---|---|---|---|
| 9.1 | House typology — **5 reference projects pass** (semi-detached UK · ranch US · row-house EU · standalone JP · townhouse) | Engineer 1 + Architect 1 | E1 |
| 9.2 | House intro panel (brief capture UI) | Engineer 1 + Designer 1 | E1 |
| 9.3 | **House typology SHIPPED** to production | Engineer 1 | E1 |
| 9.4 | C20 — **CANONICAL ratification** | Architect 2 + Architect 1 | E3 |
| 9.5 | IFC4X3 `IfcFurniture` export coverage | Engineer 5 | E4 |
| 9.6 | 10-project reference suite for IFC round-trip nightly | Engineer 5 + Architect 1 | E4 |
| 9.7 | First marketplace family pack: IKEA-style kitchen system (community-authored) | Engineer 3 + Dev-rel | E5 |
| 9.8 | WCAG: color-contrast token sweep complete | Engineer 4 + Designer 2 | E6 |
| 9.9 | WCAG: per-element-type sub-panel (Door panel · Window panel · Wall panel) accessibility audit | Engineer 4 + Designer 1 | E6 |
| 9.10 | First Phase 1 paying-customer milestone: 10 paying customers (cumulative) | Marketing | E9 |
| 9.11 | 20 more cognition rules implemented (Q4 progress: 45/100) | Engineer 6 | E8 |

**S9 acceptance**: House typology live in production; C20 ratified; 10-project IFC round-trip nightly green; first 10 paying customers; 3 community-authored family packs live.

### §3.4 — Sprint 10 (Nov 12–25): Small-office kickoff + DR drill + Revit reference

| # | Deliverable | Owner | Epic |
|---|---|---|---|
| 10.1 | Small-Office `program-rules.json` — 8 room types | Architect 1 + Engineer 1 | E2 |
| 10.2 | Office AI workflow scaffold | Engineer 1 | E2 |
| 10.3 | Office deterministic engine D-OFFICE first cut | Engineer 1 | E2 |
| 10.4 | Office validators (desk-spacing · WC count · accessibility · fire egress) | Engineer 1 + Architect 1 | E2 |
| 10.5 | Revit round-trip first reference: 1 Revit RVT exported via IFC4X3-RV → PRYZM → IFC4X3 → Revit | Engineer 5 + Architect 1 | E4 |
| 10.6 | Backup + DR: `server/backup/scheduler.ts` 5-min PG snapshot scheduler | Engineer 4 | E7 |
| 10.7 | Backup + DR: `server/backup/integrityChecker.ts` nightly integrity sampling | Engineer 4 | E7 |
| 10.8 | Per-failure-mode runbook authoring (DB primary failure · ransomware · accidental delete · regional outage) | Engineer 4 + Founder | E7 |
| 10.9 | WCAG: screen-reader QA pass (NVDA on Windows + Chrome) | Engineer 4 + Designer 1 | E6 |
| 10.10 | 25 more paying customers (cumulative: 35) | Marketing | E9 |
| 10.11 | 15 more cognition rules (Q4 progress: 60/100) | Engineer 6 | E8 |

**S10 acceptance**: Office pipeline scaffolded; backup runbooks complete; first Revit-PRYZM-Revit round-trip on 1 project; 35 paying customers; first Thanksgiving-adjusted sprint successfully delivered.

### §3.5 — Sprint 11 (Nov 26 – Dec 9): Office ships + first DR drill + provenance graph

| # | Deliverable | Owner | Epic |
|---|---|---|---|
| 11.1 | Small-Office typology — **5 reference projects pass** (open-plan tech · enclosed-office traditional · co-working · creative-studio · legal-firm) | Engineer 1 + Architect 1 | E2 |
| 11.2 | Office intro panel | Engineer 1 + Designer 1 | E2 |
| 11.3 | **Office typology SHIPPED** to production | Engineer 1 | E2 |
| 11.4 | **First DR drill run** (simulated PG primary failure) | Engineer 4 + ops + Founder | E7 |
| 11.5 | DR drill retrospective + runbook v2 | Engineer 4 | E7 |
| 11.6 | Per-AI-artefact provenance graph linking AI calls to produced elements | Engineer 4 | E6 (cross-cutting C23) |
| 11.7 | Provenance UI in inspect tree (right-click element → "Show AI provenance") | Engineer 4 + Designer 1 | E6 |
| 11.8 | C28 Data Panel — first vertical slice (the read-only grid; bulk-edit deferred to Phase 2) | Engineer 3 + Designer 2 | NEW (carryover into Phase 2) |
| 11.9 | 50 paying customers milestone hit (15 new this sprint) | Marketing | E9 |
| 11.10 | 20 more cognition rules (Q4 progress: 80/100) | Engineer 6 | E8 |

**S11 acceptance**: Office typology live in production; first DR drill complete; provenance graph live in inspect tree; 50 paying customers (E8 of Phase 1 hit); 80% of Q4 cognition target.

### §3.6 — Sprint 12 (Dec 10–23): Phase 1 exit + 100 cognition rules + 2026 close

| # | Deliverable | Owner | Epic |
|---|---|---|---|
| 12.1 | **Phase 1 exit criteria E1–E10 verification pass** | Founder + Engineer-1 + ops | E9 |
| 12.2 | 3 typologies regression nightly green for 4 consecutive weeks | Engineer 1 | E1, E2 |
| 12.3 | All 21 CI gates green for 4 consecutive weeks (E9 of Phase 1) | All engineers | continuous |
| 12.4 | Cold-boot NFT < 2.5 s baseline maintained for 4 weeks (E7 of Phase 1) | Engineer 6 | continuous |
| 12.5 | 50 paying customers confirmed (E8 of Phase 1) | Marketing | E9 |
| 12.6 | 20 final cognition rules (Q4 progress: 100/100 — target hit) | Engineer 6 | E8 |
| 12.7 | Marketplace catalogue: ≥ 50 artefacts (Phase 1 E5 criterion) | Engineer 3 + Dev-rel | E5 |
| 12.8 | **ADR-NNN-phase-1-exit-alpha.md DRAFT** (immutable; raised when E1–E10 verified) | Founder | E9 |
| 12.9 | 2026 Q4 retro + 2027 Q1 planning kickoff | Founder + all leads | — |
| 12.10 | annual-2027.md DRAFT authoring | Founder + leads | — |

**S12 acceptance + Q4 close + Phase 1 exit**:
- 3 typologies live + nightly green (apartment + house + office)
- 50 paying customers (E8)
- All 21 CI gates stable (E9)
- 100 new cognition rules enforced (total: 252 of 248 — exceeds spec)
- DR drill complete (E10 partial; full Phase 2)
- Marketplace 50+ artefacts (E5)
- ADR-NNN-phase-1-exit DRAFT in PR
- 2027 Q1 quarterly draft in PR

---

## §4 — Q4 NFT commitments

Per [annual-2026 §7](./annual-2026.md):

| NFT | Q4 target | Verification |
|---|---|---|
| Cold-boot | < 2.0 s (improvement vs Q3) | `cold-boot.bench.ts` |
| Project-load (10k elements) | < 5 s p95 | `load-large.bench.ts` |
| Apartment layout generation | < 45 s (improvement vs Q3) | `apartment-generation.bench.ts` |
| House layout generation | < 60 s | new bench `house-generation.bench.ts` |
| Office layout generation | < 60 s | new bench `office-generation.bench.ts` |
| Frame budget (60 fps) | maintained | `frame-budget.bench.ts` |
| Bundle size (editor) | < 4 MB gzip | `bundle-size.bench.ts` |
| Plugin install latency | < 5 s | `marketplace-install.bench.ts` |
| DR drill recovery time | < 4 h end-to-end | first DR drill log |
| WCAG axe-core: critical | 0 | CI |
| WCAG axe-core: serious | 0 | CI |

---

## §5 — Q4 dependencies + risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | House typology AI quality below threshold (R1 from Phase 1) | Medium | High | D-HOUSE deterministic engine ships parallel; AI is the lift |
| R2 | Office typology IFC round-trip data loss | Medium | High | Nightly regression vs 5 reference projects from S10 |
| R3 | First DR drill reveals critical issue | Medium | High | Drill scheduled S11 to allow S12 remediation |
| R4 | 50-customer milestone (E8) slips into Q1 2027 | Medium | Low | Phase 1 exit can still trigger with 40+; defer ADR to Q1 |
| R5 | Holiday season interrupts S12 closure | High | Low | S13 (Dec 24–31) reserved for ADR-only work; major code freeze |
| R6 | WCAG audit prep finds blocker | Medium | Medium | External audit deferred to Phase 2; Q4 is internal prep |
| R7 | 100 cognition rules per quarter is too aggressive | Medium | Medium | Pre-categorise; Q4 buffer is the 20-rule trivial bucket |

---

## §6 — Phase 1 exit checklist

The decision artefact at end of Q4:

| Criterion | Verification | Q4 status |
|---|---|---|
| E1 — 3 typologies live | Apartment + House + Office + nightly playwright | Track in S12 |
| E2 — RAC chatbot routing flow live | End-to-end test from signup | Track in S12 |
| E3 — `@pryzm/sdk` v1.0.x published | `npm view @pryzm/sdk` | ✅ S1 closed |
| E4 — `@pryzm/headless` v1.0.0 published | `npm view @pryzm/headless` | ✅ S1 closed |
| E5 — Marketplace live + 50+ artefacts | `marketplace.pryzm.app` + DB count | Track in S12 |
| E6 — `pryzm.app` domain cutover | DNS resolves | ✅ S1+S5 closed |
| E7 — Cold-boot NFT < 2.5 s for 4 weeks | CI baseline | Track in S12 |
| E8 — 50+ paying customers | Stripe MRR > $1500 | Track in S11–12 |
| E9 — All 21 CI gates stable 4 weeks | CI dashboard | Track in S12 |
| E10 — Site substrate v1 + IfcSite round-trip | Inspect tree shows Site | Track in S5+S9 |

**Phase 1 exit ADR template** (`ADR-NNN-phase-1-exit-alpha.md`):

```markdown
# ADR-NNN — Phase 1 Alpha Exit

> Status: ACCEPTED
> Date: 2026-12-XX
> Supersedes: nothing (immutable gate decision)

## Decision

Phase 1 Alpha closes on 2026-12-XX. PRYZM moves to Phase 2 Beta on 2027-01-01.

## Context

Phase 1 entry criteria (roadmap-phase-1-alpha.md §1) E1–E10 all verified true.

## Exit criteria verification (E1–E10)

[per-criterion verification log]

## What shipped

[summary of all 8 buckets]

## What was deferred

[deferred items + Phase 2 carry-over]

## Sign-off

- Founder + CEO
- Engineering lead
- Head of product
```

---

## §7 — Q4 → Phase 2 / 2027 Q1 handoff

Per [roadmap-phase-2-beta.md](./roadmap-phase-2-beta.md), Phase 2 starts 2027 Q1 with:

| Phase 2 Q1 priority | Q4 prerequisite | Status target by Q4 close |
|---|---|---|
| Townhouse + Co-living typologies | TypologyPipeline + RAC + Office regression | ✅ if E1 holds |
| C24 Sheet Composition Engine | None (greenfield in Phase 2) | new |
| C27 Inspect Model migration | C20 aggregates ratified | ✅ if E10 holds |
| First Enterprise pilots | Mid-firm + Enterprise sales motion | ✅ if 50 customers hit |
| EU region planning | C49 architecture | ✅ if region-routing infra ready |

---

## §8 — Cross-references

| Doc | Relationship |
|---|---|
| [annual-2026.md §2.2](./annual-2026.md) | Q4 = H2 2026 second half |
| [roadmap-phase-1-alpha.md](./roadmap-phase-1-alpha.md) | Q4 close = Phase 1 exit |
| [typology-expansion-roadmap.md](./typology-expansion-roadmap.md) | House + Office ship = Q4 |
| [quarterly-2026-Q3.md](./quarterly-2026-Q3.md) | Predecessor |
| [roadmap-phase-2-beta.md](./roadmap-phase-2-beta.md) | Successor phase |
| [cadence-and-planning-system.md](./cadence-and-planning-system.md) | H4 derivative |

---

*End — PRYZM Quarterly Plan 2026 Q4, 2026-06-01 — CANONICAL.*
