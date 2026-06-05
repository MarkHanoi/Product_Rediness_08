import type { ProjectMeta } from './ProjectRepository';
import { projectRepository } from './ProjectRepository';
import { getPlanDisplayName } from '@pryzm/core-app-model';

export type HubSection = 'all' | 'starred' | 'recent' | 'archived';

function formatDate(ts: number): string {
    const diff = Date.now() - ts;
    if (diff < 60_000) return 'Just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export interface PhRenderCtx {
    currentSection: string;
    currentSort: string;
    searchQuery: string;
    user: any;
}

export function renderShell(ctx: PhRenderCtx): string {
    return `
        <!-- ── Mobile top bar (MOB-001-PH, visible at ≤768px) ──────── -->
        <div class="ph-mobile-topbar" id="ph-mobile-topbar">
            <button class="ph-mobile-hamburger" id="ph-mobile-hamburger" aria-label="Open navigation" aria-expanded="false">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                    <line x1="3" y1="6" x2="21" y2="6"/>
                    <line x1="3" y1="12" x2="21" y2="12"/>
                    <line x1="3" y1="18" x2="21" y2="18"/>
                </svg>
            </button>
            <span class="ph-mobile-topbar-title" id="ph-mobile-topbar-title">Projects</span>
            <button class="ph-mobile-new-btn" id="ph-mobile-new-btn">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                New
            </button>
        </div>

        <!-- ── Mobile sidebar backdrop ─────────────────────────────── -->
        <div class="ph-mobile-backdrop" id="ph-mobile-backdrop"></div>

        <!-- ── Sidebar ────────────────────────────────── -->
        <aside class="ph-sidebar" id="ph-sidebar">
            ${renderSidebar(ctx)}
        </aside>

        <!-- ── Main content ──────────────────────────── -->
        <main class="ph-main">
            <!-- Title row -->
            <div class="ph-main-header">
                <div class="ph-section-title-row">
                    <svg class="ph-section-title-icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>
                    </svg>
                    <h2 class="ph-section-title" id="ph-section-title">${sectionLabel(ctx.currentSection)}</h2>
                </div>
                <div style="display:flex;align-items:center;gap:10px;">
                    <div class="ph-view-toggle">
                        <button class="ph-view-btn ph-view-btn--active" title="Grid view">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M3 3h7v7H3V3zm11 0h7v7h-7V3zM3 14h7v7H3v-7zm11 0h7v7h-7v-7z"/>
                            </svg>
                        </button>
                        <button class="ph-view-btn" title="List view">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>
                            </svg>
                        </button>
                    </div>
                    <img src="/icons/Logo_Black.svg" alt="PRYZM" class="ph-brand-logo" />
                </div>
            </div>

            <!-- Filter / search bar -->
            <div class="ph-filter-bar">
                <div class="ph-filter-search-wrap">
                    <svg class="ph-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                    </svg>
                    <input class="ph-search-input" id="ph-search" type="text" placeholder="Search projects…">
                </div>
                <div class="ph-filter-sep"></div>
                <span class="ph-sort-label">Sort:</span>
                <button class="ph-sort-btn${ctx.currentSort === 'date' ? ' ph-sort-btn--active' : ''}" data-sort="date">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    Recent
                </button>
                <button class="ph-sort-btn${ctx.currentSort === 'name' ? ' ph-sort-btn--active' : ''}" data-sort="name">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 6h16M4 12h10M4 18h6"/></svg>
                    Name
                </button>
                <button class="ph-sort-btn${ctx.currentSort === 'versions' ? ' ph-sort-btn--active' : ''}" data-sort="versions">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
                    Versions
                </button>
                <button class="ph-sort-btn${ctx.currentSort === 'custom' ? ' ph-sort-btn--active' : ''}" data-sort="custom" title="Drag projects to reorder">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/></svg>
                    Custom
                </button>
            </div>

            <!-- Project grid -->
            <div class="ph-grid" id="ph-grid">
                ${renderGrid(ctx)}
            </div>
        </main>

        <!-- ── New project modal ──────────────────────── -->
        <div class="ph-modal-overlay" id="ph-new-modal" style="display:none;">
            <div class="ph-modal">
                <div class="ph-modal-header">
                    <span class="ph-modal-title">New Project</span>
                    <button class="ph-modal-close" id="ph-modal-close">×</button>
                </div>
                <div class="ph-modal-body">
                    <div class="ph-modal-field">
                        <label class="ph-modal-label">Project name</label>
                        <input class="ph-modal-input" id="ph-new-name" type="text" placeholder="e.g. Riverside Tower" maxlength="80">
                    </div>
                    <div class="ph-modal-field">
                        <label class="ph-modal-label">Description <span style="font-weight:400;opacity:0.7;">(optional)</span></label>
                        <textarea class="ph-modal-input ph-modal-textarea" id="ph-new-description" placeholder="Brief description of this project…" maxlength="280" rows="2"></textarea>
                    </div>
                    <div class="ph-modal-field">
                        <label class="ph-modal-label">Building type</label>
                        <select class="ph-modal-input" id="ph-new-type">
                            <!-- §A.6.c — explicit building typologies drive the
                                 generator: Apartment + House are wired end-to-end.
                                 "Residential — let me choose" defers to the RAC
                                 typology step; Commercial/Mixed/Other are captured
                                 as project metadata (generator wired later). -->
                            <option value="apartment">Apartment</option>
                            <option value="casa-unifamiliar">House — single-family</option>
                            <option value="residential">Residential — let me choose</option>
                            <option value="commercial">Commercial</option>
                            <option value="mixed">Mixed Use</option>
                            <option value="other">Other</option>
                        </select>
                    </div>
                </div>
                <div class="ph-modal-footer">
                    <button class="ph-modal-cancel" id="ph-modal-cancel">Cancel</button>
                    <!-- O.5 — "Skip — blank canvas" keeps the legacy blank-create
                         escape; the primary button launches the guided RAC flow. -->
                    <button class="ph-modal-cancel" id="ph-modal-create-blank" title="Create an empty project and skip the guided setup">Skip — blank canvas</button>
                    <button class="ph-modal-create" id="ph-modal-create">Create &amp; guide me</button>
                </div>
            </div>
        </div>

        <!-- ── Rename modal ───────────────────────────── -->
        <div class="ph-modal-overlay" id="ph-rename-modal" style="display:none;">
            <div class="ph-modal">
                <div class="ph-modal-header">
                    <span class="ph-modal-title">Rename Project</span>
                    <button class="ph-modal-close" data-modal="ph-rename-modal">×</button>
                </div>
                <div class="ph-modal-body">
                    <div class="ph-modal-field">
                        <label class="ph-modal-label">Project name</label>
                        <input class="ph-modal-input" id="ph-rename-input" type="text" maxlength="80">
                    </div>
                </div>
                <div class="ph-modal-footer">
                    <button class="ph-modal-cancel" data-modal="ph-rename-modal">Cancel</button>
                    <button class="ph-modal-create" id="ph-rename-confirm">Rename</button>
                </div>
            </div>
        </div>

        <!-- ── Delete confirmation modal ──────────────── -->
        <div class="ph-modal-overlay" id="ph-delete-modal" style="display:none;">
            <div class="ph-modal">
                <div class="ph-modal-header" style="background: linear-gradient(135deg,#e53e3e,#c53030);">
                    <span class="ph-modal-title">Delete Project</span>
                    <button class="ph-modal-close" data-modal="ph-delete-modal">×</button>
                </div>
                <div class="ph-modal-body">
                    <p id="ph-delete-msg" style="margin:0;font-size:14px;color:var(--app-text);line-height:1.55;"></p>
                </div>
                <div class="ph-modal-footer">
                    <button class="ph-modal-cancel" data-modal="ph-delete-modal">Cancel</button>
                    <button class="ph-modal-create" id="ph-delete-confirm" style="background:linear-gradient(135deg,#e53e3e,#c53030);box-shadow:0 2px 8px rgba(229,62,62,0.3);">Delete</button>
                </div>
            </div>
        </div>

        <!-- ── Members modal (Team / ISO 19650 CDE) ──── -->
        <div class="ph-modal-overlay" id="ph-members-modal" style="display:none;">
            <div class="ph-modal" style="max-width:540px;width:100%;max-height:80vh;overflow-y:auto;">
                <div class="ph-modal-header">
                    <span class="ph-modal-title" id="ph-members-modal-title">Team Members</span>
                    <button class="ph-modal-close" id="ph-members-modal-close">×</button>
                </div>
                <div class="ph-modal-body" id="ph-members-modal-body" style="min-height:160px;">
                    <div class="mp-loading">Loading members…</div>
                </div>
            </div>
        </div>

        <!-- ── Context menu (card ⋯) ──────────────────── -->
        <div class="ph-ctx-menu" id="ph-ctx-menu" style="display:none;">
            <button class="ph-ctx-item" data-action="open">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                Open
            </button>
            <button class="ph-ctx-item" data-action="rename">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                Rename
            </button>
            <button class="ph-ctx-item" data-action="duplicate">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                Duplicate
            </button>
            <button class="ph-ctx-item" data-action="team">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                Team / Members
            </button>
            <button class="ph-ctx-item" data-action="star" id="ph-ctx-star">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                Star
            </button>
            <button class="ph-ctx-item" data-action="archive" id="ph-ctx-archive">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
                Archive
            </button>
            <div class="ph-ctx-divider"></div>
            <button class="ph-ctx-item ph-ctx-item--danger" data-action="delete">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                Delete
            </button>
        </div>
    `;
}

export function renderSidebar(ctx: PhRenderCtx): string {
    const all = projectRepository.listProjects();
    const counts = {
        all:      all.filter(p => !p.isArchived).length,
        starred:  all.filter(p => p.isStarred && !p.isArchived).length,
        recent:   Math.min(all.filter(p => !p.isArchived).length, 10),
        archived: all.filter(p => p.isArchived).length,
    };

    const plan = (ctx.user.plan || 'free') as string;
    const isOwner = plan === 'owner';
    const showUpgrade = !isOwner && plan !== 'enterprise';

    const initials = ctx.user.name
        .split(' ')
        .map((n: string) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);

    const item = (section: HubSection, icon: string, label: string, count: number) => {
        const active = ctx.currentSection === section;
        return `
            <div class="ph-sidebar-item${active ? ' ph-sidebar-item--active' : ''}" data-section="${section}">
                ${icon}
                <span class="ph-sidebar-item-label">${label}</span>
                ${count > 0 ? `<span class="ph-sidebar-count">${count}</span>` : ''}
            </div>
        `;
    };

    return `
        <!-- ── Workspace block ─────────────────────────────────────── -->
        <div class="ph-workspace-block">
            <div class="ph-ws-avatar">${initials}</div>
            <span class="ph-ws-name">${escHtml(ctx.user.name)}'s Workspace</span>
            <svg class="ph-ws-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="6 9 12 15 18 9"/>
            </svg>
        </div>

        <!-- ── CTA buttons ─────────────────────────────────────────── -->
        <div class="ph-sidebar-cta-group">
            <button class="ph-sidebar-cta-primary" id="ph-new-btn">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                New Project
            </button>
            <button class="ph-sidebar-cta-secondary" id="ph-import-upload-btn" title="Import / Upload — coming soon" disabled>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                Import / Upload
                <span style="margin-left:auto;font-size:10px;opacity:0.6;">Soon</span>
            </button>
            <!-- §ADD-PEOPLE (2026-05-22): left-sidebar entry to invite collaborators
                 to a project (the card "+" was removed; per-project members also
                 live in each card's ⋯ menu). Opens the members flow. -->
            <button class="ph-sidebar-cta-secondary" id="ph-invite-collab-btn" title="Invite collaborators to a project">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                    <line x1="19" y1="8" x2="19" y2="14"/><line x1="16" y1="11" x2="22" y2="11"/>
                </svg>
                Invite collaborators
            </button>
        </div>

        <!-- ── Nav ────────────────────────────────────────────────── -->
        <div class="ph-sidebar-nav">
            <div class="ph-sidebar-section">
                <div class="ph-sidebar-label">Projects</div>
                ${item('all', `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/></svg>`, 'All Projects', counts.all)}
                ${item('starred', `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`, 'Starred', counts.starred)}
                ${item('recent', `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9z"/></svg>`, 'Recent', counts.recent)}
                ${item('archived', `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>`, 'Archived', counts.archived)}
            </div>

            <div class="ph-sidebar-divider"></div>

            <!-- ── Settings section (Phase 10) ─────────────────────── -->
            <div class="ph-sidebar-section">
                <div class="ph-sidebar-label">Settings</div>
                ${isOwner ? `
                    <button class="ph-settings-btn ph-settings-btn--owner" id="ph-platform-settings-btn" title="Configure platform feature flags">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="3"/>
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                        </svg>
                        Platform Settings
                    </button>
                ` : ''}
                <button class="ph-settings-btn" id="ph-account-settings-btn" title="Account settings — coming soon" disabled>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                        <circle cx="12" cy="7" r="4"/>
                    </svg>
                    Account
                    <span style="margin-left:auto;font-size:10px;opacity:0.45;">Soon</span>
                </button>
                <div class="ph-settings-divider"></div>
                <label class="ph-settings-btn" style="cursor:default;justify-content:space-between;opacity:0.4;pointer-events:none;" title="Design Insights — coming soon">
                    <span style="display:flex;align-items:center;gap:8px;">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                        </svg>
                        Design Insights
                    </span>
                    <span style="font-size:10px;margin-left:auto;margin-right:8px;">Soon</span>
                    <div class="osp-toggle-switch"
                         id="ph-world-model-toggle"
                         style="width:32px;height:18px;border-radius:9px;"
                         role="switch"
                         aria-checked="false"
                         aria-disabled="true">
                        <div class="osp-toggle-thumb" style="width:12px;height:12px;top:3px;left:3px;"></div>
                    </div>
                </label>
            </div>
        </div>

        <!-- ── Footer: plan + sign out ─────────────────────────────── -->
        <div class="ph-sidebar-footer">
            <div class="ph-plan-label">Your Plan</div>
            <div class="ph-plan-badge ph-plan-badge--${plan}">${getPlanDisplayName(plan as any)}</div>
            ${showUpgrade ? `
                <button class="ph-upgrade-btn" id="ph-upgrade-btn">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
                        <polyline points="17 6 23 6 23 12"/>
                    </svg>
                    ${plan === 'free' ? 'Upgrade Plan' : 'Manage Plan'}
                </button>
            ` : ''}
            <button class="ph-sign-out" id="ph-sign-out" title="Sign out of PRYZM">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                    <polyline points="16 17 21 12 16 7"/>
                    <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                Sign out
            </button>
        </div>
    `;
}

export function renderCard(p: ProjectMeta): string {
    const color = colorForProject(p.id);
    const initial = (p.name[0] || 'P').toUpperCase();
    const updated = formatDate(p.updatedAt);
    const isStarred = p.isStarred ?? false;
    const isArchived = p.isArchived ?? false;

    return `
        <div class="ph-card ph-card--project${isArchived ? ' ph-card--archived' : ''}"
             data-project-id="${escHtml(p.id)}"
             data-project-name="${escHtml(p.name)}"
             data-project-starred="${isStarred}"
             data-project-archived="${isArchived}"
             draggable="true"
             role="button" tabindex="0"
             title="Open ${escHtml(p.name)} (drag to reorder)">
            <!-- §CANVAS-CARD (2026-05-22): preview inset is TRANSPARENT so the
                 hub's animated mesh-gradient shows through the glass card (was
                 solid #ffffff → then translucent). A thumbnailed card's capture
                 still covers this area; a no-thumbnail card is fully see-through
                 glass with the initial / mini-grid / label in the project colour.
                 NOTE: to also see the gradient *behind the model* in thumbnailed
                 cards, the thumbnail capture must use a transparent clear colour
                 (initPersistence captureThumbnail) — tracked as a follow-up. -->
            <div class="ph-card-thumb" style="background:transparent;">
                ${p.thumbnail ? `<img class="ph-card-thumb-img" src="${p.thumbnail}" alt="Project preview" draggable="false">` : ''}
                ${isStarred ? `<div class="ph-card-star-badge" title="Starred">★</div>` : ''}
                ${isArchived ? `<div class="ph-card-archive-badge" title="Archived">📦</div>` : ''}
                ${!p.thumbnail ? `<div class="ph-card-thumb-initial" style="color:${color};">${initial}</div>` : ''}
                ${!p.thumbnail ? `<div class="ph-card-thumb-label" style="color:${color};">BIM Project</div>` : ''}
                ${!p.thumbnail ? `<div class="ph-card-thumb-grid">${miniGrid(color)}</div>` : ''}
            </div>
            <div class="ph-card-info">
                <div class="ph-card-name">${escHtml(p.name)}</div>
                <div class="ph-card-meta">
                    <div class="ph-card-meta-left">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;opacity:0.6">
                            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                        </svg>
                        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${updated}</span>
                    </div>
                    <div class="ph-card-meta-right">
                        <div class="ph-card-privacy">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                            </svg>
                            Private
                        </div>
                    </div>
                </div>
                ${p.description ? `<div class="ph-card-description">${escHtml(p.description)}</div>` : ''}
            </div>
            <button class="ph-card-menu-btn" data-project-id="${escHtml(p.id)}" title="Project options" tabindex="0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
                </svg>
            </button>
        </div>
    `;
}

export function miniGrid(color: string): string {
    const cols = [
        [0, 3, 6, 8], [0, 2, 5, 7], [0, 1, 4, 6],
        [0, 3, 6, 9], [0, 2, 4, 7]
    ];
    const set = cols[Math.floor(Math.random() * cols.length)];
    return set.map(h =>
        `<div style="height:${(h + 2) * 5}px;width:6px;background:${color};opacity:0.7;border-radius:1px;margin:0 1px;align-self:flex-end;"></div>`
    ).join('');
}

export function colorForProject(id: string): string {
    const colors = ['#8B5CF6', '#7B3FF2', '#56c0a0', '#f59e42', '#e26e6e', '#5ba3d4'];
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash + id.charCodeAt(i)) % colors.length;
    return colors[hash];
}

export function escHtml(s: string): string {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
}

export function sectionLabel(currentSection: string): string {
    const labels: Record<HubSection, string> = {
        all: 'All Projects',
        starred: 'Starred',
        recent: 'Recent',
        archived: 'Archived',
    };
    return labels[currentSection as HubSection] ?? currentSection;
}

export function getFilteredProjects(ctx: PhRenderCtx): ProjectMeta[] {
    const all = projectRepository.listProjects();
    let list: ProjectMeta[];

    switch (ctx.currentSection) {
        case 'starred':
            list = all.filter(p => p.isStarred && !p.isArchived);
            break;
        case 'recent':
            list = all.filter(p => !p.isArchived)
                .sort((a, b) => b.updatedAt - a.updatedAt)
                .slice(0, 10);
            break;
        case 'archived':
            list = all.filter(p => p.isArchived);
            break;
        default:
            list = all.filter(p => !p.isArchived);
    }

    // Search filter
    if (ctx.searchQuery) {
        list = list.filter(p => p.name.toLowerCase().includes(ctx.searchQuery));
    }

    // Sort
    switch (ctx.currentSort) {
        case 'name':
            list = list.slice().sort((a, b) => a.name.localeCompare(b.name));
            break;
        case 'versions':
            list = list.slice().sort((a, b) => b.versionCount - a.versionCount);
            break;
        case 'custom':
            list = list.slice().sort((a, b) => {
                const ao = a.displayOrder ?? Number.MAX_SAFE_INTEGER;
                const bo = b.displayOrder ?? Number.MAX_SAFE_INTEGER;
                if (ao !== bo) return ao - bo;
                return b.updatedAt - a.updatedAt;
            });
            break;
        default: // 'date'
            list = list.slice().sort((a, b) => b.updatedAt - a.updatedAt);
    }

    return list;
}

export function renderGrid(ctx: PhRenderCtx): string {
    const projects = getFilteredProjects(ctx);
    const showNewCard = ctx.currentSection !== 'archived';

    const cards = projects.map(p => renderCard(p)).join('');

    if (!showNewCard && projects.length === 0) {
        return '';
    }

    const newCard = showNewCard ? `
        <div class="ph-card ph-card--new" id="ph-card-new" role="button" tabindex="0" title="Create a new project">
            <div class="ph-card-new-icon">+</div>
            <div class="ph-card-new-label">New project</div>
        </div>
    ` : '';

    return newCard + cards;
}

