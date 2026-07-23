# Italy — Regional Routing

**Italy requires per-region routing before any city pack can be built.** Unlike France (one national
code, purely local numbers) or Germany (one federal zone taxonomy, per-Land building code), Italy's
town-planning *instrument itself* is a regional competence under the Constitution (Title V, Art. 117
— "governo del territorio" is a concurrent regional matter). 19 regions and 2 autonomous provinces
have each enacted their own planning law, defining their own instrument type, not merely their own
numbers.

---

## Regional instrument map

| Region | ISO 3166-2 | Primary planning instrument | Building-code layer name | Cadastre |
|---|---|---|---|---|
| Valle d'Aosta | IT-23 | PRG (Piano Regolatore Generale Comunale Urbanistico e Paesaggistico) | RE | National Catasto |
| **Piedmont** | IT-21 | **PRG** | RE / REC | National Catasto |
| Liguria | IT-42 | PUC | RE | National Catasto |
| **Lombardy** | IT-25 | **PGT** (L.R. 12/2005) | **RET** (Regolamento Edilizio-Tipo) | National Catasto |
| Trentino-Alto Adige | — | Split: see AP Trento + AP Bolzano below | — | **AP systems (separate)** |
| Veneto | IT-34 | PAT + PI (L.R. 11/2004 — two-tier) | RE | National Catasto |
| Friuli Venezia Giulia | IT-36 | PSC | RE | National Catasto |
| Emilia-Romagna | IT-45 | PUG | RE | National Catasto |
| Tuscany | IT-52 | Piano Strutturale (regional variant of PSC) | RE | National Catasto |
| Umbria | IT-55 | PRG | RE | National Catasto |
| Marche | IT-57 | PRG | RE | National Catasto |
| **Lazio** | IT-62 | PUGC (variant PUG) | RE | National Catasto |
| Abruzzo | IT-65 | PRG | RE | National Catasto |
| Molise | IT-67 | PRG | RE | National Catasto |
| **Campania** | IT-72 | PUC + PSC (dual) | **RUEC** | National Catasto |
| Puglia | IT-75 | PUG | RE | National Catasto |
| Basilicata | IT-77 | PSC | RE | National Catasto |
| Calabria | IT-78 | PSC | RE | National Catasto |
| Sicily | IT-82 | PUG | RE | National Catasto |
| Sardinia | IT-88 | PUC | RE | National Catasto |
| **AP Trento** | IT-TN | PRG (by AP delegation) | — | **AP Trento cadastre (separate)** |
| **AP Bolzano** | IT-BZ | PCTP | — | **AP Bolzano cadastre (separate)** |

---

## What the instrument split means for engineering

| Instrument | Two-tier? | Zone taxonomy still DM 1444? | Engine kind likely needed |
|---|---|---|---|
| PRG (classic) | No | Usually yes — but always confirm NTA | Config (zone-letter table) if confirmed |
| PGT (Lombardy) | Yes: Documento di Piano + Piano dei Servizi + **Piano delle Regole** | No — Milan superseded it with territorial index | New kind (index + perequation) |
| PUC | No | Partially — Campania uses its own terminology | New kind (per region) |
| PSC | No (structural only; needs PI/RUE for operative rules) | Partially | New kind (per region) |
| PUG | No | Partially — Emilia-Romagna, Puglia, Sicily variants differ | New kind (per region) |
| PAT + PI | Yes: structural PAT + operational PI | Sometimes — Veneto has own taxonomy | New kind (two-layer join) |
| PCTP (Bolzano) | — | No | New kind + separate cadastral integration |

---

## Tier assignment (current)

- **Tier 1 (DM 1444 zone-letter mechanism, PRG-using regions):** Piedmont, Umbria, Marche,
  Abruzzo, Molise — each needs its own NTA primary-text confirmation before committing to Tier 1.
  **Turin (Piedmont) is the sole currently scoped Tier 1 candidate.**
- **Tier 2 (bespoke mechanism, new engine kind required):** Milan (Lombardy PGT), Rome (Lazio
  PRG 2008 with tessuto typology). Each is its own software problem.
- **Tier 3 (unscoped — treat as unknown until a dedicated research pass):** all other regions
  (Veneto PAT/PI, Emilia-Romagna PUG, Campania PUC, etc.) and both autonomous provinces.

---

## Autonomous Province warning

AP Trento and AP Bolzano **are excluded from the national Catasto WFS** (Agenzia delle Entrate)
entirely. They run their own cadastral systems by statutory delegation. Any pack targeting a city
in either province needs:
1. A separate cadastral integration (not a config change).
2. A separate planning-law research pass (PCTP for Bolzano is unlike any other Italian instrument).
Do NOT attempt to use national Italy integrations for these territories.
