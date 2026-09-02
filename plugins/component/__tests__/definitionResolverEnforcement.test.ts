// definitionResolverEnforcement — the handlers' resolver checks, at handler layer.
// §COMPONENT-CATALOG (lane U0) · C110 §3.5-a · C111 · C16 CA-3 · C84 §6.2c.
//
// ⛔ THIS FILE IS NOT THE LANE'S ACCEPTANCE, AND SAYING SO IS THE POINT (the
// componentRecord.test.ts discipline, kept). The acceptance is
// `apps/editor/__tests__/componentCatalogSeamThroughComposedRuntime.test.ts`,
// which boots the REAL composition root and consults the REAL catalogue. THIS
// file supplies a stub resolver, so by construction it cannot observe a missing
// PluginRegistry injection — what it CAN pin, cheaply and exactly, is the refusal
// TEXT contract: which ids a refusal names, and that the no-resolver construction
// keeps the Phase-4C behaviour (the declared gap) rather than inventing a "yes".

import { describe, expect, it } from 'vitest';
import { PlaceComponentHandler } from '../src/handlers/PlaceComponent.js';
import { SwapComponentTypeHandler } from '../src/handlers/SwapComponentType.js';
import { SetComponentInstanceParameterHandler } from '../src/handlers/SetComponentInstanceParameter.js';
import {
  valueShapeRefusal,
  type ComponentDefinitionResolver,
  type ComponentDefinitionView,
} from '../src/definitionResolver.js';
import type { HandlerContext } from '@pryzm/plugin-sdk';

const ULID_STEM = '01ARZ3NDEKTSV4RRFFQ69G5F';
const A32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ulidN = (n: number): string => ULID_STEM + A32[Math.floor(n / 32) % 32] + A32[n % 32];

const COMPONENT_ID = `component_${ulidN(60)}`;
const DEF_ID = `fam_${ulidN(61)}`;
const DEF_UNKNOWN = `fam_${ulidN(62)}`;
const TYPE_A = `typ_${ulidN(63)}`;
const TYPE_ALIEN = `typ_${ulidN(64)}`;
const P_INSTANCE = `par_${ulidN(65)}`; // instance / length
const P_TYPE = `par_${ulidN(66)}`;     // type / length
const P_ALIEN = `par_${ulidN(67)}`;

const VIEW: ComponentDefinitionView = {
  definitionId: DEF_ID,
  name: 'StubWindow',
  semver: '1.0.0',
  schemaHash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
  provenance: 'project',
  types: [{ id: TYPE_A, name: 'W1200' }],
  parameters: [
    { id: P_INSTANCE, name: 'Width', kind: 'instance', dataType: 'length' },
    { id: P_TYPE, name: 'SillHeight', kind: 'type', dataType: 'length' },
  ],
};

const resolver: ComponentDefinitionResolver = {
  has: (id) => id === DEF_ID,
  view: (id) => (id === DEF_ID ? VIEW : undefined),
  list: () => [VIEW],
};

const PLACE = {
  componentId: COMPONENT_ID,
  levelId: 'L0',
  definitionId: DEF_ID,
  typeId: TYPE_A,
  origin: { x: 0, y: 0, z: 0 },
  rotation: 0,
};

/* eslint-disable @typescript-eslint/no-explicit-any */
const emptyCtx = { audit: {}, stores: { component: {} } } as unknown as HandlerContext<any>;
function ctxWith(record: Record<string, unknown>): HandlerContext<any> {
  return { audit: {}, stores: { component: { [COMPONENT_ID]: record } } } as unknown as HandlerContext<any>;
}
const PLACED = {
  id: COMPONENT_ID, type: 'component', levelId: 'L0',
  definitionId: DEF_ID, typeId: TYPE_A,
  origin: { x: 0, y: 0, z: 0 }, rotation: 0, instanceParameters: {},
};

describe('component.place — resolver enforcement at canExecute', () => {
  const h = new PlaceComponentHandler(resolver);

  it('accepts a placement whose definition, type and overrides all resolve', () => {
    const r = h.canExecute(emptyCtx, { ...PLACE, instanceParameters: { [P_INSTANCE]: 1.2 } });
    expect(r).toEqual({ valid: true });
  });

  it('REFUSES an unknown definition, NAMING the id', () => {
    const r = h.canExecute(emptyCtx, { ...PLACE, definitionId: DEF_UNKNOWN });
    expect(r.valid).toBe(false);
    expect((r as { reason: string }).reason).toContain(DEF_UNKNOWN);
    expect((r as { reason: string }).reason).toContain('catalogue');
  });

  it('REFUSES a type the definition does not declare, NAMING BOTH ids', () => {
    const r = h.canExecute(emptyCtx, { ...PLACE, typeId: TYPE_ALIEN });
    expect(r.valid).toBe(false);
    const reason = (r as { reason: string }).reason;
    expect(reason).toContain(TYPE_ALIEN);
    expect(reason).toContain(DEF_ID);
  });

  it('REFUSES an override on an UNDECLARED parameter, naming parameter and definition', () => {
    const r = h.canExecute(emptyCtx, { ...PLACE, instanceParameters: { [P_ALIEN]: 1 } });
    expect(r.valid).toBe(false);
    const reason = (r as { reason: string }).reason;
    expect(reason).toContain(P_ALIEN);
    expect(reason).toContain(DEF_ID);
  });

  it('REFUSES an override on a TYPE-kind parameter (instance-kind enforcement, C111)', () => {
    const r = h.canExecute(emptyCtx, { ...PLACE, instanceParameters: { [P_TYPE]: 1 } });
    expect(r.valid).toBe(false);
    expect((r as { reason: string }).reason).toContain(`kind 'type'`);
  });

  it('REFUSES a value whose shape cannot wear the dataType (unit-kind at placement, C110 §3.5-a)', () => {
    const r = h.canExecute(emptyCtx, { ...PLACE, instanceParameters: { [P_INSTANCE]: true } });
    expect(r.valid).toBe(false);
    expect((r as { reason: string }).reason).toContain(`'length'`);
  });

  it('CONTROL — WITHOUT a resolver the Phase-4C behaviour is unchanged (declared gap, not a fabricated yes)', () => {
    const bare = new PlaceComponentHandler();
    expect(bare.canExecute(emptyCtx, { ...PLACE, definitionId: DEF_UNKNOWN })).toEqual({ valid: true });
  });
});

describe('component.swapType — membership enforcement at canExecute', () => {
  const h = new SwapComponentTypeHandler(resolver);

  it('REFUSES a type outside the definition, NAMING BOTH ids', () => {
    const r = h.canExecute(ctxWith(PLACED), { componentId: COMPONENT_ID, typeId: TYPE_ALIEN });
    expect(r.valid).toBe(false);
    const reason = (r as { reason: string }).reason;
    expect(reason).toContain(TYPE_ALIEN);
    expect(reason).toContain(DEF_ID);
  });

  it('REFUSES a swap on an occurrence whose definition is NOT LOADED, naming the definition (escape hatch stated)', () => {
    // ⚠ The target must DIFFER from the worn type or the "already wears" refusal
    // fires first — the check order is deliberate (cheap identity before catalogue).
    const r = h.canExecute(
      ctxWith({ ...PLACED, definitionId: DEF_UNKNOWN }),
      { componentId: COMPONENT_ID, typeId: TYPE_ALIEN },
    );
    expect(r.valid).toBe(false);
    const reason = (r as { reason: string }).reason;
    expect(reason).toContain(DEF_UNKNOWN);
    expect(reason).toContain('Load the definition');
  });

  it('CONTROL — WITHOUT a resolver the Phase-4C behaviour is unchanged', () => {
    const bare = new SwapComponentTypeHandler();
    expect(bare.canExecute(ctxWith(PLACED), { componentId: COMPONENT_ID, typeId: TYPE_ALIEN }))
      .toEqual({ valid: true });
  });
});

describe('component.setInstanceParameter — SET-leg enforcement at canExecute', () => {
  const h = new SetComponentInstanceParameterHandler(resolver);

  it('accepts a declared instance parameter with a shape-correct value', () => {
    expect(h.canExecute(ctxWith(PLACED), { componentId: COMPONENT_ID, parameterId: P_INSTANCE, value: 1.8 }))
      .toEqual({ valid: true });
  });

  it('REFUSES an undeclared parameter / a type-kind parameter / a shape mismatch', () => {
    const alien = h.canExecute(ctxWith(PLACED), { componentId: COMPONENT_ID, parameterId: P_ALIEN, value: 1 });
    expect(alien.valid).toBe(false);
    expect((alien as { reason: string }).reason).toContain(P_ALIEN);

    const typeKind = h.canExecute(ctxWith(PLACED), { componentId: COMPONENT_ID, parameterId: P_TYPE, value: 1 });
    expect(typeKind.valid).toBe(false);
    expect((typeKind as { reason: string }).reason).toContain(`kind 'type'`);

    const shape = h.canExecute(ctxWith(PLACED), { componentId: COMPONENT_ID, parameterId: P_INSTANCE, value: 'wide' });
    expect(shape.valid).toBe(false);
    expect((shape as { reason: string }).reason).toContain(`'length'`);
  });

  it('the CLEAR leg is NOT gated on the catalogue — clearing a real override succeeds with the definition unloaded', () => {
    const withOverride = ctxWith({
      ...PLACED,
      definitionId: DEF_UNKNOWN,
      instanceParameters: { [P_INSTANCE]: 1.8 },
    });
    expect(h.canExecute(withOverride, { componentId: COMPONENT_ID, parameterId: P_INSTANCE, clear: true }))
      .toEqual({ valid: true });
  });
});

describe('valueShapeRefusal — the value-shape half of C110 §3.5-a, never overstating', () => {
  it('answers null for every honest pairing', () => {
    expect(valueShapeRefusal('length', 1.2)).toBeNull();
    expect(valueShapeRefusal('angle', 0)).toBeNull();
    expect(valueShapeRefusal('number', -3.5)).toBeNull();
    expect(valueShapeRefusal('count', 4)).toBeNull();
    expect(valueShapeRefusal('boolean', false)).toBeNull();
    expect(valueShapeRefusal('string', '')).toBeNull();
  });

  it('names both sides on a mismatch', () => {
    expect(valueShapeRefusal('length', 'wide')).toContain(`'length'`);
    expect(valueShapeRefusal('boolean', 1)).toContain(`'boolean'`);
    expect(valueShapeRefusal('count', 2.5)).toContain('INTEGER');
    expect(valueShapeRefusal('number', Number.NaN)).toContain('finite');
  });
});
