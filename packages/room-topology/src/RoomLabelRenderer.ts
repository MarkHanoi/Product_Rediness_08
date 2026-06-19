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

// §ROOM-LABEL-RESTYLE (founder 2026-06-19) — 2× supersample for crisp text at
// distance. DPR multiplies the canvas BITMAP only; SCALE is divided by DPR so the
// sprite's world footprint (and Y_OFFSET, billboarding, distance scaling) stay
// byte-for-byte identical to the old look: LABEL_W*SCALE = 512*0.006 = 3.072 =
// the old 256*0.012. Brand: white + PRYZM purple #6600FF, no black.
const DPR      = 2;
const LABEL_W  = 256 * DPR;
const LABEL_H  = 80  * DPR;
const SCALE    = 0.012 / DPR;
// Float the label clearly ABOVE the floor finish. The sprite is ~0.96m tall (half ≈
// 0.48m); at the old 0.08m its lower half sank BELOW the floor and got occluded (the
// area line clipped). Lift it so the whole card reads, a little above the floor.
const Y_OFFSET = 0.9;
const PRYZM_PURPLE = '#6600FF';

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
        // §ROOM-LABEL-RESTYLE — draw in LOGICAL 256×80 units; the bitmap is DPR× bigger.
        ctx.scale(DPR, DPR);
        const W = LABEL_W / DPR;             // 256
        const H = LABEL_H / DPR;             // 80
        const rx = 12;
        const inset = 5;                     // leave room for the drop shadow
        const cardX = inset, cardY = inset;
        const cardW = W - inset * 2, cardH = H - inset * 2;

        ctx.clearRect(0, 0, W, H);

        // Soft elevation shadow — the cheap "premium" lift, tinted purple (not black).
        ctx.save();
        ctx.shadowColor   = 'rgba(102,0,255,0.18)';
        ctx.shadowBlur    = 8;
        ctx.shadowOffsetY = 2;
        ctx.fillStyle = '#ffffff';
        this._roundRect(ctx, cardX, cardY, cardW, cardH, rx);
        ctx.fill();
        ctx.restore();

        // Hairline purple-tinted border.
        ctx.strokeStyle = 'rgba(102,0,255,0.28)';
        ctx.lineWidth   = 1.25;
        this._roundRect(ctx, cardX, cardY, cardW, cardH, rx);
        ctx.stroke();

        // Purple left-accent bar (clipped to the rounded card) — the depth/brand cue.
        ctx.save();
        this._roundRect(ctx, cardX, cardY, cardW, cardH, rx);
        ctx.clip();
        ctx.fillStyle = PRYZM_PURPLE;
        ctx.fillRect(cardX, cardY, 6, cardH);
        ctx.restore();

        const textLeft = cardX + 18;         // clears the accent bar

        // Room name — prominent, brand dark-violet (no black).
        const name = room.name || 'Room';
        ctx.fillStyle    = PRYZM_PURPLE;     // §ROOM-LABEL-RESTYLE — room name in PRYZM purple #6600FF
        ctx.font         = '600 23px system-ui, -apple-system, "Segoe UI", sans-serif';
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(this._truncate(name, 20), textLeft, H * 0.46);

        // §ROOM-LABEL-EDIT (2026-05-22) — show the room NUMBER (when set) alongside the
        // area; quieter muted purple-grey secondary line for a clean type hierarchy.
        const area    = room.computed?.area ?? 0;
        const number  = (room.roomNumber ?? '').trim();
        const areaStr = `${area.toFixed(1)} m²`;
        const subtitle = number ? `${this._truncate(number, 12)}   ${areaStr}` : areaStr;
        ctx.fillStyle = '#8A7BA8';
        ctx.font      = '500 15px system-ui, -apple-system, "Segoe UI", sans-serif';
        ctx.fillText(subtitle, textLeft, H * 0.72);

        const texture  = new THREE.CanvasTexture(canvas);
        texture.anisotropy = 4;              // crisper at glancing angles, no-cost
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
