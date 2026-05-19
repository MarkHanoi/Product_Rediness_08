// PeerListPanel — vanilla-DOM sidebar listing every connected peer.
//
// Spec: `phases/PHASE-2D-Q4-M22-M24-SYNC-AWARENESS-BETA.md` §S44 D4
//   "peer list UI sidebar"
// + spec line 279: "a chip on the peer list saying 'Plan view — Level 1
//   — Wall tool'."
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// • Vanilla TS / DOM (the editor is no-React).
// • Subscribes to PryzmAwareness's 'change' event.
// • Re-renders into a host HTMLElement on every change.
// • Skips the local peer (you don't list yourself).
// • Each peer row shows: color swatch, display name, view chip, tool chip,
//   idle indicator.
// • Pure: no transport, no THREE.

import type { PryzmAwareness, PryzmAwarenessState } from '@pryzm/plugin-sdk';
import { peerColorFor } from './cursor.js';
import { renderViewChip } from './view-chip.js';

export interface PeerListPanelOptions {
  /** The local awareness clientID — used to skip self. */
  readonly localClientID: number;
  /** Optional view-name display map: viewId → human label.  Defaults to
   *  the viewId verbatim. */
  readonly viewLabelFor?: (viewId: string) => string;
  /** Optional tool-name display map.  Defaults to the toolId verbatim. */
  readonly toolLabelFor?: (toolId: string) => string;
  /** Idle threshold in ms; peers older than this get the idle indicator.
   *  Default 30 000 (30 s). */
  readonly idleThresholdMs?: number;
  /** Clock injection for tests. */
  readonly now?: () => number;
}

const DEFAULT_IDLE_MS = 30_000;

/** PeerListPanel — owns one HTMLElement and re-renders it on every
 *  awareness change.  Caller mounts the element wherever it likes
 *  (`sidebar.appendChild(panel.root)`), then disposes when done. */
export class PeerListPanel {
  /** The root element.  Caller mounts this anywhere in the DOM. */
  readonly root: HTMLElement;
  private readonly awareness: PryzmAwareness;
  private readonly localClientID: number;
  private readonly viewLabelFor: (viewId: string) => string;
  private readonly toolLabelFor: (toolId: string) => string;
  private readonly idleThresholdMs: number;
  private readonly now: () => number;
  private unsubscribe: (() => void) | null = null;
  private disposed = false;

  constructor(awareness: PryzmAwareness, opts: PeerListPanelOptions) {
    this.awareness = awareness;
    this.localClientID = opts.localClientID;
    this.viewLabelFor = opts.viewLabelFor ?? ((id) => id);
    this.toolLabelFor = opts.toolLabelFor ?? ((id) => id);
    this.idleThresholdMs = opts.idleThresholdMs ?? DEFAULT_IDLE_MS;
    this.now = opts.now ?? Date.now;

    this.root = document.createElement('div');
    this.root.className = 'pryzm-peer-list';
    this.root.setAttribute('role', 'list');
    this.root.setAttribute('aria-label', 'Peers');
    this.render();
    this.unsubscribe = awareness.on('change', () => this.render());
  }

  /** Force a re-render without waiting for the next 'change' event. */
  render(): void {
    if (this.disposed) return;
    const states = this.awareness.getStates();
    const peers: Array<{ clientID: number; state: PryzmAwarenessState }> = [];
    for (const [clientID, state] of states) {
      if (clientID === this.localClientID) continue;
      peers.push({ clientID, state });
    }
    // Sort deterministically by displayName then by clientID so the list
    // doesn't reorder on every render.
    peers.sort((a, b) =>
      a.state.displayName.localeCompare(b.state.displayName) || (a.clientID - b.clientID),
    );

    // Clear existing children and re-render.  For 25 beta users this is
    // O(N) and fast enough; if peer count ever grows we'd promote to
    // diff-based DOM updates.
    while (this.root.firstChild) this.root.removeChild(this.root.firstChild);
    if (peers.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'pryzm-peer-list__empty';
      empty.textContent = 'No other peers connected';
      this.root.appendChild(empty);
      return;
    }
    for (const { clientID, state } of peers) {
      this.root.appendChild(this.renderRow(clientID, state));
    }
  }

  /** Tear down: unsubscribe from awareness, leave DOM as-is for caller
   *  to remove. */
  dispose(): void {
    if (this.disposed) return;
    if (this.unsubscribe) { this.unsubscribe(); this.unsubscribe = null; }
    this.disposed = true;
  }

  // ─── Internals ─────────────────────────────────────────────────────────

  private renderRow(clientID: number, state: PryzmAwarenessState): HTMLElement {
    const row = document.createElement('div');
    row.className = 'pryzm-peer-list__row';
    row.setAttribute('role', 'listitem');
    row.dataset.clientId = String(clientID);
    row.dataset.userId = state.userId;

    // Color swatch.
    const swatch = document.createElement('span');
    swatch.className = 'pryzm-peer-list__swatch';
    swatch.style.backgroundColor = peerColorFor(state.userId);
    row.appendChild(swatch);

    // Display name.
    const name = document.createElement('span');
    name.className = 'pryzm-peer-list__name';
    name.textContent = state.displayName;
    row.appendChild(name);

    // View chip — always shown.
    row.appendChild(renderViewChip({
      viewLabel: this.viewLabelFor(state.activeViewId),
      kind: 'view',
    }));

    // Tool chip — only when tool is set.
    if (state.activeTool) {
      row.appendChild(renderViewChip({
        viewLabel: this.toolLabelFor(state.activeTool),
        kind: 'tool',
      }));
    }

    // Idle indicator.
    const idleMs = this.now() - state.lastActivity;
    if (idleMs >= this.idleThresholdMs) {
      const idle = document.createElement('span');
      idle.className = 'pryzm-peer-list__idle';
      idle.textContent = 'idle';
      row.appendChild(idle);
    }

    return row;
  }
}
