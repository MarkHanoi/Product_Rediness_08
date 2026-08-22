/**
 * analysisHighlightReachability — does clicking a figure REACH the 3-D paint?
 *
 * Layer Affected:  UI — Analysis surface (L7) · engine bridge
 * ADR:             ADR-0358 §2 (the facet selection model)
 * Contracts:       C27 §4 (SelectionBus is the single authorised entry point)
 * Issue log:       L-6600 · L-6601
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⭐ WHY THIS SUITE IS SOURCE-LEVEL AND NOT ASHAMED OF IT
 * ═════════════════════════════════════════════════════════════════════════════
 * The defect these tests pin was NOT a wrong value. Every function on the path
 * was individually correct: `selectFigure` dispatched the right ids,
 * `DiagnosticMaterialManager._applyAnalysisSelection` painted the right colours,
 * and `InspectModeCoordinator._onSelectionChanged` connected them. What was
 * wrong is that the event the coordinator subscribed to — `'selection.changed'`
 * — had ZERO PRODUCTION EMITTERS, so the middle of the chain was never called.
 *
 * A unit test of any single link would have passed. [[committed-is-not-reachable]]:
 * prove it at the layer the user experiences, never at a pure function's return.
 * The only thing that catches a severed wire is an assertion ABOUT THE WIRE, so
 * one of these reads the coordinator's source and asserts it subscribes to a bus
 * that something actually publishes on.
 *
 * ⛔ If you move the subscription, move this guard. Deleting it because it is
 * "just a grep" restores the exact condition that shipped the dead event.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, beforeEach } from 'vitest';

import { selectionBus } from '@pryzm/core-app-model';

const REPO = resolve(__dirname, '../../../../../..');
const COORDINATOR = resolve(REPO, 'apps/editor/src/engine/inspect/InspectModeCoordinator.ts');
const COMPOSE = resolve(REPO, 'packages/runtime-composer/src/composeRuntime.ts');

describe('L-6600 — the Analysis highlight wire is REACHABLE', () => {
  beforeEach(() => {
    selectionBus.clear();
  });

  it('the coordinator subscribes to selectionBus, the bus every surface dispatches on', () => {
    const src = readFileSync(COORDINATOR, 'utf8');
    // The import, and the subscription itself.
    expect(src).toMatch(/import \{[^}]*\bselectionBus\b[^}]*\} from '@pryzm\/core-app-model'/);
    expect(src).toContain('selectionBus.subscribe(');
  });

  it('both selection sources route through ONE sink, so they cannot become rivals', () => {
    const src = readFileSync(COORDINATOR, 'utf8');
    // Exactly one call site of the material manager's setter. Two would be two
    // rival answers to "what is emphasised", which is the defect shape this
    // repo commits most often.
    const calls = src.match(/diagnosticMaterialManager\.setAnalysisSelection\(/g) ?? [];
    expect(calls).toHaveLength(1);
    // …and it is inside the named sink, reached by both handlers.
    expect(src).toContain('_setAnalysisEmphasis');
  });

  it('MEASURED: `selection.changed` still has exactly one emitter, and it is the runtime stub', () => {
    // ⭐ This is the measurement that made L-6600 a diagnosis rather than a guess,
    // pinned so the claim in the coordinator's comment cannot rot silently.
    // If this count changes, `runtime.selection` acquired (or lost) a publisher
    // and the comment above the subscription must be re-measured — NOT edited to
    // match. Read the code, never this line.
    const compose = readFileSync(COMPOSE, 'utf8');
    const emits = compose.match(/events\.emit\('selection\.changed'/g) ?? [];
    expect(emits).toHaveLength(1);
  });

  it('a subscriber sees the full id set a figure click dispatches — not just the primary', () => {
    // The founder's ask is a FAMILY highlight: clicking "Walls" must deliver every
    // wall, not the last one. `dispatch` derives `currentIds` from the event, and
    // a subscriber reading the bus must see all of them.
    const seen: string[][] = [];
    const off = selectionBus.subscribe((ev) => {
      if (ev.type !== 'select' && ev.type !== 'clear') return;
      seen.push(ev.type === 'clear' ? [] : selectionBus.currentIds);
    });

    selectionBus.dispatch({ type: 'select', source: 'analytics', elementIds: ['w1', 'w2', 'w3'] });
    expect(seen).toEqual([['w1', 'w2', 'w3']]);

    selectionBus.dispatch({ type: 'clear', source: 'analytics', elementIds: [] });
    expect(seen[1]).toEqual([]);
    off();
  });

  it('decoration events do NOT repaint — they do not move the set', () => {
    // 'highlight' / 'isolate' / 'focus-camera' are decorations OVER the current
    // selection; `SelectionBus.dispatch` deliberately refuses to let them rewrite
    // `currentIds`. Repainting on them would paint a set that did not move.
    const seen: string[][] = [];
    const off = selectionBus.subscribe((ev) => {
      if (ev.type !== 'select' && ev.type !== 'clear') return;
      seen.push([...selectionBus.currentIds]);
    });
    selectionBus.dispatch({ type: 'select', source: 'analytics', elementIds: ['a'] });
    selectionBus.dispatch({ type: 'highlight', source: 'analytics', elementIds: ['zzz'] });
    selectionBus.dispatch({ type: 'isolate', source: 'analytics', elementIds: ['yyy'] });
    expect(seen).toEqual([['a']]);
    expect(selectionBus.currentIds).toEqual(['a']);
    off();
  });
});
