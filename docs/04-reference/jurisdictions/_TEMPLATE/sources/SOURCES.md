<!-- P0 SCAFFOLD TEMPLATE — copy with the folder, replace every <PLACEHOLDER>, delete this comment.
     THE TRUST GATE (playbook §3.3, C58 §1.6, L-449). One row per value the pack sets.
     A field with NO citable source stays `null` in the pack and is listed under §B Unverified.
     Never interpolate, average, or infer a legal number. A pack may not ship confidence:'structured'
     unless EVERY field it sets has a row in §A here. -->
# <PLACE> (<CODE>) — per-field sources

**Status:** <OPEN — no values verified yet | PARTIAL | COMPLETE>. The pack MUST NOT ship a value whose
row below lacks a real citation.

## A — VERIFIED (one row per value the pack sets)
| Field (pack key) | Value | Unit | Governing article | Document (title + date) | URL / handle | Confidence |
|---|---|---|---|---|---|---|
| `<pack.field>` | `<value>` | `<unit>` | `<Art. NNN>` | `<doc, date>` | `<url>` | `<certified/published/corroborated>` |

> **Confidence tiers:** `certified` (official viewer / parcel certificate) · `published` (official
> consolidated text, not the municipality's own copy) · `corroborated` (≥2 independent copies,
> structurally consistent) · `inferred` (⚠ NOT shippable as a legal claim) · `NOT FOUND` (must refuse).

## B — UNVERIFIED / open (stays `null` in the pack)
| Field | Why not verified | What would verify it (the exact source to read) |
|---|---|---|
| `<pack.field>` | `<blocked by … / secondary only / NOT FOUND>` | `<primary doc + where>` |

⚠ A number that appears only in a blog, slide, paper, or a **neighbouring municipality's**
republication is SECONDARY and does not qualify — record it as a research note, never promote it here.
