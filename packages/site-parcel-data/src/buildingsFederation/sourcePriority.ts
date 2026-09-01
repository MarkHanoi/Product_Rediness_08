// LANE FED (E5 partial · DECISION-SUMMARY row 2) — THE BUILDINGS-FEDERATION SOURCE-PRIORITY
// MODEL, AS DATA. Row 2 verbatim: "Federation — Overture backbone + national LoD2/cadastre
// override + EUBUCCO year/type joins; adopt GERS as the conflation key. Keep ODbL layers
// SEPARABLE (never merge into one DB) — the one architectural licence constraint."
//
// WHAT THIS TABLE IS — and, per E4 control 6, WHAT IT IS NOT:
//   • It is the PRIORITY ORDERING (which source wins shape, which may only join attributes)
//     plus the two columns the federation boundary needs structurally: the licence CLASS
//     (drives the odblStore.ts typed boundary) and the usability STATUS.
//   • It is NOT a second Source Registry. Endpoints, protocols, probes, licence text refs,
//     coverage, cadence — every registry column — live ONLY on the `SiteIntelSource` rows in
//     `../sourceRegistry/`; each row here points at its registry row via `registryRef`, or
//     carries an HONEST null with a mandatory `registryGapReason` (control 9: an absent
//     registry row is recorded as absent, never invented — the Source Registry seeds only
//     from its named prose ancestors, and pan-EU sources have no §F country row yet; the gap
//     is recorded for the registry lane per control 10, not closed here).
//
// THE MS-GLOBALML ROW IS EXCLUDED, DELIBERATELY AND VISIBLY: its data licence reading
// (CDLA-Permissive-2.0, oss lane §3) is contradicted by a live lane item — DECISION-SUMMARY
// row 10(b) lists "MS GlobalML LICENSE" among the licence texts ONLY THE FOUNDER can
// authorise fetching verbatim. Until that closes, the row exists so the exclusion is a
// RECORDED FACT (control 10: record, do not use), and `assertUsableFederationSource`
// structurally refuses it as an input.
//
// TWO ADDITIONS 2026-09-01 FROM THE CONCURRENT E5 OSS-DELTA LANE — DATA ROWS, NEVER NEW
// ARCHITECTURE (impl/e5-oss-delta.md is the licence authority for both):
//   • `fed-jrc-ghs-obat` (§D6) — per-footprint height/epoch/function ALREADY JOINED to
//     Overture ids, ODbL at footprint level. Recorded at tier 3; refused as input because
//     the delta lane could not confirm WHICH id space "unique identifiers" means (GERS is
//     NOT CONFIRMED), and it is pinned to the Overture 2024-07-22.0 release, so id drift is
//     unmeasured. A join on an unverified key is a fabricated join (control 9).
//   • {@link FEDERATION_CONFLATION_STRATEGY} (§D1) — per country, whether the backbone
//     conflates to the national authority by a PUBLISHED BRIDGE FILE or by geometry. This
//     is the "per-country `conflation: bridge-file | geometric` flag — data, not
//     architecture" the delta lane asked for, verbatim.
//
// PURE DATA (C58 §1.9): validated at module load — a corrupted row is a BUILD error naming
// the row (same doctrine as ../sourceRegistry/defineSources.ts; not reused because that
// validator speaks zod over `SiteIntelSource` rows, a different row type — this one is a
// handful of invariants over a five-row table).

/** Federation-local source id — the conflation records' `source` axis. */
export type FederationSourceId =
    | 'fed-ee-etak-ehr-hooned'
    | 'fed-overture-buildings'
    | 'fed-eubucco-v01'
    | 'fed-jrc-ghs-obat'
    | 'fed-ms-globalml';

/**
 * Licence CLASS — only what the odblStore.ts boundary needs, never a registry
 * licence record (colour/verified-date/text-ref live on the registry row).
 *   • `odbl-share-alike`      — ODbL: derivative DATABASES must be share-alike →
 *                                rows may only enter an ODbL-tagged store.
 *   • `open-non-share-alike`  — open national/permissive terms, no share-alike →
 *                                rows may enter any store.
 *   • `unresolved`            — the licence has NOT been read (control 9: unknown
 *                                stays distinct) → rows enter NO store.
 */
export type FederationLicenceClass = 'odbl-share-alike' | 'open-non-share-alike' | 'unresolved';

/** What a source is ALLOWED to contribute, structurally. */
export type FederationSourceRole =
    /** Tier-1 national authority: shape wins outright; all attributes welcome. */
    | 'footprint-authority'
    /** Tier-2 backbone: shape only where tier 1 has none; attributes fill nulls. */
    | 'backbone'
    /** Tier-3 join: attributes onto existing buildings ONLY — never a shape. */
    | 'attribute-join';

export type FederationSourceStatus =
    /** May be fed into `federateBuildings`. */
    | 'usable'
    /** Recorded in the model, refused as input until its licence is read (control 9). */
    | 'blocked-licence'
    /**
     * Recorded in the model, licence READ and acceptable, but refused as input until the
     * KEY it joins on is verified at row level (control 9 — an unverified join key is not
     * a join, it is a guess wearing one).
     */
    | 'blocked-join-key'
    /** Recorded in the model, refused as input by founder/lane ruling (control 10). */
    | 'excluded';

export interface FederationSourceRow {
    readonly id: FederationSourceId;
    /** 1 = national LoD2/cadastre · 2 = Overture backbone · 3 = attribute joins. Lower wins. */
    readonly tier: 1 | 2 | 3;
    readonly role: FederationSourceRole;
    /**
     * → `SiteIntelSource.id` in ../sourceRegistry/ (control 6: THE registry), or
     * null when no registry row exists — then {@link registryGapReason} is
     * mandatory and names why, honestly.
     */
    readonly registryRef: string | null;
    readonly registryGapReason: string | null;
    readonly licence: FederationLicenceClass;
    readonly status: FederationSourceStatus;
    /** Why this row is in the model, with its audit citation. */
    readonly note: string;
}

/**
 * THE model. Ordering within the array is documentation; the binding axis is
 * `tier` (validated ascending here so the two can never disagree).
 */
export const BUILDINGS_FEDERATION_SOURCES: readonly FederationSourceRow[] = [
    {
        id: 'fed-ee-etak-ehr-hooned',
        tier: 1,
        role: 'footprint-authority',
        registryRef: 'ee-etak-ehr-hooned-wfs',
        registryGapReason: null,
        licence: 'open-non-share-alike',
        status: 'usable',
        note:
            'EE national override — the state-conflated ETAK↔EHR buildings layer '
            + '(countryAdapters/ee/eeBuildingsProvider.ts; E1d lane). Estonian open-data '
            + 'licence per the registry row. The exemplar tier-1 source: each country adapter '
            + 'contributes its own tier-1 row as it lands (lane 4 sequencing).',
    },
    {
        id: 'fed-overture-buildings',
        tier: 2,
        role: 'backbone',
        registryRef: null,
        registryGapReason:
            'No Source Registry row: the registry seeds row-for-row from its named prose '
            + 'ancestors and frames rows by REPORT §F country; Overture is pan-EU. Recorded '
            + 'for the registry lane (control 10) — when a row is minted, point registryRef '
            + 'at it and delete this reason.',
        licence: 'odbl-share-alike',
        status: 'usable',
        note:
            'The pan-EU backbone (oss lane §2: monthly GeoParquet on S3, GERS ids, ODbL '
            + '"because it includes OpenStreetMap data"). Access path ADOPTED from '
            + 'tools/context-bake/bake.mjs §BAKE-OVERTURE (anonymous S3, release pinned at '
            + '2026-07-22.0) and probed live by this lane: 1185 rows over the Tallinn/Kopli '
            + 'AOI. ODbL ⇒ separability: rows only ever enter an ODbL-tagged store '
            + '(odblStore.ts).',
    },
    {
        id: 'fed-eubucco-v01',
        tier: 3,
        role: 'attribute-join',
        registryRef: null,
        registryGapReason:
            'No Source Registry row (same §F-country framing gap as Overture); additionally '
            + 'the DATA licence is per-country and unread — oss lane §1: "MUST be resolved '
            + 'per country before commercial use".',
        licence: 'unresolved',
        status: 'blocked-licence',
        note:
            'EUBUCCO year/type joins (row 2 names it; oss lane §1: construction year 15.9%, '
            + 'height largely MODELLED). Recorded at tier 3, attribute-join ONLY — and '
            + 'refused as input until its per-country licence is read (control 9: unresolved '
            + '≠ open).',
    },
    {
        id: 'fed-jrc-ghs-obat',
        tier: 3,
        role: 'attribute-join',
        registryRef: null,
        registryGapReason:
            'No Source Registry row (same §F-country framing gap as Overture — JRC GHSL is '
            + 'global). Recorded for the registry lane (control 10).',
        licence: 'odbl-share-alike',
        status: 'blocked-join-key',
        note:
            'JRC GHS-OBAT R2024A (e5-oss-delta §D6): 2.3B footprints carrying height, '
            + 'construction epoch and function ALREADY joined to Overture ids — a JOIN, not a '
            + 'conflation, and the cheapest attribute enrichment for countries with no '
            + 'national height source. Footprint-level CSV/GPKG is ODbL v1.0 (page-stated), so '
            + 'the same separability applies as to Overture itself. REFUSED as input pending '
            + 'the two checks the delta lane could not close: (1) which id space "unique '
            + 'identifiers" is — GERS is NOT CONFIRMED; (2) drift against the Overture '
            + '2024-07-22.0 release it is pinned to, versus the 2026-07-22.0 release this '
            + 'scaffold reads. Its values are MODELLED throughout and sit BELOW every '
            + 'national source.',
    },
    {
        id: 'fed-ms-globalml',
        tier: 3,
        role: 'attribute-join',
        registryRef: null,
        registryGapReason: 'No Source Registry row; source is excluded (see status).',
        licence: 'unresolved',
        status: 'excluded',
        note:
            'EXCLUDED — licence unverified: the oss-lane CDLA-Permissive reading is '
            + 'contradicted by DECISION-SUMMARY row 10(b), which reserves fetching the MS '
            + 'GlobalML LICENSE text to the founder ("a live lane contradiction"). Recorded '
            + 'so the exclusion is visible (control 10); consumed via Overture anyway where '
            + 'it matters (oss lane §3: "one ingestion path, not three").',
    },
];

/* ───────────────── per-country conflation strategy (e5-oss-delta §D1) ─────────────────── */

/** How the backbone is joined to the national authority for one country. */
export type FederationConflationStrategy =
    /** Overture publishes a bridge file mapping GERS ids onto that country's authority ids. */
    | 'bridge-file'
    /** No published bridge: the geometric matcher (GERS-where-both, else IoU) is the only way. */
    | 'geometric';

/** Whether a bridge may actually be CONSUMED today — separate from whether one exists. */
export type FederationBridgeStatus =
    /** A bridge exists and its licence permits use. (No row is here yet — see §D1.) */
    | 'consumable'
    /** A bridge exists; the bridge-files page states NO licence, so it stays unread (control 9). */
    | 'blocked-licence'
    /** No bridge is published for this country. */
    | 'none';

export interface FederationConflationRow {
    /** ISO-3166 alpha-2. */
    readonly country: string;
    readonly strategy: FederationConflationStrategy;
    /** The bridged authority as Overture names it, or null when unbridged. */
    readonly bridgedAuthority: string | null;
    readonly bridgeStatus: FederationBridgeStatus;
    readonly note: string;
}

/**
 * The bridge/geometry flag, per country, as DATA.
 *
 * ⚠ ABSENCE IS NOT `'geometric'`. A country with no row here has NOT been assessed;
 * {@link conflationStrategyFor} returns `null` for it and callers must read that as UNKNOWN
 * (control 9). Only countries the delta lane actually read off the bridge-files page are
 * listed — in either direction.
 */
export const FEDERATION_CONFLATION_STRATEGY: readonly FederationConflationRow[] = [
    {
        country: 'ES',
        strategy: 'bridge-file',
        bridgedAuthority: 'Instituto Geográfico Nacional (España)',
        bridgeStatus: 'blocked-licence',
        note:
            'e5-oss-delta §D1: the bridge-files release (2026-08-19.0) lists IGN-España among '
            + 'its bridged datasets, so ES conflation is a LOOKUP, not a computation — Pryzm '
            + 'should not run a footprint matcher for Spain. NOT consumable yet: the '
            + 'bridge-files page states no licence (§6.4 gap 1) and the ES partition existence '
            + 'is still unprobed. Recorded so the geometric matcher is not adopted for ES by '
            + 'default.',
    },
    {
        country: 'EE',
        strategy: 'geometric',
        bridgedAuthority: null,
        bridgeStatus: 'none',
        note:
            'Estonia is NOT in the bridged-dataset list (e5-oss-delta §D1 quotes it verbatim: '
            + 'Esri Community Maps, geoBoundaries, IGN-España, Meta Places, Microsoft Places, '
            + 'OpenStreetMap, PinMeTo). The geometric matcher is the only path — which is what '
            + 'this lane probe exercises, and part of why Tallinn is the AOI.',
    },
    {
        country: 'DE',
        strategy: 'geometric',
        bridgedAuthority: null,
        bridgeStatus: 'none',
        note: 'ALKIS / LoD2-DE is not a bridged dataset (e5-oss-delta §D1).',
    },
    {
        country: 'NL',
        strategy: 'geometric',
        bridgedAuthority: null,
        bridgeStatus: 'none',
        note: 'BAG is not a bridged dataset (e5-oss-delta §D1).',
    },
    {
        country: 'DK',
        strategy: 'geometric',
        bridgedAuthority: null,
        bridgeStatus: 'none',
        note: 'The DK cadastre is not a bridged dataset (e5-oss-delta §D1).',
    },
];

/**
 * The conflation row for a country, or `null` when the country has NOT been
 * assessed — never a `'geometric'` default (control 9: unknown stays distinct).
 */
export function conflationStrategyFor(country: string): FederationConflationRow | null {
    return FEDERATION_CONFLATION_STRATEGY.find((r) => r.country === country) ?? null;
}

/* ─────────────────────────────── lookups + gates ─────────────────────────────────────── */

/** Row lookup. Total over {@link FederationSourceId} by the load-time validation below. */
export function federationSourceRow(id: FederationSourceId): FederationSourceRow {
    const row = BUILDINGS_FEDERATION_SOURCES.find((r) => r.id === id);
    /* v8 ignore next 3 — unreachable while the load-time validation passes. */
    if (!row) throw new Error(`[buildingsFederation] no source row '${id}'`);
    return row;
}

/**
 * Structural gate at the module's input edge: only a `status: 'usable'` row may
 * contribute candidates. Returns the row on success; a refusal NAMES the row
 * and its reason — an excluded/blocked source failing silently would be the
 * exact defect control 10 exists to prevent.
 */
export function assertUsableFederationSource(id: FederationSourceId): FederationSourceRow {
    const row = federationSourceRow(id);
    if (row.status !== 'usable') {
        throw new Error(
            `[buildingsFederation] source '${id}' is ${row.status.toUpperCase()} and must not `
            + `be used as an input: ${row.registryGapReason ?? row.note}`,
        );
    }
    return row;
}

/**
 * The licence class of a USABLE row, narrowed away from `'unresolved'`.
 *
 * The load-time validation already forbids `unresolved` + `usable`, so this is
 * total for any row {@link assertUsableFederationSource} returned — but it
 * narrows the TYPE without a cast, which is the point: a cast here would be the
 * one place an unread licence could reach the store boundary silently.
 */
export function usableLicenceClass(
    row: FederationSourceRow,
): Exclude<FederationLicenceClass, 'unresolved'> {
    /* v8 ignore next 6 — unreachable: 'unresolved' + 'usable' fails module-load validation. */
    if (row.licence === 'unresolved') {
        throw new Error(
            `[buildingsFederation] source '${row.id}' has an UNRESOLVED licence and cannot `
            + `contribute to a federated record`,
        );
    }
    return row.licence;
}

// ─── Load-time validation (a corrupted row is a BUILD error naming the row) ───
(function validateFederationSources(rows: readonly FederationSourceRow[]): void {
    const seen = new Set<string>();
    let lastTier = 0;
    for (const r of rows) {
        const where = `[buildingsFederation] source row '${r.id}'`;
        if (seen.has(r.id)) throw new Error(`${where}: duplicate id`);
        seen.add(r.id);
        if (r.tier < lastTier) throw new Error(`${where}: tiers must be ascending in the table`);
        lastTier = r.tier;
        // registryRef XOR registryGapReason — a row must reference THE registry or say why not.
        if ((r.registryRef === null) === (r.registryGapReason === null)) {
            throw new Error(`${where}: exactly one of registryRef / registryGapReason must be set`);
        }
        // An unresolved licence can never be 'usable' (control 9).
        if (r.licence === 'unresolved' && r.status === 'usable') {
            throw new Error(`${where}: licence 'unresolved' cannot be 'usable'`);
        }
        // Only tier 1 may own shapes outright; only tier 3 may be attribute-join.
        if ((r.role === 'footprint-authority') !== (r.tier === 1)) {
            throw new Error(`${where}: role 'footprint-authority' ⇔ tier 1`);
        }
        if (r.role === 'attribute-join' && r.tier !== 3) {
            throw new Error(`${where}: role 'attribute-join' ⇒ tier 3`);
        }
    }
})(BUILDINGS_FEDERATION_SOURCES);

// ─── Load-time validation of the conflation table ───
(function validateConflationRows(rows: readonly FederationConflationRow[]): void {
    const seen = new Set<string>();
    for (const r of rows) {
        const where = `[buildingsFederation] conflation row '${r.country}'`;
        if (!/^[A-Z]{2}$/.test(r.country)) throw new Error(`${where}: country must be ISO alpha-2`);
        if (seen.has(r.country)) throw new Error(`${where}: duplicate country`);
        seen.add(r.country);
        // A bridge row must name its bridged authority; a geometric row must not pretend to one.
        if ((r.strategy === 'bridge-file') !== (r.bridgedAuthority !== null)) {
            throw new Error(`${where}: strategy 'bridge-file' ⇔ a named bridgedAuthority`);
        }
        if ((r.strategy === 'geometric') !== (r.bridgeStatus === 'none')) {
            throw new Error(`${where}: strategy 'geometric' ⇔ bridgeStatus 'none'`);
        }
    }
})(FEDERATION_CONFLATION_STRATEGY);
