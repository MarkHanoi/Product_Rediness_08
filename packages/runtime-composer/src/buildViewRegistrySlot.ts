// buildViewRegistrySlot — the typed adapter behind `runtime.viewRegistry`.
//
// Phase D.11-prep, **fully typed in Wave 4 Track A (PR 4.A.1)** per
// `04-PLAN-FORWARD/08-WAVE-4-SLOT-TYPING-ROUTING.md §2`.
//
// Extracted from `composeRuntime.ts` so it lives next to its siblings
// (`buildPersistence.ts`, `ImportExportSlots.ts`, `ToastController.ts`)
// and so the unit test in `__tests__/viewRegistry.slot.test.ts` can
// import + drive it directly without standing up a full `composeRuntime()`.
//
// The `registry` parameter is the real `ViewRegistry` (a
// `Store<ViewDefinition>` from `@pryzm/view-state`) — no `unknown`,
// no defensive `as` casts.  D.11 proper swaps in the real
// `view.switch`-driven activation pipeline (rewires camera +
// visibility filters) without a slot-contract change.

import type { ViewKind, ViewRegistry } from '@pryzm/view-state';

import type { EventBus } from './EventBus.js';
import type { Disposable, PanelViewSpec, ViewRegistrySlot, ViewRegistrySummary } from './types.js';

/** Slot-side projection of `ViewKind`.
 *
 *  S17 ships `'3d-perspective' | '3d-orthographic'` only; both fold to
 *  `'3d'` in the slot summary.  When 2A / 2B widen `ViewKind` with
 *  `'plan'` / `'section'` / `'sheet'`, this switch becomes a TS-error
 *  -driven extension point — `noFallthroughCasesInSwitch` makes any
 *  missing case an explicit compile error rather than a silent
 *  fallthrough to `'3d'`. */
export function mapViewKind(
  kind: ViewKind,
): 'plan' | 'section' | '3d' | 'sheet' {
  switch (kind) {
    case '3d-perspective':
    case '3d-orthographic':
      return '3d';
  }
}

/** Build the typed `viewRegistry` slot.
 *
 *  Behaviour — D.11-prep:
 *    * `list()`           — projection of `registry.getState()` snapshot.
 *    * `activate(viewId)` — mirrors `activeViewId` locally + fans out
 *                           to per-call subscribers + emits the typed
 *                           `'viewRegistry.activate'` event on `events`
 *                           + warn-once breadcrumb on first call.  No
 *                           camera / visibility re-drive yet — D.11
 *                           proper lands that, gated on D.4.
 *    * `subscribe(fn)`    — fires on every `activate()`, including the
 *                           one that emits the breadcrumb.
 *
 *  Per-listener errors are loud-fail-soft: a thrown subscriber is
 *  logged but does not break the others, matching `EventBus.emit`. */
export function buildViewRegistrySlot(
  registry: ViewRegistry,
  events: EventBus,
): ViewRegistrySlot {
  let activeViewId: string | null = null;
  const subs = new Set<(viewId: string | null) => void>();
  let warned = false;
  const warnOnce = (): void => {
    if (warned) return;
    warned = true;
    console.warn(
      '[runtime-composer/viewRegistry] D.11-prep stub: activate() called before ' +
      'D.11 wires the real view.switch pipeline. activeViewId is mirrored locally ' +
      'and a viewRegistry.activate event is emitted, but camera + visibility filters ' +
      'are NOT re-driven yet.',
    );
  };

  // ── Wave 6 panel-binding state ─────────────────────────────────────────────
  // Tracks the set of currently-active panel IDs.  Re-created (not mutated)
  // on every change so subscribers always receive a stable snapshot.
  // Docs: docs/03_PRYZM3/04-PLAN-FORWARD/10-WAVE-6-CONVERGENCE.md §2
  let activePanelIds: ReadonlySet<string> = new Set();
  const panelSubs = new Set<(ids: ReadonlySet<string>) => void>();

  /** Notify panel subscribers — shared helper to ensure consistency. */
  function notifyPanelSubs(): void {
    for (const listener of panelSubs) {
      try {
        listener(activePanelIds);
      } catch (err) {
        console.error('[runtime-composer/viewRegistry] panel subscriber threw:', err);
      }
    }
  }

  return {
    get activeViewId(): string | null {
      return activeViewId;
    },

    list(): readonly ViewRegistrySummary[] {
      const out: ViewRegistrySummary[] = [];
      for (const def of registry.getState().values()) {
        out.push({ id: def.id, name: def.name, kind: mapViewKind(def.kind) });
      }
      return out;
    },

    async activate(viewId: string): Promise<void> {
      warnOnce();
      const next = viewId === '' ? null : viewId;
      if (activeViewId === next) return;
      activeViewId = next;
      for (const s of subs) {
        try {
          s(activeViewId);
        } catch (err) {
          console.error('[runtime-composer/viewRegistry] subscriber threw:', err);
        }
      }
      // Typed emit — `'viewRegistry.activate'` is a member of
      // `RuntimeEvents` per PR 4.A.1 (Wave 4 Track A).  No `as` cast.
      try {
        events.emit('viewRegistry.activate', { viewId: activeViewId });
      } catch (err) {
        console.error('[runtime-composer/viewRegistry] events emit threw:', err);
      }
    },

    subscribe(listener) {
      subs.add(listener);
      return { dispose: (): void => void subs.delete(listener) };
    },

    // ── Wave 6: panel-binding API ──────────────────────────────────────────

    activatePanel(panelId: string, _viewSpec?: PanelViewSpec): void {
      // OTel span: pryzm.ui.panel.activate  (P8 — one span per public fn)
      if ((activePanelIds as Set<string>).has(panelId)) return;
      const next = new Set(activePanelIds);
      next.add(panelId);
      activePanelIds = next;
      notifyPanelSubs();
      try {
        events.emit('ui.panel.activated', { panelId });
      } catch (err) {
        console.error('[runtime-composer/viewRegistry] activatePanel emit threw:', err);
      }
    },

    deactivatePanel(panelId: string): void {
      // OTel span: pryzm.ui.panel.deactivate  (P8)
      if (!(activePanelIds as Set<string>).has(panelId)) return;
      const next = new Set(activePanelIds);
      next.delete(panelId);
      activePanelIds = next;
      notifyPanelSubs();
      try {
        events.emit('ui.panel.deactivated', { panelId });
      } catch (err) {
        console.error('[runtime-composer/viewRegistry] deactivatePanel emit threw:', err);
      }
    },

    getActivePanelIds(): ReadonlySet<string> {
      return activePanelIds;
    },

    subscribePanelChange(listener: (ids: ReadonlySet<string>) => void): Disposable {
      panelSubs.add(listener);
      return { dispose: (): void => void panelSubs.delete(listener) };
    },
  };
}
