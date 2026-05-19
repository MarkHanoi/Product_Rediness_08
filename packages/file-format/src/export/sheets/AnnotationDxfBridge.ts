import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { annotationStore, AnnotationStore } from '@pryzm/plugin-annotations';
import { AnnotationElement } from '@pryzm/plugin-annotations';

const ANNOTATION_LAYER = 'A-ANNO';

interface EphemeralAnnotationItem {
    drawing: OBC.TechnicalDrawing;
    system: any;
    uuid: string;
}

interface EphemeralLineItem {
    object: THREE.LineSegments;
}

interface EphemeralState {
    activeLayer: string;
    annotations: EphemeralAnnotationItem[];
    lines: EphemeralLineItem[];
}

export interface AnnotationDxfBridgeOptions {
    components: OBC.Components;
    drawing: OBC.TechnicalDrawing;
    viewId: string;
    annotations?: AnnotationElement[];
    entries?: OBC.DxfDrawingEntry[];
    paper?: OBC.DxfPaperOptions;
}

export class AnnotationDxfBridge {
    constructor(private readonly _store: AnnotationStore = annotationStore) {}

    exportToDxf(options: AnnotationDxfBridgeOptions): string {
        return this.withEphemeralAnnotations(options, () => {
            const dxfManager = options.components.get(OBC.DxfManager);
            const entries = options.entries ?? [{ drawing: options.drawing, viewports: [{}] }];
            return dxfManager.exporter.export(entries, options.paper);
        });
    }

    withEphemeralAnnotations<T>(options: AnnotationDxfBridgeOptions, callback: () => T): T {
        const state: EphemeralState = {
            activeLayer: options.drawing.activeLayer,
            annotations: [],
            lines: [],
        };

        try {
            this._inject(options, state);
            return callback();
        } finally {
            this._dispose(state);
            options.drawing.activeLayer = state.activeLayer;
        }
    }

    private _inject(options: AnnotationDxfBridgeOptions, state: EphemeralState): void {
        const anns = options.annotations ?? this._store.getByView(options.viewId);
        if (anns.length === 0) return;

        const drawing = options.drawing;
        if (!drawing.layers.has(ANNOTATION_LAYER)) {
            drawing.layers.create(ANNOTATION_LAYER);
        }
        drawing.activeLayer = ANNOTATION_LAYER;

        for (const ann of anns) {
            this._injectOne(options.components, drawing, ann, state);
        }
    }

    private _injectOne(
        components: OBC.Components,
        drawing: OBC.TechnicalDrawing,
        ann: AnnotationElement,
        state: EphemeralState,
    ): void {
        switch (ann.type) {
            case 'linear-dim':
            case 'radius-dim':
            case 'diameter-dim':
                this._addLinear(components, drawing, ann, state);
                return;
            case 'angular-dim':
                this._addAngle(components, drawing, ann, state);
                return;
            case 'slope-dim':
            case 'roof-slope-arrow':
                this._addSlope(components, drawing, ann, state);
                return;
            case 'callout-detail':
                this._addCallout(components, drawing, ann, state);
                return;
            case 'detail-line':
            case 'revision-cloud':
            case 'room-fill':
            case 'level-datum-line':
            case 'section-grid-line':
            case 'section-mark':
            case 'elevation-mark':
            case 'grid-bubble':
                this._addLinework(drawing, ann, state);
                this._addLeaderIfText(components, drawing, ann, state);
                return;
            default:
                this._addLeaderIfText(components, drawing, ann, state);
                this._addLinework(drawing, ann, state);
        }
    }

    private _addLinear(
        components: OBC.Components,
        drawing: OBC.TechnicalDrawing,
        ann: AnnotationElement,
        state: EphemeralState,
    ): void {
        const points = this._points(drawing, ann);
        if (points.length < 2) return;

        const techDrawings = components.get(OBC.TechnicalDrawings);
        const system = techDrawings.use(OBC.LinearAnnotations);
        const item = system.add(drawing, {
            pointA: points[0],
            pointB: points[1],
            offset: this._num(ann.geometry2D.offset, 0),
            style: 'default',
        });
        state.annotations.push({ drawing, system, uuid: item.uuid });
    }

    private _addAngle(
        components: OBC.Components,
        drawing: OBC.TechnicalDrawing,
        ann: AnnotationElement,
        state: EphemeralState,
    ): void {
        const points = this._points(drawing, ann);
        if (points.length < 3) return;

        const techDrawings = components.get(OBC.TechnicalDrawings);
        const system = techDrawings.use(OBC.AngleAnnotations);
        const item = system.add(drawing, {
            pointA: points[0],
            vertex: points[1],
            pointB: points[2],
            arcRadius: this._num(ann.parameters?.arcRadius, Math.max(Math.abs(ann.geometry2D.offset), 0.5)),
            flipped: Boolean(ann.parameters?.flipped),
            style: 'default',
        });
        state.annotations.push({ drawing, system, uuid: item.uuid });
    }

    private _addSlope(
        components: OBC.Components,
        drawing: OBC.TechnicalDrawing,
        ann: AnnotationElement,
        state: EphemeralState,
    ): void {
        const points = this._points(drawing, ann);
        if (points.length < 2) return;

        const direction = new THREE.Vector3().subVectors(points[1], points[0]).setY(0);
        if (direction.lengthSq() < 0.000001) direction.set(1, 0, 0);
        direction.normalize();

        const techDrawings = components.get(OBC.TechnicalDrawings);
        const system = techDrawings.use(OBC.SlopeAnnotations);
        const item = system.add(drawing, {
            position: points[0],
            direction,
            slope: this._num(ann.parameters?.slopeRatio, this._num(ann.parameters?.slope, 0)),
            style: 'default',
        });
        state.annotations.push({ drawing, system, uuid: item.uuid });
    }

    private _addCallout(
        components: OBC.Components,
        drawing: OBC.TechnicalDrawing,
        ann: AnnotationElement,
        state: EphemeralState,
    ): void {
        const points = this._points(drawing, ann);
        if (points.length === 0) return;

        const center = points[0];
        const elbow = points[1] ?? center.clone().add(new THREE.Vector3(0.8, 0, -0.6));
        const extensionEnd = points[2] ?? elbow.clone().add(new THREE.Vector3(1.0, 0, 0));
        const techDrawings = components.get(OBC.TechnicalDrawings);
        const system = techDrawings.use(OBC.CalloutAnnotations);
        const item = system.add(drawing, {
            center,
            halfW: this._num(ann.parameters?.halfW, 0.75),
            halfH: this._num(ann.parameters?.halfH, 0.45),
            elbow,
            extensionEnd,
            text: this._label(ann) || 'Callout',
            style: 'default',
        });
        state.annotations.push({ drawing, system, uuid: item.uuid });
    }

    private _addLeaderIfText(
        components: OBC.Components,
        drawing: OBC.TechnicalDrawing,
        ann: AnnotationElement,
        state: EphemeralState,
    ): void {
        const text = this._label(ann);
        if (!text) return;

        const points = this._points(drawing, ann);
        const arrowTip = points[0] ?? new THREE.Vector3();
        const elbow = points[1] ?? arrowTip.clone().add(new THREE.Vector3(0.35, 0, -0.25));
        const extensionEnd = points[2] ?? elbow.clone().add(new THREE.Vector3(0.75, 0, 0));
        const techDrawings = components.get(OBC.TechnicalDrawings);
        const system = techDrawings.use(OBC.LeaderAnnotations);
        const item = system.add(drawing, {
            arrowTip,
            elbow,
            extensionEnd,
            text,
            style: 'default',
        });
        state.annotations.push({ drawing, system, uuid: item.uuid });
    }

    private _addLinework(
        drawing: OBC.TechnicalDrawing,
        ann: AnnotationElement,
        state: EphemeralState,
    ): void {
        const points = this._points(drawing, ann);
        if (points.length < 2) return;

        const positions: number[] = [];
        const closed = ann.type === 'revision-cloud' || ann.type === 'room-fill';
        for (let i = 0; i < points.length - 1; i++) {
            this._pushPair(positions, points[i], points[i + 1]);
        }
        if (closed && points.length > 2) {
            this._pushPair(positions, points[points.length - 1], points[0]);
        }
        if (positions.length === 0) return;

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        const layerMaterial = drawing.layers.get(ANNOTATION_LAYER)?.material;
        const line = new THREE.LineSegments(geometry, layerMaterial);
        drawing.addProjectionLines(line, ANNOTATION_LAYER);
        state.lines.push({ object: line });
    }

    private _dispose(state: EphemeralState): void {
        for (let i = state.annotations.length - 1; i >= 0; i--) {
            const item = state.annotations[i];
            try {
                item.system.delete(item.drawing, [item.uuid]);
            } catch {
                const entry = item.drawing.annotations.get(item.uuid) as any;
                if (entry?.three) this._disposeObject(entry.three, true);
                try { item.drawing.annotations.delete(item.uuid); } catch {}
            }
        }
        state.annotations = [];

        for (const item of state.lines) {
            this._disposeObject(item.object, false);
        }
        state.lines = [];
    }

    private _disposeObject(object: THREE.Object3D, disposeMaterials: boolean): void {
        if (object.parent) object.parent.remove(object);
        object.traverse(child => {
            const mesh = child as THREE.Mesh | THREE.LineSegments;
            mesh.geometry?.dispose?.();
            if (disposeMaterials) this._disposeMaterial((mesh as any).material);
        });
    }

    private _disposeMaterial(material: THREE.Material | THREE.Material[] | undefined): void {
        if (!material) return;
        if (Array.isArray(material)) {
            for (const mat of material) mat.dispose();
            return;
        }
        material.dispose();
    }

    private _points(drawing: OBC.TechnicalDrawing, ann: AnnotationElement): THREE.Vector3[] {
        return (ann.geometry2D?.modelPoints ?? [])
            .filter(p => Number.isFinite(p?.x) && Number.isFinite(p?.y) && Number.isFinite(p?.z))
            .map(p => this._toDrawingPoint(drawing, p));
    }

    private _toDrawingPoint(
        drawing: OBC.TechnicalDrawing,
        point: { x: number; y: number; z: number },
    ): THREE.Vector3 {
        drawing.three.updateWorldMatrix(true, false);
        const local = drawing.three.worldToLocal(new THREE.Vector3(point.x, point.y, point.z));
        local.y = 0;
        return local;
    }

    private _pushPair(out: number[], a: THREE.Vector3, b: THREE.Vector3): void {
        out.push(a.x, 0, a.z, b.x, 0, b.z);
    }

    private _label(ann: AnnotationElement): string {
        const p = ann.parameters ?? {};
        const direct = p.text ?? p.cachedLabel ?? p.label ?? p.mark ?? p.value ?? p.name ?? p.reference ?? p.detailRef;
        if (typeof direct === 'string' && direct.trim()) return direct.trim();
        if (ann.type === 'room-tag') {
            return [p.roomNumber, p.roomName, p.areaLabel].filter(Boolean).join(' ').trim();
        }
        if (ann.type === 'door-tag' || ann.type === 'window-tag') {
            return [p.typeMark, p.width, p.height].filter(Boolean).join(' × ').trim();
        }
        if (ann.type === 'level-tag') {
            const elevation = this._num(p.elevation, NaN);
            return Number.isFinite(elevation) ? `${elevation.toFixed(3)} m` : '';
        }
        if (ann.type === 'grid-bubble' || ann.type === 'section-grid-line') {
            return String(p.gridName ?? p.gridId ?? '').trim();
        }
        return '';
    }

    private _num(value: unknown, fallback: number): number {
        return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
    }

}

export const annotationDxfBridge = new AnnotationDxfBridge();