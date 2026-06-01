// C28 DAT-α-3 — Builtin Tier-1 predicates unit tests.
//
// Two tests per builtin (pass + fail) — the per-threshold numbers come
// from `builtins.ts` constants so the suite tracks any tuning.

import { describe, expect, it } from 'vitest';
import {
    PredicateRegistry,
    type PredicateContext,
} from '../src/predicates/PredicateRegistry.js';
import {
    APARTMENT_AREA_MIN_M2,
    BUILTIN_PREDICATES,
    DOOR_HEIGHT_MIN_M,
    DOOR_WIDTH_MIN_M,
    ROOM_AREA_MAX_M2,
    ROOM_AREA_MIN_M2,
    ROOM_HEIGHT_MIN_M,
    WALL_LENGTH_MIN_M,
    WALL_THICKNESS_MIN_M,
    apartmentAreaMin,
    doorHeightMin,
    doorWidthMin,
    registerBuiltinPredicates,
    roomAreaMax,
    roomAreaMin,
    roomHeightMin,
    wallLengthMin,
    wallThicknessMin,
} from '../src/predicates/builtins.js';

const CTX_ROOM: PredicateContext = { elementId: 'e1', scope: 'room' };
const CTX_ELEMENT: PredicateContext = { elementId: 'e1', scope: 'element' };
const CTX_APT: PredicateContext = { elementId: 'a1', scope: 'apartment' };

describe('builtins — room.areaMin', () => {
    it('passes when area meets the minimum', () => {
        expect(roomAreaMin({ areaM2: ROOM_AREA_MIN_M2 }, CTX_ROOM).pass).toBe(true);
        expect(roomAreaMin({ areaM2: 12 }, CTX_ROOM).pass).toBe(true);
    });
    it('fails when area is below the minimum', () => {
        const r = roomAreaMin({ areaM2: 2 }, CTX_ROOM);
        expect(r.pass).toBe(false);
        expect(r.fixSuggestion).toMatch(/at least 4 m²/);
    });
});

describe('builtins — room.areaMax', () => {
    it('passes when area is at or below the soft cap', () => {
        expect(roomAreaMax({ areaM2: ROOM_AREA_MAX_M2 }, CTX_ROOM).pass).toBe(true);
        expect(roomAreaMax({ areaM2: 18 }, CTX_ROOM).pass).toBe(true);
    });
    it('fails when area exceeds the cap', () => {
        const r = roomAreaMax({ areaM2: 80 }, CTX_ROOM);
        expect(r.pass).toBe(false);
        expect(r.fixSuggestion).toMatch(/mis-merge/);
    });
});

describe('builtins — room.heightMin', () => {
    it('passes when ceiling height meets the minimum', () => {
        expect(roomHeightMin({ heightM: ROOM_HEIGHT_MIN_M }, CTX_ROOM).pass).toBe(true);
        expect(roomHeightMin({ heightM: 2.7 }, CTX_ROOM).pass).toBe(true);
    });
    it('fails when ceiling is too low', () => {
        const r = roomHeightMin({ heightM: 1.9 }, CTX_ROOM);
        expect(r.pass).toBe(false);
    });
});

describe('builtins — wall.thicknessMin', () => {
    it('passes for standard partition thickness', () => {
        expect(wallThicknessMin({ thicknessM: 0.1 }, CTX_ELEMENT).pass).toBe(true);
    });
    it('fails for impossibly thin walls', () => {
        const r = wallThicknessMin({ thicknessM: 0.02 }, CTX_ELEMENT);
        expect(r.pass).toBe(false);
        expect(r.fixSuggestion).toMatch(/at least 0\.05 m/);
    });
});

describe('builtins — wall.lengthMin', () => {
    it('passes for normal partitions', () => {
        expect(wallLengthMin({ lengthM: 3 }, CTX_ELEMENT).pass).toBe(true);
    });
    it('fails for stub walls', () => {
        const r = wallLengthMin({ lengthM: 0.05 }, CTX_ELEMENT);
        expect(r.pass).toBe(false);
        expect(r.fixSuggestion).toMatch(/delete or extend/);
    });
});

describe('builtins — door.widthMin', () => {
    it('passes for accessible doors', () => {
        expect(doorWidthMin({ widthM: 0.9 }, CTX_ELEMENT).pass).toBe(true);
        expect(doorWidthMin({ widthM: DOOR_WIDTH_MIN_M }, CTX_ELEMENT).pass).toBe(true);
    });
    it('fails for narrow doors', () => {
        const r = doorWidthMin({ widthM: 0.6 }, CTX_ELEMENT);
        expect(r.pass).toBe(false);
        expect(r.fixSuggestion).toMatch(/accessibility/);
    });
});

describe('builtins — door.heightMin', () => {
    it('passes for standard doors', () => {
        expect(doorHeightMin({ heightM: DOOR_HEIGHT_MIN_M }, CTX_ELEMENT).pass).toBe(true);
        expect(doorHeightMin({ heightM: 2.1 }, CTX_ELEMENT).pass).toBe(true);
    });
    it('fails for short doors', () => {
        const r = doorHeightMin({ heightM: 1.8 }, CTX_ELEMENT);
        expect(r.pass).toBe(false);
    });
});

describe('builtins — apartment.areaMin', () => {
    it('passes for studio-size and above', () => {
        expect(apartmentAreaMin({ areaM2: APARTMENT_AREA_MIN_M2 }, CTX_APT).pass).toBe(true);
        expect(apartmentAreaMin({ areaM2: 60 }, CTX_APT).pass).toBe(true);
    });
    it('fails when below the studio minimum', () => {
        const r = apartmentAreaMin({ areaM2: 18 }, CTX_APT);
        expect(r.pass).toBe(false);
        expect(r.fixSuggestion).toMatch(/studio floor/);
    });
});

describe('builtins — missing field handling', () => {
    it('roomAreaMin treats missing areaM2 as a fail (with a remediation hint)', () => {
        const r = roomAreaMin({}, CTX_ROOM);
        expect(r.pass).toBe(false);
        expect(r.fixSuggestion).toMatch(/missing areaM2/);
    });
    it('roomAreaMax treats missing areaM2 as a pass (not a constraint)', () => {
        expect(roomAreaMax({}, CTX_ROOM).pass).toBe(true);
    });
    it('roomHeightMin treats non-numeric heightM as missing', () => {
        const r = roomHeightMin({ heightM: 'tall' }, CTX_ROOM);
        expect(r.pass).toBe(false);
    });
});

describe('builtins — registration', () => {
    it('BUILTIN_PREDICATES carries all 8 entries', () => {
        expect(BUILTIN_PREDICATES.length).toBe(8);
    });

    it('registerBuiltinPredicates installs every id', () => {
        const r = new PredicateRegistry();
        registerBuiltinPredicates(r);
        expect(r.list()).toEqual([
            'apartment.areaMin',
            'door.heightMin',
            'door.widthMin',
            'room.areaMax',
            'room.areaMin',
            'room.heightMin',
            'wall.lengthMin',
            'wall.thicknessMin',
        ]);
    });

    it('registerBuiltinPredicates throws if called twice on the same registry', () => {
        const r = new PredicateRegistry();
        registerBuiltinPredicates(r);
        expect(() => registerBuiltinPredicates(r)).toThrow(/duplicate predicateId/);
    });
});
