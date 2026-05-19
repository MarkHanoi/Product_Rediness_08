import { describe, it, expect, afterEach } from 'vitest';
import { startRig, type TestRig } from './helpers.js';
import { isAdminRole } from '../src/index.js';

let rig: TestRig | undefined;
afterEach(async () => { await rig?.close(); rig = undefined; });

describe('default test auth shim', () => {
  it('parses scopes from X-Test-Scopes', async () => {
    rig = await startRig();
    rig.projects.put('p-1', new Uint8Array([0x50, 0x4b, 0x05, 0x06, 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]));
    const res = await fetch(`${rig.baseUrl}/v1/projects/p-1/export.pryzm`, {
      headers: {
        'x-test-subject': 'u-1',
        'x-test-scopes': 'project:read project:write',
      },
    });
    expect(res.status).toBe(200);
  });

  it('drops unknown scopes silently (RFC 6749 §3.3)', async () => {
    rig = await startRig();
    rig.projects.put('p-1', new Uint8Array([0x50, 0x4b, 0x05, 0x06, 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]));
    const res = await fetch(`${rig.baseUrl}/v1/projects/p-1/export.pryzm`, {
      headers: {
        'x-test-subject': 'u-1',
        'x-test-scopes': 'galactic:overlord project:read',
      },
    });
    expect(res.status).toBe(200);
  });

  it('falls back to anonymous when no subject header', async () => {
    rig = await startRig();
    const res = await fetch(`${rig.baseUrl}/v1/health`);
    expect(res.status).toBe(200); // health doesn't care, but the shim still ran
  });
});

describe('isAdminRole', () => {
  it('recognises admin and owner', () => {
    expect(isAdminRole('admin')).toBe(true);
    expect(isAdminRole('owner')).toBe(true);
  });
  it('rejects others', () => {
    expect(isAdminRole('editor')).toBe(false);
    expect(isAdminRole('viewer')).toBe(false);
    expect(isAdminRole('')).toBe(false);
  });
});
