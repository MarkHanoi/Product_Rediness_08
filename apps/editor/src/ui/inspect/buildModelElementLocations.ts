// C27 INS-α-8 — buildModelElementLocations (apps/editor / L7 transitional).
//
// Pure function that walks the runtime stores and emits one
// `ElementLocation` per known item across the C27 master tree
// hierarchy:
//
//   project ← building ← level ← apartment ← room ← elementInstance
//
// The output array is what `IsolationStateStore.applyIsolation()` feeds
// to `buildIsolationIntent` (the L1 resolver from `@pryzm/visibility`).
// Each `ElementLocation` carries:
//
//   - elementId    — stable id used as the override key + selection target.
//   - kind         — one of the 7 tree kinds from C27 §2.
//   - parentChain  — root-to-immediate-parent chain (this element NOT
//                    included), used by `spatialRelationship` to
//                    classify CHILD / PARENT / SIBLING / UNRELATED.
//
// Defensive store probes match `ModelTree.ts` conventions:
//   1. `store.list()`              — ApartmentParametersStore / LevelStore
//   2. `store.getAll()`            — common store shape
//   3. `store.getState().values()` — base Store<T> shape (ReadonlyMap iter)
//   4. `Array.isArray(store)`      — already an array
//   Any error / missing store → empty list (no throw, no warn).
//
// L7 file.  Imports `@pryzm/visibility` only for the `ElementLocation`
// type.  No DOM, no THREE, no `requestAnimationFrame`.
//
// References:
//   - C27-BIM3-INSPECT-MODEL.md §2 (master tree), §5.1
//   - packages/visibility/src/intents/IsolationIntent.ts (ElementLocation
//     shape consumed by the L1 resolver).

import type { ElementLocation } from '@pryzm/visibility';

/**
 * Runtime probe shape — every field optional.  Mirrors `ModelTreeRuntime`
 * (`./ModelTree.ts`) but lives independently so this function can be
 * unit-tested without instantiating the tree component.
 */
export interface BuildModelElementLocationsRuntime {
    readonly projectContext?: {
        readonly projectId?: string | null;
        readonly projectName?: string | null;
    } | null;
    readonly buildingStore?: unknown;
    readonly levelStore?: unknown;
    readonly apartmentParametersStore?: unknown;
    readonly roomStore?: unknown;
    /**
     * Optional element instance store.  Probed for `elementInstance`
     * locations.  When absent the locations array stops at the room
     * layer — still correct, just less granular.
     */
    readonly elementStore?: unknown;
}

/** Internal record shape for the parent chain pairs. */
interface ChainEntry { kind: string; id: string }

/**
 * Walk the runtime stores and emit one `ElementLocation` per known
 * model-tree element.  Returns at least one entry (the project root)
 * even when every store is missing — that root is the canonical
 * "select-everything" anchor used by `buildIsolationIntent`.
 *
 * Order:
 *   1. project
 *   2. building(s)        — synthetic `building-1` when buildingStore is empty / missing
 *   3. level(s)           — under each building; the synthetic building owns all levels
 *   4. apartment(s)       — under a level when `apartment.levelId` resolves; else under the first level
 *   5. room(s)            — under their apartment when `room.apartmentId` resolves; else under their level
 *   6. elementInstance(s) — under their room when `element.roomId` resolves; else under their level
 *
 * Pure: no I/O, no DOM, no THREE.  Same store probe order as
 * `ModelTree.ts` so the two surfaces share their fallback semantics.
 */
export function buildModelElementLocations(
    runtime: BuildModelElementLocationsRuntime | null | undefined,
): ReadonlyArray<ElementLocation> {
    const out: ElementLocation[] = [];
    const rt = runtime ?? {};

    // ── 1. project root ──────────────────────────────────────────────────────
    const projectId = readProjectId(rt);
    out.push({
        elementId: projectId,
        kind: 'project',
        parentChain: [],
    });
    const projectChain: ReadonlyArray<ChainEntry> = [
        { kind: 'project', id: projectId },
    ];

    // ── 2. buildings ─────────────────────────────────────────────────────────
    const buildings = listFromStore(rt.buildingStore).map((b, i) => ({
        id: coerceId(b, `building-${i + 1}`),
        raw: b,
    }));
    const effectiveBuildings = buildings.length > 0
        ? buildings
        : [{ id: 'building-1', raw: {} as Record<string, unknown> }];
    // Only emit synthetic building when buildings.length === 0 AND we
    // need a parent for levels/etc.  The synthetic building is emitted
    // unconditionally below (consistent with ModelTree.ts).
    for (const b of effectiveBuildings) {
        out.push({
            elementId: b.id,
            kind: 'building',
            parentChain: projectChain,
        });
    }

    // ── 3. levels ────────────────────────────────────────────────────────────
    // Levels belong to a building.  When the store provides `level.buildingId`
    // we honour it; otherwise every level falls under the first (often only)
    // building — matches the synthetic-building convention in ModelTree.
    const firstBuildingId = effectiveBuildings[0]!.id;
    const levels = listFromStore(rt.levelStore).map((lv, i) => ({
        id: coerceId(lv, `level-${i + 1}`),
        raw: lv,
    }));
    const levelToBuildingId = new Map<string, string>();
    for (const lv of levels) {
        const bid = readString(lv.raw, 'buildingId');
        const owner = (bid !== null && effectiveBuildings.some(b => b.id === bid))
            ? bid : firstBuildingId;
        levelToBuildingId.set(lv.id, owner);
        out.push({
            elementId: lv.id,
            kind: 'level',
            parentChain: [
                ...projectChain,
                { kind: 'building', id: owner },
            ],
        });
    }

    // ── 4. apartments ────────────────────────────────────────────────────────
    const firstLevelId = levels[0]?.id;
    const apartments = listFromStore(rt.apartmentParametersStore).map((apt, i) => ({
        id: coerceId(apt, `apartment-${i + 1}`),
        raw: apt,
    }));
    const apartmentToLevelId = new Map<string, string>();
    for (const apt of apartments) {
        const lid = readString(apt.raw, 'levelId');
        const owner = (lid !== null && levelToBuildingId.has(lid)) ? lid : firstLevelId;
        if (owner === undefined) continue;
        apartmentToLevelId.set(apt.id, owner);
        const buildingId = levelToBuildingId.get(owner) ?? firstBuildingId;
        out.push({
            elementId: apt.id,
            kind: 'apartment',
            parentChain: [
                ...projectChain,
                { kind: 'building', id: buildingId },
                { kind: 'level', id: owner },
            ],
        });
    }

    // ── 5. rooms ─────────────────────────────────────────────────────────────
    const rooms = listFromStore(rt.roomStore).map((r, i) => ({
        id: coerceId(r, `room-${i + 1}`),
        raw: r,
    }));
    const roomToParentChain = new Map<string, ReadonlyArray<ChainEntry>>();
    for (const r of rooms) {
        const aptId = readString(r.raw, 'apartmentId');
        const lid = readString(r.raw, 'levelId');
        let chain: ReadonlyArray<ChainEntry>;
        if (aptId !== null && apartmentToLevelId.has(aptId)) {
            const ownerLevel = apartmentToLevelId.get(aptId)!;
            const buildingId = levelToBuildingId.get(ownerLevel) ?? firstBuildingId;
            chain = [
                ...projectChain,
                { kind: 'building', id: buildingId },
                { kind: 'level', id: ownerLevel },
                { kind: 'apartment', id: aptId },
            ];
        } else if (lid !== null && levelToBuildingId.has(lid)) {
            const buildingId = levelToBuildingId.get(lid) ?? firstBuildingId;
            chain = [
                ...projectChain,
                { kind: 'building', id: buildingId },
                { kind: 'level', id: lid },
            ];
        } else if (firstLevelId !== undefined) {
            chain = [
                ...projectChain,
                { kind: 'building', id: firstBuildingId },
                { kind: 'level', id: firstLevelId },
            ];
        } else {
            chain = [
                ...projectChain,
                { kind: 'building', id: firstBuildingId },
            ];
        }
        roomToParentChain.set(r.id, chain);
        out.push({
            elementId: r.id,
            kind: 'room',
            parentChain: chain,
        });
    }

    // ── 6. element instances ─────────────────────────────────────────────────
    const elements = listFromStore(rt.elementStore).map((e, i) => ({
        id: coerceId(e, `element-${i + 1}`),
        raw: e,
    }));
    for (const e of elements) {
        const roomId = readString(e.raw, 'roomId');
        const lid = readString(e.raw, 'levelId');
        let chain: ReadonlyArray<ChainEntry>;
        if (roomId !== null && roomToParentChain.has(roomId)) {
            chain = [
                ...roomToParentChain.get(roomId)!,
                { kind: 'room', id: roomId },
            ];
        } else if (lid !== null && levelToBuildingId.has(lid)) {
            const buildingId = levelToBuildingId.get(lid) ?? firstBuildingId;
            chain = [
                ...projectChain,
                { kind: 'building', id: buildingId },
                { kind: 'level', id: lid },
            ];
        } else if (firstLevelId !== undefined) {
            chain = [
                ...projectChain,
                { kind: 'building', id: firstBuildingId },
                { kind: 'level', id: firstLevelId },
            ];
        } else {
            chain = [
                ...projectChain,
                { kind: 'building', id: firstBuildingId },
            ];
        }
        out.push({
            elementId: e.id,
            kind: 'elementInstance',
            parentChain: chain,
        });
    }

    return out;
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function readProjectId(rt: BuildModelElementLocationsRuntime): string {
    const raw = rt.projectContext?.projectId;
    return typeof raw === 'string' && raw.length > 0 ? raw : 'project-root';
}

function readString(host: unknown, key: string): string | null {
    if (host === null || host === undefined) return null;
    const v = (host as Record<string, unknown>)[key];
    return typeof v === 'string' && v.length > 0 ? v : null;
}

function coerceId(node: unknown, fallback: string): string {
    const v = readString(node, 'id');
    return v ?? fallback;
}

/**
 * Defensive store probe — mirrors `ModelTree._listFromStore`.  Returns
 * `[]` on anything that doesn't look like a list-shaped store.
 */
function listFromStore(store: unknown): ReadonlyArray<Record<string, unknown>> {
    if (store === null || store === undefined) return [];
    try {
        const list = callIfMethod(store, 'list');
        if (Array.isArray(list)) return list as ReadonlyArray<Record<string, unknown>>;
        const getAll = callIfMethod(store, 'getAll');
        if (Array.isArray(getAll)) return getAll as ReadonlyArray<Record<string, unknown>>;
        const getState = callIfMethod(store, 'getState');
        if (getState && typeof (getState as { values?: unknown }).values === 'function') {
            return [...(getState as Iterable<Record<string, unknown>> & {
                values(): Iterable<Record<string, unknown>>;
            }).values()];
        }
        if (Array.isArray(store)) return store as ReadonlyArray<Record<string, unknown>>;
    } catch {
        // Defensive — any probe error degrades to empty.
    }
    return [];
}

function callIfMethod(host: unknown, key: string): unknown {
    if (host === null || host === undefined) return undefined;
    const fn = (host as Record<string, unknown>)[key];
    if (typeof fn === 'function') return (fn as () => unknown).call(host);
    return undefined;
}
