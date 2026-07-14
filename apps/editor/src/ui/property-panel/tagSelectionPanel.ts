/**
 * tagSelectionPanel
 * -----------------
 * §FEAT-TAG-PAPER-SCALE-AND-SELECTABILITY (L-291) — the PANEL leg.
 *
 * RECORD → PICK → PANEL, in that order (the L-256 rule). The record was fixed in L-287 (a
 * tag carries the element it names, not a baked point) and the pick corridor in L-291 (the
 * bubble AND the leader). This is the last leg: selecting a tag opens its Properties Panel,
 * rendered FROM THE RECORD — exactly as selecting a door does.
 *
 * A direct mirror of `dimensionSelectionPanel`, deliberately: the two are the same operation
 * on two annotation families, and a second selection→panel mechanism would drift from the
 * first.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT AN EDITED TAG EDITS (ADR-0123, and ADR-122 is now ACCEPTED as Option A)
 * ─────────────────────────────────────────────────────────────────────────────
 *     AN EDITED ANNOTATION WRITES TO THE MODEL. NEVER TO THE DRAWING.
 *
 * So editing a tag's mark writes `element.mark` — the SAME field the door/window SCHEDULE
 * joins on (C28, proved in L-265). Rename in the tag → the schedule updates. That is the
 * entire point of a tag, and it is why the tag has NO override field and must never grow one.
 *
 * Pure UI wiring: no store writes here, no DOM at module load. Every mutation is a command.
 */

import type { AnnotationElement } from '@pryzm/plugin-annotations';

/** The tag types that carry an element mark (room tags name a room, not an element mark). */
export const MARK_TAG_TYPES: ReadonlySet<string> = new Set(['door-tag', 'window-tag', 'wall-tag']);

/** The `pryzm-element-selected` payload fields this resolver consumes. */
export interface TagSelectionDetail {
    readonly elementId?: string;
    readonly annotationId?: string;
}

/** The record a tag panel renders. Everything here comes from the MODEL, nothing from the label. */
export interface TagRecord {
    readonly annotationId: string;
    readonly category: 'door' | 'window' | 'wall';
    /** The element this tag names. */
    readonly targetElementId: string;
    /** The instance mark — EDITABLE, and writing it updates the schedule (C28). */
    readonly mark: string | undefined;
    /** The system-type name. Read-only here: it is a property of the TYPE, not the instance. */
    readonly typeMark: string | undefined;
    /** What the bubble currently displays (derived — never an independent source of truth). */
    readonly displayed: string;
    readonly showLeader: boolean;
}

/** Narrow panel surface — the tag entry point (mirrors `showLinearDimension`). */
export interface TagPanelLike {
    showTag(record: TagRecord, ann: AnnotationElement): void;
}

export interface TagSelectionDeps {
    getAnnotationById(id: string): AnnotationElement | undefined;
    panel: TagPanelLike;
}

const CATEGORY_BY_TYPE: Readonly<Record<string, 'door' | 'window' | 'wall'>> = {
    'door-tag': 'door',
    'window-tag': 'window',
    'wall-tag': 'wall',
};

/**
 * PURE — the tag's ANNOTATION record → the panel's record. Exported so "the panel renders
 * from the record" is a unit test rather than a claim.
 *
 * Returns null for anything that is not a mark-bearing tag, so normal element selection and
 * dimension selection are never disturbed.
 */
export function toTagRecord(ann: AnnotationElement): TagRecord | null {
    const category = CATEGORY_BY_TYPE[ann.type];
    if (!category) return null;
    const p = ann.parameters ?? {};
    const targetElementId = (p.elementId ?? p.targetElementId) as string | undefined;
    if (!targetElementId) return null;
    return {
        annotationId: ann.id,
        category,
        targetElementId,
        mark: typeof p.mark === 'string' ? p.mark : undefined,
        typeMark: typeof p.typeMark === 'string' ? p.typeMark : undefined,
        displayed: (p.cachedLabel ?? p.label ?? '') as string,
        showLeader: p.showLeader !== false,
    };
}

/**
 * Resolve a selection event to a TAG and open its Properties Panel. Returns `true` iff a tag
 * panel was opened; skips silently otherwise (a wall/door/dimension selection is untouched).
 */
export function openTagPropertiesOnSelect(
    detail: TagSelectionDetail | null | undefined,
    deps: TagSelectionDeps,
): boolean {
    const id = detail?.annotationId ?? detail?.elementId;
    if (!id) return false;
    const ann = deps.getAnnotationById(id);
    if (!ann || !MARK_TAG_TYPES.has(ann.type)) return false;
    const record = toTagRecord(ann);
    if (!record) return false;
    deps.panel.showTag(record, ann);
    return true;
}

/** Injected deps for {@link applyTagMarkEdit} — keeps the write path pure + testable. */
export interface TagMarkEditDeps {
    /**
     * Dispatch the ELEMENT mark edit. NOT an annotation command: editing a tag's text is not
     * a presentation edit (L-287's `UpdateAnnotationPresentationCommand` deliberately has no
     * field for it) — it is a change to the MODEL, and it must travel the element command path
     * so the schedule, the inspector and every other readout follow from one write.
     */
    updateElementMark(elementId: string, mark: string): Promise<unknown> | unknown;
}

export interface TagMarkEditResult {
    readonly ok: boolean;
    /** A sentence the USER reads when it could not be done. Never a console line. */
    readonly message?: string;
}

/**
 * Edit a tag's mark → write `element.mark`.
 *
 * The tag's own label is NOT written. It re-derives from the record on the next reconcile
 * (L-265/L-286), which is what keeps the drawing a readout of the model rather than a second
 * copy of it. If this function ever starts writing `cachedLabel` directly, the coherence rule
 * has been broken.
 */
export async function applyTagMarkEdit(
    record: TagRecord,
    nextMark: string,
    deps: TagMarkEditDeps,
): Promise<TagMarkEditResult> {
    const mark = nextMark.trim();
    if (mark.length === 0) {
        return { ok: false, message: 'A mark cannot be empty — it is the key the schedule joins on.' };
    }
    if (mark === record.mark) return { ok: true };
    try {
        await deps.updateElementMark(record.targetElementId, mark);
        return { ok: true };
    } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : 'The model rejected this mark.' };
    }
}
