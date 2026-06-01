# PACKAGE & PLUGIN CLASSIFICATION — 2026-04-28

> **Owner**: Architecture lead
> **Source**: W-20 of `phases/audits/PHASE-2-CLOSE-IMPLEMENTATION-PLAN-2026-04-28.md`
> **Extends**: Phase-1 W-06 (the original KEEP/PARK/TRIM call). Phase 2 added
> 6 new packages + 14 new plugins; this document captures the post-Phase-2
> classification.
> **Audience**: founder + every agent that picks up Phase 3 work — answers
> "is this in the hot path or parked?" before any refactor.

---

## §0 Conventions

| Bucket | Meaning |
|---|---|
| **KEEP** | Used by ≥ 2 consumers in current code, or the sole live implementation of a Phase 2 deliverable. Touched by every M24 beta gate. |
| **PARK** | Shipped (compiles + tests pass) but not yet wired into the editor hot path. Will light up in a named future sprint. Don't delete; don't refactor unless paying down a documented debt item. |
| **TRIM** | Unused, duplicated, or superseded. Slated for removal at the named gate (usually S61 / Phase 3C legacy deletion). |

A row is **TRIM** *only* when both (a) no in-tree consumer remains and
(b) a sprint exit criterion calls for its removal.

---

## §1 `apps/` — runtime processes (10 entries)

| App | Bucket | Sprint of origin | Current usage / notes |
|---|---|---|---|
| `apps/editor` | KEEP | S05 | The editor. Mounts `bootstrapWithEverything()`; hosts every plugin. |
| `apps/sync-server` | KEEP | S22 | WebSocket sync + soft-locks + event log. Authz middleware lands W-03. |
| `apps/bake-worker` | KEEP | S21 | 250 ms coalesced bake queue. Verified by W-11. |
| `apps/ai-worker` | PARK | S47 | Skeleton + InMemoryQueue. BullMQ adapter dynamic-imported behind `REDIS_URL`. Real worker wakes at S49+. |
| `apps/export-worker` | PARK | S40 (W-08) | Sheet PDF + schedule export jobs. In-process v0; BullMQ at S49+. |
| `apps/bench` | KEEP | S08 | Vitest-driven micro-bench harness; baseline + regression gate. M24 gate authority. |
| `apps/cli` | KEEP | S17 | Headless CLI (`pryzm-cli`). Used by the bake worker + cutover scripts. |
| `apps/headless` | KEEP | S17 | `@pryzm/headless` — the runtime surface ADR-0017 froze. Internal; npm publish at S62+. |
| `apps/component-editor` | PARK | S26 | Family editor. Quality-gate workflow runs every push; full migration deferred to Phase 3B. |
| `apps/docs-site` | PARK | S63 | Plugin SDK docs site scaffold. Lights up at S62/S63 marketplace work. |
| `apps/marketplace-web` | PARK | S64 | Plugin marketplace UI. Phase 3C / SPEC-25. |

---

## §2 `packages/` — pure libraries (33 entries)

### §2.1 KEEP — used by ≥ 2 consumers in current code

| Package | Sprint of origin | Consumers (sample) |
|---|---|---|
| `packages/command-bus` | S05 | every plugin handler set |
| `packages/protocol` | S05 | sync-server, sync-client, persistence-client |
| `packages/schemas` | S05 | every plugin, persistence-client, sync-server |
| `packages/stores` | S05 | every plugin, editor, sync-client |
| `packages/scene-committer` | S05 | renderer, plugin-wall, plugin-slab, plugin-cube, …, dimensions shim until W-02 fully lands |
| `packages/frame-scheduler` | S04 | editor, bake-worker |
| `packages/picking` | S15 | editor, plugin-selection |
| `packages/file-format` | S18 | persistence-client, cli, headless |
| `packages/persistence-client` | S20 | editor, cli, sync-server tests |
| `packages/storage-driver` | S20 | persistence-client, cli |
| `packages/renderer` | S07/S30 | editor, view plugins |
| `packages/render-runtime` | S07 | renderer, editor, scene-committer |
| `packages/geometry-kernel` | S08 | every L4 element plugin |
| `packages/drawing-primitives` | S29 | plan-view, sheets, scene-committer (post W-02) |
| `packages/view-state` | S29 | plan-view, sheets, multiplayer, view |
| `packages/visibility` | S43 | view, plan-view, sheets, plugin-rooms |
| `packages/sync-client` | S43 | editor, multiplayer, awareness |
| `packages/feature-flags` | S31 | editor, plan-view, scene-committer |
| `packages/ai-host` | S47 | ai-worker, plugin-ai-floorplan, plugin-ai-rules |
| `packages/ai-cost` | S47 | ai-host (workspace dep added W-01); ai-worker (transitive); ai-* plugins |
| `packages/family-runtime` | S26 | component-editor, plugin-furniture, plugin-lighting, plugin-plumbing, plugin-structural |
| `packages/family-instance` | S26 | family-runtime, every L7.5 family-instance plugin |
| `packages/api-spec` | S35 | sync-server, sync-client, headless, cli (codegen source) |
| `packages/plugin-sdk` | S62-skeleton | component-editor, marketplace-web (post-S62 wiring); ADR-0038 frozen schema |
| `packages/types-builtin` | S05 | every workspace package (transitive types) |
| `packages/ui` | S28 | editor, project-hub, family-editor |
| `packages/expr-eval` | S40 | plugin-schedules (formula DSL per ADR-0032) |
| `packages/email-transport` | S43 | beta-signup, sync-server (notification path) |
| `packages/beta-signup` | S43 | platform shell — beta cohort intake |

### §2.2 PARK — shipped, not yet wired

| Package | Sprint of origin | Light-up sprint | Notes |
|---|---|---|---|
| `packages/constraint-solver` | S40 | S49+ (Phase 3A) | Snapshot suite green; no editor wiring yet. |
| `packages/pdf-to-bim` | S40 | S49+ (Phase 3A) | CV pipeline + classification; deferred per S54. |
| `packages/family-loader` | S41 | S49+ | Streamed `.pyf` family loader. Not on hot path. |
| `packages/crash-reporter` | S43 | S49+ | OTel + Sentry-style adapter. Wired stub; production sink at S49. |

### §2.3 TRIM — slated for removal

| Package | Why | Removal gate |
|---|---|---|
| `packages/legacy-shim` | Re-exports for `src/engine/` callers; deletion is gate-3 of S61. | S61 D5 (per `docs/architecture/adr/0031-s61-staged-legacy-deletion.md`) |

---

## §3 `plugins/` — L7 element / view plugins (37 entries)

### §3.1 KEEP — wired into `PluginRegistry.ALL_PLUGINS` or surfaced in M24 gates

| Plugin | Sprint of origin | Surface |
|---|---|---|
| `plugins/wall` | S08 | element family — registry-bound |
| `plugins/slab` | S10 | element family — registry-bound |
| `plugins/door` | S11 | element family — registry-bound |
| `plugins/window` | S11 | element family — registry-bound |
| `plugins/roof` | S12 | element family — registry-bound |
| `plugins/curtain-wall` | S12 | element family — registry-bound |
| `plugins/grid` | S13 | element family — registry-bound |
| `plugins/column` | S13 | element family — registry-bound |
| `plugins/beam` | S14 | element family — registry-bound |
| `plugins/stair` | S14 | element family — registry-bound |
| `plugins/handrail` | S14 | element family — registry-bound |
| `plugins/ceiling` | S14 | element family — registry-bound |
| `plugins/view` | S29 | view plugin — registry-bound |
| `plugins/toy-cube` | S05 | smoke fixture — referenced by every bench |
| `plugins/cross` | S05 | smoke fixture — referenced by bootstrap tests |
| `plugins/selection` | S15 | selection runtime |
| `plugins/sheets` | S37 | Phase 2C primary deliverable |
| `plugins/schedules` | S40 | Phase 2C primary deliverable |
| `plugins/dimensions` | S33 | plan-view annotation pipeline |
| `plugins/annotations` | S32 | plan-view annotation pipeline |
| `plugins/plan-view` | S31 | Phase 2B primary deliverable; flag observed via W-07 |
| `plugins/section-view` | S37 (continued in W-09) | Phase 2B; full handlers + renderer landed W-09 |
| `plugins/multiplayer` | S46 | awareness overlay (cursor + peer-list + view-chip per ADR-0034) |
| `plugins/rooms` | S25 | room-boundary detection (ADR-0022) |

### §3.2 PARK — shipped, not on hot path

| Plugin | Sprint of origin | Light-up sprint |
|---|---|---|
| `plugins/furniture` | S26 | S49+ (component-editor surface) |
| `plugins/lighting` | S26 | S49+ |
| `plugins/plumbing` | S26 | S49+ |
| `plugins/structural` | S27 | S49+ |
| `plugins/ai-floorplan` | S47 | S49 — first real workflow |
| `plugins/ai-generative` | S48 | S50 |
| `plugins/ai-rules` | S48 | S50 |
| `plugins/ai-query` | S52 | S52 |
| `plugins/ai-voice` | S52 | S52 |
| `plugins/bcf` | S55 | Phase 3B |
| `plugins/ifc-export` | S55 | Phase 3B |
| `plugins/ifc-import` | S56 | Phase 3B |
| `plugins/ifc-inspector` | S56 | Phase 3B |
| `plugins/rhino-import` | S57 | Phase 3B |

### §3.3 TRIM

None — every plugin in the tree currently has a future light-up sprint or is
already KEEP.

---

## §4 Cross-cutting summary

| Bucket | apps | packages | plugins | TOTAL |
|---|---|---|---|---|
| KEEP | 7 | 28 | 24 | 59 |
| PARK | 4 | 4 | 13 | 21 |
| TRIM | 0 | 1 | 0 | 1 |
| **TOTAL** | **11** | **33** | **37** | **81** |

### §4.1 Watch-list

The following should be **revisited** at the named sprint:

* `packages/legacy-shim` → MUST be deleted at S61 D5 — the cutover-checklist
  enforcer is the gate.
* `packages/constraint-solver` → if S49 D2 is itself deferred, file a
  follow-up sprint to re-classify (KEEP if wired; PARK if still dormant).
* `apps/component-editor` → if Phase 3B slips, re-classify as TRIM with a
  named replacement plugin. Today the family-editor quality-gates workflow
  runs every push, so it is genuinely PARK (live but not in the hot path).

### §4.2 Anti-pattern guards

* No package above is duplicated by another. (Verified by `pnpm ls --recursive`
  on 2026-04-28.)
* Every PARK package has a named light-up sprint. If a future audit finds
  one without, reclassify to TRIM and call out the deletion gate.
* No package is both KEEP and PARK.

---

## §5 Diff vs Phase-1 W-06

Phase-1 W-06 classified 4 apps + 18 packages + 11 plugins (33 entries). Phase
2 added:

| Δ | Examples | Bucket |
|---|---|---|
| +5 apps | ai-worker, export-worker, component-editor, docs-site, marketplace-web | mostly PARK |
| +15 packages | drawing-primitives, view-state, visibility, sync-client, feature-flags, ai-host, ai-cost, family-runtime, family-instance, api-spec, plugin-sdk, expr-eval, email-transport, beta-signup, crash-reporter | mostly KEEP |
| +26 plugins | sheets, schedules, dimensions, annotations, plan-view, section-view, multiplayer, rooms, furniture, lighting, plumbing, structural, ai-floorplan, ai-generative, ai-rules, ai-query, ai-voice, bcf, ifc-export, ifc-import, ifc-inspector, rhino-import, view, selection (originally S15), grid (originally S13), beam (originally S14) | mix of KEEP + PARK |

**No package was reclassified TRIM in Phase 2.** Every Phase-1 PARK either
became KEEP (e.g. `feature-flags` — was scaffold, now consumed by editor +
plan-view + scene-committer) or stayed PARK with a re-stated light-up sprint.

---

*Last updated: 2026-04-28. Re-run W-20 after each major sprint or whenever a
plugin moves between buckets.*
