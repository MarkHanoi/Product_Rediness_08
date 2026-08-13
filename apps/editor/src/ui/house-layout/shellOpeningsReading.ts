// apps/editor — the honest shell-wall openings reading (§GR-10 · C75 §1.4 ·
// C78 §1.4/§8.1 · C71 §4.4).
//
// THE DEFECT THIS ENDS. Both analyseActiveShell twins (HouseLayoutController /
// HouseLayoutExecutor) read `(w.openings ?? [])` twice per exterior wall:
//   · `windowCountByWall[w.id] = (...).filter(window).length` — a wall whose
//     opening set was NEVER RECORDED entered the generator as "zero windows",
//     so the engine's daylight/window allocation treated an unmeasured façade
//     as a blank one;
//   · `(...).some(door)` — the entrance-wall detection could not SEE a
//     hand-placed front door on an unrecorded wall, silently falling through
//     to `walls[0]` (the known "generator ignores the hand-placed front door"
//     failure shape).
// Both are DECLARED HALF-FIXES at the seam: ShellAnalysis's input types
// (`windowCountByWall: Record<string, number>`, out of this lane in ai-host)
// cannot carry "unknown", so the unknown travels BESIDE the analysis — the
// caller collects the unrecorded wall ids and console.warns them by name.
//
// PURE; vocabulary through the shared seam, never restated.

import { relationshipArrayOrUnknown } from '../relationshipDetermination.js';

/** One wall's openings, read honestly. `null` = the set was never recorded. */
export interface ShellOpeningsReading {
  /** Window count, or null when the opening set is UNRECORDED (never a forged 0). */
  readonly windowCount: number | null;
  /** Whether the wall hosts a door, or null when unrecorded (never a forged false). */
  readonly hasDoor: boolean | null;
}

interface OpeningLike { type?: string }

/** The honest replacement for both `(w.openings ?? [])` reads. */
export function readShellWallOpenings(openings: unknown): ShellOpeningsReading {
  const known = relationshipArrayOrUnknown<OpeningLike>(openings);
  if (known === null) return { windowCount: null, hasDoor: null };
  return {
    windowCount: known.filter((o) => o?.type === 'window').length,
    hasDoor: known.some((o) => o?.type === 'door'),
  };
}

/** The shared console.warn for a shell pass that met unrecorded walls. */
export function warnShellOpeningsUnrecorded(tag: string, wallIds: readonly string[]): void {
  if (wallIds.length === 0) return;
  console.warn(
    `${tag} §GR-10 the opening sets of ${wallIds.length} exterior wall(s) ` +
      `[${wallIds.join(', ')}] were never recorded (RELATIONSHIP_NOT_RECORDED): their window ` +
      `counts and door-hosted status are UNKNOWN, not zero/none — entrance detection and ` +
      `window allocation are under-determined for those walls (C75 §1.4).`,
  );
}
