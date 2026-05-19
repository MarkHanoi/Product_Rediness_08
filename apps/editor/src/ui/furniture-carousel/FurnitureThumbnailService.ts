/**
 * @file FurnitureThumbnailService.ts
 *
 * Phase F2 — Furniture Thumbnail Service.
 *
 * Singleton service. Generates and caches mini 3D previews for furniture items.
 * Uses a dedicated offscreen THREE.WebGLRenderer (not shared with main scene).
 *
 * Design rules (contracts enforced):
 *  - No writes to FurnitureStore or command dispatch — read-only service.
 *    (01-BIM §1.1: builders never mutate stores)
 *  - No @thatopen/ui elements. (05-BIM-UI §7.8)
 *  - No new server endpoints. (07-BIM-SECURITY)
 *  - Preview geometry is completely separate from FurnitureFragmentBuilder —
 *    intentional duplication to avoid coupling thumbnail rendering to the
 *    main scene pipeline. (01-BIM §4.3: builders must not be called from UI)
 *  - LRU eviction at MAX_CACHE_ENTRIES to bound memory growth.
 *  - Geometry and materials are disposed after each render to prevent GPU leaks.
 *    (01-BIM §4.5: no leaked geometry)
 *
 * See docs/furniture/03-IMPLEMENTATION-GUIDE.md §2 for full specification.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { FurnitureType } from '@pryzm/geometry-furniture';
import { buildFurnitureGeometry } from './FurnitureGeometryFactory';

// ── Cache types ────────────────────────────────────────────────────────────────

interface ThumbnailCacheEntry {
    readonly dataUrl: string;
    readonly timestamp: number;
}

// Maximum number of cached thumbnails. When exceeded, the oldest entry is evicted.
const MAX_CACHE_ENTRIES = 200;

// Cache key version — bump this string to invalidate all cached thumbnails
// (e.g. when preview geometry changes significantly).
const CACHE_VERSION = 'v15';

// ── Service ────────────────────────────────────────────────────────────────────

export class FurnitureThumbnailService {
    private static instance: FurnitureThumbnailService | null = null;

    private readonly renderer: THREE.WebGLRenderer;
    private readonly scene: THREE.Scene;
    private readonly camera: THREE.PerspectiveCamera;
    private readonly cache: Map<string, ThumbnailCacheEntry> = new Map();

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    private constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        // Offscreen canvas — never attached to the DOM.
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;

        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
        this.renderer.setSize(256, 256);
        this.renderer.setClearColor(0xF4F6FB, 1.0);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;

        this.scene = new THREE.Scene();

        // Square viewport → aspect ratio 1
        this.camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);

        // 3-point lighting — key, fill, rim + soft ambient
        const key  = new THREE.DirectionalLight(0xffffff, 1.5);
        key.position.set(2, 4, 3);

        const fill = new THREE.DirectionalLight(0xfff0e0, 0.7);
        fill.position.set(-2, 1, -1);

        const rim  = new THREE.DirectionalLight(0xe0e8ff, 0.4);
        rim.position.set(0, 2, -4);

        const amb  = new THREE.AmbientLight(0xffffff, 0.3);

        this.scene.add(key, fill, rim, amb);
    }

    // ── Singleton access ───────────────────────────────────────────────────────

    static getInstance(): FurnitureThumbnailService {
        if (!FurnitureThumbnailService.instance) {
            FurnitureThumbnailService.instance = new FurnitureThumbnailService();
        }
        return FurnitureThumbnailService.instance;
    }

    // ── Public API ─────────────────────────────────────────────────────────────

    /**
     * Returns a data URL (image/webp) thumbnail for the given furniture type.
     * Returns from cache if available; otherwise renders and caches on first call.
     *
     * `fabricHex` (e.g. 0x4a4a4a) lets multiple cards sharing the same
     * FurnitureType render distinct previews per palette. The hex is folded
     * into the cache key.
     */
    async requestThumbnail(type: FurnitureType, fabricHex?: number): Promise<string> {
        const colorPart = fabricHex !== undefined ? fabricHex.toString(16) : 'd';
        const key = `${type}:${colorPart}:${CACHE_VERSION}`;

        const cached = this.cache.get(key);
        if (cached) return cached.dataUrl;

        const dataUrl = await this.renderThumbnail(type, fabricHex);

        // LRU eviction: remove the oldest entry when the cache is full
        if (this.cache.size >= MAX_CACHE_ENTRIES) {
            let oldestKey: string | undefined;
            let oldestTime = Infinity;
            for (const [k, v] of this.cache) {
                if (v.timestamp < oldestTime) {
                    oldestTime = v.timestamp;
                    oldestKey = k;
                }
            }
            if (oldestKey !== undefined) this.cache.delete(oldestKey);
        }

        this.cache.set(key, { dataUrl, timestamp: Date.now() });
        return dataUrl;
    }

    /**
     * Pre-loads thumbnails for all types in a category sequentially.
     * Non-blocking from the caller's perspective — fire-and-forget is fine.
     * Sequential (not parallel) to avoid saturating the GPU.
     */
    async preloadCategory(types: readonly FurnitureType[]): Promise<void> {
        for (const type of types) {
            await this.requestThumbnail(type);
        }
    }

    /**
     * Invalidates all cached thumbnails.
     * Call when global appearance settings change (e.g. theme switch).
     */
    clearCache(): void {
        this.cache.clear();
    }

    /**
     * Dispose the offscreen renderer and invalidate the singleton.
     * After calling this, getInstance() will create a new instance.
     */
    dispose(): void {
        this.renderer.dispose();
        FurnitureThumbnailService.instance = null;
    }

    // ── Rendering ──────────────────────────────────────────────────────────────

    private async renderThumbnail(type: FurnitureType, fabricHex?: number): Promise<string> {
        // Prefer the richer FurnitureGeometryFactory (used by the floating
        // carousel) so thumbnails match the placed geometry. Falls back to the
        // simplified preview builder if the type isn't covered.
        let group: THREE.Group;
        try {
            group = buildFurnitureGeometry(type, { fabricHex });
            if (group.children.length === 0) {
                group = this.buildPreviewGeometry(type);
            }
        } catch {
            group = this.buildPreviewGeometry(type);
        }
        this.scene.add(group);

        // Auto-fit camera: compute bounding box, position camera at isometric angle
        group.updateMatrixWorld(true);
        const bbox = new THREE.Box3().setFromObject(group);
        const center = bbox.getCenter(new THREE.Vector3());
        const size   = bbox.getSize(new THREE.Vector3());
        const diagonal = Math.max(size.x, size.y, size.z);

        // Distance calculated so the object fills ~70% of the viewport
        const fovRad   = THREE.MathUtils.degToRad(35 / 2);
        const distance = (diagonal / (2 * Math.tan(fovRad))) * 1.4;

        // Standard isometric-ish 3-quarter view
        this.camera.position.set(
            center.x + distance * 0.6,
            center.y + distance * 0.6,
            center.z + distance * 0.8,
        );
        this.camera.lookAt(center);
        this.camera.updateProjectionMatrix();

        // Render a single frame
        this.renderer.render(this.scene, this.camera);

        // Read pixels synchronously — toDataURL blocks until the canvas is flushed
        const dataUrl = this.renderer.domElement.toDataURL('image/webp', 0.85);

        // Clean up: dispose geometry + materials, remove from scene
        this.disposeGroup(group);
        this.scene.remove(group);

        return dataUrl;
    }

    // ── Preview geometry builders ──────────────────────────────────────────────

    /**
     * Builds simplified preview geometry for thumbnail rendering ONLY.
     *
     * This is intentionally NOT the same as FurnitureFragmentBuilder:
     *  - Uses coarse, fast geometry (fewer polygons).
     *  - No UVs, no texture loading, no level/elevation offsets.
     *  - Disposable: geometry and materials are freed after each render.
     *
     * Contract: NEVER call FurnitureFragmentBuilder here — that writes to scene.
     */
    private buildPreviewGeometry(type: FurnitureType): THREE.Group {
        const group = new THREE.Group();

        // Shared materials — disposed per-group after render
        const mat       = new THREE.MeshStandardMaterial({ color: 0x8B7355, roughness: 0.7, metalness: 0.0 });
        const matFabric = new THREE.MeshStandardMaterial({ color: 0x6B7F9E, roughness: 0.9, metalness: 0.0 });
        const matMetal  = new THREE.MeshStandardMaterial({ color: 0x9EAAB8, roughness: 0.4, metalness: 0.6 });
        const matGlass  = new THREE.MeshStandardMaterial({ color: 0xADD8E6, roughness: 0.0, metalness: 0.1, transparent: true, opacity: 0.5 });
        const matGreen  = new THREE.MeshStandardMaterial({ color: 0x4A7C59, roughness: 0.9, metalness: 0.0 });

        const mesh = (geom: THREE.BufferGeometry, m: THREE.MeshStandardMaterial) =>
            new THREE.Mesh(geom, m);

        switch (type) {

            // ── Bedroom ───────────────────────────────────────────────────────
            case 'bed': {
                const frame     = mesh(new THREE.BoxGeometry(1.6, 0.15, 2.0), mat);
                frame.position.y = 0.075;
                const mattress  = mesh(new THREE.BoxGeometry(1.5, 0.2, 1.8), matFabric);
                mattress.position.y = 0.25;
                const headboard = mesh(new THREE.BoxGeometry(1.6, 0.6, 0.1), mat);
                headboard.position.set(0, 0.5, -0.95);
                const pillow1   = mesh(new THREE.BoxGeometry(0.5, 0.08, 0.35), matFabric);
                pillow1.position.set(-0.3, 0.37, -0.65);
                const pillow2   = mesh(new THREE.BoxGeometry(0.5, 0.08, 0.35), matFabric);
                pillow2.position.set(0.3, 0.37, -0.65);
                group.add(frame, mattress, headboard, pillow1, pillow2);
                break;
            }

            case 'wardrobe':
            case 'corner_wardrobe': {
                const body = mesh(new THREE.BoxGeometry(1.8, 2.4, 0.6), mat);
                body.position.y = 1.2;
                const divider = mesh(new THREE.BoxGeometry(0.03, 2.2, 0.58), mat);
                divider.position.set(0, 1.2, 0);
                group.add(body, divider);
                break;
            }

            case 'wardrobe_glass_door': {
                const body = mesh(new THREE.BoxGeometry(1.8, 2.4, 0.6), mat);
                body.position.y = 1.2;
                const doorL = mesh(new THREE.BoxGeometry(0.87, 2.2, 0.03), matGlass);
                doorL.position.set(-0.44, 1.2, 0.31);
                const doorR = mesh(new THREE.BoxGeometry(0.87, 2.2, 0.03), matGlass);
                doorR.position.set(0.44, 1.2, 0.31);
                group.add(body, doorL, doorR);
                break;
            }

            case 'bedside_table': {
                const body = mesh(new THREE.BoxGeometry(0.5, 0.55, 0.4), mat);
                body.position.y = 0.275;
                const top  = mesh(new THREE.BoxGeometry(0.52, 0.03, 0.42), mat);
                top.position.y = 0.565;
                group.add(body, top);
                break;
            }

            // ── Sofas ─────────────────────────────────────────────────────────
            case 'corner_sofa': {
                const seatMain = mesh(new THREE.BoxGeometry(2.2, 0.35, 0.9), matFabric);
                seatMain.position.set(0, 0.35, 0);
                const seatSide = mesh(new THREE.BoxGeometry(0.9, 0.35, 1.2), matFabric);
                seatSide.position.set(-1.55, 0.35, -0.15);
                const backMain = mesh(new THREE.BoxGeometry(2.2, 0.65, 0.15), matFabric);
                backMain.position.set(0, 0.85, 0.375);
                const backSide = mesh(new THREE.BoxGeometry(0.15, 0.65, 1.2), matFabric);
                backSide.position.set(-2.0, 0.85, -0.15);
                group.add(seatMain, seatSide, backMain, backSide);
                break;
            }

            // ── Chairs ────────────────────────────────────────────────────────
            case 'chair':
            case 'dining_chair': {
                const seat    = mesh(new THREE.BoxGeometry(0.45, 0.05, 0.45), mat);
                seat.position.y = 0.45;
                const back    = mesh(new THREE.BoxGeometry(0.45, 0.5, 0.04), mat);
                back.position.set(0, 0.7, -0.2);
                const legFL   = mesh(new THREE.BoxGeometry(0.04, 0.45, 0.04), mat);
                legFL.position.set(-0.18, 0.225, 0.18);
                const legFR   = mesh(new THREE.BoxGeometry(0.04, 0.45, 0.04), mat);
                legFR.position.set(0.18, 0.225, 0.18);
                const legBL   = mesh(new THREE.BoxGeometry(0.04, 0.45, 0.04), mat);
                legBL.position.set(-0.18, 0.225, -0.18);
                const legBR   = mesh(new THREE.BoxGeometry(0.04, 0.45, 0.04), mat);
                legBR.position.set(0.18, 0.225, -0.18);
                group.add(seat, back, legFL, legFR, legBL, legBR);
                break;
            }

            // ── Tables ────────────────────────────────────────────────────────
            case 'table':
            case 'dining_table': {
                const top  = mesh(new THREE.BoxGeometry(1.8, 0.05, 0.9), mat);
                top.position.y = 0.75;
                const legs = (
                    [[-0.8, -0.4], [0.8, -0.4], [-0.8, 0.4], [0.8, 0.4]] as [number, number][]
                ).map(([x, z]) => {
                    const leg = mesh(new THREE.BoxGeometry(0.05, 0.75, 0.05), mat);
                    leg.position.set(x, 0.375, z);
                    return leg;
                });
                group.add(top, ...legs);
                break;
            }

            case 'coffee_table': {
                const top  = mesh(new THREE.BoxGeometry(1.0, 0.04, 0.6), mat);
                top.position.y = 0.45;
                const legFL   = mesh(new THREE.BoxGeometry(0.04, 0.45, 0.04), mat);
                legFL.position.set(-0.45, 0.225, -0.25);
                const legFR   = mesh(new THREE.BoxGeometry(0.04, 0.45, 0.04), mat);
                legFR.position.set(0.45, 0.225, -0.25);
                const legBL   = mesh(new THREE.BoxGeometry(0.04, 0.45, 0.04), mat);
                legBL.position.set(-0.45, 0.225, 0.25);
                const legBR   = mesh(new THREE.BoxGeometry(0.04, 0.45, 0.04), mat);
                legBR.position.set(0.45, 0.225, 0.25);
                group.add(top, legFL, legFR, legBL, legBR);
                break;
            }

            case 'entrance_table': {
                const top  = mesh(new THREE.BoxGeometry(1.2, 0.03, 0.35), mat);
                top.position.y = 0.75;
                const legFL   = mesh(new THREE.BoxGeometry(0.04, 0.75, 0.04), mat);
                legFL.position.set(-0.54, 0.375, -0.14);
                const legFR   = mesh(new THREE.BoxGeometry(0.04, 0.75, 0.04), mat);
                legFR.position.set(0.54, 0.375, -0.14);
                const legBL   = mesh(new THREE.BoxGeometry(0.04, 0.75, 0.04), mat);
                legBL.position.set(-0.54, 0.375, 0.14);
                const legBR   = mesh(new THREE.BoxGeometry(0.04, 0.75, 0.04), mat);
                legBR.position.set(0.54, 0.375, 0.14);
                group.add(top, legFL, legFR, legBL, legBR);
                break;
            }

            // ── Lighting ──────────────────────────────────────────────────────
            case 'lamp': {
                const base  = mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.04, 24), matMetal);
                base.position.y = 0.02;
                const pole  = mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 12), matMetal);
                pole.position.y = 0.72;
                const shade = mesh(new THREE.ConeGeometry(0.2, 0.28, 16, 1, true), matFabric);
                shade.position.y = 1.52;
                group.add(base, pole, shade);
                break;
            }

            // ── Decor ─────────────────────────────────────────────────────────
            case 'chimney': {
                const body = mesh(new THREE.BoxGeometry(0.8, 0.55, 0.35), matMetal);
                body.position.y = 0.275;
                const pipe = mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.9, 12), matMetal);
                pipe.position.y = 1.0;
                group.add(body, pipe);
                break;
            }

            case 'plant_01':
            case 'plant_02':
            case 'plant_03':
            case 'plant_04': {
                // Compact pot + round foliage cluster
                const pot    = mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.22, 12), mat);
                pot.position.y = 0.11;
                const foliage = mesh(new THREE.SphereGeometry(0.3, 10, 8), matGreen);
                foliage.position.y = 0.58;
                group.add(pot, foliage);
                break;
            }

            case 'plant_05':
            case 'plant_06': {
                // Tall floor plant
                const pot    = mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.3, 12), mat);
                pot.position.y = 0.15;
                const stem   = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8), matGreen);
                stem.position.y = 0.55;
                const top    = mesh(new THREE.SphereGeometry(0.35, 10, 8), matGreen);
                top.position.y = 0.95;
                group.add(pot, stem, top);
                break;
            }

            case 'plant_07':
            case 'plant_08': {
                // Wide tropical plant
                const pot    = mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.28, 12), mat);
                pot.position.y = 0.14;
                const foliage = mesh(new THREE.SphereGeometry(0.4, 10, 8), matGreen);
                foliage.position.set(0, 0.7, 0);
                foliage.scale.set(1.2, 0.8, 1.2);
                group.add(pot, foliage);
                break;
            }

            // ── Bathroom ──────────────────────────────────────────────────────
            case 'shower_glass_panel': {
                const panel = mesh(new THREE.BoxGeometry(0.9, 2.0, 0.012), matGlass);
                panel.position.y = 1.0;
                // Frame
                const frameTop = mesh(new THREE.BoxGeometry(0.9, 0.03, 0.02), matMetal);
                frameTop.position.y = 2.015;
                group.add(panel, frameTop);
                break;
            }

            case 'toilet_radiator': {
                const body = mesh(new THREE.BoxGeometry(0.5, 1.2, 0.06), matMetal);
                body.position.y = 0.6;
                // Horizontal rails
                for (let i = 0; i < 6; i++) {
                    const rail = mesh(new THREE.BoxGeometry(0.48, 0.025, 0.06), matMetal);
                    rail.position.y = 0.1 + i * 0.2;
                    group.add(rail);
                }
                group.add(body);
                break;
            }

            // ── AI element: generic placeholder ───────────────────────────────
            case 'ai_element':
            default: {
                const isPlant = (type as string).includes('plant');
                if (isPlant) {
                    const pot    = mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.22, 12), mat);
                    pot.position.y = 0.11;
                    const foliage = mesh(new THREE.SphereGeometry(0.28, 10, 8), matGreen);
                    foliage.position.y = 0.56;
                    group.add(pot, foliage);
                } else {
                    // Generic box fallback for future / unknown types
                    const body = mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), mat);
                    body.position.y = 0.35;
                    group.add(body);
                }
                break;
            }
        }

        return group;
    }

    // ── Disposal helpers ───────────────────────────────────────────────────────

    /**
     * Recursively dispose all geometry and materials in a group.
     * Prevents GPU memory leaks from per-thumbnail objects.
     * (01-BIM §4.4: idempotent; 01-BIM §4.5: no orphaned geometry)
     */
    private disposeGroup(group: THREE.Group): void {
        group.traverse((obj) => {
            if (!(obj instanceof THREE.Mesh)) return;

            obj.geometry.dispose();

            if (Array.isArray(obj.material)) {
                for (const m of obj.material) m.dispose();
            } else if (obj.material) {
                (obj.material as THREE.Material).dispose();
            }
        });
    }
}
