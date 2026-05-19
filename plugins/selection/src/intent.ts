// Selection intent — command ID constants and predicates (S16 / ADR-0015).
//
// Wave 12 recipe completion: selection plugin intent.ts (previously missing).
//
// Pure predicates only — no I/O, no store access.

export const SELECTION_COMMANDS = {
  /** Select one or more elements (mode: replace | add | toggle). */
  SELECT: 'selection.select',
  /** Remove elements from the active selection. */
  DESELECT: 'selection.deselect',
  /** Clear the entire selection set. */
  CLEAR: 'selection.clear',
} as const;

export type SelectionCommandId = typeof SELECTION_COMMANDS[keyof typeof SELECTION_COMMANDS];

/** Loose type for a selection target. */
export interface SelectionTargetLike {
  readonly id: string;
  readonly kind: string;
}

export type SelectionModeLiteral = 'replace' | 'add' | 'toggle';

export function isSelectionMode(v: unknown): v is SelectionModeLiteral {
  return v === 'replace' || v === 'add' || v === 'toggle';
}

export function isSelectionTarget(v: unknown): v is SelectionTargetLike {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as SelectionTargetLike).id === 'string' &&
    (v as SelectionTargetLike).id.length > 0 &&
    typeof (v as SelectionTargetLike).kind === 'string' &&
    (v as SelectionTargetLike).kind.length > 0
  );
}

export function isSelectionTargetArray(v: unknown): v is readonly SelectionTargetLike[] {
  return Array.isArray(v) && v.every(isSelectionTarget);
}
