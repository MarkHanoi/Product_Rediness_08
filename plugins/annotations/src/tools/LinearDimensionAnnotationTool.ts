/**
 * §ANN-B1 — Linear Dimension Annotation Tool
 * Phase IV — Polish (Revit-grade)
 *
 * State machine:
 *   IDLE → PICK_WALL_A → PICK_WALL_B → DEFINE_OFFSET → PICK_WALL_A (loop)
 *
 * Phase III additions:
 *   III-1  Hover: raycast → WallFaceDetector → face highlight overlay (LineSegments)
 *   III-2  Click: StableReference via makeWallFaceRef for wall hits
 *   III-3  Live preview: Three.js dim assembly (dim line + two witness lines), updated in-place
 *   III-4  DEFINE_OFFSET state: locked dim line, drag offset, commit on click
 *   III-5  Non-wall fallback: makeRef / makePointRef (preserved from Phase II)
 *   III-6  Status bar: contextual 'dim-tool-status' DOM CustomEvent per state transition
 *
 * Phase IV additions:
 *   IV-1   Face-type options bar (Exterior | Interior | Centerline) — §DIM-IV-1
 *   IV-2   Unit selector in options bar (mm | cm | m) — §DIM-IV-2
 *   IV-4   Escape back-steps through states rather than deactivating immediately — §DIM-IV-4
 *
 * CONTRACT COMPLIANCE:
 *   §05 §7.8 — No bim-* / @thatopen/ui elements anywhere
 *   §01 §2   — ID generation here (not inside execute()); CommandManager.execute() is the only write path
 *   §01 §5   — No direct store writes; WallFaceDetector read is pure (no mutations)
 *   §03      — WallData is read-only via wallStore.getById(); no writes to WallStore
 *
 * The constructor signature, activate(), deactivate(), and setActiveViewId()
 * are preserved unchanged — AnnotationManager.ts is not affected.
 */

import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { AnnotationStore } from '../subsystem/AnnotationStore';
import {
    makeRef,
    makePointRef,
    makeWallFaceRef,
    resolveReferenceToPoint,
    ResolverStores,
    StableReference,
} from '../subsystem/AnnotationReference';
import { makeAnnotationElement } from '../subsystem/AnnotationTypes';
import { CreateAnnotationCommand } from '../commands/CreateAnnotationCommand';
import { detectWallFace, WallFaceHit, WallFaceType } from '../plantools/WallFaceDetector';
import { formatDimension, DimensionUnit } from '../subsystem/DimensionFormatter';
import { LinearDimOptionsBar } from '../plantools/LinearDimOptionsBar';
import type { DimHoverHint } from '../AnnotationRenderLayer';
import { BIM_LAYER } from '@pryzm/scene-committer';

// ─────────────────────────────────────────────────────────────────────────────
// §DIM-V-1/V-2 — Hover hint callback type
//
// Registered by AnnotationManager so the render layer can draw:
//   V-1: Semi-transparent blue fill on the projected face quad
//   V-2: Filled reference dots at locked Point A / B positions
// ─────────────────────────────────────────────────────────────────────────────

type HoverHintCallback = (hint: DimHoverHint | null) => void;

// ─────────────────────────────────────────────────────────────────────────────
// State machine enum
// ─────────────────────────────────────────────────────────────────────────────

export enum LinearDimToolState {
    IDLE,
    PICK_WALL_A,
    PICK_WALL_B,
    DEFINE_OFFSET,
    /** §DIM-VI-2 — String chain: additional references clicked after first segment is defined */
    PICK_STRING_CONTINUE,
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal result type for raycasting
// ─────────────────────────────────────────────────────────────────────────────

interface RaycastResult {
    /** Raw 3D intersection point (before face snapping) */
    rawPoint: THREE.Vector3;
    /** Wall face detection result — only present when the hit object is a wall */
    wallHit?: WallFaceHit;
    openingSnap?: { ref: StableReference; point: THREE.Vector3; sourceType: string; label: string };
    /** The selectable Three.js root (userData.id + userData.elementType) — null for free points */
    selectableRoot: THREE.Object3D | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Colour of the face highlight LineSegments overlay — Revit-style blue */
const FACE_HIGHLIGHT_COLOR = 0x4499ff;

/** Semantic element types recognised for reference capture (non-wall fallback) */
const SEMANTIC_TYPES = [
    'wall', 'window', 'door', 'curtain-wall', 'curtain-panel', 'slab', 'furniture',
    'column', 'beam', 'roof', 'stairs', 'ramp', 'railing',
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// LinearDimensionAnnotationTool — Phase III
// ─────────────────────────────────────────────────────────────────────────────

type CommandManager = { execute(cmd: unknown): void };

export class LinearDimensionAnnotationTool {
    public isActive = false;
    private _state = LinearDimToolState.IDLE;
    private _activeViewId: string | null = null;

    // ── IV-1/2: Options bar (face type + unit selector) ───────────────────────
    // Lazily created on first activate(); destroyed only in dispose().
    private _optionsBar: LinearDimOptionsBar | null = null;

    // ── §DIM-V-1/V-2: Hover hint callback (wired by AnnotationManager) ────────
    // Called on every mousemove with the current face-quad + locked dot data so
    // AnnotationRenderLayer can draw the 2D canvas overlay without coupling to
    // the tool's Three.js internal state.
    private _hoverHintCallback: HoverHintCallback | null = null;

    // ── References & locked points ────────────────────────────────────────────
    private _refA: StableReference | null = null;
    private _refB: StableReference | null = null;
    private _pointA: THREE.Vector3 | null = null;
    private _pointB: THREE.Vector3 | null = null;

    // ── §DIM-VI-2 — String chain state ────────────────────────────────────────
    // Accumulated when the tool is in PICK_STRING_CONTINUE.
    // Ordered: [first ref (=refA), second ref (=refB), third ref, …]
    private _stringRefs: Array<{ ref: StableReference; point: THREE.Vector3 }> = [];
    /** Offset locked at the moment of DEFINE_OFFSET commit for the whole chain */
    private _stringOffset = 0;

    /** Live perpendicular offset accumulated during DEFINE_OFFSET state */
    private _liveOffset = 0;

    // ── §DIM-ORTHO: Wall A face normal — stored on pointA pick, used to keep
    //    the dim line orthogonal to parallel walls regardless of click position ──
    private _wallANormal: THREE.Vector3 | null = null;

    // ── §DIM-TAB-RESNAP: Last hovered wall info for Tab re-snap ──────────────
    // Stored on every mousemove that detects a wall in PICK_WALL_A or PICK_WALL_B.
    // Tab key uses this to re-run detectWallFace with the new preferred face type
    // so the highlight updates immediately without requiring a mousemove event.
    private _lastHoverRawPoint: THREE.Vector3 | null = null;
    private _lastHoverWallId: string | null = null;

    // ── §DIM-OFFSET-GUARD: Prevents accidental immediate commit in DEFINE_OFFSET ─
    // Set to false when entering DEFINE_OFFSET (in _handlePickB).
    // Set to true on the first mousemove while in DEFINE_OFFSET.
    // _onMouseDown will not commit until this flag is true, preventing users
    // from accidentally committing a 0-offset dimension by fast double-clicking.
    private _defineOffsetMoved = false;

    // ── Last emitted status (avoids redundant dispatches on every mousemove) ──
    private _lastStatus = '';

    // ── Raycasting ────────────────────────────────────────────────────────────
    private _raycaster = (() => {
        const raycaster = new THREE.Raycaster();
        raycaster.layers.set(BIM_LAYER);
        return raycaster;
    })();
    private _mouse = new THREE.Vector2();

    // ── Three.js overlay — face highlight (§III-1) ────────────────────────────
    // A single LineSegments object reused on every hover frame — no per-frame allocations.
    private _faceHighlight: THREE.LineSegments | null = null;

    // ── Three.js overlay — live dimension preview (§III-3) ───────────────────
    // Three Line objects inside a Group, geometry updated in-place each frame.
    private _previewGroup: THREE.Group | null = null;
    private _previewDimLine: THREE.Line | null = null;
    private _previewWitA: THREE.Line | null = null;
    private _previewWitB: THREE.Line | null = null;

    // ── Shared preview material — single instance, never reallocated ──────────
    private _previewMat: THREE.LineBasicMaterial | null = null;
    private _highlightMat: THREE.LineBasicMaterial | null = null;

    constructor(
        private _components: OBC.Components,
        private _commandManager: CommandManager,
        _store: AnnotationStore,
        private _resolverStores: ResolverStores
    ) { void _store; }

    // ─────────────────────────────────────────────────────────────────────────
    // Public API (signature preserved from Phase I/II — AnnotationManager unchanged)
    // ─────────────────────────────────────────────────────────────────────────

    setActiveViewId(viewId: string | null): void {
        this._activeViewId = viewId;
    }

    setResolverStores(stores: ResolverStores): void {
        this._resolverStores = stores;
    }

    /**
     * §DIM-V-1/V-2 — Register the hover-hint callback.
     *
     * Called once by AnnotationManager after construction.  The callback is
     * invoked on every mousemove with a DimHoverHint describing:
     *   • faceQuad  — 4 world-space corners of the currently hovered face strip
     *                 (null when no wall is under the cursor)
     *   • lockedA   — world position of the committed Point A reference (or null)
     *   • lockedB   — world position of the committed Point B reference (or null)
     *
     * The render layer uses this data to draw the 2D canvas overlay (V-1 fill
     * and V-2 reference dots) without any coupling to Three.js internals here.
     */
    setHoverHintCallback(cb: (hint: DimHoverHint | null) => void): void {
        this._hoverHintCallback = cb;
    }

    activate(): void {
        if (this.isActive) return;
        this.isActive = true;
        this._state = LinearDimToolState.PICK_WALL_A;
        this._attachListeners();
        if (this._domElement) this._domElement.style.cursor = 'crosshair';
        // §IV-1/2: Show face-type + unit options bar
        if (!this._optionsBar) this._optionsBar = new LinearDimOptionsBar();
        this._optionsBar.show();
        this._emitStatus('Hover over a wall face, then click to start the dimension (Point A)');
        console.log('[LinearDimAnnotationTool] activated — Phase IV');
    }

    deactivate(): void {
        if (!this.isActive) return;
        this.isActive = false;
        this._state = LinearDimToolState.IDLE;
        this._detachListeners();
        this._hideFaceHighlight();
        this._hidePreview();
        this._reset();
        if (this._domElement) this._domElement.style.cursor = 'default';
        // §IV-1/2: Hide options bar (not destroyed — reused on next activate)
        this._optionsBar?.hide();
        // §DIM-V: clear the render-layer overlay when the tool deactivates
        this._hoverHintCallback?.(null);
        this._emitStatus('');
    }

    dispose(): void {
        this.deactivate();
        this._disposeFaceHighlight();
        this._disposePreview();
        // §IV-1/2: Permanently destroy the options bar DOM element
        this._optionsBar?.dispose();
        this._optionsBar = null;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Private — world / DOM accessors
    // ─────────────────────────────────────────────────────────────────────────

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

    // ─────────────────────────────────────────────────────────────────────────
    // Listener management
    // ─────────────────────────────────────────────────────────────────────────

    private _attachListeners(): void {
        const el = this._domElement;
        if (!el) return;
        el.addEventListener('mousemove', this._onMouseMove);
        el.addEventListener('mousedown', this._onMouseDown);
        window.addEventListener('keydown', this._onKeyDown);
    }

    private _detachListeners(): void {
        const el = this._domElement;
        if (el) {
            el.removeEventListener('mousemove', this._onMouseMove);
            el.removeEventListener('mousedown', this._onMouseDown);
        }
        window.removeEventListener('keydown', this._onKeyDown);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Event handlers
    // ─────────────────────────────────────────────────────────────────────────

    private _onKeyDown = (e: KeyboardEvent): void => {
        if (!this.isActive) return;
        if (e.key === 'Escape') {
            e.preventDefault();
            this._backStep();
        } else if (e.key === 'Tab') {
            // §DIM-TAB: cycle face type (Exterior → Interior → Centerline → …)
            e.preventDefault();
            this._optionsBar?.cycleFaceType();
            // §DIM-TAB-RESNAP: immediately re-detect the face on the last hovered wall
            // with the new preferred face type. This updates the highlight overlay and
            // hover hint without requiring a new mousemove event — matching Revit's
            // behaviour where Tab snaps to the next face type in real time.
            if (this._lastHoverRawPoint && this._lastHoverWallId) {
                const wallData = this._resolverStores.wallStore?.getById?.(this._lastHoverWallId);
                if (wallData) {
                    const preferredFace = this._optionsBar?.preferredFaceType ?? 'face:exterior';
                    const newHit = detectWallFace(this._lastHoverRawPoint, wallData, preferredFace);
                    if (newHit) {
                        this._updateFaceHighlight(newHit);
                        this._emitHoverHint(newHit);
                        this._updateStatusForState(newHit);
                    }
                }
            }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (this._state === LinearDimToolState.DEFINE_OFFSET) {
                // §DIM-ENTER: commit the dimension at the current live offset
                this._handleDefineOffset();
            } else if (this._state === LinearDimToolState.PICK_STRING_CONTINUE) {
                // §DIM-VI-2 — Enter commits the string chain
                this._commitStringChain();
            }
        }
    };

    /**
     * §IV-4 — Escape back-steps through states rather than immediately deactivating.
     *
     *   DEFINE_OFFSET → PICK_WALL_B  (un-lock point B, keep point A)
     *   PICK_WALL_B   → PICK_WALL_A  (un-lock point A)
     *   PICK_WALL_A   → deactivate   (user pressed Escape at the very start)
     */
    private _backStep(): void {
        if (this._state === LinearDimToolState.PICK_STRING_CONTINUE) {
            // §DIM-VI-2 Escape in string mode:
            //   • More than 2 refs: pop the last one, stay in PICK_STRING_CONTINUE
            //   • Exactly 2 refs:   restore to DEFINE_OFFSET with original refA/refB
            if (this._stringRefs.length > 2) {
                this._stringRefs.pop();
                this._hidePreview();
                const n = this._stringRefs.length;
                this._emitStatus(
                    `String chain: ${n} refs (${n - 1} segment${n - 1 !== 1 ? 's' : ''}). ` +
                    `Click wall for next ref, Enter to commit  [Esc → remove last]`
                );
                console.log('[LinearDimAnnotationTool] String back-step: popped last ref, now', n, 'refs');
            } else {
                // Restore to DEFINE_OFFSET with the original two refs
                const r0 = this._stringRefs[0];
                const r1 = this._stringRefs[1];
                if (r0 && r1) {
                    this._refA    = r0.ref;
                    this._pointA  = r0.point.clone();
                    this._refB    = r1.ref;
                    this._pointB  = r1.point.clone();
                    this._liveOffset = this._stringOffset;
                }
                this._stringRefs   = [];
                this._stringOffset = 0;
                this._hidePreview();
                this._state = LinearDimToolState.DEFINE_OFFSET;
                // §DIM-OFFSET-GUARD: the user had already moved the mouse to set the offset
                // before entering string mode, so treat this as already moved.
                this._defineOffsetMoved = true;
                this._emitStatus('Move cursor to set the offset distance, then click to place  [Esc → back]');
                console.log('[LinearDimAnnotationTool] String back-step: back to DEFINE_OFFSET');
            }

        } else if (this._state === LinearDimToolState.DEFINE_OFFSET) {
            // Back to PICK_WALL_B: clear B + offset, restore live preview from A to cursor
            this._refB       = null;
            this._pointB     = null;
            this._liveOffset = 0;
            this._hidePreview();
            this._state = LinearDimToolState.PICK_WALL_B;
            this._emitStatus('Click the second wall face for Point B  [Esc → back]');
            console.log('[LinearDimAnnotationTool] Escape back-step: DEFINE_OFFSET → PICK_WALL_B');

        } else if (this._state === LinearDimToolState.PICK_WALL_B) {
            // Back to PICK_WALL_A: clear A entirely, no preview
            this._refA   = null;
            this._pointA = null;
            this._hidePreview();
            this._hideFaceHighlight();
            this._state = LinearDimToolState.PICK_WALL_A;
            this._emitStatus('Hover over a wall face, then click to start the dimension (Point A)  [Esc → back]');
            console.log('[LinearDimAnnotationTool] Escape back-step: PICK_WALL_B → PICK_WALL_A');

        } else {
            // PICK_WALL_A or IDLE → fully deactivate the tool
            console.log('[LinearDimAnnotationTool] Escape → deactivate');
            this.deactivate();
        }
    }

    private _onMouseMove = (e: MouseEvent): void => {
        if (!this.isActive) return;
        this._updateMouse(e);
        const hit = this._raycastFull();

        if (this._state === LinearDimToolState.PICK_WALL_A) {
            // §III-1: face highlight only; no preview geometry yet
            if (hit?.wallHit) {
                this._updateFaceHighlight(hit.wallHit);
                // §DIM-TAB-RESNAP: cache raw hit position + wall ID so Tab can re-snap instantly
                this._lastHoverRawPoint = hit.rawPoint.clone();
                this._lastHoverWallId   = hit.wallHit.wallId;
            } else {
                this._hideFaceHighlight();
                this._lastHoverRawPoint = null;
                this._lastHoverWallId   = null;
            }
            this._updateStatusForState(hit?.wallHit ?? null);
            // §DIM-V: emit face-quad hint + null locked dots (no points committed yet)
            this._emitHoverHint(hit?.wallHit ?? null);

        } else if (this._state === LinearDimToolState.PICK_WALL_B && this._pointA) {
            // §III-1: face highlight on hover
            if (hit?.wallHit) {
                this._updateFaceHighlight(hit.wallHit);
                // §DIM-TAB-RESNAP: cache raw hit position + wall ID
                this._lastHoverRawPoint = hit.rawPoint.clone();
                this._lastHoverWallId   = hit.wallHit.wallId;
            } else {
                this._hideFaceHighlight();
                this._lastHoverRawPoint = null;
                this._lastHoverWallId   = null;
            }
            // §III-3: live preview from locked pointA to the cursor's snap (or raw) position
            const hoverPt = hit?.wallHit?.facePoint ?? hit?.rawPoint ?? null;
            if (hoverPt) {
                this._updatePreview(this._pointA, hoverPt, null);
            } else {
                this._hidePreview();
            }
            this._updateStatusForState(hit?.wallHit ?? null);
            // §DIM-V: emit face-quad hint + lockedA dot (pointA committed, pointB pending)
            this._emitHoverHint(hit?.wallHit ?? null);

        } else if (this._state === LinearDimToolState.DEFINE_OFFSET && this._pointA && this._pointB) {
            // §III-4: dim line locked to A→B; user drags the perpendicular offset.
            this._hideFaceHighlight();
            // §DIM-OFFSET-GUARD: mark that the cursor has moved at least once in DEFINE_OFFSET.
            // The first mousemove unlocks the commit click so accidental fast double-clicks
            // on Wall B cannot place a dimension at 0 offset.
            this._defineOffsetMoved = true;
            // §DIM-GROUND: Use hit rawPoint when available; fall back to a ground-plane
            // intersection so the preview remains visible when the cursor leaves the wall
            // geometry (e.g. moves into empty floor space to set the offset distance).
            const hoverPt = hit?.rawPoint ?? this._intersectGroundPlane();
            if (hoverPt) {
                this._liveOffset = this._computeOffset(this._pointA, this._pointB, hoverPt);
                // §DIM-OFFSET-GUARD: pass forceShowWitness=true so witness lines are always
                // visible in DEFINE_OFFSET — even at 0 offset — making it clear the dimension
                // has not been placed yet and a click is still required.
                this._updatePreview(this._pointA, this._pointB, this._liveOffset, true);
            }
            this._updateStatusForState(null);
            // §DIM-V: no face hover in DEFINE_OFFSET; emit locked dots for A + B only
            this._emitHoverHint(null);

        } else if (this._state === LinearDimToolState.PICK_STRING_CONTINUE) {
            // §DIM-VI-2: face highlight on the next potential wall, live preview
            // from the last locked ref to the cursor (at the locked offset)
            if (hit?.wallHit) {
                this._updateFaceHighlight(hit.wallHit);
            } else {
                this._hideFaceHighlight();
            }
            const last = this._stringRefs[this._stringRefs.length - 1];
            const hoverPt = hit?.wallHit?.facePoint ?? hit?.rawPoint ?? null;
            if (last && hoverPt) {
                this._updatePreview(last.point, hoverPt, this._stringOffset);
            } else {
                this._hidePreview();
            }
            const n = this._stringRefs.length;
            this._emitStatus(
                `String chain: ${n} refs (${n - 1} segment${n - 1 !== 1 ? 's' : ''}). ` +
                `Click wall for next ref, Enter to commit  [Esc → remove last]`
            );
            this._emitHoverHint(hit?.wallHit ?? null);
        }
    };

    private _onMouseDown = (e: MouseEvent): void => {
        if (!this.isActive || e.button !== 0) return;
        this._updateMouse(e);

        // §DIM-PLACE: In DEFINE_OFFSET the dimension position is determined by
        // _liveOffset — commit when the user clicks.
        // §DIM-OFFSET-GUARD: Require at least one mousemove in DEFINE_OFFSET before
        // accepting a commit click. This prevents an accidental 0-offset placement
        // when the user rapidly double-clicks on Wall B.
        if (this._state === LinearDimToolState.DEFINE_OFFSET) {
            if (!this._defineOffsetMoved) {
                this._emitStatus(
                    'Move the cursor to position the dimension line, then click to place  [Enter → place now | Esc → back]'
                );
                return;
            }
            this._handleDefineOffset();
            return;
        }

        const hit = this._raycastFull();
        if (!hit) return;

        if (this._state === LinearDimToolState.PICK_WALL_A) {
            this._handlePickA(hit);
        } else if (this._state === LinearDimToolState.PICK_WALL_B) {
            this._handlePickB(hit);
        } else if (this._state === LinearDimToolState.PICK_STRING_CONTINUE) {
            // §DIM-VI-2: each click appends another ref to the chain
            this._handleStringContinue(hit);
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // State handlers
    // ─────────────────────────────────────────────────────────────────────────

    private _handlePickA(hit: RaycastResult): void {
        const { ref, point } = this._buildRefFromHit(hit);
        this._refA   = ref;
        this._pointA = point;
        // §DIM-ORTHO: store wall face normal so _updatePreview can keep the dim
        // line perpendicular to the wall regardless of where point B is clicked.
        if (hit.wallHit) {
            this._wallANormal = hit.wallHit.faceNormal.clone();
            this._wallANormal.y = 0;
            if (this._wallANormal.length() > 0.001) {
                this._wallANormal.normalize();
            } else {
                this._wallANormal = null;
            }
        } else {
            this._wallANormal = null;
        }
        this._state  = LinearDimToolState.PICK_WALL_B;
        console.log('[LinearDimAnnotationTool] Point A picked:', ref.stableKey);
        this._emitStatus('Click the second wall face for Point B');
    }

    private _handlePickB(hit: RaycastResult): void {
        const { ref, point } = this._buildRefFromHit(hit);
        this._refB   = ref;
        this._pointB = point;
        this._state  = LinearDimToolState.DEFINE_OFFSET;
        this._liveOffset = 0;
        // §DIM-OFFSET-GUARD: reset the moved flag; the first mousemove in DEFINE_OFFSET
        // will set it to true, unlocking the commit click.
        this._defineOffsetMoved = false;
        // Clear Tab re-snap cache: now entering DEFINE_OFFSET where hover tracking is unused
        this._lastHoverRawPoint = null;
        this._lastHoverWallId   = null;
        this._hideFaceHighlight();
        console.log('[LinearDimAnnotationTool] Point B picked:', ref.stableKey);
        this._emitStatus('Move cursor to set the offset distance, then click to place the dimension  [Enter → place now | Esc → back]');
    }

    /**
     * §III-4: Commits the dimension at the current liveOffset.
     *
     * When String mode is OFF: creates the dimension and returns to PICK_WALL_A.
     * When String mode is ON:  locks the offset, seeds _stringRefs with refA and
     * refB, and enters PICK_STRING_CONTINUE so the user can keep clicking refs.
     */
    private _handleDefineOffset(): void {
        if (!this._pointA || !this._pointB || !this._refA || !this._refB) return;

        if (this._optionsBar?.isString) {
            // §DIM-VI-2 — String mode: lock offset and continue picking
            this._stringOffset = this._liveOffset;
            this._stringRefs   = [
                { ref: this._refA, point: this._pointA.clone() },
                { ref: this._refB, point: this._pointB.clone() },
            ];
            this._state = LinearDimToolState.PICK_STRING_CONTINUE;
            this._emitStatus(
                `String chain started (${this._stringRefs.length} refs). ` +
                `Click more walls to add segments, or press Enter to commit.`
            );
            console.log('[LinearDimAnnotationTool] String mode: entering PICK_STRING_CONTINUE');
        } else {
            // Standard single-segment dimension
            this._createDimension(
                this._refA, this._refB,
                this._pointA, this._pointB,
                this._liveOffset
            );
            this._reset();
            this._state = LinearDimToolState.PICK_WALL_A;
            this._emitStatus('Dimension placed. Hover over the next wall face (Point A)');
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // §DIM-VI-2 — String chain handlers
    // ─────────────────────────────────────────────────────────────────────────

    /** Append the clicked reference to the string chain */
    private _handleStringContinue(hit: RaycastResult): void {
        const { ref, point } = this._buildRefFromHit(hit);
        this._stringRefs.push({ ref, point });
        this._hideFaceHighlight();
        const n = this._stringRefs.length;
        this._emitStatus(
            `String chain: ${n} refs (${n - 1} segment${n - 1 !== 1 ? 's' : ''}). ` +
            `Click wall for next ref, Enter to commit  [Esc → remove last]`
        );
        console.log('[LinearDimAnnotationTool] String: added ref', ref.stableKey, '— chain now', n, 'refs');
    }

    /**
     * Commit the accumulated string chain as a single multi-segment
     * linear-dim annotation.  Requires ≥ 2 refs (= 1 segment minimum).
     */
    private _commitStringChain(): void {
        if (this._stringRefs.length < 2) {
            console.warn('[LinearDimAnnotationTool] String chain too short to commit — need ≥ 2 refs');
            return;
        }
        this._createStringDimension(this._stringRefs, this._stringOffset);
        this._stringRefs   = [];
        this._stringOffset = 0;
        this._hidePreview();
        this._state = LinearDimToolState.PICK_WALL_A;
        this._emitStatus('String dimension placed. Hover over the next wall face (Point A)');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Reference building — §III-2 (wall) and §III-5 (non-wall fallback)
    // ─────────────────────────────────────────────────────────────────────────

    private _buildRefFromHit(hit: RaycastResult): { ref: StableReference; point: THREE.Vector3 } {
        if (hit.openingSnap) {
            return { ref: hit.openingSnap.ref, point: hit.openingSnap.point.clone() };
        }

        if (hit.wallHit && this._state === LinearDimToolState.PICK_WALL_B && this._pointA && this._wallANormal) {
            const adjusted = this._orthogonalizeWallHitToA(hit.wallHit);
            if (adjusted) {
                hit = { ...hit, wallHit: adjusted };
            }
        }

        // §III-2: Wall face reference — semantic and survives geometry rebuild
        if (hit.wallHit) {
            const { wallId, faceType, param, facePoint } = hit.wallHit;
            const ref = makeWallFaceRef(wallId, faceType, param);
            return { ref, point: facePoint.clone() };
        }

        // §III-5 Non-wall fallback: semantic element ref (param 0.5)
        const root = hit.selectableRoot;
        if (root?.userData?.id && root?.userData?.elementType) {
            const elType = (root.userData.elementType as string).toLowerCase();
            const ref = makeRef(elType, root.userData.id as string, 'param', 0.5);
            return { ref, point: hit.rawPoint.clone() };
        }

        // §III-5 Free-point fallback (grids, columns with no semantic root, etc.)
        return { ref: makePointRef(hit.rawPoint), point: hit.rawPoint.clone() };
    }

    private _orthogonalizeWallHitToA(wallHit: WallFaceHit): WallFaceHit | null {
        if (!this._pointA || !this._wallANormal) return null;
        const wall = this._resolverStores.wallStore?.getById?.(wallHit.wallId);
        const bl = wall?.baseLine;
        if (!bl || bl.length < 2) return null;
        const start = new THREE.Vector3(bl[0].x, bl[0].y, bl[0].z);
        const end = new THREE.Vector3(bl[1].x, bl[1].y, bl[1].z);
        const wallDir = new THREE.Vector3().subVectors(end, start);
        const wallLen = wallDir.length();
        if (wallLen < 0.001) return null;
        wallDir.divideScalar(wallLen);
        const n = this._wallANormal.clone().setY(0).normalize();
        const d = wallDir.clone().setY(0).normalize();
        if (Math.abs(n.dot(d)) > 0.2) return null;

        const ax = this._pointA.x;
        const az = this._pointA.z;
        const bx = wallHit.facePoint.x;
        const bz = wallHit.facePoint.z;
        const cross = n.x * d.z - n.z * d.x;
        if (Math.abs(cross) < 0.0001) return null;
        const qx = bx - ax;
        const qz = bz - az;
        const t = (qx * d.z - qz * d.x) / cross;
        const p = this._pointA.clone().addScaledVector(n, t);
        p.y = wallHit.facePoint.y;
        const param = Math.max(0, Math.min(1, new THREE.Vector3().subVectors(p, start).dot(wallDir) / wallLen));
        return { ...wallHit, param, facePoint: p };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Offset computation
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Project the cursor position onto the perpendicular axis of A→B to get
     * the signed offset distance in metres.
     *
     * The offset plane is always XZ-aligned (Y component of A→B is zeroed) so
     * that the dimension line stays horizontal even when walls have different heights.
     */
    private _computeOffset(pA: THREE.Vector3, pB: THREE.Vector3, cursor: THREE.Vector3): number {
        // §DIM-ORTHO: mirror the same axis selection as _updatePreview
        let dir: THREE.Vector3;
        if (this._wallANormal && this._wallANormal.length() > 0.001) {
            dir = this._wallANormal.clone();
        } else {
            dir = new THREE.Vector3().subVectors(pB, pA);
            dir.y = 0;
            const len = dir.length();
            if (len < 0.001) return 0;
            dir.normalize();
        }
        const up   = new THREE.Vector3(0, 1, 0);
        const side = new THREE.Vector3().crossVectors(dir, up).normalize();
        return new THREE.Vector3().subVectors(cursor, pA).dot(side);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Annotation creation
    // ─────────────────────────────────────────────────────────────────────────

    private _createDimension(
        refA: StableReference,
        refB: StableReference,
        pointA: THREE.Vector3,
        pointB: THREE.Vector3,
        offset: number
    ): void {
        // §ANN-VIEW: Priority-ordered fallback chain.
        //   1. this._activeViewId — set via AnnotationManager.setActiveView() (normal path)
        //   2. annotationManager.getActiveViewId() — same source, late-init safe
        //   3. viewController.currentViewDefinitionId — §ANN-VIEW-PERSIST: survives finally
        //   4. viewDefinitionStore first 'plan' view — §ANN-VIEW-INFER: nuclear fallback
        //      for projects where view activation bypassed setActiveViewDefinitionId entirely
        const effectiveViewId: string | null = this._activeViewId
            ?? window.annotationManager?.getActiveViewId?.()
            ?? window.viewController?.currentViewDefinitionId
            ?? (() => {
                const vds = window.viewDefinitionStore;
                if (vds?.getByType) {
                    const plans = vds.getByType('plan') as Array<{ id: string }>;
                    if (plans.length > 0) {
                        console.log('[LinearDimAnnotationTool] §ANN-VIEW-INFER: using plan view →', plans[0]!.id);
                        return plans[0]!.id;
                    }
                }
                return null;
            })();

        if (!effectiveViewId) {
            console.warn('[LinearDimAnnotationTool] No active view — annotation not created');
            return;
        }

        // Keep internal state in sync so subsequent calls work without the fallback.
        if (!this._activeViewId) this._activeViewId = effectiveViewId;

        const id = crypto.randomUUID();

        // Re-resolve both references to get accurate cached positions.
        // Falls back to the face snap position from the click if the store is unavailable.
        const resolvedA = resolveReferenceToPoint(refA, this._resolverStores);
        const resolvedB = resolveReferenceToPoint(refB, this._resolverStores);

        const refs: StableReference[] = [
            {
                ...refA,
                cachedPosition: resolvedA
                    ? { x: resolvedA.x, y: resolvedA.y, z: resolvedA.z }
                    : { x: pointA.x, y: pointA.y, z: pointA.z },
            },
            {
                ...refB,
                cachedPosition: resolvedB
                    ? { x: resolvedB.x, y: resolvedB.y, z: resolvedB.z }
                    : { x: pointB.x, y: pointB.y, z: pointB.z },
            },
        ];

        // §DIM-ORTHO: When wall A's face normal is known, store it as measurementNormal so
        // the renderer can always draw the dimension line perpendicular to the walls —
        // regardless of where along each wall the user clicked.
        const measurementNormal = (this._wallANormal && this._wallANormal.length() > 0.001)
            ? { x: this._wallANormal.x, y: this._wallANormal.y, z: this._wallANormal.z }
            : undefined;

        const element = makeAnnotationElement(
            id,
            'linear-dim',
            effectiveViewId,
            refs,
            {
                modelPoints: [
                    { x: pointA.x, y: pointA.y, z: pointA.z },
                    { x: pointB.x, y: pointB.y, z: pointB.z },
                ],
                offset,
                measurementNormal,
            },
            {
                // §IV-2: use the unit currently selected in the options bar
                unit: (this._optionsBar?.unit ?? 'mm') as DimensionUnit,
                faceTypeA: refA.subElement,
                faceTypeB: refB.subElement,
                // §C3: pass constraint fields when Lock toggle is ON
                isLocked:               this._optionsBar?.isLocked ?? false,
                constraintType:         this._optionsBar?.constraintType ?? 'soft',
                constraintOperator:     '==',
                constraintValueMetres:  pointA.distanceTo(pointB),
            }
        );

        const cmd = new CreateAnnotationCommand(element);
        // [E.5.x] Bus telemetry — fire-and-forget; legacy commandManager drives state during migration.
        // P13 (A36): typed payload so AnnotationsState receives the correct id/viewId/kind.
        if (window.runtime?.bus) { window.runtime.bus.executeCommand('annotation.create', { id: element.id, viewId: element.ownerViewId, kind: element.type as any }).catch(() => {}); }
        this._commandManager.execute(cmd);
        console.log('[LinearDimAnnotationTool] Created dimension', id, 'in view', this._activeViewId);
    }

    /**
     * §DIM-VI-1/VI-2 — Create a multi-segment (string) linear-dim annotation.
     *
     * All N refs share the same perpendicular offset.
     * `parameters.isString = true` flags the renderer to use drawString().
     * `parameters.segments` records per-ref indices for future per-segment label overrides.
     * `parameters.showEQ = true` lets the renderer display "EQ" for equal segments.
     */
    private _createStringDimension(
        chain: Array<{ ref: StableReference; point: THREE.Vector3 }>,
        offset: number
    ): void {
        // §ANN-VIEW: same 4-level fallback as _createDimension (including §ANN-VIEW-INFER)
        const effectiveViewId: string | null = this._activeViewId
            ?? window.annotationManager?.getActiveViewId?.()
            ?? window.viewController?.currentViewDefinitionId
            ?? (() => {
                const vds = window.viewDefinitionStore;
                if (vds?.getByType) {
                    const plans = vds.getByType('plan') as Array<{ id: string }>;
                    if (plans.length > 0) return plans[0]!.id;
                }
                return null;
            })();
        if (!effectiveViewId) {
            console.warn('[LinearDimAnnotationTool] No active view — string dimension not created');
            return;
        }
        if (!this._activeViewId) this._activeViewId = effectiveViewId;
        if (chain.length < 2) return;

        const id = crypto.randomUUID();

        const refs: StableReference[] = chain.map(({ ref, point }) => {
            const resolved = resolveReferenceToPoint(ref, this._resolverStores);
            return {
                ...ref,
                cachedPosition: resolved
                    ? { x: resolved.x, y: resolved.y, z: resolved.z }
                    : { x: point.x, y: point.y, z: point.z },
            };
        });

        const modelPoints = chain.map(({ point }) => ({ x: point.x, y: point.y, z: point.z }));

        const segments = chain.slice(1).map((_, i) => ({ refIndex: i + 1 }));

        // Compute total length for constraint baseline
        let totalLength = 0;
        for (let i = 1; i < chain.length; i++) {
            totalLength += chain[i]!.point.distanceTo(chain[i - 1]!.point);
        }

        const element = makeAnnotationElement(
            id,
            'linear-dim',
            effectiveViewId,
            refs,
            { modelPoints, offset },
            {
                unit:                  this._optionsBar?.unit ?? 'mm',
                isString:              true,
                segments,
                showEQ:                this._optionsBar?.showEQ ?? false,
                isLocked:              this._optionsBar?.isLocked ?? false,
                constraintType:        this._optionsBar?.constraintType ?? 'soft',
                constraintOperator:    '==',
                constraintValueMetres: totalLength,
            }
        );

        const cmd = new CreateAnnotationCommand(element);
        // [E.5.x] Bus telemetry — fire-and-forget; legacy commandManager drives state during migration.
        // P13 (A36): typed payload so AnnotationsState receives the correct id/viewId/kind.
        if (window.runtime?.bus) { window.runtime.bus.executeCommand('annotation.create', { id: element.id, viewId: element.ownerViewId, kind: element.type as any }).catch(() => {}); }
        this._commandManager.execute(cmd);
        console.log(
            '[LinearDimAnnotationTool] Created string dimension', id,
            'with', chain.length, 'refs,', chain.length - 1, 'segments'
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // §III-1 — Face highlight overlay
    //
    // A single THREE.LineSegments object forming a rectangle on the detected
    // wall face at the hover position. Geometry is updated in-place per frame —
    // no new allocations on mousemove.
    // ─────────────────────────────────────────────────────────────────────────

    private _ensureFaceHighlight(): THREE.LineSegments {
        if (this._faceHighlight) return this._faceHighlight;

        // 4 edges × 2 vertices = 8 positions
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 3), 3));

        this._highlightMat = new THREE.LineBasicMaterial({
            color: FACE_HIGHLIGHT_COLOR,
            depthTest: false,
            transparent: true,
            opacity: 0.85,
        });

        this._faceHighlight = new THREE.LineSegments(geo, this._highlightMat);
        this._faceHighlight.renderOrder = 998;
        this._faceHighlight.userData.isHelper  = true;
        this._faceHighlight.userData.isPreview = true;
        this._faceHighlight.visible = false;
        this._scene?.add(this._faceHighlight);
        return this._faceHighlight;
    }

    private _updateFaceHighlight(wallHit: WallFaceHit): void {
        const scene = this._scene;
        if (!scene) return;
        const hl = this._ensureFaceHighlight();

        const { facePoint, faceNormal, wallId } = wallHit;

        // Derive wall direction from face normal:
        // faceNormal = cross(wallDir, Y_UP) = (-wallDir.z, 0, wallDir.x)
        // → wallDir = (faceNormal.z, 0, -faceNormal.x)
        const wallDir = new THREE.Vector3(faceNormal.z, 0, -faceNormal.x).normalize();

        // Use wall height from store if available, else default to 3 m
        const wallData = this._resolverStores.wallStore?.getById?.(wallId);
        const wallH    = (wallData?.height as number | undefined) ?? 3.0;

        // Highlight strip: 0.5 m either side of the snap point along the wall
        const halfW = 0.5;
        const baseY = facePoint.y;

        const bl = facePoint.clone().addScaledVector(wallDir, -halfW).setY(baseY);
        const br = facePoint.clone().addScaledVector(wallDir,  halfW).setY(baseY);
        const tr = facePoint.clone().addScaledVector(wallDir,  halfW).setY(baseY + wallH);
        const tl = facePoint.clone().addScaledVector(wallDir, -halfW).setY(baseY + wallH);

        // 4 edges: bl–br, br–tr, tr–tl, tl–bl
        const posArr = new Float32Array([
            bl.x, bl.y, bl.z,   br.x, br.y, br.z,
            br.x, br.y, br.z,   tr.x, tr.y, tr.z,
            tr.x, tr.y, tr.z,   tl.x, tl.y, tl.z,
            tl.x, tl.y, tl.z,   bl.x, bl.y, bl.z,
        ]);

        const posAttr = hl.geometry.attributes.position as THREE.BufferAttribute;
        posAttr.array.set(posArr);
        posAttr.needsUpdate = true;
        hl.geometry.computeBoundingSphere();
        hl.visible = true;
    }

    private _hideFaceHighlight(): void {
        if (this._faceHighlight) this._faceHighlight.visible = false;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // §DIM-V-1/V-2 — Hover hint emission
    //
    // Constructs a DimHoverHint from the current tool state and dispatches it
    // to the registered callback (wired to AnnotationRenderLayer.setDimHoverHint).
    //
    // The face-quad geometry mirrors _updateFaceHighlight() exactly so the 2D
    // canvas overlay aligns with the Three.js LineSegments overlay.
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Build and emit a hover hint from the active wall hit + locked points.
     *
     * @param wallHit — current WallFaceHit if the cursor is over a wall, or null
     */
    private _emitHoverHint(wallHit: WallFaceHit | null): void {
        if (!this._hoverHintCallback) return;

        let faceQuad: DimHoverHint['faceQuad'] = null;

        if (wallHit) {
            const { facePoint, faceNormal, wallId } = wallHit;

            // Replicate the same geometry logic used by _updateFaceHighlight
            const wallDir = new THREE.Vector3(faceNormal.z, 0, -faceNormal.x).normalize();
            const wallData = this._resolverStores.wallStore?.getById?.(wallId);
            const wallH    = (wallData?.height as number | undefined) ?? 3.0;
            const halfW    = 0.5;
            const baseY    = facePoint.y;

            const bl = facePoint.clone().addScaledVector(wallDir, -halfW).setY(baseY);
            const br = facePoint.clone().addScaledVector(wallDir,  halfW).setY(baseY);
            const tr = facePoint.clone().addScaledVector(wallDir,  halfW).setY(baseY + wallH);
            const tl = facePoint.clone().addScaledVector(wallDir, -halfW).setY(baseY + wallH);

            faceQuad = {
                bl: { x: bl.x, y: bl.y, z: bl.z },
                br: { x: br.x, y: br.y, z: br.z },
                tr: { x: tr.x, y: tr.y, z: tr.z },
                tl: { x: tl.x, y: tl.y, z: tl.z },
            };
        }

        const pA = this._pointA;
        const pB = this._pointB;

        this._hoverHintCallback({
            faceQuad,
            lockedA: pA ? { x: pA.x, y: pA.y, z: pA.z } : null,
            lockedB: pB ? { x: pB.x, y: pB.y, z: pB.z } : null,
        });
    }

    private _disposeFaceHighlight(): void {
        if (!this._faceHighlight) return;
        this._scene?.remove(this._faceHighlight);
        this._faceHighlight.geometry.dispose();
        this._highlightMat?.dispose();
        this._faceHighlight  = null;
        this._highlightMat   = null;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // §III-3 / §III-4 — Live dimension preview
    //
    // Three Line objects (dim line + two witness lines) inside a Group.
    // Geometry is updated in-place — no per-frame allocations.
    // Witness lines are shown only when there is a meaningful offset.
    // ─────────────────────────────────────────────────────────────────────────

    private _ensurePreview(): void {
        if (this._previewGroup) return;
        const scene = this._scene;
        if (!scene) return;

        this._previewMat = new THREE.LineBasicMaterial({
            color: 0x6600ff,
            depthTest: false,
            transparent: true,
            opacity: 0.75,
        });

        const makeLine = (): THREE.Line => {
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(2 * 3), 3));
            const line = new THREE.Line(geo, this._previewMat!);
            line.renderOrder = 999;
            line.userData.isHelper  = true;
            line.userData.isPreview = true;
            line.visible = false;
            return line;
        };

        this._previewDimLine = makeLine();
        this._previewWitA    = makeLine();
        this._previewWitB    = makeLine();

        this._previewGroup = new THREE.Group();
        this._previewGroup.userData.isHelper  = true;
        this._previewGroup.userData.isPreview = true;
        this._previewGroup.add(this._previewDimLine, this._previewWitA, this._previewWitB);
        scene.add(this._previewGroup);
    }

    /** Update a single two-point Line geometry in-place */
    private _updateLine(line: THREE.Line | null, from: THREE.Vector3, to: THREE.Vector3): void {
        if (!line) return;
        const pos = line.geometry.attributes.position as THREE.BufferAttribute;
        pos.setXYZ(0, from.x, from.y, from.z);
        pos.setXYZ(1, to.x,   to.y,   to.z);
        pos.needsUpdate = true;
        line.geometry.computeBoundingSphere();
        line.visible = true;
    }

    /**
     * Update the live preview geometry.
     *
     * @param pA               - Reference point A (face snap or raw hit)
     * @param pB               - Reference point B (face snap, cursor, or raw hit)
     * @param offset           - Perpendicular offset; null → 0 (dim line coincides with ref line)
     * @param forceShowWitness - When true (DEFINE_OFFSET state), always render witness lines
     *                           — even at 0 offset — so the user can see this is still a preview
     *                           awaiting a placement click. A 10 cm stub is drawn when eff ≈ 0.
     */
    private _updatePreview(pA: THREE.Vector3, pB: THREE.Vector3, offset: number | null, forceShowWitness = false): void {
        this._ensurePreview();

        const eff = offset ?? 0;
        const up  = new THREE.Vector3(0, 1, 0);

        // §DIM-ORTHO: When wall A's face normal is known, use it as the
        // measurement direction so the dim line is always orthogonal to both
        // parallel walls — even when pA and pB were clicked at different
        // positions along the wall length.
        let dir: THREE.Vector3;
        if (this._wallANormal && this._wallANormal.length() > 0.001) {
            dir = this._wallANormal.clone();
        } else {
            dir = new THREE.Vector3().subVectors(pB, pA);
            dir.y = 0;
            if (dir.length() < 0.001) return;
            dir.normalize();
        }

        // side = wall direction (perpendicular to measurement axis in XZ plane)
        const side = new THREE.Vector3().crossVectors(dir, up).normalize();

        // §DIM-PROJ: When wall A normal is known, project pB onto the measurement
        // axis through pA. This eliminates any component of pB along the wall
        // direction that differs from pA — guaranteeing the dim line is always
        // perpendicular to both walls, regardless of where along the wall each
        // reference point was clicked.
        //
        //   pB_proj = pA + dir * (pB − pA)·dir
        //
        // This keeps only the measurement-direction component of (pB − pA), so
        // dA and dB always share the same wall-direction coordinate.
        let effectivePB = pB;
        if (this._wallANormal && this._wallANormal.length() > 0.001) {
            const measuredDist = new THREE.Vector3().subVectors(pB, pA).dot(dir);
            effectivePB = pA.clone().addScaledVector(dir, measuredDist);
        }

        // Dimension line endpoints: snap points offset in the wall direction by `eff`
        const dA = pA.clone().addScaledVector(side, eff);
        const dB = effectivePB.clone().addScaledVector(side, eff);

        this._updateLine(this._previewDimLine, dA, dB);

        // Witness lines shown when offset is non-trivial OR when forceShowWitness
        // is set (DEFINE_OFFSET state — always render to signal the preview is not placed).
        if (Math.abs(eff) > 0.001) {
            this._updateLine(this._previewWitA, pA, dA);
            // Witness B starts from the ACTUAL pB (wall B face click position)
            // and runs to dB, showing both the reference location and the offset.
            this._updateLine(this._previewWitB, pB, dB);
        } else if (forceShowWitness) {
            // §DIM-OFFSET-GUARD: draw a small 10 cm stub so witness lines are visible
            // even at 0 offset, making it clear a placement click is still required.
            const STUB = 0.10;
            const stubA = pA.clone().addScaledVector(side, STUB);
            const stubB = effectivePB.clone().addScaledVector(side, STUB);
            this._updateLine(this._previewWitA, pA, stubA);
            this._updateLine(this._previewWitB, pB, stubB);
        } else {
            if (this._previewWitA) this._previewWitA.visible = false;
            if (this._previewWitB) this._previewWitB.visible = false;
        }
    }

    private _hidePreview(): void {
        if (this._previewDimLine) this._previewDimLine.visible = false;
        if (this._previewWitA)    this._previewWitA.visible    = false;
        if (this._previewWitB)    this._previewWitB.visible    = false;
    }

    private _disposePreview(): void {
        if (!this._previewGroup) return;
        this._scene?.remove(this._previewGroup);
        [this._previewDimLine, this._previewWitA, this._previewWitB].forEach(line => {
            if (!line) return;
            line.geometry.dispose();
        });
        this._previewMat?.dispose();
        this._previewGroup   = null;
        this._previewDimLine = null;
        this._previewWitA    = null;
        this._previewWitB    = null;
        this._previewMat     = null;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Raycasting — full result including WallFaceDetector for wall hits
    // ─────────────────────────────────────────────────────────────────────────

    private _raycastFull(): RaycastResult | null {
        const world = this._world;
        if (!world?.camera || !world?.scene) return null;

        const camera = world.camera.three as THREE.Camera;
        this._raycaster.setFromCamera(this._mouse, camera);

        // Collect candidate meshes (semantic elements + selectable-flagged objects)
        // Exclude helper / preview objects to avoid self-hits
        const candidates: THREE.Object3D[] = [];
        world.scene.three.traverse((obj: THREE.Object3D) => {
            if (obj.userData?.isHelper || obj.userData?.isPreview) return;
            if (!obj.visible) return;
            const type = (obj.userData?.elementType || obj.userData?.type || '').toLowerCase();
            if (obj.userData?.selectable || (SEMANTIC_TYPES as readonly string[]).includes(type)) {
                candidates.push(obj);
            }
        });

        const hits = this._raycaster.intersectObjects(candidates, true);
        if (!hits.length) return null;

        for (const hit of hits) {
            const root = this._findSelectableRoot(hit.object);
            if (!root) continue;

            const rawPoint = hit.point.clone();
            const elType   = (root.userData.elementType || root.userData.type || '').toLowerCase();
            const openingSnap = this._findOpeningSnap(rawPoint, elType, root.userData.id as string | undefined);

            // §III-1: Wall hit → run WallFaceDetector for semantic face snap
            if (elType === 'wall' && root.userData.id) {
                const wallId   = root.userData.id as string;
                const wallData = this._resolverStores.wallStore?.getById?.(wallId);
                if (wallData) {
                    // §IV-1: use the face type currently selected in the options bar
                    const preferredFace = this._optionsBar?.preferredFaceType ?? 'face:exterior';
                    const wallHit = detectWallFace(hit.point, wallData, preferredFace);
                    return {
                        rawPoint,
                        wallHit: wallHit ?? undefined,
                        openingSnap,
                        selectableRoot: root,
                    };
                }
            }

            // Non-wall semantic element — return raw hit without face detection
            return { rawPoint, wallHit: undefined, openingSnap, selectableRoot: root };
        }

        // Nothing selectable — return first raw hit for free-point fallback
        const firstHit = hits[0];
        return firstHit
            ? { rawPoint: firstHit.point.clone(), wallHit: undefined, selectableRoot: null }
            : null;
    }

    private _findOpeningSnap(rawPoint: THREE.Vector3, hitType?: string, hitId?: string): RaycastResult['openingSnap'] {
        const candidates: Array<{ ref: StableReference; point: THREE.Vector3; sourceType: string; label: string; bias: number }> = [];
        const add = (sourceType: string, sourceId: string, label: string, point: THREE.Vector3, code: number, bias = 0): void => {
            candidates.push({ ref: makeRef(sourceType, sourceId, 'param', code), point, sourceType, label, bias });
        };
        const addHosted = (sourceType: 'window' | 'door', item: any): void => {
            const wall = this._resolverStores.wallStore?.getById?.(item.wallId);
            const bl = wall?.baseLine;
            if (!bl || bl.length < 2) return;
            const start = new THREE.Vector3(bl[0].x, bl[0].y, bl[0].z);
            const end = new THREE.Vector3(bl[1].x, bl[1].y, bl[1].z);
            const dir = new THREE.Vector3().subVectors(end, start);
            const len = dir.length();
            if (len < 0.001) return;
            dir.divideScalar(len);
            const prefix = sourceType === 'window' ? 'win' : 'door';
            const xDefs = [
                { name: 'Left', along: item.offset - item.width * 0.5, code: 0 },
                { name: 'Center', along: item.offset, code: 1 },
                { name: 'Right', along: item.offset + item.width * 0.5, code: 2 },
            ];
            const yDefs = [
                { name: 'Base', y: start.y, code: 0 },
                { name: sourceType === 'window' ? 'Sill' : 'Sill', y: start.y + (item.sillHeight ?? 0), code: 3 },
                { name: 'Top', y: start.y + (item.sillHeight ?? 0) + (item.height ?? 0), code: 6 },
                { name: 'Mid', y: start.y + (item.sillHeight ?? 0) + (item.height ?? 0) * 0.5, code: 9 },
            ];
            for (const xd of xDefs) {
                for (const yd of yDefs) {
                    const p = start.clone().addScaledVector(dir, xd.along).setY(yd.y);
                    add(sourceType, item.id, `${prefix}${xd.name}${yd.name}`, p, xd.code + yd.code, hitId === item.id ? -0.08 : 0);
                }
            }
        };

        for (const win of this._resolverStores.windowStore?.getAll?.() ?? []) addHosted('window', win);
        for (const door of this._resolverStores.doorStore?.getAll?.() ?? []) addHosted('door', door);
        for (const cw of this._resolverStores.curtainWallStore?.getAll?.() ?? []) {
            const bl = cw.baseLine;
            if (!bl || bl.length < 2) continue;
            const s = new THREE.Vector3(bl[0].x, bl[0].y, bl[0].z);
            const e = new THREE.Vector3(bl[1].x, bl[1].y, bl[1].z);
            add('curtain-wall', cw.id, 'curtainStart', s, 0, hitId === cw.id ? -0.08 : 0);
            add('curtain-wall', cw.id, 'curtainEnd', e, 1, hitId === cw.id ? -0.08 : 0);
            add('curtain-wall', cw.id, 'curtainMid', new THREE.Vector3().lerpVectors(s, e, 0.5), 0.5, hitId === cw.id ? -0.08 : 0);
        }
        for (const panel of this._resolverStores.curtainPanelStore?.getAll?.() ?? []) {
            const cw = this._resolverStores.curtainWallStore?.getById?.(panel.curtainWallId)
                ?? this._resolverStores.curtainWallStore?.get?.(panel.curtainWallId);
            const bl = cw?.baseLine;
            if (!bl || bl.length < 2) continue;
            const s = new THREE.Vector3(bl[0].x, bl[0].y, bl[0].z);
            const e = new THREE.Vector3(bl[1].x, bl[1].y, bl[1].z);
            const dir = new THREE.Vector3().subVectors(e, s);
            const len = dir.length();
            if (len < 0.001) continue;
            dir.divideScalar(len);
            const uLines = (cw.gridSystem?.uLines ?? []).map((l: any) => Number(l.t)).filter(Number.isFinite).sort((a: number, b: number) => a - b);
            const vLines = (cw.gridSystem?.vLines ?? []).map((l: any) => Number(l.t)).filter(Number.isFinite).sort((a: number, b: number) => a - b);
            const fallbackColumns = Math.max(1, Math.floor(len / Math.max(0.001, Number(cw.gridXSpacing ?? len))));
            const fallbackRows = Math.max(1, Math.floor(Number(cw.height ?? 3) / Math.max(0.001, Number(cw.gridYSpacing ?? cw.height ?? 3))));
            const columns = Math.max(1, uLines.length >= 2 ? uLines.length - 1 : fallbackColumns);
            const rows = Math.max(1, vLines.length >= 2 ? vLines.length - 1 : fallbackRows);
            const i = Math.max(0, Math.min(columns - 1, Number(panel.cellIndex?.[0] ?? 0)));
            const j = Math.max(0, Math.min(rows - 1, Number(panel.cellIndex?.[1] ?? 0)));
            const u0 = uLines.length >= 2 ? uLines[i] : i / columns;
            const u1 = uLines.length >= 2 ? uLines[i + 1] : (i + 1) / columns;
            const v0 = vLines.length >= 2 ? vLines[j] : j / rows;
            const v1 = vLines.length >= 2 ? vLines[j + 1] : (j + 1) / rows;
            const xs = [
                { name: 'Left', u: u0, code: 0 },
                { name: 'Center', u: (u0 + u1) * 0.5, code: 1 },
                { name: 'Right', u: u1, code: 2 },
            ];
            const ys = [
                { name: 'Base', v: v0, code: 0 },
                { name: 'Mid', v: (v0 + v1) * 0.5, code: 3 },
                { name: 'Top', v: v1, code: 6 },
            ];
            for (const x of xs) {
                for (const y of ys) {
                    const p = s.clone().addScaledVector(dir, len * x.u).setY(s.y + Number(cw.baseOffset ?? 0) + Number(cw.height ?? 3) * y.v);
                    add('curtain-panel', panel.id, `panel${x.name}${y.name}`, p, x.code + y.code, hitId === panel.id ? -0.08 : 0);
                }
            }
        }

        let best: typeof candidates[number] | null = null;
        let bestScore = Infinity;
        const maxDist = hitType === 'window' || hitType === 'door' || hitType === 'curtain-wall' || hitType === 'curtain-panel'
            ? 0.6
            : 0.28;
        for (const c of candidates) {
            const score = c.point.distanceTo(rawPoint) + c.bias;
            if (score < bestScore) {
                best = c;
                bestScore = score;
            }
        }
        return best && best.point.distanceTo(rawPoint) <= maxDist ? best : undefined;
    }

    /**
     * §DIM-GROUND: Intersect the cursor ray with a horizontal plane at the
     * elevation of pointA. Used as a fallback in DEFINE_OFFSET so the preview
     * remains visible when the cursor moves outside wall geometry.
     */
    private _intersectGroundPlane(): THREE.Vector3 | null {
        const world = this._world;
        if (!world?.camera) return null;
        const camera = world.camera.three as THREE.Camera;
        this._raycaster.setFromCamera(this._mouse, camera);
        const planeY = this._pointA?.y ?? 0;
        const plane  = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
        const target = new THREE.Vector3();
        return this._raycaster.ray.intersectPlane(plane, target) ? target : null;
    }

    private _findSelectableRoot(obj: THREE.Object3D): THREE.Object3D | null {
        let curr: THREE.Object3D | null = obj;
        while (curr) {
            const type = (curr.userData?.elementType || curr.userData?.type || '').toLowerCase();
            if (curr.userData?.id && (SEMANTIC_TYPES as readonly string[]).includes(type)) return curr;
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

    // ─────────────────────────────────────────────────────────────────────────
    // §III-6 — Status bar integration
    //
    // Dispatches a 'dim-tool-status' CustomEvent on window so any status bar
    // component can listen without coupling.  Emission is deduplicated to avoid
    // excessive DOM events on every mousemove frame.
    // ─────────────────────────────────────────────────────────────────────────

    private _emitStatus(message: string): void {
        if (message === this._lastStatus) return;
        this._lastStatus = message;
        window.dispatchEvent(new CustomEvent('dim-tool-status', { detail: { message } })); // TODO(TASK-15)
        if (message) console.log(`[LinearDimAnnotationTool] Status: ${message}`);
    }

    /**
     * Called from _onMouseMove to update the contextual status hint.
     * Only changes are dispatched (deduplication via _lastStatus).
     */
    private _updateStatusForState(wallHit: WallFaceHit | null): void {
        let msg: string;

        if (this._state === LinearDimToolState.PICK_WALL_A) {
            msg = wallHit
                ? `Click to anchor Point A — ${this._faceTypeLabel(wallHit.faceType)} face`
                : 'Hover over a wall to snap to a face. Click for Point A.';

        } else if (this._state === LinearDimToolState.PICK_WALL_B) {
            msg = wallHit
                ? `Click to anchor Point B — ${this._faceTypeLabel(wallHit.faceType)} face`
                : 'Hover over the second wall. Click for Point B.';

        } else if (this._state === LinearDimToolState.DEFINE_OFFSET) {
            // §IV-2: format the live distance in the currently selected unit.
            // §DIM-PROJ: When wall A normal is known, measure ONLY the component of
            // (pB − pA) along the wall normal — this is the true perpendicular gap
            // between the two parallel faces, regardless of where along the wall the
            // reference points were clicked.
            const unit = this._optionsBar?.unit ?? 'mm';
            const dist = (this._pointA && this._pointB)
                ? formatDimension(
                    this._wallANormal && this._wallANormal.length() > 0.001
                        ? Math.abs(new THREE.Vector3().subVectors(this._pointB, this._pointA).dot(this._wallANormal))
                        : this._pointA.distanceTo(this._pointB),
                    unit
                  )
                : '—';
            msg = `Distance: ${dist} — Move cursor to set offset, click to place  [Esc → back]`;

        } else {
            return;
        }

        this._emitStatus(msg);
    }

    private _faceTypeLabel(faceType: WallFaceType): string {
        const labels: Record<WallFaceType, string> = {
            'face:exterior':   'Exterior',
            'face:interior':   'Interior',
            'wall:centerline': 'Centerline',
            'core:exterior':   'Core Exterior',
            'core:interior':   'Core Interior',
            'core:centerline': 'Core Centerline',
        };
        return labels[faceType] ?? faceType;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Reset helper
    // ─────────────────────────────────────────────────────────────────────────

    private _reset(): void {
        this._refA         = null;
        this._refB         = null;
        this._pointA       = null;
        this._pointB       = null;
        this._liveOffset   = 0;
        this._wallANormal  = null;
        // §DIM-TAB-RESNAP: clear cached hover data
        this._lastHoverRawPoint = null;
        this._lastHoverWallId   = null;
        // §DIM-OFFSET-GUARD: clear moved flag
        this._defineOffsetMoved = false;
        // §DIM-VI-2: clear string chain state
        this._stringRefs   = [];
        this._stringOffset = 0;
        this._hideFaceHighlight();
        this._hidePreview();
        // §DIM-V: clear overlay (locked dots + face quad) whenever state is reset
        this._hoverHintCallback?.(null);
    }
}
