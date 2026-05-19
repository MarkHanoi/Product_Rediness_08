// Feature-flag registry unit suite (post-2B closeout / ADR-0030).

import { describe, expect, it } from 'vitest';
import {
  FeatureFlagRegistry,
  K2B_FLAGS,
  createDefaultRegistry,
} from '../src/index.js';

describe('K2B kill-switch definitions', () => {
  it('defines exactly K2B-1 .. K2B-4', () => {
    const names = K2B_FLAGS.map((f) => f.name).sort();
    expect(names).toEqual(['K2B-1', 'K2B-2', 'K2B-3', 'K2B-4']);
  });

  it('every kill-switch defaults ON (turning it off disables the feature)', () => {
    for (const def of K2B_FLAGS) expect(def.defaultValue).toBe(true);
  });

  it('every kill-switch carries an env var override', () => {
    for (const def of K2B_FLAGS) expect(def.envVar).toMatch(/^PRYZM_K2B_/);
  });
});

describe('createDefaultRegistry', () => {
  it('pre-loads all K2B flags', () => {
    const r = createDefaultRegistry();
    for (const def of K2B_FLAGS) expect(r.has(def.name)).toBe(true);
    expect(r.definitions()).toHaveLength(K2B_FLAGS.length);
  });

  it('snapshot returns the default true values', () => {
    const r = createDefaultRegistry();
    const snap = r.snapshot();
    expect(snap['K2B-1']).toBe(true);
    expect(snap['K2B-4']).toBe(true);
  });
});

describe('FeatureFlagRegistry — get/set/override semantics', () => {
  it('throws on unknown get / set', () => {
    const r = new FeatureFlagRegistry();
    expect(() => r.get('nope')).toThrow();
    expect(() => r.set('nope', true)).toThrow();
  });

  it('set applies an explicit override', () => {
    const r = createDefaultRegistry();
    expect(r.get('K2B-1')).toBe(true);
    r.set('K2B-1', false);
    expect(r.get('K2B-1')).toBe(false);
  });

  it('set(undefined) clears the override', () => {
    const r = createDefaultRegistry();
    r.set('K2B-2', false);
    r.set('K2B-2', undefined);
    expect(r.get('K2B-2')).toBe(true);
  });

  it('onChange fires only on effective change', () => {
    const r = createDefaultRegistry();
    let calls: Array<[string, boolean]> = [];
    r.onChange((n, v) => calls.push([n, v]));

    r.set('K2B-1', true); // no change (already true)
    expect(calls).toEqual([]);

    r.set('K2B-1', false);
    expect(calls).toEqual([['K2B-1', false]]);

    r.set('K2B-1', false); // no change
    expect(calls).toHaveLength(1);
  });

  it('listener errors are swallowed (registry must not crash)', () => {
    const r = createDefaultRegistry();
    r.onChange(() => { throw new Error('boom'); });
    expect(() => r.set('K2B-1', false)).not.toThrow();
  });
});

describe('loadFromEnv', () => {
  it('parses truthy and falsey strings', () => {
    const r = createDefaultRegistry();
    r.loadFromEnv({
      PRYZM_K2B_1: '0',
      PRYZM_K2B_2: 'false',
      PRYZM_K2B_3: 'OFF',
      PRYZM_K2B_4: 'no',
    });
    expect(r.get('K2B-1')).toBe(false);
    expect(r.get('K2B-2')).toBe(false);
    expect(r.get('K2B-3')).toBe(false);
    expect(r.get('K2B-4')).toBe(false);

    r.loadFromEnv({
      PRYZM_K2B_1: '1',
      PRYZM_K2B_2: 'TRUE',
      PRYZM_K2B_3: 'on',
      PRYZM_K2B_4: 'yes',
    });
    for (const k of ['K2B-1', 'K2B-2', 'K2B-3', 'K2B-4']) {
      expect(r.get(k)).toBe(true);
    }
  });

  it('ignores empty / unparseable values', () => {
    const r = createDefaultRegistry();
    r.set('K2B-1', false);
    r.loadFromEnv({ PRYZM_K2B_1: '' });
    expect(r.get('K2B-1')).toBe(false); // unchanged

    r.loadFromEnv({ PRYZM_K2B_1: 'maybe' });
    expect(r.get('K2B-1')).toBe(false); // still unchanged
  });
});
