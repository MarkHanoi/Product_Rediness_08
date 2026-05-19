import * as THREE from '@pryzm/renderer-three/three';
import { StairData, StairShape, StairFlight, StairLanding, DEFAULT_STAIR_PROPERTIES, Vec3 } from './StairTypes';
import { StairMeshBuilder } from './StairMeshBuilder';

export enum StairCreationPhase {
    StartPoint,
    FirstFlight,
    FirstLanding,
    SecondFlight,
    Complete
}

export class StairCreationController {
    private phase: StairCreationPhase = StairCreationPhase.StartPoint;
    private startPosition: THREE.Vector3 | null = null;
    private dir1: THREE.Vector3 | null = null;
    private dir2: THREE.Vector3 | null = null;
    private landingPos: THREE.Vector3 | null = null;

    private shape: StairShape = 'I';
    private width: number = 1.0;
    private riserHeight: number = 0.17;
    private treadDepth: number = 0.28;

    // ── Shape-control parameters (bugs 4, 6, 7) ──────────────────────────────
    private _turnDirection: 'left' | 'right' = 'left';
    private _secondRunSide: 'left' | 'right' = 'left';
    private _stepsBeforeLanding: number | null = null;

    private _targetBaseLevelId: string = '';
    private _targetTopLevelId: string = '';
    private _typeId: string = 'monolithic';

    /**
     * Drawing mode for the first-flight direction.
     *  - 'ortho'  → snap dir1 to the nearest 90° axis (default — matches WallTool ortho).
     *  - 'linear' → free direction follows mouse exactly.
     * §42-ELEMENT-CREATION-HUD-CONTRACT — parity with Wall mode picker.
     */
    private _drawingMode: 'linear' | 'ortho' = 'ortho';

    private tempStairId: string = 'temp-preview-stair';

    /**
     * §STAIR-AUDIT-2026 F8 fix (FIXED 2026-04-25): elevations are no longer
     * snapshotted at construction time.  An optional `elevationProvider`
     * callback re-fetches the current base/top elevation on every preview
     * and on the final-input read, so a level inserted/edited/deleted
     * during a multi-second placement is reflected immediately.
     *
     * The legacy primitive-elevation constructor is kept so existing call
     * sites compile; new sites should pass an `elevationProvider`.
     */
    private elevationProvider?: () => { base: number; top: number };

    constructor(
        private meshBuilder: StairMeshBuilder,
        private baseLevelElevation: number,
        private topLevelElevation: number,
        elevationProvider?: () => { base: number; top: number },
    ) {
        this.elevationProvider = elevationProvider;
        console.log('[StairCreationController] Created. meshBuilder:', !!this.meshBuilder, 'live-elevation:', !!elevationProvider);
    }

    /**
     * §F8 fix: callers may also wire in (or replace) the elevation provider
     * after construction.  Useful when the StairTool first activates with
     * stale primitives and later upgrades to a live source.
     */
    setElevationProvider(provider: () => { base: number; top: number }): void {
        this.elevationProvider = provider;
    }

    /** §F8 fix: every consumer goes through this helper so the freshness
     * guarantee can never be bypassed by a future caller forgetting to
     * re-fetch. */
    private _currentElevations(): { base: number; top: number } {
        if (this.elevationProvider) {
            try {
                const e = this.elevationProvider();
                if (e && Number.isFinite(e.base) && Number.isFinite(e.top)) {
                    this.baseLevelElevation = e.base;
                    this.topLevelElevation  = e.top;
                    return e;
                }
            } catch (err) {
                console.warn('[StairCreationController] elevationProvider threw, falling back to last snapshot', err);
            }
        }
        return { base: this.baseLevelElevation, top: this.topLevelElevation };
    }

    getPhase(): StairCreationPhase {
        return this.phase;
    }

    setWidth(width: number): void {
        this.width = width;
    }

    setBaseLevelId(id: string): void {
        this._targetBaseLevelId = id;
    }

    setTopLevelId(id: string): void {
        this._targetTopLevelId = id;
    }

    setTypeId(typeId: string): void {
        this._typeId = typeId;
    }

    /**
     * Set the first-flight drawing mode.  Read on every onMouseMove —
     * never cached — so live mode-toggle would propagate immediately.
     */
    setDrawingMode(mode: 'linear' | 'ortho'): void {
        this._drawingMode = mode;
        console.log('[StairCreationController] Drawing mode →', mode);
    }

    getDrawingMode(): 'linear' | 'ortho' {
        return this._drawingMode;
    }

    getTypeId(): string {
        return this._typeId;
    }

    getBaseLevelId(): string {
        return this._targetBaseLevelId;
    }

    getTopLevelId(): string {
        return this._targetTopLevelId;
    }

    /** L-shape: set which direction the second run turns ('left' | 'right'). */
    setTurnDirection(dir: 'left' | 'right'): void {
        this._turnDirection = dir;
        this.updatePreview();
    }

    /** U-shape: set which side the second run is placed on ('left' | 'right'). */
    setSecondRunSide(side: 'left' | 'right'): void {
        this._secondRunSide = side;
        this.updatePreview();
    }

    /**
     * Override the number of risers in flight 1 (before the landing).
     * Pass null to restore the default even-split.
     */
    setStepsBeforeLanding(steps: number | null): void {
        this._stepsBeforeLanding = steps;
        this.updatePreview();
    }

    setShape(shape: StairShape) {
        this.shape = shape;
        this.reset();
    }

    reset() {
        this.phase = StairCreationPhase.StartPoint;
        this.startPosition = null;
        this.dir1 = null;
        this.dir2 = null;
        this.landingPos = null;
        if (this.meshBuilder) {
            this.meshBuilder.removeStair(this.tempStairId);
        }
    }

    onFirstClick(point: THREE.Vector3) {
        console.log('[StairCreationController] First click at:', point);
        this.startPosition = point.clone();
        this.phase = StairCreationPhase.FirstFlight;
    }

    onMouseMove(currentPoint: THREE.Vector3) {
        if (this.phase === StairCreationPhase.StartPoint) return;
        if (!this.startPosition) return;

        if (this.phase === StairCreationPhase.FirstFlight) {
            const dir = currentPoint.clone().sub(this.startPosition);
            if (dir.lengthSq() > 0.0001) {
                dir.y = 0;
                let normalized = dir.normalize();
                if (this._drawingMode === 'ortho') {
                    normalized = this._snapOrtho(normalized);
                }
                this.dir1 = normalized;
                this.updatePreview();
            }
        } else if (this.phase === StairCreationPhase.SecondFlight && this.landingPos) {
            if (this.shape === 'L' && this.dir1) {
                this.dir2 = this._computeLDir2(this.dir1);
            } else if (this.shape === 'U' && this.dir1) {
                this.dir2 = this.dir1.clone().negate();
            } else {
                const dir = currentPoint.clone().sub(this.landingPos);
                if (dir.lengthSq() > 0.0001) {
                    this.dir2 = dir.normalize();
                }
            }
            this.updatePreview();
        }
    }

    onConfirm() {
        console.log('[StairCreationController] Confirming phase:', this.phase, 'Shape:', this.shape);
        if (this.shape === 'I' && this.phase === StairCreationPhase.FirstFlight) {
            this.phase = StairCreationPhase.Complete;
        } else if ((this.shape === 'L' || this.shape === 'U') && this.phase === StairCreationPhase.FirstFlight && this.dir1 && this.startPosition) {
            this.phase = StairCreationPhase.SecondFlight;

            // §F8 fix: re-fetch elevations live, never read the stale snapshot.
            const { base, top } = this._currentElevations();
            const levelHeight   = top - base;
            const totalRisers   = Math.max(2, Math.round(levelHeight / this.riserHeight));
            const halfRisers    = this._computeFlightSplit(totalRisers).before;
            const flightLength  = halfRisers * this.treadDepth;
            this.landingPos = this.startPosition.clone().add(this.dir1.clone().multiplyScalar(flightLength));

            if (this.shape === 'L') {
                this.dir2 = this._computeLDir2(this.dir1);
            } else if (this.shape === 'U') {
                this.dir2 = this.dir1.clone().negate();
            }

            console.log('[StairCreationController] Moved to SecondFlight. Landing at:', this.landingPos);
        } else if (this.phase === StairCreationPhase.SecondFlight) {
            this.phase = StairCreationPhase.Complete;
        }
        console.log('[StairCreationController] New phase:', this.phase);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /**
     * Snap a horizontal direction to the nearest 90° world axis (+X, -X, +Z, -Z).
     * Mirrors the wall-tool ortho constraint.  Y component is dropped.
     */
    private _snapOrtho(dir: THREE.Vector3): THREE.Vector3 {
        const x = dir.x;
        const z = dir.z;
        if (Math.abs(x) >= Math.abs(z)) {
            return new THREE.Vector3(Math.sign(x) || 1, 0, 0);
        }
        return new THREE.Vector3(0, 0, Math.sign(z) || 1);
    }

    /** Compute the second-run direction for L-shape from dir1 and turnDirection. */
    private _computeLDir2(dir1: THREE.Vector3): THREE.Vector3 {
        // Left turn:  rotate dir1 by +90° around Y  → (-dir1.z,  0, +dir1.x)
        // Right turn: rotate dir1 by -90° around Y  → (+dir1.z,  0, -dir1.x)
        if (this._turnDirection === 'right') {
            return new THREE.Vector3(dir1.z, 0, -dir1.x).normalize();
        }
        return new THREE.Vector3(-dir1.z, 0, dir1.x).normalize();
    }

    /** Compute the perpendicular side vector for U-shape from dir1 and secondRunSide. */
    private _computeUPerpDir(dir1: THREE.Vector3): THREE.Vector3 {
        // Left side:  perpDir = (-dir1.z, 0, +dir1.x)
        // Right side: perpDir = (+dir1.z, 0, -dir1.x)
        if (this._secondRunSide === 'right') {
            return new THREE.Vector3(dir1.z, 0, -dir1.x).normalize();
        }
        return new THREE.Vector3(-dir1.z, 0, dir1.x).normalize();
    }

    /** Split total risers into before/after, honouring stepsBeforeLanding if set. */
    private _computeFlightSplit(totalRisers: number): { before: number; after: number } {
        if (this._stepsBeforeLanding !== null) {
            const before = Math.max(1, Math.min(totalRisers - 1, this._stepsBeforeLanding));
            return { before, after: totalRisers - before };
        }
        const before = Math.floor(totalRisers / 2);
        return { before, after: totalRisers - before };
    }

    private buildUShapeSecondFlightStart(
        startPos: THREE.Vector3,
        dir1: THREE.Vector3,
        half: number
    ): THREE.Vector3 {
        const firstFlightLength = half * this.treadDepth;
        const perpDir = this._computeUPerpDir(dir1);
        // Run 2 is placed DIRECTLY adjacent to Run 1 (no gap between them).
        // The landing (depth = 2*stair.width) spans BOTH runs, so no extra
        // perpDir gap is needed between the runs — offset = stair.width only.
        // Add treadDepth to the forward offset so that:
        //   - flight 2's first tread centre aligns with flight 1's last tread centre
        //   - startOverride forward = firstFlightLength + treadDepth, and after the
        //     first step of flight 2 (−treadDepth in reverse dir) the tread centre
        //     lands exactly at firstFlightLength — matching flight 1's last tread Z.
        return startPos.clone()
            .add(dir1.clone().multiplyScalar(firstFlightLength + this.treadDepth))
            .add(perpDir.clone().multiplyScalar(this.width));
    }

    private updatePreview() {
        if (!this.meshBuilder) {
            console.error('[StairCreationController] StairMeshBuilder not injected');
            return;
        }
        if (!this.startPosition || !this.dir1) return;

        // §F8 fix: re-fetch elevations live on every preview tick.
        const { base: baseE, top: topE } = this._currentElevations();
        const levelHeight = topE - baseE;
        const totalRisers = Math.max(2, Math.round(levelHeight / this.riserHeight));
        const adjRiserHeight = levelHeight / totalRisers;

        let flights: StairFlight[] = [];
        let landings: StairLanding[] = [];

        if (this.shape === 'I') {
            flights = [{
                direction: { x: this.dir1.x, y: this.dir1.y, z: this.dir1.z },
                riserCount: totalRisers
            }];
        } else if (this.shape === 'L') {
            const { before, after } = this._computeFlightSplit(totalRisers);
            const d2 = this.dir2 ?? this._computeLDir2(this.dir1);
            flights = [
                { direction: { x: this.dir1.x, y: this.dir1.y, z: this.dir1.z }, riserCount: before },
                { direction: { x: d2.x, y: d2.y, z: d2.z }, riserCount: after }
            ];
            landings = [{ depth: this.width }];
        } else if (this.shape === 'U') {
            const { before, after } = this._computeFlightSplit(totalRisers);
            const d2 = this.dir2 ?? this.dir1.clone().negate();
            const secondStart = this.buildUShapeSecondFlightStart(this.startPosition, this.dir1, before);
            flights = [
                { direction: { x: this.dir1.x, y: this.dir1.y, z: this.dir1.z }, riserCount: before },
                {
                    direction: { x: d2.x, y: d2.y, z: d2.z },
                    riserCount: after,
                    startOverride: { x: secondStart.x, y: secondStart.y, z: secondStart.z }
                }
            ];
            // BUG-FIX: preview must use depth: 2*width (was: this.width) to match getFinalInput
            landings = [{ depth: 2 * this.width }];
        }

        const now = new Date().toISOString();

        const tempStair: StairData = {
            id: this.tempStairId,
            type: 'stair',
            levelId: 'preview',
            baseLevelId: 'preview',
            topLevelId: 'preview',
            baseOffset: 0,
            topOffset: 0,
            shape: this.shape,
            startPosition: { x: this.startPosition.x, y: this.startPosition.y, z: this.startPosition.z },
            width: this.width,
            riserHeight: adjRiserHeight,
            treadDepth: this.treadDepth,
            riserCount: totalRisers,
            flights,
            landings,
            turnDirection: this._turnDirection,
            secondRunSide: this._secondRunSide,
            stepsBeforeLanding: this._stepsBeforeLanding ?? undefined,
            properties: { ...DEFAULT_STAIR_PROPERTIES },
            parameters: {},
            metadata: {
                createdAt: now,
                modifiedAt: now,
                version: 0,
                source: 'user'
            }
        };

        this.meshBuilder.updateStair(tempStair, true);
    }

    getFinalInput(): {
        baseLevelId: string;
        topLevelId: string;
        shape: StairShape;
        riserHeight: number;
        treadDepth: number;
        width: number;
        startPosition: Vec3;
        flights: { direction: Vec3; riserCount: number; startOverride?: Vec3 }[];
        landings: { depth: number }[];
        turnDirection?: 'left' | 'right';
        secondRunSide?: 'left' | 'right';
        stepsBeforeLanding?: number;
        typeId?: string;
    } | null {
        if (!this.startPosition || !this.dir1) return null;

        // §F8 fix: live elevations at commit-time, not at activation-time.
        const { base: baseE, top: topE } = this._currentElevations();
        const levelHeight = topE - baseE;
        const totalRisers = Math.max(2, Math.round(levelHeight / this.riserHeight));
        const adjRiserHeight = levelHeight / totalRisers;

        let flights: { direction: Vec3; riserCount: number; startOverride?: Vec3 }[] = [];
        let landings: { depth: number }[] = [];

        if (this.shape === 'I') {
            flights = [{
                direction: { x: this.dir1.x, y: this.dir1.y, z: this.dir1.z },
                riserCount: totalRisers
            }];
        } else if (this.shape === 'L') {
            const { before, after } = this._computeFlightSplit(totalRisers);
            const d2 = this.dir2 ?? this._computeLDir2(this.dir1);
            flights = [
                { direction: { x: this.dir1.x, y: this.dir1.y, z: this.dir1.z }, riserCount: before },
                { direction: { x: d2.x, y: d2.y, z: d2.z }, riserCount: after }
            ];
            landings = [{ depth: this.width }];
        } else if (this.shape === 'U') {
            const { before, after } = this._computeFlightSplit(totalRisers);
            const d2 = this.dir2 ?? this.dir1.clone().negate();
            const secondStart = this.buildUShapeSecondFlightStart(this.startPosition, this.dir1, before);
            flights = [
                { direction: { x: this.dir1.x, y: this.dir1.y, z: this.dir1.z }, riserCount: before },
                {
                    direction: { x: d2.x, y: d2.y, z: d2.z },
                    riserCount: after,
                    startOverride: { x: secondStart.x, y: secondStart.y, z: secondStart.z }
                }
            ];
            landings = [{ depth: 2 * this.width }];
        }

        return {
            baseLevelId: this._targetBaseLevelId,
            topLevelId: this._targetTopLevelId,
            shape: this.shape,
            riserHeight: adjRiserHeight,
            treadDepth: this.treadDepth,
            width: this.width,
            startPosition: { x: this.startPosition.x, y: this.startPosition.y, z: this.startPosition.z },
            flights,
            landings,
            turnDirection: this._turnDirection,
            secondRunSide: this._secondRunSide,
            stepsBeforeLanding: this._stepsBeforeLanding ?? undefined,
            typeId: this._typeId || undefined,
        };
    }
}
