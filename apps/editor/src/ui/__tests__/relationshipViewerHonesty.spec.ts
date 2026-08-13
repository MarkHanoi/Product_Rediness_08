// GR-10 (`[]`-means-unknown ledger · C75 §1.4 · C78 §1.4/§8.1 · C71 §4.4) —
// the property-panel Relationship viewer stops printing "No relationships
// found" about elements whose relationship fields were never recorded.
//
// The old shape read `childrenIds ?? hostedElements ?? []`, `openings ?? []`
// and `connectedTo ?? adjacentIds ?? []`, so an element with NO recorded
// relationship fields and an element with genuinely zero relationships
// rendered the identical panel. The differentiating assertions below fail
// against that shape: it returned a bare Map with no `undetermined` channel
// and one indistinguishable "No relationships found" string.

import { describe, it, expect } from 'vitest';
import { extractRelationships, renderRelationshipSection } from '../property-panel/RelationshipViewer';

describe('extractRelationships — absent fields are NAMED, never empty groups (GR-10)', () => {
  it('an element with NO relationship fields reports all three families undetermined', () => {
    const out = extractRelationships({ id: 'w1' });
    expect(out.groups.size).toBe(0);
    // FAILS against the old `?? []` shape (bare Map, no channel).
    const scopes = out.undetermined.map((u) => u.scope).sort();
    expect(scopes).toEqual(['Connected To', 'Hosted Openings', 'Hosts']);
    for (const u of out.undetermined) {
      expect(u.reason).toBe('RELATIONSHIP_NOT_RECORDED');
    }
  });

  it('negative control: PRESENT empty arrays are DETERMINED — nothing undetermined', () => {
    const out = extractRelationships({ id: 'w1', childrenIds: [], openings: [], connectedTo: [] });
    expect(out.groups.size).toBe(0);
    expect(out.undetermined).toEqual([]);
  });

  it('a recorded family still extracts; only the unrecorded ones are reported', () => {
    const out = extractRelationships({ id: 'w1', childrenIds: ['d1'], openings: [] });
    expect(out.groups.get('Hosts')?.length).toBe(1);
    expect(out.undetermined.map((u) => u.scope)).toEqual(['Connected To']);
  });

  it('alias fields count as recorded (hostedElements / adjacentIds)', () => {
    const out = extractRelationships({ id: 'w1', hostedElements: [], adjacentIds: [], openings: [] });
    expect(out.undetermined).toEqual([]);
  });
});

describe('renderRelationshipSection — unknown and empty are DIFFERENT pixels (GR-10)', () => {
  it('all-undetermined renders the refusal wording plus a "Not determined" block', () => {
    const el = renderRelationshipSection(extractRelationships({ id: 'w1' }));
    expect(el.textContent).toContain('could not be determined');
    expect(el.textContent).toContain('Not determined');
    expect(el.textContent).toContain('unknown, not "none"');
    // The determined-empty sentence must NOT appear alone.
    expect(el.textContent).not.toContain('No relationships found');
  });

  it('negative control: determined-empty keeps the original "No relationships found"', () => {
    const el = renderRelationshipSection(
      extractRelationships({ id: 'w1', childrenIds: [], openings: [], connectedTo: [] }),
    );
    expect(el.textContent).toContain('No relationships found');
    expect(el.textContent).not.toContain('Not determined');
  });
});
