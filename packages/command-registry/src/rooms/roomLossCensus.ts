/**
 * roomLossCensus — §ROOM-LOSS-CENSUS (L-10812), C94 §TOBE.6 **RM-0**.
 *
 * ## THE QUESTION THIS MODULE EXISTS TO ANSWER
 *
 * `ReDetectRoomsCommand` drops every existing room the fresh detection did not
 * re-claim, at `ReDetectRoomsCommand.ts:105-112` — `roomStore.remove`, then four side
 * registrations. **No snapshot is taken and `undo()` is a no-op**, so the record's
 * authored meaning (name, number, occupancy, department, finishes, IFC identity…) is
 * destroyed and cannot be recovered. C94 §TOBE.1.2 carries the measured nine-step chain.
 *
 * Before anything is done about that, one fact has to exist that does not exist today:
 * **how often does it happen, and to what?** C94 §TOBE.10 item 6 states it plainly —
 * *"the frequency of room loss in real use is unknowable until RM-0 ships"*. Every
 * ruling in C94 §TOBE.8 (R-1 identity-vs-derivation, R-2, R-3) currently rests on ONE
 * console excerpt from ONE session.
 *
 * ## ⭐⭐ THE DECISIVE FIELD IS `authored`, NOT THE COUNT
 *
 * *"We lost 40 rooms this week"* and *"we lost 40 auto-numbered, never-touched rooms
 * this week"* are completely different facts and they argue for OPPOSITE answers to
 * **R-1**. A census reporting only a total would look like evidence while settling
 * nothing. So `authored` is computed per room, from the fields a human can actually
 * author, and reported as its own number.
 *
 * ## WHAT IS AND IS NOT EVIDENCE OF AUTHORSHIP — measured, not assumed
 *
 * Every value a freshly-detected room carries was read off `RoomDetectionEngine.ts:510-542`,
 * so "differs from what detection produces" is a measurement rather than a guess:
 *
 * | field | detection writes | evidence? |
 * |---|---|---|
 * | `name` | `''` (`:515`), later auto-minted `Room 00-004` by `assignUniqueRoomNumbers` | ⚠ ONLY via `isSystemMintedRoomName` — a non-empty name is NOT evidence |
 * | `roomNumber` | `''` (`:516`), later auto-minted | ⚠ ONLY via `isSystemMintedRoomNumber` |
 * | `occupancyType` | `'unclassified'` (`:531`) | ✅ anything else |
 * | `colour` | cycled from `DETECTION_COLOUR_PALETTE` (`:507`) | ⛔ **NEVER** — the system always assigns one |
 * | `finishes` / `properties` | `{}` (`:533`, `:535`) — ⚠ but `RoomStore.ts:95-100` then
 *   normalises `finishes` to `{floor: undefined, ceiling: undefined, walls: undefined}` | ⚠ ONLY via `hasAnyValue` — a KEY is not a value, see below |
 * | `department`, `programmeArea`, `occupancyLoad`, `ifcData`, `revitId`, `phase` | **absent** | ✅ presence |
 *
 * ⛔ `colour` being excluded is why this is a measured table and not a hand-waved *"does
 * it look edited"*. EVERY detected room has a colour, so counting it would report 100%
 * authored on a model nobody has touched — a check that runs, passes, and could never
 * have failed (§DIAG.3's defect shape D, in this same family).
 *
 * ## WHAT THIS MODULE REFUSES TO DO
 *
 * ⛔ **It does not classify the CAUSE as merged-vs-vanished.** That distinction belongs
 * to `OpenedRegionDetector` (`cause: 'merged-into-neighbour' | 'no-longer-detected'`,
 * decided by comparing the before and after room SETS with containment tests). At the
 * drop site the only available fact is *"the fresh detection did not re-claim this id"*.
 * Inventing a second, weaker classifier here would mint the rival answer C84 EI-9
 * forbids, and it would disagree with the first one at the margins.
 *
 * PURE: no I/O, no store, no THREE, no DOM, no clock. The caller does the logging.
 */

import { trace, type Tracer } from '@opentelemetry/api';
import type { RoomData } from '@pryzm/room-topology';
import { isSystemMintedRoomName, isSystemMintedRoomNumber } from './RoomNumbering';

// P8 / C10 §2 — same tracer idiom as `DeleteElementsBatchCommand.ts` /
// `moveReweldPreflight.ts` in this package (C84 EI-9: one tracer authority per
// package, never a second wrapper).
//
// ⭐ ONE SPAN FOR N ROOMS, for the same reason there is ONE LINE for N rooms
// (see `formatRoomLossLine` below). `classifyRoomLoss` is deliberately NOT
// traced: a span per dropped room would re-mint exactly the per-element churn
// this module's header rejects, while telling an operator nothing the summary
// span does not already carry.
let _cachedTracer: Tracer | null = null;
function _tracer(): Tracer {
    _cachedTracer ??= trace.getTracer('@pryzm/command-registry', '0.1.0');
    return _cachedTracer;
}

/** What a freshly-detected room's `occupancyType` is before anyone classifies it. */
const UNCLASSIFIED_OCCUPANCY = 'unclassified';

/**
 * Does this record hold an actual VALUE, as opposed to merely holding KEYS?
 *
 * ⭐⭐ THIS FUNCTION EXISTS BECAUSE THE END-TO-END TEST REFUTED THE OBVIOUS VERSION,
 * and the refutation is worth more than the guess it replaced.
 *
 * The first draft asked `Object.keys(room.finishes).length > 0`. Measured against the
 * REAL `RoomStore` driving the REAL detection engine, **every untouched room read as
 * authored**. The cause is `RoomStore.ts:95-100`, which normalises the finishes record
 * by writing its three surfaces EXPLICITLY, `undefined` and all:
 *
 *     finishes: room.finishes ? {
 *       ...room.finishes,
 *       floor:   room.finishes.floor   ? { …} : undefined,
 *       ceiling: room.finishes.ceiling ? { …} : undefined,
 *       walls:   room.finishes.walls   ? { …} : undefined,
 *     } : {}
 *
 * ⇒ `Object.keys({floor: undefined, ceiling: undefined, walls: undefined}).length === 3`
 * on a room nobody has ever opened.
 *
 * ⛔ Shipped, that census would have reported **100% authored on every model** — and it
 * would have argued for persistent room identity (C94 R-1) on evidence that was never
 * there. It is precisely the `colour` failure this file's header warns about, hiding in
 * the field the header had already cleared: **a check that runs, passes, and could never
 * have failed.** The header's table is right; the first implementation of it was not.
 */
function hasAnyValue(record: unknown): boolean {
    if (record == null || typeof record !== 'object') return false;
    return Object.values(record as Record<string, unknown>).some(v => v != null);
}

/** One dropped room, reduced to the facts that bear on C94 R-1. */
export interface RoomLossRecord {
    readonly id: string;
    readonly levelId: string;
    /** As stored — may be a system-minted `Room 00-004`. Read with `authored`, never alone. */
    readonly name: string;
    readonly roomNumber: string;
    /** m², from the record's own computed metrics. `0` when it carried none. */
    readonly areaM2: number;
    readonly occupancyType: string;
    /** ⭐ Did a human put anything on this room at all? The field R-1 turns on. */
    readonly authored: boolean;
    /** Which fields carried authored values, so a total can be audited rather than believed. */
    readonly authoredFields: readonly string[];
}

/**
 * Reduce one about-to-be-dropped room to its census record.
 *
 * O(1); allocates one record and one small array. Deliberately tolerant of a
 * partially-formed record — every access is guarded, because a census that THREW would
 * abort the drop loop it is observing and turn an honesty fix into a data-loss bug.
 */
export function classifyRoomLoss(room: RoomData): RoomLossRecord {
    const name = String(room?.name ?? '');
    const roomNumber = String(room?.roomNumber ?? '');
    const occupancyType = String(room?.occupancyType ?? '');

    const authoredFields: string[] = [];
    if (name !== '' && !isSystemMintedRoomName(name, roomNumber)) authoredFields.push('name');
    if (!isSystemMintedRoomNumber(roomNumber)) authoredFields.push('roomNumber');
    if (occupancyType !== '' && occupancyType !== UNCLASSIFIED_OCCUPANCY) authoredFields.push('occupancyType');
    if (String(room?.department ?? '') !== '') authoredFields.push('department');
    if (typeof room?.programmeArea === 'number') authoredFields.push('programmeArea');
    if (typeof room?.occupancyLoad === 'number') authoredFields.push('occupancyLoad');
    if (hasAnyValue(room?.finishes)) authoredFields.push('finishes');
    if (hasAnyValue(room?.properties)) authoredFields.push('properties');
    if (room?.ifcData != null) authoredFields.push('ifcData');
    if (String(room?.revitId ?? '') !== '') authoredFields.push('revitId');
    if (room?.phase != null) authoredFields.push('phase');

    return {
        id: String(room?.id ?? ''),
        levelId: String(room?.levelId ?? ''),
        name,
        roomNumber,
        areaM2: typeof room?.computed?.area === 'number' ? room.computed.area : 0,
        occupancyType,
        authored: authoredFields.length > 0,
        authoredFields,
    };
}

/**
 * The one summary line for a whole drop set.
 *
 * ⭐ ONE LINE FOR N ROOMS, NOT N LINES. The per-room detail rides inside it. C10 §7 and
 * `ProjectLoader.ts:2807` both record per-element console churn as a real main-thread
 * cost with DevTools open — re-minting that while fixing an honesty defect would be a
 * poor trade, and this file exists to close a §CONTEXT-DATA-HONESTY gap, not to open a
 * performance one.
 *
 * ⚠ It states `authored` even when it is ZERO, and never omits the clause. A blank reads
 * as "fine" (C84 EI-1b), and *"no authored rooms were lost"* is a RESULT worth printing:
 * under C94 R-1 it is the reading that ARGUES FOR leaving pure derivation alone.
 */
export function formatRoomLossLine(levelId: string, records: readonly RoomLossRecord[]): string {
    return _tracer().startActiveSpan('pryzm.room.lossCensus', (span) => {
        try {
            const authoredCount = records.filter(r => r.authored).length;
            span.setAttribute('pryzm.room.levelId', levelId);
            span.setAttribute('pryzm.room.dropped', records.length);
            // `authored` is emitted even when ZERO, for the reason the doc
            // comment gives: a blank reads as "fine" (C84 EI-1b), and zero
            // authored losses is a RESULT, not an absence of one.
            span.setAttribute('pryzm.room.droppedAuthored', authoredCount);
            return _formatRoomLossLine(levelId, records, authoredCount);
        } finally {
            span.end();
        }
    });
}

function _formatRoomLossLine(
    levelId: string,
    records: readonly RoomLossRecord[],
    authoredCount: number,
): string {
    const detail = records
        .map(r => {
            const label = r.name !== '' ? r.name : r.roomNumber !== '' ? r.roomNumber : r.id.slice(0, 8);
            const fields = r.authored ? ` authored[${r.authoredFields.join(',')}]` : ' authored[none]';
            return `${label} (${r.areaM2.toFixed(1)} m2${fields})`;
        })
        .join(' - ');

    return (
        `[ReDetectRoomsCommand] §ROOM-LOSS-CENSUS level='${levelId}' — ` +
        `${records.length} room(s) dropped by re-detection, ${authoredCount} carrying authored data. ` +
        `Their records were REMOVED and are NOT restorable by undo (C94 §TOBE.1.2). ` +
        `${detail}`
    );
}

/**
 * True while a project restore or a building generation is replaying commands.
 *
 * §LOAD-REDETECT-FREEZE / §GEN-LOG-GATING — the same two globals `BimKernel.ts:28-37`
 * gates its per-element loggers on, read directly rather than imported because that
 * helper is module-private there. `CreateWallCommand.ts:483` reads them the same way, so
 * this is the established in-package idiom and not a new one.
 *
 * ⚠ The census is SUPPRESSED on those paths, not disabled: a restore legitimately drops
 * and re-adds rooms wholesale, and counting that as user-visible loss would make the
 * number useless for the ruling it exists to inform.
 */
export function roomCensusSuppressed(): boolean {
    const g = globalThis as unknown as {
        __pryzmProjectLoadActive?: boolean;
        __pryzmBuildingGenActive?: boolean;
    };
    return g.__pryzmProjectLoadActive === true || g.__pryzmBuildingGenActive === true;
}
