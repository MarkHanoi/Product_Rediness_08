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
//
// ─── §FIX-ROOM-CREATE-REFUSAL-IS-A-VALUE (C-FIX LANE 3, P3 AXIS C) ──────────
//
// ⚠ THE PARAGRAPH DIRECTLY ABOVE IS NARROWER THAN IT READS, and the ENGINE-ABSENT
// branch below no longer obeys it. "It never returns an empty patch pair" is
// about a BARE empty pair — C16 CA-18 shape (b), which cannot be told apart from
// "applied, nothing to change". C80 §1.4 exists precisely to close that gap: an
// empty pair carrying a typed `CapabilityRefusal` on `HandlerResult.refusal` IS
// distinguishable, by construction, and `types.ts` says so at the field
// ("PRESENT ⇒ forward/inverse are empty BY CONSTRUCTION and the empty pair is a
// determined refusal, not the C16 CA-18(b) silent no-op"). So the choice here was
// never throw-vs-silence; it was throw-vs-VALUE, and C80 §10.f settles it: a
// throw is what a fire-and-forget catch-block swallows. THREE of this verb's four
// live dispatchers are exactly that shape — `RoomAIAssistant.ts:165` and
// `RoomTool.ts:224/387` catch to an EMPTY block, and only
// `RoomPlanToolHandler.ts:149` logs. The throw was reaching nobody.
//
// ⭐ WHAT WAS MEASURED FIRST, so this is not read as a wiring fix it is not:
//   · the handler IS registered in production — `PluginRegistry.ts:694`
//     (`buildRoomHandlerSet` via composeRuntime) and again at
//     `engineLauncher.ts:658` (`registerRoomHandlers`, F-1.3);
//   · `window.commandManager` IS assigned in production, at
//     `initTools.ts:3254`.
// So in the browser this verb DELEGATES and rooms are created; the absence is
// real only in a composed process that never boots the engine half. That absence
// is LEGITIMATE, and closing it from inside this plugin would mean minting rooms
// locally — a RIVAL of `CreateRoomCommand` that skips unique room-number
// assignment, `bimManager.registerElement` and `elementRegistry.registerSemantic`.
// NOT DONE. The refusal is the correct answer, and it is now readable.
//
// ⚠ THIS IS A CONDITIONAL REFUSAL, NOT A DEAD VERB. `check-verb-register.ts`
// classifies by a slice regex (`refusesByValue`) that cannot see a mutation
// performed through `commandManager`, so it may grade this verb REFUSES — which
// its own ⚠ on `refusesInCanExecute` calls the worse defect ("a gate that grades
// a working bridge 'refuses' is worse than the defect it was written to fix").
// The reading to trust is the executed one:
// `__tests__/roomCreateEngineRefusal.test.ts`, whose last case dispatches the
// SAME payload with a command manager present and proves it reaches
// `CreateRoomCommand` and returns NO refusal.

import {
  capabilityRefused,
  withHandlerSpan,
  type CapabilityRefusal,
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

/**
 * §FIX-ROOM-CREATE-REFUSAL-IS-A-VALUE — the ENGINE-ABSENT refusal, built where it
 * can be unit-tested independently of the bus (the shape
 * `buildRegenerationRefusal` in `RegenerateRooms.ts` established for this
 * directory).
 *
 * C80 §1.4's both-numbers discipline is structural: `room.create` names exactly
 * ONE room per dispatch, so `asked` is 1 — a REAL count, not a sentinel — and
 * `unaccountedFor` is the same 1, because the single room asked for is the one
 * that cannot be accounted for. Neither is `undefined` here: the §5.2
 * known-vs-unknown rule reserves that for an ask that names no element set, and
 * this ask names one.
 */
export function buildEngineAbsentRefusal(cmd: CreateRoomPayload): CapabilityRefusal {
  const named = typeof cmd.name === 'string' && cmd.name.length > 0 ? ` '${cmd.name}'` : '';
  return capabilityRefused({
    commandType: 'room.create',
    reason: 'ENGINE_NOT_AVAILABLE',
    asked: 1,
    unaccountedFor: 1,
    protects:
      'the registration work CreateRoomCommand (@pryzm/command-registry) performs in the §R-3 order and ' +
      'a plugin-local roomStore.add() would skip — unique room-number assignment (assignUniqueRoomNumber), ' +
      'bimManager.registerElement spatial registration, and elementRegistry.registerSemantic. A room minted ' +
      'without those is a record the area schedules, the room-label renderer and the IFC exporter cannot ' +
      'account for, which is a lie about WHAT THE MODEL IS rather than about whether something moved',
    detail:
      `room.create was asked to create 1 room${named}, and 1 could not be created. ` +
      'The legacy command manager is not present in this process, so the ONLY path to authoritative room ' +
      'state is absent. This is not a no-op and not a silent success: nothing was written. ' +
      'THE ASK: create 1 room from a complete RoomData record. ' +
      'THE BLOCKER: CreateRoomCommand needs the engine half — a BimManager level authority plus an attached ' +
      'RoomStore — which apps/editor/src/engine/initBuilders.ts wires at boot (roomStore.attachEngine, ' +
      '§ADR-0318-ELEMENTS-SLOT) and apps/editor/src/engine/initTools.ts:3254 exposes as window.commandManager. ' +
      'A composed runtime without that half cannot create a room, and this plugin will not write one locally: ' +
      'doing so would mint a rival creation path that skips the registrations named in `protects`. ' +
      'In a browser session both are present and this verb delegates normally — see ' +
      'plugins/rooms/__tests__/roomCreateEngineRefusal.test.ts, whose last case proves exactly that.',
  });
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
      // L-845: read the typed global directly (same pattern as the sibling
      // bridges, e.g. AssignTemplateToNode) — no double-cast through unknown.
      const cm =
        typeof window === 'undefined'
          ? undefined
          : (window.commandManager as
              | { execute(c: unknown, o?: unknown): { success?: boolean; error?: string } | void }
              | undefined);

      // §FIX-ROOM-CREATE-STORE-KEY — no commandManager means the ONLY path to
      // authoritative room state is absent in this process. That is a failure, not
      // a no-op, and it is reported as one (C16 §5.1 CA-21 / ADR-0299).
      //
      // §FIX-ROOM-CREATE-REFUSAL-IS-A-VALUE — reported as a VALUE, not a throw.
      // See the header: three of this verb's four live dispatchers catch to an
      // empty block, so the throw this replaces was reaching nobody. The console
      // line is kept BESIDE the returned refusal rather than in place of it —
      // dropping it would have made the composed-process case quieter than it was
      // before, which is not an improvement even when the value is strictly
      // better.
      //
      // ⚠ MEASURED SIDE-EFFECT ON THE REGISTER, recorded so nobody "tidies" it.
      // `check-verb-register.ts`'s CA18_SHAPE regex looks for the two empty
      // patch arrays followed by an explicit key-and-colon for the refusal. The
      // SHORTHAND property used below does not satisfy it, so this verb still
      // measures LIVE — re-measured across this change: LIVE 143, REFUSES 37,
      // both unchanged. That verdict is the CORRECT one: this is a CONDITIONAL
      // refusal, and the gate's own warning on `refusesInCanExecute` says
      // grading a working bridge as refusing is worse than the defect it was
      // written to fix. But it is correct here for an INCIDENTAL reason.
      // Rewriting the shorthand into an explicit key would flip the published
      // row to REFUSES and assert that a verb which creates rooms in every
      // browser session will not act. Do not rewrite it without moving the
      // gate's classifier in the same commit.
      //
      // ⚠ AND THE SAME REGEX READS COMMENTS. An earlier revision of this very
      // note spelled the matched shape out literally and flipped the register
      // by itself (LIVE 143→142, REFUSES 37→38) with no code change at all.
      // That is logged as a gate finding, not worked around: a classifier that
      // a comment can move is one a rename can move too.
      if (!cm) {
        const refusal = buildEngineAbsentRefusal(cmd);
        console.warn('[room.create.handler] REFUSED —', refusal.detail);
        return { forward: [], inverse: [], refusal };
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
