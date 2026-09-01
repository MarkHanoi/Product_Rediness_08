// LANE E2b (Wave E2, REPORT §S item 5) — the Polish APP (akt planowania przestrzennego) GML 2.0
// PARSER. String in → `AppGmlParseOutcome`: plain typed structures, or `empty` (a well-formed
// collection with zero members — an ANSWER, not a failure), or a NAMED refusal carrying the
// element path. PURE + TOTAL: no I/O, no DOM, no clock, no RNG, never throws.
//
// Built against the OFFICIAL national schema and sample (both fetched 2026-09-01):
//   • XSD    `planowaniePrzestrzenne_2_0.xsd` (published 2023-11-22, 54,226 bytes, sha256 9005a694…)
//     https://www.gov.pl/static/zagospodarowanieprzestrzenne/schemas/app/2.0/planowaniePrzestrzenne_2_0.xsd
//     (linked from https://www.gov.pl/web/zagospodarowanieprzestrzenne/schematy-aplikacyjne)
//   • Sample POG test GML (2024-12-04 ministry export, 253,475 bytes, sha256 17369056…)
//     https://www.gov.pl/attachment/8dd6086a-88ba-44fb-be68-d43d14a15e36
//     (linked from https://www.gov.pl/web/zagospodarowanieprzestrzenne/przykladowe-dane)
//   Both are pinned byte-identical under `__tests__/fixtures/pl-app-gml-2-0/`.
//
// THIS IS A PARSER, NOT A MAPPER (E4 control 5): it emits the schema's own vocabulary in native
// CRS coordinates and never touches canonical siteintel entities, rule packs, or the Source
// Registry. The later PL adapter owns the mapping.
//
// Strictness contract: XSD-mandatory elements missing → whole-document refusal naming the path
// (this is what makes "corrupt one element → the parse fails naming the path" hold); optional
// planning values absent → `unspecified` (E4 control 9 — never 0, never unlimited). The official
// sample itself exercises the unspecified arm: 10 of its 28 strefy state no FAR/coverage/height.

import type {
    AppAktPlanowania,
    AppCodeRef,
    AppDecimal,
    AppDokumentFormalny,
    AppGmlCollectionInfo,
    AppGmlDocument,
    AppGmlParseOutcome,
    AppGmlRefusalReason,
    AppGmlWarning,
    AppIdentyfikator,
    AppLinearRing,
    AppMeasure,
    AppObszarStandardowDostepnosci,
    AppObszarUzupelnieniaZabudowy,
    AppObszarZabudowySrodmiejskiej,
    AppPolygon,
    AppRysunekAktu,
    AppStrefaPlanistyczna,
    AppSurfaceGeometry,
    AppWydzielenieBase,
} from './appGmlTypes.js';
import { attrLocal, attrNs, childNs, childrenNs, scanXml, textOf, type XmlElement } from './xmlScan.js';

/** The APP 2.0 target namespace — the ONE version this parser reads. */
export const APP_2_0_NAMESPACE = 'https://www.gov.pl/static/zagospodarowanieprzestrzenne/schemas/app/2.0';
const GML = 'http://www.opengis.net/gml/3.2';
const XLINK = 'http://www.w3.org/1999/xlink';
const XSI = 'http://www.w3.org/2001/XMLSchema-instance';
const GMD = 'http://www.isotc211.org/2005/gmd';
const GCO = 'http://www.isotc211.org/2005/gco';

const DECIMAL_RE = /^[+-]?(\d+(\.\d+)?|\.\d+)$/;
const INTEGER_RE = /^[+-]?\d+$/;
const COORD_RE = /^[+-]?(\d+(\.\d+)?|\.\d+)([eE][+-]?\d+)?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}(Z|[+-]\d{2}:\d{2})?$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/;

class AppRefusal {
    constructor(
        readonly reason: AppGmlRefusalReason,
        readonly path: string,
        readonly detail: string,
    ) {}
}

interface Ctx {
    readonly warnings: AppGmlWarning[];
}

// ---- element helpers -------------------------------------------------------------------------

function isNil(el: XmlElement): boolean {
    return attrNs(el, XSI, 'nil') === 'true';
}

function reqChild(el: XmlElement, local: string): XmlElement {
    const c = childNs(el, APP_2_0_NAMESPACE, local);
    if (c === null) throw new AppRefusal('missing-required-element', el.path, `<app:${local}> is required by planowaniePrzestrzenne_2_0.xsd and is absent`);
    return c;
}

function optChild(el: XmlElement, local: string): XmlElement | null {
    return childNs(el, APP_2_0_NAMESPACE, local);
}

function reqText(el: XmlElement, local: string): string {
    const c = reqChild(el, local);
    if (isNil(c)) throw new AppRefusal('unexpected-nil', c.path, `<app:${local}> is mandatory but carries xsi:nil="true"`);
    const t = textOf(c);
    if (t === '') throw new AppRefusal('missing-required-element', c.path, `<app:${local}> is present but empty`);
    return t;
}

function optText(el: XmlElement, local: string): string | null {
    const c = optChild(el, local);
    if (c === null || isNil(c)) return null;
    const t = textOf(c);
    return t === '' ? null : t;
}

function refOf(c: XmlElement): AppCodeRef {
    const href = attrNs(c, XLINK, 'href');
    if (href === null || href === '') {
        throw new AppRefusal('missing-xlink-href', c.path, `<${c.qname}> is a gml:ReferenceType and must carry xlink:href`);
    }
    return { href, title: attrNs(c, XLINK, 'title') };
}

function reqRef(el: XmlElement, local: string): AppCodeRef {
    return refOf(reqChild(el, local));
}

function optRef(el: XmlElement, local: string): AppCodeRef | null {
    const c = optChild(el, local);
    return c === null ? null : refOf(c);
}

function refList(el: XmlElement, local: string): readonly AppCodeRef[] {
    return childrenNs(el, APP_2_0_NAMESPACE, local).map(refOf);
}

function parseDecimalText(raw: string, path: string): number {
    if (!DECIMAL_RE.test(raw)) throw new AppRefusal('invalid-decimal', path, `"${raw}" is not an xs:decimal`);
    return Number(raw);
}

function optDecimal(ctx: Ctx, el: XmlElement, local: string): AppDecimal {
    const c = optChild(el, local);
    if (c === null) return { kind: 'unspecified', meaning: 'attribute-absent-in-document' };
    if (isNil(c)) {
        ctx.warnings.push({ code: 'nil-treated-as-unspecified', path: c.path, detail: `<app:${local}> carries xsi:nil="true" (schema declares no nillable elements)` });
        return { kind: 'unspecified', meaning: 'attribute-absent-in-document' };
    }
    const raw = textOf(c);
    return { kind: 'value', value: parseDecimalText(raw, c.path), raw };
}

function measureOf(ctx: Ctx, c: XmlElement, local: string): AppMeasure {
    if (isNil(c)) {
        ctx.warnings.push({ code: 'nil-treated-as-unspecified', path: c.path, detail: `<app:${local}> carries xsi:nil="true"` });
        return { kind: 'unspecified', meaning: 'attribute-absent-in-document' };
    }
    const uom = attrLocal(c, 'uom');
    if (uom === null || uom === '') {
        throw new AppRefusal('missing-uom', c.path, `<app:${local}> is a gml measure and must carry a uom attribute`);
    }
    const raw = textOf(c);
    return { kind: 'value', value: parseDecimalText(raw, c.path), uom, raw };
}

function optMeasure(ctx: Ctx, el: XmlElement, local: string): AppMeasure {
    const c = optChild(el, local);
    if (c === null) return { kind: 'unspecified', meaning: 'attribute-absent-in-document' };
    return measureOf(ctx, c, local);
}

function reqMeasure(ctx: Ctx, el: XmlElement, local: string): AppMeasure {
    return measureOf(ctx, reqChild(el, local), local);
}

function reqBoolean(el: XmlElement, local: string): boolean {
    const raw = reqText(el, local);
    if (raw === 'true' || raw === '1') return true;
    if (raw === 'false' || raw === '0') return false;
    throw new AppRefusal('invalid-boolean', el.path, `<app:${local}> "${raw}" is not an xs:boolean`);
}

function optBoolean(el: XmlElement, local: string): boolean | null {
    const raw = optText(el, local);
    if (raw === null) return null;
    if (raw === 'true' || raw === '1') return true;
    if (raw === 'false' || raw === '0') return false;
    throw new AppRefusal('invalid-boolean', el.path, `<app:${local}> "${raw}" is not an xs:boolean`);
}

function optInteger(el: XmlElement, local: string): number | null {
    const c = optChild(el, local);
    if (c === null || isNil(c)) return null;
    const raw = textOf(c);
    if (!INTEGER_RE.test(raw)) throw new AppRefusal('invalid-integer', c.path, `<app:${local}> "${raw}" is not an xs:integer`);
    return Number(raw);
}

function reqInteger(el: XmlElement, local: string): number {
    const c = reqChild(el, local);
    const raw = textOf(c);
    if (!INTEGER_RE.test(raw)) throw new AppRefusal('invalid-integer', c.path, `<app:${local}> "${raw}" is not an xs:integer`);
    return Number(raw);
}

function checkDate(raw: string, path: string, local: string): string {
    if (!DATE_RE.test(raw)) throw new AppRefusal('invalid-date', path, `<app:${local}> "${raw}" is not an xs:date`);
    return raw;
}

function checkDateTime(raw: string, path: string, local: string): string {
    if (!DATETIME_RE.test(raw)) throw new AppRefusal('invalid-datetime', path, `<app:${local}> "${raw}" is not an xs:dateTime`);
    return raw;
}

function reqDate(el: XmlElement, local: string): string {
    return checkDate(reqText(el, local), el.path, local);
}

function optDate(el: XmlElement, local: string): string | null {
    const raw = optText(el, local);
    return raw === null ? null : checkDate(raw, el.path, local);
}

function reqDateTime(el: XmlElement, local: string): string {
    return checkDateTime(reqText(el, local), el.path, local);
}

function optDateTime(el: XmlElement, local: string): string | null {
    const raw = optText(el, local);
    return raw === null ? null : checkDateTime(raw, el.path, local);
}

function reqGmlId(el: XmlElement): string {
    const id = attrNs(el, GML, 'id');
    if (id === null || id === '') throw new AppRefusal('missing-gml-id', el.path, `<${el.qname}> is a GML feature and must carry gml:id`);
    return id;
}

function parseIdentyfikator(el: XmlElement): AppIdentyfikator {
    const idIIP = reqChild(el, 'idIIP');
    const ident = childNs(idIIP, APP_2_0_NAMESPACE, 'Identyfikator');
    if (ident === null) throw new AppRefusal('missing-required-element', idIIP.path, '<app:Identyfikator> is required inside <app:idIIP>');
    return {
        przestrzenNazw: reqText(ident, 'przestrzenNazw'),
        lokalnyId: reqText(ident, 'lokalnyId'),
        wersjaId: optText(ident, 'wersjaId'),
    };
}

// ---- geometry --------------------------------------------------------------------------------

function parsePosList(el: XmlElement): AppLinearRing {
    const raw = textOf(el);
    if (raw === '') throw new AppRefusal('empty-geometry', el.path, '<gml:posList> is empty');
    const toks = raw.split(/\s+/);
    for (const t of toks) {
        if (!COORD_RE.test(t)) throw new AppRefusal('invalid-coordinate', el.path, `"${t}" is not a coordinate`);
    }
    const dimAttr = attrLocal(el, 'srsDimension');
    if (dimAttr !== null && dimAttr !== '2') {
        throw new AppRefusal('unsupported-srs-dimension', el.path, `srsDimension="${dimAttr}" — APP 2.0 geometries are 2D`);
    }
    if (toks.length % 2 !== 0) {
        throw new AppRefusal('odd-coordinate-count', el.path, `${toks.length} numbers do not form 2D coordinate pairs`);
    }
    const positions: Array<readonly [number, number]> = [];
    for (let k = 0; k < toks.length; k += 2) {
        positions.push([Number(toks[k]), Number(toks[k + 1])]);
    }
    if (positions.length < 4) {
        throw new AppRefusal('ring-too-short', el.path, `a gml:LinearRing needs ≥4 positions, found ${positions.length}`);
    }
    const first = positions[0] as readonly [number, number];
    const last = positions[positions.length - 1] as readonly [number, number];
    if (first[0] !== last[0] || first[1] !== last[1]) {
        throw new AppRefusal('ring-not-closed', el.path, `ring first position (${first[0]} ${first[1]}) ≠ last (${last[0]} ${last[1]})`);
    }
    return { positions };
}

function parseRing(container: XmlElement): AppLinearRing {
    const ring = childNs(container, GML, 'LinearRing');
    if (ring === null) throw new AppRefusal('unsupported-geometry', container.path, `<${container.qname}> holds no <gml:LinearRing> (curved rings are not APP 2.0 content)`);
    const posList = childNs(ring, GML, 'posList');
    if (posList === null) throw new AppRefusal('empty-geometry', ring.path, '<gml:LinearRing> holds no <gml:posList>');
    return parsePosList(posList);
}

function checkSrsDimension(el: XmlElement): void {
    const dim = attrLocal(el, 'srsDimension');
    if (dim !== null && dim !== '2') {
        throw new AppRefusal('unsupported-srs-dimension', el.path, `srsDimension="${dim}" — APP 2.0 geometries are 2D`);
    }
}

function parsePolygon(ctx: Ctx, poly: XmlElement, inheritedSrs: string | null): AppPolygon {
    checkSrsDimension(poly);
    const srsName = attrLocal(poly, 'srsName') ?? inheritedSrs;
    if (srsName === null) {
        ctx.warnings.push({ code: 'missing-srs-name', path: poly.path, detail: 'polygon carries no srsName (and none is inherited) — coordinates are unit-less until the adapter resolves the CRS' });
    }
    const exteriorEl = childNs(poly, GML, 'exterior');
    if (exteriorEl === null) throw new AppRefusal('empty-geometry', poly.path, '<gml:Polygon> holds no <gml:exterior>');
    const exterior = parseRing(exteriorEl);
    const interiors = childrenNs(poly, GML, 'interior').map(parseRing);
    return { exterior, interiors, srsName };
}

/** Parse the content of a surface property (app:geometria / app:zasiegPrzestrzenny). */
function parseSurfaceProperty(ctx: Ctx, prop: XmlElement): AppSurfaceGeometry {
    const first = prop.children[0];
    if (first === undefined) throw new AppRefusal('empty-geometry', prop.path, `<${prop.qname}> holds no geometry element`);
    if (first.ns === GML && first.local === 'Polygon') {
        return { polygons: [parsePolygon(ctx, first, null)] };
    }
    if (first.ns === GML && first.local === 'MultiSurface') {
        checkSrsDimension(first);
        const inherited = attrLocal(first, 'srsName');
        const polygons: AppPolygon[] = [];
        for (const member of childrenNs(first, GML, 'surfaceMember')) {
            const poly = childNs(member, GML, 'Polygon');
            if (poly === null) {
                throw new AppRefusal('unsupported-geometry', member.path, `<gml:surfaceMember> holds no <gml:Polygon> (found <${member.children[0]?.qname ?? 'nothing'}>)`);
            }
            polygons.push(parsePolygon(ctx, poly, inherited));
        }
        if (polygons.length === 0) throw new AppRefusal('empty-geometry', first.path, '<gml:MultiSurface> holds no <gml:surfaceMember>');
        return { polygons };
    }
    throw new AppRefusal('unsupported-geometry', first.path, `<${first.qname}> is not a supported APP 2.0 surface (Polygon | MultiSurface)`);
}

// ---- feature parsers -------------------------------------------------------------------------

function parseWydzielenieSpine(ctx: Ctx, el: XmlElement): AppWydzielenieBase {
    return {
        gmlId: reqGmlId(el),
        idIIP: parseIdentyfikator(el),
        oznaczenie: reqText(el, 'oznaczenie'),
        symbol: reqText(el, 'symbol'),
        poczatekWersjiObiektu: reqDateTime(el, 'poczatekWersjiObiektu'),
        koniecWersjiObiektu: optDateTime(el, 'koniecWersjiObiektu'),
        obowiazujeOd: reqDate(el, 'obowiazujeOd'),
        obowiazujeDo: optDate(el, 'obowiazujeDo'),
        status: reqRef(el, 'status'),
        charakterUstalenia: reqRef(el, 'charakterUstalenia'),
        geometria: parseSurfaceProperty(ctx, reqChild(el, 'geometria')),
        plan: reqRef(el, 'plan'),
        sourcePath: el.path,
    };
}

function parseStrefaPlanistyczna(ctx: Ctx, el: XmlElement): AppStrefaPlanistyczna {
    const spine = parseWydzielenieSpine(ctx, el);
    const profilPodstawowy = refList(el, 'profilPodstawowy');
    if (profilPodstawowy.length === 0) {
        throw new AppRefusal('missing-required-element', el.path, '<app:profilPodstawowy> is required at least once for a StrefaPlanistyczna');
    }
    return {
        ...spine,
        nazwa: reqRef(el, 'nazwa'),
        nazwaAlternatywna: optText(el, 'nazwaAlternatywna'),
        profilPodstawowy,
        profilDodatkowy: refList(el, 'profilDodatkowy'),
        maksNadziemnaIntensywnoscZabudowy: optDecimal(ctx, el, 'maksNadziemnaIntensywnoscZabudowy'),
        maksUdzialPowierzchniZabudowy: optDecimal(ctx, el, 'maksUdzialPowierzchniZabudowy'),
        maksWysokoscZabudowy: optMeasure(ctx, el, 'maksWysokoscZabudowy'),
        minUdzialPowierzchniBiologicznieCzynnej: optDecimal(ctx, el, 'minUdzialPowierzchniBiologicznieCzynnej'),
    };
}

function parseObszarUzupelnienia(ctx: Ctx, el: XmlElement): AppObszarUzupelnieniaZabudowy {
    return { ...parseWydzielenieSpine(ctx, el), nazwa: optText(el, 'nazwa') };
}

function parseObszarSrodmiejski(ctx: Ctx, el: XmlElement): AppObszarZabudowySrodmiejskiej {
    return { ...parseWydzielenieSpine(ctx, el), nazwa: optText(el, 'nazwa') };
}

function parseObszarStandardow(ctx: Ctx, el: XmlElement): AppObszarStandardowDostepnosci {
    return {
        ...parseWydzielenieSpine(ctx, el),
        nazwa: optText(el, 'nazwa'),
        wylaczenieZabudowyZagrodowej: reqBoolean(el, 'wylaczenieZabudowyZagrodowej'),
        odlegloscDoSzkolyPodstawowej: reqMeasure(ctx, el, 'odlegloscDoSzkolyPodstawowej'),
        odlegloscDoObszarowZieleniPublicznej: reqMeasure(ctx, el, 'odlegloscDoObszarowZieleniPublicznej'),
        powierzchniaLacznaObszarowZieleniPublicznej: reqMeasure(ctx, el, 'powierzchniaLacznaObszarowZieleniPublicznej'),
        odlegloscDoObszaruZieleniPublicznej: reqMeasure(ctx, el, 'odlegloscDoObszaruZieleniPublicznej'),
        powierzchniaObszaruZieleniPublicznej: reqMeasure(ctx, el, 'powierzchniaObszaruZieleniPublicznej'),
        odlegloscDoPrzedszkola: optMeasure(ctx, el, 'odlegloscDoPrzedszkola'),
        odlegloscDoZlobka: optMeasure(ctx, el, 'odlegloscDoZlobka'),
        odlegloscDoAmbulatoriumPOZ: optMeasure(ctx, el, 'odlegloscDoAmbulatoriumPOZ'),
        odlegloscDoBiblioteki: optMeasure(ctx, el, 'odlegloscDoBiblioteki'),
        odlegloscDoDomuKultury: optMeasure(ctx, el, 'odlegloscDoDomuKultury'),
        odlegloscDoDomuPomocySpolecznej: optMeasure(ctx, el, 'odlegloscDoDomuPomocySpolecznej'),
        odlegloscDoUrzadzonegoTerenuSportu: optMeasure(ctx, el, 'odlegloscDoUrzadzonegoTerenuSportu'),
        odlegloscDoPrzystanku: optMeasure(ctx, el, 'odlegloscDoPrzystanku'),
        odlegloscDoPlacowkiPocztowej: optMeasure(ctx, el, 'odlegloscDoPlacowkiPocztowej'),
        odlegloscDoApteki: optMeasure(ctx, el, 'odlegloscDoApteki'),
        odlegloscDoPosterunkuPolicji: optMeasure(ctx, el, 'odlegloscDoPosterunkuPolicji'),
        odlegloscDoPosterunkuJednostkiOchronyPrzeciwpozarowej: optMeasure(ctx, el, 'odlegloscDoPosterunkuJednostkiOchronyPrzeciwpozarowej'),
    };
}

/** Feature-member references on the Akt (wydzielenie/regulacja/rysunek): xlink refs; inline members warn. */
function memberRefList(ctx: Ctx, el: XmlElement, local: string): readonly AppCodeRef[] {
    const out: AppCodeRef[] = [];
    for (const c of childrenNs(el, APP_2_0_NAMESPACE, local)) {
        const href = attrNs(c, XLINK, 'href');
        if (href !== null && href !== '') {
            out.push({ href, title: attrNs(c, XLINK, 'title') });
        } else if (c.children.length > 0) {
            ctx.warnings.push({ code: 'inline-member-not-dereferenced', path: c.path, detail: `<app:${local}> carries an inline feature; this parser records xlink references only — the inline copy is parsed where it appears as a collection member` });
        } else {
            throw new AppRefusal('missing-xlink-href', c.path, `<app:${local}> carries neither xlink:href nor an inline feature`);
        }
    }
    return out;
}

function parseAkt(ctx: Ctx, el: XmlElement): AppAktPlanowania {
    return {
        gmlId: reqGmlId(el),
        idIIP: parseIdentyfikator(el),
        poczatekWersjiObiektu: reqDateTime(el, 'poczatekWersjiObiektu'),
        koniecWersjiObiektu: optDateTime(el, 'koniecWersjiObiektu'),
        tytul: reqText(el, 'tytul'),
        tytulAlternatywny: childrenNs(el, APP_2_0_NAMESPACE, 'tytulAlternatywny').map(textOf),
        typPlanu: reqRef(el, 'typPlanu'),
        poziomHierarchii: reqRef(el, 'poziomHierarchii'),
        obowiazujeOd: optDate(el, 'obowiazujeOd'),
        obowiazujeDo: optDate(el, 'obowiazujeDo'),
        status: reqRef(el, 'status'),
        zmiana: optInteger(el, 'zmiana'),
        modyfikacja: optBoolean(el, 'modyfikacja'),
        zasiegPrzestrzenny: parseSurfaceProperty(ctx, reqChild(el, 'zasiegPrzestrzenny')),
        dokument: refList(el, 'dokument'),
        dokumentPrzystepujacy: refList(el, 'dokumentPrzystepujacy'),
        dokumentUchwalajacy: optRef(el, 'dokumentUchwalajacy'),
        dokumentZmieniajacy: refList(el, 'dokumentZmieniajacy'),
        dokumentUchylajacy: refList(el, 'dokumentUchylajacy'),
        dokumentUniewazniajacy: refList(el, 'dokumentUniewazniajacy'),
        wydzielenie: memberRefList(ctx, el, 'wydzielenie'),
        regulacja: memberRefList(ctx, el, 'regulacja'),
        rysunek: memberRefList(ctx, el, 'rysunek'),
        sourcePath: el.path,
    };
}

function parseDokumentFormalny(el: XmlElement): AppDokumentFormalny {
    // app:data → gmd:CI_Date → gmd:date → gco:Date (+ gmd:dateType → gmd:CI_DateTypeCode)
    const dataEl = reqChild(el, 'data');
    let data: { readonly date: string; readonly dateType: string | null } | null = null;
    const ciDate = childNs(dataEl, GMD, 'CI_Date');
    if (ciDate !== null) {
        const dateProp = childNs(ciDate, GMD, 'date');
        const leaf = dateProp === null ? null : (childNs(dateProp, GCO, 'Date') ?? childNs(dateProp, GCO, 'DateTime'));
        if (leaf === null) throw new AppRefusal('missing-required-element', ciDate.path, '<gmd:CI_Date> holds no <gco:Date>/<gco:DateTime>');
        const typeProp = childNs(ciDate, GMD, 'dateType');
        const typeCode = typeProp === null ? null : childNs(typeProp, GMD, 'CI_DateTypeCode');
        data = { date: textOf(leaf), dateType: typeCode === null ? null : (attrLocal(typeCode, 'codeListValue') ?? textOf(typeCode)) };
    } else {
        throw new AppRefusal('missing-required-element', dataEl.path, '<app:data> holds no <gmd:CI_Date>');
    }
    return {
        gmlId: reqGmlId(el),
        idIIP: parseIdentyfikator(el),
        tytul: reqText(el, 'tytul'),
        nazwaSkrocona: optText(el, 'nazwaSkrocona'),
        numerIdentyfikacyjny: optText(el, 'numerIdentyfikacyjny'),
        organUstanawiajacy: optText(el, 'organUstanawiajacy'),
        data,
        dataWejsciaWZycie: optDate(el, 'dataWejsciaWZycie'),
        dataUchylenia: optDate(el, 'dataUchylenia'),
        szczegoloweOdniesienie: optText(el, 'szczegoloweOdniesienie'),
        dziennikUrzedowy: optRef(el, 'dziennikUrzedowy'),
        lacze: childrenNs(el, APP_2_0_NAMESPACE, 'lacze').map(textOf),
        uchwala: refList(el, 'uchwala'),
        przystapienie: refList(el, 'przystapienie'),
        zmienia: refList(el, 'zmienia'),
        uchyla: refList(el, 'uchyla'),
        uniewaznia: refList(el, 'uniewaznia'),
        sourcePath: el.path,
    };
}

function parseRysunek(el: XmlElement): AppRysunekAktu {
    return {
        gmlId: reqGmlId(el),
        idIIP: parseIdentyfikator(el),
        poczatekWersjiObiektu: reqDateTime(el, 'poczatekWersjiObiektu'),
        koniecWersjiObiektu: optDateTime(el, 'koniecWersjiObiektu'),
        tytul: reqText(el, 'tytul'),
        lacze: reqText(el, 'lacze'),
        legenda: optText(el, 'legenda'),
        ukladOdniesieniaPrzestrzennego: reqText(el, 'ukladOdniesieniaPrzestrzennego'),
        rozdzielczoscPrzestrzenna: reqInteger(el, 'rozdzielczoscPrzestrzenna'),
        opis: optText(el, 'opis'),
        obowiazujeOd: optDate(el, 'obowiazujeOd'),
        obowiazujeDo: optDate(el, 'obowiazujeDo'),
        plan: reqRef(el, 'plan'),
        sourcePath: el.path,
    };
}

// ---- document walk ---------------------------------------------------------------------------

/**
 * Parse an APP (akt planowania przestrzennego) GML 2.0 document. Total and deterministic:
 * the same string always yields a structurally identical outcome; no input throws.
 */
export function parseAppGml(input: string): AppGmlParseOutcome {
    const scan = scanXml(input);
    if (!scan.ok) {
        return {
            status: 'refused',
            reason: `malformed-xml:${scan.reason}`,
            path: scan.path,
            detail: `${scan.detail} (at offset ${scan.offset})`,
        };
    }
    const ctx: Ctx = { warnings: [] };
    try {
        const root = scan.root;
        if (root.local !== 'FeatureCollection') {
            return {
                status: 'refused',
                reason: 'not-a-feature-collection',
                path: root.path,
                detail: `root element is <${root.qname}> — expected a WFS/GML FeatureCollection`,
            };
        }
        const collection: AppGmlCollectionInfo = {
            rootQName: root.qname,
            timeStamp: attrLocal(root, 'timeStamp'),
            numberReturned: attrLocal(root, 'numberReturned'),
            numberMatched: attrLocal(root, 'numberMatched'),
        };

        // gather member features: wfs:member / gml:featureMember hold one feature each;
        // gml:featureMembers holds many. Anything else at root level is collection metadata.
        const memberFeatures: XmlElement[] = [];
        let memberCount = 0;
        for (const child of root.children) {
            if (child.local === 'member' || child.local === 'featureMember') {
                memberCount++;
                const feature = child.children[0];
                if (feature !== undefined) memberFeatures.push(feature);
                else ctx.warnings.push({ code: 'foreign-member', path: child.path, detail: 'member wrapper holds no inline feature (xlink members are not dereferenced)' });
            } else if (child.local === 'featureMembers') {
                for (const feature of child.children) {
                    memberCount++;
                    memberFeatures.push(feature);
                }
            }
        }

        if (memberCount === 0) {
            return { status: 'empty', reason: 'no-members', collection, warnings: ctx.warnings };
        }

        const akty: AppAktPlanowania[] = [];
        const strefy: AppStrefaPlanistyczna[] = [];
        const ouz: AppObszarUzupelnieniaZabudowy[] = [];
        const ozs: AppObszarZabudowySrodmiejskiej[] = [];
        const osd: AppObszarStandardowDostepnosci[] = [];
        const dokumenty: AppDokumentFormalny[] = [];
        const rysunki: AppRysunekAktu[] = [];
        const unrecognized: Array<{ qname: string; ns: string; path: string }> = [];

        for (const f of memberFeatures) {
            if (f.ns !== APP_2_0_NAMESPACE) {
                unrecognized.push({ qname: f.qname, ns: f.ns, path: f.path });
                ctx.warnings.push({ code: 'foreign-member', path: f.path, detail: `<${f.qname}> (ns "${f.ns}") is not an APP 2.0 feature` });
                continue;
            }
            switch (f.local) {
                case 'StrefaPlanistyczna':
                    strefy.push(parseStrefaPlanistyczna(ctx, f));
                    break;
                case 'ObszarUzupelnieniaZabudowy':
                    ouz.push(parseObszarUzupelnienia(ctx, f));
                    break;
                case 'ObszarZabudowySrodmiejskiej':
                    ozs.push(parseObszarSrodmiejski(ctx, f));
                    break;
                case 'ObszarStandardowDostepnosciInfrastrukturySpolecznej':
                    osd.push(parseObszarStandardow(ctx, f));
                    break;
                case 'AktPlanowaniaPrzestrzennego':
                    akty.push(parseAkt(ctx, f));
                    break;
                case 'DokumentFormalny':
                    dokumenty.push(parseDokumentFormalny(f));
                    break;
                case 'RysunekAktuPlanowaniaPrzestrzennego':
                    rysunki.push(parseRysunek(f));
                    break;
                default:
                    unrecognized.push({ qname: f.qname, ns: f.ns, path: f.path });
                    ctx.warnings.push({ code: 'unrecognized-app-member', path: f.path, detail: `<${f.qname}> is in the APP 2.0 namespace but is not a planowaniePrzestrzenne_2_0.xsd feature — recorded, not parsed` });
                    break;
            }
        }

        const appFeatureCount = akty.length + strefy.length + ouz.length + ozs.length + osd.length + dokumenty.length + rysunki.length;
        if (appFeatureCount === 0) {
            return {
                status: 'refused',
                reason: 'no-app20-features',
                path: root.path,
                detail: `the collection holds ${memberCount} member(s) but none is an APP 2.0 feature (expected namespace ${APP_2_0_NAMESPACE})`,
            };
        }

        const document: AppGmlDocument = {
            collection,
            akty,
            strefyPlanistyczne: strefy,
            obszaryUzupelnieniaZabudowy: ouz,
            obszaryZabudowySrodmiejskiej: ozs,
            obszaryStandardowDostepnosci: osd,
            dokumentyFormalne: dokumenty,
            rysunki,
            unrecognizedMembers: unrecognized,
        };
        return { status: 'parsed', document, warnings: ctx.warnings };
    } catch (e) {
        if (e instanceof AppRefusal) {
            return { status: 'refused', reason: e.reason, path: e.path, detail: e.detail };
        }
        // Defensive totality — deterministic, named, never a throw.
        return { status: 'refused', reason: 'malformed-xml:internal', path: '', detail: `internal: ${String(e)}` };
    }
}
