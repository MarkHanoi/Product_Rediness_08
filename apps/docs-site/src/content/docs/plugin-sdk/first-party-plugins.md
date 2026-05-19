---
title: First-Party Plugin Catalogue
description: Reference of the 38 first-party plugins seeded into the marketplace at S64 D1.
---

> **Source authority** — `packages/plugin-sdk/docs/internal-plugin-inventory.md`
> (S62 D1 baseline) + `apps/marketplace-api/src/seed/first-party.ts`
> `FIRST_PARTY_PLUGINS` (S64 D1 marketplace seed).  These two artefacts
> are pinned to the same 38-row count by parity tests in both packages.

## Why 38 and not 30?

Phase-doc-1 §S63 exit criterion reads:

> 30 first-party plugins all documented as examples.

The phase-doc estimate of **30** was set at the 2026-04-27 freeze.  The
S62 D1 audit (`internal-plugin-inventory.md` §"Reality check")
re-counted the repo and found **38** first-party plugins — the 2A+2B
element-family expansion added 8 (annotations, dimensions, lighting,
plumbing, rooms, schedules, sheets, structural, plan-view, section-view,
multiplayer, selection, cross, furniture, toy-cube — minus the 7 that
were already in the original 30, by category).  Per
`PHASES-AMENDMENT-2026-04-27-ROBUSTNESS.md` §0, the inventory document
is the single source of truth and the K3-C parity gate is interpreted
as **"all 38 must keep working"**.

## Catalogue

### AI plugins (5)

These five plugins already use the descriptor-as-data pattern via
`plugins/ai-*/src/descriptor.ts`.  They were the first to migrate to
the public SDK at S62 D5.

| ID | Display name | Surfaces | Notes |
|---|---|---|---|
| `pryzm/ai-floorplan` | AI Floorplan | command, panel | Generate floorplans from natural-language prompts via L7.5 workflows. |
| `pryzm/ai-generative` | AI Generative | command, panel | Generative geometry seeded by site context and brief. |
| `pryzm/ai-query` | AI Query | command, panel | Natural-language queries over the active project. |
| `pryzm/ai-rules` | AI Rules | command, panel | Rule-checking workflows surfaced as a panel of violations. |
| `pryzm/ai-voice` | AI Voice | command | Voice-driven model and view actions. |

The full code walk-through for the AI plugin archetype lives at
[Examples → AI Workflow Plugin](/plugin-sdk/examples).

### Element-family plugins (13)

These are statically linked into the editor bundle via
`apps/editor/src/PluginRegistry.ts`'s `ALL_PLUGINS` array.  They
continue to use the internal `PluginDescriptor` interface in
`PluginRegistry.ts`, **not** the public `@pryzm/plugin-sdk`
`PluginManifest` schema, per ADR-0038 §C (the "no-migration-needed"
class).

| ID | Display name | Surfaces |
|---|---|---|
| `pryzm/beam` | Beam | element-type, tool |
| `pryzm/ceiling` | Ceiling | element-type, tool |
| `pryzm/column` | Column | element-type, tool |
| `pryzm/curtain-wall` | Curtain Wall | element-type, tool |
| `pryzm/door` | Door | element-type, tool |
| `pryzm/grid` | Grid | element-type, tool |
| `pryzm/handrail` | Handrail | element-type, tool |
| `pryzm/roof` | Roof | element-type, tool |
| `pryzm/slab` | Slab | element-type, tool |
| `pryzm/stair` | Stair | element-type, tool |
| `pryzm/view` | View | view-template, panel |
| `pryzm/wall` | Wall | element-type, tool |
| `pryzm/window` | Window | element-type, tool |

### Format plugins (5)

Interop plugins for IFC, BCF, and Rhino.  These have no UI surface
beyond a command + (optionally) an inspector panel.  S64 D2 will wire
them as the first round of `needs-manifest` plugins to migrate to the
SDK.  The full code walk-through for the format plugin archetype lives
at [Examples → Format Plugin](/plugin-sdk/examples).

| ID | Display name | Surfaces |
|---|---|---|
| `pryzm/bcf` | BCF | command |
| `pryzm/ifc-export` | IFC Export | command |
| `pryzm/ifc-import` | IFC Import | command |
| `pryzm/ifc-inspector` | IFC Inspector | panel |
| `pryzm/rhino-import` | Rhino Import | command |

### Auxiliary, view, annotation, discipline (15)

Added between the 2026-04-27 phase-doc freeze and the S62 D1 audit, so
they do not appear in the original phase-doc-1 §S63 "30 first-party"
estimate.

| ID | Display name | Category | Surfaces |
|---|---|---|---|
| `pryzm/annotations` | Annotations | annotation | tool, panel |
| `pryzm/cross` | Cross | auxiliary | panel |
| `pryzm/dimensions` | Dimensions | annotation | tool |
| `pryzm/furniture` | Furniture | element-family | element-type |
| `pryzm/lighting` | Lighting | discipline | element-type, panel |
| `pryzm/multiplayer` | Multiplayer | auxiliary | panel |
| `pryzm/plan-view` | Plan View | view | view-template |
| `pryzm/plumbing` | Plumbing | discipline | element-type, panel |
| `pryzm/rooms` | Rooms | auxiliary | tool, panel |
| `pryzm/schedules` | Schedules | view | view-template, command |
| `pryzm/section-view` | Section View | view | view-template, tool |
| `pryzm/selection` | Selection | auxiliary | tool |
| `pryzm/sheets` | Sheets | view | view-template, panel |
| `pryzm/structural` | Structural | discipline | element-type, panel |
| `pryzm/toy-cube` | Toy Cube | demo | element-type |

## Aggregate counts

Pinned by `marketplace-api/__tests__/marketplace.test.ts` and
`internal-plugin-inventory.md`.  Drift in either direction is a CI
failure.

| Bucket | Count |
|---|---|
| `built-in-no-migration-needed` (element-family + auxiliary + view + annotation + discipline + demo) | 28 |
| `already-uses-descriptor-pattern` (AI plugins) | 5 |
| `needs-manifest` (format plugins) | 5 |
| **Total** | **38** |

## Querying the marketplace API

Once the marketplace API is running locally (`pnpm --filter @pryzm/marketplace-api start`), the seeded catalogue is browsable:

```bash
# All 38 plugins
curl http://localhost:5100/v1/plugins?limit=200

# Filter by category
curl 'http://localhost:5100/v1/plugins?category=ai'
curl 'http://localhost:5100/v1/plugins?category=element-family'

# Substring search across id + displayName + description
curl 'http://localhost:5100/v1/plugins?search=floorplan'

# Detail
curl http://localhost:5100/v1/plugins/pryzm/wall
```

All endpoints are rate-limited per [ADR-018](https://github.com/pryzm/pryzm-2/blob/main/docs/architecture/adr/0018-rate-limit-policy.md) (60 reads/min + 20 writes/min on the free tier).
