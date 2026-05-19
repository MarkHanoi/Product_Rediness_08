// ProjectCard — single project card in the hub grid (S28).
//
// Spec: `phases/PHASE-2A-Q1-M13-M15-NON-ELEMENT-COMPLETION.md`
//   §S28 D2 line 739 — "Project card component — thumbnail, name,
//   meta, overflow menu (rename, delete, export)."
//
// Pure render — takes a `ProjectSummary` and three callbacks, returns
// a detached `HTMLElement` that the hub appends.  Stateless from the
// caller's point of view; the hub re-renders the entire grid when the
// store dirties (the grid is small enough that diffing isn't worth
// the complexity at this scale).

import type { ProjectSummary } from '@pryzm/stores';

export interface RenderProjectCardOptions {
  readonly summary: ProjectSummary;
  readonly onOpen: () => void;
  readonly onRename: () => void;
  readonly onDelete: () => void;
}

export function renderProjectCard(opts: RenderProjectCardOptions): HTMLElement {
  const { summary, onOpen, onRename, onDelete } = opts;

  const card = document.createElement('article');
  card.className = 'pryzm2-project-card';
  card.dataset.projectId = summary.id;
  card.style.cssText = CARD_CSS;

  // ── Thumbnail (or placeholder) ────────────────────────────────────────────
  const thumb = document.createElement('div');
  thumb.style.cssText = THUMB_CSS;
  if (summary.thumbnailUrl !== null) {
    const img = document.createElement('img');
    img.src = summary.thumbnailUrl;
    img.alt = '';
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
    img.loading = 'lazy';
    thumb.appendChild(img);
  } else {
    thumb.textContent = 'No preview yet';
    thumb.style.color = '#6c7086';
    thumb.style.fontSize = '12px';
  }

  // ── Body (name + meta) ────────────────────────────────────────────────────
  const body = document.createElement('div');
  body.style.cssText = 'padding:12px 14px;';

  const name = document.createElement('h2');
  name.textContent = summary.name;
  name.style.cssText = NAME_CSS;
  body.appendChild(name);

  const meta = document.createElement('div');
  meta.style.cssText = META_CSS;
  meta.textContent = formatMeta(summary);
  body.appendChild(meta);

  // ── Action row ────────────────────────────────────────────────────────────
  const actions = document.createElement('div');
  actions.style.cssText = ACTIONS_CSS;

  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.textContent = 'Open';
  openBtn.style.cssText = OPEN_BTN_CSS;
  openBtn.addEventListener('click', onOpen);
  actions.appendChild(openBtn);

  const overflow = document.createElement('details');
  overflow.style.cssText = 'position:relative;';

  const summaryEl = document.createElement('summary');
  summaryEl.textContent = '⋯';
  summaryEl.style.cssText = OVERFLOW_BTN_CSS;
  overflow.appendChild(summaryEl);

  const menu = document.createElement('div');
  menu.style.cssText = MENU_CSS;

  const renameBtn = makeMenuItem('Rename');
  renameBtn.addEventListener('click', () => {
    overflow.open = false;
    onRename();
  });
  menu.appendChild(renameBtn);

  const deleteBtn = makeMenuItem('Delete', true);
  deleteBtn.addEventListener('click', () => {
    overflow.open = false;
    onDelete();
  });
  menu.appendChild(deleteBtn);

  overflow.appendChild(menu);
  actions.appendChild(overflow);

  body.appendChild(actions);
  card.append(thumb, body);

  // Whole card is also clickable (opens) — but ignore clicks that
  // originate inside the action row, the overflow, or the buttons.
  card.addEventListener('click', (ev) => {
    const target = ev.target as HTMLElement | null;
    if (target && actions.contains(target)) return;
    onOpen();
  });

  return card;
}

function makeMenuItem(label: string, danger = false): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = label;
  btn.style.cssText = [
    'display:block', 'width:100%', 'text-align:left',
    'background:none', 'border:none',
    `color:${danger ? '#f38ba8' : '#cdd6f4'}`,
    'padding:8px 12px', 'cursor:pointer', 'font-size:13px',
  ].join(';');
  btn.addEventListener('mouseenter', () => { btn.style.background = '#313244'; });
  btn.addEventListener('mouseleave', () => { btn.style.background = 'transparent'; });
  return btn;
}

function formatMeta(summary: ProjectSummary): string {
  const when = formatRelativeTime(summary.lastModifiedAt);
  if (summary.collaboratorCount > 0) {
    return `Updated ${when} · ${summary.collaboratorCount} collaborator${summary.collaboratorCount === 1 ? '' : 's'}`;
  }
  return `Updated ${when}`;
}

/** Tiny relative-time formatter — avoids pulling in `Intl.RelativeTimeFormat`
 *  surprises across older runtimes.  Always returns a finite value. */
function formatRelativeTime(iso: string): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return 'recently';
  const deltaMs = Date.now() - ts;
  const seconds = Math.max(0, Math.floor(deltaMs / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

// ── styles ────────────────────────────────────────────────────────────────────

const CARD_CSS = [
  'background:#181825', 'border:1px solid #313244', 'border-radius:8px',
  'overflow:hidden', 'cursor:pointer',
  'transition:transform 0.1s ease,border-color 0.1s ease',
  'display:flex', 'flex-direction:column',
].join(';');

const THUMB_CSS = [
  'aspect-ratio:16/10', 'background:#11111b',
  'display:flex', 'align-items:center', 'justify-content:center',
  'color:#6c7086', 'overflow:hidden',
].join(';');

const NAME_CSS = [
  'margin:0 0 4px 0', 'font-size:15px', 'font-weight:600',
  'color:#cdd6f4',
  'white-space:nowrap', 'overflow:hidden', 'text-overflow:ellipsis',
].join(';');

const META_CSS = [
  'font-size:12px', 'color:#7f849c',
  'margin-bottom:12px',
].join(';');

const ACTIONS_CSS = [
  'display:flex', 'align-items:center', 'justify-content:space-between',
  'gap:8px',
].join(';');

const OPEN_BTN_CSS = [
  'background:#313244', 'color:#cdd6f4', 'border:none',
  'padding:6px 14px', 'border-radius:4px', 'cursor:pointer',
  'font-size:13px', 'font-weight:500',
].join(';');

const OVERFLOW_BTN_CSS = [
  'list-style:none', 'cursor:pointer',
  'background:#313244', 'color:#cdd6f4',
  'padding:6px 10px', 'border-radius:4px',
  'font-size:14px', 'user-select:none',
].join(';');

const MENU_CSS = [
  'position:absolute', 'right:0', 'top:100%', 'margin-top:4px',
  'background:#1e1e2e', 'border:1px solid #313244', 'border-radius:4px',
  'min-width:120px', 'z-index:10',
  'box-shadow:0 4px 12px rgba(0,0,0,0.4)',
].join(';');
