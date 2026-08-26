/**
 * §PANEL-MODE-GATE (L-12080..L-12082) — the properties panel is Author-only.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * THE REPORT
 * ═════════════════════════════════════════════════════════════════════════════
 * Selecting a storey's 68 elements in ANALYSIS mode popped the "MULTI-SELECTION
 * — 68 elements selected" panel straight over the Analysis widgets those 68
 * elements had been selected to read. Same in Inspect and Data. The panel
 * belongs to Author mode.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⚠ THE HALF THAT MUST NOT BREAK — and why the last describe block exists
 * ═════════════════════════════════════════════════════════════════════════════
 * Selection is LOAD-BEARING in the very modes the panel is suppressed in.
 * Analysis's own header reads "Every figure traceable to elements — click any of
 * them"; its Relationship graph says "select an element in 3-D to see its
 * relationships here"; Inspect's isolation pipeline is selection-driven. So the
 * cheap way to make this symptom go away — stop selecting — would be a strictly
 * worse product wearing this lane's commit message.
 *
 * `ARM D` therefore asserts the SELECTION, not the absence of the panel: with
 * the panel suppressed, the real `selectionBus` still holds all 68 ids, the real
 * SelectionManager seam still receives the primary via `selectById` and the
 * other 67 via `applyMarqueeHighlights`. A future "fix" that gates selection
 * fails ARM D while ARM B still passes — which is the entire point of splitting
 * them.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * WHAT THIS FILE CANNOT ESTABLISH — stated, not glossed
 * ═════════════════════════════════════════════════════════════════════════════
 * happy-dom performs no layout and paints nothing. `display` is read as an
 * inline style; nothing here measures a pixel or proves the panel was ever ON
 * TOP of a widget. The 3-D highlight is observed at the SelectionManager seam
 * (the same seam `engineLauncher.ts:463` injects in production), not in a real
 * scene — so ARM D pins that the calls still happen with the right ids, not that
 * a mesh changed colour.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';

import { selectionBus } from '@pryzm/core-app-model';
import {
  WORKSPACE_MODES,
  propertiesPanelAllowedIn,
} from '../../platform/workspaceModes';
import { PropertyPanel } from '../PropertyPanel';

// ── Harness ──────────────────────────────────────────────────────────────────

interface Bus {
  emit: (event: string, payload: unknown) => void;
}

/**
 * A minimal runtime event bus installed BEFORE the panel is constructed, so its
 * `onRuntimeEvent('pryzm-workspace-mode', …)` subscribes immediately. That
 * mirrors the post-`flushRuntimeEventListeners()` state, which is the state the
 * panel actually runs in (engineLauncher flushes at :1085, restores the saved
 * mode — and therefore emits — at :1088).
 */
function installRuntimeBus(): Bus {
  const handlers = new Map<string, Array<(p: unknown) => void>>();
  const events = {
    on(event: string, handler: (p: unknown) => void): () => void {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
      return () => {
        const i = list.indexOf(handler);
        if (i !== -1) list.splice(i, 1);
      };
    },
    emit(event: string, payload: unknown): void {
      for (const h of [...(handlers.get(event) ?? [])]) h(payload);
    },
  };
  window.runtime = { events } as never;
  return { emit: (e, p) => events.emit(e, p) };
}

/** Ids shaped like the founder's screenshot: a whole storey's worth. */
const STOREY_IDS = Array.from({ length: 68 }, (_, i) => `el-${i + 1}`);

/**
 * ⚠ ONE PANEL FOR THE WHOLE FILE, and that is a MEASURED constraint, not tidiness.
 * `PropertyPanel`'s constructor reaches `_makeResizable()`, which registers a
 * frame-scheduler tick listener under the FIXED id `property-panel-sync-handles`;
 * `FrameScheduler.addTickListener` THROWS on a duplicate id. A second instance in
 * the same process is therefore impossible — which is exactly true in production
 * too, where `PropertyPanelAdapter` constructs the one panel at
 * engineLauncher.ts:313. Tests reset the shared panel instead of rebuilding it.
 */
let panel: PropertyPanel;
let bus: Bus;
let unsubMulti: () => void;

/** What the SelectionManager seam was told — the 3-D highlight, observed. */
const highlight = { primary: [] as string[], secondary: [] as string[][] };

const setMode = (mode: string): void => bus.emit('pryzm-workspace-mode', { mode });
const selectStorey = (): void => selectionBus.selectMany(STOREY_IDS, 'analytics');
const display = (): string => panel.element.style.display;

beforeAll(() => {
  bus = installRuntimeBus();
  panel = new PropertyPanel();
  document.body.appendChild(panel.element);

  selectionBus.setSelectionManager({
    selectById: (id: string) => { highlight.primary.push(id); },
    applyMarqueeHighlights: (ids: string[]) => { highlight.secondary.push([...ids]); },
    unselectAll: () => { /* not exercised here */ },
  });

  // ⭐ VERBATIM IN SHAPE from engineLauncher.ts:479-489 — the production wiring
  // that turns a multi-selection into the panel's N>1 state. Reproduced rather
  // than mocked, because a fake panel opener could not fail the way the real one
  // did (MEMORY §fake-more-capable-than-real).
  unsubMulti = selectionBus.subscribe((ev) => {
    if (ev.type !== 'select' && ev.type !== 'clear') return;
    const ids = selectionBus.currentIds;
    if (ids.length > 1) {
      panel.showMultiSelection(ids, ids.map(() => 'wall'));
    }
  });
});

afterAll(() => {
  unsubMulti();
  selectionBus.clearAll('analytics');
  selectionBus.setSelectionManager(null);
  panel.element.remove();
});

beforeEach(() => {
  // Back to the neutral start state: Author mode, panel closed, nothing selected.
  setMode('author');
  panel.hide();
  selectionBus.clearAll('analytics');
  highlight.primary.length = 0;
  highlight.secondary.length = 0;
});

// ── ARM A — the gate itself ──────────────────────────────────────────────────

describe('§PANEL-MODE-GATE ARM A — the registry column is the one gate', () => {
  it('exactly one shipped mode shows the properties panel, and it is Author', () => {
    const shown = WORKSPACE_MODES.filter((m) => m.propertiesPanel === 'shown').map((m) => m.id);
    expect(shown).toEqual(['author']);
  });

  it('every mode row declares the column — a new mode cannot forget it', () => {
    for (const m of WORKSPACE_MODES) {
      expect(['shown', 'suppressed'], `${m.id}: bad propertiesPanel`).toContain(m.propertiesPanel);
    }
  });

  it('the predicate answers per mode, and FAILS OPEN on unknown / not-yet-known', () => {
    expect(propertiesPanelAllowedIn('author')).toBe(true);
    expect(propertiesPanelAllowedIn('inspect')).toBe(false);
    expect(propertiesPanelAllowedIn('analysis')).toBe(false);
    expect(propertiesPanelAllowedIn('data')).toBe(false);
    // An id this build does not know must not silently remove the primary
    // editing surface. See the predicate's header for why this direction.
    expect(propertiesPanelAllowedIn('some-future-mode')).toBe(true);
    expect(propertiesPanelAllowedIn(null)).toBe(true);
    expect(propertiesPanelAllowedIn(undefined)).toBe(true);
  });
});

// ── ARM B — selecting, per mode ──────────────────────────────────────────────

describe('§PANEL-MODE-GATE ARM B — selection does not open the panel outside Author', () => {
  // Table-driven over the shipped registry, so a fifth mode is covered the day
  // it is added rather than the day someone remembers to extend this list.
  for (const mode of WORKSPACE_MODES) {
    const allowed = mode.propertiesPanel === 'shown';

    it(`${mode.id}: a 68-element selection ${allowed ? 'OPENS' : 'leaves closed'} the panel`, () => {
      setMode(mode.id);
      selectStorey();
      expect(display()).toBe(allowed ? 'block' : 'none');
    });

    it(`${mode.id}: a single-element panel ${allowed ? 'OPENS' : 'leaves closed'}`, () => {
      setMode(mode.id);
      // showViewProperties() is the single-subject path that needs no THREE
      // object; it funnels through the same `_makeVisible()` choke point every
      // element / pre-draw / annotation state uses.
      panel.showViewProperties();
      expect(display()).toBe(allowed ? 'block' : 'none');
    });
  }

  // ⭐ THE CONTROL. Without this, a blanket `return` in _makeVisible would pass
  // every other assertion in ARM B.
  it('Author is genuinely unaffected — the panel opens AND carries the count', () => {
    setMode('author');
    selectStorey();
    expect(display()).toBe('block');
    expect(panel.element.textContent).toContain('MULTI-SELECTION');
    expect(panel.element.textContent).toContain('68 elements selected');
  });
});

// ── ARM C — mode changes under an open panel ─────────────────────────────────

describe('§PANEL-MODE-GATE ARM C — switching modes with the panel already open', () => {
  for (const mode of WORKSPACE_MODES.filter((m) => m.propertiesPanel === 'suppressed')) {
    it(`author → ${mode.id} CLOSES an already-open panel`, () => {
      setMode('author');
      selectStorey();
      expect(display()).toBe('block');

      setMode(mode.id);
      // A stale panel left floating over Analysis is the same complaint as one
      // that pops up there.
      expect(display()).toBe('none');
    });
  }

  /**
   * THE AUTHOR-RETURN DECISION, pinned.
   *
   * Returning to Author leaves the panel CLOSED until the next selection, and
   * that is a choice, not an omission:
   *
   *  · It is byte-identical to what shipped before this lane. `.gpp-panel`'s CSS
   *    is `display:none`, and WorkspaceController's old author branch set
   *    `style.display = ''` — which falls back to that CSS. So Author→X→Author
   *    already left the panel hidden; nothing regressed for the founder's hands.
   *  · `hide()` clears `selectedObject`, `selectedElementId`, the draft and the
   *    validation errors. There is no live panel state left to restore, and
   *    re-deriving it would mean a SECOND authority on "what is selected"
   *    alongside selectionBus (C84 EI-9).
   *  · `hide()` is also exactly what the ✕ button does. Auto-reopening would
   *    resurrect a panel the user may have deliberately closed.
   *  · PanelManager enforces one panel at a time, so an auto-restore could evict
   *    whatever the user opened in the meantime.
   */
  it('returning to Author stays closed, then the NEXT selection opens it', () => {
    setMode('author');
    selectStorey();
    expect(display()).toBe('block');

    setMode('analysis');
    expect(display()).toBe('none');

    setMode('author');
    expect(display(), 'the panel must not resurrect itself on mode return').toBe('none');

    // …and the gate is lifted, not merely quiet: a fresh selection opens it.
    selectionBus.clearAll('analytics');
    selectStorey();
    expect(display()).toBe('block');
  });

  it('an unknown mode id is IGNORED, not recorded — the panel keeps working', () => {
    setMode('author');
    setMode('not-a-mode');
    selectStorey();
    expect(display()).toBe('block');
  });
});

// ── ARM D — ⭐ the non-regression pin: selection itself is untouched ──────────

describe('§PANEL-MODE-GATE ARM D — selection and highlighting survive the gate', () => {
  for (const mode of WORKSPACE_MODES.filter((m) => m.propertiesPanel === 'suppressed')) {
    it(`${mode.id}: all 68 ids are still selected and still highlighted`, () => {
      setMode(mode.id);
      selectStorey();

      // The panel is gone…
      expect(display()).toBe('none');

      // …and the selection is emphatically NOT.
      expect(selectionBus.currentIds).toHaveLength(68);
      expect(selectionBus.currentIds).toEqual(STOREY_IDS);

      // The 3-D highlight seam — engineLauncher.ts:463 injects the real
      // SelectionManager here in production. Primary + 67 secondaries, exactly
      // as in Author mode.
      expect(highlight.primary.at(-1)).toBe('el-68');
      expect(highlight.secondary.at(-1)).toHaveLength(67);
    });
  }

  it('the gated modes highlight IDENTICALLY to Author — no divergence at all', () => {
    setMode('author');
    selectStorey();
    const authorPrimary = highlight.primary.at(-1);
    const authorSecondary = highlight.secondary.at(-1);
    const authorIds = selectionBus.currentIds;

    for (const mode of WORKSPACE_MODES.filter((m) => m.propertiesPanel === 'suppressed')) {
      selectionBus.clearAll('analytics');
      setMode(mode.id);
      selectStorey();
      expect(highlight.primary.at(-1), mode.id).toBe(authorPrimary);
      expect(highlight.secondary.at(-1), mode.id).toEqual(authorSecondary);
      expect(selectionBus.currentIds, mode.id).toEqual(authorIds);
    }
  });

  it('downstream subscribers still receive the select event in a gated mode', () => {
    const seen: number[] = [];
    const unsub = selectionBus.subscribe((ev) => {
      if (ev.type === 'select') seen.push(ev.elementIds.length);
    });
    try {
      setMode('analysis');
      selectStorey();
      // The Relationship graph, the traceability widgets and the isolation
      // pipeline are all subscribers of this shape. Suppressing the panel must
      // not cost them their event.
      expect(seen).toEqual([68]);
    } finally {
      unsub();
    }
  });
});
