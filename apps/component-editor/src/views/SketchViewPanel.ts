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

  // ⚠ THIS DIRECT STORE WRITE IS DELIBERATE, AND IT IS THE ONE IN THIS FILE.
  //
  // P6 says the UI dispatches a command and the handler mutates. It does not
  // apply here, and the decision is PINNED, not improvised:
  // `__tests__/app/secondCompositionRoot.invariants.test.ts` clause 4 lists the
  // stores that must have a command family and states why this one is absent —
  // *"which work plane the author is looking at is ephemeral view selection,
  // not document content. Putting a camera change on the undo stack is the P6
  // over-application that makes Ctrl-Z unusable. If a view ever gains PERSISTED
  // state, it earns a command family."*
  //
  // Concretely: `app/commandBus.ts` pushes an undo entry on EVERY `execute()`
  // and has no undo-neutral dispatch, so a `view.setActive` verb would put
  // every work-plane click on the undo stack and a user pressing Ctrl-Z after
  // drawing would get view switches instead of their geometry back. Nothing in
  // `sketchViewStore` is serialised into a `.pryzm-family`.
  //
  // `tools/ga-gate/check-no-direct-store-writes.ts` counts this site — it is
  // syntactic and cannot see any of the above — and it is carried in that
  // gate's baseline in the same EPHEMERAL VIEW STATE category as
  // `ifcProjectionStore.setForView`. ⛔ If you are here to make the gate
  // greener, the answer is NOT to exempt the category and NOT to raise the
  // threshold; it is to retire a real unbacked write somewhere else.
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
    // ⭐ THE CONSTRAINT TOOLBAR NOW MOUNTS ON EVERY WORK PLANE, ELEVATIONS
    //    INCLUDED — §CONSTRAINT-IS-VIEW-SCOPED.
    //
    //    ⚠ It was PLAN-ONLY here, and the refusal was CORRECT while it stood:
    //    `constraint.*` was registered once against ONE ambient store, entity
    //    ids are minted per document (every document's first point is `pt-0`),
    //    so an elevation constraint was "valid against" the plan document too
    //    and the plan's solver would have enforced a storey height on the
    //    author's floor outline. The stand-in that stood in the toolbar's place
    //    told the user so: *"Constraints are plan-only for now."*
    //
    //    It is closed by the change this file NAMED as its remainder —
    //    `ConstraintCommandContext` resolving `constraintStoreFor(view)`,
    //    exactly as `commands/dimension/index.ts` does — so the toolbar's
    //    dispatches carry `view`, land in THIS plane's own store, and are
    //    solved by THIS plane's own `SolverRunner` (both minted by
    //    `viewSketchSet`). The isolation is structural: a constraint can no
    //    longer reach a foreign document's store at all.
    const constraintToolbar = mountConstraintToolbar({
      commandBus: deps.commandBus,
      selectionStore: deps.selectionStore,
      docStore: doc,
      view: kind,
    });
    canvasHost.appendChild(constraintToolbar.element);
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
        constraintToolbar.destroy();
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
