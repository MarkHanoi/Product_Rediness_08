// liveRegion — unit tests for the screen-reader live region (S58 §19.7 #3).

import { describe, expect, it } from 'vitest';
import { createLiveRegion } from '../../src/a11y/liveRegion.js';

describe('createLiveRegion', () => {
  it('renders a polite, atomic, status-role region by default', () => {
    const region = createLiveRegion();
    expect(region.element.getAttribute('role')).toBe('status');
    expect(region.element.getAttribute('aria-live')).toBe('polite');
    expect(region.element.getAttribute('aria-atomic')).toBe('true');
    expect(region.element.dataset.role).toBe('a11y-live-region');
  });

  it('honours the `assertive` politeness mode when requested', () => {
    const region = createLiveRegion('assertive');
    expect(region.element.getAttribute('aria-live')).toBe('assertive');
  });

  it('is visually hidden but DOM-present (1×1 clipped)', () => {
    const region = createLiveRegion();
    expect(region.element.style.width).toBe('1px');
    expect(region.element.style.height).toBe('1px');
    expect(region.element.style.overflow).toBe('hidden');
    expect(region.element.style.clip).toMatch(/rect\(/);
  });

  it('announce() flushes empty-then-message via microtask so SRs re-announce', async () => {
    const region = createLiveRegion();
    region.element.textContent = 'previous';
    region.announce('Solver converged');
    // Synchronously: cleared.
    expect(region.element.textContent).toBe('');
    // After the microtask fires: populated.
    await Promise.resolve();
    expect(region.element.textContent).toBe('Solver converged');
  });

  it('clear() empties the region', async () => {
    const region = createLiveRegion();
    region.announce('Hello');
    await Promise.resolve();
    region.clear();
    expect(region.element.textContent).toBe('');
  });
});
