// A.1 (Phase A · Sprint 1) — PipelineRouter tests.
//
// Strategic context: docs/03-execution/plans/typology-expansion-roadmap.md §6.

import { describe, expect, it, vi } from 'vitest';
import { TypologyManifestSchema, type PlanTier } from '@pryzm/schemas';
import { createTypologyRegistry } from '../src/TypologyRegistry.js';
import { createPipelineRouter } from '../src/PipelineRouter.js';
import type {
    GenerativeStage,
    PipelineInput,
    RegisteredTypologyPack,
    TypologyStageBundle,
    BriefStage,
    SiteStage,
    ConstraintsStage,
    ValidatorsStage,
    CognitionStage,
    BimEmitStage,
} from '../src/types.js';

const okGenerative: GenerativeStage = () => ({
    ok: true,
    artifact: { engine: 'deterministic', payload: { roomCount: 3 } },
});

function makePack(
    id: string,
    bundleOverrides: Partial<TypologyStageBundle> = {},
    manifestOverrides: Partial<Parameters<typeof TypologyManifestSchema.parse>[0]> = {},
): RegisteredTypologyPack {
    const manifest = TypologyManifestSchema.parse({
        id,
        displayName: id,
        category: 'residential',
        version: '1.0.0',
        description: 'test',
        thumbnail: 'thumb.webp',
        author: 'PRYZM',
        cognitionLayers: ['L1-environmental'],
        programRulesEntry: 'program-rules.json',
        deterministicEngineEntry: 'det/run.js',
        roomTypes: ['living'],
        ...manifestOverrides,
    });
    return {
        manifest,
        stages: { generative: okGenerative, ...bundleOverrides },
    };
}

function makeInput(
    typologyId: string,
    userTier: PlanTier = 'solo',
    overrides: Partial<PipelineInput> = {},
): PipelineInput {
    return {
        brief: {
            typologyId: typologyId as never,
            role: 'architect',
            metadata: { bedrooms: 2 },
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
        userTier,
        correlationId: 'corr-1',
        ...overrides,
    };
}

function makeRouter(packs: readonly RegisteredTypologyPack[]) {
    const registry = createTypologyRegistry();
    for (const p of packs) registry.register(p);
    return createPipelineRouter(registry, {
        // Deterministic timing for tests.
        now: (() => {
            let n = 0;
            return () => (n += 1);
        })(),
        newCorrelationId: () => 'fixed-corr',
    });
}

describe('PipelineRouter.dispatch — happy path', () => {
    it('runs all 7 stages and returns ok with commands', async () => {
        const pack = makePack('apartment', {
            bimEmit: () => ({
                ok: true,
                artifact: [
                    { type: 'wall.batch.create', payload: { walls: [] } },
                    { type: 'door.batch.create', payload: { doors: [] } },
                ],
            }),
        });
        const router = makeRouter([pack]);
        const result = await router.dispatch(makeInput('apartment'));
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error('unreachable');
        expect(result.commands).toHaveLength(2);
        expect(result.commands[0]!.type).toBe('wall.batch.create');
        expect(result.metadata.stagesRun).toEqual([
            'brief',
            'site',
            'constraints',
            'generative',
            'validators',
            'cognition',
            'bim-emit',
        ]);
        expect(result.metadata.engine).toBe('deterministic');
        expect(result.correlationId).toBe('corr-1');
    });

    it('records per-stage timings', async () => {
        const router = makeRouter([makePack('apartment')]);
        const result = await router.dispatch(makeInput('apartment'));
        if (!result.ok) throw new Error('unreachable');
        // 7 stages ran → 7 timings recorded.
        const stageKeys = Object.keys(result.metadata.stageTimings);
        expect(stageKeys.length).toBe(7);
        for (const t of Object.values(result.metadata.stageTimings)) {
            expect(t).toBeGreaterThanOrEqual(0);
        }
    });

    it('uses the provided correlation id', async () => {
        const router = makeRouter([makePack('apartment')]);
        const result = await router.dispatch(
            makeInput('apartment', 'solo', { correlationId: 'my-corr' }),
        );
        expect(result.correlationId).toBe('my-corr');
    });

    it('generates a correlation id when not provided', async () => {
        const router = makeRouter([makePack('apartment')]);
        const result = await router.dispatch(
            makeInput('apartment', 'solo', { correlationId: undefined }),
        );
        expect(result.correlationId).toBe('fixed-corr');
    });
});

describe('PipelineRouter.dispatch — stage failures', () => {
    it('halts at brief failure', async () => {
        const failBrief: BriefStage = () => ({
            ok: false,
            reason: 'brief malformed',
            stage: 'brief',
        });
        const router = makeRouter([
            makePack('apartment', { brief: failBrief }),
        ]);
        const result = await router.dispatch(makeInput('apartment'));
        expect(result.ok).toBe(false);
        if (result.ok) throw new Error('unreachable');
        expect(result.failedAt).toBe('brief');
        expect(result.reason).toBe('brief malformed');
        expect(result.partial.stagesRun).toEqual(['brief']);
    });

    it('halts at site failure', async () => {
        const failSite: SiteStage = () => ({
            ok: false,
            reason: 'parcel empty',
            stage: 'site',
        });
        const router = makeRouter([makePack('apartment', { site: failSite })]);
        const result = await router.dispatch(makeInput('apartment'));
        expect(result.ok).toBe(false);
        if (result.ok) throw new Error('unreachable');
        expect(result.failedAt).toBe('site');
        expect(result.partial.stagesRun).toEqual(['brief', 'site']);
    });

    it('halts at constraints failure', async () => {
        const failConstraints: ConstraintsStage = () => ({
            ok: false,
            reason: 'zoning violation',
            stage: 'constraints',
        });
        const router = makeRouter([
            makePack('apartment', { constraints: failConstraints }),
        ]);
        const result = await router.dispatch(makeInput('apartment'));
        if (result.ok) throw new Error('unreachable');
        expect(result.failedAt).toBe('constraints');
        expect(result.partial.stagesRun).toEqual([
            'brief',
            'site',
            'constraints',
        ]);
    });

    it('halts at generative failure', async () => {
        const failGen: GenerativeStage = () => ({
            ok: false,
            reason: 'AI workflow refused',
            stage: 'generative',
        });
        const router = makeRouter([
            makePack('apartment', { generative: failGen }),
        ]);
        const result = await router.dispatch(makeInput('apartment'));
        if (result.ok) throw new Error('unreachable');
        expect(result.failedAt).toBe('generative');
        expect(result.partial.stagesRun).toEqual([
            'brief',
            'site',
            'constraints',
            'generative',
        ]);
    });

    it('halts at validators failure', async () => {
        const failValidators: ValidatorsStage = () => ({
            ok: false,
            reason: 'bathroom-corridor-only failed',
            stage: 'validators',
        });
        const router = makeRouter([
            makePack('apartment', { validators: failValidators }),
        ]);
        const result = await router.dispatch(makeInput('apartment'));
        if (result.ok) throw new Error('unreachable');
        expect(result.failedAt).toBe('validators');
    });

    it('halts at cognition failure', async () => {
        const failCognition: CognitionStage = () => ({
            ok: false,
            reason: 'L1 environmental check failed',
            stage: 'cognition',
        });
        const router = makeRouter([
            makePack('apartment', { cognition: failCognition }),
        ]);
        const result = await router.dispatch(makeInput('apartment'));
        if (result.ok) throw new Error('unreachable');
        expect(result.failedAt).toBe('cognition');
    });

    it('halts at bim-emit failure', async () => {
        const failEmit: BimEmitStage = () => ({
            ok: false,
            reason: 'no commands produced',
            stage: 'bim-emit',
        });
        const router = makeRouter([
            makePack('apartment', { bimEmit: failEmit }),
        ]);
        const result = await router.dispatch(makeInput('apartment'));
        if (result.ok) throw new Error('unreachable');
        expect(result.failedAt).toBe('bim-emit');
        expect(result.partial.stagesRun.length).toBe(7);
    });
});

describe('PipelineRouter.dispatch — registry + tier gating', () => {
    it('throws when typology id is not registered', async () => {
        const router = makeRouter([]);
        await expect(router.dispatch(makeInput('apartment'))).rejects.toThrow(
            /not registered/i,
        );
    });

    it('rejects when user tier is below required', async () => {
        const pack = makePack(
            'enterprise-only',
            {},
            { requiredPlanTier: 'enterprise' },
        );
        const router = makeRouter([pack]);
        const result = await router.dispatch(
            makeInput('enterprise-only', 'solo'),
        );
        expect(result.ok).toBe(false);
        if (result.ok) throw new Error('unreachable');
        expect(result.failedAt).toBe('brief');
        expect(result.reason).toMatch(/requires plan tier/i);
    });

    it('accepts when user tier equals required', async () => {
        const pack = makePack(
            'studio-pack',
            {},
            { requiredPlanTier: 'studio' },
        );
        const router = makeRouter([pack]);
        const result = await router.dispatch(makeInput('studio-pack', 'studio'));
        expect(result.ok).toBe(true);
    });

    it('accepts when user tier exceeds required', async () => {
        const pack = makePack('solo-pack', {}, { requiredPlanTier: 'solo' });
        const router = makeRouter([pack]);
        const result = await router.dispatch(
            makeInput('solo-pack', 'enterprise'),
        );
        expect(result.ok).toBe(true);
    });

    it('developer tier bypasses the consumer gate', async () => {
        const pack = makePack(
            'enterprise-only',
            {},
            { requiredPlanTier: 'enterprise' },
        );
        const router = makeRouter([pack]);
        const result = await router.dispatch(
            makeInput('enterprise-only', 'developer'),
        );
        expect(result.ok).toBe(true);
    });

    it('admin tier bypasses the consumer gate', async () => {
        const pack = makePack(
            'enterprise-only',
            {},
            { requiredPlanTier: 'enterprise' },
        );
        const router = makeRouter([pack]);
        const result = await router.dispatch(
            makeInput('enterprise-only', 'admin'),
        );
        expect(result.ok).toBe(true);
    });
});

describe('PipelineRouter.dispatch — uncaught throws', () => {
    it('rethrows when a stage handler throws (programmer error)', async () => {
        const explode: GenerativeStage = () => {
            throw new Error('handler bug');
        };
        const router = makeRouter([
            makePack('apartment', { generative: explode }),
        ]);
        await expect(router.dispatch(makeInput('apartment'))).rejects.toThrow(
            'handler bug',
        );
    });
});
