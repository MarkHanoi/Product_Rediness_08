/**
 * @file WallDimensionInput.ts
 *
 * CONTRACT §04-12 — Typed Dimension Input
 * ─────────────────────────────────────────────────────────────────────────────
 * Revit-style keyboard dimension capture for the WallTool.
 *
 * While the WallTool is in DRAWING state, the user may type metre values
 * on the keyboard (e.g. "20.115" → 20.115 m).  This module:
 *   1. Captures digit / period / backspace keystrokes.
 *   2. Shows a floating HUD overlay with the typed value + mm conversion.
 *   3. Returns a locked world-space end-point on demand.
 *
 * LAYER RULES (enforced by this module):
 *   - UI / Tool layer only.
 *   - No store access.  No command calls.  No builder access.
 *   - The locked end-point is derived from the current cursor direction and
 *     the typed length; it is consumed by WallTool.onKeyDown (Enter) and
 *     passed straight to CreateWallCommand via WallTool.createWall().
 *   - This class has no knowledge of WallStore, BimManager, or CommandManager.
 *
 * INPUT FORMAT
 *   User types in metres (e.g. "5" → 5 m, "20.115" → 20.115 m).
 *   Decimal point is accepted for sub-metre precision.
 *   Negative values are not accepted — wall length must be > 0.
 *
 * KEYBOARD CONTRACT
 *   Digit (0–9)   → append to buffer
 *   Period (.)    → append if no decimal already present
 *   Backspace     → remove last character
 *   Escape        → clear buffer (returns true — caller must NOT deactivate the tool)
 *   Enter         → NOT handled here; caller checks isActive + getLengthMeters()
 *   Any other key → ignored (returns false — caller proceeds with normal handling)
 */

import * as THREE from '@pryzm/renderer-three/three';

export class WallDimensionInput {
    private buffer: string = '';
    private overlay: HTMLElement | null = null;

    // §04-12 FIX: canvas is accepted for API compatibility but no longer used to
    // parent the overlay (we use document.body + position:fixed to escape the
    // z-index:0 stacking context of #container).
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    constructor(_canvas: HTMLCanvasElement) {
        this.createOverlay();
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Whether the user has typed at least one digit.
     * WallTool checks this before deciding how to handle Enter / pointer-move.
     */
    get isActive(): boolean {
        return this.buffer.length > 0;
    }

    /**
     * Handle a single key press.
     * Returns true if the key was consumed (caller should call event.preventDefault()).
     * Returns false if the key is not relevant to dimension input.
     */
    handleKey(key: string): boolean {
        if (/^[0-9]$/.test(key)) {
            this.buffer += key;
            this.updateDisplay();
            return true;
        }

        if (key === '.' && !this.buffer.includes('.')) {
            this.buffer += key;
            this.updateDisplay();
            return true;
        }

        if (key === 'Backspace' && this.buffer.length > 0) {
            this.buffer = this.buffer.slice(0, -1);
            this.updateDisplay();
            return true;
        }

        // Escape while typing: clear the buffer so the tool does NOT deactivate.
        if (key === 'Escape' && this.buffer.length > 0) {
            this.reset();
            return true;
        }

        return false;
    }

    /**
     * Typed length in metres (input is already in metres), or null if the buffer
     * is empty or produces a non-positive number.
     */
    getLengthMeters(): number | null {
        if (!this.buffer || this.buffer === '.') return null;
        const m = parseFloat(this.buffer);
        if (isNaN(m) || m <= 0) return null;
        return m;
    }

    /**
     * Returns the locked end-point along the direction (startPoint → currentCursor)
     * at the typed distance, or null if there is no valid input or the cursor is
     * coincident with startPoint.
     */
    getLockedEndPoint(
        startPoint: THREE.Vector3,
        currentCursor: THREE.Vector3
    ): THREE.Vector3 | null {
        const length = this.getLengthMeters();
        if (length === null) return null;

        const dir = new THREE.Vector3().subVectors(currentCursor, startPoint);
        if (dir.length() < 0.001) return null;

        dir.normalize();
        return startPoint.clone().add(dir.multiplyScalar(length));
    }

    /** Current raw buffer string (metres), e.g. "20.115". */
    getRawBuffer(): string {
        return this.buffer;
    }

    /** Clear the buffer and hide the HUD. */
    reset(): void {
        this.buffer = '';
        this.updateDisplay();
    }

    dispose(): void {
        if (this.overlay && this.overlay.parentNode) {
            this.overlay.parentNode.removeChild(this.overlay);
        }
        this.overlay = null;
    }

    // ── Private ───────────────────────────────────────────────────────────────

    private createOverlay(): void {
        this.overlay = document.createElement('div');
        this.overlay.setAttribute('data-wall-dim-input', 'true');
        // §04-12 FIX: Use position:fixed on document.body so the overlay escapes
        // the z-index:0 stacking context created by #container.  The status bar
        // (position:fixed, z-index:1000) and platform-root (z-index:9990) live on
        // body; this overlay at z-index:5000 sits above the status bar but below
        // the platform-root (which is only active during auth/landing, not drawing).
        // bottom:165px clears the tallest possible status-bar layout (3 rows ≈ 145px).
        this.overlay.className = 'th-dim-overlay';
        document.body.appendChild(this.overlay);
    }

    private updateDisplay(): void {
        if (!this.overlay) return;

        if (this.buffer.length === 0) {
            this.overlay.style.display = 'none';
            return;
        }

        // Input is in metres — show mm equivalent as secondary reference.
        const m = parseFloat(this.buffer);
        const mmText = !isNaN(m)
            ? `<span class="th-dim-mm">(${Math.round(m * 1000)} mm)</span>`
            : '';

        this.overlay.innerHTML =
            `<span class="th-dim-label">Length</span>` +
            `<span style="letter-spacing:1px;">${this.escapeHtml(this.buffer)}</span>` +
            `<span class="th-dim-cursor">|</span>` +
            ` <span class="th-dim-unit">m</span> ${mmText}`;
        this.overlay.style.display = 'block';
    }

    private escapeHtml(str: string): string {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
}
