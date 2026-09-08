/**
 * projectTreeModel — §TREE134 (L-12160), 2026-08-26.
 *
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    L7 UI — Inspect panel, mini project browser tree. PURE read
 *                    model: no DOM, no THREE (P2), no rAF (P3), no
 *                    `(window as any)` (P4), no store writes (P6).
 * Architectural Classification: A (view-only).
 * Contract:          C84 EI-9 (ONE authority per concept — "which element families
 *                    exist" is `INSPECT_CATEGORIES`, and this file derives from it
 *                    rather than restating it) · C78 §5 / §CONTEXT-DATA-HONESTY
 *                    (a store that cannot be READ is not a store that is EMPTY, and
 *                    a header total may not include rows the tree does not list).
 *
 * ── ⛔ THE DEFECT THIS CLOSES, measured 2026-08-26 ──────────────────────────────
 *
 * Founder: *"The Inspect tree doesn't have all the categories mapped — many are
 * missing. Check the project browser on the left-hand side rail panel — you have
 * them all there — do the same."*
 *
 * MEASURED before this file existed, in `ProjectTreeZone.renderTypesForLevel`:
 *   • the group builder was a hand-written FOUR-entry array —
 *     `roomStore` / `wallStore` / `slabStore` / `columnStore`, with doors bolted on
 *     as un-clickable child rows under walls;
 *   • `INSPECT_CATEGORIES` — in the SAME DIRECTORY, three files away — declares
 *     TWENTY families and is guarded by `__tests__/InspectCategoryCoverage.test.ts`;
 *   • so curtain walls, curtain panels, floors, ceilings, roofs, beams, windows,
 *     openings, stairs, stair railings, handrails, lifts, furniture, lighting and
 *     plumbing were in the founder's model, selectable in 3-D, listed by the LEFT
 *     RAIL browser — and absent from the tree beside them.
 *
 * ⭐ THE SHAPE OF THE FIX IS "DERIVE, NOT RE-LIST". `INSPECT_CATEGORIES` is the
 * authority §INSPECT-EVERY-CATEGORY (L-2032) already minted for exactly this
 * question, and its coverage gate already fails a family that reaches `main`
 * without a decision. Extending the four-entry array to today's twenty would have
 * reproduced the defect on the twenty-first. Deriving means a new family appears in
 * this tree the moment it appears in that table — with NOBODY editing this file or
 * `ProjectTreeZone.ts`. `inspectProjectTreeCategories.spec.ts` pins precisely that.
 *
 * ⚠ AND THE HEADER TOTAL IS PART OF THE SAME FIX. `countAllElements()` scanned SIX
 * stores while the tree listed FOUR groups, so `7 levels · 153 elements` counted
 * windows the tree never showed, and doors the tree showed only as dead child rows
 * under a wall. A total that includes rows the user cannot see is a
 * §CONTEXT-DATA-HONESTY defect in its own right. Here the total is a BY-CONSTRUCTION
 * sum of the very groups the renderer draws — the two cannot drift, because there is
 * only one traversal.
 */

import { INSPECT_CATEGORIES, type InspectCategoryDef } from './inspectCategories';
// §TREE134 — the storey rule for HOSTED elements (a door carries `wallId`, not
// `levelId`; C15) is the working panel's, not a new one. See `resolveElementLevelId`.
import { resolveElementLevelId } from '../../ViewBrowser/panels/unified-browser/BrowserDataHelpers';
// §ROOMTREE139 — types only. `RoomContentsService` itself is read off the window
// global exactly like every other legacy store this file reads (see
// `readRoomContentsService` below) — imported here so that read is not typed
// `any`. C84 EI-9: this is the SAME authority the Inspect ATTR ladder's
// containment counts already read (`ElementTypeSelectorZone.ts`'s `_contents()`,
// itself backed by `window.roomContentsService`) — the by-room traversal below
// calls it, it does not re-derive "which room is element X in".
import type { RoomContentsService, RoomContents, ElementRef } from '@pryzm/room-topology';

// ── Types ─────────────────────────────────────────────────────────────────────

/** One element-family group under one level, in `INSPECT_CATEGORIES` order. */
export interface TreeFamilyGroup {
    /** The `INSPECT_CATEGORIES` id — the stable expand/collapse key. */
    readonly id:       string;
    /** Plural display label, e.g. `Curtain Walls`. Upper-cased by CSS, not here. */
    readonly label:    string;
    readonly storeKey: string;
    /** The `userData.elementType` builders stamp — also the singular row prefix. */
    readonly meshType: string;
    /** The records on this level, in store order. NEVER empty: see `buildProjectTreeModel`. */
    readonly elements: readonly any[];
}

/** The groups for one level, plus the number of rows they contain. */
export interface LevelTreeGroups {
    readonly levelId: string;
    readonly groups:  readonly TreeFamilyGroup[];
    /** Sum of `groups[].elements.length` — what this level contributes to the header. */
    readonly listed:  number;
}

export interface ProjectTreeModel {
    readonly levels: readonly LevelTreeGroups[];
    /**
     * ⭐ The header total. Equal, by construction, to the sum of every group count
     * the renderer draws — it is computed from the same traversal, not from a second
     * scan over a different store list.
     */
    readonly listedTotal: number;
    /** The same figure with no name filter applied — the project's own total. */
    readonly totalUnfiltered: number;
    /**
     * Records a family store returned whose storey resolves to NO level in `levelIds`
     * (and to no host wall that does). They are real elements the tree cannot place,
     * so they are REPORTED rather than silently dropped from both the rows and the
     * total — the failure mode this whole model exists to end.
     */
    readonly unplaced: number;
    /**
     * Store keys that could not be read AT ALL — absent from `window`, or throwing.
     * C78 §8.1 `RELATIONSHIP_NOT_READABLE`: this is "unknown", never "zero", and the
     * header says so instead of quietly under-counting.
     */
    readonly unreadable: readonly string[];
}

// ── Reading one family ────────────────────────────────────────────────────────

export type FamilyRead =
    | { readonly kind: 'read';       readonly records: readonly any[] }
    | { readonly kind: 'unreadable'; readonly detail: string };

/**
 * Read one family's records off its declared store global.
 *
 * ⚠ `unreadable` and `[]` are DIFFERENT VALUES and stay different all the way to the
 * header. A store that is not yet on `window` (premature access before engine init)
 * must not become the sentence "this project has no handrails" — the same distinction
 * `determineCategoryElements` draws for the left-rail browser (C78 §5).
 */
export function readFamilyRecords(
    storeKey: string,
    opts: { readonly runtimeStoreKey?: string; readonly roleFilter?: string } = {},
): FamilyRead {
    // ⭐ §ENVELOPES-ARE-CATEGORIES (L-13252) — THE NEW-STYLE READ, FIRST.
    // A plugin DTO store lives at `runtime.stores[key]` and exposes `getState(): Map`, not the
    // `window.<x>Store.getAll(): []` every legacy family uses. Families wired that way were
    // UNREADABLE here and therefore absent from the Project Browser and Inspect entirely.
    // ⛔ The `unreadable` vs `[]` distinction is preserved on this path too, and it matters more
    // here: a runtime that has not composed yet must never render as "this project has no level
    // envelopes" (C78 §5 / [[context-data-honesty-family]] — a failure and an empty result are
    // not the same value).
    if (opts.runtimeStoreKey !== undefined) {
        const rt = (window as unknown as {
            runtime?: { stores?: Record<string, { getState?(): ReadonlyMap<string, unknown> } | undefined> };
        }).runtime;
        if (!rt?.stores) {
            return { kind: 'unreadable', detail: 'the composed runtime has no stores slot yet' };
        }
        const rtStore = rt.stores[opts.runtimeStoreKey];
        if (!rtStore || typeof rtStore.getState !== 'function') {
            return {
                kind: 'unreadable',
                detail: `runtime.stores.${opts.runtimeStoreKey} is not readable yet`,
            };
        }
        let state: ReadonlyMap<string, unknown>;
        try {
            state = rtStore.getState();
        } catch (e) {
            return {
                kind: 'unreadable',
                detail: `reading runtime.stores.${opts.runtimeStoreKey} threw: ${String((e as Error)?.message ?? e)}`,
            };
        }
        const all = [...state.values()];
        // The role split is what makes `level` and `room` two categories out of one store.
        const kept = opts.roleFilter === undefined
            ? all
            : all.filter((r) => (r as { role?: unknown } | null)?.role === opts.roleFilter);
        return { kind: 'read', records: kept };
    }
    // TODO(E.<family>.S): legacy per-family window store reach — replace with
    // `runtime.stores.<family>` when the family stores are exposed via runtime.
    const store = (window as unknown as Record<string, { getAll?(): unknown[] } | undefined>)[storeKey];
    if (!store) {
        return { kind: 'unreadable', detail: `${storeKey} is not available yet` };
    }
    if (typeof store.getAll !== 'function') {
        return { kind: 'unreadable', detail: `${storeKey} exposes no getAll()` };
    }
    let raw: unknown;
    try {
        raw = store.getAll();
    } catch (e) {
        return { kind: 'unreadable', detail: `reading ${storeKey} threw: ${String((e as Error)?.message ?? e)}` };
    }
    if (!Array.isArray(raw)) {
        return { kind: 'unreadable', detail: `${storeKey}.getAll() did not return a list` };
    }
    return { kind: 'read', records: raw };
}

/** The display name for one element row — the tree's ONE naming rule. */
export function elementRowLabel(cat: Pick<InspectCategoryDef, 'meshType'>, el: any): string {
    const given = el?.name ?? el?.label;
    if (typeof given === 'string' && given.length > 0) return given;
    const id = el?.id != null ? String(el.id) : '';
    return `${cat.meshType.toUpperCase()} ${id.substring(0, 4).toUpperCase()}`;
}

export function matchesFilter(cat: InspectCategoryDef, el: any, filter: string): boolean {
    if (!filter) return true;
    const name = String(el?.name ?? el?.label ?? el?.id ?? '').toLowerCase();
    // The label is searchable too, so typing "handrail" finds handrails whose records
    // carry only an id. The old builder searched the id alone and found nothing.
    return name.includes(filter) || cat.label.toLowerCase().includes(filter);
}

// ── The one traversal ─────────────────────────────────────────────────────────

/**
 * ⭐ THE ONE TRAVERSAL. Every family in `INSPECT_CATEGORIES` is read ONCE and its
 * records bucketed by resolved storey — so the cost is O(families + records), not
 * O(levels × families) as the per-level re-scan it replaces was.
 *
 * @param levelIds the storeys the tree will render, in render order.
 * @param filter   lower-cased search text, or `''`.
 */
export function buildProjectTreeModel(
    levelIds: readonly string[],
    filter:   string = '',
): ProjectTreeModel {
    const known = new Set(levelIds.map(String));
    /** levelId → categoryId → records */
    const byLevel = new Map<string, Map<string, any[]>>();
    for (const id of known) byLevel.set(id, new Map());

    const unreadable: string[] = [];
    let unplaced        = 0;
    let totalUnfiltered = 0;

    for (const cat of INSPECT_CATEGORIES as readonly InspectCategoryDef[]) {
        const read = readFamilyRecords(cat.storeKey, {
            runtimeStoreKey: cat.runtimeStoreKey, roleFilter: cat.roleFilter,
        });
        if (read.kind === 'unreadable') {
            unreadable.push(cat.storeKey);
            continue;
        }
        for (const el of read.records) {
            const levelId = resolveElementLevelId(el);
            if (levelId === undefined || !known.has(levelId)) {
                unplaced++;
                continue;
            }
            totalUnfiltered++;
            if (!matchesFilter(cat, el, filter)) continue;
            const perCat = byLevel.get(levelId)!;
            const bucket = perCat.get(cat.id);
            if (bucket) bucket.push(el);
            else perCat.set(cat.id, [el]);
        }
    }

    const levels: LevelTreeGroups[] = [];
    let listedTotal = 0;
    for (const levelId of levelIds.map(String)) {
        const perCat  = byLevel.get(levelId)!;
        const groups: TreeFamilyGroup[] = [];
        let listed = 0;
        // Registry order, so the tree reads spatial → structure → openings →
        // circulation → fittings exactly as the Inspect dropdown does. A family with
        // NO records on this level yields no group at all — an empty group would be a
        // row asserting something the model does not say.
        for (const cat of INSPECT_CATEGORIES as readonly InspectCategoryDef[]) {
            const elements = perCat.get(cat.id);
            if (!elements || elements.length === 0) continue;
            groups.push({
                id: cat.id, label: cat.label, storeKey: cat.storeKey,
                meshType: cat.meshType, elements,
            });
            listed += elements.length;
        }
        levels.push({ levelId, groups, listed });
        listedTotal += listed;
    }

    return { levels, listedTotal, totalUnfiltered, unplaced, unreadable };
}

/** The groups for a single level — the shape `renderTypesForLevel` consumes. */
export function buildLevelFamilyGroups(levelId: string, filter = ''): readonly TreeFamilyGroup[] {
    return buildProjectTreeModel([String(levelId)], filter).levels[0]?.groups ?? [];
}

// ═══════════════════════════════════════════════════════════════════════════
// §ROOMTREE139 (L-12260+), 2026-08-26 — the BY-ROOM traversal
// ═══════════════════════════════════════════════════════════════════════════
//
// Founder: *"In Inspect, within the PRYZM tree, I want another mode option — BY
// ROOM. I want to be able to select a room and see what it has. Also filter
// rooms by elements like furniture elements, walls — to see how many of those
// elements the room has."*
//
// ⭐ C84 EI-9 — "what is in room R?" already has ONE authority:
// `RoomContentsService.getContents(roomId)` (`@pryzm/room-topology`), the SAME
// service the Inspect ATTR ladder's containment rows already read (its
// `Furniture 18.00`, `Wall Count`, … in `ElementTypeSelectorZone.ts`'s
// `_contents()`). This traversal calls that ONE service, once per room, and
// buckets its `ElementRef[]`s by `INSPECT_CATEGORIES` id. It does NOT re-derive
// "which room is element X in" — that would be a second, rival containment
// resolver standing beside the one already shipping in the ATTR panel, exactly
// the defect C84 EI-9 exists to name.
//
// Two honesty axes this traversal must not collapse (§CONTEXT-DATA-HONESTY):
//
//  1. A family whose STORE cannot be read at all (`readFamilyRecords` →
//     `unreadable`) must not appear as "0" in any room, and must not be
//     silently folded into "no room" either — it is named in `unreadable`,
//     exactly as the by-level tree already does, and no group for it is drawn
//     anywhere in this tree.
//
//  2. `RoomContentsService` computes NO containment relationship at all for
//     six `INSPECT_CATEGORIES` families — there is no bounding/hosted/contained
//     bucket for curtain panels, floors, ceilings, roofs, stair railings or
//     lifts (`CONTENTS_REF_TYPE_TO_CATEGORY` below has no entry for them, and
//     that map's keys are DERIVED from `RoomContentsService.toRef()`'s own type
//     vocabulary, not hand-copied). Elements of those families are placed under
//     NO room and are NOT counted as "no room" either — claiming "no room"
//     would assert a confirmed absence nobody determined (C78 §1.4). They are
//     named once, project-wide, in `unsupported` / `unsupportedTotal` — and the
//     set is recomputed from `INSPECT_CATEGORIES` on every call, so a family
//     added to the registry after this module loaded still lands in exactly one
//     of "placeable" or "unsupported", never silently invisible.

/**
 * `RoomContents` buckets tag each `ElementRef` with the type string
 * `RoomContentsService.toRef()` stamps (`'wall'`, `'curtainWall'`, `'door'`, …).
 * This is the translation from that string to the `INSPECT_CATEGORIES` id — an
 * id LOOKUP, not a second containment resolver: it does not decide WHICH room an
 * element is in, only which category label a type the authority already
 * returned maps to. `contents.contained.annotations` has no entry here on
 * purpose — annotations are `NON_ELEMENT_STORE_GLOBALS` (sheet documentation,
 * not a building element), and `contents.vertical.{above,below}` are OTHER
 * rooms (vertical neighbours), never routed through this map at all.
 */
const CONTENTS_REF_TYPE_TO_CATEGORY: Readonly<Record<string, string>> = {
    wall: 'walls', slab: 'slabs', column: 'columns', curtainWall: 'curtainWalls',
    door: 'doors', window: 'windows', opening: 'openings',
    furniture: 'furniture', plumbing: 'plumbing', lighting: 'lighting',
    beam: 'beams', handrail: 'handrails', stair: 'stairs',
};

/**
 * The `INSPECT_CATEGORIES` ids that ARE placeable by `CONTENTS_REF_TYPE_TO_
 * CATEGORY` — its VALUES, not its keys. The map's keys are singular
 * `RoomContentsService.toRef()` type strings (`'wall'`, `'beam'`, …) while
 * `INSPECT_CATEGORIES` ids are plural (`'walls'`, `'beams'`, …); checking a
 * category id against the map's KEYS would silently agree only for the three
 * families whose singular and plural happen to be spelled the same
 * (`furniture`, `plumbing`, `lighting`) and misclassify every other placeable
 * family as unsupported. This is the correct direction, computed once.
 */
const MAPPED_CATEGORY_IDS: ReadonlySet<string> = new Set(Object.values(CONTENTS_REF_TYPE_TO_CATEGORY));

/** One family's elements, grouped under either a room or the "no room" bucket. */
export interface RoomTreeFamilyGroup {
    readonly id:       string;
    readonly label:    string;
    readonly storeKey: string;
    readonly meshType: string;
    /**
     * FULL store records (never bare `ElementRef`s) — `elementRowLabel` stays
     * the ONE naming rule for a row, whether it reached this tree via a room's
     * containment or the "no room" bucket. `RoomContentsService`'s own
     * `ElementRef.label` is a SEPARATE naming rule (its `toRef()`) and is
     * deliberately not surfaced here — one tree, one label authority.
     */
    readonly elements: readonly any[];
}

export interface RoomTreeEntry {
    readonly roomId:    string;
    readonly roomLabel: string;
    readonly levelId:   string | undefined;
    readonly groups:    readonly RoomTreeFamilyGroup[];
    /** Sum of `groups[].elements.length` for this room. A bounding wall shared
     *  by two rooms is counted under BOTH — it is drawn twice, so it is
     *  counted twice; see `RoomTreeModel.listedTotal`. */
    readonly total:     number;
    /**
     * `false` when `RoomContentsService` could not fully determine this room's
     * contents (`RoomContents.totals.exact`) — the counts above are a FLOOR for
     * this room, not a census.
     */
    readonly exact:     boolean;
}

export interface RoomTreeModel {
    readonly rooms: readonly RoomTreeEntry[];
    /** Sum of every room's `total` — the sum of the rows this traversal draws
     *  under rooms, by construction (mirrors `ProjectTreeModel.listedTotal`). */
    readonly listedTotal: number;
    /** Elements of a PLACEABLE family found in NO room's contents. */
    readonly noRoom: readonly RoomTreeFamilyGroup[];
    readonly noRoomTotal: number;
    /** `INSPECT_CATEGORIES` ids `RoomContentsService` computes no relationship
     *  for at all — recomputed every call, never hand-maintained. */
    readonly unsupported: readonly string[];
    /** Elements belonging to an unsupported family — named, never silently 0'd
     *  and never claimed to be "in no room". Omits any also-`unreadable` store,
     *  since that count is itself unknown, not merely unsupported. */
    readonly unsupportedTotal: number;
    /** Store keys that could not be read (C78 §8.1) — same meaning as
     *  `ProjectTreeModel.unreadable`. */
    readonly unreadable: readonly string[];
    /** `true` when `roomStore` itself could not be read — `rooms` is then `[]`
     *  and that is UNKNOWN, not "this project has no rooms". */
    readonly roomStoreUnreadable: boolean;
    /**
     * `true` when `window.roomContentsService` — the C84 EI-9 containment
     * authority itself — is unavailable. Rooms still list (from `roomStore`),
     * but no group, no "no room" bucket and no exactness can be computed
     * without it — a stronger unknown than any single family's.
     */
    readonly containmentUnavailable: boolean;
}

/**
 * Narrow the untyped `window.roomContentsService` global to the shape this
 * traversal calls. Same TODO as every other reader in this file: legacy window
 * reach, replaced when `runtime.rooms.contentsService` exists.
 */
function readRoomContentsService(): RoomContentsService | null {
    const svc = (typeof window !== 'undefined')
        ? (window as unknown as { roomContentsService?: RoomContentsService }).roomContentsService
        : undefined;
    return svc ?? null;
}

function roomDisplayLabel(r: any): string {
    const given = r?.name ?? r?.label;
    return (typeof given === 'string' && given.length > 0) ? given : String(r?.id ?? 'ROOM');
}

/** Every `INSPECT_CATEGORIES` id `RoomContentsService` has NO relationship
 *  bucket for, recomputed from the registry — never a hand-copied list that
 *  could silently disagree with `CONTENTS_REF_TYPE_TO_CATEGORY` above. */
function computeUnsupportedCategoryIds(): string[] {
    return (INSPECT_CATEGORIES as readonly InspectCategoryDef[])
        .filter((c) => c.id !== 'rooms' && !MAPPED_CATEGORY_IDS.has(c.id))
        .map((c) => c.id);
}

/**
 * ⭐ THE BY-ROOM TRAVERSAL. One `getContents()` call per room bucketed by
 * `INSPECT_CATEGORIES` id. Every record shown is looked up in the family's own
 * store (`readFamilyRecords`, read ONCE, not once per room) so `elementRowLabel`
 * stays the one naming rule for a row.
 *
 * @param filter        lower-cased search text, or `''` — narrows an element's
 *                      name/label (via `matchesFilter`); a room whose OWN label
 *                      matches shows unfiltered (its children are not narrowed).
 * @param familyFilter  an `INSPECT_CATEGORIES` id, or `null` for every family.
 *                      Narrows to rooms containing ≥1 matching element of that
 *                      family, and reorders rooms by that family's count,
 *                      descending, ties broken by room label. See
 *                      `RoomTreeZone.ts` for why: it mirrors the Discovery
 *                      list's own established high→low sort for the same shape
 *                      of question ("which rooms have the most of X") rather
 *                      than inventing a third, disagreeing sort in one panel.
 */
export function buildRoomTreeModel(
    filter:       string = '',
    familyFilter: string | null = null,
): RoomTreeModel {
    const lcFilter = filter.toLowerCase().trim();
    const unsupportedIds = computeUnsupportedCategoryIds();

    const roomsRead = readFamilyRecords('roomStore');
    if (roomsRead.kind === 'unreadable') {
        return {
            rooms: [], listedTotal: 0, noRoom: [], noRoomTotal: 0,
            unsupported: unsupportedIds, unsupportedTotal: 0,
            unreadable: [], roomStoreUnreadable: true, containmentUnavailable: false,
        };
    }
    const rooms = roomsRead.records;

    // Read every OTHER family ONCE — same discipline as `buildProjectTreeModel`.
    const familyRecords = new Map<string, any[]>();
    const recordsById    = new Map<string, Map<string, any>>();
    const unreadable: string[] = [];
    for (const cat of INSPECT_CATEGORIES as readonly InspectCategoryDef[]) {
        if (cat.id === 'rooms') continue;
        const read = readFamilyRecords(cat.storeKey, {
            runtimeStoreKey: cat.runtimeStoreKey, roleFilter: cat.roleFilter,
        });
        if (read.kind === 'unreadable') { unreadable.push(cat.storeKey); continue; }
        familyRecords.set(cat.id, read.records as any[]);
        const byId = new Map<string, any>();
        for (const el of read.records) if (el?.id != null) byId.set(String(el.id), el);
        recordsById.set(cat.id, byId);
    }
    const unreadableCategoryIds = new Set(
        (INSPECT_CATEGORIES as readonly InspectCategoryDef[])
            .filter((c) => unreadable.includes(c.storeKey))
            .map((c) => c.id),
    );

    let unsupportedTotal = 0;
    for (const id of unsupportedIds) {
        if (unreadableCategoryIds.has(id)) continue;
        unsupportedTotal += familyRecords.get(id)?.length ?? 0;
    }

    const svc = readRoomContentsService();
    if (!svc) {
        return {
            rooms: rooms.map((r: any) => ({
                roomId: String(r.id), roomLabel: roomDisplayLabel(r), levelId: r.levelId,
                groups: [], total: 0, exact: false,
            })),
            listedTotal: 0, noRoom: [], noRoomTotal: 0,
            unsupported: unsupportedIds, unsupportedTotal,
            unreadable, roomStoreUnreadable: false, containmentUnavailable: true,
        };
    }

    // ── Pass 1 — the FULL (unfiltered) containment picture ─────────────────────
    // "No room" is computed from every room's real contents; the text filter
    // only trims what is DISPLAYED, in pass 2 below.
    const assignedIds = new Map<string, Set<string>>(); // categoryId -> element ids seen in ANY room
    for (const cat of INSPECT_CATEGORIES as readonly InspectCategoryDef[]) assignedIds.set(cat.id, new Set());

    interface RawRoomBucket { room: any; byCat: Map<string, any[]>; exact: boolean }
    const rawEntries: RawRoomBucket[] = [];

    for (const room of rooms) {
        const roomId = String(room.id);
        const contents: RoomContents | null = svc.getContents(roomId);
        const byCat = new Map<string, any[]>();
        if (!contents) {
            rawEntries.push({ room, byCat, exact: false });
            continue;
        }
        const addAll = (refs: readonly ElementRef[]) => {
            for (const ref of refs) {
                const catId = CONTENTS_REF_TYPE_TO_CATEGORY[ref.type];
                if (!catId || unreadableCategoryIds.has(catId)) continue;
                const rec = recordsById.get(catId)?.get(ref.id) ?? { id: ref.id };
                const arr = byCat.get(catId);
                if (arr) { if (!arr.some((e) => String(e.id) === ref.id)) arr.push(rec); }
                else byCat.set(catId, [rec]);
                assignedIds.get(catId)!.add(ref.id);
            }
        };
        addAll(contents.bounding.walls);
        addAll(contents.bounding.slabs);
        addAll(contents.bounding.columns);
        addAll(contents.bounding.curtainWalls);
        addAll(contents.hosted.doors);
        addAll(contents.hosted.windows);
        addAll(contents.hosted.openings);
        addAll(contents.contained.furniture);
        addAll(contents.contained.columns);
        addAll(contents.contained.plumbing);
        addAll(contents.contained.lighting);
        addAll(contents.contained.beams);
        addAll(contents.contained.handrails);
        addAll(contents.contained.stairs);
        // contents.contained.annotations — NON_ELEMENT_STORE_GLOBALS, excluded.
        // contents.vertical.{above,below} — NEIGHBOUR rooms, not this room's own
        // contents; out of scope for "what does this room have".
        rawEntries.push({ room, byCat, exact: contents.totals.exact });
    }
    const roomById = new Map(rawEntries.map((r) => [String(r.room.id), r.room]));

    // ── Pass 2 — apply the text/family filter and build the display shape ──────
    const roomMatches = (room: any): boolean =>
        !!lcFilter && String(room?.name ?? room?.label ?? room?.id ?? '').toLowerCase().includes(lcFilter);

    let entries: RoomTreeEntry[] = rawEntries.map(({ room, byCat, exact }) => {
        const roomWholeMatch = roomMatches(room);
        const groups: RoomTreeFamilyGroup[] = [];
        let total = 0;
        for (const cat of INSPECT_CATEGORIES as readonly InspectCategoryDef[]) {
            if (cat.id === 'rooms') continue;
            if (familyFilter && cat.id !== familyFilter) continue;
            const recs = byCat.get(cat.id);
            if (!recs || recs.length === 0) continue;
            const shown = (roomWholeMatch || !lcFilter) ? recs : recs.filter((el) => matchesFilter(cat, el, lcFilter));
            if (shown.length === 0) continue;
            groups.push({ id: cat.id, label: cat.label, storeKey: cat.storeKey, meshType: cat.meshType, elements: shown });
            total += shown.length;
        }
        return {
            roomId: String(room.id), roomLabel: roomDisplayLabel(room), levelId: room.levelId,
            groups, total, exact,
        };
    });

    // A room with nothing left to show is omitted — mirrors "a family with ZERO
    // elements renders NO group" at the level tree. A family filter is a HARD
    // requirement (a room without that family is not "about" this question); a
    // free-text search is relaxed for a room whose OWN label matched.
    entries = entries.filter((e) => {
        if (familyFilter && e.total === 0) return false;
        if (lcFilter && e.total === 0 && !roomMatches(roomById.get(e.roomId))) return false;
        return true;
    });

    if (familyFilter) {
        entries.sort((a, b) => {
            const ca = a.groups.find((g) => g.id === familyFilter)?.elements.length ?? 0;
            const cb = b.groups.find((g) => g.id === familyFilter)?.elements.length ?? 0;
            return cb - ca || a.roomLabel.localeCompare(b.roomLabel);
        });
    }

    const listedTotal = entries.reduce((n, e) => n + e.total, 0);

    // ── "No room" — a PLACEABLE family's full record set minus every id seen in
    // ANY room above (pre-filter — the whole picture, per the module header).
    const noRoom: RoomTreeFamilyGroup[] = [];
    let noRoomTotal = 0;
    for (const cat of INSPECT_CATEGORIES as readonly InspectCategoryDef[]) {
        if (cat.id === 'rooms') continue;
        if (!MAPPED_CATEGORY_IDS.has(cat.id)) continue; // unsupported family
        if (familyFilter && cat.id !== familyFilter) continue;
        const records = familyRecords.get(cat.id);
        if (!records) continue; // unreadable store — already named in `unreadable`
        const assigned = assignedIds.get(cat.id)!;
        const orphans = records.filter((el) => el?.id != null && !assigned.has(String(el.id)));
        if (orphans.length === 0) continue;
        const shown = lcFilter ? orphans.filter((el) => matchesFilter(cat, el, lcFilter)) : orphans;
        if (shown.length === 0) continue;
        noRoom.push({ id: cat.id, label: cat.label, storeKey: cat.storeKey, meshType: cat.meshType, elements: shown });
        noRoomTotal += shown.length;
    }

    return {
        rooms: entries, listedTotal, noRoom, noRoomTotal,
        unsupported: unsupportedIds, unsupportedTotal,
        unreadable, roomStoreUnreadable: false, containmentUnavailable: false,
    };
}
