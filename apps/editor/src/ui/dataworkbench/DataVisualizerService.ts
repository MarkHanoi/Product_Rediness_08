/**
 * ## DataVisualizerService — BIM 3.0 Phase 2: Visual Intelligence Overlay
 *
 * File:    src/ui/dataworkbench/DataVisualizerService.ts
 * CSS:     src/styles/panels/dataWorkbench.ts  (dw-viz-* classes)
 *
 * Snaptrude-style global 3D heatmap overlay system.
 * Overrides Three.js room volume materials to colour-code the model by data.
 *
 * ── Heatmap Modes ────────────────────────────────────────────────────────────
 *   sync-state  — Synced=green / Conflict=red / Partial=amber / Planned=purple
 *   occupancy   — Colours rooms by occupancy classification group
 *   compliance  — Passing=green / Partial=amber / Failing=red
 *   area-delta  — Compares actual vs. target area (over/under/matched)
 *   off         — Restores all original materials
 *
 * ── Ghost Volumes ────────────────────────────────────────────────────────────
 *   For every programme entry whose required quantity is not yet met by model
 *   rooms, a semi-transparent purple "LOD-100" box volume is rendered to show
 *   what still needs to be built.
 *
 * ── Access pattern ───────────────────────────────────────────────────────────
 *   import { dataVisualizer } from './DataVisualizerService';
 *   dataVisualizer.setMode('sync-state');
 *
 * ── Global dependencies (set by EngineBootstrap / initBuilders) ──────────────
 *   window.bimWorld            — OBC World (bimWorld.scene.three = THREE.Scene)
 *   window.roomStore           — RoomStore  (getAll():RoomData[]) // TODO(TASK-08)
 *   window.programmeStore      — { getAll():ProgrammeEntry[] } // TODO(TASK-08)
 *   window.syncStateEngine     — { recompute(id):SyncState }
 */

import * as THREE from '@pryzm/renderer-three/three';
import { onRuntimeEvent } from '../../engine/runtimeEventBridge'; // F.events.9

// ── Types ─────────────────────────────────────────────────────────────────────

export type HeatmapMode = 'sync-state' | 'occupancy' | 'compliance' | 'area-delta' | 'off';

interface SavedMaterial {
    color: THREE.Color;
    opacity: number;
    transparent: boolean;
    depthWrite: boolean;
}

interface ProgrammeEntry {
    id:            string;
    occupancyType: string;
    label:         string;
    requiredQty:   number;
    targetAreaM2:  number;
}

// ── Color maps ────────────────────────────────────────────────────────────────

const SYNC_STATE_COLORS: Record<string, string> = {
    'synced':       '#22c55e',  // green
    'partial':      '#f59e0b',  // amber
    'conflict':     '#ef4444',  // red
    'planned-only': '#a855f7',  // purple
    'derived':      '#3b82f6',  // blue
    'no-template':  '#94a3b8',  // slate
};

const COMPLIANCE_COLORS: Record<string, string> = {
    'synced':       '#22c55e',
    'partial':      '#f59e0b',
    'conflict':     '#ef4444',
    'derived':      '#f59e0b',
    'planned-only': '#a855f7',
    'no-template':  '#94a3b8',
};

// Occupancy-group colour palette (warm/cool families by function)
const OCCUPANCY_COLORS: Record<string, string> = {
    // Residential — blues
    'bedroom':              '#60a5fa',
    'living-room':          '#3b82f6',
    'kitchen':              '#f59e0b',
    'bathroom':             '#818cf8',
    'dining-room':          '#34d399',
    'utility-room':         '#94a3b8',
    'garage':               '#6b7280',
    'storage-residential':  '#a1a1aa',
    // Office — teals
    'open-office':          '#2dd4bf',
    'private-office':       '#0ea5e9',
    'meeting-room':         '#a78bfa',
    'reception':            '#f472b6',
    'breakout':             '#fb923c',
    'server-room':          '#64748b',
    // Retail — oranges
    'retail-floor':         '#f97316',
    'stockroom':            '#d97706',
    'changing-room':        '#fbbf24',
    // Healthcare — reds/pinks
    'patient-room':         '#f87171',
    'operating-theatre':    '#ef4444',
    'waiting-room':         '#fca5a5',
    'consultation-room':    '#fb7185',
    'pharmacy':             '#e879f9',
    // Education — greens
    'classroom':            '#4ade80',
    'laboratory':           '#22d3ee',
    'lecture-hall':         '#34d399',
    'library':              '#10b981',
    'sports-hall':          '#a3e635',
    // Hospitality
    'guest-room':           '#818cf8',
    'restaurant':           '#f97316',
    'bar':                  '#fbbf24',
    'event-space':          '#c084fc',
    // Circulation / Services
    'corridor':             '#d1d5db',
    'stairwell':            '#9ca3af',
    'lift-lobby':           '#e5e7eb',
    'wc':                   '#6ee7b7',
    'plant-room':           '#6b7280',
    'loading-bay':          '#78716c',
    'car-park':             '#a8a29e',
};

const GHOST_COLOR   = '#9333ea';  // purple-600
const GHOST_OPACITY = 0.25;
const HEATMAP_VOLUME_OPACITY = 0.72;

// ── Legend entries per mode ───────────────────────────────────────────────────

const LEGEND_ENTRIES: Record<HeatmapMode, Array<{ color: string; label: string }>> = {
    'off': [],
    'sync-state': [
        { color: '#22c55e', label: 'Synced' },
        { color: '#f59e0b', label: 'Partial' },
        { color: '#ef4444', label: 'Conflict' },
        { color: '#a855f7', label: 'Planned (unbuilt)' },
        { color: '#3b82f6', label: 'Derived / Accepted' },
        { color: '#94a3b8', label: 'No template' },
    ],
    'occupancy': [
        { color: '#60a5fa', label: 'Residential' },
        { color: '#2dd4bf', label: 'Office' },
        { color: '#f97316', label: 'Retail' },
        { color: '#f87171', label: 'Healthcare' },
        { color: '#4ade80', label: 'Education' },
        { color: '#94a3b8', label: 'Other' },
    ],
    'compliance': [
        { color: '#22c55e', label: 'Passing' },
        { color: '#f59e0b', label: 'Partial / Warning' },
        { color: '#ef4444', label: 'Failing' },
        { color: '#a855f7', label: 'Planned (missing)' },
    ],
    'area-delta': [
        { color: '#22c55e', label: 'On target (±10%)' },
        { color: '#f59e0b', label: 'Under target (>10%)' },
        { color: '#ef4444', label: 'Over target (>20%)' },
    ],
};

// ── DataVisualizerService ─────────────────────────────────────────────────────

class DataVisualizerService {
    /** Phase B (S73-WIRE) — runtime threaded by parent (added by widening — class had no explicit constructor). */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;
    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) { this.runtime = runtime; }

    private _mode: HeatmapMode = 'off';
    private _savedMaterials = new Map<string, SavedMaterial>();  // mesh.uuid → saved
    private _ghostMeshes: THREE.Mesh[] = [];
    private _legendEl: HTMLElement | null = null;

    // ── Public API ──────────────────────────────────────────────────────────────

    get mode(): HeatmapMode { return this._mode; }

    setMode(mode: HeatmapMode): void {
        if (this._mode === mode) return;
        const prev = this._mode;
        this._mode = mode;

        this._restoreOriginalColors();
        this._removeGhostVolumes();

        if (mode !== 'off') {
            this._applyHeatmap(mode);
            this._updateGhostVolumes();
        }

        this._updateLegend(mode);

        window.runtime?.events?.emit('pryzm-heatmap-mode-changed', { mode, prev }); // F.events.15

        console.log(`[DataVisualizerService] Heatmap → ${mode}`);
    }

    toggle(mode: HeatmapMode): void {
        this.setMode(this._mode === mode ? 'off' : mode);
    }

    /** Re-apply current heatmap (call after model changes or room updates). */
    refresh(): void {
        if (this._mode === 'off') return;
        this._restoreOriginalColors();
        this._removeGhostVolumes();
        this._applyHeatmap(this._mode);
        this._updateGhostVolumes();
    }

    // ── Scene access ────────────────────────────────────────────────────────────

    private _getScene(): THREE.Scene | null {
        // Primary: bimWorld (set by initScene.ts)
        const scene = window.bimWorld?.scene?.three ?? null;
        if (scene instanceof THREE.Scene) return scene;
        return null;
    }

    // ── Heatmap application ─────────────────────────────────────────────────────

    private _applyHeatmap(mode: HeatmapMode): void {
        const scene = this._getScene();
        if (!scene) {
            console.warn('[DataVisualizerService] Scene not available');
            return;
        }

        const roomStore = window.roomStore; // TODO(E.18-R.S): legacy roomStore — replace with runtime.stores.rooms slot
        const syncEngine = window.syncStateEngine; // TODO(C.3.x): legacy syncStateEngine — replace with runtime.persistence.syncState engine

        scene.traverse((obj: THREE.Object3D) => {
            if (!(obj instanceof THREE.Mesh)) return;
            // Target only room volume meshes (3D extruded bodies, not floor overlays)
            if (!obj.userData.isRoomVolume) return;

            const roomId = obj.userData.roomId ?? obj.userData.id;
            if (!roomId) return;

            // Save original material colour before first override
            this._saveMaterial(obj);

            // Resolve colour
            let hex: string | null = null;

            if (mode === 'sync-state' || mode === 'compliance') {
                const state: string = syncEngine?.recompute?.(roomId) ?? 'no-template';
                const map = mode === 'compliance' ? COMPLIANCE_COLORS : SYNC_STATE_COLORS;
                hex = map[state] ?? map['no-template'];

            } else if (mode === 'occupancy') {
                const room = roomStore?.getAll?.().find((r: any) => r.id === roomId);
                const ot: string = room?.occupancyType ?? '';
                hex = OCCUPANCY_COLORS[ot] ?? '#94a3b8';

            } else if (mode === 'area-delta') {
                hex = this._areaHex(roomId, roomStore, syncEngine);
            }

            if (!hex) return;

            const mat = obj.material as THREE.MeshBasicMaterial;
            mat.color.setStyle(hex);
            mat.opacity = HEATMAP_VOLUME_OPACITY;
            mat.transparent = true;
            mat.depthWrite = false;
            mat.needsUpdate = true;
        });
    }

    /** Compute an area-delta colour: red = over 20%, green = within tolerance, amber = under */
    private _areaHex(roomId: string, roomStore: any, syncEngine: any): string {
        const room = roomStore?.getAll?.().find((r: any) => r.id === roomId);
        if (!room) return '#94a3b8';

        const actual: number = room.computed?.area ?? 0;

        // Try to fetch the target area from programme store
        const programme = window.programmeStore?.getAll?.() as ProgrammeEntry[] ?? []; // TODO(F.6.x): legacy programmeStore — replace with runtime.dataWorkbench.programme store
        const entry = programme.find(e => e.occupancyType === room.occupancyType);
        if (!entry || entry.targetAreaM2 <= 0) {
            // No target — colour by sync-state fallback
            const state: string = syncEngine?.recompute?.(roomId) ?? 'no-template';
            return SYNC_STATE_COLORS[state] ?? '#94a3b8';
        }

        const delta = (actual - entry.targetAreaM2) / entry.targetAreaM2;
        if (delta > 0.20)  return '#ef4444';  // >20% over → red (waste)
        if (delta < -0.10) return '#f59e0b';  // >10% under → amber (deficient)
        return '#22c55e';                      // within tolerance → green
    }

    // ── Save / restore material colours ────────────────────────────────────────

    private _saveMaterial(mesh: THREE.Mesh): void {
        if (this._savedMaterials.has(mesh.uuid)) return; // already saved
        const mat = mesh.material as THREE.MeshBasicMaterial;
        this._savedMaterials.set(mesh.uuid, {
            color:       mat.color.clone(),
            opacity:     mat.opacity,
            transparent: mat.transparent,
            depthWrite:  mat.depthWrite,
        });
    }

    private _restoreOriginalColors(): void {
        const scene = this._getScene();
        if (!scene) return;

        scene.traverse((obj: THREE.Object3D) => {
            if (!(obj instanceof THREE.Mesh)) return;
            if (!obj.userData.isRoomVolume)    return;

            const saved = this._savedMaterials.get(obj.uuid);
            if (!saved) return;

            const mat = obj.material as THREE.MeshBasicMaterial;
            mat.color.copy(saved.color);
            mat.opacity     = saved.opacity;
            mat.transparent = saved.transparent;
            mat.depthWrite  = saved.depthWrite;
            mat.needsUpdate = true;
        });

        this._savedMaterials.clear();
    }

    // ── Ghost volumes ───────────────────────────────────────────────────────────

    /** Render semi-transparent purple boxes for unbuilt programme rooms. */
    private _updateGhostVolumes(): void {
        const scene = this._getScene();
        if (!scene) return;

        const programmeStore = window.programmeStore; // TODO(F.6.x): legacy programmeStore — replace with runtime.dataWorkbench.programme store
        const roomStore      = window.roomStore; // TODO(E.18-R.S): legacy roomStore — replace with runtime.stores.rooms slot
        if (!programmeStore || !roomStore) return;

        const entries: ProgrammeEntry[] = programmeStore.getAll?.() ?? [];
        const modelRooms: any[]         = roomStore.getAll?.() ?? [];

        // Count model rooms per occupancy type
        const builtCount = new Map<string, number>();
        for (const r of modelRooms) {
            const k = r.occupancyType as string;
            builtCount.set(k, (builtCount.get(k) ?? 0) + 1);
        }

        // Layout ghost boxes in a row offset from the model's bounding region
        let ghostIndex = 0;
        const ghostSpacingX = 6;   // metres between ghost boxes
        const ghostOriginX  = -80; // start well to the side of likely model extent

        for (const entry of entries) {
            const built   = builtCount.get(entry.occupancyType) ?? 0;
            const deficit = entry.requiredQty - built;
            if (deficit <= 0) continue;

            // Estimate ghost dimensions from target area (square root for side)
            const sideM  = Math.max(3, Math.sqrt(entry.targetAreaM2));
            const height = 3.0; // standard floor-to-ceiling approximation

            for (let i = 0; i < Math.min(deficit, 10); i++) {
                const ghost = this._makeGhostBox(sideM, height, entry);
                ghost.position.set(
                    ghostOriginX + ghostIndex * (sideM + ghostSpacingX),
                    height / 2,
                    -40,
                );
                scene.add(ghost);
                this._ghostMeshes.push(ghost);
                ghostIndex++;
            }
        }

        if (this._ghostMeshes.length) {
            console.log(`[DataVisualizerService] Ghost volumes: ${this._ghostMeshes.length} unbuilt room(s)`);
        }
    }

    // ── Legend overlay ──────────────────────────────────────────────────────────

    private _ensureLegend(): HTMLElement {
        if (!this._legendEl) {
            this._legendEl = document.createElement('div');
            this._legendEl.id = 'dw-viz-legend';
            document.body.appendChild(this._legendEl);
        }
        return this._legendEl;
    }

    private _updateLegend(mode: HeatmapMode): void {
        const el = this._ensureLegend();

        if (mode === 'off') {
            el.classList.remove('dw-viz-legend--visible');
            return;
        }

        const entries = LEGEND_ENTRIES[mode] ?? [];
        const modeLabel = mode.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

        el.innerHTML = `
            <div class="dw-viz-legend-title">${modeLabel}</div>
            ${entries.map(e => `
                <div class="dw-viz-legend-row">
                    <div class="dw-viz-legend-swatch" style="background:${e.color}"></div>
                    <span class="dw-viz-legend-text">${e.label}</span>
                </div>
            `).join('')}
            ${this._ghostMeshes.length > 0 ? `
                <div class="dw-viz-legend-row" style="margin-top:4px;border-top:1px solid rgba(255,255,255,0.1);padding-top:5px">
                    <div class="dw-viz-legend-swatch" style="background:#9333ea;opacity:0.5;border:1px solid #9333ea"></div>
                    <span class="dw-viz-legend-text">${this._ghostMeshes.length} unbuilt room(s)</span>
                </div>
            ` : ''}
        `;

        el.classList.add('dw-viz-legend--visible');
    }

    private _makeGhostBox(side: number, height: number, entry: ProgrammeEntry): THREE.Mesh {
        const geo = new THREE.BoxGeometry(side, height, side);
        const mat = new THREE.MeshBasicMaterial({
            color:       GHOST_COLOR,
            opacity:     GHOST_OPACITY,
            transparent: true,
            depthWrite:  false,
            wireframe:   false,
        });
        const mesh = new THREE.Mesh(geo, mat);

        // Wireframe outline for clarity
        const wireGeo = new THREE.EdgesGeometry(geo);
        const wireMat = new THREE.LineBasicMaterial({ color: GHOST_COLOR, opacity: 0.6, transparent: true });
        const wire = new THREE.LineSegments(wireGeo, wireMat);
        mesh.add(wire);

        mesh.userData.isGhostVolume  = true;
        mesh.userData.occupancyType  = entry.occupancyType;
        mesh.userData.programmeLabel = entry.label;
        mesh.userData.targetAreaM2   = entry.targetAreaM2;
        mesh.name = `ghost-${entry.occupancyType}-${entry.id}`;
        mesh.renderOrder = 50;

        return mesh;
    }

    private _removeGhostVolumes(): void {
        const scene = this._getScene();
        for (const mesh of this._ghostMeshes) {
            scene?.remove(mesh);
            if (mesh.geometry) mesh.geometry.dispose();
            if (Array.isArray(mesh.material)) {
                mesh.material.forEach(m => m.dispose());
            } else {
                (mesh.material as THREE.Material).dispose();
            }
        }
        this._ghostMeshes = [];
    }
}

// ── Singleton export ──────────────────────────────────────────────────────────

export const dataVisualizer = new DataVisualizerService();

// Auto-refresh when rooms change (model edit cycle)
window.addEventListener('bim-room-added',   () => dataVisualizer.refresh());
window.addEventListener('bim-room-updated', () => dataVisualizer.refresh());
window.addEventListener('bim-room-removed', () => dataVisualizer.refresh());
// F.events.9 — module-level side-effect: use onRuntimeEvent bridge so the
// subscription is safely deferred until window.runtime is set (same pattern
// as DiagnosticMaterialManager in F.events.2d).
onRuntimeEvent('pryzm-project-loaded', () => setTimeout(() => dataVisualizer.refresh(), 200));
