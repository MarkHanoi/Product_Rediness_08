/**
 * A.31.e iteration 5.2.b — Right-click menu + tab orchestrator.
 *
 * Owns the contextmenu-popover → "Show AI provenance" → ProvenanceTab
 * lifecycle. Plugs into `ModelTreeComponent` via the `onContextMenu`
 * hook shipped in iteration 5.2.b.
 *
 * Layer: L5 (DOM). Pairs with:
 *   - ProvenanceTab.ts (the panel that renders the artefact cards)
 *   - ModelTree.ts (the tree that fires the contextmenu event)
 *
 * Lifecycle:
 *   const orchestrator = new ProvenanceMenuOrchestrator({
 *     store, projectId, hostContainer,
 *   });
 *   tree = new ModelTreeComponent(runtime, treeMount, {
 *     onContextMenu: (payload) => orchestrator.openMenu(payload),
 *   });
 *   // ...later when the editor closes:
 *   orchestrator.dispose();
 *
 * The orchestrator owns the popover DOM + the panel DOM. Clicking the
 * "Show AI provenance" item mounts the panel inside `hostContainer`
 * (or `document.body` when no host is supplied) and closes the menu.
 * Esc or click-outside dismisses both.
 */

import type { InspectSelection } from '@pryzm/schemas';
import type { ProvenanceStore } from '@pryzm/stores';
import { ProvenanceTab } from './ProvenanceTab';
import type { ModelTreeContextMenuPayload } from './ModelTree';

export interface ProvenanceMenuOrchestratorOptions {
    readonly store: ProvenanceStore;
    readonly projectId: string;
    /** Container the Provenance tab mounts into when the menu action
     *  fires. Defaults to `document.body` — callers can supply a
     *  side-panel slot when the editor's inspect layout is settled. */
    readonly hostContainer?: HTMLElement;
}

/** Action item the menu renders. Append to MENU_ITEMS to add another
 *  action that's only meaningful for elementInstance selections. */
interface MenuItem {
    readonly id: string;
    readonly label: string;
    readonly applicableFor: (sel: InspectSelection) => boolean;
    readonly perform: (
        orchestrator: ProvenanceMenuOrchestrator,
        sel: InspectSelection,
    ) => void;
}

const MENU_ITEMS: readonly MenuItem[] = [
    {
        id: 'show-ai-provenance',
        label: 'Show AI provenance',
        applicableFor: (sel) => sel.kind === 'elementInstance',
        perform: (orchestrator, sel) => {
            if (sel.kind !== 'elementInstance') return;
            orchestrator.openProvenanceTab(sel.id);
        },
    },
];

export class ProvenanceMenuOrchestrator {
    private readonly _store: ProvenanceStore;
    private readonly _projectId: string;
    private readonly _hostContainer: HTMLElement;
    private _menu: HTMLElement | null = null;
    private _menuKeyHandler: ((ev: KeyboardEvent) => void) | null = null;
    private _menuDocClickHandler: ((ev: MouseEvent) => void) | null = null;
    private _tab: ProvenanceTab | null = null;
    private _tabRoot: HTMLElement | null = null;
    private _disposed = false;

    constructor(opts: ProvenanceMenuOrchestratorOptions) {
        this._store = opts.store;
        this._projectId = opts.projectId;
        this._hostContainer = opts.hostContainer ?? document.body;
    }

    /** Open the right-click menu at the supplied client coords. Only
     *  renders if at least one menu item is applicable to the selection;
     *  otherwise the call is a no-op (lets the orchestrator be wired
     *  unconditionally without the menu appearing for non-element rows). */
    openMenu(payload: ModelTreeContextMenuPayload): void {
        if (this._disposed) return;
        const applicable = MENU_ITEMS.filter((it) =>
            it.applicableFor(payload.selection),
        );
        if (applicable.length === 0) return;
        this.closeMenu(); // dismiss any prior open menu

        const menu = document.createElement('ul');
        menu.className = 'pv-menu';
        menu.setAttribute('role', 'menu');
        menu.setAttribute('data-testid', 'provenance-menu');
        menu.style.position = 'fixed';
        menu.style.left = `${payload.clientX}px`;
        menu.style.top = `${payload.clientY}px`;
        menu.style.zIndex = '10000';

        for (const it of applicable) {
            const li = document.createElement('li');
            li.className = 'pv-menu-item';
            li.setAttribute('role', 'menuitem');
            li.setAttribute('tabindex', '0');
            li.setAttribute('data-action', it.id);
            li.textContent = it.label;
            const fire = (): void => {
                try {
                    it.perform(this, payload.selection);
                } catch (err) {
                    console.error(
                        `[ProvenanceMenuOrchestrator] action '${it.id}' threw:`,
                        err,
                    );
                }
                this.closeMenu();
            };
            li.addEventListener('click', fire);
            li.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault();
                    fire();
                }
            });
            menu.appendChild(li);
        }

        this._hostContainer.appendChild(menu);
        this._menu = menu;

        // Focus the first item so keyboard users can press Enter.
        const firstItem = menu.querySelector('[role="menuitem"]');
        if (firstItem instanceof HTMLElement) firstItem.focus();

        // Esc + click-outside dismissal.
        this._menuKeyHandler = (ev: KeyboardEvent) => {
            if (ev.key === 'Escape') this.closeMenu();
        };
        this._menuDocClickHandler = (ev: MouseEvent) => {
            if (!this._menu) return;
            const target = ev.target;
            if (target instanceof Node && this._menu.contains(target)) return;
            this.closeMenu();
        };
        document.addEventListener('keydown', this._menuKeyHandler);
        // Defer to next tick so the contextmenu's own click event doesn't
        // immediately fire the outside-click handler.
        setTimeout(() => {
            if (this._disposed) return;
            if (this._menuDocClickHandler) {
                document.addEventListener('click', this._menuDocClickHandler);
            }
        }, 0);
    }

    /** Mount the Provenance tab inside `hostContainer` (or replace the
     *  current tab) bound to the given element id. Idempotent on the
     *  same element id. */
    openProvenanceTab(elementId: string): void {
        if (this._disposed) return;
        if (this._tab && this._tabRoot) {
            // Re-use the existing tab; just swap its selection.
            this._tab.setSelectedElement(elementId);
            return;
        }
        const tab = new ProvenanceTab({
            store: this._store,
            projectId: this._projectId,
            initialElementId: elementId,
        });
        const root = tab.build();
        // Default positioning — fixed top-right of the host. The Inspect
        // panel's own layout can override by setting `pv-tab--docked`
        // styling at the editor level once the inspect-shell lands.
        root.classList.add('pv-tab--floating');
        this._hostContainer.appendChild(root);
        this._tab = tab;
        this._tabRoot = root;
    }

    /** Close the currently-open right-click menu. Idempotent. */
    closeMenu(): void {
        if (this._menu) {
            this._menu.remove();
            this._menu = null;
        }
        if (this._menuKeyHandler) {
            document.removeEventListener('keydown', this._menuKeyHandler);
            this._menuKeyHandler = null;
        }
        if (this._menuDocClickHandler) {
            document.removeEventListener('click', this._menuDocClickHandler);
            this._menuDocClickHandler = null;
        }
    }

    /** Close the Provenance tab if open. Idempotent. */
    closeProvenanceTab(): void {
        if (this._tab) {
            this._tab.dispose();
            this._tab = null;
        }
        if (this._tabRoot) {
            this._tabRoot.remove();
            this._tabRoot = null;
        }
    }

    /** True when the Provenance tab is currently mounted. Useful for
     *  test assertions + L5 keyboard-shortcut wiring (toggle behaviour). */
    isProvenanceTabOpen(): boolean {
        return this._tab !== null;
    }

    /** True when the contextmenu popover is open. */
    isMenuOpen(): boolean {
        return this._menu !== null;
    }

    /** Tear down everything. Idempotent. */
    dispose(): void {
        if (this._disposed) return;
        this._disposed = true;
        this.closeMenu();
        this.closeProvenanceTab();
    }
}
