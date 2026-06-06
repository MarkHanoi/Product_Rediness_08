// A.21.D20 (2026-06-06) — first-class kitchen appliance + cabinet-module builders.
// (SPEC-KITCHEN-WARDROBE-APPLIANCES §B)
//
// Lightweight, demo-grade box proxies — correctly SIZED (standard 600 mm
// modules) and ORIENTED (the appliance front faces the room). The D-FLE
// kitchen archetype places each appliance IN the worktop run (sink + hob +
// oven + dishwasher + washing machine, extractor over the hob); these builders
// give the placed records visible, recognisable geometry without heavy models.
//
// ORIENTATION CONTRACT: the furniture layer places an item with its BACK to
// the wall, so the local +z axis is the FRONT (faces the room). Every front-
// face detail (door, controls, tap) is therefore drawn at +z.
//
// Each builder reads data.width/length/height (the footprint the engine emits)
// and falls back to the standard module size. Material/colour come from the
// style finish on the record (data.material / data.color) where it reads well.

import * as THREE from '@pryzm/renderer-three/three';
import { IFurnitureBuilder } from './IFurnitureBuilder';
import { FurnitureData } from '../FurnitureTypes';
import { MaterialService } from '../MaterialService';

const tagEdge30 = (g: THREE.Group): void => {
    g.traverse(o => {
        if ((o as THREE.Mesh).isMesh) {
            o.userData = { ...o.userData, edgeAngleDeg: 30 };
        }
    });
};

/** Resolve the appliance body colour from the record's style finish, falling
 *  back to a brushed-steel default. Metal finish → steel; otherwise the hex. */
function bodyColorOf(data: FurnitureData, fallback: number): number {
    if (typeof data.color === 'string' && /^#?[0-9a-fA-F]{6}$/.test(data.color)) {
        return parseInt(data.color.replace('#', ''), 16);
    }
    return fallback;
}

// ── Sink (worktop module: cabinet + recessed basin + tap at the front) ───────

export class SinkBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}
    build(data: FurnitureData): THREE.Group {
        const g = new THREE.Group();
        const W = data.width || 0.60, L = data.length || 0.60, H = data.height || 0.90;
        const cab = this.materialService.getMaterial(bodyColorOf(data, 0xd9d9d9), 'standard') as THREE.MeshStandardMaterial;
        const steel = this.materialService.getMaterial(0xc4c8cc, 'standard') as THREE.MeshStandardMaterial;
        // Base cabinet
        const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, L), cab);
        body.position.set(0, H / 2, 0);
        g.add(body);
        // Recessed stainless basin set into the worktop
        const basin = new THREE.Mesh(new THREE.BoxGeometry(W * 0.7, 0.06, L * 0.7), steel);
        basin.position.set(0, H - 0.05, 0);
        g.add(basin);
        // Tap at the BACK of the basin (against the wall), arching forward
        const tap = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.25, 8), steel);
        tap.position.set(0, H + 0.12, -L * 0.28);
        g.add(tap);
        tagEdge30(g);
        return g;
    }
}

// ── Hob / cooktop (worktop module + glass-ceramic top + 4 burners) ───────────

export class HobBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}
    build(data: FurnitureData): THREE.Group {
        const g = new THREE.Group();
        const W = data.width || 0.60, L = data.length || 0.60, H = data.height || 0.90;
        const cab = this.materialService.getMaterial(bodyColorOf(data, 0xd9d9d9), 'standard') as THREE.MeshStandardMaterial;
        const glass = this.materialService.getMaterial(0x1c1c1e, 'standard') as THREE.MeshStandardMaterial;
        const burner = this.materialService.getMaterial(0x3a3a3a, 'standard') as THREE.MeshStandardMaterial;
        const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, L), cab);
        body.position.set(0, H / 2, 0);
        g.add(body);
        const top = new THREE.Mesh(new THREE.BoxGeometry(W * 0.92, 0.02, L * 0.9), glass);
        top.position.set(0, H + 0.01, 0);
        g.add(top);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
            const b = new THREE.Mesh(new THREE.CylinderGeometry(W * 0.13, W * 0.13, 0.006, 16), burner);
            b.position.set(sx * W * 0.22, H + 0.025, sz * L * 0.2);
            g.add(b);
        }
        tagEdge30(g);
        return g;
    }
}

// ── Oven (under-counter built-in: dark glass door + control strip + handle) ──

export class OvenBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}
    build(data: FurnitureData): THREE.Group {
        const g = new THREE.Group();
        const W = data.width || 0.60, L = data.length || 0.60, H = data.height || 0.90;
        const steel = this.materialService.getMaterial(bodyColorOf(data, 0xb8bcc0), 'standard') as THREE.MeshStandardMaterial;
        const glass = this.materialService.getMaterial(0x14171a, 'standard') as THREE.MeshStandardMaterial;
        const handle = this.materialService.getMaterial(0x9a9da1, 'standard') as THREE.MeshStandardMaterial;
        const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, L), steel);
        body.position.set(0, H / 2, 0);
        g.add(body);
        // Dark glass door on the FRONT (+z), lower 2/3
        const door = new THREE.Mesh(new THREE.BoxGeometry(W * 0.86, H * 0.6, 0.02), glass);
        door.position.set(0, H * 0.34, L / 2 + 0.011);
        g.add(door);
        // Control strip + handle near the top of the front
        const ctrl = new THREE.Mesh(new THREE.BoxGeometry(W * 0.86, H * 0.12, 0.02), glass);
        ctrl.position.set(0, H * 0.82, L / 2 + 0.011);
        g.add(ctrl);
        const bar = new THREE.Mesh(new THREE.BoxGeometry(W * 0.8, 0.03, 0.03), handle);
        bar.position.set(0, H * 0.66, L / 2 + 0.025);
        g.add(bar);
        tagEdge30(g);
        return g;
    }
}

// ── Dishwasher (integrated 600: front panel + recessed handle) ───────────────

export class DishwasherBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}
    build(data: FurnitureData): THREE.Group {
        const g = new THREE.Group();
        const W = data.width || 0.60, L = data.length || 0.60, H = data.height || 0.90;
        const panel = this.materialService.getMaterial(bodyColorOf(data, 0xcfd2d6), 'standard') as THREE.MeshStandardMaterial;
        const handle = this.materialService.getMaterial(0x8a8d91, 'standard') as THREE.MeshStandardMaterial;
        const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, L), panel);
        body.position.set(0, H / 2, 0);
        g.add(body);
        // Recessed bar handle across the top of the FRONT
        const bar = new THREE.Mesh(new THREE.BoxGeometry(W * 0.85, 0.04, 0.03), handle);
        bar.position.set(0, H * 0.9, L / 2 + 0.02);
        g.add(bar);
        tagEdge30(g);
        return g;
    }
}

// ── Washing machine (kitchen-mounted: front porthole door) ───────────────────

export class WashingMachineBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}
    build(data: FurnitureData): THREE.Group {
        const g = new THREE.Group();
        const W = data.width || 0.60, L = data.length || 0.60, H = data.height || 0.90;
        const body = this.materialService.getMaterial(bodyColorOf(data, 0xf2f2f2), 'standard') as THREE.MeshStandardMaterial;
        const trim = this.materialService.getMaterial(0x2a2a2a, 'standard') as THREE.MeshStandardMaterial;
        const glass = new THREE.MeshStandardMaterial({ color: 0x1a2228, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.7 });
        const cube = new THREE.Mesh(new THREE.BoxGeometry(W, H, L), body);
        cube.position.set(0, H / 2, 0);
        g.add(cube);
        // Circular porthole door on the FRONT (+z)
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(W * 0.32, W * 0.32, 0.03, 24), trim);
        ring.rotation.x = Math.PI / 2;
        ring.position.set(0, H * 0.5, L / 2 + 0.015);
        g.add(ring);
        const win = new THREE.Mesh(new THREE.CylinderGeometry(W * 0.24, W * 0.24, 0.02, 24), glass);
        win.rotation.x = Math.PI / 2;
        win.position.set(0, H * 0.5, L / 2 + 0.025);
        g.add(win);
        // Control panel strip at top front
        const ctrl = new THREE.Mesh(new THREE.BoxGeometry(W * 0.85, H * 0.12, 0.02), trim);
        ctrl.position.set(0, H * 0.88, L / 2 + 0.011);
        g.add(ctrl);
        tagEdge30(g);
        return g;
    }
}

// ── Fridge / freezer (tall free-standing: split doors + vertical handles) ────

export class FridgeBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}
    build(data: FurnitureData): THREE.Group {
        const g = new THREE.Group();
        const W = data.width || 0.60, L = data.length || 0.65, H = data.height || 1.80;
        const body = this.materialService.getMaterial(bodyColorOf(data, 0xc7ccd1), 'standard') as THREE.MeshStandardMaterial;
        const seam = this.materialService.getMaterial(0x9aa0a6, 'standard') as THREE.MeshStandardMaterial;
        const handle = this.materialService.getMaterial(0x808488, 'standard') as THREE.MeshStandardMaterial;
        const cube = new THREE.Mesh(new THREE.BoxGeometry(W, H, L), body);
        cube.position.set(0, H / 2, 0);
        g.add(cube);
        // Horizontal seam splitting fridge (upper) / freezer (lower) on the FRONT
        const seamM = new THREE.Mesh(new THREE.BoxGeometry(W * 0.98, 0.015, 0.01), seam);
        seamM.position.set(0, H * 0.62, L / 2 + 0.006);
        g.add(seamM);
        // Two vertical handles on the right edge of the front
        for (const sy of [H * 0.78, H * 0.45]) {
            const h = new THREE.Mesh(new THREE.BoxGeometry(0.03, H * 0.2, 0.03), handle);
            h.position.set(W * 0.4, sy, L / 2 + 0.02);
            g.add(h);
        }
        tagEdge30(g);
        return g;
    }
}

// ── Extractor hood (wall-mounted over the hob: angled canopy + chimney) ──────

export class ExtractorBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}
    build(data: FurnitureData): THREE.Group {
        const g = new THREE.Group();
        const W = data.width || 0.60, L = data.length || 0.45, H = data.height || 0.45;
        const steel = this.materialService.getMaterial(bodyColorOf(data, 0xbfc4c9), 'standard') as THREE.MeshStandardMaterial;
        // Canopy body (the visible hood) at the bottom of the envelope
        const canopy = new THREE.Mesh(new THREE.BoxGeometry(W, H * 0.45, L), steel);
        canopy.position.set(0, H * 0.22, 0);
        g.add(canopy);
        // Chimney duct rising to the ceiling-adjacent baseOffset, narrower
        const chimney = new THREE.Mesh(new THREE.BoxGeometry(W * 0.35, H * 0.6, L * 0.35), steel);
        chimney.position.set(0, H * 0.7, -L * 0.2);
        g.add(chimney);
        tagEdge30(g);
        return g;
    }
}

// ── Cabinet modules (generic base + wall units the run is composed from) ─────

export class BaseUnitBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}
    build(data: FurnitureData): THREE.Group {
        const g = new THREE.Group();
        const W = data.width || 0.60, L = data.length || 0.60, H = data.height || 0.90;
        const cab = this.materialService.getMaterial(bodyColorOf(data, 0xe4d5b8), 'standard') as THREE.MeshStandardMaterial;
        const door = this.materialService.getMaterial(Math.max(0, bodyColorOf(data, 0xe4d5b8) - 0x0d0d0d), 'standard') as THREE.MeshStandardMaterial;
        const pull = this.materialService.getMaterial(0x404040, 'standard') as THREE.MeshStandardMaterial;
        const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, L), cab);
        body.position.set(0, H / 2, 0);
        g.add(body);
        // Worktop slab over the cabinet
        const top = new THREE.Mesh(new THREE.BoxGeometry(W, 0.04, L + 0.02), door);
        top.position.set(0, H + 0.02, 0);
        g.add(top);
        // Door + handle on the FRONT
        const front = new THREE.Mesh(new THREE.BoxGeometry(W * 0.92, H * 0.85, 0.015), door);
        front.position.set(0, H * 0.45, L / 2 + 0.008);
        g.add(front);
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.1, 0.02), pull);
        bar.position.set(W * 0.38, H * 0.78, L / 2 + 0.02);
        g.add(bar);
        tagEdge30(g);
        return g;
    }
}

export class WallUnitBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}
    build(data: FurnitureData): THREE.Group {
        const g = new THREE.Group();
        const W = data.width || 0.60, L = data.length || 0.35, H = data.height || 0.70;
        const cab = this.materialService.getMaterial(bodyColorOf(data, 0xe4d5b8), 'standard') as THREE.MeshStandardMaterial;
        const door = this.materialService.getMaterial(Math.max(0, bodyColorOf(data, 0xe4d5b8) - 0x0d0d0d), 'standard') as THREE.MeshStandardMaterial;
        const pull = this.materialService.getMaterial(0x404040, 'standard') as THREE.MeshStandardMaterial;
        const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, L), cab);
        body.position.set(0, H / 2, 0);
        g.add(body);
        const front = new THREE.Mesh(new THREE.BoxGeometry(W * 0.92, H * 0.9, 0.015), door);
        front.position.set(0, H * 0.5, L / 2 + 0.008);
        g.add(front);
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.08, 0.02), pull);
        bar.position.set(W * 0.38, H * 0.12, L / 2 + 0.02);
        g.add(bar);
        tagEdge30(g);
        return g;
    }
}
