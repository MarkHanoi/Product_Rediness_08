// §ROOMTYPE142 — deterministic, content-based room autofill classifier.
//
// Fixtures per the founder's own examples: bed → Bedroom; shower/toilet →
// Bathroom; stair → Core; kitchen alone → Kitchen; sofa alone → Living;
// kitchen+sofa → Kitchen-Living (the combination arm); an empty room → NULL
// (UNCLASSIFIED, the honesty arm — never a guess); precedence (bed beats
// wardrobe, bed beats the kitchen-living combo); determinism across repeated
// calls with unchanged store state.
//
// No THREE, no DOM — a `window.roomContentsService` stub plus fake
// furniture/plumbing stores registered on the real `storeRegistry` singleton
// (mirrors how the production code reads both).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { storeRegistry } from '@pryzm/core-app-model';
import { classifyRoomForAutofill, gatherRoomAutofillSignals } from '../RoomAutoFillClassifier';

interface FakeElement { id: string; [k: string]: unknown }

function makeStore(records: FakeElement[]) {
    return {
        getAll: () => records,
        getById: (id: string) => records.find((r) => r.id === id),
    };
}

/** Wires `window.roomContentsService.getContents(roomId)` to return the given
 *  contained-bucket shape for exactly one room id (null for any other). */
function setContents(
    roomId: string,
    contents: { furniture?: FakeElement[]; plumbing?: FakeElement[]; stairs?: FakeElement[] },
): void {
    (globalThis as any).window.roomContentsService = {
        getContents: (id: string) => (id === roomId
            ? {
                contained: {
                    furniture: (contents.furniture ?? []).map((f) => ({ id: f.id, label: String(f.name ?? f.id) })),
                    plumbing: (contents.plumbing ?? []).map((p) => ({ id: p.id, label: String(p.name ?? p.id) })),
                    stairs: (contents.stairs ?? []).map((s) => ({ id: s.id, label: String(s.name ?? s.id) })),
                },
            }
            : null),
    };
}

describe('classifyRoomForAutofill — §ROOMTYPE142', () => {
    beforeEach(() => {
        (globalThis as any).window = {};
        storeRegistry.register('room', makeStore([{ id: 'r1' }]));
    });

    afterEach(() => {
        delete (globalThis as any).window;
    });

    it('bed-only room classifies as Bedroom', () => {
        storeRegistry.register('furniture', makeStore([{ id: 'f1', name: 'Double Bed' }]));
        storeRegistry.register('plumbing', makeStore([]));
        setContents('r1', { furniture: [{ id: 'f1', name: 'Double Bed' }] });

        expect(classifyRoomForAutofill('r1')).toEqual({
            ruleId: 'bedroom-bed', label: 'Bedroom', occupancyType: 'bedroom',
        });
    });

    it('toilet + shower classifies as Bathroom', () => {
        storeRegistry.register('furniture', makeStore([]));
        storeRegistry.register('plumbing', makeStore([
            { id: 'p1', fixtureType: 'Toilet' },
            { id: 'p2', fixtureType: 'Shower' },
        ]));
        setContents('r1', { plumbing: [{ id: 'p1' }, { id: 'p2' }] });

        expect(classifyRoomForAutofill('r1')).toEqual({
            ruleId: 'bathroom-wet-fixtures', label: 'Bathroom', occupancyType: 'bathroom',
        });
    });

    it('a room containing a stair classifies as Core', () => {
        storeRegistry.register('furniture', makeStore([]));
        storeRegistry.register('plumbing', makeStore([]));
        setContents('r1', { stairs: [{ id: 's1' }] });

        expect(classifyRoomForAutofill('r1')).toEqual({
            ruleId: 'core-stair', label: 'Core', occupancyType: 'stairwell',
        });
    });

    it('kitchen appliances alone classify as Kitchen', () => {
        storeRegistry.register('furniture', makeStore([{ id: 'f1', name: 'Fridge' }]));
        storeRegistry.register('plumbing', makeStore([]));
        setContents('r1', { furniture: [{ id: 'f1', name: 'Fridge' }] });

        expect(classifyRoomForAutofill('r1')).toEqual({
            ruleId: 'kitchen', label: 'Kitchen', occupancyType: 'kitchen',
        });
    });

    it('a sofa alone classifies as Living', () => {
        storeRegistry.register('furniture', makeStore([{ id: 'f1', name: '3-Seat Sofa' }]));
        storeRegistry.register('plumbing', makeStore([]));
        setContents('r1', { furniture: [{ id: 'f1', name: '3-Seat Sofa' }] });

        expect(classifyRoomForAutofill('r1')).toEqual({
            ruleId: 'living-sofa', label: 'Living', occupancyType: 'living-room',
        });
    });

    it('the COMBINATION arm: kitchen appliance AND sofa together classify as Kitchen-Living, not Kitchen or Living alone', () => {
        storeRegistry.register('furniture', makeStore([
            { id: 'f1', name: 'Fridge' },
            { id: 'f2', name: 'Sofa' },
        ]));
        storeRegistry.register('plumbing', makeStore([]));
        setContents('r1', { furniture: [{ id: 'f1', name: 'Fridge' }, { id: 'f2', name: 'Sofa' }] });

        expect(classifyRoomForAutofill('r1')).toEqual({
            ruleId: 'kitchen-living-combo', label: 'Kitchen-Living', occupancyType: 'kitchen',
        });
    });

    it('the HONESTY arm: an empty room is UNCLASSIFIED (null), never guessed', () => {
        storeRegistry.register('furniture', makeStore([]));
        storeRegistry.register('plumbing', makeStore([]));
        setContents('r1', {});

        expect(classifyRoomForAutofill('r1')).toBeNull();
    });

    it('PRECEDENCE: bed + wardrobe classifies as Bedroom, never Dressing', () => {
        storeRegistry.register('furniture', makeStore([
            { id: 'f1', name: 'Double Bed' },
            { id: 'f2', name: 'Wardrobe' },
        ]));
        storeRegistry.register('plumbing', makeStore([]));
        setContents('r1', { furniture: [{ id: 'f1', name: 'Double Bed' }, { id: 'f2', name: 'Wardrobe' }] });

        expect(classifyRoomForAutofill('r1')?.label).toBe('Bedroom');
    });

    it('PRECEDENCE: bed + kitchen + sofa resolves deterministically to Bedroom (bed outranks the combo rule)', () => {
        storeRegistry.register('furniture', makeStore([
            { id: 'f1', name: 'Double Bed' },
            { id: 'f2', name: 'Fridge' },
            { id: 'f3', name: 'Sofa' },
        ]));
        storeRegistry.register('plumbing', makeStore([]));
        setContents('r1', {
            furniture: [{ id: 'f1', name: 'Double Bed' }, { id: 'f2', name: 'Fridge' }, { id: 'f3', name: 'Sofa' }],
        });

        expect(classifyRoomForAutofill('r1')?.label).toBe('Bedroom');
    });

    it('wardrobe with no bed classifies as Dressing', () => {
        storeRegistry.register('furniture', makeStore([{ id: 'f1', name: 'Wardrobe' }]));
        storeRegistry.register('plumbing', makeStore([]));
        setContents('r1', { furniture: [{ id: 'f1', name: 'Wardrobe' }] });

        expect(classifyRoomForAutofill('r1')).toEqual({
            ruleId: 'dressing-wardrobe', label: 'Dressing', occupancyType: 'storage-residential',
        });
    });

    it('is deterministic: repeated calls against unchanged store state return the identical classification', () => {
        storeRegistry.register('furniture', makeStore([{ id: 'f1', name: 'Fridge' }, { id: 'f2', name: 'Sofa' }]));
        storeRegistry.register('plumbing', makeStore([]));
        setContents('r1', { furniture: [{ id: 'f1', name: 'Fridge' }, { id: 'f2', name: 'Sofa' }] });

        const first = classifyRoomForAutofill('r1');
        const second = classifyRoomForAutofill('r1');
        const third = classifyRoomForAutofill('r1');
        expect(first).toEqual(second);
        expect(second).toEqual(third);
    });

    it('gatherRoomAutofillSignals returns null when the containment authority is unavailable', () => {
        // window.roomContentsService deliberately left unset.
        expect(gatherRoomAutofillSignals('r1')).toBeNull();
    });
});
