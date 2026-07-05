import { describe, it, expect } from 'vitest';
import { ProjectOrigin } from '../src/elements/ProjectOrigin.js';
import { SCHEMA_REGISTRY } from '../src/registry.js';

describe('§FEAT-PROJECT-ORIGIN (L-109) — ProjectOrigin schema', () => {
  it('parse({}) yields a singleton at world origin, visible by default', () => {
    const o = ProjectOrigin.parse({});
    expect(o.type).toBe('projectOrigin');
    expect(o.id).toMatch(/^projectOrigin_[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(o.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(o.visible).toBe(true);
    expect(o.label).toBe('Project Base Point');
  });

  it('is registered in SCHEMA_REGISTRY under the projectOrigin key', () => {
    expect(SCHEMA_REGISTRY.projectOrigin).toBe(ProjectOrigin);
  });

  it('accepts an edited datum position (the shared-coordinate origin is editable)', () => {
    const o = ProjectOrigin.parse({ position: { x: 12.5, y: 0, z: -4 }, visible: false });
    expect(o.position).toEqual({ x: 12.5, y: 0, z: -4 });
    expect(o.visible).toBe(false);
  });

  it('round-trips byte-identically (parse → JSON → parse)', () => {
    const first = ProjectOrigin.parse({ position: { x: 3, y: 0, z: 3 } });
    const json1 = JSON.stringify(first);
    const json2 = JSON.stringify(ProjectOrigin.parse(JSON.parse(json1)));
    expect(json2).toBe(json1);
  });
});
