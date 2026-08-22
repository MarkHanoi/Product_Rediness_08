/**
 * §TRUE-PROJECTION-HOST-NEVER-HIDES-ITS-OPENING (L-6013..L-6016) — **THE REACHABILITY HALF.**
 *
 * ⭐ `HiddenLineRemoval.trueProjection.test.ts` proves the ENGINE honours a `hostId` stamp. It
 * cannot prove the stamp ARRIVES — it hand-builds its own nodes. That is the exact gap recorded
 * in `committed-is-not-reachable`: four fixes in one session ran nowhere because every proof was
 * taken at a pure function's return rather than at the layer the user experiences.
 *
 * ⚠ AND THE GAP WAS REAL HERE, NOT HYPOTHETICAL. The obvious transport — stamping `hostId` on
 * the mesh wrapper in `NativeElementMeshExporter` — **does not carry a façade window in an
 * ELEVATION at all.** MEASURED: `EdgeProjectorService` calls
 * `openingElevationSymbolBuilder.inject()` for every elevation and then
 * `suppressSymbolisedElementLinework()` DELETES the projected solid's raw wireframe for every
 * element the builder covered (§ELEV-SYMBOL-OPENING, L-1240 — pinned both ways in
 * `OpeningElevationSymbolBuilder.test.ts` §A). So in the founder's view a window's linework is
 * the INJECTED SYMBOL, and the wrapper stamp reaches a layer that is no longer there.
 *
 * The stamp therefore has to be made where the relation already exists: inside the builder's own
 * wall loop, which holds `wall.id` as the host of every opening it emits. This suite is what
 * says so, at the drawing.
 *
 * Maps C15 (hosted elements), C09 §4.6.5/§4.6.6, C86 §10.1 (the opening symbol's producer).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { storeRegistry } from '../StoreRegistry';
import {
    openingElevationSymbolBuilder,
    GLAZ_SYM_LAYER,
    WALL_SYM_LAYER,
} from './OpeningElevationSymbolBuilder';
import { applyOcclusion } from './HiddenLineRemoval';

// ─── Harness ──────────────────────────────────────────────────────────────────

/**
 * A drawing carrying the two surfaces both the builder and the occluder touch.
 *
 * ⚠ THE RE-WRAP IN `addProjectionLines` IS A TEST-ENVIRONMENT ARTEFACT, AND IT IS RECORDED
 * RATHER THAN HIDDEN. MEASURED here: the node `OBC.TechnicalDrawing.toDrawingSpace()` returns
 * reports `.type === 'LineSegments'` but fails `instanceof THREE.LineSegments` against
 * `@pryzm/renderer-three/three` — under vitest's node resolution `@thatopen/components` and this
 * package end up holding two module instances of the one `three@0.183.2` in the store (there is
 * only one copy — `ls node_modules/.pnpm | grep '^three@'` → 1 — so this is a CJS/ESM dual-load,
 * not a duplicate dependency). `applyOcclusion` gates on `instanceof`, so without the re-wrap it
 * would traverse past every injected symbol and this suite would pass for the wrong reason.
 *
 * ⛔ AND IT IS NOT EVIDENCE OF A PRODUCTION DEFECT — stated so nobody "fixes" the engine on the
 * strength of it. The founder's own console is the counter-measurement: his elevation reports
 * `16919 sub-segment(s) demoted proj → HIDDEN`, which is `applyOcclusion` reaching symbol
 * linework in the shipped Vite build, where three resolves once as ESM. The re-wrap copies the
 * geometry and userData verbatim and changes nothing the engine reads.
 */
function makeDrawing() {
    const three = new THREE.Group();
    const created = new Set<string>();
    const drawing = {
        three,
        layers: {
            has: (n: string) => created.has(n),
            create: (n: string) => { created.add(n); },
        },
        addProjectionLines: (lines: { geometry: THREE.BufferGeometry; userData: Record<string, unknown>; name?: string }) => {
            const g = new THREE.BufferGeometry();
            const p = lines.geometry.getAttribute('position') as THREE.BufferAttribute;
            g.setAttribute('position', new THREE.Float32BufferAttribute(Array.from(p.array as ArrayLike<number>), 3));
            const ls = new THREE.LineSegments(g, new THREE.LineBasicMaterial());
            ls.name = lines.name ?? '';
            ls.userData = { ...lines.userData };
            three.add(ls);
        },
    };
    return { drawing: drawing as unknown as import('@thatopen/components').TechnicalDrawing, three };
}

/**
 * THE FOUNDER'S CASE: one south-facing façade wall with one window hosted in it.
 * A 6 m x 3 m wall on the X axis; the viewer looks along -Z at its south face.
 */
const WALL = {
    id: 'wall-facade',
    levelId: 'L0',
    baseLine: [{ x: -3, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }],
    height: 3,
    thickness: 0.3,
    baseOffset: 0,
    rakeAngleDeg: null,
    curve: null,
    profile: null,
    openings: [{
        id: 'op-1',
        elementId: 'win-1',
        type: 'window',
        offset: 3,          // centred along the 6 m wall
        width: 1.4,
        height: 1.2,
        sillHeight: 0.9,
        openingProfile: null,
        windowType: null,
    }],
};

const SOUTH_ELEVATION = {
    id: 'vd-sys-elev-south',
    viewType: 'elevation',
    spatial: { projectionDirection: { x: 0, y: 0, z: -1 } },
} as never;

function fakeWallStore(walls: unknown[]) {
    return { getAll: () => walls, getById: (id: string) => walls.find(w => (w as { id: string }).id === id) };
}

/** Every LineSegments in the drawing, flattened, with the two stamps under test. */
function stamps(three: THREE.Object3D): Array<{ layer: string; uuid: string; hostId?: string }> {
    const out: Array<{ layer: string; uuid: string; hostId?: string }> = [];
    three.traverse((o) => {
        if (!(o instanceof THREE.LineSegments)) return;
        out.push({
            layer: o.userData?.layerName as string,
            uuid: o.userData?.elementUUID as string,
            hostId: o.userData?.hostId as string | undefined,
        });
    });
    return out;
}

function segCount(three: THREE.Object3D, uuid: string, layerPrefix: string): number {
    let n = 0;
    three.traverse((o) => {
        if (!(o instanceof THREE.LineSegments)) return;
        if (o.userData?.elementUUID !== uuid) return;
        if (!String(o.userData?.layerName ?? '').startsWith(layerPrefix)) return;
        const p = o.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
        if (p) n += p.count / 2;
    });
    return n;
}

let _prevWallStore: unknown;

beforeEach(() => {
    _prevWallStore = storeRegistry.getStoreForType('wall');
    storeRegistry.register('wall', fakeWallStore([WALL]) as never);
});
afterEach(() => {
    if (_prevWallStore) storeRegistry.register('wall', _prevWallStore as never);
});

describe('§TRUE-PROJECTION reachability — the host relation arrives ON the injected symbol', () => {
    it('THE ACCEPTANCE CASE — the window symbol carries hostId = the wall that hosts it', () => {
        const { drawing, three } = makeDrawing();
        const r = openingElevationSymbolBuilder.inject(drawing, SOUTH_ELEVATION);

        // The builder must actually have run — a suite that passes because nothing was injected
        // proves nothing, and that is precisely how a reachability claim goes wrong.
        expect(r.injected).toBeGreaterThan(0);

        const glaz = stamps(three).filter(s => s.layer?.startsWith(GLAZ_SYM_LAYER));
        expect(glaz.length).toBeGreaterThan(0);
        for (const s of glaz) {
            expect(s.uuid).toBe('win-1');
            expect(s.hostId).toBe('wall-facade');
        }
    });

    it('the WALL\'s own symbol carries NO hostId — a wall is not hosted in itself', () => {
        // Guards the `hostId !== elementUUID` clause in `_emit`. A self-referential stamp would
        // record a relation that does not exist, and relation (3) of `_sharesHostFace` (two
        // elements declaring the SAME host) would then start matching on it.
        const { drawing, three } = makeDrawing();
        openingElevationSymbolBuilder.inject(drawing, SOUTH_ELEVATION);

        const wallSyms = stamps(three).filter(s => s.layer?.startsWith(WALL_SYM_LAYER));
        expect(wallSyms.length).toBeGreaterThan(0);
        for (const s of wallSyms) expect(s.hostId).toBeUndefined();
    });

    it('⭐ END TO END — inject, then occlude: the façade does NOT demote its own window', () => {
        // The founder's sentence, executed. Both solids come from the REAL builder, in the REAL
        // layers, and the REAL occlusion engine runs over them with the elevation's own
        // disposition. Nothing in this test hand-stamps a `hostId`.
        const { drawing, three } = makeDrawing();
        openingElevationSymbolBuilder.inject(drawing, SOUTH_ELEVATION);

        const before = segCount(three, 'win-1', GLAZ_SYM_LAYER);
        expect(before).toBeGreaterThan(0);

        applyOcclusion(drawing, { disposition: 'demote' });

        expect(segCount(three, 'win-1', GLAZ_SYM_LAYER)).toBe(before);
        // …and nothing of it landed on the dashed hidden pen.
        const hidden = stamps(three).filter(s => s.uuid === 'win-1' && s.layer?.endsWith(':hidden'));
        expect(hidden).toEqual([]);
    });
});
