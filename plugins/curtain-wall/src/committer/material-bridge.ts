// material-bridge — curtain-wall MaterialKey → THREE.MeshStandardMaterial.
//
// ─── §L-1053 — THIS FILE PARSED A KEY LAYOUT NOTHING EVER MINTED ─────────────
// The header used to read, as a flat statement of fact:
//
//     "Curtain-wall material keys from the kernel are
//      `curtainwall|<systemTypeId>|<materialId>|<color>|<slot>`"
//
// MEASURED 2026-08-19 — no producer emits that. There are THREE composers, all
// exported, all in `packages/geometry-kernel/src/producers/_internal/curtain-wall/`,
// and they mint TWO layouts, neither of which is the one above:
//
//   composeMullionMaterialKey (buildMullions.ts:13)
//     curtainwall | mullion | <materialId> | #7a7a7e   | body
//   composeTransomMaterialKey (buildTransoms.ts:12)
//     curtainwall | transom | <materialId> | #7a7a7e   | body
//   composeCurtainPanelMaterialKey (buildPanels.ts:47)
//     curtainwall | panel   | <kind>       | <materialId> | <colourOfKind>
//
// The SLOT is at index 1, not 4. What this file read at index 4 was the literal
// `'body'` for a mullion or a transom, and the panel's COLOUR for a panel —
// neither of which is in `FALLBACK_COLOURS`, so `slotOfCurtainWallMaterialKey`
// hit its `return 'glazed'` fallthrough for EVERY key of EVERY kind. Measured
// consequences, all three silent:
//
//   • every MULLION and TRANSOM was built with the glass branch — transparent,
//     opacity 0.45, roughness 0.1, metalness 0 — instead of the anodised-metal
//     branch this file already contains and never reached;
//   • every SPANDREL, DOOR and OPAQUE panel rendered as glazing, which is C87
//     CW-B-2's user-facing symptom ("the façade the user composed") arriving by
//     a second, independent route;
//   • the colour read at index 3 is the panel's `materialId` on a panel key, so
//     `new THREE.Color('<some-material-id>')` — an unparseable colour string.
//     Only when `materialId` was absent did index 3 fall to `''` and the fallback
//     engage, and even then it returned `#9bc8e4` where the producer had chosen
//     `#a4cdd9`. Two palettes for one question (C84 EI-8).
//
// C87 §11 #9 recorded the narrow half of this — "`parts[2]` is never read". That
// is true and it is the least of it: `parts[2]` is the panel's KIND, so the field
// being discarded was the thing the whole slot vocabulary exists to express.
//
// ⚠ THE STRUCTURAL DEFECT, WHICH THIS FIX REDUCES BUT DOES NOT CLOSE. The format
// is minted in one package and parsed in another with nothing binding them —
// C84 EI-9, one answer per question. It survived because BOTH ends compiled and
// the parse had a total fallback, so a complete mismatch looked exactly like a
// working default. The binding added here is
// `__tests__/committer/MaterialKeyRoundTrip.test.ts`, which imports the three
// REAL composers and feeds their output into this parser — an executed
// equivalence proof (C84 EI-10(b)), not a comment. The durable fix is for the
// composers and this parser to share one module; that is owed and named in C87.

import * as THREE from '@pryzm/renderer-three/three';

const FALLBACK_COLOURS: Readonly<Record<string, string>> = {
  mullion: '#3a3a3a',
  transom: '#3a3a3a',
  glazed: '#9bc8e4',
  spandrel: '#5a5a5a',
  door: '#404040',
  opaque: '#7d7d7d',
};

export type CurtainWallSlot = keyof typeof FALLBACK_COLOURS;

/** The panel kinds `composeCurtainPanelMaterialKey` can write at index 2.
 *  Kept in step with `buildPanels.ts:13`'s `PanelKind` by the round-trip test. */
const PANEL_KINDS: ReadonlySet<string> = new Set(['glazed', 'spandrel', 'door', 'opaque']);

/** Everything a curtain-wall material key actually carries. */
export interface ParsedCurtainWallMaterialKey {
  readonly slot: CurtainWallSlot;
  /** The material-library id, or `undefined` when the producer had none.
   *  §L-1053: this is the segment C87 §11 #9 recorded as never read. It is read
   *  now, and — see {@link makeCurtainWallMaterialFactory} — its non-resolution
   *  is DECLARED rather than silent. */
  readonly materialId: string | undefined;
  readonly color: string;
}

/**
 * Parse a key minted by one of the three kernel composers.
 *
 * Returns `null` for anything else. A `null` is a REFUSAL and callers say so —
 * the previous behaviour of silently answering `'glazed'` is what let a total
 * layout mismatch look like a working default for the life of the file
 * (C84 §1 — a refusal is a correct answer; a silently-wrong material is not).
 */
export function parseCurtainWallMaterialKey(key: string): ParsedCurtainWallMaterialKey | null {
  const parts = key.split('|');
  if (parts[0] !== 'curtainwall') return null;
  const discriminator = parts[1];

  if (discriminator === 'mullion' || discriminator === 'transom') {
    const color = parts[3];
    if (!color) return null;
    return { slot: discriminator, materialId: parts[2] || undefined, color };
  }

  if (discriminator === 'panel') {
    const kind = parts[2];
    if (!kind || !PANEL_KINDS.has(kind)) return null;
    const color = parts[4];
    if (!color) return null;
    return { slot: kind as CurtainWallSlot, materialId: parts[3] || undefined, color };
  }

  return null;
}

/** Keys already reported as unparseable, so a per-frame material acquire cannot
 *  turn one authoring mistake into a console flood. */
const _reportedBadKeys = new Set<string>();
function _reportUnparseable(key: string, fn: string): void {
  if (_reportedBadKeys.has(key)) return;
  _reportedBadKeys.add(key);
  console.error(
    `[curtain-wall/material-bridge] §L-1053 ${fn} cannot parse '${key}'. The layouts this ` +
    'family mints are `curtainwall|mullion|<materialId>|<color>|body`, ' +
    '`curtainwall|transom|<materialId>|<color>|body` and ' +
    '`curtainwall|panel|<kind>|<materialId>|<color>` (geometry-kernel producers ' +
    '_internal/curtain-wall/build{Mullions,Transoms,Panels}.ts). Falling back to glazing, ' +
    'which is a GUESS and is why this is an error and not a warning.',
  );
}

/** Test-only: clear the once-per-key report set. */
export function __resetCurtainWallMaterialKeyReports(): void {
  _reportedBadKeys.clear();
}

export function slotOfCurtainWallMaterialKey(key: string): CurtainWallSlot {
  const parsed = parseCurtainWallMaterialKey(key);
  if (parsed) return parsed.slot;
  _reportUnparseable(key, 'slotOfCurtainWallMaterialKey');
  return 'glazed';
}

export function colorOfCurtainWallMaterialKey(key: string): string {
  const parsed = parseCurtainWallMaterialKey(key);
  if (parsed) return parsed.color;
  _reportUnparseable(key, 'colorOfCurtainWallMaterialKey');
  return FALLBACK_COLOURS.glazed!;
}

/** Material ids this bridge has already declared it cannot resolve. */
const _reportedIgnoredMaterialIds = new Set<string>();

export function makeCurtainWallMaterialFactory(key: string): () => THREE.MeshStandardMaterial {
  const parsed = parseCurtainWallMaterialKey(key);
  const slot = parsed ? parsed.slot : slotOfCurtainWallMaterialKey(key);
  const color = parsed ? parsed.color : colorOfCurtainWallMaterialKey(key);

  // §L-1053 / C87 CW-Voc-4 — DECLARED, NOT SILENT. `materialId` names a real PBR
  // material (`CurtainWallTypes.ts:44-53` — "anodised-aluminium mullions,
  // tempered-glass glazing"), and this bridge has no material library in scope to
  // resolve it against: it is an L6 plugin committer and the library
  // (`STANDARD_MATERIAL_LIBRARY`) is injected into the Stack-A builder, not here.
  // So the id is ignored — but ignoring it is now stated at the point of loss,
  // which is what C84 EI-2 requires of a drop that cannot yet be a carry.
  if (parsed?.materialId && !_reportedIgnoredMaterialIds.has(parsed.materialId)) {
    _reportedIgnoredMaterialIds.add(parsed.materialId);
    console.warn(
      `[curtain-wall/material-bridge] §L-1053 DROPPED (DECLARED): material id ` +
      `'${parsed.materialId}' (slot '${parsed.slot}') is carried by the key and NOT resolved — ` +
      `the '${color}' hex is used instead. This bridge has no material library in scope; ` +
      'resolving it needs the library injected here the way it is injected into the Stack-A ' +
      'builder. Tracked as C87 CW-Voc-4.',
    );
  }

  if (slot === 'glazed') {
    return () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(color),
        roughness: 0.1,
        metalness: 0.0,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
      });
  }
  if (slot === 'mullion' || slot === 'transom') {
    return () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(color),
        roughness: 0.5,
        metalness: 0.6,
        side: THREE.DoubleSide,
      });
  }
  return () =>
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: 0.8,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });
}
