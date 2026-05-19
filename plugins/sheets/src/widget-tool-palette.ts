// Widget tool palette — vanilla TS DOM helper for drag-from-palette →
// drop-on-sheet → dispatch sheet.addWidget (S39 / Phase 2C).
//
// Spec: `phases/PHASE-2C-Q3-M19-M21-SHEETS-SCHEDULES.md` §S39 line 443
// ("widget palette ... vanilla TS component similar to the furniture
// carousel from S27").
//
// Pattern: the palette is a DOM unit (a <div> containing a button per
// widget kind).  Each button is HTML5-draggable; on dragstart it sets
// the dataTransfer payload "application/x-pryzm-widget-kind" to the
// chosen kind.  On the sheet canvas the host listens for `drop` and
// resolves the kind + drop coordinates into a `sheet.addWidget`
// dispatch via the supplied `onDrop` callback.
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// • Pure DOM — no React, no Web Components, no framework.  Mounts into
//   any HTMLElement; `dispose()` removes listeners + the rendered DOM.
// • The palette does NOT dispatch `sheet.addWidget` itself.  The
//   embedding application wires the canvas drop handler (which knows
//   the active sheet id + can map clientX/Y → paper-mm coordinates).
// • Default size constants (DEFAULT_WIDGET_*) are spec-driven sensible
//   starts; callers can override per-kind via `seedDimensions`.

import type { WidgetKind } from '@pryzm/plugin-sdk';
import { BUILTIN_WIDGET_KINDS } from './widgets/index.js';

export const PALETTE_DATA_TYPE = 'application/x-pryzm-widget-kind';

export const DEFAULT_WIDGET_DIMENSIONS: Readonly<
  Record<WidgetKind, { width: number; height: number }>
> = Object.freeze({
  text:              { width: 60, height: 12 },
  image:             { width: 40, height: 30 },
  'north-arrow':     { width: 20, height: 24 },
  'scale-bar':       { width: 60, height: 8 },
  legend:            { width: 50, height: 40 },
  'revisions-table': { width: 100, height: 30 },
  'schedule-snapshot': { width: 80, height: 50 },
  'bim-tag':         { width: 16, height: 6 },
  line:              { width: 30, height: 1 },
  region:            { width: 40, height: 30 },
});

const KIND_LABELS: Readonly<Record<WidgetKind, string>> = Object.freeze({
  text:              'Text',
  image:             'Image',
  'north-arrow':     'North Arrow',
  'scale-bar':       'Scale Bar',
  legend:            'Legend',
  'revisions-table': 'Revisions',
  'schedule-snapshot': 'Schedule',
  'bim-tag':         'BIM Tag',
  line:              'Line',
  region:            'Region',
});

export interface WidgetPaletteOptions {
  /** DOM container that owns the palette buttons. */
  readonly container: HTMLElement;
  /** Subset of kinds to expose (default: all built-ins). */
  readonly kinds?: ReadonlyArray<WidgetKind>;
  /** Override for the default size of a freshly-dropped widget. */
  readonly seedDimensions?: Partial<Record<WidgetKind, { width: number; height: number }>>;
  /** Optional analytics hook. */
  readonly onDragStart?: (kind: WidgetKind) => void;
}

export interface WidgetPaletteHandle {
  readonly element: HTMLElement;
  /** Resolve a `dragover`/`drop` event back to a widget kind.  Returns
   *  `null` if the event isn't a palette drop (or `dataTransfer` is
   *  unavailable, e.g. some headless test environments). */
  resolveDropKind(e: DragEvent): WidgetKind | null;
  /** Default dimensions for a kind (lookup respects `seedDimensions`). */
  defaultSize(kind: WidgetKind): { width: number; height: number };
  /** Tear down the DOM + listeners. */
  dispose(): void;
}

export function mountWidgetPalette(opts: WidgetPaletteOptions): WidgetPaletteHandle {
  const kinds = opts.kinds ?? BUILTIN_WIDGET_KINDS;
  const seedDimensions = opts.seedDimensions ?? {};
  const root = opts.container.ownerDocument.createElement('div');
  root.className = 'pryzm-widget-palette';
  root.setAttribute('data-pryzm-component', 'widget-palette');

  const disposers: Array<() => void> = [];

  for (const kind of kinds) {
    const btn = opts.container.ownerDocument.createElement('button');
    btn.type = 'button';
    btn.draggable = true;
    btn.className = 'pryzm-widget-palette__item';
    btn.setAttribute('data-widget-kind', kind);
    btn.textContent = KIND_LABELS[kind];

    const handleDragStart = (e: DragEvent): void => {
      if (!e.dataTransfer) return;
      e.dataTransfer.setData(PALETTE_DATA_TYPE, kind);
      e.dataTransfer.effectAllowed = 'copy';
      opts.onDragStart?.(kind);
    };
    btn.addEventListener('dragstart', handleDragStart as EventListener);
    disposers.push(() => btn.removeEventListener('dragstart', handleDragStart as EventListener));
    root.appendChild(btn);
  }

  opts.container.appendChild(root);

  return {
    element: root,
    resolveDropKind(e: DragEvent): WidgetKind | null {
      if (!e.dataTransfer) return null;
      const raw = e.dataTransfer.getData(PALETTE_DATA_TYPE);
      if (!raw) return null;
      return (BUILTIN_WIDGET_KINDS as readonly string[]).includes(raw)
        ? (raw as WidgetKind)
        : null;
    },
    defaultSize(kind: WidgetKind) {
      return seedDimensions[kind] ?? DEFAULT_WIDGET_DIMENSIONS[kind];
    },
    dispose() {
      for (const d of disposers) {
        try { d(); } catch { /* swallow */ }
      }
      root.remove();
    },
  };
}
