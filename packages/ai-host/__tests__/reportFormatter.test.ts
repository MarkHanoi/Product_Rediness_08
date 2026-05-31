// Apartment-layout REPORT FORMATTER tests.
//
// Pins the public surface of `reporting/report-formatter.ts`:
//   • `formatViolationReport(report, opts?)` — full Markdown render
//   • `formatViolationLine(report)` — one-liner
//   • `groupByClass(report)` — Map<classId, violations>
//   • `groupByRoom(report)`  — Map<roomId,  violations>
//
// Test policy:
//   • Build `AggregatedViolationReport` POJOs directly via a small fixture
//     helper — we DON'T spin up the orchestrator (already covered by
//     `validatorOrchestrator.test.ts`). This keeps every formatter test
//     focused on string formatting and grouping, not validator semantics.
//   • Assert FULL string equality where stable (empty / single-violation),
//     substring contains for table rows, and Map.size + .get for grouping.
//   • Determinism is the bar: every formatter call is run TWICE in one
//     "purity" test to prove no Date.now / random / Map-iteration leaks.

import { describe, expect, it } from 'vitest';
import {
    formatViolationLine,
    formatViolationReport,
    groupByClass,
    groupByRoom,
} from '../src/workflows/apartmentLayout/reporting/index.js';
import type { DimensionalViolation } from '../src/workflows/apartmentLayout/validators/dimensional/types.js';
import type { TopologyViolation } from '../src/workflows/apartmentLayout/validators/topology/types.js';
import type { AggregatedViolationReport } from '../src/workflows/apartmentLayout/validators/orchestrator-types.js';

// ── Fixture helpers ────────────────────────────────────────────────────────

function dim(
    classId: string,
    roomId: string,
    overrides: Partial<DimensionalViolation> = {},
): DimensionalViolation {
    return {
        classId,
        roomId,
        roomType: overrides.roomType ?? 'bedroom',
        severity: overrides.severity ?? 'error',
        observed: overrides.observed ?? 9.5,
        maximum: overrides.maximum ?? 8.0,
        message: overrides.message ?? 'oversized',
    };
}

function topo(
    classId: string,
    roomAId: string,
    overrides: Partial<TopologyViolation> = {},
): TopologyViolation {
    return {
        classId,
        severity: overrides.severity ?? 'error',
        roomAId,
        roomATypeName: overrides.roomATypeName ?? 'bedroom',
        roomBTypeName: overrides.roomBTypeName ?? 'kitchen',
        message: overrides.message ?? 'forbidden adjacency',
    };
}

/**
 * Assemble a `AggregatedViolationReport` from raw violation arrays — the
 * report fields (`errors`, `warnings`, `total`, `violationsByClass`) are
 * derived to match the orchestrator's contract.
 */
function makeReport(
    dimensional: DimensionalViolation[],
    topology: TopologyViolation[],
): AggregatedViolationReport {
    let errors = 0;
    let warnings = 0;
    const byClass: Record<string, number> = {};
    for (const v of dimensional) {
        if (v.severity === 'error') errors++; else warnings++;
        byClass[v.classId] = (byClass[v.classId] ?? 0) + 1;
    }
    for (const v of topology) {
        if (v.severity === 'error') errors++; else warnings++;
        byClass[v.classId] = (byClass[v.classId] ?? 0) + 1;
    }
    return Object.freeze({
        dimensional: Object.freeze(dimensional) as ReadonlyArray<DimensionalViolation>,
        topology: Object.freeze(topology) as ReadonlyArray<TopologyViolation>,
        errors,
        warnings,
        total: dimensional.length + topology.length,
        violationsByClass: Object.freeze(byClass) as Readonly<Record<string, number>>,
    });
}

const EMPTY = makeReport([], []);

// ── Tests ──────────────────────────────────────────────────────────────────

describe('formatViolationReport — Markdown render', () => {

    it('empty report → "No violations" message (byte-stable)', () => {
        const out = formatViolationReport(EMPTY);
        expect(out).toBe(
            '## Apartment Layout Validation Report\n' +
            '\n' +
            '**No violations.** Layout passes all 15 validator slices.',
        );
    });

    it('single G-1 violation → renders "**G-1** [roomId]" detail line', () => {
        const r = makeReport(
            [dim('G-1', 'b1', { observed: 9.5, maximum: 8.0, message: 'oversized bedroom' })],
            [],
        );
        const out = formatViolationReport(r);
        expect(out).toContain('## Apartment Layout Validation Report');
        expect(out).toContain('**Total**: 1 violation (1 error, 0 warnings)');
        expect(out).toContain('| G-1 area-max | 1 | error |');
        expect(out).toContain('### Dimensional violations (G-classes)');
        expect(out).toContain(
            '- **G-1** [b1]: observed 9.5, max 8 — "oversized bedroom"',
        );
        // No topology section for a dim-only report.
        expect(out).not.toContain('### Topology violations');
    });

    it('single A-3 violation → renders "**A-3** [roomA → roomB]" detail line', () => {
        const r = makeReport(
            [],
            [topo('A-3', 'kitchen-1', {
                roomATypeName: 'kitchen',
                roomBTypeName: 'bedroom',
                message: 'kitchen↔bedroom forbidden',
            })],
        );
        const out = formatViolationReport(r);
        expect(out).toContain('**Total**: 1 violation (1 error, 0 warnings)');
        expect(out).toContain('| A-3 forbidden | 1 | error |');
        expect(out).toContain('### Topology violations (A-classes)');
        expect(out).toContain(
            '- **A-3** [kitchen-1 → bedroom]: "kitchen↔bedroom forbidden"',
        );
        // No dimensional section for a topo-only report.
        expect(out).not.toContain('### Dimensional violations');
    });

    it('mixed report → table includes all classes with correct counts', () => {
        const r = makeReport(
            [
                dim('G-1', 'b1'),
                dim('G-1', 'b2'),
                dim('G-7', 'b3', { severity: 'warning' }),
            ],
            [
                topo('A-3', 'k1'),
                topo('A-5', 'k1', { severity: 'warning' }),
            ],
        );
        const out = formatViolationReport(r);
        expect(out).toContain('**Total**: 5 violations (3 errors, 2 warnings)');
        expect(out).toContain('| A-3 forbidden | 1 | error |');
        expect(out).toContain('| A-5 acoustic | 1 | warning |');
        expect(out).toContain('| G-1 area-max | 2 | error |');
        expect(out).toContain('| G-7 frontage | 1 | warning |');
    });

    it('verbose: false → strips per-violation details, keeps summary table', () => {
        const r = makeReport(
            [dim('G-1', 'b1')],
            [topo('A-3', 'k1')],
        );
        const out = formatViolationReport(r, { verbose: false });
        expect(out).toContain('### Summary by class');
        expect(out).toContain('| G-1 area-max | 1 | error |');
        expect(out).toContain('| A-3 forbidden | 1 | error |');
        expect(out).not.toContain('### Dimensional violations');
        expect(out).not.toContain('### Topology violations');
        // Detail bullets must NOT appear when !verbose.
        expect(out).not.toContain('- **G-1** [b1]');
        expect(out).not.toContain('- **A-3** [k1');
    });

    it('maxPerClass: 2 → truncates at 2 with "...N more truncated" line', () => {
        const r = makeReport(
            [
                dim('G-1', 'b1'),
                dim('G-1', 'b2'),
                dim('G-1', 'b3'),
                dim('G-1', 'b4'),
            ],
            [],
        );
        const out = formatViolationReport(r, { maxPerClass: 2 });
        expect(out).toContain('- **G-1** [b1]:');
        expect(out).toContain('- **G-1** [b2]:');
        expect(out).not.toContain('- **G-1** [b3]:');
        expect(out).not.toContain('- **G-1** [b4]:');
        expect(out).toContain('- ...2 more truncated');
    });

    it('maxPerClass truncates topology violations independently', () => {
        const r = makeReport(
            [],
            [
                topo('A-3', 'k1'),
                topo('A-3', 'k2'),
                topo('A-3', 'k3'),
            ],
        );
        const out = formatViolationReport(r, { maxPerClass: 1 });
        expect(out).toContain('- **A-3** [k1 → kitchen]:');
        expect(out).not.toContain('- **A-3** [k2 ');
        expect(out).toContain('- ...2 more truncated');
    });

    it('includeLegend: false → no legend section', () => {
        const r = makeReport([dim('G-1', 'b1')], []);
        const out = formatViolationReport(r, { includeLegend: false });
        expect(out).not.toContain('### Legend');
        expect(out).not.toContain('dimensional constraints');
        expect(out).not.toContain('topological constraints');
    });

    it('includeLegend: true (default) → legend lines present', () => {
        const r = makeReport([dim('G-1', 'b1')], []);
        const out = formatViolationReport(r);
        expect(out).toContain('### Legend');
        expect(out).toContain('- G-1..G-10: dimensional constraints');
        expect(out).toContain('- A-1..A-8: topological constraints');
        expect(out).toContain('- error: hard legality fail');
        expect(out).toContain('- warning: soft penalty');
    });

    it('unknown classId still renders (label falls back to raw id)', () => {
        const r = makeReport([dim('G-99', 'b1', { message: 'future' })], []);
        const out = formatViolationReport(r);
        expect(out).toContain('| G-99 | 1 | error |');
        expect(out).toContain('- **G-99** [b1]:');
    });

    it('class severity = "error" when ANY violation of that class is error', () => {
        const r = makeReport(
            [
                dim('G-1', 'b1', { severity: 'warning' }),
                dim('G-1', 'b2', { severity: 'error' }),
            ],
            [],
        );
        const out = formatViolationReport(r);
        expect(out).toContain('| G-1 area-max | 2 | error |');
    });

    it('class severity = "warning" when ONLY warnings exist for that class', () => {
        const r = makeReport(
            [
                dim('G-7', 'b1', { severity: 'warning' }),
                dim('G-7', 'b2', { severity: 'warning' }),
            ],
            [],
        );
        const out = formatViolationReport(r);
        expect(out).toContain('| G-7 frontage | 2 | warning |');
    });
});

describe('formatViolationLine — one-line summary', () => {

    it('empty report → "0 violations"', () => {
        expect(formatViolationLine(EMPTY)).toBe('0 violations');
    });

    it('single error → singular "violation" + "error"', () => {
        const r = makeReport([dim('G-1', 'b1')], []);
        expect(formatViolationLine(r)).toBe(
            '1 violation: 1 error, 0 warnings (G-1×1)',
        );
    });

    it('mixed → matches orchestrator-summarise() style + lex-sorted tally', () => {
        const r = makeReport(
            [dim('G-1', 'b1'), dim('G-1', 'b2')],
            [topo('A-3', 'k1')],
        );
        // 3 total = 3 errors, 0 warnings. Lex order: 'A-3' before 'G-1'.
        expect(formatViolationLine(r)).toBe(
            '3 violations: 3 errors, 0 warnings (A-3×1, G-1×2)',
        );
    });

    it('one error + one warning → pluralisation correct', () => {
        const r = makeReport(
            [dim('G-1', 'b1')],
            [topo('A-2', 'k1', { severity: 'warning' })],
        );
        expect(formatViolationLine(r)).toBe(
            '2 violations: 1 error, 1 warning (A-2×1, G-1×1)',
        );
    });
});

describe('groupByClass — deterministic Map grouping', () => {

    it('empty report → empty Map', () => {
        const m = groupByClass(EMPTY);
        expect(m.size).toBe(0);
    });

    it('mixed → correct grouping by classId', () => {
        const v1 = dim('G-1', 'b1');
        const v2 = dim('G-1', 'b2');
        const v3 = topo('A-3', 'k1');
        const r = makeReport([v1, v2], [v3]);
        const m = groupByClass(r);
        expect(m.size).toBe(2);
        expect(m.get('G-1')).toHaveLength(2);
        expect(m.get('A-3')).toHaveLength(1);
        expect(m.get('G-1')).toEqual([v1, v2]);
        expect(m.get('A-3')).toEqual([v3]);
    });

    it('returns lex-sorted keys (A-3 before G-1)', () => {
        const r = makeReport(
            [dim('G-1', 'b1')],
            [topo('A-3', 'k1')],
        );
        const m = groupByClass(r);
        expect(Array.from(m.keys())).toEqual(['A-3', 'G-1']);
    });
});

describe('groupByRoom — deterministic Map grouping', () => {

    it('empty report → empty Map', () => {
        const m = groupByRoom(EMPTY);
        expect(m.size).toBe(0);
    });

    it('mixed → groups by roomId (dim) and roomAId (topo)', () => {
        const v1 = dim('G-1', 'b1');
        const v2 = dim('G-2', 'b1');             // same room, different class
        const v3 = topo('A-3', 'k1');             // different room
        const r = makeReport([v1, v2], [v3]);
        const m = groupByRoom(r);
        expect(m.size).toBe(2);
        expect(m.get('b1')).toHaveLength(2);
        expect(m.get('k1')).toHaveLength(1);
    });

    it('returns lex-sorted room keys', () => {
        const r = makeReport(
            [dim('G-1', 'zeta'), dim('G-1', 'alpha')],
            [topo('A-3', 'mike')],
        );
        const m = groupByRoom(r);
        expect(Array.from(m.keys())).toEqual(['alpha', 'mike', 'zeta']);
    });
});

describe('purity — all helpers are deterministic', () => {

    it('formatViolationReport: same input → same output (twice)', () => {
        const r = makeReport(
            [dim('G-1', 'b1'), dim('G-7', 'b2', { severity: 'warning' })],
            [topo('A-3', 'k1'), topo('A-5', 'k1', { severity: 'warning' })],
        );
        const a = formatViolationReport(r);
        const b = formatViolationReport(r);
        expect(a).toBe(b);
    });

    it('formatViolationLine: same input → same output (twice)', () => {
        const r = makeReport(
            [dim('G-1', 'b1')],
            [topo('A-3', 'k1')],
        );
        expect(formatViolationLine(r)).toBe(formatViolationLine(r));
    });

    it('groupByClass: same input → same key order + same arrays', () => {
        const r = makeReport(
            [dim('G-1', 'b1'), dim('G-1', 'b2')],
            [topo('A-3', 'k1')],
        );
        const a = groupByClass(r);
        const b = groupByClass(r);
        expect(Array.from(a.keys())).toEqual(Array.from(b.keys()));
        for (const k of a.keys()) {
            expect(a.get(k)).toEqual(b.get(k));
        }
    });

    it('groupByRoom: same input → same key order + same arrays', () => {
        const r = makeReport(
            [dim('G-1', 'b1')],
            [topo('A-3', 'k1')],
        );
        const a = groupByRoom(r);
        const b = groupByRoom(r);
        expect(Array.from(a.keys())).toEqual(Array.from(b.keys()));
    });
});
