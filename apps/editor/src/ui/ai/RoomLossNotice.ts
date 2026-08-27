/**
 * RoomLossNotice — §ROOM-LOSS-NOTICE (L-12660), C94 §TOBE.1.2 / RM-3 companion.
 *
 * The TELL half. `RoomMeaningRestoreProposal.ts` is the ASK half — a Confirm/Cancel
 * question that fires only once a later re-detection produces a face whose centroid
 * lands inside a tombstoned polygon, i.e. only once the region comes home.
 *
 * ## THE GAP THIS CLOSES
 *
 * The founder's own production console (build `f384db56`) carried BOTH of these lines
 * in the same session:
 *
 *     [ReDetectRoomsCommand] §ROOM-LOSS-CENSUS level='L0' — 2 room(s) dropped by
 *     re-detection, 1 carrying authored data. Their records were REMOVED and are NOT
 *     restorable by undo (C94 §TOBE.1.2). Dressing 01 (224.7 m2
 *     authored[name,occupancyType,department]) - Room 00-005 (55.3 m2 authored[none])
 *
 *     [RoomDetectionEngine] §DIAG-ROOM-LOOP BREAK level='L0' — 2 junction(s) the repair
 *     passes did NOT close → loop will NOT close (flood/merge risk): … endpoint 282mm
 *     from centreline EXCEEDS hostSnap 200mm …
 *
 * Both §ROOM-LOSS-CENSUS (RM-0) and §ROOM-TOMBSTONE (RM-3, the restore OFFER) already
 * shipped before that build. But the offer's ONLY trigger is a face reclaiming the
 * exact footprint later — and his loop never recloses, because `WallMoveReweldService`
 * has no repair pass for a curtain-wall body T-junction ("wall-only arms" — see C85 /
 * ADR-0336). So the offer never fires, and the ONLY place the loss was ever recorded
 * was the console line above, which he had to happen to read. That is the exact
 * §CONTEXT-DATA-HONESTY failure this codebase has rules against: silently destroying
 * the user's own classification work.
 *
 * `roomLossNotifier` (`@pryzm/command-registry`) closes this: it publishes once,
 * unconditionally, in the SAME `ReDetectRoomsCommand.execute()` that dropped an
 * authored room — independent of whether the region is EVER reclaimed. This module
 * turns that into a chat bubble via `chatSay` — a statement, not a question, because
 * there is nothing to confirm yet.
 *
 * ## IT DOES NOT REPLACE THE OFFER
 *
 * A tombstone announced here is NOT consumed by this notice — only
 * `roomMeaningNotifier`'s own offer loop consumes a tombstone, via `consumeTombstone`.
 * So if the gap DOES close later, `RoomMeaningRestoreProposal` still asks to restore it,
 * exactly as before. This module only covers the interval — possibly indefinite — where
 * nothing has claimed the tombstone yet.
 */

import { roomLossNotifier } from '@pryzm/command-registry';
import type { RoomLossNotice as RoomLossNoticeEvent, RoomTombstone } from '@pryzm/command-registry';
import { chatSay } from './chatPromptHost';

let installed = false;

/** One tombstone, rendered as `Name (type, department) — 12.3 m²`. */
function describeOne(t: RoomTombstone): string {
    const m = t.meaning;
    const label = m.name ?? m.roomNumber ?? 'A room';
    const bits: string[] = [];
    if (m.occupancyType) bits.push(m.occupancyType);
    if (m.department) bits.push(m.department);
    const detail = bits.length > 0 ? ` (${bits.join(', ')})` : '';
    return `${label}${detail} — ${t.census.areaM2.toFixed(1)} m²`;
}

/**
 * The message. Says WHAT was lost, WHY undo cannot bring it back (C94 §TOBE.1.2), and
 * what happens NEXT — honest about the fact that "next" may never come, rather than
 * promising a restore that is conditional on geometry closing up again.
 */
export function buildLossNoticeMessage(notice: RoomLossNoticeEvent): string {
    const n = notice.tombstones.length;
    const roomWord = n === 1 ? 'room' : 'rooms';
    const list = notice.tombstones.map(describeOne).join('; ');
    return (
        `A wall change just closed off ${n} named ${roomWord} you had classified, and the `
        + `${n === 1 ? 'record' : 'records'} could not be kept as ${n === 1 ? 'a room' : 'rooms'} — `
        + `undo cannot bring geometry back from before a boundary change (C94 §TOBE.1.2). `
        + `I have kept what was written on ${n === 1 ? 'it' : 'them'}: ${list}. `
        + `If this space is enclosed again, I will offer to put those details onto the new room — `
        + `not the same room, since it will have a fresh id, but the same name and classification.`
    );
}

/**
 * Subscribe the notice to `roomLossNotifier`. Idempotent — a second bootstrap cannot
 * double-announce (same discipline as `initRoomMeaningRestoreProposals`).
 */
export function initRoomLossNotices(): () => void {
    if (installed) return () => { /* already installed by an earlier bootstrap */ };
    installed = true;
    const off = roomLossNotifier.subscribe(notice => {
        if (notice.tombstones.length === 0) return;
        try {
            chatSay(buildLossNoticeMessage(notice));
        } catch (err) {
            console.warn('[RoomLossNotice] failed to announce a room loss (non-fatal):', err);
        }
    });
    return () => { off(); installed = false; };
}

/** Test-only reset. */
export function __resetRoomLossNoticeState(): void {
    installed = false;
}
