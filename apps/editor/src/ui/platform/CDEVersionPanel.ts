/**
 * CDEVersionPanel — ISO 19650 CDE Phase 2 version state UI
 *
 * Contract compliance:
 *   §05 §5   — CSS in AppTheme.ts (vs- prefix)
 *   §05 §7.6 — No independent <style> injection
 *   §01      — Zero BIM engine interaction
 *   §06 §3   — Platform UI layer; no BIM engine imports
 *
 * Renders per-version state cards with:
 *   - CDE state badge (WIP / Shared / Published / Archived) colour-coded
 *   - Revision and suitability codes
 *   - Structured name display (assembled ISO 19650 filename)
 *   - State transition buttons (role-gated — only valid transitions shown)
 *   - Rejection reason field (required when rejecting Shared → WIP)
 *   - Audit trail timeline (chronological list of transitions)
 *
 * Class prefix: vs-  (Version State)
 */

import { injectAppTheme } from '../styles/AppTheme';
import {
    CDEState, CDERole, CDE_STATE_DISPLAY, StructuredName, assembleFilename,
} from '@pryzm/protocol';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CDEVersionState {
    versionId: string;
    projectId: string;
    label: string;
    timestamp: number;
    elementCount: number;
    state: CDEState;
    revisionCode?: string | null;
    suitabilityCode?: string | null;
    structuredName?: StructuredName | null;
    rejectionReason?: string | null;
    transitionedBy?: string | null;
    transitionedAt?: number | null;
}

export interface CDEAuditEntry {
    id: string;
    action: string;
    performedBy: string;
    performedAt: number;
    fromState: CDEState;
    toState: CDEState;
    reason?: string | null;
}

export interface CDEVersionPanelCallbacks {
    currentUserRole: CDERole | null;
    isOwner?: boolean;
    onTransition: (
        versionId: string,
        targetState: CDEState,
        opts: { reason?: string; revisionCode?: string; suitabilityCode?: string }
    ) => Promise<void>;
    onLoadAuditLog?: (versionId: string) => Promise<CDEAuditEntry[]>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(ts: number): string {
    return new Date(ts).toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
}

function escHtml(s: string): string {
    return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));
}

// ── Allowed transitions per state + role ─────────────────────────────────────

function getAllowedTransitions(state: CDEState, role: CDERole | null, isOwner: boolean): CDEState[] {
    if (state === 'archived') return [];
    const results: CDEState[] = [];

    const can = (action: string) => {
        if (isOwner) return true;
        const map: Record<string, CDERole[]> = {
            move_to_shared:    ['team_manager', 'lead_appointed'],
            move_to_published: ['lead_appointed'],
            reject_to_wip:     ['team_manager', 'lead_appointed'],
            archive:           ['lead_appointed', 'appointing_party'],
        };
        return (map[action] ?? []).includes(role as CDERole);
    };

    if (state === 'wip'       && can('move_to_shared'))    results.push('shared');
    if (state === 'shared'    && can('move_to_published'))  results.push('published');
    if (state === 'shared'    && can('reject_to_wip'))      results.push('wip');
    if (state === 'published' && can('archive'))            results.push('archived');

    return results;
}

// ── Component ────────────────────────────────────────────────────────────────

export class CDEVersionPanel {
    private el: HTMLElement;
    private expandedVersionId: string | null = null;
    private auditCache = new Map<string, CDEAuditEntry[]>();

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(
        private container: HTMLElement,
        private versions: CDEVersionState[],
        private callbacks: CDEVersionPanelCallbacks,
        runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null,
    ) {
        this.runtime = runtime;
        injectAppTheme();
        this.el = document.createElement('div');
        this.el.className = 'vs-panel';
        this.container.appendChild(this.el);
        this.render();
    }

    updateVersions(versions: CDEVersionState[]): void {
        this.versions = versions;
        this.render();
    }

    private render(): void {
        if (this.versions.length === 0) {
            this.el.innerHTML = `<div class="vs-empty">No versions saved yet. Save your first version to begin the CDE workflow.</div>`;
            return;
        }

        this.el.innerHTML = `
            <div class="vs-list">
                ${this.versions.map(v => this.renderVersionCard(v)).join('')}
            </div>
        `;
        this.attachListeners();
    }

    private renderVersionCard(v: CDEVersionState): string {
        const display = CDE_STATE_DISPLAY[v.state] ?? CDE_STATE_DISPLAY.wip;
        const isExpanded = this.expandedVersionId === v.versionId;
        const filename = v.structuredName ? assembleFilename({ ...v.structuredName, revision: v.revisionCode ?? undefined, suitability: (v.suitabilityCode as any) ?? undefined }) : null;
        const transitions = getAllowedTransitions(v.state, this.callbacks.currentUserRole, this.callbacks.isOwner ?? false);

        return `
            <div class="vs-card" data-version-id="${escHtml(v.versionId)}">
                <div class="vs-card-header" data-toggle="${escHtml(v.versionId)}">
                    <div class="vs-card-left">
                        <span class="vs-state-badge" style="background:${display.bg};color:${display.color};border-color:${display.color}40;">
                            ${display.label}
                        </span>
                        <div class="vs-card-info">
                            <div class="vs-card-label">${escHtml(v.label)}</div>
                            ${filename ? `<div class="vs-card-filename" title="ISO 19650 name">${escHtml(filename)}</div>` : ''}
                            <div class="vs-card-meta">
                                ${formatDate(v.timestamp)} · ${v.elementCount} elements
                                ${v.revisionCode ? ` · Rev ${escHtml(v.revisionCode)}` : ''}
                                ${v.suitabilityCode ? ` · ${escHtml(v.suitabilityCode)}` : ''}
                            </div>
                        </div>
                    </div>
                    <div class="vs-card-right">
                        ${transitions.map(t => this.renderTransitionButton(v, t)).join('')}
                        <button class="vs-expand-btn" data-toggle="${escHtml(v.versionId)}" title="${isExpanded ? 'Collapse' : 'Expand audit trail'}">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="transform:rotate(${isExpanded ? '180' : '0'}deg);transition:transform 0.15s;">
                                <polyline points="6 9 12 15 18 9"/>
                            </svg>
                        </button>
                    </div>
                </div>

                ${v.rejectionReason ? `
                    <div class="vs-rejection-banner">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        Rejected: ${escHtml(v.rejectionReason)}
                    </div>
                ` : ''}

                ${isExpanded ? this.renderAuditTrail(v.versionId) : ''}

                <!-- Transition form (shown when transition button clicked) -->
                <div class="vs-transition-form" id="vs-form-${escHtml(v.versionId)}" style="display:none;">
                    <div class="vs-form-body">
                        <textarea class="vs-reason-input" id="vs-reason-${escHtml(v.versionId)}" placeholder="Reason for rejection (required)…" rows="2"></textarea>
                        <div class="vs-form-actions">
                            <button class="vs-form-cancel" data-version-id="${escHtml(v.versionId)}">Cancel</button>
                            <button class="vs-form-confirm vs-form-confirm--reject" data-version-id="${escHtml(v.versionId)}" data-target-state="wip">Confirm Rejection</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    private renderTransitionButton(v: CDEVersionState, targetState: CDEState): string {
        const labels: Record<CDEState, string> = {
            shared:    'Move to Shared',
            published: 'Publish',
            archived:  'Archive',
            wip:       'Reject to WIP',
        };
        const stateClass: Record<CDEState, string> = {
            shared:    'vs-transition-btn--share',
            published: 'vs-transition-btn--publish',
            archived:  'vs-transition-btn--archive',
            wip:       'vs-transition-btn--reject',
        };
        const label = labels[targetState] ?? targetState;
        const modClass = stateClass[targetState] ?? 'vs-transition-btn--archive';

        return `
            <button
                class="vs-transition-btn ${modClass}"
                data-version-id="${escHtml(v.versionId)}"
                data-target-state="${targetState}"
                title="${label}"
            >${label}</button>
        `;
    }

    private renderAuditTrail(versionId: string): string {
        const entries = this.auditCache.get(versionId);
        if (!entries) {
            return `<div class="vs-audit" id="vs-audit-${escHtml(versionId)}"><div class="vs-audit-loading">Loading audit trail…</div></div>`;
        }
        if (entries.length === 0) {
            return `<div class="vs-audit"><div class="vs-audit-empty">No state transitions yet.</div></div>`;
        }

        return `
            <div class="vs-audit">
                <div class="vs-audit-title">Audit Trail</div>
                <div class="vs-audit-list">
                    ${entries.map(e => `
                        <div class="vs-audit-entry">
                            <div class="vs-audit-dot" data-cde-state="${e.toState}"></div>
                            <div class="vs-audit-content">
                                <div class="vs-audit-action">${escHtml(e.action.replace('transition:', '').replace('->', ' → '))}</div>
                                <div class="vs-audit-meta">by ${escHtml(e.performedBy)} · ${formatDate(e.performedAt)}</div>
                                ${e.reason ? `<div class="vs-audit-reason">"${escHtml(e.reason)}"</div>` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    private attachListeners(): void {
        // Expand/collapse toggle
        this.el.querySelectorAll<HTMLElement>('[data-toggle]').forEach(el => {
            el.addEventListener('click', async (e) => {
                e.stopPropagation();
                const versionId = el.dataset.toggle!;
                if (this.expandedVersionId === versionId) {
                    this.expandedVersionId = null;
                } else {
                    this.expandedVersionId = versionId;
                    // Load audit if not cached
                    if (!this.auditCache.has(versionId) && this.callbacks.onLoadAuditLog) {
                        this.render();
                        try {
                            const entries = await this.callbacks.onLoadAuditLog(versionId);
                            this.auditCache.set(versionId, entries);
                        } catch {
                            this.auditCache.set(versionId, []);
                        }
                    }
                }
                this.render();
            });
        });

        // Transition buttons
        this.el.querySelectorAll<HTMLButtonElement>('.vs-transition-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const versionId = btn.dataset.versionId!;
                const targetState = btn.dataset.targetState as CDEState;

                // Rejection needs a reason form — show the inline form
                if (targetState === 'wip') {
                    const form = this.el.querySelector<HTMLElement>(`#vs-form-${versionId}`);
                    if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
                    return;
                }

                this.executeTransition(versionId, targetState, {});
            });
        });

        // Rejection confirm
        this.el.querySelectorAll<HTMLButtonElement>('.vs-form-confirm').forEach(btn => {
            btn.addEventListener('click', async () => {
                const versionId = btn.dataset.versionId!;
                const targetState = btn.dataset.targetState as CDEState;
                const reasonEl = this.el.querySelector<HTMLTextAreaElement>(`#vs-reason-${versionId}`);
                const reason = reasonEl?.value.trim() ?? '';
                await this.executeTransition(versionId, targetState, { reason });
            });
        });

        // Form cancel
        this.el.querySelectorAll<HTMLButtonElement>('.vs-form-cancel').forEach(btn => {
            btn.addEventListener('click', () => {
                const versionId = btn.dataset.versionId!;
                const form = this.el.querySelector<HTMLElement>(`#vs-form-${versionId}`);
                if (form) form.style.display = 'none';
            });
        });
    }

    private async executeTransition(versionId: string, targetState: CDEState, opts: { reason?: string }): Promise<void> {
        try {
            await this.callbacks.onTransition(versionId, targetState, opts);
            this.auditCache.delete(versionId);
            // State is updated externally — parent must call updateVersions()
        } catch (e: any) {
            alert(`Transition failed: ${e?.message ?? 'Unknown error'}`);
        }
    }

    destroy(): void {
        this.el.remove();
    }
}
