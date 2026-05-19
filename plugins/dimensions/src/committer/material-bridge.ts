// material-bridge — DimensionMaterialKey → THREE materials (S29).
//
// Dimension material-key shape (from `composeDimensionMaterialKey`):
//   `dimension|<kind>|<style>|<unit>|<precision>|body`
//
// Line material is always the same neutral dark colour; arrowhead mesh
// material is the same colour as the lines.

import * as THREE from '@pryzm/renderer-three/three';

const DIM_COLOR     = '#222222';
const DIM_LINE_WIDTH = 1;       // pixels — `linewidth > 1` only works on WebGL1

export function makeDimensionBodyMaterial(_key: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(DIM_COLOR),
    roughness: 0.9,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
}

export function makeDimensionLineMaterial(): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({
    color: new THREE.Color(DIM_COLOR),
    linewidth: DIM_LINE_WIDTH,
  });
}
