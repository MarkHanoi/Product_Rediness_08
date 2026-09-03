const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/index-CtIMEkHY.js","assets/preload-helper-CJHylW7d.js","assets/trace-api-BIfvUk_c.js","assets/ElementStore-CQe7ZDFd.js","assets/LODManager-DHqndFcX.js","assets/SteelProfileLibrary-NgbfwhrM.js","assets/three.core-Bv4ks8y-.js","assets/three.module-zvZFyv9V.js","assets/bootstrap.everything-C8iEhoAS.js","assets/attachStores-BMAC7-uX.js","assets/dispatcher-wbP0dOm1.js","assets/decode-CN54oYFr.js","assets/DoorTypeChange-C0A5VweF.js","assets/WindowTypeChange-BhhzXbXs.js","assets/CreatePlumbingFixtureCommand-DUwQtpaf.js","assets/assertValidDescriptor-tuQbjkHa.js"])))=>i.map(i=>d[i]);
import { _ as __vitePreload } from './preload-helper-CJHylW7d.js';

const out = { stage: "start" };
window.__LANE4E = out;
function note(k, v) {
  out[k] = v;
}
async function run() {
  try {
    const { composeRuntime } = await __vitePreload(async () => { const { composeRuntime } = await import('./index-CtIMEkHY.js').then(n => n.cI);return { composeRuntime }},true              ?__vite__mapDeps([0,1,2,3,4,5,6,7]):void 0);
    const { bootstrapWithEverything } = await __vitePreload(async () => { const { bootstrapWithEverything } = await import('./bootstrap.everything-C8iEhoAS.js');return { bootstrapWithEverything }},true              ?__vite__mapDeps([8,2,3,4,5,6,7,9,10,11,12,13,14,15]):void 0);
    note("stage", "imported");
    const rt = await composeRuntime({
      audit: { actorId: "lane4e", projectId: "lane4e", clientId: "browser" },
      canvas: null,
      bootstrapFn: bootstrapWithEverything
    });
    window.__RT = rt;
    note("stage", "composed");
    note("marksAfterCompose", performance.getEntriesByName("pryzm:bootstrap:stores:start").length);
    note("storeKeys", Object.keys(rt.stores ?? {}).length);
    note("hasComponentStore", Boolean(rt.stores?.component));
    note("rendererBeforeMount", rt.scene.renderer === null ? "null" : "present");
    const canvas = document.getElementById("lane4e");
    const t0 = performance.now();
    let mountErr = null;
    try {
      await rt.scene.mount(canvas, "webgl2");
    } catch (e) {
      mountErr = e instanceof Error ? e.message : String(e);
    }
    note("mountMs", Math.round(performance.now() - t0));
    note("mountError", mountErr);
    note("stage", "mounted");
    note("marksAfterMount", performance.getEntriesByName("pryzm:bootstrap:stores:start").length);
    note("rendererAfterMount", rt.scene.renderer === null ? "null" : "present");
    note("rendererErrorAfterMount", rt.scene.rendererError === null ? "null" : String(rt.scene.rendererError?.message));
    note("rendererMode", rt.scene.renderer?.mode ?? null);
    note("schedulerAfterMount", rt.scene.scheduler === null ? "null" : "present");
    note("hostCommitterWall", rt.scene.host?.get?.("wall") === void 0 ? "ABSENT" : "PRESENT");
    note("hostCommitterComponent", rt.scene.host?.get?.("component") === void 0 ? "ABSENT" : "PRESENT");
    note("hostRegistrySize", rt.scene.host?.registry?.size ?? null);
    note("rendererSceneChildren", rt.scene.renderer?.scene?.children?.length ?? null);
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    note("canvasContext", gl === null ? "NONE" : gl.constructor?.name ?? "unknown");
    note("stage", "done");
  } catch (e) {
    note("stage", "threw");
    note("fatal", e instanceof Error ? `${e.name}: ${e.message}` : String(e));
    note("stack", e instanceof Error ? String(e.stack).slice(0, 2e3) : null);
  }
}
void run();
