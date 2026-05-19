/**
 * §ANN-B3 — Text Note Tool
 *
 * Click to place a free text annotation in the active view.
 * After clicking, a small prompt is shown to enter the note text.
 * The note is placed at the clicked world point (projected to screen for rendering).
 *
 * Contract compliance:
 *   §05 §7.8 — No bim-* / @thatopen/ui elements; uses native HTML only
 *   §01 §2   — CreateAnnotationCommand dispatched through CommandManager
 */

import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { AnnotationStore } from '../subsystem/AnnotationStore';
import { makePointRef } from '../subsystem/AnnotationReference';
import { makeAnnotationElement } from '../subsystem/AnnotationTypes';
import { BIM_LAYER } from '@pryzm/scene-committer';


export class TextNoteTool {
    public isActive = false;
    private _activeViewId: string | null = null;

    private _raycaster = (() => {
        const raycaster = new THREE.Raycaster();
        raycaster.layers.set(BIM_LAYER);
        return raycaster;
    })();
    private _mouse = new THREE.Vector2();
    private _promptDiv: HTMLDivElement | null = null;

    constructor(
        private _components: OBC.Components,
        _store: AnnotationStore
    ) { void _store; }

    // ── Public API ────────────────────────────────────────────────────────────

    setActiveViewId(viewId: string | null): void {
        this._activeViewId = viewId;
    }

    activate(): void {
        if (this.isActive) return;
        this.isActive = true;
        const el = this._domElement;
        if (el) {
            el.addEventListener('mousedown', this._onMouseDown);
            el.style.cursor = 'text';
        }
        console.log('[TextNoteTool] activated — click to place a text note');
    }

    deactivate(): void {
        if (!this.isActive) return;
        this.isActive = false;
        const el = this._domElement;
        if (el) {
            el.removeEventListener('mousedown', this._onMouseDown);
            el.style.cursor = 'default';
        }
        this._dismissPrompt();
    }

    dispose(): void {
        this.deactivate();
    }

    // ── Private ───────────────────────────────────────────────────────────────

    private get _world(): any {
        const worlds = this._components.get(OBC.Worlds);
        return worlds.list.get('main') || Array.from(worlds.list.values())[0];
    }

    private get _domElement(): HTMLCanvasElement | null {
        return this._world?.renderer?.three.domElement ?? null;
    }

    private _onMouseDown = (e: MouseEvent): void => {
        if (!this.isActive || e.button !== 0) return;
        this._updateMouse(e);

        const world = this._world;
        if (!world) return;

        // Raycast against the scene floor / any visible surface
        const planeY = 0;
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
        this._raycaster.setFromCamera(this._mouse, world.camera.three);
        const target = new THREE.Vector3();
        this._raycaster.ray.intersectPlane(plane, target);
        if (!target) return;

        const screenX = e.clientX;
        const screenY = e.clientY;

        this._showPrompt(screenX, screenY, (text: string) => {
            this._placeTextNote(target, text, screenX, screenY);
        });
    };

    private _placeTextNote(
        worldPt: THREE.Vector3,
        text: string,
        screenX: number,
        screenY: number
    ): void {
        if (!text.trim()) return;
        if (!this._activeViewId) {
            console.warn('[TextNoteTool] No active view — annotation not created');
            return;
        }

        const id = crypto.randomUUID();
        const ref = makePointRef(worldPt);
        const element = makeAnnotationElement(
            id,
            'text-note',
            this._activeViewId,
            [{ ...ref, cachedPosition: { x: worldPt.x, y: worldPt.y, z: worldPt.z } }],
            {
                modelPoints: [{ x: worldPt.x, y: worldPt.y, z: worldPt.z }],
                offset: 0,
                screenOverride: { x: screenX, y: screenY },
            },
            { text: text.trim() }
        );

        // P13 (A36): typed payload so AnnotationsState receives the correct id/viewId/kind.
        if (window.runtime?.bus) { window.runtime.bus.executeCommand('annotation.create', { id: element.id, viewId: element.ownerViewId, kind: element.type as any }).catch(() => {}); }
        console.log('[TextNoteTool] Created text note', id, 'in view', this._activeViewId);
    }

    // ── Prompt UI (native HTML — no bim-* elements) ───────────────────────────

    private _showPrompt(
        x: number,
        y: number,
        onConfirm: (text: string) => void
    ): void {
        this._dismissPrompt();

        const div = document.createElement('div');
        div.className = 'ann-text-prompt';
        div.style.left = `${x}px`;
        div.style.top  = `${y}px`;

        const textarea = document.createElement('textarea');
        textarea.className = 'ann-text-prompt-input';
        textarea.placeholder = 'Enter note text…';
        textarea.rows = 3;

        const btnRow = document.createElement('div');
        btnRow.className = 'ann-text-prompt-btns';

        const okBtn = document.createElement('button');
        okBtn.className = 'ann-btn ann-btn-primary';
        okBtn.textContent = 'Place';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'ann-btn ann-btn-ghost';
        cancelBtn.textContent = 'Cancel';

        btnRow.appendChild(okBtn);
        btnRow.appendChild(cancelBtn);
        div.appendChild(textarea);
        div.appendChild(btnRow);
        document.body.appendChild(div);
        this._promptDiv = div;

        textarea.focus();

        const confirm = () => {
            const text = textarea.value;
            this._dismissPrompt();
            onConfirm(text);
        };

        okBtn.addEventListener('click', confirm);
        cancelBtn.addEventListener('click', () => this._dismissPrompt());
        textarea.addEventListener('keydown', (ke) => {
            if (ke.key === 'Enter' && !ke.shiftKey) { ke.preventDefault(); confirm(); }
            if (ke.key === 'Escape') this._dismissPrompt();
        });
    }

    private _dismissPrompt(): void {
        if (this._promptDiv?.parentElement) {
            this._promptDiv.parentElement.removeChild(this._promptDiv);
        }
        this._promptDiv = null;
    }

    private _updateMouse(e: MouseEvent): void {
        const el = this._domElement;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        this._mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
        this._mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
    }
}
