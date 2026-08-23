/**
 * §IFC-TREE-VIEW (L-8370..L-8376) — the DOM.
 *
 * The differentiating assertion here is that the view prints the grouping's
 * `coverage.message` VERBATIM. If the view were allowed to compose its own
 * wording, the ABSENT / NOT-EXTRACTED distinction would be re-decided in a
 * template — which is exactly how such distinctions get smoothed away.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createIfcTreeView, createTreeToggle } from '../src/tree/ifc-tree-view.js';
import { adaptImportedModel, adaptNativeElements } from '../src/tree/adapters.js';
import { groupBySystem } from '../src/tree/groupings.js';

const imported = adaptImportedModel({
  modelId: 'm1',
  modelName: 'SG Tower.ifc',
  storeyOrder: ['Level 2'],
  elements: [
    {
      id: 'i1',
      expressID: 243274,
      name: 'Basic Roof:SG Metal Panels roof:243274',
      ifcTypeName: 'IfcRoof',
      rawIfcType: 'IFCROOF',
      storeyName: 'Level 2',
      storeyExpressID: 9,
      psets: { Pset_RoofCommon: { FireRating: 'REI 60' } },
    },
  ],
});

const native = adaptNativeElements(
  [{ id: 'p1', type: 'pool', name: 'Pool', levelId: 'L1', levelName: 'Level 1' }],
  'Villa',
);

beforeEach(() => {
  document.body.replaceChildren();
  document.getElementById('pryzm-ifc-tree-styles')?.remove();
});

describe('the two-button toggle', () => {
  it('renders exactly two buttons, labelled as the founder named them', () => {
    const t = createTreeToggle('pryzm', () => {});
    const btns = t.element.querySelectorAll('button');
    expect(btns).toHaveLength(2);
    expect([...btns].map((b) => b.textContent)).toEqual(['PRYZM tree', 'IFC tree']);
  });

  it('marks exactly one active, and flips on click', () => {
    const seen: string[] = [];
    const t = createTreeToggle('pryzm', (m) => seen.push(m));
    const active = () =>
      [...t.element.querySelectorAll('button')].filter((b) =>
        b.classList.contains('ifct-toggle-btn--active'),
      );
    expect(active()).toHaveLength(1);
    expect(active()[0]!.textContent).toBe('PRYZM tree');

    (t.element.querySelectorAll('button')[1] as HTMLButtonElement).click();
    expect(seen).toEqual(['ifc']);
    expect(active()).toHaveLength(1);
    expect(active()[0]!.textContent).toBe('IFC tree');
  });

  it('is a tablist with aria-selected tracking the active button', () => {
    const t = createTreeToggle('ifc', () => {});
    expect(t.element.getAttribute('role')).toBe('tablist');
    const btns = [...t.element.querySelectorAll('button')];
    expect(btns.map((b) => b.getAttribute('aria-selected'))).toEqual(['false', 'true']);
  });
});

describe('the view renders all five groupings and prints empty states VERBATIM', () => {
  it('offers exactly the five groupings the founder listed, in order', () => {
    const v = createIfcTreeView({ onSelect: () => {} });
    const labels = [...v.element.querySelectorAll('.ifct-groupbar-btn')].map((b) => b.textContent);
    expect(labels).toEqual([
      'IFC spatial',
      'By IFC class',
      'By IFC system',
      'By material',
      'By storey',
    ]);
  });

  it('⭐ the By-IFC-system empty message is byte-identical to the model’s', () => {
    const v = createIfcTreeView({ onSelect: () => {} });
    document.body.appendChild(v.element);
    v.setSources([imported, native]);

    // switch to "By IFC system"
    const sysBtn = [...v.element.querySelectorAll('.ifct-groupbar-btn')].find(
      (b) => b.textContent === 'By IFC system',
    ) as HTMLButtonElement;
    sysBtn.click();

    const expected = groupBySystem([imported, native]).coverage;
    expect(expected.kind).toBe('empty');
    const rendered = v.element.querySelector('.ifct-empty')!.textContent ?? '';
    if (expected.kind === 'empty') {
      // VERBATIM — not paraphrased, not truncated.
      expect(rendered).toContain(expected.message);
      expect(rendered).toContain('Both causes are in play');
    }
  });

  it('a populated grouping shows exact counts, not rendered counts', () => {
    const v = createIfcTreeView({ onSelect: () => {} });
    document.body.appendChild(v.element);
    v.setSources([imported, native]);
    const clsBtn = [...v.element.querySelectorAll('.ifct-groupbar-btn')].find(
      (b) => b.textContent === 'By IFC class',
    ) as HTMLButtonElement;
    clsBtn.click();
    const counts = [...v.element.querySelectorAll('.ifct-count')].map((c) => c.textContent);
    expect(counts).toContain('1');
  });

  it('the unmapped bucket is visible and marked as a deficit, not hidden', () => {
    const v = createIfcTreeView({ onSelect: () => {} });
    document.body.appendChild(v.element);
    v.setSources([native]);
    (
      [...v.element.querySelectorAll('.ifct-groupbar-btn')].find(
        (b) => b.textContent === 'By IFC class',
      ) as HTMLButtonElement
    ).click();
    const deficit = v.element.querySelector('.ifct-row--deficit');
    expect(deficit).toBeTruthy();
    expect(deficit!.textContent).toContain('no C25 §2 row');
  });
});

describe('the Story card', () => {
  function selectFirstElement() {
    const v = createIfcTreeView({ onSelect: () => {} });
    document.body.appendChild(v.element);
    v.setSources([imported]);
    v.setSelection('i1');
    return v;
  }

  it('shows the completeness fraction over 8', () => {
    const v = selectFirstElement();
    expect(v.element.querySelector('.ifct-frac')!.textContent).toMatch(/^\d of 8 answered$/);
  });

  it('shows the element name and IFC class · container subtitle', () => {
    const v = selectFirstElement();
    expect(v.element.querySelector('.ifct-story-name')!.textContent).toContain('SG Metal Panels roof');
    expect(v.element.querySelector('.ifct-story-sub')!.textContent).toContain('IfcRoof');
  });

  it('renders all eight slots plus the How-we-know ledger', () => {
    const v = selectFirstElement();
    const labels = [...v.element.querySelectorAll('.ifct-slot-label')].map((n) => n.textContent);
    expect(labels).toEqual([
      'What it is',
      'Why it exists',
      'Where',
      'Part of and made of',
      'Feeds and fed by',
      'Who is responsible',
      'State and history',
      'If it fails',
      'How we know',
    ]);
  });

  it('⛔ every model-sourced chip says "from the model" and none says AI', () => {
    const v = selectFirstElement();
    const chips = [...v.element.querySelectorAll('.ifct-chip')].map((c) => c.textContent ?? '');
    expect(chips.some((c) => c.includes('from the model'))).toBe(true);
    expect(chips.some((c) => c.includes('AI-inferred'))).toBe(false);
  });

  it('⛔ with no AI port the Ask affordance is DISABLED and says why', () => {
    const v = selectFirstElement();
    const ask = v.element.querySelector('.ifct-ask')!;
    expect(ask.classList.contains('ifct-ask-disabled')).toBe(true);
    expect(ask.textContent).toContain('not wired');
  });

  it('uses no black — brand is purple on white', () => {
    createIfcTreeView({ onSelect: () => {} });
    const css = document.getElementById('pryzm-ifc-tree-styles')!.textContent ?? '';
    expect(css).not.toMatch(/#000\b|#000000|\bblack\b/i);
    expect(css).toContain('#6600FF');
  });
});
