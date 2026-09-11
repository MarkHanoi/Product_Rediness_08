/**
 * envelopeTreeModel — the ONE answer to "which envelopes are in this project, and which BUILDING is
 * each one filed under?" for every surface of the Project Browser.
 *
 * ⭐ §BROWSER-ONE-BUILDING-RULE (L-13311) — both cards read THIS model: the PROJECT card's Envelopes
 * node (`EnvelopeTreeSection`) renders it, and the ELEMENTS card's `Level envelopes` / `Room
 * envelopes` sub-types are its `buildingOf` index (`categorySubTypeResolver`). The first pass gave the
 * ELEMENTS card its own per-record rule (`readMassingGroupRef(el)?.label`), and the two disagreed on
 * the ordinary case: a room drawn inside Block A's level envelope carries `withinId` and NO `group`
 * (`spaceEnvelopeRecord` deliberately never infers one), so PROJECT filed it under "Block A" and
 * ELEMENTS under "Ungrouped envelopes". Two groups with different ids and one label also merged into a
 * single ELEMENTS row. [[same-rule-two-implementations]] — one panel, two answers (C84 EI-9). A
 * building is now keyed by its group ID (`group:<id>`), never by its label string.
 *
 * ⛔ NO SECOND GROUPING RULE UNDER IT EITHER. Buildings, labels, storey order and the ungrouped bucket
 * come from `readMassingGroups` — the reader the Site panel's master-plan table renders. This file adds
 * only what that reader deliberately leaves out: ROOMS (nested under the level envelope their
 * `withinId` names), and level envelopes whose identity fields it could not read. Those are FILED
 * ("Envelopes PRYZM could not file"), never dropped (§CONTEXT-DATA-HONESTY).
 *
 * ⛔ UNREADABLE IS NOT EMPTY (C78 §5): no store ⇒ `readable: false` with the reader's sentence.
 *
 * PURE over its inputs: no DOM, no bus, no store writes. Never throws.
 */

import { trace } from '@opentelemetry/api';
import type { SpaceEnvelopeReadHandle } from '../../../site/intendedAreaChannel';
import {
    readMassingGroupRef,
    readMassingGroups,
    UNGROUPED_MASSING_LABEL,
} from '../../../site/massingGroupRoster';
import { readLevelCandidates } from '../../../site/adoptProposalAsEnvelope';

const _tracer = trace.getTracer('pryzm.browser.envelopeTree');

/** The bucket for level envelopes `readMassingGroups` could not identify — filed, never dropped. */
export const UNFILED_ENVELOPES_LABEL = 'Envelopes PRYZM could not file';

/** The ungrouped residue's key (ADR-0383 D3) and the unfiled bucket's key. */
export const UNGROUPED_ENVELOPES_KEY = 'ungrouped';
export const UNFILED_ENVELOPES_KEY = 'unfiled';

const REREAD_FAILED_TEXT =
    'Reading the space-envelope store failed, so PRYZM cannot list the envelopes. This is a failure '
    + 'to read — NOT a finding that this project holds no envelopes.';

/** One envelope row. */
export interface EnvelopeTreeRow {
    readonly id: string;
    /** `env.name`, trimmed. Only a record carrying NO name shows its id tail — never an invented label. */
    readonly name: string;
    readonly role: 'level' | 'room';
    readonly levelId: string;
    /** The storey's display name; `null` when `levelId` names no BIM level (the id is shown instead). */
    readonly levelName: string | null;
    /** Room envelopes whose `withinId` names this row, in store order. */
    readonly rooms: readonly EnvelopeTreeRow[];
}

/** One building (massing group) of the Envelopes node. */
export interface EnvelopeTreeGroup {
    /** Stable key, unique per building: `group:<id>`, `ungrouped` or `unfiled`. */
    readonly key: string;
    readonly groupId: string | null;
    /** Display only — two buildings may share one; never used to tell them apart. */
    readonly label: string;
    readonly rows: readonly EnvelopeTreeRow[];
    /** Every envelope id under this building, rooms included, in display order. */
    readonly memberIds: readonly string[];
}

export type EnvelopeTreeModel =
    | {
        readonly readable: true;
        /** Named buildings first (the roster's order), then the ungrouped residue, then the unfiled. */
        readonly groups: readonly EnvelopeTreeGroup[];
        readonly ids: readonly string[];
        /** ⭐ id → the building that lists it. The ELEMENTS card's sub-type IS this lookup. */
        readonly buildingOf: ReadonlyMap<string, EnvelopeTreeGroup>;
    }
    | { readonly readable: false; readonly text: string };

interface MutableRow {
    id: string;
    name: string;
    role: 'level' | 'room';
    levelId: string;
    levelName: string | null;
    rooms: MutableRow[];
}

interface MutableGroup {
    key: string;
    groupId: string | null;
    label: string;
    rows: MutableRow[];
    /** 0 = a named building, 1 = the ungrouped residue, 2 = unfiled. */
    rank: number;
}

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const displayName = (name: string | null, id: string): string => {
    const n = (name ?? '').trim();
    return n.length > 0 ? n : `Unnamed envelope ${id.slice(-6)}`;
};

/**
 * The Envelopes model: every AUTHORED envelope (`level` + `room`) in the store, by building.
 *
 * @param store     `runtime.stores.spaceEnvelope`, or `null`/`undefined` when the runtime has none
 * @param levelsRaw `bimManager.getLevels()` — for storey names and elevations only
 */
export function readEnvelopeTree(
    store: SpaceEnvelopeReadHandle | null | undefined,
    levelsRaw: unknown,
): EnvelopeTreeModel {
    const span = _tracer.startSpan('pryzm.browser.readEnvelopeTree');
    try {
        const levels = readLevelCandidates(levelsRaw);
        const roster = readMassingGroups(store, levels);
        if (!roster.readable) {
            span.setAttribute('pryzm.envelopeTree.read', roster.reason);
            return { readable: false, text: roster.text };
        }

        let state: ReadonlyMap<string, unknown> | null = null;
        try { state = store?.getState?.() ?? null; } catch { state = null; }
        if (state === null) {
            span.setAttribute('pryzm.envelopeTree.read', 'store-threw');
            return { readable: false, text: REREAD_FAILED_TEXT };
        }

        const levelNameById = new Map<string, string | null>();
        for (const l of levels) levelNameById.set(l.id, l.name);

        const groups: MutableGroup[] = [];
        const groupByKey = new Map<string, MutableGroup>();
        const rowById = new Map<string, MutableRow>();
        const ensureGroup = (key: string, groupId: string | null, label: string, rank: number): MutableGroup => {
            let g = groupByKey.get(key);
            if (g === undefined) {
                g = { key, groupId, label, rows: [], rank };
                groupByKey.set(key, g);
                groups.push(g);
            }
            return g;
        };

        // 1. BUILDINGS and their storeys — the roster's buckets, labels and order, verbatim.
        for (const g of roster.groups) {
            const bucket = g.groupId === null
                ? ensureGroup(UNGROUPED_ENVELOPES_KEY, null, g.label, 1)
                : ensureGroup(`group:${g.groupId}`, g.groupId, g.label, 0);
            for (const s of g.storeys) {
                const row: MutableRow = {
                    id: s.spaceEnvelopeId,
                    name: displayName(s.envelopeName, s.spaceEnvelopeId),
                    role: 'level',
                    levelId: s.levelId,
                    levelName: s.levelName,
                    rooms: [],
                };
                bucket.rows.push(row);
                rowById.set(row.id, row);
            }
        }

        // 2. Level envelopes the roster could not identify (blank storey, unreadable group) — FILED.
        const rooms: Record<string, unknown>[] = [];
        for (const raw of state.values()) {
            if (!isRec(raw)) continue;
            const id = str(raw.id);
            if (id.length === 0) continue;
            if (raw.role === 'room') { rooms.push(raw); continue; }
            if (raw.role !== 'level' || rowById.has(id)) continue;
            const levelId = str(raw.levelId);
            const row: MutableRow = {
                id, name: displayName(str(raw.name), id), role: 'level',
                levelId, levelName: levelNameById.get(levelId) ?? null, rooms: [],
            };
            ensureGroup(UNFILED_ENVELOPES_KEY, null, UNFILED_ENVELOPES_LABEL, 2).rows.push(row);
            rowById.set(id, row);
        }

        // 3. ROOMS — under the level envelope `withinId` names (so in THAT envelope's building, whatever
        //    the room's own `group` says); otherwise in the building they declare.
        const buildingOf = new Map<string, MutableGroup>();
        for (const g of groups) for (const r of g.rows) buildingOf.set(r.id, g);
        for (const raw of rooms) {
            const id = str(raw.id);
            const levelId = str(raw.levelId);
            const row: MutableRow = {
                id, name: displayName(str(raw.name), id), role: 'room',
                levelId, levelName: levelNameById.get(levelId) ?? null, rooms: [],
            };
            const parent = rowById.get(str(raw.withinId));
            const parentBuilding = parent === undefined ? undefined : buildingOf.get(parent.id);
            if (parent !== undefined && parent.role === 'level' && parentBuilding !== undefined) {
                parent.rooms.push(row);
                buildingOf.set(id, parentBuilding);
            } else {
                const ref = readMassingGroupRef(raw);
                const bucket = ref === null
                    ? ensureGroup(UNGROUPED_ENVELOPES_KEY, null, UNGROUPED_MASSING_LABEL, 1)
                    : ensureGroup(`group:${ref.id}`, ref.id, ref.label, 0);
                bucket.rows.push(row);
                buildingOf.set(id, bucket);
            }
            rowById.set(id, row);
        }

        const ordered = groups
            .map((g, i) => ({ g, i }))
            .sort((a, b) => (a.g.rank - b.g.rank) || (a.i - b.i))
            .map((x) => x.g);
        const outByKey = new Map<string, EnvelopeTreeGroup>();
        const outGroups: EnvelopeTreeGroup[] = ordered.map((g) => {
            const out: EnvelopeTreeGroup = {
                key: g.key,
                groupId: g.groupId,
                label: g.label,
                rows: g.rows,
                memberIds: g.rows.flatMap((r) => [r.id, ...r.rooms.map((c) => c.id)]),
            };
            outByKey.set(g.key, out);
            return out;
        });
        const outBuildingOf = new Map<string, EnvelopeTreeGroup>();
        for (const [id, g] of buildingOf) {
            const out = outByKey.get(g.key);
            if (out !== undefined) outBuildingOf.set(id, out);
        }
        const ids = outGroups.flatMap((g) => g.memberIds);
        span.setAttribute('pryzm.envelopeTree.buildings', outGroups.length);
        span.setAttribute('pryzm.envelopeTree.envelopes', ids.length);
        return { readable: true, groups: outGroups, ids, buildingOf: outBuildingOf };
    } finally {
        span.end();
    }
}
