/**
 * ProjectMemberPanel — ISO 19650 CDE Phase 1 member management UI
 *
 * Contract compliance:
 *   §05 §5   — CSS in AppTheme.ts (mp- prefix)
 *   §05 §7.6 — No independent <style> injection
 *   §01      — Zero BIM engine interaction
 *   §06 §3   — Platform UI layer; no BIM engine imports
 *
 * Implements ISO 19650-1:2018 §5.1 role hierarchy:
 *   appointing_party | lead_appointed | team_manager | team_member | viewer
 *
 * Class prefix: mp-  (Member Panel)
 */

import { injectAppTheme } from '../styles/AppTheme';
import { CDERole, CDE_ROLE_LABELS } from '@pryzm/protocol';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ProjectMember {
    id: string;
    projectId: string;
    userId: string;
    displayName?: string;
    email?: string;
    role: CDERole;
    invitedBy?: string;
    invitedAt?: number;
    acceptedAt?: number | null;
}

export interface ProjectMemberPanelCallbacks {
    /** Load current members from server */
    onLoadMembers: (projectId: string) => Promise<ProjectMember[]>;
    /** Invite a new member */
    onInviteMember: (projectId: string, userId: string, role: CDERole) => Promise<ProjectMember>;
    /** Change a member's role */
    onChangeRole: (projectId: string, userId: string, role: CDERole) => Promise<ProjectMember>;
    /** Remove a member */
    onRemoveMember: (projectId: string, userId: string) => Promise<void>;
    /** Current user's role — controls which actions are shown */
    currentUserRole: CDERole | null;
    /** Is the current user the platform owner? */
    isOwner?: boolean;
}

// ── Component ────────────────────────────────────────────────────────────────

export class ProjectMemberPanel {
    private el: HTMLElement;
    private projectId: string;
    private members: ProjectMember[] = [];
    private loading = false;
    private error: string | null = null;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(
        private container: HTMLElement,
        projectId: string,
        private callbacks: ProjectMemberPanelCallbacks,
        runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null,
    ) {
        this.runtime = runtime;
        injectAppTheme();
        this.projectId = projectId;
        this.el = document.createElement('div');
        this.el.className = 'mp-panel';
        this.container.appendChild(this.el);
        this.loadMembers();
    }

    private canInvite(): boolean {
        if (this.callbacks.isOwner) return true;
        const r = this.callbacks.currentUserRole;
        return r === 'appointing_party' || r === 'lead_appointed' || r === 'team_manager';
    }

    private canChangeRole(): boolean {
        if (this.callbacks.isOwner) return true;
        const r = this.callbacks.currentUserRole;
        return r === 'appointing_party' || r === 'lead_appointed';
    }

    private canRemove(): boolean {
        return this.canChangeRole();
    }

    private async loadMembers(): Promise<void> {
        this.loading = true;
        this.error = null;
        this.render();
        try {
            this.members = await this.callbacks.onLoadMembers(this.projectId);
        } catch (e: any) {
            this.error = e?.message ?? 'Failed to load members';
        } finally {
            this.loading = false;
            this.render();
        }
    }

    private render(): void {
        this.el.innerHTML = `
            <div class="mp-header">
                <h3 class="mp-title">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                        <circle cx="9" cy="7" r="4"/>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
                    Project Members
                </h3>
                <span class="mp-count">${this.members.length} member${this.members.length !== 1 ? 's' : ''}</span>
            </div>

            ${this.loading ? '<div class="mp-loading">Loading members…</div>' : ''}
            ${this.error ? `<div class="mp-error">${this.escHtml(this.error)}</div>` : ''}

            ${!this.loading && !this.error ? this.renderMemberList() : ''}

            ${this.canInvite() ? this.renderInviteForm() : ''}
        `;
        this.attachListeners();
    }

    private renderMemberList(): string {
        if (this.members.length === 0) {
            return `<div class="mp-empty">No members yet. Invite your first collaborator below.</div>`;
        }
        return `
            <div class="mp-list">
                ${this.members.map(m => this.renderMemberRow(m)).join('')}
            </div>
        `;
    }

    private renderMemberRow(m: ProjectMember): string {
        const initial = (m.displayName ?? m.userId ?? '?')[0].toUpperCase();
        const roleLabel = CDE_ROLE_LABELS[m.role] ?? m.role;
        const pending = !m.acceptedAt;

        const roleSelect = this.canChangeRole() ? `
            <select class="mp-role-select" data-user-id="${this.escHtml(m.userId)}" aria-label="Change role">
                ${(Object.entries(CDE_ROLE_LABELS) as [CDERole, string][]).map(([val, lbl]) =>
                    `<option value="${val}"${val === m.role ? ' selected' : ''}>${lbl}</option>`
                ).join('')}
            </select>
        ` : `<span class="mp-role-label">${this.escHtml(roleLabel)}</span>`;

        const removeBtn = this.canRemove() ? `
            <button class="mp-remove-btn" data-user-id="${this.escHtml(m.userId)}" title="Remove member" aria-label="Remove ${this.escHtml(m.displayName ?? m.userId)}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
        ` : '';

        return `
            <div class="mp-member-row${pending ? ' mp-member-row--pending' : ''}" data-user-id="${this.escHtml(m.userId)}">
                <div class="mp-avatar">${initial}</div>
                <div class="mp-member-info">
                    <div class="mp-member-name">
                        ${this.escHtml(m.displayName ?? m.userId)}
                        ${pending ? '<span class="mp-pending-badge">Pending</span>' : ''}
                    </div>
                    ${m.email ? `<div class="mp-member-email">${this.escHtml(m.email)}</div>` : ''}
                </div>
                <div class="mp-member-role">
                    ${roleSelect}
                </div>
                ${removeBtn}
            </div>
        `;
    }

    private renderInviteForm(): string {
        return `
            <div class="mp-invite-section">
                <div class="mp-invite-title">Invite member</div>
                <div class="mp-invite-form">
                    <input
                        class="mp-invite-input"
                        id="mp-invite-input"
                        type="text"
                        placeholder="User ID or email address"
                        autocomplete="off"
                    />
                    <select class="mp-invite-role" id="mp-invite-role" aria-label="Select role">
                        ${(Object.entries(CDE_ROLE_LABELS) as [CDERole, string][]).map(([val, lbl]) =>
                            `<option value="${val}"${val === 'team_member' ? ' selected' : ''}>${lbl}</option>`
                        ).join('')}
                    </select>
                    <button class="mp-invite-btn" id="mp-invite-btn">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>
                        Invite
                    </button>
                </div>
                <div class="mp-invite-error" id="mp-invite-error" style="display:none;"></div>
            </div>
        `;
    }

    private attachListeners(): void {
        // Role change dropdowns
        this.el.querySelectorAll<HTMLSelectElement>('.mp-role-select').forEach(select => {
            select.addEventListener('change', async () => {
                const userId = select.dataset.userId!;
                const newRole = select.value as CDERole;
                try {
                    await this.callbacks.onChangeRole(this.projectId, userId, newRole);
                    await this.loadMembers();
                } catch (e: any) {
                    this.showInviteError(e?.message ?? 'Failed to change role');
                }
            });
        });

        // Remove buttons
        this.el.querySelectorAll<HTMLButtonElement>('.mp-remove-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const userId = btn.dataset.userId!;
                if (!confirm(`Remove this member from the project?`)) return;
                try {
                    await this.callbacks.onRemoveMember(this.projectId, userId);
                    await this.loadMembers();
                } catch (e: any) {
                    this.showInviteError(e?.message ?? 'Failed to remove member');
                }
            });
        });

        // Invite button
        const inviteBtn = this.el.querySelector('#mp-invite-btn');
        inviteBtn?.addEventListener('click', () => this.handleInvite());

        // Enter on input
        const inviteInput = this.el.querySelector<HTMLInputElement>('#mp-invite-input');
        inviteInput?.addEventListener('keydown', (e) => {
            if ((e as KeyboardEvent).key === 'Enter') this.handleInvite();
        });
    }

    private async handleInvite(): Promise<void> {
        const input = this.el.querySelector<HTMLInputElement>('#mp-invite-input');
        const roleSelect = this.el.querySelector<HTMLSelectElement>('#mp-invite-role');
        if (!input || !roleSelect) return;

        const userId = input.value.trim();
        const role = roleSelect.value as CDERole;

        if (!userId) {
            this.showInviteError('Please enter a user ID or email address');
            return;
        }

        const inviteBtn = this.el.querySelector<HTMLButtonElement>('#mp-invite-btn');
        if (inviteBtn) { inviteBtn.disabled = true; inviteBtn.textContent = 'Inviting…'; }

        try {
            await this.callbacks.onInviteMember(this.projectId, userId, role);
            input.value = '';
            this.hideInviteError();
            await this.loadMembers();
        } catch (e: any) {
            this.showInviteError(e?.message ?? 'Failed to invite member');
        } finally {
            if (inviteBtn) { inviteBtn.disabled = false; inviteBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Invite`; }
        }
    }

    private showInviteError(msg: string): void {
        const el = this.el.querySelector<HTMLElement>('#mp-invite-error');
        if (el) { el.textContent = msg; el.style.display = 'block'; }
    }

    private hideInviteError(): void {
        const el = this.el.querySelector<HTMLElement>('#mp-invite-error');
        if (el) { el.style.display = 'none'; el.textContent = ''; }
    }

    private escHtml(s: string): string {
        return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));
    }

    destroy(): void {
        this.el.remove();
    }
}
