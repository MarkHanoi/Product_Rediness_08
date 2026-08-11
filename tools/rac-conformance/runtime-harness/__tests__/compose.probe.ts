import { describe, it, expect } from 'vitest';

describe('COMPOSE — the REAL composition root, headless, zero stubs on the measured path', () => {
  it('composeRuntime(bootstrapWithEverything, canvas:null) returns a wired runtime', async () => {
    const { composeRuntime } = await import('@pryzm/runtime-composer');
    const { bootstrapWithEverything } = await import('@pryzm/editor/bootstrap.everything');
    const runtime = await composeRuntime({
      audit: { actorId: 'rac-harness', projectId: 'rac-probe', clientId: 'node' },
      canvas: null,
      bootstrapFn: bootstrapWithEverything as never,
    });
    // eslint-disable-next-line no-console
    console.log('SLOTS:', Object.keys(runtime).sort().join(','));
    console.log('renderer:', (runtime as any).scene?.renderer);
    const bus = (runtime as any).commandBus ?? (runtime as any).bus;
    console.log('bus present:', !!bus, 'registry size:', bus?.registry?.size ?? bus?.registry?.length);
    expect(runtime).toBeTruthy();
  });
});
