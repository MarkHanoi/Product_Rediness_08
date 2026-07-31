// BERLIN-RULEPACK.design.ts
//
// DESIGN SKELETON — proposed rulepack shape; types unverified against the real @pryzm
// rulepack interface; wiring = future CODE work (see BERLIN-COMPLETION-PLAN.md).
// No guessed values; no BauNVO §17 substitution; no neighbourhood inference.
//
// ⚠ NOT wired into production `packages/site-parcel-data/src/rulepacks/`. The imported types
// (RulePack / EnvelopeRule / LegalCitation from "../../types") are the FOUNDER'S PROPOSED shape,
// NOT verified against PRYZM's real RulePack interface. This file is a reference artifact only.

import type { RulePack, EnvelopeRule, LegalCitation } from "../../types";

export const berlinRulePack: RulePack = {
  id: "de-be-berlin",

  legalFramework: {
    federal: ["BauGB", "BauNVO"],
    state: ["BauO Bln"], // Berliner Bauordnung — Abstandsflächen §6 (multiplier PROBE-REQUIRED)
  },

  // Regime classifier runs first; only §30 permits numeric extraction.
  regimes: [
    { id: "bplan-30", basis: "BauGB §30", numericExtractionAllowed: true },
    { id: "unplanned-34", basis: "BauGB §34", numericExtractionAllowed: false, output: "refusal" },
    { id: "outlying-35", basis: "BauGB §35", numericExtractionAllowed: false, output: "refusal" },
    {
      id: "berlin-baunutzungsplan",
      basis: "Baunutzungsplan 1958/1960 (§173(3) BBauG)",
      numericExtractionAllowed: "conditional",
      confidenceCap: "corroborated", // judicial funktionslos / voidance risk — never `verified`
    },
  ],

  // Every extractor demands a citation — no citation, no value.
  extractors: [
    { field: "zone", requiredCitation: true },
    { field: "GRZ", requiredCitation: true },
    { field: "GFZ", requiredCitation: true },
    { field: "floors", requiredCitation: true }, // Vollgeschosse
    { field: "height", requiredCitation: true },
  ],

  // Envelope rules only fire on verified-primary values.
  envelopeRules: [
    { from: "GRZ", to: "coverage", confidence: "verified-primary" } as EnvelopeRule,
    { from: "GFZ", to: "floor-area", confidence: "verified-primary" } as EnvelopeRule,
    { from: "height", to: "height", confidence: "verified-primary" } as EnvelopeRule,
    { from: "floors", to: "floors", confidence: "verified-primary" } as EnvelopeRule,
  ],

  provenance: {
    // A value is admissible only with the full evidence chain.
    minimumEvidence: ["official PDF", "Festsetzung number", "page"] as LegalCitation[keyof LegalCitation][],
    rejectedSources: [
      "BauNVO §17 (orientation ceiling — never a parcel rule)",
      "neighbouring parcels",
      "existing-building-height (LoD2 / ALKIS Gebäude)",
    ],
  },
};
