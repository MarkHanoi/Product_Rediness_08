# ADR-040 — Schedule Export Formats: CSV, XLSX, PDF

| Field | Value |
|---|---|
| Status | **Accepted** — 2026-04-28 |
| Closes | `phases/PHASE-2C-Q3-M19-M21-SHEETS-SCHEDULES.md` §S42 (lines 909-1029) |
| Required by | Sprint S42 (= Phase 2C exit) |
| Owner | Architecture lead |
| Implementation | `plugins/schedules/src/export/{csv,xlsx,pdf}.ts`, `plugins/schedules/src/import/csv.ts` |
| Spec dependency | ADR-027 (Schedule Formula Library); ADR-039 (Export Worker Architecture) |

---

## Context

A PRYZM 2 schedule is a live, formula-evaluated tabular projection over the element store. Phase 2C ships three export targets:

1. **CSV** — round-trip-able with Excel and Google Sheets (the format quantity surveyors paste into their own spreadsheets).
2. **XLSX** — formatted workbook (bold header, auto-fit columns) for Excel / Numbers.
3. **PDF** — print-ready tabular document, multi-page with repeating header.

This ADR ratifies (a) the library choice for each format, (b) the security stance on formula-injection vectors, (c) the perf budgets that the bench gate enforces, and (d) the round-trip-import behaviour.

---

## Decisions

### A. Library selection (all pure-JS, no native bindings)

| Format | Library | Version | Rationale |
|---|---|---|---|
| CSV | none (hand-rolled, ~150 LOC) | n/a | RFC-4180 escaping is well-bounded; a dep here would be all supply-chain risk for ~150 LOC of saved code |
| XLSX | `exceljs` | `^4.4.0` | Pure-JS, no `xlsx-populate` or native libxml; tested against Excel 2016 (R2C-04). Workbook API is the cleanest of the three audited (`exceljs`, `xlsx`, `xlsx-populate`) |
| PDF | `pdf-lib` | `^1.17.1` | Pure-JS vector primitives. Schedules are pure-text tables — vector PDFs are 50 KB vs. ~3 MB for the rasterised equivalent. Helvetica is built-in to every PDF reader (no font subsetting / embed step) |

### B. Security — formula-injection guard

CSV / XLSX cells beginning with `=`, `+`, `-`, `@`, `\t`, `\r` are **formula-injection vectors** when the file is opened in Excel/Calc. The user's data may legitimately contain such cells (e.g., `-30min` rating).

| Layer | Stance |
|---|---|
| Export | Opt-in `excelSafe: true` flag prefixes such cells with a single-tick (`'`). Default `false` to preserve round-trip fidelity (the editor surfaces a checkbox in the export dialog) |
| Import | We **never** interpret an imported cell as a formula — every cell is treated as plain string and applied through `element.setProperty` handlers. A user who pastes `=SUM(A1:A99)` into Excel and re-imports gets a string `"=SUM(A1:A99)"` back as the property value — they do **not** get a re-evaluated number. This is intentional: schedules' formula language is **PRYZM's** DSL (`SUM`, `COUNT`, `IF`), not Excel's; cross-pollinating them would be confusing and a security footgun |

### C. CSV escaping rules (RFC 4180)

| Trigger | Action |
|---|---|
| Cell contains `,`, `"`, CR, or LF | Quote the cell with `"…"` |
| Cell contains a `"` | Replace each `"` with `""` inside the quoted region |
| `null` / `undefined` | Empty string |
| `boolean` | `"true"` / `"false"` |
| Number `Infinity` / `-Infinity` | `"Infinity"` / `"-Infinity"` |
| Number `NaN` | `"NaN"` |
| Sentinel `'#ERR'` / `'#CIRCULAR'` / `'#UNDEF'` | Verbatim — recipient sees what the user saw |
| Line endings | CRLF by default (RFC 4180); `lineEnd: '\n'` opt-out for snapshot tests |
| BOM | Omitted by default; `bom: true` for Excel-on-Windows recipients |

### D. Round-trip import contract

Phase 2C exit-criterion (line 1023) requires:

> "CSV export → modify in Excel → re-import preserves all non-computed fields."

Implementation:

1. The importer maps headers to column ids by exact match, then by stripping the trailing `(unit)` suffix the exporter adds.
2. Each parsed row produces a `{ elementId, columnId, importedValue }` triple — the importer **does not** mutate any store. The editor host applies the batch via ordinary `element.setProperty` commands, which means: undo/redo works, the event-log records the change, and a headless re-import in the bake worker uses the same code path.
3. Cells that map to a **computed column** (column has a `formula`) are silently dropped — re-importing a `SUM(...)` cell would overwrite the formula with its prior value, a data-loss bug. (A future S43 enhancement may surface a UI warning.)
4. Cells that map to no column at all are recorded in `unmatchedHeaders` for the editor to surface.

### E. PDF layout

| Aspect | Decision |
|---|---|
| Paper | A4 default; A3 / A2 / Letter / Legal supported |
| Orientation | Landscape default (more columns fit) |
| Font | Helvetica (PDF standard 14 — no embedding cost). Non-WinAnsi codepoints are mapped to ASCII via `sanitiseForWinAnsi()` |
| Margins | 36 pt = 0.5 in default |
| Title block | Title (14 pt bold) + optional subtitle (9 pt grey) + horizontal rule |
| Header row | Bold text on grey rect; **repeats on every page** |
| Footer | "PRYZM 2 — {scheduleName} — page X of Y" centred, 8 pt grey |
| Multi-page | Two-pass: probe usable height → split rows into chunks → emit pages with correct "page X of Y" |
| Truncation | Per-cell binary-search fit with "…" suffix; never wraps (intentional — if it doesn't fit, you wanted a wider column) |

### F. Performance budgets (CI gate)

| Format | Operation | Budget | Source |
|---|---|---|---|
| CSV | `scheduleToCSV(500-row)` | p95 < 100 ms | Spec line 1026 |
| XLSX | `scheduleToXLSX(500-row)` | p95 < 500 ms | Spec line 1026 |
| PDF | `scheduleToPDF(500-row)` | p95 < 10 s | Spec line 1026 |

Enforced by `apps/bench/src/benches/export-schedule.bench.ts` — fails CI if any p95 exceeds budget.

---

## OTel Spans

Per spec §3.3, this work registers four new spans:

| Span | Layer | Source |
|---|---|---|
| `pryzm.schedule.export.csv` | L0 | spec line 1062 |
| `pryzm.schedule.export.xlsx` | L0 | spec line 1063 |
| `pryzm.schedule.export.pdf` | L0 | spec §3.3 row 9 (added in this ADR — symmetric with the other two) |
| `pryzm.schedule.import.csv` | L0 | this ADR (round-trip observability) |

`tracing.ts:withScheduleSpan` is async-thenable-aware so the same helper covers sync (CSV) and async (XLSX, PDF) call sites.

---

## Consequences

**Positive**:
- All three export formats green for the 500-row exit-gate fixture.
- Round-trip lossless for non-computed string/number fields.
- Zero native bindings; CI runs on stock Node 20.
- Vector PDFs are tiny (≤ 50 KB for 500-row schedules) and indexable.

**Negative**:
- Schedule PDFs are vector — **not** rasterised — which means they look different from the `book-exporter` (S40) PDFs. This is correct (text in tables should be selectable PDF text, not pixels) but makes the visual-diff toolchain need a separate code path (tracked as S43 follow-up).
- `excelSafe` defaults to `false` for round-trip fidelity. A user who exports → re-opens in Excel and ignores the warning could trigger formula injection from another user's malicious data. We surface a clear checkbox; a future ADR may flip the default once the round-trip semantics are reaffirmed.

---

*Last updated: 2026-04-28. Owner: Architecture lead.*
