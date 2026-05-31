// Apartment-layout COMBINED VALIDATOR-CALL SURFACE tests.
//
// Pins the public contract of `validateAndFormatLayout` — the one-call
// wrapper around adapter + orchestrator + formatter. The component layers
// are already covered by:
//
//   • `layoutAdapter.test.ts`           — adapter defaults / fallbacks
//   • `validatorOrchestrator.test.ts`   — 16 validators co-firing
//   • `reportFormatter.test.ts`         — Markdown render + grouping
//   • `dimensionalValidators.test.ts`   — per-G-class semantics
//   • `topologyValidators.test.ts`      — per-A-class semantics
//
// This file ONLY pins the COMPOSITION: that the wrapper threads opts.adapter
// into the adapter, opts.format into the formatter, returns the canonical
// `AggregatedViolationReport` unchanged, the same `summaryLine` we would
// have got from `formatViolationLine`, and the same `markdownReport` we
// would have got from `formatViolationReport` — all under one frozen
// envelope.
//
// summaryLine SOURCE: pinned to `formatViolationLine`, not `summarise`.
// Both helpers produce identical strings today; the wrapper uses the
// formatter helper because the formatter module is already imported for
// `markdownReport` (no extra coupling). See the "summary line provenance"
// describe block below.

import { describe, expect, it } from 'vitest';
import {
    formatViolationLine,
    formatViolationReport,
} from '../src/workflows/apartmentLayout/reporting/index.js';
import {
    summarise,
    toValidationInput,
    validateAndFormatLayout,
    validateApartmentLayout,
    type DtglLayoutDto,
} from '../src/workflows/apartmentLayout/validators/index.js';

// ── Fixtures ───────────────────────────────────────────────────────────────

const EMPTY_DTO: DtglLayoutDto = { rooms: [] };

/**
 * Four-room healthy apartment (entrance_hall + living + bedroom + bathroom),
 * realised adjacencies + apartment entrance. Every habitable room has
 * adequate frontage / glazing so no G-class fires. Adjacencies satisfy
 * every A-1 mandatory rule that fires in this room set:
 *   • entrance_hall ↔ living_room        (A-1 entrance must reach social)
 *   • bathroom ↔ entrance_hall           (A-1 bathroom must reach circulation)
 *   • bedroom ↔ bathroom                 (A-2 morning-routine preferred)
 */
const HEALTHY_4_ROOM_DTO: DtglLayoutDto = {
    rooms: [
        { id: 'h',  type: 'entrance_hall', rect: { w: 2.4, h: 3.0 },
            longestUsableWallM: 1.6 },
        { id: 'l',  type: 'living_room',   rect: { w: 5.0, h: 5.0 },
            externalFrontageM: 4.0, glazedAreaM2: 4.0 },
        { id: 'br', type: 'bedroom',       rect: { w: 3.5, h: 4.0 },
            externalFrontageM: 2.5, glazedAreaM2: 2.2 },
        { id: 'ba', type: 'bathroom',      rect: { w: 2.0, h: 2.5 },
            longestUsableWallM: 1.8 },
    ],
    edges: [
        { aId: 'h',  bId: 'l'  },
        { aId: 'h',  bId: 'br' },
        { aId: 'h',  bId: 'ba' },   // bathroom on the circulation core (A-1).
        { aId: 'br', bId: 'ba' },   // bedroom ↔ bathroom (A-2 preferred).
    ],
    entranceRoomId: 'h',
};

/**
 * One bedroom whose area exceeds G-1's 25 m² cap → ONE G-1 ERROR, nothing
 * else. Single-room layout (no edges) so A-classes have nothing to fire on.
 */
const G1_ERROR_DTO: DtglLayoutDto = {
    rooms: [
        { id: 'br', type: 'bedroom', rect: { w: 6.0, h: 5.0 },  // 30 m²
            externalFrontageM: 4.0, glazedAreaM2: 3.5,
            longestUsableWallM: 4.0 },
    ],
};

/**
 * Kitchen + living_room both EXIST in the apartment, but they are NOT
 * adjacent → ONE A-2 WARNING (preferred-adjacency `kitchen ↔ living_room`
 * "open-plan social flow when no separate dining"). Neither kitchen nor
 * living_room has an A-1 mandatory rule that fires here (`kitchen ↔ dining`
 * is gated on dining presence; living_room has no outgoing A-1), so the
 * report contains ONE A-2 warning and ZERO errors — the property the test
 * pins (warnings do not fail legality).
 *
 * Every habitable-room G-class is satisfied: each room has explicit frontage,
 * glazing and longestUsableWall above the thresholds in `limits.ts`.
 */
const A2_WARNING_DTO: DtglLayoutDto = {
    rooms: [
        { id: 'k', type: 'kitchen',     rect: { w: 3.5, h: 4.0 },
            externalFrontageM: 2.0, glazedAreaM2: 1.8,
            longestUsableWallM: 3.0 },
        { id: 'l', type: 'living_room', rect: { w: 5.0, h: 5.0 },
            externalFrontageM: 3.5, glazedAreaM2: 3.0,
            longestUsableWallM: 4.5 },
    ],
    edges: [],  // kitchen and living_room EXIST but are NOT adjacent.
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe('validateAndFormatLayout — empty DTO', () => {

    it('empty DTO → zero violations, passesLegality true', () => {
        const out = validateAndFormatLayout(EMPTY_DTO);
        expect(out.report.total).toBe(0);
        expect(out.report.errors).toBe(0);
        expect(out.report.warnings).toBe(0);
        expect(out.passesLegality).toBe(true);
    });

    it('empty DTO → summaryLine includes "0 violations"', () => {
        const out = validateAndFormatLayout(EMPTY_DTO);
        expect(out.summaryLine).toBe('0 violations');
    });

    it('empty DTO → markdownReport contains "No violations"', () => {
        const out = validateAndFormatLayout(EMPTY_DTO);
        expect(out.markdownReport).toContain('No violations');
        expect(out.markdownReport).toContain(
            '## Apartment Layout Validation Report',
        );
    });
});

describe('validateAndFormatLayout — healthy layout', () => {

    it('healthy 4-room apartment → zero violations, passesLegality true', () => {
        const out = validateAndFormatLayout(HEALTHY_4_ROOM_DTO);
        expect(out.report.dimensional).toEqual([]);
        expect(out.report.topology).toEqual([]);
        expect(out.report.errors).toBe(0);
        expect(out.report.warnings).toBe(0);
        expect(out.passesLegality).toBe(true);
        expect(out.summaryLine).toBe('0 violations');
        expect(out.markdownReport).toContain('No violations');
    });
});

describe('validateAndFormatLayout — single G-1 error', () => {

    it('G-1 error → passesLegality false, summaryLine mentions G-1', () => {
        const out = validateAndFormatLayout(G1_ERROR_DTO);
        expect(out.passesLegality).toBe(false);
        expect(out.report.errors).toBeGreaterThanOrEqual(1);
        // Exactly one G-1 in this single-bedroom DTO.
        expect(out.report.violationsByClass['G-1']).toBe(1);
        expect(out.summaryLine).toContain('G-1');
    });

    it('G-1 error → markdownReport includes "**G-1**" detail line', () => {
        const out = validateAndFormatLayout(G1_ERROR_DTO);
        expect(out.markdownReport).toContain('**G-1**');
        expect(out.markdownReport).toContain('### Dimensional violations');
    });
});

describe('validateAndFormatLayout — single A-2 warning', () => {

    it('A-2 warning → passesLegality TRUE (warnings do not fail legality)', () => {
        const out = validateAndFormatLayout(A2_WARNING_DTO);
        // A-2 kitchen↔living_room (open-plan social flow) fires once.
        expect(out.report.violationsByClass['A-2']).toBe(1);
        expect(out.report.warnings).toBeGreaterThanOrEqual(1);
        // Critical: zero errors ⇒ passesLegality === true.
        expect(out.report.errors).toBe(0);
        expect(out.passesLegality).toBe(true);
    });

    it('A-2 warning → markdownReport includes "**A-2**"', () => {
        const out = validateAndFormatLayout(A2_WARNING_DTO);
        expect(out.markdownReport).toContain('**A-2**');
        expect(out.markdownReport).toContain('### Topology violations');
    });
});

describe('validateAndFormatLayout — adapter option threading', () => {

    it('opts.adapter.defaultExternalFrontageM = 5 prevents G-7 firing on a habitable room', () => {
        // A bedroom with no explicit `externalFrontageM` would default to 0,
        // firing G-7 (bedrooms require ≥ 1.5 m frontage). With default 5,
        // the validator sees 5 m of frontage and stays quiet.
        const dto: DtglLayoutDto = {
            rooms: [{
                id: 'br', type: 'bedroom', rect: { w: 3, h: 4 },
                // Keep G-10 quiet with explicit glazing (so we isolate G-7).
                glazedAreaM2: 1.5,
            }],
        };

        // WITHOUT the override → G-7 fires.
        const baseline = validateAndFormatLayout(dto);
        const baselineG7 = baseline.report.dimensional
            .filter(v => v.classId === 'G-7').length;
        expect(baselineG7).toBeGreaterThanOrEqual(1);

        // WITH the override → no G-7.
        const overridden = validateAndFormatLayout(dto, {
            adapter: { defaultExternalFrontageM: 5 },
        });
        const overriddenG7 = overridden.report.dimensional
            .filter(v => v.classId === 'G-7').length;
        expect(overriddenG7).toBe(0);
    });
});

describe('validateAndFormatLayout — formatter option threading', () => {

    it('opts.format.verbose = false strips per-violation detail bullets', () => {
        const verboseOut  = validateAndFormatLayout(G1_ERROR_DTO);
        const terseOut    = validateAndFormatLayout(G1_ERROR_DTO,
            { format: { verbose: false } });

        // verbose=true → detail bullet present.
        expect(verboseOut.markdownReport).toContain('- **G-1**');
        // verbose=false → detail section header gone (and bullet gone).
        expect(terseOut.markdownReport).not.toContain(
            '### Dimensional violations',
        );
        expect(terseOut.markdownReport).not.toContain('- **G-1**');
        // The terse render must be SHORTER.
        expect(terseOut.markdownReport.length)
            .toBeLessThan(verboseOut.markdownReport.length);
    });

    it('opts.format.maxPerClass = 1 truncates the per-class lists', () => {
        // Two G-1 oversized bedrooms — verbose render should normally list
        // both. maxPerClass=1 forces a truncation marker.
        const dto: DtglLayoutDto = {
            rooms: [
                { id: 'br1', type: 'bedroom', rect: { w: 6.0, h: 5.0 },
                    externalFrontageM: 3, glazedAreaM2: 3 },
                { id: 'br2', type: 'bedroom', rect: { w: 7.0, h: 5.0 },
                    externalFrontageM: 3, glazedAreaM2: 3 },
            ],
        };
        const out = validateAndFormatLayout(dto, {
            format: { maxPerClass: 1 },
        });
        expect(out.markdownReport).toContain('- **G-1** [br1]');
        expect(out.markdownReport).not.toContain('- **G-1** [br2]');
        expect(out.markdownReport).toContain('more truncated');
    });

    it('opts.format.includeLegend = false removes the legend section', () => {
        const withLegend = validateAndFormatLayout(G1_ERROR_DTO);
        const noLegend   = validateAndFormatLayout(G1_ERROR_DTO,
            { format: { includeLegend: false } });

        expect(withLegend.markdownReport).toContain('### Legend');
        expect(noLegend.markdownReport).not.toContain('### Legend');
    });
});

describe('validateAndFormatLayout — frozen result', () => {

    it('result envelope is frozen', () => {
        const out = validateAndFormatLayout(EMPTY_DTO);
        expect(Object.isFrozen(out)).toBe(true);
    });

    it('cannot push to result.report.dimensional (orchestrator-frozen)', () => {
        const out = validateAndFormatLayout(G1_ERROR_DTO);
        expect(Object.isFrozen(out.report)).toBe(true);
        expect(Object.isFrozen(out.report.dimensional)).toBe(true);
        expect(Object.isFrozen(out.report.topology)).toBe(true);
        expect(() => {
            (out.report.dimensional as unknown as Array<unknown>).push({});
        }).toThrow();
        expect(() => {
            (out.report.topology as unknown as Array<unknown>).push({});
        }).toThrow();
    });

    it('cannot reassign envelope fields', () => {
        const out = validateAndFormatLayout(EMPTY_DTO);
        expect(() => {
            (out as unknown as { summaryLine: string }).summaryLine = 'tampered';
        }).toThrow();
    });
});

describe('validateAndFormatLayout — purity', () => {

    it('same DTO twice → byte-identical result fields', () => {
        const a = validateAndFormatLayout(HEALTHY_4_ROOM_DTO);
        const b = validateAndFormatLayout(HEALTHY_4_ROOM_DTO);
        expect(a.summaryLine).toBe(b.summaryLine);
        expect(a.markdownReport).toBe(b.markdownReport);
        expect(a.passesLegality).toBe(b.passesLegality);
        expect(a.report.total).toBe(b.report.total);
        expect(a.report.errors).toBe(b.report.errors);
        expect(a.report.warnings).toBe(b.report.warnings);
        expect(a.report.violationsByClass).toEqual(b.report.violationsByClass);
    });

    it('same DTO twice (with violations) → byte-identical result fields', () => {
        const a = validateAndFormatLayout(G1_ERROR_DTO);
        const b = validateAndFormatLayout(G1_ERROR_DTO);
        expect(a.summaryLine).toBe(b.summaryLine);
        expect(a.markdownReport).toBe(b.markdownReport);
    });
});

describe('validateAndFormatLayout — composition contract', () => {

    it('report field is shape-equivalent to direct orchestrator call', () => {
        const combined = validateAndFormatLayout(HEALTHY_4_ROOM_DTO);
        const direct = validateApartmentLayout(
            toValidationInput(HEALTHY_4_ROOM_DTO),
        );
        // Same shape, same field values — we don't require identity (the
        // wrapper builds a fresh orchestrator call per invocation).
        expect(combined.report.errors).toBe(direct.errors);
        expect(combined.report.warnings).toBe(direct.warnings);
        expect(combined.report.total).toBe(direct.total);
        expect(combined.report.dimensional).toEqual(direct.dimensional);
        expect(combined.report.topology).toEqual(direct.topology);
        expect(combined.report.violationsByClass)
            .toEqual(direct.violationsByClass);
    });

    it('markdownReport equals formatViolationReport(report, opts.format)', () => {
        const out = validateAndFormatLayout(G1_ERROR_DTO,
            { format: { verbose: false } });
        const expected = formatViolationReport(out.report,
            { verbose: false });
        expect(out.markdownReport).toBe(expected);
    });
});

describe('validateAndFormatLayout — summary line provenance', () => {

    // Pin the choice: the wrapper uses `formatViolationLine` (NOT
    // `summarise`). The two helpers DIFFER on the noun pluralisation of
    // `total === 1` — `formatViolationLine` says `"1 violation: ..."`
    // (singular), `summarise` says `"1 violations: ..."` (hardcoded plural).
    // The wrapper threads the more grammatically-correct formatter helper
    // because that module is already imported for `markdownReport` (no
    // extra coupling). These tests pin BOTH the positive ("matches
    // formatViolationLine") and the negative ("differs from summarise on
    // total=1") so a future refactor of either helper surfaces here.

    it('summaryLine matches formatViolationLine(report) — verbose case', () => {
        const out = validateAndFormatLayout(G1_ERROR_DTO);
        expect(out.summaryLine).toBe(formatViolationLine(out.report));
    });

    it('summaryLine matches formatViolationLine(report) — empty case', () => {
        const out = validateAndFormatLayout(EMPTY_DTO);
        expect(out.summaryLine).toBe(formatViolationLine(out.report));
    });

    it('summaryLine DIFFERS from summarise(report) when total === 1 (pluralisation)', () => {
        // Pinned to flag any future drift in either helper's pluralisation.
        const out = validateAndFormatLayout(G1_ERROR_DTO);
        expect(out.report.total).toBe(1);
        expect(out.summaryLine).toBe('1 violation: 1 error, 0 warnings (G-1×1)');
        expect(summarise(out.report)).toBe(
            '1 violations: 1 error, 0 warnings (G-1×1)',
        );
        expect(out.summaryLine).not.toBe(summarise(out.report));
    });

    it('summaryLine matches summarise(report) when total === 0 (both: "0 violations")', () => {
        const out = validateAndFormatLayout(EMPTY_DTO);
        // Both helpers short-circuit total=0 to the identical literal.
        expect(out.summaryLine).toBe(summarise(out.report));
        expect(out.summaryLine).toBe('0 violations');
    });
});
