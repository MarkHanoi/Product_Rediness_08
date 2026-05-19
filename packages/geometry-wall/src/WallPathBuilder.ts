import * as THREE from '@pryzm/renderer-three/three';
import { WallPath } from './PathResolver';

export type PathBuilderMode = "Line" | "Arc";

export class WallPathBuilder {
    private mode: PathBuilderMode = "Line";
    private points: THREE.Vector3[] = [];

    setMode(mode: PathBuilderMode) {
        this.mode = mode;
        this.points = [];
    }

    getMode(): PathBuilderMode {
        return this.mode;
    }

    addPoint(p: THREE.Vector3): WallPath | null {
        // If this is the first point of a new segment in polyline mode, just store it
        if (this.points.length === 0) {
            this.points.push(p);
            return null;
        }

        this.points.push(p);

        if (this.mode === "Line" && this.points.length === 2) {
            const path: WallPath = { kind: "Line", start: this.points[0].clone(), end: this.points[1].clone() };
            this.points = []; // Reset for next segment
            return path;
        }

        if (this.mode === "Arc" && this.points.length === 3) {
            // §WALL-SYSTEM-AUDIT-2026 — UNIFIED ARC INPUT METHOD
            // The 2nd click is interpreted as a point ON the arc (the arc passes
            // through it at t = 0.5), NOT as a literal Bézier control point.
            // This matches the Plan-View arc tool (WallPlanToolHandler._bezierControl)
            // and is the more intuitive / robust input convention used by AutoCAD,
            // Revit, and SketchUp ("3-point arc": start → middle-through → end).
            //
            // Quadratic Bézier passes through P0, P1, P2 with:
            //   P(0.5) = 0.25·P0 + 0.5·P1 + 0.25·P2 = midThrough
            //   ⟹ P1 = 2·midThrough − 0.5·(P0 + P2)
            const p0       = this.points[0].clone();
            const midThru  = this.points[1];
            const p2       = this.points[2].clone();
            const control = new THREE.Vector3(
                2 * midThru.x - 0.5 * (p0.x + p2.x),
                midThru.y,
                2 * midThru.z - 0.5 * (p0.z + p2.z),
            );
            const path: WallPath = {
                kind: "Arc",
                start: p0,
                end: p2,
                control,
            };
            this.points = []; // Reset for next segment
            return path;
        }

        return null;
    }

    getPoints(): THREE.Vector3[] {
        return this.points;
    }

    clear(): void {
        // §FIX: Reset mode to the default 'Line' so that a subsequent activate()
        // with a non-curved drawing mode does not inherit a stale 'Arc' mode from a
        // previous CURVED_WALL / POLYLINE_ARC session.  The explicit setMode('Arc')
        // calls in activate() and onPointerDown() restore Arc when it is needed.
        this.mode = 'Line';
        this.points = [];
    }
}
