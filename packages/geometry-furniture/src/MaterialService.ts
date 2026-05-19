import * as THREE from '@pryzm/renderer-three/three';

export class MaterialService {
    private materialCache = new Map<string, THREE.Material>();
    private doorMaterialCache = new Map<string, THREE.Material>();
    private handleMaterialCache = new Map<string, THREE.Material>();
    private cachedMaterials = new Set<THREE.Material>();

    public isCachedMaterial(material: THREE.Material): boolean {
        return this.cachedMaterials.has(material);
    }

    public getMaterial(color: number, type: 'standard' | 'door' | 'handle' = 'standard'): THREE.Material {
        const key = type === 'handle' ? 'defaultHandle' : color.toString();

        if (type === 'handle') {
            if (!this.handleMaterialCache.has(key)) {
                const material = new THREE.MeshStandardMaterial({ 
                    color: 0xaaaaaa, 
                    metalness: 0.8,
                    roughness: 0.2
                });
                this.handleMaterialCache.set(key, material);
                this.cachedMaterials.add(material);
            }
            return this.handleMaterialCache.get(key)!;
        }

        if (type === 'door') {
            if (!this.doorMaterialCache.has(key)) {
                const material = new THREE.MeshStandardMaterial({ 
                    color, 
                    roughness: 0.3, 
                    metalness: 0.1 
                });
                this.doorMaterialCache.set(key, material);
                this.cachedMaterials.add(material);
            }
            return this.doorMaterialCache.get(key)!;
        }

        if (!this.materialCache.has(key)) {
            const material = new THREE.MeshStandardMaterial({ color });
            this.materialCache.set(key, material);
            this.cachedMaterials.add(material);
        }
        return this.materialCache.get(key)!;
    }

    public dispose(): void {
        this.materialCache.forEach(mat => mat.dispose());
        this.doorMaterialCache.forEach(mat => mat.dispose());
        this.handleMaterialCache.forEach(mat => mat.dispose());
        
        this.materialCache.clear();
        this.doorMaterialCache.clear();
        this.handleMaterialCache.clear();
        this.cachedMaterials.clear();
    }
}
