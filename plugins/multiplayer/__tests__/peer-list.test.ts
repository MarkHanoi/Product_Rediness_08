// PeerListPanel — DOM render contract (S44 D4 + spec line 279 "view chip").

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PeerListPanel } from '../src/peer-list.js';
import type { PryzmAwareness, PryzmAwarenessState } from '@pryzm/plugin-sdk';

// ─── Faked PryzmAwareness with mutable state + change listeners ────────────

function fakeAwareness(): PryzmAwareness & {
  _set(clientID: number, state: PryzmAwarenessState): void;
  _delete(clientID: number): void;
} {
  const states = new Map<number, PryzmAwarenessState>();
  const listeners = new Set<() => void>();
  return {
    getStates: () => states,
    on: (_event: string, fn: () => void) => {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
    _set(clientID: number, state: PryzmAwarenessState) { states.set(clientID, state); for (const l of listeners) l(); },
    _delete(clientID: number) { states.delete(clientID); for (const l of listeners) l(); },
  } as unknown as PryzmAwareness & {
    _set(clientID: number, state: PryzmAwarenessState): void;
    _delete(clientID: number): void;
  };
}

const peer = (over: Partial<PryzmAwarenessState>): PryzmAwarenessState => ({
  userId: 'u', displayName: 'U', cursor: null, activeViewId: 'main-3d',
  activeTool: null, selection: [], heldLocks: [], lastActivity: Date.now(),
  ...over,
});

let mountPoint: HTMLElement;
beforeEach(() => {
  mountPoint = document.createElement('div');
  document.body.appendChild(mountPoint);
});
afterEach(() => {
  if (mountPoint.parentNode) mountPoint.parentNode.removeChild(mountPoint);
});

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('PeerListPanel — initial render', () => {
  it('shows the empty state when no other peers connected', () => {
    const aw = fakeAwareness();
    aw._set(1, peer({ userId: 'self', displayName: 'Me' }));
    const panel = new PeerListPanel(aw, { localClientID: 1 });
    mountPoint.appendChild(panel.root);
    expect(panel.root.querySelector('.pryzm-peer-list__empty')?.textContent).toContain('No other peers');
  });

  it('lists every non-self peer', () => {
    const aw = fakeAwareness();
    aw._set(1, peer({ userId: 'self', displayName: 'Me' }));
    aw._set(2, peer({ userId: 'alice', displayName: 'Alice' }));
    aw._set(3, peer({ userId: 'bob', displayName: 'Bob' }));
    const panel = new PeerListPanel(aw, { localClientID: 1 });
    const rows = panel.root.querySelectorAll('.pryzm-peer-list__row');
    expect(rows.length).toBe(2);
    expect(rows[0]!.querySelector('.pryzm-peer-list__name')!.textContent).toBe('Alice');
    expect(rows[1]!.querySelector('.pryzm-peer-list__name')!.textContent).toBe('Bob');
  });

  it('skips the local peer', () => {
    const aw = fakeAwareness();
    aw._set(7, peer({ userId: 'me', displayName: 'Me' }));
    aw._set(8, peer({ userId: 'other', displayName: 'Other' }));
    const panel = new PeerListPanel(aw, { localClientID: 7 });
    expect(panel.root.querySelectorAll('.pryzm-peer-list__row').length).toBe(1);
  });
});

describe('PeerListPanel — chip rendering', () => {
  it('always shows a view chip', () => {
    const aw = fakeAwareness();
    aw._set(1, peer({ userId: 'self', displayName: 'Me' }));
    aw._set(2, peer({ userId: 'alice', displayName: 'Alice', activeViewId: 'plan-L1' }));
    const panel = new PeerListPanel(aw, { localClientID: 1 });
    const chips = panel.root.querySelectorAll('.pryzm-chip--view');
    expect(chips.length).toBe(1);
    expect(chips[0]!.textContent).toBe('plan-L1');
  });

  it('shows a tool chip only when activeTool is set', () => {
    const aw = fakeAwareness();
    aw._set(1, peer({ userId: 'self', displayName: 'Me' }));
    aw._set(2, peer({ userId: 'a', displayName: 'A', activeTool: null }));
    aw._set(3, peer({ userId: 'b', displayName: 'B', activeTool: 'wall.draw' }));
    const panel = new PeerListPanel(aw, { localClientID: 1 });
    const rows = panel.root.querySelectorAll('.pryzm-peer-list__row');
    expect(rows[0]!.querySelectorAll('.pryzm-chip--tool').length).toBe(0);
    expect(rows[1]!.querySelectorAll('.pryzm-chip--tool').length).toBe(1);
    expect(rows[1]!.querySelector('.pryzm-chip--tool')!.textContent).toBe('wall.draw');
  });

  it('uses viewLabelFor + toolLabelFor to humanise IDs', () => {
    const aw = fakeAwareness();
    aw._set(1, peer({ userId: 'self', displayName: 'Me' }));
    aw._set(2, peer({ userId: 'a', displayName: 'A', activeViewId: 'plan-L1', activeTool: 'wall.draw' }));
    const panel = new PeerListPanel(aw, {
      localClientID: 1,
      viewLabelFor: (id) => id === 'plan-L1' ? 'Plan view — Level 1' : id,
      toolLabelFor: (id) => id === 'wall.draw' ? 'Wall tool' : id,
    });
    const row = panel.root.querySelector('.pryzm-peer-list__row')!;
    expect(row.querySelector('.pryzm-chip--view')!.textContent).toBe('Plan view — Level 1');
    expect(row.querySelector('.pryzm-chip--tool')!.textContent).toBe('Wall tool');
  });
});

describe('PeerListPanel — color swatch', () => {
  it('paints a swatch with the deterministic peer color', () => {
    const aw = fakeAwareness();
    aw._set(1, peer({ userId: 'self', displayName: 'Me' }));
    aw._set(2, peer({ userId: 'alice', displayName: 'Alice' }));
    const panel = new PeerListPanel(aw, { localClientID: 1 });
    const swatch = panel.root.querySelector('.pryzm-peer-list__swatch') as HTMLElement;
    // happy-dom doesn't fully normalise modern hsl() syntax through
    // CSSStyleDeclaration; verify via the raw inline style attribute.
    const styleAttr = swatch.getAttribute('style') ?? '';
    expect(styleAttr).toMatch(/background-color/i);
    expect(styleAttr).toMatch(/hsl/);
  });
});

describe('PeerListPanel — idle indicator', () => {
  it('shows "idle" badge for peers older than the threshold', () => {
    const now = 1_000_000;
    const aw = fakeAwareness();
    aw._set(1, peer({ userId: 'self', displayName: 'Me' }));
    aw._set(2, peer({ userId: 'a', displayName: 'A', lastActivity: now - 60_000 }));
    aw._set(3, peer({ userId: 'b', displayName: 'B', lastActivity: now - 1_000 }));
    const panel = new PeerListPanel(aw, { localClientID: 1, idleThresholdMs: 30_000, now: () => now });
    const rows = panel.root.querySelectorAll('.pryzm-peer-list__row');
    expect(rows[0]!.querySelector('.pryzm-peer-list__idle')?.textContent).toBe('idle');
    expect(rows[1]!.querySelector('.pryzm-peer-list__idle')).toBeNull();
  });
});

describe('PeerListPanel — change subscription', () => {
  it('re-renders when awareness fires a change event', () => {
    const aw = fakeAwareness();
    aw._set(1, peer({ userId: 'self', displayName: 'Me' }));
    const panel = new PeerListPanel(aw, { localClientID: 1 });
    expect(panel.root.querySelectorAll('.pryzm-peer-list__row').length).toBe(0);
    aw._set(2, peer({ userId: 'late', displayName: 'Late' }));
    expect(panel.root.querySelectorAll('.pryzm-peer-list__row').length).toBe(1);
  });

  it('removes a peer when they disconnect', () => {
    const aw = fakeAwareness();
    aw._set(1, peer({ userId: 'self', displayName: 'Me' }));
    aw._set(2, peer({ userId: 'gone', displayName: 'Gone' }));
    const panel = new PeerListPanel(aw, { localClientID: 1 });
    expect(panel.root.querySelectorAll('.pryzm-peer-list__row').length).toBe(1);
    aw._delete(2);
    expect(panel.root.querySelectorAll('.pryzm-peer-list__row').length).toBe(0);
  });
});

describe('PeerListPanel — dispose', () => {
  it('unsubscribes from awareness change events', () => {
    const aw = fakeAwareness();
    aw._set(1, peer({ userId: 'self', displayName: 'Me' }));
    const panel = new PeerListPanel(aw, { localClientID: 1 });
    panel.dispose();
    aw._set(2, peer({ userId: 'late', displayName: 'Late' }));
    // Panel did NOT re-render — still 0 rows.
    expect(panel.root.querySelectorAll('.pryzm-peer-list__row').length).toBe(0);
  });

  it('dispose is idempotent', () => {
    const aw = fakeAwareness();
    aw._set(1, peer({ userId: 'self', displayName: 'Me' }));
    const panel = new PeerListPanel(aw, { localClientID: 1 });
    panel.dispose();
    expect(() => panel.dispose()).not.toThrow();
  });
});
