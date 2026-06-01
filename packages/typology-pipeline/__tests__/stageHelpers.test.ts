// A.1 (Phase A · Sprint 1) — Tests for the per-stage helpers.
//
// Helpers are pure; tests assert their algebraic properties.

import { describe, expect, it } from 'vitest';
import { sanitiseBriefMetadata } from '../src/stages/briefCapture.js';
import {
    computeParcelArea,
    computeParcelBbox,
} from '../src/stages/siteContext.js';
import { joinProgramRulesWithRegulatory } from '../src/stages/constraintResolution.js';
import { selectEngine } from '../src/stages/generative.js';
import { runValidators, type SpatialValidator } from '../src/stages/validators.js';
import {
    evaluateCognition,
    type CognitionEvaluator,
} from '../src/stages/cognition.js';
import {
    concatCommandGroups,
    isEmittedCommand,
} from '../src/stages/bimEmission.js';
import type {
    SiteContextSnapshot,
    GeneratedPlan,
    PipelineInput,
    ResolvedSiteContext,
} from '../src/types.js';
import type { TypologyManifest } from '@pryzm/schemas';

describe('sanitiseBriefMetadata', () => {
    it('keeps JSON-safe scalars + arrays + nested objects', () => {
        const out = sanitiseBriefMetadata({
            s: 'x',
            n: 42,
            b: true,
            nil: null,
            arr: [1, 'two', false, null],
            obj: { a: 1, b: 'two' },
        });
        expect(out).toEqual({
            s: 'x',
            n: 42,
            b: true,
            nil: null,
            arr: [1, 'two', false, null],
            obj: { a: 1, b: 'two' },
        });
    });

    it('drops functions, symbols, undefined', () => {
        const out = sanitiseBriefMetadata({
            keep: 'yes',
            fn: () => 1,
            sym: Symbol('s'),
            und: undefined,
        });
        expect(out).toEqual({ keep: 'yes' });
    });

    it('drops cyclic objects', () => {
        const cyclic: Record<string, unknown> = { a: 1 };
        cyclic.self = cyclic;
        const out = sanitiseBriefMetadata({ keep: 1, cyclic });
        expect(out).toEqual({ keep: 1 });
    });
});

describe('computeParcelArea', () => {
    function snapshot(
        boundary: ReadonlyArray<{ x: number; z: number }>,
    ): SiteContextSnapshot {
        return {
            siteId: 's',
            centroid: { lat: 0, lon: 0 },
            parcelBoundary: boundary,
            climate: null,
            address: null,
        };
    }

    it('returns 0 for empty / degenerate boundaries', () => {
        expect(computeParcelArea(snapshot([]))).toBe(0);
        expect(computeParcelArea(snapshot([{ x: 0, z: 0 }]))).toBe(0);
        expect(
            computeParcelArea(
                snapshot([
                    { x: 0, z: 0 },
                    { x: 1, z: 0 },
                ]),
            ),
        ).toBe(0);
    });

    it('computes the area of a 10×8 rectangle (CCW)', () => {
        const area = computeParcelArea(
            snapshot([
                { x: 0, z: 0 },
                { x: 10, z: 0 },
                { x: 10, z: 8 },
                { x: 0, z: 8 },
            ]),
        );
        expect(area).toBe(80);
    });

    it('is winding-invariant (CCW and CW give the same unsigned area)', () => {
        const ccw = computeParcelArea(
            snapshot([
                { x: 0, z: 0 },
                { x: 10, z: 0 },
                { x: 10, z: 8 },
                { x: 0, z: 8 },
            ]),
        );
        const cw = computeParcelArea(
            snapshot([
                { x: 0, z: 0 },
                { x: 0, z: 8 },
                { x: 10, z: 8 },
                { x: 10, z: 0 },
            ]),
        );
        expect(ccw).toBe(cw);
    });

    it('handles a triangle', () => {
        const area = computeParcelArea(
            snapshot([
                { x: 0, z: 0 },
                { x: 4, z: 0 },
                { x: 0, z: 3 },
            ]),
        );
        expect(area).toBe(6);
    });
});

describe('computeParcelBbox', () => {
    it('returns null for empty polygon', () => {
        expect(
            computeParcelBbox({
                siteId: 's',
                centroid: { lat: 0, lon: 0 },
                parcelBoundary: [],
                climate: null,
                address: null,
            }),
        ).toBeNull();
    });

    it('computes bounding box for an L-shape', () => {
        const bbox = computeParcelBbox({
            siteId: 's',
            centroid: { lat: 0, lon: 0 },
            parcelBoundary: [
                { x: 0, z: 0 },
                { x: 10, z: 0 },
                { x: 10, z: 5 },
                { x: 6, z: 5 },
                { x: 6, z: 8 },
                { x: 0, z: 8 },
            ],
            climate: null,
            address: null,
        });
        expect(bbox).toEqual({ minX: 0, minZ: 0, maxX: 10, maxZ: 8 });
    });
});

describe('joinProgramRulesWithRegulatory', () => {
    it('regulatory keys win on conflict', () => {
        const out = joinProgramRulesWithRegulatory(
            { maxBedrooms: 4, defaultDoorWidth: 0.9 },
            { maxBedrooms: 6 },                       // regulatory overrides
        );
        expect(out.maxBedrooms).toBe(6);
        expect(out.defaultDoorWidth).toBe(0.9);
    });

    it('handles empty inputs', () => {
        expect(joinProgramRulesWithRegulatory({}, {})).toEqual({});
    });
});

describe('selectEngine', () => {
    function manifest(opts: {
        ai?: boolean;
        det?: boolean;
    }): TypologyManifest {
        return {
            id: 'apt' as TypologyManifest['id'],
            displayName: 'apt',
            category: 'residential',
            version: '1.0.0',
            description: 'x',
            thumbnail: 't',
            author: 'PRYZM',
            cognitionLayers: ['L1-environmental'],
            programRulesEntry: 'p.json',
            aiWorkflowEntry: opts.ai ? 'ai.js' : undefined,
            deterministicEngineEntry: opts.det ? 'det.js' : undefined,
            roomTypes: ['living'],
            requiredPlanTier: 'solo',
            phaseGate: 'alpha',
        };
    }
    function input(prefer = false): PipelineInput {
        return {
            brief: {
                typologyId: 'apt' as never,
                role: 'architect',
                metadata: {},
            },
            site: {
                siteId: 's',
                centroid: { lat: 0, lon: 0 },
                parcelBoundary: [],
                climate: null,
                address: null,
            },
            userTier: 'solo',
            preferDeterministic: prefer,
        };
    }

    it('picks AI when only AI is shipped', () => {
        expect(selectEngine(manifest({ ai: true }), input())).toBe(
            'ai-workflow',
        );
    });

    it('picks deterministic when only deterministic is shipped', () => {
        expect(selectEngine(manifest({ det: true }), input())).toBe(
            'deterministic',
        );
    });

    it('picks AI by default when both are shipped', () => {
        expect(
            selectEngine(manifest({ ai: true, det: true }), input(false)),
        ).toBe('ai-workflow');
    });

    it('picks deterministic when preferDeterministic + det is shipped', () => {
        expect(
            selectEngine(manifest({ ai: true, det: true }), input(true)),
        ).toBe('deterministic');
    });

    it('falls back to AI when preferDeterministic but det is absent', () => {
        expect(selectEngine(manifest({ ai: true }), input(true))).toBe(
            'ai-workflow',
        );
    });

    it('throws when neither is shipped', () => {
        expect(() => selectEngine(manifest({}), input())).toThrow(
            /neither aiWorkflowEntry nor deterministicEngineEntry/,
        );
    });
});

describe('runValidators', () => {
    const plan: GeneratedPlan = { engine: 'deterministic', payload: null };
    const constraints = {};

    it('returns empty violations when all pass', () => {
        const pass: SpatialValidator = () => null;
        const out = runValidators([pass, pass, pass], plan, constraints);
        expect(out.violations).toEqual([]);
        expect(out.checkedCount).toBe(3);
    });

    it('collects every violation', () => {
        const fail = (msg: string): SpatialValidator => () => msg;
        const pass: SpatialValidator = () => null;
        const out = runValidators(
            [fail('a'), pass, fail('b')],
            plan,
            constraints,
        );
        expect(out.violations).toEqual(['a', 'b']);
        expect(out.checkedCount).toBe(3);
    });
});

describe('evaluateCognition', () => {
    const plan: GeneratedPlan = { engine: 'deterministic', payload: null };
    const site: ResolvedSiteContext = {
        snapshot: {
            siteId: 's',
            centroid: { lat: 0, lon: 0 },
            parcelBoundary: [],
            climate: null,
            address: null,
        },
        derived: {},
    };

    it('emits stub when evaluator is missing', () => {
        const out = evaluateCognition(
            ['L1-environmental', 'L2-spatial-hierarchy'],
            new Map(),
            plan,
            site,
        );
        expect(out).toHaveLength(2);
        expect(out[0]!.score).toBe(0);
        expect(out[0]!.violations).toContain('evaluator not registered');
    });

    it('calls each evaluator in declared-order', () => {
        const calls: string[] = [];
        const evaluators: ReadonlyMap<
            import('@pryzm/schemas').CognitionLayer,
            CognitionEvaluator
        > = new Map<
            import('@pryzm/schemas').CognitionLayer,
            CognitionEvaluator
        >([
            [
                'L1-environmental',
                () => {
                    calls.push('L1');
                    return {
                        layer: 'L1-environmental',
                        score: 0.8,
                        violations: [],
                    };
                },
            ],
            [
                'L2-spatial-hierarchy',
                () => {
                    calls.push('L2');
                    return {
                        layer: 'L2-spatial-hierarchy',
                        score: 0.6,
                        violations: [],
                    };
                },
            ],
        ]);
        const out = evaluateCognition(
            ['L2-spatial-hierarchy', 'L1-environmental'],   // reversed
            evaluators,
            plan,
            site,
        );
        expect(out.map((e) => e.layer)).toEqual([
            'L2-spatial-hierarchy',
            'L1-environmental',
        ]);
        expect(calls).toEqual(['L2', 'L1']);
    });
});

describe('concatCommandGroups', () => {
    it('flattens nested arrays preserving order', () => {
        const out = concatCommandGroups([
            [{ type: 'a', payload: 1 }],
            [
                { type: 'b', payload: 2 },
                { type: 'c', payload: 3 },
            ],
            [],
            [{ type: 'd', payload: 4 }],
        ]);
        expect(out).toEqual([
            { type: 'a', payload: 1 },
            { type: 'b', payload: 2 },
            { type: 'c', payload: 3 },
            { type: 'd', payload: 4 },
        ]);
    });
});

describe('isEmittedCommand', () => {
    it('accepts shape with type:string and payload', () => {
        expect(isEmittedCommand({ type: 'wall.create', payload: {} })).toBe(true);
        expect(isEmittedCommand({ type: 'x', payload: null })).toBe(true);
    });

    it('rejects missing type or payload', () => {
        expect(isEmittedCommand({ payload: {} })).toBe(false);
        expect(isEmittedCommand({ type: 'x' })).toBe(false);
        expect(isEmittedCommand(null)).toBe(false);
        expect(isEmittedCommand('x')).toBe(false);
        expect(isEmittedCommand({ type: 42, payload: {} })).toBe(false);
    });
});
