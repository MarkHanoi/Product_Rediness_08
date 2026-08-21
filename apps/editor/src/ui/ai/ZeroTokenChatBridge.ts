// ZeroTokenChatBridge — ADR-0313 tier 0/1 zero-token resolution for the AI
// chat panel.
//
// Sits in FRONT of `aiService.query()` in AIPanel._executeSend: if the
// utterance is command-shaped, it resolves and dispatches with ZERO tokens;
// a `miss` returns false and the panel falls through to the existing LLM
// path unchanged. A `refusal` is rendered as an honest chat reply
// (§CONTEXT-DATA-HONESTY) and does NOT fall through — no guessing at
// recognized-but-underspecified intents.
//
// §PLAN (RAC U6): a COMPOUND sentence ("duplicate level 0 to level 1, then
//     furnish it") resolves through `resolveCompoundUtterance` — the same
//     ladder, per clause — and dispatches as ONE Confirm card enumerating the
//     steps, then one ordered pass through the SAME executor a single sentence
//     uses. A step that fails stops the plan and the reply says how far it got.
//     Sequencing across async engines needs no new waiting mechanism: the
//     `generation.*` handlers already await their seam, which awaits the
//     engines' own `*.layout-executed` events under the shipped §CHAIN-TIMEOUT
//     budgets before resolving.
// P6: every mutation goes through `runtime.bus.executeCommand` — the same
//     verbs/payloads the property panel and keyboard shortcuts dispatch.
// Batching (ADR-0314, corrected): `batchCoordinator.runBatch` is the EVENT/
//     GEOMETRY-STORM gate only — it is deliberately undo-NEUTRAL
//     (BatchCoordinator.ts §"Undo/Redo Impact: No"; measured by
//     batchNestingUndo.test.ts). N commands inside runBatch are N undo
//     entries, and the summary must say so. ONE undo entry is bought only by
//     dispatching ONE batch command (wall.updateSystemTypeBatch,
//     wall.updateColorBatch — C16 §8.6), never by holding a batch open.
//     This header previously claimed the opposite; the claim was false.
// P8: dispatch runs inside the `pryzm.ai.chat.dispatch` span
//     (`withChatDispatchSpan`, @pryzm/ai-host); resolution itself is spanned
//     inside `resolveUtterance`.
// undo/redo are LOCAL actions — the bus verbs 'undo'/'redo' have no
//     registered handler (dispatching them throws CommandBusError), so we call
//     performUndo()/performRedo() exactly like the Ctrl+Z shortcut does.
// Level switch is a `projectContext.activeLevelId` assignment (the
//     WorkspaceController pattern) — there is no bus verb for it.

import {
    resolveUtterance,
    resolveCompoundUtterance,
    resolveNaturalLanguage,
    noteResolution,
    withChatDispatchSpan,
    capabilityGapRefusal,
    findLevel,
    // §FIX-HOSTED-LEVEL-SCOPE (L-1201) — a window/door takes its level from the
    // wall that HOSTS it. See that module's header for the measurement that
    // proved this arm returned [] for every level of every project.
    resolveLevelScopeByHost,
    isHostDerivedKind,
    // §RAC-APARTMENT-IN-ROOM (L-1640) — the room-number ladder LIFTED into the
    // shared layer (one implementation, two consumers). The local copy this
    // file carried is deleted; behaviour is byte-identical by import.
    matchRoomsByNumber,
    describeRoomRow,
    type LevelBearingRow,
    type ConversationContext,
    type PlanReport,
    type ResolverContext,
    type ResolverSelection,
    type ResolverWallSystemType,
    type VisibilityIntentSnapshot,
    isScopeError,
    FILTER_PROPERTY_NOUN,
    type BaseScopeDescriptor,
    type FilterProperty,
    type FilterScopeDescriptor,
    type FilterStat,
    type PropertyFilter,
    type ScopeDescriptor,
    type ScopeResolution,
    type ScopeResult,
    type ScopeSkip,
    type TypeFilter,
    type ZeroTokenResolution,
} from '@pryzm/ai-host';
import { batchCoordinator, selectionBus, storeRegistry } from '@pryzm/core-app-model';
// The ONE forgiving wall-type lookup (exact id → exact name → case-insensitive
// name). Injected into the pure resolver rather than reimplemented inside it —
// a second matcher here would be the same two-sources-of-truth defect the
// capability registry exists to delete.
import { resolveWallSystemTypeRef } from '@pryzm/command-registry';
import { resolveActiveLevelId } from '../apartment-layout/activeLevel';
import { resolveRoomWallScope } from './roomWallScope.js';

// ─── Minimal window facets (P4: typed casts, no `(window as any)`) ───────────

interface ObjectLike {
    userData?: { id?: unknown; elementType?: unknown };
    parent?: ObjectLike | null;
}
/** The scene shape the visibility projection traverses — same access path as
 *  SpatialTree (`window.selectionManager.world.scene.three`). */
interface SceneNodeLike {
    userData?: { id?: unknown; role?: unknown };
    visible?: boolean;
    traverse?: (fn: (node: SceneNodeLike) => void) => void;
}

interface WindowLike {
    selectionManager?: {
        selectedObject?: ObjectLike | null;
        world?: { scene?: { three?: SceneNodeLike | null } };
    };
    bimManager?: { getLevels?: () => ReadonlyArray<{ id: string; name?: string; elevation?: number }> };
    projectContext?: { activeLevelId?: string | null };
    runtime?: {
        bus?: { executeCommand(type: string, payload: unknown): Promise<unknown> };
        events?: { emit(name: string, payload: unknown): void };
        // §GATE-VIS-INTENT — the visibility slot composeRuntime §4d-bis builds.
        visibility?: {
            intent?: {
                get(viewId: string): {
                    hiddenElementIds: ReadonlySet<string>;
                    temporaryIsolation: { active: boolean; elementIds: ReadonlySet<string> } | null;
                };
            };
            applyToScene?: (root: unknown, elementIds: readonly string[]) => { matched: number; hidden: number };
        };
        viewRegistry?: { activeViewId: string | null };
    };
}
const win = (): WindowLike => window as unknown as WindowLike;

// ─── Context building ────────────────────────────────────────────────────────

/** Resolve an element id's TYPE by probing the store registry's typed stores
 *  (O(registered types); selections are small). Returns null when no store
 *  claims the id — the caller must then fall back or drop the id, never guess. */
function elementTypeOf(id: string): string | null {
    for (const type of storeRegistry.getRegisteredTypes()) {
        const store = storeRegistry.getStoreForType(type);
        if (store === undefined) continue;
        try {
            const has =
                store.has?.(id) ??
                (store.getById?.(id) !== undefined || store.get?.(id) !== undefined);
            if (has) return type.toLowerCase();
        } catch {
            // A store that throws on probe simply doesn't claim the id.
        }
    }
    return null;
}

/** Walk up from the raw selected Object3D to the BIM root that carries
 *  userData.id + userData.elementType (same walk as initUI.deleteSelected). */
function singleSelectionFromManager(): readonly ResolverSelection[] {
    let node: ObjectLike | null | undefined = win().selectionManager?.selectedObject;
    while (node && !(typeof node.userData?.id === 'string' && typeof node.userData?.elementType === 'string')) {
        node = node.parent;
    }
    if (!node?.userData) return [];
    return [{
        elementId: node.userData.id as string,
        elementType: (node.userData.elementType as string).toLowerCase(),
    }];
}

/**
 * ADR-0314 §Selection batch — the chat sees the FULL multi-selection.
 *
 * `selectionBus.currentIds` is the authority on the selected SET (the same
 * source the AI-panel "Selected walls" pill reads); the legacy single-object
 * walk remains as the fallback for environments where the bus is empty but a
 * primary object is highlighted. An id whose type no store claims is DROPPED
 * (not guessed) — an unclassifiable target must never receive a command.
 */
function currentSelection(): readonly ResolverSelection[] {
    let ids: readonly string[] = [];
    try {
        ids = selectionBus.currentIds;
    } catch {
        ids = [];
    }
    if (ids.length > 0) {
        const out: ResolverSelection[] = [];
        for (const id of ids) {
            const type = elementTypeOf(id);
            if (type !== null) out.push({ elementId: id, elementType: type });
        }
        if (out.length > 0) return out;
    }
    return singleSelectionFromManager();
}

/** The project's wall-type catalogue, read lazily so a headless/boot-time call
 *  cannot throw. The STORE is read here (app layer); the resolver stays pure. */
async function wallTypeCatalogue(): Promise<{
    resolve: (ref: string) => ResolverWallSystemType | null;
    names: readonly string[];
}> {
    const { wallSystemTypeStore } = await import('@pryzm/geometry-wall');
    return {
        resolve: (ref: string) => {
            const hit = resolveWallSystemTypeRef(wallSystemTypeStore, ref);
            return hit === null ? null : { id: hit.id, name: hit.name };
        },
        names: wallSystemTypeStore.getAll().map((t) => t.name),
    };
}

// ─── §FEAT-CHAT-ROOM-OCCUPANCY — resolving "room 001" ────────────────────────
//
// The founder refers to rooms the way the Room Schedule labels them. That
// schedule has TWO candidate handles and only one of them is trustworthy:
//
//   NUMBER — unique per project ("00-001", "00-004"). The generator mints it.
//   NAME   — NOT unique. The founder's own screenshot shows two rooms with
//            distinct numbers and areas (61.32 m² / 85.73 m²) sharing the name
//            "Room 00-001". `RoomStore.findByName` is a substring match, so a
//            name-first resolver returns both and silently edits the wrong one.
//
// So: numbers first, tiered from strictest to loosest, and the FIRST tier that
// matches anything wins. More than one match inside a tier is genuine ambiguity
// and REFUSES with the candidates — never a guess.

/** The room fields this resolver reads. `roomNumber` is RoomData's own field. */
interface RoomRefRow {
    readonly id: string;
    readonly name?: string;
    readonly roomNumber?: string;
    readonly boundingWallIds?: string[];
}

/**
 * ADR-0315 U3.2 — the editor-side SCOPE RESOLVER (F2), injected into the pure
 * resolver. Turns a ScopeDescriptor into element ids ONCE, over indexed paths:
 * level → the store's own `getByLevel` (Map-indexed on WallStore) with a
 * getAll-filter fallback; kinds come from `storeRegistry`. Ids-only mapping —
 * never a deep-clone `getAll()` walk when an index exists. Unresolvable scope
 * ⇒ `{ error }` with refusal-grade copy (§CONTEXT-DATA-HONESTY).
 */
function makeScopeResolver(
    levels: readonly { id: string; name: string; elevation?: number }[],
    typeName: (kind: string, ref: string) => string | null,
): (scope: ScopeDescriptor) => ScopeResult {
    const resolveBase = (scope: BaseScopeDescriptor): ScopeResult => {
        const count = (ids: readonly string[], kind: string): Record<string, number> =>
            ids.length > 0 ? { [kind]: ids.length } : {};
        if (scope.kind === 'ids') {
            return { ids: scope.ids, kindCounts: {}, skipped: [], diagnostics: [] };
        }
        if (scope.kind === 'level' || scope.kind === 'all') {
            const kind = scope.elementKind ?? 'wall';
            const store = storeRegistry.getStoreForType(kind) as unknown as {
                // RAC U8.2 / U3.4 — the IDS-ONLY accessors. A scope needs
                // identity, not state: `getAll()` clones every record in the
                // project (WallStore.getAll → cloneWallData per wall) purely
                // to read `.id` off each one. Where the store exposes the
                // ids-only twin we take it; the clone walk survives only as
                // the fallback for stores that have not grown one yet.
                getAllIds?: () => readonly string[];
                getIdsByLevel?: (levelId: string) => readonly string[];
                getByLevel?: (levelId: string) => Array<{ id: string }>;
                getAll?: () => Array<{ id: string; levelId?: string }>;
            } | undefined;
            if (!store) {
                return { error: `I can't enumerate ${kind}s here — the ${kind} store isn't available.` };
            }
            if (scope.kind === 'all') {
                const ids = typeof store.getAllIds === 'function'
                    ? [...store.getAllIds()]
                    : (store.getAll?.() ?? []).map((e) => e.id);
                return { ids, kindCounts: count(ids, kind), skipped: [], diagnostics: [] };
            }
            const level = findLevel(scope.levelQuery, levels);
            if (level === undefined) {
                const names = levels.map((l) => l.name).join(', ');
                return {
                    error: levels.length === 0
                        ? 'No levels exist in this project yet.'
                        : `No level called "${scope.levelQuery}" — the levels here are: ${names}.`,
                };
            }
            if (typeof store.getIdsByLevel === 'function') {
                const ids = [...store.getIdsByLevel(level.id)];
                return { ids, kindCounts: count(ids, kind), skipped: [], diagnostics: [level.name] };
            }
            if (typeof store.getByLevel === 'function') {
                const ids = store.getByLevel(level.id).map((e) => e.id);
                return { ids, kindCounts: count(ids, kind), skipped: [], diagnostics: [level.name] };
            }
            // ⭐ §FIX-HOSTED-LEVEL-SCOPE (L-1201) — THIS BRANCH USED TO BE
            //   `getAll().filter(e => e.levelId === level.id)`
            // and for windows and doors it could NEVER be true. Neither store
            // has a level accessor and neither RECORD carries `levelId` at all
            // (`WindowOpening` / `DoorOpening` carry `wallId`), so the filter
            // compared `undefined === 'level-2-id'` for every opening in the
            // project and returned []. The user asked "change all windows on
            // level 2" on a level full of windows and was told, confidently,
            // that there were none: failure and empty were the same value
            // (§CONTEXT-DATA-HONESTY). Ten defects this week were unsatisfiable
            // rather than broken; this is one more, and reading two store class
            // declarations was enough to find it.
            //
            // The level is now DERIVED PER RECORD — own `levelId` if it has one,
            // else the HOST WALL's, else a counted skip with its reason. Derived,
            // not enumerated: a `HOSTED_KINDS = ['door','window']` list would be
            // the same remember-don't-derive defect that produced the scope-tail
            // bug this fix ships beside.
            const rows = (store.getAll?.() ?? []) as unknown as readonly LevelBearingRow[];
            if (!isHostDerivedKind(rows)) {
                const ids = rows.filter((e) => e.levelId === level.id).map((e) => e.id);
                return { ids, kindCounts: count(ids, kind), skipped: [], diagnostics: [level.name] };
            }
            const wallStore = storeRegistry.getStoreForType('wall') as unknown as {
                getById?: (id: string) => { levelId?: string } | undefined;
            } | undefined;
            const hosted = resolveLevelScopeByHost(
                kind,
                rows,
                level.id,
                level.name,
                // `null` = no wall store at all (REFUSE); `undefined` = this wall
                // is not in the model (a counted SKIP). Two different facts, and
                // collapsing them is what this fix exists to stop.
                (wallId) => (wallStore?.getById === undefined ? null : wallStore.getById(wallId)?.levelId),
            );
            if (hosted.kind === 'refused') return { error: hosted.error };
            return {
                ids: hosted.ids,
                kindCounts: count(hosted.ids, kind),
                skipped: hosted.skipped,
                diagnostics: [level.name],
            };
        }
        if (scope.kind === 'room') {
            // ADR-0315 U3 (room arm) — rooms matched by the U2.2 predicates;
            // walls come straight off RoomData.boundingWallIds. Multiple rooms
            // matching the reference ("kitchen" ×2) all contribute — the
            // diagnostics name them so the summary is honest about the set.
            const roomStore = storeRegistry.getStoreForType('room') as unknown as {
                findByName?: (pattern: string) => Array<RoomRefRow>;
                findByOccupancy?: (types: string[]) => Array<RoomRefRow>;
                getAll?: () => Array<RoomRefRow>;
            } | undefined;
            if (!roomStore) {
                return { error: `I can't look up rooms here — the room store isn't available.` };
            }
            // §FEAT-CHAT-ROOM-OCCUPANCY — NUMBER BEFORE NAME.
            //
            // The founder says "room 001", and the Room Schedule's NUMBER column
            // is the unique handle: their own screenshot shows two different
            // rooms (61.32 m² and 85.73 m²) BOTH NAMED "Room 00-001" while
            // carrying distinct numbers 00-001 and 00-004. `findByName` is a
            // case-insensitive SUBSTRING match, so on that project a name-first
            // lookup for "room 001" matches both and would have picked one — a
            // silently wrong room, which is the worst possible outcome for an
            // edit the user cannot see happening. Numbers are matched first, and
            // an ambiguous number REFUSES with the candidates rather than
            // guessing (§CONTEXT-DATA-HONESTY).
            const allRooms = roomStore.getAll?.() ?? [];
            const numbered = matchRoomsByNumber(scope.roomRef, allRooms);
            if (numbered.kind === 'ambiguous') {
                return { error: numbered.error };
            }
            const byName = numbered.rooms.length > 0
                ? numbered.rooms
                : roomStore.findByName?.(scope.roomRef) ?? [];
            const rooms = byName.length > 0
                ? byName
                : roomStore.findByOccupancy?.([scope.roomRef.replace(/\s+/g, '-')]) ?? [];
            if (rooms.length === 0) {
                // The refusal names rooms by NUMBER — the column that is unique
                // and the one the user can retype unambiguously.
                const labels = allRooms
                    .map((r) => describeRoomRow(r))
                    .filter((n) => n.length > 0)
                    .slice(0, 8);
                return {
                    error: labels.length === 0
                        ? `There are no rooms in this project yet — detect rooms first.`
                        : `I can't find a room "${scope.roomRef}". The rooms here are: ${labels.join(', ')}.`,
                };
            }
            const kind = scope.elementKind ?? 'wall';
            if (kind === 'room') {
                // §FEAT-CHAT-ROOM-OCCUPANCY — the rooms ARE the scope. Every other
                // kind asks "what is INSIDE this room"; a room-use edit targets the
                // room itself, so it must never take the roomQueryService path
                // below (which would return the room's CONTENTS and find no rooms).
                const ids = rooms.map((r) => r.id);
                return {
                    ids,
                    kindCounts: { room: ids.length },
                    skipped: [],
                    diagnostics: [rooms.map((r) => describeRoomRow(r) || r.id).join(' + ')],
                };
            }
            if (kind === 'wall') {
                // GR-10 / C75 §1.4 — `r.boundingWallIds ?? []` made "this room
                // bounds zero walls" and "nobody ever recorded what bounds this
                // room" the same value, and this is a COMMAND SCOPE: the collapse
                // silently acted on a subset of the user's ask. The resolver now
                // REFUSES with both numbers when any matched room is unreadable
                // (resolveRoomWallScope — pure, tested).
                const resolution = resolveRoomWallScope(rooms);
                if (resolution.kind === 'refused') {
                    return { error: resolution.error };
                }
                const ids = resolution.ids;
                return {
                    ids: [...ids],
                    kindCounts: ids.length > 0 ? { wall: ids.length } : {},
                    skipped: [],
                    diagnostics: [rooms.map((r) => r.name ?? r.id).join(' + ')],
                };
            }
            // Non-wall kinds ride roomQueryService.getElementsInRoom (U2.3).
            const rqs = (window as unknown as {
                roomQueryService?: { getElementsInRoom?: (roomId: string) => Array<{ id: string; type: string }> };
            }).roomQueryService;
            if (!rqs?.getElementsInRoom) {
                return { error: `Room contents lookup isn't available here.` };
            }
            const ids = [...new Set(
                rooms.flatMap((r) => rqs.getElementsInRoom!(r.id))
                    .filter((e) => e.type === kind)
                    .map((e) => e.id),
            )];
            return {
                ids,
                kindCounts: ids.length > 0 ? { [kind]: ids.length } : {},
                skipped: [],
                diagnostics: [rooms.map((r) => r.name ?? r.id).join(' + ')],
            };
        }
        if (scope.kind === 'orientation') {
            // ADR-0315 U3 (orientation arm, U3 tail) — exterior walls whose
            // outward normal faces the compass direction, θ-threaded through
            // the U2.1 FacadeOrientationService (true north from the site
            // model; explicit θ wins; failures degrade to 0 with a note).
            const svc = (window as unknown as {
                facadeOrientationService?: {
                    facadesByOrientation?: (
                        levelId: string | undefined,
                        orientation: string,
                    ) => Array<{ wallId: string; isExterior: boolean }>;
                    exteriorWalls?: (levelId?: string) => Array<{ wallId: string }>;
                };
            }).facadeOrientationService;
            if (!svc?.facadesByOrientation) {
                return { error: `Orientation lookup isn't available here — the facade service isn't wired.` };
            }
            const label = ({ N: 'north', E: 'east', S: 'south', W: 'west' } as const)[scope.orientation];
            const hits = svc.facadesByOrientation(undefined, scope.orientation);
            if (hits.length === 0) {
                const anyExterior = (svc.exteriorWalls?.() ?? []).length;
                return {
                    error: anyExterior === 0
                        ? 'No exterior walls could be classified yet — rooms define which walls are exterior, so detect rooms first.'
                        : `No exterior wall faces ${label} here — nothing was changed.`,
                };
            }
            const ids = hits.map((f) => f.wallId);
            return {
                ids,
                kindCounts: { wall: ids.length },
                skipped: [],
                diagnostics: [`${label}-facing exterior`],
            };
        }
        // The selection scope arrives with its U3 consumer.
        return { error: `That scope isn't wired into chat yet.` };
    };

    // ── RAC U8.2 — the FILTER arm ────────────────────────────────────────────
    return (scope) => {
        if (scope.kind !== 'filter') return resolveBase(scope);
        const base = resolveBase(scope.base);
        if (isScopeError(base)) return base;
        return applyFilters(base, scope, typeName);
    };
}

// ─── RAC U8.2 — the filter/spatial resolution service ────────────────────────

/** A stored record, seen as the loose bag the accessors probe. */
type RecordLike = Record<string, unknown> & { id?: unknown };

function num(v: unknown): number | null {
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Property → the ONE honest way to read it off a stored record, per kind.
 *
 * Every entry is either a field that genuinely exists on the record (see
 * WallData / WindowData / DoorData in geometry-wall, RoomData in
 * room-topology) or a DERIVED value with a stated formula. A kind/property
 * pair that has no honest reading returns null, and the caller reports it as
 * a SKIP with a reason — never as 0, because "no recorded area" and "an area
 * of zero" are not the same fact (§CONTEXT-DATA-HONESTY).
 */
const PROPERTY_ACCESSORS: Readonly<
    Record<FilterProperty, (rec: RecordLike, kind: string) => number | null>
> = {
    // Openings have no stored area — width × height is the opening's clear
    // area, which is what "a window larger than 2 m²" means to an architect.
    // Rooms carry a computed net floor area (shoelace on the boundary).
    area: (rec, kind) => {
        if (kind === 'room') {
            const computed = rec['computed'] as { area?: unknown } | undefined;
            return num(computed?.area) ?? num(rec['area']);
        }
        const w = num(rec['width']);
        const h = num(rec['height']);
        return w !== null && h !== null ? w * h : num(rec['area']);
    },
    width: (rec) => num(rec['width']),
    height: (rec, kind) => {
        if (kind === 'room') {
            const boundary = rec['boundary'] as { height?: unknown } | undefined;
            return num(boundary?.height) ?? num(rec['height']);
        }
        return num(rec['height']);
    },
    thickness: (rec) => num(rec['thickness']),
    // Walls store endpoints, not a length — the distance IS the length.
    length: (rec) => {
        const line = rec['baseLine'];
        if (!Array.isArray(line) || line.length < 2) return null;
        const a = line[0] as { x?: unknown; z?: unknown };
        const b = line[1] as { x?: unknown; z?: unknown };
        const ax = num(a?.x); const az = num(a?.z);
        const bx = num(b?.x); const bz = num(b?.z);
        if (ax === null || az === null || bx === null || bz === null) return null;
        return Math.hypot(bx - ax, bz - az);
    },
    sillHeight: (rec) => num(rec['sillHeight']),
};

/** The name a refusal quotes for the extremum holder — the record's own name,
 *  or its system type's catalogue name. Null when the record offers neither;
 *  a label is never invented. */
function recordLabel(
    rec: RecordLike,
    kind: string,
    typeName: (kind: string, ref: string) => string | null,
): string | null {
    const systemTypeId = rec['systemTypeId'];
    if (typeof systemTypeId === 'string' && systemTypeId.length > 0) {
        const named = typeName(kind, systemTypeId);
        if (named !== null) return named;
    }
    const name = rec['name'];
    return typeof name === 'string' && name.length > 0 ? name : null;
}

/** One record read by id — the ids-only path's counterpart. `getById` on the
 *  geometry stores clones ONE record, which is the smallest read that can
 *  answer "how thick is it?"; a `getAll()` walk would clone the project. */
function readRecord(store: unknown, id: string): RecordLike | null {
    const s = store as {
        getById?: (id: string) => unknown;
        get?: (id: string) => unknown;
    } | undefined;
    try {
        const rec = s?.getById?.(id) ?? s?.get?.(id);
        return rec !== undefined && rec !== null ? (rec as RecordLike) : null;
    } catch {
        return null;
    }
}

function passes(value: number, f: PropertyFilter): boolean {
    switch (f.op) {
        case 'gt': return value > f.value;
        case 'lt': return value < f.value;
        case 'gte': return value >= f.value;
        case 'lte': return value <= f.value;
        // A stored double never equals a typed decimal exactly; the tolerance
        // is half a millimetre, the same EPS the level-clash check uses.
        case 'eq': return Math.abs(value - f.value) < 0.0005;
        case 'between': return value >= f.value && value <= (f.upper ?? f.value);
    }
}

/**
 * Evaluate the predicates over a resolved base scope.
 *
 * HONESTY, three ways:
 *  • a record the store cannot produce is SKIPPED ("2 walls could not be read");
 *  • a record missing the property is SKIPPED with the property named ("3
 *    windows have no recorded area") — never counted as 0;
 *  • the extrema over the records that DID carry the property are returned in
 *    `filterStats`, so a zero-match refusal quotes the real model instead of
 *    only saying "no" (U8.3).
 */
function applyFilters(
    base: ScopeResolution,
    scope: FilterScopeDescriptor,
    typeName: (kind: string, ref: string) => string | null,
): ScopeResult {
    const kind = scope.elementKind;
    const store = storeRegistry.getStoreForType(kind);
    if (store === undefined) {
        return { error: `I can't inspect ${kind}s here — the ${kind} store isn't available.` };
    }
    const propertyFilters = scope.filters.filter(
        (f): f is PropertyFilter => f.kind === 'property',
    );
    const typeFilters = scope.filters.filter(
        (f): f is TypeFilter => f.kind === 'type',
    );
    const stats = new Map<FilterProperty, {
        considered: number; missing: number;
        max: number | null; min: number | null;
        maxLabel: string | null; minLabel: string | null;
    }>();
    for (const f of propertyFilters) {
        if (!stats.has(f.property)) {
            stats.set(f.property, {
                considered: 0, missing: 0, max: null, min: null, maxLabel: null, minLabel: null,
            });
        }
    }
    const missingProperty = new Map<FilterProperty, number>();
    let unreadable = 0;
    let typeMismatch = 0;
    const ids: string[] = [];

    for (const id of base.ids) {
        const rec = readRecord(store, id);
        if (rec === null) { unreadable += 1; continue; }
        // Type predicate first — it is exact, and a type mismatch is not a
        // measurement, so it must not pollute the property extrema.
        if (typeFilters.length > 0) {
            const st = rec['systemTypeId'];
            const hit = typeFilters.every((f) => st === f.typeId);
            if (!hit) { typeMismatch += 1; continue; }
        }
        let ok = true;
        for (const f of propertyFilters) {
            const value = PROPERTY_ACCESSORS[f.property](rec, kind);
            if (value === null) {
                missingProperty.set(f.property, (missingProperty.get(f.property) ?? 0) + 1);
                ok = false;
                continue;
            }
            const stat = stats.get(f.property)!;
            stat.considered += 1;
            const label = recordLabel(rec, kind, typeName);
            if (stat.max === null || value > stat.max) { stat.max = value; stat.maxLabel = label; }
            if (stat.min === null || value < stat.min) { stat.min = value; stat.minLabel = label; }
            if (!passes(value, f)) ok = false;
        }
        if (ok) ids.push(id);
    }

    const skipped: ScopeSkip[] = [...base.skipped];
    if (unreadable > 0) {
        skipped.push({
            kind, count: unreadable,
            reason: `could not be read from the ${kind} store`,
        });
    }
    if (typeMismatch > 0) {
        skipped.push({
            kind, count: typeMismatch,
            reason: `are not "${typeFilters.map((f) => f.label).join('" / "')}"`,
        });
    }
    for (const [property, count] of missingProperty) {
        const stat = stats.get(property)!;
        stat.missing = count;
        skipped.push({
            kind, count,
            reason: `no recorded ${FILTER_PROPERTY_NOUN[property]}`,
        });
    }
    const filterStats: FilterStat[] = [...stats.entries()].map(([property, s]) => ({
        property,
        considered: s.considered,
        missing: s.missing,
        max: s.max,
        min: s.min,
        maxLabel: s.maxLabel,
        minLabel: s.minLabel,
    }));
    return {
        ids,
        kindCounts: ids.length > 0 ? { [kind]: ids.length } : {},
        skipped,
        diagnostics: base.diagnostics,
        filterStats,
    };
}

// ─── §GATE-VIS-INTENT (VIS-CLASS, 2026-08-11) — the visibility chat route ────
//
// The compose-root registers `visibility.hide.selection` / `.isolate.selection`
// / `.reveal.all` against the per-view `ViewVisibilityIntentStore`
// (composeRuntime §4d-bis). The handlers only WRITE the store — nothing
// subscribes and re-projects — so this route mirrors SpatialTree's
// write-then-project gesture: dispatch the command (P6), then ask
// `runtime.visibility.applyToScene` to project the recorded intent onto the
// scene. Without the projection the pixels would not change and the reply
// would be a lie.

/** Mirrors `IMPLICIT_MODEL_VIEW_ID` in
 *  `packages/runtime-composer/src/visibilitySceneApplier.ts`. `src/ui` may
 *  import only `@pryzm/runtime-composer/types` (Phase-H lint rule), so the
 *  VALUE cannot be imported here; VisibilityChatRoute.spec pins the literal
 *  against drift. */
const IMPLICIT_MODEL_VIEW_ID = 'view:model';

/** The view id visibility intent is recorded against — the registry's active
 *  view, else the implicit model view (nobody has activated a view yet). */
function activeVisibilityViewId(): string {
    return win().runtime?.viewRegistry?.activeViewId ?? IMPLICIT_MODEL_VIEW_ID;
}

/** §GATE-VIS-READONLY — the read-only question's data, snapshotted for the
 *  resolver. `undefined` = UNREADABLE, which the resolver answers as
 *  unreadable — never as "nothing is hidden" (§CONTEXT-DATA-HONESTY). */
function visibilityIntentSnapshot(): VisibilityIntentSnapshot | undefined {
    const intentStore = win().runtime?.visibility?.intent;
    if (!intentStore || typeof intentStore.get !== 'function') return undefined;
    try {
        const intent = intentStore.get(activeVisibilityViewId());
        const iso = intent.temporaryIsolation;
        const isolationActive = iso !== null && iso.active;
        return {
            hiddenCount: intent.hiddenElementIds.size,
            isolationActive,
            isolationCount: isolationActive ? iso.elementIds.size : 0,
        };
    } catch (err) {
        console.warn('[ZeroTokenChatBridge] visibility intent unreadable:', err);
        return undefined;
    }
}

function collectSceneElementIds(scene: SceneNodeLike, excludeEdges: boolean): string[] {
    const out = new Set<string>();
    scene.traverse?.((node) => {
        const id = node.userData?.id;
        if (id === undefined || id === null) return;
        // The legacy restore handler leaves `role: 'edges'` nodes alone (edge
        // display is its own toggle); reveal-all mirrors that.
        if (excludeEdges && node.userData?.role === 'edges') return;
        out.add(String(id));
    });
    return [...out];
}

/**
 * Dispatch ONE compose-root-registered visibility command, then project the
 * intent onto the scene. Returns a failure sentence, or null on success.
 * Never claims undo: these handlers declare `affectedStores: []` — no patches,
 * no undo entry — and the summaries say so.
 */
async function runVisibilityIntent(
    r: Extract<ZeroTokenResolution, { kind: 'local' }>,
): Promise<string | null> {
    const vis = r.visibility;
    const rt = win().runtime;
    const bus = rt?.bus;
    const applyToScene = rt?.visibility?.applyToScene;
    if (vis === undefined || !bus || typeof applyToScene !== 'function') {
        return 'The visibility system is not ready yet — nothing was changed. Try again in a moment.';
    }
    // Payload per verb, spelled out so the route is readable (and provable —
    // the registry's commandProof reads these literals):
    //   'visibility.hide.selection'    → { elementIds }
    //   'visibility.isolate.selection' → { elementIds } (empty = hide everything, bug #8901)
    //   'visibility.reveal.all'        → {}
    try {
        await bus.executeCommand(
            vis.busCommand,
            vis.busCommand === 'visibility.reveal.all' ? {} : { elementIds: [...vis.elementIds] },
        );
    } catch (err) {
        return `That did not complete — ${vis.busCommand}: ${String((err as Error)?.message ?? err)}. Nothing was changed.`;
    }
    const scene = win().selectionManager?.world?.scene?.three ?? null;
    if (!scene || typeof scene.traverse !== 'function') {
        return 'The visibility intent was recorded, but no scene is open to apply it to — nothing looks different yet.';
    }
    // hide: project exactly the ids just hidden. isolate / reveal-all: project
    // EVERY id-carrying node, because both change the visibility of elements
    // the user did not name ("everything else").
    const ids = vis.busCommand === 'visibility.hide.selection'
        ? [...vis.elementIds]
        : collectSceneElementIds(scene, vis.busCommand === 'visibility.reveal.all');
    applyToScene(scene, ids);
    if (vis.busCommand === 'visibility.reveal.all') {
        // The legacy QueryEngine restore path resets the ViewBrowser's
        // category/level checkboxes through this event; reveal-all restores the
        // same pixels (every projected node reads visible from an emptied
        // intent), so the panel state resets the same way.
        window.dispatchEvent(new CustomEvent('pryzm-visibility-command', {
            detail: { action: 'restore', target: 'all', value: '' },
        }));
    }
    return null;
}

/** Monotonic suffix for minted level ids — see `mintId` below. */
let mintSeq = 0;

/** The minimal read surface `resolveCatalogueRef` needs — every PRYZM type
 *  store already exposes it. Declared structurally so this module does not
 *  import eleven store types to read two methods. */
interface CatalogueReaderLike {
    getById(id: string): { id: string; name: string } | undefined;
    getAll(): Array<{ id: string; name: string }>;
}

/**
 * §FIX-CATALOGUES-NEVER-INJECTED (L-1146) — the GENERIC catalogue channel.
 *
 * One row per family. The lookup runs the ONE `resolveCatalogueRef` ladder
 * (ADR-0314) — exact id → exact name → case-insensitive name → UNAMBIGUOUS
 * word subset, with ambiguity returning null so the caller lists candidates
 * rather than coin-flipping.
 *
 * ⛔ A family appears here ONLY when its store really satisfies the reader
 * contract. `StairTypeStore` is deliberately ABSENT: it exposes `get()` where
 * `resolveCatalogueRef` requires `getById()`, so listing it would declare a
 * capability that cannot resolve — the ElementCapabilities lie this repo has
 * already paid for once (L-1147 tracks the one-method fix).
 */
async function buildCatalogueChannel(): Promise<Record<string, {
    resolve: (ref: string) => { id: string; name: string } | null;
    names: readonly string[];
}> | null> {
    let resolveRef: typeof import('@pryzm/command-registry')['resolveCatalogueRef'];
    try {
        ({ resolveCatalogueRef: resolveRef } = await import('@pryzm/command-registry'));
    } catch (err) {
        console.warn('[ZeroTokenChatBridge] catalogue resolver unavailable:', err);
        return null;
    }
    const w = win() as unknown as Record<string, unknown>;
    // elementKind (as `normalizeElementKind` spells it) → the store, plus the
    // DOMAIN NOISE words a user drops when naming that family's types.
    const SOURCES: ReadonlyArray<readonly [string, unknown, readonly string[]]> = [
        ['slab',    w['slabSystemTypeStore'],    ['slab']],
        ['ceiling', w['ceilingSystemTypeStore'], ['ceiling']],
    ];
    const out: Record<string, {
        resolve: (ref: string) => { id: string; name: string } | null;
        names: readonly string[];
    }> = {};
    for (const [kind, store, noise] of SOURCES) {
        const reader = store as CatalogueReaderLike | undefined;
        // Both methods, or the family is ABSENT. A half-readable store would
        // resolve some refs and silently miss others — worse than no channel.
        if (typeof reader?.getById !== 'function' || typeof reader?.getAll !== 'function') continue;
        let names: readonly string[];
        try {
            names = reader.getAll().map((t) => t.name);
        } catch (err) {
            console.warn(`[ZeroTokenChatBridge] ${kind} type catalogue unreadable:`, err);
            continue;
        }
        out[kind] = {
            resolve: (ref: string) => {
                try {
                    // `spanDomain` stays a BOUNDED constant, never user text (P8).
                    const hit = resolveRef(reader, ref, {
                        domainNoise: noise,
                        spanDomain: 'pryzm.catalogue.chat',
                    });
                    return hit.entry === null ? null : { id: hit.entry.id, name: hit.entry.name };
                } catch (err) {
                    console.warn(`[ZeroTokenChatBridge] ${kind} type ref failed to resolve:`, err);
                    return null;
                }
            },
            names,
        };
    }
    return Object.keys(out).length === 0 ? null : out;
}

async function buildContext(): Promise<ResolverContext> {
    const levels = (win().bimManager?.getLevels?.() ?? []).map((l, i) => ({
        id: l.id,
        name: l.name ?? `Level ${i}`,
        ...(typeof l.elevation === 'number' ? { elevation: l.elevation } : {}),
    }));
    const activeLevelId = resolveActiveLevelId();
    // §FEAT-CHAT-WALL-TYPE — the `wall-system-types` value source, injected.
    // A catalogue that cannot be read is reported as ABSENT (the command then
    // does the resolving and the refusing) rather than as EMPTY, which would
    // make "no such wall type" and "could not read the catalogue" the same
    // sentence — §CONTEXT-DATA-HONESTY.
    let catalogue: Awaited<ReturnType<typeof wallTypeCatalogue>> | null = null;
    try {
        catalogue = await wallTypeCatalogue();
    } catch (err) {
        console.warn('[ZeroTokenChatBridge] wall type catalogue unavailable:', err);
    }
    // §FEAT-WINDOW-TYPE-BATCH — the window twin, from the SAME command-registry
    // resolver the batch command itself uses (one ladder, one vocabulary).
    let windowCatalogue: {
        resolve: (ref: string) => ResolverWallSystemType | null;
        names: readonly string[];
    } | null = null;
    try {
        const { resolveWindowSystemTypeRef, windowSystemTypeNames } = await import('@pryzm/command-registry');
        windowCatalogue = {
            resolve: (ref: string) => {
                const hit = resolveWindowSystemTypeRef(ref);
                return hit === null ? null : { id: hit.id, name: hit.name };
            },
            names: windowSystemTypeNames(),
        };
    } catch (err) {
        console.warn('[ZeroTokenChatBridge] window type catalogue unavailable:', err);
    }
    // §FEAT-DOOR-TYPE-BATCH (RAC U4.3) — the door twin, same one-ladder rule:
    // `resolveDoorSystemTypeRef` is the resolver the batch command itself uses.
    let doorCatalogue: {
        resolve: (ref: string) => ResolverWallSystemType | null;
        names: readonly string[];
    } | null = null;
    try {
        const { resolveDoorSystemTypeRef, doorSystemTypeNames } = await import('@pryzm/command-registry');
        doorCatalogue = {
            resolve: (ref: string) => {
                const hit = resolveDoorSystemTypeRef(ref);
                return hit === null ? null : { id: hit.id, name: hit.name };
            },
            names: doorSystemTypeNames(),
        };
    } catch (err) {
        console.warn('[ZeroTokenChatBridge] door type catalogue unavailable:', err);
    }
    // ── §FIX-CATALOGUES-NEVER-INJECTED (L-1146, C67 §1.8, C84 §4F.1) ────────
    //
    // ⛔ THIS KEY HAD NO PRODUCTION WRITER, AND ITS ABSENCE WAS BEING CITED AS
    // A BLOCKER. `ResolverContext.catalogues` is the GENERIC catalogue channel
    // every new type family is supposed to arrive through — CatalogueFamilies'
    // own header promises "a new family costs ZERO lines in ResolverContext".
    // Measured 2026-08-19: its only writer anywhere in the repository was a
    // TEST, and `buildContext()` — the ONE ResolverContext construction site
    // that exists — never set it. So `set-slab-type` and `set-ceiling-type`
    // BOTH ran the null-lookup fallback (`CatalogueFamilies.ts:209-214`),
    // forwarding the user's RAW STRING and leaving their own declared
    // `mismatchPrefix` / `suggestions` copy as dead code at runtime.
    //
    // ⭐ AND THE COST WAS NOT ONLY THOSE TWO. `element.changeType` — sixteen
    // live family branches — sat in ChatCommandClassification's Class B under
    // `blockedBy: 'catalogue value-source injection'`, i.e. blocked on THIS
    // KEY. Eleven families were dark waiting for the lines below (C84 §4F.1).
    //
    // WHY A GENERIC HELPER AND NOT THREE MORE NAMED FIELDS. wall/window/door
    // each cost a bespoke pair of `ResolverContext` fields; that is the
    // scaling wall this channel was introduced to remove. A family now costs
    // ONE ROW in the table below.
    //
    // HONESTY, the same discipline as the wall catalogue above: a store that
    // cannot be read is reported ABSENT (key omitted ⇒ the command resolves
    // and refuses, exactly as today), never EMPTY — which would make "no such
    // type" and "could not read the catalogue" the same sentence
    // (§CONTEXT-DATA-HONESTY: failure and emptiness are the same value).
    const catalogues = await buildCatalogueChannel();
    // §GATE-VIS-READONLY — the read-only visibility question's data. Absence
    // means UNREADABLE and the answer says so.
    const visibility = visibilityIntentSnapshot();
    // §L-905 — the rooms snapshot (id / name / roomNumber / levelId) the
    // set-room-occupancy spec reads to make the LABEL follow the use: an
    // auto-default `Room 00-003` renames to `Bedroom 01` in the same command,
    // an authored name is kept and said so (roomAutoLabel.ts owns the decision,
    // pure). Read off the SAME legacy store the room arm resolves against.
    // Unreadable ⇒ omitted ⇒ the capability degrades to occupancy-only —
    // never a rename claimed on data nobody read (§CONTEXT-DATA-HONESTY).
    let roomsSnapshot: readonly { id: string; name?: string; roomNumber?: string; levelId?: string; areaM2?: number }[] | null = null;
    try {
        const roomStore = storeRegistry.getStoreForType('room') as unknown as {
            getAll?: () => Array<{
                id: string; name?: string; roomNumber?: string; levelId?: string;
                computed?: { area?: number };
            }>;
        } | undefined;
        const all = roomStore?.getAll?.();
        if (Array.isArray(all)) {
            roomsSnapshot = all.map((r) => ({
                id: r.id,
                ...(typeof r.name === 'string' ? { name: r.name } : {}),
                ...(typeof r.roomNumber === 'string' ? { roomNumber: r.roomNumber } : {}),
                ...(typeof r.levelId === 'string' ? { levelId: r.levelId } : {}),
                // §RAC-APARTMENT-IN-ROOM (L-1644) — the room's computed net area
                // (m²) so the apartment Confirm card can name it. Absent when the
                // store does not carry it — the copy then omits the area rather
                // than inventing one.
                ...(typeof r.computed?.area === 'number' ? { areaM2: r.computed.area } : {}),
            }));
        }
    } catch (err) {
        console.warn('[ZeroTokenChatBridge] rooms snapshot unavailable (label follow-through off):', err);
    }
    return {
        selection: currentSelection(),
        levels,
        ...(roomsSnapshot !== null ? { rooms: roomsSnapshot } : {}),
        ...(activeLevelId !== undefined ? { activeLevelId } : {}),
        ...(visibility !== undefined ? { visibility } : {}),
        ...(catalogue !== null
            ? { resolveWallSystemType: catalogue.resolve, wallSystemTypeNames: catalogue.names }
            : {}),
        ...(windowCatalogue !== null
            ? { resolveWindowSystemType: windowCatalogue.resolve, windowSystemTypeNames: windowCatalogue.names }
            : {}),
        ...(doorCatalogue !== null
            ? { resolveDoorSystemType: doorCatalogue.resolve, doorSystemTypeNames: doorCatalogue.names }
            : {}),
        // §FIX-CATALOGUES-NEVER-INJECTED (L-1146) — the generic channel. Omitted
        // entirely when NOTHING was readable, so the absent case is byte-for-byte
        // today's behaviour and this change can only add resolution, never remove it.
        ...(catalogues !== null ? { catalogues } : {}),
        // level.add call-site convention (ProjectTreeSection): `L${Date.now()}`.
        // §PLAN (RAC U6) — plus a per-call counter, because a plan can mint two
        // levels inside the same millisecond ("add a level at 9 m, then add one
        // at 12 m") and `Date.now()` alone would hand both the SAME id.
        mintId: () => `L${Date.now()}-${++mintSeq}`,
        // ADR-0315 U3.2 — the injected scope resolver (all five base arms plus
        // the RAC U8 filter arm). The type NAMER it takes is the SAME
        // catalogue lookup the value stage uses (`resolveWallSystemTypeRef` &
        // co, id-first), so the name a refusal quotes for the extremum holder
        // is the name the project actually stores — never a second table.
        resolveScope: makeScopeResolver(levels, (kind, ref) => {
            const cat = kind === 'window' ? windowCatalogue
                : kind === 'door' ? doorCatalogue
                    : kind === 'wall' ? catalogue
                        : null;
            return cat?.resolve(ref)?.name ?? null;
        }),
    };
}

// ─── UI hooks the panel provides ─────────────────────────────────────────────

export interface ZeroTokenUiHooks {
    /** Append an assistant bubble to the transcript. */
    say(text: string): void;
    /** Render an inline Confirm/Cancel card; resolves true only on Confirm. */
    confirm(summary: string): Promise<boolean>;
}

// ─── Execution ───────────────────────────────────────────────────────────────

/**
 * What ONE dispatched slice of commands really did — the engines' own words
 * when they sent a report, and WHICH of the five distinguishable states they
 * ended in. Shared by the single-intent path and the §PLAN step loop so both
 * read the same events and neither can invent a line the engines did not say.
 *
 * ─── §FIX-REPORT-PAYLOAD-DISCARD (W2-B) — why this became a union ───────────
 * This used to be `{ ok: boolean; lines: string[]; dispatchFailed: boolean }`,
 * and it had NO WAY TO SAY "the command promised a report and sent none". That
 * state was encoded as `{ ok: true, lines: [] }` — i.e. as SUCCESS — so a
 * command whose bridge could not reach `window.commandManager`, or whose bridge
 * threw and only `console.error`d, rendered in the transcript as
 *
 *     "Run furniture on every qualifying room on Level 0 … Done — undo with
 *      Ctrl+Z. (resolved without AI tokens)"
 *
 * over a model nothing had touched. FAILURE AND EMPTINESS WERE THE SAME VALUE,
 * and the layer picked the flattering one. `'indeterminate'` is that missing
 * state; it is a first-class member of the union so no branch can forget it.
 *
 * `'partial'` is the second thing the old shape could not hold: `executeSlice`
 * reported ANY rejected command as a TOTAL failure, and read only
 * `batchReports[0]`, discarding every later report. A slice where one command
 * retyped 40 walls and another refused is neither a success nor a failure.
 *
 * C68 §5.g governs the copy each arm renders; C03 §4 governs CommandResult as
 * the payload being carried.
 */
export type DispatchOutcome =
    /** Every command that reported, reported success. */
    | { readonly kind: 'applied'; readonly lines: readonly string[] }
    /** Some of the slice landed and some did not — BOTH halves are reported. */
    | { readonly kind: 'partial'; readonly lines: readonly string[]; readonly failedLines: readonly string[] }
    /** The engines RAN and reported that they changed nothing, with reasons. */
    | { readonly kind: 'refused'; readonly lines: readonly string[] }
    /** The BUS rejected every command — it never reached an engine at all. */
    | { readonly kind: 'dispatch-failed'; readonly lines: readonly string[] }
    /** A report was PROMISED and did not arrive (unreachable sink, bridge
     *  threw, stage timed out). Nothing about the model is confirmed. */
    | { readonly kind: 'indeterminate'; readonly lines: readonly string[] };

/** One `{success, info}` report as broadcast by a batch bridge or the
 *  room-finish seam, plus the two fields W2-B added so an engine that knows
 *  more than a boolean can say so. */
export interface DispatchReport {
    readonly success: boolean;
    readonly info: readonly string[];
    /** The engine's OWN verdict when it has one. Absent ⇒ derived from
     *  `success`, which is all the older bridges send. */
    readonly outcome?: 'applied' | 'partial' | 'refused' | 'indeterminate';
    /** Lines the engine could NOT confirm — a timed-out chain stage, a sink it
     *  could not reach. Never folded into `info`: an unconfirmed stage is not a
     *  reported one. */
    readonly unconfirmed?: readonly string[];
}

/** Everything observed about one dispatched slice. Kept as data so the
 *  classification is a PURE function with its own tests, rather than five
 *  interleaved early-returns inside an async listener dance. */
export interface DispatchEvidence {
    readonly reports: readonly DispatchReport[];
    /** Bus rejections, one line each, already carrying the command type. */
    readonly failures: readonly string[];
    /**
     * True when at least one dispatched command has a declared report event —
     * i.e. a report was PROMISED. This is the load-bearing distinction: a
     * command with no report event (e.g. `wall.updateDimensions`) sending no
     * report is EXPECTED, while `element.deleteBatch` sending none is a hole.
     * Without it, "silent by design" and "silently lost" would once again be
     * the same value.
     */
    readonly expectsReport: boolean;
    readonly commandCount: number;
}

/**
 * Map the observed evidence onto exactly one `DispatchOutcome`.
 *
 * Exported because it is the whole contract of this task and it is pinned
 * directly by `__tests__/ReportPayloadHonesty.spec.ts` — the multi-command
 * states (a partial dispatch, a second report arriving after the first) cannot
 * be reached through a single chat sentence, and an untestable classifier is
 * how the old one stayed wrong.
 */
export function classifyDispatch(ev: DispatchEvidence): DispatchOutcome {
    // Nothing reached an engine: the bus rejected the lot.
    if (ev.failures.length > 0 && ev.failures.length >= ev.commandCount) {
        return { kind: 'dispatch-failed', lines: [`the model refused: ${ev.failures.join('; ')}`] };
    }

    const verdictOf = (r: DispatchReport): NonNullable<DispatchReport['outcome']> =>
        r.outcome ?? (r.success ? 'applied' : 'refused');

    const landed: string[] = [];
    const notLanded: string[] = [];
    let appliedCount = 0;
    let refusedCount = 0;
    let indeterminateCount = 0;
    for (const r of ev.reports) {
        const v = verdictOf(r);
        if (v === 'applied') { appliedCount++; landed.push(...r.info); }
        else if (v === 'refused') { refusedCount++; notLanded.push(...r.info); }
        else if (v === 'indeterminate') { indeterminateCount++; notLanded.push(...r.info); }
        else { appliedCount++; refusedCount++; landed.push(...r.info); }   // 'partial'
        notLanded.push(...(r.unconfirmed ?? []));
    }
    // A rejected command is something that did NOT land, and it is reported
    // alongside the reports of the ones that did — never in place of them.
    notLanded.push(...ev.failures);

    if (ev.reports.length === 0) {
        if (ev.failures.length > 0) {
            return { kind: 'partial', lines: [], failedLines: [...ev.failures] };
        }
        // The §CONTEXT-DATA-HONESTY split: promised-and-absent ≠ never promised.
        return ev.expectsReport
            ? {
                kind: 'indeterminate',
                lines: ['the command was dispatched and sent no report back'],
            }
            : { kind: 'applied', lines: [] };
    }

    if (indeterminateCount === ev.reports.length && ev.failures.length === 0) {
        return { kind: 'indeterminate', lines: notLanded };
    }
    if (ev.failures.length === 0 && refusedCount === 0 && indeterminateCount === 0) {
        return { kind: 'applied', lines: landed };
    }
    if (ev.failures.length === 0 && appliedCount === 0) {
        return { kind: 'refused', lines: notLanded };
    }
    return { kind: 'partial', lines: landed, failedLines: notLanded };
}

async function dispatchCommands(
    r: Extract<ZeroTokenResolution, { kind: 'commands' }>,
    ctx: ResolverContext,
    hooks: ZeroTokenUiHooks,
): Promise<void> {
    const bus = win().runtime?.bus;
    if (!bus) {
        hooks.say('The command system is not ready yet — nothing was changed. Try again in a moment.');
        return;
    }
    // §PLAN (RAC U6) — a compound sentence: ONE Confirm card for the whole
    // plan, then one ordered dispatch pass. Its own function, because the step
    // boundaries and the stop-on-failure reporting are the whole point.
    if (r.plan !== undefined) {
        await dispatchPlan(r, r.plan, ctx, hooks);
        return;
    }
    if (r.destructive) {
        const ok = await hooks.confirm(r.summary);
        if (!ok) {
            hooks.say('Cancelled — nothing was changed.');
            return;
        }
    }
    const outcome = await executeSlice(r.commands, r.intent, r.tier, ctx, bus);
    // §FIX-REPORT-PAYLOAD-DISCARD (W2-B) — five states, five sentences. The
    // switch is exhaustive over the union on purpose: adding a sixth engine
    // state must break the build here rather than fall through to "Done".
    switch (outcome.kind) {
        case 'dispatch-failed':
            hooks.say(`That did not complete — ${outcome.lines.join('; ')}`);
            return;
        case 'refused':
            hooks.say(`Nothing was changed — ${outcome.lines.join(' · ')}`);
            return;
        case 'partial':
            hooks.say(
                `Partly done — ${outcome.lines.join(' · ')}. ` +
                `What did NOT run: ${outcome.failedLines.join(' · ')}. ` +
                `What ran is real and undoable with Ctrl+Z; the rest was not attempted again.`,
            );
            return;
        case 'indeterminate':
            // NEVER "Done". A command that promised a report and sent none has
            // told us nothing about the model, and saying "Done" here is the
            // exact lie this task exists to remove.
            hooks.say(
                `I can't tell you what happened — ${outcome.lines.join(' · ')}. ` +
                `No report came back, so nothing here is confirmed: check the model before ` +
                `assuming it ran, and Ctrl+Z if something did change.`,
            );
            return;
        case 'applied':
            break;
    }
    if (outcome.lines.length > 0) {
        hooks.say(`${outcome.lines.join(' · ')}. Undo with Ctrl+Z. (resolved without AI tokens)`);
        return;
    }
    // §GEN-OFFER (RAC U5c.3) — the duplicate-level follow-up. DuplicateFloorPlan
    // deliberately clones walls/openings/slabs/columns/furniture and NOT rooms,
    // ceilings or lighting, so the new floor arrives unfinished by design. The
    // useful next step is obvious, and offering it in one line is worth far more
    // than making the user re-derive it — but it stays an OFFER. Finishing the
    // level automatically would be a mutation nobody asked for, on the one
    // command whose contract is "duplicate, and nothing else".
    if (r.intent === 'duplicate-level') {
        const ids = r.commands[0]?.payload['targetLevelIds'];
        const names = Array.isArray(ids)
            ? ids.map((id) => ctx.levels.find((l) => l.id === id)?.name ?? String(id))
            : [];
        const subject = names.length === 0
            ? 'The duplicated level'
            : names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]!}`;
        offerFinishChain();
        hooks.say(
            `${r.summary}. Done — undo with Ctrl+Z. (resolved without AI tokens) ` +
            `${subject} ${names.length > 1 ? 'have' : 'has'} walls, doors, windows, slabs, columns and furniture, ` +
            `but no rooms, ceilings or lighting — that is what duplication copies. ` +
            `Re-detect rooms and finish ${names.length > 1 ? 'them' : 'it'}? Say "yes" and I'll run ceilings, ` +
            `floor finishes, furniture and lighting on the active level.`,
        );
        return;
    }
    // ADR-0314 honesty: runBatch is undo-NEUTRAL, so N commands are N undo
    // steps — say so instead of implying one.
    const undoHint = r.commands.length > 1
        ? `undo with Ctrl+Z (${r.commands.length} steps)`
        : 'undo with Ctrl+Z';
    hooks.say(`${r.summary}. Done — ${undoHint}. (resolved without AI tokens)`);
}

// §CONTEXT-DATA-HONESTY — the batch commands report partial failure
// ("Changed 12 of 40 walls — 28 skipped: 28× a raked wall cannot take a
// layered type") on a CustomEvent rather than in the bus result. The generic
// "Done" line would hide exactly the information the founder needs, so when a
// report arrives it REPLACES that line.
// ADR-0314 — one command→event table instead of a per-command listener.
// §FIX-SIDEFINISH-REPORT-UNHEARD (L-996) — EXPORTED so the completeness guard can
// read it. A table that decides whether the chat tells the truth, and that nothing
// could enumerate, is how `wall.setSideFinishBatch` sat unsubscribed since it shipped.
export const BATCH_REPORT_EVENTS: Readonly<Record<string, string>> = {
        'wall.updateSystemTypeBatch': 'pryzm-wall-type-batch-report',
        'wall.updateColorBatch': 'pryzm-wall-color-batch-report',
        // §FIX-SIDEFINISH-REPORT-UNHEARD (L-996) — §FEAT-WALL-SIDE-FINISH.
        //
        // ⚠ THIS ROW'S ABSENCE IS THE SECOND HALF OF THE FOUNDER'S FALSE "Done".
        // `SetWallSideFinishBatchHandler` has ALWAYS emitted
        // `pryzm-wall-side-finish-batch-report` — carrying the command's real
        // "Set the interior finish … on N of M walls — K skipped", the grouped
        // refusal reasons, the §L960-STEP3 masked-in-3D caveat, and the
        // `outcome:'indeterminate'` payload for a bridge that never ran. Nothing
        // subscribed. `reportEvents` was therefore empty, `expectsReport` was
        // FALSE, and `classifyDispatch` returned `{kind:'applied', lines:[]}` —
        // the branch that prints the resolver's PLANNED summary followed by
        // "Done — undo with Ctrl+Z". So the transcript said
        // *"Set the interior finish of all 17 walls on Ground to Wood · Oak
        // (Light). Done"* whether the command changed 17 walls, 0 walls, or was
        // never reached at all. FAILURE AND EMPTINESS WERE THE SAME VALUE — the
        // exact defect the union above was built to remove, escaping through a
        // missing table row rather than through a missing state.
        'wall.setSideFinishBatch': 'pryzm-wall-side-finish-batch-report',
        // §FEAT-FLOOR-SURFACE-FINISH (L-1881) — the floor twin. Registered in the
        // SAME breath as the handler that broadcasts it: L-996 exists because a
        // handler shipped its real report onto an event nobody subscribed to, and
        // `executeSlice` then printed the resolver's PLANNED summary plus "Done"
        // for 17-of-17, 0-of-17 and never-ran alike. `batchReportEventsCompleteness`
        // derives the required key set from the handlers themselves and goes RED if
        // this row is missing.
        'floor.setFinishBatch': 'pryzm-floor-finish-batch-report',
        // §FIX-SIDEFINISH-REPORT-UNHEARD (L-996) — the same omission, measured
        // across the whole table rather than patched for the one verb the founder
        // hit. `slab.updateSystemTypeBatch` and `ceiling.updateSystemTypeBatch`
        // both export a report event and both were unsubscribed, so both printed
        // the canned "Done" over whatever they actually did. Pinned by
        // `batchReportEventsCompleteness.spec.ts`, which enumerates the exported
        // `*_REPORT_EVENT` constants and fails on any that this table omits.
        'slab.updateSystemTypeBatch': 'pryzm-slab-type-batch-report',
        'ceiling.updateSystemTypeBatch': 'pryzm-ceiling-type-batch-report',
        // §FEAT-WALL-RAKE-BATCH — "Raked N of M — K skipped: <reason>" from the
        // batch command's rakeAuthorability pass.
        'wall.updateRakeBatch': 'pryzm-wall-rake-batch-report',
        // §FEAT-WINDOW-TYPE-BATCH — "Retyped N of M — K skipped".
        'window.updateSystemTypeBatch': 'pryzm-window-type-batch-report',
        // §FEAT-DOOR-TYPE-BATCH (RAC U4.3) — the door twin's honest report.
        'door.updateSystemTypeBatch': 'pryzm-door-type-batch-report',
        // §FEAT-WALL-LAYER-ADD-BATCH — "Added … to N of M walls — K skipped".
        'wall.addLayerBatch': 'pryzm-wall-layer-batch-report',
        // §FEAT-WINDOW-PARAMETRIC-CREATE — "Created N of M planned — K skipped".
        'window.parametricCreate': 'pryzm-window-parametric-report',
        // §FEAT-SCOPED-DELETE (RAC U9.2) — "Deleted 40 of 42 furniture items
        // (plus 6 hosted/child elements) — 2 skipped: …". The cascade count is
        // reported SEPARATELY from the N-of-M the user agreed to on the Confirm
        // card, because folding them together would overstate the ask.
        'element.deleteBatch': 'pryzm-delete-batch-report',
        // §FEAT-BULK-DIMENSIONS (L-949) — "Changed 38 of 42 windows (height 2 m)
        // — 4 skipped · 4x window not found". Without this row the generic
        // "Done" line would hide exactly the information the founder needs, and
        // a bridge that never reported would read as success
        // (§FIX-REPORT-PAYLOAD-DISCARD).
        'element.updateDimensionsBatch': 'pryzm-dimensions-batch-report',
        // The wall family rides the verb that shipped in VERBS-CMD and has been
        // dead for want of a grammar ever since; its report event already
        // existed, only nothing could reach it.
        'wall.updateHeightBatch': 'pryzm-wall-height-batch-report',
        // §FEAT-RHINO-CHAT-MATERIAL — the Rhino bridge reports mesh counts and
        // the honest "no Rhino model is imported" failure through this event.
        'rhino.setMaterial': 'pryzm-rhino-material-report',
        'rhino.resetMaterial': 'pryzm-rhino-material-report',
        // §GEN-CHAT (RAC U5b.4) — ENGINE HONESTY for whole-building and
        // whole-plan generation. The generators already know far more than
        // "Done": how many floors and apartments they actually placed and what
        // share of the plate that is, how many scored layouts they compared,
        // how many desks fitted, which apartment cells the packer REJECTED and
        // its own most-common reason — and, when they refuse,
        // §GEN-MAXHEIGHT-GATE's two heights and §RESI-ZERO-APARTMENTS-REFUSE's
        // reason. All of that reaches the transcript through this same
        // event/`{success, info}` mechanism the batch commands use, so a
        // refusal renders as "Nothing was changed — <the engine's words>" and
        // can never read like a successful build.
        'generation.building': 'pryzm-generation-report',
        'generation.apartment': 'pryzm-generation-report',
        // §GEN-ROOMS / §GEN-CHAIN (RAC U5c) — the room-scale engines and the
        // finishing chain relay their OWN per-stage counts through the same
        // event: "Ceilings 24/24 · Furniture 22/24 — 2 rooms skipped: <the
        // engine's reason> · Lighting 24/24". A stage that never reported
        // within its budget says so rather than being quietly dropped.
    'generation.rooms': 'pryzm-generation-report',
    'generation.finish-chain': 'pryzm-generation-report',
};

/** The bus surface this module dispatches through (P6). */
type ChatBus = { executeCommand(type: string, payload: unknown): Promise<unknown> };

/**
 * Dispatch ONE slice of commands and read back what the engines said.
 *
 * Extracted for §PLAN (RAC U6): a plan is dispatched step by step, and each
 * step must be judged on its OWN outcome so the plan can stop where it fails
 * and say how far it got. The single-intent path and the plan loop therefore
 * share one executor — a second dispatch path would be exactly the duplication
 * the whole phase exists to avoid.
 *
 * A slice FAILS when the bus rejects OR when the engine's own report says
 * `success:false` — an engine refusal ("no closed shell on this level") must
 * never read like a success, and inside a plan it must stop the sequence.
 *
 * Sequencing across async engines needs no new machinery: the `generation.*`
 * handlers await their seam, which awaits the engines' own `*.layout-executed`
 * events under the shipped §CHAIN-TIMEOUT budgets and emits the report BEFORE
 * resolving. Awaiting `executeCommand` is therefore already awaiting the run.
 */
async function executeSlice(
    commands: readonly { type: string; payload: Record<string, unknown> }[],
    intent: string,
    tier: 0 | 1 | 'nl',
    ctx: ResolverContext,
    bus: ChatBus,
): Promise<DispatchOutcome> {
    // Collected into an ARRAY, not a `let`: the listener assigns from inside a
    // closure, which TypeScript's control-flow analysis cannot see.
    // W2-B: EVERY report is kept. This list used to be read as `batchReports[0]`,
    // so in a multi-command slice the second engine's refusal was discarded by
    // the first engine's success.
    const batchReports: DispatchReport[] = [];
    const onBatchReport = (e: Event): void => {
        const detail = (e as CustomEvent).detail as {
            success?: boolean;
            info?: string[];
            outcome?: DispatchReport['outcome'];
            unconfirmed?: string[];
        } | undefined;
        if (detail) {
            batchReports.push({
                success: detail.success ?? false,
                info: detail.info ?? [],
                ...(detail.outcome !== undefined ? { outcome: detail.outcome } : {}),
                ...(detail.unconfirmed !== undefined ? { unconfirmed: detail.unconfirmed } : {}),
            });
        }
    };
    const reportEvents = [...new Set(
        commands.map((c) => BATCH_REPORT_EVENTS[c.type]).filter((ev): ev is string => ev !== undefined),
    )];
    for (const ev of reportEvents) window.addEventListener(ev, onBatchReport);

    const failures: string[] = [];
    await withChatDispatchSpan(async () => {
        if (commands.length > 1) {
            // The EVENT/geometry-storm gate — NOT an undo coalescer
            // (ADR-0314: runBatch is undo-neutral, and every summary says so).
            const results: Promise<unknown>[] = [];
            batchCoordinator.runBatch(() => {
                for (const c of commands) {
                    results.push(bus.executeCommand(c.type, c.payload));
                }
            }, {
                levelIds: ctx.activeLevelId !== undefined ? [ctx.activeLevelId] : [],
                totalElementCount: commands.length,
            });
            const settled = await Promise.allSettled(results);
            settled.forEach((s, i) => {
                if (s.status === 'rejected') {
                    failures.push(`${commands[i]!.type}: ${String((s.reason as Error)?.message ?? s.reason)}`);
                }
            });
        } else {
            const c = commands[0]!;
            try {
                await bus.executeCommand(c.type, c.payload);
            } catch (err) {
                failures.push(`${c.type}: ${String((err as Error)?.message ?? err)}`);
            }
        }
    }, { 'pryzm.ai.chat.intent': intent, 'pryzm.ai.chat.tier': tier });

    for (const ev of reportEvents) window.removeEventListener(ev, onBatchReport);

    // W2-B — ALL the evidence, classified in ONE pure place. The three lines
    // that used to stand here collapsed a partial dispatch into a total failure,
    // discarded every report after the first, and reported "no report at all"
    // as `{ ok: true }`.
    return classifyDispatch({
        reports: batchReports,
        failures,
        // A report is only MISSING if one was promised. `reportEvents` is
        // derived from BATCH_REPORT_EVENTS, the table of commands that broadcast.
        expectsReport: reportEvents.length > 0,
        commandCount: commands.length,
    });
}

/**
 * §PLAN (RAC U6.2/U6.3) — one Confirm card for the whole plan, then one
 * ordered dispatch pass.
 *
 * The card enumerates the steps IN ORDER with each step's own summary, states
 * the real undo cost (U6.3 — never "one undo" for a multi-command plan), and
 * carries any honest caveat the resolver attached. It is shown for EVERY plan,
 * destructive or not: a sentence that sequences several mutations is a bigger
 * commitment than any of its parts, and reading the steps back is the only way
 * the user can tell the plan matched what he meant.
 *
 * On confirm the steps run in order through the SAME dispatch path a single
 * sentence uses. A step that fails at EXECUTION stops the plan and the reply
 * says how far it got and what refused — nothing after a failure is attempted,
 * and nothing before it is silently rolled back (it happened; the undo cost
 * line says how to reverse it).
 */
async function dispatchPlan(
    r: Extract<ZeroTokenResolution, { kind: 'commands' }>,
    plan: PlanReport,
    ctx: ResolverContext,
    hooks: ZeroTokenUiHooks,
): Promise<void> {
    const bus = win().runtime?.bus;
    if (!bus) {
        hooks.say('The command system is not ready yet — nothing was changed. Try again in a moment.');
        return;
    }
    const card = [
        `${plan.steps.length} steps, in this order:`,
        ...plan.steps.map((s) => `${s.index}. ${s.summary}`),
        ...plan.notes,
        `Undo cost: ${plan.undoCost}.`,
        r.destructive
            ? 'At least one step creates or replaces real geometry. Run the whole plan?'
            : 'Run the whole plan?',
    ].join('\n');
    if (!await hooks.confirm(card)) {
        hooks.say('Cancelled — nothing was changed.');
        return;
    }

    const done: string[] = [];
    let offset = 0;
    for (const step of plan.steps) {
        const slice = r.commands.slice(offset, offset + step.commandCount);
        offset += step.commandCount;
        // Awaited IN SEQUENCE on purpose: the plan is an ordered sequence, and
        // step N+1 must see the model step N left behind.
        const outcome = await executeSlice(slice, step.intent, r.tier, ctx, bus);
        // W2-B — a step is only "done" when it APPLIED. An indeterminate step
        // stops the plan too: step N+1 must see the model step N left behind,
        // and an unreported step means nobody knows what that is. Sequencing
        // onto an unknown state is how a plan silently compounds a mistake.
        if (outcome.kind !== 'applied') {
            const notRun = plan.steps.filter((s) => s.index > step.index);
            const verdict = outcome.kind === 'indeterminate'
                ? 'is unaccounted for'
                : outcome.kind === 'partial' ? 'only partly ran' : 'refused';
            const why = outcome.kind === 'partial'
                ? `${outcome.lines.join(' · ')}; but ${outcome.failedLines.join(' · ')}`
                : outcome.kind === 'indeterminate'
                    ? `${outcome.lines.join(' · ')} — nothing about it is confirmed`
                    : outcome.lines.join(' · ');
            hooks.say(
                `${done.length > 0 ? `${done.join(' ')} ` : ''}` +
                `Step ${step.index} ${verdict} — ${why}; nothing after it ran` +
                `${notRun.length > 0 ? ` (step${notRun.length > 1 ? 's' : ''} ${notRun.map((s) => s.index).join(', ')} not attempted)` : ''}. ` +
                `${done.length > 0 ? `What did run is undoable: ${plan.undoCost.replace(/^\d+ steps?[^—]*— /, '')}.` : 'Nothing was changed.'}`,
            );
            return;
        }
        done.push(
            `Step ${step.index} done — ${outcome.lines.length > 0 ? outcome.lines.join(' · ') : step.summary}.`,
        );
    }
    hooks.say(`${done.join(' ')} ${plan.undoCost}. (resolved without AI tokens)`);
}

async function runLocal(
    r: Extract<ZeroTokenResolution, { kind: 'local' }>,
    hooks: ZeroTokenUiHooks,
): Promise<void> {
    let failText: string | null = null;
    await withChatDispatchSpan(async () => {
        switch (r.action) {
            // §FLOOR-FINISH-REFUSAL-HONESTY sweep — these two DISCARDED their
            // result and then fell through to `${r.summary}. (resolved without AI
            // tokens)`, i.e. "Undo the last change." with an empty history and
            // nothing undone. `performUndo` stopped returning `void` precisely so
            // this could not happen: its own doc says "'nothing to undo', 'I
            // reverted something' and 'an entry is pending and I could NOT revert
            // it' are no longer the same value" — and this caller made them the
            // same value again by ignoring it.
            case 'undo': {
                const m = await import('../../engine/undo/performUndoRedo.js');
                const out = m.performUndo();
                if (out.status === 'nothing-to-undo') {
                    failText = 'There is nothing to undo — nothing was changed.';
                } else if (out.status === 'stranded') {
                    failText =
                        `I could NOT undo that: ${out.reason}. Nothing was changed — ` +
                        `the change is still pending in the history.`;
                } else if (out.status === 'error') {
                    failText = `Undo failed: ${out.reason}. Nothing was changed.`;
                }
                break;
            }
            case 'redo': {
                const m = await import('../../engine/undo/performUndoRedo.js');
                const out = m.performRedo();
                if (out.status === 'nothing-to-redo') {
                    failText = 'There is nothing to redo — nothing was changed.';
                } else if (out.status === 'stranded') {
                    failText =
                        `I could NOT redo that: ${out.reason}. Nothing was changed — ` +
                        `the change is still pending in the history.`;
                } else if (out.status === 'error') {
                    failText = `Redo failed: ${out.reason}. Nothing was changed.`;
                }
                break;
            }
            case 'setActiveLevel': {
                // Same sweep: an absent `levelId`, or a shell with no
                // `projectContext`, moved nothing — and still reported the
                // resolver's "Switch to <level>" summary as if it had.
                if (r.levelId === undefined) {
                    failText = 'I could not tell which level to switch to — the active level is unchanged.';
                    break;
                }
                const w = win();
                if (!w.projectContext) {
                    failText = 'The project is not open yet, so the active level was not changed.';
                    break;
                }
                w.projectContext.activeLevelId = r.levelId;
                w.runtime?.events?.emit('pryzm-active-level-changed', { levelId: r.levelId });
                break;
            }
            // §GATE-VIS-INTENT — dispatch + project (see runVisibilityIntent).
            case 'applyVisibilityIntent': {
                failText = await runVisibilityIntent(r);
                break;
            }
            // §FEAT-CHAT-TOOL-ACTIVATION (L-906) — "create a bed" activates the
            // SAME placement tool the palette button activates, mouse preview
            // and all. `chatPlacementActivation` resolves the raw noun against
            // the element-creation matrix + the furniture catalogue through
            // the ONE resolveCatalogueRef ladder, then activates via the
            // palette's own seams (`runtime.tools.activate` /
            // `activateFurnitureItem`). Its return is ALWAYS the reply —
            // activated / ambiguity-ASK naming candidates / no-match naming
            // the nearest items / not-ready — so the resolver's bare summary
            // ("Activate X placement") is never rendered as if something
            // happened when it did not (C83 §4.3: nothing is created until
            // the user clicks; activation mutates no store, so there is
            // nothing to undo until they place).
            case 'activateTool': {
                const m = await import('./chatPlacementActivation.js');
                // §FEAT-RAC-STAIR-SHAPE (L-1541) — the shape axis and the
                // un-honoured-clause note ride the SAME placement dispatch;
                // both are optional, so `create a bed` is byte-for-byte the
                // call it was before this change.
                failText = m.activatePlacementFromChat(r.placement?.itemRef ?? '', {
                    ...(r.placement?.stairShape !== undefined
                        ? { stairShape: r.placement.stairShape }
                        : {}),
                    ...(r.placement?.unhonouredNote !== undefined
                        ? { unhonouredNote: r.placement.unhonouredNote }
                        : {}),
                });
                break;
            }
            // §GATE-QUERYENGINE-READ-ONLY — the summary IS the answer; nothing
            // is dispatched and nothing changes. Deliberately empty.
            case 'answer':
                break;
        }
    }, { 'pryzm.ai.chat.intent': r.intent, 'pryzm.ai.chat.tier': r.tier });
    hooks.say(failText ?? `${r.summary}. (resolved without AI tokens)`);
}

// ─── Conversation context (ADR-0313 §NL) ─────────────────────────────────────
// Small explicit cross-turn state for follow-ups ("Actually, make it 3.2m.").
// It biases INTERPRETATION only — targeting always comes from the live
// selection/levels rebuilt in buildContext() on every message.

let conversation: ConversationContext = {};

/** Reset the cross-turn conversation context (tests / project switch). */
export function resetZeroTokenConversation(): void {
    conversation = {};
}

/** §GEN-OFFER (RAC U5c.3) — open the one-turn finishing offer. Set AFTER a
 *  successful dispatch, so an offer is never made for something that failed. */
function offerFinishChain(): void {
    conversation = { ...conversation, pendingOffer: 'finish-chain' };
}

/**
 * Try to handle a chat utterance with the zero-token resolution ladder:
 * tier 0 grammar → tier 1 synonyms/typos → local natural-language layer.
 * Returns true when handled (dispatched, clarified, OR refused with a
 * reason) — the caller must then NOT send the utterance to the LLM.
 * Returns false only on a miss so the existing aiService path runs unchanged.
 */
export async function tryHandleZeroToken(query: string, hooks: ZeroTokenUiHooks): Promise<boolean> {
    let resolution: ZeroTokenResolution;
    let ctx: ResolverContext;
    try {
        ctx = await buildContext();
        // §PLAN (RAC U6) — the compound stage runs FIRST, and answers only when
        // the user explicitly sequenced clauses ("…, then …"). It resolves each
        // clause through this same ladder and stands aside (null) for every
        // ordinary sentence, so nothing below changes for a single ask.
        resolution = resolveCompoundUtterance(query, { ...ctx, conversation })
            ?? resolveUtterance(query, ctx);
    } catch (err) {
        // A resolver crash must not take the chat down — fall through to the LLM.
        console.error('[ZeroTokenChatBridge] resolver failed, falling through:', err);
        return false;
    }
    if (resolution.kind === 'miss') {
        // §ADR-0313 NL layer — natural phrasing, still ZERO tokens. Produces
        // semantics only; applySemanticIntent (inside) built this resolution.
        try {
            const nl = resolveNaturalLanguage(query, { ...ctx, conversation });
            conversation = nl.conversation;
            if (nl.kind === 'miss') {
                // ADR-0313 §Capability-driven refusals — the LAST deterministic
                // step before the LLM. If the ask names a topic the editor DOES
                // implement but the chat deliberately does not drive, say so and
                // say what IS connected, generated from the capability registry.
                // Anything else stays a miss: an honest "I don't know" beats a
                // confident list of unrelated abilities.
                const gap = capabilityGapRefusal(query, ctx.selection.map((s) => s.elementType));
                if (gap === null) return false; // → LLM
                resolution = gap;
            } else if (nl.kind === 'clarification') {
                // Recognized but underspecified: ask, never guess. Handled —
                // the answer arrives as the next chat message.
                hooks.say(nl.question);
                return true;
            } else {
                resolution = nl.resolution;
            }
        } catch (err) {
            console.error('[ZeroTokenChatBridge] NL resolver failed, falling through:', err);
            return false;
        }
    } else {
        // Fold tier-0/1 understanding into the conversation so follow-ups
        // work regardless of which tier answered the previous turn.
        conversation = noteResolution(conversation, resolution);
    }
    // At this point the utterance was understood (tier 0/1 or NL) — 'miss'
    // already returned false above.
    switch (resolution.kind) {
        case 'refusal': {
            const tail = resolution.suggestions.length > 0
                ? ` Try: ${resolution.suggestions.map((s) => `"${s}"`).join(' or ')}`
                : '';
            hooks.say(`${resolution.reason}${tail}`);
            return true;
        }
        case 'local':
            await runLocal(resolution, hooks);
            return true;
        case 'commands':
            await dispatchCommands(resolution, ctx, hooks);
            return true;
    }
}

// ─── §PLANNER (RAC U10.2) — the seam the planner rung runs through ───────────
//
// The planner produces the SAME structures this file already executes, so it
// gets no executor of its own: `LlmPlannerBridge` validates the model's output,
// applies it through `applySemanticIntent`, and hands the result BACK here. The
// Confirm card, the per-step plan report, the batch-report honesty and the undo
// cost are therefore literally the ones a typed sentence gets — not a parallel
// implementation that could drift from them.

/** The live ResolverContext the whole ladder shares (selection, levels, the
 *  injected catalogue lookups and scope resolver). Exported so the planner rung
 *  prompts and validates against the SAME facts the deterministic tiers used. */
export async function buildZeroTokenContext(): Promise<ResolverContext> {
    return buildContext();
}

/** Execute an already-resolved outcome — the identical three-way switch
 *  `tryHandleZeroToken` ends in. Nothing may reach the bus by another route. */
export async function runZeroTokenResolution(
    resolution: ZeroTokenResolution,
    ctx: ResolverContext,
    hooks: ZeroTokenUiHooks,
): Promise<void> {
    switch (resolution.kind) {
        case 'miss':
            return;
        case 'refusal': {
            const tail = resolution.suggestions.length > 0
                ? ` Try: ${resolution.suggestions.map((s) => `"${s}"`).join(' or ')}`
                : '';
            hooks.say(`${resolution.reason}${tail}`);
            return;
        }
        case 'local':
            await runLocal(resolution, hooks);
            return;
        case 'commands':
            await dispatchCommands(resolution, ctx, hooks);
            return;
    }
}
