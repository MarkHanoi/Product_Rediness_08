# Plans — implementation plans + roadmaps

> **Stamp**: 2026-06-01 · **Status**: CANONICAL
> Sprint plans, roadmaps, tier tables. **Descriptive** — code is bound by [contracts](../../02-decisions/contracts/) and [specs](../specs/), not by plans.

---

## §1 — Read this first

PRYZM uses a **5-horizon planning system** (H1 5-year vision → H5 sprint). All plans below are organised by horizon. **Always read [cadence-and-planning-system.md](./cadence-and-planning-system.md) FIRST** — it explains how the horizons fit together, the authority order, the update cadence, and what goes WHERE.

---

## §2 — The canonical plan set (the new structure as of 2026-06-01)

### §2.1 — Meta + 5-year (H1)

| Plan | Purpose |
|---|---|
| [cadence-and-planning-system.md](./cadence-and-planning-system.md) | **META — read first**. The 5-horizon planning system + authority order + update cadence |
| [vision-2030.md](./vision-2030.md) | H1 — 5-year implementation vision; the capability themes, the strategic bets, the trade-offs |

### §2.2 — 3-year phase roadmaps (H2)

| Plan | Window | Purpose |
|---|---|---|
| [roadmap-phase-1-alpha.md](./roadmap-phase-1-alpha.md) | 0–6 months (H2 2026) | Phase 1 Alpha — connected workflow + first 3 typologies + marketplace go-live |
| [roadmap-phase-2-beta.md](./roadmap-phase-2-beta.md) | 6–18 months | Phase 2 Beta — 10 typologies + Inspect/Data/Sheet/PDF + first Enterprise + EU region |
| [roadmap-phase-3-ga.md](./roadmap-phase-3-ga.md) | 18–36 months | Phase 3 GA — 25 typologies + 4 regions + Revit full + cognition API |
| [typology-expansion-roadmap.md](./typology-expansion-roadmap.md) | Cross-phase | THE multi-typology vision (apartment → gym → pharmacy → 25 typologies + marketplace long tail) |
| [roadmap-enterprise-delivery.md](./roadmap-enterprise-delivery.md) | Cross-phase | How phased onboarding works for 1000s of paying customers (lags engineering by 2–4 quarters) |

### §2.3 — Annual (H3)

| Plan | Window | Purpose |
|---|---|---|
| [annual-2026.md](./annual-2026.md) | 2026 calendar year | H1 2026 closed; H2 2026 (Jul–Dec) active commitments by quarter |

(annual-2027.md authored at end of 2026 Q4; annual-2028.md at end of 2027 Q4; etc.)

### §2.4 — Quarterly (H4)

| Plan | Window | Purpose |
|---|---|---|
| [quarterly-2026-Q3.md](./quarterly-2026-Q3.md) | Jul–Sep 2026 | Current quarter — TypologyPipeline foundations + marketplace go-live + brand cutover |
| [quarterly-2026-Q4.md](./quarterly-2026-Q4.md) | Oct–Dec 2026 | Next quarter — House + Office typologies + Phase 1 exit |

(quarterly-YYYY-Qn.md drafted at sprint S4 of the prior quarter)

### §2.5 — Workstream-specific plans (cross-cutting)

| Plan | Purpose |
|---|---|
| [apartment/](./apartment/) | Apartment generation deep-detail (furniture · cognition stack · family platform · dimensional constraints · driving principles · BIM 2/3 data mgmt) — feeds typology-expansion-roadmap.md |
| [pryzm-1-sunset.md](./pryzm-1-sunset.md) | PRYZM 1 retirement plan (ongoing) |
| [launch/](./launch/) | Go-to-market draft material (GA blog post · beta announcement · demo script) |

### §2.6 — Legacy plans (superseded; kept for archeology)

| Path | Status |
|---|---|
| [legacy/superseded-2026-06-01/](./legacy/superseded-2026-06-01/) | Plans superseded by the new 5-horizon structure (master-implementation-plan-2026-05-31 · master-architecture-and-capabilities · post-ga-roadmap · pryzm-4-next-gen · pryzm4-readme · geospatial-foundation · geospatial-and-site-intelligence) |
| [legacy/phases/](./legacy/phases/) | Pre-2026 sprint phase plans (PHASE-1, PHASE-2, …) |
| [legacy/plan-detail/](./legacy/plan-detail/) | Fine-grained pre-2026 plan-detail docs |
| [legacy/wireup-2026/](./legacy/wireup-2026/) | 2026 wireup plan with chunks |
| [legacy/M28-IFC-IMPORT-PIPELINE.md](./legacy/M28-IFC-IMPORT-PIPELINE.md) | M28 pipeline detail |

Legacy plans are kept for archeology. **New plans MUST NOT cite them as current.** They document the path-to-PRYZM-3 work that happened pre-2026-06-01.

---

## §3 — Reading order for newcomers

If you've never planned PRYZM work before:

1. [cadence-and-planning-system.md](./cadence-and-planning-system.md) — 10 min — how planning works
2. [vision-2030.md](./vision-2030.md) — 15 min — the 5-year capability themes
3. [typology-expansion-roadmap.md](./typology-expansion-roadmap.md) — 15 min — the multi-typology product vision
4. [roadmap-phase-1-alpha.md](./roadmap-phase-1-alpha.md) — 25 min — what we're building NOW
5. [quarterly-2026-Q3.md](./quarterly-2026-Q3.md) — 15 min — current sprint deliverables
6. [roadmap-enterprise-delivery.md](./roadmap-enterprise-delivery.md) — 15 min — customer-delivery cadence

Total: ~95 min to internalise PRYZM planning.

---

## §4 — Authoring conventions

### Filename

- **Kebab-case lowercase**: `my-new-plan.md`
- **No date in filename**: stamp the date inside the doc body (the doc evolves; filename is stable)
- **Topic-scoped** for cross-cutting plans (`typology-expansion-roadmap.md`)
- **Window-scoped** for time-bounded plans (`quarterly-2026-Q3.md`, `annual-2026.md`)

### Header

```markdown
# <Plan title>

> **Stamp**: YYYY-MM-DD · **Status**: CANONICAL | DRAFT | SUPERSEDED | HISTORICAL
> **Horizon**: H1 | H2 | H3 | H4 | H5 (per cadence-and-planning-system.md)
> **Window**: <date range, if applicable>
> **Authority**: <one-sentence claim about what this doc owns>
> **Foundation above**: <upstream plans>
> **Downstream**: <plans this informs>
```

### Section structure

- §1 — Context / theme + exit criteria
- §2 — Capability buckets or epics
- §3+ — Detailed deliverables (tables preferred)
- Risk register
- Cross-references

---

## §5 — When to write a new plan

You're writing a plan when:

- A new horizon period starts (new quarter → new H4 doc; new year → new H3)
- A new cross-cutting workstream emerges (new typology family · new platform direction)
- A roadmap shifts and needs to be re-laid-out

You're NOT writing a plan when:

- It's a single decision → **ADR** in `02-decisions/adrs/`
- It's a binding rule → **contract** in `02-decisions/contracts/`
- It's an algorithm definition → **spec** in `../specs/`
- It's a status snapshot → `../status/`

---

## §6 — When to archive a plan

Move to `legacy/` (or `archive/`) when:

- The plan's exit criteria are 100% met (move to `legacy/closed-plans/<topic>/`)
- The plan was superseded (move to `legacy/superseded-<date>/<topic>/`)
- The plan was abandoned (move to `legacy/abandoned-plans/<topic>/`)

**Never edit a CLOSED or SUPERSEDED plan.** Write a new plan instead.

---

## §7 — Where decisions go vs plans

The most common authoring confusion. Resolved per [cadence-and-planning-system §6](./cadence-and-planning-system.md):

| Material | Lives in |
|---|---|
| "We are building X over the next 5 years" — capability theme | **plan** ([vision-2030.md](./vision-2030.md)) |
| "Phase 1 closes when X, Y, Z ship" — exit criteria | **plan** ([roadmap-phase-1-alpha.md §1](./roadmap-phase-1-alpha.md)) |
| "Phase 1 closure decision was made on date D" — gate decision | **ADR** (`02-decisions/adrs/ADR-NNN-phase-1-exit.md`) |
| "We are shipping the Inspect tree in Q3" — annual commitment | **plan** ([annual-2026.md](./annual-2026.md)) |
| "Q3 Sprint 5 delivers Inspect tree v1.0" — sprint scope | **plan** ([quarterly-2026-Q3.md](./quarterly-2026-Q3.md)) |
| "We chose tagged-PDF over PDF/UA-2" — decision | **ADR** |
| "Customer X is onboarding in Q3 with 50 seats" — customer milestone | **plan** ([roadmap-enterprise-delivery.md](./roadmap-enterprise-delivery.md)) |
| "Wire-format for Sheet revisions" — algorithm + format | **spec** (`03-execution/specs/SPEC-NN-*.md`) |
| "Drawing-set revision tracking is binding" — rule | **contract** (`02-decisions/contracts/C30-*.md`) |

The rule that keeps this clean: **never put binding decisions inside plans**. A plan is a map; an ADR is a record.
