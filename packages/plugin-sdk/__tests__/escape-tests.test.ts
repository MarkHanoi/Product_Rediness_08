import { describe, it, expect } from 'vitest';
import { ESCAPE_VECTORS } from '../src/sandbox/escape-tests';
import { validateManifest } from '../src/descriptor';

describe('Sandbox escape-attempt audit suite (S62 D7 K3-C gate)', () => {
  it('contains at least 14 vectors covering all categories', () => {
    expect(ESCAPE_VECTORS.length).toBeGreaterThanOrEqual(14);
    const categories = new Set(ESCAPE_VECTORS.map((v) => v.category));
    expect(categories.has('csp-bypass')).toBe(true);
    expect(categories.has('wire-spoof')).toBe(true);
    expect(categories.has('sandbox-token-leak')).toBe(true);
    expect(categories.has('permission-bypass')).toBe(true);
  });

  for (const vector of ESCAPE_VECTORS) {
    it(`[${vector.category}] ${vector.name}`, () => {
      // The vector ASSERTS the SDK rejects the escape attempt.  A throw
      // means the audit failed (escape succeeded).  Resolution is
      // success (the SDK held the line).
      expect(() =>
        vector.assertReject({
          baseManifest: {
            pryzmPlugin: '1.0',
            id: 'audit-base',
            version: '1.0.0',
            displayName: 'Audit Base',
            description: '',
            author: 'tests',
            main: 'index.js',
            license: 'MIT',
            permissions: [],
            allowedOrigins: [],
            contributions: [],
            minPRYZMVersion: '2.0.0',
          },
        }),
      ).not.toThrow();
    });
  }
});

describe('Schema-level rejection — network:fetch + empty allowedOrigins (ADR-0038 §E)', () => {
  it('validateManifest rejects the combination', () => {
    const result = validateManifest({
      pryzmPlugin: '1.0',
      id: 'bad-net',
      version: '1.0.0',
      displayName: 'Bad Net',
      description: '',
      author: 'tests',
      main: 'index.js',
      license: 'MIT',
      permissions: ['network:fetch'],
      allowedOrigins: [],
      contributions: [],
      minPRYZMVersion: '2.0.0',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes('allowedOrigins'))).toBe(true);
    }
  });

  it('validateManifest accepts the combination when allowedOrigins is non-empty', () => {
    const result = validateManifest({
      pryzmPlugin: '1.0',
      id: 'good-net',
      version: '1.0.0',
      displayName: 'Good Net',
      description: '',
      author: 'tests',
      main: 'index.js',
      license: 'MIT',
      permissions: ['network:fetch'],
      allowedOrigins: ['https://api.example.com'],
      contributions: [],
      minPRYZMVersion: '2.0.0',
    });
    expect(result.ok).toBe(true);
  });
});
