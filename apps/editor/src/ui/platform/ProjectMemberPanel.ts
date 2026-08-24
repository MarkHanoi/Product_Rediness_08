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

/**
 * Which store answered the members read.
 *
 * §FIX-MEMBERS-ABSENT-VS-UNREACHABLE — `[]` from `'postgres'` is a MEASUREMENT
 * ("this project has no members"). `[]` from `'memory'` is a volatile
 * in-process Map that nothing durable ever writes to, so it means "unknown".
 * The panel must not render those two as the same sentence.
 */
export type MemberSource = 'supabase' | 'postgres' | 'memory';

/** Optional richer return from `onLoadMembers` — a plain array is still accepted. */
export interface MemberLoadResult {
    readonly members: ProjectMember[];
    readonly source?: MemberSource | string | null;
}

export interface ProjectMemberPanelCallbacks {
    /**
     * Load current members from server.
     *
     * MUST REJECT when the read fails. Resolving with `[]` on a failed fetch is
     * the defect this panel is built against: "the request failed" and "there
     * are no members" are opposite facts with opposite fixes (C01 §6 rule 6).
     */
    onLoadMembers: (projectId: string) => Promise<ProjectMember[] | MemberLoadResult>;
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

    /**
     * §FIX-MEMBERS-ABSENT-VS-UNREACHABLE — TRUE only after a load that actually
     * SUCCEEDED. `members.length` is meaningless until then, so nothing may
     * render a count, an empty-state, or the word "members" off it.
     *
     * THE DEFECT THIS EXISTS TO STOP (production, 2026-08-24): the members
     * request failed and the modal showed "Project Members — 0 members" over
     * "No members yet. Invite your first collaborator below." A request that
     * FAILED was presented as a successful answer meaning EMPTY. That reading is
     * strictly worse than no reading: the founder's next action would have been
     * to re-invite people who were already there.
     */
    private loaded = false;

    /** Which backend answered the successful read; null until one has. */
    private source: string | null = null;

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
        // Drop the previous reading BEFORE the request. A stale count rendered
        // next to a fresh error is its own small lie.
        this.loaded = false;
        this.source = null;
        this.render();
        try {
            const result = await this.callbacks.onLoadMembers(this.projectId);
            if (Array.isArray(result)) {
                this.members = result;
                this.source = null;
            } else {
                this.members = Array.isArray(result?.members) ? result.members : [];
                this.source = typeof result?.source === 'string' ? result.source : null;
            }
            // Set ONLY on the success path — this is the flag every count and
            // empty-state below is gated on.
            this.loaded = true;
        } catch (e: any) {
            this.members = [];
            this.loaded = false;
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
                <span class="mp-count">${this.renderCount()}</span>
            </div>

            ${this.loading ? '<div class="mp-loading">Loading members…</div>' : ''}
            ${this.error ? this.renderLoadError() : ''}

            ${this.loaded ? this.renderMemberList() : ''}
            ${this.loaded ? this.renderSourceNotice() : ''}

            ${this.canInvite() ? this.renderInviteForm() : ''}
        `;
        this.attachListeners();
    }

    /**
     * §FIX-MEMBERS-ABSENT-VS-UNREACHABLE — the count is a MEASUREMENT and may
     * only be printed when a measurement exists. Before this, the header read
     * `${this.members.length} members` unconditionally, so a failed request
     * printed the literal string "0 members" — the exact sentence the founder
     * saw on production over a request that had 400'd.
     */
    private renderCount(): string {
        if (this.loading) return 'Loading…';
        if (this.error) return 'count unavailable';
        if (!this.loaded) return 'count unavailable';
        return `${this.members.length} member${this.members.length !== 1 ? 's' : ''}`;
    }

    /**
     * The failure state. It must say WHAT failed and offer the retry, and it
     * must never be mistakable for an empty project.
     */
    private renderLoadError(): string {
        return `
            <div class="mp-error" role="alert">
                <div><strong>Could not load the member list.</strong></div>
                <div class="mp-error-detail">${this.escHtml(this.error ?? '')}</div>
                <div class="mp-error-detail">This is not a report that the project has no members — the list is unknown until this read succeeds.</div>
                <button class="mp-retry-btn" id="mp-retry-btn" type="button">Retry</button>
            </div>
        `;
    }

    /**
     * A successful read from the volatile in-process Map is still not a durable
     * fact. Saying so is cheap; discovering it after a restart is not.
     */
    private renderSourceNotice(): string {
        if (this.source !== 'memory') return '';
        return `<div class="mp-source-notice">Membership on this server is held in memory only — invites will not survive a restart.</div>`;
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
        // §FIX-MEMBERS-ROW-SHAPE — the Supabase read path returned RAW snake_case
        // rows (`user_id`), so `displayName` and `userId` were BOTH undefined
        // here: `undefined[0]` threw and blanked the whole modal, and
        // `escHtml(undefined)` threw on `.replace`. The server now normalises
        // every backend to one shape, but a UI that CRASHES on a missing field
        // is a second defect, so both reads are made total.
        const label = m.displayName || m.userId || m.email || 'Unknown member';
        const initial = (label.trim()[0] ?? '?').toUpperCase();
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
            <button class="mp-remove-btn" data-user-id="${this.escHtml(m.userId)}" title="Remove member" aria-label="Remove ${this.escHtml(label)}">
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
                        ${this.escHtml(label)}
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
        // §FIX-MEMBERS-ABSENT-VS-UNREACHABLE — a failure state without a way out
        // is only half honest (see the "refusing half needs its escape hatch"
        // rule, L-942): telling the user the read failed obliges us to let them
        // retry it without reopening the modal.
        this.el.querySelector<HTMLButtonElement>('#mp-retry-btn')
            ?.addEventListener('click', () => { void this.loadMembers(); });

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

    private escHtml(s: string | null | undefined): string {
        if (s === null || s === undefined) return '';
        return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));
    }

    destroy(): void {
        this.el.remove();
    }
}
