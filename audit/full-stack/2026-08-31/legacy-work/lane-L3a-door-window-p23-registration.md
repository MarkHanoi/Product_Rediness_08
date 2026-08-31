# LANE L3a — door/window VDT + bimManager wired in the §P2.3 arm (2026-08-31)

**Brief**: wire the wall §P2.1 / §AXIS-L-W1 registration shape into the `wall.opening.created`
bridge (`apps/editor/src/engine/initTools.ts`, §P2.3 arm) — registration UNCONDITIONAL and
ABOVE the dedup guard, keyed on the opening's ELEMENT id against `_legacyWall?.levelId ?? ''`,
bimManager's empty-levelId throw landed in a NAMED console.error. Evidence base:
`audit/full-stack/2026-08-31/legacy-work/no-registration-families-measurement.md` (L2b),
which measured the shipped arrow at vdt=0 / bim=0 (Probe B Parts 2–3).

## Production change — ONE file

`apps/editor/src/engine/initTools.ts` (§P2.3 arm, tag **§P2.3-REG**):

- `const _legacyWall = …getById(ev.wallId)` hoisted out of the dedup-guard comment block
  (same line, unchanged semantics — the registration needs its `levelId`).
- NEW, between elementId/type resolution and the dedup guard:
  - `viewDependencyTracker.registerElement(elementId, _legacyWall?.levelId ?? '')` in
    try/catch → `console.warn('[initTools] §P2.3-REG VDT.registerElement failed (non-fatal):', err)`.
  - `bimManager.registerElement(elementId, _legacyWall?.levelId ?? '')` in try/catch →
    `console.error('[initTools] §P2.3-REG: bimManager.registerElement FAILED for ' + type,
    elementId, '—', …)` — family + id, never silent (C74 CA-18). The BimKernel.ts:243-268
    throw on empty/unknown levelId lands here and does not escape the handler.
- The dedup guard is UNCHANGED and now explicitly commented as gating the MIRROR WRITES only
  (addOpening + doorStore/windowStore mirrors); the stale "silently skips" header sentence
  was corrected in place.
- Covers BOTH families: `elementId`/`type` are shared by the door and window branches, so one
  registration site serves `type === 'door'` and `type === 'window'` alike.

No ceiling raised, no gate disabled, no gate-debt entry, no rival, no new bridge — the wire
sits inside the EXISTING §P2.3 bridge.

## Proof — extended `apps/editor/__tests__/DuplicateCreateStillRegisters.test.ts`

New `§P2.3-REG door` describe (2 arms), same AST-extraction harness (shipped text, not a copy):

1. **Duplicate delivery**: same `wall.opening.created` event twice → addOpening mirror ×1,
   real `DoorStore` record ×1 (real `buildDoorStoreRecord`, real `generateMark` — deep imports
   dodge the geometry-door barrel's THREE), VDT+bim calls ×2 (both deliveries), keyed
   `['axisL-dup-door-1', 'L1']` (host wall levelId), exactly ONE BIM row. Structural belt:
   registration string sits above BOTH the guard and the addOpening mirror.
2. **Missing host wall**: `getById` → undefined → levelId `''` → bim fake throws
   (BimKernel semantics) → caught; console.error spy records exactly one
   `§P2.3-REG: bimManager.registerElement FAILED for door … axisL-door-2`; no BIM row minted;
   handler does not throw.

Legacy wall store is a recording fake faithful to `WallStore.ts:1199-1326` (addOpening appends
the opening under the same `id` the dedup guard probes); the real WallStore's barrel-mates pull
THREE at module scope and `add()` demands a Zod-valid wall, neither under test.

## Executed transcripts (foreground, `cd apps/editor && npx vitest run __tests__/DuplicateCreateStillRegisters.test.ts`)

- **Control (pre-edit, HEAD tree)**: `Test Files 1 passed · Tests 3 passed (3)` — harness sound.
- **Post-edit GREEN**: `Test Files 1 passed · Tests 5 passed (5)`.
- **Falsification A** — injected
  `if (_legacyWall?.openings?.some((existing: any) => existing.id === id)) return;` ABOVE the
  registration → RED:
  `AssertionError: registration must sit ABOVE the dedup guard (§AXIS-L-W1): expected 2478 to be less than 940`
  · `Tests 1 failed | 4 passed (5)`.
- **Falsification B** (belt-invisible variant, proves the BEHAVIOURAL arm bites) — injected
  `if (_legacyWall && (_legacyWall.openings ?? []).length > 0) return;` → RED:
  `AssertionError: VDT registration must STILL occur on the duplicate delivery: expected 1 to be 2`
  · `Tests 1 failed | 4 passed (5)`.
- **Byte-identical restore**: sha256 of `initTools.ts` BEFORE injection and AFTER restore both
  `1d93402aec235482e8faee0359fc419f3364e71185a8e2145ad727cbbb335777` → rerun GREEN
  `Tests 5 passed (5)`.

## Root tsc

`NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json` at repo root →
**TSC_RC=0** (tree included concurrent sibling-lane edits to stair/plumbing/bathroomPod files —
their state is theirs to report).

## Effect (per the L2b mechanism table)

- Bus-created doors/windows now take the TARGETED per-level VDT path instead of the §G3-STALE
  coarse fallback (warn + ALL non-3D views dirtied on every DoorStore/WindowStore create emit).
- Door/window ids enter `level.childrenIds` on the bus path for the first time (previously only
  the legacy 3D `CreateWallOpeningCommand.ts:182` did this).
- NOT commited by this lane (per brief); NOT browser-verified — proof is at the extracted-closure
  layer, one level below pixels (same bar as the L2b measurement itself).
