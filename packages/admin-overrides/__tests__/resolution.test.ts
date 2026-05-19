import { describe, it, expect } from 'vitest';
import {
  InMemoryOverrideStore,
  resolveEffective,
  type OverrideRecord,
} from '../src/index.js';

const baseAt = Date.UTC(2026, 3, 1);

function rec(o: Partial<OverrideRecord> = {}): OverrideRecord {
  return {
    subjectKind: 'workspace',
    subjectId: 'ws-acme',
    setBy: 'admin@pryzm.com',
    setAt: baseAt,
    reason: 'reason',
    ...o,
  };
}

describe('resolveEffective — no override', () => {
  it('returns baseline when store is empty', () => {
    const s = new InMemoryOverrideStore();
    const res = resolveEffective(s, {
      subjectKind: 'workspace',
      subjectId: 'ws-x',
      baselinePlan: 'team',
      baselineRoles: ['editor'],
      baselineFeatures: { 'webgpu': false },
    });
    expect(res.effectivePlan).toBe('team');
    expect(res.effectiveRoles).toEqual(['editor']);
    expect(res.effectiveFeatures).toEqual({ webgpu: false });
    expect(res.overrideApplied).toBe(false);
  });
});

describe('resolveEffective — plan override wins', () => {
  it('plan override replaces baseline', () => {
    const s = new InMemoryOverrideStore();
    s.set(rec({ plan: 'enterprise' }));
    const res = resolveEffective(s, {
      subjectKind: 'workspace',
      subjectId: 'ws-acme',
      baselinePlan: 'personal',
    });
    expect(res.effectivePlan).toBe('enterprise');
    expect(res.overrideApplied).toBe(true);
    expect(res.overrideReason).toBe('reason');
  });

  it('omitted plan in override falls back to baseline plan', () => {
    const s = new InMemoryOverrideStore();
    s.set(rec({ plan: undefined, features: { 'beta-x': true } }));
    const res = resolveEffective(s, {
      subjectKind: 'workspace',
      subjectId: 'ws-acme',
      baselinePlan: 'team',
    });
    expect(res.effectivePlan).toBe('team');
    expect(res.effectiveFeatures).toEqual({ 'beta-x': true });
  });
});

describe('resolveEffective — roles UNION', () => {
  it('override roles add to baseline roles, no duplicates', () => {
    const s = new InMemoryOverrideStore();
    s.set(rec({ roles: ['admin', 'editor'] }));
    const res = resolveEffective(s, {
      subjectKind: 'workspace',
      subjectId: 'ws-acme',
      baselinePlan: 'team',
      baselineRoles: ['editor', 'viewer'],
    });
    expect(new Set(res.effectiveRoles)).toEqual(new Set(['admin', 'editor', 'viewer']));
  });
});

describe('resolveEffective — features merge', () => {
  it('override `false` disables baseline `true`', () => {
    const s = new InMemoryOverrideStore();
    s.set(rec({ features: { 'webgpu': false } }));
    const res = resolveEffective(s, {
      subjectKind: 'workspace',
      subjectId: 'ws-acme',
      baselinePlan: 'team',
      baselineFeatures: { 'webgpu': true, 'pdf2bim': true },
    });
    expect(res.effectiveFeatures).toEqual({ 'webgpu': false, 'pdf2bim': true });
  });
});

describe('resolveEffective — expiry', () => {
  it('expired override is IGNORED — baseline returned, overrideApplied=false', () => {
    const s = new InMemoryOverrideStore();
    s.set(rec({ plan: 'enterprise', expiresAt: 1000 }));
    const res = resolveEffective(s, {
      subjectKind: 'workspace',
      subjectId: 'ws-acme',
      baselinePlan: 'personal',
      now: 1500, // strictly after expiresAt
    });
    expect(res.effectivePlan).toBe('personal');
    expect(res.overrideApplied).toBe(false);
  });

  it('exactly-at expiry is treated as expired (>=)', () => {
    const s = new InMemoryOverrideStore();
    s.set(rec({ plan: 'enterprise', expiresAt: 1000 }));
    const res = resolveEffective(s, {
      subjectKind: 'workspace',
      subjectId: 'ws-acme',
      baselinePlan: 'personal',
      now: 1000,
    });
    expect(res.overrideApplied).toBe(false);
  });

  it('not-yet-expired override is honoured', () => {
    const s = new InMemoryOverrideStore();
    s.set(rec({ plan: 'enterprise', expiresAt: 2000 }));
    const res = resolveEffective(s, {
      subjectKind: 'workspace',
      subjectId: 'ws-acme',
      baselinePlan: 'personal',
      now: 1500,
    });
    expect(res.overrideApplied).toBe(true);
    expect(res.effectivePlan).toBe('enterprise');
    expect(res.overrideExpiresAt).toBe(2000);
  });

  it('omitted expiresAt = permanent', () => {
    const s = new InMemoryOverrideStore();
    s.set(rec({ plan: 'enterprise' }));
    const res = resolveEffective(s, {
      subjectKind: 'workspace',
      subjectId: 'ws-acme',
      baselinePlan: 'personal',
      now: Number.MAX_SAFE_INTEGER,
    });
    expect(res.overrideApplied).toBe(true);
  });
});

describe('result immutability', () => {
  it('frozen — admin code cannot accidentally mutate the resolved subject', () => {
    const s = new InMemoryOverrideStore();
    const res = resolveEffective(s, {
      subjectKind: 'user',
      subjectId: 'u-1',
      baselinePlan: 'team',
    });
    expect(() => { (res as any).effectivePlan = 'enterprise'; }).toThrow(TypeError);
  });
});
