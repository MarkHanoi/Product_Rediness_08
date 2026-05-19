/**
 * ANNOTATION-SYSTEM-AUDIT-2026 B1 — Per-variant parameters schema
 *
 * The legacy `AnnotationElement.parameters: Record<string, any>` field is the
 * documented "schema escape hatch" called out in §3.5 of the audit. Without a
 * runtime check, malformed parameter blobs silently flow through the store
 * and only surface as render-time crashes inside individual layer renderers.
 *
 * This module defines a Zod discriminated-union schema keyed on
 * `AnnotationElement.type`. Each variant lists only the fields the current
 * renderers/tools actively read; unknown fields are intentionally allowed
 * via `.passthrough()` so this validation never blocks future, additive
 * fields (e.g. semantic metadata bridges).
 *
 * Validation is best-effort: AnnotationStore.add() / update() call
 * `validateAnnotationParameters` and emit a `console.warn` on failure.
 * They never throw — to preserve project-load resilience — but the warning
 * surfaces every malformed write at exactly one level (the store boundary)
 * instead of cascading through every renderer.
 *
 * CONTRACT COMPLIANCE:
 *   §01 §3.3 — Schemas describe plain serialisable data; no DOM, no Three.js.
 *   §03      — Closes Risk C6 in ANNOTATION-SYSTEM-AUDIT-2026.
 *   §05 §7.8 — No bim-* / @thatopen/ui elements.
 */

import { z } from 'zod';
import type { AnnotationType } from './AnnotationTypes';

// ─────────────────────────────────────────────────────────────────────────────
// Shared primitives
// ─────────────────────────────────────────────────────────────────────────────

const linearUnit = z.enum(['mm', 'cm', 'm']).optional();

// ─────────────────────────────────────────────────────────────────────────────
// Per-variant parameter schemas
// ─────────────────────────────────────────────────────────────────────────────

const SchemasByType: Partial<Record<AnnotationType, z.ZodTypeAny>> = {
    'linear-dim': z.object({
        unit:     linearUnit,
        prefix:   z.string().optional(),
        suffix:   z.string().optional(),
        override: z.string().optional(),
        // Locked-dimension constraint fields (set by LockAnnotationCommand)
        isLocked:               z.boolean().optional(),
        constraintType:         z.enum(['hard', 'soft']).optional(),
        constraintOperator:     z.enum(['>=', '<=', '==', '>', '<']).optional(),
        constraintValueMetres:  z.number().optional(),
        // String/chain dimension support
        isString:  z.boolean().optional(),
        segments:  z.array(z.object({
            refIndex: z.number().int().nonnegative(),
            label:    z.string().optional(),
        })).optional(),
        // Dependency-graph orphan flag (B6)
        _orphaned: z.boolean().optional(),
    }).passthrough(),

    // DIMENSION-SYSTEM-AUDIT-2026 §B5 — angular-dim per-variant fields
    'angular-dim': z.object({
        unit:       z.enum(['deg', 'rad', 'gon']).optional(),
        precision:  z.number().int().nonnegative().optional(),
        angleValue: z.number().optional(),
        _orphaned:  z.boolean().optional(),
    }).passthrough(),

    'text-note': z.object({
        text:      z.string(),
        bold:      z.boolean().optional(),
        italic:    z.boolean().optional(),
        align:     z.enum(['left', 'center', 'right']).optional(),
        _orphaned: z.boolean().optional(),
    }).passthrough(),

    'detail-line': z.object({
        _orphaned: z.boolean().optional(),
    }).passthrough(),

    'tag': z.object({
        targetElementId: z.string(),
        labelExpression: z.string(),
        cachedLabel:     z.string().optional(),
        showLeader:      z.boolean().optional(),
        _orphaned:       z.boolean().optional(),
    }).passthrough(),

    'spot-elevation': z.object({
        unit:      z.enum(['m', 'mm']).optional(),
        relative:  z.boolean().optional(),
        _orphaned: z.boolean().optional(),
    }).passthrough(),

    'keynote': z.object({
        code:      z.string().optional(),
        text:      z.string().optional(),
        _orphaned: z.boolean().optional(),
    }).passthrough(),

    // DIMENSION-SYSTEM-AUDIT-2026 §B5 — radius/diameter/slope per-variant fields
    'radius-dim': z.object({
        radiusMetres: z.number().optional(),
        unit:         linearUnit,
        _orphaned:    z.boolean().optional(),
    }).passthrough(),
    'diameter-dim': z.object({
        diameterMetres: z.number().optional(),
        unit:           linearUnit,
        _orphaned:      z.boolean().optional(),
    }).passthrough(),
    'slope-dim': z.object({
        slopeKind:  z.enum(['percent', 'angle', 'rise-run']).optional(),
        slopeValue: z.number().optional(),
        unit:       z.enum(['deg', 'rad', 'percent', 'rise-run']).optional(),
        _orphaned:  z.boolean().optional(),
    }).passthrough(),

    'door-tag':   z.object({ targetElementId: z.string().optional(), _orphaned: z.boolean().optional() }).passthrough(),
    'window-tag': z.object({ targetElementId: z.string().optional(), _orphaned: z.boolean().optional() }).passthrough(),
    'level-tag':  z.object({ levelId: z.string().optional(), _orphaned: z.boolean().optional() }).passthrough(),

    'grid-bubble': z.object({
        gridLineId: z.string().optional(),
        label:      z.string().optional(),
        _orphaned:  z.boolean().optional(),
    }).passthrough(),

    'section-mark': z.object({
        linkedViewId:  z.string(),
        cutPointA:     z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
        cutPointB:     z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
        tailDirection: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
        _orphaned:     z.boolean().optional(),
    }).passthrough(),

    'elevation-mark': z.object({
        linkedViewId:    z.string(),
        position:        z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
        facingDirection: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
        _orphaned:       z.boolean().optional(),
    }).passthrough(),

    'callout-detail': z.object({
        linkedViewId: z.string(),
        parentViewId: z.string(),
        cropPoints:   z.array(z.object({ x: z.number(), y: z.number(), z: z.number() })),
        leaderPoint:  z.object({ x: z.number(), y: z.number(), z: z.number() }).nullable().optional(),
        centre:       z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
        _orphaned:    z.boolean().optional(),
    }).passthrough(),

    'revision-cloud': z.object({
        revisionTag: z.string().optional(),
        _orphaned:   z.boolean().optional(),
    }).passthrough(),

    'room-tag': z.object({
        roomId:    z.string().optional(),
        _orphaned: z.boolean().optional(),
    }).passthrough(),

    'room-fill': z.object({
        roomId:    z.string().optional(),
        pattern:   z.string().optional(),
        _orphaned: z.boolean().optional(),
    }).passthrough(),

    'level-datum-line':  z.object({ _orphaned: z.boolean().optional() }).passthrough(),
    'section-grid-line': z.object({ _orphaned: z.boolean().optional() }).passthrough(),
    'roof-slope-arrow':  z.object({ _orphaned: z.boolean().optional() }).passthrough(),
    'north-arrow':       z.object({ _orphaned: z.boolean().optional() }).passthrough(),
    'scale-bar':         z.object({ _orphaned: z.boolean().optional() }).passthrough(),
    'matchline':         z.object({ _orphaned: z.boolean().optional() }).passthrough(),
};

// ─────────────────────────────────────────────────────────────────────────────
// Public validator
// ─────────────────────────────────────────────────────────────────────────────

export interface ValidationOutcome {
    ok: boolean;
    /** Human-readable message — null when ok===true */
    message: string | null;
}

/**
 * Validate the parameters bag of an AnnotationElement against the per-type
 * schema.  Unknown / unmapped types are treated as a passthrough success so
 * forward-compatibility is preserved.
 */
export function validateAnnotationParameters(
    type: AnnotationType,
    parameters: unknown
): ValidationOutcome {
    const schema = SchemasByType[type];
    if (!schema) return { ok: true, message: null };

    const result = schema.safeParse(parameters ?? {});
    if (result.success) return { ok: true, message: null };

    const issues = result.error.issues
        .map(i => `${i.path.join('.') || '<root>'}: ${i.message}`)
        .join('; ');
    return { ok: false, message: `[${type}] ${issues}` };
}
