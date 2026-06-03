/**
 * A.5.b (Phase A · IP-A3 Sprint 3) — L5 RAC chatbot panel.
 *
 * The user-facing surface of the L3 `racReducer` (`@pryzm/typology-pipeline`).
 * Constructs a vanilla-DOM panel with a transcript, a suggestion row of
 * quick-action buttons, and a free-text input. Drives the L3 state
 * machine on every user event and re-renders.
 *
 * Layer:    UI — L5 (vanilla DOM, no React) — matches the project's
 *           prevailing panel pattern (AIPanel, ProvenanceTab).
 * Contract: C50 §3.x (RAC interview) · IP-A3 demo runbook
 * CSS prefix: rac- (Requirement Acquisition Conversation)
 *
 * Data flow:
 *   user-event → racReducer(state, event) → state' → render(state')
 *
 * The panel does NOT call Claude directly. When the brief reaches
 * `ready`, `onBriefReady(brief)` fires — the caller dispatches via
 * `runtime.typology.router.dispatch(brief)` (or the demo-mode harness).
 * This keeps the panel pure and testable under happy-dom.
 *
 * No module-load DOM access; the constructor is the only point that
 * builds elements, so happy-dom unit tests can drive the lifecycle.
 */

import {
    createInitialState,
    racReducer,
    defaultPromptForPhase,
    summarizeCapturedState,
    toBrief,
    type RacConversationState,
    type RacEvent,
    type RacPhase,
    type RacTurn,
} from '@pryzm/typology-pipeline';
import type { TypologyRegistry } from '@pryzm/typology-pipeline';
import type { PipelineBrief, UserRole } from '@pryzm/typology-pipeline';
import { makeDraggable } from '../makeDraggable.js';
import { makeResizable } from '../makeResizable.js';

// ─── pure helpers (exported for unit tests) ──────────────────────────────────

const PHASE_LABEL: Readonly<Record<RacPhase, string>> = {
    intro: 'Welcome',
    'awaiting-role': 'Your role',
    'awaiting-typology': 'Project type',
    'awaiting-brief': 'Project brief',
    ready: 'Ready to generate',
    cancelled: 'Cancelled',
};

const ROLE_OPTIONS: readonly UserRole[] = [
    'architect',
    'engineer',
    'developer',
    'contractor',
    'owner',
    'student',
];

/** Display label for a phase chip — exported for tests. */
export function labelForPhase(phase: RacPhase): string {
    return PHASE_LABEL[phase];
}

/** Zero-pad a turn for the transcript — speaker prefix + text. */
export function formatTurnLine(turn: RacTurn): string {
    const who = turn.speaker === 'user' ? 'You' : 'PRYZM';
    return `${who}: ${turn.text}`;
}

/** Best-effort wall-clock ISO. Pure clock injection point for tests. */
function isoNow(): string {
    // Test harness overrides via the `now` option on the constructor.
    return new Date().toISOString();
}

// ─── panel options + class ───────────────────────────────────────────────────

export interface RACChatbotPanelOptions {
    readonly registry: TypologyRegistry;
    /** Fired when the conversation reaches phase `ready`. */
    readonly onBriefReady?: (brief: PipelineBrief) => void;
    /** Optional clock injection for deterministic tests. */
    readonly now?: () => string;
    /**
     * O.5 — pre-capture the typology before the user types anything (e.g. the
     * "New Project" modal's Project Type select → `apartment`). When set AND
     * present in the registry, the panel dispatches `capture-typology` once on
     * build so the conversation skips the "what type?" question. Ignored if the
     * id is unknown (the conversation just asks normally).
     */
    readonly seedTypologyId?: string;
    /**
     * O.5 — extra metadata merged into every emitted brief's `metadata`
     * (captured-brief fields take precedence). Used to carry the modal's project
     * name (`projectName`) through to `briefBootstrap` so the created project is
     * named what the user typed, not a default.
     */
    readonly seedMetadata?: Record<string, unknown>;
}

/**
 * Stateful panel. Caller lifecycle:
 *
 *   const panel = new RACChatbotPanel({ registry, onBriefReady });
 *   container.appendChild(panel.build());
 *   panel.dispatch({ type: 'user-message', text: 'I am an architect', now: '...' });
 *   panel.dispose();
 */
export class RACChatbotPanel {
    private readonly registry: TypologyRegistry;
    private readonly onBriefReady?: (brief: PipelineBrief) => void;
    private readonly clock: () => string;
    /** O.5 — typology to pre-capture on build (modal-seeded), or undefined. */
    private readonly seedTypologyId?: string;
    /** O.5 — metadata merged into every emitted brief (modal name, etc.). */
    private readonly seedMetadata?: Record<string, unknown>;
    /** O.5 — guards the one-shot auto-capture of the seeded typology. */
    private _seedTypologyApplied = false;

    private state: RacConversationState;
    private root: HTMLElement | null = null;
    private phaseChipEl: HTMLElement | null = null;
    private transcriptEl: HTMLElement | null = null;
    private suggestionsEl: HTMLElement | null = null;
    private summaryEl: HTMLElement | null = null;
    private inputEl: HTMLInputElement | null = null;
    private errorEl: HTMLElement | null = null;
    /** Drag + resize chrome disposers (makeDraggable / makeResizable). */
    private chromeDisposers: Array<() => void> = [];

    constructor(opts: RACChatbotPanelOptions) {
        this.registry = opts.registry;
        this.onBriefReady = opts.onBriefReady;
        this.clock = opts.now ?? isoNow;
        this.seedTypologyId = opts.seedTypologyId;
        this.seedMetadata = opts.seedMetadata;
        this.state = createInitialState(this.registry);
    }

    /** Current state — exposed for tests and for caller-side composition. */
    getState(): RacConversationState {
        return this.state;
    }

    /**
     * Apply an event to the reducer + re-render. Returns the new state.
     * When the new state is `ready` and a brief can be derived, fires
     * `onBriefReady(brief)` exactly once on the transition.
     */
    dispatch(event: RacEvent): RacConversationState {
        const prevPhase = this.state.phase;
        this.state = racReducer(this.state, event);
        this.render();

        // O.5 — when a modal seeded the typology (e.g. Project Type =
        // Residential → `apartment`), auto-capture it the moment the
        // conversation reaches `awaiting-typology` (i.e. AFTER the user states
        // their role, so role is never skipped). This re-enters `dispatch` once
        // with a `capture-typology` event, advancing to `awaiting-brief` and
        // sparing the user the "what type?" question. Guarded to fire at most
        // once, and only for a typology that is actually in the registry.
        if (
            !this._seedTypologyApplied &&
            this.seedTypologyId &&
            this.state.phase === 'awaiting-typology' &&
            prevPhase !== 'awaiting-typology' &&
            this.state.availableTypologies.includes(this.seedTypologyId)
        ) {
            this._seedTypologyApplied = true;
            return this.dispatch({ type: 'capture-typology', typologyId: this.seedTypologyId });
        }

        if (this.state.phase === 'ready' && prevPhase !== 'ready') {
            const brief = toBrief(this.state);
            if (brief && this.onBriefReady) {
                // O.5 — fold the modal-seeded metadata (project name, project
                // type) UNDER the captured brief so the conversation's own
                // fields win on conflict, but the modal's `projectName` reaches
                // briefBootstrap. No-op when no seed was provided.
                const seeded = this.seedMetadata
                    ? { ...brief, metadata: { ...this.seedMetadata, ...brief.metadata } }
                    : brief;
                this.onBriefReady(seeded);
            }
        }
        return this.state;
    }

    /** Build the root element and return it for mounting. */
    build(): HTMLElement {
        if (this.root) return this.root;

        const root = document.createElement('section');
        root.className = 'rac-panel';
        root.setAttribute('data-testid', 'rac-panel');
        root.setAttribute('aria-label', 'PRYZM onboarding chat');
        this.root = root;

        const header = document.createElement('header');
        header.className = 'rac-header';
        const title = document.createElement('h2');
        title.className = 'rac-title';
        title.textContent = 'PRYZM Onboarding';
        const phaseChip = document.createElement('span');
        phaseChip.className = 'rac-phase-chip';
        phaseChip.setAttribute('data-testid', 'rac-phase-chip');
        this.phaseChipEl = phaseChip;
        header.appendChild(title);
        header.appendChild(phaseChip);
        root.appendChild(header);

        const transcript = document.createElement('div');
        transcript.className = 'rac-transcript';
        transcript.setAttribute('data-testid', 'rac-transcript');
        transcript.setAttribute('role', 'log');
        transcript.setAttribute('aria-live', 'polite');
        this.transcriptEl = transcript;
        root.appendChild(transcript);

        const suggestions = document.createElement('div');
        suggestions.className = 'rac-suggestions';
        suggestions.setAttribute('data-testid', 'rac-suggestions');
        this.suggestionsEl = suggestions;
        root.appendChild(suggestions);

        const summary = document.createElement('div');
        summary.className = 'rac-summary';
        summary.setAttribute('data-testid', 'rac-summary');
        this.summaryEl = summary;
        root.appendChild(summary);

        const errorBar = document.createElement('div');
        errorBar.className = 'rac-error';
        errorBar.setAttribute('data-testid', 'rac-error');
        errorBar.hidden = true;
        this.errorEl = errorBar;
        root.appendChild(errorBar);

        const inputRow = document.createElement('form');
        inputRow.className = 'rac-input-row';
        inputRow.setAttribute('data-testid', 'rac-input-row');
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'rac-input';
        input.setAttribute('data-testid', 'rac-input');
        input.placeholder = 'Type your reply…';
        input.autocomplete = 'off';
        this.inputEl = input;
        const send = document.createElement('button');
        send.type = 'submit';
        send.className = 'rac-send';
        send.setAttribute('data-testid', 'rac-send');
        send.textContent = 'Send';
        inputRow.appendChild(input);
        inputRow.appendChild(send);
        inputRow.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSubmit();
        });
        root.appendChild(inputRow);

        // ── Drag + resize chrome (founder feedback 2026-06-03) ────────────────
        // Draggable by the header (cursor:move in CSS); inputs/buttons in the
        // header are excluded so a click on them doesn't start a drag. The header
        // here has no interactive children, but we pass the same exclusions for
        // consistency + future-proofing.
        this.chromeDisposers.push(
            makeDraggable(root, '.rac-header', ['button', 'input', 'a']),
        );
        // Resizable via a bottom-right grip.
        const grip = document.createElement('div');
        grip.className = 'rac-resize-grip';
        grip.setAttribute('data-testid', 'rac-resize-grip');
        grip.setAttribute('aria-hidden', 'true');
        root.appendChild(grip);
        this.chromeDisposers.push(
            makeResizable(root, grip, { minWidth: 300, minHeight: 220 }),
        );

        this.render();
        return root;
    }

    /** Detach DOM + drop references. Idempotent. */
    dispose(): void {
        for (const d of this.chromeDisposers.splice(0)) {
            try { d(); } catch { /* ignore */ }
        }
        if (this.root && this.root.parentNode) {
            this.root.parentNode.removeChild(this.root);
        }
        this.root = null;
        this.phaseChipEl = null;
        this.transcriptEl = null;
        this.suggestionsEl = null;
        this.summaryEl = null;
        this.inputEl = null;
        this.errorEl = null;
    }

    // ── internals ────────────────────────────────────────────────────────

    private handleSubmit(): void {
        const text = this.inputEl?.value.trim() ?? '';
        if (!text) return;
        if (this.inputEl) this.inputEl.value = '';
        this.dispatch({
            type: 'user-message',
            text,
            now: this.clock(),
        });
    }

    private render(): void {
        if (!this.root) return;

        if (this.phaseChipEl) {
            this.phaseChipEl.textContent = labelForPhase(this.state.phase);
            this.phaseChipEl.setAttribute('data-phase', this.state.phase);
        }

        if (this.transcriptEl) {
            this.transcriptEl.innerHTML = '';
            if (this.state.turns.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'rac-transcript-empty';
                empty.textContent = defaultPromptForPhase(this.state);
                this.transcriptEl.appendChild(empty);
            } else {
                for (const turn of this.state.turns) {
                    const row = document.createElement('div');
                    row.className = `rac-turn rac-turn--${turn.speaker}`;
                    row.setAttribute('data-testid', `rac-turn-${turn.speaker}`);
                    const speaker = document.createElement('span');
                    speaker.className = 'rac-turn-speaker';
                    speaker.textContent = turn.speaker === 'user' ? 'You' : 'PRYZM';
                    const text = document.createElement('span');
                    text.className = 'rac-turn-text';
                    text.textContent = turn.text;
                    row.appendChild(speaker);
                    row.appendChild(text);
                    this.transcriptEl.appendChild(row);
                }
            }
        }

        if (this.suggestionsEl) {
            this.suggestionsEl.innerHTML = '';
            this.renderSuggestions(this.suggestionsEl);
        }

        if (this.summaryEl) {
            this.summaryEl.textContent = summarizeCapturedState(this.state.captured);
        }

        if (this.errorEl) {
            if (this.state.errorMessage) {
                this.errorEl.textContent = this.state.errorMessage;
                this.errorEl.hidden = false;
            } else {
                this.errorEl.textContent = '';
                this.errorEl.hidden = true;
            }
        }

        if (this.inputEl) {
            const closed = this.state.phase === 'ready' || this.state.phase === 'cancelled';
            this.inputEl.disabled = closed;
        }
    }

    private renderSuggestions(host: HTMLElement): void {
        switch (this.state.phase) {
            case 'intro':
            case 'awaiting-role':
                for (const role of ROLE_OPTIONS) {
                    host.appendChild(this.makeChip(role, () =>
                        this.dispatch({ type: 'capture-role', role }),
                    ));
                }
                return;
            case 'awaiting-typology': {
                for (const id of this.state.availableTypologies) {
                    host.appendChild(this.makeChip(id, () =>
                        this.dispatch({ type: 'capture-typology', typologyId: id }),
                    ));
                }
                return;
            }
            case 'awaiting-brief': {
                host.appendChild(this.makeChip('Mark brief complete', () =>
                    this.dispatch({ type: 'mark-brief-complete' }),
                ));
                host.appendChild(this.makeChip('Cancel', () =>
                    this.dispatch({ type: 'cancel' }),
                ));
                return;
            }
            case 'ready':
            case 'cancelled': {
                host.appendChild(this.makeChip('Restart', () =>
                    this.dispatch({ type: 'restart' }),
                ));
                return;
            }
        }
    }

    private makeChip(label: string, onClick: () => void): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'rac-chip';
        btn.setAttribute('data-testid', `rac-chip-${label.toLowerCase().replace(/\s+/g, '-')}`);
        btn.textContent = label;
        btn.addEventListener('click', onClick);
        return btn;
    }
}
