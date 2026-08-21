// §RAC-APARTMENT-IN-ROOM (L-1640, 2026-08-21) — THE room-number ladder, lifted
// to the shared layer.
//
// This algorithm previously lived only in `apps/editor/src/ui/ai/
// ZeroTokenChatBridge.ts` (§FEAT-CHAT-ROOM-OCCUPANCY), which the pure L2
// resolver cannot import. The apartment grammar's Confirm card must resolve
// "room 00-001" BEFORE consent (C67 §4 rule 6: a refusal quotes the project's
// real numbers), so the ladder moves HERE and the bridge imports it back —
// the same lift L-1201 made for the scope tail and L-1261 for the storey
// names: ONE implementation, two consumers, no drift. C67 §4 rule 19.a: the
// fix is in the SHARED authority, and the equivalence is the import itself.
//
// The founder refers to rooms the way the Room Schedule labels them. That
// schedule has TWO candidate handles and only one of them is trustworthy:
//
//   NUMBER — unique per project ("00-001", "00-004"). The generator mints it.
//   NAME   — NOT unique. The founder's own screenshot shows two rooms with
//            distinct numbers and areas (61.32 m² / 85.73 m²) sharing the name
//            "Room 00-001". A name-first resolver silently edits the wrong one.
//
// So: numbers first, tiered from strictest to loosest, and the FIRST tier that
// matches anything wins. More than one match inside a tier is genuine ambiguity
// and REFUSES with the candidates — never a guess.

/** The room fields this resolver reads. `roomNumber` is RoomData's own field. */
export interface RoomNumberRow {
    readonly id: string;
    readonly name?: string;
    readonly roomNumber?: string;
    readonly levelId?: string;
    /** Net floor area (m²) when the snapshot carries it — Confirm-card copy. */
    readonly areaM2?: number;
}

/** How a room is spoken back to the user: number first, name in support. */
export function describeRoomRow(room: RoomNumberRow): string {
    const number = typeof room.roomNumber === 'string' ? room.roomNumber.trim() : '';
    const name = typeof room.name === 'string' ? room.name.trim() : '';
    if (number.length > 0 && name.length > 0) return `${number} (${name})`;
    return number.length > 0 ? number : name;
}

/** Digits only — "00-001" and "001" share the tail "1" once leading zeros go. */
function numericTail(raw: string): string {
    const digits = raw.replace(/\D+/g, '');
    return digits.replace(/^0+/, '');
}

export type RoomNumberMatch<R extends RoomNumberRow = RoomNumberRow> =
    | { readonly kind: 'matched'; readonly rooms: readonly R[] }
    | { readonly kind: 'ambiguous'; readonly error: string };

/**
 * Match a spoken room reference against the unique NUMBER column.
 *
 * Also splits a multi-room reference ("002 and 003") — but ONLY after the whole
 * string fails, so no existing single-reference behaviour changes. A part that
 * resolves to nothing collapses the whole match rather than silently acting on
 * the subset the user did not ask for alone.
 */
export function matchRoomsByNumber<R extends RoomNumberRow>(
    rawRef: string,
    rooms: readonly R[],
): RoomNumberMatch<R> {
    const ref = rawRef.trim().replace(/^rooms?\s+/i, '').trim();
    if (ref.length === 0 || rooms.length === 0) return { kind: 'matched', rooms: [] };

    const single = (needle: string): RoomNumberMatch<R> => {
        const key = needle.trim().replace(/^rooms?\s+/i, '').trim().toLowerCase();
        if (key.length === 0) return { kind: 'matched', rooms: [] };
        const numberOf = (r: R): string =>
            (typeof r.roomNumber === 'string' ? r.roomNumber : '').trim().toLowerCase();
        // Tier 1 — the number, exactly as shown in the schedule.
        // Tier 2 — the trailing segment ("001" for "00-001"), the form the
        //          founder actually types.
        // Tier 3 — digits with leading zeros dropped ("1" ≡ "001" ≡ "00-001").
        const tiers: ((r: R) => boolean)[] = [
            (r) => numberOf(r).length > 0 && numberOf(r) === key,
            (r) => {
                const n = numberOf(r);
                if (n.length === 0) return false;
                const segments = n.split(/[-_.\s/]+/);
                return segments[segments.length - 1] === key;
            },
            (r) => {
                const n = numericTail(numberOf(r));
                const k = numericTail(key);
                return n.length > 0 && k.length > 0 && n === k;
            },
        ];
        for (const tier of tiers) {
            const hits = rooms.filter(tier);
            if (hits.length === 1) return { kind: 'matched', rooms: hits };
            if (hits.length > 1) {
                return {
                    kind: 'ambiguous',
                    error:
                        `"${needle.trim()}" matches ${hits.length} rooms — ` +
                        `${hits.map((r) => describeRoomRow(r) || r.id).join(', ')}. ` +
                        `Nothing was changed; say the full room number so I change the right one.`,
                };
            }
        }
        return { kind: 'matched', rooms: [] };
    };

    const whole = single(ref);
    if (whole.kind === 'ambiguous' || whole.rooms.length > 0) return whole;

    // Multi-reference: "002 and 003", "002, 003 and 004".
    const parts = ref.split(/\s*(?:,|\band\b|&|\+)\s*/i).map((p) => p.trim()).filter((p) => p.length > 0);
    if (parts.length < 2) return { kind: 'matched', rooms: [] };
    const collected: R[] = [];
    for (const part of parts) {
        const hit = single(part);
        if (hit.kind === 'ambiguous') return hit;
        // All-or-nothing: acting on the parts that happened to resolve would be
        // doing a fraction of the ask without saying so.
        if (hit.rooms.length === 0) return { kind: 'matched', rooms: [] };
        for (const r of hit.rooms) if (!collected.some((c) => c.id === r.id)) collected.push(r);
    }
    return { kind: 'matched', rooms: collected };
}

/**
 * §RAC-APARTMENT-IN-ROOM — resolve a reference to exactly ONE room, for a
 * DESTRUCTIVE per-room capability. Number ladder first; a case-insensitive
 * whole-name fallback second — WITH an ambiguity guard the bridge's substring
 * `findByName` path deliberately lacks (multi-match is fine for a finishes
 * query; for a generation that rebuilds the room's interior it is a refusal).
 *
 * Three outcomes, never merged (failure ≠ emptiness, C84 EI-1b):
 *   `room`      — exactly one room.
 *   `ambiguous` — the error names every candidate. Nothing was changed.
 *   `none`      — no room matched; the caller lists real numbers.
 */
export type SingleRoomResolution<R extends RoomNumberRow = RoomNumberRow> =
    | { readonly kind: 'room'; readonly room: R }
    | { readonly kind: 'ambiguous'; readonly error: string }
    | { readonly kind: 'none' };

export function resolveSingleRoomRef<R extends RoomNumberRow>(
    rawRef: string,
    rooms: readonly R[],
): SingleRoomResolution<R> {
    const numbered = matchRoomsByNumber(rawRef, rooms);
    if (numbered.kind === 'ambiguous') return { kind: 'ambiguous', error: numbered.error };
    if (numbered.rooms.length === 1) return { kind: 'room', room: numbered.rooms[0]! };
    if (numbered.rooms.length > 1) {
        return {
            kind: 'ambiguous',
            error:
                `"${rawRef.trim()}" names ${numbered.rooms.length} rooms — ` +
                `${numbered.rooms.map((r) => describeRoomRow(r) || r.id).join(', ')}. ` +
                `I can lay out one room at a time. Nothing was changed.`,
        };
    }
    // Name fallback — WHOLE-name equality (trimmed, case-insensitive), never the
    // bridge's substring match: on a project where two rooms share a name this
    // must surface as ambiguity, not as a coin flip.
    const key = rawRef.trim().toLowerCase();
    if (key.length === 0) return { kind: 'none' };
    const byName = rooms.filter((r) => (r.name ?? '').trim().toLowerCase() === key);
    if (byName.length === 1) return { kind: 'room', room: byName[0]! };
    if (byName.length > 1) {
        return {
            kind: 'ambiguous',
            error:
                `"${rawRef.trim()}" is the name of ${byName.length} rooms — ` +
                `${byName.map((r) => describeRoomRow(r) || r.id).join(', ')}. ` +
                `Say the room NUMBER so I lay out the right one. Nothing was changed.`,
        };
    }
    return { kind: 'none' };
}
