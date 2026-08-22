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

import { ANALYSIS_TABS, type AnalysisTabId, type AnalysisWidgetDef } from './AnalysisTypes';

// ── T1 / T2 — widgets with a real substrate ───────────────────────────────────

const BUILT: readonly AnalysisWidgetDef[] = Object.freeze([
  {
    id: 'element-count',
    tab: 'overview',
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
    tab: 'overview',
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
    tab: 'overview',
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
    tab: 'overview',
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
    tab: 'overview',
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
    tab: 'quantities',
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
    tab: 'quantities',
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
    tab: 'quantities',
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
    tab: 'quantities',
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
    tab: 'quantities',
    kind: 'table',
    title: 'Counted items (ud)',
    subtitle: 'Families present and counted but with no area, volume or length derived.',
    query: { id: 'takeoff:lines:ud', source: 'takeoff', groupBy: 'unit', measure: 'quantity', unit: 'ud', cost: 'O(n·m)' },
    refresh: 'manual',
    span: 1,
    notBuilt: null,
  },
  // ── The RELATIONAL widgets (ADR-0343 §D.7, STR-14 §4) ──────────────────────
  //
  // ⭐ These are the widgets the founder actually asked for — his reference
  // screenshot was a node-link diagram of Walls / Columns / Spaces with typed
  // edges. They read the Unified Building Graph, which ADR-0343 §D.4 ruled IN
  // for relational questions *"but only once it is maintained"*. L-3251 made it
  // maintained; these are the first consumers to depend on that.
  //
  // ⛔ They are NOT the census in a different shape. The UBG holds a node only
  // if some adapter projected a relationship touching it, so these cards answer
  // "what relates to what", never "how many walls are there".
  {
    id: 'relationship-graph',
    tab: 'relationships',
    kind: 'graph',
    title: 'Relationship graph',
    subtitle:
      'Elements as nodes, typed relations as edges, read live off the Building Graph. Click a node to select it.',
    query: {
      id: 'graph:relationship',
      source: 'graph',
      groupBy: 'relationship',
      measure: 'count',
      cost: 'O(n)',
    },
    // ⛔ NOT 'on-commit'. The graph maintains itself on the frame bus at its own
    // cadence; re-rendering an O(n²) force layout on every wall move would make
    // a dashboard the reason a frame is dropped, which §D.3 forbids outright.
    refresh: 'manual',
    span: 2,
    notBuilt: null,
  },
  {
    id: 'relationship-coverage',
    tab: 'relationships',
    kind: 'coverage',
    title: 'Relationship coverage — which edge families are real',
    subtitle:
      'The ten declared UBG edge types, each with its measured state. Four cannot be populated in production at all.',
    query: {
      id: 'graph:relationship',
      source: 'graph',
      groupBy: 'relationship',
      measure: 'count',
      cost: 'O(n)',
    },
    refresh: 'manual',
    span: 1,
    notBuilt: null,
  },
  {
    id: 'relationship-table',
    tab: 'relationships',
    kind: 'table',
    title: 'Relations by family',
    subtitle: 'Edge count per typed relation. Click a row to select every element that participates in it.',
    query: {
      id: 'graph:relationship',
      source: 'graph',
      groupBy: 'relationship',
      measure: 'count',
      cost: 'O(n)',
    },
    refresh: 'manual',
    span: 1,
    notBuilt: null,
  },
  // ── The AREA widgets (§ANALYSIS-AREA-STANDARDS, L-3640) ───────────────────
  //
  // ⭐ WHY THESE TWO EXIST AND THE CHANGE TABLE STILL DOES NOT. The founder's
  // brief separates them and the separation is real: a version diff is blocked
  // on a MISSING MODEL (stable element ids across saved versions), whereas the
  // area family was blocked on a DECISION. A decision can be taken and stated;
  // a missing model cannot be reasoned around.
  //
  // ⛔ THEY DO NOT CLAIM A STANDARD. Measured 2026-08-22: every `Room.area` in
  // this product is enclosed by the WALL CENTRELINES
  // (`geometry-kernel/src/producers/room.ts:64`), which is not the plane SIA,
  // IPMS or RICS measures on. So the figure is reported AS a centreline sum, the
  // selected standard's classes are listed with their real state, and the
  // centreline→face correction ships as a BRACKET rather than a point value.
  {
    id: 'area-by-level',
    tab: 'areas',
    kind: 'table',
    title: 'Floor area by storey — room centreline basis',
    subtitle:
      '⚠ NOT GFA, NIA or NGF. The area enclosed by the wall CENTRELINES of each room, summed per storey, with the ' +
      'centreline→face correction bracketed. Click a storey to select its rooms.',
    query: { id: 'area:level', source: 'area', groupBy: 'level', measure: 'quantity', unit: 'm2', cost: 'O(n)' },
    refresh: 'on-commit',
    span: 2,
    notBuilt: null,
  },
  {
    id: 'area-standard',
    tab: 'areas',
    kind: 'coverage',
    title: 'Measured-area standard — which classes this build can produce',
    subtitle:
      '⭐ The standard is named ON THIS CARD and is switchable. Every class states its measurement plane, so a ' +
      'reader can see that the standard asks for a face and this product measures a centreline.',
    query: { id: 'area:level', source: 'area', groupBy: 'level', measure: 'quantity', unit: 'm2', cost: 'O(n)' },
    refresh: 'on-commit',
    span: 2,
    notBuilt: null,
  },
  {
    id: 'takeoff-coverage',
    tab: 'quantities',
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
    tab: 'areas',
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
    tab: 'areas',
    kind: 'not-built',
    title: 'GFA / NIA and the GEA : NIA ratio',
    subtitle: 'Blocked on one decision: which measured-area standard PRYZM adopts.',
    query: null,
    refresh: 'manual',
    span: 1,
    notBuilt: {
      lede:
        'Still not built as GFA/NIA — but no longer for the reason this card used to give. This card said <em>"PRYZM has adopted none"</em>; a standard IS now selected and named on the <em>Measured-area standard</em> card above (default SIA 416, switchable), and a real per-storey area figure ships beside it. What is still missing is the MEASUREMENT PLANE: GFA and NIA are measured to a face and PRYZM measures to the wall centreline, so the figure this build can produce is neither of them and is labelled as neither.',
      have: [
        'Per-room computed areas, and slab/floor polygons with real geometry.',
        'A level hierarchy, which is the per-storey spine every area standard is organised around.',
        'A take-off that measures m² by a STATED basis — the machinery an area standard would plug into.',
      ],
      need: [
        '<strong>An adopted standard.</strong> IPMS, the RICS Code of Measuring Practice, SIA 416, or per-jurisdiction. They disagree about whether to include shafts, external walls, balconies and plant — so the same model has several different, all-correct GFAs.',
        '<strong>A per-space inclusion rule.</strong> Every room needs to know which measured-area class it belongs to. No space carries one today.',
        // ⚠ CORRECTED 2026-08-22 (§ANALYSIS-AREA-STANDARDS, L-3641). This row used to
        // read "<strong>Wall-centreline vs internal-face measurement.</strong> The
        // standards differ, and the difference is several percent on a real
        // building." - written as an OPEN QUESTION. It is not open: it has an
        // answer, and the answer was in the geometry kernel the whole time.
        // C01 §6 rule 6, cite the command:
        //   grep -n centerline packages/geometry-kernel/src/producers/room.ts
        //   -> :59, :64 - the room polygon IS the wall-centreline half-edge face.
        // What remains missing is not the choice; it is the per-EDGE thickness
        // attribution needed to convert exactly.
        '<strong>Per-edge wall thickness on the room boundary.</strong> ANSWERED, not open: PRYZM measures rooms on the wall CENTRELINE (<code>producers/room.ts:64</code>), and every standard measures to a face. The <em>Floor area by storey</em> card now reports that figure honestly and BRACKETS the correction from the thinnest and thickest bounding wall — an exact conversion needs each boundary edge attributed to its own wall, which the room cache does not keep.',
      ],
      close:
        'ADR-0343 §D.6 H3: a ratio needs BOTH operands MEASURED. GEA : NIA has neither. <code>targetGFA</code> exists in the schedule extractor and is a TARGET — rendering it as GFA would be inventing the measurement from the brief.',
    },
  },
  {
    id: 'sia-416',
    tab: 'areas',
    kind: 'not-built',
    title: 'SIA 416 surface table and ratio gauges',
    subtitle:
      '⚠ SIA 416 is now the SELECTED standard (see the card above). What is missing is the per-space ' +
      'SU/SP/SD/SC/SI category and a face-measured plane — not the choice.',
    query: null,
    refresh: 'manual',
    span: 1,
    notBuilt: {
      lede:
        '⚠ CORRECTED 2026-08-22. This card used to say <em>"Zero occurrences of SIA anywhere in this repository"</em> and <em>"The standard is absent from the codebase entirely"</em>. Both were true when written and BOTH ARE NOW FALSE: <code>areaStandards.ts</code> declares SIA 416’s eight classes, each with its measurement plane and its measured state, and SIA 416 is the default selection. What is genuinely still absent is the per-space category — no room in PRYZM carries SU / SP / SD / SC / SI, so the surface table cannot be filled and no ratio gauge has two measured operands.',
      have: [
        'Rooms with areas, a room-type vocabulary, and a normative program-rules database.',
        'A level hierarchy, which SIA 416 tables are organised per storey.',
      ],
      need: [
        '<strong>An SIA 416 category per space</strong> (SU Nutzfläche / SP Verkehrsfläche / SD Konstruktionsfläche / SC / SI). Mapping PRYZM room types onto it is a normative decision, not a lookup — and it must be authored, then reviewed.',
        '<strong>Construction area (SD).</strong> That is wall and shaft footprint, which needs the wall footprint polygons per storey, not the wall records.',
        '<strong>A measurement plane the model can honestly satisfy.</strong> SIA measures NGF to the inner face and GF to the outer; PRYZM measures rooms to the wall CENTRELINE. That is the same blocker the GFA/NIA card names and it is shared by every standard in the picker — which is exactly why the picker exists. (The jurisdiction caveat stands and is now printed on the standard card itself: SIA is Swiss, and its ratios mean something else elsewhere.)',
      ],
      close:
        'The gauges are four ratios of a table that does not exist. Drawing them at zero would put four confident dials on screen reporting a standard the product has never implemented.',
    },
  },
  {
    id: 'unit-mix',
    tab: 'areas',
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
    tab: 'areas',
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
/**
 * The default arrangement, PER TAB. §ANALYSIS-TABS (L-3304).
 *
 * ⛔ Order within a tab is the render order; a widget absent from every list is
 * in the picker, not on the dashboard. `DEFAULT_LAYOUT` below is retained as the
 * flat concatenation because the v1→v2 layout migration and two tests read it —
 * it is DERIVED from this table, never maintained beside it.
 */
export const DEFAULT_TAB_LAYOUT: Readonly<Record<AnalysisTabId, readonly string[]>> = Object.freeze({
  overview: Object.freeze(['element-count', 'category-donut', 'level-bar', 'type-table', 'selection-breakdown']),
  // ⭐ `takeoff-coverage` sits WITH the quantity figures it qualifies, not on a
  // tab of its own. Its subtitle says every quantity on this surface is read
  // against it; a coverage card one click away from the numbers it bounds is a
  // coverage card that has stopped working.
  quantities: Object.freeze(['material-area', 'material-treemap', 'takeoff-coverage', 'chapter-volume', 'linear-length', 'counted-items']),
  // Same rule: the graph ships beside the card naming the six edge families it
  // cannot draw.
  relationships: Object.freeze(['relationship-graph', 'relationship-coverage', 'relationship-table']),
  // Every widget here is NOT BUILT, and that is why they are together: a refusal
  // card scattered among working figures reads as a broken widget, whereas four
  // of them under a tab whose own lede says so reads as a declared boundary.
  // This tab is also where the founder's IPMS/RICS/SIA decision lands.
  // ⚠ NO LONGER an all-refusals tab (§ANALYSIS-AREA-STANDARDS, L-3640). The two
  // area widgets lead, because they are the ones that MEASURE; the four
  // refusals follow, each still naming what it is blocked on. The standard
  // ledger sits directly under the figure it qualifies — the same rule that
  // keeps `takeoff-coverage` on the Quantities tab rather than a tab of its own.
  areas: Object.freeze(['area-by-level', 'area-standard', 'gfa-nia', 'sia-416', 'unit-mix', 'tenure', 'change-table']),
});

/** Flat order across every tab. DERIVED — do not hand-maintain. */
export const DEFAULT_LAYOUT: readonly string[] = Object.freeze(
  ANALYSIS_TABS.flatMap((t) => [...DEFAULT_TAB_LAYOUT[t.id]]),
);

export function widgetById(id: string): AnalysisWidgetDef | undefined {
  return WIDGET_CATALOGUE.find((w) => w.id === id);
}
