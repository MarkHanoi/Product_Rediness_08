/**
 * @file AIElementConfig.ts
 * @description The "Element DNA" — the pure-JSON contract between the AI service
 * and the geometry engine. Every field is serialisable (structuredClone-safe).
 *
 * CONTRACT (03-BIM §1.1 / 04-BIM §5.1):
 *  - No `any` types — all fields explicit.
 *  - All values must survive structuredClone (no functions, no THREE objects).
 *  - version: "1.0" is mandatory.
 *  - AIShapeType enum is CLOSED — AI must not invent new values.
 *  - Validated at constraint boundary via AIElementValidator before command execution.
 */

// ── Closed shape vocabulary ───────────────────────────────────────────────────
export type AIShapeType =
    | 'box'
    | 'cylinder'
    | 'sphere'
    | 'cone'
    | 'torus';

// ── Parameter value types ─────────────────────────────────────────────────────
export type AIParamType = 'number' | 'boolean' | 'color';

// ── Material ──────────────────────────────────────────────────────────────────
export interface AIMaterial {
    /** Hex colour string, e.g. "#c0c0c0" */
    color: string;
    /** 0–1 */
    metalness: number;
    /** 0–1 */
    roughness: number;
    transparent?: boolean;
    /** 0–1, only meaningful when transparent === true */
    opacity?: number;
}

// ── Shape-specific dimensions (all optional; required subset enforced by validator) ──
export interface AIComponentDimensions {
    // box
    width?: number;
    height?: number;
    depth?: number;
    // cylinder / cone
    radiusTop?: number;
    radiusBottom?: number;
    // sphere
    radius?: number;
    // torus
    tube?: number;
    // shared
    segments?: number;
}

// ── Component ─────────────────────────────────────────────────────────────────
export interface AIComponent {
    /** Stable slug used for parametricLinks lookups, e.g. "pole" */
    id: string;

    /** Human-readable label shown in Inspector */
    label?: string;

    shape: AIShapeType;

    /** How the geometry pivot is aligned */
    pivot?: 'base' | 'center' | 'top';

    dimensions: AIComponentDimensions;

    position: { x: number; y: number; z: number };

    /** Optional non-uniform scale */
    scale?: { x: number; y: number; z: number };

    /** Euler rotation in degrees */
    rotation?: Partial<{ x: number; y: number; z: number }>;

    material: AIMaterial;

    /** AIParameter.id values whose current value drives this component's geometry */
    parametricLinks?: string[];

    /** Optional semantic tags (e.g. "leg", "decorative", "cable") */
    tags?: string[];

    /** Allows components to be toggled */
    visible?: boolean;
}

// ── Parametric slider definition ──────────────────────────────────────────────
export interface AIParameter {
    id: string;
    label: string;
    /**
     * Dot-path from component id into its fields.
     * Format: "<componentId>.<fieldPath>"
     * Example: "pole.dimensions.height"
     */
    target: string;
    type: AIParamType;
    default: number | boolean | string;
    min?: number;
    max?: number;
    step?: number;
    unit?: string;
}

// ── Root config ───────────────────────────────────────────────────────────────
export interface AIElementConfig {
    /** Always "1.0" for current schema generation */
    version: '1.0';

    /** Measurement system (default meters) */
    units?: 'meters';

    /** Stable slug, e.g. "ai_floor_lamp" — used as elementType key in Registry */
    elementType: string;

    /** Display name shown in CREATE panel and Inspector */
    displayName: string;

    /**
     * Axis-aligned bounding box for FurnitureTool placement preview.
     * All values in metres.
     */
    boundingBox: { w: number; h: number; d: number };

    /** Y offset from level elevation (metres). Default: 0. */
    baseOffset?: number;

    components: AIComponent[];

    parameters?: AIParameter[];

    metadata: {
        /** ISO 8601 timestamp */
        generatedAt: string;
        /** Original user prompt */
        prompt?: string;
        /** Claude model string that generated this config */
        aiModel?: string;
    };
}

// ── Type-guard helpers used by AIElementValidator ─────────────────────────────

export function isValidShapeType(s: string): s is AIShapeType {
    return ['box', 'cylinder', 'sphere', 'cone', 'torus'].includes(s);
}

export function isValidParamType(s: string): s is AIParamType {
    return ['number', 'boolean', 'color'].includes(s);
}

export function isValidHexColor(s: string): boolean {
    return /^#[0-9a-fA-F]{3,8}$/.test(s);
}