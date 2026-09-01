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

  /* ------------------------------------------------------------------ *
   * §BOTH-PRESENT — ADR-0376 D4.
   *
   * ⛔ THIS IS THE ARM THAT DID NOT EXIST, and its absence is the whole
   *    story. Read the four arms above: each parameter carries EITHER a
   *    default OR an expression, never both. The precedence inversion —
   *    `defaultValue` silently pre-empting `expression` — lived in the gap
   *    between them for the entire life of this file, under a describe
   *    block literally titled "precedence", with the arm above it titled
   *    "expression is used when NO DEFAULT and no override" naming the
   *    exclusion out loud.
   * ------------------------------------------------------------------ */
  it('expression BEATS defaultValue when BOTH are present (ADR-0376 D4)', () => {
    // The founder's §64 demo, in shape: "make the glass width always the
    // opening width minus twice the frame width" — applied to a parameter
    // that was AUTHORED with a default first, which is the only way
    // progressive parametrisation ever happens.
    const r = resolveParameter({
      parameters: [
        param({ id: 'p_ow', name: 'OpeningWidth', defaultValue: 1200 }),
        param({ id: 'p_fw', name: 'FrameWidth', defaultValue: 60 }),
        param({
          id: 'p_gw',
          name: 'GlassWidth',
          defaultValue: 999,
          expression: 'OpeningWidth - 2 * FrameWidth',
        }),
      ],
      type: null,
      instanceOverrides: {},
    });
    expect(r.ok).toBe(true);
    // 1200 − 2×60 = 1080. Before the fix this returned GlassWidth: 999,
    // ok:true, zero diagnostics — the demo failing SILENTLY, which is the
    // only reason it survived review.
    expect(r.ok && r.values).toEqual({ OpeningWidth: 1200, FrameWidth: 60, GlassWidth: 1080 });
  });

  it('WARNS, naming the parameter, when a default was superseded — and stays ok', () => {
    const r = resolveParameter({
      parameters: [
        param({ id: 'p_ow', name: 'OpeningWidth', defaultValue: 1200 }),
        param({ id: 'p_gw', name: 'GlassWidth', defaultValue: 999, expression: 'OpeningWidth - 120' }),
      ],
      type: null,
      instanceOverrides: {},
    });
    // A dead default is a documentation defect, not a resolution failure:
    // severity 'warn', so ok must stay true.
    expect(r.ok).toBe(true);
    const warn = r.diagnostics.find((d) => d.code === 'superseded-default');
    expect(warn).toBeDefined();
    expect(warn!.severity).toBe('warn');
    expect(warn!.parameterId).toBe('p_gw');
    // It must NAME the parameter — a warning that says "a default was
    // superseded somewhere" is not actionable.
    expect(warn!.message).toContain('GlassWidth');
    // …and it must not fire on the parameter that has no expression.
    expect(r.diagnostics.filter((d) => d.code === 'superseded-default')).toHaveLength(1);
  });

  it('type override beats the expression', () => {
    const type: FamilyType = { id: 't_fix', name: 'Fixed', values: { p_gw: 700 } };
    const r = resolveParameter({
      parameters: [
        param({ id: 'p_ow', name: 'OpeningWidth', defaultValue: 1200 }),
        param({ id: 'p_gw', name: 'GlassWidth', defaultValue: 999, expression: 'OpeningWidth - 120' }),
      ],
      type,
      instanceOverrides: {},
    });
    expect(r.ok && r.values).toEqual({ OpeningWidth: 1200, GlassWidth: 700 });
  });

  it('instance override beats the expression', () => {
    const type: FamilyType = { id: 't_fix', name: 'Fixed', values: { p_gw: 700 } };
    const r = resolveParameter({
      parameters: [
        param({ id: 'p_ow', name: 'OpeningWidth', defaultValue: 1200 }),
        param({ id: 'p_gw', name: 'GlassWidth', defaultValue: 999, expression: 'OpeningWidth - 120' }),
      ],
      type,
      instanceOverrides: { p_gw: 640 },
    });
    expect(r.ok && r.values).toEqual({ OpeningWidth: 1200, GlassWidth: 640 });
  });

  it('a string-typed parameter keeps its default — the evaluator is numeric', () => {
    // The one shape where the default legitimately survives an expression.
    // Guarded here so "expression beats default" is never over-applied.
    const r = resolveParameter({
      parameters: [
        param({ id: 'p_w', name: 'Width', defaultValue: 800 }),
        param({ id: 'p_f', name: 'Finish', dataType: 'string', defaultValue: 'Oak', expression: 'Width / 2' }),
      ],
      type: null,
      instanceOverrides: {},
    });
    expect(r.ok && r.values).toEqual({ Width: 800, Finish: 'Oak' });
    expect(r.diagnostics.filter((d) => d.code === 'superseded-default')).toHaveLength(0);
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
