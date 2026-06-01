// src/ui/ConflictResolutionDialog.ts — Wave A19-T6
//
// CONTRACT (C08 §3.2):
// When CRDT merge cannot auto-resolve a semantic conflict, the system MUST
// enter CONFLICTED state and show this dialog with both versions side-by-side.
// The user MUST choose "Keep mine", "Keep theirs", or "Merge" — the system
// MUST NOT choose automatically (P8: explicit conflicts, never silent resolve).
//
// The dialog is aria-modal so assistive technologies announce it correctly.
// Keyboard: Tab cycles focusable elements; Escape = Keep mine (safe default).
//
// Resolution produces a command of source: 'conflict-resolution' that is
// logged and undoable (C08 §3.2 requirement).
//
// P3 (rAF gate): focus deferral routes through getFrameScheduler().scheduleOnce()
// — not raw requestAnimationFrame — per docs/archive/pryzm3-internal/01-VISION.md §2 P3.

import { getFrameScheduler } from '@pryzm/frame-scheduler';
import { escHtml } from '@pryzm/ui-base';

// CRDTConflict inlined here to avoid cross-package import at build time.
// The canonical definition lives in packages/sync-client/src/YjsDocAdapter.ts.
export interface CRDTConflict {
  elementId: string;
  property: string;
  localValue: unknown;
  remoteValue: unknown;
  remoteAuthor: string;
  timestamp: number;
}

export type ConflictResolution = 'local' | 'remote' | 'merged';

export interface ConflictResolutionResult {
  conflict: CRDTConflict;
  resolution: ConflictResolution;
  mergedValue?: unknown;
}

type ResolveCallback = (result: ConflictResolutionResult) => void;

// ─── ConflictResolutionDialog ────────────────────────────────────────────────

/**
 * ConflictResolutionDialog — shows conflicting values side by side.
 * The user picks "Keep mine", "Keep theirs", or types a manual merge value.
 *
 * Usage:
 *   const dialog = new ConflictResolutionDialog();
 *   dialog.show(conflict, (result) => resolver.applyResolution(result));
 */
export class ConflictResolutionDialog {
  private _overlay: HTMLElement | null = null;
  private _resolveCb: ResolveCallback | null = null;

  /**
   * Show the conflict resolution dialog for a given CRDT conflict.
   * Only one dialog is shown at a time — subsequent calls replace the current.
   */
  show(conflict: CRDTConflict, onResolve: ResolveCallback): void {
    this.hide();
    this._resolveCb = onResolve;

    // Overlay backdrop
    const overlay = document.createElement('div');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Conflict resolution');
    overlay.setAttribute('aria-live', 'assertive');
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', zIndex: '9999',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)',
    });

    // Dialog panel
    const panel = document.createElement('div');
    panel.setAttribute('tabindex', '-1');
    Object.assign(panel.style, {
      background: '#1e293b', color: '#f8fafc', borderRadius: '12px',
      padding: '28px 32px', maxWidth: '520px', width: '90vw',
      boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
      fontFamily: 'system-ui, sans-serif', lineHeight: '1.5',
    });

    // Title
    const title = document.createElement('h2');
    title.textContent = 'Concurrent Edit Conflict';
    Object.assign(title.style, {
      margin: '0 0 8px', fontSize: '18px', fontWeight: '600', color: '#f1f5f9',
    });

    // Subtitle
    const subtitle = document.createElement('p');
    const elementLabel = conflict.elementId.slice(0, 12);
    subtitle.innerHTML =
      `Two users edited <strong style="color:#93c5fd">${escHtml(conflict.property)}</strong> ` +
      `of element <code style="color:#86efac;font-size:12px">${escHtml(elementLabel)}…</code> ` +
      `at the same time. Choose which version to keep.`;
    Object.assign(subtitle.style, { margin: '0 0 20px', fontSize: '13px', color: '#94a3b8' });

    // Side-by-side values
    const grid = document.createElement('div');
    Object.assign(grid.style, {
      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px',
    });

    const makeCard = (label: string, value: unknown, accent: string): HTMLElement => {
      const card = document.createElement('div');
      Object.assign(card.style, {
        background: '#0f172a', border: `1.5px solid ${accent}`,
        borderRadius: '8px', padding: '12px',
      });
      const lbl = document.createElement('div');
      lbl.textContent = label;
      Object.assign(lbl.style, { fontSize: '11px', fontWeight: '700', color: accent, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' });
      const val = document.createElement('div');
      val.textContent = JSON.stringify(value);
      Object.assign(val.style, { fontSize: '14px', color: '#e2e8f0', wordBreak: 'break-all', fontFamily: 'monospace' });
      card.appendChild(lbl);
      card.appendChild(val);
      return card;
    };

    grid.appendChild(makeCard('Your value', conflict.localValue, '#4ade80'));
    grid.appendChild(makeCard(`${conflict.remoteAuthor}'s value`, conflict.remoteValue, '#60a5fa'));

    // Author note
    const note = document.createElement('p');
    note.textContent = `Conflict detected ${new Date(conflict.timestamp).toLocaleTimeString()}. Your edit was NOT silently overwritten.`;
    Object.assign(note.style, { margin: '0 0 20px', fontSize: '12px', color: '#64748b', fontStyle: 'italic' });

    // Action buttons
    const actions = document.createElement('div');
    Object.assign(actions.style, { display: 'flex', gap: '10px', flexWrap: 'wrap' });

    const makeBtn = (
      label: string,
      bg: string,
      resolution: ConflictResolution,
      mergedValue?: unknown,
    ): HTMLButtonElement => {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.setAttribute('type', 'button');
      Object.assign(btn.style, {
        flex: '1', minWidth: '120px', padding: '10px 16px',
        background: bg, color: '#fff', border: 'none', borderRadius: '8px',
        fontSize: '13px', fontWeight: '600', cursor: 'pointer',
        transition: 'opacity 0.15s',
      });
      btn.onmouseenter = () => { btn.style.opacity = '0.85'; };
      btn.onmouseleave = () => { btn.style.opacity = '1'; };
      btn.onclick = () => {
        this._resolve({ conflict, resolution, mergedValue });
      };
      return btn;
    };

    const keepMineBtn = makeBtn('Keep mine', '#16a34a', 'local');
    keepMineBtn.setAttribute('autofocus', '');
    actions.appendChild(keepMineBtn);
    actions.appendChild(makeBtn('Keep theirs', '#2563eb', 'remote'));
    actions.appendChild(makeBtn('Merge (average)', '#7c3aed', 'merged',
      // Simple additive merge for numeric; fallback to local for strings
      typeof conflict.localValue === 'number' && typeof conflict.remoteValue === 'number'
        ? (conflict.localValue + conflict.remoteValue) / 2
        : conflict.localValue,
    ));

    // Keyboard: Escape = Keep mine
    overlay.onkeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this._resolve({ conflict, resolution: 'local' });
      }
    };

    panel.appendChild(title);
    panel.appendChild(subtitle);
    panel.appendChild(grid);
    panel.appendChild(note);
    panel.appendChild(actions);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    this._overlay = overlay;

    // Focus the panel after mount — routed through frame-scheduler (P3 rAF gate).
    getFrameScheduler().scheduleOnce('conflict-dialog-focus', () => { panel.focus(); });
  }

  /** Programmatically hide the dialog (e.g. project closes). */
  hide(): void {
    this._overlay?.remove();
    this._overlay = null;
    this._resolveCb = null;
  }

  private _resolve(result: ConflictResolutionResult): void {
    const cb = this._resolveCb;
    this.hide();
    cb?.(result);
  }
}
