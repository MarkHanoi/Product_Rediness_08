// renderViewChip — minimal DOM contract (S44 D5).

import { describe, expect, it } from 'vitest';
import { renderViewChip } from '../src/view-chip.js';

describe('renderViewChip', () => {
  it('renders the label as textContent', () => {
    const chip = renderViewChip({ viewLabel: 'Plan view — Level 1' });
    expect(chip.textContent).toBe('Plan view — Level 1');
  });

  it('defaults kind to "view"', () => {
    const chip = renderViewChip({ viewLabel: 'X' });
    expect(chip.classList.contains('pryzm-chip--view')).toBe(true);
    expect(chip.dataset.chipKind).toBe('view');
  });

  it('respects kind=tool', () => {
    const chip = renderViewChip({ viewLabel: 'Wall tool', kind: 'tool' });
    expect(chip.classList.contains('pryzm-chip--tool')).toBe(true);
    expect(chip.dataset.chipKind).toBe('tool');
  });

  it('always carries the base "pryzm-chip" class', () => {
    const chip = renderViewChip({ viewLabel: 'X' });
    expect(chip.classList.contains('pryzm-chip')).toBe(true);
  });
});
