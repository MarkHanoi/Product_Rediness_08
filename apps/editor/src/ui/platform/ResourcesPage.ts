/**
 * ResourcesPage — Full-screen content pages for the Resources nav section.
 *
 * Contract compliance:
 *   §05 §5   — CSS in AppTheme.ts (lp-res- prefix)
 *   §05 §7.6 — No independent <style> injection; uses injectAppTheme()
 *   §06      — Zero BIM engine interaction; purely presentational
 *   §06 §10  — No imports from src/core/, src/commands/, src/elements/, src/ai/
 *
 * Sub-component of LandingPage (via ResourcesDropdown).
 * Class prefix: lp-res-
 */

export type ResourcePageKey =
    | 'quick-start'
    | 'faq'
    | 'shortcuts'
    | 'ai-reference'
    | 'ifc-guide'
    | 'ai-workflow';

interface ResourcePageDef {
    title: string;
    html: () => string;
}

// ── Content builders ───────────────────────────────────────────────────────

function quickStartHtml(): string {
    const steps = [
        {
            title: 'Create your account',
            body: 'Click "Get started for free" on the PRYZM homepage. Enter your name and email. No credit card required.',
        },
        {
            title: 'Create your first project',
            body: 'From the Project Hub, click "+ New Project". Give it a name (e.g. "Riverside House") and select a project type. Click "Create Project" to open the workspace.',
        },
        {
            title: 'Set up your levels',
            body: 'Every model starts with levels. Open the Levels panel and create your floor plates — Ground Floor, First Floor, etc. Each level has an elevation offset in metres. Levels are the vertical anchor for all elements.',
        },
        {
            title: 'Place your first wall',
            body: 'Select the Wall tool from the toolbar. Click to set the start point, click again to set the end point. Walls snap to the active level automatically. Hold Shift to constrain to 90° angles.',
        },
        {
            title: 'Add openings',
            body: 'With a wall selected, use the Door or Window tool to place openings. Doors and windows are hosted by a wall — they cannot exist without one. Adjust width, height, sill height, and frame colour from the Properties panel on the right.',
        },
        {
            title: 'Add a slab',
            body: 'Use the Slab tool to create floor plates. Click to define the slab boundary polygon. The slab automatically inherits the elevation of the active level.',
        },
        {
            title: 'Save your first version',
            body: 'Press Ctrl+S (or Cmd+S on Mac) to open the Save Version dialog. Give this version a label like "Scheme A — Ground Floor". Version history lets you restore any saved state at any point.',
        },
        {
            title: 'Export',
            body: 'Go to Export in the toolbar. PRYZM exports IFC (IFC2x3 and IFC4), GLB/GLTF for web viewers, and PDF for client presentations. IFC export is available from the Architect plan.',
        },
    ];

    const stepsHtml = steps.map((s, i) => `
        <div class="lp-res-step">
            <div class="lp-res-step-num">${i + 1}</div>
            <div class="lp-res-step-body">
                <h3 class="lp-res-step-title">${s.title}</h3>
                <p class="lp-res-step-p">${s.body}</p>
            </div>
        </div>
    `).join('');

    return `
        <p class="lp-res-intro">Get your first model built in under 10 minutes.</p>
        <div class="lp-res-steps">${stepsHtml}</div>
    `;
}

function faqHtml(): string {
    const items = [
        {
            q: 'Can I switch plans anytime?',
            a: 'Yes. You can upgrade or downgrade at any time. When upgrading, you get immediate access to all features on the new plan. When downgrading, your current plan runs until the end of the billing period — you won\'t lose access mid-cycle.',
        },
        {
            q: 'What happens to my projects if I downgrade?',
            a: 'Your projects and all your data are always preserved. If you downgrade to the Free plan and have more than 3 projects, your existing projects remain fully accessible. You simply cannot create new ones until you are under the 3-project limit.',
        },
        {
            q: 'How are AI actions counted?',
            a: 'Each call to the Claude API counts as one action. This includes: Design Advisor queries, Floor Plan AI analysis runs, AI Element Creator generations, and Wardrobe Factory calls. If a generation fails validation and retries automatically, the retry also counts. Your monthly usage resets on the first of each billing month.',
        },
        {
            q: 'Is the IFC export compliant with industry standards?',
            a: 'Yes. PRYZM exports IFC2x3 and IFC4 formats. These are fully compatible with Revit, ArchiCAD, BIMcollab, Solibri, and all major BIM coordination platforms. Elements export with correct semantic classifications (IfcWall, IfcSlab, IfcDoor, IfcWindow, IfcBeam, etc.) and carry the properties set in the model.',
        },
        {
            q: 'What modeling elements does PRYZM support?',
            a: 'Walls (with fire rating, thickness, material), slabs, beams, stairs, roofs, doors, windows, curtain walls with custom grid lines and panel types, and AI-generated furniture and fittings. The element list expands with each release.',
        },
        {
            q: 'Do you offer discounts for students or education?',
            a: 'Yes. Architecture and engineering students get full Architect tier features free with a verified .edu email address. Contact hello@pryzm.io with your institutional email for access. Institutional licensing for universities is also available.',
        },
        {
            q: 'Can multiple people work on the same project?',
            a: 'Real-time collaboration is available on the Studio plan (up to 8 seats) and Firm plan (up to 25 seats). Team members see each other\'s cursors and receive model changes in real time via the shared workspace.',
        },
        {
            q: 'What payment methods do you accept?',
            a: 'All major credit and debit cards — Visa, Mastercard, American Express. Annual plans for the Firm and Enterprise tiers can be paid by invoice. Contact hello@pryzm.io to arrange invoice billing.',
        },
        {
            q: 'What is the AI approval workflow?',
            a: 'PRYZM\'s AI never changes your model without your consent. Every AI suggestion arrives as a Proposal in the AI Actions panel. You review the proposed change, see exactly what will be modified, and click Approve or Reject. Nothing is applied until you confirm.',
        },
    ];

    const itemsHtml = items.map(item => `
        <div class="lp-res-faq-item">
            <p class="lp-res-faq-q">${item.q}</p>
            <p class="lp-res-faq-a">${item.a}</p>
        </div>
    `).join('');

    return `
        <p class="lp-res-intro">Everything you need to know about PRYZM plans, features, and workflows.</p>
        <div class="lp-res-faq">${itemsHtml}</div>
    `;
}

function shortcutsHtml(): string {
    return `
        <p class="lp-res-intro">Master PRYZM faster with these keyboard shortcuts.</p>

        <h2 class="lp-res-section-title">General</h2>
        <table class="lp-res-table">
            <thead><tr><th>Action</th><th>Windows / Linux</th><th>Mac</th></tr></thead>
            <tbody>
                <tr><td>Save version</td><td><code>Ctrl+S</code></td><td><code>Cmd+S</code></td></tr>
            </tbody>
        </table>

        <h2 class="lp-res-section-title">Navigation</h2>
        <table class="lp-res-table">
            <thead><tr><th>Action</th><th>Keys</th></tr></thead>
            <tbody>
                <tr><td>Orbit camera</td><td>Middle mouse drag</td></tr>
                <tr><td>Pan camera</td><td>Shift + middle mouse drag</td></tr>
                <tr><td>Zoom</td><td>Scroll wheel</td></tr>
                <tr><td>Reset view</td><td><code>Home</code></td></tr>
            </tbody>
        </table>

        <h2 class="lp-res-section-title">Modeling tools</h2>
        <table class="lp-res-table">
            <thead><tr><th>Action</th><th>Keys</th></tr></thead>
            <tbody>
                <tr><td>Wall tool</td><td><code>W</code></td></tr>
                <tr><td>Select / move</td><td><code>Escape</code></td></tr>
                <tr><td>Constrain to 90°</td><td>Hold <code>Shift</code> while placing</td></tr>
                <tr><td>Delete selected element</td><td><code>Delete</code> or <code>Backspace</code></td></tr>
                <tr><td>Undo</td><td><code>Ctrl+Z</code> / <code>Cmd+Z</code></td></tr>
                <tr><td>Redo</td><td><code>Ctrl+Y</code> / <code>Cmd+Shift+Z</code></td></tr>
            </tbody>
        </table>

        <h2 class="lp-res-section-title">View modes</h2>
        <table class="lp-res-table">
            <thead><tr><th>Action</th><th>Keys</th></tr></thead>
            <tbody>
                <tr><td>Toggle floor plan view</td><td><code>F</code></td></tr>
                <tr><td>Toggle 3D perspective</td><td><code>3</code></td></tr>
                <tr><td>Toggle wireframe</td><td><code>Ctrl+W</code></td></tr>
            </tbody>
        </table>
    `;
}

function aiReferenceHtml(): string {
    const queries = [
        {
            title: 'Get a model summary',
            examples: '"summarize", "summary", "overview", "what is in this model", "model summary"',
            desc: 'Returns a high-level count of all elements by type and level, plus IFC metadata readiness.',
        },
        {
            title: 'Count elements',
            examples: '"how many walls", "count all doors", "number of windows", "how many columns on level 1"',
            desc: 'Returns the count and a list of the specified element type, optionally filtered to a single level.',
        },
        {
            title: 'Spatial queries',
            examples: '"walls on Ground Floor", "how many doors on level 2", "slabs on first floor"',
            desc: 'Lists or counts elements belonging to a specific named level.',
        },
        {
            title: 'Explain a rule violation',
            examples: '"explain violation [ID]", "why was [ID] flagged", "details for [ID]"',
            desc: 'Provides a detailed explanation of why a specific element was flagged by the Rule Engine, including the relevant regulation or standard.',
        },
        {
            title: 'Find elements missing IFC metadata',
            examples: '"elements missing IFC metadata", "find missing IFC", "incomplete IFC"',
            desc: 'Lists all elements that lack required IFC classification properties for export.',
        },
        {
            title: 'Dimensional queries',
            examples: '"which windows exceed 1.5m width", "doors taller than 2100mm", "find orphaned doors"',
            desc: 'Filters elements by dimension thresholds. "Orphaned" means a door or window not currently hosted by any wall.',
        },
    ];

    const actions = [
        {
            title: 'Modify a single element property',
            examples: '"make window [ID] 1.2m wide", "change width of door [ID] to 900mm", "set wall [ID] height to 3.5m"',
            desc: 'Proposes a property change on a specific named element. Replace [ID] with the element ID shown in the Properties panel.',
        },
        {
            title: 'Batch updates — all elements of a type',
            examples: '"make all windows 1.5m wide", "make all doors 2.1m tall", "make all window frames black"',
            desc: 'Proposes the same change across every element of that type in the entire project. You see the full list of affected elements before approving.',
        },
        {
            title: 'Auto-layout',
            examples: '"move all windows to centre", "center all windows"',
            desc: 'Proposes repositioning every window to the mathematical centre of its host wall segment.',
        },
        {
            title: 'Batch creation',
            examples: '"create windows in all walls", "add windows to all walls"',
            desc: 'Proposes adding one window to every wall segment in the project.',
        },
    ];

    const queryItems = queries.map(q => `
        <div class="lp-res-cmd-item">
            <h3 class="lp-res-cmd-title">${q.title}</h3>
            <div class="lp-res-cmd-block"><em>${q.examples}</em></div>
            <p class="lp-res-cmd-desc">${q.desc}</p>
        </div>
    `).join('');

    const actionItems = actions.map(a => `
        <div class="lp-res-cmd-item">
            <h3 class="lp-res-cmd-title">${a.title}</h3>
            <div class="lp-res-cmd-block"><em>${a.examples}</em></div>
            <p class="lp-res-cmd-desc">${a.desc}</p>
        </div>
    `).join('');

    return `
        <p class="lp-res-intro">PRYZM's AI understands natural language typed into the Design Advisor chat. Below are the supported command categories with example phrases.</p>

        <h2 class="lp-res-section-title">Query commands — read the model, no changes made</h2>
        <div class="lp-res-cmd-group">${queryItems}</div>

        <h2 class="lp-res-section-title">Action commands — AI proposes a change, you approve it</h2>
        <div class="lp-res-callout">All actions produce a <strong>Proposal</strong> in the AI Actions panel. The model is not changed until you click Approve.</div>
        <div class="lp-res-cmd-group">${actionItems}</div>

        <div class="lp-res-callout lp-res-callout--violet">
            <strong>Proposals, not actions.</strong> The AI cannot modify your model directly. Every command above produces a structured proposal that appears in the AI Actions panel. You review the target element, the proposed change, and the rationale — then click Approve or Reject. Your model is always under your control.
        </div>
    `;
}

function ifcGuideHtml(): string {
    const platforms = [
        { name: 'Autodesk Revit', ifc2: true, ifc4: true },
        { name: 'Graphisoft ArchiCAD', ifc2: true, ifc4: true },
        { name: 'BIMcollab', ifc2: true, ifc4: true },
        { name: 'Solibri Model Checker', ifc2: true, ifc4: true },
        { name: 'Navisworks', ifc2: true, ifc4: true },
        { name: 'Tekla Structures', ifc2: true, ifc4: false },
        { name: 'Open BIM viewers', ifc2: true, ifc4: true },
    ];

    const elements = [
        { pryzm: 'Wall', ifc: 'IfcWall' },
        { pryzm: 'Slab', ifc: 'IfcSlab' },
        { pryzm: 'Beam', ifc: 'IfcBeam' },
        { pryzm: 'Stair', ifc: 'IfcStair' },
        { pryzm: 'Roof', ifc: 'IfcRoof' },
        { pryzm: 'Door', ifc: 'IfcDoor' },
        { pryzm: 'Window', ifc: 'IfcWindow' },
        { pryzm: 'Curtain wall', ifc: 'IfcCurtainWall' },
        { pryzm: 'Furniture / AI element', ifc: 'IfcFurnishingElement' },
    ];

    const tick = '<span class="lp-res-tick">✓</span>';
    const dash = '<span class="lp-res-dash">—</span>';

    const platformRows = platforms.map(p => `
        <tr>
            <td>${p.name}</td>
            <td>${p.ifc2 ? tick : dash}</td>
            <td>${p.ifc4 ? tick : dash}</td>
        </tr>
    `).join('');

    const elementRows = elements.map(e => `
        <tr><td>${e.pryzm}</td><td><code>${e.ifc}</code></td></tr>
    `).join('');

    return `
        <p class="lp-res-intro">How PRYZM's IFC export works, what it supports, and which platforms it's compatible with.</p>

        <h2 class="lp-res-section-title">What is IFC?</h2>
        <p class="lp-res-p">IFC (Industry Foundation Classes) is the open international standard for exchanging BIM data between software. It allows architects, engineers, and contractors to share models across different platforms without data loss. The standard is maintained by buildingSMART International.</p>

        <h2 class="lp-res-section-title">What PRYZM exports</h2>
        <p class="lp-res-p">PRYZM exports two IFC versions:</p>
        <ul class="lp-res-list">
            <li><strong>IFC2x3</strong> — the most widely supported version, compatible with virtually all BIM platforms and workflows built before 2020.</li>
            <li><strong>IFC4</strong> — the current standard, with richer property sets and improved geometry representation.</li>
        </ul>

        <h2 class="lp-res-section-title">Tested compatible platforms</h2>
        <table class="lp-res-table">
            <thead><tr><th>Platform</th><th>IFC2x3</th><th>IFC4</th></tr></thead>
            <tbody>${platformRows}</tbody>
        </table>

        <h2 class="lp-res-section-title">How elements are classified</h2>
        <table class="lp-res-table">
            <thead><tr><th>PRYZM element</th><th>IFC class</th></tr></thead>
            <tbody>${elementRows}</tbody>
        </table>

        <h2 class="lp-res-section-title">Properties exported per element</h2>
        <p class="lp-res-p">Each element carries the properties set in the PRYZM Properties panel: dimensions (width, height, thickness), fire rating, material, sill height (windows), and all custom fields. These map to standard IFC property sets (Pset_WallCommon, Pset_DoorCommon, etc.) where applicable.</p>

        <div class="lp-res-callout lp-res-callout--violet">
            <strong>IFC export availability.</strong> IFC export is available on the Architect plan and above. Free plan users can model fully but cannot export to IFC. Upgrade from the pricing page or click the locked IFC button in the toolbar.
        </div>
    `;
}

function aiWorkflowHtml(): string {
    const steps = [
        { title: 'You ask', body: 'Type a command in the Design Advisor chat, or use an AI tool (Floor Plan AI, Element Creator, Wardrobe Factory).' },
        { title: 'AI proposes', body: 'The AI generates a structured proposal. Nothing is changed yet.' },
        { title: 'Proposal appears', body: 'The proposal arrives in the AI Actions panel on the right side of the workspace. It shows: the target element, the specific property being changed, the current value, and the proposed new value.' },
        { title: 'You review', body: 'Read the rationale. Inspect the affected element in the 3D view.' },
        { title: 'You decide', body: 'Click Approve to apply the change, or Reject to discard it. Approved changes go through the standard Command system, which means they are fully undoable with Ctrl+Z.' },
    ];

    const stepsHtml = steps.map((s, i) => `
        <div class="lp-res-step">
            <div class="lp-res-step-num">${i + 1}</div>
            <div class="lp-res-step-body">
                <h3 class="lp-res-step-title">${s.title}</h3>
                <p class="lp-res-step-p">${s.body}</p>
            </div>
        </div>
    `).join('');

    return `
        <p class="lp-res-intro">PRYZM's AI never modifies your model without your review. This is a deliberate architectural decision — BIM data feeds downstream into structural calculations, cost estimates, and contractor drawings.</p>

        <h2 class="lp-res-section-title">Why proposals instead of instant changes?</h2>
        <p class="lp-res-p">A single unreviewed change to a wall thickness or fire rating could have real consequences. The approval system gives you full control at every step.</p>

        <h2 class="lp-res-section-title">How the workflow works</h2>
        <div class="lp-res-steps">${stepsHtml}</div>

        <h2 class="lp-res-section-title">What a proposal looks like</h2>
        <p class="lp-res-p">Each proposal shows:</p>
        <ul class="lp-res-list">
            <li>Element type and ID</li>
            <li>Property being changed (e.g. Width, Height, Fire Rating)</li>
            <li>Current value → Proposed value</li>
            <li>AI confidence score</li>
            <li>Rationale from the AI explaining why this change was suggested</li>
        </ul>

        <h2 class="lp-res-section-title">Batch proposals</h2>
        <p class="lp-res-p">When you ask for a batch operation ("make all windows 1.5m wide"), the AI generates one proposal per element. You can approve all, approve individually, or reject all. The count is shown before you commit.</p>

        <h2 class="lp-res-section-title">Undo after approval</h2>
        <p class="lp-res-p">Approved changes use PRYZM's Command system. This means every approved AI action is individually reversible with Ctrl+Z, just like any manual edit. There is no special "undo AI changes" step — it works exactly like the rest of the undo stack.</p>

        <h2 class="lp-res-section-title">The Rule Engine</h2>
        <div class="lp-res-callout lp-res-callout--violet">After proposals are applied, the Rule Engine runs automatically and flags any elements that violate architectural rules (e.g. a beam with no supports, a door that is too narrow for accessibility standards). These violations appear in the AI Actions panel as separate items for your review.</div>
    `;
}

// ── Page definitions ───────────────────────────────────────────────────────

const PAGES: Record<ResourcePageKey, ResourcePageDef> = {
    'quick-start': { title: 'Quick Start Guide', html: quickStartHtml },
    'faq':         { title: 'Frequently Asked Questions', html: faqHtml },
    'shortcuts':   { title: 'Keyboard Shortcuts', html: shortcutsHtml },
    'ai-reference':{ title: 'AI Command Reference', html: aiReferenceHtml },
    'ifc-guide':   { title: 'IFC Compatibility Guide', html: ifcGuideHtml },
    'ai-workflow': { title: 'AI Approval Workflow', html: aiWorkflowHtml },
};

// ── ResourcesPage class ────────────────────────────────────────────────────

export class ResourcesPage {
    private el: HTMLElement;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(
        key: ResourcePageKey,
        private container: HTMLElement,
        private onClose: () => void,
        runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null,
    ) {
        this.runtime = runtime;
        this.el = this.build(key);
        this.container.appendChild(this.el);
    }

    private build(key: ResourcePageKey): HTMLElement {
        const def = PAGES[key];
        const el = document.createElement('div');
        el.className = 'lp-res-page';

        el.innerHTML = `
            <div class="lp-res-page-header">
                <button class="lp-res-page-back" id="lp-res-page-back">← Back to PRYZM</button>
                <span class="lp-res-page-header-sep"></span>
                <h1 class="lp-res-page-title">${def.title}</h1>
            </div>
            <div class="lp-res-page-body">
                <div class="lp-res-page-content">
                    ${def.html()}
                </div>
            </div>
        `;

        el.querySelector('#lp-res-page-back')!.addEventListener('click', () => this.destroy());
        return el;
    }

    destroy(): void {
        this.el.remove();
        this.onClose();
    }
}
