# Berlin (11000) — completion plan (costed roadmap + "done-when")

> **Captured:** 2026-07-31 · **Source:** founder research · **Status:** planning reference (no code created)

The honest one-line frame: **Berlin is not blocked by missing data — it is blocked by converting document-rich law into cited, machine-readable rules.**

---

## 1 — Effort table

| Work item | Effort | % done | Notes |
|---|---|---|---|
| B-Plan GIS adapter | ~1 day | 80% | dual endpoint candidates captured; resolve via live GetCapabilities |
| ALKIS wiring | 2–3 days | 60% | parcel spine; exact id field via DescribeFeatureType |
| **B-Plan PDF extractor** | **2–4 WEEKS** | **0–20%** | **⚠ THE CRITICAL PATH / the real blocker** |
| Legal-regime classifier | 1–2 weeks | 50% | §30 / §34 / §35 / Baunutzungsplan routing |
| BauO Bln §6 setbacks | 1 day | 0% | multiplier **PROBE-REQUIRED — do NOT copy NRW's 0.4H** |
| First-district rulepacks | 2–3 weeks | 0% | one district (Mitte or Neukölln) first |
| L-449 workflow | ongoing | — | human legal verification gate |

---

## 2 — Critical path

**PDF extraction → one Berlin district (recommend Mitte or Neukölln) → verified parcel answers → expand districts.**

The document corpus is the bottleneck. Attacking it one district at a time proves the pipeline end-to-end and produces the first verified row before any city-wide scale-out.

---

## 3 — "Berlin DONE when"

One arbitrary Berlin parcel returns a fully-cited answer:

```json
{
  "legalRegime": "§30",
  "plan": { "id": "…", "officialPDF": "…" },
  "rules": {
    "zone": "WA",
    "GRZ": { "value": "…", "citation": "Festsetzung …" },
    "GFZ": { "value": "…", "citation": "…" },
    "floors": "…",
    "height": "…"
  },
  "confidence": "verified-primary"
}
```

(All values above are placeholders — the real numbers come only from the L-449-verified plan text.)

---

## 4 — Honest rate framing

- **Today: ~28%.**
- **Target after completion: ~55–70%** — **DEPENDENT on the vectorised-B-Plan fraction.** The corpus digitisation-split measurement (see `EXTRACTION-PIPELINE.md §4.2`) decides where in that band Berlin lands.
- The rate target is **"known denominator + verified coverage," NOT "100% extraction."** The ~30% §34 floor + §35 + Denkmalschutz + voidable Baunutzungsplan stay refusals by law.

---

**Related:** `EXTRACTION-PIPELINE.md` · `BERLIN-RULEPACK.design.ts` · `gis/bplan-source.json` · `plans/8-30-neukoelln/metadata.json` · `NEXT.md`
