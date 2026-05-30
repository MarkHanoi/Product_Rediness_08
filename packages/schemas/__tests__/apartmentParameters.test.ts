// D-α-0 (BIM 2/3) — apartment / room parameter schema tests.

import { describe, expect, it } from 'vitest';
import {
    ApartmentParameters,
    RoomParameters,
    ParameterEnvelope,
    ApartmentTypology,
    RoomType,
    isApartmentParameters,
    isRoomParameters,
} from '../src/apartment/index.js';

// ── Building blocks ─────────────────────────────────────────────────────────

const envelope = (value: number, min: number, max: number) => ({ value, min, max });

const validApartment = () => ({
    id: 'apt-1',
    shellAreaM2: envelope(85, 60, 120),
    bedrooms: 2,
    bathrooms: 1,
    masterEnSuite: true,
    openPlanKitchenDining: true,
    livingRoom: true,
    entranceHall: true,
    typology: 'open-plan-mid-rise',
});

const validRoom = () => ({
    id: 'room-master',
    apartmentId: 'apt-1',
    type: 'master',
    name: 'Master Bedroom',
    areaM2: envelope(16, 12, 30),
    widthM:  envelope(3.5, 2.75, 5.0),
    depthM:  envelope(4.6, 3.0, 6.0),
    daylightRequired: true,
    privacyTier: 3,
});

// ── Enums ───────────────────────────────────────────────────────────────────

describe('ApartmentTypology', () => {
    it('accepts every documented typology', () => {
        for (const t of ['open-plan-mid-rise', 'closed-plan-mid-rise',
                          'compact-studio', 'duplex', 'penthouse'] as const) {
            expect(ApartmentTypology.safeParse(t).success).toBe(true);
        }
    });
    it('rejects unknown typologies', () => {
        expect(ApartmentTypology.safeParse('cottage').success).toBe(false);
    });
});

describe('RoomType (L0 enum)', () => {
    it('matches the ai-host RoomType union', () => {
        const all = [
            'master', 'bedroom', 'living', 'kitchen', 'dining',
            'bathroom', 'ensuite', 'wc', 'hall', 'corridor', 'study', 'utility',
        ] as const;
        for (const t of all) expect(RoomType.safeParse(t).success).toBe(true);
    });
});

// ── ParameterEnvelope ──────────────────────────────────────────────────────

describe('ParameterEnvelope', () => {
    it('accepts a value inside the envelope', () => {
        expect(ParameterEnvelope.safeParse(envelope(16, 12, 30)).success).toBe(true);
    });

    it('rejects a value BELOW the lower bound', () => {
        expect(ParameterEnvelope.safeParse(envelope(8, 12, 30)).success).toBe(false);
    });

    it('rejects a value ABOVE the upper bound', () => {
        expect(ParameterEnvelope.safeParse(envelope(40, 12, 30)).success).toBe(false);
    });

    it('accepts Number.POSITIVE_INFINITY as max (no upper bound)', () => {
        expect(ParameterEnvelope.safeParse(envelope(100, 0, Number.POSITIVE_INFINITY)).success).toBe(true);
    });

    it('rejects negative values', () => {
        expect(ParameterEnvelope.safeParse(envelope(-1, -2, 10)).success).toBe(false);
    });

    it('rejects non-finite values', () => {
        expect(ParameterEnvelope.safeParse(envelope(NaN, 0, 10)).success).toBe(false);
    });
});

// ── ApartmentParameters ────────────────────────────────────────────────────

describe('ApartmentParameters', () => {
    it('accepts a valid 2-bed open-plan apartment', () => {
        expect(ApartmentParameters.safeParse(validApartment()).success).toBe(true);
    });

    it('rejects negative bedroom count', () => {
        expect(ApartmentParameters.safeParse({ ...validApartment(), bedrooms: -1 }).success).toBe(false);
    });

    it('rejects non-integer bedroom count', () => {
        expect(ApartmentParameters.safeParse({ ...validApartment(), bedrooms: 2.5 }).success).toBe(false);
    });

    it('rejects bedroom count above the maximum (8)', () => {
        expect(ApartmentParameters.safeParse({ ...validApartment(), bedrooms: 9 }).success).toBe(false);
    });

    it('rejects shell area envelope with value outside [min, max]', () => {
        const apt = { ...validApartment(), shellAreaM2: envelope(50, 60, 120) };
        expect(ApartmentParameters.safeParse(apt).success).toBe(false);
    });

    it('rejects missing id', () => {
        const { id: _id, ...rest } = validApartment();
        expect(ApartmentParameters.safeParse(rest).success).toBe(false);
    });

    it('rejects empty id', () => {
        expect(ApartmentParameters.safeParse({ ...validApartment(), id: '' }).success).toBe(false);
    });

    it('isApartmentParameters type-guard matches safeParse', () => {
        expect(isApartmentParameters(validApartment())).toBe(true);
        expect(isApartmentParameters({})).toBe(false);
    });
});

// ── RoomParameters ─────────────────────────────────────────────────────────

describe('RoomParameters', () => {
    it('accepts a valid master bedroom record', () => {
        expect(RoomParameters.safeParse(validRoom()).success).toBe(true);
    });

    it('rejects privacyTier outside [1, 4]', () => {
        expect(RoomParameters.safeParse({ ...validRoom(), privacyTier: 0 }).success).toBe(false);
        expect(RoomParameters.safeParse({ ...validRoom(), privacyTier: 5 }).success).toBe(false);
    });

    it('rejects unknown room type', () => {
        expect(RoomParameters.safeParse({ ...validRoom(), type: 'cinema' }).success).toBe(false);
    });

    it('rejects empty name', () => {
        expect(RoomParameters.safeParse({ ...validRoom(), name: '' }).success).toBe(false);
    });

    it('accepts optional acousticIsolation flag', () => {
        const r = { ...validRoom(), acousticIsolation: true };
        expect(RoomParameters.safeParse(r).success).toBe(true);
    });

    it('rejects area envelope where value exceeds the typology max', () => {
        // The schema validates the envelope itself — the typology-relative max
        // is a higher-layer concern handled by the validator (D2.1 / G1).
        // Here we just verify the schema's own envelope rule.
        const r = { ...validRoom(), areaM2: envelope(45, 12, 30) };
        expect(RoomParameters.safeParse(r).success).toBe(false);
    });

    it('rejects when apartmentId is empty (cross-ref integrity at schema level)', () => {
        expect(RoomParameters.safeParse({ ...validRoom(), apartmentId: '' }).success).toBe(false);
    });

    it('isRoomParameters type-guard matches safeParse', () => {
        expect(isRoomParameters(validRoom())).toBe(true);
        expect(isRoomParameters({ type: 'master' })).toBe(false);
    });
});

// ── Round-trip ─────────────────────────────────────────────────────────────

describe('round-trip', () => {
    it('parse(serialize(x)) === x for an apartment', () => {
        const apt = validApartment();
        const json = JSON.stringify(apt);
        const parsed = ApartmentParameters.parse(JSON.parse(json));
        expect(parsed).toEqual(apt);
    });

    it('parse(serialize(x)) === x for a room', () => {
        const room = validRoom();
        const json = JSON.stringify(room);
        const parsed = RoomParameters.parse(JSON.parse(json));
        expect(parsed).toEqual(room);
    });
});
