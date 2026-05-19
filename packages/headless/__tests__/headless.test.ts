/**
 * @pryzm/headless — unit tests (Wave A20-T13)
 *
 * CONTRACT (C07 §1 — boolean #8):
 * These tests verify that the headless package exports are correct and
 * that headlessRuntime / composeHeadlessRuntime can be called without
 * a browser environment.
 *
 * @pryzm/runtime-composer is mocked so no browser globals (WebGL,
 * IndexedDB, canvas) are required in this Node.js test environment.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRuntime = {
  commandBus: {
    dispatch: vi.fn(),
    subscribe: vi.fn(),
    registry: new Map(),
  },
  stores: {
    elements: {
      getAll: vi.fn().mockReturnValue([]),
    },
  },
  ifc: {
    parseBuffer: vi.fn().mockResolvedValue({ elements: [], metadata: {} }),
    importFile: vi.fn().mockResolvedValue({ elementCount: 0 }),
  },
  visibility: {
    evaluate: vi.fn().mockReturnValue(true),
  },
  sync: {
    client: null,
    status: 'disconnected',
  },
  tearDown: vi.fn(),
};

vi.mock('@pryzm/runtime-composer', () => ({
  composeRuntime: vi.fn().mockResolvedValue(mockRuntime),
}));

describe('@pryzm/headless', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('module exports', () => {
    it('exports headlessRuntime', async () => {
      const mod = await import('../src/index.js');
      expect(typeof mod.headlessRuntime).toBe('function');
    });

    it('exports composeHeadlessRuntime alias', async () => {
      const mod = await import('../src/index.js');
      expect(typeof mod.composeHeadlessRuntime).toBe('function');
    });

    it('exports HeadlessRuntime type (runtime shape)', async () => {
      const mod = await import('../src/index.js');
      expect(mod).toBeDefined();
    });
  });

  describe('headlessRuntime()', () => {
    it('calls composeRuntime with canvas: null', async () => {
      const { headlessRuntime } = await import('../src/index.js');
      const { composeRuntime } = await import('@pryzm/runtime-composer');

      await headlessRuntime({
        audit: { actorId: 'headless', projectId: 'ci', clientId: 'node' },
      });

      expect(composeRuntime).toHaveBeenCalledWith(
        expect.objectContaining({ canvas: null })
      );
    });

    it('returns a runtime object', async () => {
      const { headlessRuntime } = await import('../src/index.js');

      const runtime = await headlessRuntime({
        audit: { actorId: 'headless', projectId: 'ci', clientId: 'node' },
      });

      expect(runtime).toBeDefined();
      expect(runtime.commandBus).toBeDefined();
    });

    it('does not require browser globals', async () => {
      expect(typeof window).toBe('undefined');
      expect(typeof document).toBe('undefined');

      const { headlessRuntime } = await import('../src/index.js');
      await expect(
        headlessRuntime({
          audit: { actorId: 'ci-test', projectId: 'test-project', clientId: 'node-test' },
        })
      ).resolves.toBeDefined();
    });
  });

  describe('composeHeadlessRuntime() alias', () => {
    it('accepts empty options with default audit', async () => {
      const { composeHeadlessRuntime } = await import('../src/index.js');
      const runtime = await composeHeadlessRuntime({});
      expect(runtime).toBeDefined();
    });

    it('accepts explicit audit in options', async () => {
      const { composeHeadlessRuntime } = await import('../src/index.js');
      const runtime = await composeHeadlessRuntime({
        audit: { actorId: 'test-actor', projectId: 'test-proj', clientId: 'test-client' },
      });
      expect(runtime).toBeDefined();
      expect(runtime.commandBus).toBeDefined();
    });

    it('surfaces stores slot', async () => {
      const { composeHeadlessRuntime } = await import('../src/index.js');
      const runtime = await composeHeadlessRuntime({});
      expect(runtime.stores).toBeDefined();
    });

    it('surfaces ifc slot for server-side IFC parse', async () => {
      const { composeHeadlessRuntime } = await import('../src/index.js');
      const runtime = await composeHeadlessRuntime({});
      expect(runtime.ifc).toBeDefined();
      await expect(runtime.ifc.parseBuffer(new Uint8Array(0))).resolves.toBeDefined();
    });
  });
});
