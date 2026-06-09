// DOC-AUTO DS6 — documentation-set orchestration tests (2026-06-09).

import { describe, expect, it } from 'vitest';
import { planDocumentationSet, type DocSetInput } from '../src/workflows/houseLayout/documentationSet.js';

const FOOTPRINT = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 8 }, { x: 0, z: 8 }];
const ROOM = (id: string, name: string, levelId: string, ox: number) =>
    ({ id, name, levelId, polygon: [{ x: ox, z: 1 }, { x: ox + 3, z: 1 }, { x: ox + 3, z: 4 }, { x: ox, z: 4 }] });

const INPUT: DocSetInput = {
    levels: [{ levelId: 'L0', name: 'Ground' }, { levelId: 'L1', name: 'Level 01' }],
    rooms: [
        ROOM('r1', 'Kitchen', 'L0', 0),
        ROOM('r2', 'Living', 'L0', 4),
        ROOM('r3', 'Bedroom', 'L1', 0),
    ],
    footprint: FOOTPRINT,
};

describe('DS6 — planDocumentationSet', () => {
    it('emits level plans (A-1xx), one building-elevations sheet (A-2xx), set-out per level (A-3xx), room sheets (A-4xx)', () => {
        const s = planDocumentationSet(INPUT);
        const nums = s.map(x => x.sheetNumber);
        // 2 levels → A-101,A-102 ; 1 elevations → A-201 ; 2 set-out → A-301,A-302 ; 3 rooms → A-401..403
        expect(nums).toEqual(['A-101', 'A-102', 'A-201', 'A-301', 'A-302', 'A-401', 'A-402', 'A-403']);
    });

    it('the building-elevations sheet carries the 4 N/S/E/W exterior elevation views', () => {
        const s = planDocumentationSet(INPUT);
        const elev = s.find(x => x.sheetNumber === 'A-201')!;
        expect(elev.views).toHaveLength(4);
        expect(elev.views.every(v => v.kind === 'building-elevation')).toBe(true);
    });

    it('each room sheet has a cropped plan + 4 interior elevations', () => {
        const s = planDocumentationSet(INPUT);
        const room = s.find(x => x.sheetNumber === 'A-401')!;
        expect(room.name).toBe('Kitchen — Room');
        expect(room.views.filter(v => v.kind === 'room-plan')).toHaveLength(1);
        expect(room.views.filter(v => v.kind === 'room-elevation')).toHaveLength(4);
        expect(room.views[0].cropRegion).toBeTruthy();          // the plan view carries a crop region
    });

    it('rooms are ordered by level then input order; level plan views carry the levelId', () => {
        const s = planDocumentationSet(INPUT);
        const rooms = s.filter(x => x.sheetNumber.startsWith('A-4'));
        expect(rooms.map(r => r.name)).toEqual(['Kitchen — Room', 'Living — Room', 'Bedroom — Room']);
        expect(s.find(x => x.sheetNumber === 'A-101')!.views[0].levelId).toBe('L0');
    });

    it('is deterministic + empty-safe', () => {
        expect(planDocumentationSet(INPUT)).toEqual(planDocumentationSet(INPUT));
        expect(planDocumentationSet({ levels: [], rooms: [], footprint: [] })).toEqual([]);
    });
});
