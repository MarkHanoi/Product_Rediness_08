import * as THREE from '@pryzm/renderer-three/three';
import { IFurnitureBuilder } from './IFurnitureBuilder';
import { FurnitureData } from '../FurnitureTypes';

/**
 * DiningTableMarbleBrassBuilder (LOD 350)
 *
 * Round Calacatta marble top on a single conical brass/gold pedestal base.
 * Surrounded by chairs whose silhouette mirrors the Oak Solid chair
 * (curved back panel, splayed posts) but executed in a brass metal frame
 * with textile seat and backrest.
 *
 * Follows 01-BIM §1.1 builder isolation — no store writes,
 * no command dispatch. Pure geometry projection.
 */
export class DiningTableMarbleBrassBuilder implements IFurnitureBuilder {

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const { width, length, height } = data;

        // Round table: diameter = min(width, length); footprint stays inside the
        // declared bounding box no matter the aspect ratio the user enters.
        const diameter = Math.min(width, length);
        const radius   = diameter * 0.5;

        // ── Materials ─────────────────────────────────────────────────────────

        // Calacatta marble: warm white, low roughness, subtle clearcoat
        const marbleMat = new THREE.MeshPhysicalMaterial({
            color: 0xf5f0e8,
            roughness: 0.12,
            metalness: 0.0,
            clearcoat: 0.65,
            clearcoatRoughness: 0.08,
        });

        // Marble vein: warm grey-beige with slight warmth
        const veinMat = new THREE.MeshStandardMaterial({
            color: 0xc8beae,
            roughness: 0.25,
            metalness: 0.0,
        });

        // Brushed gold/brass: high metalness, low roughness, rich golden tint
        const brassMat = new THREE.MeshStandardMaterial({
            color: 0xd6a13a,
            roughness: 0.22,
            metalness: 1.0,
            emissive: 0x3a2a08,
            emissiveIntensity: 0.18,
        });

        // Slightly darker brass for the base plinth (reads as a cast shadow)
        const darkBrassMat = new THREE.MeshStandardMaterial({
            color: 0xb88424,
            roughness: 0.30,
            metalness: 0.98,
        });

        // Chair frame: warm brass, slightly darker than table base
        const chairBrassMat = new THREE.MeshStandardMaterial({
            color: 0xb8842a,
            roughness: 0.30,
            metalness: 0.92,
        });

        // Chair textile seat — warm light grey wool/boucle
        const textileSeatMat = new THREE.MeshStandardMaterial({
            color: 0xb8b1a4,
            roughness: 0.92,
            metalness: 0.0,
        });

        // Chair textile back — same fabric, marginally lighter for separation
        const textileBackMat = new THREE.MeshStandardMaterial({
            color: 0xc4bdaf,
            roughness: 0.92,
            metalness: 0.0,
            side: THREE.DoubleSide,
        });

        // ── Round Marble Top ──────────────────────────────────────────────────

        const topThick = 0.045;
        const topGeo = new THREE.CylinderGeometry(radius, radius, topThick, 64);
        const topMesh = new THREE.Mesh(topGeo, marbleMat);
        topMesh.position.y = height - topThick * 0.5;
        group.add(topMesh);

        // Soft chamfer rim — slightly larger disc just under the top
        const rimGeo = new THREE.CylinderGeometry(radius - 0.004, radius - 0.004, 0.012, 64);
        const rimMesh = new THREE.Mesh(rimGeo, marbleMat);
        rimMesh.position.y = height - topThick - 0.006;
        group.add(rimMesh);

        // ── Marble Veining (shallow strips on top surface) ────────────────────

        const veinCount = 7;
        for (let i = 0; i < veinCount; i++) {
            const t = i / (veinCount - 1);
            const veinLen = diameter * (0.55 + (i % 3) * 0.10);
            const veinGeo = new THREE.BoxGeometry(veinLen, 0.0025, 0.006 + (i % 2) * 0.004);
            const vein = new THREE.Mesh(veinGeo, veinMat);
            vein.position.set(
                (t - 0.5) * diameter * 0.25,
                height + 0.0005,
                (t - 0.5) * diameter * 0.55,
            );
            vein.rotation.y = -0.32 + (i % 3) * 0.16;
            group.add(vein);
        }

        // ── Conical Brass / Gold Pedestal ─────────────────────────────────────
        // Inverted cone: wide at the floor, narrowing toward the top — matches
        // the reference image (West Elm-style "Silhouette" pedestal).

        const baseClearance = topThick + 0.012;            // gap under the top
        const baseHeight    = height - baseClearance;       // pedestal height
        const baseTopR      = radius * 0.18;                // narrow neck under top
        const baseBotR      = radius * 0.55;                // wide foot ring

        const baseGeo = new THREE.CylinderGeometry(baseTopR, baseBotR, baseHeight, 48);
        const baseMesh = new THREE.Mesh(baseGeo, brassMat);
        baseMesh.position.y = baseHeight * 0.5;
        group.add(baseMesh);

        // Foot plinth: thin darker brass disc to ground the cone visually
        const plinthGeo = new THREE.CylinderGeometry(baseBotR + 0.012, baseBotR + 0.018, 0.022, 48);
        const plinth = new THREE.Mesh(plinthGeo, darkBrassMat);
        plinth.position.y = 0.011;
        group.add(plinth);

        // Top collar: brass disc that bridges the narrow neck to the marble underside
        const collarGeo = new THREE.CylinderGeometry(baseTopR + 0.008, baseTopR + 0.002, 0.012, 36);
        const collar = new THREE.Mesh(collarGeo, brassMat);
        collar.position.y = baseHeight + 0.006;
        group.add(collar);

        // ── Surrounding Chairs ────────────────────────────────────────────────
        // Place chairs evenly around the round table.

        const chairW   = 0.46;
        const chairD   = 0.50;
        const chairH   = 0.86;
        const padding  = 0.18; // gap between table edge and chair seat front

        // Rough perimeter heuristic: ~one chair per 0.85 m of circumference
        const circumference = 2 * Math.PI * radius;
        const numChairs = Math.max(4, Math.min(8, Math.round(circumference / 0.85)));

        const chairOrbit = radius + padding + chairD * 0.5;

        for (let i = 0; i < numChairs; i++) {
            const angle = (i / numChairs) * Math.PI * 2;
            const x = Math.sin(angle) * chairOrbit;
            const z = Math.cos(angle) * chairOrbit;

            const chair = this._buildOakStyleMetalChair(
                chairBrassMat, textileSeatMat, textileBackMat,
                chairW, chairD, chairH,
            );
            chair.position.set(x, 0, z);
            // Rotate so the chair faces the centre of the table
            chair.rotation.y = Math.atan2(x, z) + Math.PI;
            group.add(chair);
        }

        return group;
    }

    /**
     * Chair that mirrors the silhouette of the Oak Solid chair
     * (splayed legs, two rear posts, curved back panel) but built
     * with a slim brass metal frame and a textile seat + backrest.
     */
    private _buildOakStyleMetalChair(
        frameMat: THREE.Material,
        seatMat:  THREE.Material,
        backMat:  THREE.Material,
        w: number, d: number, h: number,
    ): THREE.Group {
        const g = new THREE.Group();

        const seatY   = h * 0.50;
        const legR    = 0.011;            // slim metal rod
        const postR   = 0.011;
        const seatThk = 0.055;            // padded textile cushion

        // ── Padded textile seat (slightly tilted for ergonomic look) ─────────
        const seatGeo = new THREE.BoxGeometry(w, seatThk, d * 0.92);
        const seat = new THREE.Mesh(seatGeo, seatMat);
        seat.position.set(0, seatY + seatThk * 0.5, d * 0.02);
        seat.rotation.x = 0.04;
        g.add(seat);

        // Thin brass rim under the cushion — reads as the seat pan
        const panGeo = new THREE.BoxGeometry(w + 0.006, 0.010, d * 0.92 + 0.006);
        const pan = new THREE.Mesh(panGeo, frameMat);
        pan.position.set(0, seatY + 0.005, d * 0.02);
        g.add(pan);

        // ── Two rear posts (slim brass), with slight backward lean ───────────
        const postLen = (h - seatY) + 0.04;
        const postGeo = new THREE.CylinderGeometry(postR * 0.85, postR, postLen, 12);
        const postLean = -0.10;
        [-1, 1].forEach(side => {
            const post = new THREE.Mesh(postGeo, frameMat);
            const baseZ = -d * 0.42;
            post.position.set(
                side * w * 0.44,
                seatY + postLen * 0.5 - 0.02,
                baseZ + Math.tan(-postLean) * (postLen * 0.5),
            );
            post.rotation.x = postLean;
            g.add(post);
        });

        // ── Curved textile back panel (matches Oak Solid silhouette) ─────────
        const panelW = w * 0.96;
        const panelH = h * 0.26;
        const panelTopY = h - 0.02;
        const panelArcR = w * 1.0;
        const panelTheta = panelW / panelArcR;
        const panelGeo = new THREE.CylinderGeometry(
            panelArcR, panelArcR, panelH, 20, 1, true,
            Math.PI - panelTheta * 0.5, panelTheta,
        );
        const panel = new THREE.Mesh(panelGeo, backMat);
        panel.position.set(
            0,
            panelTopY - panelH * 0.5,
            -d * 0.42 + panelArcR * Math.cos(panelTheta * 0.5),
        );
        g.add(panel);

        // ── Four splayed brass legs ──────────────────────────────────────────
        const legH = seatY;
        const legGeo = new THREE.CylinderGeometry(legR * 0.7, legR, legH, 12);
        const legPositions: ReadonlyArray<[number, number]> = [
            [ w * 0.42,  d * 0.38],
            [-w * 0.42,  d * 0.38],
            [ w * 0.42, -d * 0.38],
            [-w * 0.42, -d * 0.38],
        ];
        legPositions.forEach(([x, z]) => {
            const leg = new THREE.Mesh(legGeo, frameMat);
            leg.position.set(x, legH * 0.5, z);
            leg.rotation.z = x > 0 ? -0.09 : 0.09;
            leg.rotation.x = z > 0 ?  0.07 : -0.07;
            g.add(leg);
        });

        // ── Side stretchers between front & back legs (brass rod) ────────────
        const strR = legR * 0.55;
        const strY = legH * 0.42;
        const sideStrGeo = new THREE.CylinderGeometry(strR, strR, d * 0.74, 10);
        [-1, 1].forEach(side => {
            const s = new THREE.Mesh(sideStrGeo, frameMat);
            s.rotation.x = Math.PI / 2;
            s.position.set(side * w * 0.40, strY, 0);
            g.add(s);
        });

        return g;
    }
}
