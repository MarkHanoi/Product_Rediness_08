/**
 * ConsequencePreviewOverlay — Phase K-2
 *
 * Phase:   K-2 (World Model Plan V3 — Consequence Preview System)
 * Contract: docs/00_PRZYM/PRYZM_World_Model_Plan_V3_Complete.md §K-2
 *
 * Shows a floating DOM overlay when the user hovers over an element with
 * a destructive tool active. Displays:
 *   - New compliance violations that would be introduced (red)
 *   - Violations that would be resolved (green)
 *   - Semantic relationships that would be severed (orange)
 *
 * Activation: hover 300ms delay.
 * Deactivation: cursor leave (immediate).
 * Computation: SpeculativeEngine.preview() at tool activation time (not per move).
 * Spec: < 50ms for ≤ 500 elements.
 *
 * This module is a pure DOM overlay — no Three.js dependency.
 */

import { speculativeEngine, type ConsequencePreview, type SpeculativeAction, type SpeculativeActionType } from '@pryzm/speculative-engine';

const PANEL_ID = 'consequence-preview-panel';

// ── Style ─────────────────────────────────────────────────────────────────────
function buildPanel(): HTMLElement {
    const el = document.createElement('div');
    el.id = PANEL_ID;
    el.style.cssText = [
        'position:fixed;z-index:9000;pointer-events:none;',
        'max-width:320px;background:#1a2035;color:#e5e7eb;',
        'border-radius:10px;padding:14px 16px;font-size:12px;',
        'box-shadow:0 8px 32px rgba(0,0,0,0.4);',
        'border:1.5px solid rgba(220,38,38,0.4);',
        'font-family:var(--app-font,-apple-system,sans-serif);',
        'line-height:1.55;transition:opacity 0.12s;opacity:0;',
    ].join('');
    document.body.appendChild(el);
    return el;
}

function formatViolation(v: { message: string; severity: string }): string {
    const icon = v.severity === 'error' ? '🔴' : '🟡';
    return `${icon} ${v.message}`;
}

function renderPreview(panel: HTMLElement, preview: ConsequencePreview): void {
    const lines: string[] = [];

    if (preview.newViolations.length > 0) {
        lines.push(`<div style="font-weight:700;color:#f87171;margin-bottom:6px;">▲ ${preview.newViolations.length} new violation${preview.newViolations.length !== 1 ? 's' : ''}</div>`);
        for (const v of preview.newViolations.slice(0, 4)) {
            lines.push(`<div style="color:#fca5a5;margin-bottom:3px;font-size:11px;">${formatViolation(v)}</div>`);
        }
        if (preview.newViolations.length > 4) {
            lines.push(`<div style="color:#7a8aaa;font-size:11px;">+ ${preview.newViolations.length - 4} more…</div>`);
        }
    }

    if (preview.resolvedViolations.length > 0) {
        if (lines.length > 0) lines.push('<div style="height:8px;"></div>');
        lines.push(`<div style="font-weight:700;color:#34d399;margin-bottom:6px;">✓ ${preview.resolvedViolations.length} violation${preview.resolvedViolations.length !== 1 ? 's' : ''} resolved</div>`);
    }

    if (preview.severedRelationships.length > 0) {
        if (lines.length > 0) lines.push('<div style="height:8px;"></div>');
        lines.push(`<div style="font-weight:700;color:#fb923c;margin-bottom:6px;">⊗ ${preview.severedRelationships.length} semantic link${preview.severedRelationships.length !== 1 ? 's' : ''} severed</div>`);
        for (const rel of preview.severedRelationships.slice(0, 3)) {
            lines.push(`<div style="color:#fdba74;font-size:11px;margin-bottom:2px;">↳ ${rel.type}: ${rel.targetId.slice(0, 12)}…</div>`);
        }
    }

    if (lines.length === 0) {
        lines.push('<div style="color:#34d399;">✓ No new violations</div>');
    }

    lines.push(`<div style="color:#4b5563;font-size:10px;margin-top:8px;border-top:1px solid #2d3650;padding-top:6px;">Computed in ${preview.computeTimeMs.toFixed(1)}ms</div>`);

    panel.innerHTML = lines.join('');
}

// ── ConsequencePreviewOverlay ─────────────────────────────────────────────────

export class ConsequencePreviewOverlay {
    private _panel: HTMLElement;
    private _visible = false;
    private _hoverTimer: ReturnType<typeof setTimeout> | null = null;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        this._panel = buildPanel();
        this._wireGlobalEvents();
        console.log('[ConsequencePreviewOverlay] Initialised');
    }

    /**
     * Call this when the user starts hovering over an element with a destructive
     * tool active. The element type + ID are used to compute the preview.
     * 300ms debounce before showing (per spec).
     */
    schedulePreview(
        action: SpeculativeAction,
        mouseX: number,
        mouseY: number,
    ): void {
        this._cancelScheduled();
        this._hoverTimer = setTimeout(() => {
            this._hoverTimer = null;
            const preview = speculativeEngine.preview(action);
            this._show(preview, mouseX, mouseY);
        }, 300);
    }

    /** Hide immediately (call on mouseLeave). */
    hide(): void {
        this._cancelScheduled();
        if (this._visible) {
            this._panel.style.opacity = '0';
            this._visible = false;
        }
    }

    private _cancelScheduled(): void {
        if (this._hoverTimer) {
            clearTimeout(this._hoverTimer);
            this._hoverTimer = null;
        }
    }

    private _show(preview: ConsequencePreview, mouseX: number, mouseY: number): void {
        renderPreview(this._panel, preview);

        // Position near cursor, but keep inside viewport
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let x = mouseX + 18;
        let y = mouseY - 10;
        if (x + 330 > vw) x = mouseX - 330;
        if (y + 200 > vh) y = vh - 210;

        this._panel.style.left = `${x}px`;
        this._panel.style.top  = `${y}px`;
        this._panel.style.opacity = '1';
        this._visible = true;
    }

    private _wireGlobalEvents(): void {
        // F.events.14 — pryzm-consequence-preview migrated from DOM CustomEvent to runtime.events.
        window.runtime?.events?.on('pryzm-consequence-preview', ({ action, mouseX, mouseY }: { action: unknown; mouseX: number; mouseY: number }) => {
            if (action && mouseX !== undefined) {
                this.schedulePreview(action as SpeculativeAction, mouseX, mouseY);
            }
        });

        // F.events.14 — pryzm-consequence-hide migrated from DOM CustomEvent to runtime.events.
        window.runtime?.events?.on('pryzm-consequence-hide', () => {
            this.hide();
        });

        // Also wire to mouse move on canvas so we can track cursor position
        document.addEventListener('mousemove', (e) => {
            if (!this._visible) return;
            // Update panel position on mouse move when visible
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            let x = e.clientX + 18;
            let y = e.clientY - 10;
            if (x + 330 > vw) x = e.clientX - 330;
            if (y + 200 > vh) y = vh - 210;
            this._panel.style.left = `${x}px`;
            this._panel.style.top  = `${y}px`;
        });
    }
}

// ── Convenience helper used by tools ─────────────────────────────────────────

/**
 * triggerConsequencePreview — called by toolbar tool handlers to fire the
 * preview pipeline. Dispatches the global event picked up by ConsequencePreviewOverlay.
 *
 * Usage in a tool's mouseenter handler:
 *   triggerConsequencePreview({ type: 'delete-wall', elementId: id }, e.clientX, e.clientY);
 */
export function triggerConsequencePreview(
    action: SpeculativeAction,
    mouseX: number,
    mouseY: number,
): void {
    window.runtime?.events?.emit('pryzm-consequence-preview', { action, mouseX, mouseY }); // F.events.14
}

export function hideConsequencePreview(): void {
    window.runtime?.events?.emit('pryzm-consequence-hide', {}); // F.events.14
}

/**
 * wireToolForConsequencePreview — attaches mouseover/mouseleave listeners to
 * an element so hovering it fires the consequence preview pipeline.
 *
 * Usage:
 *   wireToolForConsequencePreview(meshEl, 'delete-element', wallId);
 */
export function wireToolForConsequencePreview(
    el: HTMLElement,
    actionType: SpeculativeActionType,
    elementId: string,
    extraParams?: Record<string, unknown>,
): void {
    el.addEventListener('mouseenter', (e) => {
        triggerConsequencePreview(
            { type: actionType, elementId, params: extraParams },
            (e as MouseEvent).clientX,
            (e as MouseEvent).clientY,
        );
    });
    el.addEventListener('mouseleave', () => {
        hideConsequencePreview();
    });
}
