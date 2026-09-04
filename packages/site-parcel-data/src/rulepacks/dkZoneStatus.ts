// §DK-ZONESTATUS (lane ENVELOPE-NLDK, 2026-09-04) — composite zone codes are DECOMPOSED, never
// flattened. DK doctrine RULE 8 (CONDITIONAL ≠ ALLOWED) and Phase 0 D5.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE CODELIST IS THE STATE'S, LIVE-PROBED — never guessed
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Plandata serves its zonestatus codelist keyless: `pdk:theme_pdk_codelist_zonestatus_v` on
// geoserver.plandata.dk, GetFeature → 7 rows (probed 2026-09-04, numberMatched 7). The table below
// is that response verbatim (aa/oe transliteration kept as served: "Sommerhusområde"). Phase 0 had
// observed only codes 1, 2, 4 and 7 in the data (dk-phase0-report.json §D5) and — correctly —
// refused to assert the meaning of 3, 5 and 6 from the data alone; the codelist now supplies them
// on the register's authority.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHY A COMPOSITE CODE MAY NOT BE FLATTENED (RULE 8)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// A lokalplan or kommuneplanramme whose `zonestatus` is `4 = Byzone og landzone` spans BOTH zones.
// A parcel under it is in ONE of them, and which one changes the legal regime: in landzone,
// Planloven §35 makes most building a landzonetilladelse matter — CONDITIONAL, never added to the
// deterministic volume (R8; doctrine 4.8: "Landzone ≠ automatic no-build"). Collapsing code 4 to
// `byzone` upgrades a conditional parcel to an unconditional one. Collapsing it to `landzone`
// refuses a parcel that may be plain byzone. Neither is the data; both are inventions.
//
// The parcel-level answer lives in a DIFFERENT layer: `pdk:theme_pdk_zonekort_v` (the zonekort,
// listed in the live GetCapabilities). So a composite plan code resolves through the zonekort at
// the point, and until that is consulted the honest state is the ratified `RuleState`
// `alternative` arm — the member zones, named, none picked.
//
// PURE (C58 §1.9). Deterministic. Emits the shared `RuleState` vocabulary against **B2** (zone code).

import type { RuleState } from '@pryzm/schemas';

/** The three Danish zones (Planloven §34). */
export type DkZone = 'byzone' | 'landzone' | 'sommerhusomraade';

export interface DkZonestatusRow {
    readonly code: number;
    /** Danish label, verbatim as served. */
    readonly text: string;
    readonly members: readonly DkZone[];
}

/** `pdk:theme_pdk_codelist_zonestatus_v`, live 2026-09-04 (7 rows). The `members` column is ours. */
export const DK_ZONESTATUS_CODELIST: readonly DkZonestatusRow[] = Object.freeze([
    { code: 1, text: 'Byzone', members: ['byzone'] },
    { code: 2, text: 'Landzone', members: ['landzone'] },
    { code: 3, text: 'Sommerhusområde', members: ['sommerhusomraade'] },
    { code: 4, text: 'Byzone og landzone', members: ['byzone', 'landzone'] },
    { code: 5, text: 'Sommerhusområde og landzone', members: ['sommerhusomraade', 'landzone'] },
    { code: 6, text: 'By og sommerhusområde', members: ['byzone', 'sommerhusomraade'] },
    { code: 7, text: 'Byzone, landzone og sommerhusområde', members: ['byzone', 'landzone', 'sommerhusomraade'] },
] as const);

/** `pdk:theme_pdk_codelist_fremtidigzonestatus_v`, live 2026-09-04 (6 rows). Carried as data. */
export const DK_FREMTIDIG_ZONESTATUS_CODELIST: readonly { readonly code: number; readonly text: string }[] = Object.freeze([
    { code: 1, text: 'Fremtidig byzone indenfor kommuneplanperioden' },
    { code: 2, text: 'Potentielt fremtidigt område til byzone' },
    { code: 3, text: 'Fremtidig sommerhusområde indenfor kommuneplanperioden' },
    { code: 4, text: 'Potentielt fremtidigt sommerhusområde' },
    { code: 5, text: 'Fremtidig tilbageførelse af byzone til landzone' },
    { code: 6, text: 'Fremtidig tilbageførelse af sommerhusområde til landzone' },
] as const);

export const DK_LANDZONE_R8_NOTE =
    'landzone is NOT automatic no-build (doctrine 4.8) and NOT an entitlement: building in landzone is ' +
    'generally a landzonetilladelse matter (Planloven §35) — CONDITIONAL volume, never added to the ' +
    'deterministic volume (R8).';

function toCode(raw: unknown): number | null {
    if (raw === null || raw === undefined || raw === '') return null;
    const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw).trim(), 10);
    return Number.isInteger(n) ? n : null;
}

/** Look up a codelist row by code (number or numeric string). Null for an unknown code. */
export function dkZonestatusRow(raw: unknown): DkZonestatusRow | null {
    const c = toCode(raw);
    if (c === null) return null;
    return DK_ZONESTATUS_CODELIST.find((r) => r.code === c) ?? null;
}

/** The zones a code denotes. Null for an unknown code — never an empty array, never a guess. */
export function decomposeDkZoneStatus(raw: unknown): readonly DkZone[] | null {
    return dkZonestatusRow(raw)?.members ?? null;
}

export function isCompositeDkZoneStatus(raw: unknown): boolean {
    const m = decomposeDkZoneStatus(raw);
    return m !== null && m.length > 1;
}

/** Read a zonekort value (code 1–3 or a Danish label) as one zone. Null when it is not a single zone. */
export function readDkZonekortZone(raw: unknown): DkZone | null {
    if (raw === null || raw === undefined || raw === '') return null;
    const row = dkZonestatusRow(raw);
    if (row !== null) return row.members.length === 1 ? row.members[0]! : null;
    const s = String(raw).trim().toLowerCase();
    if (s === 'byzone') return 'byzone';
    if (s === 'landzone') return 'landzone';
    if (s === 'sommerhusområde' || s === 'sommerhusomraade' || s === 'sommerhusomrade') return 'sommerhusomraade';
    return null;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// The parcel-level resolution
// ──────────────────────────────────────────────────────────────────────────────────────────────

export type DkParcelZoneResolution =
    /** 🟢 the plan code is a single zone. */
    | { readonly kind: 'single'; readonly zone: DkZone; readonly planCode: number }
    /** 🟢 the plan code is composite and the zonekort at the point names ONE member of it. */
    | { readonly kind: 'composite-resolved-by-zonekort'; readonly zone: DkZone; readonly planCode: number; readonly members: readonly DkZone[] }
    /** 🟡 composite, and no zonekort reading — the members are named, none picked. */
    | { readonly kind: 'composite-unresolved'; readonly planCode: number; readonly members: readonly DkZone[] }
    /** 🟠 the zonekort names a zone that is NOT a member of the plan's code — a data conflict. */
    | { readonly kind: 'zonekort-disagrees'; readonly planCode: number; readonly members: readonly DkZone[]; readonly zonekort: DkZone }
    /** ⚫ the code is not in the state codelist. */
    | { readonly kind: 'unknown-code'; readonly raw: unknown };

/**
 * Resolve the parcel's zone from the governing plan's `zonestatus` and (optionally) the zonekort
 * value at the point. Pure and total.
 */
export function resolveDkParcelZone(opts: {
    readonly planZoneStatus: unknown;
    /** `pdk:theme_pdk_zonekort_v` at the parcel's representative point; null/undefined = not consulted. */
    readonly zonekortAtPoint?: unknown;
}): DkParcelZoneResolution {
    const row = dkZonestatusRow(opts.planZoneStatus);
    if (row === null) return { kind: 'unknown-code', raw: opts.planZoneStatus };
    if (row.members.length === 1) return { kind: 'single', zone: row.members[0]!, planCode: row.code };
    const zk = readDkZonekortZone(opts.zonekortAtPoint);
    if (zk === null) return { kind: 'composite-unresolved', planCode: row.code, members: row.members };
    if (!row.members.includes(zk)) {
        return { kind: 'zonekort-disagrees', planCode: row.code, members: row.members, zonekort: zk };
    }
    return { kind: 'composite-resolved-by-zonekort', zone: zk, planCode: row.code, members: row.members };
}

/**
 * Project onto `RuleState` against **B2**.
 *
 *   single / composite-resolved → `resolved` (value = the zone), `source-complete`
 *   composite-unresolved        → `alternative` — the members, named. Reachability `derivable`
 *                                 (the zonekort layer resolves it; nothing is missing from the estate)
 *   zonekort-disagrees          → `unrecovered` / `semantic` / mechanism `present`
 *   unknown-code                → `unrecovered` / `semantic` / mechanism `unknown`
 */
export function dkZoneToRuleState(r: DkParcelZoneResolution, ref: RuleState['ref']): RuleState {
    switch (r.kind) {
        case 'single':
        case 'composite-resolved-by-zonekort':
            return {
                rule: 'B2',
                status: 'resolved',
                reachability: 'source-complete',
                value: r.zone,
                unit: null,
                datum: null,
                provenance: 'pipeline-extracted',
                ref,
            };
        case 'composite-unresolved':
            return {
                rule: 'B2',
                status: 'alternative',
                reachability: 'derivable',
                alternatives: r.members.map((m) => `${m} (plan zonestatus ${r.planCode} is composite; resolve via pdk:theme_pdk_zonekort_v at the point)`),
                ref,
            };
        case 'zonekort-disagrees':
            return {
                rule: 'B2',
                status: 'unrecovered',
                partial: null,
                reachability: 'source-complete',
                failure: 'semantic',
                mechanism: 'present',
                stoppedAt:
                    `zonekort says ${r.zonekort} but the plan's zonestatus ${r.planCode} spans only ` +
                    `${r.members.join(' / ')} — a source conflict, not resolved by choosing`,
                ref,
            };
        case 'unknown-code':
            return {
                rule: 'B2',
                status: 'unrecovered',
                partial: null,
                reachability: 'source-complete',
                failure: 'semantic',
                mechanism: 'unknown',
                stoppedAt: `zonestatus "${String(r.raw)}" is not in pdk:theme_pdk_codelist_zonestatus_v (7 codes, 2026-09-04)`,
                ref,
            };
    }
}
