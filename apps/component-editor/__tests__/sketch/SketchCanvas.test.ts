import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mountSketchCanvas } from '../../src/sketch/SketchCanvas.ts';

describe('SketchCanvas — S52 D1 mount', () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement('div');
    host.style.cssText = 'width:800px;height:600px';
    document.body.appendChild(host);
  });

  afterEach(() => {
    host.remove();
  });

  it('mounts a canvas with toolbar and HUD', () => {
    const mount = mountSketchCanvas(host);
    expect(host.querySelector('canvas[data-role="sketch-canvas"]')).not.toBeNull();
    expect(host.querySelector('[data-role="sketch-toolbar"]')).not.toBeNull();
    expect(host.querySelector('[data-role="sketch-hud"]')).not.toBeNull();
    mount.unmount();
  });

  it('renders the tool buttons (select/line/rect/circle/arc/spline/fillet/trim) with select active', () => {
    const mount = mountSketchCanvas(host);
    const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>('button[data-tool]'));
    // `spline` sits after `arc` and before `fillet`: it is a DRAWING tool, and
    // `fillet`/`trim` are the MODIFY pair that must stay last (C111 §9.6).
    expect(buttons.map((b) => b.dataset.tool)).toEqual([
      'select',
      'line',
      'rectangle',
      'circle',
      'arc',
      'spline',
      'fillet',
      'trim',
    ]);
    expect(mount.getActiveToolName()).toBe('select');
    mount.unmount();
  });

  it('clicking the Rectangle button switches the active tool', () => {
    const mount = mountSketchCanvas(host);
    const rectBtn = host.querySelector<HTMLButtonElement>('button[data-tool="rectangle"]')!;
    rectBtn.click();
    expect(mount.getActiveToolName()).toBe('rectangle');
    mount.unmount();
  });

  it('exposes the document store via the mount handle (test seam)', () => {
    const mount = mountSketchCanvas(host);
    expect(mount.store).toBeDefined();
    expect(mount.store.get().entities).toEqual([]);
    mount.store.addLineByCoords(0, 0, 100, 0);
    expect(mount.store.get().entities.length).toBeGreaterThan(0);
    mount.unmount();
  });

  it('unmount removes the root element from the host', () => {
    const mount = mountSketchCanvas(host);
    expect(host.children.length).toBeGreaterThan(0);
    mount.unmount();
    expect(host.children.length).toBe(0);
  });

  it('source file does not import THREE or call requestAnimationFrame', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const url = await import('node:url');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const raw = await fs.readFile(path.join(here, '../../src/sketch/SketchCanvas.ts'), 'utf8');
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    expect(code).not.toMatch(/from ['"]three['"]/);
    expect(code).not.toMatch(/import \* as THREE/);
    expect(code).not.toMatch(/window\s+as\s+any/);
    expect(code).not.toMatch(/requestAnimationFrame\(/);
  });

  // ── C74 §3.4 RETIRING ASSERTION for the SketchCanvas.ts scaffold declaration
  // (CO-06, 2026-08-16). The test ABOVE is a P3/P2 invariant: it stays green
  // after the frame bus is adopted, because subscribing to the bus is not
  // calling rAF. It therefore could never retire that scaffold. This one can —
  // both halves go false the moment adoption lands.
  it('SCAFFOLD: this app has NOT adopted the frame bus', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const url = await import('node:url');
    const here = path.dirname(url.fileURLToPath(import.meta.url));

    // Half 1 — the dependency is untaken. `@pryzm/frame-scheduler` EXISTS (it is
    // the P3 sole rAF owner and src/main.ts:15 consumes it); this app simply does
    // not depend on it. Adoption adds it here and flips this assertion.
    const pkg = JSON.parse(
      await fs.readFile(path.join(here, '../../package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string> };
    expect(Object.keys(pkg.dependencies ?? {})).not.toContain('@pryzm/frame-scheduler');

    // Half 2 — paints are still scheduled off the bus.
    const raw = await fs.readFile(path.join(here, '../../src/sketch/SketchCanvas.ts'), 'utf8');
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    expect(code).toMatch(/queueMicrotask\(/);
  });
});
