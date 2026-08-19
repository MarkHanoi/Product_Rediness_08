// §L-1057 / C87 CW-B-2 — THE DOOR PANEL IS NOT LOST AT THE BRIDGE. IT IS NEVER SAVED.
//
// ─── WHAT C87 SAYS, AND WHY IT AIMS AT THE WRONG HOP ──────────────────────────
// C87 CW-B-2 is the family's headline: "a curtain wall the user authored with a
// door panel MUST render, export and reload with a door panel." Its §5 rows 15/15a-f
// diagnose the loss at the CREATE BRIDGE — the L0 `panels[]` array crosses the
// CommandEventBridge and is dropped at `curtainWallCreatedMirror.ts` because the
// legacy `CurtainWallData` has no `panels` field to receive it.
//
// That drop is real. It is not why a door panel comes back as glass, because
// `panels[]` on the CREATE payload is not where an authored panel lives. C87 §2
// names the authority itself: "`CurtainPanelStore` (representation 4) is the
// AUTHORITY for the panels." A user authoring a door panel writes THERE — via
// `ReplacePanelTypeCommand` / `ReplacePanelWithDoorCommand` — not into a create
// payload.
//
// ─── THE MEASUREMENT (2026-08-19) ────────────────────────────────────────────
// THE AUTHORITY FOR PANELS IS NEVER PERSISTED AND NEVER LOADED.
//
//   grep -in "curtainpanel\|curtainPanelStore" \
//     apps/editor/src/engine/persistence/ProjectSerializer.ts \
//     apps/editor/src/engine/persistence/ProjectLoader.ts
//   -> ZERO matches in BOTH.        (the LIVE pair; C87 header names it as live)
//
// It is not a spelling artefact: the `ProjectStores` interface the serializer
// destructures (`ProjectSerializer.ts:804`, consumed `:1017-1024`) has no
// curtain-panel member at all, so there is no store for it to read even if a
// branch existed.
//
// This is C84 EI-6 — "silent non-persistence is the most severe defect this
// contract governs: the user's work is destroyed with no error" — the identical
// shape as `lighting` (C84 §1 defect #2), for a SECOND family. And it is invisible
// in C84 §4, whose curtain-wall EI-6 cell reads a flat `✅ persists`: the WALL
// persists, and a whole authority store beneath it does not.
//
// ─── WHY THE USER SEES GLAZING RATHER THAN AN EMPTY WALL ─────────────────────
// Because the panels are silently REGENERATED. `ProjectLoader` re-adds each wall
// through `CreateCurtainWallCommand`; `CurtainWallStore.add()` synchronously drives
// `CurtainPanelSyncHandler`; that handler finds no existing panel for any cell and
// mints every one as `panelType: 'SystemPanel_Glass'` (`CurtainPanelSyncHandler.ts:129`).
// So the reload produces a full, plausible, uniformly-glazed façade — which is
// exactly why nobody noticed. A wall that came back EMPTY would have been reported
// years ago.
//
// That is also the sharpest thing this test can pin, and what it pins below: the
// regeneration is not a fallback for missing data, it is indistinguishable from
// correct output.
//
// ⚠ WHAT THIS FILE DOES AND DOES NOT RUN.
//   REAL   — `CurtainWallStore`, `CurtainPanelStore`, `CurtainPanelSyncHandler`,
//            all three as production constructs them (`initBuilders.ts:328,:331`).
//   NOT RUN — `ProjectSerializer.serialize()` itself. Calling it needs ~22 live
//            stores; the serializer half is established by the grep above, which is
//            a total absence and therefore not a sampling claim. The half that
//            NEEDS executing — that a reload regenerates glass over authored
//            panels — is executed here.

import { describe, expect, it, beforeEach } from 'vitest';
import { CurtainWallStore } from '../src/CurtainWallStore';
import { CurtainPanelStore } from '../src/CurtainPanelStore';
import { CurtainPanelSyncHandler } from '../src/CurtainPanelSyncHandler';
import type { CurtainWallData } from '../src/CurtainWallTypes';

const CW_ID = 'cw-facade';

function makeWall(): CurtainWallData {
  return {
    id: CW_ID,
    type: 'curtain-wall',
    levelId: 'L0',
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
    height: 3,
    baseOffset: 0,
    gridXSpacing: 1.5,
    gridYSpacing: 1.5,
    mullionSize: 0.05,
    panelThickness: 0.05,
  } as unknown as CurtainWallData;
}

/** One editing session: fresh stores, sync handler live, wall added. */
function session() {
  const cwStore = new CurtainWallStore();
  const panelStore = new CurtainPanelStore();
  const sync = new CurtainPanelSyncHandler(cwStore, panelStore);
  sync.activate();
  return { cwStore, panelStore, sync };
}

describe('§L-1057 — per-panel authoring does not survive a save/load cycle', () => {
  let first: ReturnType<typeof session>;

  beforeEach(() => {
    first = session();
    first.cwStore.add(makeWall());
  });

  it('the wall renders the panels the user authored, WITHIN the session', () => {
    const panels = first.panelStore.getByCurtainWallId(CW_ID);
    expect(panels.length).toBeGreaterThan(0);

    // Author a DOOR in the bottom-left cell — what `ReplacePanelWithDoorCommand`
    // does, through the same store API it uses.
    const target = first.panelStore.getByCellIndex(CW_ID, 0, 0)!;
    expect(target).toBeDefined();
    first.panelStore.update(target.id, { panelType: 'SystemPanel_Door' });

    expect(first.panelStore.getByCellIndex(CW_ID, 0, 0)!.panelType).toBe('SystemPanel_Door');
  });

  it('THE DEFECT — a reload regenerates it as glazing, and nothing reports the loss', () => {
    const target = first.panelStore.getByCellIndex(CW_ID, 0, 0)!;
    first.panelStore.update(target.id, {
      panelType: 'SystemPanel_Door',
      materialOverride: 'mat-oak-02',
    });

    // ── SAVE ────────────────────────────────────────────────────────────────
    // `ProjectSerializer` reads `curtainWallStore` and NOT `curtainPanelStore`
    // (zero matches, both persistence files). So everything that survives a save
    // is the wall record — and nothing else. Reproduce that exactly: carry the
    // wall, carry no panel.
    const saved = JSON.parse(JSON.stringify(first.cwStore.get(CW_ID))) as CurtainWallData;

    // ── LOAD ────────────────────────────────────────────────────────────────
    // Fresh stores, as after a reload; `ProjectLoader` re-adds the wall, which
    // synchronously drives the sync handler.
    const second = session();
    second.cwStore.add(saved);

    const reloaded = second.panelStore.getByCellIndex(CW_ID, 0, 0)!;
    expect(reloaded).toBeDefined();

    // The door is gone.
    expect(reloaded.panelType).not.toBe('SystemPanel_Door');
    expect(reloaded.panelType).toBe('SystemPanel_Glass');
    expect(reloaded.materialOverride).toBeUndefined();

    // ⚠ AND THE WALL LOOKS FINE. The façade is fully populated with the right
    // cell count — a plausible, uniformly-glazed result, not an empty or broken
    // one. THAT is why this survived: the regeneration is indistinguishable from
    // correct output at every level except the one the user authored.
    expect(second.panelStore.getByCurtainWallId(CW_ID).length)
      .toBe(first.panelStore.getByCurtainWallId(CW_ID).length);
    for (const p of second.panelStore.getByCurtainWallId(CW_ID)) {
      expect(p.panelType).toBe('SystemPanel_Glass');
    }
  });

  it('the same loss hits `hostedDoor` — six configured fields, none of them saved', () => {
    // C87 §11 #7. `hostedDoor` lives ONLY on `CurtainPanelData`
    // (`CurtainPanelTypes.ts:143-145`, shape `:89-105`), i.e. only in the store
    // that is never written. It has no L0 field and no serialiser field, so this
    // is not a second defect — it is the same one, and fixing panel persistence
    // fixes both.
    const target = first.panelStore.getByCellIndex(CW_ID, 0, 0)!;
    first.panelStore.update(target.id, {
      panelType: 'SystemPanel_Door',
      hostedDoor: {
        frameColor: '#402a18',
        leafColor: '#8a5a33',
        hingesSide: 'left',
        swingDirection: 'outward',
        sillHeight: 0.02,
        frameThickness: 0.06,
      } as never,
    });
    expect((first.panelStore.get(target.id) as { hostedDoor?: unknown }).hostedDoor).toBeDefined();

    const saved = JSON.parse(JSON.stringify(first.cwStore.get(CW_ID))) as CurtainWallData;
    // The wall record carries no trace of it — there is no field for it to sit in.
    expect(JSON.stringify(saved)).not.toContain('hingesSide');

    const second = session();
    second.cwStore.add(saved);
    const reloaded = second.panelStore.getByCellIndex(CW_ID, 0, 0)! as { hostedDoor?: unknown };
    expect(reloaded.hostedDoor).toBeUndefined();
  });
});
