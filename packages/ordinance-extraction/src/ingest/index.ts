// @pryzm/ordinance-extraction — the document-ingestion barrel (Layers 1–4).
//
// PURE parts only: the result taxonomies (where failure is never absence), the
// digitisation classifier, and the normalization stage. The actual HTTP fetch and
// pdf.js read are ADAPTERS implemented outside this package (`tools/
// ordinance-ingest/`), mirroring the `DualPassExtractor` port pattern — so this
// package stays testable without a network and keeps its L2 purity.
export * from './types.js';
export * from './classify.js';
export * from './normalize.js';
export * from './pdfItems.js';
