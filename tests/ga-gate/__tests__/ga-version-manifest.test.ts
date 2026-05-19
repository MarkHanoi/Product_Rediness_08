/**
 * GA-gate · Version manifest agreement (PHASE-3D §3 Functional / §8 item 1).
 *
 * GA tag is `v2.0.0`. The actual `git tag v2.0.0` is operator-side
 * (no signing keys / push creds in dev env per ADR-0054 §F), but the
 * version strings in the repo's manifests must agree on `2.0.0` so
 * the operator-side tag is a no-op confirmation, not a content change.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');

describe('GA-gate · Version manifest agreement on 2.0.0', () => {
  it('root package.json declares version 2.0.0', () => {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf-8'));
    expect(pkg.version).toBe('2.0.0');
  });

  it('pryzm-selfhost/version.json declares pryzm 2.0.0', () => {
    const manifest = JSON.parse(
      readFileSync(join(REPO_ROOT, 'pryzm-selfhost/version.json'), 'utf-8'),
    );
    expect(manifest.pryzm).toBe('2.0.0');
  });

  it('self-host service map names sync-server + bake-worker + api-gateway + editor at 2.0.0', () => {
    const manifest = JSON.parse(
      readFileSync(join(REPO_ROOT, 'pryzm-selfhost/version.json'), 'utf-8'),
    );
    const services = manifest.services as Record<string, string>;
    expect(services).toBeDefined();
    for (const svc of ['sync-server', 'bake-worker', 'api-gateway', 'editor']) {
      expect(services[svc], `${svc} must be present in services map`).toMatch(/2\.0\.0/);
    }
  });

  it('@pryzm/test-ga-gate package.json declares version 2.0.0', () => {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'tests/ga-gate/package.json'), 'utf-8'));
    expect(pkg.version).toBe('2.0.0');
  });
});
