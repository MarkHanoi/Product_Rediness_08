# ADR-0362 — One IFC GlobalId codec at L0; converge the pipelines, do not route between them

> **Date**: 2026-08-23 · **Status**: ACCEPTED · **Lane**: IFCEXP49
> **Contract**: [C25 §1.7, §3.1](../contracts/C25-IFC-EXPORT-PRODUCTION.md) · **Issue log**: L-8500..L-8560
> **Amends**: [C25 §1](../contracts/C25-IFC-EXPORT-PRODUCTION.md) · **Related**: [ADR-0363](./ADR-0363-ifc-globalid-is-derived-not-stored.md), [C25 §2.1](../contracts/C25-IFC-EXPORT-PRODUCTION.md) (lane IFCTREE47)

---

## Context

The founder supplied a file-and-line IFC export audit whose structural finding was:

> *"There are **two independent, non-communicating IFC export pipelines** with divergent feature sets. Nothing is shared between them — not the GUID minter, not the pset writers, not the spatial writer."*

Re-derived from the code rather than transcribed, with two tools because a single grep is not proof (ripgrep and `grep -rn` agreed):

| | Pipeline A | Pipeline B |
|---|---|---|
| Root | `packages/file-format/src/export/ifc/**` (L3) | `plugins/ifc-export/src/**` (L6) |
| Reached from the UI | ⭐ **YES** — `ExportRailPanel` → `BimService.exportIfc` → `exportIFC` (`@pryzm/file-format`) | **NO** |
| Geometry | real triangulated mesh | box extrusion only |
| Openings | `IfcOpeningElement` / `RelVoids` / `RelFills` | absent |
| Standard psets, QTO, zones, OwnerHistory | absent / passthrough only | present |
| **Valid GlobalIds** | ⛔ **no** | yes |

Pipeline B is unreachable **by construction**, not by accident: `packages/runtime-composer/src/ImportExportSlots.ts` throws `RuntimeNotWiredError('ifc.export.run', 'F.12.4 (S81-WIRE)')`, and `exportProjectToIFC4X3` — the richest exporter on disk, exported from `index.ts:18` — has **zero non-test callers**.

So every enrichment lived in the pipeline nobody runs, and every defect lived in the one everybody does. That is the authored-but-unreachable pattern at the export layer.

The single worst consequence: Pipeline A wrote `crypto.randomUUID()` — a 36-character hyphenated UUID — verbatim into `GlobalId`, through an encoder that was an identity function (`IfcModelBuilder.ts:21`, `IfcSpatialStructure.ts:21`, both `const gi = (v: string) => v`). `IfcGloballyUniqueId` is a 22-character base64 string. **Every `.ifc` file PRYZM has ever exported is schema-invalid at every GlobalId.** A correct encoder existed at `plugins/ifc-export/src/guid.ts:33` with zero production call sites.

## The decision

**Converge on a shared core for the pure functions; keep Pipeline A as the shipping path.** Neither pipeline is a superset of the other, so neither could simply be deleted.

Three rules:

1. **The GlobalId codec is ONE module, at L0.** `packages/schemas/src/ifc/GlobalId.ts`. Not a copy in each pipeline, and not an import of one pipeline by the other.

2. **Every write site goes through one coercion, `toIfcGlobalId(value, stableKey)`, which cannot return an invalid value.** Not "call the encoder" — a rule an author must remember is a rule that decays. The function preserves an already-valid id, encodes a UUID, and derives from the stable key otherwise. There is no path through it that yields something `isIfcGlobalId` rejects.

3. **Pipeline A stays the shipping path and is enriched in place.** Routing the app to B was rejected: B's box-only geometry and total absence of openings are regressions a user would see immediately, and its input is a `ProjectSnapshot` nothing currently builds.

### Why L0, and why not the obvious alternatives

The founder's reading of the convergence was *"(c) a shared core for the pure functions, (b) port the rest into A"*. The (b) half is adopted unchanged. **The (c) half needed a correction that the brief could not have known**: the shared core cannot be `plugins/ifc-export/src/guid.ts`, because `@pryzm/file-format` is **L3** and that plugin is **L6**. L3 importing L6 is a layer violation that `tools/ga-gate/check-layer-boundaries.ts` exists to catch.

Rejected placements, and why:

- **In `packages/file-format` (L3), imported by the plugin.** Layer-legal, but `@pryzm/file-format` depends on `@pryzm/renderer-three` and `@thatopen/components`. `plugins/ifc-export` advertises itself as *"Pure TS / Node-compatible — passes the bake-worker test (no DOM, no THREE, no React)"*. This would drag THREE into the bake worker to obtain a string function.
- **Duplicate it into both.** This is what created the defect. A second copy is a second thing that can drift; the founder's constraint was explicit — *a second divergence must not be creatable afterwards*.
- **`packages/schemas` (L0) — CHOSEN.** It is the only layer both can import downward from. `@pryzm/schemas/ifc` already exists and already declares itself *"the canonical durable element-metadata shape shared by the IfcMetaStore and the ifc-import / ifc-export plugins"*, so this is the module's stated purpose rather than a new one. The codec has zero imports; `tools/ga-gate/check-domain-purity.ts` reads **RC=0, 0 impurities across 189 files** with it in place, so P5 is unaffected.

`plugins/ifc-export/src/guid.ts` is now re-exports only. **There is no longer any code in it that could diverge** — that, not the deletion of duplicate lines, is the point.

## Consequences

- `@pryzm/file-format` gains a `@pryzm/schemas` dependency (`pnpm-lock.yaml` synced).
- A future author cannot re-introduce the defect by writing a new call site, because the only reachable minter refuses to return an invalid value.
- The `debug()` helper in `@pryzm/core-app-model` reads `window` unguarded, so Pipeline A's writers throw outside a browser (L-8521). Convergence does **not** fix that; it is logged against `core-app-model`.
- ⚠ **C25's scope is now known to be wrong**, and this is the finding with the longest tail. Its header reads *"governs the existing `plugins/ifc-export/`"* — Pipeline B. **The contract governs the pipeline nobody runs**, and says nothing about the one that produces every file a user receives. §1.1's *"Every export targets IFC4X3"* is false of the shipping path, which writes IFC4. Amended in C25 §1.7 rather than left to rot.
