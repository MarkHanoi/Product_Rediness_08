/**
 * Generic BIM Property Panel — Type Definitions
 *
 * All types used across the property panel system.
 * These are standalone and do not touch any existing files.
 */

export type PropertyInputType = 'text' | 'number' | 'boolean' | 'enum' | 'color' | 'readonly' | 'list';

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
