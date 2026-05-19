import * as THREE from '@pryzm/renderer-three/three';
import { FurnitureData } from './FurnitureTypes';
import { MaterialService } from './MaterialService';
import { FurnitureFactory } from './builders/FurnitureFactory';
import { WardrobeEngine } from './engines/WardrobeEngine';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';

export class FurnitureFragmentBuilder {
    private scene: THREE.Scene;
    public furnitureRoots = new Map<string, THREE.Group>();

    private materialService = new MaterialService();
    private wardrobeEngine = new WardrobeEngine();

    constructor(scene: THREE.Scene) {
        this.scene = scene;
    }

    updateFurniture(data: FurnitureData): void {
        let root = this.furnitureRoots.get(data.id);
        const isNewRoot = !root;

        // Add default baseOffset = 0.2
        const baseOffset = data.baseOffset ?? 0.2;

        if (isNewRoot) {
            root = new THREE.Group();

            root.userData = { 
                id: data.id,
                elementType: 'Furniture',
                modelId: 'model-default',
                selectable: true,
                furnitureType: data.furnitureType,
                furnitureCategory: data.furnitureCategory,
                levelId: data.levelId,
                levelName: data.levelName,
                levelElevation: data.levelElevation,
                baseOffset: baseOffset, // Use the default value
                width: data.width,
                length: data.length,
                height: data.height,
                lo3: data.lo3 || 200
            };

            // Lock identity like Curtain Wall
            Object.defineProperty(root.userData, 'id', { writable: false });
            Object.defineProperty(root.userData, 'elementType', { writable: false });

            this.scene.add(root);
            this.furnitureRoots.set(data.id, root);
        } else {
            // Update LO3 if it changed (optional dynamic LO level support)
            if (root && data.lo3 !== undefined && root.userData && root.userData.lo3 !== data.lo3) {
                root.userData.lo3 = data.lo3;
            }

            // Update baseOffset in userData if it changed
            if (root && root.userData) {
                root.userData.baseOffset = baseOffset;
                root.userData.furnitureType = data.furnitureType;
                root.userData.furnitureCategory = data.furnitureCategory;
                root.userData.width = data.width;
                root.userData.length = data.length;
                root.userData.height = data.height;
            }
        }
        if (root) elementRegistry.registerRoot(data.id, root);

        // For glb_import: the model is already in the scene (placed by addFurniture).
        // Just synchronise position/rotation from the store record and skip mesh rebuild.
        if (data.furnitureType === 'glb_import') {
            if (root) {
                if (data.position) {
                    root.position.set(
                        data.position.x,
                        data.position.y + baseOffset,
                        data.position.z,
                    );
                }
                if (data.rotation) {
                    root.quaternion.setFromEuler(new THREE.Euler(data.rotation.x, data.rotation.y, data.rotation.z, (data.rotation.order || 'XYZ') as THREE.EulerOrder));
                }
                root.visible = true;
            }
            return;
        }

        // CRITICAL: Properly dispose old geometries AND unique materials to prevent memory leaks
        // Cached materials are preserved and reused
        if (root) {
            root.traverse(child => {
                if (child instanceof THREE.Mesh) {
                    child.geometry.dispose();

                    // Only dispose materials that are NOT from cache
                    if (Array.isArray(child.material)) {
                        child.material.forEach(mat => {
                            if (!this.materialService.isCachedMaterial(mat)) {
                                mat.dispose();
                            }
                        });
                    } else {
                        if (!this.materialService.isCachedMaterial(child.material)) {
                            child.material.dispose();
                        }
                    }
                }
            });
            root.clear();
        }

        let mesh: THREE.Group;

        // Use WardrobeEngine for wardrobes with config
        if ((data.furnitureType === 'wardrobe' || data.furnitureType === 'wardrobe_glass_door' || data.furnitureType === 'corner_wardrobe') && data.wardrobeConfig) {
            // Ensure config has ID for consistency — clone first as data is frozen
            const config = { ...data.wardrobeConfig } as any;
            if (!config.id) config.id = data.id;
            
            // Pass points for corner logic if available
            if (data.furnitureType === 'corner_wardrobe') {
                config.startPoint = data.startPoint;
                config.cornerPoint = data.cornerPoint;
                config.endPoint = data.endPoint;
            }
            
            // §09 F-08: do not dump full config object to console.
            mesh = this.wardrobeEngine.create(config, data.color);
        } else {
            const builder = FurnitureFactory.getBuilder(data.furnitureType, this);
            mesh = builder.build(data);
        }

        if (root) {
            // Mark internal meshes as sub-elements (like Curtain Wall)
            mesh.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    const isKitchenPart = Boolean(child.userData?.isKitchenPart || child.userData?.isKitchenCountertop);
                    const existingElementType = child.userData?.elementType;
                    child.userData = {
                        ...child.userData,
                        elementType: existingElementType ?? (isKitchenPart ? 'KitchenCabinetPart' : 'FurniturePart'),
                        modelId: 'model-default',
                        parentId: data.id,
                        isSubElement: true,
                        role: child.userData?.role ?? 'geometry',
                        furnitureType: data.furnitureType,
                        furnitureCategory: data.furnitureCategory,
                    };

                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            root.add(mesh);

            // Apply position with baseOffset - with protection against missing data.position
            if (data.position) {
                root.position.set(
                    data.position.x,
                    data.position.y + baseOffset,
                    data.position.z
                );
            }

            // Apply rotation with zero-length protection
            // NOTE: When startPoint and endPoint exist, rotation is derived from direction vector.
            // If direction is zero-length, previous rotation is preserved and data.rotation is ignored.
            // This makes start/end the primary source of rotation when available (wall-mode behavior).
            if (data.startPoint && data.endPoint && data.furnitureType !== 'corner_wardrobe') {
                const start = new THREE.Vector3(data.startPoint.x, 0, data.startPoint.z);
                const end = new THREE.Vector3(data.endPoint.x, 0, data.endPoint.z);
                const direction = new THREE.Vector3().subVectors(end, start);

                // Zero-length protection - if direction is zero, keep existing rotation (defaults to 0 on first creation)
                if (direction.lengthSq() > 0.000001) {
                    const angle = Math.atan2(direction.z, direction.x);
                    root.rotation.y = -angle;
                }
                // If direction is zero, keep existing rotation (acceptable behavior)
            } else if (data.rotation) {
                // Use provided rotation only when start/end points are not available or it's a corner_wardrobe
                root.quaternion.setFromEuler(new THREE.Euler(data.rotation.x, data.rotation.y, data.rotation.z, (data.rotation.order || 'XYZ') as THREE.EulerOrder));
            }

            root.visible = true;
        }
    }

    public getMaterialService(): MaterialService {
        return this.materialService;
    }

    removeFurniture(id: string): void {
        const root = this.furnitureRoots.get(id);
        if (root) {
            // Properly dispose geometries AND unique materials before removal
            root.traverse(child => {
                if (child instanceof THREE.Mesh) {
                    child.geometry.dispose();

                    // Only dispose materials that are NOT from cache
                    if (Array.isArray(child.material)) {
                        child.material.forEach(mat => {
                            if (!this.materialService.isCachedMaterial(mat)) {
                                mat.dispose();
                            }
                        });
                    } else {
                        if (!this.materialService.isCachedMaterial(child.material)) {
                            child.material.dispose();
                        }
                    }
                }
            });

            this.scene.remove(root);
            this.furnitureRoots.delete(id);
            elementRegistry.unregisterRoot(id);
        }
    }

    // Clean up material cache when no longer needed
    dispose(): void {
        this.materialService.dispose();
    }
}