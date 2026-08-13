// ─── §4.3 — PROVING THE NEGATIVE CONTROL CAN ACTUALLY FIRE ───────────────────
//
// §4.1: "Before any comparator's verdict is trusted, it is watched go red
// against a deliberate corruption." §0: "Certification is AN EXECUTED RUN WHOSE
// COMPARATOR HAS BEEN WATCHED GO RED. Nothing else counts."
//
// `geometry.cert.ts` runs a negative control and reports `blind=false`. That
// claim is worth precisely nothing unless the control can ALSO report `true` —
// a control that structurally cannot fail is a decoration, and this repository
// has already shipped one of those (the compile gate that fabricated ~90 PASS
// lines per run for its entire life and never compiled anything, `2b1e7e99`).
//
// So this suite substitutes DELIBERATELY BLIND comparators for the real
// `countGeometry` and proves the control CATCHES each one. It is the meta-check:
// it certifies the instrument, not the subject.

import { describe, it, expect } from 'vitest';
import { countGeometry, runNegativeControl } from '../headlessGeometry';

/** The three arms, re-implemented against an INJECTED comparator so a blind one can be planted. */
async function armsUnder(comparator: (root: unknown) => { meshes: number; vertices: number; triangles: number }) {
  const THREE = await import('@pryzm/renderer-three/three') as any;
  const empty = new THREE.Scene();
  const hollowScene = new THREE.Scene();
  hollowScene.add(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial()));
  const realScene = new THREE.Scene();
  realScene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()));

  const a = comparator(empty);
  const b = comparator(hollowScene);
  const c = comparator(realScene);
  return {
    emptySighted: a.meshes === 0 && a.triangles === 0,
    hollowSighted: b.meshes === 1 && b.vertices === 0 && b.triangles === 0,
    realSighted: c.meshes === 1 && c.vertices > 0 && c.triangles > 0,
  };
}

describe('§4.3 — the geometry negative control is FALSIFIABLE', () => {
  it('the REAL comparator passes all three arms (the control is not simply always-red)', async () => {
    const r = await runNegativeControl();
    for (const a of r.arms) console.log(`   ✓ ${a.arm}: ${a.observed}`);
    expect(r.blind).toBe(false);
  });

  it('PLANTED DEFECT 1 — a comparator that always answers ZERO is caught', async () => {
    // The dangerous one. It passes the two "must be zero" arms trivially, and a
    // control WITHOUT the real-box arm would call it sighted. Blindness in the
    // safe direction is still blindness: this comparator would report every
    // build in the estate as producing no geometry, and every row would read
    // FAIL rather than the truth, which is that nobody looked.
    const blind = () => ({ meshes: 0, vertices: 0, triangles: 0 });
    const arms = await armsUnder(blind);
    console.log(`   empty=${arms.emptySighted} hollow=${arms.hollowSighted} real=${arms.realSighted}`);
    expect(arms.emptySighted).toBe(true);   // passes trivially
    expect(arms.hollowSighted).toBe(false); // caught: meshes should have been 1
    expect(arms.realSighted).toBe(false);   // CAUGHT by the real-box arm
  });

  it('PLANTED DEFECT 2 — a comparator that counts a HOLLOW mesh as real is caught', async () => {
    // The subtle one, and the reason the hollow arm exists. This comparator
    // counts CHILDREN rather than reading the position attribute — so an object
    // that merely LOOKS like a mesh in a traverse inflates the triangle count.
    // A builder that attached empty meshes would score as building fine.
    const naive = (root: unknown) => {
      let meshes = 0;
      (root as any).traverse((o: any) => { if (o.isMesh) meshes++; });
      return { meshes, vertices: meshes * 24, triangles: meshes * 12 };
    };
    const arms = await armsUnder(naive);
    console.log(`   empty=${arms.emptySighted} hollow=${arms.hollowSighted} real=${arms.realSighted}`);
    expect(arms.emptySighted).toBe(true);
    expect(arms.hollowSighted).toBe(false); // CAUGHT: it invented 24 vertices for an empty geometry
    expect(arms.realSighted).toBe(true);
  });

  it('PLANTED DEFECT 3 — a comparator that hallucinates geometry in an EMPTY scene is caught', async () => {
    // The §0 incident's shape, inverted: a comparator that reports geometry over
    // nothing. If this were the live comparator, the empty-world §4.4 proof
    // would score well — which is the precise failure the whole plan exists to
    // make impossible.
    const hallucinating = () => ({ meshes: 3, vertices: 72, triangles: 36 });
    const arms = await armsUnder(hallucinating);
    console.log(`   empty=${arms.emptySighted} hollow=${arms.hollowSighted} real=${arms.realSighted}`);
    expect(arms.emptySighted).toBe(false); // CAUGHT
    expect(arms.hollowSighted).toBe(false);
  });

  it('the real comparator distinguishes a hollow mesh from a real one — the load-bearing difference', async () => {
    const THREE = await import('@pryzm/renderer-three/three') as any;
    const hollow = new THREE.Scene();
    hollow.add(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial()));
    const real = new THREE.Scene();
    real.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()));
    const h = countGeometry(hollow), r = countGeometry(real);
    console.log(`   hollow → ${JSON.stringify(h)}`);
    console.log(`   real   → ${JSON.stringify(r)}`);
    expect(h.meshes).toBe(r.meshes);            // both look like one mesh
    expect(h.triangles).toBe(0);                // but only one HAS geometry
    expect(r.triangles).toBeGreaterThan(0);
  });
});
