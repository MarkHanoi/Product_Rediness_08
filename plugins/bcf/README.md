# `@pryzm/plugin-bcf`

BCF (BIM Collaboration Format) **3.0** read + write for PRYZM 2.

> Phase 3-B Sprint **S59** — Solibri / BIM Track parity surface.
> Spec: `docs/archive/pryzm3-internal/reference/phases/PHASE-3/3B-Q2-M28-M30-IFC-REVIT-COMPONENT-EDITOR.md` §5
> and `docs/archive/pryzm3-internal/reference/phases/PHASE-3/3B-Q2-M28-M30-PLUGINS-IFC-DXF-RHINO.md` §S57 (initial) + §S59 (high-fidelity).

The plugin is intentionally framework-free — no DOM, no THREE, no React — so
it loads in the bake-worker, the server-side BCF importer, and the editor
issue panel from the same module.

## Sprint history

| Sprint | Surface |
|---|---|
| S57 | Low-fidelity BCF 3.0 round-trip subset: project / topic / comments / single viewpoint per topic. Deterministic byte-stable write. CI gate G18 wired. |
| S59 | Solibri / BIM Track parity: **multiple** viewpoints per topic, components selection / visibility / colouring (per-element ARGB), related-topic cross-references, `AssignedTo` / `DueDate` / `Stage`, IFC GlobalId ↔ PRYZM element resolver bridge. |

## Public surface

```ts
import {
  // Schema
  type BCFArchive, type BCFTopic, type BCFViewpoint, type BCFComponents,
  type BCFComponent, type BCFColoringGroup,
  // Codec
  readBCF, writeBCF,
  // IFC bridge
  resolveViewpoint, summariseResolution, selectionToBCFComponents,
  buildResolversFromMap, collectReferencedGlobalIds, topicsWithComponentRefs,
} from '@pryzm/plugin-bcf';
```

### `writeBCF(archive)` → `Promise<Uint8Array>`

Writes a deterministic `.bcf` ZIP. The same archive object always serialises
to the same bytes (CI gate G18 — see "Determinism" below).

### `readBCF(bytes)` → `Promise<BCFArchive>`

Reads a `.bcf` / `.bcfzip` archive. Accepts BCF 3.0 plus the legacy
`viewpoint.bcfv` / `snapshot.png` filenames used by S57 archives and many
buildingSMART reference fixtures.

### IFC bridge

```ts
const { byGlobalId, byPryzmId } = buildResolversFromMap(ifcMetaStore.idsToGuids);

// Importing BCF: resolve every component reference back to PRYZM ids.
const resolved = resolveViewpoint(topic.viewpoints[0], byGlobalId);
//   resolved.selection: ResolvedBCFComponent[]   ({ ifcGuid, pryzmElementId })
//   resolved.hidden:    ResolvedBCFComponent[]
//   resolved.coloring:  Array<{ color, components }>

// Authoring BCF from a viewport selection.
const { components, skipped } = selectionToBCFComponents(selectedPryzmIds, byPryzmId);
```

## Determinism (CI gate G18)

`writeBCF` is byte-stable: two writes of the same `BCFArchive` produce
identical bytes. The choices that make this true:

- topics emitted in **GUID-sorted** order;
- viewpoints inside a topic emitted in **GUID-sorted** order;
- components within selection / visibility / coloring emitted in
  **IfcGuid-sorted** order; coloring groups in **colour-hex-sorted** order;
- file entries appended in **dictionary order** (`Object.keys(...).sort()`);
- all `mtime` pinned to **1980-01-01T00:00:00Z** (fflate min DOS date);
- XML hand-rolled with fixed indentation + sorted attribute order so a
  dependency bump cannot shift bytes.

This is what lets `pnpm test plugins/bcf` assert byte-identical output across
runs and across the import → export → re-import → re-export cycle.

## Tests

```bash
pnpm --filter @pryzm/plugin-bcf test
```

- `__tests__/round-trip.test.ts` — 18 tests covering project metadata,
  topic ordering, comment chains, multiple viewpoints, perspective + ortho
  cameras, components selection / visibility / colouring + view-setup-hints,
  related topics, AssignedTo / DueDate / Stage, snapshot PNG bytes, and the
  three byte-stability gates (single-write × 2, read→write idempotent,
  read→write twice).
- `__tests__/ifc-bridge.test.ts` — 12 tests covering `resolveViewpoint`,
  `summariseResolution`, `selectionToBCFComponents`,
  `collectReferencedGlobalIds`, and `topicsWithComponentRefs`.

S59 D1 status: **30 / 30 green**.

## OTel spans

| Span name | Attributes |
|---|---|
| `pryzm.bcf.write` | `topic_count`, `viewpoint_count`, `component_count`, `byte_count` |
| `pryzm.bcf.read`  | `byte_count`, `topic_count`, `viewpoint_count`, `component_count` |

The tracer name is exported as `PRYZM_BCF_TRACER` for downstream span
correlation in the editor + server import paths.

## Files

```
plugins/bcf/
├── README.md                        ← this file
├── package.json                     @pryzm/plugin-bcf
├── tsconfig.json
├── src/
│   ├── index.ts                     barrel
│   ├── types.ts                     schema
│   ├── reader.ts                    readBCF
│   ├── writer.ts                    writeBCF (deterministic)
│   ├── ifc-bridge.ts                IFC GlobalId ↔ PRYZM resolver
│   ├── xml.ts                       fast-xml-parser config + escapeXml
│   └── otel.ts                      tracer + withSpan helper
└── __tests__/
    ├── round-trip.test.ts           18 tests
    └── ifc-bridge.test.ts           12 tests
```
