/**
 * IFC `GloballyUniqueId` helper tests.
 */

import { describe, expect, it } from 'vitest';
import { deterministicUuid, globalIdFromUuid } from '../src/index.js';

describe('globalIdFromUuid', () => {
  it('produces a 22-character base64-style id', () => {
    const id = globalIdFromUuid('00000000-0000-0000-0000-000000000000');
    expect(id.length).toBe(22);
    expect(id).toMatch(/^[0-9A-Za-z_$]{22}$/);
  });

  it('is deterministic', () => {
    const u = '11223344-5566-7788-9900-aabbccddeeff';
    expect(globalIdFromUuid(u)).toBe(globalIdFromUuid(u));
  });

  it('rejects malformed UUIDs', () => {
    expect(() => globalIdFromUuid('not-a-uuid')).toThrow();
  });
});

describe('deterministicUuid', () => {
  it('returns a UUID-shaped string for any seed', () => {
    const u = deterministicUuid('hello');
    expect(u).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('is stable per seed', () => {
    expect(deterministicUuid('seed-A')).toBe(deterministicUuid('seed-A'));
    expect(deterministicUuid('seed-A')).not.toBe(deterministicUuid('seed-B'));
  });
});
