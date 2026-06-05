// A.21.a — Casa Unifamiliar manifest validation tests.

import { describe, expect, it } from 'vitest';
import { CASA_UNIFAMILIAR_MANIFEST } from '../src/manifest.js';
import { TypologyManifestSchema } from '@pryzm/schemas';

describe('CASA_UNIFAMILIAR_MANIFEST', () => {
    it('parses cleanly against TypologyManifestSchema', () => {
        expect(() => TypologyManifestSchema.parse(CASA_UNIFAMILIAR_MANIFEST)).not.toThrow();
    });

    it('has the canonical casa-unifamiliar id', () => {
        expect(CASA_UNIFAMILIAR_MANIFEST.id).toBe('casa-unifamiliar');
    });

    it('is residential category', () => {
        expect(CASA_UNIFAMILIAR_MANIFEST.category).toBe('residential');
    });

    it('declares house room types incl. stair + landing + garage (multi-storey)', () => {
        expect(CASA_UNIFAMILIAR_MANIFEST.roomTypes).toContain('stair');
        expect(CASA_UNIFAMILIAR_MANIFEST.roomTypes).toContain('landing');
        expect(CASA_UNIFAMILIAR_MANIFEST.roomTypes).toContain('garage');
    });

    it('declares a floors stepper (1-3) in the brief — the multi-storey control', () => {
        const floors = CASA_UNIFAMILIAR_MANIFEST.briefSchema?.fields.find((f) => f.id === 'floors');
        expect(floors).toBeDefined();
        expect(floors?.kind).toBe('stepper');
        if (floors?.kind === 'stepper') {
            expect(floors.min).toBe(1);
            expect(floors.max).toBe(3);
        }
    });

    it('phase gate is alpha', () => {
        expect(CASA_UNIFAMILIAR_MANIFEST.phaseGate).toBe('alpha');
    });
});
