// @vitest-environment happy-dom
/**
 * §FIX-SELECTION-PAYLOAD-INSTANCED-ID (L-813)
 *
 * THE DEFECT THIS PINS. `bim-selection-changed` used to carry ONLY the Object3D:
 *     { object: obj }
 * For an instanced element the Object3D is the SHARED InstancedMesh, whose
 * `userData.id` is the synthetic `instanced-group-<key>` handle stamped by
 * InstancedElementRenderer (§SELECT-INSTANCED-PICK FIX #1) — the real per-element
 * id lives in the slot table and reaches `select()` as `elementIdOverride`.
 *
 * ContextualEditBar arms Join / Cut / Mirror / Offset / Scale / Reference-Edit from
 * that payload. So for a plain wall (no openings, not curved, not joined → GPU
 * instanced) it armed with `instanced-group-…`: truthy, so no UI guard tripped, but
 * no store row exists for it. The command's `canExecute` refused with
 * WALL_A_NOT_FOUND, and that refusal was itself invisible
 * (§FIX-OP-REFUSAL-VISIBLE) — the founder's "the wall edit buttons do nothing in
 * 3D". PLAN view was unaffected because plan picking reads ids from the store,
 * which is exactly the reported plan-vs-3D divergence.
 *
 * `pryzm-element-selected` already resolved this correctly; the two payloads simply
 * disagreed. These tests hold them to agreeing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { SelectionManager } from '../src/SelectionManager.js';

function makeManager(scene: THREE.Scene): SelectionManager {
    const threeRenderer = {
        domElement: { clientWidth: 100, clientHeight: 100 },
        capabilities: { maxTextureSize: 4096 },
        getRenderTarget: () => null,
        setRenderTarget: () => {},
        render: () => {},
        readRenderTargetPixels: () => {},
    };
    const world = { scene: { three: scene }, renderer: { three: threeRenderer } };
    const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    const dom = {
        style: {},
        addEventListener: vi.fn(),
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    };
    const tc = { attach: vi.fn(), detach: vi.fn(), addEventListener: vi.fn() };
    return new SelectionManager(
        world as never, { three: cam } as never, dom as never, tc as never, () => {},
    );
}

type Payload = { object?: unknown; elementId?: string | null; elementType?: string | null };

let payloads: Payload[];
const listener = (e: Event): void => { payloads.push((e as CustomEvent).detail as Payload); };

beforeEach(() => {
    payloads = [];
    window.addEventListener('bim-selection-changed', listener);
});
afterEach(() => {
    window.removeEventListener('bim-selection-changed', listener);
});

describe('bim-selection-changed carries the RESOLVED element id', () => {
    it('an INSTANCED wall reports its per-instance id, not the instanced-group handle', () => {
        const scene = new THREE.Scene();
        const mgr = makeManager(scene);

        const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), 2);
        im.count = 2;
        im.userData.id = 'instanced-group-abc';       // synthetic hosting handle
        im.userData.isInstancedGroup = true;
        im.userData.elementType = 'wall';
        im.userData.getInstanceElementId = (s: number) => ['wall_real_0', 'wall_real_1'][s];
        scene.add(im);

        (mgr as unknown as { select(o: THREE.Object3D, id?: string): void })
            .select(im, 'wall_real_1');

        const p = payloads.at(-1)!;
        expect(p.elementId).toBe('wall_real_1');
        expect(p.elementId).not.toBe('instanced-group-abc');
        expect(p.elementType).toBe('wall');
        // The Object3D is still supplied — existing consumers are unaffected.
        expect(p.object).toBe(im);
    });

    it('a NON-instanced wall reports its own userData.id (no behaviour change)', () => {
        const scene = new THREE.Scene();
        const mgr = makeManager(scene);

        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
        mesh.userData.id = 'wall_01KZM3NY';
        mesh.userData.elementType = 'wall';
        scene.add(mesh);

        (mgr as unknown as { select(o: THREE.Object3D, id?: string): void }).select(mesh);

        const p = payloads.at(-1)!;
        expect(p.elementId).toBe('wall_01KZM3NY');
        expect(p.elementType).toBe('wall');
    });

    it('agrees with the pryzm-element-selected payload for the same click', () => {
        const scene = new THREE.Scene();
        const mgr = makeManager(scene);

        const seen: Array<{ elementId?: string }> = [];
        (window as unknown as { runtime?: unknown }).runtime = {
            events: { emit: (name: string, p: { elementId?: string }) => {
                if (name === 'pryzm-element-selected') seen.push(p);
            } },
        };

        const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), 1);
        im.userData.id = 'instanced-group-xyz';
        im.userData.isInstancedGroup = true;
        im.userData.elementType = 'wall';
        scene.add(im);

        (mgr as unknown as { select(o: THREE.Object3D, id?: string): void })
            .select(im, 'wall_real_9');

        expect(seen.at(-1)?.elementId).toBe('wall_real_9');
        expect(payloads.at(-1)?.elementId).toBe('wall_real_9');

        delete (window as unknown as { runtime?: unknown }).runtime;
    });
});
