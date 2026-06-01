/**
 * IFC4X3-RV variant exporter shim tests — C26 RVT-α-2 (2026-06-01).
 *
 * Covers `plugins/ifc-export/src/exporters/revit-variant.ts` per master plan
 * §9.2 (RVT-α-2). Exit criteria: every Revit-variant writer (Pset_RevitType,
 * Pset_RevitInstance, IfcGroup workset, Pset_SiteRevitVariant) opens its own
 * `pryzm.ifc.export-*` span (P8) and emits the right entity-write sequence.
 *
 * Strategy: mock the web-ifc helper + guid-provider + OpenTelemetry layers
 * with light spies so we can assert on the exact entity-write call sequence
 * and the span attributes WITHOUT spinning up the full IfcAPI / wasm. Same
 * pattern as `zone.test.ts` (α-3) and `pset-wall-common.test.ts` (α-4).
 *
 * Test count: 27 (well above the ≥ 20 floor).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as WebIFC from 'web-ifc';

// ---------------------------------------------------------------------------
// Mocks — hoisted by Vitest so the SUT picks them up
// ---------------------------------------------------------------------------

vi.mock('../src/api/webifc-helpers.js', () => {
    return {
        label: (_api: unknown, _modelId: number, value: string) => ({
            kind: 'label',
            value,
        }),
        text: (_api: unknown, _modelId: number, value: string) => ({
            kind: 'text',
            value,
        }),
        identifier: (_api: unknown, _modelId: number, value: string) => ({
            kind: 'identifier',
            value,
        }),
        real: (_api: unknown, _modelId: number, value: number) => ({
            kind: 'real',
            value,
        }),
        boolean: (_api: unknown, _modelId: number, value: boolean) => ({
            kind: 'boolean',
            value,
        }),
        writeEntity: vi.fn(),
    };
});

vi.mock('../src/guid-provider.js', () => {
    return {
        mintGlobalId: vi.fn(() => 'STUB-GLOBAL-ID-1234567890'),
    };
});

// OpenTelemetry: capture span lifecycle + attributes via an in-memory mock.
interface CapturedSpan {
    name: string;
    attributes: Record<string, string | number | boolean>;
    ended: boolean;
    status: 'unset' | 'ok' | 'error';
}

const capturedSpans: CapturedSpan[] = [];

vi.mock('@opentelemetry/api', async () => {
    const SpanStatusCode = { OK: 1, ERROR: 2, UNSET: 0 } as const;
    return {
        SpanStatusCode,
        trace: {
            getTracer: () => ({
                startSpan: (name: string) => {
                    const captured: CapturedSpan = {
                        name,
                        attributes: {},
                        ended: false,
                        status: 'unset',
                    };
                    capturedSpans.push(captured);
                    return {
                        setAttribute(k: string, v: string | number | boolean) {
                            captured.attributes[k] = v;
                            return this;
                        },
                        setStatus(s: { code: number }) {
                            captured.status =
                                s.code === SpanStatusCode.OK
                                    ? 'ok'
                                    : s.code === SpanStatusCode.ERROR
                                      ? 'error'
                                      : 'unset';
                            return this;
                        },
                        recordException() {
                            return this;
                        },
                        end() {
                            captured.ended = true;
                        },
                    };
                },
            }),
        },
    };
});

import {
    writeEntity as writeEntityMock,
} from '../src/api/webifc-helpers.js';
import { mintGlobalId as mintGlobalIdMock } from '../src/guid-provider.js';
import type { RevitExportOptions, RevitWorkset } from '@pryzm/schemas';
import {
    applyCoordinateMode,
    assertRevitVariant,
    REVIT_WORKSET_OBJECT_TYPE,
    writePsetRevitInstance,
    writePsetRevitType,
    writeRevitWorksetGroups,
    type ExportCtx,
} from '../src/exporters/revit-variant.js';

// ---------------------------------------------------------------------------
// Test scaffolding
// ---------------------------------------------------------------------------

let entityCounter = 0;
function nextEntityRef(type: number): { expressID: number; type: number } {
    entityCounter += 1;
    return { expressID: entityCounter, type };
}

interface RecordedWrite {
    type: number;
    attrs: unknown[];
    ref: { expressID: number; type: number };
}

const recordedWrites: RecordedWrite[] = [];

function ctx(): ExportCtx {
    return {
        api: {} as never,
        modelId: 0,
        ownerRefs: {
            ownerHistory: { expressID: 1, type: WebIFC.IFCOWNERHISTORY } as never,
            application: { expressID: 2, type: WebIFC.IFCAPPLICATION } as never,
            personAndOrganization: {
                expressID: 3,
                type: WebIFC.IFCPERSONANDORGANIZATION,
            } as never,
        },
        guid: undefined,
    };
}

function baseOptions(
    overrides: Partial<RevitExportOptions> = {},
): RevitExportOptions {
    return {
        variant: 'IFC4X3-RV',
        targetVersion: '2025.1',
        includeRevitGuidPsets: true,
        ...overrides,
    };
}

function workset(
    id: string,
    name: string,
    isOpen: boolean,
    isEditable = true,
): RevitWorkset {
    return { id, name, isOpen, isEditable };
}

beforeEach(() => {
    entityCounter = 100;
    recordedWrites.length = 0;
    capturedSpans.length = 0;
    vi.mocked(writeEntityMock).mockReset();
    vi.mocked(writeEntityMock).mockImplementation(
        (_api: unknown, _modelId: number, type: number, ...attrs: unknown[]) => {
            const ref = nextEntityRef(type);
            recordedWrites.push({ type, attrs, ref });
            return ref as never;
        },
    );
    vi.mocked(mintGlobalIdMock).mockReset();
    let guidCounter = 0;
    vi.mocked(mintGlobalIdMock).mockImplementation(() => {
        guidCounter += 1;
        return `GUID-${guidCounter.toString().padStart(18, '0')}`;
    });
});

function findWritesOfType(type: number): RecordedWrite[] {
    return recordedWrites.filter((w) => w.type === type);
}

function findPsetByName(name: string): RecordedWrite | undefined {
    return findWritesOfType(WebIFC.IFCPROPERTYSET).find((w) => {
        const nameAttr = w.attrs[2] as { kind: string; value: string } | null;
        return nameAttr?.value === name;
    });
}

function spanNames(): string[] {
    return capturedSpans.map((s) => s.name);
}

// ---------------------------------------------------------------------------
// assertRevitVariant
// ---------------------------------------------------------------------------

describe('assertRevitVariant — variant gate', () => {
    it('accepts variant === "IFC4X3-RV" (no throw)', () => {
        expect(() => assertRevitVariant(baseOptions())).not.toThrow();
    });

    it('rejects variant "IFC4"', () => {
        // The Zod schema would normally guard this; the runtime gate exists
        // for misconfigured / hand-built option bags. We cast to bypass the
        // type system the same way a misconfigured caller might.
        const bad = { ...baseOptions(), variant: 'IFC4' } as unknown as RevitExportOptions;
        expect(() => assertRevitVariant(bad)).toThrow(/IFC4X3-RV/);
    });

    it('rejects variant "IFC2X3"', () => {
        const bad = { ...baseOptions(), variant: 'IFC2X3' } as unknown as RevitExportOptions;
        expect(() => assertRevitVariant(bad)).toThrow(/IFC4X3-RV/);
    });

    it('rejects variant "IFC4X3" (vanilla, not the -RV variant)', () => {
        const bad = { ...baseOptions(), variant: 'IFC4X3' } as unknown as RevitExportOptions;
        expect(() => assertRevitVariant(bad)).toThrow(/IFC4X3-RV/);
    });

    it('rejects an arbitrary unknown variant string', () => {
        const bad = { ...baseOptions(), variant: 'BANANA' } as unknown as RevitExportOptions;
        expect(() => assertRevitVariant(bad)).toThrow(/IFC4X3-RV/);
    });
});

// ---------------------------------------------------------------------------
// writePsetRevitType
// ---------------------------------------------------------------------------

describe('writePsetRevitType', () => {
    it('emits one IfcPropertySet + one IfcRelDefinesByProperties', () => {
        writePsetRevitType(42, { targetVersion: '2025.1' }, ctx());
        expect(findWritesOfType(WebIFC.IFCPROPERTYSET)).toHaveLength(1);
        expect(findWritesOfType(WebIFC.IFCRELDEFINESBYPROPERTIES)).toHaveLength(
            1,
        );
    });

    it('Pset Name === "Pset_RevitType"', () => {
        writePsetRevitType(42, { targetVersion: '2025.1' }, ctx());
        const pset = findPsetByName('Pset_RevitType');
        expect(pset).toBeDefined();
        const nameAttr = pset!.attrs[2] as { kind: string; value: string };
        expect(nameAttr).toEqual({ kind: 'label', value: 'Pset_RevitType' });
    });

    it('RevitTargetVersion property carries the targetVersion string', () => {
        writePsetRevitType(42, { targetVersion: '2026.0' }, ctx());
        const props = findWritesOfType(WebIFC.IFCPROPERTYSINGLEVALUE);
        expect(props).toHaveLength(1);
        // IfcPropertySingleValue(Name, Description, NominalValue, Unit)
        const nameAttr = props[0].attrs[0] as { kind: string; value: string };
        const valueAttr = props[0].attrs[2] as { kind: string; value: string };
        expect(nameAttr).toEqual({ kind: 'label', value: 'RevitTargetVersion' });
        expect(valueAttr).toEqual({ kind: 'label', value: '2026.0' });
    });

    it('mints a GlobalId for BOTH the IfcPropertySet AND the IfcRelDefinesByProperties', () => {
        writePsetRevitType(42, { targetVersion: '2025.1' }, ctx());
        // Two GlobalIds expected: one for the pset, one for the rel.
        expect(vi.mocked(mintGlobalIdMock).mock.calls.length).toBe(2);
    });

    it('span name = "pryzm.ifc.export-pset-revit-type" and ends OK', () => {
        writePsetRevitType(42, { targetVersion: '2025.1' }, ctx());
        const span = capturedSpans.find(
            (s) => s.name === 'pryzm.ifc.export-pset-revit-type',
        );
        expect(span).toBeDefined();
        expect(span!.ended).toBe(true);
        expect(span!.status).toBe('ok');
        expect(span!.attributes.targetVersion).toBe('2025.1');
        expect(span!.attributes.typeRef).toBe(42);
    });
});

// ---------------------------------------------------------------------------
// writePsetRevitInstance
// ---------------------------------------------------------------------------

describe('writePsetRevitInstance', () => {
    it('emits one IfcPropertySet + one IfcRelDefinesByProperties', () => {
        writePsetRevitInstance(101, {}, ctx());
        expect(findWritesOfType(WebIFC.IFCPROPERTYSET)).toHaveLength(1);
        expect(findWritesOfType(WebIFC.IFCRELDEFINESBYPROPERTIES)).toHaveLength(
            1,
        );
    });

    it('Pset Name === "Pset_RevitInstance"', () => {
        writePsetRevitInstance(101, {}, ctx());
        expect(findPsetByName('Pset_RevitInstance')).toBeDefined();
    });

    it('defaults instanceMarker to "PRYZM-EXPORT" when not supplied', () => {
        writePsetRevitInstance(101, {}, ctx());
        const props = findWritesOfType(WebIFC.IFCPROPERTYSINGLEVALUE);
        const valueAttr = props[0].attrs[2] as { kind: string; value: string };
        expect(valueAttr).toEqual({ kind: 'label', value: 'PRYZM-EXPORT' });
    });

    it('respects a custom instanceMarker', () => {
        writePsetRevitInstance(101, { instanceMarker: 'wall_abc123' }, ctx());
        const props = findWritesOfType(WebIFC.IFCPROPERTYSINGLEVALUE);
        const nameAttr = props[0].attrs[0] as { kind: string; value: string };
        const valueAttr = props[0].attrs[2] as { kind: string; value: string };
        expect(nameAttr.value).toBe('RevitInstanceMarker');
        expect(valueAttr).toEqual({ kind: 'label', value: 'wall_abc123' });
    });

    it('span name = "pryzm.ifc.export-pset-revit-instance"', () => {
        writePsetRevitInstance(
            101,
            { instanceMarker: 'PRYZM-EXPORT-wall1' },
            ctx(),
        );
        const span = capturedSpans.find(
            (s) => s.name === 'pryzm.ifc.export-pset-revit-instance',
        );
        expect(span).toBeDefined();
        expect(span!.status).toBe('ok');
        expect(span!.attributes.instanceMarker).toBe('PRYZM-EXPORT-wall1');
        expect(span!.attributes.elementRef).toBe(101);
    });
});

// ---------------------------------------------------------------------------
// writeRevitWorksetGroups
// ---------------------------------------------------------------------------

describe('writeRevitWorksetGroups', () => {
    it('two worksets WITH members → 2 IfcGroups + 2 IfcRelAssignsToGroup', () => {
        const worksets: RevitWorkset[] = [
            workset('ws_a', 'Architecture', true),
            workset('ws_b', 'Structure', false),
        ];
        const members = new Map<string, ReadonlyArray<number>>([
            ['ws_a', [201, 202]],
            ['ws_b', [301]],
        ]);
        const result = writeRevitWorksetGroups(worksets, members, ctx());
        expect(result.groupCount).toBe(2);
        expect(result.relCount).toBe(2);
        expect(findWritesOfType(WebIFC.IFCGROUP)).toHaveLength(2);
        expect(findWritesOfType(WebIFC.IFCRELASSIGNSTOGROUP)).toHaveLength(2);
    });

    it('workset with NO resolved members → IfcGroup is emitted but NO IfcRelAssignsToGroup', () => {
        const worksets: RevitWorkset[] = [workset('ws_lonely', 'Lonely', true)];
        const result = writeRevitWorksetGroups(
            worksets,
            new Map(),
            ctx(),
        );
        expect(result.groupCount).toBe(1);
        expect(result.relCount).toBe(0);
        expect(findWritesOfType(WebIFC.IFCGROUP)).toHaveLength(1);
        expect(findWritesOfType(WebIFC.IFCRELASSIGNSTOGROUP)).toHaveLength(0);
    });

    it('empty worksets array → 0 groups, 0 rels, NO entity writes', () => {
        const result = writeRevitWorksetGroups([], new Map(), ctx());
        expect(result.groupCount).toBe(0);
        expect(result.relCount).toBe(0);
        expect(recordedWrites).toHaveLength(0);
    });

    it('workset isOpen=true → IfcGroup.Description = "Open"', () => {
        writeRevitWorksetGroups(
            [workset('ws_open', 'WSO', true)],
            new Map(),
            ctx(),
        );
        const groups = findWritesOfType(WebIFC.IFCGROUP);
        // IfcGroup(GlobalId=0, OwnerHistory=1, Name=2, Description=3, ObjectType=4)
        const description = groups[0].attrs[3] as { kind: string; value: string };
        expect(description).toEqual({ kind: 'text', value: 'Open' });
    });

    it('workset isOpen=false → IfcGroup.Description = "Closed"', () => {
        writeRevitWorksetGroups(
            [workset('ws_closed', 'WSC', false)],
            new Map(),
            ctx(),
        );
        const groups = findWritesOfType(WebIFC.IFCGROUP);
        const description = groups[0].attrs[3] as { kind: string; value: string };
        expect(description).toEqual({ kind: 'text', value: 'Closed' });
    });

    it('workset ObjectType === "Revit Workset"', () => {
        writeRevitWorksetGroups(
            [workset('ws_x', 'X', true)],
            new Map(),
            ctx(),
        );
        const groups = findWritesOfType(WebIFC.IFCGROUP);
        const objectType = groups[0].attrs[4] as { kind: string; value: string };
        expect(objectType).toEqual({
            kind: 'label',
            value: REVIT_WORKSET_OBJECT_TYPE,
        });
        expect(REVIT_WORKSET_OBJECT_TYPE).toBe('Revit Workset');
    });

    it('opens one "pryzm.ifc.export-revit-workset" span per workset', () => {
        const worksets: RevitWorkset[] = [
            workset('ws_1', 'One', true),
            workset('ws_2', 'Two', false),
            workset('ws_3', 'Three', true),
        ];
        writeRevitWorksetGroups(worksets, new Map(), ctx());
        const wsSpans = capturedSpans.filter(
            (s) => s.name === 'pryzm.ifc.export-revit-workset',
        );
        expect(wsSpans).toHaveLength(3);
        expect(wsSpans.every((s) => s.ended && s.status === 'ok')).toBe(true);
        expect(wsSpans.map((s) => s.attributes.worksetId).sort()).toEqual([
            'ws_1',
            'ws_2',
            'ws_3',
        ]);
    });

    it('IfcRelAssignsToGroup.RelatedObjects contains the supplied member refs', () => {
        writeRevitWorksetGroups(
            [workset('ws_m', 'Members', true)],
            new Map([['ws_m', [501, 502, 503]]]),
            ctx(),
        );
        const rels = findWritesOfType(WebIFC.IFCRELASSIGNSTOGROUP);
        // RelatedObjects is positional arg index 4.
        const related = rels[0].attrs[4] as ReadonlyArray<number>;
        expect(related).toEqual([501, 502, 503]);
    });
});

// ---------------------------------------------------------------------------
// applyCoordinateMode
// ---------------------------------------------------------------------------

describe('applyCoordinateMode', () => {
    it('writes a Pset_SiteRevitVariant stub for "project-base-point"', () => {
        applyCoordinateMode(700, 'project-base-point', ctx());
        const pset = findPsetByName('Pset_SiteRevitVariant');
        expect(pset).toBeDefined();
        expect(findWritesOfType(WebIFC.IFCRELDEFINESBYPROPERTIES)).toHaveLength(
            1,
        );
    });

    it('accepts all 3 coordinate-mode values', () => {
        const modes = [
            'project-base-point',
            'survey-point',
            'internal-origin',
        ] as const;
        for (const mode of modes) {
            entityCounter = 100;
            recordedWrites.length = 0;
            capturedSpans.length = 0;
            applyCoordinateMode(700, mode, ctx());
            const props = findWritesOfType(WebIFC.IFCPROPERTYSINGLEVALUE);
            const valueAttr = props[0].attrs[2] as {
                kind: string;
                value: string;
            };
            expect(valueAttr).toEqual({ kind: 'label', value: mode });
        }
    });

    it('span name = "pryzm.ifc.export-revit-coord-mode" and carries the mode attribute', () => {
        applyCoordinateMode(700, 'survey-point', ctx());
        const span = capturedSpans.find(
            (s) => s.name === 'pryzm.ifc.export-revit-coord-mode',
        );
        expect(span).toBeDefined();
        expect(span!.status).toBe('ok');
        expect(span!.attributes.coordinateMode).toBe('survey-point');
        expect(span!.attributes.siteRef).toBe(700);
    });
});

// ---------------------------------------------------------------------------
// Round-trip + agnosticism
// ---------------------------------------------------------------------------

describe('round-trip + element-type agnosticism', () => {
    it('round-trip: assertRevitVariant + writePsetRevitType + writePsetRevitInstance + writeRevitWorksetGroups in sequence', () => {
        const opts = baseOptions({
            worksets: [
                workset('ws_arch', 'Architecture', true),
                workset('ws_str', 'Structure', false),
            ],
        });
        const c = ctx();

        // 1. Variant gate.
        expect(() => assertRevitVariant(opts)).not.toThrow();

        // 2. Type pset on a single IfcType.
        writePsetRevitType(50, { targetVersion: opts.targetVersion }, c);

        // 3. Instance psets on two elements.
        writePsetRevitInstance(
            101,
            { instanceMarker: 'PRYZM-EXPORT-w1' },
            c,
        );
        writePsetRevitInstance(
            102,
            { instanceMarker: 'PRYZM-EXPORT-d1' },
            c,
        );

        // 4. Worksets — no members map → groups only.
        const wsResult = writeRevitWorksetGroups(
            opts.worksets!,
            new Map(),
            c,
        );

        // Property sets: Pset_RevitType + 2× Pset_RevitInstance = 3.
        expect(findWritesOfType(WebIFC.IFCPROPERTYSET)).toHaveLength(3);
        // IfcRelDefinesByProperties = 1 (type) + 2 (instance) = 3.
        expect(findWritesOfType(WebIFC.IFCRELDEFINESBYPROPERTIES)).toHaveLength(
            3,
        );
        // 2 groups, no rels (empty member map).
        expect(wsResult.groupCount).toBe(2);
        expect(wsResult.relCount).toBe(0);

        // Spans expected: 1 type + 2 instance + 2 workset.
        const ns = spanNames();
        expect(
            ns.filter((n) => n === 'pryzm.ifc.export-pset-revit-type'),
        ).toHaveLength(1);
        expect(
            ns.filter((n) => n === 'pryzm.ifc.export-pset-revit-instance'),
        ).toHaveLength(2);
        expect(
            ns.filter((n) => n === 'pryzm.ifc.export-revit-workset'),
        ).toHaveLength(2);
    });

    it('writers are agnostic of element type — none of IFCWALL / IFCDOOR / IFCWINDOW / IFCSLAB appear in recorded write types', () => {
        // typeRef / elementRef / siteRef are integers — they do NOT
        // determine the produced entity types. The writers should ONLY
        // produce IFCPROPERTYSET / IFCRELDEFINESBYPROPERTIES /
        // IFCPROPERTYSINGLEVALUE / IFCGROUP / IFCRELASSIGNSTOGROUP.
        writePsetRevitType(1, { targetVersion: '2025.1' }, ctx());
        writePsetRevitInstance(2, {}, ctx());
        writeRevitWorksetGroups(
            [workset('ws', 'W', true)],
            new Map([['ws', [3]]]),
            ctx(),
        );
        applyCoordinateMode(4, 'project-base-point', ctx());

        const writtenTypes = new Set(recordedWrites.map((w) => w.type));
        expect(writtenTypes.has(WebIFC.IFCWALL)).toBe(false);
        expect(writtenTypes.has(WebIFC.IFCDOOR)).toBe(false);
        expect(writtenTypes.has(WebIFC.IFCWINDOW)).toBe(false);
        expect(writtenTypes.has(WebIFC.IFCSLAB)).toBe(false);

        // Conversely — every expected type DID appear.
        expect(writtenTypes.has(WebIFC.IFCPROPERTYSET)).toBe(true);
        expect(writtenTypes.has(WebIFC.IFCRELDEFINESBYPROPERTIES)).toBe(true);
        expect(writtenTypes.has(WebIFC.IFCPROPERTYSINGLEVALUE)).toBe(true);
        expect(writtenTypes.has(WebIFC.IFCGROUP)).toBe(true);
        expect(writtenTypes.has(WebIFC.IFCRELASSIGNSTOGROUP)).toBe(true);
    });
});
