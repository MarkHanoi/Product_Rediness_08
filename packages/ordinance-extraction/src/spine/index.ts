// @pryzm/ordinance-extraction — the DOCUMENT → CLAIM spine barrel.
//
// {document, zone context} -> ZERO OR MORE tier-4 claims, each carrying the
// verbatim span, the document + article/page address, the extraction method, a
// confidence tier that CANNOT be 1/2/3, and a validation state of UNVALIDATED.
export * from './types.js';
export * from './tierLock.js';
export * from './readers.js';
export * from './claimProducer.js';
export * from './documentToClaims.js';
