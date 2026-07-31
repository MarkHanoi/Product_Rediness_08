# Clau `17` — Zona de renovació urbana en transformació de l'ús

> **STATUS: REFUSAL VERIFIED — the OUTCOME is correct, ⚠⚠ but the REFUSAL REASON IS WRONG.**
> Clau 17 does **not** delegate to a derived instrument. **PGM Art. 368.1.a states the regime
> itself**: land held for public acquisition, on which the owner may improve but *"no
> augmentar-ne el volum"*. Today the code returns `derived-plan`. That asserts something the
> article does not say. See §3.
> Family: **zona** · Municipality: Barcelona (`08019`) · Instrument: **PGM-1976**, Normes
> Urbanístiques, Títol IV, Capítol IV, **Secció 11a** (Arts. 367–368). Official designation per
> **Art. 314.9**.
>
> ⚠ Nothing here is self-certified. Founder signature: **NOT GIVEN**.

Primary source: `../../PGM-NNUU-metropolitana.pdf`, **PDF pp. 119–120** (printed 118–119), read
with glyph coordinates. **Secció 11a is two articles long** — 367 (*Definició*) and 368 (*Règim
urbanístic*). That brevity is itself the finding.

---

## 1 — THE GOVERNING SENTENCES — ⚠ NOT a delegation

> **PGM Art. 367.1** — «La zona de renovació urbana en transformació de l'ús (17) comprèn els
> **terrenys amb edificacions o usos inadequats, però aptes per a absorbir els dèficits de vials,
> zones verdes i equipaments**.»
>
> **PGM Art. 367.2** — «Aquesta qualificació urbanística **permet mantenir en servei els usos
> existents sense deixar-los fora d'ordenació**, mentre no es porti a terme la transformació
> prevista, segons el que disposen els articles 171 i 172.»
>
> **PGM Art. 368.1** — «**Fins que no es programi l'actuació encaminada a l'adquisició del terreny
> per tal de destinar-lo a equipaments o espais verds**, el propietari o titular del dret
> d'ocupació de la finca en el moment de l'aprovació definitiva d'aquest Pla General podrà:
> **a.** efectuar obres de consolidació, reparació, modernització o millora de les condicions
> estètiques o higièniques de les edificacions, **però no augmentar-ne el volum**.
> **b.** desenvolupar l'activitat pròpia de les instal·lacions existents i destinar el local, en el
> supòsit de trasllat de la indústria, a magatzem de productes per a la venda o distribució.»
>
> **PGM Art. 368.3** — «Les petites reparacions que exigeixi la higiene, l'ornament i la
> conservació podran realitzar-se a tot l'immoble.»

⇒ **The PGM answers for this land itself.** There is no *pla especial*, no *PERI*, no *estudi de
detall* anywhere in Secció 11a. The rule is a **statutory no-new-volume holding regime** on land
earmarked for public acquisition as *equipaments* or *espais verds*. Read positively, the buildable
increment is **zero by ordinance** — an explicit statement, not an absent one.

---

## 2 — What the code returns today (pinned)

`barcelonaZoneRefusal('17')` and `barcelonaZoneRefusal('17/6')` ⇒ `code: 'derived-plan'`,
`legallyGrounded: true`. Pinned by
`packages/site-parcel-data/__tests__/esBarcelonaRefusalClausGrounding.test.ts` — **pinning today's
behaviour, not endorsing it.**

---

## 3 — ⚠⚠ THE REFUSAL REASON IS SWAPPED, AND IT SURVIVES REVIEW BECAUSE THE OUTCOME MATCHES

`derived-plan`'s own copy asserts: *"Every one of these **delegates the buildable determination to
a derived instrument** (PERI, pla especial, estudi de detall) approved for the specific ámbito. …
the rule is not absent — it is elsewhere, and PRYZM does not hold it."*

For clau 17 that is **false in both halves**:

| the card says | Art. 368 says |
|---|---|
| a derived instrument governs your land | **no instrument is named.** The PGM states the regime directly |
| the rule is elsewhere and we do not hold it | **the rule is here, and we hold it**: no volume increase until the land is programmed for acquisition |

⚠ **NOTHING RENDERS DIFFERENTLY TODAY** — both readings end in "no envelope" — which is precisely
why the error is durable. What changes is the sentence the owner reads. `derived-plan` sends them
looking for a plan that may not exist. The true answer is *"your land is held for public
acquisition as equipament or green space; until that is programmed you may maintain and improve
the building but not add volume."* Those are different pieces of advice about someone's property.

**RECOMMENDED CORRECTION (reported, NOT applied — changing a refusal reason is a legal act):**
give clau `17` / `17/*` its own row in `CLASSIFICATIONS`, citing **PGM Arts. 314.9 · 367 · 368.1.a**,
in the *held-for-acquisition* family rather than the *derived-plan* family. `legallyGrounded` stays
`true`; the code should be one that says "the ordinance permits no volume increase here", which is
closer to `public-system`'s legal shape than to `14a`'s genuine PERI delegation. **No new refusal
code should be minted without a founder ruling** (the ADR-0276 precedent).

---

## 4 — PART A · normative parameters

| field | value | quote | article | outcome |
|---|---|---|---|---|
| `officialDesignation` | *Zona de renovació urbana: transformació de l'ús (17)* | «Zona de renovació urbana: transformació de l'ús (17).» | Art. 314.9 | STATED |
| `farRatio` | **null** | — | — | **NOT-THE-RULE-KIND** — no index is stated because the zone grants no new floor area |
| **volume increment** | **ZERO, stated** | «…**però no augmentar-ne el volum**.» | Art. 368.1.a | **STATED** — ⚠ this is a real `0`, and one of the very few places `0` is correct rather than `null` |
| `maxHeight_m` / `maxFloors` | **null** | — | — | NOT-THE-RULE-KIND |
| `maxCoverage` | **null** | — | — | NOT-THE-RULE-KIND |
| setbacks | **null** | — | — | NOT-THE-RULE-KIND |
| `permittedUse` | existing uses may continue, **not** *fora d'ordenació*; on industrial relocation the premises may become a sales/distribution warehouse | Arts. 367.2, 368.1.b | STATED |

**Rule KIND:** none — the zone is a **holding / acquisition regime**, not an envelope rule. ·
**Granularity:** parcel (the regime attaches to the *finca* and to its owner as at the PGM's
definitive approval). · **GIS code:** `17`, and the MUC also returns **`17/6`**.

⚠ **THE `/6` SUFFIX IS NOT SOURCED.** `17/6` is measured in the live MUC (1 014 resolutions,
`../../BARCELONA-COMPLETE-COVERAGE-PLAN.md` §2) but **the PGM states only clau `17`** (Art. 314.9)
and no suffix vocabulary was located in the committed PDF. The obvious reading — that `/6` names
the destination system (clau `6`, *parcs i jardins*), i.e. *transformació de l'ús cap a zona
verda* — is **plausible and unverified, and is rejected in writing here rather than recorded as a
fact.** What IS established: `17/6` behaves identically to `17` in the classification table, and
Art. 368.1's regime is indifferent to which system the land is destined for.

---

## 5 — Open / unverified

- The `/6` suffix vocabulary (above).
- **Arts. 171–172**, cross-referenced by Art. 367.2 for the *fora d'ordenació* regime, were not read.
- Whether the acquisition has been *programmed* for a given parcel — the condition that ends the
  Art. 368.1 regime — is not published in any source PRYZM consumes.
- No Barcelona-specific modification of Arts. 367/368 was found; **checked**, PDF pp. 119–120 carry
  no *"Veure modificació per al Municipi de Barcelona"* footnote.

---
*Verified 2026-07-31 against `../../PGM-NNUU-metropolitana.pdf` pp. 119–120.
Founder signature: **NOT GIVEN**. Authority: C63 · C58 §1.13 · ADR-0270 · ADR-0276.
Method: `../EXTRACTION-PROTOCOL.md`.*
