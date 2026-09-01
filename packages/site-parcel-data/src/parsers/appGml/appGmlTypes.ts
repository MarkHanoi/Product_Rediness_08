// LANE E2b (Wave E2, REPORT §S item 5) — PLAIN TYPED STRUCTURES for the Polish APP
// (akt planowania przestrzennego) GML 2.0 national schema, PL preparation ahead of the
// 2026-11-30 Rejestr Urbanistyczny transition.
//
// THIS IS A PARSER'S OUTPUT MODEL, NOT THE CANONICAL MODEL (E4 control 5): country-specific
// semantics stay here, in what will become PL-adapter territory; nothing in this file touches
// the canonical siteintel entities, rule packs, or the Source Registry. The later PL adapter
// maps these structures onto canonical — this module never does.
//
// Field names deliberately mirror the official XSD (`planowaniePrzestrzenne_2_0.xsd`,
// https://www.gov.pl/static/zagospodarowanieprzestrzenne/schemas/app/2.0/planowaniePrzestrzenne_2_0.xsd,
// published 2023-11-22, fetched 2026-09-01, sha256 9005a694…) so a reader can diff a struct
// against the schema without a translation table. Dates/dateTimes are kept as the document's
// STRINGS (shape-validated) — the parser converts nothing it does not have to.
//
// E4 CONTROL 9 — UNKNOWN ≠ zero ≠ unlimited ≠ no-restriction: every optional planning value is
// an `AppDecimal`/`AppMeasure` union whose absent arm is `{ kind: 'unspecified', meaning:
// 'attribute-absent-in-document' }`. There is no code path that turns an absent attribute into
// `0`, `Infinity`, or a permissive default — a consumer must branch on `kind` to get a number.

// ---- value unions ----------------------------------------------------------------------------

/**
 * A decimal planning value that the plan may simply not state. `unspecified` means the element
 * is ABSENT in the document (XSD `minOccurs="0"`) — it is NOT zero, NOT unlimited, NOT
 * "no restriction"; what it implies is a question for the (later) PL adapter + rule layer.
 */
export type AppDecimal =
    | { readonly kind: 'value'; readonly value: number; readonly raw: string }
    | { readonly kind: 'unspecified'; readonly meaning: 'attribute-absent-in-document' };

/** A measured quantity (gml:LengthType / gml:AreaType): value + MANDATORY unit-of-measure. */
export type AppMeasure =
    | { readonly kind: 'value'; readonly value: number; readonly uom: string; readonly raw: string }
    | { readonly kind: 'unspecified'; readonly meaning: 'attribute-absent-in-document' };

/** A gml:ReferenceType — codelist entry or object reference by URI. */
export interface AppCodeRef {
    readonly href: string;
    /** Human-readable xlink:title if the document carried one. */
    readonly title: string | null;
}

/** INSPIRE-style IIP identifier (przestrzeń nazw + lokalny id + optional wersja). */
export interface AppIdentyfikator {
    readonly przestrzenNazw: string;
    readonly lokalnyId: string;
    readonly wersjaId: string | null;
}

// ---- geometry (native CRS, untouched) --------------------------------------------------------

/** One linear ring: closed, ≥4 positions, coordinates EXACTLY as written (native CRS — no reprojection here). */
export interface AppLinearRing {
    readonly positions: ReadonlyArray<readonly [number, number]>;
}

export interface AppPolygon {
    readonly exterior: AppLinearRing;
    readonly interiors: readonly AppLinearRing[];
    /** srsName as written on the geometry element (e.g. `http://www.opengis.net/def/crs/EPSG/0/2176`), or null with a warning. */
    readonly srsName: string | null;
}

/** A gml:Polygon parses to one polygon; a gml:MultiSurface to many. */
export interface AppSurfaceGeometry {
    readonly polygons: readonly AppPolygon[];
}

// ---- feature spine ---------------------------------------------------------------------------

/**
 * The shared spine of `WydzieleniePlanistyczneType` / `RegulacjaType` (the two are structurally
 * identical in the XSD apart from Regulacja's optional plain-string `nazwa`).
 */
export interface AppWydzielenieBase {
    readonly gmlId: string;
    readonly idIIP: AppIdentyfikator;
    readonly oznaczenie: string;
    readonly symbol: string;
    /** xs:dateTime string, e.g. `2024-12-04T09:58:12Z`. */
    readonly poczatekWersjiObiektu: string;
    readonly koniecWersjiObiektu: string | null;
    /** xs:date string, e.g. `2024-12-04`. */
    readonly obowiazujeOd: string;
    readonly obowiazujeDo: string | null;
    readonly status: AppCodeRef;
    readonly charakterUstalenia: AppCodeRef;
    readonly geometria: AppSurfaceGeometry;
    readonly plan: AppCodeRef;
    /** Element path inside the source document (for provenance + error reporting). */
    readonly sourcePath: string;
}

/**
 * `app:StrefaPlanistyczna` — the POG planning zone, THE Lane-4 target: the four zone-level
 * envelope ceilings (FAR / coverage / height / green share) land here.
 */
export interface AppStrefaPlanistyczna extends AppWydzielenieBase {
    /** Codelist `RodzajStrefyPlanistycznejKod` (zone kind). */
    readonly nazwa: AppCodeRef;
    readonly nazwaAlternatywna: string | null;
    /** Codelist `KlasyPrzeznaczeniaTerenu`; XSD minOccurs=1 — at least one, enforced. */
    readonly profilPodstawowy: readonly AppCodeRef[];
    readonly profilDodatkowy: readonly AppCodeRef[];
    /** Maks. nadziemna intensywność zabudowy — above-ground FAR (dimensionless). */
    readonly maksNadziemnaIntensywnoscZabudowy: AppDecimal;
    /** Maks. udział powierzchni zabudowy — site coverage, percent. */
    readonly maksUdzialPowierzchniZabudowy: AppDecimal;
    /** Maks. wysokość zabudowy — building height, with mandatory uom (metres in the official sample). */
    readonly maksWysokoscZabudowy: AppMeasure;
    /** Min. udział powierzchni biologicznie czynnej — biologically active (green) share, percent. */
    readonly minUdzialPowierzchniBiologicznieCzynnej: AppDecimal;
}

/** `app:ObszarUzupelnieniaZabudowy` — infill-permitted area (RegulacjaType, no extra members). */
export interface AppObszarUzupelnieniaZabudowy extends AppWydzielenieBase {
    readonly nazwa: string | null;
}

/** `app:ObszarZabudowySrodmiejskiej` — downtown-regime area (RegulacjaType, no extra members). */
export interface AppObszarZabudowySrodmiejskiej extends AppWydzielenieBase {
    readonly nazwa: string | null;
}

/** `app:ObszarStandardowDostepnosciInfrastrukturySpolecznej` — social-infrastructure access standards. */
export interface AppObszarStandardowDostepnosci extends AppWydzielenieBase {
    readonly nazwa: string | null;
    readonly wylaczenieZabudowyZagrodowej: boolean;
    // XSD-required standards (minOccurs defaults to 1):
    readonly odlegloscDoSzkolyPodstawowej: AppMeasure;
    readonly odlegloscDoObszarowZieleniPublicznej: AppMeasure;
    readonly powierzchniaLacznaObszarowZieleniPublicznej: AppMeasure;
    readonly odlegloscDoObszaruZieleniPublicznej: AppMeasure;
    readonly powierzchniaObszaruZieleniPublicznej: AppMeasure;
    // Optional standards (minOccurs=0):
    readonly odlegloscDoPrzedszkola: AppMeasure;
    readonly odlegloscDoZlobka: AppMeasure;
    readonly odlegloscDoAmbulatoriumPOZ: AppMeasure;
    readonly odlegloscDoBiblioteki: AppMeasure;
    readonly odlegloscDoDomuKultury: AppMeasure;
    readonly odlegloscDoDomuPomocySpolecznej: AppMeasure;
    readonly odlegloscDoUrzadzonegoTerenuSportu: AppMeasure;
    readonly odlegloscDoPrzystanku: AppMeasure;
    readonly odlegloscDoPlacowkiPocztowej: AppMeasure;
    readonly odlegloscDoApteki: AppMeasure;
    readonly odlegloscDoPosterunkuPolicji: AppMeasure;
    readonly odlegloscDoPosterunkuJednostkiOchronyPrzeciwpozarowej: AppMeasure;
}

/** `app:AktPlanowaniaPrzestrzennego` — the planning act (POG / MPZP / …) header feature. */
export interface AppAktPlanowania {
    readonly gmlId: string;
    readonly idIIP: AppIdentyfikator;
    readonly poczatekWersjiObiektu: string;
    readonly koniecWersjiObiektu: string | null;
    readonly tytul: string;
    readonly tytulAlternatywny: readonly string[];
    /** Codelist `TypAktuPlanowaniaPrzestrzennegoKod` (e.g. …/planOgolnyGminy). */
    readonly typPlanu: AppCodeRef;
    /** INSPIRE LevelOfSpatialPlanValue. */
    readonly poziomHierarchii: AppCodeRef;
    readonly obowiazujeOd: string | null;
    readonly obowiazujeDo: string | null;
    readonly status: AppCodeRef;
    readonly zmiana: number | null;
    readonly modyfikacja: boolean | null;
    readonly zasiegPrzestrzenny: AppSurfaceGeometry;
    readonly dokument: readonly AppCodeRef[];
    readonly dokumentPrzystepujacy: readonly AppCodeRef[];
    readonly dokumentUchwalajacy: AppCodeRef | null;
    readonly dokumentZmieniajacy: readonly AppCodeRef[];
    readonly dokumentUchylajacy: readonly AppCodeRef[];
    readonly dokumentUniewazniajacy: readonly AppCodeRef[];
    /** xlink references to the act's planning subdivisions (strefy). Inline members surface as warnings. */
    readonly wydzielenie: readonly AppCodeRef[];
    readonly regulacja: readonly AppCodeRef[];
    readonly rysunek: readonly AppCodeRef[];
    readonly sourcePath: string;
}

/** `app:DokumentFormalny` — the formal document (uchwała etc.) behind an act. */
export interface AppDokumentFormalny {
    readonly gmlId: string;
    readonly idIIP: AppIdentyfikator;
    readonly tytul: string;
    readonly nazwaSkrocona: string | null;
    readonly numerIdentyfikacyjny: string | null;
    readonly organUstanawiajacy: string | null;
    /** The gmd:CI_Date leaf date string (e.g. `2024-06-28`), plus its ISO 19115 date-type code. */
    readonly data: { readonly date: string; readonly dateType: string | null } | null;
    readonly dataWejsciaWZycie: string | null;
    readonly dataUchylenia: string | null;
    readonly szczegoloweOdniesienie: string | null;
    readonly dziennikUrzedowy: AppCodeRef | null;
    readonly lacze: readonly string[];
    readonly uchwala: readonly AppCodeRef[];
    readonly przystapienie: readonly AppCodeRef[];
    readonly zmienia: readonly AppCodeRef[];
    readonly uchyla: readonly AppCodeRef[];
    readonly uniewaznia: readonly AppCodeRef[];
    readonly sourcePath: string;
}

/** `app:RysunekAktuPlanowaniaPrzestrzennego` — the act's drawing (georeferenced raster link). */
export interface AppRysunekAktu {
    readonly gmlId: string;
    readonly idIIP: AppIdentyfikator;
    readonly poczatekWersjiObiektu: string;
    readonly koniecWersjiObiektu: string | null;
    readonly tytul: string;
    readonly lacze: string;
    readonly legenda: string | null;
    readonly ukladOdniesieniaPrzestrzennego: string;
    readonly rozdzielczoscPrzestrzenna: number;
    readonly opis: string | null;
    readonly obowiazujeOd: string | null;
    readonly obowiazujeDo: string | null;
    readonly plan: AppCodeRef;
    readonly sourcePath: string;
}

// ---- document --------------------------------------------------------------------------------

export interface AppGmlCollectionInfo {
    /** Root element qname, e.g. `wfs:FeatureCollection`. */
    readonly rootQName: string;
    readonly timeStamp: string | null;
    readonly numberReturned: string | null;
    readonly numberMatched: string | null;
}

export interface AppGmlDocument {
    readonly collection: AppGmlCollectionInfo;
    readonly akty: readonly AppAktPlanowania[];
    readonly strefyPlanistyczne: readonly AppStrefaPlanistyczna[];
    readonly obszaryUzupelnieniaZabudowy: readonly AppObszarUzupelnieniaZabudowy[];
    readonly obszaryZabudowySrodmiejskiej: readonly AppObszarZabudowySrodmiejskiej[];
    readonly obszaryStandardowDostepnosci: readonly AppObszarStandardowDostepnosci[];
    readonly dokumentyFormalne: readonly AppDokumentFormalny[];
    readonly rysunki: readonly AppRysunekAktu[];
    /** Members that are not APP-2.0 features (recorded, never silently dropped — E4 control 10). */
    readonly unrecognizedMembers: ReadonlyArray<{ readonly qname: string; readonly ns: string; readonly path: string }>;
}

// ---- outcomes --------------------------------------------------------------------------------

export type AppGmlWarningCode =
    | 'unrecognized-app-member'
    | 'foreign-member'
    | 'missing-srs-name'
    | 'inline-member-not-dereferenced'
    | 'nil-treated-as-unspecified';

export interface AppGmlWarning {
    readonly code: AppGmlWarningCode;
    readonly path: string;
    readonly detail: string;
}

/**
 * The closed refusal vocabulary. XML well-formedness refusals surface as `malformed-xml:<reason>`
 * so the caller still sees ONE closed union at this layer.
 */
export type AppGmlRefusalReason =
    | `malformed-xml:${string}`
    | 'not-a-feature-collection'
    | 'no-app20-features'
    | 'missing-gml-id'
    | 'missing-required-element'
    | 'missing-required-attribute'
    | 'unexpected-nil'
    | 'invalid-decimal'
    | 'invalid-integer'
    | 'invalid-boolean'
    | 'invalid-date'
    | 'invalid-datetime'
    | 'missing-uom'
    | 'missing-xlink-href'
    | 'unsupported-geometry'
    | 'unsupported-srs-dimension'
    | 'invalid-coordinate'
    | 'odd-coordinate-count'
    | 'ring-too-short'
    | 'ring-not-closed'
    | 'empty-geometry';

/**
 * FetchOutcome-STYLE outcome (C57 §1.5 discipline applied to parsing): an EMPTY collection and a
 * MALFORMED document are different answers and can never collapse to the same value.
 *
 *   • `parsed`  — well-formed APP 2.0 content; `document` carries the typed features.
 *   • `empty`   — a well-formed feature collection with ZERO members: "the register answered and
 *                 there is nothing here". NOT a failure; NOT retryable at this layer.
 *   • `refused` — the input is not a parseable APP 2.0 document; `reason` is a NAMED token from
 *                 the closed union and `path` names the offending element.
 */
export type AppGmlParseOutcome =
    | { readonly status: 'parsed'; readonly document: AppGmlDocument; readonly warnings: readonly AppGmlWarning[] }
    | { readonly status: 'empty'; readonly reason: 'no-members'; readonly collection: AppGmlCollectionInfo; readonly warnings: readonly AppGmlWarning[] }
    | { readonly status: 'refused'; readonly reason: AppGmlRefusalReason; readonly path: string; readonly detail: string };
