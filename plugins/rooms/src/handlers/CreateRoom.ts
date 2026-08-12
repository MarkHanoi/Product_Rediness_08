// CreateRoomHandler — 'room.create' (S25 → §FIX-ROOM-CREATE-STORE-KEY).
//
// Spec: `phases/PHASE-2A-Q1-M13-M15-NON-ELEMENT-COMPLETION.md` §S25.
// Decision: ADR-0022. Store-key root cause: L-75 / L-79 (same family as the
// eleven sibling handlers in this directory).
//
// ─── §FIX-ROOM-CREATE-STORE-KEY — WHY THIS HANDLER WAS REWRITTEN ────────────
//
// MEASURED, not suspected. The CA-21 executed read-back
// (`tools/rac-conformance/runtime-harness/__tests__/liveness.probe.ts`) dispatched
// `room.create` on the REAL composed bus and got, before any store was even read:
//
//     dispatch-threw: CommandBusError: room.create: required store 'room' is
//     missing from HandlerContext.stores
//
// That is not a read-back failure. It means this handler **could never execute at
// all** — in the browser or headless. It declared `affectedStores: ['room']` while
// `PluginRegistry.ts` contributes the plugin RoomStore under storeKey `'rooms'`
// (plural), so `CommandBus.buildContext()` threw before `execute()` was reached.
// This is exactly the L-75/L-79 defect that was already fixed in `room.setName`,
// `room.rename`, `room.delete`, `room.move`, `room.setNumber`, `room.setFinish`,
// `room.setMaterial`, `room.setHeightOffset`, `room.setOccupancy` and
// `room.recomputeBoundary` — **`room.create` was the last one left holding it.**
//
// The blast radius was live, not theoretical. `RoomPlanToolHandler.ts:114` is the
// plan-view room tool's SOLE creation path and it dispatches this verb; the AI
// room assistant (`RoomAIAssistant.ts:165`) and the apartment-layout executor
// (`executePlan.ts:839`) dispatch it too. Every one of those calls was throwing
// and being swallowed by a `.catch()`. (`RoomTool.ts:224/387` also dispatch it,
// but there it is a fire-and-forget notification alongside the real
// `commandManager.execute(new CreateRoomCommand(...))` two lines below.)
//
// ─── FIX THE WRITE, not REFUSE — and why that is the opposite call to door.create
//
// `door.create` was made to REFUSE (§FIX-CREATE-LIVENESS-LIE) because a door is a
// HOSTED opening: an independent `doorStore.add()` would have minted a door with
// no host opening — a lie about *what the model is*, which is worse than a lie
// about whether it moved. There is no such trade here. A room is a first-class
// element with its own record, and PRYZM already has exactly ONE authoritative
// creation path for it: `CreateRoomCommand` (`@pryzm/command-registry`), which
// `RoomTool` itself drives. That command does the three things a bare
// `roomStore.add()` would skip — unique room-number assignment
// (`assignUniqueRoomNumber`), `bimManager.registerElement` spatial registration,
// and `elementRegistry.registerSemantic` — in the §R-3 order the room contract
// requires.
//
// So this handler DELEGATES to that command rather than writing anything itself.
// That is not a second write site: it is *the* write site, reached through the
// same `window.commandManager` bridge the eleven siblings above already use, and
// undo therefore lands on the legacy stack exactly as it does for them. Hence
// `affectedStores: []` — no Immer patch is produced here, which is also what makes
// the storeKey mismatch unrepresentable in future.
//
// ─── WHAT IT REFUSES, AND WHY IT MUST ───────────────────────────────────────
//
// `RoomStore.add()` gates on `RoomDataAddSchema`, which REQUIRES `computed`
// (area / grossArea / perimeter / volume / centroid / boundingBox) and `metadata`.
// Those are DERIVED values. This plugin cannot invent them: `computeRoomMetrics`
// lives in `@pryzm/room-topology`, and re-deriving area/centroid here would mint a
// rival derivation that silently disagrees with the one the area schedules, the
// room label renderer and the IFC exporter read. So an incomplete payload is
// REFUSED with the missing fields named, and the refusal points at the two paths
// that do work:
//   • a complete RoomData payload — the shape `RoomPlanToolHandler.ts:114` sends;
//   • `room.redetect` (→ `ReDetectRoomsCommand`) for wall-bound rooms, which is
//     how rooms are normally born in PRYZM: derived from the wall graph, not minted.
//
// ADR-0299 §RECOVERY-MUST-REFUSE / C16 §5.1 CA-21: a bridge that cannot reach
// authoritative state THROWS. It never returns an empty patch pair, because an
// empty patch pair is indistinguishable from "applied, nothing to change" — the
// Class-A dead verb this whole family exists to end.

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { CreateRoomCommand } from './legacyCommands.js';

/**
 * The payload `room.create` accepts: a complete `RoomData` record, i.e. the shape
 * `RoomStore.add()`'s Zod gate validates. Typed loosely on purpose — the
 * authoritative schema lives in `@pryzm/room-topology`, which this plugin
 * deliberately does not import (see the sibling handlers' notes); the field-level
 * verdict is delivered by that schema at the store gate, not duplicated here.
 */
export interface CreateRoomPayload {
  readonly id?: string;
  readonly type?: string;
  readonly levelId?: string;
  readonly name?: string;
  readonly roomNumber?: string;
  readonly occupancyType?: string;
  readonly boundary?: {
    readonly polygon?: ReadonlyArray<{ readonly x: number; readonly z: number }>;
    readonly height?: number;
    readonly baseOffset?: number;
    readonly detectionMethod?: string;
  };
  readonly computed?: Record<string, unknown>;
  readonly metadata?: Record<string, unknown>;
  readonly [k: string]: unknown;
}

/**
 * The one place the completeness rule is stated. Returns `null` when the payload
 * can be handed to `CreateRoomCommand`, or a refusal reason NAMING what is absent
 * and what to call instead — never a bare "invalid".
 */
function whyNotACompleteRoom(cmd: CreateRoomPayload): string | null {
  const missing: string[] = [];
  if (typeof cmd.id !== 'string' || cmd.id.length === 0) missing.push('id');
  if (typeof cmd.levelId !== 'string' || cmd.levelId.length === 0) missing.push('levelId');
  const poly = cmd.boundary?.polygon;
  if (!Array.isArray(poly) || poly.length < 3) missing.push('boundary.polygon (≥3 vertices)');
  if (cmd.computed === null || typeof cmd.computed !== 'object') missing.push('computed');
  if (cmd.metadata === null || typeof cmd.metadata !== 'object') missing.push('metadata');
  if (missing.length === 0) return null;
  return (
    'room.create needs a COMPLETE RoomData record and this payload is missing: ' +
    missing.join(', ') +
    '. `computed` (area/grossArea/perimeter/volume/centroid/boundingBox) and `metadata` are DERIVED — ' +
    'this plugin will not re-derive them, because a rival derivation would silently disagree with the ' +
    'one the area schedules, the room label renderer and the IFC exporter read. ' +
    'Either send the complete record (the shape apps/editor/src/engine/views/plantools/RoomPlanToolHandler.ts:114 ' +
    'sends, which CreateRoomCommand accepts verbatim), or — for a wall-bound room — dispatch ' +
    '`room.redetect` { levelId }, which runs ReDetectRoomsCommand and derives the boundary from the wall graph.'
  );
}

export class CreateRoomHandler implements CommandHandler<CreateRoomPayload, Record<string, unknown>> {
  readonly type = 'room.create';
  /**
   * §FIX-ROOM-CREATE-STORE-KEY — `[]`, matching every sibling bridge in this
   * directory. The authoritative write is `CreateRoomCommand` and undo lives on
   * the legacy stack with it; producing an Immer patch over the plugin `RoomsState`
   * would recreate the storeKey mismatch AND write into a store nothing reads.
   */
  readonly affectedStores = [] as const;

  canExecute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: CreateRoomPayload,
  ): ValidationResult {
    if (cmd.type !== undefined && cmd.type !== 'room') {
      return { valid: false, reason: `room.create: type must be "room" (got ${String(cmd.type)})` };
    }
    if (typeof cmd.name === 'string' && cmd.name.length > 256) {
      return { valid: false, reason: 'room.create: name must be ≤ 256 characters' };
    }
    const why = whyNotACompleteRoom(cmd);
    if (why !== null) return { valid: false, reason: why };
    return { valid: true };
  }

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: CreateRoomPayload,
  ): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
      const cm =
        typeof window === 'undefined'
          ? undefined
          : (window as unknown as {
              commandManager?: { execute(c: unknown, o?: unknown): { success?: boolean; error?: string } | void };
            }).commandManager;

      // §FIX-ROOM-CREATE-STORE-KEY — no commandManager means the ONLY path to
      // authoritative room state is absent in this process. That is a failure, not
      // a no-op, and it is reported as one (C16 §5.1 CA-21 / ADR-0299).
      if (!cm) {
        throw new Error(
          'room.create: the legacy command manager is not available in this process, so no room was created. ' +
            'The authoritative path is CreateRoomCommand (@pryzm/command-registry), which needs the engine half — ' +
            'a BimManager level authority + RoomStore — that apps/editor/src/engine/initBuilders.ts attaches at boot ' +
            '(roomStore.attachEngine, §ADR-0318-ELEMENTS-SLOT). A composed runtime without that half cannot create a room.',
        );
      }

      let result: { success?: boolean; error?: string } | void;
      try {
        // The payload IS the RoomData record. CreateRoomCommand re-validates it at
        // the RoomStore Zod gate, so a malformed record is rejected there by the
        // authoritative schema rather than by a copy of it living here.
        result = cm.execute(new CreateRoomCommand(cmd as never));
      } catch (e) {
        // Never swallow: this used to be a store-key throw nobody saw because every
        // call site wrapped the dispatch in `.catch()`.
        console.error('[room.create.handler] CreateRoomCommand bridge failed:', e);
        throw e instanceof Error ? e : new Error(String(e));
      }
      if (result && result.success === false) {
        throw new Error(
          `room.create: CreateRoomCommand refused — ${result.error ?? 'no reason given'}`,
        );
      }
      return { forward: [], inverse: [] };
    }); // withHandlerSpan — C10 §2
  }
}
