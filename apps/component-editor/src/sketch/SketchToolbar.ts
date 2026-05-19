// SketchToolbar — DOM toolbar listing the active sketch tools (S53 D1).
//
// Pulled out of `SketchCanvas.ts` so that file stays under the §13
// 300-LoC cap once arc / circle / fillet / trim / select buttons land.
//
// Pure DOM — no THREE, no `(window as any)`. Single subscriber model:
// the canvas calls `setActive(name)` on tool changes; the toolbar
// calls back the supplied `onSelect` for click events.

import type { ToolName } from './tools/types.js';

export interface SketchToolbarMount {
  readonly element: HTMLElement;
  setActive(name: ToolName): void;
  destroy(): void;
}

export interface SketchToolbarOptions {
  readonly onSelect: (name: ToolName) => void;
  readonly initialActive: ToolName;
  readonly tools?: ReadonlyArray<{ readonly id: ToolName; readonly label: string }>;
}

export const DEFAULT_TOOL_LIST: ReadonlyArray<{ readonly id: ToolName; readonly label: string }> =
  Object.freeze([
    Object.freeze({ id: 'select' as ToolName, label: 'Select' }),
    Object.freeze({ id: 'line' as ToolName, label: 'Line' }),
    Object.freeze({ id: 'rectangle' as ToolName, label: 'Rectangle' }),
    Object.freeze({ id: 'circle' as ToolName, label: 'Circle' }),
    Object.freeze({ id: 'arc' as ToolName, label: 'Arc' }),
    Object.freeze({ id: 'fillet' as ToolName, label: 'Fillet' }),
    Object.freeze({ id: 'trim' as ToolName, label: 'Trim' }),
  ]);

export function mountSketchToolbar(opts: SketchToolbarOptions): SketchToolbarMount {
  const tools = opts.tools ?? DEFAULT_TOOL_LIST;
  const bar = document.createElement('div');
  bar.dataset.role = 'sketch-toolbar';
  bar.style.cssText = [
    'display:flex',
    'gap:4px',
    'padding:6px 12px',
    'background:rgba(0,0,0,0.3)',
    'border-bottom:1px solid rgba(255,255,255,0.08)',
    'flex-wrap:wrap',
  ].join(';');

  const buttons = new Map<ToolName, HTMLButtonElement>();
  const handlers = new Map<ToolName, () => void>();
  for (const t of tools) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.tool = t.id;
    btn.textContent = t.label;
    btn.style.cssText = toolButtonStyle(t.id === opts.initialActive);
    const click = () => opts.onSelect(t.id);
    btn.addEventListener('click', click);
    buttons.set(t.id, btn);
    handlers.set(t.id, click);
    bar.appendChild(btn);
  }

  return {
    element: bar,
    setActive(name) {
      for (const [id, btn] of buttons) {
        btn.style.cssText = toolButtonStyle(id === name);
      }
    },
    destroy() {
      for (const [id, btn] of buttons) {
        const fn = handlers.get(id);
        if (fn) btn.removeEventListener('click', fn);
      }
      buttons.clear();
      handlers.clear();
      bar.remove();
    },
  };
}

function toolButtonStyle(active: boolean): string {
  return [
    `background:${active ? '#6600FF' : 'transparent'}`,
    `color:${active ? '#fff' : '#a8a8c0'}`,
    'border:1px solid rgba(255,255,255,0.15)',
    'padding:4px 12px',
    'border-radius:4px',
    'font:12px/1.4 system-ui',
    'cursor:pointer',
  ].join(';');
}
