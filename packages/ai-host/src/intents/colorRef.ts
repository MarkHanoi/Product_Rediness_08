// @pryzm/ai-host — colour reference resolution (ADR-0314 §Value sources).
//
// THE one language-side colour-name → hex table. The commands deliberately own
// no colour names (`wall.updateColorBatch` validates '#rrggbb' and nothing
// else), so "white" has exactly one meaning in the whole chat path. The two
// pre-existing ad-hoc maps in QueryEngine.ts (which disagree with each other on
// 'black') are scheduled for collapse onto this module — do not add a fourth.
//
// BOUNDED vocabulary, architectural bias: these are the colours people ask for
// on building elements. An unresolvable reference is a REFUSAL that lists real
// options (§CONTEXT-DATA-HONESTY), never a guess — so being bounded is a
// feature, and '#rrggbb' / '#rgb' passthrough covers the long tail exactly.
//
// PURITY: no DOM, no stores, no I/O — same contract as the resolvers.

export interface ResolvedColor {
  /** '#rrggbb', lowercase. */
  readonly hex: string;
  /** Human label for summaries: the name as canonically spelled, or the hex. */
  readonly label: string;
}

/** Canonical names (British spellings normalize to these keys' values too). */
const COLOR_NAMES: Readonly<Record<string, string>> = {
  white: '#ffffff',
  'off white': '#f5f2ea',
  ivory: '#f4f1e8',
  cream: '#f1e8d8',
  beige: '#d9c7a7',
  tan: '#c8a878',
  sand: '#d6c39a',
  terracotta: '#c66b4e',
  brick: '#9c4a3c',
  brown: '#7a5230',
  'dark brown': '#4e3420',
  black: '#000000',
  charcoal: '#333333',
  'dark grey': '#555555',
  grey: '#9e9e9e',
  'light grey': '#cccccc',
  silver: '#c0c0c0',
  concrete: '#b5b3ad',
  red: '#c62828',
  'dark red': '#8e1b1b',
  orange: '#ef6c00',
  yellow: '#f9a825',
  gold: '#c9a227',
  olive: '#6b6b2f',
  green: '#2e7d32',
  'dark green': '#1b4d21',
  teal: '#00695c',
  cyan: '#00838f',
  'light blue': '#64b5f6',
  blue: '#1565c0',
  navy: '#0d2c54',
  'dark blue': '#103a71',
  purple: '#6a1b9a',
  violet: '#7c43bd',
  magenta: '#ad1457',
  pink: '#ec8faf',
};

const HEX6_RE = /^#([0-9a-fA-F]{6})$/;
const HEX3_RE = /^#([0-9a-fA-F]{3})$/;

function normalizeColorWords(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/\bgray\b/g, 'grey')      // US → canonical spelling
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ');
}

/**
 * Resolve a colour reference — a known name ("white", "light grey", "gray"),
 * or a hex literal ('#ffffff', '#fff') — to '#rrggbb'. Returns null on
 * anything else; the CALLER refuses by listing `exampleColorNames()`.
 */
export function resolveColorRef(ref: string): ResolvedColor | null {
  const trimmed = ref.trim();
  const hex6 = HEX6_RE.exec(trimmed);
  if (hex6 !== null) {
    const hex = `#${hex6[1]!.toLowerCase()}`;
    return { hex, label: hex };
  }
  const hex3 = HEX3_RE.exec(trimmed);
  if (hex3 !== null) {
    const [r, g, b] = hex3[1]!.toLowerCase();
    const hex = `#${r}${r}${g}${g}${b}${b}`;
    return { hex, label: hex };
  }
  const name = normalizeColorWords(trimmed);
  const hit = COLOR_NAMES[name];
  if (hit !== undefined) return { hex: hit, label: name };
  return null;
}

/** A short, stable sample of supported names for refusal copy. */
export function exampleColorNames(): readonly string[] {
  return ['white', 'black', 'light grey', 'beige', 'terracotta', 'green', 'blue', 'red'];
}

/** Every supported colour name (tests + docs). */
export function allColorNames(): readonly string[] {
  return Object.keys(COLOR_NAMES);
}
