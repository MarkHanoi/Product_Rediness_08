/**
 * LevelVisualizer — Revit-style datum line rendering authority for BIM levels.
 *
 * §02 §8.1  Level objects live in `levelLinesGroup` added to the scene,
 *            NOT on the scene root.
 *
 * BimManager is the DATA authority (levels Map, childrenIds, subscribers).
 * LevelVisualizer is the GEOMETRY authority (Three.js lines, sprites).
 *
 * Visual design (Revit-compatible):
 *   Each level is represented by two perpendicular dashed datum lines
 *   (X-axis and Z-axis) at the level's elevation, with a level-head bubble
 *   sprite (circle + name + elevation) at the positive end of each line.
 *   No filled planes — datum lines only.
 *
 * V/G integration:
 *   All objects carry elementType = 'LevelLine' which maps to the 'level'
 *   VG category in VGSceneApplicator. Visibility and colour are primarily
 *   controlled via the V/G panel (per-view overrides supported).
 *
 * toggleVisibility() provides a secondary scene-level on/off for the group.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { Level } from './BimKernel';

// ── Visual constants ────────────────────────────────────────────────────────

/** Golden-angle hue step → maximally distinct palette across unlimited levels. */
const HUE_STEP_DEG = 137.508;

/** Half-extent of each datum line from scene origin (metres). */
const DATUM_EXTENT = 30;

/** Dashed line properties (architectural standard). */
const DASH_SIZE = 1.5;
const GAP_SIZE  = 0.6;

/** Opacity for active / inactive levels. */
const LINE_OPACITY_ACTIVE   = 0.95;
const LINE_OPACITY_INACTIVE = 0.60;

// ── LevelVisualizer ─────────────────────────────────────────────────────────

export class LevelVisualizer {
    /**
     * All level datum lines and level-head bubbles in one group.
     * V/G toggles individual object visibility via elementType = 'LevelLine'.
     * This group provides the secondary scene-level on/off switch.
     */
    readonly levelLinesGroup: THREE.Group;

    /**
     * Backward-compat alias so BimKernel callers that reference levelsGroup
     * still compile. Points to the same group as levelLinesGroup.
     * §02 — no extra scene object added.
     */
    get levelsGroup(): THREE.Group { return this.levelLinesGroup; }

    /** Per-level THREE.Group (xLine, zLine, headX, headZ) keyed by level id. */
    private readonly levelGroups = new Map<string, THREE.Group>();

    /** insertion order → palette colour index */
    private readonly insertOrder: string[] = [];

    private activeLevelId: string | null = null;

    constructor(scene: THREE.Scene) {
        this.levelLinesGroup = new THREE.Group();
        this.levelLinesGroup.name = 'levelLinesGroup';
        scene.add(this.levelLinesGroup);
    }

    // ── Public API ────────────────────────────────────────────────────────

    /**
     * Updates which level is "active" (brighter colour, full opacity).
     * Session state only — not a semantic mutation (§02 §1.6).
     */
    setActiveLevel(id: string | null): void {
        const prev = this.activeLevelId;
        this.activeLevelId = id;
        if (prev && prev !== id) this._applyGroupStyle(prev, false);
        if (id)                  this._applyGroupStyle(id,   true);
    }

    /** Creates datum lines + level-head bubbles for a new level. */
    buildLevel(level: Level): void {
        this._disposeLevel(level.id);

        if (!this.insertOrder.includes(level.id)) {
            this.insertOrder.push(level.id);
        }

        const isActive = level.id === this.activeLevelId;
        const group = this._buildGroup(level, isActive);
        this.levelLinesGroup.add(group);
        this.levelGroups.set(level.id, group);
    }

    /** Rebuilds the visual for an already-registered level. */
    updateLevel(level: Level): void {
        if (!this.levelGroups.has(level.id)) {
            this.buildLevel(level);
            return;
        }
        this.buildLevel(level); // full rebuild (geometry change)
    }

    /** Disposes GPU objects for a single level. */
    removeLevel(id: string): void {
        this._disposeLevel(id);
        const idx = this.insertOrder.indexOf(id);
        if (idx !== -1) this.insertOrder.splice(idx, 1);
    }

    /** Shows / hides the entire datum group (secondary control; V/G is primary). */
    toggleVisibility(visible: boolean): void {
        this.levelLinesGroup.visible = visible;
    }

    /** Full GPU cleanup — call on project clear or HMR. */
    dispose(): void {
        [...this.levelGroups.keys()].forEach(id => this._disposeLevel(id));
        this.levelGroups.clear();
        this.insertOrder.length = 0;
        this.activeLevelId = null;
    }

    // ── Private — group builders ──────────────────────────────────────────

    private _buildGroup(level: Level, isActive: boolean): THREE.Group {
        const group = new THREE.Group();
        group.name  = `level-datum-${level.id}`;

        const y       = level.elevation;
        const color   = this._levelColor(level, this._indexOf(level.id), isActive);
        const opacity = isActive ? LINE_OPACITY_ACTIVE : LINE_OPACITY_INACTIVE;

        // ── X-axis datum line ─────────────────────────────────────────────
        const xLine = this._makeDashedLine(
            new THREE.Vector3(-DATUM_EXTENT, y, 0),
            new THREE.Vector3( DATUM_EXTENT, y, 0),
            color, opacity, level
        );
        group.add(xLine);

        // ── Z-axis datum line ─────────────────────────────────────────────
        const zLine = this._makeDashedLine(
            new THREE.Vector3(0, y, -DATUM_EXTENT),
            new THREE.Vector3(0, y,  DATUM_EXTENT),
            color, opacity, level
        );
        group.add(zLine);

        // ── Level-head bubbles ────────────────────────────────────────────
        const headX = this._makeLevelHead(level, color, isActive);
        headX.position.set(DATUM_EXTENT + 1, y, 0);
        group.add(headX);

        const headZ = this._makeLevelHead(level, color, isActive);
        headZ.position.set(0, y, DATUM_EXTENT + 1);
        group.add(headZ);

        // Propagate per-level isVisible flag onto each child
        const vis = level.isVisible;
        xLine.visible  = vis;
        zLine.visible  = vis;
        headX.visible  = vis;
        headZ.visible  = vis;

        // Store snapshot so _applyGroupStyle can rebuild sprites on active change.
        group.userData._levelSnapshot = level;

        return group;
    }

    private _makeDashedLine(
        from: THREE.Vector3,
        to:   THREE.Vector3,
        color: THREE.Color,
        opacity: number,
        level: Level,
    ): THREE.Line {
        const material = new THREE.LineDashedMaterial({
            color,
            transparent: true,
            opacity,
            dashSize: DASH_SIZE,
            gapSize:  GAP_SIZE,
            depthWrite: false,
        });

        const geometry = new THREE.BufferGeometry().setFromPoints([from, to]);
        const line = new THREE.Line(geometry, material);

        // LineDashedMaterial REQUIRES computeLineDistances to render dashes.
        line.computeLineDistances();

        // V/G primary control — VGSceneApplicator looks for 'LevelLine' → 'level' category.
        // §01 §3.4: Immutable identity.
        line.userData = { elementType: 'LevelLine', id: level.id };
        Object.defineProperty(line.userData, 'id',          { writable: false });
        Object.defineProperty(line.userData, 'elementType', { writable: false });

        return line;
    }

    /** Canvas-rendered circle sprite: Revit-style level head bubble. */
    private _makeLevelHead(level: Level, color: THREE.Color, isActive: boolean): THREE.Sprite {
        const size   = 256;
        const canvas = document.createElement('canvas');
        canvas.width  = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d')!;

        const hex = '#' + color.getHexString();

        // White filled circle
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2 - 6, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        // Colored border
        ctx.strokeStyle = hex;
        ctx.lineWidth   = isActive ? 10 : 6;
        ctx.stroke();

        // Level name
        ctx.fillStyle  = '#1a2035';
        ctx.textAlign  = 'center';
        ctx.textBaseline = 'middle';
        const nameSize = Math.min(60, Math.floor(size / Math.max(level.name.length, 1) * 1.4));
        ctx.font = `Bold ${Math.min(nameSize, 52)}px Arial`;
        ctx.fillText(level.name, size / 2, size * 0.38);

        // Elevation text
        ctx.font      = `${isActive ? 36 : 30}px Arial`;
        ctx.fillStyle = '#444';
        const elevStr = level.elevation >= 0
            ? `+${level.elevation.toFixed(2)}`
            : level.elevation.toFixed(2);
        ctx.fillText(elevStr, size / 2, size * 0.64);

        const texture  = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
        const sprite   = new THREE.Sprite(material);
        sprite.scale.set(3.5, 3.5, 1);

        sprite.userData = { elementType: 'LevelLine', id: level.id };

        return sprite;
    }

    // ── Private — style helpers ───────────────────────────────────────────

    private _levelColor(level: Level, index: number, isActive: boolean): THREE.Color {
        if (level.color) return new THREE.Color(level.color);
        const hue = (index * HUE_STEP_DEG) % 360;
        const s = isActive ? 100 : 65;
        const l = isActive ? 48  : 52;
        return new THREE.Color(`hsl(${hue}, ${s}%, ${l}%)`);
    }

    private _indexOf(id: string): number {
        const i = this.insertOrder.indexOf(id);
        return i >= 0 ? i : 0;
    }

    /** Re-applies opacity / color when active state changes (no full rebuild). */
    private _applyGroupStyle(id: string, isActive: boolean): void {
        const group = this.levelGroups.get(id);
        if (!group) return;
        const opacity = isActive ? LINE_OPACITY_ACTIVE : LINE_OPACITY_INACTIVE;
        group.traverse(obj => {
            if (obj instanceof THREE.Line) {
                (obj.material as THREE.LineDashedMaterial).opacity = opacity;
            }
        });
        // Rebuild sprites to update border weight / text style
        const stored = group.userData._levelSnapshot as Level | undefined;
        if (stored) {
            const color = this._levelColor(stored, this._indexOf(id), isActive);
            // Remove old sprites
            const oldSprites = group.children.filter(c => c instanceof THREE.Sprite);
            oldSprites.forEach(s => {
                const mat = (s as THREE.Sprite).material as THREE.SpriteMaterial;
                mat.map?.dispose();
                mat.dispose();
                group.remove(s);
            });
            // Add new sprites
            const headX = this._makeLevelHead(stored, color, isActive);
            headX.position.set(DATUM_EXTENT + 1, stored.elevation, 0);
            headX.visible = stored.isVisible;
            group.add(headX);
            const headZ = this._makeLevelHead(stored, color, isActive);
            headZ.position.set(0, stored.elevation, DATUM_EXTENT + 1);
            headZ.visible = stored.isVisible;
            group.add(headZ);
        }
    }

    // ── Private — disposal ────────────────────────────────────────────────

    private _disposeLevel(id: string): void {
        const group = this.levelGroups.get(id);
        if (!group) return;

        group.traverse(obj => {
            if (obj instanceof THREE.Line) {
                obj.geometry.dispose();
                (obj.material as THREE.Material).dispose();
            } else if (obj instanceof THREE.Sprite) {
                const mat = obj.material as THREE.SpriteMaterial;
                mat.map?.dispose();
                mat.dispose();
            }
        });

        this.levelLinesGroup.remove(group);
        this.levelGroups.delete(id);
    }
}
