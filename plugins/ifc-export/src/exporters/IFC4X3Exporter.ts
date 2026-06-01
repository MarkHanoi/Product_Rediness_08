/**
 * IFC4X3 exporter — exports PRYZM Tier 1 elements to the IFC4X3 schema.
 *
 * CONTRACT (C05 §3): IFC4X3 is the primary schema for infrastructure
 * (rail, road, bridge) projects. Key differences from the IFC4 path:
 *
 *   • `api.CreateModel({ schema: WebIFC.Schemas.IFC4X3 })` — the serialised
 *     STEP file gets `FILE_SCHEMA(('IFC4X3'))` in the header, which is
 *     required by OpenBIM infrastructure tools (e.g. Tekla, Bentley).
 *   • Walls are emitted as `IFCWALL` (PredefinedType: 'STANDARD') because
 *     `IFCWALLSTANDARDCASE` is deprecated (but not removed) in IFC4X3.
 *     All other Tier 1 entity types (IFCSLAB, IFCDOOR, IFCWINDOW, IFCCOLUMN,
 *     IFCBEAM) are identical between IFC4 and IFC4X3 schemas.
 *
 * Wave A17-T4 — Sprint S126.
 */

import * as WebIFC from 'web-ifc';
import type { IfcAPI } from 'web-ifc';
import type { Wall } from '@pryzm/plugin-sdk';

import { writeEntity, label } from '../api/webifc-helpers.js';
import { buildBoxRepresentation, buildLocalPlacement } from '../geometry.js';
import { mintGlobalId, type GuidProvider } from '../guid-provider.js';
import { withSpan } from '../otel.js';
import { buildOwnerHistory } from '../owner-history.js';
import { buildHierarchy, resolveStorey } from '../hierarchy.js';
import { writeAllPsets } from '../psets.js';
import { exportSlab } from './slab.js';
import { exportDoor } from './door.js';
import { exportWindow } from './window.js';
import { exportColumn } from './column.js';
import { exportBeam } from './beam.js';
import {
  exportRoomToSpace,
  writeStoreyAggregatesSpaces,
  type RoomToExport,
  type ExportedSpace,
} from './space.js';
import {
  writeAllApartmentZones,
  type ApartmentToExport,
} from './zone.js';
import {
  writePsetWallCommon,
  type WallToExport as WallPsetInput,
} from './pset-wall-common.js';
import type { ExportedElement } from './wall.js';
import type {
  ExportOptions,
  IFCMetaStoreLike,
  ProjectMeta,
  ProjectSnapshot,
} from '../types.js';
import type { ExportResult } from '../orchestrator.js';
import type { OwnerHistoryRefs } from '../owner-history.js';
import type { HierarchyRefs } from '../hierarchy.js';

// ---------------------------------------------------------------------------
// IFC4X3 wall exporter — IFCWALL (not IFCWALLSTANDARDCASE)
// ---------------------------------------------------------------------------

interface WallIFC4X3ExportArgs {
  api: IfcAPI;
  modelId: number;
  hierarchy: HierarchyRefs;
  ownerRefs: OwnerHistoryRefs;
  metaStore: IFCMetaStoreLike;
  wall: Wall;
  guid: GuidProvider;
}

function exportWallIFC4X3(args: WallIFC4X3ExportArgs): ExportedElement {
  const { api, modelId, hierarchy, ownerRefs, metaStore, wall, guid } = args;
  return withSpan(
    'pryzm.ifc.export4x3-wall',
    () => {
      const meta = metaStore.get(wall.id);
      const storey = resolveStorey(hierarchy, wall.levelId || null);

      const [a, b] = wall.baseLine;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const length = Math.hypot(dx, dz);
      const yaw = Math.atan2(dz, dx);
      const cx = (a.x + b.x) / 2;
      const cz = (a.z + b.z) / 2;
      const elevation = a.y + wall.baseOffset;

      const placement = buildLocalPlacement(api, modelId, hierarchy.defaultPlacement, {
        position: { x: cx, y: cz, z: elevation },
        rotationZ: yaw,
      });
      const representation = buildBoxRepresentation(
        api,
        modelId,
        hierarchy.representationContext,
        { width: length, depth: wall.thickness, height: wall.height },
      );

      const globalId = meta?.globalId ?? mintGlobalId(api, modelId, guid);
      const name = meta?.name ?? `Wall ${wall.id.slice(0, 8)}`;

      // IFC4X3 uses IFCWALL with PredefinedType (IFCWALLSTANDARDCASE deprecated).
      const entity = writeEntity(
        api,
        modelId,
        WebIFC.IFCWALL,
        globalId,
        ownerRefs.ownerHistory,
        label(api, modelId, name),
        meta?.description ? label(api, modelId, meta.description) : null,
        meta?.objectType ? label(api, modelId, meta.objectType) : null,
        placement,
        representation,
        label(api, modelId, wall.id),
        'STANDARD',
      );

      return { entity, storey, pryzmId: wall.id };
    },
    {
      'pryzm.ifc.element_id': wall.id,
      'pryzm.ifc.element_type': 'wall-ifc4x3',
    },
  );
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * IFC-α-2 extension: the IFC4X3 path optionally accepts a `rooms` array on
 * the snapshot. Each entry becomes an `IfcSpace` under its parent storey
 * with `Pset_SpaceCommon` attached. The base `ProjectSnapshot` (in
 * `types.ts`) does not yet carry this field — kept structural here so the
 * IFC4 path (orchestrator.ts) is untouched until the contract widens.
 */
type ProjectSnapshotWithRooms = ProjectSnapshot & {
  rooms?: ReadonlyArray<RoomToExport>;
};

/**
 * IFC-α-3 extension: the IFC4X3 path additionally accepts an `apartments`
 * array. Each entry becomes an `IfcZone` (ObjectType="Apartment") whose
 * member `IfcSpace`s are linked via `IfcRelAssignsToGroup`. Structural so
 * the IFC4 path and base `ProjectSnapshot` stay untouched.
 */
type ProjectSnapshotWithApartments = ProjectSnapshotWithRooms & {
  apartments?: ReadonlyArray<ApartmentToExport>;
};

/**
 * Export a PRYZM project snapshot to an IFC4X3 STEP file.
 *
 * Mirrors `exportProjectToIFC` from `orchestrator.ts` but serialises with
 * `WebIFC.Schemas.IFC4X3` so the output carries `FILE_SCHEMA(('IFC4X3'))`.
 *
 * IFC-α-2 (2026-06-01): if `snapshot.rooms` is present, each room is emitted
 * as an `IfcSpace` aggregated under the appropriate IfcBuildingStorey, with
 * `Pset_SpaceCommon` attached.
 */
export async function exportProjectToIFC4X3(
  snapshot: ProjectSnapshotWithApartments,
  metaStore: IFCMetaStoreLike,
  projectMeta: ProjectMeta,
  options: ExportOptions = {},
): Promise<ExportResult> {
  return withSpan('pryzm.ifc.export4x3', async (span) => {
    const api = new WebIFC.IfcAPI();
    await api.Init();

    // IFC4X3 schema — this controls the FILE_SCHEMA header in the STEP output.
    const modelId = api.CreateModel({ schema: WebIFC.Schemas.IFC4X3 });
    const guid: GuidProvider = options.guidProvider;
    const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);

    try {
      const ownerRefs = buildOwnerHistory(api, modelId, projectMeta, timestamp);
      const hierarchy = buildHierarchy(
        api,
        modelId,
        projectMeta,
        snapshot.levels ?? [],
        ownerRefs,
        guid,
      );

      const exported: ExportedElement[] = [];
      let psetCount = 0;
      let propertyCount = 0;
      let wallPsetCount = 0;

      const runPsets = (el: ExportedElement) => {
        const meta = metaStore.get(el.pryzmId);
        if (!meta || Object.keys(meta.psets).length === 0) return;
        const r = writeAllPsets({
          api,
          modelId,
          ownerRefs,
          element: el.entity,
          meta,
          guid,
        });
        psetCount += r.psetCount;
        propertyCount += r.propertyCount;
      };

      for (const wall of snapshot.walls ?? []) {
        const el = exportWallIFC4X3({ api, modelId, hierarchy, ownerRefs, metaStore, wall, guid });
        exported.push(el);
        runPsets(el);

        // IFC-α-4: every IfcWall additionally carries Pset_WallCommon. The
        // PRYZM Wall schema does not (yet) track FireRating / U-value /
        // LoadBearing / IsExternal — `pickWallCommonProps` filters absent
        // fields out, so the worst-case pset contains only the default
        // `Status = 'NEW'` (1 property). When the cognition-stack / family
        // platform start populating these, they reach the file unchanged.
        const wallInput: WallPsetInput = { id: wall.id };
        const r = writePsetWallCommon(el.entity, wallInput, {
          api,
          modelId,
          ownerRefs,
          guid,
        });
        wallPsetCount += 1;
        psetCount += 1;
        propertyCount += r.propertyCount;
      }
      for (const slab of snapshot.slabs ?? []) {
        const el = exportSlab({ api, modelId, hierarchy, ownerRefs, metaStore, slab, guid });
        exported.push(el);
        runPsets(el);
      }
      for (const door of snapshot.doors ?? []) {
        const el = exportDoor({ api, modelId, hierarchy, ownerRefs, metaStore, door, guid });
        exported.push(el);
        runPsets(el);
      }
      for (const window of snapshot.windows ?? []) {
        const el = exportWindow({ api, modelId, hierarchy, ownerRefs, metaStore, window, guid });
        exported.push(el);
        runPsets(el);
      }
      for (const column of snapshot.columns ?? []) {
        const el = exportColumn({ api, modelId, hierarchy, ownerRefs, metaStore, column, guid });
        exported.push(el);
        runPsets(el);
      }
      for (const beam of snapshot.beams ?? []) {
        const el = exportBeam({ api, modelId, hierarchy, ownerRefs, metaStore, beam, guid });
        exported.push(el);
        runPsets(el);
      }

      // IFC-α-2: Rooms → IfcSpace. Spaces are spatial-structure elements
      // (not products), so they aggregate under storeys via
      // IfcRelAggregates rather than IfcRelContainedInSpatialStructure.
      // The Pset_SpaceCommon is emitted INSIDE exportRoomToSpace; we
      // additionally honour any extra Psets the meta-store carries for the
      // room (mirrors how walls/slabs etc. round-trip imported Psets).
      const spaces: ExportedSpace[] = [];
      let spacePsetCount = 0;
      let spacePropertyCount = 0;
      for (const room of snapshot.rooms ?? []) {
        const sp = exportRoomToSpace({ api, modelId, hierarchy, ownerRefs, room, guid });
        spaces.push(sp);
        // Pset_SpaceCommon: 7 properties (Reference, NetFloorArea,
        // GrossFloorArea, GrossVolume, FinishCeilingHeight, OccupancyType,
        // IsExternal). Counted explicitly because the exporter writes them
        // inline rather than going through `writeAllPsets`.
        spacePsetCount += 1;
        spacePropertyCount += 7;

        // Honour any side-car Psets the IFCMetaStore carries for the room
        // (e.g. round-tripped on import). These are ADDITIONAL to
        // Pset_SpaceCommon and reach the file via the same path
        // walls/slabs use.
        const meta = metaStore.get(room.id);
        if (meta && Object.keys(meta.psets).length > 0) {
          const r = writeAllPsets({
            api,
            modelId,
            ownerRefs,
            element: sp.entity,
            meta,
            guid,
          });
          psetCount += r.psetCount;
          propertyCount += r.propertyCount;
        }
      }

      // Aggregate spaces under their storey (one IfcRelAggregates per storey).
      const spacesByStorey = new Map<number, { storey: ExportedSpace['storey']; entities: ExportedSpace['entity'][] }>();
      for (const sp of spaces) {
        const key = sp.storey.expressID;
        const bucket = spacesByStorey.get(key);
        if (bucket) bucket.entities.push(sp.entity);
        else spacesByStorey.set(key, { storey: sp.storey, entities: [sp.entity] });
      }
      for (const { storey, entities } of spacesByStorey.values()) {
        writeStoreyAggregatesSpaces(api, modelId, ownerRefs, guid, storey, entities);
      }
      psetCount += spacePsetCount;
      propertyCount += spacePropertyCount;

      // IFC-α-3: Apartments → IfcZone (+ IfcRelAssignsToGroup). Zones are a
      // cross-cutting non-spatial grouping (NOT part of the project ⊃ site ⊃
      // building ⊃ storey aggregation), so they assign their member spaces
      // via IfcRelAssignsToGroup. Defensive: when `apartments` is absent or
      // empty, this is a no-op and writes zero entities.
      const spaceRefMap = new Map<string, ExportedSpace['entity']>();
      for (const sp of spaces) spaceRefMap.set(sp.pryzmId, sp.entity);
      const zoneResult = writeAllApartmentZones(
        snapshot.apartments ?? [],
        spaceRefMap,
        { api, modelId, ownerRefs, guid },
      );

      // Group by storey → one IfcRelContainedInSpatialStructure per storey.
      const byStorey = new Map<number, { storey: ExportedElement['storey']; elements: ExportedElement['entity'][] }>();
      for (const el of exported) {
        const key = el.storey.expressID;
        const bucket = byStorey.get(key);
        if (bucket) bucket.elements.push(el.entity);
        else byStorey.set(key, { storey: el.storey, elements: [el.entity] });
      }
      for (const { storey, elements } of byStorey.values()) {
        writeEntity(
          api,
          modelId,
          WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE,
          mintGlobalId(api, modelId, guid),
          ownerRefs.ownerHistory,
          null,
          null,
          elements,
          storey,
        );
      }

      // IFC-α-2/α-3: `spaces` + `zones` are additional counts (not in the
      // base `ExportResult.counts` schema) — the fields are structural,
      // present only when the IFC4X3 path runs.
      const counts = {
        walls: snapshot.walls?.length ?? 0,
        slabs: snapshot.slabs?.length ?? 0,
        doors: snapshot.doors?.length ?? 0,
        windows: snapshot.windows?.length ?? 0,
        columns: snapshot.columns?.length ?? 0,
        beams: snapshot.beams?.length ?? 0,
        spaces: spaces.length,
        zones: zoneResult.zoneCount,
        wallPsets: wallPsetCount,
        psets: psetCount,
        properties: propertyCount,
      };
      span.setAttribute('pryzm.ifc.export4x3.element_count', exported.length);
      span.setAttribute('pryzm.ifc.export4x3.space_count', spaces.length);
      span.setAttribute('pryzm.ifc.export4x3.zone_count', zoneResult.zoneCount);
      span.setAttribute('pryzm.ifc.export4x3.wall_pset_count', wallPsetCount);
      span.setAttribute('pryzm.ifc.export4x3.pset_count', psetCount);

      const bytes = api.SaveModel(modelId);
      return { bytes, counts };
    } finally {
      try {
        api.CloseModel(modelId);
      } catch {
        // CloseModel can throw if the model was already discarded; ignore.
      }
    }
  });
}
