import { describe, it, expect } from 'vitest';

describe('DISCOVERY — what stores does the headless composition root actually expose?', () => {
  it('enumerates bus stores, runtime.stores, and geometry globals', async () => {
    const { composeRuntime } = await import('@pryzm/runtime-composer');
    const { bootstrapWithEverything } = await import('@pryzm/editor/bootstrap.everything');
    const rt: any = await composeRuntime({
      audit: { actorId: 'rac-harness', projectId: 'rac-probe', clientId: 'node' },
      canvas: null,
      bootstrapFn: bootstrapWithEverything as never,
    });

    console.log('--- runtime.stores keys:', Object.keys(rt.stores ?? {}).join(','));
    const provided = rt.bus?.storesProvider?.() ?? null;
    console.log('--- bus storesProvider keys:', provided ? Object.keys(provided).join(',') : 'N/A');
    const GLOBALS = ['wallStore','slabStore','roofStore','stairStore','columnStore','curtainWallStore',
      'gridStore','beamStore','handrailStore','openingStore','roomStore','ceilingStore','floorStore',
      'furnitureStore','plumbingStore','wallSystemTypeStore','commandManager','projectContext'];
    for (const g of GLOBALS) {
      const v = (globalThis as any)[g];
      console.log(`--- global ${g}:`, v ? v.constructor?.name ?? typeof v : 'ABSENT');
    }
    const { doorStore } = await import('@pryzm/geometry-door');
    const { windowStore } = await import('@pryzm/geometry-window');
    console.log('--- module singleton doorStore:', doorStore ? doorStore.constructor.name : 'ABSENT',
      'count=', doorStore?.getAll?.().length);
    console.log('--- module singleton windowStore:', windowStore ? windowStore.constructor.name : 'ABSENT',
      'count=', windowStore?.getAll?.().length);
    console.log('--- bus registry sample:', Array.from(rt.bus.registry.keys()).slice(0, 400).join(' '));
    expect(true).toBe(true);
  });
});
