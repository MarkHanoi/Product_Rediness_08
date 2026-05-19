/**
 * @file AIElementEngine.ts
 * @description Config-driven THREE.js geometry builder for AI-generated elements.
 * Uses GEOMETRIC classification (shape + size + position) — never relies on component ID naming.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { AIElementConfig, AIComponent, AIMaterial } from './AIElementConfig';

const DEG2RAD = Math.PI / 180;

// ── Geometric role classifier ─────────────────────────────────────────────────
// Determines the semantic role of each component purely from geometry.
// This is immune to Claude naming components inconsistently.

type GeomRole = 'base' | 'pole' | 'shade' | 'collar' | 'joint' | 'foot' | 'trim' | 'visible' | 'hidden';

interface ClassifiedComponent {
    comp: AIComponent;
    role: GeomRole;
}

function classifyComponents(components: AIComponent[]): ClassifiedComponent[] {
    // Step 1: collect key metrics for each component
    const metrics = components.map(comp => {
        const d = comp.dimensions;
        const id = comp.id.toLowerCase();

        // Explicit hide by ID keyword (cables, cords etc.)
        const explicitHide = ['cable','cord','wire','plug','switch','outlet'].some(k => id.includes(k))
            || comp.visible === false
            || (comp.tags ?? []).some(t => ['cable','decorative'].includes(t));

        let mainRadius = 0;
        let height = 0;
        let isFlat = false;

        switch (comp.shape) {
            case 'cylinder':
            case 'cone':
                mainRadius = d.radiusBottom ?? 0;
                height = d.height ?? 0;
                isFlat = height > 0 && (mainRadius / height) > 1.5; // wide & short = flat disc
                break;
            case 'sphere':
                mainRadius = d.radius ?? 0;
                height = mainRadius * 2;
                break;
            case 'torus':
                mainRadius = d.radius ?? 0;
                height = (d.tube ?? 0) * 2;
                break;
            case 'box':
                mainRadius = Math.max(d.width ?? 0, d.depth ?? 0) / 2;
                height = d.height ?? 0;
                isFlat = height > 0 && (mainRadius / height) > 1.5;
                break;
        }

        return { comp, mainRadius, height, isFlat, explicitHide, id };
    });

    // Step 2: find reference values for classification thresholds
    const cylinders = metrics.filter(m => m.comp.shape === 'cylinder' || m.comp.shape === 'cone');
    const spheres   = metrics.filter(m => m.comp.shape === 'sphere');

    // Largest sphere radius → this is the shade/globe
    const maxSphereR = Math.max(0, ...spheres.map(m => m.mainRadius));

    // Tallest narrow cylinder → this is the pole
    const tallCyls = cylinders.filter(m => !m.isFlat).sort((a,b) => b.height - a.height);
    const poleHeight = tallCyls[0]?.height ?? 0;
    const poleRadius = tallCyls[0]?.mainRadius ?? 0;

    // Widest flat cylinder → this is the base
    const flatCyls = cylinders.filter(m => m.isFlat).sort((a,b) => b.mainRadius - a.mainRadius);
    const baseRadius = flatCyls[0]?.mainRadius ?? 0;

    // Step 3: assign roles
    const classified: ClassifiedComponent[] = [];

    for (const m of metrics) {
        let role: GeomRole = 'visible';

        if (m.explicitHide) {
            role = 'hidden';
        } else if (m.comp.shape === 'torus') {
            // Only show torus if it's close in radius to the shade (a rim) or explicitly a collar keyword
            const isShadeRim = maxSphereR > 0 && Math.abs(m.mainRadius - maxSphereR) < 0.05;
            const isCollarId = ['collar','cup','socket','rim','band'].some(k => m.id.includes(k));
            role = (isShadeRim || isCollarId) ? 'trim' : 'hidden';
        } else if (m.comp.shape === 'sphere') {
            if (m.mainRadius >= maxSphereR * 0.85) {
                role = 'shade'; // largest sphere = globe shade
            } else if (m.mainRadius < maxSphereR * 0.4) {
                role = 'joint'; // small sphere = crossing joint or foot
            } else {
                role = 'visible';
            }
        } else if (m.comp.shape === 'cylinder' || m.comp.shape === 'cone') {
            if (m.isFlat && m.mainRadius >= baseRadius * 0.85) {
                role = 'base';
            } else if (!m.isFlat && poleHeight > 0 && m.height >= poleHeight * 0.7 && m.mainRadius <= poleRadius * 2.5) {
                role = 'pole';
            } else if (!m.isFlat && m.height < poleHeight * 0.15 && m.mainRadius > poleRadius * 1.5) {
                role = 'collar'; // short wide cylinder near top = collar cup
            } else {
                role = 'visible';
            }
        } else if (m.comp.shape === 'box') {
            role = m.isFlat ? 'base' : 'visible';
        }

        classified.push({ comp: m.comp, role });
    }

    console.log('[AIElementEngine] Classification:', classified.map(c => `${c.comp.id}→${c.role}`).join(', '));
    return classified;
}

export class AIElementEngine {
    private static materialCache = new Map<string, THREE.MeshStandardMaterial>();

    static create(config: AIElementConfig, colorOverride?: string): THREE.Group {
        const group = new THREE.Group();
        group.name = config.displayName;

        const classified = classifyComponents(config.components);

        // Build all non-hidden components
        for (const { comp, role } of classified) {
            if (role === 'hidden') continue;
            const mesh = AIElementEngine.buildComponent(comp, colorOverride);
            if (mesh) {
                (mesh as any).__geomRole = role;
                group.add(mesh);
            }
        }

        // Post-assembly: ground → snap shade to structure top → snap collar to shade bottom
        AIElementEngine.groundClamp(group);
        AIElementEngine.snapShadeToStructureTop(group, classified);
        AIElementEngine.snapCollarToShadeBottom(group, classified);

        return group;
    }

    static computeBoundingBox(config: AIElementConfig): THREE.Box3 {
        const { w, h, d } = config.boundingBox;
        return new THREE.Box3(
            new THREE.Vector3(-w / 2, 0, -d / 2),
            new THREE.Vector3(w / 2, h, d / 2)
        );
    }

    static rebuildComponent(
        group: THREE.Group,
        componentId: string,
        config: AIElementConfig,
        colorOverride?: string
    ): void {
        const existing = group.getObjectByName(`ai_comp_${componentId}`);
        if (existing) {
            AIElementEngine.disposeMesh(existing as THREE.Mesh);
            group.remove(existing);
        }
        const component = config.components.find(c => c.id === componentId);
        if (!component) return;
        const mesh = AIElementEngine.buildComponent(component, colorOverride);
        if (mesh) group.add(mesh);
    }

    static clearMaterialCache(): void {
        AIElementEngine.materialCache.clear();
    }

    // ── Post-assembly ─────────────────────────────────────────────────────────

    private static groundClamp(group: THREE.Group): void {
        group.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(group);
        if (!box.isEmpty() && box.min.y < 0) {
            group.position.y -= box.min.y;
        }
    }

    /**
     * Moves shade/globe meshes so their bottom sits exactly at the top
     * of the tallest base/pole/collar mesh.
     */
    private static snapShadeToStructureTop(group: THREE.Group, classified: ClassifiedComponent[]): void {
        const shadeIds     = new Set(classified.filter(c => c.role === 'shade').map(c => `ai_comp_${c.comp.id}`));
        const structureIds = new Set(classified.filter(c => ['base','pole','joint','collar','visible'].includes(c.role)).map(c => `ai_comp_${c.comp.id}`));

        const shadeMeshes:     THREE.Object3D[] = [];
        const structureMeshes: THREE.Object3D[] = [];

        group.traverse(obj => {
            if (shadeIds.has(obj.name))     shadeMeshes.push(obj);
            if (structureIds.has(obj.name)) structureMeshes.push(obj);
        });

        if (shadeMeshes.length === 0 || structureMeshes.length === 0) return;

        group.updateMatrixWorld(true);

        let structureTop = 0;
        for (const m of structureMeshes) {
            const box = new THREE.Box3().setFromObject(m);
            if (box.max.y > structureTop) structureTop = box.max.y;
        }

        let shadeBottom = Infinity;
        for (const m of shadeMeshes) {
            const box = new THREE.Box3().setFromObject(m);
            if (box.min.y < shadeBottom) shadeBottom = box.min.y;
        }

        const delta = structureTop - shadeBottom;
        console.log(`[AIElementEngine] snapShade: top=${structureTop.toFixed(3)} shadeBot=${shadeBottom.toFixed(3)} delta=${delta.toFixed(3)}`);

        if (Math.abs(delta) > 0.005) {
            for (const m of shadeMeshes) m.position.y += delta;
        }
    }

    /**
     * Moves collar/trim meshes so they sit at the bottom of the shade.
     */
    private static snapCollarToShadeBottom(group: THREE.Group, classified: ClassifiedComponent[]): void {
        const collarIds = new Set(classified.filter(c => c.role === 'collar' || c.role === 'trim').map(c => `ai_comp_${c.comp.id}`));
        const shadeIds  = new Set(classified.filter(c => c.role === 'shade').map(c => `ai_comp_${c.comp.id}`));

        const collarMeshes: THREE.Object3D[] = [];
        const shadeMeshes:  THREE.Object3D[] = [];

        group.traverse(obj => {
            if (collarIds.has(obj.name)) collarMeshes.push(obj);
            if (shadeIds.has(obj.name))  shadeMeshes.push(obj);
        });

        if (collarMeshes.length === 0 || shadeMeshes.length === 0) return;

        group.updateMatrixWorld(true);

        let shadeBottom = Infinity;
        let shadeCX = 0, shadeCZ = 0;
        for (const m of shadeMeshes) {
            const box = new THREE.Box3().setFromObject(m);
            if (box.min.y < shadeBottom) shadeBottom = box.min.y;
            shadeCX = (box.min.x + box.max.x) / 2;
            shadeCZ = (box.min.z + box.max.z) / 2;
        }

        for (const m of collarMeshes) {
            const box = new THREE.Box3().setFromObject(m);
            const h = box.max.y - box.min.y;
            m.position.y = shadeBottom - h / 2;
            m.position.x = shadeCX;
            m.position.z = shadeCZ;
        }
    }

    // ── Private builders ──────────────────────────────────────────────────────

    private static buildComponent(comp: AIComponent, colorOverride?: string): THREE.Mesh | null {
        const geometry = AIElementEngine.buildGeometry(comp);
        if (!geometry) return null;

        const material = AIElementEngine.buildMaterial(comp.material, colorOverride);
        const mesh = new THREE.Mesh(geometry, material);

        if (comp.rotation) {
            mesh.rotation.set(
                (comp.rotation.x ?? 0) * DEG2RAD,
                (comp.rotation.y ?? 0) * DEG2RAD,
                (comp.rotation.z ?? 0) * DEG2RAD
            );
        }

        mesh.position.set(comp.position.x, comp.position.y, comp.position.z);
        mesh.name = `ai_comp_${comp.id}`;
        mesh.castShadow    = !(comp.material.transparent ?? false);
        mesh.receiveShadow = true;

        return mesh;
    }

    private static buildGeometry(comp: AIComponent): THREE.BufferGeometry | null {
        const d = comp.dimensions;
        const seg = d.segments ?? 24;

        switch (comp.shape) {
            case 'box':
                if (d.width == null || d.height == null || d.depth == null) return null;
                return new THREE.BoxGeometry(d.width, d.height, d.depth);
            case 'cylinder':
                if (d.radiusBottom == null || d.height == null || d.height <= 0) return null;
                return new THREE.CylinderGeometry(d.radiusTop ?? d.radiusBottom, d.radiusBottom, d.height, seg);
            case 'sphere':
                if (d.radius == null) return null;
                return new THREE.SphereGeometry(d.radius, seg, seg);
            case 'cone':
                if (d.radiusBottom == null || d.height == null || d.height <= 0) return null;
                return new THREE.ConeGeometry(d.radiusBottom, d.height, seg);
            case 'torus':
                if (d.radius == null || d.tube == null) return null;
                return new THREE.TorusGeometry(d.radius, d.tube, seg, seg * 2);
            default:
                console.error(`[AIElementEngine] Unknown shape "${comp.shape}"`);
                return null;
        }
    }

    private static buildMaterial(mat: AIMaterial, colorOverride?: string): THREE.MeshStandardMaterial {
        const key = `${colorOverride ?? mat.color}_${mat.metalness}_${mat.roughness}_${mat.transparent}_${mat.opacity}`;
        if (this.materialCache.has(key)) return this.materialCache.get(key)!;

        const material = new THREE.MeshStandardMaterial({
            color:       new THREE.Color(colorOverride ?? mat.color),
            metalness:   mat.metalness,
            roughness:   mat.roughness,
            transparent: mat.transparent ?? false,
            opacity:     mat.transparent ? (mat.opacity ?? 1) : 1,
        });

        this.materialCache.set(key, material);
        return material;
    }

    private static disposeMesh(mesh: THREE.Mesh): void {
        mesh.geometry?.dispose();
        if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m: THREE.Material) => m.dispose());
        } else if (mesh.material) {
            (mesh.material as THREE.Material).dispose();
        }
    }
}