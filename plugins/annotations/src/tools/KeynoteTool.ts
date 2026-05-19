/**
 * §ANN-B6 — Keynote Annotation Tool
 *
 * Click on a BIM element to place a keynote annotation.
 * After clicking, a small prompt is shown to enter:
 *   - Keynote key   (e.g. "A.01", "06.20.10")
 *   - Keynote text  (e.g. "Structural concrete wall 200mm")
 *
 * Keynotes are identification tags that reference a classification system
 * (CSI MasterFormat, Uniclass, NRM, etc.) rather than live element parameters.
 * The rendered keynote shows the key in a hexagon/diamond bubble with a leader.
 *
 * Contract compliance:
 *   §05 §7.8 — No bim-* / @thatopen/ui elements; uses native HTML only
 *   §01 §2   — CreateAnnotationCommand dispatched through CommandManager
 */

import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { AnnotationStore } from '../subsystem/AnnotationStore';
import { makePointRef, makeRef, resolveReferenceToPoint, ResolverStores } from '../subsystem/AnnotationReference';
import { makeAnnotationElement } from '../subsystem/AnnotationTypes';
import { BIM_LAYER } from '@pryzm/scene-committer';


export class KeynoteTool {
    public isActive = false;
    private _activeViewId: string | null = null;
    private _promptDiv: HTMLDivElement | null = null;

    private _raycaster = (() => {
        const raycaster = new THREE.Raycaster();
        raycaster.layers.set(BIM_LAYER);
        return raycaster;
    })();
    private _mouse = new THREE.Vector2();

    constructor(
        private _components: OBC.Components,
        _store: AnnotationStore,
        private _resolverStores: ResolverStores
    ) { void _store; }

    // ── Public API ────────────────────────────────────────────────────────────

    setActiveViewId(viewId: string | null): void {
        this._activeViewId = viewId;
    }

    setResolverStores(stores: ResolverStores): void {
        this._resolverStores = stores;
    }

    activate(): void {
        if (this.isActive) return;
        this.isActive = true;
        const el = this._domElement;
        if (el) {
            el.addEventListener('mousedown', this._onMouseDown);
            el.style.cursor = 'cell';
        }
        console.log('[KeynoteTool] activated — click an element to place a keynote');
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

        this._raycaster.setFromCamera(this._mouse, world.camera.three);

        // Try to hit a selectable BIM element
        const candidates: THREE.Object3D[] = [];
        world.scene.three.traverse((obj: THREE.Object3D) => {
            if (obj.userData?.isHelper || obj.userData?.isPreview || !obj.visible) return;
            const type = (obj.userData?.elementType || obj.userData?.type || '').toLowerCase();
            const semantic = ['wall', 'window', 'door', 'slab', 'furniture', 'column', 'beam', 'roof', 'stairs', 'ramp', 'railing'];
            if (obj.userData?.selectable || semantic.includes(type)) candidates.push(obj);
        });

        const hits = this._raycaster.intersectObjects(candidates, true);
        let hitPoint = new THREE.Vector3();
        let targetElementId: string | null = null;
        let targetElementType: string | null = null;

        if (hits.length > 0) {
            hitPoint = hits[0]!.point.clone();
            const root = this._findSelectableRoot(hits[0]!.object);
            if (root?.userData?.id) {
                targetElementId   = root.userData.id as string;
                targetElementType = (root.userData.elementType ?? root.userData.type ?? 'element') as string;
            }
        } else {
            // Fallback to ground plane
            const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
            this._raycaster.ray.intersectPlane(plane, hitPoint);
        }

        this._showPrompt(e.clientX, e.clientY, (key: string, text: string) => {
            this._placeKeynote(hitPoint, key, text, targetElementId, targetElementType, e.clientX, e.clientY);
        });
    };

    private _placeKeynote(
        worldPt: THREE.Vector3,
        keynoteKey: string,
        keynoteText: string,
        targetElementId: string | null,
        targetElementType: string | null,
        screenX: number,
        screenY: number
    ): void {
        if (!keynoteKey.trim()) return;
        if (!this._activeViewId) {
            console.warn('[KeynoteTool] No active view — keynote not created');
            return;
        }

        const id = crypto.randomUUID();

        let ref;
        let cachedPos: { x: number; y: number; z: number };

        if (targetElementId && targetElementType) {
            ref = makeRef(targetElementType.toLowerCase(), targetElementId, 'centroid');
            const resolved = resolveReferenceToPoint(ref, this._resolverStores);
            cachedPos = resolved
                ? { x: resolved.x, y: resolved.y, z: resolved.z }
                : { x: worldPt.x, y: worldPt.y, z: worldPt.z };
        } else {
            ref = makePointRef(worldPt);
            cachedPos = { x: worldPt.x, y: worldPt.y, z: worldPt.z };
        }

        const element = makeAnnotationElement(
            id,
            'keynote',
            this._activeViewId,
            [{ ...ref, cachedPosition: cachedPos }],
            {
                modelPoints: [cachedPos],
                offset: 0,
                screenOverride: { x: screenX - 24, y: screenY - 40 },
            },
            {
                keynoteKey:      keynoteKey.trim(),
                keynoteText:     keynoteText.trim(),
                targetElementId: targetElementId ?? '',
                showLeader:      targetElementId !== null,
            }
        );

        // P13 (A36): typed payload so AnnotationsState receives the correct id/viewId/kind.
        if (window.runtime?.bus) { window.runtime.bus.executeCommand('annotation.create', { id: element.id, viewId: element.ownerViewId, kind: element.type as any }).catch(() => {}); }
        console.log('[KeynoteTool] Placed keynote', keynoteKey, 'in view', this._activeViewId);
    }

    // ── Prompt UI (native HTML — no bim-* elements) ───────────────────────────

    private _showPrompt(
        x: number,
        y: number,
        onConfirm: (key: string, text: string) => void
    ): void {
        this._dismissPrompt();

        const div = document.createElement('div');
        div.className = 'ann-keynote-prompt';
        div.style.left = `${x}px`;
        div.style.top  = `${y}px`;

        const title = document.createElement('div');
        title.className = 'ann-keynote-prompt-title';
        title.textContent = 'Place Keynote';

        const keyLabel = document.createElement('label');
        keyLabel.className = 'ann-prompt-label';
        keyLabel.textContent = 'Key';
        const keyInput = document.createElement('input');
        keyInput.className = 'ann-keynote-key-input';
        keyInput.placeholder = 'e.g. A.01';
        keyInput.type = 'text';
        keyInput.maxLength = 12;

        const textLabel = document.createElement('label');
        textLabel.className = 'ann-prompt-label';
        textLabel.textContent = 'Description (optional)';
        const textInput = document.createElement('input');
        textInput.className = 'ann-keynote-text-input';
        textInput.placeholder = 'e.g. Structural concrete 200mm';
        textInput.type = 'text';

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

        div.appendChild(title);
        div.appendChild(keyLabel);
        div.appendChild(keyInput);
        div.appendChild(textLabel);
        div.appendChild(textInput);
        div.appendChild(btnRow);
        document.body.appendChild(div);
        this._promptDiv = div;

        keyInput.focus();

        const confirm = () => {
            const key  = keyInput.value;
            const text = textInput.value;
            this._dismissPrompt();
            onConfirm(key, text);
        };

        okBtn.addEventListener('click', confirm);
        cancelBtn.addEventListener('click', () => this._dismissPrompt());
        keyInput.addEventListener('keydown', (ke) => {
            if (ke.key === 'Enter') { ke.preventDefault(); textInput.focus(); }
            if (ke.key === 'Escape') this._dismissPrompt();
        });
        textInput.addEventListener('keydown', (ke) => {
            if (ke.key === 'Enter') { ke.preventDefault(); confirm(); }
            if (ke.key === 'Escape') this._dismissPrompt();
        });
    }

    private _dismissPrompt(): void {
        if (this._promptDiv?.parentElement) {
            this._promptDiv.parentElement.removeChild(this._promptDiv);
        }
        this._promptDiv = null;
    }

    private _findSelectableRoot(obj: THREE.Object3D): THREE.Object3D | null {
        let curr: THREE.Object3D | null = obj;
        while (curr) {
            const type = (curr.userData?.elementType || curr.userData?.type || '').toLowerCase();
            const semantic = ['wall', 'window', 'door', 'slab', 'furniture', 'column', 'beam', 'roof', 'stairs', 'ramp', 'railing'];
            if (curr.userData?.id && semantic.includes(type)) return curr;
            curr = curr.parent;
        }
        return null;
    }

    private _updateMouse(e: MouseEvent): void {
        const el = this._domElement;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        this._mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
        this._mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
    }
}
