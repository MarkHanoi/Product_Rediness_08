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
// §9a, `withinId`), so adding its area to the level's would count the same floor twice. Rooms are
// COUNTED so the fold can say they exist, and nothing more. `maximumBuildable` cannot exist in
// the store (refused at create, C114 §6b); if one ever does, it is skipped and counted as such.
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

export interface IntendedLevelArea {
    readonly levelId: string;
    /** From the level store when the id resolves; `null` when the envelope names a level the
     *  store does not have — shown, never dropped, because a dangling `levelId` is itself a fact. */
    readonly name: string | null;
    readonly elevation: number | null;
    readonly levelEnvelopeCount: number;
    /** Sum of the LEVEL envelopes' `footprintAreaM2` on this storey. */
    readonly intendedAreaM2: number;
}

export type IntendedAreaSnapshot =
    | {
        readonly readable: true;
        /** One row per storey carrying at least one level envelope. Lowest first. */
        readonly byLevel: readonly IntendedLevelArea[];
        /** Room envelopes seen. Counted, never summed (they sit within levels). */
        readonly roomEnvelopeCount: number;
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

        const acc = new Map<string, { count: number; areaM2: number }>();
        let roomEnvelopeCount = 0;
        let skippedCount = 0;
        for (const raw of state.values()) {
            if (!isRec(raw)) { skippedCount++; continue; }
            const role = raw.role;
            if (role === 'room') { roomEnvelopeCount++; continue; }
            if (role !== 'level') { skippedCount++; continue; }
            const levelId = typeof raw.levelId === 'string' && raw.levelId.length > 0 ? raw.levelId : null;
            const areaM2 = finite(raw.footprintAreaM2);
            if (levelId === null || areaM2 === null || areaM2 < 0) { skippedCount++; continue; }
            const cur = acc.get(levelId) ?? { count: 0, areaM2: 0 };
            cur.count += 1;
            cur.areaM2 += areaM2;
            acc.set(levelId, cur);
        }

        const byLevel: IntendedLevelArea[] = [...acc.entries()].map(([levelId, v]) => {
            const l = levelById.get(levelId);
            return {
                levelId,
                name: l && typeof l.name === 'string' && l.name.length > 0 ? l.name : null,
                elevation: l ? finite(l.elevation) : null,
                levelEnvelopeCount: v.count,
                intendedAreaM2: v.areaM2,
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
        return Object.freeze({
            readable: true,
            byLevel: Object.freeze(byLevel),
            roomEnvelopeCount,
            skippedCount,
            totalIntendedM2,
        });
    } finally {
        span.end();
    }
}
