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
export function readFamilyRecords(storeKey: string): FamilyRead {
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

function matchesFilter(cat: InspectCategoryDef, el: any, filter: string): boolean {
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
        const read = readFamilyRecords(cat.storeKey);
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
