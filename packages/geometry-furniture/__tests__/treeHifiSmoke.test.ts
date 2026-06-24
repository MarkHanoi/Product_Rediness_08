import { describe, it, expect } from 'vitest';
import { ParametricTreeEngine } from '../src/engines/ParametricTreeEngine';
import { TREE_SPECIES_ORDER } from '../src/TreeTypes';
import * as THREE from '@pryzm/renderer-three/three';

function triCount(root: THREE.Object3D): number {
  let t = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry) {
      const g = m.geometry;
      const idx = g.getIndex();
      const pos = g.getAttribute('position');
      if (idx) t += idx.count / 3;
      else if (pos) t += pos.count / 3;
    }
  });
  return t;
}

describe('§TREE-HIFI smoke', () => {
  it('every species builds and stays under the tri budget', () => {
    const eng = new ParametricTreeEngine();
    let max = 0; let maxId = '';
    for (const id of TREE_SPECIES_ORDER) {
      const g = eng.create(id);
      expect(g.children.length).toBeGreaterThan(0);
      const t = triCount(g);
      if (t > max) { max = t; maxId = id; }
      expect(t, `${id} tris`).toBeLessThan(2500);
    }
    console.log(`[smoke] worst tree = ${maxId} @ ${max} tris`);
  });
  it('a default broadleaf builds a cross-billboard canopy with foliage cards', () => {
    const eng = new ParametricTreeEngine();
    const g = eng.create('arbol_t_01');
    let cards = 0, shells = 0;
    g.traverse((o) => {
      if (o.userData.elementType === 'TreeFoliageCard') cards++;
      if (o.userData.elementType === 'TreeCanopyShell') shells++;
    });
    expect(cards).toBeGreaterThanOrEqual(4);
    expect(shells).toBeGreaterThanOrEqual(1);
  });
  it('builds identically across two calls (determinism)', () => {
    const eng = new ParametricTreeEngine();
    expect(triCount(eng.create('arbol_t_19'))).toBe(triCount(eng.create('arbol_t_19')));
  });
});
