/**
 * §ANN-B4 — Element Tag Tool
 *
 * Click on a BIM element to place a parameter-driven tag annotation.
 * The tag evaluates a `labelExpression` against the element's parameters
 * at creation time (and whenever the referenced element changes, via the
 * DependencyGraph + AnnotationStore.update refresh cycle).
 *
 * Supported label expressions:
 *   "${type}"               → element type name
 *   "${mark}"               → element mark / number
 *   "${type} ${mark}"       → combined
 *   "${parameter:fieldName}"→ specific parameter field
 *
 * Contract compliance:
 *   §05 §7.8 — No bim-* / @thatopen/ui elements
 *   §01 §2   — CreateAnnotationCommand dispatched through CommandManager
 */

import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { AnnotationStore } from '../subsystem/AnnotationStore';
import { makeRef, resolveReferenceToPoint, ResolverStores, StableReference } from '../subsystem/AnnotationReference';
import { makeAnnotationElement } from '../subsystem/AnnotationTypes';
import { BIM_LAYER } from '@pryzm/scene-committer';

// ─── Label expression evaluator ──────────────────────────────────────────────

function evaluateLabel(expression: string, element: any): string {
    if (!element) return expression;

    return expression.replace(/\$\{([^}]+)\}/g, (_match, key) => {
        const trimmed = key.trim();

        if (trimmed === 'type') {
            return element.userData?.elementType
                ?? element.type
                ?? element.elementType
                ?? '—';
        }
        if (trimmed === 'mark') {
            return element.userData?.mark
                ?? element.mark
                ?? element.number
                ?? element.id?.slice(0, 6)
                ?? '—';
        }
        if (trimmed.startsWith('parameter:')) {
            const paramKey = trimmed.slice('parameter:'.length);
            return element.properties?.[paramKey]
                ?? element.parameters?.[paramKey]
                ?? element[paramKey]
                ?? '—';
        }
        return element[trimmed] ?? '—';
    });
}

// ─────────────────────────────────────────────────────────────────────────────

export class ElementTagTool {
    public isActive = false;
    private _activeViewId: string | null = null;
    private _labelExpression = '${type} ${mark}';
    private _escListener: ((e: KeyboardEvent) => void) | null = null;

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

    setLabelExpression(expr: string): void {
        this._labelExpression = expr;
    }

    activate(): void {
        if (this.isActive) return;
        this.isActive = true;
        const el = this._domElement;
        if (el) {
            el.addEventListener('mousedown', this._onMouseDown);
            el.style.cursor = 'cell';
        }
        this._escListener = (e: KeyboardEvent) => { if (e.key === 'Escape') this.deactivate(); };
        document.addEventListener('keydown', this._escListener);
        console.log('[ElementTagTool] activated — click an element to tag it');
    }

    deactivate(): void {
        if (!this.isActive) return;
        this.isActive = false;
        const el = this._domElement;
        if (el) {
            el.removeEventListener('mousedown', this._onMouseDown);
            el.style.cursor = 'default';
        }
        if (this._escListener) {
            document.removeEventListener('keydown', this._escListener);
            this._escListener = null;
        }
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

        const hit = this._raycast();
        if (!hit) return;

        const root = this._findSelectableRoot(hit.object);
        if (!root?.userData?.id) {
            console.log('[ElementTagTool] No selectable element found at click');
            return;
        }

        this._placeTag(root, hit.point, e.clientX, e.clientY);
    };

    private _placeTag(
        obj: THREE.Object3D,
        hitPoint: THREE.Vector3,
        screenX: number,
        screenY: number
    ): void {
        if (!this._activeViewId) {
            console.warn('[ElementTagTool] No active view — tag not created');
            return;
        }

        const elementId   = obj.userData.id as string;
        const elementType = (obj.userData.elementType ?? obj.userData.type ?? 'element') as string;

        const storeKey = `${elementType.toLowerCase()}Store`;
        const store = (this._resolverStores as any)[storeKey]
            ?? (window as unknown as Record<string, unknown>)[storeKey];
        const element = store?.getById?.(elementId) ?? obj;

        const cachedLabel = evaluateLabel(this._labelExpression, element ?? obj);

        const ref = makeRef(elementType.toLowerCase(), elementId, 'centroid');
        const resolved = resolveReferenceToPoint(ref, this._resolverStores);
        const cachedPos = resolved
            ? { x: resolved.x, y: resolved.y, z: resolved.z }
            : { x: hitPoint.x, y: hitPoint.y, z: hitPoint.z };

        const refs: StableReference[] = [{ ...ref, cachedPosition: cachedPos }];

        const id = crypto.randomUUID();
        const ann = makeAnnotationElement(
            id,
            'tag',
            this._activeViewId,
            refs,
            {
                modelPoints: [cachedPos],
                offset: 0,
                screenOverride: { x: screenX - 20, y: screenY - 30 },
            },
            {
                targetElementId: elementId,
                labelExpression: this._labelExpression,
                cachedLabel,
                showLeader: true,
            }
        );

        if (window.runtime?.bus) { window.runtime.bus.executeCommand('annotation.create', { id: ann.id, viewId: ann.ownerViewId, kind: ann.type as any }).catch(() => {}); }
        console.log('[ElementTagTool] Tagged element', elementId, '→', cachedLabel, 'in view', this._activeViewId);
    }

    // ── Raycast helpers ───────────────────────────────────────────────────────

    private _raycast(): THREE.Intersection | null {
        const world = this._world;
        if (!world?.camera || !world?.scene) return null;

        this._raycaster.setFromCamera(this._mouse, world.camera.three);

        const candidates: THREE.Object3D[] = [];
        world.scene.three.traverse((obj: THREE.Object3D) => {
            if (obj.userData?.isHelper || obj.userData?.isPreview || !obj.visible) return;
            const type = (obj.userData?.elementType || obj.userData?.type || '').toLowerCase();
            const semantic = ['wall', 'window', 'door', 'slab', 'furniture', 'column', 'beam', 'roof', 'stairs', 'ramp', 'railing'];
            if (obj.userData?.selectable || semantic.includes(type)) candidates.push(obj);
        });

        const hits = this._raycaster.intersectObjects(candidates, true);
        if (!hits.length) return null;
        for (const hit of hits) {
            const root = this._findSelectableRoot(hit.object);
            if (root) return { ...hit, object: root };
        }
        return null;
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
