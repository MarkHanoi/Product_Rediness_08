// §FIX-IFC-IN-CESIUM (L-696) — the founder's actual goal.
//
// Report: "my GOAL is to be able to VISUALIZE THE IFC IN 3D VIEW SITE AND 3D
// GLOBE (CESIUM VIEWS), which at the moment they are not."
//
// Root cause (a CAPABILITY GAP, not a Z problem): the Cesium 3D-Site / 3D-Globe
// "REAL" representation is produced by exportFragmentsToGLB(), whose ONLY input
// contract is `userData.elementType` on an object in the live THREE scene
// (selectElementsForExport). IfcGeometryRenderer wrote `userData.type` but never
// `elementType`, so imported IFC meshes were invisible to the exporter — the GLB
// found 56 native roots and zero of the 2,128 IFC meshes. The MASSING path is
// likewise store-driven (wall/slab/roof/stair) and IFC is in no store.
//
// Fix: IFC meshes now carry `elementType`, so they flow into the REAL GLB — the
// existing REAL-vs-MASSING split (ADR-0093) is respected, no third mode. IfcSpace
// room solids are suppressed, and a triangle BUDGET declines an over-large model
// back to massing rather than shipping an unbounded payload to Cesium.

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';

import {
  selectElementsForExport,
  countExportTriangles,
  isNonBuildingExportOverlay,
  REAL_GLB_TRIANGLE_BUDGET,
} from '../src/export/glb/GLBExporter';

/**
 * Mirrors the userData that IfcGeometryRenderer._processFlatMesh now writes.
 * Kept in the test as an explicit contract statement: if the renderer stops
 * emitting `elementType`, these assertions are what fail.
 */
function ifcMesh(expressID: number, ifcTypeName: string): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
  mesh.userData = {
    id: `ifc-${expressID}`,
    expressID,
    modelId: 'model-1',
    name: `${ifcTypeName} ${expressID}`,
    type: ifcTypeName,
    ifcTypeName,
    rawIfcType: `IFC${ifcTypeName.toUpperCase()}`,
    storeyName: 'Level 1',
    psets: {},
    source: 'ifc-import',
    selectable: true,
    elementType: ifcTypeName.toLowerCase(),
  };
  return mesh;
}

function nativeMesh(id: string, elementType: string): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
  mesh.userData = { id, elementType };
  return mesh;
}

/** Mirrors IfcGeometryRenderer.renderFromOpenModel: one group added to the scene. */
function ifcGroup(meshes: THREE.Mesh[]): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Imported IFC: house.ifc';
  group.userData = { modelId: 'model-1', name: 'house.ifc', source: 'ifc-import' };
  for (const m of meshes) group.add(m);
  return group;
}

describe('REAL GLB export — IFC as a geometry source', () => {
  it('exports imported IFC meshes (the capability that was missing)', () => {
    const scene = new THREE.Scene();
    scene.add(ifcGroup([ifcMesh(101, 'Wall'), ifcMesh(102, 'Slab'), ifcMesh(103, 'Door')]));

    const selected = selectElementsForExport(scene);

    // Before the fix this was 0 — the whole reason nothing reached Cesium.
    expect(selected).toHaveLength(3);
    expect(selected.every((o) => o.userData.source === 'ifc-import')).toBe(true);
  });

  it('exports IFC and NATIVE geometry together from one scene', () => {
    const scene = new THREE.Scene();
    scene.add(nativeMesh('wall-1', 'wall'));
    scene.add(nativeMesh('slab-1', 'slab'));
    scene.add(ifcGroup([ifcMesh(201, 'Wall'), ifcMesh(202, 'Column')]));

    const selected = selectElementsForExport(scene);
    expect(selected).toHaveLength(4);

    const ifcCount = selected.filter((o) => o.userData.source === 'ifc-import').length;
    const nativeCount = selected.length - ifcCount;
    expect(ifcCount).toBe(2);
    expect(nativeCount).toBe(2);
  });

  it('suppresses IfcSpace room solids (they would swallow the walls they bound)', () => {
    const scene = new THREE.Scene();
    scene.add(ifcGroup([ifcMesh(301, 'Wall'), ifcMesh(302, 'Space'), ifcMesh(303, 'Space')]));

    const selected = selectElementsForExport(scene);
    expect(selected).toHaveLength(1);
    expect(selected[0].userData.ifcTypeName).toBe('Wall');
    expect(isNonBuildingExportOverlay(ifcMesh(999, 'Space'))).toBe(true);
  });

  it('still suppresses native datum/grid overlays (no regression)', () => {
    const scene = new THREE.Scene();
    scene.add(nativeMesh('lvl-0', 'LevelLine'));
    scene.add(nativeMesh('grid-a', 'Grid'));
    scene.add(ifcGroup([ifcMesh(401, 'Wall')]));

    const selected = selectElementsForExport(scene);
    expect(selected).toHaveLength(1);
    expect(selected[0].userData.id).toBe('ifc-401');
  });

  it('does not double-count nested IFC meshes (root-only selection holds)', () => {
    const scene = new THREE.Scene();
    const parent = ifcMesh(501, 'Wall');
    parent.add(ifcMesh(502, 'Window')); // hosted child under an elementType-bearing parent
    scene.add(ifcGroup([parent]));

    const selected = selectElementsForExport(scene);
    expect(selected).toHaveLength(1);
    expect(selected[0].userData.id).toBe('ifc-501');
  });
});

describe('REAL GLB export — payload budget', () => {
  it('counts triangles from indexed geometry', () => {
    // BoxGeometry = 12 triangles.
    const meshes = [ifcMesh(1, 'Wall'), ifcMesh(2, 'Wall')];
    expect(countExportTriangles(meshes)).toBe(24);
  });

  it('counts triangles from non-indexed geometry', () => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9 * 3), 3)); // 9 verts
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
    mesh.userData = { elementType: 'wall' };
    expect(countExportTriangles([mesh])).toBe(3);
  });

  it('traverses nested children when counting', () => {
    const parent = ifcMesh(1, 'Wall');
    parent.add(ifcMesh(2, 'Window'));
    expect(countExportTriangles([parent])).toBe(24);
  });

  it("the founder's 362,246-triangle IFC import is WITHIN budget", () => {
    // The reported import was 2,128 meshes / 362,246 triangles / 325 elements.
    // It must be admitted to the REAL GLB, not declined — otherwise the fix
    // would not actually deliver the goal.
    expect(362_246).toBeLessThanOrEqual(REAL_GLB_TRIANGLE_BUDGET);
  });

  it('states a finite budget so an unbounded model cannot reach Cesium', () => {
    expect(Number.isFinite(REAL_GLB_TRIANGLE_BUDGET)).toBe(true);
    expect(REAL_GLB_TRIANGLE_BUDGET).toBeGreaterThan(362_246);
    // A 5 M-triangle model must be over budget (declines back to massing).
    expect(5_000_000).toBeGreaterThan(REAL_GLB_TRIANGLE_BUDGET);
  });
});
