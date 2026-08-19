import type { HandrailData, Point3D } from './HandrailTypes';

/**
 * §L-1102 / §L-1037 — HANDRAIL PERSISTENCE: ONE PAIR, NOT FOUR LISTS.
 *
 * ─── WHAT THIS REPLACES, AND WHY THE SHAPE CHANGED ──────────────────────────
 * Handrail persistence used to be FOUR hand-written field whitelists — two SAVE
 * and two LOAD, across the two `ProjectSerializer` / `ProjectLoader` pairs
 * (`apps/editor/src/engine/persistence/*` and
 * `packages/persistence-client/src/loader/*`). C95 §16 measured the result:
 * **7 of ~26 authored fields survived a save/load round trip.** `materialId` and
 * `materialColor` were SAVED AND NEVER READ BACK; `fillType`, `railProfile`,
 * `railDiameter`, `postSpacing`, `balusterShape`, `balusterWidth`,
 * `balusterSpacing`, `infillMaxGap`, `suppressStartPost`, `hostId`, `hostKind`,
 * `railStructure`, `parameters` and `metadata` were never written at all.
 *
 * The user-visible consequence, stated without softening: draw a Frameless Glass
 * Balustrade, save, reload — and it comes back a **grey rectangular balustrade**.
 * Not degraded, a different element; and because `fillType` drives
 * `ifcPredefined`, it also exports as a different IFC entity (`GUARDRAIL` vs
 * `HANDRAIL`) than the one that was saved (C25).
 *
 * ─── THE DECISION THIS IMPLEMENTS (L-1037, DECIDED 2026-08-19) ──────────────
 * ⛔ The fix is NOT "add fourteen names to four lists". That is the artefact that
 * produced the defect four times over, in three families (L-999 wall,
 * L-1057 curtain-wall, L-1102 handrail — one mechanism, not three bugs).
 *
 * **SAVE serialises the record MINUS an explicit, NAMED exclusion list.**
 * **LOAD rebuilds through ONE exported payload builder that every loader calls.**
 *
 * The argument is asymmetric risk. Under a whitelist, forgetting a field means
 * silent permanent data loss and nothing reports it. Under an exclusion list,
 * forgetting a field means a few extra bytes in the file. Both mechanisms will be
 * forgotten by someone; only one of them punishes the user for it. So a field
 * added to `HandrailData` reaches persistence BY DEFAULT, and *omission* becomes
 * the thing that has to be written down — C84 §7's declared-field-map shape.
 *
 * ─── WHAT THIS DELIBERATELY DOES NOT DO ─────────────────────────────────────
 * This is the handrail family only. L-1037 is the target shape for every family
 * but explicitly NOT a repo-wide rewrite in one pass; families converge as they
 * are touched, and the count of remaining hand-written lists is a shrink-only
 * ratchet. C05 owns the file format and must carry L-1037 as normative.
 */

/**
 * The EXCLUSION LIST — every key of `HandrailData` (or of the objects other code
 * hangs off it) that must NOT reach the snapshot, each with the reason.
 *
 * ⛔ EXCLUDED BY NAME, NEVER BY A PREFIX CONVENTION. A `_`-prefix rule reads as
 * economical right up to the first transient field someone names without the
 * underscore, at which point it is silently persisted — and a prefix rule cannot
 * be reviewed, because nothing enumerates what it caught.
 *
 * ⚠ Anything NOT on this list is persisted. That is the point of the inversion:
 * to lose a field you must come here and write down why.
 */
export const HANDRAIL_TRANSIENT_FIELDS: ReadonlyArray<{ field: string; reason: string }> = [
    { field: '_renderVersion', reason: 'render bookkeeping — bumped to force a fragment rebuild; meaningless across sessions' },
    { field: '_sourceBaseLine', reason: 'render bookkeeping — the pre-transform baseline cached by the builder; re-derived on every build' },
    { field: 'mesh', reason: 'a live THREE.Mesh; not data, and not structured-cloneable' },
    { field: 'fragment', reason: 'the built HandrailFragment; derived wholly from the record + level elevation' },
    { field: 'spatialStatus', reason: 'an AUDIT verdict written by BimManager.reconcileSpatialContainment; re-derived at load, and persisting a stale "Orphaned" would outlive the condition that produced it' },
];

const TRANSIENT_KEYS: ReadonlySet<string> = new Set(HANDRAIL_TRANSIENT_FIELDS.map(f => f.field));

/** The on-disk shape: the record, minus the exclusions, with THREE-free points. */
export type SerializedHandrail = Record<string, unknown> & {
    id: string;
    levelId: string;
    baseLine: [Point3D, Point3D];
};

function plainPoint(v: unknown): Point3D {
    const p = (v ?? {}) as Record<string, unknown>;
    return { x: Number(p.x ?? 0), y: Number(p.y ?? 0), z: Number(p.z ?? 0) };
}

function plainBaseline(bl: unknown): [Point3D, Point3D] {
    if (!Array.isArray(bl) || bl.length < 2) {
        return [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }];
    }
    return [plainPoint(bl[0]), plainPoint(bl[1])];
}

/**
 * Deep plain-data copy. Drops functions, so a stray class instance on
 * `parameters` degrades to its enumerable numeric fields rather than poisoning
 * the JSON.
 */
function plainClone(value: unknown, depth = 0): unknown {
    if (value === null || value === undefined) return value;
    if (typeof value === 'function') return undefined;
    if (typeof value !== 'object') return value;
    if (depth > 12) return undefined;
    if (Array.isArray(value)) return value.map(v => plainClone(v, depth + 1));
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (typeof v === 'function') continue;
        const c = plainClone(v, depth + 1);
        if (c !== undefined) out[k] = c;
    }
    return out;
}

/**
 * SAVE — the record minus {@link HANDRAIL_TRANSIENT_FIELDS}.
 *
 * `undefined` values are dropped (they carry no information and JSON drops them
 * anyway); every other key survives, including keys this file has never heard
 * of. That is deliberate: a field added to `HandrailData` tomorrow is persisted
 * today, with nobody having to remember this file exists.
 */
export function serializeHandrailRecord(h: HandrailData | Record<string, unknown>): SerializedHandrail {
    const src = h as unknown as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(src)) {
        if (TRANSIENT_KEYS.has(k)) continue;
        if (v === undefined) continue;
        if (typeof v === 'function') continue;
        out[k] = plainClone(v);
    }
    out.baseLine = plainBaseline(src.baseLine);
    return out as SerializedHandrail;
}

/** The payload `CreateHandrailCommand`'s constructor accepts. */
export interface HandrailCreatePayload {
    id: string;
    start: { x: number; z: number };
    end: { x: number; z: number };
    height: number;
    thickness: number;
    levelId?: string;
    baseOffset?: number;
    fillType?: string;
    railProfile?: string;
    railDiameter?: number;
    postSpacing?: number;
    materialColor?: string;
    materialId?: string;
    balusterShape?: 'rectangular' | 'round';
    balusterWidth?: number;
    balusterSpacing?: number;
    infillMaxGap?: number;
    hostId?: string;
    hostKind?: 'stair' | 'slab';
    suppressStartPost?: boolean;
    postEndCondition?: 'redistribute' | 'fixed' | 'centred';
    ifcGuid?: string;
    parentId?: string;
    properties?: Record<string, unknown>;
    railStructure?: unknown[];
    parameters?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    spatialRelationship?: Record<string, unknown>;
    childrenIds?: string[];
}

/**
 * The fields carried verbatim from the snapshot onto the create payload. Named
 * once, here — not once per loader, which is precisely the duplication that let
 * the two sides drift.
 */
const CARRIED_FIELDS = [
    'fillType', 'railProfile', 'railDiameter', 'postSpacing',
    'materialColor', 'materialId',
    'balusterShape', 'balusterWidth', 'balusterSpacing', 'infillMaxGap',
    'hostId', 'hostKind', 'suppressStartPost', 'postEndCondition',
    'parentId', 'properties', 'railStructure', 'parameters', 'metadata',
    'spatialRelationship', 'childrenIds',
] as const;

/**
 * LOAD — THE ONE PAYLOAD BUILDER. Both `ProjectLoader` copies call this; neither
 * may hand-assemble a `CreateHandrailCommand` payload again.
 *
 * ⚠ WHY A BUILDER AND NOT "pass the record straight through": the command's
 * constructor takes `start`/`end` as 2-D `{x,z}`, while the record stores a 3-D
 * two-point `baseLine`. That is the ONE genuine transformation on this leg, and
 * it is the reason the two sides drifted — every loader re-derived it, and each
 * re-derivation carried only the fields its author happened to remember. Written
 * here, once.
 *
 * ⚠ `height`/`thickness` fall back to family defaults rather than to `undefined`:
 * `canExecute` REFUSES a height outside 0.3–2.5 m, so a snapshot missing the
 * field would make the element fail to load rather than load wrong — silently
 * dropping something the user drew.
 */
export function buildHandrailCreatePayload(h: SerializedHandrail | Record<string, unknown>): HandrailCreatePayload {
    const src = h as Record<string, any>;
    const bl = plainBaseline(src.baseLine);
    const payload: HandrailCreatePayload = {
        id: String(src.id),
        start: { x: bl[0].x, z: bl[0].z },
        end: { x: bl[1].x, z: bl[1].z },
        height: typeof src.height === 'number' ? src.height : 1.0,
        thickness: typeof src.thickness === 'number' ? src.thickness : 0.05,
        levelId: src.levelId,
        baseOffset: src.baseOffset,
    };
    for (const k of CARRIED_FIELDS) {
        if (src[k] !== undefined) (payload as unknown as Record<string, unknown>)[k] = plainClone(src[k]);
    }
    // §PERSIST-L1 (W1-2) — the IFC round-trip join key lives under `ifcData` on
    // the record and is passed FLAT to the command.
    if (src.ifcData && src.ifcData.guid) payload.ifcGuid = src.ifcData.guid;
    return payload;
}
