/**
 * DOC-2.7 — SectionMarkTool
 *
 * Two-click interaction in a plan view:
 *   Click 1 → set cut-line start point (cutPointA)
 *   Click 2 → set cut-line end point (cutPointB) → fires CreateSectionMarkCommand
 *
 * The command atomically creates both a section ViewDefinition and a
 * section-mark AnnotationElement in the host plan view.
 *
 * Visual feedback:
 *   - Rubber-band line from click 1 to cursor during PICK_B state
 *   - Cursor: crosshair when active
 *
 * Contract compliance:
 *   §05 §7.8 — No bim-* / @thatopen/ui elements
 *   §01 §2   — CreateSectionMarkCommand dispatched through CommandManager
 *   §01 §3.3 — AnnotationElement contains only plain serialisable primitives
 */

import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { CreateSectionMarkCommand } from '../commands/CreateSectionMarkCommand';
import { BIM_LAYER } from '@pryzm/scene-committer';

type CommandManager = { execute(cmd: unknown): void };

enum SectionMarkState { IDLE, PICK_A, PICK_B }

export class SectionMarkTool {
    public isActive = false;
    private _state = SectionMarkState.IDLE;
    private _activeViewId: string | null = null;
    private _pointA: THREE.Vector3 | null = null;

    private _raycaster = (() => {
        const r = new THREE.Raycaster();
        r.layers.set(BIM_LAYER);
        return r;
    })();
    private _mouse = new THREE.Vector2();

    private _previewLine: THREE.Line | null = null;
    private _previewMat = new THREE.LineBasicMaterial({ color: 0x0055ff, linewidth: 1 });

    private _escListener: ((e: KeyboardEvent) => void) | null = null;

    constructor(
        private _components: OBC.Components,
        private _commandManager: CommandManager,
    ) {}

    setActiveViewId(viewId: string | null): void { this._activeViewId = viewId; }

    activate(): void {
        if (this.isActive) return;
        this.isActive = true;
        this._state = SectionMarkState.PICK_A;
        const el = this._domElement;
        if (el) {
            el.addEventListener('mousedown', this._onMouseDown);
            el.addEventListener('mousemove', this._onMouseMove);
            el.style.cursor = 'crosshair';
        }
        this._escListener = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (this._state === SectionMarkState.PICK_B) {
                    this._pointA = null;
                    this._removePreview();
                    this._state = SectionMarkState.PICK_A;
                } else {
                    this.deactivate();
                }
            }
        };
        document.addEventListener('keydown', this._escListener);
        console.log('[SectionMarkTool] activated — click two points to define the section cut line');
    }

    deactivate(): void {
        if (!this.isActive) return;
        this.isActive = false;
        this._state = SectionMarkState.IDLE;
        this._pointA = null;
        this._removePreview();
        const el = this._domElement;
        if (el) {
            el.removeEventListener('mousedown', this._onMouseDown);
            el.removeEventListener('mousemove', this._onMouseMove);
            el.style.cursor = 'default';
        }
        if (this._escListener) {
            document.removeEventListener('keydown', this._escListener);
            this._escListener = null;
        }
    }

    dispose(): void { this.deactivate(); this._previewMat.dispose(); }

    private get _world(): any {
        const worlds = this._components.get(OBC.Worlds);
        return worlds.list.get('main') || Array.from(worlds.list.values())[0];
    }

    private get _domElement(): HTMLCanvasElement | null {
        return this._world?.renderer?.three.domElement ?? null;
    }

    private get _scene(): THREE.Scene | null {
        return this._world?.scene?.three ?? null;
    }

    private get _camera(): THREE.Camera | null {
        return this._world?.camera?.three ?? null;
    }

    private _worldPoint(e: MouseEvent): THREE.Vector3 | null {
        const el = this._domElement;
        const camera = this._camera;
        const scene = this._scene;
        if (!el || !camera || !scene) return null;
        const rect = el.getBoundingClientRect();
        this._mouse.set(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1,
        );
        this._raycaster.setFromCamera(this._mouse, camera);
        const hits = this._raycaster.intersectObjects(scene.children, true);
        if (hits.length > 0) return hits[0]!.point.clone();
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const pt = new THREE.Vector3();
        this._raycaster.ray.intersectPlane(plane, pt);
        return pt;
    }

    private _onMouseDown = (e: MouseEvent): void => {
        if (!this.isActive || e.button !== 0) return;
        const pt = this._worldPoint(e);
        if (!pt) return;

        if (this._state === SectionMarkState.PICK_A) {
            this._pointA = pt;
            this._state = SectionMarkState.PICK_B;
            this._initPreview(pt);
            console.log('[SectionMarkTool] Point A set:', pt);
        } else if (this._state === SectionMarkState.PICK_B && this._pointA) {
            const ptA = this._pointA;
            const ptB = pt;
            this._removePreview();

            const dir = new THREE.Vector3().subVectors(ptB, ptA).normalize();
            const tail = { x: dir.z, z: -dir.x };

            const _annId = crypto.randomUUID();
            if (window.runtime?.bus) { window.runtime.bus.executeCommand('annotation.create', { id: _annId, viewId: this._activeViewId ?? '', kind: 'section-mark' as any }).catch(() => {}); }
            this._commandManager.execute(new CreateSectionMarkCommand({
                sectionViewId:   crypto.randomUUID(),
                sectionViewName: `Section ${Date.now().toString(36).toUpperCase()}`,
                annotationId:    _annId,
                hostViewId:      this._activeViewId ?? '',
                cutPointA:       { x: ptA.x, y: ptA.y, z: ptA.z },
                cutPointB:       { x: ptB.x, y: ptB.y, z: ptB.z },
                tailDirection:   tail,
            }));

            console.log('[SectionMarkTool] Section mark created');
            this._pointA = null;
            this._state = SectionMarkState.PICK_A;
        }
    };

    private _onMouseMove = (e: MouseEvent): void => {
        if (!this.isActive || this._state !== SectionMarkState.PICK_B || !this._pointA) return;
        const pt = this._worldPoint(e);
        if (!pt || !this._previewLine) return;
        const positions = (this._previewLine.geometry as THREE.BufferGeometry)
            .attributes.position as THREE.BufferAttribute;
        positions.setXYZ(0, this._pointA.x, this._pointA.y, this._pointA.z);
        positions.setXYZ(1, pt.x, pt.y, pt.z);
        positions.needsUpdate = true;
    };

    private _initPreview(start: THREE.Vector3): void {
        const geo = new THREE.BufferGeometry();
        const pos = new Float32Array([start.x, start.y, start.z, start.x, start.y, start.z]);
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        this._previewLine = new THREE.Line(geo, this._previewMat);
        this._scene?.add(this._previewLine);
    }

    private _removePreview(): void {
        if (this._previewLine) {
            this._scene?.remove(this._previewLine);
            this._previewLine.geometry.dispose();
            this._previewLine = null;
        }
    }
}
