# L-587 — sourcing findings for claus 22a, 20a/\*, 12 (browser-AI pass, 2026-07-22)

Produced by running `CLAU-RULEPACK-SOURCING-PROMPT.md` in a browsing-capable chat, founder-driven.
The run was disciplined — it refused far more than it asserted, which is what the prompt was built
for. **Almost nothing here is encodable yet, and that is the finding.**

---

## §1 — ⚠⚠ THE HEADLINE: CLAU 12 **DOES** APPLY TO BARCELONA

The research pass reported this as its single highest-confidence result — *"the one thing in the
whole exercise I'd stake a professional opinion on without hesitation"*:

> PGM Art. 315.2: *"A la zona de nucli antic es distingeix una subzona I, en substitució de
> l'edificació antiga (12), **d'aplicació a tots els nuclis antics diferents del de Barcelona**, i una
> subzona II, de conservació del centre històric (12b), referida preferentment a aquell."*
>
> ⇒ concluded: *"clau 12 does not apply to Barcelona's historic center… your five questions cannot be
> answered for clau 12 in Barcelona."*

**The QUOTE is right — corroborated across three independent municipal transcriptions — and the
INFERENCE FROM IT IS WRONG.**

### The measurement that settles it

Our own live MUC probe (`scratchpad/bcn-clau-distribution.json`), filtered to **INE 08019 Barcelona
only**:

| clau | n | centroid | lat range |
|---|---|---|---|
| **12b** *Nucli Antic de Conservació* | 5 | **41.3796, 2.1686** | 41.379 – 41.382 |
| **12** *Nucli Antic de Substitució* | **26** | 41.4008, 2.1639 | 41.371 – **41.436** |

**12b is a tight cluster on Ciutat Vella (41.380, 2.176) — Barcelona's historic centre. Clau 12 is
spread across the whole municipality**, centred well north of it and reaching lat 41.436.

### Why both facts are true at once

**"El nucli antic *de Barcelona*" in Art. 315.2 means CIUTAT VELLA, not the municipality.** Barcelona
absorbed a ring of formerly independent towns — **Gràcia (41.403), Sarrià (41.399), Sants (41.375),
Sant Andreu (41.435), Horta** — and each has its own *nucli antic*. Those are, precisely and
literally, *"nuclis antics diferents del de Barcelona"*. So **clau 12 governs the annexed villages'
old cores, inside Barcelona municipality**, while 12b governs Ciutat Vella.

The 26-vs-5 split and the latitude spread are exactly what that reading predicts.

### ⇒ Consequences

1. **Clau 12 stays on the roadmap** — it is ~9.5% of sampled private buildable land, **5× more
   prevalent in Barcelona than 12b.** Removing it, as the research pass advised, would have deleted a
   real and sizeable chunk of the city.
2. **It needs re-sourcing with the correct question**: *"what are the parameters of clau 12 as it
   applies to the annexed nuclis antics of Barcelona (Gràcia, Sarrià, Sants, Sant Andreu, Horta)?"*
3. ⚠ **THE TRANSFERABLE LESSON.** A correct verbatim quote plus a plausible reading produced a
   confident, wrong conclusion — and it carried the run's **highest** stated confidence. The prompt's
   verbatim rule worked exactly as designed: **because the quote was preserved, the error was
   recoverable.** Had the pass reported only its conclusion, we would have deleted clau 12 and never
   known. **Keep demanding the quote, and keep checking the inference separately from the citation.**

---

## §2 — clau 22a *Zona industrial* — STRUCTURE known, NUMBERS not Barcelona-verified

The base-PGM **Art. 350** structure is established (from a Castelldefels/08056 transcription):

| | rule | article |
|---|---|---|
| edificabilitat | ≤ **2 m² sostre / m² sòl** | Art. 350.a |
| occupation | **90%** | Art. 350.a |
| above ground floor | must sit in a concentric band = 70% of the block | Art. 350.b |
| height | **varies with street width** — *"de conformitat amb el quadre següent"* | Art. 350.c |
| interior-of-block height | fixed **5 m** from the *rasant* | Art. 350.e |

⚠ **NOT ENCODABLE. Three blockers:**
1. **The Art. 350.c width→height TABLE was never retrieved** — only the sentence saying it exists.
   That table *is* the height rule.
2. **None of it is verified for 08019.** Every figure comes from another municipality's
   transcription, and municipalities modify these locally.
3. **The occupation figure is in open conflict** — 90% (Castelldefels, tied to Art. 350) vs 100%
   (Badia del Vallès **Art. 23, a LOCAL modification**, not base PGM). Correctly reported as a
   conflict rather than reconciled. Neither is confirmed as Barcelona's.

**One genuinely Barcelona-specific artefact was found**: the Zona Franca *Pla Parcial* S164
(`zfbarcelona.es` PDF — itself a captured printout of Barcelona's own PIU), giving heights 18,30 m /
24,40 m, occupation 70%, 3 m setbacks, and citing **PGM Art. 350.1** directly. ⚠ **Scoped to that one
Pla Parcial** and must not be generalised — but it is useful evidence that **Barcelona uses the same
Art. 350 numbering unmodified**, at least for that cross-reference.

## §3 — clau 20a *edificació aïllada* — NOTHING Barcelona-verified

Structure confirmed: **Art. 337** (definition), **Art. 338** (nine subzones: I–V plurifamiliar, VI–IX
unifamiliar), **Art. 340** (edificabilitat index — text never retrieved).

**Height, FAR, occupation and setbacks are all `NOT FOUND` for Barcelona, for every subzone.** Every
candidate number found belongs to Castelldefels, whose own document states it raised at least the
height locally. Correctly not reproduced.

⚠ 20a was flagged in planning as *"possibly the fastest win — isolated buildings use a plain
setback+height+FAR triple"*. **That reasoning was about the rule SHAPE and still holds; it says
nothing about availability, and availability is the blocker.**

## §4 — What is confirmed blocked, and what would unblock it

| Blocker | Detail |
|---|---|
| `ajuntament.barcelona.cat/informaciourbanistica/cerca/` | **robots-disallowed, confirmed directly.** Barcelona's own PIU — the single correct source — is parcel/plan-search driven |
| `geoportalplanejament.amb.cat/.../NNNNN_clau.htm` | **404s on direct fetch** even when the page appears in search results — indexed but blocks automated retrieval |
| Art. 350.c width→height table | never retrieved |
| Art. 340 (20a edificabilitat) | never retrieved |

⇒ **The unblock is a HUMAN running parcel queries in Barcelona's PIU** and capturing the
qualification sheet — exactly what the Zona Franca PDF is a printout of. That is the shape of the
next ask.

**INE identities pinned** (this closes a real gap — it separates "base PGM quoted by another
municipality" from "another municipality's own local modification", two failure modes that look
identical until the code is checked): 08056 Castelldefels · 08194 Sant Cugat del Vallès ·
08904 Badia del Vallès · 08200 (third PGM-area municipality). **None is 08019.**

---

## §5 — Status

| clau | share | encodable today? |
|---|---|---|
| 13b | 8.7% | ✅ sourced — encoding in progress |
| **12** | **9.5%** | ❌ needs re-sourcing **with the corrected question** (§1) |
| 22a | 17.5% | ❌ blocked on the Art. 350.c table + 08019 verification |
| 20a/\* | ~10% | ❌ nothing Barcelona-verified |

**Net: this pass encoded nothing — and it was still worth running.** It pinned the base-PGM article
structure for two claus, identified the exact two documents that would unblock them, proved which
portals block automation, separated base-PGM text from foreign local modifications by INE code, and
surfaced the clau-12 error before it removed a tenth of the city from the roadmap.
