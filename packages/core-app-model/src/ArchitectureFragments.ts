import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';

export class ArchitectureFragments {
    private world: OBC.World;

    constructor(world: OBC.World) {
        this.world = world;
    }

    async createWall(points: THREE.Vector3[], height: number, thickness: number, id?: string) {
        if (points.length < 2) return null;
        const start = points[0];
        const end = points[1];
        const length = start.distanceTo(end);
        const dir = new THREE.Vector3().subVectors(end, start).normalize();
        const geometry = new THREE.BoxGeometry(length, height, thickness);
        const material = new THREE.MeshStandardMaterial({ color: 0xcccccc });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData = {
            type: 'Wall',
            height,
            thickness,
            length: Number(length.toFixed(2)),
            id: id || THREE.MathUtils.generateUUID(),
        };
        const center = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
        mesh.position.set(center.x, height / 2, center.z);
        const angle = Math.atan2(-dir.z, dir.x);
        mesh.rotation.y = angle;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if (this.world && this.world.scene) {
            this.world.scene.three.add(mesh);
            await (this.world.scene as OBC.ShadowedScene).updateShadows();
        }
        return mesh;
    }

    async createSlabFromPoints(points: THREE.Vector3[], thickness: number, materialId?: string, id?: string) {
        if (points.length < 3) return null;
        const slabGroup = new THREE.Group();
        const shape = new THREE.Shape(points.map(p => new THREE.Vector2(p.x, p.z)));
        const topGeometry = new THREE.ShapeGeometry(shape);
        topGeometry.rotateX(Math.PI / 2);
        const topMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc, side: THREE.DoubleSide });
        const topMesh = new THREE.Mesh(topGeometry, topMaterial);
        topMesh.position.y = 0;
        topMesh.castShadow = true;
        topMesh.receiveShadow = true;
        slabGroup.add(topMesh);
        const bottomGeometry = new THREE.ShapeGeometry(shape);
        bottomGeometry.rotateX(-Math.PI / 2);
        const bottomMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc, side: THREE.DoubleSide });
        const bottomMesh = new THREE.Mesh(bottomGeometry, bottomMaterial);
        bottomMesh.position.y = -thickness;
        bottomMesh.castShadow = true;
        bottomMesh.receiveShadow = true;
        slabGroup.add(bottomMesh);
        for (let i = 0; i < points.length; i++) {
            const p1 = points[i];
            const p2 = points[(i + 1) % points.length];
            const len = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.z - p1.z, 2));
            const sideGeometry = new THREE.PlaneGeometry(len, thickness);
            const sideMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc, side: THREE.DoubleSide });
            const sideMesh = new THREE.Mesh(sideGeometry, sideMaterial);
            const midX = (p1.x + p2.x) / 2;
            const midZ = (p1.z + p2.z) / 2;
            sideMesh.position.set(midX, -thickness / 2, midZ);
            const angle = Math.atan2(p2.z - p1.z, p2.x - p1.x);
            sideMesh.rotation.y = -angle + Math.PI / 2;
            sideMesh.castShadow = true;
            sideMesh.receiveShadow = true;
            slabGroup.add(sideMesh);
        }
        slabGroup.userData = { type: 'Slab', thickness, id: id || THREE.MathUtils.generateUUID(), materialId, points: points.map(p => ({ x: p.x, y: p.y, z: p.z })) };
        if (this.world && this.world.scene) {
            this.world.scene.three.add(slabGroup);
            await (this.world.scene as OBC.ShadowedScene).updateShadows();
        }
        return slabGroup;
    }

    async createSlabFromRectangle(p1: { x: number, z: number }, p2: { x: number, z: number }, thickness: number = 0.2, materialId?: string, id?: string) {
        const points = [new THREE.Vector2(p1.x, p1.z), new THREE.Vector2(p1.x, p2.z), new THREE.Vector2(p2.x, p2.z), new THREE.Vector2(p2.x, p1.z)];
        const shape = new THREE.Shape(points);
        const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
        geometry.rotateX(-Math.PI / 2);
        geometry.translate(0, -thickness / 2, 0);
        geometry.computeVertexNormals();
        const material = new THREE.MeshStandardMaterial({ color: 0xcccccc, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData = { type: 'Slab', thickness, id: id || THREE.MathUtils.generateUUID(), materialId, width: Math.abs(p2.x - p1.x), depth: Math.abs(p2.z - p1.z), p1: { x: p1.x, z: p1.z }, p2: { x: p2.x, z: p2.z } };
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if (this.world && this.world.scene) {
            this.world.scene.three.add(mesh);
            await (this.world.scene as OBC.ShadowedScene).updateShadows();
        }
        return mesh;
    }

    async createSlab(width: number, depth: number, thickness: number, id?: string) {
        const geometry = new THREE.BoxGeometry(width, thickness, depth);
        const material = new THREE.MeshStandardMaterial({ color: 0xffffff });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData = { type: 'Slab', width, depth, thickness, id: id || THREE.MathUtils.generateUUID() };
        mesh.position.set(0, -thickness / 2, 0);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if (this.world && this.world.scene) {
            this.world.scene.three.add(mesh);
            await (this.world.scene as OBC.ShadowedScene).updateShadows();
        }
        return mesh;
    }
}
