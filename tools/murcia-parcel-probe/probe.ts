/**
 * MURCIA PARCEL PROBE — refcat (or lat/lon) in, everything-we-can-honestly-say out.
 *
 *   npx tsx tools/murcia-parcel-probe/probe.ts --refcat 3481104XH6038S
 *   npx tsx tools/murcia-parcel-probe/probe.ts --lat 38.006100 --lon -1.138028
 *   npx tsx tools/murcia-parcel-probe/probe.ts --refcat 3481104XH6038S --json out.json
 *
 * Either input works, and supplying BOTH is the strongest run: the probe then
 * reports the DISTANCE between the supplied pin and the parcel Catastro resolves,
 * plus whether the pin falls inside the parcel ring. That pair is the direct
 * answer to a screening report that claims "no plausible cadastral parcel near
 * the pin" — it either does or it does not, in metres.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT DO ───────────────────────────────────────
 * It does not invent an envelope. When no encoded rule pack governs the parcel it
 * emits a REFUSAL with a reason — which is a correct answer, not a gap. L-616
 * shipped a massing that ignored a FAR ceiling (~5× over) and drew an unknown
 * setback as zero; that is the failure this path exists to prevent.
 */

import { writeFileSync } from 'node:fs';
import {
    buildingsByRefcatUrl,
    fetchXml,
    getRequestCount,
    parcelByRefcatUrl,
    reverseGeocodeUrl,
    type ClientOptions,
    type Fetched,
} from './catastro.js';
import {
    distanceM,
    ineMunicipalityCode,
    parseBuildingParts,
    parseParcelGml,
    parseReverseGeocode,
    pointInRing,
    type BuildingPart,
    type LatLon,
    type ParcelGeometry,
    type ReverseCandidate,
} from './parse.js';

/** INE code for the municipality of Murcia. */
export const INE_MURCIA = '30030';

export interface ProbeInput {
    readonly refcat?: string;
    readonly pin?: LatLon;
    readonly options?: ClientOptions;
}

export interface StepResult {
    readonly step: string;
    readonly url: string;
    readonly outcome: Fetched['outcome'];
    readonly httpStatus: number | null;
    readonly ms: number;
    readonly bytes: number | null;
    readonly message: string | null;
}

export interface ProbeReport {
    readonly observedAt: string;
    readonly input: { refcat: string | null; pin: LatLon | null };
    /** Every upstream call with its distinct outcome. Never collapsed. */
    readonly steps: StepResult[];
    readonly requestCount: number;

    readonly resolvedRefcat: string | null;
    readonly reverseCandidates: ReverseCandidate[];
    /** INE municipality composed from OVC `<cp>`+`<cm>`, and whether it is Murcia. */
    readonly ineMunicipality: string | null;
    readonly isMurcia: boolean | null;

    readonly parcel: ParcelGeometry | null;
    /** |official − derived| in m², and as a fraction of the official area. */
    readonly areaCrossCheck: { deltaM2: number; deltaPct: number } | null;
    /** Distance (m) from the supplied pin to the parcel reference point. */
    readonly pinToReferencePointM: number | null;
    /** Does the supplied pin fall inside the resolved parcel ring? */
    readonly pinInsideParcel: boolean | null;

    /**
     * `null` means we never got a usable answer from the buildings service.
     * `[]` with `buildingsAreGenuinelyAbsent: true` means the service ANSWERED and
     * the plot is vacant. These are different facts and are never merged.
     */
    readonly buildingParts: BuildingPart[] | null;
    readonly buildingsAreGenuinelyAbsent: boolean;
    readonly maxFloorsAboveGround: number | null;

    readonly notes: string[];
}

function toStep(step: string, f: Fetched): StepResult {
    return {
        step,
        url: f.url,
        outcome: f.outcome,
        httpStatus: f.httpStatus,
        ms: f.ms,
        bytes: f.body ? f.body.length : null,
        message: f.message,
    };
}

/** Run the full probe. NEVER throws — every failure becomes a recorded step. */
export async function probeParcel(input: ProbeInput): Promise<ProbeReport> {
    const observedAt = new Date().toISOString();
    const steps: StepResult[] = [];
    const notes: string[] = [];
    const opts = input.options ?? {};

    let resolvedRefcat = input.refcat ? input.refcat.trim().toUpperCase() : null;
    let reverseCandidates: ReverseCandidate[] = [];
    let ineMunicipality: string | null = null;

    // ── 1. Reverse geocode, when a pin was supplied ──────────────────────────
    if (input.pin) {
        const url = reverseGeocodeUrl(input.pin.lat, input.pin.lon);
        const res = await fetchXml(url, opts);
        steps.push(toStep('reverse-geocode', res));
        if (res.outcome === 'ok' && res.body) {
            reverseCandidates = parseReverseGeocode(res.body);
            const nearest = reverseCandidates[0];
            if (nearest) {
                ineMunicipality = ineMunicipalityCode(nearest);
                if (!resolvedRefcat) {
                    resolvedRefcat = nearest.refcat;
                    notes.push(
                        `Refcat ${nearest.refcat} resolved FROM the pin at ${nearest.distanceM} m (OVC <dis>).`,
                    );
                } else if (nearest.refcat !== resolvedRefcat) {
                    const match = reverseCandidates.find((c) => c.refcat === resolvedRefcat);
                    notes.push(
                        match
                            ? `⚠ The supplied refcat ${resolvedRefcat} is NOT the nearest to the pin — it is candidate #${reverseCandidates.indexOf(match) + 1} at ${match.distanceM} m. Nearest is ${nearest.refcat} at ${nearest.distanceM} m.`
                            : `⚠ The supplied refcat ${resolvedRefcat} does not appear among the ${reverseCandidates.length} candidates the pin returns. The pin and the refcat may describe different plots.`,
                    );
                } else {
                    notes.push(
                        `Pin and supplied refcat AGREE: ${resolvedRefcat} is the nearest candidate at ${nearest.distanceM} m.`,
                    );
                }
            }
        } else if (res.outcome === 'ovc-error') {
            // Distinct, and it is NOT "there is no parcel here".
            notes.push(
                `Reverse geocode returned an OVC error envelope (${res.message}). That is an upstream refusal, not evidence that the point has no parcel.`,
            );
        }
    }

    if (!resolvedRefcat) {
        return {
            observedAt,
            input: { refcat: input.refcat ?? null, pin: input.pin ?? null },
            steps,
            requestCount: getRequestCount(),
            resolvedRefcat: null,
            reverseCandidates,
            ineMunicipality,
            isMurcia: ineMunicipality ? ineMunicipality === INE_MURCIA : null,
            parcel: null,
            areaCrossCheck: null,
            pinToReferencePointM: null,
            pinInsideParcel: null,
            buildingParts: null,
            buildingsAreGenuinelyAbsent: false,
            maxFloorsAboveGround: null,
            notes: [...notes, 'No referencia catastral could be established — nothing further can be said.'],
        };
    }

    // ── 2. Parcel geometry by refcat (identifier join, not a pin guess) ──────
    const parcelUrl = parcelByRefcatUrl(resolvedRefcat);
    const parcelRes = await fetchXml(parcelUrl, opts);
    steps.push(toStep('parcel-by-refcat', parcelRes));
    let parcel: ParcelGeometry | null = null;
    if (parcelRes.outcome === 'ok' && parcelRes.body) {
        parcel = parseParcelGml(parcelRes.body);
        if (!parcel) {
            notes.push(
                'The parcel service answered 200 with a complete document, but no exterior ring could be parsed. That is a PARSER or schema-change problem, not an absent parcel.',
            );
        }
    } else if (parcelRes.outcome === 'empty') {
        notes.push(
            `The parcel service answered and returned ZERO features for ${resolvedRefcat}. The reference may be retired, or malformed.`,
        );
    }

    let areaCrossCheck: { deltaM2: number; deltaPct: number } | null = null;
    if (parcel && parcel.areaOfficialM2 != null) {
        const delta = Math.abs(parcel.areaOfficialM2 - parcel.areaDerivedM2);
        areaCrossCheck = {
            deltaM2: Number(delta.toFixed(2)),
            deltaPct: Number(((delta / parcel.areaOfficialM2) * 100).toFixed(3)),
        };
    }

    let pinToReferencePointM: number | null = null;
    let pinInsideParcel: boolean | null = null;
    if (input.pin && parcel) {
        if (parcel.referencePoint) {
            pinToReferencePointM = Number(distanceM(input.pin, parcel.referencePoint).toFixed(2));
        }
        pinInsideParcel = pointInRing(input.pin, parcel.ring);
    }

    // ── 3. Buildings + ALTURAS (floors above ground) ─────────────────────────
    const buUrl = buildingsByRefcatUrl(resolvedRefcat, 'GetBuildingPartByParcel');
    const buRes = await fetchXml(buUrl, opts);
    steps.push(toStep('buildingparts-by-refcat', buRes));

    let buildingParts: BuildingPart[] | null = null;
    let buildingsAreGenuinelyAbsent = false;
    if (buRes.outcome === 'ok' && buRes.body) {
        buildingParts = parseBuildingParts(buRes.body);
        if (buildingParts.length === 0) {
            notes.push(
                '⚠ The buildings service returned features but none parsed as a BuildingPart. Check the namespace (Catastro serves `bu-ext2d:BuildingPart`, not `bu:`).',
            );
        }
    } else if (buRes.outcome === 'empty') {
        // Corroborate with a second, independent stored query before claiming vacancy.
        const allUrl = buildingsByRefcatUrl(resolvedRefcat, 'GetAllConstructionByParcel');
        const allRes = await fetchXml(allUrl, opts);
        steps.push(toStep('allconstruction-by-refcat', allRes));
        if (allRes.outcome === 'empty') {
            buildingParts = [];
            buildingsAreGenuinelyAbsent = true;
            notes.push(
                'VACANT: two independent stored queries (GetBuildingPartByParcel and GetAllConstructionByParcel) each returned a well-formed FeatureCollection with zero features. This is a real answer — the plot carries no registered construction — NOT a fetch failure.',
            );
        } else if (allRes.outcome === 'ok' && allRes.body) {
            buildingParts = parseBuildingParts(allRes.body);
            notes.push(
                '⚠ GetBuildingPartByParcel was empty but GetAllConstructionByParcel was not. The parcel carries construction that is not a BuildingPart (e.g. other constructions only).',
            );
        }
    }

    const floors = (buildingParts ?? [])
        .map((b) => b.floorsAboveGround)
        .filter((n): n is number => typeof n === 'number');
    const maxFloorsAboveGround = floors.length > 0 ? Math.max(...floors) : null;

    // Municipality gate — route from the DATA, never from a caller-supplied country.
    if (!ineMunicipality && parcel && parcel.referencePoint) {
        const url = reverseGeocodeUrl(parcel.referencePoint.lat, parcel.referencePoint.lon);
        const res = await fetchXml(url, opts);
        steps.push(toStep('reverse-geocode-from-parcel-centroid', res));
        if (res.outcome === 'ok' && res.body) {
            const cands = parseReverseGeocode(res.body);
            if (reverseCandidates.length === 0) reverseCandidates = cands;
            const self = cands.find((c) => c.refcat === resolvedRefcat) ?? cands[0];
            if (self) ineMunicipality = ineMunicipalityCode(self);
        }
    }

    return {
        observedAt,
        input: { refcat: input.refcat ?? null, pin: input.pin ?? null },
        steps,
        requestCount: getRequestCount(),
        resolvedRefcat,
        reverseCandidates,
        ineMunicipality,
        isMurcia: ineMunicipality ? ineMunicipality === INE_MURCIA : null,
        parcel,
        areaCrossCheck,
        pinToReferencePointM,
        pinInsideParcel,
        buildingParts,
        buildingsAreGenuinelyAbsent,
        maxFloorsAboveGround,
        notes,
    };
}

// ── Human-readable rendering ─────────────────────────────────────────────────

export function renderReport(r: ProbeReport): string {
    const L: string[] = [];
    const p = r.parcel;
    L.push('═══ MURCIA PARCEL PROBE ═══════════════════════════════════════════');
    L.push(`observed        ${r.observedAt}`);
    L.push(`input           refcat=${r.input.refcat ?? '—'}  pin=${r.input.pin ? `${r.input.pin.lat}, ${r.input.pin.lon}` : '—'}`);
    L.push(`upstream calls  ${r.requestCount}`);
    L.push('');
    L.push('── TRANSPORT (every outcome kept distinct) ─────────────────────────');
    for (const s of r.steps) {
        L.push(`  ${s.outcome.padEnd(14)} ${String(s.httpStatus ?? '—').padEnd(4)} ${String(s.bytes ?? '—').padEnd(7)}B ${s.ms}ms  ${s.step}`);
        if (s.message) L.push(`                 └─ ${s.message}`);
    }
    L.push('');
    L.push('── VERIFIED (read from a live upstream response) ───────────────────');
    L.push(`  referencia catastral   ${r.resolvedRefcat ?? 'UNKNOWN'}`);
    L.push(`  INE municipality       ${r.ineMunicipality ?? 'UNKNOWN'}${r.isMurcia === true ? ' (Murcia ✓)' : r.isMurcia === false ? ' (NOT Murcia)' : ''}`);
    if (p) {
        L.push(`  official area          ${p.areaOfficialM2 != null ? `${p.areaOfficialM2} m²  (INSPIRE cp:areaValue)` : 'UNKNOWN — not published'}`);
        L.push(`  derived area (ours)    ${p.areaDerivedM2.toFixed(1)} m²  (shoelace — NOT official)`);
        if (r.areaCrossCheck) {
            L.push(`  area cross-check       Δ ${r.areaCrossCheck.deltaM2} m² (${r.areaCrossCheck.deltaPct} %)`);
        }
        L.push(`  ring vertices          ${p.ring.length}`);
        L.push(`  CRS returned           ${p.srsName ?? 'UNKNOWN'}  (axis order lat,lon for EPSG:4326)`);
        L.push(`  reference point        ${p.referencePoint ? `${p.referencePoint.lat}, ${p.referencePoint.lon}` : 'UNKNOWN'}`);
        L.push(`  cadastral version      ${p.beginLifespanVersion ?? 'UNKNOWN'}  (cp:beginLifespanVersion)`);
    } else {
        L.push('  geometry               UNKNOWN — no parcel ring obtained');
    }
    if (r.pinToReferencePointM != null) {
        L.push(`  pin → parcel refpoint  ${r.pinToReferencePointM} m`);
    }
    if (r.pinInsideParcel != null) {
        L.push(`  pin inside the ring    ${r.pinInsideParcel ? 'YES' : 'NO'}`);
    }
    L.push('');
    L.push('── EXISTING BUILDINGS (ALTURAS) ────────────────────────────────────');
    if (r.buildingParts == null) {
        L.push('  UNKNOWN — the buildings service did not return a usable answer.');
        L.push('  (This is NOT "no buildings". Absence was never established.)');
    } else if (r.buildingsAreGenuinelyAbsent) {
        L.push('  VACANT — 0 registered constructions, corroborated by two stored queries.');
    } else {
        L.push(`  ${r.buildingParts.length} building part(s); max floors above ground = ${r.maxFloorsAboveGround ?? 'UNKNOWN'}`);
        for (const b of r.buildingParts) {
            L.push(`    ${(b.localId ?? '—').padEnd(22)} above=${b.floorsAboveGround ?? '?'} below=${b.floorsBelowGround ?? '?'} verts=${b.ring.length}`);
        }
    }
    if (r.reverseCandidates.length > 0) {
        L.push('');
        L.push(`── NEAREST CADASTRAL CANDIDATES TO THE PIN (n = ${r.reverseCandidates.length}) ──`);
        for (const c of r.reverseCandidates.slice(0, 5)) {
            L.push(`  ${c.distanceM.toString().padStart(7)} m  ${c.refcat}  ${c.address ?? ''}`);
        }
    }
    if (r.notes.length > 0) {
        L.push('');
        L.push('── NOTES ───────────────────────────────────────────────────────────');
        for (const n of r.notes) L.push(`  • ${n}`);
    }
    L.push('');
    L.push('── ENVELOPE ────────────────────────────────────────────────────────');
    L.push('  Not computed by this probe. The envelope verdict — a computed envelope');
    L.push('  or a CITED REFUSAL — is produced by the rule-pack path in');
    L.push('  packages/site-parcel-data (rulepacks/esMurciaEnvelope.ts). A refusal');
    L.push('  with a reason is a correct answer; a fabricated envelope is not.');
    return L.join('\n');
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function arg(name: string): string | undefined {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

const isMain = process.argv[1]?.replace(/\\/g, '/').endsWith('murcia-parcel-probe/probe.ts');
if (isMain) {
    const refcat = arg('refcat');
    const latRaw = arg('lat');
    const lonRaw = arg('lon');
    const jsonOut = arg('json');
    const lat = latRaw != null ? Number.parseFloat(latRaw) : Number.NaN;
    const lon = lonRaw != null ? Number.parseFloat(lonRaw) : Number.NaN;
    const pin = Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : undefined;

    if (!refcat && !pin) {
        console.error('Usage: probe.ts --refcat <REFCAT> | --lat <LAT> --lon <LON> [--json out.json]');
        process.exit(2);
    }
    const input: ProbeInput = { options: { onRequest: (u) => console.error(`→ ${u}`) } };
    await probeParcel({ ...input, refcat, pin })
        .then((report) => {
            console.log(renderReport(report));
            if (jsonOut) {
                writeFileSync(jsonOut, JSON.stringify(report, null, 2), 'utf8');
                console.error(`\nJSON written to ${jsonOut}`);
            }
        })
        .catch((e: unknown) => {
            console.error('probe failed:', e);
            process.exit(1);
        });
}
