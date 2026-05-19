/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Core — Presentation (Phase G-2)
 * File:             src/core/presentation/GhostOverlayRenderer.ts
 * Contract:         docs/00_PRZYM/PRYZM_WORLD_MODEL_MASTER_PLAN_2026.md § Phase G-2
 *
 * GhostOverlayRenderer — Temporal ghost overlay for the 3D viewport.
 *
 * Activated by DesignHistoryPanel when the user toggles ghost mode.
 * Queries the TemporalGraph for which element IDs existed at a given timestamp,
 * then dims (blue translucent) meshes whose elements post-date that timestamp
 * (i.e., elements that didn't exist in the design at the selected point in time).
 *
 * Material save/restore follows the UnderlayRenderService pattern:
 *   - original material stored in userData[GOR_ORIG_KEY]
 *   - ghost material applied to all THREE.Mesh children of tagged objects
 *   - cleanup restores originals and removes the DOM HUD
 *
 * DOM HUD:
 *   A floating banner is injected at the top of #container showing the active
 *   timestamp and summary counts. Removed on deactivate.
 *
 * Events consumed (window):
 *   pryzm-history-ghost-activate   { detail: { timestamp: number } }
 *   pryzm-history-ghost-deactivate {}
 */

import * as THREE from '@pryzm/renderer-three/three';
import { setUD, deleteUD } from './userDataSafe';
import { temporalGraphManager } from '@pryzm/core-app-model';

// ── Constants ─────────────────────────────────────────────────────────────────

/** userData key — saves original material before ghost override. */
const GOR_ORIG_KEY = '_gorOrigMat';

/** userData flag — marks this object as currently ghost-dimmed. */
const GOR_ACTIVE_KEY = '_gorActive';

/** Translucent blue material colour for "future" elements. */
const GHOST_COLOR = new THREE.Color(0x60a5fa); // Tailwind blue-400

/**
 * Element types that must never be dimmed (overlay helpers, debug geometry, etc.).
 */
const SKIP_TYPES = new Set<string>([
    'Preview', 'Snap', 'EdgeOverlay', 'Dimension', 'SelectionBox',
    'BimLevel', 'BimGrid', 'Grid', 'GridLine', 'Level', 'LevelLine',
    'TransformHelper', 'WallEdge', 'GhostOverlay',
]);

// ── Ghost material factory ────────────────────────────────────────────────────

function createGhostMaterial(): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
        color:       GHOST_COLOR,
        transparent: true,
        opacity:     0.18,
        depthWrite:  false,
        side:        THREE.DoubleSide,
        wireframe:   false,
    });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(ts: number): string {
    return new Date(ts).toLocaleString(undefined, {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

// ── HUD ───────────────────────────────────────────────────────────────────────

let _hudEl: HTMLElement | null = null;

function showHUD(timestamp: number, futureCount: number): void {
    removeHUD();
    const container = document.getElementById('container') ?? document.body;

    _hudEl = document.createElement('div');
    _hudEl.id = 'gor-hud';
    _hudEl.style.cssText = [
        'position:absolute;top:48px;left:50%;transform:translateX(-50%);z-index:900;',
        'background:rgba(30,35,60,.92);color:#e2e8f0;',
        'border:1px solid #3b82f6;border-radius:8px;padding:6px 16px;',
        'font-family:system-ui;font-size:12px;display:flex;align-items:center;gap:10px;',
        'box-shadow:0 4px 20px rgba(0,0,0,.4);pointer-events:none;',
    ].join('');

    _hudEl.innerHTML = [
        `<span style="font-size:16px">⏱</span>`,
        `<span style="font-weight:600;color:#60a5fa">History mode</span>`,
        `<span>Viewing state at <strong>${fmt(timestamp)}</strong></span>`,
        `<span style="color:#60a5fa;font-weight:600">${futureCount} element${futureCount !== 1 ? 's' : ''} dimmed</span>`,
        `<span style="color:#94a3b8">(added later)</span>`,
    ].join('');

    container.style.position = 'relative';
    container.appendChild(_hudEl);
}

function removeHUD(): void {
    if (_hudEl) {
        _hudEl.remove();
        _hudEl = null;
    }
}

// ── Core renderer ─────────────────────────────────────────────────────────────

let _scene: THREE.Scene | null = null;
let _ghostMaterial: THREE.MeshBasicMaterial | null = null;

/**
 * Initialise the ghost overlay renderer.
 * Must be called once after the Three.js scene is created.
 *
 * @param scene  The root THREE.Scene from EngineBootstrap.
 */
export function initGhostOverlayRenderer(scene: THREE.Scene): void {
    _scene = scene;

    // F.events.14 — pryzm-history-ghost-* migrated from DOM CustomEvent to runtime.events.
    (window as any).runtime?.events?.on('pryzm-history-ghost-activate', ({ timestamp }: { timestamp: number }) => {
        activate(timestamp);
    });

    (window as any).runtime?.events?.on('pryzm-history-ghost-deactivate', () => {
        deactivate();
    });

    console.log('[GhostOverlayRenderer] Initialised — listening for pryzm-history-ghost-* events (runtime.events F.events.14)');
}

// ── Activate ──────────────────────────────────────────────────────────────────

function activate(timestamp: number): void {
    if (!_scene) {
        console.warn('[GhostOverlayRenderer] activate() called before scene is ready');
        return;
    }

    // 1. First restore any previous ghost pass so we start clean.
    _restoreAll();

    // 2. Build the set of element IDs that existed at `timestamp`.
    const existedAtTs = _buildExistingSet(timestamp);

    // 3. Build the ghost material.
    if (_ghostMaterial) _ghostMaterial.dispose();
    _ghostMaterial = createGhostMaterial();

    // 4. Traverse the scene; dim meshes whose element is NOT in existedAtTs.
    let futureCount = 0;
    let presentCount = 0;

    _scene.traverse((obj: THREE.Object3D) => {
        // Determine the element ID: VGSceneApplicator / VisibilityRuleEngine standard
        const elementId: string | undefined =
            obj.userData?.elementId ??
            obj.userData?.id;

        if (!elementId) return;
        if (SKIP_TYPES.has(obj.userData?.elementType ?? '')) return;

        if (existedAtTs.has(elementId)) {
            presentCount++;
            return; // This element existed at ts — leave it alone
        }

        // This element was added AFTER the selected timestamp — dim it.
        if ((obj as THREE.Mesh).isMesh) {
            _dimMesh(obj as THREE.Mesh);
            futureCount++;
        }
    });

    showHUD(timestamp, futureCount);
    console.log(
        `[GhostOverlayRenderer] Activated at ${fmt(timestamp)}: ` +
        `${presentCount} present, ${futureCount} future (dimmed)`
    );
}

function _buildExistingSet(timestamp: number): Set<string> {
    // queryAt returns mutationsUpTo which is all mutations ≤ timestamp.
    // An element "existed at ts" if:
    //   - it has a 'create' mutation ≤ ts
    //   - AND it does NOT have a 'delete' mutation ≤ ts
    const slice = temporalGraphManager.queryAt(timestamp);
    const created = new Set<string>();
    const deleted = new Set<string>();

    for (const m of slice.mutationsUpTo) {
        if (m.mutationType === 'create') created.add(m.elementId);
        if (m.mutationType === 'delete') deleted.add(m.elementId);
    }

    // Final set: created before ts and NOT deleted before ts
    const existed = new Set<string>();
    for (const id of created) {
        if (!deleted.has(id)) existed.add(id);
    }

    return existed;
}

function _dimMesh(mesh: THREE.Mesh): void {
    if (mesh.userData[GOR_ACTIVE_KEY]) return; // already dimmed

    // Save original material (may be an array)
    setUD(mesh, GOR_ORIG_KEY, mesh.material);
    setUD(mesh, GOR_ACTIVE_KEY, true);

    // Apply ghost material
    const mat = _ghostMaterial!.clone();
    if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map(() => mat);
    } else {
        mesh.material = mat;
    }
}

// ── Deactivate ────────────────────────────────────────────────────────────────

function deactivate(): void {
    _restoreAll();
    removeHUD();
    if (_ghostMaterial) {
        _ghostMaterial.dispose();
        _ghostMaterial = null;
    }
    console.log('[GhostOverlayRenderer] Deactivated — all materials restored');
}

function _restoreAll(): void {
    if (!_scene) return;

    _scene.traverse((obj: THREE.Object3D) => {
        if (!obj.userData[GOR_ACTIVE_KEY]) return;
        const mesh = obj as THREE.Mesh;
        const orig = mesh.userData[GOR_ORIG_KEY];
        if (orig !== undefined) {
            // Dispose the temporary ghost material clones
            if (Array.isArray(mesh.material)) {
                mesh.material.forEach(m => m.dispose());
            } else {
                (mesh.material as THREE.Material).dispose();
            }
            mesh.material = orig;
        }
        deleteUD(mesh, GOR_ORIG_KEY);
        deleteUD(mesh, GOR_ACTIVE_KEY);
    });
}
