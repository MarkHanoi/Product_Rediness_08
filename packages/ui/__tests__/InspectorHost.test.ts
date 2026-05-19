import { describe, it, expect, beforeEach } from 'vitest';
import { InspectorHost, type InspectorTabContribution } from '../src/InspectorHost.js';
import type { PanelContext } from '../src/PanelHost.js';

const ctx = (elementId: string, type = 'wall'): PanelContext => ({
  elementId, elementType: type,
});

const makeTab = (
  id: string,
  label: string,
  priority: number,
  events: string[],
  opts: { shouldShow?: InspectorTabContribution['shouldShow'] } = {},
): InspectorTabContribution => {
  const t: InspectorTabContribution = {
    id, label, category: 'Parameters', priority,
    render(container, context) {
      events.push(`render:${id}:${context.elementId}`);
      const span = container.ownerDocument.createElement('span');
      span.className = `body-${id}`;
      container.appendChild(span);
    },
    unmount(_, context) {
      events.push(`unmount:${id}:${context.elementId}`);
    },
  };
  if (opts.shouldShow) {
    (t as { shouldShow?: InspectorTabContribution['shouldShow'] }).shouldShow = opts.shouldShow;
  }
  return t;
};

describe('InspectorHost — tab strip', () => {
  let host: InspectorHost;
  let root: HTMLElement;
  let events: string[];
  beforeEach(() => {
    host = new InspectorHost();
    root = document.createElement('div');
    document.body.appendChild(root);
    events = [];
  });

  it('mount() builds a tab strip + body in priority order', () => {
    host.registerTab(makeTab('c', 'C', 90, events));
    host.registerTab(makeTab('a', 'A', 10, events));
    host.registerTab(makeTab('b', 'B', 50, events));
    host.mount(ctx('el-1'), root);
    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('.inspector-tab-button'));
    expect(buttons.map(b => b.dataset.tabId)).toEqual(['a', 'b', 'c']);
  });

  it('lazy render: only the active tab renders on mount', () => {
    host.registerTab(makeTab('a', 'A', 1, events));
    host.registerTab(makeTab('b', 'B', 2, events));
    host.registerTab(makeTab('c', 'C', 3, events));
    host.mount(ctx('el-1'), root);
    expect(events).toEqual(['render:a:el-1']);
    expect(host.active()).toBe('a');
  });

  it('activating a tab renders it once, subsequent activates are cheap', () => {
    host.registerTab(makeTab('a', 'A', 1, events));
    host.registerTab(makeTab('b', 'B', 2, events));
    host.mount(ctx('el-1'), root);
    host.activate('b');
    expect(events).toEqual(['render:a:el-1', 'render:b:el-1']);
    host.activate('a');
    host.activate('b');
    // No additional renders — both tabs already rendered.
    expect(events).toEqual(['render:a:el-1', 'render:b:el-1']);
  });

  it('aria-selected reflects active tab; only one content visible at a time', () => {
    host.registerTab(makeTab('a', 'A', 1, events));
    host.registerTab(makeTab('b', 'B', 2, events));
    host.mount(ctx('el-1'), root);
    host.activate('b');
    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('.inspector-tab-button'));
    const contents = Array.from(root.querySelectorAll<HTMLElement>('.inspector-tab-content'));
    expect(buttons.find(b => b.dataset.tabId === 'a')!.getAttribute('aria-selected')).toBe('false');
    expect(buttons.find(b => b.dataset.tabId === 'b')!.getAttribute('aria-selected')).toBe('true');
    expect(contents.find(c => c.dataset.tabId === 'a')!.hidden).toBe(true);
    expect(contents.find(c => c.dataset.tabId === 'b')!.hidden).toBe(false);
  });

  it('shouldShow filter hides tab from strip entirely', () => {
    host.registerTab(makeTab('a', 'A', 1, events));
    host.registerTab(makeTab('ifc', 'IFC', 2, events, {
      shouldShow: c => c.elementType === 'ifc-proxy',
    }));
    host.mount(ctx('el-1', 'wall'), root);
    const ids = Array.from(root.querySelectorAll<HTMLButtonElement>('.inspector-tab-button'))
      .map(b => b.dataset.tabId);
    expect(ids).toEqual(['a']);
  });

  it('clicking a tab button activates it', () => {
    host.registerTab(makeTab('a', 'A', 1, events));
    host.registerTab(makeTab('b', 'B', 2, events));
    host.mount(ctx('el-1'), root);
    const bBtn = root.querySelector<HTMLButtonElement>('[data-tab-id="b"]')!;
    bBtn.click();
    expect(host.active()).toBe('b');
  });

  it('unmountAll() tears down only the rendered tabs', () => {
    host.registerTab(makeTab('a', 'A', 1, events));
    host.registerTab(makeTab('b', 'B', 2, events));
    host.mount(ctx('el-1'), root);
    // Only `a` rendered (auto-activated as first); `b` never activated → no render
    host.unmountAll();
    expect(events).toEqual(['render:a:el-1', 'unmount:a:el-1']); // no unmount for b
    expect(root.children.length).toBe(0);
  });

  it('re-mount with different element re-runs the lazy chain', () => {
    host.registerTab(makeTab('a', 'A', 1, events));
    host.mount(ctx('el-1'), root);
    host.mount(ctx('el-2'), root);
    expect(events).toEqual(['render:a:el-1', 'unmount:a:el-1', 'render:a:el-2']);
  });
});
