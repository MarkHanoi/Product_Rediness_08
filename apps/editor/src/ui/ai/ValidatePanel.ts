/**
 * ValidatePanel — Validate & Reports content panel for the Left Nav Rail.
 *
 * Phase 9 — Task 9.1 / 9.2: Separates validation from the AI chat panel.
 * This panel hosts: Full Validation, P0/P1/P2 checks, Compliance Report,
 * Spatial Audit, element schedules, and AI Action Proposals review.
 *
 * Contract compliance:
 *   §05 §3   — Uses lnr- prefix for left-rail structural elements (via LeftNavRail)
 *   §05 §6   — Zero bim-* elements; pure native HTML
 *   §05 §7.6 — No independent <style> injection
 *   §01 §2   — Read-only with respect to stores; mutations via commandManager
 *   §04      — No direct store mutations; approvals dispatched via commandManager
 */

import { aiService } from '@pryzm/ai-host';
import { commandProposalStore } from '@pryzm/command-registry';
import { aiApprovalStore } from '@pryzm/ai-host';
import { CommandProposal, CommandType } from '@pryzm/command-registry';

export class ValidatePanel {
    /** Phase B (S73-WIRE) — runtime threaded by parent (added by widening — class had no explicit constructor). */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;
    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) { this.runtime = runtime; }

    private _resultEl: HTMLElement | null = null;
    private _proposalsEl: HTMLElement | null = null;

    build(): HTMLElement {
        const root = document.createElement('div');
        root.className = 'ai-val-panel';

        // Gradient header
        const header = document.createElement('div');
        header.className = 'ai-val-header';
        header.textContent = 'VALIDATE & REPORTS';
        root.appendChild(header);

        // Validation section
        root.appendChild(this._buildValidateSection());

        // Reports section
        root.appendChild(this._buildReportsSection());

        // AI Action Proposals section
        root.appendChild(this._buildProposalsSection());

        // Results area
        const resultEl = document.createElement('div');
        resultEl.className = 'ai-val-result';
        resultEl.innerHTML = '<div class="ai-chat-empty">Run a check above to see results here.</div>';
        this._resultEl = resultEl;
        root.appendChild(resultEl);

        return root;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Private section builders
    // ─────────────────────────────────────────────────────────────────────

    private _buildValidateSection(): HTMLElement {
        const sec = document.createElement('div');
        sec.className = 'ai-val-section';

        const label = document.createElement('div');
        label.className = 'ai-val-section-label';
        label.textContent = 'Validation';
        sec.appendChild(label);

        const grid = document.createElement('div');
        grid.className = 'ai-val-btn-grid';

        const fullBtn = document.createElement('button');
        fullBtn.type = 'button';
        fullBtn.className = 'ai-val-btn ai-val-btn--primary';
        fullBtn.textContent = 'Run Full Validation';
        fullBtn.addEventListener('click', () => this._runFullValidation());
        grid.appendChild(fullBtn);

        const checks: Array<{ label: string; type: 'integrity' | 'functional' | 'ifc' }> = [
            { label: 'P0 Integrity', type: 'integrity' },
            { label: 'P1 Functional', type: 'functional' },
            { label: 'P2 IFC Check', type: 'ifc' },
        ];

        checks.forEach(c => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'ai-val-btn';
            btn.textContent = c.label;
            btn.addEventListener('click', () => this._runSingleCheck(c.type));
            grid.appendChild(btn);
        });

        sec.appendChild(grid);
        return sec;
    }

    private _buildReportsSection(): HTMLElement {
        const sec = document.createElement('div');
        sec.className = 'ai-val-section';

        const label = document.createElement('div');
        label.className = 'ai-val-section-label';
        label.textContent = 'Reports';
        sec.appendChild(label);

        const grid = document.createElement('div');
        grid.className = 'ai-val-btn-grid';

        const reports: Array<{ label: string; fn: () => void }> = [
            { label: 'Compliance', fn: () => this._runReport('compliance') },
            { label: 'Spatial Audit', fn: () => this._runReport('spatial') },
        ];

        reports.forEach(r => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'ai-val-btn';
            btn.textContent = r.label;
            btn.addEventListener('click', r.fn);
            grid.appendChild(btn);
        });

        // Schedule sub-section
        const schedLabel = document.createElement('div');
        schedLabel.className = 'ai-val-section-label';
        schedLabel.style.marginTop = '8px';
        schedLabel.textContent = 'Schedules';
        sec.appendChild(grid);
        sec.appendChild(schedLabel);

        const schedGrid = document.createElement('div');
        schedGrid.className = 'ai-val-btn-grid';

        const types: Array<'wall' | 'door' | 'window' | 'slab' | 'column'> = ['wall', 'door', 'window', 'slab', 'column'];
        types.forEach(t => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'ai-val-btn';
            btn.textContent = t.charAt(0).toUpperCase() + t.slice(1) + 's';
            btn.addEventListener('click', () => this._runSchedule(t));
            schedGrid.appendChild(btn);
        });

        sec.appendChild(schedGrid);
        return sec;
    }

    private _buildProposalsSection(): HTMLElement {
        const sec = document.createElement('div');
        sec.className = 'ai-val-section';

        const label = document.createElement('div');
        label.className = 'ai-val-section-label';
        label.textContent = 'AI Action Proposals';
        sec.appendChild(label);

        const analyzeBtn = document.createElement('button');
        analyzeBtn.type = 'button';
        analyzeBtn.className = 'ai-val-btn ai-val-btn--primary';
        analyzeBtn.textContent = 'Analyze Model for AI Actions';
        analyzeBtn.style.gridColumn = '1 / -1';
        analyzeBtn.addEventListener('click', () => this._analyzeActions());
        sec.appendChild(analyzeBtn);

        const proposalsEl = document.createElement('div');
        proposalsEl.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-top:8px;';
        this._proposalsEl = proposalsEl;
        this._renderProposals();
        sec.appendChild(proposalsEl);

        // Poll for proposal changes
        const pollId = setInterval(() => {
            if (!sec.isConnected) { clearInterval(pollId); return; }
            this._renderProposals();
        }, 3000);

        return sec;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Validation runners
    // ─────────────────────────────────────────────────────────────────────

    private _runFullValidation(): void {
        const report = aiService.validateModel();
        this._showResult(this._formatValidationReport(report));
    }

    private _runSingleCheck(type: 'integrity' | 'functional' | 'ifc'): void {
        let violations: any[] = [];
        let title = '';
        if (type === 'integrity')  { violations = aiService.validateIntegrity();  title = 'Integrity Check (P0)'; }
        if (type === 'functional') { violations = aiService.validateFunctional(); title = 'Functional Check (P1)'; }
        if (type === 'ifc')        { violations = aiService.validateIFC();         title = 'IFC Metadata Check (P2)'; }
        this._showResult(this._formatViolations(title, violations));
    }

    private _runReport(type: 'compliance' | 'spatial'): void {
        const text = type === 'compliance'
            ? aiService.generateComplianceReport()
            : aiService.generateSpatialContainmentReport();
        this._showResult(`<pre style="white-space:pre-wrap;font-size:10px;line-height:1.4;font-family:var(--app-font);">${this._escapeHtml(text)}</pre>`);
    }

    private _runSchedule(type: 'wall' | 'door' | 'window' | 'slab' | 'column'): void {
        const text = aiService.generateScheduleReport(type);
        this._showResult(`<pre style="white-space:pre-wrap;font-size:10px;line-height:1.4;font-family:var(--app-font);">${this._escapeHtml(text)}</pre>`);
    }

    private async _analyzeActions(): Promise<void> {
        const proposals = await aiService.getCommandProposals();
        commandProposalStore.clear();
        proposals.forEach((p: any) => commandProposalStore.add(p));
        this._renderProposals();
    }

    // ─────────────────────────────────────────────────────────────────────
    // Proposals rendering
    // ─────────────────────────────────────────────────────────────────────

    private _renderProposals(): void {
        if (!this._proposalsEl) return;
        const proposals = commandProposalStore.getAll();
        this._proposalsEl.innerHTML = '';

        if (proposals.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'ai-empty-state';
            empty.textContent = 'No pending proposals. Click "Analyze" to generate suggestions.';
            this._proposalsEl.appendChild(empty);
            return;
        }

        proposals.forEach((p: CommandProposal) => {
            const card = this._buildProposalCard(p);
            this._proposalsEl!.appendChild(card);
        });
    }

    private _buildProposalCard(proposal: CommandProposal): HTMLElement {
        const isValid = proposal.validation.ok;

        const card = document.createElement('div');
        card.className = `ai-card ${isValid ? 'ai-card--valid' : 'ai-card--invalid'}`;

        const header = document.createElement('div');
        header.className = 'ai-card-header';

        const title = document.createElement('span');
        title.className = 'ai-card-title';
        title.textContent = this._escapeHtml(proposal.intentType);

        const status = document.createElement('span');
        status.className = `ai-card-status ${isValid ? 'ai-card-status--valid' : 'ai-card-status--invalid'}`;
        status.textContent = isValid ? 'VALID' : 'INVALID';

        header.appendChild(title);
        header.appendChild(status);

        const rationale = document.createElement('div');
        rationale.className = 'ai-card-rationale';
        rationale.textContent = proposal.rationale;

        const confidence = document.createElement('div');
        confidence.className = 'ai-card-confidence';
        confidence.textContent = `Confidence: ${Math.round(proposal.confidence * 100)}%`;

        card.appendChild(header);
        card.appendChild(rationale);
        card.appendChild(confidence);

        if (!isValid) {
            const errDiv = document.createElement('div');
            errDiv.className = 'ai-card-error';
            errDiv.textContent = proposal.validation.reason || 'Validation failed';
            card.appendChild(errDiv);
        }

        const actions = document.createElement('div');
        actions.className = 'ai-card-actions';

        const approveBtn = document.createElement('button');
        approveBtn.type = 'button';
        approveBtn.className = 'ai-card-btn ai-card-btn--approve';
        approveBtn.textContent = 'Approve';
        approveBtn.disabled = !isValid;
        approveBtn.addEventListener('click', () => {
            this._approveProposal(proposal);
            this._renderProposals();
        });

        const rejectBtn = document.createElement('button');
        rejectBtn.type = 'button';
        rejectBtn.className = 'ai-card-btn ai-card-btn--reject';
        rejectBtn.textContent = 'Reject';
        rejectBtn.addEventListener('click', () => {
            commandProposalStore.remove(proposal.id);
            this._renderProposals();
        });

        actions.appendChild(approveBtn);
        actions.appendChild(rejectBtn);
        card.appendChild(actions);
        return card;
    }

    private _approveProposal(proposal: CommandProposal): void {
        const manager = window.commandManager || // TODO(E.5.x): replace with runtime.bus.executeCommand — Phase E.5.x
                        window.commandContext?.commandManager || // TODO(E.5.x): replace with runtime.bus.executeCommand (commandContext collapsed) — Phase E.5.x
                        window.bimService?.props?.commandManager; // TODO(D.4): replace via EngineBootstrap split — bimService destroyed in D.4 — Phase D.4
        if (!manager) { console.error('[ValidatePanel] CommandManager not found'); return; }

        try {
            const cmd = proposal.command;
            if (!cmd || typeof cmd.execute !== 'function') return;

            // Auto-execute parent wall if needed for openings
            if (cmd.type === CommandType.ADD_OPENING && cmd.targetIds[0]) {
                const wallId = cmd.targetIds[0];
                const wallStore = window.wallStore || window.commandContext?.stores?.wallStore; // TODO(E.wall.S): replace with runtime.stores.wall — Phase E.wall.S
                const exists = wallStore ? !!wallStore.getById(wallId) : false;
                if (!exists) {
                    const parentProposal = commandProposalStore.getAll().find(
                        (p: CommandProposal) => p.command.type === CommandType.CREATE_WALL && p.command.targetIds[0] === wallId
                    );
                    if (parentProposal) {
                        const r = manager.execute(parentProposal.command, { source: 'AI_PROPOSAL', proposalId: parentProposal.id });
                        if (r.success) commandProposalStore.remove(parentProposal.id);
                    }
                }
            }

            const result = manager.execute(cmd, { source: 'AI_PROPOSAL', proposalId: proposal.id });

            if (result.success) {
                aiApprovalStore.append({
                    id: crypto.randomUUID(),
                    proposalId: proposal.id,
                    intent: proposal.intentType as any,
                    commandType: proposal.command.type,
                    commandSnapshot: proposal.command.serialize(),
                    approvedBy: 'User',
                    approvedAt: new Date().toISOString(),
                    rationale: proposal.rationale,
                    confidence: proposal.confidence,
                    validationSummary: proposal.validation.ok ? 'VALID' : (proposal.validation.reason || 'FAILED'),
                });
                commandProposalStore.remove(proposal.id);
                window.runtime?.events?.emit('model-updated', {}); // F.events.8
                window.runtime?.events?.emit('ai-model-update', {}); // F.events.12
                window.runtime?.events?.emit('update-view-browser', {}); // F.events.12
            } else {
                const msg = result.info?.join(', ') || 'Execution failed';
                this._showResult(`<div class="ai-msg ai-msg--error"><strong>Error:</strong> ${this._escapeHtml(msg)}</div>`);
            }
        } catch (err) {
            console.error('[ValidatePanel] Error executing proposal:', err);
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Formatting helpers
    // ─────────────────────────────────────────────────────────────────────

    private _showResult(html: string): void {
        if (!this._resultEl) return;
        this._resultEl.innerHTML = html;
        this._resultEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    private _formatValidationReport(report: any): string {
        let html = `<div style="font-size:11px;font-family:var(--app-font);">`;
        html += `<div style="margin-bottom:6px;font-weight:600;color:var(--app-text);">Validation Results</div>`;
        html += `<div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;">`;
        html += `<span style="background:${report.summary.errors > 0 ? '#fef2f2' : '#f0fdf4'};color:${report.summary.errors > 0 ? '#c62828' : '#166534'};padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;">Errors: ${report.summary.errors}</span>`;
        html += `<span style="background:${report.summary.warnings > 0 ? '#fffbeb' : '#f0fdf4'};color:${report.summary.warnings > 0 ? '#92400e' : '#166534'};padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;">Warnings: ${report.summary.warnings}</span>`;
        html += `<span style="background:#f0f9ff;color:#0369a1;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;">Info: ${report.summary.info}</span>`;
        html += `</div>`;
        if (report.violations.length === 0) {
            html += `<div style="color:#166534;font-weight:500;font-size:11px;">All checks passed!</div>`;
        } else {
            html += this._formatViolationsList(report.violations);
        }
        html += `</div>`;
        return html;
    }

    private _formatViolations(title: string, violations: any[]): string {
        let html = `<div style="font-size:11px;font-family:var(--app-font);">`;
        html += `<div style="margin-bottom:6px;font-weight:600;color:var(--app-text);">${this._escapeHtml(title)}</div>`;
        if (violations.length === 0) {
            html += `<div style="color:#166534;font-weight:500;">No issues found.</div>`;
        } else {
            html += this._formatViolationsList(violations);
        }
        html += `</div>`;
        return html;
    }

    private _formatViolationsList(violations: any[]): string {
        let html = `<div style="display:flex;flex-direction:column;gap:6px;">`;
        violations.forEach((v: any) => {
            const bg    = v.severity.level === 'error' ? 'rgba(220,38,38,0.06)' : v.severity.level === 'warning' ? 'rgba(251,140,0,0.06)' : 'rgba(102,0,255,0.04)';
            const border = v.severity.level === 'error' ? '#c62828' : v.severity.level === 'warning' ? '#f59e0b' : 'var(--app-accent)';
            const icon   = v.severity.level === 'error' ? '!!' : v.severity.level === 'warning' ? '!' : 'i';
            html += `<div style="background:${bg};border-left:3px solid ${border};padding:6px 8px;border-radius:4px;">`;
            html += `<div style="font-weight:600;font-size:10px;margin-bottom:3px;">[${icon}] ${this._escapeHtml(v.ruleName)}</div>`;
            html += `<div style="font-size:10px;color:var(--app-text-2);">${this._escapeHtml(v.message)}</div>`;
            html += `</div>`;
        });
        html += `</div>`;
        return html;
    }

    private _escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
