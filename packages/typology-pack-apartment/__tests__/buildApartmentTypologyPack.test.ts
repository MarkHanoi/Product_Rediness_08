// A.4.a (Phase A · Sprint 2) — Apartment pack factory + end-to-end dispatch tests.

import { describe, expect, it } from 'vitest';
import {
    createTypologyRegistry,
    createPipelineRouter,
    type PipelineInput,
} from '@pryzm/typology-pipeline';
import { buildApartmentTypologyPack } from '../src/buildApartmentTypologyPack.js';

function makeInput(preferDeterministic = false): PipelineInput {
    return {
        brief: {
            typologyId: 'apartment' as never,
            role: 'architect',
            metadata: { bedrooms: 2, area: 75 },
        },
        site: {
            siteId: 'site-1',
            centroid: { lat: 51.5, lon: -0.1 },
            parcelBoundary: [
                { x: 0, z: 0 },
                { x: 10, z: 0 },
                { x: 10, z: 8 },
                { x: 0, z: 8 },
            ],
            climate: null,
            address: null,
        },
        userTier: 'solo',
        preferDeterministic,
    };
}

describe('buildApartmentTypologyPack', () => {
    it('returns a registrable pack', () => {
        const pack = buildApartmentTypologyPack();
        expect(pack.manifest.id).toBe('apartment');
        expect(typeof pack.stages.generative).toBe('function');
    });

    it('registers cleanly in a TypologyRegistry', () => {
        const registry = createTypologyRegistry();
        registry.register(buildApartmentTypologyPack());
        expect(registry.has('apartment')).toBe(true);
        expect(registry.listIds()).toEqual(['apartment']);
    });

    describe('end-to-end dispatch (bridge mode)', () => {
        it('dispatches through all 7 stages and returns ok', async () => {
            const registry = createTypologyRegistry();
            registry.register(buildApartmentTypologyPack());
            const router = createPipelineRouter(registry);
            const result = await router.dispatch(makeInput());
            expect(result.ok).toBe(true);
            if (!result.ok) throw new Error('unreachable');
            expect(result.typologyId).toBe('apartment');
            expect(result.metadata.stagesRun).toHaveLength(7);
        });

        it('selects ai-workflow engine by default', async () => {
            const registry = createTypologyRegistry();
            registry.register(buildApartmentTypologyPack());
            const router = createPipelineRouter(registry);
            const result = await router.dispatch(makeInput(false));
            if (!result.ok) throw new Error('unreachable');
            expect(result.metadata.engine).toBe('ai-workflow');
        });

        it('selects deterministic engine when preferDeterministic is true', async () => {
            const registry = createTypologyRegistry();
            registry.register(buildApartmentTypologyPack());
            const router = createPipelineRouter(registry);
            const result = await router.dispatch(makeInput(true));
            if (!result.ok) throw new Error('unreachable');
            expect(result.metadata.engine).toBe('deterministic');
        });

        it('emits a bridge command (A.4.a placeholder)', async () => {
            const registry = createTypologyRegistry();
            registry.register(buildApartmentTypologyPack());
            const router = createPipelineRouter(registry);
            const result = await router.dispatch(makeInput());
            if (!result.ok) throw new Error('unreachable');
            expect(result.commands).toHaveLength(1);
            expect(result.commands[0]!.type).toBe('typology.apartment.bridge');
        });

        it('rejects free-trial tier (apartment requires solo)', async () => {
            const registry = createTypologyRegistry();
            registry.register(buildApartmentTypologyPack());
            const router = createPipelineRouter(registry);
            const result = await router.dispatch({
                ...makeInput(),
                userTier: 'free-trial',
            });
            expect(result.ok).toBe(false);
            if (result.ok) throw new Error('unreachable');
            expect(result.failedAt).toBe('brief');
            expect(result.reason).toMatch(/requires plan tier/i);
        });
    });
});
