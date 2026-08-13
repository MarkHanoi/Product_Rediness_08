// GR-10 (`[]`-means-unknown ledger · C75 §1.4 · C78 §1.4/§8.1 · C71 §4.4) —
// the room property inspector stops diagnosing "No adjacent rooms detected" /
// "No door connections — room is isolated" from a neighbour query that never
// answered.
//
// The old shape was `qs.getAdjacentRooms(id) ?? []` / `qs.getConnectedRooms(id)
// ?? []`: a query returning undefined (the substrate produced NO array) fell
// through to the determined-empty branch — including the RED "room is
// isolated" accessibility diagnosis. The differentiating assertions below fail
// against that shape: it had no undetermined arm, no reason, and rendered the
// determined-empty pixels for an unanswered question.

import { describe, it, expect } from 'vitest';
import { determineRoomNeighbours } from '../property-inspector/RoomPropertySection';

describe('determineRoomNeighbours — an unanswered query is NAMED, never "no neighbours" (GR-10)', () => {
  it('a query answering with NO array is RELATIONSHIP_NOT_READABLE, not empty', () => {
    const det = determineRoomNeighbours(() => undefined, 'rooms adjacent to r1');
    // FAILS against the old `?? []` shape (fell into the empty branch).
    expect(det.kind).toBe('undetermined');
    if (det.kind === 'undetermined') {
      expect(det.reason).toBe('RELATIONSHIP_NOT_READABLE');
      expect(det.scope).toBe('rooms adjacent to r1');
    }
  });

  it('a THROWING query is RELATIONSHIP_NOT_READABLE with the error named', () => {
    const det = determineRoomNeighbours(() => { throw new Error('index not built'); }, 's');
    expect(det.kind).toBe('undetermined');
    if (det.kind === 'undetermined') {
      expect(det.reason).toBe('RELATIONSHIP_NOT_READABLE');
      expect(det.detail).toContain('index not built');
    }
  });

  it('a MISSING query method is ENGINE_NOT_AVAILABLE', () => {
    const det = determineRoomNeighbours(undefined, 's');
    expect(det.kind).toBe('undetermined');
    if (det.kind === 'undetermined') expect(det.reason).toBe('ENGINE_NOT_AVAILABLE');
  });

  it('negative control: a query answering [] is a DETERMINED empty — the "isolated" diagnosis may render', () => {
    const det = determineRoomNeighbours(() => [], 's');
    expect(det.kind).toBe('determined');
    if (det.kind === 'determined') expect(det.elements).toEqual([]);
  });

  it('a query answering members is determined with those members', () => {
    const rooms = [{ id: 'r2', name: 'Kitchen' }];
    const det = determineRoomNeighbours(() => rooms, 's');
    expect(det.kind).toBe('determined');
    if (det.kind === 'determined') expect(det.elements).toEqual(rooms);
  });
});
