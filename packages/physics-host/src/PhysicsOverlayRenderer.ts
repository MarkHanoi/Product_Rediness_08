// @migration S91-WIRE: moved from src/render/PhysicsOverlayRenderer.ts (intra-src L7.5; src/core/ dep blocks Wave-11 package promotion to plugins/physics-overlay/ — deferred)
/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Render — Physics Colour Overlay (NEW FILE)
 * Phase:             Phase H — H-2 (Physics Colour Overlay in BIM Canvas)
 * Files Modified:    src/render/PhysicsOverlayRenderer.ts (new)
 * Classification:    A
 *
 * Contract:
 *   docs/00_PRZYM/PRYZM_WORLD_MODEL_MASTER_PLAN_2026.md § H-2
 *
 * Architecture:
 *   - init(scene) called once from initDataPlatform.
 *   - setMode() switches between Off / Thermal / Acoustic / Daylight.
 *   - Listens to `pryzm-physics-updated` — updates one mesh at a time,
 *     no geometry rebuild required.
 *   - Traverses scene for meshes with userData.isRoomOverlay = true.
 *   - Stores original colours in userData[POR_ORIG_KEY] to allow clean restore.
 *   - Legend panel is created on first setMode() call and toggled with the mode.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { setUD, deleteUD } from '@pryzm/core-app-model';
import type { PhysicsOverlayMode, RoomPhysicsResult } from '@pryzm/physics-host';
import { physicsEngine } from '@pryzm/physics-host';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

const POR_ORIG_KEY   = '__pryzm_por_orig_color';
const POR_ACTIVE_KEY = '__pryzm_por_active';

// ── Colour scales ─────────────────────────────────────────────────────────────

const THERMAL_SCALE: Array<{ max: number; hex: string; label: string }> = [
    { max: 10,  hex: '#60a5fa', label: '< 10 W/m² — Cold'        },
    { max: 22,  hex: '#34d399', label: '10–22 W/m² — Cool'       },
    { max: 32,  hex: '#fbbf24', label: '22–32 W/m² — Comfortable'},
    { max: 45,  hex: '#f97316', label: '32–45 W/m² — Warm'       },
    { max: Infinity, hex: '#ef4444', label: '> 45 W/m² — Hot'    },
];

const ACOUSTIC_SCALE: Array<{ max: number; hex: string; label: string }> = [
    { max: 0.5, hex: '#22c55e', label: '< 0.5s — Excellent'      },
    { max: 1.0, hex: '#84cc16', label: '0.5–1.0s — Good'         },
    { max: 1.5, hex: '#fbbf24', label: '1.0–1.5s — Acceptable'   },
    { max: 2.5, hex: '#f97316', label: '1.5–2.5s — Poor'         },
    { max: Infinity, hex: '#ef4444', label: '> 2.5s — Reverberant'},
];

const DAYLIGHT_SCALE: Array<{ max: number; hex: string; label: string }> = [
    { max: 1,   hex: '#dc2626', label: '< 1% — Poor'             },
    { max: 2,   hex: '#f97316', label: '1–2% — Marginal'         },
    { max: 5,   hex: '#84cc16', label: '2–5% — Good'             },
    { max: Infinity, hex: '#22c55e', label: '> 5% — Excellent'   },
];

function pickColour(value: number, scale: typeof THERMAL_SCALE): string {
    for (const step of scale) {
        if (value <= step.max) return step.hex;
    }
    return scale[scale.length - 1].hex;
}

function thermalColour(r: RoomPhysicsResult): string {
    return r.thermal ? pickColour(r.thermal.thermalLoad_Wm2, THERMAL_SCALE) : '#94a3b8';
}
function acousticColour(r: RoomPhysicsResult): string {
    return r.acoustic ? pickColour(r.acoustic.rt60_s, ACOUSTIC_SCALE) : '#94a3b8';
}
function daylightColour(r: RoomPhysicsResult): string {
    return r.daylight ? pickColour(r.daylight.daylightFactor_percent, DAYLIGHT_SCALE) : '#94a3b8';
}

// ── PhysicsOverlayRenderer ────────────────────────────────────────────────────

let _scene: THREE.Scene | null = null;
let _mode: PhysicsOverlayMode  = 'off';
let _legendEl: HTMLElement | null = null;

export function initPhysicsOverlayRenderer(scene: THREE.Scene): void {
    _scene = scene;

    window.addEventListener('pryzm-physics-updated', (e: Event) => {
        if (_mode === 'off') return;
        const { roomId } = (e as CustomEvent).detail ?? {};
        if (roomId) _updateRoomMesh(roomId);
    });

    console.log('[PhysicsOverlayRenderer] Initialised');
}

export function setPhysicsOverlayMode(mode: PhysicsOverlayMode): void {
    _mode = mode;
    if (mode === 'off') {
        _restoreAll();
        _hideLegend();
    } else {
        _applyAll();
        _showLegend(mode);
    }
    _bus.emit('pryzm-physics-mode-changed', { mode }); // F.events.18
    console.log(`[PhysicsOverlayRenderer] Mode → ${mode}`);
}

export function getPhysicsOverlayMode(): PhysicsOverlayMode { return _mode; }

// ── Mesh traversal ────────────────────────────────────────────────────────────

function _applyAll(): void {
    if (!_scene) return;
    _scene.traverse((obj: THREE.Object3D) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        if (!mesh.userData.isRoomOverlay) return;
        const roomId = mesh.userData.roomId ?? mesh.userData.id;
        if (!roomId) return;
        _applyToMesh(mesh, roomId);
    });
}

function _restoreAll(): void {
    if (!_scene) return;
    _scene.traverse((obj: THREE.Object3D) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        if (!mesh.userData[POR_ACTIVE_KEY]) return;
        _restoreMesh(mesh);
    });
}

function _updateRoomMesh(roomId: string): void {
    if (!_scene) return;
    _scene.traverse((obj: THREE.Object3D) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        if (!mesh.userData.isRoomOverlay) return;
        const id = mesh.userData.roomId ?? mesh.userData.id;
        if (id !== roomId) return;
        _applyToMesh(mesh, roomId);
    });
}

function _applyToMesh(mesh: THREE.Mesh, roomId: string): void {
    const result = physicsEngine.cache.get(roomId);
    if (!result) {
        physicsEngine.enqueueRoom(roomId);
        return;
    }

    let hex: string;
    if (_mode === 'thermal')  hex = thermalColour(result);
    else if (_mode === 'acoustic') hex = acousticColour(result);
    else if (_mode === 'daylight') hex = daylightColour(result);
    else return;

    const mat = mesh.material as THREE.MeshBasicMaterial;
    if (!mat?.color) return;

    if (!mesh.userData[POR_ACTIVE_KEY]) {
        setUD(mesh, POR_ORIG_KEY, '#' + mat.color.getHexString());
        setUD(mesh, POR_ACTIVE_KEY, true);
    }

    mat.color.setStyle(hex);
    mat.needsUpdate = true;
}

function _restoreMesh(mesh: THREE.Mesh): void {
    const origHex = mesh.userData[POR_ORIG_KEY] as string | undefined;
    const mat     = mesh.material as THREE.MeshBasicMaterial;
    if (mat?.color && origHex) mat.color.setStyle(origHex);
    if (mat) mat.needsUpdate = true;
    deleteUD(mesh, POR_ORIG_KEY);
    deleteUD(mesh, POR_ACTIVE_KEY);
}

// ── Legend panel ──────────────────────────────────────────────────────────────

function _showLegend(mode: PhysicsOverlayMode): void {
    _hideLegend();

    const el = document.createElement('div');
    el.id    = 'pryzm-physics-legend';
    el.style.cssText = [
        'position:fixed;bottom:16px;left:16px;z-index:1200;',
        'background:rgba(15,23,42,0.90);color:#f8fafc;',
        'border-radius:8px;padding:10px 14px;font-size:11px;line-height:1.6;',
        'font-family:ui-monospace,monospace;box-shadow:0 4px 12px rgba(0,0,0,0.3);',
        'min-width:190px;pointer-events:none;',
    ].join('');

    const titles: Record<PhysicsOverlayMode, string> = {
        off:      '',
        thermal:  'THERMAL LOAD (W/m²)',
        acoustic: 'REVERBERATION TIME (T60)',
        daylight: 'DAYLIGHT FACTOR (%)',
    };
    const scales: Record<Exclude<PhysicsOverlayMode, 'off'>, typeof THERMAL_SCALE> = {
        thermal:  THERMAL_SCALE,
        acoustic: ACOUSTIC_SCALE,
        daylight: DAYLIGHT_SCALE,
    };

    if (mode === 'off') return;
    const scale = scales[mode];

    let html = `<div style="font-weight:700;letter-spacing:.06em;margin-bottom:6px;">${titles[mode]}</div>`;
    for (const step of scale) {
        html += `<div style="display:flex;align-items:center;gap:7px;margin-bottom:3px;">
            <span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:${step.hex};flex-shrink:0;"></span>
            <span>${step.label}</span>
        </div>`;
    }
    html += `<div style="margin-top:6px;opacity:0.5;font-size:9px;">PRYZM Physics Overlay</div>`;
    el.innerHTML = html;
    document.body.appendChild(el);
    _legendEl = el;
}

function _hideLegend(): void {
    if (_legendEl) {
        _legendEl.remove();
        _legendEl = null;
    }
    const el = document.getElementById('pryzm-physics-legend');
    if (el) el.remove();
}
