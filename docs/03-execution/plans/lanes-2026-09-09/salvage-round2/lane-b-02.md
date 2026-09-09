{
  "defectId": "massing-blocked-by-envelope-refusal",
  "rootCauseFound": true,
  "rootCause": "The legal determination and the massing affordance are coupled in ONE function. refreshEnvelopePanel (GISAreaLayout.ts) has three arms - absence, refusal, full determination - and the massing-options fold is rendered and wired in the FULL-DETERMINATION ARM ONLY (:5846 render, :5863 wire). The founder's Barcelona clau-22@ parcel produces legallyGrounded:true (esBarcelonaZoneClassification.ts:920), which siteDispatch.ts:7833 maps to status 'not-applicable' with a refusal, so refreshEnvelopePanel takes the refusal arm at :5179 and returns at :5362 - before the fold. That fold is the ONLY consumer of buildAuthoredMassingOptionHtml (one call site, envelopeCardSections.ts:582), i.e. the \"Create it myself\" button whose own doc reads \"Present on every arm - the tool is never gated\" (massingAuthoredOptionSection.ts:43). An explicitly un-gated authoring route therefore sits inside a gated container. On that same arm two more affordances are withheld: the study-height entry (:5241, (isAbsent || isGap) ? ... : '' - both false for a legally-grounded refusal) and the manual-zone button. Separately, and genuinely in code rather than in chrome, enumerateMassingOptions hard-refuses without a permitted ring (massingOptionModel.ts:404-414), fed permittedRing: env?.insetPolygon ?? [] at GISAreaLayout.ts:4013 - so the generated I/L/U shapes and coverage plates cannot be produced at all. Finally designStageModel.ts:124 states the coupling as doctrine (\"PRYZM has not resolved a buildable envelope ... so there is nothing to design inside. Until it does, anything drawn here would be unchecked against the ordinance\") while :142 reaches the 'massing' stage only via hasResolvedEnvelope || hasMassingProposal; on the refusal arm GISAreaLayout.ts:5121 computes hasMassingProposal from resolveLiveTargetFootprintProposal(null), which WITHDRAWS the plate, and an authored level envelope is not an input at all. The underlying authoring pipeline is NOT coupled: window.pryzmOpenSiteEnvelopeTool is explicitly un-gated (GISAreaLayout.ts:7208), both draw surfaces refuse only on a missing site-frame origin (siteEnvelopeDrawCesium.ts:335, siteEnvelopeDrawMap2D.ts:120), the drawn ring outranks every solved rung (parcelLawEnvelopeAuthoring.ts:571), buildEnvelopeAuthoringPlan takes no envelope input, and both site views rasterise authored prisms independently of the buildable envelope (CesiumViewport.ts:8821, SiteBoundaryMap2D.ts:2223). So the coupling is: the ROUTES to a capability that already works are deleted along with the legal answer, plus one real enumerator refusal.",
  "evidence": [
    {
      "file": "apps/editor/src/ui/layout/GISAreaLayout.ts",
      "line": 5863,
      "quote": "// §RESI-ORCH-MASSING-OPTIONS — generate / pick / hide. Full-determination arm only: every\n// option is a fraction of a PERMITTED footprint, and a refusal card has none.\nwireMassingOptions(panel);",
      "why": "The coupling stated in the code's own words. This is the ONLY wire site for the massing fold, and it is unreachable on the refusal and absence arms. The comment's premise ('every option is a fraction of a PERMITTED footprint') is true of the GENERATED options but false of the 'Create it myself' card the same fold carries."
    },
    {
      "file": "apps/editor/src/ui/layout/GISAreaLayout.ts",
      "line": 5179,
      "quote": "if ((env.status === 'not-applicable' || env.status === 'none') && env.refusal) {",
      "why": "The refusal arm the founder's parcel lands on. Its innerHTML (:5329-5346) contains only designed-vs-permitted, how-measured and intended-area; it returns at :5362, so the massing fold at :5846 and its wire at :5863 are never reached."
    },
    {
      "file": "apps/editor/src/ui/site/massingAuthoredOptionSection.ts",
      "line": 43,
      "quote": "/** The button that opens the site envelope tool. Present on every arm — the tool is never gated. */\nexport const MASSING_AUTHOR_BTN_TESTID = 'envelope-massing-author-btn';",
      "why": "The authored-massing button declares itself un-gated, and buildAuthoredMassingOptionHtml has exactly ONE call site (envelopeCardSections.ts:582) inside buildMassingOptionsFold. The claim is honoured within the fold and defeated by the fold's own gating - which is why the defect is invisible to the module's unit tests."
    },
    {
      "file": "apps/editor/src/ui/site/massingOptionModel.ts",
      "line": 404,
      "quote": "if (inputs.permittedRing.length < 3 || !(permitted > 0)) {\n    span.setAttribute('pryzm.massing.refusal', 'no-permitted-footprint');",
      "why": "The one genuine CODE block (as opposed to a hidden affordance). Fed by GISAreaLayout.ts:4013 'permittedRing: env?.insetPolygon ?? []', so a refused envelope makes the shape and plate enumeration impossible, not merely unreachable."
    },
    {
      "file": "apps/editor/src/ui/layout/GISAreaLayout.ts",
      "line": 5241,
      "quote": "const safeStudyHeightEntry = (isAbsent || isGap)\n    ? buildStudyHeightEntryHtml(savedStudyHeight)\n    : '';",
      "why": "On a legallyGrounded refusal isTransient/isAbsent/isGap are ALL false, so even the type-a-height study route is withheld. The comment at :5235-5238 gives the reason explicitly - 'offering a massing input there would misleadingly imply buildability where the ordinance says there is none' - which is precisely the inference the founder is overruling."
    },
    {
      "file": "docs/02-decisions/contracts/C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md",
      "line": 866,
      "quote": "**A parcel whose envelope is refused — correctly, with citations, because the jurisdiction's rules are unknown or the data is absent — is a parcel PRYZM has answered honestly.** Gating the rest of the process on that refusal converts C58's most carefully-built honest answer into a dead end",
      "why": "Answers (c). C58 §1.20 clause 2 already forbids exactly this, and §1.19 clause 3 already supplies the safe carrier for authored massing (confidence:'authored', no ordinanceRef, no DerivationTrace). The founder is reporting a contract violation, not requesting a contract change."
    },
    {
      "file": "apps/editor/src/ui/layout/GISAreaLayout.ts",
      "line": 7208,
      "quote": "* ⚠ NOT GATED ON AN ENVELOPE EXISTING (C58 §1.20 clause 1) — the panel is exactly where a user\n * with no solved envelope is told what is missing and what would supply it.\n */\nwindow.pryzmOpenSiteEnvelopeTool = () => {",
      "why": "Answers (b): the authoring tool itself is already decoupled and reachable via gisActionRegistry row 'site.create-envelope' (:489) rendered by renderGisActions in the Project Browser GIS tab (ProjectBrowserPanel.ts:989). The capability exists; the envelope card deletes its own route to it."
    },
    {
      "file": "apps/editor/src/ui/analysis/parcelLawEnvelopeAuthoring.ts",
      "line": 571,
      "quote": "if (drawn !== null && drawn.ring.length >= 3) {",
      "why": "The ring ladder is drawn -> plate -> permitted -> study -> none, and the DRAWN rung ranks first with no envelope precondition. Proves a user who draws a perimeter can author an envelope on a parcel the law refuses - so the authoring half of the founder's ask already ships, and the same channel (getDrawnEnvelopeFootprint) can feed the option enumerator."
    },
    {
      "file": "apps/editor/src/ui/site/designStageModel.ts",
      "line": 124,
      "quote": "const NO_ENVELOPE =\n    'PRYZM has not resolved a buildable envelope for this parcel, so there is nothing to design '\n    + 'inside. Until it does, anything drawn here would be unchecked against the ordinance.';",
      "why": "The coupling written down as a rule: it treats 'unchecked against the ordinance' as a reason design is unavailable. Combined with :142 (reached('massing') = hasResolvedEnvelope || hasMassingProposal) and GISAreaLayout.ts:5121 (hasMassingProposal computed via resolveLiveTargetFootprintProposal(null), which withdraws the plate), an authored level envelope never reaches the massing stage."
    },
    {
      "file": "apps/editor/src/ui/geospatial/CesiumViewport.ts",
      "line": 8821,
      "quote": "private renderSpaceEnvelopes(): void {\n    const viewer = this.viewer;\n    if (!viewer) return;\n    this.clearSpaceEnvelopes();\n\n    const store = this.runtime?.stores?.spaceEnvelope;",
      "why": "Rules out the rival that the block is in the 3D render. Authored massing has its own rasteriser reading runtime.stores.spaceEnvelope, requiring only a site-frame origin - never the BuildableEnvelope. Same for the 2D map (SiteBoundaryMap2D.ts:2223). resolveFormaEnvelope returning null (GISAreaLayout.ts:3428) suppresses only the LEGAL envelope solid."
    },
    {
      "file": "apps/editor/src/ui/site/envelopeCardSections.ts",
      "line": 598,
      "quote": "if (!set.ok) {\n    span.setAttribute('pryzm.massing.foldArm', 'refused');\n    return fold(\n        MASSING_OPTIONS_SECTION_TESTID,\n        'refused',\n        'Massing options — unavailable',",
      "why": "A second instance of the same coupling one level down: the no-permitted-footprint arm drops authoredCard (built at :582 and used on the idle and computed arms), so even if the fold were rendered on the refusal arm, pressing Generate would delete the un-gated authoring route."
    }
  ],
  "proposedFix": "Four changes, ordered smallest-first. None weakens a refusal; each removes a coupling, and the legal machinery (barcelona22ArrobaDerivedPlanRefusal, ENVELOPE-ZERO-INSET-REFUSAL at siteDispatch.ts:956, resolveRenderableBuildableEnvelope's null return, resolveBrutAllowance's 'no-permitted-footprint', and the confidence:'authored' rule) is untouched.\n\n(1) RENDER AND WIRE THE MASSING FOLD ON THE TWO NON-DETERMINATION ARMS. In renderEnvelopeAbsencePanel (GISAreaLayout.ts:4831-4938) and the refusal arm (:5179-5362), add the fold to the innerHTML and call wireMassingOptions(panel). Pass {kind:'idle'} - the point is the \"Create it myself\" card, which is already declared un-gated. This alone restores the founder's route on the surface where he hit the wall and changes no sentence about the law. It is also the change C58 §1.20 clause 1 literally asks for.\n\n(2) STOP buildMassingOptionsFold DROPPING THE AUTHORED CARD ON ITS REFUSED ARM (envelopeCardSections.ts:598-608). Prepend authoredCard, exactly as the idle and computed arms do, so \"PRYZM has not solved a buildable footprint\" and \"here is how you draw your own\" appear together rather than the first replacing the second.\n\n(3) GIVE enumerateMassingOptions A SECOND, EXPLICITLY-LABELLED RING SOURCE - do NOT relax the guard at massingOptionModel.ts:404. Add a discriminated field (e.g. ringBasis: 'permitted' | 'authored-drawn') to MassingOptionInputs, and at GISAreaLayout.ts:4009-4020 fall back to getDrawnEnvelopeFootprint() (drawnEnvelopeFootprintState.ts:59) when env?.insetPolygon is absent, passing permittedGfaM2/maxFloors/maxHeightM as null. Every ordinance-derived field on MassingOption is already `number | null` and the model's own rule at :275-281 is \"NEVER 0 as a stand-in for unknown\", so the options render as pure geometry with the law rows blank - literally \"massing enabled, feedback missing\". Swap MASSING_FAMILIES_NOT_YET_SOLVED for a caveat saying the outlines are fitted inside the perimeter the USER drew and that PRYZM is checking nothing against the ordinance here. The drawn ring is chosen deliberately over the parcel boundary: it is unambiguously the user's own gesture, so it makes no claim PRYZM has to stand behind, and it reuses the existing channel that resolveFootprintSource already ranks first (parcelLawEnvelopeAuthoring.ts:571). Auto-fitting shapes inside the PARCEL boundary would be PRYZM choosing a ring, which is the ENVELOPE-ZERO-INSET-REFUSAL shape - put that to the founder rather than shipping it.\n\n(4) DECOUPLE THE DESIGN-STAGE STRIP. Add hasAuthoredMassing to DesignStageInputs, fed from readLevelEnvelopes (both arms already read it - GISAreaLayout.ts:5820), include it in reached('massing') at designStageModel.ts:142, and rewrite NO_ENVELOPE at :124 so it says the ordinance CHECK is unavailable, not that there is nothing to design. Current wording is the coupling as doctrine.\n\nOPEN FOR THE FOUNDER (do not decide unilaterally): whether the study-height entry at GISAreaLayout.ts:5241 should also appear on the base \"no envelope applies\" card. The comment at :5235-5238 argues it would imply buildability where the ordinance says there is none; his ruling arguably overrides that, but it is the one item where the fix touches a statement about the law rather than an affordance.",
  "confidence": "high",
  "rivalHypothesesRuledOut": [
    "RIVAL 1 - 'The block is the 3D render: resolveFormaEnvelope returns null so nothing draws.' RULED OUT. That function (GISAreaLayout.ts:3375-3450) resolves the LEGAL envelope solid only. Authored massing has two independent rasterisers - CesiumViewport.renderSpaceEnvelopes (:8821) and SiteBoundaryMap2D SPACE-ENVELOPE-ON-2D-MAP (:2223) - which read runtime.stores.spaceEnvelope and require only a site-frame origin, never a BuildableEnvelope. The 2026-09-07 PM handover records this proven live ('drew 7/7 authored envelope(s)'). A drawn envelope renders on both site views with the legal envelope refused.",
    "RIVAL 2 - 'Massing is wholly blocked; this needs a large build.' RULED OUT. window.pryzmOpenSiteEnvelopeTool carries an explicit NOT-GATED note (GISAreaLayout.ts:7208); both draw surfaces' cannotArmReason() consults only the site-frame origin (siteEnvelopeDrawCesium.ts:335-342, siteEnvelopeDrawMap2D.ts:120-130); siteEnvelopeDrawArming.ts contains zero envelope reads; buildEnvelopeAuthoringPlan has no envelope parameter and its header (envelopeAuthoringPlan.ts:52-58) states 'AN UNKNOWN ORDINANCE DOES NOT BLOCK AUTHORING'; and parcelLawTab.ts:1155-1158 appends the authoring slot unconditionally. The pipeline exists end-to-end.",
    "RIVAL 3 - 'It is purely a UI affordance gap; no code change needed.' RULED OUT. enumerateMassingOptions genuinely refuses at massingOptionModel.ts:404-414, so the generated I/L/U shapes and coverage plates cannot be produced at all without a ring. That is a code change, not a hidden button. The honest verdict is BOTH: three affordance gates plus one real enumerator refusal.",
    "RIVAL 4 - 'ENVELOPE-ZERO-INSET-REFUSAL (siteDispatch.ts:923-960) is the blocker to remove.' RULED OUT AS THE TARGET. It returns null only from resolveRenderableBuildableEnvelope, which feeds the LEGAL envelope render path; it is not on any authoring path. Its argument (drawing the parcel boundary as a buildable envelope asserts 'you may build to the parcel edge' with no evidence) is sound and survives every change proposed - which is why fix (3) uses the user's DRAWN ring rather than the parcel boundary.",
    "RIVAL 5 - 'The founder means the solved envelope volume should be drawn anyway.' COULD NOT BE FULLY RULED OUT without asking him, but it is the weaker reading: a solved envelope BY DEFINITION requires the information he says may be missing, and his own clause ('in some instances we would not be able to check against the law to provide feedback') separates the drawing from the checking. C58 §1.19's founder quote ('the capacity to DESIGN, CREATE, EDIT the buildable envelope on 2D site map view or 3D site view') corroborates the authoring reading. If he did mean the solved volume, the correct answer is that the refusal is right and must stand."
  ],
  "whatWouldFalsifyThis": "Open the founder's Barcelona clau-22@ project on the live build, land on the \"No envelope applies\" card, and query the DOM: `document.querySelector('[data-testid=\"envelope-massing-author-btn\"]')` and `[data-testid=\"envelope-massing-options\"]`. My diagnosis predicts BOTH return null on that arm and both are non-null on a parcel with a solved determination. If either is present on the refusal card, the fold is reaching that arm by some path I did not find and gates (1)/(2) are wrong. Symmetrically, if he can already generate massing shapes on that parcel, then massingOptionModel.ts:404 is being fed a ring from a call site other than GISAreaLayout.ts:4013 and gate (4) is wrong. A weaker but faster falsifier: if `window.pryzmOpenSiteEnvelopeTool()` typed into the console on that parcel does NOT open a working draw-and-create panel, then the authoring pipeline is coupled somewhere I did not read and my \"(b) affordance, not capability\" verdict collapses.",
  "filesToChange": [
    "c:/Users/LENOVO/OneDrive/Desktop/PRYZM/Product_Rediness_08/apps/editor/src/ui/layout/GISAreaLayout.ts",
    "c:/Users/LENOVO/OneDrive/Desktop/PRYZM/Product_Rediness_08/apps/editor/src/ui/site/envelopeCardSections.ts",
    "c:/Users/LENOVO/OneDrive/Desktop/PRYZM/Product_Rediness_08/apps/editor/src/ui/site/massingOptionModel.ts",
    "c:/Users/LENOVO/OneDrive/Desktop/PRYZM/Product_Rediness_08/apps/editor/src/ui/site/designStageModel.ts"
  ]
}