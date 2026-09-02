// lane 4E harness — §COMPONENT-RENDER (audit §12 Phase 4E) · ADR-0376 D10.
//
// ⛔ NOT PRODUCTION CODE AND NOT A TEST. This is the instrument: a real browser,
// a real WebGL context, the REAL composed runtime, and no mocks of any kind.
// It exists because the lane's acceptance is "a rendered instance, not a passing
// test", and a happy-dom probe cannot tell rendered from not-rendered.
//
// It reports facts into `window.__LANE4E` for Playwright to read. It asserts
// nothing itself — the assertions live in the spec that drives it.

/* eslint-disable @typescript-eslint/no-explicit-any */

const out: Record<string, unknown> = { stage: 'start' };
(window as any).__LANE4E = out;

function note(k: string, v: unknown): void { out[k] = v; }

async function run(): Promise<void> {
  try {
    const { composeRuntime } = await import('@pryzm/runtime-composer');
    const { bootstrapWithEverything } = await import('@pryzm/editor/bootstrap.everything');
    note('stage', 'imported');

    const rt: any = await composeRuntime({
      audit: { actorId: 'lane4e', projectId: 'lane4e', clientId: 'browser' },
      canvas: null,
      bootstrapFn: bootstrapWithEverything as never,
    });
    (window as any).__RT = rt;
    note('stage', 'composed');
    note('marksAfterCompose', performance.getEntriesByName('pryzm:bootstrap:stores:start').length);
    note('storeKeys', Object.keys(rt.stores ?? {}).length);
    note('hasComponentStore', Boolean((rt.stores as any)?.component));
    note('rendererBeforeMount', rt.scene.renderer === null ? 'null' : 'present');

    const canvas = document.getElementById('lane4e') as HTMLCanvasElement;
    const t0 = performance.now();
    let mountErr: string | null = null;
    try {
      await rt.scene.mount(canvas, 'webgl2');
    } catch (e) {
      mountErr = e instanceof Error ? e.message : String(e);
    }
    note('mountMs', Math.round(performance.now() - t0));
    note('mountError', mountErr);
    note('stage', 'mounted');
    note('marksAfterMount', performance.getEntriesByName('pryzm:bootstrap:stores:start').length);
    note('rendererAfterMount', rt.scene.renderer === null ? 'null' : 'present');
    note('rendererErrorAfterMount', rt.scene.rendererError === null ? 'null' : String(rt.scene.rendererError?.message));
    note('rendererMode', (rt.scene.renderer as any)?.mode ?? null);
    note('schedulerAfterMount', rt.scene.scheduler === null ? 'null' : 'present');
    note('hostCommitterWall', rt.scene.host?.get?.('wall') === undefined ? 'ABSENT' : 'PRESENT');
    note('hostCommitterComponent', rt.scene.host?.get?.('component') === undefined ? 'ABSENT' : 'PRESENT');
    note('hostRegistrySize', rt.scene.host?.registry?.size ?? null);
    note('rendererSceneChildren', (rt.scene.renderer as any)?.scene?.children?.length ?? null);

    // Does the canvas have a live WebGL context after mount?
    const gl = (canvas as any).getContext('webgl2') ?? (canvas as any).getContext('webgl');
    note('canvasContext', gl === null ? 'NONE' : (gl.constructor?.name ?? 'unknown'));
    note('stage', 'done');
  } catch (e) {
    note('stage', 'threw');
    note('fatal', e instanceof Error ? `${e.name}: ${e.message}` : String(e));
    note('stack', e instanceof Error ? String(e.stack).slice(0, 2000) : null);
  }
}

void run();
