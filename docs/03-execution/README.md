# 03-execution — HOW

> The execution layer. Frequently updated. Points up to contracts. This is where most writing happens.

## §1 — What lives here

Specs, implementation plans, and live status snapshots. Three sub-folders, each with a clear cadence:

| Folder | Owns | Cadence | Authority |
|---|---|---|---|
| [specs/](./specs/) | ~56 per-system normative specifications — wire format, schema tables, algorithm contracts | Per-major-revision | Normative (lower than contracts; higher than plans) |
| [plans/](./plans/) | Implementation plans, roadmaps, tier tables, master plans | Per-sprint or per-feature | Descriptive (not binding) |
| [status/](./status/) | Live status snapshots — autonomous-session logs, audits, dashboards | Daily–weekly | Snapshot only — superseded by next snapshot |

## §2 — Authority

Execution docs **describe how things will be built** and **track what's been built**. They DO NOT bind code — code is bound by [contracts](../02-decisions/contracts/) and [ADRs](../02-decisions/adrs/).

If a spec disagrees with a contract: the contract wins.
If a plan disagrees with a spec: the spec wins.
If a status disagrees with everything: it's a status — describe what's actually true today.

## §3 — Folder details

### [specs/](./specs/) — normative implementation specs

One file per major capability. Named `SPEC-NN-<TOPIC>.md`. Examples:

- `SPEC-01-GEOMETRY-KERNEL.md`
- `SPEC-02-PERSISTENCE.md`
- `SPEC-03-SYNC-CRDT.md`
- ... 56 total

Specs detail the WIRE FORMAT, the SCHEMA TABLES, the ALGORITHM, the API surface. They're the engineering charter for one subsystem. See [specs/README.md](./specs/README.md) for the full index.

### [plans/](./plans/) — implementation plans

Sprint plans, roadmaps, tier tables. Examples:

- `master-implementation-plan.md` — the 2026-05-31 master synthesis across all C-contracts
- `master-architecture-and-capabilities.md` — the 2026-06-01 folder + capability map
- `apartment/` — sub-folder for apartment-generation plans:
  - `furniture-and-activity.md` — the F-tier plan
  - `cognition-stack.md` — L1–L7 cognition layers
  - `family-platform.md` — Family registry + plugin marketplace
  - `dimensional-constraints.md` — D-class + T-class validators
  - `driving-principles.md` — room/element matrix
  - `bim2-bim3-data-mgmt.md` — D-α/β/γ live parametric substrate
- `geospatial-foundation.md` + `geospatial-and-site-intelligence.md` — site context
- `post-ga-roadmap.md` — Phase F + post-GA roadmap
- `pryzm-1-sunset.md` — PRYZM 1 retirement plan
- `pryzm-4-next-gen.md` + `pryzm4-readme.md` — long-horizon PRYZM 4 thinking
- `launch/` — go-to-market drafts (ga-launch-blog-post, beta-announcement, beta-demo-script, batch errors trace)
- `legacy/` — pre-2026 sprint plans (phases/, plan-detail/, wireup-2026/)

See [plans/README.md](./plans/README.md) for the full index.

### [status/](./status/) — live status snapshots

Documents that describe **what is actually true today**. Always stamped with a date. Superseded by the next stamp, NOT by editing.

- `autonomous-session-runs-log.md` — the multi-agent session record (refresh-3 stamp 2026-06-01)
- `prior-art-audit-2026-05-31.md` — repository state at 2026-05-31
- `senior-architect-audit.md` — architect's snapshot
- `apartment-layout-status.md` + `apartment-status-dashboard.md` — apartment generation progress
- `remaining-work-consolidated.md` — open-work rollup
- `cut-list-log.md` — operational cuts
- `intent-analysis/` — orchestration / panel-gaps / UI/UX / user-journeys analysis
- `performance-analysis/` — project-open audit + tracker
- `edges-lines/` — flicker + WebGPU overlay analysis
- `post-mortems/` — PRYZM-2 build post-mortem
- `retros/` + `sprints/` — phase-1 close + S18 retro
- `legacy-status-detail/` — pre-2026 status snapshots

See [status/README.md](./status/README.md) for the full index.

## §4 — Authoring conventions

### For new specs

1. Pick the next free `SPEC-NN` number (`ls specs/SPEC-*.md | tail -1`).
2. Use the standard template (top stamp + scope + invariants + schema + algorithm + tests).
3. Cite the binding contracts in the header (`Depends on: C03, C11`).
4. Add to [specs/README.md](./specs/README.md) index.

### For new plans

1. Plans aren't numbered — they're named by topic (kebab-case, lowercase).
2. Stamp with a date in the body (not the filename — filenames are stable; dates change).
3. Add to [plans/README.md](./plans/README.md) if it's a top-level plan.

### For new status snapshots

1. Status doc filenames CAN carry a date suffix `*-YYYY-MM-DD.md` when they're explicitly snapshots in time (audits, milestone dashboards).
2. Live trackers (e.g. `autonomous-session-runs-log.md`) keep a stable filename and update the **stamp inside the doc** to the latest refresh date.
3. Older snapshots that are superseded → move to `archive/`.

## §5 — What does NOT belong here

- **Binding contracts** → [../02-decisions/contracts/](../02-decisions/contracts/)
- **Per-decision rationale** → [../02-decisions/adrs/](../02-decisions/adrs/)
- **Strategy / vision** → [../01-strategy/](../01-strategy/)
- **API reference / glossary** → [../04-reference/](../04-reference/)
- **User guides** → [../05-guides/](../05-guides/)
