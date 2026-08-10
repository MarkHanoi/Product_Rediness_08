// §FEAT-WALL-LAYER-ADD-BATCH (ADR-0315) — the ONE finish-name table.
//
// The exact colorRef.ts pattern one file over: the chat resolver owns the
// LANGUAGE ("plaster", "paint") and hands the command RESOLVED values
// ({name, materialColor, materialId}); `AddWallLayerBatchCommand` deliberately
// owns no name table, so there is exactly one name→finish site.
//
// Every entry's materialId + hex is transcribed VERBATIM from the standard
// material library (`packages/core-app-model/src/materialLibrary.ts` — the
// authority; its ids are the free-form `WallLayer.materialId` vocabulary the
// inspector displays). Transcribed, not imported: materialLibrary constructs
// `THREE.Color` instances at module load, and this resolver is pure — no
// THREE, no DOM, no stores (P5-adjacent purity, same ruling as colorRef).
// If the library recolours a finish, update the hex here in the same commit.
//
// PURE — no I/O, no stores; safe for tier-0 and the NL layer.

export interface ResolvedFinish {
  /** Display name for the layer row (the library's label). */
  readonly name: string;
  /** '#rrggbb' — what WallFragmentBuilder actually renders. */
  readonly materialColor: string;
  /** The material library id, kept on the layer for the inspector. */
  readonly materialId: string;
}

/** Alias → finish. First name in each group is the canonical suggestion. */
const FINISHES: ReadonlyArray<{ aliases: readonly string[]; finish: ResolvedFinish }> = [
  {
    aliases: ['plaster', 'skim', 'skim coat', 'plaster skim'],
    finish: { name: 'Plaster · Skim Coat (Painted)', materialColor: '#f5f5f0', materialId: 'gypsum-skim' },
  },
  {
    aliases: ['plasterboard', 'drywall', 'gypsum', 'gypsum board', 'sheetrock'],
    finish: { name: 'Plasterboard · Standard', materialColor: '#f0eeea', materialId: 'gypsum-plasterboard' },
  },
  {
    aliases: ['acoustic plasterboard', 'acoustic board'],
    finish: { name: 'Plasterboard · Acoustic', materialColor: '#eceae6', materialId: 'gypsum-acoustic' },
  },
  {
    aliases: ['venetian plaster', 'polished plaster'],
    finish: { name: 'Plaster · Venetian (Polished)', materialColor: '#e8e4d8', materialId: 'gypsum-venetian' },
  },
  {
    aliases: ['clay plaster', 'clay', 'natural clay'],
    finish: { name: 'Plaster · Natural Clay', materialColor: '#c6aa8b', materialId: 'plaster-clay-natural' },
  },
  {
    aliases: ['tadelakt'],
    finish: { name: 'Plaster · Tadelakt', materialColor: '#d2c1a5', materialId: 'plaster-tadelakt' },
  },
  {
    aliases: ['fire rated plasterboard', 'fire board', 'fire rated'],
    finish: { name: 'Plasterboard · Fire Rated Pink', materialColor: '#e5b4ad', materialId: 'gypsum-fire-rated-pink' },
  },
  {
    aliases: ['moisture resistant plasterboard', 'moisture board', 'green board'],
    finish: { name: 'Plasterboard · Moisture Resistant Green', materialColor: '#b8c9b2', materialId: 'gypsum-moisture-green' },
  },
  {
    aliases: ['paint', 'matte white paint', 'white paint'],
    finish: { name: 'Paint · Matte White', materialColor: '#f7f5ef', materialId: 'paint-matte-white' },
  },
  {
    aliases: ['eggshell paint', 'warm eggshell'],
    finish: { name: 'Paint · Warm Eggshell', materialColor: '#eee4d2', materialId: 'paint-eggshell-warm' },
  },
  {
    aliases: ['charcoal paint', 'satin charcoal', 'dark paint'],
    finish: { name: 'Paint · Satin Charcoal', materialColor: '#303236', materialId: 'paint-satin-charcoal' },
  },
  {
    aliases: ['limewash', 'limewash cream', 'lime wash'],
    finish: { name: 'Paint · Limewash Cream', materialColor: '#e9ddc8', materialId: 'paint-limewash-cream' },
  },
  {
    aliases: ['microcement', 'micro cement'],
    finish: { name: 'Coating · Microcement Warm Grey', materialColor: '#bcb5aa', materialId: 'paint-microcement-warm-grey' },
  },
  {
    aliases: ['cellulose insulation', 'blown cellulose'],
    finish: { name: 'Insulation · Blown Cellulose', materialColor: '#bca57d', materialId: 'insulation-cellulose' },
  },
  {
    aliases: ['wood fibre insulation', 'wood fiber insulation', 'wood fibre'],
    finish: { name: 'Insulation · Wood Fibre Board', materialColor: '#c6a66a', materialId: 'insulation-wood-fibre' },
  },
];

const normalize = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Resolve a finish reference ("plaster", "limewash") to the library values.
 * Exact alias first, then unique-substring (ambiguity ⇒ null, never a
 * coin-flip — same ruling as resolveCatalogueRef). Returns null on a miss;
 * callers refuse by LISTING real options via {@link exampleFinishNames}.
 */
export function resolveFinishRef(ref: string): ResolvedFinish | null {
  const n = normalize(ref);
  if (n.length === 0) return null;
  for (const entry of FINISHES) {
    if (entry.aliases.some((a) => a === n)) return entry.finish;
  }
  const partial = FINISHES.filter((e) => e.aliases.some((a) => a.includes(n) || n.includes(a)));
  return partial.length === 1 ? partial[0]!.finish : null;
}

/** Canonical names for refusal copy (first alias of each group). */
export function exampleFinishNames(): string[] {
  return FINISHES.map((e) => e.aliases[0]!);
}
