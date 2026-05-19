/**
 * @file UnderlayPersistence.ts
 * @migration S88-WIRE (2026-05-01) — moved from `src/persistence/UnderlayPersistence.ts`
 *   to `src/engine/subsystems/UnderlayPersistence.ts`.  Uses THREE (L4) and DOM — belongs
 *   at the engine-subsystems tier alongside other init*.ts files.  The `src/persistence/`
 *   directory is deleted by this migration; the one structural importer
 *   (`src/engine/subsystems/initTools.ts`) has been updated to the new path.
 *
 * Persists the imported floor-plan PDF / JPG / PNG underlay across browser
 * sessions, **scoped per project** (Contract 45 / 46 — project isolation).
 * Stores the rasterized image (data URL), the px-per-meter ratio, and the
 * mesh transform (position, rotation, scale, opacity, locked, visible) in
 * localStorage so the underlay reappears in the same world-space location
 * the next time the SAME project is opened.
 *
 * Storage key:  pryzm.floorPlanUnderlay.v2.<projectId>
 * Legacy key:   pryzm.floorPlanUnderlay.v1   (single global blob — wiped on install)
 *
 * Save triggers (event-driven, no polling):
 *   - 'pryzm-floor-plan-underlay-placed' (from FloorPlanImportPanel)
 *   - 'underlay:transform-changed'        (from FloorPlanUnderlayTool drag /
 *                                          rotate / setOpacity / setLocked /
 *                                          setVisible, and PlanViewInteraction
 *                                          plan-view drag commit)
 *   - 'underlay:scale-applied'            (from UnderlayReferenceScaleTool)
 *   - 'pryzm-floor-plan-underlay-removed' → clears the CURRENT project's record
 *   - window 'beforeunload'               → flushes pending save
 *
 * Restore: driven by `pryzm-project-loaded`. We deliberately do NOT auto-restore
 * at app boot, because at that point we don't yet know which project will be
 * loaded — restoring would leak Project A's underlay into Project B.
 *
 * Project-switch contract:
 *   - On 'pryzm-project-switch': suspend saves (set current project = null) so
 *     teardown of the outgoing project's tool can't accidentally write to the
 *     incoming project's key.
 *   - On 'pryzm-project-loaded':  bind to the new project id and attempt
 *     restore from that project's key.
 *
 * Per Contract 32, this module does NOT modify the Import Manager registry —
 * it re-emits 'pryzm-floor-plan-underlay-placed' on restore so the manager
 * sees the same event it would for a fresh import.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { FloorPlanUnderlayTool } from '@pryzm/input-host';

const STORAGE_KEY_PREFIX = 'pryzm.floorPlanUnderlay.v2.';
const LEGACY_STORAGE_KEY = 'pryzm.floorPlanUnderlay.v1';
const SAVE_DEBOUNCE_MS = 250;

interface PersistedUnderlay {
    fileName: string;
    /** PNG data URL of the rasterised plan (works for PDF + JPG + PNG inputs) */
    imageDataUrl: string;
    pxPerMeter: number;
    widthPx: number;
    heightPx: number;
    elevationY: number;
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    scale:    { x: number; y: number; z: number };
    opacity:  number;
    locked:   boolean;
    visible:  boolean;
    savedAt:  string;
}

let _saveTimer: number | null = null;
let _cachedImageDataUrl: string | null = null;
let _installed = false;
/**
 * Project the persistence is currently bound to. Null between
 * `pryzm-project-switch` and the subsequent `pryzm-project-loaded` so any
 * save events that fire during teardown of the outgoing project's tool
 * don't write into the incoming project's key.
 */
let _currentProjectId: string | null = null;

function keyFor(projectId: string): string {
    return `${STORAGE_KEY_PREFIX}${projectId}`;
}

function currentKey(): string | null {
    return _currentProjectId ? keyFor(_currentProjectId) : null;
}

/** Read the record for a specific project. Returns null on miss or parse error. */
export function readPersistedUnderlay(projectId: string): PersistedUnderlay | null {
    try {
        const raw = localStorage.getItem(keyFor(projectId));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as PersistedUnderlay;
        if (!parsed.imageDataUrl || !parsed.pxPerMeter) return null;
        return parsed;
    } catch (err) {
        console.warn('[UnderlayPersistence] Failed to parse stored record:', err);
        return null;
    }
}

/**
 * Clear the persisted underlay record for the CURRENT project (or a
 * specific project if its id is supplied). No-op when no project is bound,
 * which is exactly what we want during project-switch teardown — the
 * outgoing project's record must survive for next visit.
 */
export function clearPersistedUnderlay(projectId?: string): void {
    _cachedImageDataUrl = null;
    const target = projectId ?? _currentProjectId;
    if (!target) {
        console.log('[UnderlayPersistence] Clear skipped — no current project bound');
        return;
    }
    try { localStorage.removeItem(keyFor(target)); } catch { /* quota / private mode */ }
    console.log(`[UnderlayPersistence] Cleared (project=${target})`);
}

/**
 * Convert a Blob URL (PNG / JPG / etc) to a base64 data URL via FileReader.
 * Returns null if the blob can't be fetched (revoked, cross-origin, etc).
 */
async function blobUrlToDataUrl(blobUrl: string): Promise<string | null> {
    try {
        const res = await fetch(blobUrl);
        const blob = await res.blob();
        return await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload  = () => resolve(reader.result as string);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
        });
    } catch (err) {
        console.warn('[UnderlayPersistence] blob → dataUrl failed:', err);
        return null;
    }
}

/**
 * Snapshot the current underlay tool state into a PersistedUnderlay.
 * Returns null when there is no underlay to save.
 */
async function captureCurrentState(): Promise<PersistedUnderlay | null> {
    const tool = window.floorPlanUnderlayTool as FloorPlanUnderlayTool | null | undefined;
    const state = tool?.getState?.();
    if (!tool || !state) return null;

    const mesh = state.mesh;
    const mat  = mesh.material as THREE.MeshBasicMaterial;

    // Re-use the cached image data URL on repeat saves so we don't
    // re-encode the same blob on every transform change.
    let imageDataUrl = _cachedImageDataUrl;
    if (!imageDataUrl) {
        // Find the blob URL via the texture image source
        const tex = mat.map as THREE.Texture | null;
        const img = tex?.image as HTMLImageElement | undefined;
        const src = img?.src ?? null;
        if (src) {
            imageDataUrl = await blobUrlToDataUrl(src);
            _cachedImageDataUrl = imageDataUrl;
        }
        // If still empty fall back to a record already on disk (avoid losing image)
        if (!imageDataUrl && _currentProjectId) {
            const existing = readPersistedUnderlay(_currentProjectId);
            imageDataUrl = existing?.imageDataUrl ?? null;
        }
    }
    if (!imageDataUrl) return null;

    const fileName = (mesh.userData?.fileName as string | undefined) ?? 'Floor Plan';

    return {
        fileName,
        imageDataUrl,
        pxPerMeter: state.pxPerMeter,
        widthPx:    state.widthPx,
        heightPx:   state.heightPx,
        elevationY: mesh.position.y,
        position: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
        rotation: { x: mesh.rotation.x, y: mesh.rotation.y, z: mesh.rotation.z },
        scale:    { x: mesh.scale.x,    y: mesh.scale.y,    z: mesh.scale.z    },
        opacity:  mat.opacity,
        locked:   state.locked,
        visible:  mesh.visible,
        savedAt:  new Date().toISOString(),
    };
}

async function flushSave(): Promise<void> {
    const key = currentKey();
    if (!key) {
        // Mid-switch — saves are suspended until pryzm-project-loaded binds
        // us to the incoming project. This prevents Project A's PDF from
        // bleeding into Project B's localStorage record.
        console.log('[UnderlayPersistence] Save skipped — no current project bound');
        return;
    }
    const record = await captureCurrentState();
    if (!record) return;
    try {
        // @project-isolation: per-project. `key` comes from currentKey() which
        // returns `${STORAGE_KEY_PREFIX}${_currentProjectId}` — guaranteed
        // project-scoped, and short-circuited above when no project is bound.
        localStorage.setItem(key, JSON.stringify(record));
        console.log('[UnderlayPersistence] Saved (', (record.imageDataUrl.length / 1024).toFixed(1), 'KB image, project=' + _currentProjectId + ' )');
    } catch (err) {
        console.warn('[UnderlayPersistence] localStorage.setItem failed (quota?):', err);
    }
}

function scheduleSave(): void {
    if (_saveTimer != null) clearTimeout(_saveTimer);
    _saveTimer = window.setTimeout(() => {
        _saveTimer = null;
        void flushSave();
    }, SAVE_DEBOUNCE_MS);
}

/**
 * Recreate the underlay mesh from a persisted record for the given
 * project id. Mounts the tool, applies the saved transform and material
 * state, and re-emits the Contract §32 placed event so the Import Manager
 * registers the entry.
 *
 * Returns true on success, false when no record exists or the scene is missing.
 */
export async function restoreUnderlayForProject(projectId: string): Promise<boolean> {
    _currentProjectId = projectId;
    const record = readPersistedUnderlay(projectId);
    if (!record) return false;

    const scene    = window.scene    as THREE.Scene | undefined;
    const camera   = window.camera   as THREE.Camera | undefined;
    const renderer = (window.world?.renderer?.three) as { domElement: HTMLElement } | undefined; // TODO(D.4): replace with runtime.scene.renderer once renderer slot is on PryzmRuntime — Phase D.4
    if (!scene || !camera || !renderer) {
        console.warn('[UnderlayPersistence] Scene not ready — restore skipped');
        return false;
    }

    try {
        const tool = new FloorPlanUnderlayTool(scene, camera, renderer.domElement);
        await tool.create({
            blobUrl:    record.imageDataUrl,   // dataURL works as an image src
            pxPerMeter: record.pxPerMeter,
            widthPx:    record.widthPx,
            heightPx:   record.heightPx,
            elevationY: record.elevationY,
        });

        const state = tool.getState();
        if (!state) return false;
        const mesh = state.mesh;
        mesh.position.set(record.position.x, record.position.y, record.position.z);
        mesh.rotation.set(record.rotation.x, record.rotation.y, record.rotation.z);
        mesh.scale.set(record.scale.x, record.scale.y, record.scale.z);
        (mesh.userData as any).fileName = record.fileName;
        tool.setOpacity(record.opacity);
        tool.setLocked(record.locked);
        if (!record.visible) tool.setVisible(false);

        // Cache the image so subsequent saves don't re-fetch the dataURL
        _cachedImageDataUrl = record.imageDataUrl;

        // Tell the Import Manager (Contract §32) and any UI listeners
        const underlayId = `floor-plan-${Date.now()}`;
        window.runtime?.events?.emit('pryzm-floor-plan-underlay-placed', { underlayId, fileName: record.fileName, restored: true }); // F.events.13

        // Show the persistent control bar (opacity / scale / settings / remove)
        const controlsBar = document.getElementById('fp-underlay-controls-bar');
        if (controlsBar) controlsBar.style.display = 'flex';
        const step1 = document.getElementById('fp-step-1');
        if (step1) step1.style.display = 'none';

        console.log(`[UnderlayPersistence] Restored from session (project=${projectId}, saved`, record.savedAt, ')');
        return true;
    } catch (err) {
        console.error('[UnderlayPersistence] Restore failed:', err);
        return false;
    }
}

/**
 * Wire save / clear listeners. Idempotent — safe to call multiple times.
 *
 * One-time legacy migration: removes the v1 global key (`pryzm.floorPlanUnderlay.v1`)
 * so a stale record from a previous build can never be restored into a
 * different project.
 */
export function installUnderlayPersistence(): void {
    if (_installed) return;
    _installed = true;

    // ── One-time legacy cleanup (Contract 45/46 retroactive isolation) ────
    try {
        if (localStorage.getItem(LEGACY_STORAGE_KEY) != null) {
            localStorage.removeItem(LEGACY_STORAGE_KEY);
            console.log('[UnderlayPersistence] Removed legacy v1 global record (project-isolation migration)');
        }
    } catch { /* ignore quota / private mode */ }

    // ── Project lifecycle binding ─────────────────────────────────────────
    // pryzm-project-switch fires BEFORE the new project loads. Suspend saves
    // during the gap so disposal of the outgoing project's tool can't write
    // into the incoming project's key.
    window.runtime?.events?.on('pryzm-project-switch', () => { // F.events.15
        _currentProjectId = null;
        _cachedImageDataUrl = null;
        if (_saveTimer != null) {
            clearTimeout(_saveTimer);
            _saveTimer = null;
        }
        console.log('[UnderlayPersistence] Project switch — saves suspended');
    });

    // pryzm-project-loaded fires once the new project is fully loaded. Bind
    // to its id and attempt to restore that project's underlay (if any).
    window.runtime?.events?.on('pryzm-project-loaded', (payload: unknown) => { // F.events.9
        const detail = (payload as { projectId?: string } | undefined) ?? {};
        const projectId = detail.projectId;
        if (!projectId) {
            console.warn('[UnderlayPersistence] pryzm-project-loaded missing projectId — skipping restore');
            return;
        }
        _currentProjectId = projectId;
        // Attempt restore for both empty + non-empty projects: an "empty"
        // project (no walls/floors) can still legitimately own an underlay.
        void restoreUnderlayForProject(projectId);
    });

    // ── Save triggers ─────────────────────────────────────────────────────
    window.runtime?.events?.on('pryzm-floor-plan-underlay-placed', (detail: { underlayId: string; fileName: string; restored?: boolean }) => { // F.events.13
        const tool = window.floorPlanUnderlayTool as FloorPlanUnderlayTool | null | undefined;
        const mesh = tool?.getState?.()?.mesh;
        if (mesh && detail.fileName) {
            (mesh.userData as any).fileName = detail.fileName;
        }
        // Reset cached data URL — a new file means we must re-encode
        if (!detail.restored) _cachedImageDataUrl = null;
        scheduleSave();
    });

    // F.events.2d — runtime.events subscription (dispatch migrated in F.events.2c)
    window.runtime?.events?.on('underlay:transform-changed', () => scheduleSave());
    window.addEventListener('underlay:scale-applied', () => scheduleSave());

    window.runtime?.events?.on('pryzm-floor-plan-underlay-removed', () => clearPersistedUnderlay()); // F.events.13

    window.addEventListener('beforeunload', () => {
        // Best-effort synchronous flush — captureCurrentState is async but the
        // image data URL is already cached after the first save.
        if (_saveTimer != null) {
            clearTimeout(_saveTimer);
            _saveTimer = null;
        }
        void flushSave();
    });

    console.log('[UnderlayPersistence] Installed (per-project, v2)');
}

/**
 * @deprecated Boot-time global restore — kept as a no-op so existing callers
 * (initTools.ts) continue to compile. Restoration is now driven by the
 * `pryzm-project-loaded` listener installed in installUnderlayPersistence().
 */
export async function restoreUnderlayIfAny(): Promise<boolean> {
    console.log('[UnderlayPersistence] restoreUnderlayIfAny() is a no-op — restore now driven by pryzm-project-loaded');
    return false;
}
