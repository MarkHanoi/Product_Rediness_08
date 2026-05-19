/**
 * RoomTool — enables the user to detect and interact with rooms.
 *
 * Sprint J extraction (2026-05-10): moved from src/engine/subsystems/rooms/ to
 * @pryzm/room-topology. Import remapping:
 *   ../commands                           → @pryzm/command-registry
 *   ../core/views/PlanView2DCreationMode  → @pryzm/core-app-model
 */

import * as THREE from '@pryzm/renderer-three/three';
import { DetectAllRoomsCommand } from '@pryzm/command-registry';
import { CreateRoomCommand } from '@pryzm/command-registry';
import { planView2DCreationMode } from '@pryzm/core-app-model';
import { pointInPolygon } from './RoomPolygonUtils';
import type { RoomData } from './RoomTypes';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

export interface RoomToolPickDeps {
    canvas: HTMLCanvasElement;
    getCamera: () => THREE.Camera;
    getRoomStore: () => { getAll: () => any[] } | null;
    getActiveLevelElevation: () => number;
}

export interface RoomToolManualDeps extends RoomToolPickDeps {
    getActiveLevelId: () => string | null;
    getCommandContext: () => any;
}

export class RoomTool {
    isActive = false;

    private _pickDeps: RoomToolPickDeps | null = null;
    private _manualDeps: RoomToolManualDeps | null = null;
    private _boundClickHandler: ((e: MouseEvent) => void) | null = null;
    private _boundMouseMoveHandler: ((e: MouseEvent) => void) | null = null;
    private _boundDblClickHandler: ((e: MouseEvent) => void) | null = null;
    private _boundKeyHandler: ((e: KeyboardEvent) => void) | null = null;

    private readonly _raycaster = new THREE.Raycaster();
    private readonly _mouse = new THREE.Vector2();

    private _boundaryPoints: Array<{ x: number; z: number }> = [];
    private _svgOverlay: SVGSVGElement | null = null;

    constructor(
        private readonly commandManager: any,
        _bimManager?: any,
    ) { void _bimManager; }

    /** Gap 4 — inject pick-mode deps after construction (called from initTools). */
    setPickDeps(deps: RoomToolPickDeps): void {
        this._pickDeps = deps;
    }

    /** Gap 4 — inject manual-boundary deps after construction (called from initTools). */
    setManualDeps(deps: RoomToolManualDeps): void {
        this._manualDeps = deps;
    }

    /** Gap 4 — activate POINT_PICK mode: user clicks inside a wall enclosure. */
    activatePointPickMode(): void {
        this.isActive = true;
        if (this._pickDeps) {
            this._attachPointPickListeners();
        } else {
            console.warn('[RoomTool] activatePointPickMode: no pick deps set');
        }
    }

    /** Gap 4 — activate MANUAL_BOUNDARY mode: user draws a polygon on the canvas. */
    activateManualBoundaryMode(): void {
        this.isActive = true;
        this._boundaryPoints = [];
        this._createSVGOverlay();
        if (this._manualDeps) {
            this._attachManualBoundaryListeners();
        } else {
            console.warn('[RoomTool] activateManualBoundaryMode: no manual deps set');
        }
        _bus.emit('pryzm-room-tool-mode-changed', { mode: 'manual-boundary' }); // F.events.18
    }

    activate(mode: 'auto-detect' | 'point-pick' | 'manual-boundary' = 'auto-detect'): void {
        if (mode === 'auto-detect') {
            this._detectAllRooms();
        } else if (mode === 'point-pick') {
            this.activatePointPickMode();
        } else {
            this.activateManualBoundaryMode();
        }
    }

    deactivate(): void {
        this._deactivateCurrent();
    }

    pickRoomAtWorldPoint(worldX: number, worldZ: number): string | null {
        const roomStore = this._pickDeps?.getRoomStore?.() ?? null;
        if (!roomStore) return null;
        const allRooms: RoomData[] = roomStore.getAll();
        for (const room of allRooms) {
            const polygon = room.boundary?.polygon;
            if (!polygon || polygon.length < 3) continue;
            if (pointInPolygon(worldX, worldZ, polygon)) return room.id;
        }
        return null;
    }

    private _attachPointPickListeners(): void {
        if (!this._pickDeps) return;
        const handler = this._onCanvasClick.bind(this);
        this._boundClickHandler = handler;
        this._pickDeps.canvas.addEventListener('click', handler);
    }

    private _attachManualBoundaryListeners(): void {
        if (!this._manualDeps) return;
        const clickHandler = this._onManualBoundaryClick.bind(this);
        const moveHandler  = this._onManualBoundaryMouseMove.bind(this);
        const dblHandler   = this._onManualBoundaryDblClick.bind(this);
        const keyHandler   = this._onManualBoundaryKey.bind(this);

        this._boundClickHandler     = clickHandler;
        this._boundMouseMoveHandler = moveHandler;
        this._boundDblClickHandler  = dblHandler;
        this._boundKeyHandler       = keyHandler;

        this._manualDeps.canvas.addEventListener('click',     clickHandler);
        this._manualDeps.canvas.addEventListener('mousemove', moveHandler);
        this._manualDeps.canvas.addEventListener('dblclick',  dblHandler);
        window.addEventListener('keydown', keyHandler);
    }

    private _onManualBoundaryClick(e: MouseEvent): void {
        if (!this._manualDeps) return;
        const worldPt = this._canvasToWorld(e);
        if (!worldPt) return;

        if (this._boundaryPoints.length >= 3) {
            const first = this._boundaryPoints[0];
            const dx = worldPt.x - first.x;
            const dz = worldPt.z - first.z;
            if (Math.sqrt(dx * dx + dz * dz) < 0.3) {
                this._commitBoundary();
                return;
            }
        }

        this._boundaryPoints.push(worldPt);
        this._updateSVGOverlay();
    }

    private _onManualBoundaryMouseMove(e: MouseEvent): void {
        const worldPt = this._canvasToWorld(e);
        this._updateSVGOverlay(worldPt ?? undefined);
    }

    private _onManualBoundaryDblClick(_e: MouseEvent): void {
        if (this._boundaryPoints.length >= 3) {
            this._commitBoundary();
        }
    }

    private _onManualBoundaryKey(e: KeyboardEvent): void {
        if (e.key === 'Escape') this._cancelBoundary();
        if (e.key === 'Enter' && this._boundaryPoints.length >= 3) this._commitBoundary();
    }

    private _commitBoundary(): void {
        if (!this._manualDeps || this._boundaryPoints.length < 3) return;

        const polygon = [...this._boundaryPoints];
        const levelId = this._manualDeps.getActiveLevelId();
        if (!levelId) { this._cancelBoundary(); return; }

        const xs = polygon.map(p => p.x);
        const zs = polygon.map(p => p.z);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minZ = Math.min(...zs), maxZ = Math.max(...zs);
        const cx = (minX + maxX) / 2;
        const cz = (minZ + maxZ) / 2;

        const roomId = crypto.randomUUID();
        const now = Date.now();
        const roomData: RoomData = {
            id: roomId,
            type: 'room',
            name: '',
            roomNumber: '',
            levelId,
            parentId: levelId,
            occupancyType: 'unclassified',
            boundary: {
                polygon,
                height: 3.0,
                baseOffset: 0,
                detectionMethod: 'manual-boundary',
            },
            boundingWallIds: [],
            boundingSlabIds: [],
            boundingColumnIds: [],
            finishes: {},
            properties: {},
            computed: {
                area: 0,
                grossArea: 0,
                perimeter: 0,
                volume: 0,
                centroid: { x: cx, z: cz },
                boundingBox: { minX, minZ, maxX, maxZ },
            },
            metadata: {
                createdAt:  now,
                modifiedAt: now,
                createdBy:  'user',
                version:    1,
            },
        };

        void this._manualDeps.getCommandContext();
        const cmd = new CreateRoomCommand(roomData);
        if ((window as any).runtime?.bus) { (window as any).runtime.bus.executeCommand('room.create', { ...(roomData as unknown as Record<string, unknown>) }).catch(() => {}); }
        const result = this.commandManager.execute(cmd);

        if (result.success) {
            console.log(`[RoomTool] MANUAL_BOUNDARY: created room '${roomId}' with ${polygon.length} vertices`);
            (window as any).runtime?.events?.emit('pryzm-element-selected', { elementId: roomId, elementType: 'room', source: 'room-tool-manual-boundary' });
        } else {
            console.warn('[RoomTool] MANUAL_BOUNDARY: CreateRoomCommand failed:', result.error);
        }

        this._cancelBoundary();
    }

    private _cancelBoundary(): void {
        this._boundaryPoints = [];
        this._removeSVGOverlay();
        this.isActive = false;
        this._detachClickListeners();

        _bus.emit('pryzm-room-tool-mode-changed', { mode: null }); // F.events.18
    }

    private _createSVGOverlay(): void {
        this._removeSVGOverlay();
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.id = 'pryzm-room-draw-overlay';
        svg.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:1000;';
        document.body.appendChild(svg);
        this._svgOverlay = svg;
    }

    private _removeSVGOverlay(): void {
        if (this._svgOverlay) {
            this._svgOverlay.remove();
            this._svgOverlay = null;
        }
    }

    private _updateSVGOverlay(cursorWorld?: { x: number; z: number }): void {
        if (!this._svgOverlay || !this._manualDeps) return;
        const svg = this._svgOverlay;
        svg.innerHTML = '';

        const pts = this._boundaryPoints;
        if (pts.length === 0) return;

        const canvas = this._manualDeps.canvas;
        const camera = this._manualDeps.getCamera() as THREE.PerspectiveCamera;
        const elevation = this._manualDeps.getActiveLevelElevation();
        const rect = canvas.getBoundingClientRect();

        const toScreen = (worldX: number, worldZ: number): { sx: number; sy: number } | null => {
            const v = new THREE.Vector3(worldX, elevation, worldZ);
            v.project(camera);
            const sx = (v.x * 0.5 + 0.5) * rect.width + rect.left;
            const sy = (-v.y * 0.5 + 0.5) * rect.height + rect.top;
            if (v.z > 1) return null;
            return { sx, sy };
        };

        const screenPts = pts.map(p => toScreen(p.x, p.z)).filter(Boolean) as Array<{ sx: number; sy: number }>;
        if (screenPts.length === 0) return;

        const allPts = cursorWorld
            ? [...screenPts, toScreen(cursorWorld.x, cursorWorld.z)].filter(Boolean) as Array<{ sx: number; sy: number }>
            : screenPts;

        if (allPts.length >= 3) {
            const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            poly.setAttribute('points', allPts.map(p => `${p.sx},${p.sy}`).join(' '));
            poly.setAttribute('fill', 'rgba(99,179,237,0.15)');
            poly.setAttribute('stroke', '#3B82F6');
            poly.setAttribute('stroke-width', '1.5');
            poly.setAttribute('stroke-dasharray', '6 3');
            svg.appendChild(poly);
        } else if (allPts.length >= 2) {
            for (let i = 0; i < allPts.length - 1; i++) {
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('x1', String(allPts[i].sx));
                line.setAttribute('y1', String(allPts[i].sy));
                line.setAttribute('x2', String(allPts[i + 1].sx));
                line.setAttribute('y2', String(allPts[i + 1].sy));
                line.setAttribute('stroke', '#3B82F6');
                line.setAttribute('stroke-width', '1.5');
                svg.appendChild(line);
            }
        }

        screenPts.forEach((p, i) => {
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', String(p.sx));
            circle.setAttribute('cy', String(p.sy));
            circle.setAttribute('r', i === 0 ? '7' : '4');
            circle.setAttribute('fill', i === 0 ? '#22D3EE' : '#3B82F6');
            circle.setAttribute('stroke', '#fff');
            circle.setAttribute('stroke-width', '1.5');
            svg.appendChild(circle);
        });

        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', String(screenPts[0].sx + 10));
        label.setAttribute('y', String(screenPts[0].sy - 8));
        label.setAttribute('fill', '#22D3EE');
        label.setAttribute('font-size', '11');
        label.setAttribute('font-family', 'inherit');
        label.textContent = `${pts.length} pts`;
        svg.appendChild(label);
    }

    private _canvasToWorld(e: MouseEvent): { x: number; z: number } | null {
        const deps = this._manualDeps ?? this._pickDeps;
        if (!deps) return null;

        const canvas = deps.canvas;
        const camera = deps.getCamera();
        const elevation = deps.getActiveLevelElevation();

        const worldPt = planView2DCreationMode.resolvePoint(
            e.clientX, e.clientY,
            camera, canvas,
            elevation,
        );
        if (worldPt) return { x: worldPt.x, z: worldPt.z };

        return null;
    }

    private _onCanvasClick(e: MouseEvent): void {
        if (!this._pickDeps) return;

        const canvas = this._pickDeps.canvas;
        const rect = canvas.getBoundingClientRect();

        this._mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this._mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        const camera = this._pickDeps.getCamera();
        this._raycaster.setFromCamera(this._mouse, camera);

        const elevation = this._pickDeps.getActiveLevelElevation();
        const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -elevation);
        const intersection = new THREE.Vector3();

        if (!this._raycaster.ray.intersectPlane(groundPlane, intersection)) {
            console.debug('[RoomTool] POINT_PICK: ray did not hit ground plane');
            return;
        }

        const roomId = this.pickRoomAtWorldPoint(intersection.x, intersection.z);

        if (roomId) {
            _bus.emit('pryzm-workbench-select', { id: roomId, type: 'room', source: 'room-tool-point-pick' }); // F.events.18
            (window as any).runtime?.events?.emit('pryzm-element-selected', { elementId: roomId, elementType: 'room', source: 'room-tool-point-pick' });
            _bus.emit('pryzm-audit-room-select', { roomId, source: 'room-tool' }); // F.events.18
            // F.events.6 — pryzm-inspect-room-focus migrated to runtime.events typed bus.
            (window as any).runtime?.events?.emit('pryzm-inspect-room-focus', { roomId });
            const bus = (window as any).selectionBus;
            if (bus?.select) bus.select(roomId, 'room-tool');
        }
    }

    private _detectAllRooms(): void {
        const cmd = new DetectAllRoomsCommand();
        if ((window as any).runtime?.bus) { (window as any).runtime.bus.executeCommand('room.create', {}).catch(() => {}); }
        const result = this.commandManager.execute(cmd);
        if (!result.success) {
            console.warn('[RoomTool] Room detection failed:', result.error);
        } else {
            const count = result.affectedElementIds.length;
            console.log(`[RoomTool] Detected ${count} room${count !== 1 ? 's' : ''}`);
        }
    }

    private _deactivateCurrent(): void {
        this.isActive = false;
        this._detachClickListeners();
        if (this._boundaryPoints.length > 0) {
            this._boundaryPoints = [];
            this._removeSVGOverlay();
        }
    }

    private _detachClickListeners(): void {
        const canvas = (this._manualDeps ?? this._pickDeps)?.canvas;
        if (canvas) {
            if (this._boundClickHandler) canvas.removeEventListener('click', this._boundClickHandler);
            if (this._boundMouseMoveHandler) canvas.removeEventListener('mousemove', this._boundMouseMoveHandler);
            if (this._boundDblClickHandler) canvas.removeEventListener('dblclick', this._boundDblClickHandler);
        }
        if (this._boundKeyHandler) window.removeEventListener('keydown', this._boundKeyHandler);
        this._boundClickHandler = null;
        this._boundMouseMoveHandler = null;
        this._boundDblClickHandler = null;
        this._boundKeyHandler = null;
    }
}
