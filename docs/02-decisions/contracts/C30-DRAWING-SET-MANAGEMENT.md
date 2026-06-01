# C30 — Drawing Set Management

> **Stamp**: 2026-05-31 · **Status**: DRAFT
> **Scope**: governs the existing `plugins/sheets/src/book/book-exporter.ts` (PRYZM 2 S37 multi-sheet composition) and formalises the missing pieces: SheetSet store, revision tracking, issue register, transmittal package, drawing register, automatic sheet numbering, multi-sheet PDF/A package export.
> **Depends on**: [C24](C24-SHEET-COMPOSITION-ENGINE.md) (single-sheet authoring), [C29](C29-PDF-VECTOR-EXPORT.md) (single-sheet PDF export).
> **Downstream**: consultant deliverables, construction-document handover.
> **Key principles**: **P6** (commands only), **P8** (revision-issuance spans).
> **Master plan**: [PRYZM3-MASTER-IMPLEMENTATION-PLAN-2026-05-31.md §8.3 SCE-γ-3 + SCE-γ-4](../03_PRYZM3/PRYZM3-MASTER-IMPLEMENTATION-PLAN-2026-05-31.md).
> **Prior-art**: [PRYZM3-PRIOR-ART-AUDIT-2026-05-31.md §3.1](../03_PRYZM3/PRYZM3-PRIOR-ART-AUDIT-2026-05-31.md). PRYZM 2 ref: S37 (book/ folder under plugins/sheets).

---

## §1 — Invariants

### §1.1 — A SheetSet aggregates N Sheets

A `SheetSet` is the project's full delivery package — a collection of Sheets ([C24](C24-SHEET-COMPOSITION-ENGINE.md)) with their own ordering, numbering scheme, revision history, and issue register. A project MAY have multiple SheetSets (e.g. "Planning Application", "Tender Set", "Construction Issue").

### §1.2 — Revisions are first-class

A `Revision` row carries: `revisionId`, `date`, `description`, `author`, `status` (`draft` / `issued` / `superseded`), `scope` (which sheets / viewports affected). Status transitions are one-way: `draft → issued → superseded`. Cannot revert.

Revision clouds (annotation indicating revised regions on a sheet) are first-class annotation elements — they live in `plugins/annotations/` with a `RevisionCloud` type bound to a `Revision` id.

### §1.3 — Sheet numbering is configurable

Default numbering scheme: `A-001`, `A-002`, ... `A-999` (architecture). Configurable per discipline: `S-` (structural), `M-` (mechanical), `E-` (electrical), `P-` (plumbing). Override per sheet supported.

### §1.4 — Transmittal is a single PDF/A-3 package

When the user issues a revision, a **transmittal package** is generated: a single PDF/A-3 file containing:

- Cover sheet (project info, recipient, issue date, list of sheets included).
- Drawing register (table of sheets + revisions).
- All sheets in the set, in numbering order, each as a vector page (via [C29](C29-PDF-VECTOR-EXPORT.md)).
- Optional: embedded IFC4X3 (per [C29 §3](C29-PDF-VECTOR-EXPORT.md)).

Per P8, the transmittal export emits a span: `pryzm.sheetset.exportTransmittal` with attributes `{ sheetCount, totalElementCount, ifcEmbedded, fileSizeBytes }`.

### §1.5 — One sheet set per project at a time can be "issued"

To prevent confusion, only one SheetSet may be in `issued` status at a time per discipline. Issuing a new SheetSet supersedes the previous one. The previous remains in the project as `superseded`.

---

## §2 — Schema (in `packages/schemas/src/sheet-set/`)

| Schema | Owns |
|---|---|
| `SheetSet` | `{ id, name, discipline, sheets: SheetId[], numberingScheme, revisions: RevisionId[], status: 'draft' \| 'issued' \| 'superseded', issuedAt?, supersededBy? }` |
| `Revision` | as per §1.2 |
| `IssueRegister` | per-project log of all issued revisions across all sheet sets |
| `TransmittalPackage` | `{ id, sheetSetId, generatedAt, recipientName, recipientEmail, coverSheetText, includeIfcEmbed, pdfBytes? }` |
| `DrawingRegister` | `{ sheetSetId, rows: [{ sheetNumber, sheetTitle, currentRevision, lastIssued }] }` (derived view) |

---

## §3 — Store

`packages/stores/src/SheetSetStore.ts` (NEW). Holds the project's SheetSets, revisions, issue register. Reactive to Sheet changes from [C24](C24-SHEET-COMPOSITION-ENGINE.md) `SheetStore`.

---

## §4 — Commands

| Command | Effect |
|---|---|
| `sheetset.create` | Create a new SheetSet with name, discipline, numbering scheme |
| `sheetset.delete` | Delete (cascades to draft revisions; superseded revisions retained as audit trail) |
| `sheetset.addSheet` | Add a Sheet to a SheetSet; auto-numbered |
| `sheetset.removeSheet` | Remove a Sheet from a SheetSet (does NOT delete the Sheet itself) |
| `sheetset.reorderSheets` | Reorder sheets in the set (renumbers automatically) |
| `sheetset.addRevision` | Create a new draft Revision (status: `draft`) |
| `sheetset.issueRevision` | Transition draft → issued; generates transmittal PDF |
| `sheetset.supersedeRevision` | Transition issued → superseded (when a newer revision issues) |
| `sheetset.generateTransmittal` | Build the transmittal PDF without issuing |
| `sheetset.exportPdfPackage` | Export the entire SheetSet as a single multi-page PDF |
| `sheetset.exportRegister` | Export the drawing register as Excel / CSV |

All commands open OTel spans per P8.

---

## §5 — Revision cloud annotation

Each revision in a SheetSet MAY have one or more revision-cloud annotations placed on specific sheets, indicating the revised regions. The cloud is an annotation element (via `plugins/annotations/`) with a `RevisionCloud` type and a `revisionId` foreign key.

Rendering: cloud-shaped polyline around the revised region, with a small triangle tag carrying the revision number (e.g. "△2").

When a viewer clicks a revision cloud, they see the revision's `description` and `author` in a tooltip.

---

## §6 — Drawing register

The drawing register is a derived view over `SheetSet.sheets` + each Sheet's `currentRevision`. It is rendered:

- As a sheet (the cover sheet in the transmittal).
- As an Excel export.
- As a HTML view in the editor's SheetSet panel.

---

## §7 — Issue workflow

```
User: "Issue revision 2 to consultant"
   │
   ▼  sheetset.issueRevision (revisionId)
   │   - Validate: all sheets in set have revision N OR a documented "no change"
   │   - Transition Revision.status: draft → issued
   │   - Update IssueRegister
   │
   ▼  sheetset.generateTransmittal (auto-fired after issue)
   │   - Compose cover sheet
   │   - Compose drawing register
   │   - Stream each sheet through pdf-lib (C29)
   │   - Optionally embed IFC (C25 + C29)
   │   - Emit PDF/A-3 bytes
   │
   ▼  ExportResult { uri, bytes, span }
```

---

## §8 — CI gates

| Gate | What it checks | Implementation |
|---|---|---|
| One issued sheet set per discipline | Cannot have two `issued` SheetSets of same discipline | runtime check |
| Revision status one-way | Cannot transition `issued → draft` | runtime check |
| Schema purity | `packages/schemas/src/sheet-set/` is L0-pure | extend existing |
| Span per transmittal | P8 — every transmittal generation emits a span | extend existing |

---

## §9 — NFT targets

| NFT | Target | Bench |
|---|---|---|
| 20-sheet transmittal PDF | < 30 s | `transmittal-20.bench.ts` (new) |
| 100-sheet transmittal PDF | < 2 min | `transmittal-100.bench.ts` (new) |
| Drawing register render at 100 sheets | < 100 ms | `drawing-register.bench.ts` (new) |
| Revision-cloud annotation render | inherited from `plugins/annotations/` | — |

---

## §10 — What this contract governs (existing implementation + gap-fill)

### §10.1 — Existing implementation

| Component | Path | PRYZM 2 ref |
|---|---|---|
| Multi-sheet composition logic | `plugins/sheets/src/book/book-exporter.ts` | S37 |
| `addSheetToBook`, `moveSheetInBook` | `plugins/sheets/src/book/book.ts` | S37 |
| Revision-table widget | `plugins/sheets/src/widgets/` (one of the 6 widget types) | S37 |
| Single-sheet PDF export | (NEW per [C29](C29-PDF-VECTOR-EXPORT.md)) | — |

### §10.2 — Gap-fill scope (NEW)

| Gap | Action | Estimate |
|---|---|---|
| `SheetSetStore` | Create new store | 0.5 wk |
| Revision schemas + status state machine | `packages/schemas/src/sheet-set/` | 0.5 wk |
| Revision cloud annotation | Extend `plugins/annotations/` with `RevisionCloud` type | 0.5 wk |
| Issue register | `IssueRegister` store + UI | 0.5 wk |
| Transmittal PDF generator | Builds cover sheet + register + N pages via [C29](C29-PDF-VECTOR-EXPORT.md) | 1.5 wk |
| SheetSet UI panel | `apps/editor/src/ui/sheet-sets/` | 1.5 wk |
| Auto-numbering + override | Numbering logic in store | 0.5 wk |
| CI gates | Per §8 | 0.5 wk |

**Total: ~6 wk** (within the master plan's SCE-γ-3 + SCE-γ-4 ~3.5 wk; the audit-revised effort accounts for some slack).

---

## §11 — What is NOT in this contract

- **Single-sheet authoring** — [C24](C24-SHEET-COMPOSITION-ENGINE.md). C30 aggregates Sheets, doesn't author them.
- **PDF emission** — [C29](C29-PDF-VECTOR-EXPORT.md). C30 calls C29 N times to build the transmittal.
- **DWG / DXF package export** — out of scope. SheetSets export only as PDF for now.
- **Revit sheet round-trip** — [C26 §5](C26-REVIT-ROUND-TRIP.md).
- **BCF (BIM Collaboration Format) handover** — separate concern.
- **Project metadata (project name, address)** — owned by `ProjectStore`; C30 reads from it.

---

*End — C30 Drawing Set Management, 2026-05-31.*
