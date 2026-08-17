/**
 * ConsequencePreviewOverlay — R3 of docs/03-execution/plans/BIM30-REASONING-LOOP-PLAN.md
 * (was Phase K-2). ADR-0322 §3 · STR-06 §4.
 *
 * A floating DOM overlay that renders the one authoritative `ConsequencePlan`
 * (packages/command-bus/src/consequence.ts) for a proposed command — BEFORE it executes.
 * It displays:
 *   - the CHANGED set (how many elements the plan predicts will change),
 *   - REFUSED items, each with the numbers its reason sentence carries (never flattened),
 *   - and — critically — UNDETERMINED impact shown AS undetermined, never hidden. An
 *     honest blind spot is surfaced, not silently rendered as "nothing else changes"
 *     (ADR-0322 §5 — known + unknown = [] is the signature defect this overlay refuses).
 *
 * ── WHAT R3 CHANGED (the WIRE disposition, R0 recorded this overlay WIRE-PENDING-R3) ──
 * The overlay previously called `speculativeEngine.preview(action)` over a parallel
 * `SpeculativeAction` vocabulary. That engine's violation core was mined into the
 * `wall.move` planner (R2) and its preview path is retired (ADR-0323). The overlay now
 * reads a `ConsequencePlan` from a `ConsequencePreviewProvider` — the one contract type,
 * one preview implementation (ADR-0322 §8). It is a PURE DOM renderer of that plan: it
 * imports the provider INTERFACE, not any engine singleton, so it stays testable and
 * couples nothing at import.
 *
 * Activation: hover 300 ms debounce. Deactivation: cursor leave (immediate).
 * This module is a pure DOM overlay — no Three.js dependency.
 */

import type { ConsequencePlan, PreviewOutcome } from '@pryzm/command-bus';
import type {
  ConsequencePreviewProvider,
  PreviewCommand,
} from '@app/engine/consequence/ConsequencePreviewService';

const PANEL_ID = 'consequence-preview-panel';

// ── Style ─────────────────────────────────────────────────────────────────────
function buildPanel(): HTMLElement {
    const el = document.createElement('div');
    el.id = PANEL_ID;
    el.style.cssText = [
        'position:fixed;z-index:9000;pointer-events:none;',
        'max-width:340px;background:#1a2035;color:#e5e7eb;',
        'border-radius:10px;padding:14px 16px;font-size:12px;',
        'box-shadow:0 8px 32px rgba(0,0,0,0.4);',
        'border:1.5px solid rgba(102,0,255,0.45);',
        'font-family:var(--app-font,-apple-system,sans-serif);',
        'line-height:1.55;transition:opacity 0.12s;opacity:0;',
    ].join('');
    document.body.appendChild(el);
    return el;
}

function esc(s: string): string {
    return s.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'));
}

/**
 * Render the typed `undetermined` arm of a {@link PreviewOutcome} — the case where NO plan
 * exists at all.
 *
 * ⚠ This is deliberately NOT styled like an empty plan, and that distinction is the entire
 * point of §B.4. An empty plan is an ANSWER: "I looked, and nothing else is affected." This
 * is the absence of an answer. Rendering them alike — or rendering this one as nothing at
 * all, which is what the overlay did before — is the failure-as-emptiness defect at the
 * only place the user can actually see it. Amber, not purple: it is neither a success nor
 * a refusal, and it must not be mistaken for either.
 */
function renderUndetermined(
    panel: HTMLElement,
    reason: string,
    subReason: string | undefined,
    detail: string,
): void {
    // ⚠ BUILT AS DOM NODES, NOT `innerHTML`, and deliberately so. `detail` carries a
    // planner's raw throw message on the N5 arm (`previewPlannerThrew`) — arbitrary text
    // from arbitrary code, on a path that by definition only runs when something has
    // already gone wrong. `textContent` cannot be coaxed into markup, so the sink does not
    // exist rather than being escaped; `xssSinkScan` counts this file at 1 and this
    // function adds none. (An `esc()`-ed template would have been safe too, and would have
    // grown a ratchet that exists to stop exactly this kind of "just one more" — R7.)
    const row = (text: string, css: string): HTMLElement => {
        const d = document.createElement('div');
        d.style.cssText = css;
        d.textContent = text;
        return d;
    };

    panel.replaceChildren(
        row('▲ Consequence undetermined', 'font-weight:700;color:#fbbf24;margin-bottom:8px;'),
        row(
            'PRYZM could not work out what this would affect — this is NOT a claim that ' +
            'nothing would change.',
            'color:#fde68a;font-size:11px;margin-bottom:4px;',
        ),
        row('', 'height:6px;'),
        row(
            subReason ? `${reason} (${subReason})` : reason,
            'color:#fbbf24;font-size:11px;font-weight:700;',
        ),
        row(detail, 'color:#c9b896;font-size:11px;margin-top:2px;'),
    );
}

/**
 * Render a `ConsequencePlan`. The three load-bearing sections (ADR-0322): CHANGED (the
 * predicted mutation set), REFUSED (with the numbers), and UNDETERMINED (declared, never
 * hidden). `excluded` — considered-and-determined-unchanged — is shown as a quiet count so
 * the user sees the plan DID consider elements it is leaving alone.
 */
function renderPlan(panel: HTMLElement, plan: ConsequencePlan): void {
    const lines: string[] = [];

    lines.push(
        `<div style="font-weight:700;color:#c4b5fd;margin-bottom:8px;">` +
        `${esc(plan.command.type)}</div>`,
    );

    // CHANGED — the predicted mutation set.
    const changedCount = plan.changed.length;
    lines.push(
        `<div style="font-weight:700;color:#a78bfa;margin-bottom:4px;">` +
        `● ${changedCount} element${changedCount !== 1 ? 's' : ''} would change</div>`,
    );
    for (const id of plan.changed.slice(0, 4)) {
        lines.push(`<div style="color:#ddd6fe;font-size:11px;margin-bottom:2px;">↳ ${esc(id)}</div>`);
    }
    if (changedCount > 4) {
        lines.push(`<div style="color:#7a8aaa;font-size:11px;">+ ${changedCount - 4} more…</div>`);
    }

    // REFUSED — each carries its numbers in `reason` (never a generic string).
    if (plan.refused.length > 0) {
        lines.push('<div style="height:8px;"></div>');
        lines.push(
            `<div style="font-weight:700;color:#f87171;margin-bottom:4px;">` +
            `✕ ${plan.refused.length} refused</div>`,
        );
        for (const r of plan.refused.slice(0, 4)) {
            const who = r.elementId ? `${esc(r.elementId)}: ` : '';
            lines.push(`<div style="color:#fca5a5;font-size:11px;margin-bottom:2px;">↳ ${who}${esc(r.reason)}</div>`);
        }
    }

    // VALIDATION delta — new/resolved violations from the move (advisory).
    const created = plan.validation.violationsCreated.length;
    const resolved = plan.validation.violationsResolved.length;
    if (created > 0 || resolved > 0) {
        lines.push('<div style="height:8px;"></div>');
        if (created > 0) lines.push(`<div style="color:#fbbf24;font-size:11px;">▲ ${created} new violation${created !== 1 ? 's' : ''}</div>`);
        if (resolved > 0) lines.push(`<div style="color:#34d399;font-size:11px;">✓ ${resolved} violation${resolved !== 1 ? 's' : ''} resolved</div>`);
    }

    // UNDETERMINED — the honest blind spots. NEVER hidden: a consumer rendering a plan
    // MUST surface these (consequence.ts), or the overlay tells the user the move is
    // consequence-free when the truth is that a branch was never answered.
    if (plan.undetermined.length > 0) {
        lines.push('<div style="height:8px;"></div>');
        lines.push(
            `<div style="font-weight:700;color:#fbbf24;margin-bottom:4px;">` +
            `? ${plan.undetermined.length} impact${plan.undetermined.length !== 1 ? 's' : ''} UNDETERMINED</div>`,
        );
        for (const u of plan.undetermined.slice(0, 4)) {
            lines.push(
                `<div style="color:#fde68a;font-size:11px;margin-bottom:2px;">` +
                `↳ ${esc(u.scope)} — ${esc(u.reason)}</div>`,
            );
        }
        if (plan.undetermined.length > 4) {
            lines.push(`<div style="color:#7a8aaa;font-size:11px;">+ ${plan.undetermined.length - 4} more undetermined…</div>`);
        }
    }

    // EXCLUDED — considered and determined unchanged (a positive verdict).
    if (plan.excluded.length > 0) {
        lines.push(
            `<div style="color:#4b5563;font-size:10px;margin-top:8px;">` +
            `${plan.excluded.length} considered unchanged</div>`,
        );
    }

    panel.innerHTML = lines.join('');
}

// ── ConsequencePreviewOverlay ─────────────────────────────────────────────────

export class ConsequencePreviewOverlay {
    private _panel: HTMLElement;
    private _visible = false;
    private _hoverTimer: ReturnType<typeof setTimeout> | null = null;
    /** Monotonic token so a stale async preview never renders over a newer one. */
    private _requestSeq = 0;
    /**
     * Last known client cursor position, tracked from a global mousemove. The overlay
     * positions itself from THIS, not from the coordinates on the event — a live tool
     * caller (e.g. the plan Move drag-preview seam) works in world space and has no client
     * coordinates to hand over, so the overlay sources them itself and follows the cursor.
     */
    private _lastMouse: { x: number; y: number } = { x: 0, y: 0 };

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    /**
     * The preview capability. Injected so the overlay imports no engine singleton (it holds
     * only the provider INTERFACE) — production passes the composed
     * `ConsequencePreviewService`, tests pass a fake. Absent ⇒ the overlay renders nothing,
     * which is the honest state before a planner is composed for the hovered command.
     */
    private readonly _previewService: ConsequencePreviewProvider | null;

    constructor(
        runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null,
        previewService: ConsequencePreviewProvider | null = null,
    ) {
        this.runtime = runtime;
        this._previewService = previewService;
        this._panel = buildPanel();
        this._wireGlobalEvents();
        console.log('[ConsequencePreviewOverlay] Initialised' + (previewService ? ' (preview service wired)' : ' (no preview service — inert)'));
    }

    /**
     * Call this when the user starts hovering over an element with a move/destructive tool
     * active. 300 ms debounce (per spec), then the plan is computed via the preview service
     * and rendered. The compute is READ-ONLY — no mutation, no dispatch (ADR-0322 §3).
     */
    schedulePreview(command: PreviewCommand, mouseX?: number, mouseY?: number): void {
        if (Number.isFinite(mouseX) && Number.isFinite(mouseY)) {
            this._lastMouse = { x: mouseX as number, y: mouseY as number };
        }
        this._cancelScheduled();
        const seq = ++this._requestSeq;
        this._hoverTimer = setTimeout(() => {
            this._hoverTimer = null;
            void this._computeAndShow(command, seq);
        }, 300);
    }

    private async _computeAndShow(command: PreviewCommand, seq: number): Promise<void> {
        if (!this._previewService) return;
        let outcome: PreviewOutcome;
        try {
            outcome = await this._previewService.preview(command);
        } catch (e) {
            // The service now converts a planner throw into an `undetermined` outcome
            // (N5), so reaching here means the SERVICE itself failed — a fault above the
            // planner. Still shown rather than swallowed: §B.4's whole point is that the
            // overlay never goes quiet about a question it could not answer.
            console.warn('[ConsequencePreviewOverlay] preview failed:', e);
            if (seq !== this._requestSeq) return;
            this._showUndetermined(
                'PREVIEW_SERVICE_THREW',
                undefined,
                e instanceof Error ? e.message : String(e),
            );
            return;
        }
        // A newer hover (or a hide) superseded this request while it was in flight.
        if (seq !== this._requestSeq) return;

        // ⚠ §B.4 — the branch this method used to lack. `if (!plan) return;` left the
        // panel hidden, and a hidden panel is read as "this move affects nothing". That
        // is the founder's defect in one line: "nothing happened" and "I could not work
        // it out" rendered identically, and only one of them is safe to act on.
        if (outcome.kind === 'undetermined') {
            this._showUndetermined(outcome.reason, outcome.subReason, outcome.detail);
            return;
        }
        this._show(outcome.plan);
    }

    /** Render the typed `undetermined` arm — an ANSWER, visually distinct from a plan. */
    private _showUndetermined(reason: string, subReason: string | undefined, detail: string): void {
        renderUndetermined(this._panel, reason, subReason, detail);
        this._reposition(this._lastMouse.x, this._lastMouse.y);
        this._panel.style.opacity = '1';
        this._visible = true;
    }

    /** Hide immediately (call on mouseLeave). */
    hide(): void {
        this._cancelScheduled();
        // Invalidate any in-flight async preview so it cannot render after a leave.
        this._requestSeq++;
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

    private _show(plan: ConsequencePlan): void {
        renderPlan(this._panel, plan);
        this._reposition(this._lastMouse.x, this._lastMouse.y);
        this._panel.style.opacity = '1';
        this._visible = true;
    }

    /** Position near the cursor, kept inside the viewport. */
    private _reposition(mouseX: number, mouseY: number): void {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let x = mouseX + 18;
        let y = mouseY - 10;
        if (x + 350 > vw) x = mouseX - 350;
        if (y + 220 > vh) y = vh - 230;
        this._panel.style.left = `${x}px`;
        this._panel.style.top  = `${y}px`;
    }

    private _wireGlobalEvents(): void {
        // F.events.14 — pryzm-consequence-preview. `action` is typed `unknown` on the event
        // registry; R3 carries a `PreviewCommand` through it (the SAME (type,payload) the bus
        // dispatches — ADR-0324 §1), replacing the retired SpeculativeAction.
        window.runtime?.events?.on('pryzm-consequence-preview', ({ action, mouseX, mouseY }: { action: unknown; mouseX: number; mouseY: number }) => {
            const command = action as PreviewCommand | undefined;
            if (command && typeof command.type === 'string' && mouseX !== undefined) {
                this.schedulePreview(command, mouseX, mouseY);
            }
        });

        // F.events.14 — pryzm-consequence-hide.
        window.runtime?.events?.on('pryzm-consequence-hide', () => {
            this.hide();
        });

        // Always track the cursor — the panel sources its position from here (a live tool
        // caller has no client coordinates to pass), and follows the pointer while visible.
        document.addEventListener('mousemove', (e) => {
            this._lastMouse = { x: e.clientX, y: e.clientY };
            if (this._visible) this._reposition(e.clientX, e.clientY);
        });
    }
}

// ── Convenience helpers used by tools ─────────────────────────────────────────

/**
 * triggerConsequencePreview — called by a tool's hover/drag-intent handler to fire the
 * preview pipeline. Emits the `PreviewCommand` picked up by ConsequencePreviewOverlay.
 *
 * Usage in a wall-move handle's mouseenter handler:
 *   triggerConsequencePreview(
 *     { type: 'wall.updateBaseline', payload: { wallId, newBaseLine } },
 *     e.clientX, e.clientY,
 *   );
 */
export function triggerConsequencePreview(
    command: PreviewCommand,
    mouseX = Number.NaN,
    mouseY = Number.NaN,
): void {
    // NaN coordinates ⇒ the overlay positions from its own tracked cursor (a live tool
    // caller works in world space and has no client coordinates to pass).
    window.runtime?.events?.emit('pryzm-consequence-preview', { action: command, mouseX, mouseY }); // F.events.14
}

export function hideConsequencePreview(): void {
    window.runtime?.events?.emit('pryzm-consequence-hide', {}); // F.events.14
}

/**
 * wireToolForConsequencePreview — attach mouseenter/mouseleave listeners to a DOM element
 * (e.g. a move-handle hit target) so hovering it fires the consequence preview for a
 * candidate command.
 *
 * `buildCommand` is invoked at hover time so the caller can compute the candidate baseline
 * from the current pointer/gizmo state.
 */
export function wireToolForConsequencePreview(
    el: HTMLElement,
    buildCommand: () => PreviewCommand,
): void {
    el.addEventListener('mouseenter', (e) => {
        triggerConsequencePreview(buildCommand(), (e as MouseEvent).clientX, (e as MouseEvent).clientY);
    });
    el.addEventListener('mouseleave', () => {
        hideConsequencePreview();
    });
}
