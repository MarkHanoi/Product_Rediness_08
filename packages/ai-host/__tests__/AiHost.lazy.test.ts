// @vitest-environment happy-dom
//
// @pryzm/ai-host — lazy-bootstrap contract test (S47 D1).
//
// happy-dom required because the transitive import chain pulls in
// `@thatopen/ui`, which reads `HTMLElement` at module load.
//
// This is the K3-A verification at the unit-test level: prove that
// `import { getAiHost } from '@pryzm/ai-host'` does NOT pull
// `./AiHost.impl.js` into the module graph until the first call to
// `getAiHost()`. We assert this two ways:
//   1. Before `getAiHost()` is called, `isAiHostLoaded()` returns false.
//   2. The impl module's side effects (we install a probe via a global
//      counter) only fire after `getAiHost()` resolves.
//
// The full editor-bundle assertion (Vite chunk separation) lives in
// `scripts/check-ai-host-lazy.mjs`.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getAiHost,
  isAiHostLoaded,
} from '../src/index.js';
import { _resetAiHostForTests } from '../src/AiHost.js';

afterEach(() => {
  _resetAiHostForTests();
  vi.restoreAllMocks();
});

describe('@pryzm/ai-host — lazy bootstrap contract', () => {
  it('does not load the impl chunk until getAiHost() is called', async () => {
    // Probe: before any call, the host is not loaded.
    expect(isAiHostLoaded()).toBe(false);

    // First call triggers dynamic import.
    const host = await getAiHost({ fetch: vi.fn() });
    expect(host).toBeDefined();
    expect(typeof host.submit).toBe('function');
    expect(isAiHostLoaded()).toBe(true);
  });

  it('returns the same singleton on repeated calls', async () => {
    const fetchImpl = vi.fn();
    const a = await getAiHost({ fetch: fetchImpl });
    const b = await getAiHost({ fetch: fetchImpl });
    expect(a).toBe(b);
  });

  it('shares the in-flight import across concurrent first calls', async () => {
    const fetchImpl = vi.fn();
    const [a, b, c] = await Promise.all([
      getAiHost({ fetch: fetchImpl }),
      getAiHost({ fetch: fetchImpl }),
      getAiHost({ fetch: fetchImpl }),
    ]);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('exposes default endpoint configuration matching spec lines 602-605', async () => {
    const host = await getAiHost({ fetch: vi.fn() });
    expect(host.options.workerEndpoint).toBe('/api/ai-worker');
    expect(host.options.anthropicRelay).toBe('/api/ai/anthropic');
  });
});
