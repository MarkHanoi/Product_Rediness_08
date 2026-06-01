/**
 * `Pset_WallCommon` writer tests — IFC-α-4 (2026-06-01).
 *
 * Covers `plugins/ifc-export/src/exporters/pset-wall-common.ts` per
 * [C25-IFC-EXPORT-PRODUCTION §3](../../../docs/00_Contracts/C25-IFC-EXPORT-PRODUCTION.md)
 * + master plan IFC-α-4.
 *
 * Strategy: mock the webifc-helpers + guid-provider + OpenTelemetry layers
 * with light spies so we can assert on the exact entity-write call sequence
 * and the span attributes WITHOUT spinning up the full IfcAPI / wasm. Same
 * pattern as `zone.test.ts` (α-3).
 *
 * Test count: 26 (well above the ≥ 18 floor).
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
    pickWallCommonProps,
    writePsetWallCommon,
    WALL_STATUS_VALUES,
    type ExportCtx,
    type WallToExport,
} from '../src/exporters/pset-wall-common.js';

// `IfcAPI.CreateIfcType` is invoked directly by the writer to emit the
// `IfcThermalTransmittanceMeasure` value object — wire a spy onto `api` so we
// can assert it.
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

function wallRef(expressID = 999): { expressID: number; type: number } {
    return { expressID, type: WebIFC.IFCWALL };
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
// pickWallCommonProps — pure helper
// ---------------------------------------------------------------------------

describe('pickWallCommonProps (pure helper)', () => {
    it('defaults Status to NEW when unspecified', () => {
        const picked = pickWallCommonProps({ id: 'wall_x' });
        expect(picked.status).toBe('NEW');
    });

    it('drops every undefined optional property', () => {
        const picked = pickWallCommonProps({ id: 'wall_x' });
        expect(picked.reference).toBeUndefined();
        expect(picked.acousticRating).toBeUndefined();
        expect(picked.fireRating).toBeUndefined();
        expect(picked.combustible).toBeUndefined();
        expect(picked.surfaceSpreadOfFlame).toBeUndefined();
        expect(picked.thermalTransmittance).toBeUndefined();
        expect(picked.isExternal).toBeUndefined();
        expect(picked.extendToStructure).toBeUndefined();
        expect(picked.loadBearing).toBeUndefined();
        expect(picked.compartmentation).toBeUndefined();
    });

    it('accepts every official Status enum value', () => {
        for (const status of WALL_STATUS_VALUES) {
            const picked = pickWallCommonProps({ id: 'wall_x', status });
            expect(picked.status).toBe(status);
        }
    });

    it('throws on an unknown Status', () => {
        expect(() =>
            pickWallCommonProps({
                id: 'wall_bad',
                // intentional cast — exercising the runtime guard.
                status: 'PROVISIONAL' as never,
            }),
        ).toThrow(/status must be one of/);
    });

    it('drops non-finite thermalTransmittance (NaN, Infinity)', () => {
        expect(
            pickWallCommonProps({ id: 'w', thermalTransmittance: Number.NaN })
                .thermalTransmittance,
        ).toBeUndefined();
        expect(
            pickWallCommonProps({
                id: 'w',
                thermalTransmittance: Number.POSITIVE_INFINITY,
            }).thermalTransmittance,
        ).toBeUndefined();
    });

    it('preserves all 11 properties when all are present', () => {
        const picked = pickWallCommonProps({
            id: 'wall_full',
            reference: 'W1',
            status: 'EXISTING',
            acousticRating: 'RW 45 dB',
            fireRating: 'EI 60',
            combustible: false,
            surfaceSpreadOfFlame: 'Class 0',
            thermalTransmittance: 0.18,
            isExternal: true,
            extendToStructure: true,
            loadBearing: true,
            compartmentation: false,
        });
        expect(picked.reference).toBe('W1');
        expect(picked.status).toBe('EXISTING');
        expect(picked.acousticRating).toBe('RW 45 dB');
        expect(picked.fireRating).toBe('EI 60');
        expect(picked.combustible).toBe(false);
        expect(picked.surfaceSpreadOfFlame).toBe('Class 0');
        expect(picked.thermalTransmittance).toBe(0.18);
        expect(picked.isExternal).toBe(true);
        expect(picked.extendToStructure).toBe(true);
        expect(picked.loadBearing).toBe(true);
        expect(picked.compartmentation).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// writePsetWallCommon — defaults
// ---------------------------------------------------------------------------

describe('writePsetWallCommon — default / minimal wall', () => {
    it('an empty wall (only id) writes a pset with exactly one property — Status=NEW', () => {
        const r = writePsetWallCommon(wallRef(), { id: 'wall_minimal' }, ctx());

        expect(r.psetRef).toBeDefined();
        expect(r.relRef).toBeDefined();
        expect(r.propertyCount).toBe(1);

        const props = propsByName();
        expect(Object.keys(props)).toEqual(['Status']);
        expect(props.Status).toEqual({ kind: 'label', value: 'NEW' });
    });

    it('returns nonzero psetRef and relRef refs', () => {
        const r = writePsetWallCommon(wallRef(), { id: 'wall_x' }, ctx());
        expect(r.psetRef.expressID).toBeGreaterThan(0);
        expect(r.relRef.expressID).toBeGreaterThan(0);
        expect(r.psetRef.expressID).not.toBe(r.relRef.expressID);
    });

    it('every entity write goes through the webifc-helpers writeEntity spy', () => {
        writePsetWallCommon(wallRef(), { id: 'wall_x' }, ctx());
        expect(vi.mocked(writeEntityMock)).toHaveBeenCalled();
        // 1 property + 1 pset + 1 rel = 3 entity writes minimum.
        expect(vi.mocked(writeEntityMock).mock.calls.length).toBe(3);
    });
});

// ---------------------------------------------------------------------------
// writePsetWallCommon — per-property roundtrip
// ---------------------------------------------------------------------------

describe('writePsetWallCommon — per-property roundtrip', () => {
    it('Reference is written as IfcIdentifier when supplied', () => {
        writePsetWallCommon(
            wallRef(),
            { id: 'w', reference: 'WALL-001' },
            ctx(),
        );
        const props = propsByName();
        expect(props.Reference).toEqual({
            kind: 'identifier',
            value: 'WALL-001',
        });
    });

    it('AcousticRating is written as IfcLabel when supplied', () => {
        writePsetWallCommon(
            wallRef(),
            { id: 'w', acousticRating: 'RW 45 dB' },
            ctx(),
        );
        const props = propsByName();
        expect(props.AcousticRating).toEqual({
            kind: 'label',
            value: 'RW 45 dB',
        });
    });

    it('FireRating is written as IfcLabel when supplied', () => {
        writePsetWallCommon(
            wallRef(),
            { id: 'w', fireRating: '60 minutes' },
            ctx(),
        );
        const props = propsByName();
        expect(props.FireRating).toEqual({
            kind: 'label',
            value: '60 minutes',
        });
    });

    it('Combustible is written as IfcBoolean when supplied (true)', () => {
        writePsetWallCommon(
            wallRef(),
            { id: 'w', combustible: true },
            ctx(),
        );
        const props = propsByName();
        expect(props.Combustible).toEqual({ kind: 'boolean', value: true });
    });

    it('SurfaceSpreadOfFlame is written as IfcLabel when supplied', () => {
        writePsetWallCommon(
            wallRef(),
            { id: 'w', surfaceSpreadOfFlame: 'Class 0' },
            ctx(),
        );
        const props = propsByName();
        expect(props.SurfaceSpreadOfFlame).toEqual({
            kind: 'label',
            value: 'Class 0',
        });
    });

    it('ThermalTransmittance is written as IfcThermalTransmittanceMeasure with value 0.18', () => {
        writePsetWallCommon(
            wallRef(),
            { id: 'w', thermalTransmittance: 0.18 },
            ctx(),
        );
        const props = propsByName();
        expect(props.ThermalTransmittance).toEqual({
            kind: 'measure',
            typeCode: WebIFC.IFCTHERMALTRANSMITTANCEMEASURE,
            value: 0.18,
        });
        // And the underlying CreateIfcType spy was invoked with that type code.
        expect(createIfcTypeMock).toHaveBeenCalledWith(
            0,
            WebIFC.IFCTHERMALTRANSMITTANCEMEASURE,
            0.18,
        );
    });

    it('isExternal=true is written as IfcBoolean true (not omitted)', () => {
        writePsetWallCommon(wallRef(), { id: 'w', isExternal: true }, ctx());
        const props = propsByName();
        expect(props.IsExternal).toEqual({ kind: 'boolean', value: true });
    });

    it('isExternal=false is written as IfcBoolean false (not omitted)', () => {
        writePsetWallCommon(wallRef(), { id: 'w', isExternal: false }, ctx());
        const props = propsByName();
        expect(props.IsExternal).toEqual({ kind: 'boolean', value: false });
    });

    it('ExtendToStructure is written as IfcBoolean when supplied', () => {
        writePsetWallCommon(
            wallRef(),
            { id: 'w', extendToStructure: true },
            ctx(),
        );
        const props = propsByName();
        expect(props.ExtendToStructure).toEqual({
            kind: 'boolean',
            value: true,
        });
    });

    it('LoadBearing is written as IfcBoolean when supplied', () => {
        writePsetWallCommon(
            wallRef(),
            { id: 'w', loadBearing: true },
            ctx(),
        );
        const props = propsByName();
        expect(props.LoadBearing).toEqual({ kind: 'boolean', value: true });
    });

    it('Compartmentation is written as IfcBoolean when supplied', () => {
        writePsetWallCommon(
            wallRef(),
            { id: 'w', compartmentation: true },
            ctx(),
        );
        const props = propsByName();
        expect(props.Compartmentation).toEqual({
            kind: 'boolean',
            value: true,
        });
    });
});

// ---------------------------------------------------------------------------
// writePsetWallCommon — combined / structural
// ---------------------------------------------------------------------------

describe('writePsetWallCommon — combined / structural', () => {
    it('all 11 properties together: pset carries Status + 10 others (11 total)', () => {
        const wall: WallToExport = {
            id: 'wall_full',
            reference: 'W1',
            status: 'EXISTING',
            acousticRating: 'RW 45 dB',
            fireRating: 'EI 60',
            combustible: false,
            surfaceSpreadOfFlame: 'Class 0',
            thermalTransmittance: 0.18,
            isExternal: true,
            extendToStructure: true,
            loadBearing: true,
            compartmentation: false,
        };
        const r = writePsetWallCommon(wallRef(), wall, ctx());
        expect(r.propertyCount).toBe(11);

        const names = Object.keys(propsByName()).sort();
        expect(names).toEqual(
            [
                'AcousticRating',
                'Combustible',
                'Compartmentation',
                'ExtendToStructure',
                'FireRating',
                'IsExternal',
                'LoadBearing',
                'Reference',
                'Status',
                'SurfaceSpreadOfFlame',
                'ThermalTransmittance',
            ].sort(),
        );
    });

    it('IfcPropertySet has Name === "Pset_WallCommon"', () => {
        writePsetWallCommon(wallRef(), { id: 'w' }, ctx());
        const psets = findWritesOfType(WebIFC.IFCPROPERTYSET);
        expect(psets).toHaveLength(1);
        // IFCPROPERTYSET attrs: (GlobalId, OwnerHistory, Name, Description, HasProperties)
        expect(psets[0].attrs[2]).toEqual({
            kind: 'label',
            value: 'Pset_WallCommon',
        });
    });

    it('IfcRelDefinesByProperties relates the wall + the pset', () => {
        const w = wallRef(1234);
        const r = writePsetWallCommon(w, { id: 'wall_x' }, ctx());
        const rels = findWritesOfType(WebIFC.IFCRELDEFINESBYPROPERTIES);
        expect(rels).toHaveLength(1);
        // IFCRELDEFINESBYPROPERTIES attrs:
        //   (GlobalId, OwnerHistory, Name, Description,
        //    RelatedObjects=[Wall], RelatingPropertyDefinition=PSet)
        const related = rels[0].attrs[4] as ReadonlyArray<{ expressID: number }>;
        expect(related).toHaveLength(1);
        expect(related[0]).toBe(w);
        expect(rels[0].attrs[5]).toBe(r.psetRef);
    });

    it('mints a fresh GlobalId for BOTH the pset and the rel', () => {
        writePsetWallCommon(wallRef(), { id: 'w' }, ctx());
        // 2 mintGlobalId calls: one for the pset, one for the rel.
        expect(vi.mocked(mintGlobalIdMock).mock.calls.length).toBe(2);
    });

    it('owner-history ref appears on BOTH the pset and the rel', () => {
        const c = ctx();
        writePsetWallCommon(wallRef(), { id: 'w' }, c);
        const psets = findWritesOfType(WebIFC.IFCPROPERTYSET);
        const rels = findWritesOfType(WebIFC.IFCRELDEFINESBYPROPERTIES);
        // attrs[1] = OwnerHistory on both relation kinds.
        expect(psets[0].attrs[1]).toBe(c.ownerRefs.ownerHistory);
        expect(rels[0].attrs[1]).toBe(c.ownerRefs.ownerHistory);
    });

    it('produces equivalent psets for two identical walls (deterministic)', () => {
        // Pin the GUID provider to fully-deterministic output for this run.
        vi.mocked(mintGlobalIdMock).mockReset();
        let counter = 0;
        vi.mocked(mintGlobalIdMock).mockImplementation(() => {
            counter += 1;
            return `DET-GUID-${counter}`;
        });
        const wallA: WallToExport = {
            id: 'wall_a',
            fireRating: 'EI 60',
            isExternal: true,
            loadBearing: false,
            thermalTransmittance: 0.18,
        };
        const wallB: WallToExport = { ...wallA, id: 'wall_b' };

        recordedWrites.length = 0;
        const a = writePsetWallCommon(wallRef(101), wallA, ctx());
        const aProps = { ...propsByName() };

        recordedWrites.length = 0;
        const b = writePsetWallCommon(wallRef(102), wallB, ctx());
        const bProps = { ...propsByName() };

        expect(a.propertyCount).toBe(b.propertyCount);
        // Same property name set, same values.
        expect(Object.keys(aProps).sort()).toEqual(Object.keys(bProps).sort());
        for (const key of Object.keys(aProps)) {
            expect(bProps[key]).toEqual(aProps[key]);
        }
    });
});

// ---------------------------------------------------------------------------
// writePsetWallCommon — OpenTelemetry span
// ---------------------------------------------------------------------------

describe('writePsetWallCommon — OpenTelemetry span (P8)', () => {
    it('opens a span named "pryzm.ifc.export-pset-wall-common"', () => {
        writePsetWallCommon(wallRef(), { id: 'wall_span_1' }, ctx());
        expect(capturedSpans.length).toBeGreaterThan(0);
        expect(capturedSpans[0].name).toBe(
            'pryzm.ifc.export-pset-wall-common',
        );
        expect(capturedSpans[0].ended).toBe(true);
        expect(capturedSpans[0].status).toBe('ok');
    });

    it('span attribute "wallId" matches the input wall id', () => {
        writePsetWallCommon(wallRef(), { id: 'wall_xyz' }, ctx());
        expect(capturedSpans[0].attributes.wallId).toBe('wall_xyz');
    });

    it('span attribute "propertyCount" equals the number of properties written', () => {
        writePsetWallCommon(
            wallRef(),
            {
                id: 'wall_attrs',
                fireRating: 'EI 60',
                isExternal: true,
                loadBearing: false,
            },
            ctx(),
        );
        // Status (default) + FireRating + IsExternal + LoadBearing = 4.
        expect(capturedSpans[0].attributes.propertyCount).toBe(4);
    });
});
