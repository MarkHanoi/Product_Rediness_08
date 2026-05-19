import * as THREE from '@pryzm/renderer-three/three';
import { MaterialService } from '../MaterialService';
import { WardrobeConfig } from '../WardrobeTypes';
import { WardrobeEngine } from '../engines/WardrobeEngine';

export class WardrobeBuilder {
    private engine: WardrobeEngine;

    constructor(_materialService: MaterialService) {
        this.engine = new WardrobeEngine();
    }

    public build(data: any): THREE.Group {
        const config = data.wardrobeConfig;
        if (!config) return new THREE.Group();
        return this.buildFromConfig(config);
    }

    public buildFromConfig(config: WardrobeConfig): THREE.Group {
        return this.engine.create(config);
    }
}