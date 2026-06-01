/**
 * `Qto_WallBaseQuantities` writer tests — IFC-α-5 (2026-06-01).
 *
 * Covers `plugins/ifc-export/src/exporters/qto-wall-base.ts` per
 * [C25-IFC-EXPORT-PRODUCTION §3](../../../docs/00_Contracts/C25-IFC-EXPORT-PRODUCTION.md)
 * + master plan IFC-α-5.
 *
 * Strategy: same as `pset-wall-common.test.ts` — mock the webifc-helpers,
 * guid-provider, and OpenTelemetry layers with light spies so we assert on
 * the exact entity-write call sequence and the span attributes without
 * spinning up the full IfcAPI / wasm.
 *
 * Test count: 28 (well above the ≥ 20 floor).
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
    computeWallQuantities,
    writeQtoWallBase,
    type ExportCtx,
    type WallQuantityInputs,
} from '../src/exporters/qto-wall-base.js';

// `IfcAPI.CreateIfcType` is invoked directly by the writer to emit each
// `IfcLengthMeasure` / `IfcAreaMeasure` / `IfcVolumeMeasure` / `IfcMassMeasure`
// value object. Wire a spy onto `api` so we can assert it.
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
 * Helper: parse all `IfcQuantity*` writes into a `{ name → measure }` map
 * for ergonomic quantity assertions.
 */
function quantitiesByName(): Record<
    string,
    { type: number; measure: { typeCode: number; value: unknown } }
> {
    const out: Record<
        string,
        { type: number; measure: { typeCode: number; value: unknown } }
    > = {};
    const types = [
        WebIFC.IFCQUANTITYLENGTH,
        WebIFC.IFCQUANTITYAREA,
        WebIFC.IFCQUANTITYVOLUME,
        WebIFC.IFCQUANTITYWEIGHT,
    ];
    for (const t of types) {
        for (const w of findWritesOfType(t)) {
            // attrs = (Name, Description, Unit, Value, Formula)
            const nameRef = w.attrs[0] as { kind: string; value: string };
            const valueRef = w.attrs[3] as {
                kind: string;
                value: unknown;
                typeCode: number;
            };
            out[nameRef.value] = {
                type: t,
                measure: { typeCode: valueRef.typeCode, value: valueRef.value },
            };
        }
    }
    return out;
}

// ---------------------------------------------------------------------------
// computeWallQuantities — pure helper
// ---------------------------------------------------------------------------

describe('computeWallQuantities (pure helper)', () => {
    it('returns an empty object when only id is supplied', () => {
        const q = computeWallQuantities({ id: 'w' });
        expect(q.length).toBeUndefined();
        expect(q.width).toBeUndefined();
        expect(q.height).toBeUndefined();
        expect(q.grossFootprintArea).toBeUndefined();
        expect(q.netFootprintArea).toBeUndefined();
        expect(q.grossSideArea).toBeUndefined();
        expect(q.netSideArea).toBeUndefined();
        expect(q.grossVolume).toBeUndefined();
        expect(q.netVolume).toBeUndefined();
        expect(q.grossWeight).toBeUndefined();
        expect(q.netWeight).toBeUndefined();
    });

    it('length-only input → length quantity but no derived dimensions', () => {
        const q = computeWallQuantities({ id: 'w', lengthM: 5 });
        expect(q.length).toBe(5);
        expect(q.width).toBeUndefined();
        expect(q.height).toBeUndefined();
        expect(q.grossFootprintArea).toBeUndefined();
        expect(q.grossSideArea).toBeUndefined();
        expect(q.grossVolume).toBeUndefined();
    });

    it('grossFootprintArea = length × width', () => {
        const q = computeWallQuantities({
            id: 'w',
            lengthM: 5,
            widthM: 0.2,
        });
        expect(q.grossFootprintArea).toBeCloseTo(1.0, 9);
        expect(q.netFootprintArea).toBeCloseTo(1.0, 9);
    });

    it('grossSideArea = length × height', () => {
        const q = computeWallQuantities({
            id: 'w',
            lengthM: 5,
            heightM: 2.7,
        });
        expect(q.grossSideArea).toBeCloseTo(13.5, 9);
    });

    it('grossVolume = length × width × height', () => {
        const q = computeWallQuantities({
            id: 'w',
            lengthM: 5,
            widthM: 0.2,
            heightM: 2.7,
        });
        expect(q.grossVolume).toBeCloseTo(2.7, 9);
    });

    it('netSideArea = grossSideArea − openingsAreaM2', () => {
        const q = computeWallQuantities({
            id: 'w',
            lengthM: 5,
            heightM: 2.7,
            openingsAreaM2: 2.0,
        });
        expect(q.grossSideArea).toBeCloseTo(13.5, 9);
        expect(q.netSideArea).toBeCloseTo(11.5, 9);
    });

    it('netVolume = grossVolume − openingsVolumeM3', () => {
        const q = computeWallQuantities({
            id: 'w',
            lengthM: 5,
            widthM: 0.2,
            heightM: 2.7,
            openingsVolumeM3: 0.4,
        });
        expect(q.grossVolume).toBeCloseTo(2.7, 9);
        expect(q.netVolume).toBeCloseTo(2.3, 9);
    });

    it('openings exceeding gross clamp net to 0 (not negative)', () => {
        const q = computeWallQuantities({
            id: 'w',
            lengthM: 5,
            widthM: 0.2,
            heightM: 2.7,
            openingsAreaM2: 99,
            openingsVolumeM3: 99,
        });
        expect(q.netSideArea).toBe(0);
        expect(q.netVolume).toBe(0);
    });

    it('netFootprintArea is invariant to openings (vertical cut-outs)', () => {
        const q = computeWallQuantities({
            id: 'w',
            lengthM: 5,
            widthM: 0.2,
            heightM: 2.7,
            openingsAreaM2: 2.0,
            openingsVolumeM3: 0.4,
        });
        expect(q.netFootprintArea).toBeCloseTo(1.0, 9);
        expect(q.netFootprintArea).toBe(q.grossFootprintArea);
    });

    it('density emits both GrossWeight and NetWeight when volume is defined', () => {
        const q = computeWallQuantities({
            id: 'w',
            lengthM: 5,
            widthM: 0.2,
            heightM: 2.7,
            densityKgPerM3: 2400,
        });
        expect(q.grossWeight).toBeCloseTo(6480, 6);
        expect(q.netWeight).toBeCloseTo(6480, 6);
    });

    it('density alone (no dimensions) emits no weights', () => {
        const q = computeWallQuantities({ id: 'w', densityKgPerM3: 2400 });
        expect(q.grossWeight).toBeUndefined();
        expect(q.netWeight).toBeUndefined();
    });

    it('negative dimensions clamp to undefined', () => {
        const q = computeWallQuantities({
            id: 'w',
            lengthM: -1,
            widthM: -0.2,
            heightM: -2,
        });
        expect(q.length).toBeUndefined();
        expect(q.width).toBeUndefined();
        expect(q.height).toBeUndefined();
        expect(q.grossFootprintArea).toBeUndefined();
        expect(q.grossSideArea).toBeUndefined();
        expect(q.grossVolume).toBeUndefined();
    });

    it('NaN / Infinity dimensions clamp to undefined', () => {
        const q = computeWallQuantities({
            id: 'w',
            lengthM: Number.NaN,
            widthM: Number.POSITIVE_INFINITY,
            heightM: Number.NEGATIVE_INFINITY,
        });
        expect(q.length).toBeUndefined();
        expect(q.width).toBeUndefined();
        expect(q.height).toBeUndefined();
    });

    it('is deterministic — same input yields same output', () => {
        const input: WallQuantityInputs = {
            id: 'w',
            lengthM: 5,
            widthM: 0.2,
            heightM: 2.7,
            openingsAreaM2: 2.0,
            openingsVolumeM3: 0.4,
            densityKgPerM3: 2400,
        };
        const a = computeWallQuantities(input);
        const b = computeWallQuantities(input);
        expect(a).toEqual(b);
    });
});

// ---------------------------------------------------------------------------
// writeQtoWallBase — minimal / defaults
// ---------------------------------------------------------------------------

describe('writeQtoWallBase — minimal input', () => {
    it('an empty input ({ id }) writes a qto with zero quantities', () => {
        const r = writeQtoWallBase(wallRef(), { id: 'wall_minimal' }, ctx());
        expect(r.qtoRef).toBeDefined();
        expect(r.relRef).toBeDefined();
        expect(r.quantityCount).toBe(0);
        // No IfcQuantity* lines were written.
        expect(Object.keys(quantitiesByName())).toEqual([]);
    });

    it('returns nonzero qtoRef and relRef refs', () => {
        const r = writeQtoWallBase(wallRef(), { id: 'w' }, ctx());
        expect(r.qtoRef.expressID).toBeGreaterThan(0);
        expect(r.relRef.expressID).toBeGreaterThan(0);
        expect(r.qtoRef.expressID).not.toBe(r.relRef.expressID);
    });

    it('mints a fresh GlobalId for BOTH the qto and the rel', () => {
        writeQtoWallBase(wallRef(), { id: 'w' }, ctx());
        // 2 mintGlobalId calls: one for the qto, one for the rel.
        expect(vi.mocked(mintGlobalIdMock).mock.calls.length).toBe(2);
    });
});

// ---------------------------------------------------------------------------
// writeQtoWallBase — per-quantity round-trip
// ---------------------------------------------------------------------------

describe('writeQtoWallBase — per-quantity roundtrip', () => {
    it('length-only input produces exactly one IfcQuantityLength (Length)', () => {
        const r = writeQtoWallBase(
            wallRef(),
            { id: 'w', lengthM: 5 },
            ctx(),
        );
        expect(r.quantityCount).toBe(1);
        const q = quantitiesByName();
        expect(Object.keys(q)).toEqual(['Length']);
        expect(q.Length.type).toBe(WebIFC.IFCQUANTITYLENGTH);
        expect(q.Length.measure).toEqual({
            typeCode: WebIFC.IFCLENGTHMEASURE,
            value: 5,
        });
    });

    it('all dimensions (no density) → 9 quantities, no weights', () => {
        const r = writeQtoWallBase(
            wallRef(),
            { id: 'w', lengthM: 5, widthM: 0.2, heightM: 2.7 },
            ctx(),
        );
        expect(r.quantityCount).toBe(9);
        const names = Object.keys(quantitiesByName()).sort();
        expect(names).toEqual(
            [
                'GrossFootprintArea',
                'GrossSideArea',
                'GrossVolume',
                'Height',
                'Length',
                'NetFootprintArea',
                'NetSideArea',
                'NetVolume',
                'Width',
            ].sort(),
        );
    });

    it('all dimensions + density → 11 quantities (adds GrossWeight + NetWeight)', () => {
        const r = writeQtoWallBase(
            wallRef(),
            {
                id: 'w',
                lengthM: 5,
                widthM: 0.2,
                heightM: 2.7,
                densityKgPerM3: 2400,
            },
            ctx(),
        );
        expect(r.quantityCount).toBe(11);
        const q = quantitiesByName();
        expect(q.GrossWeight.type).toBe(WebIFC.IFCQUANTITYWEIGHT);
        expect(q.NetWeight.type).toBe(WebIFC.IFCQUANTITYWEIGHT);
        expect(q.GrossWeight.measure.typeCode).toBe(WebIFC.IFCMASSMEASURE);
        expect(q.NetWeight.measure.typeCode).toBe(WebIFC.IFCMASSMEASURE);
    });

    it('NetWeight is NOT emitted when density is absent', () => {
        writeQtoWallBase(
            wallRef(),
            { id: 'w', lengthM: 5, widthM: 0.2, heightM: 2.7 },
            ctx(),
        );
        const q = quantitiesByName();
        expect(q.NetWeight).toBeUndefined();
        expect(q.GrossWeight).toBeUndefined();
    });

    it('openingsAreaM2 reduces NetSideArea but NOT NetFootprintArea', () => {
        writeQtoWallBase(
            wallRef(),
            {
                id: 'w',
                lengthM: 5,
                widthM: 0.2,
                heightM: 2.7,
                openingsAreaM2: 2.0,
            },
            ctx(),
        );
        const q = quantitiesByName();
        expect(q.GrossSideArea.measure.value).toBeCloseTo(13.5, 9);
        expect(q.NetSideArea.measure.value).toBeCloseTo(11.5, 9);
        // Footprint is invariant — both equal 1.0 m².
        expect(q.GrossFootprintArea.measure.value).toBeCloseTo(1.0, 9);
        expect(q.NetFootprintArea.measure.value).toBeCloseTo(1.0, 9);
    });

    it('openingsVolumeM3 reduces NetVolume', () => {
        writeQtoWallBase(
            wallRef(),
            {
                id: 'w',
                lengthM: 5,
                widthM: 0.2,
                heightM: 2.7,
                openingsVolumeM3: 0.4,
            },
            ctx(),
        );
        const q = quantitiesByName();
        expect(q.GrossVolume.measure.value).toBeCloseTo(2.7, 9);
        expect(q.NetVolume.measure.value).toBeCloseTo(2.3, 9);
    });

    it('openings exceeding gross clamp NetSideArea / NetVolume to 0', () => {
        writeQtoWallBase(
            wallRef(),
            {
                id: 'w',
                lengthM: 5,
                widthM: 0.2,
                heightM: 2.7,
                openingsAreaM2: 99,
                openingsVolumeM3: 99,
            },
            ctx(),
        );
        const q = quantitiesByName();
        expect(q.NetSideArea.measure.value).toBe(0);
        expect(q.NetVolume.measure.value).toBe(0);
    });

    it('negative dimensions emit no length / dependent quantities', () => {
        const r = writeQtoWallBase(
            wallRef(),
            { id: 'w', lengthM: -5, widthM: 0.2, heightM: 2.7 },
            ctx(),
        );
        const q = quantitiesByName();
        expect(q.Length).toBeUndefined();
        expect(q.GrossFootprintArea).toBeUndefined();
        expect(q.GrossSideArea).toBeUndefined();
        expect(q.GrossVolume).toBeUndefined();
        // width + height are still valid.
        expect(q.Width).toBeDefined();
        expect(q.Height).toBeDefined();
        expect(r.quantityCount).toBe(2);
    });

    it('non-finite (NaN/Infinity) values are skipped silently', () => {
        const r = writeQtoWallBase(
            wallRef(),
            {
                id: 'w',
                lengthM: Number.NaN,
                widthM: Number.POSITIVE_INFINITY,
                heightM: Number.NEGATIVE_INFINITY,
            },
            ctx(),
        );
        expect(r.quantityCount).toBe(0);
        expect(Object.keys(quantitiesByName())).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// writeQtoWallBase — structural assertions
// ---------------------------------------------------------------------------

describe('writeQtoWallBase — combined / structural', () => {
    it('IfcElementQuantity Name === "Qto_WallBaseQuantities"', () => {
        writeQtoWallBase(wallRef(), { id: 'w' }, ctx());
        const qtos = findWritesOfType(WebIFC.IFCELEMENTQUANTITY);
        expect(qtos).toHaveLength(1);
        // IFCELEMENTQUANTITY attrs:
        //   (GlobalId, OwnerHistory, Name, Description, MethodOfMeasurement, Quantities)
        expect(qtos[0].attrs[2]).toEqual({
            kind: 'label',
            value: 'Qto_WallBaseQuantities',
        });
    });

    it('IfcRelDefinesByProperties relates the wall + the qto', () => {
        const w = wallRef(1234);
        const r = writeQtoWallBase(w, { id: 'wall_x' }, ctx());
        const rels = findWritesOfType(WebIFC.IFCRELDEFINESBYPROPERTIES);
        expect(rels).toHaveLength(1);
        // IFCRELDEFINESBYPROPERTIES attrs:
        //   (GlobalId, OwnerHistory, Name, Description,
        //    RelatedObjects=[Wall], RelatingPropertyDefinition=Qto)
        const related = rels[0].attrs[4] as ReadonlyArray<{ expressID: number }>;
        expect(related).toHaveLength(1);
        expect(related[0]).toBe(w);
        expect(rels[0].attrs[5]).toBe(r.qtoRef);
    });

    it('owner-history ref appears on BOTH the qto and the rel', () => {
        const c = ctx();
        writeQtoWallBase(wallRef(), { id: 'w' }, c);
        const qtos = findWritesOfType(WebIFC.IFCELEMENTQUANTITY);
        const rels = findWritesOfType(WebIFC.IFCRELDEFINESBYPROPERTIES);
        expect(qtos[0].attrs[1]).toBe(c.ownerRefs.ownerHistory);
        expect(rels[0].attrs[1]).toBe(c.ownerRefs.ownerHistory);
    });

    it('produces equivalent qtos for two identical walls (deterministic)', () => {
        // Pin the GUID provider to fully-deterministic output for this run.
        vi.mocked(mintGlobalIdMock).mockReset();
        let counter = 0;
        vi.mocked(mintGlobalIdMock).mockImplementation(() => {
            counter += 1;
            return `DET-GUID-${counter}`;
        });
        const inputA: WallQuantityInputs = {
            id: 'wall_a',
            lengthM: 5,
            widthM: 0.2,
            heightM: 2.7,
            openingsAreaM2: 2.0,
            openingsVolumeM3: 0.4,
            densityKgPerM3: 2400,
        };
        const inputB: WallQuantityInputs = { ...inputA, id: 'wall_b' };

        recordedWrites.length = 0;
        const a = writeQtoWallBase(wallRef(101), inputA, ctx());
        const aQuants = { ...quantitiesByName() };

        recordedWrites.length = 0;
        const b = writeQtoWallBase(wallRef(102), inputB, ctx());
        const bQuants = { ...quantitiesByName() };

        expect(a.quantityCount).toBe(b.quantityCount);
        expect(Object.keys(aQuants).sort()).toEqual(
            Object.keys(bQuants).sort(),
        );
        for (const key of Object.keys(aQuants)) {
            expect(bQuants[key]).toEqual(aQuants[key]);
        }
    });

    it('every entity write goes through the webifc-helpers writeEntity spy', () => {
        writeQtoWallBase(
            wallRef(),
            { id: 'w', lengthM: 5, widthM: 0.2, heightM: 2.7 },
            ctx(),
        );
        expect(vi.mocked(writeEntityMock)).toHaveBeenCalled();
        // 9 quantities + 1 qto + 1 rel = 11 entity writes.
        expect(vi.mocked(writeEntityMock).mock.calls.length).toBe(11);
    });
});

// ---------------------------------------------------------------------------
// writeQtoWallBase — OpenTelemetry span (P8)
// ---------------------------------------------------------------------------

describe('writeQtoWallBase — OpenTelemetry span (P8)', () => {
    it('opens a span named "pryzm.ifc.export-qto-wall-base"', () => {
        writeQtoWallBase(wallRef(), { id: 'wall_span_1' }, ctx());
        expect(capturedSpans.length).toBeGreaterThan(0);
        expect(capturedSpans[0].name).toBe('pryzm.ifc.export-qto-wall-base');
        expect(capturedSpans[0].ended).toBe(true);
        expect(capturedSpans[0].status).toBe('ok');
    });

    it('span attribute "wallId" matches the input id', () => {
        writeQtoWallBase(wallRef(), { id: 'wall_xyz' }, ctx());
        expect(capturedSpans[0].attributes.wallId).toBe('wall_xyz');
    });

    it('span attribute "quantityCount" equals the number of quantities written', () => {
        writeQtoWallBase(
            wallRef(),
            { id: 'wall_attrs', lengthM: 5, heightM: 2.7 },
            ctx(),
        );
        // Length + Height + GrossSideArea + NetSideArea = 4.
        expect(capturedSpans[0].attributes.quantityCount).toBe(4);
    });
});
