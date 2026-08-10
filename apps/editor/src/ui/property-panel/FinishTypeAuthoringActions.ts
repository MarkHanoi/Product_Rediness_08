/**
 * FinishTypeAuthoringActions — §FEAT-HOSTED-TYPE-AUTHORING (C65)
 * ==============================================================
 *
 * The ONE implementation of the "Duplicate Type… / New Type…" dropdown entries
 * for the finish-set families (door, window). Three surfaces share it — the
 * Door and Window property-panel widgets and the pre-draw pickers — because two
 * near-copies of one rule is how this repo's drift starts (C65 §3.5).
 *
 * The entries are rendered ONLY when the family declares authoring in
 * `ElementTypeAuthoringRegistry` (store proven project-scoped AND
 * snapshot-round-tripping). A dropdown entry that opens an editor whose result
 * cannot be saved is founder complaint #2 manufactured on purpose (C65 §3.9).
 *
 * P6 — the mutation travels `bus.executeCommand('elementType.create|duplicate')`.
 * No store write happens in this module.
 */

import {
    resolveElementTypeAuthoring,
    type ElementTypeAuthoring,
} from './ElementTypeAuthoringRegistry';
import { openFinishTypeEditor, type FinishTypeDraft } from './FinishTypeEditorModal';

/** The values the injected dropdown entries carry. */
export const DUPLICATE_TYPE_OPTION = '__duplicate__';
export const NEW_TYPE_OPTION = '__new__';

/** The minimal read surface both hosted type stores expose. */
export interface ReadableTypeStore {
    getAll(): any[];
    getById(id: string): any | undefined;
}

/**
 * Appends the separator + "Duplicate Type… / New Type…" entries to a type
 * dropdown, iff the family declares authoring. Returns the declaration when the
 * entries were added, null when the family may not be authored (in which case
 * the dropdown is left exactly as it was — never a disabled entry, C65 §3.9).
 */
export function appendTypeAuthoringOptions(
    sel: HTMLSelectElement,
    family: string,
    hasTypes: boolean,
): ElementTypeAuthoring | null {
    const authoring = resolveElementTypeAuthoring(family);
    if (!authoring) return null;

    if (hasTypes) {
        const sep = document.createElement('option');
        sep.disabled = true;
        sep.textContent = '────────────────────';
        sep.className = 'wts-opt-sep';
        sel.appendChild(sep);
    }

    const dupOpt = document.createElement('option');
    dupOpt.value = DUPLICATE_TYPE_OPTION;
    dupOpt.textContent = 'Duplicate Type…';
    dupOpt.className = 'wts-opt-action';
    sel.appendChild(dupOpt);

    const newOpt = document.createElement('option');
    newOpt.value = NEW_TYPE_OPTION;
    newOpt.textContent = 'New Type…';
    newOpt.className = 'wts-opt-action';
    sel.appendChild(newOpt);

    return authoring;
}

/** Appends " 2", " 3", … until the name is free. Collision resolved, never ignored. */
export function uniqueTypeName(candidate: string, takenLowerCased: string[]): string {
    if (!takenLowerCased.includes(candidate.toLowerCase())) return candidate;
    for (let n = 2; n < 999; n++) {
        const next = `${candidate} ${n}`;
        if (!takenLowerCased.includes(next.toLowerCase())) return next;
    }
    return `${candidate} ${Date.now()}`;
}

/** A record deep-copied into a draft: identity stays behind, everything else rides. */
function draftFrom(record: Record<string, any>): FinishTypeDraft {
    const { id: _id, isBuiltIn: _b, metadata: _m, ...rest } = structuredClone(record);
    return rest as FinishTypeDraft;
}

export interface FinishAuthoringSelectionOptions {
    mode: 'create' | 'duplicate';
    family: string;
    store: ReadableTypeStore;
    /** The type currently selected on the element/tool — the duplicate source. */
    currentTypeId?: string | null;
    /** Receives the freshly created record, read back from the store. */
    onCreated: (created: { id: string; name: string }) => void;
}

/**
 * Handles a Duplicate/New selection: builds the draft, opens the shared finish
 * editor, and on save dispatches the authoring COMMAND (P6). The created record
 * is read back from the store — the command mints the id, so the UI must never
 * guess it — and handed to `onCreated` so the dropdown can update ITSELF.
 */
export function handleFinishTypeAuthoring(opts: FinishAuthoringSelectionOptions): void {
    const authoring = resolveElementTypeAuthoring(opts.family);
    if (!authoring) return;

    const allTypes = opts.store.getAll() ?? [];
    const source = opts.currentTypeId ? opts.store.getById(opts.currentTypeId) : undefined;
    // Duplicate copies the CURRENT type, falling back to the family default (the
    // first built-in). New starts from the default too — as a visible, editable
    // TEMPLATE, so every value is on screen before it is saved (C65 §3.8).
    const base = source ?? allTypes[0];

    if (!base) {
        // Nothing to copy FROM and no template to start from. The entry is only
        // reachable when a catalogue exists, so this is a guard, not a user path.
        console.warn(`[FinishTypeAuthoringActions] ${opts.mode} requested with an empty ${opts.family} type catalogue.`);
        return;
    }

    const existingNames = allTypes.map((t: any) => String(t.name).toLowerCase());
    const initial = draftFrom(base);
    if (opts.mode === 'duplicate') {
        initial.name = uniqueTypeName(`${base.name} (Copy)`, existingNames);
        initial.description = `Duplicated from "${base.name}"`;
    } else {
        initial.name = uniqueTypeName(`Custom ${authoring.noun}`, existingNames);
        initial.description = '';
    }

    openFinishTypeEditor({
        mode: opts.mode,
        authoring,
        initial,
        existingNames,
        onSave: (draft) => {
            window.runtime?.bus?.executeCommand(
                opts.mode === 'create' ? 'elementType.create' : 'elementType.duplicate',
                { family: opts.family, draft } as any,
            )
                ?.then(() => {
                    const created = opts.store.getAll()
                        .find((t: any) => t.name === draft.name);
                    if (created) opts.onCreated(created);
                    else console.warn(`[FinishTypeAuthoringActions] ${opts.family} type created but not found in catalogue:`, draft.name);
                })
                ?.catch((e: unknown) =>
                    console.warn(`[FinishTypeAuthoringActions] ${opts.mode} ${opts.family} type failed:`, e));
        },
    });
}
