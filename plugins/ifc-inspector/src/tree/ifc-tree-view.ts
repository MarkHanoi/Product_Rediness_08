/**
 * `ifc-tree-view.ts` — the DOM for the IFC tree and the Story card.
 *
 * §IFC-TREE-VIEW (L-8370..L-8376) · brand: PRYZM purple #6600FF, white + purple,
 * NO BLACK.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS FILE MAY AND MAY NOT DO
 * ---------------------------------------------------------------------------
 * It renders into a host element it is GIVEN. It imports nothing from
 * `apps/editor` (that would be L6 -> L7, upward, forbidden), holds no store
 * singleton, and performs no AI call — the AI port is injected and may be null.
 *
 * The Inspect panel itself belongs to another lane, so this view never reaches
 * into it. The wiring that finds a host lives in `apps/editor/src/ui/ifc-tree/`
 * and is a separate, deletable file.
 *
 * ---------------------------------------------------------------------------
 * EMPTY STATES ARE RENDERED VERBATIM
 * ---------------------------------------------------------------------------
 * ⛔ The view NEVER composes its own explanation for an empty grouping. It
 * prints `coverage.message` exactly as `groupings.ts` produced it. If the view
 * were allowed to write its own copy, the ABSENT / NOT-EXTRACTED distinction
 * would be re-decided in a template by whoever edited it last — which is how
 * these distinctions get smoothed away.
 */

import { buildGrouping, type Grouping, type GroupingId } from './groupings.js';
import { GROUPINGS } from './groupings.js';
import { materialiseRows, type IfcTreeRow } from './row-window.js';
import type { IfcTreeElement, IfcTreeSource } from './tree-source.js';
import { MATERIAL_EXPORT_CAVEAT } from './tree-source.js';
import {
  buildElementStory,
  openQuestions,
  type ElementStory,
  type Slot,
} from './story-model.js';
import { gateBatch, type AiStoryPort } from './ai-seam.js';

export type TreeMode = 'pryzm' | 'ifc';

export interface IfcTreeViewDeps {
  /** Called when the user picks an element. Wire to selectionBus. */
  onSelect(elementId: string): void;
  /** Injected AI port, or null when no AI route is wired. */
  aiPort?: AiStoryPort | null;
  /** Called when the toggle flips, so the host can show/hide the PRYZM tree. */
  onModeChange?(mode: TreeMode): void;
}

const CSS_ID = 'pryzm-ifc-tree-styles';

/**
 * Brand tokens first, hex only as fallback — §PANEL-BRAND-STANDARD (L-1742).
 * No black anywhere: text is the slate-ink the rest of the app uses.
 */
const CSS = `
.ifct-toggle{display:inline-flex;gap:2px;padding:2px;background:var(--app-on-accent-veil,rgba(255,255,255,.18));border-radius:20px}
.ifct-toggle-btn{padding:3px 10px;border:none;border-radius:18px;background:transparent;color:var(--app-on-accent-dim,rgba(255,255,255,.9));font-size:10px;font-weight:600;letter-spacing:.04em;cursor:pointer;white-space:nowrap;font-family:inherit}
.ifct-toggle-btn:hover{background:var(--app-on-accent-veil-hover,rgba(255,255,255,.3));color:var(--app-on-accent,#fff)}
.ifct-toggle-btn--active{background:var(--app-panel-bg,#fff);color:var(--app-accent,#6600FF)}
.ifct-root{display:flex;flex-direction:column;gap:8px;font-size:11px;color:var(--app-text-2,#5a6a85)}
.ifct-groupbar{display:flex;flex-wrap:wrap;gap:3px;padding:6px 2px}
.ifct-groupbar-btn{padding:3px 9px;border:1px solid var(--app-border,#e3e8f0);border-radius:14px;background:var(--app-panel-bg,#fff);color:var(--app-text-2,#5a6a85);font-size:10px;font-weight:500;cursor:pointer;font-family:inherit}
.ifct-groupbar-btn:hover{border-color:var(--app-accent,#6600FF);color:var(--app-accent,#6600FF);background:var(--app-violet-soft,rgba(102,0,255,.08))}
.ifct-groupbar-btn--active{background:var(--app-gradient,linear-gradient(135deg,#8B5CF6 0%,#6600FF 100%));color:#fff;border-color:transparent}
.ifct-empty{padding:14px 12px;border:1px dashed var(--app-border,#e3e8f0);border-radius:8px;background:var(--app-violet-soft,rgba(102,0,255,.05));line-height:1.5}
.ifct-empty-cause{display:inline-block;margin-bottom:5px;padding:1px 7px;border-radius:10px;background:var(--app-accent,#6600FF);color:#fff;font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
.ifct-note{padding:7px 10px;border-left:2px solid var(--app-accent,#6600FF);background:var(--app-violet-soft,rgba(102,0,255,.05));border-radius:0 6px 6px 0;line-height:1.5;font-size:10px}
.ifct-rows{max-height:320px;overflow-y:auto;overflow-x:hidden}
.ifct-row{display:flex;align-items:center;gap:5px;padding:3px 6px;border-radius:5px;cursor:pointer;white-space:nowrap}
.ifct-row:hover{background:var(--app-violet-soft,rgba(102,0,255,.08))}
.ifct-row--group{font-weight:600;color:var(--app-text-1,#2d3a4f)}
.ifct-row--deficit{color:var(--app-accent,#6600FF)}
.ifct-count{margin-left:auto;padding:0 6px;border-radius:9px;background:var(--app-violet-soft,rgba(102,0,255,.1));color:var(--app-accent,#6600FF);font-size:9px;font-weight:700}
.ifct-label{overflow:hidden;text-overflow:ellipsis}
.ifct-story{margin-top:6px;padding:11px;border:1px solid var(--app-border,#e3e8f0);border-radius:9px;background:var(--app-panel-bg,#fff)}
.ifct-story-name{font-size:12px;font-weight:700;color:var(--app-text-1,#2d3a4f);margin-bottom:2px}
.ifct-story-sub{font-size:10px;color:var(--app-accent,#6600FF);font-weight:600;margin-bottom:8px}
.ifct-frac{display:inline-block;padding:2px 9px;border-radius:11px;background:var(--app-gradient,linear-gradient(135deg,#8B5CF6 0%,#6600FF 100%));color:#fff;font-size:10px;font-weight:700}
.ifct-slot{padding:7px 0;border-top:1px solid var(--app-border,#eef1f6)}
.ifct-slot-label{font-size:10px;font-weight:700;color:var(--app-text-1,#2d3a4f);letter-spacing:.02em}
.ifct-slot-text{margin-top:2px;line-height:1.5}
.ifct-slot-unknown{margin-top:2px;line-height:1.5;font-style:italic}
.ifct-chip{display:inline-block;margin-top:4px;margin-right:4px;padding:1px 7px;border-radius:9px;font-size:9px;font-weight:600}
.ifct-chip--model{background:var(--app-violet-soft,rgba(102,0,255,.1));color:var(--app-accent,#6600FF)}
.ifct-chip--mapping{background:rgba(139,92,246,.12);color:#7B3FF2}
.ifct-chip--user{background:rgba(102,0,255,.08);color:var(--app-accent,#6600FF)}
.ifct-chip--ai{background:#FFF4E5;color:#B45309;border:1px solid #FDBA74}
.ifct-chip--unknown{background:var(--app-surface-2,#f4f6fa);color:var(--app-text-3,#8794aa)}
.ifct-ask{margin-top:9px;padding:8px;border-radius:7px;background:var(--app-surface-2,#f7f8fb);font-size:10px;line-height:1.5}
.ifct-ask-disabled{color:var(--app-text-3,#8794aa)}
`;

function ensureStyles(doc: Document): void {
  if (doc.getElementById(CSS_ID)) return;
  const s = doc.createElement('style');
  s.id = CSS_ID;
  s.textContent = CSS;
  doc.head.appendChild(s);
}

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

/**
 * The two-button toggle. Mirrors the Author/Inspect/Analysis/Data pill idiom
 * (`.wmb-btn` / `.wmb-btn--active`) at header scale, so it reads as the same
 * control family rather than a new invention.
 */
export function createTreeToggle(
  initial: TreeMode,
  onChange: (m: TreeMode) => void,
): { element: HTMLElement; setMode(m: TreeMode): void } {
  const root = el('div', 'ifct-toggle');
  root.setAttribute('role', 'tablist');
  root.setAttribute('aria-label', 'Tree source');

  const mk = (mode: TreeMode, label: string): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ifct-toggle-btn';
    b.textContent = label;
    b.dataset.mode = mode;
    b.setAttribute('role', 'tab');
    b.title = mode === 'pryzm' ? 'PRYZM project browser' : 'IFC primitive tree';
    b.addEventListener('click', () => {
      setMode(mode);
      onChange(mode);
    });
    return b;
  };

  const a = mk('pryzm', 'PRYZM tree');
  const b = mk('ifc', 'IFC tree');
  root.append(a, b);

  function setMode(m: TreeMode): void {
    for (const btn of [a, b]) {
      const on = btn.dataset.mode === m;
      btn.classList.toggle('ifct-toggle-btn--active', on);
      btn.setAttribute('aria-selected', String(on));
    }
  }
  setMode(initial);

  return { element: root, setMode };
}

export interface IfcTreeView {
  readonly element: HTMLElement;
  setSources(sources: readonly IfcTreeSource[]): void;
  setSelection(elementId: string | null): void;
  dispose(): void;
}

export function createIfcTreeView(deps: IfcTreeViewDeps): IfcTreeView {
  ensureStyles(document);

  const root = el('div', 'ifct-root');
  const groupBar = el('div', 'ifct-groupbar');
  const body = el('div');
  const storyHost = el('div');
  root.append(groupBar, body, storyHost);

  let sources: readonly IfcTreeSource[] = [];
  let activeGrouping: GroupingId = 'spatial';
  let expanded = new Set<string>();
  let selectedId: string | null = null;
  let byId = new Map<string, IfcTreeElement>();

  for (const g of GROUPINGS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ifct-groupbar-btn';
    b.textContent = g.label;
    b.dataset.grouping = g.id;
    b.addEventListener('click', () => {
      activeGrouping = g.id;
      expanded = new Set();
      render();
    });
    groupBar.appendChild(b);
  }

  function renderRow(r: IfcTreeRow): HTMLElement {
    const row = el('div', 'ifct-row');
    row.style.paddingLeft = `${6 + r.depth * 13}px`;
    if (r.kind === 'group') row.classList.add('ifct-row--group');
    if (r.deficit) row.classList.add('ifct-row--deficit');

    if (r.kind === 'group' && !r.id.endsWith('::more')) {
      row.appendChild(el('span', undefined, expanded.has(r.id) ? '▾' : '▸'));
    }
    row.appendChild(el('span', 'ifct-label', r.label));
    if (r.count !== undefined) {
      row.appendChild(el('span', 'ifct-count', r.count.toLocaleString()));
    }

    row.addEventListener('click', () => {
      if (r.kind === 'element') {
        selectedId = r.id;
        deps.onSelect(r.id);
        renderStory();
      } else if (!r.id.endsWith('::more')) {
        if (expanded.has(r.id)) expanded.delete(r.id);
        else expanded.add(r.id);
        render();
      }
    });
    return row;
  }

  function renderGrouping(g: Grouping): void {
    body.replaceChildren();

    for (const btn of Array.from(groupBar.children) as HTMLElement[]) {
      btn.classList.toggle('ifct-groupbar-btn--active', btn.dataset.grouping === activeGrouping);
    }

    if (g.coverage.kind === 'empty') {
      const box = el('div', 'ifct-empty');
      // ⭐ The cause is shown as a chip AND the message is printed verbatim.
      box.appendChild(el('span', 'ifct-empty-cause', causeLabel(g.coverage.cause)));
      box.appendChild(el('div', undefined, g.coverage.message));
      body.appendChild(box);
      return;
    }

    const w = materialiseRows(g.groups, expanded, (id) => byId.get(id)?.name ?? id, g.totalElements);
    const rows = el('div', 'ifct-rows');
    for (const r of w.rows) rows.appendChild(renderRow(r));
    body.appendChild(rows);

    if (g.coverage.limitNote) body.appendChild(el('div', 'ifct-note', g.coverage.limitNote));
    if (w.notice) body.appendChild(el('div', 'ifct-note', w.notice));
  }

  function causeLabel(c: string): string {
    switch (c) {
      case 'absent':
        return 'none authored';
      case 'not-extracted':
        return 'not extracted by PRYZM';
      case 'absent-or-not-extracted':
        return 'two possible causes';
      default:
        return 'no model';
    }
  }

  function renderSlot(s: Slot): HTMLElement {
    const box = el('div', 'ifct-slot');
    box.appendChild(el('div', 'ifct-slot-label', s.label));
    if (s.state === 'answered') {
      box.appendChild(el('div', 'ifct-slot-text', s.text));
      for (const p of s.provenance) {
        box.appendChild(el('span', `ifct-chip ifct-chip--${p.kind}`, p.detail ? `${p.chip} · ${p.detail}` : p.chip));
      }
    } else {
      box.appendChild(el('div', 'ifct-slot-unknown', 'Unknown'));
      box.appendChild(el('div', 'ifct-slot-text', s.note));
      box.appendChild(el('span', 'ifct-chip ifct-chip--unknown', s.reason.replace(/-/g, ' ')));
    }
    return box;
  }

  function renderStory(): void {
    storyHost.replaceChildren();
    if (!selectedId) return;
    const element = byId.get(selectedId);
    if (!element) return;
    const story: ElementStory = buildElementStory(element);

    const card = el('div', 'ifct-story');
    card.appendChild(el('div', 'ifct-story-name', story.name));
    card.appendChild(el('div', 'ifct-story-sub', story.classAndContainer));
    card.appendChild(el('span', 'ifct-frac', story.completeness.headline));
    card.appendChild(el('div', 'ifct-slot-text', story.oneLine));

    for (const s of story.slots) card.appendChild(renderSlot(s));

    // "How we know" — the ledger, always answerable.
    const hk = el('div', 'ifct-slot');
    hk.appendChild(el('div', 'ifct-slot-label', 'How we know'));
    hk.appendChild(el('div', 'ifct-slot-text', story.howWeKnow.summary));
    card.appendChild(hk);

    if (element.material.kind === 'authored') {
      card.appendChild(el('div', 'ifct-note', MATERIAL_EXPORT_CAVEAT));
    }

    // Ask affordance — gated, never a silent fallback.
    const open = openQuestions(story);
    const decision = gateBatch(
      open.map((slot) => ({ elementId: element.id, slots: [slot], grounding: {} })),
      null,
      deps.aiPort ?? null,
    );
    const ask = el('div', 'ifct-ask');
    if (decision.allowed) {
      ask.textContent = `Research the ${open.length} unknown${open.length === 1 ? '' : 's'} with AI — ${decision.confirmation}`;
    } else {
      ask.classList.add('ifct-ask-disabled');
      ask.textContent = decision.reason;
    }
    card.appendChild(ask);

    storyHost.appendChild(card);
  }

  function render(): void {
    renderGrouping(buildGrouping(activeGrouping, sources));
    renderStory();
  }

  return {
    element: root,
    setSources(next) {
      sources = next;
      byId = new Map();
      for (const s of next) for (const e of s.elements) byId.set(e.id, e);
      render();
    },
    setSelection(id) {
      selectedId = id;
      renderStory();
    },
    dispose() {
      root.remove();
    },
  };
}
