# Madrid corpus — RETRIEVAL LOG

> Every attempt to obtain a Madrid primary source, with its **outcome as measured**, not as hoped.
> ⚠ **A 403, a WAF block and an empty response are three different values, and none of them is
> "no data"** (§CONTEXT-DATA-HONESTY, L-422/457/467/469).

---

## §R1 · 2026-08-01 — the Compendio 24-09-2025 was ALREADY in the repo's object store, unnoticed

**Outcome: ✅ RETRIEVED — from git, not from the network.**

The file now at `pdf/COMPENDIO_MPG_NNUU_24-09-2025_PGOUM-97.pdf` was not downloaded in this pass. It
was recovered from a **previous session's scratchpad**, where `tools/madrid-extract/index_pdf.py`
had been pointing at it by absolute path:

```
…/85d1d1c6-e522-4ce0-88a6-0945260ed2a4/scratchpad/compendio.pdf   25,735,355 bytes, 2026-07-31 09:17
```

That is the file the **282 cited records in `../extracted/*.json` were extracted from**, and it sat
outside the repo, on one machine, one process cleanup away from deletion — while
[`../CLOSURE-REGISTER.md`](../CLOSURE-REGISTER.md) row 15 recorded the primary document as *"not
retrievable in-repo"* and `799c3e49` / L-674 logged Madrid as holding **zero** primary sources.

**Both statements were true and neither was the whole truth.** The document existed; nothing
durable pointed at it. That is a **custody** failure, not a sourcing one, and it is a different
repair: `index_pdf.py` now resolves the PDF relative to the repo.

**Identity verified before filing** (never from the URL it came from):

| check | value |
|---|---|
| bytes | 25,735,355 (≈24.5 MB — matches `VERIFICATION.md` V2's `curl -I`) |
| sha256 | `1A3AA172B7ABE092F03E58FB2AFC26C87020B907887F919CEE20002E5FC4D0B5` |
| pages | 626 |
| PDF `title` metadata | `COMPENDIO MPG NNUU (24-09-2025)` |
| PDF `creationDate` | `D:20251020112030+02'00'` (matches V2's `Last-Modified: 2025-10-20`) |
| cover page 1 | *"COMPENDIO SEPTIEMBRE 2025 … ACTUALIZADO A 24 DE SEPTIEMBRE 2025"* |

⇒ It is the **transparencia 24-09-2025** consolidation, **not** the superseded `07_07_2025`
geoportal edition (the V10 hazard). Confirmed by the document's own contents, twice.

---

## §R2 · 2026-08-01 — a second "compendio2025.pdf" in git history is an **Access Denied page**

**Outcome: 🔴 BLOCKED — and it was committed as if it were a PDF.**

Commit `40c2bdba` (*"RESCUED from a killed agent — sources fetched"*) added three files at the repo
ROOT: `compendio2023.pdf`, `compendio2023.txt`, `compendio2025.pdf`. Its message says *"this
includes PGOUM-97 source PDFs fetched into the repo… Verify these are the right documents."*

**They were verified in this pass. `compendio2025.pdf` is 536 bytes of Akamai HTML:**

```html
<TITLE>Access Denied</TITLE>
You don't have permission to access
"http://www.madrid.es/UnidadesDescentralizadas/UDCUrbanismo/PGOUM/CompendioNNUU/
 Compendio_2025_septiembre/COMPENDIO_MPG_NNUU_24_09_2025.pdf" on this server.
Reference #18.6c64645f.1785581971.5b58002e
```

⇒ **`madrid.es` serves an edge denial to automated GETs of the Compendio PDF.** This is the same
class as Murcia's HTTP 403 (L-674) and BCNROC's F5 rejection — and it is **UNKNOWN, not
absence**: the document plainly exists, and a browser session obtains it.

⚠ **It also qualifies `VERIFICATION.md` V2.** V2 records `curl -I` → HTTP 200 / `application/pdf`.
Both observations are real: **the HEAD is allowed and the GET is denied.** A reachability check that
only issues HEAD will report a document as retrievable that cannot be retrieved. V2's *conclusion*
stands (the document exists at that locator, at that size, of that date); its implication
("therefore we can fetch it") does not.

**Not committed here:** the 536-byte denial page (it is not a document).

---

## §R3 · 2026-08-01 — `compendio2023.pdf` (21.9 MB) is real, and is the **WRONG EDITION**

**Outcome: 🟡 REAL DOCUMENT, DELIBERATELY NOT FILED AS A SOURCE.**

The same commit's `compendio2023.pdf` (21,931,872 bytes) *is* a genuine PDF, with a text layer
(`compendio2023.txt`, 1.88 MB) whose first page reads *"COMPENDIO 2023 … EDICIÓN ANOTADA A 5 DE
JUNIO DE 2023"*.

It is **not** the edition anything in this dossier cites (`readFrom: Compendio 2025 (24-09-2025)`),
and filing it in `pdf/` would invite exactly the substitution `VERIFICATION.md` V10 warns about.
The blobs remain in git history at `40c2bdba` and can be recovered by anyone who wants them
(`git show 40c2bdba:compendio2023.pdf`).

**Where it WOULD earn its place:** a 2023↔2025 diff of the Título 8 articles the pack cites is a
cheap, real supersession signal (CLOSURE-REGISTER row 14) — an article whose text is byte-identical
across two consolidations 27 months apart was very probably not amended between them. **That diff
has not been run.** Until it is, the 2023 edition is a lead, not evidence.

---

## §R4 · Not attempted in this pass

- **No BOCM publication was retrieved** for PG97 or for any *modificación puntual* — including
  **MPG 00/343** (BOCM 27.11.2023, footnoted on Arts. 8.5.6 / 8.8.9) and **MPG 00/335**
  (BOCM 19.05.2016, the amendment to Cap. 8.3). Both are named in the Compendio's own footnotes and
  neither has been opened. ⇒ every Madrid citation remains a citation to a consolidation.
- **No check for a Compendio edition later than 24-09-2025** (`VERIFICATION.md` §1a P7 — still open).
- **No licence text** was obtained for the `sigma.madrid.es` services.

---
*Authority: L-449 · L-674 · L-677 · C63 §3 Axis 3 (DATA-SOURCES) · §CONTEXT-DATA-HONESTY.*
