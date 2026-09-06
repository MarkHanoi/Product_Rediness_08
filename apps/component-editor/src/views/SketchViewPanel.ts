// SketchViewPanel — the drawing surface as a VIEW: work-plane bar, the
// sketch canvas bound to THAT view's document, and the annotation layer.
//
// Extracted from `AppShell.ts` rather than grown inside it, for the §13
// 300-LoC cap and so the whole plan/elevation/3D concern lives in one place.
// `AppShell`'s sketch branch is now one call.
//
// ─── SWITCHING PRESERVES THE SKETCH, AND HERE IS THE MECHANISM ──────────────
// A view switch tears down the canvas and rebuilds it against a DIFFERENT
// `SketchDocStore` — the one `viewSketchSet` holds for that work plane. The
// documents are owned by the runtime and outlive the DOM, so switching away
// and back restores exactly what was drawn. Nothing is serialised, copied or
// re-projected; the other view's document was simply never touched.
//
// ⚠ THE OVERLAY IS PARENTED ONTO THE SKETCH CANVAS'S OWN WRAPPER, found by
// its documented `data-role="sketch-canvas"` handle (the same handle
// `AppShell.test.ts` asserts on). That is a deliberate reach across a module
// boundary, taken because the alternative — editing `SketchCanvas.ts` to
// expose an overlay slot — collides with a lane editing that file right now.
// The clean form is a `SketchCanvasMount.overlayHost` accessor; it is named in
// this lane's handoff, not silently forgotten.
//
// LAYER — L7 chrome-side. No THREE, no rAF, no `(window as any)`.

import { mountConstraintToolbar } from '../sketch/ConstraintToolbar.js';
import { mountSketchCanvas, type SketchCanvasMount } from '../sketch/SketchCanvas.js';
import { mountDimensionOverlay, type DimensionOverlayMount } from '../measure/DimensionOverlay.js';
import type { CommandBus } from '../app/commandBus.js';
import type { DimensionStore } from '../stores/dimensionStore.js';
import type { SelectionStore } from '../stores/selectionStore.js';
import type { SketchDocStore } from '../stores/sketchDocStore.js';
import { mountViewBar, type ViewBarMount } from './ViewBar.js';
import type { SketchViewStore } from './sketchViewStore.js';
import type { ViewSketchSet } from './viewSketchSet.js';
import { viewBasis, type SketchViewKind } from './viewProjection.js';

/** The runtime slots this panel needs. Structural, not a `FamilyEditorRuntime`
 *  import, so the panel stays testable against a hand-built fixture. */
export interface SketchViewPanelDeps {
  readonly commandBus: CommandBus;
  readonly selectionStore: SelectionStore;
  readonly dimensionStore: DimensionStore;
  readonly sketchViewStore: SketchViewStore;
  readonly sketchViews: ViewSketchSet;
}

export interface SketchViewPanelMount {
  readonly element: HTMLElement;
  /** The document currently on screen. Test seam. */
  activeDoc(): SketchDocStore;
  activeView(): SketchViewKind;
  readonly overlay: () => DimensionOverlayMount;
  unmount(): void;
}

export function mountSketchViewPanel(
  host: HTMLElement,
  deps: SketchViewPanelDeps,
): SketchViewPanelMount {
  const root = document.createElement('div');
  root.dataset.role = 'sketch-view-panel';
  root.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0';

  const viewBar: ViewBarMount = mountViewBar({
    initialActive: deps.sketchViewStore.get().active,
    initialCounts: deps.sketchViews.entityCounts(),
    onSelect: (kind) => deps.sketchViewStore.setActive(kind),
  });

  const strip = document.createElement('div');
  strip.dataset.role = 'measure-strip';
  strip.style.cssText = [
    'display:flex',
    'gap:8px',
    'align-items:center',
    'padding:4px 12px',
    'background:rgba(0,0,0,0.18)',
    'border-bottom:1px solid rgba(255,255,255,0.06)',
  ].join(';');

  const dimBtn = document.createElement('button');
  dimBtn.type = 'button';
  dimBtn.dataset.role = 'dimension-toggle';
  dimBtn.textContent = 'Dimension';
  dimBtn.setAttribute('aria-pressed', 'false');
  dimBtn.style.cssText = dimButtonStyle(false);

  const hint = document.createElement('span');
  hint.dataset.role = 'measure-hint';
  hint.style.cssText = 'color:#a8a8c0;font:11px/1.4 system-ui';

  const axisNote = document.createElement('span');
  axisNote.dataset.role = 'work-plane-note';
  axisNote.style.cssText = 'margin-left:auto;color:#7878a0;font:11px/1.4 monospace';

  strip.append(dimBtn, hint, axisNote);

  const canvasHost = document.createElement('div');
  canvasHost.dataset.role = 'sketch-canvas-host';
  canvasHost.style.cssText = 'flex:1;min-height:0;display:flex;flex-direction:column';

  root.append(viewBar.element, strip, canvasHost);
  host.appendChild(root);

  let armed = false;
  let mounted = buildForView(deps.sketchViewStore.get().active);

  function paintAxisNote(kind: SketchViewKind): void {
    const b = viewBasis(kind);
    axisNote.textContent =
      `${b.label}  ${b.axisLabels[0]}→ ${b.axisLabels[1]}↑  ` +
      `${b.isVertical ? 'vertical plane' : 'horizontal plane'}`;
  }

  function buildForView(kind: SketchViewKind): {
    readonly kind: SketchViewKind;
    readonly doc: SketchDocStore;
    readonly canvas: SketchCanvasMount;
    readonly overlay: DimensionOverlayMount;
    teardown(): void;
  } {
    const doc = deps.sketchViews.docFor(kind);
    // ⛔ THE CONSTRAINT TOOLBAR IS PLAN-ONLY, AND THIS IS A REFUSAL WITH A
    //    REASON, NOT AN OVERSIGHT.
    //
    //    `constraint.*` is registered ONCE against the runtime's constraint
    //    store — which `viewSketchSet` adopts as the PLAN store. Entity ids
    //    are minted per document, so an elevation's `pt-0` is also the plan's
    //    `pt-0`: authoring a constraint while standing on an elevation would
    //    write a constraint that the PLAN's solver considers valid, and the
    //    author's floor outline would deform. Offering the button and
    //    corrupting the plan is strictly worse than not offering it.
    //
    //    NAMED REMAINDER: making `constraint.*` view-aware is one change —
    //    `ConstraintCommandDeps` taking a `constraintStoreFor(view)` resolver,
    //    exactly as `commands/dimension/index.ts` now does. It is left to lane
    //    CE-PARAMS-AND-PLANES, which owns constraint/parameter binding, so two
    //    lanes do not edit that command family in the same tree.
    //
    //    Dimensions are NOT affected: `dimension.place` already routes through
    //    `constraintStoreFor(args.view)`, so a DRIVING dimension works on an
    //    elevation and is solved by that elevation's own runner.
    const constraintToolbar = viewBasis(kind).isVertical
      ? null
      : mountConstraintToolbar({
        commandBus: deps.commandBus,
        selectionStore: deps.selectionStore,
        docStore: doc,
      });
    if (constraintToolbar) canvasHost.appendChild(constraintToolbar.element);
    else canvasHost.appendChild(elevationConstraintNote());
    const canvas = mountSketchCanvas(canvasHost, {
      store: doc,
      selectionStore: deps.selectionStore,
    });
    // See the header note: the overlay parents onto the sketch canvas's own
    // wrapper so it covers the drawing area and not the tool strip above it.
    const sketchCanvasEl = canvas.element.querySelector<HTMLCanvasElement>(
      'canvas[data-role="sketch-canvas"]',
    );
    const overlayHost = sketchCanvasEl?.parentElement ?? canvasHost;
    const overlay = mountDimensionOverlay(overlayHost, {
      commandBus: deps.commandBus,
      dimensionStore: deps.dimensionStore,
      viewStore: deps.sketchViewStore,
      view: kind,
      doc,
      onHint: (text) => { hint.textContent = text; },
      onError: (err) => {
        hint.textContent = err instanceof Error ? err.message : String(err);
      },
    });
    overlay.setArmed(armed);
    paintAxisNote(kind);
    return {
      kind,
      doc,
      canvas,
      overlay,
      teardown() {
        overlay.unmount();
        canvas.unmount();
        constraintToolbar?.destroy();
      },
    };
  }

  const onToggle = (): void => {
    armed = !armed;
    dimBtn.setAttribute('aria-pressed', String(armed));
    dimBtn.style.cssText = dimButtonStyle(armed);
    mounted.overlay.setArmed(armed);
  };
  dimBtn.addEventListener('click', onToggle);

  const unsubView = deps.sketchViewStore.subscribe((snap) => {
    if (snap.active === mounted.kind) return;
    mounted.teardown();
    mounted = buildForView(snap.active);
    viewBar.setActive(snap.active);
  });

  const unsubDocs = deps.sketchViews.subscribeAny(() => {
    viewBar.setCounts(deps.sketchViews.entityCounts());
  });

  return {
    element: root,
    activeDoc: () => mounted.doc,
    activeView: () => mounted.kind,
    overlay: () => mounted.overlay,
    unmount() {
      dimBtn.removeEventListener('click', onToggle);
      unsubView();
      unsubDocs();
      mounted.teardown();
      viewBar.destroy();
      root.remove();
    },
  };
}

/** The honest stand-in where the constraint toolbar would be on an elevation.
 *  It states WHY the tool is absent rather than leaving a blank strip that
 *  reads as a rendering bug. */
function elevationConstraintNote(): HTMLElement {
  const note = document.createElement('div');
  note.dataset.role = 'elevation-constraint-note';
  note.setAttribute('role', 'note');
  note.textContent =
    'Constraints are plan-only for now. Dimensions work here and drive this elevation.';
  note.style.cssText = [
    'padding:4px 12px',
    'color:#7878a0',
    'font:11px/1.4 system-ui',
    'background:rgba(0,0,0,0.12)',
    'border-bottom:1px solid rgba(255,255,255,0.06)',
  ].join(';');
  return note;
}

function dimButtonStyle(active: boolean): string {
  return [
    `background:${active ? '#6600FF' : 'transparent'}`,
    `color:${active ? '#fff' : '#a8a8c0'}`,
    'border:1px solid rgba(255,255,255,0.15)',
    'padding:3px 10px',
    'border-radius:4px',
    'font:11px/1.4 system-ui',
    'cursor:pointer',
  ].join(';');
}
