/**
 * widgetCatalogue — every widget the Analysis surface can mount, and the reason
 * each unbuilt one refuses.
 *
 * Layer Affected:  UI — Analysis surface (L7)
 * File:            apps/editor/src/ui/analysis/widgetCatalogue.ts
 * ADR:             ADR-0343 §D.3 (widget contract) · §D.6 H7 (a refusal names the gap)
 * SPEC:            SPEC-ANALYSIS-SURFACE-AND-WIDGETS §4 (the catalogue and its tiers)
 * Issue log:       L-3005
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ THE NOT-BUILT ROWS ARE THE POINT OF THIS FILE, NOT ITS FOOTNOTE
 * ─────────────────────────────────────────────────────────────────────────────
 * The founder's reference screenshots contain a change table, a GFA extractor,
 * an SIA 416 surface table, a unit mix and a tenure split. PRYZM has the model
 * for NONE of them (SPEC §4.4, §4.5). Every one of those is present here as a
 * REFUSAL that names its missing input — the same shape lane DATA1's 4D and 6D
 * tabs ship, for the same reason:
 *
 *   ⛔ A chart showing a number the model cannot support is worse than an empty
 *      card. A cost, an area or a carbon figure gets believed and quoted.
 *
 * They are in the catalogue rather than omitted so the gap is visible IN THE
 * PRODUCT, where the decision gets made, rather than only in a document.
 *
 * L7 file. No THREE (P2), no rAF (P3), no `(window as any)` (P4), no store
 * writes (P6) — one frozen table.
 */

import type { AnalysisWidgetDef } from './AnalysisTypes';

// ── T1 / T2 — widgets with a real substrate ───────────────────────────────────

const BUILT: readonly AnalysisWidgetDef[] = Object.freeze([
  {
    id: 'element-count',
    kind: 'kpi',
    title: 'Elements in this model',
    subtitle: 'Counted across the declared census table. Reads "≥ N" if any store was unreachable.',
    query: { id: 'census:category', source: 'census', groupBy: 'category', measure: 'count', cost: 'O(n)' },
    refresh: 'on-commit',
    span: 2,
    notBuilt: null,
  },
  {
    id: 'category-donut',
    kind: 'donut',
    title: 'Category report',
    subtitle: 'Element count by family. Click a slice to select those elements.',
    // Same descriptor id as the KPI above — ADR-0343 §D.3: identical queries
    // are computed ONCE. These two widgets share one scan.
    query: { id: 'census:category', source: 'census', groupBy: 'category', measure: 'count', cost: 'O(n)' },
    refresh: 'on-commit',
    span: 1,
    notBuilt: null,
  },
  {
    id: 'level-bar',
    kind: 'bar',
    title: 'Elements by level',
    subtitle: 'Grouped by storey. Elements with no level are a named bar, never dropped.',
    query: { id: 'census:level', source: 'census', groupBy: 'level', measure: 'count', cost: 'O(n)' },
    refresh: 'on-commit',
    span: 1,
    notBuilt: null,
  },
  {
    id: 'type-table',
    kind: 'table',
    title: 'Family / type report',
    subtitle: 'Count by resolved type. An element with no type is `Untyped` — its own row, never folded in.',
    query: { id: 'census:type', source: 'census', groupBy: 'type', measure: 'count', cost: 'O(n)' },
    refresh: 'on-commit',
    span: 1,
    notBuilt: null,
  },
  {
    id: 'selection-breakdown',
    kind: 'donut',
    title: 'Selection breakdown',
    subtitle: 'Composition of what is selected right now. Empty selection is an empty state, not a zeroed chart.',
    query: { id: 'census:selection', source: 'selection', groupBy: 'category', measure: 'count', cost: 'O(k)' },
    refresh: 'on-selection',
    span: 1,
    notBuilt: null,
  },
  {
    id: 'material-area',
    kind: 'table',
    title: 'Quantity take-off — area (m²)',
    subtitle: 'Real, element-traceable, net of openings. Every row states its measurement rule.',
    query: { id: 'takeoff:lines:m2', source: 'takeoff', groupBy: 'unit', measure: 'quantity', unit: 'm2', cost: 'O(n·m)' },
    refresh: 'manual',
    span: 2,
    notBuilt: null,
  },
  {
    id: 'material-treemap',
    kind: 'treemap',
    title: 'Material map — area (m²)',
    subtitle: 'Area encodes m². ⛔ One unit per map: mixing m² with m³ would make the rectangles a lie.',
    query: { id: 'takeoff:lines:m2', source: 'takeoff', groupBy: 'unit', measure: 'quantity', unit: 'm2', cost: 'O(n·m)' },
    refresh: 'manual',
    span: 2,
    notBuilt: null,
  },
  {
    id: 'chapter-volume',
    kind: 'bar',
    title: 'Volume by chapter (m³)',
    subtitle: 'Σ of the m³ take-off lines per capítulo. m² and m lines are excluded, not converted.',
    query: { id: 'takeoff:chapter:m3', source: 'takeoff', groupBy: 'chapter', measure: 'quantity', unit: 'm3', cost: 'O(n·m)' },
    refresh: 'manual',
    span: 1,
    notBuilt: null,
  },
  {
    id: 'linear-length',
    kind: 'table',
    title: 'Linear quantities (m)',
    subtitle: 'Take-off lines measured in metres — handrails, skirtings, linear runs.',
    query: { id: 'takeoff:lines:m', source: 'takeoff', groupBy: 'unit', measure: 'quantity', unit: 'm', cost: 'O(n·m)' },
    refresh: 'manual',
    span: 1,
    notBuilt: null,
  },
  {
    id: 'counted-items',
    kind: 'table',
    title: 'Counted items (ud)',
    subtitle: 'Families present and counted but with no area, volume or length derived.',
    query: { id: 'takeoff:lines:ud', source: 'takeoff', groupBy: 'unit', measure: 'quantity', unit: 'ud', cost: 'O(n·m)' },
    refresh: 'manual',
    span: 1,
    notBuilt: null,
  },
  {
    id: 'takeoff-coverage',
    kind: 'coverage',
    title: 'Coverage — what is measured, and what is not',
    subtitle: '⭐ Not optional chrome. Every quantity figure on this surface is read against this card.',
    query: { id: 'takeoff:lines:m2', source: 'takeoff', groupBy: 'unit', measure: 'quantity', unit: 'm2', cost: 'O(n·m)' },
    refresh: 'manual',
    span: 2,
    notBuilt: null,
  },
]);

// ── T3 — refusals. Each names the model that does not exist ───────────────────

const NOT_BUILT: readonly AnalysisWidgetDef[] = Object.freeze([
  {
    id: 'change-table',
    kind: 'not-built',
    title: 'Change table — Type / Previous / Current / Δ',
    subtitle: 'Needs version-to-version element identity, which does not exist.',
    query: null,
    refresh: 'manual',
    span: 2,
    notBuilt: {
      lede:
        'Not built. A version diff needs to answer "is this the SAME wall as in version N?", and nothing in PRYZM can answer that across two saved versions. It renders no table, because every row would be a guess about identity.',
      have: [
        'A session mutation log — <code>temporalGraphManager</code>, already backing the Design History panel. That is a log of what happened in THIS session, which is a different question.',
        '<code>ComparisonEngine.getDeltaMap()</code>, which compares PLANNED against ACTUAL — a template-vs-model delta, not version N against version N+1.',
        'Saved versions with labels (<code>versionLabel</code> on the project snapshot), so the two endpoints of a diff can at least be named.',
      ],
      need: [
        '<strong>Stable element ids across saved versions.</strong> This is the whole gap. Without it, a deleted wall and a moved wall are indistinguishable from each other and from a re-created one.',
        '<strong>A version index.</strong> Diffing requires loading two snapshots at once; the loader mounts one project at a time.',
        '<strong>A change classification.</strong> Added / removed / geometry-changed / parameter-changed are four different rows, and which one a mutation belongs to is a decision, not a subtraction.',
      ],
      close:
        'A "change table" built on the session log would show the last hour of edits under a heading that says "version". That is the wrong number under the right title, which is the worst combination.',
    },
  },
  {
    id: 'gfa-nia',
    kind: 'not-built',
    title: 'GFA / NIA and the GEA : NIA ratio',
    subtitle: 'Blocked on one decision: which measured-area standard PRYZM adopts.',
    query: null,
    refresh: 'manual',
    span: 1,
    notBuilt: {
      lede:
        'Not built, and deliberately not approximated. GFA is not "the sum of the floor areas" — it is whatever the adopted standard says it is, and PRYZM has adopted none (ADR-0343 §U.3, open).',
      have: [
        'Per-room computed areas, and slab/floor polygons with real geometry.',
        'A level hierarchy, which is the per-storey spine every area standard is organised around.',
        'A take-off that measures m² by a STATED basis — the machinery an area standard would plug into.',
      ],
      need: [
        '<strong>An adopted standard.</strong> IPMS, the RICS Code of Measuring Practice, SIA 416, or per-jurisdiction. They disagree about whether to include shafts, external walls, balconies and plant — so the same model has several different, all-correct GFAs.',
        '<strong>A per-space inclusion rule.</strong> Every room needs to know which measured-area class it belongs to. No space carries one today.',
        '<strong>Wall-centreline vs internal-face measurement.</strong> The standards differ, and the difference is several percent on a real building.',
      ],
      close:
        'ADR-0343 §D.6 H3: a ratio needs BOTH operands MEASURED. GEA : NIA has neither. <code>targetGFA</code> exists in the schedule extractor and is a TARGET — rendering it as GFA would be inventing the measurement from the brief.',
    },
  },
  {
    id: 'sia-416',
    kind: 'not-built',
    title: 'SIA 416 surface table and ratio gauges',
    subtitle: 'Zero occurrences of SIA anywhere in this repository — checked, not assumed.',
    query: null,
    refresh: 'manual',
    span: 1,
    notBuilt: {
      lede:
        'Not built. SIA 416 classifies every surface into SU / SP / SD / SC / SI, and no space in PRYZM carries an SIA category. The standard is absent from the codebase entirely.',
      have: [
        'Rooms with areas, a room-type vocabulary, and a normative program-rules database.',
        'A level hierarchy, which SIA 416 tables are organised per storey.',
      ],
      need: [
        '<strong>An SIA 416 category per space</strong> (SU Nutzfläche / SP Verkehrsfläche / SD Konstruktionsfläche / SC / SI). Mapping PRYZM room types onto it is a normative decision, not a lookup — and it must be authored, then reviewed.',
        '<strong>Construction area (SD).</strong> That is wall and shaft footprint, which needs the wall footprint polygons per storey, not the wall records.',
        '<strong>The standard\'s own edition and jurisdiction scope.</strong> SIA is Swiss; the ratio gauges mean something different under a different national standard.',
      ],
      close:
        'The gauges are four ratios of a table that does not exist. Drawing them at zero would put four confident dials on screen reporting a standard the product has never implemented.',
    },
  },
  {
    id: 'unit-mix',
    kind: 'not-built',
    title: 'Unit mix / bedroom distribution',
    subtitle: 'Bedroom counts are derivable. The unit that groups rooms into a dwelling is not.',
    query: null,
    refresh: 'manual',
    span: 1,
    notBuilt: {
      lede:
        'Not built. The bedroom half is nearly free — room types are already classified. The missing half is the UNIT: the thing that says these seven rooms are one sellable dwelling and those six are another.',
      have: [
        'Classified room types, including bedrooms, from the program-rules database.',
        'A deterministic apartment layout engine that KNOWS the unit boundary while it generates — the information exists at generation time.',
        'A hierarchy with a unit level (site → building → level → unit → room) in the model tree.',
      ],
      need: [
        '<strong>A persisted unit entity that rooms belong to.</strong> The generator knows it; the model does not keep it, so after a save the grouping is gone and cannot be recovered by geometry alone.',
        '<strong>A unit type classification</strong> (studio / 1B / 2B / 3B…), which is a counting rule over rooms and needs the grouping first.',
      ],
      close:
        'A "unit mix" computed by clustering rooms geometrically would produce a plausible distribution that changes when a door moves. This is the one row here whose gap is small — it is one persisted entity away, not a standard away.',
    },
  },
  {
    id: 'tenure',
    kind: 'not-built',
    title: 'Tenure distribution / affordable mix',
    subtitle: 'Tenure has no model anywhere in this repository. It is authored data, and it does not exist.',
    query: null,
    refresh: 'manual',
    span: 1,
    notBuilt: {
      lede:
        'Not built, and it is not derivable. Tenure — market sale, affordable rent, shared ownership, social — is not a property of geometry, rooms, or program. Somebody types it in, and there is nowhere to type it.',
      have: [
        'Nothing directly. This row exists so the absence is visible rather than mistaken for a missing chart.',
      ],
      need: [
        '<strong>A tenure field on a unit</strong> — which needs the unit entity above to exist first.',
        '<strong>A tenure vocabulary,</strong> which is jurisdiction-specific: the categories in England, Spain and the Netherlands are not the same categories.',
        '<strong>A policy target to measure against,</strong> since the useful chart is not "the mix" but "the mix against the planning requirement".',
      ],
      close:
        'Every other refusal on this surface is blocked on a decision or a derivation. This one is blocked on data entry that has no field. Naming it is the only honest thing available.',
    },
  },
]);

/** Every widget the build knows about, built and refusing alike. */
export const WIDGET_CATALOGUE: readonly AnalysisWidgetDef[] = Object.freeze([...BUILT, ...NOT_BUILT]);

/**
 * The default layout — the widgets a first-open shows, in order.
 *
 * Deliberately includes ONE refusal card (`change-table`), so the surface's
 * honesty is visible on first open rather than discoverable only by adding a
 * widget. The other four refusals are in the picker.
 */
export const DEFAULT_LAYOUT: readonly string[] = Object.freeze([
  'element-count',
  'category-donut',
  'level-bar',
  'material-area',
  'material-treemap',
  'takeoff-coverage',
  'selection-breakdown',
  'type-table',
  'change-table',
]);

export function widgetById(id: string): AnalysisWidgetDef | undefined {
  return WIDGET_CATALOGUE.find((w) => w.id === id);
}
