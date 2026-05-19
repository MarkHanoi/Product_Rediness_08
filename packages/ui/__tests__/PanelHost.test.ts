import { describe, it, expect, beforeEach } from 'vitest';
import { PanelHost, type PanelContribution, type PanelContext } from '../src/PanelHost.js';

const ctx = (id: string, type = 'wall', meta?: Record<string, unknown>): PanelContext => ({
  elementId: id,
  elementType: type,
  ...(meta ? { meta } : {}),
});

const makeContrib = (
  id: string,
  category: PanelContribution['category'],
  priority: number,
  events: string[],
  opts: { shouldShow?: PanelContribution['shouldShow']; throwsOnRender?: boolean } = {},
): PanelContribution => {
  const c: PanelContribution = {
    id,
    category,
    priority,
    render(container, context) {
      events.push(`render:${id}:${context.elementId}`);
      if (opts.throwsOnRender) throw new Error(`render-fail:${id}`);
      const child = container.ownerDocument.createElement('span');
      child.className = `body-${id}`;
      child.textContent = `${id} for ${context.elementId}`;
      container.appendChild(child);
    },
    unmount(_, context) {
      events.push(`unmount:${id}:${context.elementId}`);
    },
  };
  if (opts.shouldShow) {
    (c as { shouldShow?: PanelContribution['shouldShow'] }).shouldShow = opts.shouldShow;
  }
  return c;
};

describe('PanelHost — registration', () => {
  let host: PanelHost;
  let parent: HTMLElement;
  beforeEach(() => {
    host = new PanelHost();
    parent = document.createElement('div');
  });

  it('register() sorts by priority ascending', () => {
    host.register(makeContrib('mid', 'IFC', 50, []));
    host.register(makeContrib('lo', 'Parameters', 10, []));
    host.register(makeContrib('hi', 'AI', 90, []));
    expect(host.list().map(c => c.id)).toEqual(['lo', 'mid', 'hi']);
  });

  it('register() with duplicate id replaces the prior contribution', () => {
    host.register(makeContrib('foo', 'Parameters', 1, []));
    host.register(makeContrib('foo', 'AI', 99, []));
    const list = host.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.category).toBe('AI');
    expect(list[0]!.priority).toBe(99);
  });

  it('unregister() returns false when id is unknown', () => {
    expect(host.unregister('nope')).toBe(false);
  });

  it('register() returns an unregister thunk that detaches mounted DOM', () => {
    const events: string[] = [];
    const unregister = host.register(makeContrib('z', 'Parameters', 1, events));
    host.mount(ctx('w-1'), parent);
    expect(parent.querySelectorAll('.panel-contribution').length).toBe(1);
    unregister();
    expect(host.list()).toEqual([]);
    expect(parent.children.length).toBe(0);
    expect(events).toContain('unmount:z:w-1');
  });
});

describe('PanelHost — mount / unmount', () => {
  let host: PanelHost;
  let parent: HTMLElement;
  let events: string[];

  beforeEach(() => {
    host = new PanelHost();
    parent = document.createElement('div');
    document.body.appendChild(parent);
    events = [];
  });

  it('mount() renders contributions in priority order', () => {
    host.register(makeContrib('c-hi', 'AI', 90, events));
    host.register(makeContrib('c-lo', 'Parameters', 10, events));
    host.register(makeContrib('c-mid', 'IFC', 50, events));
    host.mount(ctx('el-1'), parent);
    const ids = Array.from(parent.querySelectorAll<HTMLElement>('.panel-contribution'))
      .map(el => el.dataset.contributionId);
    expect(ids).toEqual(['c-lo', 'c-mid', 'c-hi']);
    expect(events).toEqual(['render:c-lo:el-1', 'render:c-mid:el-1', 'render:c-hi:el-1']);
  });

  it('mount() honours shouldShow filter', () => {
    host.register(makeContrib('shown', 'Parameters', 1, events));
    host.register(makeContrib('hidden', 'IFC', 2, events, {
      shouldShow: c => c.elementType === 'ifc-proxy',
    }));
    host.mount(ctx('el-1', 'wall'), parent);
    const ids = Array.from(parent.querySelectorAll<HTMLElement>('.panel-contribution'))
      .map(el => el.dataset.contributionId);
    expect(ids).toEqual(['shown']);
    expect(events).toEqual(['render:shown:el-1']);
  });

  it('mount() then mount() is idempotent (re-mount tears down first)', () => {
    host.register(makeContrib('a', 'Parameters', 1, events));
    host.register(makeContrib('b', 'IFC', 2, events));
    host.mount(ctx('el-1'), parent);
    host.mount(ctx('el-2'), parent);
    expect(parent.querySelectorAll('.panel-contribution').length).toBe(2);
    expect(events).toEqual([
      'render:a:el-1', 'render:b:el-1',
      'unmount:a:el-1', 'unmount:b:el-1',
      'render:a:el-2', 'render:b:el-2',
    ]);
  });

  it('unmountAll() removes every container and clears state', () => {
    host.register(makeContrib('a', 'Parameters', 1, events));
    host.register(makeContrib('b', 'IFC', 2, events));
    host.mount(ctx('el-1'), parent);
    host.unmountAll();
    expect(parent.children.length).toBe(0);
    expect(host.containerFor('a')).toBeNull();
    expect(events).toContain('unmount:a:el-1');
    expect(events).toContain('unmount:b:el-1');
  });

  it('render error: leaves an error sentinel and continues mounting siblings', () => {
    host.register(makeContrib('bad', 'Parameters', 1, events, { throwsOnRender: true }));
    host.register(makeContrib('good', 'IFC', 2, events));
    host.mount(ctx('el-1'), parent);
    const containers = Array.from(parent.querySelectorAll<HTMLElement>('.panel-contribution'));
    expect(containers.map(c => c.dataset.contributionId)).toEqual(['bad', 'good']);
    expect(containers[0]!.dataset.renderError).toBe('1');
    expect(containers[0]!.textContent).toContain('panel contribution "bad" render failed');
    expect(host.containerFor('bad')).toBeNull(); // not added to mounted on render fail
    expect(host.containerFor('good')).not.toBeNull();
  });

  it('containerFor() returns the live container element for inspection', () => {
    host.register(makeContrib('look', 'Parameters', 1, events));
    host.mount(ctx('el-1'), parent);
    const c = host.containerFor('look');
    expect(c).not.toBeNull();
    expect(c!.querySelector('.body-look')?.textContent).toBe('look for el-1');
  });

  it('container carries data-category attribute for stylesheet hooks', () => {
    host.register(makeContrib('a', 'AI', 1, events));
    host.mount(ctx('el-1'), parent);
    const c = parent.querySelector<HTMLElement>('.panel-contribution');
    expect(c!.dataset.category).toBe('AI');
  });
});
