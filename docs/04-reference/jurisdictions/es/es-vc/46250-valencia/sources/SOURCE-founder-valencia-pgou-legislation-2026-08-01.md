# SOURCE — founder-supplied Valencia PGOU legislation research (2026-08-01)

> **status: `founder-supplied`.** Captured VERBATIM, same turn, BEFORE any extraction work, per the
> standing rule *"all founder-provided research goes to REPO docs; memory holds only a pointer"*.
>
> ⚠ **Capture is not verification.** Every claim below was recorded as the founder stated it and was
> THEN checked against the primary text. The per-claim verdicts live in
> [`PRIMARY-SOURCE-VERIFICATION-2026-08-01.md`](./PRIMARY-SOURCE-VERIFICATION-2026-08-01.md) — read
> that file before trusting any line here. **Two of the founder's citations did not survive the
> check** and are flagged inline so nobody re-imports them from this file.

Context given with the research: *"I WILL BE PROVIDING CITY BY CITY IN SPAIN TO TRY TO CLOSE THEM
LATER."* València (INE **46250**, Comunitat Valenciana, `es-vc`) is the first of that series.

---

## 1 — The claims, as supplied

| # | Founder claim | Verdict (see verification file) |
|---|---|---|
| F1 | **Instrument:** PGOU València 1988; operative text = *Normas Urbanísticas, Documento Definitivo, Mayo 1991* | ✅ **VERIFIED** — the text's own colophon reads *"Valencia, mayo de 1991."* |
| F2 | **Zone codes** `ENS` (Ensanche), `EDA`, `UFA` exist | ✅ **VERIFIED** — all three, verbatim |
| F3 | …**introduced at Art. 4.1.2.a** | ❌ **WRONG ARTICLE** — the zone dictionary is **Art. 6.3.1**. Art. 4.1 is *Suelo No Urbanizable* |
| F4 | **Routing:** Art. 4.3 maps zone code → regulating chapter | ❌ **WRONG ARTICLE** — Art. 4.3 is *"Régimen urbanístico"* of **non-developable** land. Routing is structural (Título Sexto chapter per zone), not an article |
| F5 | **Título Sexto, Capítulo 3 = Zona de Ensanche** | ✅ **VERIFIED** verbatim — *"CAPITULO TERCERO: Zona de Ensanche"* |
| F6 | **Height (Art. 6.19.1):** `Hc = 4,80 + 2,90 · Np` | ✅ **VERIFIED VERBATIM**, article number exact |
| F7 | …where **Np = number of storeys** | ⚠ **MATERIALLY IMPRECISE.** The article defines Np as *"el número de plantas a edificar **sobre la baja** (es decir el señalado en los planos **menos uno**)"*. Np = graphed floors **− 1**. Using the graphed count as Np overstates Hc by 2,90 m |
| F8 | **Np comes from the Plano C GRAPHIC, not the text** | ✅ **VERIFIED VERBATIM** — *"en función del número de plantas grafiado en el Plano C"* |
| F9 | If PRYZM cannot read Plano C, ENS height is CONSTRUCTED-INPUT-MISSING and must **REFUSE, not guess**; do not pack a representative Np | ✅ **ADOPTED** — this is what the pack does |
| F10 | **Buildable depth (Art. 6.18):** from Plano C, **fallback 20 m** | ✅ **VERIFIED VERBATIM**, article number exact |
| F11 | *"Verify whether the fallback is unconditional — if it is, depth is STATED even when Plano C is unavailable, and that is a real asymmetry worth exploiting"* | ❌ **THE FALLBACK IS CONDITIONAL.** It applies only *"Caso de no indicarse ésta"* — where Plano C graphs no depth. PRYZM cannot observe whether Plano C graphs one, so it cannot know the fallback applies. **The asymmetry does not exist.** See verification §4 |
| F12 | **Art. 5.19:** superficie ocupable | ✅ **VERIFIED** the article exists and is so titled — but it is a **general definition** in Título Quinto, and it states **no number** for ENS |
| F13 | **Parcels:** `opendata.vlci.valencia.es` — WFS + GeoJSON + CSV, CC BY 4.0, update period P0Y3M, fields `Refman`, `Refpla`, `ficha_es`, `ficha_va`; also `geoportal.valencia.es` | ⚠ **PARTLY** — `geoportal.valencia.es` ArcGIS REST verified live. Field names on the municipal parcel layer are `refpar` / `refpla` / `refcat` / `fichacastellano` / `fichavalenciano`, not `Refman` / `ficha_es` / `ficha_va`. Licence and P0Y3M cadence **not re-verified this turn** |

---

## 2 — The research as supplied, verbatim

> - **Instrument:** PGOU Valencia 1988; operative text = *Normas Urbanisticas, Documento
>   Definitivo, Mayo 1991*.
> - **Zone codes:** `ENS` (Ensanche), `EDA`, `UFA` — introduced at **Art. 4.1.2.a**.
> - **Routing:** Art. 4.3 maps the zone code to its regulating chapter; **Titulo Sexto,
>   Capitulo 3** is the Zona de Ensanche.
> - **Height formula (Art. 6.19.1):** `Hc = 4.80 + 2.90 * Np` metres, where Np = number of
>   storeys. NOTE: this is a CONSTRUCTED height — it needs Np.
> - **Np source:** the **maxFloors comes from the Plano C GRAPHIC, not from the text.** This is
>   a graphed input. If PRYZM cannot read Plano C, ENS height is CONSTRUCTED-INPUT-MISSING and
>   must REFUSE, not guess. Do not pack a representative Np.
> - **Buildable depth (Art. 6.18):** from Plano C, with a stated **fallback of 20 m** where the
>   plan does not graph one. Verify whether the fallback is unconditional — if it is, depth is
>   STATED even when Plano C is unavailable, and that is a real asymmetry worth exploiting.
> - **Art. 5.19:** superficie ocupable.
> - **Parcels:** `opendata.vlci.valencia.es` — WFS + GeoJSON + CSV, CC BY 4.0, update period
>   P0Y3M, fields `Refman`, `Refpla`, `ficha_es`, `ficha_va`. Also `geoportal.valencia.es`.

---

## 3 — What this research got RIGHT that mattered most

Recorded explicitly, because the two wrong article numbers should not obscure it:

1. **F8 + F9 are the whole ballgame, and they are correct.** The founder identified *before any
   extraction* that ENS height depends on a **graphic** input, and pre-committed to refusing rather
   than packing a representative Np. The primary text confirms this exactly. That instruction is
   what stops this pack becoming an L-616 mechanism-A failure — `Hc = 4,80 + 2,90·Np` with a guessed
   Np is not a conservative estimate, it is a fabricated determination.
2. **F6 and F10 are verbatim-exact**, including the article numbers and the 20 m figure.
3. **F5** correctly located the governing chapter.

## 4 — Prior València work this supersedes nothing of

This capture ADDS to, and contradicts none of, the existing dossier:

- [`../findings/VALENCIA-DATA-RECON.md`](../findings/VALENCIA-DATA-RECON.md) — the P4.5 GIS recon
  (2026-07-31). Its verdict *"P5 LEGISLATION for València is an ORDINANCE-EXTRACTION project"* is
  **confirmed and strengthened** by this turn: the ordinance is now in hand.
  ⚠ **One recon statement is corrected** — §3.2 says the alignment layer *"carries no numeric setback
  or depth attribute"*. Layer **212 carries an `altura` field**. See verification §6.
- [`../findings/SOURCE-founder-valencia-recon-first-2026-07-31.md`](../findings/SOURCE-founder-valencia-recon-first-2026-07-31.md)
- [`../findings/SOURCE-founder-valencia-phase-plan-2026-07-31.md`](../findings/SOURCE-founder-valencia-phase-plan-2026-07-31.md)

*Captured 2026-08-01. Authority: standing rule §CAPTURE-FOUNDER-RESEARCH-TO-REPO · L-449 · L-616 ·
C58 §1.2. Verification: [`PRIMARY-SOURCE-VERIFICATION-2026-08-01.md`](./PRIMARY-SOURCE-VERIFICATION-2026-08-01.md).*