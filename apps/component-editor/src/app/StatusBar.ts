// StatusBar — bottom HUD that surfaces live constraint-solver stats
// (S52 D1 / S53 D1).
//
// Subscribes to `ConstraintStore`; renders:
//   - Total solves run since mount.
//   - Last solve outcome (`status` + degrees of freedom).
//   - Last solve duration in ms.
//   - Selection count (when a `SelectionStore` is wired in).
//
// All data flows in via stores — no `(window as any)` (rule P6) — and
// the bar redraws via `queueMicrotask` (no `requestAnimationFrame`,
// rule P3).

import type { ConstraintStore } from '../stores/constraintStore.js';
import type { SelectionStore } from '../stores/selectionStore.js';
import type { SolverRunner } from '../sketch/solverRunner.js';

export interface StatusBarMount {
  readonly element: HTMLElement;
  unmount(): void;
}

export interface StatusBarOptions {
  readonly constraintStore: ConstraintStore;
  readonly solverRunner: SolverRunner;
  readonly selectionStore?: SelectionStore;
}

export function mountStatusBar(host: HTMLElement, opts: StatusBarOptions): StatusBarMount {
  const root = document.createElement('footer');
  root.dataset.role = 'family-status-bar';
  root.setAttribute('aria-label', 'Family Creator status');
  root.style.cssText = [
    'display:flex',
    'align-items:center',
    'gap:24px',
    'padding:6px 16px',
    'border-top:1px solid rgba(255,255,255,0.08)',
    'background:rgba(0,0,0,0.35)',
    'color:#a8a8c0',
    'font:12px/1.4 ui-monospace,monospace',
    'min-height:28px',
  ].join(';');

  const solverCell = makeCell('Solver: idle');
  const dofCell = makeCell('DOF: —');
  const durationCell = makeCell('Last: —');
  const selectionCell = makeCell('Selection: 0');
  root.append(solverCell, dofCell, durationCell, selectionCell);
  host.appendChild(root);

  let pending = false;
  function repaint(): void {
    if (pending) return;
    pending = true;
    queueMicrotask(() => {
      pending = false;
      const constraintSnap = opts.constraintStore.get();
      const solverStats = opts.solverRunner.stats();
      const last = solverStats.lastResult;
      const status = !last ? 'idle' : last.ok ? last.status : `error:${last.error.code}`;
      const dof = !last ? '—' : last.ok ? String(last.dof) : '—';
      solverCell.textContent =
        `Solver: ${status} ` +
        `(runs: ${solverStats.totalSolves}, constraints: ${constraintSnap.constraints.length})`;
      dofCell.textContent = `DOF: ${dof}`;
      durationCell.textContent = `Last: ${last ? `${last.durationMs.toFixed(2)} ms` : '—'}`;
      const sel = opts.selectionStore?.get();
      selectionCell.textContent = `Selection: ${sel ? sel.ids.length : 0}`;
    });
  }

  const unsubConstraints = opts.constraintStore.subscribe(repaint);
  const unsubSolver = opts.solverRunner.subscribe(repaint);
  const unsubSelection = opts.selectionStore?.subscribe(repaint) ?? (() => undefined);
  repaint();

  return {
    element: root,
    unmount() {
      unsubConstraints();
      unsubSolver();
      unsubSelection();
      host.removeChild(root);
    },
  };
}

function makeCell(text: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.textContent = text;
  span.style.cssText = 'white-space:nowrap';
  return span;
}
