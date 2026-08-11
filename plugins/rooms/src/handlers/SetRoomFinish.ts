// SetRoomFinishHandler — `room.setFinish` (VERBS-CMD, 2026-08-11).
//
// ─── WHY THIS VERB EXISTS ────────────────────────────────────────────────────
//
// `docs/04-reference/RAC-CONFORMANCE-SCORECARD-CATEGORIES-6-10.md` §155 records
// a defect that is the MIRROR IMAGE of the W3-3 dead verbs:
//
//   "Room finishes are fully modelled and fully persisted (RoomFinishesSchema,
//    RoomDataSchema.ts:83-89 — materialId, materialName, materialColor,
//    finishCode, nbs, csiDivision; round-tripped at roomSnapshotUtils.ts:95/190)
//    — and there is no command-bus route to set any of them."
//
// A dead verb reports success and writes nothing.  This was a READER WITH NO
// WRITE: `finishes` survives save/load/export perfectly and nothing in the
// product could ever put a value into it.  "Set the floor finish of this room
// to oak" scored FAIL across every column of the scorecard not because the
// answer was wrong but because there was no route at all.
//
// ─── WHY A LEGACY BRIDGE AND NOT AN IMMER `produceCommand` ───────────────────
//
// Because the bridge is where the AUTHORITATIVE room lives.  §FIX-DEAD-VERB-*
// (W3-3, commit 5e74b178) established the measured fact that production
// `bootstrap.ts` hands the bus the FRESH plugin DTO stores from PluginRegistry
// while the renderers, the 2-D projector, the IFC exporter and persistence all
// read the LEGACY singletons — so a `produceCommand<RoomsState>` here would
// compile, pass a test, report success, and change nothing anybody can see.
// That is the single worst outcome available to this file.
//
// The live route is the one `room.setMaterial`'s COLOUR path already uses and
// which W3-3 kept as its positive control:
//
//     window.commandManager → UpdateRoomCommand → RoomStore.update()
//
// `UpdateRoomCommand` takes `Partial<RoomData>`, and `finishes` is a first-class
// `RoomData` field admitted by `RoomDataUpdateSchema` (RoomDataSchema.ts:204).
// So no schema change, no migration, and no new persistence surface is needed —
// this verb is pure wiring to a write path that already existed and had no door.
// `affectedStores` is `[]`: the legacy commandManager owns the undo step, and
// `UpdateRoomCommand.undo()` restores a FULL pre-edit snapshot.
//
// ⚠ This handler deliberately declares NO plugin store.  Declaring
// `affectedStores: ['room']` here would be the L-79 defect (bus storeKey is
// `'rooms'`) AND would arm a patch pair against a store this verb never wrote —
// the exact undo hazard named in the W3-3 residual note.
//
// ─── THE ONE REAL SUBTLETY: `finishes` IS A SINGLE TOP-LEVEL FIELD ───────────
//
// `RoomStore.update()` merges at the TOP LEVEL only (`{...existing, ...updates}`
// behind a Zod gate).  `finishes` is ONE field holding floor / ceiling / walls /
// skirtingHeight / coveHeight.  So the naive implementation —
//
//     new UpdateRoomCommand(roomId, { finishes: { floor: spec } })
//
// — SILENTLY DESTROYS the ceiling and wall finishes and both height values.  It
// would pass every "did the floor finish change?" test ever written, which is
// precisely the class of passing-proof-of-the-wrong-thing W3-3 had to unpick.
// This handler therefore READ-MERGES: it reads the room's current `finishes`
// off the authoritative `window.roomStore`, overlays only the requested
// surface, and writes the whole bag back.  `set-room-finish.test.ts`
// ("setting one surface does NOT wipe the other surfaces") is what keeps that
// merge from being refactored away.
//
// P8 — `withHandlerSpan` wraps the hot path (C10 §2).
// C16 — semantic-first: the payload names a SURFACE ('floor'), never a store key.

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { UpdateRoomCommand } from '@pryzm/command-registry';

/**
 * The three finishable surfaces of a room, mirroring `RoomFinishes`
 * (`packages/room-topology/src/RoomTypes.ts:130-136`).
 *
 * `@pryzm/room-topology` is deliberately NOT imported: it is not a dependency
 * of `plugins/rooms`, and adding one desynchronises `pnpm-lock.yaml` and breaks
 * `--frozen-lockfile` for every other agent sharing this worktree. The shape is
 * mirrored structurally and the source is cited — the same accommodation
 * `SetRoomMaterial.ts` makes for `MaterialDispatch`'s refusal table.
 */
export const ROOM_FINISH_SURFACES = ['floor', 'ceiling', 'walls'] as const;
export type RoomFinishSurface = (typeof ROOM_FINISH_SURFACES)[number];

/** Mirrors `RoomFinishSpec` — `materialName` + `materialColor` are REQUIRED by
 *  `RoomFinishSpecSchema` (RoomDataSchema.ts:73-81); everything else optional. */
export interface RoomFinishSpecInput {
  readonly materialId?: string;
  readonly materialName: string;
  readonly materialColor: string;
  /** Project finish code, e.g. "FL-03". */
  readonly finishCode?: string;
  /** NBS clause reference, e.g. "M42/110". */
  readonly nbs?: string;
  /** CSI MasterFormat division, e.g. "09 64 00". */
  readonly csiDivision?: string;
  readonly notes?: string;
}

export interface SetRoomFinishPayload {
  readonly roomId: string;
  /** Which surface the `finish` applies to. Required whenever `finish` is given. */
  readonly surface?: RoomFinishSurface;
  /** The finish specification to apply to `surface`. */
  readonly finish?: RoomFinishSpecInput;
  /** Skirting height in metres (≥ 0). Independent of `surface`. */
  readonly skirtingHeight?: number;
  /** Cove height in metres (≥ 0). Independent of `surface`. */
  readonly coveHeight?: number;
}

/** The subset of the authoritative room record this verb reads. */
interface LegacyRoomLike {
  readonly finishes?: {
    floor?: unknown;
    ceiling?: unknown;
    walls?: unknown;
    skirtingHeight?: number;
    coveHeight?: number;
  };
}

interface LegacyWindow {
  __pryzmInitComplete?: boolean;
  commandManager?: {
    execute(cmd: unknown, options?: unknown): { success?: boolean; error?: string; info?: string[] } | void;
  };
  roomStore?: { getById(id: string): LegacyRoomLike | undefined };
}

/**
 * The legacy singletons hang off `window`, not off the bare global. In a browser
 * `globalThis === window` so `globalThis.window` resolves either way; under
 * Node/vitest it is the property the suite installs. Reading the bare
 * `globalThis` instead silently found `undefined` for every field and made the
 * handler refuse with "engine is not initialised" in a fully-initialised session.
 */
function legacyWindow(): LegacyWindow {
  return ((globalThis as unknown as { window?: LegacyWindow }).window ?? {}) as LegacyWindow;
}

function isSurface(v: unknown): v is RoomFinishSurface {
  return typeof v === 'string' && (ROOM_FINISH_SURFACES as readonly string[]).includes(v);
}

export class SetRoomFinishHandler
  implements CommandHandler<SetRoomFinishPayload, Record<string, unknown>>
{
  readonly type = 'room.setFinish';
  // Bridges to the legacy command manager — mutates NO plugin store. See header.
  readonly affectedStores = [] as const;

  canExecute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: SetRoomFinishPayload,
  ): ValidationResult {
    if (typeof cmd?.roomId !== 'string' || cmd.roomId.length === 0) {
      return { valid: false, reason: 'roomId must be a non-empty string' };
    }

    const wantsSurface = cmd.surface !== undefined || cmd.finish !== undefined;
    const wantsHeights = cmd.skirtingHeight !== undefined || cmd.coveHeight !== undefined;

    // §CONTEXT-DATA-HONESTY — a payload that asks for nothing must REFUSE, not
    // resolve. "Applied, nothing to change" and "you gave me nothing" are not
    // the same value, and only the refusal can be reported to the user.
    if (!wantsSurface && !wantsHeights) {
      return {
        valid: false,
        reason:
          'Nothing to set: provide a `surface` + `finish`, and/or `skirtingHeight` / `coveHeight`.',
      };
    }

    if (wantsSurface) {
      if (!isSurface(cmd.surface)) {
        return {
          valid: false,
          reason: `surface must be one of ${ROOM_FINISH_SURFACES.join(' / ')}`,
        };
      }
      if (cmd.finish === undefined || typeof cmd.finish !== 'object') {
        return { valid: false, reason: `a \`finish\` specification is required for surface '${cmd.surface}'` };
      }
      // Enforced here rather than left to the Zod gate so the refusal carries a
      // sentence a user can act on instead of a schema dump — and so nothing is
      // written before the failure (brief rule 5: refuse rather than half-do).
      if (typeof cmd.finish.materialName !== 'string' || cmd.finish.materialName.length === 0) {
        return { valid: false, reason: 'finish.materialName is required (a non-empty name for the material)' };
      }
      if (typeof cmd.finish.materialColor !== 'string' || cmd.finish.materialColor.length === 0) {
        return { valid: false, reason: 'finish.materialColor is required (e.g. "#b98b4f")' };
      }
    }

    for (const [key, value] of [
      ['skirtingHeight', cmd.skirtingHeight],
      ['coveHeight', cmd.coveHeight],
    ] as const) {
      if (value === undefined) continue;
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        return { valid: false, reason: `${key} must be a finite number ≥ 0 (metres)` };
      }
    }

    return { valid: true };
  }

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: SetRoomFinishPayload,
  ): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
      const w = legacyWindow();

      // §FIX-DEAD-VERB-ROOM-BRIDGE (W3-3) — every failure below THROWS. An
      // empty patch pair is indistinguishable from "applied, nothing to
      // change", so returning one here would report success for a finish that
      // was never written (C03 §4.6 U-4).
      if (!w.__pryzmInitComplete) {
        throw new Error(
          'room.setFinish: the engine is not initialised yet, so nothing was changed. '
          + 'Wait for the project to finish loading and try again.',
        );
      }

      const cm = w.commandManager;
      if (!cm) {
        throw new Error(
          'room.setFinish: the legacy command manager is not available, so the finish could not be applied.',
        );
      }

      const store = w.roomStore;
      if (!store) {
        throw new Error(
          'room.setFinish: the room store is not available, so the finish could not be applied.',
        );
      }

      const room = store.getById(cmd.roomId);
      if (!room) {
        // Named refusal — NOT a silent no-op. The chat surfaces this verbatim.
        throw new Error(`room.setFinish: room not found: ${cmd.roomId}`);
      }

      // ── THE READ-MERGE (see header) ────────────────────────────────────────
      // `finishes` is ONE top-level RoomData field and RoomStore.update merges
      // only at the top level, so the existing bag MUST be carried forward or
      // the untouched surfaces are destroyed.
      const existing = room.finishes ?? {};
      const merged: Record<string, unknown> = { ...existing };

      if (cmd.surface !== undefined && cmd.finish !== undefined) {
        // Spread onto a fresh object so no caller-owned reference is retained
        // in the store, and drop explicit `undefined`s that would otherwise
        // trip the Zod optional-vs-present distinction.
        const spec: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(cmd.finish)) {
          if (v !== undefined) spec[k] = v;
        }
        merged[cmd.surface] = spec;
      }
      if (cmd.skirtingHeight !== undefined) merged.skirtingHeight = cmd.skirtingHeight;
      if (cmd.coveHeight !== undefined) merged.coveHeight = cmd.coveHeight;

      let result: { success?: boolean; error?: string; info?: string[] } | void;
      try {
        result = cm.execute(new UpdateRoomCommand(cmd.roomId, { finishes: merged } as never));
      } catch (e) {
        // Re-thrown, never logged-and-swallowed: the caller must learn the
        // finish did not happen (W3-3).
        console.error('[room.setFinish.handler] bridge failed:', e);
        throw e instanceof Error ? e : new Error(String(e));
      }

      // CommandManagerImpl returns a CommandResult; a refusal arrives as
      // `{ success: false, error }` rather than a throw. Swallowing that into a
      // resolved bus command is the same lie one layer up.
      if (result && result.success === false) {
        throw new Error(
          `room.setFinish: ${result.error ?? result.info?.[0] ?? 'the room could not be updated'}`,
        );
      }

      return { forward: [], inverse: [] };
    }); // withHandlerSpan — C10 §2 / P8
  }
}
