import * as THREE from '@pryzm/renderer-three/three';
import { StairLandingEntity } from './StairLandingTypes';
import { StairLandingStore } from './StairLandingStore';

export class StairLandingBuilder {
    private meshCache: Map<string, THREE.Mesh> = new Map();
    private scene?: THREE.Scene;
    private material: THREE.MeshStandardMaterial;

    constructor(
        private landingStore: StairLandingStore,
        scene?: THREE.Scene
    ) {
        this.scene = scene;
        this.material = new THREE.MeshStandardMaterial({
            color: 0x999999, roughness: 0.8, metalness: 0.1
        });

        window.addEventListener('bim-stair-landing-added', (e: Event) => {
            // §FIX-STAIR-EVENT-PAYLOAD (C11 §7.0): StairLandingStore.add() emits a
            // lightweight `{ id }` notification, not `{ landing }`. Resolve the full
            // entity from the store (the store is the authoritative source).
            const { id } = (e as CustomEvent<{ id: string }>).detail;
            const landing = id ? this.landingStore.get(id) : undefined;
            if (landing) this.buildLanding(landing);
        });

        window.addEventListener('bim-stair-landing-removed', (e: Event) => {
            // §FIX-STAIR-EVENT-PAYLOAD: store emits `{ id }`, not `{ landingId }`.
            const { id } = (e as CustomEvent<{ id: string }>).detail;
            if (id) this.removeLanding(id);
        });

        window.addEventListener('bim-stair-removed', (e: Event) => {
            // §FIX-STAIR-EVENT-PAYLOAD: StairStore emits `{ id }`, not `{ stairId }`.
            const { id } = (e as CustomEvent<{ id: string }>).detail;
            if (id) this.landingStore.getByStairId(id).forEach(l => this.removeLanding(l.id));
        });
    }

    buildLanding(landing: StairLandingEntity): void {
        this.removeLanding(landing.id);

        const thickness = 0.05;
        const geometry = new THREE.BoxGeometry(landing.width, thickness, landing.length);
        const mat = this.material.clone();

        if (landing.material) {
            const colors: Record<string, number> = {
                concrete: 0xaaaaaa, wood: 0x8B5E3C, steel: 0x888899, marble: 0xf0ece0
            };
            mat.color.setHex(colors[landing.material] ?? 0x999999);
        }

        const mesh = new THREE.Mesh(geometry, mat);

        const posX = landing.position?.x ?? 0;
        const posZ = landing.position?.z ?? 0;
        mesh.position.set(posX, landing.elevation + thickness / 2, posZ);

        mesh.name = `stair-landing-${landing.id}`;
        mesh.userData = {
            id: landing.id,
            elementId: landing.id,
            elementType: 'stair-landing',
            stairId: landing.stairId,
            selectable: false,
            ifcData: landing.ifcData
        };

        this.meshCache.set(landing.id, mesh);
        this.scene?.add(mesh);
    }

    removeLanding(landingId: string): void {
        const mesh = this.meshCache.get(landingId);
        if (mesh) {
            this.scene?.remove(mesh);
            mesh.geometry.dispose();
            if (mesh.material instanceof THREE.Material) mesh.material.dispose();
            this.meshCache.delete(landingId);
        }
    }

    setScene(scene: THREE.Scene): void {
        this.scene = scene;
        this.landingStore.getAll().forEach(l => this.buildLanding(l));
    }
}
