# City Envelope Playbook — `<CITY>` (`<INE/city-id>`)

<!-- ═══════════════════════════════════════════════════════════════════════════════════════════════
COPY THIS FILE to `docs/04-reference/jurisdictions/<iso2>/<city-id>-<city>/PLAYBOOK.md` when starting
(or resuming) a city. It is the REUSABLE, CITY-AGNOSTIC execution sequence distilled from Córdoba's
2026-08-04 session (docs/04-reference/jurisdictions/es/es-an/14021-cordoba/findings/
SESSION-SUMMARY-2026-08-04.md) — the first city where "acquire real documents → verify → build →
prove end-to-end" was run start-to-finish in one sitting, going from a stale "0% shippable, gate
shut" state to a live, tested, dual-sourced pack with a verified proof-of-concept outside the
existing pilot.

This sits BELOW `COUNTRY-DATA-STRATEGY.md` (which decides WHETHER/WHERE to point effort at a
country) and is the STEP-BY-STEP for a city once you're pointed at it. Fill every `<…>`.
═══════════════════════════════════════════════════════════════════════════════════════════════ -->

**City:** `<CITY>` · **Country:** `<COUNTRY>` · **Local ID:** `<INE / municipal code>` ·
**Instrument:** `<PGOU / plan name>` · **Status:** `<not started / documents in progress / packed / live>` ·
**Last updated:** `<YYYY-MM-DD>` · **Owner:** `<UNASSIGNED>`

---

## §0 — THE ONE LESSON THAT MATTERS MOST, READ THIS FIRST

**A "this source doesn't exist" finding is, more often than the prior dossier will admit, actually
"this source exists at a different URL/domain than the one that was tested."** In Córdoba, THREE
separate "unobtainable" verdicts — the citywide zoning-map sheets, the alignment/frontage plan
series, and a block-geometry WFS layer — were each wrong about the path or hostname, not about
whether the data existed. All three were confirmed live within minutes once the *correct* URL was
tried.

**Before accepting any "data does not exist" claim in this city's dossier — yours or a prior
session's — re-test the EXACT URL yourself.** A dead link at one path does not mean the publisher's
whole document tree is dead. Check the publisher's own current website navigation (not just a
cached probe result) for where the document actually lives today.

---

## §1 — Document acquisition checklist

Work through the publisher's own planning-document website (usually the municipal urbanismo/
planning department, NOT a national portal — calificación is per-jurisdiction) and get REAL FILES
onto disk, not just confirmation a page exists:

| Document type | Got it? | Path in `corpus/` | Notes |
|---|---|---|---|
| Zoning/calificación map sheets (citywide, per-zone codes) | `<Y/N, N/total>` | | Usually a multi-sheet raster/PDF series at a fixed scale |
| Alignment/frontage plans (street width, building lines) | `<Y/N, N/total>` | | Check BOTH a WFS/WMS service AND the static document tree — Córdoba's only existed as the latter |
| Execution/management-unit plans (delegated-sector boundaries) | `<Y/N, N/total>` | | Precision aid for legally-delegated land, not a numeric source |
| Historic-centre / protected-zone plans (if applicable) | `<Y/N, N/total>` | | Often a SEPARATE instrument from the main plan, not an extension of it |
| Main ordinance text — general/procedural regime | `<Y/N>` | | |
| Main ordinance text — per-zone numeric parameters (height/setback/ocupación/FAR) | `<Y/N>` | | THIS is usually the actual blocker, not geometry |
| Fichas de planeamiento / delegated-plan index | `<Y/N>` | | Tells you WHICH specific parcels are delegated to their own instrument |

**⚠ Verify every "bonus" document you find before crediting it.** A plausible-looking filename is
not evidence of content — one file this session claimed to be a needed volume and turned out to be
a *different city's* plan, misfiled into the corpus. Open it (or extract its text) and confirm.

**Persistence discipline.** Documents delivered in a chat/conversation do NOT survive context
compaction. Get them onto disk, in this folder's `corpus/`, before treating acquisition as done —
Córdoba lost an entire earlier delivery this way and had to redo it.

---

## §2 — Rule-pack build order

1. **Register every zone family with a REAL, cited number where the ordinance states one.** Never
   invent a coefficient the ordinance itself calls "derived from composition rules" or similar —
   leave it `null` with a citation-heavy comment explaining why, matching this codebase's house
   style (long, precise, article-numbered).
2. **Check whether the live zoning-geometry source can even bind a parcel to the packed subzone.**
   Córdoba had two full zone families (UAS, Industrial) with every number known and STILL correctly
   unpacked, because the live attribute layer only records the zone *family*, never the subzone
   suffix — no document fixes a missing database column. Check this BEFORE spending effort
   transcribing a family's numbers.
3. **Distinguish "missing data" from "missing engine capability."** A zone needing "unconstrained
   depth capped by ocupación only, no siting rule" is not expressible by every `GeometricRule` kind
   — this may need new, GENERAL (not city-specific) schema/engine work, not a document.
4. **Gate behind a human sign-off**, same shape as `CORDOBA_ENVELOPE_VERIFIED` — machine-extracted
   numbers render at a lower confidence tier and stay gated until a human has verified the source.

---

## §3 — Digitization/georeferencing (if the zoning source is raster/scanned, not published vector)

1. **Try OCR on coordinate tick-marks first — but verify it actually works before relying on it.**
   Córdoba's tick-mark font defeated Tesseract even after tuning; direct visual reading (an agent
   or human reading the image at high zoom, the same way a person would) worked instead, and was
   cross-corroborated by checking that the implied metres-per-pixel scale agreed independently on
   both axes.
2. **For vector/CAD source PDFs**, check for a real vector-graphics library (e.g. PyMuPDF/`fitz`)
   before assuming OCR/rasterization is needed — a pure-text extractor (`pdftotext`) will read as
   empty on a line-drawing-only PDF and looks like "no data" when the geometry is actually there.
3. **If cross-referencing extracted shapes against an independent dataset (e.g. national cadastre
   building footprints) to establish a coordinate transform**, use a real statistical acceptance
   bar — vote → refine → HOLD OUT some data → test against DECOY offsets to make sure the fit isn't
   spurious. An honest "REFUSED, best signal-to-decoy was only 2.0 against a 3.0 bar" is a correct,
   valuable result — do not lower the bar to force a "success."
4. **Prove the FULL chain on one small example before committing to full-city scale**: one sheet,
   one small traced area, matched to an already-working zone family, run through the ACTUAL
   production engine code (not hand math) to a real computed number. This is the test that answers
   "is this city's coverage actually buildable," not georeferencing accuracy in isolation.

---

## §4 — What "closed" means (do not conflate scopes)

A city is closed when **every parcel reaches a terminal, evidence-backed state** — a constructed
envelope, a cited legal delegation, or an explicit refusal with a documented reason. It does **not**
mean every parcel returns a number. Land with no published calificación, land delegated to its own
Plan Parcial, land in a subzone the live data can't bind a parcel to — these are correctly CLOSED
the moment they carry a cited "no," not open problems to keep chasing.

Track two separate scopes explicitly and never let a City-wide claim ride on Pilot-only evidence:

- **Pilot/partial coverage** — what's live and tested right now.
- **City-wide ceiling** — what the arithmetic maximum is once every currently-open blocker closes,
  and what fraction of the city's buildable land that actually represents. State the denominator.

---

## §5 — This city's actual log

<!-- Fill in as you go. Link to the real dated findings docs, don't duplicate their content here. -->

- `<YYYY-MM-DD>` — `<what happened>` — `<link to findings doc>`
