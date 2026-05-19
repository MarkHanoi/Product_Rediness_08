import { describe, it, expect, vi } from 'vitest';
import {
  bootstrapPersistence,
  bootstrapPersistenceIdle,
  type EnginePersistenceBootstrapFn,
  type PersistenceBootstrapAudit,
} from '../src/bootstrap.js';

const AUDIT: PersistenceBootstrapAudit = {
  actorId: 'actor-1',
  projectId: 'project-1',
  clientId: 'client-1',
};

const FAKE_ENGINE_PARAMS = { stores: { wallStore: {} } };

describe('PersistenceBootstrap', () => {
  describe('bootstrapPersistenceIdle', () => {
    it('returns a null-shell slot synchronously', () => {
      const result = bootstrapPersistenceIdle();
      expect(result.persistence.platformShell).toBeNull();
      expect(result.persistence.persistenceError).toBeNull();
    });

    it('exposes a callable no-op tearDown', () => {
      const result = bootstrapPersistenceIdle();
      expect(() => result.tearDown()).not.toThrow();
    });
  });

  describe('bootstrapPersistence — happy path', () => {
    it('delegates to the loaded bootstrap and returns a populated slot', async () => {
      const fakeShell = { id: 'platform-shell' };
      const fakeFn: EnginePersistenceBootstrapFn = vi.fn(() => ({
        platformShell: fakeShell,
      }));
      const loadEnginePersistence = vi.fn(async () => fakeFn);

      const result = await bootstrapPersistence({
        audit: AUDIT,
        loadEnginePersistence,
        engineParams: FAKE_ENGINE_PARAMS,
      });

      expect(loadEnginePersistence).toHaveBeenCalledTimes(1);
      expect(fakeFn).toHaveBeenCalledWith(FAKE_ENGINE_PARAMS);
      expect(result.persistence.platformShell).toBe(fakeShell);
      expect(result.persistence.persistenceError).toBeNull();
    });

    it('uses the engine-layer tearDown when one is supplied', async () => {
      const fakeTearDown = vi.fn();
      const fakeFn: EnginePersistenceBootstrapFn = () => ({
        platformShell: { id: 'shell' },
        tearDown: fakeTearDown,
      });
      const result = await bootstrapPersistence({
        audit: AUDIT,
        loadEnginePersistence: async () => fakeFn,
        engineParams: FAKE_ENGINE_PARAMS,
      });

      result.tearDown();
      expect(fakeTearDown).toHaveBeenCalledTimes(1);
    });

    it('falls back to a no-op tearDown when the engine-layer omits one', async () => {
      const fakeFn: EnginePersistenceBootstrapFn = () => ({
        platformShell: { id: 'shell' },
      });
      const result = await bootstrapPersistence({
        audit: AUDIT,
        loadEnginePersistence: async () => fakeFn,
        engineParams: FAKE_ENGINE_PARAMS,
      });

      expect(() => result.tearDown()).not.toThrow();
    });
  });

  describe('bootstrapPersistence — soft-fail path', () => {
    it('captures a throw from the loader and returns a null-shell slot', async () => {
      const loadError = new Error('module load blew up');
      const result = await bootstrapPersistence({
        audit: AUDIT,
        loadEnginePersistence: async () => {
          throw loadError;
        },
        engineParams: FAKE_ENGINE_PARAMS,
      });

      expect(result.persistence.platformShell).toBeNull();
      expect(result.persistence.persistenceError).toBe(loadError);
    });

    it('captures a throw from the engine-layer fn and returns a null-shell slot', async () => {
      const innerError = new Error('engine init blew up');
      const fakeFn: EnginePersistenceBootstrapFn = () => {
        throw innerError;
      };
      const result = await bootstrapPersistence({
        audit: AUDIT,
        loadEnginePersistence: async () => fakeFn,
        engineParams: FAKE_ENGINE_PARAMS,
      });

      expect(result.persistence.platformShell).toBeNull();
      expect(result.persistence.persistenceError).toBe(innerError);
    });

    it('soft-fail tearDown is a no-op', async () => {
      const result = await bootstrapPersistence({
        audit: AUDIT,
        loadEnginePersistence: async () => {
          throw new Error('boom');
        },
        engineParams: FAKE_ENGINE_PARAMS,
      });

      expect(() => result.tearDown()).not.toThrow();
    });

    it('coerces non-Error throws into Error instances', async () => {
      const result = await bootstrapPersistence({
        audit: AUDIT,
        loadEnginePersistence: async () => {
          // eslint-disable-next-line @typescript-eslint/no-throw-literal
          throw 'string-thrown' as unknown as Error;
        },
        engineParams: FAKE_ENGINE_PARAMS,
      });

      expect(result.persistence.persistenceError).toBeInstanceOf(Error);
      expect(result.persistence.persistenceError?.message).toBe('string-thrown');
    });
  });

  describe('bootstrapPersistence — multi-bootstrap independence', () => {
    it('two parallel bootstraps do not share state', async () => {
      const shellA = { id: 'shell-A' };
      const shellB = { id: 'shell-B' };
      const fnA: EnginePersistenceBootstrapFn = () => ({ platformShell: shellA });
      const fnB: EnginePersistenceBootstrapFn = () => ({ platformShell: shellB });

      const [resultA, resultB] = await Promise.all([
        bootstrapPersistence({
          audit: AUDIT,
          loadEnginePersistence: async () => fnA,
          engineParams: { variant: 'A' },
        }),
        bootstrapPersistence({
          audit: { ...AUDIT, projectId: 'project-2' },
          loadEnginePersistence: async () => fnB,
          engineParams: { variant: 'B' },
        }),
      ]);

      expect(resultA.persistence.platformShell).toBe(shellA);
      expect(resultB.persistence.platformShell).toBe(shellB);
    });
  });
});
