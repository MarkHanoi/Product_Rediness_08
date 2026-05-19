/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    UI / Tools Layer
 * File:             src/elements/roomBoundingLines/RoomBoundingLineTool.ts
 * Contracts:        01-BIM-ENGINE-CORE-CONTRACT §2 — all mutations via commands
 *                   02-BIM-SPATIAL-PROJECTION-CONTRACT §6 — Tool scene isolation
 *                   05-BIM-UI-ARCHITECTURE-CONTRACT §7 — No direct store writes
 *
 * Two-click line placement tool:
 *   - Click 1: set start point
 *   - Click 2: set end point → dispatch CreateRoomBoundingLineCommand
 *   Escape cancels; double-click also completes placement.
 *
 * Preview mesh: temporary dashed line shown while the user is picking the end point.
 * Preview is disposed immediately before command execution (Contract §6.2).
 */

import * as THREE from '@pryzm/renderer-three/three';
import { v4 as uuidv4 } from 'uuid';
import { CreateRoomBoundingLineCommand } from '@pryzm/command-registry';

const PREVIEW_COLOR = 0xC084FC; // violet-400

interface ICommandManager { execute(cmd: any): any; }
interface IBimManager { getLevelById(id: string): any; getActiveLevel?(): any; }

export class RoomBoundingLineTool {
  private _commandManager: ICommandManager;
  private _bimManager: IBimManager;
  private _scene: THREE.Scene;

  private _active: boolean = false;
  private _startPoint: THREE.Vector3 | null = null;
  private _previewLine: THREE.Line | null   = null;
  private _levelId: string = '';
  private _levelElevation: number = 0;

  // Raycasting plane at level elevation
  private _levelPlane: THREE.Plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private _raycaster: THREE.Raycaster = new THREE.Raycaster();

  private _onMouseMove: ((e: MouseEvent) => void) | null = null;
  private _onClick:     ((e: MouseEvent) => void) | null = null;
  private _onKeyDown:   ((e: KeyboardEvent) => void) | null = null;

  constructor(scene: THREE.Scene, commandManager: ICommandManager, bimManager: IBimManager) {
    this._scene          = scene;
    this._commandManager = commandManager;
    this._bimManager     = bimManager;
  }

  activate(levelId?: string): void {
    if (this._active) return;
    this._active = true;
    this._startPoint = null;

    const activeLevel = this._bimManager.getActiveLevel?.();
    this._levelId        = levelId ?? activeLevel?.id ?? '';
    this._levelElevation = activeLevel?.elevation ?? 0;
    this._levelPlane.constant = -this._levelElevation;

    console.log(`[RoomBoundingLineTool] Activated on level '${this._levelId}' @ y=${this._levelElevation}`);

    this._bindEvents();
    this._showHUD('Click to place Room Bounding Line start point');
  }

  deactivate(): void {
    if (!this._active) return;
    this._active = false;
    this._clearPreview();
    this._startPoint = null;
    this._unbindEvents();
    this._hideHUD();
    console.log('[RoomBoundingLineTool] Deactivated');
  }

  isActive(): boolean { return this._active; }

  // ── Event binding ─────────────────────────────────────────────────────────

  private _bindEvents(): void {
    const canvas = this._getCanvas();
    if (!canvas) return;

    this._onMouseMove = (e: MouseEvent) => this._handleMouseMove(e, canvas);
    this._onClick     = (e: MouseEvent) => this._handleClick(e, canvas);
    this._onKeyDown   = (e: KeyboardEvent) => this._handleKey(e);

    canvas.addEventListener('mousemove', this._onMouseMove);
    canvas.addEventListener('click',     this._onClick);
    window.addEventListener('keydown',   this._onKeyDown);
  }

  private _unbindEvents(): void {
    const canvas = this._getCanvas();
    if (canvas && this._onMouseMove) canvas.removeEventListener('mousemove', this._onMouseMove);
    if (canvas && this._onClick)     canvas.removeEventListener('click',     this._onClick);
    if (this._onKeyDown)             window.removeEventListener('keydown',   this._onKeyDown);
    this._onMouseMove = null;
    this._onClick     = null;
    this._onKeyDown   = null;
  }

  // ── Mouse handlers ────────────────────────────────────────────────────────

  private _handleMouseMove(e: MouseEvent, canvas: HTMLElement): void {
    if (!this._startPoint) return;
    const worldPos = this._screenToWorld(e, canvas);
    if (!worldPos) return;
    this._updatePreview(this._startPoint, worldPos);
  }

  private _handleClick(e: MouseEvent, canvas: HTMLElement): void {
    if (e.button !== 0) return;
    const worldPos = this._screenToWorld(e, canvas);
    if (!worldPos) return;

    if (!this._startPoint) {
      // First click: set start
      this._startPoint = worldPos.clone();
      this._createPreview(worldPos, worldPos);
      this._showHUD('Click to place end point — Escape to cancel');
    } else {
      // Second click: place the line
      this._finishPlacement(worldPos);
    }
  }

  private _handleKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      if (this._startPoint) {
        this._clearPreview();
        this._startPoint = null;
        this._showHUD('Click to place Room Bounding Line start point');
      } else {
        this.deactivate();
      }
    }
  }

  // ── Placement ─────────────────────────────────────────────────────────────

  private _finishPlacement(end: THREE.Vector3): void {
    const start = this._startPoint!;

    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 0.05) {
      console.warn('[RoomBoundingLineTool] Points too close — ignoring');
      return;
    }

    this._clearPreview();
    this._startPoint = null;

    const id = `rbl-${uuidv4()}`;
    const cmd = new CreateRoomBoundingLineCommand({
      id,
      levelId: this._levelId,
      start: { x: start.x, z: start.z },
      end:   { x: end.x,   z: end.z },
      createdBy: 'user',
    });

    // [E.5.x] Bus telemetry — fire-and-forget; legacy commandManager drives state during migration.
    if (window.runtime?.bus) { window.runtime.bus.executeCommand('room.update', {}).catch(() => {}); }
    this._commandManager.execute(cmd);
    console.log(`[RoomBoundingLineTool] Placed '${id}'`);

    // Stay active for next placement
    this._showHUD('Click to place Room Bounding Line start point');
  }

  // ── Preview ───────────────────────────────────────────────────────────────

  private _createPreview(start: THREE.Vector3, end: THREE.Vector3): void {
    this._clearPreview();
    const y = this._levelElevation + 0.02;

    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(start.x, y, start.z),
      new THREE.Vector3(end.x,   y, end.z),
    ]);
    const mat = new THREE.LineDashedMaterial({ color: PREVIEW_COLOR, dashSize: 0.2, gapSize: 0.1, linewidth: 2 });
    this._previewLine = new THREE.Line(geo, mat);
    this._previewLine.computeLineDistances();
    this._previewLine.renderOrder = 10;
    this._scene.add(this._previewLine);
  }

  private _updatePreview(start: THREE.Vector3, end: THREE.Vector3): void {
    if (!this._previewLine) {
      this._createPreview(start, end);
      return;
    }
    const y = this._levelElevation + 0.02;
    const positions = this._previewLine.geometry.attributes['position'];
    if (positions) {
      positions.setXYZ(0, start.x, y, start.z);
      positions.setXYZ(1, end.x,   y, end.z);
      positions.needsUpdate = true;
    }
    this._previewLine.computeLineDistances();
  }

  private _clearPreview(): void {
    if (this._previewLine) {
      this._previewLine.geometry.dispose();
      (this._previewLine.material as THREE.Material).dispose();
      this._scene.remove(this._previewLine);
      this._previewLine = null;
    }
  }

  // ── Coordinate mapping ────────────────────────────────────────────────────

  private _screenToWorld(e: MouseEvent, canvas: HTMLElement): THREE.Vector3 | null {
    const camera = window.threeCamera ?? window.activeCamera;
    if (!camera) return null;

    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width)  * 2 - 1,
      -((e.clientY - rect.top)  / rect.height) * 2 + 1,
    );

    this._raycaster.setFromCamera(ndc, camera);
    const target = new THREE.Vector3();
    const ok = this._raycaster.ray.intersectPlane(this._levelPlane, target);
    return ok ? target : null;
  }

  // ── HUD helpers ───────────────────────────────────────────────────────────

  private _showHUD(msg: string): void {
    let el = document.getElementById('rbl-tool-hud');
    if (!el) {
      el = document.createElement('div');
      el.id = 'rbl-tool-hud';
      el.style.cssText = [
        'position:fixed', 'bottom:80px', 'left:50%', 'transform:translateX(-50%)',
        'background:rgba(30,20,50,0.88)', 'color:#e9d5ff',
        'padding:8px 20px', 'border-radius:8px',
        'font-size:13px', 'font-family:var(--app-font,sans-serif)',
        'pointer-events:none', 'z-index:9999',
        'box-shadow:0 2px 12px rgba(168,85,247,0.35)',
      ].join(';');
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.display = 'block';
  }

  private _hideHUD(): void {
    const el = document.getElementById('rbl-tool-hud');
    if (el) el.style.display = 'none';
  }

  private _getCanvas(): HTMLElement | null {
    return document.querySelector('canvas') ?? null;
  }
}
