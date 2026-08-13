// GR-10 (`[]`-means-unknown ledger · C75 §1.4 · C78 §1.4/§8.1 · C71 §4.4) —
// the Living Graph room→elements resolver stops forging "this room contains
// nothing" out of "the model projection could not be read".
//
// The old shape was `elementIdsForRoom(): string[]` with `catch { return []; }`
// — a THROWN projection and a genuinely element-less room printed the same
// value. The DIFFERENTIATING assertions below fail against that shape: the
// old function had no `kind` discriminator and no reason, so a crashed
// projection could never be told apart from a determined empty.

import { describe, it, expect, afterEach } from 'vitest';
import { determineElementIdsForRoom } from '../living-graph/livingGraphSelection';

type AnyWindow = Window & { runtime?: unknown };
const w = window as unknown as AnyWindow;

afterEach(() => {
  delete w.runtime;
});

describe('determineElementIdsForRoom — unknown is a VALUE, never [] (GR-10)', () => {
  it('a THROWING projection substrate is RELATIONSHIP_NOT_READABLE, not an empty membership', () => {
    // The projection reads runtime.projectContext first; a throwing getter is
    // exactly "the substrate failed to answer".
    w.runtime = Object.defineProperty({}, 'projectContext', {
      get() { throw new Error('store exploded'); },
      enumerable: true,
    });
    const det = determineElementIdsForRoom('room-1');
    // FAILS against the old `catch { return []; }` shape, which returned a
    // bare [] here with no discriminator and no reason.
    expect(det.kind).toBe('undetermined');
    if (det.kind === 'undetermined') {
      expect(det.reason).toBe('RELATIONSHIP_NOT_READABLE');
      expect(det.scope).toContain('room-1');
      expect(det.detail).toContain('store exploded');
    }
  });

  it('negative control: a READABLE model in which the room has no children is a DETERMINED empty', () => {
    w.runtime = {
      projectContext: { projectId: 'p1' },
      roomStore: [{ id: 'room-empty', levelId: 'L0' }],
      elementStore: [],
    };
    const det = determineElementIdsForRoom('room-empty');
    expect(det.kind).toBe('determined');
    if (det.kind === 'determined') expect(det.elements).toEqual([]);
  });

  it('a READABLE model resolves the room membership (real answer, real members)', () => {
    w.runtime = {
      projectContext: { projectId: 'p1' },
      roomStore: [{ id: 'room-a', levelId: 'L0' }],
      elementStore: [
        { id: 'wall-1', roomId: 'room-a' },
        { id: 'wall-2', roomId: 'room-a' },
        { id: 'wall-3', roomId: 'room-b' },
      ],
    };
    const det = determineElementIdsForRoom('room-a');
    expect(det.kind).toBe('determined');
    if (det.kind === 'determined') {
      expect([...det.elements].sort()).toEqual(['wall-1', 'wall-2']);
    }
  });

  it('a MISSING room id is INVALID_REQUEST — the question was never asked, not answered empty', () => {
    const det = determineElementIdsForRoom('');
    expect(det.kind).toBe('undetermined');
    if (det.kind === 'undetermined') expect(det.reason).toBe('INVALID_REQUEST');
  });
});
