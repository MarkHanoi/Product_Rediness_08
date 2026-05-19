// deepLink — unit tests for the `?file=…` deep-link parser (S58 §19.7 #2).

import { describe, expect, it } from 'vitest';
import { parseDeepLinkRequest } from '../../src/app/deepLink.js';

describe('parseDeepLinkRequest', () => {
  it('returns no-file-param when ?file= is absent', () => {
    const r = parseDeepLinkRequest('');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('no-file-param');
  });

  it('returns no-file-param when search is unrelated', () => {
    const r = parseDeepLinkRequest('?theme=dark&lang=en');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('no-file-param');
  });

  it('returns empty-file-param when ?file= is empty / whitespace', () => {
    expect(parseDeepLinkRequest('?file=').ok).toBe(false);
    expect(parseDeepLinkRequest('?file=%20%20').ok).toBe(false);
  });

  it('classifies https:// targets as http source', () => {
    const r = parseDeepLinkRequest('?file=https://cdn.pryzm.app/door.pryzm-family');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.request).toEqual({
      kind: 'file',
      source: 'http',
      target: 'https://cdn.pryzm.app/door.pryzm-family',
    });
  });

  it('classifies fixture: targets as fixture source and strips the prefix', () => {
    const r = parseDeepLinkRequest('?file=fixture:door-v1');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.request).toEqual({ kind: 'file', source: 'fixture', target: 'door-v1' });
  });

  it('classifies bare relative paths as fs source', () => {
    const r = parseDeepLinkRequest('?file=fixtures/door.pryzm-family');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.request.source).toBe('fs');
    expect(r.request.target).toBe('fixtures/door.pryzm-family');
  });

  it('rejects path-traversal attempts', () => {
    const r = parseDeepLinkRequest('?file=../../etc/passwd');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('malicious');
  });

  it('rejects NUL-byte injection', () => {
    const r = parseDeepLinkRequest('?file=door%00.pryzm-family');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('malicious');
  });

  it('rejects javascript: / data: / file: / blob: / vbscript: protocols', () => {
    for (const proto of ['javascript:alert(1)', 'data:text/plain;base64,Zm9v', 'file:///etc/passwd', 'blob:abcd', 'VbScript:msgbox']) {
      const r = parseDeepLinkRequest(`?file=${encodeURIComponent(proto)}`);
      expect(r.ok, `proto=${proto}`).toBe(false);
      if (r.ok) continue;
      expect(r.reason).toBe('unsupported-protocol');
    }
  });

  it('tolerates a missing leading ?', () => {
    const r = parseDeepLinkRequest('file=fixture:door-v1');
    expect(r.ok).toBe(true);
  });
});
