// §DEPT153 (L-12540+) — departmentForOccupancy: department is a PURE FUNCTION
// of the room's already-resolved occupancy, never a second contents
// classifier. See RoomDepartment.ts's header for the full rationale and for
// where the eleven-group vocabulary came from (RoomTypes.ts's own occupancy
// comment groups + RoomColourSystem.ts's ROOM_CSS_TOKENS — independently
// agreeing, reused rather than re-invented).

import { describe, it, expect } from 'vitest';
import {
  DEPARTMENT_UNCLASSIFIED,
  DEPARTMENT_FOR_OCCUPANCY,
  CANONICAL_DEPARTMENTS,
  departmentForOccupancy,
} from '../src/RoomDepartment';
import { RoomOccupancyTypeSchema } from '../src/RoomDataSchema';
import type { RoomOccupancyType } from '../src/RoomTypes';

describe('departmentForOccupancy', () => {
  it('maps each documented Residential occupancy to "Residential"', () => {
    for (const occ of ['bedroom', 'living-room', 'kitchen', 'bathroom', 'dining-room', 'utility-room', 'garage', 'storage-residential'] as const) {
      expect(departmentForOccupancy(occ)).toBe('Residential');
    }
  });

  it('maps a representative member of every OTHER group to its own department', () => {
    expect(departmentForOccupancy('private-office')).toBe('Commercial Office');
    expect(departmentForOccupancy('retail-floor')).toBe('Retail');
    expect(departmentForOccupancy('patient-room')).toBe('Healthcare');
    expect(departmentForOccupancy('classroom')).toBe('Education');
    expect(departmentForOccupancy('restaurant')).toBe('Hospitality');
    expect(departmentForOccupancy('warehouse')).toBe('Industrial / Warehouse');
    expect(departmentForOccupancy('corridor')).toBe('Circulation');
    expect(departmentForOccupancy('wc')).toBe('Amenity / Shared');
    expect(departmentForOccupancy('courtyard')).toBe('Outdoor / Transitional');
  });

  // §CONTEXT-DATA-HONESTY — "unknown" (occupancy itself unclassified) must be
  // a DIFFERENT, visible value from "none" (the field was never touched at
  // all, which the Schedule renders as '—' via `r.department || '—'`).
  it('maps "unclassified" occupancy to the honest sentinel, not a guess', () => {
    expect(departmentForOccupancy('unclassified')).toBe(DEPARTMENT_UNCLASSIFIED);
    expect(DEPARTMENT_UNCLASSIFIED).toBe('Unclassified');
    // The sentinel must never collide with the Schedule's own "never touched"
    // rendering, and must never be the empty string (§CONTEXT-DATA-HONESTY).
    expect(DEPARTMENT_UNCLASSIFIED).not.toBe('—');
    expect(DEPARTMENT_UNCLASSIFIED).not.toBe('');
    expect(DEPARTMENT_UNCLASSIFIED.length).toBeGreaterThan(0);
  });

  // The table is an EXHAUSTIVE Record<RoomOccupancyType, string> (mirrors
  // OCCUPANCY_PALETTE's own style) so a future occupancy member missing a
  // department entry is a COMPILE error, not a silent runtime fallback. This
  // test asserts the exhaustiveness independently, against the SAME Zod enum
  // RoomStore.update() validates against, so the two cannot drift unnoticed.
  it('is exhaustive over every RoomOccupancyType the schema actually accepts', () => {
    const schemaMembers = RoomOccupancyTypeSchema.options as readonly string[];
    const tableMembers = Object.keys(DEPARTMENT_FOR_OCCUPANCY);
    expect(new Set(tableMembers)).toEqual(new Set(schemaMembers));
    // Every entry resolves to a non-empty string via the function too.
    for (const occ of schemaMembers) {
      const dept = departmentForOccupancy(occ as RoomOccupancyType);
      expect(typeof dept).toBe('string');
      expect(dept.length).toBeGreaterThan(0);
    }
  });

  it('CANONICAL_DEPARTMENTS lists exactly the real (non-sentinel) departments the table produces', () => {
    const realDepartments = new Set(Object.values(DEPARTMENT_FOR_OCCUPANCY).filter(d => d !== DEPARTMENT_UNCLASSIFIED));
    expect(new Set(CANONICAL_DEPARTMENTS)).toEqual(realDepartments);
    expect(CANONICAL_DEPARTMENTS).not.toContain(DEPARTMENT_UNCLASSIFIED);
  });

  it('is deterministic — the same occupancy always yields the same department', () => {
    expect(departmentForOccupancy('bedroom')).toBe(departmentForOccupancy('bedroom'));
  });
});
