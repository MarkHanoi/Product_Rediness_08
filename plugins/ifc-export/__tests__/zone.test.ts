/**
 * IfcZone exporter tests — IFC-α-3 (2026-06-01).
 *
 * Covers `plugins/ifc-export/src/exporters/zone.ts` per master plan §7.3.
 * Exit criteria: every PRYZM Apartment becomes an `IfcZone` whose member
 * `IfcSpace`s are linked via `IfcRelAssignsToGroup` (NOT IfcRelAggregates
 * — that relation is reserved for the spatial hierarchy storey → space).
 *
 * Strategy: mock the web-ifc API + helper layer with light spies so we can
 * assert on the entity-write call sequence and the OpenTelemetry span
 * attributes WITHOUT spinning up the full IfcAPI/wasm.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as WebIFC from 'web-ifc';

// `web-ifc-helpers` must be mocked BEFORE the SUT imports it. Vitest hoists
// `vi.mock` calls so this works statically.
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
import {
    apartmentZoneObjectType,
    exportApartmentToZone,
    writeAllApartmentZones,
    type ApartmentToExport,
    type ExportCtx,
} from '../src/exporters/zone.js';

// ---------------------------------------------------------------------------
// Test scaffolding
// ---------------------------------------------------------------------------

// Each `writeEntity` call returns a fresh entity-ref-like with a unique
// expressID. We keep the type as a permissive `any`-shaped record so the
// captured-call list (below) does not require the heavyweight
// `WebIFC.IfcLineObject` type surface.
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

function aptWithRooms(
    id: string,
    name: string,
    memberRoomIds: ReadonlyArray<string>,
    extras: Partial<ApartmentToExport> = {},
): ApartmentToExport {
    return { id, name, memberRoomIds, ...extras };
}

function spaceMap(
    pairs: ReadonlyArray<readonly [string, number]>,
): Map<string, { expressID: number; type: number }> {
    const m = new Map<string, { expressID: number; type: number }>();
    for (const [roomId, eid] of pairs) {
        m.set(roomId, { expressID: eid, type: WebIFC.IFCSPACE });
    }
    return m;
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

function writeTypes(): number[] {
    return recordedWrites.map((w) => w.type);
}

function findWritesOfType(type: number): RecordedWrite[] {
    return recordedWrites.filter((w) => w.type === type);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('apartmentZoneObjectType (pure helper)', () => {
    it('returns "Apartment" for any apartment input', () => {
        expect(
            apartmentZoneObjectType(aptWithRooms('apt_1', 'Apt-101', [])),
        ).toBe('Apartment');
        expect(
            apartmentZoneObjectType(
                aptWithRooms('apt_2', 'Whatever', ['room_a', 'room_b'], {
                    longName: 'Penthouse',
                }),
            ),
        ).toBe('Apartment');
    });

    it('is deterministic (same input → same output)', () => {
        const apt = aptWithRooms('apt_x', 'X', ['r1']);
        expect(apartmentZoneObjectType(apt)).toBe(
            apartmentZoneObjectType(apt),
        );
    });
});

describe('exportApartmentToZone — single apartment', () => {
    it('writes one IfcZone + one IfcRelAssignsToGroup when all 3 rooms resolve', () => {
        const apt = aptWithRooms('apt_1', 'Apt-101', ['r1', 'r2', 'r3']);
        const refs = spaceMap([
            ['r1', 201],
            ['r2', 202],
            ['r3', 203],
        ]);

        const { zoneRef, relRef } = exportApartmentToZone(apt, refs, ctx());

        expect(zoneRef).toBeDefined();
        expect(relRef).toBeDefined();

        const zones = findWritesOfType(WebIFC.IFCZONE);
        const rels = findWritesOfType(WebIFC.IFCRELASSIGNSTOGROUP);
        expect(zones).toHaveLength(1);
        expect(rels).toHaveLength(1);

        // IfcRelAssignsToGroup.RelatedObjects is positional arg index 4
        // (GlobalId, OwnerHistory, Name, Description, RelatedObjects, …).
        const related = rels[0].attrs[4] as ReadonlyArray<{ expressID: number }>;
        expect(related).toHaveLength(3);
        expect(related.map((r) => r.expressID).sort()).toEqual([201, 202, 203]);
    });

    it('writes one IfcZone + NO IfcRelAssignsToGroup when memberRoomIds is empty', () => {
        const apt = aptWithRooms('apt_2', 'Empty', []);
        const { zoneRef, relRef } = exportApartmentToZone(
            apt,
            spaceMap([]),
            ctx(),
        );
        expect(zoneRef).toBeDefined();
        expect(relRef).toBeUndefined();
        expect(findWritesOfType(WebIFC.IFCZONE)).toHaveLength(1);
        expect(findWritesOfType(WebIFC.IFCRELASSIGNSTOGROUP)).toHaveLength(0);
    });

    it('writes one IfcZone + NO IfcRelAssignsToGroup when none of the rooms are in spaceRefMap', () => {
        const apt = aptWithRooms('apt_3', 'Phantom', ['ghost_a', 'ghost_b']);
        const { zoneRef, relRef } = exportApartmentToZone(
            apt,
            spaceMap([['unrelated_room', 500]]),
            ctx(),
        );
        expect(zoneRef).toBeDefined();
        expect(relRef).toBeUndefined();
        expect(findWritesOfType(WebIFC.IFCZONE)).toHaveLength(1);
        expect(findWritesOfType(WebIFC.IFCRELASSIGNSTOGROUP)).toHaveLength(0);
    });

    it('mixed resolved/unresolved rooms → IfcRelAssignsToGroup contains ONLY the resolved members', () => {
        const apt = aptWithRooms('apt_4', 'Mixed', [
            'r1',
            'ghost_a',
            'r2',
            'ghost_b',
        ]);
        const refs = spaceMap([
            ['r1', 311],
            ['r2', 312],
        ]);
        const { relRef } = exportApartmentToZone(apt, refs, ctx());
        expect(relRef).toBeDefined();
        const rels = findWritesOfType(WebIFC.IFCRELASSIGNSTOGROUP);
        expect(rels).toHaveLength(1);
        const related = rels[0].attrs[4] as ReadonlyArray<{ expressID: number }>;
        expect(related.map((r) => r.expressID)).toEqual([311, 312]);
    });

    it('IfcZone.ObjectType is "Apartment"', () => {
        const apt = aptWithRooms('apt_5', 'A5', ['r1']);
        exportApartmentToZone(apt, spaceMap([['r1', 401]]), ctx());
        const zones = findWritesOfType(WebIFC.IFCZONE);
        // IfcZone: (GlobalId=0, OwnerHistory=1, Name=2, Description=3,
        //          ObjectType=4, LongName=5)
        expect(zones[0].attrs[4]).toEqual({
            kind: 'label',
            value: 'Apartment',
        });
    });

    it('LongName is written as IFCLABEL when present', () => {
        const apt = aptWithRooms('apt_6', 'A6', ['r1'], {
            longName: 'Two-bedroom corner',
        });
        exportApartmentToZone(apt, spaceMap([['r1', 402]]), ctx());
        const zones = findWritesOfType(WebIFC.IFCZONE);
        expect(zones[0].attrs[5]).toEqual({
            kind: 'label',
            value: 'Two-bedroom corner',
        });
    });

    it('LongName is null (NULL `$`) when undefined', () => {
        const apt = aptWithRooms('apt_7', 'A7', ['r1']);
        exportApartmentToZone(apt, spaceMap([['r1', 403]]), ctx());
        const zones = findWritesOfType(WebIFC.IFCZONE);
        expect(zones[0].attrs[5]).toBeNull();
    });

    it('Description is written as IFCTEXT when present', () => {
        const apt = aptWithRooms('apt_8', 'A8', ['r1'], {
            description: 'High-floor unit',
        });
        exportApartmentToZone(apt, spaceMap([['r1', 404]]), ctx());
        const zones = findWritesOfType(WebIFC.IFCZONE);
        expect(zones[0].attrs[3]).toEqual({
            kind: 'text',
            value: 'High-floor unit',
        });
    });

    it('Description is null when undefined', () => {
        const apt = aptWithRooms('apt_9', 'A9', ['r1']);
        exportApartmentToZone(apt, spaceMap([['r1', 405]]), ctx());
        const zones = findWritesOfType(WebIFC.IFCZONE);
        expect(zones[0].attrs[3]).toBeNull();
    });

    it('mints a GlobalId for the IfcZone (via mintGlobalId)', () => {
        const apt = aptWithRooms('apt_10', 'A10', ['r1']);
        exportApartmentToZone(apt, spaceMap([['r1', 406]]), ctx());
        expect(vi.mocked(mintGlobalIdMock)).toHaveBeenCalled();
        // First call → zone GlobalId; second call (rel-assigns) → rel GlobalId.
        expect(vi.mocked(mintGlobalIdMock).mock.calls.length).toBeGreaterThanOrEqual(
            2,
        );
    });

    it('owner-history ref is set on BOTH IfcZone and IfcRelAssignsToGroup', () => {
        const apt = aptWithRooms('apt_11', 'A11', ['r1', 'r2']);
        const c = ctx();
        exportApartmentToZone(
            apt,
            spaceMap([
                ['r1', 501],
                ['r2', 502],
            ]),
            c,
        );
        const zones = findWritesOfType(WebIFC.IFCZONE);
        const rels = findWritesOfType(WebIFC.IFCRELASSIGNSTOGROUP);
        // Both have OwnerHistory at positional index 1.
        expect(zones[0].attrs[1]).toBe(c.ownerRefs.ownerHistory);
        expect(rels[0].attrs[1]).toBe(c.ownerRefs.ownerHistory);
    });

    it('IfcRelAssignsToGroup.RelatingGroup is the IfcZone we just wrote', () => {
        const apt = aptWithRooms('apt_12', 'A12', ['r1']);
        const { zoneRef } = exportApartmentToZone(
            apt,
            spaceMap([['r1', 601]]),
            ctx(),
        );
        const rels = findWritesOfType(WebIFC.IFCRELASSIGNSTOGROUP);
        // RelatingGroup is positional arg index 6.
        expect(rels[0].attrs[6]).toBe(zoneRef);
    });

    it('all entity writes the function emits include IfcZone and IfcRelAssignsToGroup', () => {
        const apt = aptWithRooms('apt_13', 'A13', ['r1', 'r2']);
        exportApartmentToZone(
            apt,
            spaceMap([
                ['r1', 701],
                ['r2', 702],
            ]),
            ctx(),
        );
        const types = writeTypes();
        expect(types).toContain(WebIFC.IFCZONE);
        expect(types).toContain(WebIFC.IFCRELASSIGNSTOGROUP);
    });
});

describe('exportApartmentToZone — OpenTelemetry span', () => {
    it('opens a span named "pryzm.ifc.export-zone"', () => {
        const apt = aptWithRooms('apt_span_1', 'AS1', ['r1']);
        exportApartmentToZone(apt, spaceMap([['r1', 800]]), ctx());
        expect(capturedSpans.length).toBeGreaterThan(0);
        expect(capturedSpans[0].name).toBe('pryzm.ifc.export-zone');
        expect(capturedSpans[0].ended).toBe(true);
        expect(capturedSpans[0].status).toBe('ok');
    });

    it('span attribute "zoneId" matches apt.id', () => {
        const apt = aptWithRooms('apt_span_2', 'AS2', ['r1']);
        exportApartmentToZone(apt, spaceMap([['r1', 801]]), ctx());
        expect(capturedSpans[0].attributes.zoneId).toBe('apt_span_2');
    });

    it('span attribute "memberCount" equals input memberRoomIds.length', () => {
        const apt = aptWithRooms('apt_span_3', 'AS3', ['r1', 'r2', 'r3', 'r4']);
        exportApartmentToZone(
            apt,
            spaceMap([
                ['r1', 802],
                ['r2', 803],
            ]),
            ctx(),
        );
        expect(capturedSpans[0].attributes.memberCount).toBe(4);
    });

    it('span attribute "resolvedMemberCount" is the post-filter count', () => {
        const apt = aptWithRooms('apt_span_4', 'AS4', ['r1', 'r2', 'r3', 'r4']);
        exportApartmentToZone(
            apt,
            spaceMap([
                ['r1', 810],
                ['r2', 811],
                // r3, r4 unresolved.
            ]),
            ctx(),
        );
        expect(capturedSpans[0].attributes.resolvedMemberCount).toBe(2);
    });
});

describe('writeAllApartmentZones — batch helper', () => {
    it('empty apartments[] writes zero entities and returns zoneCount=0/relCount=0/refs=[]', () => {
        const result = writeAllApartmentZones([], spaceMap([]), ctx());
        expect(result.zoneCount).toBe(0);
        expect(result.relCount).toBe(0);
        expect(result.refs).toEqual([]);
        expect(recordedWrites).toHaveLength(0);
    });

    it('batch of 3 apartments returns 3 refs in input order', () => {
        const apts: ApartmentToExport[] = [
            aptWithRooms('apt_A', 'A', ['r1']),
            aptWithRooms('apt_B', 'B', ['r2']),
            aptWithRooms('apt_C', 'C', ['r3']),
        ];
        const refs = spaceMap([
            ['r1', 901],
            ['r2', 902],
            ['r3', 903],
        ]);
        const result = writeAllApartmentZones(apts, refs, ctx());
        expect(result.zoneCount).toBe(3);
        expect(result.relCount).toBe(3);
        expect(result.refs.map((r) => r.aptId)).toEqual([
            'apt_A',
            'apt_B',
            'apt_C',
        ]);
        // ref count == input length (round-trip).
        expect(result.refs).toHaveLength(apts.length);
    });

    it('relCount only counts apartments that emitted an IfcRelAssignsToGroup', () => {
        const apts: ApartmentToExport[] = [
            aptWithRooms('apt_full', 'F', ['r1']),
            aptWithRooms('apt_empty', 'E', []),
            aptWithRooms('apt_ghost', 'G', ['ghost1']),
        ];
        const refs = spaceMap([['r1', 1001]]);
        const result = writeAllApartmentZones(apts, refs, ctx());
        expect(result.zoneCount).toBe(3); // every apartment → one zone
        expect(result.relCount).toBe(1); // only apt_full produces a relation
        expect(result.refs[0].relRef).toBeDefined();
        expect(result.refs[1].relRef).toBeUndefined();
        expect(result.refs[2].relRef).toBeUndefined();
    });

    it('opens one "pryzm.ifc.export-zone" span per apartment in the batch', () => {
        const apts: ApartmentToExport[] = [
            aptWithRooms('apt_s1', 'S1', ['r1']),
            aptWithRooms('apt_s2', 'S2', ['r2']),
        ];
        const refs = spaceMap([
            ['r1', 1101],
            ['r2', 1102],
        ]);
        writeAllApartmentZones(apts, refs, ctx());
        const zoneSpans = capturedSpans.filter(
            (s) => s.name === 'pryzm.ifc.export-zone',
        );
        expect(zoneSpans).toHaveLength(2);
        expect(zoneSpans.every((s) => s.ended && s.status === 'ok')).toBe(true);
        expect(zoneSpans.map((s) => s.attributes.zoneId).sort()).toEqual([
            'apt_s1',
            'apt_s2',
        ]);
    });
});
