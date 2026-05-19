// skipLink — unit tests for the keyboard skip-link primitive (S58 §19.7 #3).

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { createSkipLink } from '../../src/a11y/skipLink.js';

describe('createSkipLink', () => {
  let host: HTMLElement;
  let target: HTMLElement;

  beforeEach(() => {
    host = document.createElement('div');
    target = document.createElement('section');
    target.id = 'main-content';
    document.body.append(host, target);
  });

  afterEach(() => {
    host.remove();
    target.remove();
  });

  it('renders an anchor with href pointing at the target id', () => {
    const link = createSkipLink('main-content');
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('#main-content');
    expect(link.textContent).toBe('Skip to main content');
    expect(link.dataset.role).toBe('a11y-skip-link');
  });

  it('is visually offscreen by default and slides into view on focus', () => {
    const link = createSkipLink('main-content');
    expect(link.style.top).toBe('-100px');
    link.dispatchEvent(new FocusEvent('focus'));
    expect(link.style.top).toBe('8px');
    link.dispatchEvent(new FocusEvent('blur'));
    expect(link.style.top).toBe('-100px');
  });

  it('moves focus to the target element on click', () => {
    const link = createSkipLink('main-content');
    host.appendChild(link);
    link.click();
    expect(document.activeElement).toBe(target);
    expect(target.getAttribute('tabindex')).toBe('-1');
  });

  it('no-ops gracefully when the target id is missing', () => {
    target.remove();
    const link = createSkipLink('does-not-exist');
    host.appendChild(link);
    expect(() => link.click()).not.toThrow();
  });
});
