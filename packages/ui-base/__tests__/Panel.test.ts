// @pryzm/ui-base — Panel lifecycle contract tests.
//
// The Phase B.1 acceptance is "the lifecycle is idempotent + every span fires once".
// These tests pin the contract that B.2..B.40 will rely on as they migrate
// every `src/ui/*` panel to extend `Panel`.

import { describe, expect, it, beforeEach } from 'vitest';
import { Panel, type PanelOptions, type PanelDisposable } from '../src/index.js';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

// Construct a minimal-but-typed runtime. `Panel` only reads the field
// to expose it to subclasses — it does not invoke any slot — so the
// stub need not be wired. Cast through `unknown` because the contract
// is rich and we are not exercising it here.
function makeStubRuntime(): PryzmRuntime {
  return {} as unknown as PryzmRuntime;
}

interface CountingOpts extends PanelOptions {
  startCounter?: number;
}

class CountingPanel extends Panel<CountingOpts> {
  static override panelId = 'panel:counting-test';
  mountCount = 0;
  renderCount = 0;
  unmountCount = 0;
  disposeCount = 0;

  protected override onMount(): void {
    this.mountCount += 1;
  }
  protected override onRender(root: HTMLElement): void {
    this.renderCount += 1;
    root.textContent = `count=${this.renderCount}`;
  }
  protected override onUnmount(): void {
    this.unmountCount += 1;
  }
  protected override onDispose(): void {
    this.disposeCount += 1;
  }

  trackForTest(d: PanelDisposable): void {
    this.track(d);
  }
}

describe('@pryzm/ui-base Panel', () => {
  let host: HTMLElement;
  let runtime: PryzmRuntime;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    runtime = makeStubRuntime();
  });

  it('mount() is idempotent — onMount fires exactly once', () => {
    const p = new CountingPanel(host, runtime);
    p.mount();
    p.mount();
    p.mount();
    expect(p.mountCount).toBe(1);
    expect(p.__statusForTest()).toBe('mounted');
    expect(host.querySelector('[data-panel="panel:counting-test"]')).not.toBeNull();
  });

  it('render() before mount is a no-op; render() after mount fires onRender', () => {
    const p = new CountingPanel(host, runtime);
    p.render();
    expect(p.renderCount).toBe(0);
    p.mount();
    p.render();
    p.render();
    expect(p.renderCount).toBe(2);
    expect(p.__statusForTest()).toBe('mounted');
  });

  it('unmount() detaches the root and is idempotent', () => {
    const p = new CountingPanel(host, runtime);
    p.mount();
    expect(host.children.length).toBe(1);
    p.unmount();
    p.unmount();
    expect(p.unmountCount).toBe(1);
    expect(host.children.length).toBe(0);
    expect(p.__statusForTest()).toBe('unmounted');
  });

  it('dispose() unmounts (if mounted), runs onDispose once, and releases tracked disposables', () => {
    const p = new CountingPanel(host, runtime);
    let disposed = 0;
    p.trackForTest({
      dispose() {
        disposed += 1;
      },
    });
    p.mount();
    p.dispose();
    p.dispose();
    expect(p.unmountCount).toBe(1);
    expect(p.disposeCount).toBe(1);
    expect(disposed).toBe(1);
    expect(p.__statusForTest()).toBe('disposed');
  });

  it('mount() after dispose() throws — disposed panels are unrecoverable', () => {
    const p = new CountingPanel(host, runtime);
    p.mount();
    p.dispose();
    expect(() => p.mount()).toThrow(/cannot remount after dispose/);
  });

  it('panelId() falls back to constructor name when no static / opts ID is set', () => {
    class Anon extends Panel {
      reveal(): string {
        return this.panelId();
      }
    }
    const p = new Anon(host, runtime);
    expect(p.reveal()).toBe('Anon');
  });

  it('opts.panelId overrides static panelId', () => {
    class Override extends Panel {
      static override panelId = 'panel:from-static';
      reveal(): string {
        return this.panelId();
      }
    }
    const p = new Override(host, runtime, { panelId: 'panel:from-opts' });
    expect(p.reveal()).toBe('panel:from-opts');
  });

  it('disposer that throws does not block sibling disposers', () => {
    const p = new CountingPanel(host, runtime);
    let secondCalled = false;
    p.trackForTest({
      dispose() {
        throw new Error('boom');
      },
    });
    p.trackForTest({
      dispose() {
        secondCalled = true;
      },
    });
    p.mount();
    expect(() => p.dispose()).not.toThrow();
    expect(secondCalled).toBe(true);
  });
});
