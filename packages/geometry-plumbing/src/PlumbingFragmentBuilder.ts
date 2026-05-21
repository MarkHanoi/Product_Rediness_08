import * as THREE from '@pryzm/renderer-three/three';
import { PlumbingFixtureData } from './PlumbingTypes';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { createToiletGeometry, DEFAULT_TOILET_VARIANT, ToiletVariant } from './ToiletGeometry';
import { createShowerGeometry, DEFAULT_SHOWER_VARIANT, ShowerVariant } from './ShowerGeometry';
import { createAccessoryGeometry, DEFAULT_ACCESSORY_VARIANT, BathroomAccessoryVariant } from './BathroomAccessoryGeometry';

export class PlumbingFragmentBuilder {
    private scene: THREE.Scene;
    public fixtureRoots = new Map<string, THREE.Group>();

    constructor(scene: THREE.Scene) {
        this.scene = scene;
    }

    updateFixture(data: PlumbingFixtureData): void {
        // §57 Day 5 (DAILY-USE 2026-05-21, Round 34) — capture prior version
        // to bump monotonically on every update. PlumbingFragmentBuilder uses
        // a REUSABLE root (keeps the same THREE.Group across updates and
        // rebuilds children only). Mirrors FurnitureFragmentBuilder pattern
        // (Round 33). Defaults to 0 for first build.
        let root = this.fixtureRoots.get(data.id);
        const _priorVersion: number = (root?.userData?.version as number | undefined) ?? 0;
        if (!root) {
            root = new THREE.Group();
            root.userData = {
                id: data.id,
                elementType: 'PlumbingFixture',
                fixtureType: data.fixtureType,
                selectable: true,
                levelId: data.levelId,
                levelName: data.levelName,
                levelElevation: data.levelElevation,
                baseOffset: data.baseOffset,
                // §57 Day 5 — monotonic per-update counter for cache invalidation.
                version: _priorVersion + 1,
            };
            this.scene.add(root);
            this.fixtureRoots.set(data.id, root);
        } else {
            // §57 Day 5 — bump version on every reused-root update so the
            // NMEexporter proxy cache invalidates after each architect edit.
            root.userData.version = _priorVersion + 1;
        }
        elementRegistry.registerRoot(data.id, root);

        root.clear();
        let mesh: THREE.Group;
        if (data.fixtureType === 'sink') {
            mesh = this.createSinkMesh(data);
        } else if (data.fixtureType === 'bath') {
            mesh = this.createBathMesh(data);
        } else if (data.fixtureType === 'shower') {
            mesh = this.createShowerMesh(data);
        } else if (data.fixtureType === 'accessory') {
            mesh = this.createAccessoryMesh(data);
        } else {
            mesh = this.createToiletMesh(data);
        }
        
        // Ensure the mesh itself is selectable and carries the ID
        mesh.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.userData = { 
                    id: data.id,
                    elementType: 'PlumbingFixture',
                    selectable: true,
                    levelId: data.levelId,
                    levelName: data.levelName,
                    levelElevation: data.levelElevation,
                    baseOffset: data.baseOffset
                };
            }
        });
        
        root.add(mesh);

        root.position.copy(data.position);
        root.quaternion.setFromEuler(data.rotation);
        
        root.visible = true;
        console.log(`PlumbingFragmentBuilder: Updated fixture ${data.id}, visible: ${root.visible}`);
    }

    private createSinkMesh(data: PlumbingFixtureData): THREE.Group {
        const group = new THREE.Group();
        const ceramicMat = new THREE.MeshStandardMaterial({ 
            color: 0xffffff,
            roughness: 0.1,
            metalness: 0.1
        });
        const chromeMat = new THREE.MeshStandardMaterial({
            color: 0xaaaaaa,
            roughness: 0.2,
            metalness: 0.8
        });

        // 1. Main Basin Body (Rectangular with rounded corners feel)
        const basinShape = new THREE.BoxGeometry(0.6, 0.2, 0.45);
        const basin = new THREE.Mesh(basinShape, ceramicMat);
        basin.position.set(0, 0.8, -0.225);
        group.add(basin);

        // 2. Interior Bowl (Carved out look using a semi-ellipsoid)
        const bowlGeo = new THREE.SphereGeometry(0.25, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
        const bowl = new THREE.Mesh(bowlGeo, ceramicMat);
        bowl.scale.set(1.1, 0.7, 0.8);
        bowl.rotation.x = Math.PI; // Invert to be a bowl
        bowl.position.set(0, 0.89, -0.25);
        group.add(bowl);

        // 3. Countertop / Rim
        const rimGeo = new THREE.BoxGeometry(0.65, 0.05, 0.5);
        const rim = new THREE.Mesh(rimGeo, ceramicMat);
        rim.position.set(0, 0.9, -0.25);
        group.add(rim);

        // 4. Backsplash / Mounting Plate
        const backsplashGeo = new THREE.BoxGeometry(0.65, 0.3, 0.05);
        const backsplash = new THREE.Mesh(backsplashGeo, ceramicMat);
        backsplash.position.set(0, 1.0, -0.025);
        group.add(backsplash);

        // 5. Faucet Base
        const faucetBaseGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.05, 16);
        const faucetBase = new THREE.Mesh(faucetBaseGeo, chromeMat);
        faucetBase.position.set(0, 0.95, -0.1);
        group.add(faucetBase);

        // 6. Faucet Spout (L-shaped)
        const spoutVerticalGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.15, 16);
        const spoutVertical = new THREE.Mesh(spoutVerticalGeo, chromeMat);
        spoutVertical.position.set(0, 1.05, -0.1);
        group.add(spoutVertical);

        const spoutHorizontalGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.12, 16);
        const spoutHorizontal = new THREE.Mesh(spoutHorizontalGeo, chromeMat);
        spoutHorizontal.rotation.x = Math.PI / 2;
        spoutHorizontal.rotation.y = Math.PI;
        spoutHorizontal.position.set(0, 1.125, -0.16);
        group.add(spoutHorizontal);

        // 7. Drain
        const drainGeo = new THREE.CircleGeometry(0.04, 32);
        const drain = new THREE.Mesh(drainGeo, chromeMat);
        drain.rotation.x = -Math.PI / 2;
        drain.position.set(0, 0.72, -0.25);
        group.add(drain);

        // 8. Pedestal / Trap Cover
        const pedestalGeo = new THREE.CylinderGeometry(0.12, 0.15, 0.7, 32);
        const pedestal = new THREE.Mesh(pedestalGeo, ceramicMat);
        pedestal.position.set(0, 0.35, -0.15);
        group.add(pedestal);

        group.userData = { 
            id: data.id,
            type: data.type,
            levelId: data.levelId,
            levelName: data.levelName,
            levelElevation: data.levelElevation,
            baseOffset: data.baseOffset
        };
        return group;
    }

    private createToiletMesh(data: PlumbingFixtureData): THREE.Group {
        // LOD400: build the requested variant via the shared ToiletGeometry
        // factory. Preview (PlumbingTool) calls the same factory so geometry
        // parity is guaranteed (Contract 36 §5).
        const variant: ToiletVariant = data.toiletVariant ?? DEFAULT_TOILET_VARIANT;
        const group = createToiletGeometry(variant);

        group.userData = {
            id: data.id,
            type: data.type,
            toiletVariant: variant,
            levelId: data.levelId,
            levelName: data.levelName,
            levelElevation: data.levelElevation,
            baseOffset: data.baseOffset
        };
        return group;
    }

    /**
     * Build a shower group from the persisted DTO. LOD400 — geometry is
     * deterministically rebuilt from `data.showerVariant` via the shared
     * `createShowerGeometry` factory (Contracts 36 §5 / 39 §5 parity).
     */
    private createShowerMesh(data: PlumbingFixtureData): THREE.Group {
        const variant: ShowerVariant = data.showerVariant ?? DEFAULT_SHOWER_VARIANT;
        const group = createShowerGeometry(variant);
        group.userData = {
            id: data.id,
            type: data.type,
            showerVariant: variant,
            levelId: data.levelId,
            levelName: data.levelName,
            levelElevation: data.levelElevation,
            baseOffset: data.baseOffset,
        };
        return group;
    }

    /**
     * Build a bathroom accessory group (washing machine, toilet brush, etc.)
     * from the persisted DTO. LOD400 — geometry is deterministically rebuilt
     * from `data.accessoryVariant` via the shared `createAccessoryGeometry`
     * factory (Contracts 36 §5 / 39 §5 parity).
     */
    private createAccessoryMesh(data: PlumbingFixtureData): THREE.Group {
        const variant: BathroomAccessoryVariant = data.accessoryVariant ?? DEFAULT_ACCESSORY_VARIANT;
        const group = createAccessoryGeometry(variant);
        group.userData = {
            id: data.id,
            type: data.type,
            accessoryVariant: variant,
            levelId: data.levelId,
            levelName: data.levelName,
            levelElevation: data.levelElevation,
            baseOffset: data.baseOffset,
        };
        return group;
    }

    private createBathMesh(data: PlumbingFixtureData): THREE.Group {
        const group = new THREE.Group();
        const width = data.width || 1.7;
        const length = data.length || 0.75;
        const height = data.height || 0.6;
        const color = data.color ? parseInt(data.color.replace('#', '0x')) : 0xffffff;
        
        const mat = new THREE.MeshStandardMaterial({ 
            color: color,
            roughness: 0.1,
            metalness: 0.1,
            side: THREE.DoubleSide
        });

        // 1. Create the outer shape
        const shape = new THREE.Shape();
        shape.moveTo(-width / 2, -length / 2);
        shape.lineTo(width / 2, -length / 2);
        shape.lineTo(width / 2, length / 2);
        shape.lineTo(-width / 2, length / 2);
        shape.lineTo(-width / 2, -length / 2);

        // 2. Create the inner hole (rim thickness = 0.05)
        const hole = new THREE.Path();
        const rw = width / 2 - 0.05;
        const rl = length / 2 - 0.05;
        hole.moveTo(-rw, -rl);
        hole.lineTo(rw, -rl);
        hole.lineTo(rw, rl);
        hole.lineTo(-rw, rl);
        hole.lineTo(-rw, -rl);
        shape.holes.push(hole);

        // 3. Extrude the rim
        const extrudeSettings = { depth: 0.05, bevelEnabled: false };
        const rimGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        const rim = new THREE.Mesh(rimGeo, mat);
        rim.rotation.x = -Math.PI / 2;
        rim.position.y = height;
        group.add(rim);

        // 4. Create the tub walls (4 boxes)
        const wallThickness = 0.05;
        const internalHeight = height - 0.05;

        // Long walls
        const longWallGeo = new THREE.BoxGeometry(width, internalHeight, wallThickness);
        const frontWall = new THREE.Mesh(longWallGeo, mat);
        frontWall.position.set(0, internalHeight / 2, length / 2 - wallThickness / 2);
        group.add(frontWall);

        const backWall = new THREE.Mesh(longWallGeo, mat);
        backWall.position.set(0, internalHeight / 2, -length / 2 + wallThickness / 2);
        group.add(backWall);

        // Short walls
        const shortWallGeo = new THREE.BoxGeometry(wallThickness, internalHeight, length - wallThickness * 2);
        const leftWall = new THREE.Mesh(shortWallGeo, mat);
        leftWall.position.set(-width / 2 + wallThickness / 2, internalHeight / 2, 0);
        group.add(leftWall);

        const rightWall = new THREE.Mesh(shortWallGeo, mat);
        rightWall.position.set(width / 2 - wallThickness / 2, internalHeight / 2, 0);
        group.add(rightWall);

        // 5. Bottom
        const bottomGeo = new THREE.BoxGeometry(width, wallThickness, length);
        const bottom = new THREE.Mesh(bottomGeo, mat);
        bottom.position.y = wallThickness / 2;
        group.add(bottom);

        group.userData = { 
            id: data.id,
            type: data.type,
            levelId: data.levelId,
            levelName: data.levelName,
            levelElevation: data.levelElevation,
            baseOffset: data.baseOffset
        };
        return group;
    }

    removeFixture(id: string): void {
        const root = this.fixtureRoots.get(id);
        if (root) {
            this.scene.remove(root);
            this.fixtureRoots.delete(id);
            elementRegistry.unregisterRoot(id);
        }
    }
}
