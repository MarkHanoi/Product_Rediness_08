# `@pryzm/plugin-ifc-export`

Phase 3-B Sprint **S56** — IFC Tier 1 Export + Pset Round-Trip.

Writes **IFC4** STEP files from PRYZM element snapshots using the `web-ifc`
write API. Round-trips `IfcGlobalId`s and `IfcPropertySet`s through a side-car
**IFCMetaStore** so identifiers and properties survive an
`import → edit → export → re-import` cycle.

## Tier 1 element coverage (S56 exit criteria)

| PRYZM family | IFC entity            | Predefined type            |
|--------------|-----------------------|----------------------------|
| `wall`       | `IfcWallStandardCase` | `STANDARD`                 |
| `slab`       | `IfcSlab`             | `FLOOR`                    |
| `door`       | `IfcDoor`             | `DOOR` + operation type    |
| `window`     | `IfcWindow`           | `WINDOW` + partition type  |
| `column`     | `IfcColumn`           | `COLUMN`                   |
| `beam`       | `IfcBeam`             | `BEAM`                     |

## Quick start

```ts
import {
  exportProjectToIFC,
  InMemoryIFCMetaStore,
} from '@pryzm/plugin-ifc-export';

const store = new InMemoryIFCMetaStore();
store.add({
  pryzmElementId: wall.id,
  globalId: '0Wall0Wall0Wall0Wall00',
  typeName: 'IFCWALLSTANDARDCASE',
  name: 'Exterior Wall A',
  psets: { Pset_WallCommon: { FireRating: '60min', IsExternal: true } },
  tier: 1,
});

const { bytes, counts } = await exportProjectToIFC(
  { walls: [wall], slabs: [], doors: [], windows: [], columns: [], beams: [] },
  store,
  { name: 'My Project' },
);

await fs.writeFile('out.ifc', bytes);
```

## Pipeline

1. `web-ifc.IfcAPI.Init()` → `CreateModel({ schema: IFC4 })`.
2. `IfcOwnerHistory` chain (Person + Organization + PersonAndOrganization +
   Application).
3. Spatial hierarchy `IfcProject → IfcSite → IfcBuilding → IfcBuildingStorey[]`
   plus `IfcUnitAssignment` (SI metre/m²/m³/radian) and
   `IfcGeometricRepresentationContext`.
4. For each Tier 1 element family: emit the IFC entity (preserving
   `meta.globalId` when present) + a `SweptSolid` body + `IfcRelDefinesByProperties`
   for every Pset registered against the element.
5. One `IfcRelContainedInSpatialStructure` per storey grouping every
   exported element under its host storey.
6. `SaveModel(modelId)` → `Uint8Array`.

## Observability

Sprint exit criteria require these OpenTelemetry spans, all emitted by this
package:

- `pryzm.ifc.export` (root)
- `pryzm.ifc.export-{wall|slab|door|window|column|beam}`
- `pryzm.ifc.export-pset`

Span attributes include `pryzm.ifc.element_id`, `pryzm.ifc.element_type`,
`pryzm.ifc.pset_name`, and `pryzm.ifc.property_count`.

## Tests

```bash
cd plugins/ifc-export && npx vitest run
```

The validation gate is wired as the `ifc-export-tier1` workflow.
