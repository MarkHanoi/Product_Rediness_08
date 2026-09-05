/**
 * SaveUndoRedoHUD — Always-visible top-left Save / Undo / Redo controls
 *
 * CSS prefix: surh- (Save Undo Redo HUD)
 * CONTRACT §05 §3 — prefix claimed
 * CONTRACT §05 §6 — zero bim-* / @thatopen/ui elements; pure native HTML
 * CONTRACT §05 §7.6 — styles injected via AppTheme.ts SURH_STYLES constant
 * CONTRACT §06 §3 — additive component; no existing code modified
 *
 * Positioned fixed at top-left, to the right of the 52px vb-panel spine.
 * Dispatches pryzm-hub-action { action:'save' } for Save.
 * Uses commandManager for Undo / Redo.
 *
 * §UNDO-HISTORY-DROPDOWN (ADR-0341) — each of Undo and Redo now carries a caret
 * that opens a list of recent actions in plain language (the Revit / AutoCAD
 * history palette the founder asked for).
 *
 * ⚠ IT IS SEQUENTIAL JUMP-BACK (reading A), NOT SELECTIVE UNDO (reading B), AND
 * THE UI SAYS SO IN WORDS. Picking the 5th row undoes rows 1–5 — hovering a row
 * highlights every row from the top down to it, so the scope is visible BEFORE
 * the click, and the popover header states the rule outright. Undoing one
 * earlier action while keeping the later ones is NOT supported and must not be
 * implied: the reason is in `undoHistoryTimeline.ts`'s header (a ring-buffer
 * inverse is a positional assignment, and the legacy half is a whole-store
 * snapshot — replaying either out of order destroys the later edits rather than
 * removing the chosen one).
 */

export const SURH_STYLES = `
/* ── Save / Undo / Redo HUD (surh-) ──────────────────────────────────── */
.surh-bar {
    position: relative;
    display: flex;
    align-items: center;
    gap: 2px;
    pointer-events: auto;
    background: var(--app-panel-bg, #ffffff);
    border-radius: 24px;
    padding: 3px 4px;
    box-shadow: var(--app-shadow-card);
    user-select: none;
    box-sizing: border-box;
}

.surh-btn {
    width: 30px;
    height: 100%;
    min-height: 28px;
    border: none;
    background: transparent;
    color: var(--app-text-2, #5a6a85);
    cursor: pointer;
    border-radius: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition: background 0.15s, color 0.15s;
    flex-shrink: 0;
    font-family: var(--app-font);
    box-sizing: border-box;
}

.surh-btn:hover {
    background: var(--app-violet-soft, rgba(102,0,255,0.08));
    color: var(--app-accent, #6600FF);
}

.surh-btn:active {
    transform: scale(0.91);
}

.surh-btn svg {
    display: block;
    width: 14px;
    height: 14px;
    flex-shrink: 0;
}

.surh-divider {
    width: 1px;
    height: 14px;
    align-self: center;
    background: rgba(0,0,0,0.10);
    margin: 0 1px;
    flex-shrink: 0;
}

/* ── §UNDO-HISTORY-DROPDOWN (ADR-0341) — caret + history popover ──────────
   Every custom property below is declared in styles/tokens.ts. Checked
   against that file rather than assumed: §PANEL-BRAND-STANDARD (L-1740..
   L-1744) found nine phantom tokens in sibling panels rendering as neon,
   because an undeclared var() falls back to the browser's initial value and
   nothing warns. There is no --app-text-1 here for the same reason: the
   token is called --app-text. No black anywhere; accent is --app-accent
   (#6600FF). */
.surh-group {
    display: flex;
    align-items: center;
    gap: 0;
}

.surh-caret {
    width: 13px;
    height: 100%;
    min-height: 28px;
    border: none;
    background: transparent;
    color: var(--app-text-muted, #7a8aaa);
    cursor: pointer;
    border-radius: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    margin-left: -3px;
    transition: background 0.15s, color 0.15s;
    flex-shrink: 0;
    box-sizing: border-box;
}

.surh-caret:hover,
.surh-caret[aria-expanded="true"] {
    background: var(--app-violet-soft, rgba(102,0,255,0.08));
    color: var(--app-accent, #6600FF);
}

.surh-caret svg { display: block; width: 8px; height: 8px; }

.surh-btn[disabled],
.surh-caret[disabled] {
    opacity: 0.35;
    cursor: default;
    pointer-events: none;
}

.surh-pop {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: 10000;
    min-width: 264px;
    max-width: 340px;
    background: var(--app-panel-bg, #ffffff);
    border: 1px solid var(--app-border, #dde3f0);
    border-radius: var(--app-radius-md, 12px);
    box-shadow: var(--app-shadow-panel);
    font-family: var(--app-font);
    overflow: hidden;
    box-sizing: border-box;
}

.surh-pop-head {
    padding: 8px 11px 7px;
    border-bottom: 1px solid var(--app-border-light, #eef1f8);
}

.surh-pop-title {
    font-size: var(--app-font-size-h3, 11.7px);
    font-weight: 600;
    color: var(--app-text, #1a2035);
    letter-spacing: 0.01em;
}

/* The (A)-not-(B) statement. It is a permanent part of the panel, not a
   tooltip: a capability the product does not have must not be left to be
   inferred from silence. */
.surh-pop-note {
    margin-top: 3px;
    font-size: var(--app-font-size-label, 9.9px);
    line-height: 1.45;
    color: var(--app-text-muted, #7a8aaa);
}

.surh-pop-list {
    max-height: 302px;
    overflow-y: auto;
    padding: 4px 0;
}

.surh-row {
    display: flex;
    align-items: baseline;
    gap: 7px;
    width: 100%;
    border: 0;
    background: transparent;
    text-align: left;
    padding: 5px 11px;
    cursor: pointer;
    font-family: var(--app-font);
    box-sizing: border-box;
}

/* The SCOPE PREVIEW — every row from the top down to the hovered one is
   marked, because that is exactly the set the click will undo. Without it
   the list reads as "pick one thing", which is reading (B) and is a promise
   this product does not keep. */
.surh-row.is-in-scope {
    background: var(--app-violet-soft, rgba(102,0,255,0.08));
}

.surh-row.is-target {
    background: var(--app-violet-soft, rgba(102,0,255,0.08));
    box-shadow: inset 2px 0 0 var(--app-accent, #6600FF);
}

.surh-row-ord {
    flex-shrink: 0;
    width: 16px;
    font-size: var(--app-font-size-label, 9.9px);
    color: var(--app-text-muted, #7a8aaa);
    font-variant-numeric: tabular-nums;
}

.surh-row-body { flex: 1 1 auto; min-width: 0; }

.surh-row-label {
    font-size: var(--app-font-size-body, 10.8px);
    color: var(--app-text, #1a2035);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.surh-row.is-in-scope .surh-row-label,
.surh-row.is-target .surh-row-label { color: var(--app-accent, #6600FF); }

.surh-row-detail {
    font-size: var(--app-font-size-label, 9.9px);
    color: var(--app-text-muted, #7a8aaa);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.surh-pop-empty,
.surh-pop-foot {
    padding: 9px 11px;
    font-size: var(--app-font-size-label, 9.9px);
    color: var(--app-text-muted, #7a8aaa);
    line-height: 1.45;
}

.surh-pop-foot { border-top: 1px solid var(--app-border-light, #eef1f8); }
`;

const SAVE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
    <polyline points="17 21 17 13 7 13 7 21"/>
    <polyline points="7 3 7 8 15 8"/>
</svg>`;

const UNDO_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 7v5h5"/>
    <path d="M3.51 12A9 9 0 1 0 5 5.07"/>
</svg>`;

const REDO_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 7v5h-5"/>
    <path d="M20.49 12A9 9 0 1 1 19 5.07"/>
</svg>`;

// §UNDO-HISTORY-DROPDOWN (ADR-0341) — the "mini arrow below the icon".
const CARET_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="6 9 12 15 18 9"/>
</svg>`;

// Phase B.9 (S73-WIRE) — runtime threading per S72 §16.2 row B.9.
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
// §UNDO-HISTORY-DROPDOWN (ADR-0341) — the read-only projection of BOTH undo
// stacks and the sequential jump. Static import (this is L7 → L7); the undo
// path itself stays dynamically imported below, unchanged.
import {
    buildUndoTimeline,
    undoThrough,
    redoThrough,
    type UndoTimelineEntry,
    type UndoJumpOutcome,
} from '../engine/undo/undoHistoryTimeline.js';

/**
 * §UNDO-HISTORY-DROPDOWN — how many rows the popover renders.
 *
 * The ring buffer caps at 200 (C03 §4.2) and the legacy stack is unbounded, so
 * "render them all" is a real scroll-performance decision, not a hypothetical.
 * A truncated list MUST say it is truncated — a list that silently ends at 40
 * tells the user their earlier work is gone, which is the one thing an undo UI
 * must never imply.
 */
const MAX_ROWS = 40;

export class SaveUndoRedoHUD {
    readonly element: HTMLElement;

    /** Phase B.9 (S73-WIRE) — runtime threaded by parent (Layout.ts);
     *  `public readonly`, optional with default `null` for legacy boot. */
    public readonly runtime: PryzmRuntime | null;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;
        const bar = document.createElement('div');
        bar.className = 'surh-bar';

        const saveBtn = this._makeBtn('Save project (Ctrl+S)', SAVE_ICON, () => {
            window.runtime?.events?.emit('pryzm-hub-action', { action: 'save' }); // F.events.15
        });

        const divider = document.createElement('div');
        divider.className = 'surh-divider';

        // §OI-054 (2026-05-24) — route the buttons through the SINGLE unified undo
        // path (C03 §4.6 U-5). Previously this called `runtime.undoStack.undo()`
        // (snapshot stack, non-functional) or, when `runtime` was null, ONLY
        // `commandManager.undo()` — which NEVER consults the CommandBus ring buffer,
        // so the undo BUTTON could not undo plan-view (bus-only) elements ("UNDO:
        // history empty" — the live bug). performUndo() is ring-buffer-first with a
        // commandManager fallback, identical to the keyboard Ctrl+Z, so button and
        // keyboard can never diverge again.
        const undoBtn = this._makeBtn('Undo (Ctrl+Z)', UNDO_ICON, () => {
            void import('../engine/undo/performUndoRedo.js').then(m => m.performUndo());
        });

        const redoBtn = this._makeBtn('Redo (Ctrl+Y)', REDO_ICON, () => {
            void import('../engine/undo/performUndoRedo.js').then(m => m.performRedo());
        });

        // §UNDO-HISTORY-DROPDOWN (ADR-0341) — the caret sits BESIDE its button so
        // the plain click keeps its existing single-step meaning. Splitting the
        // control this way is deliberate: making the button itself open a menu
        // would have taken Ctrl+Z's mouse equivalent away from the founder.
        this._undoCaret = this._makeCaret('Recent actions', 'undo');
        this._redoCaret = this._makeCaret('Redoable actions', 'redo');

        bar.appendChild(saveBtn);
        bar.appendChild(divider);
        bar.appendChild(this._group(undoBtn, this._undoCaret));
        bar.appendChild(this._group(redoBtn, this._redoCaret));

        this.element = bar;

        // Close on outside click / Escape. Registered on the DOCUMENT because the
        // bar is fixed-positioned and the popover is its child: a listener on
        // `bar` alone would never observe the click that dismisses it.
        this._onDocPointerDown = (e: Event): void => {
            if (this._pop === null) return;
            const t = e.target as Node | null;
            if (t !== null && this.element.contains(t)) return;
            this._closePopover();
        };
        this._onDocKeyDown = (e: KeyboardEvent): void => {
            if (this._pop !== null && e.key === 'Escape') this._closePopover();
        };
        document.addEventListener('pointerdown', this._onDocPointerDown, true);
        document.addEventListener('keydown', this._onDocKeyDown, true);
    }

    // ── §UNDO-HISTORY-DROPDOWN (ADR-0341) — the history popover ──────────────

    private readonly _undoCaret: HTMLButtonElement;
    private readonly _redoCaret: HTMLButtonElement;
    private _pop: HTMLElement | null = null;
    private _popDirection: 'undo' | 'redo' | null = null;
    private readonly _onDocPointerDown: (e: Event) => void;
    private readonly _onDocKeyDown: (e: KeyboardEvent) => void;

    /** Release the two document listeners. Idempotent. */
    dispose(): void {
        this._closePopover();
        document.removeEventListener('pointerdown', this._onDocPointerDown, true);
        document.removeEventListener('keydown', this._onDocKeyDown, true);
    }

    private _group(btn: HTMLElement, caret: HTMLElement): HTMLElement {
        const g = document.createElement('div');
        g.className = 'surh-group';
        g.appendChild(btn);
        g.appendChild(caret);
        return g;
    }

    private _makeCaret(title: string, direction: 'undo' | 'redo'): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'surh-caret';
        btn.title = title;
        btn.setAttribute('aria-haspopup', 'menu');
        btn.setAttribute('aria-expanded', 'false');
        btn.setAttribute('data-surh-caret', direction);
        // §XSS-SINK-SCAN (C08 §3.1) — `CARET_ICON` is an authored module constant above:
        // a static SVG literal with no interpolation, so it is markup by construction.
        const safeCaretIcon = CARET_ICON;
        btn.innerHTML = safeCaretIcon;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this._popDirection === direction) { this._closePopover(); return; }
            this._openPopover(direction);
        });
        return btn;
    }

    private _closePopover(): void {
        this._pop?.remove();
        this._pop = null;
        this._popDirection = null;
        this._undoCaret.setAttribute('aria-expanded', 'false');
        this._redoCaret.setAttribute('aria-expanded', 'false');
    }

    /**
     * Build and show the list. The timeline is read FRESH on every open — never
     * cached — because both stacks move under this component (keyboard Ctrl+Z,
     * ContextualEditBar, a project switch clearing them per C03 §4.6 U-6). A
     * cached list would offer a row that no longer exists, and "jump to row 5"
     * would then undo five of something else.
     */
    private _openPopover(direction: 'undo' | 'redo'): void {
        this._closePopover();
        let rows: readonly UndoTimelineEntry[] = [];
        try {
            const timeline = buildUndoTimeline();
            rows = direction === 'undo' ? timeline.undo : timeline.redo;
        } catch (err) {
            console.warn('[SaveUndoRedoHUD] undo timeline unavailable', err);
        }

        const pop = document.createElement('div');
        pop.className = 'surh-pop';
        pop.setAttribute('role', 'menu');
        pop.addEventListener('pointerdown', (e) => { e.stopPropagation(); });

        const head = document.createElement('div');
        head.className = 'surh-pop-head';
        const title = document.createElement('div');
        title.className = 'surh-pop-title';
        title.textContent = direction === 'undo' ? 'Undo history' : 'Redo history';
        const note = document.createElement('div');
        note.className = 'surh-pop-note';
        // The (A)-not-(B) statement, in the UI, in words. See the class header.
        note.textContent = direction === 'undo'
            ? 'Choosing a step undoes it and everything above it, newest first. Undoing one earlier step on its own is not supported.'
            : 'Choosing a step redoes it and everything above it, oldest first.';
        head.appendChild(title);
        head.appendChild(note);
        pop.appendChild(head);

        if (rows.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'surh-pop-empty';
            empty.textContent = direction === 'undo' ? 'Nothing to undo yet.' : 'Nothing to redo.';
            pop.appendChild(empty);
        } else {
            const list = document.createElement('div');
            list.className = 'surh-pop-list';
            const shown = rows.slice(0, MAX_ROWS);
            const rowEls: HTMLElement[] = [];
            shown.forEach((entry, i) => {
                const row = this._makeRow(entry, i, direction, rowEls);
                rowEls.push(row);
                list.appendChild(row);
            });
            pop.appendChild(list);
            const hidden = rows.length - shown.length;
            if (hidden > 0) {
                const foot = document.createElement('div');
                foot.className = 'surh-pop-foot';
                foot.textContent = `${hidden} older step${hidden === 1 ? '' : 's'} not shown — `
                    + `they are still there, and Ctrl+${direction === 'undo' ? 'Z' : 'Y'} still reaches them.`;
                pop.appendChild(foot);
            }
        }

        this.element.appendChild(pop);
        this._pop = pop;
        this._popDirection = direction;
        (direction === 'undo' ? this._undoCaret : this._redoCaret).setAttribute('aria-expanded', 'true');
    }

    private _makeRow(
        entry: UndoTimelineEntry,
        index: number,
        direction: 'undo' | 'redo',
        rowEls: HTMLElement[],
    ): HTMLElement {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'surh-row';
        row.setAttribute('role', 'menuitem');
        row.setAttribute('data-surh-row', String(index));
        row.title = direction === 'undo'
            ? `Undo ${index + 1} step${index === 0 ? '' : 's'} — back to just before "${entry.label}"`
            : `Redo ${index + 1} step${index === 0 ? '' : 's'} — forward through "${entry.label}"`;

        const ord = document.createElement('span');
        ord.className = 'surh-row-ord';
        ord.textContent = String(index + 1);

        const body = document.createElement('span');
        body.className = 'surh-row-body';
        const label = document.createElement('div');
        label.className = 'surh-row-label';
        label.textContent = entry.label;
        body.appendChild(label);
        const detailText = [entry.detail, _formatClock(entry.timestamp)]
            .filter((x): x is string => typeof x === 'string' && x.length > 0)
            .join(' · ');
        if (detailText.length > 0) {
            const detail = document.createElement('div');
            detail.className = 'surh-row-detail';
            detail.textContent = detailText;
            body.appendChild(detail);
        }

        row.appendChild(ord);
        row.appendChild(body);

        // SCOPE PREVIEW — hovering row k marks rows 0..k, so the user SEES that
        // the click takes all of them. This range highlight is the visible
        // difference between reading (A) and reading (B); a single-row highlight
        // would look like selective undo, which this product does not do.
        row.addEventListener('mouseenter', () => {
            rowEls.forEach((el, i) => {
                el.classList.toggle('is-in-scope', i <= index);
                el.classList.toggle('is-target', i === index);
            });
        });
        row.addEventListener('click', (e) => {
            e.stopPropagation();
            this._closePopover();
            this._runJump(direction, index);
        });
        return row;
    }

    /**
     * Run the jump and REPORT WHAT IT ACTUALLY DID.
     *
     * `undoThrough` stops at the first step that did not revert (a stranded
     * entry — C03 §4.8 — reverts nothing while consuming nothing). Reporting
     * `requested` instead of `completed` would tell the user five things were
     * undone when two were: the failure≠emptiness defect this repo has closed a
     * dozen times, sitting in the undo path again. The toast is best-effort; the
     * console line is not.
     */
    private _runJump(direction: 'undo' | 'redo', index: number): void {
        let outcome: UndoJumpOutcome;
        try {
            outcome = direction === 'undo' ? undoThrough(index) : redoThrough(index);
        } catch (err) {
            console.error(`[SaveUndoRedoHUD] ${direction} jump threw`, err);
            return;
        }
        console.log(`[SaveUndoRedoHUD] ${direction} jump — requested ${outcome.requested}, `
            + `completed ${outcome.completed}`
            + (outcome.stoppedBy ? `, stopped by ${outcome.stoppedBy}` : ''));
        if (outcome.completed >= outcome.requested) return;
        const verb = direction === 'undo' ? 'undone' : 'redone';
        const msg = `${outcome.completed} of ${outcome.requested} step`
            + `${outcome.requested === 1 ? '' : 's'} ${verb}`
            + (outcome.stoppedBy === 'nothing-left'
                ? ' — there was nothing older to reach.'
                : outcome.reason ? ` — stopped: ${outcome.reason}` : '.');
        try {
            void import('./platform/PlatformToastSystem')
                .then(m => { try { m.showToast(msg, 'error', 6000); } catch { /* no DOM */ } })
                .catch(() => { /* headless / bundle-split miss — the console line stands */ });
        } catch { /* import() unavailable */ }
    }

    /**
     * §XSS-SINK-SCAN (C08 §3.1) — `safeIconHtml` is markup by construction: every call site
     * passes one of the authored `SAVE_ICON` / `UNDO_ICON` / `REDO_ICON` module constants,
     * which are static SVG literals with no interpolation. The parameter carries the
     * gate's `safe…` name so the obligation travels with the signature.
     */
    private _makeBtn(title: string, safeIconHtml: string, onClick: () => void): HTMLElement {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'surh-btn';
        btn.title = title;
        btn.innerHTML = safeIconHtml;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            onClick();
        });
        return btn;
    }
}

/**
 * `14:32` local time, or `undefined` when the entry carried no timestamp.
 * Absence stays absent — a fabricated "just now" would be a claim, not a fact,
 * and the legacy fixtures that omit `timestamp` are real (C03 §4.6 U-10).
 */
function _formatClock(ts: number | undefined): string | undefined {
    if (typeof ts !== 'number' || !Number.isFinite(ts)) return undefined;
    try {
        const d = new Date(ts);
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch { return undefined; }
}
