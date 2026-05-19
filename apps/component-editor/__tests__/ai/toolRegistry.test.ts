// AI tool registry tests (S54).
//
// Coverage:
//   • Default registry exposes all 12 known verbs.
//   • Each verb validates a known-good payload and rejects bad ones.
//   • Unknown verb returns a structured error.
//   • Extra tools can be registered; duplicate registration throws.

import { describe, expect, it } from 'vitest';
import {
  ALL_AI_TOOL_VERBS,
  createAiToolRegistry,
} from '../../src/ai/toolRegistry.js';

describe('AI tool registry — defaults', () => {
  it('exposes every command verb registered in S52–S53', () => {
    const reg = createAiToolRegistry();
    const verbs = reg.list().map((t) => t.verb).sort();
    expect(verbs).toEqual([...ALL_AI_TOOL_VERBS].sort());
    expect(verbs).toEqual([
      'constraint.addCoincident',
      'constraint.addDistance',
      'constraint.addFixed',
      'constraint.addParallel',
      'constraint.addPerpendicular',
      'referencePlane.add',
      'referencePlane.remove',
      'referencePlane.reorient',
      'referencePlane.update',
      'solid.add',
      'solid.remove',
      'solid.setLodBitmask',
    ]);
  });

  it('hasTool / get round-trip for every default verb', () => {
    const reg = createAiToolRegistry();
    for (const verb of ALL_AI_TOOL_VERBS) {
      expect(reg.has(verb)).toBe(true);
      expect(reg.get(verb)?.verb).toBe(verb);
    }
  });
});

describe('AI tool registry — validation (good paths)', () => {
  const reg = createAiToolRegistry();
  const ok = { ok: true } as const;

  it.each([
    ['constraint.addCoincident',    { p1: 'p1', p2: 'p2' }],
    ['constraint.addDistance',      { p1: 'p1', p2: 'p2', value: 100 }],
    ['constraint.addDistance',      { p1: 'p1', p2: 'p2', value: 'Width' }],
    ['constraint.addFixed',         { p: 'p1', x: 0, y: 0 }],
    ['constraint.addParallel',      { l1: 'l1', l2: 'l2' }],
    ['constraint.addPerpendicular', { l1: 'l1', l2: 'l2' }],
    ['referencePlane.add',          { name: 'Top', origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 } }],
    ['referencePlane.update',       { id: 'rp-1', patch: { name: 'Renamed' } }],
    ['referencePlane.update',       { id: 'rp-1', patch: { origin: { x: 1, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 } } }],
    ['referencePlane.reorient',     { id: 'rp-1', origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 } }],
    ['referencePlane.remove',       { id: 'rp-1' }],
    ['solid.add',                   { name: 'Body', kind: 'extrude' }],
    ['solid.add',                   { name: 'Body', kind: 'sweep', materialSlot: 'wood' }],
    ['solid.add',                   { name: 'Body', kind: 'revolve', lod: { coarse: false, medium: true, fine: true } }],
    ['solid.remove',                { id: 's-1' }],
    ['solid.setLodBitmask',         { id: 's-1', lod: { coarse: true, medium: true, fine: false } }],
  ] as const)('%s accepts a known-good payload', (verb, args) => {
    expect(reg.validate(verb, args)).toEqual(ok);
  });
});

describe('AI tool registry — validation (rejection paths)', () => {
  const reg = createAiToolRegistry();

  it('unknown verb returns a structured error', () => {
    const v = reg.validate('does.notExist', {});
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.errors[0]).toMatch(/unknown verb/);
  });

  it('rejects when args is not an object', () => {
    const v = reg.validate('constraint.addCoincident', 'nope');
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.errors).toContain('args must be an object');
  });

  it('rejects when required fields are missing', () => {
    const v = reg.validate('constraint.addDistance', { p1: 'a' });
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.errors).toContain('missing field "p2"');
      expect(v.errors).toContain('missing field "value"');
    }
  });

  it('rejects when point pair endpoints are equal', () => {
    const v = reg.validate('constraint.addCoincident', { p1: 'p', p2: 'p' });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.errors).toContain('"p1" and "p2" must differ');
  });

  it('rejects bad solid kind', () => {
    const v = reg.validate('solid.add', { name: 'Body', kind: 'morph' });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.errors[0]).toMatch(/"kind" must be one of/);
  });

  it('rejects malformed Vec3', () => {
    const v = reg.validate('referencePlane.add', { name: 'Top', origin: { x: 0, y: 0 }, normal: { x: 0, y: 0, z: 1 } });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.errors).toContain('"origin" must be a Vec3 of finite numbers');
  });

  it('rejects malformed LodBitmask', () => {
    const v = reg.validate('solid.setLodBitmask', { id: 's-1', lod: { coarse: 1, medium: true, fine: true } });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.errors[0]).toMatch(/LodBitmask/);
  });

  it('rejects negative distance value', () => {
    const v = reg.validate('constraint.addDistance', { p1: 'a', p2: 'b', value: -5 });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.errors).toContain('"value" must be a non-negative finite number');
  });
});

describe('AI tool registry — extension', () => {
  it('accepts extra tools without disturbing the defaults', () => {
    const extra = {
      verb: 'parameter.set',
      category: 'parameter',
      description: 'Set a parameter value.',
      validate: () => ({ ok: true } as const),
    };
    const reg = createAiToolRegistry([extra]);
    expect(reg.has('parameter.set')).toBe(true);
    expect(reg.has('constraint.addCoincident')).toBe(true);
    expect(reg.list().length).toBe(ALL_AI_TOOL_VERBS.length + 1);
  });

  it('refuses duplicate verb registration', () => {
    const dupe = {
      verb: 'solid.add',
      category: 'solid',
      description: 'dup',
      validate: () => ({ ok: true } as const),
    };
    expect(() => createAiToolRegistry([dupe])).toThrow(/already registered/);
  });
});
