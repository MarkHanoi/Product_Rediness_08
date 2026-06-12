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
        const width  = data.width  || 1.7;    // along the wall
        const length = data.length || 0.75;   // away from the wall (UK bath ≈ 0.75 m)
        const height = data.height || 0.55;   // top rim above floor (≈ 0.55 m)

        // §63.5 (2026-06-12) — proper BATHTUB geometry. The §63.3 pass opened the
        // tub well but it still read as a "thin shallow trough" in the 3D view
        // (founder #10a "bath geometry not good"). This pass makes it a sound
        // bathtub:
        //   • a rounded-rectangle OUTER SHELL (chamfered corner posts so it isn't a
        //     hard box) with a proper APRON FRONT skirting to the floor,
        //   • an inset INNER BASIN whose well floor is offset DOWN (deep recess)
        //     and INWARD (the basin is meaningfully smaller than the rim — you see
        //     a real bowl, not a flush trough),
        //   • realistic proportions (~1.7 × 0.75 × 0.55 m).
        // Still a clean parametric mesh: a frame of strips around an open well +
        // chamfer posts + an apron skirt. No CSG, deterministic.
        const RIM_W = 0.06;                  // narrow flat top rim (the lip)
        const WALL_THK = 0.05;               // ceramic wall thickness
        const RIM_DROP = 0.015;              // rim top is 15 mm below the outer top
        const FLOOR_Y = 0.14;                // well floor height above the unit base (deep recess)
        const BASIN_INSET = 0.14;            // inner basin inset INWARD from the outer shell
        const CHAMFER = 0.06;                // rounded-corner post radius

        // ── Materials (white enamelled ceramic) ───────────────────────────
        // Shared / cached → clone so the per-instance tweaks below don't leak.
        const baseMat = this.materialService.getMaterial(0xfafaf6, 'standard') as THREE.MeshStandardMaterial;
        const shellMat = baseMat.clone();
        shellMat.roughness = 0.18;           // enamel sheen
        shellMat.metalness = 0.05;

        const rimTopY = height - RIM_DROP;          // rim top surface

        // ── Apron skirt (the visible bathtub front + sides, floor → just under rim).
        // Four thin outer panels give the tub its solid bathtub silhouette and hide
        // the open underside — this is what makes it read as a bath, not a trough.
        const APRON_H = rimTopY - 0.02;             // skirt rises almost to the rim
        const apronLongGeo = new THREE.BoxGeometry(width, APRON_H, WALL_THK);
        const apronFront = new THREE.Mesh(apronLongGeo, shellMat);
        apronFront.position.set(0, APRON_H / 2,  length / 2 - WALL_THK / 2);
        apronFront.castShadow = true; apronFront.receiveShadow = true;
        group.add(apronFront);
        const apronBack = new THREE.Mesh(apronLongGeo, shellMat);
        apronBack.position.set(0, APRON_H / 2, -length / 2 + WALL_THK / 2);
        group.add(apronBack);
        const apronShortGeo = new THREE.BoxGeometry(WALL_THK, APRON_H, length - 2 * WALL_THK);
        const apronLeft = new THREE.Mesh(apronShortGeo, shellMat);
        apronLeft.position.set(-width / 2 + WALL_THK / 2, APRON_H / 2, 0);
        group.add(apronLeft);
        const apronRight = new THREE.Mesh(apronShortGeo, shellMat);
        apronRight.position.set( width / 2 - WALL_THK / 2, APRON_H / 2, 0);
        group.add(apronRight);

        // ── Rounded corner posts — vertical chamfer cylinders at the four corners
        // so the outer shell reads as a soft rounded-rectangle rather than a hard box.
        const postGeo = new THREE.CylinderGeometry(CHAMFER, CHAMFER, APRON_H, 12, 1, false, 0, Math.PI / 2);
        const cornerDefs: [number, number, number][] = [
            [ width / 2 - CHAMFER,  length / 2 - CHAMFER, 0],
            [-width / 2 + CHAMFER,  length / 2 - CHAMFER, Math.PI / 2],
            [-width / 2 + CHAMFER, -length / 2 + CHAMFER, Math.PI],
            [ width / 2 - CHAMFER, -length / 2 + CHAMFER, -Math.PI / 2],
        ];
        for (const [px, pz, ry] of cornerDefs) {
            const post = new THREE.Mesh(postGeo, shellMat);
            post.position.set(px, APRON_H / 2, pz);
            post.rotation.y = ry;
            post.castShadow = true;
            group.add(post);
        }

        // Inner basin dimensions — inset INWARD from the outer shell so the bowl is
        // visibly smaller than the footprint (a real basin, not a flush well).
        const innerW = Math.max(0.3, width  - 2 * BASIN_INSET);
        const innerL = Math.max(0.3, length - 2 * BASIN_INSET);
        const wallH = rimTopY - FLOOR_Y;            // height of the basin side walls

        // Four basin side walls (the surround between the well floor and the rim).
        // Built as a frame of four strips so the centre stays OPEN (a real recess).
        const sideLongGeo = new THREE.BoxGeometry(innerW + 2 * WALL_THK, wallH, WALL_THK);
        const frontWall = new THREE.Mesh(sideLongGeo, shellMat);
        frontWall.position.set(0, FLOOR_Y + wallH / 2,  innerL / 2 + WALL_THK / 2);
        group.add(frontWall);
        const backWall = new THREE.Mesh(sideLongGeo, shellMat);
        backWall.position.set(0, FLOOR_Y + wallH / 2, -innerL / 2 - WALL_THK / 2);
        group.add(backWall);
        const sideShortGeo = new THREE.BoxGeometry(WALL_THK, wallH, innerL + 2 * WALL_THK);
        const leftWall = new THREE.Mesh(sideShortGeo, shellMat);
        leftWall.position.set(-innerW / 2 - WALL_THK / 2, FLOOR_Y + wallH / 2, 0);
        group.add(leftWall);
        const rightWall = new THREE.Mesh(sideShortGeo, shellMat);
        rightWall.position.set( innerW / 2 + WALL_THK / 2, FLOOR_Y + wallH / 2, 0);
        group.add(rightWall);

        // Flat top RIM band (the lip you sit on) — a thin frame capping the walls,
        // wrapping the full outer footprint so the basin rim ↔ outer edge is solid.
        const RIM_THK = 0.025;
        const rimLongGeo = new THREE.BoxGeometry(width, RIM_THK, RIM_W);
        const rimFront = new THREE.Mesh(rimLongGeo, shellMat);
        rimFront.position.set(0, rimTopY - RIM_THK / 2,  length / 2 - RIM_W / 2);
        group.add(rimFront);
        const rimBack = new THREE.Mesh(rimLongGeo, shellMat);
        rimBack.position.set(0, rimTopY - RIM_THK / 2, -length / 2 + RIM_W / 2);
        group.add(rimBack);
        // Side rim bands wide enough to span the gap from outer edge to the basin wall.
        const sideRimW = (width - innerW) / 2;
        const rimShortGeo = new THREE.BoxGeometry(sideRimW, RIM_THK, length - 2 * RIM_W);
        const rimLeft = new THREE.Mesh(rimShortGeo, shellMat);
        rimLeft.position.set(-width / 2 + sideRimW / 2, rimTopY - RIM_THK / 2, 0);
        group.add(rimLeft);
        const rimRight = new THREE.Mesh(rimShortGeo, shellMat);
        rimRight.position.set( width / 2 - sideRimW / 2, rimTopY - RIM_THK / 2, 0);
        group.add(rimRight);

        // ── Inner basin FLOOR (slightly darker, the bottom of the open well),
        // inset further inward so the basin floor < basin rim (the bowl tapers).
        const innerMat = baseMat.clone();
        innerMat.color = new THREE.Color(0xeceae0);
        innerMat.roughness = 0.40;
        innerMat.metalness = 0.0;
        const floorW = Math.max(0.2, innerW - 0.06);
        const floorL = Math.max(0.2, innerL - 0.06);
        const floorGeo = new THREE.BoxGeometry(floorW, 0.02, floorL);
        const wellFloor = new THREE.Mesh(floorGeo, innerMat);
        wellFloor.position.set(0, FLOOR_Y - 0.01, 0);
        wellFloor.receiveShadow = true;
        group.add(wellFloor);

        // Chrome drain at the basin floor centre.
        const tapMat = this.materialService.getMaterial(0xb8c0c8, 'standard') as THREE.MeshStandardMaterial;
        const drainGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.01, 14);
        const drain = new THREE.Mesh(drainGeo, tapMat);
        drain.position.set(0, FLOOR_Y + 0.005, 0);
        group.add(drain);

        // ── Tap fixture (chrome cylinder + spout) at the centre-back end ─
        const tapBaseGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.10, 12);
        const tap = new THREE.Mesh(tapBaseGeo, tapMat);
        // Position at one end of the long axis (the head-end), centred on
        // the short axis, sitting on the rim.
        tap.position.set(width / 2 - 0.08, rimTopY + 0.05, 0);
        group.add(tap);

        const spoutGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.14, 10);
        const spout = new THREE.Mesh(spoutGeo, tapMat);
        spout.rotation.z = Math.PI / 2;
        spout.position.set(width / 2 - 0.16, rimTopY + 0.10, 0);
        group.add(spout);

        return group;
    }
}
