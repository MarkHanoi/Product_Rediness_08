import * as THREE from '@pryzm/renderer-three/three';
import { IFurnitureBuilder } from './IFurnitureBuilder';
import { FurnitureData } from '../FurnitureTypes';
import { MaterialService } from '../MaterialService';

/**
 * LampBuilder
 * Creates a detailed floor lamp with tripod wooden legs and a cylindrical shade.
 * Follows BIM-ENGINE-ARCHITECTURAL-CONTRACT.
 */
export class LampBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const height = data.height || 1.6;

        // §LAMP-BEDSIDE-TABLE-LOOK (founder 2026-06-19) — a small bedside `lamp`
        // (≤0.6 m tall) renders as a glowing TABLE lamp that matches the Japanese
        // float bed's built-in bedside lamps (which the founder praised — "the
        // lights render great"): a slim dark base + stem under an EMISSIVE cream
        // conical shade + a warm point light. Larger lamps (the 1.5 m floor /
        // corner standard lamp) keep the tripod build below. This makes EVERY
        // bedside lamp — platform, walnut, and the plain `bed`'s nightstands —
        // look like the float bed's, as requested.
        if (height <= 0.6) {
            return this.buildBedsideTableLamp(group, height);
        }

        // §LAMP-FIT-FOOTPRINT (founder 2026-06-19) — the builder used to ignore
        // `width` and always draw a full floor-lamp shade (0.25 m radius = 0.5 m
        // wide) + 0.3 spread, so the small BEDSIDE lamp (0.25 m footprint, 0.45 m
        // tall) rendered at full floor-lamp scale and dwarfed the nightstand. Scale
        // every fixture by the footprint width against the standard floor lamp
        // (w = 0.35 m → fixScale 1.0, so real floor lamps are unchanged); a 0.18 m
        // bedside footprint then renders at ~half size, as requested.
        const fixScale = (data.width && data.width > 0 ? data.width : 0.35) / 0.35;

        const woodColor = 0x8b4513;
        const shadeColor = 0xf5f5dc; // Beige/Cream

        const woodMat = this.materialService.getMaterial(woodColor, 'standard');
        const shadeMat = this.materialService.getMaterial(shadeColor, 'standard');

        // 1. Tripod Legs (Crossed look)
        const legRadius = 0.015 * fixScale;
        const legHeight = height * 0.75;
        const legGeo = new THREE.CylinderGeometry(legRadius, legRadius, legHeight, 8);

        const spread = 0.3 * fixScale;
        const angle = Math.PI * 2 / 3;
        
        for (let i = 0; i < 3; i++) {
            const leg = new THREE.Mesh(legGeo, woodMat);
            const currentAngle = i * angle;
            
            // Position at bottom
            const x = Math.cos(currentAngle) * spread;
            const z = Math.sin(currentAngle) * spread;
            
            leg.position.set(x / 2, legHeight / 2, z / 2);
            
            // Tilt leg towards center
            leg.lookAt(new THREE.Vector3(0, height * 0.7, 0));
            leg.rotateX(Math.PI / 2); // Cylinder is Y-aligned, lookAt makes it Z-aligned
            
            group.add(leg);
        }

        // 2. Shade
        const shadeRadius = 0.25 * fixScale;
        const shadeHeight = 0.4 * fixScale;
        const shadeGeo = new THREE.CylinderGeometry(shadeRadius, shadeRadius, shadeHeight, 32);
        const shade = new THREE.Mesh(shadeGeo, shadeMat);
        shade.position.set(0, height - shadeHeight / 2, 0);
        group.add(shade);

        // 3. Central Pole (Top part connecting legs to shade)
        const poleGeo = new THREE.CylinderGeometry(0.01 * fixScale, 0.01 * fixScale, 0.2 * fixScale, 8);
        const pole = new THREE.Mesh(poleGeo, woodMat);
        pole.position.set(0, height - shadeHeight - 0.1 * fixScale, 0);
        group.add(pole);

        return group;
    }

    /**
     * §LAMP-BEDSIDE-TABLE-LOOK — the glowing bedside TABLE lamp, mirroring the
     * Japanese float bed's built-in lamp (BedEngine: emissive cream conical shade
     * 0xffd9a0 + dark base/stem 0x222222 + a warm point light). All dims scale
     * with `height` so it always sits proportionally on the nightstand.
     */
    private buildBedsideTableLamp(group: THREE.Group, height: number): THREE.Group {
        const baseMat = this.materialService.getMaterial(0x222222, 'standard') as THREE.MeshStandardMaterial;
        // Emissive cream shade — the "glow". Double-sided so the lit inside reads
        // through the open-ended cone, matching the float-bed lamp.
        const shadeMat = new THREE.MeshStandardMaterial({
            color:             0xfff2d6,
            emissive:          0xffd9a0,
            emissiveIntensity: 1.4,
            roughness:         0.6,
            side:              THREE.DoubleSide,
        });

        const baseH  = 0.10 * height;
        const stemH  = 0.42 * height;
        const shadeH = 0.48 * height;                 // base + stem + shade = height
        const baseR  = 0.16 * height;
        const stemR  = 0.03 * height;
        const shadeRBot = 0.34 * height;
        const shadeRTop = 0.22 * height;

        // 1. Weighted base.
        const base = new THREE.Mesh(new THREE.CylinderGeometry(baseR * 0.85, baseR, baseH, 20), baseMat);
        base.position.set(0, baseH / 2, 0);
        group.add(base);

        // 2. Slim stem.
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(stemR, stemR, stemH, 12), baseMat);
        stem.position.set(0, baseH + stemH / 2, 0);
        group.add(stem);

        // 3. Emissive conical shade (open-ended, like the float-bed lamp).
        const shade = new THREE.Mesh(
            new THREE.CylinderGeometry(shadeRTop, shadeRBot, shadeH, 24, 1, true),
            shadeMat,
        );
        shade.position.set(0, baseH + stemH + shadeH / 2, 0);
        group.add(shade);

        // 4. Warm point light at the bulb — the actual glow spill onto the wall.
        //    Modest intensity + short range so a roomful of bedside lamps stays
        //    cheap (the float bed uses the same trick).
        const light = new THREE.PointLight(0xffd9a0, 0.5, 2.4, 2);
        light.position.set(0, baseH + stemH + shadeH * 0.4, 0);
        light.userData.role = 'lamp_light';
        group.add(light);

        return group;
    }
}
