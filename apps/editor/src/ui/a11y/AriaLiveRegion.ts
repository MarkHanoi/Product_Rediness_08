// AriaLiveRegion — Wave A18-T22
//
// CONTRACT (C06 §3): Dynamic content changes (load progress, sync status,
// AI response) MUST be announced to screen readers via aria-live regions.
//
// P3 (rAF gate): announcement deferral routes through getFrameScheduler().scheduleOnce()
// — not raw requestAnimationFrame — per docs/archive/pryzm3-internal/01-VISION.md §2 P3.

import { getFrameScheduler } from '@pryzm/frame-scheduler';
//
// Usage:
//   const live = AriaLiveRegion.getInstance('status');
//   live.announce('Model loaded — 4 282 elements');
//   live.announce('Sync conflict detected — review required', 'assertive');

export type PolitenessLevel = 'polite' | 'assertive' | 'off';

const CONTAINER_ID = 'pryzm-aria-live-root';

export class AriaLiveRegion {
  private static _instances = new Map<string, AriaLiveRegion>();
  private readonly _el: HTMLElement;

  private constructor(regionName: string, politeness: PolitenessLevel = 'polite') {
    this._el = document.createElement('div');
    this._el.id = `pryzm-aria-live-${regionName}`;
    this._el.setAttribute('role', 'status');
    this._el.setAttribute('aria-live', politeness);
    this._el.setAttribute('aria-atomic', 'true');
    this._el.setAttribute('aria-relevant', 'additions text');
    this._el.style.cssText = [
      'position: absolute',
      'width: 1px',
      'height: 1px',
      'margin: -1px',
      'overflow: hidden',
      'clip: rect(0 0 0 0)',
      'white-space: nowrap',
      'border: 0',
    ].join(';');

    let container = document.getElementById(CONTAINER_ID);
    if (!container) {
      container = document.createElement('div');
      container.id = CONTAINER_ID;
      document.body.appendChild(container);
    }
    container.appendChild(this._el);
  }

  /**
   * getInstance — returns (or creates) the live region for the given name.
   * Re-using the same name always returns the same DOM element.
   */
  static getInstance(
    regionName: string,
    politeness: PolitenessLevel = 'polite',
  ): AriaLiveRegion {
    if (!AriaLiveRegion._instances.has(regionName)) {
      AriaLiveRegion._instances.set(regionName, new AriaLiveRegion(regionName, politeness));
    }
    return AriaLiveRegion._instances.get(regionName)!;
  }

  /**
   * announce — posts a message to the live region.
   * Screen readers will announce the text at the next opportunity.
   *
   * @param message    Text to announce.
   * @param politeness Override the politeness level for this announcement.
   */
  announce(message: string, politeness?: PolitenessLevel): void {
    if (politeness && this._el.getAttribute('aria-live') !== politeness) {
      this._el.setAttribute('aria-live', politeness);
    }
    this._el.textContent = '';
    getFrameScheduler().scheduleOnce('aria-announce', () => {
      this._el.textContent = message;
    });
  }

  /** clear — empties the live region without announcing anything. */
  clear(): void {
    this._el.textContent = '';
  }
}

// ── Convenience singletons for the three canonical live regions ───────────────

/** status — polite announcements for load progress, sync status, tool changes. */
export const statusRegion = (): AriaLiveRegion =>
  AriaLiveRegion.getInstance('status', 'polite');

/** alert — assertive announcements for errors and warnings. */
export const alertRegion = (): AriaLiveRegion =>
  AriaLiveRegion.getInstance('alert', 'assertive');

/** ai — polite announcements for AI response completions. */
export const aiRegion = (): AriaLiveRegion =>
  AriaLiveRegion.getInstance('ai', 'polite');
