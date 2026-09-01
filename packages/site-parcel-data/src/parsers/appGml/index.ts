// LANE E2b — Polish APP (akt planowania przestrzennego) GML 2.0 parser: the module's one door.
// A PARSER, not a mapper (E4 control 5) — the later PL country adapter maps these structures
// onto the canonical model; nothing here may import siteintel entities, rule packs, or the
// Source Registry.
export { parseAppGml, APP_2_0_NAMESPACE } from './parseAppGml.js';
export type {
    AppGmlParseOutcome,
    AppGmlDocument,
    AppGmlCollectionInfo,
    AppGmlRefusalReason,
    AppGmlWarning,
    AppGmlWarningCode,
    AppDecimal,
    AppMeasure,
    AppCodeRef,
    AppIdentyfikator,
    AppLinearRing,
    AppPolygon,
    AppSurfaceGeometry,
    AppWydzielenieBase,
    AppStrefaPlanistyczna,
    AppObszarUzupelnieniaZabudowy,
    AppObszarZabudowySrodmiejskiej,
    AppObszarStandardowDostepnosci,
    AppAktPlanowania,
    AppDokumentFormalny,
    AppRysunekAktu,
} from './appGmlTypes.js';
export { scanXml, childrenNs, childNs, attrLocal, attrNs, textOf } from './xmlScan.js';
export type { XmlElement, XmlAttr, XmlRefusalReason, XmlScanOutcome } from './xmlScan.js';
