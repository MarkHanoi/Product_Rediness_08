// Residential building — Slice 0 / P1.A — pack registration + dispatch acceptance.
import { describe, expect, it } from 'vitest';
import {
    createTypologyRegistry,
    createPipelineRouter,
    type PipelineInput,
} from '@pryzm/typology-pipeline';
import { buildResidentialBuildingTypologyPack } from '../src/buildResidentialBuildingTypologyPack.js';

function makeInput(overrides: Record<string, unknown> = {}): PipelineInput {
    return {
        brief: {
            typologyId: 'residential-building' as never,
            role: 'developer',
            metadata: {
                minApartmentAreaM2: 45,
                maxApartmentAreaM2: 120,
                typologies: ['T2', 'T3'],
                levels: 4,
                commercialGroundFloor: true,
                ...overrides,
            },
        },
        site: {
            siteId: 'site-1',
            centroid: { lat: 51.5, lon: -0.1 },
            parcelBoundary: [
                { x: 0, z: 0 },
                { x: 30, z: 0 },
                { x: 30, z: 24 },
                { x: 0, z: 24 },
            ],
            climate: null,
            address: null,
        },
        userTier: 'solo',
        preferDeterministic: true,
    };
}

describe('buildResidentialBuildingTypologyPack', () => {
    it('returns a registrable pack with a mandatory generative stage', () => {
        const pack = buildResidentialBuildingTypologyPack();
        expect(pack.manifest.id).toBe('residential-building');
        expect(typeof pack.stages.generative).toBe('function');
    });

    it('registers cleanly in a TypologyRegistry as a peer', () => {
        const registry = createTypologyRegistry();
        registry.register(buildResidentialBuildingTypologyPack());
        expect(registry.has('residential-building')).toBe(true);
        expect(registry.listIds()).toContain('residential-building');
    });

    describe('end-to-end dispatch (bridge mode)', () => {
        it('dispatches through all 7 stages and returns ok', async () => {
            const registry = createTypologyRegistry();
            registry.register(buildResidentialBuildingTypologyPack());
            const router = createPipelineRouter(registry);
            const result = await router.dispatch(makeInput());
            expect(result.ok).toBe(true);
            if (!result.ok) throw new Error('unreachable');
            expect(result.typologyId).toBe('residential-building');
            expect(result.metadata.stagesRun).toHaveLength(7);
        });

        it('emits the residential-building bridge command', async () => {
            const registry = createTypologyRegistry();
            registry.register(buildResidentialBuildingTypologyPack());
            const router = createPipelineRouter(registry);
            const result = await router.dispatch(makeInput());
            if (!result.ok) throw new Error('unreachable');
            expect(result.commands).toHaveLength(1);
            expect(result.commands[0]!.type).toBe('typology.residential-building.bridge');
        });

        it('soft-fails (not throws) on an invalid input combination per C50 §1.7', async () => {
            const registry = createTypologyRegistry();
            registry.register(buildResidentialBuildingTypologyPack());
            const router = createPipelineRouter(registry);
            const result = await router.dispatch(
                makeInput({ minApartmentAreaM2: 200, maxApartmentAreaM2: 50 }),
            );
            expect(result.ok).toBe(false);
            if (result.ok) throw new Error('unreachable');
            expect(result.failedAt).toBe('generative');
            expect(result.reason).toMatch(/input invalid/i);
        });
    });
});
