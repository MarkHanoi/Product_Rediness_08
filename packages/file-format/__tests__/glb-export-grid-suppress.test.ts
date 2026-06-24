// §GLOBE-REAL-GRID-SUPPRESS (founder 2026-06-24) — regression guard.
//
// Bug: on the 3D globe / 3D Site REAL view, per-floor COLOURED datum/level lines
// streaked across the terrain, plus two lines that always landed on the building
// corner (the X/Z axis datum lines crossing at the scene origin). MASSING mode
// was clean.
//
// Root cause: REAL mode serialises the live BIM THREE scene to GLB
// (exportFragmentsToGLB) and places it as a Cesium.Model. LevelVisualizer's datum
// lines + level-head bubbles all carry userData.elementType='LevelLine', so the
// exporter — which exports every elementType-bearing object — baked them in.
// MASSING never serialises the scene, hence clean.
//
// Fix: selectElementsForExport() now skips a NON_BUILDING_EXPORT_ELEMENT_TYPES set
// (LevelLine / Grid / axis / datum) so those overlays never enter the Real GLB.
//
// We test the pure selection helper directly (the full exportFragmentsToGLB needs
// the DOM-bound GLTFExporter/Blob, out of scope for this Node-env suite).

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';

import {
  selectElementsForExport,
  isNonBuildingExportOverlay,
} from '../src/export/glb/GLBExporter';

function levelDatumLine(levelId: string): THREE.Line {
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-30, 0, 0),
    new THREE.Vector3(30, 0, 0),
  ]);
  const line = new THREE.Line(geo, new THREE.LineDashedMaterial());
  // Mirrors LevelVisualizer._makeDashedLine.
  line.userData = { elementType: 'LevelLine', id: levelId };
  return line;
}

function buildingMesh(id: string, elementType: string): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  mesh.userData = { elementType, id };
  return mesh;
}

describe('§GLOBE-REAL-GRID-SUPPRESS — Real GLB export strips datum/grid/axis overlays', () => {
  it('excludes LevelVisualizer datum lines (the coloured per-floor + corner-axis lines)', () => {
    const scene = new THREE.Scene();
    // LevelVisualizer adds a per-level group containing the X & Z datum lines.
    const datumGroup = new THREE.Group();
    datumGroup.name = 'level-datum-L0';
    datumGroup.add(levelDatumLine('L0')); // X-axis line (z=0) — crosses origin
    datumGroup.add(levelDatumLine('L0')); // Z-axis line (x=0) — crosses origin
    scene.add(datumGroup);

    // Real building geometry that SHOULD export.
    const wall = buildingMesh('wall-1', 'wall');
    const slab = buildingMesh('slab-1', 'slab');
    scene.add(wall, slab);

    const exported = selectElementsForExport(scene);

    expect(exported).toContain(wall);
    expect(exported).toContain(slab);
    // None of the datum lines made it into the GLB element set.
    expect(exported.every((o) => o.userData.elementType !== 'LevelLine')).toBe(true);
    expect(exported.length).toBe(2);
  });

  it('excludes Grid / axis / datum overlays regardless of casing', () => {
    const scene = new THREE.Scene();
    scene.add(buildingMesh('g-1', 'Grid'));
    scene.add(buildingMesh('a-1', 'axis'));
    scene.add(buildingMesh('d-1', 'Datum'));
    scene.add(buildingMesh('gl-1', 'gridLine'));
    const door = buildingMesh('door-1', 'door');
    scene.add(door);

    const exported = selectElementsForExport(scene);

    expect(exported).toEqual([door]);
  });

  it('isNonBuildingExportOverlay classifies overlays vs building elements', () => {
    expect(isNonBuildingExportOverlay(levelDatumLine('L1'))).toBe(true);
    expect(isNonBuildingExportOverlay(buildingMesh('w', 'wall'))).toBe(false);
    expect(isNonBuildingExportOverlay(buildingMesh('r', 'roof'))).toBe(false);
    // No elementType → not classified as an overlay (won't export either way).
    expect(isNonBuildingExportOverlay(new THREE.Object3D())).toBe(false);
  });

  it('does not regress the root-only de-duplication rule for real elements', () => {
    const scene = new THREE.Scene();
    // A wall GROUP whose child fragment also carries elementType — only the root exports.
    const wallGroup = buildingMesh('wall-2', 'wall');
    const fragment = buildingMesh('wall-2', 'wall');
    wallGroup.add(fragment);
    scene.add(wallGroup);

    const exported = selectElementsForExport(scene);
    expect(exported).toEqual([wallGroup]); // child excluded (has element ancestor)
  });
});
