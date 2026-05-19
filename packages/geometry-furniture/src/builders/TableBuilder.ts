import * as THREE from '@pryzm/renderer-three/three';
import { IFurnitureBuilder } from './IFurnitureBuilder';
import { FurnitureData } from '../FurnitureTypes';
import { MaterialService } from '../MaterialService';

export class TableBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        if (data.furnitureType === 'table_marble_cone') return this.buildMarbleCone(data);
        if (data.furnitureType === 'table_glass_wood_cylinder') return this.buildGlassWoodCylinder(data);
        if (data.furnitureType === 'table_wood_double_conic') return this.buildWoodDoubleConic(data);
        if (data.furnitureType === 'table_wood_4leg') return this.buildWoodFourLeg(data);
        if (data.furnitureType === 'table_ceramic_curve') return this.buildCeramicCurve(data);

        const group = new THREE.Group();
        const width = data.width;
        const length = data.length;
        const height = data.height;

        let color = data.color ? parseInt(data.color.replace('#', '0x')) : 0x8b4513;
        let opacity = 1.0;
        let transparent = false;
        if (!data.color) {
            if (data.material === 'metal') color = 0x707070;
            if (data.material === 'glass') {
                color = 0xadd8e6;
                opacity = 0.5;
                transparent = true;
            }
        }

        // For glass, we need a unique material (can't easily cache due to transparency)
        let mat: THREE.Material;
        let legMat: THREE.Material;

        if (data.material === 'glass') {
            mat = new THREE.MeshStandardMaterial({ color, opacity, transparent, roughness: 0.2, metalness: 0.5 });
            legMat = new THREE.MeshStandardMaterial({ color: 0x707070 });
        } else {
            mat = this.materialService.getMaterial(color, 'standard') as THREE.MeshStandardMaterial;
            legMat = this.materialService.getMaterial(color, 'standard');
        }

        // Table top
        const topGeo = new THREE.BoxGeometry(width, 0.05, length);
        const top = new THREE.Mesh(topGeo, mat);
        top.position.set(0, height, 0);
        group.add(top);

        // Legs
        const legSize = 0.05;
        const legGeo = new THREE.BoxGeometry(legSize, height, legSize);

        const offsetW = width / 2 - 0.1;
        const offsetL = length / 2 - 0.1;
        const legPositions = [
            [offsetW, height / 2, offsetL], 
            [-offsetW, height / 2, offsetL], 
            [offsetW, height / 2, -offsetL], 
            [-offsetW, height / 2, -offsetL]
        ];
        legPositions.forEach(pos => {
            const leg = new THREE.Mesh(legGeo, legMat);
            leg.position.set(pos[0], pos[1], pos[2]);
            group.add(leg);
        });

        return group;
    }

    private buildMarbleCone(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const radius = Math.max(data.width, data.length) * 0.5;
        const topMat = new THREE.MeshPhysicalMaterial({ color: 0xf4f1ea, roughness: 0.22, metalness: 0.0, clearcoat: 0.45, clearcoatRoughness: 0.18 });
        const veinMat = new THREE.MeshStandardMaterial({ color: 0xb7b1aa, roughness: 0.35 });
        const metalMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.26, metalness: 0.86 });

        const top = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.075, 72), topMat);
        top.position.y = data.height;
        group.add(top);

        for (let i = 0; i < 9; i++) {
            const vein = new THREE.Mesh(new THREE.BoxGeometry(radius * 1.25, 0.004, 0.006), veinMat);
            const angle = (i / 9) * Math.PI;
            vein.position.set(Math.cos(angle) * radius * 0.08, data.height + 0.041, Math.sin(angle * 1.7) * radius * 0.12);
            vein.rotation.y = angle + 0.35;
            group.add(vein);
        }

        const base = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.34, radius * 0.16, data.height - 0.04, 72), metalMat);
        base.position.y = (data.height - 0.04) * 0.5;
        group.add(base);

        const foot = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.32, radius * 0.32, 0.035, 72), metalMat);
        foot.position.y = 0.018;
        group.add(foot);
        return group;
    }

    private buildGlassWoodCylinder(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const radius = Math.max(data.width, data.length) * 0.5;
        const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x8b5e34, roughness: 0.08, metalness: 0.0, transparent: true, opacity: 0.42, transmission: 0.45, thickness: 0.035 });
        const woodMat = new THREE.MeshStandardMaterial({ color: 0x70421f, roughness: 0.52, metalness: 0.02 });
        const darkWoodMat = new THREE.MeshStandardMaterial({ color: 0x4b2814, roughness: 0.6 });

        const top = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.055, 72), glassMat);
        top.position.y = data.height;
        group.add(top);

        for (let i = 0; i < 28; i++) {
            const rib = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.014, radius * 1.55), glassMat);
            rib.position.y = data.height + 0.036;
            rib.rotation.y = (i / 28) * Math.PI;
            group.add(rib);
        }

        const baseRadius = radius * 0.27;
        const base = new THREE.Mesh(new THREE.CylinderGeometry(baseRadius, baseRadius, data.height - 0.04, 48), woodMat);
        base.position.y = (data.height - 0.04) * 0.5;
        group.add(base);

        for (let i = 0; i < 18; i++) {
            const groove = new THREE.Mesh(new THREE.BoxGeometry(0.012, data.height - 0.12, 0.018), darkWoodMat);
            const a = (i / 18) * Math.PI * 2;
            groove.position.set(Math.cos(a) * (baseRadius + 0.004), data.height * 0.48, Math.sin(a) * (baseRadius + 0.004));
            groove.rotation.y = -a;
            group.add(groove);
        }
        return group;
    }

    private buildWoodDoubleConic(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const radius = Math.max(data.width, data.length) * 0.5;
        const oakMat = new THREE.MeshStandardMaterial({ color: 0xb67a3d, roughness: 0.48, metalness: 0.0 });
        const darkOakMat = new THREE.MeshStandardMaterial({ color: 0x7b4b22, roughness: 0.58 });

        const top = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.075, 72), oakMat);
        top.position.y = data.height;
        group.add(top);

        const upper = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.28, radius * 0.08, data.height * 0.36, 64), oakMat);
        upper.position.y = data.height * 0.68;
        upper.rotation.x = Math.PI;
        group.add(upper);

        const lower = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.3, radius * 0.1, data.height * 0.42, 64), oakMat);
        lower.position.y = data.height * 0.27;
        group.add(lower);

        const waist = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.13, radius * 0.13, 0.08, 48), darkOakMat);
        waist.position.y = data.height * 0.48;
        group.add(waist);

        for (let i = 0; i < 12; i++) {
            const line = new THREE.Mesh(new THREE.BoxGeometry(radius * 1.28, 0.006, 0.008), darkOakMat);
            line.position.y = data.height + 0.042;
            line.position.z = -radius * 0.5 + (i / 11) * radius;
            group.add(line);
        }
        return group;
    }

    private buildWoodFourLeg(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const width = data.width;
        const length = data.length;
        const height = data.height;
        const oakMat = new THREE.MeshStandardMaterial({ color: 0xbc8244, roughness: 0.48 });
        const darkOakMat = new THREE.MeshStandardMaterial({ color: 0x81501f, roughness: 0.62 });

        const top = new THREE.Mesh(new THREE.BoxGeometry(width, 0.08, length), oakMat);
        top.position.y = height;
        group.add(top);

        const apronX = new THREE.Mesh(new THREE.BoxGeometry(width * 0.88, 0.08, 0.06), darkOakMat);
        apronX.position.set(0, height - 0.085, length * 0.43);
        group.add(apronX, apronX.clone());
        group.children[group.children.length - 1].position.z = -length * 0.43;

        const apronZ = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, length * 0.82), darkOakMat);
        apronZ.position.set(width * 0.43, height - 0.085, 0);
        group.add(apronZ, apronZ.clone());
        group.children[group.children.length - 1].position.x = -width * 0.43;

        const legGeo = new THREE.CylinderGeometry(0.035, 0.055, height - 0.08, 12);
        const positions = [
            [width * 0.42, (height - 0.08) * 0.5, length * 0.4],
            [-width * 0.42, (height - 0.08) * 0.5, length * 0.4],
            [width * 0.42, (height - 0.08) * 0.5, -length * 0.4],
            [-width * 0.42, (height - 0.08) * 0.5, -length * 0.4],
        ];
        positions.forEach(([x, y, z]) => {
            const leg = new THREE.Mesh(legGeo, oakMat);
            leg.position.set(x, y, z);
            leg.rotation.z = x > 0 ? -0.08 : 0.08;
            leg.rotation.x = z > 0 ? 0.08 : -0.08;
            group.add(leg);
        });
        return group;
    }

    private buildCeramicCurve(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const radius = Math.max(data.width, data.length) * 0.5;
        const ceramicMat = new THREE.MeshPhysicalMaterial({ color: 0xe4ded3, roughness: 0.32, metalness: 0.0, clearcoat: 0.36, clearcoatRoughness: 0.2 });

        const top = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.07, 72), ceramicMat);
        top.scale.z = data.length / data.width;
        top.position.y = data.height;
        group.add(top);

        const points = [
            new THREE.Vector2(radius * 0.2, 0),
            new THREE.Vector2(radius * 0.34, data.height * 0.12),
            new THREE.Vector2(radius * 0.24, data.height * 0.38),
            new THREE.Vector2(radius * 0.38, data.height * 0.66),
            new THREE.Vector2(radius * 0.22, data.height * 0.92),
        ];
        const pedestal = new THREE.Mesh(new THREE.LatheGeometry(points, 72), ceramicMat);
        pedestal.scale.z = 0.72;
        group.add(pedestal);

        const foot = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.34, radius * 0.4, 0.035, 72), ceramicMat);
        foot.scale.z = 0.72;
        foot.position.y = 0.018;
        group.add(foot);
        return group;
    }
}
