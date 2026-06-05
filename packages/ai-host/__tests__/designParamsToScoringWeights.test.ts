// A.25.1 — Living Design Parameters: pure params → ScoringWeights mapping tests.

import { describe, expect, it } from 'vitest';
import {
    designParamsToScoringWeights,
    DEFAULT_DESIGN_PARAMS,
} from '../src/workflows/apartmentLayout/designParamsToScoringWeights.js';
import { scoreLayout } from '../src/workflows/apartmentLayout/score.js';
import type { LayoutOption } from '../src/workflows/apartmentLayout/types.js';

describe('designParamsToScoringWeights', () => {
    it('neutral 0.5 sliders reproduce the legacy all-equal weights (every axis 1.0)', () => {
        const w = designParamsToScoringWeights(DEFAULT_DESIGN_PARAMS);
        expect(w).toEqual({
            naturalLight: 1,
            privacy: 1,
            kitchenWorkflow: 1,
            corridorEfficiency: 1,
        });
    });

    it('a no-arg / empty call falls back to neutral midpoints', () => {
        expect(designParamsToScoringWeights({})).toEqual({
            naturalLight: 1,
            privacy: 1,
            kitchenWorkflow: 1,
            corridorEfficiency: 1,
        });
    });

    it('maps each slider to its OWN axis (independence)', () => {
        const w = designParamsToScoringWeights({ daylight: 1, privacy: 0, kitchen: 0, compactness: 0 });
        expect(w.naturalLight).toBeGreaterThan(w.privacy);
        expect(w.naturalLight).toBeGreaterThan(w.kitchenWorkflow);
        expect(w.naturalLight).toBeGreaterThan(w.corridorEfficiency);
    });

    it('slider=1 amplifies above neutral; slider=0 attenuates below neutral', () => {
        const hi = designParamsToScoringWeights({ privacy: 1 });
        const lo = designParamsToScoringWeights({ privacy: 0 });
        expect(hi.privacy).toBeGreaterThan(1);
        expect(lo.privacy).toBeLessThan(1);
        expect(lo.privacy).toBeGreaterThan(0); // strictly positive floor
    });

    it('is monotonic non-decreasing in the slider value', () => {
        const values = [0, 0.25, 0.5, 0.75, 1];
        const weights = values.map(v => designParamsToScoringWeights({ daylight: v }).naturalLight);
        for (let i = 1; i < weights.length; i++) {
            expect(weights[i]!).toBeGreaterThan(weights[i - 1]!);
        }
    });

    it('clamps out-of-range / non-finite inputs to the valid band', () => {
        const over = designParamsToScoringWeights({ daylight: 5 });
        const under = designParamsToScoringWeights({ daylight: -5 });
        const nan = designParamsToScoringWeights({ daylight: Number.NaN });
        expect(over.naturalLight).toBe(designParamsToScoringWeights({ daylight: 1 }).naturalLight);
        expect(under.naturalLight).toBe(designParamsToScoringWeights({ daylight: 0 }).naturalLight);
        // NaN → neutral midpoint 0.5 → weight 1.0
        expect(nan.naturalLight).toBe(1);
    });

    it('all weights are strictly positive even when every slider is 0', () => {
        const w = designParamsToScoringWeights({ daylight: 0, privacy: 0, kitchen: 0, compactness: 0 });
        expect(w.naturalLight).toBeGreaterThan(0);
        expect(w.privacy).toBeGreaterThan(0);
        expect(w.kitchenWorkflow).toBeGreaterThan(0);
        expect(w.corridorEfficiency).toBeGreaterThan(0);
    });

    it('observably re-ranks two layouts when the daylight slider is raised', () => {
        // Layout A: living room is the only windowed room (high naturalLight share).
        // Layout B: corridor-free + bedrooms-deep but a dark living room.
        const lit: LayoutOption = {
            rooms: [
                { name: 'Living', type: 'living', area: 30, windowCount: 1, adjacentTo: ['Hall'], centroid: { x: 0, y: 0 }, polygon: [] },
                { name: 'Hall', type: 'hall', area: 4, windowCount: 0, adjacentTo: ['Living', 'Bedroom 1'], centroid: { x: 0, y: 0 }, polygon: [] },
                { name: 'Bedroom 1', type: 'bedroom', area: 12, windowCount: 0, adjacentTo: ['Hall'], centroid: { x: 0, y: 0 }, polygon: [] },
            ],
            walls: [],
            doors: [],
        } as unknown as LayoutOption;
        const dark: LayoutOption = {
            rooms: [
                { name: 'Living', type: 'living', area: 30, windowCount: 0, adjacentTo: ['Hall'], centroid: { x: 0, y: 0 }, polygon: [] },
                { name: 'Hall', type: 'hall', area: 4, windowCount: 0, adjacentTo: ['Living', 'Bedroom 1'], centroid: { x: 0, y: 0 }, polygon: [] },
                { name: 'Bedroom 1', type: 'bedroom', area: 12, windowCount: 0, adjacentTo: ['Hall'], centroid: { x: 0, y: 0 }, polygon: [] },
            ],
            walls: [],
            doors: [],
        } as unknown as LayoutOption;

        const daylightFirst = designParamsToScoringWeights({ daylight: 1, privacy: 0, kitchen: 0, compactness: 0 });
        const litScore = scoreLayout(lit, daylightFirst).overall;
        const darkScore = scoreLayout(dark, daylightFirst).overall;
        // With daylight dominating, the windowed layout must rank strictly higher.
        expect(litScore).toBeGreaterThan(darkScore);
    });
});
