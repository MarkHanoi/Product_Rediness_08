/**
 * ViewTemplateTypes — Phase VII
 *
 * A ViewTemplate is a named preset that controls a defined set of ViewDefinition
 * properties simultaneously. It is conceptually similar to a CSS class applied to
 * a view — views that reference a ViewTemplate inherit its property values unless
 * they declare an override via templateLock.
 *
 * This is distinct from a VGTemplate:
 *   - VGTemplate (VGGovernanceStore)  → controls category-level rendering styles
 *   - ViewTemplate (ViewTemplateStore) → controls the full view property set
 *     (scale, detail level, discipline, phase filter, V/G template reference)
 *
 * Contract compliance:
 *   §01 §3.3  — Implements ElementStore pattern: stable id, serialize/deserialize
 *   §03 §1.1  — All fields are serialisable primitives or nested plain objects
 *   §04       — Serialisable; accessible via AIReadModel gateway
 *   §05       — Pure data types; no DOM, no Three.js, no rendering imports
 *   §07       — No server routes; client-side only
 */

import type {
    ViewTemplateLock,
    ViewOutputSettings,
    ViewTemporalContext,
    AnnotationVisibilitySettings,
    VisibilityRuleStub,
} from './ViewDefinitionTypes';

// ═════════════════════════════════════════════════════════════════════════════
// VIEW TEMPLATE ENTITY
// ═════════════════════════════════════════════════════════════════════════════

export interface ViewTemplate {
    /** Stable, immutable ID. Never re-generated. */
    id: string;

    /** Display name. Editable. */
    name: string;

    /** Optional description of this template's design intent. */
    description?: string;

    /**
     * Discipline scope — if set, this template is intended for views of this
     * discipline. The engine does not enforce this; it is informational for the UI
     * and AI authoring layer.
     */
    discipline?: 'architecture' | 'structure' | 'mep' | 'all';

    /**
     * VG Template reference — if set, applying this ViewTemplate to a view also
     * sets the view's vgTemplateId, overriding the model-level VG template for
     * that view. Part of the 4-tier VG cascade (Tier 3).
     */
    vgTemplateId?: string;

    /**
     * Output / representation settings controlled by this template.
     * Undefined = template does not control these properties.
     */
    output?: ViewOutputSettings;

    /**
     * Temporal / phase context controlled by this template.
     * Undefined = template does not control phase settings.
     */
    temporal?: ViewTemporalContext;

    /**
     * Annotation visibility overrides controlled by this template.
     * Undefined = template does not control annotation visibility.
     */
    annotationOverrides?: AnnotationVisibilitySettings;

    /**
     * Visibility rule stubs attached to this template.
     * When applied to a view (unless templateLock.rules === true), these rules
     * are merged with (or replace) the view's own rules array.
     * Phase C: stub type replaced by full VisibilityRule[] without rename.
     */
    rules?: VisibilityRuleStub[];

    /**
     * Declares which ViewDefinition properties this template controls.
     * Fields listed here are "locked" — views using this template inherit the
     * value and cannot override it unless they declare the property in their
     * own templateLock (ViewDefinition.templateLock.X = true).
     */
    lockedFields: (keyof ViewTemplateLock)[];

    /** AI-authored human-readable description of this template's purpose. */
    intent?: string;

    /** §03 §1.1 compliant metadata block. */
    metadata: {
        createdAt:    number;
        modifiedAt:   number;
        createdBy:    string;
        version:      number;
        description?: string;
    };
}

// ── Snapshot type for ProjectSerializer ────────────────────────────────────────

export interface ViewTemplateStoreSnapshot {
    version: 1;
    templates: ViewTemplate[];
}
