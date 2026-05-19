import { describe, it, expect, vi } from 'vitest';
import {
  ALL_API_SCOPES,
  API_SCOPE_DESCRIPTIONS,
  isApiScope,
  parseScopeString,
  formatScopeString,
  hasAllScopes,
  hasAnyScope,
  missingScopes,
  assertScopes,
  ScopeCheckError,
  requireScopes,
} from '../src/index';

describe('Scope catalogue (single source of truth — mirrors openapi.yaml)', () => {
  it('exposes exactly 3 scopes', () => {
    expect(ALL_API_SCOPES).toHaveLength(3);
  });

  it('the 3 scopes are project:read, project:write, ai:invoke', () => {
    expect([...ALL_API_SCOPES].sort()).toEqual(['ai:invoke', 'project:read', 'project:write']);
  });

  it('every scope has a frozen description matching the openapi.yaml text', () => {
    expect(Object.isFrozen(API_SCOPE_DESCRIPTIONS)).toBe(true);
    expect(API_SCOPE_DESCRIPTIONS['project:read']).toBe('Read project state');
    expect(API_SCOPE_DESCRIPTIONS['project:write']).toBe('Create/update projects');
    expect(API_SCOPE_DESCRIPTIONS['ai:invoke']).toBe('Invoke AI workflows');
  });
});

describe('isApiScope', () => {
  it('accepts every catalogued scope', () => {
    for (const s of ALL_API_SCOPES) expect(isApiScope(s)).toBe(true);
  });

  it('rejects unknown strings', () => {
    expect(isApiScope('admin')).toBe(false);
    expect(isApiScope('project:admin')).toBe(false);
    expect(isApiScope('')).toBe(false);
  });

  it('rejects non-strings', () => {
    expect(isApiScope(123)).toBe(false);
    expect(isApiScope(null)).toBe(false);
    expect(isApiScope(undefined)).toBe(false);
    expect(isApiScope({})).toBe(false);
    expect(isApiScope(['project:read'])).toBe(false);
  });
});

describe('parseScopeString (RFC 6749 §3.3 space-delimited)', () => {
  it('parses a single scope', () => {
    expect(parseScopeString('project:read')).toEqual(['project:read']);
  });

  it('parses multiple scopes', () => {
    const out = parseScopeString('project:read project:write ai:invoke');
    expect(out).toHaveLength(3);
    expect(out).toContain('project:read');
    expect(out).toContain('project:write');
    expect(out).toContain('ai:invoke');
  });

  it('drops unknown scopes silently', () => {
    expect(parseScopeString('project:read admin:everything')).toEqual(['project:read']);
  });

  it('de-duplicates', () => {
    expect(parseScopeString('project:read project:read')).toEqual(['project:read']);
  });

  it('returns [] for null/undefined/empty/non-string', () => {
    expect(parseScopeString(null)).toEqual([]);
    expect(parseScopeString(undefined)).toEqual([]);
    expect(parseScopeString('')).toEqual([]);
    expect(parseScopeString(123 as unknown as string)).toEqual([]);
  });

  it('handles arbitrary whitespace separators', () => {
    expect(parseScopeString('project:read\tproject:write\nai:invoke')).toHaveLength(3);
  });
});

describe('formatScopeString', () => {
  it('joins with single space, sorted, de-duplicated', () => {
    expect(formatScopeString(['project:write', 'project:read', 'project:read'])).toBe('project:read project:write');
  });

  it('returns "" for empty input', () => {
    expect(formatScopeString([])).toBe('');
  });
});

describe('hasAllScopes', () => {
  it('true when granted covers every required scope', () => {
    expect(hasAllScopes(['project:read', 'project:write'], ['project:read'])).toBe(true);
  });

  it('true for empty required (no requirement)', () => {
    expect(hasAllScopes([], [])).toBe(true);
    expect(hasAllScopes(['project:read'], [])).toBe(true);
  });

  it('false when ANY required scope is missing', () => {
    expect(hasAllScopes(['project:read'], ['project:read', 'project:write'])).toBe(false);
  });

  it('false for empty granted with non-empty required', () => {
    expect(hasAllScopes([], ['project:read'])).toBe(false);
  });
});

describe('hasAnyScope', () => {
  it('true when granted covers at least one required scope', () => {
    expect(hasAnyScope(['project:read'], ['project:read', 'project:write'])).toBe(true);
  });

  it('false when granted covers none', () => {
    expect(hasAnyScope(['project:read'], ['project:write', 'ai:invoke'])).toBe(false);
  });

  it('true for empty required', () => {
    expect(hasAnyScope([], [])).toBe(true);
  });
});

describe('missingScopes', () => {
  it('returns the difference required - granted', () => {
    expect(missingScopes(['project:read'], ['project:read', 'project:write'])).toEqual(['project:write']);
  });

  it('returns [] when fully covered', () => {
    expect(missingScopes(['project:read', 'project:write'], ['project:read'])).toEqual([]);
  });
});

describe('assertScopes / ScopeCheckError', () => {
  it('does not throw when fully covered', () => {
    expect(() => assertScopes(['project:read', 'project:write'], ['project:read'])).not.toThrow();
  });

  it('throws ScopeCheckError when missing scopes', () => {
    expect(() => assertScopes(['project:read'], ['project:write'])).toThrow(ScopeCheckError);
  });

  it('error carries required + granted + missing', () => {
    try {
      assertScopes(['project:read'], ['project:read', 'project:write', 'ai:invoke']);
      expect.fail('expected ScopeCheckError');
    } catch (err) {
      expect(err).toBeInstanceOf(ScopeCheckError);
      const e = err as ScopeCheckError;
      expect(e.requiredScopes).toEqual(['project:read', 'project:write', 'ai:invoke']);
      expect(e.grantedScopes).toEqual(['project:read']);
      expect(e.missingScopes).toEqual(['project:write', 'ai:invoke']);
      expect(e.httpStatus).toBe(403);
      expect(e.wwwAuthenticate).toBe('Bearer error="insufficient_scope", scope="project:read project:write ai:invoke"');
    }
  });
});

describe('requireScopes middleware', () => {
  function makeRes() {
    const headers: Record<string, string> = {};
    const calls: { status?: number; body?: unknown } = {};
    const res = {
      status(code: number) { calls.status = code; return this; },
      setHeader(name: string, value: string) { headers[name] = value; return this; },
      json(body: unknown) { calls.body = body; return body; },
      _headers: headers,
      _calls: calls,
    } as const;
    return res;
  }

  it('calls next() when granted covers required', () => {
    const mw = requireScopes(['project:read']);
    const next = vi.fn();
    const res = makeRes();
    mw({ auth: { scopes: ['project:read', 'project:write'] } }, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith();
    expect(res._calls.status).toBeUndefined();
  });

  it('responds 403 with WWW-Authenticate when granted is missing scopes', () => {
    const mw = requireScopes(['project:write']);
    const next = vi.fn();
    const res = makeRes();
    mw({ auth: { scopes: ['project:read'] } }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res._calls.status).toBe(403);
    expect(res._headers['WWW-Authenticate']).toContain('insufficient_scope');
    expect(res._headers['WWW-Authenticate']).toContain('project:write');
    expect(res._calls.body).toMatchObject({
      error: 'insufficient_scope',
      missing: ['project:write'],
    });
  });

  it('treats absent req.auth as zero scopes', () => {
    const mw = requireScopes(['project:read']);
    const next = vi.fn();
    const res = makeRes();
    mw({}, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res._calls.status).toBe(403);
  });

  it('drops unknown scopes from req.auth.scopes (forward-compat)', () => {
    const mw = requireScopes(['project:read']);
    const next = vi.fn();
    const res = makeRes();
    mw({ auth: { scopes: ['admin:everything', 'project:read'] } }, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('snapshots the required list (caller mutation does not change behaviour)', () => {
    const required: ('project:read' | 'project:write')[] = ['project:read'];
    const mw = requireScopes(required);
    required.push('project:write');
    const next = vi.fn();
    const res = makeRes();
    mw({ auth: { scopes: ['project:read'] } }, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('empty required passes any token (including no auth)', () => {
    const mw = requireScopes([]);
    const next = vi.fn();
    mw({}, makeRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });
});
