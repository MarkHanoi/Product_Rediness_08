# 04-reference — organization plan (taxonomy for the loose top-level files)

> **Status**: PLAN (2026-07-30). Authored under [C63](../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md)
> + [C31](../02-decisions/contracts/C31-DOCUMENTATION-AUTHORING-PROTOCOL.md) (doc-authoring protocol).
> **This doc does NOT move any file.** It is the target-folder plan; the **orchestrator** executes the
> `git mv`s + rewrites the inbound links in one pass (per the multi-agent discipline — a scoped agent
> touches CODE only; docs moves are the orchestrator's). Each row: `file → target folder`, one line, plus
> which completion axis (C63 §3) the doc feeds, where relevant.

## Why

`docs/04-reference/` has **~50 loose top-level `.md`/`.txt` files** mixed with seven organised subfolders
(`architecture-detail/ audit/ file-formats/ jurisdictions/ observability/ runbooks/ security/`). The loose
set spans replication standards, context/terrain engineering, parcel/zoning scoping, audits, launch
trackers, and engine-algorithm notes — with no grouping, so "where does the terrain doc live?" has no
answer and new docs land at the root by default. This plan assigns every loose file a home.

## New folders proposed (3)

| New folder | Holds | Why not an existing folder |
|---|---|---|
| `standards/` | the canonical replication + process standards (the "how to replicate a city" recipes) | not an audit, not engine-internals; these are normative reference standards |
| `geospatial/` | context / terrain / site-feasibility / parcel-metadata engineering docs | `architecture-detail/` is the BIM-engine internals; the geospatial subsystem is a distinct domain |
| `launch/` | dated launch-readiness + status snapshots | not a runbook, not an audit; time-stamped program docs |

Everything else routes to an **existing** folder or stays at root as a hub.

## KEEP AT ROOT (hubs — high inbound-link count; moving them breaks many links)

| File | Why it stays | Feeds axis |
|---|---|---|
| `README.md` | the folder index | — |
| `ISSUE-LOG.md` | living issue log (L-NNN), cited from dozens of docs + code | — |
| `V1-LAUNCH-IMPLEMENTATION-PLAN.md` | living phased plan, cited beside the audit | — |
| `GEOGRAPHIC-ROLLOUT-MASTER-TRACKER.md` | the jurisdiction WHAT/WHEN hub; the C63 completion matrix links to it | all (jurisdiction axis) |

## Move plan (file → target)

### → `standards/` (replication + process standards)
| File | Feeds axis |
|---|---|
| `CITY-REPLICATION-STANDARD.md` | all (the 8-layer recipe C63 measures) |
| `ENVELOPE-REPLICATION-STANDARD.md` | ENVELOPE |
| `BUILDING-HEIGHT-REPLICATION-STANDARD.md` | HEIGHTS/LOD |
| `JURISDICTION-PLAYBOOK.md` | LEGISLATION (dossier + onboarding standard) |
| `ORDINANCE-EXTRACTION-PIPELINE.md` | LEGISLATION |
| `ONBOARDING-PIPELINE-PORTABILITY.md` | DATA-SOURCES (what ports vs what does not) |
| `PROBE-DISCIPLINE.md` | — (cross-cutting honesty method) |

### → `geospatial/` (context / terrain / site / parcel engineering)
| File | Feeds axis |
|---|---|
| `CONTEXT-3D-PERFORMANCE-ARCHITECTURE.md` | CONTEXT |
| `CONTEXT-BUILDING-SOURCE-EVALUATION.md` | HEIGHTS/LOD · CONTEXT |
| `CONTEXT-DATA-COUNTRY-STUDY.md` | DATA-SOURCES · CONTEXT |
| `CONTEXT-DATA-TERRAIN.md` | TERRAIN |
| `CONTEXT-LOD-BUILD-PLAN.md` | CONTEXT |
| `CONTEXT-PRESENTATION-RENDER-SCOPING.md` | CONTEXT |
| `CONTEXT-SCENE-COMPILER-AND-TERRAIN-NORTH-STAR.md` | TERRAIN · CONTEXT |
| `CONTEXT-SCENE-COMPILER-IMPLEMENTATION-PLAN.md` | TERRAIN · CONTEXT |
| `CONTEXT-TERRAIN-COVERAGE.md` | TERRAIN |
| `CONTEXT-VIEW-DESIGN.md` | CONTEXT |
| `PLANNING-COMPILER-NORTH-STAR.md` | ENVELOPE (planning/compiler) |
| `pryzm-3d-geospatial-capabilities.md` | DATA-SOURCES |
| `SITE-FEASIBILITY-ARCHITECTURE-AND-SCALING.md` | all (system + scaling) |
| `PARCEL-METADATA-MODEL-IMPLEMENTATION-PLAN.md` | PARCEL |
| `PARCEL-METADATA-MODEL-REVIEW.md` | PARCEL |
| `PARCEL-ZONING-FEATURE-SCOPING.md` | PARCEL · ENVELOPE |
| `ENVELOPE-IMPLEMENTATION-PLAN.md` | ENVELOPE |

### → `audit/` (existing)
`3D-SITE-ANALYSIS-AUDIT.md` · `ARCHISTAR-EUROPE-COMPETITIVE-GAP-AUDIT-2026-07-17.md` ·
`COMMERCIAL-TOWER-AUDIT.md` · `ELEMENT-PIPELINE-SOUNDNESS-AUDIT.md` · `FORMA-CONTEXT-ENGINE-AUDIT.md`
(feeds CONTEXT) · `RESI-BUILDING-GENERATION-AUDIT.md`

### → `architecture-detail/` (existing — BIM-engine internals + infra decisions)
`layout-generation-algorithm.md` · `pipeline-architecture-apartment-vs-house.md` ·
`stair-creation-pipeline-and-anchor-analysis.md` · `visibility-and-selection.md` ·
`pascalorg-editor-research.md` · `OBJECT-STORAGE-R2-DECISION.md` (⚑ consider promoting to an ADR — it is
a decision record, not reference)

### → `launch/` (new — dated program/status snapshots)
`SEPTEMBER-LAUNCH-WEDGE-ASSESSMENT-2026-07-21.md` · `SEPTEMBER-READINESS-MASTER-PROGRAM-PLAN.md` ·
`STATUS-REPORT-2026-07-21.md`

### → `runbooks/` (existing)
`DEPLOYMENT-RUNBOOK.md`

### → into the `jurisdictions/` tree (country-specific — belongs under its country)
| File | Target |
|---|---|
| `DENMARK-GEOSPATIAL-REFERENCE-ARCHITECTURE.md` | `jurisdictions/dk/` |
| `SPAIN-BREADTH-RESUME-NOTES.md` | `jurisdictions/es/` |

### ⚑ Cross-tree moves (leave 04-reference)
| File | Target | Why |
|---|---|---|
| `L-391-CRDT-COLLAB-PLAN.md` | `docs/03-execution/plans/` | it is an implementation plan, not reference |
| `typecheck-error-queue.md` | `docs/03-execution/` working area (or archive) | transient work-queue, not durable reference |
| `typecheck-errors-2026-05-24.txt` | archive / delete | one-shot dated dump, superseded |

## Summary counts

- **Loose files triaged:** 47 (`.md` + `.txt`, excluding the seven subfolders).
- **KEEP AT ROOT (hubs):** 4.
- **→ `standards/` (new):** 7 · **→ `geospatial/` (new):** 17 · **→ `launch/` (new):** 3.
- **→ `audit/`:** 6 · **→ `architecture-detail/`:** 6 · **→ `runbooks/`:** 1 · **→ `jurisdictions/`:** 2.
- **⚑ cross-tree / archive:** 3 (L-391 plan, 2 typecheck queues).
- **Completion-axis inputs flagged:** every `standards/` + `geospatial/` doc is mapped to the C63 axis it
  feeds (see the two tables above) — this is the source-of-truth for the scorecard function's inputs.

## Execution notes (for the orchestrator)
1. Create `standards/`, `geospatial/`, `launch/` (each with a one-line `README.md`).
2. `git mv` each file per the tables; then grep the repo for the old relative path and rewrite links
   (docs + code comments). The three living hubs stay put, so their many inbound links are untouched.
3. Re-verify the C63 dossier + this doc's relative links after the move.
