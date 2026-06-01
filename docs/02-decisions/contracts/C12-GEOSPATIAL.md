# C12 — Geospatial & Coordinate Systems

> **Stamp**: 2026-05-03  
> **Status**: ACTIVE — Wave A17 (Sprint S126–S128)  
> **Governs**: `packages/geospatial/`, `plugins/ifc-import/` (IfcProjectedCRS read), `plugins/ifc-export/` (IfcProjectedCRS write), depth buffer configuration in `packages/renderer-three/`  
> **Principles**: P1 (layered), P3 (render scheduling), P8 (performance & precision)

---

## §1 — Coordinate Precision Mandate

### §1.1 LTP-ENU Rebasing

**MUST**: The scene coordinate origin MUST be recentred to the Local Tangent Plane East-North-Up (LTP-ENU) frame nearest to the camera whenever the camera moves more than **1 km** from the current scene origin.

**Rationale**: WebGL (and Three.js) use single-precision `float32` for GPU position buffers. At 1 km precision, `float32` provides ~0.06 m resolution — below the tolerance threshold for architectural elements. Beyond 1 km, jitter artefacts become visible. Typical infrastructure projects (rail corridors, road alignments) span tens to hundreds of kilometres; without rebasing, distant elements will shimmer or snap.

**Implementation**: `packages/geospatial/src/LTPENURebase.ts`
- `projectToScene(lat, lon, elev)` → `THREE.Vector3` — WGS84 to scene (ENU relative to current origin)
- `unprojectFromScene(pos)` → `{ lat, lon, elev }` — scene to WGS84
- `recenter(lat, lon, elev)` → `THREE.Vector3` — shift origin; returns translation to apply to all scene objects
- `setOrigin(lat, lon, elev)` — explicit origin reset (used on project open)

**Projection library**: `proj4` (already in workspace; tree-shaken via dynamic import). The `LTPENURebase` class MUST accept a `proj4` instance as a constructor dependency (no global singleton) to support test injection.

**CI gate**: Unit tests in `packages/geospatial/__tests__/LTPENURebase.test.ts` MUST verify:
1. Round-trip accuracy: `unproject(project(lat, lon, elev))` within 1 cm.
2. Translation vector is non-zero after `recenter`.
3. Scene origin resets to `(0, 0, 0)` after `setOrigin`.

### §1.2 IfcProjectedCRS Read-on-Import

**MUST**: When parsing an IFC file, the importer MUST detect `IFCPROJECTEDCRS` entities and extract:
- `Name` — EPSG code string (e.g. `"EPSG:27700"`)
- `GeodeticDatum` (optional)
- Easting / Northing offset (from `IFCMAPCONVERSION` linked entity)

**IF** an `IFCPROJECTEDCRS` is present, the importer MUST pass the extracted EPSG string and offsets to `LTPENURebase` to set the initial scene origin.

**IF** no `IFCPROJECTEDCRS` is present, the importer MUST assume `COORDINATE_TO_ORIGIN: true` (current behaviour — no change).

### §1.3 IfcProjectedCRS Write-on-Export

**MUST**: When exporting an IFC4X3 file and the active project has geospatial metadata (an EPSG code + origin coordinates), the exporter MUST write:
1. `IFCPROJECTEDCRS` with the EPSG code.
2. `IFCMAPCONVERSION` linking the `IFCPROJECTEDCRS` to `IFCGEOMETRICREPRESENTATIONCONTEXT` with the correct easting/northing offsets.

**MAY**: The IFC4 exporter MAY also write `IFCPROJECTEDCRS` (it is valid in IFC4). This is optional for Wave A17.

---

## §2 — Logarithmic Depth Buffer

**MUST**: The Three.js renderer MUST use a logarithmic depth buffer when any loaded model spans more than **500 m** in any axis (detected from the scene bounding box after import).

**Rationale**: Default linear depth buffers produce Z-fighting at large scales (e.g. 10 km infrastructure corridors). A logarithmic depth buffer distributes precision inversely proportional to distance, eliminating Z-fighting for near and far geometry simultaneously.

**Configuration**: `packages/renderer-three/src/RenderPipelineService.ts`
- Renderer MUST be initialised with `logarithmicDepthBuffer: true` when the scene extent exceeds the threshold.
- A re-initialisation of the renderer is NOT required if the threshold is crossed after initial load; the renderer may be created with `logarithmicDepthBuffer: true` unconditionally (minor GPU cost, eliminates conditional logic).

**CI gate (soft-fail → hard-fail Phase F)**: `packages/renderer-three/__tests__/depth-buffer.test.ts` MUST assert that `renderer.capabilities.logarithmicDepthBuffer` is `true` when the scene extent exceeds 500 m.

---

## §3 — Proj4 Integration Rules

- `proj4` MUST be imported as a peer dependency in `packages/geospatial/` (not inlined).
- The geospatial package MUST NOT import from `packages/renderer-three/` directly. Coordinate conversions are pure math; Three.js `Vector3` results are constructed via `new THREE.Vector3(x, y, z)` only, with THREE imported from `@pryzm/renderer-three`.
- All projection calls MUST be wrapped in OTel spans named `pryzm.geospatial.*` (e.g. `pryzm.geospatial.projectToScene`).

---

## §4 — Package Boundaries

| Package | Responsibility |
|---|---|
| `packages/geospatial/` | LTP-ENU rebasing, proj4 wrappers, `IfcProjectedCRS` parse helpers |
| `plugins/ifc-import/` | Extract `IFCPROJECTEDCRS` + `IFCMAPCONVERSION` on import; pass to geospatial |
| `plugins/ifc-export/` | Write `IFCPROJECTEDCRS` + `IFCMAPCONVERSION` on IFC4X3 export |
| `packages/renderer-three/` | Enable logarithmic depth buffer based on scene extent |

Cross-package dependency direction: `renderer-three` ← `geospatial` ← `plugins/ifc-*`. No reverse imports.

---

## §5 — Wave Delivery Schedule

| Wave | Deliverable |
|---|---|
| A17 (Sprint S126) | `LTPENURebase.ts`, `IFC4X3Exporter.ts` with `IFCPROJECTEDCRS` write |
| A17 (Sprint S127) | `IfcProjectedCRS` read-on-import in `plugins/ifc-import/` |
| A17 (Sprint S128) | Logarithmic depth buffer enabled in `renderer-three` |

---

## §6 — Contract History

| Date | Change |
|---|---|
| 2026-05-03 | Initial contract created — Wave A17 geospatial track (A17-T1). |
