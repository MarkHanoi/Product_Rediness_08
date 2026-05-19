import { describe, it, expect, vi } from 'vitest';
import {
  bootstrapPhysics,
  bootstrapPhysicsIdle,
  type EnginePhysicsBootstrapFn,
  type PhysicsBootstrapAudit,
} from '../src/bootstrap.js';
import { NullPhysicsHost } from '../src/index.js';

const AUDIT: PhysicsBootstrapAudit = {
  actorId: 'actor-1',
  projectId: 'project-1',
  clientId: 'client-1',
};

const FAKE_ENGINE_PARAMS = { stores: { roomStore: {} } };

describe('PhysicsBootstrap', () => {
  describe('bootstrapPhysicsIdle', () => {
    it('returns a NullPhysicsHost synchronously', () => {
      const result = bootstrapPhysicsIdle();
      expect(result.physicsHost).toBeInstanceOf(NullPhysicsHost);
    });

    it('physicsError is null on the idle path', () => {
      const result = bootstrapPhysicsIdle();
      expect(result.physicsError).toBeNull();
    });

    it('exposes a callable no-op tearDown', () => {
      const result = bootstrapPhysicsIdle();
      expect(() => result.tearDown()).not.toThrow();
    });

    it('each call returns an independent NullPhysicsHost', () => {
      const a = bootstrapPhysicsIdle();
      const b = bootstrapPhysicsIdle();
      expect(a.physicsHost).not.toBe(b.physicsHost);
    });
  });

  describe('bootstrapPhysics — happy path', () => {
    it('delegates to the loaded bootstrap and returns the engine host', async () => {
      const fakeHost = new NullPhysicsHost();
      const fakeFn: EnginePhysicsBootstrapFn = vi.fn(() => ({
        physicsHost: fakeHost,
      }));
      const loadEnginePhysics = vi.fn(async () => fakeFn);

      const result = await bootstrapPhysics({
        audit: AUDIT,
        loadEnginePhysics,
        engineParams: FAKE_ENGINE_PARAMS,
      });

      expect(loadEnginePhysics).toHaveBeenCalledTimes(1);
      expect(fakeFn).toHaveBeenCalledWith(FAKE_ENGINE_PARAMS);
      expect(result.physicsHost).toBe(fakeHost);
      expect(result.physicsError).toBeNull();
    });

    it('uses the engine-layer tearDown when one is supplied', async () => {
      const fakeTearDown = vi.fn();
      const fakeFn: EnginePhysicsBootstrapFn = () => ({
        physicsHost: new NullPhysicsHost(),
        tearDown: fakeTearDown,
      });
      const result = await bootstrapPhysics({
        audit: AUDIT,
        loadEnginePhysics: async () => fakeFn,
        engineParams: FAKE_ENGINE_PARAMS,
      });

      result.tearDown();
      expect(fakeTearDown).toHaveBeenCalledTimes(1);
    });

    it('falls back to a no-op tearDown when the engine-layer omits one', async () => {
      const fakeFn: EnginePhysicsBootstrapFn = () => ({
        physicsHost: new NullPhysicsHost(),
      });
      const result = await bootstrapPhysics({
        audit: AUDIT,
        loadEnginePhysics: async () => fakeFn,
        engineParams: FAKE_ENGINE_PARAMS,
      });

      expect(() => result.tearDown()).not.toThrow();
    });
  });

  describe('bootstrapPhysics — soft-fail path', () => {
    it('returns a NullPhysicsHost and captures the error when the loader throws', async () => {
      const boom = new Error('physics wasm unavailable');
      const result = await bootstrapPhysics({
        audit: AUDIT,
        loadEnginePhysics: async () => { throw boom; },
        engineParams: FAKE_ENGINE_PARAMS,
      });

      expect(result.physicsHost).toBeInstanceOf(NullPhysicsHost);
      expect(result.physicsError).toBe(boom);
    });

    it('captures the error when the inner fn throws', async () => {
      const boom = new Error('init failed');
      const fakeFn: EnginePhysicsBootstrapFn = () => { throw boom; };
      const result = await bootstrapPhysics({
        audit: AUDIT,
        loadEnginePhysics: async () => fakeFn,
        engineParams: FAKE_ENGINE_PARAMS,
      });

      expect(result.physicsError).toBe(boom);
      expect(result.physicsHost).toBeInstanceOf(NullPhysicsHost);
    });

    it('soft-fail tearDown is a no-op', async () => {
      const result = await bootstrapPhysics({
        audit: AUDIT,
        loadEnginePhysics: async () => { throw new Error('fail'); },
        engineParams: FAKE_ENGINE_PARAMS,
      });

      expect(() => result.tearDown()).not.toThrow();
    });

    it('coerces non-Error throws to an Error', async () => {
      const result = await bootstrapPhysics({
        audit: AUDIT,
        loadEnginePhysics: async () => { throw 'string error'; },
        engineParams: FAKE_ENGINE_PARAMS,
      });

      expect(result.physicsError).toBeInstanceOf(Error);
      expect(result.physicsError?.message).toContain('string error');
    });
  });

  describe('multi-bootstrap independence', () => {
    it('two concurrent bootstraps return independent results', async () => {
      const hostA = new NullPhysicsHost();
      const hostB = new NullPhysicsHost();

      const [resultA, resultB] = await Promise.all([
        bootstrapPhysics({
          audit: AUDIT,
          loadEnginePhysics: async () => () => ({ physicsHost: hostA }),
          engineParams: {},
        }),
        bootstrapPhysics({
          audit: AUDIT,
          loadEnginePhysics: async () => () => ({ physicsHost: hostB }),
          engineParams: {},
        }),
      ]);

      expect(resultA.physicsHost).toBe(hostA);
      expect(resultB.physicsHost).toBe(hostB);
      expect(resultA.physicsHost).not.toBe(resultB.physicsHost);
    });
  });
});
