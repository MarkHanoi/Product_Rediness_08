/**
 * OpeningTool — 3D-viewport tool for cutting openings in slabs.
 *
 * Companion to OpeningPlanToolHandler (plan-view). Both feed CreateOpeningCommand
 * with profiles in WORLD XZ coordinates (the same space SlabFragmentBuilder
 * triangulates in — see O3-FIX in complete()).
 *
 * Drawing modes — set via window._pryzmActiveOpeningMode by ToolManager
 * before activate(), or passed directly as activate(mode):
 *
 *   '2point':
 *     Click first corner on the slab → live rubber-band rectangle preview.
 *     Click second corner → rectangle profile committed and tool stays armed.
 *     Escape exits.
 *
 *   'polyline' (default):
 *     Click to add polygon vertices (min 3).
 *     Double-click OR Enter OR HUD ✓ button closes the polygon and commits.
 *     Backspace or HUD ↩ removes the last vertex.
 *     Escape exits.
 *
 * Host slab resolution order (mirrors OpeningPlanToolHandler._resolveHostSlab):
 *   1. selectionManager.selectedObject → traverse up to userData.elementType==='slab'
 *   2. selectionManager.getSelectedId?.() / selectedId → slabStore.getById()
 *   3. window._pryzmSelectedSlabId  (captured by ToolManager at button-press time
 *      so a picker click that clears the live selection doesn't break us).
 */

import * as THREE from '@pryzm/renderer-three/three';
import * as OBC   from '@thatopen/components';
import { CreateOpeningCommand } from '@pryzm/command-registry';

export type OpeningDrawingMode = '2point' | 'polyline';

// ── Colour palette — crimson/red, identical to OpeningPlanToolHandler ─────────
const OPEN_FILL_COLOR  = 0xdc2626;
const OPEN_EDGE_COLOR  = 0xb91c1c;

// ── HUD element IDs ───────────────────────────────────────────────────────────
const HUD_ID        = 'opening-tool-hud';
const HUD_LABEL_ID  = 'opening-tool-hud-label';
const HUD_UNDO_ID   = 'opening-tool-hud-undo';
const HUD_CREATE_ID = 'opening-tool-hud-create';
const HUD_EXIT_ID   = 'opening-tool-hud-exit';

export class OpeningTool {
    static readonly uuid = 'opening-tool';
    readonly name: string = 'opening';

    private _active = false;
    private _mode: OpeningDrawingMode = 'polyline';
    private _selectedSlabId: string | null = null;
    private _slabMesh: THREE.Object3D | null = null;
    private _points: THREE.Vector3[] = [];
    private _cursorPt: THREE.Vector3 | null = null;

    // Preview objects — added/removed from world.scene.three each session.
    private _previewLine: THREE.Line | null = null;       // edges
    private _previewFill: THREE.Mesh | null = null;       // translucent fill (rect/polygon)

    // Bound listeners — attached on activate(), removed on deactivate().
    private _onPointerDown: ((e: PointerEvent) => void) | null = null;
    private _onPointerMove: ((e: PointerEvent) => void) | null = null;
    private _onDblClick:    ((e: MouseEvent)   => void) | null = null;
    private _onKeyDown:     ((e: KeyboardEvent) => void) | null = null;

    // Reusable raycaster (a fresh THREE.Raycaster — independent of OBC's
    // filtered selectable-only one, so it always hits the slab mesh).
    private readonly _raycaster = new THREE.Raycaster();

    constructor(
        _components: OBC.Components,
        private world: OBC.World,
    ) {}

    get isActive(): boolean { return this._active; }

    // ─── Lifecycle ────────────────────────────────────────────────────────────

    /**
     * Activate the tool. Mode comes from the `mode` argument if supplied,
     * else from `window._pryzmActiveOpeningMode` (set by ToolManager before
     * dispatching the picker callback).
     */
    async activate(mode?: OpeningDrawingMode): Promise<void> {
        // Resolve mode (arg → window flag → 'polyline' default).
        const winMode = window._pryzmActiveOpeningMode as OpeningDrawingMode | undefined;
        this._mode = mode ?? winMode ?? 'polyline';

        // Resolve host slab (live selection, then store id, then window fallback).
        const resolved = this._resolveHostSlab();
        if (!resolved) {
            console.warn('[OpeningTool] activate aborted — no host slab. Select a slab first.');
            return;
        }
        this._selectedSlabId = resolved.id;
        this._slabMesh       = resolved.mesh;

        this._active   = true;
        this._points   = [];
        this._cursorPt = null;

        this._createPreview();
        this._createHUD();
        this._updateHUD();
        this._attachListeners();

        // Disable orbit controls so click-drag doesn't move the camera.
        if (this.world.camera.controls) {
            this.world.camera.controls.enabled = false;
        }

        console.log(`[OpeningTool] Activated — mode: ${this._mode} — host slab: ${this._selectedSlabId}`);
    }

    deactivate(): void {
        if (!this._active) return;
        this._active = false;

        this._detachListeners();
        this._clearPreview();
        this._removeHUD();

        this._selectedSlabId = null;
        this._slabMesh       = null;
        this._points         = [];
        this._cursorPt       = null;

        if (this.world.camera.controls) {
            this.world.camera.controls.enabled = true;
        }

        console.log('[OpeningTool] Deactivated');
    }

    // ─── Host slab resolution ─────────────────────────────────────────────────

    private _resolveHostSlab(): { id: string; mesh: THREE.Object3D } | null {
        // Option 1: live 3D selection — traverse up to elementType==='slab'.
        const sm = window.selectionManager;
        if (sm) {
            let host: THREE.Object3D | null = sm.selectedObject ?? null;
            while (host && !host.userData?.elementType) {
                host = host.parent ?? null;
            }
            if (host?.userData?.elementType?.toString().toLowerCase() === 'slab' && host?.userData?.id) {
                return { id: host.userData.id as string, mesh: host };
            }

            // Option 2: getSelectedId() + slabStore lookup → traverse scene by id.
            const selectedId: string | null = sm.getSelectedId?.() ?? sm.selectedId ?? null;
            if (selectedId) {
                const mesh = this._findSlabMeshById(selectedId);
                if (mesh) return { id: selectedId, mesh };
            }
        }

        // Option 3: explicit fallback captured by ToolManager at button-press time.
        const fallbackId: string | undefined = window._pryzmSelectedSlabId;
        if (fallbackId) {
            const mesh = this._findSlabMeshById(fallbackId);
            if (mesh) return { id: fallbackId, mesh };
        }

        return null;
    }

    /** Walk the scene graph for an Object3D with userData.id === id and userData.elementType==='slab'. */
    private _findSlabMeshById(id: string): THREE.Object3D | null {
        let found: THREE.Object3D | null = null;
        this.world.scene.three.traverse((obj) => {
            if (found) return;
            const ud = obj.userData;
            if (ud?.id === id && ud?.elementType?.toString().toLowerCase() === 'slab') {
                found = obj;
            }
        });
        return found;
    }

    // ─── Pointer / keyboard listeners ─────────────────────────────────────────

    private _attachListeners(): void {
        const canvas = this.world.renderer?.three.domElement;
        if (!canvas) {
            console.warn('[OpeningTool] No renderer canvas — pointer events will not bind');
            return;
        }

        this._onPointerDown = (e: PointerEvent) => {
            if (!this._active) return;
            if (e.button !== 0) return; // only left-click commits points
            this._handleClick(e);
        };
        this._onPointerMove = (e: PointerEvent) => {
            if (!this._active) return;
            this._handleMove(e);
        };
        this._onDblClick = (e: MouseEvent) => {
            if (!this._active) return;
            if (this._mode === 'polyline' && this._points.length >= 3) {
                e.preventDefault();
                this._commitPolyline();
            }
        };
        this._onKeyDown = (e: KeyboardEvent) => {
            if (!this._active) return;
            if (e.key === 'Escape') {
                e.preventDefault();
                this.deactivate();
                return;
            }
            if (this._mode === 'polyline') {
                if (e.key === 'Enter' && this._points.length >= 3) {
                    e.preventDefault();
                    this._commitPolyline();
                } else if (e.key === 'Backspace' && this._points.length > 0) {
                    e.preventDefault();
                    this._points.pop();
                    this._updatePreview();
                    this._updateHUD();
                }
            }
        };

        canvas.addEventListener('pointerdown', this._onPointerDown);
        canvas.addEventListener('pointermove', this._onPointerMove);
        canvas.addEventListener('dblclick',    this._onDblClick);
        window.addEventListener('keydown',     this._onKeyDown);
    }

    private _detachListeners(): void {
        const canvas = this.world.renderer?.three.domElement;
        if (canvas) {
            if (this._onPointerDown) canvas.removeEventListener('pointerdown', this._onPointerDown);
            if (this._onPointerMove) canvas.removeEventListener('pointermove', this._onPointerMove);
            if (this._onDblClick)    canvas.removeEventListener('dblclick',    this._onDblClick);
        }
        if (this._onKeyDown) window.removeEventListener('keydown', this._onKeyDown);
        this._onPointerDown = null;
        this._onPointerMove = null;
        this._onDblClick    = null;
        this._onKeyDown     = null;
    }

    // ─── Click / move handlers ────────────────────────────────────────────────

    private _handleClick(e: PointerEvent): void {
        const pt = this._raycastSlab(e);
        if (!pt) return;

        if (this._mode === '2point') {
            this._points.push(pt);
            this._cursorPt = pt;
            console.log(`[OpeningTool] 2-point corner ${this._points.length} world=(${pt.x.toFixed(3)}, ${pt.z.toFixed(3)})`);
            if (this._points.length >= 2) {
                this._commit2Point();
            } else {
                this._updatePreview();
                this._updateHUD();
            }
        } else {
            this._points.push(pt);
            this._cursorPt = pt;
            console.log(`[OpeningTool] polyline vertex ${this._points.length} world=(${pt.x.toFixed(3)}, ${pt.z.toFixed(3)})`);
            this._updatePreview();
            this._updateHUD();
        }
    }

    private _handleMove(e: PointerEvent): void {
        if (this._points.length === 0 && this._mode !== '2point') return;
        const pt = this._raycastSlab(e);
        if (!pt) return;
        this._cursorPt = pt;
        this._updatePreview();
    }

    private _raycastSlab(e: PointerEvent): THREE.Vector3 | null {
        if (!this._slabMesh) return null;
        const canvas = this.world.renderer!.three.domElement;
        const rect = canvas.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        this._raycaster.setFromCamera(new THREE.Vector2(x, y), this.world.camera.three as any);
        const hits = this._raycaster.intersectObject(this._slabMesh, true);
        return hits.length > 0 ? hits[0].point.clone() : null;
    }

    // ─── Preview ──────────────────────────────────────────────────────────────

    private _createPreview(): void {
        this._clearPreview();

        // Edge line — closed when ≥3 pts (first vertex repeated at end).
        // O2-FIX: THREE.Line (not LineLoop) for WebGPU TSL compatibility.
        const lineGeo = new THREE.BufferGeometry();
        const lineMat = new THREE.LineBasicMaterial({
            color:      OPEN_EDGE_COLOR,
            depthTest:  false,
            transparent:true,
            opacity:    0.95,
        });
        this._previewLine = new THREE.Line(lineGeo, lineMat);
        this._previewLine.userData.isPreview = true;
        this._previewLine.renderOrder = 1000;
        this._previewLine.frustumCulled = false;
        this.world.scene.three.add(this._previewLine);

        // Translucent fill mesh — only meaningful with ≥3 pts (or 2-pt rectangle).
        const fillGeo = new THREE.BufferGeometry();
        const fillMat = new THREE.MeshBasicMaterial({
            color:       OPEN_FILL_COLOR,
            transparent: true,
            opacity:     0.18,
            depthTest:   false,
            side:        THREE.DoubleSide,
        });
        this._previewFill = new THREE.Mesh(fillGeo, fillMat);
        this._previewFill.userData.isPreview = true;
        this._previewFill.renderOrder = 999;
        this._previewFill.frustumCulled = false;
        this.world.scene.three.add(this._previewFill);
    }

    private _clearPreview(): void {
        if (this._previewLine) {
            this.world.scene.three.remove(this._previewLine);
            this._previewLine.geometry.dispose();
            (this._previewLine.material as THREE.Material).dispose();
            this._previewLine = null;
        }
        if (this._previewFill) {
            this.world.scene.three.remove(this._previewFill);
            this._previewFill.geometry.dispose();
            (this._previewFill.material as THREE.Material).dispose();
            this._previewFill = null;
        }
    }

    private _updatePreview(): void {
        if (!this._previewLine || !this._previewFill) return;

        // Build the polygon vertex list (world-space, lifted +0.01 Y above slab top
        // to avoid z-fighting with the slab face).
        const verts: THREE.Vector3[] = [];

        if (this._mode === '2point') {
            // Rectangle from corner A to current cursor (or corner B if placed).
            const a = this._points[0];
            const b = this._points[1] ?? this._cursorPt;
            if (!a || !b) {
                this._setLineGeometry([]);
                this._setFillGeometry([]);
                return;
            }
            const y = a.y + 0.01;
            verts.push(
                new THREE.Vector3(a.x, y, a.z),
                new THREE.Vector3(b.x, y, a.z),
                new THREE.Vector3(b.x, y, b.z),
                new THREE.Vector3(a.x, y, b.z),
            );
        } else {
            // Polyline — use placed points + live cursor as the in-progress last vertex.
            const live: THREE.Vector3[] = [...this._points];
            if (this._cursorPt && this._points.length >= 1) {
                live.push(this._cursorPt);
            }
            for (const p of live) {
                verts.push(new THREE.Vector3(p.x, p.y + 0.01, p.z));
            }
        }

        this._setLineGeometry(verts);
        this._setFillGeometry(verts);
    }

    private _setLineGeometry(verts: THREE.Vector3[]): void {
        if (!this._previewLine) return;
        this._previewLine.geometry.dispose();
        if (verts.length === 0) {
            this._previewLine.geometry = new THREE.BufferGeometry();
            return;
        }
        const closed = verts.length >= 3 ? [...verts, verts[0]] : verts;
        const arr = new Float32Array(closed.length * 3);
        for (let i = 0; i < closed.length; i++) {
            arr[i * 3]     = closed[i].x;
            arr[i * 3 + 1] = closed[i].y;
            arr[i * 3 + 2] = closed[i].z;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
        this._previewLine.geometry = geo;
    }

    private _setFillGeometry(verts: THREE.Vector3[]): void {
        if (!this._previewFill) return;
        this._previewFill.geometry.dispose();
        if (verts.length < 3) {
            this._previewFill.geometry = new THREE.BufferGeometry();
            return;
        }
        // Triangulate as a fan from vertex 0 — works for convex polygons. The
        // 2-point rectangle is convex; polyline previews are typically convex
        // too. A non-convex preview will still show edges correctly even if
        // the fill renders incorrectly — the actual hole uses Earcut.
        const positions: number[] = [];
        for (let i = 1; i < verts.length - 1; i++) {
            positions.push(verts[0].x, verts[0].y, verts[0].z);
            positions.push(verts[i].x, verts[i].y, verts[i].z);
            positions.push(verts[i + 1].x, verts[i + 1].y, verts[i + 1].z);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.computeVertexNormals();
        this._previewFill.geometry = geo;
    }

    // ─── Commit ───────────────────────────────────────────────────────────────

    private _commit2Point(): void {
        if (this._points.length < 2 || !this._selectedSlabId) return;
        const a = this._points[0];
        const b = this._points[1];

        // O3-FIX: profile is in WORLD XZ — same space SlabFragmentBuilder uses.
        const profile = [
            { x: a.x, y: a.z },
            { x: b.x, y: a.z },
            { x: b.x, y: b.z },
            { x: a.x, y: b.z },
        ];
        this._commit(profile);
    }

    private _commitPolyline(): void {
        if (this._points.length < 3 || !this._selectedSlabId) return;
        // O3-FIX: world XZ.
        const profile = this._points.map(p => ({ x: p.x, y: p.z }));
        this._commit(profile);
    }

    private _commit(profile: { x: number; y: number }[]): void {
        if (!this._selectedSlabId) return;
        const slab = window.slabStore?.getById?.(this._selectedSlabId); // TODO(TASK-08)
        if (!slab) {
            console.error('[OpeningTool] commit aborted — slab not found in store:', this._selectedSlabId);
            return;
        }
        const cm = window.commandManager; // TODO(TASK-06)
        if (!cm) {
            console.error('[OpeningTool] commit aborted — commandManager not on window');
            return;
        }

        const id = (typeof crypto !== 'undefined' && crypto.randomUUID)
            ? crypto.randomUUID()
            : `opening-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

        const result = cm.execute(new CreateOpeningCommand({
            id,
            hostId:     this._selectedSlabId,
            levelId:    slab.levelId,
            profile,
            baseOffset: 0,
        }));

        if (result?.success === false) {
            console.error('[OpeningTool] CreateOpeningCommand failed:',
                result.info?.join(', ') ?? result.error ?? 'unknown');
        } else {
            console.log(`[OpeningTool] Opening (${this._mode}) created`, id, 'on slab', this._selectedSlabId);
        }

        // Reset for next opening, keep tool armed.
        this._points   = [];
        this._cursorPt = null;
        this._updatePreview();
        this._updateHUD();
    }

    // ─── HUD (mirrors OpeningPlanToolHandler look) ────────────────────────────

    private _createHUD(): void {
        this._removeHUD();

        const hud = document.createElement('div');
        hud.id = HUD_ID;
        Object.assign(hud.style, {
            position:     'fixed',
            bottom:       '72px',
            left:         '50%',
            transform:    'translateX(-50%)',
            zIndex:       '8500',
            display:      'flex',
            alignItems:   'center',
            gap:          '8px',
            padding:      '5px 10px',
            background:   'rgba(22,26,34,0.94)',
            color:        '#e2e8f0',
            fontSize:     '11px',
            fontFamily:   'system-ui, sans-serif',
            fontWeight:   '500',
            borderRadius: '8px',
            border:       '1px solid rgba(255,255,255,0.10)',
            boxShadow:    '0 2px 14px rgba(0,0,0,0.45)',
            userSelect:   'none',
            pointerEvents:'all',
            whiteSpace:   'nowrap',
        } as Partial<CSSStyleDeclaration>);

        // ── Mode badge
        const badge = document.createElement('span');
        Object.assign(badge.style, {
            fontSize:'9px', fontWeight:'700', letterSpacing:'0.08em',
            textTransform:'uppercase', color:'#fca5a5',
            padding:'1px 5px', background:'rgba(220,38,38,0.2)',
            borderRadius:'3px', flexShrink:'0',
        } as Partial<CSSStyleDeclaration>);
        badge.textContent = this._mode === '2point' ? '2-POINT · 3D' : 'POLYLINE · 3D';
        hud.appendChild(badge);

        const sep = () => {
            const s = document.createElement('span');
            Object.assign(s.style, {
                width:'1px', height:'14px', background:'rgba(255,255,255,0.15)', flexShrink:'0',
            } as Partial<CSSStyleDeclaration>);
            return s;
        };
        hud.appendChild(sep());

        // ── Status label
        const label = document.createElement('span');
        label.id = HUD_LABEL_ID;
        hud.appendChild(label);

        // ── Polyline buttons
        if (this._mode === 'polyline') {
            hud.appendChild(sep());

            const undoBtn = document.createElement('button');
            undoBtn.id = HUD_UNDO_ID;
            undoBtn.type = 'button';
            undoBtn.textContent = '↩ Undo';
            Object.assign(undoBtn.style, {
                background:'transparent', border:'1px solid rgba(255,255,255,0.15)',
                color:'rgba(226,232,240,0.8)', fontSize:'11px',
                fontFamily:'system-ui, sans-serif', fontWeight:'500',
                cursor:'pointer', padding:'3px 8px', borderRadius:'5px',
                transition:'opacity 0.12s, background 0.12s', flexShrink:'0',
            } as Partial<CSSStyleDeclaration>);
            undoBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this._points.length > 0) {
                    this._points.pop();
                    this._updatePreview();
                    this._updateHUD();
                }
            });
            hud.appendChild(undoBtn);

            const createBtn = document.createElement('button');
            createBtn.id = HUD_CREATE_ID;
            createBtn.type = 'button';
            createBtn.textContent = '✓  Create Opening';
            Object.assign(createBtn.style, {
                background:'#dc2626', border:'none', color:'#fff',
                fontSize:'11px', fontFamily:'system-ui, sans-serif',
                fontWeight:'700', cursor:'pointer',
                padding:'4px 11px', borderRadius:'5px',
                transition:'opacity 0.12s, background 0.12s', flexShrink:'0',
                letterSpacing:'0.02em',
            } as Partial<CSSStyleDeclaration>);
            createBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this._points.length >= 3) this._commitPolyline();
            });
            hud.appendChild(createBtn);
        }

        hud.appendChild(sep());

        // ── Exit ✕ button
        const exitBtn = document.createElement('button');
        exitBtn.id = HUD_EXIT_ID;
        exitBtn.type = 'button';
        exitBtn.textContent = '✕';
        exitBtn.title = 'Exit (Esc)';
        Object.assign(exitBtn.style, {
            background:'transparent', border:'1px solid rgba(255,255,255,0.15)',
            color:'rgba(226,232,240,0.8)', fontSize:'13px',
            fontFamily:'system-ui, sans-serif', fontWeight:'700',
            cursor:'pointer', padding:'2px 7px', borderRadius:'5px',
            flexShrink:'0',
        } as Partial<CSSStyleDeclaration>);
        exitBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.deactivate();
        });
        hud.appendChild(exitBtn);

        document.body.appendChild(hud);
    }

    private _updateHUD(): void {
        const hud = document.getElementById(HUD_ID);
        if (!hud) return;
        const n         = this._points.length;
        const label     = hud.querySelector(`#${HUD_LABEL_ID}`) as HTMLElement | null;
        const createBtn = hud.querySelector(`#${HUD_CREATE_ID}`) as HTMLButtonElement | null;
        const undoBtn   = hud.querySelector(`#${HUD_UNDO_ID}`)   as HTMLButtonElement | null;

        if (label) {
            if (this._mode === '2point') {
                label.textContent = n === 0 ? 'Click first corner on the slab'
                                            : 'Click second corner to place';
            } else {
                if (n === 0)      label.textContent = 'Click on the slab to place first vertex';
                else if (n < 3)   label.textContent = `${n} pt${n !== 1 ? 's' : ''} — ${3 - n} more to enable`;
                else              label.textContent = `${n} pts — Enter or click ✓ to create`;
            }
        }
        if (createBtn) {
            const ready = n >= 3;
            createBtn.disabled         = !ready;
            createBtn.style.opacity    = ready ? '1' : '0.32';
            createBtn.style.cursor     = ready ? 'pointer' : 'not-allowed';
            createBtn.style.background = ready ? '#dc2626' : 'rgba(220,38,38,0.4)';
        }
        if (undoBtn) {
            const has = n > 0;
            undoBtn.disabled      = !has;
            undoBtn.style.opacity = has ? '1' : '0.32';
            undoBtn.style.cursor  = has ? 'pointer' : 'not-allowed';
        }
    }

    private _removeHUD(): void {
        document.getElementById(HUD_ID)?.remove();
    }
}
