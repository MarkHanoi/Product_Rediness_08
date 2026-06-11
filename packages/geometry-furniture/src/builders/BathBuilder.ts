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

        // §63.3 (2026-06-11) — REAL tub RECESS. The pre-fix bath rendered the tub
        // as a closed solid block (an outer shell + a solid inner box just below
        // the rim) — no open well. Founder defect: "the bath renders as a solid
        // block (no tub recess)". We now build a proper OPEN basin: a rim frame
        // (four wall strips around the top) + four inner side walls + a floor that
        // sits well below the rim, leaving a genuine recessed cavity you can see
        // into. Dimensions: rim ~150 mm wide, inner well inset ~90 mm from the
        // outer shell, well floor at ~120 mm above the unit floor (water-line look).
        const RIM_W = 0.15;                  // rim band width (top lip)
        const WELL_INSET = 0.09;             // inner well inset from the outer shell
        const WALL_THK = 0.04;               // ceramic wall thickness
        const RIM_DROP = 0.02;               // rim top is 20 mm below the outer top
        const FLOOR_Y = 0.12;                // well floor height above the unit base

        // ── Outer shell (white enamelled ceramic) ─────────────────────────
        // Shared / cached → clone so opacity tweaks below don't leak.
        const baseMat = this.materialService.getMaterial(0xfafaf6, 'standard') as THREE.MeshStandardMaterial;
        const shellMat = baseMat.clone();
        shellMat.roughness = 0.25;
        shellMat.metalness = 0.05;

        // Outer body: a solid pedestal up to the WELL FLOOR, then four rim walls
        // form the open basin above. (A box up to FLOOR_Y gives the unit its mass +
        // a solid underside; the open well sits on top of it.)
        const pedestalGeo = new THREE.BoxGeometry(width, FLOOR_Y, length);
        const pedestal = new THREE.Mesh(pedestalGeo, shellMat);
        pedestal.position.set(0, FLOOR_Y / 2, 0);
        pedestal.castShadow = true;
        pedestal.receiveShadow = true;
        group.add(pedestal);

        // Inner well dimensions (the cavity).
        const innerW = Math.max(0.2, width  - 2 * WELL_INSET);
        const innerL = Math.max(0.2, length - 2 * WELL_INSET);
        const rimTopY = height - RIM_DROP;          // rim top surface
        const wallH = rimTopY - FLOOR_Y;            // height of the basin side walls

        // Four basin side walls (the surround between the well floor and the rim).
        // Built as a frame of four strips so the centre stays OPEN (a real recess).
        const wallMat = shellMat;
        const sideLongGeo = new THREE.BoxGeometry(width, wallH, WALL_THK);   // front + back
        const frontWall = new THREE.Mesh(sideLongGeo, wallMat);
        frontWall.position.set(0, FLOOR_Y + wallH / 2,  innerL / 2 + WALL_THK / 2);
        group.add(frontWall);
        const backWall = new THREE.Mesh(sideLongGeo, wallMat);
        backWall.position.set(0, FLOOR_Y + wallH / 2, -innerL / 2 - WALL_THK / 2);
        group.add(backWall);
        const sideShortGeo = new THREE.BoxGeometry(WALL_THK, wallH, innerL + 2 * WALL_THK); // left + right
        const leftWall = new THREE.Mesh(sideShortGeo, wallMat);
        leftWall.position.set(-innerW / 2 - WALL_THK / 2, FLOOR_Y + wallH / 2, 0);
        group.add(leftWall);
        const rightWall = new THREE.Mesh(sideShortGeo, wallMat);
        rightWall.position.set( innerW / 2 + WALL_THK / 2, FLOOR_Y + wallH / 2, 0);
        group.add(rightWall);

        // Flat top RIM band (the lip you sit on) — a thin frame capping the walls.
        const rimMat = shellMat;
        const RIM_THK = 0.03;
        const rimLongGeo = new THREE.BoxGeometry(width, RIM_THK, RIM_W);
        const rimFront = new THREE.Mesh(rimLongGeo, rimMat);
        rimFront.position.set(0, rimTopY - RIM_THK / 2,  length / 2 - RIM_W / 2);
        group.add(rimFront);
        const rimBack = new THREE.Mesh(rimLongGeo, rimMat);
        rimBack.position.set(0, rimTopY - RIM_THK / 2, -length / 2 + RIM_W / 2);
        group.add(rimBack);
        const rimShortGeo = new THREE.BoxGeometry(RIM_W, RIM_THK, length - 2 * RIM_W);
        const rimLeft = new THREE.Mesh(rimShortGeo, rimMat);
        rimLeft.position.set(-width / 2 + RIM_W / 2, rimTopY - RIM_THK / 2, 0);
        group.add(rimLeft);
        const rimRight = new THREE.Mesh(rimShortGeo, rimMat);
        rimRight.position.set( width / 2 - RIM_W / 2, rimTopY - RIM_THK / 2, 0);
        group.add(rimRight);

        // ── Inner basin FLOOR (slightly darker, the bottom of the open well) ──
        const innerMat = baseMat.clone();
        innerMat.color = new THREE.Color(0xe8e6dc);
        innerMat.roughness = 0.45;
        innerMat.metalness = 0.0;
        const floorGeo = new THREE.BoxGeometry(innerW, 0.02, innerL);
        const wellFloor = new THREE.Mesh(floorGeo, innerMat);
        // Top of the well floor sits at FLOOR_Y → recessed (rimTopY − FLOOR_Y) below the rim.
        wellFloor.position.set(0, FLOOR_Y - 0.01, 0);
        wellFloor.receiveShadow = true;
        group.add(wellFloor);

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
