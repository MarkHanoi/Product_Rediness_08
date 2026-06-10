/**
 * RoomLabelRenderer — THREE.Sprite canvas-texture labels at room centroids.
 *
 * Sprint J extraction (2026-05-10): moved from src/engine/subsystems/rooms/ to
 * @pryzm/room-topology. No import remapping required — all deps are same-package
 * (RoomTypes) or @pryzm/* packages already imported.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { RoomData } from './RoomTypes';
import { BimManager } from '@pryzm/core-app-model';

const LABEL_W  = 256;
const LABEL_H  = 80;
const SCALE    = 0.012;
const Y_OFFSET = 0.08;

export class RoomLabelRenderer {
    private readonly _sprites: Map<string, THREE.Sprite> = new Map();
    /**
     * §ROOM-LABELS-TOGGLE (2026-06-10) — global visibility flag for the 3D
     * room-name sprites, driven by the BottomActionMenu toggle button. Default
     * `true` preserves the current always-visible behaviour. New labels created
     * while hidden inherit this flag (applied in {@link updateRoom}).
     */
    private _visible = true;

    constructor(
        private readonly _scene: THREE.Scene,
        private readonly _bimManager?: BimManager,
    ) {}

    updateRoom(room: RoomData): void {
        this.removeRoom(room.id);

        const centroid = room.computed?.centroid;
        if (!centroid) return;

        const sprite = this._makeSprite(room);
        const baseY  = this._resolveWorldY(room) + Y_OFFSET;
        sprite.position.set(centroid.x, baseY, centroid.z);
        sprite.renderOrder = 10;
        sprite.name = `room-label-${room.id}`;
        sprite.userData.roomId = room.id;
        sprite.userData.type   = 'room-label';
        sprite.visible         = this._visible;

        this._scene.add(sprite);
        this._sprites.set(room.id, sprite);
    }

    /**
     * §ROOM-LABELS-TOGGLE — show/hide every 3D room-name sprite. Idempotent;
     * remembers the flag so labels created later (room add/update) honour it.
     * Pure visibility flip — does not add/remove sprites or touch any store.
     */
    setRoomLabelsVisible(visible: boolean): void {
        this._visible = visible;
        for (const sprite of this._sprites.values()) sprite.visible = visible;
    }

    /** §ROOM-LABELS-TOGGLE — current visibility flag (default `true`). */
    get roomLabelsVisible(): boolean {
        return this._visible;
    }

    removeRoom(roomId: string): void {
        const sprite = this._sprites.get(roomId);
        if (!sprite) return;
        this._scene.remove(sprite);
        (sprite.material as THREE.SpriteMaterial).map?.dispose();
        (sprite.material as THREE.SpriteMaterial).dispose();
        this._sprites.delete(roomId);
    }

    removeAll(): void {
        for (const id of [...this._sprites.keys()]) {
            this.removeRoom(id);
        }
    }

    private _resolveWorldY(room: RoomData): number {
        const baseOffset = room.boundary?.baseOffset ?? 0;
        const bm = this._bimManager ?? (window as any).bimManager as BimManager | undefined;
        if (bm) {
            const level = bm.getLevelById(room.levelId);
            if (level) return level.elevation + baseOffset;
        }
        return baseOffset;
    }

    private _makeSprite(room: RoomData): THREE.Sprite {
        const canvas  = document.createElement('canvas');
        canvas.width  = LABEL_W;
        canvas.height = LABEL_H;
        const ctx = canvas.getContext('2d')!;

        const rx = 10;
        ctx.clearRect(0, 0, LABEL_W, LABEL_H);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        this._roundRect(ctx, 2, 2, LABEL_W - 4, LABEL_H - 4, rx);
        ctx.fill();

        ctx.strokeStyle = 'rgba(80,80,80,0.5)';
        ctx.lineWidth   = 2;
        this._roundRect(ctx, 2, 2, LABEL_W - 4, LABEL_H - 4, rx);
        ctx.stroke();

        const name = room.name || 'Room';
        ctx.fillStyle   = '#1a1a2e';
        ctx.font        = 'bold 22px system-ui, sans-serif';
        ctx.textAlign   = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this._truncate(name, 22), LABEL_W / 2, LABEL_H * 0.34);

        // §ROOM-LABEL-EDIT (2026-05-22) — show the room NUMBER (when set) alongside
        // the area, so the double-click-editable number is visible on the label.
        const area    = room.computed?.area ?? 0;
        const number  = (room.roomNumber ?? '').trim();
        const areaStr = `${area.toFixed(1)} m²`;
        const subtitle = number ? `${this._truncate(number, 14)}  ·  ${areaStr}` : areaStr;
        ctx.fillStyle = '#555';
        ctx.font      = '18px system-ui, sans-serif';
        ctx.fillText(subtitle, LABEL_W / 2, LABEL_H * 0.68);

        const texture  = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthWrite: false,
            sizeAttenuation: true,
        });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(LABEL_W * SCALE, LABEL_H * SCALE, 1);
        return sprite;
    }

    private _truncate(text: string, max: number): string {
        return text.length > max ? text.slice(0, max - 1) + '…' : text;
    }

    private _roundRect(
        ctx: CanvasRenderingContext2D,
        x: number, y: number, w: number, h: number, r: number,
    ): void {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }
}
