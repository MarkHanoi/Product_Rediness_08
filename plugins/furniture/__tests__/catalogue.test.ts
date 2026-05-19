// FurnitureCatalogue smoke suite (S27 / ADR-0027 §5).

import { describe, expect, it } from 'vitest';
import {
  FurnitureCatalogue,
  SEED_FURNITURE_CATALOGUE,
} from '../src/catalogue/index.js';
import { FurnitureCatalogueLookupError } from '../src/errors.js';

describe('FurnitureCatalogue', () => {
  it('seed ships exactly three entries (chair, sofa, table)', () => {
    const cat = new FurnitureCatalogue(SEED_FURNITURE_CATALOGUE);
    expect(cat.size()).toBe(3);
    expect(cat.list().map((e) => e.id)).toEqual([
      'pryzm/chair-basic',
      'pryzm/sofa-3s',
      'pryzm/table-rect',
    ]);
  });

  it('every seed entry carries all 5 LOD representations with non-empty positions', () => {
    for (const e of SEED_FURNITURE_CATALOGUE) {
      for (const k of ['0', '1', '2', '3', '4'] as const) {
        const rep = e.representations[k];
        expect(rep, `${e.id} missing rep ${k}`).toBeDefined();
        expect(rep!.positions.length % 3, `${e.id}.${k}.positions % 3`).toBe(0);
        expect(rep!.indices.length % 3, `${e.id}.${k}.indices  % 3`).toBe(0);
        expect(rep!.positions.length).toBeGreaterThan(0);
        expect(rep!.indices.length).toBeGreaterThan(0);
      }
    }
  });

  it('LOD 4 has more triangles than LOD 0', () => {
    for (const e of SEED_FURNITURE_CATALOGUE) {
      const t0 = e.representations['0']!.indices.length / 3;
      const t4 = e.representations['4']!.indices.length / 3;
      expect(t4).toBeGreaterThan(t0);
    }
  });

  it('find / require / select agree', () => {
    const cat = new FurnitureCatalogue(SEED_FURNITURE_CATALOGUE);
    expect(cat.find('pryzm/chair-basic')).toBeDefined();
    expect(cat.find('does/not-exist')).toBeUndefined();
    expect(() => cat.require('does/not-exist')).toThrow(FurnitureCatalogueLookupError);
    const e = cat.select('pryzm/sofa-3s');
    expect(e.id).toBe('pryzm/sofa-3s');
    expect(cat.current()?.id).toBe('pryzm/sofa-3s');
  });

  it('current() returns the first seed entry on construction', () => {
    const cat = new FurnitureCatalogue(SEED_FURNITURE_CATALOGUE);
    expect(cat.current()?.id).toBe('pryzm/chair-basic');
  });

  it('current() is undefined for an empty catalogue', () => {
    const cat = new FurnitureCatalogue();
    expect(cat.current()).toBeUndefined();
  });

  it('filter by category narrows to seating', () => {
    const cat = new FurnitureCatalogue(SEED_FURNITURE_CATALOGUE);
    const seating = cat.filter({ category: 'seating' });
    expect(seating.map((e) => e.id).sort()).toEqual(['pryzm/chair-basic', 'pryzm/sofa-3s']);
  });

  it('filter by search is case-insensitive and matches tags', () => {
    const cat = new FurnitureCatalogue(SEED_FURNITURE_CATALOGUE);
    expect(cat.filter({ search: 'SOFA' }).map((e) => e.id)).toEqual(['pryzm/sofa-3s']);
    expect(cat.filter({ search: 'dining' }).map((e) => e.id)).toEqual(['pryzm/table-rect']);
  });

  it('upsert adds and replaces entries', () => {
    const cat = new FurnitureCatalogue(SEED_FURNITURE_CATALOGUE);
    cat.upsert({
      id: 'project/custom-armchair',
      displayName: 'Custom Armchair',
      category: 'seating',
      size: { x: 0.7, y: 0.85, z: 0.7 },
      representations: SEED_FURNITURE_CATALOGUE[0]!.representations,
    });
    expect(cat.size()).toBe(4);
    expect(cat.find('project/custom-armchair')).toBeDefined();
    cat.upsert({
      ...cat.require('project/custom-armchair'),
      displayName: 'Renamed Armchair',
    });
    expect(cat.find('project/custom-armchair')!.displayName).toBe('Renamed Armchair');
    expect(cat.size()).toBe(4);
  });

  it('remove deletes entries and clears selection if needed', () => {
    const cat = new FurnitureCatalogue(SEED_FURNITURE_CATALOGUE);
    cat.select('pryzm/sofa-3s');
    cat.remove('pryzm/sofa-3s');
    expect(cat.size()).toBe(2);
    expect(cat.current()?.id).not.toBe('pryzm/sofa-3s');
  });

  it('categories() lists distinct categories preserving insertion order', () => {
    const cat = new FurnitureCatalogue(SEED_FURNITURE_CATALOGUE);
    expect(cat.categories()).toEqual(['seating', 'tables']);
  });
});
