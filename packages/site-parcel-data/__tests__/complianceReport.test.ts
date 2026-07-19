// L-402 — pure tests for the compliance "explain-why" report model.

import { describe, it, expect } from 'vitest';
import { buildComplianceReport, formatConstraintValue } from '../src/complianceReport.js';
import type { BuildableEnvelope } from '@pryzm/schemas';

const entry = (
    constraint: string,
    value: unknown,
    provenance: string,
    ordinanceRef: string | null = null,
    zoneCode = 'P2',
    source = 'estimated-default',
) => ({ constraint, value, zoneCode, source, fieldProvenance: provenance, ordinanceRef }) as never;

const mkEnv = (over: Partial<BuildableEnvelope> = {}): BuildableEnvelope =>
    ({
        status: 'ok',
        confidence: 'estimated-ruleset',
        insetAreaM2: 1000,
        maxHeight_m: 12,
        maxFAR: 2,
        insetPolygon: [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 1 }],
        derivation: [
            entry('setback.front', 3, 'estimated'),
            entry('setback.side', 1.5, 'estimated'),
            entry('maxHeight', 12, 'published-structured', 'Plandata §4.2', 'DK-1', 'plandata-dk'),
            entry('maxFAR', 2, 'published-structured', 'Plandata §4.3', 'DK-1', 'plandata-dk'),
        ],
        ...over,
    }) as unknown as BuildableEnvelope;

describe('§L-402 buildComplianceReport', () => {
    it('returns null for a null envelope', () => {
        expect(buildComplianceReport(null)).toBeNull();
    });

    it('orders rows the way an architect reads a determination (setbacks → height → FAR)', () => {
        const r = buildComplianceReport(mkEnv())!;
        expect(r.rows.map((x) => x.constraint)).toEqual([
            'setback.front', 'setback.side', 'maxHeight', 'maxFAR',
        ]);
    });

    it('carries per-row provenance + citation, and flags estimates honestly', () => {
        const r = buildComplianceReport(mkEnv())!;
        const front = r.rows.find((x) => x.constraint === 'setback.front')!;
        const height = r.rows.find((x) => x.constraint === 'maxHeight')!;
        expect(front.isEstimate).toBe(true);
        expect(front.ordinanceRef).toBeNull();          // no citation → UI shows "no citation"
        expect(height.isEstimate).toBe(false);
        expect(height.ordinanceRef).toBe('Plandata §4.2');
        expect(height.source).toBe('plandata-dk');
        expect(r.estimatedRowCount).toBe(2);
        expect(r.hasAnyEstimate).toBe(true);            // must NOT read as authoritative
    });

    it('a fully published envelope reports NO estimates', () => {
        const env = mkEnv({
            derivation: [
                entry('maxHeight', 20, 'published-structured', 'X §1', 'DK-2', 'plandata-dk'),
            ] as never,
        });
        const r = buildComplianceReport(env)!;
        expect(r.hasAnyEstimate).toBe(false);
        expect(r.estimatedRowCount).toBe(0);
    });

    it('derives the zoning GFA ceiling = buildable footprint × FAR', () => {
        const r = buildComplianceReport(mkEnv())!;
        expect(r.buildableFootprintM2).toBe(1000);
        expect(r.maxFAR).toBe(2);
        expect(r.maxGrossFloorAreaM2).toBe(2000);
    });

    it('omits GFA when FAR is unknown (never invents a number)', () => {
        const r = buildComplianceReport(mkEnv({ maxFAR: null } as Partial<BuildableEnvelope>))!;
        expect(r.maxFAR).toBeNull();
        expect(r.maxGrossFloorAreaM2).toBeNull();
    });

    it('omits constraints the engine did not resolve (no invented rows)', () => {
        const r = buildComplianceReport(mkEnv({ derivation: [] as never }))!;
        expect(r.rows).toHaveLength(0);
    });

    it('surfaces the envelope confidence + status verbatim', () => {
        const r = buildComplianceReport(mkEnv({ confidence: 'structured', status: 'degenerate' } as Partial<BuildableEnvelope>))!;
        expect(r.confidence).toBe('structured');
        expect(r.status).toBe('degenerate');
    });
});

describe('§L-402 formatConstraintValue', () => {
    it('formats metres for setbacks + height', () => {
        expect(formatConstraintValue('setback.front', 3)).toBe('3.0 m');
        expect(formatConstraintValue('maxHeight', 12.5)).toBe('12.5 m');
    });
    it('formats FAR as a 2dp ratio and coverage as a percent', () => {
        expect(formatConstraintValue('maxFAR', 2)).toBe('2.00');
        expect(formatConstraintValue('maxCoverage', 0.6)).toBe('60%');
        expect(formatConstraintValue('maxCoverage', 60)).toBe('60%');
    });
    it('renders permitted uses and empty/null values safely', () => {
        expect(formatConstraintValue('permittedUse', ['residential', 'retail'])).toBe('residential, retail');
        expect(formatConstraintValue('permittedUse', [])).toBe('—');
        expect(formatConstraintValue('maxHeight', null)).toBe('—');
        expect(formatConstraintValue('permittedUse', '  ')).toBe('—');
    });
});
