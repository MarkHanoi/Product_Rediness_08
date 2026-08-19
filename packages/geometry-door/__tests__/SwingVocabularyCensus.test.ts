// SwingVocabularyCensus — C86 §11 #7, C84 EI-3 / EI-8 / EI-9 / EI-2.
//
// WHAT C86 §11 #7 ASKED FOR, verbatim: "enumerate both vocabularies in one test".
// This does that, and the enumeration REFUTED the row's stated mechanism while
// confirming a real user loss — a sharper defect than the one recorded.
//
// C86 §11 #7 said: "`swing` has 5 members; the legacy record has a 2×2. `'sliding'`
// is unrepresentable", citing `CreateWallOpeningCommand.ts:167-170` as the transform.
// Measured 2026-08-19:
//
//   • `CreateWallOpeningCommand` NEVER READS `swing`. It reads `opening.hingesSide`
//     and `opening.swingDirection` directly (:167-170) — the legacy pair arrives
//     already split, from `DoorPlacementFlip` (`packages/core-app-model/src/preview/
//     DoorPlacementFlip.ts:50-53`, the canonical 4-state table). There was no
//     5-into-2×2 transform at that site at all, so "four of five map" was never what
//     the code did.
//
//   • THE REAL TRANSFORM WAS IN THE UI, AND IT WAS WORSE.
//     `apps/editor/src/ui/property-inspector/PropertyInspectorApply.ts` wrote
//         ctx.wallStore?.updateDoor?.(d.id, { swingDirection: updates.swing });
//     — the `swing` VALUE into the `swingDirection` FIELD. Its own comment claimed
//     this "keeps legacy wallStore in sync (C15 §8.1) using swingDirection — the field
//     name used by the legacy DoorData shape". It matched the FIELD NAME and not the
//     VOCABULARY. The intersection of the two member sets is EMPTY: not "sliding is
//     unrepresentable" but "EVERY swing value is unrepresentable".
//
// Fixed by §L-1040: `mapSwingToLegacy` (`src/DoorSwingVocabulary.ts`) is now the one
// translation, and it REFUSES 'sliding' rather than storing a hinged door for a
// sliding one. C86 WO-Voc-1 remains OWED — the refusal keeps the loss visible, it
// does not close it.
//
// ── WHY PART OF THIS IS A SOURCE-TEXT CENSUS ─────────────────────────────────────
// The vocabularies live in three packages: `@pryzm/schemas` (not a dependency of this
// package), this package, and a UI call site in `apps/editor`. No runtime harness
// spans those three, and a hand-built fake that merged them could not falsify
// anything (C84 EI-10(b): "a fake more capable than the real thing proves nothing").
// Reading the real files is the only measurement that can fail for the real reason.
// The MAPPER itself is exercised for real, not by source text.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import {
  mapSwingToLegacy,
  SWING_TO_LEGACY,
  ALL_DOOR_SWINGS,
  UNREPRESENTABLE_SWINGS,
} from '../src/DoorSwingVocabulary';

/** Walk up to the workspace root so every citation below is repo-relative. */
const REPO = (() => {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 12; i++) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error('[SwingVocabularyCensus] workspace root not found');
})();

const read = (rel: string): string => fs.readFileSync(path.join(REPO, rel), 'utf8');

/** Pull the members out of a `z.enum([...])` that follows `field:` in `src`. */
function enumMembersAfter(src: string, field: string): string[] {
  const at = src.indexOf(field);
  if (at < 0) throw new Error(`[SwingVocabularyCensus] field not found: ${field}`);
  const slice = src.slice(at, at + 400);
  const m = slice.match(/z\.enum\(\s*\[([^\]]*)\]/);
  if (!m) throw new Error(`[SwingVocabularyCensus] no z.enum after: ${field}`);
  return [...m[1]!.matchAll(/'([^']+)'/g)].map((x) => x[1]!);
}

/** The mis-write this lane removed. Kept as a predicate so it is testable. */
const RAW_MISWRITE = 'updateDoor?.(d.id, { swingDirection: updates.swing })';

const DOOR_SCHEMA = 'packages/schemas/src/elements/Door.ts';
const DOOR_TYPES = 'packages/geometry-door/src/DoorTypes.ts';
const FAMILY_REQ = 'packages/schemas/src/family-request/geometry.ts';
const INSPECTOR = 'apps/editor/src/ui/property-inspector/PropertyInspectorApply.ts';

describe('C86 §11 #7 — the swing vocabularies, enumerated from their real sources', () => {
  it('A — THREE vocabularies answer one question, not two (C84 EI-8 / EI-9)', () => {
    // 1. L0 schema — the value the property panel produces and the bus carries.
    const swing = enumMembersAfter(read(DOOR_SCHEMA), 'swing:');
    expect(swing).toEqual(['left-in', 'left-out', 'right-in', 'right-out', 'sliding']);

    // 2. The legacy geometry record — a 2×2 split across two fields.
    const doorTypes = read(DOOR_TYPES);
    expect(enumMembersAfter(doorTypes, 'hingesSide:')).toEqual(['left', 'right']);
    expect(enumMembersAfter(doorTypes, 'swingDirection:')).toEqual(['inward', 'outward']);

    // 3. A THIRD vocabulary on the family-request path that C86 never recorded. It
    //    carries 'sliding' — as a *direction* rather than as a swing — so the concept
    //    the L0 enum cannot round-trip IS expressible elsewhere in the repo, under the
    //    same field name, with a different member set. That is EI-8 exactly.
    expect(enumMembersAfter(read(FAMILY_REQ), 'swingDirection:')).toEqual([
      'inward',
      'outward',
      'sliding',
      'none',
    ]);
  });

  it('B — the two vocabularies share NO member: C86 said 4 of 5 map; 0 of 5 do', () => {
    const swing = enumMembersAfter(read(DOOR_SCHEMA), 'swing:');
    const swingDirection = enumMembersAfter(read(DOOR_TYPES), 'swingDirection:');
    const shared = swing.filter((v) => swingDirection.includes(v));

    expect(
      shared,
      `C86 §11 #7 records "four of five map". Measured, the intersection of ` +
        `Door.swing (${swing.join(', ')}) and DoorOpeningSchema.swingDirection ` +
        `(${swingDirection.join(', ')}) is EMPTY — a direct assignment between them ` +
        `carries nothing, for any input.`,
    ).toEqual([]);
  });

  it('C — the UI no longer assigns a `swing` value to the `swingDirection` field', () => {
    const inspector = read(INSPECTOR);

    // ⛔ THE REGRESSION GUARD. This is the exact text that shipped the defect.
    expect(
      inspector.includes(RAW_MISWRITE),
      'PropertyInspectorApply is assigning Door.swing straight into swingDirection ' +
        'again — the two vocabularies share no member (see B), so this writes an ' +
        'out-of-union value for every input.',
    ).toBe(false);

    // And the replacement is the ONE mapper, not a second inline table (C84 EI-9).
    expect(inspector).toContain('mapSwingToLegacy');
  });

  it('D — NEGATIVE CONTROL: the guard in C genuinely fails on the pre-fix source', () => {
    // C84 EI-10(b) / C16 CA-21 — a guard that has never been observed failing is not
    // evidence. The pre-fix file is read out of git so the RED state is demonstrated
    // rather than asserted. If git is unavailable the test SAYS SO instead of
    // silently passing: failure and emptiness must not be the same value.
    let preFix: string;
    try {
      preFix = execFileSync('git', ['show', `6a6c99b1:${INSPECTOR}`], {
        cwd: REPO,
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
      });
    } catch (err) {
      throw new Error(
        `[SwingVocabularyCensus] could not read the pre-fix source at 6a6c99b1 — the ` +
          `negative control did NOT run and this test proves less than it appears to: ${String(err)}`,
      );
    }

    // The old file contained exactly what C now forbids — so C is a live guard.
    expect(preFix.includes(RAW_MISWRITE)).toBe(true);
    expect(preFix.includes('mapSwingToLegacy')).toBe(false);
  });

  it('E — the mapper carries all four representable swings, exactly', () => {
    for (const swing of ALL_DOOR_SWINGS) {
      if ((UNREPRESENTABLE_SWINGS as readonly string[]).includes(swing)) continue;
      const r = mapSwingToLegacy(swing);
      expect(r.ok, `${swing} must map`).toBe(true);
      if (!r.ok) continue;
      // The mapping is the obvious one, asserted rather than assumed (EI-10(c)).
      const [side, dir] = swing.split('-');
      expect(r.legacy.hingesSide).toBe(side);
      expect(r.legacy.swingDirection).toBe(dir === 'in' ? 'inward' : 'outward');
    }
    expect(Object.keys(SWING_TO_LEGACY).sort()).toEqual([
      'left-in',
      'left-out',
      'right-in',
      'right-out',
    ]);
  });

  it('F — the mapper REFUSES `sliding` with a reason, and never invents a hinge', () => {
    const r = mapSwingToLegacy('sliding');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain('sliding');
    expect(r.reason).toContain('no representation');
    // C16 CA-DOCTRINE-A — the refusal names the mechanism, not just the failure.
    expect(r.reason).toMatch(/hingesSide|swingDirection/);
  });

  it('G — an unknown value and an unrepresentable one get DIFFERENT reasons', () => {
    // Failure and emptiness are the same value unless the code says which. A typo
    // must not read as a capability gap, nor a capability gap as a typo.
    const typo = mapSwingToLegacy('left_in');
    const gap = mapSwingToLegacy('sliding');
    expect(typo.ok).toBe(false);
    expect(gap.ok).toBe(false);
    if (typo.ok || gap.ok) return;
    expect(typo.reason).not.toEqual(gap.reason);
    expect(typo.reason).toContain('is not a member of');
    expect(mapSwingToLegacy(undefined).ok).toBe(false);
  });
});
