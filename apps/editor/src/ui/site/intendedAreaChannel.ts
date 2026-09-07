// §RESI-ORCH-INTENDED (lane RESI-ORCH, 2026-09-04) — C114 §3a row 12: *"the INTENDED-area channel,
// presented beside BUILT — owed to lane RESI-ORCH."*
//
// ── THE RULE THIS MODULE EXISTS TO HOLD ─────────────────────────────────────────────────────
// C114 §3a — *"three questions, three authorities, never summed into one number"*:
//
//     How much has been BUILT?     `designMeasurement.ts measureAuthoredDesign` (real floor plates)
//     How much is INTENDED?        the space-envelope family's `footprintAreaM2` × membership
//     How much is PERMITTED?       `BuildableEnvelope`
//
// ADR-0380 D5 forbids `measureAuthoredDesign` from consuming space envelopes, and the schema's own
// rider on `footprintAreaM2` says *"THIS IS NOT A GROSS FLOOR AREA AND MUST NEVER BE SUMMED INTO
// ONE."* So this is a SEPARATE reader with a SEPARATE name, and the fold that renders it puts the
// two numbers side by side under two labels. A user who has drawn a 180 m² level envelope and
// built nothing sees `built: nothing authored · intended: 180 m²` — not 180, not 0, and not one
// figure that changes when nothing was built.
//
// ── WHICH ENVELOPES COUNT ───────────────────────────────────────────────────────────────────
// Only `role: 'level'` contributes area. A `room` envelope sits WITHIN a level envelope (C114
// §9a, `withinId`), so adding its area to the level's would count the same floor twice.
// `maximumBuildable` cannot exist in the store (refused at create, C114 §6b); if one ever does,
// it is skipped and counted as such.
//
// ── §RESI-STAGE-G (2026-09-05) — ROOMS ARE LISTED, NEVER SUMMED ──────────────────────────────
// Until this lane a room envelope was COUNTED and nothing more, so a user who had drawn six
// rooms inside a level read the single figure `180 m²` and could not see which rooms it was
// meant to hold. RESI-ORCHESTRATOR-PLAN §4 Stage G asks for *"rooms listed by name with net area
// under their level"*, and the ONE word that governs the implementation is **under**:
//
//   ⛔ `IntendedLevelArea.intendedAreaM2` IS UNCHANGED AND STILL SUMS ONLY LEVEL ENVELOPES.
//      `rooms[]` is a SIBLING field. No room area reaches `intendedAreaM2` or
//      `totalIntendedM2`, and `roomsSubtotalM2` is computed for display beside the level's
//      figure — never instead of it and never added to it. A test pins exactly this.
//
// A room whose storey carries NO level envelope cannot be listed "under its level", because
// there is no level row to sit under. Those rooms are counted in `roomsOnStoreysWithoutLevel`
// and their AREA is deliberately not rendered — the `rooms-only` arm of the fold already says
// why in the user's words, and printing an area there would be the sum this module refuses.
//
// ── FAILURE IS NOT EMPTINESS ────────────────────────────────────────────────────────────────
// A runtime with no `spaceEnvelope` store, or one whose read throws, yields `readable: false`
// with a reason — an admission about PRYZM's wiring, never a finding that nothing is intended.
// An empty store yields `readable: true` with no rows, which IS a finding. The fold renders these
// as different arms, the same discipline every other fold on the card already keeps.
//
// PURE: no store of its own, no DOM, no I/O. Never throws.

import { trace } from '@opentelemetry/api';

const _tracer = trace.getTracer('pryzm.site.intendedAreaChannel');

/** The read channel `runtime.stores.spaceEnvelope` exposes (`PluginDtoStoreHandle`). */
export interface SpaceEnvelopeReadHandle {
    getState?: () => ReadonlyMap<string, unknown>;
}

/** A storey datum, as the card already has it from `bimManager.getLevels()`. */
export interface IntendedLevelDatum {
    readonly id: string;
    readonly name?: string | null;
    readonly elevation?: number | null;
}

/**
 * ONE room envelope on a storey, as the fold lists it. §RESI-STAGE-G.
 *
 * ⛔ `netAreaM2` IS THE FOOTPRINT AREA AND IS NAMED FOR WHAT IT IS. It is
 * `SpaceEnvelope.footprintAreaM2` — the ring's area — and the schema's own rider says *"THIS IS
 * NOT A GROSS FLOOR AREA AND MUST NEVER BE SUMMED INTO ONE."* Calling it `gfaM2` here would
 * launder a footprint into a regulated quantity one field name at a time.
 */
export interface IntendedRoomArea {
    readonly id: string;
    /** The authored name; `null` when the record carries none — never invented from the role. */
    readonly name: string | null;
    readonly netAreaM2: number;
    /** The programme tag, when one was authored. Free string (C114 §9). */
    readonly occupancy: string | null;
    /**
     * `true` when the room's `withinId` names a LEVEL envelope on this same storey. `false` says
     * the room is seated on the storey but declares no membership (or declares one elsewhere) —
     * shown as a rider rather than silently normalised, because "not declared" and "declared
     * within this level" are different facts about the model.
     */
    readonly declaredWithinLevelEnvelope: boolean;
}

export interface IntendedLevelArea {
    readonly levelId: string;
    /** From the level store when the id resolves; `null` when the envelope names a level the
     *  store does not have — shown, never dropped, because a dangling `levelId` is itself a fact. */
    readonly name: string | null;
    readonly elevation: number | null;
    readonly levelEnvelopeCount: number;
    /**
     * Sum of the LEVEL envelopes' `footprintAreaM2` on this storey.
     * ⛔ NO ROOM AREA IS IN THIS NUMBER. See `rooms` / `roomsSubtotalM2`.
     */
    readonly intendedAreaM2: number;
    /**
     * §26.6 rule 3 (L-13046) — the storey's declared HEIGHT: the tallest LEVEL envelope's
     * `height` on this storey (metres), or `null` when no level envelope carries a positive one.
     * Read here, in the ONE producer, so "total height beside maximum height" is computed from
     * the same records the areas are — never from a second pass over the store.
     */
    readonly heightM: number | null;
    /** The lowest LEVEL envelope's `baseOffset` on this storey (metres above the level datum). */
    readonly baseOffsetM: number | null;
    /** §RESI-STAGE-G — the room envelopes seated on this storey, largest first, then by name. */
    readonly rooms: readonly IntendedRoomArea[];
    /**
     * The rooms' own areas added up, for display BESIDE the level figure (a designer reads
     * "180 m² intended · 142 m² in named rooms" and learns something the two numbers alone do
     * not say). ⛔ It is never added to `intendedAreaM2` and never to `totalIntendedM2`.
     */
    readonly roomsSubtotalM2: number;
}

export type IntendedAreaSnapshot =
    | {
        readonly readable: true;
        /** One row per storey carrying at least one level envelope. Lowest first. */
        readonly byLevel: readonly IntendedLevelArea[];
        /** Room envelopes seen. Counted, never summed (they sit within levels). */
        readonly roomEnvelopeCount: number;
        /**
         * §RESI-STAGE-G — rooms whose storey carries NO level envelope, so there is no row for
         * them to sit under. Counted, never given an area (see the header).
         */
        readonly roomsOnStoreysWithoutLevel: number;
        /** Records that were not a readable level/room envelope. Counted so they are not silent. */
        readonly skippedCount: number;
        /** `null` when NO level envelope exists — none declared is not zero declared. */
        readonly totalIntendedM2: number | null;
    }
    | {
        readonly readable: false;
        readonly reason: 'no-store' | 'store-threw';
        readonly text: string;
    };

const NO_STORE_TEXT =
    'This runtime exposes no space-envelope store, so PRYZM cannot read declared intent here. '
    + 'This is a gap in the wiring — NOT a finding that nothing is intended.';
const STORE_THREW_TEXT =
    'Reading the space-envelope store failed this session, so PRYZM cannot say what is intended. '
    + 'This is a failure to read — NOT a finding that nothing is intended.';

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const finite = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Read the intended-area channel. Pure over its inputs; total; never throws.
 *
 * @param store  `runtime.stores.spaceEnvelope`, or `null`/`undefined` when the runtime has none
 * @param levels the BIM level store's records, for names and elevations only
 */
export function collectIntendedAreas(
    store: SpaceEnvelopeReadHandle | null | undefined,
    levels: readonly IntendedLevelDatum[],
): IntendedAreaSnapshot {
    const span = _tracer.startSpan('pryzm.site.collectIntendedAreas');
    try {
        if (!store || typeof store.getState !== 'function') {
            span.setAttribute('pryzm.intended.arm', 'no-store');
            return { readable: false, reason: 'no-store', text: NO_STORE_TEXT };
        }
        let state: ReadonlyMap<string, unknown>;
        try {
            state = store.getState();
        } catch {
            span.setAttribute('pryzm.intended.arm', 'store-threw');
            return { readable: false, reason: 'store-threw', text: STORE_THREW_TEXT };
        }

        const levelById = new Map<string, IntendedLevelDatum>();
        for (const l of levels) if (l && typeof l.id === 'string' && l.id.length > 0) levelById.set(l.id, l);

        const acc = new Map<string, { count: number; areaM2: number; heightM: number | null; baseOffsetM: number | null }>();
        /** §RESI-STAGE-G — room envelopes by STOREY, kept apart from `acc` so no arithmetic can
         *  cross between them by accident. `levelEnvelopeIds` records which ids are LEVEL
         *  envelopes, so a room's `withinId` can be checked without a second pass. */
        const roomsByStorey = new Map<string, IntendedRoomArea[]>();
        const levelEnvelopeIds = new Set<string>();
        const pendingRooms: {
            storey: string; id: string; name: string | null;
            areaM2: number; occupancy: string | null; withinId: string | null;
        }[] = [];
        let roomEnvelopeCount = 0;
        let skippedCount = 0;
        for (const raw of state.values()) {
            if (!isRec(raw)) { skippedCount++; continue; }
            const role = raw.role;
            const levelId = typeof raw.levelId === 'string' && raw.levelId.length > 0 ? raw.levelId : null;
            const areaM2 = finite(raw.footprintAreaM2);
            if (role === 'room') {
                roomEnvelopeCount++;
                // ⚠ A room with no storey or no readable area is still COUNTED above — it exists.
                // It simply cannot be LISTED under a storey, and inventing 0 m² for it would put
                // a confident number against a record that carries none.
                if (levelId === null || areaM2 === null || areaM2 < 0) continue;
                pendingRooms.push({
                    storey: levelId,
                    id: typeof raw.id === 'string' ? raw.id : '',
                    name: typeof raw.name === 'string' && raw.name.trim().length > 0 ? raw.name.trim() : null,
                    areaM2,
                    occupancy: typeof raw.occupancy === 'string' && raw.occupancy.length > 0 ? raw.occupancy : null,
                    withinId: typeof raw.withinId === 'string' && raw.withinId.length > 0 ? raw.withinId : null,
                });
                continue;
            }
            if (role !== 'level') { skippedCount++; continue; }
            if (levelId === null || areaM2 === null || areaM2 < 0) { skippedCount++; continue; }
            if (typeof raw.id === 'string' && raw.id.length > 0) levelEnvelopeIds.add(raw.id);
            const cur = acc.get(levelId) ?? { count: 0, areaM2: 0, heightM: null, baseOffsetM: null };
            cur.count += 1;
            cur.areaM2 += areaM2;
            // §26.6 rule 3 — the storey's height is the TALLEST level envelope on it; two level
            // envelopes side by side on one storey do not stack. A non-positive or missing height
            // contributes nothing rather than a zero.
            const h = finite(raw.height);
            if (h !== null && h > 0) cur.heightM = cur.heightM === null ? h : Math.max(cur.heightM, h);
            const base = finite(raw.baseOffset);
            if (base !== null) cur.baseOffsetM = cur.baseOffsetM === null ? base : Math.min(cur.baseOffsetM, base);
            acc.set(levelId, cur);
        }

        let roomsOnStoreysWithoutLevel = 0;
        for (const r of pendingRooms) {
            if (!acc.has(r.storey)) { roomsOnStoreysWithoutLevel++; continue; }
            const list = roomsByStorey.get(r.storey) ?? [];
            list.push({
                id: r.id,
                name: r.name,
                netAreaM2: r.areaM2,
                occupancy: r.occupancy,
                declaredWithinLevelEnvelope: r.withinId !== null && levelEnvelopeIds.has(r.withinId),
            });
            roomsByStorey.set(r.storey, list);
        }

        const byLevel: IntendedLevelArea[] = [...acc.entries()].map(([levelId, v]) => {
            const l = levelById.get(levelId);
            // Largest first, then by name, then by id — deterministic when two areas are equal.
            const rooms = [...(roomsByStorey.get(levelId) ?? [])].sort((a, b) => {
                if (b.netAreaM2 !== a.netAreaM2) return b.netAreaM2 - a.netAreaM2;
                const an = a.name ?? '';
                const bn = b.name ?? '';
                if (an !== bn) return an < bn ? -1 : 1;
                return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
            });
            return {
                levelId,
                name: l && typeof l.name === 'string' && l.name.length > 0 ? l.name : null,
                elevation: l ? finite(l.elevation) : null,
                levelEnvelopeCount: v.count,
                // ⛔ `v.areaM2` ONLY. The rooms are a sibling field; nothing above adds them in.
                intendedAreaM2: v.areaM2,
                heightM: v.heightM,
                baseOffsetM: v.baseOffsetM,
                rooms: Object.freeze(rooms),
                roomsSubtotalM2: rooms.reduce((sum, r) => sum + r.netAreaM2, 0),
            };
        });
        // Lowest first; unknown elevations after known ones, then by id for determinism.
        byLevel.sort((a, b) => {
            if (a.elevation !== null && b.elevation !== null) return a.elevation - b.elevation;
            if (a.elevation !== null) return -1;
            if (b.elevation !== null) return 1;
            return a.levelId < b.levelId ? -1 : a.levelId > b.levelId ? 1 : 0;
        });

        const totalIntendedM2 = byLevel.length === 0
            ? null
            : byLevel.reduce((s, r) => s + r.intendedAreaM2, 0);

        span.setAttribute('pryzm.intended.arm', byLevel.length === 0 ? 'none-declared' : 'present');
        span.setAttribute('pryzm.intended.levels', byLevel.length);
        span.setAttribute('pryzm.intended.roomEnvelopes', roomEnvelopeCount);
        span.setAttribute('pryzm.intended.roomsListed', byLevel.reduce((n, r) => n + r.rooms.length, 0));
        return Object.freeze({
            readable: true,
            byLevel: Object.freeze(byLevel),
            roomEnvelopeCount,
            roomsOnStoreysWithoutLevel,
            skippedCount,
            totalIntendedM2,
        });
    } finally {
        span.end();
    }
}
