import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHEMA_REGISTRY } from '../src/registry.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES_DIR = resolve(here, '../../../tests/fixtures/pryzm-1-snapshots');

const ELEMENT_TYPES = Object.keys(SCHEMA_REGISTRY) as Array<keyof typeof SCHEMA_REGISTRY>;

describe('schemas: defaults round-trip', () => {
  it.each(ELEMENT_TYPES)('%s: parse({}) → JSON → parse is byte-identical', (type) => {
    const schema = SCHEMA_REGISTRY[type];
    const first = schema.parse({});
    const json1 = JSON.stringify(first);
    const second = schema.parse(JSON.parse(json1));
    const json2 = JSON.stringify(second);
    // Defaults include a freshly-generated id; pin both objects to the same id
    // so the byte comparison is meaningful.
    expect(json2).toBe(json1);
  });

  it.each(ELEMENT_TYPES)('%s: parse({}) yields a typed brand on `id`', (type) => {
    const schema = SCHEMA_REGISTRY[type];
    const node = schema.parse({}) as { id: string; type: string };
    expect(node.id).toMatch(new RegExp(`^${type}_[0-9A-HJKMNP-TV-Z]{26}$`));
    expect(node.type).toBe(type);
  });
});

describe('schemas: PRYZM 1 fixture round-trip', () => {
  if (!existsSync(FIXTURES_DIR)) {
    it.skip('no fixtures directory present', () => {});
    return;
  }

  const fixtureFiles: Array<[keyof typeof SCHEMA_REGISTRY, string]> = [];
  for (const elementType of ELEMENT_TYPES) {
    const dir = join(FIXTURES_DIR, elementType);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (file.endsWith('.json')) fixtureFiles.push([elementType, join(dir, file)]);
    }
  }

  if (fixtureFiles.length === 0) {
    it.skip('no fixtures to validate', () => {});
    return;
  }

  it.each(fixtureFiles)('%s fixture %s validates and round-trips', (type, path) => {
    const schema = SCHEMA_REGISTRY[type];
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    const parsed = schema.parse(raw);
    const json1 = JSON.stringify(parsed);
    const reparsed = schema.parse(JSON.parse(json1));
    const json2 = JSON.stringify(reparsed);
    expect(json2).toBe(json1);
  });
});

describe('schemas: refinement edge cases', () => {
  it('Wall rejects baseLine endpoints closer than 0.05 m', () => {
    const r = SCHEMA_REGISTRY.wall.safeParse({
      baseLine: [
        { x: 0, y: 0, z: 0 },
        { x: 0.01, y: 0, z: 0 },
      ],
    });
    expect(r.success).toBe(false);
  });

  it('Grid rejects arc lines without a radius', () => {
    const r = SCHEMA_REGISTRY.grid.safeParse({
      lines: [
        {
          id: 'l1',
          label: 'A',
          kind: 'arc',
          start: { x: 0, y: 0, z: 0 },
          end: { x: 1, y: 0, z: 0 },
        },
      ],
    });
    expect(r.success).toBe(false);
  });

  it('Sheet rejects CUSTOM size without customSize', () => {
    const r = SCHEMA_REGISTRY.sheet.safeParse({ size: 'CUSTOM' });
    expect(r.success).toBe(false);
  });

  it('Dimension rejects linear with fewer than 2 points', () => {
    const r = SCHEMA_REGISTRY.dimension.safeParse({
      kind: 'linear',
      points: [{ x: 0, y: 0, z: 0 }],
    });
    expect(r.success).toBe(false);
  });

  it('Dimension rejects angular with fewer than 3 points', () => {
    const r = SCHEMA_REGISTRY.dimension.safeParse({
      kind: 'angular',
      points: [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
      ],
    });
    expect(r.success).toBe(false);
  });

  it('Dimension accepts spot-elevation with a single point (fall-through branch)', () => {
    const r = SCHEMA_REGISTRY.dimension.safeParse({
      kind: 'spot-elevation',
      points: [{ x: 0, y: 0, z: 0 }],
    });
    expect(r.success).toBe(true);
  });

  it('Wall rejects baseLine endpoints with inconsistent y values', () => {
    const r = SCHEMA_REGISTRY.wall.safeParse({
      baseLine: [
        { x: 0, y: 0, z: 0 },
        { x: 3, y: 0.5, z: 0 },
      ],
    });
    expect(r.success).toBe(false);
  });

  it('Wall rejects an opening whose elementId is missing from childrenIds', () => {
    const r = SCHEMA_REGISTRY.wall.safeParse({
      childrenIds: [],
      openings: [
        {
          id: 'op-1',
          type: 'door',
          offset: 1,
          width: 0.9,
          height: 2.1,
          sillHeight: 0,
          elementId: 'door_01H8XK3J7M9N2P4QR5STVW6XYZ',
        },
      ],
    });
    expect(r.success).toBe(false);
  });

  it('Project rejects duplicate level ids', () => {
    const r = SCHEMA_REGISTRY.project.safeParse({
      levels: [
        { id: 'L1', name: 'L1', elevation: 0, height: 3 },
        { id: 'L1', name: 'L1 again', elevation: 3, height: 3 },
      ],
    });
    expect(r.success).toBe(false);
  });

  it('Roof rejects pitch ≥ π/2', () => {
    const r = SCHEMA_REGISTRY.roof.safeParse({ pitch: Math.PI / 2 });
    expect(r.success).toBe(false);
  });

  it('Furniture rejects scale ≤ 0', () => {
    const r = SCHEMA_REGISTRY.furniture.safeParse({ scale: 0 });
    expect(r.success).toBe(false);
  });
});
