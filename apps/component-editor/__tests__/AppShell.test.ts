import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mountAppShell } from '../src/app/AppShell.js';

describe('AppShell — S52 D1 scaffold', () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    host.remove();
  });

  it('mounts a header, tab bar, panel, and footer', () => {
    mountAppShell(host);
    expect(host.querySelector('header')).not.toBeNull();
    expect(host.querySelector('nav[data-role="view-tab-bar"]')).not.toBeNull();
    expect(host.querySelector('section[data-role="view-panel"]')).not.toBeNull();
    expect(host.querySelector('footer')).not.toBeNull();
  });

  it('default sketch tab mounts the SketchCanvas (toolbar + canvas + HUD)', () => {
    mountAppShell(host);
    const panel = host.querySelector<HTMLElement>('section[data-role="view-panel"]')!;
    expect(panel.dataset.activeTab).toBe('sketch');
    expect(panel.querySelector('canvas[data-role="sketch-canvas"]')).not.toBeNull();
    expect(panel.querySelector('[data-role="sketch-toolbar"]')).not.toBeNull();
    expect(panel.querySelector('[data-role="sketch-hud"]')).not.toBeNull();
  });

  it('exposes a labelled splash title for screen readers (3D tab)', () => {
    const handle = mountAppShell(host);
    handle.viewTabStore.setActive('3d');
    const title = host.querySelector('#fce-splash-title');
    expect(title).not.toBeNull();
    expect(title?.textContent).toMatch(/under construction/i);
  });

  it('lists every planned sprint S52 through S59 on the 3D tab', () => {
    const handle = mountAppShell(host);
    handle.viewTabStore.setActive('3d');
    const text = host.textContent ?? '';
    for (const sprint of ['S52', 'S53', 'S54', 'S55', 'S56', 'S57', 'S58', 'S59']) {
      expect(text).toContain(sprint);
    }
  });

  it('points at the rewrite-plan doc path on the parameters tab', () => {
    const handle = mountAppShell(host);
    handle.viewTabStore.setActive('parameters');
    expect(host.textContent).toContain(
      'docs/00_NEW_ARCHITECTURE/phases/PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md',
    );
  });

  it('returns an unmount handle that empties the root', () => {
    const handle = mountAppShell(host);
    expect(host.children.length).toBeGreaterThan(0);
    handle.unmount();
    expect(host.children.length).toBe(0);
  });

  it('exposes the view-tab store as a test seam', () => {
    const handle = mountAppShell(host);
    expect(handle.viewTabStore).toBeDefined();
    expect(handle.viewTabStore.get().active).toBe('sketch');
  });

  it('renders three tab buttons (Sketch / 3D / Parameters) with correct aria state', () => {
    mountAppShell(host);
    const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>('nav[data-role="view-tab-bar"] button[data-tab]'));
    expect(buttons.map((b) => b.dataset.tab)).toEqual(['sketch', '3d', 'parameters']);
    expect(buttons[0]?.getAttribute('aria-selected')).toBe('true');
    expect(buttons[1]?.getAttribute('aria-selected')).toBe('false');
    expect(buttons[2]?.getAttribute('aria-selected')).toBe('false');
  });

  it('clicking a tab button switches the active panel and updates aria-selected', () => {
    mountAppShell(host);
    const threeDBtn = host.querySelector<HTMLButtonElement>('button[data-tab="3d"]');
    expect(threeDBtn).not.toBeNull();
    threeDBtn!.click();
    const panel = host.querySelector<HTMLElement>('section[data-role="view-panel"]');
    expect(panel?.dataset.activeTab).toBe('3d');
    expect(panel?.querySelector('#fce-splash-title')?.textContent).toMatch(/3D preview/);
    const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>('button[data-tab]'));
    expect(buttons[0]?.getAttribute('aria-selected')).toBe('false');
    expect(buttons[1]?.getAttribute('aria-selected')).toBe('true');
    expect(buttons[2]?.getAttribute('aria-selected')).toBe('false');
  });

  it('programmatic store transitions also update the panel', () => {
    const handle = mountAppShell(host);
    handle.viewTabStore.setActive('parameters');
    const panel = host.querySelector<HTMLElement>('section[data-role="view-panel"]');
    expect(panel?.dataset.activeTab).toBe('parameters');
    expect(panel?.querySelector('#fce-splash-title')?.textContent).toMatch(/Parameter table/);
  });

  // The source-text rule checks below load AppShell.ts and strip every
  // comment (block + line) before applying the regex, so the docstring at
  // the top of AppShell.ts may freely mention the forbidden patterns. The
  // tests guard the executable code only. The full ESLint boundary
  // (`family-editor-no-three-leak`) lands at S52 D2.

  async function loadAppShellCode(): Promise<string> {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const url = await import('node:url');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const raw = await fs.readFile(path.join(here, '../src/app/AppShell.ts'), 'utf8');
    return raw
      .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1'); // line comments (skip URLs like https://)
  }

  it('does not import THREE (rule P2)', async () => {
    const code = await loadAppShellCode();
    expect(code).not.toMatch(/from ['"]three['"]/);
    expect(code).not.toMatch(/import \* as THREE/);
  });

  it('does not call requestAnimationFrame directly (rule P3)', async () => {
    const code = await loadAppShellCode();
    expect(code).not.toMatch(/requestAnimationFrame/);
  });

  it('does not use (window as any) (rule P6)', async () => {
    const code = await loadAppShellCode();
    expect(code).not.toMatch(/window\s+as\s+any/);
  });
});
