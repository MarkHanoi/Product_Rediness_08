/**
 * `Pset_DoorCommon` writer tests — IFC-α-6 (2026-06-01).
 *
 * Covers `plugins/ifc-export/src/exporters/pset-door-common.ts` per
 * [C25-IFC-EXPORT-PRODUCTION §3](../../../docs/00_Contracts/C25-IFC-EXPORT-PRODUCTION.md)
 * + master plan IFC-α-6.
 *
 * Strategy: mock the webifc-helpers + guid-provider + OpenTelemetry layers
 * with light spies so we can assert on the exact entity-write call sequence
 * and the span attributes WITHOUT spinning up the full IfcAPI / wasm. Same
 * pattern as `pset-wall-common.test.ts` (α-4).
 *
 * Test count: 32 (well above the ≥ 22 floor).
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

import { writeEntity as writeEntityMock } from '../src/api/webifc-helpers.js';
import { mintGlobalId as mintGlobalIdMock } from '../src/guid-provider.js';
import {
    pickDoorCommonProps,
    writePsetDoorCommon,
    DOOR_STATUS_VALUES,
    type ExportCtx,
    type DoorToExport,
} from '../src/exporters/pset-door-common.js';

// `IfcAPI.CreateIfcType` is invoked directly by the writer to emit the
// `IfcThermalTransmittanceMeasure`, `IfcVolumetricFlowRateMeasure` and
// `IfcPositiveRatioMeasure` value objects — wire a spy onto `api` so we can
// assert it.
const createIfcTypeMock = vi.fn(
    (_modelId: number, typeCode: number, value: unknown) => ({
        kind: 'measure',
        typeCode,
        value,
    }),
);

// ---------------------------------------------------------------------------
// Test scaffolding
// ---------------------------------------------------------------------------

let entityCounter = 100;

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
        api: { CreateIfcType: createIfcTypeMock } as never,
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

function doorRef(expressID = 999): { expressID: number; type: number } {
    return { expressID, type: WebIFC.IFCDOOR };
}

beforeEach(() => {
    entityCounter = 100;
    recordedWrites.length = 0;
    capturedSpans.length = 0;
    createIfcTypeMock.mockClear();
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

/**
 * Helper: parse all `IFCPROPERTYSINGLEVALUE` writes into a
 * `{ propName → { kind, value } }` map for ergonomic property assertions.
 */
function propsByName(): Record<
    string,
    { kind: string; value: unknown; typeCode?: number }
> {
    const out: Record<string, { kind: string; value: unknown; typeCode?: number }> =
        {};
    for (const w of findWritesOfType(WebIFC.IFCPROPERTYSINGLEVALUE)) {
        // attrs = (Name, Description, NominalValue, Unit)
        const nameRef = w.attrs[0] as { kind: string; value: string };
        const valueRef = w.attrs[2] as {
            kind: string;
            value: unknown;
            typeCode?: number;
        };
        out[nameRef.value] = valueRef;
    }
    return out;
}

// ---------------------------------------------------------------------------
// pickDoorCommonProps — pure helper
// ---------------------------------------------------------------------------

describe('pickDoorCommonProps (pure helper)', () => {
    it('defaults Status to NEW when unspecified', () => {
        const picked = pickDoorCommonProps({ id: 'door_x' });
        expect(picked.status).toBe('NEW');
    });

    it('drops every undefined optional property', () => {
        const picked = pickDoorCommonProps({ id: 'door_x' });
        expect(picked.reference).toBeUndefined();
        expect(picked.acousticRating).toBeUndefined();
        expect(picked.fireRating).toBeUndefined();
        expect(picked.securityRating).toBeUndefined();
        expect(picked.isExternal).toBeUndefined();
        expect(picked.infiltration).toBeUndefined();
        expect(picked.thermalTransmittance).toBeUndefined();
        expect(picked.glazingAreaFraction).toBeUndefined();
        expect(picked.handicapAccessible).toBeUndefined();
        expect(picked.fireExit).toBeUndefined();
        expect(picked.hasDrive).toBeUndefined();
        expect(picked.selfClosing).toBeUndefined();
        expect(picked.smokeStop).toBeUndefined();
    });

    it('accepts every official Status enum value', () => {
        for (const status of DOOR_STATUS_VALUES) {
            const picked = pickDoorCommonProps({ id: 'door_x', status });
            expect(picked.status).toBe(status);
        }
    });

    it('throws on an unknown Status', () => {
        expect(() =>
            pickDoorCommonProps({
                id: 'door_bad',
                // intentional cast — exercising the runtime guard.
                status: 'PROVISIONAL' as never,
            }),
        ).toThrow(/status must be one of/);
    });

    it('drops non-finite thermalTransmittance (NaN, Infinity)', () => {
        expect(
            pickDoorCommonProps({ id: 'd', thermalTransmittance: Number.NaN })
                .thermalTransmittance,
        ).toBeUndefined();
        expect(
            pickDoorCommonProps({
                id: 'd',
                thermalTransmittance: Number.POSITIVE_INFINITY,
            }).thermalTransmittance,
        ).toBeUndefined();
    });

    it('drops non-finite infiltration (NaN, Infinity)', () => {
        expect(
            pickDoorCommonProps({ id: 'd', infiltration: Number.NaN })
                .infiltration,
        ).toBeUndefined();
        expect(
            pickDoorCommonProps({
                id: 'd',
                infiltration: Number.POSITIVE_INFINITY,
            }).infiltration,
        ).toBeUndefined();
    });

    it('clamps glazingAreaFraction to [0, 1]', () => {
        expect(
            pickDoorCommonProps({ id: 'd', glazingAreaFraction: 0.5 })
                .glazingAreaFraction,
        ).toBe(0.5);
        expect(
            pickDoorCommonProps({ id: 'd', glazingAreaFraction: 1.5 })
                .glazingAreaFraction,
        ).toBe(1);
        expect(
            pickDoorCommonProps({ id: 'd', glazingAreaFraction: -0.1 })
                .glazingAreaFraction,
        ).toBe(0);
    });

    it('preserves all 13 properties when all are present', () => {
        const picked = pickDoorCommonProps({
            id: 'door_full',
            reference: 'D1',
            status: 'EXISTING',
            acousticRating: 'Rw 32 dB',
            fireRating: 'EI30',
            securityRating: 'RC2',
            isExternal: true,
            infiltration: 0.0001,
            thermalTransmittance: 1.4,
            glazingAreaFraction: 0.25,
            handicapAccessible: true,
            fireExit: false,
            hasDrive: false,
            selfClosing: true,
            smokeStop: true,
        });
        expect(picked.reference).toBe('D1');
        expect(picked.status).toBe('EXISTING');
        expect(picked.acousticRating).toBe('Rw 32 dB');
        expect(picked.fireRating).toBe('EI30');
        expect(picked.securityRating).toBe('RC2');
        expect(picked.isExternal).toBe(true);
        expect(picked.infiltration).toBe(0.0001);
        expect(picked.thermalTransmittance).toBe(1.4);
        expect(picked.glazingAreaFraction).toBe(0.25);
        expect(picked.handicapAccessible).toBe(true);
        expect(picked.fireExit).toBe(false);
        expect(picked.hasDrive).toBe(false);
        expect(picked.selfClosing).toBe(true);
        expect(picked.smokeStop).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// writePsetDoorCommon — defaults
// ---------------------------------------------------------------------------

describe('writePsetDoorCommon — default / minimal door', () => {
    it('an empty door (only id) writes a pset with exactly one property — Status=NEW', () => {
        const r = writePsetDoorCommon(
            doorRef(),
            { id: 'door_minimal' },
            ctx(),
        );

        expect(r.psetRef).toBeDefined();
        expect(r.relRef).toBeDefined();
        expect(r.propertyCount).toBe(1);

        const props = propsByName();
        expect(Object.keys(props)).toEqual(['Status']);
        expect(props.Status).toEqual({ kind: 'label', value: 'NEW' });
    });

    it('returns nonzero psetRef and relRef refs', () => {
        const r = writePsetDoorCommon(doorRef(), { id: 'door_x' }, ctx());
        expect(r.psetRef.expressID).toBeGreaterThan(0);
        expect(r.relRef.expressID).toBeGreaterThan(0);
        expect(r.psetRef.expressID).not.toBe(r.relRef.expressID);
    });

    it('every entity write goes through the webifc-helpers writeEntity spy', () => {
        writePsetDoorCommon(doorRef(), { id: 'door_x' }, ctx());
        expect(vi.mocked(writeEntityMock)).toHaveBeenCalled();
        // 1 property + 1 pset + 1 rel = 3 entity writes minimum.
        expect(vi.mocked(writeEntityMock).mock.calls.length).toBe(3);
    });
});

// ---------------------------------------------------------------------------
// writePsetDoorCommon — per-property roundtrip
// ---------------------------------------------------------------------------

describe('writePsetDoorCommon — per-property roundtrip', () => {
    it('Reference is written as IfcIdentifier when supplied', () => {
        writePsetDoorCommon(
            doorRef(),
            { id: 'd', reference: 'DOOR-001' },
            ctx(),
        );
        const props = propsByName();
        expect(props.Reference).toEqual({
            kind: 'identifier',
            value: 'DOOR-001',
        });
    });

    it('AcousticRating is written as IfcLabel when supplied', () => {
        writePsetDoorCommon(
            doorRef(),
            { id: 'd', acousticRating: 'Rw 32 dB' },
            ctx(),
        );
        const props = propsByName();
        expect(props.AcousticRating).toEqual({
            kind: 'label',
            value: 'Rw 32 dB',
        });
    });

    it('FireRating is written as IfcLabel when supplied', () => {
        writePsetDoorCommon(
            doorRef(),
            { id: 'd', fireRating: '30 minutes' },
            ctx(),
        );
        const props = propsByName();
        expect(props.FireRating).toEqual({
            kind: 'label',
            value: '30 minutes',
        });
    });

    it('SecurityRating is written as IfcLabel when supplied', () => {
        writePsetDoorCommon(
            doorRef(),
            { id: 'd', securityRating: 'RC2' },
            ctx(),
        );
        const props = propsByName();
        expect(props.SecurityRating).toEqual({
            kind: 'label',
            value: 'RC2',
        });
    });

    it('isExternal=true is written as IfcBoolean true (not omitted)', () => {
        writePsetDoorCommon(
            doorRef(),
            { id: 'd', isExternal: true },
            ctx(),
        );
        const props = propsByName();
        expect(props.IsExternal).toEqual({ kind: 'boolean', value: true });
    });

    it('isExternal=false is written as IfcBoolean false (not omitted)', () => {
        writePsetDoorCommon(
            doorRef(),
            { id: 'd', isExternal: false },
            ctx(),
        );
        const props = propsByName();
        expect(props.IsExternal).toEqual({ kind: 'boolean', value: false });
    });

    it('Infiltration is written as IfcVolumetricFlowRateMeasure with value 0.0001', () => {
        writePsetDoorCommon(
            doorRef(),
            { id: 'd', infiltration: 0.0001 },
            ctx(),
        );
        const props = propsByName();
        expect(props.Infiltration).toEqual({
            kind: 'measure',
            typeCode: WebIFC.IFCVOLUMETRICFLOWRATEMEASURE,
            value: 0.0001,
        });
        expect(createIfcTypeMock).toHaveBeenCalledWith(
            0,
            WebIFC.IFCVOLUMETRICFLOWRATEMEASURE,
            0.0001,
        );
    });

    it('Non-finite Infiltration is dropped (NaN)', () => {
        writePsetDoorCommon(
            doorRef(),
            { id: 'd', infiltration: Number.NaN },
            ctx(),
        );
        const props = propsByName();
        expect(props.Infiltration).toBeUndefined();
    });

    it('ThermalTransmittance is written as IfcThermalTransmittanceMeasure with value 1.4', () => {
        writePsetDoorCommon(
            doorRef(),
            { id: 'd', thermalTransmittance: 1.4 },
            ctx(),
        );
        const props = propsByName();
        expect(props.ThermalTransmittance).toEqual({
            kind: 'measure',
            typeCode: WebIFC.IFCTHERMALTRANSMITTANCEMEASURE,
            value: 1.4,
        });
        expect(createIfcTypeMock).toHaveBeenCalledWith(
            0,
            WebIFC.IFCTHERMALTRANSMITTANCEMEASURE,
            1.4,
        );
    });

    it('GlazingAreaFraction=0.5 is emitted as IfcPositiveRatioMeasure with value 0.5', () => {
        writePsetDoorCommon(
            doorRef(),
            { id: 'd', glazingAreaFraction: 0.5 },
            ctx(),
        );
        const props = propsByName();
        expect(props.GlazingAreaFraction).toEqual({
            kind: 'measure',
            typeCode: WebIFC.IFCPOSITIVERATIOMEASURE,
            value: 0.5,
        });
    });

    it('GlazingAreaFraction=1.0 is emitted as IfcPositiveRatioMeasure with value 1', () => {
        writePsetDoorCommon(
            doorRef(),
            { id: 'd', glazingAreaFraction: 1 },
            ctx(),
        );
        const props = propsByName();
        expect(props.GlazingAreaFraction).toEqual({
            kind: 'measure',
            typeCode: WebIFC.IFCPOSITIVERATIOMEASURE,
            value: 1,
        });
    });

    it('GlazingAreaFraction=1.5 is clamped to 1', () => {
        writePsetDoorCommon(
            doorRef(),
            { id: 'd', glazingAreaFraction: 1.5 },
            ctx(),
        );
        const props = propsByName();
        expect(props.GlazingAreaFraction).toEqual({
            kind: 'measure',
            typeCode: WebIFC.IFCPOSITIVERATIOMEASURE,
            value: 1,
        });
    });

    it('GlazingAreaFraction=-0.1 is clamped to 0', () => {
        writePsetDoorCommon(
            doorRef(),
            { id: 'd', glazingAreaFraction: -0.1 },
            ctx(),
        );
        const props = propsByName();
        expect(props.GlazingAreaFraction).toEqual({
            kind: 'measure',
            typeCode: WebIFC.IFCPOSITIVERATIOMEASURE,
            value: 0,
        });
    });

    it('HandicapAccessible is written as IfcBoolean when supplied', () => {
        writePsetDoorCommon(
            doorRef(),
            { id: 'd', handicapAccessible: true },
            ctx(),
        );
        const props = propsByName();
        expect(props.HandicapAccessible).toEqual({
            kind: 'boolean',
            value: true,
        });
    });

    it('FireExit is written as IfcBoolean when supplied', () => {
        writePsetDoorCommon(doorRef(), { id: 'd', fireExit: true }, ctx());
        const props = propsByName();
        expect(props.FireExit).toEqual({ kind: 'boolean', value: true });
    });

    it('HasDrive=true is written as IfcBoolean true', () => {
        writePsetDoorCommon(doorRef(), { id: 'd', hasDrive: true }, ctx());
        const props = propsByName();
        expect(props.HasDrive).toEqual({ kind: 'boolean', value: true });
    });

    it('SelfClosing is written as IfcBoolean when supplied', () => {
        writePsetDoorCommon(
            doorRef(),
            { id: 'd', selfClosing: true },
            ctx(),
        );
        const props = propsByName();
        expect(props.SelfClosing).toEqual({ kind: 'boolean', value: true });
    });

    it('SmokeStop is written as IfcBoolean when supplied', () => {
        writePsetDoorCommon(doorRef(), { id: 'd', smokeStop: true }, ctx());
        const props = propsByName();
        expect(props.SmokeStop).toEqual({ kind: 'boolean', value: true });
    });
});

// ---------------------------------------------------------------------------
// writePsetDoorCommon — combined / structural
// ---------------------------------------------------------------------------

describe('writePsetDoorCommon — combined / structural', () => {
    it('all 14 properties together: pset carries Status + 13 others (14 total)', () => {
        const door: DoorToExport = {
            id: 'door_full',
            reference: 'D1',
            status: 'EXISTING',
            acousticRating: 'Rw 32 dB',
            fireRating: 'EI30',
            securityRating: 'RC2',
            isExternal: true,
            infiltration: 0.0001,
            thermalTransmittance: 1.4,
            glazingAreaFraction: 0.25,
            handicapAccessible: true,
            fireExit: false,
            hasDrive: false,
            selfClosing: true,
            smokeStop: true,
        };
        const r = writePsetDoorCommon(doorRef(), door, ctx());
        expect(r.propertyCount).toBe(14);

        const names = Object.keys(propsByName()).sort();
        expect(names).toEqual(
            [
                'AcousticRating',
                'FireExit',
                'FireRating',
                'GlazingAreaFraction',
                'HandicapAccessible',
                'HasDrive',
                'Infiltration',
                'IsExternal',
                'Reference',
                'SecurityRating',
                'SelfClosing',
                'SmokeStop',
                'Status',
                'ThermalTransmittance',
            ].sort(),
        );
    });

    it('IfcPropertySet has Name === "Pset_DoorCommon"', () => {
        writePsetDoorCommon(doorRef(), { id: 'd' }, ctx());
        const psets = findWritesOfType(WebIFC.IFCPROPERTYSET);
        expect(psets).toHaveLength(1);
        // IFCPROPERTYSET attrs: (GlobalId, OwnerHistory, Name, Description, HasProperties)
        expect(psets[0].attrs[2]).toEqual({
            kind: 'label',
            value: 'Pset_DoorCommon',
        });
    });

    it('IfcRelDefinesByProperties relates the door + the pset', () => {
        const d = doorRef(1234);
        const r = writePsetDoorCommon(d, { id: 'door_x' }, ctx());
        const rels = findWritesOfType(WebIFC.IFCRELDEFINESBYPROPERTIES);
        expect(rels).toHaveLength(1);
        // IFCRELDEFINESBYPROPERTIES attrs:
        //   (GlobalId, OwnerHistory, Name, Description,
        //    RelatedObjects=[Door], RelatingPropertyDefinition=PSet)
        const related = rels[0].attrs[4] as ReadonlyArray<{ expressID: number }>;
        expect(related).toHaveLength(1);
        expect(related[0]).toBe(d);
        expect(rels[0].attrs[5]).toBe(r.psetRef);
    });

    it('mints a fresh GlobalId for BOTH the pset and the rel', () => {
        writePsetDoorCommon(doorRef(), { id: 'd' }, ctx());
        // 2 mintGlobalId calls: one for the pset, one for the rel.
        expect(vi.mocked(mintGlobalIdMock).mock.calls.length).toBe(2);
    });

    it('owner-history ref appears on BOTH the pset and the rel', () => {
        const c = ctx();
        writePsetDoorCommon(doorRef(), { id: 'd' }, c);
        const psets = findWritesOfType(WebIFC.IFCPROPERTYSET);
        const rels = findWritesOfType(WebIFC.IFCRELDEFINESBYPROPERTIES);
        // attrs[1] = OwnerHistory on both relation kinds.
        expect(psets[0].attrs[1]).toBe(c.ownerRefs.ownerHistory);
        expect(rels[0].attrs[1]).toBe(c.ownerRefs.ownerHistory);
    });

    it('produces equivalent psets for two identical doors (deterministic)', () => {
        // Pin the GUID provider to fully-deterministic output for this run.
        vi.mocked(mintGlobalIdMock).mockReset();
        let counter = 0;
        vi.mocked(mintGlobalIdMock).mockImplementation(() => {
            counter += 1;
            return `DET-GUID-${counter}`;
        });
        const doorA: DoorToExport = {
            id: 'door_a',
            fireRating: 'EI30',
            isExternal: true,
            handicapAccessible: false,
            thermalTransmittance: 1.4,
            glazingAreaFraction: 0.25,
        };
        const doorB: DoorToExport = { ...doorA, id: 'door_b' };

        recordedWrites.length = 0;
        const a = writePsetDoorCommon(doorRef(101), doorA, ctx());
        const aProps = { ...propsByName() };

        recordedWrites.length = 0;
        const b = writePsetDoorCommon(doorRef(102), doorB, ctx());
        const bProps = { ...propsByName() };

        expect(a.propertyCount).toBe(b.propertyCount);
        // Same property name set, same values.
        expect(Object.keys(aProps).sort()).toEqual(Object.keys(bProps).sort());
        for (const key of Object.keys(aProps)) {
            expect(bProps[key]).toEqual(aProps[key]);
        }
    });

    it('round-trip: build DoorToExport, write pset, verify property names + types', () => {
        const door: DoorToExport = {
            id: 'door_round_trip',
            reference: 'D-RT-1',
            fireRating: '30 minutes',
            isExternal: true,
            handicapAccessible: true,
            fireExit: true,
            selfClosing: true,
            thermalTransmittance: 1.6,
            glazingAreaFraction: 0.4,
        };
        const r = writePsetDoorCommon(doorRef(), door, ctx());

        // 1 default (Status) + 8 supplied = 9.
        expect(r.propertyCount).toBe(9);

        const props = propsByName();
        // Verify each property's measure type round-trips correctly.
        expect(props.Status).toEqual({ kind: 'label', value: 'NEW' });
        expect(props.Reference).toEqual({
            kind: 'identifier',
            value: 'D-RT-1',
        });
        expect(props.FireRating).toEqual({
            kind: 'label',
            value: '30 minutes',
        });
        expect(props.IsExternal).toEqual({ kind: 'boolean', value: true });
        expect(props.HandicapAccessible).toEqual({
            kind: 'boolean',
            value: true,
        });
        expect(props.FireExit).toEqual({ kind: 'boolean', value: true });
        expect(props.SelfClosing).toEqual({ kind: 'boolean', value: true });
        expect(props.ThermalTransmittance).toEqual({
            kind: 'measure',
            typeCode: WebIFC.IFCTHERMALTRANSMITTANCEMEASURE,
            value: 1.6,
        });
        expect(props.GlazingAreaFraction).toEqual({
            kind: 'measure',
            typeCode: WebIFC.IFCPOSITIVERATIOMEASURE,
            value: 0.4,
        });
    });
});

// ---------------------------------------------------------------------------
// writePsetDoorCommon — OpenTelemetry span
// ---------------------------------------------------------------------------

describe('writePsetDoorCommon — OpenTelemetry span (P8)', () => {
    it('opens a span named "pryzm.ifc.export-pset-door-common"', () => {
        writePsetDoorCommon(doorRef(), { id: 'door_span_1' }, ctx());
        expect(capturedSpans.length).toBeGreaterThan(0);
        expect(capturedSpans[0].name).toBe(
            'pryzm.ifc.export-pset-door-common',
        );
        expect(capturedSpans[0].ended).toBe(true);
        expect(capturedSpans[0].status).toBe('ok');
    });

    it('span attribute "doorId" matches the input door id', () => {
        writePsetDoorCommon(doorRef(), { id: 'door_xyz' }, ctx());
        expect(capturedSpans[0].attributes.doorId).toBe('door_xyz');
    });

    it('span attribute "propertyCount" equals the number of properties written', () => {
        writePsetDoorCommon(
            doorRef(),
            {
                id: 'door_attrs',
                fireRating: 'EI30',
                isExternal: true,
                handicapAccessible: false,
            },
            ctx(),
        );
        // Status (default) + FireRating + IsExternal + HandicapAccessible = 4.
        expect(capturedSpans[0].attributes.propertyCount).toBe(4);
    });
});
