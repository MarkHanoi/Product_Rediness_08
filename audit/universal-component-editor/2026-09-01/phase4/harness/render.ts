// lane 4E RENDER harness — §COMPONENT-RENDER (audit §12 Phase 4E) · ADR-0376 D10.
//
// ⛔ THIS IS THE INSTRUMENT, NOT THE PRODUCT. It is not shipped, not imported by
//    anything, and not a test. It exists because the lane's acceptance is
//    "a rendered instance, not a passing test", and the only way to tell rendered
//    from not-rendered is a real GPU context and the bytes that came out of it.
//
// WHAT IS REAL HERE, AND THE LIST IS THE POINT:
//   • the runtime — `composeRuntime({ bootstrapFn: bootstrapWithEverything })`,
//     the P1 composition root, canvas: null, exactly as `src/main.ts` boots it;
//   • the mount — `runtime.scene.mount(canvas)`, the typed entry point, called
//     from production code for the FIRST time;
//   • the store — `runtime.stores.component`, read OFF the runtime, never built;
//   • the verb — `runtime.bus.executeCommand('component.place', …)`, lane 4C's
//     real Path-B handler through the real bus;
//   • the geometry — lane 4D's real `bakeFamilyInstance` over the real
//     `kernelGeometryAdapter` and the real `produceExtrude`;
//   • the committer — `ComponentCommitter` from `@pryzm/plugin-component/committer`;
//   • the fan-out — the real `bindStore` dispatcher and the real `CommitterHost`.
//
// WHAT IS FIXTURE, NAMED SO IT IS NOT MISTAKEN FOR CAPABILITY:
//   • the family DOCUMENT is authored inline (there is no project-level
//     component-definition registry at this commit — audit §12 Phase 4C);
//   • the CAMERA is aimed by hand (no view/camera plugin is mounted here);
//   • a light is added IF the renderer supplied none, and whether it did is
//     reported rather than assumed.

/* eslint-disable @typescript-eslint/no-explicit-any */

const out: Record<string, unknown> = { stage: 'start' };
(window as any).__LANE4E = out;
const note = (k: string, v: unknown): void => { out[k] = v; };

/* ── ids: real prefixed ULIDs, because the handlers enforce them ──────────── */
const ULID_STEM = '01ARZ3NDEKTSV4RRFFQ69G5F';
const A32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ulidN = (n: number): string =>
  ULID_STEM + A32[Math.floor(n / 32) % 32] + A32[n % 32];

const COMPONENT_ID = `component_${ulidN(0)}`;
const DEF_ID = `fam_${ulidN(1)}`;
const TYPE_A = `typ_${ulidN(2)}`;
const TYPE_B = `typ_${ulidN(3)}`;
const P_WIDTH = `par_${ulidN(4)}`;
const P_HEIGHT = `par_${ulidN(5)}`;
const P_DEPTH = `par_${ulidN(6)}`;
const PLANE = 'plane_01HZ00000000000000000PNE01';
const PROFILE = 'prof_01HZ00000000000000000RCT01';
const SOLID = 'sol_01HZ000000000000000000SL01';
const NOW = '2026-09-02T00:00:00.000Z';

/** The founder's §64 window as a DOCUMENT: 1200 × 1500, 100 deep, in the
 *  family-runtime canonical unit (mm). TYPE_B halves the width, so a type swap
 *  is visible as geometry rather than as a field. */
function makeFamily() {
  const document = {
    formatVersion: '1.1',
    referencePlanes: [
      { id: PLANE, name: 'Host', origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, isHost: true },
    ],
    parameters: [
      { id: P_WIDTH, name: 'Width', kind: 'type', dataType: 'length', defaultValue: 1200, expression: null, ifcMapping: null, exposed: true },
      { id: P_HEIGHT, name: 'Height', kind: 'type', dataType: 'length', defaultValue: 1500, expression: null, ifcMapping: null, exposed: true },
      { id: P_DEPTH, name: 'Depth', kind: 'type', dataType: 'length', defaultValue: 100, expression: null, ifcMapping: null, exposed: true },
    ],
    profiles: [
      {
        id: PROFILE, name: 'Rect', planeId: PLANE,
        entities: [
          { id: '01HZE0000000000000000RC001', kind: 'point', data: { x: '0', z: '0' } },
          { id: '01HZE0000000000000000RC002', kind: 'point', data: { x: 'Width', z: '0' } },
          { id: '01HZE0000000000000000RC003', kind: 'point', data: { x: 'Width', z: 'Height' } },
          { id: '01HZE0000000000000000RC004', kind: 'point', data: { x: '0', z: 'Height' } },
        ],
        constraints: [],
      },
    ],
    solids: [
      {
        id: SOLID, kind: 'extrude', profileId: PROFILE, materialSlotId: null,
        lod: { coarse: false, medium: true, fine: true },
        lengthExpression: 'Depth',
        direction: { x: 0, y: 1, z: 0 },
      },
    ],
    materialSlots: [],
    types: [
      { id: TYPE_A, name: 'W1200', values: {}, checksum: 'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a' },
      { id: TYPE_B, name: 'W600', values: { [P_WIDTH]: 600 }, checksum: 'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a' },
    ],
    representations: [],
    connectors: [],
    propertySets: [],
    featureEdges: [],
  };
  const manifest = {
    formatVersion: '1.1', id: DEF_ID, name: 'Lane4E Window', semver: '1.0.0',
    author: { id: 'usr_01HZ00000000000000000ASR01', displayName: 'lane4e' },
    description: '', ifcEntity: 'IfcWindow', category: 'Window', tags: [],
    minPRYZMVersion: '2.0.0',
    schemaHash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    createdAt: NOW, lastModifiedAt: NOW,
  };
  return { manifest, document, schemaHash: manifest.schemaHash } as any;
}

const nextFrame = (): Promise<void> =>
  new Promise((r) => requestAnimationFrame(() => r()));

/** Read the drawing buffer of the LIVE context and census it against the clear
 *  colour. Called immediately after an explicit `renderer.render()`, in the same
 *  task, so no `preserveDrawingBuffer` is needed. */
function pixelCensus(canvas: HTMLCanvasElement): Record<string, number> {
  const gl = canvas.getContext('webgl2') as WebGL2RenderingContext | null;
  if (gl === null) return { error: -1 };
  const w = gl.drawingBufferWidth;
  const h = gl.drawingBufferHeight;
  const buf = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  // Renderer's default clear colour is 0x202024 (Renderer.ts).
  const CR = 0x20, CG = 0x20, CB = 0x24, TOL = 6;
  let lit = 0, minX = w, maxX = -1, minY = h, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (
        Math.abs(buf[i]! - CR) <= TOL &&
        Math.abs(buf[i + 1]! - CG) <= TOL &&
        Math.abs(buf[i + 2]! - CB) <= TOL
      ) continue;
      lit++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return {
    width: w, height: h, litPixels: lit,
    minX: lit ? minX : -1, maxX: lit ? maxX : -1,
    minY: lit ? minY : -1, maxY: lit ? maxY : -1,
    litWidth: lit ? maxX - minX + 1 : 0,
    litHeight: lit ? maxY - minY + 1 : 0,
  };
}

async function run(): Promise<void> {
  try {
    const { composeRuntime } = await import('@pryzm/runtime-composer');
    const { bootstrapWithEverything } = await import('@pryzm/editor/bootstrap.everything');
    const { ComponentCommitter } = await import('@pryzm/plugin-component/committer');
    const { bindStore, MaterialPool } = await import('@pryzm/scene-committer');
    const { bakeFamilyInstance } = await import('@pryzm/family-instance');
    const THREE = await import('three');
    note('stage', 'imported');

    const rt: any = await composeRuntime({
      audit: { actorId: 'lane4e', projectId: 'lane4e', clientId: 'browser' },
      canvas: null,
      bootstrapFn: bootstrapWithEverything as never,
    });
    (window as any).__RT = rt;
    note('marksAfterCompose', performance.getEntriesByName('pryzm:bootstrap:stores:start').length);

    const canvas = document.getElementById('lane4e') as HTMLCanvasElement;
    await rt.scene.mount(canvas, 'webgl2');
    note('marksAfterMount', performance.getEntriesByName('pryzm:bootstrap:stores:start').length);
    note('rendererAfterMount', rt.scene.renderer === null ? 'null' : 'present');
    note('rendererErrorAfterMount', rt.scene.rendererError === null ? 'null' : String(rt.scene.rendererError?.message));
    note('hostCommitterWallAfterMount', rt.scene.host?.get?.('wall') === undefined ? 'ABSENT' : 'PRESENT');
    if (rt.scene.renderer === null) {
      note('stage', 'done'); note('verdict', 'NO RENDERER — cannot proceed');
      return;
    }

    const renderer = rt.scene.renderer;
    const scheduler = rt.scene.scheduler;

    /* ── scene fixture: what did the renderer give us? ───────────────────── */
    const initialChildren = renderer.scene.children.map((c: any) => c.type);
    note('rendererSceneChildTypes', initialChildren);
    const hasLight = renderer.scene.children.some((c: any) => c.isLight === true);
    note('rendererSuppliedLight', hasLight);
    if (!hasLight) {
      renderer.scene.add(new THREE.AmbientLight(0xffffff, 1.4));
      const dir = new THREE.DirectionalLight(0xffffff, 2.2);
      dir.position.set(3, 6, 4);
      renderer.scene.add(dir);
      note('harnessAddedLight', true);
    }

    /* ── the committer, on the runtime's OWN host ────────────────────────── */
    const family = makeFamily();
    const materialPool = rt.scene.materialPool ?? new MaterialPool();
    let readyEvents = 0;
    let lastSolidCount = -1;
    const committer = new ComponentCommitter({
      materialPool,
      definitions: { has: (id: string) => id === DEF_ID },
      bake: async ({ definitionId, typeId, instanceOverrides }: any) => {
        if (definitionId !== DEF_ID) throw new Error(`unknown definition ${definitionId}`);
        return bakeFamilyInstance({ family, typeId, instanceOverrides }) as any;
      },
      onGeometryReady: (_id: string, solidCount: number) => {
        readyEvents++; lastSolidCount = solidCount;
        scheduler?.markDirty?.('camera');
      },
    });
    rt.scene.host.register(committer);
    note('committerRegistered', rt.scene.host.get('component') !== undefined);

    const store = rt.stores.component;
    note('storeIsOnRuntime', store !== undefined);
    const binding = bindStore(store, 'component', rt.scene.host);

    /* ── camera: aim at the 1.2 × 0.1 × 1.5 m box at the origin ──────────── */
    renderer.camera.position.set(2.6, 2.2, 3.4);
    renderer.camera.lookAt(new THREE.Vector3(0.6, 0.05, 0.75));
    renderer.camera.updateProjectionMatrix();

    /* ── BASELINE: render an empty scene and census it ───────────────────── */
    renderer.render();
    note('censusBeforePlace', pixelCensus(canvas));

    /* ── THE VERB ────────────────────────────────────────────────────────── */
    await rt.bus.executeCommand('component.place', {
      componentId: COMPONENT_ID,
      levelId: 'L0',
      definitionId: DEF_ID,
      typeId: TYPE_A,
      definitionVersion: '1.0.0',
      origin: { x: 0, y: 0, z: 0 },
      rotation: 0,
    });
    note('storeHasRecordAfterPlace', rt.stores.component.getState().get(COMPONENT_ID) !== undefined);

    await binding.flush();
    note('hostRegistryHasElement', rt.scene.host.registry.get(COMPONENT_ID) !== undefined);

    // The bake is async (§COMPONENT-RENDER-ASYNC-SEAM) — wait for the committer
    // to SAY it landed rather than guessing with a timeout.
    for (let i = 0; i < 120 && readyEvents === 0; i++) await nextFrame();
    note('geometryReadyEvents', readyEvents);
    note('solidsAttachedTypeA', lastSolidCount);
    note('committerStatsAfterPlace', JSON.parse(JSON.stringify(committer.stats)));

    // Let the scene reconciler (a scheduler tick listener) move the committed
    // group from host.registry into renderer.scene.
    for (let i = 0; i < 10; i++) await nextFrame();
    const group = renderer.scene.getObjectByName(`component:${COMPONENT_ID}`);
    note('groupInRendererScene', group !== undefined);
    note('groupChildCount', group ? group.children.length : -1);
    if (group) {
      const box = new THREE.Box3().setFromObject(group);
      note('worldBoundsTypeA', {
        min: [+box.min.x.toFixed(4), +box.min.y.toFixed(4), +box.min.z.toFixed(4)],
        max: [+box.max.x.toFixed(4), +box.max.y.toFixed(4), +box.max.z.toFixed(4)],
      });
    }

    renderer.render();
    note('censusAfterPlace', pixelCensus(canvas));
    note('stage', 'placed');

    /* ── THE TYPE SWAP: does the geometry REGENERATE? (§76 F / §66 F-2) ──── */
    readyEvents = 0;
    await rt.bus.executeCommand('component.swapType', {
      componentId: COMPONENT_ID,
      typeId: TYPE_B,
    });
    await binding.flush();
    for (let i = 0; i < 120 && readyEvents === 0; i++) await nextFrame();
    for (let i = 0; i < 10; i++) await nextFrame();
    note('geometryReadyEventsAfterSwap', readyEvents);
    note('committerStatsAfterSwap', JSON.parse(JSON.stringify(committer.stats)));
    const group2 = renderer.scene.getObjectByName(`component:${COMPONENT_ID}`);
    if (group2) {
      const box2 = new THREE.Box3().setFromObject(group2);
      note('worldBoundsTypeB', {
        min: [+box2.min.x.toFixed(4), +box2.min.y.toFixed(4), +box2.min.z.toFixed(4)],
        max: [+box2.max.x.toFixed(4), +box2.max.y.toFixed(4), +box2.max.z.toFixed(4)],
      });
    }
    renderer.render();
    note('censusAfterSwap', pixelCensus(canvas));

    /* ── restore TYPE_A so the screenshot shows the 1200-wide instance ───── */
    readyEvents = 0;
    await rt.bus.executeCommand('component.swapType', { componentId: COMPONENT_ID, typeId: TYPE_A });
    await binding.flush();
    for (let i = 0; i < 120 && readyEvents === 0; i++) await nextFrame();
    for (let i = 0; i < 10; i++) await nextFrame();
    renderer.render();
    note('censusRestored', pixelCensus(canvas));

    note('stage', 'done');
  } catch (e) {
    note('stage', 'threw');
    note('fatal', e instanceof Error ? `${e.name}: ${e.message}` : String(e));
    note('stack', e instanceof Error ? String(e.stack).slice(0, 2500) : null);
  }
}

void run();
