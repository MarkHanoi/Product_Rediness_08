// router unit tests (S28 — Persistent Project Hub).
//
// Spec: `phases/PHASE-2A-Q1-M13-M15-NON-ELEMENT-COMPLETION.md`
//   §S28 D4 line 741 — "Deep-link routing: apps/editor/src/router.ts
//   — maps pathname to ProjectHubView or ProjectEditorView".
//
// Pure URL parser; covers the three route kinds + the two URL-builder
// helpers + mode-param preservation.

import { describe, expect, it } from 'vitest';
import {
  parseRoute,
  buildHubUrl,
  buildProjectUrl,
  PRYZM2_FLAG,
  PRYZM2_PROJECT_PARAM,
} from '../src/router.js';

describe('router — parseRoute', () => {
  it('returns { kind: "legacy" } when the pryzm2=1 flag is absent', () => {
    expect(parseRoute('?')).toEqual({ kind: 'legacy' });
    expect(parseRoute('')).toEqual({ kind: 'legacy' });
    expect(parseRoute('?other=1')).toEqual({ kind: 'legacy' });
    expect(parseRoute(new URL('https://app.example/?foo=bar'))).toEqual({ kind: 'legacy' });
  });

  it('returns { kind: "legacy" } when pryzm2 is set to a non-1 value', () => {
    expect(parseRoute('?pryzm2=0')).toEqual({ kind: 'legacy' });
    expect(parseRoute('?pryzm2=true')).toEqual({ kind: 'legacy' });
    expect(parseRoute('?pryzm2=')).toEqual({ kind: 'legacy' });
  });

  it('returns { kind: "hub" } when pryzm2=1 with no project param', () => {
    expect(parseRoute('?pryzm2=1')).toEqual({ kind: 'hub' });
    expect(parseRoute('?pryzm2=1&mode=webgpu')).toEqual({ kind: 'hub' });
    expect(parseRoute(new URL('https://app.example/?pryzm2=1'))).toEqual({ kind: 'hub' });
  });

  it('returns { kind: "project", projectId } when project param is present', () => {
    expect(parseRoute('?pryzm2=1&project=abc-123')).toEqual({
      kind: 'project',
      projectId: 'abc-123',
    });
    expect(parseRoute('?pryzm2=1&project=p1&mode=webgl2')).toEqual({
      kind: 'project',
      projectId: 'p1',
    });
  });

  it('treats empty project= as the hub (per the helper contract)', () => {
    expect(parseRoute('?pryzm2=1&project=')).toEqual({ kind: 'hub' });
  });

  it('accepts URLSearchParams directly', () => {
    const p = new URLSearchParams();
    p.set(PRYZM2_FLAG, '1');
    p.set(PRYZM2_PROJECT_PARAM, 'xyz');
    expect(parseRoute(p)).toEqual({ kind: 'project', projectId: 'xyz' });
  });

  it('accepts a search string without the leading ?', () => {
    expect(parseRoute('pryzm2=1&project=q')).toEqual({ kind: 'project', projectId: 'q' });
  });
});

describe('router — buildHubUrl', () => {
  it('builds the bare ?pryzm2=1 URL by default', () => {
    expect(buildHubUrl()).toBe('?pryzm2=1');
  });

  it('preserves mode=webgpu when present in the current search', () => {
    expect(buildHubUrl('?pryzm2=1&project=p&mode=webgpu')).toBe('?pryzm2=1&mode=webgpu');
  });

  it('preserves mode=webgl2 but drops other params', () => {
    expect(buildHubUrl('?pryzm2=1&project=p&mode=webgl2&junk=1')).toBe('?pryzm2=1&mode=webgl2');
  });

  it('drops invalid mode values', () => {
    expect(buildHubUrl('?pryzm2=1&mode=auto')).toBe('?pryzm2=1');
  });
});

describe('router — buildProjectUrl', () => {
  it('builds ?pryzm2=1&project=<id>', () => {
    expect(buildProjectUrl('abc')).toBe('?pryzm2=1&project=abc');
  });

  it('preserves mode=webgpu', () => {
    expect(buildProjectUrl('abc', '?mode=webgpu')).toBe('?pryzm2=1&project=abc&mode=webgpu');
  });

  it('encodes the project id', () => {
    const url = buildProjectUrl('a/b c');
    expect(url).toBe('?pryzm2=1&project=a%2Fb+c');
  });

  it('throws on empty project id', () => {
    expect(() => buildProjectUrl('')).toThrow(/projectId required/);
  });

  it('round-trips with parseRoute', () => {
    const url = buildProjectUrl('proj-xyz');
    expect(parseRoute(url)).toEqual({ kind: 'project', projectId: 'proj-xyz' });
  });

  it('round-trips with parseRoute when mode is preserved', () => {
    const url = buildProjectUrl('proj-xyz', '?mode=webgl2');
    const route = parseRoute(url);
    expect(route).toEqual({ kind: 'project', projectId: 'proj-xyz' });
  });
});
