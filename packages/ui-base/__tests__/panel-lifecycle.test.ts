// @pryzm/ui-base — Panel lifecycle edge-case tests
// (Wave 13 zero-test drive — adds 2 tests to reach the ≥ 3 total target).

import { describe, expect, it, vi } from 'vitest';
import { Panel, type PanelOptions, type PanelDisposable } from '../src/index.js';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

function makeStubRuntime(): PryzmRuntime {
  return {} as unknown as PryzmRuntime;
}

function makeHost(): HTMLElement {
  return document.createElement('div');
}

class TrackingPanel extends Panel<PanelOptions> {
  static override panelId = 'panel:tracking-test';
  protected override onMount(): void {}
  protected override onRender(_root: HTMLElement): void {}
  protected override onUnmount(): void {}

  // Expose track() for testing.
  addDisposable(d: PanelDisposable): void {
    this.track(d);
  }
}

describe('@pryzm/ui-base — Panel track + dispose', () => {
  it('dispose() calls dispose() on every tracked disposable', () => {
    const host = makeHost();
    const panel = new TrackingPanel(host, makeStubRuntime());

    const disposeA = vi.fn();
    const disposeB = vi.fn();
    panel.addDisposable({ dispose: disposeA });
    panel.addDisposable({ dispose: disposeB });

    panel.mount();
    panel.dispose();

    expect(disposeA).toHaveBeenCalledOnce();
    expect(disposeB).toHaveBeenCalledOnce();
  });
});

describe('@pryzm/ui-base — Panel lifecycle invariant', () => {
  it('dispose() after unmount() does not throw and is idempotent', () => {
    const host = makeHost();
    const panel = new TrackingPanel(host, makeStubRuntime());

    panel.mount();
    panel.unmount();
    expect(() => panel.dispose()).not.toThrow();
    // Second dispose must also not throw.
    expect(() => panel.dispose()).not.toThrow();
  });
});
