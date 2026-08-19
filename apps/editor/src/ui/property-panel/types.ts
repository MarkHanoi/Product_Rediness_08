/**
 * Generic BIM Property Panel — Type Definitions
 *
 * All types used across the property panel system.
 * These are standalone and do not touch any existing files.
 */

/**
 * `'material'` is NOT `'enum'` with the catalogue's ids as options, and the difference
 * is not cosmetic (§FEAT-HANDRAIL-PANEL-FIELDS, C100 §2.1):
 *
 *   · an `'enum'` shows its RAW values, so the user would pick `stone-carrara-marble`
 *     rather than "Carrara Marble";
 *   · the catalogue is ~200 rows and needs `<optgroup>` by category to stay navigable;
 *   · a stored id the catalogue no longer has must be shown AS a stale id, not silently
 *     collapsed to the default — a refusal and a success must never look the same;
 *   · and the options come from `MATERIAL_CATALOG`, so no descriptor ever re-types them.
 *
 * ⛔ It is also NOT interchangeable with `'color'`. A hex cannot carry roughness,
 * metalness or transparency, which is exactly why C100 §2.1 forbids a hex from being
 * the HOME of a material. Where both exist the hex is a deliberate OVERRIDE that
 * SHADOWS the reference — the panel must say so, not offer them as alternatives.
 */
export type PropertyInputType = 'text' | 'number' | 'boolean' | 'enum' | 'color' | 'material' | 'readonly' | 'list';

export type PropertyCategory = 'global' | 'definition' | 'instance';

export type PanelSection = 'identity' | 'spatial' | 'definition' | 'instance' | 'relationships' | 'metadata';

/**
 * Describes a single property field.
 * The panel renders inputs from these descriptors rather than hardcoding element-specific UI.
 */
export interface PropertyDescriptor {
    key: string;
    label: string;
    type: PropertyInputType;
    category: PropertyCategory;
    section: PanelSection;
    editable: boolean;
    unit?: string;
    options?: string[];
    min?: number;
    max?: number;
    step?: number;
    group?: string;
    /**
     * Why this row is not editable RIGHT NOW, for this instance.
     *
     * ⚠ `editable: false` alone is a silent refusal: the user sees a greyed value
     * and cannot tell "this is derived" from "this is unavailable on THIS element"
     * from "this is broken". A refusal and a success must never look the same
     * (§CONTEXT-DATA-HONESTY). When a descriptor is disabled for an instance-
     * specific reason, put that reason here and the renderer shows it.
     */
    hint?: string;
}

/**
 * Panel state — tracked internally.
 * Changes are buffered in editingDraft until Apply is pressed.
 */
export interface PropertyPanelState {
    selectedElementId: string | null;
    selectedElementType: string | null;
    editingDraft: Record<string, any>;
    validationErrors: Record<string, string>;
}

/**
 * A relationship entry displayed in the Relationships section.
 */
export interface RelationshipEntry {
    relationshipType: string;
    targetId: string;
    targetLabel?: string;
}
