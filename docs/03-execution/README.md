# 03-execution — HOW

> **Stamp**: 2026-06-01 (refreshed) · **Status**: CANONICAL
> The execution layer. Frequently updated. Points up to contracts. This is where most writing happens.

---

## §1 — What lives here

Specs, implementation plans, and live status snapshots. Three sub-folders, each with a clear cadence:

| Folder | Owns | Cadence | Authority |
|---|---|---|---|
| [specs/](./specs/) | 56 per-system normative specifications — wire format, schema tables, algorithm contracts | Per-major-revision | Normative (lower than contracts; higher than plans) |
| [plans/](./plans/) | The 5-horizon planning system (vision-2030 + phase roadmaps + annual + quarterly) + master execution tracker | Per-sprint to per-year per horizon | Descriptive (not binding) |
| [status/](./status/) | Live status snapshots — autonomous-session logs, audits, dashboards | Daily–weekly | Snapshot only — superseded by next snapshot |

---

## §2 — Authority

Execution docs **describe how things will be built** and **track what's been built**. They DO NOT bind code — code is bound by [contracts](../02-decisions/contracts/) and [ADRs](../02-decisions/adrs/).

If a spec disagrees with a contract: **the contract wins**.
If a plan disagrees with a spec: **the spec wins**.
If a status disagrees with everything: it's a status — describe what's actually true today.

---

## §3 — plans/ — the 5-horizon planning system (2026-06-01 restructure)

**Read [plans/cadence-and-planning-system.md](./plans/cadence-and-planning-system.md) first.** It explains the 5-horizon system + authority order + update cadence.

### §3.1 — Day-to-day navigation: the master tracker

| Doc | Use for |
|---|---|
| **[plans/master-execution-tracker.md](./plans/master-execution-tracker.md)** | THE single table of phases A/B/C × sub-phases × status. **Open this every standup.** |

### §3.2 — Strategic (H1) + phase (H2)

| Doc | Horizon | Purpose |
|---|---|---|
| [plans/vision-2030.md](./plans/vision-2030.md) | H1 — 5 years | Capability themes; strategic bets |
| [plans/roadmap-phase-1-alpha.md](./plans/roadmap-phase-1-alpha.md) | H2 — Phase A | Alpha (0–6 months) — what we're building NOW |
| [plans/roadmap-phase-2-beta.md](./plans/roadmap-phase-2-beta.md) | H2 — Phase B | Beta (6–18 months) |
| [plans/roadmap-phase-3-ga.md](./plans/roadmap-phase-3-ga.md) | H2 — Phase C | GA (18–36 months) |
| [plans/typology-expansion-roadmap.md](./plans/typology-expansion-roadmap.md) | H2 cross-cut | The multi-typology vision (apartment → 25+ typologies) |
| [plans/roadmap-enterprise-delivery.md](./plans/roadmap-enterprise-delivery.md) | H2 cross-cut | How phased onboarding works for 1000s of customers |

### §3.3 — Annual (H3) + quarterly (H4)

| Doc | Horizon | Purpose |
|---|---|---|
| [plans/annual-2026.md](./plans/annual-2026.md) | H3 — 2026 | This year's commitments by quarter |
| [plans/quarterly-2026-Q3.md](./plans/quarterly-2026-Q3.md) | H4 — current quarter | Sprint-level deliverables Jul–Sep |
| [plans/quarterly-2026-Q4.md](./plans/quarterly-2026-Q4.md) | H4 — next quarter | Sprint-level deliverables Oct–Dec |

### §3.4 — Workstream-specific + legacy

| Doc / folder | Purpose |
|---|---|
| [plans/apartment/](./plans/apartment/) | Apartment-generation deep detail (furniture · cognition · family-platform · constraints) |
| [plans/pryzm-1-sunset.md](./plans/pryzm-1-sunset.md) | PRYZM 1 retirement (ongoing) |
| [plans/launch/](./plans/launch/) | GTM drafts |
| [plans/legacy/](./plans/legacy/) | Superseded + pre-2026 plans (archeology) |

---

## §4 — specs/ — 56 per-system normative specs

One file per major capability. Named `SPEC-NN-<TOPIC>.md`. See [specs/README.md](./specs/README.md) for the full index.

Specs detail the WIRE FORMAT, the SCHEMA TABLES, the ALGORITHM, the API surface. They're the engineering charter for one subsystem.

---

## §5 — status/ — live status snapshots

Documents that describe **what is actually true today**. Always stamped with a date. Superseded by the next stamp, NOT by editing.

| Doc / folder | Purpose |
|---|---|
| [status/autonomous-session-runs-log.md](./status/autonomous-session-runs-log.md) | Multi-agent session record |
| [status/prior-art-audit-2026-05-31.md](./status/prior-art-audit-2026-05-31.md) | Repository state at 2026-05-31 |
| [status/senior-architect-audit.md](./status/senior-architect-audit.md) | Architect's snapshot |
| [status/apartment-layout-status.md](./status/apartment-layout-status.md) | Apartment generation progress |
| [status/apartment-status-dashboard.md](./status/apartment-status-dashboard.md) | Dashboard view |
| [status/remaining-work-consolidated.md](./status/remaining-work-consolidated.md) | Open-work rollup |
| [status/cut-list-log.md](./status/cut-list-log.md) | Operational cuts |
| [status/sprints/](./status/sprints/) | Per-sprint plans + retros (H5) |
| [status/intent-analysis/](./status/intent-analysis/) | Orchestration · panel-gaps · UI/UX · user-journeys |
| [status/performance-analysis/](./status/performance-analysis/) | Project-open audit + tracker |
| [status/edges-lines/](./status/edges-lines/) | Flicker + WebGPU overlay |
| [status/post-mortems/](./status/post-mortems/) | PRYZM-2 build post-mortem |
| [status/retros/](./status/retros/) + [status/sprints/](./status/sprints/) | Phase-1 close + S18 retro |
| [status/legacy-status-detail/](./status/legacy-status-detail/) | Pre-2026 snapshots |

---

## §6 — Authoring conventions

### For new specs

1. Pick the next free `SPEC-NN` number (`ls specs/SPEC-*.md | tail -1`)
2. Use the standard template (top stamp + scope + invariants + schema + algorithm + tests)
3. Cite the binding contracts in the header (`Depends on: C03, C11`)
4. Add to [specs/README.md](./specs/README.md) index

### For new plans

1. Plans aren't numbered — they're named by topic + horizon (kebab-case, lowercase)
2. **Window-scoped** for time-bounded: `quarterly-2026-Q3.md`, `annual-2026.md`
3. **Topic-scoped** for cross-cutting: `typology-expansion-roadmap.md`
4. Stamp date inside the doc body (NOT in filename — filenames are stable; dates change)
5. Add to [plans/README.md](./plans/README.md) §2 index

### For new status snapshots

1. Status doc filenames CAN carry a date suffix `*-YYYY-MM-DD.md` when they're explicit snapshots in time (audits, milestone dashboards)
2. Live trackers (e.g. `autonomous-session-runs-log.md`) keep a stable filename and update the **stamp inside the doc** to the latest refresh date
3. Older snapshots that are superseded → move to `archive/`

---

## §7 — Reading order for newcomers

If you've never planned PRYZM work before:

1. [plans/cadence-and-planning-system.md](./plans/cadence-and-planning-system.md) — 10 min — how planning works
2. [plans/master-execution-tracker.md](./plans/master-execution-tracker.md) — 10 min — **what's next** (the day-to-day view)
3. [plans/vision-2030.md](./plans/vision-2030.md) — 15 min — the 5-year arc
4. [plans/typology-expansion-roadmap.md](./plans/typology-expansion-roadmap.md) — 15 min — the multi-typology product vision
5. [plans/roadmap-phase-1-alpha.md](./plans/roadmap-phase-1-alpha.md) — 25 min — Phase A full detail
6. [plans/quarterly-2026-Q3.md](./plans/quarterly-2026-Q3.md) — 15 min — current sprint deliverables
7. [plans/roadmap-enterprise-delivery.md](./plans/roadmap-enterprise-delivery.md) — 15 min — customer-delivery cadence
8. [specs/README.md](./specs/README.md) — index of 56 normative specs
9. [status/autonomous-session-runs-log.md](./status/autonomous-session-runs-log.md) — what changed in recent agent sessions

Total: ~115 min to internalise PRYZM execution.

---

## §8 — What does NOT belong here

- **Binding contracts** → [../02-decisions/contracts/](../02-decisions/contracts/)
- **Per-decision rationale** → [../02-decisions/adrs/](../02-decisions/adrs/)
- **Strategy / vision** → [../01-strategy/](../01-strategy/)
- **API reference / glossary** → [../04-reference/](../04-reference/)
- **User guides** → [../05-guides/](../05-guides/)
