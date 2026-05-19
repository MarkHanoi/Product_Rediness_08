// liveRegion — screen-reader announcement channel (S58 §19.7 #3).
//
// Spec source: PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md §19.7
// "screen-reader live region for solver status".
//
// The live region is a visually-hidden but screen-reader-visible
// element that the runtime announces solver state changes into
// ("Solver running", "Solver converged in 12 ms", "Solver failed:
// over-constrained").
//
// `politeness: 'polite'` (default) waits for the SR to finish current
// utterance; `'assertive'` interrupts.  Default to polite so we never
// crash the reading flow.
//
// LAYER — L7 chrome-side. Pure DOM.

export type LivePoliteness = 'polite' | 'assertive';

export interface LiveRegionMount {
  readonly element: HTMLElement;
  announce(message: string): void;
  clear(): void;
}

const VISUALLY_HIDDEN = [
  'position:absolute',
  'width:1px',
  'height:1px',
  'padding:0',
  'margin:-1px',
  'overflow:hidden',
  'clip:rect(0,0,0,0)',
  'white-space:nowrap',
  'border:0',
].join(';');

export function createLiveRegion(politeness: LivePoliteness = 'polite'): LiveRegionMount {
  const region = document.createElement('div');
  region.dataset.role = 'a11y-live-region';
  region.setAttribute('role', 'status');
  region.setAttribute('aria-live', politeness);
  region.setAttribute('aria-atomic', 'true');
  region.style.cssText = VISUALLY_HIDDEN;

  return {
    element: region,
    announce(message: string): void {
      // Toggle textContent to ensure SRs re-announce identical messages.
      region.textContent = '';
      // Microtask gap ensures the empty-then-populate transition fires
      // a fresh `aria-live` event in every major SR.
      queueMicrotask(() => {
        region.textContent = message;
      });
    },
    clear(): void {
      region.textContent = '';
    },
  };
}
