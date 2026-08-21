// §GA-EDITORIAL-LAYER (L-1620) — THE GA PLATE, as a deterministic fixture.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY A NEW FIXTURE, AND WHY THIS SHAPE
// ─────────────────────────────────────────────────────────────────────────────
// SPEC-AUTODIMENSION §12 is an acceptance standard for a DRAWING. It cannot be asserted
// at a function return, and it cannot be asserted on the existing rectangle / L-plan
// fixtures: those satisfy §12.3 BY LUCK, because they have no interior partitions to
// over-dimension. Every §12.3 assertion made against them would pass while the founder's
// real plate stayed unreadable — which is the failure mode SPEC §13 records.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE TOPOLOGY IS COPIED FROM THE SHIPPED GENERATORS, NOT INVENTED
// ─────────────────────────────────────────────────────────────────────────────
//   • SHELL — one WHOLE wall per footprint edge, joined corner to corner, and NEVER cut
//     where a partition meets it. `ResidentialBuildingExecutor._buildShellPerimeter`;
//     `weldPartitionsToShell` welds a partition onto the shell CENTRELINE and leaves the
//     shell wall intact ("the shell walls are NOT moved — they are the authoritative
//     perimeter").
//   • INTERIOR — a connected partition network that touches the shell only by coordinate
//     coincidence, never by a shared endpoint. That is the whole mechanism behind the
//     founder's screenshot: the network is its own CONNECTED COMPONENT with its own
//     closed face, so L-268's "one outer face per connected component" — correct for two
//     buildings on a site — called it A BUILDING and dimensioned it in full, inside the
//     shell.
//
// The plate also carries the three features §12.4 governs and §13 gap 8 recorded as
// UNVERIFIED: two ANGLED façades, a tessellated CURVED BAY, and a STAIR core.
//
// PURE + deterministic: literals in, a total-ordered array out.

export interface FixtureOpening {
  readonly id: string;
  readonly kind: 'door' | 'window';
  readonly offset: number;
  readonly width: number;
}

export interface FixtureWall {
  readonly id: string;
  readonly a: { x: number; z: number };
  readonly b: { x: number; z: number };
  readonly thickness: number;
  readonly role: 'shell' | 'cell';
  readonly openings: readonly FixtureOpening[];
}

type Pt = { x: number; z: number };

/**
 * The shell ring. `S1→S2` and `S8→S9` are ANGLED façades; `S4…S8` is a curved bay
 * tessellated to four chords (§12.4's "radius if curved" case).
 */
const SHELL: readonly Pt[] = [
  { x: 0, z: 0 },      // S0
  { x: 6, z: 0 },      // S1
  { x: 10, z: -2 },    // S2  ← angled façade A
  { x: 18, z: -2 },    // S3
  { x: 18, z: 4 },     // S4  ┐
  { x: 19.2, z: 5 },   // S5  │
  { x: 19.6, z: 6 },   // S6  ├ curved bay, tessellated
  { x: 19.2, z: 7 },   // S7  │
  { x: 18, z: 8 },     // S8  ┘
  { x: 14, z: 12 },    // S9  ← angled façade B
  { x: 0, z: 12 },     // S10
];

/** Exterior openings — these MUST survive §12.3 (they are §12.2 string-3 content). */
const SHELL_OPENINGS: Readonly<Record<number, readonly FixtureOpening[]>> = {
  0: [
    { id: 'win_S0_a', kind: 'window', offset: 1.5, width: 1.8 },
    { id: 'door_main', kind: 'door', offset: 4.2, width: 1.0 },
  ],
  3: [{ id: 'win_S3_a', kind: 'window', offset: 2.0, width: 1.5 }],
  9: [
    { id: 'win_S9_a', kind: 'window', offset: 3.0, width: 2.0 },
    { id: 'win_S9_b', kind: 'window', offset: 8.0, width: 2.0 },
  ],
  10: [{ id: 'win_S10_a', kind: 'window', offset: 4.0, width: 1.2 }],
};

/**
 * The interior partition network, before planarisation. Splitting it at every crossing
 * (below) yields TWELVE enclosed rooms whose sizes span §12.3's whole decision surface —
 * because a fixture where every room falls on the same side of the rule proves nothing:
 *
 *   r01…r05  ~3.4 × 4.4  — ordinary rooms. §12.3: NOTHING. ("avoid … every room edge")
 *   r06…r08  ~3.0 × 5.2  — ordinary rooms. §12.3: NOTHING.
 *   rL       L-shaped    — ordinary room.  §12.3: NOTHING.
 *   corridor 17.1 × 1.7  — long and thin → §12.3 "corridor widths": the WIDTH only.
 *   stair    1.2 × 5.2   — 1.2 m ≤ clearance → §12.3 "stair widths": the WIDTH only.
 *   wc       1.2 × 1.8   — 2.16 m² service room → §12.3 "bathroom layouts": BOTH axes.
 *
 * Expected §12.3 outcome: FOUR interior dimensions on a twelve-room plate.
 */
const INTERIOR: readonly { id: string; a: Pt; b: Pt }[] = [
  // Band dividers. The top band stops at x = 13.0 because ANGLED FAÇADE B cuts the plate
  // back to x = 14.4 at z = 11.6 — the interior network must sit wholly inside the shell
  // or `classifyEnclosures` is right to call it a second BUILDING rather than a room.
  { id: 'p_h_s', a: { x: 0.3, z: 0.3 }, b: { x: 17.4, z: 0.3 } },
  { id: 'p_h_c1', a: { x: 0.3, z: 4.7 }, b: { x: 17.4, z: 4.7 } },
  { id: 'p_h_c2', a: { x: 0.3, z: 6.4 }, b: { x: 17.4, z: 6.4 } },
  { id: 'p_h_n', a: { x: 0.3, z: 11.6 }, b: { x: 13.0, z: 11.6 } },
  { id: 'p_h_wc', a: { x: 11.8, z: 8.2 }, b: { x: 13.0, z: 8.2 } },
  // Network edges + cross walls.
  { id: 'p_v_w', a: { x: 0.3, z: 0.3 }, b: { x: 0.3, z: 11.6 } },
  { id: 'p_v_e', a: { x: 17.4, z: 0.3 }, b: { x: 17.4, z: 6.4 } },
  { id: 'p_v_te', a: { x: 13.0, z: 6.4 }, b: { x: 13.0, z: 11.6 } },
  { id: 'p_v_b1', a: { x: 3.7, z: 0.3 }, b: { x: 3.7, z: 4.7 } },
  { id: 'p_v_b2', a: { x: 7.1, z: 0.3 }, b: { x: 7.1, z: 4.7 } },
  { id: 'p_v_b3', a: { x: 10.5, z: 0.3 }, b: { x: 10.5, z: 4.7 } },
  { id: 'p_v_b4', a: { x: 13.9, z: 0.3 }, b: { x: 13.9, z: 4.7 } },
  { id: 'p_v_stair', a: { x: 1.5, z: 6.4 }, b: { x: 1.5, z: 11.6 } },
  { id: 'p_v_t1', a: { x: 4.4, z: 6.4 }, b: { x: 4.4, z: 11.6 } },
  { id: 'p_v_t2', a: { x: 7.3, z: 6.4 }, b: { x: 7.3, z: 11.6 } },
  { id: 'p_v_t3', a: { x: 10.0, z: 6.4 }, b: { x: 10.0, z: 11.6 } },
  { id: 'p_v_wc', a: { x: 11.8, z: 6.4 }, b: { x: 11.8, z: 8.2 } },
];

/** The twelve rooms, for per-room assertions. */
export const GA_PLATE_ROOMS: readonly { id: string; x0: number; x1: number; z0: number; z1: number }[] = [
  { id: 'r01', x0: 0.3, x1: 3.7, z0: 0.3, z1: 4.7 },
  { id: 'r02', x0: 3.7, x1: 7.1, z0: 0.3, z1: 4.7 },
  { id: 'r03', x0: 7.1, x1: 10.5, z0: 0.3, z1: 4.7 },
  { id: 'r04', x0: 10.5, x1: 13.9, z0: 0.3, z1: 4.7 },
  { id: 'r05', x0: 13.9, x1: 17.4, z0: 0.3, z1: 4.7 },
  { id: 'corridor', x0: 0.3, x1: 17.4, z0: 4.7, z1: 6.4 },
  { id: 'stair', x0: 0.3, x1: 1.5, z0: 6.4, z1: 11.6 },
  { id: 'r06', x0: 1.5, x1: 4.4, z0: 6.4, z1: 11.6 },
  { id: 'r07', x0: 4.4, x1: 7.3, z0: 6.4, z1: 11.6 },
  { id: 'r08', x0: 7.3, x1: 10.0, z0: 6.4, z1: 11.6 },
  { id: 'wc', x0: 11.8, x1: 13.0, z0: 6.4, z1: 8.2 },
  { id: 'rL', x0: 10.0, x1: 13.0, z0: 6.4, z1: 11.6 },
];

const SHELL_THICKNESS_M = 0.30;
const PARTITION_THICKNESS_M = 0.10;
const EPS = 1e-9;

/** Parameter of `p` along `a→b` when `p` lies strictly inside it; else null. */
function interiorParam(p: Pt, a: Pt, b: Pt): number | null {
  const dx = b.x - a.x, dz = b.z - a.z;
  const L2 = dx * dx + dz * dz;
  if (L2 < EPS) return null;
  const t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / L2;
  if (t <= 1e-9 || t >= 1 - 1e-9) return null;
  if (Math.hypot(a.x + dx * t - p.x, a.z + dz * t - p.z) > 1e-6) return null;
  return t;
}

/**
 * The plate's walls, in a total order (id) so the fixture is byte-stable.
 *
 * The interior network is PLANARISED — every partition is split where another partition
 * meets it — because that is what the generators' junction weld produces among interior
 * walls (`repairSegments` welds coincident endpoints to a single mean point). The SHELL is
 * deliberately NOT split: the interior touches it only by coincidence, which is the
 * defect's mechanism.
 */
export function gaPlateWalls(): FixtureWall[] {
  const out: FixtureWall[] = [];

  for (let i = 0; i < SHELL.length; i++) {
    out.push({
      id: `shell_${String(i).padStart(2, '0')}`,
      a: SHELL[i]!,
      b: SHELL[(i + 1) % SHELL.length]!,
      thickness: SHELL_THICKNESS_M,
      role: 'shell',
      openings: SHELL_OPENINGS[i] ?? [],
    });
  }

  // Every crossing / T-foot among the interior segments becomes a shared node.
  const cutPoints: Pt[] = [];
  for (const s of INTERIOR) {
    cutPoints.push(s.a, s.b);
    for (const t of INTERIOR) {
      if (t.id === s.id) continue;
      // Axis-aligned crossing of a horizontal and a vertical.
      const sh = Math.abs(s.a.z - s.b.z) < EPS;
      const th = Math.abs(t.a.z - t.b.z) < EPS;
      if (sh === th) continue;
      const h = sh ? s : t;
      const v = sh ? t : s;
      cutPoints.push({ x: v.a.x, z: h.a.z });
    }
  }

  let doorSeq = 0;
  for (const s of INTERIOR) {
    const ts = [0, 1];
    for (const p of cutPoints) {
      const t = interiorParam(p, s.a, s.b);
      if (t !== null && !ts.some((u) => Math.abs(u - t) < 1e-9)) ts.push(t);
    }
    ts.sort((x, y) => x - y);
    for (let k = 0; k + 1 < ts.length; k++) {
      const at = (t: number): Pt => ({
        x: s.a.x + (s.b.x - s.a.x) * t,
        z: s.a.z + (s.b.z - s.a.z) * t,
      });
      const a = at(ts[k]!), b = at(ts[k + 1]!);
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      // One interior door per corridor-facing segment. §12.3 leaves interior openings
      // un-dimensioned (a GA locates them by tag + schedule, not by a dimension) — the
      // fixture carries them so that decision is ASSERTED rather than assumed.
      const onCorridorWall = (s.id === 'p_h_c1' || s.id === 'p_h_c2') && len > 1.5;
      out.push({
        id: ts.length === 2 ? s.id : `${s.id}#${k}`,
        a, b,
        thickness: PARTITION_THICKNESS_M,
        role: 'cell',
        openings: onCorridorWall
          ? [{
            id: `door_int_${String(++doorSeq).padStart(2, '0')}`,
            kind: 'door' as const,
            offset: len / 2 - 0.45,
            width: 0.9,
          }]
          : [],
      });
    }
  }

  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}

/** The shell footprint polygon — for "is this dimension line inside the building?". */
export function gaPlateShellPolygon(): readonly Pt[] {
  return SHELL;
}

export function gaPlateRooms(): typeof GA_PLATE_ROOMS {
  return GA_PLATE_ROOMS;
}
