// @vitest-environment happy-dom

import { describe, it, expect, beforeEach } from 'vitest';
import { AiApprovalQueueStore } from '@pryzm/plugin-sdk';
import type { AiPendingAction } from '@pryzm/ai-host/types';
import { mountApprovalQueuePanel } from '../src/ApprovalQueuePanel.js';

function makeAction(over: Partial<AiPendingAction> = {}): AiPendingAction {
  return {
    id: over.id ?? 'a1',
    workflow: over.workflow ?? 'floorplan',
    proposedCommands: over.proposedCommands ?? [
      { commandId: 'cmd-1', name: 'floorplan.draft', payload: { x: 1 } },
    ],
    estimatedCostUsd: over.estimatedCostUsd ?? 0.0125,
    preview: over.preview ?? { kind: 'json', data: { walls: 4 } },
    createdAt: over.createdAt ?? 1_700_000_000_000,
    status: over.status ?? 'pending',
  };
}

describe('mountApprovalQueuePanel', () => {
  let host: HTMLElement;
  let store: AiApprovalQueueStore;
  beforeEach(() => {
    document.body.innerHTML = '';
    host = document.createElement('div');
    document.body.appendChild(host);
    store = new AiApprovalQueueStore();
  });

  it('mounts an empty-state panel when the queue is empty', () => {
    const panel = mountApprovalQueuePanel({ host, store, viewId: 'v1' });
    const root = host.querySelector('[data-pryzm-component="ai-approval-queue"]');
    expect(root).toBeTruthy();
    expect(root?.getAttribute('data-view-id')).toBe('v1');
    expect(host.querySelector('[data-pryzm-empty="true"]')).toBeTruthy();
    expect(host.querySelector('[data-pryzm-badge]')?.textContent).toBe('0');
    expect(panel.badgeCount()).toBe(0);
    panel.dispose();
  });

  it('renders the badge + each pending action with workflow + cost + preview', () => {
    store.enqueue(makeAction({ id: 'a1', estimatedCostUsd: 0.0125 }));
    store.enqueue(
      makeAction({
        id: 'a2',
        workflow: 'generative',
        estimatedCostUsd: 0.05,
        createdAt: 1_700_000_001_000,
      }),
    );
    const panel = mountApprovalQueuePanel({
      host,
      store,
      now: () => 1_700_000_005_000,
    });
    expect(panel.badgeCount()).toBe(2);
    expect(host.querySelector('[data-pryzm-badge]')?.textContent).toBe('2');
    const items = host.querySelectorAll('[data-action-id]');
    expect(items.length).toBe(2);
    expect(items[0]?.getAttribute('data-action-id')).toBe('a1');
    expect(items[0]?.querySelector('pre')?.textContent).toContain('"walls": 4');
    expect(items[1]?.getAttribute('data-workflow')).toBe('generative');
    panel.dispose();
  });

  it('re-renders automatically on store commit (subscribe wiring)', () => {
    const panel = mountApprovalQueuePanel({ host, store });
    expect(host.querySelector('[data-pryzm-empty="true"]')).toBeTruthy();
    store.enqueue(makeAction({ id: 'new' }));
    expect(host.querySelector('[data-pryzm-empty="true"]')).toBeNull();
    expect(host.querySelectorAll('[data-action-id]').length).toBe(1);
    expect(panel.badgeCount()).toBe(1);
    panel.dispose();
  });

  it('approve / reject button clicks call back the supplied handlers', () => {
    store.enqueue(makeAction({ id: 'a1' }));
    const approved: string[] = [];
    const rejected: string[] = [];
    const panel = mountApprovalQueuePanel({
      host,
      store,
      onApprove: (id) => approved.push(id),
      onReject: (id) => rejected.push(id),
    });
    const item = host.querySelector('[data-action-id="a1"]') as HTMLElement;
    (item.querySelector('.pryzm-ai-approval-queue__item__approve') as HTMLButtonElement).click();
    (item.querySelector('.pryzm-ai-approval-queue__item__reject') as HTMLButtonElement).click();
    expect(approved).toEqual(['a1']);
    expect(rejected).toEqual(['a1']);
    panel.dispose();
  });

  it('dispose() unsubscribes + removes the panel root, idempotently', () => {
    const panel = mountApprovalQueuePanel({ host, store });
    expect(host.children.length).toBe(1);
    panel.dispose();
    expect(host.children.length).toBe(0);
    // Subsequent dispose must not throw.
    panel.dispose();
    // After dispose, store mutations no longer mutate the DOM.
    store.enqueue(makeAction({ id: 'after-dispose' }));
    expect(host.children.length).toBe(0);
  });

  it('badge count tracks pending only (approved actions removed from display)', () => {
    store.enqueue(makeAction({ id: 'a1' }));
    store.enqueue(makeAction({ id: 'a2' }));
    const panel = mountApprovalQueuePanel({ host, store });
    expect(panel.badgeCount()).toBe(2);
    store.approve('a1');
    expect(panel.badgeCount()).toBe(1);
    expect(host.querySelector('[data-action-id="a1"]')).toBeNull();
    expect(host.querySelector('[data-action-id="a2"]')).toBeTruthy();
    panel.dispose();
  });
});
