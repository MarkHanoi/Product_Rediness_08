// L1-α-3 — formatDimensionalReport tests.

import { describe, expect, it } from 'vitest';
import { formatDimensionalReport } from '../src/workflows/apartmentLayout/dimensions/formatDimensionalReport.js';
import type {
    DimensionalReport,
} from '../src/workflows/apartmentLayout/dimensions/validateAllDimensional.js';
import type {
    DimensionalValidation,
    ValidationFinding,
} from '../src/workflows/apartmentLayout/dimensions/types.js';

function emptyVal(): DimensionalValidation {
    return { admissible: true, hardFindings: [], softFindings: [] };
}

function softFinding(roomId: string, metric = 'x'): ValidationFinding {
    return { roomId, severity: 'soft', metric, reason: 'soft test', delta: 0.5 };
}

function hardFinding(roomId: string, metric = 'x'): ValidationFinding {
    return { roomId, severity: 'hard', metric, reason: 'hard test', delta: 1 };
}

function makeReport(parts: Partial<DimensionalReport['perValidator']> = {}): DimensionalReport {
    const perValidator = {
        roomShape: parts.roomShape ?? emptyVal(),
        roomHierarchy: parts.roomHierarchy ?? emptyVal(),
        roomDaylight: parts.roomDaylight ?? emptyVal(),
        corridorWidth: parts.corridorWidth ?? emptyVal(),
    };
    const hardFindings = [
        ...perValidator.roomShape.hardFindings,
        ...perValidator.roomHierarchy.hardFindings,
        ...perValidator.roomDaylight.hardFindings,
        ...perValidator.corridorWidth.hardFindings,
    ];
    const softFindings = [
        ...perValidator.roomShape.softFindings,
        ...perValidator.roomHierarchy.softFindings,
        ...perValidator.roomDaylight.softFindings,
        ...perValidator.corridorWidth.softFindings,
    ];
    return {
        admissible: hardFindings.length === 0,
        hardFindings,
        softFindings,
        perValidator,
    };
}

describe('formatDimensionalReport — pass / warning / error', () => {
    it('all-clear report → overallSeverity pass', () => {
        const f = formatDimensionalReport(makeReport());
        expect(f.admissible).toBe(true);
        expect(f.overallSeverity).toBe('pass');
        expect(f.rooms).toEqual([]);
        expect(f.totals).toEqual({ errors: 0, warnings: 0 });
    });

    it('soft-only report → overallSeverity warning + admissible: true', () => {
        const f = formatDimensionalReport(
            makeReport({
                roomHierarchy: {
                    admissible: true,
                    hardFindings: [],
                    softFindings: [softFinding('m', 'masterSmallerThanBedroom')],
                },
            }),
        );
        expect(f.admissible).toBe(true);
        expect(f.overallSeverity).toBe('warning');
        expect(f.totals).toEqual({ errors: 0, warnings: 1 });
    });

    it('hard-finding report → overallSeverity error + admissible: false', () => {
        const f = formatDimensionalReport(
            makeReport({
                roomDaylight: {
                    admissible: false,
                    hardFindings: [hardFinding('m', 'noWindow')],
                    softFindings: [],
                },
            }),
        );
        expect(f.admissible).toBe(false);
        expect(f.overallSeverity).toBe('error');
        expect(f.totals).toEqual({ errors: 1, warnings: 0 });
    });
});

describe('formatDimensionalReport — sections', () => {
    it('always returns 4 sections in fixed order', () => {
        const f = formatDimensionalReport(makeReport());
        expect(f.sections.map((s) => s.id)).toEqual([
            'roomShape',
            'roomHierarchy',
            'roomDaylight',
            'corridorWidth',
        ]);
    });

    it('section status reflects sub-validator outcomes', () => {
        const f = formatDimensionalReport(
            makeReport({
                roomShape: emptyVal(), // pass
                roomHierarchy: {
                    admissible: true,
                    hardFindings: [],
                    softFindings: [softFinding('m')],
                }, // warning
                roomDaylight: {
                    admissible: false,
                    hardFindings: [hardFinding('m')],
                    softFindings: [],
                }, // error
                corridorWidth: emptyVal(), // pass
            }),
        );
        const byId = Object.fromEntries(f.sections.map((s) => [s.id, s.status]));
        expect(byId.roomShape).toBe('pass');
        expect(byId.roomHierarchy).toBe('warning');
        expect(byId.roomDaylight).toBe('error');
        expect(byId.corridorWidth).toBe('pass');
    });

    it('section counts mirror sub-validator finding counts', () => {
        const f = formatDimensionalReport(
            makeReport({
                roomShape: {
                    admissible: false,
                    hardFindings: [hardFinding('m'), hardFinding('b')],
                    softFindings: [softFinding('l')],
                },
            }),
        );
        const shape = f.sections.find((s) => s.id === 'roomShape')!;
        expect(shape.hardCount).toBe(2);
        expect(shape.softCount).toBe(1);
    });

    it('every section carries a non-empty displayName', () => {
        const f = formatDimensionalReport(makeReport());
        for (const s of f.sections) {
            expect(s.displayName.length).toBeGreaterThan(0);
        }
    });
});

describe('formatDimensionalReport — per-room rows', () => {
    it('groups findings by roomId', () => {
        const f = formatDimensionalReport(
            makeReport({
                roomHierarchy: {
                    admissible: true,
                    hardFindings: [],
                    softFindings: [
                        softFinding('m', 'h1'),
                        softFinding('m', 'h4'),
                        softFinding('b', 'h1'),
                    ],
                },
            }),
        );
        expect(f.rooms.length).toBe(2);
        const mRow = f.rooms.find((r) => r.roomId === 'm')!;
        expect(mRow.warnings.length).toBe(2);
        expect(mRow.worstSeverity).toBe('warning');
    });

    it('rooms with errors sort before rooms with only warnings', () => {
        const f = formatDimensionalReport(
            makeReport({
                roomShape: {
                    admissible: false,
                    hardFindings: [hardFinding('errorRoom')],
                    softFindings: [],
                },
                roomHierarchy: {
                    admissible: true,
                    hardFindings: [],
                    softFindings: [softFinding('warningRoom')],
                },
            }),
        );
        expect(f.rooms[0]!.roomId).toBe('errorRoom');
        expect(f.rooms[1]!.roomId).toBe('warningRoom');
    });

    it('a single room can carry both errors + warnings', () => {
        const f = formatDimensionalReport(
            makeReport({
                roomShape: {
                    admissible: false,
                    hardFindings: [hardFinding('m', 'g1Area')],
                    softFindings: [softFinding('m', 'g3Length')],
                },
            }),
        );
        const row = f.rooms.find((r) => r.roomId === 'm')!;
        expect(row.errors.length).toBe(1);
        expect(row.warnings.length).toBe(1);
        expect(row.worstSeverity).toBe('error'); // errors > warnings
    });

    it('formatted findings preserve metric / reason / severity / delta', () => {
        const f = formatDimensionalReport(
            makeReport({
                roomHierarchy: {
                    admissible: true,
                    hardFindings: [],
                    softFindings: [
                        {
                            roomId: 'm',
                            severity: 'soft',
                            metric: 'h1Specific',
                            reason: 'specific reason here',
                            delta: 0.42,
                        },
                    ],
                },
            }),
        );
        const row = f.rooms.find((r) => r.roomId === 'm')!;
        expect(row.warnings[0]).toEqual({
            metric: 'h1Specific',
            reason: 'specific reason here',
            severity: 'soft',
            delta: 0.42,
        });
    });
});
