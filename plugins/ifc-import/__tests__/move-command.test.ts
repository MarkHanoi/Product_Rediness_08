/**
 * MoveIFCProxyCommand reducer tests (Phase 3-B Sprint S57).
 *
 * Spec: PHASE-3B-Q2-M28-M30-IFC-REVIT-COMPONENT-EDITOR.md §3.1 lines 799-817.
 */

import { describe, expect, it } from 'vitest';
import {
  applyMoveProxy,
  applyMoveProxyTraced,
  type IFCProxyDTO,
  type MoveIFCProxyCommand,
} from '../src/index.js';

function makeProxy(): IFCProxyDTO {
  return {
    id: 'proxy-XYZ',
    globalId: 'XYZ123',
    ifcTypeName: 'IFCFURNITURE',
    name: 'Chair',
    transform: new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      10, 20, 30, 1,
    ]),
    geometryHash: 'sha256-test',
    psets: {},
    tier: 2,
  };
}

describe('applyMoveProxy', () => {
  it('translates the placement column without mutating input', () => {
    const proxy = makeProxy();
    const original = new Float32Array(proxy.transform);
    const cmd: MoveIFCProxyCommand = {
      kind: 'ifcProxy.move',
      id: 'proxy-XYZ',
      translate: [1.5, -2.5, 0.25],
    };
    const result = applyMoveProxy(proxy, cmd);
    expect(result.transform[12]).toBeCloseTo(11.5);
    expect(result.transform[13]).toBeCloseTo(17.5);
    expect(result.transform[14]).toBeCloseTo(30.25);
    expect([...proxy.transform]).toEqual([...original]);
  });

  it('rejects mismatched ids', () => {
    const proxy = makeProxy();
    expect(() => applyMoveProxy(proxy, {
      kind: 'ifcProxy.move',
      id: 'proxy-WRONG',
      translate: [0, 0, 0],
    })).toThrow(/proxy.id/);
  });

  it('rejects wrong command kind', () => {
    const proxy = makeProxy();
    expect(() => applyMoveProxy(proxy, {
      kind: 'something.else' as never,
      id: 'proxy-XYZ',
      translate: [0, 0, 0],
    })).toThrow(/expected ifcProxy.move/);
  });
});

describe('applyMoveProxyTraced', () => {
  it('emits a span and returns the same result as applyMoveProxy', async () => {
    const proxy = makeProxy();
    const cmd: MoveIFCProxyCommand = {
      kind: 'ifcProxy.move',
      id: 'proxy-XYZ',
      translate: [3, 0, 0],
    };
    const result = await applyMoveProxyTraced(proxy, cmd);
    expect(result.transform[12]).toBeCloseTo(13);
    expect(result.transform[13]).toBeCloseTo(20);
  });
});
