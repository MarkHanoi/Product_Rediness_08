// §FEAT-AUTO-TAG-BATCH-EXECUTOR (L-265) — WHAT A TAG SAYS, AND WHY.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE TAG IS THE JOIN (C28)
// ─────────────────────────────────────────────────────────────────────────────
// A tagged plan is what makes a drawing SCHEDULABLE: the mark in the bubble is the
// key the reader uses to find the row in the door/window/wall schedule. That means
// the tag and the schedule MUST resolve the mark the same way, from the same record.
// If the tag says "DO001" and the schedule says "DO-00-001", the drawing is a lie.
//
// So this file is the ONE resolver, and BOTH `ScheduleExtractor` and the auto-tag
// executor call it. It resolves from the element's REAL RECORD — never a literal,
// never a positional index.
//
// TWO MARKS, NOT ONE — and the brief's premise was half right
// ─────────────────────────────────────────────────────────────────────────────
//   • INSTANCE mark — the canonical `PREFIX-FF-NNN` mark (`WA-00-001`) minted by
//     `generateMark()` (MarkGenerator, Contract §03-1.7) at CREATE time and stored
//     ON THE ELEMENT: `wall.properties.mark`, `door.mark`, `window.mark`. This is
//     the mark the property inspector shows and the mark the door/window schedule
//     joins on (`ScheduleExtractor` → `doorStore.getById(id)?.mark`).
//     It is NOT `ElementCodeStore`, which mints a DIFFERENT, dash-free code
//     (`WA001`) on the StoreEventBus. ElementCode is kept here only as a FALLBACK
//     for elements created before/outside the command path, so a tag is never blank.
//   • TYPE mark — the name of the element's SYSTEM TYPE (`wall.systemTypeId` →
//     `wallSystemTypeStore`; likewise doors/windows). This is what the founder's
//     reference drawing actually tags: a diamond carrying the WALL TYPE, a bubble
//     carrying the DOOR/WINDOW TYPE.
//
// WHICH one a tag displays is a VIEW INTENT (P7 / C09), not a hardcoded choice —
// see `AutoTagIntent.markSource`. Both are always CARRIED in the tag's parameters,
// so the schedule join holds whichever one is displayed.

import { withAutoTagSpan } from './tracing.js';
import type { TagCategory } from './TagReconciler.js';

/** Which mark a tag displays. A property of the VIEW, never of the executor. */
export type TagMarkSource = 'type' | 'instance';

/** The subset of an element record the mark resolver reads. Structural on purpose. */
export interface MarkedRecordLike {
    readonly id?: string;
    /** Doors/windows carry `mark` at the top level (DW-12). */
    readonly mark?: string | null;
    /** Walls/slabs/columns carry it under `properties` (Contract §03-1.7). */
    readonly properties?: { readonly mark?: string | null } | null;
    /** The system type this element was created from. */
    readonly systemTypeId?: string | null;
}

/** A system-type registry (wall/door/window) reduced to what a mark needs. */
export interface SystemTypeLookup {
    getById(id: string): { name?: string } | undefined;
}

/** An element-code registry (the FALLBACK mark source). */
export interface ElementCodeLookup {
    getCode(elementId: string): { code?: string } | undefined;
}

/**
 * The INSTANCE mark of an element — `WA-00-001`.
 *
 * Priority: the mark stored on the record (`mark` → `properties.mark`, both written
 * by `generateMark()` in the create command), then the ElementCode fallback for
 * records that predate the command path. `undefined` when the element genuinely has
 * no identity yet — the caller must then decide, never invent one.
 *
 * P8 — opens `pryzm.autotag.mark`.
 */
export function resolveInstanceMark(
    record: MarkedRecordLike | undefined,
    elementId: string,
    codes?: ElementCodeLookup,
): string | undefined {
    return withAutoTagSpan('mark', (span) => {
        span.setAttribute('pryzm.autotag.mark_source', 'instance');
        const own = record?.mark ?? record?.properties?.mark ?? undefined;
        if (typeof own === 'string' && own.length > 0) return own;
        const code = codes?.getCode(elementId)?.code;
        return typeof code === 'string' && code.length > 0 ? code : undefined;
    });
}

/**
 * The TYPE mark of an element — the name of its system type ("Concrete Wall",
 * "Timber Casement"). `undefined` when the element carries no `systemTypeId` or the
 * type is not in the registry: a tag must NEVER print an id or a placeholder.
 *
 * P8 — opens `pryzm.autotag.mark`.
 */
export function resolveTypeMark(
    record: MarkedRecordLike | undefined,
    types?: SystemTypeLookup,
): string | undefined {
    return withAutoTagSpan('mark', (span) => {
        span.setAttribute('pryzm.autotag.mark_source', 'type');
        const typeId = record?.systemTypeId ?? undefined;
        if (!typeId || !types) return undefined;
        const name = types.getById(typeId)?.name;
        return typeof name === 'string' && name.length > 0 ? name : undefined;
    });
}

export interface ResolvedMarks {
    /** The mark the tag DISPLAYS, per the view's intent. */
    readonly display: string | undefined;
    /** The instance mark — always carried, so the schedule join holds. */
    readonly instanceMark: string | undefined;
    /** The type mark — always carried. */
    readonly typeMark: string | undefined;
}

/**
 * Resolve BOTH marks and pick the displayed one from the view's intent.
 *
 * Fallback is deliberate and one-directional: a view asking for the TYPE mark on an
 * element that has no system type falls back to the INSTANCE mark (an identified
 * element is always better than an unlabelled bubble); a view asking for the
 * INSTANCE mark never falls back to the type, because a type name in an instance
 * bubble would make N elements look like one schedule row.
 */
export function resolveTagMarks(
    category: TagCategory,
    elementId: string,
    record: MarkedRecordLike | undefined,
    markSource: TagMarkSource,
    deps: { types?: SystemTypeLookup; codes?: ElementCodeLookup },
): ResolvedMarks {
    void category;
    const instanceMark = resolveInstanceMark(record, elementId, deps.codes);
    const typeMark = resolveTypeMark(record, deps.types);
    const display = markSource === 'type' ? (typeMark ?? instanceMark) : instanceMark;
    return { display, instanceMark, typeMark };
}
