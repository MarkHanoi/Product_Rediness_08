// F1.8 (2026-05-30) — Utility / laundry primitives.
//
// Five elements for the S5 activity system + utility-room archetype:
//
//   • WashingMachineStandaloneBuilder — front-loader, 600 × 600 × 850 mm
//     standalone (distinct from kitchen-mounted `washing_machine_dark`/
//     `washing_machine_white` which are KitchenApplianceType variants).
//     White body + circular door porthole + control panel strip.
//
//   • TumbleDryerBuilder — same footprint as washing machine (stackable
//     pair) with a flat metal grille door instead of a porthole. White
//     body + control panel + flexible vent stub at the back.
//
//   • UtilityCabinetBuilder — tall narrow storage cabinet (600 × 400 ×
//     2000 mm), three internal shelves implied by horizontal grooves on
//     the door front + handles top-left + middle-left.
//
//   • UtilitySinkBuilder — small deep stainless sink (500 × 350 × 850
//     mm), distinct from the kitchen sink (which lives in
//     kitchen_straight's appliances). Recessed basin + chrome tap.
//
//   • DryingRackBuilder — wall-mounted accordion clothes rack at 1.60 m
//     baseOffset (above WM/dryer). 4 horizontal bars + 2 wall-anchor
//     brackets. Folds into the wall when not in use (modelled extended).

import * as THREE from '@pryzm/renderer-three/three';
import { IFurnitureBuilder } from './IFurnitureBuilder';
import { FurnitureData } from '../FurnitureTypes';
import { MaterialService } from '../MaterialService';

const tagEdge30 = (g: THREE.Group): void => {
    g.traverse(o => {
        if ((o as THREE.Mesh).isMesh) {
            o.userData = { ...o.userData, edgeAngleDeg: 30 };
        }
    });
};

// ── Washing machine ─────────────────────────────────────────────────────────

export class WashingMachineStandaloneBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const W = data.width  || 0.60;
        const L = data.length || 0.60;
        const H = data.height || 0.85;

        const bodyMat = this.materialService.getMaterial(0xf5f5f5, 'standard') as THREE.MeshStandardMaterial;
        const accentMat = this.materialService.getMaterial(0x2a2a2a, 'standard') as THREE.MeshStandardMaterial;
        const glassMat = new THREE.MeshStandardMaterial({
            color: 0x1a2228,
            roughness: 0.1,
            metalness: 0.2,
            transparent: true,
            opacity: 0.7,
        });

        // Main body
        const bodyGeo = new THREE.BoxGeometry(W, H, L);
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.set(0, H / 2, 0);
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);

        // Control panel strip — 8 cm band at the top front.
        const panelH = 0.08;
        const panelGeo = new THREE.BoxGeometry(W * 0.92, panelH, 0.005);
        const panel = new THREE.Mesh(panelGeo, accentMat);
        panel.position.set(0, H - panelH / 2 - 0.02, L / 2 + 0.003);
        group.add(panel);

        // Circular porthole door — recessed disc on the front.
        const portR = Math.min(W, H - panelH) * 0.32;
        const portGeo = new THREE.CylinderGeometry(portR, portR, 0.02, 28);
        const port = new THREE.Mesh(portGeo, glassMat);
        port.rotation.x = Math.PI / 2;
        port.position.set(0, H * 0.42, L / 2 + 0.005);
        group.add(port);

        // Chrome bezel ring around the porthole.
        const bezelMat = this.materialService.getMaterial(0xb8c0c8, 'standard') as THREE.MeshStandardMaterial;
        const bezelGeo = new THREE.TorusGeometry(portR + 0.015, 0.012, 8, 28);
        const bezel = new THREE.Mesh(bezelGeo, bezelMat);
        bezel.position.set(0, H * 0.42, L / 2 + 0.01);
        group.add(bezel);

        tagEdge30(group);
        return group;
    }
}

// ── Tumble dryer ────────────────────────────────────────────────────────────

export class TumbleDryerBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const W = data.width  || 0.60;
        const L = data.length || 0.60;
        const H = data.height || 0.85;

        const bodyMat = this.materialService.getMaterial(0xf5f5f5, 'standard') as THREE.MeshStandardMaterial;
        const accentMat = this.materialService.getMaterial(0x2a2a2a, 'standard') as THREE.MeshStandardMaterial;
        const grilleMat = this.materialService.getMaterial(0x707880, 'standard') as THREE.MeshStandardMaterial;

        // Main body
        const bodyGeo = new THREE.BoxGeometry(W, H, L);
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.set(0, H / 2, 0);
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);

        // Control panel strip
        const panelH = 0.08;
        const panelGeo = new THREE.BoxGeometry(W * 0.92, panelH, 0.005);
        const panel = new THREE.Mesh(panelGeo, accentMat);
        panel.position.set(0, H - panelH / 2 - 0.02, L / 2 + 0.003);
        group.add(panel);

        // Flat door (square grille, no porthole — dryer signature).
        const doorW = W * 0.82;
        const doorH = (H - panelH) * 0.78;
        const doorGeo = new THREE.BoxGeometry(doorW, doorH, 0.012);
        const door = new THREE.Mesh(doorGeo, grilleMat);
        door.position.set(0, doorH / 2 + 0.06, L / 2 + 0.008);
        group.add(door);

        // Vent stub at the back (signature dryer feature)
        const ventR = 0.05;
        const ventGeo = new THREE.CylinderGeometry(ventR, ventR, 0.06, 16);
        const vent = new THREE.Mesh(ventGeo, accentMat);
        vent.rotation.x = Math.PI / 2;
        vent.position.set(W * 0.3, H * 0.85, -L / 2 - 0.03);
        group.add(vent);

        tagEdge30(group);
        return group;
    }
}

// ── Utility cabinet ─────────────────────────────────────────────────────────

export class UtilityCabinetBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const W = data.width  || 0.60;
        const L = data.length || 0.40;
        const H = data.height || 2.00;

        const bodyMat = this.materialService.getMaterial(0xe8e2d5, 'standard') as THREE.MeshStandardMaterial;
        const doorMat = this.materialService.getMaterial(0xd0c8b8, 'standard') as THREE.MeshStandardMaterial;
        const handleMat = this.materialService.getMaterial(0xb8c0c8, 'standard') as THREE.MeshStandardMaterial;

        // Carcass
        const bodyGeo = new THREE.BoxGeometry(W, H, L);
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.set(0, H / 2, 0);
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);

        // Two doors front (split vertically). Slightly proud of the carcass.
        const doorW = (W - 0.02) / 2;
        const doorGeo = new THREE.BoxGeometry(doorW, H - 0.04, 0.02);
        for (const sx of [-1, 1]) {
            const door = new THREE.Mesh(doorGeo, doorMat);
            door.position.set(sx * (W / 4), H / 2, L / 2 + 0.01);
            group.add(door);

            // Vertical handle at the inner edge.
            const handleGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.20, 12);
            const handle = new THREE.Mesh(handleGeo, handleMat);
            handle.position.set(sx * 0.02, H / 2 + 0.30, L / 2 + 0.025);
            group.add(handle);
        }

        tagEdge30(group);
        return group;
    }
}

// ── Utility sink ────────────────────────────────────────────────────────────

export class UtilitySinkBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const W = data.width  || 0.50;
        const L = data.length || 0.35;
        const H = data.height || 0.85;

        // Stainless steel basin body.
        const steelMat = this.materialService.getMaterial(0xb8c0c8, 'standard') as THREE.MeshStandardMaterial;
        const tapMat = this.materialService.getMaterial(0x9aa4ae, 'standard') as THREE.MeshStandardMaterial;

        // Pedestal stand (simple two-leg open frame).
        const legGeo = new THREE.BoxGeometry(0.025, H - 0.10, 0.025);
        for (const sx of [-1, 1]) {
            const leg = new THREE.Mesh(legGeo, steelMat);
            leg.position.set(sx * (W / 2 - 0.04), (H - 0.10) / 2, 0);
            group.add(leg);
        }

        // Basin shell — deep stainless box at top.
        const basinH = 0.18;
        const basinGeo = new THREE.BoxGeometry(W, basinH, L);
        const basin = new THREE.Mesh(basinGeo, steelMat);
        basin.position.set(0, H - basinH / 2, 0);
        basin.castShadow = true;
        basin.receiveShadow = true;
        group.add(basin);

        // Recessed inner well.
        const innerW = W - 0.06;
        const innerL = L - 0.06;
        const innerH = 0.14;
        const innerMat = this.materialService.getMaterial(0xa0a8b0, 'standard') as THREE.MeshStandardMaterial;
        const innerGeo = new THREE.BoxGeometry(innerW, innerH, innerL);
        const inner = new THREE.Mesh(innerGeo, innerMat);
        inner.position.set(0, H - innerH / 2 - 0.01, 0);
        group.add(inner);

        // Tall gooseneck tap at the back centre.
        const tapBaseGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.06, 12);
        const tapBase = new THREE.Mesh(tapBaseGeo, tapMat);
        tapBase.position.set(0, H + 0.03, -L / 2 + 0.05);
        group.add(tapBase);

        const tapRiserGeo = new THREE.CylinderGeometry(0.013, 0.013, 0.22, 10);
        const tapRiser = new THREE.Mesh(tapRiserGeo, tapMat);
        tapRiser.position.set(0, H + 0.17, -L / 2 + 0.05);
        group.add(tapRiser);

        const spoutGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.18, 10);
        const spout = new THREE.Mesh(spoutGeo, tapMat);
        spout.rotation.x = Math.PI / 2;
        spout.position.set(0, H + 0.28, -L / 2 + 0.13);
        group.add(spout);

        tagEdge30(group);
        return group;
    }
}

// ── Drying rack ─────────────────────────────────────────────────────────────

export class DryingRackBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const W = data.width  || 0.80;
        const L = data.length || 0.40;     // extension out from the wall
        // H (rack bar height) sized inline below — kept noted for symmetry.
        const BASE = data.baseOffset ?? 1.60;

        const mat = this.materialService.getMaterial(0xc0c8d0, 'standard') as THREE.MeshStandardMaterial;
        const bracketMat = this.materialService.getMaterial(0x707880, 'standard') as THREE.MeshStandardMaterial;

        // Two wall-anchor brackets (left + right of the rack).
        const BRACKET_W = 0.04, BRACKET_H = 0.18;
        const bracketGeo = new THREE.BoxGeometry(BRACKET_W, BRACKET_H, 0.06);
        for (const sx of [-1, 1]) {
            const b = new THREE.Mesh(bracketGeo, bracketMat);
            b.position.set(sx * (W / 2 - BRACKET_W / 2), BASE, 0.03);
            group.add(b);
        }

        // Four horizontal bars (extended position — accordion folded out).
        const barR = 0.008;
        const barGeo = new THREE.CylinderGeometry(barR, barR, W - BRACKET_W * 2, 10);
        for (let i = 0; i < 4; i++) {
            const t = (i + 1) / 5;        // evenly spaced; bracket span ~14 cm vertical
            const bar = new THREE.Mesh(barGeo, mat);
            bar.rotation.z = Math.PI / 2;
            bar.position.set(0, BASE + (BRACKET_H / 2) - BRACKET_H * t, L - 0.04);
            group.add(bar);
        }

        // Two diagonal support arms from bracket → far end of the rack.
        const armR = 0.006;
        const armLen = Math.hypot(L - 0.06, 0.08);
        const armGeo = new THREE.CylinderGeometry(armR, armR, armLen, 8);
        const armAngle = Math.atan2(0.08, L - 0.06);
        for (const sx of [-1, 1]) {
            const arm = new THREE.Mesh(armGeo, mat);
            arm.rotation.x = Math.PI / 2 - armAngle;
            arm.position.set(sx * (W / 2 - BRACKET_W / 2), BASE - 0.04, (L - 0.06) / 2 + 0.04);
            group.add(arm);
        }

        tagEdge30(group);
        return group;
    }
}
