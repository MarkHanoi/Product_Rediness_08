// Grid intent helpers — S12-T4.
//
// Generates a rectangular grid (linear lines on both axes, X axes
// labelled 1, 2, 3 …; Y axes labelled A, B, C …) from a spacing +
// count + extent specification.  Used by both the placement tool and
// the SetGridSpacing handler.

import type { GridData } from './store.js';

export interface RectGridSpec {
  /** Spacing between consecutive X-axis lines (metres). */
  readonly spacingX: number;
  /** Spacing between consecutive Y-axis lines (metres). */
  readonly spacingZ: number;
  /** Number of X-axis lines (≥ 1). */
  readonly countX: number;
  /** Number of Y-axis lines (≥ 1). */
  readonly countZ: number;
  /** Length of each line (metres). */
  readonly extent: number;
  /** World origin of the grid (defaults to {0,0,0}). */
  readonly origin?: { x: number; y: number; z: number };
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function letterLabel(n: number): string {
  // 0→A, 1→B, …, 25→Z, 26→AA, 27→AB …
  let s = '';
  let i = n;
  do {
    s = ALPHABET[i % 26]! + s;
    i = Math.floor(i / 26) - 1;
  } while (i >= 0);
  return s;
}

/** Produces a deterministic `lines[]` array for the rectangular spec. */
export function generateRectGridLines(spec: RectGridSpec): GridData['lines'] {
  const ox = spec.origin?.x ?? 0;
  const oy = spec.origin?.y ?? 0;
  const oz = spec.origin?.z ?? 0;
  const lines: GridData['lines'] = [];
  // X axes: parallel to Z, indexed 1, 2, 3 … along +X.
  for (let i = 0; i < spec.countX; i++) {
    const x = ox + i * spec.spacingX;
    lines.push({
      id: `x-${i + 1}`,
      label: String(i + 1),
      kind: 'linear',
      start: { x, y: oy, z: oz },
      end: { x, y: oy, z: oz + spec.extent },
    });
  }
  // Y axes: parallel to X, indexed A, B, C … along +Z.
  for (let j = 0; j < spec.countZ; j++) {
    const z = oz + j * spec.spacingZ;
    lines.push({
      id: `y-${letterLabel(j)}`,
      label: letterLabel(j),
      kind: 'linear',
      start: { x: ox, y: oy, z },
      end: { x: ox + spec.extent, y: oy, z },
    });
  }
  return lines;
}

export function validateRectGridSpec(spec: Partial<RectGridSpec>): { ok: boolean; reason?: string } {
  if (!Number.isFinite(spec.spacingX) || (spec.spacingX as number) <= 0) {
    return { ok: false, reason: 'spacingX must be > 0' };
  }
  if (!Number.isFinite(spec.spacingZ) || (spec.spacingZ as number) <= 0) {
    return { ok: false, reason: 'spacingZ must be > 0' };
  }
  if (!Number.isInteger(spec.countX) || (spec.countX as number) < 1) {
    return { ok: false, reason: 'countX must be a positive integer' };
  }
  if (!Number.isInteger(spec.countZ) || (spec.countZ as number) < 1) {
    return { ok: false, reason: 'countZ must be a positive integer' };
  }
  if (!Number.isFinite(spec.extent) || (spec.extent as number) <= 0) {
    return { ok: false, reason: 'extent must be > 0' };
  }
  return { ok: true };
}
