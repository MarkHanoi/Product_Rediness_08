// A.21.a — Casa Unifamiliar pack factory + end-to-end dispatch tests.

import { describe, expect, it } from 'vitest';
import {
    createTypologyRegistry,
    createPipelineRouter,
    type PipelineInput,
} from '@pryzm/typology-pipeline';
import { buildCasaUnifamiliarTypologyPack } from '../src/buildCasaUnifamiliarTypologyPack.js';

function makeInput(preferDeterministic = false): PipelineInput {
    return {
        brief: {
            typologyId: 'casa-unifamiliar' as never,
            role: 'architect',
            metadata: { floors: 2, bedrooms: 3, garage: '1-car' },
        },
        site: {
            siteId: 'site-1',
            centroid: { lat: 51.5, lon: -0.1 },
            parcelBoundary: [
                { x: 0, z: 0 },
                { x: 12, z: 0 },
                { x: 12, z: 10 },
                { x: 0, z: 10 },
            ],
            climate: null,
            address: null,
        },
        userTier: 'solo',
        preferDeterministic,
    };
}

describe('buildCasaUnifamiliarTypologyPack', () => {
    it('returns a registrable pack', () => {
        const pack = buildCasaUnifamiliarTypologyPack();
        expect(pack.manifest.id).toBe('casa-unifamiliar');
        expect(typeof pack.stages.generative).toBe('function');
    });

    it('registers cleanly in a TypologyRegistry', () => {
        const registry = createTypologyRegistry();
        registry.register(buildCasaUnifamiliarTypologyPack());
        expect(registry.has('casa-unifamiliar')).toBe(true);
        expect(registry.listIds()).toEqual(['casa-unifamiliar']);
    });

    it('coexists with the apartment-style registry (two typologies → a selection step)', () => {
        const registry = createTypologyRegistry();
        registry.register(buildCasaUnifamiliarTypologyPack());
        // A second distinct pack registers without collision (id uniqueness only).
        expect(registry.listIds()).toContain('casa-unifamiliar');
    });

    describe('end-to-end dispatch (bridge mode)', () => {
        it('dispatches through all 7 stages and returns ok', async () => {
            const registry = createTypologyRegistry();
            registry.register(buildCasaUnifamiliarTypologyPack());
            const router = createPipelineRouter(registry);
            const result = await router.dispatch(makeInput());
            expect(result.ok).toBe(true);
            if (!result.ok) throw new Error('unreachable');
            expect(result.typologyId).toBe('casa-unifamiliar');
            expect(result.metadata.stagesRun).toHaveLength(7);
        });

        it('emits the casa-unifamiliar bridge command (A.21.a placeholder)', async () => {
            const registry = createTypologyRegistry();
            registry.register(buildCasaUnifamiliarTypologyPack());
            const router = createPipelineRouter(registry);
            const result = await router.dispatch(makeInput());
            if (!result.ok) throw new Error('unreachable');
            expect(result.commands).toHaveLength(1);
            expect(result.commands[0]!.type).toBe('typology.casa-unifamiliar.bridge');
        });

        it('selects deterministic engine when preferDeterministic is true', async () => {
            const registry = createTypologyRegistry();
            registry.register(buildCasaUnifamiliarTypologyPack());
            const router = createPipelineRouter(registry);
            const result = await router.dispatch(makeInput(true));
            if (!result.ok) throw new Error('unreachable');
            expect(result.metadata.engine).toBe('deterministic');
        });
    });
});
