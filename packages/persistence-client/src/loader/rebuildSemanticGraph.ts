// @pryzm/persistence-client — SemanticGraph rebuild-from-snapshot (GR-06 / GR-08).
//
// SINGLE owner of the pre-graph rebuild. Both `ProjectLoader`s
// (`packages/persistence-client/src/loader/ProjectLoader.ts` and
// `apps/editor/src/engine/persistence/ProjectLoader.ts`) call THIS function —
// there is no second copy. The two byte-identical copies C71 §5.3 / §7.j names
// as a divergence hazard are gone; widening the rebuild now happens in one place.
//
// ── The rebuild rule (C71 §1.2 semantic 4, C70 I-INV-3) ──────────────────────
// This runs only when the deserialized graph is EMPTY (a "pre-graph" snapshot,
// or one saved before Phase D). It reconstructs edges FROM AUTHORITATIVE ELEMENT
// STATE that survives the snapshot — never by trusting a persisted graph slice.
// Every edge below is COMPUTED from a field the element authoritatively carries
// (`levelId`, a beam's support refs, a stair's base/top level, a shared door
// wall). It never GUESSES an edge the authoritative state does not support —
// that would be the provenance-invented-on-load defect one layer over.
//
// Families that CANNOT be reconstructed from this snapshot's authoritative state
// are returned by name in `unreconstructable` so the load can REPORT the loss
// rather than drop it silently (C70 I-INV-3). They are NOT fabricated.
//
// `joinedTo` (wall ↔ wall, ADR-0321 / C71 §3.6) is DELIBERATELY not rebuilt
// here: its disposition is REGENERATED from the retained junction index — the
// wall flush (`WallRebuildCoordinator`) removes-and-re-emits the level's edges
// on every rebuild, so a snapshot-side reconstruction would only be overwritten.
// It is therefore NOT a loss and is not named below.

import { semanticGraphManager } from '@pryzm/core-app-model';
import type { RelationshipType } from '@pryzm/core-app-model';

/**
 * Structural view of the fields the rebuild reads. Both `ProjectSnapshot`
 * definitions (persistence-client's and apps/editor's) are assignable to this
 * — the index signature keeps the function decoupled from either concrete type,
 * so it cannot silently drift when one snapshot type gains a field.
 */
export interface RebuildableSnapshot {
    walls?: any[];
    rooms?: any[];
    slabs?: any[];
    columns?: any[];
    beams?: any[];
    roofs?: any[];
    stairs?: any[];
    furniture?: any[];
    handrails?: any[];
    plumbing?: any[];
    lighting?: any[];
    [key: string]: any;
}

export interface RebuildSemanticGraphResult {
    /** Number of relationships added to the graph. */
    added: number;
    /**
     * REQUIRED / persist-or-lose families this rebuild could NOT reconstruct
     * from the snapshot's authoritative state (C70 I-INV-3). Named, never
     * silently dropped. Reasons are documented at each push site below.
     */
    unreconstructable: string[];
}

/**
 * Element kinds whose creation command authoritatively writes `sitsOn` → level
 * (EV-04 §2). The rebuild reproduces EXACTLY this set from each element's
 * `levelId`, so the rebuilt graph matches the graph a fresh creation would
 * produce. Walls / doors / windows / curtain-walls are deliberately excluded:
 * no creation writer emits `sitsOn` for them, so emitting it here would INVENT
 * an edge the live model never has.
 *
 * `stairs` is handled separately (it sits on its BASE level, not `levelId`).
 */
const SITS_ON_KINDS = [
    'slabs',
    'columns',
    'beams',
    'roofs',
    'furniture',
    'handrails',
    'plumbing',
    'lighting',
] as const;

/**
 * Auto-populate the SemanticGraph from snapshot data. Called when the graph is
 * empty after deserialization. Uses only the raw snapshot arrays (no store
 * reads) so it is safe to call before any StoreEventBus events fire.
 *
 * Reconstructs:
 *   1. `hosts` / `hostedBy`   — wall ↔ hosted door/window (wall.openings[])
 *   2. `boundedBy`            — room → bounding wall (room.boundingWallIds — TOP-LEVEL,
 *                               a SIBLING of `boundary`, per RoomDataAddSchema; see G-1 note below)
 *   3. `adjacentTo`           — two rooms sharing a bounding wall
 *   4. `connectedTo`          — two rooms sharing a bounding wall that carries a door
 *   5. `partOf`               — room → unit (room.unitId)
 *   6. `sitsOn`               — element → level (element.levelId), for SITS_ON_KINDS + stairs
 *   7. `supports`             — support element → beam (beam.startSupportId / endSupportId)
 *   8. `connectedByStair`     — base level ↔ top level (stair.baseLevelId / topLevelId)
 *   9. `contains`             — room → furniture (furniture.hostedSpaceId)
 *  10. `decidedBy`            — element → DecisionRecord (decisionRecords.records[].elementId)
 */
export function rebuildSemanticGraphFromSnapshot(
    snapshot: RebuildableSnapshot,
): RebuildSemanticGraphResult {
    let count = 0;

    /**
     * §FIX-CONNECTEDBY-EDGE-KEYING — `authoredBy` widens the edge's identity for
     * the level↔level circulation families. It MUST be threaded through the
     * rebuild as well as the live writers: this path runs when a snapshot
     * predates the graph (or its graph is empty), and without the key two stairs
     * between the same level pair would rebuild as ONE edge on every load —
     * re-introducing the exact collapse in-session creation now avoids.
     */
    const addRel = (
        sourceId: string,
        targetId: string,
        type: RelationshipType,
        authoredBy?: string,
    ) => {
        try {
            semanticGraphManager.addRelationship({
                type, sourceId, targetId, createdBy: 'system',
                ...(authoredBy !== undefined ? { authoredBy } : {}),
            });
            count++;
        } catch {
            // Skip invalid pairs silently — stores may not yet be populated
        }
    };

    // 1. Wall → hosted Door/Window (hosts + hostedBy inverse), and the set of
    //    walls carrying at least one door opening (used by connectedTo below).
    const doorWallIds = new Set<string>();
    for (const wall of (snapshot.walls ?? [])) {
        if (!wall?.id || !Array.isArray(wall.openings)) continue;
        for (const opening of wall.openings) {
            const elementId: string | undefined = opening?.elementId ?? opening?.id;
            if (!elementId) continue;
            addRel(wall.id, elementId, 'hosts');
            addRel(elementId, wall.id, 'hostedBy');
            if (opening?.type === 'door') doorWallIds.add(wall.id);
        }
    }

    // 2. Room → Wall (boundedBy) + index of which rooms share each wall.
    //
    // G-1 (BIM30 Phase 0D): `boundingWallIds` is a TOP-LEVEL field on the room
    // record — a SIBLING of `boundary`, not nested inside it (RoomDataAddSchema /
    // RoomTypes.RoomData, both since the initial commit). This used to read
    // `room.boundary?.boundingWallIds`, which matched NO persisted snapshot ever
    // written (both ProjectSerializers persist `roomStore.getAll()` verbatim via
    // deepStrip), so `boundedBy` / `adjacentTo` / `connectedTo` silently yielded
    // zero edges on every load. No fallback read of the nested shape is kept:
    // git history proves no serializer ever wrote it there, and a fallback for a
    // shape that never existed would be dead code wearing a safety costume.
    const wallToRooms = new Map<string, string[]>();
    for (const room of (snapshot.rooms ?? [])) {
        if (!room?.id) continue;
        const wallIds: string[] = Array.isArray(room.boundingWallIds) ? room.boundingWallIds : [];
        for (const wallId of wallIds) {
            if (!wallId) continue;
            addRel(room.id, wallId, 'boundedBy');
            if (!wallToRooms.has(wallId)) wallToRooms.set(wallId, []);
            wallToRooms.get(wallId)!.push(room.id);
        }
    }

    // 3. Rooms sharing a bounding wall are adjacentTo; if that wall carries a
    //    door they are also connectedTo (mirrors DetectAllRoomsCommand — the
    //    same door-derived derivation the live writer uses). Both directions.
    for (const [wallId, roomIds] of wallToRooms) {
        if (roomIds.length < 2) continue;
        const isDoorWall = doorWallIds.has(wallId);
        for (let i = 0; i < roomIds.length; i++) {
            const a = roomIds[i];
            if (!a) continue;
            for (let j = i + 1; j < roomIds.length; j++) {
                const b = roomIds[j];
                if (!b) continue;
                addRel(a, b, 'adjacentTo');
                addRel(b, a, 'adjacentTo');
                if (isDoorWall) {
                    addRel(a, b, 'connectedTo');
                    addRel(b, a, 'connectedTo');
                }
            }
        }
    }

    // 4. Room → Unit (partOf)
    for (const room of (snapshot.rooms ?? [])) {
        if (!room?.id || !room.unitId) continue;
        addRel(room.id, room.unitId, 'partOf');
    }

    // 5. Element → Level (sitsOn) — reconstructed from each element's authoritative
    //    `levelId`. This is the highest-value widen: it protects ~10 element kinds
    //    that were previously PERSIST-OR-LOSE (EV-04 §3, EV-05 §3).
    for (const kind of SITS_ON_KINDS) {
        for (const el of (snapshot[kind] ?? [])) {
            if (!el?.id || !el.levelId) continue;
            addRel(el.id, el.levelId, 'sitsOn');
        }
    }

    // 6. Structural supports (supports) — support element → beam, from the beam's
    //    authoritative start/end support refs (mirrors CreateBeamCommand exactly).
    for (const beam of (snapshot.beams ?? [])) {
        if (!beam?.id) continue;
        if (beam.startSupportId) addRel(beam.startSupportId, beam.id, 'supports');
        if (beam.endSupportId && beam.endSupportId !== beam.startSupportId) {
            addRel(beam.endSupportId, beam.id, 'supports');
        }
    }

    // 7. Stairs — sitsOn its BASE level + connectedByStair between base↔top
    //    (mirrors CreateStairCommand: sitsOn(stair, baseLevel), bidirectional
    //    connectedByStair). Uses baseLevelId (falling back to levelId).
    for (const stair of (snapshot.stairs ?? [])) {
        if (!stair?.id) continue;
        const baseLevelId: string | undefined = stair.baseLevelId ?? stair.levelId;
        const topLevelId: string | undefined = stair.topLevelId;
        if (baseLevelId) addRel(stair.id, baseLevelId, 'sitsOn');
        if (baseLevelId && topLevelId && baseLevelId !== topLevelId) {
            // §FIX-CONNECTEDBY-EDGE-KEYING — keyed on the stair, exactly as
            // CreateStairCommand now writes it. Two stairs joining the same pair
            // rebuild as TWO edges; previously they collapsed into one on load
            // regardless of how many stairs the snapshot held.
            addRel(baseLevelId, topLevelId, 'connectedByStair', stair.id);
            addRel(topLevelId, baseLevelId, 'connectedByStair', stair.id);
        }
    }

    // 8. Room → contained element (contains) — §CONTAINS-FIRST-PARTY-WRITER,
    //    C71 §2.1 #7 / §5.2.
    //
    // Reconstructed from `furniture.hostedSpaceId`, the room id the D-FLE furnish
    // engine stamps on every placed item and BOTH ProjectSerializers persist
    // verbatim. That makes this edge REGENERATED like its neighbours above, not
    // persist-or-lose — the same rule every other edge here follows: computed
    // from a field the element authoritatively carries, never guessed.
    //
    // It was on the `unreconstructable` list below until the first-party writer
    // existed, and the reason given there was accurate at the time — `contains`
    // was IFC-import-only (and even that arm was dead), so a pre-graph snapshot
    // held nothing to rebuild FROM. It now holds `hostedSpaceId`, so the honest
    // answer changed with the data, and the name leaves the loss list in the
    // same commit that makes it reconstructable.
    //
    // An item with NO `hostedSpaceId` writes no edge — identical to the live
    // writer. A hand-placed item not yet resolved to a room genuinely has no
    // containment to restore, and inventing one on load is the
    // provenance-invented-on-load defect this file's header forbids.
    for (const item of (snapshot.furniture ?? [])) {
        if (!item?.id || !item.hostedSpaceId) continue;
        addRel(item.hostedSpaceId, item.id, 'contains');
    }

    // 9. Element → DecisionRecord (decidedBy) — §GR07-DECIDEDBY-REBUILD,
    //    C70 I-INV-3 / C71 §1.2 semantic 4.
    //
    // Reconstructed from `decisionRecords.records[]`, the slice BOTH
    // ProjectSerializers persist verbatim (`decisionRecordStore.serialize()` →
    // `ProjectSnapshot.decisionRecords`, v4; MigrationEngine back-fills an empty
    // one for older snapshots). Every `DecisionRecord` carries `elementId`
    // authoritatively, and the live writer (`IntentPrompt`) emits exactly
    // element → record.id — so this mirrors the live edge rather than guessing
    // one, the same rule every family above follows.
    //
    // This edge was on the `unreconstructable` list's territory until now, and
    // the reason it does NOT belong there is the `contains` reason: the loss was
    // never real. The records survive the snapshot; only the EDGE was dropped.
    // Naming a family as lost while its authoritative source sits in the same
    // snapshot is the stale claim C71 §0.1 exists to prevent, in the direction
    // that costs a user their audit trail.
    //
    // The rebuild reads the RAW snapshot slice, not `decisionRecordStore` — both
    // loaders call this BEFORE `decisionRecordStore.deserialize(...)` runs, and
    // this file's contract is "no store reads" so it stays callable before any
    // StoreEventBus event fires.
    //
    // NAMED RESIDUAL, not claimed closed: the live writer also stamps
    // `metadata: { decisionType, dismissed }` on the edge and this rebuild does
    // not, so a rebuilt edge carries the relationship but not that duplicate. It
    // is a duplicate — both fields are on the restored `DecisionRecord` itself,
    // which is where every consumer reads them — but the two edges are not
    // byte-identical and that is stated rather than glossed.
    const decisionRecords: any[] = Array.isArray(snapshot.decisionRecords?.records)
        ? snapshot.decisionRecords.records
        : [];
    for (const record of decisionRecords) {
        if (!record?.id || !record.elementId) continue;
        addRel(record.elementId, record.id, 'decidedBy');
    }

    // ── Named, non-silent losses (C70 I-INV-3) ───────────────────────────────
    const unreconstructable: string[] = [];

    // `connectedByLift` (+ a lift's own sitsOn): lifts are NOT serialized into
    // the snapshot at all (neither ProjectSerializer emits a lifts array), so
    // the authoritative base/top level refs the edge derives from are absent.
    // Reconstruction is impossible from this snapshot — named, not dropped.
    unreconstructable.push('connectedByLift');

    // `measuredAt` (room → `physics-result-<roomId>`): §GR07-MEASUREDAT-NAMED.
    // The target is not an element and not a snapshot record — it is a node that
    // exists ONLY as this edge's endpoint, and the measurement itself (thermal
    // load, RT60, daylight factor) lives in the edge's `metadata`. Nothing in the
    // snapshot carries it: no serializer emits a physics slice, so there is no
    // authoritative state to recompute the edge FROM at load time. Reconstructing
    // it here would mean re-running `PhysicsEngine._computeRoom`, which is not
    // this function's job and would fabricate a `computedAt` that never happened.
    //
    // ⚠ It IS re-derived later, and that is deliberately NOT claimed as a
    // disposition here. `initDataPlatform` enqueues every room on
    // `pryzm-project-loaded` and the drained queue writes the edge afresh
    // (`PhysicsEngine._loop` → `compute` → `_writeSemanticEdge`). But that path
    // is guarded by THREE silent early-returns — `enqueueAll` returns if
    // `window.roomStore` is absent, `_writeSemanticEdge` returns if
    // `window.semanticGraphManager` is absent, and its body is wrapped in a bare
    // `catch {}` — so it is a best-effort recompute, not a guarantee. Declaring
    // `measuredAt` REGENERATED on the strength of a chain any one of those three
    // can void silently would be a coverage claim the code does not honour. The
    // honest reading is the one stated here: this rebuild cannot reconstruct it,
    // so the load NAMES it instead of dropping it.
    unreconstructable.push('measuredAt');

    // `contains` was named here and is NO LONGER a loss — see step 8 above. The
    // entry read: "REQUIRED (C71 §2.1) but has NO first-party writer — it is
    // IFC-import-only, and wiring a native writer is a separate named Tier-2
    // gap. A pre-graph snapshot carries no `contains` edge to begin with." That
    // was true until the writer landed. `furniture.hostedSpaceId` is persisted
    // by both serializers, so the edge is now reconstructed from authoritative
    // state like every other family here, and leaving it declared as a loss
    // would be a stale claim of the kind C71 §0.1 exists to prevent.

    return { added: count, unreconstructable };
}
