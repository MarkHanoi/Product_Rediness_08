/**
 * §IFC-TREE-AUTHORITY (L-8300..L-8306) — the equivalence guard.
 *
 * ⭐ THE POINT OF THIS SUITE. `CLAUDE.md` records the same defect five times:
 * a hand-copied list that rots because nothing compared it against reality.
 * The fix that finally worked there was `check-contract-index-equivalence.ts`,
 * which compares SETS IN BOTH DIRECTIONS and never a count — because a count
 * can be right while the membership is wrong.
 *
 * This suite applies that shape to the IFC class authority. It READS THE REAL
 * UNION DECLARATIONS OFF DISK rather than restating them, so a new element
 * family added to either vocabulary fails this test instead of silently
 * arriving in the tree as "Unmapped" with nobody noticing.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  IFC_CLASS_AUTHORITY,
  authorityKeys,
  mappedIfcClasses,
  resolveIfcClass,
} from '../src/tree/ifc-class-authority.js';

const REPO = resolve(__dirname, '../../..');

/** Extract a `export type ElementType = | 'a' | 'b'` union's members from source. */
function readUnion(relPath: string): Set<string> {
  const src = readFileSync(resolve(REPO, relPath), 'utf8');
  const start = src.indexOf('export type ElementType');
  expect(start, `ElementType not found in ${relPath}`).toBeGreaterThan(-1);
  const semi = src.indexOf(';', start);
  const body = src.slice(start, semi);
  const members = [...body.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
  expect(members.length, `no members parsed from ${relPath}`).toBeGreaterThan(5);
  return new Set(members);
}

const L0_UNION = 'packages/schemas/src/types/Id.ts';
const CORE_UNION = 'packages/core-app-model/src/CoreElement.ts';

describe('§IFC-TREE-AUTHORITY — set equivalence against BOTH ElementType unions', () => {
  it('the two unions really do disagree — the premise of keying on string', () => {
    const l0 = readUnion(L0_UNION);
    const core = readUnion(CORE_UNION);

    // If these ever become equal, this table can be typed to the union and this
    // test should be REPLACED, not deleted.
    const onlyL0 = [...l0].filter((m) => !core.has(m));
    const onlyCore = [...core].filter((m) => !l0.has(m));
    expect(
      onlyL0.length + onlyCore.length,
      'the unions have converged — retype IFC_CLASS_AUTHORITY to the union and rewrite this test',
    ).toBeGreaterThan(0);

    // The spelling split that motivated carrying both keys.
    expect(l0.has('curtainwall')).toBe(true);
    expect(core.has('curtain-wall')).toBe(true);
  });

  it('ARM A — every member of the L0 id vocabulary is ranked by the authority', () => {
    const l0 = readUnion(L0_UNION);
    const missing = [...l0].filter((m) => !(m in IFC_CLASS_AUTHORITY));
    expect(
      missing,
      `L0 element types with NO row in IFC_CLASS_AUTHORITY: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it("ARM B — every member of core-app-model's ElementType is ranked by the authority", () => {
    const core = readUnion(CORE_UNION);
    const missing = [...core].filter((m) => !(m in IFC_CLASS_AUTHORITY));
    expect(
      missing,
      `core ElementType members with NO row in IFC_CLASS_AUTHORITY: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('ARM C — the authority ranks nothing that exists in neither vocabulary', () => {
    const known = new Set([...readUnion(L0_UNION), ...readUnion(CORE_UNION)]);
    const orphans = authorityKeys().filter((k) => !known.has(k));
    expect(
      orphans,
      `authority rows for types in NEITHER vocabulary (dead rows): ${orphans.join(', ')}`,
    ).toEqual([]);
  });
});

describe('§IFC-TREE-AUTHORITY — nothing is invented', () => {
  it('every mapped row cites a contract authority', () => {
    for (const [type, r] of Object.entries(IFC_CLASS_AUTHORITY)) {
      if (r.status !== 'mapped') continue;
      expect(['C25§2', 'C25§2-amended'], `'${type}' cites no contract`).toContain(r.authority);
      expect(r.ifcClass.startsWith('Ifc'), `'${type}' -> '${r.ifcClass}' is not an Ifc class`).toBe(true);
    }
  });

  it('every unmapped row states a reason, and candidates are clearly non-normative', () => {
    for (const [type, r] of Object.entries(IFC_CLASS_AUTHORITY)) {
      if (r.status !== 'unmapped') continue;
      expect(['not-a-product', 'no-contract-row'], `'${type}' has no reason`).toContain(r.reason);
      // A candidate MUST NOT be readable as a mapping — there is no ifcClass field.
      expect('ifcClass' in r, `'${type}' unmapped row leaks an ifcClass`).toBe(false);
    }
  });

  it('an unrecognised type resolves UNMAPPED, never silently proxied', () => {
    const r = resolveIfcClass('definitely-not-an-element');
    expect(r.status).toBe('unmapped');
    // IfcModelBuilder.ts:156 proxies unknowns to IFCBUILDINGELEMENTPROXY.
    // The tree must NOT, because "unrecognised" and "generic element" differ.
    expect(JSON.stringify(r)).not.toContain('BuildingElementProxy');
  });
});

describe('§IFC-TREE-AUTHORITY — the reconciliations this lane made, pinned', () => {
  it('L-8303 furniture follows C25 §2 (IfcFurniture), NOT the code literal', () => {
    const r = IFC_CLASS_AUTHORITY['furniture']!;
    expect(r.status).toBe('mapped');
    if (r.status === 'mapped') expect(r.ifcClass).toBe('IfcFurniture');
  });

  it('L-8304 plumbing follows C25 §2 (IfcSanitaryTerminal), NOT the code literal', () => {
    const r = IFC_CLASS_AUTHORITY['plumbing']!;
    expect(r.status).toBe('mapped');
    if (r.status === 'mapped') expect(r.ifcClass).toBe('IfcSanitaryTerminal');
  });

  it('L-8302 floor is a COVERING/FLOORING, not a slab — the one row where code beat the contract', () => {
    const floor = IFC_CLASS_AUTHORITY['floor']!;
    const slab = IFC_CLASS_AUTHORITY['slab']!;
    expect(floor.status).toBe('mapped');
    expect(slab.status).toBe('mapped');
    if (floor.status === 'mapped' && slab.status === 'mapped') {
      expect(floor.ifcClass).toBe('IfcCovering');
      expect(floor.predefinedType).toBe('FLOORING');
      expect(slab.ifcClass).toBe('IfcSlab');
      expect(floor.ifcClass).not.toBe(slab.ifcClass);
    }
  });

  it('both curtain-wall spellings resolve to the same class', () => {
    const a = IFC_CLASS_AUTHORITY['curtain-wall']!;
    const b = IFC_CLASS_AUTHORITY['curtainwall']!;
    expect(a.status === 'mapped' && b.status === 'mapped').toBe(true);
    if (a.status === 'mapped' && b.status === 'mapped') {
      expect(a.ifcClass).toBe(b.ifcClass);
    }
  });

  it('L-8306 the unranked families are unmapped and NAMED, not quietly classed', () => {
    for (const t of ['lift', 'balcony', 'pool', 'boundaryLine', 'water']) {
      const r = IFC_CLASS_AUTHORITY[t]!;
      expect(r.status, `${t} should be unmapped`).toBe('unmapped');
      if (r.status === 'unmapped') {
        expect(r.reason).toBe('no-contract-row');
        expect(r.note, `${t} must explain itself`).toBeTruthy();
      }
    }
  });

  it('pool and water offer NO candidate — inventing one would be the defect', () => {
    for (const t of ['pool', 'water']) {
      const r = IFC_CLASS_AUTHORITY[t]!;
      if (r.status === 'unmapped') expect(r.candidate).toBeUndefined();
    }
  });

  it('non-products are separated from gaps', () => {
    for (const t of ['view', 'sheet', 'schedule', 'project']) {
      const r = IFC_CLASS_AUTHORITY[t]!;
      expect(r.status).toBe('unmapped');
      if (r.status === 'unmapped') expect(r.reason).toBe('not-a-product');
    }
  });
});

describe('§IFC-TREE-AUTHORITY — export reachability of the classes it produces', () => {
  /**
   * L-8305. `IFC_CLASS_MAP` in IfcModelBuilder.ts is the class-name ->
   * web-ifc-code stage. A class this authority produces that is ABSENT there
   * falls through IfcModelBuilder.ts:156 to IFCBUILDINGELEMENTPROXY.
   *
   * This test does not FAIL on the gap — the gap is real, logged, and larger
   * than this lane. It PINS the current set so the list cannot grow silently.
   */
  it('pins which authority classes IfcModelBuilder cannot yet emit', () => {
    const src = readFileSync(
      resolve(REPO, 'packages/file-format/src/export/ifc/IfcModelBuilder.ts'),
      'utf8',
    );
    const start = src.indexOf('const IFC_CLASS_MAP');
    const body = src.slice(start, src.indexOf('};', start));
    const emittable = new Set([...body.matchAll(/'(Ifc[A-Za-z]+)'/g)].map((m) => m[1]!));

    const spatialByDesign = new Set(['IfcBuildingStorey']);
    const notEmittable = mappedIfcClasses()
      .filter((c) => !emittable.has(c) && !spatialByDesign.has(c))
      .sort();

    // Measured at the time of writing. If this set CHANGES, read it — a growth
    // means a new class was minted with no way to export it.
    expect(notEmittable).toEqual([
      'IfcAnnotation',
      'IfcFurniture',
      'IfcGrid',
      'IfcLightFixture',
      'IfcSanitaryTerminal',
    ]);
  });
});
