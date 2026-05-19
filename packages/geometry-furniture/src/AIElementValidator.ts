/**
 * @file AIElementValidator.ts
 * @description Constraint-layer validator for AIElementConfig.
 *
 * CONTRACT (04-BIM §3.3 / §7.1):
 *  - Read-only: never mutates anything.
 *  - Fails EXPLICITLY — no silent fallbacks, no default substitutions.
 *  - Called by CreateAIElementCommand.canExecute() before any mutation.
 *  - All errors returned as structured ValidationError[], never thrown silently.
 */

import {
    isValidShapeType,
    isValidParamType,
    isValidHexColor,
} from './AIElementConfig';

export interface ValidationError {
    field: string;
    message: string;
}

export interface AIElementValidationResult {
    ok: boolean;
    errors: ValidationError[];
}

export class AIElementValidator {

    /** Full validation pass — runs all rules. */
    static validate(config: unknown): AIElementValidationResult {
        const errors: ValidationError[] = [];

        if (typeof config !== 'object' || config === null) {
            return { ok: false, errors: [{ field: 'root', message: 'Config must be a non-null object' }] };
        }

        const c = config as Record<string, unknown>;

        if (c['version'] !== '1.0') {
            errors.push({ field: 'version', message: `Expected "1.0", got "${c['version']}"` });
        }

        if (typeof c['elementType'] !== 'string' || (c['elementType'] as string).trim() === '') {
            errors.push({ field: 'elementType', message: 'Must be a non-empty string' });
        }

        if (typeof c['displayName'] !== 'string' || (c['displayName'] as string).trim() === '') {
            errors.push({ field: 'displayName', message: 'Must be a non-empty string' });
        }

        errors.push(...AIElementValidator.validateBoundingBox(c['boundingBox']));

        if (c['baseOffset'] !== undefined && typeof c['baseOffset'] !== 'number') {
            errors.push({ field: 'baseOffset', message: 'Must be a number when present' });
        }

        if (!Array.isArray(c['components']) || (c['components'] as unknown[]).length === 0) {
            errors.push({ field: 'components', message: 'Must be a non-empty array' });
        } else {
            (c['components'] as unknown[]).forEach((comp, idx) => {
                errors.push(...AIElementValidator.validateComponent(comp, `components[${idx}]`));
            });
        }

        if (c['parameters'] !== undefined) {
            if (!Array.isArray(c['parameters'])) {
                errors.push({ field: 'parameters', message: 'Must be an array when present' });
            } else {
                (c['parameters'] as unknown[]).forEach((param, idx) => {
                    errors.push(...AIElementValidator.validateParameter(param, `parameters[${idx}]`));
                });
            }
        }

        errors.push(...AIElementValidator.validateMetadata(c['metadata']));

        return { ok: errors.length === 0, errors };
    }

    // ── Private validators ────────────────────────────────────────────────────

    private static validateBoundingBox(bb: unknown): ValidationError[] {
        const errors: ValidationError[] = [];
        if (typeof bb !== 'object' || bb === null) {
            return [{ field: 'boundingBox', message: 'Must be an object with w, h, d' }];
        }
        const b = bb as Record<string, unknown>;
        (['w', 'h', 'd'] as const).forEach(axis => {
            if (typeof b[axis] !== 'number' || (b[axis] as number) <= 0) {
                errors.push({ field: `boundingBox.${axis}`, message: 'Must be a positive number' });
            }
        });
        return errors;
    }

    private static validateComponent(comp: unknown, path: string): ValidationError[] {
        const errors: ValidationError[] = [];
        if (typeof comp !== 'object' || comp === null) {
            return [{ field: path, message: 'Component must be an object' }];
        }
        const c = comp as Record<string, unknown>;

        if (typeof c['id'] !== 'string' || (c['id'] as string).trim() === '') {
            errors.push({ field: `${path}.id`, message: 'Must be a non-empty string' });
        }

        const shape = c['shape'] as string;
        if (!isValidShapeType(shape)) {
            errors.push({
                field: `${path}.shape`,
                message: `Invalid shape "${shape}". Must be one of: box, cylinder, sphere, cone, torus`
            });
        } else {
            errors.push(...AIElementValidator.validateDimensions(c['dimensions'], shape, `${path}.dimensions`));
        }

        errors.push(...AIElementValidator.validateVec3(c['position'], `${path}.position`));

        if (c['rotation'] !== undefined) {
            errors.push(...AIElementValidator.validateVec3(c['rotation'], `${path}.rotation`));
        }

        errors.push(...AIElementValidator.validateMaterial(c['material'], `${path}.material`));

        return errors;
    }

    private static validateVec3(v: unknown, path: string): ValidationError[] {
        const errors: ValidationError[] = [];
        if (typeof v !== 'object' || v === null) {
            return [{ field: path, message: 'Must be an object with x, y, z' }];
        }
        const o = v as Record<string, unknown>;
        (['x', 'y', 'z'] as const).forEach(ax => {
            if (typeof o[ax] !== 'number') {
                errors.push({ field: `${path}.${ax}`, message: 'Must be a number' });
            }
        });
        return errors;
    }

    private static validateDimensions(dims: unknown, shape: string, path: string): ValidationError[] {
        const errors: ValidationError[] = [];
        if (typeof dims !== 'object' || dims === null) {
            return [{ field: path, message: 'Must be an object' }];
        }
        const d = dims as Record<string, unknown>;

        const requirePos = (field: string) => {
            if (typeof d[field] !== 'number' || (d[field] as number) <= 0) {
                errors.push({ field: `${path}.${field}`, message: `Required positive number for shape "${shape}"` });
            }
        };

        switch (shape) {
            case 'box':       requirePos('width'); requirePos('height'); requirePos('depth'); break;
            case 'cylinder':  requirePos('radiusBottom'); requirePos('height'); break;
            case 'sphere':    requirePos('radius'); break;
            case 'cone':      requirePos('radiusBottom'); requirePos('height'); break;
            case 'torus':     requirePos('radius'); requirePos('tube'); break;
        }
        return errors;
    }

    private static validateMaterial(mat: unknown, path: string): ValidationError[] {
        const errors: ValidationError[] = [];
        if (typeof mat !== 'object' || mat === null) {
            return [{ field: path, message: 'Must be an object' }];
        }
        const m = mat as Record<string, unknown>;

        if (typeof m['color'] !== 'string' || !isValidHexColor(m['color'] as string)) {
            errors.push({ field: `${path}.color`, message: `Must be a valid hex color, got "${m['color']}"` });
        }
        (['metalness', 'roughness'] as const).forEach(field => {
            const v = m[field] as number;
            if (typeof v !== 'number' || v < 0 || v > 1) {
                errors.push({ field: `${path}.${field}`, message: 'Must be 0–1' });
            }
        });
        if (m['transparent'] !== undefined && typeof m['transparent'] !== 'boolean') {
            errors.push({ field: `${path}.transparent`, message: 'Must be boolean' });
        }
        if (m['opacity'] !== undefined) {
            const op = m['opacity'] as number;
            if (typeof op !== 'number' || op < 0 || op > 1) {
                errors.push({ field: `${path}.opacity`, message: 'Must be 0–1' });
            }
        }
        return errors;
    }

    private static validateParameter(param: unknown, path: string): ValidationError[] {
        const errors: ValidationError[] = [];
        if (typeof param !== 'object' || param === null) {
            return [{ field: path, message: 'Must be an object' }];
        }
        const p = param as Record<string, unknown>;

        if (typeof p['id'] !== 'string' || (p['id'] as string).trim() === '') {
            errors.push({ field: `${path}.id`, message: 'Must be a non-empty string' });
        }
        if (typeof p['label'] !== 'string' || (p['label'] as string).trim() === '') {
            errors.push({ field: `${path}.label`, message: 'Must be a non-empty string' });
        }
        if (typeof p['target'] !== 'string' || !(p['target'] as string).includes('.')) {
            errors.push({ field: `${path}.target`, message: 'Must be dot-path like "pole.dimensions.height"' });
        }
        if (!isValidParamType(p['type'] as string)) {
            errors.push({ field: `${path}.type`, message: `Must be: number | boolean | color` });
        }
        if (p['default'] === undefined) {
            errors.push({ field: `${path}.default`, message: 'Required' });
        }
        return errors;
    }

    private static validateMetadata(meta: unknown): ValidationError[] {
        if (typeof meta !== 'object' || meta === null) {
            return [{ field: 'metadata', message: 'Must be an object' }];
        }
        const m = meta as Record<string, unknown>;
        if (typeof m['generatedAt'] !== 'string' || (m['generatedAt'] as string).trim() === '') {
            return [{ field: 'metadata.generatedAt', message: 'Must be a non-empty ISO 8601 string' }];
        }
        return [];
    }
}