/**
 * AIRailPanel — AI & Tools section content for the left-rail system.
 *
 * Three action buttons: AI Chat (floating), AI Create (inline), PDF Import (inline).
 * "AI Create" and "PDF Import" expand an inline content area below the buttons,
 * embedding the respective panel element directly inside the left rail panel.
 *
 * Contract compliance:
 *   §05 §9   — New UI file under src/ui/
 *   §05 §6   — Zero bim-* elements; pure native HTML
 *   §01      — Read-only; no direct store mutations
 */

import { commandProposalStore } from '@pryzm/command-registry';
import type { ProjectBrowserPanelProps } from '../ProjectBrowserTypes';

type InlinePanel = 'ai-create';

export class AIRailPanel {
    private _activePanel: InlinePanel | null = null;
    private _aiCreateBtn:  HTMLButtonElement | null = null;
    private _fpImportBtn:  HTMLButtonElement | null = null;
    private _inlineArea:   HTMLElement | null = null;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(private readonly _props: ProjectBrowserPanelProps, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;}

    build(): HTMLElement {
        const container = document.createElement('div');
        container.className = 'pb-ai-container';

        // ── Pending proposals row ──────────────────────────────────────────
        const proposalRow = document.createElement('div');
        proposalRow.className = 'pb-ai-proposal-row';

        const proposalLabel = document.createElement('span');
        proposalLabel.className   = 'pb-ai-proposal-label';
        proposalLabel.textContent = 'Pending AI Proposals';

        const badge = document.createElement('span');
        badge.className = 'pb-ai-proposal-badge';

        const updateBadge = (): void => {
            const count = commandProposalStore.size();
            badge.textContent   = count > 0 ? String(count) : '';
            badge.style.display = count > 0 ? 'inline-flex' : 'none';
        };
        updateBadge();
        const pollId = setInterval(() => {
            if (!container.isConnected) { clearInterval(pollId); return; }
            updateBadge();
        }, 2000);

        const reviewBtn = document.createElement('button');
        reviewBtn.className   = 'pb-ai-review-btn';
        reviewBtn.type        = 'button';
        reviewBtn.title       = 'Open AI assistant to review pending proposals';
        reviewBtn.textContent = 'Review';
        reviewBtn.addEventListener('click', () => this._props.onToggleAIPanel?.());

        proposalRow.appendChild(proposalLabel);
        proposalRow.appendChild(badge);
        proposalRow.appendChild(reviewBtn);
        container.appendChild(proposalRow);

        // ── Action buttons ─────────────────────────────────────────────────
        // AI Chat — opens the floating AI chat panel (unchanged behaviour)
        const aiChatBtn = document.createElement('button');
        aiChatBtn.className   = 'pb-ai-btn';
        aiChatBtn.type        = 'button';
        aiChatBtn.title       = 'Open AI assistant panel';
        aiChatBtn.textContent = 'AI Chat';
        aiChatBtn.addEventListener('click', () => this._props.onToggleAIPanel?.());
        container.appendChild(aiChatBtn);

        // AI Create — expands inline below
        const aiCreateBtn = document.createElement('button');
        aiCreateBtn.className   = 'pb-ai-btn';
        aiCreateBtn.type        = 'button';
        aiCreateBtn.title       = 'Open AI element creation panel';
        aiCreateBtn.textContent = '✦ AI Create';
        this._aiCreateBtn = aiCreateBtn;
        aiCreateBtn.addEventListener('click', () => this._toggleInline('ai-create'));
        container.appendChild(aiCreateBtn);

        // PDF Import — opens the floating fp-import-panel-container
        const fpBtn = document.createElement('button');
        fpBtn.className   = 'pb-ai-btn';
        fpBtn.type        = 'button';
        fpBtn.title       = 'Import floor plan from PDF';
        fpBtn.textContent = 'PDF Import';
        this._fpImportBtn = fpBtn;
        fpBtn.addEventListener('click', () => this._props.onToggleFloorPlanPanel?.());
        container.appendChild(fpBtn);

        // ── Inline content area (AI Create only) ─────────────────────────
        const inlineArea = document.createElement('div');
        inlineArea.className = 'pb-ai-inline-area';
        this._inlineArea = inlineArea;
        container.appendChild(inlineArea);

        // Embed AI Create panel inline (PDF Import is now a floating panel)
        if (this._props.aiCreateEl) {
            const wrapper = document.createElement('div');
            wrapper.className   = 'pb-ai-inline-panel-wrapper';
            wrapper.dataset.panel = 'ai-create';
            wrapper.style.display = 'none';
            wrapper.appendChild(this._props.aiCreateEl);
            inlineArea.appendChild(wrapper);
        }

        return container;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Private helpers
    // ─────────────────────────────────────────────────────────────────────────

    private _toggleInline(panelId: InlinePanel): void {
        if (!this._inlineArea) return;

        const isAlreadyOpen = this._activePanel === panelId;

        // Hide all wrappers and clear active button states
        const wrappers = this._inlineArea.querySelectorAll<HTMLElement>('.pb-ai-inline-panel-wrapper');
        wrappers.forEach(w => { w.style.display = 'none'; });
        this._inlineArea.classList.remove('pb-ai-inline-area--visible');
        if (this._aiCreateBtn) this._aiCreateBtn.classList.remove('pb-ai-btn--active');
        if (this._fpImportBtn) this._fpImportBtn.classList.remove('pb-ai-btn--active');
        this._activePanel = null;

        if (isAlreadyOpen) {
            // Clicking an already-open panel collapses it
            return;
        }

        // Show the requested panel's wrapper
        const targetWrapper = this._inlineArea.querySelector<HTMLElement>(
            `[data-panel="${panelId}"]`,
        );
        if (!targetWrapper) return;

        targetWrapper.style.display = 'flex';
        targetWrapper.style.flexDirection = 'column';
        this._inlineArea.classList.add('pb-ai-inline-area--visible');
        this._activePanel = panelId;

        const activeBtn = panelId === 'ai-create' ? this._aiCreateBtn : this._fpImportBtn;
        activeBtn?.classList.add('pb-ai-btn--active');
    }

}
