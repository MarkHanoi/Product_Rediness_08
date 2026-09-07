// §ROOMS-PER-LEVEL (lane MASSING-SHAPES, 2026-09-07 · L-13039 · STR §25.5 / §26.6.4) — THE
// PROJECT'S ROOMS, GROUPED BY THE STOREY THEY SIT ON, JOINED TO THE LEVEL ENVELOPE ON THAT STOREY.
//
// Founder: *"IN WHICH CASE I DESIGN I SHALL BE ABLE TO SEE THE ROOMS PER LEVEL HERE."*
//
// ── WHAT THIS IS ────────────────────────────────────────────────────────────────────────────
// The room programme (L-13024) already reads the project's rooms and shows them as ONE flat list.
// This module takes the same rooms, the project's storeys and the level envelopes already in the
// space-envelope store, and returns them PER LEVEL — *"Ground: these rooms · L1: those rooms"* —
// each group carrying the level envelope it is designed inside (one, none, or rivals).
//
// ── ⛔ A ROOM WITH NO RESOLVABLE LEVEL IS LISTED, NEVER DROPPED OR DEFAULTED ─────────────────
// A room whose `levelId` is missing, or names a storey this project does not have, goes into an
// explicit "level not known" group with its reason. Putting it on Ground would be a guess that
// looks exactly like a fact; dropping it would make the per-level count disagree with the
// programme's count above it, and the reader would not know which surface to believe.
//
// ── ⛔ AN UNKNOWN AREA IS `null`, NEVER 0 ───────────────────────────────────────────────────
// The programme importer degrades a missing area to the library default because it needs a
// number to plan with. This module does not plan; it reports. A room whose record carries no
// area is counted as "area not recorded" and excluded from the group sum, and the count of such
// rooms is printed beside the sum so a total is never read as complete when it is not.
//
// PURE: no store, no DOM, no clock, no RNG. Never throws. Reuses `ProjectRoomLike` (the ONE
// structural read of a room record) and `residentialKindForRoom` (the ONE name→kind resolver)
// from the programme importer rather than restating either.

import { trace } from '@opentelemetry/api';
import {
    residentialKindForRoom,
    type ProjectRoomLike,
} from '../room-programme/projectRoomsToProgramme';
import type { ResidentialRoomKind } from '../room-programme/residentialRoomLibrary';
import type { AdoptLevelCandidate } from './adoptProposalAsEnvelope';
import { roomOutlineVertexCount } from './roomOutlineSource';
import type { ExistingLevelEnvelope, LevelEnvelopeReadResult } from './levelEnvelopeSupersession';

const _tracer = trace.getTracer('pryzm.site.roomsPerLevelModel');

/** One room as this view lists it. */
export interface RoomsPerLevelRoom {
    readonly id: string | null;
    readonly name: string | null;
    readonly kind: ResidentialRoomKind;
    /** m², or `null` when the record carries no positive area. ⛔ Never 0 for unknown. */
    readonly areaM2: number | null;
    /** The raw level id on the record, or `null` when it carried none. Kept so the reason is exact. */
    readonly levelIdRaw: string | null;
    /**
     * §26.6.4 (L-13046) — vertex count of the room's DETECTED OUTLINE, or `null` when the record
     * carries no polygon array at all.
     *
     * ⛔ `null` IS NOT `0`, AND THE ROW SAYS SOMETHING DIFFERENT FOR EACH. `null` = nothing has
     * detected this room's shape from the walls yet (a missing measurement); a number below 3 = an
     * outline WAS recorded and is not a polygon (a finding about the model). Collapsing them would
     * make a room that has simply not been drawn yet read as a broken one. Counted by
     * `roomOutlineVertexCount`, the ONE reader of that field.
     */
    readonly outlineVertices: number | null;
}

/** The level envelope situation on one storey. */
export type RoomsPerLevelEnvelope =
    | { readonly kind: 'none' }
    | {
        readonly kind: 'one';
        readonly id: string;
        readonly name: string | null;
        readonly areaM2: number | null;
    }
    /** Two or more level envelopes on one storey — PRYZM will not choose which the rooms belong in. */
    | { readonly kind: 'rival'; readonly count: number; readonly envelopes: readonly ExistingLevelEnvelope[] }
    /** The store could not be read; NOT the same as none (§CONTEXT-DATA-HONESTY). */
    | { readonly kind: 'unreadable'; readonly text: string };

export interface RoomsPerLevelGroup {
    readonly levelId: string;
    /** The storey's own name, or a label built from its elevation — never invented from an index. */
    readonly label: string;
    readonly elevation: number;
    readonly rooms: readonly RoomsPerLevelRoom[];
    /** Sum of the KNOWN areas, or `null` when no room on the storey carries one. */
    readonly areaM2: number | null;
    readonly roomsWithoutArea: number;
    readonly envelope: RoomsPerLevelEnvelope;
}

export type RoomsPerLevelUnplacedReason =
    /** The record carries no level id at all. */
    | 'no-level-id'
    /** The record names a storey this project does not have. */
    | 'level-not-known'
    /** The project's storeys could not be read, so no room can be placed. */
    | 'levels-unreadable';

export interface RoomsPerLevelUnplaced {
    readonly room: RoomsPerLevelRoom;
    readonly reason: RoomsPerLevelUnplacedReason;
}

export interface RoomsPerLevelModel {
    /** Storeys with rooms OR a level envelope, lowest first. A storey with neither is not a finding. */
    readonly groups: readonly RoomsPerLevelGroup[];
    /** Rooms PRYZM could not seat on a storey, each with its reason. Listed, never dropped. */
    readonly unplaced: readonly RoomsPerLevelUnplaced[];
    readonly totalRooms: number;
    /** `false` when the storeys could not be read — then every room is unplaced for that reason. */
    readonly levelsReadable: boolean;
}

function readArea(room: ProjectRoomLike): number | null {
    const c = room.computed?.area;
    if (typeof c === 'number' && Number.isFinite(c) && c > 0) return c;
    const flat = room.area;
    if (typeof flat === 'number' && Number.isFinite(flat) && flat > 0) return flat;
    return null;
}

function toRoom(room: ProjectRoomLike): RoomsPerLevelRoom {
    return {
        id: typeof room.id === 'string' && room.id.length > 0 ? room.id : null,
        name: typeof room.name === 'string' && room.name.trim().length > 0 ? room.name.trim() : null,
        kind: residentialKindForRoom(room),
        areaM2: readArea(room),
        levelIdRaw: typeof room.levelId === 'string' && room.levelId.length > 0 ? room.levelId : null,
        // §26.6.4 — asked through the ONE reader, so this model and the three renderers agree on
        // what "has an outline" means. `null` survives untouched; see the field's doc.
        outlineVertices: roomOutlineVertexCount(room),
    };
}

/** A storey's label: its recorded name, else its elevation stated as such. Never "Level N" from an index. */
export function levelLabel(level: Pick<AdoptLevelCandidate, 'name' | 'elevation'>): string {
    return level.name ?? `storey at ${level.elevation.toFixed(2)} m`;
}

/**
 * Group the project's rooms per storey.
 *
 * @param rooms      the project's rooms, as `readProjectRooms` returns them
 * @param levels     the project's storeys, or `null` when they could not be read (⛔ not `[]` —
 *                   "no storeys" and "could not read the storeys" are different facts)
 * @param envelopes  the space-envelope store READ RESULT (`readLevelEnvelopes`)
 */
export function groupRoomsPerLevel(
    rooms: readonly ProjectRoomLike[],
    levels: readonly AdoptLevelCandidate[] | null,
    envelopes: LevelEnvelopeReadResult,
): RoomsPerLevelModel {
    const span = _tracer.startSpan('pryzm.site.groupRoomsPerLevel');
    try {
        const all = rooms.map(toRoom);
        span.setAttribute('pryzm.roomsPerLevel.rooms', all.length);

        if (levels === null) {
            span.setAttribute('pryzm.roomsPerLevel.levelsReadable', false);
            return Object.freeze({
                groups: Object.freeze([]),
                unplaced: Object.freeze(all.map((room) => ({ room, reason: 'levels-unreadable' as const }))),
                totalRooms: all.length,
                levelsReadable: false,
            });
        }

        const byId = new Map<string, AdoptLevelCandidate>();
        for (const l of levels) if (!byId.has(l.id)) byId.set(l.id, l);

        const roomsByLevel = new Map<string, RoomsPerLevelRoom[]>();
        const unplaced: RoomsPerLevelUnplaced[] = [];
        for (const room of all) {
            if (room.levelIdRaw === null) {
                unplaced.push({ room, reason: 'no-level-id' });
                continue;
            }
            if (!byId.has(room.levelIdRaw)) {
                unplaced.push({ room, reason: 'level-not-known' });
                continue;
            }
            const list = roomsByLevel.get(room.levelIdRaw) ?? [];
            list.push(room);
            roomsByLevel.set(room.levelIdRaw, list);
        }

        const envelopesByLevel = new Map<string, ExistingLevelEnvelope[]>();
        if (envelopes.readable) {
            for (const e of envelopes.rows) {
                const list = envelopesByLevel.get(e.levelId) ?? [];
                list.push(e);
                envelopesByLevel.set(e.levelId, list);
            }
        }

        const groups: RoomsPerLevelGroup[] = [];
        const ordered = [...byId.values()].sort(
            (a, b) => (a.elevation - b.elevation) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
        );
        for (const level of ordered) {
            const lvlRooms = roomsByLevel.get(level.id) ?? [];
            const lvlEnvelopes = envelopesByLevel.get(level.id) ?? [];
            const hasEnvelope = envelopes.readable ? lvlEnvelopes.length > 0 : false;
            if (lvlRooms.length === 0 && !hasEnvelope) continue;

            let sum = 0;
            let known = 0;
            let without = 0;
            for (const r of lvlRooms) {
                if (r.areaM2 === null) without++;
                else { sum += r.areaM2; known++; }
            }

            let envelope: RoomsPerLevelEnvelope;
            if (!envelopes.readable) {
                envelope = { kind: 'unreadable', text: envelopes.text };
            } else if (lvlEnvelopes.length === 0) {
                envelope = { kind: 'none' };
            } else if (lvlEnvelopes.length === 1) {
                const e = lvlEnvelopes[0]!;
                envelope = { kind: 'one', id: e.id, name: e.name, areaM2: e.footprintAreaM2 };
            } else {
                envelope = { kind: 'rival', count: lvlEnvelopes.length, envelopes: Object.freeze([...lvlEnvelopes]) };
            }

            groups.push(Object.freeze({
                levelId: level.id,
                label: levelLabel(level),
                elevation: level.elevation,
                rooms: Object.freeze(lvlRooms),
                areaM2: known === 0 ? null : sum,
                roomsWithoutArea: without,
                envelope,
            }));
        }

        span.setAttribute('pryzm.roomsPerLevel.groups', groups.length);
        span.setAttribute('pryzm.roomsPerLevel.unplaced', unplaced.length);
        span.setAttribute('pryzm.roomsPerLevel.levelsReadable', true);
        return Object.freeze({
            groups: Object.freeze(groups),
            unplaced: Object.freeze(unplaced),
            totalRooms: all.length,
            levelsReadable: true,
        });
    } finally {
        span.end();
    }
}

/** The reason an unplaced room is unplaced, in the user's words, with the exact id it carried. */
export function describeUnplacedReason(u: RoomsPerLevelUnplaced): string {
    switch (u.reason) {
        case 'no-level-id':
            return 'carries no storey';
        case 'level-not-known':
            return `names storey "${u.room.levelIdRaw ?? ''}", which this project does not have`;
        case 'levels-unreadable':
        default:
            return 'the project\'s storeys could not be read';
    }
}
