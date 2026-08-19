// §L-1053 — THE BINDING BETWEEN THE TWO ENDS OF THE CURTAIN-WALL MATERIAL KEY.
//
// The key format is MINTED in `packages/geometry-kernel/src/producers/_internal/
// curtain-wall/` and PARSED in `plugins/curtain-wall/src/committer/material-bridge.ts`,
// and until this file nothing bound them. Both ends compiled, the parse had a
// total `return 'glazed'` fallback, and so a COMPLETE layout mismatch — the slot
// sitting at index 1 while the parser read index 4 — was indistinguishable from a
// working default for the life of the file. That is C84 EI-9 (one answer per
// question) failing quietly, and EI-10(b) is explicit that reading two files and
// judging them equivalent does not discharge it: the proof has to be EXECUTED.
//
// So this file imports the THREE REAL composers and feeds their real output into
// the real parser. No key literal is transcribed. If either end changes its
// layout, this goes red at the seam instead of shipping as translucent mullions.
//
// ⚠ The import is a relative path across a package boundary. That is deliberate
// and is the point: `@pryzm/geometry-kernel`'s exports map (`package.json`) does
// not expose `producers/_internal/`, and the composers are not re-exported from
// its index — so a specifier import cannot see them, and a copy of the format
// here would be the very transcription this test exists to forbid.

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { composeMullionMaterialKey } from '../../../../packages/geometry-kernel/src/producers/_internal/curtain-wall/buildMullions.js';
import { composeTransomMaterialKey } from '../../../../packages/geometry-kernel/src/producers/_internal/curtain-wall/buildTransoms.js';
import {
  composeCurtainPanelMaterialKey,
  type PanelKind,
} from '../../../../packages/geometry-kernel/src/producers/_internal/curtain-wall/buildPanels.js';
import {
  parseCurtainWallMaterialKey,
  slotOfCurtainWallMaterialKey,
  colorOfCurtainWallMaterialKey,
  __resetCurtainWallMaterialKeyReports,
} from '../../src/committer/material-bridge.js';

const ALL_KINDS: readonly PanelKind[] = ['glazed', 'spandrel', 'door', 'opaque'];

describe('§L-1053 — every key the kernel mints is parsed to the slot it names', () => {
  beforeEach(() => { __resetCurtainWallMaterialKeyReports(); });

  it('mullion keys resolve to the MULLION slot, not to glazing', () => {
    const key = composeMullionMaterialKey(undefined);
    // Pre-fix this read index 4 — the literal 'body' — and returned 'glazed', so
    // every mullion in the scene was built transparent at opacity 0.45.
    expect(slotOfCurtainWallMaterialKey(key)).toBe('mullion');
    expect(colorOfCurtainWallMaterialKey(key)).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('transom keys resolve to the TRANSOM slot', () => {
    expect(slotOfCurtainWallMaterialKey(composeTransomMaterialKey(undefined))).toBe('transom');
  });

  it.each(ALL_KINDS)('a %s panel key resolves to its own slot', (kind) => {
    const key = composeCurtainPanelMaterialKey(kind, undefined);
    expect(slotOfCurtainWallMaterialKey(key)).toBe(kind);
  });

  it('a panel colour is the producer\'s colour, not a second palette\'s', () => {
    // C84 EI-8 — the composer owns the hue. Pre-fix, index 3 held `materialId`,
    // so an absent id fell through to THIS file's `#9bc8e4` while the producer
    // had chosen `#a4cdd9`: two palettes answering one question.
    const key = composeCurtainPanelMaterialKey('spandrel', undefined);
    const producerColour = key.split('|')[4];
    expect(colorOfCurtainWallMaterialKey(key)).toBe(producerColour);
  });

  it('the materialId segment is READ, on both layouts (C87 §11 #9)', () => {
    // The narrow half of C87 §11 #9: "material-bridge.ts never reads parts[2]".
    // Its index differs between the two layouts, which is exactly why an
    // index-based read could not be right for both.
    expect(parseCurtainWallMaterialKey(composeMullionMaterialKey('mat-alu-01'))?.materialId)
      .toBe('mat-alu-01');
    expect(parseCurtainWallMaterialKey(composeCurtainPanelMaterialKey('door', 'mat-oak-02'))?.materialId)
      .toBe('mat-oak-02');
    // …and an absent id is `undefined`, never the empty string the key carries.
    expect(parseCurtainWallMaterialKey(composeMullionMaterialKey(undefined))?.materialId)
      .toBeUndefined();
  });

  it('a materialId that cannot be resolved is DECLARED at the point of loss', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { makeCurtainWallMaterialFactory } = await import('../../src/committer/material-bridge.js');
    makeCurtainWallMaterialFactory(composeCurtainPanelMaterialKey('opaque', 'mat-declared-once'));
    expect(warn.mock.calls.map(c => String(c[0])).join('\n')).toMatch(/DROPPED \(DECLARED\).*mat-declared-once/s);
    warn.mockRestore();
  });
});

describe('§L-1053 — an unrecognised key REFUSES instead of silently glazing', () => {
  beforeEach(() => { __resetCurtainWallMaterialKeyReports(); });

  it('returns null for the layout this file used to claim was the format', () => {
    // The header's own former claim: `curtainwall|<systemTypeId>|<materialId>|<color>|<slot>`.
    // Nothing mints it. It must not parse as though it does.
    expect(parseCurtainWallMaterialKey('curtainwall|sys-1|mat-1|#123456|mullion')).toBeNull();
  });

  it('reports an unparseable key ONCE and says which layouts exist', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    slotOfCurtainWallMaterialKey('wall|layer|core');
    slotOfCurtainWallMaterialKey('wall|layer|core');
    expect(err).toHaveBeenCalledTimes(1);
    expect(String(err.mock.calls[0]![0])).toMatch(/curtainwall\|panel\|<kind>/);
    err.mockRestore();
  });
});
