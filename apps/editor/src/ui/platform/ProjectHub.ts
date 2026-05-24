/**
 * ProjectHub — CDE-compliant project browser
 *
 * Contract compliance:
 *   §05 §5   — CSS in AppTheme.ts (ph- prefix)
 *   §05 §7.6 — No independent <style> injection
 *   §01      — Zero BIM engine interaction
 *   §06 §7   — Project reads/writes via projectRepository (single source of truth)
 *
 * CDE Phase 4 additions:
 *   • Sidebar sections: All Projects (with count), Starred, Recent, Archived
 *   • Sort/filter bar: sort by name / date / version count
 *   • Context menu on project cards: Rename, Duplicate, Star/Unstar, Archive, Delete
 *   • Delete / Archive confirmation modals
 *   • Description field in "New Project" modal
 *   • Empty states for each section
 *   • Owner plan badge (no upgrade button for owner)
 *
 * Class prefix: ph-  (Project Hub)
 */

import { getFrameScheduler } from '@pryzm/frame-scheduler';
import { injectAppTheme } from '../styles/AppTheme';
import { PlatformUser, signOut } from './AuthModal';
import { projectRepository, ProjectMeta } from './ProjectRepository';
import { EntitlementStore } from '@pryzm/core-app-model';
import { getPlanDisplayName, PLAN_LIMITS } from '@pryzm/core-app-model';
import { ProjectMemberPanel, ProjectMember } from './ProjectMemberPanel';
import { CDERole } from '@pryzm/protocol';
import { apiFetch } from '@pryzm/core-app-model';
import { OwnerSettingsPanel } from './OwnerSettingsPanel';
import type { ProjectSummary } from '@pryzm/stores';
import { renderShell as phRenderShell, renderSidebar as phRenderSidebar, sectionLabel as phSectionLabel, renderGrid as phRenderGrid } from './ProjectHubTemplates';

// ── Helpers ──────────────────────────────────────────────────────────────────

type SortKey = 'date' | 'name' | 'versions' | 'custom';
type HubSection = 'all' | 'starred' | 'recent' | 'archived';

// ── Public interface ──────────────────────────────────────────────────────────

export interface ProjectHubCallbacks {
    onOpenProject: (projectId: string, projectName: string, opts?: { isNewProject?: boolean }) => void;
    onSignOut: () => void;
    /** Called when user clicks "Upgrade" — opens the pricing page */
    onUpgrade?: () => void;
}

// ── ProjectHub class ──────────────────────────────────────────────────────────

export class ProjectHub {
    private root: HTMLElement;
    private el: HTMLElement;
    private user: PlatformUser;

    private currentSection: HubSection = 'all';
    private currentSort: SortKey = 'date';
    private searchQuery = '';

    // Context menu state
    private ctxMenuEl: HTMLElement | null = null;

    // Phase 10: Platform Owner Settings
    private readonly _ownerSettingsPanel = new OwnerSettingsPanel();

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(root: HTMLElement, user: PlatformUser, private callbacks: ProjectHubCallbacks, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        this.root = root;
        this.user = user;
        injectAppTheme();
        this.el = this.build();
        this.root.appendChild(this.el);
        // Sync projects from server on every hub load (fills localStorage across sessions).
        this.syncFromServer();
    }

    // ── Build ─────────────────────────────────────────────────────────────────

    private build(): HTMLElement {
        const el = document.createElement('div');
        el.className = 'ph-shell';
        el.innerHTML = this.renderShell();
        this.attachListeners(el);
        return el;
    }


    private _asCtx(): import('./ProjectHubTemplates').PhRenderCtx {
        return {
            currentSection: this.currentSection,
            currentSort: this.currentSort,
            searchQuery: this.searchQuery,
            user: this.user,
        };
    }

    /**
     * Fetches the project list from the server and reconciles it with the
     * localStorage cache.
     *
     * Wireup (chunks/22 §22.1 step 1.5 — Flow 1 — Landing → Signup → Hub):
     *   Architectural leg = `runtime.persistence.client.list()` (S28 D2,
     *   typed `ProjectListClient.list(): Promise<ProjectSummary[]>`).
     *   The hub now reads via the typed client whenever the runtime is
     *   threaded — the legacy `apiFetch('/api/projects')` v0 read path
     *   is the fallback for the (vanishing) null-runtime call sites.
     *
     * Both paths converge on the same server-side `pgProjectStore`
     * projection and feed the same `projectRepository` localStorage
     * cache that powers offline UX + per-card chip rendering — only the
     * adapter changes.  Reconciliation rules (server = source of truth;
     * stale local-only entries with no version data are purged; entries
     * with local versions are preserved for offline) are unchanged.
     */
    private async syncFromServer(): Promise<void> {
        try {
            const summaries = await this._fetchSummaries();
            if (summaries === null) return;

            const serverIds = new Set(summaries.map(s => s.id));
            let didChange = false;

            // ── Add / update entries from the server ──────────────────────────
            for (const s of summaries) {
                if (!s.id || !s.name) continue;
                const existing = projectRepository.listProjects().find(lp => lp.id === s.id);
                const serverUpdatedAt = Date.parse(s.lastModifiedAt);
                const lastModifiedAt = Number.isFinite(serverUpdatedAt) ? serverUpdatedAt : Date.now();
                if (!existing || existing.updatedAt < lastModifiedAt) {
                    // Thumbnail priority: local > server.
                    // If there is no local thumbnail yet but the server has one (captured
                    // from a previous session or another browser), use the server's copy.
                    const serverThumbnail = s.thumbnailUrl ?? undefined;
                    const resolvedThumbnail = existing?.thumbnail ?? serverThumbnail;
                    projectRepository.saveProject({
                        id: s.id,
                        name: s.name,
                        updatedAt: lastModifiedAt,
                        versionCount: s.versionCount ?? 0,
                        ownerId: s.ownerName,
                        createdAt: existing?.createdAt ?? lastModifiedAt,
                        thumbnail:    resolvedThumbnail,
                        // Server is authoritative for these chips (Phase C
                        // §16.3 C.4.03/04/05).  Falls back to the local cached
                        // value when the server response omits the field
                        // (older REST responses pre-Phase C).
                        isStarred:    s.isStarred ?? existing?.isStarred,
                        isArchived:   s.isArchived ?? existing?.isArchived,
                        description:  (s.description ?? undefined) ?? existing?.description,
                        projectType:  existing?.projectType,
                        cdeSummary:   existing?.cdeSummary,
                    });
                    console.log(`[ProjectHub] Synced project "${s.name}" (${s.id}) — thumbnail: ${existing?.thumbnail ? 'local' : serverThumbnail ? 'from server' : 'none'}`);
                    didChange = true;
                }
            }

            // ── Purge stale local-only entries (conservative) ─────────────────
            // Only remove a local project entry if ALL of these are true:
            //   1. The server has no record of it (not in serverIds)
            //   2. The project has no local version data (nothing to lose)
            // This protects projects created while offline (they have local versions
            // but may not yet be on the server) and free-plan users whose versions
            // never make it to the server.
            const localProjects = projectRepository.listProjects();
            for (const lp of localProjects) {
                if (serverIds.has(lp.id)) continue;
                try {
                    const raw = localStorage.getItem(`bim-project-${lp.id}-versions`);
                    const hasLocalVersions = raw && JSON.parse(raw).length > 0;
                    if (hasLocalVersions) {
                        console.log(`[ProjectHub] Keeping local-only project ${lp.id} — has unsaved local versions`);
                        continue;
                    }
                } catch { /* parse error — keep it to be safe */ continue; }
                console.log(`[ProjectHub] Purging empty stale local project ${lp.id} (not on server, no local data)`);
                projectRepository.deleteProject(lp.id);
                didChange = true;
            }

            if (didChange) {
                console.log(`[ProjectHub] Synced with server: ${summaries.length} project(s)`);
                this.refreshSidebar();
                this.refreshGrid();
            }
        } catch (err) {
            // §SERVER-500-CLIENT-VISIBILITY (Round 39) — surface the server
            // response body too so the architect sees errorId + code in the
            // browser console for support correlation. Round 39 already
            // landed the errorId in the error message (see
            // ProjectListClient.ts), but also logging the full body lets
            // the architect right-click → Copy the entire envelope without
            // having to expand the error object first.
            console.warn('[ProjectHub] Server sync failed (offline?):', err);
            const errBody = (err as { body?: unknown })?.body;
            if (errBody) {
                console.warn('[ProjectHub] server response body:', errBody);
            }
        }
    }

    /**
     * Pull the project list using whichever leg is available.
     *
     *   • Canonical (chunks/22 §22.1 step 1.5):
     *       `runtime.persistence.client.list()` — the typed
     *       `ProjectListClient` instance composed by the runtime.
     *       Returns the canonical `ProjectSummary[]` shape directly
     *       (camelCase, server-authoritative chips).
     *
     *   • Fallback (legacy null-runtime call sites that pre-date
     *     S73-WIRE Phase B):
     *       `apiFetch('/api/projects')` — the v0 REST endpoint with the
     *       same `pgProjectStore` projection.  The snake_case row is
     *       mapped to the same `ProjectSummary` shape so the
     *       reconciliation pass downstream is a single code path.
     *
     * Returns `null` on any non-OK / network failure (the caller logs
     * and continues so an offline hub still renders from cache).
     */
    private async _fetchSummaries(): Promise<ProjectSummary[] | null> {
        if (this.runtime) {
            const summaries = await this.runtime.persistence.client.list() as ProjectSummary[];
            return Array.isArray(summaries) ? summaries : null;
        }
        const res = await apiFetch('/api/projects');
        if (!res.ok) return null;
        const { projects } = await res.json() as { projects?: Array<Record<string, unknown>> };
        if (!Array.isArray(projects)) return null;
        return projects
            .filter(p => typeof p.id === 'string' && typeof p.name === 'string')
            .map(p => {
                const updatedAtIso = typeof p.updated_at === 'string' ? p.updated_at
                    : typeof p.created_at === 'string' ? p.created_at
                    : new Date(0).toISOString();
                const summary: {
                    -readonly [K in keyof ProjectSummary]: ProjectSummary[K];
                } = {
                    id: p.id as string,
                    name: p.name as string,
                    lastModifiedAt: updatedAtIso,
                    thumbnailUrl: (p.thumbnail_url ?? p.thumbnail ?? null) as string | null,
                    ownerName: typeof p.owner_id === 'string' ? p.owner_id : '',
                    collaboratorCount: 0,
                    schemaVersion: 1,
                };
                if (typeof p.version_count === 'number') summary.versionCount = p.version_count;
                if (typeof p.is_archived === 'boolean')  summary.isArchived  = p.is_archived;
                if (typeof p.is_starred === 'boolean')   summary.isStarred   = p.is_starred;
                if (typeof p.description === 'string' || p.description === null) {
                    summary.description = p.description as string | null;
                }
                return summary;
            });
    }

    // ── Shell HTML ────────────────────────────────────────────────────────────

    private renderShell(): string { return phRenderShell(this._asCtx()); }


    // ── Sidebar ───────────────────────────────────────────────────────────────

    private renderSidebar(): string { return phRenderSidebar(this._asCtx()); }


    private sectionLabel(): string { return phSectionLabel(this.currentSection); }


    // ── Grid ──────────────────────────────────────────────────────────────────



    /**
     * Persist a new manual ordering. Called after a drag-and-drop reorder.
     * Reassigns sequential displayOrder values to the projects in `orderedIds`
     * so the order is stable across reloads.
     */
    private persistCustomOrder(orderedIds: string[]): void {
        const all = projectRepository.listProjects();
        const byId = new Map(all.map(p => [p.id, p]));
        orderedIds.forEach((id, idx) => {
            const p = byId.get(id);
            if (!p) return;
            if (p.displayOrder !== idx) {
                projectRepository.saveProject({ ...p, displayOrder: idx });
            }
        });
    }

    private renderGrid(): string { return phRenderGrid(this._asCtx()); }











    // ── Refresh helpers ───────────────────────────────────────────────────────

    private refreshGrid(): void {
        const grid = this.el.querySelector('#ph-grid')!;
        grid.innerHTML = this.renderGrid();
        this.attachGridListeners(this.el);
    }

    private refreshSidebar(): void {
        const sidebar = this.el.querySelector('#ph-sidebar')!;
        sidebar.innerHTML = this.renderSidebar();
        this.attachSidebarListeners(this.el);
    }

    private refreshSectionTitle(): void {
        const title = this.el.querySelector('#ph-section-title');
        if (title) title.textContent = this.sectionLabel();
    }

    private refreshSortBar(): void {
        this.el.querySelectorAll<HTMLElement>('.ph-sort-btn').forEach(btn => {
            btn.classList.toggle('ph-sort-btn--active', btn.dataset.sort === this.currentSort);
        });
    }

    // ── Listeners ─────────────────────────────────────────────────────────────

    private attachListeners(el: HTMLElement): void {
        // ── Mobile sidebar toggle (MOB-001-PH) ────────────────────────────
        const sidebar = el.querySelector<HTMLElement>('#ph-sidebar')!;
        const backdrop = el.querySelector<HTMLElement>('#ph-mobile-backdrop')!;
        const mobileHamburger = el.querySelector<HTMLButtonElement>('#ph-mobile-hamburger')!;
        const closeSidebar = () => {
            sidebar.classList.remove('ph-sidebar--open');
            backdrop.classList.remove('ph-mobile-backdrop--visible');
            mobileHamburger.setAttribute('aria-expanded', 'false');
        };
        mobileHamburger.addEventListener('click', () => {
            const isOpen = sidebar.classList.contains('ph-sidebar--open');
            sidebar.classList.toggle('ph-sidebar--open', !isOpen);
            backdrop.classList.toggle('ph-mobile-backdrop--visible', !isOpen);
            mobileHamburger.setAttribute('aria-expanded', String(!isOpen));
        });
        backdrop.addEventListener('click', closeSidebar);
        el.querySelector('#ph-mobile-new-btn')!.addEventListener('click', () => this.openNewModal());

        // Auto-close sidebar on sidebar-item click (mobile UX)
        sidebar.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target.closest('.ph-sidebar-item') || target.closest('#ph-new-btn') || target.closest('#ph-invite-collab-btn') || target.closest('.ph-settings-btn') || target.closest('#ph-sign-out') || target.closest('#ph-upgrade-btn')) {
                if (window.innerWidth <= 768) closeSidebar();
            }
        });

        // §UI-MAIN-PANEL (DAILY-USE 2026-05-21) — The Sign out / New Project /
        // Upgrade / Import-Upload click listeners have been MOVED into
        // `attachSidebarListeners` (search "§UI-MAIN-PANEL" there). Reason:
        // `refreshSidebar()` (line 303) does `sidebar.innerHTML = …` which
        // destroys + recreates the sidebar DOM, blowing away every listener
        // bound on those elements. Sidebar refreshes happen on plan changes,
        // project add/remove, section nav, etc. — after the FIRST refresh
        // the architect's clicks on Sign Out and New Project went silently
        // unheard. `attachSidebarListeners` IS called by `refreshSidebar`,
        // so binding there keeps refresh ↔ rebind symmetric. The architect
        // reported: "the buttons on the left hand side panel don't get
        // triggered." Root cause: orphaned listeners after every sidebar
        // refresh.

        // Search filter
        el.querySelector('#ph-search')!.addEventListener('input', (e) => {
            this.searchQuery = (e.target as HTMLInputElement).value.toLowerCase().trim();
            this.refreshGrid();
        });

        // Sort buttons
        el.querySelectorAll<HTMLElement>('[data-sort]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.currentSort = btn.dataset.sort as SortKey;
                this.refreshSortBar();
                this.refreshGrid();
            });
        });

        // Sidebar — handles #ph-sign-out, #ph-new-btn, #ph-upgrade-btn,
        // #ph-import-upload-btn, section nav, settings, world-model toggle
        // (all re-bindable on refresh)
        this.attachSidebarListeners(el);

        // Grid
        this.attachGridListeners(el);

        // New project modal
        el.querySelector('#ph-modal-close')!.addEventListener('click', () => this.closeNewModal());
        el.querySelector('#ph-modal-cancel')!.addEventListener('click', () => this.closeNewModal());
        el.querySelector('#ph-new-modal')!.addEventListener('click', (e) => {
            if (e.target === el.querySelector('#ph-new-modal')) this.closeNewModal();
        });
        el.querySelector('#ph-modal-create')!.addEventListener('click', () => this.handleCreate());
        el.querySelector('#ph-new-name')!.addEventListener('keydown', (e) => {
            if ((e as KeyboardEvent).key === 'Enter') this.handleCreate();
        });

        // Generic modal close buttons (rename, delete)
        el.querySelectorAll<HTMLElement>('[data-modal]').forEach(btn => {
            btn.addEventListener('click', () => {
                const modalId = btn.dataset.modal!;
                const modal = el.querySelector('#' + modalId) as HTMLElement | null;
                if (modal) modal.style.display = 'none';
            });
        });

        // Rename confirm
        el.querySelector('#ph-rename-confirm')!.addEventListener('click', () => this.handleRename());
        el.querySelector('#ph-rename-input')!.addEventListener('keydown', (e) => {
            if ((e as KeyboardEvent).key === 'Enter') this.handleRename();
        });

        // Delete confirm
        el.querySelector('#ph-delete-confirm')!.addEventListener('click', () => this.handleDelete());

        // Members modal close
        el.querySelector('#ph-members-modal-close')!.addEventListener('click', () => this.closeMembersModal());
        el.querySelector('#ph-members-modal')!.addEventListener('click', (e) => {
            if (e.target === el.querySelector('#ph-members-modal')) this.closeMembersModal();
        });

        // Global click → close context menu
        document.addEventListener('click', this.onDocClick);
    }

    private attachSidebarListeners(el: HTMLElement): void {
        el.querySelectorAll<HTMLElement>('[data-section]').forEach(item => {
            item.addEventListener('click', () => {
                const section = item.dataset.section as HubSection;
                this.currentSection = section;
                this.refreshSidebar();
                this.refreshSectionTitle();
                this.refreshGrid();
            });
        });

        // §UI-MAIN-PANEL (DAILY-USE 2026-05-21) — moved here from
        // attachListeners() so the handlers survive every refreshSidebar()
        // (which calls innerHTML=… on the sidebar root and destroys all
        // existing listeners). See the explanatory note in attachListeners
        // above the `// Search filter` block.

        // New project button (sidebar CTA — primary)
        el.querySelector('#ph-new-btn')?.addEventListener('click', () => this.openNewModal());

        // §ADD-PEOPLE — Invite collaborators (sidebar CTA). Opens the members
        // flow: 0 projects → prompt to create one; 1 → straight to its members;
        // many → a quick project chooser, then that project's members modal.
        el.querySelector('#ph-invite-collab-btn')?.addEventListener('click', () => this.openInviteCollaborators());

        // Import / Upload button (sidebar CTA — secondary, currently disabled
        // but kept wired so flipping the disabled flag in markup is enough)
        el.querySelector('#ph-import-upload-btn')?.addEventListener('click', () => {
            window.runtime?.events?.emit('import-ifc', {});
        });

        // Upgrade button (footer — only present on free/trial plans)
        el.querySelector('#ph-upgrade-btn')?.addEventListener('click', () => {
            this.callbacks.onUpgrade?.();
        });

        // Sign out (footer) — Phase C.10.04 (PRYZM2-WIREUP-PLAN-S72/14-
        // subphases-A-D.md line 137). Fires `runtime.persistence.client.signOut()`
        // so the server invalidates the bearer token, then clears local-storage
        // session via the legacy `signOut()` helper, then notifies the shell
        // to re-mount the auth modal. Never await — the UX must be instant;
        // if the server call fails the local logout still completes (the
        // token is gone from this browser regardless).
        el.querySelector('#ph-sign-out')?.addEventListener('click', () => {
            if (this.runtime) {
                void this.runtime.persistence.client.signOut().catch(err => {
                    console.warn('[ProjectHub] runtime.persistence.client.signOut failed (continuing local logout):', err);
                });
            }
            signOut();
            this.callbacks.onSignOut();
        });

        // Phase 10: Platform Settings button (owner only)
        el.querySelector('#ph-platform-settings-btn')?.addEventListener('click', () => {
            this._ownerSettingsPanel.open();
        });

        // Phase 10: World model (Design Insights) toggle (all users)
        el.querySelector('#ph-world-model-toggle')?.addEventListener('click', (e) => {
            e.preventDefault();
            const sw = el.querySelector('#ph-world-model-toggle') as HTMLElement;
            const current = localStorage.getItem('pryzm-world-model-prompts') !== 'false';
            const next = !current;
            localStorage.setItem('pryzm-world-model-prompts', String(next));
            sw.classList.toggle('osp-toggle-switch--on', next);
            sw.setAttribute('aria-checked', String(next));
            // Adjust thumb position via inline style since toggle size differs
            const thumb = sw.querySelector<HTMLElement>('.osp-toggle-thumb');
            if (thumb) thumb.style.left = next ? '17px' : '3px';
            console.log(`[ProjectHub] Design Insights prompts → ${next}`);
        });
    }

    /** §CANVAS-CARD Phase 2 — disposers for per-card free-drag listeners; cleared + rebuilt on each refreshGrid so document-level handlers never leak. */
    private _cardDragDisposers: Array<() => void> = [];

    /** §HUB-CANVAS-ZOOM (slice 1) — wheel-zoom scale for the project canvas. 1 = identity
     * (default; cards render exactly as laid out — no fit-all). Persisted across
     * refreshGrid so creating/deleting a project keeps the zoom. Panning is provided by
     * the grid's own scrollbars; drag-to-pan + fit-all are later slices. */
    private _hubZoom = 1;
    private static readonly _HUB_ZOOM_MIN = 0.3;
    private static readonly _HUB_ZOOM_MAX = 2.0;

    private attachGridListeners(el: HTMLElement): void {
        const grid = el.querySelector('#ph-grid') as HTMLElement;

        // New project card
        grid.querySelector('#ph-card-new')?.addEventListener('click', () => this.openNewModal());
        grid.querySelector('#ph-card-new')?.addEventListener('keydown', (e) => {
            if ((e as KeyboardEvent).key === 'Enter') this.openNewModal();
        });

        // Project cards — open (click on card body, not menu btn)
        grid.addEventListener('click', (e) => {
            const menuBtn = (e.target as HTMLElement).closest<HTMLElement>('.ph-card-menu-btn');
            if (menuBtn) {
                e.stopPropagation();
                this.openContextMenu(menuBtn, menuBtn.dataset.projectId!);
                return;
            }
            const card = (e.target as HTMLElement).closest<HTMLElement>('.ph-card--project');
            if (card) this.openProject(card.dataset.projectId!, card.dataset.projectName!);
        });

        grid.addEventListener('keydown', (e) => {
            const card = (e.target as HTMLElement).closest<HTMLElement>('.ph-card--project');
            if (card && (e as KeyboardEvent).key === 'Enter') this.openProject(card.dataset.projectId!, card.dataset.projectName!);
        });

        // ── Drag-and-drop reordering ──────────────────────────────────────────
        let draggingId: string | null = null;
        let draggingEl: HTMLElement | null = null;

        grid.addEventListener('dragstart', (e) => {
            const card = (e.target as HTMLElement).closest<HTMLElement>('.ph-card--project');
            if (!card) return;
            draggingId = card.dataset.projectId || null;
            draggingEl = card;
            card.classList.add('ph-card--dragging');
            if (e.dataTransfer) {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', draggingId || '');
            }
        });

        grid.addEventListener('dragend', () => {
            if (draggingEl) draggingEl.classList.remove('ph-card--dragging');
            grid.querySelectorAll('.ph-card--drop-before, .ph-card--drop-after')
                .forEach(el => el.classList.remove('ph-card--drop-before', 'ph-card--drop-after'));
            draggingId = null;
            draggingEl = null;
        });

        grid.addEventListener('dragover', (e) => {
            if (!draggingId) return;
            const target = (e.target as HTMLElement).closest<HTMLElement>('.ph-card--project');
            if (!target || target === draggingEl) return;
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
            grid.querySelectorAll('.ph-card--drop-before, .ph-card--drop-after')
                .forEach(el => el.classList.remove('ph-card--drop-before', 'ph-card--drop-after'));
            const rect = target.getBoundingClientRect();
            const before = (e.clientX - rect.left) < rect.width / 2;
            target.classList.add(before ? 'ph-card--drop-before' : 'ph-card--drop-after');
        });

        grid.addEventListener('drop', (e) => {
            if (!draggingId) return;
            const target = (e.target as HTMLElement).closest<HTMLElement>('.ph-card--project');
            if (!target || target === draggingEl) return;
            e.preventDefault();

            const rect = target.getBoundingClientRect();
            const before = (e.clientX - rect.left) < rect.width / 2;
            const targetId = target.dataset.projectId!;

            // Build the new order from current visible cards, then move dragged
            // id to before/after the target id.
            const ids = Array.from(grid.querySelectorAll<HTMLElement>('.ph-card--project'))
                .map(el => el.dataset.projectId!)
                .filter(id => id !== draggingId);
            const targetIdx = ids.indexOf(targetId);
            const insertAt = before ? targetIdx : targetIdx + 1;
            ids.splice(insertAt, 0, draggingId);

            // Switch to custom sort so the new order takes effect on render.
            this.currentSort = 'custom';
            this.persistCustomOrder(ids);

            // Update sort button active state then re-render.
            this.el.querySelectorAll<HTMLElement>('.ph-sort-btn').forEach(btn => {
                btn.classList.toggle('ph-sort-btn--active', btn.dataset.sort === this.currentSort);
            });
            this.refreshGrid();
        });

        // §CANVAS-CARD Phase 2 — free drag-to-move layer. Lays the cards out as an
        // absolutely-positioned canvas and disables the HTML5 reorder above (cards
        // get draggable=false). Re-run every refresh; prior listeners disposed first.
        this._attachCanvasDrag(grid);
    }

    // ── §CANVAS-CARD Phase 2 — free "Canvas" drag-to-move ──────────────────────
    //
    // Lays the project cards out as an absolutely-positioned canvas (replacing the
    // CSS grid + HTML5 reorder) so each card can be dragged anywhere; its position
    // is remembered per project in localStorage. Drag is DELTA-based (no
    // getBoundingClientRect → correct regardless of grid scroll). Re-run on every
    // refreshGrid; previous document-level listeners are disposed first so they
    // never leak. A drag past a 5 px threshold suppresses the follow-up click so a
    // move never accidentally opens the project; a plain click still opens it.
    private _attachCanvasDrag(grid: HTMLElement): void {
        for (const d of this._cardDragDisposers) d();
        this._cardDragDisposers = [];

        const CARD_W = 240;
        const GAP    = 20;
        const PAD    = 16;
        const ROW_H  = 244; // approx card height + gap; cards auto-layout, user repositions

        grid.style.position = 'relative';
        grid.style.display  = 'block';

        const cols  = Math.max(1, Math.floor((grid.clientWidth - PAD * 2 + GAP) / (CARD_W + GAP)));
        const cards = Array.from(grid.querySelectorAll<HTMLElement>('.ph-card'));
        let topZ = 10;

        cards.forEach((card, i) => {
            const pid   = card.dataset.projectId || null;
            const saved = pid ? this._loadCardPos(pid) : null;
            const col   = i % cols;
            const row   = Math.floor(i / cols);
            const defLeft = PAD + col * (CARD_W + GAP);
            const defTop  = PAD + row * ROW_H;

            // §HUB-CARD-RECOVER: the grid clips horizontally and a free-dragged card
            // persists its x/y in localStorage; a position past the right edge (or
            // negative / absurdly far) hides the card with no pan or scroll to reach
            // it — so projects appear "missing". When the width is known, re-flow any
            // out-of-bounds saved position back to its default grid slot and heal the
            // stored value so every project stays visible. In-bounds custom positions
            // are preserved untouched.
            const clientW = grid.clientWidth;
            const maxLeft = clientW - CARD_W - PAD;
            const outOfBounds = saved != null && clientW > 400 &&
                (saved.x < 0 || saved.x > maxLeft || saved.y < 0 || saved.y > 20000);
            const left = (saved && !outOfBounds) ? saved.x : defLeft;
            const top  = (saved && !outOfBounds) ? saved.y : defTop;
            if (outOfBounds && pid) this._saveCardPos(pid, left, top);

            card.style.position = 'absolute';
            card.style.margin   = '0';
            card.style.width    = `${CARD_W}px`;
            card.style.left     = `${left}px`;
            card.style.top      = `${top}px`;
            card.style.zIndex   = String(topZ);
            card.draggable      = false; // disable HTML5 reorder — replaced by free-drag

            let sx = 0, sy = 0, ol = 0, ot = 0, dragging = false, moved = false;

            const onDown = (e: MouseEvent): void => {
                if (e.button !== 0) return;
                // Don't start a drag when grabbing the menu (⋯) button.
                if ((e.target as HTMLElement).closest('.ph-card-menu-btn')) return;
                dragging = true; moved = false;
                sx = e.clientX; sy = e.clientY;
                ol = parseFloat(card.style.left) || 0;
                ot = parseFloat(card.style.top)  || 0;
                card.style.zIndex = String(++topZ); // click-to-front
                e.preventDefault();
            };
            const onMove = (e: MouseEvent): void => {
                if (!dragging) return;
                // §HUB-CANVAS-ZOOM: screen delta → content delta (÷ zoom) so the card
                // tracks the cursor 1:1 at any zoom level (identity at zoom 1).
                const z = this._hubZoom || 1;
                const dx = (e.clientX - sx) / z, dy = (e.clientY - sy) / z;
                if (!moved && dx * dx + dy * dy > 25 / (z * z)) {
                    moved = true;
                    card.style.cursor    = 'grabbing';
                    card.style.boxShadow = '0 20px 48px rgba(40,30,90,0.28)';
                }
                if (moved) {
                    card.style.left = `${Math.max(0, ol + dx)}px`;
                    card.style.top  = `${Math.max(0, ot + dy)}px`;
                }
            };
            const suppressClick = (ev: Event): void => {
                ev.stopPropagation();
                ev.preventDefault();
                card.removeEventListener('click', suppressClick, true);
            };
            const onUp = (): void => {
                if (!dragging) return;
                dragging = false;
                card.style.cursor    = '';
                card.style.boxShadow = '';
                if (moved) {
                    if (pid) this._saveCardPos(pid, parseFloat(card.style.left) || 0, parseFloat(card.style.top) || 0);
                    // Suppress the click that follows a real drag (capture phase, one-shot).
                    card.addEventListener('click', suppressClick, true);
                }
            };

            card.addEventListener('mousedown', onDown);
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
            this._cardDragDisposers.push(() => {
                card.removeEventListener('mousedown', onDown);
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            });
        });

        // §HUB-CANVAS-ZOOM (slice 1): wrap the cards in a scaled content layer inside a
        // "sizer" that reserves the (scaled) scroll extent, so the grid's own scrollbars
        // pan the canvas and Ctrl/Cmd + wheel zooms it toward the cursor. At zoom 1 this
        // is identity — cards render exactly as laid out above (safe default; NO fit-all,
        // so the empty-grid regression cannot recur). Plain wheel still scrolls natively.
        let maxBottom = 0, maxRight = 0;
        for (const card of cards) {
            maxBottom = Math.max(maxBottom, (parseFloat(card.style.top)  || 0) + (card.offsetHeight || ROW_H));
            maxRight  = Math.max(maxRight,  (parseFloat(card.style.left) || 0) + CARD_W);
        }
        const contentW = maxRight  + PAD;
        const contentH = maxBottom + 40;

        const content = document.createElement('div');
        content.className = 'ph-canvas-content';
        content.style.cssText = 'position:absolute;top:0;left:0;transform-origin:0 0;';
        for (const c of cards) content.appendChild(c);

        const sizer = document.createElement('div');
        sizer.className = 'ph-canvas-sizer';
        sizer.style.position = 'relative';
        sizer.appendChild(content);

        grid.style.overflow = 'auto';
        grid.appendChild(sizer);

        const applyZoom = (): void => {
            const z = this._hubZoom;
            content.style.transform = `scale(${z})`;
            sizer.style.width  = `${contentW * z}px`;
            sizer.style.height = `${contentH * z}px`;
        };
        applyZoom();

        // Ctrl/Cmd + wheel = zoom toward cursor; plain wheel = native scroll (pan).
        const onWheel = (e: WheelEvent): void => {
            if (!e.ctrlKey && !e.metaKey) return;
            e.preventDefault();
            const rect = grid.getBoundingClientRect();
            const vx = e.clientX - rect.left;
            const vy = e.clientY - rect.top;
            const z0 = this._hubZoom || 1;
            const contentX = (grid.scrollLeft + vx) / z0;
            const contentY = (grid.scrollTop  + vy) / z0;
            const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
            const z1 = Math.min(ProjectHub._HUB_ZOOM_MAX, Math.max(ProjectHub._HUB_ZOOM_MIN, z0 * factor));
            if (z1 === z0) return;
            this._hubZoom = z1;
            applyZoom();
            grid.scrollLeft = contentX * z1 - vx;   // keep the point under the cursor fixed
            grid.scrollTop  = contentY * z1 - vy;
        };
        grid.addEventListener('wheel', onWheel, { passive: false });
        this._cardDragDisposers.push(() => grid.removeEventListener('wheel', onWheel));
    }

    private _cardPosKey(id: string): string { return `pryzm.hubCardPos.${id}`; }

    private _loadCardPos(id: string): { x: number; y: number } | null {
        try {
            const raw = localStorage.getItem(this._cardPosKey(id));
            if (!raw) return null;
            const p = JSON.parse(raw) as { x: number; y: number };
            return (typeof p.x === 'number' && typeof p.y === 'number') ? p : null;
        } catch { return null; }
    }

    private _saveCardPos(id: string, x: number, y: number): void {
        try { localStorage.setItem(this._cardPosKey(id), JSON.stringify({ x, y })); }
        catch { /* quota / private mode — non-critical */ }
    }

    // ── Context menu ──────────────────────────────────────────────────────────

    private openContextMenu(anchor: HTMLElement, projectId: string): void {
        this.closeContextMenu();

        const menu = this.el.querySelector('#ph-ctx-menu') as HTMLElement;
        const project = projectRepository.listProjects().find(p => p.id === projectId);

        // Update dynamic labels
        const starBtn = menu.querySelector('#ph-ctx-star') as HTMLElement;
        if (starBtn) starBtn.innerHTML = (project?.isStarred)
            ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> Unstar`
            : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> Star`;

        const archiveBtn = menu.querySelector('#ph-ctx-archive') as HTMLElement;
        if (archiveBtn) archiveBtn.innerHTML = (project?.isArchived)
            ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg> Unarchive`
            : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg> Archive`;

        // Position the menu near the anchor
        const rect = anchor.getBoundingClientRect();
        menu.style.display = 'block';
        menu.style.top = `${rect.bottom + 4}px`;
        menu.style.left = `${rect.left - 140}px`;

        // Make sure it doesn't go off screen.
        // D.7.5 batch #5: routed through getFrameScheduler() instead of raw rAF.
        getFrameScheduler().scheduleOnce('project-hub-menu-position', () => {
            const mRect = menu.getBoundingClientRect();
            if (mRect.right > window.innerWidth - 8) {
                menu.style.left = `${window.innerWidth - mRect.width - 8}px`;
            }
            if (mRect.bottom > window.innerHeight - 8) {
                menu.style.top = `${rect.top - mRect.height - 4}px`;
            }
        });

        // Attach action listeners (remove old ones first)
        const clone = menu.cloneNode(true) as HTMLElement;
        menu.parentNode!.replaceChild(clone, menu);

        clone.querySelectorAll<HTMLElement>('[data-action]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action!;
                this.handleContextAction(action, projectId);
                this.closeContextMenuEl(clone);
            });
        });

        this.ctxMenuEl = clone;
    }

    private closeContextMenu(): void {
        const menu = this.el.querySelector('#ph-ctx-menu') as HTMLElement | null;
        if (menu) menu.style.display = 'none';
        if (this.ctxMenuEl) this.ctxMenuEl.style.display = 'none';
    }

    private closeContextMenuEl(el: HTMLElement): void {
        el.style.display = 'none';
    }

    private onDocClick = (e: MouseEvent): void => {
        if (this.ctxMenuEl && !this.ctxMenuEl.contains(e.target as Node)) {
            this.ctxMenuEl.style.display = 'none';
        }
    };

    private handleContextAction(action: string, projectId: string): void {
        const project = projectRepository.listProjects().find(p => p.id === projectId);
        if (!project) return;

        switch (action) {
            case 'open':
                this.openProject(project.id, project.name);
                break;
            case 'rename':
                this.openRenameModal(project);
                break;
            case 'duplicate':
                this.duplicateProject(project);
                break;
            case 'team':
                this.openMembersModal(project);
                break;
            case 'star':
                this.toggleStar(project);
                break;
            case 'archive':
                this.toggleArchive(project);
                break;
            case 'delete':
                this.openDeleteModal(project);
                break;
        }
    }

    // ── Members modal (ISO 19650 CDE Phase 1) ─────────────────────────────────

    private _memberPanel: ProjectMemberPanel | null = null;

    /**
     * §ADD-PEOPLE (2026-05-22) — sidebar "Invite collaborators" entry point.
     * Members are per-project, so: 0 projects → ask to create one; exactly 1 →
     * jump straight to its members modal; many → a quick project chooser inside
     * the members modal, then open the chosen project's ProjectMemberPanel.
     */
    private openInviteCollaborators(): void {
        const projects = projectRepository.listProjects();
        if (!projects.length) {
            alert('Create a project first — then you can invite collaborators to it.');
            return;
        }
        if (projects.length === 1) {
            this.openMembersModal(projects[0]);
            return;
        }
        const modal = this.el.querySelector('#ph-members-modal') as HTMLElement;
        const title = this.el.querySelector('#ph-members-modal-title') as HTMLElement;
        const body  = this.el.querySelector('#ph-members-modal-body') as HTMLElement;
        if (this._memberPanel) { this._memberPanel.destroy?.(); this._memberPanel = null; }
        title.textContent = 'Invite collaborators — choose a project';
        body.innerHTML = '';
        const list = document.createElement('div');
        list.className = 'ph-invite-picker';
        for (const p of projects) {
            const row = document.createElement('button');
            row.className = 'ph-invite-picker-row';
            row.type = 'button';
            const name = document.createElement('span');
            name.className = 'ph-invite-picker-name';
            name.textContent = p.name;            // textContent — no XSS, no escape helper needed
            row.appendChild(name);
            row.addEventListener('click', () => this.openMembersModal(p)); // re-renders modal with the member panel
            list.appendChild(row);
        }
        body.appendChild(list);
        modal.style.display = 'flex';
    }

    private openMembersModal(project: ProjectMeta): void {
        const modal = this.el.querySelector('#ph-members-modal') as HTMLElement;
        const title = this.el.querySelector('#ph-members-modal-title') as HTMLElement;
        const body = this.el.querySelector('#ph-members-modal-body') as HTMLElement;

        title.textContent = `Team — ${project.name}`;
        body.innerHTML = '<div class="mp-loading">Loading members…</div>';
        modal.style.display = 'flex';

        // Destroy previous panel instance if any
        if (this._memberPanel) {
            this._memberPanel.destroy?.();
            this._memberPanel = null;
        }

        const projectId = project.id;
        const plan = (this.user.plan || 'free') as string;
        const isOwner = plan === 'owner';
        const currentUserRole: CDERole | null = isOwner ? 'lead_appointed' : 'team_member';

        const callbacks = {
            currentUserRole,
            isOwner,
            onLoadMembers: async (pid: string): Promise<ProjectMember[]> => {
                const res = await apiFetch(`/api/projects/${pid}/members`, {
                    headers: { 'Content-Type': 'application/json' },
                });
                if (!res.ok) throw new Error(await res.text());
                const { members } = await res.json();
                return members;
            },
            onInviteMember: async (pid: string, userId: string, role: CDERole): Promise<ProjectMember> => {
                const res = await apiFetch(`/api/projects/${pid}/members`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId, role }),
                });
                if (!res.ok) {
                    const { error } = await res.json().catch(() => ({ error: 'Request failed' }));
                    throw new Error(error);
                }
                const { member } = await res.json();
                return member;
            },
            onChangeRole: async (pid: string, userId: string, role: CDERole): Promise<ProjectMember> => {
                const res = await apiFetch(`/api/projects/${pid}/members/${userId}/role`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ role }),
                });
                if (!res.ok) {
                    const { error } = await res.json().catch(() => ({ error: 'Request failed' }));
                    throw new Error(error);
                }
                const { member } = await res.json();
                return member;
            },
            onRemoveMember: async (pid: string, userId: string): Promise<void> => {
                const res = await apiFetch(`/api/projects/${pid}/members/${userId}`, {
                    method: 'DELETE',
                });
                if (!res.ok && res.status !== 204) {
                    const { error } = await res.json().catch(() => ({ error: 'Request failed' }));
                    throw new Error(error);
                }
            },
        };

        body.innerHTML = '';
        this._memberPanel = new ProjectMemberPanel(body, projectId, callbacks);
    }

    private closeMembersModal(): void {
        const modal = this.el.querySelector('#ph-members-modal') as HTMLElement;
        modal.style.display = 'none';
        if (this._memberPanel) {
            this._memberPanel.destroy?.();
            this._memberPanel = null;
        }
    }

    // ── Project actions ───────────────────────────────────────────────────────

    /**
     * Phase C.4.06 (PRYZM2-WIREUP-PLAN-S72/14-subphases-A-D.md line
     * 112) — duplicate uses `runtime.persistence.client.duplicate(id,
     * newName)` which goes through the ProjectListController so the
     * `projectListStore` is updated atomically; we mirror the
     * server-authoritative summary into the legacy `projectRepository`
     * for back-compat readers (sidebar / grid / cards) until C.1.01
     * migrates them to subscribe to `projectListStore`.
     */
    private duplicateProject(project: ProjectMeta): void {
        if (!this.runtime) {
            console.error('[ProjectHub] duplicate: runtime is null');
            return;
        }
        const newName = `${project.name} (copy)`;
        void (async (): Promise<void> => {
            try {
                const summary = (await this.runtime!.persistence.client.duplicate(project.id, newName)) as {
                    readonly id: string;
                    readonly name: string;
                    readonly lastModifiedAt: string;
                    readonly ownerName: string;
                };
                const lastModifiedAt = Date.parse(summary.lastModifiedAt);
                const now = Date.now();
                projectRepository.saveProject({
                    ...project,
                    id: summary.id,
                    name: summary.name,
                    updatedAt: Number.isFinite(lastModifiedAt) ? lastModifiedAt : now,
                    createdAt: now,
                    versionCount: 0,
                    isStarred: false,
                    ownerId: summary.ownerName,
                });
                this.refreshSidebar();
                this.refreshGrid();
            } catch (err) {
                console.error('[ProjectHub] runtime.persistence.client.duplicate failed:', err);
                this.runtime?.toasts.error(`Could not duplicate "${project.name}": ${err instanceof Error ? err.message : String(err)}`);
            }
        })();
    }

    /**
     * Phase C.4.05 (line 111) — `client.patch(id, {isStarred})`.  The
     * UI stays optimistic (toggle is instant); we revert if the server
     * rejects the patch.
     */
    private toggleStar(project: ProjectMeta): void {
        if (!this.runtime) {
            console.error('[ProjectHub] toggleStar: runtime is null');
            return;
        }
        const next = !project.isStarred;
        // Optimistic local update so the UI feels instant.
        projectRepository.saveProject({ ...project, isStarred: next });
        this.refreshSidebar();
        this.refreshGrid();

        void (async (): Promise<void> => {
            try {
                await this.runtime!.persistence.client.patch(project.id, { isStarred: next });
            } catch (err) {
                console.error('[ProjectHub] runtime.persistence.client.patch(isStarred) failed:', err);
                // Revert on failure.
                projectRepository.saveProject({ ...project, isStarred: !next });
                this.refreshSidebar();
                this.refreshGrid();
                this.runtime?.toasts.error(`Could not update star: ${err instanceof Error ? err.message : String(err)}`);
            }
        })();
    }

    /**
     * Phase C.4.04 (line 110) — `client.patch(id, {isArchived})`.
     * Optimistic toggle with revert on server rejection.
     */
    private toggleArchive(project: ProjectMeta): void {
        if (!this.runtime) {
            console.error('[ProjectHub] toggleArchive: runtime is null');
            return;
        }
        const next = !project.isArchived;
        projectRepository.saveProject({ ...project, isArchived: next });
        this.refreshSidebar();
        this.refreshGrid();

        void (async (): Promise<void> => {
            try {
                await this.runtime!.persistence.client.patch(project.id, { isArchived: next });
            } catch (err) {
                console.error('[ProjectHub] runtime.persistence.client.patch(isArchived) failed:', err);
                projectRepository.saveProject({ ...project, isArchived: !next });
                this.refreshSidebar();
                this.refreshGrid();
                this.runtime?.toasts.error(`Could not ${next ? 'archive' : 'unarchive'}: ${err instanceof Error ? err.message : String(err)}`);
            }
        })();
    }

    // ── Rename modal ──────────────────────────────────────────────────────────

    private openRenameModal(project: ProjectMeta): void {
        const modal = this.el.querySelector('#ph-rename-modal') as HTMLElement;
        const input = this.el.querySelector('#ph-rename-input') as HTMLInputElement;
        input.value = project.name;
        input.dataset.projectId = project.id;
        modal.style.display = 'flex';
        setTimeout(() => input.select(), 50);
    }

    /**
     * Phase C.4.02 (PRYZM2-WIREUP-PLAN-S72/14-subphases-A-D.md line
     * 108) — `await runtime.persistence.client.rename(id, newName)`
     * routes through the ProjectListController so the projectListStore
     * is updated atomically with the server's response.  We mirror the
     * server-authoritative summary into the legacy `projectRepository`
     * for back-compat readers (sidebar / grid / cards) until C.1.01
     * migrates them to subscribe to `projectListStore`.
     */
    private handleRename(): void {
        const modal = this.el.querySelector('#ph-rename-modal') as HTMLElement;
        const input = this.el.querySelector('#ph-rename-input') as HTMLInputElement;
        const projectId = input.dataset.projectId;
        const newName = input.value.trim();
        if (!projectId || !newName) return;

        const all = projectRepository.listProjects();
        const project = all.find(p => p.id === projectId);
        if (!project) return;

        if (!this.runtime) {
            console.error('[ProjectHub] handleRename: runtime is null');
            return;
        }

        modal.style.display = 'none';

        void (async (): Promise<void> => {
            try {
                const summary = (await this.runtime!.persistence.client.rename(projectId, newName)) as {
                    readonly id: string;
                    readonly name: string;
                    readonly lastModifiedAt: string;
                };
                const lastModifiedAt = Date.parse(summary.lastModifiedAt);
                projectRepository.saveProject({
                    ...project,
                    name: summary.name,
                    updatedAt: Number.isFinite(lastModifiedAt) ? lastModifiedAt : Date.now(),
                });
                this.refreshSidebar();
                this.refreshGrid();
            } catch (err) {
                console.error('[ProjectHub] runtime.persistence.client.rename failed:', err);
                this.runtime?.toasts.error(`Could not rename project: ${err instanceof Error ? err.message : String(err)}`);
            }
        })();
    }

    // ── Delete modal ──────────────────────────────────────────────────────────

    private openDeleteModal(project: ProjectMeta): void {
        const modal = this.el.querySelector('#ph-delete-modal') as HTMLElement;
        const msg = this.el.querySelector('#ph-delete-msg') as HTMLElement;
        const confirmBtn = this.el.querySelector('#ph-delete-confirm') as HTMLElement;

        msg.textContent = `Are you sure you want to permanently delete "${project.name}"? This action cannot be undone.`;
        confirmBtn.dataset.projectId = project.id;
        modal.style.display = 'flex';
    }

    /**
     * Phase C.4.03 (PRYZM2-WIREUP-PLAN-S72/14-subphases-A-D.md line
     * 109) — `await runtime.persistence.client.delete(id)` routes
     * through the ProjectListController so the projectListStore
     * removes the entry atomically with the server's 204.  We keep
     * the local UI optimistic (close modal + refresh) and revert the
     * legacy `projectRepository` removal if the server rejects the
     * delete.
     */
    private async handleDelete(): Promise<void> {
        const modal = this.el.querySelector('#ph-delete-modal') as HTMLElement;
        const confirmBtn = this.el.querySelector('#ph-delete-confirm') as HTMLElement;
        const projectId = confirmBtn.dataset.projectId;
        if (!projectId) return;

        if (!this.runtime) {
            console.error('[ProjectHub] handleDelete: runtime is null');
            return;
        }

        // Snapshot the meta so we can restore on error.
        const snapshot = projectRepository.listProjects().find(p => p.id === projectId);

        // Optimistically remove from local storage and close modal immediately.
        projectRepository.deleteProject(projectId);
        modal.style.display = 'none';
        this.refreshSidebar();
        this.refreshGrid();

        try {
            await this.runtime.persistence.client.delete(projectId);
        } catch (err) {
            console.error('[ProjectHub] runtime.persistence.client.delete failed:', err);
            // Restore the local entry so the user does not lose visibility on the project.
            if (snapshot) {
                projectRepository.saveProject(snapshot);
                this.refreshSidebar();
                this.refreshGrid();
            }
            this.runtime.toasts.error(`Could not delete project: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    // ── New project modal ─────────────────────────────────────────────────────

    private openNewModal(): void {
        const modal = this.el.querySelector('#ph-new-modal') as HTMLElement;
        modal.style.display = 'flex';
        setTimeout(() => (this.el.querySelector('#ph-new-name') as HTMLInputElement)?.focus(), 50);
    }

    private closeNewModal(): void {
        const modal = this.el.querySelector('#ph-new-modal') as HTMLElement;
        modal.style.display = 'none';
        (this.el.querySelector('#ph-new-name') as HTMLInputElement).value = '';
        (this.el.querySelector('#ph-new-description') as HTMLTextAreaElement).value = '';
    }

    private handleCreate(): void {
        // Monetization gate — check project count against plan limit
        const activeProjects = projectRepository.listProjects().filter(p => !p.isArchived);
        if (!EntitlementStore.canCreateProject(activeProjects.length)) {
            this.closeNewModal();
            const plan = EntitlementStore.getUserPlan();
            const limit = PLAN_LIMITS[plan]?.maxProjects ?? 3;
            const msg = `You've reached the ${limit}-project limit on the ${getPlanDisplayName(plan)} plan.\n\nUpgrade to Architect for unlimited projects.`;
            if (confirm(msg + '\n\nView upgrade options?')) {
                this.callbacks.onUpgrade?.();
            }
            return;
        }

        const nameInput = this.el.querySelector('#ph-new-name') as HTMLInputElement;
        const descInput = this.el.querySelector('#ph-new-description') as HTMLTextAreaElement;
        const name = nameInput.value.trim() || 'Untitled Project';
        const description = descInput.value.trim() || undefined;

        // Disable the create button so a double-click cannot fire two POSTs
        // and so the user gets visual feedback that the request is in flight
        // before the EngineLoadingOverlay paints (it paints from openProject).
        const createBtn = this.el.querySelector('#ph-modal-create') as HTMLButtonElement | null;
        if (createBtn) {
            createBtn.disabled = true;
            createBtn.style.opacity = '0.6';
            createBtn.style.pointerEvents = 'none';
        }

        // Phase C.2.02 (PRYZM2-WIREUP-PLAN-S72/14-subphases-A-D.md §16.3
        // line 104) — creation flows through `runtime.persistence.client.create(name)`
        // which POSTs `/api/v1/projects`.  The server is the authority on the
        // project id; the legacy "optimistic local id + fire-and-forget POST
        // /api/projects" path generated UUID-format ids the server's
        // `proj-TIMESTAMP-ALPHANUM` regex rejected (and the pgPool branch
        // ignores the client id entirely), producing an id mismatch that
        // surfaced as the
        //   `[persistence.openProject] project not found: proj-…`
        // error every time a freshly-created project was opened.
        void this._createViaRuntime(name, description, createBtn);
    }

    private async _createViaRuntime(
        name: string,
        description: string | undefined,
        createBtn: HTMLButtonElement | null,
    ): Promise<void> {
        const restoreBtn = (): void => {
            if (createBtn) {
                createBtn.disabled = false;
                createBtn.style.opacity = '';
                createBtn.style.pointerEvents = '';
            }
        };

        if (!this.runtime) {
            // The runtime is constructed in `bootPlatform()` and threaded
            // by `PlatformRouter.showHub`.  Reaching this branch means
            // composeRuntime() failed to mount — surface the failure rather
            // than silently fall back to the legacy POST whose id mismatch
            // is the root cause we are removing.
            console.error('[ProjectHub] runtime is null — cannot create project (composeRuntime() must have failed at boot).');
            restoreBtn();
            alert('Project service is unavailable. Please refresh the page.');
            return;
        }

        try {
            // PersistenceClientLike.create returns `Promise<unknown>` by
            // contract (the slot keeps the `ProjectSummary` shape free to
            // evolve in `@pryzm/persistence-client`); we cast at the call
            // site per the type-comment guidance in
            // `packages/runtime-composer/src/types.ts` line 233.
            const summary = (await this.runtime.persistence.client.create(name)) as {
                readonly id: string;
                readonly name: string;
                readonly lastModifiedAt: string;
                readonly ownerName: string;
                readonly thumbnailUrl: string | null;
                readonly collaboratorCount: number;
                readonly schemaVersion: number;
            };

            // Mirror the server-authoritative summary into the legacy
            // localStorage repo so the rest of the white UI (sidebar
            // counts, ExistingProjectsPanel, version history) keeps
            // working unchanged until those readers migrate to
            // `runtime.persistence.projectListStore` in later sub-phases.
            const now = Date.now();
            const lastModifiedAt = Date.parse(summary.lastModifiedAt);
            const meta: ProjectMeta = {
                id: summary.id,
                name: summary.name,
                description,
                updatedAt: Number.isFinite(lastModifiedAt) ? lastModifiedAt : now,
                createdAt: now,
                versionCount: 0,
                ownerId: summary.ownerName,
            };
            projectRepository.saveProject(meta);

            // The store is already populated atomically by the
            // ProjectListController inside `runtime.persistence.client.create`
            // (see `packages/runtime-composer/src/buildPersistence.ts`
            // lines 72–93 — the public `client` surface routes mutations
            // through the controller so `client.create` does
            // `client.create() → store.addProject()` atomically) — the
            // subsequent `openProject(id)` therefore finds the summary
            // without a round-trip refresh.

            this.closeNewModal();
            this.openProject(summary.id, summary.name, { isNewProject: true });
        } catch (err) {
            // §SERVER-500-CLIENT-VISIBILITY (DAILY-USE 2026-05-21, Round 39) —
            // ALSO log the full error body so the architect's browser console
            // shows the structured { error, errorId, code } payload alongside
            // the message. Round 39 made the message itself carry errorId + code
            // (see ProjectListClient.ts), but logging the full body too means
            // the architect can copy the entire diagnostic envelope with one
            // right-click without having to expand the error object.
            console.error('[ProjectHub] runtime.persistence.client.create failed:', err);
            const errBody = (err as { body?: unknown })?.body;
            if (errBody) {
                console.error('[ProjectHub] server response body:', errBody);
            }
            restoreBtn();
            const msg = err instanceof Error ? err.message : String(err);
            // §SERVER-500-CLIENT-VISIBILITY — include errorId in the user-facing
            // alert too so the architect can paste it directly from the dialog
            // without opening DevTools.
            const errorId = (errBody && typeof errBody === 'object'
                ? (errBody as { errorId?: string }).errorId
                : undefined);
            const errorIdSuffix = errorId ? `\n\nReference ID: ${errorId}` : '';
            alert(`Failed to create project: ${msg}${errorIdSuffix}`);
        }
    }

    // ── Open project ──────────────────────────────────────────────────────────

    private openProject(id: string, name: string, opts?: { isNewProject?: boolean }): void {
        const card = this.el.querySelector(`[data-project-id="${id}"]`) as HTMLElement | null;
        if (card) {
            card.style.opacity = '0.6';
            card.style.pointerEvents = 'none';
        }
        window.__pendingProjectId = id; // TODO(C.3.x): legacy __pendingProjectId — replace with runtime.persistence.openProject hint
        window.__pendingProjectName = name; // TODO(C.3.x): legacy __pendingProjectName — replace with runtime.persistence.openProject hint
        this.callbacks.onOpenProject(id, name, opts);
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    destroy(): void {
        document.removeEventListener('click', this.onDocClick);
        this.el.remove();
    }
}
