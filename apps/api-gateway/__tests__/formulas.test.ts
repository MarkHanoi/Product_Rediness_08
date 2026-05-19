import { describe, it, expect, afterEach } from 'vitest';
import { startRig, type TestRig } from './helpers.js';

let rig: TestRig | undefined;
afterEach(async () => { await rig?.close(); rig = undefined; });

describe('GET /v1/formulas', () => {
  it('lists 12 built-in formulas in registration order', async () => {
    rig = await startRig();
    const res = await fetch(`${rig.baseUrl}/v1/formulas`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(12);
    expect(body.formulas.map((f: any) => f.id)).toEqual([
      'sum', 'avg', 'min', 'max', 'count',
      'distance', 'area-rect', 'perimeter-rect',
      'ratio', 'clamp', 'lerp', 'round',
    ]);
  });

  it('every descriptor exposes id, name, signature, returnType, version', async () => {
    rig = await startRig();
    const res = await fetch(`${rig.baseUrl}/v1/formulas`);
    const body = await res.json();
    for (const f of body.formulas) {
      expect(f.id).toBeTruthy();
      expect(f.name).toBeTruthy();
      expect(f.signature.params).toBeInstanceOf(Array);
      expect(['number', 'string']).toContain(f.signature.returnType);
      expect(f.version).toBe('1.0.0');
    }
  });
});

describe('GET /v1/formulas/:id', () => {
  it('returns single descriptor', async () => {
    rig = await startRig();
    const res = await fetch(`${rig.baseUrl}/v1/formulas/sum`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe('sum');
    expect(body.signature.params[0].type).toBe('array<number>');
  });

  it('404 unknown', async () => {
    rig = await startRig();
    const res = await fetch(`${rig.baseUrl}/v1/formulas/no-such`);
    expect(res.status).toBe(404);
  });

  it('400 invalid id format', async () => {
    rig = await startRig();
    const res = await fetch(`${rig.baseUrl}/v1/formulas/INVALID`);
    expect(res.status).toBe(400);
  });
});
