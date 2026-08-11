/**
 * apps/bench — Node harness setup.
 *
 * ## Why this file exists (W5-1, 2026-08-11)
 *
 * Three NFT benches — 1 (cold-boot), 2 (project-load) and 12 (family-load) —
 * failed at MODULE LOAD, never reaching a single assertion:
 *
 *     ReferenceError: DOMMatrix is not defined
 *       ❯ pdfjs-dist/build/webpack:/pdf.js/src/display/canvas.js:65:21
 *       ❯ packages/file-format/src/import/PDFToImageConverter.ts:17:1
 *
 * `@pryzm/file-format`'s barrel eagerly pulls `PDFToImageConverter`, which
 * pulls `pdfjs-dist`, which touches browser canvas globals at import time.
 * None of these benches import, render, or measure a PDF.
 *
 * The globals below are therefore an ENVIRONMENT repair — supplying the
 * browser identifiers an unrelated transitive import reads at load time — not
 * a measurement substitute. Nothing here participates in any timed path; if a
 * bench ever actually exercised PDF rasterisation these stubs would make it
 * fail loudly rather than quietly return plausible output.
 *
 * The durable fix belongs upstream: `@pryzm/file-format` should lazily import
 * `PDFToImageConverter` so the barrel stays Node-safe. That file is outside
 * this task's ownership and is reported to the orchestrator instead.
 */

type Ctor = new (...args: unknown[]) => object;

function defineMissing(name: string, value: unknown): void {
  const g = globalThis as unknown as Record<string, unknown>;
  if (g[name] === undefined) g[name] = value;
}

/**
 * Inert placeholders. pdfjs CONSTRUCTS a DOMMatrix during module evaluation
 * (canvas.js:65 builds an identity matrix as a module-level constant), so the
 * constructor cannot throw or the import still fails.
 *
 * They are inert on purpose: no method does geometric work. Any bench that
 * genuinely tried to rasterise would produce visibly wrong output rather than
 * a plausible-looking number — the failure mode we want, per the standing
 * "no proxy for a contract's real metric" rule. Nothing here is on a timed
 * path; these classes are constructed once, at import.
 */
class InertDOMMatrix {
  a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
  m11 = 1; m12 = 0; m13 = 0; m14 = 0;
  m21 = 0; m22 = 1; m23 = 0; m24 = 0;
  m31 = 0; m32 = 0; m33 = 1; m34 = 0;
  m41 = 0; m42 = 0; m43 = 0; m44 = 1;
  is2D = true;
  isIdentity = true;
}

class InertPath2D {}
class InertImageData {}

defineMissing('DOMMatrix', InertDOMMatrix as unknown as Ctor);
defineMissing('Path2D', InertPath2D as unknown as Ctor);
defineMissing('ImageData', InertImageData as unknown as Ctor);
