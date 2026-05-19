import * as THREE from '@pryzm/renderer-three/three';
import { StairProperties } from './StairTypes';

const MATERIAL_PRESETS: Record<string, THREE.MeshStandardMaterial> = {
    concrete: new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.9, metalness: 0.0 }),
    wood:     new THREE.MeshStandardMaterial({ color: 0x8B5E3C, roughness: 0.8, metalness: 0.0 }),
    steel:    new THREE.MeshStandardMaterial({ color: 0x888899, roughness: 0.3, metalness: 0.8 }),
    marble:   new THREE.MeshStandardMaterial({ color: 0xf0ece0, roughness: 0.2, metalness: 0.1 }),
    default:  new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.7, metalness: 0.1 }),
};

export class StairMaterialResolver {

    getTreadMaterial(props: StairProperties): THREE.Material {
        const key = (props.material ?? 'default').toLowerCase();
        return (MATERIAL_PRESETS[key] ?? MATERIAL_PRESETS.default).clone();
    }

    getRiserMaterial(props: StairProperties): THREE.Material {
        return this.getTreadMaterial(props);
    }

    getStringerMaterial(props: StairProperties): THREE.Material {
        const key = (props.material ?? 'default').toLowerCase();
        const base = (MATERIAL_PRESETS[key] ?? MATERIAL_PRESETS.default).clone() as THREE.MeshStandardMaterial;
        base.color.multiplyScalar(0.85);
        return base;
    }

    getLandingMaterial(props: StairProperties): THREE.Material {
        return this.getTreadMaterial(props);
    }

    getPreviewMaterial(): THREE.Material {
        return new THREE.MeshStandardMaterial({
            color: 0x00aaff, transparent: true, opacity: 0.45
        });
    }
}
