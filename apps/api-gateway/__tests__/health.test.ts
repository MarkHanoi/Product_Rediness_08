import { describe, it, expect, afterEach } from 'vitest';
import { startRig, type TestRig } from './helpers.js';

let rig: TestRig | undefined;
afterEach(async () => { await rig?.close(); rig = undefined; });

describe('GET /v1/health', () => {
  it('returns 200 + sprint marker + snapshot of injected ports', async () => {
    rig = await startRig();
    const res = await fetch(`${rig.baseUrl}/v1/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.sprint).toBe('S65');
    expect(body.version).toBe('0.1.0');
    expect(body.snapshot).toMatchObject({
      formulas: 12,
      spendEntries: 0,
      overrides: 0,
      workflows: 2,
    });
  });

  it('does not require auth', async () => {
    rig = await startRig();
    const res = await fetch(`${rig.baseUrl}/v1/health`);
    expect(res.status).toBe(200);
  });
});

describe('404', () => {
  it('returns structured 404 for unknown paths', async () => {
    rig = await startRig();
    const res = await fetch(`${rig.baseUrl}/v1/no-such-thing`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toMatchObject({ error: 'not_found', method: 'GET', path: '/v1/no-such-thing' });
  });
});
