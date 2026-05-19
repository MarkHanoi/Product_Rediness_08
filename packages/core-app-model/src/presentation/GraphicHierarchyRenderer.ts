import * as THREE from '@pryzm/renderer-three/three';
import { VisualStyleManager } from './VisualStyleManager.js';

export class GraphicHierarchyRenderer {
    constructor(
        private scene: THREE.Scene,
        private styleManager: VisualStyleManager
    ) {}

    public apply(isGraphic: boolean) {
        this.scene.traverse((obj) => {
            if (obj instanceof THREE.Mesh && obj.userData.elementType) {
                const type = obj.userData.elementType.toLowerCase();
                const style = this.styleManager.getStyleFor(obj.userData.elementType);
                
                if (isGraphic) {
                    // Graphic Hierarchy Mode: True Architectural Representation
                    if (!obj.userData.originalMaterial) {
                        obj.userData.originalMaterial = obj.material;
                    }
                    
                    // 1) Remove all lighting influence using MeshBasicMaterial
                    // 2) Implement True Wall Poche (solid dark fill)
                    const isWall = type.includes('wall');
                    const pocheColor = isWall ? new THREE.Color(0x1a1a1a) : style.fillColor;
                    
                    obj.material = new THREE.MeshBasicMaterial({
                        color: pocheColor,
                        side: THREE.DoubleSide,
                        transparent: false,
                        opacity: 1.0,
                        depthWrite: true,
                        depthTest: true
                    });

                    // 3) Lineweight Hierarchy via PolygonOffset
                    obj.material.polygonOffset = true;
                    if (isWall) {
                        obj.material.polygonOffsetFactor = -1;
                        obj.material.polygonOffsetUnits = -1;
                    } else if (type.includes('furniture')) {
                        obj.material.polygonOffsetFactor = 1;
                        obj.material.polygonOffsetUnits = 1;
                    } else {
                        obj.material.polygonOffsetFactor = 0;
                        obj.material.polygonOffsetUnits = 0;
                    }
                } else {
                    // Restore Technical Mode: MeshStandardMaterial with shadows
                    if (obj.userData.originalMaterial) {
                        obj.material = obj.userData.originalMaterial;
                    } else {
                        // Fallback to Standard if original wasn't captured
                        obj.material = new THREE.MeshStandardMaterial({
                            color: style.fillColor,
                            roughness: 0.7,
                            metalness: 0.2
                        });
                    }
                    obj.castShadow = true;
                    obj.receiveShadow = true;
                }
            }
        });
    }
}
