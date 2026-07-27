# SPEC — Compliance Report ("explain-why" buildable-envelope artefact)

**Status:** DRAFT (2026-07-17) · **Owner:** PRYZM core (compliance-authoring track) · **Tracker:** `L-402` (compliance report + 3D envelope render)
**Governs:** the engineering design of the user-facing **compliance report** — the "explain-why" artefact that renders a [C58](../../02-decisions/contracts/C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md) `BuildableEnvelope` as a per-constraint, source-cited, confidence-labelled document, plus the **3D buildable-envelope massing render** (brand-purple max-height volume over the parcel) and the estimated-vs-authoritative disclosure UX. This is the specific packaging the Archistar category sells (gap audit G-ENG-4); PRYZM's differentiator is that the same surface then hands off to the authoring engine that builds the compliant building.
**Governance:** [C58 — Zoning Rules & Buildable Envelope](../../02-decisions/contracts/C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md) (the binding invariants — §1.2 two-fidelity, §1.3 explain-why, §1.4 credibility label) · [C57 — Parcel Data Layer](../../02-decisions/contracts/C57-PARCEL-DATA-LAYER.md) (parcel provenance rendered in the report) · [C19 — Site Model & Parcel](../../02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md) (the zoning fields the report reflects) · [C23 — Provenance & AI Audit](../../02-decisions/contracts/C23-PROVENANCE-AND-AI-AUDIT.md) (provenance model) · [C18 — Element Preview Visual](../../02-decisions/contracts/C18-ELEMENT-PREVIEW-VISUAL-CONTRACT.md) + C19 §5.5 (`#6600FF`) · [C04 — Rendering & Scheduling](../../02-decisions/contracts/C04-RENDERING-AND-SCHEDULING.md) (the 3D volume renders via the existing THREE owner — P2 safe) · [ADR-0269](../../02-decisions/adrs/ADR-0269-compliance-authoring-parcel-zoning-envelope-strategy.md) (the strategy).
**Relates to:** [SPEC-PARCEL-SELECTION](./SPEC-PARCEL-SELECTION.md) (proposed — the map interaction that produces the parcel + envelope the report renders; §8 info card / envelope panels) · [SPEC-FORMA-SITE-VIEW](./SPEC-FORMA-SITE-VIEW.md) (the 3D site view the envelope volume drapes into) · [SPEC-GEODATA-ANALYTICAL-LAYERS](./SPEC-GEODATA-ANALYTICAL-LAYERS.md) (a sibling credibility-labelled overlay on the same view).
**Scope discipline:** this SPEC is a **render + disclosure** surface. It **consumes** the C58 `BuildableEnvelope` + `DerivationTrace` read-only and displays them; it does **NOT** compute setbacks / height / FAR (that is the C58 engine), does **NOT** fetch data (C57), does **NOT** introduce a new coordinate frame or a new THREE owner (the 3D volume uses the existing renderer path), and does **NOT** persist a new authored model schema (the envelope is transient — C58 §1.7). No zoning VALUE is authored here.

> The report answers one question for the user: **"What can I build on this plot, and *why* — which rule, from which source, at what confidence?"** Then it hands off to *build it*.

---

## §1 — Why (and why a distinct artefact)

A buildable envelope is only trustworthy if every number is traceable. Archistar's commercial moat is not the number — it is the **packaged justification** ("this envelope because setback X, height Y, FAR Z, ordinance ref"). PRYZM has the envelope engine (C58) but, without a report artefact, no credibility surface for it (gap audit G-ENG-4). This SPEC defines that artefact — and, because PRYZM's edge is authoring, the report is not a dead-end PDF: its primary CTA is **"Generate a building in this envelope"** (C58 §1.8), which is the thing Archistar cannot do well.

Two hard constraints shape every design choice here:

1. **Honesty (C58 §1.4 / L-373).** A curated estimate (`estimated-ruleset`) must never look like a legal fact. The disclosure UX is a contract invariant with a CI gate, not a nicety.
2. **P2 safety.** The 3D volume is one translucent extrusion via the existing renderer — no new THREE import site, no new shader (C58 §7.3, scoping §12).

---

## §2 — Invariants (engineering restatement of C58)

1. The report is **derived**, read-only, from the C58 `BuildableEnvelope` + `DerivationTrace`; it computes no zoning number (C58 §1.3/§1.7).
2. Every constraint row shows its **`DerivationEntry`** — value · zoneCode · source · fieldProvenance · ordinanceRef (C58 §1.3).
3. The envelope's **`confidence`** chip is always visible; `estimated-ruleset` renders in the distinct "verify against ordinance" style, never authoritative (C58 §1.4) — **CI-gated** (`check-zoning-confidence-label`).
4. **Per-field** honesty: a single envelope can mix `published-structured`, `ordinance-pdf`, and `estimated` fields; each row carries its own flag (C58 §1.6).
5. The 3D volume renders in **`#6600FF`** translucent via the existing renderer path; no new THREE owner (C04 / C58 §5.2/§7.3).
6. **Parcel provenance** (C57 §1.4: source · license · ingest time) is shown and attributed (C57 §1.9).
7. The primary hand-off CTA dispatches the **existing** generation trigger with the envelope as bounds (C58 §1.8) — no parallel authoring path.
8. Every report-scoped exported fn opens an OTel span `pryzm.compliance.<verb>` (P8).

---

## §3 — Report data model (pure, L0 — `packages/schemas/src/elements/site/zoning/`)

The report is a **view model** assembled from C58 outputs — no new persisted schema (C58 §1.7). It is pure/serialisable so it can also be exported (PDF/JSON, §7).

```ts
// ComplianceReport — a derived view model over C58 BuildableEnvelope + DerivationTrace + C57 provenance.
interface ComplianceReport {
  parcel: {
    refcat: string;
    jurisdictionId: string;
    areaM2: number;
    address: string | null;              // PII (C22) — gated in shared/exported reports
    provenance: ParcelProvenance;        // C57 §2.2 — source · license · CRS · ingest time
  };
  zone: { code: string; label: string | null };
  envelope: BuildableEnvelope;           // C58 §2.4 (insetPolygon, maxHeight, maxFAR, maxVolumeM3, confidence, …)
  constraints: ComplianceConstraintRow[]; // one per DerivationEntry (§3.1)
  confidence: 'authoritative' | 'structured' | 'block-constructed' | 'estimated-ruleset' | 'pipeline-extracted-unverified' | 'not-determined';   // C58 §1.2 (6 members — reconciled to EnvelopeConfidenceSchema; `pipeline-extracted-unverified` added) — echoed for the header chip; per C58 §5.4 this MUST resolve to the WEAKEST field's provenance (`resolveHeadlineProvenance`, @pryzm/site-parcel-data)
  caveats: string[];                     // C58 §2.4
  generatedAt: ISODateString;
}

// §3.1 — one row per envelope constraint (the "explain-why" table)
interface ComplianceConstraintRow {
  constraint: 'setback.front'|'setback.side'|'setback.rear'|'maxHeight'|'maxFAR'|'maxCoverage'|'permittedUse';
  label: string;                         // 'Front setback'
  value: number | string | string[] | null;
  unit: string | null;                   // 'm' | 'm²/m²' | '%' | null
  status: 'pass' | 'fail' | 'estimated' | 'unknown';   // §3.2
  source: string;                        // rule-pack / provider id (C58 DerivationEntry.source)
  fieldProvenance: 'published-structured' | 'ordinance-pdf' | 'pipeline-extracted' | 'estimated';   // C58 §1.6 (4 members — reconciled to FieldProvenanceSchema; `pipeline-extracted` added: a machine-extracted, human-UNverified value, strictly below `ordinance-pdf`)
  ordinanceRef: string | null;           // citation link (C58 §1.3)
}
```

### §3.2 — `status` semantics

- **`pass`** — the constraint resolved from a `published-structured` field (authoritative/structured confidence) and, where a design exists, the current design honours it.
- **`fail`** — a design exists and violates this constraint (footprint outside the inset, height over cap — ties C19 §1.6 lint).
- **`estimated`** — resolved from a curated rule pack (`fieldProvenance !== 'published-structured'`); shown estimated, "verify against ordinance". Never `pass`-styled.
- **`unknown`** — no data for this field (`none` fidelity); shown as a gap, not a zero.

`status` is a **display** derivation of C58 confidence + the (optional) current design — the report computes no zoning number; it only compares an existing design against the C58 envelope for `pass`/`fail`.

---

## §4 — Report layout (the "explain-why" surface)

Three stacked sections. ASCII mock (grounds on the scoping §8.4 envelope card):

```
┌─ BUILDABLE ENVELOPE ─────────────────────────────  [ estimated · verify ▲ ]┐
│  Parcel 0123456 VK4802S · 512 m² · Zone 22a (MUC) · residential            │
│  ────────────────────────────────────────────────────────────────────────  │
│  CONSTRAINT        VALUE      SOURCE                     WHY                  │
│  Front setback     5 m        es-barcelona ⚑estimated    POUM art.X ↗        │
│  Side setback      3 m        es-barcelona ⚑estimated    POUM art.X ↗        │
│  Max height        18.0 m     es-barcelona ⚑estimated    POUM art.Y ↗        │
│  FAR               2.4        es-barcelona ⚑estimated    POUM art.Z ↗        │
│  Permitted use     residential  MUC ✓structured          MUC_QUALIFICACIONS  │
│  ────────────────────────────────────────────────────────────────────────  │
│  ⓘ Envelope estimated from a curated zone ruleset — verify against the POUM  │
│     ordinance before relying on these numbers.                              │
│                                     [ Generate a building in this envelope → ]│
└─────────────────────────────────────────────────────────────────────────────┘
```

- **Header** — parcel ref/area/zone + the **confidence chip** (§5). Chip is the whole-report headline honesty signal.
- **Constraint table** (§3.1) — one row per constraint, each with its own `fieldProvenance` badge + `ordinanceRef` link. This *is* the "explain-why".
- **Caveats + primary CTA** — the estimated-data disclosure banner (when any row is estimated) + the **"Generate a building in this envelope"** hand-off (§6).

---

## §5 — Confidence + estimated-vs-authoritative disclosure UX (the honesty surface)

The single most important UX rule (C58 §1.4, L-373):

| `confidence` / `fieldProvenance` | Chip | Row style | Disclosure |
|---|---|---|---|
| `authoritative` / `published-structured` (structured national register, e.g. DK Plandata) | solid green `✓ structured` | normal | none |
| `estimated-ruleset` / `ordinance-pdf` | amber `⚑ estimated` | **dashed** border + amber tint | "verify against ordinance" tooltip + `ordinanceRef` link |
| `estimated-ruleset` / `estimated` (inferred) | amber `⚑ estimated` | dashed + amber, **italic** value | stronger "inferred — not from a published rule" note |
| `none` / missing | grey `— no data` | greyed row, em-dash value | "no published envelope for this jurisdiction" |

- An `estimated` envelope MUST NOT use a solid, certificate-looking, or seal-like presentation anywhere (report, plan chip, 3D volume label, exported PDF).
- The mix is **per row**: a DK envelope may show `maxHeight ✓structured` and `setback ⚑estimated` in the same table.
- **CI enforcement:** `check-zoning-confidence-label` (C58 §6, mirror of the shipped `check-windcfd-beta-label.ts`) asserts the label is present on every rendered/exported envelope — hard-fail.

---

## §6 — Hand-off to authoring (the PRYZM differentiator)

The report's primary CTA — **"Generate a building in this envelope"** — dispatches the **existing** generation trigger (`generateResidentialFromBoundary` / apartment / house / typology-pipeline C50) with the C58 envelope as **generation bounds** (inset polygon = buildable footprint boundary; `maxHeight` / `maxFloors` = vertical cap), per C58 §1.8. This is one P6 command path; slider-as-intent (C53) is preserved — the envelope adjusts bounds, never adds a parallel knob.

- `permittedUse` (where structured) SHOULD pre-seed the typology brief (C50 `briefSchema`) so program is compliance-aware (C58 §10.2 — proposed).
- After generation, the report's constraint `status` (§3.2) can re-evaluate against the produced building (footprint ⊂ inset → `pass`; overflow → `fail`, ties C19 §1.6 lint). This closes the loop the gap audit calls "compliance-aware authoring".

---

## §7 — 3D buildable-envelope render + export

### §7.1 — 3D massing volume
A translucent extrusion of `insetPolygon` to `maxHeight_m` (`maxVolumeM3` = area × height), rendered in `#6600FF` over the parcel on the existing site view, via the **existing** renderer path (no new THREE owner — C04, P2 safe; C58 §7.3). The volume label carries the confidence chip (§5) — an `estimated` volume renders with the dashed/amber treatment, never a solid certificate look.

### §7.2 — Plan render
The setback-inset polygon in `#6600FF` with per-edge setback dimension chips (reuse the map dim-chip pattern), inside the parcel outline (scoping §8.4).

### §7.3 — Export (PDF / JSON)
The `ComplianceReport` view model (§3) is serialisable → an exportable compliance PDF (per the C29 vector-PDF backend, where available) + a JSON export. The estimated-vs-authoritative disclosure (§5) MUST survive export (an exported PDF of an estimated envelope carries the same "verify against ordinance" banner). Address PII (C22) is gated in shared/exported reports.

---

## §8 — Tests / gates

- `check-zoning-confidence-label` (C58 §6) — every rendered **and exported** envelope carries a confidence label; `estimated` never authoritative-styled. **Hard-fail.**
- Unit: `ComplianceReport` assembles one constraint row per C58 `DerivationEntry`, with `fieldProvenance` + `ordinanceRef` preserved (§3.1).
- Unit: an `estimated` row never resolves to `status: 'pass'` (§3.2).
- Unit: parcel provenance (C57) + attribution present in the report header (§2.6 / C57 §1.9).
- Integration: the "Generate in this envelope" CTA dispatches the existing generation trigger with the inset + maxHeight bounds (§6; C58 §1.8) — asserts no parallel authoring path.
- E2E: DK Copenhagen parcel → structured envelope → report shows `✓ structured` rows with no estimated banner; ES Barcelona parcel → `⚑ estimated` rows + the verify banner + `ordinanceRef` links.
- OTel: `pryzm.compliance.<verb>` span per exported report fn (§2.8, P8).

---

## §9 — Open questions

1. **PDF backend availability** — the compliance-PDF export depends on the C29 vector-PDF backend (DRAFT). If unavailable at pilot, ship the on-screen + JSON report first; PDF fast-follows. Pending C29.
2. **Post-edit re-check** — whether the report live-re-evaluates `status` as the user edits the generated building (over the C52 substrate) or only on demand is open (ties C58 §10.4). Recommendation: on-demand for v1.
3. **Multi-zone parcels** — a parcel spanning two zones needs either the dominant zone or a split envelope. Recommendation: dominant-zone v1 + a caveat; split-envelope deferred. Pending C58 engine.
4. **Shareable compliance report** — whether the report is a shareable artefact (link/PDF for a client) with its own PII + provenance gating (C22/C08) is a product decision. Pending.

---

## §10 — Cross-references

- [C58 Zoning Rules & Buildable Envelope](../../02-decisions/contracts/C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md) — the source of the envelope + derivation trace this SPEC renders (§1.3/§1.4 the binding honesty rules).
- [C57 Parcel Data Layer](../../02-decisions/contracts/C57-PARCEL-DATA-LAYER.md) — parcel provenance/attribution in the header.
- [C19 Site Model & Parcel](../../02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md) — the zoning fields + §1.6 footprint-in-envelope lint the `status` reflects.
- [C23 Provenance & AI Audit](../../02-decisions/contracts/C23-PROVENANCE-AND-AI-AUDIT.md) · [C22 Privacy & PII Tier](../../02-decisions/contracts/C22-PRIVACY-AND-PII-TIER.md) (address gating) · [C29 PDF Vector Export](../../02-decisions/contracts/C29-PDF-VECTOR-EXPORT.md) (export backend) · [C04 Rendering](../../02-decisions/contracts/C04-RENDERING-AND-SCHEDULING.md) (3D volume, P2 safe).
- [ADR-0269](../../02-decisions/adrs/ADR-0269-compliance-authoring-parcel-zoning-envelope-strategy.md) — the strategy.
- [SPEC-PARCEL-SELECTION](./SPEC-PARCEL-SELECTION.md) (proposed) · [SPEC-FORMA-SITE-VIEW](./SPEC-FORMA-SITE-VIEW.md).
- External: [ARCHISTAR-EUROPE-COMPETITIVE-GAP-AUDIT-2026-07-17.md](../../04-reference/ARCHISTAR-EUROPE-COMPETITIVE-GAP-AUDIT-2026-07-17.md) (G-ENG-4), [PARCEL-ZONING-FEATURE-SCOPING.md](../../04-reference/PARCEL-ZONING-FEATURE-SCOPING.md) §8.
