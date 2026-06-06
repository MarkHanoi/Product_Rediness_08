// A.21.D24 — furnish occupancy resolution.
//
// Guards the fix for "Furnish does nothing": the executor must resolve a
// furnishable occupancy from occupancyType OR (fallback) the room name, so a
// house room (no occupancyType yet) still furnishes.

import { describe, it, expect } from 'vitest';
import {
    occupancyFromName,
    occupanciesForRoom,
    primaryOccupancy,
} from '../src/ui/furnish-layout/furnishOccupancy.js';

describe('occupancyFromName', () => {
    it('maps deterministic display names to D-FLE occupancies', () => {
        expect(occupancyFromName('Living Room')).toBe('living-room');
        expect(occupancyFromName('Kitchen')).toBe('kitchen');
        expect(occupancyFromName('Master Bedroom')).toBe('bedroom');
        expect(occupancyFromName('Bedroom 2')).toBe('bedroom');
        expect(occupancyFromName('En-suite')).toBe('bathroom');
        expect(occupancyFromName('Bathroom')).toBe('bathroom');
        expect(occupancyFromName('Entrance Hall')).toBe('entrance-lobby');
        expect(occupancyFromName('Study')).toBe('private-office');
    });

    it('returns undefined for unknown / generic names', () => {
        expect(occupancyFromName('Room 00-123')).toBeUndefined();
        expect(occupancyFromName('')).toBeUndefined();
    });
});

describe('primaryOccupancy', () => {
    it('prefers the explicit occupancyType', () => {
        expect(primaryOccupancy({ occupancyType: 'bedroom', name: 'Kitchen' })).toBe('bedroom');
    });

    it('falls back to the room name when occupancyType is absent (the house fix)', () => {
        expect(primaryOccupancy({ name: 'Kitchen' })).toBe('kitchen');
        expect(primaryOccupancy({ name: 'Master Bedroom' })).toBe('bedroom');
    });

    it("returns '' when neither resolves (generic room → 0 furniture, diagnosed)", () => {
        expect(primaryOccupancy({ name: 'Room 00-7' })).toBe('');
        expect(primaryOccupancy({})).toBe('');
    });
});

describe('occupanciesForRoom', () => {
    it('splits a compound open-plan name into its sub-programs', () => {
        expect(occupanciesForRoom({ name: 'Living Room / Kitchen / Dining' }))
            .toEqual(['living-room', 'kitchen', 'dining-room']);
    });

    it('returns the single occupancyType for a simple room', () => {
        expect(occupanciesForRoom({ occupancyType: 'bedroom', name: 'Bedroom 1' }))
            .toEqual(['bedroom']);
    });

    it('falls back to name-derived occupancy when occupancyType is absent', () => {
        expect(occupanciesForRoom({ name: 'Bathroom' })).toEqual(['bathroom']);
    });

    it('returns [] for an unrecognised room (no archetype → no furniture)', () => {
        expect(occupanciesForRoom({ name: 'Room 00-3' })).toEqual([]);
    });
});
