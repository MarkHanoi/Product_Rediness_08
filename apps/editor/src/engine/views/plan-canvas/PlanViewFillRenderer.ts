import * as THREE from '@pryzm/renderer-three/three';
import { RoomColourSystem } from '@pryzm/room-topology';
import { PocheFillBuilder, type PochePolygon } from '@pryzm/core-app-model';
import { getHatchPattern } from '@pryzm/core-app-model/drawing';
import { visibilityIntentStore } from '@pryzm/core-app-model/presentation';
import { viewIntentInstanceStore } from '@pryzm/core-app-model/presentation';
import { resolveIntentStyle } from '@pryzm/core-app-model/presentation';
import { getDefaultSystemIntentId } from '@pryzm/core-app-model/presentation';
import { ISO_CUT_LAYER_TO_POCHE_FILL } from '@pryzm/core-app-model/drawing';
import type { ViewDefinition } from '@pryzm/core-app-model';
import type { PlanViewCanvasStyle } from './PlanViewCanvasTypes';
import { planViewVGApplicator } from './PlanViewVGApplicator';

type WorldToScreen = (h: number, v: number) => { sx: number; sy: number };
type StyleResolver = (category: string, layerTag: string) => PlanViewCanvasStyle | null;

export class PlanViewFillRenderer {
    renderRoomFills(
        ctx: CanvasRenderingContext2D,
        worldToScreen: WorldToScreen,
        levelId: string | null,
    ): void {
        // window.roomStore typed in src/global-window.d.ts (P4-compliant).
        const roomStore = window.roomStore; // TODO(TASK-08)
        if (!roomStore) return;
        try {
            const rooms: any[] = levelId ? roomStore.getByLevel(levelId) : roomStore.getAll();
            if (!rooms || rooms.length === 0) return;
            for (const room of rooms) {
                const polygon = room.boundary?.polygon;
                if (!polygon || polygon.length < 3) continue;
                const color   = RoomColourSystem.resolve(room);
                const opacity = RoomColourSystem.resolveOpacity(room);
                ctx.save();
                ctx.globalAlpha = opacity * 0.7;
                ctx.fillStyle = color;
                ctx.beginPath();
                const p0 = worldToScreen(polygon[0].x, polygon[0].z);
                ctx.moveTo(p0.sx, p0.sy);
                for (let i = 1; i < polygon.length; i++) {
                    const p = worldToScreen(polygon[i].x, polygon[i].z);
                    ctx.lineTo(p.sx, p.sy);
                }
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            }
        } catch {
            // Non-fatal — room store may not be ready
        }
    }

    renderPocheFills(
        ctx: CanvasRenderingContext2D,
        drawing: object,
        worldToScreen: WorldToScreen,
        sectionFlipV: boolean,
        styleResolver: StyleResolver | null,
        viewDef?: ViewDefinition,
    ): void {
        const polygons: PochePolygon[] = [];
        const _viewId = viewDef?.id;
        const _intentInstance = _viewId ? viewIntentInstanceStore.get(_viewId) : undefined;
        const _intentId = _intentInstance?.intentId ?? getDefaultSystemIntentId();
        const _intent = visibilityIntentStore.get(_intentId);
        const _virtInstance = _intentInstance ?? (_viewId ? {
            id: `default-${_viewId}`,
            viewId: _viewId,
            intentId: _intentId,
            localOverrides: { visibilityOverrides: [], graphicOverrides: [], isolateActive: false },
            createdAt: '',
            updatedAt: '',
        } : null);

        (drawing as any).three?.traverse?.((child: THREE.Object3D) => {
            if (!(child instanceof THREE.LineSegments)) return;
            const posAttr = child.geometry?.getAttribute('position') as THREE.BufferAttribute | undefined;
            if (!posAttr || posAttr.count < 6) return;

            const layerTag = [
                child.userData?.layerName,
                child.name,
                child.parent?.userData?.layerName,
                child.parent?.name,
            ].filter(Boolean).join(' ');
            if (!/:cut$/i.test(layerTag)) return;

            const baseLayer = planViewVGApplicator.baseIsoLayer(layerTag);
            if (!baseLayer) return;

            const vgCat = planViewVGApplicator.vgCategoryForLayer(layerTag);
            const resolved = vgCat && styleResolver ? styleResolver(vgCat, layerTag) : null;
            if (resolved && !resolved.visible) return;

            let intentFillColour: string | null = null;
            let intentFillPattern: string | null = null;
            let intentFillOpacity: number | null = null;

            if (_intent && _virtInstance && vgCat) {
                try {
                    const _cutAppearance = resolveIntentStyle(
                        _virtInstance as Parameters<typeof resolveIntentStyle>[0],
                        _intent,
                        vgCat,
                        'cut',
                        viewDef?.viewType ?? 'plan',
                        { elementType: vgCat, category: vgCat },
                    );
                    if (_cutAppearance.fill.style !== 'none' && _cutAppearance.visible) {
                        intentFillColour  = _cutAppearance.fill.colour ?? null;
                        intentFillPattern = (_cutAppearance.fill as any).pattern ?? null;
                        intentFillOpacity = _cutAppearance.fill.opacity;
                    }
                } catch {
                    // Intent resolve is non-critical; fall back to VG.
                }
            }

            const fill = intentFillColour ?? resolved?.fillColor ?? ISO_CUT_LAYER_TO_POCHE_FILL[baseLayer];
            if (!fill) return;

            const transparency = Math.max(0, Math.min(100, Number(resolved?.transparency ?? 0)));
            const vgOpacity = 1 - (transparency / 100);
            const opacity = intentFillOpacity ?? vgOpacity;
            if (opacity <= 0) return;

            const built = PocheFillBuilder.fromGeometry(child.geometry, fill, opacity);
            const fillPattern = intentFillPattern ?? resolved?.fillPattern;
            if (fillPattern && fillPattern !== 'solid') {
                for (const poly of built) {
                    poly.fillPattern = fillPattern;
                    poly.strokeColor = resolved?.edgeColor ?? fill;
                }
            }
            polygons.push(...built);
        });

        if (polygons.length === 0) return;

        ctx.save();
        ctx.setLineDash([]);
        for (const poly of polygons) {
            const points = this._parsePochePoints(poly, sectionFlipV);
            if (points.length < 3) continue;
            ctx.globalAlpha = Math.max(0, Math.min(1, poly.opacity));
            ctx.fillStyle = this.canvasFillStyleForPoche(ctx, poly.fill, poly.fillPattern, poly.strokeColor);
            ctx.beginPath();
            const p0 = worldToScreen(points[0].h, points[0].v);
            ctx.moveTo(p0.sx, p0.sy);
            for (let i = 1; i < points.length; i++) {
                const p = worldToScreen(points[i].h, points[i].v);
                ctx.lineTo(p.sx, p.sy);
            }
            ctx.closePath();
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    renderPipelinePolygons(
        ctx: CanvasRenderingContext2D,
        polygons: Array<{
            vertices: Float32Array | number[];
            fillColor: string;
            fillPattern?: string;
            strokeColor?: string;
            opacity: number;
        }>,
        worldToScreen: WorldToScreen,
    ): void {
        if (polygons.length === 0) return;
        ctx.save();
        ctx.setLineDash([]);
        for (const poly of polygons) {
            const verts = poly.vertices;
            if (verts.length < 6) continue;
            ctx.globalAlpha = Math.max(0, Math.min(1, poly.opacity));
            if (poly.fillPattern && poly.fillPattern !== 'solid') {
                ctx.fillStyle = this.canvasFillStyleForPoche(ctx, poly.fillColor, poly.fillPattern, poly.strokeColor);
            } else {
                ctx.fillStyle = poly.fillColor;
            }
            ctx.beginPath();
            const p0 = worldToScreen(verts[0], verts[1]);
            ctx.moveTo(p0.sx, p0.sy);
            for (let i = 2; i + 1 < verts.length; i += 2) {
                const p = worldToScreen(verts[i], verts[i + 1]);
                ctx.lineTo(p.sx, p.sy);
            }
            ctx.closePath();
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    canvasFillStyleForPoche(
        ctx: CanvasRenderingContext2D,
        fill: string,
        fillPattern?: string | null,
        strokeColor?: string | null,
    ): string | CanvasPattern {
        if (!fillPattern || fillPattern === 'solid') return fill;

        const strokeColour = strokeColor ?? '#333333';
        const libraryPattern = getHatchPattern(ctx, fillPattern, fill, strokeColour);
        if (libraryPattern) return libraryPattern;

        const tile = document.createElement('canvas');
        tile.width = 12;
        tile.height = 12;
        const tctx = tile.getContext('2d');
        if (!tctx) return fill;

        tctx.fillStyle = fill;
        tctx.fillRect(0, 0, tile.width, tile.height);
        tctx.strokeStyle = strokeColour;
        tctx.lineWidth = 1;
        tctx.beginPath();
        if (/cross/i.test(fillPattern)) {
            tctx.moveTo(0, 6);
            tctx.lineTo(12, 6);
            tctx.moveTo(6, 0);
            tctx.lineTo(6, 12);
        } else if (/dot/i.test(fillPattern)) {
            tctx.fillStyle = strokeColour;
            tctx.arc(6, 6, 1.2, 0, Math.PI * 2);
            tctx.fill();
        } else {
            tctx.moveTo(-2, 12);
            tctx.lineTo(12, -2);
            tctx.moveTo(4, 14);
            tctx.lineTo(14, 4);
        }
        tctx.stroke();

        return ctx.createPattern(tile, 'repeat') ?? fill;
    }

    private _parsePochePoints(poly: PochePolygon, sectionFlipV: boolean): Array<{ h: number; v: number }> {
        return poly.points
            .split(/\s+/)
            .map(pair => {
                const [xRaw, zRaw] = pair.split(',');
                const x = Number(xRaw);
                const z = Number(zRaw);
                if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
                return { h: x, v: sectionFlipV ? -z : z };
            })
            .filter((pt): pt is { h: number; v: number } => pt !== null);
    }
}

export const planViewFillRenderer = new PlanViewFillRenderer();
