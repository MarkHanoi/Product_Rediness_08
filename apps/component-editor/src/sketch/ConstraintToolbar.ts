// ConstraintToolbar — UI bar that dispatches the five S52 constraint
// commands against the current `selectionStore` (S52 D2).
//
// One row of buttons:
//   • Coincident (needs 2 points)
//   • Distance   (needs 2 points + a prompt for mm value)
//   • Fixed      (needs 1 point — pins to its current x/z)
//   • Parallel   (needs 2 lines)
//   • Perpend.   (needs 2 lines)
//
// Each button reads the current selection ids + entity kinds, validates
// arity, and dispatches the verb through the supplied `CommandBus`.
// Errors are surfaced as a small status line under the bar.
//
// Pure DOM. No THREE. No `(window as any)`.

import type { CommandBus } from '../app/commandBus.js';
import {
  ADD_COINCIDENT_VERB,
  ADD_DISTANCE_VERB,
  ADD_FIXED_VERB,
  ADD_PARALLEL_VERB,
  ADD_PERPENDICULAR_VERB,
} from '../commands/constraint/index.js';
import type { EntityId } from './entities.js';
import type { SelectionStore } from '../stores/selectionStore.js';
import type { SketchDocStore } from '../stores/sketchDocStore.js';

export interface ConstraintToolbarMount {
  readonly element: HTMLElement;
  destroy(): void;
}

export interface ConstraintToolbarOptions {
  readonly commandBus: CommandBus;
  readonly selectionStore: SelectionStore;
  readonly docStore: SketchDocStore;
  /** Optional value-prompt — defaults to a `window.prompt`. Tests inject
   *  a deterministic provider. */
  readonly promptValueMm?: (defaultMm: number) => number | null;
}

export function mountConstraintToolbar(opts: ConstraintToolbarOptions): ConstraintToolbarMount {
  const bar = document.createElement('div');
  bar.dataset.role = 'constraint-toolbar';
  bar.style.cssText = [
    'display:flex',
    'gap:6px',
    'padding:6px 12px',
    'align-items:center',
    'background:rgba(0,0,0,0.18)',
    'border-bottom:1px solid rgba(255,255,255,0.06)',
  ].join(';');

  const status = document.createElement('span');
  status.dataset.role = 'constraint-status';
  status.style.cssText = 'margin-left:auto;color:#9090a8;font:12px/1.4 system-ui;min-height:14px';

  const handlers: Array<() => void> = [];
  function makeButton(label: string, onClick: () => Promise<void>): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.style.cssText = constraintButtonStyle();
    const click = (): void => {
      onClick().catch((err: unknown) => setStatus(status, errMessage(err), true));
    };
    btn.addEventListener('click', click);
    handlers.push(() => btn.removeEventListener('click', click));
    return btn;
  }

  const promptFn =
    opts.promptValueMm ??
    ((d: number): number | null => {
      const raw = typeof prompt === 'function' ? prompt('Distance (mm)', String(d)) : null;
      if (raw === null || raw.trim() === '') return null;
      const v = Number(raw);
      return Number.isFinite(v) && v >= 0 ? v : null;
    });

  bar.append(
    makeButton('Coincident', async () => {
      const pts = pickPoints(opts, 2);
      await opts.commandBus.execute(ADD_COINCIDENT_VERB, { p1: pts[0]!, p2: pts[1]! });
      setStatus(status, `Coincident: ${pts[0]} ↔ ${pts[1]}`, false);
    }),
    makeButton('Distance', async () => {
      const pts = pickPoints(opts, 2);
      const a = opts.docStore.get().pointById[pts[0]!]!;
      const b = opts.docStore.get().pointById[pts[1]!]!;
      const current = Math.hypot(a.x - b.x, a.z - b.z);
      const v = promptFn(Math.round(current * 100) / 100);
      if (v === null) {
        setStatus(status, 'Distance cancelled.', false);
        return;
      }
      await opts.commandBus.execute(ADD_DISTANCE_VERB, { p1: pts[0]!, p2: pts[1]!, value: v });
      setStatus(status, `Distance ${v.toFixed(2)} mm: ${pts[0]} → ${pts[1]}`, false);
    }),
    makeButton('Fixed', async () => {
      const pts = pickPoints(opts, 1);
      const p = opts.docStore.get().pointById[pts[0]!]!;
      await opts.commandBus.execute(ADD_FIXED_VERB, { p: pts[0]!, x: p.x, y: p.z });
      setStatus(status, `Fixed ${pts[0]} at (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`, false);
    }),
    makeButton('Parallel', async () => {
      const lns = pickLines(opts, 2);
      await opts.commandBus.execute(ADD_PARALLEL_VERB, { l1: lns[0]!, l2: lns[1]! });
      setStatus(status, `Parallel: ${lns[0]} ∥ ${lns[1]}`, false);
    }),
    makeButton('Perpend.', async () => {
      const lns = pickLines(opts, 2);
      await opts.commandBus.execute(ADD_PERPENDICULAR_VERB, { l1: lns[0]!, l2: lns[1]! });
      setStatus(status, `Perpendicular: ${lns[0]} ⟂ ${lns[1]}`, false);
    }),
    status,
  );

  return {
    element: bar,
    destroy() {
      for (const off of handlers) off();
      bar.remove();
    },
  };
}

function pickPoints(opts: ConstraintToolbarOptions, n: number): EntityId[] {
  const sel = opts.selectionStore.get().ids;
  const doc = opts.docStore.get();
  const pts = sel.filter((id) => Boolean(doc.pointById[id]));
  if (pts.length < n) {
    throw new Error(`Select ${n} point${n === 1 ? '' : 's'} (${pts.length} selected).`);
  }
  return pts.slice(0, n) as EntityId[];
}

function pickLines(opts: ConstraintToolbarOptions, n: number): EntityId[] {
  const sel = opts.selectionStore.get().ids;
  const doc = opts.docStore.get();
  const lns = sel.filter((id) => Boolean(doc.lineById[id]));
  if (lns.length < n) {
    throw new Error(`Select ${n} line${n === 1 ? '' : 's'} (${lns.length} selected).`);
  }
  return lns.slice(0, n) as EntityId[];
}

function setStatus(el: HTMLElement, text: string, isError: boolean): void {
  el.textContent = text;
  el.style.color = isError ? '#ff8888' : '#9090a8';
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return String(err);
}

function constraintButtonStyle(): string {
  return [
    'background:rgba(102,0,255,0.18)',
    'color:#e8e8f0',
    'border:1px solid rgba(102,0,255,0.45)',
    'padding:4px 10px',
    'border-radius:4px',
    'font:12px/1.4 system-ui',
    'cursor:pointer',
  ].join(';');
}
