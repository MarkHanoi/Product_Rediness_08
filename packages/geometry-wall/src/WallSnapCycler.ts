/**
 * @file WallSnapCycler.ts
 *
 * CONTRACT §04-13 — TAB Snap Reference Cycling
 * ─────────────────────────────────────────────────────────────────────────────
 * Revit-style TAB-key snap reference cycling for the WallTool.
 *
 * When the user presses TAB during DRAWING state (non-ortho modes), this module
 * collects geometric references near the current cursor position and cycles
 * through them, allowing the user to disambiguate overlapping snap targets.
 *
 * REFERENCES COLLECTED (in priority order):
 *   1. Wall endpoints (baseLine[0], baseLine[1])
 *   2. Wall midpoints
 *   3. Wall face intersection points (nearest point on perpendicular face)
 *
 * LAYER RULES (enforced by this module):
 *   - UI / Tool layer only.
 *   - Read-only access to WallStore (passed in constructor).
 *   - No store mutations.  No command calls.  No builder calls.
 *   - No scene-graph traversal — only semantic data from WallStore.
 *
 * LIFECYCLE:
 *   updateCandidates(cursor)  — called every pointer-move to refresh candidates
 *                               (only when not actively cycling).
 *   cycleNext()               — called on Tab key press; advances the index.
 *   reset()                   — called when a segment completes or cancel() fires.
 *   getLockedPoint()          — returns the currently-locked candidate, or null.
 *
 * RESET HEURISTIC:
 *   If the cursor moves more than RESET_THRESHOLD metres from the position where
 *   candidates were gathered, the cycler auto-resets on the next updateCandidates
 *   call so the user sees fresh candidates if they move significantly away.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { WallStore } from './WallStore';

const SEARCH_RADIUS = 1.5;          // metres — candidate search radius
const DEDUPLICATE_DIST = 0.05;      // metres — two points closer than this merge
const RESET_THRESHOLD = 0.4;        // metres — cursor displacement that resets cycling

export interface SnapCandidate {
    point: THREE.Vector3;
    label: string;        // e.g. "Endpoint", "Midpoint", "Face"
}

export class WallSnapCycler {
    private candidates: SnapCandidate[] = [];
    private currentIndex: number = -1;
    private lockedCandidate: SnapCandidate | null = null;
    private gatherPosition: THREE.Vector3 | null = null;

    constructor(private wallStore: WallStore) {}

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Refresh candidate list from current cursor position.
     * Only rebuilds if the cursor has moved significantly from the position at
     * which candidates were last gathered (prevents jumpy cycling mid-cycle).
     */
    updateCandidates(worldPoint: THREE.Vector3): void {
        // §2.11 Bug-C1 FIX: once the user has explicitly locked a candidate via
        // Tab (lockedCandidate !== null), NEVER auto-reset based on mouse movement.
        // The previous 0.4 m RESET_THRESHOLD silently dropped the lock before the
        // user could press Enter, causing closePolyline() to fire unexpectedly.
        // The lock is only released by an explicit reset() call (segment completion,
        // Escape, or a subsequent Tab press).
        if (this.lockedCandidate !== null) {
            return;
        }
        if (this.currentIndex >= 0) {
            // Gathering pass is active but not yet locked — still honour the
            // threshold so the candidate list refreshes if the user wanders far away.
            if (this.gatherPosition && this.gatherPosition.distanceTo(worldPoint) > RESET_THRESHOLD) {
                this.reset();
            } else {
                return;
            }
        }
        this.candidates = this.gatherCandidates(worldPoint);
        this.gatherPosition = worldPoint.clone();
    }

    /**
     * Advance to the next snap candidate.
     * Returns the newly-selected candidate, or null if no candidates exist.
     */
    cycleNext(): SnapCandidate | null {
        if (this.candidates.length === 0) return null;
        this.currentIndex = (this.currentIndex + 1) % this.candidates.length;
        this.lockedCandidate = this.candidates[this.currentIndex];
        return this.lockedCandidate;
    }

    /** Whether a candidate is currently locked via Tab cycling. */
    get isActive(): boolean {
        return this.lockedCandidate !== null;
    }

    /** Currently locked candidate, or null. */
    getLockedPoint(): THREE.Vector3 | null {
        return this.lockedCandidate?.point ?? null;
    }

    /** Label of the currently locked candidate (e.g. "Endpoint"), or null. */
    getLockedLabel(): string | null {
        return this.lockedCandidate?.label ?? null;
    }

    /** Number of candidates currently available. */
    getCandidateCount(): number {
        return this.candidates.length;
    }

    /**
     * Reset all cycling state.
     * Called by WallTool.cancel(), segment completion, and deactivation.
     */
    reset(): void {
        this.candidates = [];
        this.currentIndex = -1;
        this.lockedCandidate = null;
        this.gatherPosition = null;
    }

    dispose(): void {
        this.reset();
    }

    // ── Private ───────────────────────────────────────────────────────────────

    private gatherCandidates(origin: THREE.Vector3): SnapCandidate[] {
        const raw: SnapCandidate[] = [];

        for (const wall of this.wallStore.getAll()) {
            const [startPt, endPt] = wall.baseLine;
            const start = new THREE.Vector3(startPt.x, startPt.y, startPt.z);
            const end   = new THREE.Vector3(endPt.x, endPt.y, endPt.z);

            // ── Endpoints ────────────────────────────────────────────────────
            if (start.distanceTo(origin) <= SEARCH_RADIUS) {
                raw.push({ point: start.clone(), label: 'Endpoint' });
            }
            if (end.distanceTo(origin) <= SEARCH_RADIUS) {
                raw.push({ point: end.clone(), label: 'Endpoint' });
            }

            // ── Midpoint ─────────────────────────────────────────────────────
            const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
            if (mid.distanceTo(origin) <= SEARCH_RADIUS) {
                raw.push({ point: mid, label: 'Midpoint' });
            }

            // ── Nearest point on centreline ───────────────────────────────────
            // (the equivalent of Revit's "centerline" reference)
            const closest = this.closestPointOnSegment(origin, start, end);
            if (closest && closest.distanceTo(origin) <= SEARCH_RADIUS) {
                // Only add if meaningfully different from the endpoints/midpoint
                const isNearEndpoint = closest.distanceTo(start) < DEDUPLICATE_DIST * 2 ||
                                       closest.distanceTo(end) < DEDUPLICATE_DIST * 2 ||
                                       closest.distanceTo(mid) < DEDUPLICATE_DIST * 2;
                if (!isNearEndpoint) {
                    raw.push({ point: closest, label: 'Centerline' });
                }
            }
        }

        // Sort by distance from origin
        raw.sort((a, b) => a.point.distanceTo(origin) - b.point.distanceTo(origin));

        // Deduplicate
        const result: SnapCandidate[] = [];
        for (const c of raw) {
            const isDup = result.some(r => r.point.distanceTo(c.point) < DEDUPLICATE_DIST);
            if (!isDup) {
                result.push(c);
            }
        }

        return result;
    }

    private closestPointOnSegment(
        p: THREE.Vector3,
        a: THREE.Vector3,
        b: THREE.Vector3
    ): THREE.Vector3 | null {
        const ab = new THREE.Vector3().subVectors(b, a);
        const len2 = ab.lengthSq();
        if (len2 < 1e-10) return null;
        const t = Math.max(0, Math.min(1, new THREE.Vector3().subVectors(p, a).dot(ab) / len2));
        return a.clone().addScaledVector(ab, t);
    }
}
