// C26 REV-α-1 (Revit Round-Trip) — L0 Revit substrate tests.
//
// Covers (>= 24 cases per the REV-α-1 brief):
//   • RevitProjectMetadata — minimal valid (empty), each optional field,
//     rejects unknown discipline.
//   • RevitFamilyMapping — minimal, with parameterMap entries,
//     rejects empty pryzmFamilyId / revitFamilyName / revitTypeName /
//     revitCategory.
//   • RevitWorkset — minimal, with owner.
//   • RevitExportOptions — minimal, variant pinned to 'IFC4X3-RV',
//     rejects unknown coordinateMode, accepts each of the 3 modes,
//     full populated shape.
//   • RevitImportPayload — minimal, with each warning severity,
//     with unmappedFamilies, rejects unknown warning severity.
//   • Round-trip parses for idempotency (>= 3).

import { describe, expect, it } from 'vitest';
import {
    RevitProjectMetadataSchema,
    RevitDisciplineSchema,
    RevitFamilyMappingSchema,
    RevitWorksetSchema,
    RevitExportOptionsSchema,
    RevitCoordinateModeSchema,
    RevitImportPayloadSchema,
    RevitImportWarningSeveritySchema,
    type RevitProjectMetadata,
    type RevitFamilyMapping,
    type RevitWorkset,
    type RevitExportOptions,
    type RevitImportPayload,
    type RevitImportWarningSeverity,
    type RevitDiscipline,
    type RevitCoordinateMode,
} from '../src/revit/index.js';

describe('RevitProjectMetadataSchema', () => {
    it('accepts an empty object (every field is optional)', () => {
        const empty: RevitProjectMetadata = {};
        expect(RevitProjectMetadataSchema.parse(empty)).toEqual(empty);
    });

    it('accepts a revitVersion string', () => {
        const parsed = RevitProjectMetadataSchema.parse({ revitVersion: '2025.1' });
        expect(parsed.revitVersion).toBe('2025.1');
    });

    it('accepts sharedCoordinatesAcquired boolean', () => {
        expect(
            RevitProjectMetadataSchema.parse({ sharedCoordinatesAcquired: true })
                .sharedCoordinatesAcquired,
        ).toBe(true);
        expect(
            RevitProjectMetadataSchema.parse({ sharedCoordinatesAcquired: false })
                .sharedCoordinatesAcquired,
        ).toBe(false);
    });

    it('accepts projectBasePoint with optional angleToTrueNorth', () => {
        const withoutAngle = RevitProjectMetadataSchema.parse({
            projectBasePoint: { x: 1, y: 2, z: 3 },
        });
        expect(withoutAngle.projectBasePoint).toEqual({ x: 1, y: 2, z: 3 });
        const withAngle = RevitProjectMetadataSchema.parse({
            projectBasePoint: { x: 1, y: 2, z: 3, angleToTrueNorth: 0.5 },
        });
        expect(withAngle.projectBasePoint?.angleToTrueNorth).toBe(0.5);
    });

    it('accepts surveyPoint', () => {
        const parsed = RevitProjectMetadataSchema.parse({
            surveyPoint: { x: 10, y: 20, z: 0 },
        });
        expect(parsed.surveyPoint).toEqual({ x: 10, y: 20, z: 0 });
    });

    it('accepts each of the 6 disciplines', () => {
        const disciplines: RevitDiscipline[] = [
            'ARCHITECTURAL',
            'STRUCTURAL',
            'MECHANICAL',
            'ELECTRICAL',
            'PLUMBING',
            'COORDINATION',
        ];
        for (const discipline of disciplines) {
            const parsed = RevitProjectMetadataSchema.parse({ discipline });
            expect(parsed.discipline).toBe(discipline);
        }
    });

    it('rejects an unknown discipline', () => {
        expect(() =>
            RevitProjectMetadataSchema.parse({
                discipline: 'CIVIL' as RevitDiscipline,
            }),
        ).toThrow();
    });

    it('accepts a phaseFilter string', () => {
        const parsed = RevitProjectMetadataSchema.parse({ phaseFilter: 'Show Complete' });
        expect(parsed.phaseFilter).toBe('Show Complete');
    });

    it('exposes RevitDisciplineSchema for engine reuse', () => {
        expect(RevitDisciplineSchema.parse('ARCHITECTURAL')).toBe('ARCHITECTURAL');
        expect(() => RevitDisciplineSchema.parse('ZZZ')).toThrow();
    });
});

describe('RevitFamilyMappingSchema', () => {
    const minimal: RevitFamilyMapping = {
        pryzmFamilyId: 'family/door/single-flush',
        revitFamilyName: 'M_Door-Single-Flush',
        revitTypeName: '0915 x 2134mm',
        revitCategory: 'OST_Doors',
    };

    it('accepts a minimal mapping (no parameterMap)', () => {
        expect(RevitFamilyMappingSchema.parse(minimal)).toEqual(minimal);
    });

    it('accepts a mapping with parameterMap entries', () => {
        const full: RevitFamilyMapping = {
            ...minimal,
            parameterMap: [
                { pryzmParam: 'width', revitParam: 'Width' },
                { pryzmParam: 'height', revitParam: 'Height' },
            ],
        };
        expect(RevitFamilyMappingSchema.parse(full)).toEqual(full);
    });

    it('rejects an empty pryzmFamilyId', () => {
        expect(() =>
            RevitFamilyMappingSchema.parse({ ...minimal, pryzmFamilyId: '' }),
        ).toThrow();
    });

    it('rejects an empty revitFamilyName', () => {
        expect(() =>
            RevitFamilyMappingSchema.parse({ ...minimal, revitFamilyName: '' }),
        ).toThrow();
    });

    it('rejects an empty revitTypeName', () => {
        expect(() =>
            RevitFamilyMappingSchema.parse({ ...minimal, revitTypeName: '' }),
        ).toThrow();
    });

    it('rejects an empty revitCategory', () => {
        expect(() =>
            RevitFamilyMappingSchema.parse({ ...minimal, revitCategory: '' }),
        ).toThrow();
    });

    it('rejects parameterMap entries with empty pryzmParam', () => {
        expect(() =>
            RevitFamilyMappingSchema.parse({
                ...minimal,
                parameterMap: [{ pryzmParam: '', revitParam: 'Width' }],
            }),
        ).toThrow();
    });
});

describe('RevitWorksetSchema', () => {
    const minimal: RevitWorkset = {
        id: 'ws-1',
        name: 'Shell',
        isOpen: true,
        isEditable: true,
    };

    it('accepts a minimal workset (no owner)', () => {
        expect(RevitWorksetSchema.parse(minimal)).toEqual(minimal);
    });

    it('accepts a workset with owner', () => {
        const full: RevitWorkset = { ...minimal, owner: 'MH' };
        expect(RevitWorksetSchema.parse(full)).toEqual(full);
    });

    it('rejects an empty workset id', () => {
        expect(() => RevitWorksetSchema.parse({ ...minimal, id: '' })).toThrow();
    });

    it('rejects an empty workset name', () => {
        expect(() => RevitWorksetSchema.parse({ ...minimal, name: '' })).toThrow();
    });
});

describe('RevitExportOptionsSchema', () => {
    const minimal: RevitExportOptions = {
        variant: 'IFC4X3-RV',
        targetVersion: '2025.1',
        includeRevitGuidPsets: true,
    };

    it('accepts a minimal export options envelope', () => {
        expect(RevitExportOptionsSchema.parse(minimal)).toEqual(minimal);
    });

    it('pins variant to IFC4X3-RV (rejects anything else)', () => {
        expect(() =>
            RevitExportOptionsSchema.parse({
                ...minimal,
                variant: 'IFC4' as 'IFC4X3-RV',
            }),
        ).toThrow();
        expect(() =>
            RevitExportOptionsSchema.parse({
                ...minimal,
                variant: 'IFC2X3' as 'IFC4X3-RV',
            }),
        ).toThrow();
        expect(() =>
            RevitExportOptionsSchema.parse({
                ...minimal,
                variant: 'IFC4X3' as 'IFC4X3-RV',
            }),
        ).toThrow();
    });

    it('rejects an unknown coordinateMode', () => {
        expect(() =>
            RevitExportOptionsSchema.parse({
                ...minimal,
                coordinateMode: 'world-origin' as RevitCoordinateMode,
            }),
        ).toThrow();
    });

    it('accepts each of the 3 coordinate modes', () => {
        const modes: RevitCoordinateMode[] = [
            'project-base-point',
            'survey-point',
            'internal-origin',
        ];
        for (const coordinateMode of modes) {
            const parsed = RevitExportOptionsSchema.parse({ ...minimal, coordinateMode });
            expect(parsed.coordinateMode).toBe(coordinateMode);
        }
    });

    it('accepts a fully populated shape', () => {
        const full: RevitExportOptions = {
            variant: 'IFC4X3-RV',
            targetVersion: '2025.1',
            includeRevitGuidPsets: true,
            projectMetadata: {
                revitVersion: '2025.1',
                sharedCoordinatesAcquired: true,
                projectBasePoint: { x: 0, y: 0, z: 0, angleToTrueNorth: 0 },
                surveyPoint: { x: 100, y: 200, z: 0 },
                discipline: 'ARCHITECTURAL',
                phaseFilter: 'New Construction',
            },
            familyMappings: [
                {
                    pryzmFamilyId: 'family/door/single-flush',
                    revitFamilyName: 'M_Door-Single-Flush',
                    revitTypeName: '0915 x 2134mm',
                    revitCategory: 'OST_Doors',
                    parameterMap: [{ pryzmParam: 'width', revitParam: 'Width' }],
                },
            ],
            worksets: [
                { id: 'ws-1', name: 'Shell', isOpen: true, isEditable: true, owner: 'MH' },
            ],
            includeRoomNumbers: true,
            includeLevelElevations: true,
            coordinateMode: 'project-base-point',
        };
        expect(RevitExportOptionsSchema.parse(full)).toEqual(full);
    });

    it('rejects an empty targetVersion', () => {
        expect(() =>
            RevitExportOptionsSchema.parse({ ...minimal, targetVersion: '' }),
        ).toThrow();
    });

    it('exposes RevitCoordinateModeSchema for engine reuse', () => {
        expect(RevitCoordinateModeSchema.parse('project-base-point')).toBe(
            'project-base-point',
        );
        expect(() => RevitCoordinateModeSchema.parse('nope')).toThrow();
    });
});

describe('RevitImportPayloadSchema', () => {
    const minimal: RevitImportPayload = {
        sourceFilename: 'project.ifc',
        sourceVersion: '2025.1',
        importedAt: '2026-06-01T09:00:00Z',
        elementsImported: 0,
        psetsImported: 0,
        familiesImported: 0,
        warnings: [],
        unmappedFamilies: [],
    };

    it('accepts a minimal payload (no warnings, no unmappedFamilies)', () => {
        expect(RevitImportPayloadSchema.parse(minimal)).toEqual(minimal);
    });

    it('accepts warnings of each severity', () => {
        const severities: RevitImportWarningSeverity[] = ['info', 'warning', 'error'];
        for (const severity of severities) {
            const parsed = RevitImportPayloadSchema.parse({
                ...minimal,
                warnings: [{ severity, message: `a ${severity} message` }],
            });
            expect(parsed.warnings[0]?.severity).toBe(severity);
        }
    });

    it('accepts unmappedFamilies entries', () => {
        const parsed = RevitImportPayloadSchema.parse({
            ...minimal,
            unmappedFamilies: ['M_Generic-Model', 'CustomThing'],
        });
        expect(parsed.unmappedFamilies).toEqual(['M_Generic-Model', 'CustomThing']);
    });

    it('rejects an unknown warning severity', () => {
        expect(() =>
            RevitImportPayloadSchema.parse({
                ...minimal,
                warnings: [
                    { severity: 'critical' as RevitImportWarningSeverity, message: 'x' },
                ],
            }),
        ).toThrow();
    });

    it('rejects a negative elementsImported count', () => {
        expect(() =>
            RevitImportPayloadSchema.parse({ ...minimal, elementsImported: -1 }),
        ).toThrow();
    });

    it('rejects a non-integer psetsImported count', () => {
        expect(() =>
            RevitImportPayloadSchema.parse({ ...minimal, psetsImported: 1.5 }),
        ).toThrow();
    });

    it('rejects an unparseable importedAt', () => {
        expect(() =>
            RevitImportPayloadSchema.parse({ ...minimal, importedAt: 'never' }),
        ).toThrow();
    });

    it('accepts warning entries with elementId', () => {
        const parsed = RevitImportPayloadSchema.parse({
            ...minimal,
            warnings: [
                {
                    severity: 'warning',
                    message: 'orphan door, no host wall found',
                    elementId: 'door-7',
                },
            ],
        });
        expect(parsed.warnings[0]?.elementId).toBe('door-7');
    });

    it('exposes RevitImportWarningSeveritySchema for engine reuse', () => {
        expect(RevitImportWarningSeveritySchema.parse('info')).toBe('info');
        expect(() => RevitImportWarningSeveritySchema.parse('debug')).toThrow();
    });
});

describe('round-trip idempotence', () => {
    it('RevitProjectMetadata — parse(parse(x)) === parse(x)', () => {
        const m: RevitProjectMetadata = {
            revitVersion: '2025.1',
            sharedCoordinatesAcquired: true,
            projectBasePoint: { x: 1, y: 2, z: 3, angleToTrueNorth: 0.25 },
            surveyPoint: { x: 100, y: 200, z: 0 },
            discipline: 'ARCHITECTURAL',
            phaseFilter: 'New Construction',
        };
        const once = RevitProjectMetadataSchema.parse(m);
        const twice = RevitProjectMetadataSchema.parse(once);
        expect(twice).toEqual(once);
    });

    it('RevitExportOptions — parse(parse(x)) === parse(x)', () => {
        const opts: RevitExportOptions = {
            variant: 'IFC4X3-RV',
            targetVersion: '2025.1',
            includeRevitGuidPsets: true,
            projectMetadata: {
                discipline: 'STRUCTURAL',
                revitVersion: '2024.2',
            },
            familyMappings: [
                {
                    pryzmFamilyId: 'family/wall/basic',
                    revitFamilyName: 'Basic Wall',
                    revitTypeName: 'Generic - 200mm',
                    revitCategory: 'OST_Walls',
                },
            ],
            worksets: [
                { id: 'ws-1', name: 'Shell', isOpen: true, isEditable: true },
            ],
            includeRoomNumbers: true,
            includeLevelElevations: true,
            coordinateMode: 'survey-point',
        };
        const once = RevitExportOptionsSchema.parse(opts);
        const twice = RevitExportOptionsSchema.parse(once);
        expect(twice).toEqual(once);
    });

    it('RevitImportPayload — parse(parse(x)) === parse(x)', () => {
        const payload: RevitImportPayload = {
            sourceFilename: 'project.ifc',
            sourceVersion: '2025.1',
            importedAt: '2026-06-01T09:00:00Z',
            elementsImported: 42,
            psetsImported: 100,
            familiesImported: 12,
            warnings: [
                { severity: 'info', message: 'translated 12 families' },
                { severity: 'warning', message: 'phase filter dropped' },
                {
                    severity: 'error',
                    message: 'orphan door',
                    elementId: 'door-7',
                },
            ],
            unmappedFamilies: ['M_Generic-Model'],
        };
        const once = RevitImportPayloadSchema.parse(payload);
        const twice = RevitImportPayloadSchema.parse(once);
        expect(twice).toEqual(once);
    });

    it('RevitFamilyMapping — parse(parse(x)) === parse(x)', () => {
        const m: RevitFamilyMapping = {
            pryzmFamilyId: 'family/window/casement',
            revitFamilyName: 'M_Window-Casement',
            revitTypeName: '0610 x 1220mm',
            revitCategory: 'OST_Windows',
            parameterMap: [
                { pryzmParam: 'width', revitParam: 'Width' },
                { pryzmParam: 'height', revitParam: 'Height' },
                { pryzmParam: 'sillHeight', revitParam: 'Sill Height' },
            ],
        };
        const once = RevitFamilyMappingSchema.parse(m);
        const twice = RevitFamilyMappingSchema.parse(once);
        expect(twice).toEqual(once);
    });
});
