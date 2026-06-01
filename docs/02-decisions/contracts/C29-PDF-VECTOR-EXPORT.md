# C29 — PDF Vector Export (Print-Ready)

> **Stamp**: 2026-05-31 · **Status**: DRAFT
> **Scope**: fills the typed-stub `packages/drawing-primitives/src/backends/pdf.ts` (PRYZM 2 post-2B closeout / ADR-0029) with a true vector PDF writer. Consumes the existing `plugins/sheets/` sheet output ([C24](C24-SHEET-COMPOSITION-ENGINE.md)) and emits PDF/A-3-compliant vector documents with embedded fonts, accurate line weights, and optional IFC-embed for round-trip handover.
> **Depends on**: [C24](C24-SHEET-COMPOSITION-ENGINE.md) (sheet canvas + drawing-primitives substrate), [C04](C04-RENDERING-AND-SCHEDULING.md), [C05](C05-PERSISTENCE-AND-FILE-FORMAT.md) (export pipeline).
> **Downstream**: [C30](C30-DRAWING-SET-MANAGEMENT.md) (multi-sheet PDF package).
> **Key principles**: **P5** (PDF config schema pure), **P8** (every export call carries a span).
> **Master plan**: [PRYZM3-MASTER-IMPLEMENTATION-PLAN-2026-05-31.md §8.3 SCE-β-2](../03-execution/plans/master-implementation-plan.md).
> **Prior-art**: [PRYZM3-PRIOR-ART-AUDIT-2026-05-31.md §3.7](../03-execution/status/prior-art-audit-2026-05-31.md). PRYZM 2 ref: ADR-0029 (drawing-primitives multi-backend).

---

## §1 — Invariants

### §1.1 — Vector-only output

PDF output MUST be true vector. NO raster fallback for line work. All text, lines, hatches, paths emitted as PDF vector primitives via `pdf-lib`. The only acceptable raster content is embedded images (logos, photographs in widgets) — and those MUST be tagged as `Image` widgets, not lines or text rasterised.

CI gate: `tools/ga-gate/check-vector-pdf.ts` — any code path in the PDF export pipeline that calls `canvas.toDataURL('image/png')` or `getImageData` on line work is a violation.

### §1.2 — Font embedding

All fonts used in the PDF MUST be embedded (PDF subset embedding) so the document renders identically regardless of the reader's installed fonts. The default font family is the project's title-block font. Fallback chain: project font → DejaVu Sans (open-source ASCII) → system sans-serif.

### §1.3 — Line-weight calibration

Line weights specified in the sheet (e.g. `0.13 mm` for fine, `0.25 mm` for medium, `0.50 mm` for thick) MUST translate to PDF stroke widths that print at the correct physical thickness. Calibration is paper-size-aware.

### §1.4 — PDF/A-3 compliance (default)

The default export profile is **PDF/A-3** (ISO 19005-3). PDF/A-3 permits embedded files — this enables the **IFC-embed** feature (§3 below). PDF/A-3 also guarantees long-term archival readability.

Fallback: PDF/A-2 if a consumer specifies it. Plain PDF (non-archival) is also supported but discouraged.

### §1.5 — Every PDF export emits a span

Per P8, the top-level export function opens a span. Span name: `pryzm.pdf.exportSheet` with attributes `{ paperSize, scale, viewportCount, elementCount, pdfASubVersion }`.

### §1.6 — One PDF writer

Only one PDF emission path SHALL exist. `pdf-lib` is the writer; the path goes `Sheet → drawing-primitives → pdf.ts backend → pdf-lib → bytes`. Bypass paths are CI violations.

---

## §2 — Schema (in `packages/schemas/src/pdf/`)

| Schema | Owns |
|---|---|
| `PdfExportConfig` | `{ paperSize, orientation, pdfASubVersion: '3' \| '2' \| 'none', fontSubset: 'embed' \| 'reference', plotterProfile?: 'hp-designjet' \| 'epson-t-series' \| 'custom', ifcEmbed?: boolean, bleedMm?: number, trimMarks?: boolean }` |
| `PlotterProfile` | `{ name, dpi, supportedSizes, paperFeed, marginsMm }` |

---

## §3 — IFC-embed (PDF/A-3 differentiator)

When `PdfExportConfig.ifcEmbed: true`, the PDF/A-3 export embeds the project's IFC4X3 file (from [C25](C25-IFC-EXPORT-PRODUCTION.md)) as an `EmbeddedFile`. The recipient can extract the IFC via Adobe Reader or any PDF/A-3 reader.

Use case: consultant receives a PDF; they have access to the BIM model in the same file. Single deliverable, no version-skew between PDF and IFC.

---

## §4 — Print calibration

Physical print dimension accuracy is validated against a test pattern:

- A1 sheet with a 1m × 1m calibration square.
- Print on HP DesignJet T-series; physical measurement MUST equal 1000mm ± 0.5mm.
- Repeat per supported plotter profile.

Bleed (printer extends ink past trim line) and trim marks (crop indicators) are optional per `PdfExportConfig`.

---

## §5 — Commands

| Command | Effect |
|---|---|
| `sheet.export.pdf` | Export single sheet to PDF. Routed from [C24](C24-SHEET-COMPOSITION-ENGINE.md). |
| `sheetset.export.pdfPackage` | Export entire sheet set to multi-page PDF. Owned by [C30](C30-DRAWING-SET-MANAGEMENT.md). |

Both open OTel spans per P8.

---

## §6 — CI gates

| Gate | What it checks | Implementation |
|---|---|---|
| Vector-only | No raster paths in PDF export pipeline | NEW `tools/ga-gate/check-vector-pdf.ts` |
| Font embedding | Every export uses subset-embedded fonts | NEW `tools/ga-gate/check-pdf-fonts.ts` |
| PDF/A compliance | Every PDF/A-tagged output passes a PDF/A validator | NEW nightly job |
| Schema purity | `packages/schemas/src/pdf/` is L0-pure | extend existing |

---

## §7 — NFT targets

| NFT | Target | Bench |
|---|---|---|
| Single-sheet A1 export (10k vector elements) | < 3 s | `pdf-export-a1.bench.ts` (new) |
| Multi-sheet PDF package (20 sheets) | < 30 s | delegated to [C30](C30-DRAWING-SET-MANAGEMENT.md) |
| Font subset size | < 100 KB per sheet | static check |
| PDF/A-3 file with embedded IFC (1 MB IFC) | < 5 s | `pdf-export-with-ifc.bench.ts` (new) |

---

## §8 — Implementation scope (the actual NEW work)

The full surface is summarised here. Effort: ~2 wk.

1. Fill `packages/drawing-primitives/src/backends/pdf.ts` typed stub:
   - Implement primitive → `pdf-lib` operator mapping (line, polyline, path, text, rect, circle, hatch).
   - Implement coordinate transform (sheet mm → PDF user-space points).
   - Implement font subset embedding (pdf-lib `embedFont` + subset).
2. Add `PdfExportConfig` schema in `packages/schemas/src/pdf/`.
3. Wire `sheet.export.pdf` command handler in `plugins/sheets/`.
4. Add PDF/A-3 compliance pass (add `OutputIntents`, `XMP` metadata, `MarkInfo` for tagged-PDF accessibility).
5. Add IFC-embed path (`pdf-lib` `attachFile` API).
6. Add print-calibration test harness (1m × 1m validation).
7. Add OTel span instrumentation.
8. Add CI gates (vector-only, font-embedding, PDF/A validator).

---

## §9 — What is NOT in this contract

- **Sheet canvas + composition** — [C24](C24-SHEET-COMPOSITION-ENGINE.md). C29 only emits PDF from the sheet output.
- **Multi-sheet / sheet-set PDF** — [C30](C30-DRAWING-SET-MANAGEMENT.md). C29 owns single-sheet emission.
- **DWG / DXF export** — [C24 §5](C24-SHEET-COMPOSITION-ENGINE.md).
- **Print driver / plotter calibration as a real-time service** — out of scope. C29 generates print-calibrated PDFs; the user's plotter does the rest.
- **Raster image export** — not in scope. C29 is vector-only.

---

*End — C29 PDF Vector Export, 2026-05-31.*
