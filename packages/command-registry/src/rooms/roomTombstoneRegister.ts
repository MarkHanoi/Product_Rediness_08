/**
 * roomTombstoneRegister — §ROOM-TOMBSTONE (L-10814), C94 §TOBE.6 **RM-3**.
 *
 * ## THE FOUNDER'S RULING, 2026-08-24: **DERIVATION + TOMBSTONE**
 *
 * C94 §TOBE.1.3 put three options to him. He took the third:
 *
 * > **Keep derivation exactly as it is. Make the LOSS durable instead of the room.
 * > OFFER the former name / number / occupancy back — never re-apply it.**
 *
 * ⭐ **WHAT THAT BUYS.** Everything §TOBE.1.2 measured as lost comes back within reach,
 * and NOTHING new can go stale: a tombstone is a record of something that already
 * happened, so it cannot disagree with the model the way a persisted room could. No
 * reconciliation pass (C78 §11), no freshness class (C78 §6), no conflict UI. Bounded by
 * **rooms lost in this session**, not by N — which is the property he chose it for.
 *
 * ## ⛔ WHAT THE RULING DOES **NOT** GRANT — read before extending this file
 *
 * ⛔ **NO PERSISTENT ROOM ID.** Rooms remain a pure function of wall topology. **RM-5
 * stays blocked and the four C72 §9.4 SILENT ledger cells stay silent** — that was inside
 * the option he chose and he chose it knowingly. **A tombstone restores MEANING, never
 * IDENTITY.** A restored name does not re-anchor a room tag, does not repair a schedule
 * row keyed by room id, and does not give the IFC export a stable `IfcSpace` identity,
 * because the recovered room still has a fresh `crypto.randomUUID()`
 * (`RoomDetectionEngine.ts:511`). ⛔ **Do not drift toward identity because this file
 * makes it feel close.** The offer copy must say so out loud (`describeTombstoneLimits`).
 *
 * ⛔ **NOTHING IS AUTO-APPLIED.** The register produces an OFFER. The founder's standing
 * rule is *ASK, never auto-edit*, and this ruling is that rule applied. Re-applying a
 * name silently would also mint a second authority for *"what is this room called?"* —
 * the argument §L-1032 uses to refuse a level dropdown, and it holds here with equal
 * force.
 *
 * ## ONE IMPLEMENTATION, NOT A PARALLEL ONE
 *
 * ⭐ The tombstone **is the census record made durable**. `captureRoomTombstone` calls
 * `classifyRoomLoss` (§ROOM-LOSS-CENSUS, L-10812) rather than re-deciding what counts as
 * authored — so the number the console reports and the set this register keeps can never
 * disagree, and the `finishes` refutation that census already survived (values, not keys —
 * `RoomStore.ts:95-100`) is inherited rather than re-made.
 *
 * ⭐ **ONLY AUTHORED ROOMS ARE TOMBSTONED.** A room carrying nothing but what detection
 * and auto-numbering produced has no meaning to offer; tombstoning it would grow the
 * register for nothing and produce an offer that restores a name the system minted
 * anyway. `authored === false` ⇒ not kept. This is also what keeps the bound small in
 * practice: the census's own measurements show most dropped rooms carry nothing.
 *
 * ## THE BOUND, stated because it is why the option was chosen
 *
 * `MAX_TOMBSTONES_PER_LEVEL` per level, FIFO — oldest evicted first. The register is
 * session-scoped AND project-scoped (cleared by `projectScopeRegistry` on a project
 * switch, ADR-0298 / C13), so it is bounded by *authored rooms lost on one level in one
 * session*, never by model size. ⛔ It is **not** persistence: a tombstone does not
 * survive a reload, and it is not written to the project file. That is deliberate — a
 * durable-across-sessions tombstone would be a second store of room meaning, which is
 * the identity the ruling declined.
 *
 * ## BUILT SO **P2.3 (R-3)** CAN REUSE IT WHOLESALE
 *
 * ⛔ **R-3 is still OPEN and is not answered here.** It asks whether the centroid
 * tie-break at `RoomDetectionEngine.ts:1122-1131` may run at all, or should refuse and
 * tombstone BOTH halves of a merge. `captureRoomTombstone` takes a `RoomData` and knows
 * nothing about why it was dropped, so the R-3 branch can call it for the losing half,
 * or for both halves, with no change to this file.
 */

import type { RoomData, RoomVertex, RoomFinishes } from '@pryzm/room-topology';
import { pointInPolygon } from '@pryzm/room-topology';
import { classifyRoomLoss, type RoomLossRecord } from './roomLossCensus';

/**
 * Per level. FIFO beyond it.
 *
 * 32 is a session budget, not a geometric one: it is far above what any measured session
 * has produced (the founder's worst reading was rooms 5 -> 4) and far below anything that
 * could matter for memory. ⚠ If real census data ever shows sessions pressing this, the
 * answer is to look at WHY that many authored rooms are dying — not to raise the cap.
 */
export const MAX_TOMBSTONES_PER_LEVEL = 32;

/**
 * How different in area a candidate face may be and still be offered a tombstone's
 * meaning, as `min/max`. 0.5 = one may be at most twice the other.
 *
 * ⚠ A GUARD, not a match rule. The primary test is that the face's centroid lies inside
 * the polygon the lost room actually occupied. This stops a tombstone claiming a face
 * that merely overlaps its footprint — a corridor detected where a large room was, for
 * instance. Being wrong here costs a declined prompt, never a corrupted model, because
 * the register only ever OFFERS.
 */
export const TOMBSTONE_AREA_SIMILARITY_MIN = 0.5;

/** The fields an offer can put back. Meaning only — never `id`, never geometry. */
export interface RestorableRoomMeaning {
    readonly name?: string;
    readonly roomNumber?: string;
    readonly department?: string;
    readonly occupancyType?: string;
    readonly occupancyLoad?: number;
    readonly programmeArea?: number;
    readonly finishes?: RoomFinishes;
    readonly properties?: Record<string, unknown>;
    readonly ifcData?: unknown;
    readonly revitId?: string;
    readonly phase?: string;
}

export interface RoomTombstone {
    /** ⭐ The census record, reused verbatim — one implementation of "was this authored?". */
    readonly census: RoomLossRecord;
    /** What an offer may restore. */
    readonly meaning: RestorableRoomMeaning;
    /** The polygon the lost room occupied, for the containment test. */
    readonly polygon: readonly RoomVertex[];
    readonly levelId: string;
    /** Monotonic within a session; used for FIFO eviction and for ordering offers. */
    readonly seq: number;
}

/**
 * A recovered face that one or more tombstones can speak for. Nothing has been applied.
 *
 * ⭐ `candidates` is a LIST, and that is not over-generality — it is §MERGE-AWARDS-NOBODY
 * (L-10815, C94 R-3). A single lost room that comes home offers ONE candidate; a MERGE of
 * two authored rooms offers TWO, because the founder ruled that neither may be awarded
 * silently and the user chooses (or chooses neither). **One offer shape covers both**, so
 * there is no merge-specific record and no second code path to keep in step.
 *
 * Ordered most-recently-lost first.
 */
export interface RoomMeaningOffer {
    readonly levelId: string;
    /** The NEW room's id. ⚠ Deliberately different from every lost one — see the header. */
    readonly roomId: string;
    readonly candidates: readonly RoomTombstone[];
}

type OfferListener = (offer: RoomMeaningOffer) => void;

/**
 * Publish/subscribe, deliberately the same shape as `openedRegionNotifier`
 * (`OpenedRegionDetector.ts:909-930`) so the two offer channels are read the same way and
 * a listener that throws cannot take the caller down with it.
 */
class RoomMeaningNotifier {
    private readonly _listeners = new Set<OfferListener>();

    subscribe(fn: OfferListener): () => void {
        this._listeners.add(fn);
        return () => { this._listeners.delete(fn); };
    }

    publish(offer: RoomMeaningOffer): void {
        for (const fn of [...this._listeners]) {
            try {
                fn(offer);
            } catch (err) {
                console.warn('[roomTombstoneRegister] listener threw — ignored:', err);
            }
        }
    }

    get listenerCount(): number { return this._listeners.size; }
}

export const roomMeaningNotifier = new RoomMeaningNotifier();

/**
 * §ROOM-LOSS-NOTICE (L-12660) — the TELL half. C94 §TOBE.1.2 / RM-3 companion.
 *
 * ## WHY THIS EXISTS ALONGSIDE `roomMeaningNotifier`, NOT INSTEAD OF IT
 *
 * `roomMeaningNotifier` fires an OFFER only once a freshly-detected face's centroid
 * lands inside a tombstoned polygon — i.e. only once the region comes home. The
 * founder's own reported session never reached that state: `§DIAG-ROOM-LOOP BREAK
 * … unresolvedLoopBreaks=2` (a 282 mm gap against a 200 mm `hostSnap`) means the
 * boundary loop did not close, no face was ever detected there, and no offer could
 * ever fire — for as long as the gap stays open, which may be indefinitely. The only
 * record was `§ROOM-LOSS-CENSUS`'s console line. **A silent destruction of authored
 * work is the exact §CONTEXT-DATA-HONESTY failure this codebase has rules against.**
 *
 * This notifier fires ONCE, unconditionally, in the SAME `execute()` that dropped an
 * authored room — independent of whether anything ever reclaims the space. It is not
 * a substitute for the offer: a tombstone that is announced here and LATER matched by
 * a reclaiming face still fires `roomMeaningNotifier` as before (see
 * `ReDetectRoomsCommand`'s `consumedNow` bookkeeping) — this only covers the gap where
 * that would otherwise never happen at all, or would happen only after an unbounded
 * wait.
 */
export interface RoomLossNotice {
    readonly levelId: string;
    /** Tombstones captured on THIS pass that did NOT immediately find a match. Never empty. */
    readonly tombstones: readonly RoomTombstone[];
}

type LossListener = (notice: RoomLossNotice) => void;

/** Same publish/subscribe shape as {@link RoomMeaningNotifier}, deliberately. */
class RoomLossNoticeNotifier {
    private readonly _listeners = new Set<LossListener>();

    subscribe(fn: LossListener): () => void {
        this._listeners.add(fn);
        return () => { this._listeners.delete(fn); };
    }

    publish(notice: RoomLossNotice): void {
        for (const fn of [...this._listeners]) {
            try {
                fn(notice);
            } catch (err) {
                console.warn('[roomTombstoneRegister] loss-notice listener threw — ignored:', err);
            }
        }
    }

    get listenerCount(): number { return this._listeners.size; }
}

export const roomLossNotifier = new RoomLossNoticeNotifier();

// ── The register ────────────────────────────────────────────────────────────
const _byLevel = new Map<string, RoomTombstone[]>();
let _seq = 0;

/**
 * Capture a room that is about to be destroyed, IF it carries authored meaning.
 *
 * Returns the tombstone, or `undefined` when the room carried nothing worth offering.
 * O(1) apart from copying the room's own polygon. Never throws — it is called from the
 * drop loop in `ReDetectRoomsCommand`, and a capture that threw would abort a delete
 * that has already partly happened.
 */
export function captureRoomTombstone(room: RoomData): RoomTombstone | undefined {
    try {
        // ⭐ ONE implementation of "did a human touch this?" — the census's.
        const census = classifyRoomLoss(room);
        if (!census.authored) return undefined;

        const polygon = (room?.boundary?.polygon ?? []).map(p => ({ x: p.x, z: p.z }));
        if (polygon.length < 3) return undefined;   // nothing to test containment against

        const meaning: RestorableRoomMeaning = {
            ...(room.name ? { name: room.name } : {}),
            ...(room.roomNumber ? { roomNumber: room.roomNumber } : {}),
            ...(room.department ? { department: room.department } : {}),
            ...(room.occupancyType ? { occupancyType: room.occupancyType } : {}),
            ...(typeof room.occupancyLoad === 'number' ? { occupancyLoad: room.occupancyLoad } : {}),
            ...(typeof room.programmeArea === 'number' ? { programmeArea: room.programmeArea } : {}),
            ...(room.finishes ? { finishes: room.finishes } : {}),
            ...(room.properties ? { properties: room.properties as Record<string, unknown> } : {}),
            ...(room.ifcData != null ? { ifcData: room.ifcData } : {}),
            ...(room.revitId ? { revitId: room.revitId } : {}),
            ...(room.phase ? { phase: room.phase } : {}),
        };

        const tombstone: RoomTombstone = {
            census, meaning, polygon, levelId: census.levelId, seq: ++_seq,
        };

        const list = _byLevel.get(tombstone.levelId) ?? [];
        list.push(tombstone);
        // THE BOUND — FIFO, oldest first.
        while (list.length > MAX_TOMBSTONES_PER_LEVEL) list.shift();
        _byLevel.set(tombstone.levelId, list);
        return tombstone;
    } catch (err) {
        console.warn('[roomTombstoneRegister] capture failed (non-fatal):', err);
        return undefined;
    }
}

/**
 * Every tombstone that can speak for a freshly-detected, unmatched room.
 *
 * A candidate qualifies when the recovered face CONTAINS the lost room's centroid.
 * Ordered most-recently-lost first, so a region lost twice offers what it most recently
 * was, first. An empty result is the normal case and is not a failure.
 *
 * ⭐ RETURNS A LIST BECAUSE A MERGE HAS TWO ANSWERS (§MERGE-AWARDS-NOBODY, L-10815).
 * When two authored rooms merge, the detection engine now awards the merged face to
 * NOBODY and both rooms are tombstoned; the merged face then contains BOTH their
 * centroids, so both surface here and the user picks — or picks neither.
 *
 * ⚠ THE AREA GUARD IS APPLIED ONLY TO A LONE CANDIDATE. A merged space is legitimately
 * much larger than either room that fed it — that is what merging IS — so testing each
 * half against the merged area would reject exactly the case this exists to serve. With
 * two or more candidates the CONTAINMENT of both centroids is itself the evidence, and it
 * is stronger than an area ratio. With one candidate there is no such corroboration, so
 * the guard stays and stops a tombstone claiming an unrelated face that merely covers its
 * old spot.
 */
export function findTombstonesFor(room: RoomData): readonly RoomTombstone[] {
    try {
        const polygon = room?.boundary?.polygon;
        const area = room?.computed?.area;
        if (!polygon || polygon.length < 3 || typeof area !== 'number') return [];

        const list = _byLevel.get(String(room.levelId ?? ''));
        if (!list || list.length === 0) return [];

        const hits: RoomTombstone[] = [];
        for (let i = list.length - 1; i >= 0; i--) {
            const t = list[i]!;
            const centroid = centroidOf(t.polygon);
            // §C73-PIP-CANONICAL — `(px, pz, polygon)`, three args. Measured from
            // `RoomPolygonUtils.ts:169`; a two-arg call silently threw into this
            // function's own catch and every match came back `undefined`.
            if (pointInPolygon(centroid.x, centroid.z, polygon as RoomVertex[])) hits.push(t);
        }
        if (hits.length === 1) {
            const c = hits[0]!.census;
            if (c.areaM2 > 0 && area > 0) {
                const ratio = Math.min(c.areaM2, area) / Math.max(c.areaM2, area);
                if (ratio < TOMBSTONE_AREA_SIMILARITY_MIN) return [];
            }
        }
        return hits;
    } catch (err) {
        console.warn('[roomTombstoneRegister] match failed (non-fatal):', err);
        return [];
    }
}

/**
 * Consume a tombstone so it is offered at most once.
 *
 * ⚠ Called when the offer is PUBLISHED, not when it is accepted. A user who declines has
 * answered the question; re-asking on the next wall nudge would be the nagging that gets
 * a channel muted, and §OPENED-REGION's own de-duplication exists for the same reason.
 */
export function consumeTombstone(tombstone: RoomTombstone): void {
    const list = _byLevel.get(tombstone.levelId);
    if (!list) return;
    const i = list.findIndex(t => t.seq === tombstone.seq);
    if (i >= 0) list.splice(i, 1);
}

/**
 * The sentence an offer MUST carry about what it cannot do.
 *
 * ⭐ Exported as ONE string rather than left to each caller, because it is the honesty
 * condition the founder attached to the ruling, and a condition restated at each call
 * site is one that will drift at one of them. Same discipline as `db165a09`, which
 * refused to promise a name back before this mechanism existed.
 */
export function describeTombstoneLimits(): string {
    return 'This restores the room’s details only. It is a new room, so anything anchored to '
        + 'the old one — a room tag, a schedule row — stays pointing at nothing.';
}

/**
 * Did this offer arise from a MERGE (two or more rooms) rather than a single loss?
 *
 * ⭐ The user must be able to tell the two events apart: *"a room was lost"* and *"two
 * rooms became one"* are different things that happened to their model, and the second
 * one very often WANTS a new name rather than either old one. Exported so the copy and
 * the tests agree on the definition instead of each counting the list themselves.
 */
export function isMergeOffer(candidates: readonly RoomTombstone[]): boolean {
    return candidates.length >= 2;
}

/** Every tombstone currently held, newest first. Read-only; for probes and tests. */
export function listTombstones(levelId?: string): readonly RoomTombstone[] {
    const all = levelId != null
        ? [...(_byLevel.get(levelId) ?? [])]
        : [...__byLevelValues()];
    return all.sort((a, b) => b.seq - a.seq);
}

function __byLevelValues(): RoomTombstone[] {
    const out: RoomTombstone[] = [];
    for (const list of _byLevel.values()) out.push(...list);
    return out;
}

/**
 * C13 / ADR-0298 teardown. Idempotent, synchronous, non-throwing.
 *
 * ⛔ MANDATORY, not hygiene. Tombstones are keyed by LEVEL ID, and level ids are not
 * unique across projects: carried across a switch, project A's tombstone for `lvl-0`
 * would offer project B's unrelated room a name from a different building. That is worse
 * than a leak — it is a wrong offer that looks right. `OpenedRegionProposal.ts:376-398`
 * records the identical hazard for its own level-keyed maps.
 */
export function clearRoomTombstones(): void {
    _byLevel.clear();
    _seq = 0;
}

/** Probe surface for the project-scope gate. */
export function describeRoomTombstoneState(): Record<string, unknown> {
    return {
        levels: _byLevel.size,
        tombstones: __byLevelValues().length,
        maxPerLevel: MAX_TOMBSTONES_PER_LEVEL,
        listeners: roomMeaningNotifier.listenerCount,
        lossListeners: roomLossNotifier.listenerCount,
    };
}

function centroidOf(poly: readonly RoomVertex[]): RoomVertex {
    let x = 0, z = 0;
    for (const p of poly) { x += p.x; z += p.z; }
    return { x: x / poly.length, z: z / poly.length };
}
