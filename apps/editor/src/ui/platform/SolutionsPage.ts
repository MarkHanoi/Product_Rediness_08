/**
 * SolutionsPage — Full-screen content pages for the Solutions nav section.
 *
 * Contract compliance:
 *   §05 §5   — CSS in AppTheme.ts (lp-sol- prefix)
 *   §05 §7.6 — No independent <style> injection; uses injectAppTheme()
 *   §06      — Zero BIM engine interaction; purely presentational
 *   §06 §10  — No imports from src/core/, src/commands/, src/elements/, src/ai/
 *
 * Sub-component of LandingPage (via SolutionsDropdown).
 * Class prefix: lp-sol-
 */

export type SolutionPageKey =
    | 'solo-architects'
    | 'arch-studios'
    | 'established-practices'
    | 'bim-managers'
    | 'interior-designers'
    | 'structural-engineers'
    | 'students'
    | 'concept-design'
    | 'ifc-export'
    | 'ai-modelling'
    | 'floor-plan'
    | 'design-handoff'
    | 'code-compliance'
    | 'bespoke';

interface SolutionPageDef {
    title: string;
    tagline: string;
    html: () => string;
}

// ── Shared helpers ─────────────────────────────────────────────────────────

function featureList(heading: string, items: string[]): string {
    return `
        <div class="lp-sol-features">
            <h3 class="lp-sol-features-title">${heading}</h3>
            <ul class="lp-sol-feature-list">
                ${items.map(i => `<li>${i}</li>`).join('')}
            </ul>
        </div>
    `;
}

function para(text: string): string {
    return `<p class="lp-sol-p">${text}</p>`;
}

function sectionTitle(text: string): string {
    return `<h2 class="lp-sol-section-title">${text}</h2>`;
}

function callout(text: string): string {
    return `<div class="lp-sol-callout">${text}</div>`;
}

// ── BY ROLE content ────────────────────────────────────────────────────────

function soloArchitectsHtml(): string {
    return `
        ${para('You don\'t need a seat licence for a team of 25. You need tools that let you move fast, think spatially, and hand off IFC files that land cleanly in any platform your client or engineer is using.')}
        ${para('PRYZM\'s Architect plan is built for exactly this. One seat. Full access to every modelling tool — walls, slabs, beams, stairs, roofs, curtain walls. IFC2x3 and IFC4 export compatible with Revit, ArchiCAD, BIMcollab, and Solibri. PDF and GLB export for clients who don\'t open IFC files.')}
        ${para('The AI layer is where solo practice becomes genuinely different. Upload a sketch or a scanned floor plan and watch the AI extract walls, doors, and windows into a 3D model. Ask the Design Advisor to count elements, flag orphaned doors, identify missing IFC metadata, or suggest a batch dimension change — all in plain English. Proposals appear in the AI Actions panel for your review before anything changes in the model.')}
        ${para('Version history saves named snapshots at every milestone. You can roll back to Scheme A in seconds if the client changes their mind in the review meeting.')}
        ${featureList('What you get on the Architect plan', [
            'Unlimited projects',
            'Full modelling toolkit — walls, slabs, beams, stairs, roofs, curtain walls',
            'IFC2x3 and IFC4 export',
            'GLB, GLTF, and PDF export',
            'AI Design Advisor (200 actions/month)',
            'Floor Plan AI — PDF to 3D model',
            'AI Element Creator',
            'Wardrobe Factory',
            'Geospatial / GIS view',
            'Version history',
        ])}
    `;
}

function archStudiosHtml(): string {
    return `
        ${para('Small practices run on trust between the people in the room. PRYZM\'s Studio plan extends that trust to the model — everyone on your team sees changes as they happen, no file ping-pong, no "which version is current" confusion.')}
        ${para('Up to 8 seats on a single shared workspace. Real-time collaboration means your team member adding a curtain wall on level 3 is visible to everyone simultaneously. The model is always live, always the same for all of you.')}
        ${para('The Rule Engine runs across the whole model and flags coordination issues before they become site problems — unsupported beams, accessibility violations, elements missing IFC classification. One person catches it; everyone sees the flag.')}
        ${para('When it\'s time to hand off, IFC export goes to your structural engineer, your services consultant, or your client\'s BIMcollab model. PDF exports go to planning. GLB files go to the client presentation.')}
        ${featureList('What you get on the Studio plan', [
            'Everything in the Architect plan',
            'Up to 8 seats with real-time collaboration',
            'Shared project workspace',
            'Team version history',
        ])}
    `;
}

function establishedPracticesHtml(): string {
    return `
        ${para('At 25 people, the risks change. You need SSO so your IT team controls access. You need API access so PRYZM integrates with your project management tools. You need reliable IFC coordination across multiple active projects, and you need a platform that doesn\'t slow down when your team is all working at once.')}
        ${para('The Firm plan gives you up to 25 seats, SSO via your existing identity provider, and full API access. PRYZM\'s API lets you pull model data, trigger exports, and pipe information into your wider practice management systems.')}
        ${para('For firms that need more than 25 seats, or who want PRYZM deployed under their own brand on their own infrastructure, the Enterprise plan and bespoke deployment options are available.')}
        ${featureList('What you get on the Firm plan', [
            'Everything in the Studio plan',
            'Up to 25 seats',
            'Single Sign-On (SSO)',
            'API access',
            'Priority support',
        ])}
    `;
}

function bimManagersHtml(): string {
    return `
        ${para('BIM management is about maintaining standards across everyone who touches the model. PRYZM gives you the tools to set those standards and then verify them automatically.')}
        ${para('The Rule Engine runs continuously and flags elements that violate the rules you care about — accessibility minimums, structural support requirements, missing IFC property sets. Every violation is logged with an element ID and a plain-English explanation. Run "explain violation [ID]" in the AI chat and get the full rationale, which regulation it touches, and what a resolution looks like.')}
        ${para('The IFC export layer is built for coordination workflows. IFC2x3 and IFC4 export clean, schema-compliant files that land correctly in BIMcollab, Solibri, Navisworks, and Tekla. Elements carry the right IfcWall, IfcSlab, IfcDoor classifications and standard property sets (Pset_WallCommon, etc.) automatically.')}
        ${para('The AI can audit the model on demand — "find elements missing IFC metadata", "which doors are narrower than 800mm", "how many walls have no fire rating" — and generate proposals to fix issues in batch, with your approval before anything changes.')}
        ${featureList('Key capabilities for BIM Managers', [
            'Continuous Rule Engine — accessibility, structural, IFC compliance',
            'AI model audit in plain English',
            'IFC2x3 and IFC4 export with correct property sets',
            'Version history — named snapshots, full rollback',
            'API access (Firm plan) for integration with coordination platforms',
            'SSO (Firm plan) for access control',
        ])}
    `;
}

function interiorDesignersHtml(): string {
    return `
        ${para('Interior design in a BIM environment has historically meant fighting with tools built for structural walls and IFC metadata. PRYZM\'s AI tools are built differently — they\'re designed for the kind of decisions you actually make.')}
        ${para('The Wardrobe Factory lets you describe a storage configuration in plain language — "floor-to-ceiling wardrobe, 2400mm wide, three doors, centre mirror panel, internal pull-out drawers" — and get a fully parametric 3D element placed in the model. No manual part-by-part assembly.')}
        ${para('The AI Element Creator generates 3D furniture and fitting elements from a photo or a written description. Describe a piece, get a model, place it in context. Review proposals before they appear in the model.')}
        ${para('Every element placed by the AI or manually carries the correct semantic data — material, dimensions, IFC classification. The model stays coherent for coordination, even when the majority of your work is FF&E and fit-out.')}
        ${featureList('What interior designers use most', [
            'Wardrobe Factory — natural language to parametric storage elements',
            'AI Element Creator — photo or description to 3D element',
            'Material and finish properties on every element',
            'PDF and GLB export for client presentations',
            'IFC export compatible with your architect\'s model',
        ])}
    `;
}

function structuralEngineersHtml(): string {
    return `
        ${para('Structural engineers live downstream of architectural decisions. PRYZM gives you the ability to read the architectural model, flag coordination issues early, and export to the formats your own software understands.')}
        ${para('Beams, slabs, columns, and load-bearing walls are first-class elements in PRYZM\'s model — not geometry approximations. They carry correct IFC classifications (IfcBeam, IfcSlab, IfcColumn, IfcWall with LoadBearing=true) and structural properties that survive the IFC round-trip into Tekla Structures and Navisworks.')}
        ${para('The Rule Engine flags structurally significant issues automatically — beams with no supporting elements, slabs with unresolved spans, walls that are load-bearing but carry no structural property. These flags are visible to the whole team and logged with element IDs for immediate reference.')}
        ${para('IFC4 export gives you the richest property sets. IFC2x3 export covers legacy workflows. Both formats are tested against Tekla, Navisworks, BIMcollab, and Solibri.')}
        ${featureList('For structural coordination', [
            'IFC2x3 and IFC4 export — Tekla, Navisworks, BIMcollab compatible',
            'Correct structural IFC classifications on all elements',
            'Rule Engine flags for structural issues',
            'AI model audit — "which beams have no supports", "find unsupported slabs"',
            'API access for integration with your analysis tools (Firm plan)',
        ])}
    `;
}

function studentsHtml(): string {
    return `
        ${para('Architecture graduates arrive in practice already expected to know BIM. PRYZM\'s free plan gives you a fully functional modelling environment with the AI Design Advisor — no watered-down version, no expiry date.')}
        ${para('Students with a verified institutional email address get full Architect plan features free. That means IFC export, Floor Plan AI, the AI Element Creator, version history, and geospatial view — the complete professional toolkit.')}
        ${para('The AI Design Advisor is particularly useful while learning. Ask it to explain why an element was flagged, what a rule violation means, or how to fix missing IFC metadata. It gives you the rationale, not just the answer. That\'s useful when you\'re building the habits that carry through a whole career.')}
        ${para('When you graduate and start practice, your projects migrate with you. Nothing gets locked or deleted. Upgrade to a paid plan when you\'re ready.')}
        ${featureList('For students and graduates', [
            'Free plan — full modelling, AI Design Advisor, up to 3 projects',
            'Full Architect plan free with verified .edu email — contact hello@pryzm.io',
            'IFC export for academic submissions and collaboration projects',
            'Projects carry forward when you move to a paid plan',
        ])}
    `;
}

// ── BY WORKFLOW content ────────────────────────────────────────────────────

function conceptDesignHtml(): string {
    return `
        ${para('Concept design in PRYZM is fast because the modelling primitives are architectural from the start — you\'re placing walls, not extruding polygons. Set a level, draw walls, add a slab, place a roof. The 3D view updates immediately as you work. Switch between floor plan and perspective whenever you need to check the section.')}
        ${para('Curtain walls take a grid definition and generate the panel layout — vertical mullions, horizontal rails, panel types — from the parameters. No manual geometry. Stairs take a rise and going definition and calculate the flight automatically.')}
        ${para('The AI layer accelerates the earliest phase. Upload a hand sketch or a scanned floor plan and the Floor Plan AI extracts the wall layout into a live model. Describe a spatial configuration to the Design Advisor and it reads the model back to you in plain language — "you have 4 walls on Ground Floor totalling 28 linear metres, no openings."')}
        ${para('Version history lets you branch — save Scheme A, explore Scheme B, come back to Scheme A if the client wants it. Snapshots are named and permanent.')}
        ${featureList('Concept design workflow', [
            'Create project → set levels',
            'Place walls, slabs, roofs with the toolbar',
            'Use Floor Plan AI to import from a sketch or scan',
            'Save named versions at each scheme milestone',
            'Export GLB for web viewer or PDF for client review',
        ])}
    `;
}

function ifcExportHtml(): string {
    const rows = [
        ['Autodesk Revit', 'IFC2x3 and IFC4'],
        ['Graphisoft ArchiCAD', 'IFC2x3 and IFC4'],
        ['BIMcollab', 'IFC2x3 and IFC4'],
        ['Solibri Model Checker', 'IFC2x3 and IFC4'],
        ['Navisworks', 'IFC2x3'],
        ['Tekla Structures', 'IFC2x3'],
    ];

    return `
        ${para('IFC coordination only works when the file comes out correctly the first time. PRYZM\'s IFC export is built around the full schema — not a geometry dump with IFC labels attached, but a proper semantic model where every element carries the right classification, the right property sets, and the right spatial structure.')}
        ${para('Walls export as IfcWall with Pset_WallCommon (fire rating, load bearing, thermal transmittance). Doors export as IfcDoor with Pset_DoorCommon. Slabs, beams, windows, curtain walls — each gets the correct IFC entity type and the properties you set in the model.')}
        ${para('The AI can audit for coordination readiness before you export — "find elements missing IFC metadata", "which elements have no fire rating", "how many walls are unclassified". Fix issues in bulk with AI batch proposals, review in the AI Actions panel, approve, then export.')}
        ${sectionTitle('Tested IFC import targets')}
        <table class="lp-sol-table">
            <thead><tr><th>Platform</th><th>Compatible formats</th></tr></thead>
            <tbody>
                ${rows.map(([p, f]) => `<tr><td>${p}</td><td><code>${f}</code></td></tr>`).join('')}
            </tbody>
        </table>
        ${callout('<strong>IFC export availability:</strong> Architect plan and above.')}
    `;
}

function aiModellingHtml(): string {
    return `
        ${para('PRYZM\'s AI layer is not an autocomplete tool bolted onto a modelling application. It is a full Design Advisor embedded in the model, with read access to every element, every level, every property — and the ability to propose changes at model scale.')}
        ${para('Ask questions in plain language and get answers from the live model data. Ask for batch changes and get a full proposal showing every element that would be affected, the current value, and the proposed new value. Nothing is applied until you click Approve.')}
        ${para('The AI operates on a strict proposal system. Every action it suggests arrives in the AI Actions panel. You review it. You approve it or reject it. Approved changes go through the standard command layer — they are fully undoable with Ctrl+Z, exactly like any manual edit.')}
        ${featureList('What you can do with the AI', [
            'Query: "how many walls are on Ground Floor", "which windows exceed 1.5m width"',
            'Audit: "find elements missing IFC metadata", "explain violation [ID]"',
            'Modify: "make window [ID] 1.2m wide", "set all doors to 2.1m height"',
            'Batch create: "add windows to all walls"',
            'Auto-layout: "centre all windows in their host walls"',
        ])}
    `;
}

function floorPlanHtml(): string {
    return `
        ${para('Every practice has paper. Legacy drawings, planning applications, client-supplied PDFs, scanned hand sketches from site visits. Floor Plan AI converts these into working 3D models — walls detected, doors and windows placed, levels assigned.')}
        ${para('Upload the image. The AI identifies wall segments, opening positions, and approximate dimensions. It generates a set of proposals: one per detected element. Review them in the AI Actions panel — approve the ones that are correct, reject or edit the ones that need adjustment. The model builds up as you approve.')}
        ${para('The result is a live PRYZM model, not a traced background image. Every wall is a real wall element. Every door is a real door with a proper IFC classification. You can modify dimensions, change materials, add levels, and export to IFC — all from a starting point that used to take a day to model manually.')}
        ${featureList('Floor Plan AI workflow', [
            'Open a project and set your levels',
            'Use Floor Plan AI — upload PDF, scan, or photograph',
            'Review the AI\'s detected elements as proposals in the AI Actions panel',
            'Approve correct detections, adjust or reject the rest',
            'Model is live — continue designing from there',
        ])}
        ${callout('<strong>Availability:</strong> Architect plan and above.')}
    `;
}

function designHandoffHtml(): string {
    return `
        ${para('An architect\'s job ends when information leaves the model correctly for everyone who needs it. That means different formats for different people — and PRYZM exports all of them from the same model without a separate conversion step.')}
        ${para('<strong>IFC</strong> for engineers, coordinators, and contractors. IFC2x3 for legacy workflows. IFC4 for richer property sets and modern platforms. Compatible with Revit, ArchiCAD, BIMcollab, Solibri, Navisworks, and Tekla.')}
        ${para('<strong>GLB / GLTF</strong> for web-based viewers, client-facing applications, and augmented reality presentations. GLB files open in any modern browser — clients don\'t need specialist software. Share a link and they can orbit the model on their phone.')}
        ${para('<strong>PDF</strong> for planning submissions, client presentations, and drawn documentation. Generated directly from the model view — always current, never a manually redrawn output.')}
        ${para('Every export comes from the live model. Change a wall thickness, re-export — the IFC, GLB, and PDF all reflect the change immediately. There is no "export model" separate from the "working model."')}
        ${callout('<strong>Export availability:</strong> IFC, GLB, GLTF, and PDF — all available from the Architect plan.')}
    `;
}

function codeComplianceHtml(): string {
    return `
        ${para('Compliance issues are expensive to find late. PRYZM\'s Rule Engine runs continuously on the model and flags elements that break the rules — accessibility requirements, structural support conditions, missing IFC classifications, orphaned elements.')}
        ${para('Every violation is logged with the element ID, the rule it broke, and a plain-English explanation. Ask the AI to explain any flag: "explain violation [ID]" gives you the regulation, the specific failure, and what a resolution looks like.')}
        ${para('The AI can audit for specific conditions on demand. Ask "which doors are narrower than 800mm" and get a list of every non-compliant door in the model. Ask "find walls with no fire rating" and get every wall that is missing that property. Generate a batch proposal to fix them all, review in the AI Actions panel, approve the correct ones.')}
        ${para('Compliance review in PRYZM is not a final check before submission. It runs the whole time you are modelling, so issues are caught at the moment they are created — not when the IFC goes to the engineer and comes back with a coordination clash report.')}
        ${featureList('What the Rule Engine checks', [
            'Accessibility — door widths, corridor clearances',
            'Structural — beams without supporting elements, slabs with unresolved spans',
            'IFC data quality — missing classifications, incomplete property sets',
            'Element integrity — orphaned doors and windows not hosted by a wall',
            'Custom rules — configurable per project on Enterprise plans',
        ])}
    `;
}

function bespokeHtml(): string {
    return `
        ${para('Some organisations don\'t need a SaaS subscription. They need a BIM platform built to their specification, deployed on their infrastructure, carrying their brand — with custom element libraries, their regulatory environment, and their workflows baked in from the start.')}
        ${para('PRYZM\'s bespoke deployment service is for those organisations. We take the platform — the modelling engine, the AI layer, the IFC export stack, the command architecture — and configure it around your requirements. Your element families. Your material libraries. Your IFC schema extensions. Your naming conventions.')}
        ${para('Deployment options include private cloud and on-premise. We handle the discovery, the build, the handover, and ongoing engineering support. The result is a platform that your team owns and operates, not one they subscribe to.')}
        ${featureList('What a bespoke deployment includes', [
            'Discovery and scoping workshop',
            'Custom IFC schema and element classification configuration',
            'Bespoke element family and material libraries',
            'Integration with your existing tools (ERP, Revit, project management)',
            'White-label branding — your name, your visual identity',
            'Private cloud or on-premise deployment',
            'Handover, training, and ongoing engineering support',
        ])}
        ${callout('This is scoped and priced separately from all subscription plans. To start a conversation: <a href="mailto:hello@pryzm.io" class="lp-sol-link">hello@pryzm.io</a> with the subject "Bespoke Build Enquiry".')}
    `;
}

// ── Page definitions ───────────────────────────────────────────────────────

const SOLUTION_PAGES: Record<SolutionPageKey, SolutionPageDef> = {
    'solo-architects':        { title: 'Solo Architects',           tagline: 'BIM that works at your pace, not a 30-person firm\'s.',                              html: soloArchitectsHtml },
    'arch-studios':           { title: 'Architecture Studios',      tagline: 'Give your whole team the same model, the same tools, and the same source of truth.',  html: archStudiosHtml },
    'established-practices':  { title: 'Established Practices',     tagline: 'Enterprise-grade BIM for firms who need control at scale.',                           html: establishedPracticesHtml },
    'bim-managers':           { title: 'BIM Managers',              tagline: 'Compliance, coordination, and data quality — enforced by the model, not a spreadsheet.', html: bimManagersHtml },
    'interior-designers':     { title: 'Interior Designers',        tagline: 'Design the interior at the same resolution as the building.',                         html: interiorDesignersHtml },
    'structural-engineers':   { title: 'Structural Engineers',      tagline: 'Coordinate with the architecture model. Catch issues before they become RFIs.',        html: structuralEngineersHtml },
    'students':               { title: 'Students & Graduates',      tagline: 'Learn on the tools you\'ll actually use. Not a training licence — the real thing.',    html: studentsHtml },
    'concept-design':         { title: 'Concept Design',            tagline: 'Go from brief to 3D model in a single session.',                                       html: conceptDesignHtml },
    'ifc-export':             { title: 'IFC Export & Coordination', tagline: 'Export files that land cleanly in any platform. No manual cleanup.',                   html: ifcExportHtml },
    'ai-modelling':           { title: 'AI-Assisted Modelling',     tagline: 'Talk to your model. Get work done.',                                                   html: aiModellingHtml },
    'floor-plan':             { title: 'Floor Plan Digitisation',   tagline: 'Turn a PDF, a scan, or a photograph into a live BIM model.',                          html: floorPlanHtml },
    'design-handoff':         { title: 'Design Handoff',            tagline: 'Give every stakeholder the format they actually need.',                                html: designHandoffHtml },
    'code-compliance':        { title: 'Code Compliance Review',    tagline: 'Catch violations in the model, not on site.',                                          html: codeComplianceHtml },
    'bespoke':                { title: 'Bespoke Platform Deployment', tagline: 'PRYZM, deployed as your product, under your name.',                                  html: bespokeHtml },
};

// ── SolutionsPage class ────────────────────────────────────────────────────

export class SolutionsPage {
    private el: HTMLElement;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(
        key: SolutionPageKey,
        private container: HTMLElement,
        private onClose: () => void,
        runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null,
    ) {
        this.runtime = runtime;
        this.el = this.build(key);
        this.container.appendChild(this.el);
    }

    private build(key: SolutionPageKey): HTMLElement {
        const def = SOLUTION_PAGES[key];
        const el = document.createElement('div');
        el.className = 'lp-sol-page';

        el.innerHTML = `
            <div class="lp-sol-page-header">
                <button class="lp-sol-page-back" id="lp-sol-page-back">← Back to PRYZM</button>
                <span class="lp-sol-page-header-sep"></span>
                <h1 class="lp-sol-page-title">${def.title}</h1>
            </div>
            <div class="lp-sol-page-body">
                <div class="lp-sol-page-content">
                    <p class="lp-sol-tagline">${def.tagline}</p>
                    <div class="lp-sol-body-content">
                        ${def.html()}
                    </div>
                </div>
            </div>
        `;

        el.querySelector('#lp-sol-page-back')!.addEventListener('click', () => this.destroy());
        return el;
    }

    destroy(): void {
        this.el.remove();
        this.onClose();
    }
}
