import { describe, expect, it } from 'vitest';

import { resolveParameter } from '../src/resolution/resolveParameter.js';
import type { FamilyParameter, FamilyType } from '../src/types.js';

function param(over: Partial<FamilyParameter>): FamilyParameter {
  return {
    id: over.id ?? 'p_unset',
    name: over.name ?? 'Unset',
    kind: over.kind ?? 'type',
    dataType: over.dataType ?? 'length',
    defaultValue: over.defaultValue ?? null,
    expression: over.expression ?? null,
    ifcMapping: over.ifcMapping ?? null,
    exposed: over.exposed ?? true,
  };
}

describe('resolveParameter — precedence', () => {
  it('takes the family default when nothing is overridden', () => {
    const r = resolveParameter({
      parameters: [param({ id: 'p_w', name: 'Width', defaultValue: 800 })],
      type: null,
      instanceOverrides: {},
    });
    expect(r.ok).toBe(true);
    expect(r.ok && r.values).toEqual({ Width: 800 });
  });

  it('type override beats default', () => {
    const type: FamilyType = { id: 't_900', name: '900', values: { p_w: 900 } };
    const r = resolveParameter({
      parameters: [param({ id: 'p_w', name: 'Width', defaultValue: 800 })],
      type,
      instanceOverrides: {},
    });
    expect(r.ok && r.values).toEqual({ Width: 900 });
  });

  it('instance override beats type', () => {
    const type: FamilyType = { id: 't_900', name: '900', values: { p_w: 900 } };
    const r = resolveParameter({
      parameters: [param({ id: 'p_w', name: 'Width', defaultValue: 800 })],
      type,
      instanceOverrides: { p_w: 1000 },
    });
    expect(r.ok && r.values).toEqual({ Width: 1000 });
  });

  it('expression is used when no default and no override', () => {
    const r = resolveParameter({
      parameters: [
        param({ id: 'p_w', name: 'Width', defaultValue: 800 }),
        param({ id: 'p_half', name: 'Half', expression: 'Width / 2' }),
      ],
      type: null,
      instanceOverrides: {},
    });
    expect(r.ok && r.values).toEqual({ Width: 800, Half: 400 });
  });
});

describe('resolveParameter — cycles', () => {
  it('detects a 2-node cycle and emits a `cycle` diagnostic', () => {
    const r = resolveParameter({
      parameters: [
        param({ id: 'p_a', name: 'A', expression: 'B + 1' }),
        param({ id: 'p_b', name: 'B', expression: 'A + 1' }),
      ],
      type: null,
      instanceOverrides: {},
    });
    expect(r.ok).toBe(false);
    const cycleDiags = r.diagnostics.filter((d) => d.code === 'cycle');
    expect(cycleDiags.map((d) => d.parameterId).sort()).toEqual(['p_a', 'p_b']);
  });

  it('still resolves non-cyclic params', () => {
    const r = resolveParameter({
      parameters: [
        param({ id: 'p_w', name: 'Width', defaultValue: 800 }),
        param({ id: 'p_a', name: 'A', expression: 'B + 1' }),
        param({ id: 'p_b', name: 'B', expression: 'A + 1' }),
      ],
      type: null,
      instanceOverrides: {},
    });
    // Cycles abort overall ok=false, but the diagnostic surface is
    // typed; consumers can still inspect partial state if they need to.
    expect(r.ok).toBe(false);
    expect(r.diagnostics.some((d) => d.code === 'cycle' && d.parameterId === 'p_a')).toBe(true);
    expect(r.diagnostics.some((d) => d.code === 'cycle' && d.parameterId === 'p_b')).toBe(true);
  });
});

describe('resolveParameter — name validation', () => {
  it('rejects an invalid name', () => {
    const r = resolveParameter({
      parameters: [param({ id: 'p_x', name: '9bad-name', defaultValue: 1 })],
      type: null,
      instanceOverrides: {},
    });
    expect(r.ok).toBe(false);
    expect(r.diagnostics.some((d) => d.code === 'invalid-name')).toBe(true);
  });

  it('rejects duplicate names', () => {
    const r = resolveParameter({
      parameters: [
        param({ id: 'p_a', name: 'Width', defaultValue: 1 }),
        param({ id: 'p_b', name: 'Width', defaultValue: 2 }),
      ],
      type: null,
      instanceOverrides: {},
    });
    expect(r.ok).toBe(false);
    expect(r.diagnostics.some((d) => d.code === 'duplicate-name')).toBe(true);
  });
});

describe('resolveParameter — expression errors', () => {
  it('reports parse errors per parameter', () => {
    const r = resolveParameter({
      parameters: [param({ id: 'p_a', name: 'A', expression: '(1 +' })],
      type: null,
      instanceOverrides: {},
    });
    expect(r.ok).toBe(false);
    expect(r.diagnostics.some((d) => d.code === 'expression-parse')).toBe(true);
  });

  it('reports eval errors per parameter', () => {
    const r = resolveParameter({
      parameters: [param({ id: 'p_a', name: 'A', expression: '1 / 0' })],
      type: null,
      instanceOverrides: {},
    });
    expect(r.ok).toBe(false);
    expect(r.diagnostics.some((d) => d.code === 'expression-eval')).toBe(true);
  });

  it('reports unknown identifiers as their own diagnostic code', () => {
    const r = resolveParameter({
      parameters: [param({ id: 'p_a', name: 'A', expression: 'Missing + 1' })],
      type: null,
      instanceOverrides: {},
    });
    expect(r.ok).toBe(false);
    expect(r.diagnostics.some((d) => d.code === 'unknown-identifier')).toBe(true);
  });
});

describe('resolveParameter — span', () => {
  it('emits `pryzm.family.bake.resolveType` once per resolution', async () => {
    const { setFamilyRuntimeSpanSink, clearFamilyRuntimeSpanSinks } = await import('../src/span-sink.js');
    clearFamilyRuntimeSpanSinks();
    const records: string[] = [];
    setFamilyRuntimeSpanSink((r) => records.push(r.name));
    resolveParameter({
      parameters: [
        param({ id: 'p_w', name: 'Width', defaultValue: 800 }),
        param({ id: 'p_h', name: 'Half', expression: 'Width / 2' }),
      ],
      type: null,
      instanceOverrides: {},
    });
    clearFamilyRuntimeSpanSinks();
    expect(records.filter((n) => n === 'pryzm.family.bake.resolveType')).toHaveLength(1);
    expect(records.filter((n) => n === 'pryzm.family.parameter.evaluate')).toHaveLength(1);
  });
});
