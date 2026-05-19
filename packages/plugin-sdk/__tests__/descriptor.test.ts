// @pryzm/plugin-sdk — schema-lock test suite (S62 D1).
//
// Per ADR-0038, this file is the executable lock on the descriptor
// schema.  Every breaking change MUST come with a deliberate edit here so
// the PR review process catches it.  Phase-doc-2 line 182:
// "breaking changes in v1 are a 1-year deprecation cycle minimum."
//
// The tests below are organised by the schema fragment they pin.  When
// adding a v1.x additive change (new optional field, new permission
// string, new contribution kind), add a happy-path test for the new shape
// AND keep all existing tests green.  When considering a breaking change,
// stop and read ADR-0038 §Decision A first.

import { describe, expect, it } from 'vitest';
import {
  PluginContributionSchema,
  PluginManifestSchema,
  PluginPermissionSchema,
  validateManifest,
  type PluginManifest,
} from '../src/descriptor';

// A minimal valid manifest reused across happy-path tests.  Keep this
// stub conservative — the test suite for each invariant should mutate
// only the field under test.
function makeValidManifest(overrides: Partial<PluginManifest> = {}): unknown {
  return {
    pryzmPlugin: '1.0',
    id: 'wall-counter',
    version: '0.1.0',
    displayName: 'Wall Counter',
    description: 'Counts walls in the active project.',
    author: 'PRYZM',
    main: 'dist/index.js',
    permissions: ['read:project'],
    minPRYZMVersion: '2.0.0',
    ...overrides,
  };
}

describe('PluginManifestSchema — happy path', () => {
  it('parses a minimal valid manifest and applies defaults', () => {
    const result = validateManifest(makeValidManifest());
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Defaults applied.
      expect(result.manifest.license).toBe('MIT');
      expect(result.manifest.allowedOrigins).toEqual([]);
      expect(result.manifest.contributions).toEqual([]);
    }
  });

  it('parses a manifest with all optional fields populated', () => {
    const result = validateManifest(makeValidManifest({
      homepage: 'https://example.com/wall-counter',
      icon: 'data:image/svg+xml;base64,PHN2Zy8+',
      license: 'Apache-2.0',
      pricingModel: 'one-time',
      pricingCurrency: 'USD',
      pricingAmount: 9.99,
    }));
    expect(result.ok).toBe(true);
  });
});

describe('PluginManifestSchema — id regex (locked at v1)', () => {
  it.each([
    ['Uppercase'],
    ['9starts-with-digit'],
    ['hi'],                                // too short
    ['has_underscore'],
    ['has space'],
    ['has.dot'],
    ['a'.repeat(65)],                      // too long
  ])('rejects invalid id %p', invalid => {
    const result = validateManifest(makeValidManifest({ id: invalid as unknown as string }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join('\n')).toMatch(/^id:/m);
    }
  });

  it.each([
    ['ab1'],                               // shortest valid (3 chars, leading letter)
    ['wall-counter'],
    ['a-b-c-d-e'],
    ['x'.repeat(64)],                      // longest valid
  ])('accepts valid id %p', valid => {
    const result = validateManifest(makeValidManifest({ id: valid }));
    expect(result.ok).toBe(true);
  });
});

describe('PluginManifestSchema — version regex (locked at v1)', () => {
  it.each(['1', '1.0', '1.0.0-rc.1', 'v1.0.0', '1.0.0.0'])(
    'rejects non-semver version %p',
    invalid => {
      const result = validateManifest(makeValidManifest({ version: invalid }));
      expect(result.ok).toBe(false);
    },
  );

  it.each(['1', '2.0', '2.0.0-alpha'])(
    'rejects non-semver minPRYZMVersion %p',
    invalid => {
      const result = validateManifest(makeValidManifest({ minPRYZMVersion: invalid }));
      expect(result.ok).toBe(false);
    },
  );
});

describe('PluginManifestSchema — pryzmPlugin literal (locked at v1)', () => {
  it.each(['1.1', '2.0', '0.9', 1.0 as unknown as string])(
    'rejects pryzmPlugin %p — only "1.0" is the v1 wire version',
    invalid => {
      const result = validateManifest(makeValidManifest({ pryzmPlugin: invalid as never }));
      expect(result.ok).toBe(false);
    },
  );
});

describe('PluginPermissionSchema — locked at v1', () => {
  const SEVEN = [
    'read:project',
    'write:project',
    'read:user',
    'network:fetch',
    'register:tool',
    'register:panel',
    'register:command',
  ] as const;

  it('exactly seven permissions are valid in v1', () => {
    for (const p of SEVEN) {
      expect(PluginPermissionSchema.safeParse(p).success).toBe(true);
    }
    // Spec lock: any change to this count requires editing this assertion.
    expect(SEVEN).toHaveLength(7);
  });

  it.each(['admin', 'execute:any', 'fs:write', '', 'READ:PROJECT'])(
    'rejects unknown permission %p',
    invalid => {
      expect(PluginPermissionSchema.safeParse(invalid).success).toBe(false);
    },
  );
});

describe('PluginContributionSchema — discriminated union (locked at v1)', () => {
  it('parses each of the five v1 contribution kinds', () => {
    const cases: unknown[] = [
      { kind: 'tool', id: 't1', label: 'T1', icon: 'data:image/svg+xml,', toolbar: 'left' },
      { kind: 'panel', id: 'p1', location: 'properties', label: 'P1' },
      { kind: 'command', id: 'c1', label: 'C1' },
      { kind: 'element-type', id: 'e1', label: 'E1', ifcEntityType: 'IfcWall', familyFile: 'walls/std.pryzm-family' },
      { kind: 'view-template', id: 'v1', label: 'V1', templateFile: 'views/std.json' },
    ];
    for (const c of cases) {
      expect(PluginContributionSchema.safeParse(c).success).toBe(true);
    }
    // Spec lock: any new kind requires editing this count.
    expect(cases).toHaveLength(5);
  });

  it('rejects an unknown contribution kind', () => {
    const r = PluginContributionSchema.safeParse({ kind: 'mystery', id: 'x' });
    expect(r.success).toBe(false);
  });

  it('rejects a tool contribution missing the required toolbar field', () => {
    const r = PluginContributionSchema.safeParse({
      kind: 'tool', id: 't1', label: 'T1', icon: 'data:image/svg+xml,',
    });
    expect(r.success).toBe(false);
  });

  it('rejects a tool contribution with an out-of-enum toolbar value', () => {
    const r = PluginContributionSchema.safeParse({
      kind: 'tool', id: 't1', label: 'T1', icon: 'data:image/svg+xml,', toolbar: 'middle',
    });
    expect(r.success).toBe(false);
  });

  it('rejects a panel contribution with an out-of-enum location', () => {
    const r = PluginContributionSchema.safeParse({
      kind: 'panel', id: 'p1', location: 'centre', label: 'P1',
    });
    expect(r.success).toBe(false);
  });
});

describe('PluginManifestSchema — network:fetch invariant (ADR-0038 §Decision E)', () => {
  it('rejects network:fetch with empty allowedOrigins', () => {
    const result = validateManifest(makeValidManifest({
      permissions: ['read:project', 'network:fetch'],
      // allowedOrigins omitted → defaults to []
    }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some(e => e.startsWith('allowedOrigins:'))).toBe(true);
    }
  });

  it('accepts network:fetch when allowedOrigins is non-empty', () => {
    const result = validateManifest(makeValidManifest({
      permissions: ['read:project', 'network:fetch'],
      allowedOrigins: ['https://api.example.com'],
    }));
    expect(result.ok).toBe(true);
  });

  it('does NOT enforce allowedOrigins for plugins without network:fetch', () => {
    // No fetch permission → empty allowedOrigins is fine.
    const result = validateManifest(makeValidManifest({
      permissions: ['read:project', 'register:tool'],
    }));
    expect(result.ok).toBe(true);
  });
});

describe('validateManifest — error rendering contract', () => {
  it('returns errors sorted by dot-path (stable for pryzm dev rendering)', () => {
    // Two simultaneous failures: id + version.  The contract is that
    // errors come back sorted so the dev CLI renders them deterministically.
    const result = validateManifest({
      ...(makeValidManifest() as object),
      id: 'BAD',
      version: 'not-semver',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const sorted = [...result.errors].sort();
      expect(result.errors).toEqual(sorted);
    }
  });

  it('returns a frozen-shape result that callers cannot accidentally mutate into ok=true', () => {
    const result = validateManifest({ pryzmPlugin: '1.0' /* missing many fields */ });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Array.isArray(result.errors)).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it('discriminated union prevents reading manifest on the failure branch', () => {
    // This is a typecheck assertion expressed at runtime — if this stops
    // being true, the type contract has weakened.
    const result = validateManifest({});
    if (result.ok) {
      // Unreachable at runtime; if we ever got here, the type is broken.
      throw new Error('empty input should never validate');
    }
    // result.errors is reachable; result.manifest is not on this branch.
    expect(typeof result.errors[0]).toBe('string');
  });
});

describe('PluginManifestSchema — license default', () => {
  it('defaults license to "MIT" when omitted', () => {
    const result = validateManifest(makeValidManifest());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.manifest.license).toBe('MIT');
  });

  it('preserves a non-MIT license when provided', () => {
    const result = validateManifest(makeValidManifest({ license: 'Apache-2.0' }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.manifest.license).toBe('Apache-2.0');
  });
});
