/**
 * §PERF105 probe 03 — WHY IS `[NME] §H2-NME-CACHE … cacheSize=500/500` THRASHING?
 *
 * Founder's console: `cacheSize=500/500` with repeated `§H2 evicted LRU entry` lines.
 *
 * `NativeElementMeshExporter._proxyCache` is keyed
 *     `${elementId}:${viewId}:${version}:${cropKey}`
 * and the miss path only ever INSERTS. When an element's `userData.version` bumps
 * (every geometric rebuild), the entry for the OLD version is never removed — it sits
 * in the LRU until it is evicted, and until then it occupies a slot that a LIVE entry
 * of some other element needs.
 *
 * Two things are measured here, separately, because they are different claims:
 *
 *   (A) THE KEY SCHEME — exact, not a model. The only thing that differs between the
 *       shipped scheme and the proposed one is what the Map key is, so replaying the
 *       same session against two Maps IS the experiment.
 *
 *   (B) THE PRICE OF A MISS — measured on real THREE objects: the traverse +
 *       `updateWorldMatrix` + descriptor build that a miss pays and a hit skips.
 *
 * Run:  npx tsx packages/room-topology/probes/probe-perf105-03-nme-cache-key.local.mts
 */
import * as THREE from '@pryzm/renderer-three/three';

// ── (A) The key scheme ───────────────────────────────────────────────────────

const CAP = 500;                    // NativeElementMeshExporter.BASE_CACHE_ENTRIES
const ELEMENTS = 200;
const VIEWS = ['plan-L0', 'elev-S'];   // the founder's session had a plan + elevations
const CROP = 'nocrop';

interface Entry { usedAt: number; }

/** The shipped `_evictLRU` — a full scan for the oldest `usedAt`. */
function evictLRU(cache: Map<string, Entry>): number {
    let oldestKey: string | null = null, oldest = Infinity, scanned = 0;
    for (const [k, e] of cache) { scanned++; if (e.usedAt < oldest) { oldest = e.usedAt; oldestKey = k; } }
    if (oldestKey) cache.delete(oldestKey);
    return scanned;
}

function replay(scheme: 'version-in-key' | 'version-in-entry') {
    const cache = new Map<string, Entry & { version: number }>();
    const version = new Map<string, number>();
    for (let i = 0; i < ELEMENTS; i++) version.set(`e${i}`, 1);

    let hits = 0, misses = 0, evictions = 0, evictScan = 0, clock = 0;

    const touch = (elementId: string, viewId: string): void => {
        const v = version.get(elementId)!;
        const key = scheme === 'version-in-key'
            ? `${elementId}:${viewId}:${v}:${CROP}`
            : `${elementId}:${viewId}:${CROP}`;
        const got = cache.get(key);
        if (got && (scheme === 'version-in-key' || got.version === v)) {
            got.usedAt = clock++; hits++; return;
        }
        misses++;
        if (cache.size >= CAP) { evictScan += evictLRU(cache); evictions++; }
        cache.set(key, { usedAt: clock++, version: v });
    };

    // A realistic session: the model is drawn up to ELEMENTS, and every create
    // coarse-marks the open views, so each create re-exports every element in view.
    // The created element's OWN version starts at 1; edits bump versions.
    for (let created = 1; created <= ELEMENTS; created++) {
        for (const viewId of VIEWS) {
            for (let i = 0; i < created; i++) touch(`e${i}`, viewId);
        }
    }
    // Then 100 ordinary edits — each bumps ONE element's version and re-exports all.
    for (let edit = 0; edit < 100; edit++) {
        const target = `e${edit % ELEMENTS}`;
        version.set(target, version.get(target)! + 1);
        for (const viewId of VIEWS) {
            for (let i = 0; i < ELEMENTS; i++) touch(`e${i}`, viewId);
        }
    }

    return { hits, misses, evictions, evictScan, size: cache.size,
             hitRate: (hits / (hits + misses)) * 100 };
}

console.log('§PERF105 probe 03 — NME proxy-cache key scheme\n');
console.log(`${ELEMENTS} elements · ${VIEWS.length} views · cap ${CAP} · draw-up then 100 edits\n`);
console.log('scheme              hits      misses   hitRate   evictions  evict-scan iters');
for (const s of ['version-in-key', 'version-in-entry'] as const) {
    const r = replay(s);
    console.log(
        `${s.padEnd(19)} ${String(r.hits).padStart(8)} ${String(r.misses).padStart(8)}   ` +
        `${r.hitRate.toFixed(1).padStart(5)}%  ${String(r.evictions).padStart(9)}  ${String(r.evictScan).padStart(12)}`,
    );
}

// ── (B) What a miss actually costs ───────────────────────────────────────────
// The miss path traverses the element root, calls updateWorldMatrix per mesh and
// builds one descriptor per mesh; the hit path reconstructs from descriptors.

function makeRoot(meshes: number): THREE.Group {
    const g = new THREE.Group();
    for (let m = 0; m < meshes; m++) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 0.3));
        mesh.position.set(m * 0.4, 0, 0);
        mesh.userData = { elementType: 'wall', role: 'body', layerIndex: m };
        g.add(mesh);
    }
    g.updateMatrixWorld(true);
    return g;
}

interface Desc { m: readonly number[]; geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[]; userData: Record<string, unknown>; }

function expandMiss(root: THREE.Group): Desc[] {
    const out: Desc[] = [];
    root.updateWorldMatrix(true, false);
    root.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.updateWorldMatrix(true, false);
        out.push({
            m: mesh.matrixWorld.elements.slice(),
            geometry: mesh.geometry,
            material: mesh.material,
            userData: { ...mesh.userData },
        });
    });
    return out;
}

function replayHit(descs: Desc[]): THREE.Group {
    const wrapper = new THREE.Group();
    for (const d of descs) {
        const proxy = new THREE.Mesh(d.geometry, d.material);
        proxy.matrix.fromArray(d.m as number[]);
        proxy.matrix.decompose(proxy.position, proxy.quaternion, proxy.scale);
        proxy.userData = d.userData;
        proxy.updateMatrixWorld(true);
        wrapper.add(proxy);
    }
    return wrapper;
}

function median(xs: number[]): number { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; }

console.log('\n── (B) price of one proxy expansion, by mesh count ──');
console.log('meshes   miss(expand)   hit(replay)   miss−hit');
for (const n of [4, 7, 16, 26]) {
    const root = makeRoot(n);
    const descs = expandMiss(root);
    const missT: number[] = [], hitT: number[] = [];
    for (let r = 0; r < 200; r++) {
        let t = performance.now(); expandMiss(root); missT.push(performance.now() - t);
        t = performance.now(); replayHit(descs); hitT.push(performance.now() - t);
    }
    const mm = median(missT), hh = median(hitT);
    console.log(`${String(n).padStart(6)}   ${mm.toFixed(4).padStart(10)}ms  ${hh.toFixed(4).padStart(10)}ms  ${(mm - hh).toFixed(4).padStart(8)}ms`);
}
