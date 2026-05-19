/**
 * PolylineModel — pure data layer for the 2D stair path tool.
 *
 * Stores committed world-space points (XZ plane) and provides
 * a preview path that includes the live cursor position.
 *
 * No DOM, no canvas, no Three.js — only plain data operations.
 */

/** A 2D point in world-space XZ coordinates (Y=0 in plan view). */
export interface Point2D {
    x: number; // world X
    z: number; // world Z
}

export class PolylineModel {
    private _committed: Point2D[] = [];

    // ── Mutations ─────────────────────────────────────────────────────────────

    /** Append a confirmed world-space point to the polyline. */
    addPoint(pt: Point2D): void {
        this._committed.push({ x: pt.x, z: pt.z });
    }

    /** Remove the last committed point (Ctrl+Z light undo). */
    removeLast(): void {
        this._committed.pop();
    }

    /** Clear all committed points. */
    clear(): void {
        this._committed = [];
    }

    // ── Queries ───────────────────────────────────────────────────────────────

    /** Snapshot of committed points (read-only view). */
    get points(): Point2D[] {
        return this._committed.slice();
    }

    get count(): number {
        return this._committed.length;
    }

    get last(): Point2D | null {
        return this._committed.length > 0
            ? { ...this._committed[this._committed.length - 1] }
            : null;
    }

    get first(): Point2D | null {
        return this._committed.length > 0
            ? { ...this._committed[0] }
            : null;
    }

    /**
     * Returns the full preview path: committed points plus the live cursor.
     * When there are no committed points, returns just the cursor (if given).
     */
    getPreviewPath(cursor: Point2D): Point2D[] {
        return [...this._committed, { x: cursor.x, z: cursor.z }];
    }

    /**
     * Number of segments in the committed polyline.
     * Segments = committed points − 1.
     */
    get segmentCount(): number {
        return Math.max(0, this._committed.length - 1);
    }

    /**
     * Returns the committed segments as pairs of [start, end] points.
     */
    getSegments(): Array<{ start: Point2D; end: Point2D }> {
        const segs: Array<{ start: Point2D; end: Point2D }> = [];
        for (let i = 0; i < this._committed.length - 1; i++) {
            segs.push({ start: this._committed[i], end: this._committed[i + 1] });
        }
        return segs;
    }
}
