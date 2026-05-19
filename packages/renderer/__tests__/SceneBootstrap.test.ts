import { describe, it, expect, vi } from 'vitest';
import {
  bootstrapScene,
  bootstrapSceneIdle,
  type RenderEverythingBootstrapFn,
  type SceneBootstrapAudit,
} from '../src/SceneBootstrap.js';

const AUDIT: SceneBootstrapAudit = {
  actorId: 'actor-1',
  projectId: 'project-1',
  clientId: 'client-1',
};

const FAKE_CANVAS = {} as HTMLCanvasElement;
const FAKE_HOST = { id: 'committer-host' };

describe('SceneBootstrap', () => {
  describe('bootstrapSceneIdle', () => {
    it('returns a null-renderer slot synchronously', () => {
      const result = bootstrapSceneIdle(FAKE_HOST);
      expect(result.scene.renderer).toBeNull();
      expect(result.scene.scheduler).toBeNull();
      expect(result.scene.materialPool).toBeNull();
      expect(result.scene.rendererError).toBeNull();
      expect(result.scene.host).toBe(FAKE_HOST);
    });

    it('exposes a callable no-op tearDown', () => {
      const result = bootstrapSceneIdle(FAKE_HOST);
      expect(() => result.tearDown()).not.toThrow();
    });
  });

  describe('bootstrapScene — happy path', () => {
    it('delegates to the loaded bootstrap and returns a populated slot', async () => {
      const fakeRenderer = { id: 'renderer' };
      const fakeScheduler = { id: 'scheduler' };
      const fakePool = { id: 'pool' };
      const fakeTearDown = vi.fn();

      const loader: RenderEverythingBootstrapFn = vi.fn(async () => ({
        renderer: fakeRenderer,
        scheduler: fakeScheduler,
        materialPool: fakePool,
        tearDown: fakeTearDown,
      }));

      const result = await bootstrapScene({
        audit: AUDIT,
        canvas: FAKE_CANVAS,
        mode: 'webgl2',
        committerHost: FAKE_HOST,
        loadRenderEverything: async () => loader,
      });

      expect(result.scene.renderer).toBe(fakeRenderer);
      expect(result.scene.scheduler).toBe(fakeScheduler);
      expect(result.scene.materialPool).toBe(fakePool);
      expect(result.scene.host).toBe(FAKE_HOST);
      expect(result.scene.rendererError).toBeNull();
      expect(loader).toHaveBeenCalledTimes(1);
      expect(loader).toHaveBeenCalledWith({
        audit: AUDIT,
        canvas: FAKE_CANVAS,
        mode: 'webgl2',
      });

      result.tearDown();
      expect(fakeTearDown).toHaveBeenCalledTimes(1);
    });

    it('defaults mode to webgl2 when omitted', async () => {
      const loader: RenderEverythingBootstrapFn = vi.fn(async () => ({
        renderer: {},
        scheduler: {},
        materialPool: {},
      }));

      await bootstrapScene({
        audit: AUDIT,
        canvas: FAKE_CANVAS,
        committerHost: FAKE_HOST,
        loadRenderEverything: async () => loader,
      });

      expect(loader).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 'webgl2' }),
      );
    });

    it('substitutes a no-op tearDown when the loader does not return one', async () => {
      const result = await bootstrapScene({
        audit: AUDIT,
        canvas: FAKE_CANVAS,
        committerHost: FAKE_HOST,
        loadRenderEverything: async () => async () => ({
          renderer: {},
          scheduler: {},
          materialPool: {},
        }),
      });

      expect(typeof result.tearDown).toBe('function');
      expect(() => result.tearDown()).not.toThrow();
    });
  });

  describe('bootstrapScene — soft-fail path', () => {
    it('captures a loader error in rendererError and leaves slot fields null', async () => {
      const result = await bootstrapScene({
        audit: AUDIT,
        canvas: FAKE_CANVAS,
        committerHost: FAKE_HOST,
        loadRenderEverything: async () => {
          throw new Error('module load failed');
        },
      });

      expect(result.scene.renderer).toBeNull();
      expect(result.scene.scheduler).toBeNull();
      expect(result.scene.materialPool).toBeNull();
      expect(result.scene.rendererError).toBeInstanceOf(Error);
      expect(result.scene.rendererError?.message).toBe('module load failed');
      expect(result.scene.host).toBe(FAKE_HOST);
    });

    it('captures a bootstrap error in rendererError and leaves slot fields null', async () => {
      const failingBootstrap: RenderEverythingBootstrapFn = async () => {
        throw new Error('renderer init failed');
      };

      const result = await bootstrapScene({
        audit: AUDIT,
        canvas: FAKE_CANVAS,
        committerHost: FAKE_HOST,
        loadRenderEverything: async () => failingBootstrap,
      });

      expect(result.scene.renderer).toBeNull();
      expect(result.scene.rendererError?.message).toBe('renderer init failed');
    });

    it('coerces non-Error throws into Error instances', async () => {
      const result = await bootstrapScene({
        audit: AUDIT,
        canvas: FAKE_CANVAS,
        committerHost: FAKE_HOST,
        loadRenderEverything: async () => {
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw 'string-throw';
        },
      });

      expect(result.scene.rendererError).toBeInstanceOf(Error);
      expect(result.scene.rendererError?.message).toBe('string-throw');
    });

    it('exposes a callable no-op tearDown after soft-fail', async () => {
      const result = await bootstrapScene({
        audit: AUDIT,
        canvas: FAKE_CANVAS,
        committerHost: FAKE_HOST,
        loadRenderEverything: async () => {
          throw new Error('boom');
        },
      });

      expect(() => result.tearDown()).not.toThrow();
    });
  });
});
