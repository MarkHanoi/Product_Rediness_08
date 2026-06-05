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
import type { BriefSchema } from '@pryzm/schemas';
import { makeDraggable } from '../makeDraggable.js';
import { makeResizable } from '../makeResizable.js';
import { BriefSchemaForm, type BriefValues } from './BriefSchemaForm.js';

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
    /** The free-text reply row (input + Send). Hidden in the schema brief case so
     *  the form's own `notes` field is the single "anything else" capture. */
    private inputRowEl: HTMLElement | null = null;
    private errorEl: HTMLElement | null = null;
    /** O.13.c — dedicated body heading (sits fully below the gradient header,
     *  dark readable text). Surfaces the phase prompt as a real heading instead
     *  of relying on the first transcript bubble. */
    private bodyHeadingEl: HTMLElement | null = null;
    /** O.13.d — sticky bottom action bar (prominent primary CTA + secondary
     *  Cancel), shown only in the brief phase. */
    private footerEl: HTMLElement | null = null;
    private primaryCtaEl: HTMLButtonElement | null = null;
    /** O.12.b — host for the dynamic typology-brief controls (sliders/etc). */
    private briefFormEl: HTMLElement | null = null;
    /** O.12.b — the live dynamic brief form (built lazily in the brief phase). */
    private briefForm: BriefSchemaForm | null = null;
    /** O.12.b — the typology whose schema `briefForm` was built for (so we only
     *  rebuild on a typology change, not on every re-render). */
    private briefFormTypologyId: string | null = null;
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

        // O.13.c — a dedicated body heading that ALWAYS sits fully below the
        // gradient header bar (clear top spacing) with dark, readable text on
        // the white body. Previously the phase prompt only appeared as the first
        // transcript bubble, which butted up against the header and read as
        // "clipped + low-contrast". Hidden when there's nothing to surface.
        const bodyHeading = document.createElement('h3');
        bodyHeading.className = 'rac-body-heading';
        bodyHeading.setAttribute('data-testid', 'rac-body-heading');
        bodyHeading.hidden = true;
        this.bodyHeadingEl = bodyHeading;
        root.appendChild(bodyHeading);

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

        // O.12.b — host for the dynamic typology-brief controls. Populated only
        // in the `awaiting-brief` phase (and only when the active typology
        // declares a `briefSchema`); empty + hidden otherwise.
        const briefForm = document.createElement('div');
        briefForm.className = 'rac-brief';
        briefForm.setAttribute('data-testid', 'rac-brief');
        briefForm.hidden = true;
        this.briefFormEl = briefForm;
        root.appendChild(briefForm);

        const errorBar = document.createElement('div');
        errorBar.className = 'rac-error';
        errorBar.setAttribute('data-testid', 'rac-error');
        errorBar.hidden = true;
        this.errorEl = errorBar;
        root.appendChild(errorBar);

        const inputRow = document.createElement('form');
        inputRow.className = 'rac-input-row';
        inputRow.setAttribute('data-testid', 'rac-input-row');
        this.inputRowEl = inputRow;
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

        // O.13.d — sticky bottom action bar. The advance action used to be a
        // small "Mark brief complete" chip near the TOP (next to Cancel), so the
        // "what do I click to proceed?" was unclear. The primary CTA now lives
        // here, full-width and prominent (#6600FF), pinned to the panel bottom;
        // Cancel is de-emphasised to a ghost button. Shown only in the brief
        // phase (toggled in render()).
        const footer = document.createElement('div');
        footer.className = 'rac-footer';
        footer.setAttribute('data-testid', 'rac-footer');
        footer.hidden = true;

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'rac-footer-cancel';
        cancelBtn.setAttribute('data-testid', 'rac-chip-cancel');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', () => this.dispatch({ type: 'cancel' }));

        const primary = document.createElement('button');
        primary.type = 'button';
        primary.className = 'rac-footer-primary';
        // Keep the legacy test id so existing selectors still resolve, plus a
        // semantic CTA id.
        primary.setAttribute('data-testid', 'rac-chip-mark-brief-complete');
        primary.textContent = 'Continue →';
        primary.addEventListener('click', () => this.dispatch({ type: 'mark-brief-complete' }));
        this.primaryCtaEl = primary;

        footer.appendChild(cancelBtn);
        footer.appendChild(primary);
        this.footerEl = footer;
        root.appendChild(footer);

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
        try { this.briefForm?.dispose(); } catch { /* ignore */ }
        this.briefForm = null;
        this.briefFormTypologyId = null;
        if (this.root && this.root.parentNode) {
            this.root.parentNode.removeChild(this.root);
        }
        this.root = null;
        this.phaseChipEl = null;
        this.transcriptEl = null;
        this.suggestionsEl = null;
        this.summaryEl = null;
        this.briefFormEl = null;
        this.inputEl = null;
        this.inputRowEl = null;
        this.errorEl = null;
        this.bodyHeadingEl = null;
        this.footerEl = null;
        this.primaryCtaEl = null;
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

        // O.13.c — surface the phase prompt as a real heading below the header.
        // When the transcript is empty the same prompt renders in its empty
        // bubble, so only promote it to the dedicated heading once the transcript
        // has scrolled past it (turns > 0) — this is the case the founder hit in
        // the brief phase where the heading was buried under the header bar.
        if (this.bodyHeadingEl) {
            const heading = defaultPromptForPhase(this.state);
            const showHeading = !!heading
                && this.state.turns.length > 0
                && this.state.phase !== 'ready'
                && this.state.phase !== 'cancelled';
            this.bodyHeadingEl.textContent = showHeading ? heading : '';
            this.bodyHeadingEl.hidden = !showHeading;
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

        // O.12.b — render the typology-declared brief controls in the brief phase.
        this.renderBriefForm();

        if (this.errorEl) {
            if (this.state.errorMessage) {
                this.errorEl.textContent = this.state.errorMessage;
                this.errorEl.hidden = false;
            } else {
                this.errorEl.textContent = '';
                this.errorEl.hidden = true;
            }
        }

        // Single input path: when the structured brief form is live, the form's
        // own `notes` ("anything else") field is the sole supplementary capture,
        // so the redundant free-text reply row + its "Send" button are hidden
        // entirely (they read as the primary CTA and confused the founder). The
        // free-text row is kept ONLY for the no-schema fallback typologies.
        if (this.inputRowEl) {
            this.inputRowEl.hidden = !!this.briefForm;
        }
        if (this.inputEl) {
            const closed = this.state.phase === 'ready' || this.state.phase === 'cancelled';
            this.inputEl.disabled = closed;
            this.inputEl.placeholder = 'Type your reply…';
        }

        // O.13.d — the prominent bottom CTA bar is the brief-phase advance path.
        // Shown only while awaiting the brief; the primary label names the next
        // action ("Generate apartment →" when a typology is captured, else a
        // neutral "Continue →").
        if (this.footerEl) {
            const inBrief = this.state.phase === 'awaiting-brief';
            this.footerEl.hidden = !inBrief;
            if (inBrief && this.primaryCtaEl) {
                const typology = this.state.captured.typologyId;
                this.primaryCtaEl.textContent = typology
                    ? `Generate ${typology} →`
                    : 'Continue →';
            }
        }
    }

    /**
     * O.12.b — resolve the active typology's `briefSchema` from the registry.
     * Returns `undefined` when no typology is captured yet, the pack is absent,
     * or the typology declares no schema (the host then falls back to free-text).
     */
    private resolveBriefSchema(): BriefSchema | undefined {
        const typologyId = this.state.captured.typologyId;
        if (!typologyId) return undefined;
        try {
            return this.registry.get(typologyId)?.manifest.briefSchema;
        } catch (err) {
            console.warn('[rac-panel] resolveBriefSchema threw (falling back to free-text):', err);
            return undefined;
        }
    }

    /**
     * O.12.b — mount / tear down the dynamic brief controls.
     *
     * In the `awaiting-brief` phase, if the active typology declares a
     * `briefSchema`, build a `BriefSchemaForm` (once per typology) and stream its
     * captured values into the conversation state via `capture-brief-field` — so
     * the captured brief is STRUCTURED (keyed by field id), not a prose blob. The
     * form REPLACES the free-text box as the primary capture; the free-text input
     * remains as a supplementary "anything else" hint (and is the sole capture
     * when a typology declares no schema — graceful fallback).
     *
     * Outside the brief phase (or when no schema is declared) the host element is
     * cleared + hidden and the form is disposed.
     */
    private renderBriefForm(): void {
        const host = this.briefFormEl;
        if (!host) return;

        const schema = this.state.phase === 'awaiting-brief' ? this.resolveBriefSchema() : undefined;
        const typologyId = this.state.captured.typologyId ?? null;

        // No schema (wrong phase, no typology, no pack, or typology declares none)
        // → tear down + fall back to the free-text box.
        if (!schema) {
            if (this.briefForm) {
                try { this.briefForm.dispose(); } catch { /* ignore */ }
                this.briefForm = null;
                this.briefFormTypologyId = null;
            }
            host.replaceChildren();
            host.hidden = true;
            return;
        }

        // Rebuild only when the typology changed — re-rendering must NOT wipe the
        // user's in-progress slider/toggle values on every keystroke.
        if (this.briefForm && this.briefFormTypologyId === typologyId) {
            host.hidden = false;
            return;
        }

        try { this.briefForm?.dispose(); } catch { /* ignore */ }
        host.replaceChildren();

        const form = new BriefSchemaForm({
            schema,
            onChange: (values) => this.applyBriefValues(values),
        });
        host.appendChild(form.build());
        host.hidden = false;
        this.briefForm = form;
        this.briefFormTypologyId = typologyId;

        // Seed the conversation state with the form's defaults immediately so the
        // captured brief is non-empty even if the user accepts every default.
        this.applyBriefValues(form.getValues());
    }

    /**
     * O.12.b — fold the structured form values into the captured brief, one
     * `capture-brief-field` per id. We mutate the captured map directly (the
     * reducer's `capture-brief-field` returns a fresh state) but WITHOUT
     * re-rendering on every change — re-rendering here would rebuild the form
     * mid-drag. The values reach `toBrief()` when the brief is marked complete.
     */
    private applyBriefValues(values: BriefValues): void {
        for (const [key, value] of Object.entries(values)) {
            this.state = racReducer(this.state, {
                type: 'capture-brief-field',
                key,
                value,
            });
        }
        // Reflect the new capture in the summary line only — do NOT call the full
        // render() (it would rebuild the live form mid-interaction).
        if (this.summaryEl) {
            this.summaryEl.textContent = summarizeCapturedState(this.state.captured);
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
                    // §A.6.c — show the Pack's human displayName ("Apartment",
                    // "Casa Unifamiliar (House)") on the chip, not the raw id.
                    const label = this.registry.get(id)?.manifest.displayName ?? id;
                    host.appendChild(this.makeChip(label, () =>
                        this.dispatch({ type: 'capture-typology', typologyId: id }),
                    ));
                }
                return;
            }
            case 'awaiting-brief': {
                // O.13.d — the advance ("Mark brief complete") + Cancel actions
                // moved to the prominent sticky bottom footer (`.rac-footer`), so
                // the suggestion row stays empty in the brief phase.
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
