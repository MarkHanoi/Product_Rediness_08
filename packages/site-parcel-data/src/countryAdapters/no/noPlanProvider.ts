// E7-NO — NORWAY (NO) · plan arm: NAP reguleringsplaner, read through WMS GetFeatureInfo.
//
// §J: `planGeometry: PlanProvider — zones, plans, prescriptions, restrictions (typed
// outcomes)`. Schema mapping ONLY — the raw property bags ride OUT of here and turning them
// into E1a entities is `noRuleMapper.ts` (pure), so the impure fetch and the pure mapping stay
// separable (C58 §1.9).
//
// ⭐ THE VERTICAL LEVEL IS NOT DECORATION, AND A CHAIN THAT IGNORES IT IS WRONG ON THE GROUND.
// SOSI publishes every reguleringsplan object at a `vertikalnivå` (NAP exposes them as the
// layer groups `vertikalniva_1`…`_5`), and NAP's own HTML template decodes level 1 as
// "Under grunnen (tunnel)". MEASURED at ONE Bergen teig (4601-167/714, representasjonspunkt
// -31841.977 / 6735304.036 in EPSG:25833):
//   • `_vn1` -> the 2023 plan 65800000 "BERGENHUS. BYBANEN FRA SENTRUM TIL ÅSANE, DELSTREKNING
//     1, KAIGATEN-SANDBROGATEN" (plantype 35, ikrafttredelsesdato 2023-05-31) + an
//     arealformål 2022 field `o_STS3` + a RpSikringSone 190 + a RpBåndleggingSone H730_2 +
//     a RpBestemmelseOmråde — ALL UNDER GROUND, a light-rail tunnel corridor.
//   • `_vn2` -> a DIFFERENT plan entirely: 5380000 "BERGENHUS. STØLEN/LADEGÅRDEN/ROTHAUGEN",
//     ikrafttredelsesdato 1983-10-10, and NO arealformål object at all — a pre-2009 plan whose
//     outline is digitised and whose content is not.
// TWO plans, TWO levels, ONE parcel. A consumer handed the `_vn1` set as "the zoning" would be
// reading a tunnel as surface development rights. So this module walks the DECLARED level
// vocabulary and keeps the level ON every feature; it never merges levels.
//
// MEASURED SCHEMA (GetFeatureInfo 2026-09-01; the census below is 86 distinct features
// harvested over 110 query points across Bergen/Trondheim/Stavanger/Tromsø/Drammen):
//   rpomrade (n=30): plantype 30/30 · planstatus 30/30 · plannavn 30/30 ·
//     ikrafttredelsesdato 30/30 · lovreferanse 30/30 · planbestemmelse 30/30 · link 30/30 ·
//     kopidata.originalDatavert 30/30 · informasjon 6/30 · forslagsstillerType 9/30 ·
//     opprinneligplanid 18/30 · vedtakEndeligPlanDato 1/30 · kunngjøringsdato 2/30 ·
//     prosesshistorie 0/30.
//   rparealformalomrade (n=24): arealformål 24/24 · eierform 24/24 · feltbetegnelse 24/24 ·
//     beskrivelse 1/24 · **utnytting.utnyttingstall 2/24** · utnytting.utnyttingstall_minimum
//     2/24 · uteoppholdsareal 0/24 · byggverkbestemmelse 0/24 · avkjørselsbestemmelse 0/24.
//   ⛔ AND `utnytting.utnyttingstype` — the DENOMINATOR — IS NOT A KEY ON THIS FEATURE TYPE AT
//   ALL, while the legacy `rbformalomrade` (n=7) DOES carry it (0/7 filled). Two sibling
//   layers, one with the measurement basis and one without. That asymmetry is the single most
//   consequential fact this lane measured; `noRuleMapper.ts` §R2 is where it is honoured.
//
// COVERAGE HONESTY: `absent` from NAP means "no reguleringsplan feature IN NAP here", and NAP
// ingestion is PARTIAL — five of nine sampled city windows painted, and Oslo was NOT one of
// them. The caveat travels VERBATIM on every absent via `NO_NAP_ABSENCE_CAVEAT`.

import { SpanStatusCode, trace } from '@opentelemetry/api';
import { type FetchOutcome } from '@pryzm/schemas';
import {
    noNapGetFeatureInfo,
    napLayersForLevel,
    NO_NAP_ABSENCE_CAVEAT,
    NO_NAP_CHAIN_HALF_WINDOW_M,
    NO_NAP_VERTICAL_LEVELS,
    NO_NAP_VN1_FEATURE_TYPES,
    type NoFetchDeps,
    type NoNapFeature,
    type NoNapPoint,
    type NoVerticalLevel,
} from './noNapClient.js';

const tracer = trace.getTracer('pryzm.siteintel.no');

/* ────────────────────────────── served property keys ───────────────────────────── */

/**
 * The NAP property keys this adapter reads, VERBATIM (they carry Norwegian letters, and the
 * compound SOSI attributes arrive dot-flattened by GeoServer). Named constants so a typo is a
 * compile-time symbol, not a silent `undefined` that reads as "not served".
 */
export const NO_NAP_KEYS = Object.freeze({
    objid: 'objid',
    objekttypenavn: 'objekttypenavn',
    vertikalnivaa: 'vertikalnivå',
    planKommunenummer: 'arealplanId.kommunenummer',
    planLandkode: 'arealplanId.landkode',
    planIdentifikasjon: 'arealplanId.planidentifikasjon',
    lokalId: 'identifikasjon.lokalId',
    navnerom: 'identifikasjon.navnerom',
    versjonId: 'identifikasjon.versjonId',
    forsteDigitaliseringsdato: 'førsteDigitaliseringsdato',
    oppdateringsdato: 'oppdateringsdato',
    kopiOmradeId: 'kopidata.områdeId',
    kopiOriginalDatavert: 'kopidata.originalDatavert',
    kopiKopidato: 'kopidata.kopidato',
    // RpOmråde
    plantype: 'plantype',
    planstatus: 'planstatus',
    plannavn: 'plannavn',
    planbestemmelse: 'planbestemmelse',
    ikrafttredelsesdato: 'ikrafttredelsesdato',
    vedtakEndeligPlanDato: 'vedtakEndeligPlanDato',
    kunngjoringsdato: 'kunngjøringsdato',
    lovreferanse: 'lovreferanse',
    lovreferanseBeskrivelse: 'lovreferanseBeskrivelse',
    forslagsstillerType: 'forslagsstillerType',
    opprinneligplanid: 'opprinneligplanid',
    opprinneligadministrativenhet: 'opprinneligadministrativenhet',
    informasjon: 'informasjon',
    link: 'link',
    // RpArealformålOmråde / RbFormålOmråde
    arealformaal: 'arealformål',
    reguleringsformaal: 'reguleringsformål',
    reguleringsformaalsutdyping: 'reguleringsformålsutdyping',
    eierform: 'eierform',
    feltbetegnelse: 'feltbetegnelse',
    beskrivelse: 'beskrivelse',
    utnyttingstall: 'utnytting.utnyttingstall',
    utnyttingstallMinimum: 'utnytting.utnyttingstall_minimum',
    utnyttingstype: 'utnytting.utnyttingstype',
    uteoppholdsareal: 'uteoppholdsareal',
    byggverkbestemmelse: 'byggverkbestemmelse',
    avkjorselsbestemmelse: 'avkjørselsbestemmelse',
    // hensynssoner / bestemmelsesområder
    hensynSonenavn: 'hensynSonenavn',
    sikring: 'sikring',
    baandlegging: 'båndlegging',
    baandlagtFremTil: 'båndlagtFremTil',
    bestemmelseOmraadeNavn: 'bestemmelseOmrådeNavn',
    type: 'type',
    juridisklinje: 'juridisklinje',
} as const);

/** The feature types this adapter classifies as the PLAN identity object. */
export const NO_PLAN_AREA_TYPES = Object.freeze(['rpomrade'] as const);
/** The feature types this adapter classifies as a land-use ZONE (arealformål / reguleringsformål). */
export const NO_ZONE_TYPES = Object.freeze(['rparealformalomrade', 'rbformalomrade'] as const);

/* ────────────────────────────── typed features ─────────────────────────────────── */

/** The national plan key: `kommunenummer` + `planidentifikasjon`. Both are strings, verbatim. */
export interface NoArealplanId {
    readonly kommunenummer: string;
    readonly planidentifikasjon: string;
    /** Served `arealplanId.landkode`, or null (measured 0/54 filled — always null). */
    readonly landkode: string | null;
}

/** Fields every NAP feature carries, whatever its type. */
export interface NoNapCommon {
    /** Feature-type prefix WITHOUT the `_vn<n>` suffix (e.g. `rparealformalomrade`). */
    readonly featureType: string;
    /** The `_vn<n>` level the layer answered at (1..5). */
    readonly level: NoVerticalLevel;
    /** `vertikalnivå` as the FEATURE carries it — cross-checked against {@link level}. */
    readonly servedVertikalnivaa: string | null;
    /** `objekttypenavn`, e.g. `RpArealformålOmråde` — the SOSI class name, verbatim. */
    readonly objekttypenavn: string | null;
    readonly arealplanId: NoArealplanId | null;
    /** `identifikasjon.lokalId` — the DURABLE identity (the WMS `fid` is not; see client). */
    readonly lokalId: string | null;
    readonly navnerom: string | null;
    readonly versjonId: string | null;
    readonly oppdateringsdato: string | null;
    readonly forsteDigitaliseringsdato: string | null;
    /** Which kommune's register the national copy came from, and when it was copied. */
    readonly originalDatavert: string | null;
    readonly kopidato: string | null;
    /** The whole served bag, uninterpreted — the mapper reads UNKNOWN slots off this. */
    readonly raw: Readonly<Record<string, unknown>>;
    readonly geometry: { readonly type: string; readonly coordinates: unknown } | null;
    /** CRS of {@link geometry} — the CRS the query was issued in (NAP answers in it). */
    readonly crs: string;
}

/** `RpOmråde` — the plan identity, dates, lifecycle and the document link. */
export interface NoPlanArea extends NoNapCommon {
    readonly plannavn: string | null;
    /** SOSI `Plantype` code, verbatim (30/34/35 observed). */
    readonly plantype: string | null;
    /** SOSI `Planstatus` code, verbatim ('3' observed on all 30). */
    readonly planstatus: string | null;
    /** SOSI `Planbestemmelse` code, verbatim (1/3/4 observed) — whether provisions exist. */
    readonly planbestemmelse: string | null;
    /** `ikrafttredelsesdato` as served, e.g. `2023-05-31Z` (30/30 filled). */
    readonly ikrafttredelsesdato: string | null;
    readonly vedtakEndeligPlanDato: string | null;
    readonly kunngjoringsdato: string | null;
    readonly lovreferanse: string | null;
    readonly lovreferanseBeskrivelse: string | null;
    /**
     * The kommune planregister card for this plan — where the BESTEMMELSER (the textual
     * provisions) actually live. Two portal families observed: `arealplaner.no` (Norkart) and
     * `plandialog.isy.no` (Norconsult ISY). This URL is the document reference every tier-6
     * UNKNOWN in the mapper points at.
     */
    readonly link: string | null;
    /**
     * Free-text plan `informasjon` (6/30 filled). ⚠ MEASURED CONTENT: "Høydereferanse NN2000"
     * and "Høydereferanse Trondheim lokal" — i.e. THE VERTICAL DATUM of the plan's heights,
     * served as PROSE. A height read from such a plan is measured against a datum that is
     * sometimes a LOCAL one. Carried verbatim; never parsed here.
     */
    readonly informasjon: string | null;
}

/** `RpArealformålOmråde` / `RbFormålOmråde` — a land-use zone with its (usually empty) numbers. */
export interface NoZoneArea extends NoNapCommon {
    /** SOSI `RpArealformål` code, verbatim (`2022`, `1900`, `2082`…), or null on the legacy type. */
    readonly arealformaal: string | null;
    /** Legacy pbl-1985 `reguleringsformål` code on `rbformalomrade`, verbatim, or null. */
    readonly reguleringsformaal: string | null;
    /** Field designation on the plan drawing (`o_STS3`, `PP3`, `f_SPH`…), verbatim. */
    readonly feltbetegnelse: string | null;
    /** SOSI `Eierformtype` code, verbatim ('1'/'2'/'3' observed). */
    readonly eierform: string | null;
    readonly beskrivelse: string | null;
    /** `utnytting.utnyttingstall` EXACTLY as served — including the Java-array leak string. */
    readonly utnyttingstallRaw: unknown;
    readonly utnyttingstallMinimumRaw: unknown;
    /**
     * `utnytting.utnyttingstype` — the DENOMINATOR code. `undefined` means THE KEY IS NOT
     * SERVED BY THIS FEATURE TYPE (measured on `rparealformalomrade`); `null` means the key
     * exists and is empty (measured on `rbformalomrade`). ⛔ These are DIFFERENT facts and the
     * mapper keeps them apart.
     */
    readonly utnyttingstypeRaw: unknown;
    readonly uteoppholdsarealRaw: unknown;
    readonly byggverkbestemmelseRaw: unknown;
    readonly avkjorselsbestemmelseRaw: unknown;
}

/** Any other served plan object (hensynssone, bestemmelsesområde, juridisk linje/punkt, …). */
export interface NoPlanObject extends NoNapCommon {
    /** `hensynSonenavn` where the object is a hensynssone (`H190_30`, `H730_2`). */
    readonly hensynSonenavn: string | null;
}

/** Everything one point resolved to, at ONE vertical level. */
export interface NoPlanFeatureSet {
    readonly level: NoVerticalLevel;
    readonly planAreas: readonly NoPlanArea[];
    readonly zones: readonly NoZoneArea[];
    readonly objects: readonly NoPlanObject[];
    /** Feature-type prefixes seen that are NOT in the declared vn1 vocabulary. */
    readonly unknownFeatureTypes: readonly string[];
}

/* ────────────────────────────── pure parsers ───────────────────────────────────── */

function str(bag: Readonly<Record<string, unknown>>, key: string): string | null {
    const v = bag[key];
    if (typeof v === 'string') {
        const t = v.trim();
        return t === '' ? null : t;
    }
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    return null;
}

/** Strip the `_vn<n>` suffix from a NAP feature-type name. */
export function stripLevelSuffix(featureType: string): string {
    return featureType.replace(/_vn[1-5]$/, '');
}

function commonOf(f: NoNapFeature, level: NoVerticalLevel, crs: string): NoNapCommon {
    const p = f.properties;
    const kommune = str(p, NO_NAP_KEYS.planKommunenummer);
    const planid = str(p, NO_NAP_KEYS.planIdentifikasjon);
    return {
        featureType: stripLevelSuffix(f.featureType),
        level,
        servedVertikalnivaa: str(p, NO_NAP_KEYS.vertikalnivaa),
        objekttypenavn: str(p, NO_NAP_KEYS.objekttypenavn),
        arealplanId:
            kommune !== null && planid !== null
                ? { kommunenummer: kommune, planidentifikasjon: planid, landkode: str(p, NO_NAP_KEYS.planLandkode) }
                : null,
        lokalId: str(p, NO_NAP_KEYS.lokalId),
        navnerom: str(p, NO_NAP_KEYS.navnerom),
        versjonId: str(p, NO_NAP_KEYS.versjonId),
        oppdateringsdato: str(p, NO_NAP_KEYS.oppdateringsdato),
        forsteDigitaliseringsdato: str(p, NO_NAP_KEYS.forsteDigitaliseringsdato),
        originalDatavert: str(p, NO_NAP_KEYS.kopiOriginalDatavert),
        kopidato: str(p, NO_NAP_KEYS.kopiKopidato),
        raw: p,
        geometry: f.geometry,
        crs,
    };
}

/** PURE: one NAP feature -> the typed shape for its class. */
export function parseNoNapFeature(
    f: NoNapFeature,
    level: NoVerticalLevel,
    crs: string,
): { readonly kind: 'plan'; readonly value: NoPlanArea }
    | { readonly kind: 'zone'; readonly value: NoZoneArea }
    | { readonly kind: 'object'; readonly value: NoPlanObject } {
    const c = commonOf(f, level, crs);
    const p = f.properties;
    if ((NO_PLAN_AREA_TYPES as readonly string[]).includes(c.featureType)) {
        return {
            kind: 'plan',
            value: {
                ...c,
                plannavn: str(p, NO_NAP_KEYS.plannavn),
                plantype: str(p, NO_NAP_KEYS.plantype),
                planstatus: str(p, NO_NAP_KEYS.planstatus),
                planbestemmelse: str(p, NO_NAP_KEYS.planbestemmelse),
                ikrafttredelsesdato: str(p, NO_NAP_KEYS.ikrafttredelsesdato),
                vedtakEndeligPlanDato: str(p, NO_NAP_KEYS.vedtakEndeligPlanDato),
                kunngjoringsdato: str(p, NO_NAP_KEYS.kunngjoringsdato),
                lovreferanse: str(p, NO_NAP_KEYS.lovreferanse),
                lovreferanseBeskrivelse: str(p, NO_NAP_KEYS.lovreferanseBeskrivelse),
                link: str(p, NO_NAP_KEYS.link),
                informasjon: str(p, NO_NAP_KEYS.informasjon),
            },
        };
    }
    if ((NO_ZONE_TYPES as readonly string[]).includes(c.featureType)) {
        return {
            kind: 'zone',
            value: {
                ...c,
                arealformaal: str(p, NO_NAP_KEYS.arealformaal),
                reguleringsformaal: str(p, NO_NAP_KEYS.reguleringsformaal),
                feltbetegnelse: str(p, NO_NAP_KEYS.feltbetegnelse),
                eierform: str(p, NO_NAP_KEYS.eierform),
                beskrivelse: str(p, NO_NAP_KEYS.beskrivelse),
                // RAW, not string-normalised: the mapper must be able to tell the Java-array
                // leak from an absent key from a real number, and `str()` would flatten all three.
                utnyttingstallRaw: p[NO_NAP_KEYS.utnyttingstall],
                utnyttingstallMinimumRaw: p[NO_NAP_KEYS.utnyttingstallMinimum],
                utnyttingstypeRaw: NO_NAP_KEYS.utnyttingstype in p ? p[NO_NAP_KEYS.utnyttingstype] : undefined,
                uteoppholdsarealRaw: p[NO_NAP_KEYS.uteoppholdsareal],
                byggverkbestemmelseRaw: p[NO_NAP_KEYS.byggverkbestemmelse],
                avkjorselsbestemmelseRaw: p[NO_NAP_KEYS.avkjorselsbestemmelse],
            },
        };
    }
    return { kind: 'object', value: { ...c, hensynSonenavn: str(p, NO_NAP_KEYS.hensynSonenavn) } };
}

const DECLARED_TYPE_PREFIXES: readonly string[] = NO_NAP_VN1_FEATURE_TYPES.map(stripLevelSuffix);

/** PURE: a served feature list -> the typed set for one level. */
export function buildNoPlanFeatureSet(
    features: readonly NoNapFeature[],
    level: NoVerticalLevel,
    crs: string,
): NoPlanFeatureSet {
    const planAreas: NoPlanArea[] = [];
    const zones: NoZoneArea[] = [];
    const objects: NoPlanObject[] = [];
    const unknown = new Set<string>();
    for (const f of features) {
        const parsed = parseNoNapFeature(f, level, crs);
        const t = parsed.value.featureType;
        if (t !== '' && !DECLARED_TYPE_PREFIXES.includes(t)) unknown.add(t);
        if (parsed.kind === 'plan') planAreas.push(parsed.value);
        else if (parsed.kind === 'zone') zones.push(parsed.value);
        else objects.push(parsed.value);
    }
    return {
        level,
        planAreas,
        zones,
        objects,
        unknownFeatureTypes: [...unknown].sort(),
    };
}

/* ────────────────────────────── the fetches ────────────────────────────────────── */

/** Resolve the reguleringsplan features at ONE vertical level. */
export async function resolveNoPlanFeaturesAtLevel(
    point: NoNapPoint,
    level: NoVerticalLevel,
    deps: NoFetchDeps = {},
    halfWindowM: number = NO_NAP_CHAIN_HALF_WINDOW_M,
): Promise<FetchOutcome<NoPlanFeatureSet>> {
    return tracer.startActiveSpan(
        'pryzm.siteintel.no.resolvePlanFeaturesAtLevel',
        async (span): Promise<FetchOutcome<NoPlanFeatureSet>> => {
            try {
                span.setAttribute('no.level', level);
                const layers = napLayersForLevel(level);
                const outcome = await noNapGetFeatureInfo(
                    point,
                    layers,
                    `NAP reguleringsplaner vn${level} @ ${point.crs} ${point.x},${point.y}`,
                    deps,
                    { halfWindowM },
                );
                if (outcome.status !== 'found') {
                    span.setStatus(
                        outcome.status === 'transient'
                            ? { code: SpanStatusCode.ERROR, message: outcome.reason }
                            : { code: SpanStatusCode.OK },
                    );
                    return outcome.status === 'absent'
                        ? { status: 'absent', reason: `${outcome.reason} — ${NO_NAP_ABSENCE_CAVEAT}` }
                        : outcome;
                }
                span.setStatus({ code: SpanStatusCode.OK });
                return { status: 'found', value: buildNoPlanFeatureSet(outcome.value, level, point.crs) };
            } finally {
                span.end();
            }
        },
    );
}

/**
 * Resolve the reguleringsplan features at ALL FIVE declared vertical levels, in level order.
 * Each level is its OWN typed outcome — a level that is absent (nothing published under
 * ground) must never make the surface level look absent, and a level that FAILED must never
 * look empty.
 */
export async function resolveNoPlanFeaturesAllLevels(
    point: NoNapPoint,
    deps: NoFetchDeps = {},
    halfWindowM: number = NO_NAP_CHAIN_HALF_WINDOW_M,
): Promise<ReadonlyArray<{ readonly level: NoVerticalLevel; readonly outcome: FetchOutcome<NoPlanFeatureSet> }>> {
    const results = await Promise.all(
        NO_NAP_VERTICAL_LEVELS.map(async (level) => ({
            level,
            outcome: await resolveNoPlanFeaturesAtLevel(point, level, deps, halfWindowM),
        })),
    );
    return results;
}
