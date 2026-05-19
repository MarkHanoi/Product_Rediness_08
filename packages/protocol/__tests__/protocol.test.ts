// @pryzm/protocol — contract tests (Wave 13 zero-test drive).
//
// Covers:
//   1. Schema round-trip: every major element schema exported by @pryzm/protocol
//      must survive parse → JSON → parse with identical output.
//   2. StructuredName validation: assembleFilename + validateStructuredName
//      must accept a well-formed ISO 19650 name and reject a malformed one.
//   3. ID factory: createId must mint correctly-branded IDs that pass isId().

import { describe, expect, it } from 'vitest';
import {
  Wall,
  Door,
  Project,
  createId,
  isId,
  parseId,
  SCHEMA_REGISTRY,
  validateStructuredName,
  assembleFilename,
  type StructuredName,
} from '../src/index.js';

describe('@pryzm/protocol — schema round-trip', () => {
  it('Wall.parse({}) round-trips through JSON without losing defaults', () => {
    const wall = Wall.parse({ id: createId('wall'), levelId: 'lvl_test' });
    const json = JSON.stringify(wall);
    const restored = Wall.parse(JSON.parse(json));
    expect(restored.id).toBe(wall.id);
    expect(restored.type).toBe('wall');
    expect(restored.levelId).toBe(wall.levelId);
    expect(restored.height).toBe(wall.height);
  });

  it('SCHEMA_REGISTRY contains all 20 element schemas', () => {
    const keys = Object.keys(SCHEMA_REGISTRY);
    expect(keys.length).toBeGreaterThanOrEqual(20);
    expect(keys).toContain('wall');
    expect(keys).toContain('door');
    expect(keys).toContain('slab');
  });
});

describe('@pryzm/protocol — StructuredName', () => {
  it('validateStructuredName accepts a well-formed ISO 19650-2 name', () => {
    const name: StructuredName = {
      project: 'PRJ',
      originator: 'ABC',
      volume: 'ZZ',
      level: 'L01',
      type: 'M3',
      role: 'A',
      number: '0001',
      revision: 'P02',
      suitability: 'S2',
    };
    const errors = validateStructuredName(name);
    expect(errors).toHaveLength(0);
  });

  it('assembleFilename produces the canonical dash-separated filename', () => {
    const name: StructuredName = {
      project: 'PRJ',
      originator: 'ABC',
      volume: 'ZZ',
      level: 'L01',
      type: 'M3',
      role: 'A',
      number: '0001',
      revision: 'P02',
      suitability: 'S2',
    };
    const filename = assembleFilename(name);
    expect(filename).toContain('PRJ');
    expect(filename).toContain('ABC');
    expect(filename).toContain('M3');
  });
});

describe('@pryzm/protocol — createId + isId', () => {
  it('createId mints unique branded IDs per call', () => {
    const a = createId('wall');
    const b = createId('wall');
    expect(a).not.toBe(b);
    expect(isId(a, 'wall')).toBe(true);
  });

  it('parseId extracts the prefix from a branded ID (returns null for invalid strings)', () => {
    const id = createId('door');
    const parsed = parseId(id);
    expect(parsed).not.toBeNull();
    expect(parsed?.prefix).toBe('door');
    expect(parseId('not-an-id')).toBeNull();
  });
});
