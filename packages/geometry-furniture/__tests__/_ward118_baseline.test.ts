import * as THREE from '@pryzm/renderer-three/three';
import { describe, it } from 'vitest';
import { WardrobeCabinetEngine } from '../src/engines/WardrobeCabinetEngine';
import { buildDefaultWardrobeCabinetConfig } from '../src/WardrobeCabinetTypes';

function stats(root: THREE.Group) {
    let meshes = 0, tris = 0; const sig: string[] = [];
    root.updateMatrixWorld(true);
    root.traverse(o => {
        if (o instanceof THREE.Mesh) {
            meshes++;
            const g = o.geometry as THREE.BufferGeometry;
            const idx = g.getIndex(); tris += (idx ? idx.count : g.getAttribute('position').count) / 3;
            const p = new THREE.Vector3(); o.getWorldPosition(p);
            const bb = new THREE.Box3().setFromObject(o);
            sig.push(`${g.type}@${p.x.toFixed(4)},${p.y.toFixed(4)},${p.z.toFixed(4)}|${(bb.max.y-bb.min.y).toFixed(4)}`);
        }
    });
    const bb = new THREE.Box3().setFromObject(root);
    return { meshes, tris, h: (bb.max.y - bb.min.y).toFixed(4), sig: sig.sort().join(';') };
}
describe('baseline', () => {
    it('prints', () => {
        for (const layout of ['wardrobe_straight','wardrobe_l_shape','wardrobe_u_shape','wardrobe_straight_tall'] as const) {
            for (const h of [2.4, 1.0]) {
                const cfg = buildDefaultWardrobeCabinetConfig(layout); cfg.height = h;
                const s = stats(new WardrobeCabinetEngine().create(cfg));
                console.log(`BASELINE ${layout} h=${h} meshes=${s.meshes} tris=${s.tris} bboxH=${s.h}`);
                if (h === 2.4) console.log(`SIG ${layout} ${s.sig.length} ${hash(s.sig)}`);
            }
        }
    });
});
function hash(s: string): string { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(16); }
