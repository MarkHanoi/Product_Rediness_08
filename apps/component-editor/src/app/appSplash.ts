// AppSplash — sprint roadmap + intro splash for the 3D / Parameters
// tabs. Extracted from AppShell.ts to keep its §13 LoC budget under
// 300 (S52 D1).
//
// Pure DOM scaffolding — no event wiring, no store reads. The tab
// labels live alongside `viewTabStore`.

import type { ViewTab } from '../stores/viewTabStore.js';

const PLAN_PATH =
  'docs/00_NEW_ARCHITECTURE/phases/PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md';

const PANEL_TITLES: Readonly<Record<ViewTab, string>> = {
  sketch: 'Sketch — under construction',
  '3d': '3D preview — under construction',
  parameters: 'Parameter table — under construction',
};

export function renderSplash(active: ViewTab): HTMLElement {
  const splash = document.createElement('section');
  splash.setAttribute('aria-labelledby', 'fce-splash-title');
  splash.style.cssText = [
    'flex:1',
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'justify-content:center',
    'padding:48px 24px',
    'text-align:center',
    'gap:24px',
  ].join(';');

  const title = document.createElement('h1');
  title.id = 'fce-splash-title';
  title.textContent = PANEL_TITLES[active];
  title.style.cssText = 'margin:0;font-size:32px;font-weight:700';

  const lede = document.createElement('p');
  lede.textContent =
    'A standalone, parametric Family Creator is being rebuilt from the ground up.';
  lede.style.cssText = 'margin:0;max-width:560px;line-height:1.6;color:#b8b8d0;font-size:16px';

  const sub = document.createElement('p');
  sub.textContent =
    'The previous prototype has been removed; the new editor will land progressively over sprints S52–S59.';
  sub.style.cssText = 'margin:0;max-width:560px;line-height:1.6;color:#9090a8;font-size:14px';

  const planLine = document.createElement('p');
  planLine.style.cssText = 'margin:0;font-size:13px;color:#7878a0';
  planLine.textContent = 'Implementation plan: ';
  const code = document.createElement('code');
  code.textContent = PLAN_PATH;
  code.style.cssText =
    'background:rgba(102,0,255,0.15);padding:4px 8px;border-radius:4px;color:#c8b8ff;font-size:12px';
  planLine.appendChild(code);

  splash.append(title, lede, sub, planLine, renderRoadmap());
  return splash;
}

function renderRoadmap(): HTMLElement {
  const wrapper = document.createElement('section');
  wrapper.setAttribute('aria-label', 'Sprint roadmap');
  wrapper.style.cssText = [
    'margin-top:24px',
    'padding:24px',
    'background:rgba(255,255,255,0.04)',
    'border:1px solid rgba(255,255,255,0.08)',
    'border-radius:12px',
    'max-width:720px',
    'width:calc(100% - 48px)',
    'text-align:left',
  ].join(';');

  const heading = document.createElement('h2');
  heading.textContent = 'Sprint roadmap (S52 → S59)';
  heading.style.cssText =
    'margin:0 0 16px;font-size:14px;font-weight:600;color:#a8a8c0;text-transform:uppercase;letter-spacing:1px';
  wrapper.appendChild(heading);

  const sprints: Array<readonly [string, string]> = [
    ['S52', 'Removal + scaffolding + real planegcs constraint solver + first 5 constraints + extrude'],
    ['S53', 'Sketch tools (line, arc, circle, fillet, trim) + sweep / loft / revolve + booleans'],
    ['S54', 'AI host bridge + tool registry + batch undo'],
    ['S55', 'Parameter table + expression DSL + IFC Pset binding + .pryzm-family v1'],
    ['S56', 'Main-editor integration (load family, place 200 instances, swap types)'],
    ['S57', 'Versioning + migration framework + performance hardening'],
    ['S58', 'Standalone SPA deploy + accessibility + end-to-end tests'],
    ['S59', 'Marketplace publish + Phase 3B exit'],
  ];

  const list = document.createElement('ul');
  list.style.cssText = 'margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px';
  for (const [sprint, desc] of sprints) {
    const item = document.createElement('li');
    item.style.cssText = 'display:flex;gap:12px;font-size:13px;line-height:1.5';
    const tag = document.createElement('span');
    tag.textContent = sprint;
    tag.style.cssText =
      'flex:0 0 48px;font-weight:700;color:#6600FF;font-family:ui-monospace,monospace';
    const text = document.createElement('span');
    text.textContent = desc;
    text.style.cssText = 'color:#c8c8e0';
    item.append(tag, text);
    list.appendChild(item);
  }
  wrapper.appendChild(list);
  return wrapper;
}
