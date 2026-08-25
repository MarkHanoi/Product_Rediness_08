// §RESI-MULTIFAMILY — the PURE brief → `ResidentialBuildingRequest` mapper.
//
// Extracted VERBATIM from `residentialFromBoundary.ts` (RAC U5b.1) so the
// typed GenerationRequest seam (`../generation/generationRequest.ts`) can
// import the ONE mapper implementation without dragging in the from-boundary
// module's value imports (controller singleton + siteDispatch), which touch
// window/stores at module load — the §SCC-no-barrel-access-at-module-load
// hazard for headless tests. `residentialFromBoundary.ts` re-exports this, so
// every existing import path is unchanged.
//
// PURE: no store reads, no DOM. Only a type import (erased at runtime).

import type { FacadeOpeningProgram } from '@pryzm/ai-host';
import type { ResidentialBuildingRequest } from './ResidentialBuildingController.js';

/** Footprint point (metres, plan XZ). */
export interface ResidentialFootprintPoint { readonly x: number; readonly z: number }

/** Defaults so the flow proceeds even if the user just clicked through the
 *  wizard (founder requirement: 5 floors, 60–100 m², T2 + T3). */
const DEFAULT_FLOORS = 5;
const DEFAULT_MIN_APT_M2 = 60;
const DEFAULT_MAX_APT_M2 = 100;

/** Read a finite positive number from the loosely-typed brief metadata. */
function readNumber(md: Record<string, unknown>, ...keys: string[]): number | undefined {
    for (const k of keys) {
        const raw = md[k];
        const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
        if (Number.isFinite(n) && n > 0) return n;
    }
    return undefined;
}

/** Read a `#rrggbb` hex colour string from the brief metadata. Accepts a 3- or 6-digit hex
 *  (expanding the short form). Absent / malformed ⇒ undefined. */
function readHexColor(md: Record<string, unknown>, ...keys: string[]): string | undefined {
    for (const k of keys) {
        const raw = md[k];
        if (typeof raw !== 'string') continue;
        const v = raw.trim();
        if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
        const m = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(v);
        if (m) return `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`.toLowerCase();
    }
    return undefined;
}

/**
 * §GEN-FACADE-OPENINGS (L-11080 · C108 Milestone 2) — read the PHOTOGRAPH'S measured opening
 * lattice out of the loosely-typed brief metadata.
 *
 * ⚠ VALIDATED STRUCTURALLY, NOT TRUSTED. The value arrives across the chat payload boundary as
 * `unknown`, and a malformed lattice would place windows at NaN offsets. Every field is checked
 * and a single bad cell drops THE WHOLE PROGRAM rather than half of it — a façade built from
 * half a measurement is worse than one built from none, because nothing would say so.
 *
 * ⛔ NO LENGTHS ARE ACCEPTED. Every accepted number is a ratio in (0,1] or a positive count
 * (C108 §2.2, L-11009); anything outside those ranges is not a lattice this code will build from.
 */
function readFacadeOpeningProgram(md: Record<string, unknown>): FacadeOpeningProgram | undefined {
    const raw = md['facadeOpeningProgram'];
    if (raw === null || typeof raw !== 'object') return undefined;
    const p = raw as Record<string, unknown>;
    const bays = typeof p['bays'] === 'number' ? p['bays'] : NaN;
    const bands = typeof p['bands'] === 'number' ? p['bands'] : NaN;
    if (!Number.isInteger(bays) || bays < 1) return undefined;
    if (!Number.isInteger(bands) || bands < 1) return undefined;
    const rawCells = p['cells'];
    if (!Array.isArray(rawCells) || rawCells.length === 0) return undefined;

    const ratio = (v: unknown): number | null =>
        typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 1 ? v : null;

    // Mutable while building; the returned program's own type is readonly.
    const cells: FacadeOpeningProgram['cells'][number][] = [];
    for (const rc of rawCells) {
        if (rc === null || typeof rc !== 'object') return undefined;
        const c = rc as Record<string, unknown>;
        const bayIndex = c['bayIndex'];
        const bandIndex = c['bandIndex'];
        const widthFraction = ratio(c['widthFraction']);
        const heightFraction = ratio(c['heightFraction']);
        const archness = c['archness'];
        if (typeof bayIndex !== 'number' || !Number.isInteger(bayIndex) || bayIndex < 0) return undefined;
        if (typeof bandIndex !== 'number' || !Number.isInteger(bandIndex) || bandIndex < 0 || bandIndex >= bands) return undefined;
        if (widthFraction === null || heightFraction === null) return undefined;
        if (typeof archness !== 'number' || !Number.isFinite(archness) || archness < 0 || archness > 1) return undefined;
        const confRaw = c['confidence'];
        cells.push({
            bayIndex, bandIndex, widthFraction, heightFraction, archness,
            // ⛔ `null` is UNKNOWN and is NOT zero (C108 §2.3). An absent or malformed
            // confidence becomes UNKNOWN, never a confident zero.
            confidence: typeof confRaw === 'number' && Number.isFinite(confRaw) ? confRaw : null,
        });
    }

    const rawBandH = p['bandHeightFractions'];
    const bandHeightFractions = Array.isArray(rawBandH)
        ? rawBandH.map((v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0))
        : [];
    const confRoot = p['confidence'];
    return {
        bays, bands, cells, bandHeightFractions,
        confidence: typeof confRoot === 'number' && Number.isFinite(confRoot) ? confRoot : null,
    };
}

/** Read a boolean-ish from the brief metadata. Absent ⇒ undefined. */
function readBool(md: Record<string, unknown>, ...keys: string[]): boolean | undefined {
    for (const k of keys) {
        const raw = md[k];
        if (typeof raw === 'boolean') return raw;
        if (typeof raw === 'string') {
            const v = raw.trim().toLowerCase();
            if (v === 'true' || v === 'yes' || v === '1') return true;
            if (v === 'false' || v === 'no' || v === '0') return false;
        }
    }
    return undefined;
}

/**
 * Map the captured RAC brief metadata (field-id keyed, typology-neutral here) to
 * a typed `ResidentialBuildingRequest`. Pure + defensive: any missing field falls
 * back to a sensible default so the controller always has a runnable program.
 * The `footprint` is threaded in by the caller (read from the parcel store).
 */
export function residentialRequestFromBrief(
    md: Record<string, unknown>,
    footprint: ReadonlyArray<ResidentialFootprintPoint>,
): ResidentialBuildingRequest {
    const floorsRaw = readNumber(md, 'floors', 'levels', 'upperLevels') ?? DEFAULT_FLOORS;
    const upperLevels = Math.max(1, Math.min(20, Math.round(floorsRaw)));

    const minApartmentAreaM2 = readNumber(md, 'minApartmentAreaM2', 'minAreaM2', 'apartmentMinM2') ?? DEFAULT_MIN_APT_M2;
    const maxRaw = readNumber(md, 'maxApartmentAreaM2', 'maxAreaM2', 'apartmentMaxM2') ?? DEFAULT_MAX_APT_M2;
    const maxApartmentAreaM2 = Math.max(maxRaw, minApartmentAreaM2);

    // Typologies: read explicit T1..T4 flags when present; else default to the
    // T2 + T3 mix (the typology pack's default residential mix). If NONE resolve
    // true we still fall back to T2 + T3 so the request is always feasible.
    const t1 = readBool(md, 'T1', 't1');
    const t2 = readBool(md, 'T2', 't2');
    const t3 = readBool(md, 'T3', 't3');
    const t4 = readBool(md, 'T4', 't4');
    const anyExplicit = [t1, t2, t3, t4].some((v) => typeof v === 'boolean');
    const typologies = anyExplicit && [t1, t2, t3, t4].some((v) => v === true)
        ? { T1: t1 === true, T2: t2 === true, T3: t3 === true, T4: t4 === true }
        : { T1: false, T2: true, T3: true, T4: false };

    const siteLatitudeDeg = readNumber(md, 'siteLatitudeDeg', 'latDeg', 'lat');
    // §RESI-PREVIEW-OPTIONS — the modal's four build options. roof-garden (default OFF),
    // balconies (default ON), façade colour (hex), ground commercial-curtain (default OFF).
    const roofGarden = readBool(md, 'roofGarden') === true;
    // §RESI-BALCONIES — default ON: only `false`/`no`/`0` turns it off; absent stays ON.
    const balconies = readBool(md, 'balconies') !== false;
    // §RESI-GROUND-COMMERCIAL-CURTAIN — default OFF (solid shell + big commercial windows).
    const groundCommercialCurtain = readBool(md, 'groundCommercialCurtain', 'groundCurtain') === true;
    // §RESI-FACADE-COLOUR — a #rrggbb hex finish colour from the modal colour picker (else default).
    const facadeColor = readHexColor(md, 'facadeColor', 'finishColor', 'facadeColour');
    // §GEN-FACADE-OPENINGS (L-11080) — the photograph's measured lattice, when one rode along.
    const facadeOpeningProgram = readFacadeOpeningProgram(md);

    return {
        upperLevels,
        minApartmentAreaM2,
        maxApartmentAreaM2,
        typologies,
        ...(typeof siteLatitudeDeg === 'number' ? { siteLatitudeDeg } : {}),
        ...(roofGarden ? { roofGarden: true } : {}),
        // Balconies are ON by default; only thread the flag when the modal turned it OFF.
        ...(balconies ? {} : { balconies: false }),
        ...(groundCommercialCurtain ? { groundCommercialCurtain: true } : {}),
        ...(facadeColor ? { facadeColor } : {}),
        ...(facadeOpeningProgram ? { facadeOpeningProgram } : {}),
        footprint,
    };
}
