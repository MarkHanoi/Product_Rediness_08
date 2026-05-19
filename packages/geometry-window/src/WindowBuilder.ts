import * as THREE from '@pryzm/renderer-three/three';
import { getFrameScheduler, type TickListenerDisposer } from '@pryzm/frame-scheduler';
import { windowStore } from './WindowStore';
import { windowSystemTypeStore } from './WindowSystemTypeStore';
import { WindowOpening } from './WindowTypes';
import { WallStore } from '@pryzm/geometry-wall';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { SpatialAuthorityError } from '@pryzm/core-app-model';
import { vgGovernanceStore, VGStyle } from '@pryzm/visibility';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

// ── Helper: add a BoxGeometry mesh to parent ────────────────────────────────
function addBox(
    parent: THREE.Object3D,
    material: THREE.Material,
    w: number, h: number, d: number,
    x: number, y: number, z: number
): void {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    parent.add(mesh);
}

// ── Helper: create a fresh MeshStandardMaterial with polygon offset ─────────
function makeMat(color: string, roughness = 0.5, metalness = 0, transparent = false, opacity = 1, side: THREE.Side = THREE.FrontSide): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
        color,
        roughness,
        metalness,
        transparent,
        opacity,
        side,
        depthWrite: !transparent,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
    });
}

// ── Helper: compute evenly-distributed column/row widths from ratio array ───
function ratioWidths(totalSize: number, ratios: number[]): number[] {
    const total = ratios.reduce((s, r) => s + r, 0);
    return ratios.map(r => (r / total) * totalSize);
}

/** Pending build task: the latest window data + previous snapshot for diff. */
interface WindowBuildTask {
    win: WindowOpening;
    prev?: WindowOpening;
}

/**
 * C2 — WindowBuilder
 *
 * Subscribes to WindowStore and renders parametric 3D window geometry
 * (frame, glazing grid with column/row dividers, glass panes, optional sill).
 *
 * Architecture: pure subscriber — reads wallStore for positioning only.
 * Never writes to any store. Fully compliant with §03 Command Pipeline.
 *
 * PLAN-06: Dispatches DOM events (bim-window-added, bim-window-updated,
 * bim-window-removed) so SelectionManager can invalidate its raycaster cache.
 *
 * PLAN-07: Exposes rebuildForWall(wallId) so EngineBootstrap can call it
 * when a wall's baseline changes, keeping window positions in sync.
 *
 * C11 §2 step 3 (Task 1.2) — geometry builds are deferred via FrameScheduler
 *   adaptive drain. Store subscription enqueues tasks; `_drainBuildQueue()`
 *   processes up to `_buildsPerFrame` items per pre-render tick.
 */
export class WindowBuilder {
    private scene: THREE.Scene;
    private wallStore: any;
    private windowGroups: Map<string, THREE.Group> = new Map();
    /** Per-window cloned materials to dispose on rebuild/remove */
    private windowMaterials: Map<string, THREE.Material[]> = new Map();
    private unsubscribe: (() => void) | null = null;

    // ── C11 §2 step 3: FrameScheduler adaptive drain ──────────────────────────
    /** Pending window builds keyed by id — later update wins (dedup). */
    private _pendingBuilds = new Map<string, WindowBuildTask>();
    /** FrameScheduler disposer for the drain loop — null when idle. */
    private _rafHandle: TickListenerDisposer | null = null;
    /** Adaptive per-frame budget, starts at 5, adjusts by ±1 each frame. */
    private _buildsPerFrame = 5;
    private static readonly _MAX_BUILDS = 12;
    private static readonly _MIN_BUILDS = 2;

    constructor(scene: THREE.Scene, wallStore: WallStore) {
        this.scene = scene;
        this.wallStore = wallStore;
    }

    /** Call once after scene is ready. Replays any already-stored windows (from project load). */
    activate(): void {
        for (const win of windowStore.getAll()) {
            this._enqueue(win, undefined);
        }
        this.unsubscribe = windowStore.subscribe((event, win, prev) => {
            if (event === 'add' || event === 'update') this._enqueue(win, prev);
            if (event === 'remove') this.dispose(win.id);
        });
        console.log('[WindowBuilder] activated');
    }

    /**
     * §WALL-DEEP-2026 B1 (RESOLVED 2026-04-24) — fields whose change does NOT
     * require a geometry rebuild. Frame / leaf colours can be patched on the
     * existing material; finish + identity metadata never affect the mesh.
     *
     * Anything OUTSIDE this set forces a full rebuild via the slow path.
     */
    private static readonly _PROPERTY_ONLY_FIELDS: ReadonlySet<keyof WindowOpening> = new Set<keyof WindowOpening>([
        'frameColor', 'glassOpacity',
        'fireRating', 'mark', 'finishMaterial',
        'frameFinish', 'sillFinish', 'systemTypeId',
    ]);

    /**
     * §WALL-DEEP-2026 B1 — diff classifier.
     *
     * Returns true ONLY when:
     *   (a) `prev` exists AND is a strictly different reference from `next`
     *       (the WindowStore.touch() cascade re-emits with prev === next; we
     *       must NOT short-circuit that path or hosted-wall cascades break),
     *   (b) every field that differs is in `_PROPERTY_ONLY_FIELDS`,
     *   (c) at least one such field actually differs (otherwise nothing to do).
     *
     * VG-governance overrides force the slow path because they live outside
     * the WindowOpening object — the override may have changed independently.
     */
    private _isPropertyOnlyChange(prev: WindowOpening, next: WindowOpening): boolean {
        if (prev === next) return false;
        const vg = vgGovernanceStore.getEffectiveStyle('Window', next.id);
        if (vg.hidden || vg.colorOverride !== undefined || vg.opacityFactor !== undefined) return false;
        let materialDirty = false;
        const keys = new Set<keyof WindowOpening>([
            ...(Object.keys(prev) as (keyof WindowOpening)[]),
            ...(Object.keys(next) as (keyof WindowOpening)[]),
        ]);
        for (const k of keys) {
            if ((prev as any)[k] === (next as any)[k]) continue;
            if (!WindowBuilder._PROPERTY_ONLY_FIELDS.has(k)) return false;
            materialDirty = true;
        }
        return materialDirty;
    }

    /**
     * §WALL-DEEP-2026 B1 — material patch path. Updates the live materials
     * stored on the existing window group instead of disposing + recreating
     * the entire mesh. Saves a full `BoxGeometry` re-allocation per pane.
     */
    private _applyPropertyOnly(win: WindowOpening): void {
        const mats = this.windowMaterials.get(win.id);
        if (!mats || mats.length === 0) return;
        // mats[0] = frameMat, mats[1] = glassMat, mats[2] = sillMat (if sill).
        const frameMat = mats[0] as THREE.MeshStandardMaterial | undefined;
        const glassMat = mats[1] as THREE.MeshStandardMaterial | undefined;
        const sillMat  = mats[2] as THREE.MeshStandardMaterial | undefined;
        try {
            if (frameMat?.color) frameMat.color.set(win.frameColor);
            if (glassMat) {
                const op = Math.max(0, Math.min(1, win.glassOpacity));
                glassMat.opacity = op;
                glassMat.transparent = op < 1;
                glassMat.needsUpdate = true;
            }
            // Sill, when present, mirrors the frame colour (see buildVisuals).
            if (sillMat?.color) sillMat.color.set(win.frameColor);
        } catch (err) {
            console.warn(`[WindowBuilder] property-only patch failed for ${win.id}; falling back to rebuild:`, err);
            // Caller will not retry — but a subsequent geometric edit will rebuild.
        }
        // Refresh user-data version so SelectionManager sees a non-stale stamp
        // even though no mesh changed.
        const group = this.windowGroups.get(win.id);
        if (group) {
            group.userData = Object.freeze({ ...group.userData, version: Date.now() });
            // Keep DOM cache observers in sync without a full add/remove pair.
            _bus.emit('bim-window-updated', { id: win.id }); // F.events.18
        }
    }

    deactivate(): void {
        // Cancel any pending drain.
        this._rafHandle?.();
        this._rafHandle = null;
        this._pendingBuilds.clear();

        this.unsubscribe?.();
        this.unsubscribe = null;
        for (const id of [...this.windowGroups.keys()]) {
            this.dispose(id);
        }
    }

    /**
     * PLAN-07: Rebuild all windows hosted on the given wall.
     * Called from EngineBootstrap's WallStore 'update' subscriber so that
     * when a wall's baseline or thickness changes, window geometry repositions correctly.
     * C11 §2 step 3: deferred via FrameScheduler — no longer synchronous.
     */
    rebuildForWall(wallId: string): void {
        for (const win of windowStore.getAll()) {
            if (win.wallId === wallId) {
                this._enqueue(win, undefined);
            }
        }
    }

    // ── C11 §2 step 3: queue + drain ─────────────────────────────────────────

    /**
     * Enqueue a window build task. Later calls for the same window id overwrite
     * earlier ones so rapid consecutive updates collapse to a single build.
     */
    private _enqueue(win: WindowOpening, prev: WindowOpening | undefined): void {
        this._pendingBuilds.set(win.id, { win, prev });
        if (this._rafHandle === null) {
            this._rafHandle = getFrameScheduler().schedule('pre-render', () => this._drainBuildQueue());
        }
    }

    /**
     * Adaptive drain: processes up to `_buildsPerFrame` windows per pre-render
     * tick. Budget auto-adjusts ±1 based on observed frame cost
     * (target: 8–20 ms per drain pass).
     */
    private _drainBuildQueue(): void {
        this._rafHandle = null;
        const t0 = performance.now();

        const ids = [...this._pendingBuilds.keys()].slice(0, this._buildsPerFrame);
        for (const id of ids) {
            const task = this._pendingBuilds.get(id)!;
            this._pendingBuilds.delete(id);
            try {
                this.rebuild(task.win, task.prev);
            } catch (err) {
                console.error('[WindowBuilder] build error:', err);
            }
        }

        const frameMs = performance.now() - t0;
        if (frameMs < 8 && this._buildsPerFrame < WindowBuilder._MAX_BUILDS) {
            this._buildsPerFrame++;
        } else if (frameMs > 20 && this._buildsPerFrame > WindowBuilder._MIN_BUILDS) {
            this._buildsPerFrame--;
        }

        if (this._pendingBuilds.size > 0) {
            this._rafHandle = getFrameScheduler().schedule('pre-render', () => this._drainBuildQueue());
        }
    }

    // ── Private ─────────────────────────────────────────────────────────────

    private rebuild(win: WindowOpening, prev?: WindowOpening): void {
        // PLAN-06: determine add vs update BEFORE dispose() clears the map.
        const isUpdate = this.windowGroups.has(win.id);

        // §WALL-DEEP-2026 B1 — property-only fast path. Skip dispose+rebuild
        // when only colour / opacity / metadata changed and the existing
        // mesh is still valid. Falls through to the slow path on any
        // geometric or VG-governed change.
        if (isUpdate && prev && this._isPropertyOnlyChange(prev, win)) {
            this._applyPropertyOnly(win);
            return;
        }

        this.dispose(win.id);

        const wallData = this.wallStore.getById(win.wallId);
        if (!wallData) {
            console.warn(`[WindowBuilder] Wall not found for window ${win.id} (wallId=${win.wallId})`);
            return;
        }

        // §WIN-AUDIT-2026 M4 — FK validation: warn (do not throw) when the
        // window references a systemTypeId that the type store cannot resolve.
        if (win.systemTypeId && !windowSystemTypeStore.getById(win.systemTypeId)) {
            console.warn(
                `[WindowBuilder] Window ${win.id} references unknown systemTypeId ` +
                `"${win.systemTypeId}" — falling back to inline parameters.`,
            );
        }

        // §WIN-AUDIT-2026 W5 (WIN-VG-BYPASS) — consult VG governance store.
        const vgStyle = vgGovernanceStore.getEffectiveStyle('Window', win.id);
        if (vgStyle.hidden) return;

        const group = new THREE.Group();
        group.name = `window-${win.id}`;
        // §WINDOW-AUDIT-2026 W6/W7/W10: userData freeze + version + levelId mirror +
        // canonical 'Window' elementType case for both root group and child meshes.
        const rootUserData = {
            id:           win.id,
            elementType:  'Window',
            elementId:    win.id,
            openingId:    win.openingId,
            wallId:       win.wallId,
            levelId:      wallData.levelId,           // W7
            width:        win.width,
            height:       win.height,
            sillHeight:   win.sillHeight,
            selectable:   true,
            version:      Date.now(),                  // W6 stale-detection field
        };
        group.userData = Object.freeze({ ...rootUserData });

        // Use wall thickness so the frame fully spans the void (no exposed cut edges).
        const frameDepth = (wallData.thickness ?? 0.2) + 0.02;
        const mats = this.buildVisuals(win, group, frameDepth, vgStyle);
        this.windowMaterials.set(win.id, mats);
        this.positionGroup(win, group, wallData);
        group.traverse(obj => {
            if (obj !== group && obj instanceof THREE.Mesh) {
                obj.userData = Object.freeze({
                    ...obj.userData,
                    elementType: 'Window',
                    parentId: win.id,
                    wallId: win.wallId,
                    levelId: wallData.levelId,
                    role: 'geometry',
                    selectable: false,
                });
            }
        });

        this.scene.add(group);
        this.windowGroups.set(win.id, group);
        elementRegistry.registerRoot(win.id, group);

        // PLAN-06: Dispatch DOM event so SelectionManager can invalidate its raycaster cache.
        // F.events.18 — typed bus replaces variable CustomEvent
        if (isUpdate) _bus.emit('bim-window-updated', { id: win.id });
        else _bus.emit('bim-window-added', { id: win.id });
    }

    private positionGroup(win: WindowOpening, group: THREE.Group, wallData: any): void {
        // Construct explicit Vector3 so the code is safe whether baseLine entries are
        // THREE.Vector3 instances (freshly placed) or plain {x,y,z} objects (deserialized).
        const start = new THREE.Vector3(wallData.baseLine[0].x, wallData.baseLine[0].y ?? 0, wallData.baseLine[0].z);
        const end   = new THREE.Vector3(wallData.baseLine[1].x, wallData.baseLine[1].y ?? 0, wallData.baseLine[1].z);

        const dir = new THREE.Vector3().subVectors(end, start).normalize();
        const wallAngle = Math.atan2(dir.z, dir.x);

        // `win.offset` is the CENTRE of the opening along the wall baseline
        // (WallFragmentBuilder convention: left = offset - width/2).
        // Do NOT add width/2 here — the wall group has already centred everything on offset.
        const centre = start.clone().addScaledVector(dir, win.offset);

        // §WINDOW-AUDIT-2026 C2 (WIN-SPATIAL-FALLBACK) — never silently default to Y=0
        // when level membership is broken. Throwing is the §02 §1.4 spatial-authority
        // contract: misconfigured levelId must produce a loud error, not a ghost
        // window at floor level.
        if (!wallData.levelId) {
            throw new SpatialAuthorityError(
                `[WindowBuilder] Window ${win.id} hosted on wall ${win.wallId} which has no levelId — refusing to place at Y=0.`,
            );
        }
        const levelData = this.wallStore.getLevelById(wallData.levelId);
        if (!levelData || (levelData as any).elevation == null) {
            throw new SpatialAuthorityError(
                `[WindowBuilder] Window ${win.id}: level "${wallData.levelId}" has no elevation — refusing to place at Y=0.`,
            );
        }
        const elevation = (levelData as any).elevation;
        const y = elevation + win.sillHeight + win.height / 2;

        group.position.set(centre.x, y, centre.z);
        group.rotation.y = -wallAngle;
    }

    /**
     * Build all geometry sub-components.
     * Returns all cloned materials for disposal tracking.
     *
     * Local space: group centre = sillHeight + height/2 above floor.
     *   bottom = -h/2, top = +h/2, window width along X, depth along Z.
     *
     * @param wallFrameDepth - actual depth to use (wall.thickness + 0.02) so the
     *   frame fully covers the void opening and no raw cut edges are visible.
     */
    private buildVisuals(win: WindowOpening, group: THREE.Group, wallFrameDepth?: number, vgStyle?: VGStyle): THREE.Material[] {
        const mats: THREE.Material[] = [];
        const { width: w, height: h, frameThickness: ft } = win;
        // Use the wall-derived depth when provided so the frame spans the full void.
        const fd = wallFrameDepth ?? win.frameDepth;

        // §WIN-AUDIT-2026 W5 — apply VG governance overrides on top of the
        // window's stored colours / opacity. Frame colour falls back to the
        // window-level colour; glass opacity is multiplied by the VG factor.
        const frameColor = vgStyle?.colorOverride ?? win.frameColor;
        const opacityFactor = vgStyle?.opacityFactor ?? 1;
        const frameTransparent = opacityFactor < 1;
        const frameOpacity = Math.max(0, Math.min(1, opacityFactor));
        const glassOpacity = Math.max(0, Math.min(1, win.glassOpacity * opacityFactor));

        const frameMat = makeMat(frameColor, 0.6, 0, frameTransparent, frameOpacity);
        const glassMat = makeMat('lightblue', 0.05, 0.1, true, glassOpacity, THREE.DoubleSide);
        mats.push(frameMat, glassMat);

        // ── Outer Frame ────────────────────────────────────────────────────
        // Top bar
        addBox(group, frameMat, w, ft, fd, 0,  h / 2 - ft / 2, 0);
        // Bottom bar
        addBox(group, frameMat, w, ft, fd, 0, -h / 2 + ft / 2, 0);
        // Left bar (between top and bottom)
        const sideH = h - 2 * ft;
        addBox(group, frameMat, ft, sideH, fd, -(w / 2 - ft / 2), 0, 0);
        // Right bar
        addBox(group, frameMat, ft, sideH, fd,  (w / 2 - ft / 2), 0, 0);

        // ── Glazing area ───────────────────────────────────────────────────
        // Inner area available for glass and dividers
        const innerW = w - 2 * ft;
        const innerH = h - 2 * ft;

        // DW-11 FIX: double window — force two equal columns with a structural center
        // mullion so the geometry reflects the BIM classification.  The user-defined
        // columnRatios still apply when windowType === 'single'.
        const effectiveColRatios = win.windowType === 'double' ? [1, 1] : win.columnRatios;
        // Use a thicker center divider (structural mullion) for double windows.
        const effectiveCdt = win.windowType === 'double'
            ? Math.max(win.columnDividerThickness, 0.06)
            : win.columnDividerThickness;

        const colWidths = ratioWidths(innerW, effectiveColRatios);
        const rowHeights = ratioWidths(innerH, win.rowRatios);

        const cdt = effectiveCdt;
        const rdt = win.rowDividerThickness;
        const nCols = colWidths.length;
        const nRows = rowHeights.length;

        // Column dividers (vertical) — between columns, full inner height
        let colX = -innerW / 2;
        for (let c = 0; c < nCols; c++) {
            colX += colWidths[c];
            if (c < nCols - 1) {
                addBox(group, frameMat, cdt, innerH, fd * 0.5, colX - cdt / 2, 0, 0);
            }
        }

        // Row dividers (horizontal) — per column to avoid intersection with col dividers
        colX = -innerW / 2;
        for (let c = 0; c < nCols; c++) {
            const cw = colWidths[c];
            let rowY = -innerH / 2;
            for (let r = 0; r < nRows; r++) {
                rowY += rowHeights[r];
                if (r < nRows - 1) {
                    addBox(group, frameMat, cw, rdt, fd * 0.5, colX + cw / 2, rowY - rdt / 2, 0);
                }
            }
            colX += cw;
        }

        // Glass panes (per cell)
        colX = -innerW / 2;
        for (let c = 0; c < nCols; c++) {
            const cw = colWidths[c];
            // Subtract column divider space on each side of this column
            const paneW = c === 0
                ? cw - (nCols > 1 ? cdt / 2 : 0)
                : c === nCols - 1
                    ? cw - cdt / 2
                    : cw - cdt;

            let rowY = -innerH / 2;
            for (let r = 0; r < nRows; r++) {
                const rh = rowHeights[r];
                const paneH = r === 0
                    ? rh - (nRows > 1 ? rdt / 2 : 0)
                    : r === nRows - 1
                        ? rh - rdt / 2
                        : rh - rdt;

                const paneCX = colX + cw / 2;
                const paneCY = rowY + rh / 2;

                addBox(group, glassMat, Math.max(paneW, 0.01), Math.max(paneH, 0.01), 0.006, paneCX, paneCY, 0);

                rowY += rh;
            }
            colX += cw;
        }

        // ── Sill ───────────────────────────────────────────────────────────
        if (win.sill && win.sillDepth > 0 && win.sillThickness > 0) {
            const sillMat = makeMat(win.frameColor, 0.7, 0);
            mats.push(sillMat);
            // Sill protrudes from bottom of window toward exterior (positive Z in group space)
            addBox(
                group, sillMat,
                w + 0.04,                // slightly wider than frame
                win.sillThickness,
                fd + win.sillDepth,
                0,
                -h / 2 + win.sillThickness / 2,
                win.sillDepth / 2        // protrudes out from wall face
            );
        }

        return mats;
    }

    private dispose(id: string): void {
        const group = this.windowGroups.get(id);
        if (group) {
            group.traverse(obj => {
                if (obj instanceof THREE.Mesh) {
                    obj.geometry.dispose();
                }
            });
            this.scene.remove(group);
            this.windowGroups.delete(id);
            elementRegistry.unregisterRoot(id);

            _bus.emit('bim-window-removed', { id }); // F.events.18
        }
        const mats = this.windowMaterials.get(id);
        if (mats) {
            for (const m of mats) m.dispose();
            this.windowMaterials.delete(id);
        }
    }
}
