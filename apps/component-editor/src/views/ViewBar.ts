// ViewBar — the work-plane switcher: Plan · Front · Side.
//
// Deliberately the same DOM shape and the same button styling as
// `sketch/SketchToolbar.ts` (a `data-*` keyed button row, PRYZM purple
// #6600FF for the active item, one `onSelect` callback) because it sits
// directly beneath it and a second visual language on the same strip would
// read as a second application.
//
// It renders a live ENTITY COUNT per view. ⭐ That badge is not decoration:
// it is the discriminator that tells an author their elevation sketch still
// exists while they are standing on the plan. C102 §2 V-ST-3 — *"a counter
// must be proven by MOTION"* — so `__tests__/views/viewBar.test.ts` draws
// into a view and asserts the badge CHANGES, rather than asserting it shows
// a number.
//
// Pure DOM — no THREE, no rAF, no `(window as any)`. The bar owns no state:
// it reads the store it is handed and calls back on click.

import {
  SKETCH_VIEW_KINDS,
  viewBasis,
  type SketchViewKind,
} from './viewProjection.js';

export interface ViewBarMount {
  readonly element: HTMLElement;
  /** Repaint the active highlight. */
  setActive(kind: SketchViewKind): void;
  /** Repaint the per-view entity counts. */
  setCounts(counts: Readonly<Record<SketchViewKind, number>>): void;
  destroy(): void;
}

export interface ViewBarOptions {
  readonly initialActive: SketchViewKind;
  readonly onSelect: (kind: SketchViewKind) => void;
  readonly initialCounts?: Readonly<Record<SketchViewKind, number>>;
}

export function mountViewBar(opts: ViewBarOptions): ViewBarMount {
  const bar = document.createElement('nav');
  bar.dataset.role = 'sketch-view-bar';
  bar.setAttribute('aria-label', 'Work plane');
  bar.style.cssText = [
    'display:flex',
    'gap:4px',
    'align-items:center',
    'padding:6px 12px',
    'background:rgba(0,0,0,0.25)',
    'border-bottom:1px solid rgba(255,255,255,0.08)',
    'flex-wrap:wrap',
  ].join(';');

  const label = document.createElement('span');
  label.textContent = 'Work plane';
  label.style.cssText = 'color:#7878a0;font:11px/1.4 system-ui;margin-right:6px';
  bar.appendChild(label);

  const buttons = new Map<SketchViewKind, HTMLButtonElement>();
  const badges = new Map<SketchViewKind, HTMLSpanElement>();
  const handlers = new Map<SketchViewKind, () => void>();

  for (const kind of SKETCH_VIEW_KINDS) {
    const basis = viewBasis(kind);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.view = kind;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', String(kind === opts.initialActive));
    // The axis pair is the honest description of the view: an author who has
    // never used this editor can read "Front (X/Y)" and know heights go up.
    btn.title = `${basis.label} — ${basis.axisLabels[0]}/${basis.axisLabels[1]}` +
      (basis.isVertical ? ' (vertical work plane)' : ' (horizontal work plane)');
    btn.style.cssText = viewButtonStyle(kind === opts.initialActive);

    const text = document.createElement('span');
    text.textContent = basis.label;
    btn.appendChild(text);

    const badge = document.createElement('span');
    badge.dataset.viewCount = kind;
    badge.style.cssText = [
      'margin-left:6px',
      'padding:0 5px',
      'border-radius:8px',
      'background:rgba(255,255,255,0.12)',
      'font:10px/1.6 monospace',
    ].join(';');
    badge.textContent = String(opts.initialCounts?.[kind] ?? 0);
    btn.appendChild(badge);

    const click = () => opts.onSelect(kind);
    btn.addEventListener('click', click);
    buttons.set(kind, btn);
    badges.set(kind, badge);
    handlers.set(kind, click);
    bar.appendChild(btn);
  }

  return {
    element: bar,
    setActive(kind) {
      for (const [id, btn] of buttons) {
        const isActive = id === kind;
        btn.setAttribute('aria-selected', String(isActive));
        btn.style.cssText = viewButtonStyle(isActive);
      }
    },
    setCounts(counts) {
      for (const [id, badge] of badges) {
        badge.textContent = String(counts[id] ?? 0);
      }
    },
    destroy() {
      for (const [id, btn] of buttons) {
        const fn = handlers.get(id);
        if (fn) btn.removeEventListener('click', fn);
      }
      buttons.clear();
      badges.clear();
      handlers.clear();
      bar.remove();
    },
  };
}

function viewButtonStyle(active: boolean): string {
  return [
    `background:${active ? '#6600FF' : 'transparent'}`,
    `color:${active ? '#fff' : '#a8a8c0'}`,
    'border:1px solid rgba(255,255,255,0.15)',
    'padding:4px 10px',
    'border-radius:4px',
    'font:12px/1.4 system-ui',
    'cursor:pointer',
    'display:inline-flex',
    'align-items:center',
  ].join(';');
}
