// producePlumbing — plumbing run primitives (S26 / ADR-0023).
//
// Sub-types:
//   - `straight` — single horizontal cylinder of `length` along +X (rotated by `rotation`).
//   - `elbow`    — two short cylinder arms meeting at the origin (90° in XZ plane).
//                  First arm runs along +X for `length` metres; second along +Z.
//                  The S26 implementation does NOT model the curved bend itself
//                  — it joins two straight arms at the origin (the `bendRadius`
//                  is carried for downstream renderers but does not affect the
//                  S26 geometry).  Curved bends land in S27 with the routing
//                  pipework producer.
//   - `tee`      — three short cylinder arms meeting at the origin: ±X and +Z.
//
// All output is in world coordinates; pure TS, no THREE.

import type { Plumbing } from '@pryzm/protocol';
import type { BufferGeometryDescriptor } from '../types/BufferGeometryDescriptor.js';
import type { JoinData } from '../types/JoinData.js';
import { concatRaw, type RawGroup } from './_internal/rawGeometry.js';
import { serializeDescriptor } from './_internal/serializeDescriptor.js';
import {
  buildLinearExtrusion,
  type StructuralProfile,
} from './_shared/linear-structural.js';
import { asMaterialKey } from '../types/MaterialKey.js';
// ⭐ C100 §9.6.a / S16 — THE resolution authority. Not re-implemented here.
import { resolveMaterialColorSlot } from './_internal/composeMaterialKey.js';
import {
  composePlumbingGeometryHash,
  PLUMBING_HASH_SCHEMA_VERSION,
} from './_internal/composePlumbingGeometryHash.js';

export type PlumbingProducer = (
  p: Readonly<Plumbing>,
  joinData: Readonly<JoinData>,
  worldY: number,
) => BufferGeometryDescriptor;

const SYSTEM_COLORS: Record<string, string> = {
  'cold-water':   '#4a9bd1',
  'hot-water':    '#d14a4a',
  'waste':        '#5b4a3a',
  'vent':         '#9aa3b0',
  'gas':          '#d1a44a',
};
const FALLBACK_COLOR = '#7a8392';

/**
 * Material key shape:
 *   `plumbing|<kind>|<systemTag>|<color>|<materialId>|body`
 *
 * ─── ⛔ THE DEFECT THIS CLOSES (C100 §2.1 / L-1127 S16) ─────────────────────
 *
 * `materialId` has sat in slot 4 since this key was written and nothing has ever
 * read it — `colorOfPlumbingMaterialKey` returns slot 3, and slot 3 was always
 * `SYSTEM_COLORS[p.systemTag]`. So a run named `metal-copper` and a run named
 * `plastic-pvc` on the same service painted IDENTICALLY, because the only thing
 * consulted was the service tag.
 *
 * ⚠ THE SERVICE COLOUR IS NOT A BUG AND IS NOT BEING REMOVED. Blue for cold water
 * and red for hot is a real engineering convention and it is the right answer for
 * a run that names no material. It is a FAMILY DEFAULT, though — derived from the
 * tag, never authored — and C100 §2.1 ranks an explicit `materialId` above a
 * default. So the ladder is: the master's colour when a material is named; else
 * the service colour, exactly as before; else the fallback.
 *
 * ⭐ NOTHING REPAINTS (§9.6.b), by construction rather than by hope: a `materialId`
 * did nothing at all before today, so only a run that names one can move — and the
 * runtime `PlumbingTypes.ts` record cannot even carry one yet (the gate's ARM F).
 *
 * ⚠ THE KEY SHAPE IS UNCHANGED — same six slots, same indices, same order. Unlike
 * furniture (no colour slot at all) and lighting (a colour slot holding a DIFFERENT
 * quantity), plumbing already had the right slot in the right place being filled
 * from the wrong source. Converge the VALUE, not the FORMAT (§9.6.b).
 */
export function composePlumbingMaterialKey(p: Plumbing): string {
  // ⭐ ONE ladder (C100 §9.6.a): the master when a material is named, the service
  // colour when not, and `unresolved:<id>` — painted MAGENTA by the bridge (§5) —
  // when the id names nothing at all.
  const color = resolveMaterialColorSlot(
    { materialId: p.materialId },
    SYSTEM_COLORS[p.systemTag] ?? FALLBACK_COLOR,
  );
  return `plumbing|${p.kind}|${p.systemTag}|${color}|${p.materialId ?? ''}|body`;
}

interface Vec3 { x: number; y: number; z: number }

function rotateXZ(p: Vec3, c: number, s: number, anchor: Vec3): Vec3 {
  const dx = p.x - anchor.x;
  const dz = p.z - anchor.z;
  return {
    x: anchor.x + dx * c - dz * s,
    y: p.y,
    z: anchor.z + dx * s + dz * c,
  };
}

export const producePlumbing: PlumbingProducer = (p, _joinData, worldY) => {
  const profile: StructuralProfile = {
    shape: 'circular',
    width: p.diameter,
    depth: p.diameter,
  };
  const key = asMaterialKey(composePlumbingMaterialKey(p));
  const baseY = worldY + p.baseOffset + p.origin.y;
  const o: Vec3 = { x: p.origin.x, y: baseY, z: p.origin.z };
  const c = Math.cos(p.rotation);
  const s = Math.sin(p.rotation);

  const armEnds: Vec3[] = [];
  if (p.kind === 'straight') {
    armEnds.push({ x: o.x + p.length, y: o.y, z: o.z });
  } else if (p.kind === 'elbow') {
    armEnds.push({ x: o.x + p.length, y: o.y, z: o.z });
    armEnds.push({ x: o.x,            y: o.y, z: o.z + p.length });
  } else {
    // tee
    armEnds.push({ x: o.x + p.length, y: o.y, z: o.z });
    armEnds.push({ x: o.x - p.length, y: o.y, z: o.z });
    armEnds.push({ x: o.x,            y: o.y, z: o.z + p.length });
  }

  const allParts: RawGroup[] = [];
  for (const rawEnd of armEnds) {
    const end = rotateXZ(rawEnd, c, s, o);
    const parts = buildLinearExtrusion(
      profile,
      { start: o, end, rotation: 0 },
      key,
    );
    for (const g of parts) allParts.push(g);
  }

  const concat = concatRaw(allParts);
  return serializeDescriptor(concat, composePlumbingGeometryHash(p, worldY));
};

export { PLUMBING_HASH_SCHEMA_VERSION };
