/**
 * Role-scorer tests.
 *
 * ⚠ The València assertions here are POST-HOC (see the honesty header in
 * `roles.ts`). They lock in what was OBSERVED, including the two roles the role
 * scorer gets WRONG on València. Locking the failures matters as much as locking
 * the passes — it stops someone quietly "fixing" them with a València token and
 * calling the Genome thesis validated.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { rankLayersByRole, bestPerRole } from '../roleScoring.js';
import { ROLE_PROFILES } from '../roles.js';

const here = dirname(fileURLToPath(import.meta.url));
interface SlimLayer {
  serviceName: string;
  layerName: string;
  layerUrl: string;
  geometryType: string | null;
  wkid: number | null;
  fields: { name: string; alias: string }[];
}
const load = (f: string) =>
  (JSON.parse(readFileSync(join(here, 'fixtures', f), 'utf8')) as { layers: SlimLayer[] }).layers;

const madrid = load('madrid-crawl-slim.json');
const valencia = load('valencia-crawl-slim.json');

const rankIn = (layers: SlimLayer[], role: string, suffix: string): number => {
  const list = rankLayersByRole(layers)[role as never] as { rank: number; layer: SlimLayer }[];
  const hit = list.find((r) => r.layer.layerUrl.endsWith(suffix));
  if (!hit) throw new Error(`absent from crawl: ${suffix}`);
  return hit.rank;
};

describe('role profiles are well-formed', () => {
  it('covers the seven roles exactly once', () => {
    const roles = ROLE_PROFILES.map((p) => p.role);
    expect(new Set(roles).size).toBe(roles.length);
    expect(roles.sort()).toEqual(
      ['alignment', 'building-condition', 'derived-plan', 'heritage', 'parcel', 'use', 'zone-routing'].sort(),
    );
  });

  it('every profile states its Madrid/corpus justification', () => {
    for (const p of ROLE_PROFILES) expect(p.why.length).toBeGreaterThan(40);
  });
});

describe('CALIBRATION LOCK — Madrid role ranks', () => {
  it('zone-routing #1 is NORMAS_ZONALES/0', () => {
    expect(rankIn(madrid, 'zone-routing', 'NORMAS_ZONALES/MapServer/0')).toBe(1);
  });

  it('derived-plan puts PG_ORDENACION/3 in the top 3', () => {
    expect(rankIn(madrid, 'derived-plan', 'PG_ORDENACION/MapServer/3')).toBeLessThanOrEqual(3);
  });

  it('building-condition #1 is PG_CONDICIONES_EDIFICACION/6 — the layer the single scorer buried at #24', () => {
    expect(rankIn(madrid, 'building-condition', 'PG_CONDICIONES_EDIFICACION/MapServer/6')).toBe(1);
  });

  it('separates roles: the zoning layer does NOT win building-condition or alignment', () => {
    expect(rankIn(madrid, 'building-condition', 'NORMAS_ZONALES/MapServer/0')).toBeGreaterThan(50);
    expect(rankIn(madrid, 'alignment', 'NORMAS_ZONALES/MapServer/0')).toBeGreaterThan(50);
  });

  it('alignment #1 is PG_GESTION/Alineaciones, as the corpus (batch 3b §9) states', () => {
    const top = bestPerRole(madrid)['alignment'];
    expect(top?.layer.layerUrl).toContain('PG_GESTION');
    expect(top?.layer.layerName).toContain('Alineaciones');
  });
});

describe('POST-HOC — València role ranks (observed, not blind)', () => {
  it('zone-routing top 2 are both the PGOU Calificaciones dataset', () => {
    expect(rankIn(valencia, 'zone-routing', 'UrbanismoEInfraestructuras/MapServer/231')).toBeLessThanOrEqual(3);
    const top2 = rankLayersByRole(valencia)['zone-routing'].slice(0, 2);
    for (const r of top2) expect(r.layer.layerName.toLowerCase()).toContain('calificacion');
  });

  it('alignment #1 is PGOU - Alineaciones', () => {
    expect(rankIn(valencia, 'alignment', 'UrbanismoEInfraestructuras/MapServer/212')).toBe(1);
  });

  it('parcel top 2 are the cadastral parcel layers', () => {
    const top2 = rankLayersByRole(valencia)['parcel'].slice(0, 2);
    for (const r of top2) expect(r.layer.layerName.toLowerCase()).toContain('cadastrals');
  });

  it('KNOWN MISS: derived-plan picks the wrong layer, because València encodes plan provenance as a FIELD', () => {
    // The true derived-plan signal is `origen` (PGOU/PE####/PRI####/PEPRI####/
    // ED####/MP####/PP####) carried as an ATTRIBUTE on the zoning layer and on
    // MapServer/275 "PGOU - Origen". A layer-shaped scorer structurally cannot
    // see it. Locked as a fact — do NOT patch with a València token.
    const top = bestPerRole(valencia)['derived-plan'];
    expect(top?.layer.layerName).toContain('Foment');
    expect(rankIn(valencia, 'derived-plan', 'UrbanismoEInfraestructuras/MapServer/275')).toBeGreaterThan(3);
  });

  it('KNOWN MISS: no building-condition layer exists in the public catalogue', () => {
    // València publishes no NZ1-equivalent envelope geometry. The top scorer for
    // the role is an unrelated "Ámbitos de Fomento de la Edificación" at a very
    // low score. Recorded as "not found", never as zero.
    const top = bestPerRole(valencia)['building-condition'];
    expect(top!.score.score).toBeLessThan(40);
    expect(top!.layer.layerName).not.toContain('Condicion');
  });
});
