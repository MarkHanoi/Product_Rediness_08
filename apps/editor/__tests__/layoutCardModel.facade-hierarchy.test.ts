// §L1-α-4 + §L2-β-5 (2026-06-01) — Façade axis + Hierarchy narrative
// surfacing in the apartment-layout modal card view-model.
//
// Validates:
//   • Façade bar appears with the right label + group + value (engine axis
//     `facadeAlignment`).
//   • Hierarchy bar appears with the right label + group + value.
//   • The `narrative` string is derived from the L2 cognition axes
//     (entrySightline + arrivalSequence + spatialClimax + hierarchy) with
//     a 4-tier priority cascade documented in `deriveNarrative`.
//   • Engine-field-name normalization: a future engine rename to
//     `facadeQuality` / `facadeScore` / `hierarchyQuality` still produces
//     the Façade / Hierarchy bars + narrative.

import { describe, expect, it } from 'vitest';
import { buildLayoutCardModel } from '../src/ui/apartment-layout/layoutCardModel.js';
import type { ScoredLayoutOption } from '@pryzm/ai-host';

/** Baseline option fixture — 4 primary axes only (AI-relay shape). Override
 *  via `over` to inject cognition axes. */
function opt(over: Partial<ScoredLayoutOption> = {}): ScoredLayoutOption {
    return {
        summary: 'L1-α-4 / L2-β-5 fixture',
        corridorWidthMin: 1000,
        walls: [{ start: { x: 0, y: 0 }, end: { x: 1000, y: 0 } }],
        doors: [{ wallRef: 0, offset: 300, width: 900 }],
        rooms: [
            { name: 'Living', type: 'living', area: 22, windowCount: 2, hasDirectAccess: true, adjacentTo: [] },
            { name: 'Kitchen', type: 'kitchen', area: 10, windowCount: 1, hasDirectAccess: true, adjacentTo: [] },
        ],
        score: {
            overall: 75,
            breakdown: {
                naturalLight: 0.9, privacy: 0.5, kitchenWorkflow: 0.7, corridorEfficiency: 0.6,
            },
        },
        ...over,
    };
}

describe('layoutCardModel — Façade axis + Hierarchy narrative (L1-α-4 / L2-β-5)', () => {
    describe('Façade bar (L1-α-4)', () => {
        it('facadeAlignment cell appears with the right label + group + value', () => {
            const m = buildLayoutCardModel(opt({
                score: {
                    overall: 70,
                    breakdown: {
                        naturalLight: 0.5, privacy: 0.5, kitchenWorkflow: 0.5, corridorEfficiency: 0.5,
                        facadeAlignment: 0.62,
                    },
                },
            }), 0);
            const bar = m.bars.find(b => b.key === 'facadeAlignment');
            expect(bar).toBeDefined();
            expect(bar!.label).toBe('Façade');
            expect(bar!.group).toBe('cognition-L1');
            expect(bar!.pct).toBe(62);
        });
    });

    describe('Hierarchy bar (L2-β-1)', () => {
        it('hierarchy cell appears with the right label + group + value', () => {
            const m = buildLayoutCardModel(opt({
                score: {
                    overall: 70,
                    breakdown: {
                        naturalLight: 0.5, privacy: 0.5, kitchenWorkflow: 0.5, corridorEfficiency: 0.5,
                        hierarchy: 0.83,
                    },
                },
            }), 0);
            const bar = m.bars.find(b => b.key === 'hierarchy');
            expect(bar).toBeDefined();
            expect(bar!.label).toBe('Hierarchy');
            expect(bar!.group).toBe('cognition-L2');
            expect(bar!.pct).toBe(83);
        });
    });

    describe('narrative derivation (L2-β-5)', () => {
        it('narrative = "Arrival ritual…" when entrySightline ≥ 0.7 AND arrivalSequence ≥ 0.7', () => {
            const m = buildLayoutCardModel(opt({
                score: {
                    overall: 80,
                    breakdown: {
                        naturalLight: 0.5, privacy: 0.5, kitchenWorkflow: 0.5, corridorEfficiency: 0.5,
                        entrySightline: 0.85, arrivalSequence: 0.75,
                    },
                },
            }), 0);
            expect(m.narrative).toBe('Arrival ritual: compressed entry opens to a generous living climax.');
        });

        it('narrative = "Compression-release…" when only arrivalSequence ≥ 0.7', () => {
            const m = buildLayoutCardModel(opt({
                score: {
                    overall: 80,
                    breakdown: {
                        naturalLight: 0.5, privacy: 0.5, kitchenWorkflow: 0.5, corridorEfficiency: 0.5,
                        // entrySightline absent / below threshold; arrivalSequence ≥ 0.7
                        entrySightline: 0.4, arrivalSequence: 0.80,
                    },
                },
            }), 0);
            expect(m.narrative).toBe('Compression-release: entry reveals a generous main space.');
        });

        it('narrative = "Dominant living space…" when only spatialClimax ≥ 0.7', () => {
            const m = buildLayoutCardModel(opt({
                score: {
                    overall: 80,
                    breakdown: {
                        naturalLight: 0.5, privacy: 0.5, kitchenWorkflow: 0.5, corridorEfficiency: 0.5,
                        spatialClimax: 0.92,
                        // entrySightline + arrivalSequence below threshold
                        entrySightline: 0.3, arrivalSequence: 0.4,
                    },
                },
            }), 0);
            expect(m.narrative).toBe('Dominant living space sits at proper depth from entry.');
        });

        it('narrative = "Privacy gradient…" when only hierarchy ≥ 0.7', () => {
            const m = buildLayoutCardModel(opt({
                score: {
                    overall: 80,
                    breakdown: {
                        naturalLight: 0.5, privacy: 0.5, kitchenWorkflow: 0.5, corridorEfficiency: 0.5,
                        hierarchy: 0.88,
                        // all L2 arrival axes below threshold
                        entrySightline: 0.2, arrivalSequence: 0.3, spatialClimax: 0.4,
                    },
                },
            }), 0);
            expect(m.narrative).toBe('Privacy gradient well-formed.');
        });

        it('narrative undefined when all axes below 0.7 threshold', () => {
            const m = buildLayoutCardModel(opt({
                score: {
                    overall: 50,
                    breakdown: {
                        naturalLight: 0.5, privacy: 0.5, kitchenWorkflow: 0.5, corridorEfficiency: 0.5,
                        entrySightline: 0.5, arrivalSequence: 0.5, spatialClimax: 0.5, hierarchy: 0.5,
                    },
                },
            }), 0);
            expect(m.narrative).toBeUndefined();
        });

        it('narrative undefined on the bare AI-relay path (no cognition axes at all)', () => {
            const m = buildLayoutCardModel(opt(), 0);
            expect(m.narrative).toBeUndefined();
        });

        it('threshold boundary — exactly 0.7 counts as ≥ 0.7 (inclusive)', () => {
            const m = buildLayoutCardModel(opt({
                score: {
                    overall: 70,
                    breakdown: {
                        naturalLight: 0.5, privacy: 0.5, kitchenWorkflow: 0.5, corridorEfficiency: 0.5,
                        entrySightline: 0.7, arrivalSequence: 0.7,
                    },
                },
            }), 0);
            expect(m.narrative).toBe('Arrival ritual: compressed entry opens to a generous living climax.');
        });

        it('priority cascade — entry+arrival wins over spatialClimax + hierarchy', () => {
            // All four axes ≥ 0.7. The most-specific rule (entrySightline +
            // arrivalSequence both high) must win.
            const m = buildLayoutCardModel(opt({
                score: {
                    overall: 90,
                    breakdown: {
                        naturalLight: 0.9, privacy: 0.9, kitchenWorkflow: 0.9, corridorEfficiency: 0.9,
                        entrySightline: 0.8, arrivalSequence: 0.8,
                        spatialClimax: 0.9, hierarchy: 0.9,
                    },
                },
            }), 0);
            expect(m.narrative).toBe('Arrival ritual: compressed entry opens to a generous living climax.');
        });

        it('priority cascade — arrivalSequence-only wins over spatialClimax + hierarchy', () => {
            const m = buildLayoutCardModel(opt({
                score: {
                    overall: 80,
                    breakdown: {
                        naturalLight: 0.5, privacy: 0.5, kitchenWorkflow: 0.5, corridorEfficiency: 0.5,
                        entrySightline: 0.4, arrivalSequence: 0.85,
                        spatialClimax: 0.9, hierarchy: 0.9,
                    },
                },
            }), 0);
            expect(m.narrative).toBe('Compression-release: entry reveals a generous main space.');
        });

        it('priority cascade — spatialClimax-only wins over hierarchy', () => {
            const m = buildLayoutCardModel(opt({
                score: {
                    overall: 80,
                    breakdown: {
                        naturalLight: 0.5, privacy: 0.5, kitchenWorkflow: 0.5, corridorEfficiency: 0.5,
                        entrySightline: 0.4, arrivalSequence: 0.4,
                        spatialClimax: 0.85, hierarchy: 0.9,
                    },
                },
            }), 0);
            expect(m.narrative).toBe('Dominant living space sits at proper depth from entry.');
        });
    });

    describe('engine-field-name alias normalization', () => {
        it('alias `facadeQuality` (instead of `facadeAlignment`) still produces the Façade bar', () => {
            // Future engine rename: emit `facadeQuality` rather than
            // `facadeAlignment`. The card model picks it up via the alias
            // set so the modal continues to render the Façade bar.
            const breakdown: Record<string, number> = {
                naturalLight: 0.5, privacy: 0.5, kitchenWorkflow: 0.5, corridorEfficiency: 0.5,
                facadeQuality: 0.55,
            };
            const m = buildLayoutCardModel(opt({
                score: { overall: 60, breakdown: breakdown as ScoredLayoutOption['score']['breakdown'] },
            }), 0);
            const bar = m.bars.find(b => b.key === 'facadeAlignment');
            expect(bar).toBeDefined();
            expect(bar!.label).toBe('Façade');
            expect(bar!.pct).toBe(55);
        });

        it('alias `facadeScore` (legacy/sibling field) still produces the Façade bar', () => {
            const breakdown: Record<string, number> = {
                naturalLight: 0.5, privacy: 0.5, kitchenWorkflow: 0.5, corridorEfficiency: 0.5,
                facadeScore: 0.42,
            };
            const m = buildLayoutCardModel(opt({
                score: { overall: 60, breakdown: breakdown as ScoredLayoutOption['score']['breakdown'] },
            }), 0);
            const bar = m.bars.find(b => b.key === 'facadeAlignment');
            expect(bar).toBeDefined();
            expect(bar!.pct).toBe(42);
        });

        it('canonical `facadeAlignment` still wins when both it and an alias are present', () => {
            // Defensive: if a transitional engine emits BOTH, the canonical
            // name (first in the alias list) takes precedence.
            const breakdown: Record<string, number> = {
                naturalLight: 0.5, privacy: 0.5, kitchenWorkflow: 0.5, corridorEfficiency: 0.5,
                facadeAlignment: 0.30, facadeQuality: 0.99,
            };
            const m = buildLayoutCardModel(opt({
                score: { overall: 60, breakdown: breakdown as ScoredLayoutOption['score']['breakdown'] },
            }), 0);
            const bar = m.bars.find(b => b.key === 'facadeAlignment')!;
            expect(bar.pct).toBe(30);
        });

        it('hierarchy alias `hierarchyQuality` still produces the Hierarchy bar', () => {
            const breakdown: Record<string, number> = {
                naturalLight: 0.5, privacy: 0.5, kitchenWorkflow: 0.5, corridorEfficiency: 0.5,
                hierarchyQuality: 0.78,
            };
            const m = buildLayoutCardModel(opt({
                score: { overall: 60, breakdown: breakdown as ScoredLayoutOption['score']['breakdown'] },
            }), 0);
            const bar = m.bars.find(b => b.key === 'hierarchy');
            expect(bar).toBeDefined();
            expect(bar!.pct).toBe(78);
        });

        it('hierarchy alias also feeds the narrative — `hierarchyQuality: 0.9` → "Privacy gradient…"', () => {
            const breakdown: Record<string, number> = {
                naturalLight: 0.5, privacy: 0.5, kitchenWorkflow: 0.5, corridorEfficiency: 0.5,
                hierarchyQuality: 0.9,
            };
            const m = buildLayoutCardModel(opt({
                score: { overall: 60, breakdown: breakdown as ScoredLayoutOption['score']['breakdown'] },
            }), 0);
            expect(m.narrative).toBe('Privacy gradient well-formed.');
        });
    });

    describe('integration with the existing card model surface', () => {
        it('Façade + Hierarchy bars appear together when both are set', () => {
            const m = buildLayoutCardModel(opt({
                score: {
                    overall: 80,
                    breakdown: {
                        naturalLight: 0.5, privacy: 0.5, kitchenWorkflow: 0.5, corridorEfficiency: 0.5,
                        hierarchy: 0.72, facadeAlignment: 0.66,
                    },
                },
            }), 0);
            const keys = m.bars.map(b => b.key);
            expect(keys).toContain('hierarchy');
            expect(keys).toContain('facadeAlignment');
        });

        it('omitting both fields leaves the bar list at the 4 primary axes', () => {
            const m = buildLayoutCardModel(opt(), 0);
            expect(m.bars).toHaveLength(4);
            const keys = m.bars.map(b => b.key);
            expect(keys).not.toContain('hierarchy');
            expect(keys).not.toContain('facadeAlignment');
        });
    });
});
