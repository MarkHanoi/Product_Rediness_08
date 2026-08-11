// @pryzm/ai-host — FILTER scope grammar + copy (RAC Phase U8.1).
// =============================================================================
//
// WHY THIS IS A PRE-STRIPPER, NOT N NEW REGEXES. Every batch capability's
// grammar already carries a scope tail ("… on level 2", "… in the kitchen",
// "all south-facing walls"). Threading a filter clause through each of those
// regexes would have meant six more optional capture groups per capability and
// a combinatorial explosion of orderings ("all walls thicker than 300 mm on
// level 2" vs "all walls on level 2 thicker than 300 mm"). Instead this module
// LIFTS the filter clauses out of the sentence first and hands the capability
// grammar the remainder, unchanged. Composition with level/room/orientation is
// then automatic — those phrases are parsed by the grammar that already knew
// them, on text that no longer contains the filter words.
//
// PURITY. Tables + regexes only. The ONE outside fact a filter needs — "is
// 'interior partition' a real wall type here?" — arrives as an INJECTED
// lookup (`resolveType`), the same discipline the wall-type catalogue already
// uses. An adjective the catalogue does not know is NOT a type filter, and the
// words stay in the sentence; the grammar never invents a type.
//
// HONESTY. This module produces predicates and the WORDS for them; it never
// decides whether anything matched. Evaluation and the extremum are the
// editor-side resolver's job (U8.2), and a filter that matches nothing becomes
// a refusal QUOTING the real extremum (U8.3) — never an empty success.

import type {
  ElementFilter,
  FilterOp,
  FilterProperty,
  FilterStat,
  FilterUnit,
  PropertyFilter,
} from './ScopeDescriptor.js';

// ─── Units ───────────────────────────────────────────────────────────────────

const UNIT_RE = String.raw`(?:(mm|millimet(?:er|re)s?|cm|centimet(?:er|re)s?|m2|m²|sqm|square\s*met(?:er|re)s?|m|met(?:er|re)s?))`;

/** Normalise a spoken unit to the canonical tag, or null when none was said. */
function normalizeUnit(raw: string | undefined): FilterUnit | null {
  if (raw === undefined || raw.length === 0) return null;
  const u = raw.replace(/\s+/g, '');
  if (/^(mm|millimet)/.test(u)) return 'mm';
  if (/^(cm|centimet)/.test(u)) return 'cm';
  if (/^(m2|m²|sqm|squaremet)/.test(u)) return 'm2';
  return 'm';
}

/** Spoken value + unit → SI (metres, or m² for an area unit). */
function toSi(value: number, unit: FilterUnit): number {
  return unit === 'mm' ? value / 1000 : unit === 'cm' ? value / 100 : value;
}

/** Quote an SI value back in the unit the user spoke it in. */
export function formatFilterValue(valueSi: number, unit: FilterUnit): string {
  const n = unit === 'mm' ? valueSi * 1000 : unit === 'cm' ? valueSi * 100 : valueSi;
  const rounded = Number(n.toFixed(3));
  const word = unit === 'm2' ? 'm²' : unit;
  return `${rounded} ${word}`;
}

// ─── Property vocabulary ─────────────────────────────────────────────────────

/** Comparative adjective → the property it measures and the direction. */
const COMPARATIVES: Readonly<Record<string, { property: FilterProperty; op: 'gt' | 'lt' }>> = {
  thicker: { property: 'thickness', op: 'gt' },
  thinner: { property: 'thickness', op: 'lt' },
  wider: { property: 'width', op: 'gt' },
  narrower: { property: 'width', op: 'lt' },
  taller: { property: 'height', op: 'gt' },
  higher: { property: 'height', op: 'gt' },
  lower: { property: 'height', op: 'lt' },
  longer: { property: 'length', op: 'gt' },
  larger: { property: 'area', op: 'gt' },
  bigger: { property: 'area', op: 'gt' },
  smaller: { property: 'area', op: 'lt' },
};

/** Property NOUNS, as a user names them in the "with a <noun> …" form. */
const PROPERTY_NOUNS: ReadonlyArray<readonly [RegExp, FilterProperty]> = [
  [/^(?:area|floor area|surface area|size)$/, 'area'],
  [/^(?:width|widths)$/, 'width'],
  [/^(?:height|heights)$/, 'height'],
  [/^(?:thickness|depth)$/, 'thickness'],
  [/^(?:length|lengths)$/, 'length'],
  [/^(?:sill|sill height|sill heights)$/, 'sillHeight'],
];

function propertyFromNoun(noun: string): FilterProperty | null {
  const n = noun.trim();
  for (const [re, prop] of PROPERTY_NOUNS) if (re.test(n)) return prop;
  return null;
}

/** Comparison words in the "with a <noun> <comparison> <n>" form. */
const COMPARISON_WORDS: Readonly<Record<string, FilterOp>> = {
  'greater than': 'gt', 'more than': 'gt', 'larger than': 'gt', 'bigger than': 'gt',
  'over': 'gt', 'above': 'gt', 'exceeding': 'gt',
  'less than': 'lt', 'smaller than': 'lt', 'under': 'lt', 'below': 'lt',
  'at least': 'gte', 'no less than': 'gte', 'or more': 'gte',
  'at most': 'lte', 'no more than': 'lte', 'up to': 'lte', 'or less': 'lte',
  'exactly': 'eq', 'of': 'eq', 'equal to': 'eq',
};
const COMPARISON_ALT = Object.keys(COMPARISON_WORDS)
  .sort((a, b) => b.length - a.length)
  .map((w) => w.replace(/ /g, String.raw`\s+`))
  .join('|');

/** Which properties are AREAS — the only ones an m² unit may attach to. */
const AREA_PROPERTIES: ReadonlySet<FilterProperty> = new Set<FilterProperty>(['area']);

// ─── Copy ────────────────────────────────────────────────────────────────────

/** Property → the noun the copy speaks. */
export const FILTER_PROPERTY_NOUN: Readonly<Record<FilterProperty, string>> = {
  area: 'area', width: 'width', height: 'height',
  thickness: 'thickness', length: 'length', sillHeight: 'sill height',
};

/** Property → the comparative adjectives, for the ">"/"<" phrasings. */
const COMPARATIVE_COPY: Readonly<Record<FilterProperty, { gt: string; lt: string }>> = {
  area: { gt: 'larger than', lt: 'smaller than' },
  width: { gt: 'wider than', lt: 'narrower than' },
  height: { gt: 'taller than', lt: 'shorter than' },
  thickness: { gt: 'thicker than', lt: 'thinner than' },
  length: { gt: 'longer than', lt: 'shorter than' },
  sillHeight: { gt: 'with a sill above', lt: 'with a sill below' },
};

/** Property → the superlatives a refusal quotes ("the thickest is 250 mm"). */
export const FILTER_SUPERLATIVE: Readonly<Record<FilterProperty, { max: string; min: string }>> = {
  area: { max: 'the largest', min: 'the smallest' },
  width: { max: 'the widest', min: 'the narrowest' },
  height: { max: 'the tallest', min: 'the shortest' },
  thickness: { max: 'the thickest', min: 'the thinnest' },
  length: { max: 'the longest', min: 'the shortest' },
  sillHeight: { max: 'the highest sill', min: 'the lowest sill' },
};

/** ONE filter, in the words the summaries and refusals use. */
export function describeFilter(f: ElementFilter): string {
  if (f.kind === 'type') return `of type "${f.label}"`;
  const noun = FILTER_PROPERTY_NOUN[f.property];
  const v = formatFilterValue(f.value, f.unit);
  switch (f.op) {
    case 'gt': return `${COMPARATIVE_COPY[f.property].gt} ${v}`;
    case 'lt': return `${COMPARATIVE_COPY[f.property].lt} ${v}`;
    case 'gte': return `with ${noun} of at least ${v}`;
    case 'lte': return `with ${noun} of at most ${v}`;
    case 'eq': return `with ${noun} of exactly ${v}`;
    case 'between':
      return `with ${noun} between ${v} and ${formatFilterValue(f.upper ?? f.value, f.unit)}`;
  }
}

/** All the filters, joined the way a person would say them. */
export function describeFilters(filters: readonly ElementFilter[]): string {
  const parts = filters.map(describeFilter);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]!}`;
}

/**
 * RAC U8.3 — the refusal that TEACHES the model. A filter that matched nothing
 * must quote the real extremum in the user's own unit, so the next sentence
 * can be right: "No wall is thicker than 300 mm — the thickest is 250 mm
 * (Interior – Partition)."
 *
 * `stats` is what the resolver actually measured; when it measured nothing
 * (every record lacked the property) the copy says THAT instead of inventing
 * an extremum — failure and empty are not the same value.
 */
export function filterRefusalCopy(
  kindNoun: string,
  filters: readonly ElementFilter[],
  stats: readonly FilterStat[],
  scopePhrase: string,
): string {
  const where = scopePhrase.length > 0 ? ` ${scopePhrase}` : '';
  const head = `No ${kindNoun}${where} is ${describeFilters(filters)}`;
  // The extremum is quoted for the FIRST property filter — the one the user
  // most likely got wrong. Type filters have no extremum to quote.
  const first = filters.find((f): f is PropertyFilter => f.kind === 'property');
  if (first === undefined) return `${head} — nothing was changed.`;
  const stat = stats.find((s) => s.property === first.property);
  if (stat === undefined || stat.considered === 0) {
    const missing = stat?.missing ?? 0;
    return (
      `${head} — and I could not check: ` +
      `${missing > 0 ? `${missing} ` : 'no '}${kindNoun}${missing === 1 ? '' : 's'} ` +
      `${missing > 0 ? 'have' : 'has'} no recorded ${FILTER_PROPERTY_NOUN[first.property]}. ` +
      `Nothing was changed.`
    );
  }
  const wantsMax = first.op === 'lt' || first.op === 'lte';
  const value = wantsMax ? stat.min : stat.max;
  const label = wantsMax ? stat.minLabel : stat.maxLabel;
  const superlative = wantsMax
    ? FILTER_SUPERLATIVE[first.property].min
    : FILTER_SUPERLATIVE[first.property].max;
  if (value === null) return `${head} — nothing was changed.`;
  return (
    `${head} — ${superlative} is ${formatFilterValue(value, first.unit)}` +
    `${label !== null ? ` (${label})` : ''}. Nothing was changed.`
  );
}

// ─── The parser ──────────────────────────────────────────────────────────────

export interface FilterParseResult {
  /** The sentence with every filter clause LIFTED OUT — what the capability
   *  grammar parses. Whitespace is re-normalised; nothing else changes. */
  readonly stripped: string;
  readonly filters: readonly ElementFilter[];
}

const NUM = String.raw`(\d+(?:\.\d+)?)`;

// "thicker than 300 mm" / "larger than 2 m²" / "narrower than 0.9m"
const COMPARATIVE_RE = new RegExp(
  String.raw`\b(${Object.keys(COMPARATIVES).join('|')})\s+than\s+${NUM}\s*${UNIT_RE}?`,
  'g',
);

// "between 2 and 4 m²" (bare, after a noun-less comparative context) and
// "with an area between 2 and 4 m²"
const BETWEEN_RE = new RegExp(
  String.raw`\b(?:with\s+(?:an?|the)\s+)?` +
  String.raw`(area|floor area|surface area|size|width|height|thickness|depth|length|sill height|sill)\s+` +
  String.raw`between\s+${NUM}\s*${UNIT_RE}?\s+and\s+${NUM}\s*${UNIT_RE}?`,
  'g',
);

// "with an area greater than 2 m²" / "with a sill below 900 mm" /
// "whose thickness is at least 300mm" / "with width over 900 mm"
const NOUN_COMPARISON_RE = new RegExp(
  String.raw`\b(?:with|whose|having|of)\s+(?:an?\s+|the\s+)?` +
  String.raw`(area|floor area|surface area|size|width|height|thickness|depth|length|sill height|sill)` +
  String.raw`(?:\s+(?:is|are|of))?\s+(${COMPARISON_ALT})\s+${NUM}\s*${UNIT_RE}?`,
  'g',
);

/** A filter clause whose unit contradicts its property is NOT claimed — an m²
 *  width is not a sentence this grammar understands, and guessing which half
 *  the user meant is exactly the coin-flip the honesty rule forbids. */
function coherent(property: FilterProperty, unit: FilterUnit): boolean {
  return AREA_PROPERTIES.has(property) === (unit === 'm2');
}

function makePropertyFilter(
  property: FilterProperty,
  op: FilterOp,
  rawValue: number,
  rawUnit: string | undefined,
  rawUpper?: number,
): PropertyFilter | null {
  if (!Number.isFinite(rawValue) || rawValue < 0) return null;
  // No unit spoken ⇒ the property's own natural unit (m² for areas, m else).
  const unit = normalizeUnit(rawUnit) ?? (AREA_PROPERTIES.has(property) ? 'm2' : 'm');
  if (!coherent(property, unit)) return null;
  const base: PropertyFilter = {
    kind: 'property', property, op, value: toSi(rawValue, unit), unit,
  };
  if (op === 'between') {
    if (rawUpper === undefined || !Number.isFinite(rawUpper)) return null;
    const lo = Math.min(rawValue, rawUpper);
    const hi = Math.max(rawValue, rawUpper);
    return { ...base, value: toSi(lo, unit), upper: toSi(hi, unit) };
  }
  return base;
}

/**
 * Lift the TYPE adjective out of "make all interior partition walls white".
 *
 * Purely-decidable it is not: "interior partition" is a type here and
 * "south-facing" is not, and only the project's catalogue knows which. So the
 * candidate adjective run between the scope word and the noun is offered to
 * the INJECTED lookup, and it is a type filter only if the catalogue claims
 * it. Nothing is guessed and nothing is narrowed: an unrecognised adjective
 * leaves the sentence exactly as the user typed it.
 */
function liftTypeFilter(
  text: string,
  kindNoun: string,
  resolveType: ((ref: string) => { id: string; name: string } | null) | undefined,
): { stripped: string; filter: TypeFilterLike | null } {
  if (resolveType === undefined) return { stripped: text, filter: null };
  const re = new RegExp(
    String.raw`\b(all|every|each|the|these|those|selected)\s+([a-z][\w' -]*?)\s+(${kindNoun}s?)\b`,
  );
  const m = re.exec(text);
  if (!m) return { stripped: text, filter: null };
  const candidate = m[2]!.trim();
  if (candidate.length === 0) return { stripped: text, filter: null };
  const hit = resolveType(candidate);
  if (hit === null) return { stripped: text, filter: null };
  const stripped = `${text.slice(0, m.index)}${m[1]!} ${m[3]!}${text.slice(m.index + m[0].length)}`;
  return {
    stripped: stripped.replace(/\s+/g, ' ').trim(),
    filter: { kind: 'type', typeId: hit.id, label: hit.name },
  };
}

type TypeFilterLike = Extract<ElementFilter, { kind: 'type' }>;

/**
 * Lift every filter clause out of `text`.
 *
 * Ordering note: BETWEEN and the noun-comparison form are lifted BEFORE the
 * bare comparative, because "with an area larger than 2 m²" contains "larger
 * than" and the noun form carries strictly more information (it pins the
 * property explicitly rather than inferring it from the adjective).
 */
export function parseFilterClauses(
  text: string,
  kindNoun: string,
  resolveType?: (ref: string) => { id: string; name: string } | null,
): FilterParseResult {
  const filters: ElementFilter[] = [];
  let rest = text;

  const lift = (re: RegExp, build: (m: RegExpExecArray) => ElementFilter | null): void => {
    re.lastIndex = 0;
    let out = '';
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(rest)) !== null) {
      const f = build(m);
      if (f === null) continue;
      filters.push(f);
      out += rest.slice(last, m.index);
      last = m.index + m[0].length;
    }
    if (last > 0) rest = `${out}${rest.slice(last)}`.replace(/\s+/g, ' ').trim();
  };

  lift(BETWEEN_RE, (m) => {
    const property = propertyFromNoun(m[1]!);
    if (property === null) return null;
    return makePropertyFilter(
      property, 'between', Number(m[2]), m[3] ?? m[5], Number(m[4]),
    );
  });

  lift(NOUN_COMPARISON_RE, (m) => {
    const property = propertyFromNoun(m[1]!);
    if (property === null) return null;
    const op = COMPARISON_WORDS[m[2]!.replace(/\s+/g, ' ')];
    if (op === undefined) return null;
    return makePropertyFilter(property, op, Number(m[3]), m[4]);
  });

  lift(COMPARATIVE_RE, (m) => {
    const spec = COMPARATIVES[m[1]!];
    if (spec === undefined) return null;
    return makePropertyFilter(spec.property, spec.op, Number(m[2]), m[3]);
  });

  const typed = liftTypeFilter(rest, kindNoun, resolveType);
  if (typed.filter !== null) {
    rest = typed.stripped;
    filters.push(typed.filter);
  }

  return { stripped: rest, filters };
}
