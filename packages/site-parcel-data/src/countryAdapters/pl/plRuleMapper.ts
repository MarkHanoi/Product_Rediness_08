// LANE E6-PL — POLAND (PL) · the PURE rule mapper: APP GML 2.0 `app:StrefaPlanistyczna`
// (POG planning zone) → E1a `SiteIntelRule` objects with DIRECT provenance, PLUS the minted
// planning entities those rules cite (the R1 referent contract: "every `basis` reference MUST
// resolve to a MINTED entity — an adapter that cites a zone MINTS the Zone it cites").
//
// Built on the EE exemplar (`countryAdapters/ee/eeRuleMapper.ts`) and deliberately NOT a second
// idiom: same referent ladder, same UNKNOWN discipline, same validity typing, same
// "one vocabulary table, measured, in the adapter" shape (C84 EI-9).
//
// E4 CONTROL 5 — the PARSER is country-FORMAT machinery and already exists
// (`parsers/appGml/`, built against the official XSD + sample, 24 tests). THIS file is the
// country-SEMANTICS half: it consumes the parser's plain typed output and never re-parses XML.
//
// TOTAL, PURE, DETERMINISTIC: same feature in → byte-identical rules out. No fetch, no clock
// (the caller passes `fetchedAtIso`), no business logic — it does NOT decide what may be built;
// it records what the state serves, with its legal address. Its ONE refusal is structural: a
// zone with NO usable geometry AND no resolvable plan identity has nothing a rule could apply
// to, and it throws BY NAME (the R1 at-least-one-leg refine would reject it anyway).
//
// ── THE VOCABULARY (element names verbatim from `planowaniePrzestrzenne_2_0.xsd`; the
//    statutory citations are the XSD's OWN `<documentation>` text, quoted, not paraphrased) ──
//
//   APP element                              canonical parameter                unit
//   ───────────────────────────────────────  ─────────────────────────────────  ────
//   maksNadziemnaIntensywnoscZabudowy     →  maxFloorAreaRatioAboveGround       —      (decimal)
//   maksUdzialPowierzchniZabudowy         →  maxCoveragePercent                 %      (decimal)
//   maksWysokoscZabudowy                  →  maxHeight                          uom    (gml:LengthType, uom MANDATORY)
//   minUdzialPowierzchniBiologicznieCzynnej → minGreenSharePercent              %      (decimal)
//   nazwa (RodzajStrefyPlanistycznejKod)  →  zoneKindCode                       —      (codelist)
//   profilPodstawowy (KlasyPrzeznaczeniaTerenu) → landUseProfilePrimary         —      (codelist+)
//   profilDodatkowy                       →  landUseProfileAdditional           —      (codelist*)
//
//   `maxCoveragePercent` and `maxHeight` are spelled EXACTLY as the EE adapter's
//   `coveragePercent`/`maxHeight` concepts (percent-of-plot coverage; metric height cap) with
//   the `max` prefix the Polish elements carry explicitly; `minGreenSharePercent` matches the
//   gloss the LT wire vocabulary already uses for `MIN_APZELD` ("min green share, %"). The
//   Polish statutory term is *powierzchnia biologicznie czynna* — kept verbatim in the
//   vocabulary row and in the value basis, never lost to the harmonised name.
//
// ── R2 (valueBasis) — WHAT THE NUMBER IS MEASURED AGAINST, AND WHAT IT IS NOT ────────────────
// Every ceiling rides `valueBasis: {scheme:'pl-upzp-2003', code:'<the XSD's own article
// citation>'}`. The scheme is the statute the national schema cites by name (ustawa z dnia
// 27 marca 2003 r. o planowaniu i zagospodarowaniu przestrzennym); the code is the article
// path, copied verbatim out of the XSD annotation for that element.
//
// ⚠ IT IS A POINTER TO THE DEFINITION, NOT A RESOLVED DENOMINATOR. The APP schema serves NO
// per-value denominator column (unlike DK's `bebygpctaf`), and the statutory denominator for
// intensywność/udział is *powierzchnia działki budowlanej* — a planning concept that is NOT
// the same object as a cadastral działka ewidencyjna. So a consumer must NOT compute
// GFA = FAR × ULDK parcel area from these rules: that is precisely the C63 Aarhus trap
// (`bebygpct=180, af=1` → wrong GFA while every field parses clean). Resolving the
// działka-budowlana denominator is a LATER lane's work (E4 control 10 — recorded, not acted on
// here); until then the honest state is "the basis is cited, the denominator is unresolved".
//
// ── R5 (normativeForce) ─────────────────────────────────────────────────────────────────────
// `charakterUstalenia` (INSPIRE RegulationNatureValue) is mirrored VERBATIM as the code tail —
// the official sample serves `generallyBinding` on all 35 wydzielenia. Never harmonised.
//
// ── R3 (validityBasis) — WHY MOST SAMPLE RULES ARE `ingestion` ───────────────────────────────
// The XSD says `obowiazujeOd` is "Data, od której dana WERSJA OBIEKTU PRZESTRZENNEGO
// obowiązuje" — an OBJECT-VERSION validity axis, not the instrument's legal force. `status`
// is "Ogólne wskazanie etapu procesu planowania, na którym znajduje się wersja aktu planowania
// przestrzennego LUB JEGO PROJEKTU" — i.e. a draft carries dates too. So this mapper emits
// `validityBasis:'legal'` ONLY when the act's status is the INSPIRE code `legalForce`
// ("legally binding or active" — the four registered codes are mirrored in
// `PL_ACT_STATUS_CODELIST`, fetched from the INSPIRE registry 2026-09-01); otherwise the window
// is `ingestion` + the fetch date, and the served object-version date is preserved verbatim in
// the confidence note rather than promoted to a legal claim. The official ministry sample is
// `elaboration` throughout — a DRAFT act — so its rules are honestly ingestion-versioned, and a
// point-in-time evaluator will correctly refuse to say they were in force on any date.

import {
    SiteIntelDocumentSchema,
    SiteIntelPlanSchema,
    SiteIntelRuleSchema,
    SiteIntelVersionSchema,
    SiteIntelZoneSchema,
    type NativeCrsGeometry,
    type RuleBasisRef,
    type SiteIntelDocument,
    type SiteIntelPlan,
    type SiteIntelRule,
    type SiteIntelVersion,
    type SiteIntelZone,
} from '@pryzm/schemas';
import type {
    AppAktPlanowania,
    AppCodeRef,
    AppDokumentFormalny,
    AppIdentyfikator,
    AppStrefaPlanistyczna,
    AppSurfaceGeometry,
} from '../../parsers/appGml/index.js';
import { PL_APP_GML_SOURCE_ID } from './plSources.js';

/* ─────────────────────────── vocabulary + codelists ───────────────────── */

/** One row of the PL→canonical rule vocabulary. */
export interface PlRuleVocabularyEntry {
    /** The APP 2.0 element name, verbatim. */
    readonly appElement: string;
    /** Canonical parameter name emitted into `RuleProvenance.parameter`. */
    readonly parameter: string;
    /** Unit, or null for dimensionless ratios/codes. `null` on `maxHeight` = "take the uom". */
    readonly unit: string | null;
    /** The XSD `<documentation>` statutory citation, verbatim (R2 `valueBasis.code`). */
    readonly statutoryBasis: string;
    /** The Polish term, verbatim — the harmonised parameter name never replaces it. */
    readonly polishTerm: string;
}

/** The statute the APP schema cites by name for every one of these values (R2 `scheme`). */
export const PL_VALUE_BASIS_SCHEME = 'pl-upzp-2003';

/**
 * The measured, closed POG zone vocabulary (see the header table). `maxHeight` carries no unit
 * here because gml:LengthType makes the uom MANDATORY IN THE DOCUMENT — the served uom is
 * copied verbatim onto the rule, never assumed to be metres.
 */
export const PL_RULE_VOCABULARY: readonly PlRuleVocabularyEntry[] = [
    {
        appElement: 'maksNadziemnaIntensywnoscZabudowy',
        parameter: 'maxFloorAreaRatioAboveGround',
        unit: null,
        statutoryBasis: 'art. 13e ust. 2 pkt 2 oraz ust. 3 pkt 1 i 2',
        polishTerm: 'maksymalna nadziemna intensywność zabudowy',
    },
    {
        appElement: 'maksUdzialPowierzchniZabudowy',
        parameter: 'maxCoveragePercent',
        unit: '%',
        statutoryBasis: 'art. 13e ust. 2 pkt 2 i ust. 3 pkt 1 i 2',
        polishTerm: 'maksymalny udział powierzchni zabudowy',
    },
    {
        appElement: 'maksWysokoscZabudowy',
        parameter: 'maxHeight',
        unit: null, // the document's own uom wins
        statutoryBasis: 'art. 13e ust. 2 pkt 2 i ust. 3 pkt 1 i 2',
        polishTerm: 'maksymalna wysokość zabudowy',
    },
    {
        appElement: 'minUdzialPowierzchniBiologicznieCzynnej',
        parameter: 'minGreenSharePercent',
        unit: '%',
        statutoryBasis: 'art. 13e ust. 2 pkt 3 i ust. 3 pkt 2',
        polishTerm: 'minimalny udział powierzchni biologicznie czynnej',
    },
    {
        appElement: 'nazwa',
        parameter: 'zoneKindCode',
        unit: null,
        statutoryBasis: 'art. 13c ust. 2',
        polishTerm: 'nazwa rodzaju strefy planistycznej',
    },
    {
        appElement: 'profilPodstawowy',
        parameter: 'landUseProfilePrimary',
        unit: null,
        statutoryBasis: 'art. 13e ust. 2 pkt 1',
        polishTerm: 'profil podstawowy',
    },
    {
        appElement: 'profilDodatkowy',
        parameter: 'landUseProfileAdditional',
        unit: null,
        statutoryBasis: 'art. 13e ust. 2 pkt 1',
        polishTerm: 'profil dodatkowy',
    },
];

/**
 * INSPIRE `ProcessStepGeneralValue` — the codelist the APP `status` element points at, fetched
 * VERBATIM from the INSPIRE registry 2026-09-01
 * (`inspire.ec.europa.eu/codelist/ProcessStepGeneralValue/ProcessStepGeneralValue.en.json`).
 * Four registered codes; ONE of them means the instrument is in force.
 */
export const PL_ACT_STATUS_CODELIST: Readonly<Record<string, string>> = Object.freeze({
    adoption: 'in the process of adoption',
    elaboration: 'under elaboration',
    legalForce: 'legally binding or active',
    obsolete: 'obsolete',
});

/** The one code that means "legally binding or active" (R3's `legal` gate). */
export const PL_ACT_STATUS_IN_FORCE = 'legalForce';

/** Publishing-authority fallback when the act serves no `organUstanawiajacy`. */
export const PL_RULE_AUTHORITY = 'gmina (akt planowania przestrzennego, APP GML 2.0)';

/** The APP dataset every POG zone rule cites. */
export const PL_RULE_DATASET = 'app:StrefaPlanistyczna';

/* ───────────────────────────── pure helpers ───────────────────────────── */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isoDateOrNull(v: string | null | undefined): string | null {
    return typeof v === 'string' && ISO_DATE_RE.test(v) ? v : null;
}

/**
 * PURE: the trailing code of a codelist reference — the last path segment, or the fragment
 * where the reference is an ontology term (`…/ontology/KPT#KPT-MPZP-RZM` → `KPT-MPZP-RZM`).
 * Returns null for an unusable href rather than inventing a code.
 */
export function plCodeTail(ref: AppCodeRef | null | undefined): string | null {
    const href = ref?.href?.trim();
    if (!href) return null;
    const hash = href.indexOf('#');
    const tail = hash >= 0 ? href.slice(hash + 1) : href.slice(href.lastIndexOf('/') + 1);
    return tail.trim() !== '' ? tail.trim() : null;
}

/**
 * PURE: an OGC/EPSG srsName → the `AUTHORITY:CODE` form `NativeCrsGeometrySchema` requires.
 * Accepts the three forms the national services emit; returns null for anything else — a CRS
 * that cannot be read is NEVER defaulted (the Madrid EPSG:4326 silent-zero trap is exactly
 * what a guessed CRS produces).
 */
export function plCrsFromSrsName(srsName: string | null): string | null {
    if (srsName === null) return null;
    const s = srsName.trim();
    let m = /^https?:\/\/www\.opengis\.net\/def\/crs\/([A-Za-z]+)\/[^/]*\/(\w+)$/.exec(s);
    if (m) return `${m[1]!.toUpperCase()}:${m[2]}`;
    m = /^urn:ogc:def:crs:([A-Za-z]+):[^:]*:(\w+)$/.exec(s);
    if (m) return `${m[1]!.toUpperCase()}:${m[2]}`;
    m = /^([A-Za-z]+):(\w+)$/.exec(s);
    if (m) return `${m[1]!.toUpperCase()}:${m[2]}`;
    return null;
}

/**
 * PURE: APP surface geometry → `NativeCrsGeometry`, coordinates EXACTLY as parsed (native CRS,
 * closing vertex kept, holes preserved). Returns null when there is no polygon or no readable
 * srsName — the caller degrades down the referent ladder instead of minting a located-nowhere
 * (or located-in-a-guessed-CRS) entity.
 */
export function plGeometryOf(geometry: AppSurfaceGeometry): NativeCrsGeometry | null {
    const polys = geometry.polygons;
    if (polys.length === 0) return null;
    const crs = plCrsFromSrsName(polys[0]!.srsName);
    if (crs === null) return null;
    const rings = (p: (typeof polys)[number]): number[][][] => [
        p.exterior.positions.map(([x, y]) => [x, y]),
        ...p.interiors.map((r) => r.positions.map(([x, y]) => [x, y])),
    ];
    if (polys.length === 1) {
        return { crs, kind: 'Polygon', coordinates: rings(polys[0]!) };
    }
    return { crs, kind: 'MultiPolygon', coordinates: polys.map(rings) };
}

/** PURE: does an xlink href address this IIP identity (with or without the version segment)? */
export function plHrefMatchesIip(href: string | null | undefined, iip: AppIdentyfikator): boolean {
    if (!href) return false;
    const clean = href.trim().replace(/\/+$/, '');
    const base = `${iip.przestrzenNazw}/${iip.lokalnyId}`;
    if (clean.endsWith(`/${base}`) || clean === base) return true;
    if (iip.wersjaId !== null) {
        const versioned = `${base}/${iip.wersjaId}`;
        if (clean.endsWith(`/${versioned}`) || clean === versioned) return true;
    }
    return false;
}

/** The national identity string of an IIP-identified object (`przestrzenNazw/lokalnyId`). */
export function plIipIdentity(iip: AppIdentyfikator): string {
    return `${iip.przestrzenNazw}/${iip.lokalnyId}`;
}

/* ──────────────────── minted planning entities (R1 contract) ──────────── */

/** Deterministic id of the minted `SiteIntelPlan` for one act — ONE naming seat. */
export function plPlanEntityId(aktGmlId: string): string {
    return `pl-plan-${aktGmlId}`;
}

/** Deterministic id of the minted `SiteIntelZone` for one strefa — ONE naming seat. */
export function plZoneEntityId(strefaGmlId: string): string {
    return `pl-zone-${strefaGmlId}`;
}

/** Deterministic id of a minted `SiteIntelDocument` for one DokumentFormalny. */
export function plDocumentEntityId(dokGmlId: string): string {
    return `pl-document-${dokGmlId}`;
}

/**
 * PURE: one `app:DokumentFormalny` → the minted `SiteIntelDocument`, or null when it serves no
 * `lacze` URL. `SiteIntelDocument.url` is REQUIRED and means a retrievable address; passing the
 * object's own IIP URI off as a URL would be a fabricated document link. The identity survives
 * regardless — it travels on every rule as `source.document`.
 */
export function mapPlDokumentToDocument(dok: AppDokumentFormalny): SiteIntelDocument | null {
    const url = dok.lacze.find((l) => l.trim() !== '');
    if (url === undefined) return null;
    return SiteIntelDocumentSchema.parse({
        id: plDocumentEntityId(dok.gmlId),
        url,
        kind: 'dokument formalny (uchwała)',
        identity: { scheme: 'app-2.0-idIIP', value: plIipIdentity(dok.idIIP) },
        version: dok.idIIP.wersjaId,
        retrievedDate: null,
    });
}

/**
 * The resolved plan context one act yields: the minted entities plus the raw pieces the rule
 * mapper needs. Built ONCE per act and passed to every strefa of that act (the EE `planRowFor`
 * cache lesson, made structural — a document carries its act inline, so no fetch is involved).
 */
export interface PlPlanContext {
    readonly akt: AppAktPlanowania | null;
    /** The `dokumentUchwalajacy` (ADOPTING resolution) when the act names one and it resolves. */
    readonly adoptingDocument: AppDokumentFormalny | null;
    readonly plan: SiteIntelPlan | null;
    readonly planVersion: SiteIntelVersion | null;
    readonly documents: readonly SiteIntelDocument[];
    /** Honest notes about what could NOT be resolved — never silent. */
    readonly caveats: readonly string[];
}

/**
 * PURE: one `app:AktPlanowaniaPrzestrzennego` (+ the document features of the same file) → the
 * minted Plan, its Version row, its Documents, and the resolved adopting document.
 *
 * ⚠ `dokumentPrzystepujacy` (the resolution to COMMENCE drafting) is deliberately NOT accepted
 * as the adopting document — citing it as a rule's legal address would be a confident-false
 * citation. The official ministry sample carries only that one, so its rules honestly cite no
 * adopting document.
 */
export function mapPlAktToPlanContext(
    akt: AppAktPlanowania | null,
    dokumenty: readonly AppDokumentFormalny[] = [],
): PlPlanContext {
    if (akt === null) {
        return {
            akt: null,
            adoptingDocument: null,
            plan: null,
            planVersion: null,
            documents: [],
            caveats: ['no app:AktPlanowaniaPrzestrzennego resolved for this zone'],
        };
    }
    const caveats: string[] = [];
    const adopting =
        akt.dokumentUchwalajacy !== null
            ? (dokumenty.find((d) => plHrefMatchesIip(akt.dokumentUchwalajacy!.href, d.idIIP)) ?? null)
            : null;
    if (akt.dokumentUchwalajacy === null) {
        caveats.push(
            'the act serves no dokumentUchwalajacy — no adopting resolution to cite as the ' +
                'rules legal document address (dokumentPrzystepujacy is NOT a substitute)',
        );
    } else if (adopting === null) {
        caveats.push(
            `dokumentUchwalajacy ${akt.dokumentUchwalajacy.href} did not resolve to a ` +
                'DokumentFormalny in this document',
        );
    }

    const documents: SiteIntelDocument[] = [];
    for (const d of dokumenty) {
        const minted = mapPlDokumentToDocument(d);
        if (minted !== null) documents.push(minted);
    }
    if (documents.length === 0 && dokumenty.length > 0) {
        caveats.push(
            `${dokumenty.length} DokumentFormalny feature(s) present but none serves an app:lacze ` +
                'URL — no SiteIntelDocument minted (a document identity is not a document link)',
        );
    }

    const statusCode = plCodeTail(akt.status);
    if (statusCode === null) {
        return {
            akt,
            adoptingDocument: adopting,
            plan: null,
            planVersion: null,
            documents,
            caveats: [
                ...caveats,
                'the act serves no readable status code — SiteIntelPlan.status is REQUIRED and ' +
                    'MIRRORED, so no Plan entity is minted (rules fall to the geometry leg)',
            ],
        };
    }

    const planId = plPlanEntityId(akt.gmlId);
    const plan = SiteIntelPlanSchema.parse({
        id: planId,
        // The Polish instrument, verbatim from the TypAktuPlanowaniaPrzestrzennegoKod codelist
        // (`planOgolnyGminy`, `miejscowyPlanZagospodarowaniaPrzestrzennego`, …) — an open string.
        kind: plCodeTail(akt.typPlanu) ?? 'aktPlanowaniaPrzestrzennego',
        status: statusCode,
        // The ADOPTION date is the adopting resolution's own date; the act's obowiazujeOd is an
        // object-version axis and is NOT it (see the R3 note in the header).
        adoptedDate: adopting !== null ? isoDateOrNull(adopting.data?.date) : null,
        inForceFrom: adopting !== null ? isoDateOrNull(adopting.dataWejsciaWZycie) : null,
        inForceTo:
            (adopting !== null ? isoDateOrNull(adopting.dataUchylenia) : null) ??
            isoDateOrNull(akt.obowiazujeDo),
        documents: documents.map((d) => d.id),
        // No separate geometry entity is minted for the act's zasiegPrzestrzenny; the zones
        // carry their own geometry and a dangling ref is the defect R1 exists to kill.
        geometryRef: null,
        source: PL_APP_GML_SOURCE_ID,
        version: planId,
    });

    // The OBJECT-VERSION axis the APP schema serves natively (`obowiazujeOd` / `obowiazujeDo` /
    // `wersjaId`) gets its own typed seat — Version — instead of being smuggled into the legal
    // validity of the rules.
    const versionFrom = isoDateOrNull(akt.obowiazujeOd);
    const planVersion =
        versionFrom !== null
            ? SiteIntelVersionSchema.parse({
                  entityRef: planId,
                  validFrom: versionFrom,
                  validTo: isoDateOrNull(akt.obowiazujeDo),
                  supersededBy: null,
              })
            : null;

    return { akt, adoptingDocument: adopting, plan, planVersion, documents, caveats };
}

/* ───────────────────────────── the rule mapper ────────────────────────── */

/** What one mapped strefa yields: the minted referents + the rules that cite them. */
export interface PlMappedZone {
    /** The minted Zone entity, or null (no plan resolved → no plan-scoped zone). */
    readonly zone: SiteIntelZone | null;
    readonly rules: readonly SiteIntelRule[];
    /** Honest notes about degraded legs — never silent. */
    readonly caveats: readonly string[];
}

interface PlApplicabilityTarget {
    readonly zone: SiteIntelZone | null;
    readonly basis: readonly RuleBasisRef[];
    readonly inlineGeometry: NativeCrsGeometry | null;
    readonly caveats: readonly string[];
}

/**
 * The R1 referent ladder — mints what it cites and cites only what it minted:
 *   1. plan minted + geometry readable → mint the Zone; basis cites the Zone.
 *   2. plan minted, geometry unreadable → basis cites the Plan directly.
 *   3. no plan, geometry readable → the rules carry the geometry INLINE (R1's residual
 *      bare-geometry leg — `SiteIntelZone.planId` is REQUIRED, so a plan-less zone is not
 *      a half-minted Zone, it is no Zone).
 *   4. neither → throw BY NAME.
 */
function mintPlApplicability(
    strefa: AppStrefaPlanistyczna,
    ctx: PlPlanContext,
): PlApplicabilityTarget {
    const geometry = plGeometryOf(strefa.geometria);
    const caveats: string[] = [];
    if (geometry === null) {
        caveats.push(
            `strefa ${strefa.oznaczenie}: no usable geometry (polygons=` +
                `${strefa.geometria.polygons.length}, srsName=` +
                `${JSON.stringify(strefa.geometria.polygons[0]?.srsName ?? null)}) — a CRS that ` +
                'cannot be read is never defaulted',
        );
    }
    if (ctx.plan !== null && geometry !== null) {
        const zone = SiteIntelZoneSchema.parse({
            id: plZoneEntityId(strefa.gmlId),
            planId: ctx.plan.id,
            typology: {
                // The national short code (`SZ`, `SJ`, `SU`…) — the XSD calls `symbol` the
                // "ciąg literowy stosowany do określenia rodzaju wydzielenia planistycznego".
                national: strefa.symbol,
                // No cross-country mapping EXISTS for POG zone kinds — never guessed.
                harmonised: null,
            },
            geometry,
            source: PL_APP_GML_SOURCE_ID,
        });
        return { zone, basis: [{ kind: 'zone', ref: zone.id }], inlineGeometry: null, caveats };
    }
    if (ctx.plan !== null) {
        return {
            zone: null,
            basis: [{ kind: 'plan', ref: ctx.plan.id }],
            inlineGeometry: null,
            caveats,
        };
    }
    if (geometry !== null) {
        return {
            zone: null,
            basis: [],
            inlineGeometry: geometry,
            caveats: [
                ...caveats,
                `strefa ${strefa.oznaczenie}: no Plan minted — rules carry inline geometry ` +
                    '(R1 residual leg) and cite no planning object',
            ],
        };
    }
    throw new Error(
        `pl-rule-mapper: strefa ${strefa.oznaczenie} (${strefa.gmlId}) has NO usable geometry ` +
            'and NO resolvable plan identity — a rule that applies nowhere is not a rule (R1 ' +
            'at-least-one-leg), and minting a referent from a half-known feature would be the ' +
            'dangling-ref defect. Refusing by name instead of guessing.',
    );
}

/** R3: the typed validity axis. See the header — `legal` requires POSITIVE evidence of force. */
function plValidity(
    strefa: AppStrefaPlanistyczna,
    ctx: PlPlanContext,
    fetchedAtIso: string,
): {
    readonly validityBasis: 'legal' | 'ingestion';
    readonly valid_from: string;
    readonly valid_to: string | null;
    readonly note: string | null;
} {
    const statusCode = ctx.akt !== null ? plCodeTail(ctx.akt.status) : null;
    const from = isoDateOrNull(strefa.obowiazujeOd);
    if (statusCode === PL_ACT_STATUS_IN_FORCE && from !== null) {
        return {
            validityBasis: 'legal',
            valid_from: from,
            valid_to: isoDateOrNull(strefa.obowiazujeDo),
            note: null,
        };
    }
    const label = statusCode !== null ? (PL_ACT_STATUS_CODELIST[statusCode] ?? 'unregistered code') : 'no act status served';
    return {
        validityBasis: 'ingestion',
        valid_from: fetchedAtIso,
        valid_to: null,
        note:
            `act status ${JSON.stringify(statusCode)} (${label}) is not ` +
            `${PL_ACT_STATUS_IN_FORCE} — the served obowiazujeOd ` +
            `${JSON.stringify(strefa.obowiazujeOd)} is an OBJECT-VERSION date (XSD: "data, od ` +
            'której dana wersja obiektu przestrzennego obowiązuje"), not a legal in-force date, ' +
            'so this window is ingestion-versioned and answers no point-in-time question',
    };
}

interface PlBuildRuleArgs {
    readonly strefa: AppStrefaPlanistyczna;
    readonly ctx: PlPlanContext;
    readonly entry: PlRuleVocabularyEntry;
    readonly value: number | string | null;
    readonly unit: string | null;
    readonly tier: 1 | 6;
    readonly note: string | null;
    readonly target: PlApplicabilityTarget;
    readonly fetchedAtIso: string;
}

function plBuildRule(a: PlBuildRuleArgs): SiteIntelRule {
    const v = plValidity(a.strefa, a.ctx, a.fetchedAtIso);
    const notes = [a.note, v.note].filter((n): n is string => n !== null);
    const adopting = a.ctx.adoptingDocument;
    const documentRef =
        adopting !== null
            ? (adopting.lacze.find((l) => l.trim() !== '') ?? plIipIdentity(adopting.idIIP))
            : null;
    return SiteIntelRuleSchema.parse({
        id: `pl-rule-${a.strefa.gmlId}-${a.entry.parameter}`,
        body: null,
        applicability: {
            basis: a.target.basis,
            geometry: a.target.inlineGeometry,
            // A POG zone ceiling binds the whole strefa, not a use slot: the use PROFILES are
            // emitted as their own rules, they do not narrow these. Empty = not use-conditioned.
            useScope: [],
            // APP serves no per-rule rank axis; the PL instrument ladder stays adapter DATA.
            rank: null,
            condition: null,
        },
        provenance: {
            parameter: a.entry.parameter,
            value: a.value,
            unit: a.unit,
            source: {
                country: 'PL',
                authority: a.ctx.adoptingDocument?.organUstanawiajacy ?? PL_RULE_AUTHORITY,
                dataset: PL_RULE_DATASET,
                plan_id: a.ctx.akt !== null ? plIipIdentity(a.ctx.akt.idIIP) : null,
                object_id: `${a.strefa.oznaczenie} (${plIipIdentity(a.strefa.idIIP)})`,
                document: documentRef,
                article: null,
                page: null,
            },
            derivation: 'DIRECT',
            valueLocation: 'attribute',
            valueBasis: { scheme: PL_VALUE_BASIS_SCHEME, code: a.entry.statutoryBasis },
            confidence: notes.length > 0 ? { tier: a.tier, note: notes.join(' · ') } : { tier: a.tier },
            // R5, verbatim from the INSPIRE RegulationNatureValue reference the document carries.
            normativeForce: plCodeTail(a.strefa.charakterUstalenia),
            validityBasis: v.validityBasis,
            valid_from: v.valid_from,
            valid_to: v.valid_to,
        },
    });
}

function vocab(appElement: string): PlRuleVocabularyEntry {
    const entry = PL_RULE_VOCABULARY.find((e) => e.appElement === appElement);
    if (entry === undefined) {
        throw new Error(`pl-rule-mapper: no vocabulary row for '${appElement}'`);
    }
    return entry;
}

/**
 * PURE: one `app:StrefaPlanistyczna` (+ its resolved plan context) → the minted Zone and the
 * `SiteIntelRule[]` that cite it. Every rule validates against `SiteIntelRuleSchema` (a value
 * with no legal address is not a value — the parse enforces it), and every `basis` ref resolves
 * to an entity RETURNED HERE (the R1 referent contract).
 *
 * ⭐ E4 CONTROL 9 IS EXERCISED BY THE STATE'S OWN ARTIFACT: the official ministry sample omits
 * FAR/height on 10 of its 28 zones and the green share on 8. Those absences are emitted as
 * VISIBLE tier-6 rules with `value: null` — never dropped rows, never 0, never "no limit". The
 * parser hands them over as `{kind:'unspecified'}`, and there is no code path here that turns
 * that into a number.
 */
export function mapPlStrefaToRules(
    strefa: AppStrefaPlanistyczna,
    ctx: PlPlanContext,
    fetchedAtIso: string,
): PlMappedZone {
    const target = mintPlApplicability(strefa, ctx);
    const rules: SiteIntelRule[] = [];
    const push = (args: Omit<PlBuildRuleArgs, 'strefa' | 'ctx' | 'target' | 'fetchedAtIso'>): void => {
        rules.push(plBuildRule({ ...args, strefa, ctx, target, fetchedAtIso }));
    };

    const unknownNote = (entry: PlRuleVocabularyEntry): string =>
        `APP served no ${entry.appElement} (${entry.polishTerm}) for this strefa — the element ` +
        'is minOccurs=0 and ABSENT. UNKNOWN, never 0 and never "no limit" (E4 control 9)';

    /* the three decimal ceilings + the one measured ceiling */
    const decimals = [
        { entry: vocab('maksNadziemnaIntensywnoscZabudowy'), v: strefa.maksNadziemnaIntensywnoscZabudowy },
        { entry: vocab('maksUdzialPowierzchniZabudowy'), v: strefa.maksUdzialPowierzchniZabudowy },
        { entry: vocab('minUdzialPowierzchniBiologicznieCzynnej'), v: strefa.minUdzialPowierzchniBiologicznieCzynnej },
    ] as const;
    for (const { entry, v } of decimals) {
        if (v.kind === 'value') {
            push({ entry, value: v.value, unit: entry.unit, tier: 1, note: null });
        } else {
            push({ entry, value: null, unit: entry.unit, tier: 6, note: unknownNote(entry) });
        }
    }

    const heightEntry = vocab('maksWysokoscZabudowy');
    const h = strefa.maksWysokoscZabudowy;
    if (h.kind === 'value') {
        // gml:LengthType makes uom MANDATORY in the document — carried verbatim, never assumed.
        push({ entry: heightEntry, value: h.value, unit: h.uom, tier: 1, note: null });
    } else {
        push({ entry: heightEntry, value: null, unit: null, tier: 6, note: unknownNote(heightEntry) });
    }

    /* the zone kind + the two use profiles (classification, served as codelist references) */
    const kindEntry = vocab('nazwa');
    const kindCode = plCodeTail(strefa.nazwa);
    if (kindCode !== null) {
        push({
            entry: kindEntry,
            value: kindCode,
            unit: null,
            tier: 1,
            note:
                strefa.nazwa.title !== null
                    ? `RodzajStrefyPlanistycznejKod, xlink:title ${JSON.stringify(strefa.nazwa.title)}`
                    : 'RodzajStrefyPlanistycznejKod',
        });
    } else {
        push({ entry: kindEntry, value: null, unit: null, tier: 6, note: unknownNote(kindEntry) });
    }

    const profiles = [
        { entry: vocab('profilPodstawowy'), refs: strefa.profilPodstawowy, required: true },
        { entry: vocab('profilDodatkowy'), refs: strefa.profilDodatkowy, required: false },
    ] as const;
    for (const { entry, refs, required } of profiles) {
        const codes = refs.map((r) => plCodeTail(r)).filter((c): c is string => c !== null);
        if (codes.length > 0) {
            push({
                entry,
                // KlasyPrzeznaczeniaTerenu codes, "; "-joined and kept VERBATIM: splitting them
                // into a typology decision is business logic and lives above the adapter (the EE
                // `otstarve` precedent).
                value: codes.join('; '),
                unit: null,
                tier: 1,
                note: `KlasyPrzeznaczeniaTerenu × ${codes.length}, verbatim`,
            });
        } else if (required) {
            // XSD minOccurs=1: an empty primary profile is a malformed document, not an absence.
            push({ entry, value: null, unit: null, tier: 6, note: unknownNote(entry) });
        }
        // profilDodatkowy is minOccurs=0 and genuinely optional: no row where the plan states
        // none, because "no additional profile" is what the schema means by its absence.
    }

    return { zone: target.zone, rules, caveats: [...ctx.caveats, ...target.caveats] };
}
