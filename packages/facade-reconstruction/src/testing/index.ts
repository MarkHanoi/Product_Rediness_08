// The corpus, the overlays and the zero-dependency PNG codec.
//
// Exported as a SUBPATH (`@pryzm/facade-reconstruction/testing`) rather than from
// the main barrel, and deliberately: this module imports `node:zlib`, and folding it
// into the root export would drag a Node built-in into every browser consumer of the
// engine — breaking C108 §5.3's "THREE-free, DOM-free, I/O-free" property at the
// bundler, which is exactly the class of defect [[server-safe-entry-can-import-browser-ui]]
// records in the opposite direction.
export * from './syntheticFacades.js';
export * from './overlays.js';
export * from './png.js';
