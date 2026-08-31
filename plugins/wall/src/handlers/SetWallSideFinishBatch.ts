// SetWallSideFinishBatchHandler — §FEAT-WALL-SIDE-FINISH.
//
// Bus surface for the founder's "change / make all walls in room X finish wall
// Y" and "make all inner finishes walls in ground floor to X". Mirrors the
// §FEAT-WALL-COLOR-BATCH bridge one file over: the typed bus command is the
// public entry point (the RAC chat dispatches it; the property panel could too),
// and the bridge forwards to the legacy CommandManager, which owns the undo
// stack the batch command participates in as ONE entry.
//
// WHY THIS BRIDGES rather than `produceCommand`-ing: identical reason to the
// colour batch — the geometry store the fragment builders actually read is only
// reachable through the legacy command path. Writing the plugin's detached DTO
// store is the §FIX-MATERIAL-DEAD-DISPATCH disease: it persists nothing that
// renders, exports or saves.
//
// ═══ THIS HANDLER OWNS ONE THING THE COMMAND CANNOT ═══
//
// The ROOM-scoped ask is the only shape that asks a GEOMETRIC question — "the
// face LOOKING INTO room X". For a wall bounding one room that face is
// unambiguous. For a PARTITION between two rooms BOTH faces are interior, and
// which one faces the named room is `WallData.frontSide`/`backSide` — measured
// 2026-08-18 to have zero writers and zero readers repo-wide, so `undefined` at
// runtime rather than even 'unknown'.
//
// So when the resolver reports `roomScoped: true`, this handler reads the ROOM
// store (which it may; the pure ai-host layer may not) and builds the per-wall
// bounding-room count the command needs to refuse those walls BY NAME. The
// count is the LIVE signal `classifyFacades` already derives — inverting
// `RoomData.boundingWallIds` — not the dead classification.
//
// §NO-EMPTY-MEANS-UNKNOWN: a wall the room store cannot account for maps to
// `null`, which the command treats as a refusal, NOT as zero. A partition we
// could not recognise is not a partition we may guess about.
//
// Payload contract (symmetric with wall.updateColorBatch):
//   • `wallIds: 'all'`     — every wall in the project, ALL levels; or
//   • `wallIds: string[]`  — an explicit id list (a level/room scope arrives here
//                            already resolved to ids by ctx.resolveScope).
//   • `side`               — 'interior' | 'exterior', the SEMANTIC side.
//   • `finish`             — RESOLVED { materialId, materialColor, materialName };
//                            the finish-NAME table lives in the chat resolver.
//   • `roomScoped?`        — the ids came from a room; run the refusal above.
//
// Partial-failure policy (§CONTEXT-DATA-HONESTY) lives in the COMMAND: "Set the
// … finish on N of M walls — K skipped", all-refused = visible no-op, never a
// throw. The bridge re-broadcasts that report as a window CustomEvent so thin UI
// wrappers can show it without owning batch logic.

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { SetWallSideFinishBatchCommand } from '@pryzm/command-registry';

export interface SetWallSideFinishBatchPayload {
  /** 'all' = every wall in the project (all levels); or an explicit id list. */
  readonly wallIds: readonly string[] | 'all';
  /** The SEMANTIC side — the axis WallLayerFunction declares. Never a face.
   *  §RACSIDE144 — `'both'` applies two per-wall writes (exterior + interior)
   *  inside the ONE `SetWallSideFinishBatchCommand` instance the bridge below
   *  constructs, so it is still one undo entry (C16 §8.6). */
  readonly side: 'interior' | 'exterior' | 'both';
  readonly finish: {
    readonly materialId: string;
    readonly materialColor?: string;
    readonly materialName?: string;
  };
  /** The ids came from a ROOM scope — see the header. */
  readonly roomScoped?: boolean;
}

/** Detail shape of the `pryzm-wall-side-finish-batch-report` CustomEvent. */
export interface WallSideFinishBatchReport {
  readonly success: boolean;
  /** Human-readable lines: summary first, then grouped skip reasons. */
  readonly info: readonly string[];
  readonly affectedElementIds: readonly string[];
  /**
   * §FIX-REPORT-PAYLOAD-DISCARD (W2-B) — the bridge's OWN verdict, so the chat
   * layer never has to infer one from a boolean. `'indeterminate'` means THE
   * COMMAND NEVER RAN and nothing about the model is confirmed. Silence would be
   * indistinguishable from a clean run at every layer above.
   */
  readonly outcome?: 'applied' | 'refused' | 'indeterminate';
}

export const WALL_SIDE_FINISH_BATCH_REPORT_EVENT = 'pryzm-wall-side-finish-batch-report';

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * How many rooms bound each of `wallIds` — the LIVE interior/exterior signal.
 *
 * Built by inverting `RoomData.boundingWallIds`, which is exactly what
 * `classifyFacades` (`@pryzm/spatial-index/FacadeOrientationMath`) does to
 * compute `isExterior = count <= 1`. Read here rather than imported so this
 * handler stays a thin bridge with no L1 dependency of its own.
 *
 * Returns `null` for the WHOLE map when the room store is unreachable — which
 * the command treats as a refusal on every wall, not as "no partitions". A
 * question we could not ask is not a question answered "no".
 */
function boundingRoomCounts(wallIds: readonly string[]): ReadonlyMap<string, number | null> | null {
  const roomStore = (window as unknown as { roomStore?: { getAll?(): unknown[] } }).roomStore;
  const rooms = roomStore?.getAll?.();
  if (!Array.isArray(rooms)) return null;

  const counts = new Map<string, number>();
  for (const room of rooms as Array<{ boundingWallIds?: readonly string[] | null }>) {
    // §FIX-BOUNDING-WALLS-UNDETERMINED — a room whose bounding walls were never
    // recorded contributes NOTHING rather than zero. Absorbing it as `?? []`
    // would let an unread room mark a partition it bounds as a single-room wall,
    // i.e. re-introduce the guess this whole path exists to avoid.
    if (!Array.isArray(room?.boundingWallIds)) continue;
    for (const wid of room.boundingWallIds) {
      counts.set(wid, (counts.get(wid) ?? 0) + 1);
    }
  }

  const out = new Map<string, number | null>();
  for (const id of wallIds) out.set(id, counts.get(id) ?? 0);
  return out;
}

export const SetWallSideFinishBatchHandler: CommandHandler<
  SetWallSideFinishBatchPayload,
  Record<string, unknown>
> = {
  type: 'wall.setSideFinishBatch',
  affectedStores: [] as const,

  canExecute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: SetWallSideFinishBatchPayload,
  ): ValidationResult {
    if (cmd.wallIds !== 'all' && !Array.isArray(cmd.wallIds)) {
      return { valid: false, reason: "wallIds must be 'all' or an array of wall ids" };
    }
    if (cmd.side !== 'interior' && cmd.side !== 'exterior' && cmd.side !== 'both') {
      return { valid: false, reason: "side must be 'interior', 'exterior', or 'both'" };
    }
    if (!cmd.finish || typeof cmd.finish.materialId !== 'string' || cmd.finish.materialId.length === 0) {
      return { valid: false, reason: 'finish.materialId is required' };
    }
    if (cmd.finish.materialColor !== undefined && !HEX_COLOR_RE.test(cmd.finish.materialColor)) {
      return { valid: false, reason: "finish.materialColor must be a '#rrggbb' hex string" };
    }
    return { valid: true };
  },

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: SetWallSideFinishBatchPayload,
  ): HandlerResult {
    return withHandlerSpan(
      'wall.setSideFinishBatch.handler',
      { 'pryzm.command.type': 'wall.setSideFinishBatch' },
      () => {
        const cm = window.commandManager as
          | {
              execute(
                cmd: unknown,
                options?: unknown,
              ): { success: boolean; affectedElementIds: string[]; info?: string[] };
            }
          | undefined;

        const sayNothingRan = (why: string): void => {
          const report: WallSideFinishBatchReport = {
            success: false,
            info: [
              `'wall.setSideFinishBatch' did not run — ${why}. Nothing was changed, and ` +
              `nothing about the model is confirmed.`,
            ],
            affectedElementIds: [],
            outcome: 'indeterminate',
          };
          try {
            window.dispatchEvent(
              new CustomEvent(WALL_SIDE_FINISH_BATCH_REPORT_EVENT, { detail: report }),
            );
          } catch (emitErr) {
            console.error('[wall.setSideFinishBatch.handler] indeterminate report emit failed:', emitErr);
          }
        };

        // §FIX-BATCH-REFUSAL-DISCARDED (L-1141, C16 §5.1 CA-18, C84 §4F.3) —
        // propagated from `plugins/slab/src/handlers/UpdateSlabsSystemTypeBatch.ts`
        // :186-209.
        //
        // ⭐ THIS IS THE FOUNDER'S OWN VERB. L-996 fixed the half where the chat
        // did not SUBSCRIBE to the report below. This is the other half: every
        // path here ended in the same `{forward:[],inverse:[]}`, so a caller that
        // is not ZeroTokenChatBridge — BatchCoordinator, a plan step, a script —
        // still could not tell "17 walls refinished" from "the command refused
        // all 17". A truthful transcript layered over a lying verb is what let
        // L-995 survive a week; this closes the verb itself.
        if (!cm) {
          sayNothingRan('the command manager is not available in this session');
          throw new Error(
            'wall.setSideFinishBatch: the command manager is not available in this session',
          );
        }

        // Set INSIDE the try, thrown AFTER it: throwing in place would be caught
        // by this block's own `catch` and re-labelled "the bridge threw", which
        // would attribute the command's refusal to a transport failure.
        let refusal: string | null = null;
        try {
          // ── The room-scope refusal input. Only built for a room scope, and
          //    only when the side asked for is the shared one. See the header.
          let roomCounts: ReadonlyMap<string, number | null> | undefined;
          if (cmd.roomScoped === true) {
            const ids = cmd.wallIds === 'all' ? [] : [...cmd.wallIds];
            const built = boundingRoomCounts(ids);
            // Unreachable room store ⇒ every wall maps to `null` ⇒ the command
            // refuses each by name. NOT silently treated as "no partitions".
            roomCounts = built ?? new Map(ids.map((id) => [id, null] as const));
          }

          const result = cm.execute(
            new SetWallSideFinishBatchCommand({
              wallIds: cmd.wallIds === 'all' ? 'all' : [...cmd.wallIds],
              side: cmd.side,
              finish: {
                materialId: cmd.finish.materialId,
                ...(cmd.finish.materialColor !== undefined ? { materialColor: cmd.finish.materialColor } : {}),
                ...(cmd.finish.materialName !== undefined ? { materialName: cmd.finish.materialName } : {}),
              },
              ...(roomCounts !== undefined ? { roomBoundCounts: roomCounts } : {}),
            }),
          );

          // §BATCH-UNREADABLE-RESULT-IS-NOT-ZERO (C78 §20 · U-INV-4) —
          // `window.commandManager` is a foreign global, so an unreadable return
          // is reachable, and the command may well have MUTATED the model on the
          // way to returning junk. "I could not read the result" is not
          // "nothing happened", and must not wear the same payload.
          const readable = !!result && Array.isArray(result.affectedElementIds);
          const report: WallSideFinishBatchReport = readable
            ? {
                success: result.success ?? false,
                info: result.info ?? [],
                affectedElementIds: result.affectedElementIds,
              }
            : {
                success: false,
                info: [
                  `'wall.setSideFinishBatch' RAN but the command manager returned no readable ` +
                  `result. WHICH walls changed is not known — this is NOT a report that none did.`,
                ],
                affectedElementIds: [],
                outcome: 'indeterminate',
              };
          window.dispatchEvent(
            new CustomEvent(WALL_SIDE_FINISH_BATCH_REPORT_EVENT, { detail: report }),
          );
          // CA-18. Quote the command's OWN sentence — this bridge never invents
          // refusal copy, and never guesses one when `info` is empty.
          if (!report.success) {
            refusal = report.info[0] ?? 'the wall finish change was refused, and no reason was given';
          }
        } catch (e) {
          console.error('[wall.setSideFinishBatch.handler] bridge failed:', e);
          sayNothingRan(`the bridge threw: ${String((e as Error)?.message ?? e)}`);
          refusal = `the bridge threw: ${String((e as Error)?.message ?? e)}`;
        }
        if (refusal !== null) {
          // Nothing was mutated on any of these paths, so throwing loses no work
          // — it only stops success and refusal being the same observable at the
          // dispatch site.
          throw new Error(`wall.setSideFinishBatch: ${refusal}`);
        }

        const empty: HandlerResult = { forward: [], inverse: [] };
        return empty;
      },
    ); // withHandlerSpan — C10 §2
  },
};
