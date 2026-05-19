// @pryzm/plugin-ai-floorplan — sidebar panel renderer (S48 D5 fulfils
// the S47 deferred binding "editor sidebar UI for AiApprovalQueueStore
// — empty state + populated state").
//
// Spec source: `phases/PHASE-2D-Q4-M22-M24-SYNC-AWARENESS-BETA.md`
// §S48 line 670 ("Approval-queue UI rendered (empty state + populated
// state)"); +ADR-0037 §2.5 (the deferred S48 binding for the React UI
// — actually vanilla TS, since apps/editor is not React-based; mirrors
// the `plugins/multiplayer/src/lock-ui.ts` pure-DOM pattern from S45).
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// One ApprovalQueuePanel per editor host. Each instance:
//   1. Holds an injected `AiApprovalQueueStore` and `viewId`.
//   2. Mounts into a host `HTMLElement` provided by the editor sidebar
//      slot wiring.
//   3. Subscribes to the store via `subscribe(listener)` (Store<T>
//      base API). On every commit, calls `render()` which wipes +
//      repopulates the panel root.
//   4. Exposes a `dispose()` method that unsubscribes + removes the
//      DOM nodes — idempotent.
//
// PURE: no framework. Vanilla DOM. The renderer is callable from any
// host that supplies an HTMLElement, including the JSDOM environment
// in tests.

import {
  approvalQueueBadgeCount,
  type AiApprovalQueueStore,
} from '@pryzm/plugin-sdk';

export interface ApprovalQueuePanelOptions {
  /** Sidebar host element. Must be empty before mount. */
  readonly host: HTMLElement;
  /** The store the panel reflects. */
  readonly store: AiApprovalQueueStore;
  /** Active view id — informational, displayed in the header. */
  readonly viewId?: string;
  /** Called when the user clicks Approve on a pending action. The
   *  caller is responsible for the actual commit + store mutation
   *  (the panel does not mutate the store directly so command-bus
   *  ownership is preserved). */
  readonly onApprove?: (id: string) => void;
  /** Called when the user clicks Reject. */
  readonly onReject?: (id: string) => void;
  /** Optional clock injection for tests. */
  readonly now?: () => number;
}

export interface ApprovalQueuePanel {
  /** Re-render with current store snapshot. Called automatically on
   *  store commit; exposed for forced refresh. */
  render(): void;
  /** Current rendered badge count (cached after last render). */
  badgeCount(): number;
  /** Unsubscribe + clear host. Idempotent. */
  dispose(): void;
}

const PANEL_CLASS = 'pryzm-ai-approval-queue';
const ITEM_CLASS = 'pryzm-ai-approval-queue__item';
const EMPTY_CLASS = 'pryzm-ai-approval-queue__empty';

export function mountApprovalQueuePanel(
  opts: ApprovalQueuePanelOptions,
): ApprovalQueuePanel {
  const { host, store } = opts;
  const now = opts.now ?? (() => Date.now());

  const root = host.ownerDocument.createElement('div');
  root.className = PANEL_CLASS;
  root.setAttribute('data-pryzm-component', 'ai-approval-queue');
  if (opts.viewId) root.setAttribute('data-view-id', opts.viewId);
  host.appendChild(root);

  let lastBadgeCount = 0;

  const render = (): void => {
    while (root.firstChild) root.removeChild(root.firstChild);
    const pending = store.pending();
    lastBadgeCount = approvalQueueBadgeCount(store);

    const header = host.ownerDocument.createElement('header');
    header.className = `${PANEL_CLASS}__header`;
    const title = host.ownerDocument.createElement('h3');
    title.textContent = 'AI workflow queue';
    title.className = `${PANEL_CLASS}__title`;
    header.appendChild(title);
    const badge = host.ownerDocument.createElement('span');
    badge.className = `${PANEL_CLASS}__badge`;
    badge.setAttribute('data-pryzm-badge', String(lastBadgeCount));
    badge.textContent = String(lastBadgeCount);
    header.appendChild(badge);
    root.appendChild(header);

    if (pending.length === 0) {
      const empty = host.ownerDocument.createElement('div');
      empty.className = EMPTY_CLASS;
      empty.setAttribute('data-pryzm-empty', 'true');
      empty.textContent = 'No pending AI actions. Submit a workflow to populate.';
      root.appendChild(empty);
      return;
    }

    const list = host.ownerDocument.createElement('ul');
    list.className = `${PANEL_CLASS}__list`;
    for (const action of pending) {
      const li = host.ownerDocument.createElement('li');
      li.className = ITEM_CLASS;
      li.setAttribute('data-action-id', action.id);
      li.setAttribute('data-workflow', action.workflow);

      const meta = host.ownerDocument.createElement('div');
      meta.className = `${ITEM_CLASS}__meta`;
      const ageS = Math.max(0, Math.floor((now() - action.createdAt) / 1000));
      meta.textContent = `${action.workflow} • $${action.estimatedCostUsd.toFixed(4)} • ${ageS}s ago`;
      li.appendChild(meta);

      if (action.preview) {
        const preview = host.ownerDocument.createElement('pre');
        preview.className = `${ITEM_CLASS}__preview`;
        preview.textContent =
          action.preview.kind === 'json'
            ? JSON.stringify(action.preview.data, null, 2)
            : `[${action.preview.kind} preview]`;
        li.appendChild(preview);
      }

      const actions = host.ownerDocument.createElement('div');
      actions.className = `${ITEM_CLASS}__actions`;

      const approveBtn = host.ownerDocument.createElement('button');
      approveBtn.type = 'button';
      approveBtn.className = `${ITEM_CLASS}__approve`;
      approveBtn.textContent = 'Approve';
      approveBtn.addEventListener('click', () => opts.onApprove?.(action.id));

      const rejectBtn = host.ownerDocument.createElement('button');
      rejectBtn.type = 'button';
      rejectBtn.className = `${ITEM_CLASS}__reject`;
      rejectBtn.textContent = 'Reject';
      rejectBtn.addEventListener('click', () => opts.onReject?.(action.id));

      actions.appendChild(approveBtn);
      actions.appendChild(rejectBtn);
      li.appendChild(actions);
      list.appendChild(li);
    }
    root.appendChild(list);
  };

  render();
  const unsubscribe = store.subscribe(() => render());

  let disposed = false;
  return {
    render,
    badgeCount: () => lastBadgeCount,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      if (root.parentNode === host) host.removeChild(root);
    },
  };
}
