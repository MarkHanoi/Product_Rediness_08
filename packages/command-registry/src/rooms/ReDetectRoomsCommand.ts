// §SWALLOW-SIDE-INDEX — why the `catch { /* … */ }` blocks below are empty.
//
// Every one of them wraps a write to a SIDE INDEX (elementRegistry,
// bimManager, semanticGraphManager, roomSpatialIndex) that is derived from the
// element stores, never authoritative over them. The store mutation — the
// command's actual contract — has already committed and is NOT inside the try.
// A side index that rejects an unregister for an id it never held, or a
// register for an id it already holds, is reporting a no-op, not a failure:
// re-deriving the index from the stores would produce the same result either
// way. Re-throwing here would abort a command whose real work succeeded and
// leave the undo stack describing a mutation that was rolled back only halfway.
//
// This is NOT a §CONTEXT-DATA-HONESTY breach: nothing downstream reads a
// success/failure value from these calls, so there is no refusal being
// disguised as a result. If a side index ever becomes load-bearing for a
// query, these blocks must become reported failures.

/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Command
 * Phase:             Phase 3
 * Files Modified:    src/commands/rooms/ReDetectRoomsCommand.ts
 * Classification:    A
 *
 * Contract: docs/01_ELEMENTS/09_Rooms_Contract/03-ROOM-COMMAND-PIPELINE-CONTRACT.md
 * Re-detects rooms for a specific level after wall changes.
 * Fired by RoomTopologyObserver after debounce.
 * Preserves semantic data from existing rooms via centroid matching (§R-9).
 * Non-undoable — automatic background operation.
 *
 * Room numbering: [LevelIdx]-[Sequence] e.g. "00-001".
 *   Level index is 0-based (sorted by elevation).
 *   Sequence is 1-based within the level.
 *   Duplicate or non-matching room numbers are normalised to this format.
 */

import {
  Command, CommandType, CommandValidationResult, CommandResult,
  SerializedCommand, CommandContext,
} from '../types';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { RoomDetectionEngine, polygonAABB } from '@pryzm/room-topology';
import type { RoomData } from '@pryzm/room-topology';
import { semanticGraphManager } from '@pryzm/core-app-model';
import { roomSpatialIndex } from '@pryzm/core-app-model';
import { assignUniqueRoomNumbers, resolveRoomLevelPrefix } from './RoomNumbering';
// §ROOM-LOSS-CENSUS (L-10812) — C94 §TOBE.6 RM-0. See the drop loop below.
import {
  classifyRoomLoss, formatRoomLossLine, roomCensusSuppressed,
  type RoomLossRecord,
} from './roomLossCensus';
// §ROOM-TOMBSTONE (L-10814) — C94 §TOBE.6 RM-3, the founder's DERIVATION + TOMBSTONE
// ruling. Capture the MEANING of an authored room as it dies; offer it back when the
// region comes home. ⛔ Offer only — nothing here applies anything.
import {
  captureRoomTombstone, findTombstonesFor, consumeTombstone, roomMeaningNotifier,
  roomLossNotifier, type RoomTombstone,
} from './roomTombstoneRegister';

// ── Command ───────────────────────────────────────────────────────────────────

export class ReDetectRoomsCommand implements Command {
    readonly affectedStores = ["room"] as const;
  id = crypto.randomUUID();
  type = CommandType.REDETECT_ROOMS;
  timestamp = Date.now();
  targetIds: string[] = [];

  /**
   * Room re-detection is a derived/background operation — a side-effect of wall
   * changes, not a direct user action.  Setting nonUndoable = true tells
   * CommandManager to execute the command (with rollback protection) but skip
   * pushing it onto the undo history stack.  This prevents phantom undo entries
   * that would force the user to press Ctrl+Z multiple times to undo a single
   * wall operation.  The undo() method remains a no-op for consistency.
   */
  readonly nonUndoable = true;

  private createdIds: string[] = [];

  constructor(
    private readonly levelId: string,
    private readonly levelElevation: number = 0,
    private readonly levelHeight: number = 3.0,
  ) {}

  canExecute(ctx: CommandContext): CommandValidationResult {
    const roomStore = ctx.stores.roomStore;
    if (!roomStore) return { ok: false, reason: 'RoomStore not available' };
    return { ok: true };
  }

  execute(ctx: CommandContext): CommandResult {
    const roomStore = ctx.stores.roomStore;
    if (!roomStore) return { success: false, affectedElementIds: [], error: 'RoomStore not available' };

    try {
      const engine = new RoomDetectionEngine(
        ctx.stores.wallStore,
        // §CW90 item 9 — the interactive path (initTools.ts:2909) always passed
        // the curtain-wall store; the command path silently never did, so a
        // redetect saw a HOLE where the glazing stands even with the
        // room-bounding toggle ON. Same engine, same inputs, both paths.
        ctx.stores.curtainWallStore,
      );
      const detected = engine.detectRoomsForLevel(this.levelId, this.levelElevation, this.levelHeight);
      const existing = roomStore.getByLevel(this.levelId);
      const merged   = engine.mergeWithExisting(detected, existing);

      // Assign sequential room numbers and names to newly detected rooms
      const levelPrefix  = resolveRoomLevelPrefix(this.levelId, ctx);
      const withNumbers  = assignUniqueRoomNumbers(merged, levelPrefix);

      // PERF-FIX (Apr 2026): Diff-based churn. mergeWithExisting() preserves
      // room IDs for matched rooms, so the previous "remove all + re-add all"
      // pattern was performing dozens of redundant unregister/register cycles
      // on every wall edit (each one logs to console, fires events, and
      // touches the SemanticGraph + SpatialIndex). We now only mutate the
      // rooms that actually changed.
      const newIds = new Set(withNumbers.map(r => r.id));
      const existingIds = new Set(existing.map(r => r.id));

      // 1. Drop rooms that no longer exist in the new detection set.
      //
      // ⭐⭐ §ROOM-LOSS-CENSUS (L-10812) — C94 §TOBE.6 RM-0. THIS LOOP IS WHERE A ROOM
      // DIES. `roomStore.remove` takes NO snapshot, `undo()` below is a no-op and this
      // command is `nonUndoable`, so every authored field on this record — name, number,
      // occupancy, department, finishes, ifcData, revitId, phase — is destroyed here and
      // is not recoverable by any undo (C94 §TOBE.1.2, measured).
      //
      // Until now that happened with NO record of any kind, so nobody could say how often
      // it happens or to what. C94 §TOBE.10 item 6: *"the frequency of room loss in real
      // use is unknowable until RM-0 ships"* — and all three open rulings in C94 §TOBE.8
      // rest on one console excerpt from one session.
      //
      // ⛔ IT ADDS NO PASS. The classification rides INSIDE the loop that already runs
      // (C94 §TOBE.7.2 rule 1), is O(dropped) — normally zero — and emits ONE line for
      // the whole set rather than one per room, because `ProjectLoader.ts:2807` already
      // records per-element console churn as a real main-thread cost.
      const lost: RoomLossRecord[] = [];
      /** §ROOM-LOSS-NOTICE (L-12660) — every tombstone actually captured this pass, so
       *  the ones that find NO immediate match (below) can be announced unconditionally.
       *  See the notifier's own header for why this cannot simply reuse `roomMeaningNotifier`. */
      const capturedTombstones: RoomTombstone[] = [];
      for (const r of existing) {
        if (newIds.has(r.id)) continue;          // preserved — leave registrations in place
        lost.push(classifyRoomLoss(r));
        // §ROOM-TOMBSTONE — durable LOSS, not a durable room. Returns undefined (and
        // keeps nothing) when the room carried no authored meaning, which is the common
        // case; the register is bounded by authored rooms lost per level per session.
        const tombstone = captureRoomTombstone(r);
        if (tombstone) capturedTombstones.push(tombstone);
        try { roomStore.remove(r.id); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
        try { ctx.bimManager.unregisterElement(r.id); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
        try { elementRegistry.unregister(r.id); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
        try { semanticGraphManager.removeAllRelationshipsForElement(r.id); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
        try { roomSpatialIndex.remove(r.id); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
      }

      // §ROOM-LOSS-CENSUS — report the whole drop set once, AFTER the loop.
      //
      // ⚠ SUPPRESSED, NOT DISABLED, during a project restore or a building generation
      // (§LOAD-REDETECT-FREEZE / §GEN-LOG-GATING): those paths legitimately drop and
      // re-add rooms wholesale, and counting that as user-visible loss would make the
      // number useless for the ruling it exists to inform.
      //
      // `console.warn`, not `debug`: a room the user may have named, scheduled and put on
      // a sheet has just been destroyed unrecoverably. That is not debug-level, and the
      // line beside it — `[BimManager] Unregistered element …` — never said what was lost.
      const censusLine = lost.length > 0 ? formatRoomLossLine(this.levelId, lost) : undefined;
      if (censusLine && !roomCensusSuppressed()) console.warn(censusLine);

      // 2. Add or update rooms.
      // ROBUSTNESS-FIX (Apr 2026): Per-room try/catch.  Previously a single
      // schema-validation failure (e.g. self-intersecting boundary polygon
      // produced by an unusual wall topology) would throw out of this loop
      // into the outer catch, aborting the whole batch and leaving the user
      // with NO rooms even though the other 8/9 polygons were valid.  Now we
      // log and skip the bad room so the rest of the batch still appears.
      this.createdIds = [];
      const skipped: Array<{ id: string; reason: string }> = [];
      /** Fresh, unmatched rooms — candidates for a §ROOM-TOMBSTONE offer (below). */
      const offers: RoomData[] = [];
      for (const room of withNumbers) {
        try {
          const isNew = !existingIds.has(room.id);
          if (isNew) {
            roomStore.add(room);
            try { ctx.bimManager.registerElement(room.id, room.levelId); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
            try { elementRegistry.registerSemantic(room.id, 'room'); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
            // §ROOM-TOMBSTONE — a room that is NEW here got no identity from
            // `mergeWithExisting`, i.e. it is a fresh crypto.randomUUID() with an
            // auto-minted name. If an authored room died where this one now stands, its
            // meaning is offerable. ⛔ PUBLISHED AS A QUESTION, never applied: the
            // founder's ruling is ASK, never auto-edit.
            offers.push(room);
          } else {
            // Preserved room: data may have changed (boundingWalls, area,
            // centroid). Update the store entry but leave registry/bimManager
            // alone — IDs and types are unchanged.
            roomStore.update(room.id, room);
            // Stale graph relationships need clearing because boundingWallIds
            // may have changed; they're rebuilt below.
            semanticGraphManager.removeAllRelationshipsForElement(room.id);
            roomSpatialIndex.remove(room.id);
          }
          this.createdIds.push(room.id);
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          skipped.push({ id: room.id, reason });
          console.warn(
            `[ReDetectRoomsCommand] Skipping room ${room.id} due to validation/store failure: ${reason}`,
          );
          continue;
        }

        // Phase D — D-1: SemanticGraph — room boundedBy each bounding wall.
        try {
          for (const wallId of room.boundingWallIds ?? []) {
            semanticGraphManager.addRelationship({
              type: 'boundedBy', sourceId: room.id, targetId: wallId, createdBy: 'system',
            });
          }
        } catch (err) {
          console.warn('[ReDetectRoomsCommand] SemanticGraph boundedBy write failed:', err);
        }

        // Phase D — D-5: SpatialIndex — insert the room's TRUE bounding box (GE-11, C73 §1/§3).
        // ONE canonical AABB convention feeds roomSpatialIndex: the polygon's own extent
        // (`computed.boundingBox`, which RoomStore recomputes from boundary.polygon on every
        // add/update). The old centroid ± sqrt(area/PI) circle box preserved AREA, not
        // EXTENT — exact only for a square, it understates every other footprint in at
        // least one axis; and because re-detection runs after every wall edit, this site
        // silently re-poisoned the whole index, making RoomStore.getRoomsContainingPoint
        // return false negatives for interior points of concave rooms.
        try {
          const boundingBox = room.computed?.boundingBox
            ?? (room.boundary?.polygon?.length ? polygonAABB(room.boundary.polygon) : undefined);
          if (boundingBox) {
            roomSpatialIndex.insert(room.id, {
              minX: boundingBox.minX,
              minZ: boundingBox.minZ,
              maxX: boundingBox.maxX,
              maxZ: boundingBox.maxZ,
            });
          }
        } catch (err) {
          console.warn('[ReDetectRoomsCommand] SpatialIndex insert failed:', err);
        }
      }

      // §ROOM-TOMBSTONE — publish AFTER every room is in the store, so a subscriber that
      // reads the store sees the finished level rather than a half-built one. Matching is
      // O(new rooms x tombstones on this level), and BOTH factors are normally zero.
      /** §ROOM-LOSS-NOTICE — `seq`s consumed as an IMMEDIATE match in THIS pass, so the
       *  loss-notice below announces only the tombstones nothing already offered for. */
      const consumedNow = new Set<number>();
      for (const room of offers) {
        const candidates = findTombstonesFor(room);
        if (candidates.length === 0) continue;
        // ⭐ §MERGE-AWARDS-NOBODY (L-10815) — TWO OR MORE candidates means two authored
        // rooms merged here and the engine awarded the merged face to nobody. The user
        // is offered the choice; ALL of them are consumed either way, because the
        // question has been put once and re-asking on the next wall nudge is the
        // nagging that gets a channel muted.
        for (const t of candidates) { consumeTombstone(t); consumedNow.add(t.seq); }
        roomMeaningNotifier.publish({ levelId: this.levelId, roomId: room.id, candidates });
      }

      // ⭐⭐ §ROOM-LOSS-NOTICE (L-12660) — TELL THE USER NOW, unconditionally.
      //
      // `roomMeaningNotifier` above only speaks when a face reclaims the space on SOME
      // later pass. The founder's own measured session never reached that: the boundary
      // loop stayed broken (§DIAG-ROOM-LOOP BREAK, unresolvedLoopBreaks=2, a 282mm gap
      // against the 200mm hostSnap floor), so no face was ever detected there and no
      // offer could ever fire. The only trace was a console line he happened to read.
      // That is the exact §CONTEXT-DATA-HONESTY failure this codebase has rules against:
      // a destruction of the user's own classification work, invisible on screen.
      //
      // Every tombstone captured this pass that was NOT immediately claimed by a
      // reclaiming face (`consumedNow`) is announced here, once, regardless of whether
      // the gap ever closes. It does not race the offer above: a tombstone announced
      // here and matched on a LATER pass still fires `roomMeaningNotifier` as normal,
      // because it was never consumed — this only covers the pass where nothing claimed
      // it, which is the founder's case and the common one for a real repair failure.
      //
      // Suppressed on the same two gates as the census (§LOAD-REDETECT-FREEZE /
      // §GEN-LOG-GATING) — a restore or generation legitimately drops and re-adds rooms
      // wholesale, and announcing that as user loss would be noise, not honesty.
      if (!roomCensusSuppressed()) {
        const stillPending = capturedTombstones.filter(t => !consumedNow.has(t.seq));
        if (stillPending.length > 0) {
          roomLossNotifier.publish({ levelId: this.levelId, tombstones: stillPending });
        }
      }

      // Phase D — D-1: SemanticGraph — adjacentTo and connectedTo after all rooms are created.
      try {
        const wallStore = ctx.stores.wallStore;
        const created = withNumbers;

        // Build a set of wall IDs that carry at least one door opening (for connectedTo).
        const doorWallIds = new Set<string>();
        for (const room of created) {
          for (const wallId of room.boundingWallIds ?? []) {
            const wall = wallStore.getById(wallId);
            if (wall?.openings?.some((o: any) => o.type === 'door')) {
              doorWallIds.add(wallId);
            }
          }
        }

        // Compare all room pairs to find shared walls.
        for (let i = 0; i < created.length; i++) {
          const wallsA = new Set(created[i].boundingWallIds ?? []);
          for (let j = i + 1; j < created.length; j++) {
            const shared = (created[j].boundingWallIds ?? []).filter(w => wallsA.has(w));
            if (shared.length === 0) continue;

            const hasDoor = shared.some(w => doorWallIds.has(w));

            // adjacentTo — both directions (bidirectional)
            semanticGraphManager.addRelationship({
              type: 'adjacentTo', sourceId: created[i].id, targetId: created[j].id, createdBy: 'system',
            });
            semanticGraphManager.addRelationship({
              type: 'adjacentTo', sourceId: created[j].id, targetId: created[i].id, createdBy: 'system',
            });

            // connectedTo — both directions when a shared wall has a door
            if (hasDoor) {
              semanticGraphManager.addRelationship({
                type: 'connectedTo', sourceId: created[i].id, targetId: created[j].id, createdBy: 'system',
              });
              semanticGraphManager.addRelationship({
                type: 'connectedTo', sourceId: created[j].id, targetId: created[i].id, createdBy: 'system',
              });
            }
          }
        }

        // §GR13-ADJACENCY-READER (C71 §3.4) — the pairwise scan COMPLETED, so
        // every room it compared now has a definitive adjacency answer,
        // including the ones it wrote no edge for. Inside the try and after the
        // loop on purpose: the catch below logs and continues, so a scan that
        // threw part-way must leave the level UNCOVERED and refusing rather
        // than let `getAdjacentRooms` report "touches nothing" for rooms it
        // never reached.
        semanticGraphManager.markAdjacencyCoverage(created.map(r => r.id));
      } catch (err) {
        console.warn('[ReDetectRoomsCommand] SemanticGraph adjacency write failed:', err);
      }

      this.targetIds = [...this.createdIds];
      console.debug(`[ReDetectRoomsCommand] Level '${this.levelId}' (prefix ${levelPrefix}): ${this.createdIds.length} room(s) detected`);
      // §ROOM-LOSS-CENSUS — the census also rides out on the RESULT, not only the
      // console, so a caller (or a future aggregator) can read it without scraping text.
      // Carried even when the console line was suppressed: suppression is about log
      // volume, never about withholding the fact from a reader that asked for it.
      return {
        success: true,
        affectedElementIds: [...this.createdIds],
        ...(censusLine ? { info: [censusLine] } : {}),
      };
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[ReDetectRoomsCommand] Error:', msg, err);
      return { success: false, affectedElementIds: [], error: msg };
    }
  }

  /**
   * Undo is a no-op for automatic re-detection.
   * Manual room edits use their own commands which are undoable.
   */
  undo(_ctx: CommandContext): CommandResult {
    return { success: true, affectedElementIds: [] };
  }

  serialize(): SerializedCommand {
    return {
      type: this.type,
      payload: { levelId: this.levelId, levelElevation: this.levelElevation, levelHeight: this.levelHeight },
      targetIds: this.targetIds,
      timestamp: this.timestamp,
      version: 1,
    };
  }
}
