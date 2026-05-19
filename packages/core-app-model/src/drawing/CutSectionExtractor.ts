/**
 * CutSectionExtractor — Contract 23 §3 (Day 3-4)
 *
 * Canvas2D-specific polygon extractor for cut-section poche fills.
 *
 * @see PocheFillBuilder           — SVG/PDF polygon extractor (do not modify)
 * @see PocheFillTable             — default fill colour table
 * @see DrawingPipelineWorker      — Stage 3 (CutIntersector) for worker context
 */

import * as THREE from '@pryzm/renderer-three/three';
import { PocheFillBuilder, type PochePolygon } from '../views/PocheFillBuilder';
import { resolvePocheFill } from './PocheFillTable';

export interface CutPocheResult {
    points: string;
    fillColor: string;
    fillOpacity: number;
    fillPattern?: string;
    isoBaseLayer: string;
}

export interface CutSectionExtractOptions {
    fillColorOverrides?: Record<string, string>;
    opacityOverrides?: Record<string, number>;
    patternOverrides?: Record<string, string>;
}

export function extractCutPoches(
    drawing: object,
    opts: CutSectionExtractOptions = {},
): CutPocheResult[] {
    const results: CutPocheResult[] = [];

    const three = (drawing as any).three;
    if (!three?.traverse) return results;

    three.traverse((child: THREE.Object3D) => {
        if (!(child instanceof THREE.LineSegments)) return;
        const geom = child.geometry;
        if (!geom) return;

        const layerTag = [
            child.userData?.layerName,
            child.name,
            child.parent?.userData?.layerName,
            child.parent?.name,
        ].filter(Boolean).join(' ');

        if (!/:cut$/i.test(layerTag)) return;

        const isoBaseLayer = _resolveBaseLayer(layerTag);
        const fillColor = resolvePocheFill(
            isoBaseLayer,
            opts.fillColorOverrides?.[isoBaseLayer] ?? null,
        );
        if (!fillColor) return;

        child.updateWorldMatrix(true, false);
        const worldGeom = geom.clone().applyMatrix4(child.matrixWorld);

        const rawOpacity = opts.opacityOverrides?.[isoBaseLayer] ?? 0;
        const opacity = Math.max(0, Math.min(1, 1 - rawOpacity));

        const polygons: PochePolygon[] = PocheFillBuilder.fromGeometry(worldGeom, fillColor, opacity);

        for (const poly of polygons) {
            if (!poly.points || poly.points.trim().length === 0) continue;
            results.push({
                points:      poly.points,
                fillColor:   poly.fill,
                fillOpacity: poly.opacity,
                fillPattern: opts.patternOverrides?.[isoBaseLayer] ?? poly.fillPattern,
                isoBaseLayer,
            });
        }
    });

    return results;
}

function _resolveBaseLayer(layerTag: string): string {
    for (const part of layerTag.split(/\s+/)) {
        const base = part.replace(/:.*$/, '').toUpperCase();
        if (base.startsWith('A-')) return base;
    }
    return '';
}
