import * as THREE from '@pryzm/renderer-three/three';
import { StairProperties } from './StairTypes';

// §FIX-STAIR-MATERIAL-PRESET-GAP — this table used to cover only
// concrete / wood / steel / marble. Three of the SIX members of the `StairMaterial`
// union — 'timber', 'glass', 'composite' — had no preset and silently resolved to the
// grey `default`, and 'wood' (which the old panel offered) is not a union member at
// all. Now every schema-valid material has a preset, so a Material the panel can offer
// is a Material the renderer can actually show. 'wood' is retained as a LEGACY ALIAS
// for 'timber': `StairTypeDefinitions` still ships two built-in types whose
// `defaults.material` is the string 'wood', and existing saved projects carry it.
const TIMBER = () => new THREE.MeshStandardMaterial({ color: 0x8B5E3C, roughness: 0.8, metalness: 0.0 });

const MATERIAL_PRESETS: Record<string, THREE.MeshStandardMaterial> = {
    concrete:  new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.9, metalness: 0.0 }),
    timber:    TIMBER(),
    wood:      TIMBER(),   // legacy alias — see note above
    steel:     new THREE.MeshStandardMaterial({ color: 0x888899, roughness: 0.3, metalness: 0.8 }),
    marble:    new THREE.MeshStandardMaterial({ color: 0xf0ece0, roughness: 0.2, metalness: 0.1 }),
    glass:     new THREE.MeshStandardMaterial({ color: 0xbfd8e0, roughness: 0.05, metalness: 0.0, transparent: true, opacity: 0.35 }),
    composite: new THREE.MeshStandardMaterial({ color: 0x5a5f66, roughness: 0.55, metalness: 0.2 }),
    default:   new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.7, metalness: 0.1 }),
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
