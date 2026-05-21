import * as THREE from '@pryzm/renderer-three/three';
import { HandrailData } from '@pryzm/core-app-model/stores';
import { BimManager } from '@pryzm/core-app-model';
import { elementRegistry, StoreType } from '@pryzm/core-app-model/element-registry';

export class HandrailFragmentBuilder {
    private scene: THREE.Scene;
    private bimManager: BimManager;
    private handrailRoots: Map<string, THREE.Group> = new Map();

    constructor(scene: THREE.Scene, bimManager: BimManager) {
        this.scene = scene;
        this.bimManager = bimManager;
    }

    updateHandrail(handrail: Readonly<HandrailData>): void {
        this.buildHandrail(handrail);
    }

    removeHandrail(id: string): void {
        const root = this.handrailRoots.get(id);
        if (root) {
            this.disposeRoot(root);
            this.scene.remove(root);
            this.handrailRoots.delete(id);
        }
        elementRegistry.unregisterRoot(id);
        elementRegistry.unregister(id);
    }

    private disposeRoot(root: THREE.Group): void {
        root.traverse(obj => {
            if (obj instanceof THREE.Mesh) {
                obj.geometry.dispose();
                if (Array.isArray(obj.material)) {
                    obj.material.forEach((m: THREE.Material) => m.dispose());
                } else if (obj.material) {
                    (obj.material as THREE.Material).dispose();
                }
            }
        });
        root.clear();
    }

    private buildHandrail(handrail: Readonly<HandrailData>): void {
        const [start, end] = handrail.baseLine;
        const dx = end.x - start.x;
        const dz = end.z - start.z;
        const length = Math.sqrt(dx * dx + dz * dz);
        const angle = Math.atan2(dz, dx);

        const levelId = handrail.levelId;
        const level = this.bimManager.getLevelById(levelId);
        const elevation = level ? level.elevation : 0;
        const baseOffset = handrail.baseOffset ?? 0;
        const worldY = elevation + baseOffset;

        // §57 Day 5 (DAILY-USE 2026-05-21, Round 34) — capture _priorVersion
        // BEFORE the disposeRoot path nukes the userData. Mirrors Round 19
        // column pattern. Defaults to 0 for first build.
        let root = this.handrailRoots.get(handrail.id);
        const _priorVersion: number = (root?.userData?.version as number | undefined) ?? 0;

        if (!root) {
            root = new THREE.Group();
            this.scene.add(root);
            this.handrailRoots.set(handrail.id, root);
            // §3.5 FIX: elementRegistry.registerSemantic() moved here from HandrailStore.add().
            // Builders may register in ElementRegistry (§4.3). Stores may not.
            elementRegistry.registerSemantic(handrail.id, 'handrail' as StoreType);
        } else {
            this.disposeRoot(root);
        }
        elementRegistry.registerRoot(handrail.id, root);

        root.userData = {
            id: handrail.id,
            type: 'Handrail',
            elementType: 'Handrail',
            levelId: handrail.levelId,
            modelId: 'model-default',
            selectable: true,
            pathStart: { x: start.x, z: start.z },
            pathEnd:   { x: end.x,   z: end.z   },
            totalLength: length,
            height: handrail.height,
            // §57 Day 5 — monotonic per-build counter. Enables NMEexporter
            // proxy cache invalidation after every rebuild.
            version: _priorVersion + 1,
        };

        root.position.set(start.x, worldY, start.z);
        root.rotation.y = -angle;

        const railProfile = handrail.railProfile ?? 'rectangular';

        if (railProfile === 'round') {
            const radius = (handrail.railDiameter ?? 0.04) / 2;
            const railGeo = new THREE.CylinderGeometry(radius, radius, length, 8);
            railGeo.rotateZ(Math.PI / 2);
            const railMat = new THREE.MeshStandardMaterial({ color: handrail.materialColor || '#cccccc' });
            const railMesh = new THREE.Mesh(railGeo, railMat);
            railMesh.position.set(length / 2, handrail.height, 0);
            railMesh.userData = { role: 'geometry', selectable: false };
            root.add(railMesh);
        } else {
            const geo = new THREE.BoxGeometry(length, 0.05, handrail.thickness);
            const mat = new THREE.MeshStandardMaterial({ color: handrail.materialColor || '#cccccc' });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(length / 2, handrail.height, 0);
            mesh.userData = { role: 'geometry', selectable: false };
            root.add(mesh);
        }

        if (handrail.fillType === 'glass') {
            const glassGeo = new THREE.BoxGeometry(length, handrail.height - 0.1, 0.01);
            const glassMat = new THREE.MeshStandardMaterial({
                color: '#88ccff',
                transparent: true,
                opacity: 0.3,
                metalness: 0.1,
                roughness: 0.1
            });
            const glassMesh = new THREE.Mesh(glassGeo, glassMat);
            glassMesh.position.set(length / 2, handrail.height / 2, 0);
            glassMesh.userData = { role: 'geometry', selectable: false };
            root.add(glassMesh);
        } else if (handrail.fillType === 'baluster') {
            const balusterSpacing = handrail.balusterSpacing ?? handrail.postSpacing ?? 0.11;
            if (balusterSpacing > 0 && length > balusterSpacing) {
                const bHeight = handrail.height - 0.05;
                const bShape = handrail.balusterShape ?? 'rectangular';
                const bWidth = handrail.balusterWidth ?? 0.02;
                const bGeo = bShape === 'round'
                    ? new THREE.CylinderGeometry(bWidth / 2, bWidth / 2, bHeight, 6)
                    : new THREE.BoxGeometry(bWidth, bHeight, bWidth);
                const bMat = new THREE.MeshStandardMaterial({ color: handrail.materialColor || '#888888' });
                const count = Math.floor(length / balusterSpacing) - 1;
                for (let i = 1; i <= count; i++) {
                    const bMesh = new THREE.Mesh(bGeo, bMat);
                    bMesh.position.set(i * balusterSpacing, bHeight / 2, 0);
                    bMesh.userData = { role: 'geometry', selectable: false };
                    root.add(bMesh);
                }
            }
        }

        const postGeo = new THREE.CylinderGeometry(0.02, 0.02, handrail.height);
        const postMat = new THREE.MeshStandardMaterial({ color: '#333333' });

        const post1 = new THREE.Mesh(postGeo, postMat);
        post1.position.set(0, handrail.height / 2, 0);
        post1.userData = { role: 'geometry', selectable: false };
        root.add(post1);

        const post2 = new THREE.Mesh(postGeo, postMat);
        post2.position.set(length, handrail.height / 2, 0);
        post2.userData = { role: 'geometry', selectable: false };
        root.add(post2);

        const spacing = handrail.postSpacing ?? 0;
        if (spacing > 0 && length > spacing) {
            const count = Math.floor(length / spacing) - 1;
            for (let i = 1; i <= count; i++) {
                const postX = i * spacing;
                const interPost = new THREE.Mesh(postGeo, postMat);
                interPost.position.set(postX, handrail.height / 2, 0);
                interPost.userData = { role: 'geometry', selectable: false };
                root.add(interPost);
            }
        }
    }
}
