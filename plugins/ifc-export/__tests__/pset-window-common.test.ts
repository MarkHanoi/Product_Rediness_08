/**
 * `Pset_WindowCommon` writer tests — IFC-α-7 (2026-06-01).
 *
 * Covers `plugins/ifc-export/src/exporters/pset-window-common.ts` per
 * [C25-IFC-EXPORT-PRODUCTION §3](../../../docs/00_Contracts/C25-IFC-EXPORT-PRODUCTION.md)
 * + master plan IFC-α-7.
 *
 * Strategy: mock the webifc-helpers + guid-provider + OpenTelemetry layers
 * with light spies so we can assert on the exact entity-write call sequence
 * and the span attributes WITHOUT spinning up the full IfcAPI / wasm. Same
 * pattern as `pset-door-common.test.ts` (α-6) and `pset-wall-common.test.ts`
 * (α-4).
 *
 * Test count: 33 (well above the ≥ 22 floor).
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
    pickWindowCommonProps,
    writePsetWindowCommon,
    WINDOW_STATUS_VALUES,
    type ExportCtx,
    type WindowToExport,
} from '../src/exporters/pset-window-common.js';

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

function windowRef(expressID = 999): { expressID: number; type: number } {
    return { expressID, type: WebIFC.IFCWINDOW };
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
// pickWindowCommonProps — pure helper
// ---------------------------------------------------------------------------

describe('pickWindowCommonProps (pure helper)', () => {
    it('defaults Status to NEW when unspecified', () => {
        const picked = pickWindowCommonProps({ id: 'window_x' });
        expect(picked.status).toBe('NEW');
    });

    it('drops every undefined optional property', () => {
        const picked = pickWindowCommonProps({ id: 'window_x' });
        expect(picked.reference).toBeUndefined();
        expect(picked.acousticRating).toBeUndefined();
        expect(picked.fireRating).toBeUndefined();
        expect(picked.securityRating).toBeUndefined();
        expect(picked.isExternal).toBeUndefined();
        expect(picked.infiltration).toBeUndefined();
        expect(picked.thermalTransmittance).toBeUndefined();
        expect(picked.glazingAreaFraction).toBeUndefined();
        expect(picked.hasSillExternal).toBeUndefined();
        expect(picked.hasSillInternal).toBeUndefined();
        expect(picked.hasDrive).toBeUndefined();
        expect(picked.smokeStop).toBeUndefined();
    });

    it('accepts every official Status enum value', () => {
        for (const status of WINDOW_STATUS_VALUES) {
            const picked = pickWindowCommonProps({ id: 'window_x', status });
            expect(picked.status).toBe(status);
        }
    });

    it('throws on an unknown Status', () => {
        expect(() =>
            pickWindowCommonProps({
                id: 'window_bad',
                // intentional cast — exercising the runtime guard.
                status: 'PROVISIONAL' as never,
            }),
        ).toThrow(/status must be one of/);
    });

    it('drops non-finite thermalTransmittance (NaN, Infinity)', () => {
        expect(
            pickWindowCommonProps({ id: 'w', thermalTransmittance: Number.NaN })
                .thermalTransmittance,
        ).toBeUndefined();
        expect(
            pickWindowCommonProps({
                id: 'w',
                thermalTransmittance: Number.POSITIVE_INFINITY,
            }).thermalTransmittance,
        ).toBeUndefined();
    });

    it('drops non-finite infiltration (NaN, Infinity)', () => {
        expect(
            pickWindowCommonProps({ id: 'w', infiltration: Number.NaN })
                .infiltration,
        ).toBeUndefined();
        expect(
            pickWindowCommonProps({
                id: 'w',
                infiltration: Number.POSITIVE_INFINITY,
            }).infiltration,
        ).toBeUndefined();
    });

    it('clamps glazingAreaFraction to [0, 1]', () => {
        expect(
            pickWindowCommonProps({ id: 'w', glazingAreaFraction: 0.5 })
                .glazingAreaFraction,
        ).toBe(0.5);
        expect(
            pickWindowCommonProps({ id: 'w', glazingAreaFraction: 1.5 })
                .glazingAreaFraction,
        ).toBe(1);
        expect(
            pickWindowCommonProps({ id: 'w', glazingAreaFraction: -0.1 })
                .glazingAreaFraction,
        ).toBe(0);
    });

    it('preserves all 13 properties when all are present', () => {
        const picked = pickWindowCommonProps({
            id: 'window_full',
            reference: 'W1',
            status: 'EXISTING',
            acousticRating: 'Rw 35 dB',
            fireRating: 'EI30',
            securityRating: 'RC2',
            isExternal: true,
            infiltration: 0.00008,
            thermalTransmittance: 1.1,
            glazingAreaFraction: 0.7,
            hasSillExternal: true,
            hasSillInternal: true,
            hasDrive: false,
            smokeStop: true,
        });
        expect(picked.reference).toBe('W1');
        expect(picked.status).toBe('EXISTING');
        expect(picked.acousticRating).toBe('Rw 35 dB');
        expect(picked.fireRating).toBe('EI30');
        expect(picked.securityRating).toBe('RC2');
        expect(picked.isExternal).toBe(true);
        expect(picked.infiltration).toBe(0.00008);
        expect(picked.thermalTransmittance).toBe(1.1);
        expect(picked.glazingAreaFraction).toBe(0.7);
        expect(picked.hasSillExternal).toBe(true);
        expect(picked.hasSillInternal).toBe(true);
        expect(picked.hasDrive).toBe(false);
        expect(picked.smokeStop).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// writePsetWindowCommon — defaults
// ---------------------------------------------------------------------------

describe('writePsetWindowCommon — default / minimal window', () => {
    it('an empty window (only id) writes a pset with exactly one property — Status=NEW', () => {
        const r = writePsetWindowCommon(
            windowRef(),
            { id: 'window_minimal' },
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
        const r = writePsetWindowCommon(windowRef(), { id: 'window_x' }, ctx());
        expect(r.psetRef.expressID).toBeGreaterThan(0);
        expect(r.relRef.expressID).toBeGreaterThan(0);
        expect(r.psetRef.expressID).not.toBe(r.relRef.expressID);
    });

    it('every entity write goes through the webifc-helpers writeEntity spy', () => {
        writePsetWindowCommon(windowRef(), { id: 'window_x' }, ctx());
        expect(vi.mocked(writeEntityMock)).toHaveBeenCalled();
        // 1 property + 1 pset + 1 rel = 3 entity writes minimum.
        expect(vi.mocked(writeEntityMock).mock.calls.length).toBe(3);
    });
});

// ---------------------------------------------------------------------------
// writePsetWindowCommon — per-property roundtrip
// ---------------------------------------------------------------------------

describe('writePsetWindowCommon — per-property roundtrip', () => {
    it('Reference is written as IfcIdentifier when supplied', () => {
        writePsetWindowCommon(
            windowRef(),
            { id: 'w', reference: 'WINDOW-001' },
            ctx(),
        );
        const props = propsByName();
        expect(props.Reference).toEqual({
            kind: 'identifier',
            value: 'WINDOW-001',
        });
    });

    it('AcousticRating is written as IfcLabel when supplied', () => {
        writePsetWindowCommon(
            windowRef(),
            { id: 'w', acousticRating: 'Rw 35 dB' },
            ctx(),
        );
        const props = propsByName();
        expect(props.AcousticRating).toEqual({
            kind: 'label',
            value: 'Rw 35 dB',
        });
    });

    it('FireRating is written as IfcLabel when supplied', () => {
        writePsetWindowCommon(
            windowRef(),
            { id: 'w', fireRating: 'EI 30' },
            ctx(),
        );
        const props = propsByName();
        expect(props.FireRating).toEqual({
            kind: 'label',
            value: 'EI 30',
        });
    });

    it('SecurityRating is written as IfcLabel when supplied', () => {
        writePsetWindowCommon(
            windowRef(),
            { id: 'w', securityRating: 'RC2' },
            ctx(),
        );
        const props = propsByName();
        expect(props.SecurityRating).toEqual({
            kind: 'label',
            value: 'RC2',
        });
    });

    it('isExternal=true is written as IfcBoolean true (not omitted)', () => {
        writePsetWindowCommon(
            windowRef(),
            { id: 'w', isExternal: true },
            ctx(),
        );
        const props = propsByName();
        expect(props.IsExternal).toEqual({ kind: 'boolean', value: true });
    });

    it('isExternal=false is written as IfcBoolean false (not omitted)', () => {
        writePsetWindowCommon(
            windowRef(),
            { id: 'w', isExternal: false },
            ctx(),
        );
        const props = propsByName();
        expect(props.IsExternal).toEqual({ kind: 'boolean', value: false });
    });

    it('Infiltration is written as IfcVolumetricFlowRateMeasure with value 0.00008', () => {
        writePsetWindowCommon(
            windowRef(),
            { id: 'w', infiltration: 0.00008 },
            ctx(),
        );
        const props = propsByName();
        expect(props.Infiltration).toEqual({
            kind: 'measure',
            typeCode: WebIFC.IFCVOLUMETRICFLOWRATEMEASURE,
            value: 0.00008,
        });
        expect(createIfcTypeMock).toHaveBeenCalledWith(
            0,
            WebIFC.IFCVOLUMETRICFLOWRATEMEASURE,
            0.00008,
        );
    });

    it('Non-finite Infiltration is dropped (NaN)', () => {
        writePsetWindowCommon(
            windowRef(),
            { id: 'w', infiltration: Number.NaN },
            ctx(),
        );
        const props = propsByName();
        expect(props.Infiltration).toBeUndefined();
    });

    it('ThermalTransmittance is written as IfcThermalTransmittanceMeasure with value 1.1', () => {
        writePsetWindowCommon(
            windowRef(),
            { id: 'w', thermalTransmittance: 1.1 },
            ctx(),
        );
        const props = propsByName();
        expect(props.ThermalTransmittance).toEqual({
            kind: 'measure',
            typeCode: WebIFC.IFCTHERMALTRANSMITTANCEMEASURE,
            value: 1.1,
        });
        expect(createIfcTypeMock).toHaveBeenCalledWith(
            0,
            WebIFC.IFCTHERMALTRANSMITTANCEMEASURE,
            1.1,
        );
    });

    it('GlazingAreaFraction=0.5 is emitted as IfcPositiveRatioMeasure with value 0.5', () => {
        writePsetWindowCommon(
            windowRef(),
            { id: 'w', glazingAreaFraction: 0.5 },
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
        writePsetWindowCommon(
            windowRef(),
            { id: 'w', glazingAreaFraction: 1 },
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
        writePsetWindowCommon(
            windowRef(),
            { id: 'w', glazingAreaFraction: 1.5 },
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
        writePsetWindowCommon(
            windowRef(),
            { id: 'w', glazingAreaFraction: -0.1 },
            ctx(),
        );
        const props = propsByName();
        expect(props.GlazingAreaFraction).toEqual({
            kind: 'measure',
            typeCode: WebIFC.IFCPOSITIVERATIOMEASURE,
            value: 0,
        });
    });

    it('HasSillExternal AND HasSillInternal can both be written when set', () => {
        writePsetWindowCommon(
            windowRef(),
            { id: 'w', hasSillExternal: true, hasSillInternal: true },
            ctx(),
        );
        const props = propsByName();
        expect(props.HasSillExternal).toEqual({
            kind: 'boolean',
            value: true,
        });
        expect(props.HasSillInternal).toEqual({
            kind: 'boolean',
            value: true,
        });
    });

    it('HasSillExternal=false is written (not omitted) when explicitly false', () => {
        writePsetWindowCommon(
            windowRef(),
            { id: 'w', hasSillExternal: false },
            ctx(),
        );
        const props = propsByName();
        expect(props.HasSillExternal).toEqual({
            kind: 'boolean',
            value: false,
        });
    });

    it('HasDrive is written as IfcBoolean when supplied', () => {
        writePsetWindowCommon(windowRef(), { id: 'w', hasDrive: true }, ctx());
        const props = propsByName();
        expect(props.HasDrive).toEqual({ kind: 'boolean', value: true });
    });

    it('SmokeStop is written as IfcBoolean when supplied', () => {
        writePsetWindowCommon(windowRef(), { id: 'w', smokeStop: true }, ctx());
        const props = propsByName();
        expect(props.SmokeStop).toEqual({ kind: 'boolean', value: true });
    });
});

// ---------------------------------------------------------------------------
// writePsetWindowCommon — combined / structural
// ---------------------------------------------------------------------------

describe('writePsetWindowCommon — combined / structural', () => {
    it('all 13 properties together: pset carries Status + 12 others (13 total)', () => {
        const window: WindowToExport = {
            id: 'window_full',
            reference: 'W1',
            status: 'EXISTING',
            acousticRating: 'Rw 35 dB',
            fireRating: 'EI30',
            securityRating: 'RC2',
            isExternal: true,
            infiltration: 0.00008,
            thermalTransmittance: 1.1,
            glazingAreaFraction: 0.7,
            hasSillExternal: true,
            hasSillInternal: true,
            hasDrive: false,
            smokeStop: true,
        };
        const r = writePsetWindowCommon(windowRef(), window, ctx());
        expect(r.propertyCount).toBe(13);

        const names = Object.keys(propsByName()).sort();
        expect(names).toEqual(
            [
                'AcousticRating',
                'FireRating',
                'GlazingAreaFraction',
                'HasDrive',
                'HasSillExternal',
                'HasSillInternal',
                'Infiltration',
                'IsExternal',
                'Reference',
                'SecurityRating',
                'SmokeStop',
                'Status',
                'ThermalTransmittance',
            ].sort(),
        );
    });

    it('IfcPropertySet has Name === "Pset_WindowCommon"', () => {
        writePsetWindowCommon(windowRef(), { id: 'w' }, ctx());
        const psets = findWritesOfType(WebIFC.IFCPROPERTYSET);
        expect(psets).toHaveLength(1);
        // IFCPROPERTYSET attrs: (GlobalId, OwnerHistory, Name, Description, HasProperties)
        expect(psets[0].attrs[2]).toEqual({
            kind: 'label',
            value: 'Pset_WindowCommon',
        });
    });

    it('IfcRelDefinesByProperties relates the window + the pset', () => {
        const w = windowRef(1234);
        const r = writePsetWindowCommon(w, { id: 'window_x' }, ctx());
        const rels = findWritesOfType(WebIFC.IFCRELDEFINESBYPROPERTIES);
        expect(rels).toHaveLength(1);
        // IFCRELDEFINESBYPROPERTIES attrs:
        //   (GlobalId, OwnerHistory, Name, Description,
        //    RelatedObjects=[Window], RelatingPropertyDefinition=PSet)
        const related = rels[0].attrs[4] as ReadonlyArray<{ expressID: number }>;
        expect(related).toHaveLength(1);
        expect(related[0]).toBe(w);
        expect(rels[0].attrs[5]).toBe(r.psetRef);
    });

    it('mints a fresh GlobalId for BOTH the pset and the rel', () => {
        writePsetWindowCommon(windowRef(), { id: 'w' }, ctx());
        // 2 mintGlobalId calls: one for the pset, one for the rel.
        expect(vi.mocked(mintGlobalIdMock).mock.calls.length).toBe(2);
    });

    it('owner-history ref appears on BOTH the pset and the rel', () => {
        const c = ctx();
        writePsetWindowCommon(windowRef(), { id: 'w' }, c);
        const psets = findWritesOfType(WebIFC.IFCPROPERTYSET);
        const rels = findWritesOfType(WebIFC.IFCRELDEFINESBYPROPERTIES);
        // attrs[1] = OwnerHistory on both relation kinds.
        expect(psets[0].attrs[1]).toBe(c.ownerRefs.ownerHistory);
        expect(rels[0].attrs[1]).toBe(c.ownerRefs.ownerHistory);
    });

    it('produces equivalent psets for two identical windows (deterministic)', () => {
        // Pin the GUID provider to fully-deterministic output for this run.
        vi.mocked(mintGlobalIdMock).mockReset();
        let counter = 0;
        vi.mocked(mintGlobalIdMock).mockImplementation(() => {
            counter += 1;
            return `DET-GUID-${counter}`;
        });
        const windowA: WindowToExport = {
            id: 'window_a',
            fireRating: 'EI30',
            isExternal: true,
            hasSillExternal: true,
            thermalTransmittance: 1.1,
            glazingAreaFraction: 0.7,
        };
        const windowB: WindowToExport = { ...windowA, id: 'window_b' };

        recordedWrites.length = 0;
        const a = writePsetWindowCommon(windowRef(101), windowA, ctx());
        const aProps = { ...propsByName() };

        recordedWrites.length = 0;
        const b = writePsetWindowCommon(windowRef(102), windowB, ctx());
        const bProps = { ...propsByName() };

        expect(a.propertyCount).toBe(b.propertyCount);
        // Same property name set, same values.
        expect(Object.keys(aProps).sort()).toEqual(Object.keys(bProps).sort());
        for (const key of Object.keys(aProps)) {
            expect(bProps[key]).toEqual(aProps[key]);
        }
    });

    it('round-trip: build WindowToExport, write pset, verify property names + types', () => {
        const window: WindowToExport = {
            id: 'window_round_trip',
            reference: 'W-RT-1',
            fireRating: 'EI 30',
            isExternal: true,
            hasSillExternal: true,
            hasSillInternal: false,
            thermalTransmittance: 1.2,
            glazingAreaFraction: 0.6,
        };
        const r = writePsetWindowCommon(windowRef(), window, ctx());

        // 1 default (Status) + 7 supplied = 8.
        expect(r.propertyCount).toBe(8);

        const props = propsByName();
        // Verify each property's measure type round-trips correctly.
        expect(props.Status).toEqual({ kind: 'label', value: 'NEW' });
        expect(props.Reference).toEqual({
            kind: 'identifier',
            value: 'W-RT-1',
        });
        expect(props.FireRating).toEqual({
            kind: 'label',
            value: 'EI 30',
        });
        expect(props.IsExternal).toEqual({ kind: 'boolean', value: true });
        expect(props.HasSillExternal).toEqual({
            kind: 'boolean',
            value: true,
        });
        expect(props.HasSillInternal).toEqual({
            kind: 'boolean',
            value: false,
        });
        expect(props.ThermalTransmittance).toEqual({
            kind: 'measure',
            typeCode: WebIFC.IFCTHERMALTRANSMITTANCEMEASURE,
            value: 1.2,
        });
        expect(props.GlazingAreaFraction).toEqual({
            kind: 'measure',
            typeCode: WebIFC.IFCPOSITIVERATIOMEASURE,
            value: 0.6,
        });
    });
});

// ---------------------------------------------------------------------------
// writePsetWindowCommon — OpenTelemetry span
// ---------------------------------------------------------------------------

describe('writePsetWindowCommon — OpenTelemetry span (P8)', () => {
    it('opens a span named "pryzm.ifc.export-pset-window-common"', () => {
        writePsetWindowCommon(windowRef(), { id: 'window_span_1' }, ctx());
        expect(capturedSpans.length).toBeGreaterThan(0);
        expect(capturedSpans[0].name).toBe(
            'pryzm.ifc.export-pset-window-common',
        );
        expect(capturedSpans[0].ended).toBe(true);
        expect(capturedSpans[0].status).toBe('ok');
    });

    it('span attribute "windowId" matches the input window id', () => {
        writePsetWindowCommon(windowRef(), { id: 'window_xyz' }, ctx());
        expect(capturedSpans[0].attributes.windowId).toBe('window_xyz');
    });

    it('span attribute "propertyCount" equals the number of properties written', () => {
        writePsetWindowCommon(
            windowRef(),
            {
                id: 'window_attrs',
                fireRating: 'EI30',
                isExternal: true,
                hasSillExternal: false,
            },
            ctx(),
        );
        // Status (default) + FireRating + IsExternal + HasSillExternal = 4.
        expect(capturedSpans[0].attributes.propertyCount).toBe(4);
    });
});
