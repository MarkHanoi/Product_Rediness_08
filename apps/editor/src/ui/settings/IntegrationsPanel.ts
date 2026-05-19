/**
 * @file IntegrationsPanel.ts
 * @description Wave 14 — F.11.2 — runtime.persistence.client wiring.
 *   Integrations + members panel for managing project-level OAuth integrations
 *   and team membership.  Phase F stub: listProjects used as placeholder
 *   (real integrations/members endpoints land in Phase C.integrations).
 */

type Runtime = import('@pryzm/runtime-composer/types').PryzmRuntime;

export class IntegrationsPanel {
    private readonly _runtime: Runtime | null;
    private _el: HTMLElement | null = null;

    constructor(runtime: Runtime | null = null) {
        this._runtime = runtime;
    }

    mount(container: HTMLElement): void {
        this._el = document.createElement('div');
        this._el.className = 'integrations-panel';
        this._el.innerHTML = '<div class="ip-title">Integrations & Members</div>';
        container.appendChild(this._el);
        void this._loadData();
    }

    private async _loadData(): Promise<void> {
        if (!this._runtime || !this._el) return;

        // F.11.2 — runtime.persistence.client.{integrations,members} wiring
        // TODO(F.11.2): replace listProjects with real integrations.list() +
        // members.list() endpoints once Phase C.integrations ships.
        const projects = await this._runtime.persistence.client.list();
        const section = document.createElement('div');
        section.className = 'ip-section';
        section.textContent = `Projects: ${(projects as unknown[]).length} (integrations endpoint pending Phase C)`;
        this._el.appendChild(section);
    }

    destroy(): void {
        this._el?.remove();
        this._el = null;
    }
}

/** MembersPanel — shares the same runtime wiring as IntegrationsPanel. */
export class MembersPanel {
    private readonly _runtime: Runtime | null;
    private _el: HTMLElement | null = null;

    constructor(runtime: Runtime | null = null) {
        this._runtime = runtime;
    }

    mount(container: HTMLElement): void {
        this._el = document.createElement('div');
        this._el.className = 'members-panel';
        this._el.innerHTML = '<div class="mp-title">Team Members</div>';
        container.appendChild(this._el);
        void this._loadMembers();
    }

    private async _loadMembers(): Promise<void> {
        if (!this._runtime || !this._el) return;
        // F.11.2 — runtime.persistence.client.members wiring
        // TODO(F.11.2): replace with real members.list() call once Phase C.integrations ships.
        const auth = this._runtime.persistence.client.auth;
        const user = auth?.getCurrentUser?.() ?? null;
        const row = document.createElement('div');
        row.textContent = `Current user: ${user ? user.email : '(signed out)'}`;
        this._el.appendChild(row);
    }

    destroy(): void {
        this._el?.remove();
        this._el = null;
    }
}
