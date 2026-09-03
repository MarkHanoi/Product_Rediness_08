const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/index-CtIMEkHY.js","assets/preload-helper-CJHylW7d.js","assets/trace-api-BIfvUk_c.js","assets/ElementStore-CQe7ZDFd.js","assets/LODManager-DHqndFcX.js","assets/SteelProfileLibrary-NgbfwhrM.js","assets/three.core-Bv4ks8y-.js","assets/three.module-zvZFyv9V.js","assets/bootstrap.everything-C8iEhoAS.js","assets/attachStores-BMAC7-uX.js","assets/dispatcher-wbP0dOm1.js","assets/decode-CN54oYFr.js","assets/DoorTypeChange-C0A5VweF.js","assets/WindowTypeChange-BhhzXbXs.js","assets/CreatePlumbingFixtureCommand-DUwQtpaf.js","assets/assertValidDescriptor-tuQbjkHa.js","assets/index-BZxM8lJw.js","assets/index-lABwAc_D.js","assets/index-Bg1GKKlI.js","assets/triangulatePolygon-D2k7Jml-.js"])))=>i.map(i=>d[i]);
import { _ as __vitePreload } from './preload-helper-CJHylW7d.js';

const out = { stage: "start" };
window.__LANE4E = out;
const note = (k, v) => {
  out[k] = v;
};
const ULID_STEM = "01ARZ3NDEKTSV4RRFFQ69G5F";
const A32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const ulidN = (n) => ULID_STEM + A32[Math.floor(n / 32) % 32] + A32[n % 32];
const COMPONENT_ID = `component_${ulidN(0)}`;
const DEF_ID = `fam_${ulidN(1)}`;
const TYPE_A = `typ_${ulidN(2)}`;
const TYPE_B = `typ_${ulidN(3)}`;
const P_WIDTH = `par_${ulidN(4)}`;
const P_HEIGHT = `par_${ulidN(5)}`;
const P_DEPTH = `par_${ulidN(6)}`;
const PLANE = "plane_01HZ00000000000000000PNE01";
const PROFILE = "prof_01HZ00000000000000000RCT01";
const SOLID = "sol_01HZ000000000000000000SL01";
const NOW = "2026-09-02T00:00:00.000Z";
function makeFamily() {
  const document2 = {
    formatVersion: "1.1",
    referencePlanes: [
      { id: PLANE, name: "Host", origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, isHost: true }
    ],
    parameters: [
      { id: P_WIDTH, name: "Width", kind: "type", dataType: "length", defaultValue: 1200, expression: null, ifcMapping: null, exposed: true },
      { id: P_HEIGHT, name: "Height", kind: "type", dataType: "length", defaultValue: 1500, expression: null, ifcMapping: null, exposed: true },
      { id: P_DEPTH, name: "Depth", kind: "type", dataType: "length", defaultValue: 100, expression: null, ifcMapping: null, exposed: true }
    ],
    profiles: [
      {
        id: PROFILE,
        name: "Rect",
        planeId: PLANE,
        entities: [
          { id: "01HZE0000000000000000RC001", kind: "point", data: { x: "0", z: "0" } },
          { id: "01HZE0000000000000000RC002", kind: "point", data: { x: "Width", z: "0" } },
          { id: "01HZE0000000000000000RC003", kind: "point", data: { x: "Width", z: "Height" } },
          { id: "01HZE0000000000000000RC004", kind: "point", data: { x: "0", z: "Height" } }
        ],
        constraints: []
      }
    ],
    solids: [
      {
        id: SOLID,
        kind: "extrude",
        profileId: PROFILE,
        materialSlotId: null,
        lod: { coarse: false, medium: true, fine: true },
        lengthExpression: "Depth",
        direction: { x: 0, y: 1, z: 0 }
      }
    ],
    materialSlots: [],
    types: [
      { id: TYPE_A, name: "W1200", values: {}, checksum: "sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a" },
      { id: TYPE_B, name: "W600", values: { [P_WIDTH]: 600 }, checksum: "sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a" }
    ],
    representations: [],
    connectors: [],
    propertySets: [],
    featureEdges: []
  };
  const manifest = {
    formatVersion: "1.1",
    id: DEF_ID,
    name: "Lane4E Window",
    semver: "1.0.0",
    author: { id: "usr_01HZ00000000000000000ASR01", displayName: "lane4e" },
    description: "",
    ifcEntity: "IfcWindow",
    category: "Window",
    tags: [],
    minPRYZMVersion: "2.0.0",
    schemaHash: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    createdAt: NOW,
    lastModifiedAt: NOW
  };
  return { manifest, document: document2, schemaHash: manifest.schemaHash };
}
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
function pixelCensus(canvas) {
  const gl = canvas.getContext("webgl2");
  if (gl === null) return { error: -1 };
  const w = gl.drawingBufferWidth;
  const h = gl.drawingBufferHeight;
  const buf = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  const CR = 32, CG = 32, CB = 36, TOL = 6;
  let lit = 0, minX = w, maxX = -1, minY = h, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (Math.abs(buf[i] - CR) <= TOL && Math.abs(buf[i + 1] - CG) <= TOL && Math.abs(buf[i + 2] - CB) <= TOL) continue;
      lit++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return {
    width: w,
    height: h,
    litPixels: lit,
    minX: lit ? minX : -1,
    maxX: lit ? maxX : -1,
    minY: lit ? minY : -1,
    maxY: lit ? maxY : -1,
    litWidth: lit ? maxX - minX + 1 : 0,
    litHeight: lit ? maxY - minY + 1 : 0
  };
}
async function run() {
  try {
    const { composeRuntime } = await __vitePreload(async () => { const { composeRuntime } = await import('./index-CtIMEkHY.js').then(n => n.cI);return { composeRuntime }},true              ?__vite__mapDeps([0,1,2,3,4,5,6,7]):void 0);
    const { bootstrapWithEverything } = await __vitePreload(async () => { const { bootstrapWithEverything } = await import('./bootstrap.everything-C8iEhoAS.js');return { bootstrapWithEverything }},true              ?__vite__mapDeps([8,2,3,4,5,6,7,9,10,11,12,13,14,15]):void 0);
    const { ComponentCommitter } = await __vitePreload(async () => { const { ComponentCommitter } = await import('./index-BZxM8lJw.js');return { ComponentCommitter }},true              ?__vite__mapDeps([16,6]):void 0);
    const { bindStore, MaterialPool } = await __vitePreload(async () => { const { bindStore, MaterialPool } = await import('./index-lABwAc_D.js');return { bindStore, MaterialPool }},true              ?__vite__mapDeps([17,10,4,2,6]):void 0);
    const { bakeFamilyInstance } = await __vitePreload(async () => { const { bakeFamilyInstance } = await import('./index-Bg1GKKlI.js');return { bakeFamilyInstance }},true              ?__vite__mapDeps([18,2,5,15,19]):void 0);
    const THREE = await __vitePreload(() => import('./three.module-zvZFyv9V.js'),true              ?__vite__mapDeps([7,6]):void 0);
    note("stage", "imported");
    const rt = await composeRuntime({
      audit: { actorId: "lane4e", projectId: "lane4e", clientId: "browser" },
      canvas: null,
      bootstrapFn: bootstrapWithEverything
    });
    window.__RT = rt;
    note("marksAfterCompose", performance.getEntriesByName("pryzm:bootstrap:stores:start").length);
    const canvas = document.getElementById("lane4e");
    await rt.scene.mount(canvas, "webgl2");
    note("marksAfterMount", performance.getEntriesByName("pryzm:bootstrap:stores:start").length);
    note("rendererAfterMount", rt.scene.renderer === null ? "null" : "present");
    note("rendererErrorAfterMount", rt.scene.rendererError === null ? "null" : String(rt.scene.rendererError?.message));
    note("hostCommitterWallAfterMount", rt.scene.host?.get?.("wall") === void 0 ? "ABSENT" : "PRESENT");
    if (rt.scene.renderer === null) {
      note("stage", "done");
      note("verdict", "NO RENDERER — cannot proceed");
      return;
    }
    const renderer = rt.scene.renderer;
    const scheduler = rt.scene.scheduler;
    const initialChildren = renderer.scene.children.map((c) => c.type);
    note("rendererSceneChildTypes", initialChildren);
    const hasLight = renderer.scene.children.some((c) => c.isLight === true);
    note("rendererSuppliedLight", hasLight);
    if (!hasLight) {
      renderer.scene.add(new THREE.AmbientLight(16777215, 1.4));
      const dir = new THREE.DirectionalLight(16777215, 2.2);
      dir.position.set(3, 6, 4);
      renderer.scene.add(dir);
      note("harnessAddedLight", true);
    }
    const family = makeFamily();
    const materialPool = rt.scene.materialPool ?? new MaterialPool();
    let readyEvents = 0;
    let lastSolidCount = -1;
    const committer = new ComponentCommitter({
      materialPool,
      definitions: { has: (id) => id === DEF_ID },
      bake: async ({ definitionId, typeId, instanceOverrides }) => {
        if (definitionId !== DEF_ID) throw new Error(`unknown definition ${definitionId}`);
        return bakeFamilyInstance({ family, typeId, instanceOverrides });
      },
      onGeometryReady: (_id, solidCount) => {
        readyEvents++;
        lastSolidCount = solidCount;
        scheduler?.markDirty?.("camera");
      }
    });
    rt.scene.host.register(committer);
    note("committerRegistered", rt.scene.host.get("component") !== void 0);
    const store = rt.stores.component;
    note("storeIsOnRuntime", store !== void 0);
    const binding = bindStore(store, "component", rt.scene.host);
    renderer.camera.position.set(2.6, 2.2, 3.4);
    renderer.camera.lookAt(new THREE.Vector3(0.6, 0.05, 0.75));
    renderer.camera.updateProjectionMatrix();
    renderer.render();
    note("censusBeforePlace", pixelCensus(canvas));
    await rt.bus.executeCommand("component.place", {
      componentId: COMPONENT_ID,
      levelId: "L0",
      definitionId: DEF_ID,
      typeId: TYPE_A,
      definitionVersion: "1.0.0",
      origin: { x: 0, y: 0, z: 0 },
      rotation: 0
    });
    note("storeHasRecordAfterPlace", rt.stores.component.getState().get(COMPONENT_ID) !== void 0);
    await binding.flush();
    note("hostRegistryHasElement", rt.scene.host.registry.get(COMPONENT_ID) !== void 0);
    for (let i = 0; i < 120 && readyEvents === 0; i++) await nextFrame();
    note("geometryReadyEvents", readyEvents);
    note("solidsAttachedTypeA", lastSolidCount);
    note("committerStatsAfterPlace", JSON.parse(JSON.stringify(committer.stats)));
    for (let i = 0; i < 10; i++) await nextFrame();
    const group = renderer.scene.getObjectByName(`component:${COMPONENT_ID}`);
    note("groupInRendererScene", group !== void 0);
    note("groupChildCount", group ? group.children.length : -1);
    if (group) {
      const box = new THREE.Box3().setFromObject(group);
      note("worldBoundsTypeA", {
        min: [+box.min.x.toFixed(4), +box.min.y.toFixed(4), +box.min.z.toFixed(4)],
        max: [+box.max.x.toFixed(4), +box.max.y.toFixed(4), +box.max.z.toFixed(4)]
      });
    }
    renderer.render();
    note("censusAfterPlace", pixelCensus(canvas));
    note("stage", "placed");
    readyEvents = 0;
    await rt.bus.executeCommand("component.swapType", {
      componentId: COMPONENT_ID,
      typeId: TYPE_B
    });
    await binding.flush();
    for (let i = 0; i < 120 && readyEvents === 0; i++) await nextFrame();
    for (let i = 0; i < 10; i++) await nextFrame();
    note("geometryReadyEventsAfterSwap", readyEvents);
    note("committerStatsAfterSwap", JSON.parse(JSON.stringify(committer.stats)));
    const group2 = renderer.scene.getObjectByName(`component:${COMPONENT_ID}`);
    if (group2) {
      const box2 = new THREE.Box3().setFromObject(group2);
      note("worldBoundsTypeB", {
        min: [+box2.min.x.toFixed(4), +box2.min.y.toFixed(4), +box2.min.z.toFixed(4)],
        max: [+box2.max.x.toFixed(4), +box2.max.y.toFixed(4), +box2.max.z.toFixed(4)]
      });
    }
    renderer.render();
    note("censusAfterSwap", pixelCensus(canvas));
    readyEvents = 0;
    await rt.bus.executeCommand("component.swapType", { componentId: COMPONENT_ID, typeId: TYPE_A });
    await binding.flush();
    for (let i = 0; i < 120 && readyEvents === 0; i++) await nextFrame();
    for (let i = 0; i < 10; i++) await nextFrame();
    renderer.render();
    note("censusRestored", pixelCensus(canvas));
    note("stage", "done");
  } catch (e) {
    note("stage", "threw");
    note("fatal", e instanceof Error ? `${e.name}: ${e.message}` : String(e));
    note("stack", e instanceof Error ? String(e.stack).slice(0, 2500) : null);
  }
}
void run();
