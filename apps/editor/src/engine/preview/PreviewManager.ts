/**
 * PreviewManager.ts — AI Ghost Preview Layer
 *
 * Phase 3 §3.1 — AI Ghost Preview Layer
 *
 * CONTRACT COMPLIANCE:
 *   §01: Ghost meshes are NOT added to any ElementStore. They live in a dedicated
 *        previewGroup in the Three.js scene root.
 *   §01: "Accept" dispatches bus commands via runtime.bus (bus-only, §P3.2). Each
 *        element type is dispatched through its canonical bus command:
 *          wall  → bus 'wall.create'  → §P2.1 bridge → wallStore.add() → mesh rebuild
 *          slab  → bus 'slab.create'  → PRYZM3 slab handler → mesh rebuild
 *        Ghost meshes are removed AFTER commands are dispatched.
 *   §01: "Decline" / clear() removes children from previewGroup only — no store writes.
 *   §02: Y positions are always BimManager.getLevelElevation(levelId) + offset.
 *        Never hardcoded.
 *   §04: PreviewManager is Class A (new). No existing files modified.
 *
 * §P3.2 (IMPL-PLAN-2026-05-17): commandManager dual-writes removed from _executeCreate().
 *   commandManager is no longer referenced in this class.
 *   Proof of bus-only correctness: SlabPlanToolHandler and CopyPlanToolHandler
 *   have been bus-only for slabs since §A40-W03; both wall bridges proven via P2.1.
 *
 * Ghost Material Spec (per §3.1):
 *   color: 0xA855F7, transparent: true, opacity: 0.4, depthWrite: false,
 *   side: THREE.DoubleSide
 *   Pulsing: opacity oscillates 0.30–0.50 via Math.sin(Date.now()*0.003) in RAF.
 *
 * Dependencies (resolved via window globals — no imports to avoid circular refs):
 *   window.world          → OBC.World (has scene.three, scene.add)
 *   window.bimKernel?.bimManager → BimManager (getLevelElevation)
 */

import * as THREE from '@pryzm/renderer-three/three';
import { AIElement } from '@pryzm/ai-host';
import { unifiedFrameLoop } from '@pryzm/core-app-model';
// §P3.2 (IMPL-PLAN-2026-05-17): CreateWallCommand and CreateSlabCommand removed.
// _executeCreate() is now bus-only. No commandManager references remain in this file.
import type { IPreviewManager } from '@pryzm/editor-ui';

export interface ElementSchema {
    id: string;
    type: string;
    levelId: string;
    placement?: {
        x?: number;
        y?: number;
        z?: number;
        width?: number;
        height?: number;
        depth?: number;
        length?: number;
        thickness?: number;
        startX?: number;
        startZ?: number;
        endX?: number;
        endZ?: number;
    };
    parameters?: Record<string, any>;
    metadata?: Record<string, any>;
}

/**
 * Single instance — constructed lazily when first needed.
 * Exposed on window as window.previewManager after init.
 */
export class PreviewManager implements IPreviewManager {
    private _previewGroup: THREE.Group;
    private _ghostMaterial: THREE.MeshStandardMaterial;
    private _proposedElements: ElementSchema[] = [];
    /** Phase 3 — unsubscribe handle for the UnifiedFrameLoop tick listener. */
    private _unregisterTick: (() => void) | null = null;
    private _isAccepting = false;

    constructor() {
        this._previewGroup = new THREE.Group();
        this._previewGroup.name = 'pvw-preview-group';
        this._previewGroup.userData.isPreview = true;
        this._previewGroup.userData.isHelper = true;

        this._ghostMaterial = new THREE.MeshStandardMaterial({
            color: 0xA855F7,
            transparent: true,
            opacity: 0.4,
            depthWrite: false,
            side: THREE.DoubleSide,
        });

        this._attachToScene();
    }

    // ── Scene attachment ─────────────────────────────────────────────────────

    private _attachToScene(): void {
        const tryAttach = () => {
            const world = window.world;
            if (world?.scene?.three) {
                world.scene.three.add(this._previewGroup);
                console.log('[PreviewManager] previewGroup attached to scene.');
            } else {
                setTimeout(tryAttach, 500);
            }
        };
        tryAttach();
    }

    // ── Ghost Proposal API ───────────────────────────────────────────────────

    /**
     * Show ghost meshes for a set of proposed elements.
     * Clears any existing ghosts first.
     */
    showProposal(elements: ElementSchema[]): void {
        this.clear();
        this._proposedElements = elements;

        elements.forEach(el => {
            const mesh = this._buildGhostMesh(el);
            if (mesh) {
                mesh.userData.isPreview = true;
                mesh.userData.isHelper = true;
                mesh.userData.previewElementId = el.id;
                this._previewGroup.add(mesh);
            }
        });

        if (elements.length > 0) {
            this._startPulse();
        }

        console.log(`[PreviewManager] Showing ${elements.length} ghost proposal(s).`);
        window.runtime?.events?.emit('pvw-proposal-shown', { count: elements.length, elements });
    }

    /**
     * Also accepts AIElement[] (from QueryResult.elements) for ghost preview.
     * Converts AIElement to ElementSchema subset.
     */
    showFromAIElements(elements: AIElement[]): void {
        const schemas: ElementSchema[] = elements.map(el => ({
            id: el.id,
            type: el.type as string,
            levelId: el.levelId,
            placement: {
                x: (el as any).start?.x ?? (el as any).position?.x ?? 0,
                z: (el as any).start?.z ?? (el as any).position?.z ?? 0,
                endX: (el as any).end?.x,
                endZ: (el as any).end?.z,
                width: (el as any).width ?? el.properties?.unclassified?.width,
                height: (el as any).height ?? el.properties?.unclassified?.height,
                depth: (el as any).depth ?? el.properties?.unclassified?.depth,
                thickness: (el as any).thickness ?? el.properties?.unclassified?.thickness,
                length: (el as any).length ?? el.properties?.unclassified?.length,
            },
        }));
        this.showProposal(schemas);
    }

    /**
     * Accept: dispatch a bus command for each element, then clear.
     * Each accepted element dispatches pvw-element-accepted for the AIPanel
     * to handle via commandProposalStore or direct execution.
     */
    async accept(): Promise<void> {
        if (this._isAccepting) return;
        this._isAccepting = true;

        const elements = [...this._proposedElements];
        console.log(`[PreviewManager] Accepting ${elements.length} element(s).`);

        for (const el of elements) {
            await this._executeCreate(el);
        }

        this.clear();
        this._isAccepting = false;

        window.runtime?.events?.emit('pvw-proposals-accepted', { elements });
    }

    /**
     * Decline: clear ghost meshes, no store mutations.
     */
    decline(): void {
        this.clear();
        window.runtime?.events?.emit('pvw-proposals-declined', {});
    }

    /**
     * Clear all ghost meshes.
     */
    clear(): void {
        this._stopPulse();
        while (this._previewGroup.children.length > 0) {
            const child = this._previewGroup.children[0];
            this._previewGroup.remove(child);
            if ((child as THREE.Mesh).geometry) {
                (child as THREE.Mesh).geometry.dispose();
            }
        }
        this._proposedElements = [];
    }

    get proposedCount(): number {
        return this._proposedElements.length;
    }

    get hasProposal(): boolean {
        return this._proposedElements.length > 0;
    }

    // ── Ghost mesh building ──────────────────────────────────────────────────

    private _buildGhostMesh(el: ElementSchema): THREE.Mesh | null {
        const bimManager = window.bimKernel?.bimManager ?? window.bimManager;
        const baseY = bimManager?.getLevelElevation
            ? (bimManager.getLevelElevation(el.levelId) ?? 0)
            : 0;

        const p = el.placement ?? {};
        const mat = this._ghostMaterial.clone();
        mat.transparent = true;
        mat.depthWrite = false;
        mat.side = THREE.DoubleSide;
        mat.opacity = 0.4;

        const type = (el.type ?? '').toLowerCase();
        let geometry: THREE.BufferGeometry;
        let posX = p.x ?? 0;
        let posY = baseY;
        let posZ = p.z ?? 0;

        if (type === 'wall') {
            const startX = p.startX ?? p.x ?? 0;
            const startZ = p.startZ ?? p.z ?? 0;
            const endX = p.endX ?? startX + 5;
            const endZ = p.endZ ?? startZ;
            const thickness = p.thickness ?? 0.2;
            const height = p.height ?? 3;
            const length = Math.sqrt((endX - startX) ** 2 + (endZ - startZ) ** 2);
            geometry = new THREE.BoxGeometry(length, height, thickness);
            posX = (startX + endX) / 2;
            posY = baseY + height / 2;
            posZ = (startZ + endZ) / 2;
            const angle = Math.atan2(endZ - startZ, endX - startX);
            const mesh = new THREE.Mesh(geometry, mat);
            mesh.position.set(posX, posY, posZ);
            mesh.rotation.y = -angle;
            return mesh;
        }

        if (type === 'slab' || type === 'floor') {
            const width = p.width ?? 5;
            const depth = p.depth ?? 5;
            const thickness = p.thickness ?? 0.2;
            geometry = new THREE.BoxGeometry(width, thickness, depth);
            posY = baseY + thickness / 2;
        } else if (type === 'column') {
            const size = p.thickness ?? p.width ?? 0.4;
            const height = p.height ?? 3;
            geometry = new THREE.BoxGeometry(size, height, size);
            posY = baseY + height / 2;
        } else if (type === 'door') {
            const width = p.width ?? 0.9;
            const height = p.height ?? 2.1;
            const thickness = p.thickness ?? 0.05;
            geometry = new THREE.BoxGeometry(width, height, thickness);
            posY = baseY + height / 2;
        } else if (type === 'window') {
            const width = p.width ?? 1.2;
            const height = p.height ?? 1.0;
            const thickness = p.thickness ?? 0.05;
            geometry = new THREE.BoxGeometry(width, height, thickness);
            posY = baseY + (p.y ?? 1.0) + height / 2;
        } else if (type === 'beam') {
            const length = p.length ?? 5;
            const width = p.width ?? 0.3;
            const height = p.height ?? 0.3;
            geometry = new THREE.BoxGeometry(length, height, width);
            posY = baseY + 3;
        } else {
            const size = p.width ?? p.depth ?? p.length ?? 1;
            const ht = p.height ?? size;
            geometry = new THREE.BoxGeometry(size, ht, size);
            posY = baseY + ht / 2;
        }

        const mesh = new THREE.Mesh(geometry, mat);
        mesh.position.set(posX, posY, posZ);
        return mesh;
    }

    // ── Per-element execution (Accept flow) ──────────────────────────────────

    private async _executeCreate(el: ElementSchema): Promise<void> {
        // §P3.2 (IMPL-PLAN-2026-05-17): bus-only dispatch — no commandManager calls.
        const p    = el.placement ?? {};
        const type = (el.type ?? '').toLowerCase();

        try {
            if (type === 'wall') {
                const wallId    = el.id || crypto.randomUUID();
                const startX    = p.startX ?? p.x ?? 0;
                const startZ    = p.startZ ?? p.z ?? 0;
                const endX      = p.endX ?? startX + 5;
                const endZ      = p.endZ ?? startZ;
                const height    = p.height ?? 3;
                const thickness = p.thickness ?? 0.2;
                // §P3.2: Single pipeline. The §P2.1 wall.created bridge in initTools.ts
                // mirrors into wallStore.add() → WallRebuildCoordinator → mesh rebuild.
                window.runtime?.bus?.executeCommand('wall.create', {
                    id:       wallId,
                    levelId:  el.levelId,
                    baseLine: [{ x: startX, z: startZ }, { x: endX, z: endZ }],
                    height,
                    thickness,
                })?.catch((e: unknown) => console.error('[PreviewManager] wall.create bus failed:', e));
            } else if (type === 'slab' || type === 'floor') {
                const slabId    = el.id || crypto.randomUUID();
                const width     = p.width ?? 5;
                const depth     = p.depth ?? 5;
                const thickness = p.thickness ?? 0.2;
                const _hw       = width / 2;
                const _hd       = depth / 2;
                const _bx       = p.x ?? 0;
                const _bz       = p.z ?? 0;
                // §P3.2: Single pipeline. SlabPlanToolHandler and CopyPlanToolHandler
                // are already bus-only; the PRYZM3 slab.create handler drives the
                // Immer slab store → SlabFragmentBuilder → mesh rebuild.
                window.runtime?.bus?.executeCommand('slab.create', {
                    id:      slabId,
                    levelId: el.levelId,
                    boundary: [
                        { x: _bx - _hw, z: _bz - _hd },
                        { x: _bx + _hw, z: _bz - _hd },
                        { x: _bx + _hw, z: _bz + _hd },
                        { x: _bx - _hw, z: _bz + _hd },
                    ],
                    thickness,
                })?.catch((e: unknown) => console.error('[PreviewManager] slab.create bus failed:', e));
            } else {
                console.log(`[PreviewManager] No direct command for type '${type}' — dispatching pvw-element-accept-fallback.`);
                window.runtime?.events?.emit('pvw-element-accept-fallback', { element: el });
            }
        } catch (err) {
            console.error(`[PreviewManager] Failed to execute create for ${type}:`, err);
            window.runtime?.events?.emit('pvw-element-accept-fallback', { element: el, error: String(err) });
        }
    }

    // ── Pulse animation (Phase 3) ─────────────────────────────────────────────

    /**
     * Phase 3 — Register an `overlay` priority tick listener for the opacity pulse.
     * Idempotent: a second call while the listener is already registered is a no-op.
     * The listener exits immediately when there are no proposed elements, so it costs
     * only one map lookup per tick when the preview group is empty.
     */
    private _startPulse(): void {
        if (this._unregisterTick !== null) return;
        this._unregisterTick = unifiedFrameLoop.addTickListener({
            id:       'preview-manager-pulse',
            priority: 'overlay',
            callback: (_deltaMs, timestamp) => {
                if (this._proposedElements.length === 0) return;
                const opacity = 0.30 + 0.20 * (0.5 + 0.5 * Math.sin(timestamp * 0.003));
                this._previewGroup.children.forEach(child => {
                    const mesh = child as THREE.Mesh;
                    if (Array.isArray(mesh.material)) {
                        (mesh.material as THREE.MeshStandardMaterial[]).forEach(m => { m.opacity = opacity; });
                    } else {
                        (mesh.material as THREE.MeshStandardMaterial).opacity = opacity;
                    }
                });
            },
        });
    }

    private _stopPulse(): void {
        this._unregisterTick?.();
        this._unregisterTick = null;
    }
}

/**
 * Lazy singleton factory.
 * The first call creates + registers the instance on window.previewManager.
 */
export function getPreviewManager(): PreviewManager {
    if (!window.previewManager) {
        window.previewManager = new PreviewManager();
    }
    return window.previewManager as PreviewManager;
}
