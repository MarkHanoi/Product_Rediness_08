// F1.6' (2026-05-30) — BathBuilder.
//
// Drop-in residential bath (UK standard 1700 × 700 × 500 mm). The full
// fixture lives in geometry-plumbing (PlumbingFragmentBuilder.createBathMesh),
// which renders the proper IfcSanitaryTerminal version. This builder is the
// FURNITURE-SHAPED projection used by the D-FLE auto-furnish pipeline (same
// shape as ShowerGlassPanelBuilder + ToiletRadiatorBuilder — D-FLE places
// them all via `furniture.create`).
//
// Geometry: an enamelled white-ceramic surround with an inset bath tub
// modelled as a recessed inner box. Visually distinct from a generic box so
// the bathroom reads correctly in the modal-thumbnail + 3D preview.

import * as THREE from '@pryzm/renderer-three/three';
import { IFurnitureBuilder } from './IFurnitureBuilder';
import { FurnitureData } from '../FurnitureTypes';
import { MaterialService } from '../MaterialService';

export class BathBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const width  = data.width  || 1.7;   // along the wall
        const length = data.length || 0.7;   // away from the wall
        const height = data.height || 0.5;   // top rim above floor
        const tubInsetMm = 80;               // tub inner edge inset from outer shell

        // ── Outer shell (white enamelled ceramic) ─────────────────────────
        // Shared / cached → clone so opacity tweaks below don't leak.
        const baseMat = this.materialService.getMaterial(0xfafaf6, 'standard') as THREE.MeshStandardMaterial;
        const shellMat = baseMat.clone();
        shellMat.roughness = 0.25;
        shellMat.metalness = 0.05;

        const shellGeo = new THREE.BoxGeometry(width, height, length);
        const shell = new THREE.Mesh(shellGeo, shellMat);
        shell.position.set(0, height / 2, 0);
        shell.castShadow = true;
        shell.receiveShadow = true;
        group.add(shell);

        // ── Inner tub (slightly darker, recessed from the top rim) ────────
        const inset = tubInsetMm / 1000;
        const innerW = Math.max(0.2, width  - 2 * inset);
        const innerL = Math.max(0.2, length - 2 * inset);
        const innerH = Math.max(0.05, height - 0.04);     // 40 mm rim above water line
        const innerGeo = new THREE.BoxGeometry(innerW, innerH, innerL);
        const innerMat = baseMat.clone();
        innerMat.color = new THREE.Color(0xe8e6dc);
        innerMat.roughness = 0.45;
        innerMat.metalness = 0.0;
        const inner = new THREE.Mesh(innerGeo, innerMat);
        // Top face of inner sits 40 mm below the rim.
        inner.position.set(0, height - innerH / 2 - 0.04, 0);
        group.add(inner);

        // ── Tap fixture (chrome cylinder + spout) at the centre-back end ─
        const tapMat = this.materialService.getMaterial(0xb8c0c8, 'standard') as THREE.MeshStandardMaterial;
        const tapBaseGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.10, 12);
        const tap = new THREE.Mesh(tapBaseGeo, tapMat);
        // Position at one end of the long axis (the head-end), centred on
        // the short axis, sitting on the rim.
        tap.position.set(width / 2 - 0.08, height + 0.05, 0);
        group.add(tap);

        const spoutGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.14, 10);
        const spout = new THREE.Mesh(spoutGeo, tapMat);
        spout.rotation.z = Math.PI / 2;
        spout.position.set(width / 2 - 0.16, height + 0.10, 0);
        group.add(spout);

        return group;
    }
}
