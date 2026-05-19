import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { SlabData } from './SlabTypes';
import { snapToAxisOrDiagonal, snapToGrid } from './SlabSnapUtils';
import { lineIntersect2D, signedArea } from './SlabGeomUtils';

/**
 * SlabProfileEditor
 *
 * Interactive vertex-drag handle overlay for post-creation slab profile editing.
 * Implements the Revit-style "Edit Boundary" mode for polygon-based slabs.
 *
 * Phase 2 — vertex handles, drag, live preview, hover, double-click delete, ESC.
 * Phase 3 — midpoint handles: click to insert a new vertex, immediately draggable.
 * Phase 4 (§12) — edge hitboxes: invisible BoxGeometry meshes per edge.
 * Phase 5 (§12) — edge hover highlight: orange LINE on hovered edge.
 * Phase 6 (§12) — EdgeDragState + _applySegmentDrag: Revit-style parallel push.
 * Phase 7 (§12) — snap, cursor, pointer-event wiring, lifecycle hardening.
 *
 * See §11-SLAB-PROFILE-EDIT-CONTRACT.md and §12-SLAB-SEGMENT-DRAG-CONTRACT.md.
 *
 * Layer: Tool  (same layer as SlabTool)
 *
 * Contract compliance:
 *
 * §01 §2.1 Command-First
 *   This class NEVER calls slabStore.update() or slabBuilder.updateSlab() directly.
 *   All mutations are signalled via the onCommit() callback, which the caller
 *   (SlabTool.commitProfileEdit) translates into an UpdateSlabPolygonCommand.
 *
 * §01 R-2 Preview Geometry Purity
 *   All Three.js objects are tagged userData.isPreview = true and are disposed
 *   in deactivate(). userData.selectable = false prevents SelectionManager from
 *   picking handles or hitboxes.
 *
 * §01 R-4 Immutability
 *   snapPoly in EdgeDragState is a structuredClone of the polygon at drag-start.
 *   It is never mutated; cumulative offset is always computed from the original.
 *
 * §07 Security
 *   No window.* reads for dependencies. All dependencies are injected
 *   via the constructor. window.addEventListener is used only for keyboard events
 *   (same pattern as SlabTool) — not for reading global application state.
 *
 * §P1 Pascal Boundary
 *   No import from ./Pascal/. lineIntersect2D and signedArea are implemented
 *   in SlabGeomUtils.ts (PRYZM-idiomatic TypeScript).
 */

// ─────────────────────────────────────────────────────────────────────────────
// Constants — match Pascal PolygonEditor dimensions exactly
// ─────────────────────────────────────────────────────────────────────────────

const HANDLE_RADIUS_VERTEX   = 0.12;  // metres — blue vertex cylinders
const HANDLE_RADIUS_MIDPOINT = 0.07;  // metres — green midpoint cylinders

const HANDLE_COLOUR_NORMAL   = 0x3b82f6;  // blue  — vertex idle
const HANDLE_COLOUR_HOVERED  = 0x60a5fa;  // light blue — vertex hovered
const HANDLE_COLOUR_DRAGGING = 0x22c55e;  // green — vertex being dragged

const MIDPOINT_COLOUR_NORMAL  = 0x22c55e;  // green — midpoint idle
const MIDPOINT_COLOUR_HOVERED = 0x4ade80;  // light green — midpoint hovered
const MIDPOINT_OPACITY_NORMAL  = 0.70;
const MIDPOINT_OPACITY_HOVERED = 1.00;

const BOUNDARY_COLOUR = 0xe879f9;  // magenta — Revit-style profile edit boundary
const FILL_COLOUR     = 0xe879f9;
const FILL_OPACITY    = 0.12;

// §12 §3 — Edge hover highlight (orange-400, distinct from vertex blue and midpoint green)
const EDGE_HIGHLIGHT_COLOUR = 0xfb923c;
const EDGE_HIGHLIGHT_HEIGHT = 0.04;  // metres above slab surface

// §12 §2.5 — Segment drag snap grid (50 mm)
const SEGMENT_SNAP_GRID_M = 0.05;

// §12 §3.2 — Hitbox half-depth perpendicular to the edge (15 cm each side)
const EDGE_HIT_HALF_DEPTH = 0.15;

const DOUBLE_CLICK_THRESHOLD_MS = 300;

// ─────────────────────────────────────────────────────────────────────────────
// Internal types
// ─────────────────────────────────────────────────────────────────────────────

interface VertexDragState {
    kind:        'vertex';
    mesh:        THREE.Mesh;
    vertexIndex: number;
}

interface MidpointDragState {
    kind:             'midpoint';
    mesh:             THREE.Mesh;
    /** The vertex index of the newly inserted vertex that is being dragged. */
    newVertexIndex:   number;
}

/**
 * §12 §5.1 — EdgeDragState
 *
 * Carries the drag-start snapshot of the polygon so that cumulative offset is
 * always computed from the original clean polygon, preventing floating-point
 * drift across many small pointermove events (§12 §10 "Float drift").
 */
interface EdgeDragState {
    kind:      'edge';
    edgeIndex: number;           // index i — dragged segment is polygon[i] → polygon[j]
    /** World-XZ anchor point at the moment of pointerdown — used for delta calc. */
    anchorPt:  { x: number; y: number };
    /** Deep clone of workingPolygon at drag-start — never mutated. §01 R-4. */
    snapPoly:  { x: number; y: number }[];
}

// §12 §5.1: Extended DragState union includes EdgeDragState.
type DragState = VertexDragState | MidpointDragState | EdgeDragState;

// ─────────────────────────────────────────────────────────────────────────────
// SlabProfileEditor
// ─────────────────────────────────────────────────────────────────────────────

export class SlabProfileEditor {
    private readonly world: OBC.World;
    private readonly components: OBC.Components;
    private readonly _onCommit: (polygon: { x: number; y: number }[]) => void;
    private readonly _onCancel: () => void;

    // ── Active session state ─────────────────────────────────────────────────
    private _isActive         = false;
    private activeSlab: SlabData | null = null;
    private workingPolygon: { x: number; y: number }[] = [];
    private elevation         = 0;
    private shiftPressed      = false;

    // ── Scene references ─────────────────────────────────────────────────────
    private scene: THREE.Scene | null = null;
    // G2-T6: THREE.LineLoop is unsupported by the WebGPU renderer — use THREE.Line
    // with the first point appended at the end to recreate the closed-loop visual.
    private boundaryLine: THREE.Line | null = null;
    private fillMesh: THREE.Mesh | null = null;
    private vertexHandles:   THREE.Mesh[] = [];  // blue — one per polygon vertex
    private midpointHandles: THREE.Mesh[] = [];  // green — one per polygon edge

    // §12 Phase 2 — Edge hitboxes (invisible BoxGeometry, one per edge)
    private edgeHitboxes: THREE.Mesh[] = [];

    // §12 Phase 3 — Edge hover highlight
    private _edgeHighlightLine: THREE.Line | null = null;
    private hoveredEdgeIndex:   number | null      = null;

    // ── Interaction state ────────────────────────────────────────────────────
    private drag: DragState | null = null;
    /** Index into vertexHandles of the currently hovered handle, or null. */
    private hoveredVertexIndex:   number | null = null;
    /** Index into midpointHandles of the currently hovered midpoint, or null. */
    private hoveredMidpointIndex: number | null = null;
    private _lastPointerDownTime  = 0;

    // ── Event listener references (kept for removal in deactivate) ───────────
    private _evPointerDown: ((e: PointerEvent) => void) | null = null;
    private _evPointerMove: ((e: PointerEvent) => void) | null = null;
    private _evPointerUp:   ((e: PointerEvent) => void) | null = null;
    private _evKeyDown:     ((e: KeyboardEvent) => void) | null = null;
    private _evShiftDown:   ((e: KeyboardEvent) => void) | null = null;
    private _evShiftUp:     ((e: KeyboardEvent) => void) | null = null;

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    constructor(
        world: OBC.World,
        components: OBC.Components,
        onCommit: (polygon: { x: number; y: number }[]) => void,
        onCancel: () => void
    ) {
        this.world      = world;
        this.components = components;
        this._onCommit  = onCommit;
        this._onCancel  = onCancel;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────────────────────────────────────

    get isActive(): boolean {
        return this._isActive;
    }

    /** Returns a deep clone of the live working polygon, or null when inactive. */
    get previewPolygon(): { x: number; y: number }[] | null {
        return this._isActive ? structuredClone(this.workingPolygon) : null;
    }

    /**
     * Enter profile edit mode for the given slab.
     *
     * @param slab      Slab whose polygon will be edited (polygon.length >= 3 required).
     * @param elevation World-Y elevation at which handles are placed (metres).
     */
    activate(slab: SlabData, elevation: number): void {
        if (this._isActive) this.deactivate();  // idempotent

        if (!slab.polygon || slab.polygon.length < 3) {
            console.warn(
                '[SlabProfileEditor] activate() rejected — slab has no valid polygon.',
                slab.id
            );
            return;
        }

        this.activeSlab     = slab;
        this.elevation      = elevation;
        // §01 R-4: deep-clone — workingPolygon must not alias store data.
        this.workingPolygon = structuredClone(slab.polygon);
        this.scene          = this.world.scene.three as THREE.Scene;

        this._buildBoundaryLine();
        this._buildFillMesh();
        this._buildVertexHandles();
        this._buildMidpointHandles();

        // §12 Phase 2: build invisible edge hitboxes after midpoint handles.
        this._buildEdgeHitboxes();

        // §12 Phase 3: create the orange highlight line (initially hidden).
        this._buildEdgeHighlightLine();

        this._attachListeners();

        this._isActive = true;

        // M15 §SLAB-SYSTEM-AUDIT-2026: Gate the devtools pin behind import.meta.env.DEV
        // so the global is never set in a production bundle and cannot be abused.
        if (import.meta.env.DEV) {
            window.__slabProfileEditor = this;
        }

        console.log(
            `[SlabProfileEditor] Activated — slab: ${slab.id}, ` +
            `vertices: ${this.workingPolygon.length}, elevation: ${elevation.toFixed(3)}m`
        );
    }

    /**
     * Dispose all preview geometry and exit edit mode.
     * Safe to call multiple times (idempotent).
     */
    deactivate(): void {
        this._detachListeners();
        this._disposeScene();

        this.activeSlab           = null;
        this.workingPolygon       = [];
        this.elevation            = 0;
        this.drag                 = null;
        this.hoveredVertexIndex   = null;
        this.hoveredMidpointIndex = null;
        this.hoveredEdgeIndex     = null;  // §12 Phase 3
        this.shiftPressed         = false;
        this._lastPointerDownTime = 0;
        this._isActive            = false;

        console.log('[SlabProfileEditor] Deactivated — all preview geometry disposed.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GEOMETRY — BUILD
    // ─────────────────────────────────────────────────────────────────────────

    private _buildBoundaryLine(): void {
        const pts = this.workingPolygon.map(
            p => new THREE.Vector3(p.x, this.elevation + 0.02, p.y)
        );
        // G2-T6: THREE.LineLoop is unsupported by the WebGPU renderer (fires a console
        // error on every rAF frame).  Use THREE.Line instead — which WebGPU supports —
        // and append a copy of the first point at the end to close the polygon loop
        // visually, producing the same appearance as THREE.LineLoop.
        if (pts.length > 0) pts.push(pts[0].clone());
        const geo  = new THREE.BufferGeometry().setFromPoints(pts);
        const mat  = new THREE.LineBasicMaterial({
            color:      BOUNDARY_COLOUR,
            depthTest:  false,
            depthWrite: false,
            linewidth:  2,
        });
        const line = new THREE.Line(geo, mat);
        line.renderOrder = 10;
        line.userData    = { isPreview: true, role: 'profileBoundary' };
        this.scene!.add(line);
        this.boundaryLine = line;
    }

    private _buildFillMesh(): void {
        const mesh = this._makeFillMesh(this.workingPolygon);
        if (mesh) {
            this.scene!.add(mesh);
            this.fillMesh = mesh;
        }
    }

    private _buildVertexHandles(): void {
        const thickness    = this.activeSlab?.thickness ?? 0.2;
        const handleHeight = thickness + 0.05;
        const halfH        = handleHeight / 2;
        const yCenter      = this.elevation + halfH;

        for (let i = 0; i < this.workingPolygon.length; i++) {
            const pt  = this.workingPolygon[i];
            const geo = new THREE.CylinderGeometry(
                HANDLE_RADIUS_VERTEX, HANDLE_RADIUS_VERTEX, handleHeight, 16
            );
            const mat = new THREE.MeshStandardMaterial({
                color:       HANDLE_COLOUR_NORMAL,
                roughness:   0.4,
                metalness:   0.0,
                depthTest:   false,
                depthWrite:  false,
                transparent: true,
                opacity:     0.92,
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(pt.x, yCenter, pt.y);
            mesh.renderOrder = 20;
            mesh.userData    = {
                isPreview:   true,
                role:        'vertexHandle',
                vertexIndex: i,
                selectable:  false,
            };
            this.scene!.add(mesh);
            this.vertexHandles.push(mesh);
        }
    }

    /**
     * Build midpoint handle cylinders — one per polygon edge.
     * Edge i connects vertex[i] → vertex[(i+1) % n].
     * Each handle carries userData.afterVertexIndex = i (the vertex before the midpoint).
     */
    private _buildMidpointHandles(): void {
        const thickness    = this.activeSlab?.thickness ?? 0.2;
        const handleHeight = thickness + 0.05;
        const halfH        = handleHeight / 2;
        const yCenter      = this.elevation + halfH;
        const n            = this.workingPolygon.length;

        for (let i = 0; i < n; i++) {
            const a   = this.workingPolygon[i];
            const b   = this.workingPolygon[(i + 1) % n];
            const mx  = (a.x + b.x) / 2;
            const mz  = (a.y + b.y) / 2;

            const geo = new THREE.CylinderGeometry(
                HANDLE_RADIUS_MIDPOINT, HANDLE_RADIUS_MIDPOINT, handleHeight, 16
            );
            const mat = new THREE.MeshStandardMaterial({
                color:       MIDPOINT_COLOUR_NORMAL,
                roughness:   0.5,
                metalness:   0.0,
                depthTest:   false,
                depthWrite:  false,
                transparent: true,
                opacity:     MIDPOINT_OPACITY_NORMAL,
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(mx, yCenter, mz);
            mesh.renderOrder = 15;
            mesh.userData    = {
                isPreview:        true,
                role:             'midpointHandle',
                afterVertexIndex: i,
                selectable:       false,
            };
            this.scene!.add(mesh);
            this.midpointHandles.push(mesh);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // §12 Phase 2 — EDGE HITBOXES
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Create one invisible BoxGeometry mesh per polygon edge.
     *
     * Each box is sized to exactly span the edge length × slab thickness × 15 cm
     * hit-radius, positioned at the edge midpoint, and rotated to align with the
     * edge direction. The material is fully transparent (opacity: 0) so it causes
     * no visual artefact, but the mesh is raycaster-detectable.
     *
     * §12 §8 implementation sketch.
     */
    private _buildEdgeHitboxes(): void {
        const n      = this.workingPolygon.length;
        const halfH  = ((this.activeSlab?.thickness ?? 0.2) + 0.1) / 2;

        for (let i = 0; i < n; i++) {
            const a   = this.workingPolygon[i];
            const b   = this.workingPolygon[(i + 1) % n];
            const dx  = b.x - a.x;
            const dz  = b.y - a.y;   // polygon y = world Z
            const len = Math.hypot(dx, dz);
            if (len < 1e-6) continue;  // skip degenerate zero-length edges

            const geom = new THREE.BoxGeometry(len, halfH * 2, EDGE_HIT_HALF_DEPTH * 2);
            const mat  = new THREE.MeshBasicMaterial({
                transparent: true,
                opacity:     0,
                side:        THREE.DoubleSide,
            });
            const mesh = new THREE.Mesh(geom, mat);
            mesh.userData = {
                isPreview:  true,
                selectable: false,
                role:       'edgeHitbox',
                edgeIndex:  i,
            };

            // Position at edge midpoint.
            mesh.position.set(
                (a.x + b.x) / 2,
                this.elevation + halfH,
                (a.y + b.y) / 2,
            );

            // Rotate so the box's local X axis aligns with the edge direction.
            // atan2(dz, dx) gives the edge angle in the XZ plane; negate for Y rotation.
            const angle = Math.atan2(dz, dx);
            mesh.rotation.y = -angle;

            this.scene!.add(mesh);
            this.edgeHitboxes.push(mesh);
        }
    }

    /**
     * Remove and dispose all edge hitboxes.
     * Called before a full rebuild and from _disposeScene().
     */
    private _disposeEdgeHitboxes(): void {
        for (const h of this.edgeHitboxes) {
            h.geometry.dispose();
            (h.material as THREE.Material).dispose();
            this.scene?.remove(h);
        }
        this.edgeHitboxes = [];
    }

    /**
     * Reposition each existing edge hitbox to match the current workingPolygon.
     * Called from _rebuildPreview() on every drag frame — avoids a full
     * dispose+rebuild for every pointermove event.
     */
    private _syncEdgeHitboxPositions(): void {
        const n     = this.workingPolygon.length;
        const halfH = ((this.activeSlab?.thickness ?? 0.2) + 0.1) / 2;
        let hi      = 0;   // hitbox array index (may be < n if any were skipped)

        for (let i = 0; i < n; i++) {
            const a   = this.workingPolygon[i];
            const b   = this.workingPolygon[(i + 1) % n];
            const dx  = b.x - a.x;
            const dz  = b.y - a.y;
            const len = Math.hypot(dx, dz);
            if (len < 1e-6) continue;

            const hb = this.edgeHitboxes[hi];
            if (!hb) break;

            hb.position.set(
                (a.x + b.x) / 2,
                this.elevation + halfH,
                (a.y + b.y) / 2,
            );
            const angle  = Math.atan2(dz, dx);
            hb.rotation.y = -angle;
            hb.userData.edgeIndex = i;   // keep index in sync (vertex count unchanged during edge drag)
            hi++;
        }
    }

    /**
     * Raycast against the edge hitboxes.
     * Returns { mesh, edgeIndex } for the nearest hit, or null.
     *
     * §12 §3.3 hit priority: called only after vertex and midpoint tests miss.
     */
    private _hitTestEdgeHitboxes(
        e: PointerEvent
    ): { mesh: THREE.Mesh; edgeIndex: number } | null {
        if (this.edgeHitboxes.length === 0) return null;
        const raycaster = this._buildRaycaster(e);
        const hits      = raycaster.intersectObjects(this.edgeHitboxes, false);
        if (hits.length === 0) return null;
        const mesh = hits[0].object as THREE.Mesh;
        return { mesh, edgeIndex: mesh.userData.edgeIndex as number };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // §12 Phase 3 — EDGE HOVER HIGHLIGHT
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Create the reusable orange highlight line.
     * Initially invisible; repositioned by _setEdgeHighlight().
     */
    private _buildEdgeHighlightLine(): void {
        // 2-point geometry — positions updated in _setEdgeHighlight().
        const pts  = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0)];
        const geo  = new THREE.BufferGeometry().setFromPoints(pts);
        const mat  = new THREE.LineBasicMaterial({
            color:      EDGE_HIGHLIGHT_COLOUR,
            depthTest:  false,
            depthWrite: false,
            linewidth:  3,
        });
        const line        = new THREE.Line(geo, mat);
        line.renderOrder  = 12;  // above boundary (10) and fill (9)
        line.visible      = false;
        line.userData     = { isPreview: true, selectable: false, role: 'edgeHighlight' };
        this.scene!.add(line);
        this._edgeHighlightLine = line;
    }

    /**
     * Show/reposition the orange highlight line over edge `index`, or hide it.
     *
     * Also updates the renderer cursor to give a directional resize hint:
     *   - Nearly horizontal edge → 'ns-resize'
     *   - Nearly vertical edge   → 'ew-resize'
     *
     * @param index Edge index (i), or null to hide.
     */
    private _setEdgeHighlight(index: number | null): void {
        const line = this._edgeHighlightLine;
        if (!line) return;

        const dom = this.world.renderer?.three.domElement;

        if (index === null) {
            line.visible = false;
            if (dom) dom.style.cursor = '';
            this.hoveredEdgeIndex = null;
            return;
        }

        const n  = this.workingPolygon.length;
        const a  = this.workingPolygon[index];
        const b  = this.workingPolygon[(index + 1) % n];
        const yLine = this.elevation + EDGE_HIGHLIGHT_HEIGHT;

        // Reuse the existing geometry by updating its position attribute.
        const positions = new Float32Array([
            a.x, yLine, a.y,
            b.x, yLine, b.y,
        ]);
        line.geometry.dispose();
        line.geometry = new THREE.BufferGeometry();
        line.geometry.setAttribute(
            'position',
            new THREE.BufferAttribute(positions, 3)
        );
        line.visible = true;
        this.hoveredEdgeIndex = index;

        // Cursor direction hint (§12 Phase 5).
        if (dom) {
            const dx  = b.x - a.x;
            const dz  = b.y - a.y;
            const angle      = Math.atan2(dz, dx);
            const absCos     = Math.abs(Math.cos(angle));
            dom.style.cursor = absCos > 0.7 ? 'ns-resize' : 'ew-resize';
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GEOMETRY — HELPERS
    // ─────────────────────────────────────────────────────────────────────────

    private _makeFillMesh(poly: { x: number; y: number }[]): THREE.Mesh | null {
        if (poly.length < 3) return null;

        const shape = new THREE.Shape(poly.map(p => new THREE.Vector2(p.x, p.y)));
        const geo   = new THREE.ShapeGeometry(shape);
        const mat   = new THREE.MeshBasicMaterial({
            color:       FILL_COLOUR,
            transparent: true,
            opacity:     FILL_OPACITY,
            side:        THREE.DoubleSide,
            depthTest:   false,
            depthWrite:  false,
        });
        const mesh  = new THREE.Mesh(geo, mat);
        mesh.rotation.x  = -Math.PI / 2;
        mesh.position.set(0, this.elevation + 0.01, 0);
        mesh.renderOrder = 9;
        mesh.userData    = { isPreview: true, role: 'profileFill' };
        return mesh;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GEOMETRY — LIVE PREVIEW UPDATES
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Rebuild all preview objects after workingPolygon changes during a drag.
     * Also syncs edge hitbox positions (§12 Phase 2).
     */
    private _rebuildPreview(): void {
        // ── Boundary line ──────────────────────────────────────────────────
        if (this.boundaryLine) {
            const pts = this.workingPolygon.map(
                p => new THREE.Vector3(p.x, this.elevation + 0.02, p.y)
            );
            // G2-T6: append closing point to match _buildBoundaryLine's THREE.Line loop.
            if (pts.length > 0) pts.push(pts[0].clone());
            this.boundaryLine.geometry.dispose();
            this.boundaryLine.geometry = new THREE.BufferGeometry().setFromPoints(pts);
        }

        // ── Fill mesh ──────────────────────────────────────────────────────
        if (this.fillMesh) {
            this.fillMesh.geometry.dispose();
            (this.fillMesh.material as THREE.Material).dispose();
            this.scene!.remove(this.fillMesh);
            this.fillMesh = null;
        }
        const newFill = this._makeFillMesh(this.workingPolygon);
        if (newFill) {
            this.scene!.add(newFill);
            this.fillMesh = newFill;
        }

        // ── Dragged vertex/midpoint handle — translate in-place ─────────────
        if (this.drag && this.drag.kind !== 'edge') {
            const idx  = this.drag.kind === 'vertex'
                ? this.drag.vertexIndex
                : this.drag.newVertexIndex;
            const pt   = this.workingPolygon[idx];
            const halfH = ((this.activeSlab?.thickness ?? 0.2) + 0.05) / 2;
            this.drag.mesh.position.set(pt.x, this.elevation + halfH, pt.y);
        }

        // ── Edge drag: move the two endpoint vertex handles in-place ─────────
        if (this.drag?.kind === 'edge') {
            const n    = this.workingPolygon.length;
            const i    = this.drag.edgeIndex;
            const j    = (i + 1) % n;
            const halfH = ((this.activeSlab?.thickness ?? 0.2) + 0.05) / 2;
            const yH   = this.elevation + halfH;
            if (this.vertexHandles[i]) {
                const pi = this.workingPolygon[i];
                this.vertexHandles[i].position.set(pi.x, yH, pi.y);
            }
            if (this.vertexHandles[j]) {
                const pj = this.workingPolygon[j];
                this.vertexHandles[j].position.set(pj.x, yH, pj.y);
            }
        }

        // ── §12 Phase 2: Sync edge hitbox positions ─────────────────────────
        this._syncEdgeHitboxPositions();
    }

    /**
     * Fully rebuild vertex handles AND midpoint handles AND edge hitboxes.
     * Called after the vertex count changes (insert or delete).
     */
    private _rebuildAllHandles(): void {
        this._disposeVertexHandles();
        this._disposeMidpointHandles();
        this._disposeEdgeHitboxes();   // §12 Phase 2
        this._buildVertexHandles();
        this._buildMidpointHandles();
        this._buildEdgeHitboxes();     // §12 Phase 2
    }

    /** Show/hide all midpoint handles as a group. */
    private _setMidpointHandlesVisible(visible: boolean): void {
        for (const h of this.midpointHandles) {
            h.visible = visible;
        }
    }

    /**
     * After a drag ends, recompute and reposition all midpoint handles in-place.
     */
    private _syncMidpointHandlePositions(): void {
        const n    = this.workingPolygon.length;
        const halfH = ((this.activeSlab?.thickness ?? 0.2) + 0.05) / 2;
        const y     = this.elevation + halfH;

        for (let i = 0; i < this.midpointHandles.length && i < n; i++) {
            const a  = this.workingPolygon[i];
            const b  = this.workingPolygon[(i + 1) % n];
            this.midpointHandles[i].position.set((a.x + b.x) / 2, y, (a.y + b.y) / 2);
            this.midpointHandles[i].userData.afterVertexIndex = i;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // §12 Phase 4 — SEGMENT DRAG ALGORITHM (_applySegmentDrag)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Revit-style parallel segment push.
     *
     * Moves the dragged edge (polygon[edgeIndex] → polygon[j]) perpendicular to
     * itself by `offset` metres. The two adjacent edges are extended/contracted to
     * meet the new edge position; all other vertices are unchanged.
     *
     * Uses a snapshot polygon (`snapPoly`) so the cumulative offset is computed
     * from the original geometry on every frame — no float drift. (§12 §10)
     *
     * §12 §7 full implementation sketch.
     */
    private _applySegmentDrag(
        edgeIndex: number,
        anchorPt:  { x: number; y: number },
        currentPt: { x: number; y: number },
        snapPoly:  { x: number; y: number }[],
    ): void {
        const n  = snapPoly.length;
        const i  = edgeIndex;
        const j  = (i + 1) % n;
        const pi = snapPoly[i];
        const pj = snapPoly[j];

        // 1. Edge direction + left-hand normal (CCW 90°).
        const edgeVec = { x: pj.x - pi.x, y: pj.y - pi.y };
        const edgeLen = Math.hypot(edgeVec.x, edgeVec.y);
        if (edgeLen < 1e-9) return;
        const dir = { x: edgeVec.x / edgeLen, y: edgeVec.y / edgeLen };
        const nor = { x: -dir.y, y: dir.x };  // left-hand normal

        // 2. Raw offset = projection of (currentPt - anchorPt) onto the normal.
        const delta  = { x: currentPt.x - anchorPt.x, y: currentPt.y - anchorPt.y };
        let offset   = delta.x * nor.x + delta.y * nor.y;

        // 3. §12 §2.5 Grid snap (bypass when Shift held).
        if (!this.shiftPressed) {
            offset = snapToGrid(offset, SEGMENT_SNAP_GRID_M);
        }

        // 4. New segment line anchor — a point on the translated edge.
        const L_anchor = {
            x: pi.x + offset * nor.x,
            y: pi.y + offset * nor.y,
        };

        // 5. New vertex i — intersect extended adjacent-edge-A with new line L'.
        //    Adjacent edge A: polygon[prevIdx] → polygon[i]  (direction = pi - pp)
        const prevIdx = (i - 1 + n) % n;
        const pp      = snapPoly[prevIdx];
        const d_A     = { x: pi.x - pp.x, y: pi.y - pp.y };
        const new_i   = lineIntersect2D(pp, d_A, L_anchor, dir)
                        ?? { x: pi.x + offset * nor.x, y: pi.y + offset * nor.y };

        // 6. New vertex j — intersect extended adjacent-edge-B with new line L'.
        //    Adjacent edge B: polygon[j] → polygon[nextIdx]  (direction = pn - pj)
        const nextIdx = (j + 1) % n;
        const pn      = snapPoly[nextIdx];
        const d_B     = { x: pn.x - pj.x, y: pn.y - pj.y };
        const new_j   = lineIntersect2D(pj, d_B, L_anchor, dir)
                        ?? { x: pj.x + offset * nor.x, y: pj.y + offset * nor.y };

        // 7. Area guard — reject if resulting polygon would be degenerate (< 0.01 m²).
        const testPoly = structuredClone(this.workingPolygon) as { x: number; y: number }[];
        testPoly[i]    = new_i;
        testPoly[j]    = new_j;
        if (Math.abs(signedArea(testPoly)) < 0.01) return;

        // 8. Apply — write the two new vertices and rebuild preview.
        this.workingPolygon[i] = new_i;
        this.workingPolygon[j] = new_j;
        this._rebuildPreview();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // RAYCASTING
    // ─────────────────────────────────────────────────────────────────────────

    private _ndcFromPointerEvent(e: PointerEvent): THREE.Vector2 {
        const dom  = this.world.renderer!.three.domElement;
        const rect = dom.getBoundingClientRect();
        return new THREE.Vector2(
            ((e.clientX - rect.left) / rect.width)  *  2 - 1,
            -((e.clientY - rect.top)  / rect.height) *  2 + 1
        );
    }

    private _buildRaycaster(e: PointerEvent): THREE.Raycaster {
        const ndc           = this._ndcFromPointerEvent(e);
        const raycasterComp = this.components.get(OBC.Raycasters).get(this.world);
        const raycaster     = (raycasterComp as any).three as THREE.Raycaster;
        raycaster.setFromCamera(ndc, this.world.camera.three);
        return raycaster;
    }

    private _hitTestVertexHandles(
        e: PointerEvent
    ): { mesh: THREE.Mesh; vertexIndex: number } | null {
        if (this.vertexHandles.length === 0) return null;
        const raycaster = this._buildRaycaster(e);
        const hits      = raycaster.intersectObjects(this.vertexHandles, false);
        if (hits.length === 0) return null;
        const mesh = hits[0].object as THREE.Mesh;
        return { mesh, vertexIndex: mesh.userData.vertexIndex as number };
    }

    private _hitTestMidpointHandles(
        e: PointerEvent
    ): { mesh: THREE.Mesh; afterVertexIndex: number } | null {
        if (this.midpointHandles.length === 0) return null;
        const raycaster = this._buildRaycaster(e);
        const visible   = this.midpointHandles.filter(h => h.visible);
        if (visible.length === 0) return null;
        const hits = raycaster.intersectObjects(visible, false);
        if (hits.length === 0) return null;
        const mesh = hits[0].object as THREE.Mesh;
        return { mesh, afterVertexIndex: mesh.userData.afterVertexIndex as number };
    }

    /**
     * Intersect the camera ray with the horizontal slab plane at `this.elevation`.
     * Returns { x, y } in polygon convention (y = world Z).
     */
    private _raycastSlabPlane(e: PointerEvent): { x: number; y: number } | null {
        const raycaster = this._buildRaycaster(e);
        const plane     = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.elevation);
        const target    = new THREE.Vector3();
        const hit       = raycaster.ray.intersectPlane(plane, target);
        if (!hit) return null;
        return { x: target.x, y: target.z };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // VERTEX INSERTION (midpoint handle click)
    // ─────────────────────────────────────────────────────────────────────────

    private _insertVertexAfter(
        afterIdx:  number,
        position:  { x: number; y: number }
    ): number {
        const newIdx = afterIdx + 1;
        this.workingPolygon.splice(newIdx, 0, { ...position });
        return newIdx;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // VERTEX DELETION (double-click vertex handle)
    // ─────────────────────────────────────────────────────────────────────────

    private _deleteVertex(index: number): void {
        if (this.workingPolygon.length <= 3) {
            console.warn('[SlabProfileEditor] Cannot delete — minimum 3 vertices required.');
            return;
        }
        this.workingPolygon.splice(index, 1);
        this._rebuildAllHandles();
        this._rebuildPreview();

        console.log(
            `[SlabProfileEditor] Vertex ${index} deleted — ` +
            `${this.workingPolygon.length} vertices remain.`
        );
        this._onCommit(structuredClone(this.workingPolygon));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // EVENT LISTENERS — ATTACH / DETACH
    // ─────────────────────────────────────────────────────────────────────────

    private _attachListeners(): void {
        const dom = this.world.renderer!.three.domElement;

        // ── pointerdown ───────────────────────────────────────────────────────
        this._evPointerDown = (e: PointerEvent) => {
            if (e.button !== 0) return;

            // §12 §3.3 Hit priority: vertex (1) → midpoint (2) → edge (3).

            // 1. Vertex handles — highest priority.
            const vertexHit = this._hitTestVertexHandles(e);
            if (vertexHit) {
                e.stopImmediatePropagation();
                e.preventDefault();

                const now = e.timeStamp;
                if (now - this._lastPointerDownTime < DOUBLE_CLICK_THRESHOLD_MS) {
                    this._lastPointerDownTime = 0;
                    this._deleteVertex(vertexHit.vertexIndex);
                    return;
                }
                this._lastPointerDownTime = now;

                (vertexHit.mesh.material as THREE.MeshStandardMaterial)
                    .color.setHex(HANDLE_COLOUR_DRAGGING);

                this.drag = {
                    kind:        'vertex',
                    mesh:        vertexHit.mesh,
                    vertexIndex: vertexHit.vertexIndex,
                };
                this._setMidpointHandlesVisible(false);
                this._setEdgeHighlight(null);  // hide edge highlight during vertex drag

                console.log(`[SlabProfileEditor] Drag started — vertex ${vertexHit.vertexIndex}`);
                return;
            }

            // 2. Midpoint handles.
            const midHit = this._hitTestMidpointHandles(e);
            if (midHit) {
                e.stopImmediatePropagation();
                e.preventDefault();

                const worldPt = this._raycastSlabPlane(e);
                if (!worldPt) return;

                const afterIdx   = midHit.afterVertexIndex;
                const newIdx     = this._insertVertexAfter(afterIdx, worldPt);

                this._rebuildAllHandles();
                this._rebuildPreview();

                const newMesh = this.vertexHandles[newIdx];
                if (!newMesh) return;

                (newMesh.material as THREE.MeshStandardMaterial)
                    .color.setHex(HANDLE_COLOUR_DRAGGING);

                this.drag = {
                    kind:           'midpoint',
                    mesh:           newMesh,
                    newVertexIndex: newIdx,
                };
                this._setMidpointHandlesVisible(false);
                this._setEdgeHighlight(null);

                console.log(
                    `[SlabProfileEditor] Midpoint clicked — inserted vertex ${newIdx} ` +
                    `after vertex ${afterIdx}. Drag to position.`
                );
                return;
            }

            // 3. §12 Phase 4 — Edge hitboxes (lowest priority).
            const edgeHit = this._hitTestEdgeHitboxes(e);
            if (edgeHit) {
                e.stopImmediatePropagation();
                e.preventDefault();

                const anchorPt = this._raycastSlabPlane(e);
                if (!anchorPt) return;

                this.drag = {
                    kind:      'edge',
                    edgeIndex: edgeHit.edgeIndex,
                    anchorPt,
                    // §01 R-4: deep clone — snapPoly must never be mutated.
                    snapPoly:  structuredClone(this.workingPolygon),
                };
                this._setMidpointHandlesVisible(false);
                this._setEdgeHighlight(edgeHit.edgeIndex);  // keep highlight during drag

                console.log(
                    `[SlabProfileEditor] Edge drag started — edge ${edgeHit.edgeIndex}`
                );
                return;
            }

            // Click missed all handles — do NOT consume the event.
        };

        // ── pointermove ───────────────────────────────────────────────────────
        this._evPointerMove = (e: PointerEvent) => {
            if (this.drag) {
                e.stopPropagation();
                e.preventDefault();

                // §12 Phase 4 — Edge drag branch.
                if (this.drag.kind === 'edge') {
                    const currentPt = this._raycastSlabPlane(e);
                    if (!currentPt) return;
                    this._applySegmentDrag(
                        this.drag.edgeIndex,
                        this.drag.anchorPt,
                        currentPt,
                        this.drag.snapPoly,
                    );
                    return;
                }

                // Vertex / midpoint drag (existing behaviour).
                const worldPt = this._raycastSlabPlane(e);
                if (!worldPt) return;

                const draggingIdx = this.drag.kind === 'vertex'
                    ? this.drag.vertexIndex
                    : this.drag.newVertexIndex;

                let snapped = worldPt;
                if (!this.shiftPressed && this.workingPolygon.length >= 2) {
                    const n       = this.workingPolygon.length;
                    const prevIdx = (draggingIdx - 1 + n) % n;
                    snapped       = snapToAxisOrDiagonal(
                        this.workingPolygon[prevIdx],
                        worldPt
                    );
                }

                this.workingPolygon[draggingIdx] = snapped;
                this._rebuildPreview();

            } else {
                // ── Hover highlight ────────────────────────────────────────

                // 1. Vertex handle hover.
                const vHit = this._hitTestVertexHandles(e);
                const newHoveredVertex = vHit?.vertexIndex ?? null;

                if (newHoveredVertex !== this.hoveredVertexIndex) {
                    if (this.hoveredVertexIndex !== null &&
                        this.vertexHandles[this.hoveredVertexIndex]) {
                        (this.vertexHandles[this.hoveredVertexIndex].material as THREE.MeshStandardMaterial)
                            .color.setHex(HANDLE_COLOUR_NORMAL);
                    }
                    if (newHoveredVertex !== null && this.vertexHandles[newHoveredVertex]) {
                        (this.vertexHandles[newHoveredVertex].material as THREE.MeshStandardMaterial)
                            .color.setHex(HANDLE_COLOUR_HOVERED);
                    }
                    this.hoveredVertexIndex = newHoveredVertex;
                }

                // 2. Midpoint handle hover (vertex has priority).
                const mHit = newHoveredVertex === null
                    ? this._hitTestMidpointHandles(e)
                    : null;
                const newHoveredMidpoint = mHit?.afterVertexIndex ?? null;

                if (newHoveredMidpoint !== this.hoveredMidpointIndex) {
                    if (this.hoveredMidpointIndex !== null &&
                        this.midpointHandles[this.hoveredMidpointIndex]) {
                        const prevMat = this.midpointHandles[this.hoveredMidpointIndex]
                            .material as THREE.MeshStandardMaterial;
                        prevMat.color.setHex(MIDPOINT_COLOUR_NORMAL);
                        prevMat.opacity = MIDPOINT_OPACITY_NORMAL;
                    }
                    if (newHoveredMidpoint !== null &&
                        this.midpointHandles[newHoveredMidpoint]) {
                        const nextMat = this.midpointHandles[newHoveredMidpoint]
                            .material as THREE.MeshStandardMaterial;
                        nextMat.color.setHex(MIDPOINT_COLOUR_HOVERED);
                        nextMat.opacity = MIDPOINT_OPACITY_HOVERED;
                    }
                    this.hoveredMidpointIndex = newHoveredMidpoint;
                }

                // 3. §12 Phase 3 — Edge hover (only when no vertex/midpoint hovered).
                if (newHoveredVertex === null && newHoveredMidpoint === null) {
                    const eHit = this._hitTestEdgeHitboxes(e);
                    const newHoveredEdge = eHit?.edgeIndex ?? null;
                    if (newHoveredEdge !== this.hoveredEdgeIndex) {
                        this._setEdgeHighlight(newHoveredEdge);
                    }
                } else {
                    // Vertex or midpoint hovered — clear edge highlight.
                    if (this.hoveredEdgeIndex !== null) {
                        this._setEdgeHighlight(null);
                    }
                }
            }
        };

        // ── pointerup ─────────────────────────────────────────────────────────
        this._evPointerUp = (e: PointerEvent) => {
            if (!this.drag) return;

            e.stopPropagation();
            e.preventDefault();

            // §12 Phase 4 — Edge drag commit.
            if (this.drag.kind === 'edge') {
                this._onCommit(structuredClone(this.workingPolygon));
                this._syncMidpointHandlePositions();
                this._setMidpointHandlesVisible(true);
                this._setEdgeHighlight(null);
                this.drag = null;
                console.log('[SlabProfileEditor] Edge drag committed.');
                return;
            }

            // Vertex / midpoint drag commit (existing behaviour).
            const committedIdx = this.drag.kind === 'vertex'
                ? this.drag.vertexIndex
                : this.drag.newVertexIndex;

            (this.drag.mesh.material as THREE.MeshStandardMaterial)
                .color.setHex(HANDLE_COLOUR_NORMAL);

            this.drag = null;

            this._syncMidpointHandlePositions();
            this._setMidpointHandlesVisible(true);

            console.log(
                `[SlabProfileEditor] Drag committed — vertex ${committedIdx} → ` +
                `(${this.workingPolygon[committedIdx]?.x.toFixed(3)}, ` +
                `${this.workingPolygon[committedIdx]?.y.toFixed(3)})`
            );

            this._onCommit(structuredClone(this.workingPolygon));
        };

        // ── keyboard (ESC + Enter + Shift) ────────────────────────────────────
        this._evKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                console.log('[SlabProfileEditor] ESC — cancelling profile edit.');
                this._onCancel();
                this.deactivate();
                return;
            }
            if (e.key === 'Enter') {
                if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
                e.stopImmediatePropagation();
                console.log('[SlabProfileEditor] Enter — finishing profile edit.');
                this._onCancel();
                this.deactivate();
            }
        };

        this._evShiftDown = (e: KeyboardEvent) => {
            if (e.key === 'Shift') this.shiftPressed = true;
        };

        this._evShiftUp = (e: KeyboardEvent) => {
            if (e.key === 'Shift') this.shiftPressed = false;
        };

        dom.addEventListener('pointerdown', this._evPointerDown, { capture: true });
        dom.addEventListener('pointermove', this._evPointerMove, { capture: true });
        dom.addEventListener('pointerup',   this._evPointerUp,   { capture: true });
        window.addEventListener('keydown', this._evKeyDown);
        window.addEventListener('keydown', this._evShiftDown);
        window.addEventListener('keyup',   this._evShiftUp);
    }

    private _detachListeners(): void {
        const dom = this.world.renderer?.three.domElement;
        if (dom) {
            if (this._evPointerDown) dom.removeEventListener('pointerdown', this._evPointerDown, { capture: true });
            if (this._evPointerMove) dom.removeEventListener('pointermove', this._evPointerMove, { capture: true });
            if (this._evPointerUp)   dom.removeEventListener('pointerup',   this._evPointerUp,   { capture: true });
        }
        if (this._evKeyDown)   window.removeEventListener('keydown', this._evKeyDown);
        if (this._evShiftDown) window.removeEventListener('keydown', this._evShiftDown);
        if (this._evShiftUp)   window.removeEventListener('keyup',   this._evShiftUp);

        this._evPointerDown = null;
        this._evPointerMove = null;
        this._evPointerUp   = null;
        this._evKeyDown     = null;
        this._evShiftDown   = null;
        this._evShiftUp     = null;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SCENE CLEANUP
    // ─────────────────────────────────────────────────────────────────────────

    private _disposeVertexHandles(): void {
        for (const h of this.vertexHandles) {
            h.geometry.dispose();
            (h.material as THREE.Material).dispose();
            this.scene?.remove(h);
        }
        this.vertexHandles      = [];
        this.hoveredVertexIndex = null;
    }

    private _disposeMidpointHandles(): void {
        for (const h of this.midpointHandles) {
            h.geometry.dispose();
            (h.material as THREE.Material).dispose();
            this.scene?.remove(h);
        }
        this.midpointHandles      = [];
        this.hoveredMidpointIndex = null;
    }

    private _disposeScene(): void {
        this._disposeVertexHandles();
        this._disposeMidpointHandles();

        // §12 Phase 2: dispose edge hitboxes.
        this._disposeEdgeHitboxes();

        // §12 Phase 3: dispose edge highlight line.
        if (this._edgeHighlightLine) {
            this._edgeHighlightLine.geometry.dispose();
            (this._edgeHighlightLine.material as THREE.Material).dispose();
            this.scene?.remove(this._edgeHighlightLine);
            this._edgeHighlightLine = null;
        }

        if (this.boundaryLine) {
            this.boundaryLine.geometry.dispose();
            (this.boundaryLine.material as THREE.Material).dispose();
            this.scene?.remove(this.boundaryLine);
            this.boundaryLine = null;
        }

        if (this.fillMesh) {
            this.fillMesh.geometry.dispose();
            (this.fillMesh.material as THREE.Material).dispose();
            this.scene?.remove(this.fillMesh);
            this.fillMesh = null;
        }

        // Restore cursor if it was changed by edge highlight.
        const dom = this.world.renderer?.three.domElement;
        if (dom) dom.style.cursor = '';
    }
}
