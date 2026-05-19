// CommandEventBridge — wires CommandBus.patches → runtime.events.
//
// Spec:  docs/03_PRYZM3/04-PLAN-FORWARD/34-HANDLER-PROTOCOL-GAP-ANALYSIS.md §3
//        ADR-002 §5 (handlers are pure; cross-cutting event relay lives here).
//        C11 §5.2 (typed domain events MUST flow through runtime.events).
//
// Design:
//   Handlers are pure functions: (ctx, payload) → HandlerResult.  They must not
//   import runtime-composer or fire runtime.events directly — that would create
//   an L4→L2 layer inversion (ADR-002 §2 layering rules).
//
//   Instead, CommandEventBridge subscribes to CommandBus.patches (a PatchEmitter)
//   at the composition-root level (L2) and re-emits a typed 'command.executed'
//   event on runtime.events after every successful dispatch.  No handler changes
//   are required — the bridge is wired once in composeRuntime.ts and disposed in
//   runtime.tearDown().
//
//   In addition to the generic 'command.executed' event, the bridge emits
//   typed family domain events (e.g. 'wall.created') so consumers can subscribe
//   to semantically meaningful events without string-parsing the `type` field.
//   This closes the C11 §5.2 typed-domain-event gap without touching any handler.
//
// Usage (composeRuntime.ts):
//   const disposeCommandBridge = wireCommandEventBridge(inner.bus.patches, events);
//   // ... in tearDown():
//   disposeCommandBridge();
//
// Consumers:
//   runtime.events.on('command.executed', ({ type, id, affectedStores }) => { ... });
//   runtime.events.on('wall.created', ({ commandId, levelId, wallCount }) => { ... });
//
// References:
//   packages/command-bus/src/PatchEmitter.ts  — subscribe surface
//   packages/runtime-composer/src/EventBus.ts — emit surface
//   packages/runtime-composer/src/types.ts    — RuntimeEvents union

import type { PatchEmitter } from '@pryzm/command-bus';
import type { EventBus } from './EventBus.js';

/**
 * Subscribe to `patchEmitter` and re-emit typed events on `events` after
 * every successful CommandBus dispatch:
 *
 *   1. `'command.executed'` — generic relay for every dispatch.
 *   2. Family-specific typed events (e.g. `'wall.created'`) — A24 §5.1.
 *
 * Returns a disposer — call it in `runtime.tearDown()` to unsubscribe.
 * Throwing from within the bridge is swallowed with `console.error` so
 * one bad emit cannot crash the command pipeline.
 */
export function wireCommandEventBridge(
  patchEmitter: PatchEmitter,
  events: EventBus,
): () => void {
  return patchEmitter.subscribe((_bytes, record) => {
    // ── 1. Generic 'command.executed' relay ──────────────────────────────────
    try {
      events.emit('command.executed', {
        id:             record.id,
        type:           record.type,
        affectedStores: record.affectedStores,
        actorId:        record.audit.actorId,
        projectId:      record.audit.projectId,
      });
    } catch (err) {
      console.error('[CommandEventBridge] Failed to emit command.executed for type=' +
        record.type + ':', err);
    }

    // ── 2. Typed family domain events (A24 — C11 §5.2) ───────────────────────
    // Each `case` emits a family-specific event so consumers can subscribe
    // without parsing the generic `type` string.  The payload is derived
    // from `record.payload` (what the caller passed to executeCommand) and
    // `record.id` (the ULID of the EventRecord).
    try {
      switch (record.type) {
        case 'wall.create': {
          // §P2.1 (IMPL-PLAN-2026-05-17): forward geometry fields so the F-1.2
          // legacy-store bridge in initTools.ts can mirror the wall into the legacy
          // WallStore without a second commandManager.execute() dual-write.
          const p = record.payload as {
            id?: string;
            levelId?: string;
            baseLine?: ReadonlyArray<{ x: number; y?: number; z: number }>;
            height?: number;
            thickness?: number;
            baseOffset?: number;
            systemTypeId?: string;
          };
          events.emit('wall.created', {
            commandId:    record.id,
            commandType:  'wall.create',
            levelId:      p.levelId ?? '',
            wallCount:    1,
            wallId:       p.id,
            baseLine:     p.baseLine,
            height:       p.height,
            thickness:    p.thickness,
            baseOffset:   p.baseOffset,
            systemTypeId: p.systemTypeId,
          });
          break;
        }
        case 'wall.batch.create': {
          // TASK-01 (MASTER-IMPL-PLAN-2026-05-18): emit one 'wall.created' per element so
          // the initTools.ts §P2.1 bridge mirrors each wall into the legacy WallStore and
          // triggers WallRebuildCoordinator → 3D mesh build.  Using commandType 'wall.create'
          // so the existing subscriber's commandType guard accepts each per-element event.
          // The batch is still one atomic Immer patch / one undo-stack entry — this emit
          // loop is notification-only and does not affect undo behaviour.
          const p = record.payload as {
            walls?: Array<{
              id?: string;
              levelId?: string;
              baseLine?: ReadonlyArray<{ x: number; y?: number; z: number }>;
              height?: number;
              thickness?: number;
              baseOffset?: number;
              systemTypeId?: string;
            }>;
            levelId?: string;
          };
          const _batchWallLevelId = p.levelId ?? '';
          for (const w of (p.walls ?? [])) {
            if (!w.id || !w.baseLine || w.baseLine.length < 2) continue;
            events.emit('wall.created', {
              commandId:    record.id,
              commandType:  'wall.create',
              levelId:      w.levelId ?? _batchWallLevelId,
              wallCount:    1,
              wallId:       w.id,
              baseLine:     w.baseLine,
              height:       w.height,
              thickness:    w.thickness,
              baseOffset:   w.baseOffset,
              systemTypeId: w.systemTypeId,
            });
          }
          break;
        }

        // ── §P2.3 (IMPL-PLAN-2026-05-17): wall opening creation ──────────────
        // Both the legacy adapter path (wall.opening.create, from Door/Window plan
        // tools) and the PRYZM3 typed path (wall.createOpening, from door/window
        // plugins) emit wall.opening.created so the initTools.ts bridge can mirror
        // the opening into the legacy WallStore → WallRebuildCoordinator → mesh.
        case 'wall.opening.create': {
          const p = record.payload as { wallId?: string; openingData?: Record<string, unknown> };
          events.emit('wall.opening.created', {
            commandId:   record.id,
            commandType: 'wall.opening.create',
            wallId:      p.wallId ?? '',
            opening:     p.openingData ?? {},
          });
          break;
        }
        case 'wall.createOpening': {
          const p = record.payload as { wallId?: string; opening?: Record<string, unknown> };
          events.emit('wall.opening.created', {
            commandId:   record.id,
            commandType: 'wall.createOpening',
            wallId:      p.wallId ?? '',
            opening:     p.opening ?? {},
          });
          break;
        }

        // ── A25: Remaining-family typed domain events (C11 §5.2) ─────────────
        // Pattern mirrors wall cases above.  Payload cast is intentionally
        // minimal — we only extract fields present in *all* create payloads
        // (levelId is '' when not present — S07 allowance).

        case 'slab.create': {
          // §FT1 (ELEMENT-FUNCTIONAL-FIX-PLAN-2026-05-18): enrich with geometry fields so
          // the initTools.ts legacy-store bridge can mirror the slab into SlabStore and
          // trigger SlabFragmentBuilder mesh rebuild — same pattern as §P3.2-RF roof.create.
          // Fields map directly to SlabData: polygon={x,y}[] (y=worldZ per plan convention),
          // position={0,0,0} (centroid NOT pre-added — SlabFragmentBuilder adds it internally).
          const p = record.payload as {
            id?: string;
            levelId?: string;
            ifcGuid?: string;
            polygon?: Array<{ x: number; y: number }>;
            position?: { x: number; y: number; z: number };
            width?: number;
            depth?: number;
            thickness?: number;
            baseOffset?: number;
            materialId?: string;
          };
          events.emit('slab.created', {
            commandId:    record.id,
            commandType:  'slab.create',
            levelId:      p.levelId ?? '',
            elementCount: 1,
            id:           p.id,
            ifcGuid:      p.ifcGuid,
            polygon:      p.polygon,
            position:     p.position,
            width:        p.width,
            depth:        p.depth,
            thickness:    p.thickness,
            baseOffset:   p.baseOffset,
            materialId:   p.materialId,
          });
          break;
        }

        case 'slab.batch.create': {
          // TASK-01: emit one 'slab.created' per element — same pattern as wall.batch.create.
          // CreateSlabPayload uses `boundary` (plan polygon) which maps to `polygon` in the
          // initTools §FT1 subscriber and legacy SlabStore.  Also accepts `polygon` directly
          // for callers that use the older field name.
          const p = record.payload as {
            slabs?: Array<{
              id?: string;
              levelId?: string;
              boundary?: Array<{ x: number; y: number }>;
              polygon?: Array<{ x: number; y: number }>;
              thickness?: number;
              baseOffset?: number;
              materialId?: string;
              systemTypeId?: string;
              ifcGuid?: string;
            }>;
            levelId?: string;
          };
          const _batchSlabLevelId = p.levelId ?? '';
          for (const s of (p.slabs ?? [])) {
            const _slabPolygon = s.polygon ?? s.boundary;
            if (!s.id || !_slabPolygon || _slabPolygon.length < 3) continue;
            events.emit('slab.created', {
              commandId:    record.id,
              commandType:  'slab.create',
              levelId:      s.levelId ?? _batchSlabLevelId,
              elementCount: 1,
              id:           s.id,
              ifcGuid:      s.ifcGuid,
              polygon:      _slabPolygon,
              position:     { x: 0, y: 0, z: 0 },
              thickness:    s.thickness,
              baseOffset:   s.baseOffset,
              materialId:   s.materialId ?? s.systemTypeId,
            });
          }
          break;
        }

        case 'curtainwall.create': {
          // §P3.1-CW (IMPL-PLAN-2026-05-17): geometry fields added so the
          // initTools.ts legacy-store bridge can mirror the curtain wall into
          // the CurtainWallStore and trigger mesh rebuild — same pattern as
          // the 'wall.created' enrichment above.
          // TASK-02 (MASTER-IMPL-PLAN-2026-05-18): add bayWidth/bayHeight/mullionThickness so
          // the initTools.ts §P3.1-CW bridge can pass grid spacing to curtainWallStoreInstance.
          // Without these fields, migrateToGridSystem() receives undefined spacings → NaN → 0
          // curtain-wall cells → empty mesh (CONFIRMED CRITICAL finding ASSUMED-D).
          const p = record.payload as {
            id?: string;
            levelId?: string;
            baseLine?: ReadonlyArray<{ x: number; y?: number; z: number }>;
            height?: number;
            bayWidth?: number;
            bayHeight?: number;
            mullionThickness?: number;
          };
          events.emit('curtain-wall.created', {
            commandId:        record.id,
            commandType:      'curtainwall.create',
            levelId:          p.levelId ?? '',
            elementCount:     1,
            id:               p.id,
            baseLine:         p.baseLine,
            height:           p.height,
            bayWidth:         p.bayWidth ?? 1.2,
            bayHeight:        p.bayHeight ?? 1.5,
            mullionThickness: p.mullionThickness ?? 0.05,
          });
          break;
        }

        case 'curtain-wall.batch.create': {
          // TASK-01: emit one 'curtain-wall.created' per element.
          // commandType is set to 'curtainwall.create' (single-create value) so the
          // initTools §P3.1-CW subscriber's commandType guard accepts each per-element event.
          // bayWidth/bayHeight are forwarded so the grid system receives valid spacings.
          const p = record.payload as {
            curtainWalls?: Array<{
              id?: string;
              levelId?: string;
              baseLine?: ReadonlyArray<{ x: number; y?: number; z: number }>;
              height?: number;
              bayWidth?: number;
              bayHeight?: number;
              mullionThickness?: number;
            }>;
            levelId?: string;
            height?: number;
          };
          const _batchCWLevelId = p.levelId ?? '';
          const _batchCWDefaultHeight = p.height ?? 3;
          for (const cw of (p.curtainWalls ?? [])) {
            if (!cw.id || !cw.baseLine || cw.baseLine.length < 2) continue;
            events.emit('curtain-wall.created', {
              commandId:        record.id,
              commandType:      'curtainwall.create',
              levelId:          cw.levelId ?? _batchCWLevelId,
              elementCount:     1,
              id:               cw.id,
              baseLine:         cw.baseLine,
              height:           cw.height ?? _batchCWDefaultHeight,
              bayWidth:         cw.bayWidth ?? 1.2,
              bayHeight:        cw.bayHeight ?? 1.5,
              mullionThickness: cw.mullionThickness ?? 0.05,
            });
          }
          break;
        }

        case 'column.create': {
          // §P3.3-CO: enrich with geometry fields so the initTools.ts legacy-store bridge
          // can reconstruct ColumnData {position, profile} for ColumnFragmentBuilder.
          const p = record.payload as {
            id?: string;
            levelId?: string;
            origin?: { x: number; y: number; z: number };
            shape?: string;
            width?: number;
            depth?: number;
            height?: number;
            baseOffset?: number;
            rotation?: number;
            materialId?: string;
          };
          events.emit('column.created', {
            commandId:    record.id,
            commandType:  'column.create',
            levelId:      p.levelId ?? '',
            elementCount: 1,
            id:           p.id,
            origin:       p.origin,
            shape:        p.shape,
            width:        p.width,
            depth:        p.depth,
            height:       p.height,
            baseOffset:   p.baseOffset,
            rotation:     p.rotation,
            materialId:   p.materialId,
          });
          break;
        }

        case 'column.batch.create': {
          // TASK-01: emit one 'column.created' per element so the initTools.ts §P3.3-CO bridge
          // mirrors each column into the legacy ColumnStore → ColumnFragmentBuilder mesh.
          const p = record.payload as {
            columns?: Array<{
              id?: string;
              levelId?: string;
              origin?: { x: number; y: number; z: number };
              shape?: string;
              width?: number;
              depth?: number;
              height?: number;
              baseOffset?: number;
              rotation?: number;
              materialId?: string;
              systemTypeId?: string;
            }>;
            levelId?: string;
          };
          const _batchColLevelId = p.levelId ?? '';
          for (const c of (p.columns ?? [])) {
            if (!c.id || !c.origin) continue;
            events.emit('column.created', {
              commandId:    record.id,
              commandType:  'column.create',
              levelId:      c.levelId ?? _batchColLevelId,
              elementCount: 1,
              id:           c.id,
              origin:       c.origin,
              shape:        c.shape,
              width:        c.width,
              depth:        c.depth,
              height:       c.height,
              baseOffset:   c.baseOffset,
              rotation:     c.rotation,
              materialId:   c.materialId ?? c.systemTypeId,
            });
          }
          break;
        }

        case 'beam.create': {
          // §FT2 (ELEMENT-FUNCTIONAL-FIX-PLAN-2026-05-18): enrich with geometry fields so
          // the initTools.ts legacy-store bridge can mirror the beam into BeamStore and
          // trigger BeamFragmentBuilder mesh rebuild — same pattern as §P3.2-RF roof.create.
          // BeamData uses startPoint/endPoint (3D Vec3) — matches BeamPlanToolHandler dispatch.
          const p = record.payload as {
            id?: string;
            levelId?: string;
            startPoint?: { x: number; y: number; z: number };
            endPoint?: { x: number; y: number; z: number };
            shape?: string;
            width?: number;
            depth?: number;
            materialId?: string;
          };
          events.emit('beam.created', {
            commandId:    record.id,
            commandType:  'beam.create',
            levelId:      p.levelId ?? '',
            elementCount: 1,
            id:           p.id,
            startPoint:   p.startPoint,
            endPoint:     p.endPoint,
            shape:        p.shape,
            width:        p.width,
            depth:        p.depth,
            materialId:   p.materialId,
          });
          break;
        }

        case 'beam.batch.create': {
          // TASK-01: emit one 'beam.created' per element so the initTools.ts §FT2 bridge
          // mirrors each beam into the legacy BeamStore → BeamFragmentBuilder mesh.
          // CreateBeamPayload uses `baseLine` ([start, end] Vec3) but the initTools subscriber
          // and BeamStore.add() use startPoint/endPoint — converted here.
          const p = record.payload as {
            beams?: Array<{
              id?: string;
              levelId?: string;
              baseLine?: ReadonlyArray<{ x: number; y: number; z: number }>;
              shape?: string;
              width?: number;
              depth?: number;
              materialId?: string;
              systemTypeId?: string;
            }>;
            levelId?: string;
          };
          const _batchBeamLevelId = p.levelId ?? '';
          for (const b of (p.beams ?? [])) {
            if (!b.id || !b.baseLine || b.baseLine.length < 2) continue;
            events.emit('beam.created', {
              commandId:    record.id,
              commandType:  'beam.create',
              levelId:      b.levelId ?? _batchBeamLevelId,
              elementCount: 1,
              id:           b.id,
              startPoint:   b.baseLine[0] as { x: number; y: number; z: number },
              endPoint:     b.baseLine[1] as { x: number; y: number; z: number },
              shape:        b.shape,
              width:        b.width,
              depth:        b.depth,
              materialId:   b.materialId ?? b.systemTypeId,
            });
          }
          break;
        }

        // TASK-13 (MASTER-IMPL-PLAN-FUNCTIONAL-2026-05-18 RISK-3): door/window/stair CEB
        // cases removed — no initTools.ts subscribers exist for 'door.created',
        // 'window.created', or 'stair.created' (confirmed grep returned 0 hits).
        // • door / window: use the Committer architecture (Path A) — no CEB bridge needed.
        // • stair: uses Path C (legacy commandManager bridge) — no CEB bridge needed.
        // Pre-removal grep: grep -rn "door\.created\|window\.created\|stair\.created" apps/ packages/ plugins/ → 0 matches outside CEB.

        case 'ceiling.create': {
          // §P3.2-CL: enrich with geometry fields so the initTools.ts legacy-store bridge
          // can mirror the new-schema ceiling into CeilingStore for mesh rendering.
          const p = record.payload as {
            id?: string;
            levelId?: string;
            boundary?: Array<{ x: number; y: number; z: number }>;
            ceilingHeight?: number;
            thickness?: number;
          };
          events.emit('ceiling.created', {
            commandId:    record.id,
            commandType:  'ceiling.create',
            levelId:      p.levelId ?? '',
            elementCount: 1,
            id:           p.id,
            boundary:     p.boundary,
            ceilingHeight: p.ceilingHeight,
            thickness:    p.thickness,
          });
          break;
        }

        case 'ceiling.batch.create': {
          // TASK-01: emit one 'ceiling.created' per element so the initTools.ts §P3.2-CL bridge
          // mirrors each ceiling into the legacy CeilingStore → CeilingPanelBuilder mesh.
          const p = record.payload as {
            ceilings?: Array<{
              id?: string;
              levelId?: string;
              boundary?: Array<{ x: number; y: number; z: number }>;
              ceilingHeight?: number;
              thickness?: number;
              materialId?: string;
            }>;
            levelId?: string;
          };
          const _batchCeilLevelId = p.levelId ?? '';
          for (const c of (p.ceilings ?? [])) {
            if (!c.id || !c.boundary || c.boundary.length < 3) continue;
            events.emit('ceiling.created', {
              commandId:    record.id,
              commandType:  'ceiling.create',
              levelId:      c.levelId ?? _batchCeilLevelId,
              elementCount: 1,
              id:           c.id,
              boundary:     c.boundary,
              ceilingHeight: c.ceilingHeight,
              thickness:    c.thickness,
            });
          }
          break;
        }

        case 'room.create': {
          const p = record.payload as { levelId?: string };
          events.emit('room.created', {
            commandId:   record.id,
            commandType: 'room.create',
            levelId:     p.levelId ?? '',
          });
          break;
        }

        case 'grid.create': {
          const p = record.payload as { levelId?: string };
          events.emit('grid.created', {
            commandId:   record.id,
            commandType: 'grid.create',
            levelId:     p.levelId ?? '',
          });
          break;
        }

        case 'handrail.create': {
          const p = record.payload as { levelId?: string };
          events.emit('handrail.created', {
            commandId:   record.id,
            commandType: 'handrail.create',
            levelId:     p.levelId ?? '',
          });
          break;
        }

        case 'furniture.create': {
          const p = record.payload as { levelId?: string };
          events.emit('furniture.created', {
            commandId:   record.id,
            commandType: 'furniture.create',
            levelId:     p.levelId ?? '',
          });
          break;
        }

        case 'lighting.create': {
          const p = record.payload as { levelId?: string };
          events.emit('lighting.created', {
            commandId:   record.id,
            commandType: 'lighting.create',
            levelId:     p.levelId ?? '',
          });
          break;
        }

        case 'plumbing.create': {
          const p = record.payload as { levelId?: string };
          events.emit('plumbing.created', {
            commandId:   record.id,
            commandType: 'plumbing.create',
            levelId:     p.levelId ?? '',
          });
          break;
        }

        case 'structural.create': {
          const p = record.payload as { levelId?: string };
          events.emit('structural.created', {
            commandId:   record.id,
            commandType: 'structural.create',
            levelId:     p.levelId ?? '',
          });
          break;
        }

        case 'annotation.create': {
          const p = record.payload as { levelId?: string };
          events.emit('annotation.created', {
            commandId:   record.id,
            commandType: 'annotation.create',
            levelId:     p.levelId ?? '',
          });
          break;
        }

        case 'dimension.create': {
          const p = record.payload as { levelId?: string };
          events.emit('dimension.created', {
            commandId:   record.id,
            commandType: 'dimension.create',
            levelId:     p.levelId ?? '',
          });
          break;
        }

        case 'roof.create': {
          // §P3.2-RF: enrich with geometry fields so the initTools.ts legacy-store bridge
          // can reconstruct footprint.{polygon, centroid} for RoofFragmentBuilder.
          const p = record.payload as {
            id?: string;
            levelId?: string;
            boundary?: Array<{ x: number; y: number; z: number }>;
            shape?: string;
            overhang?: number;
            thickness?: number;
          };
          events.emit('roof.created', {
            commandId:   record.id,
            commandType: 'roof.create',
            levelId:     p.levelId ?? '',
            id:          p.id,
            boundary:    p.boundary,
            shape:       p.shape,
            overhang:    p.overhang,
            thickness:   p.thickness,
          });
          break;
        }

        case 'slab.updateLayers': {
          // TASK-12: emit 'slab.layer-updated' so FragmentBuilder subscribers know
          // the slab's system-type / layer stack has changed and can trigger a mesh rebuild.
          const p = record.payload as {
            slabId?: string;
            systemTypeId?: string;
            layers?: unknown[];
            thickness?: number;
          };
          events.emit('slab.layer-updated', {
            commandId:    record.id,
            commandType:  'slab.updateLayers',
            slabId:       p.slabId,
            systemTypeId: p.systemTypeId,
            layerCount:   Array.isArray(p.layers) ? p.layers.length : 0,
            thickness:    p.thickness,
          });
          break;
        }

        case 'ceiling.updateLayers': {
          // TASK-12: emit 'ceiling.layer-updated' so FragmentBuilder subscribers know
          // the ceiling's system-type / layer stack has changed and can trigger a mesh rebuild.
          const p = record.payload as {
            ceilingId?: string;
            systemTypeId?: string;
            layers?: unknown[];
            thickness?: number;
          };
          events.emit('ceiling.layer-updated', {
            commandId:    record.id,
            commandType:  'ceiling.updateLayers',
            ceilingId:    p.ceilingId,
            systemTypeId: p.systemTypeId,
            layerCount:   Array.isArray(p.layers) ? p.layers.length : 0,
            thickness:    p.thickness,
          });
          break;
        }

        case 'floor.updateLayers': {
          // TASK-12: emit 'floor.layer-updated' so FragmentBuilder subscribers know
          // the floor's system-type / layer stack has changed and can trigger a mesh rebuild.
          const p = record.payload as {
            floorId?: string;
            systemTypeId?: string;
            layers?: unknown[];
            thickness?: number;
          };
          events.emit('floor.layer-updated', {
            commandId:    record.id,
            commandType:  'floor.updateLayers',
            floorId:      p.floorId,
            systemTypeId: p.systemTypeId,
            layerCount:   Array.isArray(p.layers) ? p.layers.length : 0,
            thickness:    p.thickness,
          });
          break;
        }

        case 'floor.create': {
          // §P3.2-FL: enrich with geometry fields so the initTools.ts legacy-store bridge
          // can reconstruct a FloorData for FloorFragmentBuilder via floorStore.add().
          const p = record.payload as {
            floorId?: string;
            ifcGuid?: string;
            polygon?: Array<{ x: number; y: number; z: number }>;
            baseOffset?: number;
            thickness?: number;
            levelId?: string;
            label?: string;
            systemTypeId?: string;
            layers?: unknown[];
            finishSpec?: Record<string, unknown>;
            serviceHoles?: unknown[];
            hostSlabId?: string;
            hostRoomId?: string;
            createdBy?: string;
          };
          events.emit('floor.created', {
            commandId:    record.id,
            commandType:  'floor.create',
            levelId:      p.levelId ?? '',
            floorId:      p.floorId,
            ifcGuid:      p.ifcGuid,
            polygon:      p.polygon,
            baseOffset:   p.baseOffset,
            thickness:    p.thickness,
            label:        p.label,
            systemTypeId: p.systemTypeId,
            layers:       p.layers,
            finishSpec:   p.finishSpec,
            serviceHoles: p.serviceHoles,
            hostSlabId:   p.hostSlabId,
            hostRoomId:   p.hostRoomId,
            createdBy:    p.createdBy,
          });
          break;
        }

        default:
          break;
      }
    } catch (err) {
      console.error('[CommandEventBridge] Failed to emit family event for type=' +
        record.type + ':', err);
    }
  });
}
